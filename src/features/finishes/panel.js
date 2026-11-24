// Panel wykończeń dla zaznaczonej powierzchni: farba, materiały z biblioteki, własne płytki,
// płytki do wysokości, skróty ("wszystkie ściany", "przywróć domyślne").
//
// Panel NIE trzyma stanu wykończeń – wszystko czyta z wariantu i zapisuje przez app.variant.update().
// Własny stan to tylko rzeczy czysto interfejsowe (otwarta zakładka, kategoria, edytowana część ściany,
// zdjęcie czekające na dodanie). Po każdej zmianie wariantu zawartość jest rysowana od nowa (render).
import { el } from '../../ui/dom.js';
import { PAINT_GROUPS, paintName } from './palette.js';
import { MATERIALS, CATEGORIES, FORMATS, GROUT_COLORS, GROUT_WIDTHS_MM, DEFAULT_SPLIT_MATERIAL, DEFAULT_SPLIT_HEIGHT } from './library.js';
import {
  normalizeFinish, normalizeColor, resolveMaterial, materialParams, materialFits, finishUsesMaterial, finishKey,
  parseCm, formatCm, formatSize, formatNumber, clampSize, tileEstimate, SPLIT_KINDS, SIZE_MIN, SIZE_MAX,
} from './finish.js';
import { fileToDataUrl, nameFromFile, newCustomId } from './upload.js';

const KIND_NAMES = { wall: 'Ściana', floor: 'Podłoga', ceiling: 'Sufit', slope: 'Skos', chimney: 'Komin' };
/** Gdzie panel proponuje płytki do wysokości (cięcie działa też na skosach, ale tam nie ma to praktycznego sensu). */
const SPLIT_UI_KINDS = ['wall', 'chimney'];
/** Grupy powierzchni dla "zastosuj do wszystkich…". */
const GROUPS = [
  { kinds: ['wall', 'chimney'], label: 'Zastosuj do wszystkich ścian pomieszczenia', done: (n) => `Zastosowano do ścian pomieszczenia (${n})` },
  { kinds: ['ceiling', 'slope'], label: 'Zastosuj do sufitu i skosów pomieszczenia', done: (n) => `Zastosowano do sufitu i skosów (${n})` },
];
const QUICK_HEIGHTS_CM = [120, 150, 200];
const LIVE_INTERVAL = 50; // ms – najczęstsze odświeżenie podczas przeciągania w próbniku koloru
const INPUT_RENDER_DELAY = 250; // ms – patrz commitFromInput()

/**
 * @param {import('../../app/app.js').App} app
 * @param {{applier: Object, textures: Object, recent: Object, onClose?: (surfaceId: string) => void}} deps
 */
export function createFinishPanel(app, { applier, textures, recent, onClose }) {
  const root = el('div', { class: 'fin' });
  let token = null; // znacznik "nasz panel jest otwarty"
  let handle = null;
  /** Stan interfejsu (nie sceny). */
  let ui = freshUi(null);
  let quiet = false; // zmiana "na żywo" – nie przebudowuj panelu (zamknęłoby próbnik koloru)
  let renderDelay = 0;
  let renderTimer = 0;
  let liveTimer = 0;
  let livePending = null;

  function freshUi(surfaceId) {
    return { surfaceId, tab: 'paint', category: null, part: 'lower', upload: null, uploadBusy: false, confirmDelete: null };
  }

  // ---------------------------------------------------------------- odczyt stanu z wariantu
  const variant = () => app.variant.get();
  const customs = () => (Array.isArray(variant().customMaterials) ? variant().customMaterials.filter(Boolean) : []); // bez błędnych wpisów (null)
  const surface = () => app.getSurface(ui.surfaceId);
  const defaultColor = (s) => `#${s.defaultMaterial.color.getHexString()}`;
  const defOf = (simple) => (simple && simple.kind === 'material' ? resolveMaterial(simple.id, customs()) : null);

  /** Uporządkowane wykończenie zaznaczonej powierzchni albo null (domyślne). */
  function currentFinish() {
    const s = surface();
    if (!s) return null;
    return normalizeFinish(variant().finishes?.[s.id], { kind: s.kind, customMaterials: customs() });
  }
  /** Edytowane wykończenie proste: cała powierzchnia albo wybrana część podziału. */
  function currentTarget() {
    const f = currentFinish();
    return f && f.kind === 'split' ? f[ui.part] : f;
  }

  // ---------------------------------------------------------------- zapis do wariantu
  function write(mutator, { live = false, delay = 0 } = {}) {
    quiet = live;
    renderDelay = delay;
    try {
      app.variant.update((draft) => {
        draft.finishes ||= {};
        draft.customMaterials ||= [];
        mutator(draft);
      });
    } finally {
      quiet = false;
      renderDelay = 0;
    }
  }

  /** Pełne wykończenie powierzchni po wstawieniu `simple` w edytowane miejsce. */
  function withTarget(simple) {
    const f = currentFinish();
    return f && f.kind === 'split' ? { ...f, [ui.part]: simple } : simple;
  }

  function setFinish(finish, options) {
    const id = ui.surfaceId;
    write((draft) => {
      if (finish) draft.finishes[id] = finish;
      else delete draft.finishes[id];
    }, options);
  }

  function setTarget(simple, options = {}) {
    cancelLive();
    if (!options.live) recent.add(simple); // przed zapisem – odświeżony panel pokaże już nową listę
    setFinish(withTarget(simple), options);
  }

  /** Zmiana opcji wybranego materiału (rozmiar, obrót, fuga…). */
  function patchMaterial(patch, options) {
    const t = currentTarget();
    if (!t || t.kind !== 'material') return;
    const next = { ...t, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    setTarget(next, options);
  }

  // próbnik koloru wysyła zdarzenia przy każdym ruchu palca – scena dostaje je najwyżej co LIVE_INTERVAL
  function liveTarget(simple) {
    livePending = simple;
    if (liveTimer) return;
    liveTimer = setTimeout(() => {
      liveTimer = 0;
      const p = livePending;
      livePending = null;
      if (p && token) setFinish(withTarget(p), { live: true });
    }, LIVE_INTERVAL);
  }
  function cancelLive() {
    clearTimeout(liveTimer);
    liveTimer = 0;
    livePending = null;
  }

  // ---------------------------------------------------------------- drobne klocki interfejsu
  const fill = (node, children) => node.replaceChildren(...children.filter(Boolean));
  const label = (text) => el('div', { class: 'fin-label' }, text);
  const note = (text) => el('p', { class: 'fin-note' }, text);

  function seg(options, active, onPick, ariaLabel) {
    return el('div', { class: 'seg fin-seg', role: 'group', 'aria-label': ariaLabel },
      options.map(([value, text]) =>
        el('button', {
          class: `seg__btn${value === active ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(value === active),
          onclick: () => value !== active && onPick(value),
        }, text)));
  }

  function chip(text, active, onClick, extraClass = '') {
    return el('button', { class: `btn fin-chip${active ? ' is-active' : ''} ${extraClass}`, type: 'button', 'aria-pressed': String(Boolean(active)), onclick: onClick }, text);
  }

  function numberInput(value, ariaLabel, onCommit) {
    const input = el('input', {
      class: 'fin-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done',
      value, 'aria-label': ariaLabel,
    });
    input.value = value;
    if (onCommit) {
      input.addEventListener('change', () => onCommit(input));
      input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
    }
    return input;
  }

  function colorDot(color, name, active, onClick) {
    return el('button', {
      class: `fin-dot${active ? ' is-active' : ''}`, type: 'button', title: name, 'aria-label': name, 'aria-pressed': String(Boolean(active)),
      style: `background:${color}`, onclick: onClick,
    });
  }

  // miniatury materiałów: jeden canvas na materiał; gdy w tym samym rysowaniu potrzebny jest drugi raz – kopia
  let usedSwatches = new Set();
  function swatchOf(def) {
    if (def.custom) return el('img', { class: 'fin-mat__img', src: def.dataUrl, alt: '', draggable: 'false' });
    const canvas = textures.swatch(def);
    const cls = `fin-mat__img${def.texture.draw === 'herringbone' ? ' fin-mat__img--diag' : ''}`;
    if (!canvas) return el('span', { class: cls, style: `background:${def.colors[0]}` });
    let node = canvas;
    if (usedSwatches.has(def.id)) {
      node = document.createElement('canvas');
      node.width = canvas.width;
      node.height = canvas.height;
      node.getContext('2d')?.drawImage(canvas, 0, 0);
    }
    usedSwatches.add(def.id);
    node.className = 'fin-mat__canvas';
    return el('span', { class: cls }, node);
  }

  function materialCard(def, simple, active, sizeText) {
    return el('button', {
      class: `fin-mat${active ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(Boolean(active)),
      onclick: () => !active && pickMaterial(simple),
    }, [swatchOf(def), el('span', { class: 'fin-mat__name' }, def.name), el('span', { class: 'fin-mat__size' }, sizeText)]);
  }

  function pickMaterial(simple) {
    const def = defOf(simple);
    if (def && !def.custom) ui.category = def.category;
    setTarget(simple);
  }

  // ---------------------------------------------------------------- blok: informacje i ilości
  function estimateLine(simple, areaM2, prefix) {
    const def = defOf(simple);
    if (!def || !(areaM2 > 0)) return null;
    const p = materialParams(simple, def);
    const e = tileEstimate(areaM2, p.size);
    const pieces = def.texture.draw === 'seamless' ? '' : ` – ok. ${e.pieces} szt. ${formatSize(p.size)}`;
    return el('div', { class: 'fin-info__est' }, `${prefix}${formatNumber(e.areaM2)} m², z zapasem 10% ${formatNumber(e.withWasteM2)} m²${pieces}`);
  }

  function infoBlock(s, finish) {
    const lines = [el('div', { class: 'fin-info__main' }, [
      el('span', {}, KIND_NAMES[s.kind] || 'Powierzchnia'),
      el('strong', {}, `${formatNumber(s.areaM2)} m²`),
    ])];
    if (finish && finish.kind === 'split') {
      const areas = applier.splitAreas(s.id);
      const lower = areas ? areas.lower : s.areaM2;
      const upper = areas ? areas.upper : 0;
      lines.push(estimateLine(finish.lower, lower, `Do ${formatCm(finish.height)} cm: `));
      lines.push(estimateLine(finish.upper, upper, 'Powyżej: '));
      if (!defOf(finish.lower) && lower > 0) lines.push(el('div', { class: 'fin-info__est' }, `Do ${formatCm(finish.height)} cm: ${formatNumber(lower)} m²`));
    } else if (finish) {
      lines.push(estimateLine(finish, s.areaM2, 'Okładzina: '));
    }
    return el('div', { class: 'fin-info' }, lines.filter(Boolean));
  }

  // ---------------------------------------------------------------- blok: cała ściana / płytki do wysokości
  function toSplit() {
    const s = surface();
    const f = currentFinish();
    const lower = f && f.kind === 'material' ? f : { kind: 'material', id: DEFAULT_SPLIT_MATERIAL, rot: 0 };
    const upper = f && f.kind === 'paint' ? f : { kind: 'paint', color: defaultColor(s) };
    const height = s.heightM > DEFAULT_SPLIT_HEIGHT + 0.05 ? DEFAULT_SPLIT_HEIGHT : Math.max(0.05, Math.round(s.heightM * 50) / 100);
    ui.part = 'lower';
    showTabFor(lower);
    setFinish({ kind: 'split', height, lower, upper });
  }

  function toWhole() {
    const f = currentFinish();
    if (!f || f.kind !== 'split') return;
    const whole = f.lower || f.upper;
    showTabFor(whole);
    setFinish(whole);
  }

  function setHeight(meters, options) {
    const s = surface();
    const f = currentFinish();
    if (!f || f.kind !== 'split') return;
    if (meters >= s.heightM - 0.005) {
      app.ui.toast('Płytki do samego sufitu – cała ściana w jednym wykończeniu');
      toWhole();
      return;
    }
    setFinish({ ...f, height: Math.max(0.01, Math.round(meters * 1000) / 1000) }, options);
  }

  function modeBlock(s, finish) {
    const split = Boolean(finish && finish.kind === 'split');
    const whole = s.kind === 'chimney' ? 'Cały komin' : s.kind === 'slope' ? 'Cały skos' : 'Cała ściana';
    const out = [seg([['whole', whole], ['split', 'Płytki do wysokości']], split ? 'split' : 'whole', (v) => (v === 'split' ? toSplit() : toWhole()), 'Zakres wykończenia')];
    if (split) {
      const input = numberInput(formatCm(finish.height), 'Wysokość płytek w centymetrach', (node) => {
        const m = parseCm(node.value);
        if (m === null || m <= 0) {
          app.ui.toast('Podaj wysokość w centymetrach, np. 120');
          node.value = formatCm(finish.height);
          return;
        }
        setHeight(m, { delay: INPUT_RENDER_DELAY });
      });
      const quick = QUICK_HEIGHTS_CM.filter((cm) => cm / 100 < s.heightM - 0.005).map((cm) =>
        chip(String(cm), Math.abs(finish.height - cm / 100) < 5e-4, () => setHeight(cm / 100)));
      out.push(el('div', { class: 'fin-row' }, [
        el('label', { class: 'fin-field' }, [el('span', {}, 'Wysokość'), input, el('span', {}, 'cm')]),
        ...quick,
        chip('Do sufitu', false, () => setHeight(Infinity)),
      ]));
      out.push(seg(
        [['lower', `Dół – do ${formatCm(finish.height)} cm`], ['upper', 'Góra – powyżej']],
        ui.part,
        (part) => {
          ui.part = part;
          showTabFor(currentTarget());
          render();
        },
        'Edytowana część ściany'
      ));
    }
    return el('div', { class: 'fin-block' }, out);
  }

  // ---------------------------------------------------------------- zakładka: farba
  function paintTab(s, target) {
    const color = target && target.kind === 'paint' ? target.color : null;
    const shown = color || defaultColor(s);
    const caption = el('span', { class: 'fin-color__hex' }, colorCaption(shown));
    const picker = el('input', { type: 'color', class: 'fin-color__input', value: shown, 'aria-label': 'Własny kolor farby' });
    picker.value = shown;
    picker.addEventListener('input', () => {
      const c = normalizeColor(picker.value);
      if (!c) return;
      caption.textContent = colorCaption(c);
      liveTarget({ kind: 'paint', color: c });
    });
    picker.addEventListener('change', () => {
      const c = normalizeColor(picker.value);
      if (c) setTarget({ kind: 'paint', color: c });
    });

    const out = [el('label', { class: 'fin-color' }, [picker, el('span', { class: 'fin-color__text' }, [el('span', {}, 'Własny kolor'), caption])])];

    const recents = recent.list('paint', customs());
    if (recents.length) {
      out.push(label('Ostatnio używane'));
      out.push(el('div', { class: 'fin-dots' }, recents.map((f) =>
        colorDot(f.color, paintName(f.color) || f.color, f.color === color, () => setTarget({ kind: 'paint', color: f.color })))));
    }
    for (const group of PAINT_GROUPS) {
      out.push(label(group.name));
      out.push(el('div', { class: 'fin-swatches' }, group.colors.map((p) =>
        el('button', {
          class: `fin-swatch${p.color === color ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(p.color === color),
          onclick: () => setTarget({ kind: 'paint', color: p.color }),
        }, [el('span', { class: 'fin-swatch__color', style: `background:${p.color}` }), el('span', { class: 'fin-swatch__name' }, p.name)]))));
    }
    return el('div', { class: 'fin-block' }, out);
  }

  const colorCaption = (c) => (paintName(c) ? `${paintName(c)} · ${c}` : c);

  // ---------------------------------------------------------------- zakładka: materiały
  function materialTab(s, target) {
    const targetDef = defOf(target);
    const fitting = MATERIALS.filter((m) => materialFits(m, s.kind));
    const categories = CATEGORIES.filter((c) => fitting.some((m) => m.category === c.id));
    if (!categories.some((c) => c.id === ui.category)) ui.category = categories[0]?.id || null;
    const out = [];

    const recents = recent.list('material', customs()).filter((f) => materialFits(defOf(f), s.kind)).slice(0, 6);
    if (recents.length) {
      const key = target ? finishKey(target, customs()) : '';
      out.push(label('Ostatnio używane'));
      out.push(el('div', { class: 'fin-mats fin-mats--row' }, recents.map((f) => {
        const def = defOf(f);
        return materialCard(def, f, finishKey(f, customs()) === key, formatSize(materialParams(f, def).size));
      })));
    }

    out.push(el('div', { class: 'fin-chips fin-chips--scroll', role: 'group', 'aria-label': 'Kategoria materiału' },
      categories.map((c) => chip(c.name, c.id === ui.category, () => {
        ui.category = c.id;
        render();
      }))));
    out.push(el('div', { class: 'fin-mats' }, fitting.filter((m) => m.category === ui.category).map((def) =>
      materialCard(def, { kind: 'material', id: def.id, rot: 0 }, targetDef?.id === def.id, def.texture.draw === 'seamless' ? 'bez podziału' : formatSize(def.size)))));

    if (targetDef) out.push(optionsBlock(targetDef, target));
    else out.push(note('Wybierz materiał, aby ustawić format, kierunek i fugę.'));
    return el('div', { class: 'fin-block' }, out);
  }

  const sameSize = (a, b) => Math.abs(a[0] - b[0]) < 5e-4 && Math.abs(a[1] - b[1]) < 5e-4;

  /** Opcje wybranego materiału: format, własny wymiar, kierunek, układ, fuga. */
  function optionsBlock(def, target) {
    const p = materialParams(target, def);
    const draw = def.texture.draw;
    const out = [el('div', { class: 'fin-options__title' }, def.name)];

    if (draw !== 'seamless') {
      if (def.formats && FORMATS[def.formats]) {
        const formats = [...FORMATS[def.formats]];
        if (!formats.some((f) => sameSize(f.size, def.size))) formats.unshift({ label: formatSize(def.size).replace(' cm', ''), size: def.size });
        out.push(label('Format (cm)'));
        out.push(el('div', { class: 'fin-chips' }, formats.map((f) =>
          chip(f.label, sameSize(f.size, p.size), () => patchMaterial({ size: sameSize(f.size, def.size) ? undefined : [f.size[0], f.size[1]] })))));
      }
      out.push(label('Własny wymiar elementu'));
      const wInput = numberInput(formatCm(p.size[0]), 'Szerokość elementu w centymetrach', commitSize);
      const hInput = numberInput(formatCm(p.size[1]), draw === 'tiles' ? 'Wysokość elementu w centymetrach' : 'Długość elementu w centymetrach', commitSize);
      function commitSize() {
        const w = parseCm(wInput.value);
        const h = parseCm(hInput.value);
        if (w === null || h === null || w < SIZE_MIN || h < SIZE_MIN || w > SIZE_MAX || h > SIZE_MAX) {
          app.ui.toast(`Podaj wymiary w centymetrach (od ${formatCm(SIZE_MIN)} do ${formatCm(SIZE_MAX)})`);
          wInput.value = formatCm(p.size[0]);
          hInput.value = formatCm(p.size[1]);
          return;
        }
        if (sameSize([w, h], p.size)) return;
        patchMaterial({ size: [clampSize(w), clampSize(h)] }, { delay: INPUT_RENDER_DELAY });
      }
      out.push(el('div', { class: 'fin-row' }, [wInput, el('span', {}, '×'), hInput, el('span', {}, 'cm')]));
      if (draw === 'herringbone') out.push(note('Jodełka: długość deski jest zaokrąglana do wielokrotności szerokości.'));
    }

    out.push(label('Kierunek układania'));
    out.push(seg([[0, 'Obrót 0°'], [90, 'Obrót 90°']], p.rot, (rot) => patchMaterial({ rot }), 'Kierunek układania'));

    if (draw === 'tiles') {
      out.push(label('Układ'));
      out.push(seg([['straight', 'Prosty'], ['brick', 'Na cegiełkę']], p.pattern, (pattern) => patchMaterial({ pattern }), 'Układ płytek'));
    }

    // fuga: płytki oraz gres układany w jodełkę (texture.tileJoint)
    if (draw === 'tiles' || (def.texture.tileJoint && def.grout)) {
      out.push(label('Szerokość fugi (mm)'));
      out.push(el('div', { class: 'fin-chips' }, GROUT_WIDTHS_MM.map((mm) =>
        chip(mm === 0 ? 'bez fugi' : String(mm), Math.abs(p.groutWidth * 1000 - mm) < 0.05, () => patchMaterial({ groutWidth: mm / 1000 })))));

      if (p.groutWidth > 0) {
        out.push(label('Kolor fugi'));
        const picker = el('input', { type: 'color', class: 'fin-dot fin-dot--picker', value: p.groutColor, 'aria-label': 'Własny kolor fugi' });
        picker.value = p.groutColor;
        // tekstura jest rysowana od nowa, więc kolor fugi zmieniamy dopiero po zamknięciu próbnika
        picker.addEventListener('change', () => {
          const c = normalizeColor(picker.value);
          if (c) patchMaterial({ grout: c });
        });
        out.push(el('div', { class: 'fin-dots' }, [
          ...GROUT_COLORS.map((g) => colorDot(g.color, `Fuga: ${g.name}`, g.color === p.groutColor, () => patchMaterial({ grout: g.color }))),
          picker,
        ]));
      }
    }
    return el('div', { class: 'fin-options' }, out);
  }

  // ---------------------------------------------------------------- zakładka: własne płytki
  function customTab(s, target) {
    const out = [note('Zrób zdjęcie płytki lub wczytaj teksturę z dysku i podaj prawdziwy wymiar elementu – będzie układana jak każdy inny materiał.')];

    const file = el('input', { type: 'file', accept: 'image/*', class: 'fin-file__input', 'aria-label': 'Zdjęcie płytki' });
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      ui.uploadBusy = true;
      render();
      try {
        const img = await fileToDataUrl(f);
        const hCm = Math.min(SIZE_MAX * 100, Math.max(SIZE_MIN * 100, Math.round((60 * img.height) / img.width)));
        ui.upload = { dataUrl: img.dataUrl, name: nameFromFile(f.name), w: '60', h: String(hCm) };
      } catch (err) {
        console.warn(err);
        app.ui.toast('Nie udało się wczytać tego zdjęcia');
      }
      ui.uploadBusy = false;
      if (token) render();
    });
    out.push(el('label', { class: 'btn fin-file' }, [file, ui.uploadBusy ? 'Wczytywanie…' : ui.upload ? 'Wybierz inne zdjęcie' : 'Wybierz zdjęcie lub zrób je aparatem']));

    if (ui.upload) {
      const up = ui.upload;
      const name = el('input', { class: 'fin-input fin-input--text', type: 'text', maxlength: '40', value: up.name, 'aria-label': 'Nazwa materiału', autocomplete: 'off' });
      name.value = up.name;
      name.addEventListener('input', () => (up.name = name.value));
      const w = numberInput(up.w, 'Szerokość elementu w centymetrach');
      const h = numberInput(up.h, 'Wysokość elementu w centymetrach');
      w.addEventListener('input', () => (up.w = w.value));
      h.addEventListener('input', () => (up.h = h.value));
      out.push(el('div', { class: 'fin-upload' }, [
        el('img', { class: 'fin-upload__img', src: up.dataUrl, alt: 'Podgląd zdjęcia' }),
        el('div', { class: 'fin-upload__form' }, [
          label('Nazwa'), name,
          label('Wymiar elementu na zdjęciu'),
          el('div', { class: 'fin-row' }, [w, el('span', {}, '×'), h, el('span', {}, 'cm')]),
        ]),
      ]));
      out.push(el('div', { class: 'fin-row' }, [
        el('button', { class: 'btn is-active fin-grow', type: 'button', onclick: addCustom }, 'Dodaj i zastosuj'),
        el('button', { class: 'btn', type: 'button', onclick: () => { ui.upload = null; render(); } }, 'Anuluj'),
      ]));
    }

    const list = customs().map((c) => resolveMaterial(c.id, customs())).filter(Boolean);
    if (list.length) {
      out.push(label('Twoje materiały'));
      out.push(el('div', { class: 'fin-customs' }, list.map((def) => {
        const active = target && target.kind === 'material' && target.id === def.id;
        const confirming = ui.confirmDelete === def.id;
        return el('div', { class: 'fin-custom' }, [
          materialCard(def, { kind: 'material', id: def.id, rot: 0 }, active, formatSize(def.size)),
          el('button', {
            class: `btn fin-danger${confirming ? ' is-confirm' : ''}`, type: 'button',
            onclick: () => {
              if (confirming) removeCustom(def.id);
              else {
                ui.confirmDelete = def.id;
                render();
              }
            },
          }, confirming ? 'Na pewno usunąć?' : 'Usuń'),
        ]);
      })));
      const active = defOf(target);
      if (active && active.custom) out.push(optionsBlock(active, target));
    }
    return el('div', { class: 'fin-block' }, out);
  }

  function addCustom() {
    const up = ui.upload;
    if (!up) return;
    const w = parseCm(up.w);
    const h = parseCm(up.h);
    if (w === null || h === null || w < SIZE_MIN || h < SIZE_MIN || w > SIZE_MAX || h > SIZE_MAX) {
      app.ui.toast(`Podaj wymiary elementu w centymetrach (od ${formatCm(SIZE_MIN)} do ${formatCm(SIZE_MAX)})`);
      return;
    }
    const material = { id: newCustomId(), name: up.name.trim() || 'Własna płytka', dataUrl: up.dataUrl, size: [w, h] };
    const simple = { kind: 'material', id: material.id, rot: 0 };
    const finish = withTarget(simple);
    const id = ui.surfaceId;
    ui.upload = null;
    recent.add(simple);
    write((draft) => {
      draft.customMaterials.push(material);
      draft.finishes[id] = finish;
    });
  }

  /** Usuwa materiał własny; powierzchnie, które go używały, wracają do wyglądu domyślnego. */
  function removeCustom(materialId) {
    ui.confirmDelete = null;
    write((draft) => {
      draft.customMaterials = draft.customMaterials.filter((m) => m.id !== materialId);
      for (const sid of Object.keys(draft.finishes)) if (finishUsesMaterial(draft.finishes[sid], materialId)) delete draft.finishes[sid];
    });
    app.ui.toast('Usunięto materiał');
  }

  // ---------------------------------------------------------------- blok: skróty
  function applyToGroup(group) {
    const s = surface();
    const finish = currentFinish();
    const targets = app.surfacesOfRoom(s.levelId, s.roomId).filter((t) => group.kinds.includes(t.kind) && t.id !== s.id);
    write((draft) => {
      for (const t of targets) {
        // podział "do wysokości" nie dotyczy sufitów – tam trafia sama dolna część
        const f = finish && finish.kind === 'split' && !SPLIT_KINDS.includes(t.kind) ? finish.lower : finish;
        if (f) draft.finishes[t.id] = JSON.parse(JSON.stringify(f));
        else delete draft.finishes[t.id];
      }
    });
    app.ui.toast(group.done(targets.length + 1));
  }

  function actionsBlock(s, finish) {
    const out = [];
    const group = GROUPS.find((g) => g.kinds.includes(s.kind));
    if (group && app.surfacesOfRoom(s.levelId, s.roomId).filter((t) => group.kinds.includes(t.kind)).length > 1) {
      out.push(el('button', { class: 'btn fin-wide', type: 'button', onclick: () => applyToGroup(group) }, group.label));
    }
    const hasOwn = Boolean(variant().finishes && variant().finishes[s.id]);
    out.push(el('button', {
      class: 'btn fin-wide', type: 'button', disabled: !hasOwn && !finish,
      onclick: () => {
        cancelLive();
        showTabFor(null);
        setFinish(null);
      },
    }, 'Przywróć domyślne'));
    return el('div', { class: 'fin-actions' }, out);
  }

  // ---------------------------------------------------------------- rysowanie
  /** Zakładka pasująca do wykończenia: farba / materiały / własne (dla podłogi bez wykończenia – materiały). */
  function showTabFor(simple) {
    const def = defOf(simple);
    if (def) {
      ui.tab = def.custom ? 'custom' : 'material';
      if (!def.custom) ui.category = def.category;
    } else if (simple && simple.kind === 'paint') ui.tab = 'paint';
    else ui.tab = surface()?.kind === 'floor' ? 'material' : 'paint';
  }

  function render() {
    clearTimeout(renderTimer);
    renderTimer = 0;
    const s = surface();
    if (!s || !token) return;
    const body = root.parentElement;
    const scroll = body ? body.scrollTop : 0;
    const finish = currentFinish();
    const split = Boolean(finish && finish.kind === 'split');
    const target = split ? finish[ui.part] : finish;
    usedSwatches = new Set();
    fill(root, [
      infoBlock(s, finish),
      (SPLIT_UI_KINDS.includes(s.kind) || split) && modeBlock(s, finish),
      seg([['paint', 'Farba'], ['material', 'Materiały'], ['custom', 'Własne']], ui.tab, (tab) => {
        ui.tab = tab;
        render();
      }, 'Rodzaj wykończenia'),
      ui.tab === 'paint' ? paintTab(s, target) : ui.tab === 'material' ? materialTab(s, target) : customTab(s, target),
      actionsBlock(s, finish),
    ]);
    if (body) body.scrollTop = scroll;
  }

  return {
    /** Otwiera panel dla powierzchni (zastępuje panel innej funkcji albo poprzedniej powierzchni). */
    open(surfaceId) {
      const s = app.getSurface(surfaceId);
      if (!s) return false;
      cancelLive();
      const mine = {};
      // openPanel zamyka poprzedni panel (także nasz) i woła jego onClose – dopiero potem ustawiamy nowy stan
      const h = app.ui.openPanel({
        title: s.label,
        content: root,
        onClose: () => {
          if (token !== mine) return;
          token = null;
          handle = null;
          cancelLive();
          clearTimeout(renderTimer);
          root.replaceChildren();
          onClose?.(surfaceId);
        },
      });
      token = mine;
      handle = h;
      ui = freshUi(surfaceId);
      showTabFor(currentTarget());
      render();
      return true;
    },
    close() {
      if (token && handle) handle.close();
    },
    /**
     * Wariant się zmienił – narysuj panel od nowa. Zmiany "na żywo" (próbnik koloru) pomijamy, a po zmianie
     * z pola tekstowego czekamy chwilę: pole traci fokus w momencie dotknięcia innego przycisku i natychmiastowa
     * przebudowa usunęłaby ten przycisk spod palca, zanim dotarłoby do niego kliknięcie.
     */
    refresh() {
      if (!token || quiet) return;
      clearTimeout(renderTimer);
      if (renderDelay > 0) renderTimer = setTimeout(render, renderDelay);
      else render();
    },
    get surfaceId() {
      return token ? ui.surfaceId : null;
    },
    get isOpen() {
      return Boolean(token);
    },
    element: root,
  };
}

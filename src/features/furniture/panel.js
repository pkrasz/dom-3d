// Zawartość paneli funkcji "Meble": katalog (dodawanie) i edycja zaznaczonego mebla.
// Tylko DOM – żadnej logiki ustawiania; wszystko, co użytkownik zrobi, idzie do funkcji z `handlers`.
import { el } from '../../ui/dom.js';
import { CATEGORIES, CATALOG, PALETTE, MOUNT_RANGE } from './catalog.js';

const svg = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  furniture: svg('<path d="M5 11V8a2 2 0 012-2h10a2 2 0 012 2v3"/><path d="M3 12.5a1.5 1.5 0 013 0V15h12v-2.5a1.5 1.5 0 013 0V18H3z"/><path d="M6 18v2M18 18v2"/>'),
  rotateLeft: svg('<path d="M4 5v5h5"/><path d="M4.6 10A8 8 0 1112 20"/>'),
  rotateRight: svg('<path d="M20 5v5h-5"/><path d="M19.4 10A8 8 0 1012 20"/>'),
  quarter: svg('<path d="M5 19V5h14"/><path d="M5 12a7 7 0 017 7"/>'),
  wall: svg('<path d="M4 4h16"/><rect x="7" y="7" width="10" height="7" rx="1"/><path d="M12 20v-4M10 18l2-2 2 2"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>'),
  move: svg('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
};

const cm = (m) => Math.round(m * 100);
/** Tekst z pola → liczba (akceptuje przecinek i dopisane "cm"); NaN, gdy to nie liczba. */
export function parseNumber(text) {
  const cleaned = String(text).replace(',', '.').replace(/[^0-9.\-]/g, '');
  return cleaned === '' ? NaN : Number.parseFloat(cleaned);
}

// ---------------------------------------------------------------- katalog

/**
 * @param {{onAdd: (typeId: string) => void}} handlers
 * @returns {HTMLElement}
 */
export function createCatalogContent({ onAdd }) {
  const root = el('div', { class: 'meb-catalog' }, [
    el('p', { class: 'meb-hint' }, 'Wybierz mebel – stanie w oglądanym miejscu. Potem przeciągnij go palcem. Dotknij mebla w modelu, żeby go edytować.'),
  ]);
  for (const cat of CATEGORIES) {
    const types = CATALOG.filter((t) => t.category === cat.id);
    if (!types.length) continue;
    root.append(el('h3', { class: 'meb-cat' }, cat.name));
    root.append(
      el('div', { class: 'meb-grid' }, types.map((t) =>
        el('button', { class: 'btn meb-item', type: 'button', dataset: { type: t.id }, onclick: () => onAdd(t.id) }, [
          el('span', { class: 'meb-item__swatch', style: `background:${t.color}`, 'aria-hidden': 'true' }),
          el('span', { class: 'meb-item__text' }, [
            el('span', { class: 'meb-item__name' }, t.name),
            el('span', { class: 'meb-item__dim' }, `${cm(t.size.w)} × ${cm(t.size.d)} × ${cm(t.size.h)} cm`),
          ]),
        ])
      ))
    );
  }
  return root;
}

// ---------------------------------------------------------------- edycja

/**
 * @param {{onRotate: (deg: number) => void, onFaceWall: () => void, onDuplicate: () => void, onMoveHere: () => void,
 *          onDelete: () => void, onColor: (hex: string) => void, onSize: (size: {w?: number, d?: number, h?: number}) => void,
 *          onMount: (z: number) => void}} handlers   wymiary i wysokość zawieszenia w METRACH
 * @returns {{element: HTMLElement, update: (item: Object, type: Object) => void}}
 */
export function createEditContent(handlers) {
  const action = (label, icon, onClick, extraClass = '') =>
    el('button', { class: `btn meb-act ${extraClass}`, type: 'button', title: label, onclick: onClick }, [
      el('span', { class: 'ico', html: icon, 'aria-hidden': 'true' }),
      el('span', { class: 'lbl' }, label),
    ]);

  const actions = el('div', { class: 'meb-actions' }, [
    action('−15°', icons.rotateRight, () => handlers.onRotate(-15)),
    action('+15°', icons.rotateLeft, () => handlers.onRotate(15)),
    action('90°', icons.quarter, () => handlers.onRotate(90)),
    action('Do ściany', icons.wall, () => handlers.onFaceWall()),
    action('Duplikuj', icons.copy, () => handlers.onDuplicate()),
    action('Przenieś tu', icons.move, () => handlers.onMoveHere()),
    action('Usuń', icons.trash, () => handlers.onDelete(), 'meb-act--danger'),
  ]);
  actions.children[3].title = 'Obróć tyłem do najbliższej ściany i dosuń';
  actions.children[5].title = 'Przenieś mebel na środek oglądanego widoku (także do innego pomieszczenia; na inną kondygnację – najpierw ją przełącz)';

  // --- kolor: paleta + próbnik
  const swatches = PALETTE.map((hex) =>
    el('button', { class: 'meb-swatch', type: 'button', title: hex, 'aria-label': `Kolor ${hex}`, dataset: { color: hex }, onclick: () => handlers.onColor(hex) }, [
      el('span', { style: `background:${hex}` }),
    ])
  );
  const picker = el('input', { class: 'meb-picker', type: 'color', 'aria-label': 'Dowolny kolor (próbnik)', title: 'Dowolny kolor' });
  picker.addEventListener('change', () => handlers.onColor(picker.value));
  const colors = el('div', { class: 'meb-colors', role: 'group', 'aria-label': 'Kolor mebla' }, [...swatches, picker]);

  // --- wymiary w cm
  const fields = {};
  function field(key, label, commit) {
    const input = el('input', { class: 'meb-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': `${label} w centymetrach` });
    const range = el('span', { class: 'meb-field__range' });
    input.addEventListener('change', () => {
      const v = parseNumber(input.value);
      if (Number.isFinite(v)) commit(v / 100);
      else fields[key].restore();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
    input.addEventListener('focus', () => input.select?.());
    const wrap = el('label', { class: 'meb-field' }, [el('span', { class: 'meb-field__label' }, label), input, range]);
    fields[key] = { input, range, wrap, value: '', restore: () => (input.value = fields[key].value) };
    return wrap;
  }
  const dims = el('div', { class: 'meb-dims' }, [
    field('w', 'Szer. (cm)', (v) => handlers.onSize({ w: v })),
    field('d', 'Głęb. (cm)', (v) => handlers.onSize({ d: v })),
    field('h', 'Wys. (cm)', (v) => handlers.onSize({ h: v })),
    field('z', 'Od podłogi', (v) => handlers.onMount(v)),
  ]);

  const element = el('div', { class: 'meb-edit' }, [actions, colors, dims]);

  function setField(key, meters, range) {
    const f = fields[key];
    f.value = String(Math.round(meters * 1000) / 10).replace('.', ','); // cm z dokładnością do mm
    f.range.textContent = `${cm(range[0])}–${cm(range[1])}`;
    if (document.activeElement !== f.input) f.input.value = f.value; // nie nadpisuj pola w trakcie pisania
  }

  return {
    element,
    /** Wpisuje do panelu dane zaznaczonego mebla. */
    update(item, type) {
      setField('w', item.w, type.range.w);
      setField('d', item.d, type.range.d);
      setField('h', item.h, type.range.h);
      const mounted = Number.isFinite(item.z) || type.mount !== undefined;
      fields.z.wrap.hidden = !mounted;
      if (mounted) setField('z', item.z || 0, MOUNT_RANGE);
      const color = String(item.color || '').toLowerCase();
      for (const s of swatches) s.classList.toggle('is-active', s.dataset.color === color);
      if (/^#[0-9a-f]{6}$/.test(color)) picker.value = color;
    },
  };
}

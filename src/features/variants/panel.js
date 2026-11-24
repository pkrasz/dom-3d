// Zawartość panelu „Warianty”: lista z aktywnym wariantem, udostępnianie (link / plik), nowy / kopia, zmiana nazwy,
// usuwanie, eksport / import.
// Panel nie ma własnych danych – rysuje to, co zwraca controller.getState(), i woła jego operacje.
// Zmiana nazwy i potwierdzenie usunięcia dzieją się w wierszu listy (bez okien prompt/confirm – wygodniej palcem).
import { el } from '../../ui/dom.js';
import { downloadText, formatDateTime, plural, readFileText } from './io.js';
import { LIMITS } from './validate.js';

const svg = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const ICONS = {
  variants: svg('<rect x="8" y="3.5" width="12.5" height="12.5" rx="1.5"/><path d="M16 16v3a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 19V9.5A1.5 1.5 0 015 8h3"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  trash: svg('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>'),
};

const STATUS_TEXT = {
  pending: 'Zapisywanie zmian…',
  quota: 'Nie zapisano – brak miejsca w pamięci przeglądarki. Wyeksportuj wariant do pliku.',
  error: 'Nie zapisano – błąd zapisu w przeglądarce. Wyeksportuj wariant do pliku.',
  unavailable: 'Zapis w przeglądarce jest niedostępny (np. tryb prywatny). Wyeksportuj wariant do pliku.',
  readonly: 'Zapis wyłączony: w przeglądarce są warianty z nowszej wersji aplikacji. Odśwież stronę.',
  new: 'Jeszcze nie zapisano.',
};

/** Opis stanu zapisu do wiersza informacyjnego. */
export function statusText({ status, savedAt }) {
  if (status === 'saved') return savedAt ? `Zapisano w tej przeglądarce: ${formatDateTime(new Date(savedAt))}` : 'Zapisano w tej przeglądarce.';
  const last = savedAt && status !== 'unavailable' && status !== 'readonly' ? ` Ostatni zapis: ${formatDateTime(new Date(savedAt))}.` : '';
  return STATUS_TEXT[status] + last;
}

/**
 * @param {ReturnType<import('./controller.js').createController>} controller
 * @param {Object} deps
 * @param {(text: string) => void} deps.toast
 * @param {(filename: string, text: string) => void} [deps.download]
 * @param {(file: File) => Promise<{ok: boolean, text?: string, error?: string}>} [deps.readFile]
 * @param {?Object} [deps.nav]   navigator (share, canShare, clipboard) – podmieniany w testach
 * @param {(filename: string, text: string) => File} [deps.makeFile]
 * @param {(text: string) => Promise<boolean>} [deps.pasteLink]  odbiór wklejonego linku (receive.js); brak → bez tej sekcji
 * @returns {{element: HTMLElement, dispose: () => void}}
 */
export function createVariantsPanel(controller, {
  toast, download = downloadText, readFile = readFileText,
  nav = typeof navigator !== 'undefined' ? navigator : null,
  makeFile = (filename, text) => new File([text], filename, { type: 'application/json' }),
  pasteLink = null,
}) {
  // stan samego panelu: który wiersz jest w trybie zmiany nazwy / potwierdzania usunięcia
  let editingId = null;
  let confirmId = null;

  const statusEl = el('p', { class: 'war-status', role: 'status' });
  const listEl = el('ul', { class: 'war-list' });
  const fileInput = el('input', { type: 'file', accept: '.json,application/json', class: 'war-file', tabindex: '-1', 'aria-hidden': 'true', onchange: onFile });

  const button = (label, onClick, extraClass = '') => el('button', { class: `btn war-btn ${extraClass}`.trim(), type: 'button', onclick: onClick }, label);
  const iconButton = (icon, label, onClick, disabled = false) =>
    el('button', { class: 'btn btn--icon war-icon', type: 'button', 'aria-label': label, title: label, html: icon, disabled, onclick: onClick });

  // ---------------------------------------------------------------- udostępnianie aktywnego wariantu
  const shareHead = el('h3', { class: 'war-head' }, 'Udostępnij');
  const shareBtn = button('Udostępnij', doShare, 'war-btn--primary war-share');
  const fileBtn = button('Wyślij plik', doSendFile);
  const shareInfo = el('p', { class: 'war-status is-warning', role: 'status', hidden: true });
  const linkInput = el('input', {
    class: 'war-input war-link__input', type: 'text', readonly: true, 'aria-label': 'Link do wariantu',
    onfocus: () => linkInput.select?.(),
  });
  const linkBox = el('div', { class: 'war-link', hidden: true }, [
    el('p', { class: 'war-note' }, 'Przytrzymaj link, skopiuj go i wklej w wiadomości:'),
    linkInput,
  ]);

  // ---------------------------------------------------------------- odbiór: link wklejony ręcznie
  // Potrzebne tam, gdzie linku nie da się otworzyć: aplikacja z ikony na ekranie początkowym iPhone'a (osobna pamięć,
  // brak paska adresu) i sytuacja, gdy link otworzył się w przeglądarce wbudowanej w komunikator.
  const pasteInput = el('input', {
    class: 'war-input war-link__input', type: 'text', 'aria-label': 'Link do wariantu z wiadomości', placeholder: 'Wklej tutaj link z wiadomości',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go',
  });
  const submitPaste = () => {
    if (!pasteInput.value.trim()) return toast('Wklej link do wariantu.');
    pasteLink(pasteInput.value); // pytanie „Dodać wariant?” otwiera się w miejscu tego panelu
  };
  pasteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitPaste();
  });
  const pasteBox = el('div', { class: 'war-link', hidden: true }, [
    pasteInput,
    el('div', { class: 'war-actions' }, [button('Dodaj z linku', submitPaste, 'war-btn--primary')]),
  ]);
  const pasteSection = pasteLink ? [
    el('h3', { class: 'war-head' }, 'Masz link do wariantu?'),
    el('div', { class: 'war-actions' }, [
      button('Wklej link…', () => {
        pasteBox.hidden = false;
        pasteInput.focus?.();
      }),
    ]),
    pasteBox,
    el('p', { class: 'war-note' }, 'Zwykle wystarczy stuknąć link. Jeśli używasz ikony na ekranie telefonu albo wariant się nie pojawił – skopiuj link z wiadomości i wklej go tutaj.'),
  ] : [];

  const root = el('div', { class: 'war' }, [
    statusEl,
    listEl,
    shareHead,
    el('div', { class: 'war-actions' }, [shareBtn, fileBtn]),
    shareInfo,
    linkBox,
    el('p', { class: 'war-note' }, 'Odbiorca dostaje kopię wariantu – późniejsze zmiany trzeba wysłać ponownie. Każdy, kto ma link, zobaczy ten wariant.'),
    ...pasteSection,
    el('h3', { class: 'war-head' }, 'Nowy wariant'),
    el('div', { class: 'war-actions' }, [
      button('Pusty z meblami z projektu', () => report(controller.createFromProject())),
      button('Kopia bieżącego', () => report(controller.duplicateActive())),
    ]),
    el('h3', { class: 'war-head' }, 'Plik'),
    el('div', { class: 'war-actions' }, [
      button('Eksportuj bieżący', () => doExport('active')),
      button('Eksportuj wszystkie', () => doExport('all')),
      button('Importuj z pliku…', () => fileInput.click()),
    ]),
    fileInput,
    el('p', { class: 'war-note' }, 'Warianty zapisują się same w tej przeglądarce. Plik przyda się jako kopia zapasowa.'),
  ]);

  function report(result) {
    if (result && result.ok === false && result.message) toast(result.message);
  }

  function doExport(scope) {
    try {
      const file = controller.exportData(scope);
      download(file.filename, file.text);
      toast(scope === 'all' ? `Zapisano plik: ${plural(file.count, 'wariant', 'warianty', 'wariantów')}.` : `Zapisano plik ${file.filename}`);
    } catch (err) {
      console.error(err);
      toast('Nie udało się zapisać pliku.');
    }
  }

  const activeVariant = () => {
    const { variants, activeId } = controller.getState();
    return variants.find((v) => v.id === activeId);
  };
  const isAbort = (err) => err && err.name === 'AbortError'; // użytkownik zamknął systemowy arkusz – to nie błąd

  function setShareInfo(text) {
    shareInfo.textContent = text;
    shareInfo.hidden = !text;
    // gdy link nie może powstać, podpowiadamy plik: to on staje się przyciskiem głównym
    fileBtn.classList.toggle('war-btn--primary', Boolean(text));
    shareBtn.classList.toggle('war-btn--primary', !text);
  }
  function resetShare() {
    setShareInfo('');
    linkBox.hidden = true;
    linkInput.value = '';
  }

  // Link liczymy z WYPRZEDZENIEM (przy otwarciu panelu i po każdej zmianie listy). Kompresja jest asynchroniczna,
  // a Safari pozwala wywołać navigator.share tylko bezpośrednio po dotknięciu – gotowy link nie gubi tego „gestu”.
  let prepared = null; // { variant, promise, result }
  function prepareLink() {
    const variant = activeVariant();
    if (prepared && prepared.variant === variant) return prepared.promise;
    const entry = { variant, result: null, promise: null };
    entry.promise = controller.shareLink().then((result) => {
      entry.result = result;
      return result;
    });
    prepared = entry;
    return entry.promise;
  }

  async function doShare() {
    resetShare();
    const variant = activeVariant();
    const link = prepared && prepared.variant === variant && prepared.result ? prepared.result : await prepareLink();
    if (!link.ok) return setShareInfo(link.message);
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ title: link.title, text: link.text, url: link.url });
        return;
      } catch (err) {
        if (isAbort(err)) return;
        // inny błąd (np. przeglądarka odmówiła) → próbujemy schowka
      }
    }
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      try {
        await nav.clipboard.writeText(link.url);
        toast('Link skopiowany');
        return;
      } catch {
        // brak zgody na schowek → pole do ręcznego skopiowania
      }
    }
    linkInput.value = link.url;
    linkBox.hidden = false;
    linkInput.focus?.();
    linkInput.select?.();
  }

  async function doSendFile() {
    resetShare();
    let file;
    try {
      file = controller.exportData('active'); // ten sam format co „Eksportuj bieżący”
    } catch (err) {
      console.error(err);
      return toast('Nie udało się przygotować pliku.');
    }
    let shareable = null;
    try {
      const candidate = makeFile(file.filename, file.text);
      if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [candidate] })) shareable = candidate;
    } catch {
      // brak File / canShare → zwykłe pobranie
    }
    if (shareable) {
      try {
        await nav.share({ files: [shareable], title: file.filename });
        return;
      } catch (err) {
        if (isAbort(err)) return;
      }
    }
    try {
      download(file.filename, file.text);
      toast(`Zapisano plik ${file.filename} – wyślij go jako załącznik.`);
    } catch (err) {
      console.error(err);
      toast('Nie udało się zapisać pliku.');
    }
  }

  async function onFile() {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = ''; // żeby ten sam plik dało się wybrać ponownie
    if (!file) return;
    const read = await readFile(file);
    if (!read.ok) return toast(read.error);
    const result = controller.importText(read.text);
    toast(result.message);
  }

  // ---------------------------------------------------------------- wiersze listy
  function describe(v) {
    const finishes = Object.keys(v.finishes || {}).length;
    const furniture = (v.furniture || []).length;
    return `${plural(finishes, 'wykończenie', 'wykończenia', 'wykończeń')} · ${plural(furniture, 'mebel', 'meble', 'mebli')}`;
  }

  function normalRow(v, active, onlyOne) {
    const pick = el('button', {
      class: 'war-pick', type: 'button', 'aria-pressed': String(active),
      title: active ? 'Aktywny wariant' : 'Przełącz na ten wariant',
      onclick: () => controller.switchTo(v.id),
    }, [
      el('span', { class: 'war-mark', html: active ? ICONS.check : '', 'aria-hidden': 'true' }),
      el('span', { class: 'war-text' }, [el('span', { class: 'war-name' }, v.name), el('span', { class: 'war-meta' }, describe(v))]),
    ]);
    return el('li', { class: `war-item${active ? ' is-active' : ''}`, dataset: { id: v.id } }, [
      pick,
      iconButton(ICONS.edit, `Zmień nazwę: ${v.name}`, () => setMode(v.id, null)),
      iconButton(ICONS.trash, onlyOne ? 'Ostatniego wariantu nie można usunąć' : `Usuń: ${v.name}`, () => setMode(null, v.id), onlyOne),
    ]);
  }

  function editRow(v) {
    const input = el('input', {
      class: 'war-input', type: 'text', value: v.name, maxlength: String(LIMITS.nameChars), 'aria-label': 'Nazwa wariantu',
      enterkeyhint: 'done', autocomplete: 'off',
    });
    const submit = () => {
      if (!controller.rename(v.id, input.value)) return toast('Wpisz nazwę wariantu.');
      setMode(null, null);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    // fokus po wstawieniu do dokumentu – na telefonie od razu wysuwa klawiaturę
    queueMicrotask(() => {
      if (input.isConnected) {
        input.focus();
        input.select?.();
      }
    });
    return el('li', { class: 'war-item war-item--form', dataset: { id: v.id } }, [
      input,
      button('Zapisz', submit, 'war-btn--primary'),
      button('Anuluj', () => setMode(null, null)),
    ]);
  }

  function confirmRow(v) {
    return el('li', { class: 'war-item war-item--form', dataset: { id: v.id } }, [
      el('span', { class: 'war-question' }, `Usunąć „${v.name}”? Tego nie da się cofnąć.`),
      button('Usuń', () => {
        confirmId = null;
        if (!controller.remove(v.id)) {
          toast('Ostatniego wariantu nie można usunąć.');
          renderList();
        }
      }, 'war-btn--danger'),
      button('Anuluj', () => setMode(null, null)),
    ]);
  }

  function setMode(edit, confirm) {
    editingId = edit;
    confirmId = confirm;
    renderList();
  }

  /** Wiersz w trybie zmiany nazwy – ten sam element żyje przez kolejne przerysowania listy (fokus i wpisany tekst). */
  let editingRow = null;

  function renderList() {
    const { variants, activeId } = controller.getState();
    if (!variants.some((v) => v.id === editingId)) editingId = null;
    if (!variants.some((v) => v.id === confirmId) || variants.length <= 1) confirmId = null;
    if (!editingId || !editingRow || editingRow.dataset.id !== editingId) editingRow = null;
    const rows = variants.map((v) => {
      if (v.id === editingId) return (editingRow ||= editRow(v));
      if (v.id === confirmId) return confirmRow(v);
      return normalRow(v, v.id === activeId, variants.length <= 1);
    });
    if (editingRow && editingRow.parentNode === listEl) {
      // Lista zmieniła się w trakcie wpisywania nazwy (przełączenie wariantu, kopia, import): wymieniamy wszystkie
      // wiersze POZA edytowanym. Nie wyjmujemy go z dokumentu, bo pole straciłoby fokus (na telefonie: klawiaturę).
      for (const child of [...listEl.children]) if (child !== editingRow) child.remove();
      const at = rows.indexOf(editingRow);
      for (const row of rows.slice(0, at)) listEl.insertBefore(row, editingRow);
      for (const row of rows.slice(at + 1)) listEl.appendChild(row);
    } else {
      listEl.replaceChildren(...rows);
    }
    const active = variants.find((v) => v.id === activeId);
    shareHead.textContent = active ? `Udostępnij: ${active.name}` : 'Udostępnij';
    if (!prepared || prepared.variant !== active) resetShare(); // inny wariant → stary komunikat i link są nieaktualne
    prepareLink();
  }

  function renderStatus() {
    const state = controller.getState();
    statusEl.textContent = statusText(state);
    statusEl.classList.toggle('is-warning', !['saved', 'pending', 'new'].includes(state.status));
  }

  const off = controller.onChange((what) => {
    // także w trakcie wpisywania nazwy – renderList zostawia wtedy edytowany wiersz nietknięty
    if (what === 'list') renderList();
    renderStatus();
  });
  renderList();
  renderStatus();

  return { element: root, dispose: off };
}

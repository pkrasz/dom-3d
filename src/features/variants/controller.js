// Logika wariantów bez interfejsu: lista wariantów, aktywny wariant, autozapis, eksport / import.
//
// Podział odpowiedzialności:
//  - TREŚĆ aktywnego wariantu żyje w rdzeniu (app.variant.get()); zmieniają ją inne funkcje przez app.variant.update().
//  - Tutaj trzymamy LISTĘ wszystkich wariantów. Na każde 'variant:change' podmieniamy na liście wpis o tym samym id
//    i planujemy zapis. Przełączenie wariantu to po prostu app.variant.set(inny wariant z listy).
//  - Pozostałe funkcje (wykończenia, meble) nic o liście nie wiedzą – dostają 'variant:change' z pełnym wariantem.
import { cloneVariant } from '../../app/variant.js';
import {
  CURRENT_VERSION, LIMITS, cleanName, parseImport, parseStoredState, resolveCollisions, sanitizeFurnitureList, uniqueId, uniqueName,
} from './validate.js';
import { buildExport, exportFileName, plural } from './io.js';

const SAVE_DELAY_MS = 400;

const MESSAGES = {
  unavailable: 'Przeglądarka nie pozwala tu zapisywać danych (np. tryb prywatny). Zmiany znikną po zamknięciu strony – wyeksportuj wariant do pliku.',
  quota: 'Brak miejsca w pamięci przeglądarki – zmiany nie są zapisywane. Wyeksportuj wariant do pliku (Warianty → Eksportuj) i usuń zbędne warianty lub własne tekstury.',
  writeFailed: 'Nie udało się zapisać zmian w przeglądarce. Wyeksportuj wariant do pliku (Warianty → Eksportuj).',
  newer: 'Zapisane warianty pochodzą z nowszej wersji aplikacji. Nie zostały wczytane ani nadpisane – odśwież stronę. Bieżące zmiany nie będą zapisywane.',
  corrupt: 'Zapisane warianty były uszkodzone – zaczynamy od nowego wariantu.',
};

/** Domyślny generator id: crypto.randomUUID działa tylko po https/localhost, stąd wariant zapasowy. */
export function defaultMakeId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @typedef {'saved'|'pending'|'quota'|'error'|'unavailable'|'readonly'|'new'} SaveStatus
 *   saved – zapisano; pending – zmiany czekają na zapis; quota – brak miejsca; error – inny błąd zapisu;
 *   unavailable – przeglądarka nie daje zapisywać; readonly – zapis z nowszej wersji, nie nadpisujemy; new – jeszcze nic nie zapisano
 */

/**
 * @param {import('../../app/app.js').App} app
 * @param {Object} deps
 * @param {ReturnType<import('./storage.js').createStorage>} deps.storage
 * @param {() => string} [deps.makeId]
 * @param {() => Date} [deps.now]
 * @param {() => Object[]} [deps.createStarter]   meble startowe z projektu (FurnitureItem[])
 * @param {number} [deps.saveDelay]
 */
export function createController(app, { storage, makeId = defaultMakeId, now = () => new Date(), createStarter = () => [], saveDelay = SAVE_DELAY_MS }) {
  const toast = (text) => app.ui.toast(text, { duration: 7000 });
  const levelIds = app.house.levels.map((l) => l.id);
  // własny zapis: bez przycinania do bieżących powierzchni; import: tylko powierzchnie istniejące w tym domu
  const localCtx = { levelIds, makeId };
  const importCtx = () => ({ levelIds, makeId, surfaceIds: new Set(app.surfaces.keys()) });

  /** @type {Object[]} */
  let variants = [];
  let activeId = '';
  /** @type {?string} znacznik ISO ostatniego udanego zapisu */
  let savedAt = null;
  /** @type {SaveStatus} */
  let status = 'new';
  let timer = 0;
  let dirty = false;
  let warned = false; // komunikat o nieudanym zapisie pokazujemy raz na serię niepowodzeń
  const listeners = new Set();

  const notify = (what) => {
    for (const fn of [...listeners]) fn(what);
    app.events.emit(what === 'list' ? 'variants:list' : 'variants:save', api.getState());
  };
  const canSave = () => status !== 'unavailable' && status !== 'readonly';

  function starterFurniture() {
    try {
      return sanitizeFurnitureList(createStarter(), localCtx);
    } catch (err) {
      console.error('Nie udało się utworzyć mebli startowych:', err);
      return [];
    }
  }

  function freshVariant() {
    const ids = new Set(variants.map((v) => v.id));
    const name = uniqueName(`Wariant ${variants.length + 1}`, variants.map((v) => v.name));
    return { id: uniqueId(makeId, ids), name, finishes: {}, furniture: starterFurniture(), customMaterials: [] };
  }

  // ------------------------------------------------------------------------------------------ zapis
  function save() {
    clearTimeout(timer);
    timer = 0;
    if (!canSave()) return false;
    const stamp = now().toISOString();
    let result;
    try {
      result = storage.write(JSON.stringify({ version: CURRENT_VERSION, activeId, savedAt: stamp, variants }));
    } catch {
      result = { ok: false, reason: 'error' }; // np. dane nie do zserializowania
    }
    dirty = !result.ok; // nieudany zapis ponowimy przy następnej zmianie albo przy zamykaniu karty
    if (result.ok) {
      savedAt = stamp;
      status = 'saved';
      warned = false;
    } else {
      status = result.reason === 'quota' ? 'quota' : 'error';
      if (!warned) {
        warned = true;
        toast(result.reason === 'quota' ? MESSAGES.quota : MESSAGES.writeFailed);
      }
    }
    notify('save');
    return result.ok;
  }

  function scheduleSave() {
    if (!canSave()) return;
    dirty = true;
    if (status === 'saved' || status === 'new') status = 'pending';
    clearTimeout(timer);
    timer = setTimeout(save, saveDelay);
  }

  /** Zapis natychmiast, jeśli są niezapisane zmiany (zamykanie karty, przejście aplikacji w tło). */
  function flush() {
    return dirty ? save() : false;
  }

  // ------------------------------------------------------------------------------------------ start
  function load() {
    const read = storage.read();
    let loaded = null;
    if (read.status === 'unavailable') {
      status = 'unavailable';
      toast(MESSAGES.unavailable);
    } else if (read.status === 'ok') {
      const parsed = parseStoredState(read.text, localCtx);
      if (parsed.status === 'ok') loaded = parsed.state;
      else if (parsed.status === 'newer') {
        status = 'readonly';
        toast(MESSAGES.newer);
      } else {
        const kept = storage.backup(read.text);
        toast(kept ? MESSAGES.corrupt : `${MESSAGES.corrupt} Kopii starego zapisu nie udało się zachować.`);
      }
    }
    if (loaded) {
      variants = loaded.variants;
      activeId = loaded.activeId;
      savedAt = loaded.savedAt;
      status = 'saved';
    } else {
      const first = freshVariant();
      variants = [first];
      activeId = first.id;
    }
    app.variant.set(variants.find((v) => v.id === activeId));
    if (!loaded) scheduleSave();
  }

  /** Każda zmiana wariantu w rdzeniu (edycja, przełączenie, podmiana z zewnątrz) trafia na listę i do zapisu. */
  function onVariantChange({ variant }) {
    if (!variant || typeof variant.id !== 'string') return;
    const index = variants.findIndex((v) => v.id === variant.id);
    if (index >= 0) variants[index] = variant;
    else variants.push(variant);
    activeId = variant.id;
    scheduleSave();
    notify('list');
  }

  // ------------------------------------------------------------------------------------------ operacje
  const find = (id) => variants.find((v) => v.id === id);
  const full = () => variants.length >= LIMITS.variants;
  const fullMessage = `Można mieć najwyżej ${LIMITS.variants} wariantów – usuń któryś, żeby dodać nowy.`;

  const api = {
    /** @returns {{activeId: string, variants: Object[], savedAt: ?string, status: SaveStatus}} */
    getState: () => ({ activeId, variants: [...variants], savedAt, status }),

    /** Przełącza aktywny wariant; rdzeń emituje 'variant:change' z pełnym wariantem. */
    switchTo(id) {
      const target = find(id);
      if (!target) return false;
      if (id !== activeId) app.variant.set(target);
      return true;
    },

    /** Nowy wariant: bez wykończeń, z meblami z projektu. Staje się aktywny. */
    createFromProject() {
      if (full()) return { ok: false, message: fullMessage };
      const v = freshVariant();
      app.variant.set(v);
      return { ok: true, id: v.id };
    },

    /** Kopia bieżącego wariantu (wykończenia, meble, własne materiały). Staje się aktywna. */
    duplicateActive() {
      if (full()) return { ok: false, message: fullMessage };
      const source = app.variant.get();
      const copy = cloneVariant(source);
      copy.id = uniqueId(makeId, new Set(variants.map((v) => v.id)));
      copy.name = uniqueName(cleanName(`${source.name} – kopia`) || 'Kopia', variants.map((v) => v.name));
      app.variant.set(copy);
      return { ok: true, id: copy.id };
    },

    /** Zmiana nazwy; powtórzona nazwa dostaje dopisek „(2)”. */
    rename(id, name) {
      const target = find(id);
      const clean = cleanName(name);
      if (!target || !clean) return false;
      const final = uniqueName(clean, variants.filter((v) => v.id !== id).map((v) => v.name));
      if (final === target.name) return true;
      if (id === activeId) {
        app.variant.update((draft) => {
          draft.name = final;
        });
      } else {
        variants[variants.indexOf(target)] = { ...target, name: final };
        scheduleSave();
        notify('list');
      }
      return true;
    },

    /** Usuwa wariant. Ostatniego nie da się usunąć. Po usunięciu aktywnego aktywny staje się sąsiedni. */
    remove(id) {
      const index = variants.findIndex((v) => v.id === id);
      if (index < 0 || variants.length <= 1) return false;
      variants.splice(index, 1);
      if (id === activeId) {
        app.variant.set(variants[Math.min(index, variants.length - 1)]); // → onVariantChange: activeId, zapis, powiadomienie
      } else {
        scheduleSave();
        notify('list');
      }
      return true;
    },

    /**
     * Przygotowuje plik eksportu.
     * @param {'active'|'all'} scope
     * @param {Date} [date]  data do nagłówka i nazwy pliku
     * @returns {{filename: string, text: string, count: number}}
     */
    exportData(scope, date = now()) {
      const list = scope === 'all' ? variants : [find(activeId)];
      const name = scope === 'all' ? 'wszystkie-warianty' : list[0].name;
      return { filename: exportFileName(name, date), text: JSON.stringify(buildExport(list, date), null, 1), count: list.length };
    },

    /**
     * Import z tekstu pliku. Zły plik → { ok: false, message } bez żadnej zmiany stanu.
     * Pojedynczy wariant staje się aktywny; paczka tylko dopisuje się do listy.
     */
    importText(text) {
      const parsed = parseImport(text, importCtx());
      if (!parsed.ok) return { ok: false, message: parsed.error };
      if (variants.length + parsed.variants.length > LIMITS.variants) {
        return { ok: false, message: `Po imporcie byłoby ponad ${LIMITS.variants} wariantów – usuń zbędne i spróbuj ponownie.` };
      }
      const incoming = resolveCollisions(variants, parsed.variants, makeId);
      const parts = [`Zaimportowano ${plural(incoming.length, 'wariant', 'warianty', 'wariantów')}.`];
      const r = parsed.report;
      if (r.skippedSurfaces) parts.push(`Pominięto ${plural(r.skippedSurfaces, 'wykończenie', 'wykończenia', 'wykończeń')} powierzchni, których nie ma w tym domu.`);
      const dropped = r.droppedFinishes + r.droppedFurniture + r.droppedMaterials;
      if (dropped) parts.push(`Odrzucono ${plural(dropped, 'błędny element', 'błędne elementy', 'błędnych elementów')}.`);

      if (incoming.length === 1) {
        app.variant.set(incoming[0]);
      } else {
        variants.push(...incoming);
        scheduleSave();
        notify('list');
      }
      return { ok: true, message: parts.join(' '), count: incoming.length, report: r, ids: incoming.map((v) => v.id) };
    },

    flush,
    /** fn('list' | 'save') – zmieniła się lista / aktywny wariant albo stan zapisu. Zwraca funkcję odpinającą. */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      clearTimeout(timer);
      offVariant();
      listeners.clear();
    },
  };

  load();
  const offVariant = app.events.on('variant:change', onVariantChange);
  return api;
}

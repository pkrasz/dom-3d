// Ostatnio używane kolory i materiały. To tylko wygoda interfejsu (nie stan sceny), więc lista żyje
// w localStorage przeglądarki, a nie w wariancie. Brak localStorage (tryb prywatny, testy) → lista w pamięci.
import { normalizeSimple, finishKey } from './finish.js';

const STORAGE_KEY = 'model3d:wykonczenia:ostatnie';
const LIMIT = 12;

export function createRecent(storage = safeStorage()) {
  let items = [];
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) items = parsed.filter((f) => f && (f.kind === 'paint' || f.kind === 'material')).slice(0, LIMIT);
  } catch {
    items = [];
  }

  return {
    /** Dopisuje wykończenie proste (farba / materiał) na początek listy. */
    add(simple) {
      if (!simple || (simple.kind !== 'paint' && simple.kind !== 'material')) return;
      const key = JSON.stringify(simple);
      items = [JSON.parse(key), ...items.filter((f) => JSON.stringify(f) !== key)].slice(0, LIMIT);
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch {
        // pełna pamięć przeglądarki – lista zostaje tylko na czas sesji
      }
    },
    /**
     * Lista do pokazania: tylko poprawne wpisy danego rodzaju (nieistniejące już materiały własne odpadają).
     * @param {'paint'|'material'} kind
     * @param {Array} customMaterials
     */
    list(kind, customMaterials = []) {
      const seen = new Set();
      const out = [];
      for (const f of items) {
        if (f.kind !== kind) continue;
        const norm = normalizeSimple(f, customMaterials);
        if (!norm) continue;
        const key = finishKey(norm, customMaterials);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(norm);
      }
      return out;
    },
  };
}

function safeStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

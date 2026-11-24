// Stan aplikacji + prosty emitter zdarzeń. Bez zależności.

/**
 * Stan aplikacji. Zmiana przez setState({ pole: wartość }) – subskrybenci dostają (stan, poprzedni, zmienionePola).
 * @typedef {Object} AppState
 * @property {'parter'|'poddasze'|'all'} levelId   wybrana kondygnacja ('all' = cały dom, tylko w orbicie)
 * @property {'top'|'orbit'|'walk'} viewMode       tryb widoku
 * @property {boolean} showRoof                    orbita: pokazuj dach, strop i sufity
 * @property {'day'|'evening'} lighting            oświetlenie
 * @property {?{surfaceId?: string, roomId?: string, objectId?: string}} selection  zaznaczenie (ustawiają funkcje)
 * @property {?string} activeTool                   narzędzie, które chwilowo "ma" dotknięcia powierzchni (np. 'furniture', gdy otwarty
 *                                                  jest katalog mebli i dotknięcie podłogi wskazuje miejsce); null = zwykły tryb,
 *                                                  w którym dotknięcie powierzchni otwiera panel wykończeń
 * @property {import('./variant.js').Variant} variant  bieżący wariant wykończenia
 */

/**
 * @param {Object} initial   stan początkowy
 * @param {(next: Object, prev: Object) => Object} [normalize]  poprawia niespójne kombinacje pól przed zapisem
 */
export function createStore(initial, normalize = (s) => s) {
  let state = normalize({ ...initial }, initial);
  const listeners = new Set();
  return {
    getState: () => state,
    /** @param {Partial<AppState> | ((s: AppState) => Partial<AppState>)} patch */
    setState(patch) {
      const prev = state;
      const next = normalize({ ...state, ...(typeof patch === 'function' ? patch(state) : patch) }, prev);
      const changed = Object.keys(next).filter((k) => next[k] !== prev[k]);
      if (!changed.length) return;
      state = next;
      for (const fn of [...listeners]) fn(state, prev, changed);
    },
    /** Zwraca funkcję wypisującą z subskrypcji. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Emitter zdarzeń: on(nazwa, fn) zwraca funkcję odpinającą. */
export function createEmitter() {
  const map = new Map();
  return {
    on(name, fn) {
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(fn);
      return () => map.get(name)?.delete(fn);
    },
    off(name, fn) {
      map.get(name)?.delete(fn);
    },
    emit(name, payload) {
      for (const fn of [...(map.get(name) || [])]) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`Błąd w obsłudze zdarzenia "${name}":`, err);
        }
      }
    },
  };
}

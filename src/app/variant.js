// Model danych wariantu wykończenia. Kształt jest USTALONY – nie zmieniać (korzystają z niego wszystkie funkcje).
// Geometria domu (house.json) nigdy nie jest tu zapisywana; wariant odwołuje się do powierzchni przez surfaceId.

/**
 * @typedef {{kind: 'paint', color: string}} PaintFinish                       kolor '#rrggbb'
 * @typedef {{kind: 'material', id: string, rot: 0|90, grout?: string, groutWidth?: number, size?: [number, number], pattern?: 'straight'|'brick'}} MaterialFinish
 *           id z biblioteki materiałów; size [szer., wys.] w metrach nadpisuje rozmiar płytki/deski;
 *           grout = kolor fugi '#rrggbb', groutWidth = szerokość fugi w metrach (0 = bez fugi) – pola opcjonalne funkcji wykończeń
 * @typedef {{kind: 'split', height: number, lower: Finish, upper: Finish}} SplitFinish
 *           tylko ściany: do wysokości `height` (m od podłogi) wykończenie lower, wyżej upper;
 *           lower / upper to dowolne wykończenie PROSTE (farba albo materiał), bez zagnieżdżania split
 *
 * Pola opcjonalne wolno dodawać (muszą być liczbą, tekstem do 200 znaków albo true/false – inaczej walidacja
 * wariantów je odrzuci przy wczytaniu, patrz features/variants/validate.js); istniejących nie wolno zmieniać.
 * @typedef {PaintFinish | MaterialFinish | SplitFinish} Finish
 *
 * @typedef {Object} FurnitureItem
 * @property {string} id
 * @property {string} type
 * @property {string} levelId
 * @property {number} x      środek w układzie domu (m)
 * @property {number} y
 * @property {number} rot    obrót w stopniach
 * @property {number} w      szerokość (m)
 * @property {number} d      głębokość (m)
 * @property {number} h      wysokość (m)
 * @property {string} color
 * @property {number} [z]    opcjonalnie: wysokość spodu nad posadzką (m) – meble wiszące (funkcja mebli)
 * @property {string} [color2]  opcjonalnie: drugi kolor '#rrggbb' mebli dwukolorowych (np. blat przy frontach); brak = domyślny typu
 *
 * @typedef {{id: string, name: string, dataUrl: string, size: [number, number]}} CustomMaterial   size [szer., wys.] w metrach
 *
 * @typedef {Object} Variant
 * @property {string} id
 * @property {string} name
 * @property {Object<string, Finish>} finishes       klucz = surfaceId, np. 'parter:0/3:wall:2'
 * @property {FurnitureItem[]} furniture
 * @property {CustomMaterial[]} customMaterials
 */

/** Pusty wariant: wszystko w kolorach domyślnych, bez mebli. @returns {Variant} */
export function createEmptyVariant(id = 'wariant-1', name = 'Wariant 1') {
  return { id, name, finishes: {}, furniture: [], customMaterials: [] };
}

/** Kopia wariantu (dane są zwykłym JSON-em). @param {Variant} v @returns {Variant} */
export function cloneVariant(v) {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

/** Format identyfikatorów powierzchni – pomocniczo dla funkcji. */
export const surfaceIds = {
  floor: (levelId, roomId) => `${levelId}:${roomId}:floor`,
  ceiling: (levelId, roomId) => `${levelId}:${roomId}:ceiling`,
  slope: (levelId, roomId, side) => `${levelId}:${roomId}:slope-${side}`, // side: 'N' | 'S'
  wall: (levelId, roomId, edgeIndex) => `${levelId}:${roomId}:wall:${edgeIndex}`,
  chimney: (levelId, roomId, chimneyId) => `${levelId}:${roomId}:chimney:${chimneyId}`,
};

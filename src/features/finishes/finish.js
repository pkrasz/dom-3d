// Czysta logika wykończeń (bez DOM i bez Three.js): walidacja Finish z wariantu, parametry materiału,
// klucze do porównywania stanu, przeliczenia cm ↔ m, szacowanie ilości płytek.
import { libraryMaterial } from './library.js';

/** Rodzaje powierzchni, na których działa podział "do wysokości" (cięcie po v z UV). */
export const SPLIT_KINDS = ['wall', 'chimney', 'slope'];
export const PATTERNS = ['straight', 'brick'];

/** Dopuszczalny rozmiar elementu (m) i fugi (m). */
export const SIZE_MIN = 0.02;
export const SIZE_MAX = 3;
export const GROUT_MAX = 0.03;

/** Zapas na docinki przy szacowaniu płytek. */
export const WASTE = 0.1;

/** '#abc' / '#AABBCC' → '#aabbcc'; cokolwiek innego → null. */
export function normalizeColor(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return null;
}

const validSize = (s) =>
  Array.isArray(s) && s.length === 2 && s.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= SIZE_MIN - 1e-9 && n <= SIZE_MAX + 1e-9);

/**
 * Opis materiału o danym id: z biblioteki albo własny (variant.customMaterials). Nieznany → null.
 * Materiał własny rysowany jest jak płytka ze zdjęcia; domyślnie bez fugi (zdjęcie często już ją zawiera).
 * @returns {?import('./library.js').MaterialDef & {custom?: boolean, dataUrl?: string}}
 */
export function resolveMaterial(id, customMaterials = []) {
  if (typeof id !== 'string') return null;
  const lib = libraryMaterial(id);
  if (lib) return lib;
  const c = (customMaterials || []).find((m) => m && m.id === id);
  if (!c || typeof c.dataUrl !== 'string' || !c.dataUrl.startsWith('data:image/')) return null;
  return {
    id: c.id,
    name: c.name || 'Własny materiał',
    category: 'wlasne',
    use: 'both',
    size: validSize(c.size) ? [c.size[0], c.size[1]] : [0.6, 0.6],
    colors: ['#bdbdb8'],
    texture: { draw: 'tiles', look: 'image' },
    grout: { color: '#d9d9d6', width: 0 },
    pattern: 'straight',
    formats: null,
    custom: true,
    dataUrl: c.dataUrl,
  };
}

/** Krótki podpis zawartości materiału własnego – zmiana zdjęcia lub wymiarów zmienia klucz stanu powierzchni. */
function customSignature(def) {
  const d = def.dataUrl;
  return `${d.length}:${d.slice(-24)}:${def.size.join('x')}`;
}

/**
 * Sprawdza i porządkuje wykończenie proste (farba albo materiał). Błędne / nieznane → null.
 * @returns {?Object}
 */
export function normalizeSimple(finish, customMaterials = []) {
  if (!finish || typeof finish !== 'object') return null;
  if (finish.kind === 'paint') {
    const color = normalizeColor(finish.color);
    return color ? { kind: 'paint', color } : null;
  }
  if (finish.kind === 'material') {
    const def = resolveMaterial(finish.id, customMaterials);
    if (!def) return null;
    const out = { kind: 'material', id: def.id, rot: Number(finish.rot) === 90 ? 90 : 0 };
    const grout = normalizeColor(finish.grout);
    if (grout) out.grout = grout;
    if (validSize(finish.size)) out.size = [finish.size[0], finish.size[1]];
    if (PATTERNS.includes(finish.pattern)) out.pattern = finish.pattern;
    if (typeof finish.groutWidth === 'number' && finish.groutWidth >= 0 && finish.groutWidth <= GROUT_MAX) out.groutWidth = finish.groutWidth;
    return out;
  }
  return null;
}

/**
 * Sprawdza wykończenie powierzchni. Zwraca uporządkowaną kopię albo null (= zostaje wygląd domyślny).
 * Podział 'split' jest dozwolony tylko tam, gdzie v w UV rośnie od posadzki (ściany, kominy, skosy);
 * jego część nieznana / błędna ma wartość null (wtedy ta część wygląda domyślnie).
 * @param {*} finish
 * @param {{kind?: string, customMaterials?: Array}} [context]
 */
export function normalizeFinish(finish, { kind = 'wall', customMaterials = [] } = {}) {
  if (!finish || typeof finish !== 'object') return null;
  if (finish.kind !== 'split') return normalizeSimple(finish, customMaterials);
  if (!SPLIT_KINDS.includes(kind)) return null;
  const height = Number(finish.height);
  if (!Number.isFinite(height) || height <= 0) return null;
  const lower = normalizeSimple(finish.lower, customMaterials);
  const upper = normalizeSimple(finish.upper, customMaterials);
  if (!lower && !upper) return null;
  return { kind: 'split', height, lower, upper };
}

/**
 * Parametry rysowania materiału po uwzględnieniu nadpisań z Finish.
 * @returns {{size: [number, number], rot: 0|90, pattern: string, groutColor: string, groutWidth: number}}
 */
export function materialParams(finish, def) {
  const g = def.grout;
  const hasGrout = Boolean(g);
  return {
    size: validSize(finish.size) ? [finish.size[0], finish.size[1]] : [def.size[0], def.size[1]],
    rot: finish.rot === 90 ? 90 : 0,
    pattern: def.texture.draw === 'tiles' ? finish.pattern || def.pattern || 'straight' : 'straight',
    groutColor: hasGrout ? normalizeColor(finish.grout) || g.color : '#000000',
    groutWidth: hasGrout ? (typeof finish.groutWidth === 'number' ? finish.groutWidth : g.width) : 0,
  };
}

/** Klucz wykończenia prostego: te same klucze = ten sam wygląd (służy do odświeżania różnicowego). */
export function simpleKey(simple, customMaterials = []) {
  if (!simple) return '-';
  if (simple.kind === 'paint') return `p${simple.color}`;
  const def = resolveMaterial(simple.id, customMaterials);
  if (!def) return '-';
  const p = materialParams(simple, def);
  return `m:${def.id}:${p.size.join('x')}:${p.rot}:${p.pattern}:${p.groutColor}:${p.groutWidth}${def.custom ? `:${customSignature(def)}` : ''}`;
}

/** Klucz stanu powierzchni dla uporządkowanego wykończenia ('' = domyślne). */
export function finishKey(norm, customMaterials = []) {
  if (!norm) return '';
  if (norm.kind === 'split') return `s:${norm.height}|${simpleKey(norm.lower, customMaterials)}|${simpleKey(norm.upper, customMaterials)}`;
  return simpleKey(norm, customMaterials);
}

/** Czy wykończenie (także w części podziału) używa materiału o danym id. */
export function finishUsesMaterial(finish, id) {
  if (!finish || typeof finish !== 'object') return false;
  if (finish.kind === 'material') return finish.id === id;
  if (finish.kind === 'split') return finishUsesMaterial(finish.lower, id) || finishUsesMaterial(finish.upper, id);
  return false;
}

/** Czy materiał pasuje do rodzaju powierzchni (podłoga ↔ reszta). */
export function materialFits(def, surfaceKind) {
  if (!def) return false;
  if (def.use === 'both') return true;
  return surfaceKind === 'floor' ? def.use === 'floor' : def.use === 'wall';
}

// ---------------------------------------------------------------- liczby w interfejsie

/** Tekst z pola (centymetry, przecinek lub kropka) → metry albo null. */
export function parseCm(text) {
  const v = parseNumber(text);
  return v === null ? null : v / 100;
}

/** '12,5' / ' 12.5 ' → 12.5; pusty lub błędny tekst → null. */
export function parseNumber(text) {
  const s = String(text ?? '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** Liczba po polsku: przecinek dziesiętny, bez zbędnych zer. */
export function formatNumber(value, digits = 2) {
  const s = Number(value).toFixed(digits);
  return (digits > 0 ? s.replace(/\.?0+$/, '') : s).replace('.', ',');
}

/** Metry → centymetry do pola tekstowego ('7,5', '60'). */
export const formatCm = (m) => formatNumber(m * 100, 1);

/** 'szer. × wys. cm' */
export const formatSize = (size) => `${formatCm(size[0])} × ${formatCm(size[1])} cm`;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const clampSize = (m) => clamp(m, SIZE_MIN, SIZE_MAX);

/**
 * Orientacyjne zapotrzebowanie na okładzinę.
 * @returns {{areaM2: number, withWasteM2: number, pieces: number}} pole, pole z zapasem 10 %, liczba elementów (z zapasem)
 */
export function tileEstimate(areaM2, size) {
  const withWasteM2 = areaM2 * (1 + WASTE);
  const one = size[0] * size[1];
  return { areaM2, withWasteM2, pieces: one > 0 ? Math.ceil(withWasteM2 / one - 1e-9) : 0 };
}

// Udostępnianie wariantu LINKIEM – CZYSTY moduł (bez DOM, bez localStorage; działa też w Node).
//
// Aplikacja nie ma serwera, więc cały wariant jedzie w adresie strony, we fragmencie po znaku #:
//     https://…/dom-3d/#w=1.z.<dane>
//       1      – wersja formatu linku (SHARE_VERSION)
//       z | j  – z: JSON skompresowany deflate-raw (CompressionStream), j: sam JSON w UTF-8
//                (zapas dla przeglądarek bez CompressionStream, np. Safari starsze niż 16.4)
//       <dane> – base64url bez dopełnienia: tylko litery, cyfry, „-” i „_” (komunikatory ich nie psują);
//                ostatnie 3 bajty (4 znaki) to suma kontrolna JSON-u – przekłamany znak w środku linku daje
//                komunikat o uszkodzonym linku zamiast wariantu o innej treści (sam deflate tego nie wykrywa)
// Fragment celowo: przeglądarka nie wysyła go do serwera, więc wariant nie trafia do żadnych logów.
//
// Przed kodowaniem wariant jest zapisywany zwięźle (compactVariant): identyczne wykończenia są grupowane,
// meble to krótkie tablice, liczby są zaokrąglane do 4 miejsc (tak samo robi funkcja mebli – round4),
// a pola równe domyślnym (rot: 0 materiału) są pomijane. Po odczycie wariant jest równoważny wysłanemu.
//
// Link to dane z zewnątrz: dekoder niczego nie zakłada, nigdy nie rzuca wyjątku, a wynik i tak przechodzi potem
// przez walidację importu (validate.js → parseImport) – robi to kontroler.
import { CURRENT_VERSION } from './validate.js';

export const SHARE_PREFIX = 'w=';
export const SHARE_VERSION = 1;

export const SHARE_LIMITS = {
  // Najdłuższy CAŁY adres, jaki wysyłamy. Przeglądarki przyjmują znacznie więcej, ale komunikatory i klawiatury
  // telefonów potrafią ucinać albo nie podlinkować bardzo długich adresów – 6000 znaków przechodzi bezpiecznie.
  urlChars: 6000,
  // Najdłuższe dane, jakie w ogóle próbujemy czytać z linku (z zapasem ponad to, co sami wysyłamy).
  payloadChars: 8000,
  // Najwięcej bajtów JSON-u po dekompresji. 8000 znaków deflate potrafi się rozwinąć do megabajtów
  // („bomba dekompresyjna”), więc czytanie strumienia przerywamy zaraz po przekroczeniu tego limitu.
  jsonBytes: 300_000,
};

export const SHARE_MESSAGES = {
  damaged: 'Link do wariantu jest uszkodzony lub niepełny',
  version: 'Ten link pochodzi z nowszej wersji aplikacji – odśwież stronę i otwórz go ponownie.',
  unsupported: 'Ta przeglądarka jest za stara, żeby otworzyć ten link – poproś o wysłanie wariantu plikiem.',
  customMaterials: 'Ten wariant ma własne zdjęcia płytek – nie zmieszczą się w linku. Wyślij go jako plik.',
  tooLong: 'Ten wariant jest za duży na link. Wyślij go jako plik.',
  failed: 'Nie udało się przygotować linku. Wyślij wariant jako plik.',
};

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const round4 = (n) => Math.round(n * 1e4) / 1e4;

/** Kopia zwykłego JSON-u z liczbami zaokrąglonymi do 4 miejsc po przecinku. */
function roundDeep(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? round4(v) : 0;
  if (Array.isArray(v)) return v.map(roundDeep);
  if (isObject(v)) {
    const out = {};
    for (const key of Object.keys(v)) out[key] = roundDeep(v[key]);
    return out;
  }
  return v;
}

/** Wykończenie do linku: zaokrąglone, bez pól równych domyślnym (walidacja odtwarza rot: 0). */
function compactFinish(finish) {
  const out = roundDeep(finish);
  if (!isObject(out)) return out;
  if (out.kind === 'material' && out.rot === 0) delete out.rot;
  if (out.kind === 'split') {
    if (isObject(finish.lower)) out.lower = compactFinish(finish.lower);
    if (isObject(finish.upper)) out.upper = compactFinish(finish.upper);
  }
  return out;
}

// stałe pola mebla – w linku jadą jako kolejne pozycje tablicy
const FURNITURE_KEYS = ['id', 'type', 'levelId', 'x', 'y', 'rot', 'w', 'd', 'h', 'color'];

/**
 * Zwięzły zapis wariantu (bez własnych materiałów – te nie mieszczą się w linku):
 *   { v: wersja formatu danych, i: id, n: nazwa,
 *     f: [[wykończenie, surfaceId, surfaceId, …], …]      – jedno wykończenie + wszystkie powierzchnie, które je mają
 *     m: [[id, type, levelId, x, y, rot, w, d, h, kolor | 0, { pola dodatkowe }?], …] }
 * @param {import('../../app/variant.js').Variant} variant
 */
export function compactVariant(variant) {
  const out = { v: CURRENT_VERSION, i: variant.id, n: variant.name };

  const groups = new Map(); // JSON wykończenia → [wykończenie, ...surfaceId]
  for (const surfaceId of Object.keys(variant.finishes || {}).sort()) {
    const finish = compactFinish(variant.finishes[surfaceId]);
    const key = JSON.stringify(finish);
    if (!groups.has(key)) groups.set(key, [finish]);
    groups.get(key).push(surfaceId);
  }
  if (groups.size) out.f = [...groups.values()];

  const furniture = (variant.furniture || []).map((item) => {
    const rounded = roundDeep(item);
    const row = FURNITURE_KEYS.map((key) => rounded[key] ?? 0);
    const extras = {};
    for (const key of Object.keys(rounded)) if (!FURNITURE_KEYS.includes(key)) extras[key] = rounded[key];
    if (Object.keys(extras).length) row.push(extras);
    return row;
  });
  if (furniture.length) out.m = furniture;
  return out;
}

/**
 * Odwrotność compactVariant: surowy (jeszcze NIEsprawdzony) wariant albo null, gdy układ danych się nie zgadza.
 * Wynik musi przejść przez walidację importu.
 */
export function expandVariant(compact) {
  if (!isObject(compact)) return null;
  // bez prototypu: klucz '__proto__' z linku zostaje zwykłym polem (walidacja go odrzuci), a nie zmienia obiektu
  const finishes = Object.create(null);
  if ('f' in compact) {
    if (!Array.isArray(compact.f)) return null;
    for (const group of compact.f) {
      if (!Array.isArray(group) || !isObject(group[0])) return null;
      for (const surfaceId of group.slice(1)) {
        if (typeof surfaceId !== 'string') return null;
        finishes[surfaceId] = group[0];
      }
    }
  }
  const furniture = [];
  if ('m' in compact) {
    if (!Array.isArray(compact.m)) return null;
    for (const row of compact.m) {
      if (!Array.isArray(row)) return null;
      const extras = row[FURNITURE_KEYS.length];
      const item = isObject(extras) ? { ...extras } : {};
      FURNITURE_KEYS.forEach((key, i) => {
        item[key] = row[i];
      });
      if (item.color === 0) delete item.color;
      furniture.push(item);
    }
  }
  return { id: compact.i, name: compact.n, finishes, furniture, customMaterials: [] };
}

// ---------------------------------------------------------------------------------------------- base64url

/** @param {Uint8Array} bytes */
export function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @returns {?Uint8Array} null, gdy tekst nie jest poprawnym base64url */
export function fromBase64Url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------- kompresja

class LimitError extends Error {}

/**
 * Przepuszcza bajty przez strumień (kompresja albo dekompresja) i zbiera wynik.
 * Po przekroczeniu `limit` bajtów wyniku czytanie jest PRZERYWANE – reszta danych nie jest rozpakowywana.
 */
async function pump(stream, bytes, limit) {
  const writer = stream.writable.getWriter();
  // błędy zapisu wracają też przez reader.read() – tutaj tylko je wyciszamy, żeby nie było „unhandled rejection”
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      reader.cancel().catch(() => {});
      writer.abort().catch(() => {});
      throw new LimitError('za dużo danych');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- suma kontrolna

const CHECK_BYTES = 3;

/**
 * Suma kontrolna bajtów JSON-u (FNV-1a, 32 bity złożone do 24). To ochrona przed PRZYPADKOWYM przekłamaniem linku,
 * nie zabezpieczenie – bezpieczeństwo daje walidacja importu.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array} 3 bajty
 */
export function shareChecksum(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) h = Math.imul(h ^ bytes[i], 0x01000193);
  h = (h ^ (h >>> 24)) >>> 0;
  return new Uint8Array([(h >>> 16) & 255, (h >>> 8) & 255, h & 255]);
}

/** Dane linku: treść (JSON albo JSON po kompresji) + suma kontrolna JSON-u → base64url. */
function seal(body, jsonBytes) {
  const out = new Uint8Array(body.length + CHECK_BYTES);
  out.set(body);
  out.set(shareChecksum(jsonBytes), body.length);
  return toBase64Url(out);
}

// ---------------------------------------------------------------------------------------------- kodowanie

/**
 * Wariant → dane do fragmentu adresu ('1.z.…' albo '1.j.…').
 * @param {import('../../app/variant.js').Variant} variant
 * @param {{streams?: {CompressionStream?: Function}}} [options]  streams podmieniane w testach (domyślnie globalThis)
 * @returns {Promise<string>}
 */
export async function encodeVariant(variant, { streams = globalThis } = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(compactVariant(variant)));
  if (typeof streams.CompressionStream === 'function') {
    try {
      const packed = await pump(new streams.CompressionStream('deflate-raw'), bytes, Infinity);
      return `${SHARE_VERSION}.z.${seal(packed, bytes)}`;
    } catch {
      // np. przeglądarka zna CompressionStream, ale nie format 'deflate-raw' → zapis bez kompresji
    }
  }
  return `${SHARE_VERSION}.j.${seal(bytes, bytes)}`;
}

const fail = (reason) => ({ ok: false, reason, message: SHARE_MESSAGES[reason] });

/**
 * Dane z fragmentu adresu → surowy wariant (do walidacji importu). Nigdy nie rzuca wyjątku.
 * @param {string} payload  tekst po 'w=' (np. '1.z.…')
 * @param {{streams?: {DecompressionStream?: Function}}} [options]
 * @returns {Promise<{ok: true, variant: Object, dataVersion: number}
 *          | {ok: false, reason: 'damaged'|'version'|'unsupported', message: string}>}
 */
export async function decodeShare(payload, { streams = globalThis } = {}) {
  try {
    if (typeof payload !== 'string' || payload.length > SHARE_LIMITS.payloadChars) return fail('damaged');
    // Komunikatory i ręczne wklejanie potrafią dokleić na końcu kropkę, nawias, cudzysłów albo „%20” – poprawne dane
    // nigdy nie kończą się znakiem spoza alfabetu base64url, więc taki ogon można bezpiecznie obciąć.
    const text = payload.trim().replace(/(?:%[0-9A-Fa-f]{2}|[^A-Za-z0-9_-])+$/, '');
    const match = /^(\d{1,4})\.([A-Za-z0-9]+)\.([A-Za-z0-9_-]*)$/.exec(text);
    if (!match) return fail('damaged');
    const [, version, format, data] = match;
    if (Number(version) !== SHARE_VERSION || (format !== 'z' && format !== 'j')) return fail('version');
    const sealed = fromBase64Url(data);
    if (!sealed || sealed.length <= CHECK_BYTES) return fail('damaged');
    let bytes = sealed.subarray(0, sealed.length - CHECK_BYTES);
    const check = sealed.subarray(sealed.length - CHECK_BYTES);
    if (format === 'z') {
      if (typeof streams.DecompressionStream !== 'function') return fail('unsupported');
      let stream;
      try {
        stream = new streams.DecompressionStream('deflate-raw');
      } catch {
        return fail('unsupported');
      }
      bytes = await pump(stream, bytes, SHARE_LIMITS.jsonBytes); // ucięty strumień albo za dużo danych → wyjątek → 'damaged'
    }
    if (bytes.length > SHARE_LIMITS.jsonBytes) return fail('damaged');
    if (shareChecksum(bytes).some((b, i) => b !== check[i])) return fail('damaged'); // przekłamany znak w linku
    const compact = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!isObject(compact)) return fail('damaged');
    const dataVersion = compact.v;
    if (!Number.isInteger(dataVersion) || dataVersion < 1) return fail('damaged');
    if (dataVersion > CURRENT_VERSION) return fail('version');
    const variant = expandVariant(compact);
    return variant ? { ok: true, variant, dataVersion } : fail('damaged');
  } catch {
    return fail('damaged');
  }
}

// ---------------------------------------------------------------------------------------------- adres

// 'w=' albo 'w%3D' – niektóre komunikatory i przeglądarki wbudowane kodują znak równości procentowo
const PREFIX_RE = /^w(?:=|%3d)/i;

/** Dane wariantu z fragmentu adresu ('#w=…' → '…') albo null, gdy fragment nie jest linkiem do wariantu. */
export function readShareFragment(hash) {
  if (typeof hash !== 'string') return null;
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  const prefix = PREFIX_RE.exec(text);
  return prefix ? text.slice(prefix[0].length) : null;
}

/**
 * Dane wariantu z WKLEJONEGO tekstu: sam link, cała wiadomość z linkiem w środku albo same dane ('1.z.…').
 * @returns {?string} tekst po 'w=' albo null, gdy w tekście nie ma linku do wariantu
 */
export function extractSharePayload(text) {
  if (typeof text !== 'string') return null;
  const inLink = /#w(?:=|%3d)(\S*)/i.exec(text);
  if (inLink) return inLink[1];
  const trimmed = text.trim();
  const bare = readShareFragment(trimmed);
  if (bare !== null) return bare.split(/\s/)[0];
  return /^\d{1,4}\.[A-Za-z0-9]+\.\S+$/.test(trimmed) ? trimmed : null;
}

/** Czy któreś wykończenie korzysta z własnego materiału (zdjęcia płytki) zapisanego w wariancie? */
export function usesCustomMaterials(variant) {
  const custom = new Set((variant.customMaterials || []).map((m) => m.id));
  if (!custom.size) return false;
  const uses = (f) => isObject(f) && ((f.kind === 'material' && custom.has(f.id)) || (f.kind === 'split' && (uses(f.lower) || uses(f.upper))));
  return Object.values(variant.finishes || {}).some(uses);
}

/**
 * Buduje link do wariantu.
 * @param {import('../../app/variant.js').Variant} variant
 * @param {{baseUrl: string, streams?: Object}} options  baseUrl = location.origin + location.pathname (strona działa w podkatalogu)
 * @returns {Promise<{ok: true, url: string} | {ok: false, reason: 'customMaterials'|'tooLong'|'failed', message: string}>}
 */
export async function createShareLink(variant, { baseUrl, streams = globalThis }) {
  try {
    if (usesCustomMaterials(variant)) return fail('customMaterials');
    const url = `${baseUrl}#${SHARE_PREFIX}${await encodeVariant(variant, { streams })}`;
    return url.length > SHARE_LIMITS.urlChars ? fail('tooLong') : { ok: true, url };
  } catch {
    return fail('failed');
  }
}

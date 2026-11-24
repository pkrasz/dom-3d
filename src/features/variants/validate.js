// Walidacja i oczyszczanie danych wariantów – CZYSTY moduł (bez DOM, bez localStorage, bez zegara).
// Wszystko, co przychodzi z zewnątrz (plik importu, zapis w localStorage, meble startowe), przechodzi tędy
// i wychodzi jako zwykły, bezpieczny JSON o kształcie z src/app/variant.js.
//
// Zasada dla Finish i FurnitureItem: pola znane sprawdzamy dokładnie, a pola DODATKOWE (dopisane przez inne
// funkcje, np. FurnitureItem.z albo Finish.grout / pattern) przepuszczamy, o ile są prostą wartością:
// liczbą, krótkim tekstem albo true/false. Obiekty zagnieżdżone przechodzą tylko jako lower / upper (podział
// ściany) i size (para liczb). Na poziomie wariantu i materiału własnego nieznane pola są odrzucane.

export const APP_ID = 'model3d-dom';
/** Wersja formatu zapisu (localStorage i plik eksportu). Zmiana formatu = nowa wersja + wpis w MIGRATIONS. */
export const CURRENT_VERSION = 1;

export const LIMITS = {
  fileChars: 24_000_000, // największy plik importu (znaki JSON-u)
  variants: 30, // wariantów w aplikacji i w jednym pliku
  finishes: 2000, // wykończeń w wariancie
  furniture: 500, // mebli w wariancie
  customMaterials: 60, // własnych materiałów w wariancie
  dataUrlChars: 4_000_000, // jedna własna tekstura (data URL)
  nameChars: 60,
  idChars: 80,
  surfaceIdChars: 120,
  textChars: 200, // tekstowe pola dodatkowe
  extraFields: 24, // pól dodatkowych w jednym obiekcie
  sizeM: 20, // największy wymiar (m) – płytka, mebel
  coordM: 200, // największa współrzędna (m)
  number: 1e6, // liczbowe pola dodatkowe: |wartość| ≤ …
};

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
// tylko obrazy rastrowe w base64 – bez SVG (może zawierać skrypty) i bez adresów zewnętrznych
const DATA_URL_RE = /^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,[A-Za-z0-9+/]+={0,2}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// znaki sterujące oraz < > (tekst może trafić do HTML-a innej funkcji)
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS_RE = /[\u0000-\u001f\u007f<>]/g;
const ROTATIONS = [0, 90, 180, 270];

export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isColor = (v) => typeof v === 'string' && COLOR_RE.test(v);

/** Tekst bez znaków sterujących i nawiasów ostrych, przycięty; null gdy pusty, za długi albo nie-tekst. */
export function cleanText(v, maxChars) {
  if (typeof v !== 'string' || v.length > maxChars * 4) return null;
  const s = v.replace(UNSAFE_CHARS_RE, '').trim();
  return s && s.length <= maxChars ? s : null;
}

/** Nazwa wariantu wpisana przez użytkownika: oczyszczona i przycięta do limitu; null gdy pusta. */
export function cleanName(v) {
  if (typeof v !== 'string') return null;
  const s = v.slice(0, 1000).replace(UNSAFE_CHARS_RE, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.nameChars).trim();
  return s || null;
}

const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);

/** Para dodatnich wymiarów [szer., wys.] w metrach albo null. */
function sizePair(v) {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const a = num(v[0], 0.001, LIMITS.sizeM);
  const b = num(v[1], 0.001, LIMITS.sizeM);
  return a === undefined || b === undefined ? null : [a, b];
}

/**
 * Przepisuje do `out` pola dodatkowe (spoza `known`) będące prostymi wartościami.
 * Obiekty i tablice są pomijane – jedyny wyjątek to `size` (para liczb).
 */
function copyExtras(raw, out, known) {
  let count = 0;
  for (const key of Object.keys(raw)) {
    if (known.includes(key) || FORBIDDEN_KEYS.has(key) || !KEY_RE.test(key)) continue;
    if (count >= LIMITS.extraFields) break;
    const v = raw[key];
    let clean;
    if (key === 'size') clean = sizePair(v) ?? undefined;
    else if (typeof v === 'number') clean = num(v, -LIMITS.number, LIMITS.number);
    else if (typeof v === 'boolean') clean = v;
    else if (typeof v === 'string') clean = v === '' ? '' : cleanText(v, LIMITS.textChars) ?? undefined;
    if (clean === undefined) continue;
    out[key] = clean;
    count += 1;
  }
  return out;
}

/**
 * Wykończenie powierzchni: paint / material / split. Podział (split) nie może zawierać kolejnego podziału.
 * @returns {?Object} oczyszczone wykończenie albo null, gdy nie da się go uratować
 */
export function sanitizeFinish(raw, depth = 0) {
  if (!isPlainObject(raw)) return null;
  if (raw.kind === 'paint') {
    if (!isColor(raw.color)) return null;
    return copyExtras(raw, { kind: 'paint', color: raw.color }, ['kind', 'color', 'lower', 'upper']);
  }
  if (raw.kind === 'material') {
    const id = cleanText(raw.id, LIMITS.idChars);
    if (!id) return null;
    const rot = ROTATIONS.includes(raw.rot) ? raw.rot : 0;
    return copyExtras(raw, { kind: 'material', id, rot }, ['kind', 'id', 'rot', 'lower', 'upper']);
  }
  if (raw.kind === 'split') {
    if (depth > 0) return null; // bez zagnieżdżania podziałów
    const height = num(raw.height, 0.01, 10);
    const lower = sanitizeFinish(raw.lower, depth + 1);
    const upper = sanitizeFinish(raw.upper, depth + 1);
    if (height === undefined || !lower || !upper) return null;
    return copyExtras(raw, { kind: 'split', height, lower, upper }, ['kind', 'height', 'lower', 'upper', 'size']);
  }
  return null;
}

/**
 * @typedef {Object} SanitizeContext
 * @property {() => string} makeId                     generator identyfikatorów (wstrzykiwany)
 * @property {?(Set<string>|string[])} [levelIds]      kondygnacje tego domu; meble z innych są pomijane
 * @property {?Set<string>} [surfaceIds]               powierzchnie tego domu; wykończenia innych są pomijane i liczone
 */

/** Mebel. @returns {?Object} */
export function sanitizeFurnitureItem(raw, ctx, usedIds = new Set()) {
  if (!isPlainObject(raw)) return null;
  const type = cleanText(raw.type, LIMITS.idChars);
  const levelId = cleanText(raw.levelId, LIMITS.idChars);
  if (!type || !levelId) return null;
  if (ctx.levelIds && ![...ctx.levelIds].includes(levelId)) return null;
  const x = num(raw.x, -LIMITS.coordM, LIMITS.coordM);
  const y = num(raw.y, -LIMITS.coordM, LIMITS.coordM);
  const w = num(raw.w, 0.001, LIMITS.sizeM);
  const d = num(raw.d, 0.001, LIMITS.sizeM);
  const h = num(raw.h, 0.001, LIMITS.sizeM);
  if ([x, y, w, d, h].includes(undefined)) return null;
  const rot = num(raw.rot, -3600, 3600) ?? 0;
  let id = cleanText(raw.id, LIMITS.idChars);
  if (!id || usedIds.has(id)) id = ctx.makeId(); // brak albo powtórzony identyfikator → nowy
  usedIds.add(id);
  const out = { id, type, levelId, x, y, rot, w, d, h };
  if (isColor(raw.color)) out.color = raw.color;
  return copyExtras(raw, out, ['id', 'type', 'levelId', 'x', 'y', 'rot', 'w', 'd', 'h', 'color', 'size', 'lower', 'upper']);
}

/** Lista mebli (np. meble startowe z projektu): zwraca tylko poprawne pozycje. */
export function sanitizeFurnitureList(list, ctx) {
  if (!Array.isArray(list)) return [];
  const used = new Set();
  const out = [];
  for (const raw of list.slice(0, LIMITS.furniture)) {
    const item = sanitizeFurnitureItem(raw, ctx, used);
    if (item) out.push(item);
  }
  return out;
}

/** Własny materiał (tekstura użytkownika jako data URL). @returns {?Object} */
export function sanitizeCustomMaterial(raw, usedIds = new Set()) {
  if (!isPlainObject(raw)) return null;
  const id = cleanText(raw.id, LIMITS.idChars);
  const name = cleanText(raw.name, LIMITS.nameChars);
  const size = sizePair(raw.size);
  const url = raw.dataUrl;
  if (!id || usedIds.has(id) || !size) return null;
  if (typeof url !== 'string' || url.length > LIMITS.dataUrlChars || !DATA_URL_RE.test(url)) return null;
  usedIds.add(id);
  return { id, name: name || 'Własny materiał', dataUrl: url, size };
}

const emptyReport = () => ({ skippedSurfaces: 0, droppedFinishes: 0, droppedFurniture: 0, droppedMaterials: 0 });

/**
 * Wariant: zwraca oczyszczoną kopię i raport, co pominięto.
 * @param {*} raw
 * @param {SanitizeContext} ctx
 * @returns {?{variant: import('../../app/variant.js').Variant, report: ReturnType<typeof emptyReport>}}
 */
export function sanitizeVariant(raw, ctx) {
  if (!isPlainObject(raw)) return null;
  const report = emptyReport();
  const variant = {
    id: cleanText(raw.id, LIMITS.idChars) || ctx.makeId(),
    name: cleanName(raw.name) || 'Wariant',
    finishes: {},
    furniture: [],
    customMaterials: [],
  };

  if (isPlainObject(raw.finishes)) {
    let kept = 0;
    for (const surfaceId of Object.keys(raw.finishes)) {
      if (FORBIDDEN_KEYS.has(surfaceId) || surfaceId.length > LIMITS.surfaceIdChars || cleanText(surfaceId, LIMITS.surfaceIdChars) !== surfaceId) {
        report.droppedFinishes += 1;
      } else if (ctx.surfaceIds && !ctx.surfaceIds.has(surfaceId)) {
        report.skippedSurfaces += 1; // powierzchnia nie istnieje w tym domu
      } else {
        const finish = kept < LIMITS.finishes ? sanitizeFinish(raw.finishes[surfaceId]) : null;
        if (finish) {
          variant.finishes[surfaceId] = finish;
          kept += 1;
        } else report.droppedFinishes += 1;
      }
    }
  }

  if (Array.isArray(raw.furniture)) {
    const used = new Set();
    raw.furniture.forEach((item, i) => {
      const clean = i < LIMITS.furniture ? sanitizeFurnitureItem(item, ctx, used) : null;
      if (clean) variant.furniture.push(clean);
      else report.droppedFurniture += 1;
    });
  }

  if (Array.isArray(raw.customMaterials)) {
    const used = new Set();
    raw.customMaterials.forEach((item, i) => {
      const clean = i < LIMITS.customMaterials ? sanitizeCustomMaterial(item, used) : null;
      if (clean) variant.customMaterials.push(clean);
      else report.droppedMaterials += 1;
    });
  }
  return { variant, report };
}

// ---------------------------------------------------------------------------------------------- migracje

/**
 * Migracje formatu: MIGRATIONS[n] zamienia dane w wersji n na wersję n + 1.
 * Dane to obiekt z polem `variants` (stan z localStorage albo plik eksportu) – oba formaty migrują tak samo.
 * Na razie istnieje tylko wersja 1, więc lista jest pusta. Przykład na przyszłość:
 *   1: (data) => ({ ...data, variants: data.variants.map((v) => ({ ...v, nowePole: [] })) }),
 */
const MIGRATIONS = {};

/**
 * Doprowadza dane do bieżącej wersji.
 * @returns {{ok: true, data: Object} | {ok: false, reason: 'newer' | 'invalid', version?: number}}
 */
export function migrate(data, migrations = MIGRATIONS, target = CURRENT_VERSION) {
  let version = data?.version;
  if (!Number.isInteger(version) || version < 1) return { ok: false, reason: 'invalid' };
  if (version > target) return { ok: false, reason: 'newer', version };
  let current = data;
  while (version < target) {
    const step = migrations[version];
    if (typeof step !== 'function') return { ok: false, reason: 'invalid', version };
    current = { ...step(current), version: version + 1 };
    version += 1;
  }
  return { ok: true, data: current };
}

// ---------------------------------------------------------------------------------------------- nazwy i id

/** Nazwa, której jeszcze nie ma: 'Salon', 'Salon (2)', 'Salon (3)'… */
export function uniqueName(name, takenNames) {
  const taken = new Set([...takenNames].map((n) => n.toLocaleLowerCase('pl')));
  const base = name.replace(/\s\(\d+\)$/, '');
  let candidate = name;
  for (let i = 2; taken.has(candidate.toLocaleLowerCase('pl')); i += 1) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, LIMITS.nameChars - suffix.length).trim() + suffix;
  }
  return candidate;
}

/** Identyfikator, którego jeszcze nie ma (gdyby generator się powtórzył, próbujemy ponownie). */
export function uniqueId(makeId, takenIds) {
  for (let i = 0; i < 50; i += 1) {
    const id = makeId();
    if (typeof id === 'string' && id && !takenIds.has(id)) return id;
  }
  let n = takenIds.size + 1;
  while (takenIds.has(`wariant-${n}`)) n += 1;
  return `wariant-${n}`;
}

/**
 * Dopasowuje importowane warianty do już istniejących: kolizja id → nowy id, kolizja nazwy → dopisek.
 * Nie zmienia żadnej z tablic wejściowych.
 */
export function resolveCollisions(existing, incoming, makeId) {
  const ids = new Set(existing.map((v) => v.id));
  const names = existing.map((v) => v.name);
  return incoming.map((v) => {
    const id = ids.has(v.id) ? uniqueId(makeId, ids) : v.id;
    const name = uniqueName(v.name, names);
    ids.add(id);
    names.push(name);
    return { ...v, id, name };
  });
}

// ---------------------------------------------------------------------------------------------- import pliku

const fail = (error) => ({ ok: false, error });
const NEWER_FILE = 'Plik zapisano w nowszej wersji aplikacji – odśwież stronę i spróbuj ponownie.';
/** Zapis z nowszej wersji aplikacji – rozpoznawany po samym numerze, niezależnie od układu pozostałych pól. */
const isNewerVersion = (version) => Number.isInteger(version) && version > CURRENT_VERSION;

/** Czy obiekt wygląda na goły wariant (bez nagłówka pliku)? */
const looksLikeVariant = (o) => isPlainObject(o) && !('app' in o) && (isPlainObject(o.finishes) || Array.isArray(o.furniture));

/**
 * Czyta tekst pliku importu. Nigdy nie rzuca wyjątku.
 * @param {string} text
 * @param {SanitizeContext} ctx
 * @returns {{ok: true, variants: Object[], report: Object} | {ok: false, error: string}}
 */
export function parseImport(text, ctx) {
  if (typeof text !== 'string' || !text.trim()) return fail('Plik jest pusty.');
  if (text.length > LIMITS.fileChars) return fail('Plik jest za duży – to nie wygląda na zapis wariantów.');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('To nie jest poprawny plik JSON z wariantami.');
  }
  if (looksLikeVariant(data)) data = { app: APP_ID, version: 1, variants: [data] };
  if (!isPlainObject(data) || data.app !== APP_ID) return fail('Ten plik nie pochodzi z modelu 3D domu.');
  // wersja PRZED kształtem: nowszy format może nie mieć już tablicy `variants`
  if (isNewerVersion(data.version)) return fail(NEWER_FILE);
  if (!Array.isArray(data.variants)) return fail('W pliku nie ma wariantów.');

  const migrated = migrate({ version: data.version, variants: data.variants });
  if (!migrated.ok) {
    return fail(migrated.reason === 'newer' ? NEWER_FILE : 'Plik ma nieznaną wersję formatu.');
  }
  const list = migrated.data.variants;
  if (!Array.isArray(list) || !list.length) return fail('W pliku nie ma wariantów.');
  if (list.length > LIMITS.variants) return fail(`W pliku jest za dużo wariantów (najwyżej ${LIMITS.variants}).`);

  const report = emptyReport();
  const variants = [];
  const ids = new Set();
  for (const raw of list) {
    const result = sanitizeVariant(raw, ctx);
    if (!result) continue;
    if (ids.has(result.variant.id)) result.variant.id = uniqueId(ctx.makeId, ids); // powtórka w samym pliku
    ids.add(result.variant.id);
    variants.push(result.variant);
    for (const key of Object.keys(report)) report[key] += result.report[key];
  }
  if (!variants.length) return fail('W pliku nie ma żadnego poprawnego wariantu.');
  return { ok: true, variants, report };
}

/**
 * Czyta stan zapisany w localStorage: { version, activeId, variants, savedAt }.
 * @param {string} text
 * @param {SanitizeContext} ctx  bez surfaceIds – własnego zapisu nie przycinamy do bieżącej geometrii
 * @returns {{status: 'ok', state: {activeId: string, variants: Object[], savedAt: ?string}}
 *          | {status: 'newer', version: number} | {status: 'corrupt'}}
 */
export function parseStoredState(text, ctx) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { status: 'corrupt' };
  }
  if (!isPlainObject(data)) return { status: 'corrupt' };
  // wersja PRZED kształtem: zapis nowszej aplikacji (nawet o innym układzie pól) nie jest "uszkodzony" i nie wolno go nadpisać
  if (isNewerVersion(data.version)) return { status: 'newer', version: data.version };
  if (!Array.isArray(data.variants)) return { status: 'corrupt' };
  const migrated = migrate(data);
  if (!migrated.ok) return migrated.reason === 'newer' ? { status: 'newer', version: migrated.version } : { status: 'corrupt' };

  const variants = [];
  const ids = new Set();
  for (const raw of migrated.data.variants.slice(0, LIMITS.variants)) {
    const result = sanitizeVariant(raw, ctx);
    if (!result) continue;
    if (ids.has(result.variant.id)) result.variant.id = uniqueId(ctx.makeId, ids);
    ids.add(result.variant.id);
    variants.push(result.variant);
  }
  if (!variants.length) return { status: 'corrupt' };
  const wanted = migrated.data.activeId;
  const activeId = variants.some((v) => v.id === wanted) ? wanted : variants[0].id;
  const savedAt = typeof migrated.data.savedAt === 'string' && !Number.isNaN(Date.parse(migrated.data.savedAt)) ? migrated.data.savedAt : null;
  return { status: 'ok', state: { activeId, variants, savedAt } };
}

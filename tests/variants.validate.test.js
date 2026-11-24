// Walidacja danych wariantów (czysty moduł): poprawne dane przechodzą bez zmian, złośliwe i uszkodzone są
// oczyszczane albo odrzucane, a import nigdy nie rzuca wyjątku.
import { describe, it, expect } from 'vitest';
import {
  APP_ID, CURRENT_VERSION, LIMITS, cleanName, migrate, parseImport, parseStoredState, resolveCollisions,
  sanitizeCustomMaterial, sanitizeFinish, sanitizeFurnitureItem, sanitizeFurnitureList, sanitizeVariant, uniqueName,
} from '../src/features/variants/validate.js';
import { buildExport, exportFileName, formatDateTime, plural, slug } from '../src/features/variants/io.js';

function idGenerator(prefix = 'id') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const surfaceIds = new Set(['parter:0/3:wall:2', 'parter:0/3:floor', 'poddasze:1/7:slope-S']);
const ctx = () => ({ makeId: idGenerator(), levelIds: ['parter', 'poddasze'], surfaceIds });

const chair = { id: 'm1', type: 'krzeslo', levelId: 'parter', x: 2.5, y: 3.25, rot: 90, w: 0.45, d: 0.5, h: 0.9, color: '#8a6f4d' };
const goodVariant = () => ({
  id: 'v1',
  name: 'Jasny salon',
  finishes: {
    'parter:0/3:floor': { kind: 'material', id: 'deska-dab', rot: 90, grout: '#cccccc', size: [0.2, 1.2], pattern: 'brick' },
    'parter:0/3:wall:2': { kind: 'split', height: 1.2, lower: { kind: 'material', id: 'plytka-biala', rot: 0 }, upper: { kind: 'paint', color: '#f4f1ea' } },
    'poddasze:1/7:slope-S': { kind: 'paint', color: '#AABBCC' },
  },
  furniture: [chair, { ...chair, id: 'm2', type: 'szafka-wiszaca', z: 1.4, label: 'Szafka nad blatem', locked: true }],
  customMaterials: [{ id: 'wlasny-1', name: 'Moja płytka', dataUrl: PNG, size: [0.6, 0.6] }],
});

describe('wykończenia', () => {
  it('przepuszcza poprawne kształty bez zmian (także pola dodatkowe)', () => {
    const v = goodVariant();
    for (const finish of Object.values(v.finishes)) expect(sanitizeFinish(finish)).toEqual(finish);
  });

  it('odrzuca złe kolory, nieznane rodzaje i nie-obiekty', () => {
    for (const bad of [null, 5, 'paint', [], { kind: 'paint' }, { kind: 'paint', color: 'red' }, { kind: 'paint', color: '#fff' },
      { kind: 'paint', color: '#12345g' }, { kind: 'paint', color: 'javascript:alert(1)' }, { kind: 'tapeta', id: 'x' },
      { kind: 'material' }, { kind: 'material', id: '' }, { kind: 'material', id: 7 }]) {
      expect(sanitizeFinish(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('nie pozwala zagnieżdżać podziałów ani podziału bez wysokości', () => {
    const paint = { kind: 'paint', color: '#112233' };
    const split = { kind: 'split', height: 1, lower: paint, upper: paint };
    expect(sanitizeFinish(split)).toEqual(split);
    expect(sanitizeFinish({ ...split, upper: split })).toBeNull();
    expect(sanitizeFinish({ ...split, height: -1 })).toBeNull();
    expect(sanitizeFinish({ ...split, height: 99 })).toBeNull();
    expect(sanitizeFinish({ ...split, height: '1' })).toBeNull();
    expect(sanitizeFinish({ ...split, lower: undefined })).toBeNull();

    // bardzo głębokie zagnieżdżenie nie przepełnia stosu – kończy się na pierwszym poziomie
    let deep = paint;
    for (let i = 0; i < 5000; i += 1) deep = { kind: 'split', height: 1, lower: deep, upper: paint };
    expect(sanitizeFinish(deep)).toBeNull();
  });

  it('czyści pola dodatkowe: zostają liczby, krótkie teksty i size; znikają obiekty, tablice i śmieci', () => {
    const out = sanitizeFinish({
      kind: 'material', id: 'plytka', rot: 45, grout: '#eeeeee', size: [0.3, 0.6], pattern: 'brick', offset: 0.5, flag: true,
      nested: { a: 1 }, list: [1, 2], fn: null, huge: 1e99, nan: NaN, long: 'x'.repeat(5000), html: '<img src=x onerror=alert(1)>',
      'zły klucz': 1, lower: { kind: 'paint', color: '#000000' },
    });
    expect(out).toEqual({ kind: 'material', id: 'plytka', rot: 0, grout: '#eeeeee', size: [0.3, 0.6], pattern: 'brick', offset: 0.5, flag: true, html: 'img src=x onerror=alert(1)' });
    expect(sanitizeFinish({ kind: 'material', id: 'p', rot: 0, size: [0, 1] })).toEqual({ kind: 'material', id: 'p', rot: 0 });
    expect(sanitizeFinish({ kind: 'material', id: 'p', rot: 0, size: [1, 2, 3] })).toEqual({ kind: 'material', id: 'p', rot: 0 });
    expect(sanitizeFinish({ kind: 'material', id: 'p', rot: 0, size: { 0: 1, 1: 2, length: 2 } })).toEqual({ kind: 'material', id: 'p', rot: 0 });
  });

  it('nie daje się zatruć prototypu', () => {
    const raw = JSON.parse('{"kind":"paint","color":"#010203","__proto__":{"polluted":1},"constructor":"x","prototype":"y"}');
    const out = sanitizeFinish(raw);
    expect(out).toEqual({ kind: 'paint', color: '#010203' });
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect({}.polluted).toBeUndefined();
  });
});

describe('meble i własne materiały', () => {
  it('przepuszcza mebel z opcjonalnymi polami (np. z – wysokość zawieszenia)', () => {
    const item = { ...chair, z: 1.4, label: 'Szafka', locked: false };
    expect(sanitizeFurnitureItem(item, ctx())).toEqual(item);
  });

  it('odrzuca meble z błędnymi liczbami, spoza domu i bez typu', () => {
    for (const patch of [{ x: NaN }, { x: '2' }, { y: 1e9 }, { w: 0 }, { d: -1 }, { h: 500 }, { type: '' }, { type: null }, { levelId: 'piwnica' }, { levelId: 3 }]) {
      expect(sanitizeFurnitureItem({ ...chair, ...patch }, ctx()), JSON.stringify(patch)).toBeNull();
    }
    expect(sanitizeFurnitureItem('krzesło', ctx())).toBeNull();
  });

  it('naprawia to, co się da: zły kolor znika, zły obrót = 0, brak lub powtórka id = nowy id', () => {
    const c = ctx();
    const list = sanitizeFurnitureList([{ ...chair, color: 'czerwony', rot: 'bokiem' }, { ...chair }, { ...chair, id: undefined }, 'śmieć', null], c);
    expect(list).toHaveLength(3);
    expect(list[0]).toEqual({ ...chair, color: undefined, rot: 0 });
    expect('color' in list[0]).toBe(false);
    expect(new Set(list.map((i) => i.id)).size).toBe(3);
    expect(sanitizeFurnitureList({ length: 3 }, c)).toEqual([]);
  });

  it('własny materiał: tylko data:image/… (raster, base64), z poprawnym rozmiarem', () => {
    const ok = { id: 'w1', name: 'Płytka', dataUrl: PNG, size: [0.6, 0.3] };
    expect(sanitizeCustomMaterial({ ...ok, extra: 1, onload: 'x' })).toEqual(ok);
    for (const dataUrl of ['https://example.com/a.png', 'javascript:alert(1)', 'data:text/html;base64,PGI+', 'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/png;base64,***', 'data:image/png,abc', '', null, 12, `data:image/png;base64,${'A'.repeat(LIMITS.dataUrlChars)}`]) {
      expect(sanitizeCustomMaterial({ ...ok, dataUrl }), String(dataUrl).slice(0, 40)).toBeNull();
    }
    expect(sanitizeCustomMaterial({ ...ok, size: [0.6] })).toBeNull();
    expect(sanitizeCustomMaterial({ ...ok, size: [0.6, 'x'] })).toBeNull();
    expect(sanitizeCustomMaterial({ ...ok, id: '' })).toBeNull();
    expect(sanitizeCustomMaterial({ ...ok, name: 5 }).name).toBe('Własny materiał');
  });
});

describe('wariant', () => {
  it('poprawny wariant przechodzi bez zmian i bez uwag', () => {
    const { variant, report } = sanitizeVariant(goodVariant(), ctx());
    expect(variant).toEqual(goodVariant());
    expect(report).toEqual({ skippedSurfaces: 0, droppedFinishes: 0, droppedFurniture: 0, droppedMaterials: 0 });
    expect(JSON.parse(JSON.stringify(variant))).toEqual(variant); // zwykły JSON
  });

  it('odrzuca nieznane pola, liczy pominięte powierzchnie i błędne elementy', () => {
    const raw = goodVariant();
    raw.evil = { script: '<script>' };
    raw.finishes['parter:9/9:floor'] = { kind: 'paint', color: '#000000' }; // nie ma takiej powierzchni
    raw.finishes['parter:0/3:floor'] = { kind: 'paint', color: 'nope' };
    raw.furniture.push({ type: 'x' }, 7);
    raw.customMaterials.push({ id: 'zly', name: 'Zły', dataUrl: 'http://x', size: [1, 1] });
    const { variant, report } = sanitizeVariant(raw, ctx());
    expect(Object.keys(variant).sort()).toEqual(['customMaterials', 'finishes', 'furniture', 'id', 'name']);
    expect(Object.keys(variant.finishes).sort()).toEqual(['parter:0/3:wall:2', 'poddasze:1/7:slope-S']);
    expect(report).toEqual({ skippedSurfaces: 1, droppedFinishes: 1, droppedFurniture: 2, droppedMaterials: 1 });
  });

  it('bez listy powierzchni (własny zapis) niczego nie przycina do geometrii', () => {
    const raw = goodVariant();
    raw.finishes['parter:9/9:floor'] = { kind: 'paint', color: '#000000' };
    const { variant, report } = sanitizeVariant(raw, { makeId: idGenerator(), levelIds: ['parter', 'poddasze'] });
    expect(variant.finishes['parter:9/9:floor']).toEqual({ kind: 'paint', color: '#000000' });
    expect(report.skippedSurfaces).toBe(0);
  });

  it('uzupełnia brakujące id i nazwę, a złe typy pól zamienia na puste', () => {
    const { variant } = sanitizeVariant({ finishes: [], furniture: 'x', customMaterials: null, name: '   ' }, ctx());
    expect(variant).toEqual({ id: 'id-1', name: 'Wariant', finishes: {}, furniture: [], customMaterials: [] });
    expect(sanitizeVariant(null, ctx())).toBeNull();
    expect(sanitizeVariant([], ctx())).toBeNull();
  });

  it('pilnuje limitów liczby elementów', () => {
    const raw = goodVariant();
    raw.furniture = Array.from({ length: LIMITS.furniture + 25 }, (_, i) => ({ ...chair, id: `m${i}` }));
    const { variant, report } = sanitizeVariant(raw, ctx());
    expect(variant.furniture).toHaveLength(LIMITS.furniture);
    expect(report.droppedFurniture).toBe(25);
  });

  it('nazwy: czyści znaki sterujące i nawiasy ostre, przycina długość', () => {
    expect(cleanName('  Salon\u0000 <b>jasny</b>\n ')).toBe('Salon bjasny/b');
    expect(cleanName('x'.repeat(500))).toHaveLength(LIMITS.nameChars);
    expect(cleanName('   ')).toBeNull();
    expect(cleanName(12)).toBeNull();
  });
});

describe('kolizje nazw i identyfikatorów', () => {
  it('uniqueName dopisuje kolejny numer', () => {
    expect(uniqueName('Salon', [])).toBe('Salon');
    expect(uniqueName('Salon', ['salon'])).toBe('Salon (2)');
    expect(uniqueName('Salon', ['Salon', 'Salon (2)'])).toBe('Salon (3)');
    expect(uniqueName('Salon (2)', ['Salon', 'Salon (2)'])).toBe('Salon (3)');
    const long = 'n'.repeat(LIMITS.nameChars);
    expect(uniqueName(long, [long]).length).toBeLessThanOrEqual(LIMITS.nameChars);
  });

  it('resolveCollisions: ten sam id → nowy id, ta sama nazwa → dopisek; wejście bez zmian', () => {
    const existing = [{ id: 'a', name: 'Jasny' }, { id: 'b', name: 'Ciemny' }];
    const incoming = [{ id: 'a', name: 'Jasny' }, { id: 'c', name: 'Jasny' }, { id: 'd', name: 'Nowy' }];
    const out = resolveCollisions(existing, incoming, idGenerator('nowy'));
    expect(out).toEqual([{ id: 'nowy-1', name: 'Jasny (2)' }, { id: 'c', name: 'Jasny (3)' }, { id: 'd', name: 'Nowy' }]);
    expect(incoming[0]).toEqual({ id: 'a', name: 'Jasny' });
    expect(existing).toHaveLength(2);
  });

  it('radzi sobie z generatorem, który się powtarza', () => {
    const out = resolveCollisions([{ id: 'a', name: 'A' }], [{ id: 'a', name: 'B' }], () => 'a');
    expect(out[0].id).not.toBe('a');
  });
});

describe('migracje', () => {
  it('bieżąca wersja przechodzi, nowsza i błędna nie', () => {
    expect(migrate({ version: CURRENT_VERSION, variants: [] })).toEqual({ ok: true, data: { version: CURRENT_VERSION, variants: [] } });
    expect(migrate({ version: CURRENT_VERSION + 1, variants: [] })).toEqual({ ok: false, reason: 'newer', version: CURRENT_VERSION + 1 });
    for (const version of [undefined, 0, -1, 1.5, '1', null]) expect(migrate({ version, variants: [] }).ok, String(version)).toBe(false);
  });

  it('wykonuje kolejne kroki migracji aż do wersji docelowej', () => {
    const steps = {
      1: (d) => ({ ...d, variants: d.variants.map((v) => ({ ...v, a: 1 })) }),
      2: (d) => ({ ...d, variants: d.variants.map((v) => ({ ...v, b: 2 })) }),
    };
    expect(migrate({ version: 1, variants: [{ id: 'x' }] }, steps, 3)).toEqual({ ok: true, data: { version: 3, variants: [{ id: 'x', a: 1, b: 2 }] } });
    expect(migrate({ version: 1, variants: [] }, {}, 2).ok).toBe(false); // brak kroku migracji
  });
});

describe('import pliku', () => {
  const file = (variants, patch = {}) => JSON.stringify({ app: APP_ID, version: CURRENT_VERSION, exportedAt: '2026-11-24T10:00:00.000Z', variants, ...patch });

  it('round-trip: eksport → import daje te same warianty', () => {
    const variants = [goodVariant(), { ...goodVariant(), id: 'v2', name: 'Ciemny' }];
    const text = JSON.stringify(buildExport(variants, new Date('2026-11-24T10:00:00Z')));
    const header = JSON.parse(text);
    expect(header.app).toBe(APP_ID);
    expect(header.version).toBe(CURRENT_VERSION);
    expect(header.exportedAt).toBe('2026-11-24T10:00:00.000Z');
    const result = parseImport(text, ctx());
    expect(result.ok).toBe(true);
    expect(result.variants).toEqual(variants);
    expect(result.report.skippedSurfaces).toBe(0);
  });

  it('przyjmuje pojedynczy wariant – w nagłówku albo goły', () => {
    expect(parseImport(file([goodVariant()]), ctx()).variants).toHaveLength(1);
    const bare = parseImport(JSON.stringify(goodVariant()), ctx());
    expect(bare.ok).toBe(true);
    expect(bare.variants[0]).toEqual(goodVariant());
  });

  it('zły plik = czytelny komunikat, nigdy wyjątek', () => {
    const bad = ['', '   ', 'to nie json', '{', 'null', '42', '"tekst"', '[]', '[1,2]', '{}', '{"app":"inna","variants":[]}',
      file([]), file('x'), file([1, 'a', null]), file([goodVariant()], { version: CURRENT_VERSION + 1 }), file([goodVariant()], { version: 'x' }),
      file([goodVariant()], { version: undefined }), file(Array.from({ length: LIMITS.variants + 1 }, goodVariant)),
      undefined, null, 12, {}];
    for (const text of bad) {
      let result;
      expect(() => (result = parseImport(text, ctx())), String(text).slice(0, 40)).not.toThrow();
      expect(result.ok, String(text).slice(0, 40)).toBe(false);
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(5);
    }
    expect(parseImport(file([goodVariant()], { version: CURRENT_VERSION + 1 }), ctx()).error).toMatch(/nowszej wersji/);
    expect(parseImport(' '.repeat(LIMITS.fileChars + 1) + '{}', ctx()).error).toMatch(/za duży/);
  });

  it('liczy pominięte powierzchnie ze wszystkich wariantów i rozdziela powtórzone id w pliku', () => {
    const a = goodVariant();
    a.finishes['parter:9/9:wall:0'] = { kind: 'paint', color: '#000000' };
    const b = goodVariant(); // ten sam id co a
    b.finishes['poddasze:9/9:floor'] = { kind: 'paint', color: '#000000' };
    b.finishes['poddasze:9/8:floor'] = { kind: 'paint', color: '#000000' };
    const result = parseImport(file([a, b, 'śmieć']), ctx());
    expect(result.ok).toBe(true);
    expect(result.variants).toHaveLength(2);
    expect(result.report.skippedSurfaces).toBe(3);
    expect(result.variants[0].id).not.toBe(result.variants[1].id);
  });
});

describe('stan z localStorage', () => {
  const stored = (patch = {}) => JSON.stringify({ version: CURRENT_VERSION, activeId: 'v2', savedAt: '2026-11-24T10:00:00.000Z', variants: [goodVariant(), { ...goodVariant(), id: 'v2', name: 'Drugi' }], ...patch });
  const local = () => ({ makeId: idGenerator(), levelIds: ['parter', 'poddasze'] });

  it('wczytuje poprawny stan', () => {
    const result = parseStoredState(stored(), local());
    expect(result.status).toBe('ok');
    expect(result.state.activeId).toBe('v2');
    expect(result.state.savedAt).toBe('2026-11-24T10:00:00.000Z');
    expect(result.state.variants.map((v) => v.name)).toEqual(['Jasny salon', 'Drugi']);
  });

  it('nieistniejący aktywny → pierwszy; zła data → brak daty', () => {
    const result = parseStoredState(stored({ activeId: 'nie-ma', savedAt: 'wczoraj' }), local());
    expect(result.state.activeId).toBe('v1');
    expect(result.state.savedAt).toBeNull();
  });

  it('rozpoznaje nowszą wersję i uszkodzony zapis', () => {
    expect(parseStoredState(stored({ version: CURRENT_VERSION + 3 }), local())).toEqual({ status: 'newer', version: CURRENT_VERSION + 3 });
    // nowsza wersja o INNYM układzie pól (bez tablicy variants) to nadal "nowsza", nie "uszkodzona"
    const other = JSON.stringify({ version: CURRENT_VERSION + 1, activeId: 'x', warianty: { x: {} } });
    expect(parseStoredState(other, local())).toEqual({ status: 'newer', version: CURRENT_VERSION + 1 });
    const file = parseImport(JSON.stringify({ app: APP_ID, version: CURRENT_VERSION + 1, warianty: {} }), ctx());
    expect(file.ok).toBe(false);
    expect(file.error).toMatch(/nowszej wersji/);
    for (const text of ['{', 'null', '[]', '{"version":1}', stored({ variants: [] }), stored({ variants: [1, 2] }), stored({ version: 'x' })]) {
      expect(parseStoredState(text, local()).status, text.slice(0, 30)).toBe('corrupt');
    }
  });
});

describe('pliki i teksty pomocnicze', () => {
  it('nazwa pliku z nazwy wariantu i daty przekazanej z zewnątrz', () => {
    const date = new Date(2026, 10, 4, 9, 5);
    expect(exportFileName('Jasny salon – wersja Żółta!', date)).toBe('dom-jasny-salon-wersja-zolta-2026-11-04.json');
    expect(exportFileName('///', date)).toBe('dom-wariant-2026-11-04.json');
    expect(slug('../../etc/passwd')).toBe('etc-passwd');
    expect(formatDateTime(date)).toBe('04.11.2026, 09:05');
  });

  it('polska odmiana liczebników', () => {
    const f = (n) => plural(n, 'wariant', 'warianty', 'wariantów');
    expect([1, 2, 4, 5, 12, 22, 25, 112].map(f)).toEqual(['1 wariant', '2 warianty', '4 warianty', '5 wariantów', '12 wariantów', '22 warianty', '25 wariantów', '112 wariantów']);
  });
});

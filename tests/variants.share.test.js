// Udostępnianie wariantu linkiem – część czysta (share.js) w zwykłym Node: kodowanie w obu formatach, limity,
// uszkodzone i złośliwe dane. Odbiór przez kontroler i panel: tests/variants.app.test.js.
import { describe, it, expect } from 'vitest';
import {
  SHARE_LIMITS, SHARE_MESSAGES, compactVariant, createShareLink, decodeShare, encodeVariant, expandVariant,
  extractSharePayload, fromBase64Url, readShareFragment, shareChecksum, toBase64Url, usesCustomMaterials,
} from '../src/features/variants/share.js';
import { APP_ID, CURRENT_VERSION, parseImport } from '../src/features/variants/validate.js';

const NO_STREAMS = {}; // przeglądarka bez CompressionStream / DecompressionStream → format 'j'
const BASE = 'https://przyklad.github.io/dom-3d/';

const idGen = () => {
  let n = 0;
  return () => `gen-${++n}`;
};
/** Ta sama droga co w kontrolerze: dane z linku → walidacja importu. */
function validate(raw, version = CURRENT_VERSION) {
  return parseImport(JSON.stringify({ app: APP_ID, version, variants: [raw] }), { levelIds: ['parter', 'poddasze'], makeId: idGen() });
}
async function roundTrip(variant, streams) {
  const payload = await encodeVariant(variant, streams ? { streams } : undefined);
  const decoded = await decodeShare(payload, streams ? { streams } : undefined);
  expect(decoded.ok).toBe(true);
  const parsed = validate(decoded.variant, decoded.dataVersion);
  expect(parsed.ok).toBe(true);
  return { payload, variant: parsed.variants[0], report: parsed.report };
}

const r4 = (n) => Math.round(n * 1e4) / 1e4;

/** Duży, realistyczny wariant: kilkadziesiąt wykończeń (farby, materiały, podziały ścian) i kilkanaście mebli. */
function bigVariant() {
  const finishes = {};
  const paints = ['#f4f1ea', '#d9cfc1', '#7a8b6f', '#2f3b45'];
  for (let room = 1; room <= 9; room += 1) {
    const level = room <= 5 ? 'parter' : 'poddasze';
    const prefix = `${level}:${room <= 5 ? 0 : 1}/${room}`;
    finishes[`${prefix}:floor`] = room % 3 === 0
      ? { kind: 'material', id: 'gres-oliwkowy', rot: 90, grout: '#8a8a84', groutWidth: 0.003, size: [0.6, 1.2], pattern: 'brick' }
      : { kind: 'material', id: 'deska-dab', rot: 0 };
    finishes[`${prefix}:ceiling`] = { kind: 'paint', color: '#ffffff' };
    for (let wall = 0; wall < 4; wall += 1) {
      finishes[`${prefix}:wall:${wall}`] = room === 3
        ? {
          kind: 'split', height: 1.2,
          lower: { kind: 'material', id: 'plytka-biala', rot: 0, grout: '#cccccc', groutWidth: 0.002, size: [0.3, 0.6] },
          upper: { kind: 'paint', color: paints[wall] },
        }
        : { kind: 'paint', color: paints[(room + wall) % paints.length] };
    }
  }
  finishes['poddasze:1/7:slope-S'] = { kind: 'paint', color: '#f4f1ea' };
  const furniture = [];
  for (let i = 0; i < 14; i += 1) {
    const item = {
      id: `mebel-${i}-a3f9c2d1`, type: ['sofa', 'stol', 'szafa', 'lozko'][i % 4], levelId: i < 9 ? 'parter' : 'poddasze',
      // jak w aplikacji: funkcja mebli zapisuje położenie i wymiary zaokrąglone do 4 miejsc (round4)
      x: r4(1.2345 + i * 0.731), y: r4(7.5 - i * 0.4123), rot: (i * 15) % 360, w: r4(0.6 + i * 0.1), d: 0.45, h: r4(0.75 + (i % 3) * 0.3),
      color: i % 2 ? '#777777' : '#c8b89a',
    };
    if (i % 5 === 0) item.z = 1.4; // mebel wiszący – pole dodatkowe
    furniture.push(item);
  }
  return { id: 'wariant-duzy', name: 'Salon jasny – wersja Żony', finishes, furniture, customMaterials: [] };
}

describe('base64url', () => {
  it('używa tylko znaków bezpiecznych w komunikatorach i odtwarza bajty', () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    for (let len = 0; len <= 256; len += 1) {
      const text = toBase64Url(bytes.subarray(0, len));
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      if (len) expect([...fromBase64Url(text)]).toEqual([...bytes.subarray(0, len)]);
    }
  });

  it('zły tekst → null, bez wyjątku', () => {
    for (const bad of ['', 'a', 'ab+c', 'ab/c', 'ab=c', 'ąę', 'abcde', null, 12]) expect(fromBase64Url(bad)).toBeNull();
  });
});

describe('kodowanie i dekodowanie', () => {
  it('round-trip dużego wariantu w formacie skompresowanym (z)', async () => {
    const source = bigVariant();
    expect(Object.keys(source.finishes).length).toBeGreaterThan(50);
    const { payload, variant, report } = await roundTrip(source);
    expect(payload).toMatch(/^1\.z\.[A-Za-z0-9_-]+$/);
    expect(variant).toEqual(source);
    expect(report).toEqual({ skippedSurfaces: 0, droppedFinishes: 0, droppedFurniture: 0, droppedMaterials: 0 });
    // duży wariant mieści się w linku z dużym zapasem
    expect(`${BASE}#w=${payload}`.length).toBeLessThan(SHARE_LIMITS.urlChars / 2);
  });

  it('round-trip w formacie zapasowym bez kompresji (j)', async () => {
    const source = bigVariant();
    const { payload, variant } = await roundTrip(source, NO_STREAMS);
    expect(payload).toMatch(/^1\.j\.[A-Za-z0-9_-]+$/);
    expect(variant).toEqual(source);
  });

  it('link bez kompresji da się otworzyć w przeglądarce z kompresją i odwrotnie zgłasza czytelny błąd', async () => {
    const source = bigVariant();
    const plain = await encodeVariant(source, { streams: NO_STREAMS });
    expect((await decodeShare(plain)).ok).toBe(true);
    const packed = await encodeVariant(source);
    expect(await decodeShare(packed, { streams: NO_STREAMS })).toEqual({ ok: false, reason: 'unsupported', message: SHARE_MESSAGES.unsupported });
  });

  it('przeglądarka z CompressionStream, ale bez formatu deflate-raw → format j', async () => {
    const streams = {
      CompressionStream: class {
        constructor() {
          throw new TypeError('Unsupported compression format');
        }
      },
    };
    expect(await encodeVariant(bigVariant(), { streams })).toMatch(/^1\.j\./);
  });

  it('polskie znaki i emoji w nazwie przechodzą w obu formatach', async () => {
    const source = { id: 'w1', name: 'Zażółć gęślą jaźń 🏡✨ – łazienka', finishes: {}, furniture: [], customMaterials: [] };
    expect((await roundTrip(source)).variant).toEqual(source);
    expect((await roundTrip(source, NO_STREAMS)).variant).toEqual(source);
  });

  it('liczby niezaokrąglone wracają z dokładnością do 0,1 mm – wariant pozostaje równoważny', async () => {
    const item = { id: 's', type: 'sofa', levelId: 'parter', x: 3.141592653589793, y: 2.718281828459045, rot: 33.333333, w: 2.2000000000000006, d: 0.95, h: 0.8, color: '#777777' };
    const source = { id: 'w1', name: 'Dokładny', finishes: { 'parter:0/1:wall:0': { kind: 'split', height: 1.2000000001, lower: { kind: 'paint', color: '#000000' }, upper: { kind: 'paint', color: '#ffffff' } } }, furniture: [item], customMaterials: [] };
    const { variant } = await roundTrip(source);
    const back = variant.furniture[0];
    for (const key of ['x', 'y', 'rot', 'w', 'd', 'h']) expect(Math.abs(back[key] - item[key])).toBeLessThanOrEqual(0.00005);
    expect(variant.finishes['parter:0/1:wall:0'].height).toBe(1.2);
    expect({ ...back, x: 0, y: 0, rot: 0, w: 0 }).toEqual({ ...item, x: 0, y: 0, rot: 0, w: 0 });
  });

  it('pusty wariant też da się wysłać', async () => {
    const source = { id: 'w1', name: 'Pusty', finishes: {}, furniture: [], customMaterials: [] };
    expect((await roundTrip(source)).variant).toEqual(source);
  });

  it('liczby są zaokrąglane do 4 miejsc, a domyślne rot: 0 nie jedzie w linku', () => {
    const compact = compactVariant({
      id: 'w', name: 'N',
      finishes: { a: { kind: 'material', id: 'm', rot: 0 }, b: { kind: 'material', id: 'm', rot: 0 }, c: { kind: 'material', id: 'm', rot: 90 } },
      furniture: [{ id: 's', type: 'sofa', levelId: 'parter', x: 1.23456789, y: 2, rot: 0, w: 1, d: 1, h: 1 }],
      customMaterials: [],
    });
    expect(compact.f).toEqual([[{ kind: 'material', id: 'm' }, 'a', 'b'], [{ kind: 'material', id: 'm', rot: 90 }, 'c']]);
    expect(compact.m).toEqual([['s', 'sofa', 'parter', 1.2346, 2, 0, 1, 1, 1, 0]]);
    expect(expandVariant(compact).furniture[0]).toEqual({ id: 's', type: 'sofa', levelId: 'parter', x: 1.2346, y: 2, rot: 0, w: 1, d: 1, h: 1 });
  });
});

describe('budowanie linku', () => {
  it('adres strony w podkatalogu + fragment #w=', async () => {
    const link = await createShareLink(bigVariant(), { baseUrl: BASE });
    expect(link.ok).toBe(true);
    expect(link.url.startsWith(`${BASE}#w=1.z.`)).toBe(true);
    expect(link.url.slice(BASE.length)).toMatch(/^#w=[A-Za-z0-9._-]+$/);
    const decoded = await decodeShare(readShareFragment(new URL(link.url).hash));
    expect(decoded.ok).toBe(true);
  });

  it('wariant z własnym zdjęciem płytki → brak linku z powodem', async () => {
    const custom = { id: 'wlasny-1', name: 'Moja płytka', dataUrl: 'data:image/png;base64,AAAA', size: [0.6, 0.6] };
    const variant = { ...bigVariant(), customMaterials: [custom] };
    // zdjęcie wgrane, ale nieużyte – link powstaje (zdjęcie po prostu nie jedzie)
    expect(usesCustomMaterials(variant)).toBe(false);
    expect((await createShareLink(variant, { baseUrl: BASE })).ok).toBe(true);
    // użyte na podłodze albo w dolnej części ściany – tylko plik
    for (const finish of [{ kind: 'material', id: 'wlasny-1', rot: 0 }, { kind: 'split', height: 1, lower: { kind: 'material', id: 'wlasny-1', rot: 0 }, upper: { kind: 'paint', color: '#ffffff' } }]) {
      const used = { ...variant, finishes: { ...variant.finishes, 'parter:0/1:wall:0': finish } };
      expect(await createShareLink(used, { baseUrl: BASE })).toEqual({ ok: false, reason: 'customMaterials', message: SHARE_MESSAGES.customMaterials });
    }
  });

  it('link dłuższy niż limit → brak linku z powodem', async () => {
    const variant = bigVariant();
    // kilkaset mebli o losowych (niekompresowalnych) identyfikatorach
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed.toString(36);
    };
    for (let i = 0; i < 400; i += 1) variant.furniture.push({ id: `${rnd()}${rnd()}${rnd()}`, type: 'sofa', levelId: 'parter', x: i * 0.0137, y: i * 0.0291, rot: i, w: 1, d: 1, h: 1, color: '#777777' });
    expect(await createShareLink(variant, { baseUrl: BASE })).toEqual({ ok: false, reason: 'tooLong', message: SHARE_MESSAGES.tooLong });
    expect(await createShareLink(variant, { baseUrl: BASE, streams: NO_STREAMS })).toMatchObject({ ok: false, reason: 'tooLong' });
  });

  it('readShareFragment rozpoznaje tylko fragment zaczynający się od w=', () => {
    expect(readShareFragment('#w=1.z.abc')).toBe('1.z.abc');
    expect(readShareFragment('w=1.j.abc')).toBe('1.j.abc');
    expect(readShareFragment('#w=')).toBe('');
    for (const other of ['', '#', '#pokoj', '#x=1&w=1.z.abc', undefined, null]) expect(readShareFragment(other)).toBeNull();
  });
});

describe('uszkodzone i złośliwe linki – zawsze błąd bez wyjątku', () => {
  const damaged = { ok: false, reason: 'damaged', message: SHARE_MESSAGES.damaged };
  /** Dane + poprawna suma kontrolna – tak, jak zrobiłby to ktoś, kto ręcznie preparuje link. */
  const sealed = (bytes) => toBase64Url(new Uint8Array([...bytes, ...shareChecksum(bytes)]));
  const jsonPayload = (value) => `1.j.${sealed(new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)))}`;

  it('uszkodzony base64, śmieci, puste dane', async () => {
    for (const bad of ['', '1', '1.z', '1.z.', '1.j.', '1.z.@@@@', '1.z.ab cd', '1.z.a', '1.j.a', 'abc', '1.z.AAAA.BBBB', '%31.z.abc', null, undefined, 42, {}]) {
      expect(await decodeShare(bad)).toEqual(damaged);
    }
    expect(await decodeShare('1.z.' + 'A'.repeat(SHARE_LIMITS.payloadChars))).toEqual(damaged); // za długi – nawet nie dekodujemy
  });

  it('ucięty strumień (link obcięty przez komunikator)', async () => {
    const payload = await encodeVariant(bigVariant());
    for (const cut of [1, 2, 3, 10, Math.floor(payload.length / 2), payload.length - 6]) {
      expect(await decodeShare(payload.slice(0, payload.length - cut))).toEqual(damaged);
    }
    const plain = await encodeVariant(bigVariant(), { streams: NO_STREAMS });
    expect(await decodeShare(plain.slice(0, plain.length - 40))).toEqual(damaged);
  });

  it('przekłamane bajty w środku danych', async () => {
    const payload = await encodeVariant(bigVariant());
    const at = Math.floor(payload.length / 2);
    const broken = `${payload.slice(0, at)}${payload[at] === 'A' ? 'B' : 'A'}${payload[at + 1] === 'A' ? 'B' : 'A'}${payload.slice(at + 2)}`;
    const decoded = await decodeShare(broken);
    // deflate nie ma sumy kontrolnej: albo błąd, albo dane, które i tak trafią do walidacji – nigdy wyjątek
    if (decoded.ok) expect(() => validate(decoded.variant, decoded.dataVersion)).not.toThrow();
    else expect(decoded).toEqual(damaged);
  });

  it('znak doklejony na końcu przez komunikator albo przy wklejaniu (kropka, nawias, cudzysłów…) nie psuje linku', async () => {
    for (const streams of [undefined, NO_STREAMS]) {
      const payload = await encodeVariant(bigVariant(), streams ? { streams } : undefined);
      const clean = await decodeShare(payload, streams ? { streams } : undefined);
      expect(clean.ok).toBe(true);
      for (const suffix of ['.', ')', ',', '!', '?', '>', '"', '”', '%20', ').', '.%0A', ' ', '\n', '.\n']) {
        expect(await decodeShare(payload + suffix, streams ? { streams } : undefined), JSON.stringify(suffix)).toEqual(clean);
      }
    }
    // sam ogon bez danych to nadal uszkodzony link
    expect(await decodeShare('1.z.).')).toEqual(damaged);
  });

  it('suma kontrolna: podmiana dowolnego znaku nigdy nie daje wariantu o INNEJ treści', async () => {
    const variant = { id: 'a', name: 'Kuchnia', finishes: { 'parter:0/1:floor': { kind: 'paint', color: '#112233' } }, furniture: [], customMaterials: [] };
    for (const streams of [undefined, NO_STREAMS]) {
      const options = streams ? { streams } : undefined;
      const payload = await encodeVariant(variant, options);
      const original = JSON.stringify((await decodeShare(payload, options)).variant);
      let rejected = 0;
      for (let at = 4; at < payload.length; at += 1) {
        for (const ch of ['A', 'b', '7', '_']) {
          if (payload[at] === ch) continue;
          const decoded = await decodeShare(payload.slice(0, at) + ch + payload.slice(at + 1), options);
          if (decoded.ok) expect(JSON.stringify(decoded.variant), `znak ${at} → ${ch}`).toBe(original);
          else rejected += 1;
        }
      }
      expect(rejected).toBeGreaterThan(payload.length); // zdecydowana większość podmian jest wykrywana
      // znaki doklejone na końcu danych też są wykrywane
      for (const extra of ['A', 'AA', 'AAAA', 'abcd']) expect(await decodeShare(payload + extra, options)).toEqual(damaged);
    }
    // dane bez sumy kontrolnej (sam JSON) nie przechodzą
    expect(await decodeShare(`1.j.${toBase64Url(new TextEncoder().encode('{"v":1,"i":"a","n":"b"}'))}`)).toEqual(damaged);
  });

  it('prefiks zakodowany procentowo (w%3D) jest rozpoznawany jak w=', () => {
    expect(readShareFragment('#w=1.z.abc')).toBe('1.z.abc');
    expect(readShareFragment('#w%3D1.z.abc')).toBe('1.z.abc');
    expect(readShareFragment('#w%3d1.z.abc')).toBe('1.z.abc');
    expect(readShareFragment('w%3D1.z.abc')).toBe('1.z.abc');
    expect(readShareFragment('#W=1.z.abc')).toBe('1.z.abc');
    for (const other of ['', '#', '#salon', '#w', '#w%3', '#wariant', '#x=w=1', null, undefined, 5]) expect(readShareFragment(other)).toBeNull();
  });

  it('extractSharePayload: link, cała wiadomość z linkiem albo same dane', async () => {
    const payload = await encodeVariant(bigVariant());
    const url = `${BASE}#w=${payload}`;
    for (const text of [url, `  ${url}\n`, `Wariant „Salon” – model 3D domu ${url}`, `Zobacz:\n${url}\ni daj znać`, `${BASE}#w%3D${payload}`, `w=${payload}`, `#w=${payload}`, payload]) {
      expect(extractSharePayload(text), text.slice(0, 40)).toBe(payload);
    }
    // kropka po linku w zdaniu zostaje w danych, ale dekoder ją obcina
    const withDot = extractSharePayload(`Masz: ${url}.`);
    expect((await decodeShare(withDot)).ok).toBe(true);
    for (const none of ['', '   ', 'cześć', BASE, `${BASE}#salon`, 'https://przyklad.pl/?w=1.z.abc', null, undefined, 7]) expect(extractSharePayload(none)).toBeNull();
  });

  it('nieznana wersja albo format → czytelny komunikat', async () => {
    const body = (await encodeVariant(bigVariant())).split('.')[2];
    const version = { ok: false, reason: 'version', message: SHARE_MESSAGES.version };
    expect(await decodeShare(`2.z.${body}`)).toEqual(version);
    expect(await decodeShare(`1.q.${body}`)).toEqual(version);
    expect(await decodeShare(`1.br.${body}`)).toEqual(version);
    // nowsza wersja formatu DANYCH wewnątrz poprawnego linku
    expect(await decodeShare(jsonPayload({ v: CURRENT_VERSION + 1, i: 'a', n: 'b' }))).toEqual(version);
  });

  it('bomba dekompresyjna: czytanie jest przerywane po przekroczeniu limitu', async () => {
    // 50 MB zer pakuje się do ok. 50 kB; żeby zmieścić się w limicie długości linku, bierzemy 5 MB (ok. 6500 znaków)
    const stream = new CompressionStream('deflate-raw');
    const writer = stream.writable.getWriter();
    writer.write(new Uint8Array(5_000_000).fill(32));
    writer.close();
    const packed = new Uint8Array(await new Response(stream.readable).arrayBuffer());
    const payload = `1.z.${toBase64Url(packed)}`;
    expect(payload.length).toBeLessThan(SHARE_LIMITS.payloadChars);
    let produced = 0;
    const counting = {
      DecompressionStream: class {
        constructor(format) {
          const inner = new DecompressionStream(format);
          const counter = new TransformStream({
            transform(chunk, controller) {
              produced += chunk.length;
              controller.enqueue(chunk);
            },
          });
          this.writable = inner.writable;
          this.readable = inner.readable.pipeThrough(counter);
        }
      },
    };
    expect(await decodeShare(payload, { streams: counting })).toEqual(damaged);
    expect(produced).toBeGreaterThan(SHARE_LIMITS.jsonBytes);
    expect(produced).toBeLessThan(5_000_000); // nie rozpakowano całości
  });

  it('za duży JSON bez kompresji, zły UTF-8, nie-JSON, zły kształt', async () => {
    expect(await decodeShare(`1.j.${sealed(new Uint8Array([0xff, 0xfe, 0x7b]))}`)).toEqual(damaged);
    for (const bad of ['to nie json', '[]', '"tekst"', '12', 'null', '{}', '{"v":"1"}', '{"v":0}', '{"v":1,"f":{}}', '{"v":1,"f":[1]}', '{"v":1,"f":[[{"kind":"paint"},5]]}', '{"v":1,"m":"x"}', '{"v":1,"m":[{}]}']) {
      expect(await decodeShare(jsonPayload(bad))).toEqual(damaged);
    }
  });

  it('dane złośliwe (__proto__, złe typy, HTML w nazwie) są czyszczone przez walidację importu', async () => {
    const evil = `{"v":1,"i":{"x":1},"n":"<img src=x onerror=alert(1)>Salon","__proto__":{"polluted":true},
      "f":[[{"kind":"paint","color":"#112233","__proto__":{"polluted":true},"constructor":"x","extra":{"a":1}},"parter:0/1:floor","__proto__","constructor"],
           [{"kind":"paint","color":"javascript:alert(1)"},"parter:0/1:wall:0"],
           [{"kind":"split","height":1,"lower":{"kind":"split","height":1,"lower":{"kind":"paint","color":"#000000"},"upper":{"kind":"paint","color":"#000000"}},"upper":{"kind":"paint","color":"#000000"}},"parter:0/1:wall:1"]],
      "m":[["a","sofa","parter",1,2,0,1,1,1,"#777777",{"__proto__":{"polluted":true},"z":1.5,"note":{"deep":1}}],
           ["b","sofa","parter","1",2,0,1,1,1,0],
           ["c","sofa","piwnica",1,2,0,1,1,1,0],
           [null],
           ["d","sofa","parter",1e9,2,0,1,1,1,0]]}`;
    const decoded = await decodeShare(jsonPayload(evil));
    expect(decoded.ok).toBe(true);
    const parsed = validate(decoded.variant, decoded.dataVersion);
    expect(parsed.ok).toBe(true);
    const v = parsed.variants[0];
    expect({}.polluted).toBeUndefined();
    expect(Object.getPrototypeOf(v.finishes)).toBe(Object.prototype);
    expect(v.id).toBe('gen-1'); // id nie był tekstem → nowy
    expect(v.name).toBe('img src=x onerror=alert(1)Salon');
    expect(v.finishes).toEqual({ 'parter:0/1:floor': { kind: 'paint', color: '#112233' } });
    expect(v.furniture).toEqual([{ id: 'a', type: 'sofa', levelId: 'parter', x: 1, y: 2, rot: 0, w: 1, d: 1, h: 1, color: '#777777', z: 1.5 }]);
    expect(v.customMaterials).toEqual([]);
    expect(parsed.report.droppedFurniture).toBe(4);
    expect(parsed.report.droppedFinishes).toBe(4);
  });

  it('własne materiały dopisane ręcznie do linku są ignorowane', async () => {
    const decoded = await decodeShare(jsonPayload({ v: 1, i: 'a', n: 'b', customMaterials: [{ id: 'x', name: 'x', dataUrl: 'data:image/png;base64,AAAA', size: [1, 1] }], c: [1] }));
    expect(decoded.ok).toBe(true);
    expect(decoded.variant.customMaterials).toEqual([]);
  });
});

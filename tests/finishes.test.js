// Czysta logika wykończeń (bez DOM): cięcie siatki na wysokości, skala tekstur, walidacja Finish, biblioteka.
import { describe, it, expect } from 'vitest';
import { Matrix3, Vector2 } from 'three';
import { model } from './helpers.js';
import { cutByV, mapDrawCount } from '../src/features/finishes/split.js';
import { textureLayout, textureTransform, drawMaterial, MAX_TEXTURE_PX } from '../src/features/finishes/textures.js';
import {
  normalizeFinish, normalizeColor, resolveMaterial, materialParams, finishKey, finishUsesMaterial, materialFits,
  parseCm, parseNumber, formatCm, formatNumber, formatSize, tileEstimate, SIZE_MIN, SIZE_MAX,
} from '../src/features/finishes/finish.js';
import { MATERIALS, CATEGORIES, FORMATS, GROUT_COLORS, libraryMaterial, DEFAULT_SPLIT_MATERIAL } from '../src/features/finishes/library.js';
import { PAINT_GROUPS, paintName } from '../src/features/finishes/palette.js';
import { fitSize, nameFromFile, newCustomId } from '../src/features/finishes/upload.js';
import { createRecent } from '../src/features/finishes/recent.js';

const arraysOf = (mesh) => ({
  position: mesh.geometry.attributes.position.array,
  normal: mesh.geometry.attributes.normal.array,
  uv: mesh.geometry.attributes.uv.array,
});

/** Trójkąty z tablic: pole 3D, pole w UV, zgodność nawinięcia z normalną, zakres v. */
function triStats(a, from = 0, to = a.position.length / 3) {
  let area = 0;
  let uvArea = 0;
  let vMin = Infinity;
  let vMax = -Infinity;
  let flipped = 0;
  for (let i = from; i < to; i += 3) {
    const p = (k) => [a.position[(i + k) * 3], a.position[(i + k) * 3 + 1], a.position[(i + k) * 3 + 2]];
    const t = (k) => [a.uv[(i + k) * 2], a.uv[(i + k) * 2 + 1]];
    const [A, B, C] = [p(0), p(1), p(2)];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    area += Math.hypot(...c) / 2;
    const n = [a.normal[i * 3], a.normal[i * 3 + 1], a.normal[i * 3 + 2]];
    if (c[0] * n[0] + c[1] * n[1] + c[2] * n[2] <= 0) flipped += 1;
    const [ta, tb, tc] = [t(0), t(1), t(2)];
    uvArea += Math.abs((tb[0] - ta[0]) * (tc[1] - ta[1]) - (tb[1] - ta[1]) * (tc[0] - ta[0])) / 2;
    for (const q of [ta, tb, tc]) {
      vMin = Math.min(vMin, q[1]);
      vMax = Math.max(vMax, q[1]);
    }
  }
  return { area, uvArea, vMin, vMax, flipped };
}

const quad = (w, h) => ({
  // prostokąt w × h w płaszczyźnie xz (jak ściana), dwa trójkąty, normalna -y
  position: [0, 0, 0, w, 0, 0, w, 0, h, 0, 0, 0, w, 0, h, 0, 0, h],
  normal: [0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0],
  uv: [0, 0, w, 0, w, h, 0, 0, w, h, 0, h],
});

describe('wykończenia – cięcie siatki na wysokości (split)', () => {
  it('prostokąt 2 × 3 przecięty na 1 m: pola 2 i 4 m², dwie grupy materiałów', () => {
    const cut = cutByV(quad(2, 3), 1);
    expect(cut.lowerArea).toBeCloseTo(2, 9);
    expect(cut.upperArea).toBeCloseTo(4, 9);
    expect(cut.groups.map((g) => g.materialIndex)).toEqual([0, 1]);
    expect(cut.groups[0].start).toBe(0);
    expect(cut.groups[1].start).toBe(cut.groups[0].count);
    expect(cut.groups[0].count + cut.groups[1].count).toBe(cut.position.length / 3);
    const lower = triStats(cut, 0, cut.groups[0].count);
    const upper = triStats(cut, cut.groups[1].start);
    expect(lower.vMax).toBeLessThanOrEqual(1 + 1e-9);
    expect(upper.vMin).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(lower.flipped + upper.flipped).toBe(0); // nawinięcie trójkątów bez zmian – ściana nadal widoczna z tej samej strony
  });

  it('cięcie ponad lub pod całą siatką niczego nie gubi i nie tworzy drugiej części', () => {
    const above = cutByV(quad(2, 3), 5);
    expect(above.upperCount).toBe(0);
    expect(above.lowerCount).toBe(6);
    expect(Array.from(above.position)).toEqual(quad(2, 3).position);
    const below = cutByV(quad(2, 3), -1);
    expect(below.lowerCount).toBe(0);
    expect(below.upperCount).toBe(6);
    // cięcie dokładnie po krawędzi: bez skrawków o zerowym polu
    const edge = cutByV(quad(2, 3), 3);
    expect(edge.upperCount).toBe(0);
    expect(edge.lowerArea).toBeCloseTo(6, 9);
  });

  it('każda ściana, komin i skos domu: pole i pole UV zachowane, części po właściwych stronach', () => {
    const h = model();
    let checked = 0;
    for (const s of h.surfaces.values()) {
      if (!['wall', 'chimney', 'slope'].includes(s.kind)) continue;
      const src = arraysOf(s.mesh);
      const before = triStats(src);
      for (const height of [0.07, 0.6, 1.2, 1.5, 2.0, 2.55, 2.7, 3.4]) {
        const cut = cutByV(src, height, [s.mesh.userData.headerStart, s.mesh.userData.upperStart].filter((b) => b != null));
        const after = triStats(cut);
        expect(cut.lowerArea + cut.upperArea, `${s.id} @${height}`).toBeCloseTo(before.area, 6);
        expect(cut.lowerArea + cut.upperArea, `${s.id} @${height}`).toBeCloseTo(s.areaM2, 4); // siatka jest w float32
        expect(after.area, `${s.id} @${height}`).toBeCloseTo(before.area, 6);
        expect(after.uvArea, `${s.id} @${height} (UV)`).toBeCloseTo(before.uvArea, 6);
        expect(after.flipped, `${s.id} @${height} nawinięcie`).toBe(0);
        expect(cut.position.length / 3).toBeGreaterThanOrEqual(src.position.length / 3); // żaden trójkąt nie znika
        for (const g of cut.groups) {
          const part = triStats(cut, g.start, g.start + g.count);
          if (g.materialIndex === 0) expect(part.vMax, s.id).toBeLessThanOrEqual(height + 1e-5);
          else expect(part.vMin, s.id).toBeGreaterThanOrEqual(height - 1e-5);
        }
        // grupy pokrywają całą siatkę bez dziur i nakładania
        let next = 0;
        for (const g of cut.groups) {
          expect(g.start).toBe(next);
          next += g.count;
        }
        expect(next).toBe(cut.position.length / 3);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(400);
  });

  it('ściana o zmiennej wysokości (szczyt poddasza) i skos: cięcie idzie po v, nie po bryle', () => {
    const h = model();
    const slope = [...h.surfaces.values()].find((s) => s.kind === 'slope');
    const cut = cutByV(arraysOf(slope.mesh), 0.5);
    // skos: v = długość po skosie; pas 0,5 m ma pole = szerokość pasa × 0,5 (minus okna dachowe) – na pewno mniej niż całość
    expect(cut.lowerArea).toBeGreaterThan(0);
    expect(cut.upperArea).toBeGreaterThan(0);
    const lower = triStats(cut, 0, cut.groups.filter((g) => g.materialIndex === 0).reduce((n, g) => n + g.count, 0));
    expect(lower.uvArea).toBeCloseTo(cut.lowerArea, 5); // UV w metrach: pole w UV = pole rzeczywiste
    const gable = [...h.surfaces.values()].filter((s) => s.kind === 'wall' && s.levelId === 'poddasze').sort((a, b) => b.heightM - a.heightM)[0];
    const g = cutByV(arraysOf(gable.mesh), 1.5);
    expect(g.lowerArea + g.upperArea).toBeCloseTo(gable.areaM2, 4);
    expect(g.upperArea).toBeGreaterThan(0);
  });

  it('odcinki ukrywane przez rdzeń (drawRange) zachowują kolejność; granice są przeliczane', () => {
    const h = model();
    const special = [...h.surfaces.values()].filter((s) => s.mesh.userData.headerStart != null || s.mesh.userData.upperStart != null);
    expect(special.length).toBeGreaterThan(0);
    for (const s of special) {
      const src = arraysOf(s.mesh);
      const bounds = [s.mesh.userData.headerStart, s.mesh.userData.upperStart].filter((b) => b != null);
      const cut = cutByV(src, 1.2, bounds);
      for (const b of bounds) {
        const mapped = mapDrawCount(cut.boundaryMap, b);
        expect(Number.isFinite(mapped), s.id).toBe(true);
        // to, co rdzeń rysuje do granicy b, ma po cięciu to samo pole
        expect(triStats(cut, 0, mapped).area, s.id).toBeCloseTo(triStats(src, 0, b).area, 6);
        expect(cut.groups.some((g) => g.start === mapped) || mapped === cut.position.length / 3, s.id).toBe(true);
      }
      expect(mapDrawCount(cut.boundaryMap, Infinity)).toBe(Infinity);
      expect(mapDrawCount(cut.boundaryMap, cut.sourceCount)).toBe(cut.position.length / 3);
    }
  });
});

describe('wykończenia – skala i obrót tekstury', () => {
  /** Przesunięcie we współrzędnych tekstury dla przesunięcia (du, dv) metrów po powierzchni. */
  function texDelta(layout, rot, du, dv) {
    const t = textureTransform(layout, rot);
    const m = new Matrix3().setUvTransform(0, 0, t.repeat[0], t.repeat[1], t.rotation, 0, 0);
    const a = new Vector2(0, 0).applyMatrix3(m);
    const b = new Vector2(du, dv).applyMatrix3(m);
    return [b.x - a.x, b.y - a.y];
  }

  it('płytka 60 × 120: jeden element na 0,60 m wzdłuż u i 1,20 m wzdłuż v', () => {
    const def = libraryMaterial('gres-marmur-bialy');
    const p = materialParams({ kind: 'material', id: def.id, rot: 0 }, def);
    expect(p.size).toEqual([0.6, 1.2]);
    const L = textureLayout(def, p);
    expect(L.cellW).toBeCloseTo(L.nx * 0.6, 12);
    expect(L.cellH).toBeCloseTo(L.ny * 1.2, 12);
    const [du] = texDelta(L, 0, 0.6, 0);
    const [, dv] = texDelta(L, 0, 0, 1.2);
    expect(du).toBeCloseTo(1 / L.nx, 12); // 0,60 m = dokładnie jeden z nx elementów komórki
    expect(dv).toBeCloseTo(1 / L.ny, 12);
    // piksele: elementy mają całkowity rozmiar, więc fugi wypadają równo
    expect(L.pxW).toBe(L.nx * L.ex);
    expect(L.pxH).toBe(L.ny * L.ey);
    expect(L.groutPx).toBeGreaterThanOrEqual(2);
  });

  it('obrót 90°: szerokość elementu układa się wzdłuż v, wysokość wzdłuż u', () => {
    const def = libraryMaterial('gres-marmur-bialy');
    const L = textureLayout(def, materialParams({ rot: 90 }, def));
    const alongV = texDelta(L, 90, 0, 0.6);
    const alongU = texDelta(L, 90, 1.2, 0);
    expect(Math.abs(alongV[0])).toBeCloseTo(1 / L.nx, 12);
    expect(alongV[1]).toBeCloseTo(0, 12);
    expect(Math.abs(alongU[1])).toBeCloseTo(1 / L.ny, 12);
    expect(alongU[0]).toBeCloseTo(0, 12);
  });

  it('własny rozmiar nadpisuje format, cegiełka ma parzystą liczbę rzędów', () => {
    const def = libraryMaterial('metro-biale');
    const p = materialParams({ kind: 'material', id: def.id, rot: 0, size: [0.25, 0.075], pattern: 'brick' }, def);
    const L = textureLayout(def, p);
    expect(L.cellW / L.nx).toBeCloseTo(0.25, 12);
    expect(L.cellH / L.ny).toBeCloseTo(0.075, 12);
    expect(L.ny % 2).toBe(0);
    expect(materialParams({ rot: 0 }, def).pattern).toBe('brick'); // domyślny układ z biblioteki
    expect(materialParams({ rot: 0, pattern: 'straight' }, def).pattern).toBe('straight');
  });

  it('każdy materiał w każdym formacie mieści się w 1024 px i ma dokładny rozstaw', () => {
    for (const def of MATERIALS) {
      const sizes = [def.size, ...(def.formats ? FORMATS[def.formats].map((f) => f.size) : []), [SIZE_MIN, SIZE_MAX], [SIZE_MAX, SIZE_MIN]];
      for (const size of sizes) {
        for (const pattern of ['straight', 'brick']) {
          const p = materialParams({ rot: 0, size, pattern }, def);
          const L = textureLayout(def, p);
          expect(L.pxW, def.id).toBeLessThanOrEqual(MAX_TEXTURE_PX);
          expect(L.pxH, def.id).toBeLessThanOrEqual(MAX_TEXTURE_PX);
          expect(L.pxW, def.id).toBeGreaterThan(0);
          expect(Number.isInteger(L.ex) && Number.isInteger(L.ey), def.id).toBe(true);
          if (def.texture.draw === 'tiles' || def.texture.draw === 'planks') {
            expect(L.cellW, def.id).toBeCloseTo(L.nx * p.size[0], 12);
            expect(L.cellH, def.id).toBeCloseTo(L.ny * p.size[1], 12);
          }
          expect(L.groutPx, def.id).toBeLessThan(Math.min(L.ex, L.ey));
        }
      }
    }
  });

  it('jodełka: komórka 2n × 2n szerokości deski, obrócona o 45°', () => {
    const def = libraryMaterial('jodelka-dab');
    const L = textureLayout(def, materialParams({ rot: 0 }, def));
    expect(L.n).toBe(5);
    expect(L.cellW).toBeCloseTo(2 * 5 * 0.12, 12);
    expect(L.cellH).toBeCloseTo(L.cellW, 12);
    expect(textureTransform(L, 0).rotation).toBeCloseTo(Math.PI / 4, 12);
    expect(textureTransform(L, 90).rotation).toBeCloseTo((3 * Math.PI) / 4, 12);
  });

  it('rysowanie wszystkich materiałów na atrapie kontekstu 2D nie rzuca błędów', () => {
    const calls = { fillRect: 0 };
    const gradient = { addColorStop() {} };
    const ctx = new Proxy({}, {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => gradient;
        if (key === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        return (...args) => {
          if (key === 'fillRect') {
            calls.fillRect += 1;
            for (const a of args) expect(Number.isFinite(a)).toBe(true);
          }
        };
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    });
    for (const def of MATERIALS) {
      for (const pattern of ['straight', 'brick']) {
        const p = materialParams({ rot: 0, pattern }, def);
        expect(() => drawMaterial(ctx, def, p, textureLayout(def, p, 128)), def.id).not.toThrow();
      }
    }
    expect(calls.fillRect).toBeGreaterThan(MATERIALS.length);
  });
});

describe('wykończenia – walidacja Finish', () => {
  const custom = [{ id: 'wlasny-1', name: 'Moja płytka', dataUrl: 'data:image/jpeg;base64,AAAA', size: [0.3, 0.3] }];

  it('farba: kolor porządkowany, błędny odrzucany', () => {
    expect(normalizeFinish({ kind: 'paint', color: '#AABBCC' })).toEqual({ kind: 'paint', color: '#aabbcc' });
    expect(normalizeFinish({ kind: 'paint', color: '#abc' })).toEqual({ kind: 'paint', color: '#aabbcc' });
    expect(normalizeFinish({ kind: 'paint', color: 'czerwony' })).toBeNull();
    expect(normalizeFinish({ kind: 'paint' })).toBeNull();
    expect(normalizeColor(12)).toBeNull();
  });

  it('nieznany materiał i śmieci w wariancie nie wywalają – wynik null', () => {
    expect(normalizeFinish({ kind: 'material', id: 'nie-ma-takiego', rot: 0 })).toBeNull();
    expect(normalizeFinish({ kind: 'material' })).toBeNull();
    expect(normalizeFinish({ kind: 'cos-innego' })).toBeNull();
    for (const junk of [null, undefined, 5, 'x', [], {}, { kind: 'split' }, { kind: 'split', height: 'abc', lower: {}, upper: {} }]) {
      expect(() => normalizeFinish(junk)).not.toThrow();
      expect(normalizeFinish(junk)).toBeNull();
    }
    expect(finishKey(null)).toBe('');
  });

  it('materiał: pola opcjonalne są sprawdzane, błędne pomijane', () => {
    const f = normalizeFinish({ kind: 'material', id: 'gres-beton-szary', rot: 45, grout: 'zly', size: [0.6, -1], pattern: 'ukos', groutWidth: 9 });
    expect(f).toEqual({ kind: 'material', id: 'gres-beton-szary', rot: 0 });
    const g = normalizeFinish({ kind: 'material', id: 'gres-beton-szary', rot: 90, grout: '#222325', size: [0.3, 0.6], pattern: 'brick', groutWidth: 0.003 });
    expect(g).toEqual({ kind: 'material', id: 'gres-beton-szary', rot: 90, grout: '#222325', size: [0.3, 0.6], pattern: 'brick', groutWidth: 0.003 });
    const p = materialParams(g, libraryMaterial(g.id));
    expect(p).toEqual({ size: [0.3, 0.6], rot: 90, pattern: 'brick', groutColor: '#222325', groutWidth: 0.003 });
    expect(JSON.parse(JSON.stringify(g))).toEqual(g); // zwykły JSON
  });

  it('podział: tylko ściany / kominy / skosy; nieznana część = null (wygląd domyślny)', () => {
    const split = { kind: 'split', height: 1.2, lower: { kind: 'material', id: 'metro-biale', rot: 0 }, upper: { kind: 'paint', color: '#ffffff' } };
    expect(normalizeFinish(split, { kind: 'wall' })).toEqual(split);
    expect(normalizeFinish(split, { kind: 'chimney' })).toEqual(split);
    expect(normalizeFinish(split, { kind: 'floor' })).toBeNull();
    expect(normalizeFinish(split, { kind: 'ceiling' })).toBeNull();
    const broken = normalizeFinish({ ...split, lower: { kind: 'material', id: 'usuniety', rot: 0 } }, { kind: 'wall' });
    expect(broken.lower).toBeNull();
    expect(broken.upper).toEqual({ kind: 'paint', color: '#ffffff' });
    expect(normalizeFinish({ ...split, height: 0 }, { kind: 'wall' })).toBeNull();
    // podział w podziale nie jest obsługiwany – część staje się domyślna
    expect(normalizeFinish({ ...split, upper: split }, { kind: 'wall' }).upper).toBeNull();
  });

  it('materiał własny: rozpoznawany z variant.customMaterials, klucz zależy od zdjęcia i wymiaru', () => {
    const f = { kind: 'material', id: 'wlasny-1', rot: 0 };
    expect(normalizeFinish(f)).toBeNull(); // bez listy materiałów własnych – nieznany
    expect(normalizeFinish(f, { kind: 'floor', customMaterials: custom })).toEqual(f);
    const def = resolveMaterial('wlasny-1', custom);
    expect(def).toMatchObject({ custom: true, size: [0.3, 0.3], name: 'Moja płytka' });
    expect(resolveMaterial('wlasny-1', [{ id: 'wlasny-1', dataUrl: 'javascript:alert(1)', size: [1, 1] }])).toBeNull();
    const k1 = finishKey(f, custom);
    const k2 = finishKey(f, [{ ...custom[0], size: [0.6, 0.6] }]);
    const k3 = finishKey(f, [{ ...custom[0], dataUrl: 'data:image/jpeg;base64,BBBBBB' }]);
    expect(new Set([k1, k2, k3]).size).toBe(3);
    expect(finishUsesMaterial({ kind: 'split', height: 1, lower: f, upper: { kind: 'paint', color: '#fff' } }, 'wlasny-1')).toBe(true);
    expect(finishUsesMaterial({ kind: 'paint', color: '#fff' }, 'wlasny-1')).toBe(false);
  });

  it('klucz wykończenia: te same parametry = ten sam klucz (domyślne wartości nie mają znaczenia)', () => {
    const def = libraryMaterial('gres-beton-szary');
    const a = finishKey({ kind: 'material', id: def.id, rot: 0 });
    const b = finishKey({ kind: 'material', id: def.id, rot: 0, size: [...def.size], grout: def.grout.color, pattern: 'straight', groutWidth: def.grout.width });
    expect(a).toBe(b);
    expect(finishKey({ kind: 'material', id: def.id, rot: 90 })).not.toBe(a);
    expect(finishKey({ kind: 'paint', color: '#ffffff' })).not.toBe(finishKey({ kind: 'paint', color: '#fffffe' }));
  });
});

describe('wykończenia – liczby, szacunki, dane', () => {
  it('pola liczbowe przyjmują przecinek', () => {
    expect(parseCm('60')).toBeCloseTo(0.6, 12);
    expect(parseCm('7,5')).toBeCloseTo(0.075, 12);
    expect(parseCm(' 120.5 ')).toBeCloseTo(1.205, 12);
    expect(parseCm('')).toBeNull();
    expect(parseCm('abc')).toBeNull();
    expect(parseCm('-5')).toBeNull();
    expect(parseNumber('1 250,5')).toBe(1250.5);
    expect(formatCm(0.075)).toBe('7,5');
    expect(formatCm(0.6)).toBe('60');
    expect(formatNumber(12.3)).toBe('12,3');
    expect(formatNumber(100)).toBe('100');
    expect(formatSize([0.6, 1.2])).toBe('60 × 120 cm');
  });

  it('szacunek płytek: zapas 10 % i liczba sztuk w górę', () => {
    const e = tileEstimate(10, [0.6, 0.6]);
    expect(e.withWasteM2).toBeCloseTo(11, 9);
    expect(e.pieces).toBe(31); // 11 / 0,36 = 30,6
    expect(tileEstimate(0.36, [0.6, 0.6]).pieces).toBe(2);
  });

  it('biblioteka: unikalne id, poprawne kategorie, kolory i rozmiary; wymagane grupy materiałów', () => {
    const ids = new Set();
    const cats = new Set(CATEGORIES.map((c) => c.id));
    for (const m of MATERIALS) {
      expect(ids.has(m.id), m.id).toBe(false);
      ids.add(m.id);
      expect(cats.has(m.category), m.id).toBe(true);
      expect(['floor', 'wall', 'both']).toContain(m.use);
      expect(m.size.every((n) => n >= SIZE_MIN && n <= SIZE_MAX), m.id).toBe(true);
      expect(m.colors.length, m.id).toBeGreaterThan(0);
      for (const c of m.colors) expect(normalizeColor(c), `${m.id} ${c}`).toBe(c);
      expect(['tiles', 'planks', 'herringbone', 'seamless']).toContain(m.texture.draw);
      if (m.grout) {
        expect(normalizeColor(m.grout.color), m.id).toBe(m.grout.color);
        expect(m.grout.width).toBeLessThanOrEqual(0.01);
      }
      if (m.formats) expect(FORMATS[m.formats], m.id).toBeTruthy();
      if (m.texture.draw === 'herringbone') expect((m.size[1] / m.size[0]) % 1, m.id).toBeCloseTo(0, 9);
      expect(normalizeFinish({ kind: 'material', id: m.id, rot: 0 }), m.id).toBeTruthy();
    }
    for (const c of CATEGORIES) expect(MATERIALS.some((m) => m.category === c.id), c.id).toBe(true);
    expect(libraryMaterial(DEFAULT_SPLIT_MATERIAL)).toBeTruthy();
    const labels = FORMATS.tile.map((f) => f.label).join('|');
    for (const f of ['60 × 60', '60 × 120', '120 × 120', '30 × 60', '20 × 20', 'Metro 10 × 20']) expect(labels).toContain(f);
    expect(materialFits(libraryMaterial('metro-biale'), 'floor')).toBe(false);
    expect(materialFits(libraryMaterial('metro-biale'), 'wall')).toBe(true);
    expect(materialFits(libraryMaterial('wykladzina-szara'), 'floor')).toBe(true);
    expect(materialFits(libraryMaterial('wykladzina-szara'), 'slope')).toBe(false);
    for (const g of GROUT_COLORS) expect(normalizeColor(g.color)).toBe(g.color);
  });

  it('paleta farb: grupy z nazwami, poprawne kolory', () => {
    expect(PAINT_GROUPS.map((g) => g.id)).toEqual(['biale', 'szarosci', 'beze', 'pastele', 'mocne']);
    const seen = new Set();
    for (const g of PAINT_GROUPS) {
      for (const p of g.colors) {
        expect(normalizeColor(p.color), p.name).toBe(p.color);
        expect(p.name.length).toBeGreaterThan(2);
        expect(seen.has(p.color), p.name).toBe(false);
        seen.add(p.color);
      }
    }
    expect(paintName('#F2EFE8')).toBe('Biel złamana');
    expect(paintName('#123456')).toBeNull();
  });

  it('zdjęcie własnej płytki: pomniejszenie do 1024 px z zachowaniem proporcji', () => {
    expect(fitSize(4032, 3024)).toEqual({ width: 512, height: 384 });
    expect(fitSize(3024, 4032)).toEqual({ width: 384, height: 512 });
    expect(fitSize(400, 300)).toEqual({ width: 400, height: 300 }); // małych nie powiększamy
    expect(fitSize(5000, 10)).toEqual({ width: 512, height: 1 });
    expect(nameFromFile('IMG_1234.jpeg')).toBe('IMG 1234');
    expect(nameFromFile('')).toBe('Własna płytka');
    expect(newCustomId()).not.toBe(newCustomId());
    expect(libraryMaterial(newCustomId())).toBeUndefined();
  });

  it('ostatnio używane: bez powtórzeń, najnowsze pierwsze, nieistniejące materiały odpadają', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const r = createRecent(storage);
    r.add({ kind: 'paint', color: '#ffffff' });
    r.add({ kind: 'material', id: 'metro-biale', rot: 0 });
    r.add({ kind: 'paint', color: '#000000' });
    r.add({ kind: 'paint', color: '#ffffff' });
    r.add({ kind: 'material', id: 'usuniety-wlasny', rot: 0 });
    r.add({ kind: 'split' });
    expect(r.list('paint').map((f) => f.color)).toEqual(['#ffffff', '#000000']);
    expect(r.list('material').map((f) => f.id)).toEqual(['metro-biale']);
    expect(createRecent(storage).list('paint').length).toBe(2); // przetrwało w pamięci przeglądarki
    expect(() => createRecent({ getItem: () => '{zepsute', setItem() {} }).list('paint')).not.toThrow();
    expect(() => createRecent(null).add({ kind: 'paint', color: '#ffffff' })).not.toThrow();
  });
});

describe('wykończenia – materiały stylu Montana', () => {
  const NEW_IDS = [
    'gres-jodelka-dab-cieply', 'gres-jodelka-dab-jasny', 'gres-jodelka-dab-miodowy',
    'patchwork-bialo-czarny', 'plytka-gwiazdka-bialo-czarna', 'patchwork-szaro-niebieski',
    'cegla-stara-czerwona', 'cegla-bielona',
    'deski-scienne-stare-cieple', 'deski-scienne-stare-miodowe',
    'lastryko-cieple', 'plytka-terakota-30x60', 'plytka-terakota-7x30', 'plyta-bezowa-60x120',
    'panel-dab-cieply', 'kamien-kominkowy-cieply', 'tynk-strukturalny-jasny', 'tynk-strukturalny-bezowy', 'posadzka-zywica-szara',
  ];

  /** Atrapa kontekstu 2D: zapisuje wywołania i pilnuje, żeby współrzędne były skończonymi liczbami. */
  function recorder() {
    const calls = {};
    const fills = []; // fillStyle w chwili każdego fillRect
    const bad = []; // wywołania z NaN / Infinity
    const gradient = { addColorStop() {} };
    const target = {};
    const ctx = new Proxy(target, {
      get(t, key) {
        if (key in t) return t[key];
        if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => gradient;
        if (key === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        return (...args) => {
          calls[key] = (calls[key] || 0) + 1;
          if (['fillRect', 'rect', 'moveTo', 'lineTo', 'arc', 'ellipse', 'bezierCurveTo'].includes(key)) {
            for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) bad.push(`${String(key)}(${args.join(', ')})`);
          }
          if (key === 'fillRect') fills.push(t.fillStyle);
        };
      },
      set(t, key, value) {
        t[key] = value;
        return true;
      },
    });
    return { ctx, calls, fills, bad };
  }

  it('każdy nowy materiał jest w bibliotece i przechodzi walidację wykończenia', () => {
    for (const id of NEW_IDS) {
      const def = libraryMaterial(id);
      expect(def, id).toBeTruthy();
      expect(normalizeFinish({ kind: 'material', id, rot: 90 }), id).toEqual({ kind: 'material', id, rot: 90 });
    }
    // podłogi z życzeń: jodełka z gresu, patchworki, lastryko, panele i posadzka garażu pasują do podłogi
    for (const id of ['gres-jodelka-dab-cieply', 'gres-jodelka-dab-jasny', 'patchwork-bialo-czarny', 'patchwork-szaro-niebieski', 'lastryko-cieple', 'plyta-bezowa-60x120', 'panel-dab-cieply', 'posadzka-zywica-szara']) {
      expect(materialFits(libraryMaterial(id), 'floor'), id).toBe(true);
    }
    // ściany: cegła, deski, lastryko, terakota, beżowa płyta, kamień kominkowy, tynk
    for (const id of ['cegla-stara-czerwona', 'cegla-bielona', 'deski-scienne-stare-cieple', 'lastryko-cieple', 'plytka-terakota-30x60', 'plytka-terakota-7x30', 'plyta-bezowa-60x120', 'kamien-kominkowy-cieply', 'tynk-strukturalny-jasny']) {
      expect(materialFits(libraryMaterial(id), 'wall'), id).toBe(true);
      expect(materialFits(libraryMaterial(id), 'chimney'), id).toBe(true);
    }
    expect(materialFits(libraryMaterial('cegla-stara-czerwona'), 'floor')).toBe(false);
  });

  it('skala = prawdziwy rozmiar elementu; tekstura mieści się w 1024 px', () => {
    for (const id of NEW_IDS) {
      const def = libraryMaterial(id);
      for (const rot of [0, 90]) {
        const p = materialParams({ kind: 'material', id, rot }, def);
        expect(p.size, id).toEqual(def.size);
        const L = textureLayout(def, p);
        expect(Math.max(L.pxW, L.pxH), id).toBeLessThanOrEqual(MAX_TEXTURE_PX);
        const t = textureTransform(L, rot);
        expect(t.repeat[0], id).toBeCloseTo(1 / L.cellW, 12);
        expect(t.repeat[1], id).toBeCloseTo(1 / L.cellH, 12);
        if (def.texture.draw === 'tiles' || def.texture.draw === 'planks') {
          expect(L.cellW / L.nx, id).toBeCloseTo(def.size[0], 12);
          expect(L.cellH / L.ny, id).toBeCloseTo(def.size[1], 12);
        } else if (def.texture.draw === 'herringbone') {
          const n = Math.round(def.size[1] / def.size[0]);
          expect(L.n, id).toBe(n);
          expect(L.cellW, id).toBeCloseTo(2 * n * def.size[0], 12); // kwadrat siatki = szerokość elementu
          expect(L.cellH, id).toBeCloseTo(L.cellW, 12);
        } else {
          expect([L.cellW, L.cellH], id).toEqual(def.size);
        }
      }
    }
    // rozmiary z życzeń
    expect(libraryMaterial('gres-jodelka-dab-cieply').size).toEqual([0.15, 0.9]);
    expect(libraryMaterial('patchwork-bialo-czarny').size).toEqual([0.2, 0.2]);
    expect(libraryMaterial('patchwork-szaro-niebieski').size).toEqual([0.2, 0.2]);
    expect(libraryMaterial('cegla-stara-czerwona').size).toEqual([0.25, 0.065]);
    expect(libraryMaterial('lastryko-cieple').size).toEqual([0.6, 0.6]);
    expect(libraryMaterial('plyta-bezowa-60x120').size).toEqual([0.6, 1.2]);
    const board = libraryMaterial('deski-scienne-stare-cieple').size[1];
    expect(board).toBeGreaterThanOrEqual(0.14);
    expect(board).toBeLessThanOrEqual(0.2);
  });

  it('każdy nowy materiał rysuje się bez błędu: obrót, własny rozmiar, fuga, każdy format, miniatura', () => {
    for (const id of NEW_IDS) {
      const def = libraryMaterial(id);
      const variants = [
        { rot: 0 },
        { rot: 90 },
        { rot: 0, size: [0.33, 0.47] },
        { rot: 0, size: [SIZE_MIN, 0.5] },
        { rot: 90, grout: '#222325', groutWidth: 0.005 },
        { rot: 0, groutWidth: 0 },
        { rot: 0, pattern: 'straight' },
        { rot: 0, pattern: 'brick' },
        ...(def.formats ? FORMATS[def.formats].map((f) => ({ rot: 0, size: f.size })) : []),
      ];
      for (const v of variants) {
        const p = materialParams({ kind: 'material', id, ...v }, def);
        for (const maxPx of [MAX_TEXTURE_PX, 96]) {
          const r = recorder();
          const L = textureLayout(def, p, maxPx);
          expect(() => drawMaterial(r.ctx, def, p, L), `${id} ${JSON.stringify(v)}`).not.toThrow();
          expect(r.calls.fillRect, id).toBeGreaterThan(0);
          expect(r.bad, `${id} ${JSON.stringify(v)}`).toEqual([]);
        }
      }
    }
  });

  it('materiały działają w podziale „płytki do wysokości”', () => {
    for (const id of ['cegla-stara-czerwona', 'lastryko-cieple', 'plytka-terakota-7x30', 'deski-scienne-stare-cieple', 'plyta-bezowa-60x120']) {
      const split = { kind: 'split', height: 1.2, lower: { kind: 'material', id, rot: 0 }, upper: { kind: 'paint', color: '#f2ede4' } };
      const norm = normalizeFinish(split, { kind: 'wall' });
      expect(norm.lower.id, id).toBe(id);
      expect(finishUsesMaterial(norm, id)).toBe(true);
      expect(finishKey(norm)).toContain(id);
    }
  });

  it('gres w jodełkę: fuga w kolorze i szerokości z opcji, „bez fugi” jej nie rysuje', () => {
    const def = libraryMaterial('gres-jodelka-dab-cieply');
    expect(def.texture.tileJoint).toBe(true);
    expect(def.grout.width).toBeGreaterThan(0);
    const draw = (finish) => {
      const p = materialParams({ kind: 'material', id: def.id, rot: 0, ...finish }, def);
      const L = textureLayout(def, p);
      const r = recorder();
      drawMaterial(r.ctx, def, p, L);
      return { p, L, fills: r.fills };
    };
    const std = draw({});
    expect(std.L.groutPx).toBeGreaterThanOrEqual(1);
    // jedna fuga wzdłuż każdego z 4n² kwadratów siatki + końce elementów (4n elementów w komórce)
    const n = std.L.n;
    expect(std.fills.filter((f) => f === def.grout.color).length).toBe(4 * n * n + 4 * n);
    const custom = draw({ grout: '#222325', groutWidth: 0.005 });
    expect(custom.L.groutPx).toBeGreaterThan(std.L.groutPx);
    expect(custom.fills.filter((f) => f === '#222325').length).toBe(4 * n * n + 4 * n);
    expect(custom.fills).not.toContain(def.grout.color);
    const none = draw({ groutWidth: 0 });
    expect(none.L.groutPx).toBe(0);
    expect(none.fills).not.toContain(def.grout.color);
    // format 20 × 120 z listy
    expect(FORMATS.herringboneTile.some((f) => f.size[0] === 0.2 && f.size[1] === 1.2)).toBe(true);
    // klasyczna jodełka drewniana zostaje bez zmian: półprzezroczysta szczelina
    expect(libraryMaterial('jodelka-dab').texture.tileJoint).toBeUndefined();
  });

  it('cegła: układ wozówkowy, jasna fuga, dużo rzędów w komórce; deski ścienne poziome z cienką szczeliną', () => {
    const def = libraryMaterial('cegla-stara-czerwona');
    const p = materialParams({ rot: 0 }, def);
    expect(p.pattern).toBe('brick');
    expect(p.groutWidth).toBeCloseTo(0.01, 12);
    const L = textureLayout(def, p);
    expect(L.ny % 2).toBe(0);
    expect(L.ny).toBeGreaterThanOrEqual(12);
    expect(L.groutPx).toBeGreaterThanOrEqual(2);
    expect(new Set(def.colors).size).toBeGreaterThanOrEqual(6); // nierówne odcienie
    expect(libraryMaterial('cegla-bielona').colors[0]).not.toBe(def.colors[0]);

    const boards = libraryMaterial('deski-scienne-stare-cieple');
    expect(boards.size[0]).toBeGreaterThan(boards.size[1]); // deska leży poziomo (długość wzdłuż u)
    const bp = materialParams({ rot: 0 }, boards);
    const BL = textureLayout(boards, bp);
    expect(BL.groutPx).toBe(1);
    const r = recorder();
    drawMaterial(r.ctx, boards, bp, BL);
    expect(r.calls.ellipse).toBeGreaterThan(0); // sęki
    expect(r.calls.bezierCurveTo).toBeGreaterThan(0); // słoje
  });

  it('patchwork: kilka różnych wzorów w komórce; lastryko: okruchy wielokątne w ciepłej gamie', () => {
    for (const id of ['patchwork-bialo-czarny', 'patchwork-szaro-niebieski']) {
      const def = libraryMaterial(id);
      const p = materialParams({ rot: 0 }, def);
      const L = textureLayout(def, p);
      expect(L.nx * L.ny, id).toBeGreaterThanOrEqual(16); // komórka mieści wiele różnych płytek
      const r = recorder();
      drawMaterial(r.ctx, def, p, L);
      expect(r.calls.ellipse, id).toBeGreaterThan(0); // kwiatki
      expect(r.calls.lineTo, id).toBeGreaterThan(0); // gwiazdki
      expect(new Set(def.texture.motifs.map((m) => m.split(':')[0])).size, id).toBeGreaterThanOrEqual(3);
    }
    expect(libraryMaterial('patchwork-szaro-niebieski').texture.inks.length).toBeGreaterThanOrEqual(4);

    const def = libraryMaterial('lastryko-cieple');
    expect(def.texture.chips.length).toBeGreaterThanOrEqual(6);
    const p = materialParams({ rot: 0 }, def);
    const L = textureLayout(def, p);
    const r = recorder();
    drawMaterial(r.ctx, def, p, L);
    // ok. 2200 okruchów na m² – wyraźnie więcej wielokątów niż płytek
    expect(r.calls.closePath).toBeGreaterThan(500 * L.nx * L.ny);
    // 60 × 120 jest na liście formatów
    expect(FORMATS[def.formats].some((f) => f.size[0] === 0.6 && f.size[1] === 1.2)).toBe(true);
  });
});

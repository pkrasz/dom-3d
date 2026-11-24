// Meble – testy czystej logiki: geometria ustawiania (kolizje, ślizganie, przyciąganie), katalog, meble startowe.
import { describe, it, expect } from 'vitest';
import { house } from './helpers.js';
import { buildCollision } from '../src/geometry/collision.js';
import {
  corners, aabb, penetration, collides, pushOut, moveItem, snapToWalls, faceWall, touchesRoom, findFreeSpot,
  withHouseBounds, houseBounds, clampToRect, subtractRect, stairBlockers, segmentCrossesWalls, normalizeRot, SNAP_DISTANCE, EPS,
} from '../src/features/furniture/placement.js';
import { CATALOG, CATEGORIES, FALLBACK_TYPE, PALETTE, buildParts, getType, typeOf, clampSize } from '../src/features/furniture/catalog.js';
import { createStarterFurniture } from '../src/features/furniture/starter.js';

const collision = buildCollision(house);
const wallsOf = (levelId) => withHouseBounds(collision.walls(levelId));
const roomAt = (levelId) => (x, y) => collision.pointInRoom(levelId, x, y);

// ścianka działowa 12 cm w x = 2,00..2,12 i ściana górna w y = 5,00..5,25
const PARTITION = [2, 0, 2.12, 5];
const TOP = [0, 5, 6, 5.25];
const box = (x, y, rot = 0, w = 1, d = 0.5) => ({ x, y, rot, w, d });

describe('meble – geometria rzutu', () => {
  it('narożniki i prostokąt opisany mebla obróconego', () => {
    const c = corners(box(0, 0, 90, 2, 1));
    expect(c[0][0]).toBeCloseTo(0.5);
    expect(c[0][1]).toBeCloseTo(-1);
    const b = aabb(box(0, 0, 90, 2, 1));
    expect(b.map((v) => +v.toFixed(6))).toEqual([-0.5, -1, 0.5, 1]);
    const b45 = aabb(box(0, 0, 45, 1, 1));
    expect(b45[2]).toBeCloseTo(Math.SQRT1_2);
    expect(normalizeRot(-90)).toBe(270);
    expect(normalizeRot(360)).toBe(0);
  });

  it('zetknięcie ze ścianą nie jest kolizją, wejście w ścianę jest', () => {
    expect(penetration(box(1.5, 2), PARTITION)).toBeNull(); // prawa krawędź dokładnie na licu x = 2,00
    const p = penetration(box(1.53, 2), PARTITION);
    expect(p.depth).toBeCloseTo(0.03, 6);
    expect([p.nx, p.ny]).toEqual([-1, 0]); // wypchnięcie z powrotem w lewo
    expect(collides(box(1.53, 2), [PARTITION])).toBe(true);
    expect(collides(box(1.0, 2), [{ rect: PARTITION }])).toBe(false); // przyjmuje też obiekty { rect }
  });

  it('mebel obrócony o 45° – liczy się narożnik, nie prostokąt opisany', () => {
    // kwadrat 1 × 1 obrócony o 45°: wierzchołek sięga 0,707 od środka
    expect(collides(box(1.2, 2, 45, 1, 1), [PARTITION])).toBe(false);
    expect(collides(box(1.35, 2, 45, 1, 1), [PARTITION])).toBe(true);
    // przy końcu ściany: prostokąt opisany nachodzi na ścianę, ale sam mebel jej nie dotyka
    const short = [2, 0, 2.12, 1];
    const diag = box(1.6, 1.6, 45, 1, 1);
    expect(aabb(diag)[2]).toBeGreaterThan(2);
    expect(aabb(diag)[1]).toBeLessThan(1);
    expect(collides(diag, [short])).toBe(false);
  });
});

describe('meble – kolizje ze ścianami przy przesuwaniu', () => {
  it('nie da się przeciągnąć przez ściankę działową 12 cm jednym dużym krokiem', () => {
    const res = moveItem(box(1, 2.5), box(4, 2.5), [PARTITION]);
    expect(res.x).toBeCloseTo(1.5, 3); // zatrzymał się na licu
    expect(res.y).toBeCloseTo(2.5, 6);
    expect(collides(res, [PARTITION])).toBe(false);
    // jeszcze dalej i ukośnie – wynik wciąż po tej samej stronie ściany
    const far = moveItem(box(1, 2.5), box(30, 3.5), [PARTITION]);
    expect(aabb(far)[2]).toBeLessThanOrEqual(2 + EPS);
  });

  it('cel setki i tysiące metrów dalej (palec pod horyzontem) też nie przenosi mebla przez ściankę', () => {
    for (const far of [150, 300, 1000, 3000, 100000, 1e9]) {
      const res = moveItem(box(1, 2.5), box(far, 2.5), [PARTITION]);
      expect(aabb(res)[2], `cel ${far} m`).toBeLessThanOrEqual(2 + EPS);
      expect(res.x).toBeCloseTo(1.5, 3);
      const diag = moveItem(box(1, 2.5), box(far, far / 7), [PARTITION, TOP]);
      expect(aabb(diag)[2], `ukośnie ${far} m`).toBeLessThanOrEqual(2 + EPS);
      expect(aabb(diag)[3]).toBeLessThanOrEqual(5 + EPS);
    }
    expect(moveItem(box(1, 2.5), box(NaN, 2.5), [PARTITION])).toMatchObject({ x: 1, y: 2.5, blocked: true });
  });

  it('prawdziwy dom: krzesło z łazienki 0/3 nie przechodzi przez ściankę przy celu 1500–3000 m', () => {
    const walls = wallsOf('parter');
    const chair = { x: 6.2, y: 4.2, rot: 0, w: 0.45, d: 0.52 };
    expect(collides(chair, walls)).toBe(false);
    for (const far of [250, 1519, 3000]) {
      const res = moveItem(chair, { ...chair, x: chair.x + far }, walls);
      expect(collision.pointInRoom('parter', res.x, res.y), `cel ${far} m`).toBe('0/3');
      expect(segmentCrossesWalls(chair.x, chair.y, res.x, res.y, collision.walls('parter'))).toBe(false);
    }
  });

  it('obrys domu, przycinanie celu, różnica prostokątów', () => {
    const b = houseBounds(wallsOf('parter'));
    expect(b[0]).toBeCloseTo(0, 6);
    expect(b[1]).toBeCloseTo(0, 6);
    expect(b[2]).toBeCloseTo(13.6, 6);
    expect(b[3]).toBeCloseTo(10.1, 6);
    expect(houseBounds([])).toBeNull();
    expect(clampToRect(1519, -40, b, 1)).toEqual({ x: b[2] + 1, y: b[1] - 1 });
    expect(clampToRect(5, 5, b, 1)).toEqual({ x: 5, y: 5 });
    expect(subtractRect([0, 0, 2, 2], [5, 5, 6, 6])).toEqual([[0, 0, 2, 2]]);
    expect(subtractRect([0, 0, 2, 2], [-1, -1, 3, 3])).toEqual([]);
    expect(subtractRect([0, 0, 2, 2], [0, 0, 2, 1])).toEqual([[0, 1, 2, 2]]);
    const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
    const parts = subtractRect([0, 0, 4, 4], [1, 1, 2, 3]);
    expect(parts).toHaveLength(4);
    expect(parts.reduce((s, r) => s + area(r), 0)).toBeCloseTo(16 - 2, 9);
  });

  it('schody parteru blokują meble, ale otwarta przestrzeń pod schodami zostaje wolna', () => {
    const st = house.levels[0].stairs;
    const blocks = stairBlockers(st);
    expect(blocks.length).toBeGreaterThan(0);
    const fotel = (x, y) => ({ x, y, rot: 0, w: 0.8, d: 0.85 });
    const [fx0, fy0, fx1, fy1] = st.parts[0].rect; // bieg dolny – zaczyna się na posadzce
    expect(collides(fotel((fx0 + fx1) / 2, (fy0 + fy1) / 2), blocks)).toBe(true);
    const [ux0, uy0, ux1, uy1] = st.underStairs.rect;
    for (const b of blocks) {
      // żaden blok nie wchodzi w przestrzeń pod schodami i każdy leży w rzucie którejś części schodów
      const overlap = Math.min(b.rect[2], ux1) - Math.max(b.rect[0], ux0) > 1e-3 && Math.min(b.rect[3], uy1) - Math.max(b.rect[1], uy0) > 1e-3;
      expect(overlap, b.id).toBe(false);
      expect(st.parts.some((p) => b.rect[0] >= p.rect[0] - 1e-9 && b.rect[1] >= p.rect[1] - 1e-9 && b.rect[2] <= p.rect[2] + 1e-9 && b.rect[3] <= p.rect[3] + 1e-9)).toBe(true);
    }
    expect(stairBlockers(null)).toEqual([]);
    expect(stairBlockers({ parts: [{ rect: [0, 0, 1, 1] }] })).toEqual([{ rect: [0, 0, 1, 1], kind: 'stairs', id: 'schody-0-0' }]);
  });

  it('przy ruchu ukośnym mebel ślizga się wzdłuż ściany', () => {
    const res = moveItem(box(1, 1), box(4, 3), [PARTITION]);
    expect(res.x).toBeCloseTo(1.5, 3);
    expect(res.y).toBeCloseTo(3, 3); // składowa równoległa do ściany została
    expect(res.blocked).toBe(false);
  });

  it('w narożniku zatrzymuje się na obu ścianach', () => {
    const res = moveItem(box(1, 4), box(5, 9), [PARTITION, TOP]);
    expect(res.x).toBeCloseTo(1.5, 3);
    expect(res.y).toBeCloseTo(4.75, 3);
    expect(collides(res, [PARTITION, TOP])).toBe(false);
  });

  it('mebel obrócony przesuwany w ścianę zatrzymuje się narożnikiem na licu', () => {
    const res = moveItem(box(0.8, 2.5, 30), box(4, 2.5, 30), [PARTITION]);
    expect(collides(res, [PARTITION])).toBe(false);
    expect(aabb(res)[2]).toBeCloseTo(2, 3);
  });

  it('obrót o 15° przy ścianie odsuwa mebel, zamiast wbić go w mur', () => {
    const start = box(1.5, 2.5); // dosunięty prawym bokiem do ściany
    const res = moveItem(start, { ...start, rot: 15 }, [PARTITION]);
    expect(res.blocked).toBe(false);
    expect(res.rot).toBeCloseTo(15, 6);
    expect(collides(res, [PARTITION])).toBe(false);
    expect(aabb(res)[2]).toBeCloseTo(2, 3); // narożnik dotyka lica
    expect(res.x).toBeLessThan(1.5); // odsunął się
    expect(res.y).toBeCloseTo(2.5, 3); // wzdłuż ściany się nie przesunął
    // pełny obrót po 15° nigdzie nie wchodzi w ścianę
    let cur = start;
    for (let i = 0; i < 24; i++) {
      cur = moveItem(cur, { ...cur, rot: cur.rot + 15 }, [PARTITION]);
      expect(cur.blocked).toBe(false);
      expect(collides(cur, [PARTITION])).toBe(false);
    }
  });

  it('obrót mebla zakleszczonego między ścianami jest zgłaszany jako niemożliwy', () => {
    const corridor = [[0, 0, 0.1, 5], [0.72, 0, 0.82, 5]]; // 62 cm w świetle
    const res = moveItem(box(0.41, 2.5, 0, 0.6, 2), { ...box(0.41, 2.5, 0, 0.6, 2), rot: 90 }, corridor);
    expect(res.blocked).toBe(true);
    expect(collides(res, corridor)).toBe(false); // zwrócony stan jest ostatnim poprawnym
  });

  it('powiększanie mebla przy ścianie odsuwa go od niej', () => {
    const start = box(1.5, 2.5);
    const res = moveItem(start, { ...start, w: 2 }, [PARTITION]);
    expect(res.w).toBe(2);
    expect(res.x).toBeCloseTo(1, 3);
    expect(collides(res, [PARTITION])).toBe(false);
  });

  it('pushOut wypycha z płytkiego wejścia, a przy zakleszczeniu zwraca null', () => {
    const out = pushOut(box(1.52, 2), [PARTITION]);
    expect(out.x).toBeCloseTo(1.5, 6);
    expect(pushOut(box(0.4, 2, 0, 1, 0.5), [[0, 0, 0.1, 5], [0.72, 0, 0.82, 5]])).toBeNull();
  });
});

describe('meble – przyciąganie do ścian', () => {
  it('dosuwa do lica z odległości do 15 cm, dalej nie rusza', () => {
    const near = snapToWalls(box(1.4, 2.5), [PARTITION]); // 10 cm od lica
    expect(near.x).toBeCloseTo(1.5, 6);
    expect(near.y).toBe(2.5);
    const far = snapToWalls(box(1.3, 2.5), [PARTITION]); // 20 cm
    expect(far.x).toBe(1.3);
    expect(SNAP_DISTANCE).toBeCloseTo(0.15);
  });

  it('w narożniku łapie obie ściany; ściany obok (nie naprzeciw) nie przyciągają', () => {
    const c = snapToWalls(box(1.42, 4.66), [PARTITION, TOP]);
    expect(c.x).toBeCloseTo(1.5, 6);
    expect(c.y).toBeCloseTo(4.75, 6);
    const beside = snapToWalls(box(1.45, 6), [PARTITION]); // ściana kończy się na y = 5
    expect(beside.x).toBe(1.45);
  });

  it('mebel już dosunięty nie przeskakuje do przeciwległej ściany', () => {
    const niche = [[0, 0, 0.1, 5], [1.2, 0, 1.3, 5]]; // wnęka 110 cm, mebel 100 cm przy lewej ścianie
    const s = snapToWalls(box(0.6, 2.5), niche);
    expect(s.x).toBeCloseTo(0.6, 6);
  });

  it('mebel obrócony o 15° dociąga się narożnikiem i nie wchodzi w ścianę', () => {
    const f = box(1.35, 2.5, 15);
    const s = snapToWalls(f, [PARTITION]);
    expect(aabb(s)[2]).toBeCloseTo(2, 6);
    expect(collides(s, [PARTITION])).toBe(false);
  });

  it('przy przeciąganiu wzdłuż ściany mebel trzyma się lica', () => {
    // palec prowadzi mebel 8 cm od ściany, w górę wzdłuż niej – jak w index.js: ruch z kolizją, potem przyciąganie
    let pose = box(1.5, 1);
    for (let y = 1.05; y <= 4; y += 0.05) {
      const moved = moveItem(pose, { ...pose, x: 1.42, y }, [PARTITION]);
      pose = snapToWalls(moved, [PARTITION]);
      expect(pose.x).toBeCloseTo(1.5, 6);
    }
    expect(pose.y).toBeCloseTo(4, 2);
    // odciągnięty dalej niż 15 cm – puszcza
    const away = snapToWalls(moveItem(pose, { ...pose, x: 1.2 }, [PARTITION]), [PARTITION]);
    expect(away.x).toBeCloseTo(1.2, 6);
  });
});

describe('meble – tyłem do ściany, pomieszczenia, wolne miejsce', () => {
  it('faceWall obraca tyłem do najbliższej ściany i dosuwa', () => {
    const r = faceWall(box(1.2, 2.5, 0, 1, 0.5), [PARTITION, TOP]); // najbliżej: ścianka z prawej
    expect(r.rot).toBe(270); // tył (+y mebla) patrzy w +x
    expect(r.x).toBeCloseTo(2 - 0.25, 6);
    expect(collides(r, [PARTITION, TOP])).toBe(false);
    const up = faceWall(box(0.9, 4.5, 90, 1, 0.5), [PARTITION, TOP]); // najbliżej: ściana górna
    expect(up.rot).toBe(0);
    expect(up.y).toBeCloseTo(5 - 0.25, 6);
    expect(faceWall(box(10, 10), [])).toBeNull();
  });

  it('segmentCrossesWalls wykrywa przejście przez ścianę', () => {
    expect(segmentCrossesWalls(1, 1, 3, 1, [PARTITION])).toBe(true);
    expect(segmentCrossesWalls(1, 1, 1.9, 4, [PARTITION])).toBe(false);
    expect(segmentCrossesWalls(1, 6, 3, 6, [PARTITION])).toBe(false);
  });

  it('touchesRoom: mebel całkiem poza pomieszczeniami jest odrzucany', () => {
    const at = roomAt('parter');
    expect(touchesRoom({ x: 11, y: 5, rot: 0, w: 2, d: 1 }, at)).toBe(true); // salon
    expect(touchesRoom({ x: -3, y: -3, rot: 0, w: 1, d: 1 }, at)).toBe(false); // ogród
    expect(touchesRoom({ x: 6.5, y: 5.5, rot: 0, w: 0.5, d: 0.5 }, roomAt('poddasze'))).toBe(false); // otwór klatki schodowej
  });

  it('findFreeSpot znajduje najbliższe wolne miejsce', () => {
    const walls = wallsOf('parter');
    const valid = (c) => !collides(c, walls) && Boolean(roomAt('parter')(c.x, c.y));
    const inWall = { x: 9.0, y: 1.5, rot: 0, w: 1, d: 0.6 }; // w ścianie między wiatrołapem a salonem
    expect(valid(inWall)).toBe(false);
    const spot = findFreeSpot(inWall, valid);
    expect(spot).toBeTruthy();
    expect(valid(spot)).toBe(true);
    expect(Math.hypot(spot.x - inWall.x, spot.y - inWall.y)).toBeLessThan(1.2);
    expect(findFreeSpot(inWall, () => false, 1)).toBeNull();
  });
});

describe('meble – ściany prawdziwego domu', () => {
  it('wszystkie ściany kolizyjne są prostokątami osiowymi (w domu nie ma ścian skośnych)', () => {
    for (const level of house.levels) {
      const walls = collision.walls(level.id);
      expect(walls.length).toBeGreaterThan(10);
      for (const { rect } of walls) {
        expect(rect).toHaveLength(4);
        expect(rect.every(Number.isFinite)).toBe(true);
        expect(rect[2]).toBeGreaterThan(rect[0]);
        expect(rect[3]).toBeGreaterThan(rect[1]);
      }
    }
  });

  it('poddasze: mebel nie przejdzie przez ściankę działową 12 cm między łazienką 1/10 a garderobą 1/11', () => {
    const walls = wallsOf('poddasze');
    const partition = collision.walls('poddasze').find(({ rect }) => Math.abs(rect[2] - rect[0] - 0.12) < 1e-6 && rect[0] > 2.4 && rect[0] < 2.6 && rect[3] > 9);
    expect(partition, 'ścianka D-1').toBeTruthy();
    const start = { x: 1.3, y: 8.6, rot: 0, w: 0.6, d: 0.6 };
    expect(collides(start, walls)).toBe(false);
    expect(roomAt('poddasze')(start.x, start.y)).toBe('1/10');
    for (const target of [{ x: 3.8, y: 8.6 }, { x: 12, y: 8.6 }, { x: 4.0, y: 8.0 }]) {
      const res = moveItem(start, { ...start, ...target }, walls);
      expect(collides(res, walls)).toBe(false);
      expect(aabb(res)[2]).toBeLessThanOrEqual(partition.rect[0] + EPS);
      expect(roomAt('poddasze')(res.x, res.y)).toBe('1/10');
    }
  });

  it('mebla nie da się wyciągnąć poza dom – ani przez ścianę, ani przez okno narożne', () => {
    const walls = wallsOf('parter');
    const start = { x: 11.5, y: 3, rot: 0, w: 2.2, d: 0.95 };
    expect(collides(start, walls)).toBe(false);
    for (const target of [{ x: 30, y: 3 }, { x: 11.5, y: -20 }, { x: 40, y: -40 }, { x: 11.5, y: 40 }]) {
      const res = moveItem(start, { ...start, ...target }, walls);
      const b = aabb(res);
      expect(b[0]).toBeGreaterThanOrEqual(0.25 - EPS);
      expect(b[1]).toBeGreaterThanOrEqual(0.25 - EPS);
      expect(b[2]).toBeLessThanOrEqual(13.35 + EPS);
      expect(b[3]).toBeLessThanOrEqual(9.85 + EPS);
      expect(roomAt('parter')(res.x, res.y)).toBe('0/6');
    }
  });

  it('mebel obrócony o 15° dosuwany do ściany salonu nie wchodzi w mur', () => {
    const walls = wallsOf('parter');
    const start = { x: 11.5, y: 5, rot: 15, w: 2.2, d: 0.95 };
    const res = snapToWalls(moveItem(start, { ...start, x: 14 }, walls), walls);
    expect(collides(res, walls)).toBe(false);
    expect(aabb(res)[2]).toBeCloseTo(13.35, 3);
  });
});

describe('meble – katalog', () => {
  const REQUIRED = ['sofa-2', 'sofa-3', 'naroznik', 'fotel', 'stolik-kawowy', 'szafka-rtv', 'stol', 'krzeslo', 'lozko-90', 'lozko-140', 'lozko-160',
    'lozko-180', 'szafka-nocna', 'szafa', 'komoda', 'regal', 'biurko', 'kuchnia-dolna', 'kuchnia-gorna', 'kuchnia-slupek', 'kuchnia-wyspa',
    'kuchnia-zlew', 'kuchnia-plyta', 'wc', 'umywalka', 'wanna', 'prysznic', 'pralka'];

  it('zawiera wszystkie wymagane typy, każdy z kompletem pól', () => {
    for (const id of REQUIRED) expect(getType(id), id).toBeTruthy();
    expect(new Set(CATALOG.map((t) => t.id)).size).toBe(CATALOG.length);
    const cats = new Set(CATEGORIES.map((c) => c.id));
    for (const t of CATALOG) {
      expect(typeof t.name, t.id).toBe('string');
      expect(cats.has(t.category), `${t.id}: kategoria`).toBe(true);
      expect(t.color, t.id).toMatch(/^#[0-9a-f]{6}$/);
      expect(typeof t.build, t.id).toBe('function');
      for (const k of ['w', 'd', 'h']) {
        const [min, max] = t.range[k];
        expect(min, `${t.id}.${k}`).toBeLessThanOrEqual(max);
        expect(t.size[k], `${t.id}.${k} w zakresie`).toBeGreaterThanOrEqual(min);
        expect(t.size[k], `${t.id}.${k} w zakresie`).toBeLessThanOrEqual(max);
        expect(min).toBeGreaterThan(0);
        expect(max).toBeLessThanOrEqual(5);
      }
      expect(t.range.h[1], `${t.id}: mieści się pod sufitem parteru`).toBeLessThanOrEqual(house.levels[0].ceilingHeight);
    }
    for (const c of CATEGORIES) expect(CATALOG.some((t) => t.category === c.id), c.id).toBe(true);
    for (const hex of PALETTE) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(getType('kuchnia-gorna').mount).toBeGreaterThan(1); // mebel wiszący
  });

  it('każdy typ buduje bryłę, która mieści się w w × d × h – dla wymiarów domyślnych i skrajnych', () => {
    for (const t of [...CATALOG, FALLBACK_TYPE]) {
      const sizes = [t.size, { w: t.range.w[0], d: t.range.d[0], h: t.range.h[0] }, { w: t.range.w[1], d: t.range.d[1], h: t.range.h[1] },
        { w: t.range.w[0], d: t.range.d[1], h: t.range.h[0] }, { w: t.range.w[1], d: t.range.d[0], h: t.range.h[1] }];
      for (const { w, d, h } of sizes) {
        const label = `${t.id} ${w}×${d}×${h}`;
        const parts = buildParts(t, w, d, h);
        expect(parts.length, label).toBeGreaterThan(0);
        expect(parts.length, `${label}: lekka bryła`).toBeLessThanOrEqual(24);
        let top = 0;
        let x0 = Infinity;
        let x1 = -Infinity;
        for (const p of parts) {
          expect(['box', 'cyl']).toContain(p.shape);
          expect(typeof p.mat).toBe('string');
          const tol = 1e-9;
          expect(p.min[0], label).toBeGreaterThanOrEqual(-w / 2 - tol);
          expect(p.max[0], label).toBeLessThanOrEqual(w / 2 + tol);
          expect(p.min[1], label).toBeGreaterThanOrEqual(-d / 2 - tol);
          expect(p.max[1], label).toBeLessThanOrEqual(d / 2 + tol);
          expect(p.min[2], label).toBeGreaterThanOrEqual(-tol);
          expect(p.max[2], label).toBeLessThanOrEqual(h + tol);
          for (let i = 0; i < 3; i++) expect(p.max[i] - p.min[i], label).toBeGreaterThan(0);
          top = Math.max(top, p.max[2]);
          x0 = Math.min(x0, p.min[0]);
          x1 = Math.max(x1, p.max[0]);
        }
        // bryła faktycznie wypełnia podane wymiary (nie jest np. dwa razy za mała)
        expect(top, `${label}: wysokość`).toBeCloseTo(h, 6);
        expect(x1 - x0, `${label}: szerokość`).toBeCloseTo(w, 6);
      }
    }
  });

  it('typ nieznany dostaje bryłę zastępczą; clampSize przycina do zakresu', () => {
    expect(typeOf({ type: 'nie-ma-takiego' })).toBe(FALLBACK_TYPE);
    expect(typeOf({ type: 'sofa-3' }).id).toBe('sofa-3');
    const t = getType('szafa');
    expect(clampSize(t, { w: 99, d: 0.01, h: 2.1004 })).toEqual({ w: t.range.w[1], d: t.range.d[0], h: 2.1 });
  });
});

describe('meble – startowe z projektu', () => {
  const items = createStarterFurniture();
  const poddasze = house.levels.find((l) => l.id === 'poddasze');
  /** Wysokość pomieszczenia poddasza w punkcie o współrzędnej y (reguła z house.json → ceiling.rule). */
  const ceilingAt = (y) => Math.min(poddasze.ceiling.flatHeight, ...poddasze.ceiling.slopes.map((s) => s.heightAtWall + s.risePerMeter * Math.abs(y - s.kneeWallFace)));

  it('czysta funkcja: za każdym razem nowa, taka sama lista zwykłych obiektów JSON', () => {
    const again = createStarterFurniture();
    expect(again).toEqual(items);
    expect(again).not.toBe(items);
    expect(again[0]).not.toBe(items[0]);
    expect(JSON.parse(JSON.stringify(items))).toEqual(items);
    expect(items.length).toBeGreaterThanOrEqual(9);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it('każdy mebel ma poprawny kształt FurnitureItem i typ z katalogu w dozwolonym zakresie', () => {
    for (const it of items) {
      expect(Object.keys(it).sort(), it.id).toEqual(['color', 'd', 'h', 'id', 'levelId', 'rot', 'type', 'w', 'x', 'y']);
      expect(typeof it.id).toBe('string');
      expect(house.levels.some((l) => l.id === it.levelId), it.id).toBe(true);
      for (const k of ['x', 'y', 'rot', 'w', 'd', 'h']) expect(Number.isFinite(it[k]), `${it.id}.${k}`).toBe(true);
      expect([0, 90, 180, 270]).toContain(it.rot);
      expect(it.color).toMatch(/^#[0-9a-f]{6}$/);
      const type = getType(it.type);
      expect(type, `${it.id}: typ ${it.type}`).toBeTruthy();
      expect(clampSize(type, it), `${it.id}: wymiary w zakresie typu`).toEqual({ w: it.w, d: it.d, h: it.h });
    }
  });

  it('każdy mebel stoi w pomieszczeniu, nie wchodzi w ścianę ani komin i nie nachodzi na inny mebel', () => {
    for (const it of items) {
      const walls = wallsOf(it.levelId);
      expect(collides(it, walls), `${it.id}: kolizja ze ścianą`).toBe(false);
      for (const [x, y] of [[it.x, it.y], ...corners(it).map(([cx, cy]) => [cx + (it.x - cx) * 0.02, cy + (it.y - cy) * 0.02])]) {
        expect(roomAt(it.levelId)(x, y), `${it.id}: punkt (${x.toFixed(2)}; ${y.toFixed(2)}) w pomieszczeniu`).toBeTruthy();
      }
      // cały mebel w JEDNYM pomieszczeniu
      const rooms = new Set(corners(it).map(([cx, cy]) => roomAt(it.levelId)(cx + (it.x - cx) * 0.02, cy + (it.y - cy) * 0.02)));
      expect(rooms.size, it.id).toBe(1);
    }
    for (const a of items) {
      for (const b of items) {
        if (a === b || a.levelId !== b.levelId) continue;
        expect(collides(a, [aabb(b)]), `${a.id} × ${b.id}`).toBe(false); // meble startowe są osiowe, więc aabb = rzut
      }
    }
  });

  it('położenie i wymiary zgadzają się z odczytem projektu', () => {
    const rectOf = (id) => aabb(items.find((i) => i.id === id)).map((v) => +v.toFixed(3));
    // parter_final: szafa w wiatrołapie 1,20 × 0,60 i obrys kominka 55 × 87 (house.json → fireplaceOutline)
    expect(rectOf('start-szafa-wiatrolap')).toEqual([5.3, 2.05, 6.5, 2.65]);
    const fireplace = house.levels[0].chimneys.find((c) => c.fireplaceOutline).fireplaceOutline;
    expect(rectOf('start-kominek')).toEqual(fireplace);
    // poddasze_final: prostokaty_przekreslone_X.lista_m – suma rzutów szaf w pomieszczeniu = prostokąty z projektu
    const area = (roomId) => items.filter((i) => i.levelId === 'poddasze' && roomAt('poddasze')(i.x, i.y) === roomId).reduce((s, i) => s + i.w * i.d, 0);
    expect(area('1/11')).toBeCloseTo((4.45 - 2.6) * (9.85 - 9.253) + 0.6 * (9.85 - 7.24), 2);
    expect(area('1/9')).toBeCloseTo(0.6 * (7.12 - 4.84), 2);
    expect(area('1/8')).toBeCloseTo(0.6 * (3.4 - 0.25), 2);
    expect(area('1/3')).toBeCloseTo((5.897 - 5.3) * (9.85 - 7.052) + (7.908 - 5.897) * (7.653 - 7.052), 2);
    expect(area('1/4')).toBeCloseTo((13.348 - 9.55) * (5.812 - 5.232), 2);
    expect(rectOf('start-szafa-1-4')).toEqual([9.55, 5.232, 13.348, 5.812]);
    expect(rectOf('start-szafa-1-9')).toEqual([4.45, 4.84, 5.05, 7.12]);
  });

  it('żaden mebel nie przebija sufitu ani skosu, a tył stoi przy ścianie', () => {
    for (const it of items) {
      const b = aabb(it);
      if (it.levelId === 'poddasze') {
        expect(it.h, `${it.id}: pod skosem`).toBeLessThanOrEqual(Math.min(ceilingAt(b[1]), ceilingAt(b[3])) + 1e-9);
      } else expect(it.h, it.id).toBeLessThan(house.levels[0].ceilingHeight);
      // "tyłem do ściany": krok 10 cm w stronę tyłu mebla kończy się w ścianie / kominie albo (szafy 1/3) tuż przy niej
      const back = { N: [0, 1], W: [-1, 0], S: [0, -1], E: [1, 0] }[{ 0: 'N', 90: 'W', 180: 'S', 270: 'E' }[it.rot]];
      const probe = { ...it, x: it.x + back[0] * 0.2, y: it.y + back[1] * 0.2 };
      const walls = [...wallsOf(it.levelId), ...house.levels.find((l) => l.id === it.levelId).chimneys.map((c) => ({ rect: c.rect }))];
      expect(collides(probe, walls), `${it.id}: za plecami jest ściana`).toBe(true);
    }
  });
});

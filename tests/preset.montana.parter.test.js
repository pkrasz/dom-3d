// Wariant „Montana” – parter: twarde wymagania aranżacji sprawdzane liczbowo na danych z presets/montana/parter.js.
// Geometria i kolizje pochodzą z tych samych modułów, których używa aplikacja (buildHouse, buildCollision, placement.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { house } from './helpers.js';
import { buildHouse } from '../src/geometry/buildHouse.js';
import { buildCollision } from '../src/geometry/collision.js';
import { corners, aabb, collides, penetration, withHouseBounds, stairBlockers, EPS } from '../src/features/furniture/placement.js';
import { getType, clampSize, MOUNT_RANGE } from '../src/features/furniture/catalog.js';
import { createStarterFurniture } from '../src/features/furniture/starter.js';
import { libraryMaterial } from '../src/features/finishes/library.js';
import { materialFits } from '../src/features/finishes/finish.js';
import { sanitizeVariant } from '../src/features/variants/validate.js';
import { finishes, furniture } from '../src/features/variants/presets/montana/parter.js';

const design = JSON.parse(readFileSync(new URL('../design.json', import.meta.url), 'utf8'));
const LEVEL = 'parter';
const level = house.levels.find((l) => l.id === LEVEL);
const built = buildHouse(house, design);
const surfaces = (built.surfaces instanceof Map ? [...built.surfaces.values()] : built.surfaces);
const parterSurfaces = surfaces.filter((s) => s.levelId === LEVEL);
const collision = buildCollision(house, design);
const walls = [...collision.walls(LEVEL), ...stairBlockers(level.stairs)];
const blockers = withHouseBounds(walls);
const roomAt = (x, y) => collision.pointInRoom(LEVEL, x, y);

const byId = new Map(furniture.map((f) => [f.id, f]));
const RAD = Math.PI / 180;
const isFlat = (f) => f.h <= 0.05; // dywany, mata
const bottom = (f) => f.z || 0;
const top = (f) => bottom(f) + f.h;

/** Pomieszczenie, w którym mebel ma stać – z identyfikatora („mt-pN-…” = 0/N). */
const STARTER_ROOM = { 'start-szafa-wiatrolap': '0/1', 'start-kominek': '0/6' };
const homeRoom = (f) => STARTER_ROOM[f.id] || `0/${/^mt-p(\d)-/.exec(f.id)[1]}`;
/** Świadome wyjątki od „w całości w swoim pomieszczeniu”. */
const ROOM_EXCEPTIONS = {
  'mt-p1-scianka-szklana': ['0/1', '0/2'], // stoi w świetle przejścia P1, na granicy obu pomieszczeń
  'mt-p5-wyspa-barek': ['0/5', '0/6'], // życzenie właściciela: wyspa może delikatnie wychodzić w stronę jadalni
};

/** Punkt w rzucie mebla (z tolerancją). */
function inFootprint(f, x, y, tol = 0) {
  const c = Math.cos(f.rot * RAD);
  const s = Math.sin(f.rot * RAD);
  const lx = (x - f.x) * c + (y - f.y) * s;
  const ly = -(x - f.x) * s + (y - f.y) * c;
  return Math.abs(lx) < f.w / 2 - tol && Math.abs(ly) < f.d / 2 - tol;
}
/** Odległość punktu od rzutu mebla (0 w środku). */
function distToFootprint(f, x, y) {
  const c = Math.cos(f.rot * RAD);
  const s = Math.sin(f.rot * RAD);
  const lx = (x - f.x) * c + (y - f.y) * s;
  const ly = -(x - f.x) * s + (y - f.y) * c;
  return Math.hypot(Math.max(Math.abs(lx) - f.w / 2, 0), Math.max(Math.abs(ly) - f.d / 2, 0));
}
const distToRect = (r, x, y) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - y, 0, y - r[3]));

/**
 * Części rzutu mebla. Narożnik ma rzut w kształcie „L” (część główna 1,00 m przy tylnej krawędzi + ramię 1,00 m
 * przy boku – wymiary z cornerSofa w katalogu), więc stoliki w jego wewnętrznym narożniku na niego nie nachodzą.
 */
function parts(f) {
  const side = { 'naroznik-duzy': -1, 'naroznik-duzy-prawy': 1 }[f.type];
  if (!side) return [f];
  const md = 1.0;
  const c = Math.cos(f.rot * RAD);
  const s = Math.sin(f.rot * RAD);
  const at = (lx, ly, w, d) => ({ x: f.x + lx * c - ly * s, y: f.y + lx * s + ly * c, rot: f.rot, w, d });
  return [at(0, f.d / 2 - md / 2, f.w, md), at(side * (f.w / 2 - md / 2), -md / 2, md, f.d - md)];
}
const overlap = (a, b) => parts(a).some((pa) => parts(b).some((pb) => overlapRect(pa, pb)));

/** Nakładanie się dwóch rzutów (twierdzenie o osi rozdzielającej); zetknięcie nie jest nakładaniem. */
function overlapRect(a, b) {
  const ca = corners(a);
  const cb = corners(b);
  for (const f of [a, b]) {
    const c = Math.cos(f.rot * RAD);
    const s = Math.sin(f.rot * RAD);
    for (const [ax, ay] of [[c, s], [-s, c]]) {
      const pa = ca.map(([x, y]) => x * ax + y * ay);
      const pb = cb.map(([x, y]) => x * ax + y * ay);
      if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= EPS) return false;
    }
  }
  return true;
}

/** Pary, które mogą się nakładać w rzucie. */
const PAIRS = [
  [/^mt-p6-krzeslo-/, /^mt-p6-stol$/], // krzesła wsunięte pod stół
  [/^mt-p6-hoker-/, /^mt-p5-wyspa-barek$/], // hokery pod nawisem wyspy
  [/^mt-p9-rower-/, /^mt-p9-stojak$/], // przednie koła w stojaku
];
function mayOverlap(a, b) {
  if (isFlat(a) || isFlat(b)) return true; // dywan / mata pod meblami
  if (bottom(a) >= top(b) - 1e-6 || bottom(b) >= top(a) - 1e-6) return true; // wiszący nad stojącym
  return PAIRS.some(([p, q]) => (p.test(a.id) && q.test(b.id)) || (p.test(b.id) && q.test(a.id)));
}

// ---------------------------------------------------------------- drzwi i otwory z house.json
const wallOf = (o) => level.walls.find((w) => w.id === o.wall);
const isVerticalWall = (w) => w.rect[2] - w.rect[0] < w.rect[3] - w.rect[1];

/** Łuk skrzydła drzwi wewnętrznych: zawias, kierunek skrzydła zamkniętego i otwartego, długość skrzydła. */
function leafOf(o) {
  const w = wallOf(o);
  const sign = o.swing[0] === '+' ? 1 : -1;
  const atStart = Math.abs(o.hinge - o.at[0]) < 1e-9;
  const along = atStart ? o.at[0] + o.hingeOffset : o.at[1] - o.hingeOffset;
  const dir = atStart ? 1 : -1;
  if (isVerticalWall(w)) return { id: o.id, hinge: [sign > 0 ? w.rect[2] : w.rect[0], along], closed: [0, dir], open: [sign, 0], r: o.leaf };
  return { id: o.id, hinge: [along, sign > 0 ? w.rect[3] : w.rect[1]], closed: [dir, 0], open: [0, sign], r: o.leaf };
}
/** Punkty próbne ćwiartki koła zakreślanej przez skrzydło (co 3° i co 4 cm, 1 cm od lica ściany). */
function sectorPoints({ hinge, closed, open, r }) {
  const pts = [];
  for (let a = 0; a <= 90; a += 3) {
    for (let q = 0.04; q <= r + 1e-9; q += 0.04) {
      const ca = Math.cos(a * RAD) * q;
      const sa = Math.sin(a * RAD) * q;
      pts.push([hinge[0] + closed[0] * ca + open[0] * (sa + 0.01), hinge[1] + closed[1] * ca + open[1] * (sa + 0.01)]);
    }
  }
  return pts;
}
/** Prostokąt przed otworem po stronie wnętrza (albo po stronie przeciwnej do otwierania skrzydła). */
function zoneBeside(o, depth, side) {
  const w = wallOf(o);
  const [a, b] = o.kind === 'door' ? [o.at[0] + 0.06, o.at[1] - 0.06] : o.at;
  if (isVerticalWall(w)) return side > 0 ? [w.rect[2], a, w.rect[2] + depth, b] : [w.rect[0] - depth, a, w.rect[0], b];
  return side > 0 ? [a, w.rect[3], b, w.rect[3] + depth] : [a, w.rect[1] - depth, b, w.rect[1]];
}
/** Strona ściany zewnętrznej, po której jest wnętrze domu. */
function insideSide(o) {
  for (const side of [1, -1]) {
    const z = zoneBeside(o, 0.3, side);
    if (roomAt((z[0] + z[2]) / 2, (z[1] + z[3]) / 2)) return side;
  }
  throw new Error(`otwór ${o.id}: brak wnętrza`);
}
const intersecting = (rect, filter = () => true) => furniture.filter((f) => filter(f) && penetration(f, rect)).map((f) => f.id);
const standing = (f) => !isFlat(f);

/**
 * Skrzydła ścianki szklanej: 2 × min(0,90; …) jak w katalogu. ZAŁOŻENIE wariantu – otwierają się do korytarza (+y),
 * żeby ceglana ściana wiatrołapu zmieściła siedzisko i konsolę (życzenie: konsola w wiatrołapie).
 */
function glassLeaves(f) {
  const leaf = Math.min(0.9, (f.w - 0.09) / 2);
  const xa = (f.w - 2 * leaf) / 2;
  const y = f.y + f.d / 2;
  return [
    { id: 'ścianka-L', hinge: [f.x - f.w / 2 + xa, y], closed: [1, 0], open: [0, 1], r: leaf },
    { id: 'ścianka-P', hinge: [f.x + f.w / 2 - xa, y], closed: [-1, 0], open: [0, 1], r: leaf },
  ];
}

/** Drzwi przesuwne z design.json: skrzydło jeździ po ścianie (bez łuku), przy ścianie musi zostać wolny pas keepClear. */
const sliding = collision.slidingDoors(LEVEL);
const slidingIds = new Set(sliding.map((d) => d.id));

/** Prostokąt głębokości depth przyległy do FRONTU mebla (−y lokalnie), na całą jego szerokość. */
function frontZone(f, depth) {
  const ly = -(f.d + depth) / 2;
  return aabb({ x: f.x - ly * Math.sin(f.rot * RAD), y: f.y + ly * Math.cos(f.rot * RAD), rot: f.rot, w: f.w, d: depth });
}
const shrink = (r, m = 0.005) => [r[0] + m, r[1] + m, r[2] - m, r[3] - m];

/** Największy wolny odcinek [lo, hi] po odjęciu przedziałów zajętych. */
function widestGap(lo, hi, taken) {
  let best = 0;
  let cur = lo;
  for (const [a, b] of taken.filter(([a, b]) => b > lo && a < hi).sort((p, q) => p[0] - q[0])) {
    best = Math.max(best, a - cur);
    cur = Math.max(cur, b);
  }
  return Math.max(best, hi - cur);
}

// =====================================================================================================
describe('Montana / parter – kształt danych', () => {
  it('identyfikatory są unikalne i mają prefiks „mt-” (poza meblami z projektu)', () => {
    expect(byId.size).toBe(furniture.length);
    for (const f of furniture) expect(f.id.startsWith('mt-') || f.id in STARTER_ROOM, f.id).toBe(true);
    for (const f of furniture) expect(f.levelId, f.id).toBe(LEVEL);
  });

  it('meble z projektu zostają na miejscu (id, typ, położenie, wymiary)', () => {
    const starter = createStarterFurniture().filter((f) => f.levelId === LEVEL);
    expect(starter.length).toBeGreaterThan(0);
    for (const s of starter) {
      const { color, color2, ...mine } = byId.get(s.id) || {};
      const { color: _c, ...theirs } = s;
      expect(mine, s.id).toEqual(theirs);
      expect(color, s.id).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('typy są w katalogu, wymiary w zakresie typu, kolory poprawne', () => {
    for (const f of furniture) {
      const type = getType(f.type);
      expect(type, `${f.id}: typ ${f.type}`).toBeTruthy();
      expect(clampSize(type, f), f.id).toEqual({ w: f.w, d: f.d, h: f.h });
      expect(f.color, f.id).toMatch(/^#[0-9a-f]{6}$/);
      if (f.color2 !== undefined) {
        expect(f.color2, f.id).toMatch(/^#[0-9a-f]{6}$/);
        expect(type.color2, `${f.id}: typ bez drugiego koloru`).toBeTruthy();
      }
      if (f.z !== undefined) {
        expect(type.mount, `${f.id}: typ nie jest wiszący`).toBeDefined();
        expect(f.z).toBeGreaterThanOrEqual(MOUNT_RANGE[0]);
        expect(f.z).toBeLessThanOrEqual(MOUNT_RANGE[1]);
      } else expect(type.mount, `${f.id}: mebel wiszący bez z`).toBeUndefined();
    }
  });

  it('wykończenia: istniejące powierzchnie parteru, znane materiały pasujące do rodzaju powierzchni', () => {
    const known = new Map(surfaces.map((s) => [s.id, s]));
    const simple = (fin, kind, id) => {
      if (fin.kind === 'paint') return expect(fin.color, id).toMatch(/^#[0-9a-f]{6}$/);
      expect(fin.kind, id).toBe('material');
      const def = libraryMaterial(fin.id);
      expect(def, `${id}: materiał ${fin.id}`).toBeTruthy();
      expect(materialFits(def, kind), `${id}: ${fin.id} na ${kind}`).toBe(true);
      expect([0, 90]).toContain(fin.rot);
    };
    for (const [id, fin] of Object.entries(finishes)) {
      const s = known.get(id);
      expect(s, `nieznana powierzchnia ${id}`).toBeTruthy();
      expect(s.levelId).toBe(LEVEL);
      if (fin.kind === 'split') {
        expect(['wall', 'chimney', 'slope'], id).toContain(s.kind);
        expect(fin.height).toBeGreaterThan(0.3);
        expect(fin.height).toBeLessThan(s.heightM);
        simple(fin.lower, s.kind, id);
        simple(fin.upper, s.kind, id);
      } else simple(fin, s.kind, id);
    }
  });

  it('każda podłoga, ściana, sufit i komin parteru ma świadome wykończenie', () => {
    expect(parterSurfaces.length).toBeGreaterThan(50);
    const missing = parterSurfaces.filter((s) => !finishes[s.id]).map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it('życzenia właściciela: jedna jodełka z gresu w salonie, korytarzu, kuchni i spiżarni; patchwork i cegła w wiatrołapie', () => {
    for (const room of ['0/2', '0/4', '0/5', '0/6']) expect(finishes[`parter:${room}:floor`]).toEqual({ kind: 'material', id: 'gres-jodelka-dab-cieply', rot: 0 });
    expect(finishes['parter:0/1:floor'].id).toBe('patchwork-bialo-czarny');
    const brick = Object.entries(finishes).filter(([id, f]) => id.startsWith('parter:0/1:wall') && f.id === 'cegla-stara-czerwona');
    expect(brick.map(([id]) => id)).toEqual(['parter:0/1:wall:1']);
    // „reszta ciepła biel”: pozostałe trzy ściany i sufit wiatrołapu w farbie „Biel ciepła” (nie w „Bieli złamanej”)
    for (const part of ['wall:0', 'wall:2', 'wall:3', 'ceiling']) expect(finishes[`parter:0/1:${part}`], part).toEqual({ kind: 'paint', color: '#f6f1e7' });
  });

  it('przechodzi walidację wariantów bez strat', () => {
    let n = 0;
    const ctx = { makeId: () => `nowy-${++n}`, levelIds: house.levels.map((l) => l.id), surfaceIds: new Set(surfaces.map((s) => s.id)) };
    const raw = { id: 'montana', name: 'Montana', finishes, furniture, customMaterials: [] };
    const { variant, report } = sanitizeVariant(JSON.parse(JSON.stringify(raw)), ctx);
    expect(report).toEqual({ skippedSurfaces: 0, droppedFinishes: 0, droppedFurniture: 0, droppedMaterials: 0 });
    expect(variant.finishes).toEqual(finishes);
    expect(variant.furniture).toEqual(furniture);
    expect(n).toBe(0);
  });
});

describe('Montana / parter – ustawienie mebli', () => {
  it('żaden mebel nie wchodzi w ścianę, komin, schody ani poza dom', () => {
    for (const f of furniture) expect(collides(f, blockers), f.id).toBe(false);
  });

  it('każdy mebel stoi w całości w swoim pomieszczeniu (wyjątki: ścianka w przejściu, wyspa wychodząca na jadalnię)', () => {
    for (const f of furniture) {
      const allowed = ROOM_EXCEPTIONS[f.id] || [homeRoom(f)];
      const pts = [[f.x, f.y], ...corners(f).map(([x, y]) => [x + (f.x - x) * 0.02, y + (f.y - y) * 0.02])];
      for (const [x, y] of pts) expect(allowed, `${f.id}: punkt ${x.toFixed(2)}, ${y.toFixed(2)} → ${roomAt(x, y)}`).toContain(roomAt(x, y));
    }
    expect(roomAt(byId.get('mt-p5-wyspa-barek').x, byId.get('mt-p5-wyspa-barek').y)).toBe('0/5');
    expect(furniture.filter((f) => roomAt(f.x, f.y) === '0/7').map((f) => f.id)).toEqual([]); // nic na schodach
  });

  it('meble mieszczą się pod sufitem i pod podciągiem', () => {
    for (const f of furniture) {
      for (const [x, y] of [[f.x, f.y], ...corners(f).map(([cx, cy]) => [cx + (f.x - cx) * 0.02, cy + (f.y - cy) * 0.02])]) {
        const ceil = collision.ceilingAt(LEVEL, x, y);
        if (ceil != null) expect(top(f), f.id).toBeLessThanOrEqual(ceil + 1e-6);
      }
    }
  });

  it('meble nie nachodzą na siebie (poza dywanami, wiszącymi nad stojącymi, krzesłami, hokerami i rowerami w stojaku)', () => {
    const bad = [];
    for (let i = 0; i < furniture.length; i++) {
      for (let j = i + 1; j < furniture.length; j++) {
        const [a, b] = [furniture[i], furniture[j]];
        if (overlap(a, b) && !mayOverlap(a, b)) bad.push(`${a.id} × ${b.id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('wiatrołap: konsola i siedzisko przy ceglanej ścianie, lustro w czarnej ramie, dywan; korytarz bez konsoli', () => {
    const types = (room) => furniture.filter((f) => homeRoom(f) === room).map((f) => f.type);
    expect(types('0/1')).toEqual(expect.arrayContaining(['szafa-wnekowa', 'scianka-szklana-drzwi', 'siedzisko', 'konsola', 'lustro', 'dywan-okragly']));
    expect(types('0/2')).not.toContain('konsola');
    const console_ = furniture.find((f) => f.type === 'konsola');
    for (const [x, y] of corners(console_)) expect(roomAt(x + (console_.x - x) * 0.02, y + (console_.y - y) * 0.02)).toBe('0/1');
    // ściana wschodnia wiatrołapu (x = 8,80) jest tą w cegle – konsola i siedzisko stoją do niej tyłem
    expect(finishes['parter:0/1:wall:1'].id).toBe('cegla-stara-czerwona');
    for (const f of [console_, byId.get('mt-p1-siedzisko')]) {
      expect(f.rot).toBe(270);
      expect(aabb(f)[2]).toBeCloseTo(8.8, 6);
    }
    expect(getType('konsola').color2).toBeTruthy(); // blat w drugim kolorze
    expect(console_.color).toBe('#b5895a');
    for (const id of ['mt-p1-lustro', 'mt-p1-lustro-konsola']) expect(byId.get(id).color).toBe('#2e3033');
  });

  it('krzesła i hokery są wsunięte najwyżej 25 cm, a hokery stoją po stronie jadalni', () => {
    const table = aabb(byId.get('mt-p6-stol'));
    const chairs = furniture.filter((f) => /^mt-p6-krzeslo-/.test(f.id));
    expect(chairs).toHaveLength(6);
    for (const ch of chairs) {
      const [x0, , x1] = aabb(ch);
      expect(Math.min(x1, table[2]) - Math.max(x0, table[0]), ch.id).toBeLessThanOrEqual(0.25 + 1e-9);
    }
    const island = aabb(byId.get('mt-p5-wyspa-barek'));
    const stools = furniture.filter((f) => f.type === 'hoker');
    expect(stools.length).toBeGreaterThanOrEqual(2);
    for (const st of stools) {
      const [x0, , x1] = aabb(st);
      expect(island[2] - x0, st.id).toBeLessThanOrEqual(0.25 + 1e-9);
      expect(x1, st.id).toBeGreaterThan(island[2]);
      expect(roomAt(st.x, st.y)).toBe('0/6');
    }
  });

  it('wyspa-barek w „L” z rzędem okiennym (wybór właścicieli): dosunięta do ściany okiennej, od południa przejście ≥ 0,90 m, fronty do kuchni', () => {
    const f = byId.get('mt-p5-wyspa-barek');
    const [x0, y0, x1, y1] = aabb(f);
    const edge = 9.05; // wschodnia krawędź pomieszczenia 0/5
    expect(f.type).toBe('wyspa-barek');
    expect(x0).toBeLessThan(edge);
    expect(x1 - edge).toBeGreaterThan(0.1);
    expect(x1 - edge).toBeLessThanOrEqual(0.4); // „delikatnie” wychodzi na jadalnię
    expect(f.rot).toBe(270); // tył (nawis barowy) na wschód = jadalnia
    expect(getType(f.type).color2).toBeTruthy();
    const room = collision.roomPolygon(LEVEL, '0/5');
    const ys = room.map((p) => p[1]);
    expect(Math.max(...ys) - y1).toBeLessThanOrEqual(0.01); // północnym końcem przy ścianie okiennej
    expect(y0 - Math.min(...ys)).toBeGreaterThanOrEqual(0.9 - 1e-9); // jedyne wejście do kuchni: od południa
    // rząd okienny dochodzi do wyspy (ramię „L” bez szczeliny)
    const link = aabb(byId.get('mt-p5-dolna-3'));
    expect(Math.abs(link[2] - x0)).toBeLessThanOrEqual(0.01);
    // do rzędu południowego (także po skosie) zostaje min. 0,85 m
    for (const g of furniture) {
      if (g === f || !standing(g) || g.type === 'hoker' || bottom(g) >= top(f) || /^mt-p5-(dolna-[123]|plyta|zlew)$/.test(g.id)) continue;
      for (const [x, y] of corners(f)) expect(distToFootprint(g, x, y), g.id).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('stół na 6 osób: 6 krzeseł, za każdym krzesłem min. 70 cm wolnego', () => {
    const table = byId.get('mt-p6-stol');
    expect(table.type).toBe('stol-6');
    const chairs = furniture.filter((f) => /^mt-p6-krzeslo-/.test(f.id));
    expect(chairs).toHaveLength(6);
    for (const ch of chairs) {
      // pas 70 cm za oparciem (tył = +y lokalnie)
      const ly = (ch.d + 0.7) / 2;
      const zone = aabb({ x: ch.x - ly * Math.sin(ch.rot * RAD), y: ch.y + ly * Math.cos(ch.rot * RAD), rot: ch.rot, w: ch.w, d: 0.7 });
      expect(intersecting(shrink(zone), (g) => standing(g) && g !== ch), ch.id).toEqual([]);
      expect(collides({ x: (zone[0] + zone[2]) / 2, y: (zone[1] + zone[3]) / 2, rot: 0, w: zone[2] - zone[0] - 0.01, d: zone[3] - zone[1] - 0.01 }, blockers), ch.id).toBe(false);
    }
  });

  it('łazienka 0/3: WC i mała umywalka, przed każdym min. 60 cm wolnego', () => {
    const items = furniture.filter((f) => homeRoom(f) === '0/3');
    expect(items.map((f) => f.type).sort()).toEqual(['lustro-okragle', 'umywalka-nablatowa', 'wc-podwieszane']);
    for (const f of items.filter((g) => !g.z)) {
      const zone = shrink(frontZone(f, 0.6));
      expect(intersecting(zone, (g) => standing(g) && g !== f && !g.z), f.id).toEqual([]);
      for (const [x, y] of [[zone[0], zone[1]], [zone[2], zone[1]], [zone[2], zone[3]], [zone[0], zone[3]]]) expect(roomAt(x, y), f.id).toBe('0/3');
    }
  });
});

describe('Montana / parter – drzwi, okna, przejścia', () => {
  const allDoors = level.openings.filter((o) => o.kind === 'door');
  const doors = allDoors.filter((o) => !slidingIds.has(o.id)); // rozwierne

  it('drzwi przesuwne do spiżarni: tor skrzydła przy ścianie kuchni wolny, otwór wolny z obu stron', () => {
    expect(sliding.map((d) => d.id)).toEqual(['DW4']);
    const d = sliding[0];
    expect(d.roomId).toBe('0/5'); // skrzydło po stronie kuchni
    // w pasie przy ścianie nie stoi ani nie wisi nic (dywanów w kuchni nie ma)
    expect(intersecting(shrink(d.keepClear, 0.001))).toEqual([]);
    for (const side of [1, -1]) expect(intersecting(zoneBeside(d.opening, 0.8, side), standing), `strona ${side}`).toEqual([]);
  });

  it('łuki otwierania drzwi rozwiernych są wolne', () => {
    expect(allDoors.length).toBe(5);
    expect(doors.length).toBe(4);
    for (const o of doors) {
      const pts = sectorPoints(leafOf(o));
      for (const f of furniture.filter(standing)) {
        expect(pts.some(([x, y]) => inFootprint(f, x, y, 1e-4)), `drzwi ${o.id} × ${f.id}`).toBe(false);
      }
    }
  });

  it('po drugiej stronie drzwi rozwiernych jest 80 cm wolnego dojścia', () => {
    for (const o of doors) {
      const sign = o.swing[0] === '+' ? 1 : -1;
      expect(intersecting(zoneBeside(o, 0.8, -sign), standing), `drzwi ${o.id}`).toEqual([]);
    }
  });

  it('ścianka szklana wypełnia przejście wiatrołap–korytarz na całą szerokość i wysokość', () => {
    const f = byId.get('mt-p1-scianka-szklana');
    const p = level.passages.find((q) => q.between.includes('0/1') && q.between.includes('0/2'));
    const [x0, y0, x1, y1] = aabb(f);
    expect(x0).toBeGreaterThanOrEqual(p.rect[0] - 1e-9);
    expect(x1).toBeLessThanOrEqual(p.rect[2] + 1e-9);
    expect(p.width - f.w).toBeLessThanOrEqual(0.005);
    expect(y0).toBeGreaterThanOrEqual(p.rect[1] - 1e-9);
    expect(y1).toBeLessThanOrEqual(p.rect[3] + 1e-9);
    expect(f.h).toBeCloseTo(Math.min(p.height, level.ceilingHeight), 6);
    // skrzydła (do korytarza) mają wolny łuk, a po obu stronach ścianki zostaje ≥ 1,20 m wolnej szerokości
    for (const leaf of glassLeaves(f)) {
      const pts = sectorPoints(leaf);
      for (const g of furniture.filter((q) => standing(q) && q !== f)) {
        expect(pts.some(([x, y]) => inFootprint(g, x, y, 1e-4)), `${leaf.id} × ${g.id}`).toBe(false);
      }
    }
    for (const band of [[x0, y1, x1, y1 + 0.9], [x0, y0 - 0.8, x1, y0]]) {
      const taken = furniture.filter((g) => standing(g) && g !== f && penetration(g, band)).map((g) => [aabb(g)[0], aabb(g)[2]]);
      expect(widestGap(x0, x1, taken)).toBeGreaterThanOrEqual(1.2);
    }
    // w korytarzu, w zasięgu skrzydeł, nie stoi nic
    expect(intersecting([x0, y1, x1, y1 + 0.9], (g) => standing(g) && g !== f)).toEqual([]);
  });

  it('ścianka szklana: prawe skrzydło jest czynne – wolne dojście z wiatrołapu, otwarte leży na ścianie i nie blokuje żadnych drzwi', () => {
    const f = byId.get('mt-p1-scianka-szklana');
    const [left, right] = glassLeaves(f);
    const [, y0] = aabb(f);
    expect(right.r).toBeCloseTo(0.9, 6);
    // ostatnie 35 cm przed prawym skrzydłem (od strony wiatrołapu) wolne na całą szerokość skrzydła 0,90 m
    const lane = [right.hinge[0] - right.r, y0 - 0.35, right.hinge[0], y0];
    expect(intersecting(shrink(lane, 0.001), (g) => standing(g) && g !== f)).toEqual([]);
    const console_ = aabb(byId.get('mt-p1-konsola'));
    expect(y0 - console_[3], 'konsola kończy się min. 35 cm przed ścianką').toBeGreaterThanOrEqual(0.35);
    // obok samej konsoli pas w osi skrzydła ma ≥ 74 cm (po lewej otwarta podłoga wiatrołapu – nic tam nie stoi)
    expect(console_[0] - (right.hinge[0] - right.r)).toBeGreaterThanOrEqual(0.74);
    expect(intersecting([lane[0] - 0.6, console_[1], console_[0], y0], (g) => standing(g) && g !== f)).toEqual([]);
    // osoba 80 cm (koło r = 0,40) mieści się w świetle prawego skrzydła: tuż przed ścianką i w jej osi;
    // całe dojście przejściem 80 cm od drzwi wejściowych sprawdza siatka w „ciągach komunikacyjnych” (cele „ścianka szklana…”)
    const cx = right.hinge[0] - right.r / 2;
    for (const y of [y0, f.y]) {
      for (const g of furniture) if (standing(g) && g !== f) expect(distToFootprint(g, cx, y), `${g.id} @ y ${y}`).toBeGreaterThanOrEqual(0.4);
    }
    // otwarte na 90° prawe skrzydło leży przy pełnej ścianie W3 (nie w otwarciu na salon)
    const w3 = level.walls.find((w) => w.id === 'W3').rect;
    expect(w3[0] - right.hinge[0]).toBeLessThanOrEqual(0.1);
    expect(right.hinge[1] + right.r).toBeLessThanOrEqual(w3[3]);
    // łuki drzwi rozwiernych korytarza: prawe skrzydło nie koliduje z żadnym…
    const swing = level.openings.filter((o) => o.kind === 'door' && !slidingIds.has(o.id)).map(leafOf);
    const openLeaf = (l) => ({ x: l.hinge[0] + l.open[0] * l.r / 2, y: l.hinge[1] + l.open[1] * l.r / 2, rot: 0, w: 0.04, d: l.r });
    const blocked = (l) => swing.filter((dw) => sectorPoints(dw).some(([x, y]) => inFootprint(openLeaf(l), x, y))).map((dw) => dw.id);
    expect(blocked(right)).toEqual([]);
    // …a lewe – ZNANY KOMPROMIS – otwarte na 90° stoi w łuku drzwi łazienki 0/3 (DW5): lewe skrzydło jest bierne,
    // otwierane okazjonalnie. Gdy ten warunek przestanie być prawdą, trzeba poprawić opis w danych i w README.
    expect(blocked(left)).toEqual(['DW5']);
  });

  it('drzwi wejściowe, tarasowe i przeszklenie do podłogi mają 80 cm wolnej podłogi; przed bramą stoi tylko quad', () => {
    const big = level.openings.filter((o) => ['entranceDoor', 'glazedDoor', 'garageDoor'].includes(o.kind));
    expect(big.map((o) => o.id).sort()).toEqual(['O3', 'O4', 'O7', 'O8']);
    for (const o of big) {
      const found = intersecting(zoneBeside(o, 0.8, insideSide(o)), standing);
      if (o.kind === 'garageDoor') expect(found.every((id) => byId.get(id).type === 'quad'), `brama: ${found}`).toBe(true);
      else expect(found, `otwór ${o.id}`).toEqual([]);
    }
  });

  it('pod oknami stoją tylko meble niższe niż parapet', () => {
    for (const o of level.openings.filter((q) => q.kind === 'window')) {
      for (const id of intersecting(zoneBeside(o, 0.5, insideSide(o)), standing)) {
        expect(top(byId.get(id)), `okno ${o.id} × ${id}`).toBeLessThanOrEqual(o.sill + 1e-9);
      }
    }
  });

  it('otwarcia pod podciągiem: salon–korytarz całe wolne, kuchnia–jadalnia z przejściem ≥ 0,90 m na południe od wyspy', () => {
    for (const [between, min] of [[['0/2', '0/6'], 3.0], [['0/5', '0/6'], 0.9]]) {
      const p = level.passages.find((q) => between.every((r) => q.between.includes(r)));
      const taken = furniture.filter((f) => standing(f) && penetration(f, p.rect)).map((f) => [aabb(f)[1], aabb(f)[3]]);
      expect(widestGap(p.rect[1], p.rect[3], taken), between.join('–')).toBeGreaterThanOrEqual(min);
      if (min < 1) {
        expect(taken).toHaveLength(1); // tylko wyspa
        expect(taken[0][0] - p.rect[1], 'przejście od południa').toBeGreaterThanOrEqual(min - 1e-9);
        expect(p.rect[3] - taken[0][1], 'wyspa dosunięta do ściany okiennej').toBeLessThanOrEqual(0.01);
      }
    }
  });
});

describe('Montana / parter – ciągi komunikacyjne', () => {
  // Postać: 80 cm między meblami (promień 0,40), przy murach 0,28 (drzwi D60 z projektu mają 60 cm w świetle).
  const STEP = 0.025;
  const R_FURNITURE = 0.4;
  const R_WALL = 0.28;
  const NX = Math.round(13.6 / STEP) + 1;
  const NY = Math.round(10.1 / STEP) + 1;
  const obstacles = furniture.filter((f) => standing(f) && bottom(f) < 0.5 && f.type !== 'scianka-szklana-drzwi');

  const free = new Uint8Array(NX * NY);
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const x = i * STEP;
      const y = j * STEP;
      let ok = roomAt(x, y) != null || walls.every((w) => distToRect(w.rect, x, y) > 0); // światła drzwi nie należą do pomieszczeń
      if (ok) ok = walls.every((w) => distToRect(w.rect, x, y) >= R_WALL - 1e-9);
      if (ok) ok = obstacles.every((f) => distToFootprint(f, x, y) >= R_FURNITURE - 1e-9);
      if (ok) ok = x > 0.25 && x < 13.35 && y > 0.25 && y < 9.85;
      free[j * NX + i] = ok ? 1 : 0;
    }
  }
  const cell = (x, y) => Math.round(y / STEP) * NX + Math.round(x / STEP);
  const reached = new Uint8Array(NX * NY);
  const start = cell(7.5, 1.3); // wiatrołap, za drzwiami wejściowymi
  const queue = [start];
  reached[start] = free[start];
  while (queue.length) {
    const c = queue.pop();
    for (const n of [c - 1, c + 1, c - NX, c + NX]) {
      if (n >= 0 && n < free.length && free[n] && !reached[n]) {
        reached[n] = 1;
        queue.push(n);
      }
    }
  }

  const TARGETS = {
    'korytarz': [7.8, 4.5],
    'łazienka (między umywalką a WC)': [6.2, 3.6],
    'schody – pierwszy stopień': [8.8, 6.3],
    'kuchnia – przed lodówką': [5.8, 8.3],
    'kuchnia – przed zlewem': [7.3, 8.6],
    'kuchnia – wejście na południe od wyspy': [8.95, 7.45],
    'wiatrołap – przed konsolą': [8.0, 2.0],
    'ścianka szklana – w świetle prawego (czynnego) skrzydła': [8.25, 2.7],
    'korytarz – tuż za prawym skrzydłem ścianki': [8.25, 3.1],
    'spiżarnia': [4.2, 8.2],
    'garaż – środek': [2.7, 2.0],
    'garaż – przed drzwiami do pom. technicznego': [0.95, 6.3],
    'garaż – przed drzwiami do spiżarni': [4.2, 6.3],
    'garaż – wejście na bieżnię': [2.7, 2.8],
    'pom. techniczne': [1.5, 8.5],
    'salon – przed RTV': [10.1, 1.6],
    'salon – przy fotelu': [11.0, 5.6],
    'jadalnia – między hokerami a krzesłami': [10.2, 7.8],
    'jadalnia – drzwi tarasowe': [11.2, 9.35],
    'jadalnia – przy przeszkleniu': [12.9, 6.5],
  };

  it('start w wiatrołapie jest wolny', () => {
    expect(free[start]).toBe(1);
  });

  for (const [name, [x, y]] of Object.entries(TARGETS)) {
    it(`z wiatrołapu dochodzi się przejściami ≥ 80 cm: ${name}`, () => {
      expect(free[cell(x, y)], 'punkt docelowy zastawiony').toBe(1);
      expect(reached[cell(x, y)], 'brak przejścia').toBe(1);
    });
  }
});

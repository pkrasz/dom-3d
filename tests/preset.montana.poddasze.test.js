// Wariant „Montana” – poddasze: twarde wymagania aranżacji sprawdzone liczbowo na prawdziwym house.json + design.json.
// Meble: pomieszczenie, ściany (te same funkcje co aplikacja – features/furniture/placement.js), drzwi, okna do podłogi,
// nakładanie, wysokość pod skosem i belkami, przejścia 80 cm, dojście do mebli. Wykończenia: znane materiały i powierzchnie.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildHouse } from '../src/geometry/buildHouse.js';
import { buildCollision } from '../src/geometry/collision.js';
import { pointInPolygon } from '../src/geometry/plan.js';
import { beamOptions } from '../src/geometry/design.js';
import { aabb, collides, corners, penetration, withHouseBounds, EPS } from '../src/features/furniture/placement.js';
import { CATALOG, MOUNT_RANGE } from '../src/features/furniture/catalog.js';
import { createStarterFurniture } from '../src/features/furniture/starter.js';
import { MATERIALS } from '../src/features/finishes/library.js';
import { PAINT_GROUPS } from '../src/features/finishes/palette.js';
import { sanitizeVariant } from '../src/features/variants/validate.js';
import { finishes, furniture } from '../src/features/variants/presets/montana/poddasze.js';
import { house } from './helpers.js';

const design = JSON.parse(readFileSync(new URL('../design.json', import.meta.url), 'utf8'));
const LEVEL = 'poddasze';
const level = house.levels.find((l) => l.id === LEVEL);
const built = buildHouse(house, design);
const collision = buildCollision(house, design);
const solidWalls = collision.walls(LEVEL);
const blockers = withHouseBounds(solidWalls);
const ROOMS = ['1/2', '1/3', '1/4', '1/5', '1/6', '1/7', '1/8', '1/9', '1/10', '1/11'];
const OPEN_ROOMS = design.openCeiling.rooms;

const typeById = new Map(CATALOG.map((t) => [t.id, t]));
const RUGS = new Set(['dywan', 'dywan-okragly']);
const isRug = (f) => RUGS.has(f.type);
const isHanging = (f) => (f.z || 0) > 0;
const isBed = (f) => f.type.startsWith('lozko-');
/** Pomieszczenie mebla z jego id: 'mt-1-9-lozko' → '1/9', 'start-szafa-1-11-a' → '1/11'. */
const roomOf = (f) => {
  const m = /^(?:mt|start-szafa)-1-(\d+)(?:-|$)/.exec(f.id);
  return m ? `1/${m[1]}` : null;
};
const inRoom = (roomId) => furniture.filter((f) => roomOf(f) === roomId);
const polygonOf = (roomId) => level.rooms.find((r) => r.id === roomId).polygon;
/** Rzut pomniejszony o margines z każdej strony (punkty kontrolne nie leżą dokładnie na licu ściany). */
const shrunk = (f, m = 0.01) => ({ ...f, w: Math.max(f.w - 2 * m, f.w / 2), d: Math.max(f.d - 2 * m, f.d / 2) });
/** Punkty kontrolne rzutu: narożniki, środki boków i środek. */
function probes(f) {
  const cs = corners(shrunk(f));
  const mids = cs.map((c, i) => [(c[0] + cs[(i + 1) % 4][0]) / 2, (c[1] + cs[(i + 1) % 4][1]) / 2]);
  return [...cs, ...mids, [f.x, f.y]];
}
const overlapsRect = (f, rect) => penetration(f, rect) !== null;
const rectsOverlap = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > EPS && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > EPS;
/** Odległość punktu od rzutu mebla (0 w środku). */
function distToItem(x, y, f) {
  const a = (-(f.rot || 0) * Math.PI) / 180;
  const dx = x - f.x;
  const dy = y - f.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.hypot(Math.max(Math.abs(lx) - f.w / 2, 0), Math.max(Math.abs(ly) - f.d / 2, 0));
}
const distToRect = (x, y, r) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - y, 0, y - r[3]));

// ---------------------------------------------------------------- drzwi i okna z house.json
const wallRect = (id) => level.walls.find((w) => w.id === id).rect;
/** Otwór w ścianie jako prostokąt w rzucie + oś ściany ('x' = ściana biegnie wzdłuż x). */
function openingGeometry(o) {
  const r = wallRect(o.wall);
  const axis = r[2] - r[0] > r[3] - r[1] ? 'x' : 'y';
  const rect = axis === 'x' ? [o.at[0], r[1], o.at[1], r[3]] : [r[0], o.at[0], r[2], o.at[1]];
  return { axis, rect };
}
/** Prostokąt przed otworem po stronie `sign` (+1 / −1 wzdłuż normalnej ściany), o głębokości depth. */
function zoneBeside(o, sign, depth) {
  const { axis, rect } = openingGeometry(o);
  if (axis === 'x') return sign > 0 ? [rect[0], rect[3], rect[2], rect[3] + depth] : [rect[0], rect[1] - depth, rect[2], rect[1]];
  return sign > 0 ? [rect[2], rect[1], rect[2] + depth, rect[3]] : [rect[0] - depth, rect[1], rect[0], rect[3]];
}
const doors = level.openings.filter((o) => o.kind === 'door');
const passages = level.openings.filter((o) => o.kind === 'passage');
const frenchWindows = level.openings.filter((o) => o.kind === 'frenchWindow');
const PASS_DEPTH = 0.8; // wolne przejście przed drzwiami po stronie bez skrzydła
/** Strefy, w których nie może stać nic poza dywanem: łuk skrzydła (kwadrat leaf + 3 cm) i 80 cm po drugiej stronie. */
function doorZones(o) {
  const sign = o.swing ? (o.swing[0] === '+' ? 1 : -1) : 0;
  const swingDepth = (o.leaf || o.width) + 0.03;
  if (!sign) return [zoneBeside(o, 1, PASS_DEPTH), zoneBeside(o, -1, PASS_DEPTH)];
  return [zoneBeside(o, sign, swingDepth), zoneBeside(o, -sign, PASS_DEPTH)];
}
/** Punkty wejścia: środek otworu, 45 cm od lica ściany, po obu stronach – z pomieszczeniem, w którym leżą. */
function entryPoints(o) {
  return [1, -1].map((sign) => {
    const z = zoneBeside(o, sign, 0.9);
    const { axis } = openingGeometry(o);
    const mid = axis === 'x' ? [(z[0] + z[2]) / 2, sign > 0 ? z[1] + 0.45 : z[3] - 0.45] : [sign > 0 ? z[0] + 0.45 : z[2] - 0.45, (z[1] + z[3]) / 2];
    return { x: mid[0], y: mid[1], roomId: collision.pointInRoom(LEVEL, mid[0], mid[1]), door: o.id };
  });
}

// ---------------------------------------------------------------- siatka przejść
const GRID = 0.05;
/**
 * Komórki pomieszczenia osiągalne z drzwi dla „osoby” o promieniu r (przejście szerokości 2r):
 * wolna komórka = w wieloboku pomieszczenia i co najmniej r od każdej ściany, komina, balustrady i mebla stojącego.
 */
function reachable(roomId, r) {
  const poly = polygonOf(roomId);
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const nx = Math.ceil((Math.max(...xs) - x0) / GRID);
  const ny = Math.ceil((Math.max(...ys) - y0) / GRID);
  const obstacles = inRoom(roomId).filter((f) => !isRug(f) && !isHanging(f));
  const free = new Uint8Array(nx * ny);
  const center = (i, j) => [x0 + (i + 0.5) * GRID, y0 + (j + 0.5) * GRID];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const [x, y] = center(i, j);
      if (!pointInPolygon(x, y, poly)) continue;
      if (solidWalls.some((w) => distToRect(x, y, w.rect) < r)) continue;
      if (obstacles.some((f) => distToItem(x, y, f) < r)) continue;
      free[i * ny + j] = 1;
    }
  }
  const starts = [...doors, ...passages].flatMap(entryPoints).filter((p) => p.roomId === roomId);
  const cellOf = (p) => {
    // najbliższa wolna komórka w promieniu 10 cm od punktu wejścia
    let best = -1;
    let bestD = 0.1001;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      if (!free[i * ny + j]) continue;
      const [x, y] = center(i, j);
      const dist = Math.hypot(x - p.x, y - p.y);
      if (dist < bestD) { best = i * ny + j; bestD = dist; }
    }
    return best;
  };
  const startCells = starts.map(cellOf);
  const seen = new Uint8Array(nx * ny);
  const queue = startCells[0] >= 0 ? [startCells[0]] : [];
  if (queue.length) seen[queue[0]] = 1;
  while (queue.length) {
    const c = queue.pop();
    const i = Math.floor(c / ny);
    const j = c % ny;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const n = a * ny + b;
      if (free[n] && !seen[n]) { seen[n] = 1; queue.push(n); }
    }
  }
  const cells = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) if (seen[i * ny + j]) cells.push(center(i, j));
  return { starts, startCells, seen, cells };
}

// ================================================================ MEBLE
describe('Montana – poddasze: meble', () => {
  it('kształt danych: unikalne id z prefiksem, znane typy, wymiary w zakresie typu, obrót co 90°', () => {
    const ids = furniture.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of furniture) {
      expect(f.id, f.id).toMatch(/^(mt-|start-)/);
      expect(f.levelId).toBe(LEVEL);
      expect(ROOMS, f.id).toContain(roomOf(f));
      const type = typeById.get(f.type);
      expect(type, `${f.id}: typ ${f.type}`).toBeTruthy();
      for (const k of ['w', 'd', 'h']) {
        expect(f[k], `${f.id}.${k}`).toBeGreaterThanOrEqual(type.range[k][0] - 1e-9);
        expect(f[k], `${f.id}.${k}`).toBeLessThanOrEqual(type.range[k][1] + 1e-9);
      }
      expect([0, 90, 180, 270], f.id).toContain(f.rot);
      expect(f.color, f.id).toMatch(/^#[0-9a-f]{6}$/);
      if (f.color2 !== undefined) {
        expect(f.color2, f.id).toMatch(/^#[0-9a-f]{6}$/);
        expect(type.color2, `${f.id}: typ bez drugiego koloru`).toBeTruthy();
      }
      if (f.z !== undefined) {
        expect(type.mount, `${f.id}: z tylko dla mebli wiszących`).toBeDefined();
        expect(f.z).toBeGreaterThanOrEqual(MOUNT_RANGE[0]);
        expect(f.z).toBeLessThanOrEqual(MOUNT_RANGE[1]);
      } else {
        expect(type.mount, `${f.id}: mebel wiszący bez z`).toBeUndefined();
      }
    }
    // każde pomieszczenie coś dostało
    for (const roomId of ROOMS) expect(inRoom(roomId).length, roomId).toBeGreaterThan(0);
  });

  it('meble z projektu: te same id, położenie i wymiary co createStarterFurniture()', () => {
    const starter = createStarterFurniture().filter((f) => f.levelId === LEVEL);
    const mine = furniture.filter((f) => f.id.startsWith('start-'));
    expect(mine.map((f) => f.id).sort()).toEqual(starter.map((f) => f.id).sort());
    for (const s of starter) {
      const m = mine.find((f) => f.id === s.id);
      for (const k of ['type', 'x', 'y', 'rot', 'w', 'd', 'h']) expect(m[k], `${s.id}.${k}`).toBe(s[k]);
    }
  });

  it('każdy mebel stoi w całości w swoim pomieszczeniu i nie wchodzi w ściany, kominy ani balustrady', () => {
    for (const f of furniture) {
      expect(collides(f, blockers), `${f.id} wchodzi w ścianę`).toBe(false);
      for (const [x, y] of probes(f)) expect(collision.pointInRoom(LEVEL, x, y), `${f.id} @ ${x.toFixed(2)},${y.toFixed(2)}`).toBe(roomOf(f));
    }
  });

  it('nic nie stoi w łuku skrzydła drzwi ani w 80 cm przejścia przed drzwiami i przejściem (poza dywanem)', () => {
    expect(doors.length).toBe(9);
    for (const o of [...doors, ...passages]) {
      for (const zone of doorZones(o)) {
        const z = [zone[0] + 0.005, zone[1] + 0.005, zone[2] - 0.005, zone[3] - 0.005]; // 5 mm tolerancji na styk
        for (const f of furniture) if (!isRug(f)) expect(overlapsRect(f, z), `${f.id} w strefie drzwi ${o.id}`).toBe(false);
      }
    }
  });

  it('nic nie stoi przed oknem do podłogi (pas 60 cm; dywan może)', () => {
    expect(frenchWindows.length).toBe(4);
    for (const o of frenchWindows) {
      const r = wallRect(o.wall);
      const sign = r[0] < 1 ? 1 : -1; // szczyt zachodni → pas w stronę +x, wschodni → −x
      const zone = zoneBeside(o, sign, 0.6);
      for (const f of furniture) if (!isRug(f)) expect(overlapsRect(f, zone), `${f.id} przed oknem ${o.id}`).toBe(false);
    }
  });

  it('meble nie nachodzą na siebie w rzucie (wyjątki: dywan pod meblami, mebel wiszący nad niższym)', () => {
    for (let i = 0; i < furniture.length; i++) {
      for (let j = i + 1; j < furniture.length; j++) {
        const a = furniture[i];
        const b = furniture[j];
        if (isRug(a) || isRug(b)) continue;
        const [a0, a1] = [a.z || 0, (a.z || 0) + a.h];
        const [b0, b1] = [b.z || 0, (b.z || 0) + b.h];
        if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) continue; // jeden w całości nad drugim
        expect(rectsOverlap(aabb(a), aabb(b)), `${a.id} × ${b.id}`).toBe(false);
      }
    }
    // dywany leżą na wolnej podłodze swojego pomieszczenia i nie nachodzą na siebie
    const rugs = furniture.filter(isRug);
    for (let i = 0; i < rugs.length; i++) for (let j = i + 1; j < rugs.length; j++) expect(rectsOverlap(aabb(rugs[i]), aabb(rugs[j]))).toBe(false);
  });

  it('każdy mebel mieści się pod skosem / sufitem w całym swoim rzucie, a w pomieszczeniach otwartych także pod belkami', () => {
    const beams = beamOptions(design);
    const purlinUnderside = beams.collar.underside - design.openCeiling.beams.purlins.height; // 2,49 m
    expect(purlinUnderside).toBeCloseTo(2.49, 6);
    for (const f of furniture) {
      const top = (f.z || 0) + f.h;
      for (const [x, y] of probes(f)) {
        const ceiling = collision.ceilingAt(LEVEL, x, y);
        expect(ceiling, `${f.id}: brak wysokości w ${x.toFixed(2)},${y.toFixed(2)}`).toBeGreaterThan(1.4);
        expect(top, `${f.id}: ${top} m pod skosem ${ceiling.toFixed(2)} m`).toBeLessThanOrEqual(ceiling + 1e-9);
      }
      if (OPEN_ROOMS.includes(roomOf(f))) expect(top, `${f.id} pod belkami`).toBeLessThanOrEqual(purlinUnderside);
      else expect(top, f.id).toBeLessThanOrEqual(level.ceilingHeight);
    }
    // wzór z zadania: h = min(2,55; 1,425 + 0,70 · u) – kontrola, że ceilingAt liczy to samo poza pomieszczeniami otwartymi
    expect(collision.ceilingAt(LEVEL, 11, 0.25 + 0.5)).toBeCloseTo(1.425 + 0.35, 6);
    expect(collision.ceilingAt(LEVEL, 11, 3)).toBeCloseTo(2.55, 6);
  });

  it('łóżka: wezgłowie przy pełnej ścianie (nie przy oknie ani drzwiach), nie pod oknem dachowym', () => {
    const beds = furniture.filter(isBed);
    expect(beds.map((b) => b.type).sort()).toEqual(['lozko-120', 'lozko-160', 'lozko-domek']);
    const windowRects = frenchWindows.map((o) => openingGeometry(o).rect);
    for (const bed of beds) {
      const cs = corners(bed); // [lewy-front, prawy-front, prawy-tył, lewy-tył]
      const [bx, by] = [cs[2][0] - cs[1][0], cs[2][1] - cs[1][1]];
      const len = Math.hypot(bx, by);
      for (let k = 0; k <= 8; k++) {
        // punkty 6 cm za wezgłowiem muszą leżeć w murze, a nie w otworze drzwi ani w oknie
        const t = 0.05 + (0.9 * k) / 8;
        const x = cs[3][0] + (cs[2][0] - cs[3][0]) * t + (bx / len) * 0.06;
        const y = cs[3][1] + (cs[2][1] - cs[3][1]) * t + (by / len) * 0.06;
        expect(solidWalls.some((w) => w.kind === 'wall' && distToRect(x, y, w.rect) === 0), `${bed.id}: wezgłowie bez ściany`).toBe(true);
        expect(windowRects.some((r) => distToRect(x, y, r) === 0), `${bed.id}: wezgłowie przy oknie`).toBe(false);
      }
      for (const rw of level.roofWindows) expect(overlapsRect(bed, rw.plan), `${bed.id} pod oknem ${rw.id}`).toBe(false);
    }
    // łóżeczko też nie stoi pod oknem dachowym
    const crib = furniture.find((f) => f.type === 'lozeczko');
    for (const rw of level.roofWindows) expect(overlapsRect(crib, rw.plan)).toBe(false);
  });

  it('ciągi komunikacyjne min. 80 cm: wszystkie drzwi pomieszczenia są połączone i do każdego mebla da się dojść', () => {
    const R = 0.39; // promień „osoby”: przejście 78 cm + rozdzielczość siatki 5 cm ≈ 80 cm
    for (const roomId of ROOMS) {
      const { starts, startCells, seen, cells } = reachable(roomId, R);
      expect(starts.length, `${roomId}: drzwi`).toBeGreaterThan(0);
      startCells.forEach((c, i) => {
        expect(c, `${roomId}: zastawione wejście ${starts[i].door}`).toBeGreaterThanOrEqual(0);
        expect(seen[c], `${roomId}: brak przejścia 80 cm do drzwi ${starts[i].door}`).toBe(1);
      });
      for (const f of inRoom(roomId)) {
        if (isRug(f) || isHanging(f)) continue;
        // szafka nocna stoi w dojściu do łóżka – tam wystarcza 60 cm (osobny test łóżka podwójnego)
        const narrow = f.type === 'szafka-nocna';
        const r = narrow ? 0.29 : R;
        const from = narrow ? reachable(roomId, r).cells : cells;
        const near = from.some(([x, y]) => distToItem(x, y, f) <= r + 0.15);
        expect(near, `${roomId}: brak dojścia do ${f.id}`).toBe(true);
      }
    }
  });

  it('łóżko podwójne: dojście z obu stron (min. 60 cm), obok szafki nocne', () => {
    const bed = furniture.find((f) => f.type === 'lozko-160');
    const R = 0.29;
    const { cells } = reachable('1/9', R);
    const cs = corners(bed);
    const sides = { lewa: [cs[0], cs[3]], prawa: [cs[1], cs[2]] };
    for (const [name, [p, q]] of Object.entries(sides)) {
      const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const out = [mid[0] + (mid[0] - bed.x) * (R + 0.05) / (bed.w / 2), mid[1] + (mid[1] - bed.y) * (R + 0.05) / (bed.w / 2)];
      expect(cells.some(([x, y]) => Math.hypot(x - out[0], y - out[1]) <= 0.2), `strona ${name}`).toBe(true);
    }
    expect(inRoom('1/9').filter((f) => f.type === 'szafka-nocna').length).toBe(2);
  });

  it('biuro: miejsce na rozłożenie kanapy – 2,00 m głębokości na szerokości ≥ 1,05 m, reszta szerokości ≥ 1,50 m', () => {
    // Pełne 1,40 × 2,00 m nie mieści się razem z biurkiem i przejściem 80 cm od drzwi (patrz komentarz w danych):
    // krzesło biurowe i dywan się nie liczą (krzesło się odsuwa).
    const sofa = furniture.find((f) => f.type === 'kanapa-rozkladana');
    const desk = furniture.find((f) => f.type === 'biurko-komputerowe');
    const [x0, y0, , y1] = aabb(sofa); // stoi tyłem do ściany wschodniej – rozkłada się w stronę −x
    expect(sofa.rot).toBe(270);
    expect(y1 - y0).toBeGreaterThanOrEqual(1.3);
    const deskFront = aabb(desk)[1];
    const deskEnd = aabb(desk)[2];
    expect(deskFront - y0).toBeGreaterThanOrEqual(1.05 - 1e-9);
    expect(x0 - deskEnd).toBeGreaterThanOrEqual(1.5);
    const zones = [[x0 - 2.0, y0, x0, deskFront], [deskEnd, deskFront, x0, y1]];
    for (const zone of zones) {
      const probe = { x: (zone[0] + zone[2]) / 2, y: (zone[1] + zone[3]) / 2, rot: 0, w: zone[2] - zone[0] - 0.01, d: zone[3] - zone[1] - 0.01 };
      expect(collides(probe, blockers)).toBe(false);
      for (const [x, y] of corners(probe)) expect(collision.pointInRoom(LEVEL, x, y)).toBe('1/3');
      for (const f of inRoom('1/3')) {
        if (f === sofa || isRug(f) || isHanging(f) || f.type === 'krzeslo-biurowe') continue;
        expect(overlapsRect(f, [zone[0] + 0.005, zone[1] + 0.005, zone[2] - 0.005, zone[3] - 0.005]), `${f.id} w miejscu na rozłożenie kanapy`).toBe(false);
      }
    }
  });

  it('wyposażenie z życzeń właściciela jest na miejscu', () => {
    const types = (roomId) => inRoom(roomId).map((f) => f.type);
    expect(types('1/3')).toEqual(expect.arrayContaining(['biurko-komputerowe', 'krzeslo-biurowe', 'kanapa-rozkladana', 'regal', 'szafa-wnekowa']));
    expect(types('1/4')).toEqual(expect.arrayContaining(['lozko-120', 'biurko', 'krzeslo-biurowe', 'regal', 'szafa-wnekowa']));
    expect(types('1/5')).toEqual(expect.arrayContaining(['lozko-domek', 'regal-zabawki', 'stolik-dzieciecy', 'komoda', 'dywan-okragly']));
    expect(types('1/8')).toEqual(expect.arrayContaining(['lozeczko', 'komoda-przewijak', 'fotel-uszak', 'regal-zabawki', 'dywan-okragly']));
    expect(types('1/9')).toEqual(expect.arrayContaining(['lozko-160', 'szafka-nocna', 'dywan', 'fotel-uszak', 'szafa-wnekowa']));
    expect(types('1/10')).toEqual(expect.arrayContaining(['umywalka-nablatowa', 'prysznic-walk-in-prawy', 'lustro', 'wc-podwieszane']));
    expect(types('1/10').some((t) => t.startsWith('wanna'))).toBe(false);
    expect(types('1/7')).toEqual(expect.arrayContaining(['wanna-wolnostojaca', 'prysznic-walk-in-prawy', 'wc-podwieszane', 'bidet', 'umywalka-nablatowa']));
    const basin = furniture.find((f) => f.id === 'mt-1-7-umywalka');
    expect(basin.color2).toBe('#c2704f'); // misa w kolorze terakoty
    expect(basin.w).toBeLessThan(1.3); // jedna misa (dwie od 1,30 m – nie mieszczą się, patrz raport)
    // prysznice stoją w narożniku: tył i prawy bok przy ścianie (typ „prawy”)
    for (const s of furniture.filter((f) => f.type === 'prysznic-walk-in-prawy')) {
      const cs = corners(s); // [lewy-front, prawy-front, prawy-tył, lewy-tył]
      const corner = cs[2];
      const touching = solidWalls.filter((w) => w.kind === 'wall' && distToRect(corner[0], corner[1], w.rect) < 0.011);
      expect(touching.length, `${s.id}: narożnik dwóch ścian`).toBeGreaterThanOrEqual(2);
    }
  });
});

// ================================================================ WYKOŃCZENIA
describe('Montana – poddasze: wykończenia', () => {
  const surfaces = [...built.surfaces.values()].filter((s) => s.levelId === LEVEL);
  const materialById = new Map(MATERIALS.map((m) => [m.id, m]));
  const paints = new Set(PAINT_GROUPS.flatMap((g) => g.colors.map((c) => c.color)));
  const simple = (f) => (f.kind === 'split' ? [f.lower, f.upper] : [f]);

  it('każda powierzchnia poddasza ma wykończenie, a każde wykończenie trafia w istniejącą powierzchnię', () => {
    expect(surfaces.length).toBeGreaterThan(70);
    for (const s of surfaces) expect(finishes[s.id], `brak wykończenia: ${s.id} (${s.label})`).toBeTruthy();
    for (const id of Object.keys(finishes)) expect(built.surfaces.has(id), `nieznana powierzchnia: ${id}`).toBe(true);
    // sufit otwarty: bez 'ceiling' w 1/9, 1/10, 1/11
    for (const roomId of OPEN_ROOMS) expect(finishes[`${LEVEL}:${roomId}:ceiling`]).toBeUndefined();
  });

  it('tylko znane materiały, użyte zgodnie z przeznaczeniem; farby z palety; podział tylko na ścianach', () => {
    for (const [id, finish] of Object.entries(finishes)) {
      const s = built.surfaces.get(id);
      if (finish.kind === 'split') {
        expect(['wall', 'chimney', 'slope'], id).toContain(s.kind);
        expect(finish.height).toBeGreaterThan(0.3);
        expect(finish.height).toBeLessThan(s.heightM);
      }
      for (const f of simple(finish)) {
        if (f.kind === 'paint') expect(paints.has(f.color), `${id}: farba ${f.color} spoza palety`).toBe(true);
        else {
          expect(f.kind, id).toBe('material');
          const m = materialById.get(f.id);
          expect(m, `${id}: nieznany materiał ${f.id}`).toBeTruthy();
          expect([0, 90], id).toContain(f.rot);
          if (s.kind === 'floor') expect(['floor', 'both'], `${id}: ${f.id}`).toContain(m.use);
          else expect(['wall', 'both'], `${id}: ${f.id}`).toContain(m.use);
        }
      }
    }
  });

  it('życzenia właściciela: panele, lastryko, cegła, deski za łóżkiem, patchwork', () => {
    const idOf = (surfaceId) => finishes[surfaceId].id;
    for (const roomId of ['1/2', '1/3', '1/4', '1/5', '1/8', '1/9', '1/11']) expect(idOf(`${LEVEL}:${roomId}:floor`), roomId).toBe('panel-dab-cieply');
    for (const roomId of ['1/6', '1/7', '1/10']) expect(materialById.get(idOf(`${LEVEL}:${roomId}:floor`)).category, roomId).toBe('gres');
    expect(idOf(`${LEVEL}:1/7:floor`)).toBe('lastryko-cieple');
    expect(idOf(`${LEVEL}:1/7:wall:1`)).toBe('lastryko-cieple'); // ściana przy umywalce
    expect(idOf(`${LEVEL}:1/7:wall:3`)).toBe('plytka-terakota-30x60'); // ściana prysznica
    expect(idOf(`${LEVEL}:1/10:floor`)).toBe('patchwork-szaro-niebieski');
    const brick = [0, 1, 2, 3].filter((i) => idOf(`${LEVEL}:1/10:wall:${i}`) === 'cegla-stara-czerwona');
    expect(brick).toEqual([3]); // dokładnie jedna ściana w cegle
    for (const i of [0, 1, 2]) expect(idOf(`${LEVEL}:1/10:wall:${i}`)).toBe('plyta-bezowa-60x120');
    expect(idOf(`${LEVEL}:1/9:wall:0`)).toBe('deski-scienne-stare-cieple');
    expect(finishes[`${LEVEL}:1/9:wall:0`].rot).toBe(0); // deski poziomo
    // ściana z desek to ta za wezgłowiem łóżka
    const bed = furniture.find((f) => f.type === 'lozko-160');
    const wall = built.surfaces.get(`${LEVEL}:1/9:wall:0`);
    wall.mesh.geometry.computeBoundingBox();
    expect(aabb(bed)[1]).toBeCloseTo(wall.mesh.geometry.boundingBox.max.y, 2);
    // sufity i skosy w ciepłej bieli
    for (const s of surfaces.filter((x) => x.kind === 'ceiling' || x.kind === 'slope')) expect(finishes[s.id], s.id).toEqual({ kind: 'paint', color: '#f6f1e7' });
  });

  it('dane przechodzą walidację wariantów bez strat', () => {
    const raw = { id: 'montana-test', name: 'Montana', finishes, furniture, customMaterials: [] };
    let n = 0;
    const ctx = { makeId: () => `nowy-${++n}`, levelIds: new Set(house.levels.map((l) => l.id)), surfaceIds: new Set(built.surfaces.keys()) };
    const { variant, report } = sanitizeVariant(JSON.parse(JSON.stringify(raw)), ctx);
    expect(report).toEqual({ skippedSurfaces: 0, droppedFinishes: 0, droppedFurniture: 0, droppedMaterials: 0 });
    expect(n).toBe(0);
    expect(variant.finishes).toEqual(finishes);
    expect(variant.furniture).toEqual(furniture);
  });
});

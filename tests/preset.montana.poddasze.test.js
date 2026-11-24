// Wariant „Montana” – poddasze: twarde wymagania aranżacji sprawdzone liczbowo na prawdziwym house.json + design.json.
// Meble: pomieszczenie, ściany (te same funkcje co aplikacja – features/furniture/placement.js), drzwi, okna do podłogi,
// nakładanie, wysokość pod skosem i belkami, przejścia 80 cm, dojście do mebli, drzwi przesuwne (tor skrzydła), dodatkowe
// okna połaciowe, wolne miejsce przy sanitariatach. Wykończenia: znane materiały i powierzchnie.
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
/** Drzwi przesuwne z design.json (skrzydło jeździ po ścianie – nie ma łuku, za to pas keepClear przy ścianie). */
const sliding = collision.slidingDoors(LEVEL);
const slidingIds = new Set(sliding.map((d) => d.id));
/**
 * Strefy, w których nie może stać nic poza dywanem: łuk skrzydła (kwadrat leaf + 3 cm) i 80 cm po drugiej stronie;
 * przy drzwiach przesuwnych i przejściach 80 cm po obu stronach otworu.
 */
function doorZones(o) {
  const sign = o.swing && !slidingIds.has(o.id) ? (o.swing[0] === '+' ? 1 : -1) : 0;
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
    // wyjątek na życzenie właściciela: zabudowa w sypialni 1/9 usunięta (w jej miejscu toaletka)
    const starter = createStarterFurniture().filter((f) => f.levelId === LEVEL && f.id !== 'start-szafa-1-9');
    expect(starter).toHaveLength(9);
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

  it('drzwi przesuwne: tor skrzydła przy ścianie wolny od wszystkiego (także mebli wiszących), otwór wolny z obu stron', () => {
    expect(sliding.map((d) => d.id).sort()).toEqual(['DP1', 'DP2']);
    for (const d of sliding) {
      expect(d.roomId).toBe('1/9');
      const k = d.keepClear;
      const zone = [k[0] + 0.001, k[1] + 0.001, k[2] - 0.001, k[3] - 0.001];
      for (const f of furniture) if (!isRug(f)) expect(overlapsRect(f, zone), `${f.id} w torze skrzydła ${d.id}`).toBe(false);
      expect(d.clearWidth).toBeGreaterThanOrEqual(0.8);
      // strefy 80 cm po obu stronach otworu sprawdza test wyżej (doorZones) – tu kontrola, że obejmuje drzwi przesuwne
      expect(doorZones(d.opening)).toHaveLength(2);
      for (const z of doorZones(d.opening)) expect(Math.min(z[2] - z[0], z[3] - z[1])).toBeCloseTo(PASS_DEPTH, 6);
    }
  });

  it('dodatkowe okna połaciowe (pokoje dzieci): pod oknem tylko niskie meble, łóżeczko i łóżko-domek poza oknem', () => {
    const extra = design.extraRoofWindows.windows;
    expect(extra.map((w) => w.room).sort()).toEqual(['1/4', '1/5', '1/8']);
    for (const w of extra) {
      // rzut okna w połaci razem z otworem w okładzinie skosu (szpalet prostopadły do połaci): 1,21 m od lica ścianki kolankowej
      const zone = w.slope === 'skos-S' ? [w.x[0], 0.25, w.x[1], 1.461] : [w.x[0], 8.639, w.x[1], 9.85];
      const under = furniture.filter((f) => !isRug(f) && overlapsRect(f, zone));
      for (const f of under) {
        expect(roomOf(f), `${f.id} pod oknem ${w.id}`).toBe(w.room);
        expect((f.z || 0) + f.h, `${f.id} zasłania okno ${w.id} (dół otworu 1,60 m)`).toBeLessThanOrEqual(1.2);
        expect(['lozeczko', 'lozko-domek'], `${f.id} pod oknem ${w.id}`).not.toContain(f.type);
      }
    }
  });

  it('lamele przy schodach: wyjście z biegu górnego na korytarz i pas wzdłuż lameli są wolne', () => {
    const slats = solidWalls.filter((w) => w.kind === 'balustrade');
    expect(slats.length).toBe(3);
    const stand = inRoom('1/2').filter((f) => !isRug(f) && !isHanging(f));
    const exit = [7.94, 4.82, 7.94 + 0.9, 5.8]; // przed krawędzią x = 7,92 (wyjście ze schodów), 90 cm w głąb korytarza
    for (const f of stand) expect(overlapsRect(f, exit), `${f.id} w wyjściu ze schodów`).toBe(false);
    for (const f of stand) expect(collides(f, slats), `${f.id} w lamelach`).toBe(false);
    // korytarz wzdłuż lameli (y 3,52..4,78) – bez mebli stojących na całej szerokości
    for (const f of stand) expect(overlapsRect(f, [5.3, 3.52, 7.92, 4.78]), f.id).toBe(false);
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
        if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) continue; // jeden w całości nad drugim (lustro, półka nad niższym meblem)
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

  it('biuro: regał z ozdobami za plecami siedzącego, telewizor na licu szaf, miejsce na rozłożenie kanapy', () => {
    const get = (type) => inRoom('1/3').find((f) => f.type === type);
    const sofa = get('kanapa-rozkladana');
    const desk = get('biurko-komputerowe');
    const chair = get('krzeslo-biurowe');
    const shelf = get('regal-dekoracyjny');
    const tv = get('telewizor');
    for (const f of [sofa, desk, chair, shelf, tv]) expect(f).toBeTruthy();

    // stanowisko: biurko – krzesło – regał w jednej linii (wzdłuż x), regał przy ścianie D-8 za oparciem krzesła
    const [dk, ch, sh] = [aabb(desk), aabb(chair), aabb(shelf)];
    expect(desk.rot).toBe(90); // tył biurka na zachód, siedzący od wschodu
    expect(chair.rot).toBe(270); // oparcie krzesła w stronę regału
    expect(shelf.rot).toBe(270);
    expect(sh[2]).toBeCloseTo(9.41, 6); // lico ściany D-8
    expect(ch[0]).toBeGreaterThanOrEqual(dk[2] - 1e-9);
    expect(sh[0]).toBeGreaterThanOrEqual(ch[2] - 1e-9);
    expect(sh[0] - dk[2], 'miejsce na krzesło między biurkiem a regałem').toBeGreaterThanOrEqual(0.75);
    expect(sh[0] - ch[2], 'regał tuż za krzesłem').toBeLessThanOrEqual(0.3);
    expect(Math.min(ch[3], sh[3]) - Math.max(ch[1], sh[1]), 'regał za całym krzesłem').toBeGreaterThanOrEqual(chair.w * 0.8);
    expect(chair.y).toBeGreaterThan(dk[1]);
    expect(chair.y).toBeLessThan(dk[3]);
    expect(shelf.h, 'pięć półek z ozdobami').toBeGreaterThanOrEqual(1.75);

    // telewizor wisi na licu zabudowy z projektu (szafa B), naprzeciw kanapy
    const closet = aabb(furniture.find((f) => f.id === 'start-szafa-1-3-b'));
    const t = aabb(tv);
    expect(t[1]).toBeCloseTo(closet[3], 3);
    expect(t[0]).toBeGreaterThanOrEqual(closet[0]);
    expect(t[2]).toBeLessThanOrEqual(closet[2]);
    expect(tv.rot).toBe(180);
    const s = aabb(sofa);
    expect(sofa.rot).toBe(0); // tyłem do ścianki kolankowej, przodem do telewizora
    expect(tv.x).toBeGreaterThan(s[0]);
    expect(tv.x).toBeLessThan(s[2]);

    // KOMPROMIS (opisany w danych): pełne 1,40 × 2,00 m wolnej podłogi przed kanapą się nie mieści.
    // Pilnujemy tego, co jest: przed kanapą wolne ≥ 1,40 × 1,30 m aż do lica szaf, a łóżko 1,40 × 2,00 m
    // liczone od ścianki kolankowej (razem z kanapą) nie trafia w żaden mebel stojący – także w krzesło.
    expect(s[2] - s[0]).toBeGreaterThanOrEqual(1.4 - 1e-9);
    expect(s[3]).toBeCloseTo(9.85, 6);
    const front = [s[0], closet[3], s[2], s[1]];
    expect(front[3] - front[1]).toBeGreaterThanOrEqual(1.3);
    const bed = [s[0], s[3] - 2.0, s[2], s[3]];
    expect(bed[1] - closet[3], 'zapas między rozłożonym łóżkiem a szafami').toBeGreaterThanOrEqual(0.15);
    for (const zone of [front, bed]) {
      const z = [zone[0] + 0.005, zone[1] + 0.005, zone[2] - 0.005, zone[3] - 0.005];
      for (const f of inRoom('1/3')) {
        if (f === sofa || isRug(f) || isHanging(f)) continue;
        expect(overlapsRect(f, z), `${f.id} w miejscu na rozłożenie kanapy`).toBe(false);
      }
    }
  });

  it('łazienki: 60 cm wolnego przed WC, bidetem i umywalkami; wejście do prysznica min. 60 cm', () => {
    const FRONT = 0.6;
    const fixtures = furniture.filter((f) => ['wc-podwieszane', 'bidet', 'umywalka-nablatowa', 'umywalka-podwojna', 'umywalka'].includes(f.type));
    expect(fixtures.length).toBe(6); // 1/7: WC, bidet, umywalki; 1/10: WC, umywalka; pralnia: umywalka
    /** Prostokąt głębokości depth przyległy do boku mebla: 'front' (−y lokalnie) albo 'left' / 'right' (patrząc od frontu). */
    const beside = (f, side, depth) => {
      const [lx, ly, w, d] = side === 'front' ? [0, -(f.d + depth) / 2, f.w, depth] : [(side === 'right' ? 1 : -1) * (f.w + depth) / 2, 0, depth, f.d];
      const a = (f.rot * Math.PI) / 180;
      return aabb({ x: f.x + lx * Math.cos(a) - ly * Math.sin(a), y: f.y + lx * Math.sin(a) + ly * Math.cos(a), rot: f.rot, w, d });
    };
    const freeZone = (zone, self, label) => {
      const z = [zone[0] + 0.005, zone[1] + 0.005, zone[2] - 0.005, zone[3] - 0.005];
      const probe = { x: (z[0] + z[2]) / 2, y: (z[1] + z[3]) / 2, rot: 0, w: z[2] - z[0], d: z[3] - z[1] };
      expect(collides(probe, blockers), `${label}: ściana`).toBe(false);
      for (const [x, y] of corners(probe)) expect(collision.pointInRoom(LEVEL, x, y), label).toBe(roomOf(self));
      for (const f of inRoom(roomOf(self))) {
        if (f === self || isRug(f) || isHanging(f)) continue;
        expect(overlapsRect(f, z), `${label}: ${f.id}`).toBe(false);
      }
    };
    for (const f of fixtures) freeZone(beside(f, 'front', FRONT), f, `przed ${f.id}`);
    // walk-in „prawy”: ściana z prawej, wejście z lewej strony (patrząc od frontu) – tam 60 cm wolnego na całej głębokości
    const showers = furniture.filter((f) => f.type === 'prysznic-walk-in-prawy');
    expect(showers.map(roomOf).sort()).toEqual(['1/10', '1/7']);
    for (const f of showers) freeZone(beside(f, 'left', FRONT), f, `wejście do ${f.id}`);
    // przed wanną wolny pas 60 cm na co najmniej 1 m jej długości (wejście do wanny)
    const tub = furniture.find((f) => f.type === 'wanna-wolnostojaca');
    const t = aabb(tub);
    freeZone([t[0], t[3], t[0] + 1.0, t[3] + FRONT], tub, 'przed wanną');
  });

  it('wyposażenie z życzeń właściciela jest na miejscu', () => {
    const types = (roomId) => inRoom(roomId).map((f) => f.type);
    expect(types('1/3')).toEqual(expect.arrayContaining(['biurko-komputerowe', 'krzeslo-biurowe', 'kanapa-rozkladana', 'regal-dekoracyjny', 'telewizor', 'szafa-wnekowa']));
    expect(inRoom('1/3').filter((f) => f.type === 'szafa-wnekowa')).toHaveLength(3); // zabudowy z projektu zostają
    expect(types('1/4')).toEqual(expect.arrayContaining(['lozko-120', 'biurko', 'krzeslo-biurowe', 'regal', 'szafa-wnekowa']));
    expect(types('1/5')).toEqual(expect.arrayContaining(['lozko-domek', 'regal-zabawki', 'stolik-dzieciecy', 'komoda', 'dywan-okragly']));
    expect(types('1/8')).toEqual(expect.arrayContaining(['lozeczko', 'komoda-przewijak', 'fotel-uszak', 'regal-zabawki', 'dywan-okragly']));
    expect(types('1/9')).toEqual(expect.arrayContaining(['lozko-160', 'szafka-nocna', 'dywan', 'toaletka', 'stolek']));
    // sypialnia bez szafy z projektu i bez fotela; toaletka stoi w miejscu szafy (ściana N-1), stołek przed nią
    expect(types('1/9').some((t) => t.startsWith('szafa') || t.startsWith('fotel'))).toBe(false);
    expect(furniture.some((f) => f.id === 'start-szafa-1-9')).toBe(false);
    const vanityTable = furniture.find((f) => f.type === 'toaletka');
    const stool = furniture.find((f) => f.type === 'stolek');
    const oldCloset = createStarterFurniture().find((f) => f.id === 'start-szafa-1-9');
    const [v, c, st] = [aabb(vanityTable), aabb(oldCloset), aabb(stool)];
    expect(v[2]).toBeCloseTo(c[2], 6); // przy tej samej ścianie
    expect(v[1]).toBeGreaterThanOrEqual(c[1]);
    expect(v[3]).toBeLessThanOrEqual(c[3]);
    expect(vanityTable.rot).toBe(270); // tył z lustrem przy ścianie, siada się od strony pokoju
    expect(v[0] - st[2]).toBeGreaterThanOrEqual(0);
    expect(v[0] - st[2]).toBeLessThanOrEqual(0.1);
    expect(stool.y).toBeGreaterThan(v[1]);
    expect(stool.y).toBeLessThan(v[3]);
    expect(types('1/10')).toEqual(expect.arrayContaining(['umywalka-nablatowa', 'prysznic-walk-in-prawy', 'lustro', 'wc-podwieszane']));
    expect(types('1/10').some((t) => t.startsWith('wanna'))).toBe(false);
    expect(types('1/7')).toEqual(expect.arrayContaining(['wanna-wolnostojaca', 'prysznic-walk-in-prawy', 'wc-podwieszane', 'bidet', 'umywalka-podwojna', 'lustro']));
    const basin = furniture.find((f) => f.id === 'mt-1-7-umywalki');
    expect(basin.type).toBe('umywalka-podwojna'); // zawsze DWIE misy na jednym blacie
    expect(basin.color).toBe('#b5895a'); // dębowy blat
    expect(basin.color2).toBe('#c2704f'); // misy w kolorze terakoty
    for (const id of ['mt-1-7-wc', 'mt-1-7-bidet']) expect(furniture.find((f) => f.id === id).color).toBe('#f4f4f1'); // biała ceramika
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
    expect(idOf(`${LEVEL}:1/7:wall:1`)).toBe('lastryko-cieple'); // ściana przy umywalkach
    // terakota TYLKO na ścianie prysznica (tył walk-in), pozostałe dwie ściany w ciepłej bieli
    const terracotta = [0, 1, 2, 3].filter((i) => String(idOf(`${LEVEL}:1/7:wall:${i}`)).startsWith('plytka-terakota'));
    expect(terracotta).toEqual([3]);
    for (const i of [0, 2]) expect(finishes[`${LEVEL}:1/7:wall:${i}`]).toEqual({ kind: 'paint', color: '#f6f1e7' });
    const shower = furniture.find((f) => f.id === 'mt-1-7-prysznic');
    const basins = furniture.find((f) => f.id === 'mt-1-7-umywalki');
    const wallX = (i) => { const m = built.surfaces.get(`${LEVEL}:1/7:wall:${i}`).mesh; m.geometry.computeBoundingBox(); return m.geometry.boundingBox.max.x; };
    expect(corners(shower)[2][0]).toBeCloseTo(wallX(3), 2); // tył prysznica przy ścianie w terakocie
    expect(aabb(basins)[2]).toBeCloseTo(wallX(1), 2); // umywalki przy ścianie z lastryka
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

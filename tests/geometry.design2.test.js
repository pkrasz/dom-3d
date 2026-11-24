// Testy opcji bryły – runda 2 (design.json na prawdziwym house.json):
// drzwi przesuwne „barn”, lamele ciągłe przez obie kondygnacje, dodatkowe okna połaciowe w pokojach dzieci.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { roofTopAt, openingRect } from '../tools/geometry.mjs';
import { buildHouse } from '../src/geometry/buildHouse.js';
import { buildCollision, moveCircle } from '../src/geometry/collision.js';
import { pointInRect } from '../src/geometry/plan.js';
import { roofWindowsOf } from '../src/geometry/roofWindows.js';
import { slatLayout, distributeSlats, guardSegments, balustradeSegments, HANDRAIL_EXTRA } from '../src/geometry/stairs.js';
import { slidingDoorLayout } from '../src/geometry/slidingDoors.js';
import { slidingDoorOptions, extraRoofWindows, withDesign, rafterAxes } from '../src/geometry/design.js';
import { WALK_RADIUS } from '../src/geometry/constants.js';
import { house, model, trianglesOf, triangleCovers, triangleCoversPlan, rectIntersection } from './helpers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const design = JSON.parse(readFileSync(join(root, 'design.json'), 'utf8'));

const base = model(); // bryła z projektu
const d = buildHouse(house, design);
const [parter, upper] = house.levels;
const FLOOR = upper.floorLevel;
const TOP = FLOOR + 2.55; // sufit poddasza nad klatką schodową
const K = Math.hypot(1, 0.7);
const byName = (h, name) => h.statics.find((m) => m.name === name);
const centroid = (t) => [0, 1, 2].map((k) => (t.a[k] + t.b[k] + t.c[k]) / 3);
const r3 = (v) => +v.toFixed(3);
const AGREED = /do uzgodnienia z projektantem \/ konstruktorem/;

describe('design.json – nowe opcje', () => {
  it('każda nowa opcja ma opis z dopiskiem o uzgodnieniu z projektantem / konstruktorem', () => {
    const notes = [
      design.stairs.slats.note, design.doors.note, design.doors.leaf.note, ...design.doors.sliding.map((x) => x.note),
      design.extraRoofWindows.note, design.extraRoofWindows.rafters.note, ...design.extraRoofWindows.windows.map((w) => w.note),
    ];
    expect(notes.length).toBe(11);
    for (const note of notes) {
      expect(note.length).toBeGreaterThan(40);
      expect(note).toMatch(AGREED);
    }
    expect(design.stairs.slats.continuous).toBe(true);
    expect(design.stairs.slats.atticHeight).toBe('handrail');
    expect(design.stairs.slats.note).toMatch(/0,90 m/); // wysokość poręczy z projektu jest opisana jako założenie
    expect(design.doors.sliding.map((x) => `${x.level}:${x.id}`)).toEqual(['poddasze:DP1', 'poddasze:DP2', 'parter:DW4']);
    expect(design.extraRoofWindows.windows.map((w) => w.room)).toEqual(['1/4', '1/5', '1/8']);
  });

  it('pusty design: żadnych drzwi przesuwnych, lameli ani okien dodatkowych; house.json nietknięty', () => {
    expect(slidingDoorOptions({})).toBeNull();
    expect(slidingDoorLayout(house, {})).toEqual([]);
    expect(extraRoofWindows(house, {})).toEqual([]);
    expect(withDesign(house, {})).toBe(house);
    expect(guardSegments(house, {})).toEqual(balustradeSegments(house));
    const before = JSON.stringify(house);
    const extended = withDesign(house, design);
    expect(extended).not.toBe(house);
    expect(extended.levels[1].roofWindows.length).toBe(8);
    expect(upper.roofWindows.length).toBe(5);
    expect(JSON.stringify(house)).toBe(before);
    for (const name of ['parter:joinery:barnDoor', 'parter:joinery:barnRail', 'poddasze:joinery:barnDoor', 'poddasze:stairs:slat']) expect(byName(base, name), name).toBeUndefined();
    expect(buildCollision(house).slidingDoors('poddasze')).toEqual([]);
  });
});

// ---------------------------------------------------------------- drzwi przesuwne

describe('drzwi przesuwne „barn” (doors.sliding)', () => {
  const doors = slidingDoorLayout(house, design);
  const get = (id) => doors.find((x) => x.id === id);

  it('stan z projektu: do spiżarni prowadzą drzwi rozwierne DW4 z kuchni (D60) i DW2 z garażu; DP1, DP2 z sypialni', () => {
    const op = (level, id) => level.openings.find((o) => o.id === id);
    expect(op(parter, 'DW4')).toMatchObject({ kind: 'door', wall: 'W1', at: [8.43, 9.15], between: ['0/4', '0/5'], mark: 'D60' });
    expect(op(parter, 'DW2')).toMatchObject({ kind: 'door', between: ['0/4', '0/9'] });
    expect(op(upper, 'DP1')).toMatchObject({ kind: 'door', wall: 'D-2', at: [0.56, 1.48], between: ['1/9', '1/10'] });
    expect(op(upper, 'DP2')).toMatchObject({ kind: 'door', wall: 'D-2', at: [3.48, 4.4], between: ['1/9', '1/11'] });
  });

  it('położenie skrzydeł: strona ściany, kierunek, tor i strefa wolna od mebli', () => {
    expect(doors.map((x) => x.id)).toEqual(['DP1', 'DP2', 'DW4']);
    expect(get('DP1')).toMatchObject({ levelId: 'poddasze', roomId: '1/9', axis: 'x', sign: -1, face: 7.12, dir: 1, leafWidth: 1.02, travel: 0.95, clearWidth: 0.9 });
    expect(get('DP1')).toMatchObject({ closed: [0.51, 1.53], open: [1.46, 2.48], track: [0.51, 2.48], keepClear: [0.46, 6.995, 2.53, 7.12] });
    expect(get('DP2')).toMatchObject({ roomId: '1/9', axis: 'x', sign: -1, dir: -1, travel: 0.95, clearWidth: 0.9 });
    expect(get('DP2')).toMatchObject({ closed: [3.43, 4.45], open: [2.48, 3.5], track: [2.48, 4.45], keepClear: [2.43, 6.995, 4.5, 7.12] });
    // spiżarnia: skrzydło od strony kuchni, pełna droga – po odsunięciu wolne całe 72 cm otworu
    expect(get('DW4')).toMatchObject({ levelId: 'parter', roomId: '0/5', axis: 'y', sign: 1, face: 5.3, dir: -1, leafWidth: 0.82, travel: 0.77, clearWidth: 0.72 });
    expect(get('DW4')).toMatchObject({ closed: [8.38, 9.2], open: [7.61, 8.43], track: [7.61, 9.2], keepClear: [5.3, 7.56, 5.425, 9.25] });
    for (const x of doors) {
      // skrzydło szersze od otworu o 10 cm, wisi 3–4 cm od lica ściany, narysowane częściowo odsunięte (60% drogi)
      expect(x.leafWidth - (x.opening.at[1] - x.opening.at[0])).toBeCloseTo(0.1, 9);
      expect(Math.abs(x.p0 - x.face)).toBeGreaterThanOrEqual(0.03);
      expect(Math.abs(x.p0 - x.face)).toBeLessThanOrEqual(0.04);
      expect(Math.abs(x.drawn[0] - x.closed[0])).toBeCloseTo(0.6 * x.travel, 6);
      expect(x.drawn[0]).toBeGreaterThanOrEqual(x.track[0] - 1e-9);
      expect(x.drawn[1]).toBeLessThanOrEqual(x.track[1] + 1e-9);
      // odsunięte skrzydło zostawia przejście co najmniej tak szerokie jak dawne światło ościeżnicy (otwór − 2 × 6 cm)
      expect(x.clearWidth).toBeGreaterThanOrEqual(x.opening.at[1] - x.opening.at[0] - 0.12 - 1e-9);
    }
  });

  it('tor skrzydła leży na pełnej ścianie: w obrębie ściany pomieszczenia, bez innych otworów, okien i narożników', () => {
    for (const x of doors) {
      const level = house.levels.find((l) => l.id === x.levelId);
      const rm = d.models[house.levels.indexOf(level)].rooms.find((r) => r.id === x.roomId);
      const edge = rm.edges.find((e) => e.axis === x.axis && Math.abs(e.c - x.face) < 1e-6 && e.lo <= x.track[0] && e.hi >= x.track[1]);
      expect(edge, x.id).toBeTruthy();
      // mur za całym torem, z zapasem 5 cm do narożników
      expect(edge.solid.some(([s0, s1]) => s0 <= x.track[0] - 0.05 + 1e-9 && s1 >= x.track[1] + 0.05 - 1e-9), x.id).toBe(true);
      // jedyny otwór w zasięgu toru to własne drzwi
      expect(edge.holes.filter((h) => h.s1 > x.track[0] && h.s0 < x.track[1]).map((h) => h.id), x.id).toEqual([x.id]);
      for (const o of level.openings.filter((o) => o.wall === x.wall.id && o.id !== x.id)) {
        expect(o.at[1] <= x.track[0] + 1e-9 || o.at[0] >= x.track[1] - 1e-9, `${x.id} / ${o.id}`).toBe(true);
      }
      // strefa wolna od mebli leży w pomieszczeniu, po którego stronie wisi skrzydło
      const [x0, y0, x1, y1] = x.keepClear;
      const col = buildCollision(house, design);
      for (const [px, py] of [[x0 + 0.01, y0 + 0.01], [x1 - 0.01, y0 + 0.01], [x0 + 0.01, y1 - 0.01], [x1 - 0.01, y1 - 0.01]]) expect(col.pointInRoom(x.levelId, px, py), x.id).toBe(x.roomId);
    }
    // skrzydła na tej samej ścianie nie wchodzą na siebie nawet całkiem odsunięte
    expect(rectIntersection(get('DP1').trackRect, get('DP2').trackRect)).toBeNull();
    expect(get('DP1').open[1]).toBeLessThanOrEqual(get('DP2').open[0]);
  });

  it('nie ma skrzydła rozwiernego ani ościeżnicy; pozostałe drzwi bez zmian', () => {
    for (const x of doors) {
      const level = house.levels.find((l) => l.id === x.levelId);
      const o = x.opening;
      const hole = openingRect(level, o);
      // obszar, w którym projekt rysuje ościeżnicę i skrzydło otwarte o 90°
      const pad = o.leaf + 0.1;
      const zone = [hole[0] - pad, hole[1] - pad, hole[2] + pad, hole[3] + pad];
      const inZone = (h, name) => trianglesOf(byName(h, `${x.levelId}:joinery:${name}`)).filter((t) => pointInRect(...centroid(t).slice(0, 2), zone)).length;
      expect(inZone(base, 'door'), x.id).toBe(12);
      expect(inZone(base, 'doorFrame'), x.id).toBe(36);
      expect(inZone(d, 'door'), x.id).toBe(0);
      expect(inZone(d, 'doorFrame'), x.id).toBe(0);
    }
    const count = (h, name) => byName(h, name).geometry.attributes.position.count / 3;
    expect(count(d, 'parter:joinery:door')).toBe(count(base, 'parter:joinery:door') - 12);
    expect(count(d, 'poddasze:joinery:door')).toBe(count(base, 'poddasze:joinery:door') - 24);
    expect(count(d, 'parter:joinery:doorFrame')).toBe(count(base, 'parter:joinery:doorFrame') - 36);
    expect(count(d, 'poddasze:joinery:doorFrame')).toBe(count(base, 'poddasze:joinery:doorFrame') - 72);
  });

  it('gładkie ościeża i spód nadproża w kolorze ściany na całą grubość muru', () => {
    for (const x of doors) {
      const level = house.levels.find((l) => l.id === x.levelId);
      const o = x.opening;
      const [w0, w1] = x.axis === 'x' ? [x.wall.rect[1], x.wall.rect[3]] : [x.wall.rect[0], x.wall.rect[2]];
      const pm = (w0 + w1) / 2;
      const pt = (a, z) => (x.axis === 'x' ? [a, pm, level.floorLevel + z] : [pm, a, level.floorLevel + z]);
      const covers = (h, p) => trianglesOf(byName(h, `${x.levelId}:interior:reveal`)).some((t) => triangleCovers(t, p));
      for (const p of [pt(o.at[0], 1.0), pt(o.at[1], 1.0), pt((o.at[0] + o.at[1]) / 2, o.height)]) {
        expect(covers(d, p), `${x.id} ${p}`).toBe(true);
        expect(covers(base, p), `${x.id} ${p} (projekt: ościeżnica)`).toBe(false);
      }
    }
  });

  it('skrzydło z desek, poprzeczek i ukośnych zastrzałów wisi przy ścianie; czarna szyna nad całym torem', () => {
    for (const levelId of ['parter', 'poddasze']) {
      const mine = doors.filter((x) => x.levelId === levelId);
      const leaf = byName(d, `${levelId}:joinery:barnDoor`);
      const rail = byName(d, `${levelId}:joinery:barnRail`);
      expect(leaf.userData).toMatchObject({ levelId, part: 'joinery' });
      expect(leaf.material.color.getHexString()).toBe(design.doors.leaf.color.slice(1));
      expect(rail.material.color.getHexString()).toBe(design.doors.leaf.railColor.slice(1));
      expect(leaf.material).not.toBe(rail.material);
      const leafTris = trianglesOf(leaf);
      const railTris = trianglesOf(rail);
      expect(leafTris.length).toBeLessThanOrEqual(mine.length * 70);
      expect(railTris.length).toBeLessThanOrEqual(mine.length * 80);
      for (const x of mine) {
        const [x0, y0, x1, y1] = x.leafRect;
        const own = leafTris.filter((t) => pointInRect(...centroid(t).slice(0, 2), x.leafRect, 0.01));
        expect(own.length, x.id).toBeGreaterThan(40);
        const pts = own.flatMap((t) => [t.a, t.b, t.c]);
        const range = (k) => [Math.min(...pts.map((p) => p[k])), Math.max(...pts.map((p) => p[k]))];
        expect(range(0).map(r3), x.id).toEqual([r3(x0), r3(x1)]);
        expect(range(1).map(r3), x.id).toEqual([r3(y0), r3(y1)]);
        expect(range(2)[0], x.id).toBeCloseTo(x.z0, 5);
        expect(range(2)[1], x.id).toBeCloseTo(x.z1, 5);
        expect(x.z1 - x.z0).toBeCloseTo(x.opening.height + 0.03, 9); // 1 cm nad posadzką, 4 cm ponad otwór
        // ukośne zastrzały: trójkąty zwrócone do pomieszczenia, o krawędzi ani poziomej, ani pionowej
        const along = x.axis === 'x' ? 0 : 1;
        const across = 1 - along;
        const slanted = own.filter((t) => t.n[across] * x.sign > 0.9 && [[t.a, t.b], [t.b, t.c], [t.c, t.a]].some(([p, q]) => Math.abs(p[along] - q[along]) > 0.3 && Math.abs(p[2] - q[2]) > 0.3));
        expect(slanted.length, x.id).toBeGreaterThanOrEqual(4);
        // szyna: czarny profil nad skrzydłem na całej długości toru, przy ścianie
        const zr = x.railZ;
        const onRail = railTris.filter((t) => Math.abs(centroid(t)[2] - zr) < 0.03 && pointInRect(...centroid(t).slice(0, 2), x.trackRect, 0.02));
        const as = onRail.flatMap((t) => [t.a[along], t.b[along], t.c[along]]);
        expect(Math.min(...as), x.id).toBeCloseTo(x.track[0], 5);
        expect(Math.max(...as), x.id).toBeCloseTo(x.track[1], 5);
        expect(zr).toBeGreaterThan(x.z1);
        expect(zr).toBeLessThan(level(levelId).floorLevel + 2.4);
      }
      // wszystko mieści się w strefach wolnych od mebli (w rzucie)
      for (const t of [...leafTris, ...railTris]) {
        for (const p of [t.a, t.b, t.c]) expect(mine.some((x) => pointInRect(p[0], p[1], x.keepClear, 1e-6)), `${levelId} ${p}`).toBe(true);
      }
    }
    function level(id) {
      return house.levels.find((l) => l.id === id);
    }
  });

  it('kolizje: przejście przez drzwi przesuwne wolne jak dotąd, strefy dostępne w app.collision', () => {
    const col = buildCollision(house, design);
    const plain = buildCollision(house);
    expect(col.walls('parter')).toEqual(plain.walls('parter'));
    expect(col.slidingDoors('poddasze').map((x) => x.id)).toEqual(['DP1', 'DP2']);
    expect(col.slidingDoors('parter').map((x) => x.keepClear)).toEqual([[5.3, 7.56, 5.425, 9.25]]);
    // z kuchni do spiżarni przez DW4 (ściana W1, x 5,05..5,30)
    let p = { x: 6.0, y: 8.79 };
    for (let i = 0; i < 40; i++) p = moveCircle(p.x, p.y, -0.05, 0, WALK_RADIUS, col.walls('parter'));
    expect(p.x).toBeLessThan(4.6);
    // z sypialni do łazienki 1/10 przez DP1 i do garderoby przez DP2 (ścianka D-2, y 7,12..7,24)
    for (const x of [1.02, 3.94]) {
      p = { x, y: 6.5 };
      for (let i = 0; i < 40; i++) p = moveCircle(p.x, p.y, 0, 0.05, WALK_RADIUS, col.walls('poddasze'));
      expect(p.y, `x = ${x}`).toBeGreaterThan(7.8);
    }
  });

  it('wpisy, których nie da się zbudować, są pomijane', () => {
    const make = (entry) => slidingDoorLayout(house, { doors: { sliding: [entry] } });
    expect(make({ id: 'DW4', level: 'parter', side: '0/5', slide: '-y' }).length).toBe(1);
    expect(make({ id: 'DW4', level: 'parter', side: '0/5', slide: '-x' })).toEqual([]); // w poprzek ściany
    expect(make({ id: 'DW4', level: 'parter', side: '0/6', slide: '-y' })).toEqual([]); // salon nie leży przy tej ścianie
    expect(make({ id: 'DW4', level: 'poddasze', side: '0/5', slide: '-y' })).toEqual([]);
    expect(make({ id: 'O7', level: 'parter', side: '0/1', slide: '+x' })).toEqual([]); // drzwi wejściowe to nie drzwi wewnętrzne
    expect(make({ id: 'PN1', level: 'poddasze', side: '1/2', slide: '+y' })).toEqual([]); // przejście bez drzwi
    // od strony spiżarni też się da (lico x = 5,05)
    expect(make({ id: 'DW4', level: 'parter', side: '0/4', slide: '-y' })[0]).toMatchObject({ sign: -1, face: 5.05, keepClear: [4.925, 7.56, 5.05, 9.25] });
  });
});

// ---------------------------------------------------------------- lamele ciągłe

describe('lamele ciągłe przez obie kondygnacje (stairs.slats.continuous), na poddaszu ucięte poręczą (atticHeight = handrail)', () => {
  const { slats, rails, profile } = slatLayout(house, design);
  const H = upper.stairVoid.balustradeHeight; // 0,90 m – wysokość balustrady z projektu
  const RAIL_TOP = FLOOR + H; // wierzch poręczy poziomych: +3,93
  // poprzednie zachowanie (lamele do sufitu poddasza) zostaje jako alternatywna wartość opcji
  const toCeiling = { ...design, stairs: { ...design.stairs, slats: { ...design.stairs.slats, atticHeight: 'ceiling' } } };
  const old = slatLayout(house, toCeiling);
  /** Rzędna wierzchu poręczy linii w duszy: 0,90 m nad linią nosków biegu górnego (x 6,30..7,92: +2,02..+3,03). */
  const rakedTop = (x) => 2.02 + ((FLOOR - 2.02) * (x - 6.3)) / (7.92 - 6.3) + H;
  const flight = slats.filter((s) => s.line === 'flight');
  const edge = slats.filter((s) => s.line === 'void');
  const along = edge.filter((s) => Math.abs(s.y - 4.8) < 1e-9).sort((a, b) => a.x - b.x); // wzdłuż korytarza
  const over = edge.filter((s) => Math.abs(s.x - 7.92) < 1e-9).sort((a, b) => a.y - b.y); // nad biegiem dolnym
  const voidRect = upper.stairVoid.rect;
  const GAP = 0.12;

  it('rozkład lameli na odcinku: odstęp w świetle nie większy niż zadany, słupek na wolnym końcu', () => {
    for (const [len, ps, pe] of [[2.62, false, true], [1.0, true, false], [0.5, false, false], [0.3, true, true], [0.04, true, true]]) {
      const c = distributeSlats(len, 0.04, 0.11, ps, pe);
      const edges = [0, ...c.flatMap((v) => [v - 0.02, v + 0.02]), len];
      for (let i = 0; i < edges.length; i += 2) expect(edges[i + 1] - edges[i], `${len}`).toBeLessThanOrEqual(0.11 + 1e-9);
      if (ps) expect(c[0]).toBeCloseTo(0.02, 9);
      if (pe) expect(c[c.length - 1]).toBeCloseTo(len - 0.02, 9);
    }
  });

  it('starych balustrad nie ma na żadnej kondygnacji; lamele są na obu', () => {
    expect(byName(base, 'parter:stairs:balustrade')).toBeTruthy();
    expect(byName(base, 'poddasze:stairs:balustrade')).toBeTruthy();
    expect(byName(d, 'parter:stairs:balustrade')).toBeUndefined();
    expect(byName(d, 'poddasze:stairs:balustrade')).toBeUndefined();
    const lo = byName(d, 'parter:stairs:slat');
    const up = byName(d, 'poddasze:stairs:slat');
    for (const [mesh, levelId] of [[lo, 'parter'], [up, 'poddasze']]) {
      expect(mesh.userData).toMatchObject({ levelId, part: 'stairs', noPick: true });
      expect(mesh.material.color.getHexString()).toBe('1d1d1f');
    }
    expect(lo.material).toBe(up.material);
    // część do posadzki poddasza należy do parteru, wyżej – do poddasza (znika razem z nim w domku dla lalek)
    expect(lo.geometry.boundingBox.min.z).toBeCloseTo(3.03 / 18, 5);
    expect(lo.geometry.boundingBox.max.z).toBeCloseTo(FLOOR, 5);
    // poddasze: lamele od posadzki, nic nie sięga ponad wierzch poręczy (+3,93); sufitu (+5,58) nie dotyka żadna lamela.
    // Poręcz pochyła linii w duszy schodzi przy zabiegu 13 cm poniżej posadzki poddasza (należy do siatki poddasza).
    expect(up.geometry.boundingBox.max.z).toBeCloseTo(RAIL_TOP, 5);
    expect(up.geometry.boundingBox.max.z).toBeLessThan(TOP - 1.6);
    expect(up.geometry.boundingBox.min.z).toBeGreaterThan(FLOOR - 0.14);
    expect(up.geometry.boundingBox.min.z).toBeLessThan(FLOOR);
    expect((lo.geometry.attributes.position.count + up.geometry.attributes.position.count) / 3).toBeLessThan(560);
    expect(profile).toBe(0.04);
    // wariant 'ceiling': siatka poddasza od posadzki do sufitu, bez poręczy
    const dOld = buildHouse(house, toCeiling);
    const upOld = byName(dOld, 'poddasze:stairs:slat');
    expect(upOld.geometry.boundingBox.min.z).toBeCloseTo(FLOOR, 5);
    expect(upOld.geometry.boundingBox.max.z).toBeCloseTo(TOP, 5);
    expect(byName(dOld, 'parter:stairs:slat').geometry.boundingBox.max.z).toBeCloseTo(FLOOR, 5);
  });

  it('atticHeight zmienia tylko wysokość lameli na poddaszu: rzut, liczba lameli, parter i kolizje są takie same', () => {
    expect(old.rails).toEqual([]); // 'ceiling': żadnych poręczy ani profili poziomych
    expect(old.slats.length).toBe(slats.length);
    old.slats.forEach((o, i) => {
      const s = slats[i];
      expect([s.x, s.y, s.z0, s.underSlab, s.line]).toEqual([o.x, o.y, o.z0, o.underSlab, o.line]);
      // lamele pod stropem parteru bez zmian; pozostałe w wariancie 'ceiling' idą do sufitu poddasza
      if (o.underSlab) expect(s.z1).toBe(o.z1);
      else expect(o.z1).toBeCloseTo(TOP, 9);
    });
    expect(guardSegments(house, design)).toEqual(guardSegments(house, toCeiling));
    for (const levelId of ['parter', 'poddasze']) expect(buildCollision(house, design).walls(levelId)).toEqual(buildCollision(house, toCeiling).walls(levelId));
    // brak pola = 'ceiling'
    const { atticHeight, ...noField } = design.stairs.slats;
    expect(atticHeight).toBe('handrail');
    expect(slatLayout(house, { ...design, stairs: { ...design.stairs, slats: noField } })).toEqual(old);
    // parter: zakres siatki poniżej posadzki poddasza jest w obu wariantach ten sam (od stopnic do stropu / przez otwór).
    // Jedyna różnica w widoku samego parteru: dwie lamele duszy przy zabiegu (x = 6,37 i 6,50), nad którymi poręcz pochyła
    // leży poniżej posadzki poddasza, kończą się na +2,94 i +3,03 – ponad spodem stropu (+2,70), ale pod posadzką (+3,03);
    // pozostałe dziesięć pod otworem przechodzi przez całą grubość stropu, jak w wariancie 'ceiling'.
    const open = slats.filter((s) => s.line === 'flight' && !s.underSlab).sort((a, b) => a.x - b.x);
    const short = open.filter((s) => s.z1 < FLOOR);
    expect(short.map((s) => [r3(s.x), r3(s.z1)])).toEqual([[6.368, 2.942], [6.503, 3.026]]);
    for (const s of short) expect(s.z1).toBeGreaterThan(parter.floorLevel + parter.ceilingHeight + 0.2);
    expect(open.length - short.length).toBe(10);
    const loA = byName(d, 'parter:stairs:slat').geometry.boundingBox;
    const loB = byName(buildHouse(house, toCeiling), 'parter:stairs:slat').geometry.boundingBox;
    expect(loA.min.toArray()).toEqual(loB.min.toArray());
    expect(loA.max.toArray()).toEqual(loB.max.toArray());
  });

  it('poręcze: pozioma na obu krawędziach otworu (+3,93), pochyła w duszy wzdłuż biegu górnego; spotykają się w narożniku', () => {
    expect(H).toBe(0.9);
    expect(rails.length).toBe(3);
    const level = rails.filter((r) => r.line === 'void');
    const raked = rails.filter((r) => r.line === 'flight');
    expect(level.length).toBe(2);
    expect(raked.length).toBe(1);
    // poziome: na całej długości dawnych balustrad, wierzch 0,90 m nad posadzką poddasza
    for (const r of level) {
      expect(r.z).toBe(r.zTo);
      expect(r.z + profile / 2).toBeCloseTo(RAIL_TOP, 9);
    }
    expect(level.map((r) => [r.from, r.to])).toEqual([[[5.3, 4.8], [7.92, 4.8]], [[7.92, 5.8], [7.92, 6.8]]]);
    // pochyła: w linii lameli duszy, od skrajnej lameli przy zabiegu do narożnika przy wyjściu, 0,90 m nad linią nosków
    const r = raked[0];
    expect(r.from[1]).toBeCloseTo(5.83, 9);
    expect(r.to[1]).toBeCloseTo(5.83, 9);
    expect(r.from[0]).toBeCloseTo(6.3675 - profile, 9);
    // w narożniku kończy się na licu poręczy poziomej x = 7,92 (szer. 5 cm: 7,895..7,945) – bryły się nie przenikają
    const cross = level.find((l) => l.from[0] === l.to[0]);
    expect(r.to[0]).toBeCloseTo(cross.from[0] - cross.width / 2, 9);
    expect(r.to[0]).toBeCloseTo(7.895, 9);
    expect(r.from[1] - r.width / 2).toBeGreaterThan(cross.from[1]); // czoło trafia w bok poręczy poziomej (y 5,805..5,855 w 5,80..6,80)
    expect(r.from[1] + r.width / 2).toBeLessThan(cross.to[1]);
    // poręcz wzdłuż korytarza (y = 4,80) kończy się w x = 7,92 i z pozostałymi się nie styka (wyjście ze schodów)
    expect(r.from[1] - r.width / 2 - 4.8).toBeGreaterThan(0.9);
    expect(r.z + profile / 2).toBeCloseTo(rakedTop(r.from[0]), 9);
    expect(r.z + profile / 2).toBeCloseTo(2.94, 2);
    // nachylenie bez zmian: oś przedłużona do narożnika (x = 7,92) trafia w oś poręczy poziomych; na czole jest 1,6 cm niżej
    expect(r.zTo + profile / 2).toBeCloseTo(rakedTop(r.to[0]), 9);
    expect(RAIL_TOP - (r.zTo + profile / 2)).toBeCloseTo((0.025 * (3.03 / 18)) / 0.27, 9);
    expect(r.zTo + ((7.92 - r.to[0]) * (r.zTo - r.z)) / (r.to[0] - r.from[0])).toBeCloseTo(cross.z, 9);
    // poręcze poziome kończą się równo z zewnętrznym licem lameli narożnych (nic nie wystaje poza koniec poręczy)
    expect(along[along.length - 1].x + profile / 2).toBeCloseTo(7.92, 9);
    expect(over[0].y - profile / 2).toBeCloseTo(5.8, 9);
    // nachylenie poręczy = nachylenie biegu górnego (stopień 16,83 / 27 cm)
    expect((r.zTo - r.z) / (r.to[0] - r.from[0])).toBeCloseTo(3.03 / 18 / 0.27, 9);
    // lamela ucięta poręczą kończy się pod jej wierzchem: na spodzie poręczy poziomej, w osi poręczy pochyłej
    for (const s of slats.filter((x) => !x.underSlab)) {
      const top = s.line === 'void' ? RAIL_TOP - profile : rakedTop(s.x) - profile / 2;
      expect(s.z1, `${s.line} ${s.x.toFixed(2)}`).toBeCloseTo(top, 9);
    }
    // poręcz: wysokość profilu lameli, szerokość o 1 cm większa (lica poręczy i lameli nie leżą w jednej płaszczyźnie)
    for (const x of rails) expect(x.width).toBeCloseTo(profile + HANDRAIL_EXTRA, 9);
    expect(HANDRAIL_EXTRA).toBe(0.01);
    // poręcz jest w siatce poddasza (znika razem z nim), profil 4 × 4 cm w kolorze lameli
    expect(byName(d, 'poddasze:stairs:slat').material.color.getHexString()).toBe('1d1d1f');
  });

  it('linia w duszy: parter bez zmian (od stopnic, pod stropem do spodu stropu), pod otworem do poręczy biegu górnego', () => {
    expect(flight.length).toBe(16);
    const inVoid = flight.filter((s) => !s.underSlab);
    expect(inVoid.length).toBe(12);
    for (const s of flight) {
      expect(s.y).toBeCloseTo(5.83, 9);
      expect(s.underSlab).toBe(s.x > 7.92);
      if (s.underSlab) expect(s.z1).toBeCloseTo(2.7, 9);
      else {
        // przez całą wysokość parteru (żadna nie kończy się niżej niż 9 cm pod posadzką poddasza), najwyżej do +3,93
        expect(s.z1).toBeGreaterThan(FLOOR - 0.09);
        expect(s.z1).toBeLessThan(RAIL_TOP);
        expect(s.z1).toBeLessThan(TOP - 1.6); // nie do sufitu poddasza
        // osłona biegu górnego: co najmniej 0,88 m nad jego stopnicą w tym miejscu
        const tread = 2.02 + Math.floor((s.x - 6.3) / 0.27 + 1e-9) * (3.03 / 18);
        expect(s.z1 - tread, `x = ${s.x.toFixed(2)}`).toBeGreaterThanOrEqual(H - profile / 2 - 1e-9);
      }
      expect(s.z0).toBeGreaterThan(0.16);
      expect(s.z0).toBeLessThan(1.36);
    }
    const xs = flight.map((s) => s.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1] - profile).toBeLessThanOrEqual(GAP);
    // lamele stoją tuż za krawędzią biegu górnego (y = 5,80) – osłaniają go od strony otworu, nie zwężając go
    expect(Math.min(...flight.map((s) => s.y - profile / 2))).toBeGreaterThanOrEqual(5.8);
    expect(Math.min(...flight.map((s) => s.y - profile / 2)) - 5.8).toBeLessThan(0.03);
  });

  it('krawędzie otworu klatki na poddaszu: lamele od posadzki do poręczy na wysokości balustrady, rozstaw w świetle ≤ 12 cm', () => {
    expect(along.length).toBe(18);
    expect(over.length).toBe(7);
    expect(edge.length).toBe(25);
    for (const s of edge) {
      expect(s.z0).toBeCloseTo(FLOOR, 9);
      expect(s.z1).toBeCloseTo(RAIL_TOP - profile, 9); // lamela 0,86 m + poręcz 4 cm = 0,90 m
    }
    const h = profile / 2;
    // wzdłuż korytarza: od ściany nośnej (x = 5,30) do narożnika przy wyjściu (x = 7,92)
    const ex = [5.3, ...along.flatMap((s) => [s.x - h, s.x + h])];
    for (let i = 0; i < ex.length - 1; i += 2) expect(ex[i + 1] - ex[i]).toBeLessThanOrEqual(GAP);
    expect(ex[ex.length - 1]).toBeCloseTo(7.92, 9);
    // nad biegiem dolnym: od narożnika duszy (y = 5,80) do ściany D-7 (y = 6,80)
    const ey = [...over.flatMap((s) => [s.y - h, s.y + h]), 6.8];
    expect(ey[0]).toBeCloseTo(5.8, 9);
    for (let i = 1; i < ey.length - 1; i += 2) expect(ey[i + 1] - ey[i]).toBeLessThanOrEqual(GAP);
    // narożnik duszy: ostatnia lamela linii biegu i pierwsza nad biegiem dolnym
    const lastFlight = flight.filter((s) => !s.underSlab).sort((a, b) => b.x - a.x)[0];
    expect(Math.hypot(over[0].x - lastFlight.x, over[0].y - lastFlight.y) - profile).toBeLessThanOrEqual(GAP);
  });

  it('otwór klatki zabezpieczony ze wszystkich stron poza wyjściem; wejście i wyjście wolne', () => {
    // obwód otworu co 1 cm: ściana, lamela nie dalej niż o dopuszczalny prześwit albo krawędź wyjścia
    const arrival = upper.stairVoid.arrival.edge;
    const onArrival = (x, y) => Math.abs(x - arrival[0][0]) < 1e-6 && y > arrival[0][1] && y < arrival[1][1];
    const wallAt = (x, y) => upper.walls.some((w) => pointInRect(x, y, w.rect, 1e-3));
    // osłona = lamela sięgająca pod poręcz (0,86 m nad posadzką poddasza + poręcz 4 cm), nie dalej niż o dopuszczalny prześwit
    const guarded = (x, y) => slats.some((s) => s.line === 'void' && s.z1 >= RAIL_TOP - profile - 1e-9 && Math.hypot(s.x - x, s.y - y) <= profile / 2 + GAP);
    // bieg górny od strony duszy: lamela linii biegu (z poręczą pochyłą) nie dalej niż o dopuszczalny prześwit
    const guardedFlight = (x, y) => slats.some((s) => s.line === 'flight' && !s.underSlab && Math.hypot(s.x - x, s.y - y) <= profile / 2 + GAP);
    const [x0, y0, x1, y1] = voidRect;
    const open = [];
    const check = (x, y, ox, oy) => {
      if (onArrival(x, y) || wallAt(x + ox * 0.01, y + oy * 0.01) || guarded(x, y)) return;
      open.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    };
    for (let x = x0 + 0.005; x < x1; x += 0.01) {
      check(x, y0, 0, -1);
      check(x, y1, 0, 1);
    }
    for (let y = y0 + 0.005; y < y1; y += 0.01) {
      check(x0, y, -1, 0);
      check(x1, y, 1, 0);
    }
    expect(open).toEqual([]);
    // bieg górny od strony otworu nad biegiem dolnym (dusza, y = 5,80)
    for (let x = 6.36; x < x1 - 0.03; x += 0.01) expect(guardedFlight(x, 5.8), `dusza x = ${x.toFixed(2)}`).toBe(true);
    // poręcze nie zostawiają przerw: każda lamela ucięta poręczą leży pod poręczą swojej linii
    for (const s of slats.filter((x) => !x.underSlab)) {
      const under = rails.some((r) => r.line === s.line && s.x >= Math.min(r.from[0], r.to[0]) - profile / 2 - 1e-9 && s.x <= Math.max(r.from[0], r.to[0]) + profile / 2 + 1e-9 &&
        s.y >= Math.min(r.from[1], r.to[1]) - profile / 2 - 1e-9 && s.y <= Math.max(r.from[1], r.to[1]) + profile / 2 + 1e-9);
      expect(under, `${s.line} ${s.x.toFixed(2)},${s.y.toFixed(2)} bez poręczy`).toBe(true);
    }
    // wyjście z biegu górnego: żadna poręcz nie przecina krawędzi x = 7,92 między y 4,82 a 5,80
    for (const r of rails) {
      const crossesExit = Math.min(r.from[0], r.to[0]) <= 7.92 && Math.max(r.from[0], r.to[0]) >= 7.92 && Math.min(r.from[1], r.to[1]) < 5.79 && Math.max(r.from[1], r.to[1]) > 4.83;
      expect(crossesExit).toBe(false);
    }
    // wyjście z biegu górnego na korytarz (x = 7,92; y 4,80..5,80) i bieg górny: bez lameli
    expect(slats.filter((s) => s.x > 6.3 && s.x < 8.8 && s.y - profile / 2 > 4.8 + 0.021 && s.y + profile / 2 < 5.8)).toEqual([]);
    expect(slats.filter((s) => Math.abs(s.x - 7.92) < 0.03 && s.y > 4.83 && s.y < 5.79)).toEqual([]);
    // wejście na bieg dolny (x ≥ 8,46) i sam bieg dolny (y 5,85..6,80): bez lameli poniżej posadzki poddasza
    expect(slats.filter((s) => s.x > 8.46)).toEqual([]);
    expect(slats.filter((s) => s.z0 < FLOOR - 0.01 && s.y - profile / 2 > 5.85 + 1e-9)).toEqual([]);
    // lamele nad biegiem dolnym nie schodzą poniżej posadzki poddasza – przejście po schodach pod nimi jak w projekcie
    for (const s of over) expect(s.z0).toBeCloseTo(FLOOR, 9);
  });

  it('kolizje spaceru: otwór osłonięty, po schodach da się wejść i zejść, wyjście na korytarz wolne', () => {
    const col = buildCollision(house, design);
    const blocked = (levelId, x, y) => col.walls(levelId).some((w) => pointInRect(x, y, w.rect));
    expect(blocked('poddasze', 6.5, 4.8)).toBe(true); // wzdłuż korytarza
    expect(blocked('poddasze', 7.92, 6.3)).toBe(true); // nad biegiem dolnym
    expect(blocked('poddasze', 7.0, 5.83)).toBe(true); // w duszy
    expect(blocked('parter', 7.0, 5.83)).toBe(true);
    expect(blocked('poddasze', 7.92, 5.3)).toBe(false); // wyjście z biegu górnego
    const start = col.stairsSpot('parter');
    const path = [];
    for (let x = start.x; x > 6.0; x -= 0.05) path.push([x, 6.3]);
    for (let a = 0; a <= Math.PI; a += 0.05) path.push([6.0 - 0.3 * Math.sin(a), 5.8 + 0.5 * Math.cos(a)]);
    for (let x = 6.0; x < 8.5; x += 0.05) path.push([x, 5.3]);
    let z = 0;
    let p = { x: path[0][0], y: path[0][1] };
    for (const [x, y] of path) {
      // postać idzie do kolejnego punktu ścieżki i nie jest spychana przez lamele
      p = moveCircle(p.x, p.y, x - p.x, y - p.y, WALK_RADIUS, col.walls(col.levelIdAtHeight(z)));
      expect(Math.hypot(p.x - x, p.y - y), `@ ${x.toFixed(2)},${y.toFixed(2)}`).toBeLessThan(0.02);
      z = col.groundAt(p.x, p.y, z);
      expect(z, `@ ${x.toFixed(2)},${y.toFixed(2)}`).not.toBe(null);
    }
    expect(z).toBeCloseTo(FLOOR, 9);
    // z korytarza nie da się wejść w otwór ani przez lamele wzdłuż korytarza, ani nad biegiem dolnym
    p = { x: 6.5, y: 4.2 };
    for (let i = 0; i < 40; i++) p = moveCircle(p.x, p.y, 0, 0.05, WALK_RADIUS, col.walls('poddasze'));
    expect(p.y).toBeLessThanOrEqual(4.78 - WALK_RADIUS + 1e-6);
    p = { x: 8.6, y: 6.3 };
    for (let i = 0; i < 40; i++) p = moveCircle(p.x, p.y, -0.05, 0, WALK_RADIUS, col.walls('poddasze'));
    expect(p.x).toBeGreaterThanOrEqual(7.94 + WALK_RADIUS - 1e-6);
  });
});

// ---------------------------------------------------------------- dodatkowe okna połaciowe

describe('dodatkowe okna połaciowe w pokojach dzieci (extraRoofWindows)', () => {
  const extra = extraRoofWindows(house, design);
  const project = upper.roofWindows;
  const axes = rafterAxes(design);
  const RW = design.extraRoofWindows.rafters.width;
  const SLOPE_OF = { '1/4': 'slope-N', '1/5': 'slope-S', '1/8': 'slope-S' };

  it('stan z projektu: każdy z trzech pokoi ma już okno do podłogi w szczycie – i model je pokazuje', () => {
    const gable = { '1/4': 'OE1', '1/5': 'OE2', '1/8': 'OW2' };
    for (const [roomId, id] of Object.entries(gable)) {
      const o = upper.openings.find((x) => x.id === id);
      expect(o).toMatchObject({ kind: 'frenchWindow', room: roomId, height: 2.31, sill: 0 });
      expect(project.some((rw) => rw.room === roomId), roomId).toBe(false); // okna połaciowego w projekcie nie ma
      const wall = upper.walls.find((w) => w.id === o.wall);
      const inner = o.wall === 'Z-E' ? wall.rect[0] : wall.rect[2]; // wewnętrzne lico szczytu
      const ym = (o.at[0] + o.at[1]) / 2;
      const walls = [...base.surfaces.values()].filter((s) => s.levelId === 'poddasze' && s.roomId === roomId && s.kind === 'wall');
      const covered = (z) => walls.some((s) => trianglesOf(s.mesh).some((t) => triangleCovers(t, [inner, ym, FLOOR + z])));
      expect(covered(1.0), `${id}: otwór w ścianie`).toBe(false);
      expect(covered(2.45), `${id}: mur nad otworem`).toBe(true);
      // szyba i rama w otworze
      const outside = (t) => [t.a, t.b, t.c].every((p) => (o.wall === 'Z-E' ? p[0] > inner : p[0] < inner));
      const spans = (t) => Math.min(t.a[1], t.b[1], t.c[1]) < ym && Math.max(t.a[1], t.b[1], t.c[1]) > ym;
      expect(trianglesOf(byName(base, 'poddasze:joinery:glass')).some((t) => outside(t) && spans(t) && Math.abs(t.n[0]) > 0.9), `${id}: szyba`).toBe(true);
      expect(trianglesOf(byName(base, 'poddasze:joinery:frame')).some((t) => outside(t) && pointInRect(centroid(t)[0], centroid(t)[1], [wall.rect[0] - 0.3, o.at[0], wall.rect[2] + 0.3, o.at[1]])), `${id}: rama`).toBe(true);
    }
  });

  it('rozstaw krokwi przepisany z projektu więźby: 20 par, 15,53 m, okna z projektu leżą między krokwiami', () => {
    expect(axes.length).toBe(20);
    expect(axes[0]).toBe(-0.96);
    expect(axes[19]).toBeCloseTo(14.57, 9);
    expect(design.extraRoofWindows.rafters.spacing.reduce((s, v) => s + v, 0)).toBeCloseTo(15.53, 9);
    expect(RW).toBe(0.08);
    // dokładność odczytu położenia łańcucha ok. 1–2 cm (okna w house.json są z pomiaru rysunku)
    for (const rw of project) {
      const i = axes.findIndex((a, k) => k < axes.length - 1 && a + RW / 2 - 0.015 <= rw.x[0] && rw.x[1] <= axes[k + 1] - RW / 2 + 0.015);
      expect(i, rw.id).toBeGreaterThanOrEqual(0);
      expect(axes[i + 1] - axes[i], rw.id).toBeCloseTo(0.9, 9); // wszystkie w polach 90 cm
    }
  });

  it('trzy okna 78 × 118: po jednym w pokojach 1/4, 1/5, 1/8, na połaci nad pokojem', () => {
    expect(extra.map((w) => [w.id, w.room, w.slope])).toEqual([['OPD1', '1/4', 'skos-N'], ['OPD2', '1/5', 'skos-S'], ['OPD3', '1/8', 'skos-S']]);
    expect(extra.map((w) => w.plan)).toEqual([[11.37, 8.885, 12.15, 9.85], [11.37, 0.25, 12.15, 1.215], [1.56, 0.25, 2.34, 1.215]]);
    for (const w of extra) {
      expect(w).toMatchObject({ width: 0.78, length: 1.18, zBottom: 4.98, zTop: 5.66, extra: true });
      expect(project.some((p) => p.id === w.id)).toBe(false);
    }
    expect(roofWindowsOf(d.models[1].house, d.models[1].level).length).toBe(8);
  });

  it('nowe okna spełniają te same warunki co okna z projektu (tools/check.mjs)', () => {
    const cos = Math.cos((house.roof.pitchDeg * Math.PI) / 180);
    for (const rw of extra) {
      const s = upper.ceiling.slopes.find((x) => x.id === rw.slope);
      expect(Math.abs(rw.plan[3] - rw.plan[1] - rw.length * cos), rw.id).toBeLessThanOrEqual(0.01);
      expect(rw.x[1] - rw.x[0], rw.id).toBeCloseTo(rw.width, 9);
      expect([rw.plan[0], rw.plan[2]], rw.id).toEqual(rw.x);
      // rzędne dołu i góry leżą w połaci – i są takie same jak okien z projektu
      for (const [yy, z] of s.side === '+y' ? [[rw.plan[3], rw.zBottom], [rw.plan[1], rw.zTop]] : [[rw.plan[1], rw.zBottom], [rw.plan[3], rw.zTop]]) {
        expect(Math.abs(roofTopAt(house.roof, yy) - z), rw.id).toBeLessThanOrEqual(0.01);
      }
      expect([rw.zBottom, rw.zTop]).toEqual([project[0].zBottom, project[0].zTop]);
      // nie nad ścianką działową ani nośną
      for (const w of upper.walls.filter((x) => x.type !== 'ext')) expect(rectIntersection(rw.plan, w.rect), `${rw.id} / ${w.id}`).toBeNull();
      // dolna krawędź nad licem ścianki kolankowej
      expect(s.side === '+y' ? rw.plan[3] : rw.plan[1], rw.id).toBeCloseTo(s.kneeWallFace, 9);
      // w całości nad swoim pomieszczeniem
      const room = upper.rooms.find((r) => r.id === rw.room);
      const col = buildCollision(house);
      for (const [x, y] of [[rw.plan[0] + 0.01, rw.plan[1] + 0.01], [rw.plan[2] - 0.01, rw.plan[1] + 0.01], [rw.plan[0] + 0.01, rw.plan[3] - 0.01], [rw.plan[2] - 0.01, rw.plan[3] - 0.01]]) {
        expect(col.pointInRoom('poddasze', x, y), rw.id).toBe(room.id);
      }
    }
  });

  it('okna nie kolidują z istniejącymi oknami, kominami, wyłazem, płatwiami ani jętkami', () => {
    const grow = (r, m) => [r[0] - m, r[1] - m, r[2] + m, r[3] + m];
    for (const rw of extra) {
      for (const other of [...project, ...extra.filter((x) => x !== rw)]) expect(rectIntersection(grow(rw.plan, 0.1), other.plan), `${rw.id} / ${other.id}`).toBeNull();
      for (const ch of house.roof.chimneysAboveRoof) expect(rectIntersection(grow(rw.plan, 0.3), ch.rect), `${rw.id} / ${ch.chimney}`).toBeNull();
      expect(rectIntersection(grow(rw.plan, 0.3), house.roof.roofHatch.plan), rw.id).toBeNull();
      // płatwie w osiach y = 2,40 i 7,70 (pas ±20 cm), jętki ze spodem +5,68 – ponad górną krawędzią okna
      for (const y of design.openCeiling.beams.purlins.axesY) expect(rw.plan[1] > y + 0.2 || rw.plan[3] < y - 0.2, `${rw.id} / płatew ${y}`).toBe(true);
      expect(rw.zTop).toBeLessThan(FLOOR + design.openCeiling.beams.collarTies.underside);
    }
  });

  it('szerokość okna mieści się między krokwiami; zmiana rozstawu jest zapisana jawnie', () => {
    for (const w of design.extraRoofWindows.windows) {
      const [a0, a1] = w.betweenRafters;
      const x0 = w.x[0];
      const x1 = x0 + design.extraRoofWindows.width;
      // co najmniej 1 cm luzu do lica krokwi z każdej strony, okno w osi pola
      expect(x0 - (a0 + RW / 2), w.id).toBeGreaterThanOrEqual(0.01 - 1e-9);
      expect(a1 - RW / 2 - x1, w.id).toBeGreaterThanOrEqual(0.01 - 1e-9);
      expect((x0 + x1) / 2, w.id).toBeCloseTo((a0 + a1) / 2, 9);
      expect(axes.some((a) => Math.abs(a - a1) < 1e-9), w.id).toBe(true);
      if (w.rafterShift) {
        // krokiew z projektu przesunięta: nowa oś zapisana, stara była w projekcie, sąsiednie pole dalej ma ≥ 70 cm (jak najwęższe w projekcie)
        const i = w.rafterShift.pair - 1;
        expect(axes[i], w.id).toBeCloseTo(w.rafterShift.from, 9);
        expect(a0, w.id).toBe(w.rafterShift.to);
        expect(Math.abs(w.rafterShift.to - w.rafterShift.from), w.id).toBeLessThanOrEqual(0.08 + 1e-9);
        expect(w.rafterShift.to - axes[i - 1], w.id).toBeGreaterThanOrEqual(0.7 - 1e-9);
        expect(a1, w.id).toBeCloseTo(axes[i + 1], 9);
        expect(w.note).toMatch(/66 × 118|ta sama przesunięta/);
      } else {
        expect(axes.some((a) => Math.abs(a - a0) < 1e-9), w.id).toBe(true);
        expect(a1 - a0, w.id).toBeCloseTo(0.9, 9);
      }
    }
    // OPD1 i OPD2 leżą w tym samym polu – jedna przesunięta para krokwi
    const [w1, w2] = design.extraRoofWindows.windows;
    expect(w1.rafterShift).toEqual(w2.rafterShift);
    expect(w1.x).toEqual(w2.x);
  });

  it('okno mniej więcej pośrodku szerokości pokoju', () => {
    const offset = {};
    for (const rw of extra) {
      const room = upper.rooms.find((r) => r.id === rw.room);
      // szerokość pokoju przy ściance kolankowej, pod oknem
      const y = (rw.plan[1] + rw.plan[3]) / 2;
      const xs = [];
      for (let x = 0; x < 13.6; x += 0.01) if (buildCollisionOnce().pointInRoom('poddasze', x, y) === room.id) xs.push(x);
      const mid = (xs[0] + xs[xs.length - 1]) / 2;
      offset[rw.room] = +((rw.x[0] + rw.x[1]) / 2 - mid).toFixed(2);
    }
    // 1/8: najbliższe pole 90 cm między krokwiami leży 70 cm od osi pokoju (nad osią pola mają 70 cm)
    expect(offset).toEqual({ '1/4': 0.32, '1/5': 0.01, '1/8': -0.7 });
  });

  it('skosy pokoi mają otwór i mniejsze pole; dach, rama, szyba i szpalety jak przy oknach z projektu', () => {
    const windows = roofWindowsOf(d.models[1].house, d.models[1].level).filter((w) => extra.some((e) => e.id === w.id));
    expect(windows.length).toBe(3);
    const roofTop = trianglesOf(byName(d, 'poddasze:roof:roof')).filter((t) => t.n[2] > 0.5);
    const roofBottom = trianglesOf(byName(d, 'poddasze:roof:roof')).filter((t) => t.n[2] < -0.5);
    const glass = trianglesOf(byName(d, 'poddasze:roof:glass'));
    const reveal = trianglesOf(byName(d, 'poddasze:ceiling:reveal'));
    for (const w of windows) {
      const room = extra.find((e) => e.id === w.id).room;
      const id = `poddasze:${room}:${SLOPE_OF[room]}`;
      const before = base.surfaces.get(id);
      const after = d.surfaces.get(id);
      const [x0, y0, x1, y1] = w.cladRect;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const tris = trianglesOf(after.mesh);
      expect(trianglesOf(before.mesh).some((t) => triangleCoversPlan(t, cx, cy)), id).toBe(true);
      expect(tris.some((t) => triangleCoversPlan(t, cx, cy)), id).toBe(false);
      for (const [px, py] of [[x0 - 0.03, cy], [x1 + 0.03, cy], [cx, Math.max(y0, y1) + 0.03]]) expect(tris.some((t) => triangleCoversPlan(t, px, py)), `${id} ${px},${py}`).toBe(true);
      expect(after.areaM2, id).toBeCloseTo(before.areaM2 - (x1 - x0) * (y1 - y0) * K, 6);
      expect(before.areaM2 - after.areaM2, id).toBeGreaterThan(0.55);
      // otwór w połaci (wierzch i spód pakietu), szyba w płaszczyźnie dachu, cztery ścianki szpaletu
      const [tx0, ty0, tx1, ty1] = w.topRect;
      const tc = [(tx0 + tx1) / 2, (ty0 + ty1) / 2];
      expect(roofTop.some((t) => triangleCoversPlan(t, ...tc)), w.id).toBe(false);
      expect(roofBottom.some((t) => triangleCoversPlan(t, (w.bottomRect[0] + w.bottomRect[2]) / 2, (w.bottomRect[1] + w.bottomRect[3]) / 2)), w.id).toBe(false);
      expect(glass.some((t) => triangleCovers(t, [...tc, roofTopAt(house.roof, tc[1])])), w.id).toBe(true);
      const mine = reveal.filter((t) => { const c = centroid(t); return c[0] > tx0 - 0.01 && c[0] < tx1 + 0.01 && c[1] > Math.min(ty0, y0) - 0.01 && c[1] < Math.max(ty1, y1) + 0.01; });
      expect(mine.length, w.id).toBe(8);
      // szpalet łączy połać z okładziną skosu
      const zs = mine.flatMap((t) => [t.a[2], t.b[2], t.c[2]]);
      expect(Math.abs(Math.max(...zs) - 5.66), w.id).toBeLessThan(0.01);
      expect(Math.min(...zs) - FLOOR, w.id).toBeCloseTo(1.425 + 0.7 * Math.min(Math.abs(y0 - (w.north ? 9.85 : 0.25)), Math.abs(y1 - (w.north ? 9.85 : 0.25))), 6);
    }
    const count = (h, name) => byName(h, name).geometry.attributes.position.count / 3;
    expect(count(d, 'poddasze:roof:glass')).toBe(count(base, 'poddasze:roof:glass') + 6);
    expect(count(d, 'poddasze:roof:frame')).toBe(count(base, 'poddasze:roof:frame') + 3 * 48);
    // żadnych nowych identyfikatorów powierzchni – okna zmieniają tylko pola skosów
    const ids = (h) => [...h.surfaces.keys()].filter((k) => /1\/(4|5|8):/.test(k));
    expect(ids(d)).toEqual(ids(base));
  });

  it('wpisy niepełne albo powtórzone są pomijane; inny wymiar okna liczony z kąta dachu', () => {
    const make = (windows, more = {}) => extraRoofWindows(house, { extraRoofWindows: { windows, ...more } });
    expect(make([{ id: 'X1', room: '1/4', slope: 'skos-N', x: [11.37] }]).length).toBe(1);
    expect(make([{ id: 'X1', room: '9/9', slope: 'skos-N', x: [11.37] }])).toEqual([]);
    expect(make([{ id: 'X1', room: '1/4', slope: 'skos-X', x: [11.37] }])).toEqual([]);
    expect(make([{ id: 'X1', room: '1/4', slope: 'skos-N' }])).toEqual([]);
    expect(make([{ id: 'OP1', room: '1/4', slope: 'skos-N', x: [11.37] }])).toEqual([]); // id zajęte przez okno z projektu
    const [small] = make([{ id: 'X2', room: '1/5', slope: 'skos-S', x: [11.4] }], { width: 0.66, length: 0.98 });
    expect(small.plan).toEqual([11.4, 0.25, 12.06, 1.055]);
    expect(small.zBottom).toBeCloseTo(roofTopAt(house.roof, 0.25), 2);
    expect(small.zTop).toBeCloseTo(roofTopAt(house.roof, 1.055), 2);
  });
});

let onceCol = null;
function buildCollisionOnce() {
  if (!onceCol) onceCol = buildCollision(house);
  return onceCol;
}

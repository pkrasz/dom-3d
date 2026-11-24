// Testy opcji bryły (design.json) na prawdziwym house.json:
// pusty design = bryła z projektu; z design.json – lamele przy schodach, stopnie drewniane, sufit otwarty do kalenicy.
// Drzwi przesuwne, lamele ciągłe przez obie kondygnacje i dodatkowe okna połaciowe: tests/geometry.design2.test.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { roomArea, rectArea } from '../tools/geometry.mjs';
import { buildHouse } from '../src/geometry/buildHouse.js';
import { buildCollision } from '../src/geometry/collision.js';
import { pointInPolygon, pointInRect, polygonBBox } from '../src/geometry/plan.js';
import { roofWindowsOf } from '../src/geometry/roofWindows.js';
import { ceilingAt, openCeilingAt, ceilingAtPoint, slopeRidgeY } from '../src/geometry/levelModel.js';
import { beamSolids } from '../src/geometry/beams.js';
import { slatLayout, stairModel, balustradeSegments } from '../src/geometry/stairs.js';
import { slatOptions, treadOptions, beamOptions } from '../src/geometry/design.js';
import { house, model, trianglesOf, area3, areaPlan, areaUv, triangleCovers, triangleCoversPlan, surfacesOf, rectIntersection } from './helpers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const design = JSON.parse(readFileSync(join(root, 'design.json'), 'utf8'));
const designFile = design;

const base = model(); // bryła z projektu (bez design)
const d = buildHouse(house, design);
const upper = house.levels[1];
const FLOOR = upper.floorLevel;
const OPEN = ['1/9', '1/10', '1/11'];
const RIDGE_H = 1.425 + 0.7 * 4.8; // wysokość okładziny pod kalenicą nad posadzką
const K = Math.hypot(1, 0.7); // długość po skosie na metr rzutu
const byName = (h, name) => h.statics.find((m) => m.name === name);
const zsOf = (mesh) => trianglesOf(mesh).flatMap((t) => [t.a[2], t.b[2], t.c[2]]);

describe('design.json – plik opcji', () => {
  it('ma trzy opcje, a każda ma opis z dopiskiem o uzgodnieniu z projektantem / konstruktorem', () => {
    expect(design.stairs.groundFloorBalustrade).toBe('slats');
    expect(design.openCeiling.rooms).toEqual(OPEN);
    const notes = [design.stairs.slats.note, design.stairs.treads.note, design.openCeiling.note, design.openCeiling.beams.collarTies.note, design.openCeiling.beams.purlins.note];
    for (const note of notes) {
      expect(note.length).toBeGreaterThan(40);
      expect(note).toMatch(/do uzgodnienia z projektantem \/ konstruktorem/);
    }
    for (const c of [design.stairs.slats.color, design.stairs.treads.tread, design.stairs.treads.riser, design.openCeiling.beams.color]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('opcje wyłączone dają null, włączone – liczby z pliku', () => {
    expect(slatOptions({})).toBeNull();
    expect(treadOptions({})).toBeNull();
    expect(beamOptions({})).toBeNull();
    expect(slatOptions(undefined)).toBeNull();
    expect(slatOptions(design)).toEqual({ profile: 0.04, gap: 0.11, color: '#1d1d1f', continuous: true });
    expect(beamOptions(design).collar.underside).toBe(2.65);
    expect(beamOptions({ openCeiling: { rooms: ['1/9'], beams: { enabled: false } } })).toBeNull();
  });
});

describe('pusty design = bryła z projektu', () => {
  const empty = buildHouse(house, {});

  it('te same surfaceId, pola i siatki stałe co bez design (liczby sprzed wprowadzenia opcji)', () => {
    expect([...empty.surfaces.keys()]).toEqual([...base.surfaces.keys()]);
    expect(base.surfaces.size).toBe(140);
    expect(base.statics.length).toBe(35);
    expect(base.stats.triangles).toBe(5692);
    const total = (h) => [...h.surfaces.values()].reduce((s, x) => s + x.areaM2, 0);
    expect(total(base)).toBeCloseTo(958.90893, 4);
    for (const s of base.surfaces.values()) expect(empty.surfaces.get(s.id).areaM2, s.id).toBeCloseTo(s.areaM2, 9);
    expect(empty.statics.map((m) => `${m.name}:${m.geometry.attributes.position.count}`)).toEqual(base.statics.map((m) => `${m.name}:${m.geometry.attributes.position.count}`));
    expect(empty.stats).toEqual(base.stats);
  });

  it('bez design: sufity płaskie w 1/9, 1/10, 1/11, stara balustrada biegu, schody w jednym materiale, brak belek', () => {
    for (const id of OPEN) expect(base.surfaces.has(`poddasze:${id}:ceiling`), id).toBe(true);
    expect(base.surfaces.has('poddasze:1/9:slope-N')).toBe(false);
    expect(byName(base, 'parter:stairs:balustrade')).toBeTruthy();
    expect(byName(base, 'parter:stairs:stairs')).toBeTruthy();
    for (const name of ['parter:stairs:slat', 'parter:stairs:stairTread', 'parter:stairs:stairRiser', 'poddasze:ceiling:beam']) expect(byName(base, name), name).toBeUndefined();
    expect(base.models[1].openRooms.size).toBe(0);
    expect(beamSolids(house, base.models, {})).toEqual([]);
    expect(slatLayout(house, {}).slats).toEqual([]);
  });
});

describe('sufit otwarty do kalenicy (openCeiling)', () => {
  it('zmiana surfaceId: znikają trzy sufity, dochodzą dwa skosy sypialni; reszta bez zmian', () => {
    const before = new Set(base.surfaces.keys());
    const after = new Set(d.surfaces.keys());
    const removed = [...before].filter((id) => !after.has(id)).sort();
    const added = [...after].filter((id) => !before.has(id)).sort();
    expect(removed).toEqual(['poddasze:1/10:ceiling', 'poddasze:1/11:ceiling', 'poddasze:1/9:ceiling']);
    expect(added).toEqual(['poddasze:1/9:slope-N', 'poddasze:1/9:slope-S']);
    for (const id of OPEN) {
      const kinds = surfacesOf(d, 'poddasze', id).filter((s) => s.kind === 'ceiling' || s.kind === 'slope').map((s) => s.id.split(':')[2]).sort();
      expect(kinds, id).toEqual(id === '1/9' ? ['slope-N', 'slope-S'] : ['slope-N']);
    }
    // powierzchnie pozostałych pomieszczeń mają te same pola co w projekcie
    // (wyjątek: skosy z dodatkowymi oknami połaciowymi – sprawdzane w geometry.design2.test.js)
    const withExtraWindow = ['poddasze:1/4:slope-N', 'poddasze:1/5:slope-S', 'poddasze:1/8:slope-S'];
    for (const s of base.surfaces.values()) {
      if (OPEN.includes(s.roomId) || withExtraWindow.includes(s.id)) continue;
      expect(d.surfaces.get(s.id).areaM2, s.id).toBeCloseTo(s.areaM2, 9);
    }
  });

  it('kalenica okładziny wypada w y = 5,05, najwyżej 1,425 + 0,70 · 4,80 nad posadzką', () => {
    expect(slopeRidgeY(upper)).toBeCloseTo(house.roof.ridge.y, 9);
    expect(openCeilingAt(upper, 5.05)).toBeCloseTo(RIDGE_H, 9);
    expect(openCeilingAt(upper, 0.25)).toBeCloseTo(1.425, 9);
    // tam, gdzie w projekcie jest skos, płaszczyzna jest ta sama
    for (const y of [0.25, 1.0, 1.857, 8.243, 9.0, 9.85]) expect(openCeilingAt(upper, y)).toBeCloseTo(ceilingAt(upper, y), 9);
    // okładzina leży wszędzie pod spodem pakietu dachu
    for (let y = 0.25; y <= 9.85; y += 0.2) expect(FLOOR + openCeilingAt(upper, y)).toBeLessThan(d.shell.underside(y) - 0.1);
  });

  const windowHoles = roofWindowsOf(house, upper).map((w) => w.cladRect);
  for (const id of OPEN) {
    const room = upper.rooms.find((r) => r.id === id);
    it(`${id}: skosy pokrywają cały wielobok na płaszczyźnie skosu, pole i UV poprawne`, () => {
      const parts = surfacesOf(d, 'poddasze', id).filter((s) => s.kind === 'slope');
      const tris = parts.flatMap((s) => trianglesOf(s.mesh));
      const chimneys = (upper.chimneys || []).filter((c) => c.room === id).map((c) => c.rect);
      const excluded = [...chimneys, ...windowHoles];
      const [x0, y0, x1, y1] = polygonBBox(room.polygon);
      let samples = 0;
      for (let x = x0 + 0.037; x < x1; x += 0.13) {
        for (let y = y0 + 0.041; y < y1; y += 0.13) {
          if (!pointInPolygon(x, y, room.polygon) || excluded.some((r) => pointInRect(x, y, r, 0.001))) continue;
          samples += 1;
          const p = [x, y, FLOOR + openCeilingAt(upper, y)];
          expect(tris.filter((t) => triangleCovers(t, p, 1e-4)).length, `${id} @ ${x.toFixed(2)},${y.toFixed(2)}`).toBe(1);
        }
      }
      expect(samples).toBeGreaterThan(50);

      const inRoom = (r) => {
        const b = rectIntersection(r, polygonBBox(room.polygon));
        return b && pointInPolygon((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, room.polygon) ? rectArea(b) : 0;
      };
      const plan = roomArea(upper, room) - windowHoles.reduce((sum, r) => sum + inRoom(r), 0);
      expect(tris.reduce((s, t) => s + areaPlan(t), 0)).toBeCloseTo(plan, 4);
      expect(parts.reduce((s, p) => s + p.areaM2, 0)).toBeCloseTo(plan * K, 3);
      for (const s of parts) {
        const north = s.id.endsWith('slope-N');
        expect(s.label).toMatch(north ? /skos od ogrodu/ : /skos od frontu/);
        expect(s.mesh.userData.part).toBe('ceiling');
        let vMax = 0;
        for (const t of trianglesOf(s.mesh)) {
          expect(t.n[2], s.id).toBeLessThan(-0.5);
          expect(Math.sign(t.n[1]), s.id).toBe(north ? -1 : 1);
          expect(areaUv(t), s.id).toBeCloseTo(area3(t), 5);
          // UV jak dotąd: u = x, v = długość po skosie od ścianki kolankowej
          [t.a, t.b, t.c].forEach((p, i) => {
            expect(t.uv[i][0]).toBeCloseTo(p[0], 5);
            expect(t.uv[i][1]).toBeCloseTo(Math.abs(p[1] - (north ? 9.85 : 0.25)) * K, 5);
            vMax = Math.max(vMax, t.uv[i][1]);
          });
        }
        expect(s.heightM).toBeGreaterThan(0.2);
        expect(s.heightM).toBeLessThanOrEqual(vMax + 1e-6);
      }
    });
  }

  it('sypialnia 1/9: skos od frontu i od ogrodu stykają się pod kalenicą', () => {
    const s = d.surfaces.get('poddasze:1/9:slope-S');
    const n = d.surfaces.get('poddasze:1/9:slope-N');
    expect(Math.max(...zsOf(s.mesh)) - FLOOR).toBeCloseTo(RIDGE_H, 5);
    expect(Math.max(...zsOf(n.mesh)) - FLOOR).toBeCloseTo(RIDGE_H, 5);
    expect(Math.min(...zsOf(s.mesh)) - FLOOR).toBeCloseTo(1.425 + 0.7 * (4.02 - 0.25), 5);
    expect(Math.min(...zsOf(n.mesh)) - FLOOR).toBeCloseTo(1.425 + 0.7 * (9.85 - 7.12), 5);
    expect(s.areaM2).toBeCloseTo((3.0 * 1.03 + 1.8 * 0.21) * K, 4);
    expect(n.areaM2).toBeCloseTo(4.8 * 2.07 * K, 4);
    expect(n.heightM).toBeCloseTo(2.07 * K, 5);
    // łazienka i garderoba: skos od ścianki kolankowej (1,425) do ściany D-2
    for (const id of ['1/10', '1/11']) {
      const zs = zsOf(d.surfaces.get(`poddasze:${id}:slope-N`).mesh);
      expect(Math.min(...zs) - FLOOR, id).toBeCloseTo(1.425, 5);
      expect(Math.max(...zs) - FLOOR, id).toBeCloseTo(1.425 + 0.7 * (9.85 - 7.24), 5);
    }
  });

  it('okna dachowe dalej wycinają otwór w skosie (OP1 w łazience 1/10)', () => {
    const w = roofWindowsOf(house, upper).find((r) => r.id === 'OP1');
    const tris = trianglesOf(d.surfaces.get('poddasze:1/10:slope-N').mesh);
    const cy = (w.cladRect[1] + w.cladRect[3]) / 2;
    expect(tris.some((t) => triangleCoversPlan(t, (w.cladRect[0] + w.cladRect[2]) / 2, cy))).toBe(false);
    expect(tris.some((t) => triangleCoversPlan(t, w.cladRect[0] - 0.05, cy))).toBe(true);
    // szpalety okien z projektu bez zmian; dochodzą tylko szpalety trzech okien dodatkowych (4 czworokąty każdy)
    expect(byName(d, 'poddasze:ceiling:reveal').geometry.attributes.position.count).toBe(byName(base, 'poddasze:ceiling:reveal').geometry.attributes.position.count + 3 * 24);
  });

  it('ściany pomieszczeń otwartych sięgają do skosu; przy kalenicy 1,425 + 0,70 · 4,80', () => {
    const top = (id) => Math.max(...zsOf(d.surfaces.get(id).mesh)) - FLOOR;
    expect(top('poddasze:1/9:wall:5')).toBeCloseTo(RIDGE_H, 5); // szczyt zachodni (x = 0,25), przechodzi pod kalenicą
    expect(top('poddasze:1/9:wall:3')).toBeCloseTo(RIDGE_H, 5); // ściana nośna N-1 (x = 5,05)
    expect(top('poddasze:1/9:wall:0')).toBeCloseTo(1.425 + 0.7 * (4.02 - 0.25), 5); // D-3, wspólna z pokojem 1/8
    expect(top('poddasze:1/9:wall:4')).toBeCloseTo(1.425 + 0.7 * (9.85 - 7.12), 5); // D-2
    expect(top('poddasze:1/10:wall:0')).toBeCloseTo(1.425 + 0.7 * (9.85 - 7.24), 5); // D-2 od łazienki
    expect(top('poddasze:1/10:wall:2')).toBeCloseTo(1.425, 5); // ścianka kolankowa
    expect(d.surfaces.get('poddasze:1/9:wall:5').heightM).toBeCloseTo(RIDGE_H, 5);
    // sąsiedzi z sufitem płaskim: ich strona wspólnej ściany zostaje na 2,55
    expect(top('poddasze:1/8:wall:4')).toBeCloseTo(2.55, 5);
    expect(d.surfaces.get('poddasze:1/8:wall:4').areaM2).toBeCloseTo(base.surfaces.get('poddasze:1/8:wall:4').areaM2, 9);

    // pole ściany szczytowej sypialni: profil skosu po obu stronach kalenicy minus okno OW1 (1,80 × 2,31)
    const h = (y) => openCeilingAt(upper, y);
    const expected = ((h(4.02) + h(5.05)) / 2) * 1.03 + ((h(5.05) + h(7.12)) / 2) * 2.07 - 1.8 * 2.31;
    expect(d.surfaces.get('poddasze:1/9:wall:5').areaM2).toBeCloseTo(expected, 4);
  });

  it('każda ściana pomieszczenia otwartego jest szczelna aż do skosu (bez dziur na wylot)', () => {
    const m = d.models[1];
    let checked = 0;
    for (const rm of m.rooms.filter((r) => OPEN.includes(r.id))) {
      for (const e of rm.edges) {
        const s = d.surfaces.get(`poddasze:${rm.id}:wall:${e.index}`);
        const tris = trianglesOf(s.mesh);
        for (const [s0, s1] of e.solid) {
          for (let q = s0 + 0.031; q < s1; q += 0.17) {
            const [x, y] = e.axis === 'x' ? [q, e.c] : [e.c, q];
            const hTop = m.ceilingAtRoom(rm.id, y);
            for (let z = 0.05; z < hTop - 0.01; z += 0.21) {
              if (e.holes.some((o) => q > o.s0 - 1e-3 && q < o.s1 + 1e-3 && z > o.z0 - 1e-3 && z < o.z1 + 1e-3)) continue;
              expect(tris.filter((t) => triangleCovers(t, [x, y, FLOOR + z], 1e-4)).length, `${s.id} @ ${q.toFixed(2)}, ${z.toFixed(2)}`).toBe(1);
              checked += 1;
            }
            // nic nie wystaje ponad okładzinę
            expect(tris.some((t) => triangleCovers(t, [x, y, FLOOR + hTop + 0.02], 1e-4)), s.id).toBe(false);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1500);
  });

  it('część ścian ponad dawnym sufitem stoi za headerStart (znika razem z sufitami)', () => {
    let marked = 0;
    for (const s of d.surfaces.values()) {
      if (s.kind !== 'wall' || !OPEN.includes(s.roomId)) continue;
      const u = s.mesh.userData;
      expect(u.upperStart, s.id).toBeUndefined();
      const tris = trianglesOf(s.mesh);
      const high = (t) => Math.max(t.a[2], t.b[2], t.c[2]) > FLOOR + 2.55 + 1e-6;
      if (!tris.some(high)) {
        expect(u.headerStart, s.id).toBeUndefined();
        continue;
      }
      marked += 1;
      expect(u.headerStart % 3, s.id).toBe(0);
      tris.forEach((t, i) => expect(high(t), `${s.id} #${i}`).toBe(i * 3 >= u.headerStart));
      // poniżej granicy ściana jest taka jak w projekcie
      const before = base.surfaces.get(s.id);
      const low = tris.slice(0, u.headerStart / 3).reduce((sum, t) => sum + area3(t), 0);
      expect(low, s.id).toBeCloseTo(before.areaM2, 4);
    }
    expect(marked).toBe(12); // 1/9: wszystkie 6, 1/10 i 1/11: po 3 (bez ścianki kolankowej); komin osobno
  });

  it('komin K-A w garderobie sięga do skosu', () => {
    const s = d.surfaces.get('poddasze:1/11:chimney:K-A');
    expect(Math.max(...zsOf(s.mesh)) - FLOOR).toBeCloseTo(1.425 + 0.7 * (9.85 - 8.21), 5);
    expect(s.areaM2).toBeGreaterThan(base.surfaces.get(s.id).areaM2);
  });

  it('belki: jętki i płatew leżą w obrysie pomieszczeń otwartych, pod okładziną skosu', () => {
    const solids = beamSolids(house, d.models, design);
    const collars = solids.filter((b) => b.kind === 'collar');
    const purlins = solids.filter((b) => b.kind === 'purlin');
    expect(collars.length).toBe(10); // 1/9: 5, 1/10: 3, 1/11: 2
    expect(collars.filter((b) => b.roomId === '1/9').length).toBe(5);
    expect(purlins.map((b) => b.roomId).sort()).toEqual(['1/10', '1/11']); // oś y = 7,70; oś 2,40 nie przechodzi przez te pomieszczenia
    for (const b of solids) {
      const room = upper.rooms.find((r) => r.id === b.roomId);
      const [x0, y0, x1, y1] = b.rect;
      for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [(x0 + x1) / 2, (y0 + y1) / 2]]) {
        const inset = [x + Math.sign((x0 + x1) / 2 - x) * 1e-4, y + Math.sign((y0 + y1) / 2 - y) * 1e-4];
        expect(pointInPolygon(inset[0], inset[1], room.polygon), `${b.kind} w ${b.roomId}: ${x}, ${y}`).toBe(true);
      }
      for (const [x, y, z] of b.corners) expect(z, b.roomId).toBeLessThanOrEqual(FLOOR + openCeilingAt(upper, y) + 1e-6);
      // nie przechodzi przez komin
      for (const ch of (upper.chimneys || []).filter((c) => c.room === b.roomId)) expect(rectIntersection(b.rect, ch.rect)).toBeNull();
    }
    // jętki: spód +5,68 (2,65 nad posadzką), kierunek y, rozstaw osi 90,5 cm; w sypialni od ściany do ściany
    const xs = [...new Set(collars.map((b) => +((b.rect[0] + b.rect[2]) / 2).toFixed(4)))].sort((a, b) => a - b);
    expect(xs).toEqual([0.5775, 1.4825, 2.3875, 3.2925, 4.1975]);
    for (const b of collars) {
      expect(b.z0).toBeCloseTo(3.03 + 2.65, 9);
      expect(b.rect[3] - b.rect[1]).toBeGreaterThan(b.rect[2] - b.rect[0]);
    }
    const long = collars.find((b) => b.roomId === '1/9' && Math.abs(b.rect[0] - (0.5775 - 0.06)) < 1e-9);
    expect([long.rect[1], long.rect[3]]).toEqual([4.02, 7.12]);
    // płatew pod jętkami, wzdłuż x, od ściany do ściany
    const p10 = purlins.find((b) => b.roomId === '1/10');
    expect(p10.rect.map((v) => +v.toFixed(3))).toEqual([0.25, 7.63, 2.48, 7.77]);
    expect(p10.z1).toBeCloseTo(3.03 + 2.65, 9);

    const mesh = byName(d, 'poddasze:ceiling:beam');
    expect(mesh.userData.part).toBe('ceiling');
    expect(mesh.userData.noPick).toBe(true);
    expect(mesh.material.color.getHexString()).toBe(design.openCeiling.beams.color.slice(1));
    expect(mesh.geometry.attributes.position.count / 3).toBeLessThan(160);
    for (const t of trianglesOf(mesh)) {
      for (const p of [t.a, t.b, t.c]) {
        expect(OPEN.some((id) => pointInRect(p[0], p[1], polygonBBox(upper.rooms.find((r) => r.id === id).polygon), 1e-6))).toBe(true);
        expect(p[2] - FLOOR).toBeGreaterThan(2.45);
        expect(p[2] - FLOOR).toBeLessThan(2.9);
      }
    }
  });

  it('wysokość pomieszczenia w punkcie: otwarte do skosu, pozostałe jak w projekcie', () => {
    const col = buildCollision(house, design);
    const plain = buildCollision(house);
    expect(col.ceilingAt('poddasze', 2.0, 5.05)).toBeCloseTo(RIDGE_H, 9);
    expect(plain.ceilingAt('poddasze', 2.0, 5.05)).toBeCloseTo(2.55, 9);
    expect(col.ceilingAt('poddasze', 1.0, 9.5)).toBeCloseTo(1.425 + 0.7 * 0.35, 9); // pod skosem w łazience 1/10
    expect(col.ceilingAt('poddasze', 2.0, 2.0)).toBeCloseTo(2.55, 9); // pokój 1/8
    expect(col.ceilingAt('poddasze', 7.0, 4.0)).toBeCloseTo(2.55, 9); // korytarz
    expect(col.ceilingAt('parter', 2.0, 5.05)).toBeCloseTo(2.7, 9);
    expect(col.ceilingAt('strych', 0, 0)).toBeNull();
    expect(ceilingAtPoint(upper, {}, 2.0, 5.05)).toBeCloseTo(2.55, 9);
    // rzut blokad spaceru bez zmian – poza osłoną między biegami, która przy lamelach ciągłych leży w linii lameli (y = 5,83)
    const between = (w) => /^między biegami/.test(w.id);
    for (const id of ['parter', 'poddasze']) expect(col.walls(id).filter((w) => !between(w))).toEqual(plain.walls(id).filter((w) => !between(w)));
    expect(col.walls('poddasze').filter(between).map((w) => w.rect.map((v) => +v.toFixed(3)))).toEqual([[6.28, 5.81, 7.94, 5.85]]);
    expect(plain.walls('poddasze').filter(between).map((w) => w.rect.map((v) => +v.toFixed(3)))).toEqual([[6.28, 5.75, 7.94, 5.79]]);
  });
});

describe('schody: lamele i stopnie drewniane', () => {
  it('lamele tylko przy biegu dolnym (bez slats.continuous): stoją na stopniach i sięgają do spodu stropu; starej balustrady biegu nie ma', () => {
    // wariant opcji sprzed lameli ciągłych – dalej obsługiwany
    const design = { ...designFile, stairs: { ...designFile.stairs, slats: { ...designFile.stairs.slats, continuous: false } } };
    const d = buildHouse(house, design);
    expect(byName(d, 'parter:stairs:balustrade')).toBeUndefined();
    // balustrady przy otworze klatki na poddaszu zostają bez zmian
    expect(byName(d, 'poddasze:stairs:balustrade').geometry.attributes.position.count).toBe(byName(base, 'poddasze:stairs:balustrade').geometry.attributes.position.count);
    expect(byName(d, 'poddasze:stairs:slat')).toBeUndefined();
    expect(buildCollision(house, design).walls('poddasze')).toEqual(buildCollision(house).walls('poddasze'));

    const { slats, rails, profile } = slatLayout(house, design);
    const steps = stairModel(house).steps.filter((s) => s.partIndex === 0);
    expect(profile).toBe(0.04);
    expect(slats.length).toBe(2 * steps.length);
    const seg = balustradeSegments(house).find((s) => s.levelId === 'parter');
    const xs = slats.map((s) => s.x).sort((a, b) => a - b);
    expect(xs[0]).toBeGreaterThan(Math.min(seg.from[0], seg.to[0]));
    expect(xs[xs.length - 1]).toBeLessThan(Math.max(seg.from[0], seg.to[0]));
    for (let i = 1; i < xs.length; i++) {
      const clear = xs[i] - xs[i - 1] - profile;
      expect(clear).toBeGreaterThan(0.09);
      expect(clear).toBeLessThan(0.125);
    }
    for (const s of slats) {
      expect(s.y).toBeCloseTo(seg.from[1], 9); // linia dawnej balustrady (5,83)
      const step = steps.find((st) => pointInPolygon(s.x, s.y, st.poly));
      expect(s.z0).toBeCloseTo(step.top, 9);
      expect(s.z1).toBeCloseTo(s.underSlab ? 2.7 : 2.7 - profile, 9);
      expect(s.underSlab).toBe(s.x > 7.92); // strop przykrywa tylko pas x 7,92..8,80
    }
    // nad biegiem w otworze klatki lamele spina profil na wysokości spodu stropu
    expect(rails.length).toBe(1);
    expect(rails[0].z + profile / 2).toBeCloseTo(2.7, 9);
    expect(Math.max(rails[0].from[0], rails[0].to[0])).toBeCloseTo(7.92, 9);

    const mesh = byName(d, 'parter:stairs:slat');
    expect(mesh.userData).toMatchObject({ levelId: 'parter', part: 'stairs', noPick: true });
    expect(mesh.material.color.getHexString()).toBe('1d1d1f');
    const bb = mesh.geometry.boundingBox;
    expect(bb.min.z).toBeCloseTo(3.03 / 18, 5);
    expect(bb.max.z).toBeCloseTo(2.7, 5);
    expect(bb.min.y).toBeCloseTo(5.81, 5);
    expect(bb.max.y).toBeCloseTo(5.85, 5);
    expect(bb.min.x).toBeGreaterThanOrEqual(6.3);
    expect(bb.max.x).toBeLessThanOrEqual(8.46);
    expect(mesh.geometry.attributes.position.count / 3).toBeLessThan(200);
  });

  it('stopnice w kolorze dębu, podstopnice jasne; obrys i rzędne schodów jak w projekcie', () => {
    expect(byName(d, 'parter:stairs:stairs')).toBeUndefined();
    expect(byName(d, 'parter:stairs:stairsAlt')).toBeUndefined();
    const tread = byName(d, 'parter:stairs:stairTread');
    const alt = byName(d, 'parter:stairs:stairTreadAlt');
    const riser = byName(d, 'parter:stairs:stairRiser');
    expect(tread.material.color.getHexString()).toBe(design.stairs.treads.tread.slice(1));
    expect(riser.material.color.getHexString()).toBe(design.stairs.treads.riser.slice(1));
    expect(alt.material.color.r).toBeLessThan(tread.material.color.r);
    const step = 3.03 / 18;
    expect(Math.max(tread.geometry.boundingBox.max.z, alt.geometry.boundingBox.max.z)).toBeCloseTo(3.03 - step, 5);
    expect(riser.geometry.boundingBox.min.z).toBeCloseTo(0, 5);
    expect([riser.geometry.boundingBox.min.x, riser.geometry.boundingBox.min.y, riser.geometry.boundingBox.max.x, riser.geometry.boundingBox.max.y].map((v) => +v.toFixed(3))).toEqual([5.3, 4.8, 8.46, 6.8]);
    // każda stopnica ma deskę dokładnie na rzędnej stopnia z projektu
    const boards = [...trianglesOf(tread), ...trianglesOf(alt)].filter((t) => t.n[2] > 0.9);
    for (const s of stairModel(house).steps) {
      const cx = s.poly.reduce((sum, p) => sum + p[0], 0) / s.poly.length;
      const cy = s.poly.reduce((sum, p) => sum + p[1], 0) / s.poly.length;
      expect(boards.some((t) => triangleCovers(t, [cx, cy, s.top])), `stopień ${s.k}`).toBe(true);
    }
    // jasna bryła stopnia nie ma wierzchu – nie przebija przez deskę
    expect(trianglesOf(riser).some((t) => t.n[2] > 0.9)).toBe(false);
  });
});

describe('bryła z design.json – poprawność ogólna', () => {
  it('bez NaN, bez zerowych trójkątów, każda powierzchnia z własnym materiałem i kompletem danych', () => {
    const materials = new Set();
    d.group.traverse((o) => {
      if (!o.isMesh) return;
      for (const name of ['position', 'normal', 'uv']) for (const v of o.geometry.attributes[name].array) expect(Number.isFinite(v), `${o.name}.${name}`).toBe(true);
      for (const t of trianglesOf(o)) expect(area3(t), o.name).toBeGreaterThan(1e-9);
      expect(['interior', 'ceiling', 'slab', 'roof', 'exterior', 'stairs', 'joinery', 'cap'], o.name).toContain(o.userData.part);
    });
    const format = /^(parter|poddasze):\d\/\d+:(floor|ceiling|slope-[NS]|wall:\d+|chimney:[\w-]+)$/;
    for (const s of d.surfaces.values()) {
      expect(s.id).toMatch(format);
      expect(materials.has(s.mesh.material), s.id).toBe(false);
      materials.add(s.mesh.material);
      expect(s.areaM2, s.id).toBeGreaterThan(0.01);
      expect(s.widthM, s.id).toBeGreaterThan(0);
      expect(s.heightM, s.id).toBeGreaterThan(0);
      for (const t of trianglesOf(s.mesh)) {
        if (s.kind === 'ceiling' && Math.abs(t.n[2]) < 0.5) continue;
        expect(areaUv(t), s.id).toBeCloseTo(area3(t), 5);
        if (s.kind === 'wall' || s.kind === 'chimney') {
          for (const [u, v] of t.uv) {
            expect(u, s.id).toBeGreaterThanOrEqual(-1e-6);
            expect(u, s.id).toBeLessThanOrEqual(s.widthM + 1e-6);
            expect(v, s.id).toBeGreaterThanOrEqual(-1e-6);
            expect(v, s.id).toBeLessThanOrEqual(s.heightM + 1e-6);
          }
        }
      }
    }
    expect(d.stats.drawCalls).toBeLessThan(260);
    expect(d.stats.triangles).toBeLessThan(20000);
    expect(d.stats.triangles - base.stats.triangles).toBeLessThan(1100); // belki, lamele na dwóch kondygnacjach, troje drzwi przesuwnych, trzy okna
  }, 20000); // sprawdza każdą liczbę każdej siatki – przy obciążonym komputerze nie mieści się w domyślnych 5 s

  it('nic z dachu nie wchodzi do pomieszczeń poniżej sufitu (także otwartego)', () => {
    const offenders = [];
    const N = 8;
    for (const mesh of d.statics.filter((m) => m.userData.part === 'roof')) {
      for (const t of trianglesOf(mesh)) {
        for (let i = 0; i <= N; i++) {
          for (let j = 0; j <= N - i; j++) {
            const p = [0, 1, 2].map((k) => t.a[k] + ((t.b[k] - t.a[k]) * i) / N + ((t.c[k] - t.a[k]) * j) / N);
            const room = upper.rooms.find((r) => pointInPolygon(p[0], p[1], r.polygon));
            if (!room) continue;
            if ((upper.chimneys || []).some((c) => c.room === room.id && pointInRect(p[0], p[1], c.rect, 1e-6))) continue;
            if (p[2] < FLOOR + ceilingAtPoint(upper, design, p[0], p[1]) - 1e-3) offenders.push(`${mesh.name} w ${room.id}: ${p.map((c) => c.toFixed(3))}`);
          }
        }
      }
    }
    expect(offenders.slice(0, 5)).toEqual([]);
  });

  it('żadne dwie siatki nie mają wspólnych, tak samo zwróconych płaszczyzn z częścią wspólną (z-fighting)', () => {
    const tris = [];
    d.group.traverse((o) => {
      if (!o.isMesh) return;
      for (const t of trianglesOf(o)) tris.push({ ...t, mesh: o.name, d: t.n[0] * t.a[0] + t.n[1] * t.a[1] + t.n[2] * t.a[2] });
    });
    const groups = new Map();
    for (const t of tris) {
      const key = `${t.n.map((v) => Math.round(v * 500)).join(',')}|${Math.round(t.d * 1000)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    const project = (t) => {
      const ax = t.n.map(Math.abs);
      const drop = ax[0] >= ax[1] && ax[0] >= ax[2] ? 0 : ax[1] >= ax[2] ? 1 : 2;
      return [t.a, t.b, t.c].map((p) => p.filter((_, i) => i !== drop));
    };
    const cross2 = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const overlapArea = (subject, clip) => {
      let out = subject;
      let c = clip;
      if (cross2(...c) < 0) c = [c[0], c[2], c[1]];
      for (let i = 0; i < 3 && out.length; i++) {
        const A = c[i];
        const B = c[(i + 1) % 3];
        const input = out;
        out = [];
        for (let j = 0; j < input.length; j++) {
          const P = input[j];
          const Q = input[(j + 1) % input.length];
          const sp = cross2(A, B, P);
          const sq = cross2(A, B, Q);
          if (sp >= 0) out.push(P);
          if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) out.push([P[0] + ((Q[0] - P[0]) * sp) / (sp - sq), P[1] + ((Q[1] - P[1]) * sp) / (sp - sq)]);
        }
      }
      let a = 0;
      for (let i = 0; i < out.length; i++) a += out[i][0] * out[(i + 1) % out.length][1] - out[(i + 1) % out.length][0] * out[i][1];
      return Math.abs(a) / 2;
    };
    const clashes = [];
    for (const g of groups.values()) {
      for (let i = 0; i < g.length; i++) {
        for (let j = i + 1; j < g.length; j++) {
          if (g[i].mesh === g[j].mesh && g[i].mesh.includes('balustrade')) continue; // słupek wchodzi w pochwyt – ten sam materiał
          if (overlapArea(project(g[i]), project(g[j])) > 1e-5) clashes.push(`${g[i].mesh} <> ${g[j].mesh}`);
        }
      }
    }
    expect([...new Set(clashes)]).toEqual([]);
  });
});

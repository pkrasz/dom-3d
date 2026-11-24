// Testy geometrii na prawdziwym house.json.
import { describe, it, expect } from 'vitest';
import { roomArea, openingRect, isVertical, rectArea } from '../tools/geometry.mjs';
import { pointInPolygon, pointInRect, polygonBBox } from '../src/geometry/plan.js';
import { roofWindowsOf } from '../src/geometry/roofWindows.js';
import { ceilingAt } from '../src/geometry/levelModel.js';
import { house, model, trianglesOf, area3, areaPlan, areaUv, triangleCovers, triangleCoversPlan, surfacesOf, rectIntersection } from './helpers.js';

const h = model();
const levels = house.levels;

describe('powierzchnie – identyfikatory i poprawność', () => {
  it('surfaceId są unikalne i mają ustalony format', () => {
    const ids = [...h.surfaces.keys()];
    expect(new Set(ids).size).toBe(ids.length);
    const format = /^(parter|poddasze):\d\/\d+:(floor|ceiling|slope-[NS]|wall:\d+|chimney:[\w-]+)$/;
    for (const id of ids) expect(id, id).toMatch(format);
  });

  it('żadna siatka nie ma NaN, a każda powierzchnia ma niezerowe pole', () => {
    h.group.traverse((o) => {
      if (!o.isMesh) return;
      for (const name of ['position', 'normal', 'uv']) {
        for (const v of o.geometry.attributes[name].array) expect(Number.isFinite(v), `${o.name}.${name}`).toBe(true);
      }
      for (const t of trianglesOf(o)) expect(area3(t), o.name).toBeGreaterThan(1e-9);
    });
    for (const s of h.surfaces.values()) {
      expect(s.areaM2, s.id).toBeGreaterThan(0.01);
      expect(s.widthM, s.id).toBeGreaterThan(0);
      expect(s.heightM, s.id).toBeGreaterThan(0);
      expect(s.label.length, s.id).toBeGreaterThan(3);
    }
  });

  it('każda powierzchnia ma własny materiał i komplet userData', () => {
    const materials = new Set();
    for (const s of h.surfaces.values()) {
      expect(materials.has(s.mesh.material), s.id).toBe(false);
      materials.add(s.mesh.material);
      const u = s.mesh.userData;
      expect(u.surfaceId).toBe(s.id);
      expect(['wall', 'floor', 'ceiling', 'slope', 'chimney']).toContain(u.kind);
      expect(['interior', 'ceiling']).toContain(u.part);
      expect(u.levelId && u.roomId).toBeTruthy();
    }
    h.group.traverse((o) => {
      if (!o.isMesh) return;
      expect(o.userData.levelId, o.name).toBeTruthy();
      expect(['interior', 'ceiling', 'slab', 'roof', 'exterior', 'stairs', 'joinery', 'cap'], o.name).toContain(o.userData.part);
    });
  });

  it('UV są w metrach (pole w UV = pole w 3D) i mieszczą się w wymiarach powierzchni', () => {
    for (const s of h.surfaces.values()) {
      for (const t of trianglesOf(s.mesh)) {
        if (s.kind === 'ceiling' && Math.abs(t.n[2]) < 0.5) continue; // boki podciągów mają własne UV
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
  });

  it('normalne powierzchni wnętrz patrzą do pomieszczenia', () => {
    for (const level of levels) {
      const voidAbove = level.slabAbove?.openings.find((o) => o.kind === 'stairs')?.rect;
      const voidHere = level.stairVoid?.rect;
      for (const room of level.rooms) {
        for (const s of surfacesOf(h, level.id, room.id)) {
          for (const t of trianglesOf(s.mesh)) {
            if (s.kind === 'floor') expect(t.n[2], s.id).toBeCloseTo(1, 5);
            if (s.kind === 'ceiling' && Math.abs(t.n[2]) > 0.5) expect(t.n[2], s.id).toBeCloseTo(-1, 5);
            if (s.kind === 'slope') expect(t.n[2], s.id).toBeLessThan(-0.5);
            if (s.kind !== 'wall') continue;
            const c = [0, 1, 2].map((i) => (t.a[i] + t.b[i] + t.c[i]) / 3);
            const x = c[0] + t.n[0] * 0.03;
            const y = c[1] + t.n[1] * 0.03;
            const inside = pointInPolygon(x, y, room.polygon) || (voidAbove && pointInRect(x, y, voidAbove)) || (voidHere && pointInRect(x, y, voidHere));
            expect(Boolean(inside), `${s.id} @ ${x.toFixed(2)},${y.toFixed(2)}`).toBe(true);
          }
        }
      }
    }
  });

  it('rozsądna liczba siatek i trójkątów', () => {
    expect(h.stats.drawCalls).toBeLessThan(260);
    expect(h.stats.triangles).toBeLessThan(20000);
  });
});

describe('podłogi', () => {
  for (const level of levels) {
    for (const room of level.rooms) {
      it(`${room.id} ${room.name}: pole podłogi = roomArea`, () => {
        const floor = h.surfaces.get(`${level.id}:${room.id}:floor`);
        expect(floor).toBeTruthy();
        expect(Math.abs(floor.areaM2 - roomArea(level, room))).toBeLessThan(0.02);
        for (const t of trianglesOf(floor.mesh)) for (const p of [t.a, t.b, t.c]) expect(p[2]).toBeCloseTo(level.floorLevel, 5);
      });
    }
  }

  it('w progach drzwi jest posadzka', () => {
    for (const level of levels) {
      const mesh = h.statics.find((m) => m.name === `${level.id}:interior:threshold`);
      const tris = trianglesOf(mesh);
      for (const o of level.openings.filter((o) => o.kind === 'door')) {
        const r = openingRect(level, o);
        const p = [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2, level.floorLevel];
        expect(tris.some((t) => triangleCovers(t, p)), o.id).toBe(true);
      }
    }
  });
});

describe('sufity i skosy', () => {
  for (const level of levels) {
    const voidAbove = level.slabAbove?.openings.find((o) => o.kind === 'stairs')?.rect || null;
    const windowHoles = level.roofWindows ? roofWindowsOf(house, level).map((w) => w.cladRect) : [];
    for (const room of level.rooms) {
      it(`${room.id} ${room.name}: sufit i skosy pokrywają cały wielobok`, () => {
        const parts = surfacesOf(h, level.id, room.id).filter((s) => s.kind === 'ceiling' || s.kind === 'slope');
        const tris = parts.flatMap((s) => trianglesOf(s.mesh));
        const chimneys = (level.chimneys || []).filter((c) => c.room === room.id).map((c) => c.rect);
        const excluded = [...chimneys, ...windowHoles, ...(voidAbove ? [voidAbove] : [])];
        const [x0, y0, x1, y1] = polygonBBox(room.polygon);
        let samples = 0;
        for (let x = x0 + 0.037; x < x1; x += 0.11) {
          for (let y = y0 + 0.041; y < y1; y += 0.11) {
            if (!pointInPolygon(x, y, room.polygon) || excluded.some((r) => pointInRect(x, y, r, 0.001))) continue;
            samples += 1;
            const cover = tris.filter((t) => Math.abs(t.n[2]) > 0.5 && triangleCoversPlan(t, x, y));
            expect(cover.length, `${room.id} @ ${x.toFixed(2)},${y.toFixed(2)}`).toBeGreaterThanOrEqual(1);
          }
        }
        expect(samples).toBeGreaterThan(10);

        // bilans pól w rzucie: wielobok − kominy − otwór klatki nad pomieszczeniem − okna dachowe (+ sufit nad klatką na poddaszu)
        const plan = tris.reduce((sum, t) => sum + areaPlan(t), 0);
        const inRoom = (r) => {
          const b = rectIntersection(r, polygonBBox(room.polygon));
          return b && pointInPolygon((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, room.polygon) ? rectArea(b) : 0;
        };
        let expected = roomArea(level, room) - windowHoles.reduce((sum, r) => sum + inRoom(r), 0);
        if (voidAbove) {
          // część otworu klatki leżąca w wieloboku (wielobok bywa niewypukły – liczymy siatką)
          let cut = 0;
          const step = 0.01;
          for (let x = voidAbove[0] + step / 2; x < voidAbove[2]; x += step) {
            for (let y = voidAbove[1] + step / 2; y < voidAbove[3]; y += step) if (pointInPolygon(x, y, room.polygon)) cut += step * step;
          }
          expected -= cut;
        }
        const overVoid = level.stairVoid && tris.some((t) => triangleCoversPlan(t, (level.stairVoid.rect[0] + level.stairVoid.rect[2]) / 2, (level.stairVoid.rect[1] + level.stairVoid.rect[3]) / 2));
        if (overVoid) expected += rectArea(level.stairVoid.rect);
        expect(Math.abs(plan - expected)).toBeLessThan(0.02);
      });
    }
  }

  it('sufit parteru jest na 2,70 (pod podciągiem B1 na 2,46), sufit poddasza na 2,55', () => {
    const z = (id) => trianglesOf(h.surfaces.get(id).mesh).filter((t) => Math.abs(t.n[2]) > 0.5).flatMap((t) => [t.a[2], t.b[2], t.c[2]]);
    expect(Math.max(...z('parter:0/9:ceiling'))).toBeCloseTo(2.7, 5);
    expect(Math.min(...z('parter:0/9:ceiling'))).toBeCloseTo(2.7, 5);
    expect(Math.min(...z('parter:0/6:ceiling'))).toBeCloseTo(2.46, 5);
    expect(Math.min(...z('parter:0/5:ceiling'))).toBeCloseTo(2.46, 5);
    expect(Math.max(...z('poddasze:1/9:ceiling'))).toBeCloseTo(3.03 + 2.55, 5);
    // nadproże przejścia PN1 w korytarzu poddasza: 2,40
    expect(Math.min(...z('poddasze:1/2:ceiling'))).toBeCloseTo(3.03 + 2.4, 5);
  });

  it('nad otworem klatki schodowej jest sufit poddasza', () => {
    const v = levels[1].stairVoid.rect;
    const tris = trianglesOf(h.surfaces.get('poddasze:1/2:ceiling').mesh);
    expect(tris.some((t) => triangleCovers(t, [(v[0] + v[2]) / 2, (v[1] + v[3]) / 2, 3.03 + 2.55]))).toBe(true);
  });

  it('skos zaczyna się na 1,425 przy ściance kolankowej i dochodzi do sufitu 2,55', () => {
    for (const s of [...h.surfaces.values()].filter((s) => s.kind === 'slope')) {
      const zs = trianglesOf(s.mesh).flatMap((t) => [t.a[2], t.b[2], t.c[2]]);
      expect(Math.min(...zs) - 3.03, s.id).toBeCloseTo(1.425, 5);
      expect(Math.max(...zs) - 3.03, s.id).toBeCloseTo(2.55, 3);
    }
  });

  it('okna dachowe wycinają otwór w skosie', () => {
    const upper = levels[1];
    for (const w of roofWindowsOf(house, upper)) {
      const rw = upper.roofWindows.find((r) => r.id === w.id);
      const side = w.north ? 'N' : 'S';
      const tris = trianglesOf(h.surfaces.get(`poddasze:${rw.room}:slope-${side}`).mesh);
      const cx = (w.cladRect[0] + w.cladRect[2]) / 2;
      const cy = (w.cladRect[1] + w.cladRect[3]) / 2;
      expect(tris.some((t) => triangleCoversPlan(t, cx, cy)), w.id).toBe(false);
      expect(tris.some((t) => triangleCoversPlan(t, w.cladRect[0] - 0.05, cy)), w.id).toBe(true);
    }
  });
});

describe('ściany', () => {
  it('pomieszczenie prostokątne zamknięte ścianami: pole ścian + pole otworów = obwód × wysokość', () => {
    let checked = 0;
    for (const m of h.models) {
      if (m.level.ceiling) continue; // na poddaszu wysokość nie jest stała
      for (const rm of m.rooms) {
        const closed = rm.polygon.length === 4 && rm.edges.every((e) => e.open.length === 0);
        if (!closed) continue;
        const walls = surfacesOf(h, m.id, rm.id, 'wall');
        const wallArea = walls.reduce((s, w) => s + w.areaM2, 0);
        const holeArea = rm.edges.flatMap((e) => e.holes).reduce((s, o) => s + (o.s1 - o.s0) * (o.z1 - o.z0), 0);
        const covered = rm.edges.reduce((s, e) => s + (e.hi - e.lo) - e.solid.reduce((a, [p, q]) => a + q - p, 0), 0); // zasłonięte kominem
        const perimeter = rm.edges.reduce((s, e) => s + e.hi - e.lo, 0);
        expect(wallArea + holeArea + covered * m.level.ceilingHeight, rm.id).toBeCloseTo(perimeter * m.level.ceilingHeight, 5);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
  });

  it('łazienka 0/3 (prostokąt 1,40 × 1,78 z jednymi drzwiami) – liczby wprost', () => {
    const walls = surfacesOf(h, 'parter', '0/3', 'wall');
    expect(walls.length).toBe(4);
    const total = walls.reduce((s, w) => s + w.areaM2, 0);
    expect(total).toBeCloseTo(2 * (1.4 + 1.78) * 2.7 - 0.92 * 2.08, 5);
  });

  it('każdy otwór wycina dziurę po obu stronach ściany', () => {
    const wallTris = [...h.surfaces.values()].filter((s) => s.kind === 'wall').flatMap((s) => trianglesOf(s.mesh));
    const facadeTris = h.statics.filter((m) => m.userData.static === 'facade' || m.userData.static === 'plinth').flatMap((m) => trianglesOf(m));
    let checked = 0;
    for (const m of h.models) {
      const level = m.level;
      for (const o of level.openings) {
        if (o.kind === 'passage') continue; // przejście w obrysie pomieszczenia – nie ma ściany do wycięcia
        const wall = level.walls.find((w) => w.id === o.wall);
        const axis = isVertical(wall.rect) ? 'y' : 'x';
        const ext = m.extOpenings.get(o.id);
        // okno narożne: środek ramienia liczony w części, za którą jest ściana pomieszczenia
        const a = ext?.cornerWindow ? (ext.cornerAt === 'hi' ? o.at[0] + 0.5 : o.at[1] - 0.5) : (o.at[0] + o.at[1]) / 2;
        const zMid = level.floorLevel + o.sill + o.height / 2;
        const zAbove = level.floorLevel + o.sill + o.height + 0.04;
        const faces = ext
          ? [{ p: ext.inner, tris: wallTris }, { p: ext.face, tris: facadeTris }]
          : (axis === 'x' ? [wall.rect[1], wall.rect[3]] : [wall.rect[0], wall.rect[2]]).map((p) => ({ p, tris: wallTris }));
        for (const f of faces) {
          const at = (z) => (axis === 'x' ? [a, f.p, z] : [f.p, a, z]);
          expect(f.tris.some((t) => triangleCovers(t, at(zMid))), `${o.id}: otwór`).toBe(false);
          expect(f.tris.some((t) => triangleCovers(t, at(zAbove))), `${o.id}: nadproże`).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(2 * 28);
  });

  it('pod skosem ściana przy ściance kolankowej ma 1,425 m', () => {
    const upper = h.models[1];
    let checked = 0;
    for (const rm of upper.rooms) {
      for (const e of rm.edges) {
        const knee = upper.level.ceiling.slopes.some((s) => e.axis === 'x' && Math.abs(e.c - s.kneeWallFace) < 1e-9);
        if (!knee) continue;
        const s = h.surfaces.get(`poddasze:${rm.id}:wall:${e.index}`);
        const zs = trianglesOf(s.mesh).flatMap((t) => [t.a[2], t.b[2], t.c[2]]);
        expect(Math.max(...zs) - upper.floor, s.id).toBeCloseTo(1.425, 5);
        expect(s.heightM).toBeCloseTo(1.425, 5);
        checked += 1;
      }
    }
    expect(checked).toBe(8);
  });

  it('ściana poprzeczna poddasza ma łamaną górną krawędź (1,425 → 2,55)', () => {
    // 1/7 Łazienka, krawędź 1: ściana D-12 od y = 0,25 do 3,40
    const s = h.surfaces.get('poddasze:1/7:wall:1');
    const expected = ((1.425 + 2.55) / 2) * (1.857 - 0.25) + 2.55 * (3.4 - 1.857);
    expect(s.areaM2).toBeCloseTo(expected, 2);
  });

  it('ściany klatki schodowej sięgają od parteru do sufitu poddasza', () => {
    const s = h.surfaces.get('parter:0/7:wall:3');
    const zs = trianglesOf(s.mesh).flatMap((t) => [t.a[2], t.b[2], t.c[2]]);
    expect(Math.max(...zs)).toBeCloseTo(3.03 + 2.55, 5);
  });

  it('pod podciągiem B1 nie ma ściany, są boki podciągu od 2,46 do 2,70', () => {
    const s = h.surfaces.get('parter:0/2:wall:1'); // korytarz, krawędź x = 8,80
    const tris = trianglesOf(s.mesh);
    expect(tris.some((t) => triangleCovers(t, [8.8, 5.0, 1.2]))).toBe(false);
    expect(tris.some((t) => triangleCovers(t, [8.8, 5.0, 2.6]))).toBe(true);
    expect(tris.some((t) => triangleCovers(t, [8.8, 3.0, 1.2]))).toBe(true);
    // pasy podciągu stoją w siatce za murem (userData.headerStart) – widok ukrywa je razem z sufitami
    const start = s.mesh.userData.headerStart;
    expect(start).toBeGreaterThan(0);
    expect(tris.slice(0, start / 3).some((t) => triangleCovers(t, [8.8, 5.0, 2.6]))).toBe(false);
    expect(tris.slice(start / 3).every((t) => Math.min(t.a[2], t.b[2], t.c[2]) >= 2.46 - 1e-6)).toBe(true);
  });

  it('kominy w pomieszczeniach mają własną powierzchnię, a ściana za nimi jest pominięta', () => {
    expect(h.surfaces.has('parter:0/8:chimney:K-A')).toBe(true);
    expect(h.surfaces.has('parter:0/6:chimney:K-C')).toBe(true);
    expect(h.surfaces.has('poddasze:1/11:chimney:K-A')).toBe(true);
    // K-A na parterze: 3 widoczne lica (0,36 + 1,00 + 0,36) × 2,70
    expect(h.surfaces.get('parter:0/8:chimney:K-A').areaM2).toBeCloseTo(1.72 * 2.7, 5);
    // komin K-C na poddaszu nie należy do pomieszczenia – jego lica są ścianami pralni
    expect(h.surfaces.get('poddasze:1/6:wall:3').areaM2).toBeCloseTo(0.86 * 2.55, 5);
  });
});

describe('brak nakładających się powierzchni (z-fighting)', () => {
  it('żadne dwie siatki nie mają wspólnych, tak samo zwróconych płaszczyzn z częścią wspólną', () => {
    const tris = [];
    h.group.traverse((o) => {
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

describe('bryła zewnętrzna, strop, dach', () => {
  const byName = (name) => h.statics.find((m) => m.name === name);

  it('elewacja sięga od terenu do spodu połaci, 20 cm poza murem', () => {
    const lower = byName('parter:exterior:plinth').geometry.boundingBox;
    expect(lower.min.z).toBeCloseTo(levels[0].groundLevel, 5);
    expect(lower.min.x).toBeCloseTo(-0.2, 5);
    expect(lower.max.x).toBeCloseTo(13.8, 5);
    expect(lower.min.y).toBeCloseTo(-0.2, 5);
    expect(lower.max.y).toBeCloseTo(10.3, 5);
    const gable = byName('poddasze:roof:facade').geometry.boundingBox;
    expect(gable.max.z).toBeCloseTo(house.roof.ridge.rafterUnderside, 2);
  });

  it('wnęka wejściowa: spód belki B2 pokazany na +2,41', () => {
    const tris = trianglesOf(byName('parter:exterior:facade'));
    expect(tris.some((t) => t.n[2] < -0.9 && triangleCovers(t, [7.0, 0.0, 2.41]))).toBe(true);
    // w licu frontu pod belką jest otwór wnęki
    expect(tris.some((t) => triangleCovers(t, [7.0, -0.2, 1.0]))).toBe(false);
    expect(tris.some((t) => triangleCovers(t, [7.0, -0.2, 2.55]))).toBe(true);
  });

  it('dach: kalenica +8,34, okap +4,10 / +3,75, wysięg 1,00 m', () => {
    const bb = byName('poddasze:roof:roof').geometry.boundingBox;
    expect(bb.max.z).toBeCloseTo(8.34, 5);
    expect(bb.min.z).toBeCloseTo(3.75, 2);
    expect(bb.min.x).toBeCloseTo(-1, 5);
    expect(bb.max.y).toBeCloseTo(11.1, 5);
    const tris = trianglesOf(byName('poddasze:roof:roof'));
    const eaveTop = Math.max(...tris.flatMap((t) => [t.a, t.b, t.c]).filter((p) => Math.abs(p[1] + 1) < 1e-5).map((p) => p[2]));
    expect(eaveTop).toBeCloseTo(4.1, 2);
  });

  it('nic z dachu (połacie, trzony kominów, szczyty) nie wchodzi do pomieszczeń poniżej sufitu', () => {
    const upper = levels[1];
    const roofMeshes = h.statics.filter((m) => m.userData.part === 'roof');
    expect(roofMeshes.map((m) => m.name)).toContain('poddasze:roof:chimney');
    const N = 8; // próbki wewnątrz każdego trójkąta (współrzędne barycentryczne)
    const offenders = [];
    for (const mesh of roofMeshes) {
      for (const t of trianglesOf(mesh)) {
        for (let i = 0; i <= N; i++) {
          for (let j = 0; j <= N - i; j++) {
            const [u, v] = [i / N, j / N];
            const p = [0, 1, 2].map((k) => t.a[k] + (t.b[k] - t.a[k]) * u + (t.c[k] - t.a[k]) * v);
            const room = upper.rooms.find((r) => pointInPolygon(p[0], p[1], r.polygon));
            if (!room) continue;
            if ((upper.chimneys || []).some((c) => c.room === room.id && pointInRect(p[0], p[1], c.rect, 1e-6))) continue;
            if (p[2] < upper.floorLevel + ceilingAt(upper, p[1]) - 1e-3) offenders.push(`${mesh.name} w ${room.id}: ${p.map((c) => c.toFixed(3))}`);
          }
        }
      }
    }
    expect(offenders.slice(0, 5)).toEqual([]);
    // trzon zaczyna się na spodzie pakietu dachu, dolna krawędź idzie po skosie (K-A: 5,812 / 5,042)
    const zs = trianglesOf(byName('poddasze:roof:chimney')).flatMap((t) => [t.a, t.b, t.c]).filter((p) => Math.abs(p[0] - 2.55) < 1e-6);
    const zb = (y) => house.roof.ridge.top - Math.abs(y - house.roof.ridge.y) * house.roof.slope - house.roof.packageVertical;
    expect(Math.min(...zs.filter((p) => Math.abs(p[1] - 8.16) < 1e-6).map((p) => p[2]))).toBeCloseTo(zb(8.16), 5);
    expect(Math.min(...zs.filter((p) => Math.abs(p[1] - 9.26) < 1e-6).map((p) => p[2]))).toBeCloseTo(zb(9.26), 5);
  });

  it('czapka wierzchu murów parteru przykrywa sufit wnęki wejściowej aż do cofniętej ściany', () => {
    const tris = trianglesOf(byName('parter:cap:topCap'));
    expect(tris.some((t) => triangleCovers(t, [7.0, 0.1, 2.7]))).toBe(true); // nad belką B2
    expect(tris.some((t) => triangleCovers(t, [7.0, 0.33, 2.7]))).toBe(true); // pas między belką a ścianą wnęki
  });

  it('strop: lico otworu klatki widoczne od strony korytarza i nad biegiem dolnym', () => {
    const tris = trianglesOf(byName('parter:slab:slab'));
    expect(tris.some((t) => triangleCovers(t, [6.5, 4.8, 2.9]))).toBe(true);
    expect(tris.some((t) => triangleCovers(t, [7.92, 6.0, 2.9]))).toBe(true);
    // przy ścianach klatki lico należy do ścian, nie do stropu
    expect(tris.some((t) => triangleCovers(t, [5.3, 6.0, 2.9]))).toBe(false);
  });

  it('schody: 17 stopnic, ostatnia jeden stopień poniżej posadzki poddasza', () => {
    const bb = byName('parter:stairs:stairs').geometry.boundingBox;
    const riser = 3.03 / 18;
    expect(bb.max.z).toBeCloseTo(3.03 - riser, 5);
    expect(bb.min.z).toBeCloseTo(0, 5);
    expect([bb.min.x, bb.min.y, bb.max.x, bb.max.y].map((v) => +v.toFixed(3))).toEqual([5.3, 4.8, 8.46, 6.8]);
  });

  it('czapki przekroju leżą tuż pod płaszczyzną cięcia i omijają okna', () => {
    const cap = byName('parter:cap:sectionCap');
    const tris = trianglesOf(cap);
    expect(cap.userData.cap).toBe('section');
    expect(tris.some((t) => triangleCoversPlan(t, 0.1, 5.0))).toBe(true); // mur szczytu garażu
    expect(tris.some((t) => triangleCoversPlan(t, 7.5, 9.97))).toBe(false); // okno O2 w kuchni
    expect(tris.some((t) => triangleCoversPlan(t, 5.17, 1.44))).toBe(false); // drzwi DW3
    expect(tris.some((t) => triangleCoversPlan(t, 2.0, 3.0))).toBe(false); // wnętrze garażu
  });
});

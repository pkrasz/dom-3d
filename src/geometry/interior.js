// Powierzchnie wnętrz: ściany (z krawędzi wieloboków pomieszczeń), podłogi, sufity, skosy, kominy.
// Każda funkcja zwraca listę opisów powierzchni:
//   { id, kind, part, levelId, roomId, builder (MeshBuilder), widthM, heightM, label }
// Siatki i materiały powstają dopiero w buildHouse.js.
import { openingRect } from '../../tools/geometry.mjs';
import { MeshBuilder } from './meshBuilder.js';
import { EPS, gridCells, pointInPolygon, pointInRect, polygonBBox, rectToPolygon, subtractIntervals, rectCenter } from './plan.js';
import { wallFrame, emitPanel, profileTop } from './panels.js';
import { roofWindowsOf } from './roofWindows.js';
import { HATCH_DROP } from './constants.js';

const roomLabel = (room) => `${room.id} ${room.name}`;
const surface = (model, rm, kind, part, suffix, label, builder, widthM, heightM) => ({
  id: `${model.id}:${rm.id}:${suffix}`,
  kind, part, levelId: model.id, roomId: rm.id, builder, widthM, heightM,
  label: `${roomLabel(rm.room)} – ${label}`,
});

// ---------------------------------------------------------------- ściany

export function buildWallSurfaces(model) {
  const out = [];
  for (const rm of model.rooms) {
    for (const edge of rm.edges) {
      const b = new MeshBuilder();
      const frame = wallFrame({ ...edge, floor: model.floor });
      let height = 0;
      // Kolejność trójkątów w siatce pozwala ukrywać jej końcówkę samym drawRange (viewManager.js):
      //   1. mur do spodu stropu,
      //   2. pasy podciągów nad odcinkami otwartymi (userData.headerStart) – znikają razem z sufitami,
      //   3. część ściany klatki schodowej ponad stropem, do sufitu wyższej kondygnacji (userData.upperStart) –
      //      znika razem z wyższą kondygnacją.
      //   Pomieszczenie z sufitem otwartym do kalenicy (design.json): część ściany ponad dawnym sufitem płaskim
      //   stoi w siatce razem z pasami podciągów (headerStart) – w domku dla lalek i w rzucie znika razem z sufitami,
      //   więc ściany kończą się tam na tej samej wysokości co w pozostałych pomieszczeniach.
      const open = model.isOpenRoom(rm.id);
      const flatH = model.level.ceiling?.flatHeight ?? model.level.ceilingHeight;
      const split = open ? flatH : model.level.ceiling ? Infinity : model.level.ceilingHeight;
      const upperPanels = [];
      for (const [s0, s1] of edge.solid) {
        const pieces = edge.topPieces(s0, s1);
        for (const p of pieces) height = Math.max(height, p.t0, p.t1);
        const tall = pieces.filter((p) => p.t0 > split + EPS || p.t1 > split + EPS);
        if (tall.length) upperPanels.push({ bottom: split, pieces: tall, holes: [] });
        emitPanel(b, frame, { bottom: 0, pieces: pieces.map((p) => ({ ...p, t0: Math.min(p.t0, split), t1: Math.min(p.t1, split) })), holes: edge.holes });
      }
      const beforeHeaders = b.positions.length / 3;
      for (const st of edge.strips) {
        const pieces = edge.topPieces(st.s0, st.s1);
        emitPanel(b, frame, { bottom: st.z0, pieces, holes: [] });
        for (const p of pieces) height = Math.max(height, p.t0, p.t1);
      }
      if (open) for (const panel of upperPanels) emitPanel(b, frame, panel);
      if (b.isEmpty) continue;
      const headerStart = b.positions.length / 3 > beforeHeaders ? beforeHeaders : null;
      const upperStart = !open && upperPanels.length ? b.positions.length / 3 : null;
      if (!open) for (const panel of upperPanels) emitPanel(b, frame, panel);
      const d = surface(model, rm, 'wall', 'interior', `wall:${edge.index}`, `ściana ${edge.index + 1}`, b, edge.hi - edge.lo, height);
      d.headerStart = headerStart;
      d.upperStart = upperStart;
      out.push(d);
    }
  }
  return out;
}

// ---------------------------------------------------------------- kominy w pomieszczeniach

export function buildChimneySurfaces(model) {
  const out = [];
  const solidRects = model.solids.map((s) => s.rect);
  for (const rm of model.rooms) {
    for (const ch of rm.chimneys) {
      const [x0, y0, x1, y1] = ch.rect;
      const sides = [
        { axis: 'x', c: y0, n: -1, lo: x0, hi: x1 },
        { axis: 'y', c: x1, n: 1, lo: y0, hi: y1 },
        { axis: 'x', c: y1, n: 1, lo: x0, hi: x1 },
        { axis: 'y', c: x0, n: -1, lo: y0, hi: y1 },
      ];
      const b = new MeshBuilder();
      let width = 0;
      let height = 0;
      for (const side of sides) {
        // lico komina przylegające do ściany jest niewidoczne
        const probe = side.c + side.n * 1e-3;
        const covered = [];
        for (const r of solidRects) {
          const [p0, p1] = side.axis === 'x' ? [r[1], r[3]] : [r[0], r[2]];
          const [a0, a1] = side.axis === 'x' ? [r[0], r[2]] : [r[1], r[3]];
          if (p0 < probe && probe < p1) covered.push([a0, a1]);
        }
        const free = subtractIntervals([[side.lo, side.hi]], covered);
        if (!free.length) continue;
        const frame = wallFrame({ ...side, floor: model.floor, uOffset: width });
        for (const [s0, s1] of free) {
          const pieces = profileTop(s0, s1, side.axis === 'y' ? model.breaksFor(rm.id) : [], (s) => model.ceilingAtRoom(rm.id, side.axis === 'y' ? s : side.c));
          emitPanel(b, frame, { bottom: 0, pieces, holes: [] });
          for (const p of pieces) height = Math.max(height, p.t0, p.t1);
        }
        width += side.hi - side.lo;
      }
      if (b.isEmpty) continue;
      out.push(surface(model, rm, 'chimney', 'interior', `chimney:${ch.id}`, `komin ${ch.id}`, b, width, height));
    }
  }
  return out;
}

// ---------------------------------------------------------------- podłogi

export function buildFloorSurfaces(model) {
  return model.rooms.map((rm) => {
    const b = new MeshBuilder();
    const z = model.floor;
    for (const [x0, y0, x1, y1] of gridCells(rm.polygon, { holes: rm.chimneys.map((c) => c.rect) })) {
      b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    }
    const bb = polygonBBox(rm.polygon);
    return surface(model, rm, 'floor', 'interior', 'floor', 'podłoga', b, bb[2] - bb[0], bb[3] - bb[1]);
  });
}

/**
 * Posadzka w progach drzwi i przejść (meta.buildRules): prostokąt otworu na całą grubość ściany.
 * Przy otworach w ścianach zewnętrznych próg sięga do lica ocieplenia.
 * Zwraca prostokąty [x0, y0, x1, y1] – trafiają do wspólnej, nieedytowalnej siatki.
 */
export function thresholdRects(model, extInfo) {
  const out = [];
  for (const o of model.level.openings) {
    if (o.sill > EPS) continue;
    let rect = openingRect(model.level, o);
    const [cx, cy] = rectCenter(rect);
    if (model.rooms.some((rm) => pointInPolygon(cx, cy, rm.polygon))) continue; // przejście leżące w obrysie pomieszczenia
    const ext = extInfo.get(o.id);
    if (ext) {
      rect = [...rect];
      const lo = Math.min(ext.inner, ext.face);
      const hi = Math.max(ext.inner, ext.face);
      if (ext.axis === 'x') [rect[1], rect[3]] = [lo, hi];
      else [rect[0], rect[2]] = [lo, hi];
    }
    out.push({ rect, opening: o });
  }
  return out;
}

// ---------------------------------------------------------------- sufity i skosy

/** Pomieszczenie, do którego należy sufit nad otworem klatki schodowej (sąsiaduje z otworem). */
function roomNextToVoid(model, rect) {
  let best = null;
  let bestLen = 0;
  for (const rm of model.rooms) {
    let shared = 0;
    for (const e of rm.edges) {
      const onSide = e.axis === 'x' ? Math.abs(e.c - rect[1]) < EPS || Math.abs(e.c - rect[3]) < EPS : Math.abs(e.c - rect[0]) < EPS || Math.abs(e.c - rect[2]) < EPS;
      if (!onSide) continue;
      const [a0, a1] = e.axis === 'x' ? [rect[0], rect[2]] : [rect[1], rect[3]];
      shared += Math.max(0, Math.min(e.hi, a1) - Math.max(e.lo, a0));
    }
    if (shared > bestLen) [best, bestLen] = [rm, shared];
  }
  return best;
}

export function buildCeilingSurfaces(model) {
  const { level, floor } = model;
  const slopes = level.ceiling?.slopes || [];
  const flatH = level.ceiling?.flatHeight ?? level.ceilingHeight;
  const south = slopes.find((s) => s.side === '-y');
  const north = slopes.find((s) => s.side === '+y');
  const flatBand = slopes.length ? [-Infinity, south.flatFrom, Infinity, north.flatFrom] : null;
  const roofWindows = level.roofWindows ? roofWindowsOf(model.house, level) : [];
  const voidHere = level.stairVoid?.rect || null; // otwór klatki w PODŁODZE tej kondygnacji – sufit jest też nad nim
  const voidRoom = voidHere ? roomNextToVoid(model, voidHere) : null;
  const out = [];

  for (const rm of model.rooms) {
    const regions = [rm.polygon];
    if (voidRoom === rm) regions.push(rectToPolygon(voidHere));
    const chimneyRects = rm.chimneys.map((c) => c.rect);
    const holes = [...chimneyRects];
    if (model.voidAbove) holes.push(model.voidAbove); // otwór klatki w stropie nad pomieszczeniem
    const inRoom = (x, y) =>
      regions.some((p) => pointInPolygon(x, y, p)) && !holes.some((h) => pointInRect(x, y, h));

    // --- sufit płaski (z obniżeniem pod podciągami i nadprożami); w pomieszczeniu otwartym do kalenicy go nie ma
    const open = model.isOpenRoom(rm.id);
    const b = new MeshBuilder();
    const headerRects = rm.innerHeaders.map((h) => h.rect);
    for (const poly of open ? [] : regions) {
      const cells = gridCells(poly, {
        holes, clip: flatBand,
        xCuts: headerRects.flatMap((r) => [r[0], r[2]]),
        yCuts: headerRects.flatMap((r) => [r[1], r[3]]),
      });
      for (const [x0, y0, x1, y1] of cells) {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const header = rm.innerHeaders.find((h) => pointInRect(cx, cy, h.rect));
        const z = floor + (header ? header.underside : flatH);
        b.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, -1], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
        if (!header) continue;
        // boki podciągu od strony pomieszczenia
        const zt = floor + flatH;
        const sides = [
          { nx: 0, ny: -1, a: [x0, y0], b: [x1, y0] },
          { nx: 1, ny: 0, a: [x1, y0], b: [x1, y1] },
          { nx: 0, ny: 1, a: [x1, y1], b: [x0, y1] },
          { nx: -1, ny: 0, a: [x0, y1], b: [x0, y0] },
        ];
        for (const sd of sides) {
          const px = (sd.a[0] + sd.b[0]) / 2 + sd.nx * 1e-3;
          const py = (sd.a[1] + sd.b[1]) / 2 + sd.ny * 1e-3;
          if (!inRoom(px, py) || rm.innerHeaders.some((h) => pointInRect(px, py, h.rect))) continue;
          const len = Math.hypot(sd.b[0] - sd.a[0], sd.b[1] - sd.a[1]);
          b.quad([...sd.a, z], [...sd.b, z], [...sd.b, zt], [...sd.a, zt], [sd.nx, sd.ny, 0], [[0, z - floor], [len, z - floor], [len, zt - floor], [0, zt - floor]]);
        }
      }
    }
    if (!b.isEmpty) {
      const bb = polygonBBox(rm.polygon);
      out.push(surface(model, rm, 'ceiling', 'ceiling', 'ceiling', 'sufit', b, bb[2] - bb[0], bb[3] - bb[1]));
    }

    // --- skosy
    for (const sl of slopes) {
      const isSouth = sl.side === '-y';
      // skos kończy się na początku sufitu płaskiego, a w pomieszczeniu otwartym biegnie tą samą płaszczyzną do kalenicy
      const upTo = open ? model.ridgeY : sl.flatFrom;
      const band = isSouth ? [-Infinity, sl.kneeWallFace, Infinity, upTo] : [-Infinity, upTo, Infinity, sl.kneeWallFace];
      const r = sl.risePerMeter;
      const k = Math.sqrt(1 + r * r); // długość po skosie na metr rzutu
      const normal = isSouth ? [0, r, -1] : [0, -r, -1];
      const sb = new MeshBuilder();
      const windowHoles = roofWindows.filter((w) => w.slope === sl.id).map((w) => w.cladRect);
      let yMin = Infinity;
      let yMax = -Infinity;
      for (const poly of regions) {
        for (const [x0, y0, x1, y1] of gridCells(poly, { holes: [...holes, ...windowHoles], clip: band })) {
          const z0 = floor + model.ceilingAtRoom(rm.id, y0);
          const z1 = floor + model.ceilingAtRoom(rm.id, y1);
          const v0 = Math.abs(y0 - sl.kneeWallFace) * k;
          const v1 = Math.abs(y1 - sl.kneeWallFace) * k;
          sb.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1], normal, [[x0, v0], [x1, v0], [x1, v1], [x0, v1]]);
          yMin = Math.min(yMin, y0);
          yMax = Math.max(yMax, y1);
        }
      }
      if (sb.isEmpty) continue;
      const bb = polygonBBox(rm.polygon);
      const suffix = `slope-${isSouth ? 'S' : 'N'}`;
      out.push(surface(model, rm, 'slope', 'ceiling', suffix, isSouth ? 'skos od frontu' : 'skos od ogrodu', sb, bb[2] - bb[0], (yMax - yMin) * k));
    }
  }
  return out;
}

/** Klapy wyłazów stropowych – płaskie bryły tuż pod sufitem (nieedytowalne). */
export function emitCeilingHatches(model, builder) {
  const flatH = model.level.ceiling?.flatHeight ?? model.level.ceilingHeight;
  for (const h of model.level.ceilingHatches || []) {
    const [cx, cy] = rectCenter(h.rect);
    if (model.rooms.some((rm) => model.isOpenRoom(rm.id) && pointInPolygon(cx, cy, rm.polygon))) continue; // nie ma tam sufitu płaskiego
    const z = model.floor + flatH;
    builder.box(h.rect[0], h.rect[1], z - HATCH_DROP, h.rect[2], h.rect[3], z, ['top']);
  }
}


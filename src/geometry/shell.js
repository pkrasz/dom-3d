// Bryła zewnętrzna: lico ocieplenia z otworami, cokół, wnęka wejściowa z belką B2,
// szczyty i ścianki kolankowe do spodu połaci, lico otworu klatki w stropie,
// oraz "czapki" murów: przekrój w widoku z góry i wierzch murów w widoku domku dla lalek.
import { INS, buildingExtent, roofTopAt } from '../../tools/geometry.mjs';
import { EPS, gridCells, pointInPolygon, pointInRect, rectToPolygon, subtractIntervals, uniqueSorted } from './plan.js';
import { wallFrame, emitPanel, flatTop, profileTop } from './panels.js';
import { ceilingAt } from './levelModel.js';
import { PLINTH_TOP, SECTION_HEIGHT, SECTION_CAP_DROP } from './constants.js';

/** Wspólne wielkości bryły: obrys z ociepleniem, wnęka wejściowa, profil spodu dachu i sufitu poddasza. */
export function shellInfo(house) {
  const ins = INS(house);
  const [parter, upper] = house.levels;
  const m = buildingExtent(parter); // obrys muru
  const E = [m[0] - ins, m[1] - ins, m[2] + ins, m[3] + ins]; // obrys z ociepleniem

  // Wnęka wejściowa: belka "exteriorOnly" w licu frontu + cofnięta ściana o tej samej szerokości.
  // Uwaga: kod zakłada wnękę od frontu (strona -y), tak jak w projekcie.
  let recess = null;
  const beam = (parter.beams || []).find((b) => b.exteriorOnly);
  if (beam) {
    const back = parter.walls.find((w) => w.type === 'ext' && Math.abs(w.rect[0] - beam.rect[0]) < EPS && Math.abs(w.rect[2] - beam.rect[2]) < EPS && w.rect[1] > beam.rect[1]);
    if (back) {
      recess = {
        x0: beam.rect[0] + ins, x1: beam.rect[2] - ins,
        yFront: E[1], yBack: back.rect[1] - ins,
        beamBack: beam.rect[3], // tylne lico belki
        soffit: beam.finishedUnderside ?? beam.underside,
        beam,
      };
    }
  }

  const roof = house.roof;
  const underside = (y) => roofTopAt(roof, y) - roof.packageVertical; // spód pakietu dachu
  const atticCeiling = (y) => upper.floorLevel + ceilingAt(upper, y); // sufit/skos poddasza (rzędna)
  const wallTop = (y) => Math.min(underside(y), atticCeiling(y)); // do tej rzędnej sięga mur widoczny bez dachu

  // punkty załamania profili wzdłuż y
  const slopeBreaks = upper.ceiling.slopes.flatMap((s) => [s.kneeWallFace, s.flatFrom]);
  const base = uniqueSorted([E[1], E[3], roof.ridge.y, ...slopeBreaks]);
  const crossings = [];
  for (let i = 0; i < base.length - 1; i++) {
    const d0 = underside(base[i]) - atticCeiling(base[i]);
    const d1 = underside(base[i + 1]) - atticCeiling(base[i + 1]);
    if (d0 * d1 < -1e-12) crossings.push(base[i] + ((base[i + 1] - base[i]) * d0) / (d0 - d1));
  }
  const yBreaks = uniqueSorted([...base, ...crossings]);

  const outline = recess
    ? [[E[0], E[1]], [recess.x0, E[1]], [recess.x0, recess.yBack], [recess.x1, recess.yBack], [recess.x1, E[1]], [E[2], E[1]], [E[2], E[3]], [E[0], E[3]]]
    : rectToPolygon(E);

  return { ins, masonry: m, E, recess, underside, atticCeiling, wallTop, yBreaks, outlineParter: outline, outlineUpper: rectToPolygon(E), splitZ: parter.ceilingHeight };
}

const facesOf = (E) => [
  { name: 'S', axis: 'x', c: E[1], n: -1, lo: E[0], hi: E[2] },
  { name: 'E', axis: 'y', c: E[2], n: 1, lo: E[1], hi: E[3] },
  { name: 'N', axis: 'x', c: E[3], n: 1, lo: E[0], hi: E[2] },
  { name: 'W', axis: 'y', c: E[0], n: -1, lo: E[1], hi: E[3] },
];

/** Otwory kondygnacji leżące w danym licu elewacji (z rzędnymi bezwzględnymi). */
function facadeHoles(model, face) {
  const holes = [];
  for (const info of model.extOpenings.values()) {
    if (info.axis !== face.axis || info.out !== face.n || Math.abs(info.face - face.c) > 1e-6) continue;
    holes.push({ id: info.opening.id, s0: info.faceS0, s1: info.faceS1, z0: model.floor + info.z0, z1: model.floor + info.z1 });
  }
  return holes;
}

/**
 * Elewacje. batch(material, part, levelId) zwraca MeshBuilder wspólnej siatki.
 * Parter: od terenu do spodu stropu (cokół osobnym kolorem), poddasze: wyżej, do spodu połaci.
 */
export function emitFacades(house, models, info, batch) {
  const [parterModel, upperModel] = models;
  const { E, recess, splitZ } = info;
  const ground = house.levels[0].groundLevel;
  const plinth = batch('plinth', 'exterior', 'parter');
  const facade0 = batch('facade', 'exterior', 'parter');
  const facade1 = batch('facade', 'exterior', 'poddasze');
  const attic = batch('facade', 'roof', 'poddasze'); // trójkąty szczytów ponad sufitem poddasza – znikają razem z dachem

  const twoBands = (frame, s0, s1, pieces, holes) => {
    emitPanel(plinth, frame, { bottom: ground, pieces: flatTop(s0, s1, PLINTH_TOP), holes });
    emitPanel(facade0, frame, { bottom: PLINTH_TOP, pieces, holes });
  };

  for (const face of facesOf(E)) {
    const frame = wallFrame({ ...face, floor: 0 });

    // --- parter
    const holes0 = facadeHoles(parterModel, face);
    if (recess && face.name === 'S') holes0.push({ s0: recess.x0, s1: recess.x1, z0: ground - 1, z1: recess.soffit });
    twoBands(frame, face.lo, face.hi, flatTop(face.lo, face.hi, splitZ), holes0);

    // --- poddasze
    const holes1 = facadeHoles(upperModel, face);
    if (face.axis === 'x') {
      emitPanel(facade1, frame, { bottom: splitZ, pieces: flatTop(face.lo, face.hi, info.wallTop(face.c)), holes: holes1 });
    } else {
      emitPanel(facade1, frame, { bottom: splitZ, pieces: profileTop(face.lo, face.hi, info.yBreaks, info.wallTop), holes: holes1 });
      // szczyt nad sufitem poddasza, do spodu połaci
      const ys = info.yBreaks;
      for (let i = 0; i < ys.length - 1; i++) {
        const [ya, yb] = [ys[i], ys[i + 1]];
        const ym = (ya + yb) / 2;
        if (info.underside(ym) - info.atticCeiling(ym) < 1e-6) continue;
        attic.quad(frame.point(ya, info.wallTop(ya)), frame.point(yb, info.wallTop(yb)), frame.point(yb, info.underside(yb)), frame.point(ya, info.underside(ya)), frame.normal);
      }
    }
  }

  // --- wnęka wejściowa
  if (recess) {
    const top = splitZ;
    const sidePieces = [
      { s0: recess.yFront, s1: recess.beamBack, t0: recess.soffit, t1: recess.soffit },
      { s0: recess.beamBack, s1: recess.yBack, t0: top, t1: top },
    ];
    for (const [c, n] of [[recess.x0, 1], [recess.x1, -1]]) {
      const frame = wallFrame({ axis: 'y', c, n, lo: recess.yFront, hi: recess.yBack });
      twoBands(frame, recess.yFront, recess.yBack, sidePieces, []);
    }
    const back = { axis: 'x', c: recess.yBack, n: -1, lo: recess.x0, hi: recess.x1 };
    twoBands(wallFrame(back), back.lo, back.hi, flatTop(back.lo, back.hi, top), facadeHoles(parterModel, back));
    // belka B2: spód (pokazywany finishedUnderside), tylne lico i surowy sufit wnęki
    const { x0, x1, yFront, beamBack, yBack, soffit } = recess;
    facade0.quad([x0, yFront, soffit], [x1, yFront, soffit], [x1, beamBack, soffit], [x0, beamBack, soffit], [0, 0, -1]);
    facade0.quad([x0, beamBack, soffit], [x1, beamBack, soffit], [x1, beamBack, top], [x0, beamBack, top], [0, 1, 0]);
    facade0.quad([x0, beamBack, top], [x1, beamBack, top], [x1, yBack, top], [x0, yBack, top], [0, 0, -1]);
  }
}

/** Strop: lico otworu klatki schodowej (tam, gdzie wyżej nie stoi ściana) i wierzch płyty. */
export function emitSlab(house, models, batch) {
  const [model] = models;
  const { level } = model;
  const slab = level.slabAbove;
  if (!slab) return;
  const b = batch('slab', 'slab', level.id);
  const z0 = level.floorLevel + level.ceilingHeight;
  const z1 = slab.nextFloorLevel;
  const v = model.voidAbove;
  if (v) {
    const sides = [
      { axis: 'x', c: v[1], n: 1, lo: v[0], hi: v[2] },
      { axis: 'y', c: v[2], n: -1, lo: v[1], hi: v[3] },
      { axis: 'x', c: v[3], n: -1, lo: v[0], hi: v[2] },
      { axis: 'y', c: v[0], n: 1, lo: v[1], hi: v[3] },
    ];
    for (const side of sides) {
      // jeśli za krawędzią otworu na wyższej kondygnacji stoi ściana, lico należy do ściany klatki (nie do stropu)
      const probe = side.c - side.n * 1e-3;
      const covered = [];
      for (const s of model.upperSolids) {
        const [p0, p1] = side.axis === 'x' ? [s.rect[1], s.rect[3]] : [s.rect[0], s.rect[2]];
        const [a0, a1] = side.axis === 'x' ? [s.rect[0], s.rect[2]] : [s.rect[1], s.rect[3]];
        if (p0 < probe && probe < p1) covered.push([a0, a1]);
      }
      const frame = wallFrame({ ...side, floor: 0 });
      for (const [s0, s1] of subtractIntervals([[side.lo, side.hi]], covered)) {
        emitPanel(b, frame, { bottom: z0, pieces: flatTop(s0, s1, z1), holes: [] });
      }
    }
  }
  // wierzch płyty (pod warstwami posadzki – widoczny tylko tam, gdzie posadzki nie ma)
  const zt = z0 + slab.thickness;
  const holes = slab.openings.map((o) => o.rect);
  for (const [x0, y0, x1, y1] of gridCells(rectToPolygon(slab.outline), { holes })) {
    b.quad([x0, y0, zt], [x1, y0, zt], [x1, y1, zt], [x0, y1, zt], [0, 0, 1]);
  }
}

/** Komórki rzutu zajęte przez mury kondygnacji (obrys z ociepleniem minus pomieszczenia). */
function wallCells(model, outline, { exclude = [], yCuts = [] } = {}) {
  const { level } = model;
  const xs = [];
  const ys = [...yCuts];
  for (const rm of model.rooms) for (const [x, y] of rm.polygon) (xs.push(x), ys.push(y));
  for (const r of exclude) (xs.push(r[0], r[2]), ys.push(r[1], r[3]));
  const voidHere = level.stairVoid?.rect || null;
  if (voidHere) (xs.push(voidHere[0], voidHere[2]), ys.push(voidHere[1], voidHere[3]));
  const cells = gridCells(outline, {
    xCuts: xs, yCuts: ys,
    keep: (x, y) =>
      !model.rooms.some((rm) => pointInPolygon(x, y, rm.polygon)) &&
      !(voidHere && pointInRect(x, y, voidHere)) &&
      !exclude.some((r) => pointInRect(x, y, r)),
  });
  // kominy stojące w pomieszczeniach też są murem
  for (const ch of level.chimneys || []) {
    if (!ch.room) continue;
    cells.push(...gridCells(rectToPolygon(ch.rect), { yCuts }));
  }
  return cells;
}

/** Prostokąty otworów, przez które przechodzi płaszczyzna cięcia na wysokości h nad posadzką. */
function openingsCutAt(model, h) {
  const out = [];
  for (const o of model.level.openings) {
    if (!(o.sill < h && o.sill + o.height > h)) continue;
    const ext = model.extOpenings.get(o.id);
    if (ext) {
      const p0 = Math.min(ext.inner, ext.face);
      const p1 = Math.max(ext.inner, ext.face);
      out.push(ext.axis === 'x' ? [ext.faceS0, p0, ext.faceS1, p1] : [p0, ext.faceS0, p1, ext.faceS1]);
    } else {
      const wall = model.level.walls.find((w) => w.id === o.wall);
      const vertical = wall.rect[2] - wall.rect[0] < wall.rect[3] - wall.rect[1];
      out.push(vertical ? [wall.rect[0], o.at[0], wall.rect[2], o.at[1]] : [o.at[0], wall.rect[1], o.at[1], wall.rect[3]]);
    }
  }
  return out;
}

/**
 * Czapki murów:
 *  - 'sectionCap' – ciemny przekrój na wysokości cięcia widoku z góry (userData.cap = 'section'),
 *  - 'topCap'     – wierzch murów widoczny po ukryciu stropu / sufitów (userData.cap = 'top').
 */
export function emitCaps(house, models, info, batch) {
  models.forEach((model, i) => {
    const outline = i === 0 ? info.outlineParter : info.outlineUpper;
    const levelId = model.id;

    const section = batch('sectionCap', 'cap', levelId, { cap: 'section' });
    const zs = model.floor + SECTION_HEIGHT - SECTION_CAP_DROP;
    for (const [x0, y0, x1, y1] of wallCells(model, outline, { exclude: openingsCutAt(model, SECTION_HEIGHT) })) {
      section.quad([x0, y0, zs], [x1, y0, zs], [x1, y1, zs], [x0, y1, zs], [0, 0, 1]);
    }

    const top = batch('topCap', 'cap', levelId, { cap: 'top' });
    if (i === 0) {
      const z = model.floor + model.level.ceilingHeight;
      const cells = wallCells(model, outline);
      // nad wnęką wejściową: belka B2 i pas stropu za nią, aż do lica ocieplenia cofniętej ściany
      if (info.recess) cells.push([info.recess.x0, info.recess.yFront, info.recess.x1, info.recess.yBack]);
      for (const [x0, y0, x1, y1] of cells) top.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1]);
    } else {
      // poddasze: wierzch murów idzie po skosie (sufit albo spód połaci – co niżej)
      for (const [x0, y0, x1, y1] of wallCells(model, outline, { yCuts: info.yBreaks })) {
        const za = info.wallTop(y0);
        const zb = info.wallTop(y1);
        top.quadAway([x0, y0, za], [x1, y0, za], [x1, y1, zb], [x0, y1, zb], [(x0 + x1) / 2, (y0 + y1) / 2, model.floor]);
      }
    }
  });
}

// Analiza kondygnacji z house.json: które odcinki krawędzi pomieszczeń mają za sobą mur,
// gdzie są otwory, podciągi i nadproża przejść. Same dane – bez Three.js.
// Z tego modelu korzystają: budowa ścian, sufitów, kolizje i testy.
import { INS, isVertical, openingRect, ceilingHeightAt } from '../../tools/geometry.mjs';
import { EPS, signedArea, pointInPolygon, pointInRect, mergeIntervals, subtractIntervals, clipIntervals, uniqueSorted, rectCenter } from './plan.js';

const TOUCH = 1e-3; // 1 mm – punkt kontrolny "tuż za" / "tuż przed" krawędzią

/** Prostokąty muru na kondygnacji: ściany + bryły kominów nienależących do żadnego pomieszczenia. */
export function solidsOf(level) {
  const solids = level.walls.map((w) => ({ rect: w.rect, kind: 'wall', wall: w }));
  for (const ch of level.chimneys || []) {
    if (ch.room === null && ch.segments) {
      for (const seg of ch.segments) solids.push({ rect: seg.rect, kind: 'chimney', chimney: ch });
    }
  }
  return solids;
}

/** Kominy stojące w pomieszczeniu (osobna bryła i osobna powierzchnia). */
export const roomChimneys = (level, roomId) => (level.chimneys || []).filter((c) => c.room === roomId);

/** Podciągi i nadproża przejść widoczne we wnętrzu: prostokąt w rzucie + rzędna spodu nad posadzką. */
export function headersOf(level) {
  const out = [];
  for (const b of level.beams || []) {
    if (b.exteriorOnly || b.underside === undefined) continue;
    out.push({ id: b.id, rect: b.rect, underside: b.underside });
  }
  for (const o of level.openings || []) {
    if (o.kind !== 'passage') continue;
    out.push({ id: o.id, rect: openingRect(level, o), underside: o.sill + o.height, opening: o });
  }
  return out;
}

/** Otwór klatki schodowej w stropie NAD kondygnacją (albo null). */
export const voidAboveOf = (level) => level.slabAbove?.openings?.find((o) => o.kind === 'stairs')?.rect || null;

/** Wysokość pomieszczenia nad posadzką w punkcie y (poddasze: skosy; y przycięte do ścianek kolankowych). */
export function ceilingAt(level, y) {
  const slopes = level.ceiling?.slopes;
  if (!slopes) return level.ceilingHeight;
  const faces = slopes.map((s) => s.kneeWallFace);
  const yc = Math.min(Math.max(y, Math.min(...faces)), Math.max(...faces));
  return ceilingHeightAt(level, yc);
}

/** Współrzędne y, w których zmienia się nachylenie sufitu (ścianki kolankowe i początki sufitu płaskiego). */
export function ceilingBreaks(level) {
  const slopes = level.ceiling?.slopes || [];
  return uniqueSorted(slopes.flatMap((s) => [s.kneeWallFace, s.flatFrom]));
}

function edgeOf(polygon, i, ccw) {
  const a = polygon[i];
  const b = polygon[(i + 1) % polygon.length];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (Math.abs(dx) > EPS && Math.abs(dy) > EPS) throw new Error('Wielobok pomieszczenia musi mieć krawędzie równoległe do osi');
  const turn = ccw ? 1 : -1;
  if (Math.abs(dy) < EPS) {
    // krawędź pozioma: biegnie wzdłuż x, stała współrzędna y
    return { index: i, axis: 'x', c: a[1], lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]), n: Math.sign(dx) * turn };
  }
  return { index: i, axis: 'y', c: a[0], lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]), n: -Math.sign(dy) * turn };
}

/** Rozkład prostokąta na współrzędne wzdłuż i w poprzek krawędzi. */
const along = (edge, rect) => (edge.axis === 'x' ? [rect[0], rect[2]] : [rect[1], rect[3]]);
const across = (edge, rect) => (edge.axis === 'x' ? [rect[1], rect[3]] : [rect[0], rect[2]]);

/** Punkt (x, y) leżący na krawędzi w miejscu s, przesunięty o `offset` w stronę pomieszczenia. */
export const edgePoint = (edge, s, offset = 0) => (edge.axis === 'x' ? [s, edge.c + edge.n * offset] : [edge.c + edge.n * offset, s]);

function touchingIntervals(edge, rects, side) {
  // side = -1: prostokąt tuż ZA krawędzią (poza pomieszczeniem); +1: tuż przed nią (w pomieszczeniu)
  const probe = edge.c + edge.n * side * TOUCH;
  const out = [];
  for (const r of rects) {
    const [p0, p1] = across(edge, r);
    if (!(p0 < probe && probe < p1)) continue;
    const [a0, a1] = along(edge, r);
    const s0 = Math.max(a0, edge.lo);
    const s1 = Math.min(a1, edge.hi);
    if (s1 - s0 > EPS) out.push([s0, s1]);
  }
  return out;
}

/**
 * Model kondygnacji.
 * rooms[].edges[] – dla każdej krawędzi wieloboku:
 *   axis 'x' | 'y' (wzdłuż której osi biegnie), c (stała współrzędna), lo..hi (zakres), n (±1: po której stronie jest pomieszczenie),
 *   solid  – odcinki z murem (tam powstaje powierzchnia ściany),
 *   open   – odcinki bez muru,
 *   holes  – otwory {id, s0, s1, z0, z1, opening} (z nad posadzką),
 *   strips – pasy podciągu/nadproża nad odcinkami otwartymi {s0, s1, z0, header},
 *   topPieces(s0, s1) – górna krawędź ściany jako odcinki liniowe {s0, s1, t0, t1} (wysokość nad posadzką).
 */
export function buildLevelModel(house, levelIndex) {
  const level = house.levels[levelIndex];
  const upper = house.levels[levelIndex + 1] || null;
  const solids = solidsOf(level);
  const upperSolids = upper ? solidsOf(upper) : [];
  const headers = headersOf(level);
  const voidAbove = voidAboveOf(level);
  const breaks = ceilingBreaks(level);
  const floor = level.floorLevel;

  // Wysokość ściany w miejscu s krawędzi: sufit kondygnacji, a w klatce schodowej – aż do sufitu wyższej kondygnacji.
  const topAt = (edge, s, sProbe) => {
    const [xi, yi] = edgePoint(edge, sProbe, TOUCH);
    const [xo, yo] = edgePoint(edge, sProbe, -TOUCH);
    if (upper && voidAbove && pointInRect(xi, yi, voidAbove) && upperSolids.some((u) => pointInRect(xo, yo, u.rect))) {
      const y = edge.axis === 'x' ? edge.c : s;
      return upper.floorLevel - floor + ceilingAt(upper, y);
    }
    return ceilingAt(level, edge.axis === 'x' ? edge.c : s);
  };

  const topPieces = (edge, s0, s1) => {
    const cuts = [s0, s1];
    if (edge.axis === 'y') cuts.push(...breaks.filter((b) => b > s0 + EPS && b < s1 - EPS));
    if (voidAbove) cuts.push(...along(edge, voidAbove).filter((b) => b > s0 + EPS && b < s1 - EPS));
    const ss = uniqueSorted(cuts);
    const pieces = [];
    for (let i = 0; i < ss.length - 1; i++) {
      const mid = (ss[i] + ss[i + 1]) / 2;
      pieces.push({ s0: ss[i], s1: ss[i + 1], t0: topAt(edge, ss[i], mid), t1: topAt(edge, ss[i + 1], mid) });
    }
    return pieces;
  };

  const rooms = level.rooms.map((room) => {
    const ccw = signedArea(room.polygon) > 0;
    const chimneys = roomChimneys(level, room.id);
    const edges = room.polygon.map((_, i) => {
      const edge = edgeOf(room.polygon, i, ccw);
      const behind = mergeIntervals(touchingIntervals(edge, solids.map((s) => s.rect), -1));
      const coveredByChimney = touchingIntervals(edge, chimneys.map((c) => c.rect), +1);
      edge.solid = subtractIntervals(behind, coveredByChimney);
      edge.open = subtractIntervals([[edge.lo, edge.hi]], behind);

      // otwory w ścianach równoległych do krawędzi
      edge.holes = [];
      const probe = edge.c - edge.n * TOUCH;
      for (const s of solids) {
        if (s.kind !== 'wall') continue;
        const wallAxis = isVertical(s.rect) ? 'y' : 'x';
        const [p0, p1] = across(edge, s.rect);
        if (wallAxis !== edge.axis || !(p0 < probe && probe < p1)) continue;
        for (const o of level.openings.filter((o) => o.wall === s.wall.id)) {
          for (const [h0, h1] of clipIntervals(edge.solid, Math.max(o.at[0], edge.lo), Math.min(o.at[1], edge.hi))) {
            edge.holes.push({ id: o.id, opening: o, s0: h0, s1: h1, z0: o.sill, z1: o.sill + o.height });
          }
        }
      }

      // podciąg / nadproże nad odcinkiem otwartym, leżące tuż za krawędzią
      edge.strips = [];
      for (const h of headers) {
        for (const [a, b] of touchingIntervals(edge, [h.rect], -1)) {
          for (const [s0, s1] of clipIntervals(edge.open, a, b)) edge.strips.push({ s0, s1, z0: h.underside, header: h });
        }
      }
      edge.topPieces = (s0, s1) => topPieces(edge, s0, s1);
      return edge;
    });

    // podciągi i nadproża leżące WEWNĄTRZ wieloboku pomieszczenia (obniżają sufit)
    const innerHeaders = headers.filter((h) => {
      const [cx, cy] = rectCenter(h.rect);
      return pointInPolygon(cx, cy, room.polygon) || rectPartInside(h.rect, room.polygon);
    });

    return { room, id: room.id, polygon: room.polygon, ccw, chimneys, edges, innerHeaders };
  });

  // otwory w ścianach zewnętrznych (z informacją, która strona jest na zewnątrz) + okna narożne
  const extOpenings = new Map();
  for (const o of level.openings) {
    const info = exteriorOpeningInfo(house, level, o);
    if (!info) continue;
    const cw = (level.cornerWindows || []).find((c) => c.openings.includes(o.id)) || null;
    info.cornerWindow = cw;
    info.faceS0 = info.a0;
    info.faceS1 = info.a1;
    info.cornerAt = null; // 'lo' | 'hi': który koniec otworu leży w narożniku budynku
    if (cw) {
      const ins = INS(house);
      const [c0, c1] = info.axis === 'x' ? [cw.cutout[0], cw.cutout[2]] : [cw.cutout[1], cw.cutout[3]];
      info.cutout = [c0, c1];
      if (info.a0 >= c0 - EPS && info.a0 <= c1 + EPS) {
        info.faceS0 = c0 - ins;
        info.cornerAt = 'lo';
      }
      if (info.a1 >= c0 - EPS && info.a1 <= c1 + EPS) {
        info.faceS1 = c1 + ins;
        info.cornerAt = 'hi';
      }
    }
    extOpenings.set(o.id, info);
  }

  return { house, level, index: levelIndex, id: level.id, floor, upper, solids, upperSolids, headers, voidAbove, breaks, rooms, extOpenings, ceilingAt: (y) => ceilingAt(level, y) };
}

// Czy jakaś część prostokąta leży w wieloboku (sprawdzane w narożnych ćwiartkach – wystarcza dla podciągu B1,
// który biegnie przez dwa pomieszczenia i ścianę między nimi).
function rectPartInside(rect, polygon) {
  const [x0, y0, x1, y1] = rect;
  for (const fx of [0.02, 0.5, 0.98]) {
    for (const fy of [0.02, 0.5, 0.98]) {
      if (pointInPolygon(x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy, polygon)) return true;
    }
  }
  return false;
}

/** Która strona ściany zewnętrznej jest na zewnątrz – opis otworu w ścianie zewnętrznej. */
export function exteriorOpeningInfo(house, level, o) {
  const wall = level.walls.find((w) => w.id === o.wall);
  if (!wall || wall.type !== 'ext') return null;
  const ins = INS(house);
  const axis = isVertical(wall.rect) ? 'y' : 'x';
  const [p0, p1] = axis === 'x' ? [wall.rect[1], wall.rect[3]] : [wall.rect[0], wall.rect[2]];
  const mid = (o.at[0] + o.at[1]) / 2;
  const pt = (c) => (axis === 'x' ? [mid, c] : [c, mid]);
  const inRoom = (c) => level.rooms.some((r) => pointInPolygon(...pt(c), r.polygon));
  // strona, po której tuż za ścianą jest pomieszczenie, to wnętrze
  let out;
  if (inRoom(p1 + TOUCH)) out = -1;
  else if (inRoom(p0 - TOUCH)) out = 1;
  else throw new Error(`Otwór ${o.id}: nie da się ustalić, która strona ściany ${wall.id} jest wnętrzem`);
  const m = out < 0 ? p0 : p1; // zewnętrzne lico muru
  const inner = out < 0 ? p1 : p0; // wewnętrzne lico muru
  return { opening: o, wall, axis, out, m, inner, face: m + out * ins, a0: o.at[0], a1: o.at[1], z0: o.sill, z1: o.sill + o.height };
}

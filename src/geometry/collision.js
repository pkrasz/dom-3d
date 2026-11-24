// Kolizje 2D i "podłoże" dla trybu spaceru oraz dla funkcji (meble): same dane, bez Three.js.
// Układ domu, metry.
import { isVertical } from '../../tools/geometry.mjs';
import { pointInPolygon, pointInRect, subtractIntervals, distanceToPolygonEdge, distanceToRect, polygonBBox } from './plan.js';
import { stairModel, balustradeSegments } from './stairs.js';
import { ceilingAtPoint } from './levelModel.js';
import { DOOR_FRAME, WALK_MAX_STEP, WALK_MIN_HEADROOM, BALUSTRADE_RAIL } from './constants.js';

/**
 * @param {Object} house    zawartość house.json
 * @param {Object} [design] opcje bryły z design.json – wpływają tylko na ceilingAt (sufit otwarty do kalenicy);
 *                          rzut blokad (ściany, balustrady / lamele) jest taki sam jak w projekcie.
 */
export function buildCollision(house, design = {}) {
  const levels = house.levels;
  const stairs = stairModel(house);
  const balustrades = balustradeSegments(house);
  const cache = new Map();

  /** Prostokąty blokujące ruch na kondygnacji: mury (bez świateł drzwi i przejść), kominy, balustrady. */
  function walls(levelId) {
    if (cache.has(levelId)) return cache.get(levelId);
    const level = levels.find((l) => l.id === levelId);
    const out = [];
    if (!level) return out;
    for (const w of level.walls) {
      const vertical = isVertical(w.rect);
      const [lo, hi] = vertical ? [w.rect[1], w.rect[3]] : [w.rect[0], w.rect[2]];
      // przejść można tylko przez drzwi wewnętrzne (światło ościeżnicy) i przejścia bez drzwi;
      // okna, drzwi balkonowe, drzwi wejściowe i brama są zamknięte
      const gaps = level.openings
        .filter((o) => o.wall === w.id && (o.kind === 'door' || o.kind === 'passage'))
        .map((o) => (o.kind === 'door' ? [o.at[0] + DOOR_FRAME, o.at[1] - DOOR_FRAME] : [o.at[0], o.at[1]]));
      for (const [a, b] of subtractIntervals([[lo, hi]], gaps)) {
        out.push({ rect: vertical ? [w.rect[0], a, w.rect[2], b] : [a, w.rect[1], b, w.rect[3]], kind: 'wall', id: w.id });
      }
    }
    for (const ch of level.chimneys || []) {
      if (ch.embeddedInWall) continue;
      for (const r of ch.segments ? ch.segments.map((s) => s.rect) : [ch.rect]) out.push({ rect: r, kind: 'chimney', id: ch.id });
    }
    const t = BALUSTRADE_RAIL / 2;
    for (const b of balustrades.filter((s) => s.levelId === levelId)) {
      out.push({
        rect: [Math.min(b.from[0], b.to[0]) - t, Math.min(b.from[1], b.to[1]) - t, Math.max(b.from[0], b.to[0]) + t, Math.max(b.from[1], b.to[1]) + t],
        kind: 'balustrade', id: b.label,
      });
    }
    cache.set(levelId, out);
    return out;
  }

  const levelById = (levelId) => levels.find((l) => l.id === levelId);

  function pointInRoom(levelId, x, y) {
    const level = levelById(levelId);
    if (!level) return null;
    const room = level.rooms.find((r) => pointInPolygon(x, y, r.polygon));
    return room ? room.id : null;
  }

  /**
   * Wysokość pomieszczenia nad posadzką kondygnacji w punkcie (x, y): sufit płaski, skos, a w pomieszczeniu
   * z sufitem otwartym do kalenicy (design.json) – okładzina skosu. null dla nieznanej kondygnacji.
   */
  function ceilingAt(levelId, x, y) {
    const level = levelById(levelId);
    return level ? ceilingAtPoint(level, design, x, y) : null;
  }

  function roomPolygon(levelId, roomId) {
    return levelById(levelId)?.rooms.find((r) => r.id === roomId)?.polygon || null;
  }

  /** Kondygnacja, której ściany obowiązują postać stojącą na rzędnej z (na schodach: do połowy – parter). */
  function levelIdAtHeight(z) {
    let id = levels[0].id;
    for (let i = 1; i < levels.length; i++) {
      const half = (levels[i - 1].floorLevel + levels[i].floorLevel) / 2 + 0.1;
      if (z >= half) id = levels[i].id;
    }
    return id;
  }

  /**
   * Rzędna, na której można stanąć w punkcie (x, y), startując z rzędnej feetZ:
   * posadzka kondygnacji albo stopień schodów – najbliższa, jeśli różnica nie przekracza jednego stopnia.
   * Zwraca null, gdy stanąć się nie da (np. otwór klatki, za niska przestrzeń pod schodami).
   */
  function groundAt(x, y, feetZ, maxStep = WALK_MAX_STEP) {
    const candidates = [];
    const tread = stairs ? stairs.heightAt(x, y) : null;
    if (tread !== null) candidates.push(tread);
    for (const level of levels) {
      const voidRect = level.stairVoid?.rect;
      if (voidRect && pointInRect(x, y, voidRect)) continue;
      // pod schodami wolno stać tylko tam, gdzie jest dość wysoko
      const soffit = stairs && level.id === levels[0].id ? stairs.soffitAt(x, y) : null;
      if (soffit !== null && soffit - level.floorLevel < WALK_MIN_HEADROOM) continue;
      candidates.push(level.floorLevel);
    }
    let best = null;
    for (const c of candidates) {
      if (Math.abs(c - feetZ) > maxStep) continue;
      if (best === null || Math.abs(c - feetZ) < Math.abs(best - feetZ)) best = c;
    }
    return best;
  }

  /**
   * Dobre miejsce do stanięcia w pomieszczeniu: punkt wieloboku najdalej od ścian, kominów i brzegów,
   * w którym da się stanąć (posadzka, a gdy jej nie ma – stopień schodów).
   */
  function roomSpot(levelId, roomId) {
    const level = levelById(levelId);
    const polygon = roomPolygon(levelId, roomId);
    if (!level || !polygon) return null;
    const blockers = walls(levelId);
    const [x0, y0, x1, y1] = polygonBBox(polygon);
    let best = null;
    const consider = (x, y, z, penalty) => {
      let d = distanceToPolygonEdge(x, y, polygon);
      for (const b of blockers) d = Math.min(d, distanceToRect(x, y, b.rect));
      d -= penalty;
      if (!best || d > best.score) best = { x, y, z, score: d };
    };
    const step = 0.1;
    for (let x = x0 + step / 2; x < x1; x += step) {
      for (let y = y0 + step / 2; y < y1; y += step) {
        if (!pointInPolygon(x, y, polygon)) continue;
        const floor = groundAt(x, y, level.floorLevel, 0.01);
        if (floor !== null) consider(x, y, floor, 0);
        else if (stairs && stairs.heightAt(x, y) !== null) consider(x, y, stairs.heightAt(x, y), 100); // tylko gdy nie ma posadzki
      }
    }
    return best ? { x: best.x, y: best.y, z: best.z } : null;
  }

  /**
   * Miejsce przy schodach na danej kondygnacji – tam przenosi przycisk zmiany kondygnacji w trybie spaceru.
   * headingDeg: kierunek patrzenia na schody (0 = +x, 90 = +y).
   */
  function stairsSpot(levelId) {
    const level = levelById(levelId);
    if (!stairs || !level) return null;
    const st = levels[0].stairs;
    if (levelId === levels[0].id) {
      // przed pierwszym stopniem biegu dolnego
      const p = st.parts[0];
      const dir = p.direction === '+x' ? 1 : -1;
      return { x: p.startAt - dir * 0.2, y: (p.rect[1] + p.rect[3]) / 2, z: level.floorLevel, headingDeg: dir > 0 ? 0 : 180 };
    }
    const edge = level.stairVoid?.arrival?.edge;
    if (!edge) return null;
    const last = st.parts[st.parts.length - 1];
    const dir = last.direction === '+x' ? 1 : -1;
    return { x: edge[0][0] + dir * 0.45, y: (edge[0][1] + edge[1][1]) / 2, z: level.floorLevel, headingDeg: dir > 0 ? 180 : 0 };
  }

  return { walls, pointInRoom, roomPolygon, ceilingAt, levelIdAtHeight, groundAt, roomSpot, stairsSpot, stairs, balustrades };
}

/**
 * Przesuwa koło (postać o promieniu r) z punktu (x, y) o wektor (dx, dy), wypychając je z prostokątów.
 * Zwraca nowe położenie. Ruch dzielony jest na kroki ≤ 5 cm, żeby nie przeskoczyć cienkiej ścianki.
 */
export function moveCircle(x, y, dx, dy, r, rects) {
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 0.05));
  for (let i = 0; i < steps; i++) {
    x += dx / steps;
    y += dy / steps;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const { rect } of rects) {
        const nx = Math.max(rect[0], Math.min(x, rect[2]));
        const ny = Math.max(rect[1], Math.min(y, rect[3]));
        let ox = x - nx;
        let oy = y - ny;
        const d = Math.hypot(ox, oy);
        if (d >= r) continue;
        if (d < 1e-9) {
          // środek wewnątrz prostokąta: wypchnij najkrótszą drogą
          const l = x - rect[0];
          const rt = rect[2] - x;
          const b = y - rect[1];
          const t = rect[3] - y;
          const m = Math.min(l, rt, b, t);
          if (m === l) x = rect[0] - r;
          else if (m === rt) x = rect[2] + r;
          else if (m === b) y = rect[1] - r;
          else y = rect[3] + r;
        } else {
          ox /= d;
          oy /= d;
          x = nx + ox * r;
          y = ny + oy * r;
        }
        moved = true;
      }
      if (!moved) break;
    }
  }
  return { x, y };
}

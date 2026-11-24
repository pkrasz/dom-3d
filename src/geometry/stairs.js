// Schody S1 wg levels[0].stairs: biegi proste, stopnie zabiegowe, płyta pod spodem (uproszczona), balustrady.
// stairModel() daje też funkcje wysokości stopnia i spodu płyty – używa ich tryb spaceru.
import { pointInPolygon, pointInRect, EPS } from './plan.js';
import { BALUSTRADE_POST, BALUSTRADE_RAIL, BALUSTRADE_POST_SPACING, BALUSTRADE_SIDE_OFFSET } from './constants.js';

/**
 * Lista stopni: { k (numer 1..n), top (rzędna stopnicy), poly (rzut), kind, x0/x1/dir dla biegu prostego }.
 * Wysokość stopnia = rise / risers (meta.buildRules).
 */
export function stairModel(house) {
  const level = house.levels[0];
  const st = level.stairs;
  if (!st) return null;
  const base = level.floorLevel;
  const h = st.rise / st.risers;
  // grubość płyty mierzona w pionie pod linią stopni (płyta 12 cm prostopadle do biegu)
  const waistV = st.structure.waistThickness * Math.hypot(1, h / st.tread);
  const steps = [];
  let k = 0;

  st.parts.forEach((part, partIndex) => {
    const [x0, y0, x1, y1] = part.rect;
    if (part.kind === 'flight') {
      const dir = part.direction === '+x' ? 1 : -1; // biegi w projekcie idą wzdłuż x
      const start = part.startAt ?? part.endAt - dir * part.treads * st.tread;
      for (let i = 0; i < part.treads; i++) {
        k += 1;
        const a = start + dir * i * st.tread; // krawędź dolna stopnia (od strony wejścia)
        const b = start + dir * (i + 1) * st.tread;
        steps.push({
          k, partIndex, kind: 'flight', dir, a, b, y0, y1,
          top: base + k * h,
          soffitA: Math.max(base, base + (k - 1) * h - waistV),
          soffitB: Math.max(base, base + k * h - waistV),
          poly: [[Math.min(a, b), y0], [Math.max(a, b), y0], [Math.max(a, b), y1], [Math.min(a, b), y1]],
        });
      }
    } else if (part.kind === 'winder') {
      // obwód prostokąta zabiegu od końca biegu dolnego do początku biegu górnego, z pominięciem boku z duszą (pivot)
      const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const same = (p, q) => Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;
      const prev = st.parts[partIndex - 1];
      const next = st.parts[partIndex + 1];
      const shared = (other) => corners.filter((c) => pointInRect(c[0], c[1], other.rect, 1e-6) && !same(c, part.pivot));
      const entry = shared(prev)[0];
      const exit = shared(next)[0];
      const iEntry = corners.findIndex((c) => same(c, entry));
      const walk = (stepDir) => {
        const path = [];
        for (let i = 0; i < 5; i++) {
          const c = corners[(iEntry + stepDir * i + 8) % 4];
          path.push(c);
          if (same(c, exit)) return path;
        }
        return null;
      };
      const onSegment = (p, a, b) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) < 1e-9 &&
        p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
      const hitsPivot = (path) => path.some((p, i) => i > 0 && onSegment(part.pivot, path[i - 1], p));
      let path = walk(1);
      if (!path || hitsPivot(path)) path = walk(-1);
      // podział obwodu w punktach splitTo → wachlarz stopni z wierzchołkiem w pivot
      let current = [part.pivot, path[0]];
      const polys = [];
      for (let i = 1; i < path.length; i++) {
        current.push(path[i]);
        if (part.splitTo.some((s) => same(s, path[i])) && i < path.length - 1) {
          polys.push(current);
          current = [part.pivot, path[i]];
        }
      }
      polys.push(current);
      for (const poly of polys) {
        k += 1;
        steps.push({ k, partIndex, kind: 'winder', top: base + k * h, soffitA: base + (k - 1) * h - waistV, soffitB: base + (k - 1) * h - waistV, poly });
      }
    }
  });

  const find = (x, y) => steps.find((s) => pointInPolygon(x, y, s.poly));
  return {
    id: st.id, riser: h, tread: st.tread, steps, zone: st.zone, top: base + st.rise,
    /** Rzędna stopnicy w punkcie albo null poza schodami. */
    heightAt(x, y) {
      const s = find(x, y);
      return s ? s.top : null;
    },
    /** Rzędna spodu płyty schodów w punkcie albo null poza schodami. */
    soffitAt(x, y) {
      const s = find(x, y);
      if (!s) return null;
      if (s.kind !== 'flight') return s.soffitA;
      const f = (x - s.a) / (s.b - s.a);
      return s.soffitA + (s.soffitB - s.soffitA) * f;
    },
  };
}

export function emitStairs(house, batch) {
  const model = stairModel(house);
  if (!model) return;
  const levelId = house.levels[0].id;
  for (const s of model.steps) {
    // co drugi stopień o ton ciemniejszy – w widoku z góry widać podział na stopnie
    const b = batch(s.k % 2 ? 'stairs' : 'stairsAlt', 'stairs', levelId);
    if (s.kind === 'flight') {
      // bryła stopnia: płaska stopnica, spód po skosie płyty
      b.hexa([
        [s.a, s.y0, s.soffitA], [s.b, s.y0, s.soffitB], [s.b, s.y1, s.soffitB], [s.a, s.y1, s.soffitA],
        [s.a, s.y0, s.top], [s.b, s.y0, s.top], [s.b, s.y1, s.top], [s.a, s.y1, s.top],
      ]);
    } else {
      b.prism(s.poly, s.soffitA, s.top);
    }
  }
}

/** Jedna balustrada: słupki, pochwyt i poprzeczka. */
function emitBalustrade(b, from, to, zFrom, zTo, height) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const n = Math.max(1, Math.ceil(len / BALUSTRADE_POST_SPACING));
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const x = from[0] + (to[0] - from[0]) * f;
    const y = from[1] + (to[1] - from[1]) * f;
    const z = zFrom + (zTo - zFrom) * f;
    b.box(x - BALUSTRADE_POST / 2, y - BALUSTRADE_POST / 2, z, x + BALUSTRADE_POST / 2, y + BALUSTRADE_POST / 2, z + height);
  }
  b.bar([...from, zFrom + height], [...to, zTo + height], BALUSTRADE_RAIL, BALUSTRADE_RAIL);
  b.bar([...from, zFrom + height / 2], [...to, zTo + height / 2], BALUSTRADE_POST, BALUSTRADE_POST);
}

/**
 * Wszystkie balustrady schodów i otworu klatki jako odcinki w rzucie (po odsunięciu od osi duszy).
 * Zwraca [{ levelId, from, to, zFrom, zTo, height }] – używane też przez kolizje.
 */
export function balustradeSegments(house) {
  const [parter, upper] = house.levels;
  const st = parter.stairs;
  if (!st) return [];
  const out = [];
  const add = (levelId, bal, height) => {
    let from = [...bal.from];
    let to = [...bal.to];
    const follows = /parts\[(\d+)\]/.exec(bal.follows || '');
    if (follows) {
      // balustrada biegu: odsunięta w stronę biegu, wzdłuż którego idzie
      const r = st.parts[Number(follows[1])].rect;
      const cy = (r[1] + r[3]) / 2;
      const cx = (r[0] + r[2]) / 2;
      const horizontal = Math.abs(from[1] - to[1]) < EPS;
      const off = BALUSTRADE_SIDE_OFFSET;
      if (horizontal) from[1] = to[1] = from[1] + Math.sign(cy - from[1]) * off;
      else from[0] = to[0] = from[0] + Math.sign(cx - from[0]) * off;
    }
    const zFrom = bal.type === 'raked' ? bal.baseFrom : bal.base;
    const zTo = bal.type === 'raked' ? bal.baseTo : bal.base;
    out.push({ levelId, from, to, zFrom, zTo, height, type: bal.type, label: bal.label });
  };
  for (const bal of st.balustrades || []) add(parter.id, bal, st.balustradeHeight);
  for (const bal of upper?.stairVoid?.balustrades || []) add(upper.id, bal, upper.stairVoid.balustradeHeight);
  return out;
}

export function emitBalustrades(house, batch) {
  for (const seg of balustradeSegments(house)) {
    emitBalustrade(batch('balustrade', 'stairs', seg.levelId), seg.from, seg.to, seg.zFrom, seg.zTo, seg.height);
  }
}

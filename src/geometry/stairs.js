// Schody S1 wg levels[0].stairs: biegi proste, stopnie zabiegowe, płyta pod spodem (uproszczona), balustrady.
// stairModel() daje też funkcje wysokości stopnia i spodu płyty – używa ich tryb spaceru.
// Opcje bryły (design.json): stopnice drewniane z jasnymi podstopnicami oraz lamele zamiast balustrad
// (tylko bieg dolny albo – slats.continuous – ciągłe przez obie kondygnacje, także wokół otworu klatki).
import { pointInPolygon, pointInRect, distanceToRect, EPS } from './plan.js';
import { ceilingAtPoint } from './levelModel.js';
import { BALUSTRADE_POST, BALUSTRADE_RAIL, BALUSTRADE_POST_SPACING, BALUSTRADE_SIDE_OFFSET } from './constants.js';
import { slatOptions, treadOptions } from './design.js';

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

export function emitStairs(house, batch, design = {}) {
  const model = stairModel(house);
  if (!model) return;
  const levelId = house.levels[0].id;
  const wood = treadOptions(design);
  if (wood) {
    // Opcja bryły: stopnica = deska (ciepłe drewno) na jasnej bryle stopnia; podstopnica i boki w kolorze jasnym.
    const body = batch('stairRiser', 'stairs', levelId);
    for (const s of model.steps) {
      // co druga stopnica o ton ciemniejsza – w widoku z góry widać podział na stopnie
      const board = batch(s.k % 2 ? 'stairTread' : 'stairTreadAlt', 'stairs', levelId);
      const zb = s.top - wood.thickness;
      if (s.kind === 'flight') {
        body.hexa(
          [
            [s.a, s.y0, s.soffitA], [s.b, s.y0, s.soffitB], [s.b, s.y1, s.soffitB], [s.a, s.y1, s.soffitA],
            [s.a, s.y0, zb], [s.b, s.y0, zb], [s.b, s.y1, zb], [s.a, s.y1, zb],
          ],
          ['top']
        );
        const nose = s.a - s.dir * wood.nosing; // nosek wysunięty przed podstopnicę
        board.box(Math.min(nose, s.b), s.y0, zb, Math.max(nose, s.b), s.y1, s.top);
      } else {
        body.prism(s.poly, s.soffitA, zb, ['top']);
        board.prism(s.poly, zb, s.top);
      }
    }
    return;
  }
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
    out.push({ levelId, from, to, zFrom, zTo, height, type: bal.type, label: bal.label, partIndex: follows ? Number(follows[1]) : null });
  };
  for (const bal of st.balustrades || []) add(parter.id, bal, st.balustradeHeight);
  for (const bal of upper?.stairVoid?.balustrades || []) add(upper.id, bal, upper.stairVoid.balustradeHeight);
  return out;
}

/**
 * Czy ten odcinek balustrady zastępują lamele (opcja bryły): bieg na najniższej kondygnacji,
 * a przy lamelach ciągłych (slats.continuous) także wszystkie balustrady otworu klatki na wyższej kondygnacji.
 */
const replacedBySlats = (house, seg, design) => {
  const opt = slatOptions(design);
  if (!opt) return false;
  if (seg.levelId === house.levels[0].id) return seg.type === 'raked' && seg.partIndex !== null;
  return opt.continuous;
};

/**
 * Położenia środków lameli na odcinku o długości `length`: profil `p`, odstęp w świetle najwyżej `gap`.
 * Koniec „ze słupkiem” (post) zaczyna się lamelą, koniec przy ścianie – odstępem.
 */
export function distributeSlats(length, p, gap, postStart, postEnd) {
  for (let n = 1; n < 1000; n++) {
    const gaps = n - 1 + (postStart ? 0 : 1) + (postEnd ? 0 : 1);
    const g = gaps ? (length - n * p) / gaps : 0;
    if (gaps && g > gap + 1e-9) continue;
    if (!gaps && n * p < length - 1e-9) continue;
    const first = (postStart ? 0 : g) + p / 2;
    return Array.from({ length: n }, (_, i) => first + i * (p + g));
  }
  return [];
}

/**
 * Lamele zamiast balustrad (design.stairs.groundFloorBalustrade = 'slats'): pionowe profile w linii dawnej balustrady.
 *
 * Tylko bieg dolny (domyślnie): od stopnic do spodu stropu; nad częścią biegu pod otworem klatki lamele spina
 * poziomy profil na wysokości spodu stropu.
 *
 * Ciągłe przez obie kondygnacje (slats.continuous = true):
 *   linia 'flight' – w duszy między biegami: od stopnic biegu dolnego do SUFITU wyższej kondygnacji (pod otworem klatki),
 *                    a pod stropem jak wyżej – do spodu stropu; ta sama linia osłania bieg górny od strony otworu;
 *   linie 'void'   – na krawędziach otworu klatki (dawne balustrady poziome): od posadzki wyższej kondygnacji do jej sufitu.
 *                    Koniec przy ścianie zaczyna się odstępem, koniec wolny – lamelą narożną.
 *   Wyjście z biegu górnego (stairVoid.arrival) i wejście na bieg dolny zostają wolne; profilu poziomego nie ma.
 *
 * Zwraca { slats: [{ x, y, z0, z1, underSlab, line }], rails: [{ from, to, z }], profile } – same dane (testy, podgląd).
 */
export function slatLayout(house, design = {}) {
  const opt = slatOptions(design);
  const out = { slats: [], rails: [], profile: opt?.profile ?? 0 };
  const model = opt ? stairModel(house) : null;
  if (!model) return out;
  const [level, upper] = house.levels;
  const top = level.floorLevel + level.ceilingHeight; // spód stropu
  const voidRect = level.slabAbove?.openings?.find((o) => o.kind === 'stairs')?.rect || null;
  const continuous = opt.continuous && !!upper;
  const upperTop = (x, y) => upper.floorLevel + ceilingAtPoint(upper, design, x, y); // sufit wyższej kondygnacji
  const p = opt.profile;
  const segments = balustradeSegments(house);
  for (const seg of segments) {
    if (seg.levelId !== level.id || !replacedBySlats(house, seg, design)) continue;
    const y = seg.from[1]; // biegi w projekcie idą wzdłuż x (jak w stairModel)
    const open = []; // położenia lameli pod otworem klatki
    for (const s of model.steps.filter((st) => st.partIndex === seg.partIndex && st.kind === 'flight')) {
      const n = Math.max(1, Math.round(Math.abs(s.b - s.a) / (p + opt.gap)));
      for (let i = 0; i < n; i++) {
        const x = s.a + ((s.b - s.a) * (i + 0.5)) / n;
        const underSlab = !(voidRect && pointInRect(x, y, voidRect));
        if (!underSlab) open.push(x);
        const z1 = underSlab ? top : continuous ? upperTop(x, y) : top - p;
        out.slats.push({ x, y, z0: s.top, z1, underSlab, line: 'flight' });
      }
    }
    if (open.length && !continuous) {
      // profil górny: od skrajnej lameli do krawędzi stropu (albo do drugiej skrajnej lameli)
      let x0 = Math.min(...open) - p / 2;
      let x1 = Math.max(...open) + p / 2;
      if (voidRect && out.slats.some((sl) => sl.underSlab && sl.x > x1)) x1 = voidRect[2];
      if (voidRect && out.slats.some((sl) => sl.underSlab && sl.x < x0)) x0 = voidRect[0];
      out.rails.push({ from: [x0, y], to: [x1, y], z: top - p / 2 });
    }
  }
  if (!continuous) return out;

  // krawędzie otworu klatki na wyższej kondygnacji: lamele od posadzki do sufitu, w osi dawnej balustrady
  const atWall = ([x, y]) => upper.walls.some((w) => distanceToRect(x, y, w.rect) < 1e-3);
  for (const seg of segments) {
    if (seg.levelId !== upper.id || seg.type !== 'level') continue;
    const length = Math.hypot(seg.to[0] - seg.from[0], seg.to[1] - seg.from[1]);
    const ux = (seg.to[0] - seg.from[0]) / length;
    const uy = (seg.to[1] - seg.from[1]) / length;
    for (const t of distributeSlats(length, p, opt.gap, !atWall(seg.from), !atWall(seg.to))) {
      const x = seg.from[0] + ux * t;
      const y = seg.from[1] + uy * t;
      out.slats.push({ x, y, z0: seg.zFrom, z1: upperTop(x, y), underSlab: false, line: 'void' });
    }
  }
  return out;
}

/**
 * Odcinki blokujące ruch przy schodach (balustrady albo lamele, które je zastępują) – dla kolizji.
 * Rzut jest taki sam jak w projekcie, z jednym wyjątkiem: przy lamelach ciągłych osłona między biegami na wyższej
 * kondygnacji leży w linii lameli biegu dolnego (a nie po stronie biegu górnego, jak dawna balustrada).
 */
export function guardSegments(house, design = {}) {
  const segments = balustradeSegments(house);
  const opt = slatOptions(design);
  if (!opt?.continuous || house.levels.length < 2) return segments;
  const lower = segments.find((s) => s.levelId === house.levels[0].id && replacedBySlats(house, s, design));
  if (!lower) return segments;
  return segments.map((s) => {
    if (s.levelId === house.levels[0].id || s.type !== 'raked' || s.partIndex === null) return s;
    const horizontal = Math.abs(s.from[1] - s.to[1]) < EPS;
    return horizontal
      ? { ...s, from: [s.from[0], lower.from[1]], to: [s.to[0], lower.from[1]] }
      : { ...s, from: [lower.from[0], s.from[1]], to: [lower.from[0], s.to[1]] };
  });
}

export function emitBalustrades(house, batch, design = {}) {
  for (const seg of balustradeSegments(house)) {
    if (replacedBySlats(house, seg, design)) continue;
    emitBalustrade(batch('balustrade', 'stairs', seg.levelId), seg.from, seg.to, seg.zFrom, seg.zTo, seg.height);
  }
  const { slats, rails, profile } = slatLayout(house, design);
  if (!slats.length) return;
  const [lower, upper] = house.levels;
  // dotknięcie przechodzi do ściany za lamelami; część ponad posadzką wyższej kondygnacji należy do niej (znika razem z nią)
  const b = batch('slat', 'stairs', lower.id, { noPick: true });
  const bUp = upper ? batch('slat', 'stairs', upper.id, { noPick: true }) : b;
  const cut = upper ? upper.floorLevel : Infinity;
  const h = profile / 2;
  for (const s of slats) {
    if (s.z0 < cut - EPS && s.z1 > cut + EPS) {
      b.box(s.x - h, s.y - h, s.z0, s.x + h, s.y + h, cut, ['bottom']);
      bUp.box(s.x - h, s.y - h, cut, s.x + h, s.y + h, s.z1, ['bottom', 'top']);
    } else {
      (s.z0 >= cut - EPS ? bUp : b).box(s.x - h, s.y - h, s.z0, s.x + h, s.y + h, s.z1, ['bottom', 'top']);
    }
  }
  for (const r of rails) b.bar([...r.from, r.z], [...r.to, r.z], profile, profile);
}

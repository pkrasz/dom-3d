// Pomocnicze obliczenia 2D na rzucie (układ domu: x w prawo, y w górę arkusza, metry).
// Wszystkie wieloboki pomieszczeń w house.json są prostokątne (krawędzie równoległe do osi),
// dlatego obszary dzielimy na prostokątne komórki siatki – bez triangulacji i bez pęknięć.

export const EPS = 1e-6;

/** Pole wieloboku ze znakiem: dodatnie = wierzchołki przeciwnie do ruchu wskazówek zegara. */
export function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const pointInRect = (x, y, r, pad = 0) => x > r[0] - pad && x < r[2] + pad && y > r[1] - pad && y < r[3] + pad;

export const rectCenter = (r) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];

/** Prostokąt opisany na wieloboku [x0, y0, x1, y1] – ta sama funkcja co w narzędziach projektu. */
export { bbox as polygonBBox } from '../../tools/geometry.mjs';

export const rectToPolygon = (r) => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]];

/** Posortowane wartości bez powtórzeń (z tolerancją). */
export function uniqueSorted(values, eps = 1e-6) {
  const sorted = [...values].sort((a, b) => a - b);
  const out = [];
  for (const v of sorted) if (!out.length || v - out[out.length - 1] > eps) out.push(v);
  return out;
}

/** Suma przedziałów [a, b] – scalone i posortowane. */
export function mergeIntervals(list) {
  const sorted = list.filter((i) => i[1] - i[0] > EPS).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Przedziały `base` po odjęciu przedziałów `cuts`. */
export function subtractIntervals(base, cuts) {
  let out = mergeIntervals(base);
  for (const [c0, c1] of mergeIntervals(cuts)) {
    const next = [];
    for (const [a, b] of out) {
      if (c1 <= a + EPS || c0 >= b - EPS) next.push([a, b]);
      else {
        if (c0 - a > EPS) next.push([a, c0]);
        if (b - c1 > EPS) next.push([c1, b]);
      }
    }
    out = next;
  }
  return out;
}

/** Część wspólna przedziału z listą przedziałów. */
export function clipIntervals(list, lo, hi) {
  return list.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)]).filter(([a, b]) => b - a > EPS);
}

/**
 * Dzieli prostokątny (osiowy) obszar na komórki siatki.
 *   polygon – wielobok obszaru,
 *   holes   – prostokąty wycinane z obszaru (kominy, otwór klatki, okna dachowe),
 *   clip    – opcjonalny prostokąt ograniczający,
 *   xCuts, yCuts – dodatkowe linie podziału (np. początek skosu).
 * Wszystkie komórki leżą na jednej wspólnej siatce, więc sąsiednie czworokąty mają wspólne wierzchołki.
 * Zwraca listę prostokątów [x0, y0, x1, y1].
 */
export function gridCells(polygon, { holes = [], clip = null, xCuts = [], yCuts = [], keep = null } = {}) {
  const xs = [...polygon.map((p) => p[0]), ...xCuts];
  const ys = [...polygon.map((p) => p[1]), ...yCuts];
  for (const h of holes) {
    xs.push(h[0], h[2]);
    ys.push(h[1], h[3]);
  }
  if (clip) {
    xs.push(clip[0], clip[2]);
    ys.push(clip[1], clip[3]);
  }
  const ux = uniqueSorted(xs);
  const uy = uniqueSorted(ys);
  const cells = [];
  for (let i = 0; i < ux.length - 1; i++) {
    for (let j = 0; j < uy.length - 1; j++) {
      const cx = (ux[i] + ux[i + 1]) / 2;
      const cy = (uy[j] + uy[j + 1]) / 2;
      if (!pointInPolygon(cx, cy, polygon)) continue;
      if (clip && !pointInRect(cx, cy, clip)) continue;
      if (holes.some((h) => pointInRect(cx, cy, h))) continue;
      if (keep && !keep(cx, cy)) continue;
      cells.push([ux[i], uy[j], ux[i + 1], uy[j + 1]]);
    }
  }
  return cells;
}

/** Odległość punktu od prostokąta (0 w środku). */
export function distanceToRect(x, y, r) {
  const dx = Math.max(r[0] - x, 0, x - r[2]);
  const dy = Math.max(r[1] - y, 0, y - r[3]);
  return Math.hypot(dx, dy);
}

/** Odległość punktu od odcinka. */
export function distanceToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** Odległość punktu wewnątrz wieloboku od jego brzegu. */
export function distanceToPolygonEdge(x, y, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    d = Math.min(d, distanceToSegment(x, y, ax, ay, bx, by));
  }
  return d;
}

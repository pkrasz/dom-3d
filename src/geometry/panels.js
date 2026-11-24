// Pionowa płaszczyzna ściany z otworami i łamaną górną krawędzią.
// Współrzędne panelu: s = położenie wzdłuż ściany (współrzędna domu x albo y), z = wysokość nad poziomem `floor`.
import { EPS, uniqueSorted } from './plan.js';

/**
 * Układ ściany: zamienia (s, z) na punkt 3D i współrzędne UV w metrach.
 *   axis – 'x': ściana biegnie wzdłuż x (stałe y = c); 'y': wzdłuż y (stałe x = c)
 *   n    – ±1: w którą stronę osi prostopadłej patrzy lico (do pomieszczenia)
 *   lo, hi – zakres krawędzi; u liczone od LEWEGO końca, patrząc na lico
 *   floor – rzędna, od której liczone jest z (i v w UV)
 */
export function wallFrame({ axis, c, n, lo, hi, floor = 0, uOffset = 0 }) {
  // Kierunek rosnącego u: T = (-ny, nx), żeby T × Z = n.
  const fromHi = axis === 'x' ? n > 0 : n < 0;
  return {
    axis,
    normal: axis === 'x' ? [0, n, 0] : [n, 0, 0],
    point: (s, z) => (axis === 'x' ? [s, c, floor + z] : [c, s, floor + z]),
    uv: (s, z) => [uOffset + (fromHi ? hi - s : s - lo), z],
  };
}

/**
 * Dokłada do buildera panel ściany.
 *   panel.bottom – dolna krawędź (z),
 *   panel.pieces – górna krawędź: odcinki liniowe {s0, s1, t0, t1},
 *   panel.holes  – otwory {s0, s1, z0, z1}.
 * Podział jest wspólny dla całego panelu (te same poziomy z we wszystkich kolumnach), więc nie powstają szczeliny.
 */
export function emitPanel(builder, frame, panel) {
  const { bottom, pieces } = panel;
  const span0 = Math.min(...pieces.map((p) => p.s0));
  const span1 = Math.max(...pieces.map((p) => p.s1));
  const holes = (panel.holes || []).filter((h) => h.s1 > span0 + EPS && h.s0 < span1 - EPS && h.z1 > bottom + EPS);
  const zBreaks = uniqueSorted([bottom, ...holes.flatMap((h) => [h.z0, h.z1])]).filter((z) => z >= bottom - EPS);

  const emit = (sa, za, sb, zb, sc, zc, sd, zd) => {
    builder.quad(
      frame.point(sa, za), frame.point(sb, zb), frame.point(sc, zc), frame.point(sd, zd),
      frame.normal,
      [frame.uv(sa, za), frame.uv(sb, zb), frame.uv(sc, zc), frame.uv(sd, zd)]
    );
  };

  for (const piece of pieces) {
    const cuts = [piece.s0, piece.s1];
    for (const h of holes) for (const s of [h.s0, h.s1]) if (s > piece.s0 + EPS && s < piece.s1 - EPS) cuts.push(s);
    if (Math.abs(piece.t1 - piece.t0) > EPS) {
      // tam, gdzie skośna górna krawędź przecina poziom otworu, potrzebny jest dodatkowy podział
      for (const z of zBreaks) {
        const f = (z - piece.t0) / (piece.t1 - piece.t0);
        if (f > EPS && f < 1 - EPS) cuts.push(piece.s0 + f * (piece.s1 - piece.s0));
      }
    }
    const ss = uniqueSorted(cuts);
    const topAt = (s) => piece.t0 + ((piece.t1 - piece.t0) * (s - piece.s0)) / (piece.s1 - piece.s0);

    for (let i = 0; i < ss.length - 1; i++) {
      const sa = ss[i];
      const sb = ss[i + 1];
      const ta = topAt(sa);
      const tb = topAt(sb);
      const sm = (sa + sb) / 2;
      const inHole = (z) => holes.some((h) => sm > h.s0 && sm < h.s1 && z > h.z0 && z < h.z1);
      const rows = zBreaks.filter((z) => z <= Math.min(ta, tb) + EPS);
      if (!rows.length) continue;
      for (let k = 0; k < rows.length - 1; k++) {
        if (!inHole((rows[k] + rows[k + 1]) / 2)) emit(sa, rows[k], sb, rows[k], sb, rows[k + 1], sa, rows[k + 1]);
      }
      const zl = rows[rows.length - 1];
      if ((ta - zl > EPS || tb - zl > EPS) && !inHole(zl + 1e-4)) emit(sa, zl, sb, zl, sb, tb, sa, ta);
    }
  }
}

/** Górna krawędź o stałej wysokości. */
export const flatTop = (s0, s1, t) => [{ s0, s1, t0: t, t1: t }];

/** Górna krawędź z funkcji t(s), łamana w podanych punktach. */
export function profileTop(s0, s1, breaks, t) {
  const ss = uniqueSorted([s0, s1, ...breaks.filter((b) => b > s0 + EPS && b < s1 - EPS)]);
  const out = [];
  for (let i = 0; i < ss.length - 1; i++) out.push({ s0: ss[i], s1: ss[i + 1], t0: t(ss[i]), t1: t(ss[i + 1]) });
  return out;
}

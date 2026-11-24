// Okna dachowe: położenie w połaci, w spodzie pakietu dachu i w okładzinie skosu.
// Szpalet prostopadły do połaci (roofWindowReveal w house.json – założenie projektu).
import { roofTopAt } from '../../tools/geometry.mjs';

/**
 * Zwraca dla okna trzy prostokąty w rzucie (x0, x1 wspólne; y od strony okapu "low" i kalenicy "high"):
 *   top    – w wierzchu połaci (pole plan z house.json),
 *   bottom – w spodzie pakietu dachu,
 *   clad   – w okładzinie skosu (tam jest otwór w suficie pomieszczenia),
 * każdy z rzędnymi z na obu krawędziach.
 */
export function roofWindowGeometry(house, level, rw) {
  const roof = house.roof;
  const slope = level.ceiling.slopes.find((s) => s.id === rw.slope);
  const s = roof.slope;
  const r = slope.risePerMeter;
  const north = rw.plan[1] > roof.ridge.y; // połać północna (+y)
  const toRidge = north ? -1 : 1; // w którą stronę y leży kalenica
  const [yLow, yHigh] = north ? [rw.plan[3], rw.plan[1]] : [rw.plan[1], rw.plan[3]]; // okap, kalenica
  const cladZ = (y) => level.floorLevel + slope.heightAtWall + r * Math.abs(y - slope.kneeWallFace);

  const project = (y, kind) => {
    const zr = roofTopAt(roof, y);
    // punkt schodzi prostopadle do połaci: y przesuwa się ku kalenicy o s·t, z maleje o t
    const t = kind === 'bottom'
      ? roof.packageVertical / (1 + s * s)
      : (zr - cladZ(y)) / (1 + r * s);
    return { y: y + toRidge * s * t, z: zr - t };
  };
  const edge = (kind) => {
    if (kind === 'top') return { low: { y: yLow, z: roofTopAt(roof, yLow) }, high: { y: yHigh, z: roofTopAt(roof, yHigh) } };
    return { low: project(yLow, kind), high: project(yHigh, kind) };
  };
  const rect = (e) => [rw.plan[0], Math.min(e.low.y, e.high.y), rw.plan[2], Math.max(e.low.y, e.high.y)];
  const top = edge('top');
  const bottom = edge('bottom');
  const clad = edge('clad');
  return {
    id: rw.id, slope: rw.slope, north, x0: rw.plan[0], x1: rw.plan[2],
    top, bottom, clad,
    topRect: rect(top), bottomRect: rect(bottom), cladRect: rect(clad),
  };
}

export const roofWindowsOf = (house, level) => (level.roofWindows || []).map((rw) => roofWindowGeometry(house, level, rw));

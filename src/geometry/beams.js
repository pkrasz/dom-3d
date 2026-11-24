// Belki widoczne w pomieszczeniach z sufitem otwartym do kalenicy (opcja bryły, design.json):
// jętki w poprzek domu i płatwie pod nimi. Elementy stałe (nieedytowalne), przycięte do obrysu pomieszczeń.
import { EPS, gridCells, mergeIntervals } from './plan.js';
import { openCeilingAt } from './levelModel.js';
import { beamOptions } from './design.js';

/** Najkrótsza belka, jaką warto rysować (m). */
const MIN_BEAM_LENGTH = 0.3;

const intersect = (a, b) => {
  const out = [];
  for (const [a0, a1] of a) for (const [b0, b1] of b) if (Math.min(a1, b1) - Math.max(a0, b0) > EPS) out.push([Math.max(a0, b0), Math.min(a1, b1)]);
  return out;
};

/**
 * Odcinki, na których pas o stałej szerokości leży W CAŁOŚCI w wieloboku (poza prostokątami `holes`).
 *   axis 'x': pas lo..hi w x, wynik to przedziały y; axis 'y': pas lo..hi w y, wynik to przedziały x.
 */
export function spansInside(polygon, holes, axis, lo, hi) {
  const clip = axis === 'x' ? [lo, -Infinity, hi, Infinity] : [-Infinity, lo, Infinity, hi];
  const columns = new Map(); // kolumna w poprzek pasa → przedziały wzdłuż pasa
  for (const [x0, y0, x1, y1] of gridCells(polygon, { holes, clip })) {
    const [c0, c1, s0, s1] = axis === 'x' ? [x0, x1, y0, y1] : [y0, y1, x0, x1];
    const key = `${c0.toFixed(6)}|${c1.toFixed(6)}`;
    if (!columns.has(key)) columns.set(key, { width: c1 - c0, list: [] });
    columns.get(key).list.push([s0, s1]);
  }
  let covered = 0;
  let spans = null;
  for (const col of columns.values()) {
    covered += col.width;
    const merged = mergeIntervals(col.list);
    spans = spans === null ? merged : intersect(spans, merged);
  }
  if (spans === null || Math.abs(covered - (hi - lo)) > 1e-6) return []; // część pasa leży poza wielobokiem
  return spans;
}

/**
 * Belki jako bryły o ośmiu narożnikach (kolejność jak w MeshBuilder.hexa) z listą pomijanych ścian.
 * Zwraca [{ kind: 'collar' | 'purlin', levelId, roomId, corners, skip, rect: [x0, y0, x1, y1], z0, z1 }]
 * (rect = rzut spodu belki, z0/z1 = rzędne spodu i wierzchu).
 */
export function beamSolids(house, models, design) {
  const opt = beamOptions(design);
  const out = [];
  if (!opt) return out;
  for (const model of models) {
    if (!model.openRooms.size) continue;
    const { level, floor } = model;
    const slopes = level.ceiling.slopes;
    // y, w którym płaszczyzna skosu jest na wysokości h (po stronie każdej ścianki kolankowej)
    const reach = (h) => slopes.map((s) => s.kneeWallFace + (s.side === '-y' ? 1 : -1) * Math.max(0, (h - s.heightAtWall) / s.risePerMeter)).sort((a, b) => a - b);
    const c = opt.collar;
    const [yb0, yb1] = reach(c.underside); // zasięg spodu jętki
    const [yt0, yt1] = reach(c.underside + c.height); // zasięg wierzchu (krótszy – koniec belki ścięty po skosie)
    const zb = floor + c.underside;
    const zt = zb + c.height;
    const p = opt.purlins;

    for (const rm of model.rooms) {
      if (!model.isOpenRoom(rm.id)) continue;
      const holes = rm.chimneys.map((ch) => ch.rect);
      const xs = rm.polygon.map((pt) => pt[0]);
      const [bx0, bx1] = [Math.min(...xs), Math.max(...xs)];

      // --- jętki: osie co `spacing`, jedna z nich w x = anchorX
      const k0 = Math.ceil((bx0 - c.anchorX) / c.spacing - 1e-9);
      for (let k = k0; c.anchorX + k * c.spacing < bx1; k++) {
        const x = c.anchorX + k * c.spacing;
        const [xa, xb] = [x - c.width / 2, x + c.width / 2];
        for (const [ya, yb] of spansInside(rm.polygon, holes, 'x', xa, xb)) {
          const b0 = Math.max(ya, yb0);
          const b1 = Math.min(yb, yb1);
          const t0 = Math.max(ya, yt0);
          const t1 = Math.min(yb, yt1);
          if (t1 - t0 < MIN_BEAM_LENGTH) continue;
          const skip = [];
          // czoło przy ścianie albo ścięte dokładnie po okładzinie skosu jest niewidoczne
          if (Math.abs(b0 - t0) < EPS || (b0 > ya + EPS && t0 > ya + EPS)) skip.push('s0');
          if (Math.abs(b1 - t1) < EPS || (b1 < yb - EPS && t1 < yb - EPS)) skip.push('s2');
          out.push({
            kind: 'collar', levelId: model.id, roomId: rm.id, skip, rect: [xa, b0, xb, b1], z0: zb, z1: zt,
            corners: [[xa, b0, zb], [xb, b0, zb], [xb, b1, zb], [xa, b1, zb], [xa, t0, zt], [xb, t0, zt], [xb, t1, zt], [xa, t1, zt]],
          });
        }
      }

      // --- płatwie pod jętkami, w osiach y z design.json
      for (const axis of p.axesY) {
        const [ya, yb] = [axis - p.width / 2, axis + p.width / 2];
        if (Math.min(openCeilingAt(level, ya), openCeilingAt(level, yb)) < c.underside + 1e-6) continue; // weszłaby w okładzinę skosu
        for (const [xa, xb] of spansInside(rm.polygon, holes, 'y', ya, yb)) {
          if (xb - xa < MIN_BEAM_LENGTH) continue;
          const z0 = zb - p.height;
          out.push({
            kind: 'purlin', levelId: model.id, roomId: rm.id, skip: ['s1', 's3'], rect: [xa, ya, xb, yb], z0, z1: zb,
            corners: [[xa, ya, z0], [xb, ya, z0], [xb, yb, z0], [xa, yb, z0], [xa, ya, zb], [xb, ya, zb], [xb, yb, zb], [xa, yb, zb]],
          });
        }
      }
    }
  }
  return out;
}

/** Belki do wspólnej siatki: część 'ceiling' – znikają razem z sufitami (rzut, domek dla lalek). */
export function emitBeams(house, models, design, batch) {
  for (const beam of beamSolids(house, models, design)) {
    batch('beam', 'ceiling', beam.levelId, { noPick: true }).hexa(beam.corners, beam.skip);
  }
}

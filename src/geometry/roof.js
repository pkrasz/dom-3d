// Dach uproszczony: dwie połacie o grubości pakietu (w pionie), okap, otwory okien dachowych,
// kominy ponad dachem z czapami. Wszystko nieedytowalne (stałe materiały).
import { roofTopAt } from '../../tools/geometry.mjs';
import { gridCells, rectToPolygon } from './plan.js';
import { roofWindowsOf } from './roofWindows.js';
import { ROOF_WINDOW_FRAME, ROOF_WINDOW_FRAME_RISE } from './constants.js';

export function emitRoof(house, batch) {
  const roof = house.roof;
  const upper = house.levels[house.levels.length - 1];
  const levelId = upper.id;
  const [x0, y0, x1, y1] = roof.planRect;
  const yr = roof.ridge.y;
  const s = roof.slope;
  const pv = roof.packageVertical;
  const zt = (y) => roofTopAt(roof, y);
  const zb = (y) => zt(y) - pv;
  const windows = roofWindowsOf(house, upper);
  const b = batch('roof', 'roof', levelId);

  for (const side of ['S', 'N']) {
    const band = side === 'S' ? [x0, y0, x1, yr] : [x0, yr, x1, y1];
    const up = side === 'S' ? [0, -s, 1] : [0, s, 1];
    const down = [-up[0], -up[1], -up[2]];
    const mine = windows.filter((w) => w.north === (side === 'N'));
    for (const [cx0, cy0, cx1, cy1] of gridCells(rectToPolygon(band), { holes: mine.map((w) => w.topRect) })) {
      b.quad([cx0, cy0, zt(cy0)], [cx1, cy0, zt(cy0)], [cx1, cy1, zt(cy1)], [cx0, cy1, zt(cy1)], up);
    }
    for (const [cx0, cy0, cx1, cy1] of gridCells(rectToPolygon(band), { holes: mine.map((w) => w.bottomRect) })) {
      b.quad([cx0, cy0, zb(cy0)], [cx1, cy0, zb(cy0)], [cx1, cy1, zb(cy1)], [cx0, cy1, zb(cy1)], down);
    }
    // czoło okapu
    const ye = side === 'S' ? y0 : y1;
    b.quad([x0, ye, zb(ye)], [x1, ye, zb(ye)], [x1, ye, zt(ye)], [x0, ye, zt(ye)], [0, side === 'S' ? -1 : 1, 0]);
    // czoła szczytowe pakietu
    for (const [x, nx] of [[x0, -1], [x1, 1]]) {
      const [ya, yb] = [band[1], band[3]];
      b.quad([x, ya, zb(ya)], [x, yb, zb(yb)], [x, yb, zt(yb)], [x, ya, zt(ya)], [nx, 0, 0]);
    }
  }

  // okna dachowe: rama w połaci + szyba
  const frame = batch('frame', 'roof', levelId);
  const glass = batch('glass', 'roof', levelId, { noPick: true });
  const f = ROOF_WINDOW_FRAME;
  for (const w of windows) {
    const { low, high } = w.top;
    const lift = ROOF_WINDOW_FRAME_RISE / 2;
    // dwa ramiaki poziome i dwa po spadku
    frame.bar([w.x0, low.y, low.z + lift], [w.x1, low.y, low.z + lift], f * 2, ROOF_WINDOW_FRAME_RISE * 2);
    frame.bar([w.x0, high.y, high.z + lift], [w.x1, high.y, high.z + lift], f * 2, ROOF_WINDOW_FRAME_RISE * 2);
    for (const x of [w.x0, w.x1]) frame.bar([x, low.y, low.z + lift], [x, high.y, high.z + lift], f * 2, ROOF_WINDOW_FRAME_RISE * 2);
    const up = w.north ? [0, s, 1] : [0, -s, 1];
    glass.quad([w.x0, low.y, low.z], [w.x1, low.y, low.z], [w.x1, high.y, high.z], [w.x0, high.y, high.z], up);
  }

  // szpalety okien dachowych: od połaci do okładziny skosu, prostopadle do połaci (część wnętrza)
  const reveal = batch('reveal', 'ceiling', levelId);
  for (const w of windows) {
    const t = w.top;
    const c = w.clad;
    const center = [
      (w.x0 + w.x1) / 2,
      (t.low.y + t.high.y + c.low.y + c.high.y) / 4,
      (t.low.z + t.high.z + c.low.z + c.high.z) / 4,
    ];
    const inward = (a, b2, c2, d) => {
      // normalna do środka szybu
      const mid = [(a[0] + c2[0]) / 2, (a[1] + c2[1]) / 2, (a[2] + c2[2]) / 2];
      const away = [2 * mid[0] - center[0], 2 * mid[1] - center[1], 2 * mid[2] - center[2]];
      reveal.quadAway(a, b2, c2, d, away);
    };
    inward([w.x0, t.low.y, t.low.z], [w.x1, t.low.y, t.low.z], [w.x1, c.low.y, c.low.z], [w.x0, c.low.y, c.low.z]);
    inward([w.x0, t.high.y, t.high.z], [w.x1, t.high.y, t.high.z], [w.x1, c.high.y, c.high.z], [w.x0, c.high.y, c.high.z]);
    for (const x of [w.x0, w.x1]) {
      inward([x, t.low.y, t.low.z], [x, t.high.y, t.high.z], [x, c.high.y, c.high.z], [x, c.low.y, c.low.z]);
    }
  }

  // kominy ponad dachem
  const stack = batch('chimney', 'roof', levelId);
  const cap = batch('chimneyCap', 'roof', levelId);
  const caps = roof.chimneyCaps;
  for (const ch of roof.chimneysAboveRoof || []) {
    const [cx0, cy0, cx1, cy1] = ch.rect;
    // Trzon zaczyna się na SPODZIE pakietu dachu (dolna krawędź idzie po skosie). Obrys ponad dachem jest szerszy
    // niż komin we wnętrzu, więc trzon zaczynający się niżej wystawałby pod sufit pomieszczeń poddasza.
    const zTop = ch.top - caps.thickness;
    stack.hexa(
      [
        [cx0, cy0, zb(cy0)], [cx1, cy0, zb(cy0)], [cx1, cy1, zb(cy1)], [cx0, cy1, zb(cy1)],
        [cx0, cy0, zTop], [cx1, cy0, zTop], [cx1, cy1, zTop], [cx0, cy1, zTop],
      ],
      ['bottom', 'top']
    );
    cap.box(cx0 - caps.overhang, cy0 - caps.overhang, ch.top - caps.thickness, cx1 + caps.overhang, cy1 + caps.overhang, ch.top);
  }
}

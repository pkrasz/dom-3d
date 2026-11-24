// Otoczenie domu: teren, taras, podest wejściowy, schodki, podjazd ze spadkiem.
import { TERRAIN_SIZE, PAVING_SKIRT } from './constants.js';

export function emitSite(house, info, batch) {
  const parter = house.levels[0];
  const ground = parter.groundLevel;
  const [mx0, my0, mx1, my1] = info.masonry;
  const cx = (mx0 + mx1) / 2;
  const cy = (my0 + my1) / 2;

  // teren – jedna duża płaszczyzna
  const terrain = batch('terrain', 'exterior', 'parter', { noPick: true });
  const h = TERRAIN_SIZE / 2;
  terrain.quad([cx - h, cy - h, ground], [cx + h, cy - h, ground], [cx + h, cy + h, ground], [cx - h, cy + h, ground], [0, 0, 1]);

  const paving = batch('paving', 'exterior', 'parter');
  for (const el of parter.exterior || []) {
    const [x0, y0, x1, y1] = el.rect;
    if (el.levelLow !== undefined) {
      // podjazd: wyżej przy elewacji, niżej dalej od domu (spadek wzdłuż y)
      const nearIsY1 = Math.abs(y1 - cy) < Math.abs(y0 - cy);
      const zA = nearIsY1 ? el.levelLow : el.levelHigh; // przy y0
      const zB = nearIsY1 ? el.levelHigh : el.levelLow; // przy y1
      const zb = ground - PAVING_SKIRT;
      paving.hexa(
        [
          [x0, y0, zb], [x1, y0, zb], [x1, y1, zb], [x0, y1, zb],
          [x0, y0, zA], [x1, y0, zA], [x1, y1, zB], [x0, y1, zB],
        ],
        ['bottom']
      );
      continue;
    }
    paving.box(x0, y0, ground, x1, y1, el.level, ['bottom']);
    const st = el.steps;
    if (!st) continue;
    // schodki: stopnie oddalają się od płyty; poziomy z pola levels
    const [sx0, sy0, sx1, sy1] = st.rect;
    const alongY = sy0 >= y1 - 1e-6 || sy1 <= y0 + 1e-6;
    const away = alongY ? (sy0 >= y1 - 1e-6 ? 1 : -1) : sx0 >= x1 - 1e-6 ? 1 : -1;
    st.levels.forEach((z, i) => {
      if (alongY) {
        const a = away > 0 ? sy0 + i * st.tread : sy1 - (i + 1) * st.tread;
        paving.box(sx0, a, ground, sx1, a + st.tread, z, ['bottom']);
      } else {
        const a = away > 0 ? sx0 + i * st.tread : sx1 - (i + 1) * st.tread;
        paving.box(a, sy0, ground, a + st.tread, sy1, z, ['bottom']);
      }
    });
  }
}

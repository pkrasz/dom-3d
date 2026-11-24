// Renderer WebGL: antyaliasing, pixelRatio najwyżej 2, bez cieni (domyślnie), renderowanie "na żądanie".
import { WebGLRenderer, SRGBColorSpace } from 'three';

/** Największy pixelRatio – powyżej 2 telefon liczy 2–3× więcej pikseli bez widocznej różnicy. */
export const MAX_PIXEL_RATIO = 2;

export function createRenderer(canvas) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = false; // cienie wyłączone – płynność na telefonie
  applyPixelRatio(renderer);
  return renderer;
}

/** Ustawia pixelRatio renderera (ograniczony do MAX_PIXEL_RATIO) – także po zmianie rozmiaru / przeniesieniu okna na inny ekran. */
export function applyPixelRatio(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
}

/**
 * Pętla "na żądanie": klatka jest rysowana tylko po requestRender().
 * updaters – funkcje (dt) => boolean; zwrócenie true oznacza "potrzebuję kolejnej klatki" (ruch w spacerze, wygaszanie orbity).
 */
export function createLoop(draw) {
  const updaters = new Set();
  let scheduled = false;
  let last = 0;

  function tick(now) {
    scheduled = false;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    let again = false;
    for (const fn of updaters) again = fn(dt) || again;
    draw();
    if (again) requestRender();
    else last = 0; // po przerwie nie liczymy długiego dt
  }

  function requestRender() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(tick);
  }

  return {
    requestRender,
    addUpdater(fn) {
      updaters.add(fn);
      return () => updaters.delete(fn);
    },
  };
}

// Wirtualny joystick do chodzenia (tryb spaceru na ekranie dotykowym), lewy dolny róg.
import { el } from './dom.js';

const RADIUS = 42; // px – największe wychylenie gałki
const DEADZONE = 0.14;

/** onMove(x, y): x = w bok (prawo +), y = do przodu (+), zakres -1..1; (0, 0) po puszczeniu. */
export function createJoystick(root, onMove) {
  const knob = el('div', { class: 'joystick__knob' });
  const base = el('div', { class: 'joystick', 'aria-label': 'Joystick – chodzenie', role: 'application' }, [knob]);
  root.append(base);
  let pointer = null;

  function set(dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let x = dx / RADIUS;
    let y = -dy / RADIUS;
    if (Math.hypot(x, y) < DEADZONE) x = y = 0;
    onMove(x, y);
  }
  function fromEvent(e) {
    const r = base.getBoundingClientRect();
    set(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  }
  function release(e) {
    if (e.pointerId !== pointer) return;
    pointer = null;
    base.classList.remove('is-active');
    set(0, 0);
  }

  base.addEventListener('pointerdown', (e) => {
    if (pointer !== null) return;
    pointer = e.pointerId;
    base.setPointerCapture(e.pointerId);
    base.classList.add('is-active');
    fromEvent(e);
    e.preventDefault();
  });
  base.addEventListener('pointermove', (e) => {
    if (e.pointerId === pointer) fromEvent(e);
  });
  base.addEventListener('pointerup', release);
  base.addEventListener('pointercancel', release);
  base.addEventListener('lostpointercapture', release);

  return {
    setVisible(v) {
      base.classList.toggle('is-visible', v);
      if (!v && pointer !== null) {
        pointer = null;
        set(0, 0);
      }
    },
    element: base,
  };
}

/** Czy urządzenie ma ekran dotykowy (wtedy pokazujemy joystick w spacerze). */
export const hasTouch = () =>
  (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

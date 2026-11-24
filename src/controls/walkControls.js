// Spacer po domu na wysokości oczu.
// Komputer: WASD / strzałki + rozglądanie przeciąganiem myszy. Telefon: joystick (chodzenie) + przeciąganie palcem (rozglądanie).
// Kolizje 2D ze ścianami (src/geometry/collision.js); na schodach wysokość oczu podąża za stopniami.
import { PerspectiveCamera } from 'three';
import { moveCircle } from '../geometry/collision.js';
import { ceilingAt } from '../geometry/levelModel.js';
import { EYE_HEIGHT, WALK_RADIUS, WALK_HEAD_CLEARANCE } from '../geometry/constants.js';
import { toWorld } from '../app/coords.js';

const WALK_SPEED = 1.5; // m/s
const RUN_SPEED = 3.0; // z Shiftem
const TURN_SPEED = 1.9; // rad/s (strzałki w bok, Q/E)
const LOOK_SENSITIVITY = 0.0042; // rad na piksel przeciągnięcia
const MAX_PITCH = (80 * Math.PI) / 180;

const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA'],
  right: ['KeyD'],
  turnLeft: ['ArrowLeft', 'KeyQ'],
  turnRight: ['ArrowRight', 'KeyE'],
};

export function createWalkControls({ dom, house, collision, requestRender, onLevelReached }) {
  const camera = new PerspectiveCamera(72, 1, 0.05, 300);
  const state = { x: 0, y: 0, feetZ: 0, eyeZ: EYE_HEIGHT, heading: Math.PI / 2, pitch: 0 };
  const pressed = new Set();
  const joystick = { x: 0, y: 0 };
  let enabled = false;
  let paused = false; // funkcja przejęła przeciąganie: postać stoi, ale stan joysticka i klawiszy zostaje
  let lookPointer = null;
  let lastX = 0;
  let lastY = 0;

  /** Wysokość oczu nad stopami: pod skosem poddasza kamera się obniża. */
  function eyeHeightAt(y, feetZ) {
    const level = house.levels.find((l) => Math.abs(l.floorLevel - feetZ) < 0.01);
    if (!level || !level.ceiling) return EYE_HEIGHT;
    return Math.max(0.9, Math.min(EYE_HEIGHT, ceilingAt(level, y) - WALK_HEAD_CLEARANCE));
  }

  function syncCamera() {
    toWorld(state.x, state.y, state.eyeZ, camera.position);
    const cp = Math.cos(state.pitch);
    camera.lookAt(
      camera.position.x + Math.cos(state.heading) * cp,
      camera.position.y + Math.sin(state.pitch),
      camera.position.z - Math.sin(state.heading) * cp
    );
  }

  const isDown = (action) => KEYS[action].some((k) => pressed.has(k));

  function update(dt) {
    if (!enabled || paused) return false;
    let forward = (isDown('forward') ? 1 : 0) - (isDown('back') ? 1 : 0) + joystick.y;
    let strafe = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0) + joystick.x;
    const turn = (isDown('turnLeft') ? 1 : 0) - (isDown('turnRight') ? 1 : 0);
    const mag = Math.hypot(forward, strafe);
    if (mag > 1) {
      forward /= mag;
      strafe /= mag;
    }
    let active = false;

    if (turn) {
      state.heading += turn * TURN_SPEED * dt;
      active = true;
    }
    if (mag > 0.01) {
      const speed = (pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? RUN_SPEED : WALK_SPEED) * dt;
      const c = Math.cos(state.heading);
      const s = Math.sin(state.heading);
      const dx = (c * forward + s * strafe) * speed;
      const dy = (s * forward - c * strafe) * speed;
      const walls = collision.walls(collision.levelIdAtHeight(state.feetZ));
      const target = moveCircle(state.x, state.y, dx, dy, WALK_RADIUS, walls);
      // podłoże w nowym miejscu; jeśli go nie ma (otwór klatki, za wysoki stopień) – próba ślizgu wzdłuż jednej osi
      for (const [nx, ny] of [[target.x, target.y], [target.x, state.y], [state.x, target.y]]) {
        const ground = collision.groundAt(nx, ny, state.feetZ);
        if (ground === null) continue;
        state.x = nx;
        state.y = ny;
        if (ground !== state.feetZ) {
          state.feetZ = ground;
          const level = house.levels.find((l) => Math.abs(l.floorLevel - ground) < 0.01);
          if (level) onLevelReached?.(level.id);
        }
        break;
      }
      active = true;
    }
    // wysokość oczu dochodzi płynnie (stopnie, skosy)
    const eyeTarget = state.feetZ + eyeHeightAt(state.y, state.feetZ);
    const diff = eyeTarget - state.eyeZ;
    if (Math.abs(diff) > 0.002) {
      state.eyeZ += diff * Math.min(1, dt * 12);
      active = true;
    } else state.eyeZ = eyeTarget;

    syncCamera();
    return active;
  }

  // ---- klawiatura
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
  function onKeyDown(e) {
    if (!enabled || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const used = Object.values(KEYS).some((list) => list.includes(e.code)) || e.code.startsWith('Shift');
    if (!used) return;
    pressed.add(e.code);
    if (e.code.startsWith('Arrow')) e.preventDefault();
    requestRender();
  }
  function onKeyUp(e) {
    pressed.delete(e.code);
  }
  function onBlur() {
    pressed.clear();
  }

  // ---- rozglądanie przeciąganiem
  function onPointerDown(e) {
    if (!enabled || paused || lookPointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    lookPointer = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
  }
  function onPointerMove(e) {
    if (!enabled || e.pointerId !== lookPointer) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    // "chwytanie sceny": obraz podąża za palcem (przeciągnięcie w prawo obraca widok w lewo), tak jak w orbicie
    state.heading += dx * LOOK_SENSITIVITY;
    state.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, state.pitch + dy * LOOK_SENSITIVITY));
    syncCamera();
    requestRender();
  }
  function onPointerUp(e) {
    if (e.pointerId === lookPointer) lookPointer = null;
  }

  dom.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    camera,
    update,
    get enabled() {
      return enabled;
    },
    /** Włącza / wyłącza spacer (zmiana trybu widoku). Wyłączenie zeruje klawisze, joystick i rozglądanie. */
    setEnabled(v) {
      if (enabled === v) return;
      enabled = v;
      if (!v) {
        pressed.clear();
        joystick.x = joystick.y = 0;
        lookPointer = null;
      }
    },
    /**
     * Wstrzymuje spacer na czas, gdy funkcja przejmuje przeciąganie (np. przesuwanie mebla): postać stoi i nie rozgląda się,
     * ale trzymany joystick i wciśnięte klawisze zostają – po wznowieniu ruch trwa dalej bez ponownego naciskania.
     */
    setPaused(v) {
      if (paused === v) return;
      paused = v;
      lookPointer = null;
      if (!v) requestRender();
    },
    /** Joystick dotykowy: x = w bok (prawo +), y = do przodu (+), zakres -1..1. */
    setJoystick(x, y) {
      joystick.x = x;
      joystick.y = y;
      if (x || y) requestRender();
    },
    /** Przenosi postać. heading w stopniach w układzie domu: 0 = +x, 90 = +y (opcjonalnie). */
    teleport({ x, y, z, headingDeg }) {
      state.x = x;
      state.y = y;
      state.feetZ = z;
      state.eyeZ = z + eyeHeightAt(y, z);
      if (headingDeg !== undefined) state.heading = (headingDeg * Math.PI) / 180;
      state.pitch = 0;
      syncCamera();
      requestRender();
    },
    getPosition: () => ({ x: state.x, y: state.y, z: state.feetZ }),
    setAspect(aspect) {
      // na wąskim ekranie (telefon pionowo) większy kąt pionowy, żeby poziomo było widać ok. 65°
      const wantH = (65 * Math.PI) / 180;
      const v = (2 * Math.atan(Math.tan(wantH / 2) / aspect) * 180) / Math.PI;
      camera.fov = Math.max(62, Math.min(95, v));
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
    dispose() {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}

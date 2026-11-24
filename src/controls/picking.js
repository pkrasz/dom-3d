// Wskazywanie obiektów: dotknięcie / kliknięcie bez przeciągnięcia → raycast → zdarzenia,
// oraz przejmowanie przeciągania przez funkcje (np. przesuwanie mebla po posadzce).
import { Raycaster, Vector2, Vector3, Plane } from 'three';
import { toHouse } from '../app/coords.js';

const TAP_MAX_MOVE_MOUSE = 5; // px
const TAP_MAX_MOVE_TOUCH = 12; // px
const TAP_MAX_TIME = 700; // ms
const STALE_POINTER_MS = 30000; // po tym czasie wpis bez pointerup uznajemy za zgubiony

export function createPicking({ container, canvas, getCamera, houseGroup, house, store, events, getClipWorldY, setControlsEnabled, requestRender }) {
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const plane = new Plane();
  const tmp = new Vector3();
  const pointers = new Map(); // pointerId → { x, y, t, moved, multi }
  let dragHandler = null;
  let dragPointer = null;

  function setRay(event) {
    const rect = canvas.getBoundingClientRect();
    setRayNdc(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  }

  /** Promień z punktu ekranu w współrzędnych znormalizowanych (−1..1, y w górę). */
  function setRayNdc(nx, ny) {
    ndc.set(nx, ny);
    const camera = getCamera();
    camera.updateMatrixWorld(); // kamera mogła się ruszyć po ostatniej narysowanej klatce
    raycaster.setFromCamera(ndc, camera);
  }

  function collect(obj, out) {
    if (!obj.visible) return;
    if (obj.isMesh && !obj.userData.noPick) out.push(obj);
    for (const child of obj.children) collect(child, out);
  }

  /** Pierwsze trafienie promienia w widoczną geometrię domu (z uwzględnieniem przekroju widoku z góry). */
  function hitTest(event) {
    setRay(event);
    const candidates = [];
    houseGroup.updateMatrixWorld(); // obiekty dodane lub przesunięte po ostatniej klatce (np. meble)
    collect(houseGroup, candidates);
    const clipY = getClipWorldY();
    const pickableOf = (object) => {
      for (let o = object; o && o !== houseGroup; o = o.parent) if (o.userData.pickable) return o;
      return null;
    };
    const hits = raycaster.intersectObjects(candidates, false);
    // w widoku z góry dom jest przycięty – trafienia w odciętą część murów pomijamy; meble nie są przycinane
    const hit = hits.find((h) => clipY === null || h.point.y <= clipY + 1e-6 || pickableOf(h.object));
    if (!hit) return null;
    const pickable = pickableOf(hit.object);
    return { object: hit.object, pickable, surfaceId: hit.object.userData.surfaceId || null, point: toHouse(hit.point), distance: hit.distance };
  }

  const defaultLevelId = () => {
    const id = store.getState().levelId;
    return id === 'all' ? house.levels[0].id : id;
  };

  /** Punkt na płaszczyźnie posadzki kondygnacji pod wskaźnikiem (układ domu) albo null. */
  function floorPoint(event, levelId = defaultLevelId()) {
    setRay(event);
    return rayOnFloor(levelId);
  }

  /** To samo dla punktu ekranu podanego jako NDC (np. środek widocznej części widoku). */
  function floorPointAtNdc(nx, ny, levelId = defaultLevelId()) {
    setRayNdc(nx, ny);
    return rayOnFloor(levelId);
  }

  function rayOnFloor(levelId) {
    const level = house.levels.find((l) => l.id === levelId) || house.levels[0];
    plane.set(tmp.set(0, 1, 0), -level.floorLevel);
    const p = raycaster.ray.intersectPlane(plane, new Vector3());
    return p ? toHouse(p) : null;
  }

  function dragInfo(type, event, withHit) {
    const levelId = dragHandler?.levelId || defaultLevelId();
    const hit = withHit ? hitTest(event) : null;
    return {
      type, event, levelId,
      point: floorPoint(event, levelId),
      object: hit?.pickable || null,
      surfaceId: hit?.surfaceId || null,
      hitPoint: hit?.point || null,
      floorPoint: (id) => floorPoint(event, id),
    };
  }
  const callHandler = (name, info) => {
    if (!dragHandler) return undefined;
    if (typeof dragHandler === 'function') return dragHandler(info);
    const fn = dragHandler[{ start: 'onStart', move: 'onMove', end: 'onEnd' }[name]];
    return fn ? fn.call(dragHandler, info) : undefined;
  };

  function onPointerDown(event) {
    if (event.target !== canvas) return;
    // Wpisy po zgubionym pointerup nie mogą blokować kolejnych tapnięć: stary wpis tego samego wskaźnika
    // (mysz ma stałe id) usuwamy od razu, pozostałe po 30 s.
    const now = performance.now();
    pointers.delete(event.pointerId);
    for (const [id, p] of pointers) if (now - p.t > STALE_POINTER_MS) pointers.delete(id);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, t: now, moved: 0, multi: pointers.size > 0 });
    if (pointers.size > 1) for (const p of pointers.values()) p.multi = true;

    if (dragHandler && dragPointer === null && pointers.size === 1 && (event.pointerType !== 'mouse' || event.button === 0)) {
      if (callHandler('start', dragInfo('start', event, true))) {
        // funkcja przejęła przeciąganie: kamera stoi do puszczenia wskaźnika
        dragPointer = event.pointerId;
        setControlsEnabled(false);
        event.stopPropagation();
        event.preventDefault();
        requestRender();
      }
    }
  }

  function onPointerMove(event) {
    const p = pointers.get(event.pointerId);
    if (p) p.moved = Math.max(p.moved, Math.hypot(event.clientX - p.x, event.clientY - p.y));
    if (event.pointerId === dragPointer) {
      callHandler('move', dragInfo('move', event, false));
      requestRender();
    }
  }

  function onPointerUp(event) {
    const p = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (event.pointerId === dragPointer) {
      dragPointer = null;
      const consumed = callHandler('end', dragInfo('end', event, false)) === true;
      setControlsEnabled(true);
      requestRender();
      // prawdziwe przeciągnięcie to nie tapnięcie; funkcja może też sama uznać gest za zużyty (onEnd → true),
      // np. gdy przesunęła mebel o kilka pikseli – wtedy pod palcem może już być ściana, a nie mebel
      if (consumed || !p || p.moved > TAP_MAX_MOVE_TOUCH) return;
    }
    if (!p || event.type === 'pointercancel' || p.multi) return;
    const limit = event.pointerType === 'mouse' ? TAP_MAX_MOVE_MOUSE : TAP_MAX_MOVE_TOUCH;
    if (p.moved > limit || performance.now() - p.t > TAP_MAX_TIME) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    emitTap(event);
  }

  function emitTap(event) {
    const hit = hitTest(event);
    // Zaznaczenie z CHWILI dotknięcia: obsługa zdarzenia w jednej funkcji może je zmienić, zanim zdarzenie dojdzie
    // do następnej (np. meble odznaczają mebel), a reakcja nie może zależeć od kolejności podpięcia funkcji.
    const selection = store.getState().selection;
    if (!hit) {
      events.emit('background:tap', { event, selection });
      return;
    }
    if (hit.pickable) {
      events.emit('object:tap', { object: hit.pickable, mesh: hit.object, point: hit.point, event, selection });
      return;
    }
    if (hit.surfaceId) {
      const u = hit.object.userData;
      const payload = { surfaceId: hit.surfaceId, kind: u.kind, levelId: u.levelId, roomId: u.roomId, point: hit.point, event, selection };
      events.emit('surface:tap', payload);
      if (u.kind === 'floor') events.emit('floor:tap', payload);
      return;
    }
    events.emit('background:tap', { event, point: hit.point, part: hit.object.userData.part, selection });
  }

  // Karta w tle albo okno bez fokusu: pointerup mógł nie dojść – zaczynamy z czystą listą dotknięć.
  // (Trwające przeciąganie funkcji zostaje: kończy je pointerup albo pointercancel.)
  function forgetPointers() {
    for (const id of [...pointers.keys()]) if (id !== dragPointer) pointers.delete(id);
  }
  const onVisibility = () => {
    if (document.hidden) forgetPointers();
  };

  // faza przechwytywania na kontenerze: zdążymy przed sterowaniem kamerą podpiętym do canvasu
  container.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('blur', forgetPointers);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    /**
     * Przejęcie przeciągania. handler: { onStart(info) → true żeby przejąć, onMove(info), onEnd(info), levelId? }
     * albo funkcja (info) z info.type = 'start' | 'move' | 'end'. null – wyłącza.
     * onEnd zwracające true oznacza "gest zużyty": rdzeń nie wyemituje po nim tapnięcia.
     * Gniazdo jest JEDNO (dziś używają go tylko meble) – kolejna funkcja musi się z nimi uzgodnić.
     * info.point = punkt na płaszczyźnie posadzki (układ domu), info.object = trafiony obiekt z userData.pickable.
     */
    setDragHandler(handler) {
      if (dragPointer !== null) {
        dragPointer = null;
        setControlsEnabled(true);
      }
      dragHandler = handler || null;
    },
    hitTest,
    floorPoint,
    floorPointAtNdc,
    dispose() {
      container.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('blur', forgetPointers);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

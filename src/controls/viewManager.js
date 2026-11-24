// Tryby widoku: 'top' (rzut z przekrojem), 'orbit' (obrót wokół domu), 'walk' (spacer).
// Tu jest jedno miejsce, które decyduje: która kamera jest aktywna, co widać (kondygnacja, dach, strop, czapki murów)
// i gdzie leży płaszczyzna cięcia.
import { OrthographicCamera, PerspectiveCamera, Plane, Vector3, MOUSE, TOUCH } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWalkControls } from './walkControls.js';
import { polygonBBox } from '../geometry/plan.js';
import { SECTION_HEIGHT } from '../geometry/constants.js';
import { toWorld, toHouse } from '../app/coords.js';

const TOP_HALF_HEIGHT = 10; // połowa wysokości kadru kamery z góry przy zoom = 1 (m)
const TOP_CAMERA_Y = 120;
/** Wejście w spacer wraca na poprzednie miejsce, gdy widok patrzy nie dalej niż tyle od niego (m). */
const WALK_RETURN_RADIUS = 1;

export function createViewManager({ renderer, canvas, house, built, store, collision, loop, furnitureGroups, getTopInset }) {
  const [lower, upper] = house.levels;
  const [mx0, my0, mx1, my1] = built.shell.masonry;
  const center = { x: (mx0 + mx1) / 2, y: (my0 + my1) / 2 };
  const concreteLevel = (id) => house.levels.find((l) => l.id === id) || lower;
  let size = { w: 1, h: 1 };
  let bottomInset = 0; // px zasłonięte od dołu przez arkusz panelu (telefon)

  // ------------------------------------------------------------ kamera z góry (rzut)
  const topCamera = new OrthographicCamera(-TOP_HALF_HEIGHT, TOP_HALF_HEIGHT, TOP_HALF_HEIGHT, -TOP_HALF_HEIGHT, 1, 400);
  topCamera.up.set(0, 0, -1); // góra ekranu = +y domu (góra arkusza)
  toWorld(center.x, center.y, TOP_CAMERA_Y, topCamera.position);
  const topControls = new OrbitControls(topCamera, canvas);
  topControls.enableRotate = false;
  topControls.screenSpacePanning = true;
  topControls.zoomToCursor = true;
  topControls.minZoom = 0.45;
  topControls.maxZoom = 14;
  topControls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
  topControls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_PAN };
  toWorld(center.x, center.y, 0, topControls.target);

  // ------------------------------------------------------------ kamera orbity
  const orbitCamera = new PerspectiveCamera(45, 1, 0.3, 500);
  const orbitControls = new OrbitControls(orbitCamera, canvas);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.14;
  orbitControls.minDistance = 2;
  orbitControls.maxDistance = 90;
  orbitControls.maxPolarAngle = Math.PI / 2 - 0.03; // nie schodzimy pod teren
  orbitControls.zoomToCursor = true;
  toWorld(center.x, center.y, 1, orbitControls.target);

  // ------------------------------------------------------------ spacer
  const walk = createWalkControls({
    dom: canvas, house, collision,
    requestRender: loop.requestRender,
    onLevelReached: (levelId) => store.setState({ levelId }),
  });
  let walked = false;

  for (const c of [topControls, orbitControls]) {
    c.enabled = false;
    c.addEventListener('change', loop.requestRender);
  }

  // Przekrój widoku z góry: cięcie LOKALNE – przycinane są tylko materiały domu (ściany, stolarka, schody…).
  // Meble i inne obiekty funkcji zostają całe, więc w rzucie widać je z góry w całości.
  // Wspólna tablica płaszczyzn: pusta = bez cięcia; materiały trzymają do niej referencję.
  const clipPlane = new Plane(new Vector3(0, -1, 0), 0); // zostaje to, co poniżej
  const clipPlanes = [];
  renderer.localClippingEnabled = true;
  const clipMaterial = (material) => {
    for (const m of [].concat(material)) if (m) m.clippingPlanes = clipPlanes;
  };
  for (const mesh of built.group.children) clipMaterial(mesh.material);
  let clipWorldY = null;
  let mode = null;
  let controlsEnabled = true;

  loop.addUpdater((dt) => {
    if (mode === 'walk') return walk.update(dt);
    if (mode === 'orbit') orbitControls.update();
    else if (mode === 'top') topControls.update();
    return false;
  });

  // ------------------------------------------------------------ kadrowanie
  function fitTop(rect = null, marginM = 1.6) {
    const r = rect || [mx0 - 1.2, my0 - 2.4, mx1 + 1.2, my1 + 4.4]; // dom z tarasem, podestem i podjazdem
    const w = r[2] - r[0] + marginM;
    const h = r[3] - r[1] + marginM;
    const aspect = size.w / size.h;
    const inset = getTopInset();
    const usable = Math.max(0.3, (size.h - inset - bottomInset) / size.h);
    const zoom = Math.min((2 * TOP_HALF_HEIGHT * aspect) / w, (2 * TOP_HALF_HEIGHT * usable) / h);
    topCamera.zoom = Math.max(topControls.minZoom, Math.min(topControls.maxZoom, zoom));
    // pasek u góry zasłania część ekranu – środek kadru przesuwamy tak, żeby dom był wyśrodkowany pod paskiem
    setTopTarget((r[0] + r[2]) / 2, (r[1] + r[3]) / 2 + topShift());
    topCamera.updateProjectionMatrix();
  }

  /** O ile metrów środek WIDOCZNEJ części rzutu (pod paskiem górnym) leży poniżej środka kadru. */
  const topShift = () => ((getTopInset() / 2) / size.h) * ((2 * TOP_HALF_HEIGHT) / topCamera.zoom);

  function setTopTarget(x, y) {
    toWorld(x, y, 0, topControls.target);
    toWorld(x, y, TOP_CAMERA_Y, topCamera.position);
    topControls.update();
  }

  function resetOrbit() {
    const z = levelBaseZ();
    const aspect = size.w / size.h;
    const dist = 24 / Math.pow(Math.min(1, aspect), 0.75);
    toWorld(center.x, center.y, z + 1, orbitControls.target);
    // widok od frontu i szczytu salonu, z góry
    const dir = new Vector3(0.52, 0.6, 0.6).normalize();
    orbitCamera.position.copy(orbitControls.target).addScaledVector(dir, dist);
    orbitControls.update();
  }

  const levelBaseZ = () => {
    const id = store.getState().levelId;
    return id === 'all' ? lower.floorLevel : concreteLevel(id).floorLevel;
  };

  // ------------------------------------------------------------ widoczność
  function applyVisibility() {
    const { viewMode, levelId, showRoof } = store.getState();
    const dollhouse = viewMode === 'orbit' && !showRoof;
    const upperHidden = dollhouse && levelId === lower.id; // parter jako domek dla lalek: całe poddasze znika
    const capLevel = upperHidden ? lower.id : upper.id;

    // W rzucie wszystko ponad płaszczyzną cięcia jest ukryte (nie tylko odcinane we fragment shaderze):
    // dach, sufity, a przy oglądaniu parteru także strop i całe poddasze. Strop zostaje w rzucie poddasza –
    // przez otwór klatki widać jego lico.
    const top = viewMode === 'top';
    const aboveHidden = upperHidden || (top && levelId === lower.id);
    const ceilingsHidden = (L) => top || (dollhouse && (upperHidden || L === upper.id));

    for (const mesh of built.group.children) {
      const { part, levelId: L, cap, upperStart, headerStart } = mesh.userData;
      let visible = true;
      if (top) {
        if (part === 'roof' || part === 'ceiling') visible = false;
        if (aboveHidden && (L === upper.id || part === 'slab')) visible = false;
        if (part === 'cap') visible = cap === 'section' && L === levelId;
      } else if (viewMode === 'walk') {
        if (part === 'cap') visible = false;
      } else if (part === 'cap') {
        visible = dollhouse && cap === 'top' && L === capLevel;
      } else if (dollhouse) {
        if (part === 'roof') visible = false;
        if (upperHidden) {
          if (L === upper.id || part === 'slab' || part === 'ceiling') visible = false;
        } else if (part === 'ceiling' && L === upper.id) visible = false;
      }
      mesh.visible = visible;
      // Ściany rysowane częściowo (kolejność w siatce: mur, pasy podciągów, część ponad stropem – patrz interior.js):
      // pasy podciągów nad otwartymi przejściami znikają razem z sufitami, część ponad stropem – razem z poddaszem.
      if (upperStart != null || headerStart != null) {
        let count = Infinity;
        if (upperStart != null && aboveHidden) count = upperStart;
        if (headerStart != null && ceilingsHidden(L)) count = headerStart;
        mesh.geometry.setDrawRange(0, count);
      }
    }
    // meble: w rzucie tylko z oglądanej kondygnacji (nie są przycinane), w domku dla lalek znikają z ukrytym poddaszem
    for (const [id, group] of furnitureGroups) group.visible = viewMode === 'top' ? id === levelId : !(upperHidden && id === upper.id);

    clipPlanes.length = 0;
    if (viewMode === 'top') {
      clipWorldY = concreteLevel(levelId).floorLevel + SECTION_HEIGHT;
      clipPlane.constant = clipWorldY;
      clipPlanes.push(clipPlane);
    } else clipWorldY = null;
  }

  function syncControls() {
    topControls.enabled = controlsEnabled && mode === 'top';
    orbitControls.enabled = controlsEnabled && mode === 'orbit';
    walk.setEnabled(mode === 'walk');
    walk.setPaused(!controlsEnabled); // wstrzymanie na czas przeciągania – trzymany joystick / klawisz działa dalej po puszczeniu
  }

  /** Punkt, na który patrzy użytkownik (układ domu) – do wyboru startu spaceru i świateł wieczornych. */
  function focus() {
    if (mode === 'walk') {
      const p = walk.getPosition();
      return { x: p.x, y: p.y, levelId: collision.levelIdAtHeight(p.z) };
    }
    const t = toHouse(mode === 'top' ? topControls.target : orbitControls.target);
    const id = store.getState().levelId;
    // w rzucie liczy się środek tego, co widać pod paskiem górnym, a nie środek całego kadru
    return { x: t.x, y: mode === 'top' ? t.y - topShift() : t.y, levelId: id === 'all' ? lower.id : id };
  }

  function largestRoom(level) {
    let best = level.rooms[0];
    let bestArea = 0;
    for (const r of level.rooms) {
      const b = polygonBBox(r.polygon);
      const a = (b[2] - b[0]) * (b[3] - b[1]);
      if (a > bestArea) [best, bestArea] = [r, a];
    }
    return best;
  }

  function enterWalk(previousFocus) {
    const level = concreteLevel(store.getState().levelId);
    const here = walk.getPosition();
    const focusRoomId = previousFocus ? collision.pointInRoom(level.id, previousFocus.x, previousFocus.y) : null;
    if (walked && collision.levelIdAtHeight(here.z) === level.id) {
      // Wracamy tam, gdzie spacer się skończył – chyba że widok z góry / orbita patrzy już na inne pomieszczenie
      // (przesunięcie rzutu, "Skocz do pomieszczenia"): wtedy spacer zaczyna się w nim, tak jak przy pierwszym wejściu.
      const near = previousFocus && Math.hypot(previousFocus.x - here.x, previousFocus.y - here.y) < WALK_RETURN_RADIUS;
      if (!focusRoomId || near || focusRoomId === collision.pointInRoom(level.id, here.x, here.y)) {
        walk.teleport({ ...here });
        return;
      }
    }
    const roomId = focusRoomId || largestRoom(level).id;
    const spot = collision.roomSpot(level.id, roomId) || collision.roomSpot(level.id, largestRoom(level).id);
    const heading = (Math.atan2(center.y - spot.y, center.x - spot.x) * 180) / Math.PI;
    walk.teleport({ ...spot, headingDeg: heading });
    walked = true;
  }

  /** Dopasowuje wszystko do stanu aplikacji. Wołane po każdej zmianie levelId / viewMode / showRoof. */
  function apply(prev = null) {
    const state = store.getState(); // ('all' poza orbitą nie wystąpi – pilnuje tego store w app.js)
    const previousMode = mode;
    const previousFocus = previousMode ? focus() : null;
    mode = state.viewMode;

    if (mode !== previousMode) {
      if (mode === 'walk') enterWalk(previousFocus);
      else if (previousMode === 'walk' && previousFocus) {
        // po spacerze widok z góry / orbita centruje się tam, gdzie stała postać
        if (mode === 'top') setTopTarget(previousFocus.x, previousFocus.y + topShift());
        else moveOrbitTarget(previousFocus.x, previousFocus.y, levelBaseZ() + 1);
      }
    } else if (prev && prev.levelId !== state.levelId) {
      if (mode === 'orbit') {
        const t = toHouse(orbitControls.target);
        moveOrbitTarget(t.x, t.y, levelBaseZ() + 1);
      } else if (mode === 'walk') {
        // kondygnację zmieniono przyciskiem (nie schodami): przeniesienie na miejsce przy schodach
        const here = walk.getPosition();
        if (collision.levelIdAtHeight(here.z) !== state.levelId || Math.abs(here.z - concreteLevel(state.levelId).floorLevel) > 0.01) {
          const spot = collision.stairsSpot(state.levelId) || collision.roomSpot(state.levelId, largestRoom(concreteLevel(state.levelId)).id);
          walk.teleport({ x: spot.x, y: spot.y, z: spot.z, headingDeg: spot.headingDeg });
        }
      }
    }
    syncControls();
    applyVisibility();
    loop.requestRender();
  }

  function moveOrbitTarget(x, y, z) {
    const next = toWorld(x, y, z);
    const delta = next.clone().sub(orbitControls.target);
    orbitControls.target.copy(next);
    orbitCamera.position.add(delta);
    orbitControls.update();
  }

  /** Centruje widok na pomieszczeniu (top / orbit) albo przenosi do jego środka (walk). */
  function focusRoom(levelId, roomId) {
    const level = concreteLevel(levelId);
    const room = level.rooms.find((r) => r.id === roomId);
    if (!room) return false;
    const b = polygonBBox(room.polygon);
    const spot = collision.roomSpot(level.id, roomId) || { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, z: level.floorLevel };
    if (mode === 'walk') {
      const heading = (Math.atan2((b[1] + b[3]) / 2 - spot.y, (b[0] + b[2]) / 2 - spot.x) * 180) / Math.PI;
      walk.teleport({ ...spot, headingDeg: Math.hypot((b[0] + b[2]) / 2 - spot.x, (b[1] + b[3]) / 2 - spot.y) > 0.3 ? heading : undefined });
      walked = true;
    } else if (mode === 'top') {
      fitTop(b, 3.5);
    } else {
      const cx = (b[0] + b[2]) / 2;
      const cy = (b[1] + b[3]) / 2;
      const span = Math.max(b[2] - b[0], b[3] - b[1]);
      const next = toWorld(cx, cy, level.floorLevel + 1);
      const dir = orbitCamera.position.clone().sub(orbitControls.target).normalize();
      if (dir.y < 0.45) dir.setY(0.45).normalize(); // z góry, żeby zajrzeć do środka
      const aspect = size.w / size.h;
      orbitControls.target.copy(next);
      orbitCamera.position.copy(next).addScaledVector(dir, Math.max(6, span * 1.9) / Math.pow(Math.min(1, aspect), 0.6));
      orbitControls.update();
    }
    loop.requestRender();
    return true;
  }

  function resize(w, h) {
    size = { w, h };
    const aspect = w / h;
    topCamera.left = -TOP_HALF_HEIGHT * aspect;
    topCamera.right = TOP_HALF_HEIGHT * aspect;
    topCamera.updateProjectionMatrix();
    orbitCamera.aspect = aspect;
    // na wąskim ekranie szerszy kąt, żeby dom mieścił się w kadrze
    orbitCamera.fov = aspect < 1 ? 55 : 45;
    orbitCamera.updateProjectionMatrix();
    walk.setAspect(aspect);
    applyViewOffset();
  }

  /**
   * Arkusz panelu zasłania dół ekranu: obraz rzutu i orbity przesuwamy w górę o połowę zasłoniętej wysokości,
   * więc to, na co patrzy kamera, wypada pośrodku WIDOCZNEJ części. Robi to przesunięcie okna projekcji
   * (setViewOffset) – kamera i jej cel zostają w miejscu, a promienie wskazywania liczą się z tej samej macierzy,
   * więc dotknięcia trafiają tam, gdzie widać. Spacer zostaje bez zmian (postać patrzy przed siebie).
   */
  function applyViewOffset() {
    const dy = Math.round(bottomInset / 2);
    for (const camera of [topCamera, orbitCamera]) {
      if (dy > 0) camera.setViewOffset(size.w, size.h, 0, dy, size.w, size.h);
      else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    }
  }

  return {
    apply,
    resize,
    focusRoom,
    focus,
    /** Pierwsze kadrowanie po poznaniu rozmiaru ekranu. */
    frameAll() {
      fitTop();
      resetOrbit();
    },
    get camera() {
      return mode === 'top' ? topCamera : mode === 'walk' ? walk.camera : orbitCamera;
    },
    get clipWorldY() {
      return clipWorldY;
    },
    /** Wspólna tablica płaszczyzn cięcia (pusta poza widokiem z góry). */
    clipPlanes,
    /** Podpina materiał pod przekrój widoku z góry. */
    clipMaterial,
    setControlsEnabled(v) {
      controlsEnabled = v;
      syncControls();
    },
    /** Wysokość (px) dołu ekranu zasłoniętego przez arkusz panelu; 0 = nic nie zasłania. */
    setBottomInset(px) {
      const next = Math.max(0, Math.min(Number(px) || 0, size.h * 0.6)); // panel nie zajmuje więcej niż ok. pół ekranu
      if (next === bottomInset) return;
      bottomInset = next;
      applyViewOffset();
      loop.requestRender();
    },
    get bottomInset() {
      return bottomInset;
    },
    walk,
    topControls,
    orbitControls,
  };
}

// Rdzeń aplikacji: składa scenę, widoki, interfejs i daje funkcjom (src/features/*) stabilne API.
//
// ======================================================================================
//  API DLA FUNKCJI – obiekt `app` przekazywany do init(app) każdej funkcji
// ======================================================================================
//
// Układ współrzędnych "domu" (jak w house.json): metry, x w prawo, y w górę arkusza, z w górę od posadzki parteru.
// Wszystko, co funkcja dodaje do app.houseGroup / app.furnitureGroup(), podaje współrzędne w tym układzie.
//
/**
 * @typedef {Object} Surface  Powierzchnia edytowalna (ściana, podłoga, sufit, skos, komin).
 * @property {string} id         surfaceId, np. 'parter:0/3:wall:2', 'poddasze:1/7:slope-S', 'parter:0/6:floor'
 * @property {'wall'|'floor'|'ceiling'|'slope'|'chimney'} kind
 * @property {string} levelId    'parter' | 'poddasze'
 * @property {string} roomId     np. '0/3'
 * @property {import('three').Mesh} mesh   jedna siatka z WŁASNYM materiałem; UV w metrach:
 *                               ściany/kominy: u = wzdłuż ściany od lewego końca (patrząc z pomieszczenia), v = wysokość nad posadzką;
 *                               podłogi/sufity: u = x, v = y domu; skosy: u = x, v = długość po skosie od ścianki kolankowej
 * @property {number} widthM     szerokość (ściana: długość krawędzi; podłoga/sufit: wymiar w x)
 * @property {number} heightM    wysokość (ściana: największa; podłoga/sufit: wymiar w y; skos: długość po skosie)
 * @property {number} areaM2     rzeczywiste pole (po odjęciu otworów)
 * @property {string} label      np. '0/3 Łazienka – ściana 2'
 * @property {import('three').Material} defaultMaterial
 */
/**
 * @typedef {Object} DragInfo
 * @property {'start'|'move'|'end'} type
 * @property {PointerEvent} event
 * @property {string} levelId                    kondygnacja, na której posadzce liczony jest punkt
 * @property {?{x:number,y:number,z:number}} point   punkt na płaszczyźnie posadzki (układ domu)
 * @property {?import('three').Object3D} object  (tylko start) trafiony obiekt z userData.pickable
 * @property {?string} surfaceId                 (tylko start) trafiona powierzchnia
 * @property {(levelId: string) => ?{x:number,y:number,z:number}} floorPoint  punkt na posadzce innej kondygnacji
 */
/**
 * @typedef {Object} App
 * @property {Object} house            zawartość house.json (tylko do odczytu!)
 * @property {Object} design           zawartość design.json (tylko do odczytu!): OPCJE BRYŁY – decyzje aranżacyjne właściciela,
 *           które zmieniają bryłę względem projektu (house.json zostaje wierny projektowi). Pusty obiekt = dokładnie projekt.
 *           Każda opcja ma pole `note` (założenie do uzgodnienia z projektantem / konstruktorem). Dziś:
 *             design.stairs.groundFloorBalustrade = 'slats' – zamiast balustrady biegu dolnego czarne pionowe lamele
 *               od stopnic do spodu stropu (design.stairs.slats: profile, clearGap, color); siatka stała 'parter:stairs:slat'.
 *               Z design.stairs.slats.continuous = true lamele są CIĄGŁE przez obie kondygnacje: w duszy między biegami
 *               od stopnic biegu dolnego do sufitu poddasza, a na krawędziach otworu klatki na poddaszu od posadzki do sufitu
 *               – zamiast wszystkich balustrad ('poddasze:stairs:balustrade' znika, dochodzi 'poddasze:stairs:slat';
 *               część lameli do posadzki poddasza należy do parteru). Wejście na schody i wyjście na korytarz poddasza
 *               zostają wolne. Kolizje w rzucie jak w projekcie, tylko osłona między biegami leży w linii lameli (y = 5,83).
 *               Z design.stairs.slats.atticHeight = 'handrail' lamele na poddaszu nie idą do sufitu: są ucięte na wysokości
 *               balustrady z projektu (0,90 m) i zakończone poręczą – poziomą na krawędziach otworu, pochyłą w duszy wzdłuż
 *               biegu górnego (poręcze są w siatce 'poddasze:stairs:slat'); rzut i kolizje bez zmian;
 *             design.stairs.treads = { tread, riser } – stopnice drewniane i jasne podstopnice (siatki stałe
 *               'parter:stairs:stairTread' / 'stairTreadAlt' / 'stairRiser' zamiast 'stairs' / 'stairsAlt');
 *             design.openCeiling.rooms = ['1/9', …] – w tych pomieszczeniach poddasza nie ma sufitu płaskiego:
 *               NIE MA powierzchni '…:ceiling', a skosy '…:slope-S' / '…:slope-N' biegną do kalenicy (pomieszczenie
 *               sięgające za kalenicę ma oba); ściany sięgają do skosu; pod sufitem są stałe belki
 *               (design.openCeiling.beams: jętki i płatwie, siatka 'poddasze:ceiling:beam').
 *               W domku dla lalek i w rzucie część ścian ponad dawnym sufitem (2,55 m) i belki znikają razem z sufitami
 *               (mesh.userData.headerStart – ten sam mechanizm co pasy podciągów).
 *             design.doors.sliding = [{ id, level, side, slide, travel? }] – te drzwi wewnętrzne są PRZESUWNE („barn”):
 *               bez ościeżnicy i skrzydła rozwiernego, z gładkimi ościeżami; drewniane skrzydło (siatka '<kondygnacja>:joinery:barnDoor')
 *               wisi na czarnej szynie ('…:joinery:barnRail') po stronie pomieszczenia `side` i odsuwa się w kierunku `slide`
 *               ('+x' | '-x' | '+y' | '-y'); narysowane częściowo odsunięte (design.doors.leaf.open). Przejście w spacerze jak dotąd.
 *               Dziś: DP1 i DP2 (sypialnia 1/9 → łazienka 1/10 i garderoba 1/11, skrzydła po stronie sypialni) oraz
 *               DW4 (kuchnia 0/5 → spiżarnia 0/4, skrzydło po stronie kuchni). MEBLE: przy ścianie musi zostać wolny tor
 *               skrzydła – prostokąty podaje app.collision.slidingDoors(levelId)[i].keepClear (tor + 5 cm; 12,5 cm od ściany).
 *             design.extraRoofWindows.windows = [{ id, room, slope, x }] – dodatkowe okna połaciowe (dziś 78 × 118 w pokojach
 *               1/4, 1/5, 1/8), budowane dokładnie jak roofWindows z house.json: otwór w połaci i w okładzinie skosu, rama,
 *               szyba, szpalet. Identyfikatory powierzchni bez zmian – maleje tylko pole skosu ('poddasze:1/4:slope-N',
 *               'poddasze:1/5:slope-S', 'poddasze:1/8:slope-S'). app.house.levels[…].roofWindows dalej zawiera TYLKO okna
 *               z projektu; komplet z dodatkowymi daje extraRoofWindows(house, design) / withDesign() z geometry/design.js.
 *               design.extraRoofWindows.rafters – rozstaw krokwi przepisany z rysunku więźby (tylko do kontroli położenia okien).
 *           Lista powierzchni (app.surfaces) zależy więc od design – wykończenia zapisuj tylko dla istniejących surfaceId.
 * @property {{getState: () => import('./store.js').AppState, setState: Function, subscribe: Function}} store
 *           pola stanu: levelId ('parter' | 'poddasze' | 'all'), viewMode ('top' | 'orbit' | 'walk'), showRoof, lighting, selection, activeTool, variant
 * @property {typeof import('three')} three     przestrzeń nazw THREE (ta sama instancja co w rdzeniu)
 * @property {import('three').Scene} scene
 * @property {import('three').Camera} camera    AKTUALNA kamera (zależy od trybu widoku – pobieraj za każdym razem)
 * @property {import('three').Group} houseGroup grupa w układzie domu (dodawaj tu własne obiekty pomocnicze)
 * @property {() => void} requestRender         poproś o narysowanie klatki (renderowanie jest "na żądanie")
 * @property {(fn: (dt: number) => boolean) => (() => void)} addUpdater  funkcja wołana przed każdą klatką; true = rysuj dalej (animacja)
 *
 * @property {Map<string, Surface>} surfaces    wszystkie powierzchnie edytowalne
 * @property {(id: string) => (Surface|undefined)} getSurface
 * @property {(levelId: string, roomId: string) => Surface[]} surfacesOfRoom
 * @property {(surfaceId: string, material: import('three').Material) => boolean} setSurfaceMaterial
 *           podmienia materiał powierzchni (także tablicę materiałów) i podpina go pod przekrój widoku z góry
 *           (ustawia material.clippingPlanes); ukrywanie kondygnacji działa na siatce, więc bez zmian.
 *           Nie zwalnia poprzedniego materiału – robi to ten, kto go utworzył. Siatka nie ma grup geometrii.
 *           UWAGA dla funkcji, która podmienia mesh.geometry (np. cięcie ściany na dwie części): rdzeń ukrywa końcówki
 *           niektórych ścian przez mesh.geometry.setDrawRange(0, userData.headerStart | upperStart) w numeracji wierzchołków
 *           siatki ŹRÓDŁOWEJ (viewManager.applyVisibility). Nowa geometria musi sama przetłumaczyć te granice
 *           – wzór: klasa SplitGeometry w features/finishes/apply.js.
 * @property {import('three').Plane[]} clippingPlanes   wspólna tablica płaszczyzn przekroju (pusta poza widokiem z góry);
 *           przypisz ją do material.clippingPlanes własnego obiektu, jeśli ma być przycinany razem ze ścianami.
 *           Meble i inne obiekty funkcji domyślnie NIE są przycinane – w rzucie widać je całe.
 * @property {(surfaceId: string) => boolean} resetSurfaceMaterial   przywraca materiał domyślny
 *
 * @property {{on: (name: string, fn: Function) => (() => void), off: Function, emit: Function}} events
 *   zdarzenia rdzenia:
 *     'surface:tap'  { surfaceId, kind, levelId, roomId, point: {x,y,z} (układ domu), event, selection }
 *     'floor:tap'    to samo, dodatkowo gdy trafiono podłogę
 *     'object:tap'   { object (najbliższy przodek z userData.pickable), mesh, point, event, selection }  – np. meble
 *     'background:tap' { event, selection }      – dotknięcie poza powierzchniami edytowalnymi
 *       selection = store.selection z CHWILI dotknięcia (zanim którakolwiek funkcja na nie zareagowała).
 *     'level:change' { levelId, previous }
 *     'view:change'  { viewMode, previous, showRoof }
 *     'variant:change' { variant, previous }
 *     'lighting:change' { lighting }
 *   Funkcje mogą emitować własne zdarzenia z prefiksem swojej nazwy. Dziś:
 *     'finishes:select' / 'finishes:deselect' { surfaceId }   (wykończenia ustawiają też store.selection = { surfaceId })
 *     'furniture:select' { id | null }                        (meble ustawiają store.selection = { objectId })
 *     'variants:list' / 'variants:save' { activeId, variants, savedAt, status }
 *
 *   UZGODNIENIE DOTKNIĘĆ MIĘDZY FUNKCJAMI (dotknięcie dostają wszystkie funkcje naraz):
 *     - dotknięcie mebla → tylko 'object:tap' (rdzeń nie emituje wtedy 'surface:tap' ściany za meblem);
 *     - dotknięcie powierzchni, gdy zaznaczony jest mebel (payload.selection.objectId) → tylko odznacza mebel,
 *       panel wykończeń się NIE otwiera; dopiero kolejne dotknięcie wybiera powierzchnię;
 *     - store.activeTool ≠ null → narzędzie innej funkcji przejęło dotknięcia powierzchni (np. 'furniture' przy otwartym
 *       katalogu mebli: dotknięcie podłogi wskazuje miejsce na mebel) i wykończenia je pomijają.
 *       Funkcja ustawia activeTool na swoją nazwę i ZAWSZE zeruje, gdy kończy (zamknięcie jej panelu).
 *
 * @property {(levelId: string) => import('three').Group} furnitureGroup
 *           grupa w układzie domu z początkiem (0, 0) na POSADZCE kondygnacji (z = 0 to posadzka); ukrywana razem z kondygnacją.
 *           Obiekt klikalny: ustaw userData.pickable = true na jego korzeniu.
 * @property {{openPanel: Function, closePanel: Function, addToolbarButton: Function, toast: Function}} ui
 *           openPanel({ title, content: HTMLElement, onClose, className? }) → { close, setTitle, element }; jeden panel naraz
 *             (otwarcie kolejnego zamyka poprzedni i woła jego onClose); className = klasy dokładane do panelu, póki jest otwarty.
 *             Na telefonie panel to arkusz dolny o wysokości najwyżej połowy ekranu, przewijany w środku.
 *           addToolbarButton({ id, label, icon (kod SVG), onClick }) → { element, setActive, setLabel(podpis, opis?), remove }
 *             na wąskim ekranie przycisk z ikoną pokazuje samą ikonę (podpis zostaje w aria-label / title)
 *           toast(tekst)
 * @property {{setDragHandler: (handler: ?Object) => void, hitTest: Function, floorPoint: Function}} picking
 *           setDragHandler({ onStart(info) → true żeby przejąć, onMove(info), onEnd(info) → true = bez tapnięcia, levelId? } | null)
 *           – po przejęciu sterowanie kamerą jest wyłączone do puszczenia wskaźnika; info: patrz DragInfo.
 *           Gniazdo jest jedno (używają go meble, gdy mebel jest zaznaczony). Po geście bez ruchu rdzeń emituje zwykłe
 *           tapnięcie, chyba że onEnd zwróci true.
 * @property {{walls: (levelId: string) => Array<{rect: number[], kind: string, id: string}>,
 *             pointInRoom: (levelId: string, x: number, y: number) => ?string,
 *             roomPolygon: (levelId: string, roomId: string) => ?number[][],
 *             ceilingAt: (levelId: string, x: number, y: number) => ?number,
 *             slidingDoors: (levelId: string) => Array<{id: string, roomId: string, keepClear: number[], leafRect: number[], trackRect: number[], clearWidth: number}>}} collision
 *           walls: prostokąty [x0, y0, x1, y1] blokujące ruch (mury bez świateł drzwi, kominy, balustrady / lamele)
 *           slidingDoors: drzwi przesuwne kondygnacji z design.doors.sliding (pusta lista bez tej opcji); keepClear = prostokąt
 *             [x0, y0, x1, y1] w pomieszczeniu roomId, który musi zostać wolny od mebli (cały tor skrzydła + 5 cm),
 *             leafRect = rzut narysowanego skrzydła, trackRect = rzut toru, clearWidth = światło przejścia po odsunięciu.
 *             Skrzydło NIE jest w walls() – meble same muszą omijać keepClear.
 *           ceilingAt: wysokość pomieszczenia nad posadzką w punkcie (sufit płaski, skos albo – w pomieszczeniu
 *             z design.openCeiling – okładzina skosu do kalenicy); przydatne do sprawdzania, czy mebel mieści się pod skosem
 * @property {{get: () => import('./variant.js').Variant, update: (mutator: (draft: Object) => void) => void, set: (v: Object) => void}} variant
 *           update(mutator) pracuje na kopii i emituje 'variant:change'. Mutator zmienia draft w miejscu; może też zwrócić
 *           NOWY wariant (obiekt z polami finishes i furniture) – każda inna zwrócona wartość jest ignorowana
 *           (np. liczba z draft.furniture.push(x) w funkcji strzałkowej bez klamer). Trwałość: funkcja variants.
 * @property {(roomId: string, levelId?: string) => boolean} focusRoom   "skocz do pomieszczenia"
 * @property {() => {x: number, y: number, levelId: string}} viewFocus
 *           punkt posadzki (układ domu), na który patrzy użytkownik: środek WIDOCZNEJ części ekranu (pod paskiem górnym,
 *           nad arkuszem panelu) w rzucie i orbicie, położenie postaci w spacerze
 * @property {Object<string, Object>} [features]   wyniki init() funkcji: features.variants / finishes / furniture (ustawia main.js;
 *           wygoda dla innych funkcji i konsoli, np. app.features.variants.exportData('active'))
 * @property {(levelId?: string) => Array<{id: string, name: string, levelId: string, polygon: number[][], areaM2: number}>} rooms
 */
import * as THREE from 'three';
import { roomArea } from '../../tools/geometry.mjs';
import { createStore, createEmitter } from './store.js';
import { createEmptyVariant, cloneVariant } from './variant.js';
import { buildHouse } from '../geometry/buildHouse.js';
import { buildCollision } from '../geometry/collision.js';
import { ceilingAt } from '../geometry/levelModel.js';
import { createRenderer, createLoop, applyPixelRatio } from '../render/renderer.js';
import { createScene } from '../render/scene.js';
import { createLights, MAX_ROOM_LIGHTS } from '../render/lights.js';
import { createViewManager } from '../controls/viewManager.js';
import { createPicking } from '../controls/picking.js';
import { createUI } from '../ui/index.js';

/** Stan początkowy: parter jako domek dla lalek w orbicie – od razu widać wnętrza. */
const INITIAL_STATE = { levelId: 'parter', viewMode: 'orbit', showRoof: false, lighting: 'day', selection: null, activeTool: null };

/**
 * @param {{house: Object, design?: Object, container: HTMLElement, canvas: HTMLCanvasElement, uiRoot: HTMLElement}} options
 *        design – opcje bryły z design.json; pominięte = bryła dokładnie z projektu
 * @returns {App & {start: () => void}}
 */
export function createApp({ house, design = {}, container, canvas, uiRoot }) {
  const firstLevel = house.levels[0].id;
  let lastConcreteLevel = firstLevel;

  const store = createStore(
    { ...INITIAL_STATE, variant: createEmptyVariant() },
    // 'Cały dom' ma sens tylko w orbicie – w pozostałych trybach wraca ostatnio wybrana kondygnacja
    (next) => {
      if (next.levelId !== 'all') lastConcreteLevel = next.levelId;
      return next.viewMode !== 'orbit' && next.levelId === 'all' ? { ...next, levelId: lastConcreteLevel } : next;
    }
  );
  const events = createEmitter();

  // ---------------------------------------------------------------- scena i geometria
  const { scene, houseGroup } = createScene();
  const built = buildHouse(house, design);
  houseGroup.add(built.group);
  const collision = buildCollision(house, design);

  const furnitureGroups = new Map();
  for (const level of house.levels) {
    const g = new THREE.Group();
    g.name = `meble:${level.id}`;
    g.position.z = level.floorLevel; // z = 0 w grupie to posadzka kondygnacji
    g.userData = { levelId: level.id, part: 'furniture' };
    houseGroup.add(g);
    furnitureGroups.set(level.id, g);
  }

  const renderer = createRenderer(canvas);
  const lights = createLights(scene, house);
  let views = null;
  const loop = createLoop(() => renderer.render(scene, views.camera));

  // ---------------------------------------------------------------- interfejs i widoki
  const ui = createUI(uiRoot, {
    house, store,
    onFocusRoom: (levelId, roomId) => focusRoom(roomId, levelId),
    onJoystick: (x, y) => views.walk.setJoystick(x, y),
    // arkusz panelu na telefonie zasłania dół ekranu – rzut i orbita przesuwają obraz nad niego
    onBottomInset: (px) => views?.setBottomInset(px),
  });

  views = createViewManager({
    renderer, canvas, house, built, store, collision, loop, furnitureGroups,
    getTopInset: () => ui.topInset,
  });

  const picking = createPicking({
    container, canvas, houseGroup, house, store, events,
    getCamera: () => views.camera,
    getClipWorldY: () => views.clipWorldY,
    setControlsEnabled: (v) => views.setControlsEnabled(v),
    requestRender: loop.requestRender,
  });

  // ---------------------------------------------------------------- światło wieczorne
  const lightSpots = new Map(); // `${levelId}:${roomId}` → {x, y, z} pod sufitem
  function lightSpot(level, room) {
    const key = `${level.id}:${room.id}`;
    if (!lightSpots.has(key)) {
      const p = collision.roomSpot(level.id, room.id);
      lightSpots.set(key, p ? { x: p.x, y: p.y, z: level.floorLevel + ceilingAt(level, p.y) - 0.35 } : null);
    }
    return lightSpots.get(key);
  }
  let lightKey = '';
  function updateRoomLights() {
    if (store.getState().lighting !== 'evening') return;
    const f = views.focus();
    const level = house.levels.find((l) => l.id === f.levelId) || house.levels[0];
    const spots = level.rooms
      .map((room) => lightSpot(level, room))
      .filter(Boolean)
      .sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))
      .slice(0, MAX_ROOM_LIGHTS);
    const key = spots.map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)},${s.z.toFixed(1)}`).join('|');
    if (key === lightKey) return;
    lightKey = key;
    lights.setRoomLights(spots);
    loop.requestRender();
  }
  views.topControls.addEventListener('end', updateRoomLights);
  views.orbitControls.addEventListener('end', updateRoomLights);
  let lightTimer = 0;
  loop.addUpdater((dt) => {
    // w spacerze lampy podążają za postacią (sprawdzane co pół sekundy)
    if (store.getState().viewMode !== 'walk' || store.getState().lighting !== 'evening') return false;
    lightTimer += dt;
    if (lightTimer > 0.5) {
      lightTimer = 0;
      updateRoomLights();
    }
    return false;
  });

  // ---------------------------------------------------------------- reakcje na zmianę stanu
  store.subscribe((state, prev, changed) => {
    const has = (k) => changed.includes(k);
    if (has('levelId') || has('viewMode') || has('showRoof')) {
      views.apply(prev);
      lightKey = '';
      updateRoomLights();
    }
    if (has('lighting')) {
      lights.setMode(state.lighting);
      lightKey = '';
      updateRoomLights();
      events.emit('lighting:change', { lighting: state.lighting });
    }
    if (has('levelId')) events.emit('level:change', { levelId: state.levelId, previous: prev.levelId });
    if (has('viewMode') || has('showRoof')) events.emit('view:change', { viewMode: state.viewMode, previous: prev.viewMode, showRoof: state.showRoof });
    if (has('variant')) events.emit('variant:change', { variant: state.variant, previous: prev.variant });
    loop.requestRender();
  });

  // ---------------------------------------------------------------- rozmiar ekranu
  let framed = false;
  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    applyPixelRatio(renderer);
    renderer.setSize(w, h, false);
    views.resize(w, h);
    document.documentElement.style.setProperty('--topbar-h', `${Math.round(ui.topInset)}px`);
    // Pierwsze kadrowanie dopiero przy sensownym rozmiarze – strona wczytana w ukrytym panelu / karcie w tle
    // ma przez chwilę 1 px wysokości i kadr liczony z takiego rozmiaru wyrzucał rzut daleko poza dom.
    if (!framed && w >= 50 && h >= 50) {
      views.frameAll();
      framed = true;
    }
    loop.requestRender();
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(container);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  // utrata kontekstu WebGL (telefon w tle): po odzyskaniu rysujemy od nowa
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => loop.requestRender());

  // ---------------------------------------------------------------- API
  function focusRoom(roomId, levelId) {
    const state = store.getState();
    let level = house.levels.find((l) => l.id === (levelId || state.levelId));
    if (!level || !level.rooms.some((r) => r.id === roomId)) level = house.levels.find((l) => l.rooms.some((r) => r.id === roomId));
    if (!level) return false;
    if (state.levelId !== level.id && !(state.levelId === 'all' && state.viewMode === 'orbit')) store.setState({ levelId: level.id });
    const ok = views.focusRoom(level.id, roomId);
    lightKey = '';
    updateRoomLights();
    return ok;
  }

  /** Punkt posadzki pośrodku widocznej części widoku (patrz JSDoc API). */
  function viewFocus() {
    const f = views.focus();
    if (store.getState().viewMode === 'walk') return f;
    const h = Math.max(1, container.clientHeight);
    const p = picking.floorPointAtNdc(0, (views.bottomInset - ui.topInset) / h, f.levelId);
    // promień prawie poziomy trafia w posadzkę daleko poza domem – wtedy lepszy jest cel kamery
    return p && Math.hypot(p.x - f.x, p.y - f.y) < 40 ? { x: p.x, y: p.y, levelId: f.levelId } : f;
  }

  function rooms(levelId) {
    const levels = !levelId || levelId === 'all' ? house.levels : house.levels.filter((l) => l.id === levelId);
    return levels.flatMap((level) =>
      level.rooms.map((r) => ({ id: r.id, name: r.name, levelId: level.id, polygon: r.polygon, areaM2: roomArea(level, r) }))
    );
  }

  const app = {
    house,
    design,
    store,
    three: THREE,
    scene,
    houseGroup,
    renderer,
    lights,
    get camera() {
      return views.camera;
    },
    requestRender: loop.requestRender,
    addUpdater: loop.addUpdater,

    surfaces: built.surfaces,
    getSurface: (id) => built.surfaces.get(id),
    surfacesOfRoom: (levelId, roomId) => [...built.surfaces.values()].filter((s) => s.levelId === levelId && s.roomId === roomId),
    setSurfaceMaterial(surfaceId, material) {
      const s = built.surfaces.get(surfaceId);
      if (!s || !material) return false;
      views.clipMaterial(material); // przekrój w widoku z góry działa też na nowym materiale
      s.mesh.material = material;
      loop.requestRender();
      return true;
    },
    get clippingPlanes() {
      return views.clipPlanes;
    },
    resetSurfaceMaterial(surfaceId) {
      const s = built.surfaces.get(surfaceId);
      if (!s) return false;
      s.mesh.material = s.defaultMaterial;
      loop.requestRender();
      return true;
    },

    events,
    furnitureGroup(levelId) {
      const g = furnitureGroups.get(levelId);
      if (!g) throw new Error(`Nie ma kondygnacji "${levelId}"`);
      return g;
    },
    ui: { openPanel: ui.openPanel, closePanel: ui.closePanel, addToolbarButton: ui.addToolbarButton, toast: ui.toast },
    picking: { setDragHandler: picking.setDragHandler, hitTest: picking.hitTest, floorPoint: picking.floorPoint },
    collision: {
      walls: collision.walls, pointInRoom: collision.pointInRoom, roomPolygon: collision.roomPolygon,
      ceilingAt: collision.ceilingAt, slidingDoors: collision.slidingDoors,
    },
    variant: {
      get: () => store.getState().variant,
      update(mutator) {
        const draft = cloneVariant(store.getState().variant);
        const returned = mutator(draft);
        // zwrócona wartość zastępuje draft tylko wtedy, gdy wygląda jak wariant (a nie np. wynik Array.push)
        const isVariant = returned && typeof returned === 'object' && Array.isArray(returned.furniture) && returned.finishes && typeof returned.finishes === 'object';
        store.setState({ variant: isVariant ? returned : draft });
      },
      set: (variant) => store.setState({ variant }),
    },
    focusRoom,
    viewFocus,
    rooms,

    // --- do diagnostyki i testów ręcznych (nie jest częścią stabilnego API)
    internals: { built, views, picking, collision, loop },

    /** Pierwsze narysowanie – wołane po init() wszystkich funkcji. */
    start() {
      resize();
      views.apply(null);
      lights.setMode(store.getState().lighting);
      loop.requestRender();
    },
  };
  return app;
}

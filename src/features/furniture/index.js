// Funkcja MEBLE: katalog, dodawanie, zaznaczanie, przeciąganie po podłodze, obrót, wymiary, kolor, usuwanie.
//
// Podział:
//   catalog.js   – dane: typy mebli i opis ich brył (tu dopisuje się nowe meble),
//   starter.js   – meble narysowane w projekcie (dla pierwszego wariantu),
//   placement.js – czysta geometria: kolizje ze ścianami, ślizganie, przyciąganie,
//   model.js     – bryły Three.js z opisu z katalogu,
//   scene.js     – synchronizacja wariant → obiekty w scenie, ramka zaznaczenia,
//   panel.js     – zawartość paneli (katalog, edycja),
//   index.js     – ten plik: spina zdarzenia rdzenia z powyższymi.
//
// Jedyne źródło prawdy to wariant (app.variant.get().furniture). Każda zmiana idzie przez app.variant.update,
// a scena odtwarza się z wariantu po zdarzeniu 'variant:change'. Wyjątek: w trakcie przeciągania obiekt jest
// przestawiany bezpośrednio (podgląd), a zapis do wariantu następuje raz, po puszczeniu palca.
// Zaznaczenie nie jest częścią wariantu (store.selection = { objectId }).
import './furniture.css';
import { getType, typeOf, clampSize, clamp, MOUNT_RANGE } from './catalog.js';
import {
  moveItem, snapToWalls, faceWall, touchesRoom, findFreeSpot, collides, withHouseBounds, houseBounds, clampToRect, stairBlockers, round4, normalizeRot,
} from './placement.js';
import { createFurnitureScene } from './scene.js';
import { createCatalogContent, createEditContent, icons } from './panel.js';

const DRAG_START_PX = 6; // dopiero taki ruch palca zaczyna przesuwanie (zwykłe dotknięcie nie rusza mebla)
const DRAG_MARGIN = 1; // m – cel przeciągania nie wychodzi dalej poza obrys domu (dalej i tak stoją "mury" graniczne)

/** @param {import('../../app/app.js').App} app */
export function init(app) {
  const { store, events } = app;
  const THREE = app.three;
  const scene = createFurnitureScene(app);
  const levelIds = app.house.levels.map((l) => l.id);

  let selectedId = null;
  let drag = null; // { id, levelId, pose, offX, offY, startX, startY, active, moved }
  let lastFloorTap = null; // { levelId, x, y } – podpowiedź, gdzie postawić nowy mebel

  // ---------------------------------------------------------------- dane pomocnicze
  const furniture = () => app.variant.get()?.furniture || [];
  const findItem = (id) => furniture().find((f) => f.id === id) || null;
  const selectedItem = () => (selectedId ? findItem(selectedId) : null);

  const blockerCache = new Map();
  /** Kondygnacja, na której posadzce stoją schody (biegi zajmują tam podłogę). */
  const stairsLevelId = app.house.levels.find((l) => l.stairs)?.id;
  /** Ściany kondygnacji + rzuty biegów schodów + granice domu (prostokąty osiowe). */
  function blockers(levelId) {
    if (!blockerCache.has(levelId)) {
      const level = app.house.levels.find((l) => l.id === levelId);
      const stairs = level && level.id === stairsLevelId ? stairBlockers(level.stairs) : [];
      blockerCache.set(levelId, withHouseBounds([...app.collision.walls(levelId), ...stairs]));
    }
    return blockerCache.get(levelId);
  }
  const boundsCache = new Map();
  /** Obrys domu na kondygnacji [x0, y0, x1, y1] albo null. */
  function boundsOf(levelId) {
    if (!boundsCache.has(levelId)) boundsCache.set(levelId, houseBounds(blockers(levelId)));
    return boundsCache.get(levelId);
  }
  const roomAt = (levelId) => (x, y) => app.collision.pointInRoom(levelId, x, y);
  /** Czy mebel w tej pozie stoi poprawnie: poza murami i choć częściowo w pomieszczeniu. */
  const isValidPose = (levelId, pose) => !collides(pose, blockers(levelId)) && touchesRoom(pose, roomAt(levelId));

  const newId = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  /** Zapisuje zmianę jednego mebla do wariantu. */
  function patchItem(id, patch) {
    app.variant.update((draft) => {
      const item = (draft.furniture || []).find((f) => f.id === id);
      if (item) Object.assign(item, patch);
    });
  }
  const posePatch = (pose) => ({ x: round4(pose.x), y: round4(pose.y), rot: normalizeRot(Math.round(pose.rot * 100) / 100) });

  // ---------------------------------------------------------------- gdzie postawić nowy mebel
  const currentLevelId = () => {
    const id = store.getState().levelId;
    return levelIds.includes(id) ? id : levelIds[0];
  };
  const levelName = (levelId) => app.house.levels.find((l) => l.id === levelId)?.name || levelId;
  const floorLevelOf = (levelId) => app.house.levels.find((l) => l.id === levelId)?.floorLevel || 0;

  /** Punkt, na który patrzy użytkownik: { levelId, x, y } w układzie domu. */
  function viewAnchor() {
    const camera = app.camera;
    camera.updateMatrixWorld();
    app.houseGroup.updateMatrixWorld();
    const toHouse = (v) => app.houseGroup.worldToLocal(v.clone());
    const pos = toHouse(camera.getWorldPosition(new THREE.Vector3()));
    const dirWorld = camera.getWorldDirection(new THREE.Vector3());
    const dir = toHouse(camera.getWorldPosition(new THREE.Vector3()).add(dirWorld)).sub(pos);

    if (store.getState().viewMode === 'walk') {
      // spacer: 1,5 m przed postacią, na kondygnacji, na której stoi (oczy są ponad posadzką)
      let levelId = levelIds[0];
      for (const level of app.house.levels) if (pos.z > level.floorLevel + 0.3) levelId = level.id;
      const len = Math.hypot(dir.x, dir.y) || 1;
      return { levelId, x: pos.x + (dir.x / len) * 1.5, y: pos.y + (dir.y / len) * 1.5 };
    }
    // rdzeń zna środek WIDOCZNEJ części widoku (pod paskiem górnym, nad arkuszem panelu)
    if (typeof app.viewFocus === 'function') {
      const f = app.viewFocus();
      if (f && Number.isFinite(f.x) && Number.isFinite(f.y)) return { levelId: levelIds.includes(f.levelId) ? f.levelId : currentLevelId(), x: f.x, y: f.y };
    }
    const levelId = currentLevelId();
    const floorZ = floorLevelOf(levelId);
    if (dir.z < -1e-6) {
      // promień ze środka ekranu przecięty z posadzką
      const t = (floorZ - pos.z) / dir.z;
      if (t > 0 && t < 500) return { levelId, x: pos.x + dir.x * t, y: pos.y + dir.y * t };
    }
    return null;
  }

  /** Czy punkt posadzki widać teraz na ekranie. */
  function isOnScreen(levelId, x, y) {
    const camera = app.camera;
    camera.updateMatrixWorld();
    app.houseGroup.updateMatrixWorld();
    const v = app.houseGroup.localToWorld(new THREE.Vector3(x, y, floorLevelOf(levelId))).project(camera);
    return Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 && v.z < 1;
  }

  /** Miejsce dla nowego mebla: ostatnio dotknięta podłoga (jeśli wciąż ją widać), inaczej środek widoku. */
  function placementAnchor() {
    const view = viewAnchor();
    const levelId = view?.levelId || currentLevelId();
    if (lastFloorTap && lastFloorTap.levelId === levelId && isOnScreen(levelId, lastFloorTap.x, lastFloorTap.y)) return { ...lastFloorTap };
    if (view) return view;
    // awaryjnie: środek pierwszego pomieszczenia kondygnacji
    const room = app.rooms(levelId)[0];
    const xs = room.polygon.map((p) => p[0]);
    const ys = room.polygon.map((p) => p[1]);
    return { levelId, x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }

  /** Najbliższe wolne miejsce dla mebla w okolicy punktu (nie na środku innego mebla – żeby nie stały jeden w drugim). */
  function freeSpot(levelId, pose, ignoreId = null) {
    const others = furniture().filter((f) => f.levelId === levelId && f.id !== ignoreId);
    const notStacked = (c) => others.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > 0.15);
    const inRoom = (c) => Boolean(roomAt(levelId)(c.x, c.y));
    const valid = (c) => !collides(c, blockers(levelId)) && touchesRoom(c, roomAt(levelId));
    // najpierw miejsce ze środkiem w pomieszczeniu i nie na innym meblu, potem łagodniej
    return findFreeSpot(pose, (c) => valid(c) && inRoom(c) && notStacked(c)) || findFreeSpot(pose, (c) => valid(c) && inRoom(c)) || findFreeSpot(pose, valid);
  }

  // ---------------------------------------------------------------- panele
  let panelKind = null; // 'catalog' | 'edit' | null
  let panelHandle = null;
  let panelToken = 0;
  let toolbarButton = null;

  /**
   * Otwarty katalog = narzędzie mebli "ma" dotknięcia powierzchni (store.activeTool): dotknięcie podłogi wskazuje
   * miejsce na nowy mebel i nie otwiera panelu wykończeń. Poza katalogiem oddajemy dotknięcia (activeTool = null).
   */
  function syncTool() {
    const current = store.getState().activeTool;
    if (panelKind === 'catalog') {
      if (current !== 'furniture') store.setState({ activeTool: 'furniture' });
    } else if (current === 'furniture') store.setState({ activeTool: null });
  }

  function showPanel(kind, title, content) {
    const token = ++panelToken; // onClose poprzedniego panelu (wołany przez openPanel) zobaczy stary żeton i nic nie zrobi
    panelKind = kind;
    panelHandle = app.ui.openPanel({
      title,
      content,
      // panel edycji jest niski – na telefonie nie zasłania modelu (klasa z furniture.css)
      className: kind === 'edit' ? 'meb-panel-compact' : '',
      onClose: () => {
        if (token !== panelToken) return;
        const closed = panelKind;
        panelKind = null;
        panelHandle = null;
        toolbarButton?.setActive(false);
        syncTool();
        if (closed === 'edit') select(null); // zamknięcie panelu edycji (X albo inny panel) odznacza mebel
      },
    });
    toolbarButton?.setActive(true);
    syncTool();
  }

  function hidePanel() {
    if (!panelHandle) return;
    panelToken += 1;
    panelKind = null;
    panelHandle = null;
    toolbarButton?.setActive(false);
    syncTool();
    app.ui.closePanel();
  }

  function openCatalog() {
    select(null);
    showPanel('catalog', 'Meble – katalog', createCatalogContent({ onAdd: (typeId) => add(typeId) }));
  }

  const edit = createEditContent({
    onRotate: (deg) => rotate(deg),
    onFaceWall: () => backToWall(),
    onDuplicate: () => duplicate(),
    onMoveHere: () => moveHere(),
    onDelete: () => remove(),
    onColor: (hex) => setColor(hex),
    onSize: (size) => setSize(size),
    onMount: (z) => setMount(z),
  });

  function refreshEditPanel() {
    const item = selectedItem();
    if (!item) return;
    const type = typeOf(item);
    edit.update(item, type);
    if (panelKind === 'edit') panelHandle?.setTitle?.(type.name);
    else showPanel('edit', type.name, edit.element);
  }

  // ---------------------------------------------------------------- zaznaczenie
  function select(id) {
    const next = id && findItem(id) ? id : null;
    if (next === selectedId) {
      if (next) refreshEditPanel();
      return;
    }
    const previous = selectedId;
    selectedId = next;
    drag = null;
    scene.setSelected(next);
    // przeciąganie przejmujemy tylko wtedy, gdy coś jest zaznaczone (inaczej palec zawsze steruje kamerą)
    app.picking.setDragHandler(next ? dragHandler : null);
    const sel = store.getState().selection;
    if (next) store.setState({ selection: { objectId: next } });
    else if (sel && sel.objectId === previous) store.setState({ selection: null });
    if (next) refreshEditPanel();
    else if (panelKind === 'edit') hidePanel();
    events.emit('furniture:select', { id: next });
    app.requestRender();
  }

  // ---------------------------------------------------------------- działania na zaznaczonym meblu
  function add(typeId, at = null) {
    const type = getType(typeId);
    if (!type) return null;
    const anchor = at || placementAnchor();
    const base = { x: anchor.x, y: anchor.y, rot: 0, ...type.size };
    const spot = freeSpot(anchor.levelId, base);
    if (!spot) {
      app.ui.toast('Nie ma tu miejsca na ten mebel – przesuń widok na wolną podłogę.');
      return null;
    }
    const item = {
      id: newId(), type: type.id, levelId: anchor.levelId,
      ...posePatch(spot), w: type.size.w, d: type.size.d, h: type.size.h, color: type.color,
      ...(type.mount !== undefined ? { z: type.mount } : {}), // meble wiszące: wysokość spodu nad posadzką
    };
    lastFloorTap = null; // podpowiedź zużyta – kolejny mebel stanie na środku widoku
    app.variant.update((draft) => {
      draft.furniture = draft.furniture || [];
      draft.furniture.push(item);
    });
    select(item.id);
    return item.id;
  }

  function rotate(deg) {
    const item = selectedItem();
    if (!item) return false;
    const walls = blockers(item.levelId);
    const res = moveItem(item, { ...item, rot: (item.rot || 0) + deg }, walls);
    if (res.blocked || !touchesRoom(res, roomAt(item.levelId))) {
      app.ui.toast('Za mało miejsca na obrót – odsuń mebel od ścian.');
      return false;
    }
    patchItem(item.id, posePatch(res));
    return true;
  }

  function backToWall() {
    const item = selectedItem();
    if (!item) return false;
    const res = faceWall(item, blockers(item.levelId));
    if (!res || !touchesRoom(res, roomAt(item.levelId))) {
      app.ui.toast('Nie udało się dosunąć mebla do ściany.');
      return false;
    }
    patchItem(item.id, posePatch(res));
    return true;
  }

  function setSize(size) {
    const item = selectedItem();
    if (!item) return false;
    const type = typeOf(item);
    const next = clampSize(type, { w: item.w, d: item.d, h: item.h, ...size });
    const clamped = ['w', 'd', 'h'].some((k) => size[k] !== undefined && Math.abs(size[k] - next[k]) > 5e-4);
    const res = moveItem(item, { ...item, w: next.w, d: next.d }, blockers(item.levelId));
    if (res.blocked) {
      app.ui.toast('Mebel w tym wymiarze nie mieści się między ścianami.');
      edit.update(item, type); // przywróć poprzednie liczby w polach
      return false;
    }
    if (clamped) app.ui.toast(`Dozwolony zakres: ${['w', 'd', 'h'].filter((k) => size[k] !== undefined).map((k) => `${Math.round(type.range[k][0] * 100)}–${Math.round(type.range[k][1] * 100)} cm`).join(', ')}`);
    patchItem(item.id, { ...posePatch(res), w: next.w, d: next.d, h: next.h });
    if (clamped) refreshEditPanel(); // w polu zostało wpisane coś spoza zakresu
    return true;
  }

  function setMount(z) {
    const item = selectedItem();
    if (!item || !Number.isFinite(z)) return false;
    patchItem(item.id, { z: Math.round(clamp(z, MOUNT_RANGE) * 1000) / 1000 });
    refreshEditPanel();
    return true;
  }

  function setColor(hex) {
    const item = selectedItem();
    if (!item || !/^#[0-9a-f]{6}$/i.test(hex)) return false;
    patchItem(item.id, { color: hex.toLowerCase() });
    return true;
  }

  function duplicate() {
    const item = selectedItem();
    if (!item) return null;
    const spot = freeSpot(item.levelId, { ...item, x: item.x + 0.3, y: item.y - 0.3 });
    if (!spot) {
      app.ui.toast('Nie ma miejsca na kopię mebla.');
      return null;
    }
    const copy = { ...item, id: newId(), ...posePatch(spot) };
    // uwaga: mutator nie może niczego zwracać – rdzeń potraktowałby zwróconą wartość jako nowy wariant
    app.variant.update((draft) => {
      draft.furniture.push(copy);
    });
    select(copy.id);
    return copy.id;
  }

  /**
   * Przenosi zaznaczony mebel na środek oglądanego widoku – także do innego pomieszczenia albo na inną kondygnację
   * (zaznaczenie i panel edycji zostają po przełączeniu kondygnacji; przy "Cały dom" celem jest parter).
   */
  function moveHere() {
    const item = selectedItem();
    if (!item) return false;
    const anchor = viewAnchor() || placementAnchor();
    const spot = freeSpot(anchor.levelId, { ...item, x: anchor.x, y: anchor.y }, item.id);
    if (!spot) {
      app.ui.toast('Nie ma tu miejsca na ten mebel.');
      return false;
    }
    patchItem(item.id, { ...posePatch(spot), levelId: anchor.levelId });
    return true;
  }

  function remove(id = selectedId) {
    if (!id || !findItem(id)) return false;
    if (id === selectedId) select(null);
    app.variant.update((draft) => {
      draft.furniture = draft.furniture.filter((f) => f.id !== id);
    });
    return true;
  }

  // ---------------------------------------------------------------- przeciąganie po podłodze
  // Rdzeń (picking.js) pyta onStart przy każdym dotknięciu canvasu; true = przejmujemy gest (kamera stoi).
  const dragHandler = {
    onStart(info) {
      if (store.getState().viewMode === 'walk') return false; // w spacerze tylko zaznaczanie i panel
      const item = selectedItem();
      if (!item || !info.object || info.object.userData.furnitureId !== item.id) return false;
      const p = info.floorPoint(item.levelId); // punkt na posadzce kondygnacji MEBLA (nie tej z przełącznika)
      if (!p) return false;
      drag = {
        id: item.id, levelId: item.levelId,
        pose: { x: item.x, y: item.y, rot: item.rot || 0, w: item.w, d: item.d },
        offX: item.x - p.x, offY: item.y - p.y, // chwyt: mebel nie "wskakuje" środkiem pod palec
        startX: info.event.clientX, startY: info.event.clientY,
        active: false, moved: false,
      };
      return true;
    },
    onMove(info) {
      if (!drag) return;
      if (!drag.active) {
        if (Math.hypot(info.event.clientX - drag.startX, info.event.clientY - drag.startY) < DRAG_START_PX) return;
        drag.active = true;
      }
      const p = info.floorPoint(drag.levelId);
      if (!p) return;
      const walls = blockers(drag.levelId);
      // W orbicie palec blisko horyzontu wskazuje "posadzkę" setki metrów od domu – cel przycinamy do obrysu domu
      // (+ margines): droga ma wtedy najwyżej kilkanaście metrów, więc ruch liczy się szybko i krokami po 4 cm.
      let target = { x: p.x + drag.offX, y: p.y + drag.offY };
      if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
      const bounds = boundsOf(drag.levelId);
      if (bounds) target = clampToRect(target.x, target.y, bounds, DRAG_MARGIN);
      // 1) ruch małymi krokami z wypychaniem ze ścian (zatrzymanie / ślizganie), 2) dociągnięcie do bliskiego lica
      const moved = moveItem(drag.pose, { ...drag.pose, ...target }, walls);
      const snapped = snapToWalls(moved, walls);
      if (!touchesRoom(snapped, roomAt(drag.levelId))) return; // nie wolno wyjść całkiem poza pomieszczenia
      drag.pose = snapped;
      drag.moved = true;
      scene.preview(drag.id, snapped); // bez zapisu do wariantu – ten nastąpi w onEnd
    },
    onEnd() {
      const d = drag;
      drag = null;
      if (!d) return false;
      if (d.moved && findItem(d.id)) patchItem(d.id, posePatch(d.pose));
      // true = gest zużyty: po przeciągnięciu (nawet o kilka pikseli) rdzeń nie emituje tapnięcia – inaczej
      // puszczenie palca nad ścianą odznaczałoby dopiero co przesunięty mebel
      return d.active;
    },
  };

  // ---------------------------------------------------------------- zdarzenia rdzenia
  events.on('variant:change', ({ variant }) => {
    drag = null; // wariant zmienił się pod palcem (np. import) – przerwij podgląd
    scene.sync(variant?.furniture);
    if (selectedId && !findItem(selectedId)) select(null);
    else if (selectedId) {
      scene.setSelected(selectedId); // ramka dopasowana do nowych wymiarów
      refreshEditPanel();
    }
  });

  events.on('object:tap', ({ object }) => {
    const id = object?.userData?.furnitureId;
    if (id) select(id);
  });
  events.on('background:tap', () => select(null));
  events.on('surface:tap', () => select(null)); // dotknięcie ściany / podłogi obok mebla też go odznacza
  events.on('floor:tap', ({ levelId, point }) => {
    if (!point) return;
    lastFloorTap = { levelId, x: point.x, y: point.y };
    if (panelKind === 'catalog') app.ui.toast('Nowy mebel stanie w dotkniętym miejscu – wybierz go z katalogu.');
  });
  events.on('level:change', ({ levelId }) => {
    lastFloorTap = null;
    // Zaznaczenie ZOSTAJE także wtedy, gdy mebel jest na innej kondygnacji: panel edycji z przyciskiem
    // „Przenieś tu” to jedyna droga, żeby palcem przenieść mebel między kondygnacjami.
    const item = selectedItem();
    if (item && levelIds.includes(levelId) && item.levelId !== levelId && store.getState().viewMode !== 'walk') {
      app.ui.toast(`Zaznaczony mebel został na kondygnacji „${levelName(item.levelId)}” – „Przenieś tu” przeniesie go na oglądaną.`);
    }
  });

  // inna funkcja zaznaczyła coś swojego (np. ścianę) – nasz mebel przestaje być zaznaczony
  store.subscribe((state, prev, changed) => {
    if (selectedId && changed.includes('selection') && state.selection?.objectId !== selectedId) select(null);
  });

  toolbarButton = app.ui.addToolbarButton({
    id: 'furniture',
    label: 'Meble',
    icon: icons.furniture,
    onClick: () => (panelKind === 'catalog' ? hidePanel() : openCatalog()),
  });

  // stan początkowy: wariant mógł zostać wczytany, zanim ta funkcja wystartowała
  scene.sync(furniture());

  // API funkcji (dla testów i ewentualnych innych funkcji) – wszystko działa na zaznaczonym meblu
  return {
    add, select, remove, rotate, backToWall, setSize, setMount, setColor, duplicate, moveHere, openCatalog,
    get selectedId() {
      return selectedId;
    },
    scene,
    dragHandler,
  };
}

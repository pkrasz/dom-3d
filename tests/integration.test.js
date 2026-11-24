// @vitest-environment happy-dom
// Test integracyjny: prawdziwy rdzeń (renderer WebGL podmieniony atrapą – jak w app.test.js) + trzy funkcje naraz,
// w tej samej kolejności co w main.js: warianty → wykończenia → meble.
// Sprawdza to, czego nie widać w testach pojedynczych funkcji: odtwarzanie sceny po podmianie całego wariantu,
// eksport / import, ponowny start z zapisanego stanu oraz podział dotknięć między funkcje (jeden panel naraz).
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Vector3 } from 'three';
import { createStarterFurniture } from '../src/features/furniture/starter.js';
import { STORAGE_KEY } from '../src/features/variants/storage.js';

vi.mock('../src/render/renderer.js', async (original) => ({
  ...(await original()),
  createRenderer: () => ({
    clippingPlanes: [],
    localClippingEnabled: false,
    shadowMap: { enabled: false },
    setPixelRatio() {},
    setSize() {},
    render(scene, camera) {
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
    },
  }),
}));

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const house = JSON.parse(readFileSync(join(root, 'house.json'), 'utf8'));
const W = 800;
const H = 600;
const frame = () => new Promise((resolve) => setTimeout(resolve, 40));

const WALL = 'parter:0/3:wall:2';
const FLOOR = 'parter:0/6:floor';
const PAINT = { kind: 'paint', color: '#aa3322' };

/** Atrapa localStorage (wspólna dla "pierwszego uruchomienia" i "ponownego otwarcia strony"). */
function fakeStorage() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function pointer(type, x, y, extra = {}) {
  const Ctor = window.PointerEvent || window.MouseEvent;
  const e = new Ctor(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra });
  for (const [k, v] of Object.entries({ pointerId: 1, pointerType: 'mouse', ...extra })) {
    if (e[k] !== v) Object.defineProperty(e, k, { value: v });
  }
  return e;
}

/** Składa aplikację z trzema funkcjami we własnym kontenerze (można złożyć kilka – np. "po odświeżeniu strony"). */
async function boot(storage) {
  const container = document.createElement('div');
  container.innerHTML = '<canvas></canvas><div class="ui-root"></div>';
  document.body.append(container);
  const canvas = container.querySelector('canvas');
  const uiRoot = container.querySelector('.ui-root');
  Object.defineProperty(container, 'clientWidth', { value: W });
  Object.defineProperty(container, 'clientHeight', { value: H });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H });
  canvas.setPointerCapture ??= () => {};
  canvas.releasePointerCapture ??= () => {};

  const { createApp } = await import('../src/app/app.js');
  const { init: initVariants } = await import('../src/features/variants/index.js');
  const { init: initFinishes } = await import('../src/features/finishes/index.js');
  const { init: initFurniture } = await import('../src/features/furniture/index.js');

  const app = createApp({ house, container, canvas, uiRoot });
  let n = 0;
  const downloads = [];
  // kolejność jak w main.js
  const variants = initVariants(app, { storage, makeId: () => `test-${++n}`, download: (filename, text) => downloads.push({ filename, text }) });
  const finishes = initFinishes(app);
  const furniture = initFurniture(app);
  app.start();
  await frame();

  const screenOf = (x, y, levelId, dz = 0) => {
    const level = house.levels.find((l) => l.id === levelId);
    app.houseGroup.updateMatrixWorld();
    app.camera.updateMatrixWorld();
    const v = app.houseGroup.localToWorld(new Vector3(x, y, level.floorLevel + dz)).project(app.camera);
    return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
  };
  return {
    app, canvas, uiRoot, variants, finishes, furniture, downloads, screenOf,
    tapAt(x, y, extra) {
      canvas.dispatchEvent(pointer('pointerdown', x, y, extra));
      window.dispatchEvent(pointer('pointerup', x, y, extra));
    },
    panel: () => uiRoot.querySelector('.panel'),
    panelTitle: () => uiRoot.querySelector('.panel__title').textContent,
    panelOpen: () => uiRoot.querySelector('.panel').classList.contains('is-open'),
    sceneIds: () => house.levels.flatMap((l) => app.furnitureGroup(l.id).children.map((c) => c.userData.furnitureId).filter(Boolean)).sort(),
    isDefault: (surfaceId) => {
      const s = app.getSurface(surfaceId);
      return s.mesh.material === s.defaultMaterial;
    },
  };
}

const starterIds = () => createStarterFurniture().map((f) => f.id).sort();
const withoutIds = (v) => ({ finishes: v.finishes, furniture: v.furniture, customMaterials: v.customMaterials });

let t; // aplikacja pod testem
let storage;

beforeAll(async () => {
  storage = fakeStorage();
  t = await boot(storage);
});

describe('integracja – start i warianty', () => {
  let firstId;
  let sofaId;

  it('wariant startowy ma meble z projektu i widać je w scenie', () => {
    const v = t.app.variant.get();
    firstId = v.id;
    expect(v.name).toBe('Wariant 1');
    expect(v.finishes).toEqual({});
    expect(v.furniture).toEqual(createStarterFurniture()); // starter przechodzi przez walidację wariantów bez zmian
    expect(v.furniture.length).toBeGreaterThan(0);
    expect(t.sceneIds()).toEqual(starterIds());
    expect(t.isDefault(WALL)).toBe(true);
  });

  it('wszystkie trzy funkcje dodały się do paska; przyciski mają aria-label (na telefonie to same ikony)', () => {
    const buttons = [...t.uiRoot.querySelectorAll('.topbar .btn--action')];
    expect(buttons.map((b) => b.dataset.id)).toEqual(['rooms', 'roof', 'light', 'variants', 'furniture']);
    for (const b of buttons) {
      expect(b.getAttribute('aria-label')).toBeTruthy();
      expect(b.querySelector('.ico svg')).toBeTruthy(); // jest ikona – podpis można ukryć
    }
    expect(t.uiRoot.querySelector('[data-id="variants"]').getAttribute('aria-label')).toBe('Warianty – aktywny: Wariant 1');
  });

  it('ustawienie wykończenia ściany zmienia materiał powierzchni', () => {
    t.app.variant.update((draft) => {
      draft.finishes[WALL] = { ...PAINT };
    });
    const s = t.app.getSurface(WALL);
    expect(s.mesh.material).not.toBe(s.defaultMaterial);
    expect(`#${s.mesh.material.color.getHexString()}`).toBe(PAINT.color);
  });

  it('mutator zwracający przypadkową wartość (wynik push) nie podmienia wariantu', () => {
    const before = t.app.variant.get();
    t.app.variant.update((draft) => draft.furniture.push({ id: 'tmp', type: 'sofa-3', levelId: 'parter', x: 11.2, y: 6, rot: 0, w: 2, d: 0.9, h: 0.8, color: '#777777' }));
    const after = t.app.variant.get();
    expect(typeof after).toBe('object');
    expect(after.id).toBe(before.id);
    expect(after.furniture.length).toBe(before.furniture.length + 1);
    t.app.variant.update((draft) => {
      draft.furniture = draft.furniture.filter((f) => f.id !== 'tmp');
    });
    expect(t.sceneIds()).toEqual(starterIds());
  });

  it('przełączenie na nowy pusty wariant przywraca domyślne materiały i usuwa dodane meble ze sceny', () => {
    sofaId = t.furniture.add('sofa-3', { levelId: 'parter', x: 11.2, y: 6 });
    expect(sofaId).toBeTruthy();
    expect(t.sceneIds()).toContain(sofaId);
    expect(t.furniture.selectedId).toBe(sofaId);

    const made = t.variants.createFromProject();
    expect(made.ok).toBe(true);
    const v = t.app.variant.get();
    expect(v.id).not.toBe(firstId);
    expect(v.finishes).toEqual({});
    expect(t.isDefault(WALL)).toBe(true);
    expect(t.sceneIds()).toEqual(starterIds()); // sofa z pierwszego wariantu zniknęła, meble z projektu zostały
    // zaznaczony mebel nie istnieje w nowym wariancie: zaznaczenie i panel edycji znikają
    expect(t.furniture.selectedId).toBeNull();
    expect(t.app.store.getState().selection).toBeNull();
    expect(t.panelOpen()).toBe(false);

    // wariant całkiem bez mebli → pusta scena
    t.app.variant.update((draft) => {
      draft.furniture = [];
    });
    expect(t.sceneIds()).toEqual([]);
  });

  it('powrót do pierwszego wariantu odtwarza wykończenie i meble', () => {
    expect(t.variants.switchTo(firstId)).toBe(true);
    expect(t.app.variant.get().id).toBe(firstId);
    expect(t.isDefault(WALL)).toBe(false);
    expect(`#${t.app.getSurface(WALL).mesh.material.color.getHexString()}`).toBe(PAINT.color);
    expect(t.sceneIds()).toEqual([...starterIds(), sofaId].sort());
    expect(t.variants.getState().variants.length).toBe(2);
  });

  it('eksport → import daje ten sam stan (nowy wariant, te same wykończenia i meble, ta sama scena)', () => {
    const original = t.app.variant.get();
    const file = t.variants.exportData('active');
    expect(file.count).toBe(1);
    expect(file.filename).toMatch(/^dom-.*\.json$/);

    // między eksportem a importem scena jest inna (pusty wariant)
    t.variants.createFromProject();
    expect(t.isDefault(WALL)).toBe(true);

    const result = t.variants.importText(file.text);
    expect(result.ok).toBe(true);
    const imported = t.app.variant.get();
    expect(imported.id).not.toBe(original.id); // kolizja id → nowy id, oryginał zostaje na liście
    expect(withoutIds(imported)).toEqual(withoutIds(original));
    expect(t.isDefault(WALL)).toBe(false);
    expect(`#${t.app.getSurface(WALL).mesh.material.color.getHexString()}`).toBe(PAINT.color);
    expect(t.sceneIds()).toEqual([...starterIds(), sofaId].sort());
    expect(t.variants.getState().variants.some((v) => v.id === original.id)).toBe(true);

    expect(t.variants.switchTo(firstId)).toBe(true); // dalsze testy pracują na pierwszym wariancie
  });

  it('po ponownym otwarciu strony scena odtwarza się z zapisanego stanu (funkcje startują po wariantach)', async () => {
    t.variants.flush();
    const saved = JSON.parse(storage.data.get(STORAGE_KEY));
    expect(saved.activeId).toBe(firstId);

    const second = await boot(storage);
    expect(second.app.variant.get().id).toBe(firstId);
    expect(second.isDefault(WALL)).toBe(false);
    expect(second.sceneIds()).toEqual([...starterIds(), sofaId].sort());
    expect(second.variants.getState().variants.length).toBe(t.variants.getState().variants.length);
    second.variants.destroy(); // koniec autozapisu drugiej instancji
  });
});

describe('integracja – podział dotknięć między funkcje', () => {
  const taps = [];
  let sofa;
  let floorSpot; // wolny punkt podłogi salonu w pikselach ekranu

  beforeAll(async () => {
    t.app.store.setState({ viewMode: 'top', levelId: 'parter' });
    await frame();
    for (const name of ['surface:tap', 'object:tap', 'background:tap']) t.app.events.on(name, (e) => taps.push([name, e]));
    sofa = t.app.variant.get().furniture.find((f) => f.type === 'sofa-3');
    // wolna podłoga tego samego pomieszczenia co sofa, z dala od niej
    const roomId = t.app.collision.pointInRoom('parter', sofa.x, sofa.y);
    const spot = [[sofa.x, sofa.y + 2], [sofa.x, sofa.y - 2], [sofa.x + 2, sofa.y], [sofa.x - 2, sofa.y]]
      .find(([x, y]) => t.app.collision.pointInRoom('parter', x, y) === roomId);
    floorSpot = t.screenOf(spot[0], spot[1], 'parter');
    t.furniture.select(null);
    t.app.ui.closePanel();
  });

  const sofaOnScreen = () => {
    const s = t.app.variant.get().furniture.find((f) => f.id === sofa.id);
    return t.screenOf(s.x, s.y, 'parter', s.h);
  };

  it('dotknięcie mebla zaznacza mebel i NIE otwiera panelu podłogi pod nim', () => {
    taps.length = 0;
    t.tapAt(...sofaOnScreen());
    expect(taps.map((x) => x[0])).toEqual(['object:tap']);
    expect(t.furniture.selectedId).toBe(sofa.id);
    expect(t.finishes.panel.isOpen).toBe(false);
    expect(t.app.store.getState().selection).toEqual({ objectId: sofa.id });
    expect(t.panel().classList.contains('meb-panel-compact')).toBe(true);
  });

  it('dotknięcie podłogi przy zaznaczonym meblu tylko go odznacza; dopiero kolejne otwiera wykończenia', () => {
    taps.length = 0;
    t.tapAt(...floorSpot);
    expect(taps.map((x) => x[0])).toEqual(['surface:tap']);
    expect(taps[0][1].selection).toEqual({ objectId: sofa.id }); // zaznaczenie z chwili dotknięcia
    expect(t.furniture.selectedId).toBeNull();
    expect(t.finishes.panel.isOpen).toBe(false);
    expect(t.panelOpen()).toBe(false);
    expect(t.app.store.getState().selection).toBeNull();
    expect(t.panel().classList.contains('meb-panel-compact')).toBe(false); // klasa panelu edycji nie zostaje po zamknięciu

    t.tapAt(...floorSpot);
    expect(t.finishes.panel.isOpen).toBe(true);
    expect(t.finishes.panel.surfaceId).toBe(taps[1][1].surfaceId);
    expect(t.app.store.getState().selection).toEqual({ surfaceId: taps[1][1].surfaceId });
  });

  it('jeden panel naraz: mebel zamyka wykończenia, warianty zamykają edycję mebla i odznaczają mebel', () => {
    expect(t.finishes.panel.isOpen).toBe(true);
    t.tapAt(...sofaOnScreen());
    expect(t.finishes.panel.isOpen).toBe(false);
    expect(t.furniture.selectedId).toBe(sofa.id);
    expect(t.app.store.getState().selection).toEqual({ objectId: sofa.id });

    t.uiRoot.querySelector('[data-id="variants"]').click();
    expect(t.panelTitle()).toBe('Warianty');
    expect(t.furniture.selectedId).toBeNull();
    expect(t.app.store.getState().selection).toBeNull();
    expect(t.panel().classList.contains('meb-panel-compact')).toBe(false);

    t.uiRoot.querySelector('[data-id="variants"]').click(); // drugi klik zamyka
    expect(t.panelOpen()).toBe(false);
  });

  it('otwarty katalog mebli przejmuje dotknięcia podłogi (activeTool) – panel wykończeń się nie otwiera', () => {
    t.uiRoot.querySelector('[data-id="furniture"]').click();
    expect(t.panelTitle()).toBe('Meble – katalog');
    expect(t.app.store.getState().activeTool).toBe('furniture');

    t.tapAt(...floorSpot);
    expect(t.finishes.panel.isOpen).toBe(false);
    expect(t.panelTitle()).toBe('Meble – katalog');

    // mebel dodany z katalogu staje w dotkniętym miejscu
    const before = new Set(t.app.variant.get().furniture.map((f) => f.id));
    t.uiRoot.querySelector('.panel .meb-item').click();
    const added = t.app.variant.get().furniture.find((f) => !before.has(f.id));
    expect(added).toBeTruthy();
    expect(t.furniture.selectedId).toBe(added.id);
    expect(t.app.store.getState().activeTool).toBeNull(); // katalog zamknięty → dotknięcia wracają do wykończeń
    t.furniture.remove(added.id);

    // zamknięcie katalogu krzyżykiem też oddaje dotknięcia
    t.furniture.openCatalog();
    expect(t.app.store.getState().activeTool).toBe('furniture');
    t.app.ui.closePanel();
    expect(t.app.store.getState().activeTool).toBeNull();
    t.tapAt(...floorSpot);
    expect(t.finishes.panel.isOpen).toBe(true);
    t.app.ui.closePanel();
  });

  it('krótkie przeciągnięcie mebla palcem przesuwa go i nie kończy się tapnięciem', () => {
    t.furniture.select(sofa.id);
    const [x, y] = sofaOnScreen();
    const before = { ...t.app.variant.get().furniture.find((f) => f.id === sofa.id) };
    const touch = { pointerType: 'touch', pointerId: 7 };
    taps.length = 0;
    t.canvas.dispatchEvent(pointer('pointerdown', x, y, touch));
    window.dispatchEvent(pointer('pointermove', x + 9, y, touch)); // 9 px: ponad próg przeciągania (6), poniżej progu tapnięcia (12)
    window.dispatchEvent(pointer('pointerup', x + 9, y, touch));
    const after = t.app.variant.get().furniture.find((f) => f.id === sofa.id);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.01);
    expect(taps).toEqual([]);
    expect(t.furniture.selectedId).toBe(sofa.id);
    expect(t.finishes.panel.isOpen).toBe(false);

    // dotknięcie zaznaczonego mebla bez ruchu nadal jest zwykłym tapnięciem
    const [x2, y2] = sofaOnScreen();
    t.tapAt(x2, y2, touch);
    expect(taps.map((e) => e[0])).toEqual(['object:tap']);
    t.furniture.select(null);
  });
});

describe('integracja – widok a arkusz panelu', () => {
  it('zasłonięty dół ekranu przesuwa obraz rzutu i orbity w górę, a po zamknięciu wraca', async () => {
    const { views } = t.app.internals;
    t.app.store.setState({ viewMode: 'top', levelId: 'parter' });
    await frame();
    const focusBefore = t.app.viewFocus();
    const [, yBefore] = t.screenOf(focusBefore.x, focusBefore.y, 'parter');
    expect(yBefore).toBeCloseTo(H / 2, 0);

    views.setBottomInset(240);
    // ten sam punkt domu jest teraz 120 px wyżej – pośrodku części widocznej nad arkuszem
    const [, yShifted] = t.screenOf(focusBefore.x, focusBefore.y, 'parter');
    expect(yShifted).toBeCloseTo((H - 240) / 2, 0);
    // środek widocznej części to wciąż ten sam punkt domu
    const focusShifted = t.app.viewFocus();
    expect(focusShifted.x).toBeCloseTo(focusBefore.x, 2);
    expect(focusShifted.y).toBeCloseTo(focusBefore.y, 2);
    // dotknięcia trafiają tam, gdzie widać: punkt posadzki pod wskaźnikiem zgadza się z rzutem na ekran
    const hit = t.app.picking.floorPoint({ clientX: W / 2, clientY: (H - 240) / 2 }, 'parter');
    expect(hit.x).toBeCloseTo(focusBefore.x, 2);
    expect(hit.y).toBeCloseTo(focusBefore.y, 2);

    t.app.store.setState({ viewMode: 'orbit' });
    await frame();
    expect(t.app.camera.view?.enabled).toBe(true);

    views.setBottomInset(0);
    expect(t.app.camera.view?.enabled).toBeFalsy();
    t.app.store.setState({ viewMode: 'top' });
    await frame();
    const [, yBack] = t.screenOf(focusBefore.x, focusBefore.y, 'parter');
    expect(yBack).toBeCloseTo(H / 2, 0);
  });
});

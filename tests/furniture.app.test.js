// @vitest-environment happy-dom
// Meble w złożonej aplikacji (sztuczny DOM, renderer WebGL podmieniony atrapą – jak w app.test.js):
// dodawanie z katalogu, zaznaczanie dotknięciem, przeciąganie, edycja z panelu, odtwarzanie sceny z wariantu.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Vector3 } from 'three';
import { collides, aabb, withHouseBounds, EPS } from '../src/features/furniture/placement.js';
import { createStarterFurniture } from '../src/features/furniture/starter.js';
import { CATALOG } from '../src/features/furniture/catalog.js';

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

let app;
let canvas;
let meble; // API zwrócone przez init()

function pointer(type, x, y, extra = {}) {
  const Ctor = window.PointerEvent || window.MouseEvent;
  const e = new Ctor(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra });
  for (const [k, v] of Object.entries({ pointerId: 1, pointerType: 'mouse', ...extra })) {
    if (e[k] !== v) Object.defineProperty(e, k, { value: v });
  }
  return e;
}
/** Punkt układu domu (na posadzce kondygnacji + dz) → piksele ekranu. */
function screenOf(x, y, levelId, dz = 0) {
  const level = house.levels.find((l) => l.id === levelId);
  app.houseGroup.updateMatrixWorld();
  app.camera.updateMatrixWorld();
  const v = app.houseGroup.localToWorld(new Vector3(x, y, level.floorLevel + dz)).project(app.camera);
  return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
}
function tapAt(x, y) {
  canvas.dispatchEvent(pointer('pointerdown', x, y));
  window.dispatchEvent(pointer('pointerup', x, y));
}
const items = () => app.variant.get().furniture;
const item = (id) => items().find((f) => f.id === id);
const sceneIds = (levelId) => app.furnitureGroup(levelId).children.map((c) => c.userData.furnitureId).filter(Boolean).sort();
const walls = (levelId) => withHouseBounds(app.collision.walls(levelId));
const panel = () => document.querySelector('.panel');
const SALON = { levelId: 'parter', x: 11.2, y: 6 };

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"><canvas id="scena"></canvas><div id="ui"></div></div>';
  const container = document.getElementById('app');
  canvas = document.getElementById('scena');
  Object.defineProperty(container, 'clientWidth', { value: W });
  Object.defineProperty(container, 'clientHeight', { value: H });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H });
  canvas.setPointerCapture ??= () => {};
  canvas.releasePointerCapture ??= () => {};
  const { createApp } = await import('../src/app/app.js');
  const { init } = await import('../src/features/furniture/index.js');
  app = createApp({ house, container, canvas, uiRoot: document.getElementById('ui') });
  meble = init(app);
  app.start();
  app.store.setState({ viewMode: 'top', levelId: 'parter' });
  await frame();
});

describe('meble – dodawanie i odtwarzanie z wariantu', () => {
  it('dodaje przycisk „Meble” i otwiera katalog z wszystkimi typami', () => {
    const btn = document.querySelector('.topbar__extra [data-id="furniture"]');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain('Meble');
    btn.click();
    expect(panel().classList.contains('is-open')).toBe(true);
    expect(panel().querySelectorAll('.meb-item').length).toBe(CATALOG.length);
    expect(btn.classList.contains('is-active')).toBe(true);
    btn.click(); // drugie kliknięcie zamyka
    expect(panel().classList.contains('is-open')).toBe(false);
    expect(btn.classList.contains('is-active')).toBe(false);
  });

  it('mebel z katalogu staje w oglądanym pomieszczeniu, jest zaznaczony i trafia do wariantu', async () => {
    app.focusRoom('0/6', 'parter');
    await frame();
    document.querySelector('.topbar__extra [data-id="furniture"]').click();
    panel().querySelector('.meb-item[data-type="sofa-3"]').click();
    expect(items()).toHaveLength(1);
    const sofa = items()[0];
    expect(sofa).toMatchObject({ type: 'sofa-3', levelId: 'parter', rot: 0, w: 2.2, d: 0.95, h: 0.85 });
    expect(sofa.z).toBeUndefined();
    expect(app.collision.pointInRoom('parter', sofa.x, sofa.y)).toBe('0/6'); // środek widoku = salon
    expect(collides(sofa, walls('parter'))).toBe(false);
    expect(meble.selectedId).toBe(sofa.id);
    expect(app.store.getState().selection).toEqual({ objectId: sofa.id });
    expect(sceneIds('parter')).toEqual([sofa.id]);
    const obj = meble.scene.get(sofa.id);
    expect(obj.userData.pickable).toBe(true);
    expect(obj.position.x).toBeCloseTo(sofa.x);
    expect(obj.children.some((c) => c.isMesh && c.userData.mebPart)).toBe(true);
    expect(meble.scene.highlight.parent).toBe(obj); // ramka zaznaczenia
    // panel edycji zamiast katalogu
    expect(panel().querySelector('.meb-edit')).toBeTruthy();
    expect(panel().querySelector('.panel__title').textContent).toBe('Sofa 3-osobowa');
    expect(panel().classList.contains('meb-panel-compact')).toBe(true);
    expect(JSON.parse(JSON.stringify(app.variant.get()))).toEqual(app.variant.get()); // wariant to zwykły JSON
    meble.remove();
    expect(items()).toHaveLength(0);
  });

  it('nowy mebel staje na ostatnio dotkniętej podłodze, jeśli wciąż ją widać', async () => {
    app.events.emit('floor:tap', { levelId: 'parter', point: { x: 12.2, y: 8.6, z: 0 } });
    const id = meble.add('fotel');
    expect(Math.hypot(item(id).x - 12.2, item(id).y - 8.6)).toBeLessThan(0.05);
    meble.remove(id);
  });

  it('mebel wiszący dostaje pole z (wysokość zawieszenia), które da się zmienić', () => {
    const id = meble.add('kuchnia-gorna', { levelId: 'parter', x: 7, y: 9 });
    expect(item(id).z).toBe(1.45);
    expect(meble.scene.get(id).position.z).toBeCloseTo(1.45);
    expect(panel().querySelector('.meb-dims').children[3].hidden).toBe(false);
    meble.setMount(1.6);
    expect(item(id).z).toBe(1.6);
    expect(meble.scene.get(id).position.z).toBeCloseTo(1.6);
    meble.remove(id);
  });

  it('podmiana całego wariantu odtwarza scenę różnicowo (dodaje, usuwa, aktualizuje)', () => {
    const a = meble.add('stol', SALON);
    const objA = meble.scene.get(a);
    const starter = createStarterFurniture();
    const moved = { ...item(a), x: 10.5, y: 8, rot: 90, color: '#5d7391' };
    app.variant.set({ id: 'w2', name: 'Drugi', finishes: {}, furniture: [moved, ...starter], customMaterials: [] });
    expect(meble.scene.size).toBe(starter.length + 1);
    expect(sceneIds('parter')).toEqual([a, ...starter.filter((s) => s.levelId === 'parter').map((s) => s.id)].sort());
    expect(sceneIds('poddasze')).toEqual(starter.filter((s) => s.levelId === 'poddasze').map((s) => s.id).sort());
    expect(meble.scene.get(a)).toBe(objA); // ten sam obiekt, tylko przestawiony
    expect(objA.position.x).toBeCloseTo(10.5);
    expect(objA.rotation.z).toBeCloseTo(Math.PI / 2);
    expect(meble.selectedId).toBe(a); // wciąż istnieje, więc zostaje zaznaczony
    // wariant bez mebli: scena pusta, zaznaczenie znika, panel edycji się zamyka
    app.variant.set({ id: 'w3', name: 'Pusty', finishes: {}, furniture: [], customMaterials: [] });
    expect(meble.scene.size).toBe(0);
    expect(sceneIds('parter')).toEqual([]);
    expect(sceneIds('poddasze')).toEqual([]);
    expect(meble.selectedId).toBeNull();
    expect(app.store.getState().selection).toBeNull();
    expect(panel().classList.contains('is-open')).toBe(false);
    expect(meble.scene.factory.materialCount).toBe(0); // materiały zwolnione
    // mebel nieznanego typu albo z nieistniejącej kondygnacji nie wywraca sceny
    app.variant.set({ id: 'w4', name: 'Dziwny', finishes: {}, customMaterials: [], furniture: [
      { id: 'x1', type: 'typ-z-przyszlosci', levelId: 'parter', x: 11, y: 5, rot: 0, w: 1, d: 1, h: 1, color: '#123456' },
      { id: 'x2', type: 'stol', levelId: 'piwnica', x: 1, y: 1, rot: 0, w: 1, d: 1, h: 1, color: '#123456' },
      { id: 'x3', type: 'stol', levelId: 'parter', x: 'abc', y: 1, rot: 0, w: 1, d: 1, h: 1, color: '#123456' },
    ] });
    expect(sceneIds('parter')).toEqual(['x1']);
    app.variant.set({ id: 'w5', name: 'Pusty', finishes: {}, furniture: [], customMaterials: [] });
  });
});

describe('meble – zaznaczanie i przeciąganie w rzucie', () => {
  let id;

  it('dotknięcie mebla zaznacza go, dotknięcie tła odznacza', async () => {
    app.store.setState({ viewMode: 'top', levelId: 'parter' });
    await frame();
    id = meble.add('stol', SALON);
    meble.select(null);
    expect(meble.selectedId).toBeNull();
    const [sx, sy] = screenOf(item(id).x, item(id).y, 'parter', 0.75);
    tapAt(sx, sy);
    expect(meble.selectedId).toBe(id);
    expect(panel().querySelector('.meb-edit')).toBeTruthy();
    app.events.emit('background:tap', {});
    expect(meble.selectedId).toBeNull();
    expect(panel().classList.contains('is-open')).toBe(false);
  });

  it('przeciąganie przesuwa zaznaczony mebel, a do wariantu zapisuje raz – po puszczeniu', async () => {
    meble.select(id);
    const before = { ...item(id) };
    const changes = [];
    const off = app.events.on('variant:change', (e) => changes.push(e));
    const [x0, y0] = screenOf(before.x, before.y, 'parter', 0.75);
    const [x1, y1] = screenOf(before.x + 0.8, before.y - 1.2, 'parter', 0.75);
    canvas.dispatchEvent(pointer('pointerdown', x0, y0));
    for (let i = 1; i <= 10; i++) window.dispatchEvent(pointer('pointermove', x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10));
    expect(changes).toHaveLength(0); // w trakcie gestu wariant się nie zmienia…
    expect(meble.scene.get(id).position.x).toBeCloseTo(before.x + 0.8, 1); // …ale obiekt już stoi gdzie indziej
    window.dispatchEvent(pointer('pointerup', x1, y1));
    off();
    expect(changes).toHaveLength(1);
    expect(item(id).x).toBeCloseTo(before.x + 0.8, 1);
    expect(item(id).y).toBeCloseTo(before.y - 1.2, 1);
    expect(meble.selectedId).toBe(id);
    expect(app.internals.views.topControls.enabled).toBe(true); // kamera oddana
  });

  it('przeciągnięcie daleko za ścianę zatrzymuje mebel na licu (i dosuwa do niego)', () => {
    const before = { ...item(id) };
    const [x0, y0] = screenOf(before.x, before.y, 'parter', 0.75);
    const [x1, y1] = screenOf(before.x + 9, before.y, 'parter', 0.75); // daleko poza dom
    canvas.dispatchEvent(pointer('pointerdown', x0, y0));
    window.dispatchEvent(pointer('pointermove', (x0 + x1) / 2, y0));
    window.dispatchEvent(pointer('pointermove', x1, y1));
    window.dispatchEvent(pointer('pointerup', x1, y1));
    const after = item(id);
    expect(collides(after, walls('parter'))).toBe(false);
    expect(aabb(after)[2]).toBeCloseTo(13.35, 3); // przy wewnętrznym licu ściany szczytowej salonu
    expect(after.y).toBeCloseTo(before.y, 1);
    expect(app.collision.pointInRoom('parter', after.x, after.y)).toBe('0/6');
  });

  it('samo dotknięcie zaznaczonego mebla (bez ruchu) niczego nie zapisuje', () => {
    const changes = [];
    const off = app.events.on('variant:change', (e) => changes.push(e));
    const [sx, sy] = screenOf(item(id).x, item(id).y, 'parter', 0.75);
    tapAt(sx, sy);
    off();
    expect(changes).toHaveLength(0);
    expect(meble.selectedId).toBe(id);
  });

  it('niezaznaczonego mebla przeciągnąć się nie da – gest zostaje dla kamery', () => {
    meble.select(null);
    const before = { ...item(id) };
    const [x0, y0] = screenOf(before.x, before.y, 'parter', 0.75);
    canvas.dispatchEvent(pointer('pointerdown', x0, y0));
    window.dispatchEvent(pointer('pointermove', x0 - 60, y0 + 40));
    window.dispatchEvent(pointer('pointerup', x0 - 60, y0 + 40));
    expect(item(id)).toEqual(before);
  });

  it('w spacerze zaznaczony mebel nie daje się przeciągać', () => {
    meble.select(id);
    app.store.setState({ viewMode: 'walk' });
    expect(meble.dragHandler.onStart({ object: meble.scene.get(id), floorPoint: () => ({ x: 0, y: 0, z: 0 }), event: { clientX: 0, clientY: 0 } })).toBe(false);
    app.store.setState({ viewMode: 'top' });
  });

  it('zmiana kondygnacji nie odznacza mebla – panel edycji z „Przenieś tu” zostaje otwarty', async () => {
    meble.select(id);
    app.store.setState({ levelId: 'poddasze' });
    expect(meble.selectedId).toBe(id);
    expect(panel().classList.contains('is-open')).toBe(true);
    expect([...panel().querySelectorAll('.meb-act')].some((b) => b.textContent.includes('Przenieś tu'))).toBe(true);
    app.store.setState({ levelId: 'parter' });
    await frame();
    expect(meble.selectedId).toBe(id);
  });

  it('przeciąganie w orbicie z palcem pod horyzontem (cel setki metrów dalej) nie przenosi mebla przez ściany', () => {
    const before = { ...item(id) };
    const chairId = meble.add('krzeslo', { levelId: 'parter', x: 6.2, y: 4.2 });
    const chair = { ...item(chairId) };
    expect(app.collision.pointInRoom('parter', chair.x, chair.y)).toBe('0/3');
    const object = meble.scene.get(chairId);
    const at = (x, y) => ({ object, floorPoint: () => ({ x, y, z: 0 }), event: { clientX: x, clientY: y } });
    for (const far of [1519, 91747, 1e7]) {
      expect(meble.dragHandler.onStart({ ...at(chair.x, chair.y), event: { clientX: 100, clientY: 100 } })).toBe(true);
      meble.dragHandler.onMove({ ...at(chair.x + far, chair.y), event: { clientX: 200, clientY: 100 } });
      expect(meble.dragHandler.onEnd()).toBe(true);
      const after = item(chairId);
      expect(app.collision.pointInRoom('parter', after.x, after.y), `cel ${far} m`).toBe('0/3');
      expect(collides(after, walls('parter'))).toBe(false);
      app.variant.update((draft) => Object.assign(draft.furniture.find((f) => f.id === chairId), { x: chair.x, y: chair.y }));
    }
    meble.remove(chairId);
    meble.select(id);
    expect(item(id)).toEqual(before);
  });

  it('mebla nie da się postawić ani wciągnąć w bieg schodów na parterze', () => {
    const [x0, y0, x1, y1] = house.levels[0].stairs.parts[0].rect;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const fotelId = meble.add('fotel', { levelId: 'parter', x: cx, y: cy });
    const fotel = item(fotelId);
    const [ax0, ay0, ax1, ay1] = aabb(fotel);
    expect(Math.min(ax1, x1) - Math.max(ax0, x0) > EPS && Math.min(ay1, y1) - Math.max(ay0, y0) > EPS, 'fotel nie stoi w biegu').toBe(false);
    // przeciągnięcie na środek biegu zatrzymuje go na krawędzi schodów
    const object = meble.scene.get(fotelId);
    expect(meble.dragHandler.onStart({ object, floorPoint: () => ({ x: fotel.x, y: fotel.y, z: 0 }), event: { clientX: 0, clientY: 0 } })).toBe(true);
    meble.dragHandler.onMove({ object, floorPoint: () => ({ x: cx, y: cy, z: 0 }), event: { clientX: 50, clientY: 50 } });
    meble.dragHandler.onEnd();
    const b = aabb(item(fotelId));
    expect(Math.min(b[2], x1) - Math.max(b[0], x0) > EPS && Math.min(b[3], y1) - Math.max(b[1], y0) > EPS).toBe(false);
    meble.remove(fotelId);
    meble.select(id);
  });

  it('zaznaczenie czegoś przez inną funkcję (store.selection) odznacza mebel', () => {
    meble.select(id);
    app.store.setState({ selection: { surfaceId: 'parter:0/6:floor' } });
    expect(meble.selectedId).toBeNull();
    expect(app.store.getState().selection).toEqual({ surfaceId: 'parter:0/6:floor' }); // cudzego zaznaczenia nie ruszamy
    app.store.setState({ selection: null });
  });
});

describe('meble – edycja z panelu', () => {
  let id;
  const click = (label) => [...panel().querySelectorAll('.meb-act')].find((b) => b.textContent.trim() === label).click();

  it('obrót −15 / +15 / 90 zapisuje się w wariancie i w scenie', () => {
    app.variant.set({ id: 'w6', name: 'Edycja', finishes: {}, furniture: [], customMaterials: [] });
    id = meble.add('sofa-3', SALON);
    click('+15°');
    expect(item(id).rot).toBe(15);
    click('−15°');
    click('−15°');
    expect(item(id).rot).toBe(345);
    click('+15°');
    click('90°');
    expect(item(id).rot).toBe(90);
    expect(meble.scene.get(id).rotation.z).toBeCloseTo(Math.PI / 2);
  });

  it('„Do ściany” obraca tyłem do najbliższej ściany i dosuwa', () => {
    app.variant.update((d) => {
      Object.assign(d.furniture.find((f) => f.id === id), { x: 12.2, y: 5, rot: 30 });
    });
    click('Do ściany');
    const sofa = item(id);
    expect(sofa.rot).toBe(270); // tył w stronę ściany szczytowej (x = 13,35)
    expect(sofa.x).toBeCloseTo(13.35 - sofa.d / 2, 3);
    expect(collides(sofa, walls('parter'))).toBe(false);
  });

  it('obrót przy ścianie odsuwa mebel od muru', () => {
    click('+15°');
    const sofa = item(id);
    expect(sofa.rot).toBe(285);
    expect(collides(sofa, walls('parter'))).toBe(false);
    expect(aabb(sofa)[2]).toBeLessThanOrEqual(13.35 + EPS);
  });

  it('wymiary w cm: przecinek, zakres typu, odsuwanie od ściany przy powiększaniu', () => {
    click('Do ściany');
    const inputs = panel().querySelectorAll('.meb-input');
    expect(inputs[0].getAttribute('inputmode')).toBe('decimal');
    expect(inputs[0].value).toBe('220');
    inputs[0].value = '240,5';
    inputs[0].dispatchEvent(new Event('change'));
    expect(item(id).w).toBe(2.405);
    inputs[1].value = '110 cm';
    inputs[1].dispatchEvent(new Event('change'));
    expect(item(id).d).toBe(1.1);
    expect(collides(item(id), walls('parter'))).toBe(false); // głębsza sofa odsunęła się od ściany
    expect(aabb(item(id))[2]).toBeCloseTo(13.35, 3);
    inputs[2].value = '500'; // ponad zakres → przycięte do maksimum
    inputs[2].dispatchEvent(new Event('change'));
    expect(item(id).h).toBe(1.05);
    expect(inputs[2].value).toBe('105');
    inputs[2].value = 'abc'; // śmieci → bez zmian
    inputs[2].dispatchEvent(new Event('change'));
    expect(item(id).h).toBe(1.05);
    expect(inputs[2].value).toBe('105');
    expect(panel().querySelector('.meb-dims').children[3].hidden).toBe(true); // sofa nie wisi
  });

  it('kolor z palety i z próbnika', () => {
    const swatch = panel().querySelector('.meb-swatch[data-color="#5d7391"]');
    swatch.click();
    expect(item(id).color).toBe('#5d7391');
    expect(swatch.classList.contains('is-active')).toBe(true);
    const picker = panel().querySelector('.meb-picker');
    picker.value = '#aa3366';
    picker.dispatchEvent(new Event('change'));
    expect(item(id).color).toBe('#aa3366');
    expect(swatch.classList.contains('is-active')).toBe(false);
  });

  it('duplikowanie tworzy kopię obok i zaznacza ją; usuwanie usuwa zaznaczony', () => {
    click('Duplikuj');
    expect(items()).toHaveLength(2);
    const copy = items()[1];
    expect(copy.id).not.toBe(id);
    expect(meble.selectedId).toBe(copy.id);
    expect(copy).toMatchObject({ type: 'sofa-3', w: item(id).w, color: '#aa3366', rot: item(id).rot });
    expect(Math.hypot(copy.x - item(id).x, copy.y - item(id).y)).toBeGreaterThan(0.15);
    expect(collides(copy, walls('parter'))).toBe(false);
    click('Usuń');
    expect(items().map((f) => f.id)).toEqual([id]);
    expect(meble.selectedId).toBeNull();
    expect(meble.scene.size).toBe(1);
  });

  it('„Przenieś tu” przenosi mebel do oglądanego miejsca, także na inną kondygnację', async () => {
    meble.select(id);
    app.store.setState({ levelId: 'poddasze' }); // zaznaczenie i panel zostają (inaczej przycisk byłby nieosiągalny)
    await frame();
    app.focusRoom('1/4', 'poddasze');
    await frame();
    expect(meble.selectedId).toBe(id);
    click('Przenieś tu'); // przyciskiem z panelu, bez API
    expect(meble.selectedId).toBe(id);
    const sofa = item(id);
    expect(sofa.levelId).toBe('poddasze');
    expect(app.collision.pointInRoom('poddasze', sofa.x, sofa.y)).toBe('1/4');
    expect(collides(sofa, walls('poddasze'))).toBe(false);
    expect(sceneIds('poddasze')).toEqual([id]);
    expect(sceneIds('parter')).toEqual([]);
  });

  it('zamknięcie panelu edycji odznacza mebel', () => {
    meble.select(id);
    expect(meble.selectedId).toBe(id);
    panel().querySelector('.panel__head button').click();
    expect(meble.selectedId).toBeNull();
    expect(meble.scene.highlight.parent).toBeNull();
  });
});

// @vitest-environment happy-dom
// Test dymny rdzenia w sztucznym DOM: składanie aplikacji, API dla funkcji, tryby widoku, tapnięcia.
// Renderer WebGL jest podmieniony atrapą (w Node nie ma karty graficznej) – geometria, sterowanie i UI są prawdziwe.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MeshBasicMaterial } from 'three';
import { pointInPolygon } from '../src/geometry/plan.js';

const draws = { count: 0 };
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
      draws.count += 1;
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

function pointer(type, x, y, extra = {}) {
  const Ctor = window.PointerEvent || window.MouseEvent;
  const e = new Ctor(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra });
  for (const [k, v] of Object.entries({ pointerId: 1, pointerType: 'mouse', ...extra })) {
    if (e[k] !== v) Object.defineProperty(e, k, { value: v });
  }
  return e;
}
function tap(x, y) {
  canvas.dispatchEvent(pointer('pointerdown', x, y));
  window.dispatchEvent(pointer('pointerup', x, y));
}

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
  app = createApp({ house, container, canvas, uiRoot: document.getElementById('ui') });
  app.start();
  await frame();
});

describe('rdzeń – składanie i API', () => {
  it('rysuje pierwszą klatkę i nie rysuje bez potrzeby', async () => {
    expect(draws.count).toBeGreaterThan(0);
    await frame();
    const before = draws.count;
    await frame();
    await frame();
    expect(draws.count).toBe(before); // renderowanie na żądanie
    app.requestRender();
    await frame();
    expect(draws.count).toBe(before + 1);
  });

  it('udostępnia komplet API opisanego w app.js', () => {
    for (const key of ['house', 'store', 'three', 'scene', 'camera', 'houseGroup', 'requestRender', 'surfaces', 'getSurface',
      'setSurfaceMaterial', 'resetSurfaceMaterial', 'events', 'furnitureGroup', 'ui', 'picking', 'collision', 'variant', 'focusRoom', 'rooms']) {
      expect(app[key], key).toBeTruthy();
    }
    for (const key of ['openPanel', 'closePanel', 'addToolbarButton', 'toast']) expect(typeof app.ui[key], key).toBe('function');
    for (const key of ['walls', 'pointInRoom', 'roomPolygon']) expect(typeof app.collision[key], key).toBe('function');
    expect(typeof app.picking.setDragHandler).toBe('function');
    expect(app.three.Mesh).toBeTruthy();
    expect(app.surfaces.size).toBeGreaterThan(100);
    const s = app.getSurface('parter:0/3:wall:2');
    expect(s.label).toContain('Łazienka');
    expect(s.mesh.userData.surfaceId).toBe(s.id);
    expect(app.rooms('parter').length).toBe(9);
    expect(app.rooms().length).toBe(19);
  });

  it('podmiana i przywracanie materiału powierzchni', () => {
    const s = app.getSurface('parter:0/6:floor');
    const m = new MeshBasicMaterial({ color: '#884422' });
    expect(app.setSurfaceMaterial(s.id, m)).toBe(true);
    expect(s.mesh.material).toBe(m);
    expect(m.clippingPlanes).toBe(app.clippingPlanes); // nowy materiał też jest przycinany w widoku z góry
    expect(app.resetSurfaceMaterial(s.id)).toBe(true);
    expect(s.mesh.material).toBe(s.defaultMaterial);
    expect(app.setSurfaceMaterial('nie:ma:takiej', m)).toBe(false);
  });

  it('wariant: update pracuje na kopii i emituje variant:change', () => {
    const seen = [];
    const off = app.events.on('variant:change', (e) => seen.push(e));
    const before = app.variant.get();
    expect(before).toMatchObject({ finishes: {}, furniture: [], customMaterials: [] });
    app.variant.update((v) => {
      v.finishes['parter:0/3:floor'] = { kind: 'paint', color: '#aabbcc' };
    });
    expect(seen.length).toBe(1);
    expect(app.variant.get().finishes['parter:0/3:floor'].color).toBe('#aabbcc');
    expect(before.finishes).toEqual({}); // poprzedni obiekt nietknięty
    off();
    app.variant.update((v) => {
      delete v.finishes['parter:0/3:floor'];
    });
    expect(seen.length).toBe(1);
  });

  it('grupy mebli leżą na posadzkach kondygnacji', () => {
    expect(app.furnitureGroup('parter').position.z).toBe(0);
    expect(app.furnitureGroup('poddasze').position.z).toBeCloseTo(3.03, 9);
    expect(() => app.furnitureGroup('strych')).toThrow();
  });

  it('panel, przycisk paska i komunikat', () => {
    const content = document.createElement('div');
    content.textContent = 'treść';
    let closed = 0;
    const handle = app.ui.openPanel({ title: 'Wykończenie', content, onClose: () => (closed += 1) });
    expect(document.querySelector('.panel').classList.contains('is-open')).toBe(true);
    expect(document.querySelector('.panel__title').textContent).toBe('Wykończenie');
    handle.close();
    expect(closed).toBe(1);
    expect(document.querySelector('.panel').classList.contains('is-open')).toBe(false);

    let clicks = 0;
    const btn = app.ui.addToolbarButton({ id: 'meble', label: 'Meble', onClick: () => (clicks += 1) });
    btn.element.click();
    expect(clicks).toBe(1);
    btn.setActive(true);
    expect(btn.element.classList.contains('is-active')).toBe(true);
    btn.remove();
    app.ui.toast('Zapisano');
    expect(document.querySelector('.toast').textContent).toBe('Zapisano');
  });
});

describe('rdzeń – widoki', () => {
  const meshes = () => app.internals.built.group.children;
  const visible = (pred) => meshes().filter(pred).map((m) => m.visible);

  it('start: orbita, parter jako domek dla lalek', () => {
    const s = app.store.getState();
    expect([s.viewMode, s.levelId, s.showRoof]).toEqual(['orbit', 'parter', false]);
    expect(app.camera.isPerspectiveCamera).toBe(true);
    expect(visible((m) => m.userData.part === 'roof').every((v) => v === false)).toBe(true);
    expect(visible((m) => m.userData.levelId === 'poddasze').every((v) => v === false)).toBe(true);
    expect(visible((m) => m.userData.part === 'ceiling').every((v) => v === false)).toBe(true);
    expect(visible((m) => m.userData.cap === 'top' && m.userData.levelId === 'parter')).toEqual([true]);
    expect(visible((m) => m.userData.kind === 'wall' && m.userData.levelId === 'parter').every(Boolean)).toBe(true);
    // ściana klatki schodowej jest przycięta do spodu stropu
    const tall = app.getSurface('parter:0/7:wall:3').mesh;
    expect(tall.geometry.drawRange.count).toBe(tall.userData.upperStart);
    // boki podciągu B1 w ścianach znikają razem z sufitami (inaczej wisiałyby w powietrzu)
    for (const id of ['parter:0/2:wall:1', 'parter:0/6:wall:3']) {
      const m = app.getSurface(id).mesh;
      expect(m.userData.headerStart, id).toBeGreaterThan(0);
      expect(m.geometry.drawRange.count, id).toBe(m.userData.headerStart);
    }
  });

  it('dach włączony: widać wszystko poza czapkami', () => {
    app.store.setState({ showRoof: true });
    expect(visible((m) => m.userData.part !== 'cap').every(Boolean)).toBe(true);
    expect(visible((m) => m.userData.part === 'cap').some(Boolean)).toBe(false);
    expect(app.getSurface('parter:0/7:wall:3').mesh.geometry.drawRange.count).toBe(Infinity);
    expect(app.getSurface('parter:0/2:wall:1').mesh.geometry.drawRange.count).toBe(Infinity);
    app.store.setState({ showRoof: false });
  });

  it('poddasze jako domek dla lalek: bez dachu i sufitów poddasza, parter zostaje', () => {
    app.store.setState({ levelId: 'poddasze' });
    expect(visible((m) => m.userData.part === 'roof').some(Boolean)).toBe(false);
    expect(visible((m) => m.userData.part === 'ceiling' && m.userData.levelId === 'poddasze').some(Boolean)).toBe(false);
    expect(visible((m) => m.userData.kind === 'wall').every(Boolean)).toBe(true);
    expect(visible((m) => m.userData.part === 'slab')).toEqual([true]);
    expect(visible((m) => m.userData.cap === 'top' && m.userData.levelId === 'poddasze')).toEqual([true]);
    expect(app.getSurface('parter:0/2:wall:1').mesh.geometry.drawRange.count).toBe(Infinity); // sufit parteru jest – podciąg też
  });

  it('"cały dom" działa tylko w orbicie – w innych trybach wraca kondygnacja', () => {
    app.store.setState({ levelId: 'all' });
    expect(app.store.getState().levelId).toBe('all');
    app.store.setState({ viewMode: 'top' });
    expect(app.store.getState().levelId).toBe('poddasze');
    app.store.setState({ levelId: 'all' });
    expect(app.store.getState().levelId).toBe('poddasze');
  });

  it('widok z góry: kamera ortogonalna, płaszczyzna cięcia 1,20 m nad posadzką, ciemne czapki przekroju', () => {
    app.store.setState({ viewMode: 'top', levelId: 'parter' });
    expect(app.camera.isOrthographicCamera).toBe(true);
    // orientacja rzutu jak na rysunku: +x domu w prawo, +y domu w górę ekranu
    app.camera.updateMatrixWorld();
    const P = (x, y) => new app.three.Vector3(x, 0, -y).project(app.camera);
    expect(P(4, 3).x).toBeGreaterThan(P(3, 3).x);
    expect(P(3, 4).y).toBeGreaterThan(P(3, 3).y);
    expect(app.clippingPlanes.length).toBe(1);
    expect(app.clippingPlanes[0].constant).toBeCloseTo(1.2, 9);
    expect(visible((m) => m.userData.cap === 'section' && m.userData.levelId === 'parter')).toEqual([true]);
    expect(visible((m) => m.userData.cap === 'section' && m.userData.levelId === 'poddasze')).toEqual([false]);
    expect(visible((m) => m.userData.part === 'roof').some(Boolean)).toBe(false);
    // wszystko ponad cięciem jest ukryte, a nie tylko odcinane: sufity, strop, całe poddasze
    expect(visible((m) => ['ceiling', 'slab'].includes(m.userData.part) || m.userData.levelId === 'poddasze').some(Boolean)).toBe(false);
    const cutY = app.clippingPlanes[0].constant;
    const above = meshes().filter((m) => m.visible && m.userData.part !== 'cap' && m.geometry.boundingBox.min.z > cutY);
    expect(above.map((m) => m.name)).toEqual([]);
    const stairWall = app.getSurface('parter:0/7:wall:3').mesh;
    expect(stairWall.geometry.drawRange.count).toBe(stairWall.userData.upperStart);
    app.store.setState({ levelId: 'poddasze' });
    expect(app.clippingPlanes[0].constant).toBeCloseTo(3.03 + 1.2, 9);
    // rzut poddasza: sufity ukryte, strop zostaje (lico otworu klatki), parter widać przez otwór
    expect(visible((m) => m.userData.part === 'ceiling').some(Boolean)).toBe(false);
    expect(visible((m) => m.userData.part === 'slab')).toEqual([true]);
    expect(visible((m) => m.userData.kind === 'floor').every(Boolean)).toBe(true);
    expect(stairWall.geometry.drawRange.count).toBe(Infinity);
    app.store.setState({ levelId: 'parter' });
  });

  it('zdarzenia level:change i view:change', () => {
    const log = [];
    const offA = app.events.on('level:change', (e) => log.push(['level', e.levelId, e.previous]));
    const offB = app.events.on('view:change', (e) => log.push(['view', e.viewMode, e.previous]));
    app.store.setState({ levelId: 'poddasze' });
    app.store.setState({ viewMode: 'orbit' });
    app.store.setState({ viewMode: 'top', levelId: 'parter' });
    expect(log).toEqual([['level', 'poddasze', 'parter'], ['view', 'orbit', 'top'], ['level', 'parter', 'poddasze'], ['view', 'top', 'orbit']]);
    offA();
    offB();
    expect(app.clippingPlanes.length).toBe(1);
  });

  it('tapnięcie w widoku z góry trafia w podłogę pomieszczenia', async () => {
    app.store.setState({ viewMode: 'top', levelId: 'parter' });
    expect(app.focusRoom('0/9')).toBe(true);
    await frame();
    const taps = [];
    const offA = app.events.on('surface:tap', (e) => taps.push(['surface', e.surfaceId, e.roomId]));
    const offB = app.events.on('floor:tap', (e) => taps.push(['floor', e.surfaceId, e.point]));
    tap(W / 2, H / 2);
    expect(taps[0]).toEqual(['surface', 'parter:0/9:floor', '0/9']);
    expect(taps[1][0]).toBe('floor');
    const p = taps[1][2];
    expect(pointInPolygon(p.x, p.y, app.collision.roomPolygon('parter', '0/9'))).toBe(true);
    expect(p.z).toBeCloseTo(0, 6);
    // przeciągnięcie to nie tapnięcie
    taps.length = 0;
    canvas.dispatchEvent(pointer('pointerdown', 300, 300));
    window.dispatchEvent(pointer('pointermove', 360, 330));
    window.dispatchEvent(pointer('pointerup', 360, 330));
    expect(taps).toEqual([]);
    // zgubiony pointerup (wpis został w pamięci) nie blokuje następnego tapnięcia tym samym wskaźnikiem
    canvas.dispatchEvent(pointer('pointerdown', W / 2, H / 2));
    tap(W / 2, H / 2);
    expect(taps.map((t) => t[0])).toEqual(['surface', 'floor']);
    offA();
    offB();
  });

  it('obiekt z userData.pickable daje object:tap', async () => {
    const { Mesh, BoxGeometry } = app.three;
    const box = new Mesh(new BoxGeometry(1, 1, 3), new MeshBasicMaterial());
    box.userData.pickable = true;
    const spot = app.internals.collision.roomSpot('parter', '0/9');
    box.position.set(spot.x, spot.y, 0.4);
    app.furnitureGroup('parter').add(box);
    app.focusRoom('0/9');
    await frame();
    const got = [];
    const off = app.events.on('object:tap', (e) => got.push(e.object));
    // środek kadru to środek pomieszczenia; skrzynka stoi w "dobrym miejscu" – celujemy w nią przez rzut punktu
    const v = new app.three.Vector3(spot.x, 0.4, -spot.y).project(app.camera);
    tap(((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H);
    expect(got.length).toBe(1);
    expect(got[0]).toBe(box); // wysoki mebel (ponad płaszczyznę cięcia) też da się wskazać w rzucie
    off();
    app.furnitureGroup('parter').remove(box);
  });

  it('przejęcie przeciągania wyłącza sterowanie kamerą i podaje punkty na posadzce', () => {
    const calls = [];
    app.picking.setDragHandler({
      onStart: (info) => (calls.push(['start', info.point, info.surfaceId]), true),
      onMove: (info) => calls.push(['move', info.point]),
      onEnd: (info) => calls.push(['end', info.point]),
    });
    canvas.dispatchEvent(pointer('pointerdown', W / 2, H / 2));
    expect(app.internals.views.topControls.enabled).toBe(false);
    window.dispatchEvent(pointer('pointermove', W / 2 + 40, H / 2));
    window.dispatchEvent(pointer('pointerup', W / 2 + 40, H / 2));
    expect(app.internals.views.topControls.enabled).toBe(true);
    expect(calls.map((c) => c[0])).toEqual(['start', 'move', 'end']);
    expect(calls[0][2]).toBe('parter:0/9:floor');
    expect(calls[1][1].x).toBeGreaterThan(calls[0][1].x); // w prawo na ekranie = +x domu
    expect(calls[1][1].y).toBeCloseTo(calls[0][1].y, 6);
    expect(calls[1][1].z).toBeCloseTo(0, 6);
    app.picking.setDragHandler(null);
  });

  it('spacer: start w pomieszczeniu, chodzenie klawiszami, ściany zatrzymują', async () => {
    app.store.setState({ viewMode: 'walk' });
    const walk = app.internals.views.walk;
    expect(app.camera).toBe(walk.camera);
    expect(app.clippingPlanes.length).toBe(0);
    const start = walk.getPosition();
    expect(app.collision.pointInRoom('parter', start.x, start.y)).toBe('0/9'); // tam patrzył widok z góry
    expect(app.camera.position.y).toBeCloseTo(1.6, 6);

    walk.teleport({ x: 2.5, y: 3.5, z: 0, headingDeg: 90 }); // garaż, twarzą do ściany W2a (y = 6,80)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    for (let i = 0; i < 60; i++) walk.update(0.1);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    const p = walk.getPosition();
    expect(p.y).toBeGreaterThan(6.4);
    expect(p.y).toBeLessThanOrEqual(6.8 - 0.25 + 1e-6);
    expect(walk.update(0.1)).toBe(false); // po puszczeniu klawisza nie ma ruchu → brak kolejnych klatek
  });

  it('spacer: wejście po schodach zmienia kondygnację', () => {
    const walk = app.internals.views.walk;
    const spot = app.internals.collision.stairsSpot('parter');
    walk.teleport({ x: spot.x, y: spot.y, z: 0, headingDeg: 180 }); // twarzą do biegu dolnego
    const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    key('keydown', 'KeyW');
    for (let i = 0; i < 40; i++) walk.update(0.05); // bieg dolny (dochodzi do ściany przy zabiegu)
    expect(walk.getPosition().z).toBeGreaterThan(1.3);
    key('keyup', 'KeyW');
    walk.teleport({ ...walk.getPosition(), headingDeg: -90 }); // przez zabieg w stronę -y
    key('keydown', 'KeyW');
    for (let i = 0; i < 30; i++) walk.update(0.05);
    key('keyup', 'KeyW');
    walk.teleport({ ...walk.getPosition(), headingDeg: 0 }); // bieg górny w stronę +x
    key('keydown', 'KeyW');
    for (let i = 0; i < 60; i++) walk.update(0.05);
    key('keyup', 'KeyW');
    expect(walk.getPosition().z).toBeCloseTo(3.03, 6);
    expect(app.store.getState().levelId).toBe('poddasze');
    expect(app.camera.position.y).toBeGreaterThan(3.03 + 1.2);
  });

  it('spacer: przycisk kondygnacji przenosi przy schody, "skocz do" – do pomieszczenia', () => {
    const walk = app.internals.views.walk;
    app.store.setState({ levelId: 'parter' });
    expect(walk.getPosition().z).toBe(0);
    expect(app.collision.pointInRoom('parter', walk.getPosition().x, walk.getPosition().y)).toBe('0/2');
    app.store.setState({ levelId: 'poddasze' });
    expect(walk.getPosition().z).toBeCloseTo(3.03, 9);
    for (const room of app.rooms('poddasze')) {
      expect(app.focusRoom(room.id), room.id).toBe(true);
      const p = walk.getPosition();
      expect(app.collision.pointInRoom('poddasze', p.x, p.y), room.id).toBe(room.id);
    }
    // skok do pomieszczenia innej kondygnacji przełącza kondygnację
    expect(app.focusRoom('0/3')).toBe(true);
    expect(app.store.getState().levelId).toBe('parter');
    expect(app.collision.pointInRoom('parter', walk.getPosition().x, walk.getPosition().y)).toBe('0/3');
  });

  it('spacer: ponowne wejście zaczyna tam, gdzie patrzy rzut lub orbita; bez ruszania widoku wraca na stare miejsce', () => {
    const walk = app.internals.views.walk;
    const roomNow = () => app.collision.pointInRoom('parter', walk.getPosition().x, walk.getPosition().y);
    walk.teleport({ x: 2.5, y: 3.5, z: 0, headingDeg: 90 }); // garaż 0/9
    app.store.setState({ viewMode: 'top' });
    app.store.setState({ viewMode: 'walk' });
    expect(walk.getPosition()).toMatchObject({ x: 2.5, y: 3.5, z: 0 }); // rzut nieruszony → to samo miejsce
    app.store.setState({ viewMode: 'top' });
    expect(app.focusRoom('0/6')).toBe(true);
    app.store.setState({ viewMode: 'walk' });
    expect(roomNow()).toBe('0/6');
    app.store.setState({ viewMode: 'orbit' });
    expect(app.focusRoom('0/4')).toBe(true);
    app.store.setState({ viewMode: 'walk' });
    expect(roomNow()).toBe('0/4');
    // pasek górny zasłania część rzutu: liczy się środek widocznej części (mała łazienka 0/3), także w obie strony
    const bar = document.querySelector('.topbar');
    const original = bar.getBoundingClientRect;
    bar.getBoundingClientRect = () => ({ ...original.call(bar), height: 105 });
    app.store.setState({ viewMode: 'top' });
    expect(app.focusRoom('0/3')).toBe(true);
    app.store.setState({ viewMode: 'walk' });
    expect(roomNow()).toBe('0/3');
    const before = walk.getPosition();
    app.store.setState({ viewMode: 'top' });
    const f = app.internals.views.focus();
    expect([f.x, f.y]).toEqual([expect.closeTo(before.x, 6), expect.closeTo(before.y, 6)]);
    app.store.setState({ viewMode: 'walk' });
    expect(walk.getPosition()).toMatchObject({ x: before.x, y: before.y });
    bar.getBoundingClientRect = original;
  });

  it('spacer: przejęcie przeciągania wstrzymuje ruch, ale nie zeruje joysticka', () => {
    const walk = app.internals.views.walk;
    walk.teleport({ x: 2.5, y: 3.5, z: 0, headingDeg: 90 }); // garaż, w stronę +y
    walk.setJoystick(0, 1);
    app.picking.setDragHandler({ onStart: () => true });
    canvas.dispatchEvent(pointer('pointerdown', W / 2, H / 2, { pointerId: 7, pointerType: 'touch' }));
    for (let i = 0; i < 5; i++) walk.update(0.05);
    expect(walk.getPosition().y).toBe(3.5); // funkcja przeciąga – postać stoi
    window.dispatchEvent(pointer('pointerup', W / 2, H / 2, { pointerId: 7, pointerType: 'touch' }));
    expect(walk.enabled).toBe(true);
    for (let i = 0; i < 10; i++) walk.update(0.05);
    expect(walk.getPosition().y).toBeGreaterThan(3.5 + 0.5); // gałka nadal wychylona → idzie dalej bez ponownego dotknięcia
    walk.setJoystick(0, 0);
    app.picking.setDragHandler(null);
  });

  it('wieczór: ciemne niebo i ciepłe światła w pomieszczeniach przy kamerze', () => {
    app.store.setState({ lighting: 'evening' });
    const lit = app.lights.roomLights.filter((l) => l.visible && l.intensity > 0);
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.length).toBeLessThanOrEqual(4);
    expect(app.scene.background.getHexString()).toBe('1a2030');
    app.store.setState({ lighting: 'day' });
    expect(app.lights.roomLights.some((l) => l.visible)).toBe(false);
  });

  it('powrót do orbity po spacerze', async () => {
    app.store.setState({ viewMode: 'orbit', levelId: 'all', showRoof: true });
    expect(app.camera.isPerspectiveCamera).toBe(true);
    expect(app.internals.views.orbitControls.enabled).toBe(true);
    expect(app.internals.views.walk.enabled).toBe(false);
    await frame();
  });
});

// ---------------------------------------------------------------- opcje bryły (design.json)
describe('rdzeń – opcje bryły z design.json', () => {
  const design = JSON.parse(readFileSync(join(root, 'design.json'), 'utf8'));
  let app2;
  const meshes = () => app2.internals.built.group.children;
  const beam = () => meshes().find((m) => m.name === 'poddasze:ceiling:beam');
  const OPEN_WALL = 'poddasze:1/9:wall:5'; // ściana szczytowa sypialni – sięga pod kalenicę

  beforeAll(async () => {
    const host = document.createElement('div');
    host.innerHTML = '<div id="app2"><canvas id="scena2"></canvas><div id="ui2"></div></div>';
    document.body.append(host);
    const container = document.getElementById('app2');
    const canvas2 = document.getElementById('scena2');
    Object.defineProperty(container, 'clientWidth', { value: W });
    Object.defineProperty(container, 'clientHeight', { value: H });
    canvas2.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H });
    const { createApp } = await import('../src/app/app.js');
    app2 = createApp({ house, design, container, canvas: canvas2, uiRoot: document.getElementById('ui2') });
    app2.start();
    await frame();
  });

  it('app.design: bez design pusty obiekt i bryła z projektu, z design – zmienione powierzchnie', () => {
    expect(app.design).toEqual({});
    expect(app.getSurface('poddasze:1/9:ceiling')).toBeTruthy();
    expect(app.getSurface('poddasze:1/9:slope-N')).toBeUndefined();
    expect(app.internals.built.group.children.some((m) => /:(beam|slat|stairTread)$/.test(m.name))).toBe(false);

    expect(app2.design).toBe(design);
    for (const id of ['1/9', '1/10', '1/11']) expect(app2.getSurface(`poddasze:${id}:ceiling`), id).toBeUndefined();
    expect(app2.surfacesOfRoom('poddasze', '1/9').filter((s) => s.kind === 'slope').map((s) => s.id).sort()).toEqual(['poddasze:1/9:slope-N', 'poddasze:1/9:slope-S']);
    expect(app2.getSurface('poddasze:1/8:ceiling')).toBeTruthy(); // strych nad pozostałymi pomieszczeniami bez zmian
    expect(app2.collision.ceilingAt('poddasze', 2.0, 5.05)).toBeCloseTo(1.425 + 0.7 * 4.8, 9);
    expect(app.collision.ceilingAt('poddasze', 2.0, 5.05)).toBeCloseTo(2.55, 9);
    expect(meshes().some((m) => m.name === 'parter:stairs:slat')).toBe(true);
    expect(meshes().some((m) => m.name === 'parter:stairs:balustrade')).toBe(false);
  });

  it('domek dla lalek: belki, skosy i część ścian ponad dawnym sufitem znikają razem z sufitami', () => {
    app2.store.setState({ viewMode: 'orbit', levelId: 'poddasze', showRoof: false });
    const wall = app2.getSurface(OPEN_WALL).mesh;
    expect(wall.userData.headerStart).toBeGreaterThan(0);
    expect(beam().visible).toBe(false);
    expect(app2.getSurface('poddasze:1/9:slope-N').mesh.visible).toBe(false);
    expect(wall.visible).toBe(true);
    expect(wall.geometry.drawRange.count).toBe(wall.userData.headerStart);
    // widoczna część ściany kończy się na wysokości dawnego sufitu – jak ściany pozostałych pomieszczeń i czapki murów
    const p = wall.geometry.attributes.position;
    let top = -Infinity;
    for (let i = 0; i < wall.userData.headerStart; i++) top = Math.max(top, p.getZ(i));
    expect(top).toBeCloseTo(3.03 + 2.55, 5);

    // parter jako domek dla lalek: lamele widoczne, poddasze (z belkami) ukryte
    app2.store.setState({ levelId: 'parter' });
    expect(meshes().find((m) => m.name === 'parter:stairs:slat').visible).toBe(true);
    expect(beam().visible).toBe(false);
  });

  it('dach włączony i spacer: pełne ściany do skosu, belki widoczne', () => {
    app2.store.setState({ viewMode: 'orbit', levelId: 'all', showRoof: true });
    const wall = app2.getSurface(OPEN_WALL).mesh;
    expect(wall.geometry.drawRange.count).toBe(Infinity);
    expect(beam().visible).toBe(true);
    expect(meshes().filter((m) => m.userData.part !== 'cap').every((m) => m.visible)).toBe(true);

    app2.store.setState({ viewMode: 'walk', levelId: 'poddasze' });
    expect(wall.geometry.drawRange.count).toBe(Infinity);
    expect(beam().visible).toBe(true);
    expect(app2.getSurface('poddasze:1/9:slope-S').mesh.visible).toBe(true);
    const walk = app2.internals.views.walk;
    // pod kalenicą w sypialni oczy na pełnej wysokości, pod skosem przy ściance kolankowej w łazience 1/10 – niżej
    walk.teleport({ x: 2.0, y: 5.05, z: 3.03 });
    expect(app2.camera.position.y).toBeCloseTo(3.03 + 1.6, 6);
    walk.teleport({ x: 1.0, y: 9.6, z: 3.03 });
    expect(app2.camera.position.y).toBeCloseTo(3.03 + 1.425 + 0.7 * 0.25 - 0.12, 6);
    // miejsce „skocz do pomieszczenia” leży w sypialni
    expect(app2.focusRoom('1/9', 'poddasze')).toBe(true);
    const here = walk.getPosition();
    expect(app2.collision.pointInRoom('poddasze', here.x, here.y)).toBe('1/9');
  });

  it('widok z góry (przekrój 1,20 m): sufity, skosy i belki ukryte, ściany przycięte', () => {
    app2.store.setState({ viewMode: 'top', levelId: 'poddasze' });
    expect(beam().visible).toBe(false);
    expect(meshes().filter((m) => m.userData.part === 'ceiling').some((m) => m.visible)).toBe(false);
    const wall = app2.getSurface(OPEN_WALL).mesh;
    expect(wall.visible).toBe(true);
    expect(wall.geometry.drawRange.count).toBe(wall.userData.headerStart);
    expect(app2.getSurface('poddasze:1/9:floor').mesh.visible).toBe(true);
    // nowe materiały stałe też są podpięte pod przekrój
    for (const name of ['parter:stairs:slat', 'parter:stairs:stairTread', 'parter:stairs:stairRiser', 'poddasze:ceiling:beam']) {
      expect(meshes().find((m) => m.name === name).material.clippingPlanes, name).toBe(app2.clippingPlanes);
    }
    app2.store.setState({ viewMode: 'orbit', levelId: 'parter', showRoof: false });
  });
});

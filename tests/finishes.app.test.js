// @vitest-environment happy-dom
// Funkcja wykończeń na prawdziwym rdzeniu (atrapa renderera WebGL jak w app.test.js):
// odtwarzanie wariantu, podział ścian, panel, zaznaczenie.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
const frame = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

const WALL = 'parter:0/3:wall:2';
const WALL_B = 'parter:0/3:wall:0';
const FLOOR = 'parter:0/3:floor';

let app;
let fin;
let panelEl;

/** Atrapa kontekstu 2D – happy-dom nie rysuje na canvasie; dzięki niej powstają prawdziwe CanvasTexture. */
function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => gradient;
      if (key === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
}

const setFinish = (id, finish) => app.variant.update((v) => {
  if (finish) v.finishes[id] = finish;
  else delete v.finishes[id];
});
const clearVariant = () => app.variant.update((v) => {
  v.finishes = {};
  v.customMaterials = [];
});
const hex = (material) => `#${material.color.getHexString()}`;
const button = (text) => [...panelEl.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const click = (node) => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

function meshArea(mesh, from = 0, to = Infinity) {
  const p = mesh.geometry.attributes.position.array;
  let area = 0;
  for (let i = from * 3; i < Math.min(p.length, to * 3); i += 9) {
    const u = [p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]];
    const v = [p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]];
    area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  return area;
}

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"><canvas id="scena"></canvas><div id="ui"></div></div>';
  const container = document.getElementById('app');
  const canvas = document.getElementById('scena');
  Object.defineProperty(container, 'clientWidth', { value: 800 });
  Object.defineProperty(container, 'clientHeight', { value: 600 });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
  canvas.setPointerCapture ??= () => {};
  canvas.releasePointerCapture ??= () => {};
  window.HTMLCanvasElement.prototype.getContext = function getContext(type) {
    return type === '2d' ? fakeContext() : null;
  };
  const { createApp } = await import('../src/app/app.js');
  const { init } = await import('../src/features/finishes/index.js');
  app = createApp({ house, container, canvas, uiRoot: document.getElementById('ui') });
  // wariant wczytany PRZED startem funkcji (tak robi funkcja wariantów) – ma być odtworzony w init()
  app.variant.update((v) => {
    v.finishes[FLOOR] = { kind: 'paint', color: '#336699' };
  });
  fin = init(app);
  app.start();
  panelEl = document.querySelector('.panel');
  await frame();
});

describe('wykończenia – odtwarzanie wariantu w scenie', () => {
  it('stan wariantu z chwili startu jest nałożony od razu', () => {
    const s = app.getSurface(FLOOR);
    expect(s.mesh.material).not.toBe(s.defaultMaterial);
    expect(hex(s.mesh.material)).toBe('#336699');
    expect(s.mesh.material.clippingPlanes).toBe(app.clippingPlanes); // podpięte pod przekrój widoku z góry
    clearVariant();
    expect(s.mesh.material).toBe(s.defaultMaterial);
    expect(fin.applier.count).toBe(0);
  });

  it('farba: nakładanie, zmiana koloru bez nowego materiału, powrót do domyślnego', () => {
    const s = app.getSurface(WALL);
    setFinish(WALL, { kind: 'paint', color: '#aabbcc' });
    const m = s.mesh.material;
    expect(m).not.toBe(s.defaultMaterial);
    expect(m.isMeshLambertMaterial).toBe(true); // jak materiały domyślne rdzenia
    expect(hex(m)).toBe('#aabbcc');
    setFinish(WALL, { kind: 'paint', color: '#112233' });
    expect(s.mesh.material).toBe(m);
    expect(hex(m)).toBe('#112233');
    const disposed = vi.fn();
    m.addEventListener('dispose', disposed);
    setFinish(WALL, null);
    expect(s.mesh.material).toBe(s.defaultMaterial);
    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it('różnicowo: zmiana jednej powierzchni nie przebudowuje pozostałych', () => {
    setFinish(WALL, { kind: 'material', id: 'metro-biale', rot: 0 });
    setFinish(FLOOR, { kind: 'material', id: 'gres-beton-szary', rot: 0 });
    const wallMaterial = app.getSurface(WALL).mesh.material;
    const floorMaterial = app.getSurface(FLOOR).mesh.material;
    setFinish(WALL_B, { kind: 'paint', color: '#ffffff' });
    setFinish(FLOOR, { kind: 'material', id: 'gres-beton-szary', rot: 90 });
    expect(app.getSurface(WALL).mesh.material).toBe(wallMaterial);
    expect(app.getSurface(FLOOR).mesh.material).not.toBe(floorMaterial);
    expect(fin.applier.sync(app.variant.get())).toBe(0); // nic do zrobienia
    clearVariant();
  });

  it('materiał: tekstura w metrach (RepeatWrapping, sRGB), współdzielona między powierzchniami i zwalniana', () => {
    const THREE = app.three;
    setFinish(WALL, { kind: 'material', id: 'gres-marmur-bialy', rot: 0 });
    setFinish(WALL_B, { kind: 'material', id: 'gres-marmur-bialy', rot: 0 });
    const map = app.getSurface(WALL).mesh.material.map;
    expect(map).toBeTruthy();
    expect(map.wrapS).toBe(THREE.RepeatWrapping);
    expect(map.wrapT).toBe(THREE.RepeatWrapping);
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(map.anisotropy).toBeGreaterThan(1);
    expect(map.anisotropy).toBeLessThanOrEqual(8);
    expect(map.image.width).toBeLessThanOrEqual(1024);
    expect(map.image.height).toBeLessThanOrEqual(1024);
    // płytka 60 × 120: liczba płytek w komórce tekstury × powtórzenie = 1 / rozmiar płytki
    const nx = Math.round(1 / map.repeat.x / 0.6);
    const ny = Math.round(1 / map.repeat.y / 1.2);
    expect(1 / map.repeat.x).toBeCloseTo(nx * 0.6, 9);
    expect(1 / map.repeat.y).toBeCloseTo(ny * 1.2, 9);
    expect(app.getSurface(WALL_B).mesh.material.map).toBe(map); // jedna tekstura na ten sam materiał
    expect(app.getSurface(WALL_B).mesh.material).not.toBe(app.getSurface(WALL).mesh.material);
    expect(fin.textures.size).toBe(1);

    // obrót 90°: inna tekstura (własny obrót), ten sam obraz
    setFinish(WALL_B, { kind: 'material', id: 'gres-marmur-bialy', rot: 90 });
    const rotated = app.getSurface(WALL_B).mesh.material.map;
    expect(rotated).not.toBe(map);
    expect(rotated.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect(rotated.source).toBe(map.source);
    expect(fin.textures.size).toBe(2);

    const disposed = vi.fn();
    map.addEventListener('dispose', disposed);
    clearVariant();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(fin.textures.size).toBe(0);
  });

  it('nieznany materiał, nieznana powierzchnia i śmieci w wariancie są pomijane bez błędu', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = app.getSurface(WALL);
    app.variant.set({
      id: 'w', name: 'Zepsuty',
      finishes: {
        [WALL]: { kind: 'material', id: 'nie-ma-takiego', rot: 0 },
        'nie:ma:takiej': { kind: 'paint', color: '#ff0000' },
        [WALL_B]: 'śmieć',
        [FLOOR]: { kind: 'split', height: 1, lower: { kind: 'paint', color: '#000000' }, upper: { kind: 'paint', color: '#ffffff' } },
        'parter:0/6:floor': { kind: 'paint', color: '#00ff00' },
      },
      furniture: [], customMaterials: [],
    });
    expect(s.mesh.material).toBe(s.defaultMaterial);
    expect(app.getSurface(WALL_B).mesh.material).toBe(app.getSurface(WALL_B).defaultMaterial);
    expect(app.getSurface(FLOOR).mesh.material).toBe(app.getSurface(FLOOR).defaultMaterial); // podział nie dotyczy podłóg
    expect(hex(app.getSurface('parter:0/6:floor').mesh.material)).toBe('#00ff00'); // poprawne wpisy działają
    expect(errors).not.toHaveBeenCalled();
    // wariant bez pól (stary zapis) też nie wywala
    expect(() => app.variant.set({ id: 'x', name: 'Pusty' })).not.toThrow();
    expect(fin.applier.count).toBe(0);
    app.variant.set({ id: 'wariant-1', name: 'Wariant 1', finishes: {}, furniture: [], customMaterials: [] });
    errors.mockRestore();
  });

  it('wpis null w customMaterials nie wywraca synchronizacji ani panelu', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = app.variant.get();
    app.variant.set({ ...before, finishes: { [WALL]: { kind: 'paint', color: '#111111' } }, customMaterials: [null] });
    expect(errors).not.toHaveBeenCalled();
    expect(hex(app.getSurface(WALL).mesh.material)).toBe('#111111');
    fin.select(WALL); // panel z zakładką własnych materiałów też musi się narysować
    fin.deselect();
    expect(errors).not.toHaveBeenCalled();
    app.variant.set(before);
    errors.mockRestore();
  });

  it('podmiana całego wariantu (przełączenie / import) doprowadza scenę do nowego stanu', () => {
    setFinish(WALL, { kind: 'paint', color: '#111111' });
    setFinish(FLOOR, { kind: 'material', id: 'deska-dab-naturalny', rot: 0 });
    app.variant.set({ id: 'b', name: 'B', finishes: { [WALL_B]: { kind: 'paint', color: '#222222' } }, furniture: [], customMaterials: [] });
    expect(app.getSurface(WALL).mesh.material).toBe(app.getSurface(WALL).defaultMaterial);
    expect(app.getSurface(FLOOR).mesh.material).toBe(app.getSurface(FLOOR).defaultMaterial);
    expect(hex(app.getSurface(WALL_B).mesh.material)).toBe('#222222');
    expect(fin.applier.count).toBe(1);
    expect(fin.textures.size).toBe(0);
    clearVariant();
  });
});

describe('wykończenia – płytki do wysokości (split)', () => {
  const split = (height, lower = { kind: 'material', id: 'metro-biale', rot: 0 }) => ({ kind: 'split', height, lower, upper: { kind: 'paint', color: '#ddeeff' } });

  it('ściana dostaje przeciętą geometrię z dwiema grupami i tablicę dwóch materiałów', () => {
    const s = app.getSurface(WALL);
    const original = s.mesh.geometry;
    setFinish(WALL, split(1.2));
    expect(s.mesh.geometry).not.toBe(original);
    expect(Array.isArray(s.mesh.material)).toBe(true);
    expect(s.mesh.material.length).toBe(2);
    expect(s.mesh.material[0].map).toBeTruthy();
    expect(hex(s.mesh.material[1])).toBe('#ddeeff');
    for (const m of s.mesh.material) expect(m.clippingPlanes).toBe(app.clippingPlanes);
    const groups = s.mesh.geometry.groups;
    expect(groups.map((g) => g.materialIndex)).toEqual([0, 1]);
    expect(meshArea(s.mesh)).toBeCloseTo(s.areaM2, 4);
    const uv = s.mesh.geometry.attributes.uv.array;
    for (let i = 0; i < groups[0].count; i++) expect(uv[i * 2 + 1]).toBeLessThanOrEqual(1.2 + 1e-5);
    for (let i = groups[1].start; i < groups[1].start + groups[1].count; i++) expect(uv[i * 2 + 1]).toBeGreaterThanOrEqual(1.2 - 1e-5);
    const areas = fin.applier.splitAreas(WALL);
    expect(areas.lower + areas.upper).toBeCloseTo(s.areaM2, 4);

    // zmiana samego materiału: geometria zostaje, zmiana wysokości: nowa geometria, stara zwolniona
    const cutGeometry = s.mesh.geometry;
    setFinish(WALL, split(1.2, { kind: 'material', id: 'metro-czarne', rot: 0 }));
    expect(s.mesh.geometry).toBe(cutGeometry);
    const disposed = vi.fn();
    cutGeometry.addEventListener('dispose', disposed);
    setFinish(WALL, split(1.5));
    expect(s.mesh.geometry).not.toBe(cutGeometry);
    expect(disposed).toHaveBeenCalledTimes(1);

    // powrót do zwykłego wykończenia i do domyślnego przywraca oryginalną geometrię
    setFinish(WALL, { kind: 'paint', color: '#ffffff' });
    expect(s.mesh.geometry).toBe(original);
    expect(Array.isArray(s.mesh.material)).toBe(false);
    setFinish(WALL, split(1.2));
    setFinish(WALL, null);
    expect(s.mesh.geometry).toBe(original);
    expect(s.mesh.material).toBe(s.defaultMaterial);
    expect(fin.textures.size).toBe(0);
  });

  it('wysokość ponad ścianą: całość w dolnym wykończeniu, bez cięcia', () => {
    const s = app.getSurface(WALL);
    const original = s.mesh.geometry;
    setFinish(WALL, split(9, { kind: 'paint', color: '#010203' }));
    expect(s.mesh.geometry).toBe(original);
    expect(hex(s.mesh.material)).toBe('#010203');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    setFinish(WALL, null); // przywrócenie podziału BEZ ciętej geometrii rzucało TypeError i blokowało kolejne sync()
    expect(errors).not.toHaveBeenCalled();
    expect(fin.applier.has(WALL)).toBe(false);
    expect(fin.applier.count).toBe(0);
    expect(s.mesh.material).toBe(s.defaultMaterial);
    errors.mockRestore();
  });

  it('ścianka kolankowa niższa niż cięcie: reset i podmiana wariantu nie blokują kolejnych powierzchni', () => {
    const KNEE = 'poddasze:1/3:wall:2';
    const ids = [...app.surfaces.keys()];
    const LAST = ids[ids.length - 1];
    const knee = app.getSurface(KNEE);
    expect(knee, 'ścianka kolankowa z uwagi recenzenta').toBeTruthy();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = app.variant.get();
    setFinish(KNEE, split(1.5));
    expect(knee.mesh.geometry).toBe(fin.applier.originalGeometry(KNEE)); // 1,5 m to ponad całą ściankę – bez cięcia
    // cały wariant podmieniony: ścianka wraca do domyślnej, a OSTATNIA powierzchnia w kolejności dostaje farbę
    app.variant.set({ ...before, finishes: { [LAST]: { kind: 'paint', color: '#112233' } } });
    expect(errors).not.toHaveBeenCalled();
    expect(fin.applier.has(KNEE)).toBe(false);
    expect(knee.mesh.material).toBe(knee.defaultMaterial);
    expect(hex(app.getSurface(LAST).mesh.material)).toBe('#112233');
    expect(fin.applier.count).toBe(1);
    app.variant.set(before);
    expect(fin.applier.count).toBe(0);
    expect(errors).not.toHaveBeenCalled();
    // to samo przy zwalnianiu wszystkiego naraz (applier.dispose)
    setFinish(KNEE, split(1.5));
    expect(() => fin.applier.dispose()).not.toThrow();
    expect(fin.applier.count).toBe(0);
    app.variant.set(before);
    errors.mockRestore();
  });

  it('podział: zmiana koloru farby jednej części nie tworzy ani nie zwalnia żadnego materiału', () => {
    const s = app.getSurface(WALL);
    setFinish(WALL, split(1.2));
    const [tiles, paint] = s.mesh.material;
    const geometry = s.mesh.geometry;
    const disposed = [];
    for (const m of [tiles, paint]) m.addEventListener('dispose', () => disposed.push(m));
    for (const color of ['#101010', '#202020', '#303030']) {
      setFinish(WALL, { ...split(1.2), upper: { kind: 'paint', color } });
      expect(s.mesh.material[0]).toBe(tiles); // materiał płytek (i jego shader) zostaje
      expect(s.mesh.material[1]).toBe(paint); // farba: tylko nowy kolor
      expect(hex(paint)).toBe(color);
    }
    expect(s.mesh.geometry).toBe(geometry);
    expect(disposed).toEqual([]);
    expect(fin.textures.size).toBe(1);
    // zmiana materiału dolnej części przebudowuje tylko ją
    setFinish(WALL, { ...split(1.2, { kind: 'material', id: 'metro-biale', rot: 90 }), upper: { kind: 'paint', color: '#303030' } });
    expect(s.mesh.material[0]).not.toBe(tiles);
    expect(s.mesh.material[1]).toBe(paint);
    expect(disposed).toEqual([tiles]);
    // farba ↔ farba w dolnej części, górna bez zmian
    setFinish(WALL, { kind: 'split', height: 1.2, lower: { kind: 'paint', color: '#aa0000' }, upper: { kind: 'paint', color: '#303030' } });
    const lowerPaint = s.mesh.material[0];
    setFinish(WALL, { kind: 'split', height: 1.2, lower: { kind: 'paint', color: '#00aa00' }, upper: { kind: 'paint', color: '#303030' } });
    expect(s.mesh.material[0]).toBe(lowerPaint);
    expect(hex(lowerPaint)).toBe('#00aa00');
    expect(s.mesh.material[1]).toBe(paint);
    // powrót do domyślnego zwalnia wszystko, co zostało
    setFinish(WALL, null);
    expect(disposed).toContain(paint);
    expect(fin.textures.size).toBe(0);
    expect(fin.applier.count).toBe(0);
  });

  it('nieznany materiał w części podziału: ta część wygląda domyślnie, druga działa', () => {
    const s = app.getSurface(WALL);
    setFinish(WALL, split(1.2, { kind: 'material', id: 'usuniety', rot: 0 }));
    expect(s.mesh.material.length).toBe(2);
    expect(hex(s.mesh.material[0])).toBe(hex(s.defaultMaterial));
    expect(s.mesh.material[0]).not.toBe(s.defaultMaterial); // kopia – nie zwalniamy materiału rdzenia
    expect(hex(s.mesh.material[1])).toBe('#ddeeff');
    setFinish(WALL, null);
  });

  it('ściany rysowane częściowo przez rdzeń (drawRange): ukrywanie działa także po cięciu', async () => {
    const special = [...app.surfaces.values()].filter((s) => s.mesh.userData.upperStart != null || s.mesh.userData.headerStart != null);
    expect(special.length).toBeGreaterThan(0);
    app.store.setState({ viewMode: 'orbit', levelId: 'parter', showRoof: false }); // domek dla lalek: końcówki ukryte
    await frame();
    for (const s of special) {
      const original = s.mesh.geometry;
      const hiddenFrom = original.drawRange.count;
      if (!Number.isFinite(hiddenFrom)) continue;
      const visibleArea = meshArea(s.mesh, 0, hiddenFrom);
      setFinish(s.id, split(1.0));
      const g = s.mesh.geometry;
      if (g !== original) {
        expect(Number.isFinite(g.drawRange.count), s.id).toBe(true);
        expect(meshArea(s.mesh, 0, g.drawRange.count), s.id).toBeCloseTo(visibleArea, 4); // widać dokładnie to samo co przed cięciem
      }
    }
    // rdzeń pokazuje wszystko → przecięte ściany też rysują całość
    app.store.setState({ showRoof: true, levelId: 'all' });
    await frame();
    for (const s of special) expect(s.mesh.geometry.drawRange.count, s.id).toBe(Infinity);
    // rdzeń znów ukrywa, a potem zdejmujemy wykończenie: oryginalna geometria dostaje aktualny zakres
    app.store.setState({ showRoof: false, levelId: 'parter' });
    await frame();
    clearVariant();
    for (const s of special) {
      const u = s.mesh.userData;
      expect([u.headerStart, u.upperStart, Infinity]).toContain(s.mesh.geometry.drawRange.count);
      expect(s.mesh.geometry.groups.length).toBe(0);
    }
    const tall = special.find((s) => s.mesh.userData.upperStart != null && s.levelId === 'parter');
    if (tall && tall.mesh.userData.headerStart == null) expect(tall.mesh.geometry.drawRange.count).toBe(tall.mesh.userData.upperStart);
  });
});

describe('wykończenia – zaznaczenie i panel', () => {
  it('dotknięcie powierzchni otwiera panel i zaznacza ją; dotknięcie tła zamyka', () => {
    const s = app.getSurface(WALL);
    const selected = vi.fn();
    const off = app.events.on('finishes:select', selected);
    app.events.emit('surface:tap', { surfaceId: WALL, kind: 'wall', levelId: 'parter', roomId: '0/3', point: { x: 0, y: 0, z: 0 } });
    expect(panelEl.classList.contains('is-open')).toBe(true);
    expect(panelEl.querySelector('.panel__title').textContent).toBe(s.label);
    expect(panelEl.textContent).toContain('m²');
    expect(app.store.getState().selection).toEqual({ surfaceId: WALL });
    expect(selected).toHaveBeenCalledWith({ surfaceId: WALL });
    expect(s.mesh.children.length).toBeGreaterThan(0); // obrys
    for (const child of s.mesh.children) expect(child.userData.noPick).toBe(true); // nie przechwytuje dotknięć

    // druga powierzchnia: zaznaczenie się przenosi
    app.events.emit('surface:tap', { surfaceId: FLOOR });
    expect(s.mesh.children.length).toBe(0);
    expect(app.getSurface(FLOOR).mesh.children.length).toBeGreaterThan(0);
    expect(app.store.getState().selection).toEqual({ surfaceId: FLOOR });
    expect(panelEl.querySelector('.panel__title').textContent).toBe(app.getSurface(FLOOR).label);

    app.events.emit('background:tap', {});
    expect(panelEl.classList.contains('is-open')).toBe(false);
    expect(app.getSurface(FLOOR).mesh.children.length).toBe(0);
    expect(app.store.getState().selection).toBeNull();
    off();
  });

  it('panel innej funkcji zamyka nasz i zdejmuje zaznaczenie', () => {
    fin.select(WALL);
    app.ui.openPanel({ title: 'Meble', content: document.createElement('div') });
    expect(app.getSurface(WALL).mesh.children.length).toBe(0);
    expect(fin.panel.isOpen).toBe(false);
    app.events.emit('background:tap', {}); // nie zamykamy cudzego panelu
    expect(panelEl.classList.contains('is-open')).toBe(true);
    app.ui.closePanel();
  });

  it('farba z palety trafia do wariantu i na ścianę', () => {
    fin.select(WALL);
    const swatch = [...panelEl.querySelectorAll('.fin-swatch')].find((b) => b.textContent.includes('Szałwia'));
    click(swatch);
    expect(app.variant.get().finishes[WALL]).toEqual({ kind: 'paint', color: '#c5d1bd' });
    expect(hex(app.getSurface(WALL).mesh.material)).toBe('#c5d1bd');
    // panel narysowany od nowa: wybrany kolor zaznaczony, pojawia się w ostatnio używanych
    expect([...panelEl.querySelectorAll('.fin-swatch.is-active')].map((b) => b.textContent)).toEqual(['Szałwia']);
    expect(panelEl.querySelectorAll('.fin-dots .fin-dot').length).toBeGreaterThan(0);
  });

  it('próbnik koloru: podgląd na żywo nie przebudowuje panelu, zatwierdzenie zapisuje kolor', async () => {
    fin.select(WALL);
    const picker = panelEl.querySelector('input[type="color"]');
    picker.value = '#123456';
    picker.dispatchEvent(new window.Event('input', { bubbles: true }));
    await frame(90);
    expect(app.variant.get().finishes[WALL]).toEqual({ kind: 'paint', color: '#123456' });
    expect(panelEl.querySelector('input[type="color"]')).toBe(picker); // ten sam element – próbnik się nie zamknął
    picker.value = '#654321';
    picker.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(app.variant.get().finishes[WALL]).toEqual({ kind: 'paint', color: '#654321' });
    expect(hex(app.getSurface(WALL).mesh.material)).toBe('#654321');
  });

  it('materiał z biblioteki, format, obrót, układ i fuga', () => {
    fin.select(WALL);
    click(button('Materiały'));
    click(button('Gres'));
    click([...panelEl.querySelectorAll('.fin-mat')].find((b) => b.textContent.includes('Gres betonowy szary')));
    expect(app.variant.get().finishes[WALL]).toEqual({ kind: 'material', id: 'gres-beton-szary', rot: 0 });
    expect(panelEl.textContent).toContain('z zapasem 10%');
    expect(panelEl.textContent).toContain('szt.');
    click(button('60 × 120'));
    expect(app.variant.get().finishes[WALL].size).toEqual([0.6, 1.2]);
    click(button('Obrót 90°'));
    expect(app.variant.get().finishes[WALL].rot).toBe(90);
    click(button('Na cegiełkę'));
    expect(app.variant.get().finishes[WALL].pattern).toBe('brick');
    click(button('5'));
    expect(app.variant.get().finishes[WALL].groutWidth).toBeCloseTo(0.005, 12);
    click(panelEl.querySelector('.fin-dot[title="Fuga: Czarna"]'));
    expect(app.variant.get().finishes[WALL].grout).toBe('#222325');
    click(button('60 × 60')); // format domyślny materiału: nadpisanie rozmiaru znika
    expect(app.variant.get().finishes[WALL].size).toBeUndefined();
    const map = app.getSurface(WALL).mesh.material.map;
    expect(map.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect(JSON.parse(JSON.stringify(app.variant.get()))).toEqual(app.variant.get()); // wariant to nadal zwykły JSON
  });

  it('własny wymiar w centymetrach z przecinkiem', async () => {
    fin.select(WALL);
    const inputs = [...panelEl.querySelectorAll('.fin-options .fin-input')];
    expect(inputs.length).toBe(2);
    for (const i of inputs) expect(i.getAttribute('inputmode')).toBe('decimal');
    inputs[0].value = '7,5';
    inputs[1].value = '30';
    inputs[1].dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(app.variant.get().finishes[WALL].size).toEqual([0.075, 0.3]);
    await frame(320); // panel odświeża się z opóźnieniem po zmianie w polu tekstowym
    expect([...panelEl.querySelectorAll('.fin-options .fin-input')].map((i) => i.value)).toEqual(['7,5', '30']);
    // błędna wartość: nic się nie zmienia
    const again = [...panelEl.querySelectorAll('.fin-options .fin-input')];
    again[0].value = 'abc';
    again[0].dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(app.variant.get().finishes[WALL].size).toEqual([0.075, 0.3]);
    expect(again[0].value).toBe('7,5');
  });

  it('płytki do wysokości z panelu: przełącznik, szybkie przyciski, pole w cm, do sufitu', () => {
    fin.select(WALL);
    const s = app.getSurface(WALL);
    click(button('Płytki do wysokości'));
    let f = app.variant.get().finishes[WALL];
    expect(f.kind).toBe('split');
    expect(f.height).toBe(1.2);
    expect(f.lower.id).toBe('gres-beton-szary'); // dotychczasowy materiał zostaje na dole
    expect(f.upper.kind).toBe('paint');
    expect(Array.isArray(s.mesh.material)).toBe(true);
    click(button('150'));
    expect(app.variant.get().finishes[WALL].height).toBe(1.5);
    const height = panelEl.querySelector('.fin-field .fin-input');
    height.value = '182,5';
    height.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(app.variant.get().finishes[WALL].height).toBe(1.825);

    // górna część: farba
    click(button('Góra – powyżej'));
    click([...panelEl.querySelectorAll('.fin-swatch')].find((b) => b.textContent.includes('Granat')));
    f = app.variant.get().finishes[WALL];
    expect(f.upper).toEqual({ kind: 'paint', color: '#1f2f4a' });
    expect(f.lower.id).toBe('gres-beton-szary');
    expect(hex(s.mesh.material[1])).toBe('#1f2f4a');

    click(button('Do sufitu'));
    f = app.variant.get().finishes[WALL];
    expect(f.kind).toBe('material');
    expect(f.id).toBe('gres-beton-szary');
    expect(Array.isArray(s.mesh.material)).toBe(false);
  });

  it('podłoga nie ma podziału ani płytek ściennych', () => {
    fin.select(FLOOR);
    expect(button('Płytki do wysokości')).toBeUndefined();
    expect(button('Płytki ścienne')).toBeUndefined();
    expect(button('Wykładzina')).toBeTruthy();
    expect(button('Zastosuj do wszystkich ścian pomieszczenia')).toBeUndefined();
    fin.select(WALL);
    click(button('Materiały'));
    expect(button('Wykładzina')).toBeUndefined();
    expect(button('Płytki ścienne')).toBeTruthy();
  });

  it('"zastosuj do wszystkich ścian" i "przywróć domyślne"', () => {
    fin.select(WALL);
    click(button('Płytki do wysokości'));
    click(button('Zastosuj do wszystkich ścian pomieszczenia'));
    const walls = app.surfacesOfRoom('parter', '0/3').filter((s) => s.kind === 'wall' || s.kind === 'chimney');
    expect(walls.length).toBeGreaterThan(2);
    const finishes = app.variant.get().finishes;
    for (const w of walls) expect(finishes[w.id], w.id).toEqual(finishes[WALL]);
    expect(finishes[FLOOR]).toBeUndefined(); // podłoga i sufit nietknięte
    expect(finishes['parter:0/3:ceiling']).toBeUndefined();
    for (const w of walls) expect(w.mesh.material, w.id).not.toBe(w.defaultMaterial);

    click(button('Przywróć domyślne'));
    expect(app.variant.get().finishes[WALL]).toBeUndefined();
    expect(app.getSurface(WALL).mesh.material).toBe(app.getSurface(WALL).defaultMaterial);
    expect(app.variant.get().finishes[WALL_B]).toBeTruthy(); // tylko zaznaczona powierzchnia
    click(button('Zastosuj do wszystkich ścian pomieszczenia')); // domyślne na wszystkie ściany
    expect(Object.keys(app.variant.get().finishes)).toEqual([]);
    expect(fin.applier.count).toBe(0);
    expect(fin.textures.size).toBe(0);
  });

  it('własny materiał: używalny jak biblioteczny, usunięcie przywraca powierzchnie do domyślnych', () => {
    const custom = { id: 'wlasny-test', name: 'Zdjęcie płytki', dataUrl: 'data:image/jpeg;base64,/9j/AAAA', size: [0.25, 0.4] };
    app.variant.update((v) => {
      v.customMaterials.push(custom);
      v.finishes[WALL] = { kind: 'material', id: custom.id, rot: 0 };
      v.finishes[WALL_B] = { kind: 'split', height: 1, lower: { kind: 'material', id: custom.id, rot: 0 }, upper: { kind: 'paint', color: '#ffffff' } };
      v.finishes[FLOOR] = { kind: 'paint', color: '#333333' };
    });
    // zdjęcie wczytuje się asynchronicznie (w happy-dom wcale) – do tego czasu powierzchnia ma kolor zastępczy, bez błędu
    const s = app.getSurface(WALL);
    expect(s.mesh.material).not.toBe(s.defaultMaterial);
    fin.deselect();
    fin.select(WALL);
    expect(button('Własne').classList.contains('is-active')).toBe(true);
    expect(panelEl.textContent).toContain('Zdjęcie płytki');
    expect(panelEl.textContent).toContain('25 × 40 cm');
    expect(panelEl.querySelector('input[type="file"]').getAttribute('accept')).toBe('image/*');

    click(button('Usuń'));
    expect(app.variant.get().customMaterials.length).toBe(1); // pierwsze dotknięcie tylko pyta
    click(button('Na pewno usunąć?'));
    const v = app.variant.get();
    expect(v.customMaterials).toEqual([]);
    expect(v.finishes[WALL]).toBeUndefined();
    expect(v.finishes[WALL_B]).toBeUndefined();
    expect(v.finishes[FLOOR]).toEqual({ kind: 'paint', color: '#333333' });
    expect(s.mesh.material).toBe(s.defaultMaterial);
    expect(app.getSurface(WALL_B).mesh.geometry.groups.length).toBe(0);
    clearVariant();
    fin.deselect();
  });

  it('cele dotykowe: przyciski panelu korzystają z klas o wysokości min. 44 px', () => {
    fin.select(WALL);
    for (const b of panelEl.querySelectorAll('.fin button')) {
      expect(/\b(btn|seg__btn|fin-swatch|fin-dot|fin-mat)\b/.test(b.className), b.outerHTML.slice(0, 80)).toBe(true);
    }
    fin.deselect();
  });
});

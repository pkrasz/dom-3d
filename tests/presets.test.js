// @vitest-environment happy-dom
// Gotowe aranżacje (src/features/variants/presets): rejestr, spójność danych KAŻDEJ aranżacji po złożeniu w jeden
// wariant (meble, materiały, powierzchnie przy bryle z design.json), link i plik (round-trip) oraz dodanie z panelu
// w prawdziwej aplikacji (rdzeń + warianty + wykończenia + meble, renderer WebGL podmieniony atrapą).
// Szczegółowe wymagania aranżacji (drzwi, przejścia, nakładanie mebli) pilnują testy preset.montana.*.test.js.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildHouse } from '../src/geometry/buildHouse.js';
import { buildCollision } from '../src/geometry/collision.js';
import { collides, stairBlockers, withHouseBounds } from '../src/features/furniture/placement.js';
import { CATALOG, MOUNT_RANGE } from '../src/features/furniture/catalog.js';
import { createStarterFurniture } from '../src/features/furniture/starter.js';
import { libraryMaterial } from '../src/features/finishes/library.js';
import { SPLIT_KINDS, materialFits } from '../src/features/finishes/finish.js';
import { PRESETS } from '../src/features/variants/presets/index.js';
import { createMontana } from '../src/features/variants/presets/montana.js';
import * as montanaParter from '../src/features/variants/presets/montana/parter.js';
import * as montanaPoddasze from '../src/features/variants/presets/montana/poddasze.js';
import { CURRENT_VERSION, parseImport, sanitizeVariant } from '../src/features/variants/validate.js';
import { SHARE_LIMITS, createShareLink, decodeShare } from '../src/features/variants/share.js';
import { buildExport } from '../src/features/variants/io.js';
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
const design = JSON.parse(readFileSync(join(root, 'design.json'), 'utf8'));
const BASE = 'https://przyklad.github.io/dom-3d/';

// bryła taka jak w aplikacji (main.js ładuje design.json)
const built = buildHouse(house, design);
const collision = buildCollision(house, design);
const levelIds = house.levels.map((l) => l.id);
const surfaceKinds = new Map([...built.surfaces.values()].map((s) => [s.id, s.kind]));
const typeById = new Map(CATALOG.map((t) => [t.id, t]));
const COLOR = /^#[0-9a-f]{6}$/;
const ZERO_REPORT = { skippedSurfaces: 0, droppedFinishes: 0, droppedFurniture: 0, droppedMaterials: 0 };
const importCtx = () => {
  let n = 0;
  return { makeId: () => `nowy-${++n}`, levelIds, surfaceIds: new Set(surfaceKinds.keys()) };
};
/** Przeszkody mebli na kondygnacji – te same, których używa aplikacja: ściany, kominy, biegi schodów, obrys domu. */
const blockersOf = (levelId) => {
  const level = house.levels.find((l) => l.id === levelId);
  return withHouseBounds([...collision.walls(levelId), ...(level.stairs ? stairBlockers(level.stairs) : [])]);
};

describe('rejestr gotowych aranżacji', () => {
  it('ma poprawne, unikalne wpisy; jest w nim „Montana”', () => {
    expect(PRESETS.length).toBeGreaterThan(0);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map((p) => p.name.toLocaleLowerCase('pl'))).size).toBe(PRESETS.length);
    for (const p of PRESETS) {
      expect(p.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(p.name.trim().length).toBeGreaterThan(0);
      expect(p.name.length).toBeLessThanOrEqual(40);
      expect(p.description.trim().length).toBeGreaterThan(10);
      expect(p.create).toBeTypeOf('function');
    }
    expect(PRESETS.find((p) => p.id === 'montana')?.name).toBe('Montana');
  });

  it('create() za każdym razem daje nową, niezależną kopię', () => {
    for (const p of PRESETS) {
      const a = p.create();
      const snapshot = JSON.stringify(a);
      a.furniture.length = 0;
      for (const key of Object.keys(a.finishes)) delete a.finishes[key];
      expect(JSON.stringify(p.create()), p.id).toBe(snapshot);
    }
  });
});

describe('Montana – złożenie parteru i poddasza', () => {
  const v = createMontana();

  it('to suma obu modułów: nic nie zginęło ani się nie nadpisało', () => {
    expect(v).toMatchObject({ id: 'montana', name: 'Montana', customMaterials: [] });
    const keysP = Object.keys(montanaParter.finishes);
    const keysA = Object.keys(montanaPoddasze.finishes);
    expect(keysP.filter((k) => keysA.includes(k))).toEqual([]);
    expect(Object.keys(v.finishes)).toHaveLength(keysP.length + keysA.length);
    expect(v.furniture).toHaveLength(montanaParter.furniture.length + montanaPoddasze.furniture.length);
    expect(v.furniture).toEqual([...montanaParter.furniture, ...montanaPoddasze.furniture]);
  });

  it('każdy moduł dotyka tylko swojej kondygnacji – meble parteru i poddasza nie mogą się spotkać', () => {
    for (const [mod, levelId] of [[montanaParter, 'parter'], [montanaPoddasze, 'poddasze']]) {
      expect(mod.furniture.filter((f) => f.levelId !== levelId).map((f) => f.id)).toEqual([]);
      expect(Object.keys(mod.finishes).filter((k) => !k.startsWith(`${levelId}:`))).toEqual([]);
    }
  });

  it('zachowuje meble z projektu (te same id, typy, położenia i wymiary) – poza szafą w sypialni 1/9, usuniętą na życzenie', () => {
    const byId = new Map(v.furniture.map((f) => [f.id, f]));
    const geometry = ({ type, levelId, x, y, rot, w, d, h }) => ({ type, levelId, x, y, rot, w, d, h });
    const REMOVED = ['start-szafa-1-9']; // w jej miejscu toaletka (życzenie właściciela)
    for (const id of REMOVED) expect(byId.has(id), id).toBe(false);
    expect(v.furniture.filter((f) => f.id.startsWith('start-'))).toHaveLength(createStarterFurniture().length - REMOVED.length);
    for (const s of createStarterFurniture().filter((f) => !REMOVED.includes(f.id))) {
      expect(byId.has(s.id), s.id).toBe(true);
      expect(geometry(byId.get(s.id)), s.id).toEqual(geometry(s));
    }
  });

  it('życzenia do kuchni z jadalnią: wyspa-barek z hokerami, drewniane blaty, stół na 6 osób z 6 krzesłami', () => {
    const island = v.furniture.filter((f) => f.type === 'wyspa-barek' || f.type === 'wyspa-mala');
    expect(island).toHaveLength(1);
    expect(v.furniture.filter((f) => f.type === 'hoker').length).toBeGreaterThanOrEqual(2);
    expect(v.furniture.filter((f) => f.type === 'stol-6')).toHaveLength(1);
    expect(v.furniture.filter((f) => f.type === 'krzeslo' && f.levelId === 'parter')).toHaveLength(6);
    // blat = drugi kolor szafek kuchennych; brak pola oznacza domyślny dąb typu
    const kitchen = v.furniture.filter((f) => /^kuchnia-(dolna|zlew|plyta|wyspa)$/.test(f.type) || /^wyspa-(barek|mala)$/.test(f.type));
    expect(kitchen.length).toBeGreaterThan(3);
    for (const f of kitchen) expect(f.color2 ?? typeById.get(f.type).color2, f.id).toBe('#b5895a');
    // jedna podłoga w salonie z jadalnią, kuchni, korytarzu i spiżarni
    for (const room of ['0/2', '0/4', '0/5', '0/6']) expect(v.finishes[`parter:${room}:floor`].id, room).toBe('gres-jodelka-dab-cieply');
  });
});

describe.each(PRESETS.map((p) => [p.id, p]))('aranżacja „%s” – spójność danych', (_id, preset) => {
  const v = preset.create();

  it('ma kształt wariantu bez własnych materiałów (mieści się w linku)', () => {
    expect(Object.keys(v).sort()).toEqual(['customMaterials', 'finishes', 'furniture', 'id', 'name']);
    expect(v.customMaterials).toEqual([]);
    expect(v.furniture.length).toBeGreaterThan(0);
    expect(Object.keys(v.finishes).length).toBeGreaterThan(0);
  });

  it('meble: unikalne id, znane kondygnacje i typy z katalogu, wymiary w zakresie typu, poprawne kolory', () => {
    expect(new Set(v.furniture.map((f) => f.id)).size).toBe(v.furniture.length);
    for (const f of v.furniture) {
      expect(levelIds, f.id).toContain(f.levelId);
      const type = typeById.get(f.type);
      expect(type, `${f.id}: nieznany typ ${f.type}`).toBeTruthy();
      for (const k of ['w', 'd', 'h']) {
        expect(f[k], `${f.id}.${k}`).toBeGreaterThanOrEqual(type.range[k][0] - 1e-9);
        expect(f[k], `${f.id}.${k}`).toBeLessThanOrEqual(type.range[k][1] + 1e-9);
      }
      expect(f.color, f.id).toMatch(COLOR);
      if ('color2' in f) {
        expect(f.color2, f.id).toMatch(COLOR);
        expect(type.color2, `${f.id}: typ ${f.type} nie ma drugiego koloru`).toBeTruthy();
      }
      if ('z' in f) {
        expect(f.z, f.id).toBeGreaterThanOrEqual(MOUNT_RANGE[0]);
        expect(f.z, f.id).toBeLessThanOrEqual(MOUNT_RANGE[1]);
      }
    }
  });

  it('żaden mebel nie wchodzi w ścianę, komin, bieg schodów ani poza dom (bryła z design.json)', () => {
    const blockers = new Map(levelIds.map((id) => [id, blockersOf(id)]));
    expect(v.furniture.filter((f) => collides(f, blockers.get(f.levelId))).map((f) => f.id)).toEqual([]);
  });

  it('meble mieszczą się pod sufitem, skosem i podciągiem w miejscu, w którym stoją', () => {
    for (const f of v.furniture) {
      const ceil = collision.ceilingAt(f.levelId, f.x, f.y);
      if (ceil != null) expect((f.z || 0) + f.h, f.id).toBeLessThanOrEqual(ceil + 1e-6);
    }
  });

  it('wykończenia: każda powierzchnia istnieje, każdy materiał jest w bibliotece i pasuje do rodzaju powierzchni', () => {
    const checkSimple = (finish, kind, where) => {
      if (finish.kind === 'paint') return expect(finish.color, where).toMatch(COLOR);
      expect(finish.kind, where).toBe('material');
      const def = libraryMaterial(finish.id);
      expect(def, `${where}: nieznany materiał ${finish.id}`).toBeTruthy();
      expect(materialFits(def, kind), `${where}: ${finish.id} nie pasuje do „${kind}”`).toBe(true);
      expect([0, 90], where).toContain(finish.rot);
    };
    for (const [surfaceId, finish] of Object.entries(v.finishes)) {
      const kind = surfaceKinds.get(surfaceId);
      expect(kind, `nieznana powierzchnia ${surfaceId}`).toBeTruthy();
      if (finish.kind === 'split') {
        expect(SPLIT_KINDS, surfaceId).toContain(kind);
        checkSimple(finish.lower, kind, `${surfaceId} (dół)`);
        checkSimple(finish.upper, kind, `${surfaceId} (góra)`);
      } else checkSimple(finish, kind, surfaceId);
    }
  });

  it('przechodzi walidację importu bez strat (także pola dodatkowe mebli: z, color2)', () => {
    const ctx = importCtx();
    const { variant, report } = sanitizeVariant(preset.create(), ctx);
    expect(report).toEqual(ZERO_REPORT);
    expect(variant).toEqual(v);
    expect(ctx.makeId()).toBe('nowy-1'); // żaden id nie musiał być wygenerowany na nowo
  });

  it('plik eksportu → import daje ten sam wariant', () => {
    const text = JSON.stringify(buildExport([v], new Date('2026-11-24T12:00:00.000Z')), null, 1);
    const parsed = parseImport(text, importCtx());
    expect(parsed.ok).toBe(true);
    expect(parsed.report).toEqual(ZERO_REPORT);
    expect(parsed.variants).toEqual([v]);
  });

  it('mieści się w linku udostępniania, a link odtwarza ten sam wariant', async () => {
    const link = await createShareLink(v, { baseUrl: BASE });
    expect(link.ok, link.message).toBe(true);
    // zapas na dłuższy adres strony i na drobne zmiany aranżacji – przy przekroczeniu trzeba odchudzić dane, nie limit
    expect(link.url.length).toBeLessThanOrEqual(SHARE_LIMITS.urlChars - 500);
    const decoded = await decodeShare(link.url.split('#w=')[1]);
    expect(decoded.ok).toBe(true);
    const parsed = parseImport(JSON.stringify({ app: 'model3d-dom', version: decoded.dataVersion, variants: [decoded.variant] }), importCtx());
    expect(parsed.ok).toBe(true);
    expect(parsed.report).toEqual(ZERO_REPORT);
    expect(parsed.variants).toEqual([v]);
  });

  it('link bez kompresji (stare przeglądarki) jest uczciwie odrzucany jako za długi albo też odtwarza wariant', async () => {
    const link = await createShareLink(v, { baseUrl: BASE, streams: {} });
    if (!link.ok) return expect(link.reason).toBe('tooLong');
    const decoded = await decodeShare(link.url.split('#w=')[1]);
    expect(decoded.variant.furniture).toHaveLength(v.furniture.length);
  });
});

// ================================================================================================ w aplikacji
const W = 800;
const H = 600;
const frame = () => new Promise((resolve) => setTimeout(resolve, 40));

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, val) => data.set(k, String(val)),
    removeItem: (k) => data.delete(k),
  };
}

/** Atrapa kontekstu 2D: przyjmuje każde wywołanie – tekstury materiałów naprawdę się „rysują” (wyjątek = ostrzeżenie). */
function fakeContext(canvas) {
  const gradient = { addColorStop() {} };
  const target = { canvas };
  return new Proxy(target, {
    get(t, key) {
      if (key in t) return t[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern') return () => gradient;
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'getImageData' || key === 'createImageData') return (a, b, c, d) => ({ data: new Uint8ClampedArray(4 * (c || a) * (d || b)), width: c || a, height: d || b });
      return () => undefined;
    },
    set(t, key, value) {
      t[key] = value;
      return true;
    },
  });
}

/** Składa aplikację jak main.js: bryła z design.json, potem warianty → wykończenia → meble. */
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

  const app = createApp({ house, design, container, canvas, uiRoot });
  let n = 0;
  const variants = initVariants(app, { storage, makeId: () => `test-${++n}`, baseUrl: () => BASE, nav: null });
  const finishes = initFinishes(app);
  const furniture = initFurniture(app);
  app.start();
  await frame();
  return {
    app, uiRoot, variants, finishes, furniture,
    button: (text) => [...uiRoot.querySelectorAll('.panel button')].find((b) => b.textContent.trim() === text),
    sceneIds: () => levelIds.flatMap((id) => app.furnitureGroup(id).children.map((c) => c.userData.furnitureId).filter(Boolean)).sort(),
    isDefault: (surfaceId) => {
      const s = app.getSurface(surfaceId);
      return s.mesh.material === s.defaultMaterial;
    },
  };
}

describe('gotowa aranżacja w aplikacji (panel Warianty → „Gotowe aranżacje”)', () => {
  const mine = [
    { id: 'moj-1', name: 'Mój salon', finishes: { 'parter:0/6:floor': { kind: 'paint', color: '#aa3322' } }, furniture: [], customMaterials: [] },
    { id: 'montana', name: 'Montana', finishes: {}, furniture: [{ id: 'm-1', type: 'sofa-3', levelId: 'parter', x: 11.2, y: 6, rot: 0, w: 2.2, d: 0.95, h: 0.85, color: '#8a8f98' }], customMaterials: [] },
  ];
  let errors;
  let warnings;
  let originalGetContext;

  beforeAll(() => {
    errors = vi.spyOn(console, 'error');
    warnings = vi.spyOn(console, 'warn');
    originalGetContext = window.HTMLCanvasElement.prototype.getContext;
    window.HTMLCanvasElement.prototype.getContext = function getContext(type) {
      return type === '2d' ? fakeContext(this) : null;
    };
  });
  afterAll(() => {
    window.HTMLCanvasElement.prototype.getContext = originalGetContext;
    errors.mockRestore();
    warnings.mockRestore();
  });

  it('nowy użytkownik (pusta pamięć) dalej startuje od „Wariant 1” z meblami z projektu', async () => {
    const t = await boot(fakeStorage());
    const state = t.variants.getState();
    expect(state.variants.map((x) => x.name)).toEqual(['Wariant 1']);
    expect(t.app.variant.get().finishes).toEqual({});
    expect(t.app.variant.get().furniture).toEqual(createStarterFurniture());
    expect(t.variants.listPresets().map((p) => p.id)).toEqual(PRESETS.map((p) => p.id));
    t.variants.destroy();
  });

  it('przycisk „Montana” dodaje NOWY wariant i przełącza na niego; zapisane warianty zostają nietknięte', async () => {
    const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify({ version: CURRENT_VERSION, activeId: 'moj-1', savedAt: '2026-11-20T08:30:00.000Z', variants: mine }) });
    const t = await boot(storage);
    expect(t.variants.getState().variants).toEqual(mine);

    t.variants.openPanel();
    const group = t.uiRoot.querySelector('.war-presets');
    expect(group.textContent).toContain('Gotowe aranżacje');
    expect(group.closest('.war').textContent.indexOf('Nowy wariant')).toBeLessThan(group.closest('.war').textContent.indexOf('Gotowe aranżacje'));
    t.button('Montana').click();
    await frame();

    const expected = createMontana();
    const active = t.app.variant.get();
    const state = t.variants.getState();
    expect(state.variants).toHaveLength(3);
    expect(state.variants.slice(0, 2)).toEqual(mine); // nic nie nadpisane – także wariant o tym samym id i nazwie
    expect(state.activeId).toBe(active.id);
    expect(active.id).not.toBe('montana'); // kolizja id → nowy id
    expect(active.name).toBe('Montana (2)'); // kolizja nazwy → dopisek, jak przy imporcie
    expect(active.finishes).toEqual(expected.finishes);
    expect(active.furniture).toEqual(expected.furniture);
    expect(t.uiRoot.querySelector('[data-id="variants"]').getAttribute('aria-label')).toBe('Warianty – aktywny: Montana (2)');

    // scena: każdy mebel ma bryłę, każda powierzchnia z wariantu dostała wykończenie
    expect(t.sceneIds()).toEqual(expected.furniture.map((f) => f.id).sort());
    const untouched = Object.keys(expected.finishes).filter((id) => t.isDefault(id));
    expect(untouched).toEqual([]);
    expect(t.finishes.applier.count).toBe(Object.keys(expected.finishes).length);
    for (const id of ['poddasze:1/9:slope-N', 'poddasze:1/9:slope-S']) expect(t.app.getSurface(id), id).toBeTruthy(); // otwarty sufit z design.json

    // drugi raz: kolejna kopia, poprzednia zostaje
    t.button('Montana').click();
    expect(t.variants.getState().variants.map((x) => x.name)).toEqual(['Mój salon', 'Montana', 'Montana (2)', 'Montana (3)']);

    // powrót do własnego wariantu przywraca jego scenę, a Montana wraca w całości po ponownym przełączeniu
    t.variants.switchTo('moj-1');
    expect(t.sceneIds()).toEqual([]);
    expect(t.isDefault('parter:0/5:floor')).toBe(true);
    t.variants.switchTo(active.id);
    expect(t.sceneIds()).toHaveLength(expected.furniture.length);

    // link do dodanego wariantu powstaje i odtwarza go u odbiorcy
    const link = await t.variants.shareLink();
    expect(link.ok, link.message).toBe(true);
    const read = await t.variants.readShared(link.url.split('#w=')[1]);
    expect(read.ok).toBe(true);
    expect(read.report).toEqual(ZERO_REPORT);
    expect({ ...read.variant, id: active.id }).toEqual(active);

    // „po odświeżeniu strony”: wszystko jest w zapisie
    t.variants.flush();
    t.variants.destroy();
    const again = await boot(storage);
    expect(again.variants.getState().variants.map((x) => x.name)).toEqual(['Mój salon', 'Montana', 'Montana (2)', 'Montana (3)']);
    expect(again.app.variant.get()).toEqual(active);
    expect(again.sceneIds()).toEqual(expected.furniture.map((f) => f.id).sort());
    again.variants.destroy();

    expect(errors.mock.calls).toEqual([]);
    expect(warnings.mock.calls).toEqual([]);
  });

  it('bez design.json (bryła z projektu) aranżacja też się dodaje – pomija tylko powierzchnie otwartego sufitu', async () => {
    const { createStore, createEmitter } = await import('../src/app/store.js');
    const { createEmptyVariant } = await import('../src/app/variant.js');
    const { createController } = await import('../src/features/variants/controller.js');
    const { createStorage } = await import('../src/features/variants/storage.js');
    const plain = buildHouse(house);
    const store = createStore({ variant: createEmptyVariant() });
    const events = createEmitter();
    store.subscribe((state, prev, changed) => {
      if (changed.includes('variant')) events.emit('variant:change', { variant: state.variant, previous: prev.variant });
    });
    const toasts = [];
    const app = {
      house, surfaces: plain.surfaces, store, events,
      variant: { get: () => store.getState().variant, set: (variant) => store.setState({ variant }) },
      ui: { toast: (text) => toasts.push(text) },
    };
    let n = 0;
    const controller = createController(app, { storage: createStorage({ storage: fakeStorage() }), makeId: () => `gen-${++n}`, presets: PRESETS });
    const result = controller.addPreset('montana');
    expect(result.ok).toBe(true);
    expect(result.name).toBe('Montana');
    expect(result.report).toEqual({ ...ZERO_REPORT, skippedSurfaces: 2 });
    expect(result.message).toMatch(/Dodano wariant «Montana»\. Pominięto 2 wykończenia powierzchni/);
    const missing = Object.keys(createMontana().finishes).filter((id) => !(id in app.variant.get().finishes));
    expect(missing).toEqual(['poddasze:1/9:slope-S', 'poddasze:1/9:slope-N'].filter((id) => missing.includes(id)));
    expect(missing).toHaveLength(2);
    expect(controller.addPreset('nie-ma-takiej')).toMatchObject({ ok: false });
    controller.dispose();
  });
});

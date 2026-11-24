// @vitest-environment happy-dom
// Funkcja „warianty” na atrapie rdzenia: wczytanie stanu, autozapis (także awarie localStorage), przełączanie,
// usuwanie, eksport / import i panel. Atrapa używa PRAWDZIWEGO magazynu stanu i emitera z rdzenia, więc
// 'variant:change' zachowuje się jak w aplikacji; nie ma tylko sceny 3D.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStore, createEmitter } from '../src/app/store.js';
import { createEmptyVariant, cloneVariant } from '../src/app/variant.js';
import { createStorage, STORAGE_KEY, isQuotaError } from '../src/features/variants/storage.js';
import { createController } from '../src/features/variants/controller.js';
import { createVariantsPanel, statusText } from '../src/features/variants/panel.js';
import { APP_ID, CURRENT_VERSION, LIMITS } from '../src/features/variants/validate.js';

// Meble startowe pisze równolegle inna osoba – tutaj podmieniamy moduł i niczego o nim nie zakładamy.
vi.mock('../src/features/furniture/starter.js', () => ({
  createStarterFurniture: () => [{ id: 'start-1', type: 'sofa', levelId: 'parter', x: 3, y: 4, rot: 0, w: 2.2, d: 0.95, h: 0.8, color: '#777777' }],
}));

const SURFACES = ['parter:0/3:wall:2', 'parter:0/3:floor', 'poddasze:1/7:slope-S'];
const sofa = { id: 's1', type: 'sofa', levelId: 'parter', x: 3, y: 4, rot: 0, w: 2.2, d: 0.95, h: 0.8, color: '#777777' };

/** Atrapa obiektu app – tylko to, z czego korzystają warianty. */
function fakeApp() {
  const store = createStore({ variant: createEmptyVariant() });
  const events = createEmitter();
  store.subscribe((state, prev, changed) => {
    if (changed.includes('variant')) events.emit('variant:change', { variant: state.variant, previous: prev.variant });
  });
  const toasts = [];
  const panels = [];
  const buttons = [];
  let currentPanel = null;
  const closePanel = () => {
    const p = currentPanel;
    currentPanel = null;
    p?.onClose?.();
  };
  return {
    house: { levels: [{ id: 'parter' }, { id: 'poddasze' }] },
    surfaces: new Map(SURFACES.map((id) => [id, { id }])),
    store,
    events,
    variant: {
      get: () => store.getState().variant,
      update(mutator) {
        const draft = cloneVariant(store.getState().variant);
        store.setState({ variant: mutator(draft) || draft });
      },
      set: (variant) => store.setState({ variant }),
    },
    ui: {
      toast: (text) => toasts.push(text),
      openPanel(options) {
        closePanel();
        currentPanel = options;
        panels.push(options);
        return { close: closePanel, setTitle() {} };
      },
      closePanel,
      addToolbarButton(options) {
        const element = document.createElement('button');
        const b = { options, label: options.label, active: false, element, setActive: (v) => (b.active = v), setLabel: (t) => (b.label = t), remove: () => (b.removed = true) };
        buttons.push(b);
        return b;
      },
    },
    toasts,
    panels,
    buttons,
    get currentPanel() {
      return currentPanel;
    },
  };
}

/** Atrapa localStorage z licznikiem zapisów i przełącznikiem awarii. */
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  const s = {
    data,
    writes: 0,
    failWith: null, // wyjątek rzucany przy zapisie klucza wariantów
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      if (s.failWith && k === STORAGE_KEY) throw s.failWith;
      if (k === STORAGE_KEY) s.writes += 1;
      data.set(k, String(v));
    },
    removeItem: (k) => data.delete(k),
  };
  return s;
}
const quotaError = () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError', code: 22 });
const saved = (raw) => JSON.parse(raw.data.get(STORAGE_KEY));

function idGenerator() {
  let n = 0;
  return () => `gen-${++n}`;
}
const NOW = new Date('2026-11-24T12:00:00.000Z');

function setup({ raw = fakeStorage(), starter = () => [sofa], now = () => NOW } = {}) {
  const app = fakeApp();
  const seen = [];
  app.events.on('variant:change', (e) => seen.push(e));
  const controller = createController(app, { storage: createStorage({ storage: raw }), makeId: idGenerator(), now, createStarter: starter });
  return { app, raw, controller, seen };
}

const storedState = (patch = {}) => JSON.stringify({
  version: CURRENT_VERSION,
  activeId: 'b',
  savedAt: '2026-11-20T08:30:00.000Z',
  variants: [
    { id: 'a', name: 'Jasny', finishes: { 'parter:0/3:floor': { kind: 'paint', color: '#ffffff' } }, furniture: [], customMaterials: [] },
    { id: 'b', name: 'Ciemny', finishes: { 'parter:0/3:floor': { kind: 'paint', color: '#222222' } }, furniture: [sofa], customMaterials: [] },
  ],
  ...patch,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('start', () => {
  it('bez zapisu tworzy „Wariant 1” z meblami z projektu i ustawia go w rdzeniu', () => {
    const { app, controller, raw } = setup();
    const v = app.variant.get();
    expect(v.name).toBe('Wariant 1');
    expect(v.furniture).toEqual([sofa]);
    expect(v.finishes).toEqual({});
    expect(controller.getState().activeId).toBe(v.id);
    expect(controller.getState().variants).toHaveLength(1);
    expect(raw.writes).toBe(0);
    vi.advanceTimersByTime(500);
    expect(saved(raw)).toMatchObject({ version: CURRENT_VERSION, activeId: v.id, savedAt: NOW.toISOString() });
    expect(app.toasts).toEqual([]);
  });

  it('meble startowe są oczyszczane, a błąd generatora nie zatrzymuje startu', () => {
    const a = setup({ starter: () => [sofa, { type: 'bez wymiarów' }, null, { ...sofa, id: 'wisi', z: 1.4 }] });
    expect(a.app.variant.get().furniture.map((f) => f.id)).toEqual(['s1', 'wisi']);
    expect(a.app.variant.get().furniture[1].z).toBe(1.4);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const b = setup({ starter: () => { throw new Error('ups'); } });
    expect(b.app.variant.get().furniture).toEqual([]);
    errors.mockRestore();
  });

  it('wczytuje zapisany stan i aktywny wariant, nie zapisując go od razu ponownie', () => {
    const raw = fakeStorage({ [STORAGE_KEY]: storedState() });
    const { app, controller } = setup({ raw });
    expect(app.variant.get().name).toBe('Ciemny');
    expect(app.variant.get().furniture).toEqual([sofa]);
    expect(controller.getState()).toMatchObject({ activeId: 'b', status: 'saved', savedAt: '2026-11-20T08:30:00.000Z' });
    vi.advanceTimersByTime(2000);
    expect(raw.writes).toBe(0);
  });

  it('nowsza wersja zapisu: nie nadpisuje, pokazuje komunikat, działa dalej', () => {
    const text = storedState({ version: CURRENT_VERSION + 1 });
    const raw = fakeStorage({ [STORAGE_KEY]: text });
    const { app, controller } = setup({ raw });
    expect(app.toasts).toHaveLength(1);
    expect(app.toasts[0]).toMatch(/nowszej wersji/);
    expect(controller.getState().status).toBe('readonly');
    app.variant.update((d) => {
      d.finishes['parter:0/3:floor'] = { kind: 'paint', color: '#123456' };
    });
    controller.createFromProject();
    vi.advanceTimersByTime(5000);
    controller.flush();
    expect(raw.data.get(STORAGE_KEY)).toBe(text);
    expect(raw.writes).toBe(0);
    expect(app.variant.get().name).toBe('Wariant 2');
  });

  it('uszkodzony zapis: kopia pod osobnym kluczem, start od nowa z komunikatem', () => {
    const raw = fakeStorage({ [STORAGE_KEY]: '{"version":1,"variants":[{' });
    const { app } = setup({ raw });
    expect(app.variant.get().name).toBe('Wariant 1');
    expect(app.toasts[0]).toMatch(/uszkodzone/);
    expect(raw.data.get(`${STORAGE_KEY}:uszkodzony`)).toBe('{"version":1,"variants":[{');
    vi.advanceTimersByTime(500);
    expect(saved(raw).variants).toHaveLength(1);
  });

  it('zablokowany storage (tryb prywatny): praca bez zapisu i jedna informacja', () => {
    const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); }, removeItem() {} };
    const { app, controller } = setup({ raw: blocked });
    expect(app.variant.get().name).toBe('Wariant 1');
    expect(controller.getState().status).toBe('unavailable');
    for (let i = 0; i < 5; i += 1) {
      app.variant.update((d) => {
        d.name = `Zmiana ${i}`;
      });
      vi.advanceTimersByTime(1000);
    }
    expect(app.toasts).toHaveLength(1);
    expect(app.toasts[0]).toMatch(/wyeksportuj/i);

    const none = setup({ raw: null }); // w ogóle brak localStorage
    expect(none.controller.getState().status).toBe('unavailable');
    expect(none.app.toasts).toHaveLength(1);
  });
});

describe('autozapis', () => {
  it('zapisuje z opóźnieniem i łączy serię zmian w jeden zapis', () => {
    const { app, raw, controller } = setup();
    vi.advanceTimersByTime(500);
    const before = raw.writes;
    for (const color of ['#111111', '#222222', '#333333']) {
      app.variant.update((d) => {
        d.finishes['parter:0/3:floor'] = { kind: 'paint', color };
      });
      vi.advanceTimersByTime(100);
    }
    expect(raw.writes).toBe(before);
    expect(controller.getState().status).toBe('pending');
    vi.advanceTimersByTime(399);
    expect(raw.writes).toBe(before + 1);
    expect(saved(raw).variants[0].finishes['parter:0/3:floor'].color).toBe('#333333');
    expect(controller.getState().status).toBe('saved');
    vi.advanceTimersByTime(5000);
    expect(raw.writes).toBe(before + 1); // bez zmian nie ma kolejnych zapisów
  });

  it('flush zapisuje natychmiast tylko wtedy, gdy są zmiany', () => {
    const { app, raw, controller } = setup();
    vi.advanceTimersByTime(500);
    const before = raw.writes;
    expect(controller.flush()).toBe(false);
    app.variant.update((d) => {
      d.furniture.push({ ...sofa, id: 's2' });
    });
    expect(controller.flush()).toBe(true);
    expect(raw.writes).toBe(before + 1);
    expect(saved(raw).variants[0].furniture).toHaveLength(2);
    vi.advanceTimersByTime(1000);
    expect(raw.writes).toBe(before + 1); // zaplanowany zapis został anulowany
  });

  it('QuotaExceededError: aplikacja działa, jeden komunikat na serię, poprzedni zapis zostaje', () => {
    const { app, raw, controller } = setup();
    vi.advanceTimersByTime(500);
    const good = raw.data.get(STORAGE_KEY);
    raw.failWith = quotaError();
    for (let i = 0; i < 6; i += 1) {
      expect(() => app.variant.update((d) => {
        d.customMaterials.push({ id: `t${i}`, name: 'Duża', dataUrl: 'data:image/png;base64,AAAA', size: [1, 1] });
      })).not.toThrow();
      vi.advanceTimersByTime(1000);
    }
    expect(app.variant.get().customMaterials).toHaveLength(6); // praca trwa mimo braku zapisu
    expect(controller.getState().status).toBe('quota');
    expect(app.toasts).toHaveLength(1);
    expect(app.toasts[0]).toMatch(/Brak miejsca/);
    expect(app.toasts[0]).toMatch(/Wyeksportuj wariant do pliku/);
    expect(raw.data.get(STORAGE_KEY)).toBe(good);

    // miejsce się zwolniło → zapis wraca; kolejna awaria znów daje (jeden) komunikat
    raw.failWith = null;
    app.variant.update((d) => {
      d.customMaterials.length = 0;
    });
    vi.advanceTimersByTime(500);
    expect(controller.getState().status).toBe('saved');
    expect(saved(raw).variants[0].customMaterials).toEqual([]);
    raw.failWith = quotaError();
    app.variant.update((d) => {
      d.name = 'Jeszcze raz';
    });
    vi.advanceTimersByTime(500);
    expect(app.toasts).toHaveLength(2);
  });

  it('inny błąd zapisu też nie wywraca aplikacji', () => {
    const { app, raw, controller } = setup();
    vi.advanceTimersByTime(500);
    raw.failWith = new Error('dysk');
    app.variant.update((d) => {
      d.name = 'X';
    });
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    expect(controller.getState().status).toBe('error');
    expect(app.toasts).toHaveLength(1);
  });

  it('rozpoznaje błąd przepełnienia w różnych przeglądarkach', () => {
    expect(isQuotaError(quotaError())).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED', code: 1014 })).toBe(true);
    expect(isQuotaError({ code: 22 })).toBe(true);
    expect(isQuotaError(new Error('inny'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});

describe('lista wariantów', () => {
  const load = () => setup({ raw: fakeStorage({ [STORAGE_KEY]: storedState() }) });

  it('przełączanie emituje variant:change z pełnym wariantem i zapisuje aktywny', () => {
    const { app, controller, seen, raw } = load();
    seen.length = 0;
    expect(controller.switchTo('a')).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].variant).toEqual({ id: 'a', name: 'Jasny', finishes: { 'parter:0/3:floor': { kind: 'paint', color: '#ffffff' } }, furniture: [], customMaterials: [] });
    expect(seen[0].previous.id).toBe('b');
    expect(app.variant.get()).toBe(seen[0].variant);
    expect(controller.getState().activeId).toBe('a');
    vi.advanceTimersByTime(500);
    expect(saved(raw).activeId).toBe('a');

    expect(controller.switchTo('a')).toBe(true); // już aktywny – bez zdarzenia
    expect(seen).toHaveLength(1);
    expect(controller.switchTo('nie-ma')).toBe(false);
  });

  it('zmiany trafiają do aktywnego wariantu i przeżywają przełączenie tam i z powrotem', () => {
    const { app, controller } = load();
    app.variant.update((d) => {
      d.finishes['parter:0/3:wall:2'] = { kind: 'paint', color: '#00ff00' };
    });
    controller.switchTo('a');
    expect(app.variant.get().finishes['parter:0/3:wall:2']).toBeUndefined();
    controller.switchTo('b');
    expect(app.variant.get().finishes['parter:0/3:wall:2']).toEqual({ kind: 'paint', color: '#00ff00' });
  });

  it('nowy pusty (meble z projektu) i kopia bieżącego stają się aktywne', () => {
    const { app, controller, seen } = load();
    seen.length = 0;
    const created = controller.createFromProject();
    expect(created.ok).toBe(true);
    expect(app.variant.get()).toMatchObject({ id: created.id, name: 'Wariant 3', finishes: {}, furniture: [sofa], customMaterials: [] });
    expect(seen).toHaveLength(1);

    controller.switchTo('b');
    const copy = controller.duplicateActive();
    const v = app.variant.get();
    expect(v.id).toBe(copy.id);
    expect(v.id).not.toBe('b');
    expect(v.name).toBe('Ciemny – kopia');
    expect(v.finishes).toEqual({ 'parter:0/3:floor': { kind: 'paint', color: '#222222' } });
    expect(controller.getState().variants.map((x) => x.name)).toEqual(['Jasny', 'Ciemny', 'Wariant 3', 'Ciemny – kopia']);

    // kopia jest niezależna od oryginału
    app.variant.update((d) => {
      d.finishes['parter:0/3:floor'].color = '#abcdef';
    });
    controller.switchTo('b');
    expect(app.variant.get().finishes['parter:0/3:floor'].color).toBe('#222222');
    expect(controller.duplicateActive().ok).toBe(true);
    expect(app.variant.get().name).toBe('Ciemny – kopia (2)');
  });

  it('pilnuje limitu liczby wariantów', () => {
    const { controller } = load();
    while (controller.getState().variants.length < LIMITS.variants) expect(controller.createFromProject().ok).toBe(true);
    const result = controller.createFromProject();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/najwyżej/);
    expect(controller.duplicateActive().ok).toBe(false);
    expect(controller.getState().variants).toHaveLength(LIMITS.variants);
  });

  it('zmiana nazwy: aktywnego przez rdzeń, nieaktywnego na liście; pusta nazwa odrzucona', () => {
    const { app, controller, seen, raw } = load();
    seen.length = 0;
    expect(controller.rename('b', '  Grafit  ')).toBe(true);
    expect(app.variant.get().name).toBe('Grafit');
    expect(seen).toHaveLength(1);
    expect(controller.rename('a', 'Grafit')).toBe(true); // kolizja → dopisek
    expect(controller.getState().variants.map((v) => v.name)).toEqual(['Grafit (2)', 'Grafit']);
    expect(seen).toHaveLength(1); // nieaktywny: bez przebudowy sceny
    expect(controller.rename('a', '   ')).toBe(false);
    expect(controller.rename('nie-ma', 'X')).toBe(false);
    vi.advanceTimersByTime(500);
    expect(saved(raw).variants.map((v) => v.name)).toEqual(['Grafit (2)', 'Grafit']);
  });

  it('usuwanie: aktywny → przełącza na sąsiedni; ostatniego nie da się usunąć', () => {
    const { app, controller, seen, raw } = load();
    seen.length = 0;
    expect(controller.remove('b')).toBe(true);
    expect(app.variant.get().id).toBe('a');
    expect(seen).toHaveLength(1);
    expect(controller.getState().variants.map((v) => v.id)).toEqual(['a']);
    expect(controller.remove('a')).toBe(false);
    expect(controller.getState().variants).toHaveLength(1);
    expect(app.variant.get().id).toBe('a');
    vi.advanceTimersByTime(500);
    expect(saved(raw).variants.map((v) => v.id)).toEqual(['a']);
  });

  it('usunięcie nieaktywnego nie rusza sceny', () => {
    const { controller, seen } = load();
    seen.length = 0;
    expect(controller.remove('a')).toBe(true);
    expect(seen).toHaveLength(0);
    expect(controller.getState()).toMatchObject({ activeId: 'b' });
    expect(controller.remove('nie-ma')).toBe(false);
  });

  it('wariant podmieniony z zewnątrz (app.variant.set) trafia na listę i do zapisu', () => {
    const { app, controller, raw } = load();
    app.variant.set({ id: 'obcy', name: 'Z zewnątrz', finishes: {}, furniture: [], customMaterials: [] });
    expect(controller.getState().activeId).toBe('obcy');
    expect(controller.getState().variants).toHaveLength(3);
    vi.advanceTimersByTime(500);
    expect(saved(raw).variants.map((v) => v.id)).toEqual(['a', 'b', 'obcy']);
  });

  it('zapis odtwarza się po ponownym uruchomieniu', () => {
    const first = load();
    first.app.variant.update((d) => {
      d.furniture.push({ ...sofa, id: 'wisi', z: 1.4 });
    });
    first.controller.createFromProject();
    first.controller.flush();
    const second = setup({ raw: first.raw });
    expect(second.controller.getState().variants.map((v) => v.name)).toEqual(['Jasny', 'Ciemny', 'Wariant 3']);
    expect(second.app.variant.get().name).toBe('Wariant 3');
    second.controller.switchTo('b');
    expect(second.app.variant.get().furniture.map((f) => [f.id, f.z])).toEqual([['s1', undefined], ['wisi', 1.4]]);
  });
});

describe('eksport i import', () => {
  const load = () => setup({ raw: fakeStorage({ [STORAGE_KEY]: storedState() }) });

  it('eksport bieżącego i wszystkich: nagłówek, nazwa pliku z nazwą wariantu i podaną datą', () => {
    const { controller } = load();
    const date = new Date(2026, 10, 24, 15, 30);
    const one = controller.exportData('active', date);
    expect(one.filename).toBe('dom-ciemny-2026-11-24.json');
    const parsed = JSON.parse(one.text);
    expect(parsed).toMatchObject({ app: APP_ID, version: CURRENT_VERSION, exportedAt: date.toISOString() });
    expect(parsed.variants.map((v) => v.id)).toEqual(['b']);
    const all = controller.exportData('all', date);
    expect(all.filename).toBe('dom-wszystkie-warianty-2026-11-24.json');
    expect(JSON.parse(all.text).variants.map((v) => v.id)).toEqual(['a', 'b']);
    expect(all.count).toBe(2);
  });

  it('round-trip: eksport wszystkich → import w pustej aplikacji odtwarza warianty', () => {
    const source = load();
    const file = source.controller.exportData('all');
    const target = setup();
    const result = target.controller.importText(file.text);
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/Zaimportowano 2 warianty/);
    const imported = target.controller.getState().variants.slice(1);
    expect(imported).toEqual(source.controller.getState().variants);
    expect(target.app.variant.get().name).toBe('Wariant 1'); // paczka nie zmienia aktywnego
  });

  it('import pojedynczego wariantu: aktywuje go; kolizja id → nowy id, kolizja nazwy → dopisek', () => {
    const { app, controller, seen } = load();
    const file = controller.exportData('active');
    seen.length = 0;
    const result = controller.importText(file.text);
    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
    const v = app.variant.get();
    expect(v.id).not.toBe('b');
    expect(v.name).toBe('Ciemny (2)');
    expect(v.furniture).toEqual([sofa]);
    expect(controller.getState().variants.map((x) => x.id)).toEqual(['a', 'b', v.id]);
    expect(controller.getState().variants[1].name).toBe('Ciemny'); // oryginał nietknięty
  });

  it('pomija wykończenia nieistniejących powierzchni i mówi ile', () => {
    const { app, controller } = load();
    const text = JSON.stringify({
      app: APP_ID, version: CURRENT_VERSION, exportedAt: 'x',
      variants: [{
        id: 'inny-dom', name: 'Z innego domu',
        finishes: {
          'parter:0/3:floor': { kind: 'paint', color: '#010101' },
          'parter:7/7:floor': { kind: 'paint', color: '#020202' },
          'parter:7/7:wall:0': { kind: 'paint', color: '#030303' },
        },
        furniture: [{ ...sofa, levelId: 'piwnica' }],
        customMaterials: [],
      }],
    });
    const result = controller.importText(text);
    expect(result.ok).toBe(true);
    expect(result.report.skippedSurfaces).toBe(2);
    expect(result.message).toMatch(/Pominięto 2 wykończenia powierzchni, których nie ma w tym domu/);
    expect(result.message).toMatch(/Odrzucono 1 błędny element/);
    expect(Object.keys(app.variant.get().finishes)).toEqual(['parter:0/3:floor']);
  });

  it('zły plik: komunikat, brak wyjątku, stan i zapis bez zmian', () => {
    const { app, controller, seen, raw } = load();
    const before = JSON.stringify(controller.getState());
    seen.length = 0;
    for (const text of ['', 'nie json', '{"app":"cos-innego"}', '[]', JSON.stringify({ app: APP_ID, version: 99, variants: [{}] }), null]) {
      let result;
      expect(() => (result = controller.importText(text))).not.toThrow();
      expect(result.ok).toBe(false);
      expect(result.message.length).toBeGreaterThan(5);
    }
    vi.advanceTimersByTime(1000);
    expect(JSON.stringify(controller.getState())).toBe(before);
    expect(seen).toHaveLength(0);
    expect(raw.writes).toBe(0);
    expect(app.variant.get().id).toBe('b');
  });

  it('import ponad limit wariantów jest odrzucany w całości', () => {
    const { controller } = load();
    const many = Array.from({ length: LIMITS.variants - 1 }, (_, i) => ({ id: `x${i}`, name: `X ${i}`, finishes: {}, furniture: [], customMaterials: [] }));
    const result = controller.importText(JSON.stringify({ app: APP_ID, version: CURRENT_VERSION, variants: many }));
    expect(result.ok).toBe(false);
    expect(controller.getState().variants).toHaveLength(2);
  });
});

describe('panel', () => {
  const open = () => {
    const ctx = setup({ raw: fakeStorage({ [STORAGE_KEY]: storedState() }) });
    const downloads = [];
    const files = [];
    const toasts = [];
    const view = createVariantsPanel(ctx.controller, {
      toast: (t) => toasts.push(t),
      download: (filename, text) => downloads.push({ filename, text }),
      readFile: async () => files.shift(),
    });
    document.body.replaceChildren(view.element);
    const rows = () => [...view.element.querySelectorAll('.war-item')];
    const byText = (text) => [...view.element.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
    return { ...ctx, view, rows, byText, downloads, files, toasts };
  };

  it('pokazuje listę z zaznaczonym aktywnym i informację o zapisie', () => {
    const { view, rows } = open();
    expect(rows().map((r) => r.querySelector('.war-name').textContent)).toEqual(['Jasny', 'Ciemny']);
    expect(rows().map((r) => r.classList.contains('is-active'))).toEqual([false, true]);
    expect(rows()[1].querySelector('.war-pick').getAttribute('aria-pressed')).toBe('true');
    expect(rows()[1].querySelector('.war-meta').textContent).toBe('1 wykończenie · 1 mebel');
    expect(view.element.querySelector('.war-status').textContent).toMatch(/^Zapisano w tej przeglądarce: \d\d\.11\.2026, \d\d:\d\d$/);
  });

  it('jedno dotknięcie przełącza wariant', () => {
    const { app, rows } = open();
    rows()[0].querySelector('.war-pick').click();
    expect(app.variant.get().id).toBe('a');
    expect(rows().map((r) => r.classList.contains('is-active'))).toEqual([true, false]);
  });

  it('lista odświeża się także wtedy, gdy jeden wiersz jest w trybie zmiany nazwy', () => {
    const { controller, rows, byText } = open();
    rows()[1].querySelector('[aria-label^="Zmień nazwę"]').click(); // aktywny „Ciemny”
    const editing = rows()[1];
    const input = editing.querySelector('input.war-input');
    input.value = 'W trakcie pisania';
    rows()[0].querySelector('.war-pick').click(); // przełączenie na „Jasny”
    expect(controller.getState().activeId).toBe('a');
    expect(rows()[0].classList.contains('is-active')).toBe(true);
    expect(rows()[0].querySelector('.war-pick').getAttribute('aria-pressed')).toBe('true');
    expect(rows()[1]).toBe(editing); // ten sam element – pole nie zostało wyjęte z dokumentu
    expect(rows()[1].querySelector('input.war-input')).toBe(input);
    expect(input.value).toBe('W trakcie pisania');
    byText('Kopia bieżącego').click();
    expect(controller.getState().variants).toHaveLength(3);
    expect(rows()).toHaveLength(3);
    expect(rows()[1]).toBe(editing);
    expect(rows().map((r) => r.classList.contains('is-active'))).toEqual([false, false, true]);
    byText('Pusty z meblami z projektu').click();
    expect(rows()).toHaveLength(4);
    expect(rows().map((r) => r.classList.contains('is-active'))).toEqual([false, false, false, true]);
    byText('Zapisz').click();
    expect(controller.getState().variants[1].name).toBe('W trakcie pisania');
    expect(rows().map((r) => r.querySelector('.war-name')?.textContent)[1]).toBe('W trakcie pisania');
    expect(rows().some((r) => r.querySelector('input.war-input'))).toBe(false);
  });

  it('zmiana nazwy w wierszu', () => {
    const { controller, rows, byText, toasts } = open();
    rows()[0].querySelector('[aria-label^="Zmień nazwę"]').click();
    const input = rows()[0].querySelector('input.war-input');
    expect(input.value).toBe('Jasny');
    input.value = '   ';
    byText('Zapisz').click();
    expect(toasts).toEqual(['Wpisz nazwę wariantu.']);
    input.value = 'Skandynawski';
    byText('Zapisz').click();
    expect(controller.getState().variants[0].name).toBe('Skandynawski');
    expect(rows()[0].querySelector('.war-name').textContent).toBe('Skandynawski');
    expect(rows()[0].querySelector('input')).toBeNull();
  });

  it('usuwanie wymaga potwierdzenia, a ostatniego wariantu usunąć się nie da', () => {
    const { controller, rows, byText } = open();
    rows()[0].querySelector('[aria-label^="Usuń"]').click();
    expect(controller.getState().variants).toHaveLength(2); // jeszcze nic nie usunięto
    expect(rows()[0].textContent).toMatch(/Usunąć „Jasny”/);
    byText('Anuluj').click();
    expect(controller.getState().variants).toHaveLength(2);
    rows()[0].querySelector('[aria-label^="Usuń"]').click();
    byText('Usuń').click();
    expect(controller.getState().variants.map((v) => v.id)).toEqual(['b']);
    expect(rows()).toHaveLength(1);
    const lastDelete = rows()[0].querySelectorAll('.war-icon')[1];
    expect(lastDelete.disabled).toBe(true);
    lastDelete.click();
    expect(controller.getState().variants).toHaveLength(1);
  });

  it('nowy i kopia dopisują wiersze', () => {
    const { rows, byText, app } = open();
    byText('Pusty z meblami z projektu').click();
    byText('Kopia bieżącego').click();
    expect(rows().map((r) => r.querySelector('.war-name').textContent)).toEqual(['Jasny', 'Ciemny', 'Wariant 3', 'Wariant 3 – kopia']);
    expect(app.variant.get().name).toBe('Wariant 3 – kopia');
  });

  it('eksport przekazuje plik do pobrania', () => {
    const { byText, downloads } = open();
    byText('Eksportuj bieżący').click();
    byText('Eksportuj wszystkie').click();
    expect(downloads.map((d) => d.filename)).toEqual(['dom-ciemny-2026-11-24.json', 'dom-wszystkie-warianty-2026-11-24.json']);
    expect(JSON.parse(downloads[1].text).variants).toHaveLength(2);
  });

  it('import z pliku: dobry plik dopisuje wariant, zły pokazuje komunikat', async () => {
    vi.useRealTimers();
    const { view, controller, files, toasts, rows } = open();
    const input = view.element.querySelector('input[type="file"]');
    const pick = async (result) => {
      files.push(result);
      Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'plik.json', size: 10 }] });
      input.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 0));
    };
    await pick({ ok: true, text: controller.exportData('active').text });
    expect(toasts.at(-1)).toMatch(/Zaimportowano 1 wariant\./);
    expect(rows()).toHaveLength(3);
    await pick({ ok: true, text: 'to nie jest json' });
    expect(toasts.at(-1)).toMatch(/JSON/);
    await pick({ ok: false, error: 'Nie udało się odczytać pliku.' });
    expect(toasts.at(-1)).toBe('Nie udało się odczytać pliku.');
    expect(rows()).toHaveLength(3);
  });

  it('opis stanu zapisu', () => {
    expect(statusText({ status: 'new', savedAt: null })).toMatch(/nie zapisano/i);
    expect(statusText({ status: 'quota', savedAt: '2026-11-20T08:30:00.000Z' })).toMatch(/brak miejsca.*Ostatni zapis: \d\d\.11\.2026/);
    expect(statusText({ status: 'unavailable', savedAt: null })).toMatch(/tryb prywatny/);
    expect(statusText({ status: 'readonly', savedAt: null })).toMatch(/nowszej wersji/);
  });
});

describe('init(app) – całość z przyciskiem na pasku', () => {
  it('wczytuje wariant przed innymi funkcjami, dodaje przycisk, otwiera panel, zapisuje przy pagehide', async () => {
    const { init } = await import('../src/features/variants/index.js');
    const app = fakeApp();
    const raw = fakeStorage();
    const downloads = [];
    const feature = init(app, { storage: raw, makeId: idGenerator(), now: () => NOW, download: (f, t) => downloads.push([f, t]) });

    // zaraz po init wariant jest gotowy (meble startowe z podmienionego modułu)
    expect(app.variant.get().name).toBe('Wariant 1');
    expect(app.variant.get().furniture.map((f) => f.id)).toEqual(['start-1']);
    expect(app.buttons).toHaveLength(1);
    expect(app.buttons[0].options.id).toBe('variants');
    expect(app.buttons[0].label).toBe('Wariant 1');

    app.buttons[0].options.onClick();
    expect(app.currentPanel.title).toBe('Warianty');
    expect(app.buttons[0].active).toBe(true);
    expect(app.currentPanel.content.querySelectorAll('.war-item')).toHaveLength(1);

    feature.rename(feature.getState().activeId, 'Jasny');
    expect(app.buttons[0].label).toBe('Jasny');

    app.buttons[0].options.onClick(); // drugi raz zamyka
    expect(app.currentPanel).toBeNull();
    expect(app.buttons[0].active).toBe(false);

    // zamknięcie karty zapisuje od razu, bez czekania na opóźnienie
    expect(raw.writes).toBe(0);
    window.dispatchEvent(new Event('pagehide'));
    expect(raw.writes).toBe(1);
    expect(saved(raw).variants[0].name).toBe('Jasny');

    app.variant.update((d) => {
      d.name = 'Jasny 2';
    });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(saved(raw).variants[0].name).toBe('Jasny 2');
    delete document.visibilityState;

    feature.destroy();
    expect(app.buttons[0].removed).toBe(true);
  });
});

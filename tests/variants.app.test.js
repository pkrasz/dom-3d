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
      await view.idle(); // koniec odczytu pliku i importu – bez zgadywania czasu
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

// ================================================================================================ gotowe aranżacje
describe('gotowe aranżacje (rejestr podmieniony – tu tylko mechanizm)', () => {
  const PRESETS = [
    {
      id: 'loft', name: 'Ciemny', description: 'Opis loftu.',
      create: () => ({
        id: 'b', name: 'nazwa z danych', customMaterials: [],
        finishes: { 'parter:0/3:floor': { kind: 'paint', color: '#101010' }, 'parter:9/9:floor': { kind: 'paint', color: '#202020' } },
        furniture: [{ ...sofa, id: 'p1', color2: '#b5895a' }, { ...sofa, id: 'p2', z: 1.2 }, { type: 'zepsuty' }],
      }),
    },
    { id: 'zepsuta', name: 'Zepsuta', description: '', create: () => { throw new Error('bum'); } },
  ];
  const withPresets = (raw = fakeStorage({ [STORAGE_KEY]: storedState() })) => {
    const app = fakeApp();
    const controller = createController(app, { storage: createStorage({ storage: raw }), makeId: idGenerator(), now: () => NOW, createStarter: () => [sofa], presets: PRESETS });
    return { app, raw, controller };
  };

  it('addPreset: nowy aktywny wariant po walidacji importu; kolizja id → nowy id, kolizja nazwy → dopisek; nic nie nadpisane', () => {
    const { app, controller, raw } = withPresets();
    const before = JSON.stringify(controller.getState().variants);
    expect(controller.listPresets()).toEqual([{ id: 'loft', name: 'Ciemny', description: 'Opis loftu.' }, { id: 'zepsuta', name: 'Zepsuta', description: '' }]);

    const result = controller.addPreset('loft');
    expect(result).toMatchObject({ ok: true, name: 'Ciemny (2)', id: 'gen-1' });
    expect(result.message).toBe('Dodano wariant «Ciemny (2)». Pominięto 1 wykończenie powierzchni, których nie ma w tym domu. Odrzucono 1 błędny element.');
    const state = controller.getState();
    expect(state.variants).toHaveLength(3);
    expect(JSON.stringify(state.variants.slice(0, 2))).toBe(before);
    expect(state.activeId).toBe('gen-1');
    const v = app.variant.get();
    expect(v.finishes).toEqual({ 'parter:0/3:floor': { kind: 'paint', color: '#101010' } });
    expect(v.furniture).toEqual([{ ...sofa, id: 'p1', color2: '#b5895a' }, { ...sofa, id: 'p2', z: 1.2 }]); // pola dodatkowe zostają
    vi.advanceTimersByTime(500);
    expect(saved(raw).variants.map((x) => x.name)).toEqual(['Jasny', 'Ciemny', 'Ciemny (2)']);

    expect(controller.addPreset('loft')).toMatchObject({ ok: true, name: 'Ciemny (3)' });
  });

  it('nieznana albo zepsuta aranżacja i pełna lista: komunikat, stan bez zmian', () => {
    const { app, controller } = withPresets();
    const before = JSON.stringify(controller.getState());
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(controller.addPreset('brak')).toEqual({ ok: false, message: 'Nie ma takiej gotowej aranżacji.' });
    expect(controller.addPreset('zepsuta')).toEqual({ ok: false, message: 'Nie udało się przygotować tej aranżacji.' });
    expect(errors).toHaveBeenCalledTimes(1);
    errors.mockRestore();
    expect(JSON.stringify(controller.getState())).toBe(before);

    while (controller.getState().variants.length < LIMITS.variants) controller.createFromProject();
    const active = app.variant.get().id;
    expect(controller.addPreset('loft')).toMatchObject({ ok: false, message: expect.stringMatching(/najwyżej 30 wariantów/) });
    expect(controller.getState().variants).toHaveLength(LIMITS.variants);
    expect(app.variant.get().id).toBe(active);
  });

  it('panel: grupa „Gotowe aranżacje” w sekcji „Nowy wariant”; przycisk dodaje wariant i pokazuje komunikat', () => {
    const ctx = withPresets();
    const toasts = [];
    const view = createVariantsPanel(ctx.controller, { toast: (t) => toasts.push(t), nav: null });
    document.body.replaceChildren(view.element);
    const group = view.element.querySelector('.war-presets');
    expect(group.getAttribute('aria-label')).toBe('Gotowe aranżacje');
    expect(group.querySelector('.war-subhead').textContent).toBe('Gotowe aranżacje');
    expect([...group.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Ciemny', 'Zepsuta']);
    expect(group.textContent).toContain('Opis loftu.');
    expect(group.textContent).toMatch(/Twoje warianty zostają bez zmian/);
    const heads = [...view.element.querySelectorAll('.war-head, .war-subhead')].map((h) => h.textContent);
    expect(heads.indexOf('Gotowe aranżacje')).toBe(heads.indexOf('Nowy wariant') + 1);

    group.querySelector('[data-preset="loft"] button').click();
    expect(view.element.querySelectorAll('.war-item')).toHaveLength(3);
    expect(view.element.querySelector('.war-item.is-active .war-name').textContent).toBe('Ciemny (2)');
    expect(toasts.at(-1)).toMatch(/^Dodano wariant «Ciemny \(2\)»/);

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    group.querySelector('[data-preset="zepsuta"] button').click();
    errors.mockRestore();
    expect(toasts.at(-1)).toBe('Nie udało się przygotować tej aranżacji.');
    expect(view.element.querySelectorAll('.war-item')).toHaveLength(3);
    view.dispose();
  });

  it('bez rejestru (pusta lista) panel nie ma tej grupy', () => {
    const { controller } = setup({ raw: fakeStorage({ [STORAGE_KEY]: storedState() }) });
    const view = createVariantsPanel(controller, { toast: () => {}, nav: null });
    expect(view.element.querySelector('.war-presets')).toBeNull();
    expect(view.element.textContent).not.toContain('Gotowe aranżacje');
    view.dispose();
  });
});

// ================================================================================================ udostępnianie
describe('udostępnianie wariantu linkiem', () => {
  const BASE = 'https://przyklad.github.io/dom-3d/';
  const tick = () => new Promise((r) => setTimeout(r, 0));

  /** Atrapa okna: adres strony, history.replaceState i zdarzenie 'hashchange'. */
  function fakeWin(hash = '') {
    const listeners = new Set();
    const win = {
      location: { origin: 'https://przyklad.github.io', pathname: '/dom-3d/', search: '', hash },
      replaced: [],
      history: {
        state: null,
        replaceState(state, title, url) {
          win.replaced.push(url);
          win.location.hash = url.includes('#') ? url.slice(url.indexOf('#')) : '';
        },
      },
      addEventListener: (name, fn) => name === 'hashchange' && listeners.add(fn),
      removeEventListener: (name, fn) => listeners.delete(fn),
      /** Otwarcie linku, gdy strona już działa. */
      navigate(newHash) {
        win.location.hash = newHash;
        for (const fn of [...listeners]) fn();
      },
      listeners,
    };
    return win;
  }

  /** Nadawca: druga, niezależna „przeglądarka” z własnym wariantem. */
  async function senderLink(mutate = () => {}) {
    const { app, controller } = setup({ raw: fakeStorage() });
    app.variant.update((d) => {
      d.name = 'Salon Żony 🏡';
      d.finishes['parter:0/3:floor'] = { kind: 'material', id: 'deska-dab', rot: 90 };
      d.finishes['parter:0/3:wall:2'] = { kind: 'split', height: 1.2, lower: { kind: 'material', id: 'plytka', rot: 0 }, upper: { kind: 'paint', color: '#aabbcc' } };
      d.finishes['parter:9/9:floor'] = { kind: 'paint', color: '#123456' }; // powierzchnia, której odbiorca nie ma
      mutate(d);
    });
    const link = await controller.shareLink();
    return { link, variant: app.variant.get(), controller };
  }
  const withBase = (ctxOptions = {}) => {
    const app = fakeApp();
    const raw = ctxOptions.raw || fakeStorage({ [STORAGE_KEY]: storedState() });
    const controller = createController(app, {
      storage: createStorage({ storage: raw }), makeId: idGenerator(), now: () => NOW, createStarter: () => [sofa], baseUrl: () => BASE,
      ...(ctxOptions.streams ? { streams: ctxOptions.streams } : {}),
    });
    return { app, raw, controller };
  };

  beforeEach(() => vi.useRealTimers());

  it('kontroler buduje link z adresu strony w podkatalogu; tytuł i opis z nazwą wariantu', async () => {
    const { app, controller } = withBase();
    const link = await controller.shareLink();
    expect(link.ok).toBe(true);
    expect(link.url).toMatch(/^https:\/\/przyklad\.github\.io\/dom-3d\/#w=1\.[zj]\.[A-Za-z0-9_-]+$/);
    expect(link.title).toContain(app.variant.get().name);
    expect(link.text).toContain(app.variant.get().name);
  });

  it('wariant z własnym zdjęciem płytki: brak linku, powód dla użytkownika', async () => {
    const { app, controller } = withBase();
    app.variant.update((d) => {
      d.customMaterials.push({ id: 'wlasny-1', name: 'Moja', dataUrl: 'data:image/png;base64,AAAA', size: [0.6, 0.6] });
      d.finishes['parter:0/3:floor'] = { kind: 'material', id: 'wlasny-1', rot: 0 };
    });
    const link = await controller.shareLink();
    expect(link).toMatchObject({ ok: false, reason: 'customMaterials' });
    expect(link.message).toMatch(/plik/);
  });

  it('readShared: walidacja jak przy imporcie, bez zmiany stanu; addShared: nowy aktywny wariant, nic nie nadpisane', async () => {
    const { link } = await senderLink();
    const { app, raw, controller } = withBase();
    const before = JSON.stringify(controller.getState().variants);
    const writes = raw.writes;

    const read = await controller.readShared(link.url.split('#w=')[1]);
    expect(read.ok).toBe(true);
    expect(read.variant.name).toBe('Salon Żony 🏡');
    expect(Object.keys(read.variant.finishes)).toEqual(['parter:0/3:floor', 'parter:0/3:wall:2']);
    expect(read.report.skippedSurfaces).toBe(1);
    expect(JSON.stringify(controller.getState().variants)).toBe(before); // samo odczytanie niczego nie dodaje
    expect(raw.writes).toBe(writes);

    const added = controller.addShared(read.variant, read.report);
    expect(added.ok).toBe(true);
    expect(added.message).toMatch(/Dodano wariant «Salon Żony 🏡»\. Pominięto 1 wykończenie/);
    const state = controller.getState();
    expect(state.variants).toHaveLength(3);
    expect(state.activeId).toBe(added.id);
    expect(app.variant.get().finishes['parter:0/3:wall:2']).toEqual({ kind: 'split', height: 1.2, lower: { kind: 'material', id: 'plytka', rot: 0 }, upper: { kind: 'paint', color: '#aabbcc' } });
    expect(JSON.stringify(state.variants.slice(0, 2))).toBe(before); // istniejące warianty bez zmian
    controller.flush();
    expect(saved(raw).variants).toHaveLength(3);
  });

  it('ten sam link drugi raz i kolizja id: kolejna kopia z dopiskiem i nowym id', async () => {
    const { link } = await senderLink();
    const { controller } = withBase();
    const payload = link.url.split('#w=')[1];
    const first = controller.addShared((await controller.readShared(payload)).variant);
    const second = controller.addShared((await controller.readShared(payload)).variant);
    expect(second.name).toBe('Salon Żony 🏡 (2)');
    expect(second.id).not.toBe(first.id);
    const state = controller.getState();
    expect(state.variants).toHaveLength(4);
    expect(new Set(state.variants.map((v) => v.id)).size).toBe(4);
    expect(state.variants.find((v) => v.id === first.id).name).toBe('Salon Żony 🏡');
  });

  it('pełna lista wariantów: wariant z linku nie jest dodawany', async () => {
    const { link } = await senderLink();
    const { controller } = withBase();
    while (controller.getState().variants.length < LIMITS.variants) controller.createFromProject();
    const read = await controller.readShared(link.url.split('#w=')[1]);
    const added = controller.addShared(read.variant);
    expect(added.ok).toBe(false);
    expect(added.message).toMatch(/najwyżej/);
    expect(controller.getState().variants).toHaveLength(LIMITS.variants);
  });

  it('zły link: komunikat bez wyjątku', async () => {
    const { controller } = withBase();
    for (const bad of ['', 'śmieci', '1.z.AAAA', '1.j.e30', null]) {
      expect(await controller.readShared(bad)).toEqual({ ok: false, message: 'Link do wariantu jest uszkodzony lub niepełny' });
    }
    expect((await controller.readShared('7.z.AAAA')).message).toMatch(/nowszej wersji/);
  });

  describe('odbiór (receive.js)', () => {
    const receiver = async (hash, ctx = withBase()) => {
      const { createShareReceiver } = await import('../src/features/variants/receive.js');
      const win = fakeWin(hash);
      const rec = createShareReceiver(ctx.app, ctx.controller, { win, defer: async () => {} });
      return { ...ctx, win, rec };
    };
    const panelButton = (app, text) => [...app.currentPanel.content.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

    it('pyta przed dodaniem; „Dodaj i otwórz” dodaje nowy aktywny wariant i czyści fragment adresu', async () => {
      const { link } = await senderLink();
      const { app, controller, win, rec } = await receiver(new URL(link.url).hash);
      const before = JSON.stringify(controller.getState().variants);
      expect(await rec.check()).toBe(true);

      expect(win.replaced).toEqual(['/dom-3d/']); // fragment usunięty – odświeżenie nie zapyta ponownie
      expect(win.location.hash).toBe('');
      expect(app.currentPanel.title).toBe('Wariant z linku');
      const text = app.currentPanel.content.textContent;
      expect(text).toContain('Dodać wariant «Salon Żony 🏡»?');
      expect(text).toContain('2 wykończenia · 1 mebel');
      expect(controller.getState().variants).toHaveLength(2); // jeszcze nic nie dodano
      const buttons = [...app.currentPanel.content.querySelectorAll('button')].map((b) => b.textContent);
      expect(buttons).toEqual(['Dodaj i otwórz', 'Nie teraz']);

      panelButton(app, 'Dodaj i otwórz').click();
      expect(app.currentPanel).toBeNull();
      const state = controller.getState();
      expect(state.variants).toHaveLength(3);
      expect(app.variant.get().name).toBe('Salon Żony 🏡');
      expect(state.activeId).toBe(app.variant.get().id);
      expect(JSON.stringify(state.variants.slice(0, 2))).toBe(before);
      expect(app.toasts.at(-1)).toMatch(/Dodano wariant «Salon Żony 🏡»/);
      expect(await rec.check()).toBe(false); // drugi raz nic się nie dzieje
    });

    it('„Nie teraz” niczego nie dodaje, a fragment i tak znika', async () => {
      const { link } = await senderLink();
      const { app, controller, win, rec } = await receiver(new URL(link.url).hash);
      await rec.check();
      panelButton(app, 'Nie teraz').click();
      expect(app.currentPanel).toBeNull();
      expect(controller.getState().variants).toHaveLength(2);
      expect(win.location.hash).toBe('');
      expect(app.toasts).toEqual([]);
    });

    it('uszkodzony albo ucięty link: komunikat, brak pytania, czysty adres', async () => {
      const { link } = await senderLink();
      const hash = new URL(link.url).hash;
      for (const bad of [hash.slice(0, hash.length - 9), '#w=', '#w=abc', '#w=1.z.%%%']) {
        const { app, controller, win, rec } = await receiver(bad);
        expect(await rec.check()).toBe(true);
        expect(app.toasts).toEqual(['Link do wariantu jest uszkodzony lub niepełny']);
        expect(app.currentPanel).toBeNull();
        expect(controller.getState().variants).toHaveLength(2);
        expect(win.location.hash).toBe('');
      }
    });

    it('link z prefiksem zakodowanym procentowo (#w%3D…) działa jak zwykły', async () => {
      const { link } = await senderLink();
      const { app, win, rec } = await receiver(new URL(link.url).hash.replace('#w=', '#w%3D'));
      expect(await rec.check()).toBe(true);
      expect(win.location.hash).toBe('');
      expect(app.currentPanel.content.textContent).toContain('Dodać wariant «Salon Żony 🏡»?');
    });

    it('pytanie zamknięte bez wyboru (krzyżyk, inny panel): nic nie dodane, ale jest komunikat', async () => {
      const { link } = await senderLink();
      const { app, controller, rec } = await receiver(new URL(link.url).hash);
      await rec.check();
      app.ui.openPanel({ title: 'Wykończenia', content: document.createElement('div') }); // np. dotknięcie ściany
      expect(controller.getState().variants).toHaveLength(2);
      expect(app.toasts).toEqual(['Wariant z linku nie został dodany – otwórz link ponownie, żeby go dodać.']);
      app.ui.closePanel();
      expect(app.toasts).toHaveLength(1); // tylko raz
    });

    it('drugi link, gdy pierwsze pytanie jest jeszcze otwarte: nowe pytanie bez komunikatu o starym', async () => {
      const { link } = await senderLink();
      const { link: other } = await senderLink((d) => {
        d.name = 'Kuchnia';
      });
      const { app, controller, win, rec } = await receiver(new URL(link.url).hash);
      await rec.check();
      win.navigate(new URL(other.url).hash);
      await vi.waitFor(() => expect(app.currentPanel.content.textContent).toContain('Dodać wariant «Kuchnia»?'));
      expect(app.toasts).toEqual([]);
      panelButton(app, 'Dodaj i otwórz').click();
      expect(app.variant.get().name).toBe('Kuchnia');
      expect(controller.getState().variants).toHaveLength(3);
      expect(app.toasts).toHaveLength(1);
    });

    it('pełna lista: komunikat o limicie, pytanie zostaje otwarte i po zwolnieniu miejsca da się dodać', async () => {
      const { link } = await senderLink();
      const { app, controller, rec } = await receiver(new URL(link.url).hash);
      while (controller.getState().variants.length < LIMITS.variants) controller.createFromProject();
      await rec.check();
      panelButton(app, 'Dodaj i otwórz').click();
      expect(app.toasts).toEqual([expect.stringMatching(/najwyżej/)]);
      expect(app.currentPanel?.title).toBe('Wariant z linku'); // nie trzeba otwierać linku od nowa
      expect(controller.getState().variants).toHaveLength(LIMITS.variants);

      const spare = controller.getState().variants.find((v) => v.id !== controller.getState().activeId);
      expect(controller.remove(spare.id)).toBeTruthy();
      panelButton(app, 'Dodaj i otwórz').click();
      expect(app.currentPanel).toBeNull();
      expect(app.variant.get().name).toBe('Salon Żony 🏡');
      expect(app.toasts.at(-1)).toMatch(/Dodano wariant/);
    });

    it('paste: link wklejony ręcznie (cała wiadomość) idzie tą samą drogą – pytanie, potem dodanie', async () => {
      const { link } = await senderLink();
      const { app, controller, win, rec } = await receiver('');
      expect(await rec.paste(`Wariant „Salon” – model 3D domu ${link.url}.`)).toBe(true);
      expect(app.currentPanel.content.textContent).toContain('Dodać wariant «Salon Żony 🏡»?');
      expect(controller.getState().variants).toHaveLength(2); // bez pytania nic nie jest dodawane
      expect(win.replaced).toEqual([]); // adres strony bez zmian
      panelButton(app, 'Dodaj i otwórz').click();
      expect(controller.getState().variants).toHaveLength(3);
      expect(app.variant.get().name).toBe('Salon Żony 🏡');

      expect(await rec.paste('to nie jest link')).toBe(false);
      expect(app.toasts.at(-1)).toBe('W tym tekście nie ma linku do wariantu. Skopiuj cały link z wiadomości.');
      expect(await rec.paste(`${link.url.slice(0, -12)}`)).toBe(true);
      expect(app.toasts.at(-1)).toBe('Link do wariantu jest uszkodzony lub niepełny');
      expect(app.currentPanel).toBeNull();
      expect(controller.getState().variants).toHaveLength(3);
    });

    it('init(app): panel Warianty ma „Wklej link…” – wklejony link otwiera pytanie (ikona na ekranie telefonu)', async () => {
      const { link } = await senderLink();
      const { init } = await import('../src/features/variants/index.js');
      const app = fakeApp();
      const feature = init(app, { storage: fakeStorage(), makeId: idGenerator(), now: () => NOW, win: fakeWin(''), defer: async () => {}, nav: null });
      feature.openPanel();
      const root = app.currentPanel.content;
      const byText = (text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
      const input = root.querySelector('input[aria-label="Link do wariantu z wiadomości"]');
      expect(input.closest('.war-link').hidden).toBe(true);
      byText('Wklej link…').click();
      expect(input.closest('.war-link').hidden).toBe(false);

      byText('Dodaj z linku').click(); // puste pole
      expect(app.toasts.at(-1)).toBe('Wklej link do wariantu.');
      expect(app.currentPanel.title).toBe('Warianty');

      input.value = link.url;
      byText('Dodaj z linku').click();
      await vi.waitFor(() => expect(app.currentPanel?.title).toBe('Wariant z linku'));
      expect(feature.getState().variants).toHaveLength(1);
      panelButton(app, 'Dodaj i otwórz').click();
      expect(feature.getState().variants.map((v) => v.name)).toEqual(['Wariant 1', 'Salon Żony 🏡']);
      feature.destroy();
    });

    it('zwykły fragment adresu (nie w=) zostaje nietknięty', async () => {
      const { app, win, rec } = await receiver('#salon');
      expect(await rec.check()).toBe(false);
      expect(win.replaced).toEqual([]);
      expect(app.currentPanel).toBeNull();
    });

    it('hashchange: link otwarty, gdy strona już działa', async () => {
      const { link } = await senderLink();
      const { app, controller, win, rec } = await receiver('');
      expect(await rec.check()).toBe(false);
      win.navigate(new URL(link.url).hash);
      await vi.waitFor(() => expect(app.currentPanel?.title).toBe('Wariant z linku'));
      expect(win.location.hash).toBe('');
      panelButton(app, 'Dodaj i otwórz').click();
      expect(controller.getState().variants).toHaveLength(3);
      rec.dispose();
      expect(win.listeners.size).toBe(0);
    });

    it('init(app): pytanie pojawia się po starcie pozostałych funkcji i nie zamyka go nic po drodze', async () => {
      const { link } = await senderLink();
      const { init } = await import('../src/features/variants/index.js');
      const app = fakeApp();
      const win = fakeWin(new URL(link.url).hash);
      let release;
      const feature = init(app, { storage: fakeStorage(), makeId: idGenerator(), now: () => NOW, win, defer: () => new Promise((r) => (release = r)) });
      expect(win.location.hash).toBe(''); // fragment znika od razu
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      expect(app.currentPanel).toBeNull(); // do „następnej klatki” (po app.start()) pytania jeszcze nie ma
      expect(feature.getState().variants).toHaveLength(1);
      release();
      await vi.waitFor(() => expect(app.currentPanel?.title).toBe('Wariant z linku'));
      panelButton(app, 'Dodaj i otwórz').click();
      expect(feature.getState().variants.map((v) => v.name)).toEqual(['Wariant 1', 'Salon Żony 🏡']);
      expect(app.buttons[0].label).toBe('Salon Żony 🏡');
      feature.destroy();
      expect(win.listeners.size).toBe(0);
    });
  });

  describe('panel: przyciski „Udostępnij” i „Wyślij plik”', () => {
    const abort = () => Object.assign(new Error('Share canceled'), { name: 'AbortError' });
    const open = (nav, ctx = withBase()) => {
      const toasts = [];
      const downloads = [];
      const view = createVariantsPanel(ctx.controller, {
        toast: (t) => toasts.push(t),
        download: (filename, text) => downloads.push({ filename, text }),
        nav,
        makeFile: (filename, text) => ({ name: filename, text, type: 'application/json' }),
      });
      document.body.replaceChildren(view.element);
      const byText = (text) => [...view.element.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
      // Link wymaga kompresji (CompressionStream – osobny wątek), więc czas jego powstania nie jest stały: pod obciążeniem
      // (pełne `npm test`, wiele plików naraz) dwa obroty pętli zdarzeń nie wystarczały i test padał losowo.
      // Czekamy na samą operację panelu (view.idle), nie na zegar.
      const click = async (text) => {
        byText(text).click();
        await view.idle();
      };
      return { ...ctx, view, toasts, downloads, byText, click, linkBox: () => view.element.querySelector('.war-link') };
    };

    it('navigator.share dostaje tytuł, opis i link; anulowanie arkusza nie jest błędem', async () => {
      const shared = [];
      let fail = null;
      const nav = { share: async (data) => (fail ? Promise.reject(fail) : shared.push(data)), clipboard: { writeText: async () => shared.push('schowek') } };
      const p = open(nav);
      expect(p.view.element.textContent).toMatch(/Odbiorca dostaje kopię wariantu/);
      expect(p.view.element.textContent).toMatch(/Każdy, kto ma link, zobaczy/);
      expect(p.view.element.textContent).toContain('Udostępnij: Ciemny');
      await p.click('Udostępnij');
      expect(shared).toHaveLength(1);
      expect(shared[0].url).toMatch(/^https:\/\/przyklad\.github\.io\/dom-3d\/#w=1\./);
      expect(shared[0].title).toContain('Ciemny');
      // odbiorca dostaje dokładnie ten wariant
      const read = await withBase().controller.readShared(shared[0].url.split('#w=')[1]);
      expect(read.variant.name).toBe('Ciemny');

      fail = abort();
      await p.click('Udostępnij');
      expect(shared).toHaveLength(1); // ani schowek, ani komunikat
      expect(p.toasts).toEqual([]);
      expect(p.linkBox().hidden).toBe(true);
    });

    it('bez navigator.share: schowek + „Link skopiowany”; bez schowka: pole z linkiem', async () => {
      const copied = [];
      const p = open({ clipboard: { writeText: async (t) => copied.push(t) } });
      await p.click('Udostępnij');
      expect(copied[0]).toMatch(/#w=1\./);
      expect(p.toasts).toEqual(['Link skopiowany']);

      const q = open({});
      await q.click('Udostępnij');
      expect(q.toasts).toEqual([]);
      expect(q.linkBox().hidden).toBe(false);
      expect(q.linkBox().querySelector('input').value).toMatch(/^https:\/\/przyklad\.github\.io\/dom-3d\/#w=1\./);

      // schowek odmawia (brak zgody) → też pole z linkiem
      const r = open({ share: async () => Promise.reject(new Error('NotAllowed')), clipboard: { writeText: async () => Promise.reject(new Error('denied')) } });
      await r.click('Udostępnij');
      expect(r.linkBox().hidden).toBe(false);
    });

    it('link nie może powstać → komunikat i propozycja pliku; „Wyślij plik” udostępnia plik eksportu', async () => {
      const shared = [];
      const nav = { share: async (data) => shared.push(data), canShare: (data) => Array.isArray(data.files) };
      const ctx = withBase();
      ctx.app.variant.update((d) => {
        d.customMaterials.push({ id: 'wlasny-1', name: 'Moja', dataUrl: 'data:image/png;base64,AAAA', size: [0.6, 0.6] });
        d.finishes['parter:0/3:floor'] = { kind: 'material', id: 'wlasny-1', rot: 0 };
      });
      const p = open(nav, ctx);
      await p.click('Udostępnij');
      expect(shared).toEqual([]);
      const info = [...p.view.element.querySelectorAll('[role="status"]')].find((n) => /zdjęcia płytek/.test(n.textContent));
      expect(info.hidden).toBe(false);
      expect(info.textContent).toMatch(/Wyślij go jako plik/);
      expect(p.byText('Wyślij plik').classList.contains('war-btn--primary')).toBe(true);

      await p.click('Wyślij plik');
      expect(shared).toHaveLength(1);
      const file = shared[0].files[0];
      expect(file.name).toBe('dom-ciemny-2026-11-24.json');
      const data = JSON.parse(file.text);
      expect(data.app).toBe(APP_ID);
      expect(data.variants[0].customMaterials).toHaveLength(1); // plik niesie zdjęcie płytki
      expect(p.downloads).toEqual([]);
      expect(info.hidden).toBe(true);
    });

    it('„Wyślij plik” bez udostępniania plików → zwykłe pobranie; anulowanie arkusza nie pobiera', async () => {
      const p = open({ share: async () => {}, canShare: () => false });
      await p.click('Wyślij plik');
      expect(p.downloads.map((d) => d.filename)).toEqual(['dom-ciemny-2026-11-24.json']);
      expect(p.toasts.at(-1)).toMatch(/Zapisano plik dom-ciemny-2026-11-24\.json/);

      const q = open(null);
      await q.click('Wyślij plik');
      expect(q.downloads).toHaveLength(1);

      const r = open({ share: async () => Promise.reject(abort()), canShare: () => true });
      await r.click('Wyślij plik');
      expect(r.downloads).toEqual([]);
      expect(r.toasts).toEqual([]);
    });

    it('wolna kompresja linku (obciążony telefon / komputer): kliknięcie i tak kończy się udostępnieniem', async () => {
      // kompresja, która oddaje wynik dopiero po kilkudziesięciu milisekundach – dużo dłużej niż parę obrotów pętli zdarzeń
      class SlowCompressionStream {
        constructor(format) {
          const inner = new CompressionStream(format);
          const reader = inner.readable.getReader();
          this.writable = inner.writable;
          this.readable = { getReader: () => ({ read: () => new Promise((r) => setTimeout(r, 30)).then(() => reader.read()), cancel: () => reader.cancel() }) };
        }
      }
      const shared = [];
      const p = open({ share: async (data) => shared.push(data) }, withBase({ streams: { CompressionStream: SlowCompressionStream, DecompressionStream } }));
      await p.click('Udostępnij'); // link jeszcze się liczy (przygotowanie zaczęło się przy otwarciu panelu)
      expect(shared).toHaveLength(1);
      expect(shared[0].url).toMatch(/#w=1\.z\./);
      const other = p.controller.getState().variants.find((v) => v.id !== p.controller.getState().activeId);
      p.controller.switchTo(other.id);
      await p.click('Udostępnij'); // zaraz po przełączeniu: nowy link dopiero powstaje
      expect(shared).toHaveLength(2);
      expect((await withBase().controller.readShared(shared[1].url.split('#w=')[1])).variant.name).toBe(other.name);
    });

    it('po przełączeniu wariantu link dotyczy nowego aktywnego', async () => {
      const shared = [];
      const p = open({ share: async (data) => shared.push(data) });
      const other = p.controller.getState().variants.find((v) => v.id !== p.controller.getState().activeId);
      p.controller.switchTo(other.id);
      expect(p.view.element.textContent).toContain(`Udostępnij: ${other.name}`);
      await p.click('Udostępnij');
      const read = await withBase().controller.readShared(shared[0].url.split('#w=')[1]);
      expect(read.variant.name).toBe(other.name);
    });
  });
});

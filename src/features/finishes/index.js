// Funkcja WYKOŃCZENIA: dotknięcie powierzchni (ściana / podłoga / sufit / skos / komin) otwiera panel materiałów,
// a scena jest doprowadzana do stanu variant.finishes przy starcie i po każdym 'variant:change'.
//
// Moduły:
//   library.js  – dane: biblioteka materiałów, formaty, fugi          palette.js – dane: kolory farb
//   finish.js   – czysta logika: walidacja Finish, parametry, klucze   split.js   – cięcie siatki na wysokości (czyste)
//   textures.js – tekstury proceduralne na <canvas> + pamięć podręczna apply.js   – Finish → materiały / geometria
//   panel.js    – interfejs panelu                                      upload.js  – zdjęcie własnej płytki
//   highlight.js – obrys zaznaczonej powierzchni                        recent.js  – ostatnio używane
//
// Zdarzenia emitowane dla innych funkcji: 'finishes:select' { surfaceId }, 'finishes:deselect' { surfaceId }.
import './finishes.css';
import { createTextureCache } from './textures.js';
import { createFinishApplier } from './apply.js';
import { createHighlight } from './highlight.js';
import { createFinishPanel } from './panel.js';
import { createRecent } from './recent.js';

/**
 * @param {import('../../app/app.js').App} app
 * @returns {{select: (surfaceId: string) => boolean, deselect: () => void, applier: Object, panel: Object, dispose: () => void}}
 */
export function init(app) {
  const textures = createTextureCache({
    // zdjęcie własnej płytki wczytuje się asynchronicznie – powierzchnie czekające na nie są wtedy odświeżane
    onImageReady: () => {
      if (applier.markPendingStale()) applier.sync(app.variant.get());
    },
  });
  const applier = createFinishApplier(app, textures);
  const highlight = createHighlight(app, applier);
  const recent = createRecent();

  function setSelection(surfaceId) {
    const sel = app.store.getState().selection;
    if (surfaceId) app.store.setState({ selection: { surfaceId } });
    else if (sel && sel.surfaceId && !sel.objectId) app.store.setState({ selection: null });
  }

  const panel = createFinishPanel(app, {
    applier, textures, recent,
    // panel zamknięty (krzyżykiem, przez inną funkcję albo przed otwarciem kolejnej powierzchni) → koniec zaznaczenia
    onClose: (surfaceId) => {
      highlight.clear();
      setSelection(null);
      app.events.emit('finishes:deselect', { surfaceId });
    },
  });

  function select(surfaceId) {
    if (!app.getSurface(surfaceId)) return false;
    if (panel.surfaceId === surfaceId) return true;
    panel.open(surfaceId);
    highlight.show(surfaceId);
    setSelection(surfaceId);
    app.events.emit('finishes:select', { surfaceId });
    return true;
  }
  const deselect = () => panel.close();

  /**
   * Czy to dotknięcie powierzchni jest "nasze" (uzgodnienie z innymi funkcjami – patrz JSDoc zdarzeń w app.js):
   *  - narzędzie innej funkcji przejęło dotknięcia (store.activeTool, np. katalog mebli wskazujący miejsce) → nie,
   *  - w chwili dotknięcia zaznaczony był mebel → dotknięcie tylko go odznacza (robi to funkcja mebli) → nie.
   */
  function tapIsOurs(e) {
    const state = app.store.getState();
    if (state.activeTool && state.activeTool !== 'finishes') return false;
    // payload.selection to zaznaczenie z chwili dotknięcia; gdy go brak (zdarzenie wysłane ręcznie), bierzemy bieżące
    const selection = e && 'selection' in e ? e.selection : state.selection;
    return !(selection && selection.objectId);
  }

  const offs = [
    app.events.on('surface:tap', (e) => {
      if (tapIsOurs(e)) select(e.surfaceId);
    }),
    app.events.on('background:tap', deselect),
    app.events.on('variant:change', ({ variant }) => {
      applier.sync(variant); // także po podmianie całego wariantu (przełączenie, import, wczytanie)
      panel.refresh();
    }),
    app.events.on('view:change', () => highlight.refresh()),
    app.events.on('level:change', () => highlight.refresh()),
  ];

  applier.sync(app.variant.get());

  return {
    select,
    deselect,
    applier,
    panel,
    textures,
    dispose() {
      for (const off of offs) off();
      panel.close();
      highlight.dispose();
      applier.dispose();
      textures.dispose();
    },
  };
}

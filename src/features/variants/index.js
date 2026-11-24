// Funkcja WARIANTY: kilka wersji aranżacji (wykończenia + meble), przełączanie, autozapis, eksport / import.
//
// Moduły:
//   validate.js   – czysta walidacja i oczyszczanie danych (import, localStorage), migracje formatu
//   storage.js    – odczyt / zapis localStorage z obsługą błędów
//   controller.js – lista wariantów, aktywny wariant, autozapis (bez interfejsu)
//   io.js         – plik eksportu, nazwa pliku, pobieranie i czytanie plików
//   panel.js      – zawartość panelu „Warianty”
//
// init(app) jest wołane PIERWSZE (przed wykończeniami i meblami): po nim app.variant.get() zwraca już wczytany wariant.
import './variants.css';
import { createStarterFurniture } from '../furniture/starter.js';
import { createStorage } from './storage.js';
import { createController, defaultMakeId } from './controller.js';
import { createVariantsPanel, ICONS } from './panel.js';

/**
 * @param {import('../../app/app.js').App} app
 * @param {Object} [deps]  zależności do podmiany w testach
 * @param {?Storage} [deps.storage]        domyślnie window.localStorage
 * @param {() => string} [deps.makeId]     domyślnie crypto.randomUUID
 * @param {() => Date} [deps.now]          domyślnie bieżący czas
 * @param {(filename: string, text: string) => void} [deps.download]
 * @returns {ReturnType<typeof createController> & {openPanel: () => void, destroy: () => void}}
 */
export function init(app, deps = {}) {
  const storage = createStorage('storage' in deps ? { storage: deps.storage } : {});
  const controller = createController(app, {
    storage,
    makeId: deps.makeId || defaultMakeId,
    now: deps.now || (() => new Date()),
    createStarter: createStarterFurniture,
  });

  // ---------------------------------------------------------------- przycisk i panel
  let open = null; // { handle, view } gdy panel jest otwarty
  const activeName = () => {
    const { variants, activeId } = controller.getState();
    return variants.find((v) => v.id === activeId)?.name || 'Warianty';
  };

  const toolbarButton = app.ui.addToolbarButton({ id: 'variants', label: activeName(), icon: ICONS.variants, onClick: togglePanel });
  const syncButton = () => {
    // na telefonie przycisk to sama ikona – nazwa aktywnego wariantu zostaje w opisie (title / aria-label)
    toolbarButton.setLabel(activeName(), `Warianty – aktywny: ${activeName()}`);
  };
  syncButton();
  const offLabel = controller.onChange((what) => {
    if (what === 'list') syncButton();
  });

  function openPanel() {
    if (open) return;
    const view = createVariantsPanel(controller, { toast: (text) => app.ui.toast(text, { duration: 5000 }), download: deps.download });
    const handle = app.ui.openPanel({
      title: 'Warianty',
      content: view.element,
      onClose() {
        view.dispose();
        open = null;
        toolbarButton.setActive(false);
      },
    });
    open = { handle, view };
    toolbarButton.setActive(true);
  }
  function togglePanel() {
    if (open) open.handle.close();
    else openPanel();
  }

  // ---------------------------------------------------------------- zapis przy wychodzeniu ze strony
  // 'pagehide' i przejście karty w tło to ostatnie pewne momenty na telefonie (beforeunload bywa pomijane).
  const onHide = () => controller.flush();
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') controller.flush();
  };
  window.addEventListener('pagehide', onHide);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    ...controller,
    openPanel,
    destroy() {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      offLabel();
      if (open) open.handle.close();
      toolbarButton.remove();
      controller.dispose();
    },
  };
}

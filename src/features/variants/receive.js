// Odbiór wariantu z linku (#w=…): przy starcie aplikacji, na 'hashchange' (link otwarty, gdy strona już działa)
// i z linku WKLEJONEGO w panelu Warianty (ikona na ekranie początkowym iPhone'a ma osobną pamięć niż Safari i nie ma
// paska adresu, a przeglądarka wbudowana w komunikator to też osobna pamięć – tam link trzeba wkleić).
//
// Zasady:
//  - fragment znika z adresu od razu (history.replaceState), także przy błędzie – odświeżenie strony nie pyta ponownie;
//  - nic nie jest dodawane bez pytania i nic nie jest nadpisywane: wariant z linku zawsze trafia na listę jako NOWY;
//  - ten sam link otwarty drugi raz dodaje kolejną kopię z dopiskiem „(2)” – tak samo jak ponowny import pliku;
//  - zamknięcie pytania bez wyboru (krzyżyk, otwarcie innego panelu przez dotknięcie modelu) niczego nie dodaje,
//    ale mówi o tym komunikatem – adres jest już czysty, więc bez niego wariant zniknąłby bez śladu;
//  - gdy lista jest pełna, pytanie zostaje otwarte (komunikat o limicie) – nie trzeba otwierać linku od nowa.
import { el } from '../../ui/dom.js';
import { plural } from './io.js';
import { extractSharePayload, readShareFragment } from './share.js';

export const MESSAGES = {
  dismissed: 'Wariant z linku nie został dodany – otwórz link ponownie, żeby go dodać.',
  noLink: 'W tym tekście nie ma linku do wariantu. Skopiuj cały link z wiadomości.',
};

/** Domyślnie czekamy na następną klatkę: pytanie pojawia się po app.start() i po starcie pozostałych funkcji. */
function nextFrame(win) {
  return new Promise((resolve) => {
    if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * @param {import('../../app/app.js').App} app
 * @param {ReturnType<import('./controller.js').createController>} controller
 * @param {{win?: Window, defer?: () => Promise<void>}} [deps]  do podmiany w testach
 */
export function createShareReceiver(app, controller, { win = window, defer = () => nextFrame(win) } = {}) {
  const toast = (text) => app.ui.toast(text, { duration: 6000 });
  let disposed = false;
  let seq = 0; // gdy przyjdzie drugi link, zanim pierwszy się zdekoduje – liczy się ostatni

  function clearFragment() {
    try {
      win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search);
    } catch {
      // np. strona otwarta z pliku – trudno, pytanie pojawi się ponownie po odświeżeniu
    }
  }

  let question = null; // otwarte pytanie: { decided } – decided = zamknięcie nie wymaga już komunikatu

  function ask({ variant, report }) {
    const finishes = Object.keys(variant.finishes).length;
    const furniture = variant.furniture.length;
    if (question) question.decided = true; // nowy link zastępuje poprzednie pytanie – bez komunikatu o starym
    const mine = { decided: false };
    let handle = null;
    const close = () => {
      mine.decided = true;
      handle.close();
    };
    const add = () => {
      const result = controller.addShared(variant, report);
      toast(result.message);
      if (result.ok) close(); // pełna lista → komunikat o limicie, pytanie zostaje otwarte
    };
    const content = el('div', { class: 'war war-ask' }, [
      el('p', { class: 'war-ask__question' }, `Dodać wariant «${variant.name}»?`),
      el('p', { class: 'war-note' }, `Wariant z linku: ${plural(finishes, 'wykończenie', 'wykończenia', 'wykończeń')} · ${plural(furniture, 'mebel', 'meble', 'mebli')}. Twoje warianty zostaną bez zmian – ten pojawi się na liście jako nowy.`),
      el('div', { class: 'war-actions' }, [
        el('button', { class: 'btn war-btn war-btn--primary', type: 'button', onclick: add }, 'Dodaj i otwórz'),
        el('button', { class: 'btn war-btn', type: 'button', onclick: close }, 'Nie teraz'),
      ]),
    ]);
    handle = app.ui.openPanel({
      title: 'Wariant z linku',
      content,
      onClose() {
        if (question === mine) question = null;
        if (!mine.decided && !disposed) toast(MESSAGES.dismissed);
      },
    });
    question = mine;
  }

  /** Dekoduje dane linku i pyta o dodanie (albo pokazuje komunikat o błędzie). */
  async function receive(payload) {
    const mine = ++seq;
    const result = await controller.readShared(payload);
    await defer();
    if (mine !== seq) return;
    if (result.ok) ask(result);
    else toast(result.message);
  }

  /**
   * Sprawdza adres strony; gdy jest w nim wariant – czyści fragment, dekoduje i pyta.
   * @returns {Promise<boolean>} true, gdy w adresie był link do wariantu (także uszkodzony)
   */
  async function check() {
    const payload = readShareFragment(win.location.hash);
    if (payload === null) return false;
    clearFragment();
    await receive(payload);
    return true;
  }

  /**
   * Link wklejony ręcznie (sam adres albo cała wiadomość z adresem w środku) – ta sama droga co link otwarty w adresie.
   * @returns {Promise<boolean>} false, gdy w tekście nie ma linku do wariantu
   */
  async function paste(text) {
    const payload = extractSharePayload(text);
    if (payload === null) {
      toast(MESSAGES.noLink);
      return false;
    }
    await receive(payload);
    return true;
  }

  const onHashChange = () => {
    check();
  };
  win.addEventListener('hashchange', onHashChange);

  return {
    check,
    paste,
    dispose() {
      disposed = true;
      seq += 1;
      win.removeEventListener('hashchange', onHashChange);
    },
  };
}

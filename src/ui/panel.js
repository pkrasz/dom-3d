// Wspólny panel dla funkcji: arkusz od dołu na telefonie, panel z prawej na komputerze.
// Naraz otwarty jest jeden panel – otwarcie kolejnego zamyka poprzedni (z wywołaniem jego onClose).
import { el } from './dom.js';
import { icons } from './icons.js';

export function createPanel(root, { onBottomInset } = {}) {
  const titleEl = el('h2', { class: 'panel__title' });
  const body = el('div', { class: 'panel__body' });
  const closeBtn = el('button', { class: 'btn btn--icon', type: 'button', 'aria-label': 'Zamknij panel', html: icons.close });
  const panel = el('section', { class: 'panel', 'aria-hidden': 'true' }, [
    el('header', { class: 'panel__head' }, [titleEl, closeBtn]),
    body,
  ]);
  root.append(panel);
  let current = null;

  // Wysokość otwartego arkusza dolnego trafia do zmiennej CSS --panel-h: joystick spaceru podnosi się nad panel,
  // żeby przy otwartym panelu dało się chodzić. Dla panelu bocznego (i zamkniętego) wartość to 0.
  // Ta sama liczba idzie do onBottomInset – rdzeń przesuwa wtedy obraz rzutu / orbity nad arkusz.
  let lastInset = 0;
  function syncHeight() {
    let h = 0;
    if (current) {
      const r = panel.getBoundingClientRect();
      const isBottomSheet = r.width >= root.clientWidth - 1;
      if (isBottomSheet) h = Math.round(r.height);
    }
    document.documentElement.style.setProperty('--panel-h', `${h}px`);
    if (h !== lastInset) {
      lastInset = h;
      onBottomInset?.(h);
    }
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncHeight).observe(panel);
  window.addEventListener('resize', syncHeight);

  function closePanel() {
    if (!current) return;
    const { onClose, className } = current;
    current = null;
    if (className) panel.classList.remove(...className.split(/\s+/).filter(Boolean));
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    body.replaceChildren();
    syncHeight();
    onClose?.();
  }

  /**
   * @param {{title: string, content: HTMLElement, onClose?: () => void, className?: string}} options
   *        className – klasy CSS dokładane do panelu na czas, gdy jest otwarty (np. niższy arkusz edycji mebla)
   * @returns {{close: () => void, setTitle: (t: string) => void, element: HTMLElement}}
   */
  function openPanel({ title, content, onClose, className = '' }) {
    closePanel();
    current = { onClose, className };
    if (className) panel.classList.add(...className.split(/\s+/).filter(Boolean));
    titleEl.textContent = title || '';
    body.replaceChildren(content);
    body.scrollTop = 0;
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    syncHeight();
    return { close: closePanel, setTitle: (t) => (titleEl.textContent = t), element: panel };
  }

  closeBtn.addEventListener('click', closePanel);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) closePanel();
  });

  return { openPanel, closePanel, get isOpen() { return Boolean(current); }, get bottomInset() { return lastInset; }, element: panel };
}

// Lista pomieszczeń wybranej kondygnacji ("skocz do").
import { el } from './dom.js';
import { roomArea } from '../../tools/geometry.mjs';

export function createRoomList(root, { house, store, onPick }) {
  const list = el('div', { class: 'menu__list', role: 'menu' });
  const menu = el('div', { class: 'menu', 'aria-hidden': 'true' }, [el('div', { class: 'menu__head' }, 'Skocz do pomieszczenia'), list]);
  root.append(menu);
  let open = false;
  let anchor = null;

  function fill() {
    const { levelId } = store.getState();
    const shown = levelId === 'all' ? house.levels : house.levels.filter((l) => l.id === levelId);
    list.replaceChildren();
    for (const level of shown) {
      if (shown.length > 1) list.append(el('div', { class: 'menu__group' }, level.name));
      for (const room of level.rooms) {
        const area = roomArea(level, room).toFixed(1).replace('.', ',');
        list.append(
          el('button', { class: 'menu__item', type: 'button', role: 'menuitem', onclick: () => { close(); onPick(level.id, room.id); } }, [
            el('span', { class: 'menu__id' }, room.id),
            el('span', { class: 'menu__name' }, room.name),
            el('span', { class: 'menu__meta' }, `${area} m²`),
          ])
        );
      }
    }
  }

  function close() {
    if (!open) return;
    open = false;
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    anchor?.setAttribute('aria-expanded', 'false');
  }

  function toggle(button) {
    if (open) return close();
    anchor = button;
    fill();
    // pod całym paskiem (nie zasłania przełączników); na szerokim ekranie wyrównana do przycisku
    const r = button.getBoundingClientRect();
    const bar = (button.closest('.topbar') || button).getBoundingClientRect();
    menu.style.top = `${Math.round(bar.bottom + 6)}px`;
    menu.style.setProperty('--anchor-right', `${Math.max(8, Math.round(window.innerWidth - r.right))}px`);
    open = true;
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
    button.setAttribute('aria-expanded', 'true');
    return undefined;
  }

  // zamknięcie po dotknięciu poza listą i klawiszem Esc
  window.addEventListener('pointerdown', (e) => {
    if (open && !menu.contains(e.target) && !anchor?.contains(e.target)) close();
  }, true);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  store.subscribe((_, __, changed) => {
    if (open && changed.includes('levelId')) fill();
  });

  return { toggle, close };
}

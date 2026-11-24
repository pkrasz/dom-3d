// Górny pasek: nazwa, kondygnacja, tryb widoku, przyciski (Pomieszczenia, Dach, Dzień/Wieczór + przyciski funkcji).
import { el, iconLabel } from './dom.js';
import { icons } from './icons.js';

const MODES = [
  { id: 'top', label: 'Z góry', icon: icons.top },
  { id: 'orbit', label: 'Orbita', icon: icons.orbit },
  { id: 'walk', label: 'Spacer', icon: icons.walk },
];

/** Grupa przełączników (jeden aktywny). */
function segmented(label, items, onPick) {
  const buttons = new Map();
  const group = el('div', { class: 'seg', role: 'group', 'aria-label': label });
  for (const item of items) {
    const b = el('button', { class: 'seg__btn', type: 'button', onclick: () => onPick(item.id) }, item.icon ? iconLabel(item.icon, item.label) : item.label);
    buttons.set(item.id, b);
    group.append(b);
  }
  return {
    element: group,
    set(activeId, disabledIds = []) {
      for (const [id, b] of buttons) {
        b.classList.toggle('is-active', id === activeId);
        b.setAttribute('aria-pressed', String(id === activeId));
        b.disabled = disabledIds.includes(id);
      }
    },
  };
}

export function createTopbar(root, { house, store, onRooms }) {
  const levels = [...house.levels.map((l) => ({ id: l.id, label: l.name })), { id: 'all', label: 'Cały dom' }];
  const levelSeg = segmented('Kondygnacja', levels, (id) => store.setState({ levelId: id }));
  const modeSeg = segmented('Tryb widoku', MODES, (id) => store.setState({ viewMode: id }));

  // Na telefonie podpis jest ukryty (sama ikona) – dlatego każdy przycisk ma aria-label i title.
  const actionBtn = (id, label, icon, onClick) =>
    el('button', { class: 'btn btn--action', type: 'button', dataset: { id }, onclick: onClick, title: label, 'aria-label': label }, iconLabel(icon, label));

  const roomsBtn = actionBtn('rooms', 'Pomieszczenia', icons.rooms, (e) => onRooms(e.currentTarget));
  const roofBtn = actionBtn('roof', 'Dach', icons.roof, () => store.setState((s) => ({ showRoof: !s.showRoof })));
  const lightBtn = actionBtn('light', 'Dzień', icons.sun, () => store.setState((s) => ({ lighting: s.lighting === 'day' ? 'evening' : 'day' })));
  const extra = el('div', { class: 'topbar__extra' }); // przyciski dodawane przez funkcje
  const actions = el('div', { class: 'topbar__actions' }, [roomsBtn, roofBtn, lightBtn, extra]);

  const title = el('h1', { class: 'topbar__title', title: house.meta.name }, house.meta.name);
  const bar = el('header', { class: 'topbar' }, [
    el('div', { class: 'topbar__row topbar__row--main' }, [title, actions]),
    el('div', { class: 'topbar__row topbar__row--views' }, [levelSeg.element, modeSeg.element]),
  ]);
  root.append(bar);

  function sync() {
    const s = store.getState();
    levelSeg.set(s.levelId, s.viewMode === 'orbit' ? [] : ['all']);
    modeSeg.set(s.viewMode);
    roofBtn.hidden = s.viewMode !== 'orbit';
    roofBtn.classList.toggle('is-active', s.showRoof);
    roofBtn.setAttribute('aria-pressed', String(s.showRoof));
    roofBtn.title = s.showRoof ? 'Ukryj dach i strop' : 'Pokaż dach i strop';
    const evening = s.lighting === 'evening';
    lightBtn.replaceChildren(...iconLabel(evening ? icons.moon : icons.sun, evening ? 'Wieczór' : 'Dzień'));
    lightBtn.title = evening ? 'Przełącz na dzień' : 'Przełącz na wieczór';
    lightBtn.setAttribute('aria-label', `Oświetlenie: ${evening ? 'wieczór' : 'dzień'}`);
  }
  store.subscribe(sync);
  sync();

  return {
    element: bar,
    roomsButton: roomsBtn,
    get height() {
      return bar.getBoundingClientRect().height;
    },
    /**
     * Dodaje przycisk do paska (dla funkcji).
     * @param {{id: string, label: string, icon?: string, onClick: (ev: MouseEvent) => void}} options  icon = kod SVG
     * Przycisk bez ikony zachowuje podpis także na telefonie – dlatego funkcje powinny podawać ikonę.
     * @returns {{element: HTMLButtonElement, setActive: (v: boolean) => void, setLabel: (t: string, description?: string) => void, remove: () => void}}
     *          setLabel(t, opis): podpis przycisku; opis (domyślnie = podpis) trafia do title i aria-label
     */
    addButton({ id, label, icon, onClick }) {
      extra.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove();
      const b = actionBtn(id, label, icon || '', onClick);
      if (!icon) b.classList.add('btn--text');
      extra.append(b);
      return {
        element: b,
        setActive: (v) => {
          b.classList.toggle('is-active', v);
          b.setAttribute('aria-pressed', String(v));
        },
        setLabel: (t, description = t) => {
          b.querySelector('.lbl').textContent = t;
          b.title = description;
          b.setAttribute('aria-label', description);
        },
        remove: () => b.remove(),
      };
    },
  };
}

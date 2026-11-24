// Interfejs: pasek górny, lista pomieszczeń, panel funkcji, joystick, komunikaty.
import { createTopbar } from './topbar.js';
import { createPanel } from './panel.js';
import { createRoomList } from './roomList.js';
import { createJoystick, hasTouch } from './joystick.js';
import { createToast } from './toast.js';

const HINTS = {
  top: { mouse: 'Przeciągnij, aby przesunąć rzut · kółko – zoom', touch: 'Jeden palec przesuwa rzut · dwa palce – zoom' },
  orbit: { mouse: 'Przeciągnij, aby obrócić · prawy przycisk – przesuw · kółko – zoom', touch: 'Jeden palec obraca · dwa palce – zoom i przesuw' },
  walk: { mouse: 'W A S D lub strzałki – chodzenie · przeciągnij myszą – rozglądanie', touch: 'Joystick – chodzenie · przeciągnij palcem – rozglądanie' },
};

export function createUI(root, { house, store, onFocusRoom, onJoystick, onBottomInset }) {
  const toast = createToast(root);
  const panel = createPanel(root, { onBottomInset });
  const rooms = createRoomList(root, { house, store, onPick: onFocusRoom });
  const topbar = createTopbar(root, { house, store, onRooms: (button) => rooms.toggle(button) });
  const joystick = createJoystick(root, onJoystick);

  const hinted = new Set();
  function sync(state, prev, changed = ['viewMode']) {
    joystick.setVisible(state.viewMode === 'walk' && hasTouch());
    document.documentElement.dataset.view = state.viewMode;
    if (changed.includes('viewMode') && !hinted.has(state.viewMode)) {
      hinted.add(state.viewMode);
      toast(HINTS[state.viewMode][hasTouch() ? 'touch' : 'mouse'], { duration: 4200 });
    }
  }
  store.subscribe(sync);
  sync(store.getState());

  return {
    openPanel: panel.openPanel,
    closePanel: panel.closePanel,
    addToolbarButton: topbar.addButton,
    toast,
    /** Wysokość paska górnego w pikselach (do kadrowania widoku). */
    get topInset() {
      return topbar.height;
    },
    topbar,
    panel,
  };
}

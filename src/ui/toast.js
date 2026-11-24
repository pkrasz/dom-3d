// Krótkie komunikaty u dołu ekranu.
import { el } from './dom.js';

export function createToast(root) {
  const box = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  root.append(box);
  let timer = 0;
  return function toast(text, { duration = 3200 } = {}) {
    box.textContent = text;
    box.classList.add('is-visible');
    clearTimeout(timer);
    timer = setTimeout(() => box.classList.remove('is-visible'), duration);
  };
}

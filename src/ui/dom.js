// Małe pomocniki DOM – interfejs jest w czystym JavaScripcie, bez frameworka.

/** Tworzy element: el('button', { class: 'x', onclick: fn, 'aria-label': '…' }, [dzieci | tekst]). */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Ikona + podpis – wspólny układ przycisków paska. */
export function iconLabel(iconSvg, label) {
  return [el('span', { class: 'ico', html: iconSvg || '', 'aria-hidden': 'true' }), el('span', { class: 'lbl' }, label)];
}

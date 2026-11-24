// Bryły mebli w Three.js: lista kształtów z katalogu → siatki.
// Lekko: WSZYSTKIE meble współdzielą dwie geometrie (sześcian i walec jednostkowy, skalowane siatką)
// oraz materiały (jeden na kolor, z licznikiem użyć – zwalniany, gdy nikt go już nie używa).
import { buildParts, typeOf, FIXED_COLORS } from './catalog.js';

/** Kolor '#rrggbb' przyciemniony (f < 1) albo rozjaśniony w stronę bieli (f > 1). */
export function tint(hex, f) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (!Number.isFinite(n)) return '#b8b2a6';
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = f <= 1 ? c * f : c + (255 - c) * (f - 1);
    return Math.max(0, Math.min(255, Math.round(v)));
  });
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const isHexColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/** Kolor materiału dla "slotu" z katalogu ('main', 'dark', 'light' albo nazwa koloru stałego). */
export function slotColor(slot, itemColor) {
  const base = isHexColor(itemColor) ? itemColor.toLowerCase() : '#b8b2a6';
  if (slot === 'main') return base;
  if (slot === 'dark') return tint(base, 0.74);
  if (slot === 'light') return tint(base, 1.45);
  return FIXED_COLORS[slot] || base;
}

/** @param {typeof import('three')} THREE */
export function createModelFactory(THREE) {
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
  cylGeo.rotateX(Math.PI / 2); // oś walca wzdłuż z (pion w układzie domu)
  const materials = new Map(); // klucz → { material, refs }

  function acquire(slot, itemColor) {
    const color = slotColor(slot, itemColor);
    const glass = slot === 'glass';
    const key = `${glass ? 'g' : 'm'}:${color}`;
    let entry = materials.get(key);
    if (!entry) {
      const material = new THREE.MeshLambertMaterial(glass ? { color, transparent: true, opacity: 0.35, depthWrite: false } : { color });
      material.name = `mebel:${key}`;
      material.userData.mebKey = key;
      entry = { material, refs: 0 };
      materials.set(key, entry);
    }
    entry.refs += 1;
    return entry.material;
  }

  function release(material) {
    const key = material?.userData?.mebKey;
    const entry = key && materials.get(key);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs <= 0) {
      entry.material.dispose();
      materials.delete(key);
    }
  }

  /** Usuwa siatki bryły z grupy mebla (geometrie są wspólne – zwalniamy tylko materiały). */
  function clear(root) {
    for (const child of [...root.children]) {
      if (!child.userData.mebPart) continue;
      release(child.material);
      root.remove(child);
    }
  }

  /** Buduje (od nowa) bryłę mebla w grupie root wg typu, wymiarów i koloru. */
  function fill(root, item) {
    clear(root);
    const type = typeOf(item);
    for (const part of buildParts(type, item.w, item.d, item.h)) {
      const mesh = new THREE.Mesh(part.shape === 'cyl' ? cylGeo : boxGeo, acquire(part.mat, item.color));
      mesh.scale.set(part.max[0] - part.min[0], part.max[1] - part.min[1], part.max[2] - part.min[2]);
      mesh.position.set((part.min[0] + part.max[0]) / 2, (part.min[1] + part.max[1]) / 2, (part.min[2] + part.max[2]) / 2);
      mesh.userData.mebPart = true;
      mesh.matrixAutoUpdate = false; // części nie ruszają się względem mebla
      mesh.updateMatrix();
      root.add(mesh);
    }
  }

  function dispose() {
    for (const { material } of materials.values()) material.dispose();
    materials.clear();
    boxGeo.dispose();
    cylGeo.dispose();
  }

  return { fill, clear, dispose, boxGeo, get materialCount() { return materials.size; } };
}

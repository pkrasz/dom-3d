// Bryły mebli w Three.js: lista kształtów z katalogu → siatki.
// Lekko: WSZYSTKIE meble współdzielą kilka geometrii jednostkowych (sześcian, walce w trzech osiach, rura, kula –
// każda wpisana w sześcian 1 × 1 × 1 i skalowana siatką) oraz materiały (jeden na kolor, z licznikiem użyć – zwalniany, gdy nikt go już nie używa).
import { buildParts, typeOf, secondColorOf, FIXED_COLORS } from './catalog.js';

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

/**
 * Kolor materiału dla "slotu" z katalogu: 'main' / 'dark' / 'light' (kolor mebla i jego odcienie),
 * 'second' / 'second-dark' / 'second-light' (drugi kolor mebla; bez niego – kolor główny) albo nazwa koloru stałego.
 */
export function slotColor(slot, itemColor, secondColor) {
  const base = isHexColor(itemColor) ? itemColor.toLowerCase() : '#b8b2a6';
  if (slot === 'main') return base;
  if (slot === 'dark') return tint(base, 0.74);
  if (slot === 'light') return tint(base, 1.45);
  if (typeof slot === 'string' && slot.startsWith('second')) {
    const second = isHexColor(secondColor) ? secondColor.toLowerCase() : base;
    if (slot === 'second-dark') return tint(second, 0.74);
    if (slot === 'second-light') return tint(second, 1.45);
    return second;
  }
  return FIXED_COLORS[slot] || base;
}

/** @param {typeof import('three')} THREE */
export function createModelFactory(THREE) {
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
  cylGeo.rotateX(Math.PI / 2); // oś walca wzdłuż z (pion w układzie domu)
  const cylXGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
  cylXGeo.rotateZ(Math.PI / 2); // walec leżący wzdłuż x
  const cylYGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 14); // walec leżący wzdłuż y (oś własna geometrii)
  // rura / misa bez dna: przekrój ścianki (prostokąt) obrócony wokół osi; ścianka = 12% promienia zewnętrznego
  const tubeGeo = new THREE.LatheGeometry(
    [[0.44, -0.5], [0.5, -0.5], [0.5, 0.5], [0.44, 0.5], [0.44, -0.5]].map(([r, z]) => new THREE.Vector2(r, z)),
    16
  );
  tubeGeo.rotateX(Math.PI / 2);
  const ballGeo = new THREE.SphereGeometry(0.5, 12, 8);
  const GEO = { box: boxGeo, cyl: cylGeo, cylX: cylXGeo, cylY: cylYGeo, tube: tubeGeo, ball: ballGeo, beam: boxGeo };
  const AXIS_Z = new THREE.Vector3(0, 0, 1);
  const dir = new THREE.Vector3();
  const materials = new Map(); // klucz → { material, refs }

  function acquire(slot, itemColor, secondColor) {
    const color = slotColor(slot, itemColor, secondColor);
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
    const second = secondColorOf(item, type);
    for (const part of buildParts(type, item.w, item.d, item.h)) {
      const mesh = new THREE.Mesh(GEO[part.shape] || boxGeo, acquire(part.mat, item.color, second));
      if (part.shape === 'beam') {
        // belka skośna: sześcian t × t × długość obrócony osią z wzdłuż odcinka from → to
        dir.set(part.to[0] - part.from[0], part.to[1] - part.from[1], part.to[2] - part.from[2]);
        mesh.scale.set(part.t, part.t, dir.length());
        mesh.quaternion.setFromUnitVectors(AXIS_Z, dir.normalize());
        mesh.position.set((part.from[0] + part.to[0]) / 2, (part.from[1] + part.to[1]) / 2, (part.from[2] + part.to[2]) / 2);
      } else {
        mesh.scale.set(part.max[0] - part.min[0], part.max[1] - part.min[1], part.max[2] - part.min[2]);
        mesh.position.set((part.min[0] + part.max[0]) / 2, (part.min[1] + part.max[1]) / 2, (part.min[2] + part.max[2]) / 2);
      }
      mesh.userData.mebPart = true;
      mesh.matrixAutoUpdate = false; // części nie ruszają się względem mebla
      mesh.updateMatrix();
      root.add(mesh);
    }
  }

  function dispose() {
    for (const { material } of materials.values()) material.dispose();
    materials.clear();
    for (const geo of new Set(Object.values(GEO))) geo.dispose();
  }

  return { fill, clear, dispose, boxGeo, get materialCount() { return materials.size; } };
}

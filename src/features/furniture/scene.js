// Synchronizacja WARIANT → SCENA: obiekty mebli w app.furnitureGroup(levelId) zawsze odpowiadają variant.furniture.
// Różnicowo po id: nowy mebel = nowa grupa, usunięty = usunięta, zmieniony = poprawiona (bryła budowana od nowa
// tylko wtedy, gdy zmienił się typ, wymiar albo kolor; samo przesunięcie / obrót zmienia tylko transformację).
import { createModelFactory } from './model.js';

const RAD = Math.PI / 180;
const ACCENT = '#ff7a1a'; // kolor zaznaczenia – wyraźny na każdej podłodze

/** @param {import('../../app/app.js').App} app */
export function createFurnitureScene(app) {
  const THREE = app.three;
  const factory = createModelFactory(THREE);
  /** @type {Map<string, {root: import('three').Group, shapeKey: string, levelId: string}>} */
  const objects = new Map();
  let selectedId = null;

  // ---------------------------------------------------------------- zaznaczenie: obrys bryły + gruba ramka na wierzchu
  const edgeGeo = new THREE.EdgesGeometry(factory.boxGeo);
  const edgeMat = new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false, transparent: true });
  const frameMat = new THREE.MeshBasicMaterial({ color: ACCENT, depthTest: false, transparent: true, opacity: 0.95 });
  const highlight = new THREE.Group();
  highlight.name = 'meble:zaznaczenie';
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  edges.renderOrder = 1000;
  highlight.add(edges);
  const bars = [0, 1, 2, 3].map(() => {
    const bar = new THREE.Mesh(factory.boxGeo, frameMat);
    bar.userData.noPick = true; // ramka nie może przechwytywać dotknięć
    bar.renderOrder = 1000;
    highlight.add(bar);
    return bar;
  });

  let barThickness = 0.045; // m; dopasowywana do powiększenia widoku (patrz updater niżej)

  function layoutHighlight(item) {
    const m = 0.03; // margines ramki wokół mebla
    const t = barThickness;
    const w = item.w + 2 * m;
    const d = item.d + 2 * m;
    edges.scale.set(w, d, item.h + 0.01);
    edges.position.set(0, 0, item.h / 2);
    const z = item.h + 0.012;
    bars[0].scale.set(w + t, t, 0.004);
    bars[0].position.set(0, -d / 2, z);
    bars[1].scale.set(w + t, t, 0.004);
    bars[1].position.set(0, d / 2, z);
    bars[2].scale.set(t, d + t, 0.004);
    bars[2].position.set(-w / 2, 0, z);
    bars[3].scale.set(t, d + t, 0.004);
    bars[3].position.set(w / 2, 0, z);
  }

  function applyHighlight() {
    const entry = selectedId ? objects.get(selectedId) : null;
    if (!entry) {
      highlight.removeFromParent();
      return;
    }
    layoutHighlight(entry.item);
    if (highlight.parent !== entry.root) entry.root.add(highlight);
  }

  // Ramka ma mieć na ekranie ok. 3 px niezależnie od powiększenia (w rzucie całego domu 4 cm to niecały piksel).
  // Updater jest wołany przed każdą rysowaną klatką; nic nie animuje (zwraca false).
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const removeUpdater = app.addUpdater?.(() => {
    const entry = selectedId ? objects.get(selectedId) : null;
    if (!entry) return false;
    const camera = app.camera;
    const viewH = Math.max(1, app.renderer?.domElement?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 0) || 600);
    let perPx; // metry na piksel w miejscu mebla
    if (camera.isOrthographicCamera) perPx = (camera.top - camera.bottom) / (camera.zoom || 1) / viewH;
    else {
      const dist = camera.getWorldPosition(tmpA).distanceTo(entry.root.getWorldPosition(tmpB));
      perPx = (2 * dist * Math.tan(((camera.fov || 50) * RAD) / 2)) / viewH;
    }
    const t = Math.min(0.25, Math.max(0.03, perPx * 3));
    if (Math.abs(t - barThickness) > barThickness * 0.1) {
      barThickness = t;
      layoutHighlight(entry.item);
    }
    return false;
  });

  // ---------------------------------------------------------------- obiekty
  const shapeKeyOf = (item) => `${item.type}|${item.w}|${item.d}|${item.h}|${item.color}`;

  function groupFor(levelId) {
    try {
      return app.furnitureGroup(levelId);
    } catch {
      return null; // mebel z nieistniejącej kondygnacji (np. wariant z innej wersji domu) – pomijamy
    }
  }

  /** Położenie, obrót i wysokość zawieszenia. */
  function place(root, item) {
    root.position.set(item.x, item.y, Number.isFinite(item.z) ? item.z : 0);
    root.rotation.z = (item.rot || 0) * RAD;
  }

  const isUsable = (item) =>
    item && typeof item.id === 'string' && [item.x, item.y, item.w, item.d, item.h].every((v) => Number.isFinite(v)) && item.w > 0 && item.d > 0 && item.h > 0;

  /** Doprowadza scenę do stanu listy mebli z wariantu. */
  function sync(furniture) {
    const seen = new Set();
    for (const item of Array.isArray(furniture) ? furniture : []) {
      if (!isUsable(item) || seen.has(item.id)) continue;
      const parent = groupFor(item.levelId);
      if (!parent) continue;
      seen.add(item.id);
      let entry = objects.get(item.id);
      if (!entry) {
        const root = new THREE.Group();
        root.name = `mebel:${item.id}`;
        root.userData = { pickable: true, furnitureId: item.id, part: 'furniture' };
        entry = { root, shapeKey: '', levelId: null, item };
        objects.set(item.id, entry);
      }
      entry.item = item;
      const key = shapeKeyOf(item);
      if (key !== entry.shapeKey) {
        factory.fill(entry.root, item);
        entry.shapeKey = key;
      }
      if (entry.levelId !== item.levelId || entry.root.parent !== parent) {
        parent.add(entry.root); // add() sam wypina z poprzedniej grupy
        entry.levelId = item.levelId;
      }
      place(entry.root, item);
    }
    for (const [id, entry] of objects) {
      if (seen.has(id)) continue;
      if (highlight.parent === entry.root) highlight.removeFromParent();
      factory.clear(entry.root);
      entry.root.removeFromParent();
      objects.delete(id);
    }
    applyHighlight();
    app.requestRender();
  }

  return {
    sync,
    /** Podgląd w trakcie przeciągania: przestawia obiekt bez zapisu do wariantu. */
    preview(id, pose) {
      const entry = objects.get(id);
      if (!entry) return;
      place(entry.root, { ...entry.item, ...pose });
      app.requestRender();
    },
    setSelected(id) {
      selectedId = id || null;
      applyHighlight();
      app.requestRender();
    },
    get: (id) => objects.get(id)?.root || null,
    get size() {
      return objects.size;
    },
    factory,
    highlight,
    dispose() {
      sync([]);
      removeUpdater?.();
      highlight.removeFromParent();
      edgeGeo.dispose();
      edgeMat.dispose();
      frameMat.dispose();
      factory.dispose();
    },
  };
}

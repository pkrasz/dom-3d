// Zaznaczenie powierzchni: gruby obrys w kolorze akcentu + krótki błysk całej powierzchni.
// Obrys nie zmienia kolorów wykończenia (ważne przy dobieraniu farby), a błysk od razu pokazuje, co wybrano.
import { BufferGeometry, BufferAttribute, EdgesGeometry, Mesh, MeshBasicMaterial } from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { sourceDrawCount } from './apply.js';

const COLOR = '#ff7a1a';
const LINE_PX = 4;
const FLASH_OPACITY = 0.38;
const FLASH_TIME = 0.7; // s

/**
 * @param {import('../../app/app.js').App} app
 * @param {{originalGeometry: (id: string) => import('three').BufferGeometry}} applier
 */
export function createHighlight(app, applier) {
  let current = null; // { surfaceId, mesh, outline, flash, visibleCount }
  let stopFlash = null;

  const lineMaterial = new LineMaterial({ color: COLOR, linewidth: LINE_PX, worldUnits: false, transparent: true, depthTest: true });
  // obrys leży dokładnie na powierzchni – odsunięcie w buforze głębi, żeby nie migotał
  lineMaterial.polygonOffset = true;
  lineMaterial.polygonOffsetFactor = -2;
  lineMaterial.polygonOffsetUnits = -8;
  const flashMaterial = new MeshBasicMaterial({
    color: COLOR, transparent: true, opacity: 0, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });

  /** Widoczna część oryginalnej geometrii (rdzeń bywa, że ukrywa końcówkę ściany przez drawRange). */
  function visibleGeometry(surface) {
    const src = applier.originalGeometry(surface.id);
    const count = Math.min(src.attributes.position.count, sourceDrawCount(surface.mesh.geometry));
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(src.attributes.position.array.subarray(0, count * 3), 3));
    return { geometry: g, count };
  }

  function removeObjects() {
    if (!current) return;
    for (const o of [current.outline, current.flash]) {
      if (!o) continue;
      o.removeFromParent();
      o.geometry.dispose();
    }
    current.outline = current.flash = null;
  }

  function build(withFlash) {
    const surface = app.getSurface(current.surfaceId);
    const { geometry, count } = visibleGeometry(surface);
    current.visibleCount = count;

    // krawędzie zewnętrzne (i otworów): wewnętrzne podziały ściany na trójkąty leżą w jednej płaszczyźnie i znikają
    const edges = new EdgesGeometry(geometry, 1);
    const lineGeometry = new LineSegmentsGeometry().setPositions(edges.attributes.position.array);
    edges.dispose();
    const outline = new LineSegments2(lineGeometry, lineMaterial);
    outline.userData.noPick = true; // obrys nie przechwytuje dotknięć
    outline.renderOrder = 20;
    outline.frustumCulled = false;
    surface.mesh.add(outline); // dziecko siatki: znika razem z ukrywaną kondygnacją
    current.outline = outline;

    if (withFlash) {
      const flash = new Mesh(geometry, flashMaterial);
      flash.userData.noPick = true;
      flash.renderOrder = 19;
      surface.mesh.add(flash);
      current.flash = flash;
      let t = 0;
      flashMaterial.opacity = FLASH_OPACITY;
      stopFlash?.();
      const off = app.addUpdater((dt) => {
        t += dt;
        flashMaterial.opacity = FLASH_OPACITY * Math.max(0, 1 - t / FLASH_TIME);
        if (t < FLASH_TIME) return true;
        endFlash();
        return false;
      });
      const endFlash = () => {
        off();
        stopFlash = null;
        if (current?.flash === flash) current.flash = null;
        flash.removeFromParent();
        geometry.dispose();
      };
      stopFlash = endFlash;
    } else geometry.dispose();
  }

  function clear() {
    stopFlash?.();
    removeObjects();
    current = null;
    app.requestRender();
  }

  return {
    /** Zaznacza powierzchnię (poprzednie zaznaczenie znika). */
    show(surfaceId) {
      clear();
      if (!app.getSurface(surfaceId)) return;
      lineMaterial.clippingPlanes = app.clippingPlanes; // w rzucie obrys jest cięty razem ze ścianami
      flashMaterial.clippingPlanes = app.clippingPlanes;
      current = { surfaceId, outline: null, flash: null, visibleCount: 0 };
      build(true);
      app.requestRender();
    },
    clear,
    /** Po zmianie widoku / kondygnacji: widoczna część ściany mogła się zmienić – obrys rysowany od nowa. */
    refresh() {
      if (!current) return;
      const surface = app.getSurface(current.surfaceId);
      const src = applier.originalGeometry(current.surfaceId);
      const count = Math.min(src.attributes.position.count, sourceDrawCount(surface.mesh.geometry));
      if (count === current.visibleCount) return;
      stopFlash?.();
      removeObjects();
      build(false);
      app.requestRender();
    },
    get surfaceId() {
      return current ? current.surfaceId : null;
    },
    dispose() {
      clear();
      lineMaterial.dispose();
      flashMaterial.dispose();
    },
  };
}

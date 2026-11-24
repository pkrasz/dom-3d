// Domyślne materiały. Prawdziwe wykończenia (płytki, podłogi, farby) dojdą w src/features/finishes.
// Każda powierzchnia edytowalna dostaje WŁASNY materiał (createSurfaceMaterial),
// elementy stałe (elewacja, dach, stolarka…) współdzielą materiały z createStaticMaterials.
import { MeshLambertMaterial, MeshBasicMaterial, DoubleSide } from 'three';

/** Kolory domyślne powierzchni wnętrz wg rodzaju (userData.kind). */
export const SURFACE_COLORS = {
  wall: '#f2efe8', // złamana biel
  chimney: '#f2efe8',
  ceiling: '#ffffff',
  slope: '#ffffff',
  floor: '#d2d1cc', // jasnoszara
};

/** Kolory elementów stałych. Klucz = nazwa materiału używana w src/geometry (batch('facade', …)). */
export const STATIC_COLORS = {
  facade: '#ecebe6', // elewacja jasna
  plinth: '#8d8c88', // cokół
  roof: '#3a3d42', // dach grafitowy
  frame: '#3b3f45', // ramy okien – grafit
  doorExt: '#34383d', // drzwi wejściowe i brama
  doorFrame: '#f7f7f5', // ościeżnice wewnętrzne – białe
  door: '#fbfbf9', // skrzydła wewnętrzne – białe
  reveal: '#f2efe8', // glify w kolorze ściany
  threshold: '#bdbcb7', // posadzka w progach
  trim: '#e9e9e6', // klapa wyłazu
  slab: '#c9c8c3', // lico stropu
  stairs: '#cdbfa8', // schody
  stairsAlt: '#c2b39a', // co drugi stopień (czytelność w rzucie)
  balustrade: '#3b3f45',
  terrain: '#9aa88f',
  paving: '#b9b7b0',
  chimney: '#d9d6cf',
  chimneyCap: '#55585c',
  topCap: '#a9a7a1', // wierzch murów (domek dla lalek)
  sectionCap: '#2a2c2f', // przekrój murów (widok z góry)
};

export function createSurfaceMaterial(kind) {
  const m = new MeshLambertMaterial({ color: SURFACE_COLORS[kind] || SURFACE_COLORS.wall });
  m.name = `domyślny:${kind}`;
  return m;
}

export function createStaticMaterials() {
  const out = {};
  for (const [key, color] of Object.entries(STATIC_COLORS)) {
    out[key] = key === 'sectionCap' ? new MeshBasicMaterial({ color }) : new MeshLambertMaterial({ color });
    out[key].name = key;
  }
  // teren odsunięty w buforze głębi – krawędź podjazdu leżąca na poziomie terenu nie migocze
  out.terrain.polygonOffset = true;
  out.terrain.polygonOffsetFactor = 1;
  out.terrain.polygonOffsetUnits = 4;
  out.glass = new MeshLambertMaterial({ color: '#b9d3e2', transparent: true, opacity: 0.28, depthWrite: false, side: DoubleSide });
  out.glass.name = 'glass';
  return out;
}

// Domyślne materiały. Prawdziwe wykończenia (płytki, podłogi, farby) dojdą w src/features/finishes.
// Każda powierzchnia edytowalna dostaje WŁASNY materiał (createSurfaceMaterial),
// elementy stałe (elewacja, dach, stolarka…) współdzielą materiały z createStaticMaterials.
import { MeshLambertMaterial, MeshBasicMaterial, DoubleSide } from 'three';
import { DESIGN_COLORS } from '../geometry/design.js';

/** O ile ciemniejsza jest co druga stopnica drewniana (czytelność podziału w rzucie). */
const TREAD_ALT_TONE = 0.93;

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
  roof: '#3b2a22', // dach głęboki ciemny brąz (wymóg MPZP – nie grafit)
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
  // --- opcje bryły z design.json (kolory domyślne w geometry/design.js; siatki powstają tylko przy włączonej opcji)
  slat: DESIGN_COLORS.slat, // lamele przy schodach
  stairTread: DESIGN_COLORS.stairTread, // stopnice drewniane
  stairTreadAlt: DESIGN_COLORS.stairTread, // co druga stopnica – ton ciemniejsza (liczona z koloru stopnicy)
  stairRiser: DESIGN_COLORS.stairRiser, // podstopnice i boki schodów
  beam: DESIGN_COLORS.beam, // belki pod otwartym sufitem
  barnDoor: DESIGN_COLORS.barnDoor, // skrzydła drzwi przesuwnych
  barnRail: DESIGN_COLORS.barnRail, // szyna i wózki drzwi przesuwnych
  terrain: '#9aa88f',
  paving: '#b9b7b0',
  chimney: '#d9d6cf',
  chimneyCap: '#4a382e', // czapy kominów w tonie dachu
  topCap: '#a9a7a1', // wierzch murów (domek dla lalek)
  sectionCap: '#2a2c2f', // przekrój murów (widok z góry)
};

export function createSurfaceMaterial(kind) {
  const m = new MeshLambertMaterial({ color: SURFACE_COLORS[kind] || SURFACE_COLORS.wall });
  m.name = `domyślny:${kind}`;
  return m;
}

/** @param {Object<string, string>} [overrides] kolory z design.json (klucze jak w STATIC_COLORS) */
export function createStaticMaterials(overrides = {}) {
  const out = {};
  for (const [key, color] of Object.entries({ ...STATIC_COLORS, ...overrides })) {
    out[key] = key === 'sectionCap' ? new MeshBasicMaterial({ color }) : new MeshLambertMaterial({ color });
    out[key].name = key;
  }
  out.stairTreadAlt.color.copy(out.stairTread.color).multiplyScalar(TREAD_ALT_TONE);
  // teren odsunięty w buforze głębi – krawędź podjazdu leżąca na poziomie terenu nie migocze
  out.terrain.polygonOffset = true;
  out.terrain.polygonOffsetFactor = 1;
  out.terrain.polygonOffsetUnits = 4;
  out.glass = new MeshLambertMaterial({ color: '#b9d3e2', transparent: true, opacity: 0.28, depthWrite: false, side: DoubleSide });
  out.glass.name = 'glass';
  return out;
}

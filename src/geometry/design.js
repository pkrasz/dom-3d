// Opcje bryły z design.json: decyzje aranżacyjne właściciela, które zmieniają BRYŁĘ względem projektu.
// house.json zostaje wierny projektowi; pusty obiekt design = dokładnie bryła z projektu.
// Tu są wartości domyślne każdej opcji (gdy design.json włącza opcję, ale nie podaje szczegółu) – same dane, bez Three.js.

const num = (v, fallback, min, max) => (Number.isFinite(v) && v >= min && v <= max ? v : fallback);
const color = (v, fallback) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);

/** założenie: kolory domyślne elementów opcji bryły (design.json może je zmienić). */
export const DESIGN_COLORS = {
  slat: '#1d1d1f', // czarne lamele przy schodach
  stairTread: '#b88a5c', // stopnice – ciepły dąb
  stairRiser: '#efe9de', // podstopnice i boki schodów – jasne
  beam: '#a87748', // belki widoczne pod otwartym sufitem – ciepłe drewno
};

/**
 * Lamele zamiast balustrady biegu dolnego (design.stairs.groundFloorBalustrade = 'slats') albo null.
 *   profile – bok kwadratowego profilu (m), gap – odstęp w świetle, do którego dobierana jest liczba lameli na stopień.
 */
export function slatOptions(design) {
  if (design?.stairs?.groundFloorBalustrade !== 'slats') return null;
  const o = design.stairs.slats || {};
  return {
    profile: num(o.profile, 0.04, 0.02, 0.1),
    gap: num(o.clearGap, 0.11, 0.05, 0.3),
    color: color(o.color, DESIGN_COLORS.slat),
  };
}

/**
 * Stopnie drewniane z jasnymi podstopnicami (design.stairs.treads) albo null.
 *   thickness – grubość stopnicy (m), nosing – wysunięcie noska przed podstopnicę (tylko biegi proste).
 */
export function treadOptions(design) {
  const o = design?.stairs?.treads;
  if (!o || typeof o !== 'object') return null;
  return {
    tread: color(o.tread, DESIGN_COLORS.stairTread),
    riser: color(o.riser, DESIGN_COLORS.stairRiser),
    thickness: num(o.thickness, 0.04, 0.02, 0.08),
    nosing: num(o.nosing, 0.02, 0, 0.04),
  };
}

/**
 * Belki widoczne w pomieszczeniach z sufitem otwartym do kalenicy (design.openCeiling) albo null, gdy opcja jest wyłączona.
 *   collar  – jętki w poprzek domu (wzdłuż y): spód nad posadzką, przekrój, rozstaw osi i położenie jednej osi (x),
 *   purlins – płatwie wzdłuż domu w osiach y; leżą pod jętkami (wierzch płatwi = spód jętek).
 */
export function beamOptions(design) {
  const oc = design?.openCeiling;
  if (!oc || !Array.isArray(oc.rooms) || !oc.rooms.length) return null;
  const b = oc.beams || {};
  if (b.enabled === false) return null;
  const c = b.collarTies || {};
  const p = b.purlins || {};
  return {
    color: color(b.color, DESIGN_COLORS.beam),
    collar: {
      underside: num(c.underside, 2.65, 2.0, 4.0),
      width: num(c.width, 0.12, 0.04, 0.3),
      height: num(c.height, 0.18, 0.04, 0.4),
      spacing: num(c.spacing, 0.9, 0.4, 3),
      anchorX: num(c.anchorX, 0, -100, 100),
    },
    purlins: {
      axesY: Array.isArray(p.axesY) ? p.axesY.filter((v) => Number.isFinite(v)) : [],
      width: num(p.width, 0.14, 0.04, 0.3),
      height: num(p.height, 0.16, 0.04, 0.4),
    },
  };
}

/** Kolory materiałów stałych wynikające z design.json (klucze jak w STATIC_COLORS w render/materials.js). */
export function designStaticColors(design) {
  const out = {};
  const slats = slatOptions(design);
  if (slats) out.slat = slats.color;
  const treads = treadOptions(design);
  if (treads) {
    out.stairTread = treads.tread;
    out.stairRiser = treads.riser;
  }
  const beams = beamOptions(design);
  if (beams) out.beam = beams.color;
  return out;
}

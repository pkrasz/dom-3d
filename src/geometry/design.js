// Opcje bryły z design.json: decyzje aranżacyjne właściciela, które zmieniają BRYŁĘ względem projektu.
// house.json zostaje wierny projektowi; pusty obiekt design = dokładnie bryła z projektu.
// Tu są wartości domyślne każdej opcji (gdy design.json włącza opcję, ale nie podaje szczegółu) – same dane, bez Three.js.
import { roofTopAt } from '../../tools/geometry.mjs';

const num = (v, fallback, min, max) => (Number.isFinite(v) && v >= min && v <= max ? v : fallback);
const color = (v, fallback) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);

/** założenie: kolory domyślne elementów opcji bryły (design.json może je zmienić). */
export const DESIGN_COLORS = {
  slat: '#1d1d1f', // czarne lamele przy schodach
  stairTread: '#b88a5c', // stopnice – ciepły dąb
  stairRiser: '#efe9de', // podstopnice i boki schodów – jasne
  beam: '#a87748', // belki widoczne pod otwartym sufitem – ciepłe drewno
  barnDoor: '#a9764a', // skrzydła drzwi przesuwnych – ciepłe drewno
  barnRail: '#1d1d1f', // szyna i wózki drzwi przesuwnych – czarne
};

/**
 * Lamele zamiast balustrad schodów (design.stairs.groundFloorBalustrade = 'slats') albo null.
 *   profile – bok kwadratowego profilu (m), gap – największy odstęp w świetle (do niego dobierana jest liczba lameli),
 *   continuous – lamele ciągłe przez obie kondygnacje (design.stairs.slats.continuous): do sufitu wyższej kondygnacji,
 *                także zamiast balustrad przy otworze klatki; false = tylko bieg dolny, do spodu stropu,
 *   atticHeight – dokąd sięgają lamele ciągłe na wyższej kondygnacji (design.stairs.slats.atticHeight):
 *                'ceiling' (domyślnie) – do sufitu; 'handrail' – ucięte na wysokości balustrady z projektu
 *                (stairVoid.balustradeHeight) i zakończone poręczą w kolorze lameli.
 */
export function slatOptions(design) {
  if (design?.stairs?.groundFloorBalustrade !== 'slats') return null;
  const o = design.stairs.slats || {};
  return {
    profile: num(o.profile, 0.04, 0.02, 0.1),
    gap: num(o.clearGap, 0.11, 0.05, 0.3),
    color: color(o.color, DESIGN_COLORS.slat),
    continuous: o.continuous === true,
    atticHeight: o.atticHeight === 'handrail' ? 'handrail' : 'ceiling',
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

/**
 * Drzwi wewnętrzne zamienione na przesuwne „barn” (design.doors.sliding) albo null.
 *   doors     – [{ id, levelId, side (id pomieszczenia, po którego stronie ściany wisi skrzydło), slide ('+x' | '-x' | '+y' | '-y'),
 *                 travel (droga odsunięcia w m albo null = pełna: skrzydło całkiem odsłania otwór) }],
 *   overlap   – o ile skrzydło zachodzi na ścianę z każdej strony otworu, thickness – grubość skrzydła,
 *   wallGap   – odstęp skrzydła od lica ściany, open – w jakiej części drogi skrzydło jest narysowane (0 = zamknięte, 1 = odsunięte).
 */
export function slidingDoorOptions(design) {
  const o = design?.doors;
  const list = Array.isArray(o?.sliding) ? o.sliding : [];
  const doors = list
    .filter((d) => d && typeof d.id === 'string' && typeof d.level === 'string' && typeof d.side === 'string' && /^[+-][xy]$/.test(d.slide || ''))
    .map((d) => ({ id: d.id, levelId: d.level, side: d.side, slide: d.slide, travel: Number.isFinite(d.travel) && d.travel > 0 ? d.travel : null }));
  if (!doors.length) return null;
  const l = o.leaf || {};
  return {
    doors,
    overlap: num(l.overlap, 0.05, 0, 0.2),
    thickness: num(l.thickness, 0.04, 0.03, 0.08),
    wallGap: num(l.wallGap, 0.035, 0.01, 0.1),
    open: num(l.open, 0.6, 0, 1),
    color: color(l.color, DESIGN_COLORS.barnDoor),
    railColor: color(l.railColor, DESIGN_COLORS.barnRail),
  };
}

const r6 = (v) => Math.round(v * 1e6) / 1e6;

/**
 * Dodatkowe okna połaciowe (design.extraRoofWindows.windows) w tym samym zapisie co roofWindows w house.json:
 * { id, slope, x, plan, width, length, zBottom, zTop, room, extra: true }.
 * Okno leży w połaci, dolną krawędzią nad licem ścianki kolankowej – na tej samej wysokości co okna z projektu
 * o tym samym wymiarze (rzut i rzędne przepisane z takiego okna; gdy go nie ma – policzone z kąta dachu).
 * Wpisy bez pomieszczenia, skosu albo położenia x są pomijane.
 */
export function extraRoofWindows(house, design) {
  const o = design?.extraRoofWindows;
  if (!o || !Array.isArray(o.windows) || !o.windows.length) return [];
  const level = house.levels.find((l) => l.ceiling?.slopes?.length);
  if (!level) return [];
  const width = num(o.width, 0.78, 0.4, 1.4);
  const length = num(o.length, 1.18, 0.5, 1.8);
  const same = (level.roofWindows || []).find((w) => Math.abs(w.width - width) < 1e-6 && Math.abs(w.length - length) < 1e-6);
  const planLen = same ? same.plan[3] - same.plan[1] : Math.round((length * Math.cos((house.roof.pitchDeg * Math.PI) / 180)) / 0.005) * 0.005;
  const taken = new Set((level.roofWindows || []).map((w) => w.id));
  const out = [];
  for (const w of o.windows) {
    const slope = level.ceiling.slopes.find((s) => s.id === w?.slope);
    const room = level.rooms.find((r) => r.id === w?.room);
    if (!slope || !room || typeof w.id !== 'string' || taken.has(w.id) || !Array.isArray(w.x) || !Number.isFinite(w.x[0])) continue;
    taken.add(w.id);
    const x0 = r6(w.x[0]);
    const x1 = r6(x0 + width);
    const face = slope.kneeWallFace;
    const north = slope.side === '+y';
    const far = r6(face + (north ? -planLen : planLen));
    const plan = north ? [x0, far, x1, face] : [x0, face, x1, far];
    const z = (y) => Math.round(roofTopAt(house.roof, y) * 100) / 100;
    out.push({
      id: w.id, slope: slope.id, x: [x0, x1], plan, width, length,
      zBottom: same ? same.zBottom : z(face), zTop: same ? same.zTop : z(far),
      room: room.id, extra: true,
    });
  }
  return out;
}

/**
 * house.json uzupełniony o opcje bryły, które dokładają elementy tego samego rodzaju co projekt (dziś: okna połaciowe).
 * Oryginał nie jest zmieniany; bez takich opcji zwracany jest ten sam obiekt.
 */
export function withDesign(house, design) {
  const extra = extraRoofWindows(house, design);
  if (!extra.length) return house;
  const upper = house.levels.find((l) => l.ceiling?.slopes?.length);
  return { ...house, levels: house.levels.map((l) => (l === upper ? { ...l, roofWindows: [...(l.roofWindows || []), ...extra] } : l)) };
}

/** Osie krokwi wg rozstawu przepisanego z projektu więźby (design.extraRoofWindows.rafters) – do kontroli położenia okien. */
export function rafterAxes(design) {
  const r = design?.extraRoofWindows?.rafters;
  if (!r || !Number.isFinite(r.firstAxis) || !Array.isArray(r.spacing)) return [];
  const out = [r.firstAxis];
  for (const s of r.spacing) out.push(r6(out[out.length - 1] + s));
  return out;
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
  const doors = slidingDoorOptions(design);
  if (doors) {
    out.barnDoor = doors.color;
    out.barnRail = doors.railColor;
  }
  return out;
}

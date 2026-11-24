// Drzwi przesuwne „barn” (opcja bryły, design.json → doors.sliding): zamiast skrzydła rozwiernego i ościeżnicy
// otwór z gładkimi ościeżami, skrzydło z desek z poprzeczką i ukośnymi zastrzałami na czarnej szynie nad otworem.
// slidingDoorLayout() to same dane (testy, kolizje mebli); emitSlidingDoor() rysuje jedno skrzydło z szyną.
import { isVertical } from '../../tools/geometry.mjs';
import { pointInPolygon } from './plan.js';
import { slidingDoorOptions } from './design.js';
import { DOOR_LEAF_GAP } from './constants.js';

/** założenie: skrzydło zakrywa otwór także od góry o 4 cm; szyna 4 × 1 cm, oś 6 cm nad skrzydłem. */
const LEAF_TOP_COVER = 0.04;
const RAIL_HEIGHT = 0.04;
const RAIL_THICKNESS = 0.01;
const RAIL_ABOVE_LEAF = 0.06;
/** założenie: poprzeczki skrzydła 10 cm, wypukłe 1 cm; zastrzały cieńsze (0,6 cm), żeby lica się nie pokrywały. */
const BOARD = 0.1;
const BOARD_RELIEF = 0.01;
const BRACE_RELIEF = 0.006;
const BRACE_HEIGHT = 0.13; // wysokość zastrzału mierzona w pionie
/** założenie: wokół toru skrzydła zostaje 5 cm wolnego miejsca (strefa bez mebli). */
const KEEP_CLEAR = 0.05;

const r6 = (v) => Math.round(v * 1e6) / 1e6;

/**
 * Drzwi przesuwne z design.json rozpisane na liczby (układ domu, metry). Dla każdych:
 *   id, levelId, opening, wall, roomId (pomieszczenie, w którym wisi skrzydło),
 *   axis ('x' | 'y' – wzdłuż której osi biegnie ściana), sign (±1: po której stronie ściany jest skrzydło), face (lico ściany),
 *   dir (±1: kierunek odsuwania wzdłuż osi), leafWidth, travel (droga), clearWidth (światło przejścia po odsunięciu),
 *   closed / open / drawn – zakres skrzydła wzdłuż ściany: zamknięte, odsunięte, narysowane,
 *   track – cały tor (zamknięte ∪ odsunięte), p0..p1 – skrzydło w poprzek ściany (od strony ściany, na zewnątrz),
 *   z0..z1 – skrzydło w pionie (rzędne), railZ – oś szyny,
 *   leafRect – rzut narysowanego skrzydła, trackRect – rzut toru,
 *   keepClear – prostokąt [x0, y0, x1, y1], który musi zostać wolny od mebli (tor + 5 cm z każdej strony).
 * Wpis, którego nie da się zbudować (nie ma takich drzwi, zły kierunek, pomieszczenie nie leży przy ścianie), jest pomijany.
 */
export function slidingDoorLayout(house, design = {}) {
  const opt = slidingDoorOptions(design);
  if (!opt) return [];
  const out = [];
  for (const d of opt.doors) {
    const level = house.levels.find((l) => l.id === d.levelId);
    const o = level?.openings.find((x) => x.id === d.id && x.kind === 'door');
    const wall = o && level.walls.find((w) => w.id === o.wall);
    const room = level?.rooms.find((r) => r.id === d.side);
    if (!wall || !room || out.some((x) => x.id === d.id && x.levelId === d.levelId)) continue;
    const axis = isVertical(wall.rect) ? 'y' : 'x';
    if (d.slide[1] !== axis) continue; // skrzydło jeździ wzdłuż ściany
    const [w0, w1] = axis === 'x' ? [wall.rect[1], wall.rect[3]] : [wall.rect[0], wall.rect[2]];
    const mid = (o.at[0] + o.at[1]) / 2;
    const inRoom = (c) => pointInPolygon(...(axis === 'x' ? [mid, c] : [c, mid]), room.polygon);
    const sign = inRoom(w1 + 0.01) ? 1 : inRoom(w0 - 0.01) ? -1 : 0;
    if (!sign) continue;
    const face = sign > 0 ? w1 : w0;
    const dir = d.slide[0] === '+' ? 1 : -1;
    const width = o.at[1] - o.at[0];
    const full = width + opt.overlap; // po takiej drodze krawędź skrzydła stoi równo z krawędzią otworu
    const travel = Math.min(d.travel ?? full, full);
    const closed = [o.at[0] - opt.overlap, o.at[1] + opt.overlap];
    const shift = (t) => [r6(closed[0] + dir * t), r6(closed[1] + dir * t)];
    const open = shift(travel);
    const drawn = shift(travel * opt.open);
    const track = [r6(Math.min(closed[0], open[0])), r6(Math.max(closed[1], open[1]))];
    const p0 = r6(face + sign * opt.wallGap);
    const p1 = r6(p0 + sign * opt.thickness);
    const rect = ([a0, a1], pa, pb) => {
      const [lo, hi] = [r6(Math.min(pa, pb)), r6(Math.max(pa, pb))];
      return axis === 'x' ? [r6(a0), lo, r6(a1), hi] : [lo, r6(a0), hi, r6(a1)];
    };
    const z0 = level.floorLevel + o.sill + DOOR_LEAF_GAP;
    const z1 = level.floorLevel + o.sill + o.height + LEAF_TOP_COVER;
    out.push({
      id: o.id, levelId: level.id, opening: o, wall, roomId: room.id, axis, sign, face, dir,
      leafWidth: r6(width + 2 * opt.overlap), thickness: opt.thickness, travel: r6(travel), clearWidth: r6(width - (full - travel)),
      closed: closed.map(r6), open, drawn, track, p0, p1, z0, z1, railZ: z1 + RAIL_ABOVE_LEAF,
      leafRect: rect(drawn, p0, p1),
      trackRect: rect(track, face, p1),
      keepClear: rect([track[0] - KEEP_CLEAR, track[1] + KEEP_CLEAR], face, p1 + sign * KEEP_CLEAR),
    });
  }
  return out;
}

/** Drzwi przesuwne jednej kondygnacji jako Map id otworu → opis z slidingDoorLayout(). */
export function slidingDoorsOf(house, design, levelId) {
  return new Map(slidingDoorLayout(house, design).filter((d) => d.levelId === levelId).map((d) => [d.id, d]));
}

/**
 * Rysuje skrzydło (w położeniu `drawn`) z szyną i wózkami.
 *   leaf, rail – wspólne siatki (MeshBuilder) drewna i czarnych okuć,
 *   solid(builder, axis, a0, a1, p0, p1, z0, z1) – bryła z ciemnym przekrojem w widoku z góry (jak reszta stolarki).
 */
export function emitSlidingDoor(door, { leaf, rail, solid }) {
  const { axis, sign, face, drawn: [l0, l1], track, p0, p1, z0, z1, railZ } = door;
  const pt = (a, p, z) => (axis === 'x' ? [a, p, z] : [p, a, z]);
  const box = (b, a0, a1, pa, pb, za, zb) => {
    const [lo, hi] = [Math.min(pa, pb), Math.max(pa, pb)];
    if (axis === 'x') b.box(a0, lo, za, a1, hi, zb);
    else b.box(lo, a0, za, hi, a1, zb);
  };

  // płyta przylegająca tyłem do innej bryły: lico i cztery krawędzie, bez niewidocznego tyłu
  const plate = (b, loop, back, front) => b.hexa([...loop.map(([a, z]) => pt(a, back, z)), ...loop.map(([a, z]) => pt(a, front, z))], ['bottom']);
  const rectLoop = (a0, a1, za, zb) => [[a0, za], [a1, za], [a1, zb], [a0, zb]];

  // --- skrzydło: płyta z desek; od strony pomieszczenia trzy poprzeczki i dwa ukośne zastrzały (od strony ściany gładkie)
  solid(leaf, axis, l0, l1, p0, p1 - sign * BOARD_RELIEF, z0, z1);
  const core = p1 - sign * BOARD_RELIEF;
  const zm = (z0 + z1) / 2;
  for (const [za, zb] of [[z0, z0 + BOARD], [zm - BOARD / 2, zm + BOARD / 2], [z1 - BOARD, z1]]) plate(leaf, rectLoop(l0, l1, za, zb), core, p1);
  // zastrzały cieńsze od poprzeczek: w dolnym polu z lewego dolnego narożnika w górę, w górnym odwrotnie (układ „K”)
  const brace = core + sign * BRACE_RELIEF;
  for (const [a0, za, a1, zb] of [
    [l0, z0 + BOARD, l1, zm - BOARD / 2 - BRACE_HEIGHT],
    [l1, zm + BOARD / 2, l0, z1 - BOARD - BRACE_HEIGHT],
  ]) plate(leaf, [[a0, za], [a1, zb], [a1, zb + BRACE_HEIGHT], [a0, za + BRACE_HEIGHT]], core, brace);

  // --- szyna na dwóch dystansach nad całym torem
  const pc = (p0 + p1) / 2;
  const r0 = pc - RAIL_THICKNESS / 2;
  const r1 = pc + RAIL_THICKNESS / 2;
  box(rail, track[0], track[1], r0, r1, railZ - RAIL_HEIGHT / 2, railZ + RAIL_HEIGHT / 2);
  const wallSide = sign > 0 ? r0 : r1;
  for (const a of [track[0] + 0.06, track[1] - 0.06]) plate(rail, rectLoop(a - 0.015, a + 0.015, railZ - 0.012, railZ + 0.012), face, wallSide);

  // --- wózki: płaskownik na licu skrzydła i rolka na szynie
  const strap = p1 + sign * 0.004;
  const wheel = p1 + sign * 0.008;
  for (const a of [l0 + 0.16, l1 - 0.16]) {
    plate(rail, rectLoop(a - 0.02, a + 0.02, z1 - 0.18, railZ + 0.03), p1, strap);
    box(rail, a - 0.045, a + 0.045, sign > 0 ? r0 - 0.004 : r1 + 0.004, wheel, railZ - 0.045, railZ + 0.045);
  }
}

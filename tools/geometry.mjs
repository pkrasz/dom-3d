// Wspólne obliczenia na house.json – używane przez podgląd 2D i przez kontrolę (check.mjs).
// Wszystko w metrach, układ jak w house.json (y w górę arkusza).

export const INS = (house) => house.construction.exteriorInsulation.thickness;

export const isVertical = (rect) => rect[2] - rect[0] < rect[3] - rect[1];

export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function bbox(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export const rectArea = (r) => (r[2] - r[0]) * (r[3] - r[1]);

/** Powierzchnia podłogi pomieszczenia: wielobok minus kominy stojące w pomieszczeniu. */
export function roomArea(level, room) {
  const chimneys = (level.chimneys || []).filter((c) => c.room === room.id);
  return polygonArea(room.polygon) - chimneys.reduce((s, c) => s + rectArea(c.rect), 0);
}

/** Prostokąt otworu w rzucie (na całą grubość ściany). */
export function openingRect(level, o) {
  const wall = level.walls.find((w) => w.id === o.wall);
  if (!wall) throw new Error(`Otwór ${o.id}: nie ma ściany ${o.wall}`);
  const [x0, y0, x1, y1] = wall.rect;
  return isVertical(wall.rect) ? [x0, o.at[0], x1, o.at[1]] : [o.at[0], y0, o.at[1], y1];
}

export function buildingExtent(level) {
  const ext = level.walls.filter((w) => w.type === 'ext');
  return [
    Math.min(...ext.map((w) => w.rect[0])),
    Math.min(...ext.map((w) => w.rect[1])),
    Math.max(...ext.map((w) => w.rect[2])),
    Math.max(...ext.map((w) => w.rect[3])),
  ];
}

const uniqSorted = (arr) => [...new Set(arr.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
const overlaps = (a, b) => a[0] < b[2] + 1e-6 && b[0] < a[2] + 1e-6 && a[1] < b[3] + 1e-6 && b[1] < a[3] + 1e-6;
// część wspólna o niezerowej powierzchni (samo stykanie się krawędzią nie liczy się)
const overlapsArea = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 1e-6 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 1e-6;

/**
 * Łańcuchy wymiarowe jednej strony budynku, liczone z geometrii tak, jak rysuje je projekt:
 *  - "openings": otwory i słupy w ścianach zewnętrznych tej strony,
 *  - "structure": ściany i podciągi dochodzące prostopadle do tej strony.
 * Zwraca punkty podziału (m) wzdłuż strony, razem z licem ocieplenia na obu końcach.
 * side: 'bottom' | 'top' | 'left' | 'right'
 */
export function sideChains(house, level, side) {
  const ins = INS(house);
  const [bx0, by0, bx1, by1] = buildingExtent(level);
  const horizontalSide = side === 'bottom' || side === 'top';
  const lo = horizontalSide ? bx0 : by0;
  const hi = horizontalSide ? bx1 : by1;
  const ax = horizontalSide ? 0 : 1; // oś, wzdłuż której biegnie łańcuch
  const midX = (bx0 + bx1) / 2;
  const midY = (by0 + by1) / 2;

  const onSide = (rect) => {
    const cx = (rect[0] + rect[2]) / 2;
    const cy = (rect[1] + rect[3]) / 2;
    if (side === 'bottom') return cy < midY;
    if (side === 'top') return cy > midY;
    if (side === 'left') return cx < midX;
    return cx > midX;
  };

  // ściany zewnętrzne równoległe do strony
  const extreme = side === 'bottom' ? by0 : side === 'top' ? by1 : side === 'left' ? bx0 : bx1;
  // odległość ściany od skrajnej linii tej strony – ściana cofnięta (wnęka) liczy się do 1 m
  const setback = (w) =>
    side === 'bottom' ? w.rect[1] - extreme
    : side === 'top' ? extreme - w.rect[3]
    : side === 'left' ? w.rect[0] - extreme
    : extreme - w.rect[2];
  const sideWalls = level.walls.filter(
    (w) => w.type === 'ext' && isVertical(w.rect) !== horizontalSide && onSide(w.rect) && setback(w) < 1.0
  );
  const wallAtExtreme = (w) =>
    side === 'bottom' ? Math.abs(w.rect[1] - extreme) < 1e-6
    : side === 'top' ? Math.abs(w.rect[3] - extreme) < 1e-6
    : side === 'left' ? Math.abs(w.rect[0] - extreme) < 1e-6
    : Math.abs(w.rect[2] - extreme) < 1e-6;

  const a = [lo - ins, lo, hi, hi + ins];
  for (const w of sideWalls) {
    if (!wallAtExtreme(w)) a.push(w.rect[ax], w.rect[ax + 2]); // ściana cofnięta (wnęka wejściowa)
    for (const o of level.openings.filter((o) => o.wall === w.id)) a.push(o.at[0], o.at[1]);
    for (const c of level.columns || []) if (overlapsArea(c.rect, w.rect)) a.push(c.rect[ax], c.rect[ax + 2]);
  }

  // elementy prostopadłe dochodzące do tej strony
  const band =
    side === 'bottom' ? [bx0, by0, bx1, by0 + 1.0]
    : side === 'top' ? [bx0, by1 - 0.25, bx1, by1]
    : side === 'left' ? [bx0, by0, bx0 + 0.25, by1]
    : [bx1 - 0.25, by0, bx1, by1];
  const b = [lo - ins, lo, hi, hi + ins];
  const perpendicular = [
    ...level.walls.filter((w) => isVertical(w.rect) === horizontalSide),
    ...(level.beams || []).filter((w) => isVertical(w.rect) === horizontalSide),
  ];
  for (const w of perpendicular) if (overlaps(w.rect, band)) b.push(w.rect[ax], w.rect[ax + 2]);

  const openingCount = level.openings.filter((o) => sideWalls.some((w) => w.id === o.wall)).length;
  return { openings: uniqSorted(a), structure: uniqSorted(b), total: [lo - ins, hi + ins], openingCount };
}

/** Długości odcinków łańcucha w cm (zaokrąglone). */
export const chainCm = (points) => points.slice(1).map((p, i) => Math.round((p - points[i]) * 100));

/**
 * Wysokość pomieszczenia (m nad posadzką kondygnacji) w punkcie o współrzędnej y.
 * Parter: stała. Poddasze: sufit płaski ograniczony skosami od ścianek kolankowych.
 */
export function ceilingHeightAt(level, y) {
  let h = level.ceilingHeight;
  for (const s of level.ceiling?.slopes || []) {
    const u = Math.abs(y - s.kneeWallFace);
    h = Math.min(h, s.heightAtWall + s.risePerMeter * u);
  }
  return h;
}

/** Wierzch połaci dachu (rzędna, m) nad punktem o współrzędnej y. */
export const roofTopAt = (roof, y) => roof.ridge.top - Math.abs(y - roof.ridge.y) * roof.slope;

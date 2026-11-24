// Ustawianie mebli w rzucie – czysta geometria 2D (bez Three.js, bez DOM), układ domu, metry.
//
// Mebel w rzucie to prostokąt obrócony: środek (x, y), szerokość w, głębokość d, obrót rot w stopniach
// (przeciwnie do ruchu wskazówek zegara, patrząc z góry). Przy rot = 0 FRONT mebla patrzy w stronę -y (dół arkusza),
// a TYŁ w stronę +y. Ściany to prostokąty osiowe [x0, y0, x1, y1] (w domu nie ma ścian skośnych).

/** Odległość, z której krawędź mebla "doskakuje" do lica ściany. */
export const SNAP_DISTANCE = 0.15;
/** Zetknięcie i nakładanie do 0,5 mm nie jest kolizją (mebel dosunięty do ściany jej nie "przecina"). */
export const EPS = 5e-4;
/** Największe przesunięcie narożnika w jednym kroku symulacji – dużo mniej niż najcieńsza ścianka (12 cm). */
const STEP = 0.04;
/** Najwięcej kroków w jednym moveItem (200 m drogi) – dalszy cel jest skracany, krok NIGDY nie rośnie ponad STEP. */
const MAX_STEPS = 5000;

const RAD = Math.PI / 180;
/** Współrzędne zapisujemy z dokładnością 0,1 mm (dużo poniżej EPS – zaokrąglenie nie robi kolizji). */
export const round4 = (v) => Math.round(v * 1e4) / 1e4;
export const normalizeRot = (deg) => {
  const r = ((deg % 360) + 360) % 360;
  return Math.abs(r - 360) < 1e-9 ? 0 : r;
};

/** @typedef {{x: number, y: number, rot: number, w: number, d: number}} Footprint */

const pick = (o) => ({ x: o.x, y: o.y, rot: o.rot || 0, w: o.w, d: o.d });

/** Narożniki rzutu mebla: [lewy-front, prawy-front, prawy-tył, lewy-tył]. */
export function corners(f) {
  const c = Math.cos((f.rot || 0) * RAD);
  const s = Math.sin((f.rot || 0) * RAD);
  const hw = f.w / 2;
  const hd = f.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => [f.x + lx * c - ly * s, f.y + lx * s + ly * c]);
}

/** Prostokąt osiowy opisany na rzucie mebla: [x0, y0, x1, y1]. */
export function aabb(f) {
  const c = Math.abs(Math.cos((f.rot || 0) * RAD));
  const s = Math.abs(Math.sin((f.rot || 0) * RAD));
  const hx = (c * f.w + s * f.d) / 2;
  const hy = (s * f.w + c * f.d) / 2;
  return [f.x - hx, f.y - hy, f.x + hx, f.y + hy];
}

/**
 * Nakładanie się mebla i prostokąta osiowego (twierdzenie o osi rozdzielającej, 4 osie).
 * Zwraca null, gdy się nie nakładają (albo tylko stykają), inaczej najkrótsze wypchnięcie mebla:
 * { depth, nx, ny } – przesunięcie o depth w kierunku (nx, ny) rozdziela oba kształty.
 */
export function penetration(f, rect) {
  const c = Math.cos((f.rot || 0) * RAD);
  const s = Math.sin((f.rot || 0) * RAD);
  const hw = f.w / 2;
  const hd = f.d / 2;
  const rhx = (rect[2] - rect[0]) / 2;
  const rhy = (rect[3] - rect[1]) / 2;
  const dx = f.x - (rect[0] + rect[2]) / 2;
  const dy = f.y - (rect[1] + rect[3]) / 2;
  let best = null;
  // osie: x, y domu (boki ściany) oraz dwie osie mebla
  for (const [ax, ay] of [[1, 0], [0, 1], [c, s], [-s, c]]) {
    const rf = hw * Math.abs(ax * c + ay * s) + hd * Math.abs(-ax * s + ay * c); // "promień" mebla wzdłuż osi
    const rr = rhx * Math.abs(ax) + rhy * Math.abs(ay);
    const dist = dx * ax + dy * ay;
    const overlap = rf + rr - Math.abs(dist);
    if (overlap <= EPS) return null;
    if (!best || overlap < best.depth) {
      const sign = dist >= 0 ? 1 : -1;
      best = { depth: overlap, nx: sign * ax + 0, ny: sign * ay + 0 }; // "+ 0" zamienia -0 na 0
    }
  }
  return best;
}

/** Czy mebel wchodzi w którąkolwiek ścianę. walls: tablica prostokątów albo obiektów { rect }. */
export function collides(f, walls) {
  for (const w of walls) if (penetration(f, w.rect || w)) return true;
  return false;
}

/**
 * Wypycha mebel ze ścian (kilka przebiegów, bo wypchnięcie z jednej może wepchnąć w drugą).
 * Działa poprawnie tylko dla PŁYTKICH wejść (kilka cm) – dlatego ruch dzielimy na małe kroki w moveItem.
 * Zwraca poprawiony rzut albo null, gdy mebel jest zakleszczony.
 */
export function pushOut(f, walls) {
  const out = pick(f);
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (const w of walls) {
      const p = penetration(out, w.rect || w);
      if (!p) continue;
      out.x += p.nx * p.depth;
      out.y += p.ny * p.depth;
      moved = true;
    }
    if (!moved) return out;
  }
  return collides(out, walls) ? null : out;
}

/**
 * Przeprowadza mebel ze stanu `from` (poprawnego) do stanu `to` – zmieniać się może położenie, obrót i wymiary.
 * Zmiana jest dzielona na kroki ≤ 4 cm; po każdym kroku mebel jest wypychany ze ścian, więc:
 *  – nie przeskoczy nawet cienkiej ścianki, jakkolwiek daleko jest `to`,
 *  – przy ruchu ukośnym w stronę ściany ślizga się wzdłuż niej (składowa równoległa zostaje),
 *  – obracany albo powiększany przy ścianie odsuwa się od niej.
 * Zwraca { x, y, rot, w, d, blocked } – blocked = true, gdy po drodze się zakleszczył (wynik to ostatni dobry stan).
 */
export function moveItem(from, to, walls) {
  const a = pick(from);
  let b = pick(to);
  const halfDiag = Math.hypot(Math.max(a.w, b.w), Math.max(a.d, b.d)) / 2;
  let travel = Math.hypot(b.x - a.x, b.y - a.y) + Math.abs(b.rot - a.rot) * RAD * halfDiag + (Math.abs(b.w - a.w) + Math.abs(b.d - a.d)) / 2;
  if (!Number.isFinite(travel)) return { ...a, blocked: true };
  if (travel > MAX_STEPS * STEP) {
    // cel absurdalnie daleko (np. palec pod horyzontem w orbicie): idziemy w jego stronę tylko MAX_STEPS kroków.
    // Samo ograniczenie liczby kroków wydłużałoby krok ponad grubość ścianek i mebel by przez nie przeskakiwał.
    const k = (MAX_STEPS * STEP) / travel;
    b = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, rot: a.rot + (b.rot - a.rot) * k, w: a.w + (b.w - a.w) * k, d: a.d + (b.d - a.d) * k };
    travel = MAX_STEPS * STEP;
  }
  const steps = Math.max(1, Math.min(MAX_STEPS, Math.ceil(travel / STEP)));
  let ox = 0; // suma dotychczasowych wypchnięć – ściana "zabiera" część ruchu
  let oy = 0;
  let last = { ...a, blocked: false };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cand = {
      x: a.x + (b.x - a.x) * t + ox,
      y: a.y + (b.y - a.y) * t + oy,
      rot: a.rot + (b.rot - a.rot) * t,
      w: a.w + (b.w - a.w) * t,
      d: a.d + (b.d - a.d) * t,
    };
    const ok = pushOut(cand, walls);
    if (!ok) return { ...last, blocked: true };
    ox += ok.x - cand.x;
    oy += ok.y - cand.y;
    last = { ...ok, blocked: false };
  }
  return last;
}

/**
 * Przyciąganie do ścian: jeśli krawędź (prostokąta opisanego) mebla jest bliżej niż `distance` od lica ściany
 * leżącej naprzeciw, mebel dosuwa się do lica. Osobno w osi x i y (narożnik pokoju łapie obie).
 * Wynik nigdy nie koliduje – jeśli dosunięcie wepchnęłoby mebel w inną ścianę, jest pomijane.
 */
export function snapToWalls(f, walls, distance = SNAP_DISTANCE) {
  const base = pick(f);
  const [x0, y0, x1, y1] = aabb(base);
  let sx = null; // najmniejsze co do modułu przesunięcie w osi
  let sy = null;
  const better = (cur, shift) => (cur === null || Math.abs(shift) < Math.abs(cur) ? shift : cur);
  for (const w of walls) {
    const r = w.rect || w;
    // ściana "naprzeciw" = jej zakres wzdłuż drugiej osi pokrywa się z meblem choć trochę
    if (Math.min(y1, r[3]) - Math.max(y0, r[1]) > 0.02) {
      const right = r[0] - x1; // odstęp do lica ściany po prawej
      const left = x0 - r[2];
      if (right > -EPS && right <= distance) sx = better(sx, Math.max(0, right));
      if (left > -EPS && left <= distance) sx = better(sx, -Math.max(0, left));
    }
    if (Math.min(x1, r[2]) - Math.max(x0, r[0]) > 0.02) {
      const top = r[1] - y1;
      const bottom = y0 - r[3];
      if (top > -EPS && top <= distance) sy = better(sy, Math.max(0, top));
      if (bottom > -EPS && bottom <= distance) sy = better(sy, -Math.max(0, bottom));
    }
  }
  const tries = [[sx || 0, sy || 0], [sx || 0, 0], [0, sy || 0]];
  for (const [dx, dy] of tries) {
    if (!dx && !dy) continue;
    const cand = { ...base, x: base.x + dx, y: base.y + dy };
    if (!collides(cand, walls)) return cand;
  }
  return base;
}

/** Czy odcinek p–q przecina wnętrze którejś ściany (do sprawdzania, że mebel nie "przeszedł" przez mur). */
export function segmentCrossesWalls(px, py, qx, qy, walls) {
  for (const w of walls) {
    const r = w.rect || w;
    // przycinanie odcinka do prostokąta (Liang–Barsky) – wnętrze pomniejszone o EPS
    let t0 = 0;
    let t1 = 1;
    const dx = qx - px;
    const dy = qy - py;
    let hit = true;
    for (const [p, q] of [[-dx, px - (r[0] + EPS)], [dx, r[2] - EPS - px], [-dy, py - (r[1] + EPS)], [dy, r[3] - EPS - py]]) {
      if (Math.abs(p) < 1e-12) {
        if (q < 0) { hit = false; break; }
      } else {
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
        if (t0 > t1) { hit = false; break; }
      }
    }
    if (hit) return true;
  }
  return false;
}

/**
 * "Tyłem do ściany": obraca mebel tyłem do najbliższego lica ściany (liczonego od środka mebla w 4 kierunkach)
 * i dosuwa go do tego lica. Zwraca nowy rzut albo null, gdy się nie da (brak ściany, brak miejsca).
 */
export function faceWall(f, walls) {
  const base = pick(f);
  let best = null; // { dist, rot, x, y }
  const consider = (dist, rot, x, y) => {
    if (dist >= 0 && (!best || dist < best.dist)) best = { dist, rot, x, y };
  };
  for (const w of walls) {
    const r = w.rect || w;
    if (base.x >= r[0] && base.x <= r[2]) {
      consider(r[1] - base.y, 0, base.x, r[1] - base.d / 2); // ściana nad meblem: tył w +y
      consider(base.y - r[3], 180, base.x, r[3] + base.d / 2); // ściana pod meblem
    }
    if (base.y >= r[1] && base.y <= r[3]) {
      consider(r[0] - base.x, 270, r[0] - base.d / 2, base.y); // ściana z prawej: tył w +x
      consider(base.x - r[2], 90, r[2] + base.d / 2, base.y); // ściana z lewej
    }
  }
  if (!best) return null;
  const placed = pushOut({ ...base, rot: best.rot, x: best.x, y: best.y }, walls); // np. odsunięcie od ściany bocznej
  if (!placed) return null;
  // wypchnięcie nie mogło przenieść mebla na drugą stronę żadnej ściany
  if (segmentCrossesWalls(base.x, base.y, placed.x, placed.y, walls)) return null;
  return placed;
}

/**
 * Czy mebel choć częściowo stoi w jakimś pomieszczeniu (środek, narożniki albo środki boków).
 * @param {(x: number, y: number) => ?string} roomAt  np. (x, y) => app.collision.pointInRoom(levelId, x, y)
 */
export function touchesRoom(f, roomAt) {
  if (roomAt(f.x, f.y)) return true;
  const cs = corners(f);
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = cs[i];
    const [bx, by] = cs[(i + 1) % 4];
    // punkty cofnięte o 2% w stronę środka – narożnik leżący dokładnie na licu ściany też się liczy
    const inset = (x, y) => roomAt(x + (f.x - x) * 0.02, y + (f.y - y) * 0.02);
    if (inset(ax, ay) || inset((ax + bx) / 2, (ay + by) / 2)) return true;
  }
  return false;
}

/**
 * Szuka najbliższego punktu (x, y), w którym mebel może stanąć: przegląda siatkę 10 cm po coraz większych
 * kwadratowych pierścieniach wokół punktu startowego.
 * @param {Footprint} f                 mebel z położeniem startowym
 * @param {(cand: Footprint) => boolean} isValid
 * @returns {?Footprint}
 */
export function findFreeSpot(f, isValid, maxRadius = 4, grid = 0.1) {
  const base = pick(f);
  if (isValid(base)) return base;
  const rings = Math.ceil(maxRadius / grid);
  for (let k = 1; k <= rings; k++) {
    let best = null;
    let bestD = Infinity;
    for (let i = -k; i <= k; i++) {
      for (let j = -k; j <= k; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== k) continue; // tylko obwód pierścienia
        const cand = { ...base, x: base.x + i * grid, y: base.y + j * grid };
        const dist = Math.hypot(i, j);
        if (dist < bestD && isValid(cand)) {
          best = cand;
          bestD = dist;
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** Obrys domu [x0, y0, x1, y1] = prostokąt opisany na ścianach kondygnacji (bez dostawionych "murów" granicznych). */
export function houseBounds(walls) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const w of walls) {
    if (w.kind === 'bounds') continue;
    const rect = w.rect || w;
    x0 = Math.min(x0, rect[0]);
    y0 = Math.min(y0, rect[1]);
    x1 = Math.max(x1, rect[2]);
    y1 = Math.max(y1, rect[3]);
  }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

/** Punkt przycięty do prostokąta powiększonego o margines. */
export function clampToRect(x, y, rect, margin = 0) {
  return {
    x: Math.min(rect[2] + margin, Math.max(rect[0] - margin, x)),
    y: Math.min(rect[3] + margin, Math.max(rect[1] - margin, y)),
  };
}

/** Różnica prostokątów osiowych a − b: lista prostokątów (0–4) pokrywających a poza b. */
export function subtractRect(a, b) {
  const ix0 = Math.max(a[0], b[0]);
  const iy0 = Math.max(a[1], b[1]);
  const ix1 = Math.min(a[2], b[2]);
  const iy1 = Math.min(a[3], b[3]);
  if (ix1 - ix0 <= EPS || iy1 - iy0 <= EPS) return [a.slice()];
  const out = [];
  if (iy0 - a[1] > EPS) out.push([a[0], a[1], a[2], iy0]); // pas pod b
  if (a[3] - iy1 > EPS) out.push([a[0], iy1, a[2], a[3]]); // pas nad b
  if (ix0 - a[0] > EPS) out.push([a[0], iy0, ix0, iy1]); // z lewej
  if (a[2] - ix1 > EPS) out.push([ix1, iy0, a[2], iy1]); // z prawej
  return out;
}

/**
 * Rzuty schodów, w których mebel nie może stanąć (kondygnacja, z której schody startują): biegi i zabieg
 * z house.json, z pominięciem otwartej przestrzeni POD schodami (stairs.underStairs.open) – tam mebel się mieści.
 * @param {{parts?: Array<{rect: number[]}>, underStairs?: {rect: number[], open?: boolean}}} stairs
 * @returns {Array<{rect: number[], kind: 'stairs', id: string}>}
 */
export function stairBlockers(stairs) {
  if (!stairs || !Array.isArray(stairs.parts)) return [];
  const free = stairs.underStairs && stairs.underStairs.open && Array.isArray(stairs.underStairs.rect) ? stairs.underStairs.rect : null;
  const out = [];
  stairs.parts.forEach((part, i) => {
    if (!Array.isArray(part.rect)) return;
    const rects = free ? subtractRect(part.rect, free) : [part.rect.slice()];
    rects.forEach((rect, j) => out.push({ rect, kind: 'stairs', id: `schody-${i}-${j}` }));
  });
  return out;
}

/**
 * Ściany kondygnacji uzupełnione o cztery "mury" dookoła obrysu domu – mebel nie wyjdzie poza dom,
 * nawet gdyby w ścianie zewnętrznej była przerwa.
 * @param {Array<{rect: number[]}>} walls   app.collision.walls(levelId)
 */
export function withHouseBounds(walls) {
  const bounds = houseBounds(walls);
  if (!bounds) return walls;
  const [x0, y0, x1, y1] = bounds;
  const far = 1000;
  return [
    ...walls,
    { rect: [x0 - far, y0 - far, x0, y1 + far], kind: 'bounds', id: 'poza-domem-W' },
    { rect: [x1, y0 - far, x1 + far, y1 + far], kind: 'bounds', id: 'poza-domem-E' },
    { rect: [x0 - far, y0 - far, x1 + far, y0], kind: 'bounds', id: 'poza-domem-S' },
    { rect: [x0 - far, y1, x1 + far, y1 + far], kind: 'bounds', id: 'poza-domem-N' },
  ];
}

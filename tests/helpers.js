// Wspólne narzędzia testów geometrii: wczytanie house.json, trójkąty siatek, pola, pokrycie punktu.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildHouse } from '../src/geometry/buildHouse.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const house = JSON.parse(readFileSync(join(root, 'house.json'), 'utf8'));

let built = null;
export function model() {
  if (!built) built = buildHouse(house);
  return built;
}

/** Trójkąty siatki: [{ a, b, c, n, uv: [ua, ub, uc] }] w układzie domu. */
export function trianglesOf(mesh) {
  const p = mesh.geometry.attributes.position.array;
  const n = mesh.geometry.attributes.normal.array;
  const uv = mesh.geometry.attributes.uv.array;
  const out = [];
  for (let i = 0, t = 0; i < p.length; i += 9, t += 1) {
    out.push({
      a: [p[i], p[i + 1], p[i + 2]],
      b: [p[i + 3], p[i + 4], p[i + 5]],
      c: [p[i + 6], p[i + 7], p[i + 8]],
      n: [n[i], n[i + 1], n[i + 2]],
      uv: [[uv[t * 6], uv[t * 6 + 1]], [uv[t * 6 + 2], uv[t * 6 + 3]], [uv[t * 6 + 4], uv[t * 6 + 5]]],
    });
  }
  return out;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const area3 = (t) => Math.hypot(...cross(sub(t.b, t.a), sub(t.c, t.a))) / 2;
/** Pole rzutu trójkąta na płaszczyznę xy. */
export const areaPlan = (t) => Math.abs((t.b[0] - t.a[0]) * (t.c[1] - t.a[1]) - (t.b[1] - t.a[1]) * (t.c[0] - t.a[0])) / 2;
export const areaUv = (t) => Math.abs((t.uv[1][0] - t.uv[0][0]) * (t.uv[2][1] - t.uv[0][1]) - (t.uv[1][1] - t.uv[0][1]) * (t.uv[2][0] - t.uv[0][0])) / 2;

/** Czy punkt 3D leży na trójkącie (z tolerancją odległości od płaszczyzny). */
export function triangleCovers(t, p, tol = 1e-3) {
  const n = cross(sub(t.b, t.a), sub(t.c, t.a));
  const len = Math.hypot(...n);
  if (len < 1e-12) return false;
  if (Math.abs(dot(n, sub(p, t.a)) / len) > tol) return false;
  const s = (u, v, w) => dot(cross(sub(v, u), sub(w, u)), n);
  const e = -1e-9;
  return s(t.a, t.b, p) >= e && s(t.b, t.c, p) >= e && s(t.c, t.a, p) >= e;
}

/** Czy punkt (x, y) leży w rzucie trójkąta. */
export function triangleCoversPlan(t, x, y) {
  const s = (u, v) => (v[0] - u[0]) * (y - u[1]) - (v[1] - u[1]) * (x - u[0]);
  const d1 = s(t.a, t.b);
  const d2 = s(t.b, t.c);
  const d3 = s(t.c, t.a);
  const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
  const pos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
  return !(neg && pos) && areaPlan(t) > 1e-9;
}

export const surfacesOf = (h, levelId, roomId, kind) =>
  [...h.surfaces.values()].filter((s) => s.levelId === levelId && s.roomId === roomId && (!kind || s.kind === kind));

/** Część wspólna prostokątów [x0, y0, x1, y1] albo null, gdy nie mają wspólnej powierzchni. */
export function rectIntersection(a, b) {
  const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[2] - r[0] > 1e-6 && r[3] - r[1] > 1e-6 ? r : null;
}

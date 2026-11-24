// Składanie geometrii z czworokątów i trójkątów w układzie domu (x, y, z w górę).
// Każda ściana (face) ma własne wierzchołki i płaską normalną – bez wygładzania krawędzi.
import { BufferGeometry, Float32BufferAttribute } from 'three';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export const triangleArea = (a, b, c) => len(cross(sub(b, a), sub(c, a))) / 2;

export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.area = 0; // suma pól trójkątów, m²
    this.triangles = 0;
  }

  get isEmpty() {
    return this.triangles === 0;
  }

  /**
   * Trójkąt. `normal` wskazuje stronę widoczną – kolejność wierzchołków jest do niej dopasowywana.
   * Trójkąty o zerowym polu są pomijane.
   */
  tri(a, b, c, normal, ua = [0, 0], ub = [0, 0], uc = [0, 0]) {
    const area = triangleArea(a, b, c);
    if (!(area > 1e-9)) return;
    const n = normalize(normal);
    const facing = dot(cross(sub(b, a), sub(c, a)), n);
    const order = facing >= 0 ? [[a, ua], [b, ub], [c, uc]] : [[a, ua], [c, uc], [b, ub]];
    for (const [p, uv] of order) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.uvs.push(uv[0], uv[1]);
    }
    this.area += area;
    this.triangles += 1;
  }

  /** Czworokąt: wierzchołki po obwodzie (dowolny kierunek), normalna = strona widoczna. */
  quad(a, b, c, d, normal, uvs = null) {
    const u = uvs || [[0, 0], [0, 0], [0, 0], [0, 0]];
    this.tri(a, b, c, normal, u[0], u[1], u[2]);
    this.tri(a, c, d, normal, u[0], u[2], u[3]);
  }

  /** Czworokąt z normalną policzoną z wierzchołków i skierowaną od punktu `awayFrom`. */
  quadAway(a, b, c, d, awayFrom) {
    let n = cross(sub(b, a), sub(c, a));
    if (len(n) < 1e-12) n = cross(sub(c, a), sub(d, a));
    if (len(n) < 1e-12) return;
    const center = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
    if (dot(n, sub(center, awayFrom)) < 0) n = [-n[0], -n[1], -n[2]];
    this.quad(a, b, c, d, n);
  }

  /**
   * Bryła o ośmiu narożnikach: p[0..3] = dolna podstawa po obwodzie, p[4..7] = górna (nad odpowiednimi dolnymi).
   * skip: lista pomijanych ścian: 'bottom', 'top', 's0'..'s3' (ściana boczna między narożnikami i, i+1).
   */
  hexa(p, skip = []) {
    const c = [0, 0, 0];
    for (const q of p) {
      c[0] += q[0] / 8;
      c[1] += q[1] / 8;
      c[2] += q[2] / 8;
    }
    if (!skip.includes('bottom')) this.quadAway(p[0], p[1], p[2], p[3], c);
    if (!skip.includes('top')) this.quadAway(p[4], p[5], p[6], p[7], c);
    for (let i = 0; i < 4; i++) {
      if (skip.includes(`s${i}`)) continue;
      const j = (i + 1) % 4;
      this.quadAway(p[i], p[j], p[j + 4], p[i + 4], c);
    }
  }

  /** Prostopadłościan równoległy do osi. */
  box(x0, y0, z0, x1, y1, z1, skip = []) {
    if (!(x1 - x0 > 1e-9 && y1 - y0 > 1e-9 && z1 - z0 > 1e-9)) return;
    this.hexa(
      [
        [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
        [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
      ],
      skip
    );
  }

  /** Graniastosłup o podstawie `poly` (2D, wypukłej) między z0 i z1. */
  prism(poly, z0, z1, skip = []) {
    const n = poly.length;
    const cx = poly.reduce((s, p) => s + p[0], 0) / n;
    const cy = poly.reduce((s, p) => s + p[1], 0) / n;
    const center = [cx, cy, (z0 + z1) / 2];
    for (let i = 1; i < n - 1; i++) {
      if (!skip.includes('top')) this.tri([...poly[0], z1], [...poly[i], z1], [...poly[i + 1], z1], [0, 0, 1]);
      if (!skip.includes('bottom')) this.tri([...poly[0], z0], [...poly[i], z0], [...poly[i + 1], z0], [0, 0, -1]);
    }
    if (skip.includes('sides')) return;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      this.quadAway([...a, z0], [...b, z0], [...b, z1], [...a, z1], center);
    }
  }

  /** Belka o przekroju prostokątnym (szer. w poziomie × wys. w pionie) między dwoma punktami osi. */
  bar(from, to, width, height) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const l = Math.hypot(dx, dy);
    // kierunek poprzeczny w poziomie; dla elementu pionowego – oś x
    const px = l > 1e-9 ? (-dy / l) * (width / 2) : width / 2;
    const py = l > 1e-9 ? (dx / l) * (width / 2) : 0;
    if (l < 1e-9) {
      // słupek pionowy: przekrój width × height w rzucie
      const z0 = Math.min(from[2], to[2]);
      const z1 = Math.max(from[2], to[2]);
      this.box(from[0] - width / 2, from[1] - height / 2, z0, from[0] + width / 2, from[1] + height / 2, z1);
      return;
    }
    const h = height / 2;
    this.hexa([
      [from[0] - px, from[1] - py, from[2] - h], [to[0] - px, to[1] - py, to[2] - h],
      [to[0] + px, to[1] + py, to[2] - h], [from[0] + px, from[1] + py, from[2] - h],
      [from[0] - px, from[1] - py, from[2] + h], [to[0] - px, to[1] - py, to[2] + h],
      [to[0] + px, to[1] + py, to[2] + h], [from[0] + px, from[1] + py, from[2] + h],
    ]);
  }

  build() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

// Cięcie siatki powierzchni na wysokości v = height (v z UV: wysokość nad posadzką na ścianach,
// długość po skosie na skosach). Czysta arytmetyka na tablicach – bez Three.js, testowalna w Node.
//
// Siatki rdzenia są nieindeksowane: każde 3 kolejne wierzchołki to trójkąt (position ×3, normal ×3, uv ×2).
// Wynik to nowa nieindeksowana siatka, w której trójkąty są ułożone tak, by dało się nadać dwie grupy materiałów:
//   materialIndex 0 – część poniżej cięcia ("lower"), materialIndex 1 – część powyżej ("upper").
//
// Rdzeń ukrywa końcówki niektórych ścian samym drawRange (pasy podciągów, część klatki ponad stropem – patrz
// src/geometry/interior.js, userData.headerStart / upperStart). Dlatego cięcie zachowuje kolejność takich
// odcinków: `boundaries` to numery wierzchołków, od których zaczynają się kolejne odcinki siatki źródłowej,
// a wynik podaje, od którego wierzchołka każdy odcinek zaczyna się w nowej siatce (boundaryMap).

const EPS = 1e-6;

/**
 * @param {{position: ArrayLike<number>, normal: ArrayLike<number>, uv: ArrayLike<number>}} source
 * @param {number} height   poziom cięcia (wartość v)
 * @param {number[]} [boundaries]  początki odcinków w siatce źródłowej (numery wierzchołków, wielokrotności 3)
 * @returns {{position: Float32Array, normal: Float32Array, uv: Float32Array,
 *            groups: Array<{start: number, count: number, materialIndex: 0|1}>,
 *            boundaryMap: Map<number, number>, sourceCount: number,
 *            lowerCount: number, upperCount: number, lowerArea: number, upperArea: number}}
 */
export function cutByV(source, height, boundaries = []) {
  const P = source.position;
  const N = source.normal;
  const T = source.uv;
  const sourceCount = Math.floor(P.length / 9) * 3;

  const cuts = [...new Set(boundaries.filter((b) => Number.isInteger(b) && b > 0 && b < sourceCount && b % 3 === 0))].sort((a, b) => a - b);
  const edges = [0, ...cuts, sourceCount];

  const position = [];
  const normal = [];
  const uv = [];
  const groups = [];
  const boundaryMap = new Map();
  const stats = { area: [0, 0], count: [0, 0] };

  const vertex = (i) => ({
    p: [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]],
    n: [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]],
    t: [T[i * 2], T[i * 2 + 1]],
    d: 0,
  });
  const mix = (a, b, f) => ({
    p: [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f, a.p[2] + (b.p[2] - a.p[2]) * f],
    n: a.n,
    t: [a.t[0] + (b.t[0] - a.t[0]) * f, height],
    d: 0,
  });
  const area = (a, b, c) => {
    const ux = b.p[0] - a.p[0], uy = b.p[1] - a.p[1], uz = b.p[2] - a.p[2];
    const vx = c.p[0] - a.p[0], vy = c.p[1] - a.p[1], vz = c.p[2] - a.p[2];
    return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  };

  /** Część wielokąta po jednej stronie cięcia: side = -1 (poniżej) albo +1 (powyżej). Kolejność wierzchołków zachowana. */
  const clip = (poly, side) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (a.d * side >= 0) out.push(a);
      if (a.d * b.d < 0) out.push(mix(a, b, a.d / (a.d - b.d)));
    }
    return out;
  };

  for (let s = 0; s < edges.length - 1; s++) {
    boundaryMap.set(edges[s], position.length / 3);
    const parts = [[], []]; // trójkąty odcinka: [poniżej, powyżej]
    for (let i = edges[s]; i < edges[s + 1]; i += 3) {
      const tri = [vertex(i), vertex(i + 1), vertex(i + 2)];
      for (const v of tri) {
        const d = v.t[1] - height;
        v.d = Math.abs(d) <= EPS ? 0 : d; // wierzchołek na linii cięcia należy do obu części
      }
      const below = tri.every((v) => v.d <= 0);
      const above = tri.every((v) => v.d >= 0);
      if (below) parts[0].push(tri);
      else if (above) parts[1].push(tri);
      else {
        for (const [k, side] of [[0, -1], [1, 1]]) {
          const poly = clip(tri, side);
          for (let j = 1; j < poly.length - 1; j++) parts[k].push([poly[0], poly[j], poly[j + 1]]);
        }
      }
    }
    for (const k of [0, 1]) {
      const start = position.length / 3;
      for (const [a, b, c] of parts[k]) {
        const ar = area(a, b, c);
        if (!(ar > 1e-12)) continue; // skrawki o zerowym polu
        for (const v of [a, b, c]) {
          position.push(v.p[0], v.p[1], v.p[2]);
          normal.push(v.n[0], v.n[1], v.n[2]);
          uv.push(v.t[0], v.t[1]);
        }
        stats.area[k] += ar;
        stats.count[k] += 3;
      }
      const count = position.length / 3 - start;
      if (count > 0) groups.push({ start, count, materialIndex: k });
    }
  }
  boundaryMap.set(sourceCount, position.length / 3);

  return {
    position: new Float32Array(position),
    normal: new Float32Array(normal),
    uv: new Float32Array(uv),
    groups,
    boundaryMap,
    sourceCount,
    lowerCount: stats.count[0],
    upperCount: stats.count[1],
    lowerArea: stats.area[0],
    upperArea: stats.area[1],
  };
}

/**
 * Przelicza "ile wierzchołków rysować" z siatki źródłowej na siatkę po cięciu.
 * Rdzeń podaje tylko granice odcinków (albo Infinity = wszystko); inne wartości → Infinity.
 */
export function mapDrawCount(boundaryMap, count) {
  if (!Number.isFinite(count)) return Infinity;
  return boundaryMap.has(count) ? boundaryMap.get(count) : Infinity;
}

// Kontrola house.json względem liczb przepisanych z projektu.
// Uruchom: node tools/check.mjs   (kod wyjścia 1, jeśli coś się nie zgadza)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sideChains, chainCm, roomArea, openingRect, isVertical, ceilingHeightAt, roofTopAt } from './geometry.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const house = JSON.parse(readFileSync(join(root, 'house.json'), 'utf8'));

// Łańcuchy wymiarowe dokładnie tak, jak są wpisane na rysunkach (cm).
// Poziome: od lewej do prawej; pionowe: od dołu do góry arkusza.
const EXPECTED = {
  parter: {
    source: 'rys. 1',
    bottom: { openings: [20, 50, 25, 380, 25, 50, 125, 150, 75, 248, 25, 200, 7, 20], structure: [20, 25, 480, 25, 350, 25, 430, 25, 20] },
    top: { openings: [20, 65, 90, 505, 180, 40, 25, 80, 270, 25, 80, 20], structure: [20, 25, 271, 12, 197, 25, 350, 25, 430, 25, 20] },
    left: { openings: [20, 215, 150, 123, 180, 342, 20], structure: [20, 25, 655, 25, 280, 25, 20] },
    right: { openings: [20, 7, 200, 25, 255, 25, 330, 25, 143, 20], structure: [20, 25, 960, 25, 20] },
    totals: { x: 1400, y: 1050 },
  },
  // Na rys. 2 w ściankach kolankowych nie ma otworów (łańcuch słupków C2 nie zamyka się: 1362 zamiast 1360),
  // dlatego u góry i u dołu sprawdzany jest tylko łańcuch pomieszczeń w świetle.
  poddasze: {
    source: 'rys. 2',
    bottom: { structure: [20, 25, 480, 25, 241, 12, 220, 12, 320, 25, 20] },
    top: { structure: [20, 25, 223, 12, 245, 25, 411, 12, 382, 25, 20] },
    left: { openings: [20, 215, 150, 123, 180, 342, 20], structure: [20, 25, 365, 12, 310, 12, 261, 25, 20] },
    right: { openings: [20, 235, 180, 180, 180, 235, 20], structure: [20, 25, 486, 12, 462, 25, 20] },
    totals: { x: 1400, y: 1050 },
  },
};

// Wymiary wewnętrzne z rys. 2: każda liczba z rysunku = różnica dwóch współrzędnych modelu.
// W(id) = prostokąt ściany [x0,y0,x1,y1]; O(id) = otwór [od, do] wzdłuż ściany; K(id) = prostokąt komina; C(id) = słupek.
const INTERIOR = {
  poddasze: ({ W, O, K, C, S }) => [
    // pion przez 1/3, schody, korytarz, 1/7:  293|12|100|100|128|12|315
    ['1/3 głębokość', W('Z-N')[1] - W('D-7')[3], 293],
    ['ścianka D-7', W('D-7')[3] - W('D-7')[1], 12],
    ['klatka: dwa biegi 100 + 100', S[3] - S[1], 200],
    ['korytarz przy schodach', S[1] - W('D-10')[3], 128],
    ['ścianka D-10', W('D-10')[3] - W('D-10')[1], 12],
    ['1/7 głębokość', W('D-10')[1] - W('Z-S')[3], 315],
    // pion przez hol zachodni, od dołu:  315|12|120|12|228|12
    ['1/8 głębokość przy ścianie nośnej', W('D-6')[1] - W('Z-S')[3], 315],
    ['ścianka D-6', W('D-6')[3] - W('D-6')[1], 12],
    ['hol zachodni', W('D-5')[1] - W('D-6')[3], 120],
    ['ścianka D-5', W('D-5')[3] - W('D-5')[1], 12],
    ['1/9 głębokość przy ścianie nośnej', W('D-2')[1] - W('D-5')[3], 228],
    ['ścianka D-2', W('D-2')[3] - W('D-2')[1], 12],
    // poziom przez schody i 1/4:  25|262|149|12|382|45
    ['ściana nośna N-1', W('N-1')[2] - W('N-1')[0], 25],
    ['otwór klatki długość', S[2] - S[0], 262],
    ['korytarz za schodami', W('D-8')[0] - S[2], 149],
    ['ścianka D-8', W('D-8')[2] - W('D-8')[0], 12],
    ['1/4 szerokość', W('Z-E')[0] - W('D-8')[2], 382],
    // przy drzwiach 1/10:  45|31|92|100|12|36
    ['drzwi 1/10 od ściany szczytowej', O('DP1')[0] - W('Z-W')[2], 31],
    ['drzwi 1/10', O('DP1')[1] - O('DP1')[0], 92],
    ['drzwi 1/10 do ścianki D-1', W('D-1')[0] - O('DP1')[1], 100],
    ['ścianka D-1', W('D-1')[2] - W('D-1')[0], 12],
    ['komin K-A szerokość', K('K-A')[2] - K('K-A')[0], 36],
    ['drzwi 1/11 od ściany nośnej (65)', W('N-1')[0] - O('DP2')[1], 65],
    // wnęki 1/8, 1/9:  45|300|12  i  82|12|50
    ['wnęka: ściana szczytowa – D-4', W('D-4')[0] - W('Z-W')[2], 300],
    ['ścianka D-4', W('D-4')[2] - W('D-4')[0], 12],
    ['wnęka 1/9 głębokość', W('D-4')[3] - W('D-3')[3], 82],
    ['ścianka D-3', W('D-3')[3] - W('D-3')[1], 12],
    ['wnęka 1/8 głębokość', W('D-3')[1] - W('D-4')[1], 50],
    // drzwi do 1/8 i 1/9:  300|18|92|70|25
    ['drzwi 1/8 od wnęki (18)', O('DP4')[0] - W('D-4')[0], 18],
    ['drzwi 1/8', O('DP4')[1] - O('DP4')[0], 92],
    ['drzwi 1/8 do ściany nośnej', W('N-1')[0] - O('DP4')[1], 70],
    ['drzwi 1/9 od wnęki (18)', O('DP3')[0] - W('D-4')[0], 18],
    ['drzwi 1/9 do ściany nośnej', W('N-1')[0] - O('DP3')[1], 70],
    // kominy:  64|100  i  68|91
    ['komin K-A od ścianki kolankowej', W('Z-N')[1] - K('K-A')[3], 64],
    ['komin K-A długość', K('K-A')[3] - K('K-A')[1], 100],
    ['komin K-B od ścianki D-7', K('K-B')[1] - W('D-7')[3], 91],
    ['komin K-B długość', K('K-B')[3] - K('K-B')[1], 68],
    // drzwi 1/3:  92|25|12
    ['drzwi 1/3', O('DP7')[1] - O('DP7')[0], 92],
    ['drzwi 1/3 do ścianki D-8', W('D-8')[0] - O('DP7')[1], 25],
    // wzdłuż ścianki D-8, od góry:  92|58|12|18|92|13|12|110|40|201
    ['drzwi 1/4', O('DP8')[1] - O('DP8')[0], 92],
    ['drzwi 1/4 do ścianki D-9', O('DP8')[0] - W('D-9')[3], 58],
    ['ścianka D-9', W('D-9')[3] - W('D-9')[1], 12],
    ['ścianka D-9 do drzwi 1/5', W('D-9')[1] - O('DP9')[1], 18],
    ['drzwi 1/5', O('DP9')[1] - O('DP9')[0], 92],
    ['drzwi 1/5 do obudowy komina', O('DP9')[0] - W('D-11b')[3], 13],
    ['obudowa komina D-11b', W('D-11b')[3] - W('D-11b')[1], 12],
    ['obudowa komina – ścianka D-13', W('D-11b')[1] - W('D-13')[3], 110],
    ['słupek w D-14', C('C2-D14')[3] - C('C2-D14')[1], 40],
    ['słupek D-14 do ścianki kolankowej', C('C2-D14')[1] - W('Z-S')[3], 201],
    ['słupek w D-8: 200 od ścianki kolankowej', W('Z-N')[1] - C('C2-D8')[3], 200],
    ['słupek w D-8', C('C2-D8')[3] - C('C2-D8')[1], 30],
    // drzwi 1/6:  12|9|92|9|48|12   i drzwi 1/7:  91|92
    ['drzwi 1/6 od ścianki D-12', O('DP6')[0] - W('D-12')[2], 9],
    ['drzwi 1/6', O('DP6')[1] - O('DP6')[0], 92],
    ['drzwi 1/6 do obudowy komina', W('D-11a')[0] - O('DP6')[1], 9],
    ['obudowa komina do ścianki D-8', W('D-8')[0] - W('D-11a')[0], 48],
    ['drzwi 1/7 od ściany nośnej', O('DP5')[0] - W('N-1')[2], 91],
    ['drzwi 1/7', O('DP5')[1] - O('DP5')[0], 92],
    // pralnia:  86|12  i  36
    ['komin K-C w pralni', W('D-10')[1] - K('K-C')[1], 86],
    ['komin K-C szerokość', K('K-C')[2] - K('K-C')[0], 36],
    // przejście w ścianie nośnej:  120
    ['przejście w N-1', O('PN1')[1] - O('PN1')[0], 120],
  ],
};

let failures = 0;
const ok = (cond, msg) => {
  if (!cond) failures++;
  console.log(`${cond ? '  ok  ' : ' BŁĄD '} ${msg}`);
};
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

for (const level of house.levels) {
  console.log(`\n== ${level.name} ==`);
  const exp = EXPECTED[level.id];

  if (exp) {
    for (const side of ['bottom', 'top', 'left', 'right']) {
      const ch = sideChains(house, level, side);
      for (const kind of ['openings', 'structure']) {
        if (!exp[side][kind]) continue;
        const got = chainCm(ch[kind]);
        ok(same(got, exp[side][kind]), `łańcuch ${side}/${kind} (${exp.source}): ${got.join('|')}${same(got, exp[side][kind]) ? '' : '  oczekiwano ' + exp[side][kind].join('|')}`);
      }
      const total = Math.round((ch.total[1] - ch.total[0]) * 100);
      const want = side === 'bottom' || side === 'top' ? exp.totals.x : exp.totals.y;
      ok(total === want, `wymiar całkowity ${side}: ${total} cm`);
    }
  }

  // ściany nie mogą się nakładać (podwójna objętość = migotanie w 3D)
  for (let i = 0; i < level.walls.length; i++)
    for (let j = i + 1; j < level.walls.length; j++) {
      const a = level.walls[i].rect, b = level.walls[j].rect;
      const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
      const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      if (w > 1e-6 && h > 1e-6) ok(false, `ściany ${level.walls[i].id} i ${level.walls[j].id} nakładają się (${(w * 100).toFixed(0)}×${(h * 100).toFixed(0)} cm)`);
    }
  ok(true, `ściany: ${level.walls.length}, brak innych nakładek niż wypisane wyżej`);

  // grubość ściany zgodna z typem
  for (const w of level.walls) {
    const t = Math.min(w.rect[2] - w.rect[0], w.rect[3] - w.rect[1]);
    const want = house.construction.wallTypes[w.type].thickness;
    if (Math.abs(t - want) > 1e-6) ok(false, `ściana ${w.id}: grubość ${t.toFixed(3)} ≠ ${want} (${w.type})`);
  }

  // otwory: szerokość = długość 'at', mieszczą się w ścianie (okno narożne może wychodzić w narożnik), pod sufitem
  for (const o of level.openings) {
    const wall = level.walls.find((w) => w.id === o.wall);
    if (!wall) { ok(false, `otwór ${o.id}: brak ściany ${o.wall}`); continue; }
    const len = o.at[1] - o.at[0];
    if (Math.abs(len - o.width) > 1e-6) ok(false, `otwór ${o.id}: 'at' daje ${len.toFixed(3)} m, a width = ${o.width}`);
    const ax = isVertical(wall.rect) ? 1 : 0;
    const inside = o.at[0] >= wall.rect[ax] - 1e-6 && o.at[1] <= wall.rect[ax + 2] + 1e-6;
    if (!inside && !o.corner) ok(false, `otwór ${o.id} wychodzi poza ścianę ${wall.id}`);
    // sufit nad otworem (na poddaszu uwzględnia skos): w najniższym punkcie wzdłuż ściany
    const ys = isVertical(wall.rect) ? o.at : [wall.rect[1], wall.rect[3]];
    const ceil = Math.min(...ys.map((y) => ceilingHeightAt(level, y)));
    if (o.sill + o.height > ceil + 1e-6) ok(false, `otwór ${o.id}: nadproże ${(o.sill + o.height).toFixed(2)} powyżej sufitu ${ceil.toFixed(2)}`);
    openingRect(level, o);
  }
  ok(true, `otwory: ${level.openings.length} sprawdzone (szerokość, położenie w ścianie, wysokość)`);

  // powierzchnie pomieszczeń względem tabeli projektu
  let sumModel = 0, sumProject = 0;
  for (const r of level.rooms) {
    const a = roomArea(level, r);
    sumModel += a; sumProject += r.areaProject;
    const diff = ((a - r.areaProject) / r.areaProject) * 100;
    const tolerated = Math.abs(diff) <= 1.0 || r.conf === 'zalozenie' || !!r.areaDiffAccepted;
    ok(tolerated, `${r.id} ${r.name}: model ${a.toFixed(2)} m², projekt ${r.areaProject.toFixed(2)} m² (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%)${Math.abs(diff) > 1 ? ' – ' + (r.areaDiffAccepted || r.note || '') : ''}`);
  }
  console.log(`       suma: model ${sumModel.toFixed(2)} m², projekt ${sumProject.toFixed(2)} m²`);

  // schody: liczba wysokości × wysokość stopnia ≈ wysokość kondygnacji
  if (level.stairs) {
    const s = level.stairs;
    const treads = s.parts.reduce((n, p) => n + p.treads, 0);
    ok(treads + 1 === s.risers, `schody: ${treads} stopnic + 1 = ${treads + 1} wysokości (projekt: ${s.risers})`);
    ok(Math.abs(s.risers * s.riser - s.rise) < 0.01, `schody: ${s.risers} × ${s.riser} = ${(s.risers * s.riser).toFixed(3)} m wobec kondygnacji ${s.rise} m`);
  }

  // wymiary wewnętrzne przepisane z rysunku
  if (INTERIOR[level.id]) {
    const find = (arr, id, what) => {
      const e = (arr || []).find((x) => x.id === id);
      if (!e) throw new Error(`${what} ${id}: brak w house.json`);
      return e;
    };
    const dims = INTERIOR[level.id]({
      W: (id) => find(level.walls, id, 'ściana').rect,
      O: (id) => find(level.openings, id, 'otwór').at,
      K: (id) => find(level.chimneys, id, 'komin').rect,
      C: (id) => find(level.columns, id, 'słupek').rect,
      S: level.stairVoid?.rect,
    });
    let bad = 0;
    for (const [name, got, want] of dims) {
      const g = Math.round(got * 100);
      if (g !== want) { bad++; ok(false, `wymiar „${name}”: model ${g} cm, rysunek ${want} cm`); }
    }
    ok(bad === 0, `wymiary wewnętrzne z ${exp.source}: ${dims.length - bad} z ${dims.length} zgodnych`);
  }

  // pomieszczenia, ściany i otwory nie mogą wchodzić na otwór klatki schodowej
  if (level.stairVoid) {
    const v = level.stairVoid.rect;
    const lower = house.levels.find((l) => l.stairs && l.stairs.to === level.id);
    const so = lower?.stairs.slabOpening.rect;
    const eq = (p, q) => p.every((n, i) => Math.abs(n - q[i]) < 1e-6);
    const slabStairs = lower.slabAbove.openings.find((o) => o.kind === 'stairs');
    ok(!!slabStairs && eq(slabStairs.rect, v), 'otwór klatki w płycie stropu = otwór na poddaszu');
    for (const o of lower.slabAbove.openings.filter((o) => o.kind === 'chimney')) {
      const c = lower.chimneys.find((c) => c.id === o.id);
      ok(!!c && eq(c.rect, o.rect), `przejście komina ${o.id} przez strop = obrys komina na parterze`);
    }
    ok(Math.abs(level.wallBase - (lower.ceilingHeight + lower.slabAbove.thickness)) < 1e-6, `ściany poddasza stoją na płycie: +${level.wallBase}`);
    ok(!!so && so.every((n, i) => Math.abs(n - v[i]) < 1e-6), `otwór klatki na poddaszu = otwór w stropie parteru (${v.join(' / ')})`);
    ok(Math.abs(lower.slabAbove.nextFloorLevel - level.floorLevel) < 1e-6 && Math.abs(lower.stairs.rise - level.floorLevel) < 1e-6, `posadzka ${level.floorLevel} = strop parteru + warstwy = wysokość schodów`);
  }

  // skosy: punkty kontrolne i wysokość okien dachowych
  if (level.ceiling) {
    for (const s of level.ceiling.slopes) {
      const dir = s.side === '+y' ? -1 : 1;
      for (const c of level.ceiling.checkpoints) {
        const h = ceilingHeightAt(level, s.kneeWallFace + dir * c.u);
        if (Math.abs(h - c.h) > 0.006) ok(false, `${s.id}: w odległości ${c.u} m wysokość ${h.toFixed(3)}, powinno być ${c.h}`);
      }
      const flat = s.kneeWallFace + dir * (level.ceilingHeight - s.heightAtWall) / s.risePerMeter;
      if (Math.abs(flat - s.flatFrom) > 0.002) ok(false, `${s.id}: flatFrom ${s.flatFrom}, z rachunku ${flat.toFixed(3)}`);
    }
    ok(true, `skosy: h = 1,425 + 0,70·u; 1,90 m w odległości 0,68 m; 2,20 m w 1,11 m; sufit płaski od 1,61 m`);
    for (const rw of level.roofWindows || []) {
      const s = level.ceiling.slopes.find((x) => x.id === rw.slope);
      const planLen = rw.plan[3] - rw.plan[1];
      const want = rw.length * Math.cos((house.roof.pitchDeg * Math.PI) / 180);
      if (Math.abs(planLen - want) > 0.01) ok(false, `okno dachowe ${rw.id}: rzut ${planLen.toFixed(3)} m, a 118 cm po skosie daje ${want.toFixed(3)}`);
      if (Math.abs(rw.x[1] - rw.x[0] - rw.width) > 1e-6) ok(false, `okno dachowe ${rw.id}: szerokość`);
      if (rw.x[0] !== rw.plan[0] || rw.x[1] !== rw.plan[2]) ok(false, `okno dachowe ${rw.id}: 'x' i 'plan' różnią się`);
      for (const [yy, z] of s.side === '+y' ? [[rw.plan[3], rw.zBottom], [rw.plan[1], rw.zTop]] : [[rw.plan[1], rw.zBottom], [rw.plan[3], rw.zTop]])
        if (Math.abs(roofTopAt(house.roof, yy) - z) > 0.01) ok(false, `okno dachowe ${rw.id}: rzędna ${z} nie leży w połaci (${roofTopAt(house.roof, yy).toFixed(3)})`);
      for (const w of level.walls.filter((w) => w.type !== 'ext')) {
        const ox = Math.min(rw.plan[2], w.rect[2]) - Math.max(rw.plan[0], w.rect[0]);
        const oy = Math.min(rw.plan[3], w.rect[3]) - Math.max(rw.plan[1], w.rect[1]);
        if (ox > 1e-6 && oy > 1e-6) ok(false, `okno dachowe ${rw.id} wypada nad ścianą ${w.id}`);
      }
      const touches = s.side === '+y' ? Math.abs(rw.plan[3] - s.kneeWallFace) < 1e-6 : Math.abs(rw.plan[1] - s.kneeWallFace) < 1e-6;
      if (!touches) ok(false, `okno dachowe ${rw.id}: dolna krawędź nie leży nad licem ścianki kolankowej`);
      const room = level.rooms.find((r) => r.id === rw.room);
      const xs = room.polygon.map((p) => p[0]);
      if (rw.x[0] < Math.min(...xs) - 1e-6 || rw.x[1] > Math.max(...xs) + 1e-6) ok(false, `okno dachowe ${rw.id} wychodzi poza pomieszczenie ${rw.room}`);
    }
    ok(true, `okna dachowe: ${(level.roofWindows || []).length} sprawdzone (78 × 118, rzut 96,5 cm, pomieszczenie)`);
  }
}

// dach
if (house.roof) {
  console.log('\n== Dach ==');
  const r = house.roof;
  ok(Math.abs(Math.tan((r.pitchDeg * Math.PI) / 180) - r.slope) < 5e-4, `nachylenie ${r.pitchDeg}° = ${r.slope}`);
  const eave = roofTopAt(r, r.planRect[1]);
  ok(Math.abs(eave - r.eaves.top) < 0.01, `wierzch połaci na okapie: ${eave.toFixed(2)} m (projekt +${r.eaves.top})`);
  ok(Math.abs(r.ridge.y - (r.planRect[1] + r.planRect[3]) / 2) < 1e-6, `kalenica w osi budynku (y = ${r.ridge.y})`);
  const top = house.levels.find((l) => l.id === 'poddasze');
  const ceilTop = top.floorLevel + top.ceilingHeight;
  ok(roofTopAt(r, top.ceiling.slopes[0].flatFrom) - r.packageVertical > ceilTop - 0.2, `sufit poddasza +${ceilTop.toFixed(2)} mieści się pod połacią`);
}

console.log(failures ? `\nNiezgodności: ${failures}` : '\nWszystko zgodne z projektem.');
process.exit(failures ? 1 : 0);

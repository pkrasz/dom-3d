// Podgląd 2D rzutów wygenerowany wyłącznie z house.json – do porównania z oryginalnym rysunkiem.
// Uruchom: node tools/preview2d.mjs   → preview/<kondygnacja>.html (jeden samodzielny plik na kondygnację)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sideChains, roomArea, openingRect, isVertical, bbox, INS, ceilingHeightAt } from './geometry.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const house = JSON.parse(readFileSync(join(root, 'house.json'), 'utf8'));
const outDir = join(root, 'preview');
mkdirSync(outDir, { recursive: true });

// Podkłady: wycinek oryginalnego rysunku PDF (punkty PDF) i przeliczenie na metry modelu.
// x_m = (x_pt - ox) / k ; y_m = (oy - y_pt) / k ; k = 28,3465 pt/m przy skali 1:100.
const UNDERLAYS = {
  parter: { file: 'rys1_podklad.png', clipPt: [250, 60, 860, 810], ox: 357.24, oy: 581.04, k: 28.3465, title: 'rys. 1 – rzut parteru' },
  poddasze: { file: 'rys2_podklad.png', clipPt: [250, 60, 860, 810], ox: 357.24, oy: 581.04, k: 28.3465, title: 'rys. 2 – rzut poddasza' },
};

const S = 100; // jednostka SVG = 1 cm
const X = (x) => +(x * S).toFixed(1);
const Y = (y) => +(-y * S).toFixed(1);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const cm = (m) => Math.round(m * 100);
const fmt = (n, d = 2) => n.toFixed(d).replace('.', ',');

const rectEl = (r, cls, extra = '') =>
  `<rect class="${cls}" x="${X(r[0])}" y="${Y(r[3])}" width="${X(r[2] - r[0])}" height="${X(r[3] - r[1])}" ${extra}/>`;
const lineEl = (x1, y1, x2, y2, cls) => `<line class="${cls}" x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}"/>`;
const textEl = (x, y, txt, cls, rot = 0) =>
  `<text class="${cls}" x="${X(x)}" y="${Y(y)}"${rot ? ` transform="rotate(${rot} ${X(x)} ${Y(y)})"` : ''}>${esc(txt)}</text>`;
const polyEl = (pts, cls) => `<polygon class="${cls}" points="${pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}"/>`;

// Położenie opisu pomieszczenia, gdy środek obrysu wypada na schodach lub ścianie (tylko wygląd podglądu).
const LABEL_AT = { '0/2': [7.82, 3.75], '0/7': [7.1, 6.3], '1/2': [8.64, 5.32], '1/3': [7.9, 7.8], '1/5': [11.75, 2.9], '1/6': [8.78, 2.08], '1/7': [6.5, 2.4], '1/8': [2.3, 2.1], '1/9': [2.3, 5.75], '1/11': [3.95, 8.3], '1/10': [1.36, 8.25] };
const ROOM_COLORS = ['#fde9c9', '#dcecd6', '#d6e6f5', '#f4dcdc', '#e8def3', '#f6f0c4', '#d9efec', '#eadfd2', '#e3e6ea'];

function renderLevel(level) {
  const ins = INS(house);
  const g = { ins: [], ext: [], rooms: [], walls: [], details: [], openings: [], stairs: [], labels: [], dims: [] };

  // ocieplenie: ściany zewnętrzne powiększone o grubość ocieplenia (część do wewnątrz zakrywają pomieszczenia i mury)
  for (const w of level.walls.filter((w) => w.type === 'ext'))
    g.ins.push(rectEl([w.rect[0] - ins, w.rect[1] - ins, w.rect[2] + ins, w.rect[3] + ins], 'ins'));

  // elementy zewnętrzne
  for (const e of level.exterior || []) {
    g.ext.push(rectEl(e.rect, 'ext'));
    if (e.steps) {
      g.ext.push(rectEl(e.steps.rect, 'ext'));
      const [sx0, sy0, sx1, sy1] = e.steps.rect;
      const n = e.steps.risers;
      for (let i = 1; i < n; i++) {
        const yy = sy0 + ((sy1 - sy0) * i) / n;
        g.ext.push(lineEl(sx0, yy, sx1, yy, 'thin'));
      }
      g.labels.push(textEl((sx0 + sx1) / 2, (sy0 + sy1) / 2 - 0.05, `${n}×${cm(e.steps.riser)}×${cm(e.steps.tread)}`, 't-small'));
    }
    const lvl = e.level !== undefined ? ` (${fmt(e.level)})` : '';
    g.labels.push(textEl((e.rect[0] + e.rect[2]) / 2, (e.rect[1] + e.rect[3]) / 2, e.label + lvl, 't-ext'));
  }

  // pomieszczenia
  level.rooms.forEach((r, i) => {
    g.rooms.push(polyEl(r.polygon, 'room').replace('class="room"', `class="room" fill="${ROOM_COLORS[i % ROOM_COLORS.length]}"`));
  });

  // ściany
  for (const w of level.walls) g.walls.push(rectEl(w.rect, `wall wall-${w.type}`, `data-id="${w.id}"`));

  // słupy, kominy, podciągi, przejścia
  for (const c of level.columns || []) g.details.push(rectEl(c.rect, 'column'));
  for (const c of level.chimneys || []) {
    g.details.push(rectEl(c.rect, 'chimney'));
    g.details.push(lineEl(c.rect[0], c.rect[1], c.rect[2], c.rect[3], 'chimney-x'), lineEl(c.rect[0], c.rect[3], c.rect[2], c.rect[1], 'chimney-x'));
  }
  for (const b of level.beams || []) {
    g.details.push(rectEl(b.rect, 'beam'));
    const v = isVertical(b.rect);
    g.labels.push(textEl(v ? b.rect[2] + 0.22 : (b.rect[0] + b.rect[2]) / 2, v ? (b.rect[1] + b.rect[3]) / 2 + 1.0 : b.rect[3] + 0.1, b.underside ? `podciąg, spód ${cm(b.underside)}` : b.id, 't-small', v ? -90 : 0));
  }
  for (const p of level.passages || []) {
    g.details.push(rectEl(p.rect, 'passage'));
    const v = isVertical(p.rect);
    const cx = (p.rect[0] + p.rect[2]) / 2, cy = (p.rect[1] + p.rect[3]) / 2;
    g.labels.push(textEl(v ? cx - 0.2 : cx, v ? cy : cy + 0.12, `${cm(p.width)}/${cm(p.height)}`, 't-open', v ? -90 : 0));
  }

  // otwory
  for (const o of level.openings) {
    const r = openingRect(level, o);
    const v = r[2] - r[0] < r[3] - r[1];
    g.openings.push(rectEl(r, 'gap'));
    const wall = level.walls.find((w) => w.id === o.wall);
    const mid = v ? (r[0] + r[2]) / 2 : (r[1] + r[3]) / 2;
    const isDoor = o.kind === 'door' || o.kind === 'entranceDoor';
    if (o.kind === 'passage') {
      // przejście bez drzwi: sam otwór, krawędzie nadproża linią przerywaną
      g.openings.push(rectEl(r, 'passage'));
      const c0 = (o.at[0] + o.at[1]) / 2;
      g.labels.push(v ? textEl(r[0] - 0.09, c0, `${cm(o.width)}/${cm(o.height)}`, 't-open', -90) : textEl(c0, r[3] + 0.09, `${cm(o.width)}/${cm(o.height)}`, 't-open'));
      continue;
    }
    if (!isDoor) {
      // okno / przeszklenie / brama: linie szyby
      const cls = o.kind === 'garageDoor' ? 'garage' : 'glass';
      const off = (v ? r[2] - r[0] : r[3] - r[1]) / 6;
      for (const d of [-off, off])
        g.openings.push(v ? lineEl(mid + d, r[1], mid + d, r[3], cls) : lineEl(r[0], mid + d, r[2], mid + d, cls));
      for (let i = 1; i < (o.panes || 1); i++) {
        const t = o.at[0] + ((o.at[1] - o.at[0]) * i) / o.panes;
        g.openings.push(v ? lineEl(r[0], t, r[2], t, cls) : lineEl(t, r[1], t, r[3], cls));
      }
    } else {
      // drzwi: skrzydło otwarte pod kątem 90° i łuk
      const leaf = o.leaf || o.width;
      const dir = o.hinge === o.at[0] ? 1 : -1;
      const hingeAt = o.hinge + dir * (o.hingeOffset || 0);
      const other = hingeAt + dir * leaf;
      const sign = o.swing[0] === '+' ? 1 : -1;
      let hx, hy, cx2, cy2, ex, ey;
      if (v) {
        hx = sign > 0 ? r[2] : r[0]; hy = hingeAt;
        cx2 = hx; cy2 = other; ex = hx + sign * leaf; ey = hy;
      } else {
        hy = sign > 0 ? r[3] : r[1]; hx = hingeAt;
        cy2 = hy; cx2 = other; ey = hy + sign * leaf; ex = hx;
      }
      g.openings.push(lineEl(hx, hy, ex, ey, 'leaf'));
      const a0 = Math.atan2(ey - hy, ex - hx), a1 = Math.atan2(cy2 - hy, cx2 - hx);
      let da = a1 - a0;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const a = a0 + (da * i) / 14;
        pts.push(`${X(hx + leaf * Math.cos(a))},${Y(hy + leaf * Math.sin(a))}`);
      }
      g.openings.push(`<polyline class="arc" points="${pts.join(' ')}"/>`);
      if (o.kind === 'entranceDoor' && o.leaf < o.width) {
        // stałe doświetle obok skrzydła
        const a = o.hinge === o.at[0] ? [other, o.at[1]] : [o.at[0], other];
        g.openings.push(v ? lineEl(mid, a[0], mid, a[1], 'glass') : lineEl(a[0], mid, a[1], mid, 'glass'));
      }
    }
    // opis otworu
    const c = (o.at[0] + o.at[1]) / 2;
    const txt = isDoor
      ? `${o.mark ? o.mark + ' ' : ''}${cm(o.width)}/${cm(o.height)}`
      : `${cm(o.width)}/${cm(o.height)}${o.sill ? ` hp ${cm(o.sill)}` : ''}${o.mark ? ' ' + o.mark : ''}`;
    // etykieta po wewnętrznej stronie ściany
    const [wx0, wy0, wx1, wy1] = wall.rect;
    const bx = (level.walls.reduce((m, w) => Math.max(m, w.rect[2]), 0)) / 2;
    const by = (level.walls.reduce((m, w) => Math.max(m, w.rect[3]), 0)) / 2;
    if (isDoor) {
      const sign = o.swing[0] === '+' ? -1 : 1; // po stronie przeciwnej do skrzydła
      if (v) g.labels.push(textEl((sign > 0 ? wx1 + 0.2 : wx0 - 0.09), c, txt, 't-open', -90));
      else g.labels.push(textEl(c, sign > 0 ? wy1 + 0.09 : wy0 - 0.22, txt, 't-open'));
    } else if (v) {
      const inside = (wx0 + wx1) / 2 < bx ? wx1 + 0.22 : wx0 - 0.1;
      g.labels.push(textEl(inside, c, txt, 't-open', -90));
    } else {
      const inside = (wy0 + wy1) / 2 < by ? wy1 + 0.1 : wy0 - 0.22;
      g.labels.push(textEl(c, inside, txt, 't-open'));
    }
  }

  // okno narożne: w poziomie cięcia nie ma muru – zostaje tylko słupek stolarki
  for (const c of level.cornerWindows || []) {
    g.openings.push(rectEl(c.cutout, 'gap'));
    const [cx0, cy0, cx1, cy1] = c.cutout;
    const d = c.frameDepth / 2;
    g.openings.push(lineEl(cx0, cy0 + d, cx1 - d, cy0 + d, 'glass'), lineEl(cx1 - d, cy0 + d, cx1 - d, cy1, 'glass'));
    g.openings.push(rectEl(c.post, 'post'));
  }

  // skosy: linie stałej wysokości (rzut), okna dachowe, wyłazy w suficie
  if (level.ceiling) {
    const [ix0, ix1] = [Math.min(...level.rooms.flatMap((r) => r.polygon.map((p) => p[0]))), Math.max(...level.rooms.flatMap((r) => r.polygon.map((p) => p[0])))];
    for (const s of level.ceiling.slopes) {
      const dir = s.side === '+y' ? -1 : 1;
      for (const h of [1.9, 2.2, level.ceiling.flatHeight]) {
        const yy = s.kneeWallFace + (dir * (h - s.heightAtWall)) / s.risePerMeter;
        const flat = h === level.ceiling.flatHeight;
        g.details.push(lineEl(ix0, yy, ix1, yy, flat ? 'slope flat' : 'slope'));
        g.labels.push(textEl(ix1 - 0.62, yy + (dir > 0 ? 0.06 : -0.2), flat ? `sufit ${cm(h)} →` : `h = ${cm(h)}`, 't-slope'));
      }
      g.labels.push(textEl(ix1 - 0.62, s.kneeWallFace + (dir > 0 ? 0.06 : -0.2), `h = ${fmt(s.heightAtWall * 100, 1)}`, 't-slope'));
    }
  }
  for (const rw of level.roofWindows || []) {
    g.details.push(rectEl(rw.plan, 'roofwin'));
    g.details.push(lineEl(rw.plan[0], rw.plan[1], rw.plan[2], rw.plan[3], 'roofwin-x'), lineEl(rw.plan[0], rw.plan[3], rw.plan[2], rw.plan[1], 'roofwin-x'));
    const below = rw.plan[1] < 5;
    g.labels.push(textEl((rw.plan[0] + rw.plan[2]) / 2, below ? rw.plan[3] + 0.08 : rw.plan[1] - 0.2, `${cm(rw.width)}/${cm(rw.length)}`, 't-open'));
  }
  for (const hch of level.ceilingHatches || []) {
    g.details.push(rectEl(hch.rect, 'hatch'));
    g.labels.push(textEl((hch.rect[0] + hch.rect[2]) / 2, (hch.rect[1] + hch.rect[3]) / 2 - 0.06, `${hch.id} ${cm(hch.depth)}×${cm(hch.width)}`, 't-small'));
  }

  // otwór klatki schodowej na wyższej kondygnacji: stopnie z kondygnacji niżej widoczne w otworze
  if (level.stairVoid) {
    const v = level.stairVoid.rect;
    const lower = house.levels.find((l) => l.stairs && l.stairs.to === level.id);
    g.stairs.push(rectEl(v, 'void'));
    for (const p of lower.stairs.parts) {
      const [x0, y0, x1, y1] = p.rect;
      if (p.kind === 'flight') {
        for (let i = 0; i <= p.treads; i++) {
          const xx = x0 + ((x1 - x0) * i) / p.treads;
          if (xx > v[0] + 1e-6 && xx < v[2] - 1e-6) g.stairs.push(lineEl(xx, y0, xx, y1, 'tread'));
        }
      } else for (const t of p.splitTo) g.stairs.push(lineEl(p.pivot[0], p.pivot[1], t[0], t[1], 'tread'));
    }
    const up = lower.stairs.parts[2];
    const my = (up.rect[1] + up.rect[3]) / 2;
    g.stairs.push(`<line class="arrow" x1="${X(up.rect[0] + 0.1)}" y1="${Y(my)}" x2="${X(up.rect[2] - 0.08)}" y2="${Y(my)}" marker-end="url(#arr)"/>`);
    for (const b of level.stairVoid.balustrades) g.stairs.push(lineEl(b.from[0], b.from[1], b.to[0], b.to[1], 'balustrade'));
    g.labels.push(textEl((v[0] + v[2]) / 2 + 0.2, v[3] - 0.45, `schody ${lower.stairs.risers}×${fmt(lower.stairs.riser * 100, 1)}×${cm(lower.stairs.tread)}`, 't-small'));
  }

  // schody
  if (level.stairs) {
    const s = level.stairs;
    for (const p of s.parts) {
      const [x0, y0, x1, y1] = p.rect;
      const upper = p.kind === 'flight' && p.levels[0] > 1.9; // bieg nad płaszczyzną cięcia rzutu
      const cls = upper ? 'tread dashed' : 'tread';
      g.stairs.push(rectEl(p.rect, upper ? 'stair-outline dashed' : 'stair-outline'));
      if (p.kind === 'flight') {
        for (let i = 1; i < p.treads; i++) {
          const xx = x0 + ((x1 - x0) * i) / p.treads;
          g.stairs.push(lineEl(xx, y0, xx, y1, cls));
        }
      } else {
        // zabieg: linie od narożnika duszy do narożników przy ścianie (kształt = założenie)
        for (const t of p.splitTo) g.stairs.push(lineEl(p.pivot[0], p.pivot[1], t[0], t[1], 'tread'));
      }
    }
    const f = s.parts[0];
    const my = (f.rect[1] + f.rect[3]) / 2;
    g.stairs.push(`<line class="arrow" x1="${X(f.rect[2] - 0.1)}" y1="${Y(my)}" x2="${X(f.rect[0] + 0.25)}" y2="${Y(my)}" marker-end="url(#arr)"/>`);
    const up = s.parts[2];
    g.labels.push(textEl((up.rect[0] + up.rect[2]) / 2, (up.rect[1] + up.rect[3]) / 2 - 0.05, `${s.risers}×${fmt(s.riser * 100, 1)}×${cm(s.tread)}`, 't-small'));
  }

  // opisy pomieszczeń
  for (const r of level.rooms) {
    const [x0, y0, x1, y1] = bbox(r.polygon);
    const a = roomArea(level, r);
    const rectangular = r.polygon.length === 4;
    let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (LABEL_AT[r.id]) [cx, cy] = LABEL_AT[r.id];
    const narrow = x1 - x0 < 2.2 || a < 9;
    const cls = narrow ? 't-room narrow' : 't-room';
    const lh = narrow ? 0.2 : 0.3;
    g.labels.push(textEl(cx, cy + lh, `${r.id} ${r.name}`, cls + ' bold'));
    g.labels.push(textEl(cx, cy, rectangular ? `${cm(x1 - x0)} × ${cm(y1 - y0)}` : `obrys ${cm(x1 - x0)} × ${cm(y1 - y0)}`, cls));
    g.labels.push(textEl(cx, cy - lh, `${fmt(a)} m²  (proj. ${fmt(r.areaProject)})`, cls));
  }

  // łańcuchy wymiarowe z geometrii
  const ext = level.walls.filter((w) => w.type === 'ext');
  const bx0 = Math.min(...ext.map((w) => w.rect[0])), bx1 = Math.max(...ext.map((w) => w.rect[2]));
  const by0 = Math.min(...ext.map((w) => w.rect[1])), by1 = Math.max(...ext.map((w) => w.rect[3]));
  const dimChain = (pts, side, offset) => {
    const horizontal = side === 'bottom' || side === 'top';
    const base = side === 'bottom' ? by0 - offset : side === 'top' ? by1 + offset : side === 'left' ? bx0 - offset : bx1 + offset;
    const t = 0.07;
    if (horizontal) g.dims.push(lineEl(pts[0], base, pts[pts.length - 1], base, 'dim'));
    else g.dims.push(lineEl(base, pts[0], base, pts[pts.length - 1], 'dim'));
    pts.forEach((p) => g.dims.push(horizontal ? lineEl(p - t, base - t, p + t, base + t, 'dim-tick') : lineEl(base - t, p - t, base + t, p + t, 'dim-tick')));
    pts.slice(1).forEach((p, i) => {
      const a = pts[i], len = cm(p - a), mid = (a + p) / 2;
      const small = len < 30;
      const shift = small ? (i % 2 ? 0.36 : 0.2) : 0.07;
      const label = len >= 1000 ? `${Math.floor(len / 1000)} ${String(len % 1000).padStart(3, '0')}` : String(len);
      g.dims.push(horizontal ? textEl(mid, base + shift, label, small ? 't-dim small' : 't-dim') : textEl(base - shift, mid, label, small ? 't-dim small' : 't-dim', -90));
    });
  };
  const hasExterior = (level.exterior || []).length > 0;
  const near = [0.9, 1.45, 2.0];
  const offs = hasExterior ? { bottom: [2.75, 3.3, 3.85], top: [4.65, 5.2, 5.75], left: near, right: near } : { bottom: near, top: near, left: near, right: near };
  for (const side of ['bottom', 'top', 'left', 'right']) {
    const ch = sideChains(house, level, side);
    // łańcuch otworów tylko tam, gdzie w ścianie są otwory (ścianki kolankowe ich nie mają)
    if (ch.openingCount) dimChain(ch.openings, side, offs[side][0]);
    dimChain(ch.structure, side, offs[side][1]);
    dimChain(ch.total, side, offs[side][2]);
  }

  // podkład z oryginalnego rysunku
  const u = UNDERLAYS[level.id];
  let underlay = '';
  if (u && existsSync(join(outDir, u.file))) {
    const [px0, py0, px1, py1] = u.clipPt;
    const mx0 = (px0 - u.ox) / u.k, mx1 = (px1 - u.ox) / u.k, myTop = (u.oy - py0) / u.k, myBot = (u.oy - py1) / u.k;
    const b64 = readFileSync(join(outDir, u.file)).toString('base64');
    underlay = `<image id="underlay" href="data:image/png;base64,${b64}" x="${X(mx0)}" y="${Y(myTop)}" width="${X(mx1 - mx0)}" height="${X(myTop - myBot)}" preserveAspectRatio="none" style="display:none"/>`;
  }

  const vb = hasExterior
    ? [X(bx0 - 2.6), Y(by1 + 6.2), X(bx1 - bx0 + 5.2), X(by1 - by0 + 10.5)]
    : [X(bx0 - 2.6), Y(by1 + 2.6), X(bx1 - bx0 + 5.2), X(by1 - by0 + 5.2)];
  const svg = `<svg id="plan" xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}">
<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="arrhead"/></marker></defs>
<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" class="paper"/>
${underlay}
<g id="model">
<g>${g.ins.join('')}</g><g>${g.ext.join('')}</g><g>${g.rooms.join('')}</g><g>${g.stairs.join('')}</g>
<g>${g.walls.join('')}</g><g>${g.details.join('')}</g><g>${g.openings.join('')}</g>
<g>${g.labels.join('')}</g><g>${g.dims.join('')}</g>
</g></svg>`;

  const kindPL = { window: 'okno', glazedDoor: 'przeszklenie do podłogi', entranceDoor: 'drzwi wejściowe', garageDoor: 'brama garażowa', door: 'drzwi wewnętrzne', frenchWindow: 'okno do podłogi z balustradą', passage: 'przejście bez drzwi' };
  const roomRows = level.rooms.map((r) => {
    const [x0, y0, x1, y1] = bbox(r.polygon);
    const a = roomArea(level, r);
    return `<tr><td>${r.id}</td><td>${esc(r.name)}</td><td>${r.polygon.length === 4 ? '' : 'obrys '}${cm(x1 - x0)} × ${cm(y1 - y0)}</td><td class="n">${fmt(a)}</td><td class="n">${fmt(r.areaProject)}</td><td>${esc(r.floorProject)}</td><td>${esc(r.conf)}</td></tr>`;
  }).join('');
  const openRows = level.openings.map((o) =>
    `<tr><td>${o.id}</td><td>${kindPL[o.kind]}${o.mark ? ' ' + o.mark : ''}</td><td>${esc(o.room || [...new Set(o.between)].join(' ↔ '))}</td><td class="n">${cm(o.width)}</td><td class="n">${cm(o.height)}</td><td class="n">${cm(o.sill)}</td><td>${esc(o.frame || '–')}</td><td>${esc(o.conf)}</td></tr>`).join('');
  const roofRows = (level.roofWindows || []).map((rw) =>
    `<tr><td>${rw.id}</td><td>okno dachowe</td><td>${esc(rw.room)}</td><td class="n">${cm(rw.width)}</td><td class="n">${cm(rw.length)}</td><td class="n">ok. 143</td><td>–</td><td>${esc(rw.conf)}</td></tr>`).join('');
  const others = house.levels.filter((l) => l.id !== level.id).map((l) => `<a href="${l.id}.html">${esc(l.name)}</a>`).join(' · ');
  const heights = level.ceiling
    ? `<li>Sufit płaski: ${fmt(level.ceiling.flatHeight)} m (od ${fmt(level.ceiling.slopes[0].flatFrom)} do ${fmt(level.ceiling.slopes[1].flatFrom)} m licząc od frontu).</li><li>Pod skosem: ${fmt(level.ceiling.slopes[0].heightAtWall, 3)} m przy ściance kolankowej, potem +${cm(level.ceiling.slopes[0].risePerMeter)} cm na każdy metr; 1,90 m w odległości 0,68 m, 2,20 m w odległości 1,11 m od ścianki.</li><li>Posadzka na +${fmt(level.floorLevel)} m. Okna szczytowe od podłogi do 2,31 m, drzwi 2,08 m.</li>${house.roof ? `<li>Dach: ${house.roof.pitchDeg}°, kalenica +${fmt(house.roof.ridge.top)} m, okap ${fmt(house.roof.overhang)} m poza mur.</li>` : ''}`
    : `<li>Wysokość pomieszczeń: ${fmt(level.ceilingHeight)} m (do spodu stropu, bez tynku).</li>`;
  void ceilingHeightAt;
  const assumptions = house.assumptions.map((a) => `<li>${esc(a.text)}</li>`).join('');

  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(level.name)} – podgląd 2D z house.json</title>
<style>
:root{--bg:#f4f5f7;--fg:#1c2330;--muted:#5b6575;--card:#fff;--line:#d9dde3;--accent:#0b63ce}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:14px 16px 6px}
h1{font-size:19px;margin:0 0 2px}
h2{font-size:16px;margin:22px 0 8px}
p.sub{margin:0;color:var(--muted);font-size:13.5px}
a{color:var(--accent)}
.bar{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;padding:10px 16px;background:var(--card);border-block:1px solid var(--line)}
.bar label{display:flex;align-items:center;gap:6px;font-size:14px}
.bar button{font:inherit;padding:5px 12px;border:1px solid var(--line);border-radius:7px;background:var(--card);color:var(--fg);min-width:38px}
.bar input[type=range]{width:120px}
.stage{overflow:auto;background:#fff;border-bottom:1px solid var(--line);touch-action:pan-x pan-y pinch-zoom}
#plan{display:block;width:100%;min-width:680px;height:auto}
main{padding:0 16px 40px;max-width:1100px}
.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;background:var(--card);font-size:14px}
th,td{padding:6px 9px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
th{font-weight:600;color:var(--muted);font-size:12.5px}
td.n{text-align:right;font-variant-numeric:tabular-nums}
ul{padding-left:20px;margin:6px 0}
li{margin:3px 0}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--muted);margin-top:10px}
.sw{display:inline-block;width:22px;height:10px;vertical-align:middle;margin-right:5px;border:1px solid #555}
/* rysunek */
.paper{fill:#fff}
.ins{fill:#f1e3a6}
.ext{fill:#eceef1;stroke:#8a929e;stroke-width:1.5}
.room{stroke:none}
.wall{fill:#222a35}
.wall-part{fill:#4a5361}
.column{fill:none;stroke:#fff;stroke-width:1.2}
.chimney{fill:#fff;stroke:#222a35;stroke-width:1.5}
.chimney-x{stroke:#222a35;stroke-width:1}
.beam{fill:none;stroke:#222a35;stroke-width:1.5;stroke-dasharray:9 6}
.passage{fill:none;stroke:#8a929e;stroke-width:1;stroke-dasharray:4 5}
.gap{fill:#fff}
.post{fill:#222a35}
.glass{stroke:#0b63ce;stroke-width:2}
.garage{stroke:#7a4b00;stroke-width:2;stroke-dasharray:10 5}
.leaf{stroke:#222a35;stroke-width:2.5}
.arc{fill:none;stroke:#222a35;stroke-width:1}
.thin{stroke:#8a929e;stroke-width:1}
.stair-outline{fill:none;stroke:#222a35;stroke-width:1}
.tread{stroke:#222a35;stroke-width:1}
.dashed{stroke-dasharray:6 5}
.slope{stroke:#b3541e;stroke-width:1;stroke-dasharray:3 6}
.slope.flat{stroke-width:1.6;stroke-dasharray:14 6}
.t-slope{font-size:13px;fill:#b3541e}
.roofwin{fill:#e6f1fb;fill-opacity:.7;stroke:#0b63ce;stroke-width:1.5;stroke-dasharray:7 4}
.roofwin-x{stroke:#0b63ce;stroke-width:.8}
.hatch{fill:none;stroke:#b3541e;stroke-width:1.3;stroke-dasharray:7 4}
.void{fill:#fff;stroke:#222a35;stroke-width:1}
.balustrade{stroke:#2e7d32;stroke-width:3}
.arrow{stroke:#222a35;stroke-width:1.5}
.arrhead{fill:#222a35}
.dim,.dim-tick{stroke:#1c2330;stroke-width:1.2}
text{font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;fill:#1c2330;text-anchor:middle}
.t-dim{font-size:19px}
.t-dim.small{font-size:15px}
.t-room{font-size:21px}
.t-room.narrow{font-size:14.5px}
.bold{font-weight:700}
.t-open{font-size:15px;fill:#0a4fa6}
.t-small{font-size:14px}
.t-ext{font-size:16px;fill:#5b6575}
body.compare #model{opacity:var(--model-op,.55)}
body.compare .wall{fill:#d1242f}
body.compare .room{fill-opacity:.25}
body.compare .paper{fill:none}
</style></head>
<body>
<header><h1>${esc(level.name)} – podgląd 2D wygenerowany z house.json</h1>
<p class="sub">Inne kondygnacje: ${others}</p>
<p class="sub">Wymiary w cm, bez tynków. Żółty pas = ocieplenie 20 cm (wymiar całkowity 1400 × 1050 je zawiera). Włącz podkład, żeby nałożyć oryginalny ${esc(u ? u.title : 'rysunek')}.</p></header>
<div class="bar">
<label><input type="checkbox" id="cbU"> Podkład z projektu</label>
<label>Model <input type="range" id="op" min="0" max="100" value="55"></label>
<span><button id="zo" aria-label="Pomniejsz">−</button> <button id="zi" aria-label="Powiększ">+</button> <button id="zr">Dopasuj</button></span>
</div>
<div class="stage" id="stage">${svg}</div>
<main>
<div class="legend"><span><span class="sw" style="background:#222a35"></span>ściana nośna 25 cm</span><span><span class="sw" style="background:#4a5361"></span>działowa 12 cm</span><span><span class="sw" style="background:#f1e3a6"></span>ocieplenie 20 cm</span><span><span class="sw" style="background:#fff;border-color:#0b63ce"></span>okno: szer./wys. hp = parapet</span><span>linia przerywana: podciąg, przejście, bieg schodów nad cięciem</span>${level.ceiling ? '<span><span class="sw" style="background:#fff;border-color:#b3541e;border-style:dashed"></span>linie wysokości pod skosem, okna dachowe, wyłaz</span>' : ''}</div>
<h2>Pomieszczenia</h2>
<div class="tw"><table><tr><th>Nr</th><th>Nazwa</th><th>Wymiary [cm]</th><th>Model [m²]</th><th>Projekt [m²]</th><th>Posadzka wg projektu</th><th>Pewność</th></tr>${roomRows}</table></div>
<h2>Okna i drzwi</h2>
<div class="tw"><table><tr><th>Id</th><th>Rodzaj</th><th>Pomieszczenie</th><th>Szer.</th><th>Wys.</th><th>Parapet</th><th>Stolarka</th><th>Pewność</th></tr>${openRows}${roofRows}</table></div>
<h2>Wysokości</h2>
<ul>${heights}${(level.beams || []).filter((b) => b.underside).map((b) => `<li>${esc(b.label)}: spód ${fmt(b.underside)} m.</li>`).join('')}${level.slabAbove ? `<li>Strop ${cm(level.slabAbove.thickness)} cm + warstwy ${cm(level.slabAbove.floorBuildUp)} cm; posadzka wyższej kondygnacji na +${fmt(level.slabAbove.nextFloorLevel)} m.</li>` : ''}</ul>
<h2>Założenia (nie wynikają wprost z projektu)</h2>
<ul>${assumptions}</ul>
</main>
<script>
const body=document.body,u=document.getElementById('underlay'),plan=document.getElementById('plan'),op=document.getElementById('op');
let z=1;
function setZ(v){z=Math.min(6,Math.max(1,v));plan.style.width=(z*100)+'%';}
document.getElementById('zi').onclick=()=>setZ(z*1.35);
document.getElementById('zo').onclick=()=>setZ(z/1.35);
document.getElementById('zr').onclick=()=>setZ(1);
document.getElementById('cbU').onchange=e=>{if(u)u.style.display=e.target.checked?'':'none';body.classList.toggle('compare',e.target.checked);};
op.oninput=()=>body.style.setProperty('--model-op',op.value/100);
</script>
</body></html>`;
}

for (const level of house.levels) {
  const file = join(outDir, `${level.id}.html`);
  writeFileSync(file, renderLevel(level));
  console.log('zapisano', file);
}

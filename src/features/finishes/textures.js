// Tekstury materiałów rysowane proceduralnie na <canvas> + pamięć podręczna z licznikami użycia.
//
// Zasada skali: UV powierzchni są w METRACH, więc tekstura obejmuje "komórkę" nx × ny elementów
// (cellW × cellH metrów), a texture.repeat = (1 / cellW, 1 / cellH). Rozstaw elementów jest przez to dokładny
// niezależnie od rozdzielczości canvasu; fuga bywa pogrubiona do minimum czytelnego (MIN_GROUT_PX).
//
// Części czyste (textureLayout, textureTransform) nie dotykają DOM – są testowane w Node.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { materialParams } from './finish.js';

export const MAX_TEXTURE_PX = 1024;
const DENSITY = 400; // docelowa rozdzielczość, px na metr
const MIN_GROUT_PX = 2;
const ANISOTROPY = 4;

// ---------------------------------------------------------------- układ komórki (czyste)

const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * Układ komórki tekstury dla materiału.
 * @param {{texture: {draw: string}}} def
 * @param {{size: [number, number], pattern: string, groutWidth: number}} params  (materialParams)
 * @param {number} [maxPx]
 * @returns {{draw: string, nx: number, ny: number, cellW: number, cellH: number, ex: number, ey: number,
 *            pxW: number, pxH: number, groutPx: number, n?: number}}
 *   nx × ny – liczba elementów w komórce; cellW × cellH – jej wymiar w metrach; ex × ey – element w pikselach;
 *   jodełka: n = długość deski w szerokościach, komórka to kwadrat 2n × 2n szerokości deski.
 */
export function textureLayout(def, params, maxPx = MAX_TEXTURE_PX) {
  const draw = def.texture.draw;
  const [w, h] = params.size;
  let nx = 1;
  let ny = 1;
  let ew = w; // rozmiar "elementu siatki" w metrach
  let eh = h;
  let n;

  if (draw === 'herringbone') {
    n = clampInt(h / w, 2, 10);
    nx = ny = 2 * n;
    eh = w; // siatka kwadratów o boku = szerokość deski
  } else if (draw === 'planks') {
    nx = clampInt(Math.ceil(1.2 / w - 1e-9), 4, 8);
    ny = h < 1 ? 2 : 1;
  } else if (draw === 'tiles') {
    nx = clampInt(Math.ceil(1.2 / w - 1e-9), 2, 8);
    ny = clampInt(Math.ceil(1.2 / h - 1e-9), 2, 8);
    if (params.pattern === 'brick' && ny % 2) ny += 1; // cegiełka powtarza się co 2 rzędy
  }

  const cellW = nx * ew;
  const cellH = ny * eh;
  const density = Math.min(draw === 'seamless' ? DENSITY / 2 : DENSITY, maxPx / cellW, maxPx / cellH);
  // Elementy mają całkowitą liczbę pikseli – linie fug wypadają równo, bez rozmycia.
  const ex = Math.max(2, Math.min(Math.floor(maxPx / nx), Math.round(ew * density)));
  const ey = Math.max(2, Math.min(Math.floor(maxPx / ny), Math.round(eh * density)));
  const groutM = params.groutWidth || 0;
  let groutPx = 0;
  if (groutM > 0) {
    const min = draw === 'tiles' ? MIN_GROUT_PX : 1;
    groutPx = Math.min(Math.max(min, Math.round(groutM * (ex / ew))), Math.max(1, Math.floor(Math.min(ex, ey) / 3)));
  }
  return { draw, nx, ny, cellW, cellH, ex, ey, pxW: nx * ex, pxH: ny * ey, groutPx, ...(n ? { n } : {}) };
}

/**
 * Przekształcenie UV (metry) → tekstura: powtórzenie i obrót.
 * Obrót 90° zamienia kierunki u i v; jodełka jest dodatkowo obrócona o 45°, żeby dawała klasyczny zygzak.
 * @returns {{repeat: [number, number], rotation: number}}
 */
export function textureTransform(layout, rot = 0) {
  return {
    repeat: [1 / layout.cellW, 1 / layout.cellH],
    rotation: (rot === 90 ? Math.PI / 2 : 0) + (layout.draw === 'herringbone' ? Math.PI / 4 : 0),
  };
}

// ---------------------------------------------------------------- pomocnicze rysowanie

/** Deterministyczny generator liczb losowych (ten sam materiał = zawsze ta sama tekstura). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const hexToRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
/** Kolor rozjaśniony / przyciemniony o `amount` (-1…1). */
function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => Math.round(Math.min(255, Math.max(0, amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
const rgba = (hex, alpha) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
};

/** Wypełnienie jednego elementu (płytki / deski) w prostokącie x, y, w, h – wszystko przycięte do prostokąta. */
function drawElement(ctx, def, rand, x, y, w, h, image) {
  if (w <= 0 || h <= 0) return;
  const look = def.texture.look;
  const base = def.colors[Math.floor(rand() * def.colors.length)] || '#bbbbbb';
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (look === 'image' && image) {
    ctx.drawImage(image, x, y, w, h);
    ctx.restore();
    return;
  }
  ctx.fillStyle = shade(base, (rand() - 0.5) * 0.05);
  ctx.fillRect(x, y, w, h);
  const scale = Math.max(w, h);

  if (look === 'clouds') {
    for (let i = 0; i < 9; i++) {
      const cx = x + rand() * w;
      const cy = y + rand() * h;
      const r = scale * (0.15 + rand() * 0.35);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const tone = rand() < 0.5 ? '#ffffff' : '#000000';
      g.addColorStop(0, rgba(tone, 0.05 + rand() * 0.05));
      g.addColorStop(1, rgba(tone, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
  } else if (look === 'veins') {
    ctx.lineCap = 'round';
    const count = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      let px = x + rand() * w;
      let py = y - 4;
      let dir = (rand() - 0.5) * 1.2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      while (py < y + h + 4) {
        dir += (rand() - 0.5) * 0.6;
        px += dir * scale * 0.05;
        py += scale * (0.03 + rand() * 0.05);
        ctx.lineTo(px, py);
      }
      ctx.strokeStyle = rgba('#6f747a', 0.1 + rand() * 0.16);
      ctx.lineWidth = 0.6 + rand() * 1.8;
      ctx.stroke();
    }
  } else if (look === 'speckle') {
    const chips = def.texture.chips || ['#888888', '#cccccc'];
    const count = Math.round((w * h) / 90);
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = rgba(chips[Math.floor(rand() * chips.length)], 0.55 + rand() * 0.4);
      const s = 1 + rand() * 3.2;
      ctx.fillRect(x + rand() * w, y + rand() * h, s, s * (0.6 + rand() * 0.8));
    }
  } else if (look === 'wood') {
    woodGrain(ctx, rand, x, y, w, h, h >= w);
  } else if (look === 'slate') {
    // poziome warstwy o różnej jasności
    const horizontal = w >= h;
    const bands = 6 + Math.floor(rand() * 6);
    for (let i = 0; i < bands; i++) {
      const tone = rand() < 0.5 ? '#ffffff' : '#000000';
      ctx.fillStyle = rgba(tone, 0.03 + rand() * 0.06);
      const t = rand();
      const s = 0.03 + rand() * 0.14;
      if (horizontal) ctx.fillRect(x, y + t * h, w, s * h);
      else ctx.fillRect(x + t * w, y, s * w, h);
    }
  } else {
    // 'plain': ledwie widoczne przetarcie, żeby powierzchnia nie była płaska jak farba
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.04)');
    g.addColorStop(1, 'rgba(0,0,0,0.04)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

/** Słoje wzdłuż dłuższego boku deski. */
function woodGrain(ctx, rand, x, y, w, h, vertical) {
  const across = vertical ? w : h;
  const along = vertical ? h : w;
  const lines = Math.max(3, Math.round(across / 5));
  for (let i = 0; i < lines; i++) {
    const o = rand() * across;
    const wobble = (rand() - 0.5) * across * 0.12;
    ctx.strokeStyle = `rgba(${rand() < 0.75 ? '40,24,10' : '255,240,215'},${0.05 + rand() * 0.1})`;
    ctx.lineWidth = 0.5 + rand() * 1.2;
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(x + o, y);
      ctx.bezierCurveTo(x + o + wobble, y + along * 0.33, x + o - wobble, y + along * 0.66, x + o, y + along);
    } else {
      ctx.moveTo(x, y + o);
      ctx.bezierCurveTo(x + along * 0.33, y + o + wobble, x + along * 0.66, y + o - wobble, x + along, y + o);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- rysowanie całej komórki

function drawTiles(ctx, def, params, L, seed, image) {
  ctx.fillStyle = L.groutPx > 0 ? params.groutColor : def.colors[0];
  ctx.fillRect(0, 0, L.pxW, L.pxH);
  const g0 = Math.floor(L.groutPx / 2);
  for (let j = 0; j < L.ny; j++) {
    const shift = params.pattern === 'brick' && j % 2 ? Math.round(L.ex / 2) : 0;
    // i = -1: element przesuniętego rzędu, który "zawija się" przez lewą krawędź komórki
    for (let i = shift ? -1 : 0; i < L.nx; i++) {
      const rand = rng(seed ^ hash(`${(i + L.nx) % L.nx}:${j}`));
      drawElement(ctx, def, rand, i * L.ex + shift + g0, j * L.ey + g0, L.ex - L.groutPx, L.ey - L.groutPx, image);
    }
  }
}

function drawPlanks(ctx, def, params, L, seed) {
  ctx.fillStyle = params.groutColor;
  ctx.fillRect(0, 0, L.pxW, L.pxH);
  const gap = L.groutPx;
  const offsets = rng(seed);
  for (let i = 0; i < L.nx; i++) {
    const shift = Math.round(offsets() * L.ey); // łączenia czołowe desek w losowych miejscach
    for (let k = 0; k < L.ny; k++) {
      // deska przechodząca przez krawędź komórki rysowana jest dwa razy (góra i dół) – tekstura powtarza się bez szwu
      for (const y of [k * L.ey + shift, k * L.ey + shift - L.pxH]) {
        if (y >= L.pxH || y + L.ey <= 0) continue;
        drawElement(ctx, def, rng(seed ^ hash(`${i}:${k}`)), i * L.ex, y, L.ex - gap, L.ey - gap, null);
      }
    }
  }
}

/**
 * Jodełka na siatce kwadratów o boku = szerokość deski (n = długość deski w kwadratach).
 * Kwadrat (x, y) należy do deski poziomej, gdy (x − y) mod 2n < n, inaczej do pionowej – wzór powtarza się co 2n.
 */
function drawHerringbone(ctx, def, params, L, seed) {
  const n = L.n;
  const m = 2 * n;
  const c = L.ex;
  const mod = (v) => ((v % m) + m) % m;
  for (let y = 0; y < m; y++) {
    for (let x = 0; x < m; x++) {
      const d = mod(x - y);
      const horizontal = d < n;
      const j = d - n; // pionowa: 0 = dolny koniec … n-1 = górny (w układzie canvasu)
      const id = horizontal ? `h:${y}:${mod(x - d)}` : `v:${x}:${mod(y - (n - 1 - j))}`;
      const rand = rng(seed ^ hash(id));
      const base = def.colors[Math.floor(rand() * def.colors.length)];
      const px = x * c;
      const py = y * c;
      ctx.fillStyle = shade(base, (rand() - 0.5) * 0.06);
      ctx.fillRect(px, py, c, c);
      // słoje: te same przesunięcia we wszystkich kwadratach deski → linie ciągną się przez całą deskę
      const lines = Math.max(2, Math.round(c / 6));
      for (let i = 0; i < lines; i++) {
        const o = Math.floor(rand() * c);
        ctx.fillStyle = `rgba(${rand() < 0.75 ? '40,24,10' : '255,240,215'},${0.05 + rand() * 0.08})`;
        if (horizontal) ctx.fillRect(px, py + o, c, 1);
        else ctx.fillRect(px + o, py, 1, c);
      }
      // szczeliny na obwodzie deski
      ctx.fillStyle = rgba(params.groutColor, 0.55);
      if (horizontal) {
        ctx.fillRect(px, py, c, 1);
        ctx.fillRect(px, py + c - 1, c, 1);
        if (d === 0) ctx.fillRect(px, py, 1, c);
        if (d === n - 1) ctx.fillRect(px + c - 1, py, 1, c);
      } else {
        ctx.fillRect(px, py, 1, c);
        ctx.fillRect(px + c - 1, py, 1, c);
        if (j === n - 1) ctx.fillRect(px, py, c, 1);
        if (j === 0) ctx.fillRect(px, py + c - 1, c, 1);
      }
    }
  }
}

function drawSeamless(ctx, def, L, seed) {
  const W = L.pxW;
  const H = L.pxH;
  const rand = rng(seed);
  ctx.fillStyle = def.colors[0];
  ctx.fillRect(0, 0, W, H);
  if (def.texture.look === 'carpet') {
    // włókno: szum na pojedynczych pikselach (powtarza się bez szwu z natury)
    const img = ctx.getImageData(0, 0, W, H);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const k = (rand() - 0.5) * 44;
      data[i] = Math.min(255, Math.max(0, data[i] + k));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + k));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + k));
    }
    ctx.putImageData(img, 0, 0);
    return;
  }
  // beton / mikrocement: miękkie plamy; każda rysowana także po drugiej stronie krawędzi → brak szwu
  for (let i = 0; i < 70; i++) {
    const cx = rand() * W;
    const cy = rand() * H;
    const r = W * (0.06 + rand() * 0.22);
    const tone = rand() < 0.5 ? '#ffffff' : '#000000';
    const alpha = 0.035 + rand() * 0.05;
    for (const dx of [-W, 0, W]) {
      for (const dy of [-H, 0, H]) {
        const x = cx + dx;
        const y = cy + dy;
        if (x + r < 0 || x - r > W || y + r < 0 || y - r > H) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(tone, alpha));
        g.addColorStop(1, rgba(tone, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
    }
  }
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(Math.floor(rand() * W), Math.floor(rand() * H), 1, 1);
  }
}

/** Rysuje komórkę materiału na kontekście 2D canvasu o rozmiarze layout.pxW × layout.pxH. */
export function drawMaterial(ctx, def, params, layout, image = null) {
  const seed = hash(def.id);
  if (layout.draw === 'tiles') drawTiles(ctx, def, params, layout, seed, image);
  else if (layout.draw === 'planks') drawPlanks(ctx, def, params, layout, seed);
  else if (layout.draw === 'herringbone') drawHerringbone(ctx, def, params, layout, seed);
  else drawSeamless(ctx, def, layout, seed);
}

/** Canvas z narysowanym materiałem albo null, gdy środowisko nie ma kontekstu 2D (np. testy w Node). */
export function renderCanvas(def, params, layout, image = null) {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = layout.pxW;
    canvas.height = layout.pxH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    drawMaterial(ctx, def, params, layout, image);
    return canvas;
  } catch (err) {
    console.warn('Nie udało się narysować tekstury materiału', def.id, err);
    return null;
  }
}

// ---------------------------------------------------------------- pamięć podręczna tekstur

/**
 * Tekstury współdzielone między powierzchniami. acquire() zwiększa licznik użycia, release() zmniejsza –
 * nieużywana tekstura jest zwalniana (dispose). Obrót 0° i 90° tego samego materiału dzielą jeden obraz (Source).
 * @param {{onImageReady?: (materialId: string) => void}} [options]  wołane, gdy zdjęcie materiału własnego się wczyta
 */
export function createTextureCache({ onImageReady } = {}) {
  const bases = new Map(); // klucz canvasu → { texture, refs }
  const entries = new Map(); // klucz tekstury → { texture, baseKey, refs }
  const images = new Map(); // dataUrl → { image, ready, failed }
  const swatches = new Map(); // id materiału → canvas miniatury

  function imageFor(def) {
    if (!def.custom) return { image: null, ready: true };
    let rec = images.get(def.dataUrl);
    if (!rec) {
      rec = { image: null, ready: false, failed: false };
      images.set(def.dataUrl, rec);
      if (typeof Image === 'function') {
        const img = new Image();
        img.onload = () => {
          rec.ready = true;
          onImageReady?.(def.id);
        };
        img.onerror = () => {
          rec.failed = true;
        };
        rec.image = img;
        img.src = def.dataUrl;
      }
    }
    return rec;
  }

  /**
   * @returns {{key: ?string, texture: ?import('three').Texture, color: string, pending: boolean}}
   *   texture = null → użyj samego koloru (brak canvasu albo zdjęcie jeszcze się wczytuje; pending = true)
   */
  function acquire(def, finish) {
    const params = materialParams(finish, def);
    const color = def.colors[0];
    const img = imageFor(def);
    if (!img.ready) return { key: null, texture: null, color, pending: !img.failed };

    const layout = textureLayout(def, params);
    const baseKey = [def.id, def.custom ? def.dataUrl.length : '', params.size.join('x'), params.pattern, params.groutColor, params.groutWidth].join('|');
    const key = `${baseKey}|r${params.rot}`;
    let entry = entries.get(key);
    if (!entry) {
      let base = bases.get(baseKey);
      if (!base) {
        const canvas = renderCanvas(def, params, layout, img.image);
        if (!canvas) return { key: null, texture: null, color, pending: false };
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.anisotropy = ANISOTROPY;
        base = { texture, refs: 0 };
        bases.set(baseKey, base);
      }
      const texture = base.texture.clone(); // ten sam obraz, własne powtórzenie i obrót
      const t = textureTransform(layout, params.rot);
      texture.repeat.set(t.repeat[0], t.repeat[1]);
      texture.center.set(0, 0);
      texture.rotation = t.rotation;
      texture.needsUpdate = true;
      texture.name = key;
      entry = { texture, baseKey, refs: 0 };
      entries.set(key, entry);
      base.refs += 1;
    }
    entry.refs += 1;
    return { key, texture: entry.texture, color: '#ffffff', pending: false };
  }

  function release(key) {
    const entry = key && entries.get(key);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    entry.texture.dispose();
    entries.delete(key);
    const base = bases.get(entry.baseKey);
    if (base && --base.refs <= 0) {
      base.texture.dispose();
      bases.delete(entry.baseKey);
    }
  }

  /** Miniatura materiału z biblioteki do panelu (mały canvas, tworzony raz). Null bez kontekstu 2D. */
  function swatch(def, px = 96) {
    if (def.custom) return null;
    if (!swatches.has(def.id)) {
      const params = materialParams({ rot: 0 }, def);
      swatches.set(def.id, renderCanvas(def, params, textureLayout(def, params, px)));
    }
    return swatches.get(def.id);
  }

  /** Zapomina zdjęcia materiałów, których już nie ma w wariancie. */
  function pruneImages(customMaterials = []) {
    const keep = new Set((Array.isArray(customMaterials) ? customMaterials : []).filter(Boolean).map((m) => m.dataUrl)); // wpis null w wariancie nie może wywrócić sync()
    for (const url of [...images.keys()]) if (!keep.has(url)) images.delete(url);
  }

  return {
    acquire,
    release,
    swatch,
    pruneImages,
    /** Liczba żywych tekstur (do testów i diagnostyki). */
    get size() {
      return entries.size;
    },
    dispose() {
      for (const e of entries.values()) e.texture.dispose();
      for (const b of bases.values()) b.texture.dispose();
      entries.clear();
      bases.clear();
      images.clear();
      swatches.clear();
    },
  };
}

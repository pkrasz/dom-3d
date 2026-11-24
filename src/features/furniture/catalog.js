// KATALOG MEBLI – same dane i opis brył, bez Three.js i bez DOM (testowalne w Node).
//
// Jak dodać nowy mebel: dopisz JEDEN wpis do tablicy CATALOG:
//   { id, name, category, size: { w, d, h }, range: { w: [min, max], d: [...], h: [...] }, color, build(b, w, d, h) }
//   opcjonalnie mount: wysokość spodu nad posadzką w metrach (meble wiszące → pole FurnitureItem.z).
//
// Funkcja build opisuje bryłę prostymi kształtami w układzie "od narożnika":
//   x: 0..w  od lewej do prawej (patrząc na front mebla),
//   y: 0..d  od FRONTU (0) do TYŁU (d) – tył to strona dosuwana do ściany,
//   z: 0..h  od spodu mebla w górę.
//   b.box(x0, y0, z0, x1, y1, z1, mat)          prostopadłościan od–do
//   b.cyl(cx, cy, r, z0, z1, mat)               walec pionowy
//   b.ell(cx, cy, rx, ry, z0, z1, mat)          walec pionowy o podstawie eliptycznej (dywan owalny, blat)
//   b.tube(cx, cy, rx, ry, z0, z1, mat)         pionowa rura / misa bez dna (ścianka = 12% promienia): wanna, umywalka
//   b.cylX(cy, cz, r, x0, x1, mat)              walec leżący wzdłuż x (koła quada, sztanga)
//   b.cylY(cx, cz, r, y0, y1, mat)              walec leżący wzdłuż y (koła roweru, bęben basowy)
//   b.discY(cx, cz, rx, rz, y0, y1, mat)        jak cylY, ale eliptyczny (lustro owalne)
//   b.ball(cx, cy, cz, rx, ry, rz, mat)         elipsoida (korona rośliny)
//   b.beam(x0, y0, z0, x1, y1, z1, t, mat)      belka o przekroju t × t między dwoma punktami (skośne ramy, krokwie)
// mat: 'main' (kolor mebla wybierany przez użytkownika), 'dark' / 'light' (ciemniejszy / jaśniejszy odcień koloru mebla),
//      'second' / 'second-dark' / 'second-light' (DRUGI kolor mebla – patrz niżej)
//      albo kolor stały z FIXED_COLORS ('white', 'steel', 'black', 'blat', 'mattress', 'glass', 'shade', 'wood', …).
//
// Dwa kolory: typ może mieć color2 (domyślny drugi kolor) i colorNames: ['nazwa 1.', 'nazwa 2.'] – np. fronty i blat.
//   Mebel zapisuje wtedy opcjonalne pole FurnitureItem.color2; gdy go brak, obowiązuje color2 typu.
// Wszystkie wymiary w metrach. Bryła MUSI mieścić się w w × d × h (pilnuje tego test katalogu).

export const CATEGORIES = [
  { id: 'salon', name: 'Salon' },
  { id: 'jadalnia', name: 'Jadalnia' },
  { id: 'sypialnia', name: 'Sypialnia' },
  { id: 'przechowywanie', name: 'Szafy i regały' },
  { id: 'kuchnia', name: 'Kuchnia' },
  { id: 'lazienka', name: 'Łazienka' },
  { id: 'przedpokoj', name: 'Wiatrołap / przedpokój' },
  { id: 'biuro', name: 'Biuro' },
  { id: 'dzieci', name: 'Pokój dziecka' },
  { id: 'garaz', name: 'Garaż i siłownia' },
  { id: 'scianki', name: 'Ścianki szklane i lamele' },
  { id: 'dekoracje', name: 'Dywany i rośliny' },
  { id: 'inne', name: 'Inne' },
];

/** Kolory stałe (niezależne od koloru mebla). */
export const FIXED_COLORS = {
  white: '#f4f4f1',
  steel: '#a9adb2',
  black: '#2e3033',
  blat: '#b59a78',
  mattress: '#efece6',
  glass: '#bfd9e4',
  shade: '#cfd4d8',
  wood: '#b5895a', // ciepły dąb
  woodDark: '#7a5636',
  jute: '#c9ad80',
  cream: '#efe8da',
  brass: '#c9a55a', // talerze perkusji
  rubber: '#3a3b3d', // opony, obciążenia
  leaf: '#5f7f55',
  leafDark: '#4a6846',
  fire: '#e08a3c', // żar we wkładzie kominka
  mirror: '#d4e0e3',
  screen: '#27313a',
  terracotta: '#c2704f', // ozdoby na półkach (modele aut, książki)
  navy: '#3f5873',
};

// Kolory domyślne nowych typów – ciepła gama „Montana”.
const OAK = '#b5895a'; // ciepły dąb (blaty, półki)
const LOFT = '#2e3033'; // czarna stal
const WARM_WHITE = '#f1ece2'; // ciepła złamana biel
const CASHMERE = '#ddd2bf'; // spokojny, ciepły kolor frontów
const LINEN = '#d8cbb5'; // jasny beż tkaniny

/** Paleta podpowiadana w panelu edycji (dowolny inny kolor daje próbnik). */
export const PALETTE = ['#f4f4f1', '#d9d4c8', '#b8b2a6', '#8a8f98', '#4a4d52', '#2e3033', '#b59a78', '#8a623c', '#5b3f2a', '#7d8f7a', '#5d7391', '#a8574a',
  '#f1ece2', '#ddd2bf', '#d8cbb5', '#b5895a', '#c2704f', '#a9b8a0'];

/** Zakres wysokości zawieszenia mebli wiszących (m nad posadzką). */
export const MOUNT_RANGE = [0, 2.4];

// ---------------------------------------------------------------- pomocniki brył

/** Cztery nogi o przekroju t × t, odsunięte od krawędzi o inset. */
function legs(b, w, d, z0, z1, t, inset, mat) {
  for (const x of [inset, w - inset - t]) for (const y of [inset, d - inset - t]) b.box(x, y, z0, x + t, y + t, z1, mat);
}

/** Fronty (drzwiczki / szuflady) na płaszczyźnie frontu: siatka cols × rows z 6 mm szczelinami, grubość 15 mm. */
function fronts(b, x0, x1, z0, z1, cols, rows, mat) {
  const gap = 0.006;
  const cw = (x1 - x0) / cols;
  const rh = (z1 - z0) / rows;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      b.box(x0 + c * cw + gap / 2, 0, z0 + r * rh + gap / 2, x0 + (c + 1) * cw - gap / 2, FRONT, z0 + (r + 1) * rh - gap / 2, mat);
    }
  }
}
const FRONT = 0.015; // grubość frontu – korpus zaczyna się tuż za nim

/** Liczba drzwiczek dla szerokości (moduł ok. 60 cm). */
const modules = (w, m = 0.6) => Math.max(1, Math.min(8, Math.round(w / m)));

/** Niecka (umywalka, wanna): cztery ścianki i dno. */
function basin(b, x0, y0, x1, y1, z0, z1, wall, floorZ, rimMat, floorMat) {
  b.box(x0, y0, z0, x1, y0 + wall, z1, rimMat);
  b.box(x0, y1 - wall, z0, x1, y1, z1, rimMat);
  b.box(x0, y0 + wall, z0, x0 + wall, y1 - wall, z1, rimMat);
  b.box(x1 - wall, y0 + wall, z0, x1, y1 - wall, z1, rimMat);
  b.box(x0 + wall, y0 + wall, z0, x1 - wall, y1 - wall, floorZ, floorMat);
}

function sofa(b, w, d, h, seats) {
  const arm = Math.min(0.18, w * 0.12);
  const back = Math.min(0.22, d * 0.28);
  const seatH = Math.min(0.44, h * 0.52);
  const baseTop = seatH - 0.14;
  b.box(0, 0, 0, w, d, baseTop, 'dark'); // podstawa
  const sw = (w - 2 * arm) / seats;
  for (let i = 0; i < seats; i++) b.box(arm + i * sw + 0.01, 0, baseTop, arm + (i + 1) * sw - 0.01, d - back, seatH, 'main'); // siedziska
  b.box(0, d - back, baseTop, w, d, h, 'main'); // oparcie
  const armH = Math.min(h, seatH + 0.18);
  b.box(0, 0, baseTop, arm, d - back, armH, 'main'); // podłokietniki
  b.box(w - arm, 0, baseTop, w, d - back, armH, 'main');
}

function bed(b, w, d, h) {
  const hb = 0.06; // grubość zagłówka
  const frameTop = Math.min(0.3, h * 0.35);
  const mTop = Math.min(frameTop + 0.2, h * 0.6);
  b.box(0, 0, 0.05, w, d - hb, frameTop, 'main'); // rama
  b.box(0.03, 0.03, frameTop, w - 0.03, d - hb - 0.01, mTop, 'mattress'); // materac
  b.box(0, d - hb, 0, w, d, h, 'main'); // zagłówek (tył = przy ścianie)
  b.box(0.03, 0.03, mTop, w - 0.03, (d - hb) * 0.62, mTop + 0.03, 'light'); // narzuta
  const n = w >= 1.3 ? 2 : 1; // poduszki
  const pw = (w - 0.1) / n;
  for (let i = 0; i < n; i++) b.box(0.05 + i * pw + 0.03, d - hb - 0.5, mTop, 0.05 + (i + 1) * pw - 0.03, d - hb - 0.08, mTop + 0.1, 'white');
}

/** Szafka stojąca z frontami; top = wysokość korpusu, plinth = cokół. */
function cabinet(b, w, d, top, cols, rows, plinth = 0.08) {
  if (plinth > 0) b.box(0.02, 0.05, 0, w - 0.02, d, plinth, 'dark');
  b.box(0, FRONT, plinth, w, d, top, 'dark');
  fronts(b, 0, w, plinth, top, cols, rows, 'main');
}

function kitchenBase(b, w, d, h) {
  const blat = 0.04;
  cabinet(b, w, d, h - blat, modules(w), 1, 0.1);
  b.box(0, 0, h - blat, w, d, h, 'second');
}

const cl = (v, min, max) => Math.min(max, Math.max(min, v));

/** Budowniczy odbity w osi x (lewa ↔ prawa) – do wersji „prawych” mebli niesymetrycznych. */
function mirrored(b, w) {
  return {
    box: (x0, y0, z0, x1, y1, z1, m) => b.box(w - x1, y0, z0, w - x0, y1, z1, m),
    cyl: (cx, cy, r, z0, z1, m) => b.cyl(w - cx, cy, r, z0, z1, m),
    ell: (cx, cy, rx, ry, z0, z1, m) => b.ell(w - cx, cy, rx, ry, z0, z1, m),
    tube: (cx, cy, rx, ry, z0, z1, m) => b.tube(w - cx, cy, rx, ry, z0, z1, m),
    cylX: (cy, cz, r, x0, x1, m) => b.cylX(cy, cz, r, w - x1, w - x0, m),
    cylY: (cx, cz, r, y0, y1, m) => b.cylY(w - cx, cz, r, y0, y1, m),
    discY: (cx, cz, rx, rz, y0, y1, m) => b.discY(w - cx, cz, rx, rz, y0, y1, m),
    ball: (cx, cy, cz, rx, ry, rz, m) => b.ball(w - cx, cy, cz, rx, ry, rz, m),
    beam: (x0, y0, z0, x1, y1, z1, t, m) => b.beam(w - x0, y0, z0, w - x1, y1, z1, t, m),
  };
}

/** Rama z czterech profili o grubości t na całą głębokość d. */
function frame(b, w, d, h, t, mat) {
  b.box(0, 0, 0, t, d, h, mat);
  b.box(w - t, 0, 0, w, d, h, mat);
  b.box(t, 0, h - t, w - t, d, h, mat);
  b.box(t, 0, 0, w - t, d, Math.min(t, 0.02), mat); // próg
}

/** Duży narożnik: część główna wzdłuż tyłu, drugie ramię z LEWEJ strony wysunięte do przodu (oparcia z dwóch stron). */
function cornerSofa(b, w, d, h) {
  const md = 1.0; // głębokość siedziska razem z oparciem
  const back = 0.24;
  const arm = 0.2;
  const seatH = Math.min(0.44, h * 0.52);
  const baseTop = seatH - 0.16;
  b.box(0, d - md, 0, w, d, baseTop, 'dark'); // podstawy
  b.box(0, 0, 0, md, d - md, baseTop, 'dark');
  b.box(0, d - back, baseTop, w, d, h, 'main'); // oparcie tylne
  b.box(0, 0, baseTop, back, d - back, h, 'main'); // oparcie boczne
  b.box(w - arm, d - md, baseTop, w, d - back, seatH + 0.16, 'main'); // podłokietnik
  b.box(back, d - md, baseTop, md, d - back, seatH, 'main'); // siedzisko narożne
  const nR = w - arm - md > 1.9 ? 3 : 2; // siedziska i poduchy części głównej
  const sw = (w - arm - md) / nR;
  for (let i = 0; i < nR; i++) {
    b.box(md + i * sw + 0.01, d - md, baseTop, md + (i + 1) * sw - 0.01, d - back, seatH, 'main');
    b.box(md + i * sw + 0.03, d - back - 0.14, seatH, md + (i + 1) * sw - 0.03, d - back, h - 0.06, 'light');
  }
  const wl = (d - md) / 2; // siedziska i poduchy ramienia bocznego
  for (let i = 0; i < 2; i++) {
    b.box(back, i * wl + 0.01, baseTop, md, (i + 1) * wl - 0.01, seatH, 'main');
    b.box(back, i * wl + 0.03, seatH, back + 0.14, (i + 1) * wl - 0.03, h - 0.06, 'light');
  }
  b.box(back + 0.16, d - back - 0.5, seatH, back + 0.56, d - back - 0.16, seatH + 0.12, 'second'); // poduszki ozdobne
  b.box(w - arm - 0.5, d - back - 0.3, seatH, w - arm - 0.06, d - back - 0.14, seatH + 0.3, 'second');
}

/** Wyspa-barek: szafki z frontami od FRONTU, drewniane boki i blat, nawis barowy „over” od TYŁU (strona hokerów). */
function barIsland(b, w, d, h, over) {
  const blat = 0.06;
  const pt = 0.04; // drewniane boki
  b.box(pt + 0.02, 0.06, 0, w - pt - 0.02, d - over, 0.1, 'dark');
  b.box(pt, FRONT, 0.1, w - pt, d - over - 0.015, h - blat, 'dark');
  fronts(b, pt, w - pt, 0.1, h - blat, cl(Math.round((w - 2 * pt) / 0.6), 1, 5), 1, 'main');
  b.box(pt, d - over - 0.015, 0.1, w - pt, d - over, h - blat, 'main'); // plecy od strony hokerów
  b.box(0, 0, 0, pt, d, h - blat, 'second');
  b.box(w - pt, 0, 0, w, d, h - blat, 'second');
  b.box(0, 0, h - blat, w, d, h, 'second');
  b.box(pt, d - over * 0.5 - 0.015, 0.22, w - pt, d - over * 0.5 + 0.015, 0.25, 'black'); // podnóżek
}

/** Podwieszana szafka z blatem i n misami nablatowymi (misa = drugi kolor), czarne wysokie baterie od strony ściany. */
function vanity(b, w, d, h, n) {
  const top = h - 0.18; // wierzch blatu; misa 13 cm, bateria 18 cm
  b.box(0.01, FRONT + 0.01, 0.28, w - 0.01, d, top - 0.04, 'dark'); // szafka podwieszana
  fronts(b, 0.01, w - 0.01, 0.28, top - 0.04, cl(Math.round(w / 0.7), 1, 3), 1, 'main');
  b.box(0, 0, top - 0.04, w, d, top, 'main');
  const r = Math.min(0.2, d * 0.4, (w / n) * 0.4);
  const cy = d * 0.45;
  for (let i = 0; i < n; i++) {
    const x = (w * (i + 0.5)) / n;
    b.tube(x, cy, r, r, top, top + 0.13, 'second');
    b.ell(x, cy, r * 0.9, r * 0.9, top, top + 0.035, 'second');
    b.cyl(x, cy + r + 0.03, 0.014, top, h, 'black'); // bateria wysoka
    b.box(x - 0.01, cy + 0.04, h - 0.02, x + 0.01, cy + r + 0.03, h, 'black');
  }
}

/** Prysznic walk-in: ściany z tyłu i z LEWEJ, tafla od frontu, wejście z prawej. */
function walkIn(b, w, d, h) {
  const gw = w * 0.68; // szerokość tafli
  const x = w * 0.3; // oś deszczownicy
  b.box(0, 0, 0, w, d, 0.03, 'main'); // płaski brodzik
  b.box(w * 0.3, d - 0.12, 0.03, w * 0.7, d - 0.06, 0.033, 'steel'); // odpływ liniowy
  b.box(0.02, 0.012, 0.05, gw, 0.022, h - 0.1, 'glass');
  b.box(0, 0.005, 0.03, gw, 0.03, 0.05, 'second'); // profil dolny
  b.box(0, 0.005, 0.05, 0.02, 0.03, h - 0.1, 'second'); // profil przyścienny
  b.box(gw - 0.03, 0.03, h - 0.12, gw - 0.01, d, h - 0.1, 'second'); // stabilizator do ściany
  b.cyl(x, d - 0.03, 0.012, 1.0, h, 'second'); // drążek
  b.box(x - 0.01, d - 0.35, h - 0.03, x + 0.01, d - 0.03, h - 0.01, 'second'); // ramię
  b.cyl(x, d - 0.35, 0.12, h - 0.06, h - 0.03, 'second'); // deszczownica
  b.box(x - 0.06, d - 0.04, 1.0, x + 0.06, d, 1.08, 'second'); // bateria
}

// ---------------------------------------------------------------- katalog

/**
 * @typedef {Object} FurnitureType
 * @property {string} id
 * @property {string} name
 * @property {string} category                 id z CATEGORIES
 * @property {{w: number, d: number, h: number}} size     wymiary domyślne (m)
 * @property {{w: number[], d: number[], h: number[]}} range  dozwolony zakres [min, max] (m)
 * @property {string} color                    kolor domyślny '#rrggbb'
 * @property {string} [color2]                 domyślny DRUGI kolor (sloty 'second…'); mebel może go nadpisać polem color2
 * @property {string[]} [colorNames]           nazwy obu kolorów w panelu, np. ['Fronty', 'Blat']
 * @property {number} [mount]                  meble wiszące: domyślna wysokość spodu nad posadzką (m)
 * @property {(b: Object, w: number, d: number, h: number) => void} build
 */

/** @type {FurnitureType[]} */
export const CATALOG = [
  // ---- salon
  {
    id: 'sofa-2', name: 'Sofa 2-osobowa', category: 'salon',
    size: { w: 1.6, d: 0.9, h: 0.85 }, range: { w: [1.3, 2.0], d: [0.75, 1.1], h: [0.65, 1.05] }, color: '#8a8f98',
    build: (b, w, d, h) => sofa(b, w, d, h, 2),
  },
  {
    id: 'sofa-3', name: 'Sofa 3-osobowa', category: 'salon',
    size: { w: 2.2, d: 0.95, h: 0.85 }, range: { w: [1.8, 2.8], d: [0.75, 1.15], h: [0.65, 1.05] }, color: '#8a8f98',
    build: (b, w, d, h) => sofa(b, w, d, h, 3),
  },
  {
    id: 'naroznik', name: 'Narożnik', category: 'salon',
    size: { w: 2.6, d: 1.8, h: 0.85 }, range: { w: [2.0, 3.6], d: [1.4, 2.6], h: [0.65, 1.05] }, color: '#8a8f98',
    build(b, w, d, h) {
      // litera L: część główna wzdłuż tyłu, szezlong z lewej strony wysunięty do przodu
      const md = Math.min(0.95, d * 0.55); // głębokość części głównej
      const cw = Math.min(1.0, w * 0.4); // szerokość szezlonga
      const arm = 0.18;
      const back = 0.22;
      const seatH = Math.min(0.44, h * 0.52);
      const baseTop = seatH - 0.14;
      b.box(0, d - md, 0, w, d, baseTop, 'dark');
      b.box(0, 0, 0, cw, d - md, baseTop, 'dark');
      b.box(0, d - md, baseTop, w - arm, d - back, seatH, 'main');
      b.box(0, 0, baseTop, cw, d - md, seatH, 'main');
      b.box(0, d - back, baseTop, w, d, h, 'main');
      b.box(w - arm, d - md, baseTop, w, d - back, Math.min(h, seatH + 0.18), 'main');
    },
  },
  {
    id: 'fotel', name: 'Fotel', category: 'salon',
    size: { w: 0.85, d: 0.85, h: 0.85 }, range: { w: [0.65, 1.1], d: [0.65, 1.1], h: [0.65, 1.1] }, color: '#7d8f7a',
    build: (b, w, d, h) => sofa(b, w, d, h, 1),
  },
  {
    id: 'stolik-kawowy', name: 'Stolik kawowy', category: 'salon',
    size: { w: 1.1, d: 0.6, h: 0.45 }, range: { w: [0.5, 1.5], d: [0.4, 1.0], h: [0.3, 0.6] }, color: '#8a623c',
    build(b, w, d, h) {
      b.box(0, 0, h - 0.04, w, d, h, 'main');
      legs(b, w, d, 0, h - 0.04, 0.05, 0.03, 'dark');
    },
  },
  {
    id: 'szafka-rtv', name: 'Szafka RTV', category: 'salon',
    size: { w: 1.6, d: 0.4, h: 0.5 }, range: { w: [0.8, 2.4], d: [0.3, 0.6], h: [0.3, 0.7] }, color: '#d9d4c8',
    build: (b, w, d, h) => cabinet(b, w, d, h, modules(w, 0.55), 1, 0.06),
  },

  // ---- jadalnia
  {
    id: 'stol', name: 'Stół jadalny', category: 'jadalnia',
    size: { w: 1.6, d: 0.9, h: 0.75 }, range: { w: [0.8, 2.6], d: [0.7, 1.2], h: [0.7, 0.8] }, color: '#8a623c',
    build(b, w, d, h) {
      b.box(0, 0, h - 0.04, w, d, h, 'main');
      legs(b, w, d, 0, h - 0.04, 0.07, 0.05, 'dark');
    },
  },
  {
    id: 'krzeslo', name: 'Krzesło', category: 'jadalnia',
    size: { w: 0.45, d: 0.52, h: 0.9 }, range: { w: [0.38, 0.6], d: [0.4, 0.65], h: [0.75, 1.1] }, color: '#4a4d52',
    build(b, w, d, h) {
      const seat = Math.min(0.46, h * 0.52);
      legs(b, w, d, 0, seat - 0.05, 0.035, 0.01, 'dark');
      b.box(0, 0, seat - 0.05, w, d, seat, 'main');
      b.box(0, d - 0.04, seat, w, d, h, 'main'); // oparcie
    },
  },

  // ---- sypialnia (wymiar łóżka = materac + rama; długość 2,10 = materac 200 + zagłówek)
  ...[[90, 1.0], [120, 1.3], [140, 1.5], [160, 1.7], [180, 1.9]].map(([cm, w]) => ({
    id: `lozko-${cm}`, name: `Łóżko ${cm} × 200`, category: 'sypialnia',
    size: { w, d: 2.1, h: 1.0 }, range: { w: [w - 0.1, w + 0.2], d: [2.0, 2.3], h: [0.4, 1.4] }, color: '#b8b2a6',
    build: bed,
  })),
  {
    id: 'szafka-nocna', name: 'Szafka nocna', category: 'sypialnia',
    size: { w: 0.45, d: 0.4, h: 0.5 }, range: { w: [0.3, 0.6], d: [0.3, 0.5], h: [0.35, 0.7] }, color: '#d9d4c8',
    build: (b, w, d, h) => cabinet(b, w, d, h, 1, 2, 0.06),
  },
  {
    id: 'komoda', name: 'Komoda', category: 'sypialnia',
    size: { w: 1.2, d: 0.45, h: 0.85 }, range: { w: [0.6, 2.0], d: [0.35, 0.6], h: [0.6, 1.2] }, color: '#d9d4c8',
    build: (b, w, d, h) => cabinet(b, w, d, h, modules(w), 3, 0.06),
  },
  {
    id: 'biurko', name: 'Biurko', category: 'sypialnia',
    size: { w: 1.4, d: 0.7, h: 0.75 }, range: { w: [0.8, 2.0], d: [0.5, 0.9], h: [0.65, 0.85] }, color: '#d9d4c8',
    build(b, w, d, h) {
      b.box(0, 0, h - 0.03, w, d, h, 'main'); // blat
      b.box(0, 0.03, 0, 0.03, d - 0.02, h - 0.03, 'dark'); // boki
      b.box(w - 0.03, 0.03, 0, w, d - 0.02, h - 0.03, 'dark');
      b.box(0.03, d - 0.05, h * 0.45, w - 0.03, d - 0.03, h - 0.03, 'dark'); // osłona z tyłu
    },
  },

  // ---- szafy i regały
  {
    id: 'szafa', name: 'Szafa', category: 'przechowywanie',
    size: { w: 1.5, d: 0.6, h: 2.1 }, range: { w: [0.5, 3.0], d: [0.4, 0.7], h: [1.6, 2.6] }, color: '#f4f4f1',
    build: (b, w, d, h) => cabinet(b, w, d, h, modules(w, 0.5), 1, 0.08),
  },
  {
    // zabudowa na wymiar – szeroki zakres, żeby dało się odwzorować szafy narysowane w projekcie (także niskie pod skosem)
    id: 'szafa-wnekowa', name: 'Szafa wnękowa / zabudowa', category: 'przechowywanie',
    size: { w: 2.0, d: 0.6, h: 2.4 }, range: { w: [0.4, 5.0], d: [0.3, 1.0], h: [0.4, 2.7] }, color: '#f4f4f1',
    build: (b, w, d, h) => cabinet(b, w, d, h, modules(w, 0.6), 1, 0.08),
  },
  {
    id: 'regal', name: 'Regał', category: 'przechowywanie',
    size: { w: 0.8, d: 0.35, h: 2.0 }, range: { w: [0.4, 2.0], d: [0.2, 0.6], h: [0.6, 2.6] }, color: '#d9d4c8',
    build(b, w, d, h) {
      const t = 0.025;
      b.box(0, 0, 0, t, d, h, 'main'); // boki
      b.box(w - t, 0, 0, w, d, h, 'main');
      b.box(t, d - 0.01, 0, w - t, d, h, 'dark'); // plecy
      const n = Math.max(2, Math.min(8, Math.round(h / 0.35) + 1)); // półki razem z dnem i wieńcem
      for (let i = 0; i < n; i++) {
        const z = 0.05 + ((h - 0.05 - t) * i) / (n - 1);
        b.box(t, 0, z, w - t, d - 0.01, z + t, 'main');
      }
    },
  },

  // ---- kuchnia
  {
    id: 'kuchnia-dolna', name: 'Szafka dolna z blatem', category: 'kuchnia',
    size: { w: 0.6, d: 0.6, h: 0.9 }, range: { w: [0.3, 4.0], d: [0.5, 0.7], h: [0.82, 0.95] }, color: '#f4f4f1', color2: OAK, colorNames: ['Fronty', 'Blat'],
    build: kitchenBase,
  },
  {
    id: 'kuchnia-gorna', name: 'Szafka górna wisząca', category: 'kuchnia',
    size: { w: 0.6, d: 0.35, h: 0.72 }, range: { w: [0.3, 4.0], d: [0.28, 0.45], h: [0.36, 1.0] }, color: '#f4f4f1',
    mount: 1.45, // typowo: blat 90 cm + 55 cm odstępu
    build: (b, w, d, h) => cabinet(b, w, d, h, modules(w), 1, 0),
  },
  {
    id: 'kuchnia-slupek', name: 'Słupek / lodówka', category: 'kuchnia',
    size: { w: 0.6, d: 0.65, h: 2.05 }, range: { w: [0.45, 1.0], d: [0.55, 0.75], h: [1.4, 2.4] }, color: '#b8b2a6',
    build(b, w, d, h) {
      b.box(0.02, 0.05, 0, w - 0.02, d, 0.08, 'dark');
      b.box(0, FRONT, 0.08, w, d, h, 'dark');
      const split = 0.08 + (h - 0.08) * 0.38; // dolne drzwi (zamrażarka) i górne
      fronts(b, 0, w, 0.08, split, 1, 1, 'main');
      fronts(b, 0, w, split, h, 1, 1, 'main');
    },
  },
  {
    id: 'kuchnia-wyspa', name: 'Wyspa kuchenna', category: 'kuchnia',
    size: { w: 1.8, d: 0.9, h: 0.9 }, range: { w: [1.0, 3.0], d: [0.6, 1.3], h: [0.82, 1.1] }, color: '#f4f4f1', color2: OAK, colorNames: ['Fronty', 'Blat'],
    build(b, w, d, h) {
      const blat = 0.04;
      b.box(0.06, 0.08, 0, w - 0.06, d - 0.08, 0.1, 'dark'); // cokół
      b.box(0.03, 0.03, 0.1, w - 0.03, d - 0.03, h - blat, 'main'); // korpus cofnięty pod blatem
      b.box(0, 0, h - blat, w, d, h, 'second');
    },
  },
  {
    id: 'kuchnia-zlew', name: 'Szafka ze zlewem', category: 'kuchnia',
    size: { w: 0.8, d: 0.6, h: 0.9 }, range: { w: [0.5, 1.2], d: [0.5, 0.7], h: [0.82, 0.95] }, color: '#f4f4f1', color2: OAK, colorNames: ['Fronty', 'Blat'],
    build(b, w, d, h) {
      // blat 2 cm niżej niż h – zlew i bateria wystają ponad blat, a całość mieści się w wysokości mebla
      const top = h - 0.02;
      cabinet(b, w, d, top - 0.04, modules(w), 1, 0.1);
      b.box(0, 0, top - 0.04, w, d, top, 'second');
      basin(b, w * 0.12, d * 0.18, w * 0.88, d * 0.82, top, top + 0.008, 0.02, top + 0.002, 'steel', 'shade');
      b.cyl(w / 2, d * 0.9, 0.018, top, h, 'steel'); // bateria
    },
  },
  {
    id: 'kuchnia-plyta', name: 'Szafka z płytą grzewczą', category: 'kuchnia',
    size: { w: 0.6, d: 0.6, h: 0.9 }, range: { w: [0.45, 0.9], d: [0.5, 0.7], h: [0.82, 0.95] }, color: '#f4f4f1', color2: OAK, colorNames: ['Fronty', 'Blat'],
    build(b, w, d, h) {
      const top = h - 0.008;
      cabinet(b, w, d, top - 0.04, 1, 2, 0.1);
      b.box(0, 0, top - 0.04, w, d, top, 'second');
      b.box(w * 0.06, d * 0.12, top, w * 0.94, d * 0.9, top + 0.004, 'black'); // płyta
      const r = Math.min(w, d) * 0.13;
      for (const fx of [0.3, 0.7]) for (const fy of [0.32, 0.7]) b.cyl(w * fx, d * fy, r, top + 0.004, h, 'steel'); // pola
    },
  },

  // ---- łazienka
  {
    id: 'wc', name: 'WC kompakt', category: 'lazienka',
    size: { w: 0.37, d: 0.65, h: 0.78 }, range: { w: [0.34, 0.42], d: [0.5, 0.72], h: [0.38, 0.85] }, color: '#f4f4f1',
    build(b, w, d, h) {
      const tank = Math.min(0.17, d * 0.26); // spłuczka przy ścianie
      const seat = Math.min(0.41, h);
      const r = w / 2;
      b.box(w * 0.22, r, 0, w * 0.78, d - tank, seat - 0.06, 'main'); // stopa
      b.cyl(w / 2, r, r, seat * 0.55, seat - 0.02, 'main'); // miska
      b.box(0, r, seat * 0.55, w, d - tank, seat - 0.02, 'main');
      b.cyl(w / 2, r, r * 0.96, seat - 0.02, seat, 'light'); // deska
      if (h > seat + 0.1) b.box(0.01, d - tank, seat - 0.06, w - 0.01, d, h, 'main'); // spłuczka
      else b.box(0, d - tank, 0, w, d, h, 'main'); // model wiszący: sam stelaż/obudowa
    },
  },
  {
    id: 'umywalka', name: 'Umywalka z szafką', category: 'lazienka',
    size: { w: 0.6, d: 0.46, h: 0.85 }, range: { w: [0.4, 1.4], d: [0.35, 0.55], h: [0.75, 0.95] }, color: '#b59a78',
    build(b, w, d, h) {
      const bowl = 0.12;
      b.box(0.01, FRONT + 0.01, 0.2, w - 0.01, d, h - bowl, 'dark'); // szafka podwieszana pod umywalką
      fronts(b, 0.01, w - 0.01, 0.2, h - bowl, modules(w), 1, 'main');
      basin(b, 0, 0, w, d, h - bowl, h, 0.035, h - bowl + 0.03, 'white', 'shade');
    },
  },
  {
    id: 'wanna', name: 'Wanna', category: 'lazienka',
    size: { w: 1.7, d: 0.75, h: 0.58 }, range: { w: [1.2, 1.9], d: [0.65, 0.9], h: [0.5, 0.65] }, color: '#f4f4f1',
    build: (b, w, d, h) => basin(b, 0, 0, w, d, 0, h, 0.06, h * 0.3, 'main', 'shade'),
  },
  {
    id: 'prysznic', name: 'Prysznic / brodzik', category: 'lazienka',
    size: { w: 0.9, d: 0.9, h: 2.0 }, range: { w: [0.7, 1.8], d: [0.7, 1.2], h: [0.05, 2.2] }, color: '#f4f4f1',
    build(b, w, d, h) {
      const tray = Math.min(0.05, h);
      b.box(0, 0, 0, w, d, tray, 'main'); // brodzik
      if (h < 0.5) return; // sam brodzik
      b.box(0, 0, tray, w, 0.01, h, 'glass'); // szyba od frontu
      b.box(w - 0.01, 0.01, tray, w, d, h, 'glass'); // szyba boczna
      b.cyl(0.12, d - 0.06, 0.012, Math.min(0.9, h), h, 'steel'); // drążek z deszczownicą
      b.cyl(0.2, d - 0.2, 0.11, h - 0.02, h, 'steel');
    },
  },
  {
    id: 'pralka', name: 'Pralka', category: 'lazienka',
    size: { w: 0.6, d: 0.6, h: 0.85 }, range: { w: [0.55, 0.65], d: [0.4, 0.65], h: [0.82, 0.9] }, color: '#f4f4f1',
    build(b, w, d, h) {
      b.box(0, 0.012, 0, w, d, h, 'main');
      const s = Math.min(w, h) * 0.5;
      b.box(w / 2 - s / 2, 0, h * 0.2, w / 2 + s / 2, 0.012, h * 0.2 + s, 'black'); // drzwiczki
      b.box(0.03, 0, h - 0.12, w - 0.03, 0.012, h - 0.03, 'steel'); // panel
    },
  },

  // ---- inne
  {
    // obudowa w stylu Montana: kamienna ława, czarny wkład z żarem, drewniana belka, wyżej tynkowany czopuch
    id: 'kominek', name: 'Kominek', category: 'inne',
    size: { w: 0.87, d: 0.55, h: 2.2 }, range: { w: [0.6, 1.6], d: [0.4, 0.9], h: [0.6, 2.69] },
    color: '#d9d4c8', color2: '#8a623c', colorNames: ['Obudowa', 'Belka'],
    build(b, w, d, h) {
      const z0 = Math.min(0.32, h * 0.2); // ława
      const ih = Math.min(0.55, h * 0.4); // wysokość szyby wkładu
      const zb = z0 + 0.04 + ih + 0.08; // spód belki
      const t = Math.min(0.14, h * 0.1); // grubość belki
      b.box(0, 0, 0, w, d, z0, 'dark');
      b.box(0, 0.03, z0, w, d, zb, 'main');
      b.box(w * 0.12, 0.015, z0 + 0.04, w * 0.88, 0.03, z0 + 0.04 + ih, 'black');
      b.box(w * 0.2, 0.011, z0 + 0.06, w * 0.8, 0.015, z0 + 0.06 + ih * 0.3, 'fire');
      b.box(0, 0, zb, w, d, zb + t, 'second');
      b.box(0.04, 0.05, zb + t, w - 0.04, d, h, 'main');
    },
  },

  // ================================================================ NOWE TYPY (wariant „Montana”)

  // ---- salon
  {
    id: 'naroznik-duzy', name: 'Narożnik duży (ramię z lewej)', category: 'salon',
    size: { w: 3.0, d: 2.2, h: 0.85 }, range: { w: [2.4, 4.0], d: [1.6, 3.0], h: [0.7, 1.0] },
    color: LINEN, color2: '#b98f6a', colorNames: ['Tkanina', 'Poduszki'],
    build: cornerSofa,
  },
  {
    id: 'naroznik-duzy-prawy', name: 'Narożnik duży (ramię z prawej)', category: 'salon',
    size: { w: 3.0, d: 2.2, h: 0.85 }, range: { w: [2.4, 4.0], d: [1.6, 3.0], h: [0.7, 1.0] },
    color: LINEN, color2: '#b98f6a', colorNames: ['Tkanina', 'Poduszki'],
    build: (b, w, d, h) => cornerSofa(mirrored(b, w), w, d, h),
  },
  {
    id: 'fotel-uszak', name: 'Fotel uszak', category: 'salon',
    size: { w: 0.8, d: 0.85, h: 1.05 }, range: { w: [0.65, 1.0], d: [0.7, 1.0], h: [0.9, 1.2] }, color: '#b08560',
    build(b, w, d, h) {
      const a = 0.12; // podłokietnik
      const seat = 0.42;
      legs(b, w, d, 0, 0.14, 0.04, 0.04, 'woodDark');
      b.box(a, 0.02, 0.14, w - a, d - 0.14, seat - 0.08, 'dark');
      b.box(a + 0.01, 0, seat - 0.08, w - a - 0.01, d - 0.16, seat + 0.02, 'light'); // poducha
      b.box(0, 0.06, 0.14, a, d, seat + 0.2, 'main');
      b.box(w - a, 0.06, 0.14, w, d, seat + 0.2, 'main');
      b.box(a * 0.5, d - 0.16, 0.14, w - a * 0.5, d, h, 'main'); // wysokie oparcie
      b.box(0, d - 0.36, seat + 0.2, 0.08, d - 0.1, h - 0.08, 'main'); // „uszy”
      b.box(w - 0.08, d - 0.36, seat + 0.2, w, d - 0.1, h - 0.08, 'main');
    },
  },
  {
    id: 'stolik-okragly', name: 'Stolik kawowy okrągły', category: 'salon',
    size: { w: 0.8, d: 0.8, h: 0.42 }, range: { w: [0.4, 1.2], d: [0.4, 1.2], h: [0.3, 0.6] },
    color: OAK, color2: LOFT, colorNames: ['Blat', 'Nogi'],
    build(b, w, d, h) {
      b.ell(w / 2, d / 2, w / 2, d / 2, h - 0.035, h, 'main');
      for (const fx of [0.22, 0.78]) for (const fy of [0.22, 0.78]) b.cyl(w * fx, d * fy, 0.012, 0, h - 0.035, 'second');
      b.tube(w / 2, d / 2, w * 0.36, d * 0.36, 0.08, 0.1, 'second'); // obręcz łącząca nogi
    },
  },
  {
    id: 'zabudowa-rtv', name: 'Zabudowa RTV z regałem', category: 'salon',
    size: { w: 2.8, d: 0.4, h: 2.3 }, range: { w: [1.8, 4.0], d: [0.3, 0.55], h: [1.6, 2.7] },
    color: WARM_WHITE, color2: OAK, colorNames: ['Korpus i fronty', 'Drewno'],
    build(b, w, d, h) {
      const low = 0.45; // wysokość szafki dolnej
      const sw = cl(w * 0.18, 0.35, 0.6); // szerokość regałów bocznych
      const t = 0.03;
      b.box(0.02, 0.04, 0, w - 0.02, d, 0.06, 'dark');
      b.box(0, FRONT, 0.06, w, d, low - t, 'dark');
      fronts(b, 0, w, 0.06, low - t, cl(Math.round(w / 0.7), 2, 4), 1, 'main');
      b.box(0, 0, low - t, w, d, low, 'second'); // drewniany blat szafki
      b.box(sw, d - 0.03, low, w - sw, d, h - t, 'second'); // drewniany panel za telewizorem
      const tw = Math.min(1.45, w - 2 * sw - 0.3);
      const th = Math.min(tw * 0.5625, h - low - 0.4);
      b.box(w / 2 - tw / 2, d - 0.08, low + 0.25, w / 2 + tw / 2, d - 0.03, low + 0.25 + th, 'black'); // telewizor
      b.box(sw, 0.05, h - t, w - sw, d, h, 'main'); // wieniec nad telewizorem
      for (const m of [b, mirrored(b, w)]) {
        m.box(0, 0.05, low, t, d, h, 'main');
        m.box(sw - t, 0.05, low, sw, d, h, 'main');
        for (let i = 1; i <= 3; i++) {
          const z = low + ((h - low) * i) / 3;
          m.box(t, 0.05, z - t, sw - t, d, z, 'second');
        }
      }
    },
  },

  // ---- jadalnia
  {
    id: 'stol-6', name: 'Stół na 6 osób (dąb, czarne nogi)', category: 'jadalnia',
    size: { w: 1.8, d: 0.9, h: 0.76 }, range: { w: [1.4, 2.4], d: [0.8, 1.1], h: [0.72, 0.8] },
    color: OAK, color2: LOFT, colorNames: ['Blat', 'Nogi'],
    build(b, w, d, h) {
      const top = h - 0.05;
      b.box(0, 0, top, w, d, h, 'main');
      for (const x of [0.14, w - 0.2]) {
        // rama z płaskownika: dwie nogi, poprzeczka pod blatem i przy podłodze
        b.box(x, 0.08, 0, x + 0.06, 0.14, top, 'second');
        b.box(x, d - 0.14, 0, x + 0.06, d - 0.08, top, 'second');
        b.box(x, 0.14, top - 0.04, x + 0.06, d - 0.14, top, 'second');
        b.box(x, 0.14, 0, x + 0.06, d - 0.14, 0.04, 'second');
      }
      b.box(0.2, d / 2 - 0.03, top - 0.04, w - 0.2, d / 2 + 0.03, top, 'second');
    },
  },
  {
    // komplet w jednej bryle: 3 krzesła od frontu i 3 od tyłu, wsunięte pod blat
    id: 'stol-6-krzesla', name: 'Stół z 6 krzesłami (komplet)', category: 'jadalnia',
    size: { w: 1.8, d: 1.75, h: 0.9 }, range: { w: [1.6, 2.4], d: [1.65, 2.1], h: [0.85, 1.0] },
    color: OAK, color2: '#4a4d52', colorNames: ['Stół', 'Krzesła'],
    build(b, w, d, h) {
      const out = 0.42; // tyle krzesło wystaje poza blat
      b.box(0, out, 0.71, w, d - out, 0.76, 'main');
      for (const x of [0.1, w - 0.17]) for (const y of [out + 0.07, d - out - 0.14]) b.box(x, y, 0, x + 0.07, y + 0.07, 0.71, 'dark');
      for (const cx of [w / 6, w / 2, (5 * w) / 6]) {
        for (const flip of [false, true]) {
          const y = (v) => (flip ? d - v : v);
          b.box(cx - 0.22, y(0.03), 0.42, cx + 0.22, y(0.5), 0.47, 'second'); // siedzisko
          b.box(cx - 0.22, y(0), 0.47, cx + 0.22, y(0.04), h, 'second'); // oparcie
          b.box(cx - 0.17, y(0.07), 0, cx + 0.17, y(0.43), 0.42, 'second-dark'); // nogi (uproszczone)
        }
      }
    },
  },
  {
    id: 'hoker', name: 'Hoker', category: 'jadalnia',
    size: { w: 0.4, d: 0.42, h: 0.9 }, range: { w: [0.34, 0.5], d: [0.34, 0.5], h: [0.6, 1.15] },
    color: OAK, color2: LOFT, colorNames: ['Siedzisko', 'Stelaż'],
    build(b, w, d, h) {
      const s = h * 0.74; // wysokość siedziska (66 cm przy blacie 92 cm)
      legs(b, w, d, 0, s - 0.04, 0.03, 0.02, 'second');
      b.box(0.02, 0.02, s * 0.35, w - 0.02, 0.05, s * 0.35 + 0.02, 'second'); // podnóżek
      b.box(0, 0, s - 0.04, w, d, s, 'main');
      b.box(0.02, d - 0.05, s, 0.05, d - 0.02, h - 0.1, 'second');
      b.box(w - 0.05, d - 0.05, s, w - 0.02, d - 0.02, h - 0.1, 'second');
      b.box(0, d - 0.06, h - 0.12, w, d, h, 'main'); // niskie oparcie
    },
  },

  // ---- kuchnia
  {
    // fronty szafek od FRONTU (strona kuchni), nawis blatu na hokery od TYŁU (strona jadalni)
    id: 'wyspa-barek', name: 'Wyspa-barek z drewnianym blatem', category: 'kuchnia',
    size: { w: 1.8, d: 0.9, h: 0.92 }, range: { w: [1.0, 3.0], d: [0.6, 1.2], h: [0.85, 1.15] },
    color: CASHMERE, color2: OAK, colorNames: ['Fronty', 'Blat i boki'],
    build: (b, w, d, h) => barIsland(b, w, d, h, Math.min(0.3, d * 0.33)),
  },
  {
    // mniejsza wyspa wolnostojąca do wąskiej kuchni: ten sam układ co „wyspa-barek” (fronty od FRONTU, nawis na hokery od TYŁU)
    id: 'wyspa-mala', name: 'Wyspa-barek mała (wolnostojąca)', category: 'kuchnia',
    size: { w: 1.2, d: 0.7, h: 0.92 }, range: { w: [0.8, 1.6], d: [0.5, 0.9], h: [0.85, 1.1] },
    color: CASHMERE, color2: OAK, colorNames: ['Fronty', 'Blat i boki'],
    build: (b, w, d, h) => barIsland(b, w, d, h, Math.min(0.25, d * 0.3)),
  },
  {
    id: 'kuchnia-piekarnik', name: 'Słupek z piekarnikiem', category: 'kuchnia',
    size: { w: 0.6, d: 0.6, h: 2.1 }, range: { w: [0.55, 0.7], d: [0.55, 0.7], h: [1.4, 2.4] }, color: CASHMERE,
    build(b, w, d, h) {
      const micro = h >= 1.9; // nad piekarnikiem mikrofalówka
      b.box(0.02, 0.05, 0, w - 0.02, d, 0.1, 'dark');
      b.box(0, FRONT, 0.1, w, d, h, 'dark');
      fronts(b, 0, w, 0.1, 0.6, 1, 1, 'main');
      b.box(0.01, 0, 0.61, w - 0.01, FRONT, 1.09, 'black'); // piekarnik
      b.box(0.01, 0, 1.1, w - 0.01, FRONT, 1.19, 'steel'); // panel
      if (micro) {
        b.box(0.01, 0, 1.21, w - 0.125, FRONT, 1.59, 'black');
        b.box(w - 0.12, 0, 1.21, w - 0.01, FRONT, 1.59, 'steel');
      }
      fronts(b, 0, w, micro ? 1.6 : 1.2, h, 1, 1, 'main');
    },
  },
  {
    id: 'lodowka', name: 'Lodówka wolnostojąca', category: 'kuchnia',
    size: { w: 0.6, d: 0.65, h: 1.9 }, range: { w: [0.55, 0.95], d: [0.6, 0.75], h: [1.6, 2.05] }, color: '#3d4045',
    build(b, w, d, h) {
      const split = h * 0.36;
      b.box(0, 0.05, 0, w, d, h, 'dark');
      b.box(0, 0.02, 0.03, w, 0.05, split - 0.004, 'main');
      b.box(0, 0.02, split + 0.004, w, 0.05, h, 'main');
      b.box(0.04, 0, split - 0.32, 0.065, 0.02, split - 0.06, 'steel'); // uchwyty
      b.box(0.04, 0, split + 0.06, 0.065, 0.02, split + 0.5, 'steel');
    },
  },
  {
    id: 'polka-wiszaca', name: 'Półka drewniana wisząca', category: 'kuchnia',
    size: { w: 1.2, d: 0.25, h: 0.2 }, range: { w: [0.4, 2.4], d: [0.15, 0.35], h: [0.04, 0.3] }, color: OAK,
    mount: 1.5,
    build(b, w, d, h) {
      b.box(0, 0, h - 0.04, w, d, h, 'main');
      if (h < 0.1) return; // sama deska
      for (const x of [0.08, w - 0.11]) {
        b.box(x, d - 0.02, 0, x + 0.03, d, h - 0.04, 'black'); // wsporniki
        b.box(x, d * 0.3, h - 0.06, x + 0.03, d - 0.02, h - 0.04, 'black');
      }
    },
  },

  // ---- łazienka
  {
    id: 'wanna-wolnostojaca', name: 'Wanna wolnostojąca', category: 'lazienka',
    size: { w: 1.7, d: 0.8, h: 0.6 }, range: { w: [1.4, 1.9], d: [0.7, 0.9], h: [0.52, 0.68] }, color: '#f4f4f1',
    build(b, w, d, h) {
      b.tube(w / 2, d / 2, w / 2, d / 2, 0, h, 'main');
      b.ell(w / 2, d / 2, w * 0.45, d * 0.45, 0, h * 0.25, 'main'); // dno
      b.cyl(w / 2, d / 2, 0.025, h * 0.25, h * 0.25 + 0.004, 'steel'); // odpływ
    },
  },
  {
    id: 'bidet', name: 'Bidet podwieszany', category: 'lazienka',
    size: { w: 0.37, d: 0.56, h: 0.4 }, range: { w: [0.34, 0.42], d: [0.5, 0.62], h: [0.36, 0.45] }, color: '#f4f4f1',
    build(b, w, d, h) {
      const bt = h - 0.07; // wierzch miski; wyżej już tylko czarna bateria
      const ry = (d - 0.1) / 2;
      b.box(w * 0.12, d - 0.14, 0.1, w * 0.88, d, bt, 'main'); // mocowanie do ściany
      b.tube(w / 2, ry, w / 2, ry, 0.14, bt, 'main');
      b.ell(w / 2, ry, w * 0.45, ry * 0.9, 0.12, bt - 0.1, 'main');
      b.box(w * 0.1, d - 0.2, bt - 0.04, w * 0.9, d, bt, 'main'); // półka pod baterię
      b.cyl(w / 2, d - 0.09, 0.016, bt, h, 'black');
      b.box(w / 2 - 0.012, d - 0.2, h - 0.025, w / 2 + 0.012, d - 0.09, h, 'black');
    },
  },
  {
    id: 'wc-podwieszane', name: 'WC podwieszane', category: 'lazienka',
    size: { w: 0.37, d: 0.54, h: 0.42 }, range: { w: [0.34, 0.42], d: [0.48, 0.6], h: [0.38, 0.46] }, color: '#f4f4f1',
    build(b, w, d, h) {
      const ry = (d - 0.08) / 2;
      b.box(w * 0.1, d - 0.12, 0.08, w * 0.9, d, h - 0.03, 'main'); // mocowanie do ściany
      b.ell(w / 2, ry, w / 2, ry, 0.14, h - 0.03, 'main'); // miska
      b.ell(w / 2, ry + 0.02, w * 0.38, ry * 0.8, 0.08, 0.14, 'main');
      b.ell(w / 2, ry, w * 0.48, ry * 0.97, h - 0.03, h, 'light'); // deska
      b.box(w * 0.15, d - 0.16, h - 0.03, w * 0.85, d - 0.08, h - 0.005, 'light'); // zawias deski
    },
  },
  {
    id: 'umywalka-nablatowa', name: 'Szafka z umywalką nablatową', category: 'lazienka',
    size: { w: 0.8, d: 0.48, h: 0.95 }, range: { w: [0.5, 1.8], d: [0.4, 0.6], h: [0.85, 1.05] },
    color: OAK, color2: '#f4f4f1', colorNames: ['Szafka i blat', 'Misa'],
    build: (b, w, d, h) => vanity(b, w, d, h, w >= 1.3 ? 2 : 1), // dwie misy na szerokim blacie
  },
  {
    // zawsze DWIE misy na jednym blacie; misy osobnym kolorem (domyślnie terakota)
    id: 'umywalka-podwojna', name: 'Podwójna umywalka nablatowa na dębowym blacie', category: 'lazienka',
    size: { w: 1.4, d: 0.5, h: 0.95 }, range: { w: [1.0, 2.2], d: [0.42, 0.6], h: [0.85, 1.05] },
    color: OAK, color2: '#c2704f', colorNames: ['Szafka i blat', 'Misy'],
    build: (b, w, d, h) => vanity(b, w, d, h, 2),
  },
  {
    id: 'prysznic-walk-in', name: 'Prysznic walk-in (ściana z lewej)', category: 'lazienka',
    size: { w: 1.2, d: 0.9, h: 2.0 }, range: { w: [0.8, 1.8], d: [0.7, 1.2], h: [1.9, 2.3] },
    color: '#e9e3d8', color2: LOFT, colorNames: ['Brodzik', 'Profile i armatura'],
    build: walkIn,
  },
  {
    id: 'prysznic-walk-in-prawy', name: 'Prysznic walk-in (ściana z prawej)', category: 'lazienka',
    size: { w: 1.2, d: 0.9, h: 2.0 }, range: { w: [0.8, 1.8], d: [0.7, 1.2], h: [1.9, 2.3] },
    color: '#e9e3d8', color2: LOFT, colorNames: ['Brodzik', 'Profile i armatura'],
    build: (b, w, d, h) => walkIn(mirrored(b, w), w, d, h),
  },
  {
    // sama tafla: profil przyścienny z LEWEJ (x = 0), profil przy posadzce
    id: 'tafla-prysznic', name: 'Tafla prysznica walk-in', category: 'lazienka',
    size: { w: 1.0, d: 0.04, h: 2.0 }, range: { w: [0.6, 1.6], d: [0.03, 0.08], h: [1.8, 2.4] }, color: LOFT,
    build(b, w, d, h) {
      b.box(0, 0, 0, 0.02, d, h, 'main');
      b.box(0.02, 0, 0, w, d, 0.02, 'main');
      b.box(0.02, d / 2 - 0.005, 0.02, w, d / 2 + 0.005, h, 'glass');
    },
  },
  {
    id: 'pralka-suszarka', name: 'Pralka i suszarka (słupek)', category: 'lazienka',
    size: { w: 0.6, d: 0.62, h: 1.75 }, range: { w: [0.58, 0.65], d: [0.55, 0.68], h: [1.65, 1.85] }, color: '#f4f4f1',
    build(b, w, d, h) {
      const hu = h / 2;
      const s = Math.min(w, hu) * 0.5;
      for (const z0 of [0, hu]) {
        b.box(0, 0.012, z0, w, d, z0 === 0 ? hu - 0.006 : h, 'main');
        b.box(w / 2 - s / 2, 0, z0 + hu * 0.15, w / 2 + s / 2, 0.012, z0 + hu * 0.15 + s, 'black'); // drzwiczki
        b.box(0.03, 0, z0 + hu - 0.12, w - 0.03, 0.012, z0 + hu - 0.03, 'steel'); // panel
      }
    },
  },

  // ---- wiatrołap / przedpokój
  {
    id: 'konsola', name: 'Konsola z drewnianym blatem', category: 'przedpokoj',
    size: { w: 1.0, d: 0.35, h: 0.8 }, range: { w: [0.6, 1.6], d: [0.25, 0.45], h: [0.7, 0.95] },
    color: OAK, color2: LOFT, colorNames: ['Blat i półka', 'Stelaż'],
    build(b, w, d, h) {
      b.box(0, 0, h - 0.04, w, d, h, 'main');
      legs(b, w, d, 0, h - 0.04, 0.025, 0.02, 'second');
      b.box(0.03, 0.03, 0.16, w - 0.03, d - 0.03, 0.185, 'main'); // dolna półka
      b.box(0.045, 0.02, h - 0.08, w - 0.045, 0.045, h - 0.04, 'second');
      b.box(0.045, d - 0.045, h - 0.08, w - 0.045, d - 0.02, h - 0.04, 'second');
    },
  },
  {
    id: 'siedzisko', name: 'Siedzisko-ławka z półką na buty', category: 'przedpokoj',
    size: { w: 1.1, d: 0.4, h: 0.46 }, range: { w: [0.6, 2.0], d: [0.3, 0.55], h: [0.4, 0.55] },
    color: OAK, color2: WARM_WHITE, colorNames: ['Blat', 'Korpus'],
    build(b, w, d, h) {
      const t = 0.02;
      const top = h - 0.04;
      b.box(0, 0, top, w, d, h, 'main');
      b.box(0.01, 0.01, 0, 0.01 + t, d, top, 'second');
      b.box(w - 0.01 - t, 0.01, 0, w - 0.01, d, top, 'second');
      b.box(0.01 + t, 0.01, 0.04, w - 0.01 - t, d, 0.04 + t, 'second'); // dno
      b.box(0.01 + t, d - 0.012, 0.04 + t, w - 0.01 - t, d, top, 'second-dark'); // plecy
      const n = cl(Math.round(w / 0.45), 1, 4);
      for (let i = 1; i < n; i++) b.box((w * i) / n - t / 2, 0.01, 0.04 + t, (w * i) / n + t / 2, d - 0.012, top, 'second');
    },
  },
  {
    id: 'lustro', name: 'Lustro w czarnej ramie', category: 'przedpokoj',
    size: { w: 0.6, d: 0.04, h: 1.2 }, range: { w: [0.3, 1.6], d: [0.02, 0.06], h: [0.3, 2.2] }, color: LOFT,
    mount: 0.6,
    build(b, w, d, h) {
      const f = 0.03;
      b.box(0, 0, 0, f, d, h, 'main');
      b.box(w - f, 0, 0, w, d, h, 'main');
      b.box(f, 0, h - f, w - f, d, h, 'main');
      b.box(f, 0, 0, w - f, d, f, 'main');
      b.box(f, d * 0.35, f, w - f, d, h - f, 'mirror');
    },
  },
  {
    id: 'lustro-okragle', name: 'Lustro okrągłe w czarnej ramie', category: 'przedpokoj',
    size: { w: 0.8, d: 0.04, h: 0.8 }, range: { w: [0.4, 1.2], d: [0.02, 0.06], h: [0.4, 1.2] }, color: LOFT,
    mount: 1.1,
    build(b, w, d, h) {
      b.discY(w / 2, h / 2, w / 2, h / 2, d * 0.3, d, 'main');
      b.discY(w / 2, h / 2, w * 0.46, h * 0.46, 0, d * 0.3, 'mirror');
    },
  },
  {
    id: 'wieszak', name: 'Wieszak ścienny (listwa z hakami)', category: 'przedpokoj',
    size: { w: 0.9, d: 0.08, h: 0.14 }, range: { w: [0.4, 1.8], d: [0.05, 0.12], h: [0.08, 0.3] }, color: OAK,
    mount: 1.6,
    build(b, w, d, h) {
      b.box(0, d - 0.02, 0, w, d, h, 'main');
      const n = cl(Math.round(w / 0.2), 2, 7);
      for (let i = 0; i < n; i++) {
        const x = (w * (i + 0.5)) / n;
        b.box(x - 0.012, 0, h * 0.25, x + 0.012, d - 0.02, h * 0.25 + 0.025, 'black');
        b.box(x - 0.012, 0, h * 0.25 + 0.025, x + 0.012, 0.015, h * 0.25 + 0.05, 'black');
      }
    },
  },
  {
    id: 'wieszak-stojacy', name: 'Wieszak stojący', category: 'przedpokoj',
    size: { w: 0.5, d: 0.5, h: 1.75 }, range: { w: [0.4, 0.6], d: [0.4, 0.6], h: [1.6, 1.9] }, color: LOFT,
    build(b, w, d, h) {
      b.ell(w / 2, d / 2, w * 0.4, d * 0.4, 0, 0.03, 'main');
      b.cyl(w / 2, d / 2, 0.02, 0.03, h, 'main');
      b.box(0, d / 2 - 0.012, h - 0.2, w, d / 2 + 0.012, h - 0.175, 'main');
      b.box(w / 2 - 0.012, 0, h - 0.12, w / 2 + 0.012, d, h - 0.095, 'main');
    },
  },

  // ---- biuro
  {
    id: 'kanapa-rozkladana', name: 'Kanapa rozkładana 2-osobowa', category: 'biuro',
    size: { w: 1.5, d: 0.95, h: 0.85 }, range: { w: [1.3, 1.8], d: [0.85, 1.05], h: [0.75, 0.95] }, color: '#b7a98f',
    build(b, w, d, h) {
      const arm = 0.1;
      const back = 0.2;
      const seat = 0.44;
      b.box(0, 0.02, 0, w, d, 0.2, 'dark'); // skrzynia na pościel
      b.box(arm, 0, 0.2, w - arm, d - back, seat, 'main');
      b.box(0, d - back, 0.2, w, d, h, 'main');
      b.box(0, 0, 0.2, arm, d - back, seat + 0.16, 'main');
      b.box(w - arm, 0, 0.2, w, d - back, seat + 0.16, 'main');
      const cw = (w - 2 * arm) / 2;
      for (let i = 0; i < 2; i++) b.box(arm + i * cw + 0.02, d - back - 0.14, seat, arm + (i + 1) * cw - 0.02, d - back, h - 0.06, 'light');
    },
  },
  {
    id: 'krzeslo-biurowe', name: 'Krzesło biurowe', category: 'biuro',
    size: { w: 0.62, d: 0.62, h: 1.1 }, range: { w: [0.55, 0.7], d: [0.55, 0.7], h: [0.9, 1.3] }, color: '#3d4045',
    build(b, w, d, h) {
      const c = w / 2;
      const e = d / 2;
      const s = Math.min(0.5, h * 0.45); // siedzisko
      b.box(0, e - 0.025, 0.03, w, e + 0.025, 0.07, 'black'); // podstawa (krzyżak)
      b.box(c - 0.025, 0, 0.03, c + 0.025, d, 0.07, 'black');
      b.cyl(c, e, 0.03, 0.07, s - 0.06, 'steel');
      b.box(c - 0.23, e - 0.23, s - 0.06, c + 0.23, e + 0.22, s, 'main');
      b.box(c - 0.21, e + 0.2, s + 0.1, c + 0.21, e + 0.25, h, 'main'); // oparcie
      b.box(c - 0.03, e + 0.21, s - 0.04, c + 0.03, e + 0.25, s + 0.1, 'black');
      for (const m of [b, mirrored(b, w)]) {
        m.box(c - 0.27, e - 0.12, s + 0.18, c - 0.22, e + 0.15, s + 0.21, 'black'); // podłokietnik
        m.box(c - 0.26, e, s - 0.03, c - 0.23, e + 0.03, s + 0.18, 'black');
      }
    },
  },
  {
    // stawiany na biurku: „Od podłogi” = wysokość blatu
    id: 'monitor', name: 'Monitor (na biurko)', category: 'biuro',
    size: { w: 0.62, d: 0.2, h: 0.45 }, range: { w: [0.4, 1.0], d: [0.12, 0.3], h: [0.3, 0.65] }, color: LOFT,
    mount: 0.75,
    build(b, w, d, h) {
      const ph = Math.min(h - 0.08, w * 0.5625 + 0.03); // wysokość ekranu
      const y = d * 0.4;
      b.box(w / 2 - 0.12, d * 0.2, 0, w / 2 + 0.12, d, 0.015, 'main');
      b.box(w / 2 - 0.03, d * 0.6, 0.015, w / 2 + 0.03, d * 0.6 + 0.03, h - ph * 0.5, 'main');
      b.box(0, y, h - ph, w, y + 0.03, h, 'main');
      b.box(0.012, y - 0.003, h - ph + 0.012, w - 0.012, y, h - 0.012, 'screen');
    },
  },
  {
    id: 'biurko-komputerowe', name: 'Biurko z monitorem', category: 'biuro',
    size: { w: 1.5, d: 0.7, h: 1.25 }, range: { w: [1.1, 2.0], d: [0.6, 0.85], h: [1.1, 1.4] },
    color: OAK, color2: LOFT, colorNames: ['Blat i szuflady', 'Stelaż'],
    build(b, w, d, h) {
      const top = 0.75; // blat na stałej wysokości; h = wierzch monitora
      b.box(0, 0, top - 0.04, w, d, top, 'main');
      for (const x of [0.03, w - 0.08]) {
        b.box(x, 0.05, 0, x + 0.05, 0.1, top - 0.04, 'second');
        b.box(x, d - 0.1, 0, x + 0.05, d - 0.05, top - 0.04, 'second');
        b.box(x, 0.1, top - 0.08, x + 0.05, d - 0.1, top - 0.04, 'second');
      }
      b.box(0.08, d - 0.09, 0.45, w - 0.08, d - 0.07, 0.6, 'second'); // osłona z tyłu
      b.box(w - 0.5, 0.075, 0.3, w - 0.1, d - 0.1, top - 0.04, 'dark'); // kontener z szufladami
      b.box(w - 0.5, 0.06, 0.3, w - 0.1, 0.075, 0.5, 'main');
      b.box(w - 0.5, 0.06, 0.506, w - 0.1, 0.075, top - 0.04, 'main');
      const mx = w * 0.42;
      const mw = Math.min(0.7, w * 0.5);
      const ph = Math.min(h - top - 0.08, mw * 0.5625 + 0.03);
      b.box(mx - 0.12, d - 0.3, top, mx + 0.12, d - 0.1, top + 0.015, 'black');
      b.box(mx - 0.03, d - 0.16, top + 0.015, mx + 0.03, d - 0.13, h - ph * 0.5, 'black');
      b.box(mx - mw / 2, d - 0.2, h - ph, mx + mw / 2, d - 0.17, h, 'black');
      b.box(mx - mw / 2 + 0.012, d - 0.203, h - ph + 0.012, mx + mw / 2 - 0.012, d - 0.2, h - 0.012, 'screen');
      b.box(mx - 0.22, 0.12, top, mx + 0.22, 0.27, top + 0.015, 'black'); // klawiatura
    },
  },

  // ---- pokój dziecka
  {
    id: 'lozeczko', name: 'Łóżeczko dziecięce 60 × 120', category: 'dzieci',
    size: { w: 0.66, d: 1.26, h: 0.9 }, range: { w: [0.6, 0.8], d: [1.2, 1.5], h: [0.8, 1.0] }, color: WARM_WHITE,
    build(b, w, d, h) {
      const p = 0.04;
      for (const x of [0, w - p]) for (const y of [0, d - p]) b.box(x, y, 0, x + p, y + p, h, 'main');
      b.box(p, 0.01, 0.15, w - p, 0.03, h - 0.03, 'main'); // szczyty pełne
      b.box(p, d - 0.03, 0.15, w - p, d - 0.01, h - 0.03, 'main');
      b.box(0.02, 0.02, 0.28, w - 0.02, d - 0.02, 0.32, 'dark'); // stelaż
      b.box(0.04, 0.04, 0.32, w - 0.04, d - 0.04, 0.4, 'mattress');
      for (const m of [b, mirrored(b, w)]) {
        m.box(0.005, p, h - 0.07, 0.035, d - p, h - 0.03, 'main'); // poręcz
        for (let i = 1; i <= 5; i++) {
          const y = p + ((d - 2 * p) * i) / 6;
          m.box(0.012, y - 0.01, 0.32, 0.028, y + 0.01, h - 0.07, 'main'); // szczebelki
        }
      }
    },
  },
  {
    id: 'lozko-domek', name: 'Łóżko-domek 90 × 200', category: 'dzieci',
    size: { w: 1.0, d: 2.1, h: 1.7 }, range: { w: [0.9, 1.1], d: [1.7, 2.2], h: [1.4, 2.0] },
    color: '#e3cfae', color2: '#d9b5a8', colorNames: ['Rama', 'Narzuta'],
    build(b, w, d, h) {
      const p = 0.05;
      const eave = h * 0.68; // wysokość okapu „dachu”
      for (const x of [0, w - p]) for (const y of [0, d - p]) b.box(x, y, 0, x + p, y + p, eave, 'main');
      b.box(0.02, 0.02, 0.12, w - 0.02, d - 0.02, 0.24, 'main'); // rama
      b.box(0.05, 0.05, 0.24, w - 0.05, d - 0.05, 0.36, 'mattress');
      b.box(0.15, d - 0.5, 0.36, w - 0.15, d - 0.12, 0.44, 'white'); // poduszka
      b.box(0.05, 0.05, 0.36, w - 0.05, d * 0.55, 0.385, 'second');
      b.box(p, d - 0.035, 0.24, w - p, d - 0.015, 0.7, 'main'); // zagłówek
      b.box(0, p, eave - p, p, d - p, eave, 'main'); // płatwie
      b.box(w - p, p, eave - p, w, d - p, eave, 'main');
      b.box(p, 0, eave - p, w - p, p, eave, 'main'); // jętki szczytów
      b.box(p, d - p, eave - p, w - p, d, eave, 'main');
      b.box(w / 2 - p / 2, 0, h - p, w / 2 + p / 2, d, h, 'main'); // kalenica
      for (const y of [p / 2, d - p / 2]) {
        b.beam(p / 2, y, eave, w / 2, y, h - p / 2, p, 'main'); // krokwie
        b.beam(w - p / 2, y, eave, w / 2, y, h - p / 2, p, 'main');
      }
    },
  },
  {
    id: 'komoda-przewijak', name: 'Komoda z przewijakiem', category: 'dzieci',
    size: { w: 0.9, d: 0.75, h: 0.98 }, range: { w: [0.7, 1.2], d: [0.45, 0.8], h: [0.85, 1.05] },
    color: WARM_WHITE, color2: OAK, colorNames: ['Komoda', 'Blat i ramka'],
    build(b, w, d, h) {
      const ct = h - 0.1; // wierzch blatu
      cabinet(b, w, d, ct - 0.025, cl(Math.round(w / 0.5), 1, 2), 3, 0.06);
      b.box(0, 0, ct - 0.025, w, d, ct, 'second');
      b.box(0, 0, ct, 0.02, d, h, 'second'); // ramka przewijaka
      b.box(w - 0.02, 0, ct, w, d, h, 'second');
      b.box(0.02, d - 0.02, ct, w - 0.02, d, h, 'second');
      b.box(0.03, 0.03, ct, w - 0.03, d - 0.03, ct + 0.04, 'mattress');
    },
  },
  {
    // stolik pośrodku, krzesełka z lewej i z prawej (oparciami na zewnątrz)
    id: 'stolik-dzieciecy', name: 'Stolik dziecięcy z 2 krzesełkami', category: 'dzieci',
    size: { w: 1.2, d: 0.6, h: 0.55 }, range: { w: [1.0, 1.5], d: [0.5, 0.8], h: [0.5, 0.65] },
    color: '#e3cfae', color2: '#a9b8a0', colorNames: ['Stolik', 'Krzesełka'],
    build(b, w, d, h) {
      const th = 0.48;
      const tw = Math.min(0.7, w - 0.64);
      const x0 = w / 2 - tw / 2;
      const x1 = w / 2 + tw / 2;
      const e = d / 2;
      const cw = Math.min(0.32, d - 0.1);
      b.box(x0, 0, th - 0.03, x1, d, th, 'main');
      for (const x of [x0 + 0.03, x1 - 0.07]) for (const y of [0.03, d - 0.07]) b.box(x, y, 0, x + 0.04, y + 0.04, th - 0.03, 'dark');
      for (const m of [b, mirrored(b, w)]) {
        m.box(0.03, e - cw / 2, 0.26, 0.33, e + cw / 2, 0.29, 'second');
        m.box(0, e - cw / 2, 0.29, 0.03, e + cw / 2, h, 'second');
        for (const x of [0.03, 0.3]) for (const y of [e - cw / 2, e + cw / 2 - 0.03]) m.box(x, y, 0, x + 0.03, y + 0.03, 0.26, 'second-dark');
      }
    },
  },
  {
    id: 'regal-zabawki', name: 'Niski regał na zabawki', category: 'dzieci',
    size: { w: 1.2, d: 0.35, h: 0.8 }, range: { w: [0.6, 1.8], d: [0.28, 0.45], h: [0.5, 1.1] },
    color: WARM_WHITE, color2: '#c9ad80', colorNames: ['Regał', 'Pojemniki'],
    build(b, w, d, h) {
      const t = 0.02;
      const cols = cl(Math.round(w / 0.4), 2, 4);
      const rows = cl(Math.round(h / 0.38), 1, 3);
      const z0 = 0.04 + t; // wierzch dna
      const cell = (h - t - z0) / rows;
      b.box(0, 0, 0, t, d, h, 'main');
      b.box(w - t, 0, 0, w, d, h, 'main');
      b.box(t, 0, h - t, w - t, d, h, 'main');
      b.box(t, 0, 0.04, w - t, d, z0, 'main');
      b.box(t, d - 0.01, z0, w - t, d, h - t, 'dark');
      for (let i = 1; i < cols; i++) b.box((w * i) / cols - t / 2, 0, z0, (w * i) / cols + t / 2, d - 0.01, h - t, 'main');
      for (let i = 1; i < rows; i++) b.box(t, 0.002, z0 + cell * i - t / 2, w - t, d - 0.01, z0 + cell * i + t / 2, 'main');
      for (let i = 0; i < cols; i++) b.box((w * i) / cols + 0.03, 0.01, z0 + 0.005, (w * (i + 1)) / cols - 0.03, d - 0.03, z0 + cell * 0.72, 'second');
    },
  },

  // ---- garaż i siłownia
  {
    // perkusista siedzi od TYŁU (stołek przy y = d), bęben basowy patrzy na FRONT; całość na dywaniku
    id: 'perkusja', name: 'Perkusja (zestaw)', category: 'garaz',
    size: { w: 1.5, d: 1.3, h: 1.3 }, range: { w: [1.4, 2.0], d: [1.0, 1.6], h: [1.1, 1.6] }, color: '#7d3b2b',
    build(b, w, d, h) {
      const cx = w / 2;
      const by0 = d * 0.08 + 0.01; // przód bębna basowego
      const by1 = by0 + 0.4;
      b.box(0, 0, 0, w, d, 0.01, 'rubber'); // dywanik pod zestaw
      b.cylY(cx, 0.29, 0.28, by0, by1, 'main'); // bęben basowy
      b.cylY(cx, 0.29, 0.26, by0 - 0.01, by0, 'white');
      for (const [dx, r] of [[-0.17, 0.14], [0.17, 0.15]]) {
        b.cyl(cx + dx, by0 + 0.2, r, 0.62, 0.8, 'main'); // tomy
        b.cyl(cx + dx, by0 + 0.2, r - 0.01, 0.8, 0.806, 'white');
      }
      b.cyl(cx + 0.45, by1 + 0.25, 0.19, 0.28, 0.66, 'main'); // floor tom
      b.cyl(cx + 0.45, by1 + 0.25, 0.18, 0.66, 0.666, 'white');
      b.cyl(cx - 0.4, by1 + 0.2, 0.015, 0.01, 0.56, 'steel'); // werbel na statywie
      b.cyl(cx - 0.4, by1 + 0.2, 0.17, 0.56, 0.69, 'steel');
      b.cyl(cx - 0.4, by1 + 0.2, 0.16, 0.69, 0.696, 'white');
      b.cyl(cx - 0.52, by1 + 0.1, 0.012, 0.01, 0.9, 'steel'); // hi-hat
      b.cyl(cx - 0.52, by1 + 0.1, 0.17, 0.9, 0.92, 'brass');
      b.cyl(cx - 0.45, by0 + 0.15, 0.012, 0.01, h - 0.15, 'steel'); // crash
      b.cyl(cx - 0.45, by0 + 0.15, 0.2, h - 0.15, h - 0.135, 'brass');
      b.cyl(cx + 0.45, by0 + 0.2, 0.012, 0.01, h - 0.015, 'steel'); // ride
      b.cyl(cx + 0.45, by0 + 0.2, 0.24, h - 0.015, h, 'brass');
      b.cyl(cx, d - 0.2, 0.02, 0.01, 0.5, 'steel'); // stołek
      b.cyl(cx, d - 0.2, 0.17, 0.5, 0.58, 'black');
    },
  },
  {
    // szerokość = DŁUGOŚĆ roweru; przednie koło z prawej (x = w), kierownica na całą głębokość
    id: 'rower', name: 'Rower', category: 'garaz',
    size: { w: 1.75, d: 0.6, h: 1.05 }, range: { w: [1.2, 1.9], d: [0.4, 0.7], h: [0.7, 1.15] }, color: '#b0563f',
    build(b, w, d, h) {
      const yc = d / 2;
      const r = Math.min(0.34, h * 0.33, w * 0.2); // koło
      const t = 0.035;
      for (const x of [r, w - r]) {
        b.cylY(x, r, r, yc - 0.02, yc + 0.02, 'rubber');
        b.cylY(x, r, r * 0.82, yc - 0.023, yc + 0.023, 'shade');
      }
      const bx = w * 0.45; // suport
      const bz = r * 0.85;
      const sx = w * 0.38; // siodło
      const sz = h * 0.8;
      const hx = w - r - 0.14; // główka ramy
      b.beam(r, yc, r, bx, yc, bz, t, 'main');
      b.beam(bx, yc, bz, sx, yc, sz, t, 'main');
      b.beam(r, yc, r, sx + 0.01, yc, h * 0.7, t, 'main');
      b.beam(sx + 0.01, yc, h * 0.72, hx, yc, h * 0.8, t, 'main');
      b.beam(bx, yc, bz, hx + 0.01, yc, h * 0.72, t, 'main');
      b.beam(w - r, yc, r, hx - 0.01, yc, h - 0.06, t, 'steel'); // widelec
      b.box(sx - 0.12, yc - 0.06, sz, sx + 0.1, yc + 0.06, sz + 0.04, 'black');
      b.box(hx - 0.03, 0, h - 0.04, hx + 0.01, d, h, 'black'); // kierownica
      b.cylY(bx, bz, 0.08, yc + 0.02, yc + 0.03, 'steel'); // zębatka
    },
  },
  {
    id: 'stojak-rowery', name: 'Stojak na rowery', category: 'garaz',
    size: { w: 1.2, d: 0.5, h: 0.45 }, range: { w: [0.6, 2.4], d: [0.35, 0.6], h: [0.3, 0.6] }, color: LOFT,
    build(b, w, d, h) {
      b.box(0, 0.02, 0, w, 0.06, 0.03, 'main');
      b.box(0, d - 0.06, 0, w, d - 0.02, 0.03, 'main');
      const n = cl(Math.round(w / 0.4), 1, 5); // stanowiska
      for (let i = 0; i < n; i++) {
        for (const s of [-0.03, 0.03]) {
          const x = (w * (i + 0.5)) / n + s;
          b.beam(x, 0.04, 0.04, x, d - 0.04, h - 0.02, 0.02, 'main');
          b.box(x - 0.01, d - 0.05, 0.03, x + 0.01, d - 0.03, h, 'main');
        }
      }
    },
  },
  {
    // szerokość × DŁUGOŚĆ (głębokość); przód quada (kierownica, światła) od FRONTU
    id: 'quad', name: 'Quad', category: 'garaz',
    size: { w: 1.15, d: 1.9, h: 1.15 }, range: { w: [0.9, 1.3], d: [1.5, 2.2], h: [0.9, 1.3] }, color: '#b0472f',
    build(b, w, d, h) {
      const r = Math.min(0.28, h * 0.26);
      const tw = 0.24; // szerokość opony
      const yF = r + 0.02;
      const yR = d - r - 0.02;
      for (const y of [yF, yR]) {
        b.cylX(y, r, r, 0, tw, 'rubber');
        b.cylX(y, r, r, w - tw, w, 'rubber');
        b.box(0.02, y - r * 0.9, 2 * r + 0.03, w - 0.02, y + r * 0.9, 2 * r + 0.09, 'main'); // błotniki
      }
      b.box(tw + 0.02, yF - 0.1, r * 0.6, w - tw - 0.02, yR + 0.1, r * 1.3, 'black'); // rama
      b.box(w * 0.3, yF - 0.05, r * 1.3, w * 0.7, yR + 0.05, 2 * r + 0.12, 'main');
      b.box(w * 0.36, d * 0.28, 2 * r + 0.12, w * 0.64, d * 0.45, 2 * r + 0.24, 'main'); // zbiornik
      b.box(w * 0.34, d * 0.45, 2 * r + 0.12, w * 0.66, yR + 0.1, 2 * r + 0.2, 'black'); // siedzenie
      b.beam(w / 2, d * 0.3, 2 * r + 0.2, w / 2, d * 0.24, h - 0.03, 0.03, 'steel');
      b.box(w * 0.18, d * 0.24 - 0.02, h - 0.04, w * 0.82, d * 0.24 + 0.02, h, 'black'); // kierownica
      b.box(w * 0.2, 0.02, 2 * r + 0.1, w * 0.8, yF + 0.1, 2 * r + 0.12, 'steel'); // bagażniki
      b.box(w * 0.2, yR - 0.05, 2 * r + 0.21, w * 0.8, d - 0.02, 2 * r + 0.23, 'steel');
      for (const fx of [0.3, 0.62]) b.box(w * fx, yF - 0.065, r * 1.5, w * (fx + 0.08), yF - 0.05, r * 1.5 + 0.06, 'white'); // światła
    },
  },
  {
    // sztanga wzdłuż szerokości, głowa ćwiczącego od TYŁU (pod sztangą)
    id: 'lawka-sztanga', name: 'Ławka ze stojakiem i sztangą', category: 'garaz',
    size: { w: 1.8, d: 1.6, h: 1.25 }, range: { w: [1.5, 2.2], d: [1.3, 1.9], h: [1.0, 1.5] },
    color: '#3d4045', color2: '#6b4a32', colorNames: ['Stelaż', 'Tapicerka'],
    build(b, w, d, h) {
      const cx = w / 2;
      const zb = Math.min(1.05, h - 0.25); // wysokość sztangi
      for (const m of [b, mirrored(b, w)]) {
        m.box(cx - 0.58, d - 0.38, 0, cx - 0.52, d - 0.32, h, 'main'); // słupek stojaka
        m.box(cx - 0.58, d - 0.7, 0, cx - 0.52, d, 0.05, 'main'); // stopa
        m.cylX(d - 0.42, zb, 0.21, cx - 0.67, cx - 0.62, 'rubber'); // obciążenia
        m.cylX(d - 0.42, zb, 0.16, cx - 0.7, cx - 0.67, 'rubber');
      }
      b.box(cx - 0.52, d - 0.38, 0.3, cx + 0.52, d - 0.32, 0.36, 'main');
      b.cylX(d - 0.42, zb, 0.015, 0, w, 'steel'); // gryf
      b.box(cx - 0.14, 0.05, 0.42, cx + 0.14, d - 0.25, 0.5, 'second'); // ławka
      b.box(cx - 0.2, 0.1, 0, cx + 0.2, 0.16, 0.42, 'main');
      b.box(cx - 0.2, d - 0.5, 0, cx + 0.2, d - 0.44, 0.42, 'main');
      b.box(cx - 0.03, 0.16, 0.36, cx + 0.03, d - 0.5, 0.42, 'main');
    },
  },
  {
    // stos obciążeń od TYŁU (przy ścianie), siedzisko i drążek wyciągu od FRONTU
    id: 'atlas', name: 'Atlas do ćwiczeń', category: 'garaz',
    size: { w: 1.1, d: 1.5, h: 2.1 }, range: { w: [0.9, 1.5], d: [1.2, 2.0], h: [1.9, 2.3] },
    color: '#3d4045', color2: '#6b4a32', colorNames: ['Stelaż', 'Tapicerka'],
    build(b, w, d, h) {
      const cx = w / 2;
      const f = 0.06;
      const sy = d * 0.3; // przód siedziska
      for (const m of [b, mirrored(b, w)]) {
        m.box(0, 0, 0, f, d - f, f, 'main');
        m.box(0, d - f, 0, f, d, h, 'main');
        m.cyl(cx - 0.1, d - 0.15, 0.012, 1.1, h - f, 'steel'); // prowadnice stosu
      }
      b.box(f, d - f, 0, w - f, d, f, 'main');
      b.box(f, d - f, h - f, w - f, d, h, 'main');
      b.box(cx - 0.14, d - 0.22, 0.1, cx + 0.14, d - 0.08, 1.1, 'black'); // stos
      b.box(cx - 0.03, d * 0.35, h - f, cx + 0.03, d - f, h, 'main'); // wysięgnik
      b.cyl(cx, d * 0.38, 0.006, h - 0.5, h - f, 'black'); // linka
      b.cylX(d * 0.38, h - 0.5, 0.015, cx - 0.45, cx + 0.45, 'steel'); // drążek
      b.box(cx - 0.03, d * 0.25, 0, cx + 0.03, d - f, f, 'main');
      b.box(cx - 0.03, sy + 0.15, f, cx + 0.03, sy + 0.21, 0.42, 'main');
      b.box(cx - 0.18, sy, 0.42, cx + 0.18, sy + 0.36, 0.5, 'second');
      b.box(cx - 0.15, sy + 0.36, 0.5, cx + 0.15, sy + 0.44, 1.1, 'second');
    },
  },
  {
    // konsola od TYŁU (biegnący patrzy w stronę ściany)
    id: 'bieznia', name: 'Bieżnia', category: 'garaz',
    size: { w: 0.8, d: 1.7, h: 1.35 }, range: { w: [0.65, 0.95], d: [1.4, 2.0], h: [1.1, 1.5] }, color: '#4a4d52',
    build(b, w, d, h) {
      b.box(0.03, 0, 0.06, w - 0.03, d - 0.1, 0.16, 'main'); // pokład
      b.box(0.1, 0.03, 0.16, w - 0.1, d - 0.4, 0.17, 'black'); // pas
      b.box(0.03, d - 0.4, 0.16, w - 0.03, d - 0.1, 0.26, 'dark'); // osłona silnika
      b.box(0, d - 0.12, 0, w, d - 0.02, 0.06, 'main');
      b.box(0.03, 0.02, 0, w - 0.03, 0.08, 0.06, 'main');
      b.box(0.02, d - 0.2, h - 0.14, w - 0.02, d - 0.02, h, 'black'); // konsola
      for (const m of [b, mirrored(b, w)]) {
        m.beam(0.045, d - 0.25, 0.2, 0.045, d - 0.11, h - 0.14, 0.05, 'main');
        m.box(0.02, d - 0.6, h - 0.3, 0.06, d - 0.2, h - 0.26, 'black'); // poręcz
      }
    },
  },
  {
    id: 'rower-stacjonarny', name: 'Rower stacjonarny', category: 'garaz',
    size: { w: 0.55, d: 1.1, h: 1.3 }, range: { w: [0.45, 0.65], d: [0.9, 1.3], h: [1.1, 1.4] }, color: '#4a4d52',
    build(b, w, d, h) {
      const cx = w / 2;
      const sy = d * 0.3; // siodło
      const sz = h * 0.72;
      b.box(0, 0.05, 0, w, 0.11, 0.05, 'main');
      b.box(0, d - 0.11, 0, w, d - 0.05, 0.05, 'main');
      b.box(cx - 0.03, 0.11, 0.02, cx + 0.03, d - 0.11, 0.08, 'main');
      b.cylX(d - 0.32, 0.31, 0.24, cx - 0.03, cx + 0.03, 'black'); // koło zamachowe
      b.cylX(d * 0.5, 0.3, 0.05, cx - 0.12, cx + 0.12, 'steel'); // korby
      b.beam(cx, d * 0.45, 0.08, cx, d - 0.32, 0.45, 0.04, 'main');
      b.beam(cx, d * 0.45, 0.08, cx, sy, sz, 0.04, 'main');
      b.beam(cx, d - 0.32, 0.45, cx, d - 0.2, h - 0.05, 0.04, 'main');
      b.box(cx - 0.09, sy - 0.13, sz, cx + 0.09, sy + 0.1, sz + 0.05, 'black');
      b.box(cx - 0.22, d - 0.24, h - 0.04, cx + 0.22, d - 0.16, h, 'black'); // kierownica
    },
  },
  {
    id: 'hantle', name: 'Stojak z hantlami', category: 'garaz',
    size: { w: 1.0, d: 0.45, h: 0.8 }, range: { w: [0.7, 1.4], d: [0.4, 0.55], h: [0.7, 0.95] }, color: '#3d4045',
    build(b, w, d, h) {
      b.box(0, 0, 0, 0.04, d, h, 'main');
      b.box(w - 0.04, 0, 0, w, d, h, 'main');
      const n = cl(Math.floor((w - 0.12) / 0.22), 2, 5);
      for (const z of [h * 0.4, h - 0.12]) {
        b.box(0.04, 0.03, z - 0.03, w - 0.04, d - 0.03, z, 'main');
        for (let i = 0; i < n; i++) b.cylY(0.04 + ((w - 0.08) * (i + 0.5)) / n, z + 0.05, 0.05, 0.06, d - 0.06, 'rubber');
      }
    },
  },
  {
    id: 'mata', name: 'Mata do ćwiczeń', category: 'garaz',
    size: { w: 1.8, d: 0.6, h: 0.015 }, range: { w: [1.0, 3.0], d: [0.5, 2.0], h: [0.008, 0.05] }, color: '#5f6f66',
    build(b, w, d, h) {
      b.box(0, 0, 0, w, d, h * 0.7, 'dark');
      b.box(0.02, 0.02, 0, w - 0.02, d - 0.02, h, 'main');
    },
  },

  // ---- ścianki szklane i lamele (cienkie; stoją w osi przejścia, między ścianami)
  {
    // loft: czarna stalowa rama ze szprosami, dwa skrzydła pośrodku, przy szerokości ponad 1,9 m stałe pola po bokach
    id: 'scianka-szklana-drzwi', name: 'Ścianka szklana z drzwiami dwuskrzydłowymi', category: 'scianki',
    size: { w: 2.0, d: 0.08, h: 2.7 }, range: { w: [1.0, 4.0], d: [0.06, 0.1], h: [2.0, 2.7] }, color: LOFT,
    build(b, w, d, h) {
      const t = 0.045; // profil ramy
      const m = 0.025; // szpros
      const ym0 = d * 0.2;
      const ym1 = d * 0.8;
      const doorH = h > 2.4 ? 2.1 : h - t; // nad drzwiami naświetle
      const leaf = Math.min(0.9, (w - 2 * t) / 2); // szerokość skrzydła
      const xa = (w - 2 * leaf) / 2; // początek i koniec drzwi
      const xb = w - xa;
      b.box(t, d / 2 - 0.005, 0.02, w - t, d / 2 + 0.005, h - t, 'glass');
      frame(b, w, d, h, t, 'main');
      if (xa > t + 0.12) {
        b.box(xa - t, 0, 0.02, xa, d, h - t, 'main'); // słupki ościeżnicy
        b.box(xb, 0, 0.02, xb + t, d, h - t, 'main');
        if (xa - t > 0.7) for (const x of [xa / 2, w - xa / 2]) b.box(x - m / 2, ym0, 0.02, x + m / 2, ym1, h - t, 'main');
      }
      if (doorH < h - t - 0.1) b.box(t, 0, doorH, w - t, d, doorH + t, 'main'); // ślemię
      b.box(w / 2 - 0.035, 0, 0.02, w / 2 + 0.035, d, doorH, 'main'); // styk skrzydeł
      for (let i = 1; i <= 3; i++) {
        const z = 0.02 + ((doorH - 0.02) * i) / 4;
        b.box(t, ym0, z - m / 2, w - t, ym1, z + m / 2, 'main'); // szprosy poziome
      }
      for (const x of [xa + leaf / 2, xb - leaf / 2]) b.box(x - m / 2, ym0, 0.02, x + m / 2, ym1, h - t, 'main'); // szprosy pionowe
      for (const x of [w / 2 - 0.075, w / 2 + 0.075]) b.box(x - 0.01, 0, 0.9, x + 0.01, d, 1.25, 'steel'); // pochwyty
    },
  },
  {
    id: 'scianka-szklana', name: 'Ścianka szklana stała', category: 'scianki',
    size: { w: 1.2, d: 0.06, h: 2.7 }, range: { w: [0.3, 4.0], d: [0.04, 0.1], h: [0.8, 2.7] }, color: LOFT,
    build(b, w, d, h) {
      const t = 0.04;
      const m = 0.025;
      b.box(t, d / 2 - 0.005, 0.02, w - t, d / 2 + 0.005, h - t, 'glass');
      frame(b, w, d, h, t, 'main');
      const nv = cl(Math.round(w / 0.6) - 1, 0, 5);
      for (let i = 1; i <= nv; i++) b.box((w * i) / (nv + 1) - m / 2, d * 0.2, 0.02, (w * i) / (nv + 1) + m / 2, d * 0.8, h - t, 'main');
      const nh = cl(Math.round(h / 0.7) - 1, 0, 3);
      for (let i = 1; i <= nh; i++) b.box(t, d * 0.2, (h * i) / (nh + 1) - m / 2, w - t, d * 0.8, (h * i) / (nh + 1) + m / 2, 'main');
    },
  },
  {
    id: 'lamele', name: 'Lamele pionowe (przegroda)', category: 'scianki',
    size: { w: 2.0, d: 0.05, h: 2.7 }, range: { w: [0.3, 4.0], d: [0.03, 0.1], h: [1.0, 2.7] }, color: LOFT,
    build(b, w, d, h) {
      b.box(0, 0, 0, w, d, 0.03, 'main');
      b.box(0, 0, h - 0.03, w, d, h, 'main');
      const n = cl(Math.round(w / 0.12), 2, 22);
      for (let i = 0; i < n; i++) {
        const x = ((w - 0.04) * i) / (n - 1);
        b.box(x, 0, 0.03, x + 0.04, d, h - 0.03, 'main');
      }
    },
  },

  // ---- dywany i rośliny (dywan jest płaski; meble stawia się na nim normalnie)
  {
    id: 'dywan', name: 'Dywan prostokątny', category: 'dekoracje',
    size: { w: 2.4, d: 1.7, h: 0.015 }, range: { w: [0.6, 4.0], d: [0.5, 3.5], h: [0.01, 0.03] }, color: '#e2d6c0',
    build(b, w, d, h) {
      const m = Math.min(0.08, w * 0.06, d * 0.06);
      b.box(0, 0, 0, w, d, h * 0.6, 'dark'); // obszycie
      b.box(m, m, 0, w - m, d - m, h * 0.85, 'main');
      b.box(2 * m, 2 * m, 0, 2 * m + 0.04, d - 2 * m, h, 'light'); // pasy plecionki
      b.box(w - 2 * m - 0.04, 2 * m, 0, w - 2 * m, d - 2 * m, h, 'light');
    },
  },
  {
    id: 'dywan-okragly', name: 'Dywan okrągły', category: 'dekoracje',
    size: { w: 1.6, d: 1.6, h: 0.015 }, range: { w: [0.6, 3.5], d: [0.6, 3.5], h: [0.01, 0.03] }, color: '#c9ad80',
    build(b, w, d, h) {
      b.ell(w / 2, d / 2, w / 2, d / 2, 0, h * 0.6, 'dark');
      b.ell(w / 2, d / 2, w * 0.47, d * 0.47, 0, h * 0.8, 'main');
      b.ell(w / 2, d / 2, w * 0.38, d * 0.38, 0, h * 0.9, 'light'); // kręgi plecionki
      b.ell(w / 2, d / 2, w * 0.28, d * 0.28, 0, h, 'main');
    },
  },
  {
    id: 'roslina', name: 'Roślina doniczkowa', category: 'dekoracje',
    size: { w: 0.5, d: 0.5, h: 1.2 }, range: { w: [0.25, 0.9], d: [0.25, 0.9], h: [0.4, 2.0] }, color: '#d9cdb8',
    build(b, w, d, h) {
      const pr = Math.min(0.2, Math.min(w, d) * 0.3);
      const ph = Math.min(0.35, h * 0.28);
      b.cyl(w / 2, d / 2, pr, 0, ph, 'main'); // donica
      b.cyl(w / 2, d / 2, 0.015, ph, h * 0.6, 'woodDark');
      b.ball(w / 2, d / 2, h * 0.72, w / 2, d / 2, h * 0.28, 'leaf');
      b.ball(w * 0.35, d * 0.4, h * 0.55, w * 0.3, d * 0.3, h * 0.16, 'leafDark');
      b.ball(w * 0.66, d * 0.62, h * 0.58, w * 0.3, d * 0.3, h * 0.15, 'leafDark');
    },
  },

  // ---- szafy i regały
  {
    id: 'regal-magazynowy', name: 'Regał magazynowy (spiżarnia)', category: 'przechowywanie',
    size: { w: 1.0, d: 0.4, h: 2.0 }, range: { w: [0.5, 2.4], d: [0.25, 0.6], h: [1.0, 2.6] },
    color: OAK, color2: LOFT, colorNames: ['Półki', 'Stelaż'],
    build(b, w, d, h) {
      legs(b, w, d, 0, h, 0.03, 0, 'second');
      const n = cl(Math.round(h / 0.42), 3, 6);
      const zs = [];
      for (let i = 0; i < n; i++) {
        const z = 0.12 + ((h - 0.15) * i) / (n - 1);
        zs.push(z + 0.03);
        b.box(0.005, 0.005, z, w - 0.005, d - 0.005, z + 0.03, 'main');
      }
      b.box(w * 0.08, 0.04, zs[0], w * 0.45, d - 0.04, zs[0] + 0.2, 'jute'); // kosze i pudła
      b.box(w * 0.52, 0.04, zs[1], w * 0.92, d - 0.04, zs[1] + 0.18, 'cream');
      b.box(w * 0.1, 0.04, zs[1], w * 0.42, d - 0.04, zs[1] + 0.22, 'jute');
    },
  },

  // ---- runda 2: toaletka, regał z ozdobami, telewizor, szafka RTV
  {
    // blat na stałej wysokości 76 cm, pod nim szuflady i wolne miejsce na kolana; lustro stoi na blacie przy TYLE; h = wierzch lustra
    id: 'toaletka', name: 'Toaletka z lustrem', category: 'sypialnia',
    size: { w: 1.1, d: 0.45, h: 1.45 }, range: { w: [0.8, 1.6], d: [0.38, 0.55], h: [1.2, 1.7] },
    color: OAK, color2: LOFT, colorNames: ['Blat i szuflady', 'Nogi i rama lustra'],
    build(b, w, d, h) {
      const top = 0.76;
      const under = top - 0.03; // spód blatu
      const lt = 0.035; // przekrój nóg
      b.box(0, 0, under, w, d, top, 'main'); // blat
      b.box(lt, FRONT, under - 0.14, w - lt, d - 0.02, under, 'dark'); // skrzynia szuflad
      fronts(b, lt, w - lt, under - 0.14, under, w >= 1.0 ? 3 : 2, 1, 'main');
      legs(b, w, d, 0, under, lt, 0, 'second');
      const mw = Math.min(w - 0.2, 0.7); // lustro w ramie
      const x0 = w / 2 - mw / 2;
      const x1 = w / 2 + mw / 2;
      const f = 0.025;
      b.box(x0, d - 0.035, top, x0 + f, d, h, 'second');
      b.box(x1 - f, d - 0.035, top, x1, d, h, 'second');
      b.box(x0 + f, d - 0.035, h - f, x1 - f, d, h, 'second');
      b.box(x0 + f, d - 0.035, top, x1 - f, d, top + f, 'second');
      b.box(x0 + f, d - 0.025, top + f, x1 - f, d - 0.005, h - f, 'mirror');
      b.box(w * 0.07, d * 0.5, top, w * 0.07 + 0.14, d * 0.5 + 0.09, top + 0.06, 'cream'); // szkatułka
      b.cyl(w * 0.93 - 0.03, d * 0.6, 0.03, top, top + 0.12, 'brass'); // flakon
    },
  },
  {
    id: 'stolek', name: 'Stołek tapicerowany (do toaletki)', category: 'sypialnia',
    size: { w: 0.42, d: 0.42, h: 0.46 }, range: { w: [0.35, 0.6], d: [0.35, 0.6], h: [0.4, 0.5] },
    color: LINEN, color2: OAK, colorNames: ['Siedzisko', 'Nogi'],
    build(b, w, d, h) {
      b.ell(w / 2, d / 2, w / 2, d / 2, h - 0.1, h, 'main');
      for (const x of [w * 0.24, w * 0.76 - 0.03]) for (const y of [d * 0.24, d * 0.76 - 0.03]) b.box(x, y, 0, x + 0.03, y + 0.03, h - 0.1, 'second');
    },
  },
  {
    // otwarty, płytki regał na ozdoby: modele aut, książki, pudełka; bez pleców – wygląda tak samo z obu stron
    id: 'regal-dekoracyjny', name: 'Regał dekoracyjny z ozdobami', category: 'biuro',
    size: { w: 1.2, d: 0.3, h: 1.8 }, range: { w: [0.6, 2.4], d: [0.2, 0.4], h: [0.9, 2.4] },
    color: OAK, color2: LOFT, colorNames: ['Półki', 'Stelaż'],
    build(b, w, d, h) {
      const t = 0.03;
      legs(b, w, d, 0, h, 0.025, 0, 'second');
      const n = h >= 1.75 ? 5 : h >= 1.3 ? 4 : 3; // półki razem z najwyższą (wierzch regału)
      const zs = [];
      for (let i = 0; i < n; i++) {
        const z = 0.1 + ((h - 0.1 - t) * i) / (n - 1);
        zs.push(z + t);
        b.box(0.005, 0.005, z, w - 0.005, d - 0.005, z + t, 'main');
      }
      const cy = d / 2;
      const car = (x, z, mat) => { // model auta ok. 1:18 – podwozie z kołami, nadwozie, kabina
        b.box(x + 0.02, cy - 0.046, z, x + 0.18, cy + 0.046, z + 0.024, 'black');
        b.box(x, cy - 0.04, z + 0.012, x + 0.2, cy + 0.04, z + 0.05, mat);
        b.box(x + 0.065, cy - 0.035, z + 0.05, x + 0.15, cy + 0.035, z + 0.078, 'screen');
      };
      const books = (x, z, m1, m2) => {
        b.box(x, d * 0.25, z, x + 0.05, d - 0.02, z + 0.24, m1);
        b.box(x + 0.05, d * 0.3, z, x + 0.11, d - 0.02, z + 0.2, m2);
      };
      b.box(w * 0.1, 0.03, zs[0], w * 0.1 + 0.22, d - 0.03, zs[0] + 0.16, 'jute'); // pudełka na dole
      b.box(w * 0.55, 0.03, zs[0], w * 0.55 + 0.2, d - 0.03, zs[0] + 0.2, 'cream');
      car(w * 0.1, zs[1], 'terracotta');
      books(w * 0.62, zs[1], 'navy', 'leafDark');
      if (n >= 4) {
        car(w * 0.08, zs[2], 'navy');
        car(w * 0.55, zs[2], 'cream');
      }
      if (n >= 5) books(w * 0.14, zs[3], 'terracotta', 'jute');
    },
  },
  {
    // płaski ekran na ścianie: ekran od FRONTU, tył przy ścianie; „Od podłogi” = dolna krawędź
    id: 'telewizor', name: 'Telewizor wiszący', category: 'salon',
    size: { w: 1.25, d: 0.06, h: 0.72 }, range: { w: [0.7, 2.0], d: [0.04, 0.1], h: [0.4, 1.15] }, color: LOFT,
    mount: 1.0,
    build(b, w, d, h) {
      b.box(0, 0.005, 0, w, d, h, 'main');
      b.box(0.012, 0, 0.012, w - 0.012, 0.005, h - 0.012, 'screen');
    },
  },
  {
    id: 'szafka-rtv-loft', name: 'Szafka RTV z drewnianym blatem', category: 'salon',
    size: { w: 1.6, d: 0.4, h: 0.5 }, range: { w: [0.9, 2.4], d: [0.3, 0.5], h: [0.4, 0.65] },
    color: WARM_WHITE, color2: OAK, colorNames: ['Fronty', 'Blat i boki'],
    build(b, w, d, h) {
      const leg = 0.14;
      const t = 0.03;
      legs(b, w, d, 0, leg, 0.03, 0.04, 'black');
      b.box(t, FRONT, leg, w - t, d, h - t, 'dark');
      fronts(b, t, w - t, leg, h - t, cl(Math.round(w / 0.6), 2, 4), 1, 'main');
      b.box(0, 0, leg, t, d, h - t, 'second');
      b.box(w - t, 0, leg, w, d, h - t, 'second');
      b.box(0, 0, h - t, w, d, h, 'second');
    },
  },
];

const BY_ID = new Map(CATALOG.map((t) => [t.id, t]));

/** Typ zastępczy dla wariantu z nieznanym typem mebla (np. zapisanym przez nowszą wersję) – zwykła skrzynia. */
export const FALLBACK_TYPE = {
  id: '?', name: 'Mebel', category: 'inne',
  size: { w: 1, d: 0.5, h: 1 }, range: { w: [0.1, 6], d: [0.1, 6], h: [0.05, 2.7] }, color: '#b8b2a6',
  build: (b, w, d, h) => b.box(0, 0, 0, w, d, h, 'main'),
};

/** @returns {FurnitureType|undefined} */
export const getType = (id) => BY_ID.get(id);
/** Typ mebla albo typ zastępczy – nigdy undefined. @returns {FurnitureType} */
export const typeOf = (item) => BY_ID.get(item?.type) || FALLBACK_TYPE;

export const clamp = (v, [min, max]) => Math.min(max, Math.max(min, v));

/** Wymiary przycięte do zakresu typu (zaokrąglone do 1 mm). */
export function clampSize(type, size) {
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return { w: r3(clamp(size.w, type.range.w)), d: r3(clamp(size.d, type.range.d)), h: r3(clamp(size.h, type.range.h)) };
}

/** Kształty, które potrafi narysować model.js. */
export const SHAPES = ['box', 'cyl', 'tube', 'cylX', 'cylY', 'ball', 'beam'];

/** Drugi kolor mebla: własny (FurnitureItem.color2) albo domyślny typu; undefined, gdy typ ma jeden kolor. */
export function secondColorOf(item, type = typeOf(item)) {
  const own = item?.color2;
  if (typeof own === 'string' && /^#[0-9a-f]{6}$/i.test(own)) return own.toLowerCase();
  return type.color2;
}

/**
 * Bryła mebla jako lista prostych kształtów w układzie mebla: środek rzutu w (0, 0), spód na z = 0,
 * x ∈ [-w/2, w/2], y ∈ [-d/2, d/2] (FRONT po stronie -y, TYŁ po stronie +y), z ∈ [0, h].
 * Każdy kształt ma prostopadłościan opisany min–max; kształty obrotowe są w niego wpisane (walec pionowy 'cyl',
 * rura 'tube', walce leżące 'cylX' / 'cylY', elipsoida 'ball'). Belka 'beam' ma dodatkowo końce osi from / to i przekrój t.
 * @returns {Array<{shape: string, min: number[], max: number[], mat: string, from?: number[], to?: number[], t?: number}>}
 */
export function buildParts(type, w, d, h) {
  const parts = [];
  const push = (shape, x0, y0, z0, x1, y1, z1, mat, extra) => {
    // kolejność od–do bez znaczenia; kształty zdegenerowane (zerowa grubość) pomijamy
    const min = [Math.min(x0, x1) - w / 2, Math.min(y0, y1) - d / 2, Math.min(z0, z1)];
    const max = [Math.max(x0, x1) - w / 2, Math.max(y0, y1) - d / 2, Math.max(z0, z1)];
    if (max[0] - min[0] < 1e-4 || max[1] - min[1] < 1e-4 || max[2] - min[2] < 1e-4) return;
    parts.push({ shape, min, max, mat: mat || 'main', ...extra });
  };
  const b = {
    box: (x0, y0, z0, x1, y1, z1, mat) => push('box', x0, y0, z0, x1, y1, z1, mat),
    cyl: (cx, cy, r, z0, z1, mat) => push('cyl', cx - r, cy - r, z0, cx + r, cy + r, z1, mat),
    ell: (cx, cy, rx, ry, z0, z1, mat) => push('cyl', cx - rx, cy - ry, z0, cx + rx, cy + ry, z1, mat),
    tube: (cx, cy, rx, ry, z0, z1, mat) => push('tube', cx - rx, cy - ry, z0, cx + rx, cy + ry, z1, mat),
    cylX: (cy, cz, r, x0, x1, mat) => push('cylX', x0, cy - r, cz - r, x1, cy + r, cz + r, mat),
    cylY: (cx, cz, r, y0, y1, mat) => push('cylY', cx - r, y0, cz - r, cx + r, y1, cz + r, mat),
    discY: (cx, cz, rx, rz, y0, y1, mat) => push('cylY', cx - rx, y0, cz - rz, cx + rx, y1, cz + rz, mat),
    ball: (cx, cy, cz, rx, ry, rz, mat) => push('ball', cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz, mat),
    beam(x0, y0, z0, x1, y1, z1, t, mat) {
      if (Math.hypot(x1 - x0, y1 - y0, z1 - z0) < 1e-4) return;
      const k = t / 2; // prostopadłościan opisany z zapasem: końce osi ± pół przekroju
      push('beam', Math.min(x0, x1) - k, Math.min(y0, y1) - k, Math.min(z0, z1) - k, Math.max(x0, x1) + k, Math.max(y0, y1) + k, Math.max(z0, z1) + k, mat, {
        from: [x0 - w / 2, y0 - d / 2, z0], to: [x1 - w / 2, y1 - d / 2, z1], t,
      });
    },
  };
  type.build(b, w, d, h);
  return parts;
}

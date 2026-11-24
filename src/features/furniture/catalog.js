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
//   b.box(x0, y0, z0, x1, y1, z1, mat)      prostopadłościan od–do
//   b.cyl(cx, cy, r, z0, z1, mat)           walec pionowy
// mat: 'main' (kolor mebla wybierany przez użytkownika), 'dark' / 'light' (ciemniejszy / jaśniejszy odcień koloru mebla)
//      albo kolor stały z FIXED_COLORS ('white', 'steel', 'black', 'blat', 'mattress', 'glass', 'shade').
// Wszystkie wymiary w metrach. Bryła MUSI mieścić się w w × d × h (pilnuje tego test katalogu).

export const CATEGORIES = [
  { id: 'salon', name: 'Salon' },
  { id: 'jadalnia', name: 'Jadalnia' },
  { id: 'sypialnia', name: 'Sypialnia' },
  { id: 'przechowywanie', name: 'Szafy i regały' },
  { id: 'kuchnia', name: 'Kuchnia' },
  { id: 'lazienka', name: 'Łazienka' },
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
};

/** Paleta podpowiadana w panelu edycji (dowolny inny kolor daje próbnik). */
export const PALETTE = ['#f4f4f1', '#d9d4c8', '#b8b2a6', '#8a8f98', '#4a4d52', '#2e3033', '#b59a78', '#8a623c', '#5b3f2a', '#7d8f7a', '#5d7391', '#a8574a'];

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
  b.box(0, 0, h - blat, w, d, h, 'blat');
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
  ...[[90, 1.0], [140, 1.5], [160, 1.7], [180, 1.9]].map(([cm, w]) => ({
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
    size: { w: 0.6, d: 0.6, h: 0.9 }, range: { w: [0.3, 4.0], d: [0.5, 0.7], h: [0.82, 0.95] }, color: '#f4f4f1',
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
    size: { w: 1.8, d: 0.9, h: 0.9 }, range: { w: [1.0, 3.0], d: [0.6, 1.3], h: [0.82, 1.1] }, color: '#f4f4f1',
    build(b, w, d, h) {
      const blat = 0.04;
      b.box(0.06, 0.08, 0, w - 0.06, d - 0.08, 0.1, 'dark'); // cokół
      b.box(0.03, 0.03, 0.1, w - 0.03, d - 0.03, h - blat, 'main'); // korpus cofnięty pod blatem
      b.box(0, 0, h - blat, w, d, h, 'blat');
    },
  },
  {
    id: 'kuchnia-zlew', name: 'Szafka ze zlewem', category: 'kuchnia',
    size: { w: 0.8, d: 0.6, h: 0.9 }, range: { w: [0.5, 1.2], d: [0.5, 0.7], h: [0.82, 0.95] }, color: '#f4f4f1',
    build(b, w, d, h) {
      // blat 2 cm niżej niż h – zlew i bateria wystają ponad blat, a całość mieści się w wysokości mebla
      const top = h - 0.02;
      cabinet(b, w, d, top - 0.04, modules(w), 1, 0.1);
      b.box(0, 0, top - 0.04, w, d, top, 'blat');
      basin(b, w * 0.12, d * 0.18, w * 0.88, d * 0.82, top, top + 0.008, 0.02, top + 0.002, 'steel', 'shade');
      b.cyl(w / 2, d * 0.9, 0.018, top, h, 'steel'); // bateria
    },
  },
  {
    id: 'kuchnia-plyta', name: 'Szafka z płytą grzewczą', category: 'kuchnia',
    size: { w: 0.6, d: 0.6, h: 0.9 }, range: { w: [0.45, 0.9], d: [0.5, 0.7], h: [0.82, 0.95] }, color: '#f4f4f1',
    build(b, w, d, h) {
      const top = h - 0.008;
      cabinet(b, w, d, top - 0.04, 1, 2, 0.1);
      b.box(0, 0, top - 0.04, w, d, top, 'blat');
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
    id: 'kominek', name: 'Kominek', category: 'inne',
    size: { w: 0.87, d: 0.55, h: 2.2 }, range: { w: [0.6, 1.6], d: [0.4, 0.9], h: [0.6, 2.69] }, color: '#d9d4c8',
    build(b, w, d, h) {
      b.box(0, 0.012, 0, w, d, h, 'main'); // obudowa
      const z0 = Math.min(0.35, h * 0.3);
      b.box(w * 0.14, 0, z0, w * 0.86, 0.012, Math.min(z0 + 0.55, h * 0.8), 'black'); // szyba wkładu
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

/**
 * Bryła mebla jako lista prostych kształtów w układzie mebla: środek rzutu w (0, 0), spód na z = 0,
 * x ∈ [-w/2, w/2], y ∈ [-d/2, d/2] (FRONT po stronie -y, TYŁ po stronie +y), z ∈ [0, h].
 * @returns {Array<{shape: 'box'|'cyl', min: number[], max: number[], mat: string}>}
 */
export function buildParts(type, w, d, h) {
  const parts = [];
  const push = (shape, x0, y0, z0, x1, y1, z1, mat) => {
    // kolejność od–do bez znaczenia; kształty zdegenerowane (zerowa grubość) pomijamy
    const min = [Math.min(x0, x1) - w / 2, Math.min(y0, y1) - d / 2, Math.min(z0, z1)];
    const max = [Math.max(x0, x1) - w / 2, Math.max(y0, y1) - d / 2, Math.max(z0, z1)];
    if (max[0] - min[0] < 1e-4 || max[1] - min[1] < 1e-4 || max[2] - min[2] < 1e-4) return;
    parts.push({ shape, min, max, mat: mat || 'main' });
  };
  const b = {
    box: (x0, y0, z0, x1, y1, z1, mat) => push('box', x0, y0, z0, x1, y1, z1, mat),
    cyl: (cx, cy, r, z0, z1, mat) => push('cyl', cx - r, cy - r, z0, cx + r, cy + r, z1, mat),
  };
  type.build(b, w, d, h);
  return parts;
}

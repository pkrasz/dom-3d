// WARIANT „MONTANA” – PODDASZE: wykończenia i umeblowanie. Czysty moduł danych (bez DOM, bez Three.js, bez importów).
//
// Układ domu: metry, (0,0) = narożnik muru, x 0..13,60, y 0..10,10; ścianki kolankowe przy y = 0,25 (front) i y = 9,85 (ogród).
// Wysokość pod skosem: h = min(2,55; 1,425 + 0,70 · u), u = odległość od lica ścianki kolankowej;
// w sypialni 1/9, łazience 1/10 i garderobie 1/11 sufit jest otwarty do kalenicy (design.json) – bez ograniczenia 2,55.
//
// Bryła z design.json: drzwi przesuwne DP1/DP2 na ścianie sypialni od strony łazienki i garderoby (pas 12,5 cm przy ścianie
// y = 7,12 musi być wolny), lamele wokół otworu klatki, dodatkowe okna połaciowe w pokojach dzieci.
//
// Wymagania sprawdza liczbowo tests/preset.montana.poddasze.test.js (pomieszczenie, ściany, drzwi rozwierne i przesuwne,
// nakładanie, skosy, okna połaciowe, przejścia, łazienki, znane id materiałów i powierzchni). Po każdej zmianie danych: npm test.

const LEVEL = 'poddasze';

// ---------------------------------------------------------------- kolory
const OAK = '#b5895a'; // ciepły dąb
const WARM_WHITE = '#f1ece2'; // ciepła złamana biel (meble)
const CASHMERE = '#ddd2bf'; // spokojny, ciepły beż frontów
const LINEN = '#d8cbb5'; // jasny beż tkaniny
const BLACK = '#2e3033'; // czarna stal (ramy, armatura)
const SANITARY = '#f4f4f1'; // biała ceramika
const TERRACOTTA = '#c2704f'; // umywalka w kolorze terakoty
const RUG = '#e2d6c0'; // jasny pleciony dywan
const JUTE = '#c9ad80';

// farby – wyłącznie kolory z palety (features/finishes/palette.js)
const P_WHITE = '#f6f1e7'; // Biel ciepła – ściany, sufity, skosy
const P_IVORY = '#efe6d3'; // Kość słoniowa
const P_GREIGE = '#cfc6b8'; // Greige
const P_PEACH = '#f3d9c2'; // Brzoskwinia
const P_ROSE = '#ecd3cf'; // Pudrowy róż
const P_GREEN = '#1f4d3f'; // Butelkowa zieleń

const paint = (color) => ({ kind: 'paint', color });
const material = (id, rot = 0, extra = {}) => ({ kind: 'material', id, rot, ...extra });
const split = (height, lower, upper) => ({ kind: 'split', height, lower, upper });

const WHITE_WALL = paint(P_WHITE);
// Panele w ciepłym dębie; rot 90 = deski wzdłuż osi x (od okna szczytowego do okna, tak samo we wszystkich pokojach i w korytarzu).
const PANEL = material('panel-dab-cieply', 90);

const sid = (room, part) => `${LEVEL}:${room}:${part}`;
/** Wpisy dla ścian pomieszczenia: byIndex = { numer krawędzi: wykończenie }. */
const walls = (room, byIndex) => Object.fromEntries(Object.entries(byIndex).map(([i, f]) => [sid(room, `wall:${i}`), f]));

// ---------------------------------------------------------------- WYKOŃCZENIA
// Numery ścian = indeksy krawędzi wieloboku pomieszczenia (house.json); w komentarzach, która to ściana naprawdę.
export const finishes = {
  // --- 1/2 Korytarz (ściany 2 i 3 nie istnieją – to krawędzie otworu klatki schodowej z czarnymi lamelami)
  [sid('1/2', 'floor')]: PANEL,
  [sid('1/2', 'ceiling')]: WHITE_WALL,
  ...walls('1/2', {
    0: WHITE_WALL, // D-5: drzwi do sypialni 1/9
    1: WHITE_WALL, // lico ściany nośnej przy schodach (8 cm)
    4: WHITE_WALL, // D-7: drzwi do biura 1/3
    5: WHITE_WALL, // D-8: drzwi do pokoi 1/4 i 1/5
    6: WHITE_WALL, // obudowa komina K-C (odcinek poziomy)
    7: WHITE_WALL, // obudowa komina K-C (odcinek pionowy)
    8: WHITE_WALL, // D-10 / D-6: drzwi do łazienki 1/7, pralni 1/6 i pokoju 1/8
    9: paint(P_IVORY), // D-4: ściana zamykająca hol zachodni – z lustrem w czarnej ramie
  }),

  // --- 1/3 Biuro
  [sid('1/3', 'floor')]: PANEL,
  [sid('1/3', 'ceiling')]: WHITE_WALL,
  [sid('1/3', 'slope-N')]: WHITE_WALL,
  ...walls('1/3', {
    0: WHITE_WALL, // D-7 od schodów (za zabudową z projektu, z drzwiami)
    1: paint(P_GREIGE), // D-8 za regałem z ozdobami (tło za plecami siedzącego przy biurku) – spokojny akcent
    2: WHITE_WALL, // ścianka kolankowa od ogrodu (pod oknami dachowymi, za kanapą)
    3: WHITE_WALL, // nośna N-1 (za zabudową z projektu)
  }),

  // --- 1/4 Pokój chłopca 10–11 lat
  [sid('1/4', 'floor')]: PANEL,
  [sid('1/4', 'ceiling')]: WHITE_WALL,
  [sid('1/4', 'slope-N')]: WHITE_WALL,
  ...walls('1/4', {
    0: WHITE_WALL, // D-9 za szafą z projektu
    1: WHITE_WALL, // szczyt wschodni z oknem OE1
    2: WHITE_WALL, // ścianka kolankowa od ogrodu (wzdłuż łóżka, dalej biurko pod oknem połaciowym)
    3: paint(P_GREEN), // D-8 z drzwiami, za wezgłowiem i regałem – butelkowa zieleń
  }),

  // --- 1/5 Pokój dziewczynki 4–5 lat
  [sid('1/5', 'floor')]: PANEL,
  [sid('1/5', 'ceiling')]: WHITE_WALL,
  [sid('1/5', 'slope-S')]: WHITE_WALL,
  ...walls('1/5', {
    0: paint(P_ROSE), // ścianka kolankowa od frontu (kącik zabaw pod oknem połaciowym)
    1: WHITE_WALL, // szczyt wschodni z oknem OE2
    2: WHITE_WALL, // D-9 za komodą
    3: WHITE_WALL, // D-8 z drzwiami
    4: WHITE_WALL, // D-13 (krótki uskok przy kominie)
    5: paint(P_ROSE), // D-14 od pralni – za wezgłowiem łóżka-domku
  }),

  // --- 1/6 Pralnia
  [sid('1/6', 'floor')]: material('plytka-gwiazdka-bialo-czarna', 0),
  [sid('1/6', 'ceiling')]: WHITE_WALL,
  [sid('1/6', 'slope-S')]: WHITE_WALL,
  ...walls('1/6', {
    0: material('metro-biale', 0), // ścianka kolankowa nad blatem roboczym
    1: split(1.3, material('metro-biale', 0), WHITE_WALL), // D-14: ściana mokra (pralka z suszarką, umywalka)
    2: WHITE_WALL, // D-13
    3: WHITE_WALL, // lico komina K-C
    4: WHITE_WALL, // D-10 z drzwiami
    5: WHITE_WALL, // D-12 od łazienki (regał)
  }),

  // --- 1/7 Duża łazienka – lastryko
  [sid('1/7', 'floor')]: material('lastryko-cieple', 0),
  [sid('1/7', 'ceiling')]: WHITE_WALL,
  [sid('1/7', 'slope-S')]: WHITE_WALL,
  ...walls('1/7', {
    0: WHITE_WALL, // ścianka kolankowa za wanną
    1: material('lastryko-cieple', 0, { size: [0.6, 1.2] }), // D-12: ściana przy umywalkach, WC i bidecie – lastryko 60 × 120
    2: WHITE_WALL, // D-10 z drzwiami – ciepła biel (bok prysznica: w wykonaniu powłoka wodoodporna w tym samym kolorze)
    3: material('plytka-terakota-30x60', 0), // nośna N-1 – JEDYNA ściana w terakocie: ściana prysznica (deszczownica, bateria)
  }),

  // --- 1/8 Pokój dziewczynki 1–2 lata
  [sid('1/8', 'floor')]: PANEL,
  [sid('1/8', 'ceiling')]: WHITE_WALL,
  [sid('1/8', 'slope-S')]: WHITE_WALL,
  ...walls('1/8', {
    0: WHITE_WALL, // ścianka kolankowa od frontu
    1: WHITE_WALL, // nośna N-1 za szafą z projektu
    2: WHITE_WALL, // D-6 z drzwiami
    3: paint(P_PEACH), // D-4: bok wnęki z łóżeczkiem
    4: paint(P_PEACH), // D-3: ściana wnęki za łóżeczkiem i fotelem – delikatna brzoskwinia
    5: WHITE_WALL, // szczyt zachodni z oknem OW2
  }),

  // --- 1/9 Sypialnia rodziców (sufit otwarty: nie ma 'ceiling', są dwa skosy do kalenicy)
  [sid('1/9', 'floor')]: PANEL,
  [sid('1/9', 'slope-S')]: WHITE_WALL,
  [sid('1/9', 'slope-N')]: WHITE_WALL,
  ...walls('1/9', {
    0: material('deski-scienne-stare-cieple', 0), // D-3 ZA ŁÓŻKIEM – poziome deski z postarzanego drewna
    1: WHITE_WALL, // D-4: bok wnęki łóżka
    2: WHITE_WALL, // D-5 z drzwiami z korytarza
    3: WHITE_WALL, // nośna N-1 – toaletka (szafa z projektu usunięta na życzenie)
    4: paint(P_IVORY), // D-2 z drzwiami przesuwnymi do łazienki i garderoby
    5: WHITE_WALL, // szczyt zachodni z oknem OW1
  }),

  // --- 1/10 Łazienka rodziców (sufit otwarty: tylko skos)
  [sid('1/10', 'floor')]: material('patchwork-szaro-niebieski', 0),
  [sid('1/10', 'slope-N')]: WHITE_WALL,
  ...walls('1/10', {
    0: material('plyta-bezowa-60x120', 0), // D-2 z drzwiami (ściana prysznica)
    1: material('plyta-bezowa-60x120', 0), // D-1 od garderoby (prysznic, WC)
    2: material('plyta-bezowa-60x120', 0), // ścianka kolankowa
    3: material('cegla-stara-czerwona', 0), // szczyt zachodni – stara cegła za umywalką i lustrem
  }),

  // --- 1/11 Garderoba (sufit otwarty: tylko skos)
  [sid('1/11', 'floor')]: PANEL,
  [sid('1/11', 'slope-N')]: WHITE_WALL,
  [sid('1/11', 'chimney:K-A')]: material('tynk-strukturalny-jasny', 0),
  ...walls('1/11', {
    0: paint(P_IVORY), // D-2 z drzwiami
    1: paint(P_IVORY), // nośna N-1 za szafą
    2: paint(P_IVORY), // ścianka kolankowa za niską szafą
    3: paint(P_IVORY), // D-1 od łazienki (regał, komin)
  }),
};

// ---------------------------------------------------------------- MEBLE
// Konwencja katalogu: przy rot = 0 FRONT mebla patrzy w −y, TYŁ w +y. Strona, do której mebel stoi tyłem → obrót:
const ROT_BY_BACK = { N: 0, W: 90, S: 180, E: 270 };
const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000;

/**
 * Prostokąt rzutu [x0, y0, x1, y1] + strona TYŁU mebla → FurnitureItem (środek, obrót, szerokość wzdłuż ściany, głębokość).
 * extra: pola opcjonalne (z = wysokość spodu nad posadzką dla mebli wiszących, color2 = drugi kolor).
 */
function item(id, type, rect, back, h, color, extra = {}) {
  const [x0, y0, x1, y1] = rect;
  const alongX = back === 'N' || back === 'S';
  return {
    id, type, levelId: LEVEL,
    x: r4((x0 + x1) / 2),
    y: r4((y0 + y1) / 2),
    rot: ROT_BY_BACK[back],
    w: r3(alongX ? x1 - x0 : y1 - y0),
    d: r3(alongX ? y1 - y0 : x1 - x0),
    h, color, ...extra,
  };
}

export const furniture = [
  // ===== MEBLE Z PROJEKTU (kopie z createStarterFurniture(): id, położenie i wymiary bez zmian, kolory wariantu).
  // Bez 'start-szafa-1-9': zabudowa w sypialni usunięta na życzenie właściciela – w jej miejscu stoi toaletka.
  { id: 'start-szafa-1-11-a', type: 'szafa-wnekowa', levelId: LEVEL, x: 3.525, y: 9.5515, rot: 0, w: 1.85, d: 0.597, h: 1.4, color: CASHMERE },
  { id: 'start-szafa-1-11-b-wysoka', type: 'szafa-wnekowa', levelId: LEVEL, x: 4.75, y: 7.7415, rot: 270, w: 1.003, d: 0.6, h: 2.4, color: CASHMERE },
  { id: 'start-szafa-1-11-b-skos-n', type: 'szafa-wnekowa', levelId: LEVEL, x: 4.75, y: 9.0465, rot: 270, w: 1.607, d: 0.6, h: 1.4, color: CASHMERE },
  { id: 'start-szafa-1-8-skos-s', type: 'szafa-wnekowa', levelId: LEVEL, x: 4.75, y: 1.0535, rot: 270, w: 1.607, d: 0.6, h: 1.4, color: WARM_WHITE },
  { id: 'start-szafa-1-8-wysoka', type: 'szafa-wnekowa', levelId: LEVEL, x: 4.75, y: 2.6285, rot: 270, w: 1.543, d: 0.6, h: 2.4, color: WARM_WHITE },
  { id: 'start-szafa-1-3-a-wysoka', type: 'szafa-wnekowa', levelId: LEVEL, x: 5.5985, y: 7.6475, rot: 90, w: 1.191, d: 0.597, h: 2.4, color: WARM_WHITE },
  { id: 'start-szafa-1-3-a-skos-n', type: 'szafa-wnekowa', levelId: LEVEL, x: 5.5985, y: 9.0465, rot: 90, w: 1.607, d: 0.597, h: 1.4, color: WARM_WHITE },
  { id: 'start-szafa-1-3-b', type: 'szafa-wnekowa', levelId: LEVEL, x: 6.9025, y: 7.3525, rot: 180, w: 2.011, d: 0.601, h: 2.4, color: WARM_WHITE },
  { id: 'start-szafa-1-4', type: 'szafa-wnekowa', levelId: LEVEL, x: 11.449, y: 5.522, rot: 180, w: 3.798, d: 0.58, h: 2.4, color: WARM_WHITE },

  // ===== 1/2 KORYTARZ – same drzwi dookoła, więc zostaje pusty: chodnik, lustro na końcu holu, roślina przy lamelach
  // (poza wyjściem ze schodów x = 7,92, y 4,82..5,80 i poza dojściem do drzwi biura).
  item('mt-1-2-chodnik', 'dywan', [5.6, 3.76, 8.6, 4.56], 'N', 0.015, RUG),
  item('mt-1-2-lustro', 'lustro', [3.37, 3.82, 3.41, 4.42], 'W', 1.5, BLACK, { z: 0.5 }),
  item('mt-1-2-roslina', 'roslina', [7.95, 6.5, 8.23, 6.78], 'N', 1.3, '#d9cdb8'),

  // ===== 1/3 BIURO (4,11 × 2,93; zabudowy z projektu na ścianie zachodniej i południowej, drzwi w narożniku)
  // Stanowisko pracy przy ścianie D-8: siedzący ma ZA PLECAMI regał z ozdobami (modele aut), biurko przed sobą,
  // patrzy w głąb pokoju. Między zabudową a biurkiem zostaje 85 cm przejścia od drzwi.
  item('mt-1-3-regal-ozdoby', 'regal-dekoracyjny', [9.11, 8.35, 9.41, 9.35], 'E', 1.75, OAK, { color2: BLACK }),
  item('mt-1-3-krzeslo', 'krzeslo-biurowe', [8.4, 8.79, 9.02, 9.41], 'E', 1.1, '#3d4045'),
  item('mt-1-3-biurko', 'biurko-komputerowe', [7.7, 8.5, 8.3, 9.7], 'W', 1.25, OAK, { color2: BLACK }),
  // Kanapa rozkładana (złożona) pod skosem i oknem dachowym, tyłem do ścianki kolankowej. Przed nią wolne 1,40 × 1,35 m
  // do lica zabudowy – łóżko 1,40 × 2,00 liczone od ścianki kolankowej (razem z kanapą) kończy się 20 cm przed szafami.
  // Pełne 1,40 × 2,00 m wolnej podłogi PRZED kanapą nie mieści się razem z biurkiem, regałem za krzesłem i szafami.
  item('mt-1-3-kanapa', 'kanapa-rozkladana', [6.25, 9.0, 7.65, 9.85], 'N', 0.85, '#b7a98f'),
  // Telewizor przy szafach: na licu zabudowy naprzeciw kanapy (stały panel między drzwiami szafy).
  item('mt-1-3-telewizor', 'telewizor', [6.4, 7.653, 7.5, 7.713], 'S', 0.64, BLACK, { z: 1.0 }),
  item('mt-1-3-dywan', 'dywan', [6.2, 7.75, 7.6, 8.95], 'N', 0.015, RUG),

  // ===== 1/4 POKÓJ CHŁOPCA 10–11 LAT
  // Łóżko 120 × 200 wezgłowiem do pełnej ściany D-8, wzdłuż ścianki kolankowej (pod skosem).
  item('mt-1-4-lozko', 'lozko-120', [9.53, 8.5, 11.63, 9.8], 'W', 0.9, OAK),
  item('mt-1-4-szafka-nocna', 'szafka-nocna', [9.53, 8.02, 9.93, 8.47], 'W', 0.5, OAK),
  item('mt-1-4-regal', 'regal', [9.53, 6.85, 9.88, 7.65], 'W', 2.0, OAK),
  // Biurko pod nowym oknem połaciowym OPD1 (światło z góry na blat), przy ściance kolankowej – niskie, okna nie zasłania.
  item('mt-1-4-biurko', 'biurko', [11.68, 9.25, 13.08, 9.85], 'N', 0.75, OAK),
  item('mt-1-4-krzeslo', 'krzeslo-biurowe', [11.75, 8.58, 12.37, 9.2], 'S', 1.1, '#3d4045'),
  item('mt-1-4-polka', 'polka-wiszaca', [13.1, 7.95, 13.35, 8.95], 'E', 0.2, OAK, { z: 1.35 }),
  // Środek pokoju wolny – miejsce do zabawy na dywanie.
  item('mt-1-4-dywan', 'dywan', [10.4, 6.2, 12.6, 7.8], 'N', 0.015, '#5d7391'),

  // ===== 1/5 POKÓJ DZIEWCZYNKI 4–5 LAT
  // Łóżko-domek 90 × 200 wezgłowiem do pełnej ściany D-14, odsunięte od skosu (sufit 2,30 m i więcej) – nie stoi pod
  // nowym oknem połaciowym OPD2. Pod oknem, przy ściance kolankowej: niski regał na zabawki i kącik zabaw.
  item('mt-1-5-lozko-domek', 'lozko-domek', [10.15, 1.5, 12.25, 2.5], 'W', 1.6, '#e3cfae', { color2: '#d9b5a8' }),
  item('mt-1-5-regal-zabawki', 'regal-zabawki', [11.15, 0.25, 12.35, 0.6], 'S', 0.8, WARM_WHITE, { color2: JUTE }),
  // Stolik z krzesełkami we wnęce obok drzwi (poza łukiem skrzydła).
  item('mt-1-5-stolik', 'stolik-dzieciecy', [9.55, 2.72, 10.15, 3.92], 'W', 0.55, '#e3cfae', { color2: '#a9b8a0' }),
  // Szafa i komoda na ścianie D-9 – droga od drzwi w głąb pokoju wolna, okno szczytowe odsłonięte.
  item('mt-1-5-szafa', 'szafa', [10.75, 4.51, 11.75, 5.11], 'N', 2.1, WARM_WHITE),
  item('mt-1-5-komoda', 'komoda', [11.85, 4.66, 13.05, 5.11], 'N', 0.85, WARM_WHITE),
  item('mt-1-5-dywan', 'dywan-okragly', [10.85, 2.65, 12.65, 4.45], 'N', 0.02, '#ead9cf'),

  // ===== 1/6 PRALNIA
  item('mt-1-6-pralka-suszarka', 'pralka-suszarka', [9.41, 1.9, 10.03, 2.5], 'E', 1.75, SANITARY),
  item('mt-1-6-umywalka', 'umywalka', [9.57, 1.2, 10.03, 1.8], 'E', 0.85, OAK),
  // Blat roboczy z szafkami pod skosem i oknem dachowym (składanie prania).
  item('mt-1-6-blat', 'kuchnia-dolna', [8.23, 0.25, 10.03, 0.85], 'S', 0.9, CASHMERE, { color2: OAK }),
  item('mt-1-6-regal', 'regal-magazynowy', [7.83, 1.15, 8.23, 2.15], 'W', 2.0, OAK, { color2: BLACK }),

  // ===== 1/7 DUŻA ŁAZIENKA (2,41 × 3,15 m ze skosem): wanna pod skosem, prysznic, WC, bidet, DWIE umywalki
  item('mt-1-7-wanna', 'wanna-wolnostojaca', [5.4, 0.28, 7.0, 1.08], 'S', 0.6, SANITARY),
  // Walk-in w narożniku przy drzwiach: ściany z tyłu (N-1, terakota) i z prawej (D-10), wejście od strony wanny.
  item('mt-1-7-prysznic', 'prysznic-walk-in-prawy', [5.3, 2.2, 6.2, 3.4], 'W', 2.0, '#e9e3d8', { color2: BLACK }),
  // Dębowy blat 1,10 m z dwiema terakotowymi umywalkami nablatowymi na ścianie z lastryka; nad nim lustro w czarnej ramie.
  item('mt-1-7-umywalki', 'umywalka-podwojna', [7.23, 2.28, 7.71, 3.38], 'E', 0.95, OAK, { color2: TERRACOTTA }),
  item('mt-1-7-lustro', 'lustro', [7.67, 2.33, 7.71, 3.33], 'E', 0.7, BLACK, { z: 1.15 }),
  item('mt-1-7-wc', 'wc-podwieszane', [7.17, 1.72, 7.71, 2.09], 'E', 0.42, SANITARY),
  item('mt-1-7-bidet', 'bidet', [7.15, 1.085, 7.71, 1.455], 'E', 0.4, SANITARY),

  // ===== 1/8 POKÓJ DZIEWCZYNKI 1–2 LATA
  // Łóżeczko we wnęce przy ścianie wewnętrznej D-3 – daleko od okna i nie pod skosem; fotel do karmienia obok.
  item('mt-1-8-lozeczko', 'lozeczko', [1.97, 3.22, 3.23, 3.88], 'W', 0.9, WARM_WHITE),
  item('mt-1-8-fotel', 'fotel-uszak', [0.95, 3.05, 1.75, 3.9], 'N', 1.05, LINEN),
  item('mt-1-8-komoda-przewijak', 'komoda-przewijak', [0.25, 1.15, 1.0, 2.05], 'W', 0.98, WARM_WHITE, { color2: OAK }),
  item('mt-1-8-regal-zabawki', 'regal-zabawki', [1.6, 0.25, 2.8, 0.6], 'S', 0.8, WARM_WHITE, { color2: JUTE }),
  item('mt-1-8-dywan', 'dywan-okragly', [1.35, 0.75, 3.55, 2.95], 'N', 0.02, '#ecdccb'),

  // ===== 1/9 SYPIALNIA RODZICÓW (bez szafy i bez fotela)
  // Łóżko 160 wezgłowiem do ściany z desek (D-3), pośrodku wnęki – dojście z obu stron po 65 cm.
  item('mt-1-9-lozko', 'lozko-160', [0.9, 4.02, 2.6, 6.12], 'S', 1.0, OAK),
  item('mt-1-9-szafka-nocna-l', 'szafka-nocna', [0.4, 4.02, 0.85, 4.42], 'S', 0.5, OAK),
  item('mt-1-9-szafka-nocna-p', 'szafka-nocna', [2.65, 4.02, 3.1, 4.42], 'S', 0.5, OAK),
  // Toaletka do malowania się w miejscu szafy z projektu (ściana N-1): blat, lustro w czarnej ramie, stołek.
  // Stoi między dojściem do drzwi z korytarza a dojściem do drzwi garderoby, poza pasem drzwi przesuwnych (y ≥ 6,995).
  item('mt-1-9-toaletka', 'toaletka', [4.6, 5.44, 5.05, 6.54], 'E', 1.45, OAK, { color2: BLACK }),
  item('mt-1-9-stolek', 'stolek', [4.16, 5.78, 4.58, 6.2], 'E', 0.46, LINEN, { color2: OAK }),
  item('mt-1-9-dywan', 'dywan', [0.45, 4.7, 3.05, 6.28], 'N', 0.015, RUG),

  // ===== 1/10 ŁAZIENKA RODZICÓW (bez wanny)
  // Walk-in w najwyższej części, w narożniku przy drzwiach: ściany z tyłu (D-1) i z prawej (D-2), wejście od strony WC
  // (60 cm wolnego między prysznicem a WC).
  item('mt-1-10-prysznic', 'prysznic-walk-in-prawy', [1.58, 7.24, 2.48, 8.34], 'E', 2.0, '#e9e3d8', { color2: BLACK }),
  // Drewniana szafka z umywalką nablatową na ścianie z cegły, nad nią lustro w czarnej ramie.
  item('mt-1-10-umywalka', 'umywalka-nablatowa', [0.25, 8.05, 0.73, 8.95], 'W', 0.95, OAK, { color2: SANITARY }),
  item('mt-1-10-lustro', 'lustro', [0.25, 8.2, 0.29, 8.8], 'W', 0.75, BLACK, { z: 1.15 }),
  item('mt-1-10-wc', 'wc-podwieszane', [1.94, 8.94, 2.48, 9.31], 'E', 0.42, SANITARY),
  // Niski regał na ręczniki pod skosem.
  item('mt-1-10-regal', 'regal', [0.35, 9.5, 1.15, 9.85], 'N', 1.0, OAK),

  // ===== 1/11 GARDEROBA (zabudowy z projektu + otwarty regał w linii komina i lustro na kominie)
  item('mt-1-11-regal', 'regal', [2.6, 7.26, 2.95, 8.19], 'W', 2.0, OAK),
  item('mt-1-11-lustro', 'lustro', [2.96, 8.41, 3.0, 9.01], 'W', 1.5, BLACK, { z: 0.35 }),
  item('mt-1-11-dywan', 'dywan', [3.15, 7.6, 4.25, 9.0], 'N', 0.015, JUTE),
];

// Wariant „Montana” – PARTER: wykończenia i umeblowanie (same dane, bez logiki).
// Styl: ciepłe drewno, cegła, kamień, czarne loftowe akcenty; nowocześnie i spokojnie.
//
// Układ współrzędnych jak w house.json (metry). Mebel: środek (x, y), obrót rot w stopniach;
// przy rot = 0 front patrzy w stronę −y, tył w +y (90 = tył na zachód, 180 = na południe, 270 = na wschód).
// Identyfikatory: „mt-pN-…” = pomieszczenie 0/N; meble z projektu (szafa w wiatrołapie, kominek) mają id ze starter.js.
// Bryła z design.json: drzwi spiżarni przesuwne po stronie kuchni (pas 12,5 cm przy ścianie x = 5,30, y 7,56..9,25 wolny).
// Twarde wymagania (ściany, drzwi rozwierne i przesuwne, przejścia, nakładanie) pilnuje tests/preset.montana.parter.test.js.

const P = 'parter';

// ---------------------------------------------------------------- kolory
const BIEL_CIEPLA = '#f6f1e7'; // paleta farb: „Biel ciepła”
const BIEL_ZLAMANA = '#f2efe8'; // „Biel złamana”
const KOSC_SLONIOWA = '#efe6d3'; // „Kość słoniowa”
const GRAFIT = '#4a4e53'; // „Grafit”

const DAB = '#b5895a'; // ciepły dąb (blaty, siedziska)
const CZARNY = '#2e3033'; // czarna stal (ramy, stelaże)
const BIEL_MEBLI = '#f1ece2'; // ciepła biel zabudów
const KASZMIR = '#ddd2bf'; // fronty kuchni
const LEN = '#d8cbb5'; // jasny beż tkaniny
const JUTA = '#c9ad80';

const farba = (color) => ({ kind: 'paint', color });
const material = (id, rot = 0) => ({ kind: 'material', id, rot });
/** Płytki do wysokości: niżej okładzina, wyżej farba. */
const doWysokosci = (height, lower, upper) => ({ kind: 'split', height, lower, upper });

const JODELKA = material('gres-jodelka-dab-cieply'); // jedna podłoga w salonie, korytarzu, kuchni i spiżarni
const ZYWICA = material('posadzka-zywica-szara');

// ---------------------------------------------------------------- wykończenia
/** @type {Object<string, import('../../../../app/variant.js').Finish>} */
export const finishes = {
  // --- 0/1 Wiatrołap: patchwork biało-czarny, ściana boczna (wschodnia, bez szafy) w starej cegle, reszta „Biel ciepła”
  'parter:0/1:floor': material('patchwork-bialo-czarny'),
  'parter:0/1:wall:0': farba(BIEL_CIEPLA), // południowa, z drzwiami wejściowymi
  'parter:0/1:wall:1': material('cegla-stara-czerwona'), // wschodnia (ściana W3 od salonu) – przy niej siedzisko i konsola
  'parter:0/1:wall:2': farba(BIEL_CIEPLA), // północna – szafa wnękowa, dalej ścianka szklana
  'parter:0/1:wall:3': farba(BIEL_CIEPLA), // zachodnia, z drzwiami do garażu
  'parter:0/1:ceiling': farba(BIEL_CIEPLA),

  // --- 0/2 Korytarz
  'parter:0/2:floor': JODELKA,
  'parter:0/2:wall:1': farba(BIEL_CIEPLA), // wschodnia (W3) + pas podciągu nad otwarciem na salon
  'parter:0/2:wall:2': farba(BIEL_CIEPLA),
  'parter:0/2:wall:5': material('tynk-strukturalny-jasny'), // ściana nośna pod schodami – biegnie w górę klatki
  'parter:0/2:wall:6': farba(BIEL_CIEPLA), // pod schodami, od łazienki
  'parter:0/2:wall:7': farba(BIEL_CIEPLA),
  'parter:0/2:wall:8': farba(BIEL_CIEPLA),
  'parter:0/2:wall:9': farba(BIEL_CIEPLA), // zachodnia, z drzwiami łazienki
  'parter:0/2:ceiling': farba(BIEL_CIEPLA),

  // --- 0/3 Łazienka: terakotowa ściana za WC, reszta beżowe płytki do 1,20 m, podłoga z gwiazdką (echo wiatrołapu)
  'parter:0/3:floor': material('plytka-gwiazdka-bialo-czarna'),
  'parter:0/3:wall:0': doWysokosci(1.2, material('plytka-bezowa-30x60'), farba(BIEL_CIEPLA)), // południowa, umywalka
  'parter:0/3:wall:1': doWysokosci(1.2, material('plytka-bezowa-30x60'), farba(BIEL_CIEPLA)), // wschodnia, drzwi
  'parter:0/3:wall:2': material('plytka-terakota-7x30'), // północna, za WC – cała ściana
  'parter:0/3:wall:3': doWysokosci(1.2, material('plytka-bezowa-30x60'), farba(BIEL_CIEPLA)), // zachodnia
  'parter:0/3:ceiling': farba(BIEL_CIEPLA),

  // --- 0/4 Spiżarnia
  'parter:0/4:floor': JODELKA,
  'parter:0/4:wall:0': farba(BIEL_ZLAMANA),
  'parter:0/4:wall:1': farba(BIEL_ZLAMANA),
  'parter:0/4:wall:2': farba(BIEL_ZLAMANA),
  'parter:0/4:wall:3': farba(BIEL_ZLAMANA),
  'parter:0/4:ceiling': farba(BIEL_CIEPLA),

  // --- 0/5 Kuchnia: bielona cegła na ścianie okiennej (nad blatem), reszta ciepła
  'parter:0/5:floor': JODELKA,
  'parter:0/5:wall:0': farba(KOSC_SLONIOWA), // południowa – wysoka zabudowa i blat pomocniczy, dalej wolna ściana przy przejściu
  'parter:0/5:wall:2': material('cegla-bielona'), // północna, z oknem – zlew i płyta
  'parter:0/5:wall:3': farba(BIEL_CIEPLA), // zachodnia, z przesuwnymi drzwiami spiżarni (pas przy ścianie wolny na skrzydło)
  'parter:0/5:ceiling': farba(BIEL_CIEPLA),

  // --- 0/6 Salon z jadalnią: ściana RTV w beżowym tynku, komin w ciepłym kamieniu
  'parter:0/6:floor': JODELKA,
  'parter:0/6:wall:0': farba(BIEL_CIEPLA), // południowa (front, okno narożne)
  'parter:0/6:wall:1': farba(BIEL_CIEPLA), // wschodnia (okno narożne, przeszklenie)
  'parter:0/6:wall:2': farba(BIEL_CIEPLA), // północna (drzwi tarasowe)
  'parter:0/6:wall:3': farba(BIEL_CIEPLA), // pas podciągu nad otwarciem na kuchnię
  'parter:0/6:wall:4': farba(BIEL_CIEPLA),
  'parter:0/6:wall:6': farba(BIEL_CIEPLA),
  'parter:0/6:wall:7': material('tynk-strukturalny-bezowy'), // zachodnia: zabudowa RTV i kominek
  'parter:0/6:chimney:K-C': material('kamien-kominkowy-cieply'),
  'parter:0/6:ceiling': farba(BIEL_CIEPLA),

  // --- 0/7 Schody: wysokie ściany klatki w jasnym tynku strukturalnym (tło dla czarnych lameli i dębowych stopni)
  'parter:0/7:floor': JODELKA,
  'parter:0/7:wall:2': material('tynk-strukturalny-jasny'),
  'parter:0/7:wall:3': material('tynk-strukturalny-jasny'),
  'parter:0/7:ceiling': farba(BIEL_CIEPLA),

  // --- 0/8 Pomieszczenie techniczne
  'parter:0/8:floor': ZYWICA,
  'parter:0/8:wall:0': farba(BIEL_ZLAMANA),
  'parter:0/8:wall:1': farba(BIEL_ZLAMANA),
  'parter:0/8:wall:2': farba(BIEL_ZLAMANA),
  'parter:0/8:wall:3': farba(BIEL_ZLAMANA),
  'parter:0/8:chimney:K-A': farba(BIEL_ZLAMANA),
  'parter:0/8:ceiling': farba(BIEL_ZLAMANA),

  // --- 0/9 Garaż: jasne ściany, grafitowa ściana za perkusją
  'parter:0/9:floor': ZYWICA,
  'parter:0/9:wall:0': farba(BIEL_ZLAMANA), // południowa, brama
  'parter:0/9:wall:1': farba(BIEL_ZLAMANA), // wschodnia – strefa siłowni
  'parter:0/9:wall:2': farba(GRAFIT), // północna – perkusja między drzwiami
  'parter:0/9:wall:3': farba(BIEL_ZLAMANA), // zachodnia, okna
  'parter:0/9:ceiling': farba(BIEL_ZLAMANA),
};

// ---------------------------------------------------------------- meble
/** @type {import('../../../../app/variant.js').FurnitureItem[]} */
export const furniture = [
  // ============ 0/1 Wiatrołap (3,50 × 1,80)
  // szafa wnękowa z projektu – na swoim miejscu, ciepła biel
  { id: 'start-szafa-wiatrolap', type: 'szafa-wnekowa', levelId: P, x: 5.9, y: 2.35, rot: 0, w: 1.2, d: 0.6, h: 2.4, color: BIEL_MEBLI },
  // ścianka szklana w przejściu P1 (1,98 × 2,70 – pełna wysokość), drzwi dwuskrzydłowe 2 × 90 cm; 2 mm luzu na ościeża.
  // ZAŁOŻENIE: skrzydła otwierają się do korytarza (+y) – dzięki temu ceglana ściana wiatrołapu mieści siedzisko i konsolę.
  // Skrzydło CZYNNE (codzienne przejście 0,90 m) to PRAWE, od strony salonu: otwarte składa się na ścianę W3 (x = 8,71,
  // y 2,75..3,65) i niczego nie zasłania. Skrzydło LEWE jest BIERNE (na ryglu, otwierane okazjonalnie – np. przy wnoszeniu
  // mebli): otwarte na 90° staje 9 cm przed drzwiami łazienki 0/3 i zasłania 57 z 80 cm ich światła (KOMPROMIS, README).
  { id: 'mt-p1-scianka-szklana', type: 'scianka-szklana-drzwi', levelId: P, x: 7.81, y: 2.71, rot: 0, w: 1.978, d: 0.08, h: 2.7, color: CZARNY },
  // siedzisko przy ceglanej ścianie, na prawo od wejścia; nad nim listwa z hakami
  { id: 'mt-p1-siedzisko', type: 'siedzisko', levelId: P, x: 8.61, y: 1.27, rot: 270, w: 0.8, d: 0.38, h: 0.46, color: DAB, color2: BIEL_MEBLI },
  { id: 'mt-p1-wieszak', type: 'wieszak', levelId: P, x: 8.76, y: 1.27, rot: 270, w: 0.8, d: 0.08, h: 0.14, color: DAB, z: 1.6 },
  // konsola z dębowym blatem W WIATROŁAPIE – na tej samej ceglanej ścianie, tuż za siedziskiem; nad nią okrągłe lustro
  // w czarnej ramie. Krótka (60 cm), płytka (25 cm) i odsunięta 37 cm od ścianki szklanej: ostatnie 37 cm przed czynnym
  // (prawym) skrzydłem jest wolne na całą jego szerokość 0,90 m; obok samej konsoli pas w osi skrzydła ma 74 cm, a po
  // lewej jest otwarta podłoga wiatrołapu (wcześniej konsola 80 × 28 cm zwężała dojście do 71 cm aż do 9 cm przed drzwiami).
  { id: 'mt-p1-konsola', type: 'konsola', levelId: P, x: 8.675, y: 2, rot: 270, w: 0.6, d: 0.25, h: 0.8, color: DAB, color2: CZARNY },
  { id: 'mt-p1-lustro-konsola', type: 'lustro-okragle', levelId: P, x: 8.78, y: 2, rot: 270, w: 0.55, d: 0.04, h: 0.55, color: CZARNY, z: 1.1 },
  // wysokie lustro w czarnej ramie na ścianie przy drzwiach wejściowych (4 cm – nie wchodzi w łuk drzwi z garażu)
  { id: 'mt-p1-lustro', type: 'lustro', levelId: P, x: 5.95, y: 0.87, rot: 180, w: 0.6, d: 0.04, h: 1.6, color: CZARNY, z: 0.35 },
  { id: 'mt-p1-dywan', type: 'dywan-okragly', levelId: P, x: 7.45, y: 1.7, rot: 0, w: 1.4, d: 1.4, h: 0.015, color: JUTA },

  // ============ 0/2 Korytarz: pusty ciąg komunikacyjny (za ścianką szklaną otwiera się jej czynne, prawe skrzydło)
  // roślina w otwartej wnęce pod biegiem górnym schodów (poza ciągiem komunikacyjnym)
  { id: 'mt-p2-roslina', type: 'roslina', levelId: P, x: 7.05, y: 5.15, rot: 0, w: 0.45, d: 0.45, h: 1.3, color: '#d9cdb8' },

  // ============ 0/3 Łazienka (1,40 × 1,78): WC na ścianie północnej, mała umywalka nablatowa naprzeciwko
  { id: 'mt-p3-umywalka', type: 'umywalka-nablatowa', levelId: P, x: 5.6, y: 2.97, rot: 180, w: 0.5, d: 0.4, h: 0.95, color: DAB, color2: '#f4f4f1' },
  { id: 'mt-p3-lustro', type: 'lustro-okragle', levelId: P, x: 5.6, y: 2.79, rot: 180, w: 0.5, d: 0.04, h: 0.5, color: CZARNY, z: 1.2 },
  { id: 'mt-p3-wc', type: 'wc-podwieszane', levelId: P, x: 5.8, y: 4.29, rot: 0, w: 0.37, d: 0.52, h: 0.42, color: '#f4f4f1' },

  // ============ 0/4 Spiżarnia (1,97 × 2,80): regały w „U”, środek wolny między drzwiami do garażu i do kuchni
  { id: 'mt-p4-regal-zachod', type: 'regal-magazynowy', levelId: P, x: 3.28, y: 8.275, rot: 90, w: 2.35, d: 0.4, h: 2.2, color: DAB, color2: CZARNY },
  { id: 'mt-p4-regal-polnoc', type: 'regal-magazynowy', levelId: P, x: 4.065, y: 9.65, rot: 0, w: 1.966, d: 0.4, h: 2.2, color: DAB, color2: CZARNY },
  { id: 'mt-p4-regal-wschod', type: 'regal-magazynowy', levelId: P, x: 4.9, y: 7.75, rot: 270, w: 1.2, d: 0.3, h: 2.2, color: DAB, color2: CZARNY },

  // ============ 0/5 Kuchnia (3,75 × 2,80): dwa rzędy + wyspa-barek w „L” z rzędem okiennym, na granicy z jadalnią
  // rząd północny pod oknem (blat 0,90 ≤ parapet 0,91): szafka, płyta, szafka, zlew pod oknem, szafka łącząca z wyspą.
  // Zaczyna na y = 9,25 – tuż za pasem drzwi przesuwnych spiżarni.
  { id: 'mt-p5-dolna-1', type: 'kuchnia-dolna', levelId: P, x: 5.65, y: 9.55, rot: 0, w: 0.7, d: 0.6, h: 0.9, color: KASZMIR, color2: DAB },
  { id: 'mt-p5-plyta', type: 'kuchnia-plyta', levelId: P, x: 6.3, y: 9.55, rot: 0, w: 0.6, d: 0.6, h: 0.9, color: KASZMIR, color2: DAB },
  { id: 'mt-p5-dolna-2', type: 'kuchnia-dolna', levelId: P, x: 6.95, y: 9.55, rot: 0, w: 0.7, d: 0.6, h: 0.9, color: KASZMIR, color2: DAB },
  { id: 'mt-p5-zlew', type: 'kuchnia-zlew', levelId: P, x: 7.7, y: 9.55, rot: 0, w: 0.8, d: 0.6, h: 0.9, color: KASZMIR, color2: DAB },
  { id: 'mt-p5-dolna-3', type: 'kuchnia-dolna', levelId: P, x: 8.275, y: 9.55, rot: 0, w: 0.35, d: 0.6, h: 0.9, color: KASZMIR, color2: DAB },
  // szafki wiszące na lewo od okna (nad płytą – miejsce na okap w zabudowie)
  { id: 'mt-p5-gorna-polnoc', type: 'kuchnia-gorna', levelId: P, x: 5.95, y: 9.675, rot: 0, w: 1.3, d: 0.35, h: 0.75, color: KASZMIR, z: 1.45 },
  // rząd południowy: lodówka w zabudowie, słupek z piekarnikiem, blat pomocniczy z szafkami wiszącymi.
  // Odsunięty 13 cm od ściany spiżarni: przy niej jeździ skrzydło drzwi przesuwnych (pas 12,5 cm, y 7,56..9,25).
  { id: 'mt-p5-lodowka', type: 'kuchnia-slupek', levelId: P, x: 5.73, y: 7.375, rot: 180, w: 0.6, d: 0.65, h: 2.2, color: KASZMIR },
  { id: 'mt-p5-piekarnik', type: 'kuchnia-piekarnik', levelId: P, x: 6.33, y: 7.375, rot: 180, w: 0.6, d: 0.65, h: 2.2, color: KASZMIR },
  { id: 'mt-p5-dolna-4', type: 'kuchnia-dolna', levelId: P, x: 7.13, y: 7.375, rot: 180, w: 1, d: 0.65, h: 0.9, color: KASZMIR, color2: DAB },
  { id: 'mt-p5-gorna-poludnie', type: 'kuchnia-gorna', levelId: P, x: 7.13, y: 7.225, rot: 180, w: 1, d: 0.35, h: 0.75, color: KASZMIR, z: 1.45 },
  // wyspa-barek 1,80 × 0,90 m w „L” z rzędem okiennym (wybór właścicieli – wersja pierwsza): północnym końcem
  // dosunięta do ściany okiennej, od południa wolne przejście 1,00 m; fronty do kuchni (zachód), nawis barowy 30 cm
  // po stronie jadalni; wychodzi 30 cm poza linię kuchni.
  { id: 'mt-p5-wyspa-barek', type: 'wyspa-barek', levelId: P, x: 8.9, y: 8.95, rot: 270, w: 1.8, d: 0.9, h: 0.92, color: KASZMIR, color2: DAB },
  // trzy hokery po stronie jadalni (wsunięte pod nawis)
  { id: 'mt-p6-hoker-1', type: 'hoker', levelId: P, x: 9.4, y: 8.4, rot: 270, w: 0.4, d: 0.42, h: 0.9, color: DAB, color2: CZARNY },
  { id: 'mt-p6-hoker-2', type: 'hoker', levelId: P, x: 9.4, y: 8.95, rot: 270, w: 0.4, d: 0.42, h: 0.9, color: DAB, color2: CZARNY },
  { id: 'mt-p6-hoker-3', type: 'hoker', levelId: P, x: 9.4, y: 9.5, rot: 270, w: 0.4, d: 0.42, h: 0.9, color: DAB, color2: CZARNY },

  // ============ 0/6 Jadalnia (część salonu przy kuchni): stół na 6 osób równolegle do wyspy, 6 krzeseł
  { id: 'mt-p6-stol', type: 'stol-6', levelId: P, x: 11.5, y: 7.8, rot: 90, w: 1.8, d: 0.9, h: 0.76, color: DAB, color2: CZARNY },
  { id: 'mt-p6-krzeslo-1', type: 'krzeslo', levelId: P, x: 10.99, y: 7.2, rot: 90, w: 0.45, d: 0.52, h: 0.9, color: '#4a4d52' },
  { id: 'mt-p6-krzeslo-2', type: 'krzeslo', levelId: P, x: 10.99, y: 7.8, rot: 90, w: 0.45, d: 0.52, h: 0.9, color: '#4a4d52' },
  { id: 'mt-p6-krzeslo-3', type: 'krzeslo', levelId: P, x: 10.99, y: 8.4, rot: 90, w: 0.45, d: 0.52, h: 0.9, color: '#4a4d52' },
  { id: 'mt-p6-krzeslo-4', type: 'krzeslo', levelId: P, x: 12.01, y: 7.2, rot: 270, w: 0.45, d: 0.52, h: 0.9, color: '#4a4d52' },
  { id: 'mt-p6-krzeslo-5', type: 'krzeslo', levelId: P, x: 12.01, y: 7.8, rot: 270, w: 0.45, d: 0.52, h: 0.9, color: '#4a4d52' },
  { id: 'mt-p6-krzeslo-6', type: 'krzeslo', levelId: P, x: 12.01, y: 8.4, rot: 270, w: 0.45, d: 0.52, h: 0.9, color: '#4a4d52' },
  { id: 'mt-p6-roslina-jadalnia', type: 'roslina', levelId: P, x: 13, y: 9.45, rot: 0, w: 0.5, d: 0.5, h: 1.5, color: '#d9cdb8' },

  // ============ 0/6 Salon – część wypoczynkowa
  // kominek z projektu: obudowa w jasnym ciepłym tynku, dębowa belka (komin za nim w kamieniu)
  { id: 'start-kominek', type: 'kominek', levelId: P, x: 9.685, y: 3.225, rot: 90, w: 0.87, d: 0.55, h: 2.2, color: '#e6dccb', color2: '#9a6b40' },
  // zabudowa RTV z regałem na ścianie zachodniej, obok kominka
  { id: 'mt-p6-rtv', type: 'zabudowa-rtv', levelId: P, x: 9.25, y: 1.4, rot: 90, w: 2.2, d: 0.4, h: 2.3, color: BIEL_MEBLI, color2: DAB },
  // duży narożnik: część główna przy ścianie wschodniej (naprzeciw TV), ramię pod oknem narożnym od frontu
  { id: 'mt-p6-naroznik', type: 'naroznik-duzy-prawy', levelId: P, x: 12.1, y: 1.9, rot: 270, w: 3.2, d: 2.4, h: 0.85, color: LEN, color2: '#b98f6a' },
  { id: 'mt-p6-dywan', type: 'dywan', levelId: P, x: 11.45, y: 2.45, rot: 0, w: 2.8, d: 2.6, h: 0.015, color: '#e2d6c0' },
  { id: 'mt-p6-stolik-1', type: 'stolik-okragly', levelId: P, x: 11.5, y: 2.2, rot: 0, w: 0.8, d: 0.8, h: 0.42, color: DAB, color2: CZARNY },
  { id: 'mt-p6-stolik-2', type: 'stolik-okragly', levelId: P, x: 11.15, y: 3.1, rot: 0, w: 0.5, d: 0.5, h: 0.5, color: DAB, color2: CZARNY },
  // fotel zamykający grupę od północy, lekko obrócony do kominka; przy nim stolik
  { id: 'mt-p6-fotel', type: 'fotel-uszak', levelId: P, x: 11.7, y: 4.65, rot: 340, w: 0.8, d: 0.85, h: 1.05, color: '#b08560' },
  { id: 'mt-p6-stolik-3', type: 'stolik-okragly', levelId: P, x: 12.7, y: 4.05, rot: 0, w: 0.45, d: 0.45, h: 0.5, color: DAB, color2: CZARNY },
  { id: 'mt-p6-roslina-salon', type: 'roslina', levelId: P, x: 13.05, y: 4.75, rot: 0, w: 0.5, d: 0.5, h: 1.6, color: '#d9cdb8' },

  // ============ 0/8 Pomieszczenie techniczne: dwa regały, reszta wolna na urządzenia
  { id: 'mt-p8-regal-wschod', type: 'regal-magazynowy', levelId: P, x: 2.76, y: 7.65, rot: 270, w: 1, d: 0.4, h: 2, color: DAB, color2: CZARNY },
  { id: 'mt-p8-regal-zachod', type: 'regal-magazynowy', levelId: P, x: 0.45, y: 9, rot: 90, w: 1.4, d: 0.4, h: 2, color: DAB, color2: CZARNY },

  // ============ 0/9 Garaż (4,80 × 6,55), bez samochodu
  // quad za bramą, przodem do wyjazdu
  { id: 'mt-p9-quad', type: 'quad', levelId: P, x: 1.1, y: 1.45, rot: 0, w: 1.15, d: 1.9, h: 1.15, color: '#b0472f' },
  // stojak przy ścianie zachodniej i trzy rowery przednim kołem w stojaku (dwa duże, jeden dziecięcy)
  { id: 'mt-p9-stojak', type: 'stojak-rowery', levelId: P, x: 0.5, y: 3.3, rot: 90, w: 1.2, d: 0.5, h: 0.45, color: CZARNY },
  { id: 'mt-p9-rower-1', type: 'rower', levelId: P, x: 1.175, y: 2.9, rot: 180, w: 1.75, d: 0.4, h: 1.05, color: '#b0563f' },
  { id: 'mt-p9-rower-2', type: 'rower', levelId: P, x: 1.175, y: 3.3, rot: 180, w: 1.75, d: 0.4, h: 1.05, color: '#3d4045' },
  { id: 'mt-p9-rower-3', type: 'rower', levelId: P, x: 0.95, y: 3.7, rot: 180, w: 1.3, d: 0.4, h: 0.8, color: '#5d7391' },
  // perkusja na ścianie północnej między drzwiami (perkusista plecami do ściany)
  { id: 'mt-p9-perkusja', type: 'perkusja', levelId: P, x: 2.55, y: 6.15, rot: 0, w: 1.5, d: 1.3, h: 1.3, color: '#7d3b2b' },
  // siłownia przy ścianie wschodniej: bieżnia i atlas; hantle pod oknem, mata na środku
  { id: 'mt-p9-bieznia', type: 'bieznia', levelId: P, x: 4.2, y: 2.8, rot: 270, w: 0.8, d: 1.7, h: 1.35, color: '#4a4d52' },
  { id: 'mt-p9-atlas', type: 'atlas', levelId: P, x: 4.3, y: 3.95, rot: 270, w: 1.1, d: 1.5, h: 2.1, color: '#3d4045', color2: '#6b4a32' },
  { id: 'mt-p9-hantle', type: 'hantle', levelId: P, x: 0.475, y: 4.9, rot: 90, w: 1, d: 0.45, h: 0.8, color: '#3d4045' },
  { id: 'mt-p9-mata', type: 'mata', levelId: P, x: 2.7, y: 4.5, rot: 90, w: 1.8, d: 0.9, h: 0.015, color: '#5f6f66' },
];

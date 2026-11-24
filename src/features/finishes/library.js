// Biblioteka materiałów wykończeniowych – SAME DANE, bez logiki.
//
// Nowy materiał = jeden wpis w tablicy MATERIALS:
//   id        – unikalny identyfikator (trafia do wariantu jako Finish.id; nie zmieniaj istniejących!)
//   name      – nazwa po polsku
//   category  – id z CATEGORIES
//   use       – 'floor' (podłoga) | 'wall' (ściana, sufit, skos, komin) | 'both'
//   size      – PRAWDZIWY rozmiar jednego elementu w metrach: [wymiar wzdłuż u, wymiar wzdłuż v]
//               (na ścianie: [szerokość, wysokość]; deska: [szerokość, długość]). Obrót 90° zamienia je miejscami.
//   colors    – odcienie elementów (pierwszy = kolor przewodni, używany też jako kolor zastępczy)
//   texture   – sposób rysowania na <canvas> (textures.js):
//                 draw: 'tiles'       – prostokąty z fugą (płytki, kamień),
//                       'planks'      – deski układane obok siebie z losowym przesunięciem,
//                       'herringbone' – jodełka (rozmiar: [szerokość, długość], długość = wielokrotność szerokości),
//                       'seamless'    – powierzchnia bez podziału (beton, wykładzina); size = okres powtarzania wzoru
//                 look: 'plain' | 'clouds' (przetarcia jak beton) | 'veins' (żyłki marmuru) | 'speckle' (lastryko, granit)
//                       | 'wood' (słoje) | 'slate' (łupek) | 'carpet' (włókno)
//                       | 'oldwood' (postarzana deska: sęki, przetarcia) | 'brick' (lico starej cegły)
//                       | 'terrazzo' (lastryko z dużymi okruchami) | 'patchwork' (płytki ze wzorami)
//                       | 'plaster' (tynk strukturalny – tylko z 'seamless')
//                 chips: kolory ziaren dla 'speckle', 'terrazzo' i 'brick' (opcjonalnie)
//                 motifs, inks, invert: 'patchwork' – lista motywów ('star', 'star4', 'flower', 'diamond', 'rings',
//                       'cross'; dopisek ':2' = motyw powtórzony 2 × 2 na płytce), kolory wzoru, udział płytek
//                       z zamienionymi kolorami (0…1)
//                 tileJoint: true – jodełka z gresu: pełna fuga zamiast szczeliny, w panelu wybór fugi
//                 thinJoint: true – 'tiles' ze szczeliną 1 px zamiast czytelnej fugi (deski ścienne)
//                 stagger: 'random' – układ "na cegiełkę" z losowym przesunięciem rzędów (deski ścienne)
//   grout     – domyślna fuga { color, width (m) }; dla desek to szczelina między deskami; null = bez fugi
//   pattern   – domyślny układ: 'straight' (prosty) | 'brick' (cegiełka – co drugi rząd przesunięty o pół elementu)
//   formats   – id listy formatów z FORMATS proponowanych w panelu (null = stały rozmiar)

/** @typedef {{id: string, name: string, category: string, use: 'floor'|'wall'|'both', size: [number, number], colors: string[],
 *   texture: {draw: 'tiles'|'planks'|'herringbone'|'seamless', look: string, chips?: string[]},
 *   grout: ?{color: string, width: number}, pattern: 'straight'|'brick', formats: ?string}} MaterialDef */

export const CATEGORIES = [
  { id: 'drewno', name: 'Drewno' },
  { id: 'panele', name: 'Panele' },
  { id: 'gres', name: 'Gres' },
  { id: 'plytki-scienne', name: 'Płytki ścienne' },
  { id: 'beton', name: 'Beton / mikrocement' },
  { id: 'kamien', name: 'Kamień' },
  { id: 'cegla', name: 'Cegła i tynk' },
  { id: 'wykladzina', name: 'Wykładzina' },
];

/** Formaty proponowane w panelu. size w metrach: [wzdłuż u, wzdłuż v]. */
export const FORMATS = {
  tile: [
    { label: '60 × 60', size: [0.6, 0.6] },
    { label: '60 × 120', size: [0.6, 1.2] },
    { label: '120 × 120', size: [1.2, 1.2] },
    { label: '80 × 80', size: [0.8, 0.8] },
    { label: '30 × 60', size: [0.3, 0.6] },
    { label: '30 × 30', size: [0.3, 0.3] },
    { label: '20 × 20', size: [0.2, 0.2] },
    { label: '20 × 120', size: [0.2, 1.2] },
    { label: 'Metro 10 × 20', size: [0.2, 0.1] },
    { label: '7,5 × 30', size: [0.3, 0.075] },
  ],
  plank: [
    { label: '14 × 120', size: [0.14, 1.2] },
    { label: '18 × 180', size: [0.18, 1.8] },
    { label: '19 × 138', size: [0.193, 1.38] },
    { label: '22 × 220', size: [0.22, 2.2] },
  ],
  herringbone: [
    { label: '7 × 49', size: [0.07, 0.49] },
    { label: '9 × 45', size: [0.09, 0.45] },
    { label: '12 × 60', size: [0.12, 0.6] },
    { label: '14 × 70', size: [0.14, 0.7] },
  ],
  // gres drewnopodobny układany w jodełkę: [szerokość, długość]
  herringboneTile: [
    { label: '15 × 90', size: [0.15, 0.9] },
    { label: '20 × 120', size: [0.2, 1.2] },
    { label: '15 × 60', size: [0.15, 0.6] },
    { label: '10 × 60', size: [0.1, 0.6] },
  ],
  // deski ścienne poziome: [długość, szerokość deski]
  board: [
    { label: 'Deska 14 cm', size: [2, 0.14] },
    { label: 'Deska 16 cm', size: [2, 0.16] },
    { label: 'Deska 18 cm', size: [2, 0.18] },
    { label: 'Deska 20 cm', size: [2, 0.2] },
  ],
  // cegła licowa: [długość, wysokość]
  brick: [
    { label: '25 × 6,5', size: [0.25, 0.065] },
    { label: '21 × 5', size: [0.21, 0.05] },
    { label: '24 × 7,1', size: [0.24, 0.071] },
  ],
};

/** Gotowe kolory fug. */
export const GROUT_COLORS = [
  { name: 'Biała', color: '#f4f4f2' },
  { name: 'Jasnoszara', color: '#d9d9d6' },
  { name: 'Szara', color: '#a9aaa8' },
  { name: 'Cementowa', color: '#8a8c8b' },
  { name: 'Grafitowa', color: '#4b4e52' },
  { name: 'Czarna', color: '#222325' },
  { name: 'Beżowa', color: '#d6c9b3' },
  { name: 'Brązowa', color: '#7b6350' },
];

/** Szerokości fug do wyboru (mm). 0 = bez fugi. */
export const GROUT_WIDTHS_MM = [0, 1, 2, 3, 5, 10];

const JOINT = { color: '#3a2c20', width: 0.001 }; // szczelina między deskami
const GROUT_LIGHT = { color: '#d9d9d6', width: 0.002 };
const GROUT_GREY = { color: '#a9aaa8', width: 0.002 };
const GROUT_DARK = { color: '#4b4e52', width: 0.002 };

const wood = (id, name, colors, size = [0.18, 1.8]) => ({
  id, name, category: 'drewno', use: 'both', size, colors, texture: { draw: 'planks', look: 'wood' }, grout: JOINT, pattern: 'straight', formats: 'plank',
});
const herringbone = (id, name, colors) => ({
  id, name, category: 'drewno', use: 'both', size: [0.12, 0.6], colors, texture: { draw: 'herringbone', look: 'wood' }, grout: JOINT, pattern: 'straight', formats: 'herringbone',
});
const laminate = (id, name, colors) => ({
  id, name, category: 'panele', use: 'floor', size: [0.193, 1.38], colors, texture: { draw: 'planks', look: 'wood' }, grout: JOINT, pattern: 'straight', formats: 'plank',
});
const tile = (id, name, category, use, size, colors, look, grout, extra = {}) => ({
  id, name, category, use, size, colors, texture: { draw: 'tiles', look, ...(extra.chips ? { chips: extra.chips } : {}) }, grout, pattern: extra.pattern || 'straight', formats: 'tile',
});
const GROUT_BEIGE = { color: '#d6c9b3', width: 0.002 };
/** Gres drewnopodobny w jodełkę – element [szerokość, długość], widoczna cienka fuga. */
const herringboneTile = (id, name, colors, groutColor) => ({
  id, name, category: 'gres', use: 'both', size: [0.15, 0.9], colors, texture: { draw: 'herringbone', look: 'wood', tileJoint: true },
  grout: { color: groutColor, width: 0.002 }, pattern: 'straight', formats: 'herringboneTile',
});
/** Płytka patchworkowa 20 × 20: tła w colors, wzory w inks. */
const patchwork = (id, name, colors, inks, motifs, invert, grout) => ({
  id, name, category: 'gres', use: 'both', size: [0.2, 0.2], colors, texture: { draw: 'tiles', look: 'patchwork', inks, motifs, invert }, grout, pattern: 'straight', formats: 'tile',
});
/** Cegła licowa w układzie wozówkowym. */
const brick = (id, name, colors, chips, groutColor) => ({
  id, name, category: 'cegla', use: 'wall', size: [0.25, 0.065], colors, texture: { draw: 'tiles', look: 'brick', chips }, grout: { color: groutColor, width: 0.01 }, pattern: 'brick', formats: 'brick',
});
/** Poziome deski ścienne: [długość, szerokość deski], łączenia czołowe w losowych miejscach. */
const wallBoards = (id, name, colors) => ({
  id, name, category: 'drewno', use: 'wall', size: [2, 0.16], colors, texture: { draw: 'tiles', look: 'oldwood', thinJoint: true, stagger: 'random' },
  grout: { color: '#4a3626', width: 0.002 }, pattern: 'brick', formats: 'board',
});
const seamless = (id, name, category, use, size, colors, look) => ({
  id, name, category, use, size, colors, texture: { draw: 'seamless', look }, grout: null, pattern: 'straight', formats: null,
});

/** @type {MaterialDef[]} */
export const MATERIALS = [
  // ------------------------------------------------------------ drewno
  wood('deska-dab-naturalny', 'Deska dębowa naturalna', ['#c8a273', '#bd9566', '#d0ab7d', '#b88d5e']),
  wood('deska-dab-bielony', 'Deska dębowa bielona', ['#ddcdb4', '#d5c3a8', '#e4d6bf', '#cfbb9e']),
  wood('deska-dab-wedzony', 'Deska dębowa wędzona', ['#8a6646', '#7d5a3c', '#95704e', '#735136']),
  wood('deska-jesion-jasny', 'Deska jesionowa jasna', ['#e3cfaa', '#dac49d', '#ead8b6', '#d3bb92'], [0.14, 1.2]),
  wood('deska-orzech', 'Deska – orzech', ['#6f4c34', '#62412b', '#7b573d', '#573925']),
  herringbone('jodelka-dab', 'Jodełka dębowa', ['#c8a273', '#bd9566', '#d0ab7d', '#b88d5e']),
  herringbone('jodelka-dab-jasny', 'Jodełka – dąb jasny', ['#dccbb0', '#d3c0a3', '#e3d4bb', '#cdb999']),
  herringbone('jodelka-orzech', 'Jodełka – orzech', ['#6f4c34', '#62412b', '#7b573d', '#573925']),
  wallBoards('deski-scienne-stare-cieple', 'Deski ścienne poziome – stare drewno ciepłe', ['#a87c52', '#9b7048', '#b4895e', '#8f6640', '#a27650', '#b99168']),
  wallBoards('deski-scienne-stare-miodowe', 'Deski ścienne poziome – stare drewno miodowe', ['#c39a68', '#b88d5c', '#cda674', '#ad8253', '#bf9462', '#d1ad7e']),

  // ------------------------------------------------------------ panele
  laminate('panel-dab-miodowy', 'Panel – dąb miodowy', ['#c79a5f', '#bb8d52', '#d0a56c', '#b3854b']),
  laminate('panel-dab-szary', 'Panel – dąb szary', ['#b3aa9d', '#a89f92', '#bdb5a8', '#9f9689']),
  laminate('panel-sosna-bielona', 'Panel – sosna bielona', ['#e6ddcd', '#ded4c2', '#ece4d6', '#d7ccb9']),
  laminate('panel-dab-cieply', 'Panel – dąb ciepły naturalny', ['#c9a57a', '#bf9a6e', '#d1af85', '#b89265', '#c5a074']),
  laminate('panel-dab-ciemny', 'Panel – dąb ciemny', ['#6b4f3a', '#604530', '#775a43', '#573d2a']),

  // ------------------------------------------------------------ gres (podłoga i ściana)
  tile('gres-beton-szary', 'Gres betonowy szary', 'gres', 'both', [0.6, 0.6], ['#a9aaa6', '#a3a4a0', '#b0b1ad'], 'clouds', GROUT_GREY),
  tile('gres-beton-jasny', 'Gres betonowy jasny', 'gres', 'both', [0.6, 0.6], ['#d4d3ce', '#cecdc8', '#dad9d4'], 'clouds', GROUT_LIGHT),
  tile('gres-bezowy', 'Gres beżowy', 'gres', 'both', [0.6, 0.6], ['#d9ccb6', '#d3c5ae', '#dfd3be'], 'plain', { color: '#d6c9b3', width: 0.002 }),
  tile('gres-antracyt', 'Gres antracytowy', 'gres', 'both', [0.6, 0.6], ['#4a4d51', '#44474b', '#505357'], 'clouds', GROUT_DARK),
  tile('gres-marmur-bialy', 'Gres – biały marmur', 'gres', 'both', [0.6, 1.2], ['#f0efec', '#ecebe7', '#f4f3f0'], 'veins', GROUT_LIGHT),
  tile('gres-wielki-format', 'Gres wielkoformatowy jasnoszary', 'gres', 'both', [1.2, 1.2], ['#c9c9c5', '#c4c4c0', '#cecec9'], 'clouds', GROUT_GREY),
  tile('gres-drewnopodobny', 'Gres drewnopodobny', 'gres', 'both', [0.2, 1.2], ['#b89670', '#ad8a64', '#c2a17c', '#a68259'], 'wood', { color: '#7b6350', width: 0.002 }, { pattern: 'brick' }),
  tile('gres-lastryko', 'Gres – lastryko', 'gres', 'both', [0.6, 0.6], ['#e3e0d9', '#dfdcd5'], 'speckle', GROUT_LIGHT, { chips: ['#8f8c86', '#c2b29a', '#5d6266', '#b98f7a', '#f5f3ee'] }),
  tile('plytka-cementowa-20', 'Płytka cementowa 20 × 20', 'gres', 'both', [0.2, 0.2], ['#9fb0b4', '#e6e2d8', '#8ea0a5', '#d9d4c8'], 'plain', GROUT_GREY),
  herringboneTile('gres-jodelka-dab-cieply', 'Gres drewnopodobny w jodełkę – dąb ciepły', ['#c19a6b', '#b78f60', '#c9a476', '#b08758', '#bd9565'], '#8c7257'),
  herringboneTile('gres-jodelka-dab-jasny', 'Gres drewnopodobny w jodełkę – dąb jasny', ['#d9c3a0', '#d0b993', '#e0ccab', '#c9b08a', '#d5be99'], '#b39f84'),
  herringboneTile('gres-jodelka-dab-miodowy', 'Gres drewnopodobny w jodełkę – dąb miodowy', ['#c8995e', '#be8e53', '#d0a36a', '#b7864c', '#c39459'], '#8a6c4c'),
  patchwork('patchwork-bialo-czarny', 'Patchwork biało-czarny – gwiazdki i kwiatki 20 × 20', ['#f2efe8', '#eeebe3', '#f5f3ed'], ['#2a2b2e', '#34353a'],
    ['star', 'star', 'star:2', 'flower', 'flower:2', 'star4:2'], 0.12, GROUT_LIGHT),
  patchwork('plytka-gwiazdka-bialo-czarna', 'Płytka biało-czarna – gwiazdka 20 × 20', ['#f2efe8', '#efece5'], ['#2a2b2e'], ['star'], 0, GROUT_LIGHT),
  patchwork('patchwork-szaro-niebieski', 'Patchwork szaro-niebieski 20 × 20', ['#ecebe5', '#e6e8e6', '#f0eee8'], ['#6d8492', '#8a9aa4', '#536878', '#a7b3b8', '#7f8f8c'],
    ['star', 'star:2', 'star4:2', 'flower', 'flower:2', 'diamond', 'diamond:2', 'rings', 'cross:2'], 0.3, GROUT_LIGHT),
  tile('lastryko-cieple', 'Lastryko ciepłe – terakota, karmel, grafit', 'gres', 'both', [0.6, 0.6], ['#ece6da', '#e9e2d5'], 'terrazzo', { color: '#e3dccf', width: 0.002 },
    { chips: ['#b5654a', '#a4553f', '#c98a5e', '#d2a274', '#d9b990', '#cdbfa8', '#e8c9a8', '#4a4b4e', '#8a8780'] }),
  tile('plyta-bezowa-60x120', 'Płyta beżowa 60 × 120', 'gres', 'both', [0.6, 1.2], ['#e3d8c6', '#dfd3c0', '#e7ddcc'], 'clouds', GROUT_BEIGE),

  // ------------------------------------------------------------ płytki ścienne
  tile('plytka-terakota-30x60', 'Płytka terakotowa gładka 30 × 60', 'plytki-scienne', 'wall', [0.6, 0.3], ['#b9694b', '#b46447', '#be6e50', '#b06045'], 'plain', { color: '#c9a58f', width: 0.002 }),
  tile('plytka-terakota-7x30', 'Płytka terakotowa gładka 7,5 × 30', 'plytki-scienne', 'wall', [0.075, 0.3], ['#b9694b', '#b26145', '#c07152', '#ab5c41', '#bd6c4e'], 'plain', { color: '#e3d6c6', width: 0.002 }),
  tile('metro-biale', 'Metro białe 10 × 20', 'plytki-scienne', 'wall', [0.2, 0.1], ['#f6f6f3', '#f3f3f0', '#f8f8f6'], 'plain', GROUT_LIGHT, { pattern: 'brick' }),
  tile('metro-zielone', 'Metro butelkowa zieleń', 'plytki-scienne', 'wall', [0.2, 0.1], ['#2f5d4e', '#2a5647', '#356555', '#264f41'], 'plain', { color: '#f4f4f2', width: 0.002 }, { pattern: 'brick' }),
  tile('metro-czarne', 'Metro czarne', 'plytki-scienne', 'wall', [0.2, 0.1], ['#26272a', '#222326', '#2b2c2f'], 'plain', GROUT_DARK, { pattern: 'brick' }),
  tile('plytka-biala-30x60', 'Płytka biała 30 × 60', 'plytki-scienne', 'wall', [0.6, 0.3], ['#f7f7f5', '#f5f5f2'], 'plain', { color: '#f4f4f2', width: 0.002 }),
  tile('plytka-bezowa-30x60', 'Płytka beżowa 30 × 60', 'plytki-scienne', 'wall', [0.6, 0.3], ['#e6dccb', '#e1d6c4', '#eae1d1'], 'plain', { color: '#d6c9b3', width: 0.002 }),
  tile('plytka-szara-30x60', 'Płytka szara 30 × 60', 'plytki-scienne', 'wall', [0.6, 0.3], ['#c3c5c5', '#bdbfbf', '#c9cbcb'], 'clouds', GROUT_GREY),
  tile('plytka-szalwiowa', 'Płytka szałwiowa 7,5 × 30', 'plytki-scienne', 'wall', [0.075, 0.3], ['#a9bba3', '#a1b49b', '#b2c3ac', '#9bae95'], 'plain', { color: '#f4f4f2', width: 0.002 }),
  tile('plytka-biala-20x20', 'Płytka biała 20 × 20', 'plytki-scienne', 'wall', [0.2, 0.2], ['#f7f7f5', '#f4f4f1'], 'plain', GROUT_GREY),

  // ------------------------------------------------------------ beton / mikrocement
  seamless('beton-szary', 'Beton szary', 'beton', 'both', [2.4, 2.4], ['#a7a8a5', '#9c9d9a', '#b3b4b1'], 'clouds'),
  seamless('mikrocement-jasny', 'Mikrocement jasny', 'beton', 'both', [2.4, 2.4], ['#d6d4cf', '#cdcbc6', '#dedcd7'], 'clouds'),
  seamless('mikrocement-bezowy', 'Mikrocement beżowy', 'beton', 'both', [2.4, 2.4], ['#d3c6b2', '#c9bca8', '#dbcfbc'], 'clouds'),
  seamless('mikrocement-grafit', 'Mikrocement grafitowy', 'beton', 'both', [2.4, 2.4], ['#55585b', '#4c4f52', '#5f6265'], 'clouds'),
  seamless('posadzka-zywica-szara', 'Posadzka żywiczna szara (garaż)', 'beton', 'floor', [2.4, 2.4], ['#93979a', '#8a8e91', '#9ca0a3'], 'clouds'),

  // ------------------------------------------------------------ kamień
  tile('marmur-carrara', 'Marmur Carrara', 'kamien', 'both', [0.6, 1.2], ['#eeeeec', '#e9e9e7', '#f3f3f1'], 'veins', { color: '#f4f4f2', width: 0.002 }),
  tile('trawertyn', 'Trawertyn', 'kamien', 'both', [0.6, 0.6], ['#dccfb9', '#d5c7b0', '#e2d6c2'], 'slate', { color: '#d6c9b3', width: 0.002 }),
  tile('granit-szary', 'Granit szary', 'kamien', 'both', [0.6, 0.6], ['#9b9c9c', '#959696'], 'speckle', GROUT_GREY, { chips: ['#5c5e60', '#c9cacb', '#7d7f81', '#2f3133'] }),
  tile('lupek-grafitowy', 'Łupek grafitowy', 'kamien', 'both', [0.6, 0.3], ['#474a4e', '#3f4246', '#4f5256', '#393c40'], 'slate', GROUT_DARK, { pattern: 'brick' }),
  tile('kamien-dekoracyjny', 'Kamień dekoracyjny (panel)', 'kamien', 'wall', [0.6, 0.15], ['#b9ad9b', '#a89c8a', '#c7bcab', '#9a8e7d', '#d1c7b8'], 'slate', { color: '#6f6659', width: 0.001 }, { pattern: 'brick' }),
  tile('kamien-kominkowy-cieply', 'Kamień kominkowy ciepły (piaskowiec)', 'kamien', 'wall', [0.4, 0.1], ['#d8c6a8', '#cdb997', '#e0d0b5', '#c4ae8b', '#d3bf9f', '#e6d9c2'], 'slate', { color: '#a8977c', width: 0.002 }, { pattern: 'brick' }),

  // ------------------------------------------------------------ cegła i tynk
  brick('cegla-stara-czerwona', 'Stara cegła czerwona', ['#9c4a35', '#8e3f2d', '#a8553c', '#7f3a2b', '#b0603f', '#93503a', '#a34a30', '#6f342a'], ['#2e1a14', '#d9b9a0', '#5a2a20'], '#d2c8b8'),
  brick('cegla-bielona', 'Cegła bielona', ['#e6dfd3', '#ddd3c5', '#ece6db', '#d8c9ba', '#e1d8ca', '#d2bcab'], ['#b98a74', '#ffffff', '#a8958a'], '#ebe6dc'),
  seamless('tynk-strukturalny-jasny', 'Tynk strukturalny – ciepła biel', 'cegla', 'wall', [2.4, 2.4], ['#efe9dd', '#e9e2d5', '#f4efe5'], 'plaster'),
  seamless('tynk-strukturalny-bezowy', 'Tynk strukturalny – jasny beż', 'cegla', 'wall', [2.4, 2.4], ['#e2d6c3', '#dacdb9', '#e8ddcc'], 'plaster'),

  // ------------------------------------------------------------ wykładzina
  seamless('wykladzina-szara', 'Wykładzina szara', 'wykladzina', 'floor', [1, 1], ['#9a9c9f', '#8f9194', '#a5a7aa'], 'carpet'),
  seamless('wykladzina-bezowa', 'Wykładzina beżowa', 'wykladzina', 'floor', [1, 1], ['#cdbfa8', '#c3b59e', '#d6c9b3'], 'carpet'),
  seamless('wykladzina-grafitowa', 'Wykładzina grafitowa', 'wykladzina', 'floor', [1, 1], ['#4b4e53', '#43464b', '#54575c'], 'carpet'),
  seamless('wykladzina-granatowa', 'Wykładzina granatowa', 'wykladzina', 'floor', [1, 1], ['#2f3d57', '#28354d', '#374661'], 'carpet'),
];

const BY_ID = new Map(MATERIALS.map((m) => [m.id, m]));

/** @returns {MaterialDef|undefined} */
export const libraryMaterial = (id) => BY_ID.get(id);

/** Domyślne wykończenia przy pierwszym wyborze "płytek do wysokości". */
export const DEFAULT_SPLIT_MATERIAL = 'plytka-biala-30x60';
export const DEFAULT_SPLIT_HEIGHT = 1.2;

// MEBLE STARTOWE Z PROJEKTU – czysta funkcja (bez DOM i bez Three.js).
// Importuje ją funkcja "warianty" przy tworzeniu pierwszego wariantu; użytkownik może potem wszystko zmieniać i usuwać.
//
// Zasada: jest tu TYLKO to, co projekt rysuje i co ma w odczycie (model3d/etap1_analiza) współrzędne.
// Położenie i wymiary rzutu pochodzą z rysunku (układ domu: metry, (0,0) = narożnik muru).
// Czego projekt nie podaje (wysokości), jest oznaczone jako ZAŁOŻENIE.
//
// Świadomie POMINIĘTE (projekt je rysuje, ale odczyt nie zawiera ich położenia ani wymiarów – nie zgadujemy):
//   regały w spiżarni 0/4, zabudowa kuchni i wyspa 0/5, meble salonu 0/6, umywalka i WC w łazience 0/3,
//   sanitariaty łazienek 1/7 i 1/10, umywalka i urządzenie "Z" w pralni 1/6.
import { typeOf } from './catalog.js';

// Granice sufitu płaskiego na poddaszu (house.json → levels[poddasze].ceiling.slopes[].flatFrom).
// Bliżej ścianek kolankowych (y < 1,857 albo y > 8,243) jest skos od 1,425 m do 2,55 m.
const FLAT_FROM_S = 1.857;
const FLAT_FROM_N = 8.243;

// ZAŁOŻENIE: wysokość szaf/zabudów – projekt rysuje tylko rzut. Pod sufitem płaskim (2,55 m) typowa zabudowa 2,40 m;
// pod skosem 1,40 m (projekt opisuje przy ściance kolankowej "h=140cm"; skos zaczyna się na 1,425 m).
const H_FULL = 2.4;
const H_UNDER_SLOPE = 1.4;

// Strona, do której mebel stoi TYŁEM → obrót (przy rot = 0 tył patrzy w +y, czyli w górę arkusza).
const ROT_BY_BACK = { N: 0, W: 90, S: 180, E: 270 };

/**
 * Prostokąty z projektu. rect = [x_min, y_min, x_max, y_max] w układzie domu, back = strona przy ścianie.
 * Szafy poddasza: poddasze_final.json → pomieszczenia_uwagi.prostokaty_przekreslone_X.lista_m
 * (cienkie prostokąty przekreślone po przekątnych, głębokość ok. 60 cm – "najpewniej szafy wnękowe/zabudowy").
 */
const FROM_PROJECT = [
  // --- PARTER
  // parter_final.json: pomieszczenie 0/1 "szafa wnekowa (prostokat z przekatnymi) x 5,30..6,50, y 2,05..2,65 = 1,20 x 0,60";
  // parter_final.md, rozstrzygnięcie "Szafa w wiatrolapie" (pomiar wektorowy). Wysokość: ZAŁOŻENIE 2,40 m.
  { id: 'start-szafa-wiatrolap', type: 'szafa-wnekowa', levelId: 'parter', rect: [5.3, 2.05, 6.5, 2.65], back: 'N', h: H_FULL },
  // parter_final.json: komin/wyposażenie id "kominek" – "obrys kominka (wyposazenie)" [9,41; 2,79; 9,96; 3,66] = 55 × 87 cm,
  // to samo w house.json (chimneys K-C → fireplaceOutline). Stoi tyłem do bloku komina K-C.
  // Wysokość: ZAŁOŻENIE 2,20 m (projekt podaje tylko obrys w rzucie).
  { id: 'start-kominek', type: 'kominek', levelId: 'parter', rect: [9.41, 2.79, 9.96, 3.66], back: 'W', h: 2.2 },

  // --- PODDASZE (lista_m, w kolejności z pliku)
  // 1/11 Garderoba: x 2,60..4,45, y 9,253..9,85 – wzdłuż ścianki kolankowej, w całości pod skosem → ZAŁOŻENIE h = 1,40.
  { id: 'start-szafa-1-11-a', type: 'szafa-wnekowa', levelId: 'poddasze', rect: [2.6, 9.253, 4.45, 9.85], back: 'N', h: H_UNDER_SLOPE },
  // 1/11 Garderoba: x 4,45..5,05, y 7,24..9,85 – przy ścianie nośnej; dzielona na część pod sufitem płaskim i pod skosem.
  { id: 'start-szafa-1-11-b', type: 'szafa-wnekowa', levelId: 'poddasze', rect: [4.45, 7.24, 5.05, 9.85], back: 'E' },
  // 1/9 Pokój: x 4,45..5,05, y 4,84..7,12 – cała pod sufitem płaskim.
  { id: 'start-szafa-1-9', type: 'szafa-wnekowa', levelId: 'poddasze', rect: [4.45, 4.84, 5.05, 7.12], back: 'E' },
  // 1/8 Pokój: x 4,45..5,05, y 0,25..3,40 – przy ścianie nośnej; dzielona jak wyżej.
  { id: 'start-szafa-1-8', type: 'szafa-wnekowa', levelId: 'poddasze', rect: [4.45, 0.25, 5.05, 3.4], back: 'E' },
  // 1/3 Pokój: x 5,30..5,897, y 7,052..9,85 – przy ścianie nośnej; dzielona jak wyżej.
  // (Projekt rysuje szafy pokoju 1/3 od y = 7,052, czyli 13 cm od ściany D-7 – zostawione jak na rysunku.)
  { id: 'start-szafa-1-3-a', type: 'szafa-wnekowa', levelId: 'poddasze', rect: [5.3, 7.052, 5.897, 9.85], back: 'W' },
  // 1/3 Pokój: x 5,897..7,908, y 7,052..7,653 – tyłem do ściany klatki schodowej.
  { id: 'start-szafa-1-3-b', type: 'szafa-wnekowa', levelId: 'poddasze', rect: [5.897, 7.052, 7.908, 7.653], back: 'S' },
  // 1/4 Pokój: x 9,55..13,348, y 5,232..5,812 – wzdłuż ścianki działowej między pokojami 1/4 i 1/5.
  { id: 'start-szafa-1-4', type: 'szafa-wnekowa', levelId: 'poddasze', rect: [9.55, 5.232, 13.348, 5.812], back: 'S' },
];

const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000; // środek prostokąta o wymiarach co 1 mm wypada co 0,5 mm

/** Prostokąt osiowy z projektu → FurnitureItem (środek, obrót, szerokość wzdłuż ściany, głębokość od ściany). */
function toItem({ id, type, levelId, rect, back, h }) {
  const [x0, y0, x1, y1] = rect;
  const alongX = back === 'N' || back === 'S'; // ściana pozioma na arkuszu → szerokość mebla biegnie wzdłuż x
  return {
    id, type, levelId,
    x: r4((x0 + x1) / 2),
    y: r4((y0 + y1) / 2),
    rot: ROT_BY_BACK[back],
    w: r3(alongX ? x1 - x0 : y1 - y0),
    d: r3(alongX ? y1 - y0 : x1 - x0),
    h,
    color: typeOf({ type }).color,
  };
}

/**
 * Szafa poddasza bez podanej wysokości: część pod sufitem płaskim dostaje 2,40 m, część pod skosem 1,40 m
 * (ZAŁOŻENIE – jedna bryła 2,40 m przebijałaby skos dachu). Rzut obu części razem jest dokładnie prostokątem z projektu.
 */
function splitUnderSlope(entry) {
  if (entry.h !== undefined) return [entry];
  const [x0, y0, x1, y1] = entry.rect;
  const parts = [];
  const add = (a, b, h, suffix) => {
    if (b - a > 0.01) parts.push({ ...entry, id: entry.id + suffix, rect: [x0, a, x1, b], h });
  };
  const flat0 = Math.min(y1, Math.max(y0, FLAT_FROM_S));
  const flat1 = Math.max(y0, Math.min(y1, FLAT_FROM_N));
  add(y0, flat0, H_UNDER_SLOPE, '-skos-s');
  add(flat0, flat1, H_FULL, parts.length || flat1 < y1 ? '-wysoka' : '');
  add(flat1, y1, H_UNDER_SLOPE, '-skos-n');
  return parts;
}

/**
 * Meble narysowane w projekcie, gotowe do wstawienia do pierwszego wariantu.
 * @returns {import('../../app/variant.js').FurnitureItem[]}
 */
export function createStarterFurniture() {
  return FROM_PROJECT.flatMap(splitUnderSlope).map(toItem);
}

// Stałe przyjęte w kodzie – wszystko, czego NIE ma w house.json.
// Każda pozycja to "założenie": zmiana tutaj nie zmienia danych projektu.

// --- stolarka ---
/** założenie: głębokość ramy okna (jak frameDepth okna narożnego ON1 w house.json). */
export const FRAME_DEPTH = 0.07;
/** założenie: widoczna szerokość profilu ramy okna/drzwi balkonowych. */
export const FRAME_WIDTH = 0.06;
/** założenie: szerokość słupka między kwaterami okna (pole panes). */
export const MULLION_WIDTH = 0.08;
/** założenie (A13): ościeżnica drzwi wewnętrznych 6 cm (hingeOffset), wystaje 1 cm przed lico ściany. */
export const DOOR_FRAME = 0.06;
export const DOOR_CASING = 0.01;
/** założenie: grubość skrzydła drzwi i szczelina nad posadzką. */
export const DOOR_LEAF_THICKNESS = 0.04;
export const DOOR_LEAF_GAP = 0.01;
/** założenie: grubość skrzydła drzwi wejściowych i bramy garażowej. */
export const ENTRANCE_LEAF_THICKNESS = 0.06;
export const GARAGE_DOOR_THICKNESS = 0.05;
/** założenie: balustrada szklana okien do podłogi – odsunięcie od lica ocieplenia (projekt: 5–9 cm) i grubość tafli. */
export const FRENCH_BALCONY_OFFSET = 0.07;
export const FRENCH_BALCONY_GLASS = 0.02;
/** założenie: pochwyt balustrady szklanej – wysokość profilu i wysięg poza taflę z każdej strony. */
export const FRENCH_BALCONY_RAIL_HEIGHT = 0.03;
export const FRENCH_BALCONY_RAIL_OVERHANG = 0.01;
/** założenie: rama okna dachowego (szerokość profilu i wysunięcie ponad połać). */
export const ROOF_WINDOW_FRAME = 0.05;
export const ROOF_WINDOW_FRAME_RISE = 0.04;

// --- bryła zewnętrzna ---
/** założenie: cokół (inny kolor) od terenu do poziomu posadzki parteru ±0,00. */
export const PLINTH_TOP = 0.0;
/** założenie: teren jako płaszczyzna o boku 90 m wokół domu. */
export const TERRAIN_SIZE = 90;
/** założenie: boki podjazdu schodzą 5 cm pod teren, żeby przy spadku nie było szczeliny. */
export const PAVING_SKIRT = 0.05;

// --- schody i balustrady ---
/** założenie: balustrada = słupki 3 × 3 cm co ok. 0,90 m + pochwyt 4 × 4 cm + poprzeczka w połowie wysokości. */
export const BALUSTRADE_POST = 0.03;
export const BALUSTRADE_RAIL = 0.04;
export const BALUSTRADE_POST_SPACING = 0.9;
/** założenie: balustrady biegów odsunięte o 3 cm od osi duszy, żeby dolna i górna się nie nakładały. */
export const BALUSTRADE_SIDE_OFFSET = 0.03;

// --- sufity ---
/** założenie: klapa wyłazu stropowego WS wystaje 1,5 cm pod sufit. */
export const HATCH_DROP = 0.015;

// --- widoki ---
/** Wysokość cięcia w widoku z góry (nad posadzką kondygnacji). */
export const SECTION_HEIGHT = 1.2;
/** założenie: ciemne czapki przekroju (mury i stolarka) leżą 2 mm pod płaszczyzną cięcia, żeby cięcie ich nie zjadało. */
export const SECTION_CAP_DROP = 0.002;
/** Spacer: wysokość oczu, promień postaci, największy stopień, minimalna wysokość przejścia pod schodami. */
export const EYE_HEIGHT = 1.6;
export const WALK_RADIUS = 0.25;
export const WALK_MAX_STEP = 0.25;
export const WALK_MIN_HEADROOM = 1.8;
/** założenie: pod skosem kamera obniża się, żeby zostało 12 cm do okładziny. */
export const WALK_HEAD_CLEARANCE = 0.12;

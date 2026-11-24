// Gotowa aranżacja „Montana”: ciepłe drewno, cegła, kamień i czarne loftowe akcenty w całym domu.
// Dane leżą w dwóch modułach (osobno parter i poddasze) – tutaj są tylko składane w jeden wariant.
//
// Wariant zakłada bryłę z design.json (otwarty sufit w strefie rodziców, lamele przy schodach): wykończenia
// skosów sypialni ('poddasze:1/9:slope-N' / 'slope-S') istnieją tylko wtedy. Przy dodawaniu wariantu wykończenia
// powierzchni, których nie ma w bieżącej bryle, są pomijane przez walidację – tak samo jak przy imporcie pliku.
import * as parter from './montana/parter.js';
import * as poddasze from './montana/poddasze.js';

const LEVELS = [parter, poddasze];

/**
 * Nowa, niezależna kopia wariantu (dane modułów nie są współdzielone z aplikacją).
 * Identyfikator i nazwę ostatecznie ustala kontroler (kolizja id → nowy id, kolizja nazwy → dopisek).
 * @returns {import('../../../app/variant.js').Variant}
 */
export function createMontana() {
  return JSON.parse(JSON.stringify({
    id: 'montana',
    name: 'Montana',
    finishes: Object.assign({}, ...LEVELS.map((l) => l.finishes)),
    furniture: LEVELS.flatMap((l) => l.furniture),
    customMaterials: [],
  }));
}

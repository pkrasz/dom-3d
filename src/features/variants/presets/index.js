// Rejestr GOTOWYCH ARANŻACJI – wariantów przygotowanych razem z aplikacją (panel Warianty → „Gotowe aranżacje”).
//
// Kolejną aranżację dodaje się JEDNYM wpisem w PRESETS:
//   { id, name, description, create }
//     id          – stały identyfikator (małe litery, cyfry, „-”); nie zmieniać po publikacji
//     name        – nazwa na przycisku i domyślna nazwa dodanego wariantu
//     description – jedno zdanie pod przyciskiem
//     create()    – zwraca NOWY obiekt wariantu { id, name, finishes, furniture, customMaterials }
// Dane aranżacji to zwykły wariant (ten sam kształt co plik eksportu), najlepiej w osobnym module obok.
// Gotowa aranżacja jest zawsze DODAWANA jako nowy wariant – niczego nie nadpisuje, a po dodaniu jest zwykłym,
// edytowalnym wariantem użytkownika (późniejsze zmiany w tym pliku nie zmieniają wariantów już dodanych).
// Spójność danych (kolizje mebli, znane materiały i powierzchnie, link) pilnuje tests/presets.test.js.
import { createMontana } from './montana.js';

/**
 * @typedef {Object} Preset
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {() => import('../../../app/variant.js').Variant} create
 */

/** @type {Preset[]} */
export const PRESETS = [
  {
    id: 'montana',
    name: 'Montana',
    description: 'Cały dom: ciepłe drewno, cegła i kamień, czarne loftowe akcenty; kuchnia z wyspą-barkiem i stół na 6 osób.',
    create: createMontana,
  },
];

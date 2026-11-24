// Eksport i import plików JSON. Część czysta (buildExport, exportFileName, formatDateTime) nie dotyka DOM;
// downloadText i readFileText to cienkie opakowania na API przeglądarki.
import { APP_ID, CURRENT_VERSION, LIMITS } from './validate.js';

const pad = (n) => String(n).padStart(2, '0');

/** Zawartość pliku eksportu. @param {Object[]} variants @param {Date} date */
export function buildExport(variants, date) {
  return { app: APP_ID, version: CURRENT_VERSION, exportedAt: date.toISOString(), variants };
}

const PL = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };

/** Bezpieczny fragment nazwy pliku: bez polskich znaków, spacji i znaków specjalnych. */
export function slug(text) {
  const s = String(text)
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL[c])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return s || 'wariant';
}

/** Nazwa pliku: 'dom-<nazwa>-RRRR-MM-DD.json' (data lokalna, przekazana z zewnątrz). */
export function exportFileName(name, date) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `dom-${slug(name)}-${day}.json`;
}

/** 'DD.MM.RRRR, GG:MM' w czasie lokalnym. */
export function formatDateTime(date) {
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Polska odmiana po liczbie: plural(5, 'wariant', 'warianty', 'wariantów') → '5 wariantów'. */
export function plural(n, one, few, many) {
  const d = n % 10;
  const h = n % 100;
  const word = n === 1 ? one : d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? few : many;
  return `${n} ${word}`;
}

/** Zapisuje tekst jako plik (Blob + tymczasowy link z atrybutem download). */
export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // adres zwalniamy z opóźnieniem – Safari na iOS potrzebuje chwili, żeby zacząć pobieranie
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Czyta wybrany plik jako tekst. Zbyt duży plik odrzuca bez czytania.
 * @param {File} file
 * @returns {Promise<{ok: true, text: string} | {ok: false, error: string}>}
 */
export async function readFileText(file) {
  if (!file) return { ok: false, error: 'Nie wybrano pliku.' };
  if (file.size > LIMITS.fileChars) return { ok: false, error: 'Plik jest za duży – to nie wygląda na zapis wariantów.' };
  try {
    const text = typeof file.text === 'function'
      ? await file.text()
      : await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
    return { ok: true, text };
  } catch {
    return { ok: false, error: 'Nie udało się odczytać pliku.' };
  }
}

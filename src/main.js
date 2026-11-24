// Start aplikacji: wczytuje house.json, buduje rdzeń i uruchamia funkcje z src/features/*.
import './ui/styles.css';
import house from '../house.json';
import { createApp } from './app/app.js';
import { init as initFinishes } from './features/finishes/index.js';
import { init as initFurniture } from './features/furniture/index.js';
import { init as initVariants } from './features/variants/index.js';

const container = document.getElementById('app');
const canvas = document.getElementById('scena');
const uiRoot = document.getElementById('ui');

try {
  const app = createApp({ house, container, canvas, uiRoot });

  // Kolejność: warianty (wczytanie zapisanego stanu) → wykończenia → meble.
  // Błąd jednej funkcji nie może zatrzymać modelu.
  // Wyniki init() zostają w app.features (np. app.features.variants.exportData) – patrz JSDoc w app.js.
  app.features = {};
  for (const [name, init] of [['variants', initVariants], ['finishes', initFinishes], ['furniture', initFurniture]]) {
    try {
      app.features[name] = init(app);
    } catch (err) {
      console.error(`Funkcja "${name}" nie wystartowała:`, err);
    }
  }

  app.start();
  if (import.meta.env.DEV) window.app = app; // podgląd w konsoli podczas pracy
} catch (err) {
  console.error(err);
  const box = document.createElement('div');
  box.className = 'fatal';
  box.textContent = 'Nie udało się uruchomić modelu 3D. Sprawdź, czy przeglądarka obsługuje WebGL, i odśwież stronę.';
  uiRoot.append(box);
}

// Własna płytka: zdjęcie z dysku / aparatu → pomniejszony JPEG jako dataURL (trafia do variant.customMaterials).

// Tekstura nigdy nie pokazuje jednego elementu (płytki) w więcej niż 512 px (textures.js: komórka najwyżej
// 1024 px i co najmniej 2 × 2 elementy), więc większe zdjęcie tylko zapychałoby wariant, jego kopie i localStorage.
export const MAX_IMAGE_PX = 512;
const JPEG_QUALITY = 0.8;

/** Rozmiar po pomniejszeniu z zachowaniem proporcji – dłuższy bok najwyżej `max` pikseli (nigdy nie powiększa). */
export function fitSize(width, height, max = MAX_IMAGE_PX) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** Nazwa materiału z nazwy pliku: 'IMG_1234.jpeg' → 'IMG 1234'. */
export function nameFromFile(fileName) {
  const base = String(fileName || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
  return (base || 'Własna płytka').slice(0, 40);
}

/** Nowy identyfikator materiału własnego (nie koliduje z biblioteką – prefiks 'wlasny-'). */
export function newCustomId() {
  return `wlasny-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Nie udało się wczytać obrazu'));
    };
    img.src = url;
  });
}

/**
 * Wczytuje plik obrazu i zwraca go pomniejszonego do MAX_IMAGE_PX jako JPEG.
 * (Przeglądarka sama uwzględnia orientację zdjęcia z aparatu zapisaną w EXIF.)
 * @param {File} file
 * @returns {Promise<{dataUrl: string, width: number, height: number}>}
 */
export async function fileToDataUrl(file) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('To nie jest plik obrazu');
  const img = await loadImage(file);
  const { width, height } = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Brak obsługi canvas 2D');
  ctx.fillStyle = '#ffffff'; // przezroczyste PNG → białe tło (JPEG nie ma przezroczystości)
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width, height };
}

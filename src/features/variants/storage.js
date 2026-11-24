// Odczyt i zapis stanu wariantów w localStorage – z obsługą wszystkich typowych awarii:
// brak dostępu (tryb prywatny, zablokowane dane witryn), przepełnienie (QuotaExceededError), uszkodzony wpis.
// Moduł niczego nie rzuca: każda operacja zwraca wynik opisujący, co się stało.

export const STORAGE_KEY = 'model3d-dom';

/** localStorage albo null – samo sięgnięcie po window.localStorage potrafi rzucić SecurityError. */
export function defaultStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Czy wyjątek oznacza brak miejsca? (nazwy i kody różnią się między przeglądarkami) */
export function isQuotaError(err) {
  if (!err) return false;
  return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014;
}

/**
 * @param {{storage?: ?Storage, key?: string}} [options]  storage wstrzykiwany w testach
 */
export function createStorage({ storage = defaultStorage(), key = STORAGE_KEY } = {}) {
  /** Próba zapisu: czy storage w ogóle przyjmuje dane? (Safari w trybie prywatnym ma limit 0) */
  function probe() {
    if (!storage) return false;
    try {
      const testKey = `${key}:test`;
      storage.setItem(testKey, '1');
      storage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }
  const available = probe();

  return {
    key,
    /** false = pracujemy bez zapisu */
    available,
    /** @returns {{status: 'ok', text: string} | {status: 'empty'} | {status: 'unavailable'}} */
    read() {
      if (!storage) return { status: 'unavailable' };
      try {
        const text = storage.getItem(key);
        if (typeof text === 'string' && text) return { status: 'ok', text };
        return available ? { status: 'empty' } : { status: 'unavailable' };
      } catch {
        return { status: 'unavailable' };
      }
    },
    /** @returns {{ok: true} | {ok: false, reason: 'quota' | 'unavailable'}} */
    write(text) {
      if (!storage) return { ok: false, reason: 'unavailable' };
      try {
        storage.setItem(key, text);
        return { ok: true };
      } catch (err) {
        // poprzedni zapis zostaje nietknięty – setItem jest atomowe
        return { ok: false, reason: isQuotaError(err) ? 'quota' : 'unavailable' };
      }
    },
    /** Odkłada uszkodzony wpis pod osobnym kluczem, żeby dało się go ręcznie odzyskać. */
    backup(text) {
      try {
        storage?.setItem(`${key}:uszkodzony`, text);
        return true;
      } catch {
        return false;
      }
    },
  };
}

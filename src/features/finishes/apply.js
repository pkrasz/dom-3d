// Doprowadza powierzchnie sceny do stanu variant.finishes (różnicowo): Finish → materiał(y) Three.js,
// a dla podziału "płytki do wysokości" także przecięta geometria z dwiema grupami materiałów.
//
// Zasady:
//  - podmiana materiału zawsze przez app.setSurfaceMaterial / resetSurfaceMaterial (podpina przekrój widoku z góry),
//  - oryginalna geometria powierzchni jest zapamiętana przy starcie i przywracana, gdy podział znika,
//  - wszystko, co tu powstaje (materiały, geometrie, tekstury), jest tu zwalniane.
import { BufferGeometry, BufferAttribute, MeshLambertMaterial } from 'three';
import { normalizeFinish, finishKey, simpleKey, resolveMaterial } from './finish.js';
import { cutByV, mapDrawCount } from './split.js';

/**
 * Geometria ściany po cięciu. Rdzeń (viewManager) ukrywa końcówki niektórych ścian przez
 * mesh.geometry.setDrawRange(0, n), gdzie n to numer wierzchołka w siatce ŹRÓDŁOWEJ. Po cięciu wierzchołków
 * jest więcej, więc ta klasa tłumaczy n na własną numerację (kolejność odcinków jest zachowana – patrz split.js)
 * i pamięta wartość źródłową, żeby dało się ją oddać oryginalnej geometrii.
 */
export class SplitGeometry extends BufferGeometry {
  /** @param {ReturnType<typeof cutByV>} cut */
  constructor(cut) {
    super();
    this.setAttribute('position', new BufferAttribute(cut.position, 3));
    this.setAttribute('normal', new BufferAttribute(cut.normal, 3));
    this.setAttribute('uv', new BufferAttribute(cut.uv, 2));
    for (const g of cut.groups) this.addGroup(g.start, g.count, g.materialIndex);
    this.boundaryMap = cut.boundaryMap;
    this.sourceDrawCount = Infinity;
    this.computeBoundingBox();
    this.computeBoundingSphere();
  }

  setDrawRange(start, count) {
    this.sourceDrawCount = count;
    super.setDrawRange(0, mapDrawCount(this.boundaryMap, count));
  }
}

/** Ile wierzchołków siatki źródłowej jest teraz rysowanych (Infinity = wszystkie). */
export function sourceDrawCount(geometry) {
  return geometry.sourceDrawCount !== undefined ? geometry.sourceDrawCount : geometry.drawRange.count;
}

/**
 * @param {import('../../app/app.js').App} app
 * @param {ReturnType<import('./textures.js').createTextureCache>} textures
 */
export function createFinishApplier(app, textures) {
  /** Oryginalne geometrie powierzchni (z rdzenia) – nigdy ich nie zmieniamy ani nie zwalniamy. */
  const originals = new Map();
  for (const s of app.surfaces.values()) originals.set(s.id, s.mesh.geometry);

  /**
   * Stan powierzchni z własnym wykończeniem:
   * { key, parts: [{material, textureKey, key, paint, pending}], split: ?{height, geometry: ?, lowerArea, upperArea}, pending }
   */
  const states = new Map();

  /** Materiał dla wykończenia prostego; null → wygląd domyślny (kopia materiału rdzenia). */
  function makePart(surface, simple, customMaterials) {
    if (simple && simple.kind === 'paint') {
      const material = new MeshLambertMaterial({ color: simple.color });
      material.name = `farba:${simple.color}`;
      return { material, textureKey: null, pending: false };
    }
    const def = simple ? resolveMaterial(simple.id, customMaterials) : null;
    if (!def) {
      const material = surface.defaultMaterial.clone();
      return { material, textureKey: null, pending: false };
    }
    const t = textures.acquire(def, simple);
    const material = new MeshLambertMaterial({ color: t.color, map: t.texture });
    material.name = `materiał:${def.id}`;
    return { material, textureKey: t.key, pending: t.pending };
  }

  function disposePart(part) {
    part.material.dispose();
    textures.release(part.textureKey);
  }

  function disposeParts(state) {
    for (const part of state.parts) disposePart(part);
    state.parts = [];
  }

  function setGeometry(surface, geometry) {
    const mesh = surface.mesh;
    if (mesh.geometry === geometry) return;
    const count = sourceDrawCount(mesh.geometry);
    mesh.geometry = geometry;
    geometry.setDrawRange(0, count); // widoczność końcówek ścian (drawRange) przechodzi na nową geometrię
  }

  function restore(surface, state) {
    // wpis znika jako pierwszy: gdyby zwalnianie zasobów zawiodło, powierzchnia nie zostaje w "zawieszonym" stanie
    states.delete(surface.id);
    setGeometry(surface, originals.get(surface.id));
    app.resetSurfaceMaterial(surface.id);
    disposeParts(state);
    state.split?.geometry?.dispose(); // geometry === null, gdy cięcie wypadło ponad (albo pod) całą ścianą
  }

  /** Przecina oryginalną geometrię; null, gdy cała powierzchnia leży po jednej stronie cięcia. */
  function makeSplit(surface, height) {
    const src = originals.get(surface.id);
    const u = surface.mesh.userData;
    const cut = cutByV(
      { position: src.attributes.position.array, normal: src.attributes.normal.array, uv: src.attributes.uv.array },
      height,
      [u.headerStart, u.upperStart].filter((b) => b != null)
    );
    const info = { height, geometry: null, lowerArea: cut.lowerArea, upperArea: cut.upperArea };
    if (cut.lowerCount > 0 && cut.upperCount > 0) info.geometry = new SplitGeometry(cut);
    return info;
  }

  /**
   * Nakłada wykończenie różnicowo, CZĘŚĆ PO CZĘŚCI (powierzchnia zwykła ma jedną część, podzielona – dwie):
   *  - część o tym samym kluczu zostaje nietknięta (ten sam materiał i tekstura),
   *  - farba → farba to tylko zmiana koloru istniejącego materiału (próbnik koloru woła nas co 50 ms),
   *  - nowy materiał powstaje wyłącznie dla części, która zmieniła rodzaj albo materiał.
   * Dzięki temu przy malowaniu górnej części ściany z płytkami materiał płytek (i jego program shadera w three.js,
   * kasowany razem z ostatnim używającym go materiałem) nie jest tworzony od nowa przy każdym ruchu palca.
   */
  function apply(surface, norm, key, customMaterials) {
    const prev = states.get(surface.id);

    let split = null;
    let simples = [norm];
    if (norm.kind === 'split') {
      // geometria zależy tylko od wysokości – przy zmianie samego materiału zostaje ta sama
      split = prev?.split && prev.split.height === norm.height ? prev.split : makeSplit(surface, norm.height);
      // cięcie powyżej całej ściany (albo poniżej): jedna część pokrywa wszystko
      simples = split.geometry ? [norm.lower, norm.upper] : [split.lowerArea > 0 ? norm.lower : norm.upper];
    }

    // części można porównywać parami tylko wtedy, gdy układ (brak podziału / ten sam podział) się nie zmienił
    const sameLayout = Boolean(prev) && prev.split === split && prev.parts.length === simples.length;
    const kept = new Set();
    const parts = simples.map((simple, i) => {
      const partKey = simpleKey(simple, customMaterials);
      const paint = Boolean(simple) && simple.kind === 'paint';
      const old = sameLayout ? prev.parts[i] : null;
      if (old && !old.pending) {
        if (old.key === partKey) {
          kept.add(old);
          return old;
        }
        if (old.paint && paint) {
          old.material.color.set(simple.color);
          old.material.name = `farba:${simple.color}`;
          old.key = partKey;
          kept.add(old);
          return old;
        }
      }
      return { ...makePart(surface, simple, customMaterials), key: partKey, paint };
    });

    setGeometry(surface, (split && split.geometry) || originals.get(surface.id));
    if (!prev || parts.length !== prev.parts.length || parts.some((p, i) => p !== prev.parts[i])) {
      const materials = parts.map((p) => p.material);
      app.setSurfaceMaterial(surface.id, materials.length > 1 ? materials : materials[0]);
    }
    if (prev) {
      for (const part of prev.parts) if (!kept.has(part)) disposePart(part);
      if (prev.split && prev.split !== split) prev.split.geometry?.dispose();
    }
    states.set(surface.id, { key, parts, split, pending: parts.some((p) => p.pending) });
    app.requestRender();
  }

  /**
   * Doprowadza wszystkie powierzchnie do stanu wariantu. Przebudowuje tylko te, których wykończenie się zmieniło.
   * Nieznane surfaceId i nieznane materiały są pomijane bez błędu.
   * @param {import('../../app/variant.js').Variant} variant
   * @returns {number} liczba zmienionych powierzchni
   */
  function sync(variant) {
    const finishes = (variant && variant.finishes) || {};
    const customMaterials = (variant && Array.isArray(variant.customMaterials) && variant.customMaterials) || [];
    let changed = 0;
    for (const surface of app.surfaces.values()) {
      const state = states.get(surface.id);
      const raw = finishes[surface.id];
      if (!raw && !state) continue;
      let norm = null;
      try {
        norm = raw ? normalizeFinish(raw, { kind: surface.kind, customMaterials }) : null;
      } catch {
        norm = null; // uszkodzony wpis w wariancie – powierzchnia zostaje domyślna
      }
      const key = norm ? finishKey(norm, customMaterials) : '';
      if (state ? state.key === key && !state.stale : !key) continue;
      try {
        if (!key) restore(surface, state);
        else apply(surface, norm, key, customMaterials);
        changed += 1;
      } catch (err) {
        console.error(`Nie udało się nałożyć wykończenia na ${surface.id}:`, err);
        // jedna zepsuta powierzchnia nie może przerwać pętli po pozostałych
        try {
          if (states.has(surface.id)) restore(surface, states.get(surface.id));
        } catch (err2) {
          states.delete(surface.id);
          console.error(`Nie udało się przywrócić wyglądu ${surface.id}:`, err2);
        }
      }
    }
    textures.pruneImages(customMaterials);
    if (changed) app.requestRender();
    return changed;
  }

  return {
    sync,
    /** Po wczytaniu zdjęcia materiału własnego: powierzchnie czekające na teksturę zostaną przebudowane przy sync(). */
    markPendingStale() {
      let any = false;
      for (const state of states.values()) {
        if (state.pending) {
          state.stale = true;
          any = true;
        }
      }
      return any;
    },
    /** Oryginalna geometria powierzchni (do obrysu zaznaczenia). */
    originalGeometry: (surfaceId) => originals.get(surfaceId),
    /** Pola części podziału { lower, upper } w m² albo null, gdy powierzchnia nie jest podzielona. */
    splitAreas(surfaceId) {
      const s = states.get(surfaceId)?.split;
      return s ? { lower: s.lowerArea, upper: s.upperArea } : null;
    },
    /** Czy powierzchnia ma teraz własne wykończenie. */
    has: (surfaceId) => states.has(surfaceId),
    get count() {
      return states.size;
    },
    /** Przywraca wszystko do stanu domyślnego i zwalnia zasoby. */
    dispose() {
      for (const [id, state] of [...states]) {
        const surface = app.getSurface(id);
        if (surface) restore(surface, state);
      }
    },
  };
}

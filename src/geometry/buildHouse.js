// Składa cały model domu z house.json (+ opcje bryły z design.json: pusty obiekt = dokładnie projekt).
//
// Wynik:
//   group    – THREE.Group w UKŁADZIE DOMU (x, y, z w górę); scena obraca ją o -90° wokół X,
//   surfaces – Map surfaceId → { id, kind, levelId, roomId, mesh, widthM, heightM, areaM2, label, defaultMaterial },
//   statics  – siatki nieedytowalne (elewacja, dach, stolarka, schody…), scalone po materiale,
//   models   – modele kondygnacji (levelModel.js), stats – liczby do raportu.
//
// Każda siatka ma userData.levelId i userData.part:
//   'interior' | 'ceiling' | 'slab' | 'roof' | 'exterior' | 'stairs' | 'joinery' | 'cap'
// ('cap' = czapki murów; userData.cap: 'section' – przekrój w widoku z góry, 'top' – wierzch murów bez stropu).
import { Group, Mesh } from 'three';
import { MeshBuilder } from './meshBuilder.js';
import { buildLevelModel } from './levelModel.js';
import { buildWallSurfaces, buildFloorSurfaces, buildCeilingSurfaces, buildChimneySurfaces, thresholdRects, emitCeilingHatches } from './interior.js';
import { shellInfo, emitFacades, emitSlab, emitCaps } from './shell.js';
import { emitSite } from './site.js';
import { emitRoof } from './roof.js';
import { emitStairs, emitBalustrades } from './stairs.js';
import { emitBeams } from './beams.js';
import { designStaticColors, withDesign } from './design.js';
import { emitReveals, emitJoinery } from './joinery.js';
import { createSurfaceMaterial, createStaticMaterials } from '../render/materials.js';

/**
 * @param {Object} house   zawartość house.json
 * @param {Object} [design] opcje bryły z design.json (lamele przy schodach, stopnie drewniane, sufit otwarty do kalenicy,
 *                          drzwi przesuwne, dodatkowe okna połaciowe)
 */
export function buildHouse(projectHouse, design = {}) {
  // projekt + elementy dołożone opcjami bryły (okna połaciowe); bez nich to ten sam obiekt
  const house = withDesign(projectHouse, design);
  const models = house.levels.map((_, i) => buildLevelModel(house, i, design));
  const info = shellInfo(house);
  const group = new Group();
  group.name = 'dom';
  const surfaces = new Map();
  const statics = [];

  // ------------------------------------------------ powierzchnie edytowalne (jedna siatka = jedna powierzchnia)
  for (const model of models) {
    const descriptors = [
      ...buildFloorSurfaces(model),
      ...buildWallSurfaces(model),
      ...buildChimneySurfaces(model),
      ...buildCeilingSurfaces(model),
    ];
    for (const d of descriptors) {
      if (surfaces.has(d.id)) throw new Error(`Powtórzony identyfikator powierzchni: ${d.id}`);
      const material = createSurfaceMaterial(d.kind);
      const mesh = new Mesh(d.builder.build(), material);
      mesh.name = d.id;
      mesh.userData = { surfaceId: d.id, kind: d.kind, levelId: d.levelId, roomId: d.roomId, widthM: d.widthM, heightM: d.heightM, part: d.part };
      // ściany rysowane częściowo: od tych wierzchołków zaczynają się pasy podciągów i część ponad stropem (patrz interior.js)
      if (d.headerStart != null) mesh.userData.headerStart = d.headerStart;
      if (d.upperStart != null) mesh.userData.upperStart = d.upperStart;
      group.add(mesh);
      surfaces.set(d.id, {
        id: d.id, kind: d.kind, levelId: d.levelId, roomId: d.roomId, mesh,
        widthM: d.widthM, heightM: d.heightM, areaM2: d.builder.area, label: d.label, defaultMaterial: material,
      });
    }
  }

  // ------------------------------------------------ elementy stałe, scalane po (materiał, część, kondygnacja)
  const batches = new Map();
  const batch = (material, part, levelId, extra = {}) => {
    const key = `${levelId}|${part}|${material}|${extra.cap || ''}`;
    if (!batches.has(key)) batches.set(key, { material, part, levelId, extra, builder: new MeshBuilder() });
    return batches.get(key).builder;
  };

  for (const model of models) {
    const floorBatch = batch('threshold', 'interior', model.id);
    for (const { rect: [x0, y0, x1, y1] } of thresholdRects(model, model.extOpenings)) {
      const z = model.floor;
      floorBatch.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    }
    emitCeilingHatches(model, batch('trim', 'ceiling', model.id));
    emitReveals(model, batch);
    emitJoinery(house, model, batch);
  }
  emitFacades(house, models, info, batch);
  emitSlab(house, models, batch);
  emitCaps(house, models, info, batch);
  emitSite(house, info, batch);
  emitRoof(house, batch);
  emitStairs(house, batch, design);
  emitBalustrades(house, batch, design);
  emitBeams(house, models, design, batch);

  const materials = createStaticMaterials(designStaticColors(design));
  for (const b of batches.values()) {
    if (b.builder.isEmpty) continue;
    const mesh = new Mesh(b.builder.build(), materials[b.material]);
    mesh.name = `${b.levelId}:${b.part}:${b.material}`;
    mesh.userData = { levelId: b.levelId, part: b.part, static: b.material, areaM2: b.builder.area, ...b.extra };
    if (b.material === 'glass') mesh.renderOrder = 10; // szyby po wszystkim, co nieprzezroczyste
    group.add(mesh);
    statics.push(mesh);
  }

  let triangles = 0;
  group.traverse((o) => {
    if (o.isMesh) triangles += o.geometry.attributes.position.count / 3;
  });
  const stats = { surfaces: surfaces.size, staticMeshes: statics.length, drawCalls: surfaces.size + statics.length, triangles };

  return { group, surfaces, statics, staticMaterials: materials, models, shell: info, stats, design };
}

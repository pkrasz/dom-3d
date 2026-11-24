// Stolarka i glify otworów: ościeża, nadproża i parapety w grubości muru, ramy okien z szybami,
// balustrady szklane okien do podłogi, drzwi wewnętrzne (ościeżnica + skrzydło otwarte o 90°),
// drzwi wejściowe z doświetlem i brama garażowa (zamknięte). Wszystko we wspólnych, nieedytowalnych siatkach.
// Opcja bryły (design.json → doors.sliding): drzwi przesuwne „barn” – gładkie ościeża, skrzydło na szynie (slidingDoors.js).
import { openingRect, isVertical } from '../../tools/geometry.mjs';
import { EPS, pointInPolygon, rectCenter } from './plan.js';
import { slidingDoorsOf, emitSlidingDoor } from './slidingDoors.js';
import {
  FRAME_DEPTH, FRAME_WIDTH, MULLION_WIDTH, DOOR_FRAME, DOOR_CASING, DOOR_LEAF_THICKNESS, DOOR_LEAF_GAP,
  ENTRANCE_LEAF_THICKNESS, GARAGE_DOOR_THICKNESS, FRENCH_BALCONY_OFFSET, FRENCH_BALCONY_GLASS,
  FRENCH_BALCONY_RAIL_HEIGHT, FRENCH_BALCONY_RAIL_OVERHANG, SECTION_HEIGHT, SECTION_CAP_DROP,
} from './constants.js';

// (a = wzdłuż ściany, p = w poprzek, z) → punkt w układzie domu
const pt = (axis, a, p, z) => (axis === 'x' ? [a, p, z] : [p, a, z]);
const alongNormal = (axis, sign) => (axis === 'x' ? [sign, 0, 0] : [0, sign, 0]);

function axBox(b, axis, a0, a1, p0, p1, z0, z1, skip) {
  const [pa, pb] = [Math.min(p0, p1), Math.max(p0, p1)];
  if (axis === 'x') b.box(a0, pa, z0, a1, pb, z1, skip);
  else b.box(pa, a0, z0, pb, a1, z1, skip);
}

/** Cztery płaszczyzny glifu: dwa ościeża, spód nadproża i parapet (każdą można pominąć). */
function emitRevealBox(b, axis, [a0, a1], [p0, p1], [z0, z1], { jambLo = true, jambHi = true, sill = true, head = true, jambAt = [a0, a1] } = {}) {
  if (a1 - a0 < EPS || Math.abs(p1 - p0) < EPS) return;
  if (jambLo) b.quad(pt(axis, jambAt[0], p0, z0), pt(axis, jambAt[0], p1, z0), pt(axis, jambAt[0], p1, z1), pt(axis, jambAt[0], p0, z1), alongNormal(axis, 1));
  if (jambHi) b.quad(pt(axis, jambAt[1], p0, z0), pt(axis, jambAt[1], p1, z0), pt(axis, jambAt[1], p1, z1), pt(axis, jambAt[1], p0, z1), alongNormal(axis, -1));
  if (head) b.quad(pt(axis, a0, p0, z1), pt(axis, a1, p0, z1), pt(axis, a1, p1, z1), pt(axis, a0, p1, z1), [0, 0, -1]);
  if (sill) b.quad(pt(axis, a0, p0, z0), pt(axis, a1, p0, z0), pt(axis, a1, p1, z0), pt(axis, a0, p1, z0), [0, 0, 1]);
}

/**
 * Glify otworów.
 * Ściany zewnętrzne: część wewnętrzna (grubość muru, kolor ściany) i zewnętrzna (grubość ocieplenia, kolor elewacji).
 * Okno narożne: parapet i nadproże w kształcie litery L, ościeża tylko na końcach dalszych od narożnika.
 */
export function emitReveals(model, batch) {
  const { level, floor } = model;
  const inner = batch('reveal', 'interior', level.id);
  const outer = batch('facade', 'exterior', level.id);

  for (const info of model.extOpenings.values()) {
    const { axis, a0, a1, cornerAt } = info;
    const z = [floor + info.z0, floor + info.z1];
    let inAlong = [a0, a1];
    let outAlong = [a0, a1];
    if (info.cornerWindow) {
      const [c0, c1] = info.cutout;
      if (axis === 'x') {
        // ramię wzdłuż x kończy się na narożnym polu od środka, a na zewnątrz obejmuje narożnik ocieplenia
        inAlong = cornerAt === 'hi' ? [a0, c0] : [c1, a1];
        outAlong = [info.faceS0, info.faceS1];
      } else {
        // ramię wzdłuż y zabiera narożne pole muru
        inAlong = outAlong = cornerAt === 'lo' ? [c0, a1] : [a0, c1];
      }
    }
    const opts = { jambLo: cornerAt !== 'lo', jambHi: cornerAt !== 'hi', sill: info.z0 > EPS, jambAt: [a0, a1] };
    emitRevealBox(inner, axis, inAlong, [info.inner, info.m], z, opts);
    emitRevealBox(outer, axis, outAlong, [info.m, info.face], z, opts);
  }

  // przejścia bez drzwi w ścianach wewnętrznych, które nie leżą w obrysie pomieszczenia
  for (const o of level.openings) {
    if (o.kind !== 'passage') continue;
    const rect = openingRect(level, o);
    const [cx, cy] = rectCenter(rect);
    if (model.rooms.some((rm) => pointInPolygon(cx, cy, rm.polygon))) continue;
    const wall = level.walls.find((w) => w.id === o.wall);
    const axis = isVertical(wall.rect) ? 'y' : 'x';
    const p = axis === 'x' ? [wall.rect[1], wall.rect[3]] : [wall.rect[0], wall.rect[2]];
    emitRevealBox(inner, axis, o.at, p, [floor + o.sill, floor + o.sill + o.height], { sill: false });
  }

  // drzwi przesuwne nie mają ościeżnicy – ościeża i spód nadproża są gładkie, w kolorze ściany
  for (const d of slidingDoorsOf(model.house, model.design, level.id).values()) {
    const o = d.opening;
    const p = d.axis === 'x' ? [d.wall.rect[1], d.wall.rect[3]] : [d.wall.rect[0], d.wall.rect[2]];
    emitRevealBox(inner, d.axis, o.at, p, [floor + o.sill, floor + o.sill + o.height], { sill: false });
  }
}

/** Rama okna z szybą w otworze ściany zewnętrznej. */
function emitWindow(info, floor, panes, frame, glass, solid) {
  const { axis, a0, a1, cornerAt } = info;
  const fw = FRAME_WIDTH;
  // założenie (A12 w house.json nie podaje położenia): rama licuje z ZEWNĘTRZNYM licem muru, ocieplenie tworzy węgarek
  const p0 = info.m;
  const p1 = info.m - info.out * FRAME_DEPTH;
  const pc = (p0 + p1) / 2;
  const zA = floor + info.z0;
  const zB = floor + info.z1;
  const jLo = cornerAt !== 'lo';
  const jHi = cornerAt !== 'hi';
  if (jLo) solid(frame, axis, a0, a0 + fw, p0, p1, zA, zB);
  if (jHi) solid(frame, axis, a1 - fw, a1, p0, p1, zA, zB);
  const g0 = a0 + (jLo ? fw : 0);
  const g1 = a1 - (jHi ? fw : 0);
  solid(frame, axis, g0, g1, p0, p1, zA, zA + fw);
  solid(frame, axis, g0, g1, p0, p1, zB - fw, zB);
  for (let i = 1; i < (panes || 1); i++) {
    const c = g0 + ((g1 - g0) * i) / panes;
    solid(frame, axis, c - MULLION_WIDTH / 2, c + MULLION_WIDTH / 2, p0, p1, zA + fw, zB - fw);
  }
  const n = axis === 'x' ? [0, info.out, 0] : [info.out, 0, 0];
  glass.quad(pt(axis, g0, pc, zA + fw), pt(axis, g1, pc, zA + fw), pt(axis, g1, pc, zB - fw), pt(axis, g0, pc, zB - fw), n);
}

export function emitJoinery(house, model, batch) {
  const { level, floor } = model;
  const frame = batch('frame', 'joinery', level.id);
  const glass = batch('glass', 'joinery', level.id, { noPick: true });
  const doorExt = batch('doorExt', 'joinery', level.id);
  const doorFrame = batch('doorFrame', 'joinery', level.id);
  const leaf = batch('door', 'joinery', level.id);
  const cornersDone = new Set();
  const fb = level.frenchBalconies;
  const sliding = slidingDoorsOf(house, model.design, level.id);

  // Bryła stolarki + jej ciemny przekrój w widoku z góry (tam, gdzie przecina ją płaszczyzna cięcia).
  const section = batch('sectionCap', 'cap', level.id, { cap: 'section' });
  const zs = floor + SECTION_HEIGHT - SECTION_CAP_DROP;
  const solid = (b, axis, a0, a1, p0, p1, z0, z1) => {
    axBox(b, axis, a0, a1, p0, p1, z0, z1);
    if (!(z0 < zs && z1 > zs) || a1 - a0 < EPS) return;
    section.quad(pt(axis, a0, p0, zs), pt(axis, a1, p0, zs), pt(axis, a1, p1, zs), pt(axis, a0, p1, zs), [0, 0, 1]);
  };

  for (const o of level.openings) {
    const info = model.extOpenings.get(o.id);
    const zA = floor + o.sill;
    const zB = zA + o.height;

    if (o.kind === 'window' || o.kind === 'glazedDoor' || o.kind === 'frenchWindow') {
      emitWindow(info, floor, o.panes, frame, glass, solid);
      const cw = info.cornerWindow;
      if (cw && !cornersDone.has(cw.id)) {
        cornersDone.add(cw.id);
        solid(frame, 'x', cw.post[0], cw.post[2], cw.post[1], cw.post[3], floor + cw.sill, floor + cw.sill + cw.height);
      }
      if (o.kind === 'frenchWindow' && fb?.appliesTo.includes(o.id)) {
        // balustrada szklana na zewnątrz, szersza od otworu
        const p0 = info.face + info.out * FRENCH_BALCONY_OFFSET;
        const p1 = p0 + info.out * FRENCH_BALCONY_GLASS;
        const a0 = o.at[0] - fb.sideOverhang;
        const a1 = o.at[1] + fb.sideOverhang;
        axBox(glass, info.axis, a0, a1, p0, p1, floor + fb.glassFrom, floor + fb.glassTo);
        const over = info.out * FRENCH_BALCONY_RAIL_OVERHANG;
        axBox(frame, info.axis, a0, a1, p0 - over, p1 + over, floor + fb.glassTo, floor + fb.glassTo + FRENCH_BALCONY_RAIL_HEIGHT);
      }
      continue;
    }

    if (o.kind === 'entranceDoor') {
      // rama, słupek między skrzydłem a doświetlem, skrzydło zamknięte, szyba doświetla
      const { axis } = info;
      const fw = FRAME_WIDTH;
      const p0 = info.m;
      const p1 = info.m - info.out * FRAME_DEPTH;
      const pc = (p0 + p1) / 2;
      const [a0, a1] = o.at;
      const hingeAtLo = Math.abs(o.hinge - a0) < EPS;
      const split = hingeAtLo ? a0 + o.leaf : a1 - o.leaf; // granica skrzydło / doświetle
      solid(frame, axis, a0, a0 + fw, p0, p1, zA, zB);
      solid(frame, axis, a1 - fw, a1, p0, p1, zA, zB);
      solid(frame, axis, a0 + fw, a1 - fw, p0, p1, zB - fw, zB);
      const hasSidelight = split - a0 > fw * 2 && a1 - split > fw * 2;
      let leafRange = [a0 + fw, a1 - fw];
      if (hasSidelight) {
        solid(frame, axis, split - fw / 2, split + fw / 2, p0, p1, zA, zB - fw);
        const side = hingeAtLo ? [split + fw / 2, a1 - fw] : [a0 + fw, split - fw / 2];
        leafRange = hingeAtLo ? [a0 + fw, split - fw / 2] : [split + fw / 2, a1 - fw];
        solid(frame, axis, side[0], side[1], p0, p1, zA, zA + fw);
        const n = axis === 'x' ? [0, info.out, 0] : [info.out, 0, 0];
        glass.quad(pt(axis, side[0], pc, zA + fw), pt(axis, side[1], pc, zA + fw), pt(axis, side[1], pc, zB - fw), pt(axis, side[0], pc, zB - fw), n);
      }
      solid(doorExt, axis, leafRange[0], leafRange[1], pc - ENTRANCE_LEAF_THICKNESS / 2, pc + ENTRANCE_LEAF_THICKNESS / 2, zA + DOOR_LEAF_GAP, zB - fw);
      continue;
    }

    if (o.kind === 'garageDoor') {
      solid(doorExt, info.axis, o.at[0], o.at[1], info.m, info.m - info.out * GARAGE_DOOR_THICKNESS, zA, zB);
      continue;
    }

    if (o.kind === 'door' && sliding.has(o.id)) {
      emitSlidingDoor(sliding.get(o.id), {
        leaf: batch('barnDoor', 'joinery', level.id),
        rail: batch('barnRail', 'joinery', level.id),
        solid,
      });
      continue;
    }

    if (o.kind === 'door') {
      const wall = level.walls.find((w) => w.id === o.wall);
      const axis = isVertical(wall.rect) ? 'y' : 'x';
      const [w0, w1] = axis === 'x' ? [wall.rect[1], wall.rect[3]] : [wall.rect[0], wall.rect[2]];
      const [a0, a1] = o.at;
      // ościeżnica: dwa stojaki i nadproże, 1 cm przed licem ściany z obu stron
      solid(doorFrame, axis, a0, a0 + DOOR_FRAME, w0 - DOOR_CASING, w1 + DOOR_CASING, zA, zB);
      solid(doorFrame, axis, a1 - DOOR_FRAME, a1, w0 - DOOR_CASING, w1 + DOOR_CASING, zA, zB);
      solid(doorFrame, axis, a0 + DOOR_FRAME, a1 - DOOR_FRAME, w0 - DOOR_CASING, w1 + DOOR_CASING, zB - DOOR_FRAME, zB);
      // skrzydło otwarte o 90°: obrócone wokół zawiasu na licu ściany po stronie otwierania
      const toCenter = Math.abs(o.hinge - a0) < EPS ? 1 : -1;
      const hingeAt = o.hinge + toCenter * (o.hingeOffset ?? DOOR_FRAME);
      const sign = o.swing.startsWith('+') ? 1 : -1;
      const faceP = (sign > 0 ? w1 : w0) + sign * DOOR_CASING;
      const lo = Math.min(hingeAt, hingeAt - toCenter * DOOR_LEAF_THICKNESS);
      solid(leaf, axis, lo, lo + DOOR_LEAF_THICKNESS, faceP, faceP + sign * o.leaf, zA + DOOR_LEAF_GAP, zB - DOOR_FRAME);
    }
  }
}

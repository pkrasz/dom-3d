// Testy kolizji i schodów (tryb spaceru) na prawdziwym house.json.
import { describe, it, expect } from 'vitest';
import { buildCollision, moveCircle } from '../src/geometry/collision.js';
import { stairModel } from '../src/geometry/stairs.js';
import { pointInPolygon, pointInRect } from '../src/geometry/plan.js';
import { WALK_RADIUS } from '../src/geometry/constants.js';
import { house } from './helpers.js';

const col = buildCollision(house);
const blocked = (levelId, x, y) => col.walls(levelId).some((w) => pointInRect(x, y, w.rect));

describe('schody S1', () => {
  const st = stairModel(house);
  it('17 stopnic o wysokości rise / risers', () => {
    expect(st.steps.length).toBe(17);
    expect(st.riser).toBeCloseTo(3.03 / 18, 9);
    st.steps.forEach((s, i) => expect(s.top).toBeCloseTo((i + 1) * st.riser, 9));
    expect(st.steps.filter((s) => s.kind === 'winder').length).toBe(3);
  });
  it('poziomy stopni zgadzają się z house.json (z dokładnością do zaokrąglenia)', () => {
    const tops = st.steps.map((s) => s.top);
    expect(tops[0]).toBeCloseTo(0.17, 2);
    expect(tops[7]).toBeCloseTo(1.35, 2);
    expect(tops[8]).toBeCloseTo(1.52, 2);
    expect(tops[10]).toBeCloseTo(1.85, 2);
    expect(tops[11]).toBeCloseTo(2.02, 2);
    expect(tops[16]).toBeCloseTo(2.86, 2);
  });
  it('stopnie zabiegowe wypełniają prostokąt zabiegu', () => {
    const area = (p) => Math.abs(p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0)) / 2;
    const winder = st.steps.filter((s) => s.kind === 'winder');
    expect(winder.reduce((s, w) => s + area(w.poly), 0)).toBeCloseTo(1.0 * 2.0, 9);
  });
});

describe('kolizje', () => {
  it('drzwi wewnętrzne i przejścia są przejezdne, okna i drzwi zewnętrzne zamknięte', () => {
    expect(blocked('parter', 5.17, 1.44)).toBe(false); // DW3 garaż – wiatrołap
    expect(blocked('parter', 6.76, 3.48)).toBe(false); // DW5 łazienka
    expect(blocked('parter', 7.8, 2.71)).toBe(false); // przejście P1
    expect(blocked('parter', 8.92, 5.2)).toBe(false); // pod podciągiem B1
    expect(blocked('parter', 7.3, 0.72)).toBe(true); // drzwi wejściowe O7
    expect(blocked('parter', 11.2, 9.97)).toBe(true); // drzwi tarasowe O3
    expect(blocked('parter', 2.6, 0.12)).toBe(true); // brama garażowa
    expect(blocked('parter', 9.2, 3.2)).toBe(true); // komin K-C
    expect(blocked('poddasze', 5.17, 4.1)).toBe(false); // przejście PN1
    expect(blocked('poddasze', 9.2, 3.0)).toBe(true); // komin K-C (bez pomieszczenia)
    expect(blocked('poddasze', 6.5, 4.8)).toBe(true); // balustrada wzdłuż korytarza
  });

  it('pointInRoom i roomPolygon', () => {
    expect(col.pointInRoom('parter', 11, 5)).toBe('0/6');
    expect(col.pointInRoom('poddasze', 2, 2)).toBe('1/8');
    expect(col.pointInRoom('parter', -3, 5)).toBe(null);
    expect(col.roomPolygon('parter', '0/3').length).toBe(4);
  });

  it('miejsce do stanięcia leży w pomieszczeniu, poza kominem i z dala od ścian', () => {
    for (const level of house.levels) {
      for (const room of level.rooms) {
        const p = col.roomSpot(level.id, room.id);
        expect(p, room.id).toBeTruthy();
        expect(pointInPolygon(p.x, p.y, room.polygon), room.id).toBe(true);
        expect(blocked(level.id, p.x, p.y), room.id).toBe(false);
        const moved = moveCircle(p.x, p.y, 0, 0, WALK_RADIUS, col.walls(col.levelIdAtHeight(p.z)));
        expect(Math.hypot(moved.x - p.x, moved.y - p.y), room.id).toBeLessThan(0.15);
      }
    }
  });

  it('postać nie przechodzi przez ściany', () => {
    // z garażu w stronę pom. technicznego przez ścianę W2a (poza drzwiami)
    let p = { x: 2.5, y: 6.0 };
    for (let i = 0; i < 100; i++) p = moveCircle(p.x, p.y, 0, 0.05, WALK_RADIUS, col.walls('parter'));
    expect(p.y).toBeLessThanOrEqual(6.8 - WALK_RADIUS + 1e-6);
    // przez drzwi DW1 (x 0,50..1,42) da się przejść
    p = { x: 0.96, y: 6.0 };
    for (let i = 0; i < 60; i++) p = moveCircle(p.x, p.y, 0, 0.05, WALK_RADIUS, col.walls('parter'));
    expect(p.y).toBeGreaterThan(7.5);
  });

  it('po schodach da się wejść z parteru na poddasze i zejść', () => {
    const start = col.stairsSpot('parter');
    const path = [];
    for (let x = start.x; x > 6.0; x -= 0.05) path.push([x, 6.3]); // bieg dolny
    for (let a = 0; a <= Math.PI; a += 0.05) path.push([6.0 - 0.3 * Math.sin(a), 5.8 + 0.5 * Math.cos(a)]); // zabieg
    for (let x = 6.0; x < 8.5; x += 0.05) path.push([x, 5.3]); // bieg górny i korytarz poddasza
    let z = 0;
    for (const [x, y] of path) {
      const g = col.groundAt(x, y, z);
      expect(g, `wejście @ ${x.toFixed(2)},${y.toFixed(2)} z=${z.toFixed(2)}`).not.toBe(null);
      z = g;
    }
    expect(z).toBeCloseTo(3.03, 9);
    expect(col.levelIdAtHeight(z)).toBe('poddasze');
    for (const [x, y] of path.reverse()) {
      const g = col.groundAt(x, y, z);
      expect(g, `zejście @ ${x.toFixed(2)},${y.toFixed(2)}`).not.toBe(null);
      z = g;
    }
    expect(z).toBeCloseTo(0, 9);
  });

  it('nie da się wejść w otwór klatki ani stanąć pod niskim biegiem', () => {
    expect(col.groundAt(6.5, 6.3, 3.03)).toBe(null); // z poddasza w otwór nad biegiem dolnym
    expect(col.groundAt(5.8, 5.3, 0)).toBe(null); // pod zabiegiem jest za nisko
    expect(col.groundAt(7.6, 5.3, 0)).toBe(0); // pod końcem biegu górnego można przejść
  });

  it('miejsca przy schodach na obu kondygnacjach są dostępne', () => {
    for (const level of house.levels) {
      const p = col.stairsSpot(level.id);
      expect(col.groundAt(p.x, p.y, level.floorLevel)).toBe(level.floorLevel);
      expect(blocked(level.id, p.x, p.y)).toBe(false);
    }
  });
});

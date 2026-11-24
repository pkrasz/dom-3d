// Przeliczenia między układem domu (x w prawo, y w górę arkusza, z w górę) a światem Three.js (Y w górę).
// Grupa domu jest obrócona o -90° wokół X, więc: świat = (x, z, -y).
import { Vector3 } from 'three';

export const toWorld = (x, y, z = 0, target = new Vector3()) => target.set(x, z, -y);
export const toHouse = (v) => ({ x: v.x, y: -v.z, z: v.y });

// Scena: grupa domu w układzie domu (x, y, z w górę), obrócona o -90° wokół osi X do świata Three.js (Y w górę).
import { Scene, Group, Color } from 'three';

export const SKY = { day: '#cfe3f2', evening: '#1a2030' };

export function createScene() {
  const scene = new Scene();
  scene.background = new Color(SKY.day);
  const houseGroup = new Group();
  houseGroup.name = 'układ domu';
  houseGroup.rotation.x = -Math.PI / 2;
  houseGroup.updateMatrixWorld(true);
  scene.add(houseGroup);
  return { scene, houseGroup };
}

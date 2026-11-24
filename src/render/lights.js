// Światło: półkula nieba + "słońce" od południa (kierunek z meta.north) oraz tryb wieczorny
// z ciepłym światłem wnętrz (kilka punktowych świateł w pomieszczeniach najbliżej kamery).
import { HemisphereLight, DirectionalLight, AmbientLight, PointLight, Color } from 'three';
import { toWorld } from '../app/coords.js';
import { SKY } from './scene.js';

/** Najwięcej punktowych świateł naraz (wydajność na telefonie). */
export const MAX_ROOM_LIGHTS = 4;
/** założenie: wysokość słońca nad horyzontem w trybie dziennym. */
const SUN_ELEVATION_DEG = 48;

/**
 * Wektor w układzie domu wskazujący kierunek świata o podanym azymucie (stopnie, zgodnie z zegarem od północy).
 * meta.north.bearingOfMinusY_deg mówi, w którą stronę świata patrzy oś -y (front domu).
 */
export function bearingToHouse(house, bearingDeg) {
  const d = ((bearingDeg - house.meta.north.bearingOfMinusY_deg) * Math.PI) / 180;
  // obrót zgodnie z zegarem od -y: -y → -x → +y → +x
  return [-Math.sin(d), -Math.cos(d)];
}

export function createLights(scene, house) {
  const hemi = new HemisphereLight('#ffffff', '#d9d5cc', 2.3);
  const sun = new DirectionalLight('#fff6e6', 1.4);
  const ambient = new AmbientLight('#ffd9a8', 0); // ciepłe światło otoczenia – tylko wieczorem
  scene.add(hemi, sun, ambient);

  // słońce stoi na południu
  const [sx, sy] = bearingToHouse(house, 180);
  const el = (SUN_ELEVATION_DEG * Math.PI) / 180;
  toWorld(sx * Math.cos(el) * 50, sy * Math.cos(el) * 50, Math.sin(el) * 50, sun.position);

  const roomLights = [];
  for (let i = 0; i < MAX_ROOM_LIGHTS; i++) {
    const l = new PointLight('#ffd6a0', 0, 9, 1.6);
    l.visible = false;
    scene.add(l);
    roomLights.push(l);
  }

  let mode = 'day';
  return {
    hemi, sun, ambient, roomLights,
    get mode() {
      return mode;
    },
    setMode(next) {
      mode = next;
      const evening = next === 'evening';
      scene.background = new Color(evening ? SKY.evening : SKY.day);
      hemi.intensity = evening ? 0.35 : 2.3;
      hemi.color.set(evening ? '#8fa0c8' : '#ffffff');
      hemi.groundColor.set(evening ? '#3a3530' : '#d9d5cc');
      sun.intensity = evening ? 0.12 : 1.4;
      sun.color.set(evening ? '#9fb0e0' : '#fff6e6');
      ambient.intensity = evening ? 0.9 : 0;
      for (const l of roomLights) l.visible = evening;
    },
    /** Ustawia lampy w podanych punktach układu domu ([{x, y, z}], najwyżej MAX_ROOM_LIGHTS). */
    setRoomLights(points) {
      roomLights.forEach((l, i) => {
        const p = points[i];
        l.intensity = p ? 10 : 0;
        if (p) toWorld(p.x, p.y, p.z, l.position);
      });
    },
  };
}

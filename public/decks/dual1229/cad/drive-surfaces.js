// Photo-led surface variation for item 4's unmachined casting and item 131's rubber.
// Estimates affect reflectance and microrelief only; running faces retain their CAD shape.
import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

export function driveSurfaceMaps() {
  const noise = new ImprovedNoise();
  const size = 512;
  const cast = new Uint8ClampedArray(size * size * 4);
  const rubber = new Uint8Array(cast.length);
  const castingRelief = new Uint8ClampedArray(cast.length);
  const rubberRelief = new Uint8ClampedArray(cast.length);
  const dimples = new Uint8ClampedArray(cast.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const clouds = noise.noise(u * 11, v * 11, 7.4);
      const grain = noise.noise(u * 68, v * 68, 12.5);
      const pores = noise.noise(u * 202, v * 202, 3.8);
      const oxide = Math.round(226 + 11 * clouds + 6 * grain + 7 * pores);
      // The source tyre shows subdued surface bloom and a small moulded frame.
      // Its stamp legend is illegible. Make only the observed perimeter.
      const dx = u - 0.50, dy = v - 0.16;
      const edge = Math.max(Math.abs(dx) - 0.033, Math.abs(dy) - 0.028);
      const moulding = Math.exp(-Math.pow(edge / 0.0028, 2));
      const skin = noise.noise(u * 5 + 0.35 * grain, v * 6, 15.6);
      const tyre = Math.round(52 + 11 * skin + 5 * grain + 7 * pores - 4 * moulding);
      const i = (y * size + x) * 4;
      cast[i] = oxide - 2; cast[i + 1] = oxide; cast[i + 2] = oxide; cast[i + 3] = 255;
      rubber[i] = rubber[i + 1] = rubber[i + 2] = tyre; rubber[i + 3] = 255;
      castingRelief[i] = castingRelief[i + 1] = castingRelief[i + 2] = 128 + 12 * grain + 56 * pores;
      castingRelief[i + 3] = 255;
      rubberRelief[i] = rubberRelief[i + 1] = rubberRelief[i + 2] = 128 + 24 * pores - 69 * moulding;
      rubberRelief[i + 3] = 255;

      // The exposed centre has a staggered field of stamped dimples (14:32).
      // Vary the normal, so the bright side of each indentation follows the light.
      const row = Math.round(v * 18);
      const col = u * 16 + (row % 2) * 0.5;
      const px = (col - Math.round(col)) / 0.24, py = (v * 18 - row) / 0.25;
      const profile = 1.4 * Math.max(0, 1 - px * px - py * py);
      const nz = 1 / Math.hypot(px * profile, py * profile, 1);
      dimples[i] = 127.5 * (1 - px * profile * nz);
      dimples[i + 1] = 127.5 * (1 - py * profile * nz);
      dimples[i + 2] = 127.5 * (1 + nz);
      dimples[i + 3] = 255;
    }
  }
  function texture(pixels, colourSpace) {
    const t = new THREE.DataTexture(new Uint8Array(pixels.buffer), size, size);
    t.colorSpace = colourSpace;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.needsUpdate = true;
    return t;
  }
  return { cast: texture(cast, THREE.SRGBColorSpace), rubber: texture(rubber, THREE.SRGBColorSpace),
    castingRelief: texture(castingRelief, THREE.NoColorSpace), rubberRelief: texture(rubberRelief, THREE.NoColorSpace), dimples: texture(dimples, THREE.NoColorSpace) };
}

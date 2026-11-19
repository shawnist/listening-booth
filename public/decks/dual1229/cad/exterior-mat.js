// Fine variations in moulded rubber. All concentric relief, the smooth support
// bands and the lip now come from item 3's revolved CAD section.
import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

export function matSurfaceMaps() {
  const size = 512;
  const colour = new Uint8Array(size * size * 4);
  const relief = new Uint8Array(colour.length);
  const noise = new ImprovedNoise();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const grain = noise.noise(142 * u, 142 * v, 4.7);
      const bloom = noise.noise(9 * u, 9 * v, 2.9);
      const tint = Math.round(46 + 6 * grain + 5 * bloom);
      const height = Math.round(127 + 31 * grain);
      const i = 4 * (y * size + x);
      colour[i] = colour[i + 1] = colour[i + 2] = tint;
      relief[i] = relief[i + 1] = relief[i + 2] = height;
      colour[i + 3] = relief[i + 3] = 255;
    }
  }
  function texture(bytes, colourSpace) {
    const map = new THREE.DataTexture(bytes, size, size);
    map.colorSpace = colourSpace;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    return map;
  }
  return { colour: texture(colour, THREE.SRGBColorSpace), relief: texture(relief, THREE.NoColorSpace) };
}

// The fitted CAD deck and the procedural arm share the formed item 42 mesh.
// Local Y is the journal axis. At zero the tab points outboard (local −Z).
import * as THREE from 'three';
import { positions, indices, bearing } from './locking-handle-data.js';

export { bearing };

export function lockingHandleGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    Float32Array.from(positions, n => n * .00001), 3));
  geometry.setIndex(new THREE.Uint16BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function registerLatch(mesh) {
  mesh.userData.control = 'dual:headshellLatch';
  mesh.userData.latch = { tip: [0, -.00065, -.0193] };
  return mesh;
}

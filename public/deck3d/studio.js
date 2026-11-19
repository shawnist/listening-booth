// The room the deck is photographed in: dark, with a few big soft lights, the way products
// are lit. It is never seen directly; it is what the metal, the vinyl and the lacquered wood
// reflect. Built from plain shapes, so nothing is downloaded.
import * as THREE from 'three';

export function studioEnvironment(renderer, keyDir) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.045, 0.043, 0.04), side: THREE.BackSide }));
  room.position.y = 2.5; scene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.09, 0.08, 0.07), side: THREE.DoubleSide }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.2; scene.add(floor);
  const panel = (w, h, pos, rgb, level) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(rgb[0] * level, rgb[1] * level, rgb[2] * level), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(0, 0, 0); scene.add(m);
    return m;
  };
  const k = keyDir.clone().normalize();
  panel(2.6, 1.8, k.clone().multiplyScalar(4.2), [1, 0.93, 0.84], 12); // the key: a window-sized softbox, up and behind
  panel(4.2, 1.6, new THREE.Vector3(0.6, 4.2, -3.4), [0.9, 0.93, 1], 2.6); // a broad bank high at the back; straight overhead stays dark
  panel(0.5, 3.2, new THREE.Vector3(4.6, 1.5, 1.4), [0.82, 0.9, 1], 11); // a cool strip to the right
  panel(0.36, 2.6, new THREE.Vector3(-4.4, 1.1, 2.6), [1, 0.86, 0.7], 7); // a warm strip, front left
  panel(5, 1.4, new THREE.Vector3(0, 1.0, 5.5), [1, 0.96, 0.9], 0.9); // low glow behind the listener
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.02, 0.1, 40).texture;
  pmrem.dispose();
  scene.traverse((o) => { if (o.geometry) { o.geometry.dispose(); o.material.dispose(); } });
  return tex;
}

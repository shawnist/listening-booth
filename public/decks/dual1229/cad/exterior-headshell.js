// TK14 and lever 42 are visual context attached to the arm pitch frame.
// The complete item 41 moulding and its grip live in the installed arm CAD.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { bearing, lockingHandleGeometry, registerLatch } from '../parts/tonearm/locking-handle.js';
import { ARM_CAD } from './arm.js';

export function applyExteriorHeadshell({ scenes, root, kit }) {
  const find = id => root.getObjectByName(id) || scenes?.arm?.getObjectByName(id);
  const head = find('arm.41.head'), holder = find('arm.63.tk14_holder');
  const meshes = [], hiddenMeshes = [], geometries = [], materials = [], restores = [];
  const report = {
    component: 'plain-1229 TK14 and locking-lever context',
    classification: 'photo-led visual reconstruction; dimensions and material response estimated',
    sources: ['outside/hifiwiki_top_view.jpg', 'tonearm/hifiwiki_arm_rest_cue_controls.jpg',
      'tonearm/dFnPyYWFTE8_03m22s_headshell-side.jpg', 'tonearm/dFnPyYWFTE8_03m26s_cartridge-headshell-closeup.jpg',
      'tonearm/bXv4Md0Nsnw_03m35s_headshell-cartridge-on-record.jpg'],
    preserved: ['installed item 41 CAD remains visible; source TK14 preserved for restoration', 'tube socket and arm-rest support',
      'cartridge, cantilever and stylus datum', 'all yaw, pitch, mode and mechanical contact functions'],
    estimates: ['54 mm head length and 18 mm width retained from candidate envelope',
      'handle eye and metal tang follow Fig. 30; locked and released directions follow operating Figs. 7 and 13',
      'TK holder outline is a visual reconstruction around the existing cartridge; no cartridge brand is asserted'],
    features: [],
  };
  if (!head || !holder || !head.parent) return { meshes, hiddenMeshes, report: { ...report, unavailable: true }, dispose() {} };
  // The bound head's parent is the existing CAD pitch joint. Its local axes are
  // X along the tube, Y up. This frame follows even a raised/rotated initial pose.
  const phi = Math.atan2(-ARM_CAD.stylus[1], ARM_CAD.stylus[0]);
  const angle = 24.9 * Math.PI / 180 + phi;
  const socket = ARM_CAD.stylus[0] - .048 * Math.cos(angle);
  const frame = new THREE.Group(); frame.name = 'exterior-headshell';
  frame.position.set(socket, 0, 0); frame.rotation.y = -angle;
  head.parent.add(frame);
  function hideSource(body) {
    body.traverse(node => {
      if (!node.isMesh || node.userData.exteriorHeadshellDetail) return;
      // The old source remains available to inspection/contact code. The parent
      // also receives this list so its visibility policy can keep it suppressed.
      restores.push([node, node.visible]); node.visible = false; hiddenMeshes.push(node);
    });
  }
  hideSource(holder);
  const mat = options => { const m = new THREE.MeshStandardMaterial(options); materials.push(m); return m; };
  // Restrained dielectric reflection keeps the black moulding black under the
  // deck's studio softbox. Chrome belongs to the separate locking lever only.
  const plastic = (color, roughness, specularIntensity) => {
    const m = new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness,
      specularIntensity, envMapIntensity: .55, ior: 1.48 }); materials.push(m); return m;
  };
  const nylon = plastic(0x151619, .58, .30);
  const chrome = mat({ color: 0xcbd0d4, metalness: .94, roughness: .2 });
  function add(name, geometry, material, part, position) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `exterior-headshell-${name}`;
    if (position) mesh.position.fromArray(position);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData = { exteriorHeadshellDetail: true, visualOnly: true, cad: 'arm', part: `cad:arm:${part}`,
      source: report.sources, provisional: report.classification };
    frame.add(mesh); meshes.push(mesh); geometries.push(geometry); report.features.push(name); return mesh;
  }
  function rounded(w, h, d, radius = .0003) { return new RoundedBoxGeometry(w, h, d, 3, radius); }
  // Holder remains at the source holder plane and retains the two mounting-hole
  // centres. The frame's shallow side catches reveal the separation from shell.
  const plate = new THREE.Shape(); plate.moveTo(.0194, -.0077); plate.lineTo(.0406, -.0077); plate.lineTo(.0406, .0077); plate.lineTo(.0194, .0077); plate.closePath();
  for (const z of [-.00635, .00635]) { const hole = new THREE.Path(); hole.absarc(.030, z, .00125, 0, Math.PI * 2, true); plate.holes.push(hole); }
  // The 15.4 mm visual rim encloses the source 12.7 mm hole-centre span.
  const holderGeo = new THREE.ExtrudeGeometry(plate, { depth: .0015, bevelEnabled: true, bevelSize: .00008,
    bevelThickness: .00008, bevelSegments: 2, curveSegments: 20, steps: 1 });
  holderGeo.rotateX(-Math.PI / 2); holderGeo.translate(0, -.0044, 0); add('tk14-holder-plate', holderGeo, nylon, 'arm.63.tk14_holder');
  for (const side of [-1, 1]) add(`tk14-side-catch-${side}`, rounded(.014, .0017, .0007, .00018), nylon, 'arm.63.tk14_holder', [.030, -.0051, side * .00765]);
  const handle = registerLatch(add('chrome-holder-locking-lever', lockingHandleGeometry(),
    chrome, 'arm.42.locking_lever', [bearing.u, bearing.y, 0]));
  const handleKey = handle.userData.part;
  const previousHandle = kit.parts?.[handleKey];
  const handlePart = { key: handleKey, no: '42', name: 'Cartridge holder locking lever', groups: [handle], meshes: [handle] };
  const holderPart = kit.parts?.['cad:arm:arm.63.tk14_holder'];
  if (kit.parts) kit.parts[handleKey] = handlePart;
  for (const mesh of meshes) if (mesh !== handle) holderPart?.meshes.push(mesh);

  frame.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  for (const mesh of meshes) { mesh.geometry.computeBoundingBox(); bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix)); }
  report.localBoundsMm = { min: bounds.min.toArray().map(v => v * 1000), max: bounds.max.toArray().map(v => v * 1000) };
  report.sourceGeometryHidden = ['arm.63.tk14_holder'];
  report.hiddenPrimitiveCount = hiddenMeshes.length;
  return { meshes, hiddenMeshes, frame, latch: handle, report, dispose() {
    if (kit.parts?.[handleKey] === handlePart) {
      if (previousHandle) kit.parts[handleKey] = previousHandle;
      else delete kit.parts[handleKey];
    }
    if (holderPart) for (const mesh of meshes) {
      const i = holderPart.meshes.indexOf(mesh);
      if (i >= 0) holderPart.meshes.splice(i, 1);
    }
    frame.removeFromParent(); meshes.forEach(mesh => mesh.removeFromParent()); for (const [mesh, visible] of restores) mesh.visible = visible;
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  } };
}

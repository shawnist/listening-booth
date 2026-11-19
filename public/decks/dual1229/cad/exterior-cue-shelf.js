// The posts under the bearing, as on a plain 1229 (owner's close-ups and observation, 2026-11-19).
//
// The quarter-disc cue shelf is part of arm.73 and its underside is the real cue pad (arm.js
// ARM_PAD_FOOTPRINT). The post that rises to it on the spindle side is the real lift pin 206 with its
// cap 198, standing on the installed axis (lift-contact.js LIFT_INSTALLATION.axis): the owner
// confirmed on the deck that it is the only post that moves with the cue lever. This pass finishes
// how that stack LOOKS above the deck: the guide, sleeve, spring and clips are not drawn there, and
// the pin and cap are dark. It also draws the two fixed posts and their bracket, which have no
// modelled function.
//
// No source vertex, node transform or contact triangle changes; only material groups are added.
import * as THREE from 'three';
import { ARM_CAD } from './arm.js';
import { LIFT_INSTALLATION } from './lift-contact.js';

const MM = 0.001;
// Arm-frame millimetres at the CAD parked pose (x along the tube, y outboard, z up from the pivot).
// Mirrors SHELF_QUARTER in cad/reconstruction/arm/params.py.
export const CUE_SHELF = Object.freeze({ centre: Object.freeze([2.0, -3.6]), radius: 14.5, fromDeg: 0, toDeg: -105, z0: -0.5, z1: 3.0 });
// Two fixed posts stand under the bearing beside the lift pin (owner, 2026-11-19, and the side
// close-up enlarged): a thin one front and centre under the tube, and a stout one on the dial side; a
// flat black bracket runs from the top of the centre post to the stout post, with a chrome knurled nut
// on its dial-side end. Placed in the CAD parked arm frame; heights are millimetres below the pivot.
// Photo estimates from two unscaled views.
export const LIFT_POSTS = Object.freeze({
  centre: Object.freeze({ x: 12.0, y: 0.0, rod: 0.7 }),
  fixed: Object.freeze({ x: -8.0, y: 11.0, rod: 1.6, collar: 2.3, collarTop: -22.0 }),
  bracket: Object.freeze({ top: -9.0, thick: 3.0, halfWidth: 3.0 }),
  nut: Object.freeze({ radius: 3.3, height: 2.6 }),
  // The lift stack's guide, sleeve, spring and clips are not drawn above this height (deck metres);
  // they stay under the cover in multi. Pin 206 and cap 198 are.
  stackHiddenAbove: -0.002, stackRadius: 0.007, drawnAbove: Object.freeze(['cue.206.lift_bolt', 'cue.198.cap']),
});

// Arm-frame (x, y) at the CAD parked pose to the deck's plan (metres, root frame).
export function parkedArmToDeck(x, y) {
  const c = Math.cos(ARM_CAD.parkedYaw), s = Math.sin(ARM_CAD.parkedYaw), lx = x * MM, lz = -y * MM;
  return { x: ARM_CAD.pivot[0] + lx * c + lz * s, z: ARM_CAD.pivot[2] - lx * s + lz * c };
}

// Give the triangles chosen by `hide` an invisible material, keeping every other triangle's material.
function hideFaces(mesh, hide, hidden, restores) {
  const g = mesh.geometry, p = g.attributes.position, ix = g.index, count = ix ? ix.count : p.count;
  const original = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const groups = g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }];
  const indexOf = (start) => groups.find(k => start >= k.start && start < k.start + k.count)?.materialIndex ?? 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), out = [];
  let n = 0, last = null;
  for (let t = 0; t < count; t += 3) {
    a.fromBufferAttribute(p, ix ? ix.getX(t) : t); b.fromBufferAttribute(p, ix ? ix.getX(t + 1) : t + 1); c.fromBufferAttribute(p, ix ? ix.getX(t + 2) : t + 2);
    const gone = hide(a, b, c), index = gone ? original.length : indexOf(t);
    if (gone) n++;
    if (last && last.materialIndex === index) last.count += 3; else out.push(last = { start: t, count: 3, materialIndex: index });
  }
  if (!n) return 0;
  restores.push({ mesh, material: mesh.material, groups: g.groups.map(k => ({ ...k })) });
  g.clearGroups(); for (const k of out) g.addGroup(k.start, k.count, k.materialIndex);
  mesh.material = [...original, hidden];
  return n;
}

export function applyExteriorCueShelf({ scenes, root, kit }) {
  const meshes = [], materials = [], geometries = [], restores = [];
  const report = { classification: 'appearance of the installed lift stack above the deck, and two fixed posts with their bracket from the owner close-ups',
    features: [], omitted: ['black knurled knob above the nut', 'the second thin rod beside the lift pin'] };
  const none = { meshes, report, status: report, update() {}, dispose() {} };
  const body = scenes.arm?.getObjectByName('arm.73.bearing_body') || root.getObjectByName('arm.73.bearing_body');
  if (!body) return none;
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const hidden = new THREE.MeshBasicMaterial({ visible: false }); hidden.name = 'cue-shelf-undrawn'; materials.push(hidden);
  const mat = (source, options) => { const m = source?.clone?.() || new THREE.MeshStandardMaterial(); Object.assign(m, options); materials.push(m); return m; };
  const black = mat(null, { color: new THREE.Color(0x0e0e10), metalness: 0.12, roughness: 0.45 });
  const chrome = mat(kit?.M?.chrome, { color: new THREE.Color(0xc7cbce), metalness: 0.92, roughness: 0.23 });

  // 1. Above the deck only the pin and its cap are drawn, dark as photographed.
  {
    const axis = LIFT_INSTALLATION.axis, v = new THREE.Vector3(), w = new THREE.Vector3(), q = new THREE.Vector3();
    let faces = 0; const bodies = new Set(), dark = new Set();
    root.traverse(mesh => {
      if (!mesh.isMesh || mesh.userData.exteriorCueShelf) return;
      const cue = mesh.userData.cad === 'cue' || /^cue\./.test(mesh.parent?.name || '') || mesh.userData.installation;
      if (!cue) return;
      const owner = mesh.parent?.name || mesh.name;
      if (LIFT_POSTS.drawnAbove.includes(owner)) { restores.push({ mesh, material: mesh.material, groups: mesh.geometry.groups.map(k => ({ ...k })) }); mesh.material = Array.isArray(mesh.material) ? mesh.material.map(() => black) : black; dark.add(owner); return; }
      const m = rootInverse.clone().multiply(mesh.matrixWorld);
      const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).applyMatrix4(m);
      if (box.max.y < LIFT_POSTS.stackHiddenAbove) return;
      const n = hideFaces(mesh, (a, b, c) => {
        v.copy(a).applyMatrix4(m); w.copy(b).applyMatrix4(m); q.copy(c).applyMatrix4(m);
        return (v.y + w.y + q.y) / 3 > LIFT_POSTS.stackHiddenAbove
          && Math.hypot((v.x + w.x + q.x) / 3 - axis.x, (v.z + w.z + q.z) / 3 - axis.z) < LIFT_POSTS.stackRadius;
      }, hidden, restores);
      if (n) { faces += n; bodies.add(mesh.parent?.name || mesh.name); }
    });
    report.features.push({ body: [...bodies].sort(), surfaces: 'guide, sleeve, spring and clips of the lift stack not drawn above the deck', faces });
    report.features.push({ body: [...dark].sort(), surfaces: 'lift pin and cap drawn dark', source: "owner's close-ups 2026-11-19" });
  }

  // 2. The two fixed posts, their bracket and the nut.
  const add = (name, geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `exterior-${name}`; mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData = { exteriorCueShelf: true, visualOnly: true, part: 'cad:arm:arm.60.outer_ring_stud', cad: 'arm', provisional: 'photo-estimated position and size; no modelled function' };
    root.add(mesh); meshes.push(mesh); geometries.push(geometry); return mesh;
  };
  const pivotY = ARM_CAD.pivot[1], floor = 0.0028;
  {
    const F = LIFT_POSTS.fixed, C = LIFT_POSTS.centre, B = LIFT_POSTS.bracket, N = LIFT_POSTS.nut;
    const right = parkedArmToDeck(F.x, F.y), front = parkedArmToDeck(C.x, C.y);
    const top = pivotY + B.top * MM, under = top - B.thick * MM, post = (r, y0, y1) => new THREE.CylinderGeometry(r * MM, r * MM, y1 - y0, 32);
    add('bearing-post-front', post(C.rod, floor, under), black, front.x, (floor + under) / 2, front.z);
    add('bearing-post-dial', post(F.rod, floor, under), black, right.x, (floor + under) / 2, right.z);
    const collarTop = pivotY + F.collarTop * MM;
    add('bearing-post-dial-collar', post(F.collar, floor, collarTop), black, right.x, (floor + collarTop) / 2, right.z);
    // The bracket: a flat bar with rounded ends, from over the front post to over the dial-side post.
    const dx = right.x - front.x, dz = right.z - front.z, length = Math.hypot(dx, dz), w = B.halfWidth * MM;
    const outline = new THREE.Shape(); outline.absarc(0, 0, w, Math.PI / 2, -Math.PI / 2, false); outline.absarc(length, 0, w, -Math.PI / 2, Math.PI / 2, false); outline.closePath();
    const bar = new THREE.ExtrudeGeometry(outline, { depth: B.thick * MM, bevelEnabled: false, curveSegments: 24 });
    bar.rotateX(Math.PI / 2);                                  // shape plane to the deck's plan, thickness downward
    bar.rotateY(-Math.atan2(dz, dx));                          // +x of the shape along front -> dial side
    add('bearing-bracket', bar, black, front.x, top, front.z);
    add('bearing-post-nut', post(N.radius, top, top + N.height * MM), chrome, right.x, top + N.height * MM / 2, right.z);
    report.features.push({ name: 'front post, dial-side post, bracket and chrome nut', front: [front.x, front.z], dial: [right.x, right.z], bracketTop: top,
      source: "owner's side close-up 2026-11-19, enlarged; positions estimated from two unscaled views" });
  }
  return { meshes, report, status: report,
    update() {},
    dispose() {
      for (const { mesh, material, groups } of restores.reverse()) { mesh.material = material; mesh.geometry.clearGroups(); for (const k of groups) mesh.geometry.addGroup(k.start, k.count, k.materialIndex); }
      for (const mesh of meshes) mesh.removeFromParent();
      for (const g of geometries) g.dispose(); for (const m of materials) m.dispose();
    } };
}

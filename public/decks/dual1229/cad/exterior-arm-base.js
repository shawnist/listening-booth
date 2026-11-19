// Arm-base exterior: printed legends on cover 68, and the photographed surface
// split of selector stalk 70, rest bar 52 with pin 50, and cue handle 64.
// Appearance only. Vertices, normals, node transforms, joints and picking are
// unchanged; the legends are a flat overlay on the fixed cover.
import * as THREE from 'three';
import { legendTexture } from '../parts/tonearm/textures.js';

// Legend centres relative to the anti-skate knob axis, in mm (+x right, +z
// toward the listener). Type size, the large index triangle and the "O" mark are
// read from the owner's two close-ups of a plain 1229 (2026-11-19), scaled by the
// dial (taken as 25 mm), then fitted inside the installed label panel, which is
// narrower than the photographed one. Order and neighbours follow the photographs;
// bXv4Md0Nsnw 02:25, dFnPyYWFTE8 02:42 and the hifiwiki top view agree. Not factory artwork.
export const ARM_BASE_LEGENDS = Object.freeze({
  single: { dx: 8.6, dz: -31.6, size: 2.5 },
  tracking: { dx: 6.2, dz: -24.6, size: 2.5 },
  multi: { dx: -7.2, dz: -17.6, size: 2.5 },
  // On the raised block, its tip at the panel's left wall.
  index: { dx: -16.2, dz: 0, tri: 5.0 },
  zero: { dx: -10.3, dz: 12.9, ring: 1.05 },
  antiSkating: { dx: 1.2, dz: 16.6, size: 2.6 },
  // Keep the caption on the panel if its front frame is short of the photo position.
  frontMargin: 2.2,
  // Height of the recessed label panel above the cover's underside (structure datums COVER_68_H).
  panelHeight: 3.0,
});

const legendItems = (knob, cover) => {
  const L = ARM_BASE_LEGENDS, at = o => ({ x: knob.x + o.dx / 1000, z: knob.z + o.dz / 1000 });
  const anti = at(L.antiSkating);
  const limit = cover.max.z - (L.frontMargin + L.antiSkating.size / 2) / 1000;
  const clamped = anti.z > limit;
  if (clamped) anti.z = limit;
  const tracking = at(L.tracking);
  return { clamped, raised: [{ tri: L.index.tri / 1000, ...at(L.index) }], items: [
    { text: 'single', ...at(L.single), size: L.single.size / 1000 },
    { text: 'tracking', ...tracking, x: tracking.x - 0.0019, size: L.tracking.size / 1000 },
    { angle: 0.0026, x: tracking.x + 0.0056, z: tracking.z },
    { text: 'multi', ...at(L.multi), size: L.multi.size / 1000 },
    { ring: L.zero.ring / 1000, ...at(L.zero) },
    { text: 'anti-skating', ...anti, size: L.antiSkating.size / 1000 },
  ] };
};

function rootPoints(mesh, rootInverse) {
  const matrix = rootInverse.clone().multiply(mesh.matrixWorld), p = mesh.geometry.attributes.position, out = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(matrix));
  return out;
}

// Split one body's triangles into material groups without touching vertices.
function groupFaces(mesh, points, classify) {
  const g = mesh.geometry, count = g.index ? g.index.count : points.length, c = new THREE.Vector3(), tally = [0, 0];
  g.clearGroups();
  let last = -1, start = 0;
  for (let t = 0; t < count; t += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(points[g.index ? g.index.getX(t + k) : t + k]);
    const index = classify(c.multiplyScalar(1 / 3)); tally[index] += 1;
    if (index !== last) { if (last >= 0) g.addGroup(start, t - start, last); start = t; last = index; }
  }
  if (last >= 0) g.addGroup(start, count - start, last);
  return tally;
}

export function applyExteriorArmBase({ scenes, root, kit }) {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const materials = [], textures = [], added = [];
  const report = { classification: 'photo-supported appearance on fixed CAD shapes; legend layout photo-relative', features: [], omitted: [] };
  const material = (source, options) => { const m = (source || new THREE.MeshStandardMaterial()).clone(); Object.assign(m, options); materials.push(m); return m; };
  // Same bright plated response as the gimbal trim in exterior-arm.js.
  const chrome = material(kit?.M?.chrome, { color: new THREE.Color(0xc7cbce), metalness: 0.92, roughness: 0.23 });
  const meshesOf = name => { const body = scenes.arm?.getObjectByName(name) || scenes.cue?.getObjectByName(name); const out = []; body?.traverse(o => { if (o.isMesh) out.push(o); }); return { body, out }; };
  const first = m => Array.isArray(m) ? m[0] : m;

  // Selector 70: the owner's close-ups (2026-11-19) show a black stalk with a bright turned cap;
  // rb040 and dF 02:42 show only that bright top. The lever under the cover keeps its plating.
  // The cap is the top 3 mm of the stalk; its real length is a photo estimate.
  {
    const { out } = meshesOf('arm.70.mode_lever');
    const black = material(kit?.M?.plastic, { color: new THREE.Color(0x0d0d0f), metalness: 0.1, roughness: 0.42 });
    const points = new Map(out.map(mesh => [mesh, rootPoints(mesh, rootInverse)]));
    const all = [...points.values()].flat();
    if (all.length) {
      const top = Math.max(...all.map(p => p.y)), capFrom = top - 0.003, stalkFrom = top - 0.0075, tally = [0, 0, 0];
      for (const mesh of out) {
        groupFaces(mesh, points.get(mesh), c => { const i = c.y >= capFrom ? 0 : c.y >= stalkFrom ? 1 : 0; tally[c.y >= capFrom ? 0 : i ? 1 : 2] += 1; return i; });
        mesh.material = [chrome, black];
      }
      report.features.push({ body: 'arm.70.mode_lever', surfaces: 'bright cap, black stalk, plated lever', faces: { cap: tally[0], stalk: tally[1], lever: tally[2] }, source: "owner's plain-1229 close-ups 2026-11-19; MAARC rb040; dFnPyYWFTE8 02:42" });
    }
  }

  // Rest bar 52 is a dark plastic bridge on chrome pin 50 (dF 02:34, bXv 03:55,
  // hifiwiki top view). Faces above the pin's upper end belong to the bar.
  // Statistics are body-wide: a body may arrive as one batched mesh or one mesh per face.
  {
    const { out } = meshesOf('arm.52.rest_bar_and_pin50');
    const plastic = first(meshesOf('arm.66.rest_post').out[0]?.material);
    const points = new Map(out.map(mesh => [mesh, rootPoints(mesh, rootInverse)]));
    const all = [...points.values()].flat();
    if (all.length) {
      // Bar is the 1.2 mm-radius tube whose crown is the body top; pin 50 ends at its axis.
      const barBottom = Math.max(...all.map(p => p.y)) - 0.0024 - 0.00005;
      const tally = [0, 0];
      for (const mesh of out) {
        const t = groupFaces(mesh, points.get(mesh), c => c.y >= barBottom ? 1 : 0); tally[0] += t[0]; tally[1] += t[1];
        mesh.material = [chrome, plastic || first(mesh.material)];
      }
      report.features.push({ body: 'arm.52.rest_bar_and_pin50', surfaces: 'chrome pin 50, dark bar 52', faces: { pin: tally[0], bar: tally[1] }, source: 'dFnPyYWFTE8 02:34; bXv4Md0Nsnw 03:55; hifiwiki top view' });
    }
  }

  // Cue handle 64: black moulded grip on a bright stalk (hifiwiki top and side
  // views, bXv 03:55, dF 02:34). Split at the start of the wider grip.
  {
    const { out } = meshesOf('cue.064.handle');
    const points = new Map(out.map(mesh => [mesh, rootPoints(mesh, rootInverse)]));
    const all = [...points.values()].flat();
    const low = all.length ? Math.min(...all.map(p => p.y)) : 0;
    const upper = all.filter(p => p.y > low + 0.0045);
    if (out.length && upper.length < 8) report.omitted.push('cue.064.handle: stalk not found');
    else if (out.length) {
      const mean = upper.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / upper.length);
      // Principal axis of the stalk and grip by power iteration.
      const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (const p of upper) { const d = p.clone().sub(mean).toArray(); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i * 3 + j] += d[i] * d[j]; }
      let axis = new THREE.Vector3(0, 1, 0);
      for (let k = 0; k < 40; k++) axis = new THREE.Vector3(cov[0] * axis.x + cov[1] * axis.y + cov[2] * axis.z, cov[3] * axis.x + cov[4] * axis.y + cov[5] * axis.z, cov[6] * axis.x + cov[7] * axis.y + cov[8] * axis.z).normalize();
      if (axis.y < 0) axis.negate();
      const along = p => p.clone().sub(mean).dot(axis);
      const radial = p => p.clone().sub(mean).addScaledVector(axis, -along(p)).length();
      const grip = upper.filter(p => radial(p) > 0.00225);
      if (!grip.length) report.omitted.push('cue.064.handle: grip not found');
      else {
        const gripStart = Math.min(...grip.map(along)) - 0.00002, tally = [0, 0];
        for (const mesh of out) {
          const plastic = first(mesh.material);
          const t = groupFaces(mesh, points.get(mesh), c => c.y > low + 0.0045 && along(c) >= gripStart ? 1 : 0); tally[0] += t[0]; tally[1] += t[1];
          mesh.material = [chrome, plastic];
        }
        report.features.push({ body: 'cue.064.handle', surfaces: 'bright stalk and shaft, black grip', faces: { metal: tally[0], grip: tally[1] }, source: 'hifiwiki top and side views; bXv4Md0Nsnw 03:55; dFnPyYWFTE8 02:34' });
      }
    }
  }

  // Printed legends on cover 68. Replaces the earlier overlay from details.js.
  // The cover is stepped: the captions lie on the recessed label panel, the index on the raised block.
  {
    const cover = scenes.structure?.getObjectByName('S68_arm_cover');
    const knob = scenes.arm?.getObjectByName('arm.79.antiskate_knob');
    if (cover && knob) {
      const cb = new THREE.Box3().setFromObject(cover), kc = new THREE.Box3().setFromObject(knob).getCenter(new THREE.Vector3());
      const lb = { x0: cb.min.x, z0: cb.min.z, w: cb.max.x - cb.min.x, d: cb.max.z - cb.min.z };
      // The block that carries setscrew 218 reaches forward of the panel; the caption stays on the panel.
      const panelFront = Math.min(cb.max.z, kc.z + 0.024);
      const { items, raised, clamped } = legendItems(kc, { max: { z: panelFront } });
      const stepped = cb.max.y - cb.min.y > ARM_BASE_LEGENDS.panelHeight / 1000 + 0.0005;
      const layers = stepped ? [[items, cb.min.y + ARM_BASE_LEGENDS.panelHeight / 1000, 'finish-arm-legends'], [raised, cb.max.y, 'finish-arm-index']]
        : [[[...items, ...raised], cb.max.y, 'finish-arm-legends']];
      for (const [list, y, name] of layers) {
        const texture = legendTexture(lb, list); textures.push(texture);
        const label = new THREE.Mesh(new THREE.PlaneGeometry(lb.w, lb.d), material(null, {
          map: texture, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }));
        label.rotation.x = -Math.PI / 2;
        label.position.set((cb.min.x + cb.max.x) / 2, y + 0.00005, (cb.min.z + cb.max.z) / 2);
        label.name = name; label.castShadow = false;
        root.add(label); root.updateMatrixWorld(true); cover.attach(label); added.push(label);
      }
      report.features.push({ body: 'S68_arm_cover', surfaces: 'white legends: single, tracking ∢, multi, O, anti-skating on the panel; index triangle on the raised block',
        antiSkatingClampedToCoverEdge: clamped, source: "owner's plain-1229 close-ups 2026-11-19; bXv4Md0Nsnw 02:25; dFnPyYWFTE8 02:42; hifiwiki top view" });
    }
  }
  return { report, meshes: [], dispose() {
    for (const mesh of added) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    for (const t of textures) t.dispose(); for (const m of materials) m.dispose();
  } };
}

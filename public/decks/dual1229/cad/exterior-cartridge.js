// The pickup in the TK14 holder, modelled on a Shure M91ED-pattern moving-magnet cartridge (the
// operator's choice, 2026-11-18, from two photos of an M91ED and the 1229 close-up dFnPyYWFTE8 3:26).
// Built as visual detail over the exported ctx.cartridge_generic box, which stays in the scene
// (hidden) as the stylus datum that the arm and its tests measure. No lettering is reproduced.
//
// What it shows, in the headshell frame (X along the head towards the stylus, Y up, Z across):
//   - the mounting bracket along the top, wider than the body, with an ear each side on the
//     ½-inch centres and vertical fins down its sides (the ribs the 1229 photo catches);
//   - the body below it: a narrow black block, a dark label plate on each side (left blank), and a
//     recessed rear panel carrying four brass pins, one with its ground tab, and the four
//     coloured leads (red, green, white, blue) running up into the holder;
//   - the replaceable stylus: a block forming the front of the cartridge, its brass tongue hidden in
//     the body, wings at its top, vertical grooves, and a channel underneath between two shoulders;
//   - the cantilever, its damper, and the diamond, whose tip stays on the exported stylus datum
//     (48, -21.5, 0) mm.
// The stylus fitted follows the Workbench's cartridge choice (ctx.cart from the deck view):
//   mm-ell  yellow grip: the elliptical N91ED's grip (operator photo; Shure M91ED-GS guide);
//   mm-con  black grip: the other stylus in the operator's photos;
//   mc-line a moving coil is a different cartridge: the same form in satin aluminium, black grip.
// Sizes are estimates from the photos and the source envelope (about 15 × 14 × 17 mm from holder to
// tip; mass about 6 g); see cad/components/pickup.json.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const MM = 0.001;
export const TIP = Object.freeze([48, -21.5, 0]); // mm, the exported stylus datum in the headshell frame
export const PICKUPS = Object.freeze({
  'mm-con': { body: 'black', grip: 'black', label: 'Moving magnet, conical stylus (black grip)' },
  'mm-ell': { body: 'black', grip: 'yellow', label: 'Moving magnet, elliptical stylus (yellow grip)' },
  'mc-line': { body: 'aluminium', grip: 'black', label: 'Moving coil, line-contact stylus' },
});

export function applyExteriorCartridge({ root, kit, frame }) {
  const meshes = [], hiddenMeshes = [], geometries = [], materials = [];
  const report = {
    component: 'pickup in the TK14 holder (Shure M91ED pattern)',
    classification: 'photo-led visual reconstruction; dimensions estimated, no lettering reproduced',
    preserved: ['ctx.cartridge_generic kept (hidden) as the stylus datum', 'stylus tip at the exported datum', 'arm pose and contacts untouched'],
    features: [], fitted: null,
  };
  const source = root.getObjectByName('ctx.cartridge_generic');
  if (!source || !frame) return { meshes, hiddenMeshes, report: { ...report, unavailable: true }, status: report, update() {}, dispose() {} };
  // Hidden as the headshell hides its source holder: switched off (the CAD binding re-shows imported
  // meshes by layer, so a layer alone does not hide it) and listed, and restored on dispose.
  const restores = [];
  source.traverse(n => { if (n.isMesh) { restores.push([n, n.visible]); n.visible = false; hiddenMeshes.push(n); } });

  const group = new THREE.Group(); group.name = 'exterior-cartridge';
  frame.add(group);
  const keep = m => { materials.push(m); return m; };
  const plastic = (color, roughness, specularIntensity = .35) => keep(new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness, specularIntensity, envMapIntensity: .55, ior: 1.48 }));
  const metal = (color, roughness, metalness = .92) => keep(new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  const M = {
    body: plastic(0x121214, .38, .42), // the black moulded body, a soft sheen
    bracket: plastic(0x161618, .46, .4), // the finned bracket: same black, a little more satin
    aluminium: metal(0xc9ccd0, .42, .62), // a moving coil's satin body
    label: metal(0x45474b, .4, .55), // dark anodised label plate, left blank
    gripBlack: plastic(0x0f0f11, .5, .32), gripYellow: plastic(0xe7d49a, .55, .3),
    chrome: metal(0xd9dde1, .16, .95),
    groove: plastic(0x2a261d, .7, .2), // the shadowed floor of a moulded groove
    cantilever: metal(0xd2d5d8, .22),
    damper: plastic(0x0a0a0a, .8, .15),
    diamond: keep(new THREE.MeshPhysicalMaterial({ color: 0xf4f6f8, metalness: 0, roughness: .05, ior: 2.4, specularIntensity: 1 })),
    brass: metal(0xb89458, .34, .9), tab: metal(0xc4c7cb, .3, .9),
    red: plastic(0xb3261e, .55), green: plastic(0x2f7d3a, .55), white: plastic(0xe6e3dc, .55), blue: plastic(0x2a4f9a, .55),
  };
  const roles = { body: [], grip: [] };
  function add(name, geometry, material, role) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `exterior-cartridge-${name}`;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData = { exteriorCartridgeDetail: true, visualOnly: true, cad: 'arm', part: 'cad:arm:ctx.cartridge_generic', provisional: report.classification };
    group.add(mesh); meshes.push(mesh); geometries.push(geometry); report.features.push(name);
    if (role) roles[role].push(mesh);
    return mesh;
  }
  // A side profile in X-Y (mm), extruded across Z and centred; the bevel rounds its edges.
  function profile(points, width, bevel) {
    const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x * MM, y * MM)));
    const g = new THREE.ExtrudeGeometry(s, { depth: (width - 2 * bevel) * MM, bevelEnabled: true, bevelSize: bevel * MM, bevelThickness: bevel * MM, bevelSegments: 3, curveSegments: 8, steps: 1 });
    g.translate(0, 0, -(width - 2 * bevel) / 2 * MM);
    return g;
  }
  const box = (w, h, d, r, at) => { const g = new RoundedBoxGeometry(w * MM, h * MM, d * MM, 3, r * MM); if (at) g.translate(at[0] * MM, at[1] * MM, (at[2] || 0) * MM); return g; };

  // ---- the body: a narrow black block under the bracket, the grip covering its front -------------
  add('body', box(13.4, 12.8, 10.2, .45, [36.7, -11.2, 0]), M.body, 'body'); // its underside in line with the stylus block's
  for (const side of [-1, 1]) add(`label-${side < 0 ? 'left' : 'right'}`, box(8.6, 3.6, .25, .1, [36.4, -12.6, side * 5.13]), M.label);
  // the rear panel: a shallow frame round the recess the pins stand in
  add('rear-recess', box(.3, 10.2, 8.2, .1, [29.92, -11.2, 0]), M.bracket);
  // ---- the mounting bracket along the top: wider than the body, ears on the ½-inch centres --------
  add('bracket', box(14.4, 3.4, 13.0, .35, [37.0, -6.2, 0]), M.bracket, 'body');
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) { // vertical fins down each side of the bracket
      add(`fin-${side < 0 ? 'l' : 'r'}${i}`, box(.8, 4.6, .9, .15, [31.4 + i * 2.2, -6.9, side * 6.75]), M.bracket, 'body');
    }
    // the ear round each mounting screw, and the screw's chrome head below it
    const ear = add(`ear-${side < 0 ? 'left' : 'right'}`, new THREE.CylinderGeometry(1.7 * MM, 1.7 * MM, 3.4 * MM, 18), M.bracket, 'body');
    ear.position.set(38.4 * MM, -6.2 * MM, side * 6.35 * MM);
    const head = add(`screw-${side < 0 ? 'left' : 'right'}`, new THREE.CylinderGeometry(1.15 * MM, 1.15 * MM, .7 * MM, 16), M.chrome);
    head.position.set(38.4 * MM, -8.25 * MM, side * 6.35 * MM);
  }
  // ---- the stylus: the replaceable yellow (or black) block that is the front of the cartridge -------
  // Its brass tongue slides into the body, hidden. Underneath, the cantilever leaves a channel between
  // two shoulders; its sides carry vertical grooves and its top steps out into wings (operator photos).
  add('grip', profile([[41.6, -5.0], [48.2, -5.0], [49.2, -6.1], [49.2, -15.6], [48.4, -17.6], [41.6, -17.6]], 11.6, .35), M.gripYellow, 'grip');
  for (const side of [-1, 1]) {
    const s0 = side < 0 ? 'left' : 'right';
    add(`grip-wing-${s0}`, box(5.2, 3.0, 1.4, .3, [45.6, -6.6, side * 6.2]), M.gripYellow, 'grip');
    add(`grip-shoulder-${s0}`, box(4.6, 1.4, 4.0, .3, [43.9, -17.9, side * 3.6]), M.gripYellow, 'grip'); // the channel between them
    for (const x of [44.1, 46.9]) add(`grip-groove-${s0}-${x}`, box(.5, 9.4, .2, .08, [x, -12.0, side * 5.86]), M.groove);
  }
  add('grip-groove-front', box(.2, 8.6, .6, .08, [49.25, -11.0, 0]), M.groove);
  // ---- the cantilever, its damper, and the diamond on the stylus datum ----------------------------
  const root0 = new THREE.Vector3(43.6, -17.7, 0), end = new THREE.Vector3(TIP[0] - .05, TIP[1] + .42, 0);
  const along = end.clone().sub(root0), len = along.length(), dir = along.clone().normalize();
  const cantilever = add('cantilever', new THREE.CylinderGeometry(.16 * MM, .24 * MM, len * MM, 12), M.cantilever);
  cantilever.position.copy(root0.clone().add(end).multiplyScalar(.5 * MM));
  cantilever.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); // its thin end at the diamond
  const damper = add('damper', new THREE.CylinderGeometry(.45 * MM, .45 * MM, .8 * MM, 14), M.damper);
  damper.position.copy(root0.clone().addScaledVector(dir, .2).multiplyScalar(MM));
  damper.quaternion.copy(cantilever.quaternion);
  const shank = add('stylus-shank', box(.3, .3, .3, .05), M.cantilever);
  shank.position.set(end.x * MM, (end.y - .05) * MM, 0);
  const diamond = new THREE.ConeGeometry(.17 * MM, .32 * MM, 10); diamond.rotateX(Math.PI); // apex down
  const tip = add('diamond', diamond, M.diamond);
  tip.position.set(TIP[0] * MM, (TIP[1] + .16) * MM, TIP[2] * MM); // apex exactly on the datum
  // ---- four brass pins in the rear recess, one with its ground tab, and the leads up into the holder ----
  const PINS = [[-7.4, -2.4, M.white], [-9.8, .6, M.red], [-12.2, -2.4, M.blue], [-12.6, 2.4, M.green]];
  for (const [y, z, lead] of PINS) {
    const pin = add(`pin-${y}-${z}`, new THREE.CylinderGeometry(.45 * MM, .45 * MM, 3.0 * MM, 12), M.brass);
    pin.rotation.z = Math.PI / 2; pin.position.set(28.3 * MM, y * MM, z * MM);
    // the lead: a clip on the pin, then the wire curving up and back under the holder
    const clip = add(`clip-${y}-${z}`, new THREE.CylinderGeometry(.62 * MM, .62 * MM, 1.6 * MM, 12), M.brass);
    clip.rotation.z = Math.PI / 2; clip.position.set(27.2 * MM, y * MM, z * MM);
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(26.4, y, z), new THREE.Vector3(24.8, y + .8, z * 1.1), new THREE.Vector3(23.4, (y - 4.6) / 2, z * 1.2), new THREE.Vector3(22.6, -4.9, z * 1.25),
    ].map(v => v.multiplyScalar(MM)));
    add(`lead-${y}-${z}`, new THREE.TubeGeometry(path, 20, .38 * MM, 8, false), lead);
  }
  const tab = add('ground-tab', box(.25, 1.6, 1.2, .08, [29.6, -7.4, -3.6]), M.tab);
  tab.rotation.x = 0;

  // the Workbench's choice of stylus
  let fitted = null;
  function fit(key) {
    const p = PICKUPS[key] || PICKUPS['mm-con'];
    if (fitted === p) return;
    fitted = p; report.fitted = Object.keys(PICKUPS).find(k => PICKUPS[k] === p);
    for (const m of roles.body) m.material = p.body === 'aluminium' ? M.aluminium : (m.name.endsWith('body') ? M.body : M.bracket);
    const grip = p.grip === 'yellow' ? M.gripYellow : M.gripBlack;
    for (const m of roles.grip) m.material = grip;
  }
  fit('mm-con');

  // join the cartridge's part, so the deck's part highlighting and component captures find it
  const part = kit.parts?.['cad:arm:ctx.cartridge_generic'];
  if (part) part.meshes.push(...meshes);
  group.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  for (const mesh of meshes) { mesh.geometry.computeBoundingBox(); bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix)); }
  report.localBoundsMm = { min: bounds.min.toArray().map(v => +(v / MM).toFixed(2)), max: bounds.max.toArray().map(v => +(v / MM).toFixed(2)) };
  report.sourceGeometryHidden = ['ctx.cartridge_generic'];
  return {
    meshes, hiddenMeshes, group, report, status: report, fit,
    get fitted() { return report.fitted; },
    update(dt, s, ctx) { if (ctx && ctx.cart) fit(ctx.cart); },
    dispose() {
      if (part) part.meshes = part.meshes.filter(m => !meshes.includes(m));
      for (const [n, visible] of restores) n.visible = visible;
      group.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    },
  };
}

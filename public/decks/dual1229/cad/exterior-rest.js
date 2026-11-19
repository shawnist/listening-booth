// The tonearm rest as the plain 1229 has it (service manual M-DE p.9 Fig.15; hifiwiki photo of the
// arm on its rest; Fig.30 from above), drawn over the exported bodies, which stay in the scene hidden:
//   - post 66 ("Stuetze"): a tall black post under the arm's support piece ("Tonarmauflagestueck").
//     Its top is a slot the support piece drops into: the slot floor is the exported post's top,
//     so the contact the lift model reads (cad/lift-contact.js, arm.66's top face) and the parked
//     height are unchanged. Fig. 7 shows the lock open beside the outer cheek. Photos of
//     a loose 227 000 rest show the keeper arching over the cradle when closed.
//   - bar 52 ("Steg"): a tall thin dark plate on edge from the post's top to pin 50, lying on the pin.
//   - pin 50 ("Dorn"): the chrome pin behind the badge, left exactly where it was exported.
// bindArm (cad/arm.js) has already moved arm.66 in plan to the parked arm at REST (spec.js, D5);
// this reads its moved position. Sizes are estimates from the photos (see cad/components/arm-rest.json).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const MM = 0.001;
// mm. The slot between the cheeks is 9 mm across: the arm's support piece flares to 8.7 mm just under the cheeks' tops.
const POST = { width: 12.0, depth: 8.0, cheek: 1.5, cheekRise: 2.4, r: 0.45 };
// The closed profile follows the loose rest photo. Its scale and the assumed hinge
// are fitted to the installed socket envelope, with the open outline checked against Fig. 7.
const LOCK = { hingeX: 0.35, hingeY: 3.9, openAngle: THREE.MathUtils.degToRad(177) };
const BAR = { height: 7.0, thick: 2.0 }; // a plate on edge, its top level with the slot floor (operator photos)

export function applyExteriorRest({ root, kit }) {
  const meshes = [], hiddenMeshes = [], geometries = [], materials = [], restores = [];
  const report = {
    component: 'plain-1229 rest: post 66 with its forked slot and curved keeper, bar 52, pin 50',
    classification: 'manual-and-photo visual reconstruction; sizes estimated; contact surface unchanged',
    preserved: ['arm.66 top face as the rest contact (hidden)', 'pin 50 position behind the badge'], features: [],
  };
  const post = root.getObjectByName('arm.66.rest_post'), barPin = root.getObjectByName('arm.52.rest_bar_and_pin50');
  if (!post || !barPin) return { meshes, hiddenMeshes, report: { ...report, unavailable: true }, status: report, update() {}, dispose() {} };
  root.updateMatrixWorld(true);
  // positions in root's own frame (the deck's), read from the exported (and moved) bodies
  const pointsOf = (o) => { const out = []; o.traverse(m => { if (!m.isMesh) return; const p = m.geometry.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) out.push(root.worldToLocal(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).clone())); }); return out; };
  const postBox = new THREE.Box3().setFromPoints(pointsOf(post)), c = postBox.getCenter(new THREE.Vector3());
  const floor = postBox.max.y, base = postBox.min.y;
  const barPts = pointsOf(barPin), barTop = Math.max(...barPts.map(p => p.y));
  const pinPts = barPts.filter(p => p.y < barTop - 0.004), pinBox = new THREE.Box3().setFromPoints(pinPts.length ? pinPts : barPts);
  const pin = pinBox.getCenter(new THREE.Vector3()), pinR = Math.max(pinBox.max.x - pinBox.min.x, pinBox.max.z - pinBox.min.z) / 2;
    for (const o of [post, barPin]) o.traverse(n => { if (n.isMesh) { restores.push([n, n.visible]); n.visible = false; hiddenMeshes.push(n); } });

  const group = new THREE.Group(); group.name = 'exterior-rest'; root.add(group);
  const keep = m => { materials.push(m); return m; };
  const moulding = keep(new THREE.MeshPhysicalMaterial({ color: 0x141416, metalness: 0, roughness: .5, specularIntensity: .32, envMapIntensity: .55, ior: 1.48 }));
  const chrome = keep(new THREE.MeshStandardMaterial({ color: 0xd2d6da, metalness: .95, roughness: .18 }));
  const partKey = { post: 'cad:arm:arm.66.rest_post', bar: 'cad:arm:arm.52.rest_bar_and_pin50' };
  function add(name, geometry, material, which, at) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `exterior-rest-${name}`;
    if (at) mesh.position.copy(at);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData = { exteriorRestDetail: true, visualOnly: true, cad: 'arm', part: partKey[which], provisional: report.classification };
    group.add(mesh); meshes.push(mesh); geometries.push(geometry); report.features.push(name);
    kit.parts?.[partKey[which]]?.meshes.push(mesh);
    return mesh;
  }
  const box = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, r);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // The platter is towards -x. The operator's photos show a cheek each side of the slot and
  // bar 52 standing on edge, with its top level with the slot floor.
  const half = POST.width / 2 * MM, cheek = POST.cheek * MM, rise = POST.cheekRise * MM;
  add('post', box(POST.width * MM, floor - base, POST.depth * MM, POST.r * MM), moulding, 'post', V(c.x, (floor + base) / 2, c.z));
  for (const side of [-1, 1]) add(`post-cheek-${side < 0 ? 'inner' : 'outer'}`, box(cheek, rise + 0.0008, POST.depth * MM, 0.3 * MM), moulding, 'post', V(c.x + side * (half - cheek / 2), floor + (rise - 0.0008) / 2, c.z));
  // The stationary outside cheek extends above the closed keeper.
  const lockAt = V(c.x + half, floor, c.z - 1.2 * MM);
  const pt = (x, y) => new THREE.Vector2(x * MM, y * MM);
  function lockGeometry(profile, thickness, bevel) {
    const geometry = new THREE.ExtrudeGeometry(profile, {
      depth: thickness * MM, bevelThickness: bevel * MM, bevelSize: bevel * MM,
      bevelSegments: 2, curveSegments: 10,
    });
    geometry.translate(0, 0, -thickness * MM / 2);
    return geometry;
  }
  const stripBottom = (base - floor) / MM + 0.8;
  const strip = new THREE.Shape([
    pt(-0.35, stripBottom), pt(0.9, stripBottom), pt(0.9, 12.9),
    pt(0.5, 13.6), pt(-0.7, 13.6), pt(-0.85, 13.22), pt(-0.85, 2.35),
  ]);
  add('lock-strip', lockGeometry(strip, 1.8, 0.12), moulding, 'post', lockAt);

  // The same keeper supplies the beveled thumb surface when it swings out.
  // Its upper nose passes the tube centerline with the concave underside over the socket.
  const hinge = new THREE.Group();
  hinge.name = 'exterior-rest-lock-hinge';
  hinge.position.copy(lockAt).add(V(LOCK.hingeX * MM, LOCK.hingeY * MM, 1.54 * MM));
  group.add(hinge);

  const profile = new THREE.Shape();
  profile.moveTo(-0.1 * MM, 12.35 * MM);
  profile.lineTo(-9.05 * MM, 12.35 * MM);
  profile.quadraticCurveTo(-9.7 * MM, 12.35 * MM, -9.15 * MM, 11.43 * MM);
  profile.quadraticCurveTo(-8.8 * MM, 10.58 * MM, -8.08 * MM, 10.64 * MM);
  profile.lineTo(-6.95 * MM, 10.64 * MM);
  profile.bezierCurveTo(-4.35 * MM, 10.65 * MM, -2.03 * MM, 8.65 * MM, -1.93 * MM, 5.4 * MM);
  profile.quadraticCurveTo(-1.95 * MM, 3.15 * MM, -1 * MM, 3.15 * MM);
  profile.quadraticCurveTo(0.45 * MM, 3.15 * MM, 0.45 * MM, 4.0 * MM);
  profile.quadraticCurveTo(0.43 * MM, 5.3 * MM, -0.1 * MM, 5.75 * MM);
  profile.closePath();
  const brushed = keep(new THREE.MeshStandardMaterial({ color: 0x858b90, metalness: .78, roughness: .42 }));
  const keeperGeometry = lockGeometry(profile, .75, .14);
  keeperGeometry.translate(-LOCK.hingeX * MM, -LOCK.hingeY * MM, 0);
  const keeper = add('lock-keeper', keeperGeometry, brushed, 'post');
  hinge.add(keeper);

  function setLockOpening(fraction) {
    hinge.rotation.z = -LOCK.openAngle * fraction;
  }
  setLockOpening(1);
  // bar 52: a plate on edge from the post's platter-side face to pin 50, its top level with the slot floor
  const barTopY = floor, barBot = floor - BAR.height * MM, barX0 = pin.x - pinR - 0.0008, barX1 = c.x - half;
  add('bar', box(barX1 - barX0, BAR.height * MM, BAR.thick * MM, 0.35 * MM), moulding, 'bar', V((barX0 + barX1) / 2, (barTopY + barBot) / 2, pin.z));
  // pin 50: chrome, where it was exported, up to the bar lying on it
  add('pin', new THREE.CylinderGeometry(pinR, pinR, barBot - base, 20), chrome, 'bar', V(pin.x, (base + barBot) / 2, pin.z));

  report.postCentreMm = [c.x, c.z].map(v => +(v / MM).toFixed(2));
  report.slotFloorMm = +(floor / MM).toFixed(2);
  report.pinMm = [pin.x, pin.z].map(v => +(v / MM).toFixed(2));
  report.sourceGeometryHidden = ['arm.66.rest_post', 'arm.52.rest_bar_and_pin50'];
  return {
    meshes, hiddenMeshes, group, report, status: report, setLockOpening, update() {},
    dispose() {
      for (const [k, key] of Object.entries(partKey)) { const part = kit.parts?.[key]; if (part) part.meshes = part.meshes.filter(m => !meshes.includes(m)); void k; }
      for (const [n, visible] of restores) n.visible = visible;
      group.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    },
  };
}

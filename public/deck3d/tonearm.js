// The tonearm: gimbal bearing, J-shaped tube, headshell, cartridge with a stylus you can
// see, counterweight, rest and cue lift. Its geometry comes from the same numbers the audio
// engine uses (effective length and null points), so the stylus is drawn where the engine
// believes it is.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { REST, Y_PIVOT, Y_REC, DH, LIFT, PIVOT_ANGLE } from './layout.js';
import { lathe } from './hardware.js';

export function createTonearm(M, deck) {
  const L = deck.armL, dist = Math.sqrt(L * L - deck.null1 * deck.null2);
  const off = Math.asin((deck.null1 + deck.null2) / (2 * L)); // headshell offset angle
  const pivot = { x: dist * Math.cos(PIVOT_ANGLE), z: -dist * Math.sin(PIVOT_ANGLE) };

  // ---- where the stylus is for a given groove radius --------------------------------------
  function stylusXZ(r) {
    const a = (r * r - L * L + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, r * r - a * a));
    const ux = pivot.x / dist, uz = pivot.z / dist, mx = a * ux, mz = a * uz;
    const z1 = mz - h * ux, z2 = mz + h * ux;
    return z1 > z2 ? { x: mx + h * uz, z: z1 } : { x: mx - h * uz, z: z2 };
  }
  const angleFor = (r) => { const s = stylusXZ(r); return Math.atan2(s.z - pivot.z, s.x - pivot.x); };
  const radiusForAngle = (a) => Math.hypot(pivot.x + L * Math.cos(a), pivot.z + L * Math.sin(a));
  // Bearing tilt that puts the stylus tip at height y.
  const hyp = Math.hypot(L, DH), delta = Math.atan2(DH, L);
  const phiFor = (y) => delta + Math.asin(Math.max(-1, Math.min(1, (y - Y_PIVOT) / hyp)));
  const phiUp = phiFor(Y_REC + LIFT);

  const all = new THREE.Group();
  const sh = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = sh(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); parent.add(m); return m; };
  const alongX = (m) => { m.rotation.z = -Math.PI / 2; return m; }; // a lathe or cylinder made along y, laid along x

  // ---- fixed base ---------------------------------------------------------------------------
  const base = new THREE.Group(); base.position.set(pivot.x, 0, pivot.z); all.add(base);
  add(base, lathe([[0.031, 0], [0.031, 0.0032], [0.0298, 0.0044], [0.0142, 0.0044]], 64), M.darkTurned);
  add(base, lathe([[0.0142, 0.0044], [0.0142, 0.0072], [0.0128, 0.0084], [0.0112, 0.0084], [0.0112, Y_PIVOT - 0.0205], [0.0124, Y_PIVOT - 0.0195], [0.0124, Y_PIVOT - 0.0170], [0, Y_PIVOT - 0.0170]], 48), M.aluBright);
  add(base, lathe([[0.0062, 0.0044], [0.0062, 0.0104], [0.0054, 0.0112], [0, 0.0112]], 32), M.knurledDark, 0.0195, 0, 0.0115); // anti-skate dial

  // ---- yaw: swings across the record ----------------------------------------------------------
  const yaw = new THREE.Group(); yaw.position.set(pivot.x, Y_PIVOT, pivot.z); all.add(yaw);
  for (const s of [-1, 1]) {
    add(yaw, new RoundedBoxGeometry(0.0125, 0.0215, 0.003, 2, 0.001), M.dark, 0, -0.0068, s * 0.0128);
    const capm = add(yaw, new THREE.CylinderGeometry(0.0034, 0.0034, 0.0014, 20), M.brass, 0, 0, s * 0.0148); capm.rotation.x = Math.PI / 2;
  }
  add(yaw, new RoundedBoxGeometry(0.0125, 0.003, 0.0286, 2, 0.001), M.dark, 0, -0.0161, 0);

  // ---- pitch: tips up and down on the bearing ------------------------------------------------
  const pitch = new THREE.Group(); yaw.add(pitch);
  const hub = add(pitch, new THREE.CylinderGeometry(0.0066, 0.0066, 0.0222, 32), M.aluBright); hub.rotation.x = Math.PI / 2;
  add(pitch, new RoundedBoxGeometry(0.017, 0.0115, 0.0135, 3, 0.0028), M.dark);
  alongX(add(pitch, new THREE.CylinderGeometry(0.0046, 0.0046, 0.074, 24), M.dark, -0.043, 0, 0));
  // counterweight with its tracking-force ring
  alongX(add(pitch, lathe([[0, -0.015], [0.0156, -0.015], [0.0168, -0.0138], [0.0168, 0.0138], [0.0156, 0.015], [0, 0.015]], 64), M.darkTurned, -0.054, 0, 0));
  alongX(add(pitch, new THREE.CylinderGeometry(0.0171, 0.0171, 0.0085, 64, 1, true), M.knurledDark, -0.0625, 0, 0));
  alongX(add(pitch, lathe([[0.0146, -0.003], [0.0152, -0.0024], [0.0152, 0.0024], [0.0146, 0.003]], 64), M.aluBright, -0.0362, 0, 0));
  alongX(add(pitch, new THREE.CylinderGeometry(0.0052, 0.0052, 0.002, 24), M.chrome, -0.081, 0, 0));

  // the tube: straight from the bearing, then a bend that brings the headshell onto the offset angle
  const c = { x: Math.cos(off), z: Math.sin(off) };
  const jEnd = { x: L - 0.047 * c.x, z: -0.047 * c.z };
  const corner = { x: jEnd.x - 0.036 * c.x, z: jEnd.z - 0.036 * c.z };
  const cl = Math.hypot(corner.x, corner.z), beta = Math.atan2(corner.z, corner.x);
  const V = (p) => new THREE.Vector3(p.x, 0, p.z);
  const s1 = { x: corner.x * (1 - 0.034 / cl), z: corner.z * (1 - 0.034 / cl) }, e1 = { x: corner.x + 0.024 * c.x, z: corner.z + 0.024 * c.z };
  const path = new THREE.CurvePath();
  path.add(new THREE.LineCurve3(new THREE.Vector3(0.006, 0, 0.006 * Math.tan(beta)), V(s1)));
  path.add(new THREE.QuadraticBezierCurve3(V(s1), V(corner), V(e1)));
  path.add(new THREE.LineCurve3(V(e1), V(jEnd)));
  add(pitch, new THREE.TubeGeometry(path, 120, 0.0043, 20, false), M.tube);

  // ---- headshell, cartridge, stylus -----------------------------------------------------------
  const head = new THREE.Group(); head.position.set(L, 0, 0); head.rotation.y = -off; pitch.add(head);
  const grab = [];
  grab.push(alongX(add(head, new THREE.CylinderGeometry(0.0057, 0.0057, 0.0105, 48, 1, true), M.knurled, -0.0418, 0, 0)));
  alongX(add(head, new THREE.CylinderGeometry(0.0055, 0.0055, 0.0107, 32), M.aluBright, -0.0418, 0, 0));
  const outline = new THREE.Shape();
  outline.moveTo(-0.0372, -0.0042); outline.lineTo(-0.0235, -0.0093); outline.lineTo(0.0068, -0.0093);
  outline.quadraticCurveTo(0.0092, -0.0093, 0.0092, -0.0069); outline.lineTo(0.0092, 0.0069); outline.quadraticCurveTo(0.0092, 0.0093, 0.0068, 0.0093);
  outline.lineTo(-0.0235, 0.0093); outline.lineTo(-0.0372, 0.0042); outline.closePath();
  for (const s of [-1, 1]) { // slots for the cartridge screws
    const slot = new THREE.Path(), z = s * 0.00635;
    slot.moveTo(-0.0165, z - 0.0012); slot.lineTo(-0.0015, z - 0.0012); slot.absarc(-0.0015, z, 0.0012, -Math.PI / 2, Math.PI / 2); slot.lineTo(-0.0165, z + 0.0012); slot.absarc(-0.0165, z, 0.0012, Math.PI / 2, Math.PI * 1.5);
    outline.holes.push(slot);
  }
  const plateGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.0012, bevelEnabled: true, bevelSize: 0.0002, bevelThickness: 0.0002, bevelSegments: 2, curveSegments: 8 });
  plateGeo.rotateX(-Math.PI / 2); plateGeo.translate(0, -0.0042, 0);
  grab.push(add(head, plateGeo, M.dark));
  for (const s of [-1, 1]) add(head, new THREE.CylinderGeometry(0.0021, 0.0021, 0.0012, 16), M.brass, -0.0085, -0.0022, s * 0.00635);
  // finger lift, on the side away from the spindle
  const liftPath = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.0045, -0.0034, -0.0088), new THREE.Vector3(-0.0045, -0.0034, -0.016), new THREE.Vector3(-0.0045, -0.0022, -0.0215), new THREE.Vector3(-0.0045, 0.0022, -0.0262), new THREE.Vector3(-0.0045, 0.0062, -0.0282)]);
  grab.push(add(head, new THREE.TubeGeometry(liftPath, 32, 0.0012, 10, false), M.tube));
  add(head, new THREE.SphereGeometry(0.0012, 10, 8), M.tube, -0.0045, 0.0062, -0.0282);
  // cartridge
  const cartBody = new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.1, roughness: 0.42 });
  const cartNose = new THREE.MeshStandardMaterial({ color: 0xd68a23, metalness: 0, roughness: 0.38 });
  grab.push(add(head, new RoundedBoxGeometry(0.0192, 0.0098, 0.0148, 3, 0.0012), cartBody, -0.0034, -0.0093, 0));
  grab.push(add(head, new RoundedBoxGeometry(0.0128, 0.0034, 0.0104, 2, 0.0009), cartNose, -0.0008, -0.0157, 0));
  add(head, new THREE.BoxGeometry(0.0002, 0.0074, 0.0007), new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.5 }), 0.00625, -0.0093, 0).castShadow = false;
  // cantilever and diamond: the tip is the point the engine tracks
  const cant = add(head, new THREE.CylinderGeometry(0.00034, 0.00042, 0.0058, 8), M.aluBright, -0.0026, -0.0178, 0);
  cant.rotation.z = Math.PI / 2 - Math.atan2(0.0021, 0.0054);
  const tip = add(head, new THREE.ConeGeometry(0.00042, 0.001, 10), M.chrome, 0, -DH + 0.0005, 0); tip.rotation.x = Math.PI;
  // the four signal wires
  [[0xc62f27, -0.0045, -0.0021], [0xe9e6dc, -0.0015, -0.0007], [0x2f8f4a, 0.0015, 0.0007], [0x2c5fc0, 0.0045, 0.0021]].forEach(([col, z0, z1]) => {
    const w = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.0128, -0.0085, z0), new THREE.Vector3(-0.019, -0.0098, z0 * 0.9), new THREE.Vector3(-0.029, -0.0072, z1 * 1.3), new THREE.Vector3(-0.0366, -0.003, z1)]);
    add(head, new THREE.TubeGeometry(w, 16, 0.00036, 6, false), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 })).castShadow = false;
  });

  // ---- rest post: where the tube lies when the arm is parked -----------------------------------
  const restDist = 0.112, restAng = angleFor(REST) + beta;
  const restPos = { x: pivot.x + restDist * Math.cos(restAng), z: pivot.z + restDist * Math.sin(restAng) };
  const restTubeY = Y_PIVOT + restDist * Math.cos(beta) * Math.sin(phiUp);
  const rest = new THREE.Group(); rest.position.set(restPos.x, 0, restPos.z); rest.rotation.y = -restAng; all.add(rest); // local x runs along the tube
  add(rest, lathe([[0.0072, 0], [0.0072, 0.0016], [0.0062, 0.0024], [0.0036, 0.0024], [0.0036, restTubeY - 0.0098], [0.0048, restTubeY - 0.0088], [0, restTubeY - 0.0088]], 32), M.dark);
  const cradle = add(rest, new THREE.TorusGeometry(0.0062, 0.0017, 10, 24, Math.PI), M.rubber, 0, restTubeY - 0.0001, 0);
  cradle.rotation.set(0, Math.PI / 2, 0); cradle.rotation.z = Math.PI; // a U open to the sky, across the tube
  add(rest, new THREE.BoxGeometry(0.0034, 0.0022, 0.0152), M.dark, 0, restTubeY - 0.0077, 0);

  // ---- cue lift: the padded bar that raises and lowers the tube --------------------------------
  const rc = 0.05, a0 = angleFor(REST) + beta - 0.1, a1 = angleFor(0.045) + beta + 0.1;
  const arcPts = [];
  for (let i = 0; i <= 24; i++) { const a = a0 + ((a1 - a0) * i) / 24; arcPts.push(new THREE.Vector3(pivot.x + rc * Math.cos(a), 0, pivot.z + rc * Math.sin(a))); }
  const liftBar = new THREE.Group(); all.add(liftBar);
  add(liftBar, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPts), 48, 0.0023, 10, false), M.rubber);
  const mid = arcPts[12];
  add(liftBar, new THREE.CylinderGeometry(0.0026, 0.0026, 0.05, 16), M.chrome, mid.x, -0.027, mid.z);
  add(all, lathe([[0.0062, 0], [0.0062, 0.003], [0.0052, 0.004], [0.004, 0.004], [0.004, Y_PIVOT - 0.0125], [0, Y_PIVOT - 0.0125]], 24), M.dark, mid.x, 0, mid.z);
  const barUp = Y_PIVOT + rc * Math.sin(phiUp) - 0.0043 - 0.0023, barDown = Y_PIVOT - 0.0043 - 0.0023 - 0.0022;

  function setPose(ang, phi, cue) {
    yaw.rotation.y = -ang;
    pitch.rotation.z = phi;
    liftBar.position.y = barDown + (barUp - barDown) * cue;
  }
  function dispose() {
    all.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  return { group: all, yaw, pitch, head, grab, L, dist, off, pivot, stylusXZ, angleFor, radiusForAngle, phiFor, phiUp, setPose, dispose };
}

// Drive: the M 1219 S motor on its three elastic mounts, and the stepped, tapered pulley 115 on its
// shaft. Owned by the drive builder (see OWNERS.md).
import * as THREE from 'three';
import { TAU, D } from '../../layout.js';
import { lathe, RoundedBoxGeometry } from '../shared/geometry.js';
import { makeCanvas, canvasTexture } from '../../../../deck3d/textures.js';
import { MOTOR as M, MOUNTS, HAT, PULLEY, FLOOR_Y, FLOOR_UNDER } from './place.js';
import { pulleyProfile, pulleyRAt, SETSCREW } from './kinematics.js';

// A rounded corner from (r0, y0) to (r1, y1) as a quarter arc, centre at (r0, y1) or (r1, y0).
function arc(pts, cx, cy, rad, a0, a1, n = 5) {
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); }
}

// The laminations between the two end bells: fine bright lines round the can (maarc rb016).
function laminationTexture() {
  const c = makeCanvas(8, 128), g = c.getContext('2d');
  for (let y = 0; y < 128; y++) { const k = y % 4 === 0 ? 120 : 196 + ((y * 37) % 23); g.fillStyle = `rgb(${k},${k},${k + 4})`; g.fillRect(0, y, 8, 1); }
  return canvasTexture(c, { srgb: true });
}

export function buildMotor(kit, root) {
  const { add, part, mat, mats } = kit;
  const r = M.r, c = M.corner, l = M.lip;
  const paint = mat(0x18181b, 0.35, 0.5); paint.side = THREE.DoubleSide; // double-sided so the Fig. 2 section shows it cut
  const motor = part('motor', root); motor.position.set(M.x, 0, M.z);

  // the two end bells, black pressed steel with rounded edges (Fig. 2, maarc rb016)
  const lower = [[0, M.bottom + 0.0008], [M.flat, M.bottom + 0.0008], [M.flat + 0.001, M.bottom]];
  arc(lower, r - c, M.bottom + c, c, -Math.PI / 2, 0); arc(lower, r - l, M.band[0] - l, l, 0, Math.PI / 2, 3); lower.push([r - l - 0.0006, M.band[0]]);
  add(motor, lathe(lower, 72), paint);
  const upper = [[r - l - 0.0006, M.band[1]]];
  arc(upper, r - l, M.band[1] + l, l, -Math.PI / 2, 0, 3); arc(upper, r - c, M.top - c, c, 0, Math.PI / 2); upper.push([0, M.top]);
  add(motor, lathe(upper, 72), paint);
  const band = new THREE.MeshStandardMaterial({ color: 0xc8c9cc, metalness: 0.8, roughness: 0.42, map: laminationTexture() }); band.side = THREE.DoubleSide;
  add(motor, new THREE.CylinderGeometry(r - 0.0005, r - 0.0005, M.band[1] - M.band[0], 72, 1, true), band, 0, (M.band[0] + M.band[1]) / 2, 0);
  // vent slots, three round each bell (rb016, Fig. 2)
  const slotGeo = new RoundedBoxGeometry(0.0115, 0.0028, 0.0014, 2, 0.0006), slotMat = mat(0x050506, 0.2, 0.8);
  for (const [y, a0] of [[(M.top + M.band[1]) / 2, 20], [(M.band[0] + M.bottom) / 2 + 0.001, 80]]) {
    for (let i = 0; i < 3; i++) {
      const a = (a0 + i * 120) * D, s = add(motor, slotGeo, slotMat, Math.cos(a) * (r - 0.0004), y, Math.sin(a) * (r - 0.0004));
      s.rotation.y = -a + Math.PI / 2;
    }
  }
  // the bottom: the lower bearing's brass plate with its three rivets (Fig. 31, rb017)
  add(motor, new THREE.CylinderGeometry(0.011, 0.011, 0.0006, 40), mat(0x9a8050, 0.85, 0.42), 0, M.bottom + 0.0005, 0);
  const rivet = new THREE.CylinderGeometry(0.0013, 0.0013, 0.0008, 12), rivetMat = mats.darkSteel();
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.4; add(motor, rivet, rivetMat, Math.cos(a) * 0.0125, M.bottom + 0.0004, Math.sin(a) * 0.0125); }
  add(motor, new THREE.CylinderGeometry(0.003, 0.003, 0.0012, 20), mats.steel(), 0, M.bottom + 0.0002, 0);
  // the two through-bolts' slotted heads at the bottom's edge (Fig. 31: at 135 and -45 deg)
  const head = lathe([[0, -0.0011], [0.0031, -0.0011], [0.0031, -0.0004], [0.0022, 0], [0, 0]], 16), headMat = mats.steel();
  const slot = new THREE.BoxGeometry(0.0046, 0.0005, 0.0006), slotDark = mats.darkSteel();
  for (const a of [135, -45]) {
    const x = Math.cos(a * D) * (r - 0.0052), z = Math.sin(a * D) * (r - 0.0052);
    add(motor, head, headMat, x, M.bottom + 0.0001, z).rotation.x = Math.PI;
    add(motor, slot, slotDark, x, M.bottom - 0.001, z).rotation.y = a * D + 0.6;
  }
  // the motor's leads, in a yellow sleeve, out of the upper bell toward the mains switch (rb016)
  const leadDir = Math.atan2(-0.0905, -0.060);
  const lead = add(motor, new THREE.CylinderGeometry(0.0018, 0.0018, 0.008, 10), mat(0xd9c46a, 0.0, 0.45), Math.cos(leadDir) * (r + 0.003), M.top - 0.012, Math.sin(leadDir) * (r + 0.003));
  lead.rotation.set(0, -leadDir, Math.PI / 2);

  // the top bracket (grey die-cast, rb016) with the upper bearing boss reaching up under the floor
  const zinc = mats.zinc(); zinc.side = THREE.DoubleSide;
  add(motor, lathe([[HAT.rBottom, M.top + 0.0002], [HAT.rTop, HAT.top - 0.0012], [HAT.rTop - 0.0012, HAT.top], [HAT.boss, HAT.top], [HAT.boss, FLOOR_Y - 0.0018], [0.0016, FLOOR_Y - 0.0018]], 48), zinc);
  // three elastic mounts: rubber grommets between the bracket and the floor, posts, nuts on the floor
  const grom = lathe([[0.0015, MOUNTS.grommet[0]], [0.0046, MOUNTS.grommet[0]], [0.0046, -0.0175], [0.0034, -0.0162], [0.0046, -0.0148], [0.0046, MOUNTS.grommet[1] - 0.0002], [0.0015, MOUNTS.grommet[1] - 0.0002]], 20);
  const post = new THREE.CylinderGeometry(0.0015, 0.0015, MOUNTS.post[1] - MOUNTS.post[0], 10);
  const hexNut = lathe([[0.0016, 0], [0.0037, 0], [0.0037, 0.0021], [0.0032, 0.0024], [0.0016, 0.0024]], 6), washer = new THREE.CylinderGeometry(0.0043, 0.0043, 0.0005, 18);
  const rubber = mats.rubber(), steel = mats.steel(), nutMat = mat(0x9da0a3, 0.85, 0.45), dark = mats.darkSteel();
  // the third mount, under the idler's path, is fastened from below: a stud up to the floor's underside
  // and its nut under the bracket's top, nothing of it above the dish floor
  const stud = new THREE.CylinderGeometry(0.0015, 0.0015, FLOOR_UNDER - MOUNTS.post[0] + 0.002, 10);
  MOUNTS.deg.forEach((deg, i) => {
    const x = Math.cos(deg * D) * MOUNTS.r, z = Math.sin(deg * D) * MOUNTS.r;
    add(motor, grom, rubber, x, 0, z);
    if (MOUNTS.fromBelow[i]) {
      add(motor, stud, steel, x, (FLOOR_UNDER + MOUNTS.post[0] - 0.002) / 2, z);
      add(motor, washer, nutMat, x, HAT.top - 0.00025, z);
      add(motor, hexNut, nutMat, x, HAT.top - 0.0005, z).rotation.set(Math.PI, deg * D, 0);
      return;
    }
    add(motor, post, steel, x, (MOUNTS.post[0] + MOUNTS.post[1]) / 2, z);
    add(motor, washer, nutMat, x, FLOOR_Y + 0.00025, z);
    add(motor, hexNut, nutMat, x, FLOOR_Y + 0.0005, z).rotation.y = deg * D;
    add(motor, new THREE.CylinderGeometry(0.0015, 0.0015, 0.0006, 10), dark, x, FLOOR_Y + 0.0032, z); // the post's end in the nut
  });
  // the ring round the pulley where it comes through the floor (Fig. 30: about 18 mm across)
  add(motor, lathe([[0.0068, FLOOR_Y], [0.009, FLOOR_Y], [0.009, FLOOR_Y + 0.0003], [0.0086, FLOOR_Y + 0.0006], [0.0068, FLOOR_Y + 0.0006]], 40), steel);

  // ---- the rotor's shaft and the pulley (turns with the motor) ----------------------------------------------
  const rotor = new THREE.Group(); rotor.position.set(M.x, 0, M.z); root.add(rotor);
  const pulley = part('pulley', rotor);
  const brass = mats.brass(); brass.side = THREE.DoubleSide;
  const top = PULLEY.steps['33'][1];
  add(pulley, lathe(pulleyProfile(), 40), brass);
  // the setscrew in the 78 step (Fig. 8), which also shows the pulley turning: its head lies flush with
  // the step's straight foot (0.03 mm proud at most), so the idler's tyre rolls over it
  const S = SETSCREW;
  const ss = add(pulley, new THREE.CylinderGeometry(S.r, S.r, S.t, 16), mat(0x2a2620, 0.6, 0.5), pulleyRAt('78', S.y) + S.proud - S.t / 2, S.y, 0);
  ss.rotation.z = -Math.PI / 2; ss.castShadow = false;
  add(pulley, new THREE.CylinderGeometry(PULLEY.shaftR, PULLEY.shaftR, 0.0012, 12), steel, 0, top + 0.0008, 0);
  add(rotor, new THREE.CylinderGeometry(PULLEY.shaftR, PULLEY.shaftR, PULLEY.collar.y - M.top + 0.004, 12), steel, 0, (PULLEY.collar.y + M.top - 0.004) / 2, 0);

  return {
    update(s) { rotor.rotation.y = s.motorTurns * TAU; }, // the pulley turns against the platter (it drives the idler from outside)
  };
}

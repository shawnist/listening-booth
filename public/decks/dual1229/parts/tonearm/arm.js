// The Dual 1229's arm, drawn (plain 1229, DECISIONS D1): a straight round aluminium tube whose
// bearing body (73) tips in a two-ring "gyroscopic" gimbal, the black outer ring (60) and the
// inner bearing ring (54) standing across the arm on four hardened points, the tracking force
// spring housing (77/78) as a drum on the bearing body's right-hand end, the black counterweight
// (74) on its threaded stud (75), the black removable head (41) with its ribbed finger lift, the
// TK 14 holder (215 430) and a generic cartridge (D20); the arm rest (66) and the lift platform.
// The geometry (222 mm, null points 66 / 121 mm) is spec.js's and the pivot layout.js's; the
// stylus is drawn where the audio engine believes it is, as on the other deck.
// Same interface as deck3d/tonearm.js, plus setForce(grams) and setRaise(metres).
import { lockingHandleGeometry, registerLatch } from './locking-handle.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Y_PIVOT, Y_REC, DH, LIFT } from '../../../../deck3d/layout.js';
import { SPEC, REST } from '../../spec.js';
import { CUE, liftAxis, cueRange, platformY, supportedStylusY } from '../../cue-geometry.js';
import { PIVOT, TAU } from '../../layout.js';
import { lathe, plateGeo, helixGeo, aim, RoundedBoxGeometry } from '../shared/geometry.js';
import { knurlTexture } from '../../../../deck3d/textures.js';
import { REST_BAR, ESC } from './place.js';
import { MODE_RAMP, EAR_TIP_SINGLE_Y, earAngles } from '../../mode-height.js';
import { forceScaleTexture, stripeTexture, streakTexture } from './textures.js';

export const REST_H = 0.55 * LIFT; // matches the mechanism: stylus height with the arm on its rest

// the gimbal's sizes (estimates from the photos against the 7 mm tube: register gimbal-outer-ring ~40 mm)
const G = {
  outer: { r0: 0.0182, r1: 0.0212, w: 0.0088 }, // ring 60: radii and depth along the arm
  inner: { r0: 0.0150, r1: 0.0176, w: 0.0066 }, // bearing ring 54
  body: { r: 0.0072, z0: -0.0060, z1: 0.0118 }, // bearing body 73, across the arm (+z: the platter side)
  drum: { r: 0.0080, z0: -0.0062, z1: -0.0106, rim: 0.0118 }, // spring housing 77/78 on the right-hand end
  tubeR: 0.0035, // the tube, 7 mm (register: 6-7)
};

export function createDualArm(kit, mats) {
  const { M } = kit;
  const L = SPEC.armL, dist = Math.hypot(PIVOT.x, PIVOT.z);
  const off = Math.asin((SPEC.null1 + SPEC.null2) / (2 * L)); // headshell offset angle, 24.9 deg
  const pivot = { x: PIVOT.x, z: PIVOT.z };

  function stylusXZ(r) {
    const a = (r * r - L * L + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, r * r - a * a));
    const ux = pivot.x / dist, uz = pivot.z / dist, mx = a * ux, mz = a * uz;
    const z1 = mz - h * ux, z2 = mz + h * ux;
    return z1 > z2 ? { x: mx + h * uz, z: z1 } : { x: mx - h * uz, z: z2 };
  }
  const angleFor = (r) => { const s = stylusXZ(r); return Math.atan2(s.z - pivot.z, s.x - pivot.x); };
  const radiusForAngle = (a) => Math.hypot(pivot.x + L * Math.cos(a), pivot.z + L * Math.sin(a));
  const hyp = Math.hypot(L, DH), delta = Math.atan2(DH, L);
  let raise = 0; // the whole arm assembly's height above its "single" seat, solved from the ear/ramp contact (mode-height.js)
  const phiFor = (y) => delta + Math.asin(Math.max(-1, Math.min(1, (y - Y_PIVOT - raise) / hyp)));
  const phiUp = phiFor(Y_REC + LIFT);

  const all = new THREE.Group(); all.name = 'arm';
  const add = kit.add, part = kit.part;
  const alongX = (m) => { m.rotation.z = -Math.PI / 2; return m; }; // a y-axis shape turned to lie along x
  const acrossZ = (m) => { m.rotation.x = Math.PI / 2; return m; }; // ... to lie along z
  // a ring standing across the arm: radii r0..r1, depth w along x, its edges eased
  const ringGeo = (r0, r1, w, e = 0.0006) => { const g = lathe([[r0 + e, -w / 2], [r1 - e, -w / 2], [r1, -w / 2 + e], [r1, w / 2 - e], [r1 - e, w / 2], [r0 + e, w / 2], [r0, w / 2 - e], [r0, -w / 2 + e], [r0 + e, -w / 2]], 96); g.rotateZ(-Math.PI / 2); return g; };

  // materials of the arm (made once)
  const satinBlack = kit.mat(0x141416, 0.35, 0.42); // anodised black rings and post
  const plasticBlack = kit.mat(0x121214, 0.05, 0.5); // the head, holder, rest
  // satin drawn aluminium, light grey as in the photos: fine streaks along the tube break up the
  // highlight so it does not read as white plastic (roughness here is scaled by the streak map, ~0.5)
  const streaks = streakTexture();
  const tubeMat = new THREE.MeshPhysicalMaterial({ color: 0x84878c, metalness: 1, roughness: 1, roughnessMap: streaks, bumpMap: streaks, bumpScale: 0.15, anisotropy: 0.4 });
  const knurlBlack = kit.mat(0x1c1c1f, 0.6, 0.45, { bumpMap: knurlTexture(96), bumpScale: 1.1 });
  const stripes = stripeTexture(60); stripes.repeat.set(1, 1);
  const cwRingMat = kit.mat(0xffffff, 0.3, 0.5, { map: stripes, bumpMap: knurlTexture(60), bumpScale: 1 });
  const threadMat = kit.mat(0xd4d6d9, 1, 0.3, { bumpMap: knurlTexture(40), bumpScale: 0.6 });
  threadMat.bumpMap.repeat.set(1, 1); threadMat.bumpMap.rotation = Math.PI / 2;
  const drumMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, map: forceScaleTexture() });

  // ---- fixed base: the bearing housing (69-71) on the escutcheon ------------------------------------
  // Fig. 11 and the photos (V-bX 4:10, V-dF 2:50): the outer ring stands low over a WIDE black
  // bearing housing, about the inner ring's diameter, that rises from the plate almost to the ring's
  // foot (no thin post shows). The housing rides up 5 mm in multi out of a fixed skirt on the plate,
  // which is tall enough that no gap opens. Radii and the skirt's height are estimates.
  const base = new THREE.Group(); base.position.set(pivot.x, 0, pivot.z); all.add(base);
  const post = part('bearingPost', base, { name: 'Arm bearing housing and shaft (rises 5 mm in multi)', no: '69-71' });
  const ringFoot = Y_PIVOT - G.outer.r1; // where the outer ring's foot meets the housing
  const HR = 0.0158, skirtTop = ESC.h + 0.0062, houseTop = ringFoot - 0.0016;
  const collar = part('bearingPost', base);
  add(collar, lathe([[HR + 0.0016, ESC.h], [HR + 0.0016, ESC.h + 0.0008], [HR + 0.0010, ESC.h + 0.0014], [HR + 0.0010, skirtTop - 0.0005], [HR + 0.0006, skirtTop], [HR - 0.0004, skirtTop]], 64), satinBlack);
  add(post, lathe([[HR, ESC.h + 0.0004], [HR, houseTop - 0.0012], [HR - 0.0005, houseTop - 0.0003], [HR - 0.0014, houseTop], [0.0060, houseTop], [0.0055, houseTop + 0.0004], [0.0055, ringFoot + 0.0006], [0, ringFoot + 0.0006]], 64), satinBlack);
  // a bright seam where the housing's top cap sits on it
  add(post, lathe([[HR + 0.00012, houseTop - 0.0040], [HR + 0.00012, houseTop - 0.0034]], 64), M.aluBright);
  // The grooved support shaft below the plate is drawn with its height detent in working.js.
  // M-DE p.7 Fig.12 / p.17: 218 827 is compression SPRING 78 around sleeve 69. The Q English
  // list's "compression ring" must not turn it into a solid ring. Coil dimensions remain estimates.
  const cr = part('compressionRing', base, { name: 'Compression spring around the tonearm bearing sleeve (dimensions estimated)', no: '78 [M-DE] (218 827)' });
  const springBottom = ESC.h + 0.004, springLength = ringFoot - springBottom;
  const bearingSpring = add(cr, helixGeo(1, 0.0051, 8, 0.00035), kit.mats.steel(), 0, springBottom, 0);
  bearingSpring.scale.y = springLength;

  // Arm chain (mode-height.js): two ears under the outer gimbal assembly 60, fixed in yaw, rest on
  // the ramps of mode lever 70; their contact sets the whole arm's height. Rebuild guide: forcing
  // the mode lever "will break the plastic ears off the bottom of the gimbal ring". A short sleeve
  // (the ring's stud) carries them up into the housing. Every dimension here is an estimate.
  const ears = part('gimbalEars', base, { name: 'Ears under the outer gimbal ring, resting on mode lever 70 (shape estimated)', no: '60 (218 518)' });
  const earMat = kit.mat(0x2a2a2d, 0.05, 0.55), ER = MODE_RAMP, earTop = EAR_TIP_SINGLE_Y + ER.tipR + 0.0010;
  add(ears, lathe([[0.0056, earTop - 0.0006], [0.0064, earTop - 0.0006], [0.0064, houseTop], [0.0056, houseTop], [0.0056, earTop - 0.0006]], 32), earMat);
  for (const a of earAngles()) {
    const e = new THREE.Group(); e.rotation.y = -a; ears.add(e);
    const r0 = 0.0060, r1 = ER.earR + ER.earW / 2, yc = EAR_TIP_SINGLE_Y + ER.tipR;
    kit.name(`gimbalEarTab${a === ER.earAngle ? 1 : 2}`, add(e, new THREE.BoxGeometry(r1 - r0, earTop - yc, 2 * ER.tipR), earMat, (r0 + r1) / 2, (yc + earTop) / 2, 0));
    const tipGeo = new THREE.CylinderGeometry(ER.tipR, ER.tipR, ER.earW, 24); tipGeo.rotateZ(Math.PI / 2);
    kit.name(`gimbalEarTip${a === ER.earAngle ? 1 : 2}`, add(e, tipGeo, earMat, ER.earR, yc, 0));
  }
  kit.name('gimbalEars', ears);

  // M-DE p.7 Fig.11 and p.8: outer ring 60 has an installed alignment; inner ring 54 yaws in
  // its top/bottom bearings. Only their shared height changes in multi. Rest alignment is estimated.
  const yaw = new THREE.Group(); yaw.position.set(pivot.x, Y_PIVOT, pivot.z); all.add(yaw);
  // the tube's own direction off the pivot-to-stylus line: the rings stand square to the tube
  const socketAt = { x: L - 0.04 * Math.cos(off), z: -0.04 * Math.sin(off) };
  const ta = Math.atan2(socketAt.z, socketAt.x), tubeEnd = Math.hypot(socketAt.x, socketAt.z) - 0.002;
  const gim = new THREE.Group(); gim.rotation.y = -ta; yaw.add(gim);
  const fixedGimbal = new THREE.Group(); fixedGimbal.position.set(pivot.x, Y_PIVOT, pivot.z);
  fixedGimbal.rotation.y = -(angleFor(REST) + ta); all.add(fixedGimbal);
  const outer = part('gimbalOuter', fixedGimbal, { name: 'Gimbal outer ring ("Ring")', no: '60' });
  add(outer, ringGeo(G.outer.r0, G.outer.r1, G.outer.w), satinBlack);
  // the bright turned edge round its front face
  add(outer, lathe([[G.outer.r1 - 0.0011, 0], [G.outer.r1 - 0.0002, 0], [G.outer.r1 - 0.0002, 0.00025], [G.outer.r1 - 0.0011, 0.00025]], 96), M.aluBright, G.outer.w / 2 - 0.0001, 0, 0).rotation.z = -Math.PI / 2;
  // its foot on the post
  add(outer, new RoundedBoxGeometry(0.0085, 0.0046, 0.0085, 2, 0.0012), satinBlack, 0, -G.outer.r1 + 0.0012, 0);
  const inner = part('gimbalInner', gim, { name: 'Gimbal inner bearing ring ("Lagerring")', no: '54' });
  add(inner, ringGeo(G.inner.r0, G.inner.r1, G.inner.w), kit.mat(0x1e1e21, 0.45, 0.36));
  // the four hardened points: top and bottom between the rings (vertical axis), left and right
  // between the inner ring and the bearing body (horizontal axis); bright screw heads show at three
  const pts = part('bearingPoints', gim, { name: 'Bearing points, hardened steel in ball races (4)', no: '53 / 56 / 58 / 77' });
  // The top adjusting screw 58 and its locknut 59 are drawn below on the fixed outer ring.
  add(pts, new THREE.CylinderGeometry(0.0017, 0.0017, 0.0024, 16), M.chrome, 0, -G.inner.r1 - 0.0004, 0);
  acrossZ(add(pts, new THREE.CylinderGeometry(0.0017, 0.0017, 0.0026, 16), M.chrome, 0, 0, G.inner.r1 + 0.0004));
  acrossZ(add(pts, new THREE.CylinderGeometry(0.0017, 0.0017, 0.0026, 16), M.chrome, 0, 0, -G.inner.r1 - 0.0004));
  // M-DE p.7 Fig.11 / p.17: top screw 58 and nut 59 stay on the outer ring; left screw 53
  // and nut 61 travel with inner ring 54. Keep stable model keys, but use the plain-1229 identities.
  const rodGeo = new THREE.CylinderGeometry(0.0009, 0.0009, 0.0032, 12), slotGeo = new THREE.BoxGeometry(0.0003, 0.0004, 0.0020);
  const nutGeo = new THREE.CylinderGeometry(0.0021, 0.0021, 0.0012, 6), nutMat = kit.mat(0xc9ccd1, 0.9, 0.3);
  const r59 = part('adjustRod59', fixedGimbal, { name: 'Threaded rod, adjusting the vertical-axis bearing point', no: '58 [M-DE] (216 830)' });
  add(r59, rodGeo, threadMat, 0, G.outer.r1 + 0.0013 + 0.0016, 0); // (from the nut's top: its length inside the nut and ring not drawn)
  add(r59, slotGeo, satinBlack, 0, G.outer.r1 + 0.0013 + 0.0031, 0);
  const n60 = part('locknut60', fixedGimbal, { name: 'Locknut on the threaded rod 58', no: '59 [M-DE] (216 834)' });
  add(n60, nutGeo, nutMat, 0, G.outer.r1 + 0.0001 + 0.0006, 0);
  const r62 = part('adjustRod62', gim, { name: 'Threaded rod, the left bearing screw (horizontal-axis point)', no: '53 [M-DE] (221 486)' });
  // The side adjustment is recessed in the inner ring, inside the outer ring's bore.
  acrossZ(add(r62, rodGeo, threadMat, 0, 0, G.inner.r1 - 0.0016));
  acrossZ(add(r62, slotGeo, satinBlack, 0, 0, G.inner.r1 - 0.0001)).rotation.z = Math.PI / 2;
  const n61 = part('locknut61', gim, { name: 'Locknut on the threaded rod 53', no: '61 [M-DE] (216 831)' });
  acrossZ(add(n61, nutGeo, nutMat, 0, 0, G.inner.r1 - 0.0006));

  // ---- pitch: the bearing body and everything on it tips about the horizontal axis ---------------------
  const pitch = new THREE.Group(); yaw.add(pitch);
  const line = new THREE.Group(); line.rotation.y = -ta; pitch.add(line); // along the tube
  const tube = part('armTube', line, { name: 'Tonearm tube and bearing body', no: '73 (218 238)' });
  // the bearing body: a black drum across the arm, its points at each end in the inner ring
  acrossZ(add(tube, lathe([[0, G.body.z0], [G.body.r - 0.0008, G.body.z0], [G.body.r, G.body.z0 + 0.0008], [G.body.r, G.body.z1 - 0.0012], [G.body.r - 0.0016, G.body.z1], [0, G.body.z1]], 48), satinBlack));
  acrossZ(add(tube, new THREE.ConeGeometry(0.0022, G.inner.r0 - G.body.z1 + 0.0006, 16), M.chrome, 0, 0, (G.body.z1 + G.inner.r0) / 2));
  // the round tube, from the body to the head's socket
  alongX(add(tube, new THREE.CylinderGeometry(G.tubeR, G.tubeR, tubeEnd - G.body.r + 0.001, 32), tubeMat, (tubeEnd + G.body.r - 0.001) / 2, 0, 0));
  // the counterweight stud (75): bright, threaded, running back out of the body
  const stud = part('counterweightStud', line, { name: 'Counterweight threaded stud', no: '75' });
  alongX(add(stud, new THREE.CylinderGeometry(0.003, 0.003, 0.058, 24), threadMat, -0.034, 0, 0));
  // the counterweight (74): black, a knurled ring with white index lines at the front, a plain body,
  // its rear face dished; 32 mm across, 30 long (register), centred 48 mm behind the pivot
  const cw = part('counterweight', line, { name: 'Counterweight ("Gewicht"), elastically mounted', no: '74' });
  alongX(add(cw, lathe([[0.0032, -0.0150], [0.0150, -0.0150], [0.0160, -0.0140], [0.0160, 0.0076], [0.0163, 0.0078], [0.0032, 0.0078]], 64), satinBlack, -0.049, 0, 0));
  alongX(add(cw, new THREE.CylinderGeometry(0.0163, 0.0163, 0.0070, 64, 1, true), cwRingMat, -0.049 + 0.0113, 0, 0));
  alongX(add(cw, lathe([[0.0032, 0.0146], [0.0164, 0.0146], [0.0164, 0.0150], [0.0156, 0.0156], [0.0032, 0.0156]], 64), satinBlack, -0.049, 0, 0));
  alongX(add(cw, lathe([[0.0158, -0.0150], [0.0158, -0.0158], [0.0120, -0.0160], [0.0040, -0.0156], [0.0032, -0.0150]], 64), satinBlack, -0.049, 0, 0));

  // the tracking force spring housing (77/78): a drum with its 0-3 g scale, on the body's right end,
  // read against a pointer on the inner ring; it turns about the bearing axis
  const forceDial = new THREE.Group(); forceDial.position.set(0, 0, (G.drum.z0 + G.drum.z1) / 2); line.add(forceDial);
  const fd = part('forceDial', forceDial, { name: 'Tracking force spring housing, 0-3 g', no: '77 / 78' });
  const drumGeo = new THREE.CylinderGeometry(G.drum.r, G.drum.r, Math.abs(G.drum.z1 - G.drum.z0), 96, 1, true); drumGeo.rotateX(Math.PI / 2);
  add(fd, drumGeo, drumMat);
  const rimGeo = lathe([[G.drum.r - 0.0006, 0], [G.drum.r + 0.0004, 0], [G.drum.r + 0.0004, 0.0013], [0.003, 0.0016], [0, 0.0016]], 64); rimGeo.rotateX(-Math.PI / 2);
  add(fd, rimGeo, knurlBlack, 0, 0, -(Math.abs(G.drum.z1 - G.drum.z0) / 2));
  // its pointer: a red tab on the bearing body's edge, reaching over the scale
  add(tube, new THREE.BoxGeometry(0.0011, 0.0011, 0.0026), mats.red, 0, G.drum.r + 0.0003, G.drum.z0 - 0.0008).castShadow = false;

  // ---- the removable head (41), at the offset angle, with its TK 14 holder and cartridge -------------
  const head = new THREE.Group(); head.position.set(L, 0, 0); head.rotation.y = -off; pitch.add(head);
  const grab = [];
  const hd = part('armHead', head, { name: 'Tonearm head, removable', no: '41 (219 065)' });
  // The head in profile (V-bX 3:35, V-dF 3:22/3:26): a wedge, its flat top about 6 mm above the tube's axis,
  // thin at the finger lift and deepening toward the rear, where the socket the tube runs into ends it with
  // its top flush with the head's. Under the top the head is open between two wedge-shaped cheeks: the TK 14
  // holder slides up into it and the cartridge hangs below. Heights are estimates from the photos.
  const HT = 0.0060, HU = 0.0004, HB = -0.0068; // head top; the top plate's underside; the cheeks' foot at the rear
  // the socket the tube runs into, square to the tube, with the locking lever standing on it
  const sock = new THREE.Group(); sock.position.set(-0.0385, 0, 0); sock.rotation.y = off - ta; hd.add(sock);
  grab.push(add(sock, new RoundedBoxGeometry(0.015, HT - HB, 0.0122, 3, 0.002), plasticBlack, 0.0005, (HT + HB) / 2, 0));
  add(sock, new RoundedBoxGeometry(0.0022, 0.0052, 0.0046, 2, 0.0006), plasticBlack, 0.002, HT + 0.0020, -0.0036);
  // the top: a flat plate 52 x 17.6 mm, ribbed across from the socket to the finger lift
  const slab = new THREE.Shape(), sx0 = -0.031, sx1 = 0.021, sw = 0.0088;
  slab.moveTo(sx0, -sw); slab.lineTo(sx1 - 0.003, -sw); slab.quadraticCurveTo(sx1, -sw, sx1, -sw + 0.003); slab.lineTo(sx1, sw - 0.003);
  slab.quadraticCurveTo(sx1, sw, sx1 - 0.003, sw); slab.lineTo(sx0, sw); slab.closePath();
  const slabGeo = new THREE.ExtrudeGeometry(slab, { depth: HT - HU - 0.0008, bevelEnabled: true, bevelSize: 0.0005, bevelThickness: 0.0004, bevelSegments: 2, curveSegments: 6 });
  slabGeo.rotateX(-Math.PI / 2); slabGeo.translate(0, HU + 0.0004, 0);
  grab.push(add(hd, slabGeo, plasticBlack));
  // the cheeks: wedges under the top's edges, deepening from nothing at the front to the socket's foot
  const cheekT = 0.0012;
  for (const s of [-1, 1]) {
    const w = new THREE.Shape(); w.moveTo(sx1 - 0.002, HU + 0.0006); w.lineTo(sx0 - 0.0005, HU + 0.0006); w.lineTo(sx0 - 0.0005, HB + 0.0004); w.closePath();
    if (s < 0) {
      // Clearance for the blade throughout its rearward sweep.
      const slot = new THREE.Path();
      slot.moveTo(-.009, -.00085); slot.lineTo(.0052, -.00085);
      slot.lineTo(.0052, .00033); slot.lineTo(-.009, .00033); slot.closePath();
      w.holes.push(slot);
    }
    const g = new THREE.ExtrudeGeometry(w, { depth: cheekT, bevelEnabled: false }); g.translate(0, 0, s > 0 ? sw - cheekT : -sw);
    grab.push(add(hd, g, plasticBlack));
  }
  // the grip: a raised waffle grid of square-ish cells over the whole top, 12 along by 6 across
  // (the hifi-wiki close-up; the plain 1229's head, not the Q's 8 holes)
  const fl = part('fingerLift', hd, { name: 'Headshell moulding, waffle grid', no: '41' });
  const ribGeos = [], gx0 = sx0 + 0.0028, gx1 = sx1 - 0.0024, gz = sw - 0.0010, NX = 12, NZ = 6, rw = 0.0007, rh = 0.0007, ry = HT + rh / 2 - 0.0001;
  for (let i = 0; i <= NX; i++) { const g = new THREE.BoxGeometry(rw, rh, 2 * gz + rw); g.translate(gx0 + ((gx1 - gx0) * i) / NX, ry, 0); ribGeos.push(g); }
  for (let j = 0; j <= NZ; j++) { const g = new THREE.BoxGeometry(gx1 - gx0 + rw, rh, rw); g.translate((gx0 + gx1) / 2, ry, -gz + (2 * gz * j) / NZ); ribGeos.push(g); }
  const ribGeo = mergeGeometries(ribGeos); for (const g of ribGeos) g.dispose();
  grab.push(add(fl, ribGeo, plasticBlack));
  // its front lip turned down a little
  grab.push(add(fl, new RoundedBoxGeometry(0.0024, 0.0062, 2 * sw - 0.0004, 2, 0.0009), plasticBlack, sx1 - 0.0008, HT - 0.0031 - 0.0004, 0));
  // the cartridge (D20: a generic dark body, no brand copied), its stylus where the engine says: a body
  // about 15 mm tall from its stylus housing to its top (V-bX 3:35), which the holder carries up inside the head
  const cTop = -0.0030, cBot = -0.0184, cW = 0.0134;
  // the TK 14 cartridge holder: a black frame under the head's top, between the cheeks, clipped to the cartridge's sides
  const tk = part('tk14', hd, { name: 'Cartridge holder TK 14', no: '215 430' });
  const inW = 2 * (sw - cheekT); // between the cheeks
  // Leave room for the eye and travelling blade above the carrier. The rear
  // land preserves its seated height at the socket end.
  const trayTop = -.00145;
  add(tk, new RoundedBoxGeometry(.025, trayTop - cTop, inW - .0002, 2, .0003), plasticBlack, -.0085, (trayTop + cTop)/2, 0);
  add(tk, new RoundedBoxGeometry(.009, HU - .0001 - trayTop, inW - .0002, 2, .0002), plasticBlack, -.0165, (HU - .0001 + trayTop)/2, 0);
  add(hd, new THREE.CylinderGeometry(.00195, .00195, .0019, 28), plasticBlack, .003, -.00035, 0);
  for (const s of [-1, 1]) add(tk, new RoundedBoxGeometry(0.011, 0.0040, (inW - cW) / 2 - 0.0002, 2, 0.0002), plasticBlack, -0.0095, cTop - 0.0018, s * (inW + cW) / 4);
  // Item 42 belongs to the head. Its formed tab projects outboard.
  const latchPart = part('headshellLatch', hd, { name: 'Cartridge holder locking lever', no: '42 (201 132)' });
  const latch = registerLatch(add(latchPart, lockingHandleGeometry(), M.chrome, .003, -.0007, 0));
  const ct = part('cartridge', hd, { name: 'Cartridge and stylus (generic)', no: '—' });
  const bodyBot = cBot + 0.0020;
  grab.push(add(ct, new RoundedBoxGeometry(0.0185, cTop - bodyBot, cW, 3, 0.001), mats.cart, -0.0078, (cTop + bodyBot) / 2, 0));
  add(ct, new RoundedBoxGeometry(0.0110, 0.0026, 0.0098, 2, 0.0008), mats.cartNose, -0.0024, cBot + 0.0013, 0);
  const pinGeo = new THREE.CylinderGeometry(0.0005, 0.0005, 0.003, 8);
  [[0.003, 0.0035, 0xc8352b], [0.003, -0.0035, 0x2f9a4a], [0.0012, 0.0035, 0xe8e8e8], [0.0012, -0.0035, 0x3460c8]].forEach(([y, z, c]) => alongX(add(ct, pinGeo, kit.mat(c, 0.6, 0.4), -0.0183, cTop - 0.0050 + y - 0.0015, z)));
  // the contact plate (42 [M-Q] 231 992): a black block across the head's rear, between the socket and the TK 14
  // holder, carrying four sprung contacts that press on the cartridge's pins; the arm's leads run from it up the
  // tube (Fig. 28 box 41-47). Size and the contacts' shape are estimates.
  const cp = part('contactPlate', hd, { name: 'Contact plate with the four pin contacts (head)', no: '42 [M-Q] (231 992)' });
  add(cp, new RoundedBoxGeometry(0.0022, 0.0086, 2 * (sw - cheekT) - 0.0006, 2, 0.0004), plasticBlack, -0.0273, HU - 0.0001 - 0.0043, 0);
  const cGeo = new THREE.BoxGeometry(0.0062, 0.0004, 0.0009); cGeo.translate(0.0031, 0, 0);
  const brass = kit.mat(0xd2a64e, 0.95, 0.3);
  [[0.003, 0.0035], [0.003, -0.0035], [0.0012, 0.0035], [0.0012, -0.0035]].forEach(([y, z]) => add(cp, cGeo, brass, -0.0262, cTop - 0.0050 + y - 0.0015 + 0.0007, z));
  const cant = add(ct, new THREE.CylinderGeometry(0.00034, 0.00042, 0.0037, 8), M.aluBright, -0.00175, -0.01865, 0);
  cant.rotation.z = Math.PI / 2 - Math.atan2(0.0013, 0.0035);
  const tip = add(ct, new THREE.ConeGeometry(0.00042, 0.001, 10), M.chrome, 0, -DH + 0.0005, 0); tip.rotation.x = Math.PI;

  // ---- arm rest (66): a post under the head, the arm's support piece on it, and the bar --------------
  // M-DE p.9 Fig.15: the rest ("Tonarmstuetze") is a post with a sprung clip; the arm's support piece
  // ("Tonarmauflagestueck") rests on its top. The hifiwiki photo (reference/images/tonearm) shows a
  // chunky black post under the head's rear, with the black bar to the chrome stud near its top.
  // The register's cradle position (+181, +81) falls under the head's socket: the post stands there.
  // Estimates: post and pad sizes, the clip's shape, the bar's height (photo). The stylus height lying
  // on the rest is REST_H (an estimate shared with the mechanism and the cue chain: arm--cue.md C4).
  const beta = ta; // the tube's own angle off the pivot-to-stylus line
  const restAng = angleFor(REST) + beta;
  const AUF = { along: 0.0070, across: 0.0090, h: 0.0025 }; // the support piece under the socket
  const POST = { along: 0.0085, across: 0.0135, r: 0.0010 };
  const auf = part('armSupportPiece', sock, { name: 'Arm support piece ("Tonarmauflagestueck"), under the head (shape estimated)', no: '41' });
  const aufMesh = kit.name('armSupportPiece', add(auf, new RoundedBoxGeometry(AUF.along, AUF.h, AUF.across, 2, 0.0005), plasticBlack, 0.0005, HB - AUF.h / 2 + 0.0002, 0));
  // where the piece's underside is with the arm lying on its rest (pose it there once, then restore)
  const restPhi = phiFor(Y_REC + REST_H), was = { y: yaw.rotation.y, z: pitch.rotation.z };
  yaw.rotation.y = -angleFor(REST); pitch.rotation.z = restPhi; all.updateMatrixWorld(true);
  const aufCentre = all.worldToLocal(new THREE.Vector3(0.0005, HB - AUF.h + 0.0002, 0).applyMatrix4(sock.matrixWorld));
  // the piece is tipped a little at rest: its lowest point, not its centre, lies on the post
  const aufGeo = aufMesh.geometry; aufGeo.computeBoundingBox();
  let aufLow = Infinity; const corner = new THREE.Vector3(), toAll = new THREE.Matrix4().copy(all.matrixWorld).invert().multiply(aufMesh.matrixWorld);
  for (const x of [aufGeo.boundingBox.min.x, aufGeo.boundingBox.max.x]) for (const z of [aufGeo.boundingBox.min.z, aufGeo.boundingBox.max.z]) aufLow = Math.min(aufLow, corner.set(x, aufGeo.boundingBox.min.y, z).applyMatrix4(toAll).y);
  yaw.rotation.y = was.y; pitch.rotation.z = was.z; all.updateMatrixWorld(true);
  const restPos = { x: aufCentre.x, z: aufCentre.z }, postTop = aufLow;
  const restG = new THREE.Group(); restG.position.set(restPos.x, 0, restPos.z); restG.rotation.y = -restAng; all.add(restG);
  const rest = part('armRest', restG, { name: 'Arm rest post ("Tonarmstuetze") with sprung clip (shape estimated)', no: '66 (227 000)' });
  kit.name('armRestPost', add(rest, new RoundedBoxGeometry(POST.along, postTop, POST.across, 2, POST.r), plasticBlack, 0, postTop / 2, 0));
  // Fig.15's sprung clip: a bright wire bent into a V, in a slot on the post's platter-side face
  const clipFace = POST.across / 2 + 0.0002, clipPts = [[0.0026, postTop - 0.0012], [0.0, postTop - 0.0110], [-0.0026, postTop - 0.0012]];
  add(rest, new RoundedBoxGeometry(0.0062, 0.0115, 0.0006, 1, 0.0002), kit.mat(0x050506, 0.1, 0.8), 0, postTop - 0.0066, clipFace - 0.0004);
  add(rest, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(clipPts.map(([x, y]) => new THREE.Vector3(x, y, clipFace))), 16, 0.00035, 6, false), M.chrome);
  // the bar toward the platter, on a chrome pin, near the post's top (photo)
  // The chrome stud stays at its Fig.30 position (just behind the "Dual" badge); the bar runs straight
  // from it to the post's platter-side face, near the post's top (photo). Bar line and height: estimates.
  const barTop = postTop - 0.0025, end = { x: restPos.x - POST.across / 2 + 0.0008, z: restPos.z - 0.0020 };
  const barLen = Math.hypot(end.x - REST_BAR.x0, end.z - REST_BAR.z) + 0.0025;
  const restBar = part('armRest', all), barG = new THREE.Group(); restBar.add(barG);
  aim(barG, REST_BAR.x0, REST_BAR.z, end.x, end.z);
  add(barG, new RoundedBoxGeometry(barLen, 0.0036, 0.0052, 2, 0.0008), plasticBlack, barLen / 2 - 0.0025, barTop - 0.0018, 0);
  // its chrome post: the stud (52 [M-Q] 217 504, Fig. 28 with its nut 53 under the plate)
  const stud52 = part('restStud', all, { name: 'Stud carrying the rest\'s bar (chrome post)', no: '52 [M-Q] (217 504)' });
  add(stud52, lathe([[0.0016, 0], [0.0016, barTop - 0.0034], [0, barTop - 0.0034]], 20), M.chrome, REST_BAR.x0, 0, REST_BAR.z);
  add(stud52, lathe([[0.0028, 0], [0.0028, 0.0012], [0.0018, 0.0018], [0, 0.0018]], 20), M.chrome, REST_BAR.x0, 0, REST_BAR.z);

  // Plain1229 Fig11/12: the small198 tip lifts the underside of bearing body73,
  // beside the gimbal. The black ledge profile is estimated from MAARC rb034;
  // it is integral with73, not a separate felt platform under the long arm tube.
  const contact=part('liftContactBody',pitch,{name:'Bearing-body lift contact ledge (profile estimated)',no:'73 (218 238)'});
  const ledge=plateGeo(CUE.ledge,.0013);
  // plateGeo bevel extends .3mm below its nominal base; place its actual underside.
  add(contact,ledge,satinBlack,0,CUE.bodyY+.00065+.0003,0);
  const mid={...liftAxis}, {down:barDown,up:barUp}=cueRange();
  // Fig12 and MAARC pp27–28:206 is one rigid stepped piston/stem. Its
  // long lower piston carries the damping surface and the upper spring seat.
  const plungerLength=CUE.plungerLength;
  const liftBar=part('liftPlunger',all,{name:'Lifting plunger: damping piston and narrow upper stem',no:'206 (220 902)'});
  liftBar.position.set(mid.x,barDown,mid.z);
  kit.name('liftPiston206',add(liftBar,new THREE.CylinderGeometry(CUE.pistonR,CUE.pistonR,CUE.pistonLength,32),M.chrome,0,-plungerLength+CUE.pistonLength/2,0));
  const stemLength=plungerLength-CUE.pistonLength-CUE.tipH;
  kit.name('liftStem206',add(liftBar,new THREE.CylinderGeometry(CUE.stemR,CUE.stemR,stemLength,24),M.chrome,0,-CUE.tipH-stemLength/2,0));
  const liftTip=part('liftTip',liftBar,{name:'Lift contact cap (distinct from horizontal-drive cap229)',no:'198 (216 844)'});
  add(liftTip,new THREE.CylinderGeometry(CUE.tipR,CUE.tipR,CUE.tipH,32),M.rubber,0,-CUE.tipH/2,0);
  const washer=part('liftWasher',liftBar,{name:'Retaining washer on lift plunger',no:'199 (210 143)'});
  add(washer,lathe([[.00095,-CUE.tipH-.00025],[.0017,-CUE.tipH-.00025],[.0017,-CUE.tipH-.00005],[.00095,-CUE.tipH-.00005]],24),M.chrome);
  let actuator=0;
  const liftFootY=(k,mode='single')=>platformY(k,mode)-plungerLength;

  function setPose(ang, phi, cue) {
    yaw.rotation.y = -ang;
    pitch.rotation.z = phi;
    actuator = cue; liftBar.position.y = platformY(cue, raise);
  }
  // the drum turns 0.8 of a turn over the scale (textures.js forceU puts the figures to match)
  function setForce(g) { forceDial.rotation.z = -(g / SPEC.trackingForce.max) * TAU * 0.8; }
  function setRaise(m) {
    // the stylus stays at the height it was posed at (setPose's phi was for the old raise): re-pitch for the new one
    const yStylus = Y_PIVOT + raise + hyp * Math.sin(pitch.rotation.z - delta);
    raise = m; post.position.y = m; ears.position.y = m; yaw.position.y = Y_PIVOT + m; fixedGimbal.position.y = Y_PIVOT + m;
    bearingSpring.scale.y = springLength + m;
    pitch.rotation.z = phiFor(yStylus);
    liftBar.position.y = platformY(actuator, raise);
  }
  function barLiftFor(m) { return cueRange(m).down - barDown; }
  function dispose() { all.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  return { group: all, fixedGimbal, supportedStylusY, liftFootY, liftPlunger:liftBar, yaw, pitch, head, latch, grab, L, dist, off, pivot, stylusXZ, angleFor, radiusForAngle, phiFor, phiUp, setPose, setForce, setRaise, forceDial, liftPos: mid, liftRange: { down: barDown, up: barUp }, restPos, barLiftFor, gim, dispose };
}

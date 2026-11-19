// Drive: the speed selector's small working parts on the speed lever's shaft (Fig. 29 items 95-108, 123-125; Fig. 7;
// the rebuild guide's "Servicing the speed control mechanism"). Owned by the drive builder (see OWNERS.md).
//
// Under the bracket 104's lower block: the groove detent 106 turning with the lever, the ball 125 and its spring 124
// in the block's hole (the click-stops at 33 / 45 / 78), the washer 107 and the nut 108. On the shaft between the
// block and the cam 102: the compression spring 103. Above the cam, under the bracket's flange: the regulating
// plate 100 with the adjusting screw 95, adjusting wheel 96 and the washers 97 / 99 on its lug, the washer 98 and
// the speed regulator detent 101 (the alignment disc), whose fine-adjustment transmission is not yet reconstructed.
// Sizes and places: place.js DETENT, SPRING103, REGULATOR (most of them estimates, see there).
import * as THREE from 'three';
import { D, TAU } from '../../layout.js';
import { lathe, gearGeo, helixGeo, sheetGeo } from '../shared/geometry.js';
import { SPEED_AXIS as S0, SPEED_BRACKET as SB, SEG, DETENT as DT, SPRING103, REGULATOR as RG } from './place.js';
import { notchAngle, ballLift } from './kinematics.js';

// The underside of the bracket 104's flange (speed.js draws it SB.t thick under the plate, bevels included).
export const FLANGE_UNDER = -0.0015 - SB.t;

// A flat piece cut from sheet: outline [x, z] in the x-z plane, holes as outlines too, thickness t centred on y = 0.
// No bevel, so its edges are exactly where the outline says (the ball rests on a notch's edges).
export function slab(outline, t, holes = []) {
  const v = (pts, cw) => { const o = pts.map(([x, z]) => new THREE.Vector2(x, -z)); return THREE.ShapeUtils.isClockWise(o) === cw ? o : o.reverse(); };
  const s = new THREE.Shape(v(outline, false));
  for (const h of holes) s.holes.push(new THREE.Path(v(h, true)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 8 });
  g.rotateX(-Math.PI / 2); g.translate(0, -t / 2, 0);
  return g;
}
// A circle as an outline (for slab holes), n points.
export const circle = (x, z, r, n = 24) => { const o = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; o.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); } return o; };
// A washer: a flat ring from y0 to y1, its bore r0, outside r1.
export const ringGeo = (r0, r1, y0, y1, n = 24) => lathe([[r0, y0], [r1, y0], [r1, y1], [r0, y1], [r0, y0]], n);
// A coil spring standing on y = 0, `len` tall between the outsides of its end coils.
export function coilGeo(len, r, turns, wire) { const g = helixGeo(len - 2 * wire, r, turns, wire); g.translate(0, wire, 0); return g; }

// The groove detent 106: a round plate (rIn) with a lobe on the ball's side whose edge has the three notches.
function detentOutline() {
  const P = DT.plate, w2 = P.notchW / 2, pts = [], lobe = P.lobe * D, mid = DT.a * D;
  const notches = ['78', '45', '33'].map(notchAngle).sort((a, b) => a - b); // local angles, increasing
  const a0 = mid - lobe, a1 = mid + lobe, rim = (a) => pts.push([Math.cos(a) * P.r, Math.sin(a) * P.r]);
  // the round part, from the lobe's far end round to its near end
  for (let i = 0; i <= 40; i++) { const a = a1 + ((TAU - 2 * lobe) * i) / 40; pts.push([Math.cos(a) * P.rIn, Math.sin(a) * P.rIn]); }
  // the lobe: its rim from a0 to a1, cut by each notch (straight sides w2 off the notch's middle line)
  let a = a0;
  for (const n of notches) {
    const da = Math.asin(w2 / P.r);
    for (let t = a; t < n - da; t += 2 * D) rim(t);
    rim(n - da);
    const ux = Math.cos(n), uz = Math.sin(n), nx = -uz, nz = ux;
    pts.push([ux * P.notchIn - nx * w2, uz * P.notchIn - nz * w2], [ux * P.notchIn + nx * w2, uz * P.notchIn + nz * w2]);
    rim(n + da); a = n + da;
  }
  for (let t = a; t < a1; t += 2 * D) rim(t);
  rim(a1);
  return pts;
}

// An arc-shaped slot round the origin: radius r, half-width w, from angle a0 to a1 (the 106 pin's way through the block).
function arcSlot(r, w, a0, a1, n = 16) {
  const o = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; o.push([Math.cos(a) * (r + w), Math.sin(a) * (r + w)]); }
  for (let i = 0; i <= 6; i++) { const t = (i / 6) * Math.PI, c = [Math.cos(a1) * r, Math.sin(a1) * r]; o.push([c[0] + Math.cos(a1) * w * Math.cos(t) - Math.sin(a1) * w * Math.sin(t), c[1] + Math.sin(a1) * w * Math.cos(t) + Math.cos(a1) * w * Math.sin(t)]); }
  for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; o.push([Math.cos(a) * (r - w), Math.sin(a) * (r - w)]); }
  for (let i = 0; i <= 6; i++) { const t = Math.PI + (i / 6) * Math.PI, c = [Math.cos(a0) * r, Math.sin(a0) * r]; o.push([c[0] + Math.cos(a0) * w * Math.cos(t) - Math.sin(a0) * w * Math.sin(t), c[1] + Math.sin(a0) * w * Math.cos(t) + Math.cos(a0) * w * Math.sin(t)]); }
  return o;
}
// The holes the speed bracket's lower block needs, in the shaft's frame (x, z): the ball's hole, and the arc slot
// the detent's pin swings in as the lever turns (+-31 deg, and a little more). speed.js cuts them.
// extra: how much larger to cut them (an extrusion's bevel takes that much off a hole).
export function blockHoles(extra = 0) {
  const b = [Math.cos(DT.a * D) * DT.r, Math.sin(DT.a * D) * DT.r], sw = 33 * D;
  const pa = DT.pin.a * D; // the pin's world angle at 45 (a local angle phi is at world phi - turn; turn -31..+31 deg)
  return [circle(b[0], b[1], DT.hole.r + extra, 32), arcSlot(DT.pin.r, DT.pin.rod + 0.0002 + extra, pa - sw, pa + sw)];
}

export function buildSelector(kit, root) {
  const { add, part, mat, mats } = kit;
  const steel = mats.steel(), dark = mats.darkSteel(), springMat = mat(0x9ea3a8, 0.9, 0.35);
  steel.side = THREE.DoubleSide; // the Fig. 2 section (D5) cuts through the shaft's axis
  const P = DT.plate;

  // ---- the groove detent 106: plate, hub and pin, on the flats of the shaft's lower end -------------------------
  const detent = part('grooveDetent', root, { name: 'Groove detent complete (speed click-stops)', no: '106' });
  detent.position.set(S0.x, 0, S0.z);
  const plateY = P.top - P.t / 2;
  add(detent, slab(detentOutline(), P.t, [circle(0, 0, 0.00205, 20)]), steel, 0, plateY, 0);
  // its hub down to the washer (the Fig. 2 section shows it as a collar), bored for the shaft
  add(detent, ringGeo(0.00205, SB.spacer, SB.washer[1], P.top - P.t, 20), steel);
  // the pin up into the cam's foot, through the block's arc slot (rebuild guide step 15)
  const pinLen = DT.pin.top - P.top, pa = DT.pin.a * D;
  add(detent, new THREE.CylinderGeometry(DT.pin.rod, DT.pin.rod, pinLen, 10), steel, Math.cos(pa) * DT.pin.r, P.top + pinLen / 2, Math.sin(pa) * DT.pin.r);

  // ---- the ball 125 and its spring 124, in the hole in the bottom of the block -----------------------------------
  const bx = S0.x + Math.cos(DT.a * D) * DT.r, bz = S0.z + Math.sin(DT.a * D) * DT.r;
  const ballPart = part('detentBall', root, { name: 'Ball 4 mm dia. (speed detent)', no: '125' });
  const ball = add(ballPart, new THREE.SphereGeometry(DT.ball, 16, 12), mat(0xd4d7db, 1, 0.18), bx, 0, bz);
  const SP = DT.spring, len124 = DT.hole.top - (P.top + DT.ball * 2); // its longest: the ball down in a notch
  const s124 = part('detentSpring', root, { name: 'Compression spring (speed detent ball)', no: '124' });
  const coil124 = add(s124, coilGeo(len124 + 0.0006, SP.r, SP.turns, SP.wire), springMat, bx, 0, bz);
  coil124.rotation.x = Math.PI; // hangs from the hole's top: y = 0 at the top, scaled down to the ball

  // ---- under the detent: the washer 107 (cupped side down) and the nut 108 --------------------------------------
  const w107 = part('detentWasher', root, { name: 'Washer 4.2 / 10.0 / 1.5 (under the groove detent)', no: '107' });
  add(w107, lathe([[0.00215, SB.washer[1]], [SB.washerR - 0.0006, SB.washer[1]], [SB.washerR, SB.washer[1] - 0.0005], [SB.washerR, SB.washer[0]], [0.00215, SB.washer[0] + 0.0004], [0.00215, SB.washer[1]]], 32), steel, S0.x, 0, S0.z);
  const n108 = part('detentNut', root, { name: 'Hex nut M 3 (holds the groove detent)', no: '108' });
  add(n108, slab(circle(0, 0, 0.0038, 6), SB.nut[1] - SB.nut[0], [circle(0, 0, 0.00205, 20)]), steel, S0.x, (SB.nut[0] + SB.nut[1]) / 2, S0.z);

  // ---- the compression spring 103: between the block's top and the cam's hub -----------------------------------
  const s103 = part('camSpring', root, { name: 'Compression spring (presses the switching segment up)', no: '103' });
  const y103 = SEG.y[0], len103 = y103 - SB.low.top;
  const coil103=kit.name('segmentSpring103',add(s103, coilGeo(len103, SPRING103.r, SPRING103.turns, SPRING103.wire), springMat, S0.x, SB.low.top, S0.z));

  // ---- above the cam: the regulating plate 100, the washer 98, the speed regulator detent 101 ---------------------
  const R = RG, la = R.lug.a * D, lx = Math.cos(la) * R.lug.r, lz = Math.sin(la) * R.lug.r;
  const plate100 = part('regulatingPlate', root, { name: 'Regulating plate (tabs in the chassis, carries the adjusting screw)', no: '100' });
  plate100.position.set(S0.x, 0, S0.z);
  { // one pressed blank: round, with a lug out to the adjusting screw and two tabs bent up at right
    // angles into the slots (they end at the bracket's flange, through which they reach the chassis).
    // Each tab is cut from the rim on a straight bend line, with its midplane where the tab stood
    // before (radius r - tabT/2) and its top at the flange. Bend radius: estimate.
    const t = R.plate.y[1] - R.plate.y[0], mid = (R.plate.y[0] + R.plate.y[1]) / 2, rb = 0.0003, Rb = rb + t / 2;
    const ux = Math.cos(la), uz = Math.sin(la), nx = -uz, nz = ux, w = R.lug.w / 2, hw = Math.asin(w / R.plate.r);
    const tabs = R.plate.tabs.map((ta) => ta * D), tw = R.plate.tabW / 2, tabHalf = Math.asin(tw / R.plate.r) + 0.02;
    const d = R.plate.r - R.plate.tabT / 2 - Rb; // the bend line's distance from the shaft
    const o = [], flanges = [], tabTop = FLANGE_UNDER - 0.00002;
    const inTab = (a) => tabs.find((ta) => Math.abs(Math.atan2(Math.sin(a - ta), Math.cos(a - ta))) < tabHalf);
    let last = null;
    for (let i = 0; i <= 120; i++) {
      const a = la + hw + ((TAU - 2 * hw) * i) / 120, ta = inTab(a);
      if (ta === undefined) { o.push([Math.cos(a) * R.plate.r, Math.sin(a) * R.plate.r]); last = null; continue; }
      if (last === ta) continue; last = ta;
      const c = Math.cos(ta), sn = Math.sin(ta), p0 = [c * d + sn * tw, sn * d - c * tw], p1 = [c * d - sn * tw, sn * d + c * tw];
      o.push(p0, p1); // relief cut in to the bend line, along it, and out again
      flanges.push({ edge: [p0, p1], angle: Math.PI / 2, r: rb, len: tabTop - mid - Rb });
    }
    for (let i = 0; i <= 8; i++) { const q = -Math.PI / 2 + (i / 8) * Math.PI; o.push([lx + ux * w * Math.cos(q) + nx * w * Math.sin(q), lz + uz * w * Math.cos(q) + nz * w * Math.sin(q)]); }
    add(plate100, sheetGeo({ outline: o, t, holes: [[0, 0, 0.0021], [lx, lz, R.screw.r + 0.0001]], flanges }), steel, 0, mid, 0);
  }
  const w98 = part('regWasher', root, { name: 'Washer 4.2 / 8.1 (on the speed shaft)', no: '98' });
  add(w98, ringGeo(0.0021, R.washer.r, R.washer.y[0], R.washer.y[1], 24), steel, S0.x, 0, S0.z);
  const disc = part('regDetent', root, { name: 'Speed regulator detent (fine-adjustment datum; transmission unresolved)', no: '101' });
  disc.position.set(S0.x, 0, S0.z);
  { // notched at its edge on the wheel's side, its 1 mm hole opposite the wheel at pitch 0
    const o = [], nT = R.disc.teeth, ta = R.disc.toothA * D, half = ((nT - 1) / 2) * ta;
    for (let i = 0; i < 120; i++) {
      const a = la + Math.PI + (i / 120) * TAU, off = Math.atan2(Math.sin(a - la), Math.cos(a - la)); // off: from the wheel's direction
      const k = Math.round(off / ta), inTeeth = Math.abs(off) <= half + ta / 2 && Math.abs(off - k * ta) < ta * 0.22;
      o.push([Math.cos(a) * (R.disc.r - (inTeeth ? 0.0005 : 0)), Math.sin(a) * (R.disc.r - (inTeeth ? 0.0005 : 0))]);
    }
    const t = R.disc.y[1] - R.disc.y[0];
    add(disc, slab(o, t, [circle(0, 0, 0.0021, 20), circle(Math.cos(la) * R.disc.holeR, Math.sin(la) * R.disc.holeR, R.disc.holeD / 2, 12)]), mat(0xc9ccce, 0.9, 0.3), 0, (R.disc.y[0] + R.disc.y[1]) / 2, 0);
  }

  // ---- on the lug: the adjusting screw 95, the lock washer 97, the adjusting wheel 96, the lock washer 99 -----------
  const wx = S0.x + lx, wz = S0.z + lz;
  const screw = part('adjScrew', root, { name: 'Adjusting screw (speed alignment, turned with the adjuster from above)', no: '95' });
  add(screw, lathe([[0, R.screw.head[1]], [R.screw.headR - 0.0003, R.screw.head[1]], [R.screw.headR, R.screw.head[1] - 0.0003], [R.screw.headR, R.screw.head[0]], [R.screw.r, R.screw.head[0]], [R.screw.r, R.screw.end + 0.0002], [R.screw.r - 0.0002, R.screw.end], [0, R.screw.end]], 12), steel, wx, 0, wz);
  add(screw, new THREE.BoxGeometry(R.screw.headR * 2.1, 0.00035, 0.0005), dark, wx, R.screw.head[1] - 0.00012, wz); // its slot
  const w97 = part('adjLockWasher', root, { name: 'Lock washer, dished (adjusting wheel)', no: '97' });
  { // dished: its inner edge up against the lug, its outer edge down on the wheel
    const [y0, y1] = R.lockWasher.y, r0 = R.screw.r + 0.0001, r1 = R.lockWasher.r;
    add(w97, lathe([[r0, y1], [r1, y0 + 0.00015], [r1, y0], [r0, y1 - 0.00015], [r0, y1]], 16), steel, wx, 0, wz);
  }
  const wheel = part('adjWheel', root, { name: 'Adjusting wheel (alignment wheel, knurled)', no: '96' });
  add(wheel, gearGeo(R.wheel.r, R.wheel.teeth, R.wheel.y[1] - R.wheel.y[0], 0, R.screw.r + 0.00015), mat(0x2a2b2e, 0.3, 0.5), wx, (R.wheel.y[0] + R.wheel.y[1]) / 2, wz);
  const c99 = part('adjClip', root, { name: 'Lock washer 3.2 (on the adjusting screw)', no: '99' });
  { // an open C: a ring with a gap
    const o = [], r0 = R.screw.r + 0.0001, r1 = R.clip.r, g = 0.6;
    for (let i = 0; i <= 20; i++) { const a = g + ((TAU - 2 * g) * i) / 20; o.push([Math.cos(a) * r1, Math.sin(a) * r1]); }
    for (let i = 20; i >= 0; i--) { const a = g + ((TAU - 2 * g) * i) / 20; o.push([Math.cos(a) * r0, Math.sin(a) * r0]); }
    add(c99, slab(o, R.clip.y[1] - R.clip.y[0]), dark, wx, (R.clip.y[0] + R.clip.y[1]) / 2, wz).rotation.y = -la;
  }

  // turn: the lever's part of the shaft's turn (rotation.y); pitch: the pitch knob's part (kinematics leverTurn, pitchTurn)
  function update(turn, pitch,segmentLift=0) {
    detent.rotation.y = turn;
    //101/96 remain at their calibration datum: no invented knob/gear ratio.
    coil103.scale.y=(len103+segmentLift)/len103;
    const y = P.top + ballLift(turn);
    ball.position.y = y;
    const len = DT.hole.top - (y + DT.ball); // the spring from the hole's top down to the ball
    coil124.position.y = DT.hole.top;
    coil124.scale.y = len / (len124 + 0.0006);
  }
  return { update };
}

// The automatic's small working parts (builder A1): its springs, the pins and C-washers at the levers' pivots and
// joints, the steel ball of the shut-off rail, the shut-off lever's friction plate, the tonearm segment's guide piece
// and protecting plate, the lift's brackets (216, 234) and the rocker on the arm positioning slide. Every one is named
// with Dual's item number (Fig. 29) so X-ray can show it, and every one is carried by the part it is fastened to.
// The springs are drawn between their two hooks every frame, from the same poses the mechanism snapshot has just
// given the levers (so they stretch and relax as the levers move); nothing here decides anything.
//
// Where a part's job or place is not described in the manual or the rebuild guide it is placed from the exploded
// view and marked E (estimate). Item numbers that are ours rather than Dual's are marked the same way.
//
// springsPins(kit, h, update) -> update': h hands over the groups and values of index.js it hangs parts on; the
// returned update calls index.js's own and then poses these parts. Owned by the automatic builder (A1).
import * as THREE from 'three';
import { TAU, D, V3, lathe } from '../shared/geometry.js';
import { plate, strap, arcBand } from './geo.js';
import { AXES } from '../../layout.js';
import {
  FOLLOWER, SHUTOFF_LEVER as SL, SHUTOFF_BALL, SEGMENT as SG, TRIP_LINK, SHAFT_192, SWITCH_LEVER, START_LEVER,
  PAWL, CAM_ROCKER, INDEX_SLIDE, MAIN_LEVER as ML,
} from './place.js';

const ang = (x, z) => Math.atan2(z, x);
const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];

export function springsPins(kit, h, update) {
  const { mat, mats } = kit;
  // these small parts cast no shadow (they lie under the plate, and the shadow pass would double their draw calls)
  const add = (...args) => { const m = kit.add(...args); m.castShadow = false; return m; };
  const root = h.root, UP = V3(0, 1, 0);
  const steel = mats.steel(), springSteel = mat(0x9a9ea3, 0.9, 0.32), blackPlastic = mat(0x1b1b1d, 0.05, 0.55);
  const gold = mat(0x6e5a26, 0.82, 0.46), clipM = mat(0x3f4246, 0.8, 0.4); // C-washers: blued spring steel
  const part = (key, parent, name, no) => kit.part(key, parent, { name, no });

  // ---- shared geometry (one of each size, reused) -------------------------------------------------------
  const geoCache = new Map();
  const cached = (k, make) => { if (!geoCache.has(k)) geoCache.set(k, make()); return geoCache.get(k); };
  // a C-washer round a pin of radius r, lying flat (its axis along y), open on one side
  // (drawn 0.06 mm clear of the pin: the groove it sits in is not modelled)
  const clipGeo = (r, t = 0.00025) => cached(`clip${r}|${t}`, () => { const g = new THREE.TorusGeometry(r + t + 0.00006, t, 4, 20, TAU * 0.8); g.rotateX(Math.PI / 2); return g; });
  const clipXGeo = (r, t = 0.00025) => cached(`clipX${r}|${t}`, () => new THREE.TorusGeometry(r + t + 0.00006, t, 4, 20, TAU * 0.8)); // its axis along z
  // a helix of unit length along +y: radius r, wire w, `turns` turns, 10 segments a turn (small: under 1k triangles)
  const helixGeo = (r, w, turns) => cached(`helix${r}|${w}|${turns}`, () => {
    const pts = []; for (let i = 0; i <= turns * 10; i++) { const a = (i / 10) * TAU; pts.push(V3(Math.cos(a) * r, i / (turns * 10), Math.sin(a) * r)); }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 10, w, 5, false);
  });
  const unitRodGeo = (r) => cached(`rod${r}`, () => new THREE.CylinderGeometry(r, r, 1, 6));
  const cyl = (r, len, seg = 12) => cached(`cyl${r}|${len}|${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg));

  // ---- frames: a point in a moving group's frame, in the automatic's own (the shared) frame ---------------
  const rootInv = new THREE.Matrix4();
  const at = (obj, x, y, z, out) => out.set(x, y, z).applyMatrix4(obj.matrixWorld).applyMatrix4(rootInv);
  // a unit rod (height 1 along y) from a to b
  const tmpD = V3(0, 0, 0);
  const rodBetween = (mesh, a, b) => {
    tmpD.subVectors(b, a); const len = Math.max(1e-6, tmpD.length());
    mesh.position.copy(a).addScaledVector(tmpD, 0.5); mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(UP, tmpD.multiplyScalar(1 / len));
  };

  // A tension spring: a close-wound coil between two hooks. set(a, b): the hooks' points; the coil runs between them
  // less a short straight end (the hook's eye) at each end, so it stretches as its hooks part.
  function tensionSpring(key, name, no, { r = 0.0007, w = 0.00022, turns = 12, end = 0.0016 } = {}) {
    const g = part(key, root, name, no);
    const coil = add(g, helixGeo(r, w, turns), springSteel), e0 = add(g, unitRodGeo(w), springSteel), e1 = add(g, unitRodGeo(w), springSteel);
    const a1 = V3(0, 0, 0), b1 = V3(0, 0, 0), dir = V3(0, 0, 0);
    return {
      g,
      // ra, rb: the radius of the lug or post each end hooks round: the eye stops 0.08 mm short of it
      set(a, b, ra = 0, rb = 0) {
        dir.subVectors(b, a); let len = dir.length(); dir.multiplyScalar(1 / len);
        if (ra) { a.addScaledVector(dir, ra + 0.00008); len -= ra + 0.00008; }
        if (rb) { b.addScaledVector(dir, -(rb + 0.00008)); len -= rb + 0.00008; }
        const e = Math.min(end, len * 0.2);
        a1.copy(a).addScaledVector(dir, e); b1.copy(b).addScaledVector(dir, -e);
        coil.position.copy(a1); coil.quaternion.setFromUnitVectors(UP, dir); coil.scale.set(1, len - 2 * e, 1);
        rodBetween(e0, a, a1); rodBetween(e1, b1, b);
        return len;
      },
    };
  }
  // A torsion spring: its coil round a pin (fixed), and two legs from the coil out to what they bear on.
  // setLeg(i, a, b): leg i from a (on the coil) to b.
  function torsionSpring(key, name, no, parent, { r, w, turns, y0, y1, x, z }) {
    const g = part(key, parent, name, no);
    const coil = add(g, helixGeo(r, w, turns), springSteel, x, y0, z); coil.scale.set(1, y1 - y0, 1);
    const legs = [add(g, unitRodGeo(w), springSteel), add(g, unitRodGeo(w), springSteel), add(g, unitRodGeo(w), springSteel), add(g, unitRodGeo(w), springSteel)];
    return { g, coil, setLeg: (i, a, b) => rodBetween(legs[i], a, b) };
  }
  // a C-washer round a vertical pin at (x, y, z) of `parent`
  const clip = (key, parent, name, no, r, x, y, z, t) => { const g = part(key, parent, name, no); add(g, clipGeo(r, t), clipM, x, y, z); return g; };
  const post = (parent, r, y0, y1, m, x, z, seg = 12) => add(parent, cyl(r, Math.abs(y1 - y0), seg), m, x, (y0 + y1) / 2, z);

  const A = V3(0, 0, 0), B = V3(0, 0, 0), Cv = V3(0, 0, 0);
  const frame = []; // per-frame posers

  // =====================================================================================================
  // 1. Pins and C-washers at the automatic's pivots and joints
  // =====================================================================================================
  // main lever 184: the cross pin 183 through its ears and the stud's yoke, a C-washer at each end (242, 245: Fig. 29
  // draws them beside 243 and 184)
  for (const [s, no] of [[1, '242'], [-1, '245']]) {
    const g = part(`clip${no}`, h.mlTilt, 'C-washer 2.3 on the main lever\'s cross pin 183', `${no} (210 145)`);
    add(g, clipXGeo(0.0010, 0.00015), clipM, 0, 0, s * 0.00650); // the pin runs along z; thin: the lever's body is 0.45 mm over the pin
  }
  // cam deflector207: snap ring166 retains it on cam axle208 (166 is listed as a "snap spring":
  // a Sprengring, a retaining ring, not a working spring)
  {
    const g = part('snapRing166', h.gate, 'Snap ring retaining cam deflector207 on axle208', '166 (200 522)');
    // Coaxial with208; the old0.4mm off-axis peg was an invented joint.
    add(g, clipGeo(0.0030, 0.00012), clipM, 0, -FOLLOWER.t / 2 - 0.00012, 0);
  }
  // shut-off lever 162: its pin from the cam's web carries a friction plate 163 on top of the lever (it holds the lever
  // wherever the trip slide leaves it, Fig. 21) and a C-washer 164 under it
  {
    const pv = h.slPiv;
    const top = SL.y + SL.t / 2;
    const g = part('frictionPlate163', h.sl, 'Friction plate on the shut-off lever\'s pin, pressing the lever', '163 (216 765)');
    // a small spring plate round the pin with a tongue bent down onto the lever's tail side (E: shape from Fig. 29)
    const tailA = ang(h.slTail[0] - pv[0], h.slTail[1] - pv[1]);
    const out = strap([[pv[0], pv[1]], [pv[0] + Math.cos(tailA) * 0.0016, pv[1] + Math.sin(tailA) * 0.0016]], 0.0034, 8);
    add(g, plate(out, 0.0003, [[pv[0], pv[1], 0.00115]], 0.00008), springSteel, 0, top + 0.00015, 0);
    post(h.sl, 0.0011, SL.y - SL.t / 2 - 0.0005, SL.y - SL.t / 2, steel, pv[0], pv[1], 10); // the pin's end below the lever
    clip('clip164', h.sl, 'C-washer 2.3 under the shut-off lever on its pin', '164 (210 145)', 0.0011, pv[0], SL.y - SL.t / 2 - 0.00028, pv[1]);
  }
  // (the cam rocker's pin 174, its lugs and clips are drawn by changer.js, at the rocker's lowered height)
  // switch lever 195 on the grooved pin 192: a C-washer under it (E: 159)
  clip('clip159', root, 'C-washer 2.3 under the switch lever 195 on the grooved pin 192 (E: which of Dual\'s)', '159 (210 145)', 0.0012, SHAFT_192.x, SWITCH_LEVER.y - 0.00075 - 0.0003, SHAFT_192.z);
  // start lever 248: a C-washer under its slot on the guide pin (E: 160)
  clip('clip160', root, 'C-washer 2.3 under the start lever on its guide pin (E: which of Dual\'s)', '160 (210 145)', 0.0013, START_LEVER.guide.x, START_LEVER.y - 0.00075 - 0.0003, START_LEVER.guide.z);
  // pawl 273: a C-washer over it on its pin (it lies just over the segment's tab, so the washer is on the plate's side)
  clip('clip273', h.pawl, 'C-washer 2.3 on the pawl\'s pin carried by188', '210 145 (E)', 0.0011, 0, 0.001, 0);
  // Plain1229 p.7/Fig.31:253 eye retained directly below201 by271 then272.
  {
    const [x, z] = polar(h.linkTab, h.linkR), eyeBottom = TRIP_LINK.y - TRIP_LINK.t / 2 - SG.y;
    const g = part('slipWasher271', h.segPlate, 'Slip washer below the rigid trip rail eye on201', '271 (201 187)');
    add(g, lathe([[.0012, 0], [.0026, 0], [.0026, .0002], [.0012, .0002]], 16), mats.nylon(), x, eyeBottom - .0002, z);
    clip('clip272', h.segPlate, 'Lock washer below271 on the segment pin', '272 (210 145)', .0011, x, eyeBottom - .00045, z, .0002);
  }
  // indexing lever 49: the size selector's shaft through its eccentric and the lever, a C-washer under it (E)
  {
    const g = part('shaft49', h.ix, 'Shaft of the size selector through the indexing lever 49 and its eccentric, with its C-washer (E)', '49 (E)');
    post(g, 0.0016, -0.0058, -0.0038, steel, AXES.size.x, AXES.size.z, 14);
    add(g, clipGeo(0.0016), clipM, AXES.size.x, -0.0045 - 0.00075 - 0.00028, AXES.size.z);
  }
  // arm positioning slide 255: its pin in the slot runs down past the slide's lowest place, a C-washer on its end (E)
  {
    const [x, z] = h.slAt(0.2), y = INDEX_SLIDE.y - INDEX_SLIDE.t / 2 - 0.0009 - 0.00045;
    const g = part('clip263', h.ix, 'C-washer 2.3 on the arm positioning slide\'s pin, under the slide', '263 (210 146)');
    post(g, 0.0012, y - 0.0004, INDEX_SLIDE.y - 0.0016, steel, x, z, 10);
    add(g, clipGeo(0.0012), clipM, x, y, z);
  }

  // =====================================================================================================
  // 2. The steel ball 254 of the shut-off rail, under the shut-off slide 253
  // =====================================================================================================
  {
    const g = part('ball254', h.soSlide, '4mm support ball near the inner tip of rigid253 (Fig.31; seat position estimated)', '254 (209 358)');
    kit.name('tripBall254', add(g, cached('ball254', () => new THREE.SphereGeometry(SHUTOFF_BALL.r, 16, 10)), mat(0xd6d9dc, 1, .12), h.railLength - SHUTOFF_BALL.fromTip, SHUTOFF_BALL.supportY + SHUTOFF_BALL.r, 0));
  }

  // =====================================================================================================
  // 3. Springs
  // =====================================================================================================
  // 187: torsion spring round the grooved pin 192, over the switch arm 188: one leg on 188's short arm, the other
  // against a tab pressed down from the dish floor; it returns 188 (power off, idler out) when the pawl lets go
  // ("the torsion spring (187) then returns the switch arm to its initial position")
  const S192 = SHAFT_192, yTop188 = S192.y + 0.00075;
  const t187 = torsionSpring('spring187', 'Torsion spring returning the switch arm 188 (power off)', '187 (216 787)', root,
    { r: 0.0028, w: 0.0004, turns: 6, y0: yTop188 + 0.0005, y1: yTop188 + 0.0005 + 0.0036, x: S192.x, z: S192.z });
  const tabA = -35 * D, tab = [S192.x + Math.cos(tabA) * 0.0062, S192.z + Math.sin(tabA) * 0.0062];
  {
    const g = part('tab187', root, 'Tab pressed down from the dish floor: the torsion spring 187\'s fixed leg bears on it (E)', '— (E)');
    const m = add(g, new THREE.BoxGeometry(0.0010, 1, 0.0030), steel, tab[0] + Math.cos(tabA) * 0.0006, 0, tab[1] + Math.sin(tabA) * 0.0006);
    const top = -0.0115, bot = t187.coil.position.y + 0.0036 - 0.0011; m.scale.y = top - bot; m.position.y = (top + bot) / 2; m.rotation.y = -tabA;
  }
  const leg187A = -68 * D; // on 188's short part, toward its stub (in 188's own frame)
  frame.push(() => {
    const yb = t187.coil.position.y, yt = yb + 0.0036, r = 0.0028;
    const a = leg187A - h.a188.rotation.y; // 188 turns with -rotation.y
    A.set(S192.x + Math.cos(a) * r, yb, S192.z + Math.sin(a) * r); B.set(S192.x + Math.cos(a) * 0.0058, yb, S192.z + Math.sin(a) * 0.0058); t187.setLeg(0, A, B);
    Cv.copy(B); Cv.y = yTop188 + 0.0004; t187.setLeg(1, B, Cv); // bent down onto 188's top
    A.set(S192.x + Math.cos(tabA) * r, yt, S192.z + Math.sin(tabA) * r); B.set(tab[0] - Math.cos(tabA) * 0.0005, yt, tab[1] - Math.sin(tabA) * 0.0005); t187.setLeg(2, A, B);
    Cv.copy(B); Cv.y = yt + 0.0008; t187.setLeg(3, B, Cv); // turned up against the tab
  });

  // 251: tension spring pulling the start lever 248 toward the cam ("pulling it towards the main cam by means of the
  // tension spring (251)"): from a lug under the lever to a post hung from the dish floor ahead of it
  const G248 = START_LEVER.guide, F248 = START_LEVER.finger, fL = [F248.x - G248.x, F248.z - G248.z], fDir = ang(fL[0], fL[1]), fLen = Math.hypot(fL[0], fL[1]);
  const along = (k, off = 0) => [G248.x + Math.cos(fDir) * fLen * k - Math.sin(fDir) * off, G248.z + Math.sin(fDir) * fLen * k + Math.cos(fDir) * off];
  const s251 = tensionSpring('spring251', 'Tension spring pulling the start lever 248 toward the main cam', '251 (216 796)', { r: 0.0007, turns: 14 });
  const y251 = START_LEVER.y + 0.00075 + 0.0009, hook251 = along(0.40, -0.0110), post251 = along(0.62, -0.0125); // over the lever: 188 runs under it
  {
    const g = part('post251', root, 'Spring post for 251, hung from the dish floor (E)', '— (E)');
    post(g, 0.0009, y251 - 0.0006, -0.0115, steel, post251[0], post251[1], 10);
    const lug = part('lug251', h.st, 'Spring lug on the start lever 248', '248');
    post(lug, 0.0005, 0.00075, y251 + 0.0003 - START_LEVER.y, steel, hook251[0], hook251[1], 8);
  }
  frame.push(() => { at(h.st, hook251[0], y251 - START_LEVER.y, hook251[1], A); B.set(post251[0], y251, post251[1]); s251.set(A, B, 0.0005, 0.0009); });

  // 252: tension spring on the switch lever 195, pulling it back toward "stop" (E: it sits beside 195/196 in Fig. 18
  // and Fig. 29), from a lug under 195 to a post hung from the plate
  const t195 = h.t195, a195 = ang(t195[0], t195[1]), side = a195 - Math.PI / 2;
  const hook252 = [t195[0] * 0.6 + Math.cos(side) * 0.0030, t195[1] * 0.6 + Math.sin(side) * 0.0030]; // in 195's frame
  const p252 = [S192.x + t195[0] * 0.6 + Math.cos(side) * 0.0125, S192.z + t195[1] * 0.6 + Math.sin(side) * 0.0125];
  const y252 = SWITCH_LEVER.y - 0.00075 - 0.0009;
  const s252 = tensionSpring('spring252', 'Tension spring returning the switch lever 195 (E: its hooks)', '252 (216 777)', { r: 0.0006, turns: 12 });
  {
    const g = part('post252', root, 'Spring post for 252, hung from the plate (E)', '— (E)');
    post(g, 0.0009, y252 - 0.0006, -0.0015, steel, p252[0], p252[1], 10);
    const lug = part('lug252', h.l195, 'Spring lug under the switch lever 195', '195');
    post(lug, 0.0005, y252 - SWITCH_LEVER.y - 0.0003, -0.00075, steel, hook252[0], hook252[1], 8);
  }
  frame.push(() => { at(h.l195, hook252[0], y252 - SWITCH_LEVER.y, hook252[1], A); B.set(p252[0], y252, p252[1]); s252.set(A, B, 0.0005, 0.0009); });

  // Existing237 spring identification/endpoints are unverified. Keep this schematic
  // spring attached to the rigid rail; it does not create a joint or drive rail yaw.
  const s237 = tensionSpring('spring237', 'Spring237 with unverified trip-rail attachment', '237 (216 777)', { r: .00055, turns: 12 });
  const y237 = TRIP_LINK.y - TRIP_LINK.t / 2 - .0007;
  const soOut = Math.atan2(h.SO.end.z - h.SO.hook.z, h.SO.end.x - h.SO.hook.x);
  const p237 = [h.SO.end.x - Math.cos(soOut) * .0015 + Math.cos(-110 * D) * .0100, h.SO.end.z - Math.sin(soOut) * .0015 + Math.sin(-110 * D) * .0100];
  {
    const g = part('post237', root, 'Unverified237 spring post, hung from the dish floor', '— (E)');
    post(g, .0007, y237 - .0005, -.0115, steel, p237[0], p237[1], 10);
  }
  const lug237 = add(part('lug237', root, 'Unverified237 spring lug on rigid253', '— (E)'), cyl(.0004, .0007, 8), steel);
  frame.push(() => {
    const [x,z] = h.railAt(h.railStep - .004);
    lug237.position.set(x, y237 + .00035, z);
    A.set(x,y237,z); B.set(p237[0],y237,p237[1]); s237.set(A,B,.0004,.0007);
  });

  // 241: tension spring over the pawl 273, holding it toward the square bolt 274 so it drops behind it when the arm
  // swings in (E: its job and hooks; Fig. 12 shows it by the segment)
  const s241 = tensionSpring('spring241', 'Tension spring holding the pawl 273 toward the square bolt (E: its hooks)', '241 (216 796)', { r: 0.0006, turns: 12 });
  const y241 = PAWL.y + 0.0007 + 0.0008;
  const boltA = ang(PAWL.bolt.x - PAWL.x, PAWL.bolt.z - PAWL.z), hk241 = polar(boltA, 0.0028), dir241 = boltA + Math.PI / 2;
  const p241 = [PAWL.x + hk241[0] + Math.cos(dir241) * 0.0095, PAWL.z + hk241[1] + Math.sin(dir241) * 0.0095];
  {
    const g = part('post241', root, 'Spring post for 241, hung from the plate (E)', '— (E)');
    post(g, 0.0008, y241 - 0.0006, -0.0015, steel, p241[0], p241[1], 10);
    const lug = part('lug241', h.pawl, 'Spring lug on the pawl 273', '273');
    post(lug, 0.0004, 0.0007, y241 - PAWL.y + 0.0003, steel, hk241[0], hk241[1], 8);
  }
  frame.push(() => { at(h.pawl, hk241[0], y241 - PAWL.y, hk241[1], A); B.set(p241[0], y241, p241[1]); s241.set(A, B, 0.0004, 0.0008); });

  // 240: tension spring keeping the cam rocker's nib up on cam surface AK: from the nib arm up to an eye under the
  // platter's bearing support, which lies over that arm (E: its job and hooks)
  const s240 = tensionSpring('spring240', 'Tension spring returning the cam rocker 173 onto cam surface AK (E: its hooks)', '240 (218 154)', { r: 0.0007, turns: 10 });
  const hk240 = [h.crN[0] * 0.75, h.crN[1] * 0.75], top240 = -0.0237, eye240 = [CAM_ROCKER.pivot.x + hk240[0], CAM_ROCKER.pivot.z + hk240[1]];
  {
    const lug = part('lug240', h.crG, 'Spring lug on the cam rocker 173', '173');
    post(lug, 0.0004, 0.0008, 0.0016, steel, hk240[0], hk240[1], 8);
    const g = part('eye240', root, 'Spring eye under the bearing support for 240 (E)', '— (E)');
    post(g, 0.0006, top240 - 0.0014, top240, steel, eye240[0], eye240[1], 8);
  }
  frame.push(() => { at(h.crG, hk240[0], 0.0016, hk240[1], A); B.set(eye240[0], top240 - 0.0014, eye240[1]); s240.set(A, B); });

  // 262: tension spring on the arm positioning slide 255, drawing it back against the indexing eccentric (Fig. 29 draws
  // it beside 255; Fig. 14 and 18 by 255): over the slide from a lug on it to a post hung from the plate (E: its hooks)
  const s262 = tensionSpring('spring262', 'Tension spring of the arm positioning slide 255 (E: its hooks)', '262 (200 453)', { r: 0.0006, turns: 14 });
  const y262 = INDEX_SLIDE.y + INDEX_SLIDE.t / 2 + 0.0013;
  const hk262 = h.slAt(0.42, -0.0050), p262 = h.slAt(0.29, -0.0050);
  {
    const g = part('post262', root, 'Spring post for 262, hung from the plate (E)', '— (E)');
    post(g, 0.0008, y262 - 0.0006, -0.0015, steel, p262[0], p262[1], 10);
    const lug = part('lug262', h.slideG, 'Spring lug on the arm positioning slide 255', '255');
    post(lug, 0.0004, INDEX_SLIDE.y + INDEX_SLIDE.t / 2, y262 + 0.0003, steel, hk262[0], hk262[1], 8);
  }
  frame.push(() => { at(h.slideG, hk262[0], y262, hk262[1], A); B.set(p262[0], y262, p262[1]); s262.set(A, B, 0.0004, 0.0008); });

  // 257 rocker on the threaded bolt 256 under the arm positioning slide, with the compression spring 261 on the bolt
  // pressing it and a C-washer 260 under it (Fig. 29). It tips while the main lever holds the slide in reach (E: how)
  {
    const [bx, bz] = h.slAt(0.52, 0.0035), sY = INDEX_SLIDE.y - INDEX_SLIDE.t / 2;
    const g256 = part('bolt256', h.slideG, 'Threaded bolt under the arm positioning slide', '256 (219 050)');
    post(g256, 0.0011, sY - 0.0072, sY, steel, bx, bz, 10);
    add(g256, cyl(0.0019, 0.0012, 6), steel, bx, sY + 0.0006 + INDEX_SLIDE.t, bz); // its nut over the slide
    clip('clip260', h.slideG, 'C-washer 2.3 on the bolt 256 under the rocker', '260 (210 145)', 0.0011, bx, sY - 0.0066, bz);
    const rk = part('rocker257', h.slideG, 'Rocker on the threaded bolt under the arm positioning slide (E: how it moves)', '257 (217 547)');
    const pivot = new THREE.Group(); pivot.position.set(bx, sY - 0.0055, bz); rk.add(pivot);
    const d = h.slDir; // along the slide
    const arm = strap([polar(d, -0.0045), [0, 0], polar(d, 0.0060)], 0.0050, 6);
    add(pivot, plate(arm, 0.0010, [[0, 0, 0.0014]]), gold, 0, 0, 0);
    { const [x, z] = polar(d, 0.0060); const m = add(pivot, new THREE.BoxGeometry(0.0010, 0.0028, 0.0040), gold, x, -0.0014 + 0.0005, z); m.rotation.y = -d; } // its end turned down
    const c261 = add(part('spring261', h.slideG, 'Compression spring on the bolt 256 pressing the rocker 257', '261 (218 834)'), helixGeo(0.0018, 0.0003, 5), springSteel, bx, 0, bz);
    const axis = V3(-Math.sin(d), 0, Math.cos(d));
    frame.push((s, look) => {
      const tip = 0.10 * look.slide; // tipped while the slide is held in reach
      pivot.quaternion.setFromAxisAngle(axis, tip);
      const bot = sY - 0.0050 + 0.0019 * Math.sin(Math.abs(tip)); // on the rocker's hub: pressed up a little as it tips
      c261.position.y = bot; c261.scale.y = sY - bot - 0.0001;
    });
  }

  // 181: leaf spring on the main lever's stud yoke, pressing the lever's body on the follower pin's side (E: its job;
  // Fig. 29 draws it on the stud 182 under the bracket 215). It bends as the lever tips to lift.
  {
    const g = part('leaf181', h.mlTurn, 'Leaf spring on the main lever\'s yoke, bearing on the lever (E: its job)', '181 (216 858)');
    const leaf = add(g, cached('leaf181', () => { const gg = new THREE.BoxGeometry(1, 0.0003, 0.0018); gg.translate(0.5, 0, 0); return gg; }), springSteel, -0.00276, 0.0010, 0.0030);
    leaf.rotation.y = Math.PI; // pointing along -x (toward the follower pin)
    const tipX = -0.0100, yBody = h.yL - ML.t / 2 - 0.00016;
    frame.push(() => {
      const t = h.mlTilt.rotation.z, yTip = tipX * Math.sin(t) + yBody * Math.cos(t);
      const dx = tipX - leaf.position.x, dy = yTip - leaf.position.y, l = Math.hypot(dx, dy);
      leaf.scale.x = l; leaf.rotation.z = Math.atan2(dy, -dx); // (rotation.y = PI points it along -x) tilted to the body
    });
  }

  // =====================================================================================================
  // 4. The segment's guide piece 232 and protecting plate 233
  // =====================================================================================================
  // 233: a gold stamping screwed under the plate beside the bearing, its foot under the segment's rim; on it the black
  // plastic guide 232 the segment's edge slides in ("segment (201) rubs in guide (232)", "adjust guide (232)"; the rebuild
  // guide: "a black plastic guide ... held in adjustment by a single phillips head screw on the back of the curved gold
  // colored tone arm mechanism"). The guide sits where the segment's rim always is (99..176 deg about the arm's axis over
  // the whole swing); the plate comes down from the chassis only beyond 173 deg, where the trip link never crosses
  // (it crosses the rim's radius between 133 and 173 deg), and its foot runs under the segment, clear of the main lever
  // and its finger (E: place and outline)
  {
    const P = h.P, aG = 167 * D, w = 10 * D, SGb = SG.y - SG.t / 2, SGt = SG.y + SG.t / 2;
    const g233 = part('plate233', root, 'Protecting plate under the tonearm segment', '233 (225 924)');
    const g232 = part('guide232', root, 'Guide piece the segment\'s edge slides in (black plastic)', '232 (218 485)');
    const r0 = SG.r - 0.0030, rW = 0.0515, aW0 = 175 * D, aW1 = 183 * D, aF0 = aG - w / 2 - 3 * D;
    // the guide: a shoe under the rim and a lip outside it
    add(g232, plate(arcBand(P.x, P.z, r0, SG.r + 0.0016, aG - w / 2, aG + w / 2, 10, false), 0.0010, [], 0.0002), blackPlastic, 0, SGb - 0.00015 - 0.0005, 0);
    const lip = arcBand(P.x, P.z, SG.r + 0.0004, SG.r + 0.0016, aG - w / 2, aG + w / 2, 10, false);
    add(g232, plate(lip, SGt + 0.0001 - (SGb - 0.00015), [], 0.0001), blackPlastic, 0, (SGt + 0.0001 + SGb - 0.00015) / 2 - 0.00005, 0);
    add(g232, cyl(0.0011, 0.0006, 10), steel, P.x + Math.cos(aG) * (SG.r + 0.0030), SGb - 0.00015 - 0.0010 - 0.0008 - 0.0003, P.z + Math.sin(aG) * (SG.r + 0.0030)); // its adjusting screw from below
    // the plate: a foot under the guide and out to the wall, the wall up to a flange screwed under the chassis plate
    const yF = SGb - 0.00015 - 0.0010 - 0.0004;
    add(g233, plate(arcBand(P.x, P.z, r0 - 0.0010, rW + 0.0008, aF0, aW1, 16, false), 0.0008, [], 0.0002), gold, 0, yF, 0);
    add(g233, plate(arcBand(P.x, P.z, rW, rW + 0.0008, aW0, aW1, 8, false), -0.0015 - (yF - 0.0004), [], 0.0001), gold, 0, (-0.0015 + yF - 0.0004) / 2, 0);
    add(g233, plate(arcBand(P.x, P.z, rW, rW + 0.0070, aW0, aW1, 8, false), 0.0008, [], 0.0002), gold, 0, -0.0015 - 0.0004, 0);
    const [sx, sz] = polar((aW0 + aW1) / 2, rW + 0.0042); add(g233, cyl(0.0021, 0.0010, 12), steel, P.x + sx, -0.0015 - 0.0008 - 0.0005, P.z + sz); // its screw (227)
  }

  // =====================================================================================================
  // 5. The lift's brackets: 216 over the lift cam 220 with its torsion spring 219, and 234 that guides the connecting
  //    lever 270 (horizontal cue axle and central transverse rocker hinge)
  // =====================================================================================================
  const cuePart = kit.parts.cueCam && kit.parts.cueCam.groups[0];
  const cueCam = cuePart && cuePart.children[0], cueRod = cuePart && cuePart.children[1];
  if (cueCam && cueCam.isGroup) {
    // Cam220 is on the horizontal cue-handle axle (M-DE Fig18), not a vertical post.
    // Bracket profile and spring seat need measurements; omit the old invented
    // vertical spindle/torsion spring rather than certify that wrong connection.
    const cx=cueCam.position.x, cz=cueCam.position.z, cy=cueCam.position.y;
    const g216=part('bracket216',root,'Cue axle bracket (profile estimated)','216 (216 875)');
    for(const x of [cx-0.002,cx+0.002]) {
      const shape=new THREE.Shape([[-0.004,-0.0015],[0.004,-0.0015],[0.004,cy-0.003],[-0.004,cy-0.003]].map(([u,v])=>new THREE.Vector2(u,v)));
      shape.holes.push(new THREE.Path().absarc(0,cy,0.0011,0,TAU,true));
      const g=new THREE.ExtrudeGeometry(shape,{depth:0.0006,bevelEnabled:false});g.rotateY(Math.PI/2);
      add(g216,g,gold,x,0,cz);
    }
  }
  if (cueRod && cueRod.isGroup && cueRod.userData.rocker) {
    // Central transverse hinge234: two bored bracket ears, not an eye along270.
    const g234=part('bracket234',root,'Transverse pivot bracket for rocking lever270 (location estimated)','234 (216 886)');
    g234.position.copy(cueRod.position);g234.rotation.y=cueRod.rotation.y;
    for(const z of [-0.003,0.003]) {
      const shape=new THREE.Shape([[-0.003,0.009],[0.003,0.009],[0.003,-0.002],[-0.003,-0.002]].map(([u,v])=>new THREE.Vector2(u,v)));
      shape.holes.push(new THREE.Path().absarc(0,0,0.0013,0,TAU,true));
      const g=new THREE.ExtrudeGeometry(shape,{depth:0.0006,bevelEnabled:false});
      add(g234,g,gold,0,0,z);
    }
  }

  // ---- each frame --------------------------------------------------------------------------------------
  const look = { slide: 0, init: false };
  const groups = [h.a188, h.st, h.l195, h.pawl, h.crG, h.slideG, h.soSlide, h.mlTilt, h.mlTurn, cueCam].filter(Boolean);
  return function updateWithSpringsPins(dt, s, ctx) {
    update(dt, s, ctx);
    if (!look.init) { look.slide = s.slideOn ? 1 : 0; look.init = true; }
    look.slide += ((s.slideOn ? 1 : 0) - look.slide) * Math.min(1, dt * 14);
    root.updateWorldMatrix(true, false); rootInv.copy(root.matrixWorld).invert();
    for (const g of groups) g.updateWorldMatrix(true, false);
    for (const f of frame) f(s, look);
  };
}

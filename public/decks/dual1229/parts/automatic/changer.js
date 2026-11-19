// Automatic: the record changer's parts under the spindle. Owned by the automatic builder (builder A2;
// see OWNERS.md). Called from index.js: update = buildChanger(kit, { root, update, crG, crA, crN, crAxis }).
//
// Plain 1229 pp.13–14, Fig.22/24/31: AK guides rocker173 about fixed pin174.
// During a loaded multi cycle the bolt177 descends; the empty spindle blocks that
// stroke. Spring178 lies between bushing179 and177's shoulder, as Fig.24 shows.
// The bushing stays seated on173 and the loaded bolt follows it; this is a
// prescribed quasi-static assembly, not a spring-force or AW3 internal simulation.
// Fig.27's upward bench adjustment is drawn with the chassis inverted and does
// not establish an upward release stroke in the deck's normal operating frame.
// Lock212 prevents changing in single. Its connecting mode linkage remains
// unresolved; the drawn route/travel, pivot placement and all dimensions are
// estimates. The small real elastic motion when blocked has not been measured.
import * as THREE from 'three';
import { lathe, helixGeo, sheetGeo } from '../shared/geometry.js';
import { BEARING } from '../platter/place.js';
import { CAM_ROCKER, CAM_Y, CAM_R } from './place.js';
import { AK_PROFILE, akHeight } from './changer-profile.js';
import { plate, strap } from './geo.js';
import { rockerPose, STRAP_T as STRAP_T_C, PIN_ABOVE, BUSH_FLANGE } from '../../changer-contact.js';

// ---- heights at the spindle (E), from the rocker through the hollow stationary spindle tube -----------------
const STRAP_T = STRAP_T_C; // the rocker's strap (changer-contact.js)
const R_TOP = CAM_ROCKER.y + STRAP_T / 2; // the rocker's top face at rest
export const BUSH = { r: 0.0030, flange: BUSH_FLANGE, flangeH: 0.0006, bore: 0.0016, h: 0.0028 }; // 179
export const BOLT = { thin: 0.0015, thick: 0.0024, neck: 0.0016, shoulder: -0.0336, neckY: [-0.0316, -0.0300], top: BEARING.actuatorTop ?? 0.0116, bottom: R_TOP + 0.0009 }; // 177
export const SPRING = { r: 0.0021, wire: 0.0003, turns: 6 }; // 178
// 212: its fork end at the bolt, its line out through the gap in the cam bracket's skirt (E)
export const LOCK = { dir: [-0.25, -0.97], y: -0.0308, t: 0.0010, w: 0.0065, wTail: 0.0055, len: 0.050, tines: 0.0030, slot: 0.00185, travel: 0.0065, pinS: 0.045, pinR: 0.0012, step: 0.016, rise: 0.016 }; // step, rise: the Z-step's place and height (E, Fig.29)
// 174 and its lugs: along the rocker's axis from the pivot (E)
export const SPINDLE = { r: 0.0012, above: PIN_ABOVE, half: 0.0059, hanger: 0.0040, hangerT: 0.0010, hangerAt: 0.0034, hole: 0.00135, lugR: 0.0008, lugW: 0.0045 }; // hangerAt: 171's lugs inside 173's bent-up lugs (E)

// Plain 1229 pp.13–14 describes the change bolt's downward release and the empty
// spindle blocking that movement. Fig.24/31 places 178 above 179 and gives 173 a
// fixed transverse pin174. The opposite AK end therefore rises during release.
// The outer cam contour is visible in Fig.22 and the removed-cam reference photo,
// but neither measures its working profile. This relief, rounded contact, heights
// and stroke are a fitted reconstruction, NOT a measured factory cam profile.
export function buildChangerCam(kit, { camSpin, crG, crN, crAxis, center, nib, material, profile = AK_PROFILE }) {
  const r = 0.0013, neutral = CAM_Y.ak;
  const pinOffset = STRAP_T / 2 + SPINDLE.above;
  const capLocal = new THREE.Vector3(crN[0], neutral - CAM_ROCKER.y - r, crN[1]);
  const stemBottom = STRAP_T / 2, stemTop = capLocal.y;
  kit.add(crG, new THREE.CylinderGeometry(r, r, stemTop - stemBottom, 12), kit.mats.steel(), crN[0], (stemBottom + stemTop) / 2, crN[1]);
  const cap = kit.name('changerFollower', kit.add(crG, new THREE.SphereGeometry(r, 16, 12), kit.mats.steel(), ...capLocal.toArray()));
  cap.userData.contactRadius = r;

  // A continuous underside rail with a relief. Unlike the previous downward lobe,
  // it leaves room for the AK end to rise while the spring-loaded spindle descends.
  // The whole rail returns the mechanism to neutral; only the drop interval opens.
  const phase0 = Math.atan2(nib.z - center.z, nib.x - center.x), n = 180;
  const pos = [], triangles = [], width = 0.0018, top = CAM_Y.web[0];
  const row = (i) => {
    const deg = i * 360 / n, a = phase0 + deg * Math.PI / 180, y = akHeight(deg, profile);
    return [new THREE.Vector3(Math.cos(a) * (CAM_R.ak - width), y, Math.sin(a) * (CAM_R.ak - width)),
      new THREE.Vector3(Math.cos(a) * (CAM_R.ak + width), y, Math.sin(a) * (CAM_R.ak + width))];
  };
  const tri = (a, b, c, contact = false) => { pos.push(...a.toArray(), ...b.toArray(), ...c.toArray()); if (contact) triangles.push(new THREE.Triangle(a.clone(), b.clone(), c.clone())); };
  for (let i = 0; i < n; i++) {
    const [a,b] = row(i), [c,d] = row(i+1), A=a.clone().setY(top), B=b.clone().setY(top), C=c.clone().setY(top), D=d.clone().setY(top);
    tri(a,c,b,true); tri(b,c,d,true);
    tri(A,B,C); tri(B,D,C);
    tri(a,A,c); tri(c,A,C); tri(b,d,B); tri(d,D,B);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); geo.computeVertexNormals();
  const rail = kit.name('changerCamAK', kit.add(camSpin,geo,material));
  rail.userData.profile = 'Inferred relief; dimensions and phase profile estimated';
  const q = new THREE.Quaternion(), offset = new THREE.Vector3(), p = new THREE.Vector3(), closest = new THREE.Vector3();
  const setAngle = (a) => {
    q.setFromAxisAngle(crAxis,a); crG.quaternion.copy(q);
    offset.set(0,pinOffset,0).applyQuaternion(q);
    crG.position.set(CAM_ROCKER.pivot.x-offset.x,CAM_ROCKER.y+pinOffset-offset.y,CAM_ROCKER.pivot.z-offset.z);
  };
  const clearance = (a,theta) => {
    setAngle(a); p.copy(capLocal).applyQuaternion(q).add(crG.position);
    const x=p.x-center.x,z=p.z-center.z,c=Math.cos(theta),s=Math.sin(theta);
    p.x=x*c-z*s; p.z=x*s+z*c; // inverse of the cam's clockwise world rotation
    let d=Infinity;
    for (const t of triangles) { t.closestPointToPoint(p,closest); d=Math.min(d,closest.distanceToSquared(p)); }
    return Math.sqrt(d)-r;
  };
  return (s) => {
    // One authority: the same contact solve the mechanism runs (changer-contact.js rockerPose):
    // AK lets the cap rise only as far as bolt 177 may go down. A locked (empty) spindle or 212
    // in "single" holds the rigid rocker out of the relief. No invented compliance stroke: its
    // small real elastic deflection has not been measured. contactGap is measured against the
    // SAME triangles that are rendered, as a cross-check of the drawn surface.
    const blocked = s.mode !== 'multi' || (s.changer ? s.changer.locked : !s.changerLoaded);
    const pose = rockerPose(s.theta || 0, blocked ? 0 : Infinity, profile);
    setAngle(pose.angle);
    return { angle: pose.angle, blocked, drop: pose.drop, contactGap: clearance(pose.angle, (s.theta || 0) * Math.PI / 180) };
  };
}

// Cam rocker 173 as pressed sheet (Fig.29, Fig.22): the strap from the bolt end over the pivot to the
// AK end, with a side wall bent down along both arms (3.5 mm deep, E), stopping clear of the pivot
// lugs, the bushing seat at the bolt end and the follower's stem, and a tab bent down at the AK end. The strap's top face, the pivot and
// the AK end are where they were (changer-contact.js reads them), so the solved stroke is unchanged.
// The pivot lugs stay separate upright plates in buildChanger.
export function rockerSheet(crA, crN, t = STRAP_T) {
  // Drawn in the strap's own straight frame: s along it from the bolt end (crA) to the AK end (crN),
  // q across. Pin 174 is on this line (place.js), at s = sp. Fig.29: a long narrow strap, a plain round
  // eye at the bolt end (bushing 179's seat), walls bent down along the middle section only, lugs bent up
  // at the pivot, a short tab turned down at the AK end. Widths, wall and tab sizes are estimates.
  const dx = crN[0] - crA[0], dz = crN[1] - crA[1], L = Math.hypot(dx, dz), u = [dx / L, dz / L], n = [-u[1], u[0]];
  const sp = Math.hypot(crA[0], crA[1]); // pivot (origin) from the bolt end
  const P = (s, q) => [crA[0] + u[0] * s + n[0] * q, crA[1] + u[1] * s + n[1] * q];
  const h1 = 0.0021, h2 = 0.00325, re = BUSH_FLANGE, sEnd = L + 0.0025; // strap, pivot pad, eye, end beyond the follower
  const sE = Math.sqrt(re * re - h1 * h1); // where the eye meets the narrow strap
  const side = (k) => [[sE, k * h1], [sp - 0.0045, k * h1], [sp - 0.003, k * h2], [sp + 0.003, k * h2], [sp + 0.0045, k * h1], [sEnd, k * h1]];
  const sq = [...side(1), ...side(-1).reverse()];
  const a0 = Math.atan2(-h1, sE), a1 = Math.atan2(h1, sE) - 2 * Math.PI; // the eye, round the back (s < 0) from -q to +q
  for (let i = 1; i < 16; i++) { const a = a0 + ((a1 - a0) * i) / 16; sq.push([Math.cos(a) * re, Math.sin(a) * re]); }
  const out = sq.map(([s, q]) => P(s, q));
  // the lugs pin 174 passes through, bent up from the pad's edges: a clevis outside 171's lugs
  const lw = SPINDLE.lugW, lr = SPINDLE.lugR, vPin = t / 2 + PIN_ABOVE - (lr + t / 2);
  const lugOut = [[0, 0], [lw, 0], [lw, vPin]];
  for (let i = 1; i < 8; i++) { const a = (Math.PI * i) / 8; lugOut.push([lw / 2 + Math.cos(a) * lw / 2, vPin + Math.sin(a) * lw / 2]); }
  lugOut.push([0, vPin]);
  const lug = (k) => ({ edge: [P(sp - lw / 2, k * h2), P(sp + lw / 2, k * h2)], angle: Math.PI / 2, r: lr, outline: lugOut, holes: [[lw / 2, vPin, SPINDLE.hole]] });
  // walls bent down along the middle section on one side, tight bends; the tab at the AK end
  const wall = (s0, s1) => ({ edge: [P(s0, h1), P(s1, h1)], angle: -Math.PI / 2, r: 0.0005, len: 0.0025 });
  return sheetGeo({ outline: out, t, holes: [P(0, 0).concat(0.0012)], flanges: [
    lug(1), lug(-1),
    wall(sE + 0.003, sp - 0.0055), wall(sp + 0.0055, sp + 0.014),
    { edge: [P(sEnd, -h1), P(sEnd, h1)], angle: -Math.PI / 2, r: 0.0005, len: 0.003 },
  ] });
}

export function buildChanger(kit, { root, update, crG, crA, crN, crAxis }) {
  const { add, part, mat, mats } = kit;
  const steel = mats.steel(), zinc = mats.zinc();
  const gold = mat(0x6e5a26, 0.82, 0.46);
  const cast = mat(0x9fa2a1, 0.6, 0.6); // as the die-cast bracket 171 (index.js)
  const P = CAM_ROCKER.pivot, ax = crAxis.x, az = crAxis.z; // the rocker's axis, horizontal
  const pinY = R_TOP + SPINDLE.above;

  // a vertical plate perpendicular to the rocker's axis, its outline [[across, up]] in metres about (x, z), with holes
  const upright = (parent, outline, t, holes, m, x, y, z) => {
    const g = plate(outline, t, holes, 0.00015); g.rotateX(-Math.PI / 2); // outline z -> up, thickness along -z
    g.rotateY(Math.atan2(ax, az)); // thickness along the axis
    return add(parent, g, m, x, y, z);
  };

  // ---- 174 spindle: fixed, through the rocker's lugs and the support's lugs ----------------------------------
  const p174 = part('rockerSpindle', root, { name: 'Spindle: the cam rocker\'s pivot pin, in two lugs of the bearing support', no: '174 (217 813)' });
  {
    const g = add(p174, new THREE.CylinderGeometry(SPINDLE.r, SPINDLE.r, 2 * SPINDLE.half, 12), steel, P.x, pinY, P.z);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), crAxis);
  }
  // the rocker's own lugs are bent up from its strap (rockerSheet), either side of 171's lugs
  // the bearing support's two lugs (171): from the bearing bracket's underside down to the pin, inside the rocker's lugs
  const p171 = part('camBracket', root); // the bearing support, as index.js names it
  {
    const B = BEARING, ca = Math.cos(B.axis), sa = Math.sin(B.axis), bevel = 0.0003;
    const yT = B.floorY - B.plateT / 2 - bevel - 0.00005;
    // the bearing bracket's underside above (x, z): flat under the bush, then rising (its slanted underside lies
    // lower than the centre line by more than half its thickness), then flat again under the screwed tabs
    const slope = (yT - B.plateY) / (B.rise - B.flat), cosS = 1 / Math.hypot(1, slope);
    const under = (x, z) => {
      const s = Math.abs(x * ca + z * sa), flatB = B.plateY - B.plateT / 2 - bevel;
      if (s <= B.flat) return flatB;
      if (s >= B.rise) return yT - B.plateT / 2 - bevel;
      return Math.max(flatB, B.plateY + slope * (s - B.flat) - (B.plateT / 2 + bevel) / cosS);
    };
    const w = SPINDLE.hanger, cx = -az, cz = ax; // across the axis, horizontal
    for (const sg of [-1, 1]) {
      const d = sg * SPINDLE.hangerAt, x = P.x + ax * d, z = P.z + az * d;
      let top = Infinity; for (const u of [-w / 2, w / 2]) for (const e of [-SPINDLE.hangerT, SPINDLE.hangerT]) top = Math.min(top, under(x + cx * u + ax * e, z + cz * u + az * e));
      top -= 0.0001;
      const h = top - pinY, bot = 0.0021; // from 2.1 mm under the pin's centre up to the bracket
      const out = [[-w / 2, -bot + w / 2]];
      for (let i = 1; i < 8; i++) { const a = Math.PI + (Math.PI * i) / 8; out.push([Math.cos(a) * w / 2, -bot + w / 2 + Math.sin(a) * w / 2]); }
      out.push([w / 2, -bot + w / 2], [w / 2, h], [-w / 2, h]);
      upright(p171, out, SPINDLE.hangerT, [[0, 0, SPINDLE.hole - 0.0001]], cast, x, pinY, z);
    }
  }

  // ---- 177 change bolt, 178 compression spring, 179 bushing, on the platter's axis ---------------------------
  const p179 = part('bushing179', root, { name: 'Bushing on the change bolt, supported by the cam rocker', no: '179 (213 921)' });
  const bush = kit.name('changerBushing', new THREE.Group()); p179.add(bush);
  add(bush, lathe([[BUSH.bore, 0], [BUSH.flange, 0], [BUSH.flange, BUSH.flangeH], [BUSH.r, BUSH.flangeH + 0.0002], [BUSH.r, BUSH.h], [BUSH.bore, BUSH.h], [BUSH.bore, 0]], 24), zinc); // closed: its bore drawn too
  const bush0 = R_TOP;
  const p177 = part('changeBolt', root, { name: 'Change bolt: downward release stroke through the hollow bearing', no: '177 (216 756)' });
  const bolt = kit.name('changerBolt', new THREE.Group()); p177.add(bolt);
  {
    const b = BOLT, c = 0.0003;
    add(bolt, lathe([[0.0001, b.bottom], [b.thin - c, b.bottom], [b.thin, b.bottom + c], [b.thin, b.shoulder], [b.thick, b.shoulder], [b.thick, b.neckY[0] - 0.0002], [b.neck, b.neckY[0]], [b.neck, b.neckY[1]], [b.thick, b.neckY[1] + 0.0002], [b.thick, b.top - c], [b.thick - c, b.top], [0.0001, b.top]], 20), steel);
  }
  const p178 = part('boltSpring178', root, { name: 'Compression spring between the bushing and the change bolt\'s shoulder', no: '178 (213 920)' });
  // Build at its actual working length: scaling a one-metre helix flattened its
  // wire and left the former nominal wire-radius offsets as visible air gaps.
  const springSpan = BOLT.shoulder - (bush0 + BUSH.h);
  const springGeo = helixGeo(springSpan-2*SPRING.wire, SPRING.r, SPRING.turns, SPRING.wire);
  springGeo.computeBoundingBox(); const sb=springGeo.boundingBox;
  springGeo.translate(0,-sb.min.y,0); springGeo.scale(1,springSpan/(sb.max.y-sb.min.y),1);
  const spring = kit.name('changerSpring', add(p178, springGeo, steel));

  // ---- 212 locking slide with its switch spring -------------------------------------------------------------------
  const L = LOCK, dl = Math.hypot(...L.dir), ux = L.dir[0] / dl, uz = L.dir[1] / dl, vx = -uz, vz = ux;
  const at = (s, q) => [ux * s + vx * q, uz * s + vz * q];
  const p212 = part('lockingSlide', root, { name: 'Locking slide, complete: blocks the change bolt in "single"', no: '212 (218 151)' });
  const slide = new THREE.Group(); p212.add(slide);
  // Fig.29 (plain manual Fig.31, p.19): one strap with a tall Z-step. The lower run carries the fork at
  // bolt 177; a riser bent up; the upper run carries the long slot on its guide pin and ends in a small
  // hook turned down beside clip 239 and spring 240. Step height 16 mm (E: the verifier scaled 15-20 mm
  // from the strap width); the fork's plane, the slot's place in plan and the travel are unchanged.
  const H = LOCK.rise, sStep = LOCK.step, bendR = L.t, R = bendR + L.t / 2;
  {
    const h = L.w / 2, g = L.slot, ht = L.wTail / 2, s0 = -L.tines;
    const out = [at(s0, -h), at(s0, -g)];
    for (let i = 1; i < 8; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 8; out.push(at(Math.cos(a) * g, Math.sin(a) * g)); } // the fork's round bottom about the bolt's axis
    out.push(at(s0, g), at(s0, h), at(0.012, h), at(sStep, ht), at(sStep, -ht), at(0.012, -h));
    // the upper run: from the second bend to the end, in the flange's own frame [u across from -ht, v along]
    const v0 = sStep + 2 * R, vEnd = L.len + 0.0005 - v0, U = (q) => q + ht;
    const sl0 = L.pinS - L.travel, slotPts = strap([[U(0), sl0 - v0], [U(0), L.pinS - v0]], 2 * (L.pinR + 0.00025), 8); // the guide slot
    const sheet = sheetGeo({ outline: out, t: L.t, flanges: [{
      edge: [at(sStep, -ht), at(sStep, ht)], angle: Math.PI / 2, r: bendR, len: H - 2 * R, // the riser
      flanges: [{ edge: [[0, H - 2 * R], [L.wTail, H - 2 * R]], angle: -Math.PI / 2, r: bendR, // turned back level: the upper run
        outline: [[0, 0], [L.wTail, 0], [L.wTail, vEnd], [0, vEnd]], holes: [slotPts],
        flanges: [{ edge: [[0, vEnd], [L.wTail, vEnd]], angle: -Math.PI / 2, r: bendR, outline: [[0.0012, 0], [L.wTail - 0.0012, 0], [L.wTail - 0.0012, 0.0025], [0.0012, 0.0025]] }], // the hook, turned down (E)
      }],
    }] });
    add(slide, sheet, gold, 0, L.y, 0);
  }
  // its guide pin, down from the dish floor through the slot in the upper run, with a head under it
  const pGuide = part('lockingSlide', root);
  {
    const [px, pz] = at(L.pinS, 0), bottom = L.y + H - L.t / 2 - 0.0001;
    add(pGuide, new THREE.CylinderGeometry(L.pinR, L.pinR, -0.0115 - bottom, 12), steel, px, (-0.0115 + bottom) / 2, pz);
    add(pGuide, new THREE.CylinderGeometry(0.0022, 0.0022, 0.0006, 16), steel, px, bottom - 0.0003, pz);
  }
  // the switch spring ("Umschaltfeder auf der Sperrschiene", manual p.16): a flat leaf riveted on the lower
  // run, its free end bent up (E: place, length and angle; its contact with 207's raised tab is not modelled)
  const pSw = part('lockingSwitchSpring', slide, { name: 'Switch spring on the locking slide (its raised end clears a switch lever\'s tab)', no: '— (on 212)' });
  {
    const top = L.y + L.t / 2, lt = 0.0003, lw = 0.0022, a0 = 0.002, a1 = 0.011, q = 0.0008;
    const [x0, z0] = at(a0, q);
    add(pSw, new THREE.CylinderGeometry(0.0009, 0.0009, 0.0004, 12), steel, x0, top + lt + 0.0002, z0); // rivet
    const leaf = sheetGeo({ outline: [at(a0 - 0.001, q - lw / 2), at(a1, q - lw / 2), at(a1, q + lw / 2), at(a0 - 0.001, q + lw / 2)], t: lt,
      flanges: [{ edge: [at(a1, q - lw / 2), at(a1, q + lw / 2)], angle: 0.6, r: 0.0008, len: 0.004 }] });
    add(pSw, leaf, steel, 0, top + lt / 2 + 0.00002, 0);
  }

  const tmp = new THREE.Vector3(), normal = new THREE.Vector3();
  const look = { mode: 0, init: false };
  return function updateChanger(dt, s, ctx) {
    const multi = s.mode === 'multi' ? 1 : 0;
    if (!look.init) { look.mode = multi; look.init = true; }
    look.mode += (multi - look.mode) * Math.min(1, dt * 9); // as the tonearm's mode wedge
    const loaded = s.changer ? !s.changer.locked : s.changerLoaded;
    const held = L.travel*look.mode <= L.tines+BOLT.thick || !loaded;
    update(dt, held && loaded ? {...s,changerLoaded:false,changer:s.changer&&{...s.changer,locked:true}} : s, ctx);
    // the locking slide: drawn back clear of the bolt in "multi"
    slide.position.set(ux * L.travel * look.mode, 0, uz * L.travel * look.mode);
    // Intersect the actual tilted upper face with the spindle's fixed axis.
    // The flat flange contacts its uphill edge, rather than penetrating the
    // rocker or acquiring an invented tilt joint of its own.
    tmp.set(crA[0], STRAP_T / 2, crA[1]).applyQuaternion(crG.quaternion).add(crG.position);
    normal.set(0,1,0).applyQuaternion(crG.quaternion);
    const seat = tmp.y + (normal.x*tmp.x + normal.z*tmp.z) / normal.y
      + BUSH.flange * Math.hypot(normal.x,normal.z) / normal.y;
    const stroke = Math.min(0,seat-bush0);
    bush.position.y = bush0 + stroke;
    // Loaded bolt and bushing translate together. Blocked operation leaves the
    // whole rocker neutral upstream; no detached bushing/compression animation.
    bolt.position.y = held ? 0 : stroke;
    spring.position.set(0,bush.position.y+BUSH.h,0);

  };
}

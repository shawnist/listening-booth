// The changer chain as contacts, in plain JavaScript (no three.js), so Node and the drawing share
// one authority. Phase table: contracts/changer-phases.md. Contact with the cycle chain (AK on
// cam 165, and 173 turning 207): contracts/changer--cycle.md.
//
// Plain 1229 service manual pp.13-14 (Fig.22, Fig.24, Fig.28):
//  - cam 165's drop curve AK steers the cam rocker 173 and the change bolt 177; the resulting
//    DOWNWARD movement releases one record through the changer spindle (manual).
//  - only possible with the mode selector at "multi" (locking slide 212 blocks the bolt) (manual).
//  - with no record left on the spindle it stays locked against moving down, so 173 cannot turn
//    207, which stays at "stop" and lets the arm settle on its rest (manual).
//  - "the three supports of the changer spindle" (manual p.15, adjustment of the rocker's stroke).
//
// Everything about the spindle's inside (how far its rod must go down before the supports let the
// bottom record go, the retainers that hold the rest of the stack meanwhile, the weight-sensing
// lock) is NOT in the manual: the manual treats the spindle as a sealed part ("Wechselachse
// austauschen"). Those numbers are labelled E (estimate) below. They are a named input boundary:
// AW3_INSIDE.
//
// What moves what here:
//   AK surface (cycle side) -> 173 follower cap: a stop above the cap. The spindle's rod spring
//   and the stack's weight press 177 down, so 173's far end presses up against AK. 173 turns about
//   pin 174 only as far as AK lets its cap rise AND as far as 177 may go down (lock, 212).
//   177's drop -> the spindle rod -> supports retract and retainers extend (AW3_INSIDE).
//   A record whose supports no longer reach under its hole falls (gravity, air drag) onto the
//   platter, or onto the records already on it.
import { CAM_ROCKER, CAM_R, CAM_Y } from './parts/automatic/place.js';
import { AK_PROFILE, akHeight } from './parts/automatic/changer-profile.js';
import { GEAR, D } from './layout.js';
import { REC_T, Y_REC, Y_MAT } from '../../deck3d/layout.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ramp = (x, a, b) => clamp((x - a) / (b - a), 0, 1);

// ---- rocker 173 about pin 174 (geometry shared with parts/automatic/changer.js and index.js) ----
export const STRAP_T = 0.0016; // the rocker's pressed strap (E)
export const PIN_ABOVE = 0.0026; // pin 174's centre above the strap's top face (E)
export const CAP_R = 0.0013; // the follower cap on 173 that AK bears on (E)
export const BUSH_FLANGE = 0.0034; // bushing 179's flange radius, seated on 173 (E)
// AK's contact point on the cam: 41 deg round from the toothless gap (E, as index.js)
const C = { x: GEAR.camX, z: GEAR.camZ };
const gapAt = Math.atan2(-C.z, -C.x);
export const N173 = { x: C.x + Math.cos(gapAt + 41 * D) * CAM_R.ak, z: C.z + Math.sin(gapAt + 41 * D) * CAM_R.ak };
export const ROCKER = (() => {
  const P = CAM_ROCKER.pivot;
  const crA = [-P.x, -P.z], crN = [N173.x - P.x, N173.z - P.z]; // bolt end, AK end, from the pivot
  const dx = crN[0] - crA[0], dz = crN[1] - crA[1], l = Math.hypot(dx, dz);
  const axis = [-dz / l, 0, dx / l]; // pin 174's axis: horizontal, across the rocker
  const u = [dx / l, dz / l];
  return {
    P, crA, crN, axis, pinOffset: STRAP_T / 2 + PIN_ABOVE,
    armBolt: -(crA[0] * u[0] + crA[1] * u[1]), // bolt side of the pin (m)
    armAK: crN[0] * u[0] + crN[1] * u[1], // AK side of the pin (m)
  };
})();

// Rodrigues: v turned by angle a about the unit axis k
function rot([x, y, z], [kx, ky, kz], a) {
  const c = Math.cos(a), s = Math.sin(a), d = (kx * x + ky * y + kz * z) * (1 - c);
  return [x * c + (ky * z - kz * y) * s + kx * d, y * c + (kz * x - kx * z) * s + ky * d, z * c + (kx * y - ky * x) * s + kz * d];
}
// a point in the rocker's own frame (origin: the pivot at the strap's mid-plane) to the world, at angle a
export function rockerPoint(local, a) {
  const R = ROCKER, pin = [0, R.pinOffset, 0];
  const v = rot([local[0] - pin[0], local[1] - pin[1], local[2] - pin[2]], R.axis, a);
  return [R.P.x + v[0], CAM_ROCKER.y + R.pinOffset + v[1], R.P.z + v[2]];
}
// the rocker group's transform at angle a, for the drawing: { axis, angle, position }
export function rockerTransform(a) {
  const R = ROCKER, off = rot([0, R.pinOffset, 0], R.axis, a);
  return { axis: R.axis, angle: a, position: [R.P.x - off[0], CAM_ROCKER.y + R.pinOffset - off[1], R.P.z - off[2]] };
}
const CAP_LOCAL = [ROCKER.crN[0], CAM_Y.ak - CAM_ROCKER.y - CAP_R, ROCKER.crN[1]];
export const capLocal = () => CAP_LOCAL.slice();

// Gap between the follower cap and AK's underside, cam at theta (deg), rocker at a (rad).
// The cam turns clockwise seen from above; AK's material angle 0 sits at the cap at neutral.
export function akGap(a, theta, profile = AK_PROFILE) {
  const p = rockerPoint(CAP_LOCAL, a);
  const x = p[0] - C.x, z = p[2] - C.z, t = theta * D, c = Math.cos(t), s = Math.sin(t);
  const lx = x * c - z * s, lz = x * s + z * c; // into the cam's own frame
  const phase0 = Math.atan2(N173.z - C.z, N173.x - C.x);
  const deg = (Math.atan2(lz, lx) - phase0) / D;
  return akHeight(deg, profile) - (p[1] + CAP_R);
}
// Bushing 179 rests on 173's tilted top face; its flange bears on the uphill edge. Bolt 177's drop
// below its neutral height, rocker at a.
export function boltDrop(a) {
  const R = ROCKER, top = rockerPoint([R.crA[0], STRAP_T / 2, R.crA[1]], a);
  const n = rot([0, 1, 0], R.axis, a);
  const seat = top[1] + (n[0] * top[0] + n[2] * top[2]) / n[1] + BUSH_FLANGE * Math.hypot(n[0], n[2]) / n[1];
  return (CAM_ROCKER.y + STRAP_T / 2) - seat;
}
// The rocker's pose: as far as AK lets the cap rise and the bolt may go down (dropLimit, m).
export function rockerPose(theta, dropLimit = Infinity, profile = AK_PROFILE) {
  const ok = (a) => akGap(a, theta, profile) >= 0 && boltDrop(a) <= dropLimit + 1e-9;
  let lo = 0, hi = 0.3;
  if (dropLimit <= 0) hi = 0; // bolt held (lock, 212): the rigid rocker stays at neutral
  else if (ok(hi)) lo = hi;
  if (hi > lo) for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  const gap = akGap(lo, theta, profile);
  return { angle: lo, drop: Math.max(0, boltDrop(lo)), gap, akContact: gap < 2e-6, held: gap >= 2e-6 && lo < 0.3 };
}

// ---- AW 3 changer spindle (213 895; the text calls it AU 3) ------------------------------------
// Heights in metres above the record surface Y_REC (deck3d/layout.js).
export const AW3 = {
  r: 0.0035, // spindle radius: 7 mm, the record's 7.24 mm hole fits over it (standard hole)
  holeR: 0.00362, // record centre hole 7.24 mm (IEC 60098 nominal; standard)
  support: 0.0445, // top of the three supports, where the bottom record rests (E, photo P4)
  top: 0.078, // spindle top (E, reviewer re-measure)
  recordT: REC_T, // record thickness at the label (E, deck3d REC_T)
};
// AW3_INSIDE: the sealed spindle's inside. ALL ESTIMATES (no source shows the inside).
export const AW3_INSIDE = {
  supportOut: 0.0016, // how far each support stands out from the spindle at rest (E)
  supportRetract: [0.0006, 0.0011], // rod drop over which the supports draw in (E): let go at about 1.06 mm
  retainerOut: 0.0016, // how far the retainers stand out once extended (E)
  retainerExtend: [0.00015, 0.0005], // rod drop over which the retainers come out (E): hold from about 0.18 mm
  flip207: 0.00125, // rod drop at which 173's tab has carried 207 over to "start" (E)
  // With the AK relief and lever ratio as drawn the full stroke is about 1.55 mm.
  sense: 0.00005, // rod within this of neutral: the lock can catch or let go (E)
};
const CLEAR = AW3.holeR - AW3.r; // a support/retainer standing out less than this lets a hole by
export const supportOut = (d) => AW3_INSIDE.supportOut * (1 - ramp(d, ...AW3_INSIDE.supportRetract));
export const retainerOut = (d) => AW3_INSIDE.retainerOut * ramp(d, ...AW3_INSIDE.retainerExtend);
export const RECORD_R = { 7: 0.0875, 10: 0.125, 12: 0.1508 }; // 175, 250, 301.6 mm (spec.js)
const G = 9.81, VT = 5.1; // gravity; terminal velocity of a flat 140 g LP, 0.5*rho*Cd*A*v^2 = m*g (E: Cd 1.2)

export function createChanger() {
  return {
    supportHeight: AW3.support, // active assembly support top, relative to Y_REC
    spindle: [], // records on the spindle, bottom first: { id, size }
    on: 'supports', // what carries the spindle's stack: 'supports' | 'retainers'
    falling: [], // { rec, y (underside above Y_REC), v (m/s, down) }
    pile: [], // records dropped onto the platter, bottom first
    locked: true, // the spindle's lock: no record weight on the supports
    rod: 0, // the spindle rod's (and bolt 177's) drop, m
    rocker: { angle: 0, drop: 0, gap: 0, akContact: true, held: false },
    flipped: false, // 173 has carried 207 over in this stroke
    nextId: 1,
  };
}

// The record from the shelf on the platter: false (none), true (one of unknown size: covers every radius)
// or its outer radius in metres (the page passes side.fmt.disc).
const shelfRadius = (shelf) => (shelf === true ? Infinity : shelf > 0 ? shelf : 0);
// The platter's top surface under the pile: the shelf record (base 0) or the bare mat.
export const baseTop = (hasRecord) => (hasRecord ? 0 : Y_MAT - Y_REC);
// The surface the stylus meets at radius r, above Y_REC: the top of the changer's pile where any of its
// records reaches past r (records lie flat on each other, on the shelf record if there is one), else the
// shelf record where it reaches past r, else the bare mat.
export function pileTop(ch, hasRecord, r = 0) {
  const base = baseTop(hasRecord);
  if (ch.pile.some((rec) => RECORD_R[rec.size] > r)) return base + ch.pile.length * AW3.recordT;
  return r < shelfRadius(hasRecord) ? 0 : Y_MAT - Y_REC;
}
// Where each record on the spindle is: underside above Y_REC.
export function spindleHeights(ch) {
  const lift = ch.on === 'retainers' ? AW3.recordT : 0;
  return ch.spindle.map((_, i) => (ch.supportHeight ?? AW3.support) + lift + i * AW3.recordT);
}

// One step of the stroke: theta (deg) of a turning cam, or 0 at neutral. blocked: 212 in "single".
// Returns { flip } when 173 has carried 207 over to "start" during this step.
export function stepStroke(ch, theta, { blocked = false, profile = AK_PROFILE, model = null } = {}) {
  // the lock catches or lets go only with the rod at neutral, by the weight on the supports
  const sense = model?.scenario.sense ?? AW3_INSIDE.sense;
  if (ch.rod <= sense) ch.locked = ch.spindle.length === 0;
  const limit = blocked || ch.locked ? 0 : Infinity;
  const pose = model?.pose(theta, {mode:blocked?'single':'multi',loaded:!ch.locked});
  ch.pose = pose ?? null;
  // An infeasible component scenario cannot release a record. Keep its failed
  // pose available so the integrator can stall/report it rather than animate on.
  if (pose && !pose.valid) return {flip:false,invalid:true};
  ch.rocker = pose ?? rockerPose(theta, limit, profile);
  ch.rod = ch.rocker.drop;
  let flip = false;
  //207's mating contour is still an explicit threshold boundary. Support
  // release below, however, uses the installed CAD's finite radial surfaces.
  if ((pose ? pose.flip : ch.rod >= AW3_INSIDE.flip207) && !ch.flipped) { ch.flipped = true; flip = true; }
  if (ch.rod <= sense) ch.flipped = false;
  const holdS = pose ? pose.holdSupports : supportOut(ch.rod) > CLEAR;
  const holdR = pose ? pose.holdRetainers : retainerOut(ch.rod) > CLEAR;
  if (ch.on === 'supports' && ch.spindle.length) {
    if (!holdS) {
      // the supports have drawn in under the bottom record: it falls. The retainers, already out
      // between it and the next, keep the rest; without them the whole stack would go.
      const fall = holdR ? ch.spindle.splice(0, 1) : ch.spindle.splice(0);
      const ys = ch.supportHeight ?? AW3.support;
      fall.forEach((rec, i) => ch.falling.push({ rec, y: ys + i * AW3.recordT, v: 0 }));
      ch.on = ch.spindle.length ? 'retainers' : 'supports';
    }
  } else if (ch.on === 'retainers') {
    if (!holdR) ch.on = 'supports'; // the rest of the stack settles one record down onto the supports
    if (!holdR && !holdS) { // never on a working stroke: retainers in before supports out
      ch.falling.push(...ch.spindle.splice(0).map((rec, i) => ({ rec, y: (ch.supportHeight ?? AW3.support) + i * AW3.recordT, v: 0 })));
    }
  }
  if (ch.rod <= sense) ch.locked = ch.spindle.length === 0; // back at neutral: the lock judges again
  return { flip };
}

// Falling records: gravity with air drag until they meet the pile (dt: mechanism seconds).
export function stepFalling(ch, dt, hasRecord) {
  for (const f of ch.falling) {
    f.v += (G - G * (f.v / VT) ** 2) * dt;
    f.y -= f.v * dt;
  }
  // lowest first: each lands on whatever is on the platter by then
  ch.falling.sort((a, b) => a.y - b.y);
  for (let i = 0; i < ch.falling.length;) {
    const f = ch.falling[i], top = pileTop(ch, hasRecord, 0);
    if (f.y <= top) { ch.pile.push(f.rec); ch.falling.splice(i, 1); } else i++;
  }
}

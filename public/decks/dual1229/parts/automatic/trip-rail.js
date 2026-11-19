// Trip chain: segment201 -> rigid rail253 -> shut-off lever162 on the cam -> dog M on the hub pinion.
// Plain JavaScript (no three.js) so the mechanism, the renderer and Node tests share one solution.
//
// Sources (cycle chain phase table: contracts/cycle-phases.md, rows T1-T6):
//  - manual1229 p.13 / Q-manual p.13 Fig.21 (a-c): the arm's travel carries162 toward the eccentric dog
//    "by means of the shut-off slide (253)", the dog pushes162 back once a turn while the arm advances
//    one groove; the run-out's larger advance lets the dog catch162 and drive cam165 into mesh. [manual]
//  - manual1229 p.7 (step 7) and the parts list: 253 is held on201 by the slide washer 271 (Gleitscheibe)
//    and lock washer272 (Idealscheibe). A slide washer under a spring washer is a friction slip joint:
//    the rail is carried by the segment until162 is blocked by the dog, then it slips. [manual; reading]
//  - manual1229 p.11: after transport the Absteller can sit anywhere; one start with the arm locked on its
//    rest re-adjusts it automatically. This is why the slip is calibrated at the rest pose. [manual]
//  - Layer plan (place.js): the rail lies above the dish floor,162 hangs under the cam rim, so the rail's
//    bent tip must drop through an aperture in the floor. That aperture is the rail's lateral guide G. [estimate]
//
// Kinematics (no prescribed yaw, no target):
//  rail axis   = the line from the 201 pin through the fixed aperture G (pin-in-slot through a fixed guide);
//  tab (hook)  = eye + d * axis, where d is the friction-held slip state;
//  162 angle g = friction-held on pin163; the tab's eye-side face pulls the tail toward the eye,
//                which turns the nose toward the dog; the dog's surface pushes the nose back, and the tail
//                then pushes the tab, slipping the rail (d grows) at 271;
//  capture     = when the dog's rising surface first meets the nose deeper than CATCH below the dog's
//                outer envelope, it carries162 (and the cam) instead of pushing it back. [estimate depth]
import { GEAR, PIVOT } from '../../layout.js';
import { REST_DATUM, R_OUT_MAX } from '../../spec.js';
import { cueArmAngle } from '../../cue-geometry.js';
import { DOG, SHUTOFF_LEVER as SL, SHUTOFF_SLIDE as SO, TRIP_LINK } from './place.js';

const D = Math.PI / 180, TAU = Math.PI * 2;
const IN_R = 0.045; // mechanism.js IN_R (not imported: mechanism imports this file)
const rot = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-12, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };

// ---- estimates (each one named; see contracts/cycle-phases.md and MEASUREMENTS.md) -----------------------
export const TRIP = Object.freeze({
  clear: 0.00015, // running clearance kept between drawn surfaces (E)
  tabT: SO.t, // the bent tab is the rail's own 1 mm sheet (E)
  aperture: 0.004, // half-length of the floor aperture along the rail: the tab's slip range (E)
  lateral: 0.0035, // half-width over which the tab still bears on the tail strap (E)
  catchDepth: 0.000120, // nose depth under the dog's envelope at which the dog carries162 (E: set between the widest track gap and the shallowest run-out the cutter makes; see contracts/cycle-phases.md T5)
});

// Segment201 pin datum, unchanged from the earlier pass (estimated; place.js TRIP_LINK).
// The angular datum is REST_DATUM (spec.js): the rail and segment are rigid on the arm, wherever it parks.
const armAng = (r) => cueArmAngle(Math.max(0.02, Math.min(R_OUT_MAX, r)));
const aIn = armAng(IN_R), aRest = armAng(REST_DATUM), aMid = (aIn + aRest) / 2;
const swingLo = Math.min(armAng(0.02) - aMid, aIn - aMid, aRest - aMid);
export const LINK_TAB = TRIP_LINK.clearDeg * D - swingLo, LINK_R = TRIP_LINK.pinR;
export function railEye(armA) { const a = armA - aMid + LINK_TAB; return [PIVOT.x + Math.cos(a) * LINK_R, PIVOT.z + Math.sin(a) * LINK_R]; }

// ---- 162 on the cam (cam frame: radii and angles from place.js SHUTOFF_LEVER) ---------------------------
const C = [GEAR.camX, GEAR.camZ], gapAt = Math.atan2(-C[1], -C[0]);
const polar = (deg, r) => [Math.cos(gapAt + deg * D) * r, Math.sin(gapAt + deg * D) * r];
const PIV = polar(SL.pivot.deg, SL.pivot.r), NOSE = polar(SL.nose.deg, SL.nose.r), TAIL = polar(SL.tail.deg, SL.tail.r);
export const LEVER = { pivot: PIV, nose: [NOSE[0] - PIV[0], NOSE[1] - PIV[1]], tail: [TAIL[0] - PIV[0], TAIL[1] - PIV[1]], half: SL.w / 2 };
// a lever point (relative to pin163) in the world, the lever turned by g (atan2 sense: +g turns the nose
// toward the dog) and the cam at th degrees (the renderer's camSpin.rotation.y = th*D)
export function leverWorld(p, g, th) {
  const [x, z] = rot(p[0], p[1], g), [wx, wz] = rot(PIV[0] + x, PIV[1] + z, -th * D);
  return [C[0] + wx, C[1] + wz];
}

// ---- dog M: an eccentric disc on the pinion, centre `ecc` off the platter axis --------------------------
// Its angular datum on the pinion is not in any source. PHASE0 puts the eccentric's low side under the
// nose at whole platter turns, so "the dog is at the lever" means platterTurns is a whole number (E).
let PHASE0 = 0;
export const dogCentre = (ph) => [Math.cos(ph + PHASE0) * DOG.ecc, Math.sin(ph + PHASE0) * DOG.ecc];
const reach = DOG.r + LEVER.half;
function dogGap(g, th, ph) { // clearance between the dog's rim and the nearer lever strap (negative: overlap)
  const [cx, cz] = dogCentre(ph), o = leverWorld([0, 0], g, th), n = leverWorld(LEVER.nose, g, th), t = leverWorld(LEVER.tail, g, th);
  return Math.min(segDist(cx, cz, o[0], o[1], n[0], n[1]), segDist(cx, cz, o[0], o[1], t[0], t[1])) - reach;
}
// The largest g with the lever clear of the dog, never past162's swing stop. Monotone in g over the range.
export function dogLimit(th, ph, lo = -0.5, hi = G_STOP) {
  if (dogGap(hi, th, ph) >= TRIP.clear) return hi;
  if (dogGap(lo, th, ph) < TRIP.clear) return lo;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (dogGap(m, th, ph) >= TRIP.clear) lo = m; else hi = m; }
  return lo;
}
// How far the nose sits inside the circle the dog's rim sweeps (m; <= 0: clear of every dog phase).
export function noseDepth(g, th) {
  const o = leverWorld([0, 0], g, th), n = leverWorld(LEVER.nose, g, th);
  return DOG.ecc + reach + TRIP.clear - segDist(0, 0, o[0], o[1], n[0], n[1]);
}
// The g that puts the nose just on that swept circle (bisection over the working range).
function envelopeG(th) { let lo = -0.5, hi = 0.5; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (noseDepth(m, th) <= 0) lo = m; else hi = m; } return lo; }
// 162's swing toward the dog ends where its nose would meet the dog's low side (E: no source shows the
// stop; a lever that could swing further would only be held by the dog itself).
let G_STOP = 0.5;
{ let lo = -0.5, hi = 0.5; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (noseDepth(m, 0) <= 2 * DOG.ecc) lo = m; else hi = m; } G_STOP = lo; }
export const G_MAX = G_STOP;
{ // PHASE0: the dog phase at which g may go furthest (low side under the nose) becomes phase 0
  const gE = envelopeG(0), n = leverWorld(LEVER.nose, gE, 0); PHASE0 = Math.atan2(n[1], n[0]) + Math.PI;
  // ...then shifted so the rising surface first reaches a lever held at its stop exactly at phase 0:
  // a lever pressed by248 while the surface recedes is carried at the whole turn.
  let lo = 0, hi = Math.PI; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (dogLimit(0, m) >= G_STOP) lo = m; else hi = m; }
  PHASE0 += lo;
}
export const dogPhase0 = () => PHASE0;

// ---- rail253: eye on the201 pin, axis through the floor aperture G, tab at distance d ------------------
const tailFace = (g, th) => leverWorld(LEVER.tail, g, th);
// Calibration (manual p.11: one start with the arm locked on its rest): the arm on its rest, the cam at
// neutral, the nose just on the dog's envelope, the tab bearing on the tail.
const G_CAL = envelopeG(0), EYE_REST = railEye(armAng(REST_DATUM)), TAIL_CAL = tailFace(G_CAL, 0);
const U_REST = (() => { const dx = TAIL_CAL[0] - EYE_REST[0], dz = TAIL_CAL[1] - EYE_REST[1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; })();
const BEAR = LEVER.half + TRIP.tabT / 2 + TRIP.clear; // tail centreline to the tab's centre plane when bearing
export const APERTURE = [TAIL_CAL[0] + U_REST[0] * BEAR, TAIL_CAL[1] + U_REST[1] * BEAR]; // G (E)
export const RAIL_LENGTH = Math.hypot(APERTURE[0] - EYE_REST[0], APERTURE[1] - EYE_REST[1]); // eye to tab, slot centred (E)
export const D_CAL = RAIL_LENGTH;

export function railAxis(armA) {
  const e = railEye(armA), dx = APERTURE[0] - e[0], dz = APERTURE[1] - e[1], l = Math.hypot(dx, dz);
  return { eye: e, u: [dx / l, dz / l], toG: l, yaw: Math.atan2(dz, dx) };
}
// Where the rail is: its eye-hole centre slides along the axis by (d - RAIL_LENGTH) from the pin.
export function railPose(armA, d = D_CAL) {
  const a = railAxis(armA), s = d - RAIL_LENGTH;
  return { ...a, slot: s, origin: [a.eye[0] + a.u[0] * s, a.eye[1] + a.u[1] * s], tab: [a.eye[0] + a.u[0] * d, a.eye[1] + a.u[1] * d], length: RAIL_LENGTH, inAperture: Math.abs(d - a.toG) <= TRIP.aperture };
}
// The tail measured along the rail axis from the eye, and across it. The tab bears on the tail only while
// the tail lies within `lateral` of the axis (when the cam turns162 away it does not).
function tailAlong(ax, g, th) { const t = tailFace(g, th), dx = t[0] - ax.eye[0], dz = t[1] - ax.eye[1]; return { along: dx * ax.u[0] + dz * ax.u[1], across: Math.abs(-dx * ax.u[1] + dz * ax.u[0]) }; }
// The g at which the tail bears on a tab at d (tail along + BEAR = d). along falls as g grows.
function gForTab(ax, d, th, lo = -0.5, hi = 0.5) { for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (tailAlong(ax, m, th).along + BEAR > d) lo = m; else hi = m; } return hi; }

export function initialTripState() { return { g: G_CAL, d: D_CAL, pushing: false, blocked: false, depth: 0, captured: false, lastLimit: null }; }

// One contact step. st: { g, d, pushing, lastLimit }. in: { armA, th (cam deg), ph (platter rad),
// press (start lever 248 pressing162 toward the dog), camFree (cam at neutral, out of mesh) }.
// Returns 'capture' when the dog carries162.
export function stepTrip(st, { armA, th, ph, press = false, camFree = true }) {
  const ax = railAxis(armA);
  const limit = dogLimit(th, ph);
  const along = tailAlong(ax, st.g, th), bears = along.across <= TRIP.lateral;
  // 1. the tab pulls the tail: 162 turns until the tail no longer passes the tab
  if (bears && along.along + BEAR > st.d) st.g = gForTab(ax, st.d, th);
  // 2. the start lever's spring presses162 as far toward the dog as the dog allows (manual p.11)
  if (press && camFree) st.g = Math.max(st.g, limit);
  // 3. the dog's surface: it holds the lever back; the tail then pushes the tab and the rail slips at271.
  // A lever pressed by248 onto the dog's surface (not held by its own stop) rests on the dog: in contact.
  const resting = press && camFree && limit < G_STOP && st.g >= limit - 1e-12;
  const blocked = st.g > limit || resting;
  const depth = noseDepth(st.g, th);
  if (blocked) {
    st.g = Math.min(st.g, limit);
    const a2 = tailAlong(ax, st.g, th);
    if (a2.across <= TRIP.lateral && a2.along + BEAR > st.d) st.d = a2.along + BEAR;
  }
  // the dog advances on the nose when its limit is falling while it bounds the lever
  const pushing = camFree && blocked && st.lastLimit !== null && limit < st.lastLimit;
  // Capture needs an impact: the rising surface striking a nose that was free a moment before. A nose that
  // already rests on the dog (pulled onto a standing dog, or riding it) is pushed out along the surface
  // instead of being struck, so it is not caught.
  const impact = pushing && !st.blocked;
  let result = null;
  if (impact && depth >= TRIP.catchDepth) { st.captured = true; result = 'capture'; }
  st.pushing = pushing; st.blocked = blocked; st.lastLimit = limit; st.depth = depth;
  return result;
}

// Diagnostic for tests and the readout: how far the rail tab still sits from the tail at an arm angle.
export function tabSlack(st, armA, th = 0) { const ax = railAxis(armA), a = tailAlong(ax, st.g, th); return st.d - (a.along + BEAR); }
export const calibration = () => ({ gCal: G_CAL, eyeRest: EYE_REST, tailCal: TAIL_CAL, aperture: APERTURE, length: RAIL_LENGTH });

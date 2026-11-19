// Arm chain: the dial settings as forces on the arm (arm-phases A4, A5).
//
// Sources (manual = M-DE, reference/sources/manual1229.txt):
//   - Tracking force: the scale on spring housing 77 reads the force at the stylus in pond (p),
//     0-3 p (manual p.7). 1 p = 1 gram-force = 9.80665 mN (definition).
//   - Bearing friction referred to the stylus: vertical < 0.007 p, horizontal < 0.015 p (manual p.2/p.7).
//   - Anti-skating: the dial is set to the tracking force in use, red scale for conical styli, white
//     for elliptical. At the factory the device is adjusted "optimal" for those styli (manual p.8).
//     So setting X on a scale means the counter-moment for that stylus type tracking at X p.
//   - Anti-skating at 0 acts through the pivot (manual p.8 Fig.14a, p.16); the moment opposes skating
//     (Fig.14b/c). A balanced arm at anti-skating 0.5 must glide outward unhindered (manual p.9).
//   - The record turns clockwise seen from above (all three speeds).
//
// Estimates (no source in reference/sources):
//   - GROOVE_MU, the stylus-in-groove drag coefficient per stylus type (it sets the size of the
//     skating force: about 10 % of tracking force for conical at offset 25 deg, a common textbook figure).
//   - CAL_R, the radius where the factory adjustment is exact. The cam/spring geometry
//     (anti-skate-contact.js) decides how the counter-moment varies away from it, at a constant
//     spring tension: the spring rate is unknown (MEASUREMENTS arm-4).
//   - YAW_INERTIA, CUE_CAP_MU.
import { SPEC } from './spec.js';
import { PIVOT } from './layout.js';
import { skatingPose, skatingMoment as springLever, skateCamTurn, SKATE_ANCHOR } from './anti-skate-contact.js';

export const P = 9.80665e-3; // newtons per pond
export const BEARING_FRICTION = Object.freeze({ vertical: 0.007 * P, horizontal: 0.015 * P }); // manual p.2, at the stylus
export const GROOVE_MU = Object.freeze({ red: 0.24, white: 0.30 }); // E: drag/tracking force, conical / elliptical
export const CAL_R = 0.100; // E
export const YAW_INERTIA = 7.8e-4; // E: kg m^2 about the vertical axis (12 g effective at 222 mm plus an 80 g weight at 49 mm)
export const CUE_CAP_MU = 0.5; // E: rubber cap 198 on body 73 (the rebuild guide calls it the "cueing clutch")

const L = SPEC.armL, D = Math.hypot(PIVOT.x, PIVOT.z);
// The arm's yaw (plan angle of pivot -> stylus, as arm.js angleFor) for a stylus radius, and back.
export function armAngleFor(r) {
  const a = (r * r - L * L + D * D) / (2 * D), h = Math.sqrt(Math.max(0, r * r - a * a));
  return Math.atan2((a - D) * PIVOT.z / D + h * PIVOT.x / D, (a - D) * PIVOT.x / D - h * PIVOT.z / D);
}
export const radiusForAngle = (a) => Math.hypot(PIVOT.x + L * Math.cos(a), PIVOT.z + L * Math.sin(a));
// +1 when a positive moment (increasing yaw angle) moves the stylus outward, else -1.
export const outwardSign = (r) => { const a = armAngleFor(r); return Math.sign(radiusForAngle(a + 1e-5) - radiusForAngle(a)) || 1; };

// Skating: the groove drags the stylus along the record's motion; its moment about the pivot
// (N m, positive = increasing yaw angle). Clockwise from above: velocity direction (-z, x).
export function skatingMoment(r, trackingP, stylus = 'red') {
  const a = armAngleFor(r), sx = PIVOT.x + L * Math.cos(a), sz = PIVOT.z + L * Math.sin(a);
  const v = Math.hypot(sx, sz), dx = -sz / v, dz = sx / v, drag = GROOVE_MU[stylus === 'white' ? 'white' : 'red'] * trackingP * P;
  const rx = sx - PIVOT.x, rz = sz - PIVOT.z;
  return (rx * dz - rz * dx) * drag;
}
// The spring's lever arm (m per newton of tension) at the dial setting and arm radius, from the
// modelled cam 258, lever 267 and anchor: the same geometry the renderer draws.
const poses = new Map(); // the dial has 31 settings per scale: solve each cam/follower contact once
const camPose = (setting, scale) => {
  const k = `${setting}|${scale}`;
  if (!poses.has(k)) poses.set(k, skatingPose(skateCamTurn(setting, scale)));
  return poses.get(k);
};
export function antiSkateLever(setting, scale, r) {
  const pose = camPose(setting, scale);
  return springLever(pose, armAngleFor(r) + SKATE_ANCHOR.turn, SKATE_ANCHOR.pinR).torquePerNewton;
}
// Spring tension (N) at a dial setting: the factory adjustment makes the counter-moment equal the
// skating moment of the matching stylus at CAL_R (manual p.8). 0 at setting 0.
export function antiSkateTension(setting, scale) {
  if (!(setting > 0)) return 0;
  const lever = antiSkateLever(setting, scale, CAL_R);
  return Math.abs(lever) < 1e-6 ? 0 : -skatingMoment(CAL_R, setting, scale) / lever;
}
export const antiSkateMoment = (setting, scale, r) => antiSkateTension(setting, scale) * antiSkateLever(setting, scale, r);

// Everything the dials put on the arm at stylus radius r. inGroove: the stylus is playing.
export function armForces({ trackingForce = 0, antiSkate = 0, skateScale = 'red', r = CAL_R, inGroove = false }) {
  const trackingN = trackingForce * P;
  const skate = inGroove ? skatingMoment(r, trackingForce, skateScale) : 0;
  const anti = antiSkateMoment(antiSkate, skateScale, r);
  return {
    trackingN, // down at the stylus, from spiral spring 77 (balanced arm)
    pitchTorque: trackingN * L, // about the horizontal bearing axis
    sinks: trackingN > BEARING_FRICTION.vertical, // overcomes the vertical bearing friction (p.2)
    skatingM: skate, antiSkateM: anti, netYawM: skate + anti,
    frictionYawM: BEARING_FRICTION.horizontal * L, // the most the horizontal bearing holds (p.2)
    outward: outwardSign(r),
    // net sideways force at the stylus the groove walls must carry while playing (N, + outward)
    grooveSideN: inGroove ? outwardSign(r) * (skate + anti) / L : 0,
  };
}

// One step of a free arm's yaw: no hand, no groove, not carried by the cam, not on its rest.
// Lifted on the cue, cap 198 holds the arm by friction under the arm's load on it (CUE_CAP_MU);
// floating (no support, tracking force below the vertical friction) only the bearing holds it.
// Returns { r, rate }. rate: yaw angle per second.
export function freeYawStep(r, rate, dt, f, onCap) {
  const hold = f.frictionYawM + (onCap ? CUE_CAP_MU * f.trackingN * L : 0);
  const m = f.netYawM;
  if (rate === 0 && Math.abs(m) <= hold) return { r, rate: 0 };
  const dir = rate !== 0 ? Math.sign(rate) : Math.sign(m);
  let next = rate + (m - dir * hold) / YAW_INERTIA * dt;
  if (rate !== 0 && Math.sign(next) !== Math.sign(rate)) next = 0; // friction stops it, never reverses it
  const a = armAngleFor(r) + next * dt;
  return { r: radiusForAngle(a), rate: next };
}

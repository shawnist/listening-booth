// Arm chain: the single/multi arm height, from a contact, not from the mode name.
//
// Sources:
//   - M-DE p.7 Fig.12 (assembly order): spring 78, bearing sleeve 69, mode lever 70, cover 68, nut 71.
//     Lever 70 sits on the arm's bearing sleeve, under cover 68, directly below the gimbal (manual).
//   - MAARC rebuild guide (reference/sources/rebuild.pdf, "Caution"): forcing a stuck mode lever
//     "will break the plastic ears off the bottom of the gimbal ring". So lever 70 bears on ears on
//     the underside of the (fixed-yaw) outer gimbal assembly 60 (forum/first-hand repair).
//   - DECISIONS D17, citing the owner's manual p.11: "multi" raises the whole arm 5 mm. The owner's
//     manual is NOT in reference/sources/, so this number is checked only through D17
//     (MEASUREMENTS arm-3 would settle it).
//   - M-DE p.7: in "single" the arm cannot fall out when the deck is turned over, and in "multi"
//     ring 60 turns anticlockwise to a stop and lifts out. So something lies OVER the ears in
//     single, like a bayonet. That retaining surface is NOT modelled: these ramps only support
//     the ears from below. It is a missing contact (arm-phases.md A6).
//
// What is modelled: two ears hang from the outer gimbal assembly, fixed in yaw. Each has a round
// tip (a short cylinder lying radially). Lever 70 carries two ramps on its top face. Turning 70
// slides a ramp under each ear; the arm's weight keeps the ears on the ramps, so the arm height is
// whatever height the ramp material holds the ear tip at. The mode name never sets a height.
// Named input boundary: the operator's hand turns 70 (its two detent notches, 81/82, hold it).
//
// Estimates (no source gives them): ear radius and angle, tip radius, ramp radii, dwell and slope
// spans, ramp base thickness. Only the 5 mm rise between the two dwells is from a source.
import { SPEC } from './spec.js';
import { MODE_SELECTOR as MS } from './parts/tonearm/place.js';

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const MODE_RAMP = Object.freeze({
  // ears (on the rising gimbal assembly; fixed in yaw): plan angle of the first ear, the second at +180 deg
  earAngle: MS.dir * Math.PI / 180 + Math.PI / 2, // E
  earR: 0.0085, // E: radius of the ear's centre line from the arm axis
  tipR: 0.0008, // E: radius of the ear's rounded tip
  earW: 0.0026, // E: radial length of the ear tab
  // ramps (on lever 70's top face), in 70's own angle relative to the ear at "single"
  rIn: 0.0070, rOut: 0.0100, // E: radial band
  base: 0.0006, // E: ramp block thickness under the low dwell
  rise: SPEC.multiRaise, // manual (owner's manual p.11, D17): 5 mm between the dwells
  lowDwell: [-0.15, 0.25], // E: radians, 70's frame relative to the ear at "single"
  highDwell: [-(MS.travel + 0.20), -(MS.travel - 0.20)], // E
  samples: 160,
  y0: MS.y + MS.t, // the ramps stand on 70's top face (place.js; estimate)
});

// The ramp's top surface along its arc: [[u, h]] with u in radians (70's frame, relative to the
// ear's position at "single") and h in metres above the ramp base. One polyline is the drawn solid
// and the contact surface.
export function rampProfile(g = MODE_RAMP) {
  const [u0, u1] = [g.highDwell[0], g.lowDwell[1]], [s0, s1] = [g.highDwell[1], g.lowDwell[0]];
  const pts = [];
  for (let i = 0; i <= g.samples; i++) {
    const u = u0 + (u1 - u0) * i / g.samples;
    let k; // 0 at the low dwell, 1 at the high dwell, a smooth (cosine) slope between
    if (u >= s1) k = 0; else if (u <= s0) k = 1; else k = 0.5 - 0.5 * Math.cos(Math.PI * (s1 - u) / (s1 - s0));
    pts.push([u, g.base + g.rise * k]);
  }
  return pts;
}
export const RAMP_PROFILE = Object.freeze(rampProfile().map(Object.freeze));

// Signed distance from a point (s along the arc in metres, y) to the ramp polyline, negative when
// the point is under the ramp's material.
function signedDistance(s, y, pts, r) {
  let best = Infinity, under = -Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0] * r, ay = pts[i - 1][1], bx = pts[i][0] * r, by = pts[i][1], dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((s - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(s - ax - t * dx, y - ay - t * dy));
    if ((s - ax) * (s - bx) <= 0) under = Math.max(under, ay + (s - ax) / (dx || 1) * dy);
  }
  return y < under ? -best : best;
}

// The height (above the ramp base) at which an ear tip rests when it stands over 70's angle u.
// The tip's circle is lowered until it touches the ramp material: a finite contact, solved by
// bisection. Returns null when no ramp material is under the ear (the arm would have no support).
export function earRestHeight(u, g = MODE_RAMP, pts = RAMP_PROFILE) {
  const r = g.earR, s = u * r;
  const sMin = pts[0][0] * r, sMax = pts[pts.length - 1][0] * r;
  if (s < sMin || s > sMax) return null;
  let lo = -0.01, hi = 0.03; // tip centre heights: lo inside the material, hi clear of it
  if (signedDistance(s, lo, pts, r) - g.tipR > 0 || signedDistance(s, hi, pts, r) - g.tipR < 0) return null;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (signedDistance(s, mid, pts, r) - g.tipR > 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2 - g.tipR; // the tip's lowest point
}

// The operator's control input: 70's turn in each detent notch (place.js MODE_SELECTOR.travel; E).
export const selectorTurn = (mode) => (mode === 'multi' ? MS.travel : 0);

// The whole arm assembly's height above its "single" seat, for lever 70 turned by `turn` radians.
// The ears are fixed in yaw; 70 turned by `turn` puts ramp angle u = -turn under the first ear (and
// the same on the second ramp at +180 deg). The arm rests on whichever ear the ramps hold higher.
export function modeHeight(turn, g = MODE_RAMP, pts = RAMP_PROFILE) {
  const seat = earRestHeight(0, MODE_RAMP, RAMP_PROFILE);
  const h = earRestHeight(-turn, g, pts);
  if (h === null) return { raise: null, valid: false, tipY: null, turn };
  return { raise: h - seat, valid: true, tipY: g.y0 + h, turn };
}
// World plan angles of the two ears (fixed).
export const earAngles = (g = MODE_RAMP) => [g.earAngle, wrap(g.earAngle + Math.PI)];
// Absolute tip height of an ear in "single" (y, metres): where the ear's tip is drawn on the gimbal assembly.
export const EAR_TIP_SINGLE_Y = MODE_RAMP.y0 + earRestHeight(0);

const cache = new Map();
// Arm assembly raise for a mode name, through the contact (cached per turn).
export function modeRaiseFor(mode) {
  const turn = selectorTurn(mode);
  if (!cache.has(turn)) {
    const m = modeHeight(turn);
    if (!m.valid) throw new RangeError('Mode ramp gives the arm no support');
    cache.set(turn, m.raise);
  }
  return cache.get(turn);
}
export { TAU };

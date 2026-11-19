// Manual cue (contracts/cue-phases.md; arbiter ruling 2026-11-15, option 3):
// hand -> handle64/cam220 (one shaft) -> 220 on lever270's paddle (finite contact,
// cue-linkage.js) -> 270 rocks about234 -> 270's hook, reaching through184's
// semicircular slot (MAARC), bears on the underside of balance plate243 -> 243 lifts
// off184 -> 243 (low level in single, upper step in multi) lifts206 -> cap198 -> arm.
// 184 itself stays where the cam puts it, so it never presses cap229 for the cue.
// plain1229 p.10: "Der damit gekoppelte Verbindungshebel (270) überträgt diese Bewegung
// auf den Heberbolzen (206)"; the tap "frees" 270; the oil delays the lowering.
// Estimates, all labelled: the hook's bearing point and drop, 243's lift guided by its
// two pins, the handle sweep, the rise time and the 220 contour scale.
import { manualLeverPose, CUE_LINK as L } from './parts/tonearm/cue-linkage.js';
import { automaticPose, automaticLift, surfaceHeight, AUTO } from './automatic-contact.js';
import { EQ243 } from './parts/tonearm/equalizer-geometry.js';
import { cueRange } from './cue-geometry.js';

// Handle64/cam220 shaft between its stops (model frame, rad); sweep is the earlier
// drawing-derived estimate. Stops and detent are a named input boundary (C9).
export const HANDLE = Object.freeze({ down: -0.22, up: 0.73,
  handRate: 0.95 / 0.15,   // the hand: full stroke in about 0.15 s (estimate)
  returnRate: 0.95 / 0.3 }); // after the rearward tap, damped by plate221 (plain1229 p.11): about 0.3 s (estimate)
// Rise through the silicone (MAARC step 19: a quick pull gives a slow, smooth ascent).
// Estimate until the owner's timed video (MEASUREMENTS rank 7).
export const RISE_TAU = 0.25;

export function handleStep(handle, cueUp, dt) {
  const target = cueUp ? HANDLE.up : HANDLE.down, rate = target > handle ? HANDLE.handRate : HANDLE.returnRate;
  return handle + Math.sign(target - handle) * Math.min(Math.abs(target - handle), rate * dt);
}
// The damped lift, as a handle angle: it goes up with the handle and comes down after it at
// SETTLE_RATE, through the silicone oil. Timed by the owner on the real deck (2026-11-19): 2.5 s
// from the cue lever let go to the stylus on a record, then asked for a little quicker: 2 s. The
// stylus meets the record before the lift is all the way down, so the whole travel takes longer.
export const SETTLE_RATE = (HANDLE.up - HANDLE.down) / 2.6;
export function settleStep(settled, handle, dt) {
  return handle >= settled ? handle : Math.max(handle, settled - SETTLE_RATE * dt);
}
// The same for the lift the main lever raises in a cycle, as the lever's tilt (rad): 2 s from the
// lever starting to let go to the stylus on the record, to match the cue (owner, 2026-11-19).
export const TILT_SETTLE_RATE = 0.017 / 2.02;
export function tiltSettleStep(settled, tilt, dt) {
  return tilt >= settled ? tilt : Math.max(tilt, settled - TILT_SETTLE_RATE * dt);
}
export function riseToward(lift, command, dt) {
  if (command <= lift) return lift;
  const next = command - (command - lift) * Math.exp(-dt / RISE_TAU);
  return command - next < 1e-4 ? command : next;
}

// Hook bearing point, in184's frame at its cam-rest pose: the point nearest the206 axis
// (1.9 mm inboard of it) that lies under243's base, with a 1 mm margin, in both slider
// positions (single and multi). Estimate: the real hook and slot are not measured.
const REST = automaticPose(0);
const HOOK_LOCAL = { x: 0.07780, z: 0.02195 };
const rot = (x, z, a) => ({ x: x * Math.cos(a) - z * Math.sin(a), z: x * Math.sin(a) + z * Math.cos(a) });
const w = rot(HOOK_LOCAL.x, HOOK_LOCAL.z, AUTO.base + REST.beta);
export const HOOK = Object.freeze({ local: HOOK_LOCAL, point: { x: AUTO.pivot.x + w.x, z: AUTO.pivot.z + w.z },
  restClearance: 0.0001 }); // estimate: hook under243 with the cue down
// Distance of the hook point along270 from the234 pin: it rises by s*tan(tilt).
const along = (HOOK.point.x - L.pivot.x) * L.dir.x + (HOOK.point.z - L.pivot.z) * L.dir.z;
const shankTop = angle => { const p = manualLeverPose(angle); return p.valid ? L.pivot.y + along * Math.tan(p.tilt) + L.thickness / 2 / Math.cos(p.tilt) : -Infinity; };
// Underside of243 (resting on184) at the hook point, for a184 pose.
export const plateUndersideY = (pose, raise = 0) => surfaceHeight(HOOK.point, pose, EQ243.baseY + raise);

// Setscrew218 (plain1229 p.10: "Durch Rechtsdrehen wird der Abstand vergrößert") sets the
// height of fulcrum234 and so the whole hook. Set once, as the factory does, here so the
// hook rests restClearance under243 with the handle on its back stop. Together with the
// hook's drop this is ONE fixed offset. The factory target (holder 23.5 mm above the record,
// Fig. 17, check A-01) then follows from the stroke; test/dual-cue-chain.test.mjs measures it.
export const SETTING_218 = plateUndersideY(REST) - HOOK.restClearance - shankTop(HANDLE.down);
export const hookTopY = angle => shankTop(angle) + SETTING_218;

// How far the hook lifts243 off184 for a184 pose and handle angle (0 when clear).
export function hookRaise(pose, angle) {
  if (!pose.valid) return 0;
  return Math.max(0, hookTopY(angle) - plateUndersideY(pose));
}
// 206's actuator with243 raised by `raise` (cue-geometry.js scale), and the raise at
// which243 just meets206 at actuator `lift` (206 held by the oil while the hook leads).
export const liftWithRaise = (pose, mode, raise) => automaticLift(pose, mode, undefined, raise).actuator;
export function raiseAtLift(pose, mode, lift, maxRaise) {
  // unclamped actuator of243's own top (automaticLift clamps its actuator at 0)
  const { down, up } = cueRange(mode), s = automaticLift(pose, mode).supportY;
  if (s === null) return 0;
  const a0 = (s + AUTO.plungerLength - down) / (up - down);
  return Math.max(0, Math.min(maxRaise, (lift - a0) * (up - down)));
}
// 206 actuator at the full hand cue with the cam at rest (the damper's reference stroke).
const fullCache = {};
export function fullHandLift(mode = 'single') {
  return fullCache[mode] ??= liftWithRaise(REST, mode, hookRaise(REST, HANDLE.up));
}

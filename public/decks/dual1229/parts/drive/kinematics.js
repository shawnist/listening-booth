// Drive: where the moving drive parts are for a mechanism snapshot. Plain JavaScript (no three.js),
// so Node can test it (test/dual-drive.test.mjs). Owned by the drive builder (see OWNERS.md).
//
// The idler wedges between a pulley step and the platter's drive wall; its height is set by the
// switching segment through the rocker and link (speed) and moved along the step's taper by the
// pitch wheel. Two contacts withdraw it: selector102's lift-off contour pushes 134's follower
// shoulder out between click-stops, and the switch-arm (188) boundary holds134 back at rest.
// Swing lever133 is free on134 (slide washer132): with nothing touching the wheel it keeps
// its last angle on134, so a withdrawn134 carries the idler clear of pulley and wall.
import { SPEC } from '../../spec.js';
import {PITCH_INPUT,pitchAngleFromControl,segmentLiftFromPitch} from './pitch-input.js';
import { SEGMENT_PROFILE, PULLEY_PROFILE, LIFT_OFF, liftOffRadius, profileHeight, profileRange } from './component-profile.js';
import { channelPinBounds } from './channel-contact.js';
import { R_RIM, D } from '../../layout.js';
import { MOTOR as M, PULLEY, PULLEY_Y, IDLER_R, IDLER, BRACKET, LINK, LEVER, SEG, SPEED_AXIS, DETENT } from './place.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---- the pulley's steps ---------------------------------------------------------------------------------
export const stepH = (k) => PULLEY.steps[k][1] - PULLEY.steps[k][0];
export const stepY = (k) => (PULLEY.steps[k][0] + PULLEY.steps[k][1]) / 2;
// how far pitch moves the idler up or down the step from its middle position PULLEY_Y (see place.js)
export const travel = () => PITCH_INPUT.halfStroke;
export const stepR = (k) => SPEC.pulleyDia[k] / 2; // radius where the idler sits at pitch 0 (D8)
// Fixed straight taper of each step; working pitch occupies±1.4mm around its
// neutral datum. The complete material outline includes step shoulders/bevels.
export const pulleyRAt = (k, y) => stepR(k) * (1 - SPEC.pitch * (y - PULLEY_Y[k]) / travel(k));
export const rBottom = (k) => pulleyRAt(k, PULLEY.steps[k][0]); // the step's largest radius, at its foot
// faster (pitch > 0) means a larger radius, lower on the step
export const idlerY = (k, p) => PULLEY_Y[k] - (p / SPEC.pitch) * travel(k);
export const contactR = (k, p) => stepR(k) * (1 + p);
// The pulley's outline for its lathe, (radius, height) from the collar up (motor.js draws it; the test
// checks the idler's tyre against it).
export const pulleyProfile = () => PULLEY_PROFILE;
// The setscrew in the 78 step, in its straight part under the taper: its head lies flush, `proud` (m) out.
export const SETSCREW = { y: PULLEY.steps['78'][0] + 0.0017, r: 0.0011, t: 0.00026, proud: 0.00003 };

// ---- keeping the tyre off the pulley ----------------------------------------------------------------------
// How far inside its full radius the tyre's face is at dy off its middle (place.js IDLER.tyre); Infinity
// beyond its faces.
export function tyreInset(dy) {
  const a = Math.abs(dy), T = IDLER.tyre;
  for (let i = 1; i < T.length; i++) if (a <= T[i][1] + 1e-12) return T[i - 1][0] + ((T[i][0] - T[i - 1][0]) * (a - T[i - 1][1])) / (T[i][1] - T[i - 1][1]);
  return Infinity;
}
// The pulley's largest radius at height y (its lathe outline, pulleyProfile; the setscrew left out: its head is
// flush with the step's straight foot).
export function pulleyOutlineR(y, PROF = PULLEY_PROFILE) {
  let r = 0;
  for (let i = 1; i < PROF.length; i++) {
    const [r0, y0] = PROF[i - 1], [r1, y1] = PROF[i];
    if (y < Math.min(y0, y1) - 1e-12 || y > Math.max(y0, y1) + 1e-12) continue;
    r = Math.max(r, y1 === y0 ? Math.max(r0, r1) : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0));
  }
  return r;
}
// The least distance between the idler's axis and the motor's at which no part of the pulley is inside the
// tyre, with the idler's middle at height y. Contact can move off the crown
// during selection; its actual pulley and tyre radii determine the rolling ratio.
export function pulleyContact(y, profile = PULLEY_PROFILE) {
  // Both profiles are piecewise linear, so the maximum of radius minus tyre
  // inset occurs at one of their breakpoints. This also catches a step shoulder
  // before it can pass through the finite-height tyre during selector travel.
  const offsets=[0,...IDLER.tyre.flatMap(([,h])=>[-h,h]),...profile.map(([,h])=>h-y)];
  let separation=0,radius=0,tyreRadius=0,contactY=y;
  for(const dy of offsets){
    if(Math.abs(dy)>IDLER.tyreT/2+1e-12)continue;
    const r=pulleyOutlineR(y+dy,profile),tr=IDLER_R-tyreInset(dy),d=r+tr;
    if(r>0&&d>separation){separation=d;radius=r;tyreRadius=tr;contactY=y+dy;}
  }
  return {separation,radius,tyreRadius,contactY};
}
export const pulleyClearance = (y, profile) => pulleyContact(y,profile).separation;

// Where the idler stands when it touches both the pulley (radius rp) and the drive wall.
export function idlerCentre(rp, out = { x: 0, z: 0 }) {
  const a = rp + IDLER_R, b = R_RIM - IDLER_R, d = Math.hypot(M.x, M.z);
  if(d>a+b||d<Math.abs(a-b))throw new RangeError('Pulley and rim have no simultaneous contact assembly');
  const x = (b * b - a * a + d * d) / (2 * d), h = Math.sqrt(Math.max(0, b * b - x * x));
  const ux = M.x / d, uz = M.z / d;
  out.x = ux * x - uz * h; out.z = uz * x + ux * h; // the intersection on the swing lever's side
  return out;
}

// ---- the speed segment and the rocker ---------------------------------------------------------------------
// The segment's turn (three.js rotation.y) follows speed lever6 only.
export const segTurn = (k) => -SEG.deg[k] * D; // pitch is axial, never added to yaw
// The support slides vertically on its guide, carrying the swing lever at fixed height offset.
export const supportY = (y) => y + BRACKET.foot - 0.00425;
// Compatibility for callers of the former tipping model: 134 translates on a vertical guide.
export const linkTilt = () => 0;
// The follower belongs to the same rigid part 134 as its support arm. Its ray
// intersects segment 102 as the whole support swivels; there is no extra carrier joint.
export function follower(angle, out = {}) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  out.x = LINK.from.x - ca * LINK.short; out.z = LINK.from.z - sa * LINK.short;
  out.dx = sa; out.dz = -ca;
  const ax = out.x - SPEED_AXIS.x, az = out.z - SPEED_AXIS.z;
  const b = ax * out.dx + az * out.dz, disc = b * b - (ax * ax + az * az - SEG.r * SEG.r);
  if (disc < 0) throw new RangeError('Support follower misses switching segment');
  out.reach = -b - Math.sqrt(disc);
  out.angle = Math.atan2(out.z + out.dz * out.reach - SPEED_AXIS.z, out.x + out.dx * out.reach - SPEED_AXIS.x);
  return out;
}
// Fixed pin length, estimated to overlap the band throughout the reconstructed travel,
// including the withdrawn rest stop (reach 4.43 mm to the band's middle at WITHDRAWAL.rest).
// Any longer and the engaged pin reaches the segment's hub (SEG.hubR); with the pin reaching
// the middle of the band, this bounds how far134 can withdraw.
export const PIN_LENGTH = .0045;
// Nominal reference exports retained for older consumers; runtime uses follower(P.supportAngle).
const nominalFollower = follower(Math.atan2(LINK.uz, LINK.ux));
export const PIN = { x: nominalFollower.x, z: nominalFollower.z };
export const PIN_SIDE = { x: nominalFollower.dx, z: nominalFollower.dz };
export const PIN_D = nominalFollower.reach;
export const PIN_ANGLE = nominalFollower.angle;
export const pinY = (y) => supportY(y) + LINK.pinOffset;
// The slot's height along the segment's band, at local angle phi (atan2(z, x) in the segment's own
// frame; a point at local angle phi is at world angle phi - turn): flat-ish stretches where the pin
// sits for each speed (sloping a little with pitch), joined by ramps.
export const slotY = (phi) => profileHeight(phi);
export const SLOT_RANGE = profileRange();

// ---- the click-stops: the ball 125 on the groove detent 106 -------------------------------------------------
// The lever's part of the segment's turn (three.js rotation.y of the speed shaft) and the pitch knob's part.
export const leverTurn = (k) => -SEG.deg[k] * D;
export const pitchTurn = (p) => -pitchAngleFromControl(p); // knob8 only; not102 yaw
// The notch for speed k, as an angle in the plate's own frame: where the ball is when the lever is at k (a point
// at local angle phi is at world angle phi - turn).
export const notchAngle = (k) => DETENT.a * D + leverTurn(k);
const wrapPi = (a) => { a = (a + Math.PI) % (2 * Math.PI); return (a < 0 ? a + 2 * Math.PI : a) - Math.PI; };
// How high the ball's centre stands over the plate's top with the shaft turned to `turn`: on the flat a ball's
// radius (and `clear`); over a notch it rests on the notch's nearer edge, lower the nearer it is to the middle.
// The notch is a straight-sided slot along its radius, DETENT.plate.notchW wide.
const SPEEDS = ['33', '45', '78'];
export function ballLift(turn) {
  const r = DETENT.ball, w2 = DETENT.plate.notchW / 2;
  let h = r;
  for (const k of SPEEDS) {
    const d = wrapPi(DETENT.a * D + turn - notchAngle(k));
    if (Math.abs(d) > Math.PI / 2) continue;
    const e = Math.abs(DETENT.r * Math.sin(d)); // the ball's centre off the notch's middle line
    if (e < w2) h = Math.min(h, Math.sqrt(r * r - (w2 - e) * (w2 - e)));
  }
  return h + DETENT.clear;
}

// Two rigid arms, with the swivel 133 at the end of the vertically sliding support 134.
// Figs. 2/31 establish the joints; lengths are estimates. This inverse helper is
// retained for older geometry checks; the forward runtime below does not use it.
export function supportPose(x, z, y, out = {}) {
  const dx = x - LINK.from.x, dz = z - LINK.from.z, d = Math.hypot(dx, dz);
  const a = (LINK.len * LINK.len - LEVER.axle * LEVER.axle + d * d) / (2 * d);
  const h2 = LINK.len * LINK.len - a * a;
  if (h2 < -1e-12) throw new RangeError('Idler target is outside the rigid linkage reach');
  const h = Math.sqrt(Math.max(0, h2)), ux = dx / d, uz = dz / d;
  out.ax = LINK.from.x + ux * a + uz * h;
  out.az = LINK.from.z + uz * a - ux * h;
  out.supportAngle = Math.atan2(out.az - LINK.from.z, out.ax - LINK.from.x);
  out.supportY = supportY(y);
  out.phi = Math.atan2(z - out.az, x - out.ax);
  out.rho = LEVER.axle;
  return out;
}

// ---- forward constraint model -------------------------------------------------------------------------
// Imposed boundaries are selector102 angle, axial pitch lift and the withdrawal actuator's limit
// on134 yaw. The latter is a temporary estimated boundary for linkage188, not a
// desired idler position. 102's lift-off contour is material: it limits134 by contact.
// Motor traction is treated as quasistatic wedging when both rolling contacts can
// close; spring forces, rubber slip and inertia of the two levers are not simulated.
// At rest switch arm188 holds134 back (rest, its yaw) and its shaft bears on133's post in
// silicone tube135 (p.19 exploded view), turning133 on134 (relRest, its angle on134). Both estimates,
// chosen together so the idler stands at the photo-measured disengaged centre and edge
// (DECISIONS D8: centre (-61, +70) mm, outer edge r 123 mm; model (-59.1, +70.6), 122.1).
// rest is also the deepest134 withdrawal the 4.5 mm pin and the segment hub allow.
export const WITHDRAWAL = Object.freeze({rest:-0.92,released:-0.70,relRest:0.72,relReleased:1.10});
// Named input boundary: switch arm188 (cycle chain) sets134's rest stop through its
// shaft and the tension spring (manual p.11 "über eine Zugfeder"; rebuild guide step 3).
// The spring line and stop face are unmeasured, so the stop moves linearly with188's yaw
// between its off and on poses (switch-input.js). 188 itself is the cycle chain's input.
export const SWITCH_ARM_YAW = Object.freeze({ off: 0.0647916479036212, on: -0.024873915128409863 });
// The tension spring (hooked on the idler's arbor, RB step 3; "über eine Zugfeder", M-DE p.11)
// pulls134 in and swings133 toward the wall, so the idler travels to the wedge. It moves at a
// bounded speed (a light lever drawn by a spring against pivot friction), never through the
// pulley or the wall; contacts that push it out (102's contour, 188 and its shaft on135) act at
// once. The path is the straight line in (134 yaw, 133 angle) toward the wedged pose: an
// estimate of where the spring takes it, not a force solution. axleSpeed (m/s) is an estimate.
export const CARRIER_PULL = Object.freeze({ axleSpeed: 0.4, settle: 5e-5 });
// state {yaw, rel}: 134's yaw and133's angle on134 now; pose: the drive pose solved with them;
// inputs: the same solveDrive inputs (selectorAngle, segmentLift, withdrawalLimit, relLimit).
export function stepIdler(state, pose, dt, inputs) {
  const yawCap = pose.pushLimit, relCap = inputs.relLimit ?? Infinity;
  let y = Math.min(state.yaw, yawCap), r = Math.min(state.rel, relCap); // pushed: at once
  const ty = Math.min(yawCap, pose.wedgeYaw), tr = Math.min(relCap, pose.wedgeRel);
  const at = (yy, rr) => solveDrive({ ...inputs, carrierLimit: yy, swingRel: rr });
  const here = at(y, r), room = CARRIER_PULL.axleSpeed * dt;
  const ok = (p) => p.pulleyGap >= -1e-9 && p.rimGap >= -1e-9 && Math.hypot(p.x - here.x, p.z - here.z) <= room;
  const goal = at(ty, tr);
  if (Math.hypot(goal.x - here.x, goal.z - here.z) <= Math.max(room, CARRIER_PULL.settle) && goal.pulleyGap >= -1e-9 && goal.rimGap >= -1e-9) return { yaw: ty, rel: tr };
  for (const [dy, dr] of [[ty - y, tr - r], [0, tr - r], [ty - y, 0]]) { // straight; then133 alone; then134 alone
    if (Math.abs(dy) < 1e-12 && Math.abs(dr) < 1e-12) continue;
    let lo = 0, hi = 1;
    if (ok(at(y + dy, r + dr))) lo = 1;
    else for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (ok(at(y + dy * m, r + dr * m))) lo = m; else hi = m; }
    if (lo > 1e-6) return { yaw: y + dy * lo, rel: r + dr * lo };
  }
  return { yaw: y, rel: r };
}
export function withdrawalFromSwitchArm(yaw) {
  const t = clamp((SWITCH_ARM_YAW.off - yaw) / (SWITCH_ARM_YAW.off - SWITCH_ARM_YAW.on), 0, 1);
  return { yaw: lerp(WITHDRAWAL.rest, WITHDRAWAL.released, t), rel: lerp(WITHDRAWAL.relRest, WITHDRAWAL.relReleased, t) };
}

// ---- selector102's lift-off contour against134's follower shoulder -------------------------
// The shoulder is the root of134's pin, on134's rigid body. Its radius from the speed axis
// and its azimuth in102's frame for a134 yaw and selector angle.
export function shoulder(angle, selectorAngle = 0) {
  const f = follower(angle), dx = f.x - SPEED_AXIS.x, dz = f.z - SPEED_AXIS.z;
  return { r: Math.hypot(dx, dz), local: Math.atan2(dz, dx) + selectorAngle };
}
export const liftOffClearance = (angle, selectorAngle, contour = LIFT_OFF) => {
  const s = shoulder(angle, selectorAngle);
  return s.r - liftOffRadius(s.local, contour);
};
// The spring pulls134 in (yaw up) from fully out; the shoulder stops where it first meets
// the contour. Returns that yaw: the contour's limit on134, or `to` if it never touches.
export const LIFT_SCAN = Object.freeze({ from: -1.05, to: -0.68, step: 0.002 });
const liftCache = new Map();
// With `start` (134's present yaw), continue from there instead: the shoulder cannot pass
// through the wall, so if the wall has moved under it, it is pushed out to the nearest clear
// yaw; otherwise the spring can pull it in up to the next contact. Contacts beyond the wall
// the shoulder is on are never reached in one step.
export function liftOffLimit(selectorAngle, contour = LIFT_OFF, start = null) {
  if (start !== null && start > LIFT_SCAN.from && start < LIFT_SCAN.to) {
    const { step, to } = LIFT_SCAN, clear = (a) => liftOffClearance(a, selectorAngle, contour) >= 0;
    let lo, hi;
    if (!clear(start)) { // pushed: out to the nearest clear yaw
      hi = start; lo = start - step; while (lo > LIFT_SCAN.from && !clear(lo)) { hi = lo; lo -= step; }
      if (!clear(lo)) throw new RangeError('Lift-off contour leaves no room for134');
    } else {
      lo = start; hi = Math.min(to, start + step); while (hi < to && clear(hi)) { lo = hi; hi = Math.min(to, hi + step); }
      if (clear(hi)) return to;
    }
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (clear(m)) lo = m; else hi = m; }
    return lo;
  }
  const key = contour === LIFT_OFF ? selectorAngle : null;
  if (key !== null && liftCache.has(key)) return liftCache.get(key);
  const { from, to, step } = LIFT_SCAN;
  if (liftOffClearance(from, selectorAngle, contour) < 0) throw new RangeError('Lift-off contour leaves no room for134');
  let a = from, limit = to;
  for (; a < to; a += step) {
    const b = Math.min(to, a + step);
    if (liftOffClearance(b, selectorAngle, contour) < 0) {
      let lo = a, hi = b;
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (liftOffClearance(m, selectorAngle, contour) < 0) hi = m; else lo = m; }
      limit = lo; break;
    }
  }
  if (key !== null) { if (liftCache.size >= 512) liftCache.delete(liftCache.keys().next().value); liftCache.set(key, limit); }
  return limit;
}
const assemblyAt = (angle, selectorAngle, geometry, checkUpper=false,segmentLift=0) => {
  const bound=channelPinBounds(follower(angle),selectorAngle,geometry.segmentProfile,.001,PIN_LENGTH,checkUpper);
  if(!Number.isFinite(bound.lower)||bound.lower>bound.upper+1e-8)throw new RangeError('Finite follower cannot fit the independent channel');
  bound.lower+=segmentLift;bound.upper+=segmentLift;
  const y=bound.lower-LINK.pinOffset-supportY(0);
  return {supportAngle:angle,supportY:supportY(y),y,pinLower:bound.lower,pinUpper:bound.upper,
    ax:LINK.from.x+LINK.len*Math.cos(angle),az:LINK.from.z+LINK.len*Math.sin(angle)};
};
const rigidAxle = (a, phi) => ({x:a.ax+LEVER.axle*Math.cos(phi),z:a.az+LEVER.axle*Math.sin(phi)});
const gaps = (c,separation) => ({pulleyGap:Math.hypot(c.x-M.x,c.z-M.z)-separation,rimGap:R_RIM-IDLER_R-Math.hypot(c.x,c.z)});
function circleAngles(ax,az,cx,cz,r) {
  const dx=cx-ax,dz=cz-az,d=Math.hypot(dx,dz),v=(LEVER.axle**2+d*d-r*r)/(2*LEVER.axle*d);
  if(Math.abs(v)>1)return [];
  const a=Math.atan2(dz,dx),b=Math.acos(clamp(v,-1,1));return [wrapPi(a-b),wrapPi(a+b)];
}
// The finite134 yaw range is the current reconstructed guide/actuator travel.
// Failure means these estimated components cannot assemble; do not add a DOF.
const assemblyCache = new WeakMap();
// Component profiles are immutable. To change material, pass new profile arrays.
export function solveDrive({selectorAngle,segmentLift=0,withdrawalLimit=WITHDRAWAL.released,relLimit=Infinity,carrierLimit=Infinity,swingRel,previousRel}, geometry={}, out={}) {
  const segment=geometry.segmentProfile??SEGMENT_PROFILE,pulley=geometry.pulleyProfile??PULLEY_PROFILE;
  let byPulley=assemblyCache.get(segment);if(!byPulley){byPulley=new WeakMap();assemblyCache.set(segment,byPulley);}
  let poses=byPulley.get(pulley);if(!poses){poses=new Map();byPulley.set(pulley,poses);}
  const evaluate=angle=>{
    const a=assemblyAt(angle,selectorAngle,geometry,false,segmentLift),contact=pulleyContact(a.y,geometry.pulleyProfile);
    const c=idlerCentre(contact.separation-IDLER_R);
    return {a,contact,c,error:Math.hypot(c.x-a.ax,c.z-a.az)-LEVER.axle};
  };
  const inputKey=`${selectorAngle}:${segmentLift}`;
  let solution=poses.get(inputKey);
  if(!solution){
  let low=evaluate(-.90),high=evaluate(-.68);
  if(low.error*high.error>0)throw new RangeError('Pulley, rim and rigid support have no bracketed assembly');
  // Bracketed secant: all evaluations use the material channel's seated height.
  for(let i=0;i<22;i++){
    const angle=clamp((low.a.supportAngle*high.error-high.a.supportAngle*low.error)/(high.error-low.error),low.a.supportAngle+1e-9,high.a.supportAngle-1e-9);
    solution=evaluate(angle);
    if(Math.abs(solution.error)<1e-10)break;
    if(solution.error*low.error>0)low=solution;else high=solution;
  }
  if(Math.abs(solution.error)>1e-7)throw new RangeError('Drive contact constraints did not converge');
  if(poses.size>=256)poses.delete(poses.keys().next().value);
  poses.set(inputKey,solution);
  }
  // 134's yaw is bounded by the188 boundary and by102's lift-off contour on its shoulder.
  // Once neither holds it short of the wedge, further travel changes no contact: reuse
  // the exact free assembly, independent of its eased input.
  const liftLimit=liftOffLimit(selectorAngle,geometry.liftOff??LIFT_OFF,Number.isFinite(carrierLimit)?carrierLimit:null);
  // carrierLimit: how far the spring has pulled134 in so far (mechanism state, see CARRIER_PULL).
  const pushLimit=Math.min(withdrawalLimit,liftLimit),yawLimit=Math.min(pushLimit,carrierLimit);
  const wedgeRel=Math.atan2(solution.c.z-solution.a.az,solution.c.x-solution.a.ax)-solution.a.supportAngle;
  const limited=yawLimit<solution.a.supportAngle-1e-9||Math.min(relLimit,swingRel??Infinity)<wedgeRel-1e-9;
  const resultKey=limited?`${yawLimit}:${relLimit}:${swingRel??''}:${previousRel??''}`:'free';
  solution.results??=new Map();
  if(solution.results.has(resultKey))return Object.assign(out,solution.results.get(resultKey));
  let {a,contact,c}=solution,phi=Math.atan2(c.z-a.az,c.x-a.ax);
  if(limited){
    // 133 has no spring of its own (p.19 exploded view: slide washer132 only). With nothing touching
    // the wheel it keeps its angle on134: the last one if known, else the wedged one.
    // 188's shaft on135 caps it (relLimit).
    const rel=Math.min(relLimit,swingRel??previousRel??(phi-a.supportAngle));
    a=assemblyAt(Math.min(yawLimit,solution.a.supportAngle),selectorAngle,geometry,true,segmentLift);contact=pulleyContact(a.y,geometry.pulleyProfile);
    phi=a.supportAngle+rel;c=rigidAxle(a,phi);
    const g=gaps(c,contact.separation);
    if(g.pulleyGap<-1e-9||g.rimGap<-1e-9){
      // The wheel is touching: the pulley or wall turns133. The turning pulley drags the tyre
      // toward the narrowing gap (the idler drive's self-energising wedge), so of the admissible
      // contact poses it takes the one deepest into the wedge. At first touch the two coincide,
      // so this is continuous. Assumes the motor is turning as the idler arrives.
      // Only the surface actually pressed turns it: the wheel rolls along that one.
      const candidates=[...(g.rimGap<-1e-9?circleAngles(a.ax,a.az,0,0,R_RIM-IDLER_R):[]),...(g.pulleyGap<-1e-9?circleAngles(a.ax,a.az,M.x,M.z,contact.separation):[])];
      const feasible=candidates.map(p=>({p,c:rigidAxle(a,p)})).map(v=>({...v,g:gaps(v.c,contact.separation)})).filter(v=>v.g.pulleyGap>=-1e-9&&v.g.rimGap>=-1e-9);
      feasible.sort((u,v)=>(u.g.pulleyGap+u.g.rimGap)-(v.g.pulleyGap+v.g.rimGap));
      if(!feasible.length)throw new RangeError('Withdrawal overconstrains the rigid idler');
      phi=feasible[0].p;c=feasible[0].c;
    }
  }
  // Final finite-pin upper clearance is checked as well as the seating contact.
  if(!limited)a=assemblyAt(a.supportAngle,selectorAngle,geometry,true,segmentLift);
  const g=gaps(c,contact.separation),engaged=g.pulleyGap<1e-7&&g.rimGap<1e-7;
  Object.assign(out,a,c,g,{phi,rho:LEVER.axle,segmentTurn:selectorAngle,segmentLift,rp:contact.radius,
    contactY:contact.contactY,tyreContactRadius:contact.tyreRadius,engaged,
    pulleyRadius:contact.radius,rimRadius:R_RIM,idlerRadius:IDLER_R,
    pulleyContact:g.pulleyGap<1e-7,rimContact:g.rimGap<1e-7,
    transmissionRatio:engaged?contact.radius/contact.tyreRadius*IDLER_R/R_RIM:0,
    off:engaged?0:1,lift:0,actuatorLimited:withdrawalLimit<solution.a.supportAngle||relLimit<wedgeRel,
    liftOffLimited:liftLimit<solution.a.supportAngle,liftOffLimit:liftLimit,
    pushLimit,wedgeYaw:solution.a.supportAngle,wedgeRel});
  if(solution.results.size>=128)solution.results.delete(solution.results.keys().next().value);
  solution.results.set(resultKey,{...out});
  return out;
}

// Snapshot adapter: only the human-operated shaft and withdrawal actuator are
// interpolated. No timing phase prescribes the idler axle's height or XY path.
// Root may pass driveSelectorAngle/driveWithdrawalLimit from the mechanism's
// component inputs; `drivePose` is a precomputed shared solver result.
export function pose(s,out={},mem=null) {
  if(s.drivePose)return Object.assign(out,s.drivePose);
  const progress=clamp(s.shift??1,0,1),pitch=s.pitch||0;
  const target=segTurn(s.speed,pitch),from=segTurn(s.shiftFrom||s.speed,pitch);
  let start=from;
  if(mem&&progress<1){
    if(!mem.active||s.speed!==mem.speed||progress<mem.progress){mem.start=mem.segment??from;mem.startProgress=progress;}
    start=mem.start??from;
  }
  const t=mem&&progress<1?clamp((progress-(mem.startProgress??0))/(1-(mem.startProgress??0)||1),0,1):progress;
  const selectorAngle=s.driveSelectorAngle??lerp(start,target,t);
  const t188=clamp(s.idlerIn??1,0,1);
  const withdrawalLimit=s.driveWithdrawalLimit??lerp(WITHDRAWAL.rest,WITHDRAWAL.released,t188);
  const relLimit=s.driveRelLimit??(s.driveWithdrawalLimit!==undefined?Infinity:lerp(WITHDRAWAL.relRest,WITHDRAWAL.relReleased,t188));
  const pitchAngle=s.drivePitchAngle??pitchAngleFromControl(pitch);
  const segmentLift=s.driveSegmentLift??segmentLiftFromPitch(pitchAngle);
  const carrierLimit=s.driveCarrierYaw??Infinity,swingRel=s.driveSwingRel;
  const key=`${selectorAngle}:${segmentLift}:${withdrawalLimit}:${relLimit}:${carrierLimit}:${swingRel}`;
  // Book-keep the lever's travel before any cache return: an unchanged pose must not
  // leave `active` stale, or every frame restarts the change and the lever never turns.
  if(mem)Object.assign(mem,{active:progress<1,speed:s.speed,progress,segment:selectorAngle});
  if(mem?.key===key)return Object.assign(out,mem.pose);
  const previousRel=mem?.pose?mem.pose.phi-mem.pose.supportAngle:undefined;
  solveDrive({selectorAngle,segmentLift,withdrawalLimit,relLimit,carrierLimit,swingRel,previousRel},{},out);
  if(mem)Object.assign(mem,{key,pose:{...out}});
  return out;
}

export const poseFromSnapshot = pose;

// Plain1229 p7 Fig11/12, p10 Fig18:198 on translating206 lifts bearing body73.
// 203 mounts to the outer60 stud (Fig12; MAARC rebuild pp31–32), so it and
// threaded sleeve200 rise with that bearing.206 slides inside this moving guide.
// No felt crescent under the arm tube. Axis/cap/ledge dimensions are photo estimates.
import { SPEC, LIFT, REST, R_OUT_MAX } from './spec.js';
import { PIVOT } from './layout.js';
import { modeRaiseFor } from './mode-height.js';
import { Y_PIVOT, Y_REC, Y_MAT, DH } from '../../deck3d/layout.js';
export const CUE = { axisX:-0.009, axisZ:0.011, bodyY:-0.0077, tipR:0.0012, tipH:0.0016, clearance:0.0010, freeFall:0.25,
  // Fixed dimensional reconstruction from MAARC pp27–28: thick piston, narrow
  // upper stem; no separate lower flange. Dimensions are not factory measurements.
  plungerLength:.0605, pistonLength:.045, pistonR:.00175, stemR:.0009,
  guideBottom:-.01975, guideTop:.0382, guideBore:.00184, guideOuter:.0023,
  springSeat:.0367, springTurns:8, springWire:.00012,
  ledge:[[.001,-.005],[.012,-.005],[.015,-.002],[.015,.010],[.012,.0125],[.001,.0125]] };
export const liftAxis = {x:PIVOT.x+CUE.axisX,z:PIVOT.z+CUE.axisZ};
const hyp=Math.hypot(SPEC.armL,DH), delta=Math.atan2(DH,SPEC.armL);
// Arm chain (mode-height.js): the whole-arm height comes from the ears on gimbal60 resting on
// lever70's ramps, not from the mode name. A number is an already-solved raise.
export const modeRaise=mode=>typeof mode==='number'?mode:modeRaiseFor(mode==='multi'?'multi':'single');
// Upper travel bound follows the actual205 spring seats: piston shoulder plus
// solid coil height reaches the fixed-in-guide upper seat. No target arm pose.
export const guideStopY=(mode='single')=>CUE.springSeat+modeRaise(mode)-2*CUE.springWire*CUE.springTurns-CUE.pistonLength;
export const cuePitch=(height,mode='single')=>delta+Math.asin((Y_REC+height-Y_PIVOT-modeRaise(mode))/hyp);
export function cueArmAngle(radius=REST) {
  const d=Math.hypot(PIVOT.x,PIVOT.z),r=Math.max(.02,Math.min(R_OUT_MAX,radius));
  const a=(r*r-SPEC.armL**2+d*d)/(2*d),h=Math.sqrt(Math.max(0,r*r-a*a));
  return Math.atan2((a-d)*PIVOT.z/d+h*PIVOT.x/d,(a-d)*PIVOT.x/d-h*PIVOT.z/d);
}
// Lowest bearing-body ledge over the finite flat198 tip. This ledge belongs to
// body73 and therefore pitches/yaws with it; the small plunger axis is fixed in plan.
export function bearingContactY(phi,mode='single',radius=REST) {
  const a=cueArmAngle(radius),cx=CUE.axisX*Math.cos(a)+CUE.axisZ*Math.sin(a),cz=-CUE.axisX*Math.sin(a)+CUE.axisZ*Math.cos(a);
  const poly=CUE.ledge.map(([x,z])=>[x*Math.cos(phi)-CUE.bodyY*Math.sin(phi),z]);
  const inside=(x,z)=>poly.every(([px,pz],i)=>{const [qx,qz]=poly[(i+1)%poly.length];return (qx-px)*(z-pz)-(qz-pz)*(x-px)>=-1e-12;});
  // Contact is the lowest point of the finite bearing ledge over the tip disk.
  // Do not widen the ledge to force every edge of the rubber cap underneath it.
  const candidates=[],r=CUE.tipR,extreme=cx-Math.sign(phi)*r;
  if(inside(extreme,cz))candidates.push(extreme);
  for(let i=0;i<poly.length;i++){
    const [x,z]=poly[i],[bx,bz]=poly[(i+1)%poly.length],dx=bx-x,dz=bz-z;
    if((x-cx)**2+(z-cz)**2<=r*r)candidates.push(x);
    const A=dx*dx+dz*dz,B=2*((x-cx)*dx+(z-cz)*dz),D=B*B-4*A*((x-cx)**2+(z-cz)**2-r*r);
    if(D>=0)for(const t of [(-B-Math.sqrt(D))/(2*A),(-B+Math.sqrt(D))/(2*A)])if(t>=0&&t<=1)candidates.push(x+t*dx);
  }
  if(!candidates.length)return Infinity;
  const x=phi>=0?Math.min(...candidates):Math.max(...candidates);
  return Y_PIVOT+modeRaise(mode)+x*Math.tan(phi)+CUE.bodyY/Math.cos(phi);
}
const restUp=bearingContactY(cuePitch(LIFT),'single',REST);
const restDown=Math.min(...[.05,.1,.1492,REST].map(r=>bearingContactY(cuePitch(0),'single',r)))-CUE.clearance;
const travel=restUp-restDown;
export function cueRange(mode='single') {
  const up=bearingContactY(cuePitch(LIFT,mode),mode,REST);return {down:up-travel,up};
}
// Kept as the actuator interface for automatic184. Value is now198 TIP height,
// not the origin of a nonexistent lifting platform.
export function platformY(lift,mode='single') {const {down,up}=cueRange(mode);return down+(up-down)*Math.max(0,lift);}
export function actuatorForHeight(height,mode='single',radius=REST) {
  const {down,up}=cueRange(mode);return Math.max(0,Math.min(1,(bearingContactY(cuePitch(height,mode),mode,radius)-down)/(up-down)));
}
export const pickupFraction=(mode='single',radius=REST)=>actuatorForHeight(0,mode,radius);
export function supportedStylusY(lift,mode='single',radius=REST) {
  const tip=platformY(lift,mode);let lo=-.04,hi=.03;
  for(let i=0;i<36;i++){const mid=(lo+hi)/2;if(bearingContactY(cuePitch(mid,mode),mode,radius)<tip)lo=mid;else hi=mid;}
  return Y_REC+(lo+hi)/2;
}
// Stylus height above the shelf record (Y_REC) with the arm lying on cap198, floored at the
// surface under the stylus: `surface` is that surface's height above Y_REC, from the changer's
// pileTop (mechanism.recordTopAt): the mat (-1.8 mm) on an empty platter, 0 with one record, the
// pile's top with several. Default 0 is the old record floor.
export function supportedHeight(lift,mode='single',radius=REST,surface=0) {return Math.max(surface,supportedStylusY(lift,mode,radius)-Y_REC);}
// Damping is a travel rate, independent of arm yaw. Calibrated to the existing
// estimated4.5s at the rest/reference angle; actual descent varies across the arc.
// Continue slowly down to the baremat before estimated0.25s unloaded return.
// `full`: the actuator of the full hand cue (cue-chain.js fullHandLift), from which the
// estimated liftFall is timed. Default 1 keeps the old normalised scale.
export function lowerActuator(lift,target,dt,mode='single',full=1) {
  const pickup=pickupFraction(mode),matPickup=Math.min(...[.05,.1,.1492,REST].map(r=>actuatorForHeight(Y_MAT-Y_REC,mode,r)));
  const rate=(full-pickup)/SPEC.liftFall;
  if(lift>matPickup){const used=Math.min(dt,(lift-matPickup)/rate);lift-=used*rate;dt-=used;}
  if(dt>0)lift-=dt*matPickup/CUE.freeFall;
  return Math.max(target,lift);
}

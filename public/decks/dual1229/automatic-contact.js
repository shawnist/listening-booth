// Plain1229 p10 Fig16: cam165 -> lever184 -> plunger206 / friction cap229.
// Fixed component geometry is estimated. No current arm position sets the cam or lever.
import { CAM_PROFILE } from './automatic-profile.js';
import { GEAR, PIVOT } from './layout.js';
import { SPEC } from './spec.js';
import { CUE, guideStopY, cueArmAngle, cueRange, liftAxis } from './cue-geometry.js';
import {EQ243,equalizerBoundary,equalizerContains} from './parts/tonearm/equalizer-geometry.js';
export { CAM_PROFILE };
export const AUTO = Object.freeze({
 pivot:{x:.087,y:-.0247,z:-.0695},base:-.5340542818651519,
 follower:{x:-.025048547411219847,y:.0097,z:-.0014526777302179099},
 faceY:.00285, fingerY:.00285, faceR:[.059,.072],faceA:[-.40,.40],fingerR:[.077,.085],fingerA:[-.18,.34],
 capBottom:-.0209,capLength:.003,capRadius:.0016,capMaxCompression:.0006,
 segmentY:-.0114,segmentT:.0015,padRadius:.031,padAngle:2.7953199971352336,armMid:2.0067759034419383,
 plungerLength:CUE.plungerLength,footRadius:CUE.pistonR, // same rigid206 geometry as the renderer
 channelBottom:-.0205,channelClearance:.0009,

});
const D=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rotate=(x,z,a)=>[x*Math.cos(a)-z*Math.sin(a),x*Math.sin(a)+z*Math.cos(a)];
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const commonStop=CAM_PROFILE.start.filter(row=>row[0]<CAM_PROFILE.stop[0][0]).concat(CAM_PROFILE.stop);
const invalid=theta=>({beta:0,tilt:0,station:theta,follower:null,valid:false});
// Search the actual connected channel geometry, not a phase-index window or
// target lever trajectory. The stop branch shares the start channel before its fork.
function solveFollower(theta,branch,profile,fixedTilt=null){
 const th=clamp(theta,0,360),track=branch==='stop'?(profile===CAM_PROFILE?commonStop:profile.start.filter(row=>row[0]<profile.stop[0][0]).concat(profile.stop)):profile.start;
 const Q=AUTO.pivot,F=AUTO.follower,[qx,qz]=rotate(Q.x-GEAR.camX,Q.z-GEAR.camZ,th*D);
 const fixed=fixedTilt!==null,fx=fixed?F.x*Math.cos(fixedTilt)-F.y*Math.sin(fixedTilt):0;
 const R2=fixed?fx*fx+F.z*F.z:F.x*F.x+F.y*F.y+F.z*F.z;
 let found=null;
 for(let i=0;i<track.length-1;i++){
  const a=track[i],b=track[i+1],dx=b[1]-a[1],dy=fixed?0:b[2]-a[2],dz=b[3]-a[3];
  const vx=a[1]-qx,vy=fixed?0:a[2]-Q.y,vz=a[3]-qz;
  const A=dx*dx+dy*dy+dz*dz;if(A<1e-24)continue;
  const B=2*(dx*vx+dy*vy+dz*vz),C=vx*vx+vy*vy+vz*vz-R2,disc=B*B-4*A*C;
  if(disc<0)continue;
  for(const u of [(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)])if(u>=-1e-5&&u<=1+1e-5){
   const roofY=a[2]+u*(b[2]-a[2]);let tilt=fixedTilt;
   if(!fixed){let lo=-.2,hi=.2;for(let k=0;k<36;k++){const m=(lo+hi)/2,y=F.x*Math.sin(m)+F.y*Math.cos(m);if(y>roofY-Q.y)lo=m;else hi=m;}tilt=(lo+hi)/2;}
   const x=F.x*Math.cos(tilt)-F.y*Math.sin(tilt),y=Q.y+F.x*Math.sin(tilt)+F.y*Math.cos(tilt);
   const [wx,wz]=rotate(a[1]+u*dx,a[3]+u*dz,-th*D),p=[wx+GEAR.camX,y,wz+GEAR.camZ];
   const beta=wrap(Math.atan2(p[2]-Q.z,p[0]-Q.x)-Math.atan2(F.z,x)-AUTO.base);
   // Finite reconstructed lever travel and pin engagement. These dimensional
   // bounds do not identify a phase or depend on arm/cap position.
   if(beta<-.04||beta>.50||y>roofY+1e-8||y<AUTO.channelBottom+.0001)continue;
   if((y-AUTO.channelBottom)*Math.abs(Math.tan(tilt))>AUTO.channelClearance)continue;
   if(found&&Math.abs(found.beta-beta)>1e-5)return {...invalid(th),ambiguous:true};
   found={beta,tilt,station:a[0]+u*(b[0]-a[0]),follower:p,roofGap:Math.max(0,roofY-y),valid:true};
  }
 }
 return found||invalid(th);
}
// Natural contact: spring/arm load holds the follower against the cam roof.
// A frame asks for the same exact contact several times (collision guard, arm,
// lift and rendering). Cache only immutable installed geometry; custom/edited
// profiles always solve afresh. No angle quantization or motion interpolation.
const recentPoses=new Map();
export function automaticPose(theta,branch='start',profile=CAM_PROFILE){
 if(profile!==CAM_PROFILE)return solveFollower(theta,branch,profile);
 const key=`${branch}:${theta}`;
 if(recentPoses.has(key))return recentPoses.get(key);
 const pose=solveFollower(theta,branch,profile);
 if(pose.follower)Object.freeze(pose.follower);
 Object.freeze(pose);recentPoses.set(key,pose);
 if(recentPoses.size>32)recentPoses.delete(recentPoses.keys().next().value);
 return pose;
}
// OPTIONAL contact from another real component (e.g. an interfering270 hook).
// Not the default manual-cue path: evidence describes hook lifting184 as maladjustment.
// Raising184's output moves its follower away from the roof; planar channel walls
// still guide it. The constraint must come from a physical contact, never arm height.
export function constrainedLeverPose(theta,branch,minTilt,profile=CAM_PROFILE){
 const natural=automaticPose(theta,branch,profile);
 if(!natural.valid||!Number.isFinite(minTilt)||minTilt<=natural.tilt)return natural;
 return solveFollower(theta,branch,profile,minTilt);
}
export function capPosition(angle){const a=AUTO.padAngle+angle-AUTO.armMid;return {x:PIVOT.x+Math.cos(a)*AUTO.padRadius,z:PIVOT.z+Math.sin(a)*AUTO.padRadius};}
export function localPoint(p,pose){const [x,z]=rotate(p.x-AUTO.pivot.x,p.z-AUTO.pivot.z,-AUTO.base-pose.beta);return {x,z};}
export function surfaceHeight(p,pose,y){const q=localPoint(p,pose);return AUTO.pivot.y+y/Math.cos(pose.tilt)+q.x*Math.tan(pose.tilt);}
function inFace(p,pose,rs,as,y=0){const q=localPoint(p,pose),x=(q.x+y*Math.sin(pose.tilt))/Math.cos(pose.tilt),r=Math.hypot(x,q.z),a=Math.atan2(q.z,x);return r>=rs[0]&&r<=rs[1]&&a>=as[0]&&a<=as[1];}
function diskSupport(p,pose,y,r,rs,as){
 const direction=AUTO.base+pose.beta+(pose.tilt<0?Math.PI:0),highest={x:p.x+r*Math.cos(direction),z:p.z+r*Math.sin(direction)};
 if(inFace(highest,pose,rs,as,y))return surfaceHeight(highest,pose,y);
 let top=-Infinity;
 for(let i=0;i<128;i++){const a=i*Math.PI/64,q={x:p.x+r*Math.cos(a),z:p.z+r*Math.sin(a)};if(inFace(q,pose,rs,as,y))top=Math.max(top,surfaceHeight(q,pose,y));}
 if(inFace(p,pose,rs,as,y))top=Math.max(top,surfaceHeight(p,pose,y));return top;
}
export function capContact(pose,angle){
 const p=capPosition(angle),surface=diskSupport(p,pose,AUTO.faceY,AUTO.capRadius,AUTO.faceR,AUTO.faceA),overlap=Number.isFinite(surface);
 const interference=surface-AUTO.capBottom,blocked=overlap&&interference>AUTO.capMaxCompression;
 return {overlap,interference,compression:overlap?clamp(interference,0,AUTO.capMaxCompression):0,engaged:pose.valid&&overlap&&interference>0&&!blocked,blocked,surface};
}
// raise243: how far243 is lifted off184 along184's normal by the cue lever270's hook
// (cue-chain.js, contracts/cue--cycle.md Contact 2b). Default 0: cam-only results are unchanged.
export function automaticLift(pose,mode='single',equalizerPosition=equalizerBoundary(mode),raise243=0){
 let top=diskSupport(liftAxis,pose,AUTO.fingerY,AUTO.footRadius,AUTO.fingerR,AUTO.fingerA);
 // Both finite plastic243 levels share184's transform. Selection follows
 // actual overlap with the displaced slider, never a mode-dependent height.
 for(const [level,y] of [['low',EQ243.baseY+EQ243.t+raise243],['high',EQ243.baseY+EQ243.stepHeight+raise243]]){
  for(let i=0;i<128;i++){
   const a=i*Math.PI/64,p={x:liftAxis.x+AUTO.footRadius*Math.cos(a),z:liftAxis.z+AUTO.footRadius*Math.sin(a)},q=localPoint(p,pose);
   const x=(q.x+y*Math.sin(pose.tilt))/Math.cos(pose.tilt);
   if(equalizerContains(x,q.z,equalizerPosition,level))top=Math.max(top,surfaceHeight(p,pose,y));
  }
 }

 const supportY=pose.valid&&Number.isFinite(top)?top:null;
 const range=cueRange(mode),tipY=supportY===null?-Infinity:supportY+AUTO.plungerLength;
 return {supportY,blocked:supportY!==null&&supportY>guideStopY(mode),actuator:Math.max(0,(tipY-range.down)/(range.up-range.down)),overtravel:tipY>range.up};
}
export function radiusForAngle(a){return Math.hypot(PIVOT.x+SPEC.armL*Math.cos(a),PIVOT.z+SPEC.armL*Math.sin(a));}
// Tangential friction: rigid184 surface displacement projected on201's circular path.
// Radial mismatch slides; external stops are applied by the mechanism after this step.
export function frictionCarry(radius,previous,next){
 const a=cueArmAngle(radius),p=capPosition(a),tx=-(p.z-PIVOT.z),tz=p.x-PIVOT.x,d=wrap(next.beta-previous.beta);
 const vx=-(p.z-AUTO.pivot.z)*d,vz=(p.x-AUTO.pivot.x)*d,da=(vx*tx+vz*tz)/(AUTO.padRadius**2);
 return radiusForAngle(a+da);
}

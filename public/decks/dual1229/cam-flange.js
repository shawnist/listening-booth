// Fixed reconstructed flange profile; source:1229 Fig21 (muting) and Fig19/20.
// Notches/dimensions are estimates. Both contact solvers and rendered flange use
// this material surface. No dependency on cycle/mute animation flags.
import { GEAR } from './layout.js';
import { CAM_R, SWITCH_ARM, MUTING } from './parts/automatic/place.js';
const D=Math.PI/180,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const tipX=(MUTING.x[0]+MUTING.x[1])/2+.006;
const tipZ=GEAR.camZ-Math.sqrt(CAM_R.flange[1]**2-(tipX-GEAR.camX)**2)-.0003;
export const FLANGE=Object.freeze({radius:CAM_R.flange[1],depth:.0026,ramp:4*D,
 notches:Object.freeze([
  Object.freeze({angle:Math.atan2(SWITCH_ARM.finger.z-GEAR.camZ,SWITCH_ARM.finger.x-GEAR.camX),half:12*D}),

 ])});
export function flangeRadius(angle,profile=FLANGE){
 let cut=0;for(const n of profile.notches){const d=Math.abs(wrap(angle-n.angle));cut=Math.max(cut,d<n.half?1:d<n.half+profile.ramp?1-(d-n.half)/profile.ramp:0);}
 return profile.radius-profile.depth*cut;
}
export function flangeUnder(angle,halfWidth,profile=FLANGE){return Math.max(flangeRadius(angle-halfWidth,profile),flangeRadius(angle,profile),flangeRadius(angle+halfWidth,profile));}
// The old shared ring incorrectly gave each follower the OTHER follower's notch.
// Reconstruct separate axial working bands from the outer-rim muting contact in
// Fig21 and the multiple underside rings in the removed-cam photo. Their exact
// separation/profile is unmeasured: this topology is an explicit reconstruction.
export const MUTE_CAM=Object.freeze({radius:.052,depth:.0026,ramp:1.2*D,
  notches:Object.freeze([Object.freeze({angle:Math.atan2(tipZ-GEAR.camZ,tipX-GEAR.camX),half:2*D})]),
  bottom:-.01865,top:-.01655});
const influence=(x,a)=>x<=a?x*x*(3*a-x)/6:a*a*(3*x-a)/6;
function followerZ(theta,x,profile){
 const dx=x-GEAR.camX;let z=tipZ;
 for(let i=0;i<12;i++){
  const a=Math.atan2(z-GEAR.camZ,dx)+theta*D,r=flangeUnder(a,.0007/profile.radius,profile)+.0007;
  z=GEAR.camZ-Math.sqrt(Math.max(0,r*r-dx*dx));
 }
 return z;
}
// Two cantilever leaves bend IN PLAN toward fixed shorting contacts. Dimensions,
// linear Euler-Bernoulli compliance and clamp positions are reconstructed.
// Once a contact closes its reaction keeps that point fixed while the free end
// continues following the cam. The motion is solved, not scaled by a mute boolean.
export const MUTE_LEAVES=Object.freeze([0,0].map((dx,k)=>{
 const endX=tipX+dx,rootX=MUTING.x[0]+.003;
 return Object.freeze({rootX,rootZ:MUTING.z[1],endX,freeTipZ:followerZ(0,endX,MUTE_CAM),y:-.0176+(k?.00055:-.00055),contactFraction:.45,gap:MUTING.openGap});
}));
export function muteLeafPose(theta,index,profile=MUTE_CAM,leaf=MUTE_LEAVES[index]){
 const L=leaf.endX-leaf.rootX,a=L*leaf.contactFraction,tip=followerZ(theta,leaf.endX,profile),d=tip-leaf.freeTipZ;
 const LL=influence(L,L),aa=influence(a,a),aL=influence(a,L),La=influence(L,a);
 let F=d/LL,R=0;
 const freeContact=F*aL,closed=freeContact<=-leaf.gap;
 if(closed){const determinant=LL*aa-La*aL;F=(d*aa+leaf.gap*La)/determinant;R=(-leaf.gap*LL-d*aL)/determinant;}
 const displacement=x=>F*influence(x,L)+R*influence(x,a);
 const zAt=t=>leaf.rootZ+(leaf.freeTipZ-leaf.rootZ)*t+displacement(t*L);
 return {closed,gap:Math.max(0,leaf.gap+displacement(a)),tipZ:tip,zAt,
  contact:{x:leaf.rootX+a,y:leaf.y,z:zAt(leaf.contactFraction)},
  fixed:{x:leaf.rootX+a,y:leaf.y,z:leaf.rootZ+(leaf.freeTipZ-leaf.rootZ)*leaf.contactFraction-leaf.gap-2*MUTING.contactR},
  forceOverEI:F,reactionOverEI:R};
}
export const muteContacts=theta=>MUTE_LEAVES.map((_,i)=>muteLeafPose(theta,i).closed);

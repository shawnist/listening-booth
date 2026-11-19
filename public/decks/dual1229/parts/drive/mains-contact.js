// Early plain1229 switch: manual pp11–12, p14 Fig25, exploded Fig31.
// 188 drives rigid rail167; rail operates the snap mechanism and contact carrier.
// The pierced coupling, guide168 placement and internal dimensions below are an
// ESTIMATED reconstruction, not measured factory geometry. Fig25 supplies only
// 0.3–0.5mm overtravel; the nose datum uses its 0.4mm midpoint once, as component
// data. The later switch and1229Q linkage are different variants.
import {SHAFT_192} from '../automatic/place.js';
const rot=(p,a)=>[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a)];
export const MAINS_LINK=Object.freeze({
 coupling:Object.freeze([-.038,-.051]),y:-.0255,length:.155,width:.004,
 roller:Object.freeze({x:-.087,z:.005,r:.0015}),
 springX:-.006,springPost:.006,springFree:.006,
 openAngle:-.1,closedAngle:.1,padOrbit:.008,padR:.0005,
 noseAdjustment:.0004,guideMin:.125,guideMax:.150,
});
export function railFromArm(yaw,g=MAINS_LINK){
 const d=rot(g.coupling,yaw),pin={x:SHAFT_192.x+d[0],z:SHAFT_192.z+d[1]};
 const dx=g.roller.x-pin.x,dz=g.roller.z-pin.z,D=Math.hypot(dx,dz),h=g.width/2+g.roller.r;
 if(D<h)return{valid:false};
 const angle=Math.atan2(dz,dx)-Math.asin(h/D),u=[Math.cos(angle),Math.sin(angle)],n=[-u[1],u[0]];
 const along=dx*u[0]+dz*u[1],gap=dx*n[0]+dz*n[1]-h;
 return{valid:along>=g.guideMin&&along<=g.guideMax,pin,angle,u,n,along,rollerGap:gap,
 nose:{x:pin.x+g.length*u[0],z:pin.z+g.length*u[1]}};
}
// Fixed housing frame is established from component datum, independent of the
// live188 yaw. Carrier spring torque, not desired electrical state, selects a stop.
export function mainsFrame(g=MAINS_LINK){
 const ref=railFromArm(0,MAINS_LINK),U=ref.n,V=ref.u;
 const az=MAINS_LINK.springX*Math.tan(MAINS_LINK.openAngle)+MAINS_LINK.noseAdjustment;
 return{U,V,pivot:{x:ref.nose.x-MAINS_LINK.springX*U[0]-az*V[0],z:ref.nose.z-MAINS_LINK.springX*U[1]-az*V[1]}};
}
export function mainsCarrierPoint(angle,r,g=MAINS_LINK){
 const f=mainsFrame(g),x=r*Math.cos(angle),z=r*Math.sin(angle);
 return{x:f.pivot.x+f.U[0]*x+f.V[0]*z,z:f.pivot.z+f.U[1]*x+f.V[1]*z};
}
export function switchFromArm(yaw,previous=null,g=MAINS_LINK){
 const rail=railFromArm(yaw,g);if(!rail.valid)return{...rail,closed:false,reason:'167 exceeds finite168 guide'};
 const f=mainsFrame(g),adjust=g.noseAdjustment-MAINS_LINK.noseAdjustment;
 const anchor={x:rail.nose.x+adjust*f.V[0],z:rail.nose.z+adjust*f.V[1]};
 const dx=anchor.x-f.pivot.x,dz=anchor.z-f.pivot.z;
 const ax=dx*f.U[0]+dz*f.U[1],az=dx*f.V[0]+dz*f.V[1];
 let angle=previous?.carrierAngle??g.openAngle;
 const torque=a=>Math.cos(a)*az-Math.sin(a)*ax;
 const springLength=a=>Math.hypot(ax-g.springPost*Math.cos(a),az-g.springPost*Math.sin(a));
 if(springLength(angle)>g.springFree){if(torque(angle)>1e-12)angle=g.closedAngle;else if(torque(angle)<-1e-12)angle=g.openAngle;}
 const moving=mainsCarrierPoint(angle,g.padOrbit,g),atClosed=mainsCarrierPoint(g.closedAngle,g.padOrbit,g);
 const fixed={x:atClosed.x+2*g.padR*f.V[0],z:atClosed.z+2*g.padR*f.V[1]};
 const contactGap=Math.hypot(moving.x-fixed.x,moving.z-fixed.z)-2*g.padR;
 return{...rail,railAngle:rail.angle,carrierAngle:angle,moving,fixed,frame:f,
 springAnchor:anchor,springPost:mainsCarrierPoint(angle,g.springPost,g),springLength:springLength(angle),
 contactGap,closed:contactGap<1e-9,overtravel:az-ax*Math.tan(g.openAngle)};
}

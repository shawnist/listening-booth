// Plain1229 p10 Fig18:64 and220 share a horizontal shaft;270 rocks about234.
// Profile/pivot dimensions are reconstructed estimates, not factory measurements.
// Fig18 raised pose:220's deep lobe points down and270's bent input paddle
// is parallel to the chassis. This solves only220→270. The bent output hook/243
// seat and218 adjustment remain an assembly boundary; outputY cannot force206.
import {CONTROLS} from './place.js';
import {PIVOT} from '../../layout.js';
import {CUE} from '../../cue-geometry.js';
const c=CONTROLS.cue;
const axis={x:c.x-.009,y:c.y,z:c.z};
const target={x:PIVOT.x+CUE.axisX,z:PIVOT.z+CUE.axisZ};
const length=Math.hypot(target.x-axis.x,target.z-axis.z);
const dir={x:(target.x-axis.x)/length,z:(target.z-axis.z)/length};
// Fulcrum234 at 0.549 of the220-to-206 span: measured on plain1229 Fig.18 at 800 dpi
// (220 shaft x2482, 234 pin x4083, 206 axis x5400 px). Drawing-measured, not factory data.
const input=length*.549;
// Polygonal trace of the rounded cam in plain1229 Fig18, raised pose.
// Source drawing pixels are normalized about its shaft centre; scale is estimated.
// The fixed -.73 installation phase keeps the same shaft as handle64.
const raisedAngle=.73,scale=.000086;
const outline=[[356,310],[356,390],[368,403],[400,405],[424,393],[445,371],
 [452,341],[446,307],[430,283],[405,271],[379,276],[360,291]];
const raisedProfile=outline.map(([x,y])=>[(309-y)*scale,(399-x)*scale]);
const profile=raisedProfile.map(([y,z])=>[y*Math.cos(raisedAngle)+z*Math.sin(raisedAngle),
 -y*Math.sin(raisedAngle)+z*Math.cos(raisedAngle)]);
const thickness=.0008,pivot={x:axis.x+dir.x*input,y:-.0155,z:axis.z+dir.z*input};
const bendRoot=-input+.012;
// Fixed assembly calibration to the source's horizontal cue-up paddle, not an arm
// height target. Both paddle bend and cam installation phase remain constant.
const camBottom=axis.y+Math.min(...raisedProfile.map(p=>p[0]));
const paddleBend=Math.asin((camBottom-pivot.y-thickness/2)/(-bendRoot));
export const CUE_LINK={axis,target,dir,input,output:length-input,pivot,thickness,
 camThickness:.002,profile,bendRoot,paddleBend,raisedAngle};
export function manualLeverPose(angle,profile=CUE_LINK.profile){
 const L=CUE_LINK,co=Math.cos(angle),si=Math.sin(angle),points=[];
 for(const [y,z] of profile)for(const x of [-L.camThickness/2,L.camThickness/2]){
  const p={x:L.axis.x+x,y:L.axis.y+y*co-z*si,z:L.axis.z+y*si+z*co};
  points.push({...p,s:(p.x-L.pivot.x)*dir.x+(p.z-L.pivot.z)*dir.z});
 }
 const distance=(p,b)=>(p.y-L.pivot.y)*Math.cos(b+L.paddleBend)-p.s*Math.sin(b+L.paddleBend)+L.bendRoot*Math.sin(L.paddleBend);
 const gap=b=>Math.min(...points.map(p=>distance(p,b)))-L.thickness/2;
 let lo=-.3,hi=.3;
 if(gap(lo)>0||gap(hi)<0)return {valid:false,angle};
 for(let i=0;i<52;i++){const m=(lo+hi)/2;if(gap(m)>0)hi=m;else lo=m;}
 const tilt=(lo+hi)/2;
 const contact=points.reduce((a,b)=>(distance(a,tilt)<distance(b,tilt)?a:b));
 return {valid:true,angle,tilt,contact,outputY:L.pivot.y+L.output*Math.tan(tilt)+L.thickness/2/Math.cos(tilt),
  boundary:'270 bent hook /243 seat and218 adjustment unresolved'};
}

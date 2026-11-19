// Finite horizontal cylinder against the actual triangulated channel material.
// Compression spring123 seats the pin on the lower wall. It imposes preload,
// not a prescribed height; its unmeasured force/rate is not simulated here.
import { channelData } from './channel-data.js';
import { SPEED_AXIS } from './place.js';

function clip(poly, component, value, sign) {
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[component]-value),db=sign*(b[component]-value);
    if(da>=0)out.push(a);
    if((da>=0)!==(db>=0)){const t=da/(da-db);out.push(a.map((v,k)=>v+(b[k]-v)*t));}
  }
  return out;
}
// Max(y + sqrt(radius²-v²)) on the triangle clipped by the finite pin's
// axial cap planes and cylindrical width. Concavity puts a maximum on an edge
// unless the axial plane slope is zero, when the same maximum reaches an edge.
function supportingHeight(triangle, pin, sign) {
  const {x,z,dx,dz,length,radius}=pin;
  let poly=triangle.map(([tx,y,tz])=>[(tx-x)*dx+(tz-z)*dz,sign*y,(tx-x)*(-dz)+(tz-z)*dx]);
  if(Math.max(...poly.map(p=>p[0]))<0||Math.min(...poly.map(p=>p[0]))>length||Math.max(...poly.map(p=>p[2])) < -radius||Math.min(...poly.map(p=>p[2])) >radius)return -Infinity;
  for(const [axis,value,sgn] of [[0,0,1],[0,length,-1],[2,-radius,1],[2,radius,-1]]){poly=clip(poly,axis,value,sgn);if(!poly.length)return -Infinity;}
  const value=(y,v)=>y+Math.sqrt(Math.max(0,radius*radius-v*v));
  let result=-Infinity;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];result=Math.max(result,value(a[1],a[2]));
    const dv=b[2]-a[2];if(Math.abs(dv)<1e-15)continue;
    const slope=(b[1]-a[1])/dv,v=radius*slope/Math.sqrt(1+slope*slope),t=(v-a[2])/dv;
    if(t>0&&t<1)result=Math.max(result,value(a[1]+t*(b[1]-a[1]),v));
  }
  return result;
}
export function channelPinBounds(follower, selectorAngle, profile, radius=.001, length=.0045, checkUpper=true) {
  const c=Math.cos(selectorAngle),s=Math.sin(selectorAngle),x=follower.x-SPEED_AXIS.x,z=follower.z-SPEED_AXIS.z;
  const pin={x:x*c-z*s,z:x*s+z*c,dx:follower.dx*c-follower.dz*s,dz:follower.dx*s+follower.dz*c,radius,length};
  const ex=pin.x+pin.dx*length,ez=pin.z+pin.dz*length;
  const box=[Math.min(pin.x,ex)-radius,Math.max(pin.x,ex)+radius,Math.min(pin.z,ez)-radius,Math.max(pin.z,ez)+radius];
  const overlaps=t=>t.box[0]<=box[1]&&t.box[1]>=box[0]&&t.box[2]<=box[3]&&t.box[3]>=box[2];
  const data=channelData(profile);let lower=-Infinity,upper=-Infinity;
  for(const triangle of data.speedChannelLower.triangles)if(overlaps(triangle))lower=Math.max(lower,supportingHeight(triangle,pin,1));
  if(checkUpper)for(const triangle of data.speedChannelUpper.triangles)if(overlaps(triangle))upper=Math.max(upper,supportingHeight(triangle,pin,-1));
  return {lower,upper:-upper};
}

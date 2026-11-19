// Segment201 meets the raised255 stop: plain1229 p10 Fig16/18.
// Component dimensions/selector positions reconstructed from the previous fit.
// They are fixed material data, NOT generated from a requested stylus set-down.
// Exact indexing eccentric276 profile and257 lift actuation remain unmeasured.
import { SPEC } from './spec.js';
import { PIVOT } from './layout.js';
import { INDEX_SLIDE, SEGMENT } from './parts/automatic/place.js';
export const SIZE_STOP = Object.freeze({
  studOffset: -0.16087977233868722, studRadius: .0017, postRadius: .0012,
  studBottom:INDEX_SLIDE.studBottom,studTop:SEGMENT.y-SEGMENT.t/2,
  postBottom:INDEX_SLIDE.y,postTop:INDEX_SLIDE.studBottom-.0003,rise:INDEX_SLIDE.rise,
  positions: Object.freeze({
    7: Object.freeze({x:.15351398360551283,z:-.06554088413184281}),
    10: Object.freeze({x:.1605385105700448,z:-.062018993351289686}),
    12: Object.freeze({x:.1657757511666466,z:-.06035594187324184}),
  }),
});
export function stopContact(size, geometry=SIZE_STOP) {
  const post=geometry.positions[size] || geometry.positions[12], dx=post.x-PIVOT.x,dz=post.z-PIVOT.z;
  const distance=Math.hypot(dx,dz), r=INDEX_SLIDE.stopR, sum=geometry.studRadius+geometry.postRadius;
  const cosine=(distance*distance+r*r-sum*sum)/(2*distance*r);
  if(cosine>1||cosine< -1)return null; // physically unreachable stop: do not invent contact
  const studAngle=Math.atan2(dz,dx)-Math.acos(cosine), armAngle=studAngle-geometry.studOffset;
  return {armAngle,radius:Math.hypot(PIVOT.x+SPEC.armL*Math.cos(armAngle),PIVOT.z+SPEC.armL*Math.sin(armAngle)),
    stud:{x:PIVOT.x+r*Math.cos(studAngle),z:PIVOT.z+r*Math.sin(studAngle)},post};
}
export function stopPost(size,geometry=SIZE_STOP){return geometry.positions[size]||geometry.positions[12];}
// The257 actuator's travel is still an explicit phase command. Shared finite
// material overlap, not that command, authorizes the segment's horizontal stop.
export function stopEngaged(rise,geometry=SIZE_STOP){
 return Math.min(geometry.postTop+rise,geometry.studTop)-Math.max(geometry.postBottom+rise,geometry.studBottom)>0;
}
export function sizeStopPose(size,raised,geometry=SIZE_STOP){
 const post=stopPost(size,geometry),reference=stopPost(12,geometry),F=INDEX_SLIDE.front;
 const direction=Math.atan2(reference.z-F.z,reference.x-F.x),length=Math.hypot(reference.x-F.x,reference.z-F.z);
 const a=Math.atan2(post.z-F.z,post.x-F.x)-direction,t=Math.hypot(post.x-F.x,post.z-F.z)-length;
 const c=Math.cos(a),s=Math.sin(a),rise=raised?geometry.rise:0,contact=stopContact(size,geometry);
 const overlap=Math.min(geometry.postTop+rise,geometry.studTop)-Math.max(geometry.postBottom+rise,geometry.studBottom);
 return {a,x:F.x-(F.x*c-F.z*s)+Math.cos(direction+a)*t,z:F.z-(F.x*s+F.z*c)+Math.sin(direction+a)*t,
  y:rise,postBottom:geometry.postBottom+rise,postTop:geometry.postTop+rise,overlap,contact,engaged:overlap>0&&contact!==null};
}

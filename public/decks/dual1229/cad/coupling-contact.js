// Finite exported CAD184 lip drives a rigid installed201/229 pin.
// Cam program and pin installation are explicitly estimated, not factory measurements.
// Provisional installed229 scenario, constrained against the actual CAD184 lip.
// The pin is rigid on201. Its radius/height are installation assumptions, NOT
// measurements. A fixed cam program moves184; tangential contact then moves
// the arm. External stops cause slip. Cam-track geometry and forces are unsolved.
import * as THREE from 'three';
import { AUTO, radiusForAngle } from '../automatic-contact.js';
import { PIVOT } from '../layout.js';
import { createCamContact } from './cam-contact.js';
import { REST } from '../spec.js';
import { cueArmAngle } from '../cue-geometry.js';

// Estimated extent of the dry friction strip on the plain-1229 spade.
export const LIP_LENGTH = .008;

const V = (x,y,z) => new THREE.Vector3(x,y,z);
const translate = p => new THREE.Matrix4().makeTranslation(p.x,p.y,p.z);
const turn = (p,axis,a) => translate(p).multiply(new THREE.Matrix4().makeRotationAxis(axis,a)).multiply(translate(p.clone().negate()));
const cross = (a,b,c) => (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function inTriangle(p,t) {
  const d=t.map((q,i)=>cross(q,t[(i+1)%3],p));
  return d.every(x=>x>=-1e-13)||d.every(x=>x<=1e-13);
}
function clipX(poly,min) {
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],ai=a.x>=min,bi=b.x>=min;
    if(ai)out.push(a.clone());
    if(ai!==bi)out.push(a.clone().lerp(b,(min-a.x)/(b.x-a.x)));
  }
  return out;
}

export function createCouplingContact({root,lever,follower,kit={},datums,capWear=0}) {
  if(!lever)return null;
  const pivot=new THREE.Vector3(...datums.leverPivot),h=datums.leverHeading;
  const along=V(Math.cos(h),0,-Math.sin(h)),side=V(Math.sin(h),0,Math.cos(h));
  const top=.0032,lipLength=LIP_LENGTH,radius=.0018,newLength=.004,releaseGap=.0008;
  if (!Number.isFinite(capWear) || capWear < 0 || capWear >= newLength) throw new RangeError('Cap wear must leave a positive installed length.');
  const capLength=newLength-capWear;
  root.updateWorldMatrix(true,true);
  const rootInv=root.matrixWorld.clone().invert();
  const local=p=>{const d=p.clone().sub(pivot);return V(d.dot(along),d.y,d.dot(side));};
  const triangles=[];let tip=-Infinity;
  lever.traverse(o=>{
    if(!o.isMesh)return;
    const m=rootInv.clone().multiply(o.matrixWorld),g=o.geometry,pos=g.attributes.position,ix=g.index;
    const count=ix?ix.count:pos.count;
    for(let i=0;i<count;i+=3){
      const t=[0,1,2].map(k=>local(V().fromBufferAttribute(pos,ix?ix.getX(i+k):i+k).applyMatrix4(m)));
      for(const p of t)tip=Math.max(tip,p.x);
      if(t.every(p=>Math.abs(p.y-top)<2e-6))triangles.push(t);
    }
  });
  const lip=[];
  for(const t of triangles){const poly=clipX(t,tip-lipLength);for(let i=1;i<poly.length-1;i++)lip.push([poly[0],poly[i],poly[i+1]]);}
  if(!lip.length)throw new Error('CAD184 has no finite bare-lip triangles at its published height');

  const followerBox=new THREE.Box3();
  follower?.traverse(o=>{if(!o.isMesh)return;const m=rootInv.clone().multiply(o.matrixWorld),p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)followerBox.expandByPoint(V().fromBufferAttribute(p,i).applyMatrix4(m));});
  const followerTop=followerBox.isEmpty()?null:followerBox.getCenter(V()).setY(followerBox.max.y);
  const restAngle=cueArmAngle(REST),restYaw=-(restAngle-AUTO.armMid);
  // One installation point at the bare lip centre, retained for every state.
  const k=pivot.clone().addScaledVector(along,tip-lipLength/2);
  const seat=pivot.y+top+releaseGap+newLength;
  const bottom=seat-capLength;
  const offset=V(k.x-PIVOT.x,0,k.z-PIVOT.z).applyAxisAngle(V(0,1,0),-restYaw);
  const segment=kit.parts?.segment?.groups?.[0];
  const segmentY=segment?.position.y??AUTO.segmentY;
  const carrier=new THREE.Group();carrier.name='cad229Carrier';root.add(carrier);
  // MAARC pp.19–21 show a rounded, pale replacement cap on a narrower pin,
  // above a dark guide with a bright rim. Its section is unmeasured. Revolve
  // the socket so the pin actually seats inside it. The flat driving face
  // has the same radius used by the finite lip contact below.
  const pinRadius=.001, insertion=.001;
  const lower=-capLength/2, upper=capLength/2;
  const shoulder=Math.min(.00018,capLength/5);
  const socketFloor=Math.max(lower,upper-insertion);
  const section=[
    ...(socketFloor>lower?[[0,lower]]:[[pinRadius,lower]]),
    [radius,lower], [radius+.00010,lower+shoulder],
    [radius+.00010,upper-shoulder], [radius,upper], [pinRadius,upper],
    [pinRadius,socketFloor], ...(socketFloor>lower?[[0,socketFloor]]:[]),
  ];
  const cap=new THREE.Mesh(new THREE.LatheGeometry(section.map(([r,y])=>new THREE.Vector2(r,y)),96),
    new THREE.MeshPhysicalMaterial({color:0xdbd7c8,roughness:.54,metalness:0,
      specularIntensity:.40,clearcoat:.10,clearcoatRoughness:.48}));
  cap.name='cad229Cap';cap.position.set(offset.x,bottom-segmentY+capLength/2,offset.z);carrier.add(cap);
  const pinTop=AUTO.segmentT/2+.0003,pinBottom=seat-segmentY-insertion;
  const pin=new THREE.Mesh(new THREE.CylinderGeometry(pinRadius,pinRadius,pinTop-pinBottom,40),
    new THREE.MeshStandardMaterial({color:0x8b8172,roughness:.38,metalness:.76}));
  pin.name='cad201CouplingPin';pin.position.set(offset.x,(pinTop+pinBottom)/2,offset.z);carrier.add(pin);
  // The wider stationary sleeve meets the underside of the segment. Its lip
  // ends above the compliant cap, so it cannot transmit horizontal drive.
  const underside=-AUTO.segmentT/2,sleeveLength=(underside-(seat-segmentY))*.78;
  const sleeveSection=[[pinRadius,0],[.00218,0],[.00218,-sleeveLength+.0003],
    [.00225,-sleeveLength+.00025],[.00225,-sleeveLength+.00012],[.00210,-sleeveLength],
    [pinRadius,-sleeveLength],[pinRadius,0]];
  const sleeve=new THREE.Mesh(new THREE.LatheGeometry(sleeveSection.reverse().map(([r,y])=>new THREE.Vector2(r,y)),64),
    new THREE.MeshStandardMaterial({color:0x393b3b,roughness:.41,metalness:.70}));
  sleeve.name='cad201PinSleeve';sleeve.position.set(offset.x,underside,offset.z);carrier.add(sleeve);
  const hardware=[cap,pin,sleeve];
  for(const o of hardware){o.castShadow=true;o.receiveShadow=true;o.userData.part='cad:coupling:229';}
  const metadata={key:'cad:coupling:229',name:'229 cap on segment 201 pin and sleeve',no:'229 / 201',groups:[carrier],meshes:hardware};
  if(kit.parts)kit.parts[metadata.key]=metadata;

  // Highest point of the finite lip under a flat circular cap. Candidates are
  // the plane's uphill rim point, triangle vertices and edge-circle crossings.
  // This uses the exported surface rather than a second analytic lip outline.
  function support(center,yaw,tilt){
    const q=new THREE.Quaternion().setFromAxisAngle(V(0,1,0),yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(side,tilt));
    const n=V(0,1,0).applyQuaternion(q),origin=pivot.clone().add(V(0,top,0).applyQuaternion(q));
    const at=(x,z)=>origin.y-(n.x*(x-origin.x)+n.z*(z-origin.z))/n.y;
    let best=null;
    const planar=lip.map(t=>t.map(p=>pivot.clone().add(along.clone().multiplyScalar(p.x)).add(V(0,p.y,0)).add(side.clone().multiplyScalar(p.z)).sub(pivot).applyQuaternion(q).add(pivot)));
    const candidates=[V(center.x,0,center.z)];
    const slope=Math.hypot(n.x,n.z);
    if(slope>1e-12)candidates.push(V(center.x-radius*n.x/slope,0,center.z-radius*n.z/slope));
    for(const t of planar)for(let i=0;i<3;i++){
      const a=t[i],b=t[(i+1)%3];
      if(Math.hypot(a.x-center.x,a.z-center.z)<=radius+1e-12)candidates.push(a);
      const dx=b.x-a.x,dz=b.z-a.z,ox=a.x-center.x,oz=a.z-center.z;
      const A=dx*dx+dz*dz,B=2*(ox*dx+oz*dz),C=ox*ox+oz*oz-radius*radius,disc=B*B-4*A*C;
      if(A<1e-20||disc<0)continue;
      for(const u of [(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)])if(u>=0&&u<=1)candidates.push(a.clone().lerp(b,u));
    }
    for(const p of candidates)if(planar.some(t=>inTriangle(p,t))){const y=at(p.x,p.z);if(!best||y>best.y)best=V(p.x,y,p.z);}
    return best;
  }
  const maxCompression=.0006;
  const rubberBeyondPin=capLength-insertion;
  const status={classification:'finite CAD lip with fixed estimated cam input and tangential no-slip carry; not a measured cam or force solve',
    followerRest:followerTop?.toArray()??null,pinRadius:offset.length(),capRadius:radius,capLength,releaseGap,lipTip:tip,lipTriangles:lip.length,
    program:{yawRadians:[.11,-.015],tiltRadians:[0,.017],outwardDegrees:[28,52],inwardDegrees:[170,195],liftDegrees:[3,28],releaseDegrees:[314,334],stopReleaseDegrees:[265,300],stopResetDegrees:[300,360]},
    assumptions:['229 installed at neutral bare-lip centre; real pin placement unknown',
      '0.8mm installed release gap; 0.6mm maximum cap compression estimated',
      '201/229 fixed height in both modes: horizontal multi scenario only',
      'Fixed cam phase/yaw/tilt program estimated; no measured165 track'],modeRiseApplied:false,valid:false};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
  function pinCenter(angle){
    const p=offset.clone().applyAxisAngle(V(0,1,0),-(angle-AUTO.armMid));
    return V(PIVOT.x+p.x,bottom,PIVOT.z+p.z);
  }
  // The two swings as the owner timed them on the real deck at 33 rpm (2026-11-19): 1.7 s from the
  // rest to the edge of a 12 in record, just over 2 s back to the rest from the run-out. The lever's
  // program was written over 24 and 25 degrees of cam, which took the arm there in about 0.4 s.
  // [A,B] is that first arc; it is now run from A to NEW: its first K degrees spread evenly over the
  // first T (the part the arm is seen to move in), the rest quickening smoothly. The out-swing ends
  // where the record-drop window opens (95), the in-swing before the lift lets go (RELEASE).
  // The cam table in automatic-profile.js, used when these CAD parts are not loaded, is timed the same.
  // The lever lets the lift go from RELEASE degrees. It was 265, which set the stylus down about a
  // second and a half before the cam was home, behind the muting switch: nothing of the landing was
  // heard. The owner asked to hear it (2026-11-19), so the lift is let go late enough that, coming
  // down through its oil in 2 s, the stylus lands just after the cam is home and the switch has
  // opened: at 33, 45 and 78 rpm. The manual (p.12) has the switch still closed at touchdown.
  // Only on a start: on a stop the lift is let go at 265 as before. And only here: the cam table used
  // without these CAD parts (automatic-profile.js) keeps 265, because its lever goes on moving after
  // 300 and would carry a still-lifted arm off the record's edge.
  const RELEASE=314,RELEASE_ARC=20; // let go over 314-334: done before the stop track swings in beside this one (from about 336)
  const SWING_OUT=[28,52,95,63,15.7],SWING_IN=[170,195,255,51,7.4];
  const retime=(t,[A,B,NEW,T,K])=>{
    if(t<=A)return t;if(t>=NEW)return B;
    const u=t-A;if(u<=T)return A+K*u/T;
    const v=u-T,L=NEW-A-T,s1=K/T,s2=2*(B-A-K)/L-s1;return A+K+s1*v+(s2-s1)*v*v/(2*L);
  };
  function pose(theta,branch='start'){
    const t=clamp(theta,0,360);
    const outward=smooth((retime(t,SWING_OUT)-28)/24),inward=branch==='stop'?0:smooth((retime(t,SWING_IN)-170)/25);
    const reset=branch==='stop'?smooth((t-300)/60):0;
    const beta=.11-.125*outward+.125*inward+.125*reset;
    const lift=smooth((t-3)/25)*(1-(branch==='stop'?smooth((t-265)/35):smooth((t-RELEASE)/RELEASE_ARC))); // a stop sets the arm on its rest before the lever swings back
    const tilt=.017*lift;
    const delta=turn(pivot,V(0,1,0),beta).multiply(turn(pivot,side,tilt));
    return {beta,tilt,valid:true,theta:t,branch,estimated:true,follower:followerTop?.clone().applyMatrix4(delta).toArray()??null};
  }
  const cam=createCamContact({root,kit,pivot,side,follower:followerTop,program:pose, radius:followerBox.isEmpty()?.001:(followerBox.max.x-followerBox.min.x)/2});
  const solvedPose=cam?cam.pose:pose;
  status.cam=cam?.status;
  status.classification='Finite exported184/229 contact; fixed estimated165 guide with numerical follower constraint';
  function contact(p,angle,_mode='single'){
    const center=pinCenter(angle),point=support(center,p.beta,p.tilt),overlap=!!point;
    const interference=point?point.y-bottom:-Infinity;
    const blocked=overlap&&interference>maxCompression;
    // A worn guide can expose the smooth metal pin (MAARC p.19). It then
    // loses friction drive, even with the cam and lever still moving.
    const pinExposed=rubberBeyondPin<=Math.max(0,interference);
    return {overlap,interference,compression:overlap?clamp(interference,0,Math.max(0,Math.min(maxCompression,rubberBeyondPin))):0,
      engaged:p.valid&&overlap&&interference>1e-9&&!blocked&&!pinExposed,blocked,pinExposed,surface:point?.y??-Infinity,
      point:point?.toArray()??null,center:center.toArray(),gap:point?bottom-point.y:null};
  }
  function carry(r,previous,next,_mode='single'){
    const a=cueArmAngle(r);
    if(!contact(next,a,_mode).engaged)return r;
    const p=pinCenter(a),dx=p.x-PIVOT.x,dz=p.z-PIVOT.z;
    const delta=next.beta-previous.beta;
    const vx=(p.z-pivot.z)*delta,vz=-(p.x-pivot.x)*delta;
    const da=(-dz*vx+dx*vz)/(dx*dx+dz*dz);
    return radiusForAngle(a+da);
  }
  // Contract: all points are deck metres, Y up; theta is cam degrees,
  // beta/tilt and arm angle are radians. Mode is accepted but horizontal
  // coupling remains the explicitly fixed-height scenario in both modes.
  // carry returns the unchanged radius whenever the next finite contact is open.
  const model={pose:solvedPose,contact,carry,pinCenter,metadata:status};
  let enabled=true;
  function setEnabled(value){enabled=!!value;status.enabled=enabled;carrier.visible=enabled;cam?.setEnabled(enabled);}
  function render(p,angle,mode='single',slip=false){
    cam?.render(p.theta,p);
    const c=contact(p,angle,mode),center=pinCenter(angle);
    // The cap deforms axially; its top stays fixed to its pin. No lever pose
    // depends on this contact response or the current arm angle.
    carrier.position.set(PIVOT.x,segmentY,PIVOT.z);
    carrier.rotation.y=-(angle-AUTO.armMid);carrier.updateMatrix();
    cap.scale.y=(capLength-c.compression)/capLength;
    cap.position.y=bottom-segmentY+capLength/2+c.compression/2;
    carrier.updateWorldMatrix(true,true);
    const swivel=turn(pivot,V(0,1,0),p.beta),delta=swivel.clone().multiply(turn(pivot,side,p.tilt));
    Object.assign(status,{valid:p.valid,active:c.engaged,carrying:c.engaged,slip,pose:p,contact:c,
      center:center.toArray(),point:c.point,gap:c.gap,mode,
      worldCenter:center.clone().add(V(0,c.compression,0)).applyMatrix4(root.matrixWorld).toArray(),
      worldPoint:c.point?V(...c.point).applyMatrix4(root.matrixWorld).toArray():null});
    return {delta,swivel,yaw:p.beta,tilt:p.tilt};
  }
  function dispose(){cam?.dispose();carrier.removeFromParent();for(const o of hardware){o.geometry.dispose();o.material.dispose();}if(kit.parts)delete kit.parts[metadata.key];}
  return {model,render,support,status,carrier,cap,pin,meshes:[...hardware,...(cam?.meshes||[])],setEnabled,dispose};
}

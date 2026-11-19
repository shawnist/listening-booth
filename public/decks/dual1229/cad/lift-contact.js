// Installed reconstruction scenario, not factory dimensions. Lower finite
// surfaces select 206 height; the arm then rests on 198, 66, record or the hand.
import * as THREE from 'three';
import { ARM_CAD, PAD_BOTTOM, cadPadContact, cadPoseForHeight, cadStylusRise } from './arm.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const I=()=>new THREE.Matrix4();
const translate=(x=0,y=0,z=0)=>new THREE.Matrix4().makeTranslation(x,y,z);
const turn=(p,axis,a)=>translate(...p.toArray()).multiply(new THREE.Matrix4().makeRotationAxis(axis,a)).multiply(translate(-p.x,-p.y,-p.z));
const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
// Where the cue and cycle source solids were built: the plain Fig.33/34 mark, now known to be the fixed
// post in front of the bearing. The owner confirmed on the deck (2026-11-19) that only the post on the
// spindle side rises with the cue lever, so the installed axis below stands there, under the quarter
// shelf, and lift-installation.js carries the pin, guide, hook and balance plate across to it.
export const LIFT_SOURCE_AXIS=Object.freeze({x:.1734,z:-.0875});
export const LIFT_INSTALLATION=Object.freeze({
  classification:'estimated installed lower-lift and underside-on-rest scenario',
  axis:Object.freeze({x:.1609,z:-.0965}), footRadius:.0015,
  // The shelf underside is 4.2 mm above the old pad: the pin's upper end and its cap rise by that.
  capRaise:.0042, capRadius:.0015,
  sourceFoot:-.034,footLowStop:-.01925,multiRaise:.005,modeLowStopRaise:.0045,
  hookExtension:.01475,
  remap206:Object.freeze({part:'cue.206.lift_bolt',sourceFootTop:-.028463,sourcePistonTop:.025325,
    instruction:'Translate foot vertices through foot top upward 14.75 mm; linearly shorten piston from that moved foot top to unchanged piston top; retain upper pin/cap.'}),
  remap270:Object.freeze({part:'cue.270.connecting_lever',sourceHookTop:-.034722521891776225,
    instruction:'Extend only the upward hook-tab top 14.75 mm; retain bar, paddle and fulcrum.'}),
});
function find(root,name){let result;root.traverse(n=>{if(n.name===name||n.userData.name===name||n.userData.cadOriginalName===name)result=n;});return result;}
export function liftTriangles(root,node){
  if(!node)return[];root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),out=[];
  node.traverse(n=>{if(!n.isMesh)return;const m=inverse.clone().multiply(n.matrixWorld),p=n.geometry.attributes.position,ix=n.geometry.index;
    for(let i=0;i<(ix?.count??p.count);i+=3)out.push([0,1,2].map(j=>V().fromBufferAttribute(p,ix?ix.getX(i+j):i+j).applyMatrix4(m)));});return out;
}
const transformed=(triangles,m)=>triangles.map(t=>t.map(p=>p.clone().applyMatrix4(m)));
function clip(subject,triangle){
  let poly=subject;const sign=Math.sign(cross(triangle[0],triangle[1],triangle[2]));if(!sign)return[];
  for(let j=0;j<3&&poly.length;j++){
    const a=triangle[j],b=triangle[(j+1)%3],out=[];
    for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],d=sign*cross(a,b,p),e=sign*cross(a,b,q),inside=d>=-1e-13;
      if(inside)out.push(p);if(inside!==(e>=-1e-13))out.push(p.clone().lerp(q,d/(d-e)));}poly=out;
  }return poly;
}
const plane=t=>new THREE.Plane().setFromCoplanarPoints(...t);
const planeY=(p,x,z)=>(-p.constant-p.normal.x*x-p.normal.z*z)/p.normal.y;
const bounds=t=>({x0:Math.min(...t.map(p=>p.x)),x1:Math.max(...t.map(p=>p.x)),z0:Math.min(...t.map(p=>p.z)),z1:Math.max(...t.map(p=>p.z))});
// Exact projected triangle overlap. Gap is upper surface minus lower surface;
// both witnesses remain on the finite source triangles, including edge contact.
export function liftSurfaceGap(upper,lower){
  let best=null;const lows=lower.map(t=>({t,p:plane(t),b:bounds(t)})).filter(e=>Math.abs(e.p.normal.y)>1e-8);
  for(const t of upper){const p=plane(t);if(Math.abs(p.normal.y)<1e-8)continue;const b=bounds(t);
    for(const l of lows){if(b.x0>l.b.x1||b.x1<l.b.x0||b.z0>l.b.z1||b.z1<l.b.z0)continue;
      for(const q of clip(t,l.t)){const uy=planeY(p,q.x,q.z),ly=planeY(l.p,q.x,q.z),gap=uy-ly;
        if(!best||gap<best.gap)best={gap,upper:[q.x,uy,q.z],lower:[q.x,ly,q.z]};}}
  }return best;
}
// Exact disk/finite-triangle maximum, not an axis-only ray. A tilted surface can
// first touch the rim; vertices and edge-circle intersections cover finite edges.
export function liftDiskSupport(triangles,axis,radius){
  let best=null;
  for(const t of triangles){const p=plane(t);if(Math.abs(p.normal.y)<1e-8)continue;const b=bounds(t);
    if(axis.x+radius<b.x0||axis.x-radius>b.x1||axis.z+radius<b.z0||axis.z-radius>b.z1)continue;
    const candidates=[V(axis.x,0,axis.z)],sx=-p.normal.x/p.normal.y,sz=-p.normal.z/p.normal.y,sl=Math.hypot(sx,sz);
    if(sl>1e-12)candidates.push(V(axis.x+radius*sx/sl,0,axis.z+radius*sz/sl));
    for(let i=0;i<3;i++){const a=t[i],b=t[(i+1)%3];if(Math.hypot(a.x-axis.x,a.z-axis.z)<=radius+1e-12)candidates.push(a);
      const dx=b.x-a.x,dz=b.z-a.z,ox=a.x-axis.x,oz=a.z-axis.z,A=dx*dx+dz*dz,B=2*(ox*dx+oz*dz),C=ox*ox+oz*oz-radius*radius,D=B*B-4*A*C;
      if(A>1e-20&&D>=0)for(const u of[(-B-Math.sqrt(D))/(2*A),(-B+Math.sqrt(D))/(2*A)])if(u>=0&&u<=1)candidates.push(a.clone().lerp(b,u));}
    for(const q of candidates){const ds=t.map((a,i)=>cross(a,t[(i+1)%3],q));if(!ds.every(d=>d>=-1e-13)&&!ds.every(d=>d<=1e-13))continue;
      const height=planeY(p,q.x,q.z);if(!best||height>best.height)best={height,point:[q.x,height,q.z]};}
  }return best;
}
// The arm pitches about the gimbal's own axis, turned by ARM_CAD.gimbalSkew from the tube's cross axis.
function armMatrix(pose){return translate(ARM_CAD.pivot[0],ARM_CAD.pivot[1]+pose.raise,ARM_CAD.pivot[2])
  .multiply(new THREE.Matrix4().makeRotationY(pose.yaw+ARM_CAD.gimbalSkew)).multiply(new THREE.Matrix4().makeRotationZ(pose.pitch))
  .multiply(new THREE.Matrix4().makeRotationY(-ARM_CAD.gimbalSkew));}
function rootFor(fn,lo=-.09,hi=.13){
  let previous=null;
  for(let i=0;i<=32;i++){const x=lo+(hi-lo)*i/32,value=fn(x);if(!Number.isFinite(value)){previous=null;continue;}
    if(Math.abs(value)<1e-12)return x;
    if(previous&&previous.value*value<0){let a=previous.x,b=x,va=previous.value;for(let j=0;j<38;j++){const c=(a+b)/2,vc=fn(c);if(!Number.isFinite(vc))return null;if(va*vc<=0)b=c;else{a=c;va=vc;}}return(a+b)/2;}previous={x,value};
  }return null;
}

// Read the installed press-on joint once in the neutral assembly. The cap's
// socket ceiling bears on the pin tip. Both then translate by the foot stroke.
function readCapSeat(root) {
  const cap = liftTriangles(root, find(root, 'cue.198.cap'));
  const pin = liftTriangles(root, find(root, 'cue.206.lift_bolt'));
  if (!pin.length || !cap.length) throw new Error('Missing lift pin 206 or cap 198');
  const pinPoints = pin.flat();
  const pinTipY = Math.max(...pinPoints.map(p => p.y));
  const footY = Math.min(...pinPoints.map(p => p.y));
  const bottom = cap.filter(t => plane(t).normal.y < -.999);
  const ceilingY = Math.max(...bottom.flat().map(p => p.y));
  const tip = pinPoints.filter(p => Math.abs(p.y - pinTipY) < 1e-7);
  const socket = bottom.flat().filter(p => Math.abs(p.y - ceilingY) < 1e-7);
  const tipBox = new THREE.Box3().setFromPoints(tip);
  const socketBox = new THREE.Box3().setFromPoints(socket);
  // A 10 µm mesh-readback allowance covers the chord error on the 2 mm bore.
  // Check the complete circular pin envelope against the coaxial socket.
  if (Math.abs(ceilingY - pinTipY) > 1e-5 || !socketBox.expandByScalar(1e-5).containsBox(tipBox)) {
    throw new Error('Lift cap 198 socket is not seated on pin 206');
  }
  const crown = cap.filter(t => plane(t).normal.y > 1e-6);
  const points = new Map();
  for (const t of crown) for (const p of t) points.set(p.toArray().join(','), p);
  const crownY = Math.max(...Array.from(points.values(), p => p.y));
  return {footY, crownY, crown, points: [...points.values()]};
}

export function createLiftContact({root,armBinding,datums,installation={},cache=true}){
  // Source triangles are immutable snapshots. Cache only exact matrix/input
  // values: no quantization, interpolation, or enlargement of contact faces.
  const solveCache=new Map(),surfaceIndexes=new WeakMap(),seatCache=new Map(),hookSeatCache=new Map();
  const counters={solveHits:0,solveMisses:0,restRejected:0};
  function remember(map,key,compute,limit=128){
    if(!cache)return compute();
    if(map.has(key))return map.get(key);
    const value=compute();if(map.size>=limit)map.delete(map.keys().next().value);map.set(key,value);return value;
  }
  const matrixKey=m=>m?m.elements.join(','):'none';
  function supportTransformed(triangles,m,axis,radius){
    if(!cache)return liftDiskSupport(transformed(triangles,m),axis,radius);
    let index=surfaceIndexes.get(triangles);
    if(!index){
      const boxes=triangles.map(t=>new THREE.Box3().setFromPoints(t));
      function build(ids){
        const box=new THREE.Box3();for(const i of ids)box.union(boxes[i]);
        if(ids.length<=12)return{box,ids};
        const size=box.getSize(V()),dim=size.x>=size.y&&size.x>=size.z?'x':size.y>=size.z?'y':'z';
        ids.sort((a,b)=>(boxes[a].min[dim]+boxes[a].max[dim])-(boxes[b].min[dim]+boxes[b].max[dim]));
        const mid=ids.length>>1;return{box,left:build(ids.slice(0,mid)),right:build(ids.slice(mid))};
      }
      index={tree:build(triangles.map((_,i)=>i)),queries:new Map()};surfaceIndexes.set(triangles,index);
    }
    return remember(index.queries,[matrixKey(m),axis.x,axis.z,radius].join('|'),()=>{
      const selected=[];
      function visit(node){
        // Transform all eight AABB corners: conservative for arbitrary affine
        // matrices, including tilted faces. A discarded node cannot touch disk.
        const b=node.box.clone().applyMatrix4(m),e=1e-12;
        if(axis.x+radius+e<b.min.x||axis.x-radius-e>b.max.x||axis.z+radius+e<b.min.z||axis.z-radius-e>b.max.z)return;
        if(node.ids)selected.push(...node.ids);else{visit(node.left);visit(node.right);}
      }
      visit(index.tree);selected.sort((a,b)=>a-b); // preserve original witness tie order
      return liftDiskSupport(selected.map(i=>triangles[i].map(p=>p.clone().applyMatrix4(m))),axis,radius);
    },16);
  }
  const cfg={...LIFT_INSTALLATION,...installation},names={lever:'184_main_lever',balance:'243_balance_plate',hook:'cue.270.connecting_lever',cam:'cue.220.lift_cam'};
  const source=Object.fromEntries(Object.entries(names).map(([k,n])=>[k,liftTriangles(root,find(root,n))]));
  if(Object.values(source).some(t=>!t.length))throw new Error('Finite lift model requires 184, 243, 270 and 220 source triangles');
  const cap = readCapSeat(root);
  const snapshotPose=armBinding.status.pose;
  const supportBody=transformed(liftTriangles(root,find(root,'arm.73.head_socket_support')),armMatrix(snapshotPose).invert()).filter(t=>plane(t).normal.y<-.5);
  // The arm pad is the flat underside of the quarter shelf in arm.73 (arm.js PAD_BOTTOM).
  // Its triangles are needed only when the cap straddles a pad edge.
  const padFaces = transformed(liftTriangles(root, find(root, 'arm.73.bearing_body')), armMatrix(snapshotPose).invert())
    .filter(t => t.every(p => Math.abs(p.y - PAD_BOTTOM) < 1e-7) && plane(t).normal.y < -.99);
  if (!padFaces.length) throw new Error('Missing underside of arm lift pad');
  const rest=liftTriangles(root,find(root,'arm.66.rest_post'));
  const restTop=Math.max(...rest.flat().map(p=>p.y)),restFace=rest.filter(t=>t.every(p=>Math.abs(p.y-restTop)<1e-7));
  if(!restFace.length)throw new Error('Finite rest top missing');
  const restBounds=new THREE.Box3().setFromPoints(restFace.flat());
  // In the gimbal frame, so the bound below can pitch them about its cross axis.
  const supportVertices=[...new Map(supportBody.flat().map(p=>[p.toArray().join(','),p])).values()].map(p=>p.clone().applyAxisAngle(V(0,1,0),-ARM_CAD.gimbalSkew));
  // Exact extrema of x*cos(pitch)-y*sin(pitch) over the entire root-search
  // interval. Linear triangle interiors stay inside their vertex extrema.
  // Reject only if these conservative projected bounds cannot reach the post.
  function restMayOverlap(yaw){
    const cy=Math.cos(yaw+ARM_CAD.gimbalSkew),sy=Math.sin(yaw+ARM_CAD.gimbalSkew),lo=-.09,hi=.13;
    let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
    for(const p of supportVertices){
      const angles=[lo,hi],critical=Math.atan2(-p.y,p.x);
      for(const a of[critical-Math.PI,critical,critical+Math.PI])if(a>lo&&a<hi)angles.push(a);
      for(const a of angles){const u=p.x*Math.cos(a)-p.y*Math.sin(a),x=ARM_CAD.pivot[0]+cy*u+sy*p.z,z=ARM_CAD.pivot[2]-sy*u+cy*p.z;
        x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
    }
    return x0<=restBounds.max.x+1e-12&&x1>=restBounds.min.x-1e-12&&z0<=restBounds.max.z+1e-12&&z1>=restBounds.min.z-1e-12;
  }
  const cuePivot=V(...datums.cuePivot),cueShaft=V(...datums.cueShaft),rear=V(...datums.cueRearDirection).normalize(),tiltAxis=V(rear.z,0,-rear.x);
  const paddle=source.hook.filter(t=>t.every(p=>p.z>.025)&&plane(t).normal.y>.9);
  source.cam=source.cam.filter(t=>Math.abs(plane(t).normal.x)<.9);
  const restCache=new Map();
  const cueCache=new Map();
  const hookTop=source.hook.filter(t=>plane(t).normal.y>.5),leverTop=source.lever.filter(t=>plane(t).normal.y>.5),balanceTop=source.balance.filter(t=>plane(t).normal.y>.5),balanceBottomFaces=source.balance.filter(t=>plane(t).normal.y<-.5);
  const along=V(Math.cos(datums.leverHeading),0,-Math.sin(datums.leverHeading));
  const modeBalanceDelta=(mode,delta=I())=>delta.clone().multiply(translate(...along.clone().multiplyScalar(mode==='multi'?.0027:0).toArray()));
  function cue(fraction=0){
    const input=Math.max(0,Math.min(1,fraction)),key=input;if(cueCache.has(key))return cueCache.get(key);
    const camDelta=turn(cueShaft,V(1,0,0),input*(datums.cueUpAngle-datums.cueDownAngle)),cam=transformed(source.cam,camDelta);
    const gap=a=>liftSurfaceGap(cam,transformed(paddle,turn(cuePivot,tiltAxis,a)))?.gap;
    const estimate=input*(datums.cueUpTilt-datums.cueDownTilt);
    let angle=estimate;
    for(let i=0;i<5;i++){const g=gap(angle);if(!Number.isFinite(g)){angle=null;break;}if(Math.abs(g)<1e-10)break;const derivative=(gap(angle+.00001)-g)/.00001;if(!Number.isFinite(derivative)||Math.abs(derivative)<.001){angle=null;break;}angle-=g/derivative;if(Math.abs(angle-estimate)>.012){angle=null;break;}}
    if(angle===null||Math.abs(gap(angle))>1e-8)angle=rootFor(gap,estimate-.012,estimate+.012);
    if(angle===null)return{valid:false,reason:'220 cannot reach finite 270 paddle within installed pivot range'};
    const hookDelta=turn(cuePivot,tiltAxis,angle),result={valid:true,camDelta,hookDelta,angle,contact:liftSurfaceGap(cam,transformed(paddle,hookDelta))};
    if(cueCache.size>256)cueCache.clear();cueCache.set(key,result);return result;
  }
  const status={installation:cfg,classification:'lower finite-support kinematics; estimated installation, no forces/damping',last:null,cache:counters};
  function solve({armAngle,mode='single',cueFraction=0,leverDelta=I(),balanceDelta=null,recordHeight=.0268,handHeight=null,hookDelta=null,extraSupports=[]}={}){
    // Results and their matrices are read-only snapshots for renderer/engine.
    // Extra caller-defined supports deliberately bypass complete-result caching.
    const key=extraSupports.length?null:[armAngle,mode,cueFraction,recordHeight,handHeight,matrixKey(leverDelta),matrixKey(balanceDelta),matrixKey(hookDelta)].join('|');
    if(cache&&key!==null&&solveCache.has(key)){counters.solveHits++;status.last=solveCache.get(key);return status.last;}
    counters.solveMisses++;
    const raise=mode==='multi'?cfg.multiRaise:0,c=cue(cueFraction);
    if(!c.valid)return{valid:false,reason:c.reason};
    const hook=supportTransformed(hookTop,hookDelta||c.hookDelta,cfg.axis,cfg.footRadius);
    const lever=supportTransformed(leverTop,leverDelta,cfg.axis,cfg.footRadius);
    let solvedBalanceDelta=(balanceDelta||modeBalanceDelta(mode,leverDelta)).clone();
    const seatKey=matrixKey(leverDelta)+'|'+matrixKey(solvedBalanceDelta);
    const seated=remember(seatCache,seatKey,()=>liftSurfaceGap(transformed(balanceBottomFaces,solvedBalanceDelta),transformed(leverTop,leverDelta)),32);
    let balanceShift=seated?-seated.gap:-.00015,balanceDrivenBy=seated?'184':'installed243-seat';
    const activeHook=hookDelta||c.hookDelta;
    const hookSeat=remember(hookSeatCache,matrixKey(activeHook)+'|'+matrixKey(solvedBalanceDelta),()=>liftSurfaceGap(transformed(balanceBottomFaces,solvedBalanceDelta),transformed(hookTop,activeHook)),32);
    // Both modes use the explicit stepped243 installation. Match real finite
    // underside/top triangles, not unrelated extrema under the foot disk.
    if(hookSeat&&-hookSeat.gap>balanceShift){balanceShift=-hookSeat.gap;balanceDrivenBy='270';}
    solvedBalanceDelta=translate(0,balanceShift,0).multiply(solvedBalanceDelta);
    const balance=supportTransformed(balanceTop,solvedBalanceDelta,cfg.axis,cfg.footRadius);
    const choices=[{name:'sleeve-low-stop',height:cfg.footLowStop+(mode==='multi'?cfg.modeLowStopRaise:0)},...Object.entries({hook,lever,balance}).filter(([,p])=>p).map(([name,p])=>({name,...p})),...extraSupports];
    const lower=choices.reduce((a,b)=>b.height>a.height?b:a),footHeight=lower.height,footDelta=footHeight-cap.footY,capTop=cap.crownY+footDelta;
    const base=cadPoseForHeight({armAngle,stylusHeight:recordHeight,raise});if(!base.valid)return base;
    const at=pitch=>({...base,pitch,stylusHeight:ARM_CAD.pivot[1]+raise+cadStylusRise(pitch)});
    // For this yaw, project the actual rounded crown along the arm. At a
    // fixed height only the two extreme points can touch a tilted plane first.
    const cy=Math.cos(base.yaw+ARM_CAD.gimbalSkew), sy=Math.sin(base.yaw+ARM_CAD.gimbalSkew), rings=new Map(); // along the gimbal heading: the pad tilts across it
    for (const p of cap.points) {
      const u=cy*(p.x-cfg.axis.x)-sy*(p.z-cfg.axis.z);
      const pair=rings.get(p.y);
      if (!pair) rings.set(p.y,{min:u,max:u,left:p,right:p});
      else {
        if (u<pair.min) { pair.min=u; pair.left=p; }
        if (u>pair.max) { pair.max=u; pair.right=p; }
      }
    }
    function capContact(pose) {
      const slope=Math.tan(pose.pitch);
      let best=Infinity, witness;
      for (const [y,r] of rings) {
        const value=(slope>=0?r.min:r.max)*slope-(y-cap.crownY);
        if (value<best) { best=value; witness=slope>=0?r.left:r.right; }
      }
      const projected=cadPadContact(pose,{axis:witness,radius:0});
      if (projected.valid) {
        const height=witness.y+footDelta;
        return {...projected,gap:projected.height-height,capPoint:[witness.x,height,witness.z]};
      }
      // When the unbounded plane's first vertex lies outside the actual pad,
      // intersect both finite surfaces instead. This also detects a complete miss.
      const edge=liftSurfaceGap(transformed(padFaces,armMatrix(pose)),cap.crown);
      if (!edge) return {valid:false,reason:'cap and pad do not overlap'};
      const [x,y,z]=edge.lower;
      return {valid:true,height:edge.upper[1],point:edge.upper,capPoint:[x,y+footDelta,z],gap:edge.gap-footDelta};
    }
    const capPitch=rootFor(p=>capContact(at(p)).gap);
    if(capPitch===null)return{valid:false,reason:'cap height cannot meet finite pad in allowed pitch range',capTop,lower};
    const restKey=`${armAngle}:${raise}`;
    if(!restCache.has(restKey)){if(restCache.size>256)restCache.clear();const overlaps=!cache||restMayOverlap(base.yaw);if(!overlaps)counters.restRejected++;restCache.set(restKey,overlaps?rootFor(p=>liftSurfaceGap(transformed(supportBody,armMatrix(at(p))),restFace)?.gap):null);}
    const restPitch=restCache.get(restKey);
    const pitchChoices=[{name:'record',pitch:base.pitch},{name:'198',pitch:capPitch}];
    if(restPitch!==null)pitchChoices.push({name:'rest66',pitch:restPitch});
    if(Number.isFinite(handHeight)){const hp=cadPoseForHeight({armAngle,stylusHeight:handHeight,raise});if(hp.valid)pitchChoices.push({name:'hand',pitch:hp.pitch});}
    const upper=pitchChoices.reduce((a,b)=>b.pitch>a.pitch?b:a),armPose=at(upper.pitch),pad=capContact(armPose);
    const result={valid:true,mode,balanceDelta:solvedBalanceDelta,balanceDrivenBy,lowStopDelta:translate(0,mode==='multi'?cfg.modeLowStopRaise:0,0),armPose,stylusHeight:armPose.stylusHeight,modeRaise:raise,footHeight,footDelta,capTop,cue:c,
      contacts:{lower,lowerCandidates:choices,balanceSeat:seated?{...seated,gap:seated.gap+balanceShift}:null,hookSeat:hookSeat?{...hookSeat,gap:hookSeat.gap+balanceShift}:null,upper:upper.name,pad,padGap:pad.valid?pad.gap:null,rest:liftSurfaceGap(transformed(supportBody,armMatrix(armPose)),restFace)},classification:status.classification};
    if(cache&&key!==null){if(solveCache.size>=128)solveCache.delete(solveCache.keys().next().value);solveCache.set(key,result);}
    status.last=result;return result;
  }
  return{solve,cue,status,modeBalanceDelta,installation:cfg};
}

// One CAD changer authority: a fixed estimated AK surface -> actual173 pose ->
// actual179 seat /177 drop -> an explicitly estimated sealed-spindle linkage.
// Plain1229 Figs22/24/28 establish topology, not the numerical profile or AU3
// internals. No factory calibration is claimed for this installation scenario.
import * as THREE from 'three';
import { AW3 } from '../changer-contact.js';
import { GEAR } from '../layout.js';

const V = (...a) => new THREE.Vector3(...a);
const shift = (x=0,y=0,z=0) => new THREE.Matrix4().makeTranslation(x,y,z);
const turn = (p,k,a) => shift(p.x,p.y,p.z).multiply(new THREE.Matrix4().makeRotationAxis(k,a)).multiply(shift(-p.x,-p.y,-p.z));
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const ramp = (x,a,b) => clamp((x-a)/(b-a),0,1);
const D = Math.PI/180;

// Relief, metres above the neutral CAD contact. Independent component data:
// changing this profile changes the solved173 angle and177/support travel.
export const CAD_DROP_PROFILE = Object.freeze([[0,0],[90,0],[95,.00012],[105,.0011],
  [115,.00235],[125,.00266],[135,.00205],[145,.00075],[155,0],[360,0]].map(Object.freeze));
export const CAD_SPINDLE_SCENARIO = Object.freeze({
  name:'estimated-three-shoe-cam-and-retainer',
  supportPickup:.0003, supportFull:.0017, supportTravel:.00115,
  retainerPickup:.00005, retainerFull:.00045, retainerTravel:.001,
  retainerWidth:.0012, retainerThickness:.00035,
  sense:.000025, flipDrop:.00125,
  maxRockerAngle:.20,
});
export const CAD_LOCK_INSTALLATION = Object.freeze({
  name:'lower-guide-with-reconstructed-blocking-shoe',offset:[GEAR.camX-.0541,-.0115,GEAR.camZ+.032],travel:.0065,
  direction:[176-54.1,0,-(102-32)],
  // The guide is translated with212; parent171/208 must provide this shoulder.
  guide:[GEAR.camX,-.035,GEAR.camZ],
  blockingShoeRadius:.0005,
  blockingContactResolved:true,
});

function triangles(root,node) {
  const inv=root.matrixWorld.clone().invert(),out=[];
  node?.traverse(m=>{if(!m.isMesh)return;const matrix=inv.clone().multiply(m.matrixWorld),p=m.geometry.attributes.position,ix=m.geometry.index;
    for(let i=0;i<(ix?.count||p.count);i+=3)out.push([0,1,2].map(j=>V().fromBufferAttribute(p,ix?ix.getX(i+j):i+j).applyMatrix4(matrix)));
  });return out;
}
const vertices = t => t.flat();
function sample(profile,angle) {
  const a=((angle%360)+360)%360;
  for(let i=1;i<profile.length;i++)if(a<=profile[i][0]){const [x,y]=profile[i-1],[xx,yy]=profile[i];return y+(yy-y)*(a-x)/(xx-x);}
  throw new RangeError('CAD AK profile must cover360 degrees');
}

export function createChangerContact({root,scene,datums,profile=CAD_DROP_PROFILE,scenario=CAD_SPINDLE_SCENARIO,installation=CAD_LOCK_INSTALLATION}) {
  if(!scene)return null;
  root.updateWorldMatrix(true,true);
  const by=name=>scene.getObjectByName(name)||scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
  const names=['173_216758_drop_rocker','177_216756_change_bolt','179_213921_bushing','178_213920_compression_spring','180_clip',
    '212_218151_locking_slide','212_switch_leaf_Umschaltfeder',...Array.from({length:3},(_,i)=>`AU3_support_${i}`)];
  const inv=root.matrixWorld.clone().invert(),rest=new Map();
  for(const name of names){const node=by(name);if(node)rest.set(name,{node,matrix:inv.clone().multiply(node.matrixWorld),local:node.matrix.clone(),auto:node.matrixAutoUpdate});}
  const rock=triangles(root,by(names[0])),bush=triangles(root,by(names[2]));
  if(!rock.length||!bush.length)throw new Error('CAD changer requires actual173 and179 surfaces');
  const pivot=V(...datums.rockerPivot),axis=V(...datums.rockerAxis).normalize(),cam=V(GEAR.camX,0,GEAR.camZ);
  const radius=Math.max(...vertices(bush).map(p=>Math.hypot(p.x,p.z)));
  const ray=new THREE.Ray(V(radius*.97,0,0),V(0,-1,0)),hit=V();
  let seat=null,top=-Infinity;
  for(const t of rock)if(ray.intersectTriangle(...t,false,hit)&&hit.y>top){
    const plane=new THREE.Plane().setFromCoplanarPoints(...t);
    if(Math.abs(plane.normal.y)<.9)continue;if(plane.normal.y<0)plane.negate();seat=plane;top=hit.y;
  }
  if(!seat)throw new Error('CAD173 annular eye top missing');
  const seatHeight=p=>(-p.constant+radius*Math.hypot(p.normal.x,p.normal.z))/p.normal.y;
  const neutralSeat=seatHeight(seat);
  const delta=a=>turn(pivot,axis,-a);
  const boltDrop=a=>neutralSeat-seatHeight(seat.clone().applyMatrix4(delta(a)));

  // The actual far top edge of173 is the contact follower. Do not substitute
  // the old45mm-radius sphere. Edge points retain their exported coordinates.
  const along=V(-axis.z,0,axis.x).normalize();
  const rv=vertices(rock),edgeY=Math.max(...rv.map(p=>p.y));
  // The downward folded tab projects farther in plan than the contact edge;
  // choosing the farthest plan vertex would incorrectly use its lower edge.
  const upper=rv.filter(p=>edgeY-p.y<.000002).sort((a,b)=>a.dot(axis)-b.dot(axis));
  if(upper.length<2)throw new Error('CAD173 far upper edge missing');
  const edgeA=upper[0],edgeB=upper.at(-1),follower=edgeA.clone().lerp(edgeB,.5);
  const phase0=Math.atan2(follower.z-cam.z,follower.x-cam.x);
  const followerSamples=Array.from({length:17},(_,i)=>edgeA.clone().lerp(edgeB,i/16));
  const neutralHeight=Math.max(...followerSamples.map(p=>p.y));
  const materialPhase=(p,theta)=>(Math.atan2(p.z-cam.z,p.x-cam.x)-phase0)/D+theta;
  const height=phase=>neutralHeight+sample(profile,phase);
  let rMin=Infinity,rMax=0;
  for(const a of[0,scenario.maxRockerAngle])for(const p of followerSamples){const q=p.clone().applyMatrix4(delta(a)),r=Math.hypot(q.x-cam.x,q.z-cam.z);rMin=Math.min(rMin,r);rMax=Math.max(rMax,r);}
  const track={centre:cam.toArray(),phase0,neutralHeight,innerRadius:rMin-.0005,outerRadius:rMax+.0005,
    profile,height,classification:'fixed estimated AK relief on actual CAD173 contact radius',followerEdge:[edgeA.toArray(),edgeB.toArray()]};
  function contact(a,theta){
    const matrix=delta(a);let gap=Infinity,point=null;
    for(const p of followerSamples){const q=p.clone().applyMatrix4(matrix),g=height(materialPhase(q,theta))-q.y;if(g<gap){gap=g;point=q;}}
    return {gap,point:point.toArray()};
  }
  const supportVertices=Array.from({length:3},(_,i)=>vertices(triangles(root,by(`AU3_support_${i}`))));
  const supportTop=Math.max(...supportVertices.flat().map(p=>p.y));
  const directions=[0,1,2].map(i=>V(Math.cos(i*Math.PI*2/3),0,-Math.sin(i*Math.PI*2/3)));
  const supportRadii=travel=>supportVertices.map((vs,i)=>Math.max(...vs.map(p=>Math.hypot(p.x+directions[i].x*travel,p.z+directions[i].z*travel))));
  const lockDirection=V(...installation.direction).normalize();
  // Chosen installation: an added rigid extension of212 carries a rounded
  // blocking shoe under the existing173 eye. This is a visible RECONSTRUCTION,
  // not an identified factory part. Moving212 withdraws that finite contact.
  const shoeR=installation.blockingShoeRadius,shoeAt=axis.clone().multiplyScalar(Math.sign(axis.dot(lockDirection))*.0035);
  const upRay=new THREE.Ray(shoeAt.clone().setY(-.08),V(0,1,0));
  let shoeFace=null,shoePoint=null,shoeY=Infinity;
  for(const t of rock)if(upRay.intersectTriangle(...t,false,hit)&&hit.y<shoeY){
    const p=new THREE.Plane().setFromCoplanarPoints(...t);if(Math.abs(p.normal.y)<.9)continue;if(p.normal.y<0)p.negate();
    shoeFace=p;shoePoint=hit.clone();shoeY=hit.y;
  }
  if(!shoeFace)throw new Error('CAD173 finite eye underside unavailable for reconstructed mode shoe');
  const shoeCentre=shoePoint.clone().addScaledVector(shoeFace.normal,-shoeR);
  const bottomFaces=rock.filter(t=>t.every(p=>Math.abs(shoeFace.distanceToPoint(p))<2e-6));
  function shoeGap(a,travel){
    const centre=shoeCentre.clone().addScaledVector(lockDirection,travel),m=delta(a),plane=shoeFace.clone().applyMatrix4(m);
    const projection=plane.projectPoint(centre,V());
    const finite=bottomFaces.some(t=>new THREE.Triangle(...t.map(p=>p.clone().applyMatrix4(m))).containsPoint(projection));
    return finite?-plane.distanceToPoint(centre)-shoeR:Infinity;
  }
  function pose(theta,{mode='multi',loaded=true}={}) {
    const lockTravel=mode==='multi'?installation.travel:0;
    const empty=!loaded;let lo=0,hi=scenario.maxRockerAngle;
    const initial=contact(0,theta);
    if(!empty&&initial.gap>=-1e-8)for(let i=0;i<42;i++){const a=(lo+hi)/2;if(contact(a,theta).gap>=0&&shoeGap(a,lockTravel)>=-1e-10)lo=a;else hi=a;}
    const a=empty?0:lo,c=contact(a,theta),drop=a===0?0:Math.max(0,boltDrop(a)),lockGap=shoeGap(a,lockTravel);
    const blocked=empty||lockGap<2e-6;
    const supportTravel=-scenario.supportTravel*ramp(drop,scenario.supportPickup,scenario.supportFull);
    const supportTipR=supportRadii(supportTravel);
    const retainerTravel=scenario.retainerTravel*ramp(drop,scenario.retainerPickup,scenario.retainerFull);
    const retainerTipR=Math.hypot(AW3.r-.0001+retainerTravel,scenario.retainerWidth/2);
    const valid=initial.gap>=-1e-8&&(blocked||a<scenario.maxRockerAngle-1e-7);
    return {source:'cad-changer',theta,valid,angle:a,drop,gap:c.gap,contactPoint:c.point,akContact:Math.abs(c.gap)<2e-6,
      held:blocked,blocked,empty:!loaded,supportTravel,supportTipR,retainerTravel,retainerTipR,
      holdSupports:supportTipR.some(r=>r>AW3.holeR),holdRetainers:retainerTipR>AW3.holeR,
      flip:drop>=scenario.flipDrop,lockPose:{offset:V(...installation.offset).addScaledVector(lockDirection,lockTravel).toArray(),guide:installation.guide,travel:lockTravel,gap:lockGap,shoeCentre:shoeCentre.clone().addScaledVector(lockDirection,lockTravel).toArray()},
      boundary:'sealed AU3 linkage/retainers and added212 shoe are explicit reconstructions;207 threshold remains prescribed'};
  }
  const additions=new THREE.Group();additions.name='cadChangerReconstructedInternals';root.add(additions);
  const steel=new THREE.MeshStandardMaterial({color:0x9d8859,roughness:.48,metalness:.65});
  const lockGroup=new THREE.Group();lockGroup.name='estimated212BlockingExtension';additions.add(lockGroup);
  const shoe=new THREE.Mesh(new THREE.SphereGeometry(shoeR,24,16),steel);shoe.position.copy(shoeCentre);shoe.name='estimated212BlockingShoe';lockGroup.add(shoe);
  const rod=(a,b,r)=>{const d=b.clone().sub(a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),12),steel);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());lockGroup.add(mesh);return mesh;};
  const lower=shoeCentre.clone().setY(installation.guide[1]);
  // Attach on the actual fork side (slot half-width2.15mm, outside half-width4mm),
  // not through172's2mm shoulder. Its lateral offset remains fixed during travel.
  const side=V(-lockDirection.z,0,lockDirection.x);
  if(side.dot(lower.clone().sub(V(...installation.guide)))<0)side.negate();
  const attachment=V(...installation.guide).addScaledVector(side,.0033);
  const extension=rod(attachment,lower,.0007);extension.name='estimated212ForkExtension';
  rod(lower,shoeCentre,.0007);
  const retainers=[];
  for(let i=0;i<3;i++){
    const g=new THREE.Group();g.name=`estimatedAU3Retainer${i}`;additions.add(g);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.001,scenario.retainerThickness,scenario.retainerWidth),steel);
    mesh.position.set(AW3.r-.0006,supportTop+AW3.recordT-scenario.retainerThickness/2,0);g.add(mesh);g.rotation.y=i*Math.PI*2/3;retainers.push({g,mesh});
  }
  additions.userData.classification='Explicit reconstructed212 extension and sealed AU3 internals; source body is an exterior envelope, internal cavities/windows are not factory-verified';
  const akGroup=new THREE.Group();akGroup.name='cadChangerAKTrack';akGroup.position.copy(cam);additions.add(akGroup);
  const akMaterial=new THREE.MeshStandardMaterial({color:0x92652b,roughness:.48,metalness:0,side:THREE.DoubleSide});
  const akMesh=new THREE.Mesh(trackGeometry(),akMaterial);akMesh.name='estimated165ChangerTrack';akGroup.add(akMesh);
  const meshes=[];
  additions.traverse(mesh=>{if(!mesh.isMesh)return;meshes.push(mesh);mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.userData.part='cad:changer:reconstructed-linkage';mesh.userData.cad='changer';
    mesh.userData.classification=mesh===akMesh?'estimated AK profile on actual173 contact radius':'explicit reconstruction, not identified factory geometry';
  });
  const status={classification:'CAD173/179 contacts and finite support release; estimated sealed-spindle linkage and added212 blocking shoe',
    source:'plain1229 Figs22/24/28 topology; actual exported173/179/support surfaces',
    mounting:{pivot:pivot.toArray(),axis:axis.toArray()},supportTop,guide:installation.guide,
    track:{centre:track.centre,innerRadius:track.innerRadius,outerRadius:track.outerRadius,neutralHeight},
    assumptions:['AK relief and AU3 internal cam/retainers estimated','added212 extension/shoe is a chosen installation, not a factory identification',
      'AU3 imported solid describes exterior; internal working cavities remain assumed','empty lock remains a record-load input;207 trigger remains a stroke threshold',
      'gravity/spring preload sufficient to follow AK assumed; no force or friction solve']};
  function apply(name,matrix){const e=rest.get(name);if(!e)return;e.node.parent.updateWorldMatrix(true,false);
    const local=e.node.parent.matrixWorld.clone().invert().multiply(root.matrixWorld).multiply(matrix).multiply(e.matrix);
    e.node.matrixAutoUpdate=false;e.node.matrix.copy(local);local.decompose(e.node.position,e.node.quaternion,e.node.scale);e.node.matrixWorldNeedsUpdate=true;
  }
  function render(p,{inserted=true}={}){
    akGroup.rotation.y=p.theta*D;
    apply(names[0],delta(p.angle));for(const n of names.slice(1,5))apply(n,shift(0,-p.drop,0));
    for(const n of names.slice(5,7))apply(n,shift(...p.lockPose.offset));
    lockGroup.position.copy(lockDirection).multiplyScalar(p.lockPose.travel);
    for(const {g,mesh}of retainers){g.visible=inserted;mesh.position.x=AW3.r-.0006+p.retainerTravel;}
    for(let i=0;i<3;i++){const n=`AU3_support_${i}`;apply(n,shift(directions[i].x*p.supportTravel,0,directions[i].z*p.supportTravel));if(by(n))by(n).visible=inserted;}
    if(by('AU3_213895_spindle_exterior'))by('AU3_213895_spindle_exterior').visible=inserted;
  }
  function trackGeometry(segments=720){
    const positions=[];
    const at=(i,r)=>{const a=phase0+i/segments*Math.PI*2;return[r*Math.cos(a),height(i/segments*360),r*Math.sin(a)];};
    for(let i=0;i<segments;i++){const a=at(i,track.innerRadius),b=at(i,track.outerRadius),c=at(i+1,track.innerRadius),d=at(i+1,track.outerRadius);
      const A=[a[0],a[1]+.001,a[2]],B=[b[0],b[1]+.001,b[2]],C=[c[0],c[1]+.001,c[2]],DD=[d[0],d[1]+.001,d[2]];
      positions.push(...a,...c,...b,...b,...c,...d,...A,...B,...C,...B,...DD,...C,
        ...a,...A,...c,...c,...A,...C,...b,...d,...B,...d,...DD,...B);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();return g;
  }
  function dispose(){for(const e of rest.values()){e.node.matrix.copy(e.local);e.local.decompose(e.node.position,e.node.quaternion,e.node.scale);e.node.matrixAutoUpdate=e.auto;e.node.matrixWorldNeedsUpdate=true;}additions.traverse(m=>{if(m.isMesh)m.geometry.dispose();});steel.dispose();akMaterial.dispose();additions.removeFromParent();}
  return {pose,render,dispose,track,trackGeometry,supportTop,scenario,installation,boltDrop,contact,
    extension:{attachment:attachment.toArray(),lower:lower.toArray(),radius:.0007,direction:lockDirection.toArray()},
    mounting:{pivot:pivot.toArray(),axis:axis.toArray()},additions,meshes,status,shoeGap,
    classification:'CAD173/179 contacts and finite support release; estimated sealed-spindle linkage and added212 blocking shoe; unresolved207 trigger'};
}

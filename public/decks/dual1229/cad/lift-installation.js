// Explicit engineering installation on estimated source solids. These changes
// close a working reconstruction; they are not claims about factory geometry.
import * as THREE from 'three';
import {LIFT_INSTALLATION,LIFT_SOURCE_AXIS} from './lift-contact.js';
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function find(root,name){let n;root.traverse(o=>{if(o.name===name||o.userData.name===name||o.userData.cadOriginalName===name)n=o;});return n;}

// Where the cue lever stands. In the source solids its shaft sat 14 mm behind the strip's back edge,
// so the lever came up out of the dark plate behind the slot and the two cue marks printed beside it.
// On the real 1229 the lever comes up through a short slot at the plate's back edge, the marks right
// beside it, standing upright and leaning a little back (owner, against hifiwiki's photo and their
// own, 2026-11-19). So the lever, its shaft and what carries the shaft (cam 220, bearing block 216,
// torsion spring 219, damping plate 221) move forward CUE_FORWARD, and the lever slides CUE_ACROSS
// along its shaft into the middle of the slot (the stalk is x 220.0 mm, the slot's centre 216.35). Connecting lever 270 runs from its hook under the lift tube, past its
// pivot, to the paddle under the cam: it is stretched evenly along the deck from just in front of
// its hook pad, so the paddle stays under the moved cam and the pivot moves in proportion. Both arms
// grow alike, so the cam lifts the hook (and the arm) as much as before: lengthening only the front
// arm lowered the raised stylus below the cue's 31 mm. The pivot's screw and bearing move with it.
// MECHANISM_DATUMS.cueShaft, cuePivot and cueRearDirection are the moved ones.
export const CUE_FORWARD=.018,CUE_ACROSS=-.00365;
const CUE_SHAFT_Z=.060,CUE_STRETCH_FROM=LIFT_SOURCE_AXIS.z+.005; // in the source solids' own layout; the hook end is carried to the installed axis afterwards
export const CUE_STRETCH=(CUE_SHAFT_Z+CUE_FORWARD-CUE_STRETCH_FROM)/(CUE_SHAFT_Z-CUE_STRETCH_FROM);
export const cueStretchZ=z=>z<=CUE_STRETCH_FROM?z:CUE_STRETCH_FROM+(z-CUE_STRETCH_FROM)*CUE_STRETCH;
const CUE_PIVOT_Z=-.0097,CUE_PIVOT_FORWARD=cueStretchZ(CUE_PIVOT_Z)-CUE_PIVOT_Z;
const CUE_SHAFT_PARTS=['cue.064.handle','cue.220.lift_cam','cue.216.bearing_block','cue.219.torsion_spring','cue.221.damping_plate'];
const CUE_PIVOT_PARTS=['cue.269.shoulder_screw','cue.234.bearing_block','cue.218.setscrew'];
export function installCueLever({root}){
  const handle=find(root,'cue.064.handle');
  if(!handle||handle.userData.cueInstalled)return{dispose(){}};
  root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),saved=[];
  function remap(name,fn){const node=find(root,name);if(!node)return;
    node.traverse(mesh=>{if(!mesh.isMesh)return;const old=mesh.geometry,g=old.clone(),p=g.attributes.position,m=inverse.clone().multiply(mesh.matrixWorld),back=m.clone().invert();
      for(let i=0;i<p.count;i++){const v=V().fromBufferAttribute(p,i).applyMatrix4(m);fn(v);v.applyMatrix4(back);p.setXYZ(i,v.x,v.y,v.z);}
      p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();saved.push({mesh,old,g});mesh.geometry=g;});
  }
  // and the lever slides along its shaft to stand in the middle of the slot: its stalk came up 3.6 mm
  // to the right of the slot's centre line, beside the slot rather than through it
  remap('cue.064.handle',p=>{p.x+=CUE_ACROSS;});
  for(const name of CUE_SHAFT_PARTS)remap(name,p=>{p.z+=CUE_FORWARD;});
  for(const name of CUE_PIVOT_PARTS)remap(name,p=>{p.z+=CUE_PIVOT_FORWARD;});
  remap('cue.270.connecting_lever',p=>{p.z=cueStretchZ(p.z);});
  handle.userData.cueInstalled=true;
  return{dispose(){for(const {mesh,old,g}of saved.reverse()){mesh.geometry=old;g.dispose();}handle.userData.cueInstalled=false;}};
}

export function installLiftInterfaces({root,datums,installation={}}){
  const cfg={...LIFT_INSTALLATION,...installation},saved=[],added=[],meshes=[];
  const cueLever=installCueLever({root});
  root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert();
  function remap(name,fn){const node=find(root,name);if(!node)throw new Error(`Lift installation missing ${name}`);
    node.traverse(mesh=>{if(!mesh.isMesh)return;const old=mesh.geometry,g=old.clone(),p=g.attributes.position,m=inverse.clone().multiply(mesh.matrixWorld),back=m.clone().invert();
      for(let i=0;i<p.count;i++){const v=V().fromBufferAttribute(p,i).applyMatrix4(m);fn(v);v.applyMatrix4(back);p.setXYZ(i,v.x,v.y,v.z);}
      p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();saved.push({mesh,old,g});mesh.geometry=g;});
  }
  // The lift pin stands on the spindle side of the bearing, under the quarter shelf (owner observation,
  // 2026-11-19). The source solids were built round LIFT_SOURCE_AXIS: carry across the pin with its cap
  // and clips, sleeve and spring, the upper guide of 203, balance plate 243 (its shoes are built at
  // cfg.axis below) and the hook end of lever 270, which shears from its pivot to the new foot.
  // An installation on estimated solids, like the others here; not a claim about the factory linkage.
  const shift=V(cfg.axis.x-LIFT_SOURCE_AXIS.x,0,cfg.axis.z-LIFT_SOURCE_AXIS.z);
  if(shift.lengthSq()>1e-14){
    for(const name of ['cue.206.lift_bolt','cue.198.cap','cue.199.e_clip_upper','cue.202.e_clip_lower','cue.200.adjust_sleeve','cue.205.return_spring','243_balance_plate'])remap(name,p=>{p.add(shift);});
    remap('cue.203.lift_plate_tube',p=>{if(Math.hypot(p.x-LIFT_SOURCE_AXIS.x,p.z-LIFT_SOURCE_AXIS.z)<.0046)p.add(shift);});
    const pivotZ=datums.cuePivot[2],full=LIFT_SOURCE_AXIS.z+.006;
    remap('cue.270.connecting_lever',p=>{p.addScaledVector(shift,Math.max(0,Math.min(1,(pivotZ-p.z)/(pivotZ-full))));});
  }
  const amount=cfg.footLowStop-cfg.sourceFoot,footTop=cfg.remap206.sourceFootTop,pistonTop=cfg.remap206.sourcePistonTop,capRaise=cfg.capRaise||0;
  // The foot rises to its installed low stop; the upper end rises to the shelf underside; the piston between is drawn out linearly.
  remap('cue.206.lift_bolt',p=>{if(p.y<=footTop+1e-7)p.y+=amount;else if(p.y<pistonTop)p.y+=amount*(pistonTop-p.y)/(pistonTop-footTop)+capRaise*(p.y-footTop)/(pistonTop-footTop);else p.y+=capRaise;});
  for(const name of ['cue.198.cap','cue.199.e_clip_upper','cue.202.e_clip_lower'])remap(name,p=>{p.y+=capRaise;});
  // A slimmer cap, as photographed: draw its skirt in toward the pin without touching the press-on socket.
  if(cfg.capRadius)remap('cue.198.cap',p=>{const dx=p.x-cfg.axis.x,dz=p.z-cfg.axis.z,r=Math.hypot(dx,dz),keep=.0013;if(r>keep){const k=(keep+(r-keep)*(cfg.capRadius-keep)/(.0025-keep))/r;p.x=cfg.axis.x+dx*k;p.z=cfg.axis.z+dz*k;}});
  remap('cue.270.connecting_lever',p=>{if(Math.abs(p.y-cfg.remap270.sourceHookTop)<1e-6&&Math.hypot(p.x-cfg.axis.x,p.z-cfg.axis.z)<.004)p.y+=cfg.hookExtension;});
  const nylon=new THREE.MeshStandardMaterial({color:0xcac2a5,roughness:.55,metalness:0}),steel=new THREE.MeshStandardMaterial({color:0xa7aaa2,roughness:.38,metalness:.8});
  function add(name,geometry,material,parent=root){const o=new THREE.Mesh(geometry,material);o.name=name;o.castShadow=o.receiveShadow=true;o.userData.part=`cad:installed:${name}`;o.userData.installation='estimated engineering connection';root.add(o);added.push(o);meshes.push(o);if(parent!==root){root.updateWorldMatrix(true,true);parent.attach(o);}return o;}
  // A guide-bore stop catches the piston shoulder; the 3 mm foot passes through
  // the 3.1 mm opening. Its 0.5 mm motion relative to 203 in multi is an installed
  // adjustable sleeve scenario, not an inferred factory mechanism.
  const collarShape=new THREE.Shape();collarShape.absarc(0,0,.00175,0,Math.PI*2,false);
  const hole=new THREE.Path();hole.absarc(0,0,.00155,0,Math.PI*2,true);collarShape.holes.push(hole);
  const collarGeometry=new THREE.ExtrudeGeometry(collarShape,{depth:.0004,bevelEnabled:false,curveSegments:48});
  collarGeometry.rotateX(Math.PI/2);collarGeometry.translate(cfg.axis.x,cfg.footLowStop+(footTop-cfg.sourceFoot),cfg.axis.z);
  const collar=add('installed206LowStop',collarGeometry,steel);
  const sleeveShape=new THREE.Shape();sleeveShape.absarc(0,0,.00175,0,Math.PI*2,false);const sleeveHole=new THREE.Path();sleeveHole.absarc(0,0,.0017,0,Math.PI*2,true);sleeveShape.holes.push(sleeveHole);
  const sleeveBottom=cfg.footLowStop+(footTop-cfg.sourceFoot),sleeveTop=-.012;
  const sleeveGeometry=new THREE.ExtrudeGeometry(sleeveShape,{depth:sleeveTop-sleeveBottom,bevelEnabled:false,curveSegments:96});sleeveGeometry.rotateX(Math.PI/2);sleeveGeometry.translate(cfg.axis.x,sleeveTop,cfg.axis.z);add('installed206StopSleeve',sleeveGeometry,steel,collar);

  // The source203 guide starts on the original lower plate. Open its lower
  // cylinder, preserving that plate and the complete upper bearing, then clamp
  // the upper guide to the existing stud with an explicit installed bridge.
  const guideBottom=-.0127,plateTop=-.0285;
  const guide=find(root,'cue.203.lift_plate_tube');
  function clipHeight(poly,y,above){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=above?a.y-y:y-a.y,db=above?b.y-y:y-b.y;if(da>=-1e-10)out.push(a);if((da>=0)!==(db>=0))out.push(a.clone().lerp(b,da/(da-db)));}return out;}
  guide.traverse(mesh=>{if(!mesh.isMesh)return;const old=mesh.geometry,m=inverse.clone().multiply(mesh.matrixWorld),back=m.clone().invert(),p=old.attributes.position,ix=old.index,positions=[];
    function append(poly){for(let j=1;j<poly.length-1;j++)for(const v of[poly[0],poly[j],poly[j+1]])positions.push(...v.clone().applyMatrix4(back).toArray());}
    for(let i=0;i<(ix?.count??p.count);i+=3){const tri=[0,1,2].map(j=>V().fromBufferAttribute(p,ix?ix.getX(i+j):i+j).applyMatrix4(m));append(clipHeight(tri,plateTop,false));append(clipHeight(tri,guideBottom,true));}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();saved.push({mesh,old,g});mesh.geometry=g;
  });
  function ringFace(name,y,up){const g=new THREE.RingGeometry(.00175,.0032,96);g.rotateX(up?-Math.PI/2:Math.PI/2);g.translate(cfg.axis.x,y,cfg.axis.z);return add(name,g,guide.children.find(n=>n.isMesh)?.material||nylon,guide);}
  ringFace('installed203PlateClosure',plateTop,true);ringFace('installed203GuideClosure',guideBottom,false);
  const stud=V(.17597636204899794,0,-.1016),from=V(cfg.axis.x,0,cfg.axis.z),dir=stud.clone().sub(from).normalize(),side=V(-dir.z,0,dir.x),w=.0035;
  const bridgeShape=new THREE.Shape();const corners=[from.clone().addScaledVector(dir,-w).addScaledVector(side,w),stud.clone().addScaledVector(dir,w).addScaledVector(side,w),stud.clone().addScaledVector(dir,w).addScaledVector(side,-w),from.clone().addScaledVector(dir,-w).addScaledVector(side,-w)];bridgeShape.moveTo(corners[0].x,corners[0].z);for(const c of corners.slice(1))bridgeShape.lineTo(c.x,c.z);bridgeShape.closePath();
  for(const [point,r]of[[from,.0032],[stud,.0024]]){const h=new THREE.Path();h.absarc(point.x,point.z,r,0,Math.PI*2,true);bridgeShape.holes.push(h);}
  const supportGeometry=new THREE.ExtrudeGeometry(bridgeShape,{depth:.0008,bevelEnabled:false,curveSegments:48});supportGeometry.rotateX(Math.PI/2);supportGeometry.translate(0,-.00875,0);
  add('installed203StudBridge',supportGeometry,steel,guide);

  const pivot=V(...datums.leverPivot),along=V(Math.cos(datums.leverHeading),0,-Math.sin(datums.leverHeading)),travel=.0027;
  const centre=pivot.clone().addScaledVector(along,-travel),radius=Math.hypot(cfg.axis.x-pivot.x,cfg.axis.z-pivot.z),alpha=Math.atan2(cfg.axis.z-pivot.z,cfg.axis.x-pivot.x);
  const a0=alpha-.065,a1=alpha+.16,half=.00075;
  const shape=new THREE.Shape();shape.absarc(centre.x,centre.z,radius+half,alpha-.04,a1,false);shape.absarc(centre.x,centre.z,radius-half,a1,alpha-.04,true);shape.closePath();
  // Installation estimate. A 4.63 mm upper shoe clears the fifth 1.8 mm
  // record in multi while allowing the stylus to land on the first. Keep the
  // lower seating face fixed so the same finite surfaces drive return and cue.
  const shoeBottom=-.01905,shoeDepth=.00463,shoeTop=shoeBottom+shoeDepth;
  const shoeGeometry=new THREE.ExtrudeGeometry(shape,{depth:shoeDepth,bevelEnabled:false,curveSegments:48});shoeGeometry.rotateX(Math.PI/2);shoeGeometry.translate(0,shoeTop,0);
  const balance=find(root,'243_balance_plate');if(!balance)throw new Error('Lift installation missing 243');
  add('installed243ModeShoe',shoeGeometry,nylon,balance);
  // Narrow bridge fuses the new tongue to the existing balance body. The shape
  // outside this explicitly added bridge/tongue and 206/270 remaps is unchanged.
  const originalPoints=[];balance.traverse(o=>{if(!o.isMesh||o.name==='installed243ModeShoe')return;const m=inverse.clone().multiply(o.matrixWorld),p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)originalPoints.push(V().fromBufferAttribute(p,i).applyMatrix4(m));});
  const target=V(centre.x+radius*Math.cos((a0+a1)/2),shoeTop-shoeDepth/2,centre.z+radius*Math.sin((a0+a1)/2));
  const anchor=originalPoints.reduce((a,b)=>Math.hypot(b.x-target.x,b.z-target.z)<Math.hypot(a.x-target.x,a.z-target.z)?b:a).clone().setY(target.y);
  const direction=target.clone().sub(anchor),length=direction.length()+.001;
  const bridgeGeometry=new THREE.BoxGeometry(length,shoeDepth,.0015);bridgeGeometry.rotateY(-Math.atan2(direction.z,direction.x));bridgeGeometry.translate((target.x+anchor.x)/2,target.y,(target.z+anchor.z)/2);
  add('installed243ShoeBridge',bridgeGeometry,nylon,balance);
  // Lower single-mode step on the same243 carrier. The hook acts on its
  // underside; selecting multi shifts this step clear and presents the upper.
  const lowerShape=new THREE.Shape();lowerShape.absarc(pivot.x,pivot.z,radius+half,alpha-.04,a1,false);lowerShape.absarc(pivot.x,pivot.z,radius-half,a1,alpha-.04,true);lowerShape.closePath();
  const lowerGeometry=new THREE.ExtrudeGeometry(lowerShape,{depth:.00025,bevelEnabled:false,curveSegments:48});lowerGeometry.rotateX(Math.PI/2);lowerGeometry.translate(0,-.0191,0);
  add('installed243SingleShoe',lowerGeometry,nylon,balance);
  const lowerTarget=V(pivot.x+radius*Math.cos((a0+a1)/2),-.019225,pivot.z+radius*Math.sin((a0+a1)/2));
  const lowerAnchor=originalPoints.reduce((a,b)=>{const da=Math.hypot(a.x-lowerTarget.x,a.z-lowerTarget.z),db=Math.hypot(b.x-lowerTarget.x,b.z-lowerTarget.z);return db<da-1e-10||Math.abs(db-da)<1e-10&&b.y<a.y?b:a;}).clone();
  const lowerDirection=lowerTarget.clone().sub(lowerAnchor).setY(0),webBottom=-.01935,webTop=Math.max(-.0191,lowerAnchor.y+.000125);
  const lowerWeb=new THREE.BoxGeometry(lowerDirection.length()+.001,webTop-webBottom,.0015);lowerWeb.rotateY(-Math.atan2(lowerDirection.z,lowerDirection.x));lowerWeb.translate((lowerTarget.x+lowerAnchor.x)/2,(webTop+webBottom)/2,(lowerTarget.z+lowerAnchor.z)/2);
  add('installed243SingleWeb',lowerWeb,nylon,balance);
  const modeBalanceDelta=(mode,leverDelta=new THREE.Matrix4())=>leverDelta.clone().multiply(new THREE.Matrix4().makeTranslation(...along.clone().multiplyScalar(mode==='multi'?travel:0).toArray()));
  function apply(result){if(!result?.valid)return;collar.position.y=result.mode==='multi'?cfg.modeLowStopRaise:0;collar.updateMatrix();}
  function dispose(){for(const o of added){o.removeFromParent();o.geometry.dispose();}nylon.dispose();steel.dispose();for(const {mesh,old,g}of saved.reverse()){mesh.geometry=old;g.dispose();}cueLever.dispose();}
  return{meshes,collar,modeBalanceDelta,apply,dispose,installation:{...cfg,modeTravel:travel,guide:'203 original plate retained; lower guide opened to -12.7 mm, closed cut faces; installed stud bridge at -8.75..-9.55 mm and sliding stop sleeve',shoe:'two stepped arc contacts: 0.25 mm single plate, 4.63 mm multi tongue; 2.7 mm radial selection; estimated 270→243→206 path in both modes'},modifiedParts:['cue.206.lift_bolt','cue.270.connecting_lever','cue.203.lift_plate_tube','243_balance_plate']};
}

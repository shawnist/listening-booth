import * as THREE from 'three';
import {EQ243 as E,equalizerBoundary,equalizerOffset,equalizerBaseOutline} from './equalizer-geometry.js';
// A real slotted243 on the rigid184 frame. No invented pin down to210.
export function buildEqualizer(kit,root){
 const frame=kit.name('equalizerFrame',new THREE.Group());root.add(frame);frame.rotation.y=-E.angle;
 const slider=kit.part('balancePlate',frame,{name:'Two-slot balance plate on main lever184 (upstream position prescribed)',no:'243 (220 789)'});
 kit.name('equalizer243',slider);
 slider.userData.linkageFidelity={source:'1229 Fig29/31; MAARC p18',status:'component topology; estimated dimensions',boundary:'203/210 contact contour unresolved; installed slider position prescribed'};
 const shape=new THREE.Shape(equalizerBaseOutline.map(([x,z])=>new THREE.Vector2(x,-z)));
 for(const x of E.pins){
  const h=new THREE.Path();h.absarc(x-E.travel,0,E.slotR,Math.PI/2,Math.PI*1.5,false);h.lineTo(x,-E.slotR);h.absarc(x,0,E.slotR,-Math.PI/2,Math.PI/2,false);h.closePath();shape.holes.push(h);
 }
 const geo=new THREE.ExtrudeGeometry(shape,{depth:E.t,bevelEnabled:false});geo.rotateX(-Math.PI/2);
 kit.name('equalizerBase',kit.add(slider,geo,kit.mats.black(),0,E.baseY,0));
 const points=[];
 for(let i=0;i<=96;i++){const a=E.stepA[0]+(E.stepA[1]-E.stepA[0])*i/96;points.push(new THREE.Vector2(E.stepR[1]*Math.cos(a),-E.stepR[1]*Math.sin(a)));}
 for(let i=96;i>=0;i--){const a=E.stepA[0]+(E.stepA[1]-E.stepA[0])*i/96;points.push(new THREE.Vector2(E.stepR[0]*Math.cos(a),-E.stepR[0]*Math.sin(a)));}
 const stepGeo=new THREE.ExtrudeGeometry(new THREE.Shape(points),{depth:E.stepHeight,bevelEnabled:false});stepGeo.rotateX(-Math.PI/2);
 kit.name('equalizerStep',kit.add(slider,stepGeo,kit.mats.black(),0,E.baseY,0));
 for(const [i,x] of E.pins.entries()){
  const p=kit.part('equalizerRetainer',frame,{name:'Fixed balance-plate retaining pin on184 (dimensions estimated)',no:'with184 /242'});
  kit.name(`equalizerPin${i}`,kit.add(p,new THREE.CylinderGeometry(E.pinR,E.pinR,E.t+E.liftPlay+.00035,20),kit.mats.steel(),x,E.baseY+(E.t+E.liftPlay+.00035)/2,0));
  kit.name(`equalizerHead${i}`,kit.add(p,new THREE.CylinderGeometry(.0014,.0014,.0003,24),kit.mats.steel(),x,E.baseY+E.t+E.liftPlay+.0005,0));
 }
 return {update(s){
  const anchor=kit.anchors.mainLever;
  frame.visible=!!anchor;
  if(anchor&&frame.parent!==anchor){anchor.add(frame);frame.position.set(0,0,0);frame.rotation.set(0,-E.angle,0);}
  const position=s.equalizerPosition??equalizerBoundary(s.mode);
  slider.position.x=equalizerOffset(position);frame.userData.prescribedPosition=position;
  // The cue lever270's hook lifts243 off184 along184's normal (cue-chain.js; mechanism cueHook.raise).
  slider.position.y=s.cueHook&&Number.isFinite(s.cueHook.raise)?s.cueHook.raise:0;
 }};
}

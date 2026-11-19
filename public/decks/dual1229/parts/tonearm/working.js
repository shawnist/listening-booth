// Tonearm: the small working parts (springs, pins, balls, sleeves, detents) of the arm's height, lift and rest,
// each a Dual part named in X-ray and moved every frame from the mechanism's snapshot:
//   - guide tube/plate203, upper threaded sleeve200, rubber sleeve204 and spring205;
//     the translating206 plunger and198 tip are built in arm.js;
//   - the balance plate (243) on the main lever and the equalizing arm (210) on its shaft (211) and bushing (214),
//     upstream203/210 contact remains unresolved;243 has a prescribed installed slider position;
//   - the mode selector's detent: two 3 mm balls (231) and the sleeve washer (230) on its bushing;
//   - mode selector70 with fixed detent lever81, roller82 and tension spring80;
//   - the lift (cue) lever's sleeve and axle (64), damping plate (221) and rubber sleeve (222);
//   - pivot pins under the skating lever (267) and the lift cam's bracket (220).
// Positions are estimates where the sources give none (see place.js). Owned by the tonearm builder (OWNERS.md).
import * as THREE from 'three';
import { SPEC, REST_DATUM } from '../../spec.js';
import { TAU, D } from '../../layout.js';
import { lathe, plateGeo, barGeo, helixGeo, RoundedBoxGeometry } from '../shared/geometry.js';
import { knurlTexture } from '../../../../deck3d/textures.js';
import { CONTROLS as C, EQUALIZER as EQ, DETENT as DT, MODE_SELECTOR as RL, CUE_DAMP as CD } from './place.js';
import { MAIN_LEVER } from '../automatic/place.js';
import { buildEqualizer } from './equalizer.js';
import { CUE } from '../../cue-geometry.js';
import { MODE_RAMP, RAMP_PROFILE, earAngles } from '../../mode-height.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const UP = new THREE.Vector3(0, 1, 0);

// A coil spring between two points, with a straight hook at each end (hook 0: a compression spring, no hooks).
// The coil is a unit helix stretched along its axis every frame; nothing is allocated per frame.
function coilSpring(kit, parent, r, turns, wire, mat, hooks = true) {
  const coil = kit.add(parent, helixGeo(1, r, turns, wire), mat);
  const hk = hooks ? [0, 1].map(() => kit.add(parent, new THREE.CylinderGeometry(wire, wire, 1, 6), mat)) : [];
  const d = new THREE.Vector3(), e = new THREE.Vector3(), a2 = new THREE.Vector3(), b2 = new THREE.Vector3();
  const seg = (m, a, b) => { e.subVectors(b, a); const L = Math.max(e.length(), 1e-6); m.position.copy(a).addScaledVector(e, 0.5); m.scale.set(1, L, 1); m.quaternion.setFromUnitVectors(UP, e.divideScalar(L)); };
  return function set(a, b, hook = 0) {
    d.subVectors(b, a); const L = Math.max(d.length(), 1e-6); d.divideScalar(L);
    a2.copy(a).addScaledVector(d, hook); b2.copy(b).addScaledVector(d, -hook);
    coil.position.copy(a2); coil.quaternion.setFromUnitVectors(UP, d); coil.scale.set(1, L - 2 * hook, 1);
    if (hk.length) { seg(hk[0], a, a2); seg(hk[1], b2, b); }
  };
}
// a flat bar outline from x0 to x1 along x, half-width w, round ends (for plateGeo, which can take holes)
const stadium = (x0, x1, w, n = 8) => { const pts = []; for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + (i / n) * Math.PI; pts.push([x0 + Math.cos(a) * w, Math.sin(a) * w]); } for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI; pts.push([x1 + Math.cos(a) * w, Math.sin(a) * w]); } return pts; };
// a closed lathe ring: radii r0..r1, from y0 to y1
const ring = (r0, r1, y0, y1, seg = 24) => lathe([[r0, y0], [r1, y0], [r1, y1], [r0, y1], [r0, y0]], seg);

// deps: { arm, cueLever, modeTop, skPivot: {x, y, z}, cuePivot: {x, y, z} }
export function buildWorking(kit, root, deps) {
  const { add, part, mats } = kit;
  const { arm } = deps;
  const P = arm.pivot, T = arm.liftPos;
  const steel = mats.steel(), dark = mats.darkSteel(), rubber = mats.rubber(), springMat = kit.mat(0xd8dade, 0.9, 0.28);
  const equalizer=buildEqualizer(kit,root);

  // Plain1229 Fig11/12:203 is a plate and guide tube;200 screws onto
  // its UPPER end. MAARC pp31–32 identifies the mounting stud as outer60,
  // agreeing with Fig12/236. Guide203/200 therefore follow that rigid assembly.
  // Outline and dimensions remain estimates;206/198 slide relative to203.
  const lift=part('liftTube',root,{name:'Lift guide tube and mounting plate on outer bearing ring60',no:'203 (220 934)'});lift.position.set(T.x,0,T.z);
  const {guideTop,guideBottom}=CUE;
  const tube=new THREE.Group();lift.add(tube);
  add(tube,ring(CUE.guideBore,CUE.guideOuter,guideBottom,guideTop,32),kit.ghost(mats.brass(),.3));
  const sleeve=part('positioningSleeve',lift,{name:'Upper threaded positioning sleeve on lift guide203',no:'200 (218 318)'});
  const knurl=knurlTexture(32);knurl.repeat.set(1,1);
  add(sleeve,ring(.00105,.0036,guideTop-.0015,guideTop+.0005,32),kit.mat(0x202023,.5,.4,{bumpMap:knurl,bumpScale:.8}));
  const px=P.x-T.x,pz=P.z-T.z,d=Math.hypot(px,pz),ux=px/d,uz=pz/d,nx=-uz*.003,nz=ux*.003;
  // Open guide bore through the mounting plate: the206 piston must not pass
  // through a solid strap. The plate's outline is an estimated two-boss shape.
  const mountOutline=[];
  const axis=Math.atan2(pz,px);
  for(let i=0;i<=24;i++){const a=axis+Math.PI/2+Math.PI*i/24;mountOutline.push([Math.cos(a)*.0035,Math.sin(a)*.0035]);}
  for(let i=0;i<=24;i++){const a=axis-Math.PI/2+Math.PI*i/24;mountOutline.push([px+Math.cos(a)*.0075,pz+Math.sin(a)*.0075]);}
  const mountShape=new THREE.Shape(mountOutline.map(([x,z])=>new THREE.Vector2(x,-z)));
  for(const [x,z,r] of [[0,0,CUE.guideBore],[px,pz,.0045]]){const h=new THREE.Path();h.absarc(x,-z,r,0,TAU,true);mountShape.holes.push(h);}
  const mountGeo=new THREE.ExtrudeGeometry(mountShape,{depth:.0009,bevelEnabled:false});mountGeo.rotateX(-Math.PI/2);
  kit.name('liftMountingPlate203',add(lift,mountGeo,steel,0,guideBottom+.00075,0));
  add(lift,ring(.0045,.0075,guideBottom+.00075,guideBottom+.00165,32),steel,px,0,pz);
  const seal=part('liftSeal',lift,{name:'Rubber sleeve at lift guide',no:'204 (200 650)'});
  add(seal,ring(CUE.guideBore,.0026,guideBottom,guideBottom+.0012,24),rubber);
  // Spring205 surrounds the narrow stem between the piston shoulder and200.
  // Its seats are physical component surfaces, dimensions estimated.
  const spr205=part('liftSpring',lift,{name:'Compression spring returning lifting plunger206',no:'205 (216 853)'});
  const setLiftSpring=coilSpring(kit,spr205,.00125,CUE.springTurns,CUE.springWire,springMat,false);
  const sA=new THREE.Vector3(),sB=new THREE.Vector3();
  // Preserve the installed world orientation while making the attachment real.
  root.updateMatrixWorld(true);arm.fixedGimbal.updateMatrixWorld(true);
  arm.fixedGimbal.attach(lift);
  kit.name('liftGuide203',lift);kit.name('liftUpper200',sleeve);
  // ---- balance plate (243) and equalizing arm (210) --------------------------------------------------------------
  const Q = MAIN_LEVER.pivot, uL = Math.hypot(T.x - Q.x, T.z - Q.z);
  const u = { x: (T.x - Q.x) / uL, z: (T.z - Q.z) / uL }, n = { x: -u.z, z: u.x };
  const at = (a, b) => ({ x: T.x + u.x * a + n.x * b, z: T.z + u.z * a + n.z * b });
  const Pm = at(EQ.multi, 0), Ps = at(EQ.single, 0), mid = at((EQ.multi + EQ.single) / 2, 0);
  const A = { x: mid.x + n.x * EQ.d, z: mid.z + n.z * EQ.d };
  const R = Math.hypot(Pm.x - A.x, Pm.z - A.z);
  const gM = Math.atan2(Pm.z - A.z, Pm.x - A.x), gS = Math.atan2(Ps.z - A.z, Ps.x - A.x), aU = Math.atan2(u.z, u.x);
  // the shaft (211) in its bushing (214), on a bracket hung from the plate beside the lift (the manual puts the arm on
  // "the eccentric piece of the protecting plate" (233), which is the automatic's; the bracket stands in for it)
  const b214 = part('eqBushing', root, { name: 'Bushing of the equalizing arm, on its bracket (bracket: estimate)', no: '214 [M-Q] (221 463)' });
  const S = { x: A.x + u.x * EQ.strap, z: A.z + u.z * EQ.strap }; // the bracket's strap down from the plate: between the cue rod, the pawl and the switch arm, outside the segment's sweep
  const goldD = kit.mat(0x9c7a35, 0.9, 0.4);
  { const h = -0.00152 - EQ.tabY[0]; add(b214, new RoundedBoxGeometry(0.0040, h, 0.0012, 2, 0.0003), goldD, S.x, (-0.00152 + EQ.tabY[0]) / 2, S.z);
    add(b214, new RoundedBoxGeometry(0.0040, 0.0010, 0.0050, 2, 0.0003), goldD, S.x, -0.00152 - 0.0005, S.z + 0.0019); // its foot under the plate
    const tl = Math.hypot(S.x - A.x, S.z - A.z), tab = add(b214, plateGeo(stadium(0, tl + 0.0006, 0.0019), EQ.tabY[1] - EQ.tabY[0] - 0.0006, [[0, 0, 0.0017]]), goldD, A.x, (EQ.tabY[0] + EQ.tabY[1]) / 2, A.z); tab.rotation.y = -aU; }
  add(b214, ring(0.0013, 0.0021, EQ.tabY[0] - 0.0004, EQ.tabY[1] + 0.0003, 16), mats.brass(), A.x, 0, A.z);
  const s211 = part('eqShaft', root, { name: 'Shaft of the equalizing arm', no: '211 [M-Q] (219 073)' });
  add(s211, new THREE.CylinderGeometry(0.0012, 0.0012, 0.0050, 12), steel, A.x, (EQ.tabY[1] + 0.0004 + EQ.armY[0] - 0.0006) / 2, A.z);
  add(s211, ring(0.0, 0.0019, EQ.tabY[1] + 0.0003, EQ.tabY[1] + 0.0008, 16), steel, A.x, 0, A.z); // its head on the tab
  add(s211, ring(0.00121, 0.0018, EQ.armY[0] - 0.0006, EQ.armY[0] - 0.0001, 12), dark, A.x, 0, A.z); // a C washer under the arm
  // the arm (210): a boss on the shaft, a flat arm out to an eye that the balance plate's pin stands in
  const a210 = part('eqArm', root, { name: 'Equalizing arm (swings the balance plate under the lift bolt in "multi")', no: '210 [M-Q] (219 077)' });
  const arm210 = new THREE.Group(); arm210.position.set(A.x, 0, A.z); a210.add(arm210);
  const aY = (EQ.armY[0] + EQ.armY[1]) / 2, aT = EQ.armY[1] - EQ.armY[0];
  add(arm210, ring(0.00125, 0.0024, EQ.armY[0], EQ.armY[1], 20), goldD);
  { const g = barGeo(R - 0.0040, 0.0030, aT); add(arm210, g, goldD, 0.0020, aY, 0); }
  add(arm210,new THREE.BoxGeometry(.0012,.003,.003),goldD,R,aY+.001,0); // contact tab; no invented eye joint to243
  a210.userData.linkageFidelity={status:'assembly boundary',unresolved:'203-tab/210 contact contour; displayed210 angle remains prescribed'};
  // ---- mode selector detent: bushing, two balls (231), sleeve washer (230) ------------------------------------------
  const db = part('detentBushing', root, { name: 'Tonearm support detent bushing (dimensions estimated)', no: '— (with segment 201)' });
  const dbG = new THREE.Group(); dbG.position.set(P.x, 0, P.z); db.add(dbG);
  const brass = mats.brass(), b0 = DT.y - DT.ball - 0.0002, b1 = DT.y + DT.ball + 0.0002;
  add(dbG, ring(DT.rIn, DT.flange, DT.top - 0.0008, DT.top, 24), brass);
  add(dbG, ring(DT.rIn, DT.rOut, b1, DT.top - 0.0008, 24), brass);
  add(dbG, ring(DT.rIn, DT.rOut, DT.bot + 0.0008, b0, 24), brass);
  add(dbG, ring(DT.rIn, DT.flange, DT.bot, DT.bot + 0.0008, 24), brass);
  // the band the balls sit in: two arcs, with a window either side (x) for a ball
  for (const ph of [0.75 * Math.PI, 1.75 * Math.PI]) add(dbG, new THREE.LatheGeometry([[DT.rIn, b0], [DT.rOut, b0], [DT.rOut, b1], [DT.rIn, b1], [DT.rIn, b0]].map(([r, y]) => new THREE.Vector2(r, y)), 10, ph, Math.PI / 2), brass);
  const balls = part('detentBalls', root, { name: 'Balls 3 mm (the mode detent\'s)', no: '231 [M-Q] (211 718)' });
  const ballG = new THREE.Group(); ballG.position.set(P.x, 0, P.z); balls.add(ballG);
  const ballGeo = new THREE.SphereGeometry(DT.ball, 14, 10), chrome = kit.M.chrome;
  const ballL = add(ballG, ballGeo, chrome, 0, DT.y, 0), ballR = add(ballG, ballGeo, chrome, 0, DT.y, 0);
  const sw = part('sleeveWasher', root, { name: 'Rubber washer (the "sleeve washer" round the detent balls)', no: '230 [M-Q] (216 845)' });
  const swG = new THREE.Group(); swG.position.set(P.x, 0, P.z); sw.add(swG);
  const swR0 = DT.rOut + 0.00002; // seated: the balls flush with the bushing
  add(swG, ring(swR0, swR0 + DT.washer, DT.y - DT.washerH, DT.y + DT.washerH, 32), kit.mat(0xb8925c, 0, 0.7));
  // M-DE Fig.12: the detent locks the tonearm's support in its two heights. Its shaft belongs
  // at the arm axis, independent of the hand control's position. Groove dimensions estimated.
  const ms = part('bearingPost', root);
  const shaft = new THREE.Group(); shaft.position.set(P.x, 0, P.z); ms.add(shaft);
  const gv = (yc) => [[DT.shaftR, yc - DT.grooveW], [DT.shaftR - DT.groove, yc], [DT.shaftR, yc + DT.grooveW]];
  const shaftTop = 0.003;
  add(shaft, lathe([[0.00001, DT.shaftBot], [DT.shaftR - 0.0002, DT.shaftBot], [DT.shaftR, DT.shaftBot + 0.0002], ...gv(DT.y - 0.005), ...gv(DT.y), [DT.shaftR, shaftTop], [0.00001, shaftTop]], 16), steel);
  const grooveAt = (dy) => DT.groove * Math.max(0, 1 - Math.abs(dy) / DT.grooveW); // the V groove's depth dy from its centre

  // ---- mode selector70 and spring-loaded detent80/81/82 (plain1229 Fig30) -----
  const aRest=arm.angleFor(REST_DATUM); // separate tonearm-support detent231 reference (the fixed datum, spec.js)
  const dir=RL.dir*D,cd=Math.cos(dir),sd=Math.sin(dir),tdx=-sd,tdz=cd;
  const l70=part('locatingLever',root,{name:'Mode-selector lever and control arm',no:'70 [M-DE] (217 601)'});
  const g70=kit.name('modeLever70',new THREE.Group());g70.position.set(P.x,0,P.z);l70.add(g70);
  g70.userData.linkageFidelity={source:'1229 Fig30',status:'estimated profile',unresolved:'Hidden bearing-height drive geometry'};
  // Two detent seats in the estimated rim; one mesh outline also defines contact.
  const profile=phi=>{
    let depth=0;
    for(const centre of [dir,dir-RL.travel]){
      const d=Math.atan2(Math.sin(phi-centre),Math.cos(phi-centre));
      if(Math.abs(d)<RL.notchW)depth=Math.max(depth,RL.notch*Math.cos(d/RL.notchW*Math.PI/2)**2);
    }
    return RL.R-depth;
  };
  const outline=Array.from({length:512},(_,i)=>{const a=i/512*TAU,r=profile(a);return new THREE.Vector2(Math.cos(a)*r,Math.sin(a)*r);});
  const shape=new THREE.Shape(outline.map(p=>new THREE.Vector2(p.x,-p.y)));
  shape.holes.push(new THREE.Path().absarc(0,0,.00455,0,TAU,true));
  const rimGeo=new THREE.ExtrudeGeometry(shape,{depth:RL.t,bevelEnabled:false});rimGeo.rotateX(-Math.PI/2);
  const rim=kit.name('modeDetentRim',add(g70,rimGeo,goldD,0,RL.y,0));
  // Arm chain (mode-height.js): two ramps on70's top face. The ears under gimbal60 rest on them;
  // turning70 slides a ramp under each ear and the ramp's material sets the arm's height. The same
  // polyline is this solid's top and the contact surface. Shape and dimensions are estimates; only
  // the 5 mm between the dwells is from a source (owner's manual p.11).
  {
    const MR=MODE_RAMP,pts=RAMP_PROFILE,n=pts.length,pos=[],idx=[];
    // per sample: inner-bottom, outer-bottom, outer-top, inner-top (70's frame, ear-at-single relative)
    for(const [u,h] of pts){const a=MR.earAngle+u,c=Math.cos(a),sn=Math.sin(a);
      pos.push(c*MR.rIn,0,sn*MR.rIn, c*MR.rOut,0,sn*MR.rOut, c*MR.rOut,h,sn*MR.rOut, c*MR.rIn,h,sn*MR.rIn);}
    const q=(a,b,c,d)=>idx.push(a,b,c,a,c,d);
    for(let i=0;i<n-1;i++){const a=4*i,b=4*(i+1);q(a+3,a+2,b+2,b+3);q(a,b,b+1,a+1);q(a+1,b+1,b+2,a+2);q(a,a+3,b+3,b);}
    q(0,1,2,3);const e=4*(n-1);q(e,e+3,e+2,e+1);
    const rampGeo=new THREE.BufferGeometry();rampGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));rampGeo.setIndex(idx);rampGeo.computeVertexNormals();
    const rampMat=kit.mat(0xd9d3c4,0,.6);rampMat.side=THREE.DoubleSide;
    const ramps=part('modeRamps',g70,{name:'Height ramps on mode lever70 (ear supports; shape estimated)',no:'70 [M-DE] (217 601)'});
    earAngles().forEach((_,i)=>{const m=kit.name(`modeRamp${i+1}`,add(ramps,rampGeo,rampMat,0,MR.y0,0));m.rotation.y=-i*Math.PI;});
  }
  const handleX=C.mode.x-P.x,handleZ=C.mode.z-P.z,handleR=Math.hypot(handleX,handleZ),handleA=Math.atan2(handleZ,handleX);
  const controlArm=add(g70,plateGeo(stadium(RL.hub*.8,handleR,.0015),RL.t-.0006),goldD,0,RL.y+RL.t/2,0);controlArm.rotation.y=-handleA;
  // The visible stalk and its hit target share70's transform, including both modes.
  const stalk=deps.modePin;g70.add(stalk);stalk.position.set(handleX,deps.modeTop,handleZ);
  const n71=part('nut71',root,{name:'Nut retaining mode-selector bearing sleeve',no:'71 [M-DE] (218 321)'});
  const g71=kit.name('modeNut71',new THREE.Group());g71.position.set(P.x,0,P.z);n71.add(g71);
  {const pts=Array.from({length:6},(_,i)=>new THREE.Vector2(Math.cos(i*TAU/6)*.0062,Math.sin(i*TAU/6)*.0062));
    const sh=new THREE.Shape(pts);sh.holes.push(new THREE.Path().absarc(0,0,.00425,0,TAU,true));
    const g=new THREE.ExtrudeGeometry(sh,{depth:.0007,bevelEnabled:false});g.rotateX(-Math.PI/2);add(g71,g,steel,0,-.0023,0);}
  const F0={x:P.x+cd*(RL.R+RL.roller),z:P.z+sd*(RL.R+RL.roller)};
  const Hp={x:F0.x+tdx*RL.arm,z:F0.z+tdz*RL.arm};
  const K={x:Hp.x+tdx*RL.tail+cd*RL.spring,z:Hp.z+tdz*RL.tail+sd*RL.spring};
  const pin83=part('restPin',root,{name:'Fixed mode-detent pivot pin',no:'83 [M-DE] (213 260)'});
  kit.name('modeDetentPivot',add(pin83,new THREE.CylinderGeometry(.0008,.0008,.0022,16),steel,Hp.x,.0011,Hp.z));
  const detent=part('restLever',root,{name:'Mode-selector detent lever',no:'81 [M-DE] (217 381)'});
  const lev=kit.name('modeDetent81',new THREE.Group());lev.position.set(Hp.x,RL.leverY,Hp.z);detent.add(lev);
  add(lev,plateGeo(stadium(-RL.tail,RL.arm,.0013),RL.leverT-.0006,[[0,0,.00115]]),goldD);
  const rollerY=RL.y+RL.t/2;
  add(lev,new THREE.CylinderGeometry(.0006,.0006,RL.leverY+RL.leverT/2-(rollerY-RL.rollerH/2),12),steel,RL.arm,(rollerY-RL.rollerH/2-RL.leverY+RL.leverT/2)/2,0);
  const rollerPart=part('restRoller',lev,{name:'Mode-selector detent roller',no:'82 [M-DE] (217 385)'});
  const rollG=kit.name('modeRoller82',new THREE.Group());rollG.position.set(RL.arm,rollerY-RL.leverY,0);rollerPart.add(rollG);
  add(rollG,ring(.00062,RL.roller,-RL.rollerH/2,RL.rollerH/2,64),kit.mat(0xe7e3d6,0,.5));
  const springPart=part('restSpring',root,{name:'Mode-selector detent tension spring',no:'80 [M-DE] (217 386)'});
  const fixedHook=kit.name('modeSpringFixedHook',add(springPart,new THREE.CylinderGeometry(.0005,.0005,.002,12),steel,K.x,.001,K.z));
  const movingHook=kit.name('modeSpringMovingHook',add(lev,new THREE.CylinderGeometry(.0005,.0005,RL.leverY+RL.leverT/2-.0003,12),steel,-RL.tail,(.0003-RL.leverY+RL.leverT/2)/2,0));
  const setModeSpring=coilSpring(kit,springPart,.00035,9,.0001,springMat,true);
  const tA=new THREE.Vector3(),tB=new THREE.Vector3();
  const contactGap=(la,turn)=>{
    const x=Hp.x+Math.cos(la)*RL.arm-P.x,z=Hp.z+Math.sin(la)*RL.arm-P.z,c=Math.cos(turn),sn=Math.sin(turn);
    const px=c*x+sn*z,pz=-sn*x+c*z;
    let distance=Infinity;
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length],dx=b.x-a.x,dz=b.y-a.y;
      const t=clamp(((px-a.x)*dx+(pz-a.y)*dz)/(dx*dx+dz*dz),0,1);
      distance=Math.min(distance,Math.hypot(px-a.x-t*dx,pz-a.y-t*dz));
    }
    return (Math.hypot(px,pz)<profile(Math.atan2(pz,px))?-distance:distance)-RL.roller;
  };
  // Fixed pivot81, rigid axle82, and zero clearance to the actual polygon of70.
  // No independent roller animation. Spring80 selects the contact-side solution.
  const baseAngle=Math.atan2(F0.z-Hp.z,F0.x-Hp.x);
  function rollerAt(turn){
    let lo=baseAngle-.6,hi=baseAngle+.6;
    if(contactGap(lo,turn)>0||contactGap(hi,turn)<0)throw new RangeError('Mode detent cannot reach selector rim');
    for(let i=0;i<48;i++){const mid=(lo+hi)/2;if(contactGap(mid,turn)>0)hi=mid;else lo=mid;}
    return (lo+hi)/2;
  }
  // ---- the lift (cue) lever's sleeve and axle (64), damping plate (221), rubber sleeve (222) -------------------------
  const cl = deps.cueLever; // turns about x at the pivot under the plate
  const p64 = part('cueHandle', cl); // the lever's sleeve (the damped part) and axle: the same part 64 as its handle
  { const g = new THREE.CylinderGeometry(CD.sleeveR, CD.sleeveR, CD.sleeveL, 20); g.rotateZ(Math.PI / 2); add(p64, g, steel); }
  const axL = 0.0085, ax0 = -0.0060;
  { const g = new THREE.CylinderGeometry(CD.axleR, CD.axleR, axL, 10); g.rotateZ(Math.PI / 2); add(p64, g, steel, ax0 + axL / 2, 0, 0); }
  const x221 = C.cue.x - CD.sleeveL / 2 - 0.0001 - CD.plateT; // the plate's outer face (x), a silicone film from the sleeve's end
  const p221 = part('dampingPlate', root, { name: 'Damping plate (silicone film against the lift lever\'s sleeve)', no: '221 [M-Q] (225 214)' });
  {
    const s = new THREE.Shape(), w = CD.plateW / 2, y0 = CD.plateBot, y1 = -0.00152;
    // in the y-z plane: x of the shape -> z, y -> y; a notch at the bottom corner (Fig. 29)
    s.moveTo(-w, y0); s.lineTo(w - 0.0025, y0); s.lineTo(w - 0.0025, y0 + 0.0015); s.lineTo(w, y0 + 0.0015); s.lineTo(w, y1); s.lineTo(-w, y1); s.closePath();
    const hole = new THREE.Path(); hole.absarc(0, C.cue.y, CD.axleR + 0.00006, 0, TAU, true); s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: CD.plateT, bevelEnabled: false }); g.rotateY(Math.PI / 2);
    add(p221, g, kit.mat(0xa9aba6, 0.85, 0.45), x221, 0, C.cue.z);
    const tab = add(p221, new THREE.BoxGeometry(0.0045, 0.0007, 2 * w), kit.mat(0xa9aba6, 0.85, 0.45), x221 - 0.00225 + CD.plateT, -0.00152 - 0.00035, C.cue.z); tab.castShadow = false; // its foot under the plate
  }
  const p222 = part('cueRubber', cl, { name: 'Rubber sleeve holding the damping plate on the lever\'s axle', no: '222 [M-Q] (200 650)' });
  { const g = ring(CD.axleR + 0.00002, CD.rubberR, 0, CD.rubberT, 16); g.rotateZ(Math.PI / 2); add(p222, g, rubber, x221 - C.cue.x - 0.00005, 0, 0); }

  // ---- pivot pins: the skating lever's and the lift cam bracket's ---------------------------------------------------
  const pin = (key, info, at, yBot, r = 0.0009) => {
    const p = part(key, root, info);
    add(p, new THREE.CylinderGeometry(r, r, -0.00152 - yBot, 10), steel, at.x, (-0.00152 + yBot) / 2, at.z);
    add(p, ring(r + 0.00001, r + 0.0007, yBot, yBot + (at.washer || 0.0005), 12), dark, at.x, 0, at.z); // its C washer
    return p;
  };
  pin('skatePin', { name: 'Pivot stud of the skating lever', no: '— (with 266 C washer)' }, deps.skPivot, deps.skPivot.yBot);
  // (the lift cam's pivot is drawn by the automatic as the shaft of its connecting lever bracket 216)

  // ---- one frame ------------------------------------------------------------------------------------------------
  // k: the mode's eased look (0 single .. 1 multi), as the arm's raise follows it
  // mode: { k (0 single .. 1 multi, only for the still-prescribed 210 equalizer), turn (operator's
  // 70 turn), raise (solved from the ear/ramp contact) }
  function update(dt, s, ctx, mode) {
    const { k, turn, raise } = mode;
    // Upstream equalizer position is explicitly prescribed until the203/210
    // contact contour is established.243 itself remains retained on184.
    arm210.rotation.y=-(gS+(gM-gS)*k);
    equalizer.update(s);

    //206 foot is part of the same rigid plunger as198, never an independently
    // posed cup. The equalizer linkage is shown separately; its exact engagement
    // with184/206 remains unresolved instead of forcing the plunger onto it.
    const foot=arm.liftFootY(s.lift,raise);
    sA.set(0,foot-raise+CUE.pistonLength,0);sB.set(0,CUE.springSeat,0);setLiftSpring(sA,sB,0);
    // The support shaft rises with the arm; balls remain in the segment sleeve and follow its grooves.
    const off = raise; shaft.position.y = off;
    dbG.rotation.y = ballG.rotation.y = swG.rotation.y = -(ctx.armAngle - aRest);
    let rc = 0; // the ball's centre: as close in as the shaft's profile under it lets it (sampled across the ball)
    for (let i = -6; i <= 6; i++) { const y = (i / 6) * DT.ball * 0.98, yl = DT.y + y - off, sr = DT.shaftR - Math.max(grooveAt(yl - DT.y), grooveAt(yl - DT.y + 0.005)); rc = Math.max(rc, sr + Math.sqrt(DT.ball * DT.ball - y * y)); }
    rc += 0.00005;
    ballL.position.x = rc; ballR.position.x = -rc;
    const sc = Math.max(1, (rc + DT.ball + 0.00003) / swR0); swG.scale.set(sc, 1, sc);
    // Operator commands70. The fixed detent81/82 follows its physical rim;
    // neither assembly follows the tonearm's yaw or the raised support shaft.
    const modeTurn=turn;
    g70.rotation.y=-modeTurn;
    const la=rollerAt(modeTurn);lev.rotation.y=-la;
    tA.set(Hp.x-Math.cos(la)*RL.tail,RL.springY,Hp.z-Math.sin(la)*RL.tail);
    tB.set(K.x,RL.springY,K.z);setModeSpring(tA,tB,.0006);

  }
  return { update, eqPivot: A };
}

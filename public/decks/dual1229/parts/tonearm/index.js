// Tonearm: the arm itself (arm.js), the arm-base escutcheon (68) with its legends, and the
// controls and linkages that are the arm's: the lift handle with its lift cam and connecting
// rod, the lift tube, the mode selector pin and its lift under the bearing, the anti-skating
// knob with its cam, lever and spring, and the tracking force dial on the gimbal.
// Owned by the tonearm builder (see OWNERS.md).
//
// build(kit) -> { group, arm, points, update(dt, s, ctx), setXray(on) }
import * as THREE from 'three';
import { knurlTexture } from '../../../../deck3d/textures.js';
import { SPEC } from '../../spec.js';
import { SKATING, SKATING_PROFILE, SKATE_ANCHOR, skatingPose, skatingMoment } from '../../anti-skate-contact.js';
import { CUE_LINK, manualLeverPose } from './cue-linkage.js';
import { HANDLE, HOOK, SETTING_218 } from '../../cue-chain.js';
import { TAU, D, PIVOT } from '../../layout.js';
import { lathe, plateGeo, barGeo, aim, helixGeo, rodBetween, V3, RoundedBoxGeometry } from '../shared/geometry.js';
import { createDualArm } from './arm.js';
import { CONTROLS as C, ESC, MODE_SELECTOR as MS } from './place.js';
import { skateFaceTexture, skateAngle, legendTexture, cueTexture } from './textures.js';
import { buildWorking } from './working.js';
import { selectorTurn, modeHeight } from '../../mode-height.js';

export function build(kit) {
  const { M, add, hit, part, mats } = kit;
  const root = kit.group('tonearm');
  const red = new THREE.MeshStandardMaterial({ color: 0xc22b20, roughness: 0.45 });
  const escMat = kit.ghost(kit.mat(0x161618, 0.15, 0.5), 0.12);
  const panelMat = kit.ghost(kit.mat(0x111113, 0.2, 0.36), 0.12);
  const decals = []; // printed legends: faded in X-ray

  // ---- the escutcheon (68): a black raised plate round the bearing post --------------------------------
  const esc = part('escutcheon', root, { name: 'Arm-base escutcheon ("Abdeckung")', no: '68 (227 004)' });
  kit.name('escutcheon', esc);
  {
    const s = new THREE.Shape(), r = ESC.r, E = ESC;
    // in the shape's own plane: x as x, y as -z (plateGeo's convention)
    s.moveTo(E.x0 + r, -E.z0); s.lineTo(E.x1 - r, -E.z0); s.quadraticCurveTo(E.x1, -E.z0, E.x1, -E.z0 - r);
    s.lineTo(E.x1, -E.z1 + r); s.quadraticCurveTo(E.x1, -E.z1, E.x1 - r, -E.z1);
    s.lineTo(E.diag.x + r, -E.z1); s.quadraticCurveTo(E.diag.x, -E.z1, E.diag.x - 0.0006, -E.z1 + r);
    // the long diagonal (bowed out a little) up to the straight run of the left edge
    s.quadraticCurveTo(E.x0 + 0.0035, -E.diag.z - 0.012, E.x0, -E.diag.z);
    s.lineTo(E.x0, -E.z0 - r); s.quadraticCurveTo(E.x0, -E.z0, E.x0 + r, -E.z0);
    // Fig30 cover68 encloses70/81/82: a hollow cover, not a solid block.
    // Wall thickness/opening dimensions are estimates; outer silhouette is retained.
    const modeHole=()=>{
      const radius=Math.hypot(C.mode.x-PIVOT.x,C.mode.z-PIVOT.z),a=Math.atan2(C.mode.z-PIVOT.z,C.mode.x-PIVOT.x),pts=[];
      for(let i=0;i<=48;i++){const t=a-.075+(MS.travel+.15)*i/48;pts.push(new THREE.Vector2(PIVOT.x+(radius+.0028)*Math.cos(t),-PIVOT.z-(radius+.0028)*Math.sin(t)));}
      for(let i=48;i>=0;i--){const t=a-.075+(MS.travel+.15)*i/48;pts.push(new THREE.Vector2(PIVOT.x+(radius-.0028)*Math.cos(t),-PIVOT.z-(radius-.0028)*Math.sin(t)));}
      return new THREE.Path(pts);
    };
    const roof=s.clone();
    roof.holes.push(new THREE.Path().absarc(PIVOT.x,-PIVOT.z,.0178,0,TAU,true),modeHole());
    const g=new THREE.ExtrudeGeometry(roof,{depth:.0006,bevelEnabled:false,curveSegments:32});
    g.rotateX(-Math.PI/2);g.translate(0,E.h-.0006,0);
    kit.name('modeCoverRoof',add(esc,g,escMat)).castShadow=false;
    const skirt=s.clone(),cx=(E.x0+E.x1)/2,cz=-(E.z0+E.z1)/2;
    skirt.holes.push(new THREE.Path(s.getPoints(48).map(p=>new THREE.Vector2(cx+(p.x-cx)*.98,cz+(p.y-cz)*.99))));
    const skirtG=new THREE.ExtrudeGeometry(skirt,{depth:E.h-.0006,bevelEnabled:false,curveSegments:32});skirtG.rotateX(-Math.PI/2);
    add(esc,skirtG,escMat);
    // the raised legend panel on its right
    const P = E.panel, p = new THREE.Shape();
    // a rectangle round the dial, and a column up its right-hand side to the mode pin, the corner
    // between them curved round the gimbal's sweep
    p.moveTo(P.x0, -P.z1); p.lineTo(P.x1, -P.z1); p.lineTo(P.x1, -P.zTop); p.lineTo(P.xCol, -P.zTop);
    p.lineTo(P.xCol, -P.z0 + 0.003); p.quadraticCurveTo(P.x0 + 0.002, -P.z0 + 0.001, P.x0, -P.z0 - 0.012); p.closePath();
    p.holes.push(modeHole());
    const pg = new THREE.ExtrudeGeometry(p, { depth: P.h * 0.5, bevelEnabled: true, bevelSize: 0.0003, bevelThickness: P.h * 0.25, bevelSegments: 1, curveSegments: 12 });
    pg.rotateX(-Math.PI / 2); pg.translate(0, E.h + P.h * 0.25, 0);
    kit.name('modeCoverPanel',add(esc, pg, panelMat)).castShadow = false;
    // the slotted screw holding it down
    add(esc, lathe([[0.0028, 0], [0.0028, 0.0006], [0.0022, 0.0012], [0, 0.0013]], 24), M.chrome, E.screw.x, E.h, E.screw.z);
    add(esc, new THREE.BoxGeometry(0.0046, 0.0005, 0.0007), kit.mat(0x2a2a2c, 0.5, 0.5), E.screw.x, E.h + 0.0012, E.screw.z).rotation.y = 0.6;
    // the legends: white print on black (MAARC rb-040, V-dF 2:44, V-bX 4:10). No "CD4" on the plain 1229.
    const top = E.h + P.h, box = { x0: 0.188, z0: -0.114, w: 0.034, d: 0.081 };
    const k = C.skate;
    const tex = legendTexture(box, [
      { text: 'single', x: 0.2115, z: -0.0938, size: 0.0026 },
      { text: 'tracking', x: 0.2085, z: -0.0812, size: 0.0026 },
      { angle: 0.0030, x: 0.2172, z: -0.0812 },
      { text: 'multi', x: 0.1962, z: -0.0688, size: 0.0026 },
      { ring: 0.0008, x: 0.1932, z: -0.0605 },
      { ring: 0.0009, x: 0.1945, z: -0.0432 },
      { tri: 0.0034, x: k.x - k.r - 0.0030, z: k.z },
      { text: 'anti - skating', x: k.x, z: -0.0381, size: 0.0024 },
    ]);
    const dm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const decal = add(esc, new THREE.PlaneGeometry(box.w, box.d), dm, box.x0 + box.w / 2, top + 0.00005, box.z0 + box.d / 2);
    decal.rotation.x = -Math.PI / 2; decal.castShadow = false; decals.push(dm);
  }

  // ---- the lift (cue) handle: a thin stalk at the plate's right edge, pulled forward to raise --------------
  const cueH = part('cueHandle', root, { name: 'Lift lever complete (handle, its sleeve and axle under the plate)', no: '64 [M-Q] (216 881)' });
  const cueLever = new THREE.Group(); cueLever.position.set(C.cue.x, C.cue.y, C.cue.z); cueH.add(cueLever);
  add(cueLever, lathe([[0.0015, 0], [0.0015, 0.0255], [0, 0.0255]], 16), M.chrome);
  add(cueLever, lathe([[0.0016, 0.0215], [0.0029, 0.0235], [0.0030, C.cue.len - 0.0022], [0.0024, C.cue.len - 0.0004], [0, C.cue.len]], 24), kit.mat(0x111113, 0.1, 0.45));
  // the slot it stands in, across the strip's rear edge, and the two symbols printed left of it (Fig. 30: x +213)
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 });
  add(cueH, new RoundedBoxGeometry(0.0040, 0.0004, 0.020, 2, 0.00018), slotMat, C.cue.x, 0.00045, C.cue.z + 0.003).castShadow = false;
  const cm = new THREE.MeshStandardMaterial({ map: cueTexture(), transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const cueSym = add(cueH, new THREE.PlaneGeometry(0.0065, 0.0217), cm, C.cueSymbols.x, 0.00056, C.cueSymbols.z); cueSym.rotation.x = -Math.PI / 2; cueSym.castShadow = false;
  decals.push(cm);
  hit('dual:cue', new THREE.BoxGeometry(0.016, 0.040, 0.036), C.cue.x, 0.018, C.cue.z);

  // ---- external stalk belongs rigidly to rotating selector70 --------------------------------
  const modeP=part('modeSelector',root,{name:'Mode selector stalk on lever70',no:'70 [M-DE] (217 601)'});
  const modeTop=ESC.h+ESC.panel.h;
  const modePin=kit.name('modeStalk',new THREE.Group());modePin.position.set(C.mode.x,modeTop,C.mode.z);modeP.add(modePin);
  add(modePin,lathe([[.0024,-.0032],[.0024,.0058],[.0019,.0072],[.0008,.0077],[0,.0078]],24),M.chrome);
  hit('dual:mode',new THREE.CylinderGeometry(.0075,.0075,.02,16),0,.006,0,modePin);

  // ---- anti-skating knob (79 / 84): black, knurled, its face printed with both scales ---------------------
  const K = C.skate;
  const skateP = part('skateKnob', root, { name: 'Anti-skating knob, red and white scales', no: '79 [M-DE] / 84 [M-Q]' });
  const skateKnob = new THREE.Group(); skateKnob.position.set(K.x, ESC.h + ESC.panel.h, K.z); skateP.add(skateKnob);
  const knurl = knurlTexture(72); knurl.repeat.set(1, 1);
  add(skateKnob, lathe([[K.r - 0.0006, 0], [K.r, 0.0006], [K.r, K.h - 0.0016], [K.r - 0.0008, K.h - 0.0004], [K.r - 0.0012, K.h], [0, K.h]], 96), kit.mat(0x18181a, 0.45, 0.42, { bumpMap: knurl, bumpScale: 1.2 }));
  const face = add(skateKnob, new THREE.CircleGeometry(K.r - 0.0011, 64), new THREE.MeshStandardMaterial({ map: skateFaceTexture(), roughness: 0.42, metalness: 0.1 }), 0, K.h + 0.00003, 0);
  face.rotation.x = -Math.PI / 2;
  hit('dual:skate', new THREE.CylinderGeometry(K.r + 0.003, K.r + 0.003, 0.014, 20), K.x, ESC.h + 0.006, K.z);

  // ---- the arm, and the tracking force dial on it ---------------------------------------------------------
  const armMats = {
    red, cart: new THREE.MeshStandardMaterial({ color: 0x151517, metalness: 0.15, roughness: 0.4 }),
    cartNose: new THREE.MeshStandardMaterial({ color: 0x2b2c30, roughness: 0.5 }),
  };
  const arm = createDualArm(kit, armMats);
  root.add(arm.group); kit.name('arm', arm.group);
  const forceHit = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 16), new THREE.MeshBasicMaterial({ visible: false }));
  forceHit.rotation.x = Math.PI / 2; forceHit.position.z = -0.003; forceHit.userData.control = 'dual:force'; arm.forceDial.add(forceHit); kit.hits.push(forceHit);

  // ---- under the plate -------------------------------------------------------------------------------------
  const P = arm.pivot;
  // guide203/upper sleeve200 and return spring205: working.js; plunger206/tip198: arm.js
  // Plain1229 Fig18: shared64/220 shaft and fixed234 transverse rocker.
  // The fitted cam drives270 by actual contact; the output hook seat remains open.
  const cue=part('cueCam',root,{name:'Cue cam and rocking lever',no:'220 / 270'});
  cue.userData.linkageFidelity={status:'partial contact reconstruction',source:'1229 p10 Fig18',
    unresolved:'Measured220 contour,234 position, bent270 hook/243 seat and218 adjustment'};
  const L=CUE_LINK;
  const cueCam=kit.name('cueCam220',new THREE.Group());cueCam.position.set(L.axis.x,L.axis.y,L.axis.z);cue.add(cueCam);
  // Unbevelled contact contour: the solver and the visible solid share this profile.
  const shape=new THREE.Shape(L.profile.map(([y,z])=>new THREE.Vector2(-z,y)));
  shape.holes.push(new THREE.Path().absarc(0,0,.001,0,TAU,true));
  const cg=new THREE.ExtrudeGeometry(shape,{depth:L.camThickness,bevelEnabled:false});
  cg.translate(0,0,-L.camThickness/2);cg.rotateY(Math.PI/2);
  kit.name('cueCam220Mesh',add(cueCam,cg,mats.nylon()));
  const cueAxle=new THREE.CylinderGeometry(.0008,.0008,.014,16);cueAxle.rotateZ(Math.PI/2);
  add(cueH,cueAxle,mats.steel(),L.axis.x+.0045,C.cue.y,C.cue.z);
  const cueRod=kit.name('cueRocker234',new THREE.Group());cue.add(cueRod);
  cueRod.position.set(L.pivot.x,L.pivot.y,L.pivot.z);cueRod.rotation.y=-Math.atan2(L.dir.z,L.dir.x);
  const rodTilt=kit.name('cueLever270',new THREE.Group());cueRod.add(rodTilt);
  const end=L.output;
  // Fig18's paddle has a fixed bend relative to270's shank. It is horizontal
  // at cue-up; straightening this part is a documented repair failure.
  const paddle=new THREE.Group();paddle.position.x=L.bendRoot;paddle.rotation.z=L.paddleBend;rodTilt.add(paddle);
  kit.name('cueInput270Mesh',add(paddle,new THREE.BoxGeometry(.024,L.thickness,.018),mats.steel(),-.012,0,0));
  // Shank split at the234 pin: the input side is held by220; the output side carries the
  // hook and flexes while206 lags in its oil (cue-chain.js). The flex is drawn as a rotation
  // of the output side about the pin: an approximation of a bending strip, not a solved beam.
  const strip=pts=>{const g=new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x,z])=>new THREE.Vector2(x,-z))),{depth:L.thickness,bevelEnabled:false});
    g.rotateX(-Math.PI/2);g.translate(0,-L.thickness/2,0);return g;};
  kit.name('cueLever270Mesh',add(rodTilt,strip([[L.bendRoot,-.009],[L.bendRoot+.006,-.0015],[0,-.0015],[0,.0015],[L.bendRoot+.006,.0015],[L.bendRoot,.009]]),mats.steel()));
  const rodOut=kit.name('cueLever270Output',new THREE.Group());rodTilt.add(rodOut);
  // Hook (estimate): the shank runs to the hook point, drops through184's slot and bears
  // on243's underside. Drop and tip follow cue-chain.js (HOOK point, SETTING_218).
  // BOUNDARY: 184's slot is not cut in the cycle chain's184 mesh, and the drop is drawn
  // straight down, so it passes through243's edge; the real J-shaped path is unmeasured.
  const hx=(HOOK.point.x-L.pivot.x)*L.dir.x+(HOOK.point.z-L.pivot.z)*L.dir.z, hz=(HOOK.point.x-L.pivot.x)*-L.dir.z+(HOOK.point.z-L.pivot.z)*L.dir.x;
  kit.name('cueLever270OutMesh',add(rodOut,strip([[0,-.0015],[hx,-.0015],[hx,.0015],[0,.0015]]),mats.steel()));
  const tipTop=L.thickness/2+SETTING_218,drop=-SETTING_218-L.thickness;
  add(rodOut,new THREE.BoxGeometry(.0012,drop,.0012),mats.steel(),hx,-L.thickness/2-drop/2,hz);
  kit.name('cueHook270',add(rodOut,new THREE.BoxGeometry(.0025,L.thickness,.0025),mats.steel(),hx,tipTop-L.thickness/2,hz));
  const hinge=new THREE.CylinderGeometry(.0012,.0012,.009,16);hinge.rotateX(Math.PI/2);
  add(cueRod,hinge,mats.steel());
  // anti-skating: two-track cam (258) on the knob's shaft, skating lever (267), spring (265)
  const sk = part('skateCam', root, { name: 'Anti-skating cam and contact-driven linkage (estimated contour)', no: '258 / 267 / 265 [M-DE]' });
  // M-DE p.8: cam 258 is fixed to knob 79's shaft. One transform owns both rotations;
  // changing the selected printed scale cannot rotate a hidden cam independently.
  const skCam = new THREE.Group(); skCam.position.set(0, -0.0075 - skateKnob.position.y, 0); skateKnob.add(skCam);
  const camParts = part('skateCam', skCam);
  add(camParts, new THREE.CylinderGeometry(0.0022, 0.0022, 0.012, 12), mats.steel(), 0, 0.004, 0);
  const skState = {turn:NaN,pose:null};
  const skPts = SKATING_PROFILE;
  const skShape = new THREE.Shape(skPts.map(([x,z])=>new THREE.Vector2(x,-z)));
  const skGeometry = new THREE.ExtrudeGeometry(skShape,{depth:.003,bevelEnabled:false});
  skGeometry.rotateX(-Math.PI/2);skGeometry.translate(0,-.0015,0);
  kit.name('skatingCam258',add(camParts,skGeometry,mats.nylon()));
  // Existing schematic spring route, still awaiting a measured reconstruction: it runs
  // below the segment from a pin hanging from the skating lever's end
  // (right of the bearing, where the segment never swings) to a pin hanging from a lug clamped on the bearing
  // shaft, which turns with the arm and rides up with it in multi. Routing and sizes are estimates.
  const SKL = { end: { x: P.x + 0.034, z: P.z + 0.008 }, y: -0.0125, pinBot: SKATE_ANCHOR.y - 0.0006 }; // the lever's end and its pin, down to the spring's level
  const skLever = new THREE.Group(); skLever.position.set(K.x - 0.004, SKL.y, K.z - 0.012); sk.add(skLever);
  const skAim = SKATING.zeroAngle;
  const skLen = SKATING.length + .0015;
  { const st = []; for (let i = 0; i <= 12; i++) { const a = Math.PI / 2 + (i / 12) * Math.PI; st.push([Math.cos(a) * 0.0025, Math.sin(a) * 0.0025]); }
    for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI; st.push([skLen - 0.0025 + Math.cos(a) * 0.0025, Math.sin(a) * 0.0025]); }
    add(skLever, plateGeo(st, 0.0010, [[0, 0, 0.00125]]), mats.steel(), 0, 0, 0); } // (plateGeo's bevel adds 0.3 mm all round) // turns on its stud (working.js)
  add(skLever, new THREE.CylinderGeometry(0.0008, 0.0008, SKL.y - SKL.pinBot, 10), mats.steel(), skLen - 0.0015, (SKL.pinBot - SKL.y) / 2, 0);
  // Raised integral follower tab267 shares its rigid lever pose and meets258.
  const sf=SKATING.follower;
  const followerTab=add(skLever,barGeo(Math.hypot(sf.x,sf.z),.0014,.001),mats.steel());
  followerTab.rotation.y=-Math.atan2(sf.z,sf.x);
  kit.name('skatingFollower267',add(skLever,new THREE.CylinderGeometry(sf.r,sf.r,.006,24),mats.steel(),sf.x,.003,sf.z));
  kit.name('skatingLever267',skLever);
  // Spring 265's other end hooks to the ear on segment 201 (drawn with 201 in parts/automatic; Y4).
  const skSpring = add(sk, helixGeo(1, 0.0014, 10, 0.0003), mats.steel(), 0, 0, 0);
  const skHooks = [0, 1].map(() => add(sk, new THREE.CylinderGeometry(0.0003, 0.0003, 1, 6), mats.steel())); // its end hooks round the pins
  // The earlier sliding wedge/link had no source support. Omit that mechanism until its
  // actual actuation is established; the documented 5 mm height change remains a posed motion.

  const working = buildWorking(kit, root, {
    arm, cueLever, modeTop, modePin,
    skPivot: { x: skLever.position.x, z: skLever.position.z, yBot: SKL.y - 0.0008 - 0.00025, washer: 0.0002 },
    cuePivot: { x: cueCam.position.x, z: cueCam.position.z, yBot: -0.0095 - 0.0015 - 0.0003 - 0.0006 },
  });

  const points = {
    cue: () => { const a = cueLever.rotation.x, l = C.cue.len - 0.006; return [C.cue.x, C.cue.y + Math.cos(a) * l, C.cue.z + Math.sin(a) * l]; },
    mode: () => { root.updateMatrixWorld(true);const p=modePin.getWorldPosition(new THREE.Vector3());return [p.x,p.y+.008,p.z]; },
    skate: () => [K.x, ESC.h + K.h + 0.001, K.z],
    force: () => { const p = arm.forceDial.getWorldPosition(new THREE.Vector3()); return [p.x, p.y, p.z]; },
  };

  // ---- one frame ---------------------------------------------------------------------------------
  const lerp = (a, b, k) => a + (b - a) * k;
  const look = { cue: 0, mode: 0, init: false };
  const tmpA = V3(0, 0, 0), tmpB = V3(0, 0, 0), up = V3(0, 1, 0);
  // the anti-skating spring from pin a to pin b: a short straight hook at each end, the coil between
  const sA = V3(0, 0, 0), sB = V3(0, 0, 0), sD = V3(0, 0, 0);
  function springBetween(a, b) {
    sD.subVectors(b, a); const len = sD.length(), hook = Math.min(0.0025, len * 0.15); sD.divideScalar(len);
    sA.copy(a).addScaledVector(sD, hook); sB.copy(b).addScaledVector(sD, -hook);
    skSpring.position.copy(sA); skSpring.quaternion.setFromUnitVectors(up, sD); skSpring.scale.set(1, len - 2 * hook, 1);
    rodBetween(skHooks[0], a, sA); rodBetween(skHooks[1], sB, b);
  }
  // ctx: { armAngle (the arm's yaw, as arm.angleFor) }
  function update(dt, s, ctx) {
    const multi = s.mode === 'multi' ? 1 : 0;
    if (!look.init) { look.mode = multi; look.init = true; }
    // Mode is shared state; do not leave the bearing geometry in the previous mode.
    look.mode = multi; // support geometry must agree with the mechanism's selected mode
    // lift handle: leans back when lowered, forward when raised (pulled toward the listener)
    // The mechanism moves handle64 (cue-chain.js). A harness without a mechanism gets the
    // handle resting on the stop its command names; the view does not animate it.
    cueLever.rotation.x = Number.isFinite(s.cueHandle) ? s.cueHandle : (s.cueUp ? HANDLE.up : HANDLE.down);
    // Arm chain: the operator turns selector70 (named input); the ears under gimbal60 rest on its
    // ramps and that contact sets the whole arm's height (mode-height.js). No mode-to-height shortcut.
    const turn = selectorTurn(s.mode), height = modeHeight(turn);
    if (!height.valid) throw new RangeError('Mode ramp gives the arm no support');
    arm.setRaise(height.raise);
    // anti-skating: the value on the chosen scale turns to the index on the left
    skateKnob.rotation.y = (skateAngle(s.antiSkate, s.skateScale) + 90) * D;
    arm.setForce(s.trackingForce);
    // under the plate
    cueCam.rotation.x = cueLever.rotation.x;
    const manualPose=manualLeverPose(cueCam.rotation.x);
    if(manualPose.valid)rodTilt.rotation.z=manualPose.tilt;
    // While206 lags in its oil, the hook's output side flexes down onto243 (mechanism cueHook.flex).
    rodOut.rotation.z=-Math.atan2(s.cueHook&&Number.isFinite(s.cueHook.flex)?s.cueHook.flex:0,hx);
    cue.userData.manualPose=manualPose;
    //206 does not reverse-drive270; final hook contact remains unresolved.
    // Return bias seats the finite skating follower against its material cam.
    if(skState.turn!==skateKnob.rotation.y){skState.turn=skateKnob.rotation.y;skState.pose=skatingPose(skState.turn);}
    const skatePose=skState.pose;
    skLever.rotation.y=-skatePose.angle;
    sk.userData.contact=skatePose;
    const earA = ctx.armAngle + SKATE_ANCHOR.turn, pinR = SKATE_ANCHOR.pinR;
    tmpA.set(skatePose.springPin.x, SKATE_ANCHOR.y, skatePose.springPin.z);
    tmpB.set(P.x + Math.cos(earA) * pinR, SKATE_ANCHOR.y, P.z + Math.sin(earA) * pinR);
    springBetween(tmpA, tmpB);
    sk.userData.springEnds={lever:tmpA.toArray(),ear:tmpB.toArray()};
    sk.userData.moment=skatingMoment(skatePose,earA,pinR);
    working.update(dt, s, ctx, { k: look.mode, turn, raise: height.raise });
  }
  function setXray(on) { for (const m of decals) { m.opacity = on ? 0.25 : 1; m.needsUpdate = true; } }
  return { group: root, arm, points, update, setXray };
}

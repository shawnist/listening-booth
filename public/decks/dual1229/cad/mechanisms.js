// Reconstructed solids, driven by the deck's existing mechanism state.
// Detailed184 and installed229 share the finite contact model that drives the engine.
// Cue and changer share finite-contact solvers with the engine; unsourced
// installation dimensions and internal linkages are explicit reconstruction inputs.
import * as THREE from 'three';
import { rideRecord } from './arm.js';
import { automaticPose } from '../automatic-contact.js';
import { createCouplingContact } from './coupling-contact.js';
import { installSupports, installCycleHeight } from './installed-support.js';
import { createChangerContact } from './changer-contact.js';
import { createLiftContact, LIFT_INSTALLATION } from './lift-contact.js';
import { installLiftInterfaces, installCueLever, CUE_FORWARD, CUE_STRETCH, cueStretchZ } from './lift-installation.js';
import { HANDLE } from '../cue-chain.js';
import { modeHeight, selectorTurn } from '../mode-height.js';
import { EQ243, equalizerOffset } from '../parts/tonearm/equalizer-geometry.js';
import { cueArmAngle, supportedStylusY } from '../cue-geometry.js';
import { REST } from '../spec.js';
import { Y_REC } from '../../../deck3d/layout.js';

const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const identity = () => new THREE.Matrix4();
const translate = (x = 0, y = 0, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z);
const turn = (pivot, axis, angle) => translate(...pivot.toArray())
  .multiply(new THREE.Matrix4().makeRotationAxis(axis, angle))
  .multiply(translate(-pivot.x, -pivot.y, -pivot.z));

// Pinned to the reports for cycle plain-provisional/dish16, cue-down, and
// changer plain with historical hardware anchor. These are estimated datums,
// not factory dimensions. A different export requires its own datum record.
export const MECHANISM_DATUMS = Object.freeze({
  cycleVariant: 'plain-provisional-installed-up7mm',
  leverPivot: [0.1079771, -0.0227, -0.0764864],
  leverHeading: 20.521005367971544 * Math.PI / 180,
  camAxis: [0.0541212, 0, -0.0320416],
  cueShaft: [0.205, -0.006, 0.060 + CUE_FORWARD], // moved forward to the strip's slot (installCueLever)
  cuePivot: [0.1909, -0.02540220814382834, cueStretchZ(-0.0097)], // 270 stretched with the cue's move
  cueRearDirection: [-0.0316, 0, -0.1452 * CUE_STRETCH],
  cueDownAngle: -0.35, cueUpAngle: 0.55,
  cueDownTilt: 0.1928324952362252, cueUpTilt: 0.17481715768653638,
  rockerPivot: [0.018589551404359796, -0.02860995035707408, -0.01543031445274912],
  rockerAxis: [-0.6386936074870624, 0, -0.7694611593544942],
  lockingDirection: [176 - 54.1, 0, -(102 - 32)],
});

// Hide only meshes belonging to these legacy keys, never their groups/hit
// targets: the existing controller still updates those transforms and records.
export const MECHANISM_REPLACED_KEYS = Object.freeze({
  cycle: ['mainLever','spade','crossPin','leverStud','leaf181','balancePlate','equalizerRetainer','clutch','camGroove','camBracket','camAxle','bearing'],
  cue: ['cueHandle', 'cueCam', 'dampingPlate', 'liftTube', 'positioningSleeve',
    'liftPlunger', 'liftTip', 'liftWasher', 'liftSpring', 'bracket216', 'bracket234'],
  changer: ['camRocker', 'rockerSpindle', 'changeBolt', 'bushing179', 'boltSpring178',
    'lockingSlide', 'lockingSwitchSpring', 'changer'],
});

const hiddenContext = name => /^(ctx_|context_|interface_)/i.test(name)
  || /envelope|datum_skeleton/.test(name) || name === '229_steuerpimpel_cap';

export function bindMechanisms({ scenes = {}, root, kit = {}, arm, armBinding, armPadContact }) {
  const cycleInstallation=installCycleHeight({root,scene:scenes.cycle});
  const cueLever=installCueLever({root}); // before the lift installation and every contact snapshot
  const liftInstallation=armBinding?installLiftInterfaces({root,datums:MECHANISM_DATUMS}):null;
  const entries = new Map(), hidden = [], driven = new Set();
  const originals = [];
  root.updateWorldMatrix(true, true);
  const rootInverse = root.matrixWorld.clone().invert();
  for (const [owner, scene] of Object.entries(scenes)) {
    if (!['cycle', 'cue', 'changer'].includes(owner) || !scene) continue;
    scene.traverse(node => {
      if (hiddenContext(node.name)) {
        originals.push({ node, visible: node.visible });
        node.visible = false;
        node.userData.cadContextHidden = true;
        hidden.push(node.name);
      }
      // Original export names are restored by the asset loader. Tests and older
      // GLTFLoader versions may retain the sanitized name instead.
      const key = node.userData.cadOriginalName || node.name;
      // OCCT emits one primitive per face: GLTFLoader therefore represents a
      // named part as a Group of meshes. Move that part node as a rigid body.
      if (!/^(?:\d|cue[.\d]|AU3_|ctx_|context_|interface_)/.test(key)) return;
      node.updateWorldMatrix(true, false);
      entries.set(key, { owner, node, rest: rootInverse.clone().multiply(node.matrixWorld),
        local: node.matrix.clone(), auto: node.matrixAutoUpdate, visible: node.visible });
    });
  }
  const find = name => entries.get(name) || entries.get(THREE.PropertyBinding.sanitizeNodeName(name));
  const temporary = new THREE.Matrix4(), parentInverse = new THREE.Matrix4();
  function apply(name, delta) {
    const e = find(name); if (!e) return;
    e.node.parent.updateWorldMatrix(true, false);
    // Convert root/deck-space delta back into the export's own parent frame.
    parentInverse.copy(e.node.parent.matrixWorld).invert().multiply(root.matrixWorld);
    temporary.copy(parentInverse).multiply(delta).multiply(e.rest);
    e.node.matrixAutoUpdate = false;
    e.node.matrix.copy(temporary);
    e.node.matrix.decompose(e.node.position, e.node.quaternion, e.node.scale);
    e.node.matrixWorldNeedsUpdate = true;
    driven.add(name);
  }
  const applyAll = (names, delta) => names.forEach(name => apply(name, delta));
  const v = key => new THREE.Vector3(...MECHANISM_DATUMS[key]);
  let changerSupportTop = null;
  for (let i = 0; i < 3; i++) find(`AU3_support_${i}`)?.node.traverse(mesh => {
    if (!mesh.isMesh) return;
    const matrix = rootInverse.clone().multiply(mesh.matrixWorld), p = mesh.geometry.attributes.position, point = new THREE.Vector3();
    for (let j = 0; j < p.count; j++) {
      const y = point.fromBufferAttribute(p, j).applyMatrix4(matrix).y;
      changerSupportTop = changerSupportTop === null ? y : Math.max(changerSupportTop, y);
    }
  });
  const cueRear = v('cueRearDirection').normalize();
  // Positive rotation about this axis raises the front of270; its CAD tilt
  // falls between down/up, so the rear hook rises as the handle moves forward.
  const cueTiltAxis = new THREE.Vector3(cueRear.z, 0, -cueRear.x);
  const restFoot = arm?.liftFootY ? arm.liftFootY(0, 0) : 0;
  const coupling=createCouplingContact({root,lever:find('184_main_lever')?.node,follower:find('184_follower_pin')?.node,kit,datums:MECHANISM_DATUMS});
  const liftContact=armBinding?createLiftContact({root,armBinding,datums:MECHANISM_DATUMS}):null;
  const leverPivot=v('leverPivot'),leverSide=new THREE.Vector3(Math.sin(MECHANISM_DATUMS.leverHeading),0,Math.cos(MECHANISM_DATUMS.leverHeading));
  const liftModel=liftContact?{...liftContact,solveState({couplingPose,armAngle,mode,cueHandle,recordHeight,handHeight}){
    const p=couplingPose||coupling.model.pose(0,'start');
    const leverDelta=turn(leverPivot,Y,p.beta).multiply(turn(leverPivot,leverSide,p.tilt));
    return liftContact.solve({armAngle,mode,cueFraction:clamp((cueHandle-HANDLE.down)/(HANDLE.up-HANDLE.down),0,1),leverDelta,recordHeight,handHeight});
  }}:null;
  const changerModel=createChangerContact({root,scene:scenes.changer,datums:MECHANISM_DATUMS});
  const supports=installSupports({root,kit,datums:MECHANISM_DATUMS});
  const debug = {
    lift:liftContact?.status,cycleInstallation:{raise:cycleInstallation.raise,follower:cycleInstallation.followerInstallation},installedSupports:supports.status,changerContact:changerModel?.status,
    classification: 'Shared finite CAD coupling, lift and changer contacts; estimated installation and unsolved force boundaries',
    coupling: coupling?.status || {valid:false,reason:'CAD184 missing'},
    hiddenCycleParts:[...entries].filter(([name,e])=>e.owner==='cycle'&&hiddenContext(name)).map(([name])=>name),
    retainedLegacyKeys:['cam','segment'],
    datums: MECHANISM_DATUMS, hiddenContext: hidden,
    replacedKeys: Object.entries(MECHANISM_REPLACED_KEYS).flatMap(([owner, keys]) => scenes[owner] ? keys : []),
    drivenParts: [], unmapped: [],
    boundaries: [
      '165 guide geometry is generated from an estimated cycle law; runtime184 follows the fixed guide, not a measured factory track',
      '201 remains at fixed height in both modes; its source-supported mode rise and54 rod connection remain unresolved',
      '243 shoe,270 extension,206 length,212 blocking shoe and AU3 internal retainers are explicit reconstruction assumptions',
      '220/270,lower206 supports and finite198/pad share one support solve; forces, compliance and oil damping are not solved',
      '173 actual seat drives177/179 and support release; empty detection remains a load input and207 a threshold-selected branch',
      'Rest contact closes the drawn underside-on-post hypothesis; the factory rest cross-section is unresolved',
    ],
  };
  function update(_dt, s = {}, _ctx = {}) {
    const support = modeHeight(selectorTurn(s.mode || 'single'));
    const modeRaise = support.valid ? support.raise : 0;
    const pose = s.autoPose || automaticPose(s.camOn ? finite(s.theta) : 0, s.inSwing ? 'start' : 'stop');
    const angle=armBinding?cueArmAngle(finite(s.r,REST)):finite(_ctx.armAngle,cueArmAngle(finite(s.r,REST)));
    const couplingPose=s.couplingPose || coupling?.model.pose(s.camOn?finite(s.theta):0,s.inSwing?'start':'stop',s.mode);
    const delta=coupling&&coupling.render(couplingPose,angle,s.mode,!!s.slip);
    const slide=equalizerOffset(s.equalizerPosition??(s.mode==='multi'?1:0))-equalizerOffset(0);
    if(delta){
      applyAll(['184_main_lever','184_stud_a','184_stud_b','184_follower_pin','185_setscrew_red_sealed'],delta.delta);
      applyAll(['183_axle','215_bearing_block','181_leaf_spring_form_unresolved'],delta.swivel);
      const along=new THREE.Vector3(Math.cos(MECHANISM_DATUMS.leverHeading),0,-Math.sin(MECHANISM_DATUMS.leverHeading));
      applyAll(['243_balance_plate'],delta.delta.clone().multiply(translate(along.x*slide,0,along.z*slide)));
    }

    let footDelta;
    const input = clamp((finite(s.cueHandle, s.cueUp ? HANDLE.up : HANDLE.down) - HANDLE.down)/(HANDLE.up-HANDLE.down),0,1);
    const lift=s.cadLift||liftModel?.solveState({couplingPose,armAngle:angle,mode:s.mode,cueHandle:finite(s.cueHandle,HANDLE.down),recordHeight:Y_REC+finite(s.h),handHeight:s.held==='hand'?Y_REC+finite(s.h):null});
    if(lift?.valid){
      footDelta=lift.footDelta;
      applyAll(['cue.206.lift_bolt','cue.198.cap','cue.199.e_clip_upper','cue.202.e_clip_lower'],translate(0,footDelta));
      applyAll(['cue.203.lift_plate_tube','cue.200.adjust_sleeve','cue.236.nut_M4','cue.205.return_spring'],translate(0,lift.modeRaise));
      applyAll(['cue.064.handle','cue.220.lift_cam'],lift.cue.camDelta);
      apply('cue.270.connecting_lever',lift.cue.hookDelta);
      apply('243_balance_plate',lift.balanceDelta);
      armBinding.applyPose(rideRecord(lift.armPose,_ctx));liftInstallation.apply(lift);
      debug.padContact={...lift.contacts.pad,supported:lift.contacts.upper==='198',capTop:lift.capTop};
      debug.liftResult=lift;
    }else if(liftModel){debug.liftResult=lift;}
    else {

    const handleDelta = input * (MECHANISM_DATUMS.cueUpAngle - MECHANISM_DATUMS.cueDownAngle);
    applyAll(['cue.064.handle', 'cue.220.lift_cam'], turn(v('cueShaft'), X, handleDelta));
    const cueDelta = input * (MECHANISM_DATUMS.cueUpTilt - MECHANISM_DATUMS.cueDownTilt);
    apply('cue.270.connecting_lever', turn(v('cuePivot'), cueTiltAxis, cueDelta));
    footDelta = arm?.liftFootY ? arm.liftFootY(finite(s.lift), modeRaise) - restFoot : modeRaise;
    const pad = armPadContact?.({axis:LIFT_INSTALLATION.axis,radius:LIFT_INSTALLATION.capRadius});
    const supportedY = supportedStylusY(finite(s.lift),s.mode || 'single',finite(s.r,REST));
    const padSupported = !!pad?.valid && finite(s.lift)>0 && s.held!=='hand' && !s.hand
      && Number.isFinite(s.h) && Math.abs(Y_REC+s.h-supportedY)<.000002;
    if(padSupported)footDelta=pad.height-.0451;
    else if(pad?.valid)footDelta=Math.min(footDelta,pad.height-.0451-.00005);
    debug.padContact={...pad,supported:padSupported,capTop:.0451+footDelta,classification:'provisional shared finite-pad contact; down gap retained'};
    applyAll(['cue.206.lift_bolt', 'cue.198.cap', 'cue.199.e_clip_upper', 'cue.202.e_clip_lower'], translate(0, footDelta));
    applyAll(['cue.203.lift_plate_tube', 'cue.200.adjust_sleeve', 'cue.236.nut_M4', 'cue.205.return_spring'], translate(0, modeRaise));

    }

    const ch = s.changer || {};
    const changerPose=ch.pose||changerModel?.pose(s.camOn?finite(s.theta):0,{mode:s.mode,loaded:ch.locked!==true});
    changerModel?.render(changerPose,{inserted:ch.inserted??s.mode==='multi'});
    debug.drivenParts = [...driven];
    debug.unmapped = [...entries].filter(([name, e]) => !hiddenContext(name) && !driven.has(name))
      .map(([name]) => name);
    debug.pose = { yaw:couplingPose?.beta??pose.beta, tilt:couplingPose?.tilt??pose.tilt, modeRaise, footDelta, cueFraction: input, rockerAngle:changerPose?.angle, drop:changerPose?.drop,
      sliderTravel: slide, sliderTravelWithinCADSlots: Math.abs(slide) <= 0.0027,
      declared243Travel: EQ243.travel, lockTravel:changerPose?.lockPose?.travel, changerSeatValid: !!changerModel };
  }
  function dispose() {
    changerModel?.dispose();coupling?.dispose();supports.dispose();liftInstallation?.dispose();
    for (const { node, local, auto, visible } of entries.values()) {
      node.matrix.copy(local); node.matrix.decompose(node.position, node.quaternion, node.scale);
      node.matrixAutoUpdate = auto; node.matrixWorldNeedsUpdate = true; node.visible = visible;
    }
    for (const { node, visible } of originals) node.visible = visible;
    cycleInstallation.dispose();cueLever.dispose();
  }
  return { update, dispose, changerSupportTop:changerModel?.supportTop??changerSupportTop, changerModel, liftModel, couplingModel:coupling?.model, meshes:[...(coupling?.meshes||[]),...supports.meshes,...(changerModel?.meshes||[]),...(liftInstallation?.meshes||[])], setEnabled:value=>{coupling?.setEnabled(value);supports.setEnabled(value);}, debug, replacedKeys:debug.replacedKeys };
}

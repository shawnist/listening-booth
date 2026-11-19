// Drive: the mains switch 129 with its slide 167, and the box beside it, under the dish floor; the
// motor's lead. Owned by the drive builder (see OWNERS.md).
import * as THREE from 'three';
import { RoundedBoxGeometry, V3 } from '../shared/geometry.js';
import { MAINS, MOTOR as M } from './place.js';
import {MAINS_LINK as G,mainsFrame,switchFromArm} from './mains-contact.js';

const mm = (v) => v / 1000;

export function buildMains(kit, root) {
  const { add, part, mat, mats } = kit;
  const pw = part('powerSwitch', root);
  const black = mat(0x18181a, 0.15, 0.6), grey = mat(0x6d6e6c, 0.2, 0.55);
  for (const [i,b] of MAINS.boxes.entries()) {
    const w = mm(b.x[1] - b.x[0]), d = mm(b.z[1] - b.z[0]), h = mm(b.h);
    const cx=mm(b.x[0]+b.x[1])/2,cz=mm(b.z[0]+b.z[1])/2;
    if(i){add(pw,new RoundedBoxGeometry(w-.0004,h,d,2,.0012),b.c==='grey'?grey:black,cx,MAINS.top-h/2,cz);continue;}
    // Hollow129 housing; the old solid box buried the switch mechanism.
    add(pw,new THREE.BoxGeometry(w,.001,d),black,cx,MAINS.top-.0005,cz);
    // Open working-plane band is a schematic inspection cutaway, not a
    // factory housing aperture. It leaves the rail and snap contacts visible.
    const wallH=MAINS.top-(G.y+.004);
    for(const z of [mm(b.z[0]),mm(b.z[1])])add(pw,new THREE.BoxGeometry(w,wallH,.001),black,cx,MAINS.top-wallH/2,z);
    for(const x of [mm(b.x[0]),mm(b.x[1])])add(pw,new THREE.BoxGeometry(.001,wallH,d-.002),black,x,MAINS.top-wallH/2,cz);
  }
  const screw = new THREE.CylinderGeometry(0.0026, 0.0026, 0.0012, 16);
  for (const [x, z] of MAINS.screws) add(pw, screw, mats.steel(), mm(x), MAINS.top - mm(20) - 0.0006, mm(z));
  // Plain1229 Fig31: a rigid cranked metal rail, not a nylon block.
  // Exact plan position/guide reconstruction is estimated; same geometry drives129.
  const rail=part('mainsRail167',root,{name:'Switch rail',no:'167'});kit.name('mainsRail167',rail);
  add(rail,new THREE.BoxGeometry(.040,.0007,G.width),mats.steel(),.020,-.002,0);
  const crank=add(rail,new THREE.BoxGeometry(Math.hypot(.010,.002),.0007,G.width),mats.steel(),.045,-.001,0);crank.rotation.z=Math.atan2(.002,.010);
  add(rail,new THREE.BoxGeometry(G.length-.050,.0007,G.width),mats.steel(),(G.length+.050)/2,0,0);
  add(rail,new THREE.CylinderGeometry(.0012,.0012,.003,16),mats.steel(),0,.001,0);
  add(rail,new THREE.BoxGeometry(.0007,.003,G.width),mats.steel(),G.length,.0015,0);
  const roller=part('mainsGuide168',root,{name:'Switch rail roller',no:'168'});
  kit.name('mainsGuide168',add(roller,new THREE.CylinderGeometry(G.roller.r,G.roller.r,.002,20),mats.nylon(),G.roller.x,G.y,G.roller.z));
  const carrier=part('mainsCarrier137',pw,{name:'Switch contact carrier',no:'137'});kit.name('mainsCarrier137',carrier);
  const frame=mainsFrame(),frameAngle=Math.atan2(frame.U[1],frame.U[0]);
  carrier.position.set(frame.pivot.x,G.y,frame.pivot.z);
  add(carrier,new THREE.BoxGeometry(G.padOrbit,.001,.003),mats.nylon(),G.padOrbit/2,0,0);
  const contacts=part('mainsContacts141',pw,{name:'Mains contact springs',no:'141'});
  const closedPose=switchFromArm(0),pads=[];
  // Two isolated contact pairs. Spherical buttons provide actual tangency at the
  // closed stop; y separation is schematic, not a claimed switch measurement.
  for(const y of [-.0015,.0015]){
    const moving=kit.name('mainsMovingPad'+y,add(carrier,new THREE.SphereGeometry(G.padR,16,8),mats.brass(),G.padOrbit,y,0));
    const fixed=kit.name('mainsFixedPad'+y,add(contacts,new THREE.SphereGeometry(G.padR,16,8),mats.brass(),closedPose.fixed.x,G.y+y,closedPose.fixed.z));
    add(carrier,new THREE.BoxGeometry(G.padOrbit,.0003,.0015),mats.brass(),G.padOrbit/2,y,0);
    const leaf=add(contacts,new THREE.BoxGeometry(.005,.0003,.0015),mats.brass(),closedPose.fixed.x+.0025*frame.V[0],G.y+y,closedPose.fixed.z+.0025*frame.V[1]);leaf.rotation.y=-Math.atan2(frame.V[1],frame.V[0]);
    add(contacts,new THREE.CylinderGeometry(.0007,.0007,.007,12),mats.nylon(),closedPose.fixed.x+.005*frame.V[0],G.y+.004,closedPose.fixed.z+.005*frame.V[1]);
    pads.push({moving,fixed});
  }
  const springGroup=part('mainsSpring143',pw,{name:'Switch tension spring',no:'143'});
  class Coil extends THREE.Curve{getPoint(t,target=new THREE.Vector3()){const a=t*Math.PI*16;return target.set(.00055*Math.cos(a),t,.00055*Math.sin(a));}}
  const spring=add(springGroup,new THREE.TubeGeometry(new Coil(),128,.00015,6,false),mats.steel());
  const up=new THREE.Vector3(0,1,0),v=new THREE.Vector3();
  let previous=null;

  // the motor's lead (yellow sleeve) to the switch box. The mains cable from the box out through the base's back
  // wall is the outside's (parts/outside CABLES: its clip under the dish floor, the hole and grommet in the back
  // wall); the drive drew a second copy of it here that ended inside the wall, so it is left out.
  const wires = part('leads', root, { name: 'Lead: motor to the mains switch', no: '—' });
  const la = Math.atan2(-0.0905, -0.060), sx = M.x + Math.cos(la) * (M.r + 0.006), sz = M.z + Math.sin(la) * (M.r + 0.006);
  const motorLead = [V3(sx, M.top - 0.012, sz), V3(sx - 0.008, -0.03, sz - 0.014), V3(-0.080, -0.028, 0.026), V3(-0.098, -0.022, 0.011), V3(-0.104, -0.017, 0.006)];
  add(wires, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(motorLead), 32, 0.0018, 8, false), mat(0xd9c46a, 0, 0.45));

  function update(s) {
    // The engine owns persistent snap state; standalone model retains it locally.
    // Missing upstream pose rests safely at the released188 datum, never switchOn.
    const yaw=s.switchArmPose?.yaw??s.switchArmYaw??.08087;
    const p=s.mainsSwitchPose??switchFromArm(yaw,previous);previous=p;
    if(!p.valid)return p;
    rail.position.set(p.pin.x,G.y,p.pin.z);rail.rotation.y=-p.railAngle;
    carrier.rotation.y=-(frameAngle-p.carrierAngle);
    spring.position.set(p.springPost.x,G.y,p.springPost.z);
    v.set(p.springAnchor.x-p.springPost.x,0,p.springAnchor.z-p.springPost.z);
    spring.scale.y=v.length();spring.quaternion.setFromUnitVectors(up,v.normalize());
    return p;
  }
  update({});
  return {update,rail,carrier,pads,spring};
}

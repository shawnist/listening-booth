// Plain1229 p8 Fig14: cam258 displaces lever267; spring265 pulls the
// tonearm segment. At zero its force line passes through the arm fulcrum.
// Fixed reconstructed component dimensions, not measured factory calibration.
// Spring stiffness and force at the stylus remain unknown; torquePerNewton is
// a geometric moment arm, not a claimed anti-skating force.
import { PIVOT } from './layout.js';
const TAU=2*Math.PI;
// The anti-skating dial (moved from parts/tonearm/textures.js, unchanged). Angles are clockwise from
// the rear: both scales start at a shared 0 at about eleven o'clock; red runs clockwise to 3, white
// anticlockwise (T2, V-bX 4:10). Degrees: 0, and per gram on each scale (photo-measured).
export const SKATE = { zero: -40, red: 160 / 3, white: -170 / 3 };
export const skateAngle = (v, scale) => SKATE.zero + v * (scale === 'white' ? SKATE.white : SKATE.red);
// Cam 258 is fixed to knob 79's shaft (M-DE p.8): the cam turns with the knob (radians).
export const skateCamTurn = (v, scale) => (skateAngle(v, scale) + 90) * Math.PI / 180;
// The spring's arm-side anchor: the ear on segment 201 that spring 265 hooks to (M-DE p.8 Fig.14),
// `turn` radians off the arm's own direction (pivot to stylus), `pinR` from the pivot, the hook at
// height `y`. Traced from schematic Fig.14(b), +-5 mm (tools/dual-trace-seg201.mjs); agreed with
// the cycle owner (contracts/arm--cycle.md Y4). The hook height is an estimate: just below the
// support shaft's lower end, at the lever's pin. 201 does not rise in multi (Y1/Y5).
export const SKATE_ANCHOR=Object.freeze({turn:-53*Math.PI/180,pinR:.0312,y:-.0230});
export const SKATING=Object.freeze({
  cam:{x:.2075,z:-.0535,y:-.0075}, pivot:{x:.2035,z:-.0655},
  length:.04539317187757751,zeroAngle:-2.2217866023354174,
  follower:{x:-.0016439801434335987,z:-.004822070011416866,r:.0007},
  valley:-1.4198822551943744,
});
// Firsthand measurements of part225176 (also used on1229Q), first half only:
// https://www.vinylengine.com/turntable_forum/viewtopic.php?start=12&t=82623
// Zero radius9.65mm, total excursion.080in. The author flags errors in the
// second half: we do NOT adopt those readings. That half is a mirrored estimate,
// not a validated second-scale calibration. Installed phase is reconstructed.
const firstHalf=[0,0,.002,.0085,.0135,.0195,.0225,.0285,.033,.038,.041,.045,.05,.055,.06,.063,.0675,.074,.08];
export const SKATING_PROFILE=Object.freeze(Array.from({length:144},(_,i)=>{
  const a=SKATING.valley+i*TAU/144,phase=Math.min(i,144-i)*2.5;
  const index=(180-phase)/10,j=Math.min(17,Math.floor(index)),f=index-j;
  const reading=firstHalf[j]+f*(firstHalf[j+1]-firstHalf[j]);
  const r=.00965+(.08-reading)*.0254;
  return Object.freeze([Math.cos(a)*r,Math.sin(a)*r]);
}));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function distanceToPolygon(x,z,vertices){
  let best=Infinity,inside=false;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
    const [ax,az]=vertices[j],[bx,bz]=vertices[i],dx=bx-ax,dz=bz-az;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    best=Math.min(best,Math.hypot(x-ax-t*dx,z-az-t*dz));
    if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
  }
  return inside?-best:best;
}
export function skatingPose(camTurn,geometry=SKATING,profile=SKATING_PROFILE){
  const g=geometry,f=g.follower,c=Math.cos(camTurn),s=Math.sin(camTurn);
  const point=a=>({x:g.pivot.x+Math.cos(a)*f.x-Math.sin(a)*f.z,
    z:g.pivot.z+Math.sin(a)*f.x+Math.cos(a)*f.z});
  const gap=a=>{const p=point(a),x=p.x-g.cam.x,z=p.z-g.cam.z;
    return distanceToPolygon(c*x-s*z,s*x+c*z,profile)-f.r;};
  const roots=[];let a=g.zeroAngle-.85,ga=gap(a);
  for(let i=1;i<=120;i++){
    const b=g.zeroAngle-.85+1.7*i/120,gb=gap(b);
    if(ga*gb<=0){let lo=a,hi=b,gl=ga;for(let j=0;j<36;j++){
      const mid=(lo+hi)/2,gm=gap(mid);if(gl*gm<=0)hi=mid;else{lo=mid;gl=gm;}}
      roots.push((lo+hi)/2);}
    a=b;ga=gb;
  }
  roots.sort((a,b)=>Math.abs(wrap(a-g.zeroAngle))-Math.abs(wrap(b-g.zeroAngle)));
  const angle=roots[0]??g.zeroAngle,valid=roots.length>0;
  return {angle,valid,gap:gap(angle),follower:point(angle),
    springPin:{x:g.pivot.x+g.length*Math.cos(angle),z:g.pivot.z+g.length*Math.sin(angle)}};
}
export function skatingMoment(pose,armAngle,radius=.0114){
  const rx=radius*Math.cos(armAngle),rz=radius*Math.sin(armAngle);
  const lug={x:PIVOT.x+rx,z:PIVOT.z+rz},dx=pose.springPin.x-lug.x,dz=pose.springPin.z-lug.z,length=Math.hypot(dx,dz);
  return {lug,length,torquePerNewton:length?(rx*dz-rz*dx)/length:0};
}

// Explicit upstream boundary:188 is still commanded by start/latch state.
// This shares its existing finite finger/flange geometry with the renderer;
// it does NOT turn the unresolved195/201/273 chain into a contact solution.
import {GEAR} from '../../layout.js';
import {CAM_R,SHAFT_192,SWITCH_ARM} from './place.js';
import {flangeUnder} from '../../cam-flange.js';
export function prescribedSwitchArmYaw({switchOn=false,theta=0}={}){
 const f=SWITCH_ARM.finger,dx=f.x-SHAFT_192.x,dz=f.z-SHAFT_192.z;
 const a=Math.atan2(f.z-GEAR.camZ,f.x-GEAR.camX),half=.0021/CAM_R.flange[1];
 const radius=(switchOn?CAM_R.flange[1]:flangeUnder(a+theta*Math.PI/180,half))+.00035+.00075;
 const rAt=q=>Math.hypot(SHAFT_192.x+dx*Math.cos(q)-dz*Math.sin(q)-GEAR.camX,SHAFT_192.z+dx*Math.sin(q)+dz*Math.cos(q)-GEAR.camZ);
 let lo=-.2,hi=.2;const increasing=rAt(.001)>rAt(0);
 for(let i=0;i<30;i++){const q=(lo+hi)/2;if((rAt(q)<radius)===increasing)lo=q;else hi=q;}
 return(lo+hi)/2;
}

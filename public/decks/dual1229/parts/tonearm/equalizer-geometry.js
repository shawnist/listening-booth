// Plain1229 Fig29/31; MAARC rebuild p18:243 is retained by two slots on184.
// The broad plastic head has a lower surface and raised outer ledge. The 1229
// repair account at VinylEngine p=708878 explicitly identifies lower/single and
// upper/multi support. Dimensions and installed slide travel are estimates.
// Upstream203-tab/210 contact remains an explicit assembly boundary.
export const EQ243=Object.freeze({angle:.08,travel:.0045,baseY:.00285,t:.00065,
 x0:.0538,x1:.08185,half:.0034,stepR:[.0805,.08185],stepA:[-.26,.26],stepHeight:.00545,
 pins:[.060,.074],pinR:.0007,slotR:.0009,
 // Vertical play under the retaining pin heads: the cue hook lifts243 off184 (cue-chain.js).
 // Estimate, sized for the hook's full lift (1.46 mm) plus 0.14 mm; not measured.
 liftPlay:.0016});
export const equalizerBoundary=mode=>mode==='multi'?1:(typeof mode==='number'?Math.max(0,Math.min(1,mode)):0);
export const equalizerOffset=position=>EQ243.travel*(1-Math.max(0,Math.min(1,position)));
export const equalizerBaseOutline=(()=>{
 const E=EQ243,pts=[[E.x0,-E.half],[.071,-E.half],[.077*Math.cos(E.stepA[0]),.077*Math.sin(E.stepA[0])]];
 for(let i=0;i<=96;i++){const a=E.stepA[0]+(E.stepA[1]-E.stepA[0])*i/96;pts.push([E.x1*Math.cos(a),E.x1*Math.sin(a)]);}
 pts.push([.077*Math.cos(E.stepA[1]),.077*Math.sin(E.stepA[1])],[.071,E.half],[E.x0,E.half]);return pts;
})();
function local(x,z,position){const c=Math.cos(EQ243.angle),s=Math.sin(EQ243.angle);return[x*c+z*s-equalizerOffset(position),-x*s+z*c];}
export function equalizerContains(x,z,position,level='high'){
 const[a,b]=local(x,z,position),E=EQ243;
 if(level==='low'){
  let inside=false;const p=equalizerBaseOutline;
  for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>b)!==(p[j][1]>b)&&a<(p[j][0]-p[i][0])*(b-p[i][1])/(p[j][1]-p[i][1])+p[i][0])inside=!inside;
  if(!inside)return false;
  return !E.pins.some(x=>Math.hypot(a-Math.max(x-E.travel,Math.min(x,a)),b)<=E.slotR);
 }
 const r=Math.hypot(a,b),theta=Math.atan2(b,a);
 return r>=E.stepR[0]&&r<=E.stepR[1]&&theta>=E.stepA[0]&&theta<=E.stepA[1];
}

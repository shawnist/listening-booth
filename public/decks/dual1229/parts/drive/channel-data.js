// Switching segment102: actual open channel around the fitted follower path.
// Fig.2 and rebuild rb009 establish a track. Through/blind depth is unmeasured;
// this is a schematic through-channel, not a measured moulding or cam-force model.
import { SEG } from './place.js';
import { SEGMENT_PROFILE, profileHeight, profileRange } from './component-profile.js';

const cache = new WeakMap();
export function channelData(profile = SEGMENT_PROFILE) {
  if(cache.has(profile))return cache.get(profile);
  const SLOT_RANGE=profileRange(profile),slotY=a=>profileHeight(a,profile);

const [start, end] = SLOT_RANGE, mid = (SEG.y[0] + SEG.y[1]) / 2;
const incidence = SEG.slotIncidence.map(a => a * Math.PI / 180);
const [s0,s1]=incidence.map(Math.sin),[c0,c1]=incidence.map(Math.cos);
// The channel is the vertical envelope of horizontal cylinders following slotY.
// A finite band depth matters: an oblique pin crosses different angles at its
// inner/outer faces. Use the reconstructed incidence interval, not a radial point.
const centreStep = 0.0004;
const centres = Array.from({length: Math.ceil((end-start)/centreStep)+1}, (_, i) => {
  const a = Math.min(end, start+i*centreStep); return {a, y:slotY(a),cos:Math.cos(a),sin:Math.sin(a)};
});
function bounds(r, phi) {
  let low = Infinity, high = -Infinity;
  const radius = SEG.slotW / 2;
  const cp=Math.cos(phi),sp=Math.sin(phi);
  const first=Math.max(0,Math.floor((phi-.45-start)/centreStep));
  const last=Math.min(centres.length-1,Math.ceil((phi+.45-start)/centreStep));
  for (let i=first;i<=last;i++) {
    const c=centres[i],u=r*(cp*c.cos+sp*c.sin)-SEG.r,v=r*(sp*c.cos-cp*c.sin);
    const d0=u*s0-v*c0,d1=u*s1-v*c1;
    // Signed distances cross zero iff an admissible pin axis crosses this point
    // (the reconstructed incidence interval is shorter than half a turn).
    const distance=d0*d1<=0?0:Math.min(Math.abs(d0),Math.abs(d1));
    if(distance>radius) continue;
    const dy=Math.sqrt(radius*radius-distance*distance);
    low=Math.min(low,c.y-dy); high=Math.max(high,c.y+dy);
  }
  // At the inner web there may be no pin envelope at this azimuth.
  return {low,high};
}

// Watertight upper/lower material strips in cylindrical coordinates. Keeping the
// radial grid preserves real inner/outer walls and trims the web where the pin
// enters it; a solid web must not fill the newly opened channel from behind.
function strip(radii, lower) {
  const n=512, vertices=[], indices=[], contact=[], rows=radii.length;
  for(let j=0;j<=n;j++) {
    const phi=start+(end-start)*j/n;
    for(const r of radii) {
      const b=bounds(r,phi);
      const bottom=lower?SEG.y[0]:Math.max(b.high, r<SEG.r-SEG.slotDepth-1e-9?SEG.y[1]-.0015:-Infinity);
      const top=lower?b.low:SEG.y[1];
      if(!Number.isFinite(bottom)||!Number.isFinite(top)||top<=bottom) throw new RangeError('Follower channel leaves no segment wall');
      for(const y of [bottom,top]) vertices.push(r*Math.cos(phi),y-mid,r*Math.sin(phi));
    }
  }
  const quad=(a,b,c,d)=>indices.push(a,b,c,a,c,d);
  const at=(j,i,h)=>2*(j*rows+i)+h;
  for(let j=0;j<n;j++)for(let i=0;i<rows-1;i++) {
    quad(at(j,i,0),at(j+1,i,0),at(j+1,i+1,0),at(j,i+1,0));
    quad(at(j,i,1),at(j,i+1,1),at(j+1,i+1,1),at(j+1,i,1));
  }
  for(let j=0;j<n;j++)for(let i=0;i<rows-1;i++) {
    const h=lower?1:0;
    contact.push([at(j,i,h),at(j,i+1,h),at(j+1,i+1,h)], [at(j,i,h),at(j+1,i+1,h),at(j+1,i,h)]);
  }
  for(let j=0;j<n;j++)for(const i of [0,rows-1]) quad(at(j,i,0),at(j,i,1),at(j+1,i,1),at(j+1,i,0));
  for(const j of [0,n])for(let i=0;i<rows-1;i++) quad(at(j,i,0),at(j,i+1,0),at(j,i+1,1),at(j,i,1));
  // Quantize once, so solver and renderer use identical material vertices.
  const positions=new Float32Array(vertices);
  const triangles=contact.map(t=>t.map(i=>[positions[3*i], positions[3*i+1]+mid, positions[3*i+2]]));
  for(const t of triangles)t.box=[Math.min(...t.map(p=>p[0])),Math.max(...t.map(p=>p[0])),Math.min(...t.map(p=>p[2])),Math.max(...t.map(p=>p[2]))];
  return {positions,indices,triangles};
}

  const inner=SEG.r-SEG.slotDepth;
  const band=Array.from({length:5},(_,i)=>inner+SEG.slotDepth*i/4);
  const data={speedChannelLower:strip(band,true),speedChannelUpper:strip([SEG.hubR,(SEG.hubR+inner)/2,...band],false)};
  cache.set(profile,data);return data;
}

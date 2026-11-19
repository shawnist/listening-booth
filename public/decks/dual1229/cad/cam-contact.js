// Installed reconstruction of165's underside guide. The two fixed paths are
// generated ONCE from an explicitly estimated cycle law and the exported184
// follower. At runtime184 is solved against those surfaces, not moved to229.
// Branch selection remains207's state input; this is kinematics, not a force solve.
import * as T from 'three';
import { GEAR } from '../layout.js';

const V=(...v)=>new T.Vector3(...v),TAU=2*Math.PI,D=Math.PI/180;
const Y=V(0,1,0),wrap=a=>((a%TAU)+TAU)%TAU;
const turn=(p,a,t)=>new T.Matrix4().makeTranslation(...p.toArray())
  .multiply(new T.Matrix4().makeRotationAxis(a,t))
  .multiply(new T.Matrix4().makeTranslation(...p.clone().negate().toArray()));

export function createCamContact({root,kit={},pivot,side,follower,program,radius=.001}) {
  if(!follower)return null;
  const centre=V(GEAR.camX,0,GEAR.camZ),samples=1440;
  const paths={};
  const envelopes={},clearRadius=radius+.00012;
  for(const branch of ['start','stop']){
    const path=[];
    for(let i=0;i<samples;i++){
      const theta=i*360/samples,p=program(theta,branch);
      const transform=turn(pivot,Y,p.beta).multiply(turn(pivot,side,p.tilt));
      const tip=follower.clone().applyMatrix4(transform).sub(centre).applyAxisAngle(Y,-theta*D);
      const normal=Y.clone().transformDirection(transform).applyAxisAngle(Y,-theta*D);
      path.push({a:wrap(Math.atan2(tip.z,tip.x)),r:Math.hypot(tip.x,tip.z),tip,normal});
    }
    path.sort((a,b)=>a.a-b.a);paths[branch]=path;
    // Sweep the entire flat top of the tilted follower through each material
    // meridian. Its highest point on that ray cuts the underside of the roof.
    // Sweeping only the centre makes the pin climb early and yaws the lever
    // while the stylus is lowering at the size stop.
    envelopes[branch]=Array.from({length:samples},(_,i)=>{
      const a=i*TAU/samples,dx=Math.cos(a),dz=Math.sin(a);
      let low=Infinity,high=-Infinity,y=-Infinity;
      for(const q of path){
        const across=q.tip.x*dz-q.tip.z*dx,along=q.tip.x*dx+q.tip.z*dz;
        if(along<0||Math.abs(across)>clearRadius)continue;
        const reach=Math.sqrt(clearRadius*clearRadius-across*across);
        low=Math.min(low,along-reach);high=Math.max(high,along+reach);
        // Intersection of the horizontal ray with the tilted circular disc.
        // u is distance along the ray from its nearest plan point to tip.
        const n=q.normal, slope=-(n.x*dx+n.z*dz)/n.y;
        const offset=-(n.x*(along*dx-q.tip.x)+n.z*(along*dz-q.tip.z))/n.y;
        const A=1+slope*slope,B=slope*offset,C=across*across+offset*offset-radius*radius;
        const disc=B*B-A*C;
        if(disc<0)continue;
        const extreme=(-B+Math.sign(slope)*Math.sqrt(disc))/A;
        y=Math.max(y,q.tip.y+offset+slope*extreme);
      }
      return {low,high,y};
    });
  }
  function surface(branch,angle){
    const p=paths[branch]||paths.start,a=wrap(angle);let lo=0,hi=p.length;
    while(lo<hi){const m=(lo+hi)>>1;if(p[m].a<a)lo=m+1;else hi=m;}
    const l=p[(lo+p.length-1)%p.length],r=p[lo%p.length];
    const span=wrap(r.a-l.a),f=span?wrap(a-l.a)/span:0;
    const ef=a/TAU*samples,ei=Math.floor(ef),u=ef-ei,e0=envelopes[branch][ei%samples],e1=envelopes[branch][(ei+1)%samples];
    return {r:l.r+(r.r-l.r)*f,y:e0.y+(e1.y-e0.y)*u,low:e0.low+(e1.low-e0.low)*u,high:e0.high+(e1.high-e0.high)*u};
  }
  const half=radius+.00012,webBottom=-.0144,webTop=-.0132,depth=.0015;
  // Fixed union of both finite channels. At overlap use the higher roof and
  // remove interior walls;207 remains the explicit unresolved branch input.
  function roof(angle,r){let y=-Infinity;for(const branch of['start','stop']){const q=surface(branch,angle);if(r>=q.low-1e-10&&r<=q.high+1e-10)y=Math.max(y,q.y);}return y;}
  const rim=Array.from({length:64},(_,i)=>follower.clone().add(V(radius*Math.cos(i*TAU/64),0,radius*Math.sin(i*TAU/64))));
  function residual(beta,tilt,theta,branch){
    const matrix=turn(pivot,Y,beta).multiply(turn(pivot,side,tilt));
    const q=follower.clone().applyMatrix4(matrix).sub(centre).applyAxisAngle(Y,-theta*D),s=surface(branch,Math.atan2(q.z,q.x));
    let vertical=-Infinity;
    for(const v of rim){const p=v.clone().applyMatrix4(matrix).sub(centre).applyAxisAngle(Y,-theta*D);
      vertical=Math.max(vertical,p.y-roof(Math.atan2(p.z,p.x),Math.hypot(p.x,p.z)));}
    return [Math.hypot(q.x,q.z)-s.r,vertical];
  }
  function pose(theta,branch='start'){
    const seed=program(theta,branch);let {beta,tilt}=seed;
    for(let i=0;i<12;i++){
      const f=residual(beta,tilt,theta,branch);if(Math.hypot(...f)<1e-10)break;
      const e=1e-6,b=residual(beta+e,tilt,theta,branch),t=residual(beta,tilt+e,theta,branch);
      const a=(b[0]-f[0])/e,c=(b[1]-f[1])/e,d=(t[0]-f[0])/e,h=(t[1]-f[1])/e,det=a*h-d*c;
      if(Math.abs(det)<1e-12)break;
      beta-=(h*f[0]-d*f[1])/det;tilt-=(-c*f[0]+a*f[1])/det;
    }
    const error=residual(beta,tilt,theta,branch),gap=Math.hypot(...error);
    return {...seed,beta,tilt,valid:gap<2e-6,follower:follower.clone().applyMatrix4(turn(pivot,Y,beta).multiply(turn(pivot,side,tilt))).toArray(),camContact:{gap,radialGap:error[0],verticalGap:error[1],branch}};
  }
  const group=new T.Group();group.name='cad165InstalledGuide';root.add(group);
  const material=new T.MeshPhysicalMaterial({color:0xad781c,roughness:.35,metalness:0,transparent:true,opacity:.87,ior:1.49,specularIntensity:.72,clearcoat:.16,clearcoatRoughness:.3,depthWrite:false,transmission:.44,thickness:.0012,attenuationColor:new T.Color(0xf2be35),attenuationDistance:.004,side:T.DoubleSide});
  const meshes=[];
  // A single fixed union, split where channel boundaries/order cross. Roofs
  // extend directly into the installed cam web; no floating support posts.
  const vertices=[];
  const pointAt=(a,r,y)=>[Math.cos(a)*r,y,Math.sin(a)*r];
  const quad=(a,b,c,d)=>vertices.push(...a,...b,...c,...c,...b,...d);
  const profiles=a=>['start','stop'].map(branch=>surface(branch,a));
  const bounds=q=>[q[0].low,q[0].high,q[1].low,q[1].high];
  for(let i=0;i<samples;i++){
    const a=i*TAU/samples,b=(i+1)*TAU/samples,qa=profiles(a),qb=profiles(b),ba=bounds(qa),bb=bounds(qb),cuts=[0,1];
    for(let j=0;j<4;j++)for(let k=j+1;k<4;k++){const d0=ba[j]-ba[k],d1=bb[j]-bb[k];if(d0*d1<0)cuts.push(d0/(d0-d1));}
    const dy0=qa[0].y-qa[1].y,dy1=qb[0].y-qb[1].y;if(dy0*dy1<0)cuts.push(dy0/(dy0-dy1));
    cuts.sort((x,y)=>x-y);
    for(let ci=1;ci<cuts.length;ci++){
      const t0=cuts[ci-1],t1=cuts[ci];if(t1-t0<1e-10)continue;
      const tm=(t0+t1)/2,A=a+(b-a)*t0,B=a+(b-a)*t1;
      const r=(j,t)=>ba[j]+(bb[j]-ba[j])*t,y=(j,t)=>qa[j].y+(qb[j].y-qa[j].y)*t;
      const order=[0,1,2,3].sort((j,k)=>r(j,tm)-r(k,tm));
      const cells=[];
      for(let j=1;j<4;j++){
        const l=order[j-1],h=order[j],mid=(r(l,tm)+r(h,tm))/2;
        const cover=[0,1].filter(k=>mid>=r(k*2,tm)-1e-12&&mid<=r(k*2+1,tm)+1e-12);
        if(!cover.length||r(h,tm)-r(l,tm)<1e-10){cells.push(null);continue;}
        const owner=cover.reduce((best,k)=>y(k,tm)>y(best,tm)?k:best,cover[0]);cells.push({l,h,owner});
        quad(pointAt(A,r(l,t0),y(owner,t0)),pointAt(B,r(l,t1),y(owner,t1)),pointAt(A,r(h,t0),y(owner,t0)),pointAt(B,r(h,t1),y(owner,t1)));
        // The retained cam web already supplies the top face of this moulding.
      }
      for(let j=0;j<cells.length;j++){const c=cells[j];if(!c)continue;
        for(const[edge,neighbor]of[[c.l,cells[j-1]],[c.h,cells[j+1]]]){
          if(!neighbor)quad(pointAt(A,r(edge,t0),y(c.owner,t0)-depth),pointAt(A,r(edge,t0),webTop),pointAt(B,r(edge,t1),y(c.owner,t1)-depth),pointAt(B,r(edge,t1),webTop));
          else if(neighbor.owner!==c.owner&&y(c.owner,tm)>y(neighbor.owner,tm)+1e-12)quad(pointAt(A,r(edge,t0),y(neighbor.owner,t0)),pointAt(A,r(edge,t0),y(c.owner,t0)),pointAt(B,r(edge,t1),y(neighbor.owner,t1)),pointAt(B,r(edge,t1),y(c.owner,t1)));
        }
      }
    }
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
  const mesh=new T.Mesh(geometry,material);mesh.name='cad165_branching_guide';mesh.userData.part='cam';mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);meshes.push(mesh);
  const wheel=kit.parts?.cam;
  if(wheel)wheel.meshes.push(mesh);
  group.position.copy(centre);
  const status={classification:'fixed estimated open branching channel union;207 branch/radial selection remains a state input',
    axis:centre.toArray(),samplesPerBranch:samples,followerRadius:radius,webBottom,webTop,openJunctions:true,maxGap:0};
  return {pose,surface,roof,paths,meshes,status,
    render(theta,p){group.rotation.y=theta*D;status.contact=p?.camContact||null;status.maxGap=Math.max(status.maxGap,p?.camContact?.gap||0);},
    setEnabled(on){group.visible=on;},dispose(){if(wheel){const i=wheel.meshes.indexOf(mesh);if(i>=0)wheel.meshes.splice(i,1);}
      group.removeFromParent();for(const m of meshes)m.geometry.dispose();material.dispose();}};
}

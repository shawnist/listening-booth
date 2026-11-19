import * as THREE from 'three';
import { SHAFT_192, SWITCH_ARM } from '../parts/automatic/place.js';
export function bindDriveTransmission({ root, kit, lever, leverAnchorInRoot }) {
  const group=new THREE.Group();group.name='installed-drive-transmission';root.add(group);
  const meshes=[], steel=new THREE.MeshStandardMaterial({color:0xa6adb1,metalness:.8,roughness:.33});
  const add=(name,geo,parent=group)=>{const m=new THREE.Mesh(geo,steel);m.name=name;
    m.userData={part:`installed:${name}`,cad:'drive',basis:'estimated installed linkage, not identified factory geometry; forces unvalidated'};
    parent.add(m);meshes.push(m);return m;};
  // S1 is a flexible spring/wire assembly. Both ends are attached to moving
  // rigid parts; guide routing and free length remain explicit estimates.
  const arm188=kit.parts.switchArm?.groups.flatMap(g=>g.children).find(g=>g.isGroup&&Math.abs(g.position.x-SHAFT_192.x)<1e-6&&Math.abs(g.position.z-SHAFT_192.z)<1e-6);
  const springLocal=new THREE.Vector3(SWITCH_ARM.spring.x-SHAFT_192.x,0,SWITCH_ARM.spring.z-SHAFT_192.z);
  root.updateWorldMatrix(true,true);
  const leverAnchor=lever.worldToLocal(root.localToWorld(new THREE.Vector3(...leverAnchorInRoot)));
  const wire=add('S1-routed-wire',new THREE.BufferGeometry());
  const coil=add('S1-tension-spring',new THREE.BufferGeometry());
  const hiddenMeshes=(kit.parts.switchArm?.meshes||[]).filter(m=>{
    if(m.userData.linkageFidelity)return true;
    m.geometry.computeBoundingBox();return m.geometry.boundingBox.max.y-m.geometry.boundingBox.min.y>.9;
  });
  const replace=(mesh,geometry)=>{mesh.geometry.dispose();mesh.geometry=geometry;};
  const debug={classification:'retained schematic S1 spring/wire route with endpoints on188 and CAD134; no force solve'};
  let previous=null;
  const update=(s,p)=>{
    if(!arm188)return;
    root.updateWorldMatrix(true,true);
    const a=root.worldToLocal(arm188.localToWorld(springLocal.clone()));
    const b=root.worldToLocal(lever.localToWorld(leverAnchor.clone()));
    if(previous && a.distanceToSquared(previous[0])+b.distanceToSquared(previous[1])<1e-18)return;
    previous=[a.clone(),b.clone()];
    const route=SWITCH_ARM.route.map(q=>new THREE.Vector3(q.x,SWITCH_ARM.wireY,q.z));
    route[0].y=a.y;
    const dir=route[0].clone().sub(a).normalize(), end=a.clone().addScaledVector(dir,.014);
    const normal=new THREE.Vector3(0,1,0).cross(dir).normalize(), binormal=dir.clone().cross(normal);
    const pts=[];for(let i=0;i<=120;i++){const t=i/120,angle=t*12*Math.PI*2;
      // Smooth end radius joins the exact attachment points.
      const envelope=Math.min(1,t*12,(1-t)*12);
      pts.push(a.clone().lerp(end,t).addScaledVector(normal,.0011*envelope*Math.cos(angle)).addScaledVector(binormal,.0011*envelope*Math.sin(angle)));}
    replace(coil,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),120,.0002,6,false));
    const line=new THREE.CurvePath();const path=[end,...route,b];for(let i=1;i<path.length;i++)line.add(new THREE.LineCurve3(path[i-1],path[i]));
    replace(wire,new THREE.TubeGeometry(line,48,.0003,6,false));
    debug.spring={start:a.toArray(),end:b.toArray(),leverLocal:leverAnchor.toArray(),coilEnd:end.toArray()};
  };
  return{meshes,hiddenMeshes,debug,update,dispose(){for(const m of meshes)m.geometry.dispose();steel.dispose();group.removeFromParent();}};
}

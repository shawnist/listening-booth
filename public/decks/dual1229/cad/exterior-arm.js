// Photographic surface details on the existing reconstructed arm. These are
// removable visual overlays, never contact solids or changes to the CAD source.
import * as THREE from 'three';

export function applyExteriorArm({ scenes, root, kit }) {
  const added=[],materials=[],geometries=[];
  const report={classification:'photo-supported appearance; estimated trim widths and locking-lever placement',features:[],omitted:['existing counterweight stripe, tracking-force and anti-skate scales are retained without duplication','rest clip and pedestal shape remain unchanged; their geometry is unresolved']};
  const material=(source,options)=>{const m=source?.clone?.()||new THREE.MeshStandardMaterial();Object.assign(m,options);materials.push(m);return m;};
  const chrome=material(kit?.M?.chrome,{color:new THREE.Color(0xc7cbce),metalness:.92,roughness:.23});
  const slot=material(null,{color:new THREE.Color(0x15171a),metalness:.15,roughness:.67,polygonOffset:true,polygonOffsetFactor:-1});
  const find=id=>root.getObjectByName(id)||scenes?.arm?.getObjectByName(id);
  function pointsInParent(body){body.updateWorldMatrix(true,true);const inverse=body.parent.matrixWorld.clone().invert(),points=[];body.traverse(n=>{if(!n.isMesh||n.userData.exteriorArmDetail)return;const m=inverse.clone().multiply(n.matrixWorld),p=n.geometry.attributes.position;for(let i=0;i<p.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(m));});return points;}
  function add(body,name,geometry,position,quaternion,mat,source){
    const mesh=new THREE.Mesh(geometry,mat);mesh.name=`exterior-arm-${name}`;mesh.position.copy(position);if(quaternion)mesh.quaternion.copy(quaternion);
    mesh.userData={exteriorArmDetail:true,visualOnly:true,source,provisional:'Dimensions and finish placement fitted to current estimated CAD',part:body.userData.part||`cad:arm:${body.name}`};mesh.castShadow=false;mesh.receiveShadow=true;
    body.parent.add(mesh);body.parent.updateWorldMatrix(true,true);body.attach(mesh);added.push(mesh);geometries.push(geometry);report.features.push({name,body:body.name,source});return mesh;
  }
  // rb040 shows thin bright edge bands on the front of both black gimbal rings.
  // Fit those bands to the imported front annular faces, not a separate gimbal.
  // The rings are turned about the vertical pivot (arm.js ARM_CAD.gimbalSkew): find each ring's own
  // axis as the horizontal direction along which it is thinnest, then fit the band to that face.
  for(const id of ['arm.60.outer_ring_stud','arm.54.inner_ring']){
    const body=find(id);if(!body)continue;const p=pointsInParent(body),upper=p.filter(v=>v.y>.003);if(!upper.length)continue;
    let turn=0,thin=Infinity;
    for(let i=-90;i<90;i++){const a=i*Math.PI/360,c=Math.cos(a),s=Math.sin(a);let lo=Infinity,hi=-Infinity;for(const v of upper){const u=c*v.x-s*v.z;if(u<lo)lo=u;if(u>hi)hi=u;}if(hi-lo<thin){thin=hi-lo;turn=a;}}
    const c=Math.cos(turn),s=Math.sin(turn),along=v=>c*v.x-s*v.z,across=v=>s*v.x+c*v.z;
    const front=Math.max(...upper.map(along)),rim=upper.filter(v=>Math.abs(along(v)-front)<.00005);
    if(!rim.length)continue;const radius=Math.max(...rim.map(v=>Math.hypot(v.y,across(v))))-.0003;
    if(radius<.01||radius>.03)continue;
    const axis=new THREE.Vector3(c,0,-s);
    add(body,`${id.includes('.60.')?'outer':'inner'}-gimbal-bright-edge`,new THREE.TorusGeometry(radius,.000075,8,128),axis.clone().multiplyScalar(front+.000025),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis),chrome,'MAARC rb040 arm-base photograph: narrow bright gimbal rim; width estimated');
  }
  // Screw-drive recesses are finish marks on the source screw heads; neither
  // the screw dimensions nor their already solved mounting surfaces change.
  for(const id of ['arm.58.yaw_point_top','arm.76.clamp_screw']){
    const body=find(id);if(!body)continue;const points=pointsInParent(body),top=Math.max(...points.map(v=>v.y)),face=points.filter(v=>Math.abs(v.y-top)<.00001);if(!face.length)continue;
    const b=new THREE.Box3().setFromPoints(face),c=b.getCenter(new THREE.Vector3()),width=Math.min(b.max.x-b.min.x,b.max.z-b.min.z)*.72;
    if(width<.001||width>.005)continue;c.y=top+.000012;
    add(body,`${id.includes('.58.')?'yaw-bearing':'counterweight-clamp'}-screw-slot`,new THREE.PlaneGeometry(width,.00025),c,new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2),slot,'MAARC rb040 and plain manual exploded view: slotted adjustment/clamp screws; recess represented by flush dark overlay');
  }
  // Tracking-force scale on 77. finish.js wraps the 0-3 p strip with an axial UV whose
  // turn sense is opposite to the dial's: at 1 p set, about 2.8 p sat under the top.
  // A half turn of the printed strip restores three observations together: the set value
  // under the top of the drum (the old model's pointer convention, see
  // parts/tonearm/textures.js forceU), figures upright and rising upward when the drum
  // is seen from the head (MAARC rb040), and the ticks inboard of the figures (rb040,
  // HiFi-Wiki top view). Only the texture transform changes; UVs and geometry do not.
  const restoreMaps=[],textures=[];
  find('arm.77.spring_housing')?.traverse(n=>{
    if(!n.isMesh)return;const list=[n.material].flat();
    const next=list.map(m=>{if(!m?.map)return m;const c=m.clone(),t=m.map.clone();t.center.set(.5,.5);t.rotation=Math.PI;t.needsUpdate=true;c.map=t;materials.push(c);textures.push(t);return c;});
    if(next.some((m,i)=>m!==list[i])){restoreMaps.push([n,n.material]);n.material=Array.isArray(n.material)?next:next[0];}
  });
  if(restoreMaps.length)report.features.push({name:'tracking-force-scale-orientation',body:'arm.77.spring_housing',source:'MAARC rb040 drum figures; HiFi-Wiki top view tick side; plain manual p.7 scale 0-3 p'});
  return{report,meshes:added,dispose(){for(const [n,m] of restoreMaps)n.material=m;for(const t of textures)t.dispose();for(const mesh of added)mesh.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}};
}

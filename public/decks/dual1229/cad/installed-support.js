// Installation hypotheses for the unmeasured171/208/174 stack. Preserve the
// existing detailed casting and finish, but put its fan below the new guide.
import * as T from 'three';
import { GEAR } from '../layout.js';
import { annulusGeometry } from './drive-support.js';

export function installCycleHeight({root,scene,raise=.007}) {
  const names=new Set(['184_main_lever','243_balance_plate','184_stud_a','184_stud_b','184_follower_pin','185_setscrew_red_sealed',
    '183_axle','215_bearing_block','181_leaf_spring_form_unresolved','214_bushing','213_washer_3.2x7x0.5','182_shoulder_screw']);
  const saved=[];root.updateWorldMatrix(true,true);
  const delta=new T.Matrix4().makeTranslation(0,raise,0),inverse=root.matrixWorld.clone().invert();
  scene?.traverse(node=>{
    if(!names.has(node.name))return;
    saved.push({node,matrix:node.matrix.clone(),auto:node.matrixAutoUpdate});
    const matrix=node.parent.matrixWorld.clone().invert().multiply(root.matrixWorld).multiply(delta).multiply(inverse).multiply(node.matrixWorld);
    node.matrixAutoUpdate=false;node.matrix.copy(matrix);matrix.decompose(node.position,node.quaternion,node.scale);node.matrixWorldNeedsUpdate=true;
  });
  root.updateWorldMatrix(true,true);
  // Estimated installation of the unmeasured follower on the EXISTING stem.
  // Move45% toward the fixed pivot; do not alter the detailed184 stamping.
  // Its extended pin reaches the underside of the installed cam web.
  const follower=scene?.getObjectByName('184_follower_pin'),lever=scene?.getObjectByName('184_main_lever');
  let followerInstallation=null;
  if(follower&&lever){
    const bounds=new T.Box3(),p=new T.Vector3();
    follower.traverse(m=>{if(!m.isMesh)return;const matrix=inverse.clone().multiply(m.matrixWorld),a=m.geometry.attributes.position;for(let i=0;i<a.count;i++)bounds.expandByPoint(p.fromBufferAttribute(a,i).applyMatrix4(matrix));});
    const old=bounds.getCenter(new T.Vector3()),pivot=new T.Vector3(.1079771,-.0297+raise,-.0764864),target=old.clone().lerp(pivot,.45);
    const ray=new T.Raycaster(target.clone().setY(.05).applyMatrix4(root.matrixWorld),new T.Vector3(0,-1,0).transformDirection(root.matrixWorld));
    const hit=ray.intersectObject(lever,true)[0];
    if(!hit)throw new Error('Estimated follower installation misses actual184 material');
    const seat=hit.point.clone().applyMatrix4(inverse).y,base=seat-.0006,top=-.0144;
    const move=new T.Matrix4().makeTranslation(target.x-old.x,base,target.z-old.z)
      .multiply(new T.Matrix4().makeScale(1,(top-base)/(bounds.max.y-bounds.min.y),1))
      .multiply(new T.Matrix4().makeTranslation(0,-bounds.min.y,0));
    const matrix=follower.parent.matrixWorld.clone().invert().multiply(root.matrixWorld).multiply(move).multiply(inverse).multiply(follower.matrixWorld);
    follower.matrix.copy(matrix);matrix.decompose(follower.position,follower.quaternion,follower.scale);follower.matrixWorldNeedsUpdate=true;
    followerInstallation={classification:'estimated follower relocation/extension on unchanged184 stem',towardPivot:.45,centre:[target.x,target.z],seat,base,top};
    root.updateWorldMatrix(true,true);
  }
  return {raise,followerInstallation,dispose(){for(const {node,matrix,auto}of saved){node.matrix.copy(matrix);matrix.decompose(node.position,node.quaternion,node.scale);node.matrixAutoUpdate=auto;node.matrixWorldNeedsUpdate=true;}}};
}

export function installSupports({root,kit,datums}) {
  const group=new T.Group();group.name='installed171Support';root.add(group);
  const meshes=[],Y=new T.Vector3(0,1,0),V=(...v)=>new T.Vector3(...v);
  const metal=new T.MeshStandardMaterial({color:0x9fa2a1,metalness:.6,roughness:.6});
  root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert();
  for(const original of kit.parts?.camBracket?.meshes||[]){
    original.updateWorldMatrix(true,false);
    const m=original.clone();m.geometry=original.geometry.clone();
    m.material=Array.isArray(original.material)?original.material.map(x=>x.clone()):original.material.clone();
    m.matrixAutoUpdate=false;m.matrix.copy(new T.Matrix4().makeTranslation(0,-.015,0)).multiply(inverse).multiply(original.matrixWorld);
    group.add(m);meshes.push(m);
  }
  function tube(name,r0,r1,a,b){
    const d=b.clone().sub(a),m=new T.Mesh(annulusGeometry(r0,r1,-d.length()/2,d.length()/2),metal);
    m.name=name;m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(Y,d.normalize());
    group.add(m);meshes.push(m);return m;
  }
  const bridgeTop=-.0406;
  tube('171_platter_column_flange',.00505,.010,V(0,bridgeTop,0),V(0,bridgeTop+.001,0));
  tube('171_platter_thrust_column',.00505,.00695,V(0,bridgeTop,0),V(0,-.0306,0));
  tube('208_cam_bearing_column',.00205,.005,V(GEAR.camX,bridgeTop,GEAR.camZ),V(GEAR.camX,-.03825,GEAR.camZ));
  tube('172_lower_flange',.002,.0043,V(GEAR.camX,-.03825,GEAR.camZ),V(GEAR.camX,-.03725,GEAR.camZ));
  tube('172_212_support_spacer',.002,.0043,V(GEAR.camX,-.03725,GEAR.camZ),V(GEAR.camX,-.0355,GEAR.camZ));
  tube('172_shoulder_212_guide',0,.002,V(GEAR.camX,-.03725,GEAR.camZ),V(GEAR.camX,-.032,GEAR.camZ));
  tube('208_cam_axle_upper',0,.003,V(GEAR.camX,-.032,GEAR.camZ),V(GEAR.camX,-.0116,GEAR.camZ));
  tube('208_cam_axle_lower',0,.002,V(GEAR.camX,-.045,GEAR.camZ),V(GEAR.camX,-.03725,GEAR.camZ));
  const pivot=V(...datums.rockerPivot),axis=V(...datums.rockerAxis).normalize();
  // Two coaxial ears replace the old hanger's19mm offset axis. Their bore
  // matches the existing CAD174 pin; the pin itself remains the CAD solid.
  for(const sign of [-1,1]){
    const a=pivot.clone().addScaledVector(axis,sign*.0055),b=pivot.clone().addScaledVector(axis,sign*.0075);
    tube(`171_174_ear_${sign}`, .001,.0025,a,b);
    const p=pivot.clone().addScaledVector(axis,sign*.0065);
    tube(`171_174_pedestal_${sign}`,0,.0015,V(p.x,bridgeTop,p.z),V(p.x,p.y-.002,p.z));
  }
  for(const mesh of meshes){mesh.userData.part='cad:installed:171';mesh.castShadow=mesh.receiveShadow=true;}
  return {meshes,status:{classification:'estimated installation: detailed171 lowered15mm; coaxial174 ears; spindle thrust and208 bearing columns',bridgeTop},
    setEnabled(on){group.visible=on;},dispose(){group.removeFromParent();for(const m of meshes)m.geometry.dispose();metal.dispose();}};
}

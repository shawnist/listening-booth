import * as THREE from 'three';
import { gearGeo } from '../parts/shared/geometry.js';
import { GEAR } from '../layout.js';
import { SPEC } from '../spec.js';

// Installed estimates, not factory dimensions. The full CAD casting fixes the
// bore and hub. These mounting interfaces close onto it without changing it.
export const DRIVE_SUPPORT = Object.freeze({
  tube: { inner: .0036, outer: .0049, bottom: -.040, top: .021 },
  hub: { bore: .005, radius: .007, bottom: -.028 },
  thrust: { inner: .00505, outer: .00695, bottom: -.0306, top: -.028, race: .0005, ball: .0008, count: 8 },
  pinion: { bore: .0071, bottom: -.0165, top: -.003 },
});
export function annulusGeometry(inner, outer, bottom, top) {
  return new THREE.LatheGeometry([[inner,bottom],[outer,bottom],[outer,top],[inner,top],[inner,bottom]].map(p => new THREE.Vector2(...p)), 96);
}
export function bindDriveSupport({ root, kit }) {
  const group = new THREE.Group(); group.name = 'cad-installed-drive-support'; root.add(group);
  const meshes = [], ownedMaterials = [];
  const material = (key, fallback) => {
    const source = kit?.parts[key]?.meshes.find(m => !Array.isArray(m.material))?.material;
    const m = source?.clone() || new THREE.MeshStandardMaterial(fallback); ownedMaterials.push(m); return m;
  };
  const steel = material('thrustBearing', { color: 0xa9afb3, metalness: .8, roughness: .3 });
  const brass = material('hubGear', { color: 0xba984e, metalness: .75, roughness: .35 });
  const add = (name, geometry, mat, parent = group) => {
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = name;
    mesh.userData = { part: `installed:${name}`, cad: 'drive', basis: 'estimated installed support; factory dimensions unverified' };
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); meshes.push(mesh); return mesh;
  };
  const { tube:T, thrust:B, pinion:P, hub:H } = DRIVE_SUPPORT;
  add('171-installed-bearing-tube', annulusGeometry(T.inner,T.outer,T.bottom,T.top), steel);
  add('169-lower-race', annulusGeometry(B.inner,B.outer,B.bottom,B.bottom+B.race), steel);
  const upper = new THREE.Group(); group.add(upper);
  add('169-upper-race', annulusGeometry(B.inner,B.outer,B.top-B.race,B.top), steel, upper);
  const cage = new THREE.Group(); group.add(cage);
  for (let i=0;i<B.count;i++) {
    const a=i*Math.PI*2/B.count, r=(B.inner+B.outer)/2;
    add(`169-ball-${i}`,new THREE.SphereGeometry(B.ball,16,12),steel,cage).position.set(r*Math.cos(a),(B.top+B.bottom)/2,r*Math.sin(a));
  }
  const pinion = new THREE.Group(); group.add(pinion);
  // The old helper tessellates a bore as an octagon. Re-extrude its identical
  // tooth outline with a finely sampled bore so the nominal clearance exists.
  const template = gearGeo(GEAR.pinionR,SPEC.pinionTeeth,P.top-P.bottom,0,P.bore);
  const pinionGeometry = new THREE.ExtrudeGeometry(template.parameters.shapes,
    { depth: P.top-P.bottom, bevelEnabled: false, curveSegments: 64 });
  pinionGeometry.rotateX(Math.PI/2); pinionGeometry.translate(0,(P.top-P.bottom)/2,0); template.dispose();
  add('PR-installed-pinion',pinionGeometry,brass,pinion).position.y=(P.top+P.bottom)/2;
  // Nominal fitted sleeve joins the unchanged hub to the enlarged pinion bore.
  // It represents an assumed fixed fit, not a validated key or friction capacity.
  add('PR-installed-hub-sleeve',annulusGeometry(H.radius,P.bore,P.bottom,P.top),brass,pinion);
  return { meshes, group, replacedKeys: ['hubGear','thrustBearing'],
    update(s) { const angle=-(s.platterTurns||0)*Math.PI*2; pinion.rotation.y=upper.rotation.y=angle; cage.rotation.y=angle/2; },
    dispose() { for (const m of meshes) m.geometry.dispose(); for (const m of ownedMaterials) m.dispose(); group.removeFromParent(); } };
}

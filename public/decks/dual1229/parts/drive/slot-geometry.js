// Render the same independent material vertices used by the forward contact solver.
import * as THREE from 'three';
import { channelData } from './channel-data.js';
export function channelGeometry(profile) {
  return Object.fromEntries(Object.entries(channelData(profile)).map(([key,data])=>{
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(data.positions,3));
    g.setIndex(data.indices);g.computeVertexNormals();
    return [key,g];
  }));
}

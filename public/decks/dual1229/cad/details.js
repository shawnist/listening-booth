// Surface markings from the existing renderer, registered to the selected CAD
// bodies. These are finish details, not measurements or additional mechanism solids.
import * as THREE from 'three';
import { stripTexture } from '../parts/outside/print.js';
import { LEGENDS, CONTROLS, BADGE } from '../parts/outside/place.js';
import { skateFaceTexture, skateSkirtTexture } from '../parts/tonearm/textures.js';

export function applyCadDetails({ scenes, root, kit, axes }) {
  root.updateMatrixWorld(true);
  const textures = [];
  const box = object => new THREE.Box3().setFromObject(object);
  const strip = scenes.structure.getObjectByName('S20_strip');
  const b = box(strip), badge = box(scenes.structure.getObjectByName('S47_badge')).getCenter(new THREE.Vector3());
  const axis = id => ({ x: axes[id][0] / 1000, z: axes[id][1] / 1000 });
  const target = { speed: axis('speed_pitch'), pitch: axis('speed_pitch'),
    lever: axis('start_stop_48'), size: axis('size_49'), strobe: axis('strobe_46') };
  const legends = { ...LEGENDS, text: LEGENDS.text.map(t => {
    const key = /^(33|45|78|pitch)$/.test(t.s) ? 'pitch' : /^(start|stop)$/.test(t.s) ? 'lever'
      : /^(7|10|12)$/.test(t.s) ? 'size' : t.s === 'strobe' ? 'strobe' : null;
    const dx = key ? target[key].x - CONTROLS[key].x : badge.x - BADGE.x;
    const dz = key ? target[key].z - CONTROLS[key].z : badge.z - BADGE.z;
    return { ...t, x: t.x + dx, z: t.z + dz };
  }) };
  const printed = stripTexture({ x0:b.min.x, x1:b.max.x, z0:b.min.z, z1:b.max.z }, 11000,
    { legends, controls: { ...CONTROLS, ...target } });
  // The print generator retains its original artwork. Derive a CAD-specific
  // linear surface map: green is roughness, blue is metalness (ink is dielectric).
  const canvas = document.createElement('canvas');
  canvas.width = printed.finish.image.width; canvas.height = printed.finish.image.height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(printed.finish.image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i=0;i<pixels.data.length;i+=4) {
    const ink = Math.max(0, Math.min(1, (pixels.data[i+1]/255 - 0.23)/0.62));
    pixels.data[i+1] = Math.round(255*(0.47+0.35*ink));
    pixels.data[i+2] = Math.round(255*(1-ink));
  }
  ctx.putImageData(pixels,0,0);
  const surface = new THREE.CanvasTexture(canvas); surface.colorSpace = THREE.NoColorSpace; surface.anisotropy=8;
  textures.push(printed.map, printed.finish, surface);
  strip.traverse(o => {
    for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
      if (m.userData.cadSurface === 'strip-top') {
        m.map = printed.map; m.roughnessMap = surface; m.metalnessMap = surface;
        m.roughness = 1; m.metalness = 1;
        // US inch-panel closeups show satin silver with restrained horizontal
        // reflections and sharply printed black legends on the uncoated face.
        m.color.setHex(0xb3b5b7);
        m.needsUpdate = true;
      }
    }
  });
  const attach = (body, mesh) => { root.add(mesh); root.updateMatrixWorld(true); body.attach(mesh); mesh.castShadow=false; };
  // The cue lever's slot. The plate's slot runs 35 mm, from 16 mm behind the strip's back edge to the
  // strip's own slot; the lever now stands in the strip's slot (lift-installation.js, installCueLever),
  // so on the real deck there is no slot behind the strip (owner's photo and hifiwiki's, 2026-11-19).
  // The part behind the strip is closed with a patch of the plate's own paint.
  {
    const plate = scenes.structure.getObjectByName('S10_plate');
    const edge = []; let paint = null;
    plate?.traverse(o => { if (!o.isMesh) return; paint ||= Array.isArray(o.material) ? o.material[0] : o.material;
      const pos = o.geometry.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); root.worldToLocal(v);
        if (v.y > b.min.y - 0.0003 && v.x > b.max.x - 0.012 && v.x < b.max.x - 0.002 && v.z > b.min.z - 0.030 && v.z < b.min.z + 0.030) edge.push(v.clone()); } });
    if (edge.length > 8 && paint) {
      // the slot's sides and back end in the plate's top face; the strip's back edge beside it
      const sx0 = Math.min(...edge.map(v => v.x)), sx1 = Math.max(...edge.map(v => v.x)), sBack = Math.min(...edge.map(v => v.z));
      // the strip's back edge just right of the slot, where it reaches back to the lever
      let stripBack = Infinity; strip.traverse(o => { if (!o.isMesh) return; const pos = o.geometry.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); root.worldToLocal(v);
          if (v.x > sx1 + 0.0005 && v.x < sx1 + 0.003) stripBack = Math.min(stripBack, v.z); } });
      if (!Number.isFinite(stripBack)) stripBack = b.min.z;
      const x0 = sx0 - 0.0004, x1 = sx1 + 0.0004, z0 = sBack - 0.0004, z1 = stripBack + 0.0003;
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, b.min.y + 0.00003, (z0 + z1) / 2);
      const cover = new THREE.Mesh(g, paint); cover.name = 'finish-cue-slot-cover'; cover.receiveShadow = true;
      root.add(cover); root.updateMatrixWorld(true); plate.attach(cover);
    }
  }
  // The anti-skate scale turns with the knob rather than floating over its axis.
  const knob = scenes.arm.getObjectByName('arm.79.antiskate_knob'), kb = box(knob), kc=kb.getCenter(new THREE.Vector3());
  const faceTexture=skateFaceTexture();textures.push(faceTexture);
  const knobR=Math.min(kb.max.x-kb.min.x,kb.max.z-kb.min.z)/2, knobH=kb.max.y-kb.min.y;
  const face=new THREE.Mesh(new THREE.CircleGeometry(knobR-0.0004,96),
    new THREE.MeshStandardMaterial({map:faceTexture,roughness:0.42,metalness:0.1}));
  face.rotation.x=-Math.PI/2;face.position.set(kc.x,kb.max.y+0.00004,kc.z);face.name='finish-antiskate-scale';attach(knob,face);
  // Knurled skirt with its white bars (owner's close-ups, 2026-11-19). A printed sleeve on the
  // CAD cylinder: the rib count and bar height are photo estimates, and the ribs are not cut in.
  const skirtTexture=skateSkirtTexture(40);textures.push(skirtTexture);
  const skirt=new THREE.Mesh(new THREE.CylinderGeometry(knobR+0.00006,knobR+0.00006,knobH-0.0004,96,1,true),
    new THREE.MeshStandardMaterial({map:skirtTexture,roughness:0.5,metalness:0.05}));
  skirt.position.set(kc.x,kb.min.y+(knobH-0.0004)/2,kc.z);skirt.name='finish-antiskate-skirt';attach(knob,skirt);
  // Preserve the original owner's base badge, mounted flush on the CAD front wall.
  const walls=scenes.structure.getObjectByName('SPL_walls'), wb=box(walls), source=kit.named.baseBadge;
  if(source){
    source.updateWorldMatrix(true,false);
    const badgeCopy=source.clone();badgeCopy.geometry=source.geometry.clone();
    badgeCopy.material=source.material.map(m=>m.clone());badgeCopy.name='finish-united-audio-badge';
    // dFnPyYWFTE8 0:55 (plain 1229 in a banded WB-19): wood x 22..623 px for 425.5 mm; badge x 509..575,
    // so its centre is 57 +/- 1.5 mm in from the right end and 47 mm wide, centred on the band.
    badgeCopy.position.set(wb.max.x-0.057,-0.060,wb.max.z+0.00045);attach(walls,badgeCopy);
  }
  // Escutcheon 68 legends are drawn by exterior-arm-base.js.
  return { dispose(){ for(const texture of textures)texture.dispose(); } };
}

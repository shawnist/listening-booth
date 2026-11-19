// Plain-1229 exterior finish references: bXv4Md0Nsnw 02:15 / 02:55 / 03:15
// and reference/images/outside/hifiwiki_top_view.jpg. These surface details
// retain the exported bodies and their functional axes. Widths, relief and
// finish values are visual estimates; they are not measured part dimensions.
import * as THREE from 'three';

// Lever 6/48/49 top insert: black plastic margin left at each long edge (E).
export const INSERT = Object.freeze({ margin: 0.0002 });
// Lever 6/48/49 blade: a solid upright slab, not the exported thin strip. The owner's photos of a
// plain 1229 (2026-11-18, room attachments a4a1fe50 from the front and d62d105d low from the side)
// show each blade with a level top standing a little above its round hub, the same height all the
// way to the tip, its underside just over the strip. The exported blade is 2.6 mm thick and slopes
// to 3 mm above the strip, so it read as a flat bar. rise (blade top over the hub top) is an
// estimate from those photos (scale: the 13 mm hubs), not a measurement. Metres.
export const BLADE = Object.freeze({ rise: 0.0015, floor: 0.00035, wheelGap: 0.0004, wheelOver: 0.0003, grow: 0.00005 });

export function applyExteriorControls({ scenes, root, kit }) {
  const meshes = [], materials = [];
  const report = { bodies: [], policy: 'source CAD solids unchanged; attached surface finishes, estimated detail dimensions' };
  const material = options => { const m = new THREE.MeshPhysicalMaterial(options); materials.push(m); return m; };
  const aluminium = material({ color: 0xd8dade, roughness: 0.31, metalness: 0.62, anisotropy: 0.45 });
  const ribFinish = material({ color: 0xcac9c2, roughness: 0.40, metalness: 0.23 });
  const bezelFinish = material({ color: 0x111214, roughness: 0.27, metalness: 0.08, clearcoat: 0.2 });
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const sourceMeshes = body => { const result = []; body.traverse(o => { if (o.isMesh) result.push(o); }); return result; };
  const vertices = body => {
    const result = [];
    for (const mesh of sourceMeshes(body)) {
      const transform = inverse.clone().multiply(mesh.matrixWorld), p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) result.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(transform));
    }
    return result;
  };
  const attach = (body, name, geometry, mat) => {
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = name;
    mesh.userData = { part: `cad:structure:${body.name}`, cad: 'structure', finishOnly: true,
      basis: 'plain-1229 exterior photos; detail dimensions estimated' };
    mesh.castShadow = false; mesh.receiveShadow = true;
    root.add(mesh); root.updateWorldMatrix(true, true); body.attach(mesh); meshes.push(mesh);
    return mesh;
  };
  const quadGeometry = quads => {
    const p = [];
    for (const q of quads) for (const i of [0, 1, 2, 0, 2, 3]) p.push(...q[i].toArray());
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g;
  };

  const boundsOf = name => { const b = scenes.structure.getObjectByName(name); return b ? new THREE.Box3().setFromPoints(vertices(b)) : null; };
  const stripBox = boundsOf('S20_strip'), wheelBox = boundsOf('S08_pitch_wheel');
  for (const name of ['S06_speed_lever', 'S48_start_stop_lever', 'S49_size_lever']) {
    const body = scenes.structure.getObjectByName(name); if (!body) continue;
    const v = vertices(body), bounds = new THREE.Box3().setFromPoints(v);
    const tip = v.filter(p => Math.abs(p.z - bounds.max.z) < 1e-7);
    const tipBounds = new THREE.Box3().setFromPoints(tip);
    const hubRadius = (bounds.max.x - bounds.min.x) / 2;
    const hubZ = bounds.min.z + hubRadius;
    // The bright insert spans the blade top. In dFnPyYWFTE8 02:12 (start/stop,
    // nearly square on) it measures about 4.3 of the 4.5 mm blade width. In the
    // HiFi-Wiki top view the start/stop face is about 4.2 mm wide. The dark band
    // beside it is the side face turned toward that camera. Black plastic
    // closes the tip. Margins are estimated. Sample the CAD top itself so the
    // insert follows its existing slope rather than a guessed tilt.
    // The upright blade (BLADE) encloses the exported one: a little wider, longer and taller everywhere,
    // so none of the exported faces show through. Its side profile runs from inside the hub to the tip,
    // and its top stands above the hub's.
    const stripTop = stripBox ? stripBox.max.y : bounds.min.y, hubTop = bounds.max.y;
    const s0 = hubRadius * 0.6, sTip = bounds.max.z - hubZ + BLADE.grow;
    const topAt = () => hubTop + BLADE.rise; // level from the hub to the tip
    const floor = stripTop + BLADE.floor, profile = [];
    if (name === 'S06_speed_lever' && wheelBox) { // 6 rides over pitch wheel 8: its underside steps down past the wheel's rim
      const wheelTop = wheelBox.max.y + BLADE.wheelGap, wheelEdge = (wheelBox.max.x - wheelBox.min.x) / 2 + BLADE.wheelOver;
      profile.push([s0, wheelTop], [wheelEdge, wheelTop], [wheelEdge, floor]);
    } else profile.push([s0, floor]);
    profile.push([sTip, floor], [sTip, topAt(sTip)], [s0, topAt(s0)]);
    const bx0 = tipBounds.min.x - BLADE.grow, bx1 = tipBounds.max.x + BLADE.grow;
    const blade = new THREE.ExtrudeGeometry(new THREE.Shape(profile.map(([s, y]) => new THREE.Vector2(s, y))), { depth: bx1 - bx0, bevelEnabled: false });
    blade.rotateY(-Math.PI / 2); blade.translate(bx1, 0, hubZ); // shape x (along the blade) -> +z, extrusion -> -x
    const plastic = sourceMeshes(body)[0].material; const bladeMat = (Array.isArray(plastic) ? plastic[0] : plastic).clone(); materials.push(bladeMat);
    const bladeMesh = attach(body, `${name}-upright-blade`, blade, bladeMat);
    bladeMesh.userData = { ...bladeMesh.userData, finishOnly: false, basis: 'owner photo 2026-11-18; blade heights estimated' };
    bladeMesh.castShadow = true;
    const x0 = bx0 + INSERT.margin, x1 = bx1 - INSERT.margin;
    const z0 = hubZ + hubRadius * 1.10, z1 = bounds.max.z - 0.00060;
    const top = (x, z) => new THREE.Vector3(x, topAt(z - hubZ) + 0.000012, z);
    const corners = [top(x0,z0), top(x0,z1), top(x1,z1), top(x1,z0)];
    attach(body, `finish-${name}-aluminium-inlay`, quadGeometry([corners]), aluminium);
    report.bodies.push({ name, detail: 'aluminium insert across the blade top', corners: corners.map(p => p.toArray()),
      bladeWidth: bx1 - bx0, insertWidth: x1 - x0, clearanceAboveSurface: 0.000012,
      blade: { detail: 'upright blade enclosing the exported one', profile } });
  }

  for (const name of ['S08_pitch_wheel', 'S46_strobe_ring']) {
    const body = scenes.structure.getObjectByName(name); if (!body) continue;
    const v = vertices(body), bounds = new THREE.Box3().setFromPoints(v), centre = bounds.getCenter(new THREE.Vector3());
    const radius = (bounds.max.x - bounds.min.x) / 2;
    const unique = new Map();
    for (const p of v) if (Math.abs(p.y - bounds.max.y) < 1e-7 && Math.hypot(p.x-centre.x,p.z-centre.z) > radius - 0.0006)
      unique.set(`${p.x.toFixed(8)},${p.z.toFixed(8)}`, p);
    const outline = [...unique.values()].sort((a,b) => Math.atan2(a.z-centre.z,a.x-centre.x) - Math.atan2(b.z-centre.z,b.x-centre.x));
    const quads = [];
    for (let i=0; i<outline.length; i++) {
      const a=outline[i], b=outline[(i+1)%outline.length];
      const ra=Math.hypot(a.x-centre.x,a.z-centre.z), rb=Math.hypot(b.x-centre.x,b.z-centre.z);
      const peak=ra>rb?a:b, valley=ra>rb?b:a;
      // A narrow light face wraps the peak of each existing tooth. Its flanks
      // are sampled from the actual exported polygon, not an enclosing ring.
      const end=peak.clone().lerp(valley,0.32);
      const outward=new THREE.Vector3(b.z-a.z,0,a.x-b.x).normalize();
      if(outward.dot(a.clone().sub(centre))<0)outward.negate();
      const first=peak.clone().addScaledVector(outward,0.000010), last=end.clone().addScaledVector(outward,0.000010);
      const bottom=bounds.min.y+0.00035, top=bounds.max.y-0.00045;
      const q=[new THREE.Vector3(first.x,bottom,first.z),new THREE.Vector3(last.x,bottom,last.z),new THREE.Vector3(last.x,top,last.z),new THREE.Vector3(first.x,top,first.z)];
      const normal=new THREE.Vector3().crossVectors(q[1].clone().sub(q[0]),q[2].clone().sub(q[0]));
      if(normal.dot(outward)<0)q.reverse();
      quads.push(q);
    }
    attach(body,`finish-${name}-bright-rib-faces`,quadGeometry(quads),ribFinish);
    report.bodies.push({name,detail:'narrow bright faces on existing knurl peaks',flankCount:quads.length});
    if(name==='S46_strobe_ring') {
      let inner=Infinity;
      for(const p of v)inner=Math.min(inner,Math.hypot(p.x-centre.x,p.z-centre.z));
      // A dark bevel seats against the existing hole wall and stays below its
      // top edge. Leave the original functional strobe lens/material intact.
      const y=bounds.max.y;
      const profile=[[inner+0.00007,y-0.00008],[inner-0.00020,y-0.00020],[inner-0.00048,y-0.00070],[inner-0.00048,y-0.00135],[inner+0.00007,y-0.00135]];
      const g=new THREE.LatheGeometry(profile.map(([r,h])=>new THREE.Vector2(r,h)),96);
      g.translate(centre.x,0,centre.z);
      attach(body,'finish-S46-recessed-inner-bezel',g,bezelFinish);
      report.bodies.push({name,detail:'recessed inner window bezel',innerRadius:inner});
    }
  }
  return { report, meshes, dispose() { const owned=new Set(materials); for(const mesh of meshes){mesh.removeFromParent();mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])owned.add(m);} for(const m of owned)m.dispose(); } };
}

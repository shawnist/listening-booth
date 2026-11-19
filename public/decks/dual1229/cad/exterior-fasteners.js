// Transport locks 12 (Transportsicherung kpl., 214 210), three per plain 1229.
// Plain Fig. 33 (manual p.24) draws each cross-slotted head inside a bright
// seat ring. At the figure's 1.92 px/mm the ring/head diameter ratio is about
// 1.4, i.e. ring radius 6.4 mm for the CAD head radius 4.5 mm (+-0.5 mm).
// bXv4Md0Nsnw 02:55 and the HiFi-Wiki top view show head and ring in the same
// bright metal, so the collar shares the head's installed material.
// The CAD head, shank, lower stack, materials and mounting coordinates stay unchanged.
// The collar profile height and edge roll are estimates. The collar is an
// installed visual detail. Its owning shape belongs in structure CAD.
import * as THREE from 'three';

export const SEAT_COLLAR = Object.freeze({
  outerRadius: 0.0064,   // plain Fig.33 ring/head ratio x CAD head radius (PMp, +-0.0005)
  rise: 0.0005,          // collar top above the head's underside (E)
  edge: 0.0005,          // rolled outer edge radius (E)
  clearance: 0.00005,    // radial gap to the CAD head wall (rendering clearance)
});

export function applyExteriorFasteners({ scenes, root, kit }) {
  root.updateWorldMatrix(true, true);
  const meshes = [];
  const inverse = root.matrixWorld.clone().invert();
  const screws = [];
  scenes.structure.traverse(o => { if (/^S12_transport_screw_\d+$/.test(o.name)) screws.push(o); });
  const report = { surrounds: 0, seats: [], mechanicalGeometryChanged: false,
    basis: 'plain Fig.33 ring/head ratio; finish from bXv4Md0Nsnw 02:55 and HiFi-Wiki top view' };
  for (const body of screws) {
    // Read the actual CAD head: vertices outside the shank radius.
    const points = []; let headMaterial = null;
    body.traverse(mesh => {
      if (!mesh.isMesh) return;
      headMaterial ??= mesh.material;
      const m = inverse.clone().multiply(mesh.matrixWorld), p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m));
    });
    const all = new THREE.Box3().setFromPoints(points), c = all.getCenter(new THREE.Vector3());
    const radial = p => Math.hypot(p.x - c.x, p.z - c.z);
    const headRadius = Math.max(...points.map(radial));
    const shankRadius = Math.max(...points.filter(p => p.y < all.max.y - 0.004).map(radial));
    const head = points.filter(p => radial(p) > shankRadius + 0.0003);
    const headBottom = Math.min(...head.map(p => p.y)), headTop = Math.max(...head.map(p => p.y));
    // Each seat is the chassis plate top (y 0). The front seat lies inside
    // the strip's seat hole, so its collar also stands on the plate.
    const seat = 0, top = headBottom + SEAT_COLLAR.rise;
    const ri = headRadius + SEAT_COLLAR.clearance, ro = SEAT_COLLAR.outerRadius, e = SEAT_COLLAR.edge;
    // Lathe order: base outward, up the rolled outer edge, top inward, so
    // the normals face out of the solid.
    const profile = [[ri, seat], [ro, seat]];
    for (let i = 0; i <= 6; i++) {
      const a = i / 6 * Math.PI / 2, point = [ro - e + e * Math.cos(a), Math.max(seat, top - e) + e * Math.sin(a)];
      if (point[1] > seat + 1e-7 || i > 0) profile.push(point);
    }
    profile.push([ri, top], [ri, seat]);
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 72), headMaterial);
    mesh.position.set(c.x, 0, c.z); mesh.name = `finish-${body.name}-seat-collar`;
    mesh.userData = { part: `cad:structure:${body.name}`, cad: 'structure', finishOnly: true,
      visualDetail: { source: 'plain manual p.24 Fig.33; bXv4Md0Nsnw 02:55', dimensions: 'outer radius PMp ratio; rise and edge estimated', role: 'installed seat collar of item 12' } };
    mesh.castShadow = false; mesh.receiveShadow = true;
    root.add(mesh); root.updateWorldMatrix(true, true); body.attach(mesh); meshes.push(mesh);
    report.seats.push({ name: body.name, centre: [c.x, c.z], headRadius, headBottom, headTop, seat, collarTop: top, collarOuterRadius: ro });
  }
  report.surrounds = meshes.length;
  return { report, meshes, dispose() {
    // The shared head material belongs to the CAD body and is not disposed here.
    for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
  } };
}

// Geometry for the outside's parts: rounded outlines, flat slabs, knurled rings, the Dual lever, the
// transport screw's cross-slotted head. Owned by the outside builder (see OWNERS.md).
import * as THREE from 'three';

const TAU = Math.PI * 2;

// A rounded rectangle in the x-z plane as a THREE.Shape (shape y = -z, so it extrudes upward
// after rotateX(-90 deg)).
export function roundRect(x0, x1, z0, z1, r, path = new THREE.Shape()) {
  path.moveTo(x0 + r, -z0); path.lineTo(x1 - r, -z0); path.quadraticCurveTo(x1, -z0, x1, -z0 - r);
  path.lineTo(x1, -z1 + r); path.quadraticCurveTo(x1, -z1, x1 - r, -z1); path.lineTo(x0 + r, -z1);
  path.quadraticCurveTo(x0, -z1, x0, -z1 + r); path.lineTo(x0, -z0 - r); path.quadraticCurveTo(x0, -z0, x0 + r, -z0);
  return path;
}
// A polygon in the x-z plane with every corner rounded off (radius r, or less where the sides are short).
export function filletPoly(pts, r, path = new THREE.Shape()) {
  const n = pts.length, P = pts.map(([x, z]) => new THREE.Vector2(x, -z));
  for (let i = 0; i < n; i++) {
    const a = P[(i + n - 1) % n], b = P[i], c = P[(i + 1) % n];
    const da = a.clone().sub(b), dc = c.clone().sub(b), k = Math.min(r, da.length() / 2.2, dc.length() / 2.2);
    const p0 = b.clone().add(da.normalize().multiplyScalar(k)), p1 = b.clone().add(dc.normalize().multiplyScalar(k));
    if (i === 0) path.moveTo(p0.x, p0.y); else path.lineTo(p0.x, p0.y);
    path.quadraticCurveTo(b.x, b.y, p1.x, p1.y);
  }
  path.closePath();
  return path;
}
// Extrude a shape upward by t, its top at y = top, with UVs laid flat over the box b. The bevel is
// taken inside the outline, so the finished part has the outline's size.
export function slabGeo(shape, t, top, b, bevel = 0.0003, curveSegments = 96) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-5, t - 2 * bevel), bevelEnabled: bevel > 0, bevelSize: bevel, bevelOffset: -bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments });
  g.rotateX(-Math.PI / 2); g.translate(0, top - t + bevel, 0);
  if (b) {
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - b.x0) / (b.x1 - b.x0), 1 - (p.getZ(i) - b.z0) / (b.z1 - b.z0));
    uv.needsUpdate = true;
  }
  return g;
}
// A knurled ring (or wheel, rIn = 0) standing on y = 0, height h, its ribs round the outside: each rib a
// flat outer face `tip` of the pitch wide, with short steep flanks (`flank` of the pitch each) down to the
// root. Groups: 0 the top and bottom faces, 1 the knurled side.
export function knurlGeo(rOut, rIn, h, teeth, depth = 0.0006, bevel = 0.00025, tip = 0.25, flank = 0.1) {
  const s = new THREE.Shape(), rRoot = rOut - depth;
  const prof = [[0, rRoot], [(1 - tip) / 2 - flank, rRoot], [(1 - tip) / 2, rOut], [(1 + tip) / 2, rOut], [(1 + tip) / 2 + flank, rRoot]];
  for (let i = 0; i < teeth; i++) for (const [f, r] of prof) {
    const a = ((i + f) / teeth) * TAU, x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0 && f === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  if (rIn > 0) { const p = new THREE.Path(); p.absarc(0, 0, rIn, 0, TAU, true); s.holes.push(p); }
  const g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelOffset: -bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 48 });
  g.rotateX(-Math.PI / 2); g.translate(0, bevel, 0);
  return g;
}

// Drill round holes through a flat face of a non-indexed geometry (the walnut base's back wall): the
// triangles lying in the plane z = zFace and facing `facing` (-1: toward -z, +1: toward +z) are taken out
// and the rectangle they covered is put back as a flat face with the holes in it. holes: [x, y, r].
// Returns the new geometry (position and normal; the base's uv loop lays out its uvs afterwards).
export function holeFaces(geo, faces, holes) {
  const p = geo.attributes.position, n = geo.attributes.normal, keep = [], keepN = [], add = [];
  const onFace = (i) => faces.find((f) => Math.abs(p.getZ(i) - f.z) < 1e-7 && Math.sign(n.getZ(i)) === f.facing);
  const box = faces.map(() => ({ x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }));
  for (let t = 0; t < p.count; t += 3) {
    const f = onFace(t);
    if (f && onFace(t + 1) === f && onFace(t + 2) === f) {
      const b = box[faces.indexOf(f)];
      for (let k = 0; k < 3; k++) { b.x0 = Math.min(b.x0, p.getX(t + k)); b.x1 = Math.max(b.x1, p.getX(t + k)); b.y0 = Math.min(b.y0, p.getY(t + k)); b.y1 = Math.max(b.y1, p.getY(t + k)); }
      continue;
    }
    for (let k = 0; k < 3; k++) { keep.push(p.getX(t + k), p.getY(t + k), p.getZ(t + k)); keepN.push(n.getX(t + k), n.getY(t + k), n.getZ(t + k)); }
  }
  faces.forEach((f, j) => {
    const b = box[j]; if (!(b.x1 > b.x0)) throw new Error('holeFaces: no face at z = ' + f.z);
    const sh = new THREE.Shape(); sh.moveTo(b.x0, b.y0); sh.lineTo(b.x1, b.y0); sh.lineTo(b.x1, b.y1); sh.lineTo(b.x0, b.y1); sh.closePath();
    for (const [x, y, r] of holes) { const h = new THREE.Path(); h.absarc(x, y, r, 0, TAU, true); sh.holes.push(h); }
    const g = new THREE.ShapeGeometry(sh, 24).toNonIndexed(), q = g.attributes.position;
    for (let t = 0; t < q.count; t += 3) { // ShapeGeometry faces +z: turn the winding round for a face toward -z
      const order = f.facing > 0 ? [0, 1, 2] : [0, 2, 1];
      for (const k of order) add.push([[q.getX(t + k), q.getY(t + k), f.z], [0, 0, f.facing]]);
    }
  });
  // the bore of each hole, from face to face, facing in toward its axis
  const z0 = Math.min(...faces.map((f) => f.z)), z1 = Math.max(...faces.map((f) => f.z));
  for (const [x, y, r] of holes) {
    const N = 24;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU, c0 = [Math.cos(a0), Math.sin(a0)], c1 = [Math.cos(a1), Math.sin(a1)];
      const P = (c, z) => [[x + c[0] * r, y + c[1] * r, z], [-c[0], -c[1], 0]];
      for (const v of [P(c0, z0), P(c1, z1), P(c1, z0), P(c0, z0), P(c0, z1), P(c1, z1)]) add.push(v);
    }
  }
  for (const [v, nn] of add) { keep.push(...v); keepN.push(...nn); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(keepN, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((keep.length / 3) * 2), 2));
  return out;
}
// The Dual lever's blade (its hub is drawn separately): a flat bar of width w sloping from top0 at the
// hub's axis to top1 at the tip (s = len), t deep, its tip cut square; along +z from the origin. And the
// bright aluminium face along ONE side of its top (Fig. 30, the hifi-wiki strobe photo, O2): a strip
// `face` of the blade's width, flush with the edge on `side` (+1: +x, -1: -x), the rest of the top black.
export function leverGeos({ len, w, top0, top1, t, hubR, side = 1, face = 0.55 }) {
  const at = (s) => top0 + ((top1 - top0) * s) / len;
  const sh = new THREE.Shape([[0, at(0) - t], [len, at(len) - t], [len, at(len)], [0, at(0)]].map(([s, y]) => new THREE.Vector2(s, y)));
  const b = 0.0003;
  const blade = new THREE.ExtrudeGeometry(sh, { depth: w - 2 * b, bevelEnabled: true, bevelSize: b, bevelOffset: -b, bevelThickness: b, bevelSegments: 2 });
  blade.rotateY(-Math.PI / 2); blade.translate(w / 2 - b, 0, 0);
  // the face: from the hub's edge to just short of the tip, its outer edge on the blade's flat top
  // (inside the bevel), standing 0.12 mm proud of it
  const s0 = hubR * 0.9, s1 = len - 0.0004, it = 0.00012, iw = w * face, edge = w / 2 - b * 0.8;
  const ish = new THREE.Shape([[s0, at(s0) - it], [s1, at(s1) - it], [s1, at(s1) + it], [s0, at(s0) + it]].map(([s, y]) => new THREE.Vector2(s, y)));
  const inlay = new THREE.ExtrudeGeometry(ish, { depth: iw, bevelEnabled: false });
  inlay.rotateY(-Math.PI / 2); // extrudes toward -x from x = 0
  inlay.translate(side > 0 ? edge : -edge + iw, 0.00002, 0);
  return { blade, inlay };
}
// One quarter of a cross-slotted screw head (radius r, slot width sw, height h): four of them, turned
// 90 degrees apart, make the head with its cross slot. Rounded top edge.
export function screwQuarterGeo(r, sw, h) {
  const e = sw / 2, k = Math.sqrt(r * r - e * e);
  const s = new THREE.Shape(); s.moveTo(e, e); s.lineTo(k, e); s.absarc(0, 0, r, Math.asin(e / r), Math.PI / 2 - Math.asin(e / r), false); s.lineTo(e, e);
  const b = Math.min(0.0006, h * 0.3);
  const g = new THREE.ExtrudeGeometry(s, { depth: h - b, bevelEnabled: true, bevelSize: b, bevelOffset: -b, bevelThickness: b, bevelSegments: 3, curveSegments: 12 });
  g.rotateX(-Math.PI / 2); g.translate(0, b, 0); // standing on y = 0, its top at y = h
  return g;
}

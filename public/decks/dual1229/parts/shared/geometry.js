// Geometry helpers every subsystem of the Dual 1229 may use. Shared: ask the integrator before
// changing one (see OWNERS.md); add a helper of your own in your subsystem's folder instead.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lathe } from '../../../../deck3d/hardware.js';

export const TAU = Math.PI * 2;
export const D = Math.PI / 180;
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export { lathe, RoundedBoxGeometry };

// A spur gear lying flat, thickness along y. gap: teeth left out (the main cam's neutral gap).
export function gearGeo(r, teeth, t, gap = 0, hole = 0) {
  const s = new THREE.Shape(), m = (TAU * r) / teeth, h = m * 0.55;
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const k = Math.floor(i / 4), ph = i % 4, a = ((k + [0, 0.25, 0.5, 0.75][ph]) / teeth) * TAU;
    const missing = gap > 0 && (k < gap / 2 || k >= teeth - gap / 2);
    const rr = missing ? r - h * 0.6 : ph === 1 || ph === 2 ? r + h * 0.45 : r - h * 0.55;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  if (hole) { const p = new THREE.Path(); p.absarc(0, 0, hole, 0, TAU, true); s.holes.push(p); }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(Math.PI / 2); g.translate(0, t / 2, 0);
  return g;
}
// A flat plate from an outline in the x-z plane, thickness t, centred on y = 0.
// A round hole must run the opposite way round to the outline, or ExtrudeGeometry winds its wall
// inside out (lit from inside, and counted as added material). Which way the outline runs depends
// on the caller, so ask it.
const holeWay = (shape) => !THREE.ShapeUtils.isClockWise(shape.getPoints());
export function plateGeo(pts, t, holes = []) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))), cw = holeWay(s);
  for (const [hx, hz, hr] of holes) { const p = new THREE.Path(); p.absarc(hx, -hz, hr, 0, TAU, cw); s.holes.push(p); }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelSize: 0.0003, bevelThickness: 0.0003, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, -t / 2, 0);
  return g;
}
// A flat bar of width w, length len along +x from its start, thickness t.
export function barGeo(len, w, t) { const g = new RoundedBoxGeometry(len, t, w, 2, Math.min(w, t) * 0.3); g.translate(len / 2, 0, 0); return g; }
// Point an object (drawn along +x) from (x0, z0) toward (x1, z1).
export function aim(obj, x0, z0, x1, z1) { obj.position.x = x0; obj.position.z = z0; obj.rotation.y = -Math.atan2(z1 - z0, x1 - x0); }
// Stretch a unit-length rod (a cylinder of height 1 along y) between two points.
export function rodBetween(mesh, a, b) {
  const d = b.clone().sub(a), len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
}
export function helixGeo(len, r, turns, wire) {
  const pts = [];
  for (let i = 0; i <= turns * 16; i++) { const a = (i / 16) * TAU; pts.push(V3(Math.cos(a) * r, (i / (turns * 16)) * len, Math.sin(a) * r)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 16, wire, 6, false);
}
// A round knob of radius r and height h, standing on y = 0, with a small bevel on top.
export const knobGeo = (r, h) => lathe([[r, 0], [r, h - 0.0012], [r - 0.0012, h], [0, h]], 48);


// ---- bent sheet metal ------------------------------------------------------------------------------
// A pressed or bent steel part: a flat base plate with flanges folded up or down along straight bend
// lines, each flange able to carry flanges of its own. This is how a bracket's turned-up edge, a
// joggle (two opposite bends close together), an offset (a joggle of 90° bends) or a bent-up tab or ear
// is made. The bends are drawn as real curved strips of inner radius r, so the part reads as bent
// metal rather than as glued plates.
//
//   sheetGeo({ outline, t, holes, flanges })
//     outline  [[x, z], ...]  the base plate in plan, as plateGeo (its midsurface at y = 0)
//     t        thickness (m)
//     holes    [[x, z, r], ...] round holes, as plateGeo, or [[x, z], [x, z], ...] polygon holes (slots)
//     flanges  [flange, ...]
//   flange = { edge: [[x0, z0], [x1, z1]], angle, r, outline, holes, flanges }
//     edge     the bend line, a straight piece of the parent's outline, in the parent's flat frame
//     angle    fold angle (rad): + folds toward the parent's +y (up for the base), - toward -y
//     r        inner bend radius (default t)
//     outline  the flange in its own flat frame: [u, v], u along the edge from edge[0], v straight out
//              from the bend line (v >= 0, away from the parent's interior). Default: the full edge,
//              len v (see `len`).
//     len      shortcut: a rectangular flange the length of the edge, len deep
//     holes    [[u, v, r], ...] in the flange's frame
//     flanges  children, their edges in this flange's flat frame ([u, v] pairs)
// Returns one BufferGeometry in the base plate's frame (as plateGeo: y up, midsurface at y = 0).
// Each flange's length along v is its flat length beyond the bend; the bend itself adds its arc.
export function sheetGeo({ outline, t, holes = [], flanges = [] }) {
  const parts = [];
  panel(outline, holes, t, new THREE.Matrix4(), flanges, parts);
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  for (const g of parts) g.dispose();
  return merged;
}
// One flat panel, given in its own flat frame [a, b] -> (x = a, z = b), placed by matrix m.
function panel(pts, holes, t, m, flanges, out) {
  const s = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, -b))), cw = holeWay(s);
  for (const h of holes) {
    if (Array.isArray(h[0])) { // a polygon hole: wound opposite to the outline, as the round ones
      let q = h.map(([a, b]) => new THREE.Vector2(a, -b));
      if (THREE.ShapeUtils.isClockWise(q) !== cw) q = q.reverse();
      s.holes.push(new THREE.Path(q));
    } else { const [hx, hz, hr] = h, p = new THREE.Path(); p.absarc(hx, -hz, hr, 0, TAU, cw); s.holes.push(p); }
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 16 });
  g.rotateX(-Math.PI / 2); g.translate(0, -t / 2, 0); g.applyMatrix4(m);
  out.push(g);
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  for (const f of flanges) flange(f, t, m, [cx, cz], out);
}
function flange(f, t, parent, centroid, out) {
  const [[x0, z0], [x1, z1]] = f.edge, len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 1e-9) throw new RangeError('Sheet flange edge has no length');
  // u along the edge; v outward (away from the parent's centroid). Keep (u, y, v) right-handed:
  // v must be u x y, so run u the other way when the outward side is the other one.
  let ux = (x1 - x0) / len, uz = (z1 - z0) / len, ox = x0, oz = z0, flip = false;
  const vx = -uz, vz = ux; // u x y for u in the xz-plane (x right, z toward the viewer, y up)
  if ((centroid[0] - x0) * vx + (centroid[1] - z0) * vz > 0) { ux = -ux; uz = -uz; ox = x1; oz = z1; flip = true; }
  const vX = -uz, vZ = ux;
  const r = f.r ?? t, A = Math.abs(f.angle), sgn = Math.sign(f.angle) || 1, R = r + t / 2;
  let outline = f.outline ?? [[0, 0], [len, 0], [len, f.len], [0, f.len]];
  let holes = f.holes ?? [];
  if (flip) { outline = outline.map(([u, v]) => [len - u, v]).reverse(); holes = holes.map((h) => (Array.isArray(h[0]) ? h.map(([u, v]) => [len - u, v]) : [len - h[0], h[1], h[2]])); }
  const atEdge = outline.filter(([, v]) => Math.abs(v) < 1e-9).map(([u]) => u);
  const u0 = Math.min(...(atEdge.length ? atEdge : outline.map(([u]) => u))), u1 = Math.max(...(atEdge.length ? atEdge : outline.map(([u]) => u)));
  // the bend: a ring sector about the bend axis, swept along u from u0 to u1
  if (A > 1e-9) {
    const sec = new THREE.Shape(), cy = sgn * R, a0 = sgn > 0 ? -Math.PI / 2 : Math.PI / 2, a1 = a0 + sgn * A;
    sec.absarc(0, cy, r + t, a0, a1, sgn < 0); sec.absarc(0, cy, r, a1, a0, sgn > 0);
    const bend = new THREE.ExtrudeGeometry(sec, { depth: u1 - u0, bevelEnabled: false, curveSegments: Math.max(4, Math.ceil(A / (Math.PI / 24))) });
    // shape x -> v, shape y -> y, extrusion z -> -u (right-handed), starting at u1
    const mb = new THREE.Matrix4().makeBasis(V3(vX, 0, vZ), V3(0, 1, 0), V3(-ux, 0, -uz)).setPosition(ox + ux * u1, 0, oz + uz * u1);
    bend.applyMatrix4(mb); bend.applyMatrix4(parent); out.push(bend);
  }
  // the flange's own frame: origin at the bend's end on the midsurface; x along u, z along the folded v
  const ex = R * Math.sin(A), ey = sgn * R * (1 - Math.cos(A));
  const v2 = V3(vX * Math.cos(A), sgn * Math.sin(A), vZ * Math.cos(A)), n2 = V3(-vX * sgn * Math.sin(A), Math.cos(A), -vZ * sgn * Math.sin(A));
  const m = new THREE.Matrix4().makeBasis(V3(ux, 0, uz), n2, v2).setPosition(ox + vX * ex, ey, oz + vZ * ex);
  panel(outline, holes, t, parent.clone().multiply(m), flip ? (f.flanges ?? []).map((c) => ({ ...c, edge: c.edge.map(([u, v]) => [len - u, v]) })) : (f.flanges ?? []), out);
}

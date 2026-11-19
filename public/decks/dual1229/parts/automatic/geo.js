// Shapes for the automatic's stampings and the main cam: flat plates with any outline and any
// holes or slots, straps along a polyline with rounded ends, arc bands. Points are (x, z) pairs in
// metres in whatever frame the caller draws in; plates lie flat, thickness along y, centred on y = 0.
// Owned by the automatic builder (see OWNERS.md).
import * as THREE from 'three';

const TAU = Math.PI * 2;

// A flat plate from an outline [[x, z], ...] with holes (each an outline, or [x, z, r] for a round
// one), thickness t, a small bevel so the edges catch the light like a stamping's.
export function plate(outline, t, holes = [], bevel = 0.00025) {
  const b = Math.min(bevel, t * 0.3);
  const s = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  // the bevel is set inward (bevelOffset -b) so the outline stays exact; that closes the holes in by b, so they are
  // drawn b larger to stay exact too
  for (const h of holes) {
    const p = new THREE.Path();
    if (h.length === 3 && typeof h[0] === 'number') p.absarc(h[0], -h[1], h[2] + b, 0, TAU, true);
    else { const area = h.reduce((a, q, i) => { const r = h[(i + 1) % h.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0); p.setFromPoints(offsetLoop(h, area > 0 ? b : -b).map(([x, z]) => new THREE.Vector2(x, -z))); } // ExtrudeGeometry sets the winding itself
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: t - 2 * b, bevelEnabled: b > 0, bevelSize: b, bevelOffset: -b, bevelThickness: b, bevelSegments: 1, curveSegments: 12 }); // the bevel rounds the edges inward: the outline stays exact
  g.rotateX(-Math.PI / 2); g.translate(0, -(t - 2 * b) / 2, 0);
  return g;
}

// The outline of a strap of width w along a polyline, mitred at the bends, round at both ends.
export function strap(pts, w, capSegs = 8) {
  const n = pts.length, h = w / 2, left = [], right = [];
  const dir = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; };
  for (let i = 0; i < n; i++) {
    const d0 = i > 0 ? dir(pts[i - 1], pts[i]) : dir(pts[0], pts[1]);
    const d1 = i < n - 1 ? dir(pts[i], pts[i + 1]) : d0;
    let mx = d0[0] + d1[0], mz = d0[1] + d1[1]; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = h / Math.max(0.35, mx * d0[0] + mz * d0[1]); // mitre length
    const nx = -mz, nz = mx;
    left.push([pts[i][0] + nx * k, pts[i][1] + nz * k]); right.push([pts[i][0] - nx * k, pts[i][1] - nz * k]);
  }
  const out = [...left];
  const cap = (c, d, sgn) => { const a0 = Math.atan2(d[1], d[0]); for (let j = 1; j < capSegs; j++) { const a = a0 + sgn * (Math.PI / 2 - (Math.PI * j) / capSegs); out.push([c[0] + Math.cos(a) * h, c[1] + Math.sin(a) * h]); } };
  cap(pts[n - 1], dir(pts[n - 2], pts[n - 1]), 1);
  for (let i = n - 1; i >= 0; i--) out.push(right[i]);
  cap(pts[0], dir(pts[1], pts[0]), 1);
  return out;
}

// A band between radii r0 and r1 from angle a0 to a1 (radians, atan2(z, x)) about (cx, cz), with
// round ends: a slot or a curved finger.
export function arcBand(cx, cz, r0, r1, a0, a1, n = 24, round = true) {
  const out = [], rm = (r0 + r1) / 2, h = (r1 - r0) / 2, sg = Math.sign(a1 - a0) || 1;
  const cap = (a, flip) => { // round end at angle a, from the outer edge to the inner (or back)
    const ux = Math.cos(a), uz = Math.sin(a), tx = -uz * sg * flip, tz = ux * sg * flip, ex = cx + ux * rm, ez = cz + uz * rm, k = flip;
    for (let j = 1; j < 8; j++) { const f = (Math.PI * j) / 8; out.push([ex + h * (k * ux * Math.cos(f) + tx * Math.sin(f)), ez + h * (k * uz * Math.cos(f) + tz * Math.sin(f))]); }
  };
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * r1, cz + Math.sin(a) * r1]); }
  if (round) cap(a1, 1);
  for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * r0, cz + Math.sin(a) * r0]); }
  if (round) cap(a0, -1);
  return out;
}

export const circle = (cx, cz, r, n = 32) => { const o = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; o.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return o; };

// A closed loop offset sideways by d (positive: outward for a counter-clockwise loop in x-z seen
// from above, where "counter-clockwise" means increasing atan2(z, x)).
export function offsetLoop(pts, d) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    out.push([pts[i][0] + tz * d, pts[i][1] - tx * d]);
  }
  return out;
}

// A flat ring (annulus) with notches cut into its outer edge: [{ a, half, r }] (angle, half-width, radius).
export function ring(r0, r1, n = 96, notches = []) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    let r = r1;
    for (const k of notches) { const d = Math.atan2(Math.sin(a - k.a), Math.cos(a - k.a)); if (Math.abs(d) < k.half) r = k.r; }
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return { outline: out, hole: circle(0, 0, r0, n) };
}

// A spur gear's toothed rim lying flat (thickness t along y, centred on y = 0), its bore a smooth
// circle of radius hole: the shared gearGeo's bore is only a few segments round. gap: teeth left
// out round angle 0 (+x), the main cam's neutral gap. The tooth form follows the shared gearGeo.
export function gearRim(r, teeth, t, gap, hole) {
  const s = new THREE.Shape(), m = (TAU * r) / teeth, h = m * 0.55, n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const k = Math.floor(i / 4), ph = i % 4, a = ((k + [0, 0.25, 0.5, 0.75][ph]) / teeth) * TAU;
    const missing = gap > 0 && (k < gap / 2 || k >= teeth - gap / 2);
    const rr = missing ? r - h * 0.6 : ph === 1 || ph === 2 ? r + h * 0.45 : r - h * 0.55;
    const x = Math.cos(a) * rr, y = -Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.holes.push(new THREE.Path(circle(0, 0, hole, 144).map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, -t / 2, 0);
  return g;
}

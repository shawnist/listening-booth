// The changer's records, drawn from the mechanism's snapshot (changer-contact.js is the authority):
// the stack on the AW 3 spindle's supports (or held one record up by its retainers during a drop),
// a record falling, and the pile the changer has dropped on the platter. Plain records: black vinyl
// with a coloured label. They carry no sound (core.js BLANK).
//
// buildRecordStack(kit, { fixed, turning }) -> update(s)
//   fixed: a group that does not turn (the AW 3 spindle's own group); turning: turns with the platter.
import * as THREE from 'three';
import { Y_REC } from '../../../../deck3d/layout.js';
import { AW3, RECORD_R, baseTop } from '../../changer-contact.js';

const LABEL_R = 0.0505; // 101 mm label (standard 100-103 mm: standard)
const LABELS = [0xb8372f, 0x2f5fa8, 0xd7b23a, 0x3c8a4f, 0x8a3c86, 0xe07b2a];

export function buildRecordStack(kit, { fixed, turning }) {
  const vinyl = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const labelMats = LABELS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
  for (const m of [vinyl, ...labelMats]) { m.userData.xray = 0.15; kit.ghosts.push(m); } // see through them in X-ray, like the platter
  const geos = {};
  const discGeo = (size) => {
    if (geos[size]) return geos[size];
    const R = RECORD_R[size], T = AW3.recordT, h = AW3.holeR, e = 0.0005;
    // a flat disc: the hole, a slightly rounded edge bead
    const pts = [[h, 0], [R - e, 0], [R, e], [R, T - e], [R - e, T], [h, T], [h, 0]].map(([r, y]) => new THREE.Vector2(r, y));
    const lab = new THREE.RingGeometry(h, Math.min(LABEL_R, R - 0.004), 64); lab.rotateX(-Math.PI / 2);
    return (geos[size] = { body: new THREE.LatheGeometry(pts, 128), label: lab });
  };
  const meshes = new Map(); // record id -> group
  const make = (rec) => {
    const g = new THREE.Group(), d = discGeo(rec.size);
    g.add(new THREE.Mesh(d.body, vinyl));
    const lm = labelMats[(rec.id - 1) % labelMats.length];
    const top = new THREE.Mesh(d.label, lm); top.position.y = AW3.recordT + 0.00004; g.add(top);
    const bot = new THREE.Mesh(d.label, lm); bot.rotation.x = Math.PI; bot.position.y = -0.00004; g.add(bot);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    kit.name(`changerRecord${rec.id}`, g);
    meshes.set(rec.id, g);
    return g;
  };
  let recordSurface = Y_REC;
  const place = (rec, parent, y, turn = 0) => {
    const g = meshes.get(rec.id) || make(rec);
    if (g.parent !== parent) parent.add(g);
    g.position.set(0, recordSurface + y, 0); g.rotation.y = turn; g.visible = true;
  };
  const turnOf = new Map(); // a record that lands keeps the angle it fell at, relative to the platter
  return function update(s) {
    const c = s.changer; if (!c) return;
    recordSurface = Number.isFinite(s.recordSurface) ? s.recordSurface : Y_REC;
    const seen = new Set();
    for (const r of c.spindle) { place(r, fixed, r.y); seen.add(r.id); }
    for (const r of c.falling) { place(r, fixed, r.y); seen.add(r.id); }
    const base = baseTop(c.platterRecord), TAU = Math.PI * 2;
    for (const r of c.pile) {
      if (!turnOf.has(r.id)) turnOf.set(r.id, (s.platterTurns || 0) * TAU); // undo platSpin's turn at landing
      place(r, turning, base + r.i * AW3.recordT, turnOf.get(r.id)); seen.add(r.id);
    }
    for (const [id, g] of meshes) if (!seen.has(id)) { g.visible = false; turnOf.delete(id); }
  };
}

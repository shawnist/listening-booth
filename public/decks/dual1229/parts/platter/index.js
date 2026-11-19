// Platter, mat and spindles of the Dual 1229: the one-piece zinc platter casting (4) with its
// satin-bright rim band, its ribbed grey underside, the drive wall the idler presses on and the
// strobe ring (225 222) fixed under it; the brass pinion PR on its hub; the bearing and its
// bracket under the dish; the rubber mat (3) with the aluminium centre disc (39); the single-play
// spindle (38), which turns with the platter, and the AW 3 changer spindle, which does not.
// Owned by the platter builder (see OWNERS.md). Sizes and heights: place.js.
//
// build(kit) -> { group, uniforms, platSpin, spin, adapter, update(dt, s), setXray(on) }
//   platSpin: turns with the platter (the deck view sets its rotation every frame);
//   spin: turns with the record (nothing of the Dual's own); uniforms: the strobe ring's.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseTexture, turnedTexture, makeCanvas, canvasTexture, mulberry } from '../../../../deck3d/textures.js';
import { Y_PLATTER, Y_MAT, Y_REC } from '../../../../deck3d/layout.js';
import { SPEC } from '../../spec.js';
import { TAU, R_PLATTER, R_RIM, GEAR, AXES } from '../../layout.js';
import { lathe, gearGeo, RoundedBoxGeometry } from '../shared/geometry.js';
import { ringGeo, StrobeRingMaterial } from './strobe.js';
import { buildRecordStack } from './record-stack.js';
import { supportOut, retainerOut, AW3_INSIDE } from '../../changer-contact.js';
import {
  WEB_Y, SKIRT, WALL_T, WALL_BOTTOM, INNER, CELLS, RIBS, BOSSES, BALANCE, POCKETS, HUB, RIM, PINION,
  STROBE_RING, BEARING, SPRING_RING, MAT, DISC, SPINDLE, CHANGER,
} from './place.js';

// A profile for a lathe with sharp corners: every point but the first and last becomes two points a
// hair apart, so the lathe's averaged normals do not round the corner off. A point given as
// [r, y, 1] stays one point (a soft corner).
function sharp(pts, b = 0.00002) {
  const out = [[pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y, soft] = pts[i];
    if (soft) { out.push([x, y]); continue; }
    for (const q of [pts[i - 1], pts[i + 1]]) {
      const dx = q[0] - x, dy = q[1] - y, L = Math.hypot(dx, dy) || 1, k = Math.min(b, L / 3) / L;
      out.push([x + dx * k, y + dy * k]);
    }
  }
  const z = pts[pts.length - 1]; out.push([z[0], z[1]]);
  return out;
}
const plainLathe = (pts, n) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 2e-5), y)), n).toNonIndexed();
// a flat rib in the r-y plane, thickness t, turned to angle a (from +x toward +z)
function ribGeo(shape, t, a) {
  const s = new THREE.Shape(shape.map(([r, y]) => new THREE.Vector2(r, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2); g.rotateY(-a);
  return g;
}
// circles of lines (X-ray outline), at [r, y] pairs
function circles(list, n = 128) {
  const p = [];
  for (const [r, y] of list) for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, b = ((i + 1) / n) * TAU;
    p.push(Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(b) * r, y, Math.sin(b) * r);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return g;
}
// Radial brushing for the centre disc: streaks that vary round the disc (u) and run along its radius.
function radialBrushTexture(seed = 5, w = 2048) {
  const c = makeCanvas(w, 4), g = c.getContext('2d'), rnd = mulberry(seed);
  let v = 0;
  for (let x = 0; x < w; x++) {
    v = v * 0.35 + (rnd() - 0.5) * 2;
    const k = Math.round(214 + v * 9 + (rnd() < 0.02 ? 8 : 0));
    g.fillStyle = `rgb(${k},${k},${k})`; g.fillRect(x, 0, 1, 4);
  }
  const t = canvasTexture(c, { srgb: true });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// The platter, mat and disc turn to glass in X-ray, and they lie over the mechanism. So that hovering
// in X-ray still names the cam or a lever through them, a glass part of ours only counts as hit where
// no solid part (one whose material does not turn to glass) is on the same line of sight.
function yieldToSolid(kit, root) {
  let solid = null;
  const glass = (m) => m.material && m.material.userData && m.material.userData.xray !== undefined;
  function raycast(raycaster, intersects) {
    const mine = []; THREE.Mesh.prototype.raycast.call(this, raycaster, mine);
    if (!mine.length) return;
    if (!solid) solid = Object.values(kit.parts).flatMap((p) => p.meshes).filter((m) => !glass(m));
    if (raycaster.intersectObjects(solid, false).length) return;
    for (const h of mine) intersects.push(h);
  }
  root.traverse((o) => { if (o.isMesh && o.userData.part && glass(o)) o.raycast = raycast; });
}

const CHANGER_T = 0.0018; // one record's thickness (deck3d REC_T)
export function build(kit) {
  const { M, add, ghost, part, mats } = kit;
  const root = kit.group('platter');
  const platSpin = new THREE.Group(); root.add(platSpin); // turns with the platter
  const spin = new THREE.Group(); root.add(spin); // turns with the record (nothing of the Dual's own)
  const RW = R_RIM + WALL_T; // outer face of the drive wall

  // ---- materials ---------------------------------------------------------------------------------------
  // D6: zinc die-casting. The underside is plain unpainted grey casting; the rim band is turned,
  // satin-bright, a little greyer and less mirror-like than polished aluminium. In the photos (P3, P4,
  // O2) the band reads light silver from every side: a near-mirror took on the dark room and read
  // charcoal, so it is half metallic and satin, lit up by the room's light (Phase 3 look review, rimC).
  const castMat = ghost(new THREE.MeshStandardMaterial({ color: 0xa4a7a9, metalness: 0.65, roughness: 0.58, bumpMap: noiseTexture(256, 23, 70, [40, 12]), bumpScale: 0.5 }), 0.12);
  const turned = turnedTexture(29, 512, 70);
  const rimMat = ghost(new THREE.MeshPhysicalMaterial({ color: 0xd6d9dc, metalness: 0.55, roughness: 0.38, envMapIntensity: 1.8, anisotropy: 0.6, bumpMap: turned, bumpScale: 0.1 }), 0.12);

  // ---- the casting: rim band, web and skirts, drive wall, ribs, strobe ring ----------------------------
  const casting = kit.name('platterBody', part('platterCasting', platSpin, { name: 'Platter, one-piece zinc-alloy casting', no: '4' }));
  // the visible band: up the outer face, the small step at its top edge, over the top to under the mat
  add(casting, lathe(sharp([
    [R_PLATTER - 0.0005, SKIRT.bottom], [R_PLATTER, SKIRT.bottom + 0.0005], [R_PLATTER, RIM.stepY], [R_PLATTER - RIM.inset, RIM.stepY],
    [R_PLATTER - RIM.inset, Y_PLATTER - RIM.chamfer], [R_PLATTER - RIM.inset - RIM.chamfer, Y_PLATTER], [MAT.r - 0.002, Y_PLATTER],
  ]), 360), rimMat);
  // the rest of the casting: the top under the mat, the bore, the hub boss, the inner plate, the
  // web's underside and the outer skirt's inside (the drive wall is its own part, below)
  add(casting, lathe(sharp([
    [MAT.r - 0.002, Y_PLATTER], [BEARING.shaftR + 0.0003, Y_PLATTER], [BEARING.shaftR + 0.0003, HUB.bottom],
    [HUB.r - 0.0012, HUB.bottom], [HUB.r, HUB.bottom + 0.0012], [HUB.r, INNER.y - 0.002], [HUB.r + 0.0006, INNER.y - 0.0006, 1], [HUB.r + 0.002, INNER.y],
    [INNER.r, INNER.y], [INNER.r + 0.0025, WEB_Y], [R_RIM, WEB_Y], [RW, WEB_Y], [SKIRT.rIn - 0.0015, WEB_Y], [SKIRT.rIn - 0.0004, WEB_Y - 0.0004, 1], [SKIRT.rIn, WEB_Y - 0.0015],
    [SKIRT.rIn, SKIRT.bottom], [R_PLATTER - 0.0005, SKIRT.bottom],
  ]), 256), castMat);
  // the drive wall (D8: inner face d 258), where the idler presses
  const wall = part('platterRim', casting);
  add(wall, lathe(sharp([
    [R_RIM - 0.0015, WEB_Y], [R_RIM - 0.0004, WEB_Y - 0.0004, 1], [R_RIM, WEB_Y - 0.0015], [R_RIM, WALL_BOTTOM + 0.0005], [R_RIM + 0.0005, WALL_BOTTOM],
    [RW - 0.0005, WALL_BOTTOM], [RW, WALL_BOTTOM + 0.0005], [RW, WEB_Y - 0.001], [RW + 0.0003, WEB_Y - 0.0003, 1], [RW + 0.001, WEB_Y],
  ]), 256), castMat);
  // ribs, cells, bosses and the pockets between the skirt walls, as one mesh
  const ribList = [];
  const ribTop = WEB_Y + 0.0004;
  for (let i = 0; i < RIBS.n; i++) {
    const a = (i / RIBS.n) * TAU;
    ribList.push(ribGeo([[HUB.r - 0.0005, ribTop], [CELLS.rOut, ribTop], [CELLS.rOut, RIBS.yOut], [INNER.r, RIBS.yOut - 0.0012], [HUB.r - 0.0005, RIBS.yHub]], RIBS.t, a));
    ribList.push(ribGeo([[CELLS.rIn, ribTop], [CELLS.rOut, ribTop], [CELLS.rOut, CELLS.y], [CELLS.rIn, CELLS.y]], RIBS.t * 0.8, a + Math.PI / RIBS.n));
  }
  for (const r of [CELLS.rIn, CELLS.rOut]) ribList.push(plainLathe([[r + 0.001, ribTop], [r + 0.001, CELLS.y], [r - 0.001, CELLS.y], [r - 0.001, ribTop]], 128));
  for (let i = 0; i < BOSSES.n; i++) {
    const a = ((i + 0.5) / BOSSES.n) * TAU, g = plainLathe([[0.0001, BOSSES.y], [BOSSES.rad - 0.0005, BOSSES.y], [BOSSES.rad, BOSSES.y + 0.0005], [BOSSES.rad, INNER.y + 0.0004]], 20);
    g.translate(Math.cos(a) * BOSSES.r, 0, Math.sin(a) * BOSSES.r); ribList.push(g);
  }
  const rp = (RW + SKIRT.rIn) / 2;
  for (let i = 0; i < POCKETS.n; i++) {
    const a = (i / POCKETS.n) * TAU, cr = POCKETS.cupR;
    const cup = plainLathe([[cr * 0.6, ribTop], [cr * 0.6, POCKETS.y + 0.001], [cr * 0.6 + 0.0005, POCKETS.y], [cr, POCKETS.y], [cr, ribTop]], 24);
    cup.translate(Math.cos(a) * rp, 0, Math.sin(a) * rp); ribList.push(cup);
    ribList.push(ribGeo([[RW - 0.0005, ribTop], [SKIRT.rIn + 0.0005, ribTop], [SKIRT.rIn + 0.0005, POCKETS.y + 0.002], [RW - 0.0005, POCKETS.y + 0.002]], 0.002, a + Math.PI / POCKETS.n));
  }
  add(casting, mergeGeometries(ribList.map((g) => (g.index ? g.toNonIndexed() : g))), castMat);
  // two balancing holes, marked with yellow paint (V-RI 2:52)
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1c, metalness: 0.3, roughness: 0.8 });
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xd8b234, metalness: 0, roughness: 0.7 });
  for (const a of BALANCE.a) {
    const x = Math.cos(a) * BALANCE.r, z = Math.sin(a) * BALANCE.r;
    const paint = add(casting, new THREE.CircleGeometry(BALANCE.rad * 1.7, 20), paintMat, x + 0.002, INNER.y - 0.00008, z); paint.rotation.x = Math.PI / 2; paint.scale.set(1, 0.7, 1);
    const hole = add(casting, new THREE.CircleGeometry(BALANCE.rad, 20), holeMat, x, INNER.y - 0.00016, z); hole.rotation.x = Math.PI / 2;
  }

  // The strobe ring, glued to the flat annulus under the web. The displayed 216/160
  // counts below remain rendering assumptions, not counts verified from an original ring.
  // Plain 1229 manual p.5 Fig.7 also leaves the effective optical flash rate unresolved.
  const SU = {
    uTrue: { value: new THREE.Vector4(0, 0, 0, 0) }, uStrobe: { value: new THREE.Vector4(0, 0, 0, 0) },
    uLampU: { value: ((Math.PI / 2 - AXES.strobe.a) / TAU + 2) % 1 }, // where the neon lights the ring (D16)
  };
  const ringMat = ghost(new StrobeRingMaterial({ color: 0xdedad0, metalness: 0, roughness: 0.82 }, SU, STROBE_RING.rows), 0.2);
  add(part('strobeRing', casting, { name: 'Stroboscope ring (60 Hz: 216 bars for 33, 160 for 45)', no: '225 222' }), ringGeo(STROBE_RING.rIn, STROBE_RING.rOut, WEB_Y - STROBE_RING.t), ringMat);

  // X-ray outline: the corners of the casting, and the strobe ring
  const platterEdges = new THREE.LineSegments(circles([[R_RIM, WALL_BOTTOM], [R_RIM, WEB_Y], [R_PLATTER, SKIRT.bottom], [R_PLATTER, Y_PLATTER], [STROBE_RING.rIn, WEB_Y], [STROBE_RING.rOut, WEB_Y]]),
    new THREE.LineBasicMaterial({ color: 0x9fc3ff, transparent: true, opacity: 0.4 }));
  platterEdges.visible = false; root.add(platterEdges);

  // ---- the mat (D13): black rubber, raised lip, raised 7" and 10" rings, ridges between ------------------
  const yR = Y_MAT - MAT.ridgeDrop, yG = Y_MAT - MAT.grooveDrop, yD = Y_MAT - MAT.ringDrop;
  const top = []; // the mat's top, from the outer edge inward (so its normals face up)
  const ridges = (r1, r0) => { // ridges from r1 in to r0, starting and ending in a groove
    const n = Math.max(1, Math.round((r1 - r0) / MAT.pitch)), p = (r1 - r0) / n;
    for (let i = 0; i < n; i++) {
      const a = r1 - i * p;
      top.push([a - p * 0.18, yG, 1], [a - p * 0.32, yR, 1], [a - p * 0.68, yR, 1], [a - p * 0.82, yG, 1]);
    }
  };
  const flat = (r1, r0) => top.push([r1, yG, 1], [r1 - 0.0004, yD, 1], [r1 - 0.0012, yD, 1], [r1 - 0.0018, Y_MAT - 0.0002, 1], [r0 + 0.0018, Y_MAT - 0.0002, 1], [r0 + 0.0012, yD, 1], [r0 + 0.0004, yD, 1], [r0, yG, 1]); // a smooth raised ring between two deeper grooves
  top.push([MAT.r, Y_MAT - 0.0011, 1], [MAT.r - 0.0004, Y_MAT - 0.0003, 1], [MAT.r - 0.0012, Y_MAT, 1], [MAT.r - MAT.lip + 0.0016, Y_MAT, 1], [MAT.r - MAT.lip + 0.0008, yD, 1], [MAT.r - MAT.lip, yD, 1], [MAT.r - MAT.lip - 0.0004, yG, 1]);
  ridges(MAT.r - MAT.lip - 0.0004, MAT.rings[1][1]); flat(MAT.rings[1][1], MAT.rings[1][0]);
  ridges(MAT.rings[1][0], MAT.rings[0][1]); flat(MAT.rings[0][1], MAT.rings[0][0]);
  ridges(MAT.rings[0][0], MAT.hole + 0.0012);
  top.push([MAT.hole + 0.0004, Y_MAT - 0.0004, 1]);
  const matPts = [[MAT.hole, Y_PLATTER], [MAT.r - 0.0006, Y_PLATTER], [MAT.r, Y_PLATTER + 0.0006], ...top, [MAT.hole, Y_MAT - 0.0012], [MAT.hole, Y_PLATTER]];
  const matMat = ghost(new THREE.MeshStandardMaterial({ color: 0x161617, metalness: 0, roughness: 0.84, bumpMap: noiseTexture(256, 41, 90, [90, 3]), bumpScale: 0.2 }), 0.1);
  const mat = kit.name('mat', part('mat', platSpin, { name: 'Platter mat, rubber', no: '3' }));
  add(mat, lathe(sharp(matPts), 224), matMat);
  // the centre disc (39): radially brushed aluminium, d 108, set in the mat's centre
  const brush = radialBrushTexture();
  const discMat = ghost(new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: brush, metalness: 0.85, roughness: 0.34, anisotropy: 0.45, anisotropyRotation: Math.PI / 2, bumpMap: brush, bumpScale: 0.03 }), 0.12);
  const discTop = Y_MAT - DISC.sink;
  const disc = kit.name('centreDisc', part('centreDisc', mat, { name: 'Centre disc, brushed aluminium', no: '39' }));
  add(disc, lathe(sharp([[SPRING_RING.rIn, discTop - DISC.t], [DISC.r - 0.0003, discTop - DISC.t], [DISC.r, discTop - DISC.t + 0.0003], [DISC.r, discTop - 0.0002], [DISC.r - 0.0003, discTop], [SPRING_RING.rIn, discTop]]), 192), discMat);
  const fill = add(mat, lathe([[MAT.hole + 0.0002, Y_PLATTER], [MAT.hole + 0.0002, discTop - DISC.t], [0.004, discTop - DISC.t]], 96), matMat); // rubber under the disc
  fill.castShadow = false;

  // ---- spindles (D18) -------------------------------------------------------------------------------------
  const spindles = new THREE.Group(); platSpin.add(spindles); kit.name('spindles', spindles);
  // the single-play spindle (38, "Mitlaufachse"): friction fit in the platter, so it turns with it
  const spTop = Y_REC + SPINDLE.above, r = SPINDLE.r;
  const spindle = kit.name('spindle', part('spindle', spindles, { name: 'Single-play spindle (turns with the platter)', no: '38 (201 101)' }));
  add(spindle, lathe(sharp([[0.0001, Y_PLATTER - 0.012], [r, Y_PLATTER - 0.012], [r, spTop - 0.0062], [r - 0.0004, spTop - 0.0058], [r - 0.0004, spTop - 0.0052], [r, spTop - 0.0048],
    [r, spTop - 0.0038], [r - 0.0004, spTop - 0.0034], [r - 0.0004, spTop - 0.0028], [r, spTop - 0.0024], [r, spTop - 0.0012], [r - 0.0005, spTop - 0.0003, 1], [r - 0.0013, spTop, 1], [0.0001, spTop]]), 40), M.chrome);
  // the AW 3 changer spindle (213 895; the manual's text calls it AU 3), for "multi": locked to the
  // chassis, so it does not turn. It stands in the platter's centre: undo platSpin's turn each frame.
  // Its three supports and three retainers move with its rod (changer-contact.js, AW3_INSIDE: E).
  const changer = kit.name('changer', part('changer', spindles, { name: 'Changer spindle AW 3 (does not turn)', no: '213 895' }));
  changer.visible = false;
  const cTop = Y_REC + CHANGER.top, c0 = Y_REC + CHANGER.collar[0], c1 = Y_REC + CHANGER.collar[1], cs = Y_REC + CHANGER.support;
  add(changer, lathe(sharp([[0.0001, Y_PLATTER - 0.012], [r, Y_PLATTER - 0.012], [r, cTop - 0.0045], [r + 0.0006, cTop - 0.0038], [r + 0.0006, cTop - 0.0012], [r + 0.0001, cTop - 0.0003, 1], [r - 0.0009, cTop, 1], [0.0001, cTop]]), 40), M.chrome);
  add(changer, lathe(sharp([[r - 0.0002, c0], [r + 0.0008, c0], [r + 0.0013, c0 + 0.0008], [r + 0.0013, c1 - 0.0005], [r + 0.0008, c1], [r - 0.0002, c1]]), 40), M.aluBright); // the collar
  // the three supports the stack rests on (manual p.15: "die drei Stützen"), and three retainers one
  // record higher that come out between the bottom record and the next while the bottom one drops (E)
  const blade = (y, a, mat) => {
    const g = new THREE.Group(); g.rotation.y = -a; changer.add(g);
    const len = 0.0026, m = add(g, new RoundedBoxGeometry(len, 0.0012, 0.0016, 2, 0.0003), mat, 0, y, 0);
    return (out) => { m.position.x = r - len / 2 + out; }; // tip at r + out; drawn in, flush inside the spindle
  };
  const supports = [], retainers = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.3;
    supports.push(blade(cs - 0.0006, a, M.dark));
    retainers.push(blade(cs + CHANGER_T + 0.0008, a + Math.PI / 3, M.dark));
  }
  for (const f of supports) f(AW3_INSIDE.supportOut);
  for (const f of retainers) f(0);
  const stack = buildRecordStack(kit, { fixed: changer, turning: platSpin });
  // the retaining ring (40) on the centre disc round the spindle; it holds the platter on its shaft
  const retainingRing = part('springRing', platSpin, { name: 'Retaining ring (Sprengring)', no: '40' });
  add(retainingRing, lathe(sharp([[SPRING_RING.rIn, discTop], [SPRING_RING.rOut - 0.0003, discTop], [SPRING_RING.rOut, discTop + 0.0002], [SPRING_RING.rOut - 0.0002, discTop + SPRING_RING.t], [SPRING_RING.rIn, discTop + SPRING_RING.t]]), 48), M.darkTurned);
  // The broad foot sits on the centre disc. The underside recess clears the
  // retaining ring around the single-play spindle. Profile dimensions are estimates.
  const adapterMount = part('singlePlayAdapter', platSpin, { name: 'Large-hole single-play centering adapter', no: '37 (220 213)' });
  const adapter = add(adapterMount, lathe([
    [0.0188, 0.0046], [0.0186, 0.0064], [0.0174, 0.0071], [0.004, 0.0068],
    [0.0038, 0.0065], [0.0038, 0.002], [0.008, 0.002],
  ], 64), M.aluBright, 0, discTop, 0);
  // Dual's accessory catalogue shows a dark lower band beneath the bright face.
  add(adapter, lathe([[0.008, 0.002], [0.008, 0], [0.0188, 0], [0.0188, 0.0046]], 64), M.darkTurned);
  adapter.visible = false;

  // ---- under the dish: the brass pinion PR on the hub (D10), the shaft, the bearing and its bracket -----
  const hub = part('hubGear', root); hub.position.y = GEAR.hubY;
  const pinionLen = PINION.top - PINION.bottom;
  add(hub, gearGeo(GEAR.pinionR, SPEC.pinionTeeth, pinionLen, 0, PINION.bore), mats.brass(), 0, (PINION.top + PINION.bottom) / 2 - GEAR.hubY, 0);
  const B = BEARING;
  const bracket = part('bearing', root, { name: 'Bearing bridge with stationary hollow tube', no: '171 (219 096)' });
  const shaft = kit.name('bearingTube', part('bearing', root));
  const annulus = (ri, ro, lo, hi) => lathe(sharp([[ri, lo], [ro, lo], [ro, hi], [ri, hi], [ri, lo]]), 48);
  add(shaft, annulus(B.boreR, B.shaftR, B.shaftBottom, B.shaftTop), mats.steel());
  add(bracket, annulus(B.boreR, B.bushR, B.bushBottom, B.bushTop), mats.zinc());
  // the bracket: a pressed-steel strap, flat under the bush, rising at each end to a screwed tab. The
  // strap's bevel grows its outline by bevelR, so the tabs are set that much (and a hair) lower: their
  // tops then sit flat under the dish floor instead of running into it.
  const bevelR = 0.0003, t = B.plateT, yT = B.floorY - t / 2 - bevelR - 0.00005, tabUnder = yT - t / 2 - bevelR;
  // Two arms meet the bored central boss; no plate closes the changer's through passage.
  for (const side of [-1, 1]) {
    const line = [[B.bushR - 0.0005, B.plateY], [B.flat, B.plateY], [B.rise, yT], [B.tabEnd, yT]].map(([s, y]) => [s * side, y]);
    const strap = new THREE.Shape([...line.map(([s, y]) => new THREE.Vector2(s, y + t / 2)), ...line.slice().reverse().map(([s, y]) => new THREE.Vector2(s, y - t / 2))]);
    const strapGeo = new THREE.ExtrudeGeometry(strap, { depth: B.width - 2 * bevelR, bevelEnabled: true, bevelSize: bevelR, bevelThickness: bevelR, bevelSegments: 1 });
    strapGeo.translate(0, 0, -(B.width - 2 * bevelR) / 2); strapGeo.rotateY(-B.axis);
    add(bracket, strapGeo, mats.zinc());
  }
  // Ball bearing 169 supports the rotating hub on the stationary bridge. The factory drawing
  // establishes races/balls and the axial arrangement; the ball count and dimensions are E.
  const thrust = kit.name('platterThrustBearing', part('thrustBearing', root, { name: 'Platter thrust ball bearing', no: '169 (200 554)' }));
  const T = B.thrust, raceT = (T.top - T.bottom - T.ballR * 2) / 2;
  add(thrust, annulus(T.rIn, T.rOut, T.bottom, T.bottom + raceT), mats.steel());
  add(thrust, annulus(T.rIn, T.rOut, T.top - raceT, T.top), mats.steel());
  const cage = kit.name('platterBearingCage', part('thrustBearing', thrust));
  for (let i = 0; i < T.balls; i++) {
    const a = i * TAU / T.balls, r = (T.rIn + T.rOut) / 2;
    add(cage, new THREE.SphereGeometry(T.ballR, 12, 8), mats.steel(), r * Math.cos(a), (T.top + T.bottom) / 2, r * Math.sin(a));
  }
  for (const s of [-1, 1]) { // a screw head under each tab
    const d = s * (B.tabEnd - 0.006);
    add(bracket, new THREE.CylinderGeometry(0.0028, 0.0028, 0.0014, 16), mats.steel(), Math.cos(B.axis) * d, tabUnder - 0.00075, Math.sin(B.axis) * d);
  }

  yieldToSolid(kit, root);

  function update(dt, s) {
    const multi = s.mode === 'multi', ins = s.changer ? s.changer.inserted : multi;
    spindle.visible = !ins; changer.visible = ins;
    adapterMount.visible = !ins;
    const rod = s.changer ? s.changer.rod : 0;
    for (const f of supports) f(supportOut(rod));
    for (const f of retainers) f(retainerOut(rod));
    stack(s);
    changer.rotation.y = s.platterTurns * TAU; // AW 3 is locked to the chassis: undo the platter's turn
    hub.rotation.y = -s.platterTurns * TAU;
    cage.rotation.y = -s.platterTurns * TAU / 2; // ideal thrust bearing, lower race fixed / upper race rotating
  }
  function setXray(on) { platterEdges.visible = on; }
  // published for the outside builder's strobe window (OWNERS.md): where the bars are and how they are lit
  kit.anchors.strobeRing = { uniforms: SU, rIn: STROBE_RING.rIn, rOut: STROBE_RING.rOut, y: WEB_Y - STROBE_RING.t, rows: STROBE_RING.rows };
  return { group: root, uniforms: SU, platSpin, spin, adapter, retainingRing, update, setXray };
}

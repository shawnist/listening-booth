// Drive: the speed bracket 104 under the speed lever, the switching segment 102 on its shaft, the
// switch lever assembly (rocker) 134 with its pin in the segment's slot, and the steel link that
// lifts the idler bracket; the clips 122 on the rocker's pivot pin and the spring 123 that holds its
// pin down in the slot. The small parts on the shaft (detent, springs, regulator): selector.js.
// Owned by the drive builder (see OWNERS.md).
import * as THREE from 'three';
import { D } from '../../layout.js';
import { plateGeo, RoundedBoxGeometry } from '../shared/geometry.js';
import { SPEED_AXIS as S0, SEG, LINK, SPEED_BRACKET as SB, ROCKER, SWING_BEARING, ROCKER_ANCHOR, DETENT, SPRING123 } from './place.js';
import { PIN_LENGTH } from './kinematics.js';
import { LIFT_OFF, liftOffRadius } from './component-profile.js';
import { channelGeometry } from './slot-geometry.js';
import { buildSelector, blockHoles, ringGeo, coilGeo, slab } from './selector.js';

const PLATE_UNDER = -0.0015; // underside of the chassis plate (layout.js PLATE.t)

export function buildSpeed(kit, root) {
  const { add, part, mat, mats } = kit;
  const zinc = mats.zinc(); zinc.side = THREE.DoubleSide;
  const steel = mats.steel();

  // ---- the speed bracket 104: die-cast, screwed under the plate ----------------------------------------
  const br = part('speedBracket', root, { name: 'Speed bracket (switching segment carrier)', no: '104' });
  add(br, plateGeo(SB.outline, SB.t - 0.0006), zinc, 0, PLATE_UNDER - SB.t / 2, 0); // (its 0.3 mm bevels make up SB.t)
  const screw = new THREE.CylinderGeometry(0.0026, 0.0026, 0.0012, 16);
  const screws = part('speedScrews', root, { name: 'Machine screw AM 3 x 5 (speed bracket to chassis)', no: '105' });
  for (const [x, z] of SB.screws) add(screws, screw, steel, x, PLATE_UNDER - SB.t - 0.0006 - 0.00001, z);
  // a leg behind the segment (away from the rocker) down to the lower block that holds the shaft's end
  const legA = SB.legA * D, ca = Math.cos(legA), sa = Math.sin(legA), lx = S0.x + ca * SB.legR, lz = S0.z + sa * SB.legR;
  const legTop = PLATE_UNDER - SB.t, L = SB.low, legH = legTop - L.top + 0.001;
  add(br, new RoundedBoxGeometry(0.004, legH, 0.008, 2, 0.001), zinc, lx, legTop - legH / 2, lz).rotation.y = -legA;
  // the lower block (Fig. 2: -32 to -40 mm), from behind the leg to in front of the shaft: a casting with rounded
  // edges, a hole in its bottom for the detent's ball and spring (closed above) and an arc slot the groove detent's
  // pin swings in (selector.js)
  {
    const b = 0.0006, r = 0.0015 - b, u0 = -L.front + b, u1 = L.back - b, v = L.w / 2 - b, o = [];
    const corner = (cu, cv, a0) => { for (let i = 0; i <= 4; i++) { const a = a0 + (i / 4) * (Math.PI / 2); o.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r]); } };
    corner(u1 - r, v - r, 0); corner(u0 + r, v - r, Math.PI / 2); corner(u0 + r, -v + r, Math.PI); corner(u1 - r, -v + r, 1.5 * Math.PI);
    const shape = new THREE.Shape(o.map(([u, w]) => new THREE.Vector2(ca * u - sa * w, -(sa * u + ca * w))));
    for (const h of blockHoles(b)) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
    const g = new THREE.ExtrudeGeometry(shape, { depth: L.top - L.bottom - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: 4 });
    g.rotateX(-Math.PI / 2);
    add(br, g, zinc, S0.x, L.bottom + b, S0.z);
    // the ball's hole is blind: closed above the spring
    const bx = Math.cos(DETENT.a * D) * DETENT.r, bz = Math.sin(DETENT.a * D) * DETENT.r;
    add(br, new THREE.CylinderGeometry(DETENT.hole.r, DETENT.hole.r, L.top - DETENT.hole.top, 32), zinc, S0.x + bx, (L.top + DETENT.hole.top) / 2, S0.z + bz);
  }
  // the speed lever's shaft down through the block to its nut (Fig. 2, Fig. 31); double-sided because the Fig. 2
  // section (D5) cuts it through its axis. The groove detent, its washer and nut: selector.js.
  const steel2 = mats.steel(); steel2.side = THREE.DoubleSide;
  add(br, new THREE.CylinderGeometry(0.002, 0.002, PLATE_UNDER - SB.shaftEnd, 12), steel2, S0.x, (PLATE_UNDER + SB.shaftEnd) / 2, S0.z);
  // Fig. 2: vertical guide for 134. The complete support translates for speed selection;
  // there is no transverse pivot that tips the idler axle. Lengths/clearances are estimates.
  const guideTop = -0.005, guideBottom = -0.050;
  add(br, new THREE.CylinderGeometry(LINK.guideR, LINK.guideR, guideTop - guideBottom, 16), steel,
    LINK.from.x, (guideTop + guideBottom) / 2, LINK.from.z);

  const clips = part('cWasher', root, { name: 'C washer 3.2 on guide', no: '122' });
  const clipPts = [], gap = .5;
  for (let i=0;i<=24;i++) { const a=gap+(Math.PI*2-gap*2)*i/24; clipPts.push([Math.cos(a)*.003,Math.sin(a)*.003]); }
  for (let i=24;i>=0;i--) { const a=gap+(Math.PI*2-gap*2)*i/24; clipPts.push([Math.cos(a)*.00165,Math.sin(a)*.00165]); }
  add(clips, slab(clipPts,.0005), mats.darkSteel(), LINK.from.x, guideBottom+.0007, LINK.from.z);

  // ---- the switching segment 102: clear amber plastic, a band with an S-shaped slot ---------------------
  const seg = part('speedSeg', root);
  seg.position.set(S0.x, (SEG.y[0] + SEG.y[1]) / 2, S0.z);
  const spin = new THREE.Group(); seg.add(spin);
  const amber = mat(0xdcb85e, 0.05, 0.28, { transparent: true, opacity: 0.82 }); amber.side = THREE.DoubleSide;
  const h = SEG.y[1] - SEG.y[0];
  // Factory Fig.2 / rebuild rb009 show a real track, not a painted stripe.
  // Through-channel depth is schematic; the fitted centreline is unchanged.
  for (const [key, geo] of Object.entries(channelGeometry())) kit.name(key, add(spin, geo, amber));
  add(spin, ringGeo(0.00205, SEG.hubR, -h / 2, h / 2, 24), amber);
  // Lift-off contour (component-profile.js LIFT_OFF): the outer face134's follower shoulder
  // bears on, proud between click-stops and recessed at each. Shape estimated. Drawn by its
  // top and bottom edges only; the contoured wall between them, with the slot through it,
  // is left open so the slot and pin stay visible.
  {
    const lift = part('speedLiftOff', spin, { name: 'Switching segment lift-off contour (estimated shape)', no: '102' });
    const [a0, a1] = LIFT_OFF.range, n = 160, rIn = SEG.r + SEG.slotDepth / 2, pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n, r = liftOffRadius(a); pts.push(new THREE.Vector2(r * Math.cos(a), -r * Math.sin(a))); }
    for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; pts.push(new THREE.Vector2(rIn * Math.cos(a), -rIn * Math.sin(a))); }
    const t = 0.0006, edge = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: t, bevelEnabled: false });
    edge.rotateX(-Math.PI / 2);
    for (const y of [-h / 2, h / 2 - t]) add(lift, edge, amber, 0, y, 0);
  }

  // ---- guided support 134 and the rigid arm to swing lever 133 (Figs. 2 and 31) ----
  // The collar, follower and support arm form one rigid part 134, translating and
  // swivelling together on the upright guide. Cast dimensions remain estimates.
  const carrier = kit.name('speedGuideCarrier', part('rocker', root));
  carrier.position.set(LINK.from.x, LINK.y, LINK.from.z);
  carrier.rotation.y = -Math.atan2(LINK.uz, LINK.ux);
  add(carrier, ringGeo(LINK.guideR + 0.0001, 0.0045, -0.004, 0.009, 24), zinc);
  add(carrier, new RoundedBoxGeometry(LINK.short, 0.003, 0.005, 2, 0.0005), zinc, -LINK.short / 2, LINK.pinOffset, 0);
  const reach = PIN_LENGTH;
  const pin = kit.name('speedFollowerPin', add(carrier, new THREE.CylinderGeometry(0.001, 0.001, reach, 12), steel, -LINK.short, LINK.pinOffset, -reach / 2));
  pin.rotation.x = Math.PI / 2;

  const support = kit.name('idlerSupport134', part('rocker', root));
  const body = new THREE.Shape(ROCKER.profile.map(([x, y]) => new THREE.Vector2(Math.max(x, .0045), y - LINK.y)));
  const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: ROCKER.w - 0.001, bevelEnabled: true, bevelSize: 0.0005, bevelThickness: 0.0005, bevelSegments: 2 });
  bodyGeo.translate(0, 0, -(ROCKER.w - 0.001) / 2);
  add(support, bodyGeo, zinc);
  add(support, ringGeo(LINK.guideR+.0001,.006,-.013,-.004,24), zinc);
  const link = part('speedLink', support, { name: 'Rigid support arm to swing lever', no: '134' });
  kit.name('idlerSwingBearing134', add(link, ringGeo(SWING_BEARING.inner, SWING_BEARING.outer, -SWING_BEARING.halfHeight, SWING_BEARING.halfHeight, 24), zinc, LINK.len, SWING_BEARING.y, 0));
  const anchorAlong = Math.hypot(ROCKER_ANCHOR.x - LINK.from.x, ROCKER_ANCHOR.z - LINK.from.z);
  add(link, new THREE.BoxGeometry(.0024,.008,.003), zinc, anchorAlong-.0038,.004,0);
  add(link, ringGeo(0.0009, 0.0026, -0.00175, 0.00175, 20), steel, anchorAlong, 0, 0);

  // Compression spring 123 on the vertical guide; it seats the follower in segment 102.
  const s123 = part('rockerSpring', root, { name: 'Compression spring on support guide', no: '123' });
  const free123 = SPRING123.free, top123 = SPRING123.top;
  const coil123 = add(s123, coilGeo(free123, SPRING123.r, SPRING123.turns, SPRING123.wire), mat(0x9ea3a8, 0.9, 0.35));
  // Only the source-supported188→134 spring remains (automatic subsystem).
  const selector = buildSelector(kit, root);
  function update(dt, s, P) {
    const lift=P.segmentLift??0,lever=P.segmentTurn;
    seg.position.y=(SEG.y[0]+SEG.y[1])/2+lift;
    spin.rotation.y = P.segmentTurn;
    selector.update(lever,0,lift);
    carrier.rotation.y = -P.supportAngle;
    carrier.position.y = P.supportY;
    support.position.set(LINK.from.x, P.supportY, LINK.from.z);
    support.rotation.y = -P.supportAngle;
    const ca = Math.cos(P.supportAngle), sa = Math.sin(P.supportAngle);
    Object.assign(kit.anchors.rocker, { x: LINK.from.x + ca * anchorAlong, y: P.supportY, z: LINK.from.z + sa * anchorAlong });
    const foot123 = P.supportY + SPRING123.seat;
    coil123.position.set(LINK.from.x, foot123, LINK.from.z);
    coil123.scale.y = (top123 - foot123) / free123;
  }
  return { update };
}

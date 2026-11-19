// Outside, chassis and controls: the walnut base, the black chassis plate with its turned-down edge,
// the dish and the bearing plate in it, the brushed-aluminium front strip with its printed legends and
// badge, the controls on the plate that are not the arm's (speed lever on the pitch wheel, strobe
// window, start/stop lever, record-size lever), the transport screws, and under the plate the spring
// footings and the leads. Owned by the outside builder (see OWNERS.md).
//
// build(kit) -> { group, strobeLens, strobeLight, points, update(dt, s), setXray(on) }
import * as THREE from 'three';
import { woodTexture, noiseTexture } from '../../../../deck3d/textures.js';
import { SPEC } from '../../spec.js';
import { TAU, D, BASE, PLATE, DISH, FOOT_H } from '../../layout.js';
import { lathe, RoundedBoxGeometry, helixGeo } from '../shared/geometry.js';
import {
  CONTROLS as C, LEVER, STRIP, SKIRT, BADGE, BASE_BADGE, REVEAL, PLUG, SCREWS, FOOTINGS, POSTS, CENTRE_PLATE, DISH_HOLES, DISH_OPENINGS, DISH_BEND, CABLES, CABLE_EXIT,
} from './place.js';
import { roundRect, filletPoly, slabGeo, knurlGeo, leverGeos, screwQuarterGeo, holeFaces } from './geo.js';
import { stripTexture, badgeTexture, plainBadgeTexture, windowTexture, ridgeColours } from './print.js';
import { StrobeWindowMaterial } from './window.js';

export function build(kit) {
  const { M, maxAniso, add, hit, ghost, part } = kit;
  const root = kit.group('outside');

  // ---- walnut base (WB-19 size): one solid piece round the plate, a floor, feet ---------------------
  const wood = woodTexture(); wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(2.4, 5); wood.anisotropy = maxAniso;
  const woodMat = ghost(new THREE.MeshPhysicalMaterial({ map: wood, color: 0x8f6142, roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 }), 0.12);
  const base = kit.name('plinth', new THREE.Group()); root.add(base);
  const W = BASE.w, Dp = BASE.d, cx = (BASE.x0 + BASE.x1) / 2, cz = (BASE.z0 + BASE.z1) / 2;
  const boxH = BASE.h - FOOT_H, yb = -boxH;
  // One piece of wood, as on the owner's base: a solid walnut ring from the top face to the floor
  // round the plate's opening, its outer edges eased. No separate top frame, so no seam. The eased
  // edge is taken inside the outline, so the front face is exactly at BASE.z1 (the reveal line and the
  // badge sit on it) and the opening keeps its gap.
  const ring = roundRect(BASE.x0, BASE.x1, BASE.z0, BASE.z1, BASE.r);
  // (the opening runs the other way round from the outline, so its walls face into the opening: three.js only
  // turns a hole round itself when it turns the outline)
  const opening = roundRect(PLATE.x0 - BASE.gap, PLATE.x1 + BASE.gap, PLATE.z0 - BASE.gap, PLATE.z1 + BASE.gap, PLATE.r + BASE.gap, new THREE.Path());
  ring.holes.push(new THREE.Path(opening.getPoints(24).reverse()));
  const bev = 0.0015;
  const solid = new THREE.ExtrudeGeometry(ring, { depth: boxH - 2 * bev, bevelEnabled: true, bevelSize: bev, bevelOffset: -bev, bevelThickness: bev, bevelSegments: 3, curveSegments: 96 });
  solid.rotateX(-Math.PI / 2); solid.translate(0, -(boxH - bev), 0); // top face at y = 0, bottom at -boxH
  // the leads' holes, drilled straight through the back wall (place.js CABLE_EXIT)
  const exits = CABLES.filter((c) => c.exit).map((c) => [c.pts.find(([, z]) => z < CABLE_EXIT.wall[1] && z > CABLE_EXIT.wall[0])[0], CABLE_EXIT.y, c.r + CABLE_EXIT.hole]);
  const body = holeFaces(solid, [{ z: CABLE_EXIT.wall[0], facing: -1 }, { z: CABLE_EXIT.wall[1], facing: 1 }], exits);
  { // wood grain mapped per face: top by x/z, front and back by x/y, sides by z/y
    const p = body.attributes.position, n = body.attributes.normal, uv = body.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = Math.abs(n.getY(i)), nx = Math.abs(n.getX(i)), nz = Math.abs(n.getZ(i));
      if (ny > 0.7) uv.setXY(i, (x - BASE.x0) / W, 1 - (z - BASE.z0) / Dp);
      else if (nz >= nx) uv.setXY(i, (x - BASE.x0) / W, (y + boxH) / Dp);
      else uv.setXY(i, (z - BASE.z0) / Dp, (y + boxH) / Dp);
    }
    uv.needsUpdate = true;
  }
  add(base, body, woodMat);
  const floorMat = ghost(new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 }), 0.0);
  add(base, new THREE.BoxGeometry(W - 0.004, 0.003, Dp - 0.004), floorMat, cx, yb + 0.0015, cz);
  const footGeo = lathe([[0, -FOOT_H], [0.013, -FOOT_H], [0.015, -FOOT_H + 0.0015], [0.015, -0.001], [0.014, 0], [0, 0]], 32);
  for (const [fx, fz] of [[BASE.x0 + 0.035, BASE.z0 + 0.035], [BASE.x1 - 0.035, BASE.z0 + 0.035], [BASE.x0 + 0.035, BASE.z1 - 0.035], [BASE.x1 - 0.035, BASE.z1 - 0.035]]) add(base, footGeo, M.darkTurned, fx, yb, fz);
  // the blocks in its corners that the chassis' spring footings stand on (POSTS, E)
  for (const P of POSTS.at) {
    const h = FOOTINGS.bottom - POSTS.floor;
    add(base, new RoundedBoxGeometry(P.x1 - P.x0, h, P.z1 - P.z0, 2, 0.0008), woodMat, (P.x0 + P.x1) / 2, POSTS.floor + h / 2, (P.z0 + P.z1) / 2).castShadow = false;
  }
  // the black reveal line along the front, and the maker's badge at the front right
  const revealMat = ghost(new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.6 }), 0.1);
  add(base, new THREE.BoxGeometry(W - 0.006, REVEAL.h, 0.0008), revealMat, cx, REVEAL.y, BASE.z1 + 0.0002);
  const baseBadge = add(base, new RoundedBoxGeometry(BASE_BADGE.w, BASE_BADGE.h, 0.0008, 2, 0.0003), [null, null, null, null, null, null].map((_, i) => (i === 4
    ? new THREE.MeshStandardMaterial({ map: plainBadgeTexture([BASE_BADGE.text], BASE_BADGE.w, BASE_BADGE.h, '#d9d8d3', '#26262a', 500), metalness: 0.55, roughness: 0.32 })
    : new THREE.MeshStandardMaterial({ color: 0xc9c8c2, metalness: 0.8, roughness: 0.3 }))), BASE_BADGE.x, BASE_BADGE.y, BASE.z1 + 0.0007); // in front of the reveal line
  kit.name('baseBadge', baseBadge);

  // ---- chassis plate: black pressed steel with the dish, its edge turned down ---------------------------
  const plateNoise = noiseTexture(256, 23, 20, [12, 12]);
  const blackPaint = ghost(new THREE.MeshStandardMaterial({ color: 0x18181a, metalness: 0.25, roughness: 0.55, roughnessMap: plateNoise, bumpMap: plateNoise, bumpScale: 0.01 }), 0.1);
  const plateShape = roundRect(PLATE.x0, PLATE.x1, PLATE.z0, PLATE.z1, PLATE.r);
  const dishHole = new THREE.Path(); dishHole.absarc(0, 0, DISH.r, 0, TAU, true); plateShape.holes.push(dishHole);
  const plateGeo = slabGeo(plateShape, PLATE.t, 0, PLATE, 0.0006);
  const plate = kit.name('plate', add(root, plateGeo, blackPaint)); plate.castShadow = false;
  const skirtShape = roundRect(PLATE.x0, PLATE.x1, PLATE.z0, PLATE.z1, PLATE.r);
  skirtShape.holes.push(roundRect(PLATE.x0 + SKIRT.t, PLATE.x1 - SKIRT.t, PLATE.z0 + SKIRT.t, PLATE.z1 - SKIRT.t, PLATE.r - SKIRT.t, new THREE.Path()));
  add(root, slabGeo(skirtShape, SKIRT.depth - 0.0004, -0.0004, null, 0.0002, 24), blackPaint).castShadow = false;
  // the dish: a wall down from the plate, and a floor with the openings the drive needs (place.js)
  const dishMat = ghost(blackPaint.clone(), 0.1); dishMat.side = THREE.DoubleSide;
  const r = DISH.r, d = DISH.depth, t = DISH.floorT, rf = r - 0.0035, b = DISH_BEND;
  const dish = kit.name('dish', add(root, lathe([[rf, -d - t], [r - b, -d - t], [r + t, -d + b], [r + t, -PLATE.t], [r, 0], [r, -d + b], [r - b, -d], [rf, -d], [rf, -d - t]], 192), dishMat));
  dish.castShadow = false;
  const floorShape = new THREE.Shape(); floorShape.absarc(0, 0, rf - 0.00005, 0, TAU, false); // meets the wall's foot (inside its 192 facets)
  for (const [hx, hz, hr] of [[0, 0, DISH.hole], ...DISH_HOLES]) { const h = new THREE.Path(); h.absarc(hx, -hz, hr, 0, TAU, true); floorShape.holes.push(h); }
  floorShape.holes.push(filletPoly(DISH_OPENINGS.idler, 0.001, new THREE.Path()), filletPoly(DISH_OPENINGS.strobe, 0.0015, new THREE.Path()));
  for (const k of ['tripHook', 'tripTab']) floorShape.holes.push(filletPoly(DISH_OPENINGS[k], 0.0006, new THREE.Path())); // the automatic's trip slide
  const dishFloor = add(root, slabGeo(floorShape, t, -d, null, 0.0002, 160), dishMat); dishFloor.castShadow = false;
  kit.name('dishFloor', dishFloor);
  // an outline that stays in X-ray, so the plate still reads as a plate
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(plateGeo, 30), new THREE.LineBasicMaterial({ color: 0x9fc3ff, transparent: true, opacity: 0.55 }));
  outline.visible = false; root.add(outline);

  // ---- the bearing mounting plate in the dish (register dish-centre-plate) ----------------------------------
  const CP = CENTRE_PLATE;
  const cpart = part('centrePlate', root, { name: 'Bearing mounting plate in the dish, on three standoffs', no: '—' });
  const cpShape = filletPoly(CP.outline, CP.fillet);
  { const h = new THREE.Path(); h.absarc(0, 0, CP.hole, 0, TAU, true); cpShape.holes.push(h); }
  for (const o of CP.openings()) cpShape.holes.push(filletPoly(o, 0.0006, new THREE.Path())); // the automatic's trip slide's hook
  const cpMat = ghost(new THREE.MeshStandardMaterial({ color: 0x1c1c1f, metalness: 0.3, roughness: 0.6, roughnessMap: plateNoise }), 0.12);
  add(cpart, slabGeo(cpShape, CP.t, CP.top, null, 0.0003, 24), cpMat).castShadow = false;
  const [bIn, bOut, bH] = CP.boss;
  add(cpart, lathe([[bIn, CP.top], [bOut, CP.top], [bOut, CP.top + bH - 0.0003], [bOut - 0.0003, CP.top + bH], [bIn, CP.top + bH], [bIn, CP.top]], 64), ghost(M.darkTurned.clone(), 0.2));
  const hexGeo = new THREE.CylinderGeometry(CP.hexR, CP.hexR, CP.hexH, 6); hexGeo.translate(0, CP.hexH / 2, 0);
  const nylon = ghost(new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.5 }), 0.3);
  for (const [hx, hz] of CP.standoffs) add(cpart, hexGeo, nylon, hx, CP.top, hz).rotation.y = 0.3;

  // ---- the brushed-aluminium front strip, inside the plate's rolled edge, round the dish -------------------
  const xl = PLATE.x0 + STRIP.inset, xr = PLATE.x1 - STRIP.inset, zf = PLATE.z1 - STRIP.inset, bz = STRIP.z0, rb = 0.0015, rs = STRIP.r;
  const bx = Math.sqrt(STRIP.biteR * STRIP.biteR - bz * bz);
  const strip = new THREE.Shape();
  strip.moveTo(xl + rb, -bz); strip.lineTo(-bx, -bz);
  strip.absarc(0, 0, STRIP.biteR, -Math.atan2(bz, -bx), -Math.atan2(bz, bx), false); // shape y = -z: the bite runs round the front of the dish
  strip.lineTo(xr - rb, -bz); strip.quadraticCurveTo(xr, -bz, xr, -bz - rb);
  strip.lineTo(xr, -zf + rs); strip.quadraticCurveTo(xr, -zf, xr - rs, -zf);
  strip.lineTo(xl + rs, -zf); strip.quadraticCurveTo(xl, -zf, xl, -zf + rs);
  strip.lineTo(xl, -bz - rb); strip.quadraticCurveTo(xl, -bz, xl + rb, -bz);
  const SB = { x0: xl, x1: xr, z0: bz, z1: zf };
  const stripTex = stripTexture(SB); stripTex.map.anisotropy = stripTex.finish.anisotropy = maxAniso;
  // the finish map makes the print matte (print.js: why the ink keeps the metal's metalness)
  const stripMat = new THREE.MeshStandardMaterial({ map: stripTex.map, metalness: 0.72, roughness: 1, roughnessMap: stripTex.finish, bumpMap: plateNoise, bumpScale: 0.02 });
  const stripMesh = kit.name('strip', add(root, slabGeo(strip, STRIP.t, STRIP.t, SB, 0.00015), stripMat)); stripMesh.castShadow = false;
  ghost(stripMat, 0.12);
  const y0 = STRIP.t; // the strip's top: everything on the strip stands on it

  // the badge tile beside the controls: the UA diamond
  const badgeSides = new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.4, roughness: 0.35 });
  const badgeFace = new THREE.MeshStandardMaterial({ map: badgeTexture(BADGE.w, BADGE.d), metalness: 0.2, roughness: 0.32 });
  const badge = add(root, new RoundedBoxGeometry(BADGE.w, BADGE.h, BADGE.d, 2, 0.0003), [badgeSides, badgeSides, badgeFace, badgeSides, badgeSides, badgeSides], BADGE.x, y0 + BADGE.h / 2, BADGE.z);
  badge.castShadow = false;
  kit.name('badge', badge);

  // ---- materials of the controls --------------------------------------------------------------------------
  const black = new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.1, roughness: 0.32 }); // glossy black plastic
  // the lever's bright aluminium face: half metallic so it stays bright at any angle, as in the photos,
  // instead of going dark where a mirror finish would pick up the dark room
  const satin = new THREE.MeshPhysicalMaterial({ color: 0xdfe1e4, metalness: 0.5, roughness: 0.34, anisotropy: 0.5 });
  // the knurled rims of the pitch wheel and the strobe window: coarse ribs, their faces bold white on black (O4, P3)
  const knurlMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.05, roughness: 0.45 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.5 });
  // the speed lever's hub: its flat top faces the overview camera and mirrored the bright room as silver;
  // the photos (O2, O4) show it black, so it is satin, not glossy
  const blackSatin = new THREE.MeshStandardMaterial({ color: 0x111113, metalness: 0.05, roughness: 0.5, envMapIntensity: 0.6 });
  const hubGeo = (rr, h) => lathe([[0, 0], [rr, 0], [rr, h - 0.0011], [rr - 0.0003, h - 0.0003], [rr - 0.0011, h], [0, h]], 48);

  // a Dual lever: hub, blade and its metal top; returns the group that turns (on its hub's axis)
  function makeLever(key, info, at, p, baseY, hubMat = black) {
    const g = part(key, root, info); g.position.set(at.x, baseY, at.z);
    const { blade, inlay } = leverGeos({ len: p.len, w: LEVER.w, top0: p.top0 - (baseY - y0), top1: p.top1 - (baseY - y0), t: p.t, hubR: p.hubR, side: p.face });
    add(g, hubGeo(p.hubR, p.hubH), hubMat);
    add(g, blade, black);
    add(g, inlay, satin).castShadow = false;
    return g;
  }
  const lever = { ...LEVER };

  // ---- pitch wheel and the speed lever on it, on one axis (register pitch-wheel, speed-lever) ---------------
  const pitchWheel = part('pitchWheel', root, { name: 'Pitch wheel, knurled (+-3 %)', no: '8' }); pitchWheel.position.set(C.pitch.x, y0, C.pitch.z);
  const wheelGeo = ridgeColours(knurlGeo(C.pitch.r, 0, C.pitch.h, C.pitch.teeth, C.pitch.depth, 0.0002, C.pitch.tip), C.pitch.r, C.pitch.depth, 0.86, 0.02, 0.018);
  add(pitchWheel, wheelGeo, knurlMat);
  { // its white index mark, pointing back at the arc when the pitch is zero
    const bar = new THREE.Shape(); // Plain 1229 pitch index, photo estimate 0.9 × 3.3 mm.
    bar.moveTo(-0.00045, 0.0067); bar.lineTo(0.00045, 0.0067);
    bar.lineTo(0.00045, 0.0100); bar.lineTo(-0.00045, 0.0100); bar.closePath();
    const g = new THREE.ShapeGeometry(bar); g.rotateX(-Math.PI / 2);
    add(pitchWheel, g, white, 0, C.pitch.h + 0.00005, 0).castShadow = false;
  }
  hit('dual:pitch', new THREE.CylinderGeometry(C.pitch.r + 0.003, C.pitch.r + 0.003, 0.006, 32), C.pitch.x, y0 + 0.003, C.pitch.z);
  const speedLever = makeLever('speedLever', { name: 'Speed selector lever 33 / 45 / 78', no: '6' }, C.speed, { ...lever, ...C.speed }, y0 + C.pitch.h, blackSatin);
  const speedTop = y0 + C.pitch.h + C.speed.hubH;
  hit('dual:speed', new THREE.CylinderGeometry(C.speed.hubR + 0.001, C.speed.hubR + 0.001, C.speed.hubH + 0.004, 24), C.speed.x, y0 + C.pitch.h + (C.speed.hubH + 0.004) / 2, C.speed.z);
  hit('dual:speed', new THREE.BoxGeometry(LEVER.w + 0.003, 0.006, C.speed.len - C.speed.hubR), 0, (C.speed.top0 + C.speed.top1) / 2 - C.pitch.h - 0.0015, (C.speed.hubR + C.speed.len) / 2, speedLever);

  // ---- strobe window: a knurled ring over the prism, its window showing the lit ring's bars -----------------
  // Limitation: plain 1229 manual p.5 allows viewing-angle adjustment by turning this
  // knurled ring. This model draws one static orientation (STROBE_TURN) and has no adjustment control.
  const S = C.strobe;
  const STROBE_TURN = Math.PI / 4; // how far the strobe window's face is turned, anticlockwise seen from above
  const sw = part('strobeWindow', root, { name: 'Strobe window: knurled ring over the deflecting prism', no: '46 (prism 227 015)' }); sw.position.set(S.x, y0, S.z);
  add(sw, ridgeColours(knurlGeo(S.rOut, S.rIn, S.h, S.teeth, S.depth, 0.0002, S.tip), S.rOut, S.depth, 0.86, 0.02, 0.022), knurlMat);
  add(sw, lathe([[S.rIn - 0.0007, S.h - 0.0019], [S.rIn + 0.0001, S.h - 0.0019], [S.rIn + 0.0001, S.h - 0.0002], [S.rIn - 0.0003, S.h - 0.0002], [S.rIn - 0.0007, S.h - 0.0006]], 64), M.dark);
  const WU = { uTrue: { value: new THREE.Vector4(0, 0, 0, 0) }, uStrobe: { value: new THREE.Vector4(0, 0, 0, 0) }, uLampU: { value: 0 } };
  const winR = S.rIn - 0.0006;
  // The lit bars glow orange-red (dFn 2:22, hifi-wiki): the deck view drives emissiveIntensity up to 2.6, so the
  // colour is kept dim enough that ACES does not wash its red out toward salmon. The window under the glass is
  // matte and takes little of the room's reflection, so it stays black round the bars.
  const strobeLens = new StrobeWindowMaterial({ map: windowTexture(), color: 0xffffff, emissive: 0xae3807, emissiveIntensity: 0, roughness: 0.6, metalness: 0, envMapIntensity: 0.3 }, WU, { r: winR, r33: 0.117, r45: 0.103 });
  const winGeo = new THREE.CircleGeometry(winR, 64); winGeo.rotateX(-Math.PI / 2);
  // The window is read from the front left, so the real deck's stands turned an eighth of a turn:
  // its figures and bars run up to the right (owner's photo of a real 1229, 2026-11-19).
  const lens = add(sw, winGeo, strobeLens, 0, S.h - 0.0017, 0); lens.castShadow = false; lens.rotation.y = STROBE_TURN;
  // the glass over it: dark, so it adds its reflections but no milky veil over the lit bars (a white veil made them salmon pink)
  const glass = add(sw, winGeo, new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.18, depthWrite: false, envMapIntensity: 0.6 }), 0, S.h - 0.0007, 0);
  glass.castShadow = false; glass.receiveShadow = false;
  // the glow of the lit window: a short reach, so it warms the window and its ring but not the platter's
  // rim 20 mm away (which it smeared red)
  const strobeLight = new THREE.PointLight(0xff4a1a, 0, 0.013, 2);
  strobeLight.position.set(S.x, y0 + S.h + 0.0015, S.z); root.add(strobeLight);
  let strobeBound = false; // bound to the platter's strobe uniforms on the first frame (the platter is built after us)
  function bindStrobe() {
    const a = kit.anchors.strobeRing;
    if (!a || !a.uniforms) return;
    WU.uTrue.value = a.uniforms.uTrue.value; WU.uStrobe.value = a.uniforms.uStrobe.value; WU.uLampU.value = a.uniforms.uLampU.value;
    // the radii of the rows the window looks at, from the ring itself
    if (a.rows && a.rIn && a.rOut) {
      const rr = (row) => a.rIn + (a.rOut - a.rIn) * (row[0] + row[1]) / 2;
      strobeLens.geom = { ...strobeLens.geom, r33: rr(a.rows[33]), r45: rr(a.rows[45]) }; strobeLens.needsUpdate = true;
    }
    strobeBound = true;
  }

  // ---- start/stop lever and record-size lever (register start-stop-lever, size-lever) ------------------------
  const startLever = makeLever('startStopLever', { name: 'Start / stop lever (operating switch)', no: '225 197 (48)' }, C.lever, lever, y0);
  hit('dual:start', new THREE.BoxGeometry(0.0195, 0.012, 0.047), C.lever.x - 0.01025, 0.006, C.lever.z + 0.0165);
  hit('dual:stop', new THREE.BoxGeometry(0.0195, 0.012, 0.047), C.lever.x + 0.01025, 0.006, C.lever.z + 0.0165);
  const sizeLever = makeLever('sizeLever', { name: 'Record size lever 7 / 10 / 12', no: '225 197 (49)' }, C.size, lever, y0);
  hit('dual:size', new THREE.CylinderGeometry(LEVER.hubR + 0.001, LEVER.hubR + 0.001, LEVER.hubH + 0.003, 24), C.size.x, y0 + (LEVER.hubH + 0.003) / 2, C.size.z);
  hit('dual:size', new THREE.BoxGeometry(LEVER.w + 0.003, 0.0065, LEVER.len - LEVER.hubR), 0, (LEVER.top0 + LEVER.top1) / 2 - 0.0016, (LEVER.hubR + LEVER.len) / 2, sizeLever);

  // ---- the black plug left of the pitch scale (register front-left-plug) ---------------------------------------
  add(root, lathe([[0, 0], [PLUG.r, 0], [PLUG.r, 0.0003], [PLUG.r * 0.8, 0.0008], [0, 0.0010]], 32), M.rubber, PLUG.x, y0, PLUG.z).castShadow = false;

  // ---- transport screws (D15): chrome, cross-slotted, drawn loosened ----------------------------------------
  const scr = part('transportScrews', root, { name: 'Transport screw (3), loosened so the chassis floats', no: '11 / 12' });
  const washerGeo = lathe([[0, 0], [SCREWS.washerR, 0], [SCREWS.washerR, 0.0005], [SCREWS.washerR - 0.0007, 0.0009], [SCREWS.headR + 0.0004, 0.0009], [SCREWS.headR + 0.0004, 0.0004], [0, 0.0004]], 48);
  const quarter = screwQuarterGeo(SCREWS.headR, SCREWS.slot, 0.0024);
  const slotFloor = new THREE.CylinderGeometry(SCREWS.headR - 0.0004, SCREWS.headR - 0.0004, 0.0012, 32); slotFloor.translate(0, 0.0006, 0);
  const bushGeo = lathe([[0.0035, 0], [0.0068, 0], [0.0068, -0.0012], [0.0052, -0.0016], [0.0052, -0.0065], [0.0035, -0.0065]], 32);
  const zinc = kit.mats.zinc();
  for (const [sx, sz] of SCREWS.at) {
    const onStrip = sz > STRIP.z0 && Math.hypot(sx, sz) > STRIP.biteR, sy = onStrip ? y0 : 0;
    const g = new THREE.Group(); g.position.set(sx, sy, sz); scr.add(g);
    add(g, washerGeo, M.chrome);
    const hy = 0.0004 + SCREWS.lift;
    add(g, slotFloor, M.dark, 0, hy, 0);
    for (let q = 0; q < 4; q++) add(g, quarter, M.chrome, 0, hy, 0).rotation.y = q * Math.PI / 2 + 0.35;
    add(scr, bushGeo, zinc, sx, -PLATE.t, sz); // its threaded bush under the plate (Fig. 31)
  }

  // ---- spring footings under the plate's corners (D15), yellow springs on the motor side --------------------
  const F = FOOTINGS;
  const ft = part('springFootings', root, { name: 'Spring mounted footing (4); yellow springs on the motor side', no: '230 406' });
  const cupGeo = lathe([[0, F.bottom], [F.cupR - 0.001, F.bottom], [F.cupR, F.bottom + 0.001], [F.cupR, F.bottom + 0.0075], [F.cupR - 0.0009, F.bottom + 0.0078], [F.cupR - 0.0009, F.bottom + 0.0012], [0, F.bottom + 0.0012]], 48);
  const capGeo = lathe([[0, F.top], [0.008, F.top], [0.008, F.top - 0.0008], [0.0045, F.top - 0.0012], [0.0045, F.top - 0.004], [0, F.top - 0.004]], 32);
  const springGeo = helixGeo(F.top - 0.002 - F.springBottom, F.springR, 6, 0.0007);
  // Plain 1229 p17 parts list / p18 Fig. 30: rubber damper 34 (200 723), four per deck.
  // The flange supports the coil in cup 35; the narrower upper body lies inside the spring.
  const damper = part('footingDampers', ft, { name: 'Suspension rubber dampers (4; estimated dimensions)', no: '34 [M-DE] (200 723)' });
  const R = F.damper;
  const damperGeo = lathe([[R.boreR, R.bottom], [R.flangeR, R.bottom], [R.flangeR, R.flangeTop],
    [R.bodyR, R.flangeTop], [R.bodyR, R.top], [R.boreR, R.top], [R.boreR, R.bottom]], 48);
  const rubber = kit.mats.rubber();
  const cream = new THREE.MeshStandardMaterial({ color: 0xd8d3c4, metalness: 0, roughness: 0.6 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd9b52a, metalness: 0.3, roughness: 0.45 });
  const steel = kit.mats.steel();
  for (const [fx, fz] of F.at) {
    add(ft, capGeo, steel, fx, 0, fz);
    add(ft, springGeo, fx < 0 ? yellow : steel, fx, F.springBottom, fz);
    add(ft, cupGeo, cream, fx, 0, fz);
    add(damper, damperGeo, rubber, fx, 0, fz);
  }

  // ---- leads under the chassis (register cables-under) ------------------------------------------------------
  const cab = part('cables', root, { name: 'Mains, motor and audio leads under the chassis', no: '244-250, 268, 278-281' });
  const leadMat = { black: new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.55 }), white: new THREE.MeshStandardMaterial({ color: 0xd8d6cf, roughness: 0.55 }) };
  for (const c of CABLES) {
    const pts = c.pts.map(([x, z, y]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    add(cab, new THREE.TubeGeometry(curve, Math.max(24, pts.length * 12), c.r, 8, false), leadMat[c.color]);
    if (c.clamp !== undefined) { // a P-clip screwed under the dish floor
      const p = pts[c.clamp], tgt = curve.getTangent(c.clamp / (pts.length - 1));
      const clip = add(cab, new THREE.TorusGeometry(c.r + 0.0006, 0.0005, 6, 20), steel, p.x, p.y, p.z);
      clip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tgt);
      add(cab, new THREE.BoxGeometry(0.004, 0.0006, 0.006), steel, p.x + 0.004, p.y + c.r + 0.0003, p.z);
    }
    if (c.relief) { // the ribbed strain relief where the audio lead leaves the arm's wiring
      const p = pts[0], tgt = curve.getTangent(0);
      const rib = []; for (let i = 0; i <= 10; i++) rib.push([c.r + (i % 2 ? 0.0012 : 0.0006), -0.012 + i * 0.0012]);
      const sleeve = add(cab, lathe([[0, -0.012], ...rib, [0, 0]], 16), leadMat.black, p.x, p.y, p.z);
      sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), tgt);
    }
    if (c.exit) { // a rubber grommet lining the lead's hole through the base's back wall, a flange on each face
      const x = c.pts.find(([, z]) => z < CABLE_EXIT.wall[1] && z > CABLE_EXIT.wall[0])[0], ri = c.r + 0.0003, rh = c.r + CABLE_EXIT.hole - 0.0001, ro = c.r + CABLE_EXIT.grommet + 0.0012;
      const [w0, w1] = CABLE_EXIT.wall, e = 0.00005, f = 0.0012; // the flanges stand just off the wood
      const g = lathe([[ri, w0 - e - f], [ro - 0.0004, w0 - e - f], [ro, w0 - e - f + 0.0004], [ro, w0 - e], [rh, w0 - e], [rh, w1 + e],
        [ro, w1 + e], [ro, w1 + e + f - 0.0004], [ro - 0.0004, w1 + e + f], [ri, w1 + e + f]], 24);
      g.rotateX(Math.PI / 2); // the lathe's axis along z (rotateX turns its y into z)
      add(cab, g, M.rubber, x, CABLE_EXIT.y, 0).castShadow = false;
    }
    if (c.exit) { // the far end, on the table well behind the base: closed off
      const end = pts[pts.length - 1], cap = add(cab, new THREE.CircleGeometry(c.r, 8), leadMat[c.color], end.x, end.y, end.z);
      cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangent(1));
    }
  }

  // where a finger presses each control (for the browser tests and pointForControl)
  const points = {
    start: () => [C.lever.x - 0.0045, 0.006, C.lever.z + 0.030],
    stop: () => [C.lever.x + 0.0045, 0.006, C.lever.z + 0.030],
    speed: () => [C.speed.x, speedTop, C.speed.z],
    pitch: () => [C.pitch.x + 0.0115, y0 + C.pitch.h, C.pitch.z - 0.003], // the wheel's right edge, clear of the lever
    size: () => [C.size.x, y0 + LEVER.hubH, C.size.z],
  };

  // ---- one frame ---------------------------------------------------------------------------------
  const lerp = (a, b, k) => a + (b - a) * k;
  const look = { speed: 0, size: 0, lever: 0, init: false };
  function update(dt, s) {
    if (!strobeBound) bindStrobe();
    const first = !look.init; look.init = true;
    const k = first ? 1 : Math.min(1, dt * 14);
    look.speed = lerp(look.speed, (C.speed.deg[s.speed] || 0) * D, k); // the tip swings over 33 . 45 . 78 at the front edge
    speedLever.rotation.y = look.speed;
    pitchWheel.rotation.y = -(s.pitch / SPEC.pitch) * C.pitch.swing;
    look.size = lerp(look.size, (C.size.deg[s.size] || 0) * D, k);
    sizeLever.rotation.y = look.size;
    look.lever = lerp(look.lever, s.lever === 'start' ? 1 : s.lever === 'stop' ? -1 : 0, first ? 1 : Math.min(1, dt * 20));
    startLever.rotation.y = -look.lever * C.lever.swing * D; // start: the tip pushed left
  }
  function setXray(on) { outline.visible = on; plate.receiveShadow = !on; }
  return { group: root, strobeLens, strobeLight, points, update, setXray };
}

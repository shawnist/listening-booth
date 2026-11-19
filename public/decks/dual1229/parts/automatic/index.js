// Automatic mechanism: the main cam (165) with its guide groove, the dog (M) on the platter gear,
// the shut-off lever (162) and the cam follower (207) riding on the cam, the cam's axle (208) on its
// bracket (171), the main lever (184) on its stud (182) and bracket (215) with its spade, the tonearm
// segment (201) with the clutch pad (223 777) and its guide (216 844), the single formed trip rail (253),
// the operating switch linkage (196, 195, switch arm 188 on its grooved pin 192, start lever 248, pawl
// 273 and square bolt 274), the cam rocker (173) with the change stud (177), the muting switch, the
// record-size indexing lever (49) with the arm positioning slide (255), and the bridge strap (157).
// Every part is moved each frame from the mechanism's own state (mechanism.js snapshot()), so what
// you see is what the simulation is doing: the cam turns only as far as the platter has turned it, the
// main lever's pin sits in the cam's groove at the angle the cam stands at, and the lever's spade
// carries the arm through the clutch pad. Each part has a layer of its own (place.js), and the
// browser test test/dual-automatic.collide.mjs checks that nothing runs through anything else.
// Positions: place.js. Owned by the automatic builder.
//
// build(kit, { arm }) -> { group, update(dt, s, ctx) }; reads kit.anchors.rocker (drive).
import * as THREE from 'three';
import { SPEC, REST_DATUM, R_OUT_MAX } from '../../spec.js';
import { CAM, IN_R } from '../../mechanism.js';
import { AUTO, CAM_PROFILE, automaticPose, capContact } from '../../automatic-contact.js';
import { SKATE_ANCHOR } from '../../anti-skate-contact.js';
import { TAU, D, GEAR, AXES } from '../../layout.js';
import { lathe, helixGeo, V3, RoundedBoxGeometry, sheetGeo } from '../shared/geometry.js';
import { plate, strap, arcBand, circle, ring, gearRim, offsetLoop } from './geo.js';
import { buildChanger, buildChangerCam, rockerSheet } from './changer.js';
import {
  CAM_T, CAM_Y, CAM_R, GROOVE, DOG, MAIN_LEVER as ML, SPADE, STUD_BRACKET, LIFT_SCREW, SEGMENT as SG, BRIDGE, CAM_BRACKET,
  SHUTOFF_SLIDE as SO, TRIP_LINK, SHUTOFF_LEVER as SL, SHAFT_192, SWITCH_LEVER, SWITCH_ARM, PAWL, START_LEVER, FOLLOWER, CAM_ROCKER,
  MUTING, INDEX_SLIDE, SHUTOFF_BALL,
} from './place.js';
import {prescribedSwitchArmYaw} from './switch-input.js';
import { springsPins } from './springs-pins.js';
import { SIZE_STOP, stopPost, sizeStopPose } from '../../size-stop.js';
import { railPose, RAIL_LENGTH, LINK_TAB, LINK_R, initialTripState, dogPhase0, stepTrip, tabSlack } from './trip-rail.js';
import { flangeRadius as flangeR, flangeUnder, MUTE_CAM, MUTE_LEAVES, muteLeafPose } from '../../cam-flange.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ramp = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
const smooth = (t) => t * t * (3 - 2 * t);
const ang = (x, z) => Math.atan2(z, x);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const rot = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)]; // turn by a (atan2(z, x) grows)
const lerp = (a, b, k) => a + (b - a) * k;
const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
const hull2 = (P) => { // convex hull, counter-clockwise in (x, z)
  const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
};

export function build(kit, { arm, sizeStopGeometry=SIZE_STOP }) {
  const { add, part, mats, mat } = kit;
  const root = kit.group('automatic');
  // finishes (DECISIONS D22): flat levers yellow-chromated (gold), rods bright zinc, cam amber. The gold is
  // an olive brass (A2, MAARC rb-018: about rgb 130 110 70 lit), dark and a little rough, so the underside light
  // does not wash it out to butter yellow.
  const gold = () => mat(0x6e5a26, 0.82, 0.46);
  const goldDark = () => mat(0x5a4a1e, 0.8, 0.5);
  const bright = () => mat(0xc4c7c2, 0.9, 0.3); // bright zinc-plated plate (the trip slide)
  // amber (A2-A4): a clear yellow-amber moulding: lemon yellow where it is thin and lit (A4), honey amber under the
  // underside light (A2/A3), and see-through. No real transmission (an extra render of the whole deck every frame
  // the cam is in view): a saturated yellow, partly see-through, lit a little from within so it glows, and nearly no
  // gloss (a clearcoat or a strong highlight under the underside light washes it out to salmon or beige)
  const amber = (color, opacity, roughness) => new THREE.MeshPhysicalMaterial({
    color, metalness: 0, roughness, transparent: true, opacity, ior: 1.49,
    specularIntensity: 0.72, clearcoat: 0.16, clearcoatRoughness: 0.3, depthWrite: false,
    transmission: 0.44, thickness: 0.0012, attenuationColor: new THREE.Color(0xf2be35), attenuationDistance: 0.004,
  });
  const cream = () => mat(0xe7dfc6, 0, 0.6);
  const zinc = mats.zinc, steel = mats.steel, darkSteel = mats.darkSteel, brass = mats.brass;
  const flat = (parent, outline, t, y, m, holes = []) => add(parent, plate(outline, t, holes), m, 0, y, 0);
  const box = (parent, w, h, d, m, x, y, z, ry = 0) => { const b = add(parent, new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.25), m, x, y, z); b.rotation.y = ry; return b; };
  const post = (parent, r, y0, y1, m, x, z, seg = 16) => add(parent, new THREE.CylinderGeometry(r, r, Math.abs(y1 - y0), seg), m, x, (y0 + y1) / 2, z);
  const unitRod = (r, m) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10), m);
  const rod = (key, r, m) => { const o = kit.adopt(key, unitRod(r, m)); o.castShadow = true; root.add(o); return o; };
  const tmpA = V3(0, 0, 0), tmpB = V3(0, 0, 0), tmpC = V3(0, 0, 0), tmpD = V3(0, 0, 0), UP = V3(0, 1, 0);
  // a unit rod (height 1 along y) stretched from a to b, without allocating (shared rodBetween clones)
  const rodBetween = (mesh, a, b) => {
    tmpD.subVectors(b, a); const len = tmpD.length();
    mesh.position.copy(a).addScaledVector(tmpD, 0.5); mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(UP, tmpD.multiplyScalar(1 / len));
  };

  // ---- the geometry the motion is built on -----------------------------------------------------------
  const C = { x: GEAR.camX, z: GEAR.camZ }; // main cam centre
  const P = arm.pivot; // arm axis: the segment turns on it
  const Q = ML.pivot, pin0 = ML.pin;
  const armAng = (L) => arm.angleFor(clamp(L, 0.02, R_OUT_MAX));
  // segment 201's frame: the datum REST_DATUM (spec.js), rigid on the arm wherever it parks
  const aIn = armAng(IN_R), aRest = armAng(REST_DATUM), aMid = (aIn + aRest) / 2;
  const angPQ = ang(Q.x - P.x, Q.z - P.z); // the clutch pad faces the main lever's pivot at mid-swing
  // The coupling bolt is mounted at a fixed radius on segment 201 (manual Fig.16).
  // Its cap slides over the broad main-lever face as the two parts turn about different axes.
  // No radial slider or guide slot: those were unsupported inventions.
  const base=AUTO.base;
  const toLever = (wx, wz) => rot(wx - Q.x, wz - Q.z, -base);
  const toCam = (wx, wz, th) => rot(wx - C.x, wz - C.z, th * D); // the cam's own frame at cam angle th (deg)
  const camAngle = (wx, wz) => ang(wx - C.x, wz - C.z); // a world point's angle about the cam at neutral
  const gapAt = ang(-C.x, -C.z); // the toothless gap faces the pinion at neutral
  const lift = arm.liftPos;

  // ---- the dog (M) under the pinion, turning with the platter -----------------------------------------
  const dogP = part('dog', root);
  const dog = new THREE.Group(); dogP.add(dog);
  {
    const t = DOG.y[1] - DOG.y[0];
    flat(dog, circle(DOG.ecc, 0, DOG.r, 48), t, (DOG.y[0] + DOG.y[1]) / 2, steel(), [circle(0, 0, DOG.bore, 32)]);
  }

  // ---- main cam (165) ------------------------------------------------------------------------------------
  const cam = part('cam', root); cam.position.set(C.x, 0, C.z);
  const camSpin = new THREE.Group(); cam.add(camSpin); // first child: the test reads its rotation.y as the cam angle
  const amberThin = amber(0xe8bf40, 0.66, 0.31); // the web and the rim: clear lemon yellow, see-through (A4)
  const amberDeep = amber(0xad781c, 0.87, 0.35); // walls, hub and ring: yellow amber where the moulding is thick (A3)
  const camTeeth = new THREE.Group(); camSpin.add(camTeeth); // turned a fraction of a tooth so its teeth mesh with the pinion's
  const camGear = add(camTeeth, gearRim(GEAR.camR, SPEC.camTeeth, CAM_T, CAM_R.gapTeeth, CAM_R.web - 0.0016), amberThin, 0, GEAR.camY, 0);
  camGear.rotation.y = -gapAt;
  add(camSpin, lathe([[CAM_R.hub, CAM_Y.web[0]], [CAM_R.web, CAM_Y.web[0]], [CAM_R.web, CAM_Y.web[1]], [CAM_R.hub, CAM_Y.web[1]]], 96), amberThin);
  add(camSpin, lathe([[CAM_R.bore, CAM_Y.hub[0]], [0.0060, CAM_Y.hub[0]], [0.0066, CAM_Y.hub[0] + 0.0006], [CAM_R.hub, CAM_Y.web[0]], [CAM_R.hub, CAM_Y.hub[1]], [CAM_R.bore, CAM_Y.hub[1]]], 40), amberDeep);
  add(camSpin, lathe([[CAM_R.ring[0], CAM_Y.wall], [CAM_R.ring[1], CAM_Y.wall], [CAM_R.ring[1], CAM_Y.web[0]], [CAM_R.ring[0], CAM_Y.web[0]]], 96), amberDeep);
  // the flange the switch arm's finger and the muting leaves ride on: ramped cut-outs where both drop in at
  // neutral. flangeR(a) is its outer edge at cam-frame angle a; the finger and the leaves are drawn from it.
  const F188 = SWITCH_ARM.finger;
  const muteTip = { x: (MUTING.x[0] + MUTING.x[1]) / 2 + 0.006, z: 0 }; muteTip.z = C.z - Math.sqrt(CAM_R.flange[1] ** 2 - (muteTip.x - C.x) ** 2) - 0.0003;
  const muteA = camAngle(muteTip.x, muteTip.z);

  {
    const out = []; for (let i = 0; i < 360; i++) { const a = (i / 360) * TAU; out.push(polar(a, flangeR(a))); }
    flat(camSpin, out, CAM_Y.flange[1] - CAM_Y.flange[0], (CAM_Y.flange[0] + CAM_Y.flange[1]) / 2, amberDeep, [circle(0, 0, CAM_R.flange[0], 120)]);
  }
  // Separate estimated outer working band for the stacked muting leaves.
  // Sharing188's lower ring would open the contacts again halfway through a cycle.
  {
    const outer=[];for(let i=0;i<720;i++){const a=i*TAU/720;outer.push(polar(a,flangeR(a,MUTE_CAM)));}
    const inner=MUTE_CAM.radius-MUTE_CAM.depth-.001;
    kit.name('mutingCamTrack',flat(camSpin,outer,MUTE_CAM.top-MUTE_CAM.bottom,(MUTE_CAM.top+MUTE_CAM.bottom)/2,amberDeep,[circle(0,0,inner,120)]));
  }
  // the shut-off lever's place on the cam (below), so the flange's hangers keep clear of it
  const slA = (deg) => gapAt + deg * D;
  // its hangers, clear of both cut-outs and of the shut-off lever
  for (const deg of [75, 195, 250]) { const [x, z] = polar(slA(deg), CAM_R.hanger); post(camSpin, 0.0007, CAM_Y.flange[1] - 0.0002, CAM_Y.web[0] + 0.0002, amberDeep, x, z, 10); }

  // ---- the guide groove under the cam -----------------------------------------------------------------
  // Fixed physical channel data shared with the rigid follower solver. These
  // estimated stations are independent of current arm/cap/mode or desired reach.
  const groovePart = part('camGroove', camSpin);
  const a0 = GROOVE.pin + GROOVE.clear, a1 = a0 + GROOVE.wall, wallH = CAM_Y.web[0] - CAM_Y.wall, wallY = (CAM_Y.web[0] + CAM_Y.wall) / 2;
  const track = rows => rows.map(([th,x,y,z])=>({th,p:[x,z],y}));
  const tStart=track(CAM_PROFILE.start),tStop=track(CAM_PROFILE.stop);
  // Channel roof is the actual axial working surface. Its underside is precisely
  // the same fixed XYZ curve that constrains the follower, with finite width.
  for(const T of [tStart,tStop]){
    const v=[],indices=[];
    for(let i=0;i<T.length;i++){
      const q=T[i],a=T[Math.max(0,i-1)].p,b=T[Math.min(T.length-1,i+1)].p,d=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const nx=-(b[1]-a[1])/d*a0,nz=(b[0]-a[0])/d*a0;
      // a fifth vertex on the follower's centreline: the roof's triangles then share the centreline as an
      // edge, so the drawn roof equals the solved one along the follower path even where it slopes on a curve
      v.push(q.p[0]+nx,q.y,q.p[1]+nz,q.p[0]-nx,q.y,q.p[1]-nz,
        q.p[0]+nx,CAM_Y.web[0],q.p[1]+nz,q.p[0]-nx,CAM_Y.web[0],q.p[1]-nz,q.p[0],q.y,q.p[1]);
      if(i){const k=5*i,L=k,R=k+1,LW=k+2,RW=k+3,Cc=k+4,pL=k-5,pR=k-4,pLW=k-3,pRW=k-2,pC=k-1;
        indices.push(pL,pC,L, pC,Cc,L, pC,pR,Cc, pR,R,Cc, pLW,LW,pRW, pRW,LW,RW,
          pL,L,pLW, pLW,L,LW, pR,pRW,R, pRW,RW,R);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(indices);g.computeVertexNormals();
    const material=amberDeep.clone();material.side=THREE.DoubleSide;add(groovePart,g,material);
  }
  // a coarse grid of both tracks' fine samples, to ask how near a point is to either channel
  const near = (() => {
    const cell = 0.002, grid = new Map(), keyOf = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    for (const T of [tStart, tStop]) for (let i = 0; i < T.length; i++) {
      const q = T[i].p, r = T[(i + 1) % T.length].p, n = Math.max(1, Math.ceil(Math.hypot(r[0] - q[0], r[1] - q[1]) / 0.0001));
      if (T === tStop && i === T.length - 1) continue;
      for (let k = 0; k < n; k++) { const x = lerp(q[0], r[0], k / n), z = lerp(q[1], r[1], k / n), key = keyOf(x, z); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(x, z); }
    }
    return (x, z) => {
      let d = Infinity; const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const g = grid.get(`${cx + i},${cz + j}`); if (g) for (let k = 0; k < g.length; k += 2) d = Math.min(d, Math.hypot(g[k] - x, g[k + 1] - z)); }
      return d;
    };
  })();
  const clearOf = (x, z) => near(x, z) >= a0 - 1e-6 && Math.hypot(x, z) <= CAM_R.ring[0] - 0.0001 && Math.hypot(x, z) >= CAM_R.hub + 0.0002;
  const walls = []; // { outline, holes } in the cam's frame
  const keep = []; // follower: where the separating wall between the forked tracks begins
  for (const [T, closed] of [[tStart, true], [tStop, false]]) {
    const n = T.length, nrm = [];
    for (let i = 0; i < n; i++) {
      const a = T[closed ? (i - 1 + n) % n : Math.max(0, i - 1)].p, b = T[closed ? (i + 1) % n : Math.min(n - 1, i + 1)].p;
      const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1; nrm.push([tz / l, -tx / l]);
    }
    for (const sg of [1, -1]) {
      const off = (i, d) => [T[i].p[0] + nrm[i][0] * d * sg, T[i].p[1] + nrm[i][1] * d * sg];
      const quads = n - (closed ? 0 : 1), ok = [];
      for (let i = 0; i < quads; i++) { const j = (i + 1) % n; ok.push([off(i, a0), off(i, a1), off(j, a0), off(j, a1)].every(([x, z]) => clearOf(x, z))); }
      const runs = []; // [first quad, count]
      if (ok.every(Boolean) && closed) runs.push(null);
      else {
        const start = closed ? ok.findIndex((v) => !v) : 0;
        let cur = null;
        for (let k = 0; k <= quads; k++) {
          const i = closed ? (start + k) % quads : k, on = k < quads && ok[i];
          if (on && !cur) cur = [i, 0];
          if (on) cur[1]++;
          if (!on && cur) { runs.push(cur); cur = null; }
        }
      }
      for (const r of runs) {
        if (r === null) { // the whole loop: a ring between the two offsets
          const in0 = T.map((_, i) => off(i, a0)), in1 = T.map((_, i) => off(i, a1));
          const area = (pts) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
          const [o, h] = Math.abs(area(in0)) > Math.abs(area(in1)) ? [in0, in1] : [in1, in0];
          walls.push({ outline: o, holes: [h] });
          continue;
        }
        if (r[1] < 2) continue;
        const idx = []; for (let k = 0; k <= r[1]; k++) idx.push((r[0] + k) % n);
        walls.push({ outline: [...idx.map((i) => off(i, a0)), ...idx.slice().reverse().map((i) => off(i, a1))], holes: [] });
        if (T === tStop) keep.push({ i: idx[0], sg, th: T[idx[0]].th });
      }
    }
  }
  for (const w of walls) flat(groovePart, w.outline, wallH, wallY, amberDeep, w.holes);
  const rOut = Math.hypot(...tStart.find(q=>q.th===100).p), rIn = Math.hypot(...tStart[0].p); // the stop track's and the neutral radius

  // AK and its follower are built together below, after the fixed rocker axis is known.
  const N173 = { x: C.x + Math.cos(gapAt + 41 * D) * CAM_R.ak, z: C.z + Math.sin(gapAt + 41 * D) * CAM_R.ak }; // estimated contact location
  // the angular part (lug) on the ring wall that pushes the start lever clear near 340 deg: a ramp that rises
  // over 12 degrees ahead of 340 (the side that meets the lever first) and drops at its back
  const F248 = START_LEVER.finger, f248A = camAngle(F248.x, F248.z);
  const lugA = f248A + CAM.startClear * D, LUG = { r0: CAM_R.ring[1], h: 0.0032, rise: 12, top: 3 };
  const lugR = (rel) => (rel < -LUG.rise || rel > LUG.top) ? 0 : rel < -2 ? (LUG.h * (rel + LUG.rise)) / (LUG.rise - 2) : LUG.h; // how far it stands out past the ring wall at rel deg from 340
  {
    const pts = [];
    for (let i = 0; i <= 30; i++) { const rel = -LUG.rise + ((LUG.rise + LUG.top) * i) / 30; pts.push(polar(lugA + rel * D, LUG.r0 + lugR(rel))); }
    for (let i = 30; i >= 0; i--) { const rel = -LUG.rise + ((LUG.rise + LUG.top) * i) / 30; pts.push(polar(lugA + rel * D, CAM_R.ring[0] + 0.0004)); }
    const lug = flat(camSpin, pts, wallH, wallY, amberDeep); lug.userData.part = 'cam';
  }
  // the axle (208) up through the hub from under the die-cast bracket (171) to the dish floor, with a spring clip
  // under the hub, a spacer down to the bracket and its nut under the bracket's boss
  const CB = CAM_BRACKET, cbTop = CB.y + CB.t / 2, cbBottom = CB.y - CB.t / 2, cbBoss = cbBottom - CB.boss;
  const axle = part('camAxle', root, { name: 'Main cam axle with its spacer, spring clip and nut (fixed)', no: '208 / 169' });
  post(axle, 0.0030, cbBoss - 0.0012, -0.0116, steel(), C.x, C.z);
  // Retainer166 is drawn with207 below; no duplicate unnumbered ring here.
  add(axle, lathe([[0.0031, CAM_Y.hub[0] - 0.0012], [0.0046, CAM_Y.hub[0] - 0.0012], [0.0046, cbTop], [0.0031, cbTop]], 24), zinc(), C.x, 0, C.z); // spacer (169, ID)
  add(axle, new THREE.CylinderGeometry(0.0047, 0.0047, 0.0016, 6), steel(), C.x, cbBoss - 0.0008, C.z); // its nut under the bracket (Fig. 31)

  // ---- the die-cast bracket under the cam (171, ID): from round the platter's bearing to the cam's axle -------
  // (Fig. 31, MAARC rb-018 / A2): a broad aluminium casting that hides the cam's quarter toward the spindle, with a
  // stamped plate screwed under it
  const cb = part('camBracket', root, { name: 'Die-cast bracket under the cam and the platter bearing, carrying the cam\'s axle (identification estimate)', no: '171' });
  {
    const cast = mat(0x9fa2a1, 0.6, 0.6); // die-cast aluminium: grey, satin, not polished
    const len = Math.hypot(C.x, C.z), ux = C.x / len, uz = C.z / len, nx = -uz, nz = ux; // spindle -> cam, and across
    const at = (along, off) => [ux * along + nx * off, uz * along + nz * off];
    const toS = ang(-C.x, -C.z), pts = [];
    for (const off of [-1, 1]) pts.push(at(-CB.back, off * CB.w / 2), at(len * 0.3, off * CB.w / 2));
    for (let i = 0; i <= 12; i++) { const a = toS + (-CB.fan + (2 * CB.fan * i) / 12) * D; pts.push([C.x + Math.cos(a) * CB.fanR, C.z + Math.sin(a) * CB.fanR]); }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; pts.push([C.x + Math.cos(a) * 0.0105, C.z + Math.sin(a) * 0.0105]); } // round the axle's boss
    const outline = hull2(pts);
    const body = add(cb, plate(outline, CB.t, [circle(0, 0, CB.hole, 40), [C.x, C.z, 0.0031]], 0.0009), cast, 0, CB.y, 0); // a deep bevel: cast edges, not cut ones
    body.castShadow = true;
    // a deep skirt round its edge (it reads as a block from below, A2/A3), left off where the cam rocker's arm passes
    // under it (its side toward the back near the bearing) and round the axle's end
    {
      const inner = offsetLoop(outline, -CB.skirt.w / 2), n = inner.length, ok = inner.map(([x, z]) => { const a = x * ux + z * uz, o = x * nx + z * nz; return !(o < -0.006 && a < 0.026) && a < len - 0.004; });
      const h = cbBottom - CB.skirt.bottom, y = (cbBottom + CB.skirt.bottom) / 2 + 0.00005;
      const start = ok.findIndex((v) => !v);
      let run = [];
      for (let k = 0; k <= n; k++) {
        const i = (start + k) % n;
        if (k < n && ok[i]) { run.push(inner[i]); continue; }
        if (run.length >= 2) flat(cb, strap(run, CB.skirt.w, 2), h, y, cast);
        run = [];
      }
    }
    // bosses under it: a ring round the bearing, one round the axle, and two ribs between them
    flat(cb, ring(CB.hole, CB.hole + 0.0032, 48).outline, CB.boss, cbBottom - CB.boss / 2 + 0.00005, cast, [ring(CB.hole, CB.hole + 0.0032, 48).hole]);
    flat(cb, circle(C.x, C.z, 0.0072, 32), CB.boss, cbBottom - CB.boss / 2 + 0.00005, cast, [[C.x, C.z, 0.0031]]);
    for (const off of [-1, 1]) flat(cb, strap([at(CB.hole + 0.003, off * 0.0085), at(len - 0.0075, off * 0.0060)], 0.0022, 4), CB.boss, cbBottom - CB.boss / 2 + 0.00005, cast);
    // the stamped plate under it between the ribs, two screws (Fig. 31)
    const pl = [at(len * 0.42, -0.0045), at(len * 0.78, -0.0035), at(len * 0.78, 0.0035), at(len * 0.42, 0.0045)];
    flat(cb, pl, 0.0008, cbBottom - 0.0004 - 0.00005, zinc());
    for (const k of [0.5, 0.7]) add(cb, new THREE.CylinderGeometry(0.0021, 0.0021, 0.0009, 16), steel(), ...((p) => [p[0], cbBottom - 0.0008 - 0.00045, p[1]])(at(len * k, 0)));
  }

  // ---- shut-off lever (162) on its pin (163), under the rim beside the gap ------------------------------------
  // Drawn so that its nose never runs into the dog: each frame the lever turns no further toward the dog than
  // the dog's surface allows (the dog pushes it back once a turn), and the trip slide's hook presses its tail.
  const sl = part('shutoffLever', camSpin);
  const slPiv = polar(slA(SL.pivot.deg), SL.pivot.r), slNose = polar(slA(SL.nose.deg), SL.nose.r), slTail = polar(slA(SL.tail.deg), SL.tail.r);
  const slArm = new THREE.Group(); slArm.position.set(slPiv[0], SL.y, slPiv[1]); sl.add(slArm);
  const nL = [slNose[0] - slPiv[0], slNose[1] - slPiv[1]], tL = [slTail[0] - slPiv[0], slTail[1] - slPiv[1]];
  flat(slArm, strap([tL, [0, 0], nL], SL.w), SL.t, 0, steel(), [[0, 0, 0.0012]]);
  post(sl, 0.0011, SL.y - SL.t / 2, CAM_Y.web[0] + 0.0002, steel(), slPiv[0], slPiv[1], 10); // its pin from the web
  // where a point of the lever is in the world, the lever turned by g (atan2 sense) and the cam at th
  const slWorld = (p, g, th, out) => { const [x, z] = rot(p[0], p[1], g); const [wx, wz] = rot(slPiv[0] + x, slPiv[1] + z, -th * D); out[0] = C.x + wx; out[1] = C.z + wz; return out; };
  const slTmp = [0, 0], slTmp2 = [0, 0], slTmp3 = [0, 0];
  const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-12, t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };

  // ---- deflector207: coaxial crescent under165 (plain1229 Fig24/31) ----
  // Its old off-axis6.2mm gate and invented hinge are removed. The crescent's
  // dimensions, rest angle and operating throw remain estimates. Branch drive
  // from195/173 and finite184-pin contact are NOT yet solved by this drawing.
  const fo = part('follower', camSpin, {name:'Cam deflector207 — coaxial; drive contacts unresolved',no:'207'});
  const gate = new THREE.Group(); fo.add(gate);
  gate.position.set(0,FOLLOWER.y,0);
  gate.userData.aStop=FOLLOWER.stopAngle;
  gate.userData.aStart=FOLLOWER.startAngle;
  gate.userData.unresolved='195/173 actuation and184-pin branch contact; state remains prescribed';
  const deflectorHub=ring(FOLLOWER.boreR,FOLLOWER.hubR,28);
  flat(gate,deflectorHub.outline,FOLLOWER.t,0,steel(),[deflectorHub.hole]);
  flat(gate,strap([[0,FOLLOWER.hubR+.003],[0,FOLLOWER.innerR+.004]],.007),FOLLOWER.t,0,steel());
  flat(gate,arcBand(0,0,FOLLOWER.innerR,FOLLOWER.outerR,20*D,160*D,36),FOLLOWER.t,0,steel());
  // The short folded ear is visible in explodedFig31. Its size is estimated;
  // it is not extended to reach a misplaced actuator or used to force contact.
  const earA=155*D,earR=(FOLLOWER.innerR+FOLLOWER.outerR)/2;
  const ear=add(gate,new THREE.BoxGeometry(.006,FOLLOWER.earHeight,FOLLOWER.t),steel(),earR*Math.cos(earA),FOLLOWER.earHeight/2,earR*Math.sin(earA));
  ear.rotation.y=-earA;
  gate.rotation.y=-FOLLOWER.stopAngle;

  // ---- main lever (184): pin in the groove, stud and cross pin, the broad body, the spade and the lift finger ----
  const ml = part('mainLever', root);
  const mlTurn = new THREE.Group(); mlTurn.position.set(Q.x, ML.y - 0.0022, Q.z); ml.add(mlTurn); // turns about the stud 182
  const mlTilt = new THREE.Group(); mlTurn.add(mlTilt); kit.anchors.mainLever=mlTilt; // tips on the cross pin 183 (2.2 mm under the lever) to lift
  const yL = 0.0022; // the lever's mid-plane in mlTilt's frame
  const pinL = toLever(pin0.x, pin0.z);
  // Fixed stamping outline and installed cap dimensions; no fit to a desired
  // arm sweep or maximum contact height. Photo-derived dimensions remain estimates.
  const padH=SG.y-SG.t/2-AUTO.capBottom, goldM=gold();
  const joint=[.054,0],knee=[.0243,0];
  flat(mlTilt, strap([pinL, [0, 0], knee, joint], ML.w), ML.t, yL, goldM, [[0, 0, 0.0027], [knee[0] * 0.5, knee[1] * 0.5, 0.0013]]);
  // the follower pin up into the groove (its top 0.6 mm under the web)
  const pinTop = AUTO.follower.y;
  add(mlTilt, new THREE.CylinderGeometry(GROOVE.pin, GROOVE.pin, pinTop - yL, 14), steel(), pinL[0], (pinTop + yL) / 2, pinL[1]);
  { // the setscrew with its red daub of paint (MAARC), under the lever
    const sx = (pinL[0] + knee[0] * 0.2) * 0.5, sz = (pinL[1] + knee[1] * 0.2) * 0.5;
    add(mlTilt, new THREE.CylinderGeometry(0.0021, 0.0021, 0.0010, 16), steel(), sx, yL - ML.t / 2 - 0.0005, sz);
    add(mlTilt, new THREE.SphereGeometry(0.0024, 14, 8, 0, TAU, Math.PI * 0.6, Math.PI * 0.4), mat(0xc4231b, 0.1, 0.55), sx, yL - ML.t / 2 - 0.0001, sz);
  }
  // two ears bent down from the lever carry the cross pin (183) through the stud's yoke
  const pierced = (w, h, t, y0) => { const g = plate([[-w / 2, y0], [w / 2, y0], [w / 2, y0 + h], [-w / 2, y0 + h]], t, [[0, 0, 0.00105]], 0.0002); g.rotateX(Math.PI / 2); return g; }; // a block w x h (y from -y0-h to -y0), t deep along z, holed for the pin 183 at the origin
  for (const s of [-1, 1]) add(mlTilt, pierced(0.006, 0.0038, ML.t, -0.00175), goldM, 0, 0, s * 0.0055); // its ears, down to 2 mm under the pin
  { const g = add(part('crossPin', mlTilt, { name: 'Shaft: the main lever\'s cross pin, it tips on it to lift', no: '183 (216 864)' }), new THREE.CylinderGeometry(0.0010, 0.0010, 0.0135, 10), steel(), 0, 0, 0); g.rotation.x = Math.PI / 2; }
  add(mlTurn, pierced(0.0055, 0.0026, 0.0078, -0.0013), goldDark(), 0, 0, 0); // the yoke on top of the stud: it turns with the lever, it does not tip
  // Broad contact face of main lever 184 (manual Fig.16 / underside photographs).
  // Bare184 has one flat face (MAARC p18). The raised step belongs to243.
  // Outline and dimensions remain estimates, sized for the fixed segment pin's swept contact path.
  const spadeP = part('spade', mlTilt);
  {
    const face=AUTO.faceR,fa=AUTO.faceA,finger=AUTO.fingerR,ia=AUTO.fingerA;
    add(spadeP,plate(arcBand(0,0,...face,...fa,96,false),SPADE.t,[],0),goldM,0,AUTO.faceY-SPADE.t/2,0);
    add(spadeP,plate(arcBand(0,0,...finger,...ia,96,false),SPADE.t,[],0),goldM,0,AUTO.fingerY-SPADE.t/2,0);
    // Estimated stamped web joins the bare lift contact to the broad face.
    flat(spadeP,arcBand(0,0,face[1]-.001,finger[0]+.001,...ia,20,false),SPADE.t,AUTO.faceY-SPADE.t/2,goldM);
  }
  // the stud (182) standing up from its bracket (215) under the cam, the bracket's foot screwed under the dish floor
  const mlStud = part('leverStud', root, { name: 'Main lever stud on its bracket under the cam (fixed)', no: '182 / 215' });
  const SB = STUD_BRACKET;
  post(mlStud, 0.0024, SB.y + SB.t / 2, ML.y - 0.0022 - 0.0013, steel(), Q.x, Q.z); // up to the yoke the lever turns on
  {
    const a = [Q.x, Q.z], b = [SB.foot.x, SB.foot.z], d = ang(b[0] - a[0], b[1] - a[1]);
    flat(mlStud, strap([a, b], SB.w, 8), SB.t, SB.y, goldDark(), [[Q.x, Q.z, 0.0012]]);
    const h = -0.0115 - SB.y;
    box(mlStud, SB.t, h, SB.w, goldDark(), b[0] + Math.cos(d) * 0.00075, SB.y + h / 2, b[1] + Math.sin(d) * 0.00075, -d);
    box(mlStud, 0.009, SB.t, SB.w, goldDark(), b[0] + Math.cos(d) * 0.0045, -0.0115 - SB.t / 2, b[1] + Math.sin(d) * 0.0045, -d);
    add(mlStud, new THREE.CylinderGeometry(0.0026, 0.0026, 0.0012, 16), steel(), b[0] + Math.cos(d) * 0.0055, -0.0115 - SB.t - 0.0006, b[1] + Math.sin(d) * 0.0055);
  }

  // ---- tonearm segment (201) under the bearing, turning with the arm -----------------------------------
  const seg = part('segment', root); seg.position.set(P.x, SG.y, P.z);
  const segPlate = new THREE.Group(); seg.add(segPlate);
  const tubeL = ang(lift.x - P.x, lift.z - P.z), tubeR = Math.hypot(lift.x - P.x, lift.z - P.z);
  const segTab = (worldA, aAt) => worldA - (aAt - aMid); // a tab's angle on the segment, from where it must be at arm angle aAt
  const stopTab = sizeStopGeometry.studOffset + aMid;
  const pawlTab = segTab(ang(PAWL.releasePin.x-P.x,PAWL.releasePin.z-P.z),aRest);
  const pawlPinR=Math.hypot(PAWL.releasePin.x-P.x,PAWL.releasePin.z-P.z);
  // Rail253 attachment pin: keep the existing estimated segment-local x/z datum.
  // Source establishes the retained joint, not this angular placement or clearance.
  const swingLo = Math.min(armAng(0.02) - aMid, aIn - aMid, aRest - aMid), swingHi = Math.max(armAng(0.02) - aMid, aIn - aMid, aRest - aMid);
  const linkTab = TRIP_LINK.clearDeg * D - swingLo, linkR = TRIP_LINK.pinR;
  {
    const tA0 = tubeL - (aIn - aMid), tA1 = tubeL - (aRest - aMid), tPad = 10 * D, sl0 = Math.min(tA0, tA1) - tPad, sl1 = Math.max(tA0, tA1) + tPad;
    const g0 = Math.min(angPQ - 50 * D, pawlTab - 8 * D, sl0 - 9 * D), g1 = Math.max(angPQ + 40 * D, sl1 + 9 * D), pts = [];
    for (let i = 0; i <= 28; i++) { const a = g0 + ((g1 - g0) * i) / 28; pts.push(polar(a, SG.r)); }
    for (let i = 0; i <= 16; i++) { const a = g1 + ((TAU - (g1 - g0)) * i) / 16; pts.push(polar(a, 0.010)); } // round the hub
    // the curved slot the fixed lift screw passes through as the arm turns
    const pinHole = circle(...polar(angPQ, SG.padR), SG.cap.pin + 0.0001, 16);
    flat(segPlate, pts, SG.t, 0, gold(), [circle(0, 0, SG.hub, 32), arcBand(0, 0, tubeR - 0.0056, tubeR + 0.0056, sl0, sl1, 24), pinHole]);
    // the tab that frees the pawl on the rest: it runs out under the pawl's tail
    { const p=polar(pawlTab,pawlPinR);
      flat(segPlate,strap([polar(pawlTab,Math.min(SG.r-.003,pawlPinR-.004)),p],.007),SG.t,0,gold());
      kit.name('pawlReleasePin201',post(segPlate,.001,-.01515-SG.y,-SG.t/2,steel(),p[0],p[1],12));
    }
    // the size-stop stud and downward pin retaining the single trip rail253
    kit.name('sizeStopStud', post(segPlate, sizeStopGeometry.studRadius, sizeStopGeometry.studBottom - SG.y, sizeStopGeometry.studTop - SG.y, steel(), ...polar(stopTab, INDEX_SLIDE.stopR)));
    kit.name('tripPin201', post(segPlate, 0.0011, TRIP_LINK.y - TRIP_LINK.t / 2 - 0.0008 - SG.y, -SG.t / 2, steel(), ...polar(linkTab, linkR), 10));
    add(segPlate, lathe([[SG.hub, -SG.t / 2], [0.0065, -SG.t / 2], [0.0065, SG.t / 2 + 0.0010], [SG.hub, SG.t / 2 + 0.0010]], 32), goldDark()); // the hub
    // Arm chain (contracts/arm--cycle.md Y4, agreed): the ear spring 265 hooks to, traced from M-DE p.8
    // Fig.14(b) at r 31.2 mm, -53 deg from the arm (estimate, +-5 mm). A strap out from the hub, its end
    // bent down to the spring's level, with the hook pin. It turns with 201.
    { const ea = aMid + SKATE_ANCHOR.turn, r1 = SKATE_ANCHOR.pinR + 0.0022;
      flat(segPlate, strap([polar(ea, 0.008), polar(ea, r1)], 0.006), SG.t, 0, gold());
      const ear = new THREE.Group(); ear.rotation.y = -ea; segPlate.add(ear);
      const y0 = -SG.t / 2, y1 = SKATE_ANCHOR.y - 0.0010 - SG.y;
      kit.name('skateEar201', box(ear, SG.t, y0 - y1, 0.006, gold(), r1 - SG.t / 2, (y0 + y1) / 2, 0, 0));
      kit.name('skateEarPin201', post(segPlate, 0.0007, y1 + 0.0004, SKATE_ANCHOR.y - SG.y + 0.0012, steel(), ...polar(ea, SKATE_ANCHOR.pinR), 10)); }
  }
  // Guide 229 caps the coupling bolt fixed to segment 201. Its exposed length is an
  // fixed installed estimate, not resized to force contact. Only estimated rubber
  // compression deforms it; axial compliance of the underlying steel pin is unverified.
  const clutch = part('clutch', seg);
  const padMat = mat(0xf1ede3, 0, 0.32, { transparent: true, opacity: 0.86, emissive: new THREE.Color(0x000000) });
  const padSlide = new THREE.Group(); clutch.add(padSlide);
  const CAP = SG.cap, capLen = AUTO.capLength, pinShow = padH - capLen;
  const capMesh=add(padSlide, new THREE.CylinderGeometry(CAP.r, AUTO.capRadius, capLen, 24), padMat, 0, -SG.t / 2 - padH + capLen / 2, 0); // the cap, its tip tapered (the first cylinder: the tests measure it)
  { // its pin, from inside the cap up through its mounting hole, peened over on the segment's top
    const pm = mat(0x1d1d20, 0.3, 0.5), y0 = -SG.t / 2 - pinShow - 0.0015, y1 = SG.t / 2 + 0.0001;
    add(padSlide, new THREE.CylinderGeometry(CAP.pin, CAP.pin, y1 - y0, 10), pm, 0, (y0 + y1) / 2, 0);
    add(padSlide, new THREE.CylinderGeometry(0.0012, 0.0013, 0.0003, 12), pm, 0, SG.t / 2 + 0.00017, 0); // its head, just clear of the plate
  }

  // ---- bridge strap (157): the long strap the mechanism hangs under ---------------------------------------
  // Exploded view p.19 (Fig. 31 in manual1229.pdf, Fig. 29 in the Q manual) (157, "Ständer"): one pressed strap, a leg bent up at each end and a foot turned outward on
  // each leg, screwed under the dish floor (left) and the plate (right). Drawn with the shared bent-sheet
  // helper. Kept from the former box drawing: the strap's height and holes, each leg's midplane 0.5 mm
  // inside the strap's end point, each foot's top on its mounting face and its screw 6 mm out. Bend
  // radius: estimate. (The drawing also shows slots in the long leg; not drawn, positions unknown.)
  const br = part('bridge', root, { name: 'Stand (Ständer): strap with bent legs and feet, the mechanism hangs from it', no: '157' });
  {
    const a = [BRIDGE.a.x, BRIDGE.a.z], b = [BRIDGE.b.x, BRIDGE.b.z], d = ang(b[0] - a[0], b[1] - a[1]);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = 0.0015, r = 0.0015, R = r + t / 2, hw = BRIDGE.w / 2;
    const cd = Math.cos(d), sd = Math.sin(d), local = ([x, z]) => [(x - a[0]) * cd + (z - a[1]) * sd, -(x - a[0]) * sd + (z - a[1]) * cd];
    const e0 = 0.0005 + R, e1 = L - 0.0005 - R; // bend lines: after 90 deg the legs' midplanes are 0.5 mm inside the ends
    const leg = (top, edge) => {
      const rise = top - t / 2 - BRIDGE.y - 2 * R, out = R - 0.0005; // foot starts this far out past the end point
      return { edge, angle: Math.PI / 2, r, len: rise,
        flanges: [{ edge: [[0, rise], [BRIDGE.w, rise]], angle: -Math.PI / 2, r, len: 0.012 - out, holes: [[hw, 0.006 - out, 0.0016]] }] };
    };
    const geo = sheetGeo({ outline: [[e0, -hw], [e1, -hw], [e1, hw], [e0, hw]], t,
      holes: BRIDGE.holes.map((h) => [...local([h.x, h.z]), 0.0016]),
      flanges: [leg(-0.0115, [[e0, -hw], [e0, hw]]), leg(-0.0015, [[e1, -hw], [e1, hw]])] });
    const m = add(br, geo, gold(), a[0], BRIDGE.y, a[1]); m.rotation.y = -d;
    for (const [p, top, s] of [[a, -0.0115, 1], [b, -0.0015, -1]]) { // the screw heads under the feet
      const fx = p[0] - cd * s * 0.006, fz = p[1] - sd * s * 0.006;
      add(br, new THREE.CylinderGeometry(0.0028, 0.0028, 0.0014, 16), steel(), fx, top - t - 0.0007, fz);
    }
  }

  // ---- one rigid formed trip rail 253 (plain1229 p.7 and Fig.31) -----------------------------
  // Its outer eye sits below201 on the retained pin, with271/272 below the eye.
  // Formed offsets, length and seat location are estimates, frozen at build time.
  // No second link or joint: the source shows one stamped/ribbed component.
  const so = part('shutoffSlide', root, { name: 'Rigid trip rail253: slips on201 at271, guided through a fixed aperture (guide position estimated)', no: '253' });
  const soSlide = new THREE.Group(); so.add(soSlide); kit.name('tripRail253', soSlide);
  // Same datum as trip-rail.js (the shared contact solution); asserted equal so the two cannot drift apart.
  if (Math.abs(linkTab - LINK_TAB) > 1e-9 || Math.abs(linkR - LINK_R) > 1e-12) throw new Error('rail253 eye datum differs from trip-rail.js');
  const railLength = RAIL_LENGTH, SLOT = 0.0035; // eye slot half-length along the rail (E)
  const railStep = railLength - Math.hypot(SO.end.x - SO.hook.x, SO.end.z - SO.hook.z); // where the rail steps down (E, as before)
  const railAt = (x) => [soSlide.position.x + Math.cos(-soSlide.rotation.y) * x, soSlide.position.z + Math.sin(-soSlide.rotation.y) * x];
  soSlide.userData.length = railLength; soSlide.userData.slot = SLOT;
  soSlide.userData.yawBoundary = 'solved: eye on 201 pin, axis through fixed aperture G (G position estimated)';
  {
    const m = bright(), stepEnd = railStep + .003;
    // Outer flat with a slot for the201 pin (slip washer271 below); the step is part of the same rigid rail.
    flat(soSlide, strap([[0, 0], [railStep, 0]], TRIP_LINK.w, 6), TRIP_LINK.t, TRIP_LINK.y, m, [strap([[-SLOT, 0], [SLOT, 0]], .0022, 6)]);
    const dy = SO.y - TRIP_LINK.y, dx = stepEnd - railStep;
    const bend = box(soSlide, Math.hypot(dx, dy), SO.t, SO.w, m, (railStep + stepEnd) / 2, (SO.y + TRIP_LINK.y) / 2, 0);
    bend.rotation.z = Math.atan2(dy, dx);
    flat(soSlide, strap([[stepEnd, 0], [railLength, 0]], SO.w, 6), SO.t, SO.y, m, [[railLength - SHUTOFF_BALL.fromTip, 0, SHUTOFF_BALL.seat]]);
    for (const side of [-1, 1]) flat(soSlide, strap([[stepEnd + .002, side * .0011], [railLength - .006, side * .0011]], .0007, 2), .0004, SO.y + SO.t / 2 + .0002, m);
    // Bent-down tab at the tip, through the floor aperture to162's layer: its eye-side face pulls the tail.
    const bottom = SL.y - SL.t / 2 - 0.0005;
    box(soSlide, SO.t, SO.y - bottom, 2 * SO.hookR + .0012, m, railLength, (SO.y + bottom) / 2, 0);
    const eye = new THREE.Object3D(); eye.position.set(0, TRIP_LINK.y, 0); soSlide.add(eye); kit.name('tripEye253', eye);
    const tip = new THREE.Object3D(); tip.position.set(railLength, SL.y, 0); soSlide.add(tip); kit.name('tripTip253', tip);
  }

  // ---- operating switch: 196 on the switch's shaft, switch lever 195, both on axis of the lever 48 / pin 192 ----
  const Lv = AXES.lever;
  const swl = part('switchLever', root);
  const l196 = new THREE.Group(); l196.position.set(Lv.x, -0.0080, Lv.z); part('startLever196', root, { name: 'Start lever, complete, clamped on the operating switch\'s shaft (screw 197)', no: '196 (216 773) / 197' }).add(l196);
  const tipA = ang(SWITCH_LEVER.tip.x - Lv.x, SWITCH_LEVER.tip.z - Lv.z);
  {
    const e = polar(tipA, 0.012), m = gold();
    flat(l196, strap([[0, 0], e], 0.008), 0.0015, 0, m, [[0, 0, 0.0018]]);
    flat(l196, [[0.004, 0.003], [0.0075, 0], [0.004, -0.003]], 0.0016, -0.0012, darkSteel()); // the arrow-shaped catch (Fig. 31)
    post(l196, 0.0045, -0.001, 0.0045, steel(), 0, 0, 20); // its clamp on the shaft (197)
  }
  const l195 = new THREE.Group(); l195.position.set(SHAFT_192.x, SWITCH_LEVER.y, SHAFT_192.z); swl.add(l195);
  const t195 = [SWITCH_LEVER.tip.x - SHAFT_192.x, SWITCH_LEVER.tip.z - SHAFT_192.z];
  flat(l195, strap([[0, 0], t195], 0.0085), 0.0015, 0, gold(), [[0, 0, 0.0016]]);
  post(l195, 0.001, 0, -0.0080 - SWITCH_LEVER.y, steel(), t195[0], t195[1], 10); // its pin up into 196's slot

  // ---- switch arm (188) on the grooved pin (192): its finger on the cam's flange, its link, its long arm --------
  const sw = part('switchArm', root, { name: 'Switch arm (idler connection schematic)' });
  post(sw, 0.0012, SHAFT_192.y - 0.0025, -0.0116, steel(), SHAFT_192.x, SHAFT_192.z, 12); // the pin, from under the dish floor
  for (let i = 0; i < 2; i++) add(sw, new THREE.TorusGeometry(0.0013, 0.0003, 4, 12), darkSteel(), SHAFT_192.x, SHAFT_192.y - 0.0018 + i * 0.0072, SHAFT_192.z).rotation.x = Math.PI / 2;
  const a188 = new THREE.Group(); a188.position.set(SHAFT_192.x, SHAFT_192.y, SHAFT_192.z); sw.add(a188);
  const loc = (p) => [p.x - SHAFT_192.x, p.z - SHAFT_192.z];
  const fin = loc(F188), spr = loc(SWITCH_ARM.spring), elbow = [fin[0] * 0.55 + 0.004, fin[1] * 0.55 + 0.004];
  const stub = [0.0060, -0.0105];
  {
    const m = gold();
    flat(a188, strap([spr, [0, 0], stub], 0.0075), 0.0015, 0, m, [[0, 0, 0.0016], [spr[0], spr[1], 0.0011], [stub[0], stub[1], 0.0010]]); // the short part
    flat(a188, strap([[0, 0], elbow, fin], 0.0068), 0.0015, -0.0016, m, [[0, 0, 0.0016]]); // the long part, screwed to it (189)
    // the finger, turned up beside the flange's edge
    const fd = ang(C.x - F188.x, C.z - F188.z); // thin toward the cam's centre, wide along the flange's edge
    const f0 = -0.0016 - 0.00075, f1 = CAM_Y.flange[1] - SHAFT_192.y; // from the long part up beside the flange
    box(a188, 0.0015, f1 - f0, 0.0040, m, fin[0], (f0 + f1) / 2, fin[1], -fd);
    add(a188, new THREE.CylinderGeometry(0.0021, 0.0021, 0.0010, 14), steel(), 0.006, -0.0029, 0.004); // screw 189
  }
  // Fidelity limit: Q manual p.11 Fig.17 establishes 188 -> tension spring -> 134,
  // and Fig.29 shows a long cranked 188. It does NOT establish this bent-wire routing.
  // These connectors are a schematic: their endpoint follows the real drive anchor,
  // but rodBetween changes the last segment's length as the idler moves. They are
  // not a rigid mechanical reconstruction. Missing evidence: the measured 188 outline,
  // its spring hooks and free/working length, and the attachment on 134 through its travel.
  const linkageFidelity = { status: 'schematic', source: '1229Q manual p.11 Fig.17; p.19 Fig.29',
    unresolved: 'Idler connection routing and rigid length; drawn connector changes length with endpoint motion',
    needed: 'Measured switch arm 188 outline, spring endpoints/free length, and attachment on support 134' };
  sw.userData.linkageFidelity = linkageFidelity;
  const route = SWITCH_ARM.route;
  const wireRods = [...route, 0].map(() => rod('switchArm', 0.0006, zinc())); // schematic connector segments
  for (const mesh of wireRods) mesh.userData.linkageFidelity = linkageFidelity;
  const sprCoil = add(part('switchArm', root), helixGeo(1, 0.0016, 12, 0.00033), steel());
  // the rocker's rod (drive) tips with the speed setting: where its top is under the anchor, found by a ray from above
  // (the drive is drawn first each frame). Settled, the rod stands still, so the answer is kept until the setting
  // changes; while a speed change is under way it is found again every frame, as the drive carries the idler (and so
  // the rod) on from wherever it was drawn when a change starts over, not from the snapshot alone.
  const rodRay = new THREE.Raycaster(), rodTop = { key: null, y: -0.0215 };
  const rockerTop = (s, rk) => {
    const key = s.shift < 1 ? null : `${s.step}|${s.speed}|${s.pitch}`;
    if (key !== null && key === rodTop.key) return rodTop.y;
    const meshes = ['speedLink', 'rocker'].flatMap((k) => (kit.parts[k] ? kit.parts[k].meshes : []));
    if (!meshes.length) return rodTop.y;
    for (const m of meshes) m.updateWorldMatrix(true, false);
    rodRay.set(tmpC.set(rk.x, -0.012, rk.z), tmpD.set(0, -1, 0)); rodRay.far = 0.03;
    const hit = rodRay.intersectObjects(meshes, false)[0];
    rodTop.key = key; rodTop.y = hit ? hit.point.y : -0.0215;
    return rodTop.y;
  };
  // Plain1229p12 andFig26:273 is hinged ON188, not on a chassis post.
  // Rigid188 extension replaces the three stretching connector rods. Its cranked
  // profile/height are estimates;273's notch/contact geometry is not a solved latch.
  const pawlLocal=rot(PAWL.x-SHAFT_192.x,PAWL.z-SHAFT_192.z,-PAWL.photoYaw);
  const pawlY=PAWL.y-SHAFT_192.y;
  const bend=[pawlLocal[0]*.65,pawlLocal[1]*.65];
  flat(a188,strap([stub,bend],.008),.0015,0,gold());
  flat(a188,strap([bend,pawlLocal],.009),.0015,pawlY-.0015,gold());
  const rise=add(a188,new THREE.BoxGeometry(.008,pawlY-.0015,.0015),gold(),bend[0],(pawlY-.0015)/2,bend[1]);
  rise.rotation.y=-ang(pawlLocal[0]-bend[0],pawlLocal[1]-bend[1]);
  const pw=part('pawl',a188,{name:'Pawl273 on188; latch contacts unresolved',no:'273'});
  const pawl=new THREE.Group();pawl.position.set(pawlLocal[0],pawlY,pawlLocal[1]);pw.add(pawl);
  pawl.userData.unresolved='201/273/274 contact profile and spring preload; pawl state remains prescribed';
  const pawlShape=new THREE.Group();pawlShape.rotation.y=-(PAWL.baseAngle-PAWL.photoYaw);pawl.add(pawlShape);
  // Long slotted/notched stamping inFig26/31. This outline is an estimate, not
  // the failed contact solver's fitted working faces; no causal claim is made.
  flat(pawlShape,[[-.005,-.005],[.009,-.007],[.045,-.007],[.050,-.021],[.060,-.021],[.061,-.011],[.050,.007],[.009,.007],[-.005,.005]],PAWL.t,0,gold(),[
    circle(0,0,.0012,16),[[.010,-.004],[.038,-.004],[.038,-.006],[.049,-.006],[.049,.004],[.010,.004]]]);
  post(pw,.0011,pawlY-.002,pawlY+.0012,steel(),pawlLocal[0],pawlLocal[1],12);
  const fixedPawl=part('pawl',root);
  box(fixedPawl,.0045,.003,.0045,darkSteel(),PAWL.bolt.x,PAWL.y+.0015,PAWL.bolt.z);
  post(fixedPawl,.0014,PAWL.y+.003,-.0015,steel(),PAWL.bolt.x,PAWL.bolt.z,12);

  // ---- start lever (248): from beside the operating switch to the cam's ring wall --------------------------------
  const stl = part('startLever', root);
  const st = new THREE.Group(); st.position.set(0, START_LEVER.y, 0); stl.add(st);
  const G248 = START_LEVER.guide, fL = [F248.x - G248.x, F248.z - G248.z], fDir = ang(fL[0], fL[1]), fLen = Math.hypot(fL[0], fL[1]);
  const finRing = CAM_R.ring[1] + 0.0002 + 0.00075; // the finger's middle, its face 0.2 mm off the ring wall
  // where the finger stands when pulled in: on the line from the guide, just off the ring wall
  const pullK = (() => { let lo = 0.5, hi = 1.3; for (let i = 0; i < 40; i++) { const k = (lo + hi) / 2, x = G248.x + fL[0] * k, z = G248.z + fL[1] * k; if (Math.hypot(x - C.x, z - C.z) > finRing) lo = k; else hi = k; } return lo; })();
  {
    const m = gold(), W = START_LEVER.w;
    const along = (k, off = 0) => [G248.x + Math.cos(fDir) * fLen * k - Math.sin(fDir) * off, G248.z + Math.sin(fDir) * fLen * k + Math.cos(fDir) * off];
    const pv = [START_LEVER.pivot.x, START_LEVER.pivot.z], back = (() => { const d = Math.hypot(pv[0] - G248.x, pv[1] - G248.z); return -d / fLen - 0.02; })();
    const e = pullK;
    const outline = [along(back, -0.005), along(0.1, -W * 0.35), along(0.42, -W * 0.5), along(0.78, -0.007), along(e - 0.03, -0.0035), along(e, -0.0028), along(e + 0.012, 0), along(e, 0.0028), along(e - 0.03, 0.0035), along(0.7, 0.0075), along(0.35, W * 0.5), along(0.1, W * 0.4), along(back, 0.005), along(back - 0.03, 0)];
    const arrow = [along(0.32, -0.0035), along(0.42, 0), along(0.32, 0.0035), along(0.35, 0)];
    flat(st, outline, 0.0015, 0, m, [strap([along(-0.012), along(0.03)], 0.0028, 6), arrow]); // a slot on its guide pin: it slides
    const f = along(e, 0);
    const fh = -0.0180 - START_LEVER.y; // up beside the ring wall into its lower half
    box(st, 0.0015, fh, 0.005, m, f[0], fh / 2, f[1], -fDir); // the finger, turned up against the ring wall (thin toward the cam)
  }
  post(stl, 0.0013, START_LEVER.y - 0.0018, -0.0015, steel(), G248.x, G248.z, 12); // its guide pin
  // how far back the lug has pushed it at cam angle th (deg): rides up the lug's ramp, then held clear
  const fHalf = (0.0025 / finRing) / D + 0.6; // the finger's half width, in degrees round the cam
  const lugPush = (th) => { const rel = th - CAM.startClear, m = Math.max(lugR(rel - fHalf), lugR(rel), lugR(rel + fHalf), lugR(Math.min(-2, rel + fHalf))); return m > 0 ? m + 0.0004 : 0; };

  // ---- cam rocker (173) and the change stud (177) under the spindle -------------------------------------------
  const cr = part('camRocker', root);
  const crG = kit.name('changerRocker', new THREE.Group()); crG.position.set(CAM_ROCKER.pivot.x, CAM_ROCKER.y, CAM_ROCKER.pivot.z); cr.add(crG);
  const crA = [-CAM_ROCKER.pivot.x, -CAM_ROCKER.pivot.z], crN = [N173.x - CAM_ROCKER.pivot.x, N173.z - CAM_ROCKER.pivot.z];
  {
    const m = gold();
    add(crG, rockerSheet(crA, crN), m); // pressed sheet with its side wall (changer.js)
  }
  const crAxis = (() => { const dx = crN[0] - crA[0], dz = crN[1] - crA[1], l = Math.hypot(dx, dz); return V3(-dz / l, 0, dx / l); })();
  const poseChangerCam = buildChangerCam(kit, { camSpin, crG, crN, crA, crAxis, center: C, nib: N173, material: amberDeep });

  // ---- muting switch: a cream block behind the cam, two leaf springs to the cam's flange ----------------------------
  const mu = part('muting', root);
  {
    const [x0, x1] = MUTING.x, [z0, z1] = MUTING.z, [y0, y1] = MUTING.y;
    box(mu, x1 - x0, y1 - y0, z1 - z0, cream(), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    for (const x of [x0 + 0.006, x1 - 0.006]) add(mu, new THREE.CylinderGeometry(0.0022, 0.0022, 0.0012, 14), steel(), x, y0 - 0.0006, (z0 + z1) / 2);
  }
  // Two in-plane cantilevers: fixed roots and shorting bars, cam-constrained tips.
  // The same beam/contact solution drives the electrical mute state.
  const leaves = [];
  for (const [k, data] of MUTE_LEAVES.entries()) {
    const g=new THREE.Group();g.position.set(data.rootX,data.y,data.rootZ);mu.add(g);
    const n=24,pos=new Float32Array((n+1)*12),indices=[];
    for(let i=0;i<n;i++)for(const [a,b]of[[0,1],[1,2],[2,3],[3,0]]){const j=i*4;indices.push(j+a,j+b,j+4+a,j+b,j+4+b,j+4+a);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setIndex(indices);
    const leaf=add(g,geo,brass()),dot=add(g,new THREE.SphereGeometry(.0007,10,6),mats.steel());
    const moving=kit.name('mutingMoving'+k,add(mu,new THREE.SphereGeometry(MUTING.contactR,12,8),mats.steel()));
    const initial=muteLeafPose(0,k),f=initial.fixed;
    const fixed=kit.name('mutingFixed'+k,add(mu,new THREE.SphereGeometry(MUTING.contactR,12,8),mats.steel(),f.x,f.y,f.z));
    const bar=add(mu,new THREE.CylinderGeometry(.0003,.0003,1,10),brass());
    rodBetween(bar,V3(data.rootX,data.y-.0003,data.rootZ-.001),V3(f.x,f.y,f.z));
    box(g,.002,.0014,.0014,brass(),0,.0004,-.0005);
    leaves.push({g,leaf,dot,moving,fixed,n,data});
  }

  // ---- record size: indexing lever (49) with its eccentric (276), arm positioning slide (255) ------------------------
  const Z = AXES.size;
  const ix = part('indexLever', root);
  const ixArm = new THREE.Group(); ixArm.position.set(Z.x, INDEX_SLIDE.y + .002, Z.z); ix.add(ixArm);
  flat(ixArm, strap([[0, 0], [-0.016, -0.006]], 0.007), 0.0015, 0, gold(), [[0, 0, 0.0018]]);
  const ecc = new THREE.Group(); ecc.position.set(Z.x, INDEX_SLIDE.y + .0035, Z.z); ix.add(ecc);
  { const pts = [[0, 0]]; for (let i = 0; i <= 12; i++) { const a = (-40 + (i / 12) * 80) * D, r = 0.010 + 0.004 * (i / 12); pts.push(polar(a, r)); } flat(ecc, pts, 0.0015, 0, mat(0x6f6d68, 0.1, 0.55)); post(ecc, 0.0035, -0.0008, 0.0008, mat(0x6f6d68, 0.1, 0.55), 0, 0); }
  // The original upper selector shaft continues down to this relocated underside assembly.
  post(ix, .0016, INDEX_SLIDE.y + .002, -.0058, steel(), Z.x, Z.z, 14);
  const slideG = kit.name('sizeStopSlide255', new THREE.Group()); ix.add(slideG);
  // Fixed selector-stop geometry is shared with the mechanism. Its physical contact
  // determines set-down radius; the drawing never builds a stop from desired radius.
  // The eccentric-to-slide positioning remains a reconstructed selector constraint.
  const postR = sizeStopGeometry.postRadius;
  const postAt = (size) => { const p=stopPost(size,sizeStopGeometry); return [p.x,p.z]; };
  const X12 = postAt(12), F255 = INDEX_SLIDE.front, slDir = ang(X12[0] - F255.x, X12[1] - F255.z), slLen = Math.hypot(X12[0] - F255.x, X12[1] - F255.z);
  const slAt = (k, off = 0) => [F255.x + Math.cos(slDir) * slLen * k - Math.sin(slDir) * off, F255.z + Math.sin(slDir) * slLen * k + Math.cos(slDir) * off];
  // For each size the indexing eccentric sets the slide along its slot and swings it a little about its front end, so the
  // post lands just ahead of the stud's set-down place (Fig. 14: the eccentric and the indexing lever set the set-down
  // points). The slide as a rigid body: turned by a about its front end, then moved t along itself.
  const postTop=sizeStopGeometry.postTop; // neutral clearance and finite rise share engine data
  {
    const m = gold(), w = INDEX_SLIDE.w;
    const slot = strap([slAt(0.13), slAt(0.27)], 0.0028, 6);
    flat(slideG, strap([slAt(-0.02), slAt(0.84)], w, 4), INDEX_SLIDE.t, INDEX_SLIDE.y, m, [slot, [...slAt(0.6), 0.0012]]);
    flat(slideG, strap([slAt(0.82), slAt(1.0)], 0.006, 4), INDEX_SLIDE.t, INDEX_SLIDE.y, m); // the narrowed back end
    kit.name('sizeStopPost255', post(slideG, postR, sizeStopGeometry.postBottom, postTop, steel(), X12[0], X12[1], 12));
  }
  post(ix, 0.0012, INDEX_SLIDE.y - 0.0016, -0.0015, steel(), ...slAt(0.2), 10); // the pin in its slot
  // Manual p.10: rocker 257 raises the complete rigid slide into engagement.

  // ---- moving it all -------------------------------------------------------------------------------------
  const SIZE_TURN = { 7: 1, 10: 0, 12: -1 };
  const look = { sw: 0, mute: 0, init: false };
  const PIN_T = SPEC.pinionTeeth, toothA = TAU / SPEC.camTeeth, G0 = 0.25 - (((gapAt - Math.PI) / (TAU / PIN_T)) % 1 + 1) % 1;
  const dogC = [0, 0], soB = [0, 0];
  // s: mechanism snapshot; ctx: { armAngle (the arm's yaw, as arm.angleFor) }
  function update(dt, s, ctx) {
    const rk = kit.anchors.rocker;
    const th = s.camOn ? s.theta : 0, turning = s.camTurning;
    const k = Math.min(1, dt * 14);
    if (!look.init) { look.sw = s.switchOn ? 1 : 0; look.init = true; }
    // dog and cam: driven, never driving. The cam's teeth are turned by the fraction of a tooth that makes them
    // mesh with the pinion's (the cam picks up wherever the platter stands when it engages)
    const ph = s.platterTurns * TAU;
    dog.rotation.y = -(ph + dogPhase0()); // the same dog datum the trip contacts use (trip-rail.js)
    camSpin.rotation.y = th * D;
    { const pin = ((s.platterTurns * PIN_T) % 1 + 1) % 1, camT = ((th / 360) * SPEC.camTeeth) % 1; camTeeth.rotation.y = ((((pin - camT + G0) % 1) + 1) % 1) * toothA * (turning ? 1 : 0); }
    // Segment201 shares the rendered tonearm yaw shaft, including view interpolation.
    const armA = Number.isFinite(ctx.armAngle) ? ctx.armAngle : armAng(s.r);
    //165 is causal: the rigid follower solves against the fixed channel roof.
    // Current arm position can affect friction/compression, never184 pose.
    const pose=s.autoPose||automaticPose(th,s.inSwing?'start':'stop');
    mlTurn.rotation.y=-(base+pose.beta);mlTilt.rotation.z=pose.tilt;
    const contact=capContact(pose,armA),compression=contact.compression;
    capMesh.scale.y=(capLen-compression)/capLen;
    capMesh.position.y=AUTO.capBottom-SG.y+capLen/2+compression/2;
    ml.userData.contact={...contact,profileValid:pose.valid};
    // segment, turning with the arm
    seg.rotation.y = -(armA - aMid);
    padSlide.position.set(Math.cos(angPQ) * SG.padR, 0, Math.sin(angPQ) * SG.padR); // fixed on the segment
    // the pad: green while it grips and carries the arm, amber flicker while it slips on the spade
    padMat.emissive.setHex(!s.clutch ? 0x000000 : s.slip ? 0xff9a1a : 0x22c55e);
    padMat.emissiveIntensity = !s.clutch ? 0 : s.slip ? 0.6 + 0.4 * Math.sin(s.platterTurns * 40) : 0.8;
    // Trip chain (trip-rail.js): rail253 and lever162 drawn from the mechanism's solved contact state.
    // The rail's eye stays on the201 pin of the drawn segment; only its slip d and162's angle g come from
    // the snapshot. At the cam's neutral the lever sits where the contacts left it; while the cam turns it
    // rides on the cam at that angle.
    // One contact step on a copy keeps the drawing consistent when the drawn arm angle differs from the
    // mechanism's (view interpolation, or a snapshot posed by hand): the tab never passes the tail and the
    // lever never passes the dog. It does not feed back into the mechanism.
    const tripFresh = initialTripState();
    const tst = { ...tripFresh, g: Number.isFinite(s.tripG) ? s.tripG : tripFresh.g, d: Number.isFinite(s.tripD) ? s.tripD : tripFresh.d };
    stepTrip(tst, { armA, th, ph: s.platterTurns * TAU, camFree: !turning });
    const g = tst.g, dRail = tst.d;
    slArm.rotation.y = -g;
    const rp = railPose(armA, dRail);
    soSlide.userData.tailGap = soSlide.userData.targetResidual = tabSlack(tst, armA, th); // tab face to162 tail (m); 0 = bearing
    soB[0] = rp.eye[0]; soB[1] = rp.eye[1];
    soSlide.position.set(rp.origin[0], 0, rp.origin[1]); soSlide.rotation.y = -rp.yaw;
    soSlide.userData.slip = rp.slot; soSlide.userData.inAperture = rp.inAperture; soSlide.userData.eye = rp.eye;
    // cam follower: "start" closes the stop track, "stop" the in-swing track
    gate.rotation.y = -(s.follower === 'start' ? gate.userData.aStart : gate.userData.aStop);
    // operating switch: 196 turns with the lever; 195 and the switch arm turn on 192
    l196.rotation.y = -(s.lever === 'start' ? -0.3 : s.lever === 'stop' ? 0.3 : 0);
    look.sw += ((s.switchOn ? 1 : 0) - look.sw) * k;
    // 195 follows the operating switch in opposite directions on Start and
    // Stop (plain manual pp.11–12). The switch throw remains estimated.
    l195.rotation.y = s.lever === 'start' ? -0.05 : s.lever === 'stop' ? 0.05 : 0;
    // One188 input shared with mechanism and167/129; no independent visual easing.
    // Upstream195/201/273 transitions remain prescribed, not contact-derived.
    a188.rotation.y=-(s.switchArmYaw??prescribedSwitchArmYaw(s));
    { // its spring and wire to the idler's rocker (drive), its long arm's rod to the pawl
      const r = -a188.rotation.y, c = Math.cos(r), sn = Math.sin(r);
      const at = (p, y, v) => v.set(SHAFT_192.x + p[0] * c - p[1] * sn, y, SHAFT_192.z + p[0] * sn + p[1] * c);
      const WY = SWITCH_ARM.wireY, ry = (i) => (i === 0 ? SHAFT_192.y : WY); // level with 188 to the first bend, then above the motor
      at(spr, SHAFT_192.y, tmpA);
      tmpB.set(route[0].x, ry(0), route[0].z);
      const dx = tmpB.x - tmpA.x, dy = tmpB.y - tmpA.y, dz = tmpB.z - tmpA.z, l = Math.hypot(dx, dy, dz), coil = Math.min(l - 0.004, 0.014 + 0.003 * look.sw);
      sprCoil.position.copy(tmpA); sprCoil.quaternion.setFromUnitVectors(UP, tmpD.set(dx / l, dy / l, dz / l)); sprCoil.scale.set(1, coil, 1);
      tmpA.set(tmpA.x + (dx / l) * coil, tmpA.y + (dy / l) * coil, tmpA.z + (dz / l) * coil);
      rodBetween(wireRods[0], tmpA, tmpB);
      for (let i = 1; i < route.length; i++) { tmpA.set(route[i - 1].x, ry(i - 1), route[i - 1].z); tmpB.set(route[i].x, ry(i), route[i].z); rodBetween(wireRods[i], tmpA, tmpB); }
      tmpA.set(route[route.length - 1].x, WY, route[route.length - 1].z); tmpB.set(rk.x, rk.y ?? rockerTop(s, rk) + 0.0006 + 0.0002, rk.z); // its end on top of the rocker's rod (E: the hook's loop round it is not drawn)
      rodBetween(wireRods[route.length], tmpA, tmpB);

    }
    pawl.rotation.y = s.pawl ? 0 : 0.28; // prescribed boundary: finite201/273/274 latch contacts unresolved
    // start lever: pulled against the cam's ring wall while the cam turns, pushed clear up the lug and held clear
    const pulled = s.camOn && th < CAM.startClear;
    const back = pulled ? lugPush(th) : 0.0036;
    st.position.set(-Math.cos(fDir) * back, START_LEVER.y, -Math.sin(fDir) * back);
    // Factory 1229 pp.13–14: release is a downward bolt stroke. Its opposite
    // AK end rises into the reconstructed relief, unless the spindle is blocked.
    poseChangerCam(s);
    // Cam edge constrains each leaf tip; elastic beam plus fixed-contact reaction
    // determine the contacts. No boolean mute flag moves the drawing.
    for(const [index,L]of leaves.entries()){
      const pose=muteLeafPose(th,index),d=L.data,length=d.endX-d.rootX;
      L.dot.position.set(length,0,pose.tipZ-d.rootZ);
      L.moving.position.set(pose.contact.x,pose.contact.y,pose.contact.z);
      const pos=L.leaf.geometry.attributes.position;
      for(let i=0;i<=L.n;i++){
        const t=i/L.n,z=pose.zAt(t)-d.rootZ;
        for(let j=0;j<4;j++)pos.setXYZ(i*4+j,t*length,j<2?-.00015:.00015,z+(j===0||j===3?-.0002:.0002));
      }
      pos.needsUpdate=true;L.leaf.geometry.computeVertexNormals();L.leaf.geometry.computeBoundingSphere();
    }
    // record size: the eccentric and the indexing lever turn, the slide moves along; raised into reach in a cycle
    const sz = SIZE_TURN[s.size] ?? -1;
    ixArm.rotation.y = -sz * 0.45; ecc.rotation.y = -sz * 0.6;
    const sp=sizeStopPose(s.size,s.slideOn,sizeStopGeometry);
    slideG.rotation.y=-sp.a;slideG.position.set(sp.x,sp.y,sp.z);
  }
  // This reconstruction uses the early plain1229 switch in drive/mains.js.
  // start-linkage.js describes the later UL/Q variant (different140/145/170),
  // so building it here would add a second, incompatible switch mechanism.
  update = buildChanger(kit, { root, update, crG, crA, crN, crAxis });
  root.userData.dbg = { aIn:aIn/D,aRest:aRest/D,aMid:aMid/D,base:base/D,padH:padH*1000,walls:walls.length,profile:'fixed estimated XYZ cam component; contact solved' };
  update = springsPins(kit, { root, P, mlTurn, mlTilt, yL, gate, sl, slPiv, slTail, crG, crA, crN, crAxis, segPlate, linkTab, linkR, soSlide, SO, railLength, railStep, railAt, a188, l195, t195, st, pawl, ix, slideG, slAt, slDir }, update); // springs, pins, clips and small parts (springs-pins.js)
  return { group: root, update };
}

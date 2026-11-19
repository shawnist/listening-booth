// Drive: the idler wheel 131 on its swing lever 133, and the bracket that carries the lever up and
// down between the pulley's steps. Owned by the drive builder (see OWNERS.md).
import * as THREE from 'three';
import { TAU } from '../../layout.js';
import { lathe, RoundedBoxGeometry, sheetGeo } from '../shared/geometry.js';
import { makeCanvas, canvasTexture } from '../../../../deck3d/textures.js';
import { IDLER_R, IDLER, LEVER } from './place.js';
import { pose } from './kinematics.js';
import { slab, circle } from './selector.js';

const PIVOT_RADIUS = LEVER.pivotR; // solid upward shaft fixed to133;134 supplies its bore

// The idler's bright centre disc: a dense grid of little dimples (maarc rb003, Fig. 30).
function dimpleTextures() {
  const n = 256, c = makeCanvas(n, n), g = c.getContext('2d'), b = makeCanvas(n, n), h = b.getContext('2d');
  g.fillStyle = '#d6d8da'; g.fillRect(0, 0, n, n); h.fillStyle = '#808080'; h.fillRect(0, 0, n, n);
  const step = n / 26;
  for (let i = 0; i < 27; i++) for (let j = 0; j < 27; j++) {
    const x = (i + (j % 2) * 0.5) * step, y = j * step * 0.87 + 4;
    g.fillStyle = 'rgba(110,112,116,0.75)'; g.beginPath(); g.arc(x, y, step * 0.24, 0, TAU); g.fill();
    h.fillStyle = '#2a2a2a'; h.beginPath(); h.arc(x, y, step * 0.26, 0, TAU); h.fill();
  }
  return { map: canvasTexture(c, { srgb: true }), bump: canvasTexture(b, { srgb: false }) };
}

export function buildIdler(kit, root) {
  const { add, part, mat, mats } = kit;

  // ---- the idler: rubber round a dimpled metal disc, a brass hub ------------------------------------------
  const idler = part('idler', root);
  const spin = new THREE.Group(); idler.add(spin);
  const R = IDLER_R, T = IDLER.tyreT / 2;
  const rubber = mat(0x1c1c1e, 0, 0.84); rubber.side = THREE.DoubleSide;
  // the tyre (maarc rb003): flat-topped with crisp edges. Its outer face is all but straight, relieved a little
  // away from its middle (place.js IDLER.tyre) so that it meets the step and the wall on a line and no part of
  // the step's taper reaches into it, then a small chamfer to each face. Each face is a lathe of its own so
  // its edges are shaded sharp, not rounded over.
  // (drawn 0.02 mm under its true radius: the lathes are polygons, and at the two tangent contacts a corner of
  // one would otherwise stand a hundredth of a millimetre into the other's flat facets)
  const RT = R - 0.00002, TY = IDLER.tyre, n = TY.length - 1, edge = RT - TY[n][0], band = [];
  for (let i = n - 1; i > 0; i--) band.push([RT - TY[i][0], -TY[i][1]]);
  band.push([RT, 0]);
  for (let i = 1; i < n; i++) band.push([RT - TY[i][0], TY[i][1]]);
  for (const pts of [
    [[IDLER.discR + 0.0002, -0.0008], [0.022, -0.0008], [0.0262, -T]], // the underside, sloping in to the disc
    [[0.0262, -T], [edge, -T]], // the bottom face
    [[edge, -T], band[0]], band, [band[band.length - 1], [edge, T]], // the chamfer, the outer face, the chamfer
    [[edge, T], [0.0266, T]], // the flat top
    [[0.0266, T], [0.0256, 0.0024], [0.0246, 0.001], [IDLER.discR + 0.0002, 0.001]], // in to the disc
  ]) add(spin, lathe(pts, 96), rubber);
  // a moulded mark on the rubber (rb003 shows one), so its turning reads
  add(spin, new RoundedBoxGeometry(0.0035, 0.0004, 0.0045, 1, 0.0001), mat(0x232326, 0, 0.7), 0.019, 0.0011, 0);
  const tex = dimpleTextures();
  const disc = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.75, roughness: 0.38, map: tex.map, bumpMap: tex.bump, bumpScale: 1.5 });
  add(spin, new THREE.CylinderGeometry(IDLER.discR, IDLER.discR, 0.0016, 48), [mats.steel(), disc, disc], 0, 0.0001, 0);
  const brass = mats.brass();
  add(spin, new THREE.CylinderGeometry(IDLER.hubR, IDLER.hubR, IDLER.hubBelow + IDLER.hubAbove, 24), brass, 0, (IDLER.hubAbove - IDLER.hubBelow) / 2, 0);
  add(spin, new THREE.CylinderGeometry(0.0046, 0.0046, 0.0005, 24), mats.steel(), 0, 0.0012, 0); // washer
  add(spin, lathe([[0.0042, 0.0009], [0.0042, 0.0013], [0.0034, 0.0016], [0.0034, 0.0009]], 24), brass); // the hub's flange on the disc
  // the idler's pin and its clip (on the lever, so they do not turn)
  const keeper = part('idlerKeeper', idler, { name: 'Lock washer (keeps the idler on its pin)', no: '130' });
  add(keeper, slab(circle(0, 0, 0.0026, 20), 0.0005, [circle(0, 0, 0.00156, 16)]), mats.darkSteel(), 0, IDLER.hubAbove + 0.00045, 0);

  // ---- rigid swing lever 133, with a fixed axle and a long upright pivot (Fig. 31) ----
  const lever = kit.name('idlerRigidArm', part('idlerArm', root));
  const gold = mat(0xc4a24c, 0.85, 0.36);
  // One pressed-steel blank, yellow-chromated (rebuild video 13:12): a flat strip with a round boss
  // at the pivot and a rounded end past the axle. All bending is at the pivot end (exploded view,
  // manual1229.pdf p.19 Fig. 31): the narrow tail behind the pivot folded straight down to carry tube
  // 135, and a small tab bent up beside the pivot (13:12). No lengthwise flange. The wheel axle is
  // riveted at one fixed point, 24.5 mm from the pivot (spacing E). Bend radius, tab position and size,
  // and boss size: estimates.
  const tail = LEVER.tail;
  add(lever, sheetGeo(swingLeverBlank(tail)), gold);
  kit.name('idlerPivot133', add(lever, new THREE.CylinderGeometry(LEVER.pivotR, LEVER.pivotR, LEVER.pivotTop, 16), mats.steel(), 0, LEVER.pivotTop/2, 0));
  const axleHeight = LEVER.belowWheel + IDLER.pinAbove;
  kit.name('idlerAxle133', add(lever, new THREE.CylinderGeometry(.0015, .0015, axleHeight, 16), mats.steel(), LEVER.axle, axleHeight/2, 0));
  const washer = part('cWasher', lever, { name: 'C washer 3.2 on swing pivot', no: '122' });
  const clipPts = [], gap = .5;
  for(let i=0;i<=24;i++){const a=gap+(Math.PI*2-gap*2)*i/24;clipPts.push([Math.cos(a)*.003,Math.sin(a)*.003]);}
  for(let i=24;i>=0;i--){const a=gap+(Math.PI*2-gap*2)*i/24;clipPts.push([Math.cos(a)*.00165,Math.sin(a)*.00165]);}
  add(washer, slab(clipPts,.0005), mats.darkSteel(),0,LEVER.belowWheel-.0045+.00025,0);
  //135 is a bumper on133's separate folded tail, not a pivot bearing.
  // Factory plain1229 Fig31 places the folded tail and sleeve DOWN below133.
  // The AudioVault upward-tail photograph is another lever variant and must
  // not establish1229 orientation. The rebuild13m12s thumb obscures this end.
  // Its eventual counter-contact has not yet been established from the sources.
  const bumper = kit.name('idlerTailBumper135', part('idlerTailBumper', lever, { name: 'Silicone tube on swing lever tail', no: '135 (218 702)' }));
  bumper.position.set(tail.x, -tail.height/2, 0);
  const silicone = mat(0xe5dec5, 0, .65); silicone.transparent=true; silicone.opacity=.6;
  add(bumper, lathe([[tail.tubeInner,-tail.height/2],[tail.tubeOuter,-tail.height/2],[tail.tubeOuter,tail.height/2],[tail.tubeInner,tail.height/2],[tail.tubeInner,-tail.height/2]],24),silicone);

  const P = {}, mem = {}; // mem: the drawn pose carried from frame to frame (kinematics.pose)
  // s: mechanism snapshot
  function update(s) {
    pose(s, P, mem);
    idler.position.set(P.x, P.y, P.z);
    spin.rotation.y = -s.idlerTurns * TAU; // pressed inside the platter's wall, it turns the same way as the platter
    lever.position.set(P.ax, P.y - LEVER.belowWheel, P.az);
    lever.rotation.y = -P.phi;
    return P;
  }
  return { update };
}

// Swing lever 133 as a bent sheet (shared sheetGeo). Contact datums are unchanged: the pivot at the
// origin, the axle at LEVER.axle, and the folded tail's midplane at tail.x, where tube 135 sits.
export const LEVER_FORM = Object.freeze({ r: 0.0005, boss: LEVER.w / 2 + 0.0008, tab: { from: 0.005, to: 0.008, height: 0.0025 } });
export function swingLeverBlank(tail = LEVER.tail) {
  const t = LEVER.t, R = LEVER_FORM.r + t / 2, hw = LEVER.w / 2, tw = tail.width / 2, rb = LEVER_FORM.boss;
  const e = tail.x + R; // the tail's bend line: after a 90 deg fold its midplane lies at tail.x
  const pts = [[e, -tw], [e, tw]];
  const arc = (a0, a1, cx, cz, rr, n) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + rr * Math.cos(a), cz + rr * Math.sin(a)]); } };
  const aTail = Math.asin(tw / rb), aArm = Math.asin(hw / rb), end = LEVER.len - hw;
  arc(Math.PI - aTail, aArm, 0, 0, rb, 16);                 // boss, over the +z side
  arc(Math.PI / 2, -Math.PI / 2, end, 0, hw, 12);           // rounded end past the axle
  arc(-aArm, -Math.PI + aTail, 0, 0, rb, 16);               // boss, back over the -z side
  return {
    outline: pts, t,
    flanges: [
      { edge: [[e, -tw], [e, tw]], angle: -Math.PI / 2, r: LEVER_FORM.r, len: tail.height - R },
      { edge: [[LEVER_FORM.tab.from, hw], [LEVER_FORM.tab.to, hw]], angle: Math.PI / 2, r: LEVER_FORM.r, len: LEVER_FORM.tab.height - R },
    ],
  };
}

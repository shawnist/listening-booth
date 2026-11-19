// Drive: the strobe lamp housing 85 / 90 in the dish with its neon 93, the "50 HZ" / "60 HZ" marks
// beside it, and the lower case with the deflecting prism (227 015) under the plate below the strobe
// window. Owned by the drive builder (see OWNERS.md).
// Plain 1229 service manual p.5 Fig.7 uses an asymmetric diode/capacitor lamp circuit.
// ctx.lamp is a visual brightness envelope, not a measured optical pulse waveform;
// the shared 120 Hz sampling assumption must not be inferred from 60 Hz mains alone.
import * as THREE from 'three';
import { D, AXES } from '../../layout.js';
import { plateGeo, RoundedBoxGeometry, V3, lathe } from '../shared/geometry.js';
import { makeCanvas, canvasTexture } from '../../../../deck3d/textures.js';
import { HOUSING as H, LEGEND, NEON_WIRE, PRISM, FLOOR_Y, FLOOR_UNDER } from './place.js';

const PLATE_UNDER = -0.0015;
const mm = (v) => v / 1000;

// A rounded rectangle (x0..x1, z0..z1) as a Path or Shape in plateGeo's convention (shape y = -z).
function roundRect(path, x0, x1, z0, z1, r) {
  path.moveTo(x0 + r, -z0); path.lineTo(x1 - r, -z0); path.quadraticCurveTo(x1, -z0, x1, -z0 - r);
  path.lineTo(x1, -z1 + r); path.quadraticCurveTo(x1, -z1, x1 - r, -z1); path.lineTo(x0 + r, -z1);
  path.quadraticCurveTo(x0, -z1, x0, -z1 + r); path.lineTo(x0, -z0 - r); path.quadraticCurveTo(x0, -z0, x0 + r, -z0);
  return path;
}
// An upright box with rounded corners in plan and holes through its top, standing on y = 0.
function caseGeo(x0, x1, z0, z1, r, h, holes) {
  const s = roundRect(new THREE.Shape(), x0, x1, z0, z1, r);
  for (const [a0, a1, b0, b1, hr] of holes) s.holes.push(roundRect(new THREE.Path(), a0, a1, b0, b1, hr));
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelSize: 0.0004, bevelThickness: 0.0004, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2); g.translate(0, 0.0004, 0);
  return g;
}

function legendTexture() {
  const c = makeCanvas(400, 240), g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.font = '600 66px "Courier New", Courier, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('50  HZ', 219, 58); g.fillText('60  HZ', 181, 186); // 20 px a millimetre: letters ~3 mm, lines 6.4 mm apart
  return canvasTexture(c, { srgb: true });
}

export function buildStrobe(kit, root) {
  const { add, part, mat, mats } = kit;
  const plastic = mat(0x1e1e21, 0.1, 0.62), steel = mats.steel();

  // ---- the lamp housing on the dish floor, at its "60" position -------------------------------------------
  const hz = part('strobeHousing', root, { name: 'Strobe lamp housing (upper part 90 on its base), set to 60 Hz', no: '85 / 90' });
  hz.position.set(H.x, FLOOR_Y, H.z); hz.rotation.y = -H.deg * D; // local x along its long side, local z toward the window
  add(hz, caseGeo(mm(-24), mm(24), mm(-19), mm(19), mm(2), mm(1.1), []), plastic); // the base
  for (const sx of [-1, 1]) { // the ears with their screws (the housing slides between "50" and "60" on them)
    add(hz, new RoundedBoxGeometry(mm(9), mm(1.4), mm(9.5), 2, mm(0.6)), plastic, sx * mm(28.5), mm(0.7), mm(3.7));
    add(hz, new THREE.CylinderGeometry(mm(2.2), mm(2.2), mm(1.1), 16), steel, sx * mm(29), mm(1.95), mm(3.7));
    add(hz, new THREE.BoxGeometry(mm(3.4), mm(0.4), mm(0.55)), mats.darkSteel(), sx * mm(29), mm(2.5), mm(3.7)).rotation.y = 0.7;
  }
  // the upper part: a slot along its back edge (the light to the strobe ring) and an opening over the neon
  const SLOT = [mm(-18.5), mm(18.5), mm(-13.6), mm(-10.4), mm(1.2)], WIN = [mm(-9), mm(9), mm(7.6), mm(13.8), mm(1.5)];
  add(hz, caseGeo(mm(-22), mm(22), mm(-17), mm(16.5), mm(2.5), mm(8.2), [SLOT, WIN]), plastic, 0, mm(1.1), 0);
  const glow = mat(0x0d0b0a, 0, 0.7, { emissive: 0xff5a1a, emissiveIntensity: 0 });
  const slotGlow = add(hz, new THREE.PlaneGeometry(mm(36.5), mm(3)), glow, 0, mm(8.6), mm(-12));
  slotGlow.rotation.x = -Math.PI / 2; slotGlow.castShadow = false;
  // the front: the lower case's outlet toward the window, with its two white diffusers (Fig. 30)
  add(hz, new RoundedBoxGeometry(mm(22), mm(5), mm(12), 2, mm(0.8)), plastic, mm(2), mm(2.5), mm(21));
  const diff = mat(0xe6e3da, 0, 0.45, { emissive: 0xff7a3a, emissiveIntensity: 0 });
  for (const dx of [-1.6, 6]) add(hz, new RoundedBoxGeometry(mm(7.2), mm(2.6), mm(7), 2, mm(0.5)), diff, mm(dx), mm(6.1), mm(22.5));

  // ---- the neon 93: a little glass tube with nickel caps in its contact springs ------------------------------
  const ne = part('neon', hz);
  const neonGlass = mat(0xf2efe8, 0, 0.12, { transparent: true, opacity: 0.6, emissive: 0xff5a1a, emissiveIntensity: 0 });
  const tube = add(ne, new THREE.CylinderGeometry(mm(2.6), mm(2.6), mm(16), 20), neonGlass, 0, mm(6.2), mm(10.7)); tube.rotation.z = Math.PI / 2; tube.castShadow = false;
  const capGeo = new THREE.CylinderGeometry(mm(2.7), mm(2.7), mm(3.6), 20), nickel = mat(0xc9c9c4, 0.9, 0.3);
  for (const sx of [-1, 1]) {
    add(ne, capGeo, nickel, sx * mm(9.8), mm(6.2), mm(10.7)).rotation.z = Math.PI / 2;
    add(ne, new THREE.BoxGeometry(mm(0.6), mm(5.2), mm(4)), mats.brass(), sx * mm(11.9), mm(3.7), mm(10.7)); // contact spring
  }
  const elec = mat(0x6b4a30, 0.6, 0.5, { emissive: 0xff3a00, emissiveIntensity: 0 });
  for (const sx of [-1, 1]) add(ne, new THREE.BoxGeometry(mm(4.5), mm(0.25), mm(2.4)), elec, sx * mm(2.8), mm(6.2), mm(10.7));

  // ---- its lead: from a hole behind the pulley, through a clip on the floor, into the housing -------------
  const lead = part('neon', root);
  const CLIP = 3, clipH = 2.6; // the wire rides up into the clip's loop
  const pts = NEON_WIRE.map(([x, z], i) => V3(mm(x), FLOOR_Y + mm(i === NEON_WIRE.length - 1 ? 3.5 : i === CLIP ? clipH : 1.25), mm(z)));
  pts.unshift(V3(pts[0].x - 0.001, FLOOR_Y - 0.003, pts[0].z - 0.001));
  add(lead, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, mm(1.2), 8, false), mat(0x111113, 0.1, 0.55));
  // the P-clip of Fig. 30: a bright sleeve about 5 mm across round the wire, its flat tail reaching toward the
  // rear (local -z) to a slotted pan-head screw in the floor (Fig. 30: about 8.6 mm from the sleeve)
  const [cx, cz] = NEON_WIRE[CLIP], [ax, az] = NEON_WIRE[CLIP - 1], [bx, bz] = NEON_WIRE[CLIP + 1];
  const clip = new THREE.Group(); lead.add(clip);
  clip.position.set(mm(cx), FLOOR_Y, mm(cz)); clip.rotation.y = -Math.atan2(bz - az, bx - ax); // local x along the wire
  const sleeve = add(clip, lathe([[mm(1.35), mm(-3)], [mm(2.3), mm(-3)], [mm(2.5), mm(-2.6)], [mm(2.5), mm(2.6)], [mm(2.3), mm(3)], [mm(1.35), mm(3)]], 24), steel, 0, mm(clipH), 0);
  sleeve.rotation.z = Math.PI / 2;
  add(clip, new RoundedBoxGeometry(mm(5.4), mm(0.5), mm(9), 2, mm(0.22)), steel, 0, mm(0.3), mm(-4.4)); // the tail, on the floor
  add(clip, new THREE.CylinderGeometry(mm(2.7), mm(2.7), mm(0.5), 24), steel, 0, mm(0.3), mm(-8.6)); // its round end
  add(clip, new RoundedBoxGeometry(mm(5.4), mm(2.0), mm(0.5), 2, mm(0.22)), steel, 0, mm(1.15), mm(-2.1)); // where the sleeve closes onto the tail
  const head = lathe([[0, 0], [mm(2.4), 0], [mm(2.4), mm(0.5)], [mm(1.9), mm(1.15)], [0, mm(1.3)]], 24); // a slotted pan-head screw
  add(clip, head, steel, 0, mm(0.55), mm(-8.6));
  add(clip, new THREE.BoxGeometry(mm(3.8), mm(0.5), mm(0.6)), mats.darkSteel(), 0, mm(1.7), mm(-8.6)).rotation.y = 0.5;
  add(lead, new THREE.CylinderGeometry(mm(1.7), mm(1.7), mm(1), 16), mat(0x2a2a2c, 0.3, 0.5), mm(NEON_WIRE[0][0]), FLOOR_Y + mm(0.3), mm(NEON_WIRE[0][1])); // the grommet in the floor

  // ---- "50 HZ" / "60 HZ" printed on the dish floor (Fig. 30) ----------------------------------------------
  const lg = part('legendHz', root, { name: '"50 HZ" / "60 HZ" marks for the lamp housing', no: '—' });
  const printMat = new THREE.MeshStandardMaterial({ map: legendTexture(), transparent: true, roughness: 0.6, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const print = add(lg, new THREE.PlaneGeometry(0.020, 0.012), printMat, 0, 0, 0);
  print.rotation.x = -Math.PI / 2; print.castShadow = false;
  lg.position.set(LEGEND.x, FLOOR_Y + 0.00012, LEGEND.z); lg.rotation.y = -LEGEND.deg * D;
  kit.name('legendHz', lg);

  // ---- the lower case with the deflecting prism, under the plate below the window -------------------------
  const pc = part('strobePrism', root, { name: 'Lower case with deflecting prism', no: '227 015' });
  pc.rotation.y = -AXES.strobe.a; // local x runs out from the spindle under the window
  const half = PRISM.w / 2, o = PRISM.off, outline = [[PRISM.r0, o - half]];
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI; outline.push([PRISM.r1 + Math.cos(a) * half, o + Math.sin(a) * half]); }
  outline.push([PRISM.r0, o + half]);
  const caseH = PRISM.y[1] - PRISM.y[0];
  add(pc, plateGeo(outline, caseH), plastic, 0, (PRISM.y[0] + PRISM.y[1]) / 2, 0);
  // the tower that reaches up to the window, with the deflecting prism inside
  const tr = AXES.strobe.r, towerH = PLATE_UNDER - PRISM.y[1];
  add(pc, new THREE.CylinderGeometry(0.0105, 0.0105, towerH, 32), plastic, tr, PRISM.y[1] + towerH / 2, 0);
  // the inner end looks up through the dish floor at the strobe ring: clear prism faces top and bottom
  const glass = mat(0xb9c6cc, 0.1, 0.12, { transparent: true, opacity: 0.75 });
  add(pc, new RoundedBoxGeometry(0.013, 0.0008, PRISM.w - 0.005, 2, 0.0003), glass, PRISM.r0 + 0.008, Math.min(PRISM.y[1] + 0.0003, FLOOR_UNDER - 0.0005), o);
  add(pc, new RoundedBoxGeometry(0.014, 0.0006, PRISM.w - 0.004, 2, 0.0002), mat(0x8f9497, 0.2, 0.35), PRISM.r0 + 0.0085, PRISM.y[0] - 0.0002, o);
  for (const lz of PRISM.lugs) { // screw lugs (Fig. 31)
    add(pc, new RoundedBoxGeometry(0.007, 0.0015, 0.0075, 2, 0.0005), plastic, PRISM.lugR, PRISM.y[1] - 0.0008, lz);
    add(pc, new THREE.CylinderGeometry(0.0022, 0.0022, 0.0012, 16), steel, PRISM.lugR, PRISM.y[1] - 0.0021, lz);
  }

  // s: mechanism snapshot; ctx.lamp: 0..1, the neon lit with the mains
  function update(s, ctx) {
    const l = ctx.lamp || 0;
    neonGlass.emissiveIntensity = 2.4 * l; elec.emissiveIntensity = 3 * l;
    glow.emissiveIntensity = 1.6 * l; diff.emissiveIntensity = 0.5 * l;
  }
  return { update };
}

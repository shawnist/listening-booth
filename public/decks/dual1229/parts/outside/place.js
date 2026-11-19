// Outside, chassis and controls: where the outside builder's parts sit and how big they are.
// Metres, in the shared frame (layout.js); positions from reference/register.json, and where the
// register gives only a centre, measured on Fig. 30 (acceptance shot O1, 0.265 mm/px) relative to
// the control it belongs to. "E" marks an estimate of ours. Owned by the outside builder (see
// OWNERS.md). The plate, dish and base outlines are shared (layout.js PLATE, DISH, BASE).
import { AXES, BASE, PLATE, DISH, FOOT_H, TABLE_Y } from '../../layout.js';
import { SHUTOFF_SLIDE as TRIP_SLIDE } from '../automatic/place.js';
import { MAINS } from '../drive/place.js';

const D = Math.PI / 180;

// ---- the controls ------------------------------------------------------------------------------------
// A Dual lever (the register's speed-lever, start-stop-lever, size-lever: one part, 225 197): a black
// round hub and a flat blade sloping down to the front edge, its tip a few mm above the strip.
// s runs from the hub's axis out along the blade; tops are heights above the strip.
//   hub: radius and height of the hub; len: axis to tip; w: blade width; top0/top1: the blade's top
//   at the hub and at the tip; t: the blade's depth (vertical); deg: the blade's angle (+ toward +x)
//   for each setting, from straight at the listener. Start/stop and size: register ~35 mm to the tip,
//   drawn 34 so the tip ends at the strip's front edge as in Fig. 30 (E).
//   face: the side of the blade's top that carries its bright aluminium face (+1: right, -1: left, seen
//   from the front): start/stop and size on the right, the speed lever on the left (Fig. 30, O2).
export const LEVER = { hubR: 0.0065, hubH: 0.0095, len: 0.034, w: 0.005, top0: 0.0072, top1: 0.0038, t: 0.0032, face: 1 };
export const CONTROLS = {
  // speed lever 6 on the pitch wheel's axis (register speed-lever: hub d 13, ~39 mm to the tip; drawn
  // 36 so that at 33 the tip stays on the plate, E). The tip stands just left of each figure, as in Fig. 30 / O4 (45, straight) and the HW top view (33,
  // turned well left): about 31 degrees either side, so the blade clears each figure and the tip
  // stays on the plate (E).
  speed: { ...AXES.speed, hubR: 0.0062, hubH: 0.0055, len: 0.036, top0: 0.0100, top1: 0.0044, t: 0.0028, face: -1, deg: { 33: -31, 45: 0, 78: 31 } },
  // pitch wheel 8: a flat knurled wheel d 25 under the speed hub; its index swings over the scale's
  // four ticks a side (+-3 % at the outermost, E)
  // Both knurls are coarse ribs, bold white on black (O4, P3, O3: about 40-50 round each): tip, the
  // share of each rib's pitch that is its flat white face; depth, how far the ribs stand out.
  pitch: { ...AXES.speed, r: 0.0125, h: 0.0045, teeth: 46, depth: 0.0006, tip: 0.5, swing: 106 * D },
  strobe: { ...AXES.strobe, rOut: 0.0133, rIn: 0.0098, h: 0.0042, teeth: 42, depth: 0.0006, tip: 0.5 }, // strobe window 46: knurled ring OD 26.5
  // start/stop lever 48: pushed left to start, right to stop, springs back (E: 12 degrees each way)
  lever: { ...AXES.lever, swing: 12 },
  // record size lever 49: the blade just right of 7, 10, 12 (Fig. 30: the middle size is straight; US photo: 12 well
  // right). Not symmetric: the figures sit left of centre, and the blade must clear each one (E).
  size: { ...AXES.size, deg: { 7: -27, 10: 0, 12: 32 } },
};

// ---- the brushed-aluminium front strip (20, inch version) ------------------------------------------------
// Full width, its top edge at z = +70 mm, a round bite where the dish is (register front-strip). It sits
// inside the plate's black rolled edge: 2.5 mm in from the left, front and right (Fig. 30, O2).
export const STRIP = { z0: 0.070, t: 0.0005, biteR: 0.137, inset: 0.0025, r: 0.004 };
// The plate's turned-down edge (skirt) that shows in the base's opening (O2, O5 close-up) (E: 8 mm deep).
export const SKIRT = { depth: 0.008, t: 0.0008 };

// ---- the legends printed on the strip (DECISIONS D2, inch strip). Text heights in metres. ----------------
const S = AXES.speed, L = AXES.lever, Z = AXES.size, W = AXES.strobe;
export const LEGENDS = {
  // Positions relative to the control each legend belongs to, as measured on Fig. 30 (O1): every figure
  // sits just right of the lever tip that selects it (speed) or just left of it (size).
  text: [
    // 33 45 78 along the front edge under the speed lever (register legend-speed)
    { s: '33', x: S.x - 0.0108, z: S.z + 0.0265, h: 0.0027 },
    { s: '45', x: S.x + 0.0066, z: S.z + 0.0265, h: 0.0027 },
    { s: '78', x: S.x + 0.0247, z: S.z + 0.0265, h: 0.0027 },
    { s: 'pitch', x: S.x + 0.0005, z: S.z - 0.0205, h: 0.0020 }, // over the arc (register legend-pitch)
    { s: 'strobe', x: W.x - 0.0195, z: W.z + 0.0101, h: 0.0027 }, // left of the window (legend-strobe; Fig. 30)
    { s: 'start', x: L.x - 0.0168, z: L.z + 0.0277, h: 0.0027 }, // either side of the lever tip (legend-start-stop)
    { s: 'stop', x: L.x + 0.0166, z: L.z + 0.0284, h: 0.0027 },
    { s: '7', x: Z.x - 0.0205, z: Z.z + 0.0277, h: 0.0027 }, // inch sizes under the size lever (legend-size)
    { s: '10', x: Z.x - 0.0053, z: Z.z + 0.0277, h: 0.0027 },
    { s: '12', x: Z.x + 0.0106, z: Z.z + 0.0277, h: 0.0027 },
    { s: '1 1 7 6', x: 0.1422, z: 0.0995, h: 0.0032 }, // the model just under the badge (legend-model; O3 calibrated; reads 1176, owner 2026-11-18)
  ],
  // the pitch scale round the wheel (Fig. 30): an arc with hooked ends, four ticks a side 27 degrees
  // apart counted from the back, then "-" left and "+" right
  pitch: { arcR: 0.0168, arcDeg: 25.5, hook: 0.0015, tickR: [0.0148, 0.0168], ticks: [52, 79, 106], signR: 0.0205, signDeg: 129 },
  // cue symbols left of the cue stalk (register legend-cue): a triangle with a bar above (raised) and
  // one with a bar below (lowered). Beside the stalk's two stops in the strip's slot, 73 and 87 mm, now
  // the lever stands in the slot (owner, 2026-11-19; the register had them at 78 and 91 mm)
  cue: { x: 0.213, z: [0.0733, 0.0873], size: 0.0034 },
};

// ---- the badge tile and the base's badge ---------------------------------------------------------------
// The black tile beside the controls carries the Universal Audio diamond (owner, 2026-11-18; it read
// "Dual" under DECISIONS D2); "1176" is printed under it (LEGENDS).
// Size from the calibrated O3 view: about 15 mm wide and 16.5 mm deep.
export const BADGE = { x: 0.142, z: 0.088, w: 0.015, d: 0.0165, h: 0.0008, mark: 'ua-diamond' };
// The base's front (measured on the US unit in acceptance shot O5): a black reveal line about
// 60 mm below the top, and a small silver "universal audio" badge sitting on it at the right (owner confirmed; renamed 2026-11-18).
export const BASE_BADGE = { x: 0.194, w: 0.046, h: 0.010, y: -0.060, text: 'universal audio' };
export const REVEAL = { y: -0.060, h: 0.003 };

// ---- small things on the plate ---------------------------------------------------------------------------
export const PLUG = { x: -0.144, z: 0.1025, r: 0.0028 }; // the black dot left of the pitch scale (register front-left-plug: (-145, +103); 1 mm in so it sits on the strip)
// three chrome transport screws, drawn loosened (D15): a cross-slotted head on a cup washer
export const SCREWS = { at: [[-0.090, 0.141], [-0.089, -0.140], [0.209, 0.002]], headR: 0.0045, washerR: 0.0063, slot: 0.0013, lift: 0.0008 };
// Four spring footings (plain 1229 manual p18 Fig. 30, items 32–36), yellow on the motor side.
// Item 34 is a flanged rubber insert inside the coil, seated in cup 35. All dimensions here
// are estimates from the exploded drawing, not measurements; no damping dynamics are implied.
export const FOOTINGS = {
  at: [[-0.138, 0.142], [0.214, 0.142], [-0.138, -0.140], [0.214, -0.140]],
  cupR: 0.0105, springR: 0.0062, top: -0.0015, springBottom: -0.0166, bottom: -0.020,
  damper: { bottom: -0.0188, flangeTop: -0.0173, top: -0.0105, flangeR: 0.0082, bodyR: 0.0045, boreR: 0.0022 },
};
// What each footing's cup stands on: a walnut block glued into the base's corner, from the base's floor
// up to the cup, reaching out from the two walls to just past the cup (E: the WB-19's mounting blocks;
// no photo shows them). x0..x1, z0..z1 in metres; the top is FOOTINGS.bottom.
const WALL = { x0: PLATE.x0 - BASE.gap, x1: PLATE.x1 + BASE.gap, z0: PLATE.z0 - BASE.gap, z1: PLATE.z1 + BASE.gap };
export const POSTS = {
  floor: -(BASE.h - FOOT_H) + 0.003, // the top of the base's floor board
  at: FOOTINGS.at.map(([x, z]) => {
    const reach = FOOTINGS.cupR + 0.0005; // just past the cup: the automatic's long rod passes 1 mm from the front right one
    return x < 0 ? { x0: WALL.x0, x1: x + reach, z0: z < 0 ? WALL.z0 : z - reach, z1: z < 0 ? z + reach : WALL.z1 }
      : { x0: x - reach, x1: WALL.x1, z0: z < 0 ? WALL.z0 : z - reach, z1: z < 0 ? z + reach : WALL.z1 };
  }),
};

// ---- in the dish -----------------------------------------------------------------------------------------
// The pressed dish's bend from its wall into its floor: a 1.5 mm chamfer, so the platter's drive wall (outer
// face r 132 mm, down to 1 mm over the floor) keeps 1 mm off it all round (E).
export const DISH_BEND = 0.0015;
// the raised bearing mounting plate round the spindle (register dish-centre-plate), outline from Fig. 30
// (mm, our frame), 2 mm above the dish floor, with three white hex standoffs and a boss round the hub
export const CENTRE_PLATE = {
  outline: [[-34, -50], [62, -51], [72, -41], [73, -13], [68, 3], [52, 23], [36, 42], [26, 50], [4, 51], [-17, 42], [-34, 23]].map(([x, z]) => [x / 1000, z / 1000]),
  fillet: 0.006, top: -0.008, t: 0.0015, hole: 0.0105, boss: [0.0105, 0.0135, 0.0012],
  standoffs: [[-0.0208, -0.0337], [0.0515, -0.0337], [0.025, 0.0334]], hexR: 0.0031, hexH: 0.0025,
};
// openings in it besides the hole for the bearing: the trip slide's hook (TRIP_SLOTS below)
CENTRE_PLATE.openings = () => [TRIP_SLOTS.hook];
// Openings in the dish floor besides the bearing's hole at the centre (layout DISH.hole), for the drive
// builder's parts (their place.js; the drive review asked for them). Round holes [x, z, r]:
//   - the pulley: the motor's upper bearing boss comes up through the floor at the motor's axis (-20,
//     +79.5) (moved from the register's (-24, +79) to where Fig. 30 / Fig. 31 put it); the drive draws a
//     steel ring r 6.8-9 mm on the floor round it, so the hole is the ring's bore
//   - the motor's three mounting posts, 14.6 mm from its axis at -38, +90 and +190 deg (atan2(z, x));
//     the first two show as nuts on the floor in Fig. 30, the third is under the idler (E: post 1.5 mm)
//   - the neon's lead: a grommet behind the pulley (Fig. 30: the wire comes up there). The drive's wire comes
//     up through it on a slant (1.2 mm wire), so the hole is 2.8 mm, under the drive's 1.7 mm grommet
export const MOTOR_AXIS = { x: -0.020, z: 0.0795 };
// integrator: the drive's review fix fastens mount 3 (+190 deg) from below, so only two posts come through
const mounts = [-38, 90].map((d) => [MOTOR_AXIS.x + Math.cos(d * D) * 0.0146, MOTOR_AXIS.z + Math.sin(d * D) * 0.0146, 0.0018]);
export const DISH_HOLES = [[MOTOR_AXIS.x, MOTOR_AXIS.z, 0.0068], ...mounts, [-0.0258, 0.0526, 0.0028]];
// Shaped openings, outlines in (x, z) metres:
//   idler: the idler bracket's boss and the swing lever 133 dip through the floor at the low steps, so
//     the floor is open under the lever's whole swing: round its pivot (-82, +85.5), 34.5 mm long, from
//     its rest (Fig. 30: idler hub at (-57.7, +69.0), -34.2 deg) to the engaged positions the drive
//     computes for 33 / 45 / 78 at +-3 % (-2.4 .. -7.9 deg, the hub 26.6-30.1 mm out), 4 deg spare
//     either way, out to the lever's end, and its half width (3.75 mm) plus 1.5 mm all round. maarc rb003 shows the
//     floor open beside the idler there; Fig. 30 hides the opening under the idler (E: its exact shape).
//   strobe: the light path from the lamp housing to the prism case under the window: Fig. 30 shows a
//     dark rectangular opening 22.7 mm wide running out along the window's radius (51.3 deg) from
//     r 114.6 mm to the foot of the dish wall, set 2 mm to the clockwise side of the radius.
// integrator: re-fitted to the drive's final lever (pivot moved to (-76.5, +84.7) in its review fix): the drive's
// computed opening is a sector about the pivot, radius 30.5 mm, -49.1 .. +1.8 deg, plus the bracket boss r 5.1
export const IDLER_SWING = { pivot: [-0.0765, 0.0847], reach: 0.0305, deg: [-49.1, 1.8], margin: 0.0051 };
function fanOutline({ pivot: [px, pz], reach, deg: [a0, a1], margin }) {
  // the sector swept by the lever, grown by margin all round: its convex hull sampled finely
  const pts = [];
  const add = (x, z) => { for (let i = 0; i < 24; i++) { const t = (i / 24) * 2 * Math.PI; pts.push([x + Math.cos(t) * margin, z + Math.sin(t) * margin]); } };
  add(px, pz);
  for (let i = 0; i <= 16; i++) { const a = (a0 + ((a1 - a0) * i) / 16) * D; add(px + Math.cos(a) * reach, pz + Math.sin(a) * reach); }
  return hull(pts);
}
function hull(P) { // Andrew's monotone chain, counter-clockwise in (x, z)
  const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1)).map(([x, z]) => [Math.round(x * 1e6) / 1e6, Math.round(z * 1e6) / 1e6]);
}
export const STROBE_PATH = { a: AXES.strobe.a, r0: 0.1146, rOut: 0.1288, lat: [-0.0094, 0.0133] };
function pathOutline({ a, r0, rOut, lat: [l0, l1] }) {
  // (rad, lat) -> (x, z): rad along (cos a, sin a), lat along (sin a, -cos a)
  const at = (r, l) => [Math.cos(a) * r + Math.sin(a) * l, Math.sin(a) * r - Math.cos(a) * l];
  const pts = [at(r0, l0), at(r0, l1)];
  const b1 = Math.atan2(l1, Math.sqrt(rOut * rOut - l1 * l1)), b0 = Math.atan2(l0, Math.sqrt(rOut * rOut - l0 * l0));
  for (let i = 0; i <= 8; i++) { const b = b1 + ((b0 - b1) * i) / 8; pts.push(at(Math.cos(b) * rOut, Math.sin(b) * rOut)); } // the outer end follows the wall
  return pts;
}
// The automatic's trip slide (253) lies in the dish over the centre plate; its hook passes down through the
// centre plate and the floor to the shut-off lever under the cam, its far tab down through the floor to the
// trip link. Slots along the slide's travel, its play all round (granted to the automatic builder).
const slot = (cx, cz, ux, uz, back, fwd, half) => [[cx - ux * back - uz * half, cz - uz * back + ux * half], [cx + ux * fwd - uz * half, cz + uz * fwd + ux * half], [cx + ux * fwd + uz * half, cz + uz * fwd - ux * half], [cx - ux * back + uz * half, cz - uz * back - ux * half]];
const TS = TRIP_SLIDE, tsL = Math.hypot(TS.end.x - TS.hook.x, TS.end.z - TS.hook.z), tsU = [(TS.end.x - TS.hook.x) / tsL, (TS.end.z - TS.hook.z) / tsL];
export const TRIP_SLOTS = {
  hook: slot(TS.hook.x, TS.hook.z, ...tsU, TS.hookR + 0.0012, TS.travel + TS.hookR + 0.0012, TS.hookR + 0.0010),
  tab: slot(TS.end.x - tsU[0] * 0.0015, TS.end.z - tsU[1] * 0.0015, ...tsU, 0.0006 + 0.0012, TS.travel + 0.0006 + 0.0012, 0.0016 + 0.0010),
};
export const DISH_OPENINGS = { idler: fanOutline(IDLER_SWING), strobe: pathOutline(STROBE_PATH), tripHook: TRIP_SLOTS.hook, tripTab: TRIP_SLOTS.tab };

// ---- cables under the chassis (register cables-under; Fig. 31), points (x, z, y) in metres ---------------
// The mains and audio leads run back under the plate, pass under its turned-down edge, drop down inside
// the base's opening and leave through a hole drilled through the base's back wall, each lined with a
// rubber grommet, then fall to the table behind the base (E: WB bases have a lead hole at the back; no
// photo of ours). hole: how much wider than its lead each hole is (radius).
export const CABLE_EXIT = { y: -0.056, wall: [BASE.z0, PLATE.z0 - BASE.gap], table: TABLE_Y, grommet: 0.0016, hole: 0.0012 };
const lead = (x, r, under) => {
  const W = CABLE_EXIT.wall, y = CABLE_EXIT.y, inside = W[1] + r + 0.004, t = TABLE_Y + r;
  return [...under,
    [x, -0.1475, -0.0215], [x, inside, -0.031], [x, inside, -0.045], // under the skirt, then down inside the opening
    [x, inside - 0.0005, y + 0.0045], [x, inside - 0.0025, y + 0.0006], // a bend into the hole
    [x, W[1] + 0.0025, y], [x, W[1] + 0.0006, y], [x, (W[0] + W[1]) / 2, y], [x, W[0] - 0.0006, y], [x, W[0] - 0.0025, y], // straight through the wall
    [x, W[0] - 0.005, y - 0.0006], [x, W[0] - 0.010, y - 0.006], [x, W[0] - 0.016, y - 0.020], [x, W[0] - 0.021, t + 0.006], [x, W[0] - 0.032, t], [x - 0.004, W[0] - 0.060, t], [x - 0.020, W[0] - 0.080 - (x + 0.05) * 0.5, t], [x - 0.110, W[0] - 0.086 - (x + 0.05) * 0.5, t], // down to the table,
    // then off to the left along the back, close enough to the base that the seated view does not see them over it
  ];
};
// The mains switch box (drive place.js MAINS: x -122..-38, z -29..+8, from y -11.8 mm down 20 mm): the
// mains lead leaves its back face, the motor leads go into its front face, so none runs through it.
const BOX = { x: [MAINS.boxes[0].x[0] / 1000, MAINS.boxes[2].x[1] / 1000], z: [Math.min(...MAINS.boxes.map((b) => b.z[0])) / 1000, Math.max(...MAINS.boxes.map((b) => b.z[1])) / 1000] };
export const CABLES = [
  // mains lead from the switch box's back face, through a clamp, out at the back left
  { r: 0.0026, color: 'black', pts: lead(-0.050, 0.0026, [[-0.090, BOX.z[0] - 0.0002, -0.0205], [-0.090, BOX.z[0] - 0.0025, -0.0205], [-0.091, BOX.z[0] - 0.007, -0.0198], [-0.093, -0.045, -0.0175], [-0.082, -0.063, -0.0160], [-0.068, -0.089, -0.0155], [-0.058, -0.117, -0.0155], [-0.052, -0.135, -0.0170]]), clamp: 4, exit: true },
  // audio lead from its strain relief, out at the back
  { r: 0.0024, color: 'black', pts: lead(-0.036, 0.0024, [[-0.017, -0.094, -0.0150], [-0.025, -0.112, -0.0150], [-0.032, -0.132, -0.0165]]), relief: true, exit: true },
  // motor leads, two white and one black, from the motor to the switch box
  { r: 0.0011, color: 'white', pts: [[-0.047, 0.060, -0.0140], [-0.072, 0.048, -0.0135], [-0.100, 0.038, -0.0135], [-0.106, 0.020, -0.0140], [-0.098, BOX.z[1] + 0.0045, -0.0150], [-0.098, BOX.z[1] + 0.0025, -0.0150], [-0.098, BOX.z[1] + 0.0002, -0.0150]] },
  { r: 0.0011, color: 'white', pts: [[-0.045, 0.057, -0.0150], [-0.071, 0.045, -0.0150], [-0.098, 0.035, -0.0150], [-0.103, 0.019, -0.0155], [-0.095, BOX.z[1] + 0.0045, -0.0160], [-0.095, BOX.z[1] + 0.0025, -0.0160], [-0.095, BOX.z[1] + 0.0002, -0.0160]] },
  { r: 0.0011, color: 'black', pts: [[-0.043, 0.054, -0.0160], [-0.069, 0.042, -0.0162], [-0.095, 0.032, -0.0165], [-0.100, 0.018, -0.0168], [-0.092, BOX.z[1] + 0.0045, -0.0170], [-0.092, BOX.z[1] + 0.0025, -0.0170], [-0.092, BOX.z[1] + 0.0002, -0.0170]] },
];

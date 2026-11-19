// Drive: where the drive builder's parts sit and how big they are. Metres, in the shared frame
// (layout.js: spindle at the origin, x right, z toward the listener, y up, y = 0 the plate top);
// below the plate y is negative. The dish floor's top is at y = -10 mm, its underside at -11.5
// (layout.js DISH). Plain JavaScript (no three.js) so Node can read it. Owned by the drive builder
// (see OWNERS.md).
//
// Sources: reference/register.json (motor, pulley, idler, idler-arm, rocker, speed-segment,
// speed-link, strobe-lamp-housing, strobe-neon, strobe-prism, legend-hz, mains-switch), DECISIONS
// D3, D8, D9, D16, D22, and the reference pictures measured with the calibrated cameras of
// reference/acceptance.json: Fig. 30 (from above, O1/D1), Fig. 31 (from below, A1/D4) and the
// section Fig. 2 (D5, 0.2342 mm/px, plate top at 181 px). "E" marks an estimate of ours.
import { SPEC } from '../../spec.js';
import { AXES } from '../../layout.js';
import {PITCH_INPUT} from './pitch-input.js';

export const FLOOR_Y = -0.010; // top of the dish floor (layout.js DISH.depth)
export const FLOOR_UNDER = -0.0115; // its underside (DISH.depth + DISH.floorT)

// ---- the motor M 1219 S on its three elastic mounts (D9) -----------------------------------------
// Axis: Fig. 30 puts the pulley at (-19.2, +78.5) and Fig. 31 the can's centre at (-20.7, +81.1),
// both measured with the calibrated cameras; the register's (-24, +79) is 4 mm left of both, so we
// use (-20, +79.5). Can: Fig. 31 shows it 83-84 mm across over its rolled edges (the register says 79,
// the Fig. 2 section 88); we draw 83.
// Heights from the Fig. 2 section: rubber grommets under the dish floor down to -20.5 mm, a die-cast
// top bracket to -31, the can from -31 to -78.5 with the laminations showing as a band at -51..-57.6.
export const MOTOR = {
  x: -0.020, z: 0.0795, r: 0.0415,
  top: -0.031, bottom: -0.0785, band: [-0.0576, -0.0510],
  corner: 0.006, lip: 0.0018, // rounding of the can's outer and band edges (Fig. 2)
  flat: 0.025, // the flat round bottom of the lower end bell (Fig. 31: about 50 mm across)
};
// Three mounts at 14.6 mm from the axis. Two of their nuts show on the dish floor in Fig. 30, at
// -38 and +90 deg (atan2(z, x)); the third (E: 190 deg) lies under the idler's swept ring, and Fig. 30
// shows nothing there, so it is fastened from below: its stud stops at the floor's underside and its
// nut sits under the motor bracket (`fromBelow`), nothing of it above the dish floor.
export const MOUNTS = { r: 0.0146, deg: [-38, 90, 190], fromBelow: [false, false, true], grommet: [-0.0205, -0.0115], post: [-0.0225, -0.0068] };
// The top bracket ("hat", grey die-cast, maarc rb016) with the upper bearing boss up to the floor;
// Fig. 30 shows a ring about 18 mm across round the pulley (the boss under the floor's hole).
export const HAT = { rBottom: 0.026, rTop: 0.0195, top: -0.0215, boss: 0.009 };

// ---- the pulley 115, 60 Hz (218 276; D3, D8) --------------------------------------------------------
// Three steps, the 33 1/3 one at the top, each tapered so the idler can sit higher (slower) or
// lower (faster) on it: pitch +-3 %. Step heights from the Fig. 2 section, which shows the pulley
// standing from just above the dish floor to about 11.7 mm above the plate top, its steps about 7.6,
// 6.4 and 6.7 mm tall: 78 at -8.8..-1.3, 45 at -1.3..+5.1, 33 at +5.1..+11.7.
// Fixed tapers and neutral contact heights are calibrated estimates. Pitch moves
// the complete segment axially by the SAME stroke at every speed (manual p6).
// Finite tyre/shoulder clearance is evaluated from material profiles, not an
// assigned per-speed idler height. edge remains a nominal compatibility margin.
export const PULLEY = {
  steps: { 33: [0.0051, 0.0117], 45: [-0.0013, 0.0051], 78: [-0.0088, -0.0013] },
  edge: { low: 0.0032, high: 0.0012 }, collar: { r: 0.0063, y: -0.0093 }, shaftR: 0.0012,
};
// The idler's middle height on each step at pitch 0 (metres; kinematics.idlerY moves it +-travel with
// pitch). Also read by test/dual-platter.test.mjs.
// Estimated neutral contact heights leave room for the common axial pitch stroke.
export const PULLEY_Y = {33:.0097,45:.0033,78:-.00405};

// ---- the idler 131 (218 237; D8) and its swing lever 133 ---------------------------------------------
// 60 mm over the tyre, 6 mm thick at the tyre, a bright dimpled centre disc about 28.6 mm across
// (Fig. 30) with a brass hub; it lies flat in the dish.
export const IDLER_R = SPEC.idlerDia / 2;
export const IDLER = { tyreT: 0.006, crown: 0.00015, discR: 0.0143, hubR: 0.0032, hubBelow: 0.0045, hubAbove: 0.0022, pinAbove: 0.0036 };
// The tyre's outer face (maarc rb003: a flat-topped rubber ring with a crisp edge): [how far inside the full
// radius, height off the tyre's middle] from its middle out to its top and bottom faces. It is all but flat,
// relieved only enough that the pulley's taper (at most 0.11 mm per mm, the 78 step) never reaches into it away
// from the middle: 0.15 mm less 1.2 mm either side (`crown`), 0.35 mm less 2.7 mm out, then a 0.3 mm chamfer
// to the faces. idler.js draws it, kinematics.js keeps the swinging idler off the pulley with it.
IDLER.tyre = [[0, 0], [IDLER.crown, 0.0012], [0.00035, 0.0027], [0.00065, IDLER.tyreT / 2]];
// The highest point of the idler assembly anywhere (its pin's top, on the 33 step at -3 %): with
// IDLER_INNER_R below, what the platter's underside must clear. Metres.
export const IDLER_TOP = PULLEY_Y['33'] + PITCH_INPUT.halfStroke + IDLER.pinAbove;
// At rest (power off) Fig. 30 shows the idler's centre at (-57.7, +69.0). Engaged, it wedges between
// the pulley step and the drive wall (computed in kinematics.js): about (-52.0, +84.2) on the 33 step
// with the motor where it is. The swing lever's pivot (E) sits on the perpendicular bisector of the
// two, 24.5 mm from each, so that the lever's round end and the bracket's boss (4.5 mm) stay hidden
// under the idler at rest, as in Fig. 30: (-76.5, +84.7) (the register's estimate was (-85, +85)).
export const IDLER_REST = { x: -0.0577, z: 0.0690 };
export const IDLER_PIVOT = { x: -0.0765, z: 0.0847 };
export const IDLER_INNER_R = Math.hypot(IDLER_REST.x, IDLER_REST.z) - IDLER_R; // the closest the tyre comes to the spindle
// Factory 1229 Fig. 31: 133 is a rigid bent swing lever with a FIXED idler axle.
// Its upright pivot turns in the far end of 134, which raises/lowers the complete assembly.
// The old longitudinal axle slot was invented to make guessed coordinates fit. Both link
// lengths below are estimates; the joints and rigid axle spacing follow Figs. 2 and 31.
export const LEVER = { axle: 0.0245, len: 0.0293, w: 0.0075, t: 0.0015,
  // Fig.31 and rebuild13m12s: plate below134, both shafts point upward.
  // Heights and tail length are estimated; Fig31 places135 on the DOWNWARD
  // folded tail. Its counter-contact remains unidentified.
  belowWheel: .01125, pivotR: .0016, pivotTop: .0085,
  tail: { x: -.011, height: .010, width: .0024, tubeInner: .00145, tubeOuter: .0019 },
};
// Bearing134 centre above its guided support datum. The rigid133 plate is
// 3.75mm below that centre; the axle rises from the plate into the idler hub.
export const SWING_BEARING = { y: .02125, inner: .00165, outer: .0045, halfHeight: .003 };
export const BRACKET = { hub: -0.0045, bossTop: -0.006, bossBottom: -0.013, foot: -0.0245, shaftTop: -0.0036 };

// ---- speed change: switching segment 102 and guided support 134 ------------------------------
// Factory Fig. 2 and Fig. 31: 134 is guided vertically; 133 swivels at its far end.
// The translating follower carrier and swivel are a kinematic reconstruction of the complete
// support, not a measured casting. The cam's estimated vertical band is made wide enough for
// the full travel of the estimated pulley, including pitch, without letting the pin leave it.
export const SPEED_AXIS = AXES.speed;
export const SEG = {
  r: 0.008, y: [-0.029, -0.010], hubR: 0.0045, // the band's radius and height (E)
  // Segment angle per speed (deg,E). Pitch translates102 axially (manual p6);
  // it contributes no yaw. The segment is pinned to groove detent106 on
  // the speed lever's shaft (rebuild guide), so it turns with the lever above: kinematics.segTurn(k, 0) is the
  // lever's own rotation.y (parts/outside/place.js speed.deg, -31 / 0 / +31 for 33 / 45 / 78), the sign flipped.
  deg: { 33: 31, 45: 0, 78: -31 },
  // Nominal 2 mm follower plus 0.05 mm radial clearance. Channel envelope also
  // accounts for the sloping centreline and oblique entry through the band.
  // Depth/clearance and incidence limits are reconstructed, not factory measurements.
  // -25: the pin at 134's withdrawn rest stop (WITHDRAWAL.rest, -24.8 deg).
  slotW: 0.0021, slotDepth: 0.0013, slotIncidence: [-25, -9],
};
// How fast the drawn speed shaft follows the lever: the same easing as the lever on top (parts/outside index.js,
// k = dt * 14 a frame), so the segment, the detent plate and the lever turn as one shaft.
export const SHAFT_EASE = 14;
export const LINK = { from: { x: -0.112, z: 0.114 }, to: { x: -0.075, z: 0.08342 }, y: -0.023, short: 0.016, rodR: 0.0015, pinOffset: 0.0065, guideR: 0.0016 }; // 48 mm supporting arm, E
LINK.len = Math.hypot(LINK.to.x - LINK.from.x, LINK.to.z - LINK.from.z);
LINK.ux = (LINK.to.x - LINK.from.x) / LINK.len; LINK.uz = (LINK.to.z - LINK.from.z) / LINK.len;
// Approximate profile of support 134, based on Fig. 2. y values are its reference pose;
// the whole assembly translates vertically and swivels, rather than tipping about a cross pin.
export const ROCKER = {
  w: 0.0065,
  // Raised cast end carries133 from above (Fig.31, rebuild13m12s).
  // The arm stays low near the chassis edge, rising within the open drive well.
  profile: [[.0045,-.0142],[.026,-.0142],[LINK.len-.008,-.00175],[LINK.len-.004,-.00175],
    [LINK.len-.004,-.00675],[.026,-.0202],[.0116,-.035],[.0045,-.033]],
  pad: { r: 0.0045, y: [-0.0355, -0.0325] },
};
LINK.rocker = ROCKER.profile[3][0]; // raised cast arm joins the end-bearing rim
// The single engagement spring is188→134 (manual p11/Fig.2); automatic owns it.
// The speed bracket 104: die-cast aluminium, screwed under the plate (Fig. 31: about x -136..-104,
// z +82..+123, screws at (-127, +88) and (-112, +88)). A leg behind the shaft carries its lower block
// (Fig. 2: -32 to -40 mm; from 14 mm behind the shaft, past the leg, to 8 mm in front of it), which holds the
// shaft's end: under it a spacer, a broad washer (-42.6..-44) and the nut (-44.4..-47.2), the shaft's tip
// at -48.5 mm.
export const SPEED_BRACKET = {
  // (its corner nearest the spindle, Fig. 31's (-104, +83), is rounded off on r 136 mm: the dish's wall comes out to
  // r 134.5 under the plate)
  outline: [[-0.137, 0.123], [-0.122, 0.126], [-0.106, 0.121], [-0.103, 0.110], ...(() => {
    const R = 0.136, z0 = Math.sqrt(R * R - 0.1037 * 0.1037), a0 = Math.atan2(z0, -0.1037), a1 = Math.atan2(0.083, -Math.sqrt(R * R - 0.083 * 0.083)), o = [];
    for (let i = 0; i <= 4; i++) { const a = a0 + ((a1 - a0) * i) / 4; o.push([Math.cos(a) * R, Math.sin(a) * R]); }
    return o;
  })(), [-0.134, 0.083], [-0.138, 0.095]],
  t: 0.002, screws: [[-0.127, 0.088], [-0.112, 0.088]],
  legA: 200, legR: 0.011, // the leg's direction from the shaft (deg, atan2(z, x)) and distance
  low: { top: -0.032, bottom: -0.040, back: 0.014, front: 0.008, w: 0.010 },
  spacer: 0.0028, washer: [-0.0440, -0.0426], washerR: 0.006, nut: [-0.0472, -0.0444], shaftEnd: -0.0485,
};
// ---- the speed selector's small parts (Fig. 29 items 95-108, 123-125; Fig. 7; rebuild guide "Servicing the speed
// control mechanism", its photos p-002 and p-007) -------------------------------------------------------------------
// The click-stops: the groove detent 106 (a steel plate on the flats at the shaft's lower end, under the bracket's
// lower block, held by the washer 107 and the nut 108; three notches at the edge of a lobe, a pin up into the cam
// 102's foot) and the ball 125 (4 mm) pressed down on it by the compression spring 124 from a hole in the bottom
// of the block. The ball sits at `a` (deg, atan2(z, x), the leg's side, inside the block) `r` from the shaft; each
// notch is where the ball is when the lever is at its speed (E: sizes; the place of the ball and the pin).
export const DETENT = {
  a: 200, r: 0.009, ball: 0.002, clear: 0.00002, // the ball's centre stands `clear` off the plate (drawn tangent)
  plate: { top: -0.0403, t: 0.0008, r: 0.0105, rIn: 0.0068, lobe: 64, notchW: 0.0024, notchIn: 0.00765 },
  hole: { r: 0.0021, top: -0.0335 }, // the ball's hole in the block, closed above `top`
  spring: { r: 0.0015, wire: 0.0003, turns: 3.5 }, // 124
  pin: { r: 0.0032, a: 20, rod: 0.0006, top: -0.0276 }, // up through an arc slot in the block to the cam's hub
};
// The large compression spring 103 on the shaft between the bracket's lower block and the cam's hub (rebuild guide:
// "the cam spring push[es] the whole assembly apart"); it presses the cam up against the regulating plate.
// Estimated0.30mm wire diameter leaves finite coil clearance at full axial pitch.
export const SPRING103 = { r: 0.0044, wire: 0.00015, turns: 3.5 };
// Above the cam, on the shaft under the bracket's flange (E: Fig. 7 and the order of Fig. 29): the regulating
// plate 100, fixed, its two right-angle tabs up into the flange (rebuild guide: "a washer with 2 small right angle
// tabs ... engage the tabs in the slots in the chassis") and a lug that carries the adjusting screw 95; the washer
// 98 (4.2/8.1); the speed regulator detent 101 (the "alignment disc", notched at its edge, with its 1 mm hole),
// whose exact pitch transmission remains unresolved. On the lug, under it: the dished lock washer 97, the knurled
// adjusting (alignment) wheel 96 beside the disc's edge, opposite its hole at pitch 0, and the lock washer 99 on the
// screw's end. Heights in metres; `a` world angles (deg) round the shaft.
export const REGULATOR = {
  // (the cam's band and web are drawn with a 0.3 mm bevel, so its top is at -9.7 mm; the disc stays inside the
  // bracket's leg, which comes down 9 mm from the shaft)
  plate: { y: [-0.0084, -0.0079], r: 0.0058, tabs: [70, 250], tabW: 0.002, tabT: 0.0005 },
  washer: { y: [-0.0089, -0.0084], r: 0.00405 },
  disc: { y: [-0.0097, -0.0089], r: 0.0087, holeR: 0.0076, holeD: 0.001, teeth: 7, toothA: 6 },
  lug: { a: 160, r: 0.0118, w: 0.0056 },
  screw: { r: 0.0013, headR: 0.0022, head: [-0.0079, -0.0073], end: -0.0108 }, // 95
  lockWasher: { y: [-0.0088, -0.0084], r: 0.0024 }, // 97
  wheel: { y: [-0.0100, -0.0088], r: 0.0026, teeth: 14 }, // 96
  clip: { y: [-0.0105, -0.0101], r: 0.0021 }, // 99
};
// Static fine-adjustment pack datum lifted2mm to clear102's real axial travel.
// This clearance is reconstructed; the missing8/96/101 axial transmission is
// an explicit input boundary, not a claimed floating contact or extra joint.
for(const key of ['plate','washer','disc','lockWasher','wheel','clip'])
  REGULATOR[key].y=REGULATOR[key].y.map(y=>y+.002);
REGULATOR.screw.head=REGULATOR.screw.head.map(y=>y+.002);
REGULATOR.screw.end+=.002;
// Spring 123 seats the translating carrier on its cam follower (Fig. 31).
// It surrounds the vertical guide. Sizes and spring seat heights are estimates.
// Estimated0.50mm wire diameter preserves clearance above solid at highest33 pitch.
export const SPRING123 = { r: 0.0022, wire: 0.00025, turns: 7, free: 0.030, top: -0.0045, seat: 0.009 };
// The switch wire eye is 26.5 mm along support 134 (E). This is its reference position;
// kit.anchors.rocker is updated with the actual moving x/y/z each frame.
export const ROCKER_ANCHOR = { x: LINK.from.x + LINK.ux * 0.0265, z: LINK.from.z + LINK.uz * 0.0265 };

// ---- strobe: lamp housing 85 / 90 with the neon 93 in the dish, the 50/60 Hz marks, the prism case --
// Housing measured in Fig. 30: a box about 46 x 36 mm, centre (+56, +65.8), its long side at -38.6 deg
// (atan2(z, x)); a long slot along its back edge, the neon bulb visible along its front, two white
// blocks in front of it toward the window, a screw at each end (it slides to "50" or "60": D3, at 60).
export const HOUSING = { x: 0.056, z: 0.0658, deg: -38.6, w: 0.046, d: 0.036, h: 0.010 };
// The housing as drawn (strobe.js) stands 10.1 mm tall on the dish floor: base 1.1 mm, upper part
// 8.2 mm plus its 0.4 mm bevels top and bottom.
HOUSING.top = FLOOR_Y + 0.0101;
// The strobe lamp housing as one point, kept for test/dual-platter.test.mjs (it was the old place.js's
// NEON): x, z its centre in plan (metres), y the middle of its height, top its highest point.
export const NEON = { x: HOUSING.x, z: HOUSING.z, y: (FLOOR_Y + HOUSING.top) / 2, top: HOUSING.top };
// The "50 HZ" / "60 HZ" print on the dish floor beside the right-hand screw (Fig. 30: their centres at
// (+91.2, +38.1) and (+92.8, +44.6), letters about 3 mm high, running at about -36 deg).
export const LEGEND = { x: 0.0920, z: 0.0414, deg: -36, h: 0.003 };
// The neon's wire: from a hole in the dish floor behind the pulley, through a clip on the floor, to the
// housing (Fig. 30), mm (x, z).
export const NEON_WIRE = [[-25.8, 52.6], [-18, 50.4], [-6, 55.5], [8.6, 65.6], [22, 72.4], [30, 73.5]];
// The lower case with the deflecting prism (227 015) under the plate, Fig. 31: a black case about 25 mm
// wide running radially under the strobe window, from r 108 mm (under the dish floor, below the ring)
// to a round end under the window; screw lugs at r 147 mm.
export const PRISM = { r0: 0.1084, r1: 0.1741, w: 0.025, off: -0.003, y: [-0.024, -0.012], lugR: 0.147, lugs: [0.0136, -0.0194] };

// ---- mains switch 129 / slide 167 and the box beside it (Fig. 31; identity of each box estimate) ------
export const MAINS = {
  boxes: [ // x0, x1, z0, z1 (mm) and height (mm) and colour key
    { x: [-122, -83], z: [-29, 8], h: 20, c: 'black' },
    { x: [-83, -53], z: [-27, 6], h: 17, c: 'grey' },
    { x: [-53, -38], z: [-29, 8], h: 20, c: 'black' },
  ],
  top: -0.0118, screws: [[-104, -18.4], [-50.6, -18.4]],
};

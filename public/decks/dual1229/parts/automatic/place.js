// Automatic mechanism: where the automatic builder's parts sit. Metres, in the shared frame
// (layout.js: spindle at the origin, x right, z toward the listener, y up, y = 0 the plate top);
// below the plate y is negative. The main cam's centre and size are shared with the platter's
// pinion (layout.js GEAR). Owned by the automatic builder (see OWNERS.md).
//
// Plan positions were measured on manual Fig. 31 (acceptance shot A1, calibrated: x -153.46..+236.63,
// z -170.4..+159.74 over the 1460 x 1260 page) and, for the trip slide, on Fig. 30 (O1), with a
// 10 mm grid laid over each. Which stamping is which was worked out against the manual's Fig. 14-22
// and the exploded view Fig. 29 (DECISIONS D23); where that identification is ours it says "ID".
//
// Heights are not visible in either figure. They follow the order of Fig. 29 (shut-off lever 162 on the
// cam, the cam, the follower 207 under it, the axle 208 and its bracket 171 below) and one rule: every
// part has a layer of its own, so nothing that moves passes through anything else (the browser test
// test/dual-automatic.collide.mjs screens it). From the dish floor (underside -11.5 mm) down:
//   -11.9 .. -22.5  the main cam: rim and teeth -12.9..-16.1 (GEAR.camY), web -13.2..-14.4, groove walls
//                   and ring wall down to -20.5, the switch arm's flange ring -18.8..-20.6
//   -16.8 .. -17.8  the shut-off lever 162 under the rim, at the dog's height under the pinion (E)
//   -18.7 .. -21.4  reconstructed AK relief: neutral follower at -21.4, rising to -18.7 on release
//   -21.75 .. -23.4 main lever 184 (top -21.75: it lifts the lift screw 206 from there), start lever 248
//   -25.6 .. -29.6  the die-cast bracket 171 under the cam and the platter's bearing, carrying the cam's axle
//                   (its skirt down to -40 round its edge)
//   -28.25 .. -29.75 the main lever's stud bracket 215; -31 the locking slide 212; -38 the bridge strap 157; -42.5 the cam rocker 173
// Above the dish floor, in the dish: the trip slide 253 at -5.5 .. -6.5, over the centre plate.
// Outside the dish, under the plate (underside -1.5): pawl 273 at -8, the segment 201 at -15.
const mm = (x, z) => ({ x: x / 1000, z: z / 1000 });

// ---- main cam (165) ------------------------------------------------------------------------------------
// Amber translucent moulding (V-RI 6:20, MAARC rb-019): a toothed rim, a thin web, a raised hub round
// the axle (208), an outer ring wall and the guide groove's two tracks on its underside (E: radii and
// heights). Fig. 30 shows the axle's top on the dish floor at (+52, -33.7): the cam's centre.
export const CAM_T = 0.0032; // the toothed rim's thickness (E)
export const CAM_Y = {
  web: [-0.0144, -0.0132], // the thin web between hub and rim (E)
  wall: -0.0205, // how far the groove walls and the ring wall stand down (E)
  hub: [-0.0225, -0.0119], // the hub sleeve, from just under the dish floor (E)
  flange: [-0.0206, -0.0188], // the ring the switch arm's finger and the muting leaves ride on, hung from the web (E)
  ak: -0.0214, // neutral underside of the reconstructed AK rail (E; not a measured factory height)
  nib: -0.01874, // upper limit of the reconstructed AK relief, above its neutral follower height (E; changer-profile.js)
};
export const CAM_R = {
  hub: 0.0085, bore: 0.0032, web: 0.0505, // the web runs out to the rim
  ring: [0.0395, 0.0410], // outer ring wall (E); the start lever's finger rides on it
  flange: [0.0470, 0.0505], // the switch arm's flange and its cut-out (E)
  hanger: 0.0478, // the three posts the flange hangs on, inside the rim's bore (E)
  ak: 0.0450, // cam surface AK, the ridge that rocks the cam rocker (E)
  gapTeeth: 7, // teeth left out at neutral (E)
};
// follower pin radius; wall thickness (V-RI 6:20 and MAARC rb-028: thick, tall walls); play (E)
export const GROOVE = { pin: 0.0016, wall: 0.0022, clear: 0.0009, step: 0.0004 }; // play 0.9 mm: the pin leans a little as the lever tips // step: path sampled every 0.4 mm along its length

// ---- dog (M) on the platter gear ---------------------------------------------------------------------
// An eccentric under the pinion (Fig. 21), turning with the platter, between the pinion's lower end
// (-16.5) and the bearing bush (-20.5), round the shaft (r 5.5) with a little play (E).
export const DOG = { y: [-0.0180, -0.0167], r: 0.0082, ecc: 0.0020, bore: 0.0057 };

// ---- main lever (184) ----------------------------------------------------------------------------------
// Fig. 31: a broad gold stamping (about 16 mm wide) from the follower pin (+64.7, -58.0) close to the
// cam's centre, through a pivot pair (studs at (+89, -66) and (+85, -73); we pivot it between them, E)
// toward the arm. The pivot carries it both ways: round a vertical stud (182) for the swing, and on a
// cross pin (183) for the lift (Fig. 29). Its end broadens: the contact face under the clutch pad, and a
// flat finger under the lift screw (206) (Fig. 16: 184 directly under 206), slotted for the lift bolt.
// top: the lever's top face at rest, where the lift screw's foot sits (tonearm index.js reads it).
export const MAIN_LEVER = { pin: mm(64.7, -58.0), pivot: mm(87.0, -69.5), y: -0.0225, t: 0.0015, w: 0.016 };
MAIN_LEVER.top = MAIN_LEVER.y + MAIN_LEVER.t / 2;
// The lift screw (206, tonearm index.js) stands on the main lever's finger: its foot is at the lever's
// top at rest; while the clutch grips, the lever presses on past full lift by `press` of the lift's
// travel (about 0.65 mm) so that its spade meets the clutch pad, and the screw rides up with it.
// tube: where the brass guide of the screw ends below the plate (it must clear the lever's end).
// The adjacent lift finger stands 1.7 mm above the flat body/contact face (estimated height).
MAIN_LEVER.joggle = 0.0017; MAIN_LEVER.endTop = MAIN_LEVER.top + MAIN_LEVER.joggle;
export const LIFT_SCREW = { rest: MAIN_LEVER.endTop, press: 0.2, tube: -0.0155 };
// The contact face is a broad flat leaf continuous with lever 184, below the raised lift finger.
// Its outline is estimated from photographs; pad motion comes from a fixed coupling bolt on segment 201.
export const SPADE = { t: 0.0015, gap: 0.0005, drop: MAIN_LEVER.joggle, bandOut: 0.0025, stepFrom: 12 };
// The stud 182 stands up from its bracket 215 under the cam (Fig. 14: 215 beside 184) whose foot is
// screwed under the dish floor outside the cam's teeth (E: 14 mm behind the stud).
export const STUD_BRACKET = { y: -0.0290, t: 0.0015, foot: mm(87.0, -84.0), w: 0.010 };

// ---- tonearm segment (201), clutch pad (223 777) and its guide on the bearing post (216 844) -----------
// Under the arm's bearing on its shaft, between the skating lever above (-11.7..-13.3) and the mode
// wedge and its link below (-17, the link's top -15.3) (E). Its curved slot lets the fixed lift screw (206) through as the arm turns.
// pad.r: tip of guide 229; cap and pin dimensions remain photo estimates. The pin is fixed on segment 201.
// Exposed cap length is limited by the gap above the flat contact face; 6 mm was an unsupported exposure estimate.
export const SEGMENT = { y: -0.0114, t: 0.0015, r: 0.044, padR: 0.031, pad: { r: 0.0016 }, cap: { len: 0.0030, r: 0.0020, pin: 0.0008 }, hub: 0.0048 }; // Estimated plate datum; cap tip and size-stop stud bottom retain their separate fixed datums.

// ---- bridge strap (157, ID) ----------------------------------------------------------------------------
// The long gold strap that crosses the whole mechanism lowest of all in Fig. 31 and MAARC rb-018,
// from (0, -88) by the leads' clamp to (+150, +17), bent up at each end to its screw: 14 mm wide, holes
// at (+17.6, -81.8) and (+87.5, -33.5). Fig. 29 shows it as item 157 (screws 191).
export const BRIDGE = { a: mm(0, -88), b: mm(150, 17), w: 0.014, y: -0.038, holes: [mm(17.6, -81.8), mm(87.5, -33.5)] };

// ---- the cam's axle (208) on the die-cast bracket under the cam (171, ID) ----------------------------------
// Fig. 31 and MAARC rb-018/rb-019 (A2, A3): a large die-cast aluminium block runs from round the platter's
// bearing to the cam's centre, where the axle's nut sits under it, and covers the cam's whole quarter
// toward the spindle; a stamped plate is screwed under it (Fig. 31: two holes) (E: outline, depth). It hangs
// under the main lever's layer: its top at -25.6, a 3 mm slab with bosses round the bearing and the axle
// 1 mm deeper, and a skirt round its edge down to -40 (not where the cam rocker's arm passes under it).
// `fan`: the sector of the cam it covers, degrees either side of the line to the spindle, out to `fanR` from
// the cam's centre (it stops short of the cam rocker's nib, 41 deg off that line).
export const CAM_BRACKET = { y: -0.0271, t: 0.003, boss: 0.001, w: 0.024, back: 0.012, fan: 30, fanR: 0.040, hole: 0.0086, skirt: { w: 0.0018, bottom: -0.040 } };

// ---- shut-off: one rigid formed rail253, retained directly on segment201 ------------------
// Primary plain1229 p.7: remove272/271 to detach253 from201. Fig.31 shows one stepped
// rail, a bent inner tip and ball254 near that tip; no intermediate telescoping link.
// These legacy hook/step coordinates remain estimated construction/pose datums.
// Runtime yaw is an explicit prescribed boundary; an aperture guide has not been established.
// Inner seat is on the model's raised centre plate (top−8mm), not the dish floor.
// Its height follows the4mm ball/1.4mm seat rim; these assembly dimensions are estimates.
const tripSeatY = -.008 + .002 + Math.sqrt(.002 ** 2 - .0014 ** 2) + .001 / 2;
export const SHUTOFF_SLIDE = { hook: mm(-7.3, -20.1), end: mm(115.0, -32.0), w: 0.0042, y: tripSeatY, t: 0.0010, hookR: 0.0009, travel: 0.0065, reach: 0.0045 };
// Fig.31 places the4mm ball under the INNER ribbed end;12mm offset is a photo estimate.
export const SHUTOFF_BALL = { fromTip: 0.0120, r: 0.0020, seat: 0.0014, supportY: -0.0080 };
// Historical export name retained for consumers: now dimensions of253's outer flat/eye,
// not a separate part. Fig.31 eye/washer/clip stack is BELOW201. Pin x/z remains estimated.
export const TRIP_LINK = { y: SEGMENT.y - SEGMENT.t / 2 - 0.0002 - 0.0012 / 2, w: 0.0050, t: 0.0012, pinR: 0.0395, clearDeg: 135 };
// The shut-off lever 162 on its pin 163, under the cam's rim near the toothless gap (Fig. 21), at the
// dog's height. Angles in degrees from the gap's centre in the cam's own frame, radii from its centre.
// Everything of it but the nose stays inside r 50.2 mm of the cam's centre, so that as the cam turns nothing
// else of it passes through the dog or the platter's shaft; the trip slide's hook reaches in under the rim to
// press its tail (E).
export const SHUTOFF_LEVER = { pivot: { deg: 9, r: 0.0465 }, nose: { deg: 0.6, r: 0.0526 }, tail: { deg: 20, r: 0.0484 }, y: -0.0173, t: 0.0010, w: 0.0030 };

// ---- operating switch linkage ---------------------------------------------------------------------------
// Fig. 31: the lever 196 on the operating switch's shaft (the round boss with the arrow at (+146, +115);
// its axis is layout.js AXES.lever) works the switch lever 195, a short arm from (+130, +91); both 195 and
// the switch arm 188 turn on the grooved pin 192 at (+89.5, +72.5) (a lubrication mark "3" on it).
export const SHAFT_192 = { ...mm(89.5, 72.5), y: -0.0255 }; // 188 runs under the strobe prism's case (its bottom -24.5)
export const SWITCH_LEVER = { tip: mm(130, 91), y: -0.0135 };
// The switch arm 188: from 192 down to its finger on the cam's flange (dropping into the cut-out at
// neutral), a short arm away from the strobe prism to its link toward the idler's rocker (134, drive's
// anchor), and its long arm to the pawl 273 (E: the manual puts the pawl on 188; the segment's tab frees it).
// The link is a bent wire: round the prism's inner end and outside the motor's front mount (E).
export const SWITCH_ARM = { finger: mm(54.4, 15.8), spring: mm(101.5, 61.0), route: [mm(80.0, 52.0), mm(15.0, 92.0), mm(-20.0, 104.5)], y: -0.0255, wireY: -0.0197 }; // under the start lever at 188's height, up past the prism, then above the motor's top bracket (-21.5)
// PlainFig26 + Q underside photograph:273 hinge on188, fixed256/274,
// and201 releasepin identified independently at pixels1019/735,1160/815,1165/888.
// Image-calibrated estimates, not factory measurements; photographed pose uncertain.
export const PAWL = { ...mm(118.8014452,-32.8416667), bolt:mm(156.4745205,-53.8029365),
  releasePin:mm(157.8104452,-72.9300952), y:-.0128, photoYaw:.0808696,
  baseAngle:-.507742963, t:.0014 };

// The wide gold bar from (+130, +91) to the cam (Fig. 31: about 27 mm across at its widest; an
// arrow-shaped cut-out at (+113, +64)): the start lever 248 (ID), pulled toward the cam by its spring
// and pushed clear by the cam's lug. It slides on a guide pin beside the switch lever's tip (E).
export const START_LEVER = { pivot: mm(130, 91), guide: mm(121.5, 78.5), finger: mm(71.0, 1.8), y: -0.0226, w: 0.027 };

// ---- cam follower (207) on the cam, cam rocker (173) and the change stud (177) ---------------------
// Plain1229 Fig24/31:207 is a broad crescent rotating on208 beneath165,
// retained by166. Profile, axial placement and angular stops below are estimates.
// Contacts with195/173 and184's pin remain unresolved, not inferred from a phase.
export const FOLLOWER = {y:-.0230,t:.0008,boreR:.00315,hubR:.0052,
  innerR:.027,outerR:.037,earHeight:.004,
  stopAngle:0,startAngle:8*Math.PI/180};
// Cam rocker173: the AK end rises while the opposite spindle end descends for
// release (plain1229 pp.13–14). Fig.22 (photo, oblique): pin174 through173's upturned lugs
// sits about 0.41 of the way from bolt177 to the AK end, a lever ratio of about 0.70
// (photo-measured, low confidence). The pivot is moved along the rocker to that ratio
// (bolt arm 16.8, AK arm 24.0 mm; earlier 5.6/35.2 gave 0.16). Heights are estimates.
// 2026-11-16: pin174 moved 15.1 mm along its own axis onto the line from bolt177 to the AK contact, so the
// rocker is straight as Fig.29 draws it (it had to dogleg to reach a pin drawn off that line). Same axis
// line, same arms, same stroke. Agreed with the cycle owner (171's hanger lugs move with it).
export const CAM_ROCKER = { pivot: mm(2.7555, -16.5578), y: -0.0425 }; // lowered from -31 so the change bolt 177, its spring 178 and bushing 179 fit between it and the platter shaft (changer.js)

// ---- muting switch ---------------------------------------------------------------------------------
// Fig. 31: a cream block behind the cam at x +28..+70, z -95..-111, its leaf springs reaching the cam's
// flange (Fig. 19).
export const MUTING = { x: [0.028, 0.070], z: [-0.111, -0.095], y: [-0.0200, -0.0118], leafY: -0.0197, contactR: 0.00035, openGap: 0.0005 }; // gap: plain 1229 p.16; other contact dimensions schematic
export const MUTING_Y = -0.0175; // kept for anything that still reads it

// ---- record size: indexing lever (49) under the selector, arm positioning slide (255) ---------------
// Fig. 31: the long bar (about 16 mm wide) from the size lever's hub (+201, +112) back toward the arm
// segment, with a slot and pin at (+192, +75..+95). Plain 1229 p.10: 257 raises 255
// from below into the segment stop pin. Heights and rise are estimated; neutral clears below it.
export const INDEX_SLIDE = { front: mm(201, 112), y: -0.0195, w: 0.016, t: 0.0015, stopR: 0.0425, stopDeg: 100, studTop: -0.01515, studBottom: -0.0164, rise: 0.0009 };

// Kept from the earlier layout for anything that imports them.
export const SHUTOFF_PIVOT = { x: 0.016, z: -0.03 };
export const SWITCH_SHAFT = { x: SHAFT_192.x, z: SHAFT_192.z, y: SHAFT_192.y, len: 0.02, arm: SHAFT_192.x };
export const BOLT = PAWL.bolt;
export const FOLLOWER_PIVOT = { x: 0.04, z: -0.01 };
export const CAM_ROCKER_PIVOT = CAM_ROCKER.pivot;

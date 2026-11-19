// Platter, mat and spindles: sizes and heights the platter builder owns. Metres, in the shared
// frame (layout.js: spindle at the origin, x right, z toward the listener, y up, y = 0 the plate
// top). The platter's outer radius (R_PLATTER, 152.5 mm), its drive wall (R_RIM, 129 mm) and the
// heights of the platter top, mat and record (deck3d/layout.js: 24, 26.8, 28.6 mm) are shared and
// not repeated here. Plain JavaScript (no three.js) so Node can read it. Owned by the platter
// builder (see OWNERS.md).
//
// Sources: register.json (platter, platter-rim-band, platter-drive-wall, platter-underside,
// strobe-ring, platter-bearing, spring-ring, mat, centre-disc, single-spindle, changer-spindle,
// hub-pinion) and DECISIONS D6, D7, D8, D10, D13, D16, D18. "E" marks an estimate of ours.

// ---- the casting (D6): one zinc-alloy die-casting, thin-walled ------------------------------------
// A top web about 4 mm thick (E: 3.1 kg of zinc is about 460 cm3, which a 4 mm web, two skirts,
// ribs and a hub make). Under it, from the centre out (V-RI 2:48/2:52, the inverted 1229 Q):
// a hub boss carrying the brass pinion; a slightly thicker inner plate crossed by 16 radial ribs,
// with a ring of 32 cells at its edge; a flat annulus where the strobe ring is fixed; the drive
// wall; pockets with round cups between the drive wall and the outer skirt.
export const WEB_Y = 0.020; // underside of the top web (E)
export const SKIRT = { rIn: 0.1495, bottom: 0.006 }; // outer skirt: 3 mm thick, stops 6 mm above the plate (E)
export const WALL_T = 0.003; // drive wall thickness (register: ~3)
export const WALL_BOTTOM = -0.009; // drive wall reaches into the dish, 1 mm above its floor, so the idler on the 78 step still bears on it (E, D21)
export const INNER = { r: 0.048, y: 0.017 }; // the thicker inner plate round the hub (E, from V-RI)
export const CELLS = { rIn: 0.062, rOut: 0.084, y: 0.0168 }; // ring of cells at the edge of the ribbed area (E)
export const RIBS = { n: 16, t: 0.0024, yHub: 0.0125, yOut: 0.0172 }; // radial ribs: deeper at the hub (E)
export const BOSSES = { n: 6, r: 0.029, rad: 0.0032, y: 0.0135 }; // round bosses between the ribs (E)
export const BALANCE = { r: 0.039, rad: 0.0028, a: [0.35, 3.6] }; // two balancing holes, yellow-marked (V-RI)
export const POCKETS = { n: 16, cupR: 0.0042, y: 0.009 }; // cups and ribs between the two skirt walls (E)
export const HUB = { r: 0.0125, bottom: -0.003 }; // hub boss; the pinion carries on below it (E)

// ---- the visible rim band (D6, register platter-rim-band) ------------------------------------------
// Satin-bright turned, no markings. A small step at the top edge (photos P3, P4).
export const RIM = { stepY: 0.0226, inset: 0.0007, chamfer: 0.0005 }; // E

// ---- the brass pinion PR on the hub (D10: 27 teeth, module 0.6, OD 17.4 mm) --------------------------
// A brass sleeve standing out of the hub boss (V-RI 2:52): its lower end meshes with the main cam at
// layout.js GEAR.hubY. Teeth along its whole length (E).
export const PINION = { top: -0.003, bottom: -0.0165, bore: 0.0056 };

// ---- the strobe ring 225 222 (D3, D16): fixed under the platter on the flat annulus ----------------
// Two rows rendered with assumed counts of 216 for 33 1/3 and 160 for 45; original counts
// and optical flash rate are unverified (plain 1229 manual p.5 Fig.7). The window shows the 45 row above the
// 33 row; we put the 45 row inside (E: the prism's turn may swap them).
export const STROBE_RING = { rIn: 0.095, rOut: 0.125, t: 0.0003, rows: { 45: [0.07, 0.45], 33: [0.55, 0.93] } };

// ---- the bearing and its bracket (register platter-bearing; Fig. 31) -----------------------------------
// Factory 1229 Fig. 31: bridge 171 carries a STATIONARY hollow bearing tube. The platter's
// hollow hub rotates around it and rests on thrust ball bearing 169. The changer bolt 177
// runs inside the tube (1229Q Fig. 22), not below a solid rotating shaft. Dimensions remain E.
export const BEARING = {
  shaftR: 0.0055, shaftBottom: -0.0285, shaftTop: 0.021, boreR: 0.0036,
  actuatorTop: 0.0116, // maximum bolt tip: 0.4 mm under the removable spindle's stem (at +12 mm)
  bushR: 0.0078, bushTop: -0.0205, bushBottom: -0.0275,
  thrust: { rIn: 0.0056, rOut: 0.0105, bottom: -0.0205, top: -0.0165, ballR: 0.0013, balls: 8 },
  plateY: -0.0245, plateT: 0.0015, width: 0.022, flat: 0.016, rise: 0.031, tabEnd: 0.047, // 22 wide (E): it rises past the cam's edge
  axis: 57.6 * Math.PI / 180, // from +x toward +z (Fig. 31)
  floorY: -0.0115, // underside of the dish floor (layout.js DISH: 10 + 1.5 mm)
};
// Sprengring 40, on the centre disc round the spindle. Radii from the thin dark ring in hifiwiki_top_view.jpg
// (plain 1229): 44 px outside, about 2 px wide, scaled by the 305 mm platter (0.347 mm/px). It rings the
// Ø13.8 CAD spindle flange at the Ø15.2 disc hole. Whether that dark line is this ring or a shadowed gap is
// unresolved (cad/components/single-spindle.json); thickness E.
export const SPRING_RING = { rIn: 0.0069, rOut: 0.00765, t: 0.0005 };

// ---- the mat (D13) -------------------------------------------------------------------------------------
// Black rubber, d 297, 2.8 thick (deck3d MAT_T). A raised outer lip, fine concentric ridges at about
// 4 mm, and two smooth raised rings where 7" and 10" records rest (E, from the HW top view and the
// brochure). The lip and the rings are the full height (the record sits on them); the ridges stand a
// little lower.
export const MAT = {
  r: 0.1485, hole: 0.0547, pitch: 0.004, ridgeDrop: 0.0003, grooveDrop: 0.0013, ringDrop: 0.0018,
  lip: 0.0075, // width of the lip at the outer edge (E: about 7-8 mm in the HW top view)
  rings: [[0.085, 0.0905], [0.1235, 0.129]], // smooth raised rings with a deeper groove each side (E)
};
export const DISC = { r: 0.054, t: 0.001, sink: 0.0005 }; // centre disc 39: d 108 (D13), its top 0.5 mm under the mat top (E)

// ---- spindles (D18) -------------------------------------------------------------------------------------
export const SPINDLE = { r: 0.0035, above: 0.013 }; // single-play 38: d 7, top 13 mm above the record
export const CHANGER = { r: 0.0035, collar: [0.038, 0.043], support: 0.0445, top: 0.078 }; // AW 3: heights above the record (E, photo P4; top re-measured by the reviewer: ~77 mm)

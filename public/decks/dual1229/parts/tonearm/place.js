// Tonearm: where the tonearm builder's parts sit and how big they are, apart from the pivot
// (layout.js PIVOT) and the geometry and rest radius (spec.js). Metres, in the shared frame
// (layout.js); positions from reference/register.json, checked against manual Fig. 30 (acceptance
// shot O1, 0.263 mm/px) and the plain-1229 photos (T1, T2). Owned by the tonearm builder (see OWNERS.md).

// The arm-base escutcheon (68, "Abdeckung"): a black raised plate round the bearing post. Its
// outline from Fig. 30: straight rear and right edges, a front edge at z -33, and on the left a
// straight run down from the rear that turns into a long, slightly bowed diagonal to the front-left corner.
// Height 3 mm (estimate).
export const ESC = {
  x0: 0.157, x1: 0.2225, z0: -0.153, z1: -0.033, h: 0.003, r: 0.004,
  diag: { x: 0.176, z: -0.087 }, // where the left edge leaves the straight run (x0, diag.z) and where the diagonal ends on the front edge (diag.x, z1)
  // the raised legend panel on its right-hand side: the anti-skating dial, "multi", "tracking", "anti-skating"
  panel: { x0: 0.190, x1: 0.2205, z0: -0.084, z1: -0.0355, xCol: 0.2015, zTop: -0.110, h: 0.0006 },
  screw: { x: 0.1797, z: -0.0423 }, // slotted chrome screw holding the plate, left of the dial (Fig. 30)
};

export const CONTROLS = {
  // lift (cue) handle: a thin stalk on a pivot under the plate at the plate's right edge; it
  // stands in a slot across the front strip's rear edge and leans forward when pulled (raised).
  // Fig. 30 and the hifi-wiki photo put it to the RIGHT of both lift symbols (theirs at x +213).
  cue: { x: 0.2195, z: 0.064, y: -0.004, len: 0.038 },
  // the connecting rod under the plate (Fig. 31): from the lift cam's bracket under the handle
  // straight back to the lift tube (206) beside the bearing
  cueRod: { x: 0.2055, z: 0.068 },
  // the two lift symbols printed on the strip, left of the handle (centre of the pair; Fig. 30)
  cueSymbols: { x: 0.2138, z: 0.0828 },
  // Mode-selector stalk on lever70, shown at single; rotates in plan toward multi.
  mode: { x: 0.2165, z: -0.102 },
  // anti-skating knob (79 [M-DE] / 84 [M-Q]) on the legend panel; its white index points at it from the left.
  // Fig. 30 puts the centre at (+208, -53.5) and the knurled rim at about 25 mm across (register: (+203, -51), ~29).
  skate: { x: 0.2075, z: -0.0535, r: 0.0125, h: 0.0072 },
};

// The arm rest ("Rest complete", 66; DECISIONS D5): a black upright with a U cradle the parked tube
// lies in, running almost front to back, and a black bar from it toward the platter on a chrome
// pin (Fig. 30, the HW and V-dF photos).
export const REST_CRADLE = { x: 0.181, z: 0.081 }; // register position; arm.js stands the post under the head's support piece there (check: rest-geometry test)
export const REST_BAR = { x0: 0.141, z: 0.0775, top: 0.030 };

// Lift topology: plain1229 p7 Fig11/12. The small198-tipped206 plunger acts
// under bearing body73 near the gimbal.203 is its fixed guide tube/plate and200
// threads onto the guide's upper end. Dimensions live in cue-geometry.js and arm.js.

// ---- the small working parts (working.js) -------------------------------------------------------------------
// Where no source gives a dimension these remain estimates.
// The balance plate (243) and the equalizing arm (210) that swings it under the lift bolt's foot in "multi"
// (manual p.15: "with the main lever pushed down, the balance plate rests by a minimum of 0.6-0.8 mm on the lift
// bolt; in the single position the lift bolt must slide along the balance plate without hindrance"). Distances
// in metres along the main lever's radius through the lift bolt (u) and across it (n). multi/single: where the
// plate's pin stands beyond the bolt's axis; d: the arm's pivot off the pin's path; strap: its bracket off the pivot.
export const EQUALIZER = { multi: 0.0005, single: 0.0120, d: 0.031, strap: 0.0040, armY: [-0.0265, -0.0251], tabY: [-0.0245, -0.0235] };
// M-DE p.7 Fig.12: balls 231 and rubber sleeve 230 belong on the tonearm support/segment
// sleeve, not the operator's mode-control shaft. Dimensions except the 3 mm balls remain
// estimates; the bore clears the existing 8.4 mm support shaft. No invented actuation link.
export const DETENT = { y: -0.0060, top: -0.00152, bot: -0.0105, rOut: 0.0067, rIn: 0.0043, flange: 0.0074, shaftR: 0.0042, shaftBot: -0.0220, ball: 0.0015, groove: 0.0006, grooveW: 0.0012, washer: 0.0014, washerH: 0.0016 };
// Plain1229 Fig30: selector70 and detent80/81/82 live below cover68, above
// the chassis. The roller follows70's rim; neither follows tonearm yaw or height.
// Profile, endpoints and dimensions are estimates. The hidden height-driving ramp
// is unresolved; no replacement joint is invented here.
export const MODE_SELECTOR = { R:0.011, hub:0.0065, notch:0.0008, notchW:0.20,
  y:0.0004,t:0.0012,dir:-30,travel:0.95,roller:0.0016,rollerH:0.0008,
  arm:0.010,tail:0.006,spring:0.008,leverY:0.0018,leverT:0.0008,springY:0.0010 };
// The cue lever's damping (manual p.11: "Sleeve (64) movement not damped ... remove damping plate (221), clean and
// smear it with silicone oil"): the damping plate stands against the lever's sleeve on the plate's underside, held by
// the rubber sleeve (222) on the lever's axle (Fig. 29: 219-222 in a row on one axle). Sizes are estimates.
export const CUE_DAMP = { sleeveR: 0.0022, sleeveL: 0.0050, axleR: 0.0008, plateT: 0.0008, plateW: 0.009, plateBot: -0.0076, rubberT: 0.0014, rubberR: 0.0017 };

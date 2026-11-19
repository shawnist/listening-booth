// The Dual 1229: the numbers the simulation is built from, and where each one comes from.
//
//   M  = Dual's own service manual for the 1229 Q (edition June 1974),
//        https://dual.de/wp-content/uploads/ServiceManual_1229Q_ENG.pdf
//   W  = hifi-wiki.com (Dual 1229) and Vinyl Engine: weaker, and they disagree on the arm
//   E  = an estimate of ours: not in any source we have. Plausible, not measured.
//
// Plain JavaScript with no browser dependencies, so Node can test it.

export const TAU = Math.PI * 2;

export const SPEC = {
  // ---- drive ---------------------------------------------------------------------------
  mainsHz: 60, // M: speed follows mains frequency; a US unit runs on 60 Hz (the brief's assumption)
  motorRpm: 1800, // M: four-pole synchronous motor -> 120 * 60 / 4 = 1800 rpm on 60 Hz
  platterMass: 3.1, // M: kg, non-magnetic, dynamically balanced
  platterDia: 0.305, // M: metres
  speeds: { 33: 100 / 3, 45: 45, 78: 78 }, // M: no 16 rpm on the 1229
  pitch: 0.03, // M: +-3 % (one semitone in all) on every speed
  speedVariation: 0.0006, // M: < +-0.06 % (DIN 45 507)
  rumbleDb: -42, // M: unweighted, below the reference signal (DIN 45 500)
  rumbleWeightedDb: -63, // M: weighted
  rimDia: 0.258, // E: inner diameter of the platter's drive wall the idler presses against (DECISIONS D8: 250-270)
  idlerDia: 0.060, // W: idler wheel (131), 60 mm over the tyre (DECISIONS D8)
  // E: the motor pulley's steps follow from the motor speed and the rim, since the idler's
  // own size cancels out: step diameter = rim diameter * platter rpm / motor rpm.
  get pulleyDia() { const k = this.rimDia / this.motorRpm; return { 33: k * (100 / 3), 45: k * 45, 78: k * 78 }; },
  startAccRpm: 37, // E: rpm per second while the idler slips a 3.1 kg platter up to speed: 33 1/3 in 0.9 s, a quarter turn [AD72] (DECISIONS D12)
  driveDecRpm: 50, // E: rpm per second the engaged idler can pull a fast platter down
  coastDecRpm: 1.0, // E: rpm per second a free platter loses on its bearing: about 33 s from 33 (DECISIONS D19: 30-40 s, low confidence)
  // E: wow and flutter parts at the real rotation rates, each well inside the +-0.06 % above
  wow: { platter: 0.00018, idler: 0.00010, motor: 0.00006, random: 0.00005 },

  // ---- tonearm -------------------------------------------------------------------------
  // W: 222 mm effective length (the "extra-long" 8 3/4 inch arm). E: Baerwald null points at
  // 66 and 121 mm (DECISIONS D4): 203.2 mm pivot to spindle, 18.8 mm overhang, 24.9 deg offset,
  // and at most 0.136 deg/cm across a 12-inch side, inside Dual's own 0.16 deg/cm (M).
  armL: 0.222, null1: 0.066, null2: 0.121,
  trackingErrorMax: 0.16, // M: degrees per cm of radius
  liftMax: 0.008, // M: the cue lifts the stylus about 8 mm at most
  liftFall: 4.5, // E: seconds for the silicone-damped lift to settle from full height (DECISIONS D11: the videos' slow set-down; the cue shares the damper)
  liftRise: 0.25, // E: seconds to raise it
  trackingForce: { max: 3, fine: 0.1, coarse: 0.25, split: 1.5 }, // M: 0-3 g, 0.1 g steps to 1.5 g, 0.25 g beyond
  multiRaise: 0.005, // owner's manual p.11: "multi" lifts the whole tonearm assembly 5 mm (DECISIONS D17)

  // ---- the automatic ---------------------------------------------------------------------
  // E: the main cam (165) is turned by a pinion on the platter hub (PR). With 27 teeth on the
  // pinion and 180 on the cam, module 0.6 (DECISIONS D10), one change cycle is 6 2/3 platter
  // turns: 12.0 s at 33 1/3, 8.9 s at 45, 5.1 s at 78. A Dual change cycle is roughly 10 to 15 s at 33.
  pinionTeeth: 27, camTeeth: 180, gearModule: 0.0006,
  // M: 12-inch records are set down about 1/16 inch inside the edge. E: the same 1/16 inch for
  // 10 and 7 inch, from the usual record diameters (301.6, 250, 175 mm).
  setDown: { 12: 0.1508 - 0.0016, 10: 0.125 - 0.0016, 7: 0.0875 - 0.0016 },
  // NOT used by the mechanism any more: the trip is solved as contacts in parts/automatic/trip-rail.js
  // (rail253 -> lever162 -> dog M; contracts/cycle-phases.md T1-T8). There the zone comes out of the
  // geometry (about 71 mm) and the catch is a nose depth (TRIP.catchDepth). These two numbers remain
  // the design targets that depth was calibrated against: music is cut at well under 0.5 mm a turn,
  // track gaps at up to about 1.07 mm on a short side (cutter.js spreads pitch by up to 2.2 times),
  // run-outs at 1.5 mm to several mm a turn. The cutter test (dual1229.test.mjs §11) still uses tripAdvance.
  tripZone: 0.068, tripAdvance: 0.0013,
  latchR: 0.158, // E, BOUNDARY (cycle-phases.md L1): swinging the arm in past here drops the pawl (273): manual start
  unlatchR: 0.164, // E, BOUNDARY (L4): back over the rest, the segment's bolt releases it again
  speedShift: 0.4, // E: seconds the hand takes to turn the speed lever one click-stop (31 deg); 33 <-> 78 takes twice as long
};

export const RATIO = SPEC.camTeeth / SPEC.pinionTeeth; // platter turns per turn of the main cam
// Stylus radius with the arm on its rest (DECISIONS D5, revised 2026-11-18): the parked TUBE runs
// straight front to back, parallel to the chassis side (service manual Fig. 30), with the head over
// the front strip. With the pivot and the CAD arm's 6.46 deg tube-to-stylus offset that puts the
// stylus at (+151.0, +119.0) mm, 192.25 mm from the spindle. (It was 210 mm, which lined up the
// pivot-to-stylus line instead of the tube and left the tube 5.45 deg out towards the plinth.)
// The audio engine keeps its own rest radius (ENGINE_REST, shared with the other deck); the
// mechanism tells it "rest" through core.js's port when the arm is home.
export const REST = 0.19225;
// Where the arm parked before (210 mm): a fixed geometric datum, not where it parks now. The exported
// rest post 66 (cad/assets/arm.glb) was placed for it (bindArm moves the post to REST), and the
// automatic's linkage on the arm was laid out around it: segment 201's frame (aMid), the trip rail's
// calibration and the detent reference. Those parts are rigid on the arm, so their datum stays put.
export const REST_DATUM = 0.210;
// The farthest-out radius the arm-angle helpers accept: past both the rest and the datum.
export const R_OUT_MAX = Math.max(REST, REST_DATUM) + 0.004;
export const ENGINE_REST = 0.168;
export const LIFT = 0.0068; // stylus height when cued up, as drawn by the deck view
export const R_PLATTER = SPEC.platterDia / 2;

// Seconds for one change cycle at a platter speed, ignoring spin-up.
export const cycleSeconds = (rpm) => (RATIO * 60) / rpm;

// What each part is called in the service manual, and whether its shape here is our guess.
// Every moving part below the chassis is drawn from these names; positions and shapes are
// approximations of ours (E), the names and numbers are Dual's (M). A dash: the manual's text
// names the part but our copy of its parts list is too badly scanned to read its number.
export const PARTS = {
  motor: { name: 'Synchronous motor', no: 'M 1219 S' },
  pulley: { name: 'Motor pulley, 60 Hz (stepped, tapered)', no: '115 (218 276)' },
  idler: { name: 'Idler (drive) wheel', no: '131 (218 237)' },
  idlerArm: { name: 'Swing lever carrying the idler', no: '133' },
  rocker: { name: 'Switch lever assembly (rocker)', no: '134' },
  speedSeg: { name: 'Switching segment (speed and pitch)', no: '102' },
  platterRim: { name: 'Platter drive rim', no: '4' },
  hubGear: { name: 'Platter hub gear', no: 'PR' },
  dog: { name: 'Eccentric dog on the hub gear', no: 'M' },
  cam: { name: 'Main cam (cam wheel)', no: '165 (218 295)' },
  camGroove: { name: 'Guide groove under the main cam', no: '165' },
  mainLever: { name: 'Main lever', no: '184' },
  segment: { name: 'Tonearm segment', no: '201' },
  clutch: { name: 'Guide (the "Steuerpimpel", "guide white"): translucent cap on a pin under the tonearm segment; the main lever drags the arm by its tip', no: '229 (223 777)' },
  spade: { name: 'Spade end of the main lever, the clutch pad\'s contact face', no: '184' },
  liftTube: { name: 'Fixed lift guide tube and mounting plate', no: '203 (220 934)' },
  shutoffSlide: { name: 'Shut-off slide', no: '253' },
  shutoffLever: { name: 'Shut-off lever', no: '162' },
  startLever: { name: 'Start lever', no: '248' },
  switchLever: { name: 'Switch lever', no: '195' },
  switchArm: { name: 'Switch arm on grooved shaft', no: '188 / 192' },
  powerSwitch: { name: 'Mains switch and switch slide', no: '129 / 167' },
  pawl: { name: 'Pawl and square bolt (manual start)', no: '273 / 274' },
  follower: { name: 'Cam follower lever', no: '207' },
  camRocker: { name: 'Cam rocker (record drop)', no: '173' },
  muting: { name: 'Muting switch', no: '—' },
  cueCam: { name: 'Lift cam and connecting rod (cue)', no: '220 / 270' },
  skateCam: { name: 'Anti-skating cam, skating lever and spring', no: '84 / 267 / 265' },
  indexLever: { name: 'Record-size indexing lever and arm positioning slide', no: '49 / 255' },
  modeLever: { name: 'Mode selector (single / multi)', no: '—' },
  neon: { name: 'Strobe neon glow lamp', no: '93' },
};

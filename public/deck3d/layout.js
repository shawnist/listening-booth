// Where everything sits on the deck. Metres. The spindle is the origin, x runs to the right,
// z runs toward the listener, y is up, and y = 0 is the top face of the deck plate.
export const TAU = Math.PI * 2;
export const REST = 0.168; // arm rest radius: must match the audio engine

export const PLINTH = { x0: -0.178, x1: 0.282, z0: -0.192, z1: 0.188, h: 0.054, r: 0.012 };
export const PLATE = { inset: 0.007, t: 0.003 };
export const PLATE_RECT = {
  x0: PLINTH.x0 + PLATE.inset, x1: PLINTH.x1 - PLATE.inset,
  z0: PLINTH.z0 + PLATE.inset, z1: PLINTH.z1 - PLATE.inset,
};
export const FOOT_H = 0.017;
export const Y_TABLE = -PLATE.t - PLINTH.h - FOOT_H;

export const R_PLATTER = 0.157; // outer rim
export const R_PLATTER_TOP = 0.151; // where the strobe bevel meets the top face
export const Y_BEVEL = 0.0165;
export const Y_PLATTER = 0.024;
export const R_MAT = 0.1485;
export const MAT_T = 0.0028;
export const Y_MAT = Y_PLATTER + MAT_T;
export const REC_T = 0.0018;
export const Y_REC = Y_MAT + REC_T; // the groove surface

export const DH = 0.0195; // stylus tip below the tonearm's bearing axis
export const Y_PIVOT = Y_REC + DH; // so the arm is level when it plays
export const LIFT = 0.0068; // stylus height above the record when cued up
export const Y_GRAB = Y_REC + 0.0165; // top of the headshell while playing: the plane the hand moves in
export const PIVOT_ANGLE = (27 * Math.PI) / 180; // pivot bearing from the spindle, toward the back right

// Shared rendering assumptions: 120 samples/s and 216/160 bars; not a verified Dual 1229 count.
// Plain 1229 service manual p.5 Fig.7 shows an asymmetric diode/capacitor lamp circuit,
// so 60 Hz mains alone does not establish 120 optical flashes/s. Retain these values
// until the original ring can be counted and the lamp waveform measured.
export const STROBE = { hz: 120, dots33: 216, dots45: 160, angle: (135 * Math.PI) / 180, r: 0.1715 };

export const CONTROLS = {
  start: { x: -0.148, z: 0.155, r: 0.017 },
  s33: { x: -0.106, z: 0.167, w: 0.021, d: 0.011 },
  s45: { x: -0.078, z: 0.171, w: 0.021, d: 0.011 },
  strobe: { x: Math.cos(STROBE.angle) * STROBE.r, z: Math.sin(STROBE.angle) * STROBE.r, r: 0.0085 },
  target: { x: 0.066, z: 0.170, r: 0.0065 },
  pitch: { x: 0.250, z: 0.100, travel: 0.042, range: 8 }, // toward the listener is faster
  cue: { x: 0.244, z: 0.006 },
};

export const smooth = (t) => t * t * (3 - 2 * t);
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

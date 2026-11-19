// Shared DSP building blocks for the cutter (main thread) and the deck engine (audio thread).
// Everything here is plain math with no browser dependencies, so Node can test it.

export const FS = 48000; // record-domain sample rate: one groove sample per 1/48000 s at cut speed

// The groove walls are stored as 16-bit whole numbers to halve the memory a side needs.
// Full scale is 0.5 m/s of wall velocity, which the cutter head never reaches, so one
// step is 15 micrometres per second: about 80 dB under a normal cut and far below the
// hiss of the vinyl itself.
export const GROOVE_FS = 0.5;
export const GROOVE_LSB = GROOVE_FS / 32767;

// ---- RIAA -----------------------------------------------------------------
// Playback (de-emphasis) curve built from the three RIAA time constants
// (3180 us, 318 us, 75 us) with matched poles and zeros. The record filter is
// the exact inverse, so cut followed by playback is transparent by construction.
export function riaa(fs = FS) {
  const p1 = Math.exp((-2 * Math.PI * 50.05) / fs);
  const z2 = Math.exp((-2 * Math.PI * 500.5) / fs);
  const p3 = Math.exp((-2 * Math.PI * 2122) / fs);
  const w = (2 * Math.PI * 1000) / fs;
  const mag = (r) => Math.hypot(1 - r * Math.cos(w), r * Math.sin(w));
  const g = (mag(p1) * mag(p3)) / mag(z2); // unity gain at 1 kHz
  return { p1, z2, p3, g };
}

// ---- Biquads (RBJ cookbook) -------------------------------------------------
export function lowpass(fs, f0, q) {
  const w = (2 * Math.PI * Math.min(f0, fs * 0.45)) / fs;
  const c = Math.cos(w), a = Math.sin(w) / (2 * q);
  const a0 = 1 + a;
  return { b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - a) / a0 };
}
export function highpass(fs, f0, q) {
  const w = (2 * Math.PI * f0) / fs;
  const c = Math.cos(w), a = Math.sin(w) / (2 * q);
  const a0 = 1 + a;
  return { b0: (1 + c) / 2 / a0, b1: -(1 + c) / a0, b2: (1 + c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - a) / a0 };
}

// ---- Windowed-sinc tables ---------------------------------------------------
function bessel0(x) {
  let sum = 1, term = 1;
  for (let k = 1; k < 40; k++) {
    term *= (x / (2 * k)) * (x / (2 * k));
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}
const sinc = (x) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const kaiser = (x, beta) => (Math.abs(x) >= 1 ? 0 : bessel0(beta * Math.sqrt(1 - x * x)) / bessel0(beta));

export const TAPS = 24;
export const PHASES = 512;

// Fractional-position reader: kernel[phase * TAPS + t] weights sample (i - TAPS/2 + 1 + t)
// for a read at position i + phase / PHASES (flat to about 19 kHz).
export function buildKernel(taps = TAPS, phases = PHASES, beta = 7) {
  const half = taps / 2;
  const k = new Float32Array(taps * phases);
  for (let ph = 0; ph < phases; ph++) {
    const frac = ph / phases;
    let sum = 0;
    for (let t = 0; t < taps; t++) {
      const x = t - (half - 1) - frac;
      const v = sinc(x) * kaiser(x / half, beta);
      k[ph * taps + t] = v;
      sum += v;
    }
    for (let t = 0; t < taps; t++) k[ph * taps + t] /= sum;
  }
  return k;
}

// Half-band low-pass used to bring the 96 kHz internal stream down to 48 kHz.
export const HB_LEN = 63;
export function buildHalfband(len = HB_LEN, beta = 7) {
  const mid = (len - 1) / 2;
  const h = new Float32Array(len);
  let sum = 0;
  for (let n = 0; n < len; n++) {
    const x = n - mid;
    h[n] = 0.5 * sinc(x / 2) * kaiser(x / (mid + 1), beta);
    sum += h[n];
  }
  for (let n = 0; n < len; n++) h[n] /= sum;
  return h;
}

// Small deterministic random generator so a given disc always has the same dust.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- each pressing's own warp (ported from the main Groove Deck's dsp.js, violet-lichen's
// sound-realism work). A record's seed comes from its identity (seedOf); its warp from the seed.
export function seedOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
// How warped this pressing came out of the sleeve. The same draws, in the same order, as the main
// app's discFlaws, so a seed gives the same warp in both; its scratches (drawn after) are not here.
// One pressing in five is badly warped (0.4 to 1.2 mm), the rest slightly (0.05 to 0.3 mm), with one
// or two high spots a turn. warp is in metres; the engine's height under the stylus is
// warp * (sin(n th + p0) + 0.15 sin(3n th + p1) + 0.04 sin(5n th + p2)), th the disc's turn.
export function discFlaws(seed) {
  const rnd = mulberry32((seed ^ 0x5eed5eed) >>> 0);
  const bad = rnd() < 0.2;
  const warp = (bad ? 0.4 + 0.8 * rnd() : 0.05 + 0.25 * rnd()) / 1000;
  const lobes = rnd() < 0.6 ? 1 : 2;
  const phase = [rnd(), rnd(), rnd()].map((x) => x * 2 * Math.PI);
  return { warp, lobes, phase };
}

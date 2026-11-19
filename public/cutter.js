// The lathe: turns PCM audio into a record side.
//
// What comes out is the groove itself, described two ways:
//   - uL / uR: the velocity of the left and right groove walls, one value per 1/48000 s
//     of groove at cut speed, stored as 16-bit numbers (one step is GROOVE_LSB metres
//     per second). A magnetic cartridge reads wall velocity, so this is the signal the
//     stylus will trace.
//   - radii[]: where each revolution of the spiral sits on the disc, spaced by how
//     far the groove actually swings (variable pitch).
// The original audio is not copied: src[] points at each track's own samples and says
// where on the side they sit, which is all the "File" comparison needs.
import { FS, riaa, highpass, GROOVE_LSB } from './dsp.js';

export const FORMATS = {
  '7-45': { name: '7" single · 45 rpm', rpm: 45, disc: 0.0875, start: 0.084, innerMin: 0.054, lock: 0.0495, label: 0.044, hole: 0.0191 },
  '12-33': { name: '12" LP · 33⅓ rpm', rpm: 100 / 3, disc: 0.1508, start: 0.146, innerMin: 0.0603, lock: 0.0535, label: 0.05, hole: 0.0036 },
  '12-45': { name: '12" maxi · 45 rpm', rpm: 45, disc: 0.1508, start: 0.146, innerMin: 0.0603, lock: 0.0535, label: 0.05, hole: 0.0036 },
};

// Wall velocity that digital full scale maps to at 1 kHz, before the level knob.
// 0.10 m/s per wall is 14 cm/s lateral peak: about 6 dB over the classic
// 5 cm/s RMS reference level, which is how a loud modern side is cut.
export const VEL_REF = 0.1;

const GROOVE_WIDTH = 56e-6; // unmodulated groove top width (2.2 mil)
const LAND = 12e-6; // minimum uncut vinyl between neighbouring grooves
const LEAD_IN_S = 2.0;
const GAP_S = 3.0;
const GAP_SCROLL = 450e-6; // extra spacing cut between tracks: the visible band you aim the needle at
const TAIL_S = 1.5;
const LEAD_OUT_REVS = 3;
const MAX_SPREAD = 2.2;
const AUTO_FLOOR = Math.pow(10, -10 / 20); // the most a long side is turned down to make it fit

class Biquad {
  constructor(c) { this.b0 = c.b0; this.b1 = c.b1; this.b2 = c.b2; this.a1 = c.a1; this.a2 = c.a2; this.z1 = 0; this.z2 = 0; }
  run(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

export function capacitySeconds(formatKey) {
  // Rough ceiling at the tightest practical spacing, for the queue display only.
  const f = FORMATS[formatKey];
  const turns = (f.start - f.innerMin) / (GROOVE_WIDTH + LAND + 20e-6);
  return (turns * 60) / f.rpm;
}

// How long a side runs for tracks of these lengths: lead-in, the gaps between tracks, tail.
export function sideSeconds(trackSeconds) {
  let s = LEAD_IN_S + TAIL_S + GAP_S * Math.max(0, trackSeconds.length - 1);
  for (const t of trackSeconds) s += t;
  return s;
}

// opts: format, levelDb, bassMono, autoLevel, and leadInS (seconds of silent lead-in, LEAD_IN_S if not
// given). With autoLevel a side that would not fit is cut quieter until it does, which is what a
// mastering engineer does with a long side.
export async function cutSide(tracks, opts = {}, onProgress = () => {}) {
  const formatKey = opts.format || '7-45';
  const fmt = FORMATS[formatKey];
  const rev = Math.round((FS * 60) / fmt.rpm);
  const level = Math.pow(10, (opts.levelDb || 0) / 20);
  let velFS = VEL_REF * level;
  const bassMono = opts.bassMono !== false;

  // ---- lay out the timeline -------------------------------------------------
  const marks = [];
  const src = [];
  let pos = Math.round((opts.leadInS ?? LEAD_IN_S) * FS);
  for (const t of tracks) {
    const len = t.pcm.length >> 1;
    marks.push({ title: t.title, artist: t.artist || '', start: pos, end: pos + len });
    // what "File" plays: the track's own audio, or the audio it came from when it was mastered
    // on the way to the lathe (t.source); never read past the end of either
    const s = t.source || t.pcm;
    src.push({ start: pos, end: pos + Math.min(len, s.length >> 1), pcm: s });
    pos += len + Math.round(GAP_S * FS);
  }
  const musicEnd = pos - Math.round(GAP_S * FS) + Math.round(TAIL_S * FS);
  const musicTurns = Math.ceil(musicEnd / rev);
  const turns = musicTurns + LEAD_OUT_REVS + 1; // last turn is the locked groove
  const N = turns * rev;

  const uL = new Int16Array(N);
  const uR = new Int16Array(N);
  const maxLat = new Float32Array(turns + 1);
  const maxVert = new Float32Array(turns + 1);
  const maxVel = new Float32Array(turns + 1);
  const sumSq = new Float64Array(turns + 1);

  // ---- cutting chain --------------------------------------------------------
  const R = riaa(FS);
  const rb1 = -(R.p1 + R.p3), rb2 = R.p1 * R.p3, rg = 1 / R.g;
  const leak = 1 - (2 * Math.PI * 8) / FS;
  const total = marks.reduce((s, m) => s + (m.end - m.start), 0) || 1;
  const toStep = 1 / GROOVE_LSB;
  let done = 0;
  let peakVel = 0, peakLat = 0;
  let dz = 0x2545f491; // dither generator, the same for every cut so a side always cuts the same

  for (let ti = 0; ti < tracks.length; ti++) {
    const pcm = tracks[ti].pcm;
    const m = marks[ti];
    const len = m.end - m.start;
    // Elliptical filter: stereo difference below 150 Hz is folded to mono, as on
    // a real lacquer, because out-of-phase bass means deep vertical groove swings.
    const sideHp = new Biquad(highpass(FS, 150, 0.707));
    const subL = new Biquad(highpass(FS, 18, 0.707));
    const subR = new Biquad(highpass(FS, 18, 0.707));
    let lx1 = 0, lx2 = 0, ly1 = 0, rx1 = 0, rx2 = 0, ry1 = 0; // RIAA record state
    let y = 0, z = 0; // lateral and vertical groove displacement (metres)

    for (let i = 0; i < len; i++) {
      const n = m.start + i;
      let l = pcm[2 * i] / 32768, r = pcm[2 * i + 1] / 32768;
      if (bassMono) {
        const mid = (l + r) * 0.5;
        const side = sideHp.run((l - r) * 0.5);
        l = mid + side; r = mid - side;
      }
      l = subL.run(l); r = subR.run(r);
      // RIAA recording curve: bass cut, treble boost.
      let pl = (l + rb1 * lx1 + rb2 * lx2) * rg + R.z2 * ly1;
      lx2 = lx1; lx1 = l; ly1 = pl;
      let pr = (r + rb1 * rx1 + rb2 * rx2) * rg + R.z2 * ry1;
      rx2 = rx1; rx1 = r; ry1 = pr;
      pl *= velFS; pr *= velFS;
      // Cutter head protection: velocity runs out smoothly instead of clipping.
      let al = Math.abs(pl), ar = Math.abs(pr);
      if (al > 0.3) { pl = Math.sign(pl) * (0.3 + 0.2 * Math.tanh((al - 0.3) / 0.2)); al = Math.abs(pl); }
      if (ar > 0.3) { pr = Math.sign(pr) * (0.3 + 0.2 * Math.tanh((ar - 0.3) / 0.2)); ar = Math.abs(pr); }
      // Round to 16 bits with a little dither, so the rounding is a steady hiss far
      // below the vinyl's own rather than distortion on quiet passages.
      dz = (Math.imul(dz, 1664525) + 1013904223) | 0;
      let q = Math.round(pl * toStep + ((dz >>> 16) - (dz & 0xffff)) / 65536);
      uL[n] = q > 32767 ? 32767 : q < -32767 ? -32767 : q;
      dz = (Math.imul(dz, 1664525) + 1013904223) | 0;
      q = Math.round(pr * toStep + ((dz >>> 16) - (dz & 0xffff)) / 65536);
      uR[n] = q > 32767 ? 32767 : q < -32767 ? -32767 : q;

      y = y * leak + ((pl + pr) * 0.70710678) / FS;
      z = z * leak + ((pl - pr) * 0.70710678) / FS;
      const k = (n / rev) | 0;
      const ay = Math.abs(y), az = Math.abs(z), av = al > ar ? al : ar;
      if (ay > maxLat[k]) maxLat[k] = ay;
      if (az > maxVert[k]) maxVert[k] = az;
      if (av > maxVel[k]) maxVel[k] = av;
      sumSq[k] += pl * pl + pr * pr;

      if ((i & 0x3ffff) === 0x3ffff) {
        onProgress((done + i) / total);
        await tick();
      }
    }
    done += len;
  }

  // ---- variable pitch: space each turn by how far it and its neighbour swing --
  const scroll = new Float32Array(turns);
  let fixed = 0, swung = 0;
  for (let k = 0; k < musicTurns; k++) {
    const mid = (k + 0.5) * rev;
    for (let t = 0; t + 1 < marks.length; t++) if (mid > marks[t].end && mid < marks[t + 1].start) scroll[k] = GAP_SCROLL;
    fixed += GROOVE_WIDTH + LAND + scroll[k];
    swung += maxLat[k] + maxVert[k] + maxLat[k + 1] + maxVert[k + 1];
  }
  const available = fmt.start - fmt.innerMin;
  let autoDb = 0;
  if (opts.autoLevel && fixed + swung > available && swung > 0) {
    // Too much swing for the room on the disc: turn the whole side down until it fits.
    const g = Math.max(AUTO_FLOOR, Math.min(1, (0.995 * (available - fixed)) / swung));
    for (const m of marks) for (let n = m.start; n < m.end; n++) { uL[n] = Math.round(uL[n] * g); uR[n] = Math.round(uR[n] * g); }
    for (let k = 0; k <= turns; k++) { maxLat[k] *= g; maxVert[k] *= g; maxVel[k] *= g; sumSq[k] *= g * g; }
    swung *= g; velFS *= g;
    autoDb = 20 * Math.log10(g);
  }
  for (let k = 0; k < turns; k++) {
    if (maxLat[k] > peakLat) peakLat = maxLat[k];
    if (maxVel[k] > peakVel) peakVel = maxVel[k];
  }
  const needed = fixed + swung;
  const fits = needed <= available;
  const spread = fits ? Math.min(available / needed, MAX_SPREAD) : available / needed;
  const radii = new Float32Array(turns + 1);
  const turnRms = new Float32Array(turns);
  radii[0] = fmt.start;
  let pMin = Infinity, pMax = 0;
  for (let k = 0; k < musicTurns; k++) {
    const pk = (GROOVE_WIDTH + LAND + scroll[k] + maxLat[k] + maxVert[k] + maxLat[k + 1] + maxVert[k + 1]) * spread;
    radii[k + 1] = radii[k] - pk;
    if (pk < pMin) pMin = pk;
    if (pk > pMax) pMax = pk;
  }
  const innerRadius = radii[musicTurns];
  const outStep = Math.max((innerRadius - fmt.lock) / LEAD_OUT_REVS, 60e-6);
  for (let k = musicTurns; k < turns - 1; k++) radii[k + 1] = radii[k] - outStep;
  radii[turns] = radii[turns - 1]; // locked groove: a closed circle
  let maxSlope = 0;
  for (let k = 0; k < turns; k++) {
    turnRms[k] = Math.sqrt(sumSq[k] / (2 * rev));
    const v = (2 * Math.PI * radii[k + 1] * fmt.rpm) / 60;
    const s = maxVel[k] / v;
    if (s > maxSlope) maxSlope = s;
  }
  for (const m of marks) {
    const k = Math.min(turns - 1, (m.start / rev) | 0);
    m.startRadius = radii[k];
    m.endRadius = radii[Math.min(turns, Math.ceil(m.end / rev))];
  }
  onProgress(1);

  return {
    formatKey, fmt, rpm: fmt.rpm, rev, N, turns, musicTurns,
    uL, uR, src, velFS, radii, turnRms, tracks: marks,
    leadIn: marks.length ? marks[0].start : 0, // the silent turns before the music
    stats: {
      seconds: musicEnd / FS, turns: musicTurns, peakVel, peakLat,
      pitchMin: pMin, pitchMax: pMax, spread, fits, innerRadius, maxSlope,
      levelDb: (opts.levelDb || 0) + autoDb, autoDb, bassMono,
    },
  };
}

// Radius of the groove (metres) at record position p (samples).
export function radiusAt(radii, rev, p) {
  const t = p / rev;
  let k = Math.floor(t);
  if (k < 0) return radii[0];
  if (k >= radii.length - 1) return radii[radii.length - 1];
  return radii[k] + (radii[k + 1] - radii[k]) * (t - k);
}

// Record position (samples) whose groove sits at radius r. Radii decrease inward.
export function positionAtRadius(radii, rev, r) {
  const last = radii.length - 1;
  if (r >= radii[0]) return 0;
  if (r <= radii[last]) return (last - 1) * rev;
  let lo = 0, hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (radii[mid] >= r) lo = mid; else hi = mid;
  }
  const span = radii[lo] - radii[hi];
  const f = span > 0 ? (radii[lo] - r) / span : 0;
  return (lo + f) * rev;
}

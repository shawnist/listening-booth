// The deck: platter, stylus, cartridge, tonearm and phono preamp.
//
// The stylus does not "play a file". It sits at a position on the groove and the
// cartridge outputs how fast the groove walls move past it. So everything the
// platter does (start-up, a hand on the record, a backspin, the wrong speed)
// changes pitch and level the way it does on a real deck, with no special cases.
import { FS, GROOVE_LSB, riaa, lowpass, highpass, buildKernel, buildHalfband, TAPS, PHASES, HB_LEN, mulberry32, discFlaws } from './dsp.js';
import { radiusAt, positionAtRadius } from './cutter.js';

export const DEFAULTS = {
  power: false,
  targetRate: 1, // platter speed relative to the speed the side was cut at
  motorTau: 0.05, motorAcc: 1.45, motorDec: 2.2, // direct drive: firm linear ramp
  slipTau: 0.12, // how quickly a released record catches the platter
  grip: 0.01, // how much a held record drags the platter with it (slipmat = little)
  tipRadius: 18e-6, // stylus contact radius along the groove (0.7 mil conical)
  tipF: 19000, tipQ: 1.6, // stylus tip mass bouncing on the vinyl
  elecF: 14500, elecQ: 1.0, // coil inductance against cable capacitance (0 = none)
  crosstalk: 0.05,
  scanLen: 2.5e-6, // contact patch length: sets inner-groove treble loss
  armL: 0.229, null1: 0.066, null2: 0.1209, // 9" arm, Baerwald alignment
  armF: 9.5, armQ: 2.2, // arm mass on cartridge compliance
  eccentricity: 0.00015, // spindle hole off-centre (metres) -> wow
  // Record warp (ported from the main Groove Deck: violet-lichen's sound realism, and its skipping):
  compliance: 0.015, // how far the cantilever gives per newton (metres): with the force, whether a warp lifts the tip
  warp: 1, // 0 = flat, 1 = the record's own warp, 2 = twice it
  legacyWarpSkip: true, // decks with their own contact model handle groove jumps themselves
  subsonic: true, // the phono stage's subsonic filter: steep below 16 Hz, as most have
  flutter: 0.0003,
  rumble: 1,
  surface: 0.3, // 0 = fresh pressing, 1 = well-loved
  preGain: 1, tube: 0,
  volume: 0.8,
  mode: 'groove', // 'groove' = through the whole chain, 'source' = the original file
};

const NZ = 1 << 19;
const NZMASK = NZ - 1;
const REST_RADIUS = 0.168;

// ---- wear: what a record picks up from being owned ---------------------------------
// Play wear. Each pass of the stylus polishes the finest detail off the groove walls
// and roughens them a little. `plays` is how many times a revolution has been played.
export const WEAR_PLAYS = 40; // plays at which a revolution is about two thirds worn
export const wearAmount = (plays) => 1 - Math.exp(-plays / WEAR_PLAYS);
const WEAR_SCAN = 12e-6; // a fully worn groove has lost detail shorter than about this (metres)
const WEAR_HISS = 0.8, WEAR_CRACKLE = 0.25; // noise a fully worn groove adds, in "Surface wear" slider units
// Dust sits on the surface: mostly crackle, some hiss.
const DUST_HISS = 0.35, DUST_CRACKLE = 0.75;
// A needle dropped by hand dents the groove. The dent is a short kick in wall velocity
// that returns to where it started, cut into the groove data itself, so it clicks at
// whatever speed and in whichever direction the stylus crosses it.
export const MAX_TICKS = 48;
const TAN_VTA = Math.tan((20 * Math.PI) / 180); // stylus rake: a warp's rise moves the tip along the groove
const TICK_VEL = 0.07; // peak wall velocity of the hardest dent (m/s)
const TICK_SHAPE = [0.6, 1, -0.9, -0.5, -0.2];
const NO_SRC = [];

export class DeckEngine {
  constructor() {
    this.P = { ...DEFAULTS };
    this.kernel = buildKernel();
    this.hb = buildHalfband();
    this.hbL = new Float32Array(64);
    this.hbR = new Float32Array(64);
    this.hbPos = 0;
    this.side = null;
    this.discPos = 0; // disc rotation, in record samples (one revolution = side.rev)
    this.wr = 0; // record speed, 1 = cut speed
    this.wp = 0; // platter speed
    this.p = 0; // stylus position along the groove, in record samples
    this.needleDown = false;
    this.held = false;
    this.handPos = 0;
    this.armRadius = REST_RADIUS;
    this.rev = 86400;
    this.rpm = 100 / 3;
    this.uLp = 0; this.uRp = 0; this.ylat = 0;
    this.thump = 0;
    this.flut = 0;
    this.seed = 12345;
    this.peakL = 0; this.peakR = 0;
    this.plays = null; // plays per revolution of the side on the platter (null: this side does not wear)
    this.fresh = null; // the part of `plays` not yet reported to the app
    this.freshLo = 1e9; this.freshHi = -1; this.freshSamples = 0;
    this.dust = 0;
    this.ticks = 0; this.maxTicks = 0; this.lastTick = null;
    this.flaws = discFlaws(0); this.discSeed = 0; // this pressing's own warp
    this.air = 0; this.airMin = 0; this.skipN = 0; // the tip off the record on a warp, and grooves skipped
    this.R = riaa(FS);
    this._zero();
    this._noise();
    this._coeffs();
  }

  _zero() {
    this.s = new Float64Array(40); // filter state, indexed by the constants below
    this.hbL.fill(0); this.hbR.fill(0);
  }

  _noise() {
    // Surface noise is pressed into the disc: it is read at the stylus position,
    // so it slows down, stops and reverses with the record.
    const rnd = mulberry32(0x51de0a);
    const hL = new Float32Array(NZ), hR = new Float32Array(NZ);
    const cL = new Float32Array(NZ), cR = new Float32Array(NZ);
    let pl = 0, pr = 0, xl = 0, xr = 0;
    const k = Math.exp((-2 * Math.PI * 500) / FS);
    for (let i = 0; i < NZ; i++) {
      const a = (rnd() + rnd() + rnd() - 1.5) * 2, b = (rnd() + rnd() + rnd() - 1.5) * 2;
      // one-pole high-pass so that, after the playback curve, hiss is flat rather than a rumble
      pl = k * (pl + a - xl); xl = a;
      pr = k * (pr + b - xr); xr = b;
      const common = 0.6;
      hL[i] = 4e-4 * (pl * common + pr * (1 - common));
      hR[i] = 4e-4 * (pr * common + pl * (1 - common));
    }
    // A few defects excite a short ring after the initial impact. This makes individual
    // surface pops audible through music without raising the continuous hiss.
    const popShape = Float32Array.from({ length: 40 }, (_, j) =>
      1.8 * Math.exp(-j / 12) * Math.cos(2 * Math.PI * 1800 * j / FS));
    const clickShape = [1, -0.7, -0.3, 0];
    const clicks = Math.round((NZ / FS) * 5);
    for (let c = 0; c < clicks; c++) {
      const i = 4 + Math.floor(rnd() * (NZ - 16));
      const amp = 0.006 * Math.exp(3.2 * rnd() * rnd()) * (rnd() < 0.5 ? -1 : 1);
      const wl = 0.3 + 0.7 * rnd(), wr = (0.3 + 0.7 * rnd()) * (rnd() < 0.7 ? 1 : -1);
      const pop = rnd() < 0.2;
      const shape = pop ? popShape : clickShape;
      for (let j = 0; j < shape.length; j++) {
        const at = (i + j) & NZMASK;
        cL[at] += amp * wl * shape[j]; cR[at] += amp * wr * shape[j];
      }
    }
    this.hL = hL; this.hR = hR; this.cL = cL; this.cR = cR;
  }

  _coeffs() {
    const P = this.P;
    this.tip = P.tipF > 0 ? lowpass(2 * FS, P.tipF, P.tipQ) : null;
    this.elec = P.elecF > 0 ? lowpass(2 * FS, P.elecF, P.elecQ) : null;
    this.arm = P.armF > 0 ? highpass(FS, P.armF, P.armQ) : null;
    // fourth-order Butterworth high-pass at 16 Hz: warps and rumble out, music bass untouched
    this.sub = P.subsonic ? [highpass(FS, 16, 0.5412), highpass(FS, 16, 1.3066)] : null;
  }

  set(params) {
    Object.assign(this.P, params);
    this._coeffs();
  }

  load(side) {
    // side: { uL, uR (16-bit groove walls), src: [{ start, end, pcm }] (the original audio,
    //         interleaved, and where it sits on the side), radii, rev, rpm, N, velFS,
    //         and, for a record that wears: musicTurns, leadIn,
    //         wear: { plays: plays per revolution, ticks: [{ p, a }], dust: 0..1, maxTicks } }
    this.side = side;
    this.rev = side.rev;
    this.rpm = side.rpm;
    this.needleDown = false;
    this.armRadius = REST_RADIUS;
    this.p = 0;
    this.uLp = 0; this.uRp = 0; this.ylat = 0;
    this.plays = null; this.fresh = null; this.freshLo = 1e9; this.freshHi = -1; this.freshSamples = 0;
    this.dust = 0; this.ticks = 0; this.maxTicks = 0; this.lastTick = null;
    // this pressing's own warp
    this.discSeed = (side.seed || 0) >>> 0;
    this.flaws = discFlaws(this.discSeed);
    this.air = 0; this.airMin = 0; this.s[34] = 1;
    const w = side.wear;
    if (w) {
      const turns = side.musicTurns || 0;
      this.plays = new Float32Array(turns);
      this.fresh = new Float32Array(turns);
      const had = w.plays || [];
      for (let k = 0; k < turns && k < had.length; k++) this.plays[k] = had[k] || 0;
      this.dust = w.dust || 0;
      this.maxTicks = w.maxTicks === undefined ? MAX_TICKS : w.maxTicks;
      for (const t of w.ticks || []) { this._dent(t.p, t.a); this.ticks++; }
    }
  }

  // Takes the record off. Returns it, so whoever lent the audio can have it back.
  unload() {
    const side = this.side;
    this.side = null; this.plays = null; this.fresh = null;
    this.needleDown = false; this.armRadius = REST_RADIUS;
    return side;
  }

  // Lower the stylus at a radius (metres). It lands in whichever groove turn is
  // under it at the disc's current angle. `byHand` is a drop from the fingers rather
  // than the cue lever: on the music it dents the groove, and lastTick says where.
  drop(radius, byHand = false) {
    this.s[34] = 1; this.air = 0; // the needle lands: the warp's arm filter starts from where it is
    const side = this.side;
    this.armRadius = radius;
    this.lastTick = null;
    if (!side) { this.needleDown = false; return false; }
    if (radius > side.radii[0] + 0.0015) { this.needleDown = false; return false; }
    const target = positionAtRadius(side.radii, side.rev, radius);
    const phase = ((this.discPos % side.rev) + side.rev) % side.rev;
    let p = phase + side.rev * Math.round((target - phase) / side.rev);
    if (p < 16) p += side.rev;
    if (p > side.N - 32) p -= side.rev;
    this.p = p;
    this.uLp = 0; this.uRp = 0; this.ylat = 0;
    this.needleDown = true;
    this.thump = 1;
    // The lead-in is there to be landed on: only a drop on the music leaves a mark.
    if (byHand && this.plays && p > (side.leadIn || 0) && this.ticks < this.maxTicks) {
      this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
      const tick = { p: Math.round(p) + 40, a: Math.round((0.45 + 0.55 * (this.seed / 4294967296)) * 100) / 100 };
      this._dent(tick.p, tick.a);
      this.ticks++;
      this.lastTick = tick;
    }
    return true;
  }

  // Cut one dent into the groove walls at position p (samples), a = 0..1 how hard.
  _dent(p, a) {
    const side = this.side, i = Math.round(p);
    if (!side || !(i > 8) || i > side.N - 16) return;
    // which wall takes more of it depends on where it landed; mostly it is an up-and-down dent
    const h = Math.imul(i, 2654435761) >>> 0;
    const wl = 0.7 + 0.3 * ((h & 255) / 255), wr = -(0.5 + 0.5 * (((h >>> 8) & 255) / 255));
    const peak = (a * TICK_VEL) / GROOVE_LSB;
    for (let j = 0; j < TICK_SHAPE.length; j++) {
      let v = side.uL[i + j] + peak * wl * TICK_SHAPE[j];
      side.uL[i + j] = v > 32767 ? 32767 : v < -32767 ? -32767 : v;
      v = side.uR[i + j] + peak * wr * TICK_SHAPE[j];
      side.uR[i + j] = v > 32767 ? 32767 : v < -32767 ? -32767 : v;
    }
  }

  // Plays added to each revolution since the last call, or null if there were none.
  // { from: first revolution, add: [plays...], seconds: playing time at cut speed }
  takeWear() {
    if (!this.fresh || this.freshHi < this.freshLo) return null;
    const out = { from: this.freshLo, add: Array.from(this.fresh.subarray(this.freshLo, this.freshHi + 1)), seconds: this.freshSamples / FS };
    this.fresh.fill(0, this.freshLo, this.freshHi + 1);
    this.freshLo = 1e9; this.freshHi = -1; this.freshSamples = 0;
    return out;
  }

  lift() { this.needleDown = false; }
  rest() { this.needleDown = false; this.armRadius = REST_RADIUS; }

  touchStart() { this.held = true; this.handPos = this.discPos; }
  touchMove(deltaRevs) { this.handPos += deltaRevs * this.rev; }
  touchEnd() { this.held = false; }

  status() {
    const st = {
      p: this.p, discPos: this.discPos, rev: this.rev, wr: this.wr, wp: this.wp,
      radius: this.armRadius, down: this.needleDown, held: this.held,
      peakL: this.peakL, peakR: this.peakR, ticks: this.ticks,
      skips: this.skipN, // grooves the stylus jumped since the last status
    };
    this.peakL = 0; this.peakR = 0; this.skipN = 0;
    return st;
  }

  // A short stretch of the groove walls either side of the stylus, for the microscope.
  grooveWindow(len = 512) {
    const side = this.side;
    if (!side || !this.needleDown) return null;
    const start = Math.max(0, Math.min(side.N - len, Math.floor(this.p) - (len >> 1)));
    const l = new Float32Array(len), r = new Float32Array(len); // metres per second
    for (let i = 0; i < len; i++) { l[i] = side.uL[start + i] * GROOVE_LSB; r[i] = side.uR[start + i] * GROOVE_LSB; }
    return { l, r };
  }

  process(outL, outR, n) {
    const P = this.P, side = this.side, K = this.kernel, hb = this.hb, s = this.s;
    const hbL = this.hbL, hbR = this.hbR;
    const dt = 1 / (2 * FS);
    const rev = this.rev;
    const down = this.needleDown && !!side;
    const source = P.mode === 'source';
    const uL = side ? side.uL : null;
    const uR = side ? side.uR : null;
    const src = (side && side.src) || NO_SRC; // the original audio, for the "File" comparison
    let sPcm = null, sA = 0, sB = -1; // the track under the stylus and where it starts and ends
    const N = side ? side.N : 0;
    const pStart = this.p;
    const lockEnd = N - 24;
    const srcScale = 1 / 32768;

    // ---- things that change slowly: once per block ---------------------------
    let r = this.armRadius;
    if (down) { r = radiusAt(side.radii, rev, this.p); this.armRadius = r; }
    const V = Math.max(0.05, (2 * Math.PI * r * this.rpm) / 60); // groove speed at cut rpm (m/s)
    const invV = 1 / V;
    const cT = (P.tipRadius / V) * FS; // tracing reach in samples per unit of sin(slope)
    const L = P.armL;
    const eps = L > 0 ? Math.asin(Math.min(1, (r * r + P.null1 * P.null2) / (2 * r * L))) - Math.asin((P.null1 + P.null2) / (2 * L)) : 0;
    const cE = Math.tan(eps) * invV * FS; // tracking-error reach in samples per metre of swing
    const eccOverR = P.eccentricity / r;
    const twoPiOverRev = (2 * Math.PI) / rev;
    const absW = Math.abs(this.wr);
    // how worn the groove under the stylus is: 0 = unplayed, towards 1 = played to death
    const plays = this.plays, turn = down ? (this.p / rev) | 0 : -1;
    const worn = plays && turn >= 0 && turn < plays.length ? wearAmount(plays[turn]) : 0;
    const scanLen = P.scanLen + WEAR_SCAN * worn; // a worn wall has lost its finest detail
    const scanG = scanLen > 0 ? 1 - Math.exp((-2 * Math.PI * Math.max(30, Math.min(40000, (V * absW) / (2 * Math.PI * scanLen)))) / (2 * FS)) : 1;
    const kHand = 1 - Math.exp(-dt / 0.003);
    const kSlip = 1 - Math.exp(-dt / P.slipTau);
    const gripK = (P.grip * dt) / 0.05;
    const target = P.power ? P.targetRate : 0;
    const sf = P.surface + DUST_HISS * this.dust + WEAR_HISS * worn; // hiss
    const sf2 = P.surface * P.surface + DUST_CRACKLE * this.dust + WEAR_CRACKLE * worn; // crackle
    const gs = GROOVE_LSB;
    const hL = this.hL, hR = this.hR, cL = this.cL, cR = this.cR;
    const tip = this.tip, elec = this.elec, arm = this.arm;
    const R = this.R, ra1 = R.p1 + R.p3, ra2 = R.p1 * R.p3;
    const invVel = side ? 1 / side.velFS : 1;
    const ct = P.crosstalk;
    const tube = P.tube;
    const lk = (2 * Math.PI * 8) / FS;
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    this.flut += (this.seed / 2147483648 - 1 - this.flut) * 0.08;
    const flutter = this.flut * P.flutter * 3;
    // Warp: the record's height under the stylus rises and falls with its angle.
    const fl = this.flaws, wA = fl.warp * P.warp, wn = fl.lobes, wph = fl.phase;
    const wOmega = (2 * Math.PI * this.rpm) / 60; // radians per second at cut speed
    // Warp skipping for decks without a contact model. The cantilever's deflection is
    // the warp through the arm resonance (a high-pass at armF), and it pushes on the record with
    // force / compliance. When the warp falls away faster than that and the tracking force can
    // hold, the tip lifts off. Where it lands depends on how far it flew: the skating force pulls
    // it inward, so a long flight lands a groove or two further on.
    const Fn = (P.trackingForce ?? P.trackForce ?? 0) * 9.81e-3, kStiff = P.compliance > 0 ? 1 / P.compliance : 0;
    const canSkip = P.legacyWarpSkip && Fn > 0 && kStiff > 0 && !!this.arm && !source;
    let air = this.air, airMin = this.airMin, skipN = this.skipN;
    const subF = this.sub;
    const rumbleAmp = 0.0063 * P.rumble;

    let wp = this.wp, wr = this.wr, discPos = this.discPos, p = this.p;
    let uLp = this.uLp, uRp = this.uRp, ylat = this.ylat, thump = this.thump;
    let hbPos = this.hbPos, seed = this.seed;
    let peakL = this.peakL, peakR = this.peakR;
    const held = this.held, handPos = this.handPos;
    const HALF = TAPS / 2;

    for (let i = 0; i < n; i++) {
      for (let sub = 0; sub < 2; sub++) {
        // ---- motor, platter, record, hand ----
        let acc = (target - wp) / P.motorTau;
        if (acc > P.motorAcc) acc = P.motorAcc; else if (acc < -P.motorDec) acc = -P.motorDec;
        wp += acc * dt;
        if (held) {
          const wt = (handPos - discPos) / (0.012 * FS);
          wr += (wt - wr) * kHand;
          wp += (wr - wp) * gripK;
        } else {
          wr += (wp - wr) * kSlip;
        }
        discPos += wr * 0.5;

        let vL = 0, vR = 0;
        if (down) {
          const th = discPos * twoPiOverRev;
          // how steeply the warp is rising under the stylus (height change per radian, over wA)
          const slope = wA > 0 ? wn * Math.cos(wn * th + wph[0]) + 0.45 * wn * Math.cos(3 * wn * th + wph[1]) + 0.2 * wn * Math.cos(5 * wn * th + wph[2]) : 0;
          const wow = eccOverR * Math.cos(th) + flutter + (wA * TAN_VTA * slope) / r;
          const adv = wr * (1 + wow) * 0.5; // groove samples passing the stylus this step
          p += adv;
          if (p >= lockEnd) { p -= rev; thump = Math.max(thump, 0.25); } // locked groove
          else if (p < 16) p = 16;

          if (source) {
            const i0 = Math.floor(p), k0 = (((p - i0) * PHASES) | 0) * TAPS, b = i0 - HALF + 1;
            if (b < sA || b + TAPS > sB) { // off the track being read: find the one under the stylus
              sPcm = null;
              for (let j = 0; j < src.length; j++) if (b >= src[j].start && b + TAPS <= src[j].end) { sPcm = src[j].pcm; sA = src[j].start; sB = src[j].end; break; }
              if (!sPcm) { sA = 0; sB = -1; }
            }
            if (sPcm) {
              let a = 0, c = 0, o = 2 * (b - sA);
              for (let t = 0; t < TAPS; t++, o += 2) { const w = K[k0 + t]; a += w * sPcm[o]; c += w * sPcm[o + 1]; }
              vL = a * srcScale; vR = c * srcScale;
            }
          } else {
            // ---- tracing: a round tip touches a sloped wall ahead of or behind its centre ----
            let tL = uLp * invV; if (tL > 2) tL = 2; else if (tL < -2) tL = -2;
            let tR = -uRp * invV; if (tR > 2) tR = 2; else if (tR < -2) tR = -2;
            const dte = ylat * cE; // tonearm not tangent to the groove
            const qL = p + (cT * tL) / Math.sqrt(1 + tL * tL) + dte;
            const qR = p + (cT * tR) / Math.sqrt(1 + tR * tR) + dte;
            let i0 = Math.floor(qL), k0 = (((qL - i0) * PHASES) | 0) * TAPS, b = i0 - HALF + 1;
            let a = 0;
            if (b >= 0 && b + TAPS <= N) for (let t = 0; t < TAPS; t++) a += K[k0 + t] * uL[b + t];
            uLp = a * gs;
            i0 = Math.floor(qR); k0 = (((qR - i0) * PHASES) | 0) * TAPS; b = i0 - HALF + 1;
            a = 0;
            if (b >= 0 && b + TAPS <= N) for (let t = 0; t < TAPS; t++) a += K[k0 + t] * uR[b + t];
            uRp = a * gs;
            ylat = ylat * (1 - lk * Math.abs(adv)) + ((uLp + uRp) * 0.70710678 * adv) / FS;
            const ni = (p | 0) & NZMASK;
            const rate = adv * 2; // a magnetic cartridge outputs velocity
            vL = (uLp + hL[ni] * sf + cL[ni] * sf2) * rate;
            vR = (uRp + hR[ni] * sf + cR[ni] * sf2) * rate;
            // the warp lifts and lowers the stylus: a vertical movement, in both walls
            const vz = wA * slope * wOmega * wr * 0.70710678;
            vL += vz; vR -= vz;
          }
        }

        if (!source) {
          // contact patch averages the groove (treble loss, worse near the label)
          s[0] += (vL - s[0]) * scanG; vL = s[0];
          s[1] += (vR - s[1]) * scanG; vR = s[1];
          if (tip) {
            let y = tip.b0 * vL + s[2]; s[2] = tip.b1 * vL - tip.a1 * y + s[3]; s[3] = tip.b2 * vL - tip.a2 * y; vL = y;
            y = tip.b0 * vR + s[4]; s[4] = tip.b1 * vR - tip.a1 * y + s[5]; s[5] = tip.b2 * vR - tip.a2 * y; vR = y;
          }
          if (elec) {
            let y = elec.b0 * vL + s[6]; s[6] = elec.b1 * vL - elec.a1 * y + s[7]; s[7] = elec.b2 * vL - elec.a2 * y; vL = y;
            y = elec.b0 * vR + s[8]; s[8] = elec.b1 * vR - elec.a1 * y + s[9]; s[9] = elec.b2 * vR - elec.a2 * y; vR = y;
          }
        }
        hbL[hbPos] = vL; hbR[hbPos] = vR; hbPos = (hbPos + 1) & 63;
      }

      // ---- the warp against the tracking force: does the tip stay on the record? ----
      if (canSkip && down && wA > 0) {
        const arm = this.arm, th = discPos * twoPiOverRev;
        const zw = wA * (Math.sin(wn * th + wph[0]) + 0.15 * Math.sin(3 * wn * th + wph[1]) + 0.04 * Math.sin(5 * wn * th + wph[2]));
        // cantilever deflection: the warp through the arm resonance (displacement, metres); s[32..33] its state
        if (s[34]) { s[32] = -arm.b0 * zw; s[33] = arm.b2 * zw; s[34] = 0; } // landed: the arm is already at this height
        const dfl = arm.b0 * zw + s[32]; s[32] = arm.b1 * zw - arm.a1 * dfl + s[33]; s[33] = arm.b2 * zw - arm.a2 * dfl;
        const margin = Fn + kStiff * dfl; // newtons still pressing the tip into the groove
        if (margin < 0) { if (!air) { air = 1; airMin = 0; } if (margin < airMin) airMin = margin; }
        else if (air) {
          air = 0;
          const flew = -airMin / Fn; // how far past lifting off it went
          const jump = flew > 1.5 ? 2 : flew > 0.25 ? 1 : 0;
          if (jump) { p = Math.min(lockEnd - 1, p + jump * rev); skipN += jump; }
          s[34] = 1;
          thump = Math.max(thump, 0.1 + 0.25 * Math.min(1, flew));
        }
      }

      // ---- 96 kHz -> 48 kHz ----
      let oL = 0, oR = 0;
      for (let j = 0; j < HB_LEN; j++) { const idx = (hbPos - 1 - j) & 63; const w = hb[j]; oL += w * hbL[idx]; oR += w * hbR[idx]; }

      let a, b;
      if (source) { a = oL; b = oR; }
      else {
        a = (oL + ct * oR) * invVel;
        b = (oR + ct * oL) * invVel;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const white = seed / 2147483648 - 1;
        if (thump > 1e-4) { // stylus landing: mostly vertical
          const t = thump * (0.05 + 0.1 * white);
          a += t; b -= t * 0.6;
          thump *= 0.9948;
        }
        s[10] += (white - s[10]) * 0.0039; s[11] += (s[10] - s[11]) * 0.0039;
        const rm = s[11] * rumbleAmp * Math.abs(wp);
        a += rm; b += rm;
        if (arm) {
          let y = arm.b0 * a + s[12]; s[12] = arm.b1 * a - arm.a1 * y + s[13]; s[13] = arm.b2 * a - arm.a2 * y; a = y;
          y = arm.b0 * b + s[14]; s[14] = arm.b1 * b - arm.a1 * y + s[15]; s[15] = arm.b2 * b - arm.a2 * y; b = y;
        }
        // ---- phono preamp: RIAA playback curve ----
        let y = R.g * (a - R.z2 * s[16]) + ra1 * s[17] - ra2 * s[18];
        s[16] = a; s[18] = s[17]; s[17] = y; a = y;
        y = R.g * (b - R.z2 * s[19]) + ra1 * s[20] - ra2 * s[21];
        s[19] = b; s[21] = s[20]; s[20] = y; b = y;
        if (subF) { // the subsonic filter: s[24..31]
          for (let k = 0; k < 2; k++) {
            const f = subF[k], o = 24 + 4 * k;
            let y2 = f.b0 * a + s[o]; s[o] = f.b1 * a - f.a1 * y2 + s[o + 1]; s[o + 1] = f.b2 * a - f.a2 * y2; a = y2;
            y2 = f.b0 * b + s[o + 2]; s[o + 2] = f.b1 * b - f.a1 * y2 + s[o + 3]; s[o + 3] = f.b2 * b - f.a2 * y2; b = y2;
          }
        }
        a *= P.preGain; b *= P.preGain;
        if (tube > 0) { // valve stage: even-order colour, soft ceiling
          let x = a + tube * (0.22 * a * a - 0.1 * a * a * a);
          x = Math.tanh(x * 0.8) * 1.25;
          s[22] += (x - s[22]) * 0.0007; a = x - s[22];
          x = b + tube * (0.22 * b * b - 0.1 * b * b * b);
          x = Math.tanh(x * 0.8) * 1.25;
          s[23] += (x - s[23]) * 0.0007; b = x - s[23];
        }
      }
      a *= P.volume; b *= P.volume;
      outL[i] = a; outR[i] = b;
      const aa = a < 0 ? -a : a, ab = b < 0 ? -b : b;
      if (aa > peakL) peakL = aa;
      if (ab > peakR) peakR = ab;
    }

    // ---- play wear: count this stretch of groove as played, if it was played properly ----
    if (plays && down && turn < plays.length && wr > 0.6 && wr < 1.5) {
      const moved = p - pStart;
      if (moved > 0 && moved < rev) {
        const f = moved / rev;
        plays[turn] += f; this.fresh[turn] += f; this.freshSamples += moved;
        if (turn < this.freshLo) this.freshLo = turn;
        if (turn > this.freshHi) this.freshHi = turn;
      }
    }

    this.wp = wp; this.wr = wr; this.discPos = discPos; this.p = p;
    this.air = air; this.airMin = airMin; this.skipN = skipN;
    this.uLp = uLp; this.uRp = uRp; this.ylat = ylat; this.thump = thump;
    this.hbPos = hbPos; this.seed = seed;
    this.peakL = peakL; this.peakR = peakR;
  }
}

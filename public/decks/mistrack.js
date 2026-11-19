// The stylus in the groove, by its forces: what the tracking-force and anti-skating dials do.
//
// Runs on the audio thread beside the engine (through decks/speed-mod.js), because engine.js
// is shared with another branch. A table turns it on by sending its dials in the ordinary engine
// params: trackingForce and antiSkate (grams) and antiSkateScale. Without a trackingForce (every
// other deck) nothing happens.
//
// Nothing here is a rule about when to distort or skip. Three bodies are stepped once per output
// sample, in the plane across the groove (x outward along the record's radius, z up), and the
// sound, the distortion, the skip and where the arm lands are what they do:
//
//   - The TIP (effective mass TIP_MASS) rests in the groove's V. The two walls stand at 90 degrees,
//     so each wall's normal is the other wall's slope: wall 1 (the inner wall, the left channel)
//     pushes along (+x, +z), wall 2 (the outer wall, the right channel) along (-x, +z). A wall
//     can push the tip and can never pull it. Each wall moves along its own normal with its
//     channel's recorded velocity.
//   - The CANTILEVER is a spring (COMPLIANCE) and a damper (DAMPING) between the tip and the
//     cartridge body, the same in every direction.
//   - The ARM, where it carries the cartridge, is a mass that can rise and fall (ARM_MASS_V) and
//     swing in and out (ARM_MASS_H). On it act: the tracking force, down; the cantilever; the
//     anti-skating spring, outward; and the bearings' friction. The groove's drag on the tip pulls
//     the arm inward (skating) in proportion to how hard the walls are really pressing, so a tip
//     in flight is not dragged.
//   - Under them the RECORD moves: the groove follows its spiral, and the surface rises and falls
//     with the pressing's warp (the engine's own figures for this side).
//
// A wall moving away faster than the cantilever can push the tip after it leaves the tip in
// flight on that channel: the splatter of a tip pressed too lightly. A tip that rides up one wall
// past its top is out on the land between two turns, where it scrapes, and whatever
// sideways force is left on the arm (anti-skating against skating, the cantilever's spring)
// carries it on to the next turn out or in, or across several.
//
// The cartridge is a Shure M91ED (owner, 2026-11-19). Shure published its trackability at 1 gram
// and not its compliance or tip mass, so the three numbers the tip needs are the ones that give
// that trackability in this model (a lateral tone is lost when the tip must be pushed sideways
// harder than the tracking force, |Z| v = F with Z the tip's mechanical impedance):
//     22 cm/s at 400 Hz, 33 cm/s at 1 kHz, 19 cm/s at 10 kHz   (M91ED data sheet, peak velocity)
//  -> COMPLIANCE 10.6 um/mN, DAMPING 0.0268 N s/m, TIP_MASS 0.73 mg.
// Its tracking force is 0.75 to 1.5 g.
//
// Estimates, with no source: the arm's two effective masses (from the Dual's yaw
// inertia, arm-forces.js); ARM_Q, the damping of the arm bouncing on the cantilever (the
// elastomer loses far more at 10 Hz than the 1 kHz damping above says); LAND_MU and LAND_ROUGH.
// The pressing's flaws (kinks in the groove) are further down, at FLAW_RATE.
// Left out: the record's eccentricity as a sideways push (it is far too slow to matter), record
// wear, footfalls.
import { FS, GROOVE_LSB, riaa } from '../dsp.js';
import { SPEC } from './dual1229/spec.js';
import { skatingMoment, antiSkateMoment, outwardSign, BEARING_FRICTION, YAW_INERTIA } from './dual1229/arm-forces.js';

export const GRAM = 9.80665e-3; // newtons per gram-force (pond)
export const TIP_MASS = 0.56e-6; // kg, from the M91ED's trackability (above)
export const COMPLIANCE = 0.0106; // m/N, the same
export const DAMPING = 0.0268; // N s/m, the same
export const TIP_R = 18e-6; // m, the tip's radius across the groove: the M91ED's 0.2 x 0.7 mil elliptical tip is 0.7 mil that way
export const HALF_WIDTH = 28e-6; // m, half the groove's width at the top (the cutter's unmodulated 56 um)
// A round tip seated in the V touches each wall R / sqrt2 from its own centre line. It has ridden
// to the top of a wall when it has moved WALL_OFF sideways, and is on the flat land LAND_H above
// where it sat (both follow from the two lengths above).
export const WALL_OFF = HALF_WIDTH - TIP_R * Math.SQRT1_2;
export const LAND_H = WALL_OFF + TIP_R * (1 - Math.SQRT1_2);
export const ARM_MASS_H = YAW_INERTIA / (SPEC.armL * SPEC.armL); // kg at the stylus, swinging
export const ARM_MASS_V = ARM_MASS_H; // E: rising and falling, taken the same
export const ARM_Q = 6; // E: how sharply the arm bounces on the cantilever (about 12 Hz here)
export const LAND_MU = 0.3; // E: the tip dragging across the land
export const LAND_ROUGH = 0.02; // E: how rough the land is: vertical velocity per unit of sliding speed
const OUT_HZ = 13000; // cartridge tip and coil roll-off on what is added (the engine's own is ~14-19 kHz)
const DRIFT_HZ = 2; // a wall's recorded velocity is summed to a position; this keeps the sum from wandering
const SLOW_HZ = 30; // below this the cantilever's extra (elastomer) damping acts (two poles: none of it may reach the music)
// The record's own flaws. A flaw here is a place where the groove is pushed sideways and comes
// back, over about a twentieth of a second: a pressing fault, the burr of a small scratch, grit
// packed against a wall. The arm is far too heavy to follow anything that quick, so the cantilever
// has to bend by the whole of it, and it can bend sideways only as far as the tracking force holds
// the tip down: force x compliance, 156 um at 1.5 g, 78 at Shure's least 0.75 g, 62 at 0.6 g. A
// kink wider than that pushes the tip up a wall and out. So the same pressing that plays through
// at 0.75 g begins to skip at about 0.6, and skips more the lighter the arm. The music's own swing
// adds to a kink's: measured, a quiet passage is lost from about 0.55 g and a loud one from 0.65 to 0.7.
// Flaws sit at fixed places in the groove (from this pressing's seed), so one that sends the arm
// back a turn is met again the next time round: a record that sticks. How many there are, and how
// wide, follows the engine's own measure of its crackle: Surface squared, plus dust. Surface 0 has none.
// Like the warp, a kink that the tip follows adds nothing to the sound here: only what the tip
// does differently from the groove is added.
// Estimates: FLAW_RATE, FLAW_WIDTH and FLAW_SECONDS. The width was set from the owner's ear for this
// cartridge (skipping from about 0.6 g down, 2026-11-19) on a pressing with Surface as it comes (30 %).
export const FLAW_RATE = 0.6; // E: flaws per second of groove at Surface 30 %
export const FLAW_WIDTH = 50e-6; // E: m, the widest at that Surface (they run evenly from nothing up to it)
export const FLAW_SECONDS = 0.05; // E: how long one takes to pass
const FLAW_GRIT = 0.09; // Surface 30 %, squared: the engine's crackle figure there
const FLAW_CELL = Math.round(FS / 10); // one flaw at most in each tenth of a second of groove
const WARM = Math.round(FS / 4); // samples of groove behind a landing that say where its walls stand
const LOAD_HZ = 30; // the drag that makes skating follows the walls' load no faster than this
const S = Math.SQRT1_2;

// The steady lateral acceleration (m/s^2) the tracking force can give the tip: the trackability
// limit where the tip's mass decides (the highest frequencies).
export const trackingLimit = (grams) => (Math.max(0, grams) * GRAM) / TIP_MASS;
// The loudest lateral tone (m/s, peak) the tip follows at a tracking force, by the impedance above.
export function trackability(grams, hz) {
  const w = 2 * Math.PI * hz, x = 1 / (w * COMPLIANCE) - w * TIP_MASS;
  return (Math.max(0, grams) * GRAM) / Math.hypot(x, DAMPING);
}

export function createMistrack() {
  const R = riaa(FS), ra1 = R.p1 + R.p3, ra2 = R.p1 * R.p3;
  // Two steps to each output sample, the walls' velocity drawn straight between samples: at one
  // step a 10 kHz tone is under five steps long, and the tip lost it a quarter too early.
  const SUB = 2, dt = 1 / (FS * SUB), k = 1 / COMPLIANCE;
  const lp = 1 - Math.exp((-2 * Math.PI * OUT_HZ) / FS);
  const drift = Math.exp(-2 * Math.PI * DRIFT_HZ * dt);
  const slow = 1 - Math.exp(-2 * Math.PI * SLOW_HZ * dt), loadK = 1 - Math.exp(-2 * Math.PI * LOAD_HZ * dt);
  const armDamp = Math.sqrt(k * ARM_MASS_V) / ARM_Q; // N s/m, on slow motion between tip and arm
  const xTop = WALL_OFF; // how far to either side the walls carry the tip
  const filt = () => ({ lo: 0, r0: 0, r1: 0, r2: 0 });
  // tip (x, z, vx, vz) and arm (X, Z, VX, VZ): x from the groove's centre line, z from the record's
  // surface at the groove's bottom; m1, m2: where the walls have moved to along their normals
  let st = null, fL = filt(), fR = filt();
  let pStart = 0, discStart = 0, active = false, seed = 12345;
  let flawCell = -1, flawAt = -1, flawD = 0, kick = 0;
  const FLAW_STEPS = Math.round(FLAW_SECONDS * FS) * 2; // steps of the model one flaw lasts (two to a sample)
  const errL = new Float32Array(4096), errR = new Float32Array(4096);
  // for tests and the curious: samples with a channel's wall out of touch, samples in all, turns
  // of the groove crossed, the widest a wall has stood off (m), samples spent on the land
  const stats = { flight: 0, samples: 0, skips: 0, maxGap: 0, land: 0, load: 0 };
  const reset = () => { st = null; fL = filt(); fR = filt(); };

  function readU(u, q, N) {
    const i = Math.floor(q);
    if (i < 0 || i + 1 >= N) return 0;
    const f = q - i;
    return u[i] + (u[i + 1] - u[i]) * f;
  }
  const radiusOf = (radii, rev, p) => {
    const t = p / rev, i = Math.floor(t);
    if (i < 0) return radii[0];
    if (i >= radii.length - 1) return radii[radii.length - 1];
    return radii[i] + (radii[i + 1] - radii[i]) * (t - i);
  };

  return {
    stats,
    before(engine) {
      const P = engine.P;
      const was = active;
      active = typeof P.trackingForce === 'number' && P.mode !== 'source' && engine.needleDown && !!engine.side;
      // a fresh landing (or a jump of the stylus by anything else) starts from rest in the groove
      if (!active || !was || Math.abs(engine.p - pStart) > 0.5) reset();
      pStart = engine.p; discStart = engine.discPos;
    },
    // after engine.process(n): add what the tip does differently from the groove to the engine's output
    after(engine, outL, outR, n) {
      if (!active || !engine.needleDown) { active = false; return; }
      const P = engine.P, side = engine.side, N = side.N, rev = side.rev, lockEnd = N - 24, radii = side.radii;
      let d = engine.p - pStart;
      if (d < -rev / 2) d += rev; // the locked groove wrapped round
      const adv = d / n; // groove samples per output sample
      if (n > errL.length || !(Math.abs(adv) < 4)) { reset(); pStart = engine.p; return; }
      const gainOut = (P.preGain === undefined ? 1 : P.preGain) * (P.volume === undefined ? 1 : P.volume) / side.velFS;
      // ---- the forces the dials put on the arm, at this radius ----
      const F = Math.max(0, P.trackingForce) * GRAM; // down on the arm
      const r = radiusOf(radii, rev, engine.p), L = SPEC.armL, scale = P.antiSkateScale === 'white' ? 'white' : 'red';
      const out = outwardSign(r);
      const skatePerN = (out * skatingMoment(r, 1, scale)) / L / GRAM; // N sideways per N of load on the walls (inward: negative)
      const anti = (out * antiSkateMoment(typeof P.antiSkate === 'number' ? P.antiSkate : 0, scale, r)) / L; // N, outward
      const stickH = BEARING_FRICTION.horizontal, stickV = BEARING_FRICTION.vertical;
      // ---- the record under the stylus: its warp, over this block ----
      const fl = engine.flaws, wA = fl && P.warp ? fl.warp * P.warp : 0, wn = fl ? fl.lobes : 1, wph = fl ? fl.phase : [0, 0, 0];
      const twoPiOverRev = (2 * Math.PI) / rev, dDisc = (engine.discPos - discStart) / n;
      const warpAt = (disc) => { const th = disc * twoPiOverRev; return wA * (Math.sin(wn * th + wph[0]) + 0.15 * Math.sin(3 * wn * th + wph[1]) + 0.04 * Math.sin(5 * wn * th + wph[2])); };

      // ---- how flawed this pressing is: the engine's own measure of its crackle (Surface, and dust) ----
      const grit = (P.surface || 0) * (P.surface || 0) + 0.75 * (engine.dust || 0);
      const flawRate = Math.min(5, FLAW_RATE * grit / FLAW_GRIT), flawMax = FLAW_WIDTH * Math.min(2, Math.sqrt(grit / FLAW_GRIT));
      const flawSeed = (engine.discSeed | 0) ^ 0x5f3759df;
      const uL = side.uL, uR = side.uR;
      let q0 = pStart; // the groove position this block's samples are read from; a skip moves it by whole turns
      if (!st) {
        // just landed: everything at rest, the tip on both walls, the cantilever bent by the
        // tracking force and by whatever sideways force is left over
        const side0 = anti + skatePerN * F, zs = warpAt(discStart);
        st = { x: 0, z: 0, vx: 0, vz: 0, X: side0 * COMPLIANCE, Z: -F * COMPLIANCE, VX: 0, VZ: 0, m1: 0, m2: 0, zs, load: F, sx: 0, sz: 0, sx0: 0, sz0: 0, pw1: 0, pw2: 0, fresh: true, onLand: false, cx: radiusOf(radii, rev, q0) };
      }
      let { x, z, vx, vz, X, Z, VX, VZ, m1, m2, zs, load, sx, sz, sx0, sz0, pw1, pw2, fresh, onLand, cx } = st;
      let lo1 = fL.lo, lo2 = fR.lo, turns = 0, landed = false;
      const im = 1 / TIP_MASS, dampK = 1 / (1 + dt * DAMPING * im);

      for (let i = 0; i < n; i++) {
        let q = q0 + adv * (i + 1);
        if (q >= lockEnd) q -= rev;
        // the walls: each moves along its own normal with its channel's velocity
        const w1c = readU(uL, q, N) * GROOVE_LSB * adv, w2c = -readU(uR, q, N) * GROOVE_LSB * adv; // m/s
        // the record's surface and the groove's centre line carry everything with them
        const zsNew = warpAt(discStart + dDisc * (i + 1)), vzs = (zsNew - zs) * FS; zs = zsNew;
        const cxNew = radiusOf(radii, rev, q), vcx = (cxNew - cx) * FS; cx = cxNew;
        if (fresh) {
          // Just landed. The walls are wherever the music has swung them, about a mean the arm has
          // settled over: sum the quarter second of groove behind the landing to find where, and
          // set the tip down on both walls, moving with them and with the record.
          fresh = false; VX = vcx; VZ = vzs; m1 = m2 = 0;
          const dts = 1 / FS, ds = Math.exp(-2 * Math.PI * DRIFT_HZ * dts);
          for (let j = WARM; j > 0; j--) { const qq = q - adv * j; if (qq < 0) continue; m1 = m1 * ds + readU(uL, qq, N) * GROOVE_LSB * adv * dts; m2 = m2 * ds - readU(uR, qq, N) * GROOVE_LSB * adv * dts; }
          pw1 = readU(uL, q - adv, N) * GROOVE_LSB * adv; pw2 = -readU(uR, q - adv, N) * GROOVE_LSB * adv;
          x = (m1 - m2) * S; z = (m1 + m2) * S; vx = (pw1 - pw2) * S; vz = (pw1 + pw2) * S;
          // (the arm stays over the walls' mean, where the dials' forces alone bend the cantilever)
        }
        // ---- this pressing's flaws: is there one here? ----
        if (flawRate > 0) {
          const cell = Math.floor(q / FLAW_CELL);
          if (cell !== flawCell) {
            flawCell = cell; flawAt = -1;
            let hsh = Math.imul(cell ^ flawSeed, 0x9e3779b1); hsh ^= hsh >>> 15; hsh = Math.imul(hsh, 0x85ebca6b); hsh ^= hsh >>> 13; hsh = Math.imul(hsh, 0xc2b2ae35); hsh ^= hsh >>> 16;
            if ((hsh >>> 0) / 4294967296 < flawRate * FLAW_CELL / FS) { // one in this stretch of groove
              const h2 = Math.imul(hsh ^ 0x68bc21eb, 0x2c1b3c6d) >>> 0, h3 = Math.imul(h2 ^ 0x1b873593, 0x297a2d39) >>> 0;
              flawAt = cell * FLAW_CELL + (h2 % (FLAW_CELL >> 1)); flawD = flawMax * (h3 / 4294967296) * (h2 & 0x10000 ? 1 : -1); // outward or inward
            }
          }
          if (flawAt >= 0 && q >= flawAt && !onLand && kick <= 0) { flawAt = -1; kick = FLAW_STEPS; }
        }
        let e1s = 0, e2s = 0;
        for (let step = 1; step <= SUB; step++) {
        let w1 = pw1 + (w1c - pw1) * step / SUB, w2 = pw2 + (w2c - pw2) * step / SUB;
        if (kick > 0) { const kv = flawD * (Math.PI / FLAW_SECONDS) * Math.sin((2 * Math.PI * (FLAW_STEPS - kick)) / FLAW_STEPS) * S; kick--; w1 += kv; w2 -= kv; } // the groove swings aside by flawD and back
        m1 = m1 * drift + w1 * dt; m2 = m2 * drift + w2 * dt;

        // ---- the cantilever, between tip and arm (positions here are from the groove's own frame,
        // so the frame's motion is taken out of the arm's) ----
        X -= vcx * dt; Z -= vzs * dt; // the groove moved under the arm
        const dx = x - X, dz = z - Z, rvx = vx - (VX - vcx), rvz = vz - (VZ - vzs);
        sx0 += (rvx - sx0) * slow; sx += (sx0 - sx) * slow; sz0 += (rvz - sz0) * slow; sz += (sz0 - sz) * slow; // the slow part of their relative motion
        const fx = -k * dx - armDamp * sx, fz = -k * dz - armDamp * sz; // on the tip, less the fast damper (taken implicitly below)

        // ---- the tip: free flight first, then whatever it has run into ----
        const avx = VX - vcx, avz = VZ - vzs; // the arm's velocity as the groove sees it
        vx = (vx + dt * im * (fx + DAMPING * avx)) * dampK;
        vz = (vz + dt * im * (fz + DAMPING * avz)) * dampK;
        x += vx * dt; z += vz * dt;
        let n1 = 0, n2 = 0, nl = 0, e1 = 0, e2 = 0;
        // along the two normals: a = (x + z) / sqrt2 against wall 1, b = (-x + z) / sqrt2 against wall 2
        let a = (x + z) * S, b = (-x + z) * S, va = (vx + vz) * S, vb = (-vx + vz) * S;
        // the groove is where its walls are: a loud passage swings them (and the tip) far to either
        // side of the centre line, and that is not leaving the groove
        const off = ((a - m1) - (b - m2)) * S; // sideways from the middle of the V as it stands now
        const inGroove = off >= -xTop && off <= xTop;
        if (inGroove) {
          // what a wall must push with to carry the tip along: the impulse, through the damper's share
          if (a <= m1) { n1 = Math.max(0, w1 - va) * TIP_MASS / (dt * dampK); a = m1; va = Math.max(va, w1); } else { e1 = va - w1; stats.flight++; if (a - m1 > stats.maxGap) stats.maxGap = a - m1; }
          if (b <= m2) { n2 = Math.max(0, w2 - vb) * TIP_MASS / (dt * dampK); b = m2; vb = Math.max(vb, w2); } else { e2 = vb - w2; stats.flight++; if (b - m2 > stats.maxGap) stats.maxGap = b - m2; }
          x = (a - b) * S; z = (a + b) * S; vx = (va - vb) * S; vz = (va + vb) * S;
          if (onLand) { onLand = false; landed = true; }
        } else {
          // Over the top of a wall. The tip is round: it rolls over the wall's top corner (an arc of
          // its own radius) and only then is on the flat land, which can be narrower than the tip.
          // On the arc the tracking force is still pushing it back down into the groove.
          onLand = true; stats.land++;
          const sgn = off > 0 ? 1 : -1, dOff = Math.abs(off), zc = (m1 + m2) * S;
          let h = LAND_H, hp = 0;
          if (dOff < HALF_WIDTH) { const u = HALF_WIDTH - dOff, c = Math.sqrt(TIP_R * TIP_R - u * u); h = LAND_H - TIP_R + c; hp = u / c; }
          if (z - zc <= h) {
            z = zc + h;
            const inv = 1 / Math.sqrt(1 + hp * hp), nx = -sgn * hp * inv, nz = inv; // the surface's normal there
            const vn = vx * nx + vz * nz;
            if (vn < 0) {
              vx -= vn * nx; vz -= vn * nz; nl = (-vn * TIP_MASS / (dt * dampK)) * nz;
              // it drags along the surface, and the land is not smooth
              const tx = nz, tz = -nx, vt = vx * tx + vz * tz, drag = Math.min(Math.abs(vt), (LAND_MU * (-vn)) / dampK);
              vx -= Math.sign(vt) * drag * tx; vz -= Math.sign(vt) * drag * tz;
              if (hp === 0) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; vz += Math.abs(vx - avx) * LAND_ROUGH * (seed / 4294967296); }
            }
          }
          // out here the cartridge hears the tip itself, not a groove
          e1 = (vx + vz) * S - w1; e2 = (-vx + vz) * S - w2;
          // half way to the next turn: that turn's groove is now the one under the tip
          const outPitch = radiusOf(radii, rev, q - rev) - cx, inPitch = cx - radiusOf(radii, rev, q + rev);
          const canOut = outPitch > 0 && q0 - rev >= 16, canIn = inPitch > 0 && q0 + rev + adv * n < lockEnd;
          if (off > 0 && canOut && off > outPitch / 2) { q0 -= rev; x -= outPitch - (m1 - m2) * S; X -= outPitch; cx += outPitch; m1 = m2 = 0; turns--; }
          else if (off < 0 && canIn && -off > inPitch / 2) { q0 += rev; x += inPitch + (m1 - m2) * S; X += inPitch; cx -= inPitch; m1 = m2 = 0; turns++; }
          else if ((off > 0 && !canOut) || (off < 0 && !canIn)) {
            // nothing further that way (the record's edge, the locked groove): the arm stops there
            const lim = HALF_WIDTH * 2; if (dOff > lim) { x -= sgn * (dOff - lim); if (vx * sgn > 0) vx = 0; if ((VX - vcx) * sgn > 0) VX = vcx; }
          }
        }
        stats.samples++;

        // ---- the arm: the dials, the cantilever, the drag of the groove, its bearings ----
        load += ((n1 + n2) * S + nl - load) * loadK; // newtons the record is carrying, smoothed
        const cfx = k * (x - X) + armDamp * sx + DAMPING * (vx - (VX - vcx)), cfz = k * (z - Z) + armDamp * sz + DAMPING * (vz - (VZ - vzs)); // the cantilever on the arm
        let ax = cfx + anti + skatePerN * load, az = cfz - F;
        // friction holds an arm that is still, and works against one that moves
        // (the bearings are on the chassis: it is the arm's own motion they resist, not its motion over the record)
        if (Math.abs(VX) < 2e-7 && Math.abs(ax) <= stickH) { ax = 0; VX = 0; } else ax -= Math.sign(VX || ax) * stickH;
        if (Math.abs(VZ) < 2e-7 && Math.abs(az) <= stickV) { az = 0; VZ = 0; } else az -= Math.sign(VZ || az) * stickV;
        VX += (ax / ARM_MASS_H) * dt; VZ += (az / ARM_MASS_V) * dt;
        X += VX * dt; Z += VZ * dt;
        e1s += e1; e2s += e2;
        }
        pw1 = w1c; pw2 = w2c;
        const e1 = e1s / SUB, e2 = e2s / SUB;

        // ---- what is added to the engine's output: roll-off, scale, RIAA (as the engine's chain) ----
        lo1 += (e1 - lo1) * lp; lo2 += (-e2 - lo2) * lp;
        let a0 = lo1 * gainOut, y = R.g * (a0 - R.z2 * fL.r0) + ra1 * fL.r1 - ra2 * fL.r2; fL.r0 = a0; fL.r2 = fL.r1; fL.r1 = y; errL[i] = y;
        a0 = lo2 * gainOut; y = R.g * (a0 - R.z2 * fR.r0) + ra1 * fR.r1 - ra2 * fR.r2; fR.r0 = a0; fR.r2 = fR.r1; fR.r1 = y; errR[i] = y;
      }
      fL.lo = lo1; fR.lo = lo2;
      if (!(Number.isFinite(x) && Number.isFinite(X) && Number.isFinite(z) && Number.isFinite(Z))) { reset(); pStart = engine.p; return; } // never let a bad number into the output
      st = { x, z, vx, vz, X, Z, VX, VZ, m1, m2, zs, load, sx, sz, sx0, sz0, pw1, pw2, fresh, onLand, cx };
      stats.load = load;
      for (let i = 0; i < n; i++) { outL[i] += errL[i]; if (outR !== outL) outR[i] += errR[i]; }
      if (turns) {
        let p = engine.p + turns * rev;
        if (p >= lockEnd) p = lockEnd - 1; if (p < 16) p = 16;
        const skipped = Math.abs(turns);
        engine.p = p; engine.skipN += skipped; stats.skips += skipped;
      }
      if (landed) engine.thump = Math.max(engine.thump, 0.2); // back down in a groove
      pStart = engine.p;
    },
    reset,
    get state() { return st; },
  };
}

// Small extension to the audio thread, kept out of engine.js on purpose: periodic speed
// components (wow and flutter at the rates real parts turn at) and an output short (a
// turntable's muting switch). A table asks for them through ordinary engine params, which
// the engine itself ignores:
//   wow: [{ amp, perTurn } | { amp, hz }]  speed variation as a fraction, either so many times
//        per platter turn (the platter itself, an idler wheel) or at a fixed rate (the motor)
//   rateBase: the steady platter speed the components ride on (targetRate is rewritten from it)
//   mute: true shorts the output
//   trackingForce: the arm's tracking force in grams; a tip pressed too lightly mistracks
//        (decks/mistrack.js)
// Plain JavaScript, so Node can run it against the engine the same way the worklet does.
import { FS } from '../dsp.js';
import { createMistrack } from './mistrack.js';

export function createSpeedMod() {
  let ph = [], gain = 1;
  const mistrack = createMistrack();
  return {
    mistrack,
    // before engine.process(n): the motor is asked for the speed of this moment
    before(engine, n) {
      mistrack.before(engine, n);
      const P = engine.P, wow = P.wow;
      if (!wow || !wow.length || P.rateBase === undefined) return;
      const turns = (Math.abs(engine.wp) * FS) / engine.rev; // platter turns per second
      let m = 0;
      for (let k = 0; k < wow.length; k++) {
        const c = wow[k], f = c.hz !== undefined ? c.hz : c.perTurn * turns;
        ph[k] = ((ph[k] || k * 1.7) + (2 * Math.PI * f * n) / FS) % (2 * Math.PI);
        m += c.amp * Math.sin(ph[k]);
      }
      P.targetRate = P.power ? P.rateBase * (1 + m) : 0;
    },
    // after engine.process(n): the muting switch, with a 2 ms edge so it does not click
    after(engine, outL, outR, n) {
      mistrack.after(engine, outL, outR, n); // before the muting switch, which shorts it too
      const want = engine.P.mute ? 0 : 1;
      if (want === 1 && gain === 1) return;
      const k = 1 / (0.002 * FS);
      for (let i = 0; i < n; i++) {
        gain += want > gain ? Math.min(k, want - gain) : -Math.min(k, gain - want);
        outL[i] *= gain; if (outR !== outL) outR[i] *= gain;
      }
    },
    reset() { ph = []; mistrack.reset(); },
  };
}

// How the Dual 1229 asks the audio engine to turn its platter: what the idler drive does,
// written as the engine's ordinary deck params (plus the wow parts and the muting switch that
// decks/speed-mod.js adds on the audio thread). Plain JavaScript, so Node can test it.
import { SPEC } from './spec.js';

const MOTOR_TAU = 0.03; // seconds: an idler is a stiff coupling once the platter is up to speed (E)
// Rumble: the engine's rumble is a fixed level after the groove has been scaled to the cut, so
// to hold it at Dual's -42 dB below the reference signal it is scaled with the cut's full-scale
// velocity. Calibrated by test/dual1229.test.mjs against a 315 Hz tone at 10 cm/s peak.
export const RUMBLE_AT_REF = 6.1; // engine rumble units for a side cut at 0.1 m/s full scale
export const rumbleFor = (velFS = 0.1) => (RUMBLE_AT_REF * 0.1) / Math.max(0.02, velFS);

// m: the Dual1229 mechanism. ctx: { cutRpm, velFS, slow (1 = real time, 0.1 = a tenth) }
export function driveParams(m, ctx = {}) {
  const cutRpm = ctx.cutRpm || 100 / 3, k = ctx.slow || 1;
  const on = m.power && m.engaged; // electrical129 closure and physical idler contact
  const rate = on ? (m.targetRpm / cutRpm) * k : 0;
  const tau = MOTOR_TAU / k;
  // the motor loop smooths what it is asked for; ask for a little more so the platter gets the stated wow
  const comp = (hz) => Math.sqrt(1 + Math.pow(2 * Math.PI * hz * tau, 2));
  const turns = (m.targetRpm / 60) * k, solved=m.drivePose, idlerPerTurn=solved.rimRadius/solved.idlerRadius;
  const motorHz = (m.motorRpm / 60) * k;
  return {
    power: on, targetRate: rate, rateBase: rate,
    motorTau: tau,
    // torque-limited: the idler slips the heavy platter up to speed, or drags a fast one down; free,
    // it coasts on its bearing. (In slow motion the drive's own start-up is not slowed, so that
    // going into slow motion and back takes a moment rather than a minute.)
    motorAcc: SPEC.startAccRpm / cutRpm,
    motorDec: (on ? SPEC.driveDecRpm : SPEC.coastDecRpm * k) / cutRpm,
    slipTau: 0.05, grip: 3, // a ribbed rubber mat: a hand on the record holds the platter, and the platter stalls
    flutter: SPEC.wow.random,
    wow: on ? [
      { perTurn: 1, amp: SPEC.wow.platter * comp(turns) }, // platter once round: 0.56 Hz at 33 1/3
      { perTurn: idlerPerTurn, amp: SPEC.wow.idler * comp(turns * idlerPerTurn) }, // idler wheel: 2.4 Hz at 33 1/3
      { hz: motorHz, amp: SPEC.wow.motor * comp(motorHz) }, // motor: 30 Hz
    ] : [],
    rumble: rumbleFor(ctx.velFS),
    armL: SPEC.armL, null1: SPEC.null1, null2: SPEC.null2,
    mute: m.mute || k < 1, // the muting switch; slow motion is for looking, not listening
    // The stylus force solver follows the warp as well as the groove walls. Only it decides
    // whether the Dual loses contact or jumps a turn.
    legacyWarpSkip: false,
    trackingForce: m.trackingForce, antiSkate: m.antiSkate, antiSkateScale: m.skateScale,
  };
}

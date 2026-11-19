// The Dual 1229 in the page: its mechanism, coupled to the audio engine through core.js, and
// the owner's settings (speed, size, mode, dials) remembered between visits.
//
// createDualController({ state, send, pushParams, audio, hint }) -> controller
//   tick(now)            advance the mechanism (the deck view calls it every frame; a timer
//                        keeps it going while the page is hidden; each tick covers the real time
//                        since the last, so the cam keeps time with the audio platter)
//   start(), stop(), setSpeed('33'|'45'|'78'), setPitch(-0.03..0.03), setSize(7|10|12),
//   setMode('single'|'multi'), setCue(up), setForce(g), setSkate(g), setSkateScale('red'|'white'),
//   setSlow(1 | 0.1), hand(r) / release() (a hand on the headshell), lowerAt(r) (cue a track),
//   autoPlay() (a record has landed: set the size selector to it and press Start),
//   park() (arm back on its rest before a record is taken off)
//   armPose() -> { r, h }: where the mechanism holds the stylus, for drawing
import { Dual1229 } from './mechanism.js';
import { createCore } from './core.js';
import { REST } from './spec.js';

const STORE = 'gd.dual1229';

export function createDualController({ state, send, pushParams, audio, hint, onChange = () => {} }) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { saved = {}; }
  const mech = new Dual1229({ speed: saved.speed, size: saved.size, mode: saved.mode });
  if (saved.pitch !== undefined) mech.setPitch(saved.pitch);
  if (saved.force !== undefined) mech.setTrackingForce(saved.force);
  if (saved.skate !== undefined) mech.setAntiSkate(saved.skate);
  if (saved.scale) mech.setSkateScale(saved.scale);
  let slow = 1, last = 0, disposed = false;
  const remember = () => { try { localStorage.setItem(STORE, JSON.stringify({ speed: mech.speed, size: mech.size, mode: mech.mode, pitch: mech.pitch, force: mech.trackingForce, skate: mech.antiSkate, scale: mech.skateScale })); } catch { /* not remembered */ } };

  const port = {
    status: () => state.st,
    drop: (radius, byHand) => send({ type: 'drop', radius, byHand }),
    lift: () => send({ type: 'lift' }),
    arm: (radius) => send({ type: 'arm', radius }),
    rest: () => send({ type: 'rest' }),
    params: () => pushParams(),
  };
  const core = createCore({ mech, port, side: () => state.side, slow: () => slow });

  let wasPower = false, wasCam = false;
  function tick(now = performance.now()) {
    if (disposed) return;
    // the real time since the last tick, however long: core.js steps the mechanism through it
    // (a hidden page or a slow frame must not slow the cam against the audio platter)
    const dt = last ? Math.max(0, (now - last) / 1000) : 0;
    last = now;
    if (dt <= 0) return;
    mech.platterRecord = state.side ? state.side.fmt.disc : false; // the shelf record's radius (or none): what the stylus and the changer's records meet
    core.tick(dt);
    state.power = mech.power;
    if (mech.power !== wasPower || mech.camOn !== wasCam) { wasPower = mech.power; wasCam = mech.camOn; onChange(); }
  }
  // the deck view ticks it every frame; a hidden page gets no frames, so a timer stands in
  const timer = setInterval(() => { if (performance.now() - last > 200) tick(performance.now()); }, 250);

  const act = (fn) => async (...a) => { await audio(); const r = fn(...a); remember(); onChange(); return r; };
  function setSideControls(side, useNominalSpeed = false) {
    // A changer stack has its own size setting and carries silent records.
    // The loaded audio side supplies its diameter when it is exposed.
    if (mech.changer.pile.length || (mech.mode === 'multi' && mech.stack)) return;
    const diameter = 2 * side.fmt.disc;
    mech.setSize(diameter < 0.2 ? 7 : diameter < 0.27 ? 10 : 12);
    if (useNominalSpeed) mech.setSpeed(Math.abs(side.rpm - 45) < 1 ? '45' : '33');
  }

  async function startPlaying(fromShelf) {
    const side = state.side;
    if (fromShelf && !side) return false;
    await audio();
    if (side !== state.side) return false;
    if (mech.locked) {
      hint('The switch is locked while the change cycle runs.', 1500);
      return false;
    }
    if (side) {
      setSideControls(side, fromShelf);
      mech.setCue(false);
    }
    const started = mech.start();
    remember();
    onChange();
    return started;
  }
  const ctl = {
    mech, core,
    get slow() { return slow; },
    tick,
    start: () => startPlaying(false),
    stop: act(() => { if (!mech.stop()) { if (mech.locked) hint('The switch is locked while the change cycle runs.', 1500); return false; } return true; }),
    setSpeed: act((k) => mech.setSpeed(k)),
    setPitch: act((p) => mech.setPitch(p)),
    setSize: act((n) => mech.setSize(n)),
    setMode: act((m) => mech.setMode(m)),
    setCue: act((up) => mech.setCue(up)),
    // the changer: put a record on the AW 3 spindle's stack or take the top one off, and lift the
    // records it dropped off the platter (by hand: the arm on its rest, the cam at neutral)
    loadSpindle: act((size) => { if (!mech.loadSpindle(size)) { hint('Wait for the change cycle to finish.', 1500); return false; } return true; }),
    unloadSpindle: act(() => mech.unloadSpindle()),
    clearPile: act(() => { if (!mech.clearPile()) { if (mech.changer.pile.length) hint('Put the arm on its rest and let the cycle finish first.', 1500); return false; } return true; }),
    setForce: act((g) => mech.setTrackingForce(g)),
    setSkate: act((g) => mech.setAntiSkate(g)),
    setSkateScale: act((s) => mech.setSkateScale(s)),
    setSlow(k) { slow = k; core.resync(); onChange(); },
    hand(r) { if (mech.hand) mech.hand.r = r; else mech.grab(r); },
    release() { return mech.release(); },
    // Lower the needle at a radius, as a person with the cue would: lift, move, lower. The
    // arm swung in by hand switches the motor on through the pawl.
    async lowerAt(r, side = state.side) {
      await audio();
      if (!side || side !== state.side || mech.locked) return false;
      setSideControls(side);
      mech.setCue(true);
      const from = mech.r, t0 = performance.now();
      mech.grab(from);
      const hand = mech.hand;
      await new Promise((resolve) => {
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / 450);
          if (mech.hand !== hand || mech.locked || side !== state.side) return resolve();
          mech.hand.r = from + (r - from) * k * k * (3 - 2 * k);
          if (k < 1) requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
      });
      if (mech.hand !== hand) return false;
      mech.release();
      if (mech.locked || side !== state.side) return false;
      mech.setCue(false);
      remember();
      onChange();
      return true;
    },
    // A shelf request expires if the side is removed while audio is starting.
    autoPlay: () => startPlaying(true),
    // Before a record is taken off: put the arm back on its rest by hand (which, through the
    // pawl, switches the motor off), unless the change cycle has it.
    park() {
      if (mech.camOn) return false;
      mech.setCue(false);
      if (!mech.atRest || mech.hand) { mech.grab(REST); mech.release(); }
      return true;
    },
    armPose() { return { r: mech.r, h: mech.h, hand: !!mech.hand, onSurface: mech.onSurface }; },
    dispose() { disposed = true; clearInterval(timer); },
    get atRest() { return mech.r >= REST - 0.0005; },
  };
  return ctl;
}

// The Dual 1229's mechanism coupled to the audio engine's platter, stylus and groove.
// The same code runs in the page (where the engine is on the audio thread, reached by
// messages) and in Node's tests (where it is called directly): all it needs is a port.
//
// port: status() -> { wp, rev, down, radius }   the engine's platter speed (relative to the cut),
//                                                 samples per turn, needle down, stylus radius
//       drop(radius, byHand), lift(), arm(radius), rest(), params(driveParams)
// side() -> the cut side on the platter or null; slow() -> 1 for real time, 0.1 for a tenth.
import { FS } from '../../dsp.js';
import { driveParams } from './drive.js';

// tick(dt) takes the real time since the last tick, however long: a hidden tab or a slow frame
// gets a few long ticks rather than many short ones. The mechanism is stepped through it in
// steps of at most STEP, with the groove radius drawn in a straight line from the last report
// to this one, so the dog passes as often as the platter really turned and the shut-off lever
// sees the groove's advance spread over those turns. Past MAX_CATCHUP (the machine slept, a
// debugger paused it) only the last MAX_CATCHUP seconds are played through, and what the
// groove did before them is not counted toward a trip.
export const STEP = 0.05, MAX_CATCHUP = 2;
// Records the changer drops have no sound: the audio engine holds only the record from the shelf.
// So that a stack can be watched cycling, each is a silent stand-in with a fast spiral groove
// (2 mm a turn, a real record's is about 0.1 mm) into a locked run-out groove. NOT a real program.
export const BLANK = { pitch: 0.002, lockR: 0.056 };

export function createCore({ mech, port, side, slow = () => 1 }) {
  let sentR = null, sentRest = true, sig = '', drive = null, lastTrip = null, lastR = null, blank = null;
  const log = []; // the last few things that happened, for the readout

  function land(ev) {
    if (ev.pile) { blank = { r: ev.r }; note('The stylus came down on a record the changer dropped. It is silent: the audio engine plays only the record from the shelf.'); return; }
    const s = side();
    // a record under the stylus: the lead-in catches it if it lands on the smooth rim
    if (s && ev.r <= s.fmt.disc - 0.0006) {
      const r = Math.min(ev.r, s.radii[0]);
      port.drop(r, !!ev.byHand);
      note(ev.byHand ? 'The needle is set down by hand.' : `The needle settles at ${(r * 1000).toFixed(1)} mm.`);
    } else note(s ? 'The stylus came down off the record, on the mat.' : 'The stylus came down on the bare mat.');
  }
  function events(st) {
    for (const ev of mech.events.splice(0)) {
      if (ev.type === 'land') land(ev);
      else if (ev.type === 'raise') { blank = null; if (st.down) port.lift(); }
      else if (ev.type === 'drop') note(ev.left ? `The changer dropped a record (${ev.left} left on the spindle).` : 'The changer dropped its last record.');
      else if (ev.type === 'trip') { lastTrip = ev; note(`Run-out: the arm moved ${(ev.advance * 1000).toFixed(1)} mm in one turn, and the shut-off lever caught the dog.`); }
      else if (ev.type === 'cycle') note(ev.end ? `The main cam is back at neutral (${ev.seconds.toFixed(1)} s).` : { start: 'Start: the main cam meshes at the next pass of the dog.', stop: 'Stop: the main cam is turning.', trip: 'The main cam is turning.' }[ev.kind] || '');
      else if (ev.type === 'manual') note('Manual start: the arm swung in by hand switched the motor on.');
    }
  }
  function note(text) { log.unshift({ text, at: Date.now() }); log.length = Math.min(log.length, 6); }

  function tick(dt) {
    if (!(dt > 0)) return;
    const st = port.status(), k = slow();
    const rate = st.rev ? (st.wp * FS) / st.rev : 0; // platter turns per second
    const nowR = st.down ? st.radius : null;
    if (dt > MAX_CATCHUP) { dt = MAX_CATCHUP; mech.resync(mech.onSurface ? nowR : null); lastR = nowR; }
    const fromR = lastR !== null && nowR !== null ? lastR : nowR;
    const n = Math.ceil(dt / STEP - 1e-9);
    for (let i = 1; i <= n; i++) {
      const groove = nowR === null ? null : fromR + ((nowR - fromR) * i) / n;
      if (blank && mech.onSurface && !mech.hand) blank.r = Math.max(BLANK.lockR, blank.r - BLANK.pitch * rate * dt / n);
      const g = blank && mech.onSurface ? blank.r : st.down && mech.onSurface ? groove : null;
      mech.advance(dt / n, { platterRate: rate, grooveR: g, timeScale: k });
      events(st);
    }
    lastR = nowR;
    // while the needle is up, the engine is told where the arm is (the hand's or the cam's doing)
    if (!mech.onSurface) {
      if (mech.atRest && !mech.hand) { if (!sentRest || st.down) { port.rest(); sentRest = true; sentR = null; } }
      else if (sentR === null || Math.abs(mech.r - sentR) > 0.0002 || st.down) { port.arm(mech.r); sentR = mech.r; sentRest = false; }
    } else { sentR = null; sentRest = false; }
    // the drive: only sent when something about it has changed
    const s = side();
    const ctx = { cutRpm: s ? s.rpm : st.rev ? (FS * 60) / st.rev : 100 / 3, velFS: s ? s.velFS : 0.1, slow: k };
    const key = [mech.power, mech.engaged, mech.targetRpm, ctx.cutRpm, ctx.velFS, k, mech.mute, mech.trackingForce, mech.antiSkate, mech.skateScale].join('|');
    if (key !== sig) { sig = key; drive = driveParams(mech, ctx); port.params(drive); }
  }
  return { tick, get drive() { return drive; }, get log() { return log; }, get lastTrip() { return lastTrip; }, resync() { sig = ''; sentR = null; sentRest = false; lastR = null; } };
}

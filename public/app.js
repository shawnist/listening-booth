// Groove Deck: the screen. The deck fills the window; a search bar above it, the shelf
// below it, a card for what is on the platter, and a Workbench drawer for everything technical.
// This file owns the audio engine's wiring, the platter, the deck controls and the layout.
// search.js, shelf.js (the records), shelf-view.js (the sleeves) and platter-card.js do the rest.
import { cutSide, capacitySeconds } from './cutter.js';
import { FS, seedOf, discFlaws } from './dsp.js';
import { DECKS, CARTS } from './rig.js';
import { createDeckView } from './deck-view.js';
import { createShelf } from './shelf.js';
import { createShelfView } from './shelf-view.js';
import { createPlatterCard } from './platter-card.js';
import { createSearch } from './search.js';
import { createScenePanel } from './scene-panel.js';
import { artSrc } from './library.js';
import { TABLES, storedTable, storeTable } from './decks/registry.js';
import { createTableSwitch } from './decks/table-ui.js';

const $ = (s) => document.querySelector(s);
const TAU = Math.PI * 2;
const REST = 0.168;
// The platter card stands beside the deck when the window leaves the deck this much room;
// in a narrower window it folds to a strip above the deck. The same goes for the Workbench.
const CARD_ROOM = 348, DECK_ROOM_BESIDE_CARD = 760, DECK_ROOM_BESIDE_BENCH = 480, STRIP_ROOM = 54;
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
const launchLeverView = new URLSearchParams(location.search).get('part') === 'mainLever';
// A page that hosts the deck without the Groove Deck server (the LUNA Add On, addons/luna)
// marks <html data-host>: no shelf server, no YouTube, the Dual 1229 only, and its own source
// of audio through state.press(). The web app has no data-host and is unchanged.
const HOST = document.documentElement.dataset.host || '';

// ---- shared state ---------------------------------------------------------------------
const state = {
  ctx: null, node: null, ready: null,
  queue: [], side: null, recImg: null, cutting: false,
  platter: null, // { record, sideIndex } when the side on the platter is a record from the shelf
  lent: [], // whose audio the audio thread is borrowing while that side is on the platter
  st: { p: 0, discPos: 0, rev: 86400, wr: 0, wp: 0, radius: REST, down: false, peakL: 0, peakR: 0 }, stAt: 0,
  power: false, rpm: 100 / 3, pitch: 0, mode: 'groove',
  deck: 'dd', cart: 'mm-con', pre: 'ss', cap: 250, surface: 0.3, ecc: 0.15, warp: 1, volume: 0.8,
  table: launchLeverView || HOST ? 'dual1229' : storedTable(), // which turntable (decks/registry.js)
  tableCtl: null, // its mechanism, for a table that has one (the Dual 1229)
  armDrag: false, armRadius: REST, touching: false, lastAngle: 0,
  reveal: 1, platAngle: 0, lastFrame: 0, mL: 0, mR: 0, groove: null,
  hintHold: 0,
  bench: false, // the Workbench drawer is open
  platterOpen: window.innerWidth - CARD_ROOM >= DECK_ROOM_BESIDE_CARD, // the platter card is unfolded
};
window.GD = state; // for poking at it from the console and from tests

// Whoever draws part of the screen asks to be told when what it shows has changed.
const watchers = [];
const changed = (what = '') => { for (const f of watchers) f(what); };

// ---- audio ----------------------------------------------------------------------
function audio() {
  if (!state.ready) {
    state.ready = (async () => {
      const ctx = new AudioContext({ sampleRate: FS, latencyHint: 'interactive' });
      await ctx.audioWorklet.addModule('deck-worklet.js');
      const node = new AudioWorkletNode(ctx, 'deck', { numberOfInputs: 0, outputChannelCount: [2] });
      node.connect(ctx.destination);
      node.port.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === 'unloaded') return gotBack(m.pcm);
        if (m.type === 'tick') return shelf.ticked(m);
        if (m.type === 'wear') return shelf.played(m);
        if (m.type !== 'status') return;
        state.st = m; state.stAt = performance.now();
        state.mL = Math.max(m.peakL, state.mL * 0.8); state.mR = Math.max(m.peakR, state.mR * 0.8);
        if (m.gl) state.groove = { l: m.gl, r: m.gr }; else if (!m.down) state.groove = null;
        if (!state.armDrag) state.armRadius = m.radius;
        if (m.down && !$('#hint').hidden && performance.now() > state.hintHold) hint('');
      };
      state.ctx = ctx; state.node = node;
      pushParams();
      if (ctx.sampleRate !== FS) say(`This browser opened audio at ${ctx.sampleRate} Hz, not 48000; pitch will be off.`, true);
    })();
  }
  if (state.ctx && state.ctx.state === 'suspended') state.ctx.resume();
  return state.ready;
}
const send = (msg, transfer) => state.node && state.node.port.postMessage(msg, transfer || []);

function params() {
  const d = DECKS[state.deck], c = CARTS[state.cart];
  const C = state.cap * 1e-12;
  const cutRpm = state.side ? state.side.rpm : 100 / 3;
  return {
    power: state.power,
    targetRate: (state.rpm / cutRpm) * (1 + state.pitch / 100),
    motorTau: d.motorTau, motorAcc: d.motorAcc, motorDec: d.motorDec, slipTau: d.slipTau, grip: d.grip,
    flutter: d.flutter, rumble: d.rumble, armL: d.armL, null1: d.null1, null2: d.null2,
    tipRadius: c.tipRadius, tipF: c.tipF, tipQ: c.tipQ, crosstalk: c.crosstalk, scanLen: c.scanLen,
    // coil inductance against cable capacitance, damped by the usual 47 kOhm input
    elecF: c.L > 0 ? 1 / (TAU * Math.sqrt(c.L * C)) : 0,
    elecQ: c.L > 0 ? Math.min(3, 47000 * Math.sqrt(C / c.L)) : 1,
    eccentricity: state.ecc / 1000, surface: state.surface, warp: state.warp,
    tube: state.pre === 'valve' ? 1 : 0, preGain: 1, volume: state.volume, mode: state.mode,
    // what a table with its own drive adds on the audio thread (decks/speed-mod.js): none here
    wow: [], rateBase: undefined, mute: false, trackingForce: undefined, antiSkate: undefined, legacyWarpSkip: true,
    // A table with machinery of its own drives the platter itself (motor, idler, wow, muting
    // switch, arm geometry, and its tracking-force and anti-skating dials): its params win.
    ...(state.tableCtl && state.tableCtl.core.drive ? state.tableCtl.core.drive : {}),
  };
}
const pushParams = () => send({ type: 'set', params: params() });

// ---- small helpers -----------------------------------------------------------------
function note(sel, text, err) { const el = $(sel); el.textContent = text; el.classList.toggle('err', !!err); }
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// `hold` keeps a hint up for that many milliseconds even once the needle is down.
const hint = (t, hold = 0) => { $('#hint').textContent = t; $('#hint').hidden = !t; state.hintHold = performance.now() + hold; };
function el(tag, props = {}, kids = []) {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
}
// A line in the shelf's readout. Good news fades after a while; bad news stays until the next line.
let sayTimer = 0;
function say(text, err = false) {
  note('#shelfNote', text, err);
  clearTimeout(sayTimer);
  if (text && !err) sayTimer = setTimeout(() => note('#shelfNote', ''), 7000);
}

// Fetch one track from YouTube Music as 48 kHz stereo 16-bit samples, left and right
// interleaved. `seconds` is only a guess used for the progress figure.
async function fetchPcm(id, seconds, onProgress = () => {}, signal, cut = '') {
  const res = await fetch(`/api/pcm?id=${encodeURIComponent(id)}${cut && cut !== 'clean' ? `&cut=${encodeURIComponent(cut)}` : ''}`, { signal });
  if (!res.ok) throw new Error((await res.json()).error || 'fetch failed');
  const expected = Math.max(1, seconds * FS * 4);
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onProgress(Math.min(0.99, got / expected));
  }
  const bytes = new Uint8Array(got - (got % 4));
  let o = 0;
  for (const c of chunks) { const take = Math.min(c.length, bytes.length - o); bytes.set(c.subarray(0, take), o); o += take; }
  if (!bytes.length) throw new Error('no audio returned');
  return new Int16Array(bytes.buffer);
}

// ---- test cuts: files from this Mac, cut straight to the platter ---------------------------
$('#file').addEventListener('change', async (ev) => {
  for (const f of ev.target.files) {
    const item = { id: `file:${f.name}`, title: f.name.replace(/\.[^.]+$/, ''), artist: 'Local file', seconds: 0, thumb: '', pcm: null, progress: 0.5, error: '' };
    state.queue.push(item); renderQueue();
    try {
      // decoding into a 48 kHz context resamples the file to the groove rate
      const buf = await new OfflineAudioContext(2, 1, FS).decodeAudioData(await f.arrayBuffer());
      const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
      const pcm = new Int16Array(buf.length * 2);
      for (let i = 0; i < buf.length; i++) {
        pcm[2 * i] = Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767)));
        pcm[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767)));
      }
      item.pcm = pcm; item.seconds = buf.length / FS;
    } catch (e) { item.error = 'could not decode this file'; }
    renderQueue();
  }
  ev.target.value = '';
});

function renderQueue() {
  const ul = $('#queue');
  ul.replaceChildren();
  let total = 0, pending = 0;
  state.queue.forEach((it, i) => {
    total += it.seconds || 0;
    if (!it.pcm && !it.error) pending++;
    const rm = el('button', { type: 'button', className: 'quiet', textContent: 'Remove', title: 'Take this off the side' });
    rm.addEventListener('click', () => { state.queue.splice(i, 1); renderQueue(); });
    const sub = it.error ? `Failed: ${it.error}` : it.pcm ? `${mmss(it.seconds)}, ready` : 'Reading the file';
    ul.append(el('li', {}, [
      el('span', { className: 'num', textContent: `A${i + 1}` }),
      el('div', {}, [el('b', { textContent: it.title }), el('small', { textContent: sub, className: it.error ? 'err' : '' })]),
      rm,
    ]));
  });
  const ok = state.queue.filter((q) => q.pcm);
  const cap = capacitySeconds($('#format').value);
  note('#queueNote', state.queue.length ? `${mmss(total)} on the side. This format holds roughly ${mmss(cap)} at a quiet cut.` : 'Nothing on the side yet.', total > cap);
  $('#cut').disabled = !ok.length || pending > 0 || state.cutting;
}

// ---- the platter: one side at a time ------------------------------------------------
// While a side is on the platter the audio thread borrows each track's samples (the
// "File" comparison plays them), so nothing is held twice. They come back when the side
// comes off. A holder is whatever owns a track's samples in its `pcm`: an item in the
// cutting queue, or an entry in the shelf's session memory. A holder may also have a
// `source`, the audio "File" plays instead (the unmastered mix of a mastered cut): then that
// is what is borrowed and handed back, and `pcm` stays here.
let cameBack = null;
function gotBack(pcm) {
  pcm.forEach((a, i) => { const h = state.lent[i]; if (h) { h[h.source ? 'source' : 'pcm'] = a; h.lent = false; } });
  state.lent = [];
  if (cameBack) cameBack();
}

async function clearPlatter() {
  await audio();
  if (!state.side && !state.lent.length) return;
  if (state.tableCtl) state.tableCtl.park(); // the arm back on its rest before the record comes off
  state.side = null; view.setRecord(null);
  $('#sheet').hidden = true; $('#sheetNone').hidden = false;
  // the audio thread reports the last of the play wear, then hands the audio back
  const back = new Promise((resolve) => { cameBack = resolve; setTimeout(resolve, 4000); });
  send({ type: 'unload' });
  await back;
  cameBack = null; state.platter = null;
  for (const h of state.lent) { h[h.source ? 'source' : 'pcm'] = null; h.lent = false; } // never came back: it will have to be fetched again
  state.lent = [];
  changed();
}

// Cut tracks into a side and put it on the platter, one at a time however it was asked for.
// tracks: [{ title, artist, holder }]. opts: what the lathe needs. about: { title, artist,
// artUrl, sideName } and, for a record from the shelf, { record, sideIndex, wear }.
let platterBusy = Promise.resolve();
function putOnPlatter(tracks, opts, about, onProgress = () => {}) {
  const job = platterBusy.then(async () => {
    state.cutting = true; renderQueue();
    const bar = $('#progress');
    try {
      await clearPlatter();
      const ready = tracks.filter((t) => t.holder.pcm && t.holder.pcm.length);
      if (ready.length < tracks.length) throw new Error('The audio for this side is no longer in memory. Fetch it again.');
      bar.hidden = false;
      const t0 = performance.now();
      // A table with an automatic (the 1229) lands the needle near the start of the lead-in and keeps
      // the output muted until its start cycle ends, about 2.2 s later: cut a longer lead-in for it, so
      // the music does not start under the muting (owner, 2026-11-19).
      const cutOpts = state.tableCtl ? { leadInS: 4, ...opts } : opts;
      const side = await cutSide(ready.map((t) => ({ title: t.title, artist: t.artist, pcm: t.holder.pcm, source: t.holder.source || null })), cutOpts, (f) => { bar.firstElementChild.style.width = `${Math.round(f * 100)}%`; onProgress(f); });
      const ms = performance.now() - t0;
      // what the deck view may want to draw on the label and the surface
      Object.assign(side, { title: about.title, artist: about.artist || '', artUrl: about.artUrl || null, sideName: about.sideName || 'A', wear: { dust: about.wear ? about.wear.dust : 0 } });
      // A record from the shelf keeps the same warp every time it is played; a fresh copy is a
      // different disc (its pressing date is part of the seed). As the main Groove Deck does.
      side.seed = seedOf(about.record ? `${about.record.id}:${about.record.pressedAt}:${about.sideName || 'A'}` : `test:${about.title}`);
      side.flaws = discFlaws(side.seed);
      // The audio thread takes the groove and borrows the audio; this thread keeps the map.
      const holders = ready.map((t) => t.holder);
      send({ type: 'load', side: { uL: side.uL, uR: side.uR, src: side.src, radii: side.radii.slice(), rev: side.rev, rpm: side.rpm, N: side.N, velFS: side.velFS, musicTurns: side.musicTurns, leadIn: side.leadIn, wear: about.wear, seed: side.seed } },
        [...new Set([side.uL.buffer, side.uR.buffer, ...side.src.map((s) => s.pcm.buffer)])]);
      for (const h of holders) h.lent = true;
      state.lent = holders;
      side.uL = side.uR = side.src = null;
      state.side = side;
      state.platter = about.record ? { record: about.record, sideIndex: about.sideIndex } : null;
      view.setRecord(side);
      state.armRadius = REST;
      // set the platter to the speed the side was cut at
      setSpeed(Math.abs(side.rpm - 45) < 1 ? 45 : 100 / 3);
      if (state.tableCtl) pushParams(); // the table's drive depends on the cut it is playing
      showSheet(side, ms);
      return side;
    } finally {
      bar.hidden = true;
      state.cutting = false; renderQueue(); changed();
    }
  });
  platterBusy = job.catch(() => {});
  return job;
}
const startHint = () => hint(state.tableCtl ? 'Push the switch to Start, or swing the arm onto the record by hand.' : state.power ? 'Drag the headshell onto the record to drop the needle.' : 'Press start on the deck, then drag the headshell onto the record.');

// Lower the needle at the start of a track on the side that is on the platter. Asking for
// a track by name means wanting to hear it, so a stopped platter is started.
async function playTrack(i) {
  const side = state.side;
  if (!side || !side.tracks[i]) return;
  const r = side.tracks[i].startRadius + 0.0004;
  if (state.tableCtl) return state.tableCtl.lowerAt(r, side); // lift, swing over, lower: the arm swung in starts the motor
  await audio();
  if (state.side !== side) return;
  if (!state.power) setPower(true);
  if (view.lowerAt) view.lowerAt(r); else { state.armRadius = r; send({ type: 'drop', radius: r }); }
}

// A record from the shelf has landed on the platter. Unless the Workbench says otherwise,
// start the platter and lower the needle at the first track once the lathe has made its pass.
async function landed() {
  const side = state.side;
  if (!$('#autoplay').checked) return startHint();
  hint('');
  await wait(300);
  for (let i = 0; i < 60 && view.info().cutting; i++) await wait(100);
  if (state.side !== side || state.st.down || state.armDrag || state.cutting || shelf.work) return; // something else has happened since
  if (state.tableCtl) return state.tableCtl.autoPlay(); // set the size selector and press Start: the automatic does the rest
  playTrack(0);
}

// ---- test cut ----------------------------------------------------------------------
$('#cut').addEventListener('click', cut);
async function cut() {
  const items = state.queue.filter((q) => q.pcm);
  if (!items.length || state.cutting) return;
  $('#cut').disabled = true;
  shelf.letGo(); // a record on its way from the shelf gives way to this cut
  const first = items[0];
  try {
    hint('Cutting the lacquer…');
    await putOnPlatter(items.map((it) => ({ title: it.title, artist: it.artist, holder: it })),
      { format: $('#format').value, levelDb: Number($('#level').value), bassMono: $('#bassMono').checked },
      { title: first.title, artist: first.artist, artUrl: artSrc(first.art) || null, sideName: 'A' });
    startHint();
  } catch (e) {
    hint('');
    note('#queueNote', String(e.message || e), true);
    for (const it of state.queue) if (!it.pcm && !it.error) it.error = 'its audio was lost; remove it and add it again';
    renderQueue();
  }
}

// What the lathe did, for the Workbench.
function showSheet(side, ms) {
  const s = side.stats, lpi = (m) => Math.round(0.0254 / m);
  const lines = [
    `${side.fmt.name} · side ${side.sideName} · ${mmss(s.seconds)}`,
    `cut in         ${(ms / 1000).toFixed(1)} s`,
    `turns          ${s.turns}`,
    `lines per inch ${lpi(s.pitchMax)}-${lpi(s.pitchMin)}`,
    `groove spacing ${(s.pitchMin * 1e6).toFixed(0)}-${(s.pitchMax * 1e6).toFixed(0)} µm (opened ×${s.spread.toFixed(2)})`,
    `peak velocity  ${(s.peakVel * 100).toFixed(1)} cm/s per wall`,
    `widest swing   ${(s.peakLat * 1e6).toFixed(0)} µm`,
    `music ends at  ${(s.innerRadius * 1000).toFixed(1)} mm radius`,
    `steepest wall  ${(Math.atan(s.maxSlope) * 180 / Math.PI).toFixed(0)}°`,
  ];
  if (side.flaws) lines.push(`warp           ${(side.flaws.warp * 1000).toFixed(2)} mm, ${side.flaws.lobes === 1 ? 'one high spot' : 'two high spots'} a turn`);
  if (s.autoDb < -0.05) lines.push(`cut level      ${s.levelDb.toFixed(1)} dB (turned down ${(-s.autoDb).toFixed(1)} dB to fit the side)`);
  if (s.maxSlope > 0.6) lines.push('', 'Hot cut: expect a conical stylus to', 'smear the loudest highs near the label.');
  if (!s.fits) lines.push('', 'TOO LONG for this format at this level.', 'Grooves were squeezed tighter than a real', 'lathe allows. Lower the level or use a 12".');
  const pre = $('#sheet'); pre.hidden = false; pre.textContent = lines.join('\n');
  $('#sheetNone').hidden = true;
}

// ---- controls ----------------------------------------------------------------------------
function setPower(on) {
  if (state.tableCtl) return on ? state.tableCtl.start() : state.tableCtl.stop(); // its own switch, through its mechanism
  state.power = on; $('#start').setAttribute('aria-pressed', String(on)); pushParams();
  if (on && state.side && !state.st.down && !shelf.work) hint('Drag the headshell onto the record to drop the needle.');
}
const togglePower = async () => { await audio(); setPower(!state.power); };
function setSpeed(rpm) {
  if (state.tableCtl) state.tableCtl.setSpeed(rpm > 60 ? '78' : rpm > 40 ? '45' : '33');
  state.rpm = rpm;
  $('#s33').classList.toggle('on', rpm < 40); $('#s45').classList.toggle('on', rpm > 40);
  pushParams();
}
$('#start').addEventListener('click', togglePower);
$('#s33').addEventListener('click', () => setSpeed(100 / 3));
$('#s45').addEventListener('click', () => setSpeed(45));
$('#pitch').addEventListener('input', (e) => { state.pitch = Number(e.target.value); $('#pitchOut').textContent = `${state.pitch > 0 ? '+' : ''}${state.pitch.toFixed(1)}%`; pushParams(); });
$('#pitch').addEventListener('dblclick', (e) => { e.target.value = 0; e.target.dispatchEvent(new Event('input')); });
$('#cue').addEventListener('click', async () => {
  await audio();
  if (state.tableCtl) return state.tableCtl.setCue(!state.tableCtl.mech.cueUp);
  if (state.st.down) send({ type: 'lift' }); else if (view.lowerAt) view.lowerAt(state.armRadius); else send({ type: 'drop', radius: state.armRadius }); // the cue lever lowers it gently
});
const setMode = (m) => { state.mode = m; $('#abGroove').classList.toggle('on', m === 'groove'); $('#abFile').classList.toggle('on', m === 'source'); pushParams(); };
$('#abGroove').addEventListener('click', () => setMode('groove'));
$('#abFile').addEventListener('click', () => setMode('source'));
$('#volume').addEventListener('input', (e) => { state.volume = Number(e.target.value); pushParams(); });
$('#deckSel').addEventListener('change', (e) => { state.deck = e.target.value; pushParams(); });
$('#cartSel').addEventListener('change', (e) => { state.cart = e.target.value; pushParams(); });
$('#preSel').addEventListener('change', (e) => { state.pre = e.target.value; pushParams(); });
$('#cap').addEventListener('input', (e) => { state.cap = Number(e.target.value); $('#capOut').textContent = `${state.cap} pF`; pushParams(); });
$('#surface').addEventListener('input', (e) => { state.surface = Number(e.target.value); $('#surfOut').textContent = `${Math.round(state.surface * 100)}%`; pushParams(); });
$('#warp').addEventListener('input', (e) => {
  state.warp = Number(e.target.value);
  $('#warpOut').textContent = state.warp < 0.03 ? 'Flat' : Math.abs(state.warp - 1) < 0.03 ? 'As pressed' : `×${state.warp.toFixed(2)}`;
  pushParams();
});
$('#ecc').addEventListener('input', (e) => { state.ecc = Number(e.target.value); $('#eccOut').textContent = `${state.ecc.toFixed(2)} mm`; pushParams(); });
$('#level').addEventListener('input', (e) => { const v = Number(e.target.value); $('#levelOut').textContent = `${v > 0 ? '+' : ''}${v} dB`; });
$('#format').addEventListener('change', renderQueue);
// whether a record starts playing by itself is remembered from one visit to the next
try { if (localStorage.getItem('gd.autoplay') === 'no') $('#autoplay').checked = false; } catch { /* private window: it stays on */ }
$('#autoplay').addEventListener('change', (e) => { try { localStorage.setItem('gd.autoplay', e.target.checked ? 'yes' : 'no'); } catch { /* not remembered */ } });

// ---- the deck view: everything drawn and touched inside the canvas -----------------------
const view = createDeckView({
  canvas: $('#deck'), state,
  actions: {
    audio,
    armMove: (radius) => (state.tableCtl ? state.tableCtl.hand(radius) : send({ type: 'arm', radius })),
    armRelease: () => state.tableCtl && state.tableCtl.release(), // a table with its own arm decides what letting go does
    drop: (radius) => send({ type: 'drop', radius, byHand: true }), // let go of the headshell over the record
    lower: (radius) => send({ type: 'drop', radius }), // set down by the cue lever or a track click: no mark
    rest: () => send({ type: 'rest' }),
    lift: () => send({ type: 'lift' }),
    touchStart: () => send({ type: 'touchStart' }),
    touchMove: (revs) => send({ type: 'touchMove', revs }),
    touchEnd: () => send({ type: 'touchEnd' }),
    togglePower,
    setSpeed: (rpm) => setSpeed(rpm),
    setPitch: (pct) => { $('#pitch').value = pct; $('#pitch').dispatchEvent(new Event('input')); },
    hint,
  },
});
state.view = view;

// ---- the turntable: which one is on the table, and its machinery -------------------------------
let tablePanel = null, tableSwitch = null;
function setTable(key, first = false) {
  if (!TABLES[key]) key = 'gd';
  if (!first && key === state.table && (key === 'gd' || state.tableCtl)) return;
  const old = state.tableCtl;
  if (old) { old.dispose(); state.tableCtl = null; }
  if (tablePanel) { tablePanel.dispose(); tablePanel = null; }
  if (!first) { // the arm back on its rest and the platter left to run down; the record stays where it is
    if (state.st.down) send({ type: 'lift' });
    send({ type: 'rest' }); state.armRadius = REST;
    state.power = false; $('#start').setAttribute('aria-pressed', 'false');
  }
  state.table = key; storeTable(key);
  const t = TABLES[key];
  if (t.createController) {
    state.tableCtl = t.createController({ state, send, pushParams, audio, hint, onChange: () => changed('table') });
    tablePanel = t.createPanel({ ctl: state.tableCtl, view, el, state });
    $('#bench .scroll').insertBefore(tablePanel.node, $('#deckControls').nextSibling);
  }
  // the original deck's own controls and drive presets only mean something on the original deck
  $('#deckControls').hidden = !!t.createController;
  $('#deckSel').closest('label').hidden = !!t.createController;
  document.body.dataset.table = key;
  if (tableSwitch) tableSwitch.sync();
  pushParams();
  if (!first) { hint(state.side ? (t.createController ? 'The record is still on the platter. Push the switch to Start.' : 'The record is still on the platter. Press start, then drag the headshell onto it.') : '', 4000); changed('table'); }
}

// ---- the records, and the parts of the screen that show them -------------------------------
const shelf = createShelf({
  state,
  deck: {
    audio, send, putOnPlatter, clearPlatter, fetchPcm, hint, say, changed, landed,
    cutSettings: () => ({ levelDb: Number($('#level').value), bassMono: $('#bassMono').checked }),
    vintage: () => state.vintage,
    cutName: (key) => state.cutName(key),
  },
});
state.shelf = shelf;
const ui = { el, mmss, hint, say, view };
const search = createSearch({ state, shelf, ui });
const shelfView = createShelfView({ state, shelf, ui: { ...ui, openSearch: () => search.focus() } });
const platterCard = createPlatterCard({ state, shelf, ui: { ...ui, playTrack, layout: () => layout(), openSearch: () => search.focus() } });
watchers.push(search.changed, shelfView.changed, platterCard.changed);

// What the deck says when there is nothing on it.
if (!HOST) shelf.loaded.then(() => { if (!state.side && !shelf.work) hint(shelf.records.length ? 'Drag a record up from the shelf to play it.' : 'Search for a song or an album to press your first record.'); });

// Say so up front if the server cannot find one of the programs it needs.
if (!HOST) fetch('/api/health').then((r) => r.json()).then((h) => {
  const missing = Object.entries(h.tools).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) search.trouble(`The server cannot find ${missing.join(', ')}. Searching and fetching will not work until ${missing.length > 1 ? 'they are' : 'it is'} installed.`);
}).catch(() => search.trouble('Cannot reach the Groove Deck server. Start it and reload this page.'));

// A host page presses its own audio: one track, 48 kHz stereo 16-bit interleaved, cut with the
// Workbench's pressing settings unless the host gives its own, then played as a shelf record is.
// source, when given (same layout), is what the Vinyl/Raw switch plays as Raw instead of pcm:
// the unmastered mix of a mastered cut. opts: { format, levelDb, bassMono, onProgress }.
// Resolves with the side once it is on the platter.
state.press = async ({ title, artist = '', pcm, source = null }, opts = {}) => {
  shelf.letGo();
  hint('Cutting the lacquer…');
  const holder = { pcm, source };
  const side = await putOnPlatter([{ title, artist, holder }], {
    format: opts.format || $('#format').value,
    levelDb: opts.levelDb ?? Number($('#level').value),
    bassMono: opts.bassMono ?? $('#bassMono').checked,
  }, { title, artist, sideName: 'A' }, opts.onProgress);
  landed();
  return side;
};

// ---- the Workbench drawer -------------------------------------------------------------------
let scenePanel = null; // the View panel; made after the first layout, further down
function setBench(open) {
  if (open && scenePanel) scenePanel.close(); // they stand in the same place
  state.bench = open;
  $('#bench').classList.toggle('open', open); $('#bench').inert = !open;
  $('#benchToggle').setAttribute('aria-expanded', String(open)); $('#benchToggle').classList.toggle('on', open);
  layout();
}
$('#benchToggle').addEventListener('click', () => setBench(!state.bench));
$('#benchClose').addEventListener('click', () => { setBench(false); $('#benchToggle').focus(); });

// ---- vintage cuts through LUNA: optional ---------------------------------------------------
// Off until ticked in the Workbench, and the tick box only appears on a Mac that has LUNA.
// With it off nothing here contacts LUNA. A record pressed as a vintage cut still plays
// without LUNA: it is cut clean that time, and the deck says so.
state.vintage = { on: false, installed: false, ok: false, reason: '', cuts: [{ key: 'clean', name: 'Clean modern cut', needsLuna: false }] };
state.cutName = (key) => (state.vintage.cuts.find((c) => c.key === (key || 'clean')) || { name: '' }).name;
async function refreshVintage() {
  const v = state.vintage;
  if (HOST) return; // a host page masters its own way (the LUNA Add On, in the open session)
  try {
    const got = await (await fetch(`/api/cuts${v.on ? '?check=1' : ''}`)).json();
    v.cuts = got.cuts; v.installed = !!got.luna.installed; v.ok = v.on && !!got.luna.ok; v.reason = got.luna.reason || '';
  } catch { v.ok = false; v.reason = 'the Groove Deck server did not answer'; }
  $('#vintageRow').hidden = !v.installed;
  const noteEl = $('#vintageNote');
  noteEl.hidden = !v.installed || !v.on;
  noteEl.textContent = v.ok ? 'On. Each result in the search now has a cut menu. LUNA must be running with no session of your own open; it uses a scratch session and removes it afterwards.' : `Not available right now: ${v.reason}.`;
  noteEl.classList.toggle('err', v.on && !v.ok);
  if (typeof search !== 'undefined' && search.changed) search.changed();
  if (typeof shelfView !== 'undefined' && shelfView.changed) shelfView.changed();
}
try { state.vintage.on = localStorage.getItem('gd.vintage') === 'yes'; } catch { /* stays off */ }
$('#vintage').checked = state.vintage.on;
$('#vintage').addEventListener('change', (e) => {
  state.vintage.on = e.target.checked;
  try { localStorage.setItem('gd.vintage', state.vintage.on ? 'yes' : 'no'); } catch { /* not remembered */ }
  refreshVintage();
});
refreshVintage();

// ---- layout: tell the deck how much of the window the rest of the screen covers ------------
const SCENE_ROOM = 314; // the View panel and its margin
let wasRoomy = state.platterOpen;
function layout(now = false) {
  const W = window.innerWidth, root = document.documentElement;
  const roomy = W - CARD_ROOM >= DECK_ROOM_BESIDE_CARD; // the open platter card can stand beside the deck
  // a window made narrower folds the card out of the deck's way; made wider again, it unfolds
  if (roomy !== wasRoomy) { wasRoomy = roomy; state.platterOpen = roomy; platterCard.changed(); }
  // whatever the View panel has hidden takes no room from the deck
  const cls = document.body.classList, bare = cls.contains('deck-only'), noCard = bare || !!HOST || cls.contains('hide-card'); // a host page (the LUNA Add On) has no platter card
  const left = roomy && state.platterOpen && !noCard ? CARD_ROOM : 0;
  const benchW = $('#bench').offsetWidth;
  // the Workbench or the View panel stands at the right; the deck moves over when there is room
  const sceneW = scenePanel && scenePanel.isOpen() ? SCENE_ROOM : 0;
  const besideW = state.bench ? benchW : sceneW;
  const right = !bare && besideW && W - left - besideW >= DECK_ROOM_BESIDE_BENCH ? besideW : 0;
  const top = bare ? 0 : $('.topbar').offsetHeight + (roomy || noCard ? 0 : STRIP_ROOM);
  const shelfH = $('#shelfStrip').offsetHeight; // 0 when the shelf is hidden
  cls.toggle('tight', !roomy);
  view.setInsets({ top, right, bottom: shelfH ? shelfH + 20 : 0, left }, now || calm.matches);
  root.style.setProperty('--in-l', `${left}px`); root.style.setProperty('--in-r', `${right}px`);
  root.style.setProperty('--shelf-h', `${shelfH}px`);
}
window.addEventListener('resize', () => layout(true));
new ResizeObserver(() => layout(true)).observe($('#shelfStrip'));
layout(true);
// the View panel (camera, what is shown, lighting) may hide things, so it comes after the first layout
scenePanel = createScenePanel({ view, ui, onLayout: () => layout(), onOpen: () => { if (state.bench) setBench(false); } });
// the turntable switch, at the top of the Workbench and in the View panel
tableSwitch = createTableSwitch({ el, getTable: () => state.table, setTable: (k) => setTable(k) });
setTable(state.table, true);
// The view creates the active table and registers its cameras on its first frame.
if (launchLeverView && view.nextFrame) {
  view.nextFrame().then(() => {
    if (view.table === 'dual1229') view.setView('lever');
  });
}
// ?compare=1: the comparison tool's hook (tools/compare.mjs); nothing of it loads otherwise
if (new URLSearchParams(location.search).has('compare')) import('./compare-hook.js').then((m) => { state.compare = m.createCompareHook({ state, view, setTable }); });

// ---- keys ------------------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (e.key === 'Escape') {
    // the nearest thing closes first
    if (shelfView.dropDrag() || shelfView.closeCard() || search.close() || shelfView.closeCollection() || scenePanel.close() || (scenePanel.isDeckOnly() && (scenePanel.deckOnly(false), true)) || (state.bench && (setBench(false), true))) e.preventDefault();
  } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault(); search.focus();
  } else if (e.code === 'Space' && !typing && document.activeElement.tagName !== 'BUTTON') {
    e.preventDefault(); togglePower();
  }
});

// ---- meters, what is playing, and the groove microscope ---------------------------------------
function panelFrame() {
  $('#mL').style.clipPath = `inset(0 ${100 - Math.min(100, Math.sqrt(state.mL) * 100)}% 0 0)`;
  $('#mR').style.clipPath = `inset(0 ${100 - Math.min(100, Math.sqrt(state.mR) * 100)}% 0 0)`;
  platterCard.follow();
  if (state.bench) drawScope();
  if (tablePanel && state.bench && performance.now() - (tablePanel.at || 0) > 100) { tablePanel.at = performance.now(); tablePanel.update(); }
  requestAnimationFrame(panelFrame);
}

// The groove under the stylus, drawn from the wall data the audio thread is tracing.
const scope = $('#scope'), sx = scope.getContext('2d');
function drawScope() {
  const W = scope.width, H = scope.height, g = sx, gr = state.groove, st = state.st, side = state.side;
  g.fillStyle = '#0c0b0a'; g.fillRect(0, 0, W, H);
  if (!gr || !side) {
    note('#readout', side ? 'Needle up.' : 'No record on the platter.');
    return;
  }
  const n = gr.l.length, dl = new Float32Array(n), dr = new Float32Array(n);
  let a = 0, b = 0, ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { a += gr.l[i] / FS; b += gr.r[i] / FS; dl[i] = a; dr[i] = b; ma += a; mb += b; }
  ma /= n; mb /= n;
  const scale = H / 260e-6, mid = H / 2, half = 28e-6;
  const edge = (sign) => {
    for (let i = 0; i < n; i++) {
      const lat = ((dl[i] - ma) + (dr[i] - mb)) * 0.7071, vert = ((dl[i] - ma) - (dr[i] - mb)) * 0.7071;
      const y = mid + (lat + sign * (half + vert)) * scale, x = (i / (n - 1)) * W;
      if (i === 0 && sign < 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  };
  // groove as seen from above: two walls meeting at the bottom
  g.beginPath(); edge(-1);
  for (let i = n - 1; i >= 0; i--) { const lat = ((dl[i] - ma) + (dr[i] - mb)) * 0.7071; g.lineTo((i / (n - 1)) * W, mid + lat * scale); }
  g.closePath(); g.fillStyle = '#8b8b93'; g.fill();
  g.beginPath();
  for (let i = 0; i < n; i++) { const lat = ((dl[i] - ma) + (dr[i] - mb)) * 0.7071; const x = (i / (n - 1)) * W, y = mid + lat * scale; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
  for (let i = n - 1; i >= 0; i--) { const lat = ((dl[i] - ma) + (dr[i] - mb)) * 0.7071, vert = ((dl[i] - ma) - (dr[i] - mb)) * 0.7071; g.lineTo((i / (n - 1)) * W, mid + (lat + half + vert) * scale); }
  g.closePath(); g.fillStyle = '#3d3d44'; g.fill();
  // stylus
  const c = n >> 1, latC = ((dl[c] - ma) + (dr[c] - mb)) * 0.7071;
  const tip = CARTS[state.cart].tipRadius * scale;
  g.fillStyle = 'rgba(242,163,58,.9)'; g.beginPath(); g.ellipse(W / 2, mid + latC * scale, Math.max(3, tip * 0.35), Math.max(4, 18e-6 * scale), 0, 0, TAU); g.fill();
  // scale bar: 100 micrometres
  g.fillStyle = '#9a9186'; g.fillRect(14, H - 18 - 100e-6 * scale, 2, 100e-6 * scale); g.font = '18px ui-monospace, Menlo, monospace'; g.fillText('100 µm', 22, H - 20);
  const V = (TAU * st.radius * side.rpm) / 60, pos = st.p / FS;
  let tr = side.tracks.findIndex((t) => st.p >= t.start && st.p < t.end);
  const where = tr >= 0 ? `${side.sideName}${tr + 1} ${mmss((st.p - side.tracks[tr].start) / FS)}` : st.p > side.tracks[side.tracks.length - 1].end ? 'run-out' : 'between tracks';
  note('#readout', `${where}, ${(st.radius * 1000).toFixed(1)} mm from centre. Groove passing at ${(V * Math.abs(st.wr) * 100).toFixed(1)} cm/s, ${((n / FS) * V * 1000).toFixed(1)} mm of it shown. Side time ${mmss(pos)}.`);
}

renderQueue();
changed();
requestAnimationFrame(panelFrame);

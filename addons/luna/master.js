// What the Add On asks of LUNA, inside the session the user has open, through the builder SDK.
// Takes SDK objects (a connected client and its session) and file paths; no DOM, so a Node
// script can run it against LUNA as the page does.
//
//   renderMix: bounce the Main Output to a WAV in the session's own folder (next to its .luna).
//     Not "Exported Files": a new session has no such folder until LUNA's export makes one, and a
//     bounce to a folder that is not there reports "completed" and writes nothing.
//     (LUNA's own export of the main mix wrote an MP3 under a .wav name, which LUNA then
//     refuses to serve to the page; a bounce to a path we name writes a real WAV.)
//   masterCut: put that WAV through a vintage cut's plugin chain (public/vintage-cuts.js)
//     on a track made for it, at the level the cut works at, bounce the track, and take the
//     track away again. The user's own
//     tracks, buses and inserts are not touched; the imported audio stays in the session's pool.
//   readAudio: load a WAV LUNA wrote into the page, as 48 kHz stereo 16-bit samples.
//
// renderMix and masterCut take an AbortSignal (`signal`): aborting stops LUNA's render where it is
// (render.abort) or stops between steps, and rejects with an error named 'AbortError'. The cut's
// track is taken away either way.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const cancelled = () => Object.assign(new Error('cancelled'), { name: 'AbortError' });
const check = (signal) => { if (signal && signal.aborted) throw cancelled(); };

// The folder LUNA keeps this session in, from the workspace's list of sessions on disk.
export async function sessionFolder(luna, session) {
  const name = session.name.value;
  const rows = await luna.workspace.recent(100);
  const row = rows.find((r) => r.name === name && r.path);
  if (!row) throw new Error(`could not find “${name}” on disk; save the session and try again`);
  return row.path.slice(0, row.path.lastIndexOf('/'));
}

// Wait for a render, then take LUNA's record of it away. LUNA drops a finished render on its
// own, sometimes before anyone sees it finish (the SDK then rejects with "removed" although the
// file was written: readAudio is the proof that it was), but its RENDER window stays up saying
// DONE until the record is deleted or the user presses Cancel.
async function finish(render, signal) {
  const stop = () => { render.abort().catch(() => {}); };
  if (signal) signal.addEventListener('abort', stop, { once: true });
  try {
    check(signal);
    await render.done();
  } catch (e) {
    if (signal && signal.aborted) throw cancelled();
    if (!/removed/i.test(String(e && (e.code || e.message)))) throw e;
  } finally {
    if (signal) signal.removeEventListener('abort', stop);
    await render.delete().catch(() => {});
  }
  check(signal);
}

// Turn a control that shows decibels to `db`. LUNA takes a position from 0 to 1 and each plugin
// has its own curve between that and decibels, so the position is found by halving: set it, read
// what the plugin shows, go up or down. Resolves with the decibels it ended on.
const shownDb = (c) => { const t = String(c.display.value || ''); return /-\s*inf/i.test(t) ? -Infinity : parseFloat(t); };
async function setDb(c, db) {
  let lo = 0, hi = 1, best = null;
  for (let i = 0; i < 16; i++) {
    const at = (lo + hi) / 2;
    await c.normalized.set(at);
    for (let k = 0; k < 20 && Math.abs(c.normalized.value - at) > 1e-4; k++) await wait(25);
    await wait(25); // the text follows the position
    const got = shownDb(c);
    if (Number.isNaN(got)) throw new Error(`could not read “${c.display.value}” as decibels`);
    if (best === null || Math.abs(got - db) < Math.abs(best - db)) best = got;
    if (Math.abs(got - db) < 0.05) return got;
    if (got < db) lo = at; else hi = at;
  }
  // the halving ended beside the nearest position: go back to it if the last step moved off it
  return shownDb(c);
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const plainName = (s) => s.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Session';

// Bounce the session's Main Output. Resolves with the path of the WAV.
export async function renderMix(luna, session, { onProgress = () => {}, signal } = {}) {
  check(signal);
  const main = session.master || session.buses.value.find((b) => b.name.value === 'Main Output');
  if (!main) throw new Error('this session has no Main Output bus');
  const dir = await sessionFolder(luna, session);
  const file = `${dir}/Listening Booth ${plainName(session.name.value)} ${stamp()}.wav`;
  const { render } = await session.bounce({ channelUids: [main.id], name: 'Listening Booth mix', realTime: false, outputPaths: [file] });
  const off = render.progress && render.progress.onChange ? render.progress.onChange((p) => onProgress((p || 0) / 100)) : null;
  try { await finish(render, signal); } finally { if (off) off(); }
  return file;
}

// Put `wavPath` through a cut's chain on a track of its own and bounce it to a new WAV.
// cut: one entry of CUTS, or one with its chain dialled (chainFor). gainDb: what to turn the mix
// up or down by as it goes in, on the control the cut names for it (cut.gain: [step, control]).
// (Not the clip's gain: LUNA's bounce of a track leaves that out.) Resolves with
// { file, shown: [[plugin, param, display]], gainDb: what LUNA's control then showed }.
export async function masterCut(luna, session, wavPath, cut, { onStep = () => {}, signal, gainDb = 0 } = {}) {
  check(signal);
  const dir = wavPath.slice(0, wavPath.lastIndexOf('/'));
  const file = `${dir}/${wavPath.slice(dir.length + 1).replace(/\.wav$/i, '')} (${cut.name}).wav`;
  onStep('Bringing the mix back into the session');
  const before = new Set(session.tracks.value.map((t) => t.id));
  await session.newTrack({ name: 'Listening Booth cut', stemFormat: 'stereo', makeNameUnique: true });
  let track = null;
  for (let i = 0; i < 100 && !track; i++) { await wait(50); track = session.tracks.value.find((t) => !before.has(t.id)); }
  if (!track) throw new Error('LUNA did not make the track for the cut');
  const shown = [];
  let went = 0;
  try {
    check(signal);
    const source = await session.importPath(wavPath, { name: 'Listening Booth mix' });
    const ns = source.length && source.length.value;
    if (!(ns > 0)) throw new Error('LUNA imported the mix but did not say how long it is');
    await session.musical.ready();
    const timeline = session.musical.timeline;
    const stopTick = Math.ceil(timeline.tickAtSeconds(ns / 1e9));
    await session.insertClip({ trackUid: track.id, sourceUid: source.id, startTick: 0, stopTick, name: 'Listening Booth mix' });
    for (let i = 0; i < cut.chain.length; i++) {
      const step = cut.chain[i];
      check(signal);
      onStep(`Loading ${step.plugin.replace(/^uaudio_/, '').replace(/[_-]+/g, ' ')}`);
      const slot = await track.insert(step.plugin, `effect_${i}`);
      if (!slot) throw new Error(`no free insert for ${step.plugin}`);
      if (slot.pluginError.value) throw new Error(`LUNA could not load ${step.plugin}: ${slot.pluginError.value}`);
      await slot.controls.load();
      for (const [param, normalized, expect] of step.set) {
        const c = slot.params.find((p) => p.id === param);
        if (!c) throw new Error(`${step.plugin} has no control “${param}”`);
        await c.normalized.set(normalized);
        for (let k = 0; k < 20 && Math.abs(c.normalized.value - normalized) > 1e-3; k++) await wait(25);
        const got = String(c.display.value || '').trim();
        shown.push([step.plugin, param, got]);
        // a control that did not land where the cut says is a wrong cut: say so rather than press it
        if (expect && got !== expect) throw new Error(`LUNA set ${param} to “${got}”, not “${expect}”`);
      }
      if (cut.gain && cut.gain[0] === i && Math.abs(gainDb) >= 0.05) {
        const c = slot.params.find((p) => p.id === cut.gain[1]);
        if (!c) throw new Error(`${step.plugin} has no control “${cut.gain[1]}”`);
        went = await setDb(c, gainDb);
        shown.push([step.plugin, cut.gain[1], String(c.display.value || '').trim()]);
        // a mix that did not go in at the cut's level is a wrong cut, like a control that did not land
        if (Math.abs(went - gainDb) > 0.5) throw new Error(`LUNA set ${cut.gain[1]} to ${went} dB, not ${gainDb.toFixed(1)} dB`);
      }
    }
    check(signal);
    onStep('Rendering the cut');
    const { render } = await session.bounce({ channelUids: [track.id], name: 'Listening Booth cut', realTime: false, outputPaths: [file], range: { startTick: 0, stopTick } });
    await finish(render, signal);
  } finally {
    await track.delete().catch(() => {});
  }
  return { file, shown, gainDb: went };
}

// Read a WAV LUNA wrote into the page: served by LUNA (it refuses anything it cannot vouch for
// as audio), fetched with XMLHttpRequest as the SDK's docs ask, and decoded at 48 kHz.
export async function readAudio(luna, addOnId, path, FS = 48000) {
  let url;
  try { url = await luna.gui.serveMediaFile(addOnId, path); } catch (e) {
    if (/filesystem_error/.test(String(e && (e.code || e.message)))) throw new Error(`LUNA finished the render but there is no file at ${path}`);
    throw e;
  }
  const bytes = await new Promise((ok, no) => {
    const x = new XMLHttpRequest();
    x.open('GET', url); x.responseType = 'arraybuffer';
    x.onload = () => (x.status === 200 || x.status === 0 ? ok(x.response) : no(new Error(`LUNA would not hand over the file (HTTP ${x.status})`)));
    x.onerror = () => no(new Error('LUNA would not hand over the file'));
    x.send();
  });
  return decodeToPcm(bytes, FS);
}

// Any audio file's bytes to 48 kHz stereo 16-bit samples, left and right interleaved: what the
// lathe takes. Decoding into a 48 kHz context resamples it to the groove rate.
export async function decodeToPcm(bytes, FS = 48000) {
  const buf = await new OfflineAudioContext(2, 1, FS).decodeAudioData(bytes);
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const pcm = new Int16Array(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    pcm[2 * i] = Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767)));
    pcm[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767)));
  }
  return { pcm, seconds: buf.length / FS };
}

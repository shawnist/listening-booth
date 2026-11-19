// The shelf: records you own, and what happens to them. A record leaves its sleeve: its
// audio is fetched from YouTube Music again, the side is cut, and it goes on the platter.
// Nothing but the record's description and its wear is kept on disk.
// This file has no screen in it. shelf-view.js draws the sleeves, platter-card.js the
// record on the platter; both are told when something here changes through deck.changed().
import { FS } from './dsp.js';
import { MAX_TICKS } from './engine.js';
import {
  albumRecord, singleRecord, dustOf, clean, addPlay, ticksOn, formatName, artSrc, shelfApi,
  PLAY_COUNTS_AFTER_S,
} from './library.js';

// Fetched audio is kept in this page's memory only, so flipping a record back over does
// not mean fetching it again. This much, then the audio used longest ago is let go.
const MEMORY_SECONDS = 45 * 60;
const MEMORY_BYTES = MEMORY_SECONDS * FS * 4;
const FETCH_AT_ONCE = 3;
const SAVE_AFTER_MS = 3000;

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const unreachable = (e) => /Failed to fetch|NetworkError|Load failed/.test(String(e.message || e));

// deck: what the shelf needs from the rest of the app. audio(), send(msg), putOnPlatter(),
// clearPlatter(), fetchPcm(), hint(text, hold), cutSettings() as before, and:
//   say(text, isError)   a line for the shelf's readout
//   changed(what)        something the screen shows has changed: 'work' (progress only),
//                        'facts' (plays, dust, ticks), or nothing for anything else
//   landed(record)       a record has just arrived on the platter
export function createShelf({ state, deck }) {
  const records = [];
  const memory = new Map(); // track id and cut -> { id, pcm, lent, used, wait }: this session's audio
  const touched = new Map(); // record id -> when it was last pressed or pulled, this session
  const pressing = new Map(); // 'album:id' or 'single:id' -> the pressing under way
  let work = null; // { id, sideIndex, text, short, progress, note } while a record is on its way to the platter
  let failed = null; // { id, sideIndex, text } when it did not get there
  let fresh = ''; // id of the record pressed a moment ago, so its sleeve can be seen to arrive
  let pullNo = 0, stop = null, stopFor = '', sitting = 0, counted = false, lastDust = -1;
  state.records = records;
  state.lastPull = null; // how long the last trip from sleeve to platter took, for the curious and for tests

  const onPlatter = (rec) => !!state.platter && state.platter.record === rec;
  const find = (id) => records.find((r) => r.id === id);
  // The record a search result was pressed as, if it has been.
  // The record pressed from this album or song, in this format if one is named.
  const has = (kind, id, format, chain) => records.find((r) => (kind === 'album' ? r.source.albumId === id : r.kind === 'single' && r.source.videoId === id) && (!format || r.format === format) && (chain === undefined || ((r.cut && r.cut.chain) || 'clean') === (chain || 'clean')));

  // ---- the order records stand in ---------------------------------------------------------
  const when = (iso) => Date.parse(iso) || 0;
  const recent = (r) => Math.max(touched.get(r.id) || 0, when(r.lastPlayedAt), when(r.pressedAt));
  const SORTS = {
    recent: (a, b) => recent(b) - recent(a), // newest or most recently played first
    pressed: (a, b) => when(b.pressedAt) - when(a.pressedAt),
    title: (a, b) => a.title.localeCompare(b.title),
    artist: (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
    plays: (a, b) => b.plays - a.plays || recent(b) - recent(a),
  };
  const order = (sort = 'recent') => records.slice().sort(SORTS[sort] || SORTS.recent);

  // ---- this session's audio ---------------------------------------------------------
  const held = () => { let b = 0; for (const e of memory.values()) if (e.pcm) b += e.bytes; return b; };
  function trim() {
    const idle = [...memory.values()].filter((e) => e.pcm && !e.lent).sort((a, b) => a.used - b.used);
    let total = held();
    while (total > MEMORY_BYTES && idle.length) { const e = idle.shift(); total -= e.bytes; memory.delete(e.id); }
  }
  // The audio for one track: from memory if it is there, otherwise from YouTube Music.
  // chain: the record's cut. A vintage cut is mastered through LUNA on the way in, so it is
  // different audio from the clean cut of the same song and is kept under its own name.
  const chainOf = (rec) => (rec.cut && rec.cut.chain && rec.cut.chain !== 'clean' ? rec.cut.chain : '');
  const keyOf = (track, chain) => (chain ? `${track.id}@${chain}` : track.id);
  function audioFor(track, onProgress, signal, chain = '') {
    const key = keyOf(track, chain);
    let e = memory.get(key);
    if (e && e.pcm && (e.lent || e.pcm.length)) { e.used = performance.now(); onProgress(1); return Promise.resolve(e); }
    if (e && e.wait) return e.wait;
    e = { id: key, pcm: null, bytes: 0, lent: false, used: performance.now(), wait: null };
    const entry = e;
    entry.wait = deck.fetchPcm(track.id, track.seconds, onProgress, signal, chain).then((pcm) => {
      entry.pcm = pcm; entry.bytes = pcm.byteLength; entry.wait = null; entry.used = performance.now();
      onProgress(1); trim();
      return entry;
    }, (err) => { if (memory.get(key) === entry) memory.delete(key); throw err; });
    memory.set(key, entry);
    return entry.wait;
  }
  // YouTube now and then refuses a fetch that works a moment later: give each track a second go.
  async function audioSurely(track, onProgress, signal, onSecondGo = () => {}, chain = '') {
    try { return await audioFor(track, onProgress, signal, chain); }
    catch (err) { if (signal.aborted || unreachable(err) || /LUNA|UA Assistant/.test(String(err.message || err))) throw err; } // LUNA saying no is not YouTube being flaky
    onSecondGo();
    return audioFor(track, onProgress, signal, chain);
  }
  const inMemory = (side, chain = '') => side.tracks.every((t) => { const e = memory.get(keyOf(t, chain)); return e && e.pcm; });

  // ---- sleeve to platter --------------------------------------------------------------
  // opts.clean: why this pull is cut clean although the record is a vintage cut (LUNA is
  // optional: without it the record still plays, and the deck says what happened).
  async function pull(rec, sideIndex = 0, opts = {}) {
    const no = ++pullNo;
    // Fetches for another record are dropped; ones already under way for this record
    // (the side being fetched ahead) carry on and are used.
    if (!stop || stop.signal.aborted || stopFor !== rec.id) {
      if (stop) stop.abort();
      stop = new AbortController(); stopFor = rec.id;
    }
    const signal = stop.signal, side = rec.sides[sideIndex], n = side.tracks.length;
    const wanted = chainOf(rec), v = deck.vintage ? deck.vintage() : { on: false };
    const cleanBecause = opts.clean || (wanted && !v.on ? 'vintage cuts are switched off' : '');
    const chain = cleanBecause ? '' : wanted;
    const doing = chain ? 'Fetching and mastering' : 'Fetching';
    const fetching = (k) => (n > 1 ? { text: `${doing} track ${k} of ${n}`, short: `${chain ? 'Mastering' : 'Fetching'} ${k} of ${n}` } : { text: chain ? 'Fetching the audio and mastering it through LUNA' : 'Fetching the audio', short: chain ? 'Mastering' : 'Fetching' });
    failed = null;
    touched.set(rec.id, Date.now()); // it comes to the front of the shelf
    work = { id: rec.id, sideIndex, ...fetching(1), progress: 0, note: '' };
    deck.hint('');
    deck.changed();
    const t0 = performance.now(), wasInMemory = inMemory(side, chain);
    try {
      await deck.audio();
      const got = new Array(n).fill(0), total = side.tracks.reduce((s, t) => s + (t.seconds || 1), 0);
      let next = 0, done = 0;
      const holders = new Array(n);
      const one = async () => {
        while (next < n) {
          const i = next++, t = side.tracks[i];
          try {
            holders[i] = await audioSurely(t, (f) => { got[i] = f; progress(); }, signal,
              () => { if (no === pullNo && work) { work.note = 'YouTube refused a track once. Trying it again.'; deck.changed('work'); } }, chain);
          } catch (err) {
            if (signal.aborted) throw err;
            const said = String(err.message || err).replace(/^ERROR:\s*/, '');
            if (chain && /LUNA|UA Assistant/.test(said)) { const e = new Error(said); e.noLuna = true; throw e; } // handled below: cut it clean
            throw new Error(unreachable(err) ? 'Cannot reach the Groove Deck server. Is it still running?'
              : `Could not fetch “${t.title}”. YouTube said: ${said}`);
          }
          done++;
          got[i] = 1; progress();
        }
      };
      const progress = () => {
        if (no !== pullNo || !work) return;
        work.progress = 0.9 * side.tracks.reduce((s, t, i) => s + got[i] * (t.seconds || 1), 0) / total;
        Object.assign(work, fetching(Math.min(n, done + 1)));
        deck.changed('work');
      };
      await Promise.all(Array.from({ length: Math.min(FETCH_AT_ONCE, n) }, one));
      if (no !== pullNo) return;
      const fetchMs = performance.now() - t0;
      Object.assign(work, { text: `Cutting side ${side.name}`, short: 'Cutting', progress: 0.9, note: '' }); deck.changed('work');
      const wear = { plays: side.wear.plays.slice(), ticks: side.wear.ticks.map((t) => ({ p: t.p, a: t.a })), dust: dustOf(side), maxTicks: MAX_TICKS };
      const cutT0 = performance.now();
      const cut = await deck.putOnPlatter(
        side.tracks.map((t, i) => ({ title: t.title, artist: t.artist, holder: holders[i] })),
        { format: rec.format, levelDb: rec.cut.levelDb, bassMono: rec.cut.bassMono, autoLevel: true },
        { record: rec, sideIndex, wear, title: rec.title, artist: rec.artist, artUrl: artSrc(rec.artUrl) || null, sideName: side.name },
        (f) => { if (no === pullNo && work) { work.progress = 0.9 + 0.1 * f; deck.changed('work'); } });
      sitting = 0; counted = false; lastDust = wear.dust;
      state.lastPull = { id: rec.id, side: side.name, seconds: cut.stats.seconds, fetchMs, cutMs: performance.now() - cutT0, totalMs: performance.now() - t0, fromMemory: wasInMemory };
      if (no !== pullNo) return;
      work = null;
      deck.changed(); trim();
      // bad news stays on screen until the next message, so a clean fallback is not missed
      if (wanted && cleanBecause) deck.say(`“${rec.title}” is a ${deck.cutName ? deck.cutName(wanted) : 'vintage cut'}, but ${cleanBecause}, so side ${side.name} was cut clean this time. Pull it again to retry.`, true);
      deck.landed(rec);
      fetchAhead(rec, sideIndex, signal, chain);
    } catch (e) {
      if (no !== pullNo) return;
      // LUNA is not there (not running, not installed, or busy with a session of yours):
      // the record still plays, cut clean this once.
      if (e.noLuna && !signal.aborted) {
        const why = /session of yours/.test(e.message) ? 'LUNA has a session of yours open'
          : /not installed|not running|stopped|ECONNREFUSED/.test(e.message) ? 'LUNA was not available'
            : 'LUNA could not master one of its tracks';
        stop.abort(); // cancel the rest of this mastering batch before retrying clean
        return pull(rec, sideIndex, { clean: why });
      }
      work = null;
      if (!signal.aborted) failed = { id: rec.id, sideIndex, text: String(e.message || e) };
      deck.changed();
    }
  }

  // While one side plays, quietly bring in the next, so flipping is only a cut away.
  async function fetchAhead(rec, sideIndex, signal, chain = '') {
    if (rec.sides.length < 2) return;
    const side = rec.sides[(sideIndex + 1) % rec.sides.length];
    try {
      for (const t of side.tracks) {
        if (signal.aborted) return;
        if (held() + (t.seconds || 0) * FS * 4 > MEMORY_BYTES) return; // no room: fetch it when asked
        await audioSurely(t, () => {}, signal, () => {}, chain);
      }
      if (!signal.aborted) deck.changed('facts');
    } catch { /* it will be fetched when the record is flipped */ }
  }

  // ---- pressing -----------------------------------------------------------------------
  // Press a search result and stand it on the shelf. Resolves with the record (the one
  // already there if it was pressed before). Throws if it cannot be done; whoever asked
  // says why.
  function press(kind, item, format, chain = 'clean') {
    const same = has(kind, item.id, format, chain);
    if (same) return Promise.resolve(same);
    const key = `${kind}:${item.id}:${format || ''}:${chain}`;
    if (pressing.has(key)) return pressing.get(key);
    const job = (async () => {
      let rec;
      if (kind === 'album') {
        const album = await shelfApi.album(item.id);
        if (!album.tracks.length) throw new Error('YouTube Music lists no playable tracks for that album.');
        if (!album.art) album.art = item.art || '';
        rec = albumRecord(album, { ...deck.cutSettings(), chain }, format || undefined);
      } else rec = singleRecord(item, { ...deck.cutSettings(), chain }, format || undefined);
      rec = (await shelfApi.save(rec)).record;
      records.push(rec);
      fresh = rec.id;
      const sides = rec.sides.length, what = formatName(rec);
      deck.say(`Pressed “${rec.title}” as ${what === 'LP' ? 'an' : 'a'} ${what}${sides > 1 ? ` with ${sides} sides` : ''}.`);
      deck.changed();
      return rec;
    })().catch((e) => { throw new Error(unreachable(e) ? 'Cannot reach the Groove Deck server. Is it still running?' : String(e.message || e)); })
      .finally(() => pressing.delete(key));
    pressing.set(key, job);
    return job;
  }

  // ---- saving: soon after a change, and on the way out ----------------------------------
  const unsaved = new Set();
  let saveTimer = 0;
  function saveSoon(rec) {
    unsaved.add(rec);
    if (!saveTimer) saveTimer = setTimeout(() => saveNow(false), SAVE_AFTER_MS);
  }
  function saveNow(leaving) {
    clearTimeout(saveTimer); saveTimer = 0;
    for (const rec of unsaved) if (records.includes(rec)) shelfApi.save(rec, leaving).catch((e) => deck.say(`Could not save “${rec.title}”: ${String(e.message || e)}`, true));
    unsaved.clear();
  }
  window.addEventListener('pagehide', () => saveNow(true));

  // ---- wear, as the audio thread reports it ---------------------------------------------
  function ticked(m) {
    const on = state.platter;
    if (!on) return;
    const side = on.record.sides[on.sideIndex];
    side.wear.ticks.push({ p: m.p, a: m.a });
    saveSoon(on.record);
    deck.changed('facts');
    deck.hint(m.count >= MAX_TICKS ? 'That drop left a tick. This side has all the ticks it can take.' : 'That drop left a tick on the record. The outer edge and the cue lever are safe.', 5000);
  }
  function played(m) {
    const on = state.platter;
    if (!on) return;
    const rec = on.record, side = rec.sides[on.sideIndex];
    addPlay(rec, side, m);
    sitting += m.seconds;
    if (!counted && sitting >= PLAY_COUNTS_AFTER_S) {
      counted = true;
      side.plays++; rec.plays++; rec.lastPlayedAt = new Date().toISOString();
    }
    const dust = dustOf(side);
    if (Math.abs(dust - lastDust) > 0.002) setDust(dust);
    saveSoon(rec);
    deck.changed('facts');
  }
  function setDust(dust) {
    lastDust = dust;
    deck.send({ type: 'dust', dust });
    if (state.side && state.side.wear) state.side.wear.dust = dust;
  }

  // ---- what the buttons do ----------------------------------------------------------------
  function brush(rec) {
    clean(rec);
    if (onPlatter(rec)) setDust(0);
    unsaved.add(rec); saveNow(false);
    deck.say(`“${rec.title}” is brushed clean.`);
    deck.changed();
  }
  async function remove(rec) {
    try {
      if (work && work.id === rec.id) letGo();
      if (onPlatter(rec)) await deck.clearPlatter();
      unsaved.delete(rec);
      await shelfApi.remove(rec.id);
      records.splice(records.indexOf(rec), 1);
      if (failed && failed.id === rec.id) failed = null;
      deck.say(`“${rec.title}” is off the shelf.`);
    } catch (e) { deck.say(`Could not remove “${rec.title}”: ${String(e.message || e)}`, true); }
    deck.changed();
  }
  // Stop bringing a record to the platter (something else is going on it, or it was called off).
  function letGo() {
    pullNo++;
    if (stop) stop.abort();
    work = null;
    deck.changed();
  }

  // What the record's card says about it. On the platter, dust is that of the side playing.
  function facts(rec) {
    const dust = onPlatter(rec) ? dustOf(rec.sides[state.platter.sideIndex]) : Math.max(...rec.sides.map((s) => dustOf(s)));
    return {
      pressed: new Date(rec.pressedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
      plays: rec.plays, dust: Math.round(dust * 100), ticks: ticksOn(rec),
    };
  }

  // Resolves once the saved shelf has been read. A shelf that cannot be read says so.
  const loaded = shelfApi.list().then((list) => { records.push(...list); deck.changed(); return true; })
    .catch((e) => { deck.say(unreachable(e) ? 'Cannot reach the Groove Deck server, so the shelf cannot be read. Start it and reload this page.' : `Could not read the shelf: ${String(e.message || e)}`, true); deck.changed(); return false; });

  return {
    records, loaded, order, find, has, onPlatter, inMemory, facts,
    get work() { return work; },
    get failed() { return failed; },
    // The id of a record pressed a moment ago; asking for it uses it up.
    takeFresh() { const id = fresh; fresh = ''; return id; },
    forget() { failed = null; deck.changed(); },
    retry() { const f = failed, rec = f && find(f.id); if (rec) pull(rec, f.sideIndex); },
    press, pull, letGo, brush, remove, ticked, played,
  };
}

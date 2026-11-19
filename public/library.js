// Records you own: what a record is, how an album is split into sides, how dust
// settles, and the calls that keep the shelf on the server.
// Plain data and math with no screen in it, so Node can test it.
import { sideSeconds } from './cutter.js';

// A real 12-inch side tops out around 22 minutes at a normal level.
export const SIDE_LIMIT_S = 22 * 60;
// A song this long or shorter is pressed as a 7-inch; longer ones get a 12-inch at 45.
export const SINGLE_LIMIT_S = 5.5 * 60;
// How long one side may run in each format. A 45 turns faster, so it holds less.
export const SIDE_LIMITS = { '12-33': SIDE_LIMIT_S, '12-45': 15 * 60, '7-45': 6.5 * 60 };

// The formats a search result may be pressed in, and the one it gets unless you choose.
// kind: 'album' or 'single'. Returns { usual, choices: [{ key, label }] }.
export function formatChoices(kind, item) {
  if (kind === 'album') return { usual: '12-33', choices: [{ key: '12-33', label: 'LP, 33⅓' }, { key: '12-45', label: '12-inch, 45' }] };
  const s = item.seconds || 0;
  const choices = [{ key: '7-45', label: '7-inch, 45' }, { key: '12-45', label: '12-inch, 45' }, { key: '12-33', label: '12-inch, 33⅓' }]
    .filter((f) => !s || s <= SIDE_LIMITS[f.key]);
  const usual = s > SINGLE_LIMIT_S ? '12-45' : '7-45';
  return { usual: choices.some((f) => f.key === usual) ? usual : choices[0].key, choices };
}
// Dust: a record left this many days without a clean, or played this long, is fully dusty.
export const DUST_DAYS = 45;
export const DUST_PLAY_S = 3 * 3600;
// A side counts as played once this much of it has been heard in one sitting.
export const PLAY_COUNTS_AFTER_S = 10;

const SIDE_NAMES = 'ABCDEFGHIJKL';

// Split an album's tracks, in order, into sides. Uses the fewest sides that fit (two for
// an LP, four for a double LP, and so on), then moves the breaks to keep the sides even.
// Returns an array of sides, each an array of the tracks given.
export function planSides(tracks, limit = SIDE_LIMIT_S) {
  const n = tracks.length;
  if (n < 2) return n ? [tracks.slice()] : [];
  const len = (i, j) => sideSeconds(tracks.slice(i, j).map((t) => t.seconds || 0)); // tracks i..j-1 as one side
  // best[s][j]: tracks 0..j-1 on s sides; `cost` decides what "best" means
  const split = (sides, cost) => {
    const best = [], cutAt = [];
    for (let s = 0; s <= sides; s++) { best.push(new Array(n + 1).fill(Infinity)); cutAt.push(new Array(n + 1).fill(0)); }
    best[0][0] = 0;
    for (let s = 1; s <= sides; s++) for (let j = s; j <= n; j++) for (let i = s - 1; i < j; i++) {
      if (best[s - 1][i] === Infinity) continue;
      const c = cost(best[s - 1][i], len(i, j));
      if (c < best[s][j]) { best[s][j] = c; cutAt[s][j] = i; }
    }
    const out = [];
    for (let s = sides, j = n; s > 0; s--) { const i = cutAt[s][j]; out.unshift(tracks.slice(i, j)); j = i; }
    return { worst: best[sides][n], sides: out };
  };
  const longest = (sides) => split(sides, (soFar, side) => Math.max(soFar, side)).worst;
  let count = 2;
  while (count < n && count < SIDE_NAMES.length && longest(count) > limit) count++;
  if (count % 2 && count < n) count++; // a second disc has two sides: use both
  // Among the ways to do it without making the longest side any longer, take the most even.
  const cap = longest(count) + 0.001;
  return split(count, (soFar, side) => (side > cap ? Infinity : soFar + side * side)).sides;
}

const newWear = (now) => ({ cleanedAt: now, playedSinceClean: 0, ticks: [], plays: [] });
const newId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const trackOf = (t, fallbackArtist = '') => ({ id: t.id, title: t.title || '', artist: t.artist || fallbackArtist, seconds: Math.round(t.seconds || 0) });

function newRecord(base, sides) {
  const now = new Date().toISOString();
  return {
    id: newId(), ...base, pressedAt: now, lastPlayedAt: '', plays: 0, playedSeconds: 0,
    sides: sides.map((tracks, i) => ({ name: SIDE_NAMES[i], seconds: Math.round(sideSeconds(tracks.map((t) => t.seconds))), plays: 0, tracks, wear: newWear(now) })),
  };
}

// album: what /api/album returns. cut: { levelDb, bassMono, chain }.
// chain is 'clean' or a vintage cut mastered through LUNA on its way to the lathe.
// format: '12-33' (the usual LP) or '12-45' (shorter sides, so more of them).
export function albumRecord(album, cut, format = '12-33') {
  const tracks = album.tracks.map((t) => trackOf(t, album.artist));
  return newRecord({
    kind: 'album', title: album.title, artist: album.artist, year: album.year || '', artUrl: album.art || '',
    source: { albumId: album.id, videoId: '' }, format, cut,
  }, planSides(tracks, SIDE_LIMITS[format] || SIDE_LIMIT_S));
}

// song: one search result.
// song: one search result. format: one of formatChoices('single', song); the usual one if not given.
export function singleRecord(song, cut, format = formatChoices('single', song).usual) {
  return newRecord({
    kind: 'single', title: song.title, artist: song.artist || '', year: song.year || '', artUrl: song.art || song.thumb || '',
    source: { albumId: '', videoId: song.id }, format, cut,
  }, [[trackOf(song)]]);
}

// How dusty a side is, 0..1, from how long since it was cleaned and how much it has played.
export function dustOf(side, now = Date.now()) {
  const w = side.wear;
  const days = Math.max(0, (now - Date.parse(w.cleanedAt)) / 86400000);
  return Math.min(1, days / DUST_DAYS + (w.playedSinceClean || 0) / DUST_PLAY_S);
}

export function clean(record, now = new Date().toISOString()) {
  for (const s of record.sides) { s.wear.cleanedAt = now; s.wear.playedSinceClean = 0; }
}

// Fold a report from the audio thread into a side: plays per revolution and playing time.
export function addPlay(record, side, report) {
  const plays = side.wear.plays;
  while (plays.length < report.from + report.add.length) plays.push(0);
  report.add.forEach((x, i) => { plays[report.from + i] = Math.round((plays[report.from + i] + x) * 1000) / 1000; });
  side.wear.playedSinceClean = (side.wear.playedSinceClean || 0) + report.seconds;
  record.playedSeconds = (record.playedSeconds || 0) + report.seconds;
}

export const ticksOn = (record) => record.sides.reduce((n, s) => n + s.wear.ticks.length, 0);
export function formatName(record) {
  if (record.kind !== 'album') return record.format === '7-45' ? '7-inch single' : record.format === '12-45' ? '12-inch single' : '12-inch single at 33⅓';
  const discs = Math.ceil(record.sides.length / 2);
  const set = discs < 2 ? 'LP' : discs === 2 ? 'double LP' : discs === 3 ? 'triple LP' : `${discs}-LP set`;
  return record.format === '12-45' ? `${set} at 45` : set;
}

// Art goes through the server so the page may draw it on the label. '' if there is none.
export const artSrc = (url) => (url && /^https:\/\/[^/]*(googleusercontent\.com|ytimg\.com|ggpht\.com)\//.test(url) ? `/api/art?u=${encodeURIComponent(url)}` : '');

// ---- the shelf on the server ----------------------------------------------------------
async function call(path, options) {
  const res = await fetch(path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'the server refused');
  return data;
}
export const shelfApi = {
  list: async () => (await call('/api/library')).records,
  save: (record, keepalive = false) => call('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record), keepalive }),
  remove: (id) => call(`/api/library/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  album: (id) => call(`/api/album?id=${encodeURIComponent(id)}`),
};

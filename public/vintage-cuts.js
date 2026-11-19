// The vintage cuts: the UA plugin chains a track is mastered through in LUNA before it is cut.
// Plain data shared by the server (luna.js, which drives LUNA from outside through ua-mcp) and
// the LUNA Add On (addons/luna/master.js, which works inside the open session through the SDK).
// A step's control names are LUNA's param ids, the same in both routes.
//
// ---- the cuts -------------------------------------------------------------------------
// Each step is a plugin and the controls to move, as positions from 0 to 1. A control with
// a few fixed positions (speeds, tape types) takes index / (positions - 1). `expect` is the
// text LUNA should show for that control afterwards, so a wrong guess is caught, not heard.
// These settings were chosen by reasoning and by measuring, not by ear: tune them here.
//
// Where a cut sets `level`, it is how loud the mix is made as it meets the chain, in dB of full scale (its
// loudness as levelOf measures it). Tape and a compressor both answer to level, so without it a
// quiet mix came through untouched and a loud one was squashed: the same cut, two sounds.
// `gain` is the control that does it: [step, control], one that shows decibels. Here it is the
// tape machine's record level, with its Auto Gain off so that the level it sets carries on down
// the chain (on, the machine turns its output back the other way).
//
// `dials` are what the Add On lets the user turn, each from -1 through 0 (the cut as written
// here) to +1. A dial either moves `level` by up to `db` decibels, or moves controls:
// [step, control, at -1, at 0, at +1], a straight line from each to the next.
const third = 1 / 3;
export const CUTS = {
  clean: { name: 'Clean modern cut', about: 'Straight to the lathe.', chain: [] },
  sixties: {
    name: '1960s tube cut',
    about: 'Ampex ATR-102 tape, Pultec EQP-1A and Fairchild 670.',
    level: -18, gain: [0, 'l_rec_level'],
    chain: [
      { plugin: 'uaudio_ampex_atr-102_tape', set: [['ips', 2 * third, '15 IPS'], ['tape_type', 0, '250'], ['head_width', 0, '1/4'], ['cal_level', 0, '+3 dB'], ['auto_gain', 0, 'Off']] },
      // No treble boost: a boost and a cut both at 10 kc mostly undid each other.
      { plugin: 'uaudio_pultec_eqp-1a', set: [['low_freq', 2 * third, '60 CPS'], ['lf_boost', 0.2], ['lf_atten', 0], ['high_freq', 4 / 6, '10 KCS'], ['hf_boost', 0], ['hf_atten_freq', 0.5, '10 KCS'], ['hf_atten', 0.2]] },
      // Lateral/vertical, the two sides unlinked (linked, the vertical side only ever follows
      // the lateral), and the vertical side (the right-hand controls) held harder, as a cutting
      // engineer kept the groove from going too deep or lifting the stylus out.
      // Measured in LUNA on music at this cut's level: the lateral threshold at 0.12 holds the
      // middle about 2 dB (0.2 holds it 6.5, and the 0.3 this cut once had, 10); the vertical at
      // 0.5 holds a side signal 12 dB under the middle about 3 dB (0.8, about 5.5).
      { plugin: 'uaudio_fairchild_670', set: [['agc_matrix', 1, 'L-V'], ['ctrl_link', 0, 'Unlink'], ['sc_link', 0, 'Unlink'], ['l_thresh', 0.12], ['r_thresh', 0.5], ['l_timecnst', 2 / 5, '3'], ['r_timecnst', 2 / 5, '3']] },
    ],
    dials: [
      { key: 'drive', name: 'Drive', about: 'How hard the mix hits the tape and the compressor.', db: 6 },
      { key: 'bass', name: 'Bass', about: 'The Pultec’s low shelf at 60 cycles, about 3 dB either way.', sets: [[1, 'lf_boost', 0, 0.2, 0.36], [1, 'lf_atten', 0.33, 0, 0]] },
      { key: 'top', name: 'Top', about: 'Darker rolls more off the top; brighter lifts 10 kc.', sets: [[1, 'hf_atten', 0.5, 0.2, 0], [1, 'hf_boost', 0, 0, 0.3]] },
      { key: 'squeeze', name: 'Compression', about: 'How much the Fairchild holds the level.', sets: [[2, 'l_thresh', 0, 0.12, 0.2], [2, 'r_thresh', 0, 0.5, 0.8]] },
    ],
  },
  // 15 ips, not 30: measured on a loud rock master, the ATR-102 at 30 ips on 456 lifted
  // everything above 8 kHz by about 4.6 dB and thinned the bass, which made the cut bright and
  // hot. At 15 ips it is close to flat with a little low-end weight, and the Pultec adds a
  // touch of bass and rolls the very top off gently (about +0.7 dB below 80 Hz, -0.5 dB above 8 kHz).
// Its level is higher than the 1960s cut's because the tape is all it has: measured in LUNA,
// 456 at 15 ips is clean with music at -18, holds it about half a dB at -14, 1 dB at -12 and
// nearly 3 at -8, which is the run of the Drive dial.
  seventies: {
    name: '1970s tape cut',
    about: 'Ampex ATR-102 half-inch tape and Pultec EQP-1A. No limiter.',
    level: -14, gain: [0, 'l_rec_level'],
    chain: [
      { plugin: 'uaudio_ampex_atr-102_tape', set: [['ips', 2 * third, '15 IPS'], ['tape_type', third, '456'], ['head_width', 0.5, '1/2'], ['auto_gain', 0, 'Off']] },
      { plugin: 'uaudio_pultec_eqp-1a', set: [['low_freq', 2 * third, '60 CPS'], ['lf_boost', 0.15], ['lf_atten', 0], ['high_freq', 5 / 6, '12 KCS'], ['hf_boost', 0], ['hf_atten_freq', 1, '20 KCS'], ['hf_atten', 0.25]] },
    ],
    dials: [
      { key: 'drive', name: 'Drive', about: 'How hard the mix hits the tape.', db: 6 },
      { key: 'bass', name: 'Bass', about: 'The Pultec’s low shelf at 60 cycles, about 3 dB either way.', sets: [[1, 'lf_boost', 0, 0.15, 0.36], [1, 'lf_atten', 0.33, 0, 0]] },
      { key: 'top', name: 'Top', about: 'Darker rolls more off the top; brighter lifts 12 kc.', sets: [[1, 'hf_atten', 0.55, 0.25, 0], [1, 'hf_boost', 0, 0, 0.3]] },
    ],
  },
  studio: {
    name: 'Studio Tape',
    about: 'Vibe Analog Machines Essentials, Sweeten setting.',
    chain: [
      { plugin: 'uaudio_verve_essentials', set: [['machine', 2 * third, 'SWEETEN'], ['param1', 0.4]] },
    ],
    dials: [
      { key: 'drive', name: 'Drive', about: 'How much tape saturation Sweeten adds.', sets: [[0, 'param1', 0.2, 0.4, 0.6]] },
    ],
  },
};
export const cutList = () => Object.entries(CUTS).map(([key, c]) => ({ key, name: c.name, about: c.about, needsLuna: c.chain.length > 0 }));

// ---- a cut with its dials turned ----------------------------------------------------------
// dials: { key: position from -1 to 1 }; a dial not named sits at 0. Resolves to the cut's chain
// with the dialled controls moved (the same shape as `chain`, so anything that loads one loads this).
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const along = (p, lo, mid, hi) => (p < 0 ? mid + (mid - lo) * p : mid + (hi - mid) * p);
const position = (dials, key) => clamp(Number(dials && dials[key]) || 0, -1, 1);
export function chainFor(cut, dials = {}) {
  const chain = cut.chain.map((step) => ({ plugin: step.plugin, set: step.set.map((c) => [...c]) }));
  for (const dial of cut.dials || []) for (const [at, control, lo, mid, hi] of dial.sets || []) {
    const c = chain[at].set.find((x) => x[0] === control);
    if (c) c[1] = clamp(along(position(dials, dial.key), lo, mid, hi), 0, 1);
  }
  return chain;
}
// The level the mix should meet the chain at, with its level dials turned.
export function levelFor(cut, dials = {}) {
  let db = cut.level;
  for (const dial of cut.dials || []) if (dial.db) db += dial.db * position(dials, dial.key);
  return db;
}

// ---- level -----------------------------------------------------------------------------------
// How loud interleaved stereo 16-bit audio is: { db, peakDb } in dB of full scale. `db` is the
// level of the music itself, from 0.4 s blocks: blocks 10 dB or more under the loud ones
// (silence, fades, a quiet intro) are left out, so a gap does not make a mix look quieter.
export function levelOf(pcm, FS = 48000) {
  const block = Math.round(0.4 * FS) * 2, powers = [];
  let peak = 0;
  for (let i = 0; i < pcm.length; i += block) {
    const end = Math.min(pcm.length, i + block);
    let sum = 0;
    for (let j = i; j < end; j++) { const v = pcm[j] / 32768; sum += v * v; if (v > peak) peak = v; else if (-v > peak) peak = -v; }
    if (end - i >= block / 4) powers.push(sum / (end - i));
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const heard = powers.filter((p) => p > 1e-7); // above -70 dB
  const kept = heard.filter((p) => p > mean(heard) / 10);
  const power = mean(kept.length ? kept : heard);
  return { db: power > 0 ? 10 * Math.log10(power) : -Infinity, peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity };
}
// The gain, in dB, that brings a mix measured by levelOf to `target`. It never lifts a peak past
// full scale, and stays within what the tape machine's record level takes.
export const GAIN_RANGE = [-24, 9.5];
export function gainTo(level, target) {
  if (!Number.isFinite(level.db)) return 0;
  return clamp(Math.min(target - level.db, -level.peakDb), GAIN_RANGE[0], GAIN_RANGE[1]);
}
// Bring a mastered cut back to the loudness the mix had, so a cut is chosen for its colour and
// not for being louder or quieter. Never past full scale. Changes `pcm` in place; returns the dB.
export function matchLevel(pcm, level, FS = 48000) {
  const now = levelOf(pcm, FS);
  if (!Number.isFinite(now.db) || !Number.isFinite(level.db)) return 0;
  const db = Math.min(level.db - now.db, -0.15 - now.peakDb);
  const g = 10 ** (db / 20);
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * g)));
  return db;
}

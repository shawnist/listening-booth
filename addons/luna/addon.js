// The LUNA Add On's own part of the turntable page (index.html, generated from public/index.html).
// The deck, its Workbench and View panels are the web app's own (public/app.js, which sees
// <html data-host="luna">). This adds where the audio comes from in LUNA: a file from this Mac,
// or the open session rendered through its Main Output, optionally mastered through a vintage
// cut's UA plugins, then cut to a record and played on the Dual 1229.
//
// What is on screen, and when:
//   - the top bar, as the web app has it, with Load a file… and Render this session at its left;
//   - the record card, top left: the one place for the record in every state (nothing on the
//     platter, pressing with its steps and Cancel, playing with Press again, the session changed
//     since it was pressed, a press that failed with Try again);
//   - the camera bar, top right: Seated, Top, Stylus, a reset when you have turned or zoomed the
//     camera, and X-ray. It fades when the mouse is idle and steps aside for the Workbench;
//   - the Press dialog, only while choosing; it closes when you press and the card takes over;
//   - the Workbench and View panels slide in over the deck without shrinking it.
// A window under 900 px wide moves the volume into the Workbench and shows icons only on the camera bar.
import { CUTS, chainFor, levelFor, levelOf, gainTo, matchLevel } from '../../public/vintage-cuts.js';
import { renderMix, masterCut, readAudio, decodeToPcm } from './master.js';

const ADD_ON_ID = 'com.shawnist.groove-deck';
const FS = 48000;
const SMALL_W = 900; // narrower than this is a small window
const IDLE_MS = 3000; // the camera bar fades after this long without the mouse moving
const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, kids = []) => { const n = Object.assign(document.createElement(tag), props); for (const k of kids) n.append(k); return n; };
const svg = (paths) => { const n = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); n.setAttribute('viewBox', '0 0 24 24'); n.setAttribute('class', 'ico'); n.setAttribute('aria-hidden', 'true'); n.innerHTML = paths; return n; };
const GD = () => window.GD;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const message = (e) => (e && e.message ? e.message : String(e));
const typing = () => /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;

// ---- the bar: where the audio comes from ------------------------------------------------------
// Every pressing choice (the vintage cut and its dials, the record, the cut level, mono bass) lives in one place:
// the Press dialog, opened by "Render this session" and by a file loaded or dropped.
const fileInput = el('input', { type: 'file', accept: '.wav,.mp3,.aif,.aiff,.flac,.m4a,audio/*', hidden: true });
const fileBtn = el('button', { type: 'button', textContent: 'Load a file…', title: 'Press a record from an audio file on your Mac, or drop a file on the deck' });
const renderBtn = el('button', { type: 'button', className: 'primary', textContent: 'Render this session', title: 'Open a session in LUNA first', disabled: true });
$('.topbar .brand').after(el('div', { className: 'addon-bar' }, [fileBtn, fileInput, renderBtn]));
// what is happening, for a screen reader (the card shows it)
const live = el('span', { className: 'addon-sr', role: 'status' });
document.body.append(live);
const say = (text) => { live.textContent = text; };

// ---- what is going on --------------------------------------------------------------------------
let luna = null, session = null;
let lunaState = window.Luna ? 'connecting' : 'none'; // 'none' (a plain browser), 'connecting', 'ok', 'unreachable'
let busy = false; // a press is under way
// the press under way, or the one that failed: { title, step, frac, cancel (an AbortController, or null once it can no longer stop) }
let work = null;
let failed = null; // { title, error, retry }
// the record on the platter, as pressed here: { side, title, cutKey, format, source, sessionUid, changeAt }
let pressed = null;

// ---- the Press dialog ------------------------------------------------------------------------
const FORMATS = [['7-45', '7″ single', '45 rpm', 4.5 * 60], ['12-33', '12″ LP', '33⅓ rpm', 22 * 60], ['12-45', '12″ maxi', '45 rpm', 15 * 60]]; // what a side holds at a normal level, roughly
const FREE_PLUGINS = 'Free Plugins';
const PAID_PLUGINS = 'Paid Plugins';
const SPARK_SIGNUP = 'https://www.uaudio.com/pages/uad-spark-signup';
const CUT_LABEL = {
  clean: ['Clean', 'Straight to the lathe', 'No plugins'],
  studio: [CUTS.studio.name, 'Vibe Essentials · Sweeten', FREE_PLUGINS],
  sixties: ['1960s tube', 'Tape, Pultec, Fairchild', PAID_PLUGINS],
  seventies: ['1970s tape', 'Half-inch tape, soft top', PAID_PLUGINS],
};
const cutLabel = (k) => (CUT_LABEL[k] || [CUTS[k] ? CUTS[k].name : k])[0];
const store = {
  get(k, dflt) { try { const v = localStorage.getItem(`gd.addon.${k}`); return v === null ? dflt : v; } catch { return dflt; } },
  set(k, v) { try { localStorage.setItem(`gd.addon.${k}`, String(v)); } catch { /* not remembered */ } },
};
const choice = { cut: store.get('cut', 'clean'), format: store.get('format', '7-45'), level: Number(store.get('level', 0)), bassMono: store.get('bassMono', 'yes') === 'yes' };
if (!CUTS[choice.cut]) choice.cut = 'clean';
if (!FORMATS.some(([k]) => k === choice.format)) choice.format = '7-45';

// a set of choices drawn as cards: a name, a line of detail and an optional pill
function options(items, current, onPick, label) {
  const row = el('div', { className: 'press-opts', role: 'radiogroup', ariaLabel: label });
  const draw = (v) => { for (const b of row.children) b.setAttribute('aria-checked', String(b.dataset.v === v)); };
  for (const [v, name, sub, pill] of items) {
    const children = [el('b', { textContent: name }), el('small', { textContent: sub })];
    if (pill) children.push(el('span', { className: 'press-pill', textContent: pill }));
    const b = el('button', { type: 'button', role: 'radio' }, children);
    b.dataset.v = v;
    b.addEventListener('click', () => { draw(v); onPick(v); });
    row.append(b);
  }
  draw(current);
  return { node: row, set: draw };
}

const cutKeys = [...new Set([...Object.keys(CUT_LABEL), ...Object.keys(CUTS)])].filter((k) => CUTS[k]);
const cutItems = cutKeys.map((k) => [k, ...(CUT_LABEL[k] || [CUTS[k].name, ''])]);
// Overlap the variants so the longest one determines the height at this window width.
function showPressVariant(stack, current) {
  for (const child of stack.children) child.classList.toggle('current', child === current);
}
function sparkLink() {
  const link = el('a', { className: 'press-spark', href: SPARK_SIGNUP, target: '_blank', rel: 'noopener noreferrer', ariaLabel: 'UAD Spark Studio (opens in your browser)' }, [
    'UAD Spark Studio ', el('span', { ariaHidden: 'true', textContent: '↗' }),
  ]);
  link.addEventListener('click', async (event) => {
    if (!window.lunaAPI || !luna?.gui) return;
    event.preventDefault();
    try { await luna.gui.openUrl(SPARK_SIGNUP); }
    catch { say('Could not open UAD Spark Studio.'); }
  });
  return link;
}
function cutNote(key) {
  const note = el('p', { className: 'press-note' });
  const cut = CUTS[key];
  if (!cut.chain.length) {
    note.textContent = 'Cut straight from the mix, with no mastering.';
    return note;
  }
  note.append(cut.about);
  const pill = CUT_LABEL[key]?.[2];
  if (pill === FREE_PLUGINS) note.append(' Included in UAD Explore FREE.');
  if (pill === PAID_PLUGINS) note.append(' Available with ', sparkLink(), '.');
  note.append(' Runs on a temporary track in your session.');
  return note;
}
const cutNotes = Object.fromEntries(cutKeys.map((key) => [key, cutNote(key)]));
const fileNote = el('p', { className: 'press-note', textContent: 'A file is cut clean. The mastering presets are available when you render a LUNA session.' });
const cutAbout = el('div', { className: 'press-stack' }, [...Object.values(cutNotes), fileNote]);
const cutRow = options(cutItems, choice.cut, (v) => { choice.cut = v; store.set('cut', v); drawCut(); }, 'Mastering');
cutRow.node.classList.add('press-cuts');
const cutFor = () => (pending && pending.kind === 'file' ? 'clean' : choice.cut); // a file is always cut clean
// The dials of a vintage cut (CUTS[k].dials), kept out of sight until Mastering controls opens: a cut is
// picked by its era, and turned only by someone who means to. Each is a slider of DIAL_STEPS
// either side of 0, the cut as it is written; what is turned is remembered for that cut.
const DIAL_STEPS = 5;
const turned = {}; // { cut: { dial: steps } }, only dials off 0
for (const k of Object.keys(CUTS)) {
  turned[k] = {};
  try { for (const [d, v] of Object.entries(JSON.parse(store.get(`dials.${k}`, '{}')))) if ((CUTS[k].dials || []).some((x) => x.key === d) && Number.isInteger(v) && v && Math.abs(v) <= DIAL_STEPS) turned[k][d] = v; } catch { /* as written */ }
}
const dialsOf = (k) => Object.fromEntries(Object.entries(turned[k] || {}).map(([d, v]) => [d, v / DIAL_STEPS])); // as chainFor and levelFor take them
const isTurned = (k) => Object.keys(turned[k] || {}).length > 0;
const signed = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : 'As the era');
let dialsOpen = false;
const adjustBtn = el('button', { type: 'button', className: 'press-disclosure-trigger', ariaExpanded: 'false' }, [
  'Mastering controls', el('span', { className: 'press-chevron', ariaHidden: 'true' }),
]);
adjustBtn.setAttribute('aria-controls', 'press-mastering-dials');
const dialReset = el('button', { type: 'button', className: 'press-reset', textContent: 'Reset to preset' });
function buildDialGrid(key) {
  const rows = CUTS[key].dials.map((d) => {
    const out = el('output', { textContent: signed(turned[key][d.key] || 0) });
    const input = el('input', { type: 'range', min: String(-DIAL_STEPS), max: String(DIAL_STEPS), step: '1', value: String(turned[key][d.key] || 0), ariaLabel: d.name });
    input.addEventListener('input', () => {
      const v = Number(input.value);
      if (v) turned[key][d.key] = v; else delete turned[key][d.key];
      store.set(`dials.${key}`, JSON.stringify(turned[key]));
      out.textContent = signed(v);
      dialReset.disabled = !isTurned(key);
    });
    input.addEventListener('dblclick', () => { input.value = '0'; input.dispatchEvent(new Event('input')); });
    return el('label', { className: 'press-dial', title: d.about || '' }, [el('span', {}, [el('b', { textContent: d.name }), out]), input]);
  });
  return el('div', { className: 'press-dial-grid' }, rows);
}
const dialGrids = Object.fromEntries(cutKeys.filter((key) => CUTS[key].dials?.length).map((key) => [key, buildDialGrid(key)]));
const emptyDials = el('p', { className: 'press-empty-dials', textContent: 'Clean has no mastering controls.' });
const dialStack = el('div', { className: 'press-stack' }, [...Object.values(dialGrids), emptyDials]);
const dialBox = el('div', { id: 'press-mastering-dials', className: 'press-dials', hidden: true, role: 'group', ariaLabel: 'Mastering dials' }, [dialStack, dialReset]);
const disclosure = el('div', { className: 'press-disclosure' }, [adjustBtn, dialBox]);
function drawDials(key) {
  const grid = dialGrids[key];
  adjustBtn.disabled = !grid && !dialsOpen;
  adjustBtn.ariaExpanded = String(dialsOpen);
  dialBox.hidden = !dialsOpen;
  dialReset.classList.toggle('unavailable', !grid);
  dialReset.disabled = !grid || !isTurned(key);
  showPressVariant(dialStack, grid || emptyDials);
}
adjustBtn.addEventListener('click', () => {
  dialsOpen = !dialsOpen;
  drawDials(cutFor());
  if (adjustBtn.disabled) cutRow.node.querySelector('[aria-checked="true"]').focus();
});
dialReset.addEventListener('click', () => {
  const key = cutFor();
  turned[key] = {};
  store.set(`dials.${key}`, '{}');
  const grid = dialGrids[key];
  for (const input of grid.querySelectorAll('input')) input.value = '0';
  for (const out of grid.querySelectorAll('output')) out.textContent = signed(0);
  dialReset.disabled = true;
});
function drawCut() {
  const key = cutFor();
  cutRow.set(key);
  drawDials(key);
  showPressVariant(cutAbout, pending?.kind === 'file' ? fileNote : cutNotes[key]);
}
const formatRow = options(FORMATS.map(([k, name, rpm, holds]) => [k, name, `${rpm} · ${mmss(holds)} a side`]), choice.format, (v) => { choice.format = v; store.set('format', v); drawFit(); }, 'Record');
const levelOut = el('output');
const level = el('input', { type: 'range', min: '-6', max: '6', step: '1', value: String(choice.level), ariaLabel: 'Cut level' });
const drawLevel = () => { levelOut.textContent = `${choice.level > 0 ? '+' : ''}${choice.level} dB`; };
level.addEventListener('input', () => { choice.level = Number(level.value); store.set('level', choice.level); drawLevel(); });
const bass = el('input', { type: 'checkbox', checked: choice.bassMono });
bass.addEventListener('change', () => { choice.bassMono = bass.checked; store.set('bassMono', bass.checked ? 'yes' : 'no'); });
const fitNotes = FORMATS.map(() => el('p', { className: 'press-note' }));
const fit = el('div', { className: 'press-stack' }, fitNotes);
function drawFit() {
  const seconds = pending?.seconds;
  FORMATS.forEach(([key, name, , holds], index) => {
    const note = fitNotes[index];
    const long = seconds > holds;
    note.textContent = seconds
      ? (long ? `${mmss(seconds)} of audio is more than a ${name} side holds at a normal level, so it is cut quieter to fit.` : `${mmss(seconds)} of audio fits a ${name} side.`)
      : 'A side longer than this holds is cut quieter to fit.';
    note.classList.toggle('warn', long);
    note.classList.toggle('current', key === choice.format);
  });
}

const pressFrom = el('p', { className: 'press-from' });
const cancelBtn = el('button', { type: 'button', textContent: 'Cancel' });
const goBtn = el('button', { type: 'button', className: 'primary', textContent: 'Press' });
const dialog = el('div', { className: 'press-scrim', hidden: true }, [
  el('section', { className: 'press', role: 'dialog', ariaModal: 'true', ariaLabel: 'Press a record' }, [
    el('header', {}, [el('h2', { textContent: 'Press a record' }), pressFrom]),
    el('div', { className: 'press-field' }, [el('span', { className: 'press-label', textContent: 'Mastering' }), cutRow.node, cutAbout, disclosure]),
    el('div', { className: 'press-field' }, [el('span', { className: 'press-label', textContent: 'Record' }), formatRow.node, fit]),
    el('label', { className: 'press-field press-level' }, [el('span', { className: 'press-label' }, ['Cut level ', levelOut]), level]),
    el('label', { className: 'press-check' }, [bass, 'Fold the bass to mono, as a lacquer is cut']),
    el('footer', {}, [cancelBtn, goBtn]),
  ]),
]);
document.body.append(dialog);
drawLevel();

// what the dialog is about to press: { kind: 'session' } or { kind: 'file', file, pcm, seconds }
let pending = null;
function openPress(what) {
  if (busy) return;
  pending = what;
  dialsOpen = false; // the dials are asked for each time
  pressFrom.textContent = what.kind === 'session' ? `From “${session.name.value}”, rendered through its Main Output` : `From ${what.file.name} · ${mmss(what.seconds)}`;
  for (const b of cutRow.node.querySelectorAll('button')) b.disabled = what.kind === 'file' && CUTS[b.dataset.v].chain.length > 0;
  drawCut(); drawFit();
  dialog.hidden = false;
  goBtn.focus();
  wake();
}
function closePress() { dialog.hidden = true; pending = null; }
cancelBtn.addEventListener('click', closePress);
dialog.addEventListener('click', (e) => { if (e.target === dialog) closePress(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dialog.hidden) { e.preventDefault(); e.stopPropagation(); closePress(); } }, true);

// Press: the dialog closes at once and the record card shows each step.
goBtn.addEventListener('click', () => { if (pending) press(pending); });
async function press(what) {
  if (busy) return;
  const cut = CUTS[cutFor()] || CUTS.clean, cutKey = cutFor(), format = choice.format;
  const dials = dialsOf(cutKey);
  const pressing = what.kind === 'session' ? session : null;
  const title = what.kind === 'session' ? session.name.value : what.file.name.replace(/\.[^.]+$/, '');
  closePress();
  busy = true; failed = null; setBusy();
  // the steps the card ticks off: a session is rendered, mastered when the cut has a chain, then cut
  const stages = what.kind !== 'session' ? [] : [['render', 'Render the mix'], ...(cut.chain.length ? [['master', `Master · ${cutLabel(cutKey)}`]] : []), ['cut', 'Cut the lacquer']];
  work = { title, step: 'Starting…', frac: undefined, cancel: new AbortController(), stages, stage: stages.length ? 'render' : 'cut' };
  const step = (text, frac, stage = work.stage) => { work.step = text; work.frac = frac; work.stage = stage; say(text); drawCard(); };
  const signal = work.cancel.signal;
  try {
    let pcm, artist, source = null; // source: what File plays, when it is not what was cut
    if (what.kind === 'session') {
      artist = cut.chain.length ? cut.name : 'LUNA session';
      step('Rendering through the Main Output…', 0);
      let file = await renderMix(luna, pressing, { signal, onProgress: (f) => step('Rendering through the Main Output…', f * (cut.chain.length ? 0.4 : 0.8)) });
      const silent = 'The render is silent: is anything playing through the Main Output?';
      let level = null; // how loud the mix is, when a cut is to master it
      if (cut.chain.length) {
        // Measure the mix for output loudness matching and for cuts that set an input level.
        step(`${cutLabel(cutKey)} · measuring the mix…`, 0.4, 'master');
        const mix = await readAudio(luna, ADD_ON_ID, file);
        if (signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
        level = levelOf(mix.pcm, FS);
        source = mix.pcm; // File plays the mix as it left LUNA, before the cut mastered it (owner, 2026-11-19)
        if (!Number.isFinite(level.db)) throw new Error(silent);
        let n = 0;
        const gainDb = cut.gain ? gainTo(level, levelFor(cut, dials)) : 0;
        file = (await masterCut(luna, pressing, file, { ...cut, chain: chainFor(cut, dials) }, { signal, gainDb, onStep: (m) => step(`${cutLabel(cutKey)} · ${m.toLowerCase()}…`, 0.4 + 0.4 * Math.min(1, ++n / (cut.chain.length + 2))) })).file;
      }
      step('Reading the render…', 0.8);
      ({ pcm } = await readAudio(luna, ADD_ON_ID, file));
      if (signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
      if (!pcm.some((v) => v !== 0)) throw new Error(silent);
      // back to the loudness the mix had: a cut is chosen for its colour, not for being louder
      if (level) matchLevel(pcm, level, FS);
    } else {
      artist = ''; // a file's record carries just its name, no "From a file" (owner, 2026-11-19)
      ({ pcm } = what);
    }
    if (!GD() || !GD().press) throw new Error('The deck has not started yet.');
    // From here the record is being cut: it cannot be stopped half way.
    work.cancel = null;
    const base = what.kind === 'session' ? 0.8 : 0;
    step('Cutting the lacquer…', base, 'cut');
    const side = await GD().press({ title, artist, pcm, source }, { format, levelDb: choice.level, bassMono: choice.bassMono, onProgress: (f) => step('Cutting the lacquer…', base + (1 - base) * f, 'cut') });
    pressed = {
      side, title, cutKey, format,
      source: what.kind === 'session' ? { kind: 'session' } : { kind: 'file', file: what.file },
      sessionUid: pressing ? pressing.uid : null,
      // what LUNA has counted as edits by now: our own temporary track has come and gone, so a later count is the user's
      changeAt: pressing ? changes(pressing) : null,
    };
    say(`${title} is on the platter.`);
  } catch (e) {
    if (e && e.name === 'AbortError') say('Pressing cancelled.');
    else { failed = { title, error: message(e).replace(/^\w/, (c) => c.toUpperCase()), retry: what.kind === 'file' ? { kind: 'file', file: what.file } : { kind: 'session' } }; say(`Could not press it: ${failed.error}`); }
  } finally {
    busy = false; work = null; setBusy(); drawCard();
  }
}
function setBusy() {
  fileBtn.disabled = busy;
  renderBtn.disabled = busy || !session;
}
const changes = (s) => { const v = s && s.changeCount ? s.changeCount.value : undefined; return typeof v === 'number' ? v : null; };

// Press again, or Try again: the dialog again, for the same kind of source.
async function pressAgain(src) {
  if (busy) return;
  if (src && src.kind === 'file' && src.file) return fromFile(src.file);
  if (session) return openPress({ kind: 'session' });
  fileInput.click();
}

// ---- the record card, top left ----------------------------------------------------------------
const disc = el('span', { className: 'rc-disc', ariaHidden: 'true' });
const cTitle = el('b');
const cDot = el('span', { className: 'rc-dot', title: 'The session has changed since this record was pressed', hidden: true });
const cSub = el('small');
const cProg = el('div', { className: 'rc-prog' }, [el('i')]);
const cSteps = el('ol', { className: 'rc-steps', hidden: true }); // a press's steps, ticked off as they finish (owner, 2026-11-19)
const cActs = el('div', { className: 'rc-acts' });
const card = el('section', { className: 'addon-card', ariaLabel: 'The record' }, [
  el('div', { className: 'rc-top' }, [disc, el('div', { className: 'rc-t' }, [el('div', { className: 'rc-title' }, [cTitle, cDot]), cSub])]),
  cSteps, cProg, cActs,
]);
let stepsOf = null; // the press the list was drawn for
function drawSteps() {
  const list = work && work.stages.length > 1 ? work.stages : null;
  cSteps.hidden = !list;
  if (!list) { stepsOf = null; return; }
  if (stepsOf !== work) { stepsOf = work; cSteps.replaceChildren(...list.map(([k, text]) => { const li = el('li', { textContent: text }); li.dataset.k = k; return li; })); }
  const at = list.findIndex(([k]) => k === work.stage);
  [...cSteps.children].forEach((li, i) => { li.className = i < at ? 'done' : i === at ? 'now' : ''; });
}
// While a press waits on LUNA (a render reports little or nothing) the bar shimmers, so it never
// looks stalled: after a second without the progress moving.
let lastFrac, fracAt = 0;
document.body.append(card);

let acts = '';
function setActs(key, list) {
  if (acts === key) return;
  acts = key;
  cActs.replaceChildren(...list.map(([label, cls, fn]) => { const b = el('button', { type: 'button', textContent: label, className: cls }); b.addEventListener('click', fn); return b; }));
}
// where the stylus is on the side: "A1 1:24 / 4:07", and how far through the track
function where(side, p) {
  const tr = side.tracks || [];
  if (!tr.length) return { text: '', frac: 0 };
  let i = tr.findIndex((t) => p >= t.start && p < t.end);
  if (i < 0 && p >= tr[tr.length - 1].end) return { text: 'run-out', frac: 1 };
  const before = i < 0; if (before) i = tr.findIndex((t) => p < t.start); if (i < 0) i = 0;
  const t = tr[i], len = (t.end - t.start) / FS, at = before ? 0 : (p - t.start) / FS;
  return { text: `${side.sideName || 'A'}${i + 1} ${mmss(at)} / ${mmss(len)}`, frac: len ? at / len : 0 };
}
function drawCard() {
  const g = GD(), side = g && g.side;
  let mode, title = '', sub = '', err = false, frac, dot = false;
  if (work) {
    mode = 'pressing'; title = `Pressing “${work.title}”`; sub = work.step; frac = work.frac;
    setActs(work.cancel ? 'cancel' : 'none', work.cancel ? [['Cancel', 'quiet', () => { if (work && work.cancel) { work.cancel.abort(); work.step = 'Cancelling…'; drawCard(); } }]] : []);
  } else if (failed) {
    mode = 'failed'; title = `Could not press “${failed.title}”`; sub = failed.error; err = true;
    setActs('failed', [['Try again', 'primary', () => { const r = failed.retry; failed = null; drawCard(); pressAgain(r); }], ['Dismiss', 'quiet', () => { failed = null; drawCard(); }]]);
  } else if (side) {
    const mine = pressed && pressed.side === side ? pressed : null;
    const f = FORMATS.find(([k]) => k === (mine ? mine.format : '')) || null;
    const at = where(side, g.st ? g.st.p : 0);
    dot = !!(mine && mine.sessionUid && session && session.uid === mine.sessionUid && mine.changeAt !== null && changes(session) !== null && changes(session) !== mine.changeAt);
    mode = 'playing'; title = mine ? mine.title : side.title || 'On the platter';
    sub = [dot ? 'Session changed' : '', f ? f[1] : '', f ? f[2].replace(' rpm', '') : '', mine ? cutLabel(mine.cutKey) : '', at.text].filter(Boolean).join(' · ');
    // no progress line while it plays: the time beside the track says where it is (owner, 2026-11-19)
    const again = () => pressAgain(mine ? mine.source : null);
    setActs(dot ? 'again-hot' : 'again', [['Press again', dot ? 'primary' : '', again]]);
  } else {
    mode = 'empty'; title = 'Nothing on the platter';
    if (session) sub = `Render “${session.name.value}”, or load or drop an audio file.`;
    else if (lunaState === 'ok') sub = 'Open a session in LUNA to render it, or load or drop an audio file.';
    else if (lunaState === 'connecting') sub = 'Looking for LUNA… You can load or drop an audio file meanwhile.';
    else if (lunaState === 'unreachable') sub = 'LUNA is not reachable from this page. Load or drop an audio file.';
    else sub = 'Load or drop an audio file.';
    setActs('none', []);
  }
  card.dataset.rec = mode;
  if (cTitle.textContent !== title) cTitle.textContent = title;
  if (cSub.textContent !== sub) cSub.textContent = sub;
  cSub.classList.toggle('err', err);
  cDot.hidden = !dot;
  cProg.hidden = frac === undefined;
  if (frac !== undefined) { const pct = `${Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 10}%`; cProg.firstElementChild.style.width = pct; disc.style.setProperty('--p', pct); }
  drawSteps();
  if (frac !== lastFrac) { lastFrac = frac; fracAt = performance.now(); }
  card.classList.toggle('idle', mode === 'pressing' && performance.now() - fracAt > 1000);
}
setInterval(drawCard, 250);

// ---- sources ---------------------------------------------------------------------------------
async function fromFile(file) {
  if (busy || !file) return;
  try {
    const { pcm, seconds } = await decodeToPcm(await file.arrayBuffer());
    openPress({ kind: 'file', file, pcm, seconds });
  } catch (e) {
    failed = { title: file.name, error: `${e && e.message ? e.message : 'This page cannot read it as audio'}.`.replace(/\.\.$/, '.'), retry: null };
    drawCard();
  }
}
fileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { fromFile(fileInput.files[0]); fileInput.value = ''; });
// a file dropped anywhere on the deck (LUNA's own path drops are not used, so HTML drops arrive)
window.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  e.preventDefault(); fromFile(f);
});
renderBtn.addEventListener('click', () => { if (session) openPress({ kind: 'session' }); });

// Follow LUNA: which session is open, if any. Outside LUNA (a plain browser) the file route still works.
async function follow() {
  if (!window.Luna) { lunaState = 'none'; drawCard(); return; }
  try {
    luna = await window.Luna.connect();
    await luna.sessions.ready();
    lunaState = 'ok';
    const pick = async () => {
      const s = luna.sessions.current();
      session = null;
      if (s) { await s.ready(); session = s; }
      setBusy();
      renderBtn.title = session ? `Press “${session.name.value}” to a record (P)` : 'Open a session in LUNA first';
      drawCard();
    };
    luna.sessions.focusedUid.onChange(() => { pick(); });
    luna.sessions.items.onChange(() => { pick(); });
    await pick();
  } catch (e) {
    lunaState = 'unreachable'; drawCard();
  }
}
follow();
drawCard();
window.addEventListener('pagehide', () => { if (luna) luna.close(); });

// ---- the deck in the middle of the window, with the panels laid over it -----------------------
// The web app's platter card is not shown in the Add On (addon.css), and app.js keeps no room for it
// on a hosted page. The View panel's Record card switch shows and hides the Add On's own card instead.
// Before 2026-11-19 the Add On kept that switch off for good, and the page remembers it off: turn it
// back on once.
// The Workbench and View panels slide in over the deck rather than moving it aside, so the deck is
// told nothing stands at its right either. The deck is laid out again at once (the web app lays out on resize).
{
  const body = document.body;
  try {
    if (!localStorage.getItem('gd.addon.cardSwitch')) {
      localStorage.setItem('gd.addon.cardSwitch', '1');
      const sw = document.querySelector('#scene label[data-shown=card] input');
      if (sw && !sw.checked) sw.click();
    }
  } catch { /* not remembered */ }
  const view = GD() && GD().view;
  if (view && view.setInsets) {
    const setInsets = view.setInsets;
    view.setInsets = (i, now) => setInsets({ ...i, left: 0, right: 0 }, now);
    window.dispatchEvent(new Event('resize'));
  }
}

// ---- the camera bar: Seated, Top, Stylus, a reset, and X-ray ---------------------------------
// One toolbar in place of the deck's own view buttons (hidden in addon.css). A highlight slides to
// the chosen view; once the camera has been turned, slid or zoomed away from it, the view's name goes
// italic and a reset appears. X-ray is a switch, not a view: it stays on across view changes, which
// the deck view would otherwise turn off (choosing a view sets its own X-ray), so it is put back
// whenever the view changes. The keys (1 2 3, 0, X) are named in each button's tooltip; there is no
// separate hint panel under the bar (owner, 2026-11-18).
const ICONS = {
  seated: '<path d="M3 15l9-5 9 5-9 5z"/><path d="M12 10V4"/><circle cx="12" cy="15" r="2"/>',
  top: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><circle cx="11" cy="12" r="5"/><circle cx="11" cy="12" r="1"/><path d="M18 5l-3 8"/>',
  stylus: '<path d="M4 20l7-7"/><path d="M11 13l3-6 4 4-6 3z"/><path d="M4 20h4"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
  xray: '<rect x="3.5" y="6" width="13" height="13" rx="2"/><rect x="7.5" y="3" width="13" height="13" rx="2" stroke-dasharray="2.5 2"/>',
};
const VIEWS = [['seated', 'Seated', '1', 'The turntable as you sit at it'], ['top', 'Top', '2', 'Looking straight down'], ['stylus', 'Stylus', '3', 'Close up on the needle']];
const thumb = el('span', { className: 'vb-thumb', ariaHidden: 'true' });
const viewBtns = VIEWS.map(([name, label, key, tip]) => {
  const b = el('button', { type: 'button', title: `${tip} (${key})` }, [svg(ICONS[name]), el('span', { className: 'vb-lbl', textContent: label })]);
  b.dataset.view = name; b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => { chooseView(name); b.blur(); });
  return b;
});
const resetBtn = el('button', { type: 'button', className: 'vb-reset', title: 'Reset the camera (0)', ariaLabel: 'Reset the camera' }, [svg(ICONS.reset)]);
resetBtn.addEventListener('click', () => { resetCamera(); resetBtn.blur(); });
const xrayBtn = el('button', { type: 'button', className: 'vb-x', title: 'See inside the turntable (X)' }, [svg(ICONS.xray), el('span', { className: 'vb-lbl', textContent: 'X-ray' })]);
xrayBtn.setAttribute('aria-pressed', 'false');
const vbar = el('div', { className: 'addon-vbar', role: 'toolbar', ariaLabel: 'Camera' }, [
  el('div', { className: 'vb-views' }, [thumb, ...viewBtns]), resetBtn, el('span', { className: 'vb-div', ariaHidden: 'true' }), xrayBtn,
]);
document.body.append(vbar);

const deckView = () => GD() && GD().view;
function chooseView(name) { const v = deckView(); if (v && v.setView) v.setView(name); setXray(xrayOn); syncViews(); }
function resetCamera() { const v = deckView(); if (v && v.look && v.look.resetCamera) v.look.resetCamera(); syncViews(); }
let shownView = '';
function syncViews() {
  const v = deckView(); if (!v) return;
  const name = v.view;
  if (name !== shownView) {
    shownView = name;
    for (const b of viewBtns) b.setAttribute('aria-pressed', String(b.dataset.view === name));
    placeThumb();
  }
  // turned, slid or zoomed away from the view's own framing
  const info = v.info ? v.info() : {}, o = info.orbit || {}, look = v.look && v.look.get ? v.look.get() : {};
  const moved = !!(o.az || o.el || (look.zoom !== undefined && Math.abs(look.zoom - 1) > 1e-3) || Math.abs(look.panX || 0) > 1e-5 || Math.abs(look.panY || 0) > 1e-5);
  vbar.classList.toggle('moved', moved);
}
function placeThumb() {
  const on = viewBtns.find((b) => b.getAttribute('aria-pressed') === 'true');
  thumb.hidden = !on;
  if (on && on.offsetWidth) { thumb.style.width = `${on.offsetWidth}px`; thumb.style.transform = `translateX(${on.offsetLeft}px)`; }
}
setInterval(syncViews, 200);
window.addEventListener('resize', () => requestAnimationFrame(placeThumb));
requestAnimationFrame(syncViews);

let xrayOn = false;
function setXray(on) {
  xrayOn = !!on;
  if (xrayBtn.getAttribute('aria-pressed') !== String(xrayOn)) xrayBtn.setAttribute('aria-pressed', String(xrayOn));
  const v = deckView();
  if (v && v.setXray && v.xray !== xrayOn) v.setXray(xrayOn);
}
xrayBtn.addEventListener('click', () => { setXray(!xrayOn); xrayBtn.blur(); });
// The deck's own view bar (hidden) is rebuilt when the table's model arrives and marks the view
// chosen, also by the deck's V key: put X-ray back as chosen whenever that happens.
function followViewBar() {
  const bar = document.querySelector('.deckviews');
  if (!bar) return void requestAnimationFrame(followViewBar);
  new MutationObserver(() => { setXray(xrayOn); syncViews(); })
    .observe(bar, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
}
followViewBar();

// ---- keys ------------------------------------------------------------------------------------
// 1, 2, 3 the views, 0 resets the camera, X X-ray, P press, C the Workbench. (Space, Esc and V
// are the deck's own: start or stop, close what is on top, cycle the views.)
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || typing() || !dialog.hidden) return;
  const k = e.key.toLowerCase();
  if (k === '1' || k === '2' || k === '3') { e.preventDefault(); chooseView(VIEWS[Number(k) - 1][0]); }
  else if (k === '0') { e.preventDefault(); resetCamera(); }
  else if (k === 'x') { e.preventDefault(); setXray(!xrayOn); }
  else if (k === 'p') { e.preventDefault(); if (!busy) { if (session) openPress({ kind: 'session' }); else fileInput.click(); } }
  else if (k === 'c') { e.preventDefault(); $('#benchToggle').click(); }
});
$('#benchToggle').title = 'Turntable, record and cartridge settings (C)';

// ---- quiet when idle -------------------------------------------------------------------------
// After a few seconds without the mouse moving, the camera bar fades: the deck and the record card
// stay. It does not fade while a panel or the dialog is open, or while the pointer is on the bar.
let idleTimer = 0;
function wake() {
  document.body.classList.remove('addon-idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const g = GD(), scene = $('#scene');
    if (dialog.hidden && !(g && g.bench) && (!scene || scene.hidden) && !vbar.matches(':hover, :focus-within')) document.body.classList.add('addon-idle');
    else wake();
  }, IDLE_MS);
}
for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown']) window.addEventListener(ev, wake, { passive: true });
wake();

// ---- a small window --------------------------------------------------------------------------
// Under 900 px wide the volume moves from the top bar into the Workbench (the meters go), the camera
// bar shows icons only and the record card tightens (addon.css).
const listening = el('section', { className: 'addon-group addon-listening' }, [el('h3', { textContent: 'Listening' })]);
$('#deckControls').before(listening);
const vol = $('.topbar label.vol'), volHome = vol.parentNode, volNext = vol.nextSibling;
function fitWindow() {
  const small = window.innerWidth < SMALL_W;
  document.body.classList.toggle('addon-small', small);
  if (small && vol.parentNode !== listening) listening.append(vol);
  if (!small && vol.parentNode !== volHome) volHome.insertBefore(vol, volNext);
  requestAnimationFrame(placeThumb);
}
window.addEventListener('resize', fitWindow);
fitWindow();

// ---- one record at a time: the Dual stays in single-play mode (its Mode switch is hidden) ----------
{
  const ctl = GD() && GD().tableCtl;
  if (ctl && ctl.mech.mode !== 'single') ctl.setMode('single');
}

// ---- the Workbench, in three groups -----------------------------------------------------------
// 1. the turntable's own controls (the Dual panel: also on the deck itself), 2. the record (surface
// wear, the off-centre hole, its warp), 3. the cartridge and cable loading. Each is headed as the View
// panel's sections are.
// The web app's own inputs are moved, not copied, so they keep working as they do there; the Rig
// section left behind (deck and preamp, both fixed here) and the groove microscope are hidden.
{
  const label = (sel) => $(sel).closest('label');
  const rig = $('#cartSel').closest('section');
  const record = el('section', { className: 'addon-group' }, [
    el('h3', { className: 'addon-sec', textContent: 'Record' }),
    el('p', { className: 'note', textContent: 'How worn the record is, how far off centre the hole is, and how warped it is.' }),
    label('#surface'), label('#ecc'), label('#warp'),
  ]);
  const finer = el('section', { className: 'addon-group' }, [
    el('h3', { className: 'addon-sec', textContent: 'Cartridge and cable' }),
    el('p', { className: 'note', textContent: 'The stylus shape and the cable it plays through.' }),
    label('#cartSel'), label('#cap'),
  ]);
  rig.before(record, finer);
  rig.classList.add('addon-gone');
  $('#scope').closest('section').classList.add('addon-gone');
  tipFrom(record.querySelector('h3'), record.querySelector('p.note'));
  tipFrom(finer.querySelector('h3'), finer.querySelector('p.note'));
}

// ---- the Workbench, compact ---------------------------------------------------------------------
// The explanation paragraphs are hidden (addon.css) and kept as tooltips: the Dual panel's opening
// note on its Start / Stop / Lift row, the tracking force note on both of its dials. Its "Tracking
// force and anti-skating" heading goes, since the two sliders say it. The panel is made when the
// table is, so wait for it.
function tipFrom(target, note) {
  if (!target || !note || !note.textContent.trim()) return;
  target.title = note.textContent.trim(); target.dataset.tip = '';
}
(function compactDual() {
  const panel = document.getElementById('dualPanel');
  if (!panel || !panel.querySelector('h3')) return void setTimeout(compactDual, 250);
  linkScaleToCartridge(panel);
  const intro = panel.firstElementChild && panel.firstElementChild.matches('p.note') ? panel.firstElementChild : null;
  tipFrom(panel.querySelector(':scope > .transport'), intro);
  const sub = panel.querySelector(':scope > h3:not(.addon-sec)');
  panel.prepend(el('h3', { className: 'addon-sec', textContent: 'Turntable' })); // headed as the View panel's sections are
  if (sub && !sub.classList.contains('seeworking')) {
    sub.classList.add('addon-subhead');
    let n = sub.nextElementSibling, note = null;
    while (n && !n.matches('h3')) { if (n.matches('p.note')) { note = n; break; } n = n.nextElementSibling; }
    for (const id of ['Tracking force', 'Anti-skating']) {
      const lab = [...panel.querySelectorAll(':scope > label')].find((l) => l.textContent.trim().startsWith(id));
      tipFrom(lab, note);
    }
  }
})();

// ---- the cartridge and the Dual's anti-skating scale, as one choice ------------------------------
// The Dual's scale is red for a conical stylus and white for an elliptical (or CD-4 line contact)
// one; the deck draws the fitted cartridge's stylus carrier in the same colour. Choosing either here
// sets the other: red fits the conical cartridge, white the elliptical one (or keeps a line contact);
// a cartridge chosen in the menu sets the scale. At start the scale, which the deck remembers, decides.
function linkScaleToCartridge(panel) {
  const cart = $('#cartSel'), ctl = () => GD() && GD().tableCtl;
  const scaleOf = (key) => (key === 'mm-con' ? 'red' : 'white');
  const setCart = (key) => { if (cart.value !== key) { cart.value = key; cart.dispatchEvent(new Event('change', { bubbles: true })); } };
  const fromScale = (scale) => { if (scale === 'red') setCart('mm-con'); else if (cart.value === 'mm-con') setCart('mm-ell'); };
  cart.addEventListener('change', () => { const c = ctl(); if (c && c.mech.skateScale !== scaleOf(cart.value)) c.setSkateScale(scaleOf(cart.value)); });
  const seg = panel.querySelector('.seg[aria-label="Anti-skating scale"]');
  if (seg) seg.addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) fromScale(b.dataset.v); });
  const c = ctl(); if (c) fromScale(c.mech.skateScale);
}

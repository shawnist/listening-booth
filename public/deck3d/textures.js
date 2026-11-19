// Every surface on the deck is drawn here, in code: nothing is downloaded.
import * as THREE from 'three';
import { TAU, PLATE_RECT, CONTROLS, R_PLATTER } from './layout.js';
import { UA_MARK, UA_BOX } from './ua-mark.js';

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashText = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; };

export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export function canvasTexture(c, { srgb = true, repeat = null, aniso = 8, mip = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = mip;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.needsUpdate = true;
  return t;
}

// Speckle the whole canvas with fine grain (amount in 0..255 levels either way).
function grain(g, w, h, amount, seed, mono = true) {
  const img = g.getImageData(0, 0, w, h), d = img.data, rnd = mulberry(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 2 * amount;
    if (mono) { d[i] += n; d[i + 1] += n; d[i + 2] += n; } else { d[i] += n; d[i + 1] += (rnd() - 0.5) * 2 * amount; d[i + 2] += (rnd() - 0.5) * 2 * amount; }
  }
  g.putImageData(img, 0, 0);
}

// Grey noise tile for bump and roughness detail.
export function noiseTexture(size = 256, seed = 7, contrast = 90, repeat = [8, 8]) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
  grain(g, size, size, contrast, seed);
  return canvasTexture(c, { srgb: false, repeat });
}

// Rings left by a lathe tool: detail runs along v only. Used on turned metal parts.
export function turnedTexture(seed = 3, len = 512, contrast = 60) {
  const c = makeCanvas(4, len), g = c.getContext('2d'), rnd = mulberry(seed);
  let v = 128;
  for (let y = 0; y < len; y++) {
    v = 128 + (v - 128) * 0.55 + (rnd() - 0.5) * contrast;
    const k = Math.max(0, Math.min(255, Math.round(v)));
    g.fillStyle = `rgb(${k},${k},${k})`; g.fillRect(0, y, 4, 1);
  }
  const t = canvasTexture(c, { srgb: false });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Straight knurling for grips: stripes along u.
export function knurlTexture(count = 64) {
  const c = makeCanvas(count * 4, 4), g = c.getContext('2d');
  for (let i = 0; i < count; i++) {
    const gr = g.createLinearGradient(i * 4, 0, i * 4 + 4, 0);
    gr.addColorStop(0, '#202020'); gr.addColorStop(0.5, '#f0f0f0'); gr.addColorStop(1, '#202020');
    g.fillStyle = gr; g.fillRect(i * 4, 0, 4, 4);
  }
  const t = canvasTexture(c, { srgb: false });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Oiled walnut for the plinth.
export function woodTexture() {
  const W = 1024, H = 256, c = makeCanvas(W, H), g = c.getContext('2d'), rnd = mulberry(41);
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#5b3a22'); base.addColorStop(0.5, '#4d301b'); base.addColorStop(1, '#583722');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 520; i++) {
    const y0 = rnd() * H, amp = 1 + rnd() * 5, f = 0.004 + rnd() * 0.008, ph = rnd() * TAU, dark = rnd() < 0.72;
    g.strokeStyle = dark ? `rgba(34,18,8,${0.05 + rnd() * 0.2})` : `rgba(150,104,62,${0.04 + rnd() * 0.12})`;
    g.lineWidth = 0.5 + rnd() * 1.8;
    g.beginPath();
    for (let x = -8; x <= W + 8; x += 8) { const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph * 2) * amp * 0.25; if (x < 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 1400; i++) { // pores
    g.fillStyle = `rgba(24,12,6,${0.12 + rnd() * 0.25})`;
    g.fillRect(rnd() * W, rnd() * H, 3 + rnd() * 14, 0.7);
  }
  grain(g, W, H, 5, 99);
  return canvasTexture(c);
}

// The deck plate from above: anodised finish, printed legends, and the soft darkening
// that collects around anything standing on it.
export function plateTexture(deckKey) {
  const R = PLATE_RECT, W = 2048, H = Math.round((W * (R.z1 - R.z0)) / (R.x1 - R.x0));
  const c = makeCanvas(W, H), g = c.getContext('2d'), s = W / (R.x1 - R.x0);
  const X = (x) => (x - R.x0) * s, Z = (z) => (z - R.z0) * s;
  g.fillStyle = '#2b2c2f'; g.fillRect(0, 0, W, H);
  grain(g, W, H, 5, 5);
  const ao = (x, z, r0, r1, a) => {
    const gr = g.createRadialGradient(X(x), Z(z), r0 * s, X(x), Z(z), r1 * s);
    gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.35, `rgba(0,0,0,${a * 0.45})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(X(x), Z(z), r1 * s, 0, TAU); g.fill();
  };
  ao(0, 0, R_PLATTER - 0.004, R_PLATTER + 0.03, 0.72);
  g.fillStyle = '#0b0b0c'; g.beginPath(); g.arc(X(0), Z(0), (R_PLATTER - 0.003) * s, 0, TAU); g.fill(); // platter well
  const C = CONTROLS;
  ao(C.start.x, C.start.z, C.start.r, C.start.r + 0.014, 0.5);
  ao(C.strobe.x, C.strobe.z, C.strobe.r - 0.002, C.strobe.r + 0.012, 0.5);
  ao(C.target.x, C.target.z, C.target.r - 0.002, C.target.r + 0.011, 0.5);
  for (const b of [C.s33, C.s45]) ao(b.x, b.z, 0.006, 0.02, 0.35);

  // legends
  const ink = 'rgba(222,220,212,0.82)', dim = 'rgba(222,220,212,0.5)';
  const font = (px, weight = 600) => { g.font = `${weight} ${px}px "Helvetica Neue", "Avenir Next", Arial, sans-serif`; };
  const text = (t, x, z, px, { align = 'center', color = ink, weight = 600, track = 0.12 } = {}) => {
    font(px, weight); g.fillStyle = color; g.textBaseline = 'middle';
    const sp = px * track; let w = 0; for (const ch of t) w += g.measureText(ch).width + sp; w -= sp;
    let x0 = X(x) - (align === 'center' ? w / 2 : align === 'right' ? w : 0);
    g.textAlign = 'left';
    for (const ch of t) { g.fillText(ch, x0, Z(z)); x0 += g.measureText(ch).width + sp; }
  };
  text('33', C.s33.x, C.s33.z - 0.0125, 17);
  text('45', C.s45.x, C.s45.z - 0.0125, 17);
  // pitch scale
  const P = C.pitch;
  g.strokeStyle = ink; g.lineCap = 'butt';
  for (let p = -8; p <= 8; p++) {
    const z = P.z + (p / P.range) * P.travel, major = p % 4 === 0;
    g.lineWidth = major ? 2.4 : 1.3; g.strokeStyle = major ? ink : dim;
    g.beginPath(); g.moveTo(X(P.x - 0.0165), Z(z)); g.lineTo(X(P.x - (major ? 0.0225 : 0.0200)), Z(z)); g.stroke();
    if (major) text(p === 0 ? '0' : `${p > 0 ? '+' : '−'}${Math.abs(p)}`, P.x - 0.0245, z, 13, { align: 'right', track: 0.04 });
  }
  text('PITCH', P.x, P.z - P.travel - 0.0155, 13, { color: dim });
  text('%', P.x, P.z + P.travel + 0.0145, 12, { color: dim });
  text('CUE', C.cue.x, C.cue.z - 0.021, 13, { color: dim });
  text('GROOVE DECK', R.x0 + 0.012, R.z0 + 0.0125, 15, { align: 'left', track: 0.3 });
  text(deckKey === 'belt' ? 'BELT DRIVE' : 'DIRECT DRIVE', R.x0 + 0.012, R.z0 + 0.0195, 9.5, { align: 'left', color: dim, weight: 500, track: 0.26 });
  text('STROBE', C.strobe.x - 0.013, C.strobe.z - 0.013, 9.5, { color: dim, weight: 500, track: 0.2 });
  return { texture: canvasTexture(c, { aniso: 16 }), W, H };
}

// Felt slipmat with a printed pattern, so you can see it turn.
export function feltTexture() {
  const S = 1024, c = makeCanvas(S, S), g = c.getContext('2d'), o = S / 2, u = o;
  g.fillStyle = '#1d1d20'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#6f6d67'; g.lineCap = 'butt';
  g.lineWidth = u * 0.008; g.beginPath(); g.arc(o, o, u * 0.93, 0, TAU); g.stroke();
  g.lineWidth = u * 0.006; g.beginPath(); g.arc(o, o, u * 0.36, 0, TAU); g.stroke();
  for (let i = 0; i < 3; i++) { // three broad arcs, like fan blades
    const a = (i * TAU) / 3;
    g.lineWidth = u * 0.11; g.strokeStyle = '#3a3a3d';
    g.beginPath(); g.arc(o, o, u * 0.66, a, a + 1.15); g.stroke();
    g.lineWidth = u * 0.012; g.strokeStyle = '#77756e';
    g.beginPath(); g.arc(o, o, u * 0.50, a + 0.2, a + 1.5); g.stroke();
  }
  g.fillStyle = '#8a877f'; g.font = `700 ${Math.round(u * 0.042)}px "Helvetica Neue", Arial, sans-serif`;
  arcText(g, 'GROOVE DECK  ·  SLIPMAT  ·  GROOVE DECK  ·  SLIPMAT  ·', o, o, u * 0.82, -Math.PI / 2, u * 0.022, true);
  grain(g, S, S, 14, 23);
  return canvasTexture(c, { aniso: 16 });
}

// Letters set along a circle. Reads clockwise along the top when flip is false.
export function arcText(g, str, cx, cy, radius, centreAngle, tracking = 0, full = false) {
  const chars = [...str], widths = chars.map((ch) => g.measureText(ch).width + tracking);
  const total = widths.reduce((a, b) => a + b, 0);
  let a = full ? centreAngle : centreAngle - total / radius / 2;
  const scale = full ? (TAU * radius) / total : 1;
  g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    const w = (widths[i] * scale) / radius;
    g.save(); g.translate(cx + Math.cos(a + w / 2) * radius, cy + Math.sin(a + w / 2) * radius); g.rotate(a + w / 2 + Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
    a += w;
  });
  g.restore();
}
// The same, but reading left to right along the bottom of the circle.
export function arcTextBottom(g, str, cx, cy, radius, tracking = 0) {
  const chars = [...str], widths = chars.map((ch) => g.measureText(ch).width + tracking);
  const total = widths.reduce((a, b) => a + b, 0);
  let a = Math.PI / 2 + total / radius / 2;
  g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    const w = widths[i] / radius;
    g.save(); g.translate(cx + Math.cos(a - w / 2) * radius, cy + Math.sin(a - w / 2) * radius); g.rotate(a - w / 2 - Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
    a -= w;
  });
  g.restore();
}

// A soft dark patch: the shadow something heavy leaves on the table under it.
export function blobTexture(wRatio = 1.2) {
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d');
  const w = S * 0.56, h = (S * 0.56) / wRatio;
  g.shadowColor = 'rgba(0,0,0,1)'; g.shadowBlur = S * 0.11; g.shadowOffsetX = S * 2;
  g.fillStyle = '#000';
  for (let i = 0; i < 2; i++) { g.beginPath(); g.roundRect((S - w) / 2 - S * 2, (S - h) / 2, w, h, S * 0.03); g.fill(); }
  return canvasTexture(c, { srgb: true });
}

// Round fade for the table top: solid under the deck, gone before its edge could show.
export function fadeTexture() {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.12, S / 2, S / 2, S * 0.5);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, '#b0b0b0'); gr.addColorStop(0.62, '#2a2a2a'); gr.addColorStop(0.85, '#000'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return canvasTexture(c, { srgb: false });
}

// The cap of the start button.
export function startCapTexture() {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#c4c5c8'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#1d1d1f'; g.font = '700 25px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('START', S / 2, S / 2 - 19); g.fillText('STOP', S / 2, S / 2 + 21);
  g.fillRect(S / 2 - 30, S / 2 - 1, 60, 2.4);
  return canvasTexture(c);
}

// ---- the record's centre label -----------------------------------------------------------
const PALETTES = [
  { paper: '#b3402e', deep: '#8d2c1f', ink: '#f6ead6', line: '#f0c9a0' }, // brick and cream
  { paper: '#1f3a5c', deep: '#152a45', ink: '#e9e4d6', line: '#b9c6d8' }, // navy
  { paper: '#e3d9c2', deep: '#cfc3a6', ink: '#1c1a17', line: '#7b3a26' }, // cream and black
  { paper: '#275347', deep: '#1a3b32', ink: '#efe6cf', line: '#d9b56a' }, // bottle green
  { paper: '#d39a2c', deep: '#b17c1a', ink: '#1d1710', line: '#3a2a12' }, // mustard
  { paper: '#55305a', deep: '#3d2142', ink: '#f1dfe2', line: '#e39ab0' }, // plum
  { paper: '#17181b', deep: '#0c0d0f', ink: '#e7e2d5', line: '#c9a24a' }, // black and gold
  { paper: '#c96a35', deep: '#a4501f', ink: '#fbf0dc', line: '#2a1a10' }, // burnt orange
];

function fitText(g, text, maxW) {
  let t = String(text);
  if (g.measureText(t).width <= maxW) return t;
  while (t.length > 3 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

// The Listening Booth (the LUNA Add On) presses test pressings: a plain white label printed with the
// UA diamond and TEST PRESSING, ruled lines with the title and date written on by hand, side and
// speed either side of the hole, and LUNA round the foot (owner, 2026-11-19). The web app keeps its
// own labels.
const testPressingHost = () => typeof document !== 'undefined' && document.documentElement.dataset.host === 'luna';
const HAND = '"Marker Felt", "Noteworthy", "Bradley Hand", "Comic Sans MS", cursive';
function drawTestPressing(g, S, o, u, side, title, artist, sideName, rpm, big, hole) {
  const ink = '#1c1c1e', pen = '#1d2a6b', SANS = '"Helvetica Neue", Arial, sans-serif';
  const bg = g.createRadialGradient(o, o * 0.85, u * 0.1, o, o, u * 1.05);
  bg.addColorStop(0, '#f7f5ef'); bg.addColorStop(1, '#e6e2d8');
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(28,28,30,0.55)'; g.lineWidth = u * 0.006; g.beginPath(); g.arc(o, o, u * 0.95, 0, TAU); g.stroke();
  // rows: above the hole the printed heading, below it the ruled lines; a 7" big hole squeezes them out
  const r = big
    ? { logo: -(hole + 0.36 * u), tp: -(hole + 0.13 * u), line1: hole + 0.13 * u, line2: null }
    : { logo: -0.6 * u, tp: -0.36 * u, line1: 0.27 * u, line2: 0.47 * u };
  // the UA diamond, printed
  const lw = u * (big ? 0.3 : 0.42), k = lw / UA_BOX.w;
  g.save(); g.translate(o, o + r.logo); g.scale(k, k); g.translate(-(UA_BOX.x0 + UA_BOX.w / 2), -(UA_BOX.y0 + UA_BOX.h / 2));
  g.fillStyle = ink; if (typeof Path2D === 'function') for (const d of UA_MARK) g.fill(new Path2D(d));
  g.restore();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink;
  g.font = `700 ${Math.round(u * (big ? 0.065 : 0.085))}px ${SANS}`;
  const tp = 'TEST PRESSING', track = u * 0.02;
  const tw = [...tp].reduce((a, ch) => a + g.measureText(ch).width + track, -track);
  let x = o - tw / 2;
  for (const ch of tp) { const w = g.measureText(ch).width; g.fillText(ch, x + w / 2, o + r.tp); x += w + track; }
  // side and speed either side of the hole
  const sx = big ? hole + 0.2 * u : 0.5 * u;
  g.font = `700 ${Math.round(u * 0.13)}px ${SANS}`; g.fillText(sideName, o - sx, o - u * 0.01);
  g.font = `500 ${Math.round(u * 0.045)}px ${SANS}`; g.fillText('SIDE', o - sx, o + u * 0.09);
  g.font = `700 ${Math.round(u * 0.09)}px ${SANS}`; g.fillText(rpm, o + sx, o - u * 0.01);
  g.font = `500 ${Math.round(u * 0.045)}px ${SANS}`; g.fillText('RPM', o + sx, o + u * 0.09);
  // ruled lines, printed, with the title and the date written on them
  const chord = (y) => 1.8 * Math.sqrt(Math.max(0.04, 1 - (y / u) * (y / u))) * u;
  const now = new Date(), date = `${now.getDate()} ${now.toLocaleString('en', { month: 'short' })} ${now.getFullYear()}`;
  // a 7" single's big hole leaves room for one line: its date goes round the foot instead
  const rows = [['TITLE', [title, artist].filter(Boolean).join(' · '), r.line1], ['DATE', date, r.line2]].filter((row) => row[2] !== null);
  for (const [field, text, y] of rows) {
    const half = chord(y) * 0.42, x0 = o - half, x1 = o + half;
    g.fillStyle = ink; g.fillRect(x0, o + y + u * 0.035, x1 - x0, u * 0.004);
    g.font = `600 ${Math.round(u * 0.036)}px ${SANS}`; g.textAlign = 'left'; g.fillText(field, x0, o + y + u * 0.005);
    const fx = x0 + g.measureText(field).width + u * 0.03;
    g.fillStyle = pen; g.font = `${Math.round(u * (field === 'TITLE' ? 0.1 : 0.075))}px ${HAND}`;
    g.save(); g.translate(fx, o + y - u * 0.005); g.rotate(-0.025);
    g.fillText(fitText(g, text, x1 - fx), 0, 0); g.restore();
    g.textAlign = 'center';
  }
  // round the foot
  g.fillStyle = ink; g.font = `600 ${Math.round(u * 0.042)}px ${SANS}`;
  arcTextBottom(g, big ? `LUNA  ·  ${date.toUpperCase()}  ·  STEREO` : 'LUNA  ·  LISTENING BOOTH  ·  STEREO', o, o, u * 0.86, u * 0.014);
}

// Draws the label into a canvas. art (an image) replaces the generated design when given.
export function drawLabel(c, side, art) {
  const S = c.width, g = c.getContext('2d'), o = S / 2, u = S / 2, f = side.fmt;
  const title = side.title || (side.tracks[0] && side.tracks[0].title) || 'Untitled';
  const artist = side.artist || (side.tracks[0] && side.tracks[0].artist) || '';
  const sideName = side.sideName || 'A';
  const rpm = Math.abs(side.rpm - 45) < 1 ? '45' : '33⅓';
  const pal = PALETTES[hashText(title + artist) % PALETTES.length];
  const big = f.hole > 0.01, hole = (f.hole / f.label) * u;
  g.save();
  g.clearRect(0, 0, S, S);
  if (!art && testPressingHost()) drawTestPressing(g, S, o, u, side, title, artist, sideName, rpm, big, hole);
  else if (art) {
    const k = Math.max(S / art.width, S / art.height), w = art.width * k, h = art.height * k;
    g.fillStyle = '#111'; g.fillRect(0, 0, S, S);
    g.drawImage(art, (S - w) / 2, (S - h) / 2, w, h);
    const shade = g.createRadialGradient(o, o, u * 0.55, o, o, u);
    shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = shade; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = u * 0.006; g.beginPath(); g.arc(o, o, u * 0.955, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.font = `600 ${Math.round(u * 0.058)}px "Helvetica Neue", Arial, sans-serif`;
    arcTextBottom(g, `SIDE ${sideName}  ·  ${rpm} RPM  ·  STEREO`, o, o, u * 0.885, u * 0.012);
  } else {
    const bg = g.createRadialGradient(o, o * 0.8, u * 0.1, o, o, u * 1.05);
    bg.addColorStop(0, pal.paper); bg.addColorStop(1, pal.deep);
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    // a band across the lower third, the way pressing-plant labels are often split
    g.save(); g.beginPath(); g.arc(o, o, u, 0, TAU); g.clip();
    g.fillStyle = pal.deep; g.globalAlpha = 0.55; g.fillRect(0, o + u * (big ? 0.52 : 0.36), S, u);
    g.globalAlpha = 1; g.restore();
    g.strokeStyle = pal.line; g.lineWidth = u * 0.008; g.beginPath(); g.arc(o, o, u * 0.95, 0, TAU); g.stroke();
    g.lineWidth = u * 0.003; g.beginPath(); g.arc(o, o, u * 0.925, 0, TAU); g.stroke();
    g.fillStyle = pal.ink;
    g.font = `700 ${Math.round(u * 0.07)}px "Helvetica Neue", Arial, sans-serif`;
    arcText(g, 'GROOVE DECK', o, o, u * 0.82, -Math.PI / 2, u * 0.035);
    const chord = (y) => 1.75 * Math.sqrt(Math.max(0.04, 1 - (y / u) * (y / u))) * u;
    const rows = big
      ? { title: -(hole + 0.17 * u), artist: hole + 0.16 * u, foot: hole + 0.3 * u }
      : { title: -0.36 * u, artist: 0.2 * u, foot: 0.52 * u };
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(u * (big ? 0.12 : 0.15))}px Georgia, "Times New Roman", serif`;
    g.fillText(fitText(g, title, chord(rows.title) * 0.92), o, o + rows.title);
    g.font = `400 ${Math.round(u * (big ? 0.075 : 0.085))}px Georgia, "Times New Roman", serif`;
    if (artist) g.fillText(fitText(g, artist, chord(rows.artist) * 0.9), o, o + rows.artist);
    g.fillStyle = pal.line; g.fillRect(o - u * 0.16, o + rows.title + u * (big ? 0.085 : 0.11), u * 0.32, u * 0.006);
    // side and speed either side of the hole
    g.fillStyle = pal.ink;
    const sx = big ? hole + 0.22 * u : 0.56 * u;
    g.font = `700 ${Math.round(u * 0.17)}px Georgia, serif`; g.fillText(sideName, o - sx, o - u * 0.02);
    g.font = `500 ${Math.round(u * 0.05)}px "Helvetica Neue", Arial, sans-serif`; g.fillText('SIDE', o - sx, o + u * 0.105);
    g.font = `700 ${Math.round(u * 0.105)}px Georgia, serif`; g.fillText(rpm, o + sx, o - u * 0.025);
    g.font = `500 ${Math.round(u * 0.05)}px "Helvetica Neue", Arial, sans-serif`; g.fillText('RPM · STEREO', o + sx, o + u * 0.085);
    // track list
    const list = side.tracks.slice(0, 4).map((t, i) => `${i + 1}. ${t.title}`);
    g.font = `400 ${Math.round(u * 0.05)}px "Helvetica Neue", Arial, sans-serif`;
    if (!big && list.length > 1) list.forEach((t, i) => { const y = rows.foot + i * u * 0.07; g.fillText(fitText(g, t, chord(y) * 0.86), o, o + y); });
    g.font = `500 ${Math.round(u * 0.042)}px "Helvetica Neue", Arial, sans-serif`;
    arcTextBottom(g, `${String(f.name || '').replace(/["”]/g, ' IN').replace(/\s*·\s*/g, '  ·  ').toUpperCase()}  ·  CUT FROM THE REAL GROOVE`, o, o, u * 0.865, u * 0.012);
  }
  g.restore();
  grain(g, S, S, 4, 77);
}

// Things that sit on a played record: hairline scuffs (red), dust and fibres (green),
// and the matrix number hand-scratched into the run-out (blue). Each scuff and speck gets
// its own level, so the shader can bring them in gradually as wear goes up.
export function wearTexture(side) {
  const S = 2048, c = makeCanvas(S, S), g = c.getContext('2d'), o = S / 2, f = side.fmt, m = o / f.disc;
  const rnd = mulberry(hashText((side.tracks[0] && side.tracks[0].title) || 'x') ^ 0x9e3779b9);
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) { // scuffs: mostly short, mostly along the way a sleeve drags
    const lvl = Math.round(40 + 215 * Math.pow(rnd(), 1.6)), a = rnd() * TAU, r = (f.label + rnd() * (f.disc - f.label)) * m;
    const x = o + Math.cos(a) * r, y = o + Math.sin(a) * r, len = (0.004 + rnd() * rnd() * 0.05) * m, dir = a + Math.PI / 2 + (rnd() - 0.5) * 2.2;
    g.strokeStyle = `rgb(${lvl},0,0)`; g.lineWidth = 0.6 + rnd() * 0.9;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(dir) * len * 0.5 + (rnd() - 0.5) * len * 0.2, y + Math.sin(dir) * len * 0.5 + (rnd() - 0.5) * len * 0.2, x + Math.cos(dir) * len, y + Math.sin(dir) * len); g.stroke();
  }
  for (let i = 0; i < 5200; i++) { // dust specks
    const lvl = Math.round(30 + 225 * Math.pow(rnd(), 1.3)), a = rnd() * TAU, r = Math.sqrt(rnd()) * f.disc * m;
    g.fillStyle = `rgb(0,${lvl},0)`; g.beginPath(); g.arc(o + Math.cos(a) * r, o + Math.sin(a) * r, 0.5 + rnd() * rnd() * 1.6, 0, TAU); g.fill();
  }
  for (let i = 0; i < 150; i++) { // fibres
    const lvl = Math.round(30 + 225 * Math.pow(rnd(), 1.3)), a = rnd() * TAU, r = Math.sqrt(rnd()) * f.disc * m;
    const x = o + Math.cos(a) * r, y = o + Math.sin(a) * r, len = (0.001 + rnd() * 0.004) * m, d1 = rnd() * TAU, d2 = d1 + (rnd() - 0.5) * 2.4;
    g.strokeStyle = `rgb(0,${lvl},0)`; g.lineWidth = 0.7 + rnd() * 0.5;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(d1) * len, y + Math.sin(d1) * len, x + Math.cos(d1) * len + Math.cos(d2) * len, y + Math.sin(d1) * len + Math.sin(d2) * len); g.stroke();
  }
  // matrix number in the run-out
  const inner = side.stats ? side.stats.innerRadius : f.innerMin, rr = ((f.lock + Math.max(f.lock + 0.004, inner)) / 2) * m;
  if (inner - f.lock > 0.004) {
    g.fillStyle = 'rgb(0,0,150)';
    g.font = `italic 400 ${Math.max(9, Math.round(0.0026 * m))}px "Bradley Hand", "Segoe Script", "Comic Sans MS", cursive`;
    const code = `GD-${String(hashText(side.tracks.map((t) => t.title).join('|')) % 100000).padStart(5, '0')}-${side.sideName || 'A'}1`;
    arcText(g, code, o, o, rr, Math.PI * 0.82, 0.0006 * m);
    arcText(g, 'Groove Deck', o, o, rr, -Math.PI * 0.3, 0.0005 * m);
  }
  g.globalCompositeOperation = 'source-over';
  return canvasTexture(c, { srgb: false, aniso: 8 });
}


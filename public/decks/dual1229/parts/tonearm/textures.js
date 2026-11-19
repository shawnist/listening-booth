// Tonearm: the printed faces, drawn once on canvases. Owned by the tonearm builder (see OWNERS.md).
//   forceScaleTexture()  the tracking force scale round the spring housing (78): a strip that wraps the drum
//   skateFaceTexture()   the anti-skating knob's face: a red scale (conical) and a white one (elliptical)
//   legendTexture(w, d)  white print on the escutcheon's legend panel and round the dial
//   cueTexture()         the two lift symbols on the front strip beside the lift handle
//   stripeTexture(n)     white index lines on a black knurled ring (counterweight fine balance)
//   streakTexture()      fine streaks along the arm tube (satin drawn aluminium)
import * as THREE from 'three';
import { makeCanvas, canvasTexture } from '../../../../deck3d/textures.js';
import { SPEC } from '../../spec.js';

const FONT = 'Helvetica, Arial, sans-serif';
const TAU = Math.PI * 2;

// Where value v of the tracking force scale sits round the drum, as a fraction of a turn from
// where the strip starts. The drum turns through 0.8 of a turn over 0..3 g (arm.js setForce), and
// the value at the pointer on top is the one set.
export const forceU = (v) => (0.5 + 0.8 * (v / SPEC.trackingForce.max)) % 1;

export function forceScaleTexture() {
  const W = 2048, H = 160, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#efeee8'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#18181a'; g.strokeStyle = '#18181a';
  const T = SPEC.trackingForce;
  for (let v = 0; v <= T.max + 1e-6; v += v < T.split - 1e-6 ? T.fine : T.coarse) {
    const x = forceU(v) * W, whole = Math.abs(v - Math.round(v)) < 1e-6, half = Math.abs(v * 2 - Math.round(v * 2)) < 1e-6;
    g.lineWidth = whole ? 7 : 4;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, whole ? 70 : half ? 54 : 38); g.stroke();
    // the figures stand upright as one looks at the drum from the front: turned a quarter on the strip
    if (half) { g.save(); g.translate(x, 112); g.rotate(Math.PI / 2); g.font = `600 ${whole ? 58 : 44}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(whole ? String(Math.round(v)) : `${Math.floor(v + 1e-6) || ''}.5`, 0, 0); g.restore(); }
  }
  // the 0.1 g dots below 1.5 g (the manual's "Markierungspunkte")
  for (let v = 0.1; v < T.split; v += 0.1) if (Math.abs(v * 2 - Math.round(v * 2)) > 1e-6) { g.beginPath(); g.arc(forceU(v) * W, 92, 5, 0, TAU); g.fill(); }
  return canvasTexture(c);
}

// The anti-skating dial. Angles are clockwise from the rear (the top of the dial as one stands in
// front of the deck). Both scales start at a shared 0 at about eleven o'clock: red runs clockwise
// to 3 at four o'clock, white anticlockwise to 3 at five o'clock (T2, V-bX 4:10). The deck reads it
// at a white index on the left (nine o'clock).
// SKATE and skateAngle live in anti-skate-contact.js (pure), so the mechanism can turn the cam too.
import { SKATE, skateAngle } from '../../anti-skate-contact.js';
export { SKATE, skateAngle };

export function skateFaceTexture() {
  // Owner's close-ups of a plain 1229 (2026-11-19): every figure is white and stands upright as read
  // with 0 at the top; only the right-hand ticks are red. Fine ticks fill 0..1 on each scale, coarser
  // ones follow, and a small dot sits between the two 3s. Angles keep the SKATE calibration.
  const S = 1024, c = makeCanvas(S, S), g = c.getContext('2d'), m = S / 2, R = S / 2;
  g.fillStyle = '#141416'; g.fillRect(0, 0, S, S);
  const at = (deg, r) => { const a = (deg * Math.PI) / 180; return [m + r * Math.sin(a), m - r * Math.cos(a)]; };
  const red = '#e8564c', white = '#f2f1ec';
  const tick = (deg, len, w, col) => { const [x0, y0] = at(deg, R * 0.995), [x1, y1] = at(deg, R * (0.995 - len));
    g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  for (const [scale, col] of [['white', white], ['red', red]]) {
    for (let i = 1; i <= 10; i++) tick(skateAngle(i / 10, scale), 0.13 + 0.008 * i, 11, col);
    for (let i = 4; i <= 9; i++) tick(skateAngle(i / 3, scale), i % 3 === 0 ? 0.25 : 0.21, 13, col);
  }
  tick(SKATE.zero, 0.13, 11, white);
  const figure = (text, deg) => { const [x, y] = at(deg, R * 0.56); g.save(); g.translate(x, y); g.rotate((SKATE.zero * Math.PI) / 180); g.fillText(text, 0, 0); g.restore(); };
  g.fillStyle = white; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 ${Math.round(S * 0.115)}px ${FONT}`;
  figure('0', SKATE.zero);
  for (let v = 1; v <= 3; v++) { figure(String(v), skateAngle(v, 'red')); figure(String(v), skateAngle(v, 'white')); }
  { const mid = (skateAngle(3, 'red') + skateAngle(3, 'white') + 360) / 2, [x, y] = at(mid, R * 0.74);
    g.fillStyle = '#050506'; g.beginPath(); g.arc(x, y, S * 0.012, 0, TAU); g.fill(); }
  return canvasTexture(c);
}

// The knurled skirt of the anti-skating knob: black ribs, each carrying a bold white bar that stops
// short of the top chamfer (owner's close-ups, 2026-11-19). One rib per repeat; wrap n times.
export function skateSkirtTexture(n = 40) {
  const W = 32, H = 64, c = makeCanvas(W * n, H), g = c.getContext('2d');
  g.fillStyle = '#121214'; g.fillRect(0, 0, W * n, H);
  g.fillStyle = '#e4e3dc'; for (let i = 0; i < n; i++) g.fillRect(i * W + 7, 16, 18, H - 16 - 5);
  const t = canvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

// The escutcheon's legends, on a transparent canvas laid over the plate. (x0, z0) is the canvas's
// top-left corner in metres, w x d its size; the texts' positions are in the same frame.
export function legendTexture(box, items) {
  const PX = 20000, W = Math.round(box.w * PX), H = Math.round(box.d * PX), c = makeCanvas(W, H), g = c.getContext('2d');
  const P = (x, z) => [(x - box.x0) * PX, (z - box.z0) * PX];
  g.fillStyle = '#ecebe6'; g.strokeStyle = '#ecebe6';
  for (const it of items) {
    const [x, y] = P(it.x, it.z);
    if (it.text) {
      g.font = `${it.weight || 500} ${it.size * PX}px ${FONT}`; g.textAlign = it.align || 'center'; g.textBaseline = 'middle';
      g.fillText(it.text, x, y);
    } else if (it.tri) { // the anti-skating index: a filled triangle pointing right, at the dial
      const s = it.tri * PX; g.beginPath(); g.moveTo(x + s * 0.55, y); g.lineTo(x - s * 0.45, y - s * 0.55); g.lineTo(x - s * 0.45, y + s * 0.55); g.closePath(); g.fill();
    } else if (it.ring) { g.lineWidth = it.ring * 0.25 * PX; g.beginPath(); g.arc(x, y, it.ring * PX, 0, TAU); g.stroke(); }
    else if (it.angle) { // the "tracking" angle sign: two strokes meeting at a point, with an arc
      const s = it.angle * PX, vx = x - s * 0.45, vy = y + s * 0.32; g.lineWidth = s * 0.11; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x + s * 0.4, y - s * 0.42); g.lineTo(vx, vy); g.lineTo(x + s * 0.5, vy); g.stroke();
      g.beginPath(); g.arc(vx, vy, s * 0.55, -0.72, 0); g.stroke();
    } else if (it.line) { const [x1, y1] = P(it.line[0], it.line[1]); g.lineWidth = it.w * PX; g.beginPath(); g.moveTo(x, y); g.lineTo(x1, y1); g.stroke(); }
  }
  return canvasTexture(c);
}

// The lift symbols, black on the aluminium strip: at the rear a triangle down onto a bar
// (lowered), in front a triangle above a gap and a bar (raised), 14.6 mm apart (Fig. 30).
export function cueTexture() {
  const W = 120, H = 400, c = makeCanvas(W, H), g = c.getContext('2d'); // 6.5 x 21.7 mm
  g.fillStyle = '#1a1a1c';
  const sym = (cy, gap) => {
    g.beginPath(); g.moveTo(60 - 30, cy - 20); g.lineTo(60 + 30, cy - 20); g.lineTo(60, cy + 12); g.closePath(); g.fill();
    g.fillRect(60 - 30, cy + 12 + gap, 60, 7);
  };
  sym(70, 1); sym(318, 18);
  return canvasTexture(c);
}

// Index lines on a knurled ring: black with n white lines, wrapped round a cylinder.
export function stripeTexture(n = 48) {
  const W = n * 16, c = makeCanvas(W, 16), g = c.getContext('2d');
  g.fillStyle = '#1b1b1d'; g.fillRect(0, 0, W, 16);
  g.fillStyle = '#d9d8d2'; for (let i = 0; i < n; i++) g.fillRect(i * 16 + 6, 0, 4, 16);
  const t = canvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

// Drawn-tube streaks: fine grey lines running along a cylinder's length (variation across u only),
// for a roughness or bump map on the satin aluminium arm tube.
export function streakTexture(n = 512, seed = 11) {
  const c = makeCanvas(n, 4), g = c.getContext('2d');
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let v = 128;
  for (let x = 0; x < n; x++) {
    v = 128 + (v - 128) * 0.5 + (rnd() - 0.5) * 70;
    const k = Math.max(0, Math.min(255, Math.round(v)));
    g.fillStyle = `rgb(${k},${k},${k})`; g.fillRect(x, 0, 1, 4);
  }
  const t = canvasTexture(c, { srgb: false }); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// The outside's printed faces: the brushed-aluminium front strip with every legend of the inch strip
// (DECISIONS D2), the badge tile (the UA diamond), the base's "universal audio" badge and the strobe window's
// figures. Plain canvas drawing; positions come from place.js. Owned by the outside builder.
import * as THREE from 'three';
import { makeCanvas, canvasTexture, mulberry } from '../../../../deck3d/textures.js';
import { LEGENDS, CONTROLS as C } from './place.js';
import { UA_MARK, UA_BOX } from '../../../../deck3d/ua-mark.js';

const D = Math.PI / 180;
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const INK = '#16171a';

// The front strip's print, two canvases over the box b (metres, x0..x1 by z0..z1): the colour (brushed
// aluminium, fine horizontal hairlines, every legend in black) and a roughness map (green, as three.js
// reads it): the aluminium fairly smooth along its hairlines, the ink matte, so the print does not mirror
// the room at a low angle and stays black (O2, O4) instead of washing out to the metal's sheen. The ink
// keeps the strip's metalness: black at metalness 0.72 reflects almost nothing (F0 ~0.01), and a uniform
// metalness keeps small print dark where the texture is minified (O1 straight down, the seated view): a
// non-metallic ink mask averaged into the metal's mip levels made thin figures lighter than the strip.
// pxPerM: canvas resolution.
// Seen from the overview the strip is drawn from its smaller mip levels, where plain averaging thinned the
// legends to pale grey (O2: clearly black). So the colour map carries its own mip chain: each level is the
// bare brushed metal, averaged down, with the ink laid over it at its averaged coverage made heavier the
// further down the chain it is (INK_MIP), so a figure that is a few pixels across still reads black.
export const STRIP_FINISH = { metal: 0.2, ink: 0.85 }; // roughness of each (the material's roughness is 1)
export const INK_MIP = 0.55; // ink coverage at mip level k is multiplied by 1 + INK_MIP * k (capped at 1)
export function stripTexture(b, pxPerM = 11000, layout = {}) {
  const W = Math.round((b.x1 - b.x0) * pxPerM), H = Math.round((b.z1 - b.z0) * pxPerM), s = pxPerM;
  const c = makeCanvas(W, H), g = c.getContext('2d'), mc = makeCanvas(W, H), m = mc.getContext('2d');
  const X = (x) => (x - b.x0) * s, Y = (z) => (z - b.z0) * s;
  g.fillStyle = '#c4c6c9'; g.fillRect(0, 0, W, H);
  const rough = (k) => Math.round(Math.max(0, Math.min(1, k)) * 255);
  m.fillStyle = `rgb(0,${rough(STRIP_FINISH.metal)},0)`; m.fillRect(0, 0, W, H);
  const rnd = mulberry(9);
  for (let i = 0; i < 9000; i++) {
    const y = rnd() * H, l = 80 + rnd() * 1200, x = rnd() * W, v = 150 + rnd() * 95, a = 0.07 + rnd() * 0.12, lw = 0.6 + rnd() * 1.6;
    g.strokeStyle = `rgba(${v},${v},${v + 4},${a})`; g.lineWidth = lw;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y); g.stroke();
    // the hairlines vary the sheen a little too: lighter lines a touch smoother
    m.strokeStyle = `rgba(0,${rough(STRIP_FINISH.metal + (195 - v) / 900)},0,${a * 2})`; m.lineWidth = lw;
    m.beginPath(); m.moveTo(x, y); m.lineTo(x + l, y); m.stroke();
  }
  const bare = makeCanvas(W, H); bare.getContext('2d').drawImage(c, 0, 0); // the metal before printing
  const ink = makeCanvas(W, H), k = ink.getContext('2d'); k.fillStyle = '#000'; k.fillRect(0, 0, W, H);
  printLegends(k, X, Y, s, '#fff', layout); // where the ink is
  printLegends(g, X, Y, s, INK, layout);
  printLegends(m, X, Y, s, `rgb(0,${rough(STRIP_FINISH.ink)},0)`, layout);
  const map = canvasTexture(c, { aniso: 8 });
  map.mipmaps = inkMips(c, bare, ink, INK); map.generateMipmaps = false;
  return { map, finish: canvasTexture(mc, { aniso: 8, srgb: false }) };
}

// The colour map's mip chain, down to 1 x 1: level 0 as printed; below it the bare metal and the ink mask,
// each halved from the level above, and the ink laid over the metal at its coverage times 1 + INK_MIP * k.
function inkMips(top, bare, ink, colour) {
  const half = (src) => {
    const d = makeCanvas(Math.max(1, src.width >> 1), Math.max(1, src.height >> 1)), x = d.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, d.width, d.height);
    return d;
  };
  const ic = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
  const levels = [top];
  let b = bare, m = ink;
  for (let lv = 1; b.width > 1 || b.height > 1; lv++) {
    b = half(b); m = half(m);
    const out = makeCanvas(b.width, b.height), o = out.getContext('2d');
    const px = b.getContext('2d').getImageData(0, 0, b.width, b.height), mk = m.getContext('2d').getImageData(0, 0, b.width, b.height).data, d = px.data;
    const boost = 1 + INK_MIP * lv;
    for (let i = 0; i < d.length; i += 4) {
      const a = Math.min(1, (mk[i] / 255) * boost);
      if (a > 0) for (let j = 0; j < 3; j++) d[i + j] = d[i + j] + (ic[j] - d[i + j]) * a;
    }
    o.putImageData(px, 0, 0);
    levels.push(out);
  }
  return levels;
}

// Every legend of the inch strip, in one ink, onto the context g (X, Y: metres to pixels; s: px per m).
function printLegends(g, X, Y, s, ink, { legends = LEGENDS, controls = C } = {}) {
  g.fillStyle = ink; g.strokeStyle = ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  // text: h is the height of a figure (cap height); the baseline sits h/2 below the given centre
  // A medium weight with a fine outline round each glyph: the strip's print is a little heavier than a
  // regular face (O2, O4), and it has to stay black when the strip is seen small.
  g.lineJoin = 'round';
  for (const t of legends.text) {
    g.font = `${t.weight || 500} ${(t.h / 0.71) * s}px ${SANS}`;
    const lower = t.s === t.s.toLowerCase() && /[a-z]/.test(t.s);
    const cap = lower ? t.h * 0.74 : t.h; // lower-case words: x-height about the figures' height
    g.fillText(t.s, X(t.x), Y(t.z) + (cap / 2) * s);
    g.lineWidth = t.h * 0.03 * s; g.strokeText(t.s, X(t.x), Y(t.z) + (cap / 2) * s);
  }
  // the pitch scale round the wheel: arc with hooked ends, ticks, - and +
  const P = legends.pitch, cx = X(controls.pitch.x), cy = Y(controls.pitch.z), lw = 0.00028 * s;
  g.lineWidth = lw; g.lineCap = 'butt';
  const a0 = -Math.PI / 2 - P.arcDeg * D, a1 = -Math.PI / 2 + P.arcDeg * D;
  g.beginPath(); g.arc(cx, cy, P.arcR * s, a0, a1); g.stroke();
  for (const a of [a0, a1]) { // the hooks turn in toward the wheel
    g.beginPath(); g.moveTo(cx + Math.cos(a) * P.arcR * s, cy + Math.sin(a) * P.arcR * s);
    g.lineTo(cx + Math.cos(a) * (P.arcR - P.hook) * s, cy + Math.sin(a) * (P.arcR - P.hook) * s); g.stroke();
  }
  g.lineWidth = 0.00032 * s;
  for (const d of P.ticks) for (const side of [-1, 1]) {
    const a = -Math.PI / 2 + side * d * D;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * P.tickR[0] * s, cy + Math.sin(a) * P.tickR[0] * s);
    g.lineTo(cx + Math.cos(a) * P.tickR[1] * s, cy + Math.sin(a) * P.tickR[1] * s); g.stroke();
  }
  const sign = (side, plus) => {
    const a = -Math.PI / 2 + side * P.signDeg * D, x = cx + Math.cos(a) * P.signR * s, y = cy + Math.sin(a) * P.signR * s, k = 0.0011 * s;
    g.lineWidth = 0.00034 * s;
    g.beginPath(); g.moveTo(x - k, y); g.lineTo(x + k, y); if (plus) { g.moveTo(x, y - k); g.lineTo(x, y + k); } g.stroke();
  };
  sign(-1, false); sign(1, true);
  // the cue symbols: a triangle pointing down with a bar above (arm raised) and below (lowered)
  const Q = legends.cue, q = Q.size * s;
  Q.z.forEach((z, i) => {
    const x = X(Q.x), y = Y(z);
    g.beginPath(); g.moveTo(x - q / 2, y - q * 0.3); g.lineTo(x + q / 2, y - q * 0.3); g.lineTo(x, y + q * 0.42); g.closePath(); g.fill();
    const by = i === 0 ? y - q * 0.58 : y + q * 0.68;
    g.fillRect(x - q / 2, by - q * 0.09, q, q * 0.18);
  });
}

// The black badge tile: the Universal Audio diamond (owner, 2026-11-18; it replaced the "Dual" word)
// in the tile's off-white on its black, a fine raised edge. The mark is the diamond and UA monogram of
// UA's own logo artwork (deck3d/ua-mark.js).
export function badgeTexture(w, d) {
  const W = 512, H = Math.round((W * d) / w), c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#0e0e10'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#3a3b3f'; g.lineWidth = W * 0.035; g.strokeRect(W * 0.03, H * 0.03, W * 0.94, H * 0.94);
  const k = Math.min((W * 0.8) / UA_BOX.w, (H * 0.8) / UA_BOX.h); // the diamond across 80 % of the tile
  g.save();
  g.translate(W / 2, H / 2); g.scale(k, k); g.translate(-(UA_BOX.x0 + UA_BOX.w / 2), -(UA_BOX.y0 + UA_BOX.h / 2));
  g.fillStyle = '#f3f1ea';
  // Path2D is a browser API: the plain-Node tests that build the deck draw the tile without its mark
  if (typeof Path2D === 'function') for (const d of UA_MARK) g.fill(new Path2D(d));
  g.restore();
  return canvasTexture(c, { aniso: 8 });
}

// A small badge face: words on a plain ground.
export function plainBadgeTexture(lines, w, h, bg = '#101012', fg = '#f2f0ea', weight = 700) {
  const W = 512, H = Math.round((W * h) / w), c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const px = Math.min(H / (lines.length + 0.8), (W * 1.5) / Math.max(...lines.map((l) => l.length)));
  g.font = `${weight} ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  lines.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * px * 1.05));
  return canvasTexture(c, { aniso: 8 });
}

// The strobe window's glass, seen from above: black, with "45" printed above the bars and "33" below
// (dFn 2:22). uv (0..1) over the window's disc; v = 1 toward the back.
export function windowTexture() {
  const N = 256, c = makeCanvas(N, N), g = c.getContext('2d');
  g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, N, N); // dark glass; the shader draws the lit bars over it
  g.fillStyle = '#5d5e62'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `400 ${N * 0.2}px ${SANS}`;
  g.fillText('45', N * 0.5, N * 0.22); g.fillText('33', N * 0.5, N * 0.79);
  return canvasTexture(c, { aniso: 8 });
}

// Vertex colours for a knurl whose ribs show white on black (the pitch wheel O4, the strobe window P3):
// only the flat outer faces of the ribs (normal pointing straight out) take tip; the flanks, the roots
// and the faces stay root; the flat top and bottom take cap.
export function ridgeColours(geo, rTip, depth, tip, root, cap = root) {
  const p = geo.attributes.position, n = geo.attributes.normal, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), out = r > 0 ? (n.getX(i) * x + n.getZ(i) * z) / r : 0;
    const v = Math.abs(n.getY(i)) > 0.7 ? cap : r > rTip - depth * 0.2 && out > 0.97 ? tip : root;
    col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v * 1.02;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

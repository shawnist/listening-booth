// The deck you see and touch: a 3D turntable, and the hands that work it.
// This file owns everything inside the #deck canvas. It talks to the rest of the app only
// through `state` (read) and `actions` (calls). See createDeckView's contract below.
// The parts are built in deck3d/: hardware.js (plinth, platter, controls), tonearm.js,
// record.js (the vinyl, shaded from the real groove map), textures.js and layout.js.
import * as THREE from 'three';
import { studioEnvironment } from './deck3d/studio.js';
import { FS } from './dsp.js';
import { DECKS } from './rig.js';
import {
  TAU, REST, PLINTH, Y_TABLE, R_PLATTER, Y_REC, Y_MAT, Y_GRAB, LIFT, STROBE, CONTROLS, smooth, smoother, clamp,
} from './deck3d/layout.js';
import { makeMaterials, createHardware } from './deck3d/hardware.js';
import { createTonearm } from './deck3d/tonearm.js';
import { createRecord } from './deck3d/record.js';
import { TABLES } from './decks/registry.js';

const wrapAngle = (a) => a - TAU * Math.round(a / TAU);
const CUT = { land: 0.35, pass: 1.6, leave: 0.45 }; // seconds: disc lands, cutter crosses, cutter lifts away
const CUTTER_ANGLE = (200 * Math.PI) / 180; // where the cutter head works, away from the tonearm

// createDeckView({ canvas, state, actions }) -> view
//   state (read every frame): st (engine status: discPos, rev, wr, wp, radius, down), stAt,
//     side (cut record or null), deck (key into DECKS), cart, power, rpm, pitch, surface, ecc.
//     The view also writes state.armRadius and state.armDrag while the arm is in the hand,
//     state.touching while a hand is on the record, and state.reveal during the cutting pass.
//   side (optional extras, used when present): artUrl (image for the label), sideName, title,
//     artist, wear: { dust: 0..1 }.
//   actions: audio() -> Promise, armMove(radius), drop(radius), rest(), lift(),
//     lower(radius) (set down softly by the cue lever: leaves no mark on the record),
//     touchStart(), touchMove(revolutions, clockwise positive), touchEnd(),
//     togglePower(), setSpeed(rpm), setPitch(percent), hint(text)
//   view: setRecord(side | null) puts a freshly cut record on the platter;
//     pointForHeadshell(radius?) and pointForRecord(radius, angle) return page pixel positions
//     for whatever camera is showing (used by the browser test, so it does not depend on how
//     the deck is drawn). Also: setView('seated' | 'top' | 'stylus'), view (current name),
//     pointForControl('start' | 's33' | 's45' | 'pitch' | 'cue'), lowerAt(radius) (swing the
//     arm there and lower it gently; drop() is sent when it lands), info().
//     setInsets({ top, right, bottom, left }) says how much of the canvas, in CSS pixels, the
//     rest of the screen covers (a bar, a shelf, a drawer): the deck is fitted into what is left.
//     outline('platter' | 'plinth') returns page positions round the platter rim or at the
//     corners of the plinth, for showing where a record dragged from the shelf may be put down.
//   Turntables (decks/registry.js): state.table picks one. A table with a model of its own (the
//     Dual 1229) is drawn by that model, and its arm is placed by its controller, state.tableCtl
//     (armPose(), hand(r), and actions.armRelease() when the hand lets go). Its controls are hit
//     shapes named 'dual:…', handed to model.control(). setXray(on), xray, highlightPart(key).
export function createDeckView({ canvas, state, actions }) {
  // ---- a WebGL canvas ----------------------------------------------------------------------
  const attrs = { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance' };
  let gl = canvas.getContext('webgl2', attrs);
  if (!gl) { // the canvas already holds another kind of drawing context: swap in a fresh one
    const fresh = canvas.cloneNode(false);
    canvas.replaceWith(fresh); canvas = fresh;
    gl = canvas.getContext('webgl2', attrs);
  }
  const wrap = canvas.parentElement;
  if (!gl) {
    const msg = document.createElement('div');
    msg.className = 'deck-nogl'; msg.textContent = 'This browser cannot draw the 3D deck (WebGL 2 is unavailable). The deck controls in the Workbench still work.';
    wrap.append(msg);
    const centre = () => { const b = wrap.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
    return { setRecord() {}, pointForHeadshell: centre, pointForRecord: centre, pointForControl: centre, setView() {}, setInsets() {}, outline: () => [], view: 'none', info: () => ({ webgl: false }) };
  }

  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  const maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const KEY_DIR = new THREE.Vector3(-0.62, 1.15, -0.58);
  scene.environment = studioEnvironment(renderer, KEY_DIR);
  scene.environmentIntensity = 1.0;

  const mid = { x: (PLINTH.x0 + PLINTH.x1) / 2, z: (PLINTH.z0 + PLINTH.z1) / 2 };
  const key = new THREE.DirectionalLight(0xfff0dc, 2.3); // a window, up and behind to the left
  key.position.set(mid.x + KEY_DIR.x, KEY_DIR.y, mid.z + KEY_DIR.z); key.target.position.set(mid.x, 0, mid.z);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -0.36, right: 0.36, top: 0.36, bottom: -0.36, near: 0.6, far: 2.4 });
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.001; key.shadow.radius = 2.6;
  const fill = new THREE.DirectionalLight(0xdce6ff, 0.55); // cooler, from the front right
  fill.position.set(mid.x + 0.75, 0.8, mid.z + 0.65); fill.target.position.set(mid.x, 0, mid.z);
  key.layers.enableAll(); fill.layers.enableAll(); // also light the component inspection cameras
  scene.add(key, key.target, fill, fill.target);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 12);
  const M = makeMaterials();
  const hw = createHardware(M, maxAniso);
  scene.add(hw.root);
  const record = createRecord({ maxAnisotropy: maxAniso });
  record.group.position.y = Y_REC;
  scene.add(record.group);
  let arm = null, deckKey = null, genericArm = null;
  function buildArm() {
    if (genericArm) { scene.remove(genericArm.group); genericArm.dispose(); }
    deckKey = DECKS[state.deck] ? state.deck : 'dd';
    arm = genericArm = createTonearm(M, DECKS[deckKey]);
    scene.add(arm.group);
    hw.felt.visible = deckKey !== 'belt'; hw.rubberMat.visible = deckKey === 'belt';
    hw.setPlate(deckKey);
  }
  buildArm();

  // ---- which turntable: the original deck, or a table with a model of its own ----------------
  // The table top, its shadow and the lathe's cutter belong to the room and stay for every table.
  const ROOM_PARTS = new Set([hw.ground, hw.cutter]);
  // The table top (and the soft shadow on it) stands where the deck on it needs it: a table with
  // a model of its own may be taller or shorter (model.tableY), while the record stays put.
  const blob = hw.root.children.find((c) => c.renderOrder === -1);
  const room0 = { groundY: hw.ground.position.y, blob: blob ? blob.position.clone() : null };
  function placeRoom(m) {
    const y = m && m.tableY !== undefined ? m.tableY : room0.groundY;
    hw.ground.position.y = y;
    if (blob) {
      if (m) blob.position.set((m.box.x0 + m.box.x1) / 2, y + 0.0005, (m.box.z0 + m.box.z1) / 2 + 0.004);
      else blob.position.copy(room0.blob);
    }
    return y;
  }
  const restR = () => (model && model.restR) || REST; // where this table's arm rests (the Dual's is its own)
  const models = {}; // each table's model is built once and kept for switching back
  let tableKey = 'gd', model = null, adapterOn = false;
  // The reconstruction's mat datum is independent of the historical D7 surface.
  // This is a selected rendering scenario; it does not resize any CAD hardware.
  const cadActive = () => model?.cad.status.state === 'ready' && model.cad.status.enabled;
  // Use the installed engine datum, including a deferred CAD toggle during a
  // cycle. The mat is one record thickness below that shared surface.
  // The procedural deck is a fallback, not a loading placeholder. Keep the
  // canvas layout and frame loop alive while the selected CAD is installed.
  const loadingMessage = document.createElement('div');
  loadingMessage.className = 'deck-loading'; loadingMessage.setAttribute('role', 'status');
  loadingMessage.hidden = true; wrap.append(loadingMessage);
  canvas.style.visibility = 'hidden';
  function presentDeck() {
    const cad = model?.cad;
    const pending = !!(cad?.status.enabled && (cad.status.state === 'loading' ||
      (cad.status.state === 'ready' && !cad.root.visible)));
    const failed = !!(cad?.status.enabled && cad.status.state === 'error');
    canvas.style.visibility = pending ? 'hidden' : '';
    canvas.setAttribute('aria-busy', String(pending));
    loadingMessage.hidden = !pending && !failed;
    loadingMessage.classList.toggle('fallback', failed);
    const text = failed ? 'Detailed deck could not load. Showing the simplified deck.' : 'Loading deck…';
    if (loadingMessage.textContent !== text) loadingMessage.textContent = text;
  }
  const recordY = () => tableCtl()?.mech.recordSurface ?? Y_REC;
  const matY = () => recordY() - (Y_REC - Y_MAT);
  const T = () => model || hw; // whichever hardware is showing
  function buildTable() {
    const want = TABLES[state.table] && TABLES[state.table].createModel ? state.table : 'gd';
    if (want === tableKey) return;
    tableKey = want;
    selectedPart = null;
    if (model) { model.setXray(false, record); model.highlight(null); scene.remove(model.root); model.adapter.visible = false; model = null; }
    const generic = want === 'gd';
    for (const c of hw.root.children) {
      if (ROOM_PARTS.has(c) || c.renderOrder === -1) continue; // the shadow under the deck stays too
      if (!generic) { c.userData.wasVisible = c.visible; c.visible = false; } else if (c.userData.wasVisible !== undefined) { c.visible = c.userData.wasVisible; delete c.userData.wasVisible; }
    }
    if (genericArm) genericArm.group.visible = generic;
    if (generic) { arm = genericArm; if (state.deck !== deckKey) buildArm(); V.xray = false; }
    else {
      model = models[want] || (models[want] = TABLES[want].createModel({ M, maxAniso }));
      scene.add(model.root);
      arm = model.arm;
      model.setXray(V.xray, record);
    }
    T().adapter.visible = adapterOn;
    const b = model ? model.box : PLINTH;
    BOX = { x0: b.x0 - 0.014, x1: b.x1 + 0.014, y0: placeRoom(model), y1: 0.072, z0: b.z0 - 0.014, z1: b.z1 + 0.014 };
    VIEWS = { ...BASE_VIEWS, ...(model ? model.views : {}) };
    if (!VIEWS[V.view]) V.view = 'seated';
    buildViewBar();
    hoverPart(null);
  }
  function setXray(on) {
    V.xray = !!on && !!model;
    if (model) model.setXray(V.xray, record);
    if (!V.xray) { selectPart(null); hoverPart(null); }
  }

  // ---- the picture: what the owner may change about the camera and the light ----------------
  const KEY_LEN = KEY_DIR.length();
  const LOOK = {
    zoom: 1, panX: 0, panY: 0, // camera: closer or further, and slid sideways or up
    // The light starts as the owner set it (2026-11-18): brightness 76 %, warm, direction 229 deg on
    // the View panel's dial (the dial reads angle + 180), mid height, room light 104 %.
    brightness: 0.76, // overall exposure
    warmth: 0.83, // 0 cool daylight .. 1 warm lamp
    angle: 49, // where the main light stands round the deck (degrees)
    height: 61, // how high it stands (degrees above the table)
    room: 1.04, // how much the rest of the room lights the deck
    shadows: true,
    surface: 'charcoal', // what the deck stands on
  };
  const LOOK0 = { ...LOOK };
  const SURFACES = { charcoal: 0x1b1917, walnut: 0x38261a, stone: 0x56534e, linen: 0x8d8678, black: 0x050505 };
  const COOL = new THREE.Color(0xd6e4ff), NEUTRAL = new THREE.Color(0xfff0dc), WARM = new THREE.Color(0xffc387);
  const lookListeners = [];
  let envTimer = 0, envDir = KEY_DIR.clone();
  function applyLook(what = {}, quiet = false) {
    for (const k of Object.keys(what)) if (k in LOOK && what[k] !== undefined) LOOK[k] = what[k];
    LOOK.zoom = clamp(+LOOK.zoom || 1, 0.5, 5); LOOK.panX = clamp(+LOOK.panX || 0, -0.3, 0.3); LOOK.panY = clamp(+LOOK.panY || 0, -0.2, 0.2);
    LOOK.brightness = clamp(+LOOK.brightness || 1, 0.25, 2.2); LOOK.warmth = clamp(+LOOK.warmth, 0, 1);
    LOOK.height = clamp(+LOOK.height, 6, 88); LOOK.room = clamp(+LOOK.room, 0, 2);
    if (!(LOOK.surface in SURFACES)) LOOK.surface = 'charcoal';
    renderer.toneMappingExposure = 1.12 * LOOK.brightness;
    key.color.copy(LOOK.warmth < 0.5 ? COOL.clone().lerp(NEUTRAL, LOOK.warmth * 2) : NEUTRAL.clone().lerp(WARM, (LOOK.warmth - 0.5) * 2));
    const a = (LOOK.angle * Math.PI) / 180, e = (LOOK.height * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).multiplyScalar(KEY_LEN);
    key.position.set(mid.x + dir.x, dir.y, mid.z + dir.z);
    key.castShadow = !!LOOK.shadows;
    scene.environmentIntensity = LOOK.room; fill.intensity = 0.55 * LOOK.room;
    hw.ground.material.color.setHex(SURFACES[LOOK.surface]);
    if (dir.distanceTo(envDir) > 0.02) { // the reflections follow the light, a moment after it stops moving
      envDir = dir; clearTimeout(envTimer);
      envTimer = setTimeout(() => { const old = scene.environment; scene.environment = studioEnvironment(renderer, envDir); if (old) old.dispose(); }, 160);
    }
    if (!quiet) for (const fn of lookListeners) fn({ ...LOOK });
  }
  applyLook({}, true); // start in the default light, not the key light's built-in place

  // ---- what the view keeps track of ---------------------------------------------------------
  const V = {
    disc: 0, plat: 0, psi33: 0, psi45: 0, lamp: 0,
    rVis: REST, rVel: 0, lift: 1, pending: null, bounce: 9, hop: 0,
    cutT: Infinity, last: 0, fps: 60, slow: 0, cap: 2, dpr: 1, dprLock: false,
    press: { start: 0, s33: 0, s45: 0 }, cueNudge: 0, width: 0, height: 0,
    view: 'seated', from: null, tweenT: 1, orbit: { az: 0, el: 0 }, pose: null, drift: { psi33: 0, psi45: 0 },
    zoomNow: 1, panNow: { x: 0, y: 0 }, xray: false, lastH: 0, frozen: false, frames: 0,
    inset: { top: 0, right: 0, bottom: 0, left: 0 }, insetGoal: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  // The part of the canvas the deck is fitted into: what is left once the rest of the screen
  // (a bar along the top, a shelf along the bottom, a drawer at the side) has taken its room.
  const room = () => {
    const i = V.inset;
    return { x: i.left, y: i.top, w: Math.max(160, V.width - i.left - i.right), h: Math.max(120, V.height - i.top - i.bottom) };
  };
  const roomSettled = () => ['top', 'right', 'bottom', 'left'].every((k) => V.inset[k] === V.insetGoal[k]);

  // ---- camera -----------------------------------------------------------------------------
  const BASE_VIEWS = {
    seated: { label: 'Seated', tip: 'The deck as you sit at it', az: -0.17, el: 0.72, fov: 30, fit: true },
    top: { label: 'Top', tip: 'Straight down, for careful cueing', az: 0, el: Math.PI / 2, fov: 22, fit: true },
    stylus: { label: 'Stylus', tip: 'Close on the needle in the groove', az: -0.62, el: 0.27, fov: 30, dist: 0.2 },
  };
  let VIEWS = { ...BASE_VIEWS }; // and a table's own views (the Dual's X-ray, Under and Cam)
  let BOX = { x0: PLINTH.x0 - 0.014, x1: PLINTH.x1 + 0.014, y0: Y_TABLE, y1: 0.072, z0: PLINTH.z0 - 0.014, z1: PLINTH.z1 + 0.014 };
  const basis = (az, el) => {
    const ce = Math.cos(el), dir = new THREE.Vector3(Math.sin(az) * ce, Math.sin(el), Math.cos(az) * ce);
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az)), up = new THREE.Vector3().crossVectors(dir, right);
    return { dir, right, up };
  };
  function fitPose(az, el, fov, aspect) {
    const { dir, right, up } = basis(az, el), tanV = Math.tan((fov * Math.PI) / 360), tanH = tanV * aspect;
    const t = new THREE.Vector3((BOX.x0 + BOX.x1) / 2, (BOX.y0 + BOX.y1) / 2, (BOX.z0 + BOX.z1) / 2), q = new THREE.Vector3();
    const mx = 0.94, my = 0.9;
    let d = 1;
    for (let it = 0; it < 4; it++) {
      d = 0;
      const pts = [];
      for (const x of [BOX.x0, BOX.x1]) for (const y of [BOX.y0, BOX.y1]) for (const z of [BOX.z0, BOX.z1]) {
        q.set(x, y, z).sub(t);
        const p = { x: q.dot(right), y: q.dot(up), z: q.dot(dir) };
        pts.push(p);
        d = Math.max(d, p.z + Math.abs(p.x) / (mx * tanH), p.z + Math.abs(p.y) / (my * tanV));
      }
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const p of pts) { const nx = p.x / ((d - p.z) * tanH), ny = p.y / ((d - p.z) * tanV); x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny); }
      t.addScaledVector(right, ((x0 + x1) / 2) * d * tanH).addScaledVector(up, ((y0 + y1) / 2) * d * tanV);
    }
    return { t, az, el, dist: d, fov };
  }
  function goalPose(name) {
    const v = VIEWS[name], rm = room(), aspect = rm.w / rm.h || 1.3;
    const az = v.az + V.orbit.az, el = clamp(v.el + V.orbit.el, v.elMin !== undefined ? v.elMin : 0.12, Math.PI / 2);
    if (v.fit) return framed(fitPose(az, el, v.fov, aspect));
    if (v.target) {
      // Keep long parts inside the inspection frame as the viewport narrows.
      const scale = v.minAspect ? Math.max(1, v.minAspect / aspect) : (aspect < 1 ? 1.3 : 1);
      return framed({ t: new THREE.Vector3(...v.target), az, el, dist: v.dist * scale, fov: v.fov });
    }
    const s = arm.stylusXZ(V.rVis);
    return framed({ t: new THREE.Vector3(s.x - 0.012, Y_REC + 0.004, s.z - 0.004), az, el, dist: v.dist * (aspect < 1 ? 1.25 : 1), fov: v.fov });
  }
  // The owner's zoom and slide, on top of a view's own framing.
  function framed(p) {
    if (V.zoomNow !== 1) p.dist /= V.zoomNow;
    if (V.panNow.x || V.panNow.y) { const { right, up } = basis(p.az, p.el); p.t.addScaledVector(right, V.panNow.x).addScaledVector(up, V.panNow.y); }
    return p;
  }
  function applyPose(p) {
    const { dir, up } = basis(p.az, p.el);
    const rm = room();
    camera.fov = p.fov; camera.aspect = rm.w / rm.h || 1;
    // the pose is worked out for the free room; the canvas shows that and what lies under the rest
    if (rm.w !== V.width || rm.h !== V.height) camera.setViewOffset(rm.w, rm.h, -rm.x, -rm.y, V.width, V.height);
    else if (camera.view) camera.clearViewOffset();
    camera.near = Math.max(0.01, p.dist * 0.1); camera.far = p.dist + 4;
    camera.position.copy(p.t).addScaledVector(dir, p.dist);
    camera.up.copy(up); camera.lookAt(p.t);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    V.pose = p;
  }
  function updateCamera(dt) {
    const ease = dt > 0 ? Math.min(1, dt * 12) : 1;
    V.zoomNow += (LOOK.zoom - V.zoomNow) * ease; if (Math.abs(LOOK.zoom - V.zoomNow) < 0.0005) V.zoomNow = LOOK.zoom;
    V.panNow.x += (LOOK.panX - V.panNow.x) * ease; V.panNow.y += (LOOK.panY - V.panNow.y) * ease;
    const goal = goalPose(V.view);
    if (V.tweenT < 1 && V.from) {
      V.tweenT = Math.min(1, V.tweenT + dt / 0.9);
      const k = smoother(V.tweenT), a = V.from;
      applyPose({ t: a.t.clone().lerp(goal.t, k), az: a.az + (goal.az - a.az) * k, el: a.el + (goal.el - a.el) * k, dist: a.dist + (goal.dist - a.dist) * k, fov: a.fov + (goal.fov - a.fov) * k });
    } else applyPose(goal);
  }
  function setView(name) {
    if (!VIEWS[name]) return;
    if (model) setXray(!!VIEWS[name].xray); // a table's mechanism views look through it; the others do not
    if (name === 'lever' || V.view === 'lever') selectPart(null); // show the natural finish on entry
    if (name === V.view) return;
    V.from = V.pose; V.tweenT = 0; V.view = name; V.orbit.az = 0; V.orbit.el = 0;
    applyLook({ zoom: 1, panX: 0, panY: 0 });
    for (const b of bar.children) b.setAttribute('aria-pressed', String(b.dataset.view === name));
  }

  // view buttons, laid over the corner of the stage
  const bar = document.createElement('div');
  bar.className = 'deckviews'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Camera');
  function buildViewBar() {
    bar.replaceChildren();
    for (const [name, v] of Object.entries(VIEWS)) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = v.label; b.title = `${v.tip} (V cycles views)`; b.dataset.view = name; b.setAttribute('aria-pressed', String(name === V.view));
      if (v.xray) b.classList.add('xr');
      b.addEventListener('click', () => { setView(name); b.blur(); });
      bar.append(b);
    }
  }
  buildViewBar();
  wrap.append(bar);
  // In X-ray the part under the pointer is highlighted; no label pops up beside it (owner, 2026-11-19).
  let selectedPart = null;
  function selectPart(key) {
    selectedPart = key;
    model?.highlight(key);
  }
  function previewPart(key) {
    model?.highlight(selectedPart ?? key);
  }
  function hoverPart(key) {
    previewPart(key);
  }
  canvas.addEventListener('pointerleave', () => hoverPart(null));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'v' && e.key !== 'V') return;
    if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const names = Object.keys(VIEWS); setView(names[(names.indexOf(V.view) + 1) % names.length]);
  });

  function resize() {
    const w = Math.max(1, wrap.clientWidth), h = Math.max(1, wrap.clientHeight);
    V.dpr = Math.min(V.cap, window.devicePixelRatio || 1); // never more than 2: beyond that it only costs
    if (w === V.width && h === V.height && renderer.getPixelRatio() === V.dpr) return;
    V.width = w; V.height = h;
    renderer.setPixelRatio(V.dpr);
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  }
  if (window.ResizeObserver) new ResizeObserver(() => { resize(); if (V.pose) updateCamera(0); }).observe(wrap);

  // ---- from pointer to deck ---------------------------------------------------------------
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = new THREE.Vector3();
  function rayFrom(ev) {
    const b = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
    raycaster.layers.mask = camera.layers.mask;
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray;
  }
  const onPlane = (ray, y) => {
    const t = (y - ray.origin.y) / ray.direction.y;
    return t > 0 && Number.isFinite(t) ? { x: ray.origin.x + t * ray.direction.x, z: ray.origin.z + t * ray.direction.z } : null;
  };
  const touchRadius = () => Math.max(R_PLATTER, state.side ? state.side.fmt.disc : 0);
  const visibleHit = ({ object }) => {
    for (let o = object; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  // What is under the pointer: the headshell, a control, the record, or nothing.
  function pick(ev) {
    const ray = rayFrom(ev);
    if (!camera.layers.isEnabled(0)) return { kind: null, ray }; // the cutaway only has inspectable parts
    arm.group.updateMatrixWorld();
    const latch = model?.headshellLatch;
    if (latch && !V.xray && raycaster.intersectObject(latch, false).length) {
      // Only the exposed metal tab overrides the generous arm-grab area. A
      // finger behind the shell, cartridge or rest stays occluded.
      const front = raycaster.intersectObjects(model.partMeshes, false).find(visibleHit);
      if (front?.object === latch) return { kind: latch.userData.control, ray, point: front.point };
    }
    const near = ray.distanceSqToPoint(arm.head.localToWorld(tmp.set(-0.004, -0.007, -0.004))) < 0.013 * 0.013;
    if (near || raycaster.intersectObjects(arm.grab, false).some(visibleHit)) return { kind: 'arm', ray };
    const c = raycaster.intersectObjects(T().hits, false).find(visibleHit);
    if (c) return { kind: c.object.userData.control, ray };
    const p = onPlane(ray, state.side ? recordY() : matY());
    if (p && Math.hypot(p.x, p.z) <= touchRadius()) return { kind: 'record', ray, p };
    return { kind: null, ray };
  }
  const armLimits = () => {
    const rMin = state.side ? state.side.fmt.lock : 0.05;
    return { rMin, aRest: arm.angleFor(restR()), aIn: arm.angleFor(rMin) };
  };
  const pointerArmAngle = (ray) => { const p = onPlane(ray, Y_GRAB); return p ? Math.atan2(p.z - arm.pivot.z, p.x - arm.pivot.x) : null; };
  const pitchFromRay = (ray) => { const p = onPlane(ray, 0.008), P = CONTROLS.pitch; return p ? ((p.z - P.z) / P.travel) * P.range : null; };
  const setPitch = (pct) => {
    let v = clamp(Math.round(pct * 10) / 10, -CONTROLS.pitch.range, CONTROLS.pitch.range);
    if (Math.abs(v) < 0.25) v = 0; // a centre detent you can feel
    if (v !== state.pitch) actions.setPitch(v);
  };
  const canDropAt = (r) => !!state.side && r <= state.side.radii[0] + 0.0015;

  let drag = null, lastPitchTap = 0;
  const CURSOR = { arm: 'grab', record: 'grab', start: 'pointer', s33: 'pointer', s45: 'pointer', cue: 'pointer', pitch: 'ns-resize', orbit: 'default',
    'dual:pitch': 'ew-resize', 'dual:force': 'ns-resize', 'dual:skate': 'ew-resize' };
  const setCursor = (c) => { if (canvas.style.cursor !== c) canvas.style.cursor = c; };
  const isTableControl = (k) => typeof k === 'string' && k.startsWith('dual:');
  const tableCtl = () => (model ? state.tableCtl : null);

  canvas.addEventListener('pointerdown', (ev) => {
    if (drag || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    const hit = pick(ev), ready = actions.audio(); // first contact unlocks audio
    const d = { id: ev.pointerId, kind: hit.kind || 'orbit', x: ev.clientX, y: ev.clientY, moved: 0 };
    drag = d;
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* pointer already gone */ }
    ev.preventDefault();
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    const start = () => {
      if (d.kind === 'arm') actions.armMove(state.armRadius);
      else if (d.kind === 'record') actions.touchStart();
    };
    if (isTableControl(d.kind)) {
      d.info = { ctl: tableCtl(), drag: {}, dx: 0, dy: 0, ray: hit.ray, point: hit.point, moved: 0 };
      model.control(d.kind, 'down', d.info);
    }
    else if (d.kind === 'arm') {
      if (tableCtl()) state.armRadius = tableCtl().mech.r;
      state.armDrag = true; V.pending = null;
      const a = pointerArmAngle(hit.ray);
      d.offset = a === null ? 0 : wrapAngle(a - arm.angleFor(state.armRadius));
      setCursor('grabbing');
    } else if (d.kind === 'record') {
      state.touching = true; d.last = Math.atan2(hit.p.z, hit.p.x);
      canvas.classList.add('grabbing'); setCursor('grabbing');
    } else if (d.kind === 'start') { V.press.start = 1; actions.togglePower(); }
    else if (d.kind === 's33') { V.press.s33 = 1; actions.setSpeed(100 / 3); }
    else if (d.kind === 's45') { V.press.s45 = 1; actions.setSpeed(45); }
    else if (d.kind === 'cue') {
      if (state.st.down || V.pending) { V.pending = null; actions.lift(); }
      else if (canDropAt(state.armRadius)) V.pending = { r: state.armRadius, at: 0, gentle: true }; // the cue lever sets it down softly
      else { V.cueNudge = 1; if (state.side) actions.hint('Move the headshell over the record first.'); }
    } else if (d.kind === 'pitch') {
      const now = performance.now(), p = pitchFromRay(hit.ray);
      if (now - lastPitchTap < 350) { setPitch(0); d.kind = 'none'; } // double tap: back to zero
      else {
        d.offset = p !== null && Math.abs(p - state.pitch) < 1.4 ? p - state.pitch : 0; // grab the cap, or jump to the tap
        if (p !== null && !d.offset) setPitch(p);
      }
      lastPitchTap = now;
    } else if (d.kind === 'orbit') { d.az = V.orbit.az; d.el = V.orbit.el; d.slide = ev.shiftKey; d.panX = LOOK.panX; d.panY = LOOK.panY; }
    start();
    // the very first touch has to wait for the audio engine before it can tell it anything
    Promise.resolve(ready).then(() => { if (drag === d) start(); }, () => {});
  });

  canvas.addEventListener('pointermove', (ev) => {
    const d = drag;
    if (!d) {
      const k = pick(ev).kind; setCursor(k ? CURSOR[k] || 'pointer' : 'default');
      if (V.xray && model) { // in X-ray, name the part under the pointer
        // Use the rendered surface even when a larger invisible control hitbox overlaps it.
        const hits = raycaster.intersectObjects(model.partMeshes, false).filter(visibleHit);
        const hit = hits.find(({ object, face }) => {
          const material = Array.isArray(object.material) ? object.material[face.materialIndex] : object.material;
          return material.userData.xray === undefined;
        }) ?? hits[0];
        hoverPart(hit ? hit.object.userData.part : null, ev);
      }
      return;
    }
    if (ev.pointerId !== d.id) return;
    d.moved = Math.max(d.moved, Math.hypot(ev.clientX - d.x, ev.clientY - d.y));
    const ray = rayFrom(ev);
    if (isTableControl(d.kind)) {
      Object.assign(d.info, { dx: ev.clientX - d.x, dy: ev.clientY - d.y, ray, moved: d.moved });
      model.control(d.kind, 'move', d.info);
    }
    else if (d.kind === 'arm') {
      const a = pointerArmAngle(ray);
      if (a === null) return;
      const lim = armLimits(), centre = (lim.aRest + lim.aIn) / 2;
      const ang = clamp(centre + wrapAngle(a - d.offset - centre), lim.aRest, lim.aIn);
      state.armRadius = clamp(arm.radiusForAngle(ang), lim.rMin, restR());
      actions.armMove(state.armRadius);
    } else if (d.kind === 'record') {
      const p = onPlane(ray, state.side ? recordY() : matY());
      if (!p || Math.hypot(p.x, p.z) < 0.006) return; // too near the spindle to tell which way
      const a = Math.atan2(p.z, p.x), turn = wrapAngle(a - d.last);
      d.last = a;
      actions.touchMove(turn / TAU); // clockwise seen from above is forwards
    } else if (d.kind === 'pitch') {
      const p = pitchFromRay(ray);
      if (p !== null) setPitch(p - d.offset);
    } else if (d.kind === 'orbit' && d.moved > 4 && d.slide) {
      // Shift-drag slides the picture: metres per pixel at the distance the camera is looking from
      const perPx = V.pose ? (2 * V.pose.dist * Math.tan((V.pose.fov * Math.PI) / 360)) / room().h : 0.001;
      applyLook({ panX: d.panX - (ev.clientX - d.x) * perPx, panY: d.panY + (ev.clientY - d.y) * perPx });
    } else if (d.kind === 'orbit' && d.moved > 4) {
      V.orbit.az = clamp(d.az - (ev.clientX - d.x) * 0.006, -2.6, 2.6);
      V.orbit.el = clamp(d.el + (ev.clientY - d.y) * 0.005, -0.6, 0.9);
    }
  });

  function release(ev) {
    const d = drag;
    if (!d || (ev && ev.pointerId !== d.id)) return;
    drag = null;
    if (isTableControl(d.kind)) {
      d.info.cancelled = ev?.type !== 'pointerup';
      model?.control(d.kind, 'up', d.info);
    }
    else if (d.kind === 'arm' && tableCtl()) { state.armDrag = false; actions.armRelease(); } // the table's own arm: its mechanism decides what letting go does
    else if (d.kind === 'arm') {
      state.armDrag = false;
      const side = state.side, r = state.armRadius;
      if (canDropAt(r)) { V.pending = { r, at: 0 }; actions.hint(''); }
      else if (side && r < side.fmt.disc - 0.0006) { // let go over the smooth rim: the lead-in catches the stylus
        state.armRadius = side.radii[0]; actions.armMove(state.armRadius);
        V.pending = { r: state.armRadius, at: 0 }; actions.hint('');
      } else { state.armRadius = REST; actions.rest(); } // off the record: back to the rest
    } else if (d.kind === 'record') {
      state.touching = false; actions.touchEnd(); canvas.classList.remove('grabbing');
    } else if (d.kind === 'orbit' && d.moved <= 4 && ev && ev.type === 'pointerup' && (V.orbit.az || V.orbit.el)) {
      V.orbit.az = 0; V.orbit.el = 0; // a plain click on the background squares the camera up again
    }
    setCursor(ev && ev.type === 'pointerup' ? (CURSOR[pick(ev).kind] || 'default') : 'default');
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', (ev) => { if (drag && drag.id === ev.pointerId) release(ev); });

  // wheel or two-finger scroll over the record: a fingertip nudge; over the fader: fine pitch
  let wheelTimer = 0, wheelOn = false, wheelPitch = 0;
  canvas.addEventListener('wheel', (ev) => {
    if (drag) return;
    const k = pick(ev).kind;
    const px = (Math.abs(ev.deltaY) > Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX) * (ev.deltaMode === 1 ? 16 : 1);
    if (isTableControl(k) && k !== 'dual:headshellLatch' && !ev.ctrlKey) {
      ev.preventDefault();
      wheelPitch += px;
      if (Math.abs(wheelPitch) >= 12) { model.control(k, 'wheel', { ctl: tableCtl(), delta: wheelPitch }); wheelPitch = 0; }
      return;
    }
    if (ev.ctrlKey || (k !== 'record' && k !== 'pitch')) { // a pinch anywhere, or a scroll on the bare table: zoom
      ev.preventDefault();
      applyLook({ zoom: LOOK.zoom * Math.exp(-px * (ev.ctrlKey ? 0.012 : 0.0018)) });
      return;
    }
    ev.preventDefault();
    if (k === 'pitch') {
      wheelPitch += px;
      if (Math.abs(wheelPitch) >= 12) { const v = clamp(Math.round((state.pitch + Math.sign(wheelPitch) * 0.1) * 10) / 10, -8, 8); wheelPitch = 0; if (v !== state.pitch) actions.setPitch(v); }
      return;
    }
    actions.audio();
    if (!wheelOn) { wheelOn = true; state.touching = true; actions.touchStart(); }
    actions.touchMove(clamp(px / 2400, -0.04, 0.04));
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelOn = false; state.touching = false; actions.touchEnd(); }, 140);
  }, { passive: false });

  // ---- one frame ----------------------------------------------------------------------------
  const U = record.uniforms;
  function frame(now) {
    requestAnimationFrame(frame);
    if (V.frozen) { V.last = now; return; } // held still (the comparison tool renders it itself)
    const dt = clamp((now - (V.last || now)) / 1000, 0, 0.1); V.last = now;
    if (dt > 0) { V.fps += (1 / dt - V.fps) * 0.05; }
    resize();
    if ((TABLES[state.table] && TABLES[state.table].createModel ? state.table : 'gd') !== tableKey) buildTable();
    else if (!model && state.deck !== deckKey && DECKS[state.deck]) buildArm();
    const ctl = tableCtl();
    if (ctl) {
      ctl.mech.setCouplingModel?.(model?.cad.couplingModel || null);
      ctl.mech.setDriveModel?.(model?.cad.driveModel || null);
      ctl.mech.setChangerModel?.(model?.cad.changerModel || null);
      ctl.mech.setLiftModel?.(model?.cad.liftModel || null);
      ctl.mech.setChangerSupportTop?.(model?.cad.changerSupportTop ?? null);
      ctl.tick(now); // the table's mechanism moves on with the picture
    }
    const st = state.st, side = state.side, rev = st.rev || 86400;
    // the record's drawn warp follows the one the sound plays, and the Record warp slider
    // (ported from the main Groove Deck: the high spots pass the stylus when the sound sways)
    if (side && side.flaws && arm && arm.stylusXZ) {
      const wk = `${side.seed}|${state.warp}|${state.table}|${state.deck}`;
      if (wk !== V.warpKey) {
        V.warpKey = wk;
        const sMid = arm.stylusXZ((side.fmt.start + side.fmt.innerMin) / 2); // where the stylus sits, mid-side
        record.setWarp(side.flaws, state.warp ?? 1, Math.atan2(sMid.z, sMid.x));
      }
    }
    const SU = T().platterUniforms;

    // record and platter rotation: integrate smoothly, steered by the engine's reports
    const age = clamp((now - state.stAt) / 1000, 0, 0.1);
    const reported = ((st.discPos + st.wr * FS * age) / rev) * TAU;
    V.disc += ((st.wr * FS) / rev) * TAU * dt;
    const err = wrapAngle(reported - V.disc);
    V.disc += Math.abs(err) > 0.6 ? err : err * Math.min(1, dt * 22);
    V.disc = wrapAngle(V.disc);
    const wRev = (st.wp * FS) / rev; // platter turns per second
    if (ctl) V.plat = ((ctl.mech.platterTurns % 1) + 1) % 1; // the same platter the mechanism's cam is geared to
    else V.plat = (((V.plat + wRev * dt) % 1) + 1) % 1;

    // strobe: what a lamp flashing 120 times a second makes of the dots
    V.lamp += ((state.power ? 1 : 0) - V.lamp) * Math.min(1, dt * 9);
    const row = (n, key) => {
      const s = (n * wRev) / STROBE.hz, whole = Math.round(s), frac = s - whole;
      V[key] += frac * STROBE.hz * dt;
      if (whole === 0) V[key] += wrapUnit(n * V.plat - V[key]) * Math.min(1, dt * 4); // at rest the dots are simply where they are
      V[key] = ((V[key] % 1) + 1) % 1;
      V.drift[key] = frac * STROBE.hz; // dots per second the pattern appears to creep
      return clamp(Math.abs(frac) * 8, 0, 1);
    };
    const b33 = row(STROBE.dots33, 'psi33'), b45 = row(STROBE.dots45, 'psi45');
    SU.uStrobe.value.set(V.psi33, b33, V.psi45, b45);
    SU.uTrue.value.set(V.plat, clamp((STROBE.dots33 * Math.abs(wRev)) / 50, 0, 1), clamp((STROBE.dots45 * Math.abs(wRev)) / 50, 0, 1), V.lamp);
    T().strobeLens.emissiveIntensity = 2.6 * V.lamp; T().strobeLight.intensity = 0.0012 * V.lamp;
    T().platSpin.rotation.y = -V.plat * TAU;
    const smear = ((st.wr * FS) / rev) * TAU * Math.min(dt, 1 / 50) * 0.8; // rotation during one frame's exposure
    U.uSpin.value = smear; T().spinBlur.value = smear;
    T().spin.rotation.y = -V.disc;

    // the record on the platter
    const ecc = clamp((state.ecc || 0) / 1000, 0, 0.001);
    let mount = 0, cutR = 0;
    if (side && record.group.visible) {
      const f = side.fmt, lockR = side.radii[side.turns];
      if (V.cutT < CUT.land + CUT.pass + CUT.leave) {
        V.cutT += dt;
        mount = 1 - smooth(clamp(V.cutT / CUT.land, 0, 1));
        const pass = clamp((V.cutT - CUT.land) / CUT.pass, 0, 1), leave = clamp((V.cutT - CUT.land - CUT.pass) / CUT.leave, 0, 1);
        state.reveal = pass;
        const rOuter = f.disc - 0.0034;
        cutR = rOuter - (rOuter - lockR) * pass;
        U.uRevealR.value = pass < 1 ? cutR : 0;
        const up = Math.max(mount, smooth(leave));
        hw.cutter.visible = up < 1;
        hw.cutter.position.set(Math.cos(CUTTER_ANGLE) * cutR, recordY() + up * 0.42, Math.sin(CUTTER_ANGLE) * cutR);
        hw.cutter.rotation.y = Math.PI / 2 - CUTTER_ANGLE;
        hw.swarf.visible = pass > 0 && pass < 1;
      } else if (hw.cutter.visible || U.uRevealR.value) { hw.cutter.visible = false; hw.swarf.visible = false; U.uRevealR.value = 0; state.reveal = 1; }
      record.group.rotation.y = -V.disc;
      record.group.position.y = recordY() + mount * 0.06;
      record.offset.position.x = ecc;
      const wear = side.wear || {};
      U.uDust.value = clamp(wear.dust !== undefined ? wear.dust : (state.surface || 0) * 0.5, 0, 1);
      U.uWear.value = clamp(wear.scuff !== undefined ? wear.scuff : (state.surface || 0) * 0.8, 0, 1);
    }

    // ---- tonearm ----
    if (ctl) { dualArm(dt, ctl, st, side, ecc); return finish(dt); }
    if (V.pending && st.down && (V.pending.at || !V.pending.raise && V.lift > 0)) V.pending = null; // the engine has the needle now
    if (V.pending && V.pending.at && now - V.pending.at > 700) V.pending = null; // the drop was refused
    const rT = V.pending ? V.pending.r : state.armRadius;
    const tracking = st.down && !state.armDrag && Math.abs(rT - V.rVis) < 0.0007;
    if (tracking) { V.rVis = rT; V.rVel = 0; } else {
      // in the hand the arm trails and settles like something with mass; let go, it glides
      const w = state.armDrag ? 46 : 17, z = state.armDrag ? 0.62 : 1, n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
      for (let i = 0; i < n; i++) { V.rVel += (w * w * (rT - V.rVis) - 2 * z * w * V.rVel) * h; V.rVis += V.rVel * h; }
    }
    const arrived = Math.abs(rT - V.rVis) < 0.001;
    const wantUp = state.armDrag || (!st.down && !V.pending) || (!!V.pending && (V.pending.raise || !arrived)); // never lowered while still swinging over
    if (wantUp) { V.lift = Math.min(1, V.lift + dt / 0.2); if (V.pending && V.lift === 1) V.pending.raise = false; }
    else if (V.lift > 0) {
      V.lift = Math.max(0, V.lift - dt / (V.pending ? 0.42 : 0.24)); // lowered on the damped cue
      if (V.lift === 0) { V.bounce = 0; if (V.pending && !V.pending.at) { V.pending.at = now; (V.pending.gentle && actions.lower ? actions.lower : actions.drop)(V.pending.r); } }
    }
    V.bounce += dt;
    const hopTo = !state.armDrag && st.down ? smooth(clamp((Math.abs(rT - V.rVis) - 0.0007) / 0.004, 0, 1)) : 0; // jumping to another track
    V.hop += (hopTo - V.hop) * Math.min(1, dt * 18);
    const cue = Math.max(smoother(V.lift), V.hop);
    const s = arm.stylusXZ(clamp(V.rVis, 0.02, REST + 0.004));
    const sAng = Math.atan2(s.z, s.x);
    let ride = 0, tipY = Y_REC + LIFT * cue;
    if (side && cue < 0.02 && V.rVis <= side.fmt.disc) {
      ride = ecc * Math.cos(sAng - V.disc); // an off-centre record carries the arm in and out
      tipY += record.warpAt(V.rVis, sAng - V.disc) * (1 - cue * 50);
    }
    tipY -= 0.00035 * Math.exp(-V.bounce / 0.07) * Math.cos(V.bounce * 58) * (V.bounce < 0.6 ? 1 : 0); // the cantilever settling
    if (state.armDrag) tipY += Math.min(0.0022, Math.abs(V.rVel) * 0.012);
    arm.setPose(arm.angleFor(clamp(V.rVis + ride, 0.02, REST + 0.004)), arm.phiFor(tipY), cue);
    V.cueNudge = Math.max(0, V.cueNudge - dt * 5);
    hw.cueLever.rotation.x = -0.1 - 0.5 * cue - 0.12 * Math.sin(V.cueNudge * Math.PI);

    // ---- controls and lamps follow the app's state ----
    for (const k of ['start', 's33', 's45']) V.press[k] = Math.max(0, V.press[k] - dt * 6);
    hw.startBtn.position.y = -0.0017 * smooth(V.press.start);
    hw.b33.group.position.y = -0.0013 * smooth(V.press.s33); hw.b45.group.position.y = -0.0013 * smooth(V.press.s45);
    hw.startLed.emissiveIntensity = 0.12 + 2.4 * V.lamp;
    hw.b33.led.emissiveIntensity = state.rpm < 40 ? 3 : 0.02; hw.b45.led.emissiveIntensity = state.rpm > 40 ? 3 : 0.02;
    hw.fader.position.z = CONTROLS.pitch.z + (clamp(state.pitch || 0, -8, 8) / CONTROLS.pitch.range) * CONTROLS.pitch.travel;
    hw.zeroLed.emissiveIntensity = Math.abs(state.pitch || 0) < 0.05 ? 2.6 : 0.02;
    const aim = arm.stylusXZ(clamp(V.rVis, side ? side.fmt.lock : 0.06, side ? side.fmt.disc - 0.004 : 0.146));
    hw.aimLens(aim.x, aim.z);
    hw.targetLight.intensity = 0.02 * V.lamp; hw.targetLens.emissiveIntensity = 3.2 * V.lamp;
    finish(dt);
  }

  // Installed CAD contacts and every visible arm joint share the engine pose.
  // The procedural fallback retains its visual inertia and record eccentricity.
  function dualArm(dt, ctl, st, side, ecc) {
    const a = ctl.armPose(), installedCad = !!ctl.mech.couplingModel;
    const rT = installedCad ? a.r : state.armDrag ? state.armRadius : a.r;
    if (installedCad) { V.rVis = rT; V.rVel = 0; } else if (st.down && a.onSurface && !state.armDrag && Math.abs(rT - V.rVis) < 0.0007) { V.rVis = rT; V.rVel = 0; } else {
      const w = state.armDrag ? 46 : 22, z = state.armDrag ? 0.62 : 1, n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
      for (let i = 0; i < n; i++) { V.rVel += (w * w * (rT - V.rVis) - 2 * z * w * V.rVel) * h; V.rVis += V.rVel * h; }
    }
    if (V.lastH > 0.00005 && a.h <= 0.00005) V.bounce = 0; // just landed
    V.lastH = a.h; V.bounce += dt;
    V.lift = clamp(a.h / LIFT, 0, 1);
    const rest = restR(), atRest = V.rVis >= rest - 0.001;
    const onDisc = side && V.rVis <= side.fmt.disc;
    const s = arm.stylusXZ(clamp(V.rVis, 0.02, rest + 0.004)), sAng = Math.atan2(s.z, s.x);
    let ride = 0, tipY = (ctl.mech.driveModel || atRest || onDisc || a.hand ? recordY() : matY()) + a.h; // a hand clears the cue; an unheld stylus can settle on the bare mat
    // a playing stylus rides the record's warp; added after the height model below has placed it,
    // so the installed CAD lift (which sets the height outright) does not flatten it away
    const warp = onDisc && a.h < 0.0002 ? record.warpAt(V.rVis, sAng - V.disc) : 0;
    if (onDisc && a.h < 0.0002) ride = ecc * Math.cos(sAng - V.disc);
    tipY -= 0.00035 * Math.exp(-V.bounce / 0.07) * Math.cos(V.bounce * 58) * (V.bounce < 0.6 ? 1 : 0);
    if (state.armDrag) tipY += Math.min(0.0022, Math.abs(V.rVel) * 0.012);
    // The cue platform has an absolute height. With no record (or off its edge),
    // Y_MAT is lower: preserve that surface until tip198 supports bearing body73.
    // Also keep record warp/bounce from drawing the supported bearing body through tip198.
    tipY = ctl.mech.cadLift?.valid ? ctl.mech.cadLift.stylusHeight
      : Math.max(tipY, arm.supportedStylusY(ctl.mech.lift, ctl.mech.mode, clamp(V.rVis + ride, 0.02, rest + 0.004)) + recordY() - Y_REC);
    tipY += warp;
    const ang = arm.angleFor(clamp(V.rVis + ride, 0.02, rest + 0.004));
    arm.setPose(ang, arm.phiFor(tipY), ctl.mech.lift);
    // the installed CAD arm is posed by the mechanism, which knows a flat, centred record: hand it
    // what the drawn record is doing under the stylus, so the arm rides the warp and the run-out
    const sway = installedCad && ride ? ang - arm.angleFor(clamp(V.rVis, 0.02, rest + 0.004)) : 0;
    model.update(dt, ctl.mech.snapshot(), { armAngle: ang, lamp: V.lamp, cart: state.cart, warp: installedCad ? warp : 0, sway });
  }

  function finish(dt) {
    // the room for the deck changes smoothly when a drawer or a card opens beside it
    for (const k of ['top', 'right', 'bottom', 'left']) {
      const d = V.insetGoal[k] - V.inset[k];
      if (d) V.inset[k] = Math.abs(d) < 0.5 ? V.insetGoal[k] : V.inset[k] + d * Math.min(1, dt * 14);
    }
    updateCamera(dt);
    const inspection = V.xray && VIEWS[V.view]?.layer !== undefined ? VIEWS[V.view] : null;
    camera.layers.set(inspection?.layer ?? 0);
    inspection?.prepare();
    renderer.render(scene, camera);
    // Reveal only after a complete frame of the selected representation exists.
    presentDeck();
    V.frames++; for (const fn of frameWaiters.splice(0)) fn(V.frames);

    // keep it fluid on slower machines: give up sharpness before smoothness
    if (!V.dprLock && V.fps < 38 && V.dpr > 1) { V.slow += dt; if (V.slow > 2.5) { V.cap = Math.max(1, V.dpr - 0.5); V.slow = 0; } } else V.slow = 0;
  }
  const wrapUnit = (x) => x - Math.round(x);
  const frameWaiters = []; // resolved after the next frame is drawn

  // ---- where things are on the page ---------------------------------------------------------
  const toPage = (x, y, z) => {
    tmp.set(x, y, z).project(camera);
    const b = canvas.getBoundingClientRect();
    return { x: b.left + (tmp.x * 0.5 + 0.5) * b.width, y: b.top + (-tmp.y * 0.5 + 0.5) * b.height };
  };

  resize();
  { const s0 = arm.stylusXZ(0.1); U.uPhaseOff.value = -Math.atan2(s0.z, s0.x) / TAU; } // so the stylus sits in a drawn groove
  updateCamera(0);
  requestAnimationFrame(frame);

  return {
    setRecord(side) {
      V.pending = null;
      record.setSide(side || null);
      adapterOn = !!side && side.fmt.hole > 0.01; T().adapter.visible = adapterOn;
      if (model && V.xray) model.setXray(true, record); // a new record is seen through too
      if (side) { V.cutT = 0; state.reveal = 0; U.uRevealR.value = side.fmt.disc; record.group.position.y = Y_REC + 0.06; }
      else { V.cutT = Infinity; state.reveal = 1; hw.cutter.visible = false; hw.swarf.visible = false; }
    },
    // where to take hold of the headshell when the stylus is over groove radius `radius`
    pointForHeadshell(radius = state.armRadius) {
      if (cadActive() && arguments.length === 0) {
        const head = model.cad.root.getObjectByName('arm.41.head');
        const p = new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3());
        return toPage(p.x, p.y, p.z);
      }
      const s = arm.stylusXZ(radius); return toPage(s.x, Y_GRAB, s.z);
    },
    // a point on the record surface; angle is clockwise from the right as seen from above
    pointForRecord(radius, angle) { return toPage(radius * Math.cos(angle), recordY(), radius * Math.sin(angle)); },
    pointForControl(name) {
      if (model) { const p = model.controlPoint(name); return p ? toPage(p[0], p[1], p[2]) : null; }
      const c = CONTROLS[name]; if (!c) return null;
      return name === 'pitch' ? toPage(c.x, 0.0105, hw.fader.position.z) : name === 'cue' ? toPage(c.x, 0.012, c.z + 0.012) : toPage(c.x, 0.006, c.z);
    },
    // Swing the arm over groove radius `radius` and lower it on the damped cue, the way a hand
    // would. The engine's drop is sent at the moment the stylus lands. Returns false if there
    // is no groove there to land in.
    lowerAt(radius) {
      if (!canDropAt(radius) || state.armDrag) return false;
      if (tableCtl()) { tableCtl().lowerAt(radius); return true; }
      state.armRadius = radius; actions.armMove(radius); // lifts the needle if it is down
      V.pending = { r: radius, at: 0, raise: V.lift < 1, gentle: true };
      return true;
    },
    setView,
    // The picture: look.get() -> { zoom, panX, panY, brightness, warmth, angle, height, room, shadows, surface };
    // look.set({...}) changes any of them; look.onChange(fn) hears every change; look.resetCamera()
    // squares the camera up; look.defaults is how it starts; look.surfaces lists what it can stand on.
    look: {
      get: () => ({ ...LOOK }), set: (what) => applyLook(what), defaults: { ...LOOK0 }, surfaces: Object.keys(SURFACES),
      onChange: (fn) => { lookListeners.push(fn); },
      resetCamera() { V.orbit.az = 0; V.orbit.el = 0; applyLook({ zoom: 1, panX: 0, panY: 0 }); },
    },
    // `now` skips the glide (first layout, or when the person has asked for less motion)
    setInsets(i, now = false) {
      for (const k of ['top', 'right', 'bottom', 'left']) { V.insetGoal[k] = Math.max(0, Math.round(i[k] || 0)); if (now || !V.last) V.inset[k] = V.insetGoal[k]; }
      if (now || !V.last) updateCamera(0);
    },
    outline(what = 'platter', n = 48) {
      const P = model ? model.box : PLINTH;
      if (what === 'plinth') return [[P.x0, P.z0], [P.x1, P.z0], [P.x1, P.z1], [P.x0, P.z1]].map(([x, z]) => toPage(x, 0, z));
      return Array.from({ length: n }, (_, i) => toPage(R_PLATTER * Math.cos((i / n) * TAU), Y_MAT, R_PLATTER * Math.sin((i / n) * TAU)));
    },
    get view() { return V.view; },
    // the table's own: X-ray through the plate and platter, and lighting up one part by name
    setXray, get xray() { return V.xray; }, highlightPart: previewPart, selectPart, get selectedPart() { return selectedPart; },
    resolvePartKey: key => model?.resolvePartKey(key) ?? null,
    setCad(on) { model?.cad.setEnabled(on); },
    get cadStatus() { return model?.cad.status || null; },
    // the page position of the middle of a part under the plate (for tests), or null
    pointForPart(key) {
      const p = model && model.parts[model.resolvePartKey(key)]; if (!p) return null;
      const c = new THREE.Box3().setFromObject(p.groups[0]).getCenter(new THREE.Vector3());
      return toPage(c.x, c.y, c.z);
    },
    get table() { return tableKey; }, get views() { return Object.keys(VIEWS); },
    lockQuality() { V.dprLock = true; },
    // For the comparison tool (?compare=1): hold the picture still, and hear when a frame is drawn.
    freeze(on) { V.frozen = !!on; }, nextFrame: () => new Promise((resolve) => frameWaiters.push(resolve)), get frames() { return V.frames; },
    debug: { renderer, scene, camera, key, fill, record, hw, V, get arm() { return arm; }, get model() { return model; } },
    info: () => ({ webgl: true, table: tableKey, xray: V.xray, fps: Math.round(V.fps), pixelRatio: V.dpr, view: V.view, settled: V.tweenT >= 1 && roomSettled(), cutting: V.cutT < CUT.land + CUT.pass + CUT.leave, lift: V.lift, strobe: { drift33: V.drift.psi33, drift45: V.drift.psi45 }, orbit: { ...V.orbit }, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
  };
}

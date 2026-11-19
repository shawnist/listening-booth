// The Dual 1229, drawn: the five subsystems (parts/outside, platter, tonearm, drive, automatic)
// put together into one model the deck view can show. An X-ray switch turns the plate, base,
// platter, mat and record to glass so the mechanism can be watched working.
//
// INTEGRATOR ONLY (see OWNERS.md): this file assembles the subsystems and holds the hooks the
// deck view uses (root, hits, platterUniforms, platSpin, spin, spinBlur, adapter, strobe lamp,
// arm, box, tableY, restR, views, parts, control(), controlPoint(), update(), setXray(),
// highlight(), subsystems, named). A subsystem draws its own parts in its own folder.
import * as THREE from 'three';
import { REST } from './spec.js';
import { SIZES, SPEED_KEYS } from './mechanism.js';
import { BASE, TABLE_Y } from './layout.js';
import { createKit, highlightPart } from './parts/shared/kit.js';
import { build as buildOutside } from './parts/outside/index.js';
import { build as buildPlatter } from './parts/platter/index.js';
import { build as buildTonearm } from './parts/tonearm/index.js';
import { build as buildDrive } from './parts/drive/index.js';
import { build as buildAutomatic } from './parts/automatic/index.js';
import { createCadBinding } from './cad/index.js';

const LEVER_LAYER = 1;
const CAD_MAIN_LEVER = 'cad:cycle:184_main_lever';
const LATCH_OPEN = Math.PI / 4; // Estimated release stop for handle 42.

// The fallback draws the spade as its own part. The installed stamping includes it.
export function activePartKey(key, cadVisible) {
  if (key === 'mainLever' || key === 'spade') return cadVisible ? CAD_MAIN_LEVER : key;
  if (key === CAD_MAIN_LEVER && !cadVisible) return 'mainLever';
  return key;
}

export function createDualModel({ M, maxAniso }) {
  const root = new THREE.Group();
  const kit = createKit({ root, M, maxAniso });
  const outside = buildOutside(kit);
  const platter = buildPlatter(kit);
  const tonearm = buildTonearm(kit);
  const drive = buildDrive(kit);
  const automatic = buildAutomatic(kit, { arm: tonearm.arm });
  const subsystems = { outside, platter, tonearm, drive, automatic };
  const arm = tonearm.arm;
  // light for looking underneath, on only in X-ray
  const underLights = [new THREE.PointLight(0xdfe8ff, 0, 0.6, 1.6), new THREE.PointLight(0xfff1dc, 0, 0.6, 1.6)];
  underLights[0].position.set(0.02, -0.06, 0.12); underLights[1].position.set(0.1, -0.07, -0.08);
  for (const l of underLights) { l.layers.enable(LEVER_LAYER); root.add(l); }
  const partMeshes = []; for (const k in kit.parts) partMeshes.push(...kit.parts[k].meshes);
  kit._strobeLens = outside.strobeLens;
  const cad = createCadBinding({ root, kit, arm, subsystems, partMeshes });

  let requestedPart = null, highlightedPart = null;
  const resolvePartKey = key => activePartKey(key, cad.root.visible);
  function highlight(key) {
    requestedPart = key;
    const active = resolvePartKey(key);
    if (active !== highlightedPart) {
      highlightPart(kit.parts, active);
      highlightedPart = active;
    }
  }

  // ---- X-ray --------------------------------------------------------------------------------------------
  let xray = false, recordMat = null;
  function setXray(on, record) {
    xray = !!on;
    if (record && record.mesh) recordMat = record.mesh.material;
    const list = recordMat ? [...kit.ghosts, recordMat] : kit.ghosts;
    for (const m of list) {
      const o = m.userData.xray !== undefined ? m.userData.xray : 0.18;
      m.transparent = xray; m.opacity = xray ? o : 1; m.depthWrite = !xray; m.needsUpdate = true;
    }
    if (recordMat) recordMat.userData.xray = 0.22;
    for (const s of Object.values(subsystems)) if (s.setXray) s.setXray(xray);
    cad.setXray(xray);
    for (const l of underLights) l.intensity = xray ? 0.05 : 0;
  }

  // Render the same moving bodies in the inspection camera. The CAD binding
  // replaces layer masks on installation changes, including switches deferred
  // through a cam cycle. Enrol only the currently visible assembly at draw time.
  const installedLever = [CAD_MAIN_LEVER, 'cad:cycle:184_stud_a', 'cad:cycle:184_stud_b',
    'cad:cycle:184_follower_pin', 'cad:cycle:185_setscrew_red_sealed', 'cad:coupling:229'];
  const fallbackLever = ['mainLever', 'spade', 'crossPin', 'clutch'];
  function prepareLeverView() {
    for (const key of cad.root.visible ? installedLever : fallbackLever) {
      for (const mesh of kit.parts[key]?.meshes ?? []) {
        if (mesh.layers.isEnabled(0)) mesh.layers.enable(LEVER_LAYER);
      }
    }
  }

  // ---- views of the mechanism ---------------------------------------------------------------------------
  const views = {
    xray: { label: 'X-ray', tip: 'See through the plate and platter to the mechanism', az: -0.3, el: 0.62, fov: 30, fit: true, xray: true },
    under: { label: 'Under', tip: 'From underneath, with the base taken away', az: 0.35, el: -0.75, elMin: -1.2, fov: 30, fit: true, xray: true },
    lever: { minAspect: 1.15, layer: LEVER_LAYER, prepare: prepareLeverView, label: 'Lever 184', tip: 'Inspect the main lever and its working face', az: 0.266, el: 0.98, elMin: -1.2, fov: 35, dist: 0.235, target: [0.104, -0.023, -0.076], xray: true },
    cam: { label: 'Cam', tip: 'Close on the main cam and the arm linkage', az: -0.45, el: 0.9, fov: 28, dist: 0.5, target: [0.09, -0.02, -0.03], xray: true },
  };

  // ---- the controls, by hand ------------------------------------------------------------------------------
  const points = Object.assign({}, ...Object.values(subsystems).map((s) => s.points || {}));
  const latchMesh = () => cad.root.visible ? cad.latch : arm.latch;
  function setLatchAngle(angle) {
    // Keep both renderings in the same physical state when switching the CAD model.
    for (const latch of [arm.latch, cad.latch]) if (latch) latch.rotation.y = angle;
  }
  function moveLatch(phase, info) {
    const latch = latchMesh();
    if (!latch || phase === 'wheel') return;
    const drag = info.drag;
    if (phase === 'up') {
      const open = info.moved > 3 ? latch.rotation.y >= LATCH_OPEN / 2 : drag.startAngle < LATCH_OPEN / 2;
      setLatchAngle(info.cancelled ? drag.startAngle : open ? LATCH_OPEN : 0);
      return;
    }
    // Work in the head frame. A rearward sweep should release from any camera
    // or arm pose. Use the plane through the actual finger contact.
    latch.parent.updateWorldMatrix(true, false);
    const inverse = latch.parent.matrixWorld.clone().invert();
    if (phase === 'down') {
      drag.startAngle = latch.rotation.y;
      drag.height = info.point.clone().applyMatrix4(inverse).y;
    }
    const ray = info.ray.clone().applyMatrix4(inverse);
    if (Math.abs(ray.direction.y) < 1e-6) return;
    const distance = (drag.height - ray.origin.y) / ray.direction.y;
    if (distance < 0) return;
    const contact = ray.at(distance, new THREE.Vector3()).sub(latch.position);
    const heading = Math.atan2(-contact.x, -contact.z);
    if (phase === 'down') drag.heading = heading;
    else if (info.moved > 3 && drag.heading !== undefined) {
      const difference = heading - drag.heading;
      const turn = Math.atan2(Math.sin(difference), Math.cos(difference));
      setLatchAngle(THREE.MathUtils.clamp(drag.startAngle + turn, 0, LATCH_OPEN));
    }
  }
  function controlPoint(name) {
    const control = `dual:${name.replace(/^dual:/, '')}`;
    if (control === 'dual:headshellLatch') {
      const latch = latchMesh();
      if (!latch) return null;
      return latch.localToWorld(new THREE.Vector3().fromArray(latch.userData.latch.tip)).toArray();
    }
    if (cad.status.state === 'ready' && cad.status.enabled) {
      const hit = kit.hits.find(h => h.userData.control === control && (h.userData.cad || h.parent === cad.root));
      if (hit) return new THREE.Box3().setFromObject(hit).getCenter(new THREE.Vector3()).toArray();
    }
    const f = points[name.replace(/^dual:/, '')]; return f ? f() : null;
  }
  // Pointer controls receive page deltas and the world-space picking ray.
  // A latch stroke starts on its actual surface and ends at the nearer stop.
  function control(kind, phase, info) {
    if (kind === 'dual:headshellLatch') return moveLatch(phase, info);
    const ctl = info.ctl; if (!ctl) return;
    const m = ctl.mech, k = kind.replace(/^dual:/, '');
    if (phase === 'down') {
      if (k === 'start') ctl.start();
      else if (k === 'stop') ctl.stop();
      else if (k === 'speed') ctl.setSpeed(SPEED_KEYS[(SPEED_KEYS.indexOf(m.speed) + 1) % 3]);
      else if (k === 'size') ctl.setSize(SIZES[(SIZES.indexOf(m.size) + 2) % 3]);
      else if (k === 'mode') ctl.setMode(m.mode === 'single' ? 'multi' : 'single');
      else if (k === 'cue') ctl.setCue(!m.cueUp);
      info.drag.v0 = k === 'pitch' ? m.pitch : k === 'force' ? m.trackingForce : k === 'skate' ? m.antiSkate : 0;
    } else if (phase === 'move') {
      if (k === 'pitch') ctl.setPitch(info.drag.v0 + info.dx * 0.0002);
      else if (k === 'force') ctl.setForce(info.drag.v0 - info.dy * 0.015);
      else if (k === 'skate') ctl.setSkate(info.drag.v0 + (info.dx - info.dy) * 0.012);
    } else if (phase === 'wheel') {
      const s = -Math.sign(info.delta);
      if (k === 'pitch') ctl.setPitch(m.pitch + s * 0.001);
      else if (k === 'force') ctl.setForce(m.trackingForce + s * (m.trackingForce < 1.5 || (m.trackingForce === 1.5 && s < 0) ? 0.1 : 0.25));
      else if (k === 'skate') ctl.setSkate(m.antiSkate + s * 0.1);
    }
  }

  // ---- one frame -----------------------------------------------------------------------------------------
  // s: the mechanism's snapshot(); ctx: { armAngle (the arm's yaw, as arm.angleFor), lamp 0..1 }
  function update(dt, s, ctx) {
    for (const sub of Object.values(subsystems)) sub.update(dt, s, ctx);
    cad.update(dt, s, ctx);
    if (requestedPart) highlight(requestedPart); // a geometry switch can be deferred until the cam parks
  }

  function dispose() { highlight(null); cad.dispose(); root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  return {
    root, hits: kit.hits, platterUniforms: platter.uniforms, platSpin: platter.platSpin, spin: platter.spin, spinBlur: { value: 0 }, adapter: platter.adapter,
    strobeLens: outside.strobeLens, strobeLight: outside.strobeLight, arm,
    box: { x0: BASE.x0, x1: BASE.x1, z0: BASE.z0, z1: BASE.z1 }, tableY: TABLE_Y, restR: REST,
    views, parts: kit.parts, partMeshes, subsystems: kit.groups, named: kit.named, cad,
    control, controlPoint, get headshellLatch() { return latchMesh(); }, update, setXray, get xray() { return xray; }, resolvePartKey, highlight, dispose,
  };
}

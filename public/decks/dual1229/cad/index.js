import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bindArm } from './arm.js';
import { bindDrive } from './drive.js';
import { bindMechanisms } from './mechanisms.js';
import { bindStructure, installedStructureAxes } from './structure.js';
import { applyCadFinish, bindCadEnvironment } from './finish.js';
import { applyCadDetails } from './details.js';
import { applyExteriorControls } from './exterior-controls.js';
import { applyExteriorHeadshell } from './exterior-headshell.js';
import { applyExteriorCartridge } from './exterior-cartridge.js';
import { applyExteriorRest } from './exterior-rest.js';
import { applyExteriorArm } from './exterior-arm.js';
import { applyExteriorCueShelf } from './exterior-cue-shelf.js';
import { applyExteriorFasteners } from './exterior-fasteners.js';
import { applyExteriorArmBase } from './exterior-arm-base.js';

const BASE = new URL('./assets/', import.meta.url);
const HIDDEN_LAYER = 31;
const controls = {
  S06_speed_lever: 'speed', S08_pitch_wheel: 'pitch', S49_size_lever: 'size',
  'cue.064.handle': 'cue', 'arm.70.mode_lever': 'mode', 'arm.79.antiskate_knob': 'skate', 'arm.77.spring_housing': 'force',
};

function originalNames(gltf) {
  gltf.scene.traverse(o => {
    const i = gltf.parser.associations.get(o)?.nodes;
    if (i !== undefined) o.name = gltf.parser.json.nodes[i].name || o.name;
  });
  // OCCT emits a primitive for every face. Batch faces within each named body,
  // retaining its rigid transform and materials, before adding any joints.
  const bodies = [];
  gltf.scene.traverse(o => { if (!o.isMesh && o.children.length > 1 && o.children.every(c => c.isMesh)) bodies.push(o); });
  for (const body of bodies) {
    const batches = new Map();
    for (const child of [...body.children]) {
      if (Array.isArray(child.material)) continue;
      child.updateMatrix();
      const key = child.material.uuid + Object.keys(child.geometry.attributes).sort().join(',');
      if (!batches.has(key)) batches.set(key, { material: child.material, children: [], geometries: [] });
      const batch = batches.get(key); batch.children.push(child);
      batch.geometries.push(child.geometry.clone().applyMatrix4(child.matrix));
    }
    for (const batch of batches.values()) {
      const geometry = mergeGeometries(batch.geometries, false);
      for (const g of batch.geometries) g.dispose();
      if (!geometry) continue;
      for (const child of batch.children) { body.remove(child); child.geometry.dispose(); }
      body.add(new THREE.Mesh(geometry, batch.material));
    }
  }
  return gltf.scene;
}

// Keep the procedural transforms/controller alive. Render layers replace only
// their meshes, so their per-frame visibility writes cannot bring duplicates back.
export function createCadBinding({ root, kit, arm, subsystems, partMeshes }) {
  const cadRoot = new THREE.Group(); cadRoot.name = 'cad-reconstruction'; cadRoot.visible = false;
  root.add(cadRoot);
  const status = { state: 'loading', enabled: true, loaded: 0, total: 6, error: null,
    note: 'Detailed CAD with shared drive, cue, carry and changer contacts. Cam paths and added linkage surfaces are reconstructions; mode/branch transmissions and factory dimensions remain incomplete.' };
  const hidden = new Map(), imported = [], adapters = [], ghosts = [], exterior = [];
  let disposed = false, xray = false, finish = null, details = null, couplingActive = false;
  let latch = null;
  const hide = o => {
    if (!o || hidden.has(o)) return;
    hidden.set(o, o.layers.mask);
  };
  const hitSet = new Set([...kit.hits, ...arm.grab]);
  const hideTree = g => g?.traverse(o => { if ((o.isMesh || o.isLine) && !hitSet.has(o)) hide(o); });
  const apply = () => {
    const active = couplingActive && status.state === 'ready';
    cadRoot.visible = active;
    for (const adapter of adapters) adapter.setEnabled?.(active);
    for (const [o, mask] of hidden) o.layers.mask = active ? (1 << HIDDEN_LAYER) : mask;
    for (const o of imported) o.layers.mask = active ? 1 : (1 << HIDDEN_LAYER);
  };
  const setXray = on => {
    xray = !!on;
    for (const { material, opacity, base } of ghosts) {
      material.userData.xray = opacity;
      material.transparent = xray || base.transparent; material.opacity = xray ? opacity * base.opacity : base.opacity;
      material.depthWrite = xray ? false : base.depthWrite; material.needsUpdate = true;
    }
  };
  const ready = (async () => {
    const response = await fetch(new URL('manifest.json', BASE));
    if (!response.ok) throw new Error(`CAD manifest: HTTP ${response.status}`);
    const manifest = await response.json();
    const loader = new GLTFLoader();
    const results = await Promise.allSettled(manifest.assemblies.map(async entry => {
      const gltf = await loader.loadAsync(new URL(entry.file, BASE).href);
      status.loaded++;
      return [entry.id, originalNames(gltf)];
    }));
    const scenes = {};
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const [id, scene] = result.value; scenes[id] = scene; cadRoot.add(scene);
      }
    }
    if (disposed) { disposeImported(); return; }
    const failure = results.find(r => r.status === 'rejected');
    if (failure) throw failure.reason;
    finish = applyCadFinish({ scenes, kit, root: cadRoot });
    details = applyCadDetails({ scenes, kit, root: cadRoot, axes: installedStructureAxes(manifest.structureAxes) });
    exterior.push(applyExteriorControls({ scenes, root: cadRoot, kit }),
      applyExteriorFasteners({ scenes, root: cadRoot, kit }),
      applyExteriorArmBase({ scenes, root: cadRoot, kit }));
    // Register parts before adapters reparent bodies into their joint hierarchies.
    for (const [assembly, scene] of Object.entries(scenes)) {
      const names = new Set(manifest.assemblies.find(a => a.id === assembly).nodes);
      scene.traverse(body => {
        if (!body.name || !body.children.some(c => c.isMesh) && !body.isMesh) return;
        // GLB exports usually have one mesh per labelled node.
        if (!names.has(body.name) || body.children.some(c => names.has(c.name))) return;
        const key = `cad:${assembly}:${body.name}`;
        const no = body.name.match(/^(?:arm\.|cue\.|S)?(\d+)/)?.[1] || '—';
        const part = { key, name: body.name.replaceAll('_', ' '), no, groups: [body], meshes: [] };
        kit.parts[key] = part;
        body.traverse(o => {
          if (!o.isMesh) return;
          o.userData.part = key; o.userData.cad = assembly;
          o.castShadow = true; o.receiveShadow = true;
          const materials = (Array.isArray(o.material) ? o.material : [o.material]).map(m => { const copy = m.clone(); delete copy.userData.xray; return copy; });
          o.material = Array.isArray(o.material) ? materials : materials[0];
          part.meshes.push(o); imported.push(o); partMeshes.push(o);
          if ((assembly === 'structure' && /^(S10_|S20_|S68_|SPL_)/.test(body.name)) ||
              (assembly === 'drive' && /^(4_|3_|39_)/.test(body.name))) {
            for (const material of materials) ghosts.push({ material, opacity: body.name.startsWith('SPL_') ? 0.02 : 0.12,
              base: { transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite } });
          }
          if (assembly === 'arm' && /head|socket/.test(body.name)) arm.grab.push(o);
          if (controls[body.name]) { o.userData.control = `dual:${controls[body.name]}`; kit.hits.push(o); }
        });
      });
    }
    const armBinding = bindArm({ scene: scenes.arm, root: cadRoot, arm, kit });
    adapters.push(armBinding);
    adapters.push(bindDrive({ scene: scenes.drive, root: cadRoot, kit, subsystems }));
    adapters.push(bindMechanisms({ scenes, root: cadRoot, kit, subsystems, arm, armBinding, armPadContact: armBinding.padContact }));
    adapters.push(bindStructure({ scene: scenes.structure, root: cadRoot, kit, axes: manifest.structureAxes, strobeLight: subsystems.outside?.strobeLight }));
    // Add arm trim only AFTER finite contact extraction. Appearance details
    // must never become extra rest/pad/contact triangles in the mechanism.
    const headshell = applyExteriorHeadshell({ scenes, root: cadRoot, kit }); exterior.push(headshell);
    latch = headshell.latch;
    if (arm.latch && latch) {
      latch.rotation.y = arm.latch.rotation.y;
      hide(arm.latch);
    }
    for (const mesh of headshell.meshes) {
      imported.push(mesh); partMeshes.push(mesh);
      if (mesh !== latch) arm.grab.push(mesh);
    }
    // The pickup's visible detail over the exported cartridge datum; it follows the Workbench's
    // cartridge choice each frame (ctx.cart). An adapter, so its source box is hidden like the others.
    const cartridge = applyExteriorCartridge({ root: cadRoot, kit, frame: headshell.frame });
    adapters.push(cartridge);
    for (const mesh of cartridge.meshes) arm.grab.push(mesh);
    // The rest (post 66 with its slot and clip, bar 52, pin 50) over the exported bodies; added after
    // contact extraction, so the hidden post's top stays the rest contact.
    adapters.push(applyExteriorRest({ root: cadRoot, kit }));
    const armExterior = applyExteriorArm({ scenes, root: cadRoot, kit }); exterior.push(armExterior);
    for (const mesh of armExterior.meshes) {
      let host = mesh.parent;
      while (host && !kit.parts[`cad:arm:${host.name}`]) host = host.parent;
      const key = host ? `cad:arm:${host.name}` : mesh.userData.part;
      mesh.userData.part = key; mesh.userData.cad = 'arm';
      kit.parts[key]?.meshes.push(mesh); imported.push(mesh); partMeshes.push(mesh);
    }
    // Drawn cue shelf and posts (looks only): after contact extraction, so nothing here is a contact surface.
    const cueShelf = applyExteriorCueShelf({ scenes, root: cadRoot, kit }); adapters.push(cueShelf); exterior.push({ report: cueShelf.report });
    status.exterior = exterior.map(e => e.report);
    for (const adapter of adapters) for (const mesh of adapter.meshes || []) { imported.push(mesh); partMeshes.push(mesh); }
    cadRoot.getObjectByName('arm.258.antiskate_cam_envelope').visible = false;
    for (const adapter of adapters) for (const mesh of adapter.hiddenMeshes || []) hide(mesh);
    for (const adapter of adapters) for (const key of adapter.replacedKeys || []) {
      for (const mesh of kit.parts[key]?.meshes || []) hide(mesh);
    }
    // The complete outside body is replaced, including unnumbered plate/plinth
    // meshes. Cables have no CAD counterpart and remain in the existing model.
    hideTree(subsystems.outside.group);
    for (const mesh of kit.parts.cables?.meshes || []) hidden.delete(mesh);
    hideTree(kit.named.escutcheon);
    // Superseded on-deck controls use the imported bodies for picking.
    for (const hit of hitSet) if (/^dual:(speed|pitch|size|cue|mode|skate|force|start|stop)$/.test(hit.userData.control || '')) hide(hit);
    bindCadEnvironment(cadRoot);
    status.state = 'ready'; status.manifest = manifest; status.adapters = adapters.map(a => a.status || a.debug || null);
    setXray(xray); apply();
  })().catch(error => {
    if (disposed) return;
    status.state = 'error'; status.error = String(error.message || error);
    for (const a of adapters) a.dispose?.();
    disposeImported();
    cadRoot.visible = false; apply();
    console.error('CAD reconstruction could not load; procedural deck retained.', error);
  });
  function disposeImported() {
    for (const e of exterior) e.dispose?.(); exterior.length = 0;
    details?.dispose?.(); finish?.dispose?.();
    cadRoot.traverse(o => { o.geometry?.dispose(); if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); });
    cadRoot.removeFromParent();
  }
  return {
    ready, status, root: cadRoot, adapters,
    get latch() { return latch; },
    get couplingModel() { return status.state === 'ready' && status.enabled ? adapters[2]?.couplingModel || null : null; },
    get driveModel() { return status.state === 'ready' && status.enabled ? adapters[1]?.model || null : null; },
    get changerModel() { return status.state === 'ready' && status.enabled ? adapters[2]?.changerModel || null : null; },
    get liftModel() { return status.state === 'ready' && status.enabled ? adapters[2]?.liftModel || null : null; },
    get changerSupportTop() { return status.state === 'ready' && status.enabled ? adapters[2]?.changerSupportTop ?? null : null; },
    setEnabled(enabled) { status.enabled = !!enabled; apply(); },
    setXray,
    update(dt, s, ctx) {
      if (status.state !== 'ready') return;
      // The engine defers geometry switches until the current cycle finishes.
      // Keep the visible assembly paired with the geometry actually installed.
      const installed = s.couplingSource === 'cad';
      if (installed !== couplingActive) { couplingActive = installed; apply(); }
      for (const adapter of adapters) adapter.update(dt, s, ctx);
    },
    dispose() { disposed = true; for (const a of adapters) a.dispose?.(); for (const [o, mask] of hidden) o.layers.mask = mask; disposeImported(); },
  };
}

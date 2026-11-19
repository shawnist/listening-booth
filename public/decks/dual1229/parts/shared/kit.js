// The kit every subsystem of the Dual 1229 builds with: one group per subsystem, a way to name
// the parts that carry a Dual part number (so X-ray can light them up and name them), shared
// materials, glass-in-X-ray marking, the invisible hit shapes the pointer tests against, and a
// board of anchors through which one subsystem tells another where something of its own is.
// Shared: ask the integrator before changing it (see OWNERS.md).
import * as THREE from 'three';
import { PARTS } from '../../spec.js';

export function createKit({ root, M, maxAniso }) {
  const parts = {}; // key -> { key, name, no, groups: [], meshes: [] }
  const ghosts = []; // materials that turn to glass in X-ray
  const hits = []; // invisible shapes the pointer tests against, each tagged with a control name
  const groups = {}; // subsystem name -> its group under root
  const named = {}; // name -> object, for the comparison tool (hide by name)
  const anchors = {}; // what one subsystem publishes for another to read (see OWNERS.md)

  // the group a subsystem draws into
  function group(name) { const g = new THREE.Group(); g.name = name; g.userData.subsystem = name; root.add(g); groups[name] = g; named[name] = g; return g; }
  // a group that carries a Dual part; every mesh added under it is that part. The name and number
  // shown in X-ray come from spec.js PARTS, or for a part of your own from info: { name, no }.
  function part(key, parent, info = {}) {
    const g = new THREE.Group(); g.userData.part = key; parent.add(g);
    parts[key] = parts[key] || { key, name: key, no: '—', ...PARTS[key], ...info, groups: [], meshes: [] };
    parts[key].groups.push(g);
    return g;
  }
  // a mesh that casts and takes shadows; if it sits under a part's group it becomes that part
  function add(parent, geo, mat, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    let key = null; for (let o = parent; o && !key; o = o.parent) key = o.userData.part;
    if (key) { mesh.userData.part = key; parts[key].meshes.push(mesh); }
    return mesh;
  }
  // a mesh that belongs to a part without sitting under its group (a rod between two parts)
  function adopt(key, mesh) { mesh.userData.part = key; parts[key].meshes.push(mesh); return mesh; }
  const hit = (name, geo, x, y, z, parent = root) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false })); m.position.set(x, y, z); m.userData.control = name; parent.add(m); hits.push(m); return m; };
  const ghost = (m, xray = 0.1) => { m.userData.xray = xray; ghosts.push(m); return m; };
  const name = (key, obj) => { named[key] = obj; return obj; };

  // materials for the parts under the plate (each call a fresh material, so one part can be lit)
  const mat = (color, metal = 0.85, rough = 0.38, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...extra });
  const mats = {
    steel: () => mat(0xb9bdc2, 0.9, 0.36), zinc: () => mat(0xa7aaa2, 0.85, 0.42), darkSteel: () => mat(0x4a4d52, 0.8, 0.45),
    nylon: () => mat(0xe6e0cf, 0, 0.55), black: () => mat(0x1d1d20, 0.2, 0.55), brass: () => mat(0xc79f4a, 0.95, 0.32), rubber: () => mat(0x111112, 0, 0.85),
  };

  return { root, M, maxAniso, parts, ghosts, hits, groups, named, anchors, group, part, add, adopt, hit, ghost, name, mat, mats };
}

// Light up one part (or none) by its key.
export function highlightPart(parts, key) {
  for (const k in parts) for (const m of parts[k].meshes) {
    const on = k === key;
    // highlight on a clone and put the original material back afterwards, so a part hovered in
    // X-ray does not stay glass when X-ray is turned off
    if (on && !m.userData.hl) {
      m.userData.hl = m.material;
      const highlight = source => { const copy = source.clone(); if (copy.emissive) { copy.emissive.setHex(0x3a7bff); copy.emissiveIntensity = 0.9; } return copy; };
      m.material = Array.isArray(m.material) ? m.material.map(highlight) : highlight(m.material);
    } else if (!on && m.userData.hl) {
      for (const copy of Array.isArray(m.material) ? m.material : [m.material]) copy.dispose();
      m.material = m.userData.hl; m.userData.hl = null;
    }
  }
}

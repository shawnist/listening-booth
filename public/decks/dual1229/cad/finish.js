// The reconstruction provides solids, not an alternative art direction. Reuse
// the working deck's finishes and textures; add UVs without changing positions,
// tessellation or the CAD normals. Printed/control details remain in details.js.
import * as THREE from 'three';
import { turnedTexture } from '../../../deck3d/textures.js';
import { MECHANISM_DATUMS } from './mechanisms.js';
import { LIP_LENGTH } from './coupling-contact.js';
import { matSurfaceMaps } from './exterior-mat.js';
import { DRIVE_CAD_MOTION } from './drive.js';
import { driveSurfaceMaps } from './drive-surfaces.js';
import { createWalnutVeneer } from './veneer.js';

const materialOf = (o, index = 0) => Array.isArray(o?.material) ? o.material[index] : o?.material;
const matsOf = (kit, key) => (kit.parts[key]?.meshes || []).flatMap(o => Array.isArray(o.material) ? o.material : [o.material]);
const first = (kit, key, predicate = () => true) => matsOf(kit, key).find(predicate);
const list = o => { const a = []; o?.traverse(n => { if (n.isMesh) a.push(n); }); return a; };
const safe = n => Math.max(n, 0.000001);

// Resample the existing radial-brush strip into a planar disc texture. Computing
// angle per texel, rather than per CAD vertex, prevents the large white spokes
// caused by linear interpolation over the UV wrap and triangulated centre.
function planarBrushTexture(source) {
  const image = source?.image;
  if (!image?.getContext) return source;
  const src = image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
  const n = 1024, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const angle = (Math.atan2(y - n / 2, x - n / 2) + Math.PI) / (2 * Math.PI);
    const sx = Math.min(image.width - 1, Math.floor(angle * image.width)), si = sx * 4, i = (y * n + x) * 4;
    // Subtle machining, not the high-contrast radial spokes of a decorative disc.
    const shade = Math.round(238 + (src[si] - 214) * 0.28);
    data[i] = shade; data[i + 1] = shade; data[i + 2] = shade; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n); t.colorSpace = source.colorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

// Brushed aluminium follows the disc circumference. Encode direction in the
// planar UV frame so the lighting follows the brush without a polar UV seam.
function discAnisotropyTexture() {
  const n = 256, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x + 0.5 - n / 2, dy = y + 0.5 - n / 2, r = Math.hypot(dx, dy), i = (y * n + x) * 4;
    data[i] = Math.round(127.5 * (1 - dy / r));
    data[i + 1] = Math.round(127.5 * (1 + dx / r));
    data[i + 2] = 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

export function applyCadFinish({ scenes, kit, root }) {
  const fallback = new THREE.MeshStandardMaterial({ color: 0xb9bdc2, metalness: 0.85, roughness: 0.36 });
  const ownedMaterials = new Set();
  const clone = (source, options = {}) => {
    const m = (source || fallback).clone(); Object.assign(m, options); ownedMaterials.add(m);
    m.vertexColors = false; m.flatShading = false;
    // Old meshes use centimetre-scale bump constants; UVs on CAD solids are now
    // dimensioned in metres. Keep surface relief below the manufactured edges.
    if (m.bumpMap) m.bumpScale = Math.min(Math.abs(m.bumpScale), 0.000025);
    return m;
  };
  const physical = (source, options = {}) => {
    const m = new THREE.MeshPhysicalMaterial();
    THREE.MeshStandardMaterial.prototype.copy.call(m, source || fallback);
    m.defines = { STANDARD: '', PHYSICAL: '' };
    Object.assign(m, options); m.vertexColors = false; ownedMaterials.add(m); return m;
  };
  const steel = clone(kit.M.chrome, { metalness: 0.8, roughness: 0.32 });
  const black = clone(first(kit, 'armHead'));
  const rubber = clone(first(kit, 'mat'));
  const woodSource = list(kit.named.plinth).map(o => materialOf(o)).find(m => m?.map && m.clearcoat !== undefined);
  const palette = {
    wood: clone(woodSource), board: clone(woodSource, { roughness: 0.8, clearcoat: 0 }),
    floor: clone(kit.M.darkTurned, { roughness: 0.9, metalness: 0 }),
    paint: clone(materialOf(kit.named.plate)), black, rubber,
    steel, zinc: clone(first(kit, 'speedBracket'), { roughness: 0.55 }),
    brass: clone(first(kit, 'pulley')), gold: clone(first(kit, 'idlerArm')),
    strip: physical(materialOf(kit.named.strip), { map: null, roughnessMap: null, roughness: 0.38, anisotropy: 0.35, envMapIntensity: 0.25 }),
    badge: clone(materialOf(kit.named.badge, 2)),
    rim: clone(first(kit, 'platterCasting', m => m.isMeshPhysicalMaterial)),
    cast: clone(first(kit, 'platterCasting', m => !m.isMeshPhysicalMaterial)),
    disc: clone(first(kit, 'centreDisc')), motor: clone(first(kit, 'motor')),
    tube: clone(first(kit, 'armTube', m => m.isMeshPhysicalMaterial)),
    ring: clone(first(kit, 'gimbalInner')),
    weight: clone(first(kit, 'counterweight')),
    weightStripe: clone(first(kit, 'counterweight', m => !!m.map)),
    forceScale: clone(first(kit, 'forceDial', m => !!m.map)),
    head: black, cartridge: clone(first(kit, 'cartridge')),
    idler: clone(first(kit, 'idler', m => !!m.map)),
    nylon: clone(first(kit, 'speedSeg'), { transparent: false, opacity: 1 }),
  };
  // Large manufactured textures need their own relief amplitudes. The small
  // generic clamp above applies only to incidental noise on metal and plastic.
  // S10 is coated steel. In the platter-off restoration photo its shoulder
  // catches a broad grey reflection. Keep the fine paint grain in relief;
  // the inherited mid-grey noise map also halved highlight roughness.
  const chassisPaint = physical(palette.paint, {
    roughnessMap: null, roughness: 0.54, metalness: 0,
    bumpScale: 0.000015, envMapIntensity: 0.52, specularIntensity: 0.68,
  });
  chassisPaint.color.setHex(0x232629);
  const matMaps = matSurfaceMaps();
  const matFinish = physical(rubber, { map: matMaps.colour, bumpMap: matMaps.relief, bumpScale: 0.000018,
    normalMap: null, roughnessMap: null, roughness: 0.83, metalness: 0, specularIntensity: 0.32, envMapIntensity: 0.55 });
  matFinish.color.setHex(0xffffff);
  const matBands = clone(matFinish, { roughness: 0.68, bumpScale: 0.000009 });
  const planarBrush = planarBrushTexture(palette.disc.map);
  palette.disc.map = planarBrush; palette.disc.bumpMap = planarBrush;
  palette.disc.bumpScale = 0.000004; palette.disc.roughness = 0.43;
  palette.disc.metalness = 0.85; palette.disc.anisotropy = 0.25;
  palette.disc.anisotropyMap = discAnisotropyTexture();
  palette.disc.color.setHex(0xc7c9cc);
  // One veneer board per face: colour is not also used as a height map.
  const veneer = createWalnutVeneer();
  palette.wood.map = veneer.colour; palette.wood.color.setHex(0xffffff);
  palette.wood.roughnessMap = veneer.roughness; palette.wood.roughness = 1;
  palette.wood.clearcoat = 0.09; palette.wood.clearcoatRoughness = 0.5;
  palette.wood.specularIntensity = 0.5;
  palette.wood.bumpMap = veneer.bump; palette.wood.bumpScale = 0.00008;
  const frontWood = clone(palette.wood, { map: veneer.frontColour });
  const topWood = clone(palette.wood, { color: new THREE.Color(0xc7a586) });
  // Keep the dark front band in the same wall coordinates across its narrow
  // cut, including both horizontal ledges. The top and side rails have no band.
  const onCabinetFront = (n, p, bounds) =>
    p.z >= bounds.max.z - .0012 && (n.z > .55 ||
      Math.abs(n.y) > .7 && Math.abs(p.y - (bounds.min.y + (bounds.max.y-bounds.min.y)*.32)) < .001);

  // The 1229 has a broad satin-silver band, with fine circumferential tool marks.
  // Its cast interior shows mottled, duller metal in the same-article underside view.
  const surfaces = driveSurfaceMaps();
  palette.strip.bumpMap = palette.rim.bumpMap;
  // Lathe marks follow U around the rim. Vary microsurface roughness across
  // the marks so they appear in reflections as well as in the shallow relief.
  const rimTurning = turnedTexture(29, 192, 22);
  Object.assign(palette.rim, { metalness: 0.86, roughness: 0.88, roughnessMap: rimTurning, anisotropy: 0.85,
    anisotropyRotation: Math.PI / 2, envMapIntensity: 0.95, bumpMap: rimTurning, bumpScale: 0.000035 });
  palette.rim.color.setHex(0x959da3);
  Object.assign(palette.cast, { map: surfaces.cast, bumpMap: surfaces.castingRelief, bumpScale: 0.000018,
    metalness: 0.30, roughness: 0.6, envMapIntensity: 1.35 });
  palette.cast.color.setHex(0xffffff);
  const tyre = clone(rubber, { map: surfaces.rubber, bumpMap: surfaces.rubberRelief, bumpScale: 0.000022,
    metalness: 0, roughness: 0.9, envMapIntensity: 0.58 });
  tyre.color.setHex(0xffffff);
  Object.assign(palette.idler, { map: null, normalMap: surfaces.dimples, bumpMap: null, roughness: 0.51, metalness: 0.60 });
  palette.idler.color.setHex(0xa6a79c);
  // Three turned running faces show directional highlights on the brass pulley.
  // Keep the bore, bevels and lower clamping collar on the more subdued finish.
  const pulleyTrack = physical(palette.brass, { metalness: 0.88, roughness: 0.31,
    anisotropy: 0.48, anisotropyRotation: Math.PI / 2 });
  pulleyTrack.color.setHex(0xb99857);
  const pulleyBody = clone(palette.brass, { metalness: 0.82, roughness: 0.44 });
  pulleyBody.color.setHex(0x97763f);
  const idlerHub = clone(palette.brass, { map: null, bumpMap: null, metalness: 0.72, roughness: 0.36 });
  idlerHub.color.setHex(0x99712c);
  palette.tube.metalness = 1; palette.tube.roughness = 0.6;
  palette.tube.color.setHex(0xb9bdc2);
  // Black mouldings have dielectric highlights, not a broad metallic grey wash.
  for (const m of [black, palette.paint, palette.ring, palette.weight]) m.envMapIntensity = 0.4;
  palette.strip.color.setHex(0xc4c6c9);
  palette.strip.bumpScale = 0.000012;
  palette.strip.userData.cadSurface = 'strip-top';
  palette.floor.color.setHex(0x141416);
  palette.board.color.setHex(0x98734e);
  const plastic = physical(black, { roughness: 0.38, metalness: 0, specularIntensity: 0.65, envMapIntensity: 0.5 });
  // The original restorer describes a black plastic clutch tip. Its close-up
  // shows a muted warm-grey glint beside the glossier, black fluted sleeve.
  const liftCap = physical(black, { roughness: 0.59, metalness: 0, specularIntensity: 0.42, envMapIntensity: 0.55 });
  liftCap.color.setHex(0x49443f);
  const satin = clone(steel, { roughness: 0.34, metalness: 0.5 }); satin.color.setHex(0xdfe1e4);
  const clear = clone(steel, { transparent: true, opacity: 0.6, metalness: 0, roughness: 0.15 });
  const liftPiston = clone(steel, { color: new THREE.Color(0x7e807d), roughness: 0.45, metalness: 0.77 });
  const liftFoot = clone(steel, { color: new THREE.Color(0x555852), roughness: 0.49, metalness: 0.68 });
  const headMoulding = physical(black, { metalness: 0, roughness: 0.49, specularIntensity: 0.42,
    envMapIntensity: 0.60, ior: 1.48, bumpMap: null });
  headMoulding.color.setHex(0x29282a);
  const tubeAxis = new THREE.Vector3(Math.cos(-1.4670324126983245), 0, -Math.sin(-1.4670324126983245));
  const forceAxis = new THREE.Vector3(tubeAxis.z, 0, -tubeAxis.x);
  // Repair photograph p.18 shows a grey dry contact strip across the end
  // of the plated spade. Map it in body coordinates so one broad CAD triangle
  // can show both surfaces without changing the friction solver's mesh.
  const plateColour = 0xb19568;
  const leverBody = clone(steel, { color: new THREE.Color(plateColour), metalness: .76, roughness: .49 });
  const contactMap = new THREE.DataTexture(new Uint8Array([
    177,149,104,255, 177,149,104,255, 99,98,91,255, 99,98,91,255,
  ]),4,1);
  contactMap.colorSpace = THREE.SRGBColorSpace;
  contactMap.magFilter = contactMap.minFilter = THREE.LinearFilter;
  contactMap.needsUpdate = true;
  const leverFace = clone(leverBody, { color: new THREE.Color(0xffffff), map: contactMap, roughness: .48 });
  const leverAxis = new THREE.Vector3(Math.cos(MECHANISM_DATUMS.leverHeading),0,-Math.sin(MECHANISM_DATUMS.leverHeading));
  const types = new Map();
  const classify = (name, assembly) => {
    if (name === 'SPL_walls') return { mats: [palette.wood, frontWood, topWood], uv: 'cabinet',
      face: (n,p,bounds) => onCabinetFront(n,p,bounds) ? 1 : n.y > .7 ? 2 : 0 };
    if (name === 'SPL_board') return { mats: [palette.board], uv: 'wood' };
    if (name === 'SPL_floor') return { mats: [palette.floor] };
    if (/^SPL_foot|^S(?:32_insert|34_damper)/.test(name)) return { mats: [rubber] };
    if (name === 'S10_plate') return { mats: [chassisPaint], uv: 'box' };
    if (name === 'S68_arm_cover') return { mats: [palette.paint], uv: 'box' };
    if (name === 'S20_strip') return { mats: [palette.strip, satin], uv: 'top', face: n => n.y > 0.6 ? 0 : 1 };
    if (name === 'S47_badge') return { mats: [palette.badge, plastic], uv: 'top', face: n => n.y > 0.6 ? 0 : 1 };
    if (/^S(?:06_|48_|49_)/.test(name)) return { mats: [plastic] }; // exterior-controls attaches the actual inset strips
    if (/^S(?:08_|46_)/.test(name)) return { mats: [plastic] };
    if (name === '4_platter_cast_with_drive_wall') return { mats: [palette.cast, palette.rim], uv: 'platter', face: (n, p) => Math.hypot(p.x, p.z) > 0.149 ? 1 : 0 };
    if (/^3_mat/.test(name)) return { mats: [matFinish, matBands], uv: 'top',
      face: (n, p) => n.y > 0.995 && Math.abs(p.y - DRIVE_CAD_MOTION.matTop) < 0.00001 ? 1 : 0 };
    if (/^39_aluminium/.test(name)) return { mats: [palette.disc], uv: 'top' };
    // hifiwiki top view: pin and flange read as satin silver, about as bright as the disc.
    if (/^38_single/.test(name)) return { mats: [satin] };
    if (/^131_idler_rubber/.test(name)) return { mats: [tyre], uv: 'top' };
    if (/^131_idler_metal/.test(name)) return { mats: [palette.idler, idlerHub], uv: 'top',
      face: (n, p, b) => Math.hypot(p.x - (b.max.x + b.min.x) / 2, p.z - (b.max.z + b.min.z) / 2) <= 0.00495 ? 1 : 0 };
    if (/^121_motor/.test(name)) return { mats: [palette.motor] };
    if (/^115_/.test(name)) return { mats: [pulleyBody, pulleyTrack], uv: 'turn',
      face: (n, p, b) => {
        const dx = p.x - (b.min.x + b.max.x) / 2, dz = p.z - (b.min.z + b.max.z) / 2;
        return p.y >= -0.006 && Math.abs(n.y) < 0.15 && dx * n.x + dz * n.z > 0 ? 1 : 0;
      } };
    if (/^4b_|^6_speed/.test(name)) return { mats: [palette.brass], uv: 'turn' };
    if (/^133_|^134_/.test(name)) return { mats: [palette.gold] };
    if (/^104_carrier/.test(name)) return { mats: [palette.zinc] };
    if (/^102_/.test(name)) return { mats: [palette.nylon] };
    if (/^135_|^88_|^154_/.test(name)) return { mats: [clear] };
    if (/^85_/.test(name)) return { mats: [plastic] };
    if (name === 'ctx.cartridge_generic') return { mats: [palette.cartridge] };
    if (/^87_|^5_strobe|envelope|context|^ctx_|^interface|^iface\./.test(name)) return null;
    if (name === 'arm.41.head') return { mats: [headMoulding] };
    if (name === 'arm.73.tube') return { mats: [palette.tube], uv: 'axial', axis: tubeAxis };
    if (/arm\.75\./.test(name)) return { mats: [palette.steel], uv: 'axial' };
    if (/arm\.74\./.test(name)) return { mats: [palette.weight, palette.weightStripe], uv: 'axial', axis: tubeAxis,
      face: (n, p, b, span) => Math.abs(n.dot(tubeAxis)) < 0.5 && p.dot(tubeAxis) > span.max - 0.007 ? 1 : 0 };
    if (/arm\.77\./.test(name)) return { mats: [plastic, palette.forceScale], uv: 'axial', axis: forceAxis,
      face: n => Math.abs(n.dot(forceAxis)) < 0.5 ? 1 : 0 };
    if (/arm\.(54|60|69)\.|arm\.73\.bearing/.test(name)) return { mats: [palette.ring] };
    if (/arm\.(41|63|66|70|77|79)\.|arm\.73\.head/.test(name)) return { mats: [plastic] };
    if (name === 'ctx.cartridge_generic') return { mats: [palette.cartridge] };
    if (name === 'cue.206.lift_bolt') return { mats: [liftPiston, liftFoot, idlerHub], uv: 'turn',
      // MAARC p.28 shows a narrow brass terminal at the bottom of the dark land.
      // Assign on source faces before the finite-contact installation shortens the piston.
      face: (normal, p, bounds) => {
        const fromFoot = p.y - bounds.min.y;
        if (fromFoot <= 0.00111) return 2;
        return fromFoot < 0.00554 ? 1 : 0;
      } };
    if (name === 'cue.198.cap') return { mats: [liftCap] };
    if (/cue\.(064|200)\./.test(name)) return { mats: [plastic] };
    if (/cue\.220\./.test(name)) return { mats: [palette.nylon] };
    if (name === '184_main_lever') return { mats: [leverBody, leverFace], axis: leverAxis, uv: 'lever',
      face: n => n.y > .98 ? 1 : 0 };
    if (/^243_|^214_/.test(name)) return { mats: [palette.nylon] };
    if (/^229_/.test(name)) return { mats: [rubber] };
    if (/^185_/.test(name)) return { mats: [clone(steel, { color: new THREE.Color(0xa22b23) })] };
    if (/^\d|^S|^AU3_|^cue\.|^arm\./.test(name)) return { mats: [steel] };
    return null;
  };
  root.updateWorldMatrix(true, true);
  const rootInverse = root.matrixWorld.clone().invert();
  const report = { bodies: [], meshCount: 0, policy: 'existing deck materials; UV/face groups only; CAD vertices and normals unchanged' };
  for (const [assembly, scene] of Object.entries(scenes)) {
    scene.traverse(body => {
      for (let p = body.parent; p && p !== scene; p = p.parent) if (types.has(p)) return;
      const config = classify(body.name, assembly);
      if (config && (body.isMesh || body.children.some(c => c.isMesh))) types.set(body, config);
    });
  }
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  for (const [body, config] of types) {
    const meshes = list(body).filter(o => { let p = o; while (p && p !== body) { if (types.has(p)) return false; p = p.parent; } return true; });
    const bounds = new THREE.Box3();
    const coordinates = new Map();
    for (const mesh of meshes) {
      const matrix = rootInverse.clone().multiply(mesh.matrixWorld), nm = new THREE.Matrix3().getNormalMatrix(matrix);
      const positions = mesh.geometry.attributes.position, normals = mesh.geometry.attributes.normal, points = [], directions = [];
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(matrix); points.push(point.clone()); bounds.expandByPoint(point);
        normal.fromBufferAttribute(normals, i).applyMatrix3(nm).normalize(); directions.push(normal.clone());
      }
      coordinates.set(mesh, { points, directions });
    }
    const size = bounds.getSize(new THREE.Vector3()), centre = bounds.getCenter(new THREE.Vector3());
    const axis = config.axis || tubeAxis, radial = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize();
    const span = { min: Infinity, max: -Infinity };
    for (const { points } of coordinates.values()) for (const p of points) { const a = p.dot(axis); span.min = Math.min(span.min, a); span.max = Math.max(span.max, a); }
    for (const mesh of meshes) {
      const { points, directions } = coordinates.get(mesh), old = mesh.geometry, geometry = old.clone();
      const uv = new THREE.Float32BufferAttribute(new Float32Array(points.length * 2), 2), around = new Uint8Array(points.length);
      for (let i = 0; i < points.length; i++) {
        const p = points[i], n = directions[i]; let u, v;
        if (config.uv === 'lever') {
          u = .5 + (p.dot(axis) - span.max + LIP_LENGTH) / .001; v = .5;
        } else if (config.uv === 'turn' || config.uv === 'radial' || (config.uv === 'platter' && Math.hypot(p.x, p.z) > 0.149)) {
          u = (Math.atan2(p.z - centre.z, p.x - centre.x) + Math.PI) / (2 * Math.PI); around[i] = 1;
          v = config.uv === 'radial' ? Math.hypot(p.x - centre.x, p.z - centre.z) / safe(size.x / 2) : (p.y - bounds.min.y) / safe(size.y);
        } else if (config.uv === 'axial') {
          // Cylinder coordinates about the exported parked tube/pitch axis.
          // The existing dial map wraps once round the housing, not across its end caps.
          u = (Math.atan2(p.clone().sub(centre).dot(radial), p.y - centre.y) + Math.PI) / (2 * Math.PI); around[i] = 1;
          v = (p.dot(axis) - span.min) / safe(span.max - span.min);
        } else if (config.uv === 'cabinet' && onCabinetFront(n,p,bounds)) {
          u = (p.x - bounds.min.x) / safe(size.x); v = (p.y - bounds.min.y) / safe(size.y);
        } else if ((config.uv === 'wood' || config.uv === 'cabinet') && Math.abs(n.y) > 0.7) {
          // Mitred rails: grain follows each board, rather than crossing the
          // side rails under a single top-down image projection.
          const edgeX=Math.min(p.x-bounds.min.x,bounds.max.x-p.x);
          const edgeZ=Math.min(p.z-bounds.min.z,bounds.max.z-p.z);
          u=edgeX<edgeZ?(p.z-bounds.min.z)/safe(size.z):(p.x-bounds.min.x)/safe(size.x);
          v=Math.min(edgeX,edgeZ)/safe(size.y);
        } else if (config.uv === 'top' || Math.abs(n.y) > 0.7) {
          u = (p.x - bounds.min.x) / safe(size.x); v = 1 - (p.z - bounds.min.z) / safe(size.z);
        } else if (Math.abs(n.z) >= Math.abs(n.x)) {
          u = (p.x - bounds.min.x) / safe(size.x); v = (p.y - bounds.min.y) / safe(size.y);
        } else {
          u = (p.z - bounds.min.z) / safe(size.z); v = (p.y - bounds.min.y) / safe(size.y);
        }
        uv.setXY(i, u, v);
      }
      geometry.setAttribute('uv', uv); unwrapSeam(geometry, around, points, directions); geometry.clearGroups();
      if (config.face) {
        const count = geometry.index ? geometry.index.count : points.length;
        let last = -1, start = 0;
        for (let t = 0; t < count; t += 3) {
          const ids = [0, 1, 2].map(k => geometry.index ? geometry.index.getX(t + k) : t + k);
          point.set(0, 0, 0); normal.set(0, 0, 0);
          for (const i of ids) { point.add(points[i]); normal.add(directions[i]); }
          point.multiplyScalar(1 / 3); normal.normalize();
          const index = config.face(normal, point, bounds, span);
          if (index !== last) { if (last >= 0) geometry.addGroup(start, t - start, last); start = t; last = index; }
        }
        if (last >= 0) geometry.addGroup(start, count - start, last);
      }
      mesh.geometry = geometry; old.dispose();
      mesh.material = config.mats.length === 1 ? config.mats[0] : config.mats;
      mesh.userData.cadFinish = body.name;
      report.meshCount++;
    }
    report.bodies.push({ name: body.name, materials: config.mats.map(m => m.type), uv: config.uv || 'box', bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } });
  }
  fallback.dispose();
  report.dispose = () => {
    for (const texture of Object.values(surfaces)) texture.dispose();
    rimTurning.dispose();
    contactMap.dispose();
    matMaps.colour.dispose(); matMaps.relief.dispose(); veneer.dispose();
    if (planarBrush !== first(kit, 'centreDisc')?.map) planarBrush?.dispose();
    palette.disc.anisotropyMap.dispose();
    for (const material of ownedMaterials) material.dispose();
  };
  return report;
}

// Three's scene environment replaces envMapIntensity on materials without an
// explicit map. Bind the shared (not owned) map so each CAD finish retains its
// response while still following the room brightness and rebuilt lighting.
export function bindCadEnvironment(root) {
  const strengths = new WeakMap();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const previous = mesh.onBeforeRender;
    mesh.onBeforeRender = function(renderer, scene, camera, geometry, material, group) {
      previous.call(this, renderer, scene, camera, geometry, material, group);
      if (!material.isMeshStandardMaterial) return;
      if (!strengths.has(material)) strengths.set(material, material.envMapIntensity);
      if (material.envMap !== scene.environment) {
        material.envMap = scene.environment;
        material.needsUpdate = true;
      }
      material.envMapIntensity = strengths.get(material) * scene.environmentIntensity;
      material.envMapRotation.copy(scene.environmentRotation);
    };
  });
}

// The coordinates that go round an axis (atan2) jump from 1 back to 0 where they meet. A triangle
// across that line would read the whole texture squeezed backwards into its one strip: on the
// platter's rim it showed as a bar that went round with the platter. Each such triangle gets its own
// copies of the vertices on the low side, carried on past 1 (the textures repeat). Vertices that do
// not go round (around[i] = 0) are left alone. points and directions grow with the copies.
function unwrapSeam(geometry, around, points, directions) {
  const uv = geometry.attributes.uv, index = geometry.index, n = index ? index.count : uv.count;
  const seam = [];
  for (let t = 0; t < n; t += 3) {
    const ids = [0, 1, 2].map(k => index ? index.getX(t + k) : t + k);
    if (!ids.every(i => around[i])) continue;
    const us = ids.map(i => uv.getX(i));
    if (Math.max(...us) - Math.min(...us) > 0.5) seam.push(t);
  }
  if (!seam.length) return 0;
  if (!index) { for (const t of seam) for (let k = 0; k < 3; k++) if (uv.getX(t + k) < 0.5) uv.setX(t + k, uv.getX(t + k) + 1); return seam.length; }
  const copies = new Map(), added = [];
  for (const t of seam) for (let k = 0; k < 3; k++) {
    const i = index.getX(t + k); if (uv.getX(i) >= 0.5) continue;
    if (!copies.has(i)) { copies.set(i, uv.count + added.length); added.push(i); }
    index.setX(t + k, copies.get(i));
  }
  const total = uv.count + added.length;
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    // raw components, so interleaved (glTF) attributes come out plain and normalized ones unchanged
    const size = attr.itemSize, array = new attr.array.constructor(total * size);
    for (let i = 0; i < attr.count; i++) for (let c = 0; c < size; c++) array[i * size + c] = attr.getComponent(i, c);
    added.forEach((i, j) => { for (let c = 0; c < size; c++) array[(attr.count + j) * size + c] = attr.getComponent(i, c); });
    const grown = new THREE.BufferAttribute(array, size, attr.normalized);
    if (name === 'uv') added.forEach((i, j) => grown.setX(attr.count + j, attr.getX(i) + 1));
    geometry.setAttribute(name, grown);
  }
  for (const i of added) { points.push(points[i]); directions.push(directions[i]); }
  index.needsUpdate = true; geometry.boundingSphere = null; geometry.boundingBox = null;
  return seam.length;
}

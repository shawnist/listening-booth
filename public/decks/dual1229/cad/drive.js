// Drive CAD binding. CAD rest_33 is already in deck metres (Y up).
// Contact centres and rigid links use the reconstruction's estimated geometry.
// Engagement progress, speed changes and pitch travel are prescribed runtime inputs;
// this is a visual adapter, not a force, friction or transient-contact solve.
import * as THREE from 'three';
import { bindDriveSupport } from './drive-support.js';
import { bindDriveTransmission } from './drive-transmission.js';

const TAU = Math.PI * 2, MM = 0.001;
export const INSTALLED_LINKAGE_DROP = .00285; // estimated clearance below the installed dish
const RPM = { '33': 100 / 3, '45': 45, '78': 78 };
const HEIGHT = { '33': 7.75, '45': 2.15, '78': -3.25 };
const ANGLE = { '33': 31, '45': 0, '78': -31 };
const PULLEY = [-24, 79], REST = [-61, 70], SPEED_AXIS = [-129, 117];
const RIM = 131, IDLER = 30, LINK = 32, PITCH_STROKE = 2.1;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const mix = (a, b, t) => a + (b - a) * t;
const length = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const direction = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);

function circles(a, ra, b, rb) {
  const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz);
  if (!d) return [];
  const along = (ra * ra - rb * rb + d * d) / (2 * d), h2 = ra * ra - along * along;
  if (h2 < -1e-9) return [];
  const h = Math.sqrt(Math.max(0, h2)), x = a[0] + along * dx / d, z = a[1] + along * dz / d;
  return [[x - h * dz / d, z + h * dx / d], [x + h * dz / d, z - h * dx / d]];
}
function engaged(rpm, pitch) {
  return circles([0, 0], RIM - IDLER, PULLEY, IDLER + RIM * rpm / 1800 * (1 + pitch)).sort((a, b) => a[0] - b[0])[0];
}
const C33 = engaged(RPM['33'], 0);
const Q_NOM = [C33[0] + LINK * Math.cos(129 * Math.PI / 180), C33[1] + LINK * Math.sin(129 * Math.PI / 180)];
const d = length(SPEED_AXIS, Q_NOM);
const GUIDE = SPEED_AXIS.map((v, i) => v + 18 * (Q_NOM[i] - v) / d);
const LINK134 = length(GUIDE, Q_NOM);
function linkage(c) { return circles(GUIDE, LINK134, c, LINK).sort((a, b) => length(a, Q_NOM) - length(b, Q_NOM))[0]; }
const Q_REST = linkage(REST);

export const DRIVE_CAD_MOTION = Object.freeze({
  frame: 'deck metres, Y up; source rest_33',
  classification: 'finite estimated CAD profiles and rigid links with prescribed withdrawal, speed and pitch inputs',
  pulleyAxis: PULLEY.map(v => v * MM), restAxis: REST.map(v => v * MM),
  guideAxis: GUIDE.map(v => v * MM), idlerRadius: IDLER * MM, rimRadius: RIM * MM,
  matTop: 0.025, recordSurface: 0.0268,
  limitations: '60 Hz estimated turned-profile envelope; radial screw cutout and GLB facets not resolved dynamically; no slip/force solve; source fit conflicts remain; strobe rows/optics unresolved',
});

// Meridional outlines from the pinned reconstruction build.py (millimetres).
// These describe the finite exported solids, including the shoulder bevels and
// tyre edge chamfers. They are estimates, not a calibrated replacement pulley.
const STEP_BOTTOM = { '33': 5, '45': -0.6, '78': -6 };
const TYRE_PROFILE = [[-1.7, 14.5], [-1.3, 29.5], [-0.8, 30], [0.8, 30], [1.3, 29.5], [1.7, 14.5]];
const PULLEY_SEGMENTS = [{ a: [-12.9, 5], b: [-6, 5], speed: '78', surface: 'collar' }];
let previous = [-6, 5];
for (const speed of ['78', '45', '33']) {
  const bottom = STEP_BOTTOM[speed], top = bottom + 5.5, mid = HEIGHT[speed];
  const radius = y => RIM * RPM[speed] / 1800 * (1 - 0.03 * (y - mid) / PITCH_STROKE);
  const bevel = speed === '33' ? 0.4 : 0.6;
  const nextSpeed = speed === '78' ? '45' : '33';
  const nextRadius = speed === '33' ? 1.6 : RIM * RPM[nextSpeed] / 1800 * 1.03;
  const points = [[bottom, radius(bottom)], [top - bevel, radius(top - bevel)],
    [top, Math.max(nextRadius, radius(top - bevel) - bevel)]];
  PULLEY_SEGMENTS.push({ a: previous, b: points[0], speed, surface: 'shoulder' });
  PULLEY_SEGMENTS.push({ a: points[0], b: points[1], speed, surface: 'taper' });
  PULLEY_SEGMENTS.push({ a: points[1], b: points[2], speed, surface: 'bevel' });
  previous = points[2];
}
function profileAt(points, y) {
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    if (y >= a[0] - 1e-8 && y <= b[0] + 1e-8) return mix(a[1], b[1], (y - a[0]) / (b[0] - a[0]));
  }
  return null;
}
function pulleyAt(y) {
  let result = null;
  for (const segment of PULLEY_SEGMENTS) {
    const { a, b } = segment;
    if (y < Math.min(a[0], b[0]) - 1e-8 || y > Math.max(a[0], b[0]) + 1e-8) continue;
    const r = Math.abs(b[0] - a[0]) < 1e-8 ? Math.max(a[1], b[1]) : mix(a[1], b[1], (y - a[0]) / (b[0] - a[0]));
    if (!result || r > result.r + 1e-10 || Math.abs(r - result.r) <= 1e-10 && segment.surface === 'taper')
      result = { r, speed: segment.speed, surface: segment.surface };
  }
  return result;
}
export function finiteCadPulleyContact(y) {
  const breaks = [...PULLEY_SEGMENTS.flatMap(p => [p.a[0], p.b[0]]), ...TYRE_PROFILE.map(p => p[0] + y)];
  let result = null;
  for (const contactY of breaks) {
    const p = pulleyAt(contactY), tyre = profileAt(TYRE_PROFILE, contactY - y);
    if (!p || tyre === null) continue;
    const separation = p.r + tyre;
    if (!result || separation > result.separation) result = { separation, contactY, pulleyRadius: p.r,
      tyreContactRadius: tyre, contactedStep: p.speed, surface: p.surface };
  }
  return result;
}

const contactRpm = contact => 1800 * contact.pulleyRadius / contact.tyreContactRadius * IDLER / RIM;
// A selected speed may use only its tapered working face with the tyre's full
// rolling radius. The exported shoulder and adjacent step bound its travel.
// Find those bounds from the finite contact, rather than inventing a wider step.
const PITCH_BOUNDS = Object.fromEntries(Object.keys(RPM).map(speed => {
  const bottom = STEP_BOTTOM[speed], bevel = speed === '33' ? 0.4 : 0.6;
  const lo = bottom + 0.8, hi = bottom + 5.5 - bevel + 0.8;
  const valid = y => { const c = finiteCadPulleyContact(y); return c?.contactedStep === speed && c.surface === 'taper' && Math.abs(c.tyreContactRadius - IDLER) < 1e-7; };
  const samples = Array.from({ length: 513 }, (_, i) => mix(lo, hi, i / 512));
  const first = samples.findIndex(valid), last = samples.findLastIndex(valid);
  if (first < 0) throw new Error(`No finite CAD working band for ${speed}`);
  const edge = (bad, good) => { for (let i = 0; i < 45; i++) { const mid = (bad + good) / 2; if (valid(mid)) good = mid; else bad = mid; } return good; };
  const minY = first ? edge(samples[first - 1], samples[first]) + 1e-7 : lo;
  const maxY = last < 512 ? edge(samples[last + 1], samples[last]) - 1e-7 : hi;
  return [speed, Object.freeze({ minY, maxY, minRpm: contactRpm(finiteCadPulleyContact(maxY)), maxRpm: contactRpm(finiteCadPulleyContact(minY)) })];
}));
export function solveCadPitch(speed, requestedRpm) {
  const bounds = PITCH_BOUNDS[speed], target = clamp(requestedRpm, bounds.minRpm, bounds.maxRpm);
  let low = bounds.minY, high = bounds.maxY;
  for (let i = 0; i < 45; i++) {
    const mid = (low + high) / 2;
    if (contactRpm(finiteCadPulleyContact(mid)) > target) low = mid; else high = mid;
  }
  const y = (low + high) / 2;
  return { y, requestedRpm, achievedRpm: contactRpm(finiteCadPulleyContact(y)),
    limited: requestedRpm < bounds.minRpm - 1e-7 || requestedRpm > bounds.maxRpm + 1e-7,
    bounds };
}

export function driveCadPose(s = {}) {
  const speed = RPM[s.speed] ? s.speed : '33', from = RPM[s.shiftFrom] ? s.shiftFrom : speed;
  const t = clamp(s.shift ?? 1, 0, 1), pitch = clamp(s.pitch ?? 0, -0.03, 0.03);
  const fromPitch = solveCadPitch(from, RPM[from] * (1 + pitch));
  const toPitch = solveCadPitch(speed, RPM[speed] * (1 + pitch));
  const requestedY = mix(fromPitch.y, toPitch.y, t);
  const neutralY = mix(solveCadPitch(from, RPM[from]).y, solveCadPitch(speed, RPM[speed]).y, t);
  const pitchLift = requestedY - neutralY;
  const contact = finiteCadPulleyContact(requestedY);
  if (!contact) throw new RangeError('CAD tyre does not overlap any pulley surface vertically');
  // Both tangencies use the finite tyre/pulley profiles, never a radius inferred
  // from requested RPM. Pitch inverses this same finite profile within its
  // physical working band; unachievable requests stop at the disclosed boundary.
  const target = circles([0, 0], RIM - IDLER, PULLEY, contact.separation).sort((a, b) => a[0] - b[0])[0];
  if (!target) throw new RangeError('CAD finite pulley contact cannot reach the platter wall');
  const pull = clamp(s.idlerIn ?? 0, 0, 1), c = REST.map((v, i) => mix(v, target[i], pull)), q = linkage(c);
  if (!q) throw new RangeError('CAD drive link lengths cannot reach the requested idler centre');
  const pulleyGap = (length(c, PULLEY) - contact.separation) * MM;
  const rimGap = (RIM - IDLER - length(c, [0, 0])) * MM;
  const pulleyContact = Math.abs(pulleyGap) < 0.00001, rimContact = Math.abs(rimGap) < 0.00001;
  const engaged = pulleyContact && rimContact;
  const selectedStepContact = contact.contactedStep === speed && contact.surface === 'taper';
  const ratio = contact.pulleyRadius / contact.tyreContactRadius * IDLER / RIM;
  return { source: 'cad-drive', c, q, y: requestedY * MM, x: c[0] * MM, z: c[1] * MM,
    cadY: requestedY, requestedY: requestedY * MM,
    yaw133: direction(q, c), yaw134: direction(GUIDE, q),
    selector: mix(ANGLE[from], ANGLE[speed], t) * Math.PI / 180,
    pitchLift, segmentLift: pitchLift * MM, selectorCalibration: (neutralY - mix(HEIGHT[from], HEIGHT[speed], t)) * MM,
    pulleyRadius: contact.pulleyRadius * MM, tyreContactRadius: contact.tyreContactRadius * MM,
    idlerRadius: IDLER * MM, rimRadius: RIM * MM, contactY: contact.contactY * MM,
    pulleyGap, rimGap, pulleyContact, rimContact, engaged,
    transmissionRatio: engaged ? ratio : 0, contactTransmissionRatio: ratio,
    rpm: 1800 * ratio, requestedRpm: mix(RPM[from], RPM[speed], t) * (1 + pitch),
    contactedStep: contact.contactedStep, contactSurface: contact.surface,
    blocked: t === 1 && (toPitch.limited || !selectedStepContact), limited: t === 1 && toPitch.limited, selectedStepContact,
    workingBand: { minY: toPitch.bounds.minY * MM, maxY: toPitch.bounds.maxY * MM, minRpm: toPitch.bounds.minRpm, maxRpm: toPitch.bounds.maxRpm },
    reason: toPitch.limited ? 'Requested RPM exceeds the selected finite tapered working band; travel is stopped at its geometric boundary.' : !selectedStepContact ? 'Selector is crossing a shoulder between working bands.' : null,
    inputClassification: 'Pitch height inverses the finite profile; selector transition and withdrawal travel remain prescribed.',
  };
}

export function createCadDriveModel() {
  return { source: 'cad-drive', pose: driveCadPose, metadata: DRIVE_CAD_MOTION };
}

export function bindDrive({ scene, root, kit, subsystems }) {
  const nodes = new Map();
  scene.traverse(o => { if (o.name) nodes.set(o.name, o); });
  // The installed chassis keeps its 1.2mm gauge; these source mounting
  // envelopes assumed 1.0mm. Shorten only the named top faces by 0.2mm.
  // Axes, pulley/idler positions and all other source vertices stay fixed.
  const mountRestores = [];
  root.updateWorldMatrix(true, true);
  for (const [label, ceiling] of [['121_motor_M1219S_envelope', -.0121],
    ['104_carrier_casting_1229_225193', -.0012], ['104_guide_pin_for_134', -.0012]]) {
    const body = nodes.get(label); if (!body) continue;
    body.traverse(mesh => {
      if (!mesh.isMesh) return;
      const old = mesh.geometry, geometry = old.clone(), positions = geometry.attributes.position;
      const toRoot = root.matrixWorld.clone().invert().multiply(mesh.matrixWorld), fromRoot = toRoot.clone().invert(), point = new THREE.Vector3();
      let moved = 0;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(toRoot);
        if (point.y > ceiling + 1e-8) { point.y = ceiling; point.applyMatrix4(fromRoot); positions.setXYZ(i, point.x, point.y, point.z); moved++; }
      }
      if (!moved) { geometry.dispose(); return; }
      positions.needsUpdate = true; geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      mesh.geometry = geometry; mountRestores.push({ mesh, old, geometry });
      mesh.userData.installedMount = { ceiling, sourceGauge: .001, installedGauge: .0012, status: 'estimated mounting-face adaptation' };
    });
  }
  // Installed vertical package: retain the original plan outlines and wheel
  // heights, lengthen133's existing axle and lower the carrier's base seat.
  // The base remains1.15mm thick; no new transmission or contact is invented.
  for (const label of ['133_swing_lever_with_idler_axle','104_carrier_casting_1229_225193']) {
    nodes.get(label)?.traverse(mesh => {
      if (!mesh.isMesh) return;
      const old=mesh.geometry,geometry=old.clone(),positions=geometry.attributes.position;
      const toRoot=root.matrixWorld.clone().invert().multiply(mesh.matrixWorld),fromRoot=toRoot.clone().invert(),point=new THREE.Vector3();let moved=0;
      for(let i=0;i<positions.count;i++) {
        point.fromBufferAttribute(positions,i).applyMatrix4(toRoot);
        if(label.startsWith('133') && point.y>-.0125+1e-8) {
          point.y+=INSTALLED_LINKAGE_DROP*(point.y+.0125)/(.01035+.0125);
        } else if(label.startsWith('104') && point.y<=-.0327+1e-8) {
          point.y-=INSTALLED_LINKAGE_DROP*Math.max(0,(point.y+.0367)/.004);
        } else continue;
        point.applyMatrix4(fromRoot);positions.setXYZ(i,point.x,point.y,point.z);moved++;
      }
      if(!moved){geometry.dispose();return;}positions.needsUpdate=true;geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;
      mountRestores.push({mesh,old,geometry});mesh.userData.installedLinkage={drop:INSTALLED_LINKAGE_DROP,basis:'estimated installed axle length and carrier seat; source plan outline retained'};
    });
  }
  const group = new THREE.Group(); group.name = 'cad_drive_motion'; root.add(group);
  group.userData.motion = DRIVE_CAD_MOTION;
  function pivot(name, point, labels) {
    const p = new THREE.Group(); p.name = `cad_drive_${name}`;
    p.position.set(point[0] * MM, point[1] * MM, point[2] * MM); group.add(p);
    root.updateWorldMatrix(true, true);
    for (const label of labels) {
      const node = nodes.get(label);
      if (!node) throw new Error(`Drive CAD asset is missing ${label}`);
      p.attach(node);
    }
    return p;
  }
  const platter = pivot('platter', [0, 0, 0], ['4_platter_cast_with_drive_wall', '4b_brass_pinion_envelope_teeth_unresolved',
    '5_strobe_ring_225222_rows_unresolved', '3_mat_concentric_rings_count_unresolved', '39_aluminium_centre_disc', '38_single_play_spindle_turns_with_platter']);
  const singleAdapter = subsystems?.platter?.adapter;
  const retainingRing = subsystems?.platter?.retainingRing;
  const originalSeat = singleAdapter?.position.y;
  let installedSeat = originalSeat;
  if (singleAdapter) {
    // Probe the installed disc under the adapter's annular foot, clear of the
    // central recess and the spindle. Use the same measurement on each export.
    const origin = root.localToWorld(new THREE.Vector3(0.014, 0.08, 0));
    const down = new THREE.Vector3(0, -1, 0).transformDirection(root.matrixWorld);
    const seat = new THREE.Raycaster(origin, down).intersectObject(nodes.get('39_aluminium_centre_disc'), true)[0];
    if (!seat) throw Error('Single-play adapter has no seat on the installed centre disc.');
    installedSeat = singleAdapter.parent.worldToLocal(seat.point.clone()).y;
  }
  function setEnabled(active) {
    if (singleAdapter) singleAdapter.position.y = active ? installedSeat : originalSeat;
    // The legacy ring vertices include the original disc height in local space.
    if (retainingRing) retainingRing.position.y = active ? installedSeat - originalSeat : 0;
  }
  const rotor = pivot('rotor', [PULLEY[0], 0, PULLEY[1]], ['152_rotor_shaft', '115_pulley_60Hz_218276', '114_axial_setscrew_height_stop']);
  const wheel = pivot('idler', [REST[0], HEIGHT['33'], REST[1]], ['131_idler_rubber_tyre', '131_idler_metal_centre_and_hub']);
  const axleFittings = pivot('idler_fittings', [REST[0], HEIGHT['33'], REST[1]], ['132_slide_washer', '130_keeper_washer']);
  const swing = pivot('swing133', [Q_REST[0], HEIGHT['33'], Q_REST[1]], ['133_swing_lever_with_idler_axle']);
  const lever = pivot('lever134', [GUIDE[0], HEIGHT['33'], GUIDE[1]], ['134_switching_lever']);
  const sleeve = pivot('sleeve135', [Q_REST[0], HEIGHT['33'], Q_REST[1]], ['135_silicone_tube_position_unresolved']);
  const selector = pivot('selector', [SPEED_AXIS[0], 0, SPEED_AXIS[1]], ['102_switching_segment_S_slot_estimated']);
  const segmentSpring = pivot('segment_spring', [SPEED_AXIS[0], -32.7, SPEED_AXIS[1]], ['103_segment_spring_envelope']);
  const selectorShaft = pivot('selector_shaft', [SPEED_AXIS[0], 0, SPEED_AXIS[1]], ['106_detent_plate', '6_speed_lever_brass_shaft']);
  const lamp = nodes.get('87_neon_glow_lamp'), spindle = nodes.get('38_single_play_spindle_turns_with_platter');
  const lampMaterials = [];
  lamp?.traverse(o => { if (o.isMesh) {
    o.material = o.material.clone(); o.material.emissive?.setHex(0xff6b18); lampMaterials.push(o.material);
  } });
  // Keep the live toothed pinion and strobe shader: the CAD substitutes here are
  // explicitly an untoothed envelope and an unmarked ring, not functional detail.
  for (const label of ['4b_brass_pinion_envelope_teeth_unresolved', '5_strobe_ring_225222_rows_unresolved']) {
    nodes.get(label).visible = false;
    nodes.get(label).userData.runtimeReplacement = 'retained procedural functional detail';
  }
  const initial133 = direction(Q_REST, REST), initial134 = direction(GUIDE, Q_REST);
  const model = createCadDriveModel();
  const support = kit ? bindDriveSupport({ root, kit }) : null;
  const transmission = kit ? bindDriveTransmission({ root, kit, lever,
    leverAnchorInRoot: [(GUIDE[0]+Q_REST[0])/2000,-.014,(GUIDE[1]+Q_REST[1])/2000] }) : null;
  function update(dt, s, ctx = {}) {
    const p = s.cadDrivePose?.source === 'cad-drive' ? s.cadDrivePose : model.pose(s);
    support?.update(s);
    platter.rotation.y = -(s.platterTurns ?? 0) * TAU;
    // Exterior pulley/idler contact reverses spin; interior idler/wall contact does not.
    rotor.rotation.y = (s.motorTurns ?? 0) * TAU;
    wheel.rotation.y = -(s.idlerTurns ?? 0) * TAU;
    wheel.position.set(p.c[0] * MM, p.y, p.c[1] * MM);
    axleFittings.position.copy(wheel.position);
    swing.position.set(p.q[0] * MM, p.y - INSTALLED_LINKAGE_DROP, p.q[1] * MM);
    swing.rotation.y = -(p.yaw133 - initial133);
    sleeve.position.copy(swing.position);
    lever.position.y = p.y - INSTALLED_LINKAGE_DROP; lever.rotation.y = -(p.yaw134 - initial134);
    selector.rotation.y = -(p.selector - 31 * Math.PI / 180); selector.position.y = p.pitchLift * MM + p.selectorCalibration - INSTALLED_LINKAGE_DROP;
    selectorShaft.rotation.y = selector.rotation.y;
    segmentSpring.position.y = -.0327 - INSTALLED_LINKAGE_DROP;
    segmentSpring.scale.y = (.0029 + selector.position.y + INSTALLED_LINKAGE_DROP) / .0029;
    spindle.visible = !(s.changer?.inserted ?? s.mode === 'multi');
    for (const mat of lampMaterials) mat.emissiveIntensity = clamp(ctx.lamp ?? (s.power ? 1 : 0), 0, 1) * 2;
    transmission?.update(s,p);
    group.userData.pose = p;
  }
  // The procedural platter keeps the record, adapter, stack and strobe uniforms;
  // its geometry is hidden by the integrator, not by this adapter.
  const replacedKeys = ['motor', 'pulley', 'idler', 'idlerKeeper', 'idlerArm', 'idlerTailBumper',
    'speedBracket', 'speedSeg', 'speedLiftOff', 'rocker', 'speedLink', 'strobeHousing', 'neon', 'strobePrism',
    'platterCasting', 'platterRim', 'mat', 'centreDisc', 'spindle', ...(support?.replacedKeys || [])];
  return { group, model, meshes: [...(support?.meshes || []),...(transmission?.meshes || [])], hiddenMeshes: transmission?.hiddenMeshes || [], debug: transmission?.debug, replacedKeys, retainedKeys: support ? ['strobeRing'] : ['hubGear', 'strobeRing'], groups: { platter, rotor, wheel, axleFittings, swing, lever, sleeve, selector, selectorShaft, segmentSpring }, update, setEnabled,
    dispose() { setEnabled(false); transmission?.dispose(); support?.dispose(); for (const { mesh, old, geometry } of [...mountRestores].reverse()) { mesh.geometry = old; geometry.dispose(); } for (const mat of lampMaterials) mat.dispose(); } };
}

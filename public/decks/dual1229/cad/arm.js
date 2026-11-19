// Reconstructed arm bodies on the existing interactive arm's motion.
// Source: reconstruction/arm parked_single, params.py + build_arm.py group assignments.
// Geometry is unchanged. This adapter does not validate the estimated rest, cue or bearing fits.
import * as THREE from 'three';
import { DH, Y_PIVOT } from '../../../deck3d/layout.js';
import { SPEC, REST, REST_DATUM } from '../spec.js';
import { PIVOT } from '../layout.js';

export const ARM_CAD = Object.freeze({
  pivot: Object.freeze([0.17597636204899794, 0.0501, -0.1016]),
  parkedYaw: -1.4670324126983245,
  // Local CAD axes: X along tube, Y left, Z up; already expressed in metres.
  stylus: Object.freeze([0.22059006264072661, -0.024980477660771605, -0.0215]),
  // The gimbal's rings, drum 77 and the body's cross-piece are turned about the vertical pivot so the
  // bearing lies square to the angled head, not the tube (kinematics.py GIMBAL_SKEW; owner's close-ups
  // 2026-11-19). Radians about the deck's vertical. The arm pitches about this turned axis.
  gimbalSkew: -0.5473504820501953,
});
// The gimbal frame: the arm's own frame turned by gimbalSkew about the vertical, so that its cross
// axis is the real pitch axis. A point pitches as it did about the tube's cross axis once it is
// written in this frame and the heading used is the gimbal's (tube heading + gimbalSkew).
const SKEW_COS = Math.cos(ARM_CAD.gimbalSkew), SKEW_SIN = Math.sin(ARM_CAD.gimbalSkew);
export const toGimbal = (x, y) => [x * SKEW_COS + y * SKEW_SIN, -x * SKEW_SIN + y * SKEW_COS];
export const fromGimbal = (x, y) => [x * SKEW_COS - y * SKEW_SIN, x * SKEW_SIN + y * SKEW_COS];
export const ARM_GIMBAL = Object.freeze({ stylus: Object.freeze([...toGimbal(ARM_CAD.stylus[0], ARM_CAD.stylus[1]), ARM_CAD.stylus[2]]) });
// Stylus height above the pivot for a pitch (metres): the one place the pitch lever arm is written.
export const cadStylusRise = pitch => ARM_GIMBAL.stylus[0] * Math.sin(pitch) + ARM_GIMBAL.stylus[2] * Math.cos(pitch);

// Metres, in the arm's CAD body frame. This is kinematics.pad_footprint(): the working underside of
// the quarter-disc cue shelf in arm.73.bearing_body (its sector, kept 9.3 mm in front of the pitch
// axis, clear of the cross-piece). The lift cap bears on it from below.
export const ARM_PAD_FOOTPRINT = Object.freeze([
  [0.008697, -0.003600], [0.016500, -0.003600], [0.016486, -0.004233], [0.016445, -0.004864],
  [0.016376, -0.005493], [0.016280, -0.006118], [0.016156, -0.006738], [0.016006, -0.007353],
  [0.015829, -0.007960], [0.015626, -0.008559], [0.015396, -0.009149], [0.015142, -0.009728],
  [0.014862, -0.010295], [0.014557, -0.010850], [0.014229, -0.011391], [0.013878, -0.011917],
  [0.013504, -0.012427], [0.013108, -0.012920], [0.012691, -0.013396], [0.012253, -0.013853],
  [0.011796, -0.014290], [0.011320, -0.014708], [0.010827, -0.015104], [0.010317, -0.015478],
  [0.009791, -0.015829], [0.009250, -0.016157], [0.008695, -0.016462], [0.008128, -0.016741],
  [0.007549, -0.016996], [0.006959, -0.017226], [0.006360, -0.017429], [0.005753, -0.017606],
  [0.005138, -0.017756], [0.004518, -0.017880], [0.003893, -0.017976], [0.003264, -0.018045],
  [0.002632, -0.018086], [0.002000, -0.018100], [0.001368, -0.018086], [0.000736, -0.018045],
  [0.000107, -0.017976], [-0.000050, -0.017952],
].map(Object.freeze));
export const PAD_BOTTOM = -0.0005;

function insidePad(x, y) {
  let inside = false;
  for (let i = 0, j = ARM_PAD_FOOTPRINT.length - 1; i < ARM_PAD_FOOTPRINT.length; j = i++) {
    const [xi, yi] = ARM_PAD_FOOTPRINT[i], [xj, yj] = ARM_PAD_FOOTPRINT[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// A horizontal, flat cap meets a tilted pad first at its rim on the lower side.
// This is a finite, rendered surface contact query, not a spring/force solver.
// Dimensions, the cap axis and the real contact topology remain provisional.
export function cadPadContact(pose, { axis, radius = 0.0025 } = {}) {
  const invalid = reason => ({ valid: false, height: null, point: null, bodyPoint: null, reason });
  if (!pose?.valid || ![pose.yaw, pose.pitch, pose.raise, axis?.x, axis?.z, radius].every(Number.isFinite) || radius < 0) {
    return invalid('invalid pose or cap dimensions');
  }
  const c = Math.cos(pose.pitch), s = Math.sin(pose.pitch);
  if (c < 0.5) return invalid('pad pitch outside the supported contact range');
  // The pad tilts about the gimbal's pitch axis: resolve the cap along and across the gimbal heading.
  const heading = pose.yaw + ARM_CAD.gimbalSkew, cy = Math.cos(heading), sy = Math.sin(heading);
  const dx = axis.x - ARM_CAD.pivot[0], dy = -(axis.z - ARM_CAD.pivot[2]);
  const xc = cy * dx + sy * dy, yc = -sy * dx + cy * dy;
  const rim = -Math.sign(s) * radius;
  const contactX = xc + rim;
  const bodyPoint = [...fromGimbal((contactX + PAD_BOTTOM * s) / c, yc), PAD_BOTTOM]; // in the arm's own frame, as the footprint
  if (!insidePad(bodyPoint[0], bodyPoint[1])) return invalid('cap contact is outside the finite arm pad');
  const height = ARM_CAD.pivot[1] + pose.raise + contactX * s / c + PAD_BOTTOM / c;
  return { valid: true, height, point: [axis.x + rim * cy, height, axis.z - rim * sy], bodyPoint,
    radius, axis: { x: axis.x, z: axis.z }, classification: 'provisional rendered flat-cap contact; no force closure', reason: null };
}

const groupsById = {
  'arm.73.tube': 'pitch', 'arm.73.bearing_body': 'pitch',
  'arm.73.head_socket_support': 'pitch', 'arm.41.head': 'pitch',
  'arm.63.tk14_holder': 'pitch', 'ctx.cartridge_generic': 'pitch',
  'arm.75.cw_stud': 'pitch', 'arm.74.counterweight': 'pitch', 'arm.76.clamp_screw': 'pitch',
  'arm.54.inner_ring': 'yaw', 'arm.56.height_screw': 'yaw',
  'arm.53.pitch_point_left': 'yaw', 'arm.57.pitch_point_right': 'yaw',
  'arm.77.spring_housing': 'force',
  'arm.60.outer_ring_stud': 'bearing', 'arm.58.yaw_point_top': 'bearing',
  'arm.69.bushing': 'fixed', 'arm.70.mode_lever': 'mode',
  'arm.66.rest_post': 'fixed', 'arm.52.rest_bar_and_pin50': 'fixed',
  'arm.79.antiskate_knob': 'skate', 'arm.258.antiskate_cam_envelope': 'skate',
  'iface.198.pimpel_tip_datum': 'hidden',
};

export const REPLACED_ARM_KEYS = Object.freeze([
  'bearingPost', 'compressionRing', 'gimbalEars', 'gimbalOuter', 'gimbalInner',
  'bearingPoints', 'adjustRod59', 'locknut60', 'adjustRod62', 'locknut61',
  'armTube', 'counterweightStud', 'counterweight', 'forceDial', 'armHead',
  'fingerLift', 'headshellLatch', 'tk14', 'cartridge', 'contactPlate', 'armSupportPiece',
  'armRest', 'restStud', 'liftContactBody', 'modeSelector', 'locatingLever', 'skateKnob',
]);

// The old arm pitches about its stylus bearing; the CAD pitches about the tube.
// Match the controller's stylus height and plan bearing, retaining the CAD's actual
// tube/head dimensions. Plan reach can differ slightly under pitch; report it, never stretch.
export function cadPoseForRuntime({ yaw, pitch, pivotHeight, raise, length, drop = DH }) {
  const [x, y, z] = ARM_GIMBAL.stylus; // gimbal frame: the pitch axis is turned from the tube's cross axis
  const stylusHeight = pivotHeight + length * Math.sin(pitch) - drop * Math.cos(pitch);
  const h = stylusHeight - ARM_CAD.pivot[1] - raise;
  const radius = Math.hypot(x, z);
  if (![yaw, pitch, pivotHeight, raise, length, drop].every(Number.isFinite) || Math.abs(h) > radius) {
    return { valid: false, reason: 'runtime stylus height is outside the CAD arm reach' };
  }
  const theta = Math.asin(h / radius) - Math.atan2(z, x);
  const projectedX = x * Math.cos(theta) - z * Math.sin(theta);
  return {
    valid: true, yaw: yaw - ARM_CAD.gimbalSkew - Math.atan2(y, projectedX), pitch: theta, raise, stylusHeight,
    planReachResidual: Math.hypot(projectedX, y) - (length * Math.cos(pitch) + drop * Math.sin(pitch)),
  };
}

// The mechanism sets the stylus on a flat, centred record. The record drawn is warped and a little
// off centre; the view knows by how much under the stylus this frame (ctx.warp: metres up, ctx.sway:
// radians of the arm's plan angle), and a playing stylus rides both. Without this the arm stood
// dead still while the warp rose through the stylus. Every place that poses the installed arm
// goes through here (this file's update, and cad/mechanisms.js after its lift).
export function rideRecord(pose, ctx) {
  if (!pose?.valid || !Number.isFinite(pose.stylusHeight) || !(ctx?.warp || ctx?.sway)) return pose;
  const [sx, sy] = ARM_CAD.stylus, armAngle = -pose.yaw - Math.atan2(sy, sx);
  const rode = cadPoseForHeight({ armAngle: armAngle + (ctx.sway || 0), stylusHeight: pose.stylusHeight + (ctx.warp || 0), raise: pose.raise || 0 });
  return rode.valid ? { ...pose, ...rode } : pose;
}
// Shared installed-joint contract: armAngle is the legacy plan bearing, while
// yaw is the tube's rigid heading. The zero-pitch offset stays fixed when cueing,
// so the gimbal and segment201 need not rotate relative to each other in pitch.
export function cadPoseForHeight({ armAngle, stylusHeight, raise = 0 }) {
  const [x, y] = ARM_CAD.stylus, [gx, , z] = ARM_GIMBAL.stylus, radius = Math.hypot(gx, z);
  const h = stylusHeight - ARM_CAD.pivot[1] - raise;
  if (![armAngle, stylusHeight, raise].every(Number.isFinite) || Math.abs(h) > radius) return {valid:false, reason:'installed arm height outside reach'};
  // The heading keeps its zero-pitch offset; the height is reached about the gimbal's pitch axis.
  return {valid:true, yaw:-armAngle-Math.atan2(y,x), pitch:Math.asin(h/radius)-Math.atan2(z,gx), raise, stylusHeight};
}

function partId(node) {
  const name = node.userData.name || node.name;
  if (name in groupsById) return name;
  // GLTFLoader sanitizes dots in Object3D.name; userData.name normally retains the original.
  return Object.keys(groupsById).find(id => id.replace(/[.\[\]:/]/g, '') === name);
}

// The gimbal's pitch axis in the yaw group's frame (x along the tube, y up).
const PITCH_AXIS = new THREE.Vector3(Math.sin(ARM_CAD.gimbalSkew), 0, Math.cos(ARM_CAD.gimbalSkew));
export function bindArm({ scene, root, arm, kit }) {
  const binding = new THREE.Group(); binding.name = 'cadArmJoints'; root.add(binding);
  const group = (name, parent = binding) => {
    const g = new THREE.Group(); g.name = `cadArm_${name}`; parent.add(g); return g;
  };
  const bearing = group('bearing'); bearing.position.fromArray(ARM_CAD.pivot); bearing.rotation.y = ARM_CAD.parkedYaw;
  const yaw = group('yaw', bearing), pitch = group('pitch', yaw);
  // Drum 77 turns about the gimbal's own pitch axis, which is skewed from the tube's cross axis.
  const skew = group('gimbalSkew', yaw); skew.rotation.y = ARM_CAD.gimbalSkew;
  const force = group('force', skew);
  const mode = group('mode'); mode.position.set(ARM_CAD.pivot[0], 0, ARM_CAD.pivot[2]);
  const skate = group('skate'); skate.position.set(0.203, 0, -0.051);
  const groups = { bearing, yaw, pitch, force, mode, skate, fixed: scene };
  const status = { motion: 'existing runtime inputs; CAD contact closure unverified', mapped: [], unmapped: [], pose: null };
  const restores = [];
  root.updateMatrixWorld(true);
  const nodes = []; scene.traverse(node => {
    const id = partId(node); if (id) nodes.push([node, id]);
    if (node.isMesh) {
      let owner = node; while (owner && !partId(owner)) owner = owner.parent;
      if (!owner) status.unmapped.push(node.userData.name || node.name);
    }
  });
  for (const [node, id] of nodes) {
    const target = groupsById[id];
    restores.push({ node, parent: node.parent, matrix: node.matrix.clone(), visible: node.visible });
    if (target === 'hidden') node.visible = false;
    else if (target !== 'fixed') groups[target].attach(node);
    node.userData.cadJoint = target;
    status.mapped.push({ id, joint: target });
  }
  // Rest post 66 was exported where the parked arm's support piece lay with the stylus at
  // REST_DATUM. The parked arm now lies at REST (spec.js, D5): swing the post's plan
  // position about the pivot by the same yaw so the support piece still lands on its top. The post
  // keeps its orientation and height; this runs before any contact is extracted from it. Bar 52 and
  // pin 50 stay put (the pin stands behind the badge); exterior-rest.js draws the bar to the post.
  const post = nodes.find(([, id]) => id === 'arm.66.rest_post')?.[0];
  status.restPostShift = [0, 0];
  if (post) {
    const d = Math.hypot(PIVOT.x, PIVOT.z), L = SPEC.armL;
    const lineAngle = (r) => { // the pivot-to-stylus heading for a stylus radius (as parts/tonearm/arm.js angleFor)
      const a = (r * r - L * L + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r * r - a * a));
      const ux = PIVOT.x / d, uz = PIVOT.z / d, mx = a * ux, mz = a * uz, z1 = mz - h * ux, z2 = mz + h * ux;
      const s = z1 > z2 ? { x: mx + h * uz, z: z1 } : { x: mx - h * uz, z: z2 };
      return Math.atan2(s.z - PIVOT.z, s.x - PIVOT.x);
    };
    const turn = -(lineAngle(REST) - lineAngle(REST_DATUM)); // as a rotation.y
    // in the deck's own frame (root's local frame: ARM_CAD.pivot is given there), whatever root's placement
    root.updateMatrixWorld(true);
    const c = root.worldToLocal(new THREE.Box3().setFromObject(post).getCenter(new THREE.Vector3()));
    const vx = c.x - ARM_CAD.pivot[0], vz = c.z - ARM_CAD.pivot[2];
    const nx = vx * Math.cos(turn) + vz * Math.sin(turn), nz = -vx * Math.sin(turn) + vz * Math.cos(turn);
    const shift = new THREE.Vector3(ARM_CAD.pivot[0] + nx - c.x, 0, ARM_CAD.pivot[2] + nz - c.z);
    if (shift.lengthSq() > 1e-12) {
      const local = root.worldToLocal(post.getWorldPosition(new THREE.Vector3())).add(shift);
      post.position.copy(post.parent.worldToLocal(root.localToWorld(local))); post.updateMatrixWorld(true);
    }
    status.restPostShift = [shift.x, shift.z];
  }
  const oldSkate = kit?.parts?.skateKnob?.groups?.[0]?.children?.[0];
  function applyPose(pose) {
    status.pose = pose;
    if (!pose?.valid) return;
    bearing.position.y = ARM_CAD.pivot[1] + pose.raise;
    yaw.rotation.y = pose.yaw - ARM_CAD.parkedYaw;
    pitch.quaternion.setFromAxisAngle(PITCH_AXIS, pose.pitch); // about the gimbal's own pitch axis
    binding.updateWorldMatrix(true, true);
  }
  function update(_dt, state, ctx) {
    const pose = cadPoseForRuntime({
      yaw: arm.yaw.rotation.y, pitch: arm.pitch.rotation.z,
      pivotHeight: arm.yaw.position.y,
      raise: arm.fixedGimbal.position.y - Y_PIVOT, length: arm.L,
    });
    applyPose(rideRecord(ctx?.cadArmPose || state?.cadArmPose || pose, ctx));
    if (!status.pose.valid) return; // Keep the last valid pose; failure stays visible.
    if (arm.forceDial) force.rotation.z = arm.forceDial.rotation.z;
    if (kit?.named?.modeLever70) mode.rotation.y = kit.named.modeLever70.rotation.y;
    if (oldSkate) skate.rotation.y = oldSkate.rotation.y;
  }
  function dispose() {
    for (const { node, parent, matrix, visible } of restores) {
      parent.add(node); node.matrix.copy(matrix); matrix.decompose(node.position, node.quaternion, node.scale);
      node.visible = visible; delete node.userData.cadJoint;
    }
    binding.removeFromParent();
  }
  update();
  const padContact = options => cadPadContact(status.pose, options);
  return { update, applyPose, dispose, groups, status, padContact, replacedKeys: REPLACED_ARM_KEYS };
}

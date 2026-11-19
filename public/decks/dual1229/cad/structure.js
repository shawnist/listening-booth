import * as THREE from 'three';
import { annulusGeometry } from './drive-support.js';

// Installed estimate: use the three drive and selector shaft axes for the
// structure controls. The optical window follows the fascia aperture in the manifest.
export function installedStructureAxes(axes) {
  return { ...axes, speed_pitch: [-129, 117], start_stop_48: [141, 117], size_49: [199, 117] };
}
// Rotations remain control inputs; the speed/pitch transmission is unresolved.
export function bindStructure({ scene, root, kit, axes, strobeLight }) {
  const joints = [], hits = [], details = [];
  const installed = installedStructureAxes(axes);
  for (const [control, dx] of [['start', -0.01025], ['stop', 0.01025]]) {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.0195, 0.012, 0.047), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(installed.start_stop_48[0] / 1000 + dx, 0.006, installed.start_stop_48[1] / 1000 + 0.0165);
    hit.userData.control = `dual:${control}`; root.add(hit); kit.hits.push(hit); hits.push(hit);
  }
  const mappings = [
    ['S06_speed_lever', 'speedLever', 'speed_pitch'],
    ['S08_pitch_wheel', 'pitchWheel', 'speed_pitch'],
    ['S48_start_stop_lever', 'startStopLever', 'start_stop_48'],
    ['S49_size_lever', 'sizeLever', 'size_49'],
  ];
  root.updateMatrixWorld(true);
  for (const [name, key, axis] of mappings) {
    const body = scene.getObjectByName(name);
    const source = kit.parts[key]?.groups[0];
    if (!body || !source) throw new Error(`Missing CAD control mapping: ${name} / ${key}`);
    const pivot = new THREE.Group();
    pivot.name = `cad-joint-${key}`;
    pivot.position.set(axes[axis][0] / 1000, 0, axes[axis][1] / 1000);
    root.add(pivot); pivot.updateMatrixWorld(true); pivot.attach(body);
    joints.push({ pivot, source });
    if (key === 'pitchWheel') {
      // The old wheel's white index is a separate finish mesh, absent from the
      // CAD solid. Keep its size/orientation and original clearance above the
      // wheel, registering it to this exported wheel's top and rotating joint.
      const mark = kit.parts[key].meshes.find(m => m.geometry?.type === 'ShapeGeometry');
      if (mark) {
        source.updateWorldMatrix(true, true);
        root.updateWorldMatrix(true, true);
        const local = source.matrixWorld.clone().invert();
        const point = new THREE.Vector3();
        const topIn = (meshes, inverse) => {
          let top = -Infinity;
          for (const mesh of meshes) {
            const matrix = inverse.clone().multiply(mesh.matrixWorld), positions = mesh.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) top = Math.max(top, point.fromBufferAttribute(positions, i).applyMatrix4(matrix).y);
          }
          return top;
        };
        const markLocal = local.clone().multiply(mark.matrixWorld);
        const sourceTop = topIn(kit.parts[key].meshes.filter(m => m !== mark), local);
        const bodyMeshes = []; body.traverse(o => { if (o.isMesh) bodyMeshes.push(o); });
        const cadTop = topIn(bodyMeshes, root.matrixWorld.clone().invert());
        const copy = mark.clone(); copy.geometry = mark.geometry.clone(); copy.material = mark.material.clone();
        markLocal.decompose(copy.position, copy.quaternion, copy.scale);
        const gap = copy.position.y - sourceTop;
        copy.position.set(pivot.position.x + copy.position.x, cadTop + gap, pivot.position.z + copy.position.z);
        copy.name = 'finish-pitch-index'; copy.userData = { part: 'cad:structure:S08_pitch_wheel', cad: 'structure' };
        root.add(copy); root.updateWorldMatrix(true, true); pivot.attach(copy);
        details.push(copy);
      }
    }
    pivot.position.x += (installed[axis][0] - axes[axis][0]) / 1000;
    pivot.position.z += (installed[axis][1] - axes[axis][1]) / 1000;
    pivot.userData.installedInterface = { sourceAxis: axes[axis], installedAxis: installed[axis], status: 'estimated installed registration' };
  }
  // A fitted mounting bushing joins the drive's r1.9 shaft to the exported
  // controls' r2.6 bores. Its axial overlap is an installed estimate.
  const bushing = new THREE.Mesh(annulusGeometry(.0019,.0026,-.001,.0051),
    new THREE.MeshStandardMaterial({ color: 0xac925e, metalness: .7, roughness: .4 }));
  bushing.name = 'installed-speed-control-bushing';
  bushing.position.set(installed.speed_pitch[0]/1000,0,installed.speed_pitch[1]/1000);
  bushing.userData = { part: 'installed:speed-control-bushing', cad: 'structure', basis: 'estimated fitted mounting bushing; pitch transmission unresolved' };
  root.add(bushing); details.push(bushing);
  // Keep the source stand157 intact. Its dish ear was seated at -17.2mm;
  // the installed floor is -12.1mm. A named 5.1mm spacer closes that support.
  const standSpacer = new THREE.Mesh(annulusGeometry(.0016, .0045, -.0172, -.0121),
    new THREE.MeshStandardMaterial({ color: 0xac925e, metalness: .7, roughness: .4 }));
  standSpacer.position.set(-.0182, 0, -.0972); standSpacer.name = 'installed157-dish-spacer';
  standSpacer.userData = { part: 'installed:157-dish-spacer', cad: 'structure', basis: 'estimated spacer from original stand ear to installed dish underside; screw length unresolved' };
  root.add(standSpacer); details.push(standSpacer);

  // The strobe ring is installed over the plain 1229 strip aperture.
  // Register the working optical material to that same spindle-frame centre.
  const window = kit.parts.strobeWindow;
  const optical = window?.meshes.find(m => m.material === kit._strobeLens);
  let opticalCopy = null;
  if (optical) {
    optical.updateWorldMatrix(true, false);
    opticalCopy = optical.clone(); opticalCopy.geometry = optical.geometry.clone(); opticalCopy.material = optical.material;
    opticalCopy.applyMatrix4(new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(optical.parent.matrixWorld));
    const oldAxis = window.groups[0].position;
    opticalCopy.position.x += installed.strobe_46[0] / 1000 - oldAxis.x;
    opticalCopy.position.z += installed.strobe_46[1] / 1000 - oldAxis.z;
    root.add(opticalCopy);
  }
  // The visible spill is produced at the prism window. Move only that light,
  // preserving its animated intensity and the original procedural position.
  const oldLight = strobeLight?.position.clone();
  const seatedLight = oldLight?.clone();
  if (seatedLight && window) {
    seatedLight.x += installed.strobe_46[0] / 1000 - window.groups[0].position.x;
    seatedLight.z += installed.strobe_46[1] / 1000 - window.groups[0].position.z;
  }
  const setEnabled = active => { if (strobeLight) strobeLight.position.copy(active ? seatedLight : oldLight); };
  root.updateMatrixWorld(true);
  return {
    joints, meshes: details, setEnabled,
    update() { for (const { pivot, source } of joints) pivot.rotation.y = source.rotation.y; },
    dispose() { setEnabled(false); opticalCopy?.geometry.dispose(); opticalCopy?.removeFromParent(); for (const h of [...hits, ...details]) { h.removeFromParent(); h.geometry.dispose(); h.material.dispose(); } },
  };
}

// The Dual 1229's controls in the Workbench: the same controls as on its chassis, the two
// dials the sound does not use yet, the X-ray and slow-motion switches, a live readout of the
// mechanism, and a legend of the parts under the plate (hover a name to light the part up).
import { SPEC, PARTS, cycleSeconds } from './spec.js';
import { TRIP } from './parts/automatic/trip-rail.js';

// createDualPanel({ ctl, view, el, state }) -> { node, update(), dispose() }
export function createDualPanel({ ctl, view, el, state }) {
  const m = ctl.mech;
  const seg = (label, opts, get, set) => {
    const g = el('div', { className: 'seg', role: 'group' }); g.setAttribute('aria-label', label);
    const btns = opts.map(([v, t, tip]) => { const b = el('button', { type: 'button', textContent: t, title: tip || '' }); b.dataset.v = String(v); b.addEventListener('click', () => set(v)); g.append(b); return b; });
    return { node: g, sync: () => { for (const b of btns) b.classList.toggle('on', b.dataset.v === String(get())); } };
  };
  const slider = (min, max, step, get, set, fmt) => {
    const out = el('output', {}); const input = el('input', { type: 'range', min, max, step });
    input.addEventListener('input', () => set(Number(input.value)));
    return { input, out, sync: () => { if (document.activeElement !== input) input.value = get(); out.textContent = fmt(get()); } };
  };

  const startB = el('button', { type: 'button', id: 'dualStart', textContent: 'Start', title: 'Play: the arm moves over and sets down on the record' });
  const stopB = el('button', { type: 'button', id: 'dualStop', textContent: 'Stop', title: 'Stop: the arm returns to its rest and the turntable stops' });
  startB.addEventListener('click', () => ctl.start()); stopB.addEventListener('click', () => ctl.stop());
  const cueB = el('button', { type: 'button', id: 'dualCue', textContent: 'Lift', title: 'Raise or lower the arm' });
  cueB.addEventListener('click', () => ctl.setCue(!m.cueUp));
  const speed = seg('Speed', [['33', '33'], ['45', '45'], ['78', '78']], () => m.speed, (v) => ctl.setSpeed(v));
  const size = seg('Record size', [[7, '7"'], [10, '10"'], [12, '12"']], () => m.size, (v) => ctl.setSize(v));
  const mode = seg('Mode', [['single', 'Single'], ['multi', 'Multi', 'Stack several records on the spindle; each one drops onto the platter in turn']], () => m.mode, (v) => ctl.setMode(v));
  // the changer's stack: records put on the AW 3 spindle by hand, and the ones it dropped taken off
  const stackOut = el('output', { id: 'dualStackCount' });
  const addB = el('button', { type: 'button', id: 'dualStackAdd', textContent: '+ Record', title: 'Put a record (the size chosen above) on top of the changer spindle\'s stack' });
  const takeB = el('button', { type: 'button', id: 'dualStackTake', textContent: '− Record', title: 'Take the top record off the spindle' });
  const clearB = el('button', { type: 'button', id: 'dualPileClear', textContent: 'Take dropped records off', title: 'Lift the records the changer dropped off the platter' });
  addB.addEventListener('click', () => ctl.loadSpindle(m.size)); takeB.addEventListener('click', () => ctl.unloadSpindle()); clearB.addEventListener('click', () => ctl.clearPile());
  const pitch = slider(-3, 3, 0.1, () => Math.round(m.pitch * 1000) / 10, (v) => ctl.setPitch(v / 100), (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
  pitch.input.id = 'dualPitch';
  pitch.input.addEventListener('dblclick', () => ctl.setPitch(0));
  const force = slider(0, 3, 0.05, () => m.trackingForce, (v) => ctl.setForce(v), (v) => `${v.toFixed(v < 1.5 ? 1 : 2)} g`);
  force.input.id = 'dualForce';
  const skate = slider(0, 3, 0.1, () => m.antiSkate, (v) => ctl.setSkate(v), (v) => `${v.toFixed(1)}`);
  skate.input.id = 'dualSkate';
  const scale = seg('Anti-skating scale', [['red', 'Conical', 'A conical stylus: the anti-skating dial reads its red scale'], ['white', 'Elliptical', 'An elliptical stylus: the anti-skating dial reads its white scale']], () => m.skateScale, (v) => ctl.setSkateScale(v));

  const xrayBox = el('input', { type: 'checkbox', id: 'dualXray' });
  const cadBox = el('input', { type: 'checkbox', id: 'dualCad', checked: true });
  cadBox.addEventListener('change', () => view.setCad(cadBox.checked));
  const cadStatus = el('p', { className: 'note', id: 'dualCadStatus', role: 'status' });
  xrayBox.addEventListener('change', () => view.setXray(xrayBox.checked));
  const slowBox = el('input', { type: 'checkbox', id: 'dualSlow' });
  slowBox.addEventListener('change', () => ctl.setSlow(slowBox.checked ? 0.1 : 1));
  const viewRow = el('div', { className: 'row' });
  for (const [name, label] of [['xray', 'X-ray'], ['under', 'Underneath'], ['cam', 'Close on the cam'], ['lever', 'Lever 184'], ['seated', 'Seated']]) {
    const b = el('button', { type: 'button', textContent: label }); b.addEventListener('click', () => view.setView(name)); viewRow.append(b);
  }

  const readout = el('pre', { className: 'sheet dualread', id: 'dualRead' });
  const log = el('ul', { className: 'duallog' });
  const legend = el('ul', { className: 'duallegend' });
  for (const [key, p] of Object.entries(PARTS)) {
    const button = el('button', { type: 'button' }, [el('b', { textContent: p.no }), el('span', { textContent: p.name })]);
    button.dataset.part = key;
    button.setAttribute('aria-pressed', 'false');
    const li = el('li', {}, [button]);
    const on = () => view.highlightPart(key), off = () => view.highlightPart(null);
    button.addEventListener('mouseenter', on); button.addEventListener('mouseleave', off);
    button.addEventListener('focus', on); button.addEventListener('blur', off);
    button.addEventListener('click', () => {
      view.setXray(true);
      view.selectPart(view.selectedPart === key ? null : key);
      off();
    });
    legend.append(li);
  }
  const lab = (text, ctrl, out) => el('label', {}, out ? [text, ' ', out, ctrl] : [text, ctrl]);
  const node = el('section', { className: 'dualpanel', id: 'dualPanel' }, [
    // no heading of its own: the Workbench shows only this table's controls (owner, 2026-11-18)
    el('p', { className: 'note', textContent: 'Start plays the record from the edge of the size you chose. At the end of the side the arm returns and the turntable stops. You can also move the arm over by hand.' }),
    el('div', { className: 'transport' }, [startB, stopB, cueB]),
    el('div', { className: 'pair' }, [lab('Speed', speed.node), lab('Record size', size.node)]),
    lab('Pitch', pitch.input, pitch.out),
    lab('Mode', mode.node),
    el('div', { className: 'row', id: 'dualStack' }, [el('span', { textContent: 'Changer spindle ' }), stackOut, addB, takeB, clearB]),
    el('p', { className: 'note warn', textContent: 'Records the changer drops are silent stand-ins with a fast 2 mm spiral, so a stack can be watched cycling: the sound comes only from the record put on from the shelf.' }),
    el('h3', { textContent: 'Tracking force and anti-skating' }),
    lab('Tracking force', force.input, force.out),
    lab('Anti-skating', skate.input, skate.out),
    // which of the anti-skating dial's two scales to read: the one that matches the stylus
    el('div', { className: 'skatescale', title: 'Which stylus you play with: the anti-skating dial uses the matching scale (red for conical, white for elliptical)' }, [el('small', { textContent: 'Stylus' }), scale.node]),
    el('p', { className: 'note warn', textContent: 'Tracking force is how hard the needle presses on the record. Too light and loud passages distort or skip. Anti-skating only changes which way a skip jumps.' }),
    el('h3', { className: 'seeworking', textContent: 'See it working' }), // the LUNA Add On hides this heading and all after it
    el('label', { className: 'check' }, [cadBox, 'Reconstructed CAD parts']),
    cadStatus,
    el('label', { className: 'check' }, [xrayBox, 'X-ray: see through the plate and platter']),
    el('label', { className: 'check' }, [slowBox, 'Slow motion, a tenth of the speed (sound off)']),
    viewRow,
    readout, log,
    el('details', {}, [el('summary', { textContent: 'Parts under the plate' }), el('p', { className: 'note', textContent: 'In X-ray, hover a part to see its name. Select a part below to keep it highlighted. Select it again to clear.' }), legend]),
  ]);

  const deg = (x) => `${Math.round(x)}°`;
  function update() {
    if (legend.dataset.selected !== (view.selectedPart || '')) {
      legend.dataset.selected = view.selectedPart || '';
      for (const button of legend.querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(button.dataset.part === view.selectedPart));
      }
    }
    const cad = view.cadStatus;
    if (cad) {
      cadBox.checked = cad.enabled;
      cadStatus.textContent = cad.state === 'loading' ? `Loading reconstructed parts (${cad.loaded}/${cad.total})…`
        : cad.state === 'error' ? 'CAD loading failed. The earlier deck remains available; reload to retry.'
        : cad.enabled ? 'Six CAD assemblies connected to these controls. Motion uses the existing simulation; estimated fit and physical dynamics remain unresolved.'
        : 'Showing the earlier procedural parts.';
    }
    speed.sync(); size.sync(); mode.sync(); scale.sync(); pitch.sync(); force.sync(); skate.sync();
    cueB.classList.toggle('on', m.cueUp); cueB.textContent = m.cueUp ? 'Lower' : 'Lift';
    const ch = m.changer;
    stackOut.textContent = `${ch.spindle.length} on the spindle, ${ch.pile.length} dropped`;
    addB.disabled = ch.rod > 1e-6 || ch.falling.length > 0; takeB.disabled = addB.disabled || !ch.spindle.length; clearB.disabled = !ch.pile.length;
    startB.disabled = stopB.disabled = m.locked;
    xrayBox.checked = !!view.xray; slowBox.checked = ctl.slow < 1;
    const st = ctl.mech, rpm = st.engaged ? st.targetRpm : 0;
    const s = state.st;
    const platRpm = s && s.rev ? (s.wp * 48000 * 60) / s.rev / (ctl.slow || 1) : 0;
    const phase = !st.camOn ? 'at neutral' : st.theta <= 0 ? 'waiting for the platter to turn it' : st.theta < 55 ? 'lifting the arm' : st.theta < 125 ? 'swinging the arm out' : st.theta < 200 ? 'holding the arm over its rest' : st.theta < 300 ? (st.inSwing ? 'swinging the arm in' : 'leaving the arm at rest') : st.theta < 330 ? 'letting the arm down' : 'returning to neutral';
    readout.textContent = [
      `main cam      ${st.camOn ? deg(st.theta) : 'neutral'} · ${phase}`,
      `cycle         ${cycleSeconds(SPEC.speeds[st.speed]).toFixed(1)} s at ${st.speed} (${(SPEC.camTeeth / SPEC.pinionTeeth).toFixed(2)} platter turns)`,
      `mains switch  ${st.power ? 'closed: motor at 1800 rpm' : 'open'}${ctl.slow < 1 ? ' (slowed ×0.1)' : ''}`,
      `idler         ${st.shift > 0 ? 'moving to the ' + st.speed + ' step' : st.engaged ? 'on the ' + st.step + ' step, pressed to the rim' : 'swung away from the rim'}`,
      `platter       ${platRpm.toFixed(2)} rpm${rpm ? ` (asked ${rpm.toFixed(2)})` : ''}`,
      `follower      ${st.follower}   pawl ${st.pawl ? 'latched' : 'free'}   muting ${st.mute ? 'SHORTED' : 'open'}`,
      `changer       ${st.mode !== 'multi' ? 'bolt held by 212 (single)' : ch.locked ? 'spindle locked: no record on its supports' : `rod down ${(ch.rod * 1000).toFixed(2)} mm, 173 at ${(ch.rocker.angle * 180 / Math.PI).toFixed(1)}°${ch.rocker.akContact ? ' on AK' : ''}`}${ch.on === 'retainers' ? ', stack on the retainers' : ''}`,
      `shut-off      ${st.press248 ? 'start lever pressing 162 toward the dog' : st.trip > 0 ? `162 nose ${(st.trip * 1000).toFixed(3)} mm inside the dog's circle (caught at ${(TRIP.catchDepth * 1000).toFixed(2)} mm)` : 'lever 162 clear of the dog'}`,
      `arm           ${(st.r * 1000).toFixed(1)} mm from the centre, lift ${(st.lift * 100).toFixed(0)} %`,
      `clutch        ${!st.clutch ? 'main lever clear of the pad (arm free)' : st.slip ? `SLIPPING: lever at ${(st.leverR * 1000).toFixed(0)} mm, arm held at ${(st.r * 1000).toFixed(0)} mm` : 'pad gripping: the main lever carries the arm'}`,
    ].join('\n');
    const lines = ctl.core.log.slice(0, 4).map((l) => l.text).filter(Boolean);
    if (log.dataset.v !== lines.join('|')) { log.dataset.v = lines.join('|'); log.replaceChildren(...lines.map((t) => el('li', { textContent: t }))); }
  }
  update();
  return { node, update, dispose() { node.remove(); } };
}

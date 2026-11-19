// Drive: the M 1219 S motor on its elastic mounts with the stepped, tapered pulley 115; the idler 131
// on its swing lever 133 and the bracket that carries it between the steps; the speed bracket 104,
// switching segment 102, switch lever assembly (rocker) 134 and the link that lifts the idler; the
// strobe lamp housing 85/90 with its neon 93, the "50/60 HZ" marks and the prism case under the
// window; the mains switch 129/167 and the leads; the speed selector's small parts (selector.js: the click-stops
// 106/124/125 with 107/108, the springs 103 and 123, the regulator 100/101 with 95-99) and the C-washers 122.
// Owned by the drive builder (see OWNERS.md).
//
// build(kit) -> { group, update(dt, s, ctx) }; publishes kit.anchors.rocker (see OWNERS.md).
// Sizes and positions: place.js. Where the moving parts are for a snapshot: kinematics.js.
import { buildMotor } from './motor.js';
import { buildIdler } from './idler.js';
import { buildSpeed } from './speed.js';
import { buildStrobe } from './strobe.js';
import { buildMains } from './mains.js';
import { ROCKER_ANCHOR, LINK } from './place.js';

export function build(kit) {
  const root = kit.group('drive');
  kit.anchors.rocker = { x: ROCKER_ANCHOR.x, y: LINK.y, z: ROCKER_ANCHOR.z }; // where the switch arm's link meets the rocker 134
  const motor = buildMotor(kit, root);
  const idler = buildIdler(kit, root);
  const speed = buildSpeed(kit, root);
  const strobe = buildStrobe(kit, root);
  const mains = buildMains(kit, root);

  // s: mechanism snapshot; ctx: { lamp 0..1 }
  function update(dt, s, ctx) {
    motor.update(s);
    const P = idler.update(s); // the idler's pose: its height drives the bracket, link and rocker
    speed.update(dt, s, P);
    strobe.update(s, ctx);
    mains.update(s);
  }
  return { group: root, update };
}

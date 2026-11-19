// The Dual 1229's shared frame: the few positions more than one subsystem depends on. Metres,
// in the same frame as the rest of the deck: the spindle is the origin, x to the right, z toward
// the listener, y up, y = 0 the top of the chassis plate. The record sits at the same height as
// on the other deck, so a record on the platter stays where it is when the table is switched.
// The positions are those of reference/register.json (which gives them in mm as (x, z, y)).
//
// INTEGRATOR ONLY (see OWNERS.md). Everything else has its own place.js in parts/<subsystem>/.
// What lives here: the plate and the base, the spindle, the arm's pivot, the heights, the gear
// mesh between the platter's pinion and the main cam, and the control axes that cross a
// subsystem line (a lever on top owned by one builder, the linkage under it by another).
import { SPEC } from './spec.js';

export const TAU = Math.PI * 2;
export const D = Math.PI / 180;

// The chassis plate (Platine): 376 x 308 mm of black pressed steel, the spindle 150 mm from its
// left edge and centred front to back (register top-plate; DECISIONS D21 for the thickness).
export const PLATE = { x0: -0.150, x1: 0.226, z0: -0.154, z1: 0.154, t: 0.0015, r: 0.006 };
// The recessed dish the platter turns in: a closed floor about 10 mm below the plate top
// (register platter-dish, r 131-135; D21). The bearing passes through a hole in its floor.
export const DISH = { r: 0.133, depth: 0.010, floorT: 0.0015, hole: 0.012 };

// The walnut base, WB-19 size (DECISIONS D14): 425 x 368 x 92 mm overall, centred under the
// plate, its top level with the plate top, the plate in an opening with a few mm of gap all
// round. 92 mm includes its feet, so the table top it stands on is 92 mm below the plate: 18 mm
// lower than under the other deck (deck3d Y_TABLE, 74 mm). The deck view moves the table top
// for each deck (model.tableY), so the record is at the same height on both.
export const BASE = { w: 0.425, d: 0.368, h: 0.092, r: 0.01, gap: 0.003 };
BASE.x0 = (PLATE.x0 + PLATE.x1) / 2 - BASE.w / 2; BASE.x1 = BASE.x0 + BASE.w;
BASE.z0 = (PLATE.z0 + PLATE.z1) / 2 - BASE.d / 2; BASE.z1 = BASE.z0 + BASE.d;
export const FOOT_H = 0.006; // small dark feet under the base's corners
export const TABLE_Y = -BASE.h; // where the table top is, for this deck

export const R_PLATTER = SPEC.platterDia / 2; // 152.5 mm
export const R_RIM = SPEC.rimDia / 2; // the platter's drive wall, inside face: the idler presses on it (platter and drive)

// The arm: the pivot bearing 30 degrees from +x toward the back, at the distance its geometry
// needs (spec.js armL, null1, null2): (+176.0, -101.6) mm (DECISIONS D4).
export const PIVOT_ANGLE = 30 * D;
export const ARM_DIST = Math.sqrt(SPEC.armL * SPEC.armL - SPEC.null1 * SPEC.null2); // spindle to pivot: 203.2 mm
export const PIVOT = { x: ARM_DIST * Math.cos(PIVOT_ANGLE), z: -ARM_DIST * Math.sin(PIVOT_ANGLE) };

// The gear mesh: the pinion on the platter hub (platter) turns the main cam (automatic). Pitch
// radii from the tooth counts at module 0.6 (DECISIONS D10): pinion 8.1 mm, cam 54 mm, centres
// 62.1 mm apart, the cam behind and right of the spindle toward the arm, at (+51.4, -34.9).
// Both sit just under the dish floor.
export const GEAR = { hubY: -0.0145, camY: -0.0145 };
GEAR.pinionR = (SPEC.pinionTeeth * SPEC.gearModule) / 2;
GEAR.camR = (SPEC.camTeeth * SPEC.gearModule) / 2;
GEAR.camA = Math.atan2(-0.0349, 0.0514);
GEAR.camD = GEAR.pinionR + GEAR.camR; // the cam's centre sits on the pinion's pitch circle
GEAR.camX = Math.cos(GEAR.camA) * GEAR.camD;
GEAR.camZ = Math.sin(GEAR.camA) * GEAR.camD;

// Control axes shared across a subsystem line: the control on top and what it works below
// (register positions).
export const AXES = {
  speed: { x: -0.129, z: 0.117 }, // speed lever hub (outside) / switching segment 102 (drive)
  lever: { x: 0.141, z: 0.117 }, // start/stop lever 48 hub (outside) / switch lever 195, start lever 248 (automatic)
  size: { x: 0.199, z: 0.117 }, // record size lever hub (outside) / indexing lever 49 (automatic)
  strobe: { x: 0.108, z: 0.135 }, // strobe window (outside) / prism and lamp (drive) / where the platter is lit (platter)
};
AXES.strobe.a = Math.atan2(AXES.strobe.z, AXES.strobe.x);
AXES.strobe.r = Math.hypot(AXES.strobe.x, AXES.strobe.z);

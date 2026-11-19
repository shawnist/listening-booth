// The Dual 1229's partly contact-driven mechanical reconstruction.
//
// Platter travel drives cam165. The legacy fixed channel constrains legacy184;
// CAD184 uses an estimated phase program. Both use finite229 contact for carry.
// Automatic lift still uses the legacy206 support model, not the CAD lower chain. The shut-off is solved
// as contacts: segment201 -> rail253 (friction slip at271) -> lever162 -> eccentric dog
// (parts/automatic/trip-rail.js); Start and Stop press162 into the dog through248.
// Still explicit approximations: the273 latch radii,207 selection, manual cue input,
//255 engagement input and idler withdrawal, and the trip's named boundaries in
// contracts/cycle-phases.md. Do not describe those as solved component contacts.
//
// Plain JavaScript with no browser dependencies, so Node can test it. Positions are stylus
// radii in metres (the arm is described by where its stylus is), heights in metres above
// the record surface. See spec.js for where each number comes from.
import { SPEC, RATIO, REST, LIFT, R_PLATTER } from './spec.js';
import { SIZE_STOP, stopContact, sizeStopPose } from './size-stop.js';
import {MAINS_LINK,switchFromArm} from './parts/drive/mains-contact.js';
import {prescribedSwitchArmYaw} from './parts/automatic/switch-input.js';
import { muteContacts } from './cam-flange.js';
import { poseFromSnapshot, withdrawalFromSwitchArm, stepIdler, segTurn, WITHDRAWAL } from './parts/drive/kinematics.js';
const driveLimits = (w) => ({ driveWithdrawalLimit: w.yaw, driveRelLimit: w.rel }); // switch arm188 → 134 and 133
import { supportedHeight, lowerActuator, pickupFraction, actuatorForHeight, cueArmAngle } from './cue-geometry.js';
import { HANDLE, handleStep, riseToward, hookRaise, hookTopY, liftWithRaise, raiseAtLift, fullHandLift, settleStep, tiltSettleStep } from './cue-chain.js';
import { CAM_PROFILE, automaticPose, automaticLift, capContact, frictionCarry } from './automatic-contact.js';
import { Y_REC } from '../../deck3d/layout.js';
import { AW3, createChanger, stepStroke, stepFalling, pileTop, spindleHeights, RECORD_R } from './changer-contact.js';
import { armForces, freeYawStep } from './arm-forces.js';
import { initialTripState, stepTrip, tabSlack, D_CAL } from './parts/automatic/trip-rail.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ramp = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
const smooth = (t) => t * t * (3 - 2 * t);

// ---- the main cam's guide groove, angle by angle (degrees from neutral) --------------------
// Event order follows the manual; angles remain reconstruction estimates. The
// fixed XYZ profile is authoritative for184 pose. Its estimated axial plateau
// ends at300deg and returns by335deg, allowing the damped plunger to settle after
// the cam returns home. These phase labels serve other discrete mechanisms only.
export const CAM = {
  liftUp: [3, 28], // main lever pushes the lift screw (206) up: arm off the record
  outSwing: [28, 95], // main lever, through the segment (201), carries the arm out over its rest
  drop: [95, 150], // the window of AK's relief (changer-profile.js); the drop itself is solved in changer-contact.js
  slide: [150, 300], // arm positioning slide (255) raised into reach: it stops the in-swing
  inSwing: [170, 255], // the clutch carries the arm in until the positioning slide stops it
  liftDown: [300, 335], // lift screw let go: the arm settles on silicone oil (spec.js liftFall)
  followerReset: 300, // main lever puts the cam follower lever (207) back to "stop"
  startClear: 340, // start lever (248) pushed clear: the operating switch is free again
};
export const IN_R = 0.045; // the innermost point the main lever's swing reaches (E)
const REST_H = 0.55 * LIFT; // stylus height with the arm lying on its rest (E)

// Compatibility observations of the physical cam solve, not independent commands.
export const camLift = th => automaticLift(automaticPose(Math.max(0,Math.min(360,th)))).actuator;
export const camSwing = th => automaticPose(Math.max(0,Math.min(360,th))).beta/.435;
export const camRocker = (th) => Math.sin(Math.PI * ramp(th, ...CAM.drop)); // 0..1..0 through the drop window
const swingR = (s) => IN_R + (REST + 0.002 - IN_R) * s;

export const SIZES = [7, 10, 12];
export const SPEED_KEYS = ['33', '45', '78'];

export class Dual1229 {
  constructor(o = {}) {
    this.sizeStopGeometry=o.sizeStopGeometry||SIZE_STOP; // installed component dimensions
    this.mainsGeometry=o.mainsGeometry||MAINS_LINK; // installed finite rail/guide/contact geometry
    this._mainsPose=null; this._mainsYaw=NaN; this._mainsGeometry=null;
    this.camProfile = o.camProfile || CAM_PROFILE; // installed material geometry
    this.couplingModel = o.couplingModel || null; // finite CAD contact installed by the model loader
    this.driveModel = o.driveModel || null; // installed with the matching visible CAD assembly
    // ---- what the owner sets ----
    this.speed = o.speed || '33'; // speed selector (switch 6): '33' | '45' | '78'
    this.pitch = 0; // pitch knob (8): -0.03 .. +0.03
    this.size = o.size || 12; // record size selector: 7 | 10 | 12
    this.mode = o.mode || 'single'; // mode selector: 'single' | 'multi'
    this.cueUp = false; // the hand's command on lift handle64: forward (true) or tapped back (false)
    this.cueHandle = HANDLE.down; // handle64/cam220 shaft angle, moved by the hand (cue-chain.js)
    this.liftTilt = 0; // the main lever's tilt the damped lift has got to: up with the lever, down after it
    this.cueSettle = HANDLE.down; // the handle angle the damped lift has got to: up with the handle, down after it
    this.cueHook = { raise: 0, hookRaise: 0, flex: 0, top: NaN }; // 270 hook under243 (cue-chain.js)
    this.trackingForce = 1.5; // grams, on the spring housing (78)
    this.antiSkate = 1.5; // grams, on the anti-skating knob (84)
    this.skateScale = 'red'; // red scale: conical styli; white: elliptical and CD-4
    this.changer = createChanger(); // AW 3 spindle, its stack, falling records and the pile on the platter (changer-contact.js)
    this.platterRecord = true; // the record from the shelf: false, true (any size) or its radius in m (the page says; changer-contact.js pileTop)

    // ---- the mechanism ----
    this.switchOn = false; // prescribed upstream188/idler request; electrical power is separate
    this.pawl = false; // pawl (273) caught on the square bolt (274): holds the switch arm in
    this.camOn = false; // main cam engaged: in mesh with the hub pinion, or waiting for the dog to push it in
    this.camWait = false; // Start pushed, the cam not yet in mesh: it waits for the next pass of the dog (DECISIONS D12)
    this.theta = 0; // main cam angle, degrees from neutral
    this.follower = 'stop'; // cam follower lever (207): 'start' swings the arm in, 'stop' leaves it at rest
    this.inSwing = false; // decided at the start of the in-swing, from the follower
    this.dropped = false; // a record fell from the spindle in this cycle
    this.slideOn = false; // arm positioning slide (255) raised: it stops the in-swing
    this.lever = 'mid'; // operating switch (48) as last pushed: 'start' | 'stop' | 'mid'
    this.leverT = 0; // seconds it is held over before it springs back
    this.trip = 0; // nose of the shut-off lever (162) inside the dog's swept circle (m; diagnostic)
    this.tripState = initialTripState(); // rail253 slip d and lever162 angle g: friction-held contact state (trip-rail.js)
    this.press248 = false; // start lever 248 pressing162 toward the dog (Start or Stop pushed, cam not yet carried)
    this.tripFlash = 0; // seconds since the shut-off lever engaged (for drawing)
    this.platterTurns = 0; // platter angle in turns (for the dog and for drawing)
    this.lastDog = 0;
    this.camTurnsTotal = 0; // for drawing the cam teeth

    // ---- drive ----
    this.step = this.speed; // pulley step the idler stands on
    this.shift = 0; // seconds left with the idler off the pulley while it moves step
    this.shiftTotal = SPEC.speedShift; // seconds this lever movement takes (setSpeed)
    this.shiftFrom = this.speed;
    this.motorRpm = 0; // the motor's own speed (it runs whenever the mains switch is closed)
    this.motorTurns = 0; this.idlerTurns = 0; this.idlerRate = 0;
    this.idlerIn = 0; // 0 = swung away from the rim, 1 = pressed between pulley and rim (for drawing)
    this.carrierYaw = WITHDRAWAL.rest; // carrier 134's yaw and swing lever 133's angle on it, as far as
    this.swingRel = WITHDRAWAL.relRest; // the spring has pulled them (kinematics.js stepIdler)

    // ---- arm ----
    this.r = REST; // stylus radius
    this.lift = 0; // normalized actuator stroke, including clearance before contact
    this.hand = null; // { r } while a hand holds the headshell
    this.handDown = 0; // seconds left of a hand lowering the arm onto the record
    this.onSurface = false; // stylus resting on something (record, mat)
    this.h = REST_H; // stylus height above the record surface
    this.yawRate = 0; // arm chain: a free arm's yaw rate (rad/s) under the dial forces (arm-forces.js)
    this.events = []; // what the outside world must do: { type: 'land', r, byHand } | { type: 'raise' } | { type: 'trip' } | { type: 'cycle', end }
    this.cycles = []; // finished cycles: { kind, seconds, platterTurns } (for tests and the readout)
    this.cycle = null;
    this.leverR = IN_R; this.clutch = false; this.slip = false; // main lever (184) and tonearm clutch guide (223 777)
    this._tripArmR = this.r; this._tripPushR = this.r; // arm radius the trip contacts last saw
  }

  // Change an installed coupling only at rest: a loader or display toggle must
  // not switch geometry halfway through an automatic cycle.
  setCouplingModel(model) {
    if (this.couplingModel === model) return true;
    if (this.camOn || this.changer.falling.length) return false;
    this.couplingModel = model || null;
    return true;
  }
  setDriveModel(model) {
    if (this.driveModel === model) return true;
    if (this.camOn || this.changer.falling.length) return false;
    const oldBase=this.recordSurface;
    this.driveModel = model || null;
    const delta=oldBase-this.recordSurface;
    // h and changer heights are relative coordinates. Installing a different
    // mat datum must not move hardware or an already held arm in world space.
    this.h+=delta; this.changer.supportHeight+=delta;
    return true;
  }
  setChangerModel(model) {
    if (this.changerModel === model) return true;
    if (this.camOn || this.changer.falling.length) return false;
    this.changerModel=model||null; return true;
  }
  setLiftModel(model) {
    if (this.liftModel === model) return true;
    if (this.camOn || this.changer.falling.length) return false;
    this.liftModel=model||null; this.cadLift=null; return true;
  }
  get recordSurface() {
    const value=this.driveModel?.metadata?.recordSurface;
    return Number.isFinite(value) ? value : Y_REC;
  }
  setChangerSupportTop(absoluteY = null) {
    const relativeY = (absoluteY === null ? Y_REC+AW3.support : absoluteY) - this.recordSurface;
    if (!Number.isFinite(relativeY)) throw new TypeError('Changer support height must be finite');
    if (this.changer.supportHeight === relativeY) return true;
    if (this.camOn || this.changer.falling.length) return false;
    this.changer.supportHeight = relativeY;
    return true;
  }
  _couplingPose(theta, branch) {
    return this.couplingModel ? this.couplingModel.pose(theta, branch, this.mode) : automaticPose(theta, branch, this.camProfile);
  }
  _couplingContact(pose, angle) {
    return this.couplingModel ? this.couplingModel.contact(pose, angle, this.mode) : capContact(pose, angle);
  }
  _couplingCarry(radius, previous, next) {
    return this.couplingModel ? this.couplingModel.carry(radius, previous, next, this.mode) : frictionCarry(radius, previous, next);
  }

  // ---- what the owner does --------------------------------------------------------------
  // The operating switch: both directions are locked while the main cam turns.
  start() {
    if (this.camOn) return false;
    this.lever = 'start'; this.leverT = 0.25;
    this.switchOn = true; // prescribed195→188 input; finite downstream contacts determine power
    // 195 is presented to 207. The stationary cam has not carried it into change yet.
    // Start lever 248, released, is pulled by spring 251 and presses162 into the dog's range (manual p.11).
    // The cam waits until the dog's rising surface meets the pressed nose and carries162 (trip-rail.js).
    this.camOn = true; this.camWait = true; this.press248 = true; this.tripState.lastLimit = null;
    this._begin('start');
    return true;
  }
  stop() {
    if (this.camOn) return false;
    this.lever = 'stop'; this.leverT = 0.25;
    if (!this.switchOn) return false; // already off: the lever must not jam, and nothing happens
    this.follower = 'stop';
    // manual p.12: "Stop" also brings the shut-off lever into the range of the dog, and the cam is then
    // turned. Which part presses162 on the stop path is not described; modelled as the same 248 press.
    this.camOn = true; this.camWait = true; this.press248 = true; this.tripState.lastLimit = null;
    this._begin('stop');
    return true;
  }
  setSpeed(key) {
    if (!SPEED_KEYS.includes(key) || key === this.speed) return;
    // segment (102) turns, lever (134) lifts the idler off the pulley, moves it and puts it back
    this.shiftFrom = this.shift > 0 ? this.shiftFrom : this.step;
    // The hand turns lever 6 at a steady speed (B2, estimate): SPEC.speedShift per click-stop
    // step, so 33 <-> 78 takes twice as long as one step. Mid-change, from where the lever is.
    const at = this._driveMemory?.segment ?? segTurn(this.step), steps = Math.abs(segTurn(key) - at) / Math.abs(segTurn('33') - segTurn('45'));
    this.speed = key; this.shiftTotal = Math.max(0.05, SPEC.speedShift * steps); this.shift = this.shiftTotal;
  }
  setPitch(p) { this.pitch = clamp(p, -SPEC.pitch, SPEC.pitch); }
  setSize(s) { if (SIZES.includes(s)) this.size = s; }
  setMode(m) {
    if ((m !== 'single' && m !== 'multi') || m === this.mode) return;
    // Retarget cue support height within the reconstructed available travel.
    // Saturation can change height: the estimated bearing contact has different
    // leverage in each mode; lower-linkage compensation remains unresolved.
    const height = supportedHeight(this.lift, this.mode, this.r);
    this.lift = height > 0 ? actuatorForHeight(height, m, this.r)
      : this.lift / pickupFraction(this.mode, this.r) * pickupFraction(m, this.r);
    this.mode = m;
  }
  setCue(up) { this.cueUp = !!up; }
  // Records on the changer spindle, by hand: one more on top of the stack (size: 7 | 10 | 12),
  // or the top one taken off. Not while the spindle's rod is moving (a drop under way).
  loadSpindle(size = this.size) {
    const ch = this.changer;
    if (!SIZES.includes(size) || ch.rod > 1e-6 || ch.falling.length) return false;
    ch.spindle.push({ id: ch.nextId++, size }); return true;
  }
  unloadSpindle() { const ch = this.changer; if (ch.rod > 1e-6 || !ch.spindle.length) return false; ch.spindle.pop(); return true; }
  // The records the changer dropped, lifted off the platter by hand (arm on its rest, cam at neutral).
  clearPile() { if (this.camOn || !this.atRest || this.changer.falling.length) return false; const n = this.changer.pile.length; this.changer.pile = []; return n > 0; }
  get stack() { return this.changer.spindle.length; }
  set stack(n) { this.changer.spindle = []; for (let i = 0; i < n; i++) this.loadSpindle(this.size); }
  // Height above the active shelf-record surface (recordSurface): the pile
  // the changer dropped, on the shelf record or on the mat.
  recordTopAt(r) { return pileTop(this.changer, this.platterRecord, r); }
  setTrackingForce(g) {
    const T = SPEC.trackingForce, v = clamp(g, 0, T.max);
    this.trackingForce = v <= T.split ? Math.round(v / T.fine) * T.fine : T.split + Math.round((v - T.split) / T.coarse) * T.coarse;
    this.trackingForce = Math.round(this.trackingForce * 100) / 100;
  }
  setAntiSkate(g) { this.antiSkate = Math.round(clamp(g, 0, 3) * 10) / 10; }
  setSkateScale(s) { if (s === 'red' || s === 'white') this.skateScale = s; }
  // A hand on the headshell (r = where it holds the stylus), and letting go of it.
  grab(r) {
    this.hand = { r };
    this.handDown = 0;
    if (this.onSurface) { this.onSurface = false; this.events.push({ type: 'raise' }); }
  }
  release() {
    const r = this.hand ? this.hand.r : this.r;
    // The last pointer/track animation can move the hand after advance() has
    // sampled it. Release at the actual endpoint, including on a slow frame.
    this.r = r;
    this.hand = null;
    if (r > R_PLATTER + 0.004) { this.r = REST; if (this.onSurface) { this.onSurface = false; this.events.push({ type: 'raise' }); } return 'rest'; } // off the platter: back on its rest
    { const surface = this.recordTopAt(r); if (supportedHeight(this.lift, this.mode, r, surface) > surface + 0.0001) return 'lift'; } // the lift is up: the arm lies on it
    this.handDown = 0.42; this._byHand = true; // the fingers set it down
    return 'lower';
  }

  // ---- derived -------------------------------------------------------------------------
  get switchArmYaw(){return prescribedSwitchArmYaw(this);}
  get mainsSwitchPose(){
    const yaw=this.switchArmYaw;
    if(!this._mainsPose||yaw!==this._mainsYaw||this.mainsGeometry!==this._mainsGeometry){
      this._mainsPose=switchFromArm(yaw,this._mainsPose,this.mainsGeometry);
      this._mainsYaw=yaw;this._mainsGeometry=this.mainsGeometry;
    }
    return this._mainsPose;
  }
  get power(){const p=this.mainsSwitchPose;return p.valid&&p.closed;} // finite129 contacts
  get drivePose() {
    this._driveMemory ??= {};
    return poseFromSnapshot({speed:this.speed,pitch:this.pitch,shiftFrom:this.shiftFrom,
      shift:this.shift>0?1-this.shift/this.shiftTotal:1,idlerIn:this.idlerIn,
      ...driveLimits(withdrawalFromSwitchArm(this.switchArmYaw)),driveCarrierYaw:this.carrierYaw,driveSwingRel:this.swingRel}, {}, this._driveMemory);
  }
  // Keep the legacy pose for its retained diagnostic/hidden parts. Actual
  // traction and the visible CAD adapter share this one finite-profile pose.
  get effectiveDrivePose() {
    return this.driveModel ? this.driveModel.pose({ speed: this.speed, pitch: this.pitch,
      shiftFrom: this.shiftFrom, shift: this.shift > 0 ? 1 - this.shift / this.shiftTotal : 1,
      idlerIn: this.idlerIn }) : this.drivePose;
  }
  get engaged() { return this.switchOn && this.effectiveDrivePose.engaged; } // actual dual contact
  get nominalRpm() { return SPEC.speeds[this.speed]; }
  get targetRpm() { return this.motorRpm * this.effectiveDrivePose.transmissionRatio; }
  get mute() { return muteContacts(this.camOn ? this.theta : 0).some(Boolean); } // actual cam/leaf contact closure
  get locked() { return this.camOn; }
  // The loaded spindle permits the change stroke (1229 manual p.14, Fig.24).
  // Keep that permission for the rest of the stroke after the last record drops;
  // the next cycle sees an empty spindle. This is a state interlock, not a model
  // of the unmeasured compliance in the spindle's locking mechanism.
  // The spindle lets its rod down only with record weight on its supports (its lock, judged with
  // the rod at neutral) and 212 drawn back in "multi". Kept for readers of the older name.
  get changerLoaded() { return this.mode === 'multi' && !this.changer.locked; }
  get setDownR() { return stopContact(this.size,this.sizeStopGeometry)?.radius ?? IN_R; }
  get sizeStopPose() { return sizeStopPose(this.size,this.slideOn,this.sizeStopGeometry); }
  get atRest() { return this.r >= REST - 0.0005; }
  get armHeld() { return this.hand ? 'hand' : this.camOn && this.theta > 0 && (this.autoSupportY !== null && this.lift > 0 || this.clutch) ? 'cam' : this.onSurface ? 'surface' : this.atRest ? 'rest' : 'lift'; }

  // ---- one step of time ------------------------------------------------------------------
  // io: { platterRate: platter turns per second (from the audio engine), grooveR: the radius the
  //       groove holds the stylus at while it is down (null when it is not), timeScale: 1, or
  //       0.1 when everything is slowed to a tenth to be looked at (the platter is then slowed
  //       too, so its rate already says so; the parts that run on their own clock use this) }
  advance(dt, io = {}) {
    const rate = io.platterRate || 0;
    const dtm = dt * (io.timeScale || 1); // mechanism time
    const groove = io.grooveR == null ? null : io.grooveR;
    // ---- platter, dog and cam ----
    const prevTurns = this.platterTurns;
    this.platterTurns += rate * dt;
    // Waiting for the dog: when it comes round it pushes the cam into mesh, and the cam turns for
    // the part of this step that is left (the cycle is timed from the mesh; the wait is kept apart).
    let meshTurns = rate * dt, waited = 0; // platter turns that drive the cam, and the share of the step spent waiting
    // ---- shut-off: rail253, lever162 and the dog, as contacts (trip-rail.js) ----
    // Solved before the cam: a capture partway through the step turns the cam for the rest of it.
    // Slow motion changes elapsed time, not the dog/cam relationship: only platter travel moves the dog.
    const capture = this._tripContacts(prevTurns, io);
    if (this.camOn && this.camWait) {
      if (capture !== null) { this.camWait = false; this.press248 = false; meshTurns = rate * dt * (1 - capture); waited = capture; }
      else { meshTurns = 0; waited = 1; }
    } else if (!this.camOn && capture !== null) {
      this.camOn = true; this.tripFlash = 0; meshTurns = rate * dt * (1 - capture);
      this.events.push({ type: 'trip', advance: Math.max(0, this._tripPushR - this.r), r: this.r, depth: this.tripState.depth }); this._begin('trip');
    }
    if (this.cycle) { this.cycle.wait += waited * dtm; this.cycle.seconds += (1 - waited) * dtm; if (rate > 0) this.cycle.platterTurns += meshTurns; }
    const th0 = this.theta;
    if (this.camOn && !this.camWait && meshTurns > 0) {
      const d = (360 * meshTurns) / RATIO; // the cam only goes forward: it is driven, not driving
      // A rigid collision/missing follower solution stalls the cam. Never hide
      // impossible component dimensions by retargeting184 to the arm or lifting206
      // through its guide. Small phase steps also catch an obstruction mid-tick.
      const branch=this.inSwing||this.follower==='start'?'start':'stop',goal=Math.min(360,this.theta+d);
      let reached=this.theta;this._autoMotionBlocked=false;
      const count=Math.max(1,Math.ceil((goal-this.theta)/2));
      for(let i=1;i<=count;i++){
        const candidate=this.theta+(goal-this.theta)*i/count,p=automaticPose(candidate,branch,this.camProfile),l=automaticLift(p,this.mode),cp=this._couplingPose(candidate,branch),c=this._couplingContact(cp,cueArmAngle(this.r));
        const chp=this.changerModel?.pose(candidate,{mode:this.mode,loaded:!this.changer.locked});
        if(!p.valid||!cp.valid||chp?.valid===false||(!this.liftModel&&l.blocked)||c.blocked){this._autoMotionBlocked=true;break;}
        reached=candidate;
      }
      this.camTurnsTotal+=(reached-this.theta)/360;this.theta=reached;
    }
    const th = Math.min(this.theta, 360);
    const crossed = (a) => th0 < a && th >= a;
    // Plain manual p.11: rotation after Start brings 207 against 195. The
    // encounter angle is unmeasured. Use the first positive travel after dog
    // pickup as an explicit approximation. A blocked/idle cam cannot select.
    if (this.cycle?.kind === 'start' && th0 === 0 && th > th0) this.follower = 'start';
    // ---- changer: AK lets 173 swing as far as bolt 177 and the spindle's rod may go down -----
    // (changer-contact.js). The cam's travel this step is taken in steps of at most 1 deg, so a
    // fast step cannot skip the order supports/retainers work in. 173 turning 207 is a contact.
    {
      const ch = this.changer, blocked = this.mode !== 'multi'; // 212 in the bolt's neck in "single"
      const from = this.camOn ? Math.min(th0, 360) : 0, to = this.camOn ? th : 0;
      const n = Math.max(1, Math.ceil(Math.abs(to - from)));
      const had = ch.falling.length + ch.pile.length;
      for (let i = 1; i <= n; i++) {
        const { flip } = stepStroke(ch, from + (to - from) * i / n, { blocked, model:this.changerModel });
        // Manual Stop leaves 207 in Stop even when there are records on the spindle (p.12).
        if (flip && this.cycle?.kind !== 'stop') this.follower = 'start'; // 173 interface is a stroke threshold.
      }
      if (ch.falling.length + ch.pile.length > had) { this.dropped = true; this.events.push({ type: 'drop', left: ch.spindle.length }); }
      stepFalling(ch, dtm, this.platterRecord);
    }
    if (this.camOn) {
      if (crossed(CAM.inSwing[0])) this.inSwing = this.follower === 'start';
      if (crossed(CAM.followerReset)) this.follower = 'stop';
      if (crossed(CAM.startClear) && this.lever !== 'mid') this.lever = 'mid';
      this.slideOn = th >= CAM.slide[0] && th < CAM.slide[1];
      if (this.theta >= 360) this._neutral();
    }

    // ---- arm: hand, cam, groove ----
    const r0 = this.r;
    const camTurning = this.camOn && this.theta > 0;
    // The installed coupling supplies184 pose from its fixed reconstructed guide.
    // Actual cap/face contact transmits motion to201. Stopped arms slide; absent
    // contact cannot carry. The installed lower support solve below uses that
    // same rigid184 transform; procedural fallback retains its own profile.
    const branch=this.inSwing?'start':'stop',pose=automaticPose(camTurning?th:0,branch,this.camProfile);
    const couplingPose=this._couplingPose(camTurning?th:0,branch);
    let prior=this._couplingPose(camTurning?th0:0,branch),carried=this.r,engaged=false,blocked=false;
    const steps=Math.max(1,Math.ceil(Math.abs(couplingPose.beta-prior.beta)/.002));
    for(let i=1;i<=steps;i++){
      const next=this._couplingPose(camTurning?th0+(th-th0)*i/steps:0,branch),c=this._couplingContact(next,cueArmAngle(carried));
      blocked ||= c.blocked;
      if(c.engaged){engaged=true;carried=this._couplingCarry(carried,prior,next);}
      prior=next;
    }
    this.autoPose=pose;this.couplingPose=couplingPose;this.autoContact=this._couplingContact(couplingPose,cueArmAngle(this.r));this.autoBlocked=blocked||!pose.valid||!couplingPose.valid||!!this._autoMotionBlocked;
    this.clutch=camTurning&&this.autoContact.engaged;
    this.leverR=carried; // diagnostic equivalent reach, never a cam/mesh input
    if(this.hand)this.r=this.hand.r;
    else if(groove!==null&&this.onSurface)this.r=groove;
    else if(engaged){
      const stop=this.sizeStopPose,inner=stop.engaged?stop.contact.radius:IN_R;
      this.r=clamp(carried,inner,REST);
    }
    this.slip=this.clutch&&(Math.abs(carried-this.r)>1e-7||!!this.hand);

    //206 follows the higher real support:184 finger or manual cue. Silicone
    // damps downward motion after support retreats. Lift1 means manual full-up;
    // it is not an invented hard stop for automatic travel.
    const support=automaticLift(pose,this.mode);
    this.autoSupportY=camTurning?support.supportY:null;
    this.autoBlocked ||= !this.liftModel&&camTurning&&support.blocked;
    this.autoContact=this._couplingContact(couplingPose,cueArmAngle(this.r));
    this.autoOvertravel=!this.liftModel&&camTurning&&support.overtravel;
    // Manual (cue-chain.js): the hand moves handle64; cam220 drives270 by contact; 270's hook,
    // through184's slot, lifts243 off184 and243 lifts206. 184 keeps the cam's pose. The cam lifts
    //206 rigidly; the hook's lift reaches206 through the oil (MAARC: slow smooth ascent).
    this.cueHandle=handleStep(this.cueHandle,this.cueUp,dtm);
    // The CAD lift (liftModel) is posed from the handle's angle. Given the handle itself, the arm
    // came down with it in a quarter of a second; the lift bolt is in silicone oil and settles
    // after the handle has gone (settleStep: 2.5 s to the record, the owner's timing 2026-11-19).
    this.cueSettle=settleStep(this.cueSettle,this.cueHandle,dtm);
    // The same oil slows the set-down at the end of a start cycle: the main lever lets the lift go
    // over a second of cam, and the lift follows it down at its own rate (tiltSettleStep).
    this.liftTilt=tiltSettleStep(this.liftTilt,couplingPose.tilt||0,dtm);
    const settledPose=this.liftTilt>(couplingPose.tilt||0)?{...couplingPose,tilt:this.liftTilt}:couplingPose;
    // plain1229 p.10: the rearward tap releases the handle and "dadurch wird der Verbindungshebel
    // (270) frei", so once released 270 no longer pushes, while 64 swings back under221.
    const hook=this.cueUp?hookRaise(pose,this.cueHandle):0;
    const camCmd=camTurning?support.actuator:0,cueCmd=hook>0?liftWithRaise(pose,this.mode,hook):0,cmd=Math.max(camCmd,cueCmd);
    if(cmd>this.lift)this.lift=camCmd>=this.lift?Math.max(camCmd,riseToward(this.lift,cueCmd,dtm)):riseToward(this.lift,cmd,dtm);
    else this.lift=lowerActuator(this.lift,cmd,dtm,this.mode,fullHandLift(this.mode));
    //243 rises only as far as206 has followed; the rest of the hook's travel is270 flexing.
    const raised=raiseAtLift(pose,this.mode,this.lift,hook);
    this.cueHook={raise:raised,hookRaise:hook,flex:hook-raised,top:hookTopY(this.cueHandle)};
    // One surface under the stylus for the cue and the arm alike (A-10): the changer's pileTop,
    // i.e. the mat with no record, the record, or the pile. The cap can hold the stylus above it;
    // nothing holds it above the mat once the cap is below.
    const top = this.atRest ? 0 : this.recordTopAt(this.r);
    let supported = supportedHeight(this.lift, this.mode, this.r, top);
    if(this.liftModel){
      this.cadLift=this.liftModel.solveState({couplingPose:settledPose,armAngle:cueArmAngle(this.r),mode:this.mode,cueHandle:this.cueSettle,
        recordHeight:this.recordSurface+top,handHeight:this.hand?this.recordSurface+top+LIFT*1.1:null});
      if(this.cadLift.valid){supported=this.cadLift.stylusHeight-this.recordSurface;this.autoSupportY=this.cadLift.footHeight;}
      else{this.autoBlocked=true;this._autoMotionBlocked=true;}
    }

    // ---- where the stylus is in height ----
    const wasOn = this.onSurface;
    if (this.hand) { this.onSurface = false; this.h = top + LIFT * 1.1; }
    else if (this.handDown > 0) { this.handDown = Math.max(0, this.handDown - dtm); this.h = Math.max(supported, top + LIFT * (this.handDown / 0.42)); }
    // on its rest the arm lies in the cradle in both modes: "multi" raises the arm base 5 mm (drawn by the tonearm),
    // which tips the arm onto the fixed rest rather than lifting the stylus off it
    else if (this.atRest) this.h = this.liftModel ? supported : Math.max(supported, REST_H);
    // the stylus meets the top record of the pile (changer). Arm chain (arm-forces.js): the arm only
    // follows its support down if the tracking force beats the vertical bearing friction (manual
    // p.2); a balanced arm at 0 p floats where it was left.
    else this.h = armForces({trackingForce:this.trackingForce}).sinks ? Math.max(supported, top) : Math.max(supported, top, this.h);
    if(this.liftModel&&this.cadLift?.valid&&this.h>supported+1e-8){
      this.cadLift=this.liftModel.solveState({couplingPose:settledPose,armAngle:cueArmAngle(this.r),mode:this.mode,cueHandle:this.cueSettle,
        recordHeight:this.recordSurface+top,handHeight:this.recordSurface+this.h});
    }
    const overPlatter = !this.atRest && this.r < R_PLATTER + 0.004;
    this.onSurface = !this.hand && overPlatter && this.h <= top + 1e-6;
    if (this.onSurface && !wasOn) this.events.push({ type: 'land', r: this.r, byHand: !!this._byHand, pile: this.atRest ? 0 : this.changer.pile.filter((rec) => RECORD_R[rec.size] > this.r).length });
    if (!this.onSurface && wasOn) this.events.push({ type: 'raise' });
    if (this.handDown <= 0) this._byHand = false;
    // Arm chain (arm-forces.js): a free arm (no hand, groove, cam carry or rest) turns under the
    // anti-skating moment against the bearing's friction (manual p.8-9), and on the cue against
    // cap 198's friction. Balanced at 0 p with anti-skating 0.5 it glides outward (p.9).
    if (!this.hand && this.handDown <= 0 && !engaged && !this.onSurface && !this.atRest) {
      const f = armForces({ trackingForce: this.trackingForce, antiSkate: this.antiSkate, skateScale: this.skateScale, r: this.r });
      const step = freeYawStep(this.r, this.yawRate, dtm, f, supported > top + 1e-6 && f.sinks); // on the cue: cap198 above the surface
      this.yawRate = step.rate; this.r = clamp(step.r, 0.02, REST);
      if (this.r >= REST) this.yawRate = 0;
    } else this.yawRate = 0;

    // ---- pawl: the arm swung in holds the switch on; back on the rest it lets go ----
    if (!this.pawl && this.r < SPEC.latchR) {
      this.pawl = true;
      if (!this.switchOn && !this.camOn) { this.switchOn = true; this.follower = 'stop'; this.events.push({ type: 'manual' }); } // manual start
    } else if (this.pawl && this.r > SPEC.unlatchR) {
      this.pawl = false;
      if (!this.camOn) this.switchOn = false; // torsion spring (187) returns the switch arm: off
    }

    this.tripFlash += dtm;
    this._tripArmR = this.r;

    // ---- drive: motor, idler, speed change ----
    if (this.shift > 0) { this.shift = Math.max(0, this.shift - dtm); if (this.shift === 0) this.step = this.speed; }
    const motorGoal = this.power ? SPEC.motorRpm : 0;
    this.motorRpm += (motorGoal - this.motorRpm) * Math.min(1, dtm / (motorGoal ? 0.15 : 1.2));
    this.motorTurns += (this.motorRpm / 60) * dtm;
    this.idlerIn += ((this.switchOn ? 1 : 0) - this.idlerIn) * Math.min(1, dtm / 0.12);
    // pressed against the rim the idler rolls with the platter; let go, it spins down
    const legacyDrive=this.drivePose;
    { const w=withdrawalFromSwitchArm(this.switchArmYaw); // 134 pulled in by its spring, for the next step
      const next=stepIdler({yaw:this.carrierYaw,rel:this.swingRel},legacyDrive,dtm,{selectorAngle:legacyDrive.segmentTurn,segmentLift:legacyDrive.segmentLift,withdrawalLimit:w.yaw,relLimit:w.rel});
      this.carrierYaw=next.yaw; this.swingRel=next.rel; }
    const drive=this.effectiveDrivePose;
    this.idlerRate = drive.rimContact ? rate*drive.rimRadius/drive.idlerRadius
      : drive.pulleyContact ? this.motorRpm/60*drive.pulleyRadius/drive.tyreContactRadius
      : this.idlerRate*Math.exp(-dtm/.8);
    this.idlerTurns += this.idlerRate * dt;
    if (this.leverT > 0) { this.leverT -= dtm; if (this.leverT <= 0 && !this.camOn) this.lever = 'mid'; }
  }

  // Time the page could not follow (core.js): put the stylus where the groove now holds it and
  // forget what the shut-off lever had gathered, so the jump is not taken for a run-out.
  resync(grooveR = null) {
    if (grooveR !== null && this.onSurface && !this.hand) this.r = grooveR;
    this._seatTrip(this.r);
  }

  // Seat rail253 and lever162 as though the arm had arrived at r groove by groove: the nose on the dog's
  // swept circle, the rail slipped just far enough for its tab to bear on the tail. Used for a position set
  // from outside (a test, a restored page, a tick the page could not follow): such a jump is not arm travel
  // the rail could have followed, and must not be taken for a run-out.
  _seatTrip(r) {
    const st = this.tripState, fresh = initialTripState();
    st.g = fresh.g; st.d = D_CAL; st.pushing = false; st.blocked = false; st.lastLimit = null; st.captured = false;
    const slack = tabSlack(st, cueArmAngle(r));
    if (slack < 0) st.d -= slack;
    this._tripArmR = r; this._tripPushR = r; this.trip = 0;
  }

  // The dog turns with the platter; the arm moves the rail. Sub-stepped so the dog's surface is sampled at
  // least every 3 degrees of platter travel and the arm every 0.1 mm. Returns the fraction of this step at
  // which the dog carried162, or null.
  _tripContacts(prevTurns, io) {
    const st = this.tripState;
    if (Math.abs(this.r - this._tripArmR) > 1e-9) this._seatTrip(this.r); // moved from outside, not by advance()
    const camFree = !(this.camOn && !this.camWait); // cam at neutral, out of mesh: 162 at the gap
    if (!camFree) { // 162 rides away on the cam. Boundary B-T7 (cycle-phases.md): with the arm on its
      // rest during a cycle, rail and lever are re-seated (manual p.11 adjustment); the contact that does it is unresolved.
      if (this.theta > 0 && this.atRest) { const g = initialTripState().g; st.g = g; st.d = D_CAL; st.lastLimit = null; st.pushing = false; st.blocked = false; }
      return null;
    }
    const rTo = this.hand ? this.hand.r : io.grooveR != null && this.onSurface ? io.grooveR : this.r;
    const r0 = this._tripArmR, dTurns = this.platterTurns - prevTurns;
    const n = Math.min(4000, Math.max(1, Math.ceil(Math.abs(dTurns) * 120), Math.ceil(Math.abs(rTo - r0) / 0.0001)));
    // Seat the contacts at the step's starting phase first (after a press begins or a re-seat), so a lever
    // pressed by248 while the dog stands at it reaches its stop before the dog moves.
    if (st.lastLimit === null) stepTrip(st, { armA: cueArmAngle(r0), th: 0, ph: prevTurns * 2 * Math.PI, press: this.press248, camFree: true });
    for (let i = 1; i <= n; i++) {
      const k = i / n, r = r0 + (rTo - r0) * k, ph = (prevTurns + dTurns * k) * 2 * Math.PI;
      const was = st.pushing;
      const hit = stepTrip(st, { armA: cueArmAngle(r), th: 0, ph, press: this.press248, camFree: true });
      this.trip = Math.max(0, st.depth);
      if (hit) { st.captured = false; st.pushing = false; return k; } // _tripPushR: where the dog last pushed it back
      if (st.pushing && !was) this._tripPushR = r;
    }
    return null;
  }

  // The main cam back in its toothless gap.
  _neutral() {
    this.theta = 0; this.camOn = false; this.camWait = false; this.press248 = false; this.inSwing = false; this.slideOn = false; this.dropped = false;
    this.lever = 'mid';
    // the switch arm drops into the cut-out in the cam unless the pawl holds it
    if (!this.pawl) this.switchOn = false;
    if (this.cycle) { this.cycles.push(this.cycle); this.events.push({ type: 'cycle', end: true, kind: this.cycle.kind, seconds: this.cycle.seconds }); }
    this.cycle = null;
  }
  _begin(kind) { this.cycle = { kind, seconds: 0, platterTurns: 0, wait: 0 }; this.events.push({ type: 'cycle', end: false, kind }); }

  // Everything the drawing needs, in one place.
  snapshot() {
    return {
      theta: this.theta, camOn: this.camOn, camWait: this.camWait, camTurning: this.camOn && this.theta > 0, lift: this.lift, swing: camSwing(Math.min(this.theta, 360)) * (this.camOn ? 1 : 0),
      rocker: this.camOn ? camRocker(this.theta) : 0, follower: this.follower, slideOn: this.slideOn, inSwing: this.inSwing,
      changerLoaded: this.changerLoaded,
      changer: (() => { const ch = this.changer, hs = spindleHeights(ch); return {
        spindle: ch.spindle.map((r, i) => ({ ...r, y: hs[i] })), on: ch.on, locked: ch.locked, rod: ch.rod,
        rockerAngle: ch.rocker.angle, akGap: ch.rocker.gap, akContact: ch.rocker.akContact, blocked: this.mode !== 'multi',
        falling: ch.falling.map((f) => ({ ...f.rec, y: f.y })), pile: ch.pile.map((r, i) => ({ ...r, i })), platterRecord: this.platterRecord,
        supportTop: this.recordSurface + this.changer.supportHeight,
        pose: this.changerModel ? ch.pose : null,
        inserted: this.mode === 'multi' || ch.spindle.length > 0, // the AW 3 in place of the single-play spindle
      }; })(),
      switchArmYaw:this.switchArmYaw, mainsSwitchPose:this.mainsSwitchPose, power:this.power,
      switchOn: this.switchOn, pawl: this.pawl, lever: this.lever, mute: this.mute, trip: this.trip, tripFlash: this.tripFlash,
      tripG: this.tripState.g, tripD: this.tripState.d, press248: this.press248,
      platterTurns: this.platterTurns, motorTurns: this.motorTurns, motorRpm: this.motorRpm, idlerTurns: this.idlerTurns, idlerIn: this.idlerIn,
      step: this.step, speed: this.speed, shift: this.shift > 0 ? 1 - this.shift / this.shiftTotal : 1, shiftFrom: this.shiftFrom,
      drivePose: this.drivePose,
      recordSurface: this.recordSurface,
      cadDrivePose: this.driveModel ? this.effectiveDrivePose : null,
      cadLift: this.liftModel ? this.cadLift : null,
      cadArmPose: this.liftModel ? this.cadLift?.armPose : null,
      driveSource: this.driveModel ? 'cad-drive' : 'runtime',
      pitch: this.pitch, size: this.size, mode: this.mode, cueUp: this.cueUp, cueHandle: this.cueHandle, cueHook: this.cueHook, trackingForce: this.trackingForce, antiSkate: this.antiSkate, skateScale: this.skateScale,
      r: this.r, h: this.h, held: this.armHeld, yawRate: this.yawRate,
      armForces: armForces({ trackingForce: this.trackingForce, antiSkate: this.antiSkate, skateScale: this.skateScale, r: this.r, inGroove: this.onSurface }), setDownR: this.setDownR, sizeStopEngaged:this.sizeStopPose.engaged,
      leverR: this.leverR, clutch: this.clutch, slip: this.slip,
      autoPose: this.autoPose, couplingPose: this.couplingPose, couplingSource: this.couplingModel ? 'cad' : 'runtime', autoSupportY: this.autoSupportY, autoContact: this.autoContact, autoBlocked: this.autoBlocked, autoOvertravel: this.autoOvertravel,
    };
  }
}

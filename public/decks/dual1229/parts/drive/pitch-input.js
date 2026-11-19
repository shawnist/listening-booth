// Plain1229 p6 Fig9: knob8 translates102 axially; it does not add selector yaw.
// The exact8/95/96/101 transmission/contact geometry is not established. Expose
// it as an input boundary rather than inventing a worm ratio or mating ramp.
// Knob sweep matches the existing outside control (106deg each side). ±1.4mm
// axial stroke is an estimated component calibration, not a factory dimension.
export const PITCH_INPUT=Object.freeze({halfAngle:106*Math.PI/180,halfStroke:.0014});
export const pitchAngleFromControl=p=>(p/.03)*PITCH_INPUT.halfAngle;
export const segmentLiftFromPitch=(angle,g=PITCH_INPUT)=>-angle/g.halfAngle*g.halfStroke;

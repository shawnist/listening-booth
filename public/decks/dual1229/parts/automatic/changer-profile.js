// Independent material coordinates for the underside of changer cam AK, on main cam 165.
// Plain1229 pp.13-14 establishes downward bolt travel; Fig.24 establishes the
// fixed rocker pivot. These dimensions and the relief phase/shape are ESTIMATES.
// 2026-11-15 (changer chain, contracts/changer--cycle.md): the relief is the earlier
// fitted shape made 3.8x deeper (peak 0.70 -> 2.66 mm above neutral, same 94-150 deg
// window). With 173's lever ratio from Fig.22 (0.70) the old 0.70 mm relief let bolt 177
// down under 0.5 mm, too little for the spindle to let a record go. The depth is an
// estimate sized to the spindle's (estimated) release stroke; it awaits the cycle owner's OK.
// No mechanism state, desired stroke or rocker function generates this surface.
// Changing it changes the contact-solved rocker motion.
// [cam angle in degrees, absolute underside height in metres].
export const AK_PROFILE = Object.freeze([
  Object.freeze([0, -0.0214]),
  Object.freeze([94, -0.0214]),
  Object.freeze([96, -0.021248143762]),
  Object.freeze([98, -0.020946410967]),
  Object.freeze([100, -0.020650591398]),
  Object.freeze([102, -0.020364541519]),
  Object.freeze([104, -0.020091990421]),
  Object.freeze([106, -0.019836491227]),
  Object.freeze([108, -0.019601374766]),
  Object.freeze([110, -0.019389706132]),
  Object.freeze([112, -0.019204244754]),
  Object.freeze([114, -0.019047408402]),
  Object.freeze([116, -0.018921241684]),
  Object.freeze([118, -0.018827389368]),
  Object.freeze([120, -0.018767074966]),
  Object.freeze([122, -0.018741084767]),
  Object.freeze([124, -0.018749757594]),
  Object.freeze([126, -0.018792980387]),
  Object.freeze([128, -0.018870189668]),
  Object.freeze([130, -0.018980378891]),
  Object.freeze([132, -0.01912211158]),
  Object.freeze([134, -0.019293540026]),
  Object.freeze([136, -0.019492429401]),
  Object.freeze([138, -0.019716186872]),
  Object.freeze([140, -0.019961895426]),
  Object.freeze([142, -0.02022635187]),
  Object.freeze([144, -0.020506108615]),
  Object.freeze([146, -0.020797518599]),
  Object.freeze([148, -0.021096782849]),
  Object.freeze([150, -0.0214]),
  Object.freeze([360, -0.0214]),
]);
export function akHeight(degrees, profile = AK_PROFILE) {
  const a = ((degrees % 360) + 360) % 360;
  for (let i = 1; i < profile.length; i++) if (a <= profile[i][0]) {
    const [a0,y0] = profile[i-1], [a1,y1] = profile[i];
    return y0 + (y1-y0)*(a-a0)/(a1-a0);
  }
  throw new RangeError('AK profile must cover a complete revolution');
}

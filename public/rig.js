// The rig: generic gear, described by what it physically does.
export const DECKS = {
  dd: { motorTau: 0.05, motorAcc: 1.45, motorDec: 2.2, slipTau: 0.12, grip: 0.01, flutter: 0.0002, rumble: 1, armL: 0.23, null1: 0.0603, null2: 0.1174 },
  belt: { motorTau: 0.9, motorAcc: 5, motorDec: 5, slipTau: 0.03, grip: 0.6, flutter: 0.0008, rumble: 2.5, armL: 0.229, null1: 0.066, null2: 0.1209 },
};
export const CARTS = {
  'mm-con': { tipRadius: 18e-6, tipF: 17000, tipQ: 1.8, L: 0.6, crosstalk: 0.07, scanLen: 3e-6 },
  'mm-ell': { tipRadius: 7.6e-6, tipF: 20000, tipQ: 1.4, L: 0.5, crosstalk: 0.05, scanLen: 2e-6 },
  'mc-line': { tipRadius: 5e-6, tipF: 30000, tipQ: 1.2, L: 0, crosstalk: 0.03, scanLen: 1.2e-6 },
};

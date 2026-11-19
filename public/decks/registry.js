// The turntables Groove Deck can be. Each entry says what it is called and, for a table with
// its own machinery, how to build its 3D model (in the deck view), its controller (the
// mechanism, in the page) and its Workbench controls. The original deck has none of these:
// it is drawn by deck3d/ and driven by app.js as before.
//
// To add a table: give it a key here, a createModel({ M, maxAniso }) returning the same hooks
// as decks/dual1229/model.js, a createController({ state, send, pushParams, audio, hint })
// with tick(), armPose(), hand(), release() and the rest of dual1229/controller.js's surface,
// and a createPanel(). The engine params it wants are the controller's core.drive.
import { createDualModel } from './dual1229/model.js';
import { createDualController } from './dual1229/controller.js';
import { createDualPanel } from './dual1229/panel.js';

export const TABLES = {
  gd: { label: 'Groove Deck direct drive', about: 'The original deck: direct drive (or belt, from the rig), slipmat, start button, 33 and 45, ±8 % pitch.' },
  dual1229: {
    label: 'UA 1176', about: 'Idler-drive automatic changer, 1972-75: 33, 45 and 78, ±3 % pitch, automatic start, return and shut-off.',
    createModel: createDualModel, createController: createDualController, createPanel: createDualPanel,
  },
};
export const DEFAULT_TABLE = 'gd';
const STORE = 'gd.table';
export function storedTable() {
  try { const k = localStorage.getItem(STORE); return TABLES[k] ? k : DEFAULT_TABLE; } catch { return DEFAULT_TABLE; }
}
export function storeTable(k) { try { localStorage.setItem(STORE, k); } catch { /* not remembered */ } }

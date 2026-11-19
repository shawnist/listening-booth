// Audio-thread wrapper around the deck engine.
import { DeckEngine } from './engine.js';
import { createSpeedMod } from './decks/speed-mod.js';

class DeckProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new DeckEngine();
    this.mod = createSpeedMod(); // a table's own wow parts and muting switch, when it asks for them
    this.frames = 0;
    this.wearFrames = 0;
    this.wantGroove = true;
    this.port.onmessage = (ev) => {
      const m = ev.data, e = this.engine;
      switch (m.type) {
        case 'set': e.set(m.params); break;
        case 'load': e.load(m.side); this.wearFrames = 0; this.port.postMessage({ type: 'loaded' }); break;
        case 'unload': {
          // Last of the play wear first, then the borrowed audio goes back to the page.
          this.reportWear();
          const side = e.unload();
          const pcm = side && side.src ? side.src.map((t) => t.pcm) : [];
          this.port.postMessage({ type: 'unloaded', pcm }, [...new Set(pcm.map((a) => a.buffer))]);
          break;
        }
        case 'drop':
          e.drop(m.radius, !!m.byHand);
          if (e.lastTick) this.port.postMessage({ type: 'tick', p: e.lastTick.p, a: e.lastTick.a, count: e.ticks });
          break;
        case 'dust': e.dust = m.dust; break;
        case 'lift': e.lift(); break;
        case 'rest': e.rest(); break;
        case 'arm': e.needleDown = false; e.armRadius = m.radius; break;
        case 'touchStart': e.touchStart(); break;
        case 'touchMove': e.touchMove(m.revs); break;
        case 'touchEnd': e.touchEnd(); break;
      }
    };
  }

  // Tell the page which revolutions have been played since the last report.
  reportWear() {
    const w = this.engine.takeWear();
    if (w) { w.type = 'wear'; this.port.postMessage(w); }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    this.mod.before(this.engine, n);
    this.engine.process(out[0], out[1] || out[0], n);
    this.mod.after(this.engine, out[0], out[1] || out[0], n);
    this.frames += n;
    this.wearFrames += n;
    if (this.wearFrames >= 96000) { this.wearFrames = 0; this.reportWear(); } // every two seconds
    if (this.frames >= 1600) { // about 30 status updates a second
      this.frames = 0;
      const st = this.engine.status();
      st.type = 'status';
      const g = this.engine.grooveWindow(512);
      if (g) { st.gl = g.l; st.gr = g.r; }
      this.port.postMessage(st);
    }
    return true;
  }
}

registerProcessor('deck', DeckProcessor);

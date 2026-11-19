// The card for what is on the platter: the record, the side now playing with its tracks,
// flipping it over, and plain words about a record that is on its way from the shelf.
// It folds to a single line when it is in the way.
import { FS } from './dsp.js';
import { artSrc } from './library.js';

export function createPlatterCard({ state, shelf, ui }) {
  const { el, mmss } = ui;
  const card = document.querySelector('#platter');
  let nowAt = -1, rows = [];

  const thumb = (url) => {
    const box = el('span', { className: 'thumb' }), src = artSrc(url);
    if (src) { const img = el('img', { src, alt: '' }); img.addEventListener('error', () => img.remove()); box.append(img); }
    return box;
  };
  const button = (text, cls, go, id) => { const b = el('button', { type: 'button', className: cls, textContent: text }); if (id) b.id = id; b.addEventListener('click', go); return b; };

  // The record on its way, the record that did not make it, the record playing: whichever
  // the card should be headed with, most pressing first.
  function subject() {
    const w = shelf.work, f = shelf.failed, on = state.platter;
    if (w && shelf.find(w.id)) return { rec: shelf.find(w.id), line: w.text, mood: 'coming' };
    if (state.side && on) return { rec: on.record, line: on.record.artist, mood: 'playing', side: state.side.sideName };
    if (state.side) return { title: state.side.title, line: 'A test cut, not kept on the shelf', mood: 'playing', side: state.side.sideName };
    if (f && shelf.find(f.id)) return { rec: shelf.find(f.id), line: 'Could not be fetched', mood: 'failed' };
    return { title: 'Nothing on the platter', line: shelf.records.length ? 'Drag a record up from the shelf' : 'Press a record to play it', mood: 'empty' };
  }

  function render() {
    const s = subject(), w = shelf.work, f = shelf.failed, side = state.side, on = state.platter;
    const open = state.platterOpen;
    card.className = `platter ${open ? 'open' : 'folded'} is-${s.mood}`;

    // ---- the head: always showing, and the handle that folds the card ----
    const fold = el('button', { type: 'button', className: 'head', title: open ? 'Fold this card away' : 'Show the record on the platter' }, [
      thumb(s.rec ? s.rec.artUrl : ''),
      el('span', { className: 'words' }, [el('b', { textContent: s.rec ? s.rec.title : s.title }), el('small', { id: 'platterLine', textContent: s.line })]),
      s.side ? el('span', { className: 'chip', textContent: `Side ${s.side}` }) : '',
      el('span', { className: 'chev', ariaHidden: 'true' }),
    ]);
    fold.setAttribute('aria-expanded', String(open));
    fold.addEventListener('click', () => { state.platterOpen = !state.platterOpen; ui.layout(); render(); card.querySelector('.head').focus(); });
    const kids = [fold, el('i', { className: 'run', hidden: !w }, [el('u', { id: 'platterRun' })])];

    const body = el('div', { className: 'body' });
    // ---- a record on its way ----
    if (w) {
      const stopIt = button('Cancel', 'quiet', () => shelf.letGo());
      body.append(el('div', { className: 'coming' }, [
        el('p', { id: 'platterNote', className: 'retry', textContent: w.note, hidden: !w.note }),
        el('p', { className: 'note', textContent: side ? 'What is on the platter keeps playing until the new side is cut.' : 'Fetching from YouTube Music takes 8 to 60 seconds a record. The deck works meanwhile.' }),
        stopIt,
      ]));
    }
    // ---- a record that did not arrive ----
    if (f && !w && shelf.find(f.id)) {
      const rec = shelf.find(f.id);
      body.append(el('div', { className: 'failed', role: 'alert' }, [
        el('p', {}, [el('b', { textContent: s.mood === 'failed' ? 'It did not reach the platter.' : `“${rec.title}” did not reach the platter.` }), ` ${f.text}`]),
        el('span', { className: 'acts' }, [button('Try again', 'primary', () => shelf.retry(), 'retry'), button('Dismiss', 'quiet', () => shelf.forget())]),
      ]));
    }
    // ---- the side on the platter ----
    rows = []; nowAt = -1;
    if (side) {
      const rec = on ? on.record : null, at = on ? on.sideIndex : 0;
      const list = el('ol', { id: 'tracks', className: 'tracks' });
      side.tracks.forEach((t, i) => {
        const b = el('button', { type: 'button', title: 'Lower the needle at the start of this track' }, [
          el('span', { className: 'num', textContent: `${side.sideName}${i + 1}` }),
          el('b', { textContent: t.title }),
          el('span', { className: 'len', textContent: mmss((t.end - t.start) / FS) }),
        ]);
        b.addEventListener('click', () => ui.playTrack(i));
        const li = el('li', {}, [b]);
        rows.push(li); list.append(li);
      });
      body.append(el('div', { className: 'sidehead' }, [
        el('span', { textContent: `Side ${side.sideName}` }),
        el('small', { textContent: `${side.tracks.length} ${side.tracks.length === 1 ? 'track' : 'tracks'}, ${mmss(side.tracks.reduce((sum, t) => sum + (t.end - t.start) / FS, 0))}` }),
      ]), list);
      if (rec && rec.sides.length > 1) {
        const next = (at + 1) % rec.sides.length, busy = !!w;
        const flip = button(`Flip to side ${rec.sides[next].name}`, 'primary', () => shelf.pull(rec, next), 'flip');
        flip.disabled = busy;
        const foot = el('div', { className: 'foot' }, [flip]);
        if (rec.sides.length > 2) { // a double album: any side, not only the next
          const pick = el('div', { className: 'seg sides', role: 'group', ariaLabel: 'Sides of this record' });
          rec.sides.forEach((sd, i) => {
            const b = button(sd.name, i === at ? 'on' : '', () => { if (i !== at) shelf.pull(rec, i); });
            b.title = i === at ? `Side ${sd.name} is on the platter` : `Put side ${sd.name} on the platter`; b.disabled = busy;
            pick.append(b);
          });
          foot.append(pick);
        }
        body.append(foot);
      }
    } else if (!w && !(f && shelf.find(f.id))) {
      // ---- nothing here, nothing coming: what to do next ----
      body.append(el('p', { className: 'next', textContent: shelf.records.length
        ? 'Drag a record up from the shelf and let go over the deck. Or click a sleeve, then Play.'
        : 'Search for a song or an album, then choose Press and play. It is kept on your shelf from then on.' }));
    }
    kids.push(body);
    card.replaceChildren(...kids);
    progress(); follow();
  }

  // Only the figures move while a record is being fetched and cut.
  function progress() {
    const w = shelf.work, run = card.querySelector('#platterRun'), line = card.querySelector('#platterLine'), note = card.querySelector('#platterNote');
    if (!w || !run) return;
    run.style.width = `${Math.round(w.progress * 100)}%`;
    if (line) line.textContent = w.text;
    if (note) { note.textContent = w.note; note.hidden = !w.note; }
  }

  // Mark the track under the needle, or the one about to start when the needle is in the
  // gap before it. Called every frame; does nothing unless it has changed.
  function follow() {
    const side = state.side, st = state.st;
    const at = side && st.down ? side.tracks.findIndex((t) => st.p < t.end) : -1;
    if (at === nowAt) return;
    if (rows[nowAt]) rows[nowAt].classList.remove('now');
    if (rows[at]) rows[at].classList.add('now');
    nowAt = at;
  }

  return {
    changed(what) { if (what === 'work') progress(); else if (what !== 'facts') render(); },
    follow,
  };
}

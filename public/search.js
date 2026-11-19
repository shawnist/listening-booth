// Search: one field in the top bar, and a panel under it that shows albums and songs
// together. Each result can be pressed and played, or just pressed onto the shelf.
import { formatChoices } from './library.js';

const ALBUM_ID = /(MPREb_[A-Za-z0-9_-]{6,60}|OLAK5uy_[A-Za-z0-9_-]{6,60})/;
const SONG_LINK = /(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;
// A bare song id: eleven characters with a digit, a dash, an underscore or a capital inside.
const looksLikeId = (q) => /^[A-Za-z0-9_-]{11}$/.test(q) && /[0-9_-]|.[A-Z]/.test(q);
const unreachable = (e) => /Failed to fetch|NetworkError|Load failed/.test(String(e.message || e));

export function createSearch({ state, shelf, ui }) {
  const { el, mmss } = ui;
  const $ = (s) => document.querySelector(s);
  const input = $('#q'), form = $('#searchForm'), panel = $('#found');
  // For each kind: null (not asked for), or { state: 'wait' | 'ok' | 'err', items, source, text }.
  const got = { albums: null, songs: null };
  const doing = new Map(); // 'album:<id>' or 'single:<id>' -> 'play' or 'press', while it is being pressed
  const wrong = new Map(); // the same key -> why pressing it failed
  let no = 0, asked = '', open = false, problem = '', allAlbums = false;

  // ---- asking ---------------------------------------------------------------------------
  function run() {
    const q = input.value.trim();
    if (!q) return;
    const me = ++no;
    asked = q; wrong.clear(); allAlbums = false;
    // A pasted link or id is looked up as what it is; anything else is searched for both ways at once.
    const album = ALBUM_ID.test(q), song = SONG_LINK.test(q) || looksLikeId(q);
    const kinds = album && !song ? ['albums'] : song && !album ? ['songs'] : ['albums', 'songs'];
    got.albums = got.songs = null;
    const ask = async (kind) => {
      got[kind] = { state: 'wait' };
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}${kind === 'albums' ? '&type=albums' : ''}`);
        const data = await res.json();
        if (me !== no) return; // a newer search has taken over
        if (!res.ok) throw new Error(data.error || 'the search failed');
        got[kind] = { state: 'ok', items: data.results || [], source: data.source || '' };
      } catch (e) {
        if (me !== no) return;
        got[kind] = { state: 'err', text: unreachable(e) ? 'Cannot reach the Groove Deck server. Is it still running? Start it again and reload this page.' : String(e.message || e) };
      }
      draw();
    };
    for (const k of kinds) ask(k);
    show(); draw();
  }
  form.addEventListener('submit', (ev) => { ev.preventDefault(); run(); });
  // a pasted link is looked up straight away
  input.addEventListener('paste', () => setTimeout(() => { const q = input.value.trim(); if (ALBUM_ID.test(q) || SONG_LINK.test(q)) run(); }, 0));
  // going back to the field brings the last results back
  const back = () => { if (!open && (asked || problem)) { show(); if (!panel.childElementCount) draw(); } };
  input.addEventListener('focus', back); input.addEventListener('click', back);
  input.addEventListener('input', () => form.classList.toggle('typed', !!input.value));

  // ---- pressing a result -----------------------------------------------------------------
  const kindOf = (which) => (which === 'albums' ? 'album' : 'single');
  // The format a result will be pressed in: the one picked in its menu, or the usual one.
  const chosen = new Map(); // 'album:<id>' or 'single:<id>' -> format key
  const formatFor = (kind, item) => chosen.get(`${kind}:${item.id}`) || formatChoices(kind, item).usual;
  // The cut: clean unless vintage cuts are switched on in the Workbench and LUNA is there.
  const cutOf = new Map(); // the same key -> cut key
  const vintage = () => state.vintage || { ok: false, cuts: [] };
  const cutFor = (kind, item) => (vintage().ok ? cutOf.get(`${kind}:${item.id}`) || 'clean' : 'clean');
  async function press(kind, item, thenPlay) {
    const key = `${kind}:${item.id}`;
    if (doing.has(key)) return;
    doing.set(key, thenPlay ? 'play' : 'press'); wrong.delete(key); refresh(key);
    try {
      const rec = await shelf.press(kind, item, formatFor(kind, item), cutFor(kind, item));
      doing.delete(key);
      if (thenPlay) { hide(); shelf.pull(rec, 0); }
    } catch (e) {
      doing.delete(key);
      wrong.set(key, `Could not press this: ${String(e.message || e)}`);
    }
    refresh(key);
  }

  // The buttons for one result: press it, or play it if it is on the shelf already.
  function acts(kind, item) {
    const key = `${kind}:${item.id}`, format = formatFor(kind, item), cut = cutFor(kind, item), rec = shelf.has(kind, item.id, format, cut), busy = doing.get(key);
    const box = el('span', { className: 'acts' });
    const button = (text, cls, tip, go) => { const b = el('button', { type: 'button', className: cls, textContent: text, title: tip }); b.addEventListener('click', go); return b; };
    // What to press it as: size and speed. Changing it changes what the buttons beside it do.
    const { choices } = formatChoices(kind, item);
    const pick = el('select', { className: 'format', title: 'What to press it as: record size and speed' });
    pick.setAttribute('aria-label', 'Record format');
    for (const f of choices) pick.append(el('option', { value: f.key, textContent: f.label, selected: f.key === format }));
    pick.disabled = !!busy;
    pick.addEventListener('change', () => { chosen.set(key, pick.value); refresh(key); const again = panel.querySelector(`li[data-key="${key}"] select.format`); if (again) again.focus(); });
    box.append(pick);
    if (vintage().ok) { // optional: only when vintage cuts are on and LUNA is there
      const cuts = el('select', { className: 'format cut', title: 'How it is mastered before it is cut. Vintage cuts go through UA plugins in LUNA and take a little longer.' });
      cuts.setAttribute('aria-label', 'Cut');
      for (const c of vintage().cuts) cuts.append(el('option', { value: c.key, textContent: c.name, selected: c.key === cut }));
      cuts.disabled = !!busy;
      cuts.addEventListener('change', () => { cutOf.set(key, cuts.value); refresh(key); const again = panel.querySelector(`li[data-key="${key}"] select.cut`); if (again) again.focus(); });
      box.append(cuts);
    }
    if (rec) {
      const on = shelf.onPlatter(rec), coming = !!shelf.work && shelf.work.id === rec.id;
      box.append(el('em', { className: 'have', textContent: on ? 'On the platter' : coming ? 'On its way' : 'On your shelf' }));
      if (!on && !coming) box.append(button('Play', 'tint go', 'Take it off the shelf and put it on the platter', () => { hide(); shelf.pull(rec, 0); }));
    } else {
      const what = kind === 'album' ? 'album as a record' : 'song as a single';
      const play = button(busy === 'play' ? 'Pressing…' : 'Press and play', 'tint go', `Press this ${what}, keep it on your shelf and put it on the platter`, () => press(kind, item, true));
      const keep = button(busy === 'press' ? 'Pressing…' : 'Press', '', `Press this ${what} and keep it on your shelf`, () => press(kind, item, false));
      play.disabled = keep.disabled = !!busy;
      box.append(play, keep);
    }
    return box;
  }
  const why = (key) => el('small', { className: 'err', textContent: wrong.get(key) || '', hidden: !wrong.has(key) });

  // Redraw the buttons of one result (or of all of them) without losing the keyboard's place.
  function refresh(key) {
    for (const li of panel.querySelectorAll(key ? `li[data-key="${key}"]` : 'li[data-key]')) {
      const had = li.contains(document.activeElement), item = li.item, kind = li.dataset.key.split(':')[0];
      li.querySelector('.acts').replaceWith(acts(kind, item));
      li.querySelector('.err').replaceWith(why(li.dataset.key));
      if (had) { const b = li.querySelector('.acts button:not(:disabled)'); if (b) b.focus(); }
    }
  }

  // ---- drawing ---------------------------------------------------------------------------
  // A cover at about the size it is shown. YouTube Music's image addresses carry their size
  // at the end (=w600-h600), so the big sleeve picture can be asked for smaller.
  const cover = (r, px) => {
    const box = el('span', { className: 'cover' });
    const src = r.art && /=w\d+-h\d+/.test(r.art) ? r.art.replace(/=w\d+-h\d+/, `=w${px}-h${px}`) : r.thumb || r.art;
    if (src) { const img = el('img', { src, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }); img.addEventListener('error', () => img.remove()); box.append(img); }
    return box;
  };
  function albumTile(r) {
    const key = `album:${r.id}`;
    const li = el('li', { className: 'album' }, [
      cover(r, 400),
      el('b', { textContent: r.title, title: r.title }),
      el('small', { textContent: r.artist, title: r.artist }),
      el('small', { className: 'meta', textContent: [r.kind && r.kind !== 'Album' ? r.kind : '', r.year].filter(Boolean).join(', ') }),
      acts('album', r), why(key),
    ]);
    li.dataset.key = key; li.item = r;
    return li;
  }
  function songRow(r) {
    const key = `single:${r.id}`;
    const li = el('li', { className: 'song' }, [
      cover(r, 120),
      el('div', { className: 'words' }, [
        el('b', { textContent: r.title, title: r.title }),
        el('small', {}, [el('span', { textContent: r.artist }), r.album ? el('i', { textContent: r.album }) : '']),
      ]),
      el('span', { className: 'len', textContent: r.seconds ? mmss(r.seconds) : '' }),
      acts('single', r), why(key),
    ]);
    li.dataset.key = key; li.item = r;
    return li;
  }
  const again = () => { const b = el('button', { type: 'button', className: 'quiet', textContent: 'Try again' }); b.addEventListener('click', run); return b; };
  const waiting = (which) => el('ul', { className: `${which} wait`, ariaHidden: 'true' }, Array.from({ length: which === 'albums' ? 3 : 5 }, () => el('li', {}, [el('span', { className: 'cover' }), el('b'), el('small')])));

  function column(which) {
    const g = got[which], name = which === 'albums' ? 'Albums' : 'Songs';
    const col = el('section', { className: `col ${which}` }, [el('h3', { textContent: name })]);
    if (g.state === 'wait') col.append(waiting(which));
    else if (g.state === 'err') col.append(el('div', { className: 'trouble' }, [el('p', { textContent: `${which === 'albums' ? 'The album search' : 'The song search'} did not work. ${g.text}` }), again()]));
    else if (!g.items.length) col.append(el('p', { className: 'none', textContent: which === 'albums' ? 'No albums found.' : 'No songs found.' }));
    else {
      if (which === 'songs' && /unavailable/.test(g.source)) col.append(el('p', { className: 'none', textContent: 'YouTube Music search was unavailable, so these are from plain YouTube.' }));
      col.append(el('ul', { className: which }, g.items.map(which === 'albums' ? albumTile : songRow)));
    }
    return col;
  }

  function draw() {
    const kinds = ['albums', 'songs'].filter((k) => got[k]);
    const busy = kinds.some((k) => got[k].state === 'wait'), all = (st) => kinds.length > 0 && kinds.every((k) => got[k].state === st);
    const found = kinds.reduce((n, k) => n + (got[k].state === 'ok' ? got[k].items.length : 0), 0);
    const shut = el('button', { type: 'button', className: 'quiet', textContent: 'Close', title: 'Close the results (Escape)' });
    shut.addEventListener('click', hide);
    const line = !kinds.length ? '' : busy ? `Searching YouTube Music for “${asked}”` : all('err') ? 'The search did not work' : found ? `Results for “${asked}”` : `Nothing found for “${asked}”`;
    const kids = [el('header', {}, [el('p', { className: 'what', textContent: line, role: 'status' }), shut])];
    if (problem) kids.push(el('div', { className: 'trouble' }, [el('p', { textContent: problem })]));
    if (all('err')) kids.push(el('div', { className: 'trouble big' }, [el('p', { textContent: `YouTube Music could not be searched just now. ${got[kinds[kinds.length - 1]].text}` }), again()]));
    else if (kinds.length && !busy && !found && all('ok')) kids.push(el('p', { className: 'none big', textContent: 'Check the spelling, try fewer words, or paste a song or album link from YouTube Music.' }));
    else if (kinds.length) kids.push(el('div', { className: `cols${kinds.length === 1 ? ' one' : ''}` }, kinds.map(column)));
    panel.replaceChildren(...kids);
    panel.setAttribute('aria-busy', String(busy));
    fit();
  }
  // Albums take a lot of room. Beside the songs they get two rows, above them one; the rest
  // wait behind a button, so the songs are never pushed out of sight.
  function fit() {
    const ul = panel.querySelector('ul.albums:not(.wait)'), old = panel.querySelector('.more');
    if (old) old.remove();
    if (!ul) return;
    for (const li of ul.children) li.hidden = false;
    if (allAlbums || !got.songs || panel.hidden) return;
    const across = getComputedStyle(ul).gridTemplateColumns.split(' ').length;
    const stacked = getComputedStyle(ul.closest('.cols')).gridTemplateColumns.split(' ').length < 2;
    const keep = across * (stacked ? 1 : 2);
    if (ul.children.length <= keep) return;
    [...ul.children].forEach((li, i) => { li.hidden = i >= keep; });
    const more = el('button', { type: 'button', className: 'more', textContent: `Show all ${ul.children.length} albums` });
    more.addEventListener('click', () => { allAlbums = true; fit(); const next = ul.children[keep] && ul.children[keep].querySelector('button'); if (next) next.focus(); });
    ul.after(more);
  }

  // ---- opening and closing ---------------------------------------------------------------
  function place() {
    // under the search field, as near centred on it as the window allows
    const f = form.getBoundingClientRect(), w = panel.offsetWidth, W = window.innerWidth;
    panel.style.left = `${Math.max(16, Math.min(W - w - 16, f.left + f.width / 2 - w / 2))}px`;
  }
  function show() {
    if (!open) { open = true; panel.hidden = false; $('#scrim').hidden = false; form.classList.add('open'); fit(); }
    place();
  }
  function hide() {
    if (!open) return false;
    open = false; panel.hidden = true; $('#scrim').hidden = true; form.classList.remove('open');
    if (panel.contains(document.activeElement)) input.focus();
    return true;
  }
  // clicking anywhere else puts the results away
  document.addEventListener('pointerdown', (ev) => { if (open && !panel.contains(ev.target) && !form.contains(ev.target)) hide(); }, true);
  window.addEventListener('resize', () => { if (open) { place(); fit(); } });

  return {
    focus() { input.focus(); input.select(); },
    // Escape: put the results away, or leave the field. True if something was done.
    close() {
      if (hide()) return true;
      if (document.activeElement === input) { input.blur(); return true; }
      return false;
    },
    // Something that stops searching from working at all (the server is missing a program).
    trouble(text) { problem = text; form.classList.toggle('bad', !!text); if (open) draw(); },
    changed(what) { if (open && !what) refresh(); }, // a record pressed, pulled or removed changes what a result offers
    get open() { return open; },
  };
}

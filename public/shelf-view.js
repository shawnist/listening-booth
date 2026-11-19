// The shelf you see: sleeves standing in a row along the bottom of the window, the card
// that opens above a sleeve when it is clicked, the hand that drags a sleeve up to the deck,
// and the whole collection as a grid for when the row is not enough.
import { artSrc, formatName } from './library.js';
import { plural } from './shelf.js';

const DRAG_AFTER_PX = 6;
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

export function createShelfView({ state, shelf, ui }) {
  const { el, mmss, view } = ui;
  const $ = (s) => document.querySelector(s);
  const row = $('#shelf'), well = row.parentElement, card = $('#card'), ghost = $('#ghost'), ring = $('#dropRing');
  const coll = $('#collection'), grid = $('#collGrid'), filter = $('#collFilter'), sort = $('#collSort');
  const nodes = new Map(); // record id -> its sleeve in the row
  let selected = '', confirming = false, refs = null; // the record the card is about, and the parts of the card that change
  let collOpen = false, ready = false, first = '', drag = null, swallowClick = false;
  shelf.loaded.then(() => { ready = true; renderRow(); });

  // ---- a sleeve --------------------------------------------------------------------------
  const size = (rec) => `s${rec.format.split('-')[0]}`; // a single is a smaller sleeve than an LP
  function jacket(rec) {
    const src = artSrc(rec.artUrl);
    const blank = () => el('span', { className: 'blank' }, [el('b', { textContent: rec.title }), el('small', { textContent: rec.artist })]);
    const img = src ? el('img', { src, alt: '', draggable: false }) : blank();
    if (src) img.addEventListener('error', () => img.replaceWith(blank()));
    return el('span', { className: 'jacket' }, [img]);
  }
  function sleeve(id, inGrid) {
    const rec = shelf.find(id);
    const art = el('button', { className: 'art', type: 'button' }, [
      el('span', { className: 'disc' }), jacket(rec),
      el('span', { className: 'work', hidden: true }, [el('em'), el('i', {}, [el('u')])]),
      el('span', { className: 'flag', textContent: '!', title: 'It could not be fetched', hidden: true }),
    ]);
    const li = el('li', {}, [art]);
    li.dataset.id = id;
    if (inGrid) li.append(el('div', { className: 'cap' }, [
      el('b', { textContent: rec.title, title: rec.title }), el('small', { textContent: rec.artist, title: rec.artist }),
      el('small', { className: 'meta', textContent: [formatName(rec), rec.cut && rec.cut.chain && rec.cut.chain !== 'clean' ? (state.cutName ? state.cutName(rec.cut.chain) : 'vintage cut') : '', rec.year].filter(Boolean).join(', ') }),
      el('small', { className: 'meta', textContent: rec.plays ? plural(rec.plays, 'play') : 'Not played yet' }),
    ]));
    art.addEventListener('click', () => {
      if (swallowClick) { swallowClick = false; return; } // that was the end of a drag
      select(selected === id ? '' : id);
      // the card's main button is one key away: Enter plays, Escape comes back to the sleeve
      const go = selected && card.querySelector('#cardPlay:not([hidden]):not(:disabled)');
      if (go) go.focus({ preventScroll: true });
    });
    art.addEventListener('dblclick', () => play(id));
    art.addEventListener('pointerenter', () => over(id)); art.addEventListener('focus', () => over(id));
    art.addEventListener('pointerleave', () => over('')); art.addEventListener('blur', () => over(''));
    art.addEventListener('keydown', (ev) => { // left and right walk along the shelf
      const to = ev.key === 'ArrowRight' ? li.nextElementSibling : ev.key === 'ArrowLeft' ? li.previousElementSibling : null;
      if (to && to.querySelector('.art')) { ev.preventDefault(); to.querySelector('.art').focus(); }
    });
    if (!inGrid) art.addEventListener('pointerdown', (ev) => handDown(ev, id, li));
    return li;
  }
  // Classes and words that follow what the record is doing.
  function dress(li, rec) {
    const on = shelf.onPlatter(rec), w = shelf.work, busy = !!w && w.id === rec.id, bad = !!shelf.failed && shelf.failed.id === rec.id && !busy;
    li.classList.add('sleeve', size(rec));
    for (const [name, yes] of [['on', on], ['sel', selected === rec.id], ['busy', busy], ['bad', bad]]) li.classList.toggle(name, yes);
    const art = li.querySelector('.art');
    art.setAttribute('aria-label', `${rec.title}, ${rec.artist}. ${on ? 'On the platter.' : busy ? 'On its way to the platter.' : 'On the shelf.'}`);
    art.setAttribute('aria-pressed', String(selected === rec.id));
    li.querySelector('.flag').hidden = !bad;
    const box = li.querySelector('.work');
    box.hidden = !busy;
    if (busy) { box.querySelector('em').textContent = w.short; box.querySelector('u').style.width = `${Math.round(w.progress * 100)}%`; }
  }
  // The shelf's readout names the record under the pointer.
  function over(id) {
    const rec = id && !drag ? shelf.find(id) : null;
    $('#shelfOver').textContent = rec ? `${rec.title}, ${rec.artist}` : '';
  }

  // ---- the row along the bottom ------------------------------------------------------------
  function renderRow() {
    const list = shelf.order('recent'), fresh = shelf.takeFresh();
    const was = new Map([...nodes].map(([id, li]) => [id, li.getBoundingClientRect().left]));
    for (const [id, li] of nodes) if (!shelf.find(id)) { li.remove(); nodes.delete(id); }
    list.forEach((rec, i) => {
      let li = nodes.get(rec.id);
      if (!li) {
        li = sleeve(rec.id, false); nodes.set(rec.id, li);
        if (rec.id === fresh) { li.classList.add('new'); li.addEventListener('animationend', () => li.classList.remove('new'), { once: true }); } // a new pressing is seen to arrive
      }
      if (row.children[i] !== li) row.insertBefore(li, row.children[i] || null);
      dress(li, rec);
    });
    // a record that has come to the front slides there, and the others make room
    if (!calm.matches) for (const [id, li] of nodes) {
      const dx = was.has(id) ? was.get(id) - li.getBoundingClientRect().left : 0;
      if (Math.abs(dx) > 1) li.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
    const lead = list.length ? list[0].id : '';
    if (lead !== first && first) well.scrollTo({ left: 0, behavior: calm.matches ? 'auto' : 'smooth' });
    first = lead;
    row.hidden = !list.length;
    $('#shelfEmpty').hidden = !ready || list.length > 0;
    $('#shelfCount').textContent = ready && list.length ? plural(list.length, 'record') : '';
    $('#openCollection').hidden = !list.length;
    edges();
  }
  // Fade the ends of the row where more records lie beyond the edge.
  function edges() {
    well.classList.toggle('more-left', well.scrollLeft > 4);
    well.classList.toggle('more-right', well.scrollLeft + well.clientWidth < well.scrollWidth - 4);
  }
  well.addEventListener('scroll', () => { edges(); if (selected && !collOpen) placeCard(); }, { passive: true });
  // a mouse wheel moves the row sideways
  well.addEventListener('wheel', (ev) => {
    if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX) || well.scrollWidth <= well.clientWidth) return;
    ev.preventDefault(); well.scrollLeft += ev.deltaY;
  }, { passive: false });
  $('#firstSearch').addEventListener('click', () => ui.openSearch());

  // ---- from the sleeve to the platter ---------------------------------------------------------
  function play(id, sideIndex = 0) {
    const rec = shelf.find(id);
    if (!rec) return;
    select('');
    if (collOpen) closeCollection();
    if (shelf.onPlatter(rec) && state.platter.sideIndex === sideIndex && !shelf.work) return ui.hint('That side is already on the platter.', 3000);
    shelf.pull(rec, sideIndex);
  }

  // A sleeve in the hand. Past a few pixels it leaves the shelf and follows the pointer;
  // let go over the deck and its record goes on the platter.
  function handDown(ev, id, li) {
    const rec = shelf.find(id);
    if (drag || (ev.pointerType === 'mouse' && ev.button !== 0) || !rec || shelf.onPlatter(rec) || (shelf.work && shelf.work.id === id)) return;
    const art = li.querySelector('.art');
    const d = { id, li, art, pointer: ev.pointerId, x0: ev.clientX, y0: ev.clientY, live: false, over: false, said: '' };
    drag = d;
    const move = (e) => { if (e.pointerId === d.pointer) handMove(d, e); };
    const up = (e) => { if (e.pointerId === d.pointer) d.end(e.type === 'pointerup' ? e : null); };
    d.end = (e) => {
      art.removeEventListener('pointermove', move); art.removeEventListener('pointerup', up); art.removeEventListener('pointercancel', up);
      try { art.releasePointerCapture(d.pointer); } catch { /* already let go */ }
      drag = null;
      if (d.live) handUp(d, e);
    };
    try { art.setPointerCapture(ev.pointerId); } catch { /* pointer already gone */ }
    art.addEventListener('pointermove', move); art.addEventListener('pointerup', up); art.addEventListener('pointercancel', up);
  }
  function handMove(d, ev) {
    if (!d.live) {
      if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < DRAG_AFTER_PX) return;
      d.live = true;
      select('');
      const r = d.li.querySelector('.jacket').getBoundingClientRect();
      d.home = r; d.dx = d.x0 - r.left; d.dy = d.y0 - r.top;
      ghost.replaceChildren(el('span', { className: 'disc' }), d.li.querySelector('.jacket').cloneNode(true));
      ghost.style.width = ghost.style.height = `${r.width}px`;
      ghost.className = 'ghost'; ghost.hidden = false;
      d.li.classList.add('lifted'); document.body.classList.add('carrying');
      d.said = $('#hint').hidden ? '' : $('#hint').textContent;
      ui.hint('Let go over the deck to play it.', 600000);
      over('');
    }
    const x = ev.clientX - d.dx, y = ev.clientY - d.dy;
    ghost.style.transform = `translate(${x}px, ${y}px) rotate(-3deg)`;
    const now = overDeck(ev.clientX, ev.clientY);
    if (now !== d.over) { d.over = now; ghost.classList.toggle('over', now); ring.classList.toggle('over', now); }
    drawRing();
  }
  function handUp(d, ev) {
    const land = !!ev && d.over;
    swallowClick = !!ev; setTimeout(() => { swallowClick = false; }, 0); // the click that follows a drag is not a click on the sleeve
    document.body.classList.remove('carrying'); ring.classList.remove('over');
    d.li.classList.remove('lifted');
    ui.hint(land ? '' : d.said);
    // the sleeve goes down to the platter, or back to its place on the shelf
    const c = land ? view.pointForRecord(0, 0) : null, home = d.li.querySelector('.jacket').getBoundingClientRect();
    const to = land ? `translate(${c.x - d.home.width / 2}px, ${c.y - d.home.height / 2}px) scale(.3)` : `translate(${home.left}px, ${home.top}px)`;
    const done = () => { ghost.hidden = true; ghost.replaceChildren(); };
    if (calm.matches) done();
    else ghost.animate([{ transform: ghost.style.transform, opacity: 1 }, { transform: to, opacity: land ? 0 : 1 }], { duration: 200, easing: 'cubic-bezier(.3,.7,.3,1)' }).finished.then(done, done);
    if (land) play(d.id);
  }
  // Is this point of the page over the turntable? Anywhere on the deck will do.
  function overDeck(x, y) {
    const pts = [...view.outline('plinth'), ...view.outline('platter', 12)];
    if (!pts.length || y > $('#shelfStrip').getBoundingClientRect().top || y < $('.topbar').getBoundingClientRect().bottom) return false;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y), pad = 28;
    return x > Math.min(...xs) - pad && x < Math.max(...xs) + pad && y > Math.min(...ys) - pad && y < Math.max(...ys) + pad;
  }
  // A ring round the platter while a sleeve is in the hand: this is where it goes.
  function drawRing() {
    const pts = view.outline('platter', 64);
    if (pts.length) ring.querySelector('path').setAttribute('d', `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z`);
  }

  // ---- the card above a sleeve --------------------------------------------------------------
  function select(id) {
    selected = id; confirming = false;
    for (const li of document.querySelectorAll('#shelf li, #collGrid li')) { const rec = shelf.find(li.dataset.id); if (rec) dress(li, rec); }
    renderCard();
  }
  const button = (text, cls, go, id) => { const b = el('button', { type: 'button', className: cls, textContent: text }); if (id) b.id = id; b.addEventListener('click', go); return b; };
  const sideWords = (s) => [mmss(s.seconds), plural(s.tracks.length, 'track'), plural(s.plays, 'play'), s.wear.ticks.length ? plural(s.wear.ticks.length, 'tick') : ''].filter(Boolean).join(', ');
  function sideState(rec, i) {
    const on = shelf.onPlatter(rec), w = shelf.work;
    return on && state.platter.sideIndex === i && !(w && w.id === rec.id) ? 'On the platter' : w && w.id === rec.id && w.sideIndex === i ? 'On its way' : shelf.inMemory(rec.sides[i]) ? 'Ready' : '';
  }
  function renderCard() {
    const rec = shelf.find(selected);
    refs = null;
    if (!rec) { selected = ''; card.hidden = true; card.replaceChildren(); return; }
    const on = shelf.onPlatter(rec), at = on ? state.platter.sideIndex : -1, w = shelf.work, busy = !!w && w.id === rec.id, bad = shelf.failed && shelf.failed.id === rec.id && !busy;
    const src = artSrc(rec.artUrl), f = shelf.facts(rec);
    const fact = (name, label, value) => { const dd = el('dd', { textContent: value }); dd.dataset.fact = name; return [el('div', {}, [el('dt', { textContent: label }), dd]), dd]; };
    const cells = [fact('pressed', 'Pressed', f.pressed), fact('plays', 'Plays', f.plays), fact('dust', 'Dust', `${f.dust}%`), fact('ticks', 'Ticks', f.ticks)];
    const sides = rec.sides.map((s, i) => {
      const words = el('span', { textContent: sideWords(s) }), where = el('em', { textContent: sideState(rec, i) });
      const b = el('button', { type: 'button', className: i === at ? 'on' : '', title: i === at ? `Side ${s.name} is on the platter` : `Put side ${s.name} on the platter` }, [el('b', { textContent: s.name }), words, where]);
      b.disabled = busy;
      b.addEventListener('click', () => { if (i !== at) play(rec.id, i); });
      return { b, words, where };
    });
    const shut = button('Close', 'quiet shut', () => select(''));
    const kids = [
      el('div', { className: 'head' }, [
        src ? el('img', { src, alt: '' }) : el('span', { className: 'ph' }),
        el('div', {}, [el('b', { textContent: rec.title }), el('small', { textContent: rec.artist }), el('small', { className: 'meta', textContent: [formatName(rec), rec.cut && rec.cut.chain && rec.cut.chain !== 'clean' ? (state.cutName ? state.cutName(rec.cut.chain) : 'vintage cut') : '', rec.year].filter(Boolean).join(', ') })]),
        shut,
      ]),
      el('dl', { id: 'facts' }, cells.map((c) => c[0])),
    ];
    if (busy) kids.push(el('p', { className: 'state', textContent: `${w.text}. It will be on the platter shortly.` }));
    if (bad) kids.push(el('p', { className: 'state err', textContent: shelf.failed.text }));
    kids.push(el('div', { className: 'sides' }, sides.map((s) => s.b)));
    const acts = el('div', { className: confirming ? 'acts asking' : 'acts' });
    if (confirming) {
      acts.append(el('span', { className: 'ask', textContent: 'Remove this record? Its plays and wear go with it.' }),
        button('Remove it', 'danger', () => { const r = shelf.find(selected); select(''); if (r) shelf.remove(r); }),
        button('Keep it', 'keep', () => { confirming = false; renderCard(); card.querySelector('#remove').focus(); }));
    } else {
      const next = rec.sides[(Math.max(0, at) + 1) % rec.sides.length];
      const go = bad ? button('Try again', 'primary', () => play(rec.id, shelf.failed.sideIndex), 'cardPlay')
        : on ? button(`Flip to side ${next.name}`, 'primary', () => play(rec.id, (at + 1) % rec.sides.length), 'cardPlay')
          : button('Play', 'primary', () => play(rec.id, 0), 'cardPlay');
      go.disabled = busy;
      go.hidden = on && rec.sides.length < 2; // a single already on the platter has no other side to turn to
      acts.append(go, button('Clean', '', () => shelf.brush(rec), 'clean'), button('Remove from shelf', 'quiet', () => { confirming = true; renderCard(); card.querySelector('.keep').focus(); }, 'remove'));
      acts.querySelector('#clean').title = 'Brush the dust off this record';
    }
    kids.push(acts, el('p', { className: 'note', textContent: 'Lowering the needle onto the music by hand leaves a tick for good. The outer edge and the cue lever are safe.' }), el('span', { className: 'tail' }));
    const hadFocus = card.contains(document.activeElement);
    card.replaceChildren(...kids);
    card.hidden = false;
    refs = { rec, cells: Object.fromEntries(cells.map((c) => [c[1].dataset.fact, c[1]])), sides };
    placeCard();
    if (hadFocus && !card.contains(document.activeElement)) (card.querySelector('#cardPlay:not([hidden]):not(:disabled)') || shut).focus();
  }
  // Plays, dust and ticks move while a record plays: change the figures, leave the buttons alone.
  function refreshCard() {
    if (!refs || !shelf.find(selected)) return;
    const f = shelf.facts(refs.rec);
    refs.cells.plays.textContent = f.plays; refs.cells.dust.textContent = `${f.dust}%`; refs.cells.ticks.textContent = f.ticks;
    refs.sides.forEach((s, i) => { s.words.textContent = sideWords(refs.rec.sides[i]); s.where.textContent = sideState(refs.rec, i); });
  }
  // Above its sleeve in the row; beside its sleeve in the collection.
  function placeCard() {
    const li = (collOpen ? grid : row).querySelector(`li[data-id="${selected}"]`);
    if (card.hidden || !li) return;
    const a = li.querySelector('.jacket').getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight, W = window.innerWidth, H = window.innerHeight;
    const floor = $('.topbar').getBoundingClientRect().bottom + 8;
    let left, top;
    if (!collOpen) {
      left = Math.max(12, Math.min(W - w - 12, a.left + a.width / 2 - w / 2)); top = Math.max(floor, a.top - h - 14);
      card.style.setProperty('--tail', `${Math.max(18, Math.min(w - 18, a.left + a.width / 2 - left))}px`);
    } else {
      left = a.right + 14 + w < W - 12 ? a.right + 14 : Math.max(12, a.left - w - 14); top = Math.max(floor, Math.min(H - h - 12, a.top - 8));
    }
    card.classList.toggle('beside', collOpen);
    card.style.left = `${Math.round(left)}px`; card.style.top = `${Math.round(top)}px`;
  }
  // clicking anywhere else puts the card away
  document.addEventListener('pointerdown', (ev) => {
    if (selected && !card.contains(ev.target) && !(ev.target.closest && ev.target.closest('.sleeve .art'))) select('');
  }, true);
  window.addEventListener('resize', () => { placeCard(); edges(); });

  // ---- the whole collection -------------------------------------------------------------------
  function renderGrid() {
    const q = filter.value.trim().toLowerCase();
    const list = shelf.order(sort.value).filter((r) => !q || `${r.title} ${r.artist}`.toLowerCase().includes(q));
    grid.replaceChildren(...list.map((rec) => { const li = sleeve(rec.id, true); li.classList.add('tile'); return li; }));
    for (const li of grid.children) dress(li, shelf.find(li.dataset.id));
    $('#collCount').textContent = q ? `${list.length} of ${plural(shelf.records.length, 'record')}` : plural(shelf.records.length, 'record');
    const none = $('#collNone');
    none.hidden = list.length > 0;
    none.textContent = shelf.records.length ? `No record matches “${filter.value.trim()}”.` : 'Your shelf is empty. Search for a song or an album and press your first record.';
    placeCard();
  }
  function openCollection() {
    if (collOpen) return;
    select('');
    collOpen = true; coll.hidden = false; document.body.classList.add('collecting');
    $('#openCollection').setAttribute('aria-expanded', 'true');
    renderGrid(); filter.focus();
  }
  function closeCollection() {
    if (!collOpen) return false;
    select('');
    collOpen = false; coll.hidden = true; document.body.classList.remove('collecting');
    $('#openCollection').setAttribute('aria-expanded', 'false');
    if (!document.activeElement || document.activeElement === document.body || coll.contains(document.activeElement)) $('#openCollection').focus();
    return true;
  }
  $('#openCollection').addEventListener('click', openCollection);
  $('#closeCollection').addEventListener('click', closeCollection);
  filter.addEventListener('input', () => { select(''); renderGrid(); });
  sort.addEventListener('change', () => { select(''); renderGrid(); });
  grid.addEventListener('scroll', () => { if (selected) placeCard(); }, { passive: true });

  return {
    changed(what) {
      if (what === 'work') { // only the progress on the sleeve has moved
        for (const li of document.querySelectorAll('#shelf li.busy, #collGrid li.busy')) { const rec = shelf.find(li.dataset.id); if (rec) dress(li, rec); }
        return;
      }
      if (what === 'facts') return refreshCard();
      renderRow();
      if (collOpen) renderGrid();
      if (selected) renderCard();
    },
    // Escape: each returns true if it had something to put away.
    dropDrag() { if (!drag || !drag.live) return false; drag.end(null); return true; },
    closeCard() { if (!selected) return false; const li = (collOpen ? grid : row).querySelector(`li[data-id="${selected}"] .art`); select(''); if (li) li.focus(); return true; },
    closeCollection,
  };
}

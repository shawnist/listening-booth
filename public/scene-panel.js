// The View panel: how the deck is framed, what stands round it on screen, and how it is lit.
// Camera and light live in the deck view (view.look); what is shown is a few classes on <body>.
// Light and what is shown are remembered between visits; the camera starts fresh each time.

const PRESETS = {
  studio: { label: 'Studio', set: (d) => ({ brightness: d.brightness, warmth: d.warmth, angle: d.angle, height: d.height, room: d.room }) }, // the default light
  daylight: { label: 'Daylight', set: (d) => ({ brightness: 1.15, warmth: 0.18, angle: d.angle + 25, height: 66, room: 1.35 }) },
  evening: { label: 'Evening lamp', chip: 'Evening', set: (d) => ({ brightness: 0.9, warmth: 0.95, angle: d.angle - 70, height: 24, room: 0.5 }) },
  spot: { label: 'Spotlight', chip: 'Spot', set: () => ({ brightness: 1.1, warmth: 0.5, angle: 20, height: 80, room: 0.2 }) },
  low: { label: 'Low light', set: (d) => ({ brightness: 0.6, warmth: 0.78, angle: d.angle + 110, height: 32, room: 0.35 }) },
};
const SURFACE_NAMES = { charcoal: 'Charcoal', walnut: 'Walnut', stone: 'Stone', linen: 'Linen', black: 'Black' };
const SURFACE_SWATCH = { charcoal: '#1b1917', walnut: '#38261a', stone: '#56534e', linen: '#8d8678', black: '#050505' }; // as the deck view draws them
const LIGHT_KEYS = ['brightness', 'warmth', 'angle', 'height', 'room', 'shadows', 'surface'];
const SHOWN = { shelf: 'hide-shelf', card: 'hide-card', hints: 'hide-hints' };
const STORE = 'gd.view';

// createScenePanel({ view, ui: { el }, onLayout, onOpen }) -> { toggle(), close(), isOpen(), deckOnly(on?) }
// onLayout is called whenever something on screen is shown or hidden, so the deck can be refitted.
export function createScenePanel({ view, ui, onLayout, onOpen }) {
  const { el } = ui;
  const $ = (s) => document.querySelector(s);
  const panel = $('#scene'), toggleBtn = $('#sceneToggle');
  const look = view.look; // absent when the deck could not be drawn in 3D
  const body = document.body;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { saved = {}; }
  const remember = () => {
    const now = look ? look.get() : {};
    const keep = { light: Object.fromEntries(LIGHT_KEYS.map((k) => [k, now[k]])), preset: mood, hidden: Object.keys(SHOWN).filter((k) => body.classList.contains(SHOWN[k])) };
    try { localStorage.setItem(STORE, JSON.stringify(keep)); } catch { /* not remembered */ }
  };

  // ---- small builders ------------------------------------------------------------------
  const sliders = {};
  let mood = 'studio', shadowBox = null;
  const chips = {}, swatches = {};
  function slider(key, label, min, max, step, show, title) {
    const out = el('output', {});
    const input = el('input', { type: 'range', min, max, step });
    input.addEventListener('input', () => {
      const v = Number(input.value);
      look.set({ [key]: key === 'angle' ? v - 180 : v });
      if (key !== 'zoom') setMood('custom');
      remember();
    });
    sliders[key] = { input, out, show };
    return el('label', title ? { title } : {}, [el('span', {}, [label, out]), input]);
  }
  // a tick box drawn as a switch
  const check = (label, checked, onChange) => {
    const box = el('input', { type: 'checkbox', checked });
    box.addEventListener('change', () => onChange(box.checked));
    return [el('label', { className: 'check switch' }, [box, label]), box];
  };
  const heading = (text) => el('h3', { textContent: text });
  function setMood(k) {
    mood = k;
    for (const [key, b] of Object.entries(chips)) b.setAttribute('aria-pressed', String(key === k));
  }

  // ---- what is shown ---------------------------------------------------------------------
  const boxes = {};
  function setShown(what, on) {
    body.classList.toggle(SHOWN[what], !on);
    if (boxes[what]) boxes[what].checked = on;
    onLayout(); remember();
  }
  function deckOnly(on = !body.classList.contains('deck-only')) {
    body.classList.toggle('deck-only', on);
    if (on) close();
    $('#deckOnlyBack').hidden = !on;
    onLayout();
    return on;
  }

  // ---- build -------------------------------------------------------------------------------
  // Lighting first (what is changed most), then what the deck stands on, the camera, and what is
  // on screen; one reset for everything at the foot.
  const closeBtn = el('button', { type: 'button', className: 'quiet', textContent: 'Close' });
  closeBtn.addEventListener('click', () => { close(); toggleBtn.focus(); });
  panel.append(el('div', { className: 'scenehead' }, [el('h2', { textContent: 'View' }), closeBtn]));

  if (look) {
    const moodRow = el('div', { className: 'chips', role: 'group', ariaLabel: 'Lighting mood' });
    for (const [k, p] of Object.entries(PRESETS)) {
      const b = el('button', { type: 'button', textContent: p.chip || p.label, title: `${p.label} lighting` });
      b.addEventListener('click', () => { look.set(p.set(look.defaults)); setMood(k); remember(); b.blur(); });
      chips[k] = b; moodRow.append(b);
    }
    const fine = el('details', { className: 'fine' }, [
      el('summary', { textContent: 'Fine-tune light' }),
      slider('angle', 'Direction', 0, 360, 1, (v) => `${Math.round(v)}°`),
      slider('height', 'Height', 8, 86, 1, (v) => (v < 28 ? 'low' : v > 62 ? 'overhead' : 'mid')),
      slider('room', 'Room light', 0, 1.8, 0.01, (v) => `${Math.round(v * 100)}%`),
    ]);
    const swatchRow = el('div', { className: 'swatches', role: 'group', ariaLabel: 'Surface' });
    for (const k of look.surfaces) {
      const b = el('button', { type: 'button', title: SURFACE_NAMES[k] || k, ariaLabel: SURFACE_NAMES[k] || k });
      b.style.background = SURFACE_SWATCH[k] || '#333';
      b.addEventListener('click', () => { look.set({ surface: k }); remember(); b.blur(); });
      swatches[k] = b; swatchRow.append(b);
    }
    const [shadowLab, sBox] = check('Shadows', true, (on) => { look.set({ shadows: on }); remember(); });
    shadowBox = sBox;
    const reset = el('button', { type: 'button', className: 'icon', title: 'Put the camera back to the start', ariaLabel: 'Reset camera', textContent: '↺' });
    reset.addEventListener('click', () => { look.resetCamera(); reset.blur(); });
    panel.append(
      heading('Lighting'), moodRow,
      slider('brightness', 'Brightness', 0.3, 2, 0.01, (v) => `${Math.round(v * 100)}%`),
      slider('warmth', 'Warmth', 0, 1, 0.01, (v) => (v < 0.4 ? 'cool' : v > 0.6 ? 'warm' : 'neutral')),
      fine,
      heading('Surface'), el('div', { className: 'row' }, [swatchRow, shadowLab]),
      heading('Camera'),
      el('div', { className: 'row zoom' }, [slider('zoom', 'Zoom', 0.5, 5, 0.01, (v) => `${v.toFixed(1)}×`,
        'Drag the deck to look round, scroll or pinch to zoom, hold Shift and drag to slide'), reset]),
    );
  }

  const shownRow = el('div', { className: 'checks' });
  for (const [what, label] of [['shelf', 'Shelf'], ['card', 'Record card'], ['hints', 'Hints']]) {
    const [lab, box] = check(label, true, (on) => setShown(what, on));
    lab.dataset.shown = what; boxes[what] = box; shownRow.append(lab);
  }
  const only = el('button', { type: 'button', textContent: 'Deck only', title: 'Show only the turntable (H brings everything back)' });
  only.addEventListener('click', () => deckOnly(true));
  shownRow.append(only);
  panel.append(heading('On screen'), shownRow);

  if (look) {
    const resetAll = el('button', { type: 'button', className: 'resetall', textContent: 'Reset everything', title: 'Default lighting, surface and camera, with everything shown' });
    resetAll.addEventListener('click', () => {
      look.set({ ...PRESETS.studio.set(look.defaults), shadows: true, surface: 'charcoal' }); setMood('studio');
      look.resetCamera();
      for (const what of Object.keys(SHOWN)) setShown(what, true);
      remember(); resetAll.blur();
    });
    panel.append(resetAll);

    // keep the controls in step with the deck (scroll-zoom and view changes move them too)
    const sync = (now) => {
      for (const [key, s] of Object.entries(sliders)) {
        const v = key === 'angle' ? (((now.angle + 180) % 360) + 360) % 360 : now[key];
        s.input.value = v; s.out.textContent = s.show(key === 'angle' ? v : now[key]);
      }
      for (const [k, b] of Object.entries(swatches)) b.setAttribute('aria-pressed', String(k === now.surface));
      shadowBox.checked = !!now.shadows;
    };
    look.onChange(sync);
    if (saved.light) look.set(saved.light);
    setMood(saved.preset && (PRESETS[saved.preset] || saved.preset === 'custom') ? saved.preset : 'studio');
    sync(look.get());
  } else {
    panel.append(el('p', { className: 'tip', textContent: 'Camera and lighting controls need the 3D deck, which this browser could not draw.' }));
  }
  for (const what of saved.hidden || []) if (SHOWN[what]) { body.classList.add(SHOWN[what]); if (boxes[what]) boxes[what].checked = false; }
  onLayout();

  // ---- open and close --------------------------------------------------------------------
  let open = false;
  function setOpen(on) {
    if (on && onOpen) onOpen(); // lets the page close whatever else stands in this place
    open = on;
    panel.hidden = !on;
    toggleBtn.setAttribute('aria-expanded', String(on)); toggleBtn.classList.toggle('on', on);
    onLayout();
  }
  function close() {
    if (!open) return false;
    if (panel.contains(document.activeElement)) document.activeElement.blur(); // keys go back to the deck
    setOpen(false); return true;
  }
  toggleBtn.addEventListener('click', () => setOpen(!open));
  $('#deckOnlyBack').addEventListener('click', () => deckOnly(false));
  window.addEventListener('keydown', (e) => {
    if ((e.key !== 'h' && e.key !== 'H') || e.metaKey || e.ctrlKey || e.altKey) return;
    const at = document.activeElement; // typing in a text box is not a shortcut; a slider or tick box is no obstacle
    if (at.tagName === 'TEXTAREA' || (at.tagName === 'INPUT' && !/^(range|checkbox|radio|button)$/.test(at.type))) return;
    e.preventDefault(); deckOnly();
  });

  return { toggle: () => setOpen(!open), close, isOpen: () => open, deckOnly, isDeckOnly: () => body.classList.contains('deck-only') };
}

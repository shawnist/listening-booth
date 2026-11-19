// The turntable switch, where the owner can reach it: at the top of the Workbench and in the
// View panel. Both stay in step. Choosing a table calls setTable(key); the rest (swapping the
// model, the mechanism, the engine's params) is app.js's.
import { TABLES } from './registry.js';

// createTableSwitch({ el, getTable, setTable }) -> { sync() }
export function createTableSwitch({ el, getTable, setTable }) {
  const $ = (s) => document.querySelector(s);
  const picks = [];
  const make = (id) => {
    const sel = el('select', { id, title: 'Which turntable is on the table' });
    for (const [k, t] of Object.entries(TABLES)) sel.append(el('option', { value: k, textContent: t.label }));
    sel.addEventListener('change', () => setTable(sel.value));
    picks.push(sel);
    return sel;
  };
  const about = el('p', { className: 'note', id: 'tableAbout' });
  // Workbench: a section of its own, first
  const bench = el('section', { id: 'tableSection' }, [el('h3', { textContent: 'Turntable' }), el('label', {}, ['Table', make('tableSel')]), about]);
  const scroll = $('#bench .scroll');
  scroll.insertBefore(bench, scroll.firstChild);
  // View panel: at its foot, after the light (the panel's own controls keep their order)
  const viewSec = el('div', { id: 'tableView' }, [el('h3', { textContent: 'Turntable' }), el('label', {}, [el('span', {}, ['Table']), make('tableSelView')])]);
  $('#scene').append(viewSec);
  function sync() {
    const k = getTable();
    for (const p of picks) if (p.value !== k) p.value = k;
    about.textContent = TABLES[k].about;
  }
  sync();
  return { sync, viewSection: viewSec };
}

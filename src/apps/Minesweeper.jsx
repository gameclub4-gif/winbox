import { useState, useRef, useEffect } from 'react';
import { useOS, useOSState } from '../os/OS.jsx';
import { MenuBar } from '../os/widgets.jsx';
import { play } from '../os/sound.js';

const LEVELS = { beginner: { r: 9, c: 9, m: 10 }, intermediate: { r: 16, c: 16, m: 40 }, expert: { r: 16, c: 30, m: 99 } };
const BEST_KEY = 'win95.minesweeper.best';
const loadBest = () => { try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (e) { return {}; } };

function emptyBoard(r, c) { return Array.from({ length: r * c }, () => ({ mine: false, open: false, flag: false, n: 0 })); }
const neighbors = (i, R, C) => { const y = Math.floor(i / C), x = i % C, o = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const ny = y + dy, nx = x + dx; if (ny >= 0 && ny < R && nx >= 0 && nx < C) o.push(ny * C + nx); } return o; };
const Mine = ({ wrong }) => (<svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 0v12M0 6h12M2 2l8 8M10 2L2 10" stroke="#000" strokeWidth="1" /><circle cx="6" cy="6" r="3.600" fill="#000" /><rect x="4.500" y="4.500" width="1.600" height="1.600" fill="#fff" />{wrong && <path d="M1 1l10 10M11 1L1 11" stroke="#f00" strokeWidth="1.600" />}</svg>);
const Flag = () => (<svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1l5 2.500-5 2.500z" fill="#f00" /><path d="M6 1v8M3 11h6" stroke="#000" strokeWidth="1.600" /></svg>);
const Face = ({ k }) => (<svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#ff0" stroke="#000" />{k === 'dead' ? <path d="M5 6l3 3M8 6L5 9M12 6l3 3M15 6l-3 3" stroke="#000" /> : k === 'cool' ? <><rect x="3.500" y="6" width="5" height="3" fill="#000" /><rect x="11.500" y="6" width="5" height="3" fill="#000" /><path d="M8 7h4" stroke="#000" /></> : <><circle cx="7" cy="8" r="1.300" fill="#000" /><circle cx="13" cy="8" r="1.300" fill="#000" /></>}{k === 'dead' ? <path d="M6 14q4-3 8 0" fill="none" stroke="#000" /> : k === 'oh' ? <circle cx="10" cy="14" r="2" fill="#000" /> : <path d="M5.500 12q4.500 5 9 0" fill="none" stroke="#000" />}</svg>);
const led = (n) => { const v = Math.max(-99, Math.min(999, n)); return (v < 0 ? '-' + String(-v).padStart(2, '0') : String(v).padStart(3, '0')); };

export default function Minesweeper({ win }) {
  const os = useOS();
  const { compact, vp } = useOSState();
  const [level, setLevel] = useState('beginner');
  const { r: R, c: C, m: M } = LEVELS[level];
  const [cells, setCells] = useState(() => emptyBoard(R, C));
  const [state, setState] = useState('ready'); // ready | playing | won | lost
  const [secs, setSecs] = useState(0);
  const [press, setPress] = useState(false);
  const S = useRef({}); S.current = { cells, state, R, C, M, level };
  const timer = useRef();
  const lp = useRef({});
  const touchAt = useRef(0);

  const reset = (lv = level) => {
    const L = LEVELS[lv];
    clearInterval(timer.current);
    setLevel(lv); setCells(emptyBoard(L.r, L.c)); setState('ready'); setSecs(0);
    os.resize(win.id, { w: L.c * 16 + 30, h: L.r * 16 + 118 });
  };
  useEffect(() => { reset('beginner'); return () => clearInterval(timer.current); }, []); // eslint-disable-line

  const startTimer = () => { clearInterval(timer.current); timer.current = setInterval(() => setSecs((s) => Math.min(999, s + 1)), 1000); };
  const place = (cs, safe) => {
    const { R: r, C: c, M: m } = S.current;
    const forbidden = new Set([safe]);
    let placed = 0;
    while (placed < m) { const i = Math.floor(Math.random() * r * c); if (!cs[i].mine && !forbidden.has(i)) { cs[i].mine = true; placed++; } }
    cs.forEach((cell, i) => { cell.n = neighbors(i, r, c).filter((j) => cs[j].mine).length; });
  };
  const finish = async (cs, won) => {
    clearInterval(timer.current);
    const { level: lv } = S.current;
    if (won) {
      cs.forEach((c) => { if (c.mine) c.flag = true; });
      setState('won'); play('win');
      const best = loadBest(); const t = Math.max(1, S.current.secs ?? 0);
      const time = secsRef.current;
      if (!best[lv] || time < best[lv].time) {
        const name = await os.prompt({ title: 'Minesweeper', label: `You have the fastest time for ${lv} level (${time}s).\nPlease enter your name:`, value: best[lv]?.name || 'Anonymous' });
        best[lv] = { time, name: name || 'Anonymous' };
        try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) { /* ignore */ }
      }
    } else { cs.forEach((c) => { if (c.mine && !c.flag) c.open = true; }); setState('lost'); play('lose'); }
    setCells([...cs]);
  };
  const secsRef = useRef(0); secsRef.current = secs;

  const reveal = (i) => {
    const s = S.current;
    if (s.state === 'won' || s.state === 'lost') return;
    let cs = s.cells.map((c) => ({ ...c }));
    if (cs[i].flag || cs[i].open) return;
    if (s.state === 'ready') { place(cs, i); setState('playing'); startTimer(); }
    if (cs[i].mine) { cs[i].boom = true; finish(cs, false); return; }
    const stack = [i];
    while (stack.length) {
      const k = stack.pop(); if (cs[k].open || cs[k].flag) continue;
      cs[k].open = true;
      if (cs[k].n === 0) neighbors(k, s.R, s.C).forEach((j) => { if (!cs[j].open && !cs[j].mine) stack.push(j); });
    }
    if (cs.every((c) => c.mine || c.open)) finish(cs, true); else setCells(cs);
  };
  const flag = (i) => {
    const s = S.current;
    if (s.state === 'won' || s.state === 'lost' || s.cells[i].open) return;
    setCells(s.cells.map((c, k) => (k === i ? { ...c, flag: !c.flag } : c)));
  };
  const chord = (i) => {
    const s = S.current; const c = s.cells[i];
    if (!c.open || c.n === 0) return;
    const nb = neighbors(i, s.R, s.C);
    if (nb.filter((j) => s.cells[j].flag).length !== c.n) return;
    const cs = s.cells.map((x) => ({ ...x }));
    let boom = false;
    const stack = [];
    nb.forEach((j) => { if (!cs[j].flag && !cs[j].open) { if (cs[j].mine) { cs[j].boom = true; boom = true; } else stack.push(j); } });
    if (boom) { finish(cs, false); return; }
    while (stack.length) {
      const k = stack.pop(); if (cs[k].open || cs[k].flag) continue;
      cs[k].open = true;
      if (cs[k].n === 0) neighbors(k, s.R, s.C).forEach((j) => { if (!cs[j].open && !cs[j].mine) stack.push(j); });
    }
    if (cs.every((x) => x.mine || x.open)) finish(cs, true); else setCells(cs);
  };
  const down = (e, i) => {
    if (S.current.state === 'won' || S.current.state === 'lost') return;
    setPress(true);
    if (e.pointerType === 'touch' || e.pointerType === 'pen') { touchAt.current = Date.now(); lp.current = { i, done: false, t: setTimeout(() => { lp.current.done = true; flag(i); navigator.vibrate?.(30); }, 450) }; }
  };
  const up = (e, i) => {
    setPress(false);
    if (lp.current.t) { clearTimeout(lp.current.t); const done = lp.current.done; lp.current = {}; if (done) return; }
    if (e.button === 0 && !e.shiftKey) { if (S.current.cells[i].open) chord(i); else reveal(i); }
    else if (e.button === 1 || (e.button === 0 && e.shiftKey)) chord(i);
  };
  const flags = cells.filter((c) => c.flag).length;
  const face = <Face k={state === 'won' ? 'cool' : state === 'lost' ? 'dead' : press ? 'oh' : 'ok'} />;
  const best = loadBest();
  const scale = compact ? Math.max(1, Math.min(2.4, (vp.w - 24) / (C * 16 + 24), (vp.h - 190) / (R * 16 + 70))) : 1;
  const showBest = () => os.msg({ icon: 'info', title: 'Fastest Mine Sweepers', text: Object.keys(LEVELS).map((l) => `${l[0].toUpperCase() + l.slice(1)}: ${best[l] ? `${best[l].time} seconds  -  ${best[l].name}` : '999 seconds  -  Anonymous'}`).join('\n') });

  return (
    <div className="app ms">
      <MenuBar menus={[
        { label: '&Game', items: [{ label: '&New', shortcut: 'F2', onClick: () => reset() }, { sep: true },
          ...Object.keys(LEVELS).map((l) => ({ label: l[0].toUpperCase() + l.slice(1), radio: true, checked: level === l, onClick: () => reset(l) })), { sep: true },
          { label: 'Best &Times...', onClick: showBest }, { sep: true }, { label: 'E&xit', onClick: () => os.close(win.id) }] },
        { label: '&Help', items: [{ label: '&How to play', onClick: () => os.msg({ icon: 'info', title: 'Minesweeper', text: 'Uncover every square that is not a mine. Numbers show how many mines touch a square.\nLeft-click: reveal. Right-click (or long-press on touch): flag.\nClick a number whose flags match it (or middle-click) to reveal its neighbours.' }) }] },
      ]} />
      <div className="ms-wrap"><div className="ms-game raised" style={{ zoom: scale }}>
        <div className="ms-head sunken">
          <div className="led">{led(M - flags)}</div>
          <button className="ms-face btn" onClick={() => reset()} aria-label="New game">{face}</button>
          <div className="led">{led(secs)}</div>
        </div>
        <div className="ms-board sunken" style={{ gridTemplateColumns: `repeat(${C}, 16px)` }} onContextMenu={(e) => e.preventDefault()}>
          {cells.map((c, i) => {
            let cls = 'mc', txt = '';
            if (c.open && !c.mine) { cls += ' open n' + c.n; txt = c.n || ''; }
            else if (c.open && c.mine) { cls += ' open mine' + (c.boom ? ' boom' : ''); txt = <Mine />; }
            else if (c.flag) { txt = state === 'lost' && !c.mine ? <Mine wrong /> : <Flag />; cls += ' closed'; }
            else cls += ' closed';
            return <div key={i} className={cls} onPointerDown={(e) => down(e, i)} onPointerUp={(e) => up(e, i)} onPointerLeave={() => { clearTimeout(lp.current.t); lp.current = {}; setPress(false); }}
              onContextMenu={(e) => { e.preventDefault(); if (e.pointerType !== 'touch' && Date.now() - touchAt.current > 1500) flag(i); }}>{txt}</div>;
          })}
        </div>
      </div></div>
    </div>
  );
}

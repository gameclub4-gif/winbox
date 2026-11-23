import { useState, useRef, useEffect } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import { Card, isRed, useCardDrag, useTableVars } from './cards.jsx';
import { play } from '../os/sound.js';

// Microsoft-compatible deal for a numbered game
function msDeal(seed) {
  let s = seed >>> 0;
  const rand = () => { s = (Math.imul(s, 214013) + 2531011) >>> 0; return (s >>> 16) & 0x7fff; };
  const cards = Array.from({ length: 52 }, (_, i) => i);
  const cols = Array.from({ length: 8 }, () => []);
  let n = 52;
  for (let i = 0; i < 52; i++) {
    const j = rand() % n;
    const id = cards[j];
    cols[i % 8].push({ r: Math.floor(id / 4), s: id % 4, id });
    cards[j] = cards[--n];
  }
  return { cells: [null, null, null, null], found: [[], [], [], []], cols };
}
const top = (a) => a[a.length - 1];
const seq = (a, i) => { for (let k = i; k < a.length - 1; k++) if (!(a[k].r === a[k + 1].r + 1 && isRed(a[k].s) !== isRed(a[k + 1].s))) return false; return true; };
const clone = (s) => ({ cells: [...s.cells], found: s.found.map((a) => [...a]), cols: s.cols.map((a) => [...a]) });

export default function FreeCell({ win, active }) {
  const os = useOS();
  const [no, setNo] = useState(() => 1 + Math.floor(Math.random() * 32000));
  const [g, setG] = useState(() => msDeal(no));
  const [moves, setMoves] = useState(0);
  const [sel, setSel] = useState(null);
  const hist = useRef([]);
  const tref = useRef();
  useTableVars(tref, 8);
  const cur = useRef(g); cur.current = g;

  const load = (n) => { hist.current = []; setNo(n); setG(msDeal(n)); setMoves(0); setSel(null); };
  const undo = () => { const p = hist.current.pop(); if (p) { setG(p); setMoves((m) => Math.max(0, m - 1)); setSel(null); } };
  const commit = (n) => {
    hist.current.push(cur.current); setG(n); setMoves((m) => m + 1); setSel(null);
    if (n.found.every((f) => f.length === 13)) { play('win'); os.msg({ icon: 'info', title: 'FreeCell', text: `Congratulations! You won game #${no} in ${moves + 1} moves.` }); }
  };
  const cardsAt = (s, src) => (src.pile[0] === 'z' ? (s.cells[+src.pile[1]] ? [s.cells[+src.pile[1]]] : []) : src.pile[0] === 'c' ? s.cols[+src.pile[1]].slice(src.index) : []);
  const maxMove = (s, toEmpty) => { const free = s.cells.filter((c) => !c).length; const empt = s.cols.filter((c) => !c.length).length - (toEmpty ? 1 : 0); return (free + 1) * Math.pow(2, Math.max(0, empt)); };

  const tryMove = (src, dst) => {
    const s = cur.current;
    if (src.pile === dst) return false;
    const cards = cardsAt(s, src);
    if (!cards.length) return false;
    if (src.pile[0] === 'c' && !seq(s.cols[+src.pile[1]], src.index)) return false;
    const n = clone(s);
    const remove = () => { if (src.pile[0] === 'z') n.cells[+src.pile[1]] = null; else n.cols[+src.pile[1]].splice(src.index); };
    if (dst[0] === 'c') {
      const col = n.cols[+dst[1]];
      if (cards.length > maxMove(s, col.length === 0)) return false;
      if (col.length && !(top(col).r === cards[0].r + 1 && isRed(top(col).s) !== isRed(cards[0].s))) return false;
      remove(); col.push(...cards);
    } else if (dst[0] === 'z') {
      const zi = +dst[1];
      if (cards.length !== 1 || n.cells[zi]) { const free = n.cells.findIndex((c) => !c); if (cards.length !== 1 || free < 0 || dst !== 'z' + zi) return false; remove(); n.cells[free] = cards[0]; }
      else { remove(); n.cells[zi] = cards[0]; }
    } else if (dst[0] === 'f') {
      if (cards.length !== 1) return false;
      const c = cards[0], f = n.found[c.s];
      if (f.length !== c.r) return false;
      remove(); f.push(c);
    } else return false;
    commit(n); return true;
  };
  const autoMove = (src) => {
    const s = cur.current, cards = cardsAt(s, src);
    if (cards.length !== 1) return;
    if (tryMove(src, 'f0')) return;
    if (src.pile[0] === 'c') { const z = s.cells.findIndex((c) => !c); if (z >= 0) tryMove(src, 'z' + z); }
    else for (let i = 0; i < 8; i++) if (tryMove(src, 'c' + i)) return;
  };
  const { start, drag, ghost } = useCardDrag({
    getCards: (src) => { const s = cur.current; const c = cardsAt(s, src); if (!c.length) return []; if (src.pile[0] === 'c' && !seq(s.cols[+src.pile[1]], src.index)) return []; return c; },
    onDrop: (src, dst) => tryMove(src, dst),
    onTap: (src) => {
      if (sel && sel.pile !== src.pile) { if (!tryMove(sel, src.pile)) setSel(src); }
      else setSel(sel && sel.pile === src.pile && sel.index === src.index ? null : src);
    },
    onDouble: (src) => autoMove(src),
  });
  const hideFrom = (pile, i) => drag && drag.src.pile === pile && i >= drag.src.index;
  const isSel = (pile, i) => sel && sel.pile === pile && i >= sel.index;
  const emptyClick = (dst) => (e) => { if (e.target === e.currentTarget && sel) { tryMove(sel, dst); } };
  useEffect(() => {
    if (!active) return;
    const h = (e) => { if (e.key === 'F2') { e.preventDefault(); load(1 + Math.floor(Math.random() * 32000)); } else if (e.ctrlKey && e.key.toLowerCase() === 'z') undo(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });
  useEffect(() => { os.setTitle(win.id, `FreeCell - Game #${no}`); }, [no, win.id, os]);

  const select = async () => {
    const v = await os.prompt({ title: 'Select Game', label: 'Game number (1 - 32000):', value: String(no) });
    const n = parseInt(v, 10);
    if (n >= 1 && n <= 32000) load(n); else if (v != null) os.msg({ icon: 'warning', text: 'Please enter a number from 1 to 32000.' });
  };
  const menus = [
    { label: '&Game', items: [{ label: '&New Game', shortcut: 'F2', onClick: () => load(1 + Math.floor(Math.random() * 32000)) }, { label: '&Select Game...', onClick: select }, { label: '&Restart Game', onClick: () => load(no) }, { sep: true }, { label: '&Undo', shortcut: 'Ctrl+Z', disabled: !hist.current.length, onClick: undo }, { sep: true }, { label: 'E&xit', onClick: () => os.close(win.id) }] },
    { label: '&Help', items: [{ label: '&How to play', onClick: () => os.msg({ icon: 'info', title: 'FreeCell', text: 'Move all cards to the four foundation piles, Ace to King by suit.\nBuild down in alternating colours on the eight columns.\nThe four cells at the top-left can each hold one card.\nDrag cards or click a card and then its destination. Double-click sends a card to a foundation or a free cell.' }) }] },
  ];
  return (
    <div className="app">
      <MenuBar menus={menus} />
      <div className="cardtable felt" ref={tref}><div className="table-inner fc">
        <div className="row-top">
          {g.cells.map((c, i) => (
            <div key={i} className="pile" data-pile={'z' + i} onClick={emptyClick('z' + i)}>
              {!c && <div className="slot" />}
              {c && <Card card={c} className="abs" sel={isSel('z' + i, 0)} hidden={hideFrom('z' + i, 0)} onPointerDown={(e) => start(e, { pile: 'z' + i, index: 0 })} />}
            </div>
          ))}
          <div className="spacer" style={{ width: 'calc(var(--cw) * 0.3)' }} />
          {g.found.map((f, i) => (
            <div key={i} className="pile" data-pile={'f' + i} onClick={emptyClick('f' + i)}>
              {!f.length && <div className="slot">{['♣', '♦', '♥', '♠'][i]}</div>}
              {f.length > 0 && <>{f.length > 1 && <Card card={f[f.length - 2]} className="abs" />}<Card card={top(f)} className="abs" /></>}
            </div>
          ))}
        </div>
        <div className="row-tab">
          {g.cols.map((col, ci) => (
            <div key={ci} className="pile tabpile" data-pile={'c' + ci} onClick={emptyClick('c' + ci)} style={{ minHeight: 'var(--ch)' }}>
              {col.map((c, i) => <Card key={c.id} card={c} className="abs" style={{ top: `calc(var(--oy) * ${i})` }} sel={isSel('c' + ci, i)} hidden={hideFrom('c' + ci, i)}
                onPointerDown={(e) => start(e, { pile: 'c' + ci, index: i })} />)}
            </div>
          ))}
        </div>
      </div>{ghost}</div>
      <StatusBar><span>Game #{no}</span><span>Moves: {moves}</span><span>Cards left: {52 - g.found.reduce((a, f) => a + f.length, 0)}</span></StatusBar>
    </div>
  );
}

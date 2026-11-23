import { useState, useRef, useEffect } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import { Card, makeDeck, shuffle, isRed, useCardDrag, useTableVars } from './cards.jsx';
import { play } from '../os/sound.js';

const clone = (s) => ({ ...s, stock: [...s.stock], waste: [...s.waste], found: s.found.map((a) => [...a]), tab: s.tab.map((a) => [...a]) });
function deal() {
  const d = shuffle(makeDeck()).map((c) => ({ ...c, up: false }));
  const tab = [];
  for (let i = 0; i < 7; i++) { const col = d.splice(0, i + 1); col[col.length - 1] = { ...col[col.length - 1], up: true }; tab.push(col); }
  return { stock: d, waste: [], found: [[], [], [], []], tab, score: 0, moves: 0 };
}
const top = (a) => a[a.length - 1];
const canTab = (c, pile) => (pile.length === 0 ? c.r === 12 : top(pile).up && top(pile).r === c.r + 1 && isRed(top(pile).s) !== isRed(c.s));
const canFound = (c, pile) => (pile.length === 0 ? c.r === 0 : top(pile).s === c.s && top(pile).r + 1 === c.r);

export default function Solitaire({ win, active }) {
  const os = useOS();
  const [g, setG] = useState(deal);
  const [draw3, setDraw3] = useState(false);
  const [secs, setSecs] = useState(0);
  const [won, setWon] = useState(false);
  const hist = useRef([]);
  const tref = useRef();
  useTableVars(tref, 7);
  const started = useRef(false);
  const cur = useRef(g); cur.current = g;
  const d3 = useRef(draw3); d3.current = draw3;

  useEffect(() => { const t = setInterval(() => { if (started.current && !won) setSecs((s) => s + 1); }, 1000); return () => clearInterval(t); }, [won]);

  const commit = (n) => {
    hist.current.push(cur.current); if (hist.current.length > 200) hist.current.shift();
    started.current = true;
    setG(n);
    if (n.found.every((f) => f.length === 13)) { setWon(true); play('win'); os.msg({ icon: 'info', title: 'Solitaire', text: `Congratulations, you won!\nScore: ${n.score}   Time: ${secs}s` }); }
  };
  const newGame = () => { hist.current = []; started.current = false; setSecs(0); setWon(false); setG(deal()); };
  const undo = () => { const p = hist.current.pop(); if (p) { setG(p); setWon(false); } };
  const flipTop = (n, i) => { const col = n.tab[i]; if (col.length && !top(col).up) { col[col.length - 1] = { ...top(col), up: true }; n.score += 5; } };

  const take = (n, src) => {
    if (src.pile === 'w') return [n.waste.pop()];
    if (src.pile[0] === 'f') return [n.found[+src.pile[1]].pop()];
    return n.tab[+src.pile[1]].splice(src.index);
  };
  const cardsOf = (s, src) => (src.pile === 'w' ? (s.waste.length ? [top(s.waste)] : []) : src.pile[0] === 'f' ? (s.found[+src.pile[1]].length ? [top(s.found[+src.pile[1]])] : []) : s.tab[+src.pile[1]].slice(src.index));

  const tryMove = (src, dst) => {
    const s = cur.current;
    if (src.pile === dst) return false;
    const cards = cardsOf(s, src);
    if (!cards.length || !cards[0].up) return false;
    const n = clone(s);
    if (dst[0] === 't') {
      const ti = +dst[1];
      if (!canTab(cards[0], n.tab[ti])) return false;
      const moved = take(n, src); n.tab[ti].push(...moved);
      if (src.pile === 'w') n.score += 5; else if (src.pile[0] === 'f') n.score = Math.max(0, n.score - 15);
      if (src.pile[0] === 't') flipTop(n, +src.pile[1]);
    } else if (dst[0] === 'f') {
      if (cards.length !== 1) return false;
      const fi = +dst[1];
      if (!canFound(cards[0], n.found[fi])) return false;
      const moved = take(n, src); n.found[fi].push(...moved);
      n.score += 10;
      if (src.pile[0] === 't') flipTop(n, +src.pile[1]);
    } else return false;
    n.moves++; commit(n); return true;
  };
  const autoMove = (src) => {
    const s = cur.current, cards = cardsOf(s, src);
    if (cards.length !== 1 && src.pile[0] !== 't') return;
    if (!cards.length) return;
    for (let i = 0; i < 4; i++) if (cards.length === 1 && tryMove(src, 'f' + i)) return;
    if (cards.length === 1 && src.pile === 'w') for (let i = 0; i < 7; i++) if (tryMove(src, 't' + i)) return;
  };
  const dealStock = () => {
    const n = clone(cur.current);
    if (n.stock.length) { const k = Math.min(d3.current ? 3 : 1, n.stock.length); for (let i = 0; i < k; i++) n.waste.push({ ...n.stock.pop(), up: true }); }
    else if (n.waste.length) { n.stock = n.waste.reverse().map((c) => ({ ...c, up: false })); n.waste = []; n.score = Math.max(0, n.score - (d3.current ? 0 : 100)); }
    else return;
    commit(n);
  };

  const [selSrc, setSelSrc] = useState(null);
  const { start, drag, ghost } = useCardDrag({
    getCards: (src) => cardsOf(cur.current, src).filter((c) => c.up),
    onDrop: (src, dst) => { setSelSrc(null); tryMove(src, dst); },
    onTap: (src) => {
      if (selSrc && selSrc.pile !== src.pile) { const dst = src.pile; if (!tryMove(selSrc, dst)) setSelSrc(cardsOf(cur.current, src)[0]?.up ? src : null); else setSelSrc(null); }
      else setSelSrc(selSrc && selSrc.pile === src.pile && selSrc.index === src.index ? null : cardsOf(cur.current, src)[0]?.up ? src : null);
    },
    onDouble: (src) => { setSelSrc(null); autoMove(src); },
  });
  const hideFrom = (pile, i) => drag && drag.src.pile === pile && i >= drag.src.index;
  const isSel = (pile, i) => selSrc && selSrc.pile === pile && i >= selSrc.index;
  const emptyClick = (dst) => (e) => { if (e.target === e.currentTarget && selSrc) { tryMove(selSrc, dst); setSelSrc(null); } };

  const menus = [
    { label: '&Game', items: [{ label: '&Deal', shortcut: 'F2', onClick: newGame }, { label: '&Undo', shortcut: 'Ctrl+Z', disabled: !hist.current.length, onClick: undo }, { sep: true },
      { label: 'Draw &One', radio: true, checked: !draw3, onClick: () => { setDraw3(false); newGame(); } }, { label: 'Draw &Three', radio: true, checked: draw3, onClick: () => { setDraw3(true); newGame(); } }, { sep: true }, { label: 'E&xit', onClick: () => os.close(win.id) }] },
    { label: '&Help', items: [{ label: '&How to play', onClick: () => os.msg({ icon: 'info', title: 'Solitaire', text: 'Build the four foundation piles from Ace to King in suit.\nBuild down in alternating colours on the seven columns.\nDrag cards, or click a card then its destination. Double-click sends a card to a foundation.\nClick the deck to turn over cards.' }) }] },
  ];
  useEffect(() => {
    if (!active) return;
    const h = (e) => { if (e.key === 'F2') { e.preventDefault(); newGame(); } else if (e.ctrlKey && e.key.toLowerCase() === 'z') undo(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });

  return (
    <div className="app">
      <MenuBar menus={menus} />
      <div className="cardtable felt" ref={tref}><div className="table-inner">
        <div className="row-top">
          <div className="pile" data-pile="stock" onClick={dealStock}>
            {g.stock.length ? <Card card={top(g.stock)} up={false} /> : <div className="slot recycle">↺</div>}
          </div>
          <div className="pile waste" data-pile="w">
            {g.waste.slice(-(draw3 ? 3 : 1)).map((c, k, arr) => {
              const i = g.waste.length - arr.length + k;
              return <Card key={c.id} card={c} style={{ left: `calc(var(--cw) * 0.3 * ${k})` }} className="abs" sel={isSel('w', 0) && i === g.waste.length - 1} hidden={drag?.src.pile === 'w' && i === g.waste.length - 1}
                onPointerDown={i === g.waste.length - 1 ? (e) => start(e, { pile: 'w', index: 0 }) : undefined} />;
            })}
          </div>
          <div className="spacer" />
          {g.found.map((f, i) => (
            <div key={i} className="pile" data-pile={'f' + i} onClick={emptyClick('f' + i)}>
              {!f.length && <div className="slot">A</div>}
              {f.length > 0 && <>{f.length > 1 && <Card card={f[f.length - 2]} className="abs" />}<Card card={top(f)} className="abs" hidden={hideFrom('f' + i, 0)} onPointerDown={(e) => start(e, { pile: 'f' + i, index: 0 })} sel={isSel('f' + i, 0)} /></>}
            </div>
          ))}
        </div>
        <div className="row-tab">
          {g.tab.map((col, ci) => {
            let up = 0, down = 0;
            return (
              <div key={ci} className="pile tabpile" data-pile={'t' + ci} onClick={emptyClick('t' + ci)} style={{ minHeight: 'var(--ch)' }}>
                {!col.length && <div className="slot">K</div>}
                {col.map((c, i) => {
                  const topv = `calc(var(--oy) * ${up} + var(--oyd) * ${down})`;
                  c.up ? up++ : down++;
                  return <Card key={c.id} card={c} up={c.up} className="abs" style={{ top: topv }} sel={isSel('t' + ci, i)} hidden={hideFrom('t' + ci, i)}
                    onPointerDown={c.up ? (e) => start(e, { pile: 't' + ci, index: i }) : undefined} />;
                })}
              </div>
            );
          })}
        </div>
      </div>{ghost}</div>
      <StatusBar><span>Score: {g.score}</span><span>Time: {secs}</span><span>Stock: {g.stock.length}</span></StatusBar>
    </div>
  );
}

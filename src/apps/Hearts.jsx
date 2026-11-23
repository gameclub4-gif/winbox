import { useState, useRef, useEffect } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import { Card, makeDeck, shuffle, useTableVars } from './cards.jsx';
import { play } from '../os/sound.js';

const NAMES = ['You', 'West', 'North', 'East'];
const DIRS = ['left', 'right', 'across', 'none'];
const pts = (c) => (c.s === 2 ? 1 : c.s === 3 && c.r === 11 ? 13 : 0);
const isQS = (c) => c.s === 3 && c.r === 11;
const sortHand = (h) => [...h].sort((a, b) => a.s - b.s || a.r - b.r);

function newGame() { const g = { scores: [0, 0, 0, 0], round: 0 }; newRound(g); return g; }
function newRound(g) {
  const d = shuffle(makeDeck());
  g.hands = [0, 1, 2, 3].map((i) => sortHand(d.slice(i * 13, i * 13 + 13)));
  g.passDir = g.round % 4;
  g.selected = []; g.received = []; g.taken = [[], [], [], []]; g.trick = []; g.broken = false; g.trickNo = 0; g.summary = null;
  g.msg = '';
  if (g.passDir === 3) startPlay(g); else { g.phase = 'pass'; g.msg = `Select 3 cards to pass ${DIRS[g.passDir]}, then press Pass.`; }
}
function startPlay(g) {
  g.phase = 'play';
  g.leader = g.turn = g.hands.findIndex((h) => h.some((c) => c.s === 0 && c.r === 1));
  g.msg = g.turn === 0 ? 'You lead the 2 of clubs.' : `${NAMES[g.turn]} has the 2 of clubs.`;
}
function legal(g, p) {
  const h = g.hands[p];
  if (!g.trick.length) {
    if (g.trickNo === 0) return h.filter((c) => c.s === 0 && c.r === 1);
    if (!g.broken) { const nh = h.filter((c) => c.s !== 2); if (nh.length) return nh; }
    return h;
  }
  const lead = g.trick[0].card.s, f = h.filter((c) => c.s === lead);
  if (f.length) return f;
  if (g.trickNo === 0) { const safe = h.filter((c) => c.s !== 2 && !isQS(c)); if (safe.length) return safe; }
  return h;
}
const danger = (c) => (isQS(c) ? 100 : c.s === 3 && c.r >= 11 ? 60 + c.r : c.s === 2 ? 30 + c.r : c.r);
function aiChoose(g, p) {
  const L = legal(g, p);
  if (L.length === 1) return L[0];
  if (!g.trick.length) {
    const nonH = L.filter((c) => c.s !== 2), pool = nonH.length ? nonH : L;
    const p2 = pool.filter((c) => !(c.s === 3 && c.r >= 11)), use = p2.length ? p2 : pool;
    return [...use].sort((a, b) => a.r - b.r)[0];
  }
  const lead = g.trick[0].card.s, follow = L.filter((c) => c.s === lead);
  if (follow.length) {
    const win = Math.max(...g.trick.filter((t) => t.card.s === lead).map((t) => t.card.r));
    const tp = g.trick.reduce((a, t) => a + pts(t.card), 0);
    const lower = follow.filter((c) => c.r < win).sort((a, b) => b.r - a.r);
    if (lower.length) return lower[0];
    if (g.trick.length === 3 && tp === 0) { const s = follow.filter((c) => !isQS(c)).sort((a, b) => b.r - a.r); if (s.length) return s[0]; }
    const s = follow.filter((c) => !isQS(c));
    return [...(s.length ? s : follow)].sort((a, b) => a.r - b.r)[0];
  }
  const qs = L.find(isQS); if (qs) return qs;
  const hs = L.filter((c) => c.s === 2).sort((a, b) => b.r - a.r); if (hs.length) return hs[0];
  return [...L].sort((a, b) => b.r - a.r)[0];
}

export default function Hearts({ win }) {
  const os = useOS();
  const G = useRef(null);
  if (!G.current) G.current = newGame();
  const tref = useRef();
  useTableVars(tref, 7);
  const [tick, setTick] = useState(0);
  const force = () => setTick((t) => t + 1);
  const g = G.current;

  const playCard = (p, card) => {
    g.hands[p] = g.hands[p].filter((c) => c.id !== card.id);
    g.trick.push({ p, card });
    if (card.s === 2) g.broken = true;
    if (g.trick.length === 4) {
      const lead = g.trick[0].card.s;
      const w = g.trick.filter((t) => t.card.s === lead).sort((a, b) => b.card.r - a.card.r)[0];
      g.winner = w.p; g.phase = 'trickdone'; g.msg = `${NAMES[w.p]} ${w.p === 0 ? 'take' : 'takes'} the trick.`;
    } else { g.turn = (p + 1) % 4; g.msg = g.turn === 0 ? 'Your turn.' : `${NAMES[g.turn]} is thinking...`; }
    force();
  };
  const collect = () => {
    g.taken[g.winner].push(...g.trick.map((t) => t.card));
    g.trick = []; g.trickNo++;
    if (g.trickNo === 13) endRound(); else { g.phase = 'play'; g.turn = g.leader = g.winner; g.msg = g.turn === 0 ? 'Your lead.' : `${NAMES[g.turn]} leads.`; }
    force();
  };
  const endRound = () => {
    const raw = g.taken.map((t) => t.reduce((a, c) => a + pts(c), 0));
    const moon = raw.findIndex((x) => x === 26);
    const add = moon >= 0 ? raw.map((_, i) => (i === moon ? 0 : 26)) : raw;
    g.scores = g.scores.map((s, i) => s + add[i]);
    g.summary = { raw, add, moon };
    const over = g.scores.some((s) => s >= 100);
    g.phase = over ? 'gameover' : 'roundover';
    if (over) { const min = Math.min(...g.scores); g.msg = g.scores[0] === min ? 'Game over - you win!' : 'Game over.'; play(g.scores[0] === min ? 'win' : 'lose'); }
    else g.msg = 'Round over.';
  };
  const doPass = () => {
    const sel = g.selected.map((id) => g.hands[0].find((c) => c.id === id));
    const out = [sel, ...[1, 2, 3].map((p) => [...g.hands[p]].sort((a, b) => danger(b) - danger(a)).slice(0, 3))];
    const off = g.passDir === 0 ? 1 : g.passDir === 1 ? 3 : 2;
    const hands = g.hands.map((h, p) => h.filter((c) => !out[p].some((o) => o.id === c.id)));
    out.forEach((cards, p) => { hands[(p + off) % 4].push(...cards); });
    g.received = out[(0 - off + 4) % 4].map((c) => c.id);
    g.hands = hands.map(sortHand); g.selected = [];
    startPlay(g); force();
  };
  const click = (c) => {
    if (g.phase === 'pass') {
      g.selected = g.selected.includes(c.id) ? g.selected.filter((x) => x !== c.id) : g.selected.length < 3 ? [...g.selected, c.id] : g.selected;
      force();
    } else if (g.phase === 'play' && g.turn === 0) {
      if (legal(g, 0).some((x) => x.id === c.id)) playCard(0, c);
      else { g.msg = g.trick.length ? 'You must follow suit.' : g.trickNo === 0 ? 'Lead the 2 of clubs.' : 'Hearts have not been broken.'; force(); }
    }
  };
  useEffect(() => {
    let t;
    if (g.phase === 'play' && g.turn !== 0) t = setTimeout(() => playCard(g.turn, aiChoose(g, g.turn)), 650);
    else if (g.phase === 'trickdone') t = setTimeout(collect, 1100);
    return () => clearTimeout(t);
  }, [tick]); // eslint-disable-line
  const nextRound = () => { g.round++; newRound(g); force(); };
  const restart = () => { G.current = newGame(); force(); };
  const scoreText = () => NAMES.map((n, i) => `${n}: ${g.scores[i]}`).join('    ');
  const L = g.phase === 'play' && g.turn === 0 ? legal(g, 0).map((c) => c.id) : [];

  const menus = [
    { label: '&Game', items: [{ label: '&New Game', shortcut: 'F2', onClick: restart }, { label: '&Scores...', onClick: () => os.msg({ icon: 'info', title: 'Hearts - Scores', text: NAMES.map((n, i) => `${n}: ${g.scores[i]}`).join('\n') + `\n\nRound ${g.round + 1}` }) }, { sep: true }, { label: 'E&xit', onClick: () => os.close(win.id) }] },
    { label: '&Help', items: [{ label: '&How to play', onClick: () => os.msg({ icon: 'info', title: 'Hearts', width: 420, text: 'Avoid taking hearts (1 point each) and the Queen of Spades (13 points). Lowest score wins when someone reaches 100.\n\nPass three cards each hand (left, right, across, none). The player with the 2 of clubs leads. Follow suit if you can. Hearts cannot be led until a heart has been played. If one player takes every heart and the Queen of Spades ("shoots the moon") everyone else gets 26.' }) }] },
  ];
  const trickPos = { 0: 'tp-s', 1: 'tp-w', 2: 'tp-n', 3: 'tp-e' };
  return (
    <div className="app">
      <MenuBar menus={menus} />
      <div className="cardtable felt" ref={tref}><div className="table-inner hearts">
        {[2, 1, 3].map((p) => (
          <div key={p} className={'h-opp h-' + ['s', 'w', 'n', 'e'][p]}>
            <div className="h-name">{NAMES[p]} <b>({g.scores[p]})</b></div>
            <div className={'h-stack ' + (p === 2 ? 'horiz' : 'vert')}>
              {g.hands[p].map((c, i) => <Card key={c.id} card={c} up={false} style={p === 2 ? { left: `calc(var(--cw) * 0.22 * ${i})` } : { top: `calc(var(--cw) * 0.22 * ${i})` }} className="abs" />)}
            </div>
          </div>
        ))}
        <div className="h-center">
          {g.trick.map((t) => <Card key={t.card.id} card={t.card} className={'abs ' + trickPos[t.p]} />)}
          {g.phase === 'pass' && <button className="btn default h-btn" disabled={g.selected.length !== 3} onClick={doPass}>Pass {g.selected.length}/3 {DIRS[g.passDir]}</button>}
          {g.phase === 'roundover' && <div className="h-sum raised"><b>Round {g.round + 1} complete</b>{g.summary.moon >= 0 && <div>{NAMES[g.summary.moon]} shot the moon!</div>}{NAMES.map((n, i) => <div key={i}>{n}: +{g.summary.add[i]} (total {g.scores[i]})</div>)}<button className="btn default" onClick={nextRound}>Next round</button></div>}
          {g.phase === 'gameover' && <div className="h-sum raised"><b>{g.msg}</b>{NAMES.map((n, i) => <div key={i}>{n}: {g.scores[i]}</div>)}<button className="btn default" onClick={restart}>New game</button></div>}
        </div>
        <div className="h-you">
          <div className="h-name">You <b>({g.scores[0]})</b></div>
          <div className="h-hand">
            {g.hands[0].map((c, i) => {
              const sel = g.selected.includes(c.id), ok = g.phase === 'pass' || L.includes(c.id);
              return <Card key={c.id} card={c} className={'abs hand-card ' + (sel ? 'lift ' : '') + (g.received.includes(c.id) && g.phase !== 'pass' && g.trickNo === 0 ? 'recv ' : '') + (ok ? '' : 'dim')}
                style={{ left: `calc(var(--cw) * 0.4 * ${i})` }} onClick={() => click(c)} />;
            })}
          </div>
        </div>
      </div></div>
      <StatusBar><span>{g.msg}</span><span>Round {g.round + 1} · {DIRS[g.passDir]}</span><span>{scoreText()}</span></StatusBar>
    </div>
  );
}

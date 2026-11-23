import { useState, useRef, useEffect } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar } from '../os/widgets.jsx';
import { play } from '../os/sound.js';

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], O: [[1, 1], [1, 1]], T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
const COLORS = { I: '#00e0e0', O: '#e8e800', T: '#b030e0', S: '#00d000', Z: '#e82020', J: '#2040f0', L: '#f09000' };
const W = 10, H = 20, CELL = 24;
const rot = (m) => m[0].map((_, i) => m.map((r) => r[i]).reverse());
const rotCCW = (m) => m[0].map((_, i) => m.map((r) => r[r.length - 1 - i]));
const collides = (b, m, x, y) => m.some((row, j) => row.some((v, i) => v && (x + i < 0 || x + i >= W || y + j >= H || (y + j >= 0 && b[y + j][x + i]))));
const HI = 'win95.tetris.high';

function fresh() { return { board: Array.from({ length: H }, () => Array(W).fill(null)), bag: [], piece: null, next: null, score: 0, lines: 0, level: 0, over: false, paused: false, acc: 0 }; }
function draw7(t) { if (t.bag.length < 2) t.bag.push(...[...'IOTSZJL'].sort(() => Math.random() - 0.5)); return t.bag.shift(); }
function spawn(t) {
  const type = t.next || draw7(t); t.next = draw7(t);
  const m = SHAPES[type].map((r) => [...r]);
  t.piece = { type, m, x: Math.floor((W - m[0].length) / 2), y: type === 'I' ? -1 : 0 };
  if (collides(t.board, m, t.piece.x, t.piece.y)) { t.over = true; }
}

export default function Tetris({ win, active }) {
  const os = useOS();
  const T = useRef(null);
  if (!T.current) { T.current = fresh(); spawn(T.current); }
  const cv = useRef(), nx = useRef();
  const [hud, setHud] = useState({ score: 0, lines: 0, level: 0, over: false, paused: false, next: 'T' });
  const [high, setHigh] = useState(() => +localStorage.getItem(HI) || 0);
  const sync = () => { const t = T.current; setHud({ score: t.score, lines: t.lines, level: t.level, over: t.over, paused: t.paused, next: t.next }); };

  const lock = () => {
    const t = T.current, p = t.piece;
    p.m.forEach((row, j) => row.forEach((v, i) => { if (v && p.y + j >= 0) t.board[p.y + j][p.x + i] = p.type; }));
    const keep = t.board.filter((r) => r.some((c) => !c));
    const n = H - keep.length;
    if (n) {
      t.board = [...Array.from({ length: n }, () => Array(W).fill(null)), ...keep];
      t.score += [0, 100, 300, 500, 800][n] * (t.level + 1); t.lines += n; t.level = Math.floor(t.lines / 10);
      play('click');
    }
    spawn(t);
    if (t.over) { play('lose'); const h = Math.max(+localStorage.getItem(HI) || 0, t.score); try { localStorage.setItem(HI, h); } catch (e) { /* ignore */ } setHigh(h); }
    sync();
  };
  const move = (dx) => { const t = T.current; if (t.over || t.paused) return; const p = t.piece; if (!collides(t.board, p.m, p.x + dx, p.y)) { p.x += dx; } };
  const down = (user) => { const t = T.current; if (t.over || t.paused) return false; const p = t.piece; if (!collides(t.board, p.m, p.x, p.y + 1)) { p.y++; if (user) { t.score += 1; } return true; } lock(); return false; };
  const rotate = (ccw) => {
    const t = T.current; if (t.over || t.paused) return; const p = t.piece;
    if (p.type === 'O') return;
    const m = ccw ? rotCCW(p.m) : rot(p.m);
    for (const k of [0, -1, 1, -2, 2]) if (!collides(t.board, m, p.x + k, p.y)) { p.m = m; p.x += k; return; }
    if (!collides(t.board, m, p.x, p.y - 1)) { p.m = m; p.y--; }
  };
  const hard = () => { const t = T.current; if (t.over || t.paused) return; const p = t.piece; let d = 0; while (!collides(t.board, p.m, p.x, p.y + 1)) { p.y++; d++; } t.score += d * 2; lock(); };
  const reset = () => { T.current = fresh(); spawn(T.current); sync(); };
  const pause = () => { const t = T.current; if (t.over) return; t.paused = !t.paused; sync(); };

  useEffect(() => {
    let raf, last = performance.now();
    const loop = (now) => {
      const t = T.current, dt = Math.min(100, now - last); last = now;
      if (!t.over && !t.paused) { t.acc += dt; const iv = Math.max(70, 820 - t.level * 70); while (t.acc >= iv) { t.acc -= iv; if (!down(false)) break; if (t.over) break; } if (t.score !== undefined) { /* hud sync on score change */ } }
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const hs = setInterval(sync, 400);
    return () => { cancelAnimationFrame(raf); clearInterval(hs); };
  }, []); // eslint-disable-line

  const block = (g, x, y, color, a = 1, s = CELL) => {
    g.globalAlpha = a; g.fillStyle = color; g.fillRect(x, y, s, s);
    g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(x, y, s, 3); g.fillRect(x, y, 3, s);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y + s - 3, s, 3); g.fillRect(x + s - 3, y, 3, s);
    g.globalAlpha = 1;
  };
  const render = () => {
    const c = cv.current; if (!c) return;
    const g = c.getContext('2d'), t = T.current;
    g.fillStyle = '#000'; g.fillRect(0, 0, W * CELL, H * CELL);
    g.strokeStyle = '#161616'; g.lineWidth = 1;
    for (let i = 1; i < W; i++) { g.beginPath(); g.moveTo(i * CELL + 0.5, 0); g.lineTo(i * CELL + 0.5, H * CELL); g.stroke(); }
    for (let j = 1; j < H; j++) { g.beginPath(); g.moveTo(0, j * CELL + 0.5); g.lineTo(W * CELL, j * CELL + 0.5); g.stroke(); }
    t.board.forEach((row, j) => row.forEach((v, i) => { if (v) block(g, i * CELL, j * CELL, COLORS[v]); }));
    const p = t.piece;
    if (p && !t.over) {
      let gy = p.y; while (!collides(t.board, p.m, p.x, gy + 1)) gy++;
      p.m.forEach((row, j) => row.forEach((v, i) => { if (v) { block(g, (p.x + i) * CELL, (gy + j) * CELL, COLORS[p.type], 0.22); } }));
      p.m.forEach((row, j) => row.forEach((v, i) => { if (v && p.y + j >= 0) block(g, (p.x + i) * CELL, (p.y + j) * CELL, COLORS[p.type]); }));
    }
    const n = nx.current;
    if (n && t.next) {
      const ng = n.getContext('2d'); ng.fillStyle = '#000'; ng.fillRect(0, 0, 80, 80);
      const m = SHAPES[t.next], s = 16, ox = (80 - m[0].length * s) / 2, oy = (80 - m.length * s) / 2;
      m.forEach((row, j) => row.forEach((v, i) => { if (v) block(ng, ox + i * s, oy + j * s, COLORS[t.next], 1, s); }));
    }
  };

  useEffect(() => {
    if (!active) return;
    const h = (e) => {
      if (e.target.closest?.('input,textarea')) return;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a') { e.preventDefault(); move(-1); }
      else if (k === 'ArrowRight' || k === 'd') { e.preventDefault(); move(1); }
      else if (k === 'ArrowDown' || k === 's') { e.preventDefault(); down(true); }
      else if (k === 'ArrowUp' || k === 'w' || k === 'x') { e.preventDefault(); rotate(false); }
      else if (k === 'z' || k === 'Control') rotate(true);
      else if (k === ' ') { e.preventDefault(); hard(); }
      else if (k === 'p' || k === 'P' || k === 'Escape') pause();
      else if (k === 'F2') { e.preventDefault(); reset(); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });
  useEffect(() => { if (!active && !T.current.over && !T.current.paused) { T.current.paused = true; sync(); } }, [active]); // eslint-disable-line

  const Btn = ({ l, f, t }) => <button className="btn tool tbtn" title={t} onPointerDown={(e) => { e.preventDefault(); f(); }}>{l}</button>;
  return (
    <div className="app tetris">
      <MenuBar menus={[
        { label: '&Game', items: [{ label: '&New Game', shortcut: 'F2', onClick: reset }, { label: '&Pause', shortcut: 'P', checked: hud.paused, onClick: pause }, { sep: true }, { label: 'E&xit', onClick: () => os.close(win.id) }] },
        { label: '&Help', items: [{ label: '&Controls', onClick: () => os.msg({ icon: 'info', title: 'Tetris', text: 'Left/Right (or A/D): move\nUp (or W/X): rotate clockwise, Z: counter-clockwise\nDown (or S): soft drop\nSpace: hard drop\nP: pause, F2: new game\n\nClear lines to score and level up.' }) }] },
      ]} />
      <div className="tetris-main">
        <div className="tetris-board sunken">
          <canvas ref={cv} width={W * CELL} height={H * CELL} />
          {(hud.over || hud.paused) && <div className="overlay"><b>{hud.over ? 'GAME OVER' : 'PAUSED'}</b><button className="btn" onClick={hud.over ? reset : pause}>{hud.over ? 'New Game' : 'Resume'}</button></div>}
        </div>
        <div className="tetris-side">
          <div className="groupbox"><span className="gb-title">Next</span><canvas ref={nx} width="80" height="80" className="sunken" /></div>
          <div className="stat sunken"><small>Score</small><b>{hud.score}</b></div>
          <div className="stat sunken"><small>Lines</small><b>{hud.lines}</b></div>
          <div className="stat sunken"><small>Level</small><b>{hud.level + 1}</b></div>
          <div className="stat sunken"><small>Best</small><b>{Math.max(high, hud.score)}</b></div>
          <button className="btn" onClick={reset}>New Game</button>
          <button className="btn" onClick={pause}>{hud.paused ? 'Resume' : 'Pause'}</button>
        </div>
      </div>
      <div className="touch-pad"><Btn l="◀" f={() => move(-1)} t="Left" /><Btn l="⟳" f={() => rotate(false)} t="Rotate" /><Btn l="▶" f={() => move(1)} t="Right" /><Btn l="▼" f={() => down(true)} t="Soft drop" /><Btn l="⤓" f={hard} t="Hard drop" /></div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import { play } from '../os/sound.js';

const N = 20, CELL = 20;
const SPEEDS = { Slow: 150, Normal: 105, Fast: 65 };
const key = (wrap) => 'win95.snake.high.' + (wrap ? 'wrap' : 'walls');
const fresh = () => ({ snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }], dir: { x: 1, y: 0 }, queue: [], food: { x: 15, y: 10 }, score: 0, over: false, paused: false, started: false });
function placeFood(s) { let f; do { f = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; } while (s.snake.some((p) => p.x === f.x && p.y === f.y)); s.food = f; }

export default function Snake({ win, active }) {
  const os = useOS();
  const S = useRef(fresh());
  const cv = useRef();
  const [speed, setSpeed] = useState('Normal');
  const [wrap, setWrap] = useState(false);
  const [hud, setHud] = useState({ score: 0, over: false, paused: false, started: false });
  const [high, setHigh] = useState(() => +localStorage.getItem(key(false)) || 0);
  const sync = () => { const s = S.current; setHud({ score: s.score, over: s.over, paused: s.paused, started: s.started }); };
  const wrapRef = useRef(wrap); wrapRef.current = wrap;

  const draw = () => {
    const c = cv.current; if (!c) return;
    const g = c.getContext('2d'), s = S.current;
    g.fillStyle = '#c8e0a0'; g.fillRect(0, 0, N * CELL, N * CELL);
    g.fillStyle = 'rgba(0,0,0,.05)';
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if ((i + j) % 2) g.fillRect(i * CELL, j * CELL, CELL, CELL);
    g.fillStyle = '#d02020'; g.beginPath(); g.arc(s.food.x * CELL + CELL / 2, s.food.y * CELL + CELL / 2, CELL / 2 - 2, 0, 7); g.fill();
    g.fillStyle = '#2a7a2a'; g.fillRect(s.food.x * CELL + CELL / 2 - 1, s.food.y * CELL + 1, 2, 4);
    s.snake.forEach((p, i) => { g.fillStyle = i === 0 ? '#104010' : (i % 2 ? '#2f8f2f' : '#3aa03a'); g.fillRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2); });
    const h = s.snake[0]; g.fillStyle = '#fff';
    g.fillRect(h.x * CELL + 4 + s.dir.x * 3, h.y * CELL + 4 + s.dir.y * 3, 4, 4); g.fillRect(h.x * CELL + 12 + s.dir.x * 3, h.y * CELL + 12 + s.dir.y * 3, 4, 4);
  };
  const step = () => {
    const s = S.current;
    if (s.over || s.paused || !s.started) return;
    if (s.queue.length) s.dir = s.queue.shift();
    const h = s.snake[0];
    let nx = h.x + s.dir.x, ny = h.y + s.dir.y;
    if (wrapRef.current) { nx = (nx + N) % N; ny = (ny + N) % N; }
    const grow = nx === s.food.x && ny === s.food.y;
    const body = grow ? s.snake : s.snake.slice(0, -1);
    if (nx < 0 || ny < 0 || nx >= N || ny >= N || body.some((p) => p.x === nx && p.y === ny)) {
      s.over = true; play('lose');
      const hi = Math.max(+localStorage.getItem(key(wrapRef.current)) || 0, s.score); try { localStorage.setItem(key(wrapRef.current), hi); } catch (e) { /* ignore */ } setHigh(hi);
      sync(); draw(); return;
    }
    s.snake.unshift({ x: nx, y: ny });
    if (grow) { s.score += 10; placeFood(s); play('click'); sync(); } else s.snake.pop();
    draw();
  };
  useEffect(() => { const t = setInterval(step, SPEEDS[speed]); return () => clearInterval(t); }, [speed]); // eslint-disable-line
  useEffect(() => { draw(); }, []);
  useEffect(() => { setHigh(+localStorage.getItem(key(wrap)) || 0); }, [wrap]);

  const turn = (dx, dy) => {
    const s = S.current;
    if (s.over) return;
    const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if ((last.x === -dx && dx !== 0) || (last.y === -dy && dy !== 0) || (last.x === dx && last.y === dy)) return;
    if (s.queue.length < 3) s.queue.push({ x: dx, y: dy });
    if (!s.started) { s.started = true; sync(); }
    if (s.paused) { s.paused = false; sync(); }
  };
  const reset = () => { S.current = fresh(); placeFood(S.current); sync(); draw(); };
  const pause = () => { const s = S.current; if (s.over || !s.started) return; s.paused = !s.paused; sync(); };
  useEffect(() => { placeFood(S.current); draw(); }, []);
  useEffect(() => {
    if (!active) return;
    const h = (e) => {
      if (e.target.closest?.('input,textarea')) return;
      const k = e.key.toLowerCase();
      const m = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }[k];
      if (m) { e.preventDefault(); turn(...m); }
      else if (k === 'p' || k === ' ') { e.preventDefault(); if (S.current.over) reset(); else pause(); }
      else if (k === 'enter' && S.current.over) reset();
      else if (k === 'f2') { e.preventDefault(); reset(); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });
  const sw = useRef(null);
  const swipeDown = (e) => { sw.current = { x: e.clientX, y: e.clientY }; };
  const swipeUp = (e) => {
    const a = sw.current; if (!a) return; sw.current = null;
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    if (Math.hypot(dx, dy) < 20) { if (S.current.over) reset(); else if (S.current.started) pause(); return; }
    if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0); else turn(0, dy > 0 ? 1 : -1);
  };
  const Pad = ({ l, d }) => <button className="btn tool tbtn" onPointerDown={(e) => { e.preventDefault(); turn(...d); }}>{l}</button>;
  return (
    <div className="app snake">
      <MenuBar menus={[
        { label: '&Game', items: [{ label: '&New Game', shortcut: 'F2', onClick: reset }, { label: '&Pause', shortcut: 'P', checked: hud.paused, onClick: pause }, { sep: true },
          ...Object.keys(SPEEDS).map((k) => ({ label: k, radio: true, checked: speed === k, onClick: () => setSpeed(k) })), { sep: true },
          { label: 'Walls are &deadly', radio: true, checked: !wrap, onClick: () => { setWrap(false); reset(); } }, { label: '&Wrap around edges', radio: true, checked: wrap, onClick: () => { setWrap(true); reset(); } }, { sep: true }, { label: 'E&xit', onClick: () => os.close(win.id) }] },
        { label: '&Help', items: [{ label: '&Controls', onClick: () => os.msg({ icon: 'info', title: 'Snake', text: 'Arrow keys or WASD to steer (or swipe / use the on-screen pad).\nEat apples to grow. Do not hit the walls or yourself.\nP or Space pauses; F2 starts a new game.' }) }] },
      ]} />
      <div className="snake-main">
        <div className="snake-board sunken" onPointerDown={swipeDown} onPointerUp={swipeUp}>
          <canvas ref={cv} width={N * CELL} height={N * CELL} />
          {(!hud.started || hud.over || hud.paused) && <div className="overlay"><b>{hud.over ? 'GAME OVER' : hud.paused ? 'PAUSED' : 'SNAKE'}</b><small>{hud.over ? `Score ${hud.score}` : hud.paused ? 'Press P to resume' : 'Press an arrow key to start'}</small>{hud.over && <button className="btn" onClick={reset}>Play again</button>}</div>}
        </div>
      </div>
      <div className="touch-pad"><Pad l="◀" d={[-1, 0]} /><Pad l="▲" d={[0, -1]} /><Pad l="▼" d={[0, 1]} /><Pad l="▶" d={[1, 0]} /></div>
      <StatusBar><span>Score: {hud.score}</span><span>Best: {Math.max(high, hud.score)}</span><span>{speed} · {wrap ? 'wrap' : 'walls'}</span></StatusBar>
    </div>
  );
}

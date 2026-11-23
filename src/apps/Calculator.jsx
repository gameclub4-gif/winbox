import { useState, useEffect } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar } from '../os/widgets.jsx';

const fmt = (n) => {
  if (!isFinite(n)) return null;
  let s = parseFloat(n.toPrecision(14)).toString();
  if (s.includes('e')) s = n.toExponential(8).replace(/\.?0+e/, 'e');
  return s;
};
const fact = (n) => { if (n < 0 || n > 170 || !Number.isInteger(n)) return NaN; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
const apply = (a, op, b) => {
  switch (op) {
    case '+': return a + b; case '-': return a - b; case '*': return a * b;
    case '/': return b === 0 ? NaN : a / b;
    case 'pow': return Math.pow(a, b); case 'mod': return a % b;
    default: return b;
  }
};
const init = { disp: '0', acc: null, op: null, fresh: true, mem: 0, hasMem: false, err: null };

export default function Calculator({ win, active }) {
  const os = useOS();
  const [sci, setSci] = useState(false);
  const [s, setS] = useState(init);
  const [angle, setAngle] = useState('deg');
  const [inv, setInv] = useState(false);

  const val = (st) => parseFloat(st.disp);
  const upd = (fn) => setS((p) => (p.err && !fn.allowErr ? p : fn(p)));
  const digit = (d) => upd((p) => (p.fresh ? { ...p, disp: d, fresh: d === '0' && false } : { ...p, disp: p.disp === '0' ? d : p.disp.length < 16 ? p.disp + d : p.disp }));
  const dot = () => upd((p) => (p.fresh ? { ...p, disp: '0.', fresh: false } : p.disp.includes('.') ? p : { ...p, disp: p.disp + '.' }));
  const setResult = (p, r, extra = {}) => { const f = fmt(r); return f === null ? { ...p, err: r === r ? 'Overflow' : (p.op === '/' ? 'Cannot divide by zero' : 'Invalid input'), fresh: true, ...extra } : { ...p, disp: f, fresh: true, ...extra }; };
  const op = (o) => upd((p) => {
    if (p.op && !p.fresh) { const r = apply(p.acc, p.op, val(p)); const q = setResult(p, r); if (q.err) return q; return { ...q, acc: r, op: o }; }
    return { ...p, acc: val(p), op: o, fresh: true };
  });
  const eq = () => upd((p) => {
    if (!p.op) return { ...p, fresh: true };
    const r = apply(p.acc, p.op, val(p));
    const q = setResult(p, r);
    return q.err ? q : { ...q, acc: null, op: null };
  });
  const un = (f) => upd((p) => setResult(p, f(val(p))));
  const toRad = (x) => (angle === 'deg' ? (x * Math.PI) / 180 : angle === 'grad' ? (x * Math.PI) / 200 : x);
  const fromRad = (x) => (angle === 'deg' ? (x * 180) / Math.PI : angle === 'grad' ? (x * 200) / Math.PI : x);
  const back = () => upd((p) => (p.fresh ? p : { ...p, disp: p.disp.length > 1 && p.disp !== '-0' ? p.disp.slice(0, -1) : '0' }));
  const ce = () => setS((p) => ({ ...p, disp: '0', fresh: true, err: null }));
  const clear = () => setS((p) => ({ ...init, mem: p.mem, hasMem: p.hasMem }));
  const neg = () => upd((p) => (p.disp === '0' ? p : { ...p, disp: p.disp.startsWith('-') ? p.disp.slice(1) : '-' + p.disp }));
  const pct = () => upd((p) => setResult(p, p.acc !== null ? (p.acc * val(p)) / 100 : 0));
  const mem = (k) => setS((p) => {
    const v = p.err ? 0 : val(p);
    if (k === 'MC') return { ...p, mem: 0, hasMem: false };
    if (k === 'MR') return p.hasMem ? { ...p, disp: fmt(p.mem), fresh: true, err: null } : p;
    if (k === 'MS') return { ...p, mem: v, hasMem: true, fresh: true };
    return { ...p, mem: p.mem + v, hasMem: true, fresh: true };
  });
  ce.allowErr = true;

  const switchMode = (m) => { setSci(m); os.resize(win.id, { w: m ? 560 : 260, h: m ? 300 : 262 }); };
  useEffect(() => { os.setTitle(win.id, sci ? 'Calculator (Scientific)' : 'Calculator'); }, [sci, win.id, os]);

  const key = (e) => {
    const k = e.key;
    if (/^[0-9]$/.test(k)) digit(k);
    else if (k === '.' || k === ',') dot();
    else if (['+', '-', '*', '/'].includes(k)) { e.preventDefault(); op(k); }
    else if (k === 'Enter' || k === '=') { e.preventDefault(); eq(); }
    else if (k === 'Backspace') back();
    else if (k === 'Escape') clear();
    else if (k === 'Delete') ce();
    else if (k === '%') pct();
    else if (k.toLowerCase() === 'r') un((x) => 1 / x);
    else if (k === '@') un(Math.sqrt);
  };
  useEffect(() => {
    if (!active) return;
    const h = (e) => { if (e.ctrlKey || e.altKey || e.metaKey || e.target.closest?.('input,textarea')) return; key(e); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  const B = ({ l, f, c = 'n', title }) => <button className={'btn cb ' + c} onClick={f} title={title}>{l}</button>;
  const disp = s.err || s.disp.replace(/^(-?\d+)$/, '$1') + (s.disp.includes('.') ? '' : '.');

  const sciPad = (
    <div className="calc-sci">
      <div className="groupbox" style={{ display: 'flex', gap: 6, padding: '8px 6px 4px', margin: '0 0 4px', flexWrap: 'wrap' }}>
        {['deg', 'rad', 'grad'].map((a) => <label key={a}><input type="radio" checked={angle === a} onChange={() => setAngle(a)} /> {a[0].toUpperCase() + a.slice(1)}</label>)}
        <label style={{ marginLeft: 'auto' }}><input type="checkbox" checked={inv} onChange={(e) => setInv(e.target.checked)} /> Inv</label>
      </div>
      <div className="calc-grid sci">
        <B l={inv ? 'asin' : 'sin'} c="s" f={() => un((x) => (inv ? fromRad(Math.asin(x)) : Math.sin(toRad(x))))} />
        <B l={inv ? 'acos' : 'cos'} c="s" f={() => un((x) => (inv ? fromRad(Math.acos(x)) : Math.cos(toRad(x))))} />
        <B l={inv ? 'atan' : 'tan'} c="s" f={() => un((x) => (inv ? fromRad(Math.atan(x)) : Math.tan(toRad(x))))} />
        <B l={inv ? '10ˣ' : 'log'} c="s" f={() => un((x) => (inv ? Math.pow(10, x) : Math.log10(x)))} />
        <B l={inv ? 'eˣ' : 'ln'} c="s" f={() => un((x) => (inv ? Math.exp(x) : Math.log(x)))} />
        <B l="x²" c="s" f={() => un((x) => x * x)} />
        <B l="x³" c="s" f={() => un((x) => x * x * x)} />
        <B l="xʸ" c="s" f={() => op('pow')} />
        <B l="n!" c="s" f={() => un(fact)} />
        <B l="π" c="s" f={() => upd((p) => ({ ...p, disp: fmt(Math.PI), fresh: true }))} />
        <B l="Mod" c="s" f={() => op('mod')} />
        <B l="|x|" c="s" f={() => un(Math.abs)} />
        <B l="Int" c="s" f={() => un(Math.trunc)} />
        <B l="e" c="s" f={() => upd((p) => ({ ...p, disp: fmt(Math.E), fresh: true }))} />
        <B l="Rnd" c="s" f={() => upd((p) => ({ ...p, disp: fmt(Math.random()), fresh: true }))} />
      </div>
    </div>
  );

  return (
    <div className="app calc">
      <MenuBar menus={[
        { label: '&Edit', items: [{ label: '&Copy', shortcut: 'Ctrl+C', onClick: () => navigator.clipboard?.writeText(s.disp).catch(() => {}) }, { label: '&Paste', shortcut: 'Ctrl+V', onClick: async () => { try { const t = parseFloat(await navigator.clipboard.readText()); if (!isNaN(t)) upd((p) => ({ ...p, disp: fmt(t), fresh: true })); } catch (e) { /* blocked */ } } }] },
        { label: '&View', items: [{ label: 'S&tandard', radio: true, checked: !sci, onClick: () => switchMode(false) }, { label: 'S&cientific', radio: true, checked: sci, onClick: () => switchMode(true) }] },
        { label: '&Help', items: [{ label: '&Help Topics', onClick: () => os.open('help') }, { label: '&About Calculator', onClick: () => os.msg({ icon: 'info', title: 'About Calculator', text: 'Calculator\nWindows 95 Smart Edition\nStandard and scientific modes with keyboard support.' }) }] },
      ]} />
      <div className="calc-body">
        <div className="field calc-disp">{disp}</div>
        <div className="calc-main">
          {sci && sciPad}
          <div>
            <div className="calc-row"><div className="calc-m sunken">{s.hasMem ? 'M' : ''}</div>
              <B l="Back" c="r" f={back} /><B l="CE" c="r" f={ce} /><B l="C" c="r" f={clear} /></div>
            <div className="calc-grid">
              <B l="MC" c="r" f={() => mem('MC')} /><B l="7" f={() => digit('7')} /><B l="8" f={() => digit('8')} /><B l="9" f={() => digit('9')} /><B l="/" c="r" f={() => op('/')} /><B l="sqrt" c="b" f={() => un(Math.sqrt)} />
              <B l="MR" c="r" f={() => mem('MR')} /><B l="4" f={() => digit('4')} /><B l="5" f={() => digit('5')} /><B l="6" f={() => digit('6')} /><B l="*" c="r" f={() => op('*')} /><B l="%" c="b" f={pct} />
              <B l="MS" c="r" f={() => mem('MS')} /><B l="1" f={() => digit('1')} /><B l="2" f={() => digit('2')} /><B l="3" f={() => digit('3')} /><B l="-" c="r" f={() => op('-')} /><B l="1/x" c="b" f={() => un((x) => 1 / x)} />
              <B l="M+" c="r" f={() => mem('M+')} /><B l="0" f={() => digit('0')} /><B l="+/-" f={neg} /><B l="." f={dot} /><B l="+" c="r" f={() => op('+')} /><B l="=" c="r" f={eq} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

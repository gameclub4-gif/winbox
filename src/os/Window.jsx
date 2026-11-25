import { memo, useState, useMemo, Suspense, Component } from 'react';
import { APPS } from './registry.js';
import { useOS } from './OS.jsx';
import { useSettings } from './settings.js';
import Icon from './icons.jsx';

class Boundary extends Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(e) { console.error(e); }
  render() {
    if (this.state.err) {
      return (
        <div className="crash">
          <Icon name="error" />
          <div>
            <p><b>This program has performed an illegal operation and will be shut down.</b></p>
            <pre>{String(this.state.err.message || this.state.err)}</pre>
            <button className="btn" onClick={() => this.props.onClose()}>Close</button>{' '}
            <button className="btn" onClick={() => this.setState({ err: null })}>Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const Body = memo(function Body({ id, appId, props, nonce, active }) {
  const os = useOS();
  const win = useMemo(() => ({ id, nonce }), [id, nonce]);
  const { Comp } = APPS[appId];
  return (
    <Boundary onClose={() => os.close(id)}>
      <Suspense fallback={<div className="loading"><Icon name="clock" size={24} /> Loading...</div>}>
        <Comp win={win} props={props} active={active} />
      </Suspense>
    </Boundary>
  );
});

const Glyph = {
  min: <svg width="8" height="8" viewBox="0 0 8 8"><rect x="0" y="6" width="6" height="2" /></svg>,
  max: <svg width="9" height="9" viewBox="0 0 9 9"><path d="M0 0h9v9H0zM1 2v6h7V2z" fillRule="evenodd" /></svg>,
  restore: <svg width="9" height="9" viewBox="0 0 9 9"><path d="M2 0h7v6H7v-1h1V2H3v0H2zM0 3h7v6H0zM1 5v3h5V5z" fillRule="evenodd" /></svg>,
  close: <svg width="8" height="7" viewBox="0 0 8 7"><path d="M0 0h2l2 2 2-2h2L5 3.500 8 7H6L4 5 2 7H0l3-3.500z" /></svg>,
};

function Win({ w, active, compact }) {
  const os = useOS();
  const settings = useSettings();
  const app = APPS[w.appId];
  const [ghost, setGhost] = useState(null);
  const isMax = w.max || compact;
  const resizable = app.resizable !== false;
  const minW = app.minW || 160, minH = app.minH || 100;

  const startDrag = (e) => {
    if (e.button !== 0 || e.target.closest('.tb-btn') || e.target.closest('.sys-icon') || isMax) return;
    const sx = e.clientX, sy = e.clientY, ox = w.x, oy = w.y;
    let nx = ox, ny = oy, moved = false;
    const full = settings.dragFull;
    const mv = (ev) => {
      moved = true;
      nx = Math.min(Math.max(ox + ev.clientX - sx, -w.w + 80), window.innerWidth - 80);
      ny = Math.max(0, Math.min(oy + ev.clientY - sy, window.innerHeight - 60));
      if (full) os.move(w.id, nx, ny); else setGhost({ x: nx, y: ny, w: w.w, h: w.h });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if (!full) { setGhost(null); if (moved) os.move(w.id, nx, ny); }
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const startResize = (dir) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, o = { x: w.x, y: w.y, w: w.w, h: w.h };
    const mv = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      let { x, y, w: ww, h: hh } = o;
      if (dir.includes('e')) ww = Math.max(minW, o.w + dx);
      if (dir.includes('s')) hh = Math.max(minH, o.h + dy);
      if (dir.includes('w')) { ww = Math.max(minW, o.w - dx); x = o.x + o.w - ww; }
      if (dir.includes('n')) { hh = Math.max(minH, o.h - dy); y = Math.max(0, o.y + o.h - hh); }
      os.resize(w.id, { x, y, w: ww, h: hh });
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const sysMenu = (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    os.showMenu(r.left, r.bottom, [
      { label: '&Restore', disabled: !isMax || compact, onClick: () => os.toggleMax(w.id) },
      { label: 'M&inimize', onClick: () => os.minimize(w.id) },
      { label: 'Ma&ximize', disabled: isMax || !resizable, onClick: () => os.toggleMax(w.id) },
      { sep: true },
      { label: '&Close', shortcut: 'Alt+F4', bold: true, onClick: () => os.close(w.id) },
    ]);
  };

  return (
    <>
      <div
        className={`window ${active ? 'active' : ''} ${isMax ? 'max' : ''}`}
        style={{ left: w.x, top: w.y, width: w.w, height: w.h, zIndex: w.z, display: w.min ? 'none' : undefined }}
        onPointerDownCapture={() => os.focus(w.id)}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <div className="titlebar" onPointerDown={startDrag} onDoubleClick={(e) => { if (resizable && !e.target.closest('.tb-btn') && !e.target.closest('.sys-icon')) os.toggleMax(w.id); }}>
          <span className="sys-icon" onClick={sysMenu} onDoubleClick={(e) => { e.stopPropagation(); os.close(w.id); }}><Icon name={w.icon} size={16} /></span>
          <span className="title-text">{w.title}</span>
          <button className="tb-btn" aria-label="Minimize" onClick={() => os.minimize(w.id)}>{Glyph.min}</button>
          <button className="tb-btn" aria-label={isMax ? 'Restore' : 'Maximize'} disabled={!resizable || compact} onClick={() => os.toggleMax(w.id)}>{isMax ? Glyph.restore : Glyph.max}</button>
          <button className="tb-btn close" aria-label="Close" onClick={() => os.close(w.id)}>{Glyph.close}</button>
        </div>
        <div className="win-body">
          <Body id={w.id} appId={w.appId} props={w.props} nonce={w.nonce} active={active} />
        </div>
        {!isMax && resizable && ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => <div key={d} className={'rz rz-' + d} onPointerDown={startResize(d)} />)}
      </div>
      {ghost && <div className="ghost-outline" style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h, zIndex: 8000 }} />}
    </>
  );
}
export default memo(Win);

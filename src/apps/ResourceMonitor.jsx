import { useState, useEffect, useRef } from 'react';
import { useOS, useOSState } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import Icon from '../os/icons.jsx';
import * as fs from '../os/fs.js';
import { fmtSize } from '../os/actions.js';
import { useVirtualDrives } from '../utils/virtualDrives.js';

const HISTORY_LEN = 48;

export default function ResourceMonitor({ win }) {
  const os = useOS();
  const st = useOSState();
  fs.useFS();
  const vd = useVirtualDrives();

  const [fps, setFps] = useState(60);
  const [jitterMs, setJitterMs] = useState(1);
  const [heapMB, setHeapMB] = useState(null);
  const [storage, setStorage] = useState({ usage: 0, quota: 0 });
  const histRef = useRef(Array(HISTORY_LEN).fill(2));
  const canvasRef = useRef();

  // Sample real RAF timing + JS heap + IndexedDB/Storage quota every second
  useEffect(() => {
    let frames = 0;
    let lastSecond = performance.now();
    let lastFrame = lastSecond;
    let maxFrameMs = 16.7;
    let rafId = 0;

    const loop = (now) => {
      frames++;
      const dt = now - lastFrame;
      if (dt > maxFrameMs) maxFrameMs = dt;
      lastFrame = now;

      if (now - lastSecond >= 1000) {
        const curFps = Math.round((frames * 1000) / (now - lastSecond));
        const curJitter = Math.max(0, Math.round(maxFrameMs - 16.7));
        setFps(curFps);
        setJitterMs(curJitter);
        const loadPct = Math.min(100, Math.max(4, Math.round((maxFrameMs / 50) * 100)));
        histRef.current = [...histRef.current.slice(1), loadPct];

        const mem = performance?.memory;
        if (mem?.usedJSHeapSize) {
          setHeapMB({
            used: Math.round(mem.usedJSHeapSize / (1024 * 1024)),
            limit: Math.round(mem.jsHeapSizeLimit / (1024 * 1024)),
          });
        }
        navigator.storage?.estimate?.().then((e) => setStorage({ usage: e.usage || 0, quota: e.quota || 0 })).catch(() => {});

        frames = 0;
        maxFrameMs = 16.7;
        lastSecond = now;
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    navigator.storage?.estimate?.().then((e) => setStorage({ usage: e.usage || 0, quota: e.quota || 0 })).catch(() => {});
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Draw crisp Win95 Task-Manager style green sparkline graph
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const g = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#004800';
    g.lineWidth = 1;
    for (let x = 0; x < w; x += 16) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
    for (let y = 0; y < h; y += 16) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    const pts = histRef.current;
    g.strokeStyle = '#00ff66';
    g.lineWidth = 1.5;
    g.beginPath();
    pts.forEach((v, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - (v / 100) * (h - 6) - 3;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
  }, [fps, jitterMs]);

  const cBytes = fs.folderSize(fs.ROOT);
  const quotaPct = storage.quota ? Math.min(100, Math.max(1, (storage.usage / storage.quota) * 100)) : 1;

  return (
    <div className="app rm">
      <MenuBar menus={[
        { label: '&File', items: [
          { label: '&New Task (Run...)', onClick: () => os.setStart(true) },
          { sep: true },
          { label: 'E&xit Resource Monitor', onClick: () => os.close(win.id) },
        ] },
        { label: '&Tools', items: [
          { label: 'Open &Virtual Drive Manager...', onClick: () => os.open('drives') },
          { label: 'Open &Recycle / Cache Cleaner...', onClick: () => os.open('recycle') },
          { label: 'Open Control Panel &Storage...', onClick: () => os.open('control', { applet: 'system' }) },
        ] },
        { label: '&Help', items: [{ label: '&Help Topics', onClick: () => os.open('help') }] },
      ]} />

      <div className="rm-body">
        <div className="rm-top">
          <div className="groupbox rm-card">
            <span className="gb-title">Frame &amp; UI Thread Timing</span>
            <canvas ref={canvasRef} width="240" height="72" className="sunken rm-chart" />
            <div className="rm-stats" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <span>Display Rate: <b>{fps} FPS</b></span>
              <span>Frame Jitter: <b>{jitterMs} ms</b></span>
              <span>CPU Threads: <b>{navigator.hardwareConcurrency || '?'}</b></span>
            </div>
          </div>

          <div className="groupbox rm-card">
            <span className="gb-title">Memory &amp; Virtual Storage</span>
            <div className="rm-rows" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <div>JS Heap: <b>{heapMB ? `${heapMB.used} MB / ${heapMB.limit} MB` : `${navigator.deviceMemory ? `~${navigator.deviceMemory} GB System RAM` : 'Browser managed'}`}</b></div>
              <div>Virtual C:\ Used: <b>{fmtSize(cBytes)}</b></div>
              <div>Browser Quota: <b>{fmtSize(storage.usage)} / {fmtSize(storage.quota)}</b></div>
              <div className="sunken" style={{ height: 12, background: '#fff', padding: 1 }}>
                <div style={{ height: '100%', width: `${quotaPct}%`, background: '#000080' }} />
              </div>
              <div>Mounted Drives: <b>{['C:', vd.floppyA && 'A:', vd.cdromD && 'D:', ...vd.removable.map((r) => r.letter)].filter(Boolean).join(' ')}</b></div>
            </div>
          </div>
        </div>

        <div className="gb-title-line">Active Windows ({st.wins.length})</div>
        <div className="field list-details rm-tasks">
          <div className="ld-head" style={{ gridTemplateColumns: '2fr 80px 130px' }}>
            <span>Task / Window Title</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {st.wins.map((w) => (
            <div key={w.id} className={'ld-row ' + (st.active === w.id ? 'sel' : '')} style={{ gridTemplateColumns: '2fr 80px 130px' }}>
              <span className="ld-name"><Icon name={w.icon} size={14} /><span>{w.title}</span></span>
              <span>{w.min ? 'Minimized' : 'Running'}</span>
              <span style={{ display: 'flex', gap: 4 }}>
                <button className="btn tool" style={{ padding: '1px 5px', fontSize: 10 }} onClick={() => os.focus(w.id)}>Switch To</button>
                <button className="btn tool" style={{ padding: '1px 5px', fontSize: 10 }} onClick={() => os.close(w.id)}>End Task</button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <StatusBar>
        <span>Processes: {st.wins.length}</span>
        <span>C:\ Used: {fmtSize(cBytes)}</span>
        <span>{fps} FPS</span>
      </StatusBar>
    </div>
  );
}

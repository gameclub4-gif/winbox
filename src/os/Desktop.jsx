import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useOS, useOSState, TASKBAR_H } from './OS.jsx';
import Win from './Window.jsx';
import Icon, { iconForFile } from './icons.jsx';
import { MenuList, ContextMenu, MsgBox, PromptBox, FileDialog, Dialog } from './widgets.jsx';
import { useSettings, setSettings, themeVars, BLISS, PATTERNS } from './settings.js';
import * as fs from './fs.js';
import { newItem, deleteNodes, renameNode, showProps, importFiles } from './actions.js';

const SmartTransferToastHost = lazy(() => import('./smartTransferUI.jsx').then((m) => ({ default: m.SmartTransferToastHost })));

const CELL_W = 80, CELL_H = 78;

function BootScreen({ ready, onDone }) {
  const [p, setP] = useState(0);
  useEffect(() => { const t = setInterval(() => setP((x) => Math.min(100, x + 6)), 90); return () => clearInterval(t); }, []);
  useEffect(() => { if (p >= 100 && ready) onDone(); }, [p, ready, onDone]);
  return (
    <div className="boot" onClick={() => ready && p > 30 && onDone()}>
      <div className="boot-logo"><Icon name="flag" size={72} /><div><div className="boot-ms">Microsoft<sup>®</sup></div><div className="boot-win">Windows <b>95</b></div></div></div>
      <div className="boot-bar"><div style={{ width: p + '%' }} /></div>
      <div className="boot-msg">Starting Windows 95...</div>
    </div>
  );
}
const ShutScreen = () => <div className="shut"><div className="shut-text">Windows is shutting down.</div></div>;
function OffScreen({ onPower }) {
  useEffect(() => { const k = () => onPower(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onPower]);
  return <div className="off" onClick={onPower}><div>It's now safe to turn off<br />your computer.</div><small>(Click or press any key to turn the power back on)</small></div>;
}

function Clock({ onOpen }) {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 10000); return () => clearInterval(i); }, []);
  return <span className="clock" title={t.toDateString()} onDoubleClick={onOpen}>{t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>;
}

function RunDialog({ done, os }) {
  const [v, setV] = useState('');
  const go = () => {
    if (!v.trim()) return;
    if (os.run(v)) done(true);
    else os.msg({ icon: 'error', title: v, text: `Cannot find the file '${v}' (or one of its components). Make sure the path and filename are correct and that all required libraries are available.` });
  };
  return (
    <Dialog title="Run" icon="run" onClose={() => done(null)} width={380}>
      <div className="msg-row"><Icon name="run" />
        <div className="msg-text">Type the name of a program, folder, document, or Internet resource, and Windows will open it for you.</div></div>
      <div className="fd-row" style={{ marginTop: 10 }}><label>Open:</label>
        <input className="field" autoFocus style={{ flex: 1 }} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') done(null); }} placeholder="notepad, calc, C:\My Documents, https://..." /></div>
      <div className="btn-row">
        <button className="btn default" onClick={go}>OK</button><button className="btn" onClick={() => done(null)}>Cancel</button>
        <button className="btn" onClick={async () => { const n = await os.fileDialog({ mode: 'open', title: 'Browse' }); if (n) setV(fs.pathOf(n.id)); }}>Browse...</button>
      </div>
    </Dialog>
  );
}

function ShutdownDialog({ done, os }) {
  const [k, setK] = useState('shutdown');
  const opts = [['shutdown', 'Shut down the computer?'], ['restart', 'Restart the computer?'], ['dos', 'Restart the computer in MS-DOS mode?']];
  return (
    <Dialog title="Shut Down Windows" onClose={() => done(null)} width={340}>
      <div className="msg-row"><Icon name="shutdown" />
        <div className="msg-text"><div style={{ marginBottom: 8 }}>Are you sure you want to:</div>
          {opts.map(([id, l]) => <label key={id} className="radio"><input type="radio" name="sd" checked={k === id} onChange={() => setK(id)} /> {l}</label>)}</div></div>
      <div className="btn-row">
        <button className="btn default" onClick={() => { done(null); os.shutdown(k); }}>Yes</button>
        <button className="btn" onClick={() => done(null)}>No</button>
        <button className="btn" onClick={() => { done(null); os.open('help'); }}>Help</button>
      </div>
    </Dialog>
  );
}

function useWallpaper(settings) {
  const wp = settings.wallpaper;
  const nodeId = wp.startsWith('fs:') ? wp.slice(3) : null;
  const node = nodeId ? fs.get(nodeId) : null;
  const url = useMemo(() => (node ? fs.blobUrl(node) : null), [node, node?.modified]); // eslint-disable-line
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  const style = {};
  const mode = settings.wallpaperMode;
  let img = null;
  if (wp === 'bliss') img = BLISS; else if (url) img = url;
  if (img) {
    style.backgroundImage = `url("${img}")`;
    style.backgroundRepeat = mode === 'tile' ? 'repeat' : 'no-repeat';
    style.backgroundPosition = 'center';
    style.backgroundSize = mode === 'stretch' ? 'cover' : 'auto';
  } else if (wp.startsWith('pattern:') && PATTERNS[wp.slice(8)]) {
    const p = PATTERNS[wp.slice(8)];
    style.backgroundImage = p.css; style.backgroundSize = p.size;
  }
  return style;
}

export default function Desktop() {
  const os = useOS();
  const st = useOSState();
  const settings = useSettings();
  fs.useFS();
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState([]);
  const [drag, setDrag] = useState(null);
  const startRef = useRef();
  const wallStyle = useWallpaper(settings);
  const coarse = useMemo(() => window.matchMedia?.('(pointer: coarse)').matches, []);

  useEffect(() => { fs.init().then(() => setReady(true)); }, []);
  useEffect(() => {
    if (!st.startOpen) return;
    const h = (e) => { if (!e.target.closest('.start-menu') && !e.target.closest('.start-btn')) os.setStart(false); };
    document.addEventListener('pointerdown', h, true);
    return () => document.removeEventListener('pointerdown', h, true);
  }, [st.startOpen, os]);

  const trashCount = fs.trashList().length;
  const items = useMemo(() => {
    const b = [
      { id: 'mycomputer', label: 'My Computer', icon: 'computer', open: () => os.open('explorer', { folderId: null }), sys: true },
      { id: 'mydocs', label: 'My Documents', icon: 'documents', open: () => os.open('explorer', { folderId: 'docs' }), sys: true },
      { id: 'browser', label: 'Internet Browser', icon: 'browser', open: () => os.open('browser'), sys: true },
      { id: 'recycle', label: 'Recycle Bin', icon: trashCount ? 'recycleFull' : 'recycle', open: () => os.open('recycle'), sys: true },
      { id: 'dosgames', label: 'DOSBox & Retro', icon: 'dosgames', open: () => os.open('dosgames'), sys: true },
      { id: 'paint', label: 'Paint', icon: 'paint', open: () => os.open('paint'), sys: true },
      { id: 'notepad', label: 'Notepad', icon: 'notepad', open: () => os.open('notepad'), sys: true },
      { id: 'wordpad', label: 'WordPad', icon: 'wordpad', open: () => os.open('wordpad'), sys: true },
      { id: 'acrobat', label: 'Acrobat Reader 5.0', icon: 'acrobat', open: () => os.open('acrobat'), sys: true },
      { id: 'calc', label: 'Calculator', icon: 'calc', open: () => os.open('calc'), sys: true },
      { id: 'media', label: 'Media Player', icon: 'media', open: () => os.open('media'), sys: true },
      { id: 'dos', label: 'MS-DOS Prompt', icon: 'dos', open: () => os.open('dos'), sys: true },
      { id: 'control', label: 'Control Panel', icon: 'control', open: () => os.open('control'), sys: true },
      { id: 'solitaire', label: 'Solitaire', icon: 'solitaire', open: () => os.open('solitaire'), sys: true },
      { id: 'minesweeper', label: 'Minesweeper', icon: 'minesweeper', open: () => os.open('minesweeper'), sys: true },
    ];
    const f = fs.children('desktop').map((n) => ({ id: 'n:' + n.id, label: n.name, icon: iconForFile(n), node: n, open: () => os.openNode(n) }));
    let all = [...b, ...f];
    if (settings.arrange === 'name') all = [...all].sort((x, y) => x.label.localeCompare(y.label));
    else if (settings.arrange === 'type') all = [...all].sort((x, y) => (x.sys === y.sys ? x.label.localeCompare(y.label) : x.sys ? -1 : 1));
    return all;
  }, [trashCount, settings.arrange, os, st.phase, fs.children('desktop').length]); // eslint-disable-line

  const rows = Math.max(1, Math.floor((st.vp.h - TASKBAR_H - 8) / CELL_H));
  const posOf = (it, i) => settings.iconPos[it.id] || { x: 4 + Math.floor(i / rows) * CELL_W, y: 4 + (i % rows) * CELL_H };

  const startDragIcon = (e, it, i) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSel((s) => (e.ctrlKey ? (s.includes(it.id) ? s.filter((x) => x !== it.id) : [...s, it.id]) : [it.id]));
    const p0 = posOf(it, i), sx = e.clientX, sy = e.clientY;
    let moved = false, np = p0;
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved = true;
      np = { x: p0.x + ev.clientX - sx, y: p0.y + ev.clientY - sy };
      setDrag({ id: it.id, ...np });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      if (moved) {
        const x = Math.max(0, Math.round((np.x - 4) / CELL_W) * CELL_W + 4), y = Math.max(0, Math.round((np.y - 4) / CELL_H) * CELL_H + 4);
        setSettings((s) => ({ iconPos: { ...s.iconPos, [it.id]: { x, y } }, arrange: null }));
        setDrag(null);
      }
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };

  const iconMenu = (e, it) => {
    e.preventDefault(); e.stopPropagation();
    setSel([it.id]);
    const n = it.node;
    const m = [{ label: '&Open', bold: true, onClick: it.open }];
    if (it.id === 'recycle') m.push({ label: '&Empty Recycle Bin', disabled: !trashCount, onClick: async () => { if ((await os.msg({ icon: 'question', title: 'Confirm', text: 'Are you sure you want to delete all items in the Recycle Bin?', buttons: ['Yes', 'No'] })) === 'Yes') fs.emptyTrash(); } });
    if (n) {
      m.push({ sep: true }, { label: 'Cu&t', onClick: () => fs.copyToClip([n.id], true) }, { label: '&Copy', onClick: () => fs.copyToClip([n.id], false) }, { sep: true },
        { label: '&Delete', onClick: () => deleteNodes(os, [n.id]) }, { label: 'Rena&me', onClick: () => renameNode(os, n) });
    }
    m.push({ sep: true }, { label: 'P&roperties', onClick: () => (n ? showProps(os, n) : it.id === 'mycomputer' ? os.open('control', { applet: 'system' }) : os.msg({ icon: 'info', title: it.label + ' Properties', text: `${it.label}\nThis is a built-in Windows 95 shortcut.` })) });
    os.showMenu(e.clientX, e.clientY, m);
  };
  const deskMenu = (e) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    os.showMenu(e.clientX, e.clientY, [
      { label: 'Arrange &Icons', sub: [{ label: 'by &Name', checked: settings.arrange === 'name', onClick: () => setSettings({ arrange: 'name', iconPos: {} }) }, { label: 'by &Type', checked: settings.arrange === 'type', onClick: () => setSettings({ arrange: 'type', iconPos: {} }) }] },
      { label: 'Line &Up Icons', onClick: () => setSettings({ iconPos: {} }) },
      { sep: true },
      { label: '&Paste', disabled: !fs.clip.ids.length, onClick: () => fs.paste('desktop') },
      { sep: true },
      { label: 'Ne&w', sub: [{ label: '&Folder', icon: 'folder', onClick: () => newItem(os, 'folder', 'desktop') }, { label: '&Text Document', icon: 'text', onClick: () => newItem(os, 'text', 'desktop') }, { label: '&Rich Text Document (.rtf)', icon: 'wordpad', onClick: () => newItem(os, 'rtf', 'desktop') }, { label: '&Web Page (.html)', icon: 'browser', onClick: () => newItem(os, 'html', 'desktop') }, { label: '&Bitmap Image', icon: 'image', onClick: () => newItem(os, 'bitmap', 'desktop') }] },
      { sep: true },
      { label: '&Refresh', onClick: () => setSel([]) },
      { label: 'P&roperties', onClick: () => os.open('control', { applet: 'display' }) },
    ]);
  };
  const taskbarMenu = (e) => {
    e.preventDefault();
    os.showMenu(e.clientX, e.clientY, [
      { label: '&Cascade Windows', onClick: os.cascade }, { label: 'Tile &Horizontally', onClick: () => os.tile(true) }, { label: 'Tile &Vertically', onClick: () => os.tile(false) },
      { label: '&Minimize All Windows', onClick: os.minimizeAll }, { sep: true }, { label: 'Task Man&ager', onClick: () => os.open('sysmon') },
    ]);
  };
  const taskMenu = (e, w) => {
    e.preventDefault(); e.stopPropagation();
    os.showMenu(e.clientX, e.clientY, [
      { label: '&Restore', disabled: !w.min && !w.max, onClick: () => (w.min ? os.focus(w.id) : os.toggleMax(w.id)) },
      { label: 'M&inimize', disabled: w.min, onClick: () => os.minimize(w.id) },
      { label: 'Ma&ximize', disabled: w.max, onClick: () => { os.focus(w.id); if (!w.max) os.toggleMax(w.id); } },
      { sep: true }, { label: '&Close', bold: true, shortcut: 'Alt+F4', onClick: () => os.close(w.id) },
    ]);
  };

  const docs = fs.children('docs').slice(0, 14);
  const go = (fn) => () => { os.setStart(false); fn(); };
  const app = (id, label, icon) => ({ label, icon, onClick: go(() => os.open(id)) });
  const startItems = [
    { label: '&Programs', icon: 'programs', sub: [
      { label: 'Accessories', icon: 'folder', sub: [app('acrobat', 'Acrobat Reader 5.0', 'acrobat'), app('notepad', 'Notepad', 'notepad'), app('wordpad', 'WordPad', 'wordpad'), app('paint', 'Paint', 'paint'), app('calc', 'Calculator', 'calc'), app('media', 'Media Player', 'media'), app('sndrec', 'Sound Recorder', 'sound'), app('inspector', 'Disk & ZIP Inspector', 'zip'), app('dos', 'MS-DOS Prompt', 'dos')] },
      { label: 'System Tools', icon: 'folder', sub: [app('drives', 'Virtual Drive Manager', 'drive'), app('sysmon', 'Resource Monitor', 'system'), app('inspector', 'Disk & ZIP Inspector', 'zip'), app('recycle', 'Cache & Recycle Bin', 'recycle')] },
      { label: 'Games', icon: 'folder', sub: [app('solitaire', 'Solitaire', 'solitaire'), app('minesweeper', 'Minesweeper', 'minesweeper'), app('freecell', 'FreeCell', 'freecell'), app('hearts', 'Hearts', 'hearts'), app('tetris', 'Tetris', 'tetris'), app('snake', 'Snake', 'snake'), { sep: true }, app('dosgames', 'DOSBox & Retro Computers', 'dosgames')] },
      { sep: true },
      app('acrobat', 'Acrobat Reader 5.0', 'acrobat'), app('dosgames', 'DOSBox & Retro Computers', 'dosgames'), app('drives', 'Virtual Drive Manager', 'drive'), app('inspector', 'Disk & ZIP Inspector', 'zip'), app('browser', 'Internet Browser', 'browser'), app('dos', 'MS-DOS Prompt', 'dos'), app('explorer', 'Windows Explorer', 'explorer'),
    ] },
    { label: '&Documents', icon: 'documents', sub: [{ label: 'My Documents', icon: 'folder', onClick: go(() => os.open('explorer', { folderId: 'docs' })) }, { sep: true }, ...(docs.length ? docs.map((n) => ({ label: n.name, icon: iconForFile(n), onClick: go(() => os.openNode(n)) })) : [{ label: '(Empty)', disabled: true }])] },
    { label: '&Settings', icon: 'settings', sub: [app('control', 'Control Panel', 'control'), { label: 'Display...', icon: 'display', onClick: go(() => os.open('control', { applet: 'display' })) }, { label: 'Sounds...', icon: 'sound', onClick: go(() => os.open('control', { applet: 'sounds' })) }, { label: 'Date/Time...', icon: 'clock', onClick: go(() => os.open('control', { applet: 'datetime' })) }] },
    { label: '&Find', icon: 'find', sub: [{ label: '&Files or Folders...', icon: 'find', onClick: go(() => os.open('explorer', { find: true })) }] },
    { label: '&Help', icon: 'help', onClick: go(() => os.open('help')) },
    { label: '&Run...', icon: 'run', onClick: go(() => os.dialog((done) => <RunDialog done={done} os={os} />)) },
    { sep: true },
    { label: 'S&hut Down...', icon: 'shutdown', onClick: go(() => os.dialog((done) => <ShutdownDialog done={done} os={os} />)) },
  ];

  const fsOn = () => !!document.fullscreenElement;
  const toggleFs = () => { try { fsOn() ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (e) { os.msg({ icon: 'warning', text: 'Fullscreen is not available in this context (e.g. an embedding iframe without the allowfullscreen attribute).' }); } };

  if (st.phase === 'boot') return <BootScreen ready={ready} onDone={os.finishBoot} />;
  if (st.phase === 'shutting') return <ShutScreen />;
  if (st.phase === 'off') return <OffScreen onPower={os.powerOn} />;

  return (
    <div className={'w95 ' + (st.compact ? 'compact' : '')} style={themeVars(settings)}>
      <div className="desktop" style={wallStyle} onPointerDown={(e) => { if (e.target === e.currentTarget) setSel([]); }} onContextMenu={deskMenu}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) importFiles(os, [...e.dataTransfer.files], 'desktop'); }}>
        {items.map((it, i) => {
          const p = drag?.id === it.id ? drag : posOf(it, i);
          return (
            <div key={it.id} className={'dicon ' + (sel.includes(it.id) ? 'sel' : '')} style={{ left: p.x, top: p.y, width: CELL_W - 4 }}
              onPointerDown={(e) => startDragIcon(e, it, i)} onClick={(e) => { e.stopPropagation(); if (coarse) it.open(); }} onDoubleClick={() => !coarse && it.open()}
              onContextMenu={(e) => iconMenu(e, it)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') it.open(); if (e.key === 'Delete' && it.node) deleteNodes(os, [it.node.id]); if (e.key === 'F2' && it.node) renameNode(os, it.node); }}>
              <Icon name={it.icon} size={32} /><span>{it.label}</span>
            </div>
          );
        })}
        {st.wins.map((w) => <Win key={w.id} w={w} active={st.active === w.id} compact={st.compact} />)}
        <Suspense fallback={null}>
          <SmartTransferToastHost os={os} />
        </Suspense>
      </div>

      <div className="taskbar" onContextMenu={taskbarMenu}>
        <button ref={startRef} className={'btn start-btn ' + (st.startOpen ? 'pressed' : '')} onClick={() => os.setStart(!st.startOpen)}><Icon name="flag" size={18} /><b>Start</b></button>
        <div className="tb-sep" />
        <div className="quick-launch">
          <button className="ql-btn" title="Show Desktop" onClick={os.minimizeAll}><Icon name="display" size={16} /></button>
          <button className="ql-btn" title="Internet Browser" onClick={() => os.open('browser')}><Icon name="browser" size={16} /></button>
          <button className="ql-btn" title="Adobe Acrobat Reader 5.0" onClick={() => os.open('acrobat')}><Icon name="acrobat" size={16} /></button>
        </div>
        <div className="tb-sep" />
        <div className="tasks">
          {st.wins.map((w) => (
            <button key={w.id} className={'btn task-btn ' + (st.active === w.id ? 'pressed' : '')} title={w.title}
              onClick={() => (st.active === w.id ? os.minimize(w.id) : os.focus(w.id))} onContextMenu={(e) => taskMenu(e, w)}>
              <Icon name={w.icon} size={16} /><span>{w.title}</span>
            </button>
          ))}
        </div>
        <div className="tray sunken">
          <span className="tray-ico" title={settings.sounds.enabled ? 'Volume (click to mute)' : 'Muted (click to unmute)'} onClick={() => setSettings((s) => ({ sounds: { ...s.sounds, enabled: !s.sounds.enabled } }))}><Icon name={settings.sounds.enabled ? 'speaker' : 'speakerMute'} size={16} /></span>
          <span className="tray-ico" title="Toggle full screen" onClick={toggleFs}><Icon name="fullscreen" size={14} /></span>
          <Clock onOpen={() => os.open('control', { applet: 'datetime' })} />
        </div>
      </div>

      {st.startOpen && (
        <div className="start-menu raised">
          <div className="start-banner"><span>Windows<b>95</b></span></div>
          <MenuList items={startItems} large className="start" onClose={() => os.setStart(false)} />
        </div>
      )}
      {st.menu && <ContextMenu key={st.menu.k} menu={st.menu} onClose={os.hideMenu} />}
      {st.dialogs.map((d) => {
        const done = (v) => os.resolveDialog(d.id, v);
        if (d.kind === 'msg') return <MsgBox key={d.id} opts={d.opts} onDone={done} />;
        if (d.kind === 'prompt') return <PromptBox key={d.id} opts={d.opts} onDone={done} />;
        if (d.kind === 'file') return <FileDialog key={d.id} opts={d.opts} onDone={done} />;
        return <div key={d.id}>{d.opts.render(done)}</div>;
      })}
    </div>
  );
}

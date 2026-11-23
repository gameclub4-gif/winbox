import { useState, useEffect, useMemo } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, Tabs, StatusBar } from '../os/widgets.jsx';
import Icon, { iconForFile } from '../os/icons.jsx';
import { useSettings, setSettings, applyTheme, THEMES, PATTERNS, BLISS } from '../os/settings.js';
import { play, SOUND_EVENTS } from '../os/sound.js';
import * as fs from '../os/fs.js';
import { fmtSize } from '../os/actions.js';
import { pickLocalFiles } from '../os/localFiles.js';

const APPLETS = [
  ['display', 'Display', 'display'], ['themes', 'Desktop Themes', 'themes'], ['sounds', 'Sounds', 'sound'],
  ['system', 'System', 'system'], ['datetime', 'Date/Time', 'clock'],
];

function Buttons({ onOk, onCancel, onApply, dirty }) {
  return (
    <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
      <button className="btn default" onClick={onOk}>OK</button><button className="btn" onClick={onCancel}>Cancel</button>
      <button className="btn" disabled={!dirty} onClick={onApply}>Apply</button>
    </div>
  );
}

function Preview({ s, onDropFile }) {
  const t = THEMES[s.theme] || THEMES.win95;
  const nodeId = s.wallpaper?.startsWith('fs:') ? s.wallpaper.slice(3) : null;
  const node = nodeId ? fs.get(nodeId) : null;
  const customUrl = useMemo(() => (node ? fs.blobUrl(node) : null), [node, node?.modified]); // eslint-disable-line
  useEffect(() => () => { if (customUrl) URL.revokeObjectURL(customUrl); }, [customUrl]);

  const style = { background: s.desktop || t.desktop };
  if (s.wallpaper === 'bliss' || customUrl) {
    style.backgroundImage = `url("${customUrl || BLISS}")`;
    style.backgroundRepeat = s.wallpaperMode === 'tile' ? 'repeat' : 'no-repeat';
    style.backgroundSize = s.wallpaperMode === 'stretch' ? 'cover' : 'auto';
    style.backgroundPosition = 'center';
  } else if (s.wallpaper.startsWith('pattern:') && PATTERNS[s.wallpaper.slice(8)]) {
    style.backgroundImage = PATTERNS[s.wallpaper.slice(8)].css;
    style.backgroundSize = PATTERNS[s.wallpaper.slice(8)].size;
  }
  return (
    <div
      className="monitor"
      onDragOver={(e) => { if (onDropFile) e.preventDefault(); }}
      onDrop={(e) => {
        if (!onDropFile) return;
        const f = e.dataTransfer?.files?.[0];
        if (f && (f.type.startsWith('image/') || /\.(png|jpe?g|gif|bmp|webp)$/i.test(f.name))) {
          e.preventDefault();
          onDropFile(f);
        }
      }}
      title={onDropFile ? 'Drop a local image here to set as background' : undefined}
    >
      <div className="screen sunken" style={style}>
        <div className="pv-win" style={{ background: t.face, color: t.text }}>
          <div style={{ background: `linear-gradient(90deg,${t.titleA},${t.titleB})`, color: '#fff', padding: '1px 3px', fontSize: 9 }}>Active Window</div>
          <div style={{ padding: 3, fontSize: 9 }}>Window Text<div style={{ background: t.hl, color: t.hlText, display: 'inline-block', marginLeft: 4, padding: '0 3px' }}>Selected</div></div>
        </div>
      </div>
    </div>
  );
}

function Display({ onClose }) {
  const os = useOS();
  const cur = useSettings();
  fs.useFS();
  const [d, setD] = useState({ theme: cur.theme, desktop: cur.desktop, wallpaper: cur.wallpaper, wallpaperMode: cur.wallpaperMode, dragFull: cur.dragFull });
  const [tab, setTab] = useState('bg');
  const dirty = JSON.stringify(d) !== JSON.stringify({ theme: cur.theme, desktop: cur.desktop, wallpaper: cur.wallpaper, wallpaperMode: cur.wallpaperMode, dragFull: cur.dragFull });
  const apply = () => setSettings(d);

  const savedWalls = fs.children('win').filter((n) => n.type === 'file' && /\.(png|jpe?g|gif|bmp|webp)$/i.test(n.name));
  const walls = [
    ['none', '(None)'],
    ['bliss', 'Bliss (Hills)'],
    ...Object.entries(PATTERNS).map(([k, v]) => ['pattern:' + k, v.name]),
    ...savedWalls.map((n) => ['fs:' + n.id, n.name]),
  ];
  if (d.wallpaper.startsWith('fs:') && !walls.some((w) => w[0] === d.wallpaper)) {
    walls.push([d.wallpaper, fs.get(d.wallpaper.slice(3))?.name || 'Custom image']);
  }

  const importLocalWallpaper = async (file) => {
    try {
      const n = await fs.importFile(file, 'win');
      setD((prev) => ({ ...prev, wallpaper: 'fs:' + n.id }));
    } catch (e) {
      os.msg({ icon: 'error', title: 'Display Properties', text: 'Could not load background image: ' + e.message });
    }
  };

  const browseC = async () => {
    const n = await os.fileDialog({ mode: 'open', exts: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'], title: 'Browse Drive C: for wallpaper', start: 'docs' });
    if (n) setD({ ...d, wallpaper: 'fs:' + n.id });
  };

  const loadLocalPC = async () => {
    const picked = await pickLocalFiles({
      accept: 'image/*,.png,.jpg,.jpeg,.gif,.bmp,.webp',
      types: [{ description: 'Wallpaper Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'] } }],
    });
    if (picked?.file) await importLocalWallpaper(picked.file);
  };

  return (
    <div className="applet">
      <Tabs tabs={[{ id: 'bg', label: 'Background' }, { id: 'app', label: 'Appearance' }, { id: 'set', label: 'Settings' }]} value={tab} onChange={setTab}>
        <Preview s={d} onDropFile={importLocalWallpaper} />
        {tab === 'bg' && <>
          <div className="gb-title-line">Wallpaper (or drop an image onto the monitor above)</div>
          <div className="field fd-list" style={{ height: 108 }}>{walls.map(([id, l]) => <div key={id} className={'fd-item ' + (d.wallpaper === id ? 'sel' : '')} onClick={() => setD({ ...d, wallpaper: id })}>{l}</div>)}</div>
          <div className="fd-row" style={{ flexWrap: 'wrap' }}>
            <button className="btn default" onClick={loadLocalPC}>Load from PC...</button>
            <button className="btn" onClick={browseC}>Browse C:...</button>
            <span style={{ marginLeft: 4 }}>Display:</span>
            {['center', 'tile', 'stretch'].map((m) => <label key={m}><input type="radio" checked={d.wallpaperMode === m} onChange={() => setD({ ...d, wallpaperMode: m })} /> {m[0].toUpperCase() + m.slice(1)}</label>)}</div>
          <div className="fd-row"><label>Desktop colour:</label><input type="color" value={d.desktop || THEMES[d.theme].desktop} onChange={(e) => setD({ ...d, desktop: e.target.value })} />
            <button className="btn" onClick={() => setD({ ...d, desktop: null })}>Reset</button></div>
        </>}
        {tab === 'app' && <>
          <div className="gb-title-line">Scheme:</div>
          <select className="field" style={{ width: '100%' }} value={d.theme} onChange={(e) => setD({ ...d, theme: e.target.value, desktop: null })}>{Object.entries(THEMES).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}</select>
          <p style={{ marginTop: 8 }}>Schemes change the title bar, window and highlight colours. Use “Desktop Themes” to also change the wallpaper at the same time.</p>
        </>}
        {tab === 'set' && <>
          <label className="radio"><input type="checkbox" checked={d.dragFull} onChange={(e) => setD({ ...d, dragFull: e.target.checked })} /> Show window contents while dragging</label>
          <div className="groupbox"><span className="gb-title">Screen area</span>{window.innerWidth} × {window.innerHeight} pixels · {screen.colorDepth}-bit colour</div>
          <button className="btn" onClick={() => setSettings({ iconPos: {}, arrange: null })}>Line up desktop icons</button>{' '}
          <button className="btn" onClick={() => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (e) { os.msg({ icon: 'warning', text: 'Fullscreen is not available here.' }); } }}>Toggle full screen</button>
        </>}
      </Tabs>
      <Buttons dirty={dirty} onOk={() => { apply(); onClose(); }} onCancel={onClose} onApply={apply} />
    </div>
  );
}

function Themes({ onClose }) {
  const cur = useSettings();
  const [sel, setSel] = useState(cur.theme);
  const t = THEMES[sel];
  return (
    <div className="applet">
      <div className="fd-row"><label>Theme:</label>
        <select className="field" style={{ flex: 1 }} value={sel} onChange={(e) => setSel(e.target.value)}>{Object.entries(THEMES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></div>
      <Preview s={{ theme: sel, desktop: null, wallpaper: t.wallpaper, wallpaperMode: 'stretch' }} />
      <p>Applying a theme changes the colour scheme, desktop colour and wallpaper.{sel === 'bliss' && ' (The Bliss wallpaper is loaded from the Internet.)'}</p>
      <Buttons dirty={sel !== cur.theme} onOk={() => { applyTheme(sel); onClose(); }} onCancel={onClose} onApply={() => applyTheme(sel)} />
    </div>
  );
}

function Sounds({ onClose }) {
  const s = useSettings().sounds;
  const [ev, setEv] = useState('startup');
  const set = (p) => setSettings({ sounds: { ...s, ...p } });
  return (
    <div className="applet">
      <label className="radio"><input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Enable system sounds</label>
      <label className="radio"><input type="checkbox" checked={s.startup} onChange={(e) => set({ startup: e.target.checked })} /> Play the Windows startup sound</label>
      <div className="fd-row"><label>Volume:</label><input type="range" min="0" max="1" step="0.05" value={s.volume} onChange={(e) => set({ volume: +e.target.value })} style={{ flex: 1 }} /><span>{Math.round(s.volume * 100)}%</span></div>
      <div className="gb-title-line">Events:</div>
      <div className="field fd-list" style={{ height: 130 }}>{SOUND_EVENTS.map((e) => <div key={e.id} className={'fd-item ' + (ev === e.id ? 'sel' : '')} onClick={() => setEv(e.id)} onDoubleClick={() => play(e.id, true)}><Icon name="speaker" size={16} />{e.label}</div>)}</div>
      <div className="btn-row" style={{ justifyContent: 'flex-start' }}><button className="btn" onClick={() => play(ev, true)}>▶ Preview</button><button className="btn" onClick={onClose}>Close</button></div>
    </div>
  );
}

function System({ onClose }) {
  const os = useOS();
  const [tab, setTab] = useState('gen');
  const [est, setEst] = useState(null);
  const [busy, setBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');
  fs.useFS();
  useEffect(() => { navigator.storage?.estimate?.().then(setEst).catch(() => {}); }, [tab]);
  const reset = async () => {
    const r = await os.msg({ icon: 'warning', title: 'Reset Windows', text: 'This will erase ALL files on the virtual C: drive and reset all settings, bookmarks and game data stored in this browser.\n\nContinue?', buttons: ['Yes', 'No'] });
    if (r !== 'Yes') return;
    await fs.reset();
    Object.keys(localStorage).filter((k) => k.startsWith('win95')).forEach((k) => localStorage.removeItem(k));
    location.reload();
  };

  const exportBackup = async () => {
    setBusy(true);
    setBackupMsg('Packaging C:\\ drive, wallpapers & settings into ZIP...');
    try {
      const { createVirtualPCBackup } = await import('../utils/backup.js');
      const res = await createVirtualPCBackup();
      setBackupMsg(`Exported ${res.filename} (${res.fileCount} files, ${fmtSize(res.archiveBytes)})`);
    } catch (e) {
      setBackupMsg('Export failed: ' + e.message);
      os.msg({ icon: 'error', title: 'Virtual PC Backup', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async () => {
    const picked = await pickLocalFiles({
      accept: '.zip',
      types: [{ description: 'Win95 Backup Archive', accept: { 'application/zip': ['.zip'] } }],
    });
    if (!picked?.file) return;
    const confirm = await os.msg({
      icon: 'question',
      title: 'Restore Virtual PC Backup',
      text: `Restore Virtual PC from "${picked.name}"?\n\nThis replaces your current virtual C: drive, wallpapers, playlists, and settings.`,
      buttons: ['Yes', 'No'],
    });
    if (confirm !== 'Yes') return;
    setBusy(true);
    setBackupMsg('Restoring C:\\ drive and settings from ZIP...');
    try {
      const { restoreVirtualPCBackup } = await import('../utils/backup.js');
      const res = await restoreVirtualPCBackup(picked.file);
      setBackupMsg(`Restored ${res.fileCount} files and ${res.restoredSettingsCount} setting group(s).`);
      os.msg({ icon: 'info', title: 'Restore Complete', text: `Successfully restored ${res.fileCount} files onto Drive C:, wallpapers, and settings.` });
    } catch (e) {
      setBackupMsg('Restore failed: ' + e.message);
      os.msg({ icon: 'error', title: 'Restore Failed', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const rows = [['Browser', navigator.userAgent.replace(/\).*/, ')').slice(0, 80)], ['Language', navigator.language], ['Logical processors', navigator.hardwareConcurrency || 'unknown'], ['Memory', navigator.deviceMemory ? `${navigator.deviceMemory} GB (approx.)` : 'unknown'], ['Display', `${screen.width} × ${screen.height} (${devicePixelRatio}x)`], ['Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone]];
  const used = fs.folderSize(fs.ROOT);
  return (
    <div className="applet">
      <Tabs tabs={[{ id: 'gen', label: 'General' }, { id: 'disk', label: 'Storage' }]} value={tab} onChange={setTab}>
        {tab === 'gen' && <div style={{ display: 'flex', gap: 14 }}><Icon name="computer" size={48} />
          <div><b>System:</b><br />&nbsp;&nbsp;Microsoft Windows 95<br />&nbsp;&nbsp;Smart Edition 4.00.950 C<br /><br /><b>Registered to:</b><br />&nbsp;&nbsp;You<br />&nbsp;&nbsp;{location.hostname || 'localhost'}<br /><br />
            <b>Computer:</b><br />{rows.map(([k, v]) => <div key={k} style={{ paddingLeft: 12 }}>{k}: {String(v)}</div>)}</div></div>}
        {tab === 'disk' && <div>
          <div className="groupbox"><span className="gb-title">Drive C:</span>Files stored: {fmtSize(used)}<br />Browser storage used: {est ? fmtSize(est.usage || 0) : '…'} of {est ? fmtSize(est.quota || 0) : '…'}
            <div className="sunken" style={{ height: 16, marginTop: 6, background: '#fff', padding: 2 }}><div style={{ height: '100%', width: `${est ? Math.max(1, ((est.usage || 0) / (est.quota || 1)) * 100) : 1}%`, background: '#000080' }} /></div></div>
          <div className="groupbox"><span className="gb-title">Virtual PC Backup &amp; Restore (.zip)</span>
            Export or restore your entire Drive C:, custom wallpapers, playlists, bookmarks, and Windows 95 settings in one ZIP file.
            <div className="btn-row" style={{ justifyContent: 'flex-start', marginTop: 6 }}>
              <button className="btn default" disabled={busy} onClick={exportBackup}>Export Backup (.zip)...</button>
              <button className="btn" disabled={busy} onClick={restoreBackup}>Restore Backup (.zip)...</button>
            </div>
            {backupMsg && <div style={{ marginTop: 6, fontSize: 11 }}>{backupMsg}</div>}
          </div>
          <p>Your files live in IndexedDB in this browser profile. Clearing site data removes them.</p>
          <button className="btn" disabled={busy} onClick={reset}>Reset virtual PC...</button></div>}
      </Tabs>
      <div className="btn-row" style={{ justifyContent: 'flex-end' }}><button className="btn default" onClick={onClose}>OK</button></div>
    </div>
  );
}

function DateTime({ onClose }) {
  const [now, setNow] = useState(new Date());
  const [m, setM] = useState({ y: now.getFullYear(), m: now.getMonth() });
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(i); }, []);
  const first = new Date(m.y, m.m, 1).getDay(), days = new Date(m.y, m.m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const ang = (v, max) => (v / max) * 360;
  const hands = [[ang((now.getHours() % 12) + now.getMinutes() / 60, 12), 20, 3], [ang(now.getMinutes() + now.getSeconds() / 60, 60), 28, 2], [ang(now.getSeconds(), 60), 30, 1]];
  return (
    <div className="applet">
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div className="groupbox" style={{ flex: 1, minWidth: 180 }}><span className="gb-title">Date</span>
          <div className="fd-row"><button className="btn sq" onClick={() => setM((x) => (x.m === 0 ? { y: x.y - 1, m: 11 } : { ...x, m: x.m - 1 }))}>◀</button>
            <b style={{ flex: 1, textAlign: 'center' }}>{new Date(m.y, m.m).toLocaleString([], { month: 'long', year: 'numeric' })}</b>
            <button className="btn sq" onClick={() => setM((x) => (x.m === 11 ? { y: x.y + 1, m: 0 } : { ...x, m: x.m + 1 }))}>▶</button></div>
          <div className="cal">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <b key={i}>{d}</b>)}
            {cells.map((c, i) => <span key={i} className={c && c === now.getDate() && m.m === now.getMonth() && m.y === now.getFullYear() ? 'today' : ''}>{c}</span>)}</div>
        </div>
        <div className="groupbox" style={{ width: 150 }}><span className="gb-title">Time</span>
          <svg width="110" height="110" viewBox="-35 -35 70 70" style={{ display: 'block', margin: '0 auto', background: '#fff' }} className="sunken">
            {[...Array(12)].map((_, i) => <line key={i} x1="0" y1="-29" x2="0" y2="-33" stroke="#000" transform={`rotate(${i * 30})`} />)}
            {hands.map(([a, l, w], i) => <line key={i} x1="0" y1="0" x2="0" y2={-l} stroke={i === 2 ? '#f00' : '#000'} strokeWidth={w} transform={`rotate(${a})`} />)}
          </svg>
          <div style={{ textAlign: 'center', marginTop: 6, fontSize: 14 }}>{now.toLocaleTimeString()}</div>
          <div style={{ textAlign: 'center', marginTop: 4 }}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</div></div>
      </div>
      <p>The clock follows your computer's system time.</p>
      <div className="btn-row" style={{ justifyContent: 'flex-end' }}><button className="btn default" onClick={onClose}>OK</button></div>
    </div>
  );
}

export default function ControlPanel({ win, props }) {
  const os = useOS();
  const applet = props.applet;
  useEffect(() => {
    if (applet) { const a = APPLETS.find((x) => x[0] === applet); if (a) os.setTitle(win.id, a[1] + (applet === 'display' ? ' Properties' : ''), a[2]); }
    else os.setTitle(win.id, 'Control Panel', 'control');
  }, [applet, win.id, os, win.nonce]);
  if (applet) {
    const close = () => os.close(win.id);
    const C = { display: Display, themes: Themes, sounds: Sounds, system: System, datetime: DateTime }[applet] || Display;
    return <div className="app" style={{ overflow: 'auto' }}><C onClose={close} /></div>;
  }
  return (
    <div className="app">
      <MenuBar menus={[{ label: '&File', items: [{ label: '&Close', onClick: () => os.close(win.id) }] }, { label: '&Help', items: [{ label: '&Help Topics', onClick: () => os.open('help') }] }]} />
      <div className="field icon-grid">
        {APPLETS.map(([id, label, icon]) => (
          <div key={id} className="grid-icon" tabIndex={0} onDoubleClick={() => os.open('control', { applet: id })} onClick={(e) => e.detail === 1 && matchMedia('(pointer: coarse)').matches && os.open('control', { applet: id })} onKeyDown={(e) => e.key === 'Enter' && os.open('control', { applet: id })}>
            <Icon name={icon} size={32} /><span>{label}</span>
          </div>
        ))}
      </div>
      <StatusBar><span>{APPLETS.length} object(s)</span></StatusBar>
    </div>
  );
}

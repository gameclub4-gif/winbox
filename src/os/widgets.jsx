import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import Icon, { iconForFile } from './icons.jsx';
import * as fs from './fs.js';
import { useOS } from './OS.jsx';

const label = (s) => {
  const i = s.indexOf('&');
  if (i < 0 || i === s.length - 1) return s;
  return <>{s.slice(0, i)}<u>{s[i + 1]}</u>{s.slice(i + 2)}</>;
};

export function MenuList({ items, onClose, className = '', large }) {
  const [open, setOpen] = useState(-1);
  return (
    <div className={'menu ' + className} onContextMenu={(e) => e.preventDefault()}>
      {items.filter(Boolean).map((it, i) =>
        it.sep ? <div key={i} className="menu-sep" /> : (
          <div
            key={i}
            className={`menu-item ${it.disabled ? 'dis' : ''} ${open === i ? 'hot' : ''} ${it.bold ? 'bold' : ''}`}
            onMouseEnter={() => setOpen(it.sub && !it.disabled ? i : -1)}
            onClick={(e) => {
              e.stopPropagation();
              if (it.disabled) return;
              if (it.sub) { setOpen(i); return; }
              onClose && onClose();
              it.onClick && it.onClick();
            }}
          >
            <span className="mi-check">{it.checked ? (it.radio ? '●' : '✓') : ''}</span>
            {it.icon && <Icon name={it.icon} size={large ? 32 : 16} />}
            <span className="mi-label">{label(it.label)}</span>
            {it.shortcut && <span className="mi-sc">{it.shortcut}</span>}
            {it.sub && <span className="mi-arrow">▶</span>}
            {it.sub && open === i && <div className="submenu"><MenuList items={it.sub} onClose={onClose} /></div>}
          </div>
        ))}
    </div>
  );
}

export function MenuBar({ menus }) {
  const [open, setOpen] = useState(-1);
  const ref = useRef();
  useEffect(() => {
    if (open < 0) return;
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(-1); };
    document.addEventListener('pointerdown', h, true);
    return () => document.removeEventListener('pointerdown', h, true);
  }, [open]);
  return (
    <div className="menubar" ref={ref}>
      {menus.map((m, i) => (
        <div key={i} className={'mb-item ' + (open === i ? 'on' : '')} onClick={() => setOpen(open === i ? -1 : i)} onMouseEnter={() => open >= 0 && setOpen(i)}>
          {label(m.label)}
          {open === i && <div className="mb-drop"><MenuList items={typeof m.items === 'function' ? m.items() : m.items} onClose={() => setOpen(-1)} /></div>}
        </div>
      ))}
    </div>
  );
}

export function ContextMenu({ menu, onClose }) {
  const ref = useRef();
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  useLayoutEffect(() => {
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.max(0, Math.min(menu.x, innerWidth - r.width - 2)), y: Math.max(0, Math.min(menu.y, innerHeight - r.height - 32)) });
  }, [menu]);
  useEffect(() => {
    const h = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', h, true);
    document.addEventListener('keydown', k);
    window.addEventListener('blur', onClose);
    return () => { document.removeEventListener('pointerdown', h, true); document.removeEventListener('keydown', k); window.removeEventListener('blur', onClose); };
  }, [onClose]);
  return <div className="ctx raised" ref={ref} style={{ left: pos.x, top: pos.y }}><MenuList items={menu.items} onClose={onClose} /></div>;
}

export function Dialog({ title, icon, onClose, children, width = 340, className = '' }) {
  return (
    <div className="shield" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <div className={'window active dialog ' + className} style={{ width }} role="dialog" aria-label={title}>
        <div className="titlebar">
          {icon && <Icon name={icon} size={16} />}
          <span className="title-text">{title}</span>
          {onClose && <button className="tb-btn close" onClick={onClose} aria-label="Close"><svg width="8" height="7" viewBox="0 0 8 7"><path d="M0 0h2l2 2 2-2h2L5 3.500 8 7H6L4 5 2 7H0l3-3.500z" /></svg></button>}
        </div>
        <div className="dlg-body">{children}</div>
      </div>
    </div>
  );
}

export function MsgBox({ opts, onDone }) {
  const buttons = opts.buttons || ['OK'];
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, []);
  const cancel = buttons.includes('Cancel') ? 'Cancel' : buttons.includes('No') ? 'No' : buttons[buttons.length - 1];
  return (
    <Dialog title={opts.title || 'Windows 95'} onClose={() => onDone(cancel)} width={opts.width || 340}>
      <div tabIndex={-1} ref={ref} style={{ outline: 'none' }} onKeyDown={(e) => { if (e.key === 'Escape') onDone(cancel); if (e.key === 'Enter' && e.target === ref.current) onDone(buttons[0]); }}>
        <div className="msg-row">
          {opts.icon && <Icon name={opts.icon} size={32} />}
          <div className="msg-text">{opts.text}</div>
        </div>
        <div className="btn-row">
          {buttons.map((b, i) => <button key={b} className={'btn ' + (i === 0 ? 'default' : '')} onClick={() => onDone(b)}>{b}</button>)}
        </div>
      </div>
    </Dialog>
  );
}

export function PromptBox({ opts, onDone }) {
  const [v, setV] = useState(opts.value || '');
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <Dialog title={opts.title || 'Windows 95'} onClose={() => onDone(null)} width={opts.width || 360}>
      <form onSubmit={(e) => { e.preventDefault(); onDone(v); }}>
        <div className="msg-text" style={{ marginBottom: 8 }}>{opts.label}</div>
        <input ref={ref} className="field" style={{ width: '100%' }} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onDone(null)} />
        <div className="btn-row"><button className="btn default" type="submit">OK</button><button type="button" className="btn" onClick={() => onDone(null)}>Cancel</button></div>
      </form>
    </Dialog>
  );
}

export function FileDialog({ opts, onDone }) {
  const os = useOS();
  fs.useFS();
  const { mode = 'open', exts = null, name: initName = '', title, start = 'docs' } = opts;
  const [cwd, setCwd] = useState(fs.get(start) ? start : fs.ROOT);
  const [name, setName] = useState(initName);
  const [sel, setSel] = useState(null);
  const fileInput = useRef();
  const items = fs.children(cwd).filter((n) => n.type === 'folder' || !exts || exts.includes(fs.ext(n.name)));
  const cur = fs.get(cwd);
  const accept = async (n) => {
    if (mode === 'open') { if (n) onDone(n); return; }
    let nm = name.trim();
    if (!nm) return;
    if (exts && !fs.ext(nm) ) nm += '.' + exts[0];
    const existing = fs.children(cwd).find((c) => c.name.toLowerCase() === nm.toLowerCase());
    if (existing?.type === 'folder') { setCwd(existing.id); setName(''); return; }
    if (existing) {
      const r = await os.msg({ title: 'Save As', icon: 'warning', text: `${nm} already exists.\nDo you want to replace it?`, buttons: ['Yes', 'No'] });
      if (r !== 'Yes') return;
    }
    onDone({ parent: cwd, name: nm, existing });
  };
  const click = (n) => { setSel(n.id); if (n.type === 'file') setName(n.name); };
  const dbl = (n) => { if (n.type === 'folder') { setCwd(n.id); setSel(null); } else if (mode === 'open') accept(n); else accept(); };
  const onOpen = () => {
    const n = fs.get(sel);
    if (mode === 'open') {
      if (n?.type === 'folder') return setCwd(n.id);
      const byName = fs.children(cwd).find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
      if (n || byName) accept(n?.type === 'file' ? n : byName);
    } else accept();
  };
  const upload = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { const n = await fs.importFile(f, cwd); setSel(n.id); setName(n.name); } catch (err) { os.msg({ icon: 'error', text: err.message }); }
  };
  const newFolder = async () => {
    const nm = await os.prompt({ title: 'New Folder', label: 'Folder name:', value: 'New Folder' });
    if (nm) try { fs.create({ name: nm, parent: cwd, type: 'folder' }); } catch (err) { os.msg({ icon: 'error', text: err.message }); }
  };
  return (
    <Dialog title={title || (mode === 'open' ? 'Open' : 'Save As')} onClose={() => onDone(null)} width={440} className="file-dlg">
      <div className="fd-row">
        <label>{mode === 'open' ? 'Look in:' : 'Save in:'}</label>
        <input className="field" readOnly value={fs.pathOf(cwd)} style={{ flex: 1 }} />
        <button className="btn sq" title="Up one level" disabled={!cur?.parent} onClick={() => { setCwd(cur.parent); setSel(null); }}>⬑</button>
        <button className="btn sq" title="Create new folder" onClick={newFolder}>✚</button>
      </div>
      <div className="field fd-list" tabIndex={0}>
        {items.length === 0 && <div style={{ padding: 6, color: '#808080' }}>(This folder is empty)</div>}
        {items.map((n) => (
          <div key={n.id} className={'fd-item ' + (sel === n.id ? 'sel' : '')} onClick={() => click(n)} onDoubleClick={() => dbl(n)}>
            <Icon name={iconForFile(n)} size={16} /><span>{n.name}</span>
          </div>
        ))}
      </div>
      <div className="fd-row"><label style={{ width: 70 }}>File name:</label>
        <input className="field" style={{ flex: 1 }} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onOpen()} autoFocus />
        <button className="btn" style={{ width: 70 }} onClick={onOpen}>{mode === 'open' ? 'Open' : 'Save'}</button>
      </div>
      <div className="fd-row"><label style={{ width: 70 }}>Files of type:</label>
        <input className="field" readOnly style={{ flex: 1 }} value={exts ? exts.map((e) => '*.' + e).join(', ') : 'All Files (*.*)'} />
        <button className="btn" style={{ width: 70 }} onClick={() => onDone(null)}>Cancel</button>
      </div>
      {mode === 'open' && (
        <div className="fd-row">
          <button className="btn" onClick={() => fileInput.current.click()}>Import from computer...</button>
          <input ref={fileInput} type="file" hidden onChange={upload} accept={exts ? exts.map((e) => '.' + e).join(',') : undefined} />
        </div>
      )}
    </Dialog>
  );
}

export function Tabs({ tabs, value, onChange, children }) {
  return (
    <div className="tabs">
      <div className="tab-strip">
        {tabs.map((t) => <button key={t.id} className={'tab ' + (value === t.id ? 'on' : '')} onClick={() => onChange(t.id)}>{t.label}</button>)}
      </div>
      <div className="tab-page raised">{children}</div>
    </div>
  );
}

export const StatusBar = ({ children }) => <div className="statusbar">{children}</div>;

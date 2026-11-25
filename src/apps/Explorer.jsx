import { useState, useEffect, useRef } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import Icon, { iconForFile } from '../os/icons.jsx';
import * as fs from '../os/fs.js';
import { newItem, deleteNodes, renameNode, showProps, importFiles, fmtSize } from '../os/actions.js';
import { setSettings } from '../os/settings.js';
import { pickLocalDirectory } from '../utils/localFolder.js';
import { useVirtualDrives, mountRemovableFolder } from '../utils/virtualDrives.js';

export default function Explorer({ win, props }) {
  const os = useOS();
  fs.useFS();
  const vd = useVirtualDrives();
  const start = props.folderId === undefined ? fs.ROOT : props.folderId;
  const [hist, setHist] = useState({ list: [start], i: 0 });
  const cwd = hist.list[hist.i];
  const [view, setView] = useState('large');
  const [tree, setTree] = useState(true);
  const [sel, setSel] = useState([]);
  const [exp, setExp] = useState(new Set([fs.ROOT]));
  const [find, setFind] = useState(!!props.find);
  const [q, setQ] = useState('');
  const [addr, setAddr] = useState('');
  const fileIn = useRef();
  const [, force] = useState(0);

  const go = (id) => {
    if (id === cwd) return;
    setHist((h) => ({ list: [...h.list.slice(0, h.i + 1), id], i: h.i + 1 }));
    setSel([]); setQ('');
  };
  const back = () => hist.i > 0 && (setHist((h) => ({ ...h, i: h.i - 1 })), setSel([]));
  const fwd = () => hist.i < hist.list.length - 1 && (setHist((h) => ({ ...h, i: h.i + 1 })), setSel([]));
  const node = cwd ? fs.get(cwd) : null;
  const up = () => { if (cwd === null) return; go(node?.parent ?? null); };

  // recover when folder was deleted/moved to trash
  useEffect(() => { if (cwd && (!node || node.trashed)) go(fs.ROOT); }); // eslint-disable-line
  useEffect(() => { if (props.nonce || win.nonce) { if (props.folderId !== undefined) go(props.folderId); } }, [win.nonce]); // eslint-disable-line
  useEffect(() => {
    const path = cwd ? fs.pathOf(cwd) : 'My Computer';
    setAddr(path);
    os.setTitle(win.id, cwd ? `Exploring - ${path}` : 'My Computer', cwd ? 'explorer' : 'computer');
    if (cwd) setExp((e) => { const n = new Set(e); let p = fs.get(cwd); while (p) { n.add(p.id); p = p.parent ? fs.get(p.parent) : null; } return n; });
  }, [cwd, win.id, os, node?.name]);

  const searching = find && q.trim();
  let entries;
  if (searching) entries = fs.search(q.trim()).map((n) => ({ key: n.id, name: n.name, node: n, icon: iconForFile(n), where: fs.pathOf(n.parent) }));
  else if (cwd === null) entries = [
    { key: 'a', name: vd.floppyA ? `(A:) ${vd.floppyA.name}` : '(A:) 3.5" Floppy', icon: 'zip', typeLabel: vd.floppyA ? 'Floppy (Mounted)' : '3.5" Floppy Drive', open: () => os.open('drives') },
    { key: 'c', name: '(C:)', icon: 'drive', typeLabel: 'Local Disk', open: () => go(fs.ROOT), size: null },
    { key: 'd', name: vd.cdromD ? `(D:) ${vd.cdromD.name}` : '(D:) CD-ROM', icon: 'media', typeLabel: vd.cdromD ? 'Optical Disc (Mounted)' : 'CD-ROM Drive', open: () => os.open('drives') },
    ...vd.removable.map((r) => ({
      key: r.id,
      name: `(${r.letter}) ${r.name}`,
      icon: r.kind === 'folder' ? 'folderOpen' : 'drive',
      typeLabel: r.kind === 'folder' ? `PC Folder (${r.fileCount} files)` : 'Removable Disk',
      open: () => os.open('drives'),
    })),
    { key: 'drives', name: 'Virtual Drive Manager', icon: 'drive', typeLabel: 'System Utility', open: () => os.open('drives') },
    { key: 'cp', name: 'Control Panel', icon: 'control', typeLabel: 'System Folder', open: () => os.open('control') },
    { key: 'rb', name: 'Recycle Bin', icon: fs.trashList().length ? 'recycleFull' : 'recycle', typeLabel: 'System Folder', open: () => os.open('recycle') },
  ];
  else entries = fs.children(cwd).map((n) => ({ key: n.id, name: n.name, node: n, icon: iconForFile(n) }));

  const selNodes = sel.map((id) => fs.get(id)).filter((n) => n && !n.trashed);
  const openEntry = (e) => (e.open ? e.open() : e.node.type === 'folder' ? go(e.node.id) : os.openNode(e.node));
  const doDelete = (perm) => deleteNodes(os, selNodes.map((n) => n.id), perm).then((ok) => ok && setSel([]));
  const paste = () => { try { const made = fs.paste(cwd); setSel(made.map((n) => n.id)); } catch (e) { os.msg({ icon: 'error', text: e.message }); } };
  const canPaste = cwd && fs.clip.ids.length > 0;
  const importIt = async (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) await importFiles(os, files, cwd || fs.ROOT); };
  const mountLocalFolder = async () => {
    const res = await pickLocalDirectory();
    if (!res) return;
    const rem = mountRemovableFolder(res);
    os.msg({ icon: 'info', title: 'Local Folder Mounted', text: `Mounted "${res.name}" as ${rem.letter} (${res.entries.length} file(s), zero-copy).\nOpening Virtual Drive Manager...` });
    os.open('drives');
  };
  const lastClick = useRef(null);

  const clickItem = (e, en) => {
    e.stopPropagation();
    if (e.shiftKey && lastClick.current) {
      const a = entries.findIndex((x) => x.key === lastClick.current), b = entries.findIndex((x) => x.key === en.key);
      setSel(entries.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.key));
    } else setSel((s) => (e.ctrlKey || e.metaKey ? (s.includes(en.key) ? s.filter((x) => x !== en.key) : [...s, en.key]) : [en.key]));
    lastClick.current = en.key;
  };
  const newMenu = [
    { label: '&Folder', icon: 'folder', onClick: () => newItem(os, 'folder', cwd) },
    { label: '&Text Document', icon: 'text', onClick: () => newItem(os, 'text', cwd) },
    { label: '&Rich Text Document (.rtf)', icon: 'wordpad', onClick: () => newItem(os, 'rtf', cwd) },
    { label: '&Web Page (.html)', icon: 'browser', onClick: () => newItem(os, 'html', cwd) },
    { label: '&Bitmap Image', icon: 'image', onClick: () => newItem(os, 'bitmap', cwd) },
  ];
  const viewMenu = [
    { label: 'Lar&ge Icons', radio: true, checked: view === 'large', onClick: () => setView('large') },
    { label: '&Small Icons', radio: true, checked: view === 'small', onClick: () => setView('small') },
    { label: '&List', radio: true, checked: view === 'list', onClick: () => setView('list') },
    { label: '&Details', radio: true, checked: view === 'details', onClick: () => setView('details') },
  ];
  const itemMenu = (e, en) => {
    e.preventDefault(); e.stopPropagation();
    const ids = sel.includes(en.key) ? sel : [en.key];
    if (!sel.includes(en.key)) setSel([en.key]);
    if (!en.node) { os.showMenu(e.clientX, e.clientY, [{ label: '&Open', bold: true, onClick: () => openEntry(en) }]); return; }
    const one = ids.length === 1;
    const fileExt = en.node.type === 'file' ? fs.ext(en.node.name) : '';
    const isImg = one && ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(fileExt);
    const isInspectable = one && ['zip', 'jsdos', 'img', 'ima', 'vfd'].includes(fileExt);
    os.showMenu(e.clientX, e.clientY, [
      { label: '&Open', bold: true, onClick: () => openEntry(en) },
      isInspectable && { label: '&Inspect ZIP / Floppy...', onClick: () => os.open('inspector', { fileId: en.node.id }) },
      isImg && { label: 'Set as Desktop &Wallpaper', onClick: () => setSettings({ wallpaper: 'fs:' + en.node.id, wallpaperMode: 'stretch' }) },
      en.node.type === 'file' && ['pdf', 'html', 'htm', 'xhtml', 'txt', 'md', 'log', 'rtf', 'zip', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(fileExt) && { label: 'Open in &Acrobat Reader 5.0', onClick: () => os.open('acrobat', { fsNodeId: en.node.id }) },
      en.node.type === 'file' && { label: 'Open in &WordPad', onClick: () => os.open('wordpad', { fileId: en.node.id }) },
      en.node.type === 'file' && { label: 'Open in &Notepad', onClick: () => os.open('notepad', { fileId: en.node.id }) },
      en.node.type === 'file' && { label: '&Download to computer', onClick: () => fs.downloadNode(en.node) },
      { sep: true }, { label: 'Cu&t', onClick: () => fs.copyToClip(ids, true) }, { label: '&Copy', onClick: () => fs.copyToClip(ids, false) },
      en.node.type === 'folder' && { label: '&Paste', disabled: !fs.clip.ids.length, onClick: () => { fs.paste(en.node.id); } },
      { sep: true }, { label: '&Delete', onClick: () => deleteNodes(os, ids).then(() => setSel([])) },
      { label: 'Rena&me', disabled: !one, onClick: () => renameNode(os, en.node) }, { sep: true },
      { label: 'P&roperties', disabled: !one, onClick: () => showProps(os, en.node) },
    ]);
  };
  const bgMenu = (e) => {
    e.preventDefault();
    os.showMenu(e.clientX, e.clientY, [
      { label: '&View', sub: viewMenu }, { sep: true }, { label: '&Paste', disabled: !canPaste, onClick: paste },
      { label: 'Ne&w', disabled: !cwd, sub: newMenu }, { sep: true }, { label: 'Import from &computer...', disabled: !cwd, onClick: () => fileIn.current.click() },
      { label: '&Refresh', onClick: () => force((x) => x + 1) },
      { label: 'P&roperties', disabled: !node, onClick: () => node && showProps(os, node) },
    ]);
  };
  const dropOn = (e, targetId) => {
    e.preventDefault(); e.stopPropagation();
    const ids = e.dataTransfer.getData('text/x-win95');
    if (ids) { try { ids.split(',').forEach((id) => fs.move(id, targetId)); setSel([]); } catch (err) { os.msg({ icon: 'error', text: err.message }); } }
    else if (e.dataTransfer.files?.length) importFiles(os, [...e.dataTransfer.files], targetId);
  };
  const key = (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (e.key === 'Enter' && selNodes.length === 1) openEntry(entries.find((x) => x.key === sel[0]));
    else if (e.key === 'Delete' && selNodes.length) doDelete(e.shiftKey);
    else if (e.key === 'F2' && selNodes.length === 1) renameNode(os, selNodes[0]);
    else if (e.key === 'F5') force((x) => x + 1);
    else if (e.key === 'Backspace') up();
    else if (e.ctrlKey && k === 'c' && selNodes.length) fs.copyToClip(sel, false);
    else if (e.ctrlKey && k === 'x' && selNodes.length) fs.copyToClip(sel, true);
    else if (e.ctrlKey && k === 'v' && canPaste) paste();
    else if (e.ctrlKey && k === 'a') { e.preventDefault(); setSel(entries.map((x) => x.key)); }
    else if (e.ctrlKey && k === 'f') { e.preventDefault(); setFind(true); }
  };
  const addrGo = (e) => {
    e.preventDefault();
    const v = addr.trim();
    if (!v || /^my computer$/i.test(v)) return go(null);
    const n = fs.resolve(v);
    if (!n) return os.msg({ icon: 'error', title: 'Exploring', text: `${v}\nCannot find the specified path. Check the spelling and try again.` });
    if (n.type === 'folder') go(n.id); else os.openNode(n);
  };

  const renderTree = (id, depth) => {
    const n = fs.get(id);
    const kids = fs.children(id).filter((c) => c.type === 'folder');
    const open = exp.has(id);
    return (
      <div key={id}>
        <div className={'tr-row ' + (cwd === id ? 'sel' : '')} style={{ paddingLeft: 4 + depth * 14 }} onClick={() => go(id)}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropOn(e, id)}>
          <span className="tr-tog" onClick={(e) => { e.stopPropagation(); setExp((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; }); }}>{kids.length ? (open ? '−' : '+') : ''}</span>
          <Icon name={id === fs.ROOT ? 'drive' : open && cwd === id ? 'folderOpen' : 'folder'} size={16} />
          <span>{id === fs.ROOT ? '(C:)' : n.name}</span>
        </div>
        {open && kids.map((k) => renderTree(k.id, depth + 1))}
      </div>
    );
  };

  const total = selNodes.reduce((a, n) => a + (n.type === 'file' ? n.size : 0), 0);
  const menus = [
    { label: '&File', items: [
      { label: '&Open', bold: true, disabled: selNodes.length !== 1 && !(cwd === null && sel.length === 1), onClick: () => openEntry(entries.find((x) => x.key === sel[0])) },
      { label: 'Ne&w', disabled: !cwd, sub: newMenu }, { sep: true },
      { label: '&Import from computer...', disabled: !cwd, onClick: () => fileIn.current.click() },
      { label: '&Download to computer', disabled: selNodes.length !== 1 || selNodes[0].type !== 'file', onClick: () => fs.downloadNode(selNodes[0]) }, { sep: true },
      { label: '&Delete', disabled: !selNodes.length, onClick: () => doDelete(false) },
      { label: 'Rena&me', disabled: selNodes.length !== 1, onClick: () => renameNode(os, selNodes[0]) },
      { label: 'P&roperties', disabled: selNodes.length !== 1, onClick: () => showProps(os, selNodes[0]) }, { sep: true },
      { label: '&Close', onClick: () => os.close(win.id) }] },
    { label: '&Edit', items: [
      { label: 'Cu&t', disabled: !selNodes.length, onClick: () => fs.copyToClip(sel, true) }, { label: '&Copy', disabled: !selNodes.length, onClick: () => fs.copyToClip(sel, false) },
      { label: '&Paste', disabled: !canPaste, onClick: paste }, { sep: true },
      { label: 'Select &All', shortcut: 'Ctrl+A', onClick: () => setSel(entries.map((x) => x.key)) },
      { label: '&Invert Selection', onClick: () => setSel(entries.filter((x) => !sel.includes(x.key)).map((x) => x.key)) }] },
    { label: '&View', items: [{ label: '&Folders', checked: tree, onClick: () => setTree(!tree) }, { sep: true }, ...viewMenu, { sep: true }, { label: '&Refresh', shortcut: 'F5', onClick: () => force((x) => x + 1) }] },
    { label: '&Tools', items: [
      { label: '&Find Files or Folders...', shortcut: 'Ctrl+F', onClick: () => setFind(true) },
      { label: '&Go to...', onClick: () => document.getElementById('addr' + win.id)?.focus() },
      { sep: true },
      { label: 'Mount &Local PC Folder (Zero-Copy)...', onClick: mountLocalFolder },
      { label: '&Virtual Drive Manager...', onClick: () => os.open('drives') },
    ] },
    { label: '&Help', items: [{ label: '&Help Topics', onClick: () => os.open('help') }, { label: '&About Windows 95', onClick: () => os.msg({ icon: 'info', title: 'About Windows 95', text: 'Windows 95 Smart Edition\nVersion 4.00.950 (browser build)\n\nVirtual drive C: is stored in your browser using IndexedDB.' }) }] },
  ];

  const listClass = 'ex-list view-' + view;
  return (
    <div className="app" onKeyDown={key} tabIndex={-1}>
      <MenuBar menus={menus} />
      <div className="toolbar">
        <button className="btn tool" disabled={hist.i === 0} onClick={back} title="Back">◀ Back</button>
        <button className="btn tool" disabled={hist.i >= hist.list.length - 1} onClick={fwd} title="Forward">▶</button>
        <button className="btn tool" disabled={cwd === null} onClick={up} title="Up One Level">⬆ Up</button>
        <span className="tb-div" />
        <button className="btn tool" disabled={!selNodes.length} onClick={() => fs.copyToClip(sel, true)}>Cut</button>
        <button className="btn tool" disabled={!selNodes.length} onClick={() => fs.copyToClip(sel, false)}>Copy</button>
        <button className="btn tool" disabled={!canPaste} onClick={paste}>Paste</button>
        <button className="btn tool" disabled={!selNodes.length} onClick={() => doDelete(false)}>Delete</button>
        <span className="tb-div" />
        {['large', 'small', 'list', 'details'].map((v, i) => <button key={v} className={'btn tool ' + (view === v ? 'pressed' : '')} title={v + ' view'} onClick={() => setView(v)}>{['▦', '▪▪', '☰', '≣'][i]}</button>)}
      </div>
      <form className="addr-row" onSubmit={addrGo}>
        <label>Address</label>
        <input id={'addr' + win.id} className="field" style={{ flex: 1, minWidth: 0 }} value={addr} onChange={(e) => setAddr(e.target.value)} />
      </form>
      {find && (
        <div className="addr-row">
          <label>Find:</label>
          <input className="field" autoFocus style={{ flex: 1, minWidth: 0 }} value={q} placeholder="Type part of a file or folder name (searches all of C:)" onChange={(e) => setQ(e.target.value)} />
          <button className="btn tool" onClick={() => { setFind(false); setQ(''); }}>Close</button>
        </div>
      )}
      <div className="ex-split">
        {tree && (
          <div className="field ex-tree" onDragOver={(e) => e.preventDefault()}>
            <div className={'tr-row ' + (cwd === null ? 'sel' : '')} onClick={() => go(null)}><span className="tr-tog" /><Icon name="computer" size={16} /><span>My Computer</span></div>
            {renderTree(fs.ROOT, 1)}
          </div>
        )}
        <div className={'field ' + listClass} onPointerDown={() => setSel([])} onContextMenu={bgMenu}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => cwd && dropOn(e, cwd)}>
          {view === 'details' && <div className="ld-head"><span>Name</span><span>Size</span><span>{searching ? 'In Folder' : 'Type'}</span><span>Modified</span></div>}
          {entries.length === 0 && <div style={{ padding: 10, color: '#808080' }}>{searching ? 'No files found.' : 'This folder is empty.'}</div>}
          {entries.map((en) => {
            const n = en.node;
            const cut = n && fs.clip.cut && fs.clip.ids.includes(n.id);
            return (
              <div key={en.key} className={'ex-item ' + (sel.includes(en.key) ? 'sel ' : '') + (view === 'details' ? 'ld-row' : '')} style={cut ? { opacity: 0.5 } : null}
                draggable={!!n} onDragStart={(e) => { const ids = sel.includes(en.key) ? sel : [en.key]; e.dataTransfer.setData('text/x-win95', ids.join(',')); }}
                onDragOver={(e) => n?.type === 'folder' && e.preventDefault()} onDrop={(e) => n?.type === 'folder' && dropOn(e, n.id)}
                onPointerDown={(e) => clickItem(e, en)} onDoubleClick={() => openEntry(en)} onContextMenu={(e) => itemMenu(e, en)} title={en.where ? en.where : en.name}>
                <span className="ld-name"><Icon name={en.icon} size={view === 'large' ? 32 : 16} /><span className="ex-label">{en.name}</span></span>
                {view === 'details' && <>
                  <span>{n && n.type === 'file' ? fmtSize(n.size) : ''}</span>
                  <span>{en.where || en.typeLabel || (n.type === 'folder' ? 'File Folder' : (fs.ext(n.name).toUpperCase() || 'File') + ' File')}</span>
                  <span>{n ? new Date(n.modified).toLocaleString() : ''}</span></>}
              </div>
            );
          })}
        </div>
      </div>
      <StatusBar><span>{entries.length} object(s){selNodes.length ? ` — ${selNodes.length} selected (${fmtSize(total)})` : ''}</span><span>{cwd ? 'Drive C:' : 'My Computer'}</span></StatusBar>
      <input ref={fileIn} type="file" multiple hidden onChange={importIt} />
    </div>
  );
}

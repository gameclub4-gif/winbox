import { useState, useRef, useEffect } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import * as fs from '../os/fs.js';
import { pickLocalFiles, saveLocalFile } from '../os/localFiles.js';

const TEXT_TYPES = [{ description: 'Text Documents', accept: { 'text/plain': ['.txt', '.md', '.log', '.ini', '.cfg', '.bat', '.csv', '.json', '.js', '.css', '.html', '.htm'] } }];

export default function Notepad({ win, props }) {
  const os = useOS();
  const [text, setText] = useState('');
  const [fileId, setFileId] = useState(props.fileId || null);
  const [localFile, setLocalFile] = useState(null); // { name, handle }
  const [dirty, setDirty] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [pos, setPos] = useState({ ln: 1, col: 1 });
  const ta = useRef();
  const st = useRef({});
  st.current = { text, fileId, localFile, dirty };
  const lastFind = useRef('');

  const fname = () => {
    const s = st.current;
    if (s.fileId) return fs.get(s.fileId)?.name || 'Untitled';
    if (s.localFile) return s.localFile.name;
    return 'Untitled';
  };

  useEffect(() => {
    if (props.fileId) {
      const n = fs.get(props.fileId);
      if (n) fs.readText(n).then((t) => setText(t.replace(/\r?\n/g, '\n')));
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    const label = fileId ? fs.get(fileId)?.name || 'Untitled' : localFile ? localFile.name : 'Untitled';
    os.setTitle(win.id, `${label}${dirty ? '*' : ''} - Notepad`);
  }, [fileId, localFile, dirty, win.id, os]);

  const saveToC = async (as = false) => {
    const s = st.current;
    let id = s.fileId;
    const data = s.text.replace(/\n/g, '\r\n');
    try {
      if (!id || as || !fs.get(id)) {
        const r = await os.fileDialog({
          mode: 'save',
          exts: ['txt'],
          name: id && fs.get(id) ? fs.get(id).name : s.localFile?.name || 'Untitled.txt',
          title: 'Save As (Drive C:)',
        });
        if (!r) return false;
        if (r.existing) { fs.write(r.existing.id, data, 'text/plain'); id = r.existing.id; }
        else id = fs.create({ name: r.name, parent: r.parent, data, mime: 'text/plain' }).id;
      } else {
        fs.write(id, data, 'text/plain');
      }
    } catch (e) {
      os.msg({ icon: 'error', title: 'Notepad', text: e.message });
      return false;
    }
    setFileId(id); setLocalFile(null); setDirty(false);
    st.current.dirty = false; st.current.fileId = id; st.current.localFile = null;
    return true;
  };

  const saveToLocalPC = async (forceDialog = false) => {
    const s = st.current;
    const data = s.text.replace(/\n/g, '\r\n');
    const suggested = s.localFile?.name || (s.fileId ? fs.get(s.fileId)?.name : null) || 'Untitled.txt';
    try {
      const res = await saveLocalFile({
        data,
        name: suggested,
        mime: 'text/plain;charset=utf-8',
        handle: forceDialog ? null : s.localFile?.handle,
        types: TEXT_TYPES,
        forceDialog,
      });
      if (!res) return false;
      const nextLocal = { name: res.name, handle: res.handle || s.localFile?.handle || null };
      setLocalFile(nextLocal);
      setDirty(false);
      st.current.dirty = false;
      st.current.localFile = nextLocal;
      return true;
    } catch (e) {
      os.msg({ icon: 'error', title: 'Notepad', text: 'Could not save to computer: ' + e.message });
      return false;
    }
  };

  const save = async (as = false) => {
    const s = st.current;
    if (s.localFile && !s.fileId) return saveToLocalPC(as);
    return saveToC(as);
  };

  const confirmDiscard = async () => {
    if (!st.current.dirty) return true;
    const r = await os.msg({
      title: 'Notepad',
      icon: 'question',
      text: `The text in the ${fname()} file has changed.\n\nDo you want to save the changes?`,
      buttons: ['Yes', 'No', 'Cancel'],
    });
    if (r === 'Cancel') return false;
    if (r === 'Yes') return save(false);
    return true;
  };
  useEffect(() => { os.setGuard(win.id, confirmDiscard); return () => os.setGuard(win.id, null); }, []); // eslint-disable-line

  const newDoc = async () => {
    if (await confirmDiscard()) { setText(''); setFileId(null); setLocalFile(null); setDirty(false); }
  };

  const openFromC = async () => {
    if (!(await confirmDiscard())) return;
    const n = await os.fileDialog({ mode: 'open', title: 'Open from Drive C:' });
    if (n) {
      setText((await fs.readText(n)).replace(/\r?\n/g, '\n'));
      setFileId(n.id);
      setLocalFile(null);
      setDirty(false);
    }
  };

  const loadLocalPicked = async (picked) => {
    if (!picked) return;
    try {
      const content = (await picked.file.text()).replace(/\r?\n/g, '\n');
      setText(content);
      setFileId(null);
      setLocalFile({ name: picked.name, handle: picked.handle || null });
      setDirty(false);
    } catch (e) {
      os.msg({ icon: 'error', title: 'Notepad', text: 'Cannot read file: ' + e.message });
    }
  };

  const openFromPC = async () => {
    if (!(await confirmDiscard())) return;
    const picked = await pickLocalFiles({
      accept: '.txt,.md,.log,.ini,.cfg,.bat,.json,.js,.ts,.tsx,.jsx,.css,.html,.htm,.xml,.csv,.inf',
      types: TEXT_TYPES,
    });
    await loadLocalPicked(picked);
  };

  const onDropFile = async (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    if (!(await confirmDiscard())) return;
    await loadLocalPicked({ file: f, name: f.name, handle: null });
  };

  const insert = (str) => {
    const t = ta.current; t.focus();
    t.setRangeText(str, t.selectionStart, t.selectionEnd, 'end');
    setText(t.value); setDirty(true);
  };
  const exec = (c) => { ta.current.focus(); document.execCommand(c); setText(ta.current.value); setDirty(true); };
  const paste = async () => {
    try { insert(await navigator.clipboard.readText()); } catch (e) { os.msg({ icon: 'info', title: 'Notepad', text: 'Clipboard access was blocked by the browser. Use Ctrl+V to paste.' }); }
  };
  const find = async (again) => {
    let q = lastFind.current;
    if (!again || !q) { q = await os.prompt({ title: 'Find', label: 'Find what:', value: q }); if (!q) return; lastFind.current = q; }
    const t = ta.current;
    let i = t.value.toLowerCase().indexOf(q.toLowerCase(), t.selectionEnd);
    if (i < 0) i = t.value.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) { os.msg({ icon: 'info', title: 'Notepad', text: `Cannot find "${q}"` }); return; }
    t.focus(); t.setSelectionRange(i, i + q.length);
  };
  const upd = () => {
    const t = ta.current; if (!t) return;
    const before = t.value.slice(0, t.selectionStart).split('\n');
    setPos({ ln: before.length, col: before[before.length - 1].length + 1 });
  };
  const key = (e) => {
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(false); }
    else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveToLocalPC(true); }
    else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openFromPC(); }
    else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openFromC(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); newDoc(); }
    else if (e.key === 'F5') { e.preventDefault(); insert(new Date().toLocaleString()); }
    else if (e.key === 'F3') { e.preventDefault(); find(true); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); find(false); }
  };

  const menus = [
    { label: '&File', items: [
      { label: '&New', shortcut: 'Ctrl+N', onClick: newDoc },
      { label: '&Open (Drive C:)...', shortcut: 'Ctrl+O', onClick: openFromC },
      { label: 'Open from &Local PC...', shortcut: 'Ctrl+Shift+O', onClick: openFromPC },
      { sep: true },
      { label: '&Save', shortcut: 'Ctrl+S', onClick: () => save(false) },
      { label: 'Save &As (Drive C:)...', onClick: () => saveToC(true) },
      { label: 'Save to Local &PC...', shortcut: 'Ctrl+Shift+S', onClick: () => saveToLocalPC(false) },
      { sep: true },
      { label: 'E&xit', onClick: () => os.close(win.id) },
    ] },
    { label: '&Edit', items: [
      { label: '&Undo', shortcut: 'Ctrl+Z', onClick: () => exec('undo') }, { sep: true },
      { label: 'Cu&t', shortcut: 'Ctrl+X', onClick: () => exec('cut') },
      { label: '&Copy', shortcut: 'Ctrl+C', onClick: () => exec('copy') },
      { label: '&Paste', shortcut: 'Ctrl+V', onClick: paste },
      { label: 'De&lete', shortcut: 'Del', onClick: () => exec('delete') }, { sep: true },
      { label: 'Select &All', onClick: () => { ta.current.focus(); ta.current.select(); } },
      { label: 'Time/&Date', shortcut: 'F5', onClick: () => insert(new Date().toLocaleString()) }, { sep: true },
      { label: '&Find...', shortcut: 'Ctrl+F', onClick: () => find(false) },
      { label: 'Find &Next', shortcut: 'F3', onClick: () => find(true) },
    ] },
    { label: 'F&ormat', items: [{ label: '&Word Wrap', checked: wrap, onClick: () => setWrap(!wrap) }] },
    { label: '&Help', items: [{ label: '&Help Topics', onClick: () => os.open('help') }, { sep: true }, { label: '&About Notepad', onClick: () => os.msg({ icon: 'info', title: 'About Notepad', text: 'Notepad\nWindows 95 Smart Edition\nOpen & save text files directly on Drive C: or your local PC.' }) }] },
  ];

  const sourceLabel = fileId ? fs.pathOf(fileId) : localFile ? `Local PC: ${localFile.name}${localFile.handle ? ' (Direct Write)' : ''}` : 'Untitled';

  return (
    <div className="app" onKeyDown={key} onDragOver={(e) => e.preventDefault()} onDrop={onDropFile}>
      <MenuBar menus={menus} />
      <textarea ref={ta} className="field np-text" value={text} spellCheck={false} wrap={wrap ? 'soft' : 'off'} style={{ whiteSpace: wrap ? 'pre-wrap' : 'pre' }}
        onChange={(e) => { setText(e.target.value); setDirty(true); upd(); }} onKeyUp={upd} onClick={upd} onSelect={upd} autoFocus />
      <StatusBar><span>{sourceLabel}{dirty ? ' *' : ''}</span><span>Ln {pos.ln}, Col {pos.col}</span></StatusBar>
    </div>
  );
}

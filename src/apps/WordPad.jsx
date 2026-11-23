import { useState, useRef, useEffect } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import * as fs from '../os/fs.js';
import { pickLocalFiles, saveLocalFile } from '../os/localFiles.js';
import { rtfToHtml, htmlToRtf, sanitizeHtmlForEditor, wrapStandaloneHtml } from '../utils/rtf.js';

const FONTS = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Tahoma', 'Verdana'];
const SIZES = [
  ['1', '8'], ['2', '10'], ['3', '12'], ['4', '14'], ['5', '18'], ['6', '24'], ['7', '36'],
];
const DOC_TYPES = [
  { description: 'Rich Text & HTML Documents', accept: { 'application/rtf': ['.rtf'], 'text/html': ['.html', '.htm'], 'text/plain': ['.txt', '.md'] } },
];

export default function WordPad({ win, props, active }) {
  const os = useOS();
  const ed = useRef();
  const [fileId, setFileId] = useState(props.fileId || null);
  const [localFile, setLocalFile] = useState(null); // { name, handle }
  const [format, setFormat] = useState('rtf'); // 'rtf' | 'html'
  const [dirty, setDirty] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [showFormatBar, setShowFormatBar] = useState(true);
  const [showRuler, setShowRuler] = useState(true);
  const [font, setFont] = useState('Arial');
  const [fontSize, setFontSize] = useState('3');
  const [color, setColor] = useState('#000000');
  const [wordCount, setWordCount] = useState(0);
  const st = useRef({});
  st.current = { fileId, localFile, format, dirty };
  const lastFind = useRef('');

  const updateWordCount = () => {
    const txt = ed.current?.innerText?.trim() || '';
    setWordCount(txt ? txt.split(/\s+/).length : 0);
  };

  const loadContent = (rawText, filename = '') => {
    const ext = fs.ext(filename);
    let html;
    let nextFmt = 'rtf';
    if (ext === 'html' || ext === 'htm') {
      html = sanitizeHtmlForEditor(rawText);
      nextFmt = 'html';
    } else if (ext === 'rtf' || rawText.trimStart().startsWith('{\\rtf')) {
      html = rtfToHtml(rawText);
      nextFmt = 'rtf';
    } else {
      html = rawText
        .split(/\r?\n/)
        .map((line) => `<p>${line ? line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '<br>'}</p>`)
        .join('');
    }
    if (ed.current) {
      ed.current.innerHTML = html || '<p><br></p>';
      updateWordCount();
    }
    setFormat(nextFmt);
    setDirty(false);
  };

  useEffect(() => {
    if (ed.current && !props.fileId) {
      ed.current.innerHTML = '<p><br></p>';
    }
    if (props.fileId) {
      const n = fs.get(props.fileId);
      if (n) fs.readText(n).then((t) => loadContent(t, n.name));
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    const nm = fileId ? fs.get(fileId)?.name : localFile ? localFile.name : 'Document';
    os.setTitle(win.id, `${nm || 'Document'}${dirty ? '*' : ''} - WordPad`);
  }, [fileId, localFile, dirty, win.id, os]);

  const serialize = (targetFormat, docTitle = 'Document') => {
    const bodyHtml = ed.current?.innerHTML || '<p><br></p>';
    if (targetFormat === 'html') return { text: wrapStandaloneHtml(bodyHtml, docTitle), mime: 'text/html', ext: 'html' };
    return { text: htmlToRtf(bodyHtml), mime: 'application/rtf', ext: 'rtf' };
  };

  const saveToC = async (as = false, forceExt = null) => {
    const s = st.current;
    let id = s.fileId;
    try {
      let targetName = id && fs.get(id) ? fs.get(id).name : s.localFile?.name || `Document.${forceExt || s.format}`;
      if (forceExt) targetName = targetName.replace(/\.\w+$/, '') + '.' + forceExt;

      if (!id || as || !fs.get(id) || forceExt) {
        const r = await os.fileDialog({
          mode: 'save',
          exts: forceExt ? [forceExt] : ['rtf', 'html', 'htm'],
          name: targetName,
          title: 'Save As (Drive C:)',
        });
        if (!r) return false;
        const chosenFmt = /\.html?$/i.test(r.name) ? 'html' : 'rtf';
        const { text, mime } = serialize(chosenFmt, r.name);
        id = r.existing ? fs.write(r.existing.id, text, mime).id : fs.create({ name: r.name, parent: r.parent, data: text, mime }).id;
        setFormat(chosenFmt);
      } else {
        const curName = fs.get(id).name;
        const chosenFmt = /\.html?$/i.test(curName) ? 'html' : 'rtf';
        const { text, mime } = serialize(chosenFmt, curName);
        fs.write(id, text, mime);
        setFormat(chosenFmt);
      }
    } catch (e) {
      os.msg({ icon: 'error', title: 'WordPad', text: e.message });
      return false;
    }
    setFileId(id); setLocalFile(null); setDirty(false);
    st.current.dirty = false; st.current.fileId = id; st.current.localFile = null;
    return true;
  };

  const saveToLocalPC = async (forceDialog = false, forceExt = null) => {
    const s = st.current;
    let suggested = s.localFile?.name || (s.fileId ? fs.get(s.fileId)?.name : null) || `Document.${forceExt || s.format}`;
    if (forceExt) suggested = suggested.replace(/\.\w+$/, '') + '.' + forceExt;
    const chosenFmt = forceExt ? (forceExt === 'html' ? 'html' : 'rtf') : /\.html?$/i.test(suggested) ? 'html' : s.format;
    const { text, mime } = serialize(chosenFmt, suggested);
    try {
      const res = await saveLocalFile({
        data: text,
        name: suggested,
        mime,
        handle: forceDialog || forceExt ? null : s.localFile?.handle,
        types: DOC_TYPES,
        forceDialog: forceDialog || !!forceExt,
      });
      if (!res) return false;
      const actualFmt = /\.html?$/i.test(res.name) ? 'html' : 'rtf';
      const nextLocal = { name: res.name, handle: res.handle || (!forceExt ? s.localFile?.handle : null) || null };
      setLocalFile(nextLocal);
      setFormat(actualFmt);
      setDirty(false);
      st.current.dirty = false;
      st.current.localFile = nextLocal;
      return true;
    } catch (e) {
      os.msg({ icon: 'error', title: 'WordPad', text: 'Could not save to computer: ' + e.message });
      return false;
    }
  };

  const save = async (as = false) => {
    if (st.current.localFile && !st.current.fileId) return saveToLocalPC(as);
    return saveToC(as);
  };

  const confirmDiscard = async () => {
    if (!st.current.dirty) return true;
    const nm = st.current.fileId ? fs.get(st.current.fileId)?.name : st.current.localFile?.name || 'Document';
    const r = await os.msg({
      title: 'WordPad',
      icon: 'question',
      text: `Save changes to ${nm}?`,
      buttons: ['Yes', 'No', 'Cancel'],
    });
    if (r === 'Cancel') return false;
    if (r === 'Yes') return save(false);
    return true;
  };
  useEffect(() => { os.setGuard(win.id, confirmDiscard); return () => os.setGuard(win.id, null); }, []); // eslint-disable-line

  const newDoc = async () => {
    if (!(await confirmDiscard())) return;
    if (ed.current) ed.current.innerHTML = '<p><br></p>';
    setFileId(null); setLocalFile(null); setFormat('rtf'); setDirty(false); updateWordCount();
  };

  const openFromC = async () => {
    if (!(await confirmDiscard())) return;
    const n = await os.fileDialog({ mode: 'open', exts: ['rtf', 'html', 'htm', 'txt', 'md'], title: 'Open from Drive C:' });
    if (n) {
      const txt = await fs.readText(n);
      loadContent(txt, n.name);
      setFileId(n.id);
      setLocalFile(null);
    }
  };

  const openFromPC = async () => {
    if (!(await confirmDiscard())) return;
    const picked = await pickLocalFiles({ accept: '.rtf,.html,.htm,.txt,.md', types: DOC_TYPES });
    if (!picked) return;
    try {
      const txt = await picked.file.text();
      loadContent(txt, picked.name);
      setFileId(null);
      setLocalFile({ name: picked.name, handle: picked.handle || null });
    } catch (e) {
      os.msg({ icon: 'error', title: 'WordPad', text: 'Cannot read file: ' + e.message });
    }
  };

  const onDropFile = async (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    if (!(await confirmDiscard())) return;
    const txt = await f.text();
    loadContent(txt, f.name);
    setFileId(null);
    setLocalFile({ name: f.name, handle: null });
  };

  const exec = (cmd, val = null) => {
    ed.current?.focus();
    document.execCommand(cmd, false, val);
    setDirty(true);
    updateWordCount();
  };

  const insertDateTime = () => {
    const now = new Date().toLocaleString();
    exec('insertText', now);
  };

  const findText = async () => {
    const q = await os.prompt({ title: 'Find', label: 'Find what:', value: lastFind.current });
    if (!q) return;
    lastFind.current = q;
    ed.current?.focus();
    if (!window.find(q, false, false, true)) {
      os.msg({ icon: 'info', title: 'WordPad', text: `WordPad has finished searching the document.\n"${q}" was not found.` });
    }
  };

  useEffect(() => {
    if (!active) return;
    const h = (e) => {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(false); }
      else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveToLocalPC(true); }
      else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openFromPC(); }
      else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openFromC(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); newDoc(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); findText(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

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
      { label: 'Export as &RTF (.rtf)...', onClick: () => saveToLocalPC(true, 'rtf') },
      { label: 'Export as &HTML (.html)...', onClick: () => saveToLocalPC(true, 'html') },
      { sep: true },
      { label: 'E&xit', onClick: () => os.close(win.id) },
    ] },
    { label: '&Edit', items: [
      { label: '&Undo', shortcut: 'Ctrl+Z', onClick: () => exec('undo') },
      { label: '&Redo', shortcut: 'Ctrl+Y', onClick: () => exec('redo') },
      { sep: true },
      { label: 'Cu&t', shortcut: 'Ctrl+X', onClick: () => exec('cut') },
      { label: '&Copy', shortcut: 'Ctrl+C', onClick: () => exec('copy') },
      { label: 'Select &All', shortcut: 'Ctrl+A', onClick: () => exec('selectAll') },
      { sep: true },
      { label: '&Find...', shortcut: 'Ctrl+F', onClick: findText },
    ] },
    { label: '&View', items: [
      { label: '&Toolbar', checked: showToolbar, onClick: () => setShowToolbar(!showToolbar) },
      { label: '&Format Bar', checked: showFormatBar, onClick: () => setShowFormatBar(!showFormatBar) },
      { label: '&Ruler', checked: showRuler, onClick: () => setShowRuler(!showRuler) },
    ] },
    { label: '&Insert', items: [
      { label: '&Date and Time', onClick: insertDateTime },
      { label: '&Horizontal Rule', onClick: () => exec('insertHorizontalRule') },
    ] },
    { label: 'F&ormat', items: [
      { label: '&Bold', onClick: () => exec('bold') },
      { label: '&Italic', onClick: () => exec('italic') },
      { label: '&Underline', onClick: () => exec('underline') },
      { sep: true },
      { label: 'Bullet &Style', onClick: () => exec('insertUnorderedList') },
      { label: 'Align &Left', onClick: () => exec('justifyLeft') },
      { label: 'Align &Center', onClick: () => exec('justifyCenter') },
      { label: 'Align &Right', onClick: () => exec('justifyRight') },
    ] },
    { label: '&Help', items: [
      { label: '&Help Topics', onClick: () => os.open('help') },
      { sep: true },
      { label: '&About WordPad', onClick: () => os.msg({ icon: 'info', title: 'About WordPad', text: 'WordPad\nWindows 95 Smart Edition\nRich Text (.rtf) and HTML (.html) word processor with Local PC and C: drive storage.' }) },
    ] },
  ];

  const sourceLabel = fileId ? fs.pathOf(fileId) : localFile ? `Local PC: ${localFile.name}${localFile.handle ? ' (Direct Write)' : ''}` : 'New Document';

  return (
    <div className="app wp-app" onDragOver={(e) => e.preventDefault()} onDrop={onDropFile}>
      <MenuBar menus={menus} />
      {showToolbar && (
        <div className="toolbar">
          <button className="btn tool" title="New" onClick={newDoc}>New</button>
          <button className="btn tool" title="Open from Drive C:" onClick={openFromC}>Open C:</button>
          <button className="btn tool" title="Open from Local PC" onClick={openFromPC}>Open PC</button>
          <button className="btn tool" title="Save" onClick={() => save(false)}>Save</button>
          <button className="btn tool" title="Save to Local PC" onClick={() => saveToLocalPC(false)}>Save PC</button>
          <span className="tb-div" />
          <button className="btn tool" title="Export RTF" onClick={() => saveToLocalPC(true, 'rtf')}>.RTF</button>
          <button className="btn tool" title="Export HTML" onClick={() => saveToLocalPC(true, 'html')}>.HTML</button>
          <span className="tb-div" />
          <button className="btn tool" title="Undo" onClick={() => exec('undo')}>↶</button>
          <button className="btn tool" title="Find" onClick={findText}>Find</button>
          <button className="btn tool" title="Insert Date/Time" onClick={insertDateTime}>Date</button>
        </div>
      )}
      {showFormatBar && (
        <div className="toolbar">
          <select className="field" style={{ height: 22, padding: '0 4px' }} value={font} onChange={(e) => { setFont(e.target.value); exec('fontName', e.target.value); }}>
            {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className="field" style={{ height: 22, padding: '0 4px', width: 52 }} value={fontSize} onChange={(e) => { setFontSize(e.target.value); exec('fontSize', e.target.value); }}>
            {SIZES.map(([val, pt]) => <option key={val} value={val}>{pt} pt</option>)}
          </select>
          <span className="tb-div" />
          <button className="btn tool" style={{ fontWeight: 'bold', width: 24 }} title="Bold" onClick={() => exec('bold')}>B</button>
          <button className="btn tool" style={{ fontStyle: 'italic', width: 24 }} title="Italic" onClick={() => exec('italic')}>I</button>
          <button className="btn tool" style={{ textDecoration: 'underline', width: 24 }} title="Underline" onClick={() => exec('underline')}>U</button>
          <label className="btn tool" title="Text Color" style={{ position: 'relative', width: 28 }}>
            <span style={{ borderBottom: `3px solid ${color}`, fontWeight: 'bold' }}>A</span>
            <input type="color" value={color} onChange={(e) => { setColor(e.target.value); exec('foreColor', e.target.value); }} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }} />
          </label>
          <span className="tb-div" />
          <button className="btn tool" title="Align Left" onClick={() => exec('justifyLeft')}>⫷</button>
          <button className="btn tool" title="Center" onClick={() => exec('justifyCenter')}>☰</button>
          <button className="btn tool" title="Align Right" onClick={() => exec('justifyRight')}>⫸</button>
          <button className="btn tool" title="Bullets" onClick={() => exec('insertUnorderedList')}>•≡</button>
        </div>
      )}
      {showRuler && (
        <div className="wp-ruler">
          {[1, 2, 3, 4, 5, 6].map((inch) => <span key={inch}>{inch}</span>)}
        </div>
      )}
      <div className="field wp-scroll">
        <div
          ref={ed}
          className="wp-page"
          contentEditable
          suppressContentEditableWarning
          onInput={() => { setDirty(true); updateWordCount(); }}
        />
      </div>
      <StatusBar>
        <span>{sourceLabel}{dirty ? ' *' : ''}</span>
        <span>Format: {format.toUpperCase()}</span>
        <span>{wordCount} words</span>
      </StatusBar>
    </div>
  );
}

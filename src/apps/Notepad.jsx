import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import * as fs from '../os/fs.js';
import { pickLocalFiles, saveLocalFile } from '../os/localFiles.js';
import { looksLikeHtml, tokenizeHtml } from '../utils/htmlHighlight.js';
import * as SmartTransfer from '../os/smartTransfer.js';
import { receiveConflictDialog, openTransferHistoryDialog } from '../os/smartTransferUI.jsx';
import { useVoiceDictation, VOICE_LANGUAGES, formatDictatedChunk } from '../utils/voiceDictation.js';

const TEXT_TYPES = [{
  description: 'Text & Web Documents',
  accept: {
    'text/plain': ['.txt', '.md', '.log', '.ini', '.cfg', '.bat', '.csv', '.json', '.js', '.css', '.xml'],
    'text/html': ['.html', '.htm'],
  },
}];

const MAX_HL_CHARS = 150000;

function readPreText(root) {
  if (!root) return '';
  let out = '';
  const walk = (node) => {
    if (node.nodeType === 3) {
      out += node.nodeValue || '';
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.dataset?.eof) return;
    const tag = node.tagName;
    if (tag === 'BR') {
      out += '\n';
      return;
    }
    const isBlock = (tag === 'DIV' || tag === 'P') && node !== root && out.length > 0 && !out.endsWith('\n');
    if (isBlock) out += '\n';
    for (const ch of node.childNodes) walk(ch);
  };
  walk(root);
  return out.replace(/\r\n?/g, '\n');
}

function getPreOffsets(root) {
  const sel = window.getSelection();
  if (!root || !sel || sel.rangeCount === 0) return null;
  const rng = sel.getRangeAt(0);
  if (!root.contains(rng.startContainer) || !root.contains(rng.endContainer)) return null;

  const offsetOf = (targetContainer, targetOffset) => {
    let total = 0;
    let found = false;
    const walk = (node) => {
      if (found) return;
      if (node.nodeType === 1 && node.dataset?.eof) return;
      if (node === targetContainer) {
        if (node.nodeType === 3) {
          total += targetOffset;
          found = true;
          return;
        }
        const limit = Math.min(targetOffset, node.childNodes.length);
        for (let i = 0; i < limit; i++) {
          const ch = node.childNodes[i];
          if (ch.nodeType === 1 && ch.dataset?.eof) continue;
          if (ch.nodeType === 3) total += ch.nodeValue.length;
          else if (ch.tagName === 'BR') total += 1;
          else total += readPreText(ch).length;
        }
        found = true;
        return;
      }
      if (node.nodeType === 3) {
        total += node.nodeValue.length;
        return;
      }
      if (node.nodeType === 1) {
        if (node.tagName === 'BR') {
          total += 1;
          return;
        }
        for (const ch of node.childNodes) {
          walk(ch);
          if (found) return;
        }
      }
    };
    walk(root);
    return total;
  };

  const a = offsetOf(rng.startContainer, rng.startOffset);
  const b = offsetOf(rng.endContainer, rng.endOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

function setPreOffsets(root, start, end = start) {
  if (!root) return;
  const sel = window.getSelection();
  if (!sel) return;

  const findPoint = (target) => {
    let rem = Math.max(0, target);
    let lastText = null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest?.('[data-eof]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let n;
    while ((n = walker.nextNode())) {
      lastText = n;
      const len = n.nodeValue.length;
      if (rem <= len) return { node: n, offset: rem };
      rem -= len;
    }
    if (lastText) return { node: lastText, offset: lastText.nodeValue.length };
    return { node: root, offset: 0 };
  };

  const p1 = findPoint(start);
  const p2 = end === start ? p1 : findPoint(end);
  const rng = document.createRange();
  rng.setStart(p1.node, p1.offset);
  rng.setEnd(p2.node, p2.offset);
  sel.removeAllRanges();
  sel.addRange(rng);
}

export default function Notepad({ win, props, active }) {
  const os = useOS();
  const [text, setText] = useState('');
  const [fileId, setFileId] = useState(props.fileId || null);
  const [localFile, setLocalFile] = useState(null); // { name, handle }
  const [dirty, setDirty] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [hlMode, setHlMode] = useState('auto'); // 'auto' | 'on' | 'off'
  const [pos, setPos] = useState({ ln: 1, col: 1 });
  const ta = useRef(null);
  const codeRef = useRef(null);
  const pendingSel = useRef(null);
  const savedSel = useRef({ start: 0, end: 0 });
  const composingRef = useRef(false);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const st = useRef({});
  st.current = { text, fileId, localFile, dirty };
  const lastFind = useRef('');

  const activeName = fileId ? fs.get(fileId)?.name || 'Untitled' : localFile ? localFile.name : 'Untitled';
  const htmlActive = text.length <= MAX_HL_CHARS && (hlMode === 'on' || (hlMode === 'auto' && looksLikeHtml(activeName, text)));
  const tokens = useMemo(() => (htmlActive ? tokenizeHtml(text) : null), [htmlActive, text]);
  const insertDictatedRef = useRef(null);

  const voice = useVoiceDictation({
    onResult: (raw) => insertDictatedRef.current?.(raw),
    onError: (msg) => os.msg({ icon: 'warning', title: 'Notepad Voice Dictation', text: msg }),
  });

  const fname = () => {
    const s = st.current;
    if (s.fileId) return fs.get(s.fileId)?.name || 'Untitled';
    if (s.localFile) return s.localFile.name;
    return 'Untitled';
  };

  const getActiveOffsets = () => {
    if (htmlActive && codeRef.current) {
      const o = getPreOffsets(codeRef.current);
      if (o) {
        savedSel.current = o;
        return o;
      }
      const len = st.current.text.length;
      return {
        start: Math.min(savedSel.current.start, len),
        end: Math.min(savedSel.current.end, len),
      };
    }
    if (ta.current) {
      const o = { start: ta.current.selectionStart || 0, end: ta.current.selectionEnd || 0 };
      savedSel.current = o;
      return o;
    }
    return savedSel.current;
  };

  const updatePosFromOffset = (val, offset) => {
    const safeOff = Math.max(0, Math.min(offset, val.length));
    const before = val.slice(0, safeOff).split('\n');
    setPos({ ln: before.length, col: before[before.length - 1].length + 1 });
  };

  const upd = () => {
    const o = getActiveOffsets();
    updatePosFromOffset(st.current.text, o.start);
  };

  const focusAndSelect = (start, end = start) => {
    savedSel.current = { start, end };
    pendingSel.current = { start, end };
    if (htmlActive && codeRef.current) {
      codeRef.current.focus();
      setPreOffsets(codeRef.current, start, end);
    } else if (ta.current) {
      ta.current.focus();
      ta.current.setSelectionRange(start, end);
    }
    updatePosFromOffset(st.current.text, start);
  };

  useLayoutEffect(() => {
    if (!htmlActive || !codeRef.current || !pendingSel.current) return;
    const { start, end } = pendingSel.current;
    pendingSel.current = null;
    const maxLen = st.current.text.length;
    setPreOffsets(codeRef.current, Math.min(start, maxLen), Math.min(end, maxLen));
  }, [tokens, htmlActive]);

  const applyTextEdit = (nextText, nextStart, nextEnd = nextStart, markDirty = true) => {
    const prevSel = getActiveOffsets();
    undoStack.current.push({ text: st.current.text, start: prevSel.start, end: prevSel.end });
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
    savedSel.current = { start: nextStart, end: nextEnd };
    pendingSel.current = { start: nextStart, end: nextEnd };
    setText(nextText);
    if (markDirty) setDirty(true);
    updatePosFromOffset(nextText, nextStart);
    if (!htmlActive) {
      requestAnimationFrame(() => {
        if (ta.current) {
          ta.current.focus();
          ta.current.setSelectionRange(nextStart, nextEnd);
        }
      });
    }
  };

  const resetHistory = () => {
    undoStack.current = [];
    redoStack.current = [];
    savedSel.current = { start: 0, end: 0 };
    pendingSel.current = { start: 0, end: 0 };
  };

  useEffect(() => {
    if (props.transferId) {
      SmartTransfer.getTransfer(props.transferId).then((t) => {
        if (t) receiveTransferRef.current?.(t, props.transferAction || 'open');
      });
    } else if (props.fileId) {
      const n = fs.get(props.fileId);
      if (n) {
        fs.readText(n).then((t) => {
          resetHistory();
          setText(t.replace(/\r?\n/g, '\n'));
        });
      }
    }
  }, [win.nonce]); // eslint-disable-line

  useEffect(() => {
    if (active) SmartTransfer.touchApp('notepad', win.id);
  }, [active, win.id]);

  useEffect(() => {
    os.setTitle(win.id, `${activeName}${dirty ? '*' : ''} - Notepad`);
  }, [activeName, dirty, win.id, os]);

  const saveToC = async (as = false) => {
    const s = st.current;
    let id = s.fileId;
    const data = s.text.replace(/\n/g, '\r\n');
    try {
      const defName = id && fs.get(id) ? fs.get(id).name : s.localFile?.name || (htmlActive ? 'Untitled.html' : 'Untitled.txt');
      if (!id || as || !fs.get(id)) {
        const r = await os.fileDialog({
          mode: 'save',
          exts: ['txt', 'html', 'htm', 'md', 'css', 'js', 'json', 'xml', 'log'],
          name: defName,
          title: 'Save As (Drive C:)',
        });
        if (!r) return false;
        const mime = /\.html?$/i.test(r.name) ? 'text/html' : 'text/plain';
        if (r.existing) { fs.write(r.existing.id, data, mime); id = r.existing.id; }
        else id = fs.create({ name: r.name, parent: r.parent, data, mime }).id;
      } else {
        const mime = /\.html?$/i.test(fs.get(id).name) ? 'text/html' : 'text/plain';
        fs.write(id, data, mime);
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
    const suggested = s.localFile?.name || (s.fileId ? fs.get(s.fileId)?.name : null) || (htmlActive ? 'Untitled.html' : 'Untitled.txt');
    const mime = /\.html?$/i.test(suggested) ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8';
    try {
      const res = await saveLocalFile({
        data,
        name: suggested,
        mime,
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
    if (await confirmDiscard()) {
      resetHistory();
      setText(''); setFileId(null); setLocalFile(null); setDirty(false); setPos({ ln: 1, col: 1 });
    }
  };

  const openFromC = async () => {
    if (!(await confirmDiscard())) return;
    const n = await os.fileDialog({ mode: 'open', title: 'Open from Drive C:' });
    if (n) {
      resetHistory();
      setText((await fs.readText(n)).replace(/\r?\n/g, '\n'));
      setFileId(n.id);
      setLocalFile(null);
      setDirty(false);
      setPos({ ln: 1, col: 1 });
    }
  };

  const loadLocalPicked = async (picked) => {
    if (!picked) return;
    try {
      const content = (await picked.file.text()).replace(/\r?\n/g, '\n');
      resetHistory();
      setText(content);
      setFileId(null);
      setLocalFile({ name: picked.name, handle: picked.handle || null });
      setDirty(false);
      setPos({ ln: 1, col: 1 });
    } catch (e) {
      os.msg({ icon: 'error', title: 'Notepad', text: 'Cannot read file: ' + e.message });
    }
  };

  const openFromPC = async () => {
    if (!(await confirmDiscard())) return;
    const picked = await pickLocalFiles({
      accept: '.txt,.md,.log,.ini,.cfg,.bat,.json,.js,.ts,.tsx,.jsx,.css,.html,.htm,.xhtml,.xml,.svg,.csv,.inf',
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

  const previewInBrowser = () => {
    const blob = new Blob([text], { type: 'text/html;charset=utf-8' });
    os.open('browser', { localBlob: blob, localName: activeName.endsWith('.html') || activeName.endsWith('.htm') ? activeName : 'Preview.html' });
  };

  const doUndo = () => {
    const snap = undoStack.current.pop();
    if (!snap) return;
    const curSel = getActiveOffsets();
    redoStack.current.push({ text: st.current.text, start: curSel.start, end: curSel.end });
    savedSel.current = { start: snap.start, end: snap.end };
    pendingSel.current = { start: snap.start, end: snap.end };
    setText(snap.text);
    setDirty(true);
    updatePosFromOffset(snap.text, snap.start);
    if (!htmlActive) {
      requestAnimationFrame(() => {
        if (ta.current) {
          ta.current.focus();
          ta.current.setSelectionRange(snap.start, snap.end);
        }
      });
    }
  };

  const doRedo = () => {
    const snap = redoStack.current.pop();
    if (!snap) return;
    const curSel = getActiveOffsets();
    undoStack.current.push({ text: st.current.text, start: curSel.start, end: curSel.end });
    savedSel.current = { start: snap.start, end: snap.end };
    pendingSel.current = { start: snap.start, end: snap.end };
    setText(snap.text);
    setDirty(true);
    updatePosFromOffset(snap.text, snap.start);
    if (!htmlActive) {
      requestAnimationFrame(() => {
        if (ta.current) {
          ta.current.focus();
          ta.current.setSelectionRange(snap.start, snap.end);
        }
      });
    }
  };

  const insert = (str, rangeOverride = null) => {
    const o = rangeOverride || getActiveOffsets();
    const cur = st.current.text;
    const next = cur.slice(0, o.start) + str + cur.slice(o.end);
    const caret = o.start + str.length;
    applyTextEdit(next, caret, caret);
  };

  insertDictatedRef.current = (rawTranscript) => {
    const o = getActiveOffsets();
    const cur = st.current.text || '';
    const charBefore = o.start > 0 ? cur[o.start - 1] : '';
    const chunk = formatDictatedChunk(rawTranscript, charBefore);
    if (chunk) insert(chunk, o);
  };

  const cutSelection = async (rangeOverride = null) => {
    const o = rangeOverride || getActiveOffsets();
    if (o.end <= o.start) return;
    const slice = st.current.text.slice(o.start, o.end);
    try { await navigator.clipboard.writeText(slice); } catch { /* ignore */ }
    insert('', o);
  };

  const copySelection = async (rangeOverride = null) => {
    const o = rangeOverride || getActiveOffsets();
    if (o.end <= o.start) return;
    const slice = st.current.text.slice(o.start, o.end);
    try { await navigator.clipboard.writeText(slice); } catch { /* ignore */ }
  };

  const deleteSelection = (rangeOverride = null) => {
    const o = rangeOverride || getActiveOffsets();
    if (o.end <= o.start) return;
    insert('', o);
  };

  const paste = async (rangeOverride = null) => {
    try {
      const clip = (await navigator.clipboard.readText()).replace(/\r?\n/g, '\n');
      insert(clip, rangeOverride);
    } catch {
      os.msg({ icon: 'info', title: 'Notepad', text: 'Clipboard access was blocked by the browser. Use Ctrl+V to paste.' });
    }
  };

  const selectAllEditor = () => {
    const len = st.current.text.length;
    focusAndSelect(0, len);
  };

  const find = async (again) => {
    let q = lastFind.current;
    if (!again || !q) { q = await os.prompt({ title: 'Find', label: 'Find what:', value: q }); if (!q) return; lastFind.current = q; }
    const o = getActiveOffsets();
    const val = st.current.text;
    let i = val.toLowerCase().indexOf(q.toLowerCase(), o.end);
    if (i < 0) i = val.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) { os.msg({ icon: 'info', title: 'Notepad', text: `Cannot find "${q}"` }); return; }
    focusAndSelect(i, i + q.length);
  };

  const handleCodeInput = () => {
    if (composingRef.current || !codeRef.current) return;
    const raw = readPreText(codeRef.current);
    if (raw === st.current.text) return;
    const offsets = getPreOffsets(codeRef.current) || { start: raw.length, end: raw.length };
    undoStack.current.push({ text: st.current.text, start: savedSel.current.start, end: savedSel.current.end });
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
    savedSel.current = offsets;
    pendingSel.current = offsets;
    setText(raw);
    setDirty(true);
    updatePosFromOffset(raw, offsets.start);
  };

  const handleCodeKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      insert('\n');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      insert('\t');
    }
  };

  const handleCodePaste = (e) => {
    e.preventDefault();
    const clip = (e.clipboardData?.getData('text/plain') || '').replace(/\r?\n/g, '\n');
    if (clip) insert(clip);
  };

  const key = (e) => {
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(false); }
    else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveToLocalPC(true); }
    else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openFromPC(); }
    else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openFromC(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); newDoc(); }
    else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z' && htmlActive) { e.preventDefault(); doUndo(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'y' && htmlActive) { e.preventDefault(); doRedo(); }
    else if (e.key === 'F5') { e.preventDefault(); insert(new Date().toLocaleString()); }
    else if (e.key === 'F3') { e.preventDefault(); find(true); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); find(false); }
    else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'v') { e.preventDefault(); voice.toggle(); }
  };

  const editorContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const o = { ...getActiveOffsets() };
    const hasSel = o.end > o.start;
    os.showMenu(e.clientX, e.clientY, [
      { label: '&Undo', disabled: htmlActive ? !undoStack.current.length : false, onClick: () => (htmlActive ? doUndo() : (ta.current?.focus(), document.execCommand('undo'))) },
      { sep: true },
      { label: 'Cu&t', disabled: !hasSel, onClick: () => cutSelection(o) },
      { label: '&Copy', disabled: !hasSel, onClick: () => copySelection(o) },
      { label: '&Paste', onClick: () => paste(o) },
      { label: '&Delete', disabled: !hasSel, onClick: () => deleteSelection(o) },
      { sep: true },
      { label: 'Select &All', disabled: !st.current.text.length, onClick: selectAllEditor },
      { sep: true },
      { label: 'Time/&Date', onClick: () => insert(new Date().toLocaleString(), o) },
      { label: '&Word Wrap', checked: wrap, onClick: () => setWrap((w) => !w) },
      { sep: true },
      { label: voice.listening ? '⏸️ &Voice Dictation: Stop' : '🎙️ &Voice Dictation: Start', onClick: () => voice.toggle() },
      {
        label: 'Voice &Language',
        sub: VOICE_LANGUAGES.map((l) => ({
          label: l.label,
          radio: true,
          checked: voice.lang === l.id,
          onClick: () => voice.changeLang(l.id),
        })),
      },
    ]);
  };

  // --- SmartTransfer Helpers ---
  const getSelectionOrFull = () => {
    const o = getActiveOffsets();
    const full = st.current.text || '';
    if (o.end > o.start) {
      return { text: full.slice(o.start, o.end), hasSelection: true };
    }
    return { text: full, hasSelection: false };
  };

  const receiveTransfer = useCallback(async (transfer, action = 'open') => {
    if (!transfer) return false;
    let incoming = String(transfer.payload || '').replace(/\r?\n/g, '\n');
    if (transfer.contentType === 'text/html' && !transfer.meta?.asSource) {
      incoming = SmartTransfer.extractTextFromHtml(incoming);
    }

    let mode = action;
    if (mode === 'open' && (st.current.text.length > 0 || st.current.dirty)) {
      const choice = await receiveConflictDialog(os, {
        targetApp: 'notepad',
        sourceName: SmartTransfer.APP_NAMES[transfer.sourceApp] || transfer.sourceApp,
        title: transfer.title,
        isImage: false,
      });
      if (!choice || choice === 'cancel') return false;
      mode = choice; // 'replace' | 'insert' | 'append'
    } else if (mode === 'open') {
      mode = 'replace';
    }

    if (transfer.meta?.syntaxHighlight) {
      setHlMode('on');
    }

    if (mode === 'replace') {
      resetHistory();
      setText(incoming);
      setFileId(null);
      setLocalFile(transfer.title ? { name: transfer.title, handle: null } : null);
      setDirty(true);
      setPos({ ln: 1, col: 1 });
      return true;
    }

    if (mode === 'append') {
      const cur = st.current.text || '';
      const sep = cur && !cur.endsWith('\n') ? '\n' : '';
      const next = cur + sep + incoming;
      applyTextEdit(next, next.length, next.length);
      return true;
    }

    // mode === 'insert'
    insert(incoming);
    return true;
  }, [os]); // eslint-disable-line

  const receiveTransferRef = useRef(receiveTransfer);
  receiveTransferRef.current = receiveTransfer;

  useEffect(() => {
    return SmartTransfer.registerApp('notepad', win.id, {
      getCapability: () => ({
        hasText: !!(st.current.text || '').trim(),
        hasHtml: !!(st.current.text || '').trim(),
        hasImage: false,
        hasContent: !!(st.current.text || '').trim(),
      }),
      pullFor: async () => {
        const { text: payload } = getSelectionOrFull();
        if (!payload.trim()) return null;
        return { contentType: 'text/plain', payload, title: fname() };
      },
      receiveTransfer: async (t, act) => receiveTransferRef.current?.(t, act),
    });
  }, [win.id]); // eslint-disable-line

  const sendToWordPadTxt = async () => {
    const { text: payload } = getSelectionOrFull();
    if (!payload.trim()) {
      os.msg({ icon: 'info', title: 'Smart Send', text: 'Notepad is empty.' });
      return;
    }
    await SmartTransfer.send({
      sourceApp: 'notepad',
      targetApp: 'wordpad',
      contentType: 'text/plain',
      payload,
      title: fname(),
    });
  };

  const sendToWordPadHtml = async () => {
    const { text: payload } = getSelectionOrFull();
    if (!payload.trim()) {
      os.msg({ icon: 'info', title: 'Smart Send', text: 'Notepad is empty.' });
      return;
    }
    const styledHtml = SmartTransfer.syntaxHighlightToInlineHtml(payload);
    await SmartTransfer.send({
      sourceApp: 'notepad',
      targetApp: 'wordpad',
      contentType: 'text/html',
      payload: styledHtml,
      title: fname().replace(/\.\w+$/, '') + '.html',
      meta: { syntaxHighlightedHtml: true },
    });
  };

  const pullFrom = async (sourceApp) => {
    try {
      const t = await SmartTransfer.pull({ sourceApp, targetApp: 'notepad', kind: 'text' });
      if (!t) {
        os.msg({ icon: 'info', title: 'Notepad', text: `No text available from ${SmartTransfer.APP_NAMES[sourceApp]}.` });
        return;
      }
      await receiveTransfer(t, 'open');
    } catch (e) {
      os.msg({ icon: 'error', title: 'Notepad', text: e.message });
    }
  };

  const menus = [
    { label: '&File', items: [
      { label: '&New', shortcut: 'Ctrl+N', onClick: newDoc },
      { label: '&Open (Drive C:)...', shortcut: 'Ctrl+O', onClick: openFromC },
      { label: 'Open from &Local PC (TXT / HTML)...', shortcut: 'Ctrl+Shift+O', onClick: openFromPC },
      { sep: true },
      { label: '&Save', shortcut: 'Ctrl+S', onClick: () => save(false) },
      { label: 'Save &As (Drive C:)...', onClick: () => saveToC(true) },
      { label: 'Save to Local &PC...', shortcut: 'Ctrl+Shift+S', onClick: () => saveToLocalPC(false) },
      { sep: true },
      { label: '&Preview HTML in Browser...', disabled: !text.trim(), onClick: previewInBrowser },
      { sep: true },
      { label: 'E&xit', onClick: () => os.close(win.id) },
    ] },
    { label: '&Edit', items: [
      { label: '&Undo', shortcut: 'Ctrl+Z', onClick: () => (htmlActive ? doUndo() : (ta.current?.focus(), document.execCommand('undo'))) }, { sep: true },
      { label: 'Cu&t', shortcut: 'Ctrl+X', onClick: () => cutSelection() },
      { label: '&Copy', shortcut: 'Ctrl+C', onClick: () => copySelection() },
      { label: '&Paste', shortcut: 'Ctrl+V', onClick: () => paste() },
      { label: 'De&lete', shortcut: 'Del', onClick: () => deleteSelection() }, { sep: true },
      { label: 'Select &All', onClick: selectAllEditor },
      { label: 'Time/&Date', shortcut: 'F5', onClick: () => insert(new Date().toLocaleString()) }, { sep: true },
      { label: '&Find...', shortcut: 'Ctrl+F', onClick: () => find(false) },
      { label: 'Find &Next', shortcut: 'F3', onClick: () => find(true) },
    ] },
    { label: 'F&ormat', items: [
      { label: '&Word Wrap', checked: wrap, onClick: () => setWrap(!wrap) },
      { sep: true },
      { label: 'HTML Highlight: &Auto', radio: true, checked: hlMode === 'auto', onClick: () => setHlMode('auto') },
      { label: 'HTML Highlight: &On', radio: true, checked: hlMode === 'on', onClick: () => setHlMode('on') },
      { label: 'HTML Highlight: O&ff', radio: true, checked: hlMode === 'off', onClick: () => setHlMode('off') },
    ] },
    { label: '&Voice', items: [
      { label: voice.listening ? '⏸️ &Stop Dictation' : '🎙️ &Start Dictation', shortcut: 'Ctrl+Shift+V', onClick: voice.toggle },
      { sep: true },
      ...VOICE_LANGUAGES.map((l) => ({
        label: l.label,
        radio: true,
        checked: voice.lang === l.id,
        onClick: () => voice.changeLang(l.id),
      })),
    ] },
    { label: '&Send', items: () => [
      { label: 'Send to WordPad (&TXT)', disabled: !text.trim(), onClick: sendToWordPadTxt },
      { label: 'Send to WordPad (&HTML with Syntax Colors)', disabled: !text.trim(), onClick: sendToWordPadHtml },
      { sep: true },
      { label: 'Get from &WordPad', disabled: !SmartTransfer.canPull('wordpad'), onClick: () => pullFrom('wordpad') },
      { label: 'Get from &Internet Explorer', disabled: !SmartTransfer.canPull('browser'), onClick: () => pullFrom('browser') },
      { sep: true },
      { label: 'Transfer &History & Cache...', onClick: () => openTransferHistoryDialog(os) },
    ] },
    { label: '&Help', items: [{ label: '&Help Topics', onClick: () => os.open('help') }, { sep: true }, { label: '&About Notepad', onClick: () => os.msg({ icon: 'info', title: 'About Notepad', text: 'Notepad\nWindows 95 Smart Edition\nOpen & save text and HTML files with drift-free single-layer HTML syntax highlighting and Smart Office Transfer.' }) }] },
  ];

  const sourceLabel = fileId ? fs.pathOf(fileId) : localFile ? `Local PC: ${localFile.name}${localFile.handle ? ' (Direct Write)' : ''}` : 'Untitled';

  return (
    <div className="app" onKeyDown={key} onDragOver={(e) => e.preventDefault()} onDrop={onDropFile}>
      <MenuBar menus={menus} />
      {htmlActive ? (
        <pre
          ref={codeRef}
          className="field np-code"
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          spellCheck={false}
          style={{ whiteSpace: wrap ? 'pre-wrap' : 'pre', overflowWrap: wrap ? 'break-word' : 'normal' }}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; handleCodeInput(); }}
          onInput={handleCodeInput}
          onKeyDown={handleCodeKeyDown}
          onPaste={handleCodePaste}
          onKeyUp={upd}
          onMouseUp={upd}
          onBlur={getActiveOffsets}
          onContextMenu={editorContextMenu}
          autoFocus
        >
          {tokens.map((tk, idx) => (
            <span key={idx} className={'np-tk-' + tk.type}>{tk.text}</span>
          ))}
          {(!text || text.endsWith('\n')) && <br data-eof="1" />}
        </pre>
      ) : (
        <textarea
          ref={ta}
          className="field np-text"
          value={text}
          spellCheck={false}
          wrap={wrap ? 'soft' : 'off'}
          style={{ whiteSpace: wrap ? 'pre-wrap' : 'pre' }}
          onChange={(e) => { setText(e.target.value); setDirty(true); upd(); }}
          onKeyUp={upd}
          onClick={upd}
          onSelect={upd}
          onBlur={getActiveOffsets}
          onContextMenu={editorContextMenu}
          autoFocus
        />
      )}
      <StatusBar>
        <span>{voice.listening ? `🎙️ ${voice.interim || 'Listening...'}` : `${sourceLabel}${dirty ? ' *' : ''}`}</span>
        <span>{htmlActive ? 'HTML Syntax' : text.length > MAX_HL_CHARS ? 'Plain Text (Large File)' : 'Plain Text'}</span>
        <span>Ln {pos.ln}, Col {pos.col}</span>
      </StatusBar>
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import * as fs from '../os/fs.js';
import { pickLocalFiles, saveLocalFile } from '../os/localFiles.js';
import { rtfToHtml, htmlToRtf, sanitizeHtmlForEditor, wrapStandaloneHtml } from '../utils/rtf.js';
import * as SmartTransfer from '../os/smartTransfer.js';
import { pickImageDialog, receiveConflictDialog, openTransferHistoryDialog } from '../os/smartTransferUI.jsx';
import { useVoiceDictation, VOICE_LANGUAGES, formatDictatedChunk } from '../utils/voiceDictation.js';

const FONTS = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Tahoma', 'Verdana'];
const SIZES = [
  ['1', '8'], ['2', '10'], ['3', '12'], ['4', '14'], ['5', '18'], ['6', '24'], ['7', '36'],
];
const DOC_TYPES = [
  {
    description: 'WordPad Documents (RTF, HTML, HTML ZIP)',
    accept: {
      'application/rtf': ['.rtf'],
      'text/html': ['.html', '.htm'],
      'application/zip': ['.zip'],
      'text/plain': ['.txt', '.md'],
    },
  },
];

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ''));
    r.onerror = () => rej(r.error || new Error('Failed to read file'));
    r.readAsDataURL(blob);
  });
}

export default function WordPad({ win, props, active }) {
  const os = useOS();
  const ed = useRef();
  const savedRange = useRef(null);
  const selectedImgRef = useRef(null);
  const blobUrls = useRef([]);
  const [fileId, setFileId] = useState(props.fileId || null);
  const [localFile, setLocalFile] = useState(null); // { name, handle }
  const [format, setFormat] = useState('rtf'); // 'rtf' | 'html' | 'zip'
  const [dirty, setDirty] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [showFormatBar, setShowFormatBar] = useState(true);
  const [showRuler, setShowRuler] = useState(true);
  const [font, setFont] = useState('Arial');
  const [fontSize, setFontSize] = useState('3');
  const [color, setColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffff00');
  const [wordCount, setWordCount] = useState(0);
  const st = useRef({});
  st.current = { fileId, localFile, format, dirty };
  const lastFind = useRef('');

  useEffect(() => () => {
    blobUrls.current.forEach((u) => SmartTransfer.revokeTempUrl(u));
    blobUrls.current = [];
  }, []);

  const regBlob = (blob) => {
    const u = SmartTransfer.createTempUrl(blob);
    blobUrls.current.push(u);
    return u;
  };

  const updateWordCount = () => {
    const txt = ed.current?.innerText?.trim() || '';
    setWordCount(txt ? txt.split(/\s+/).length : 0);
  };

  const captureSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !ed.current) return;
    const rng = sel.getRangeAt(0);
    if (ed.current.contains(rng.commonAncestorContainer)) {
      savedRange.current = rng.cloneRange();
    }
  };

  const restoreSelection = () => {
    ed.current?.focus();
    const rng = savedRange.current;
    if (!rng || !ed.current?.contains(rng.commonAncestorContainer)) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(rng);
  };

  const getCharBeforeCaret = () => {
    const el = ed.current;
    if (!el) return '';
    const sel = window.getSelection();
    let rng = null;
    if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).startContainer)) rng = sel.getRangeAt(0);
    else if (savedRange.current && el.contains(savedRange.current.startContainer)) rng = savedRange.current;
    if (!rng) return (el.innerText || '').slice(-1);
    if (rng.startContainer.nodeType === 3 && rng.startOffset > 0) {
      return (rng.startContainer.nodeValue || '')[rng.startOffset - 1] || '';
    }
    try {
      const pre = document.createRange();
      pre.setStart(el, 0);
      pre.setEnd(rng.startContainer, rng.startOffset);
      return pre.toString().slice(-1);
    } catch {
      return '';
    }
  };

  const insertDictatedText = (rawTranscript) => {
    const el = ed.current;
    if (!el) return;
    const sel = window.getSelection();
    const hasLiveInEditor = sel && sel.rangeCount > 0 && el.contains(sel.anchorNode);
    if (!hasLiveInEditor) {
      if (savedRange.current && el.contains(savedRange.current.commonAncestorContainer)) {
        restoreSelection();
      } else {
        el.focus();
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
    }
    const chunk = formatDictatedChunk(rawTranscript, getCharBeforeCaret());
    if (!chunk) return;
    try {
      document.execCommand('insertText', false, chunk);
    } catch {
      const curSel = window.getSelection();
      if (curSel && curSel.rangeCount > 0) {
        const r = curSel.getRangeAt(0);
        r.deleteContents();
        const tn = document.createTextNode(chunk);
        r.insertNode(tn);
        r.setStartAfter(tn);
        r.collapse(true);
        curSel.removeAllRanges();
        curSel.addRange(r);
      }
    }
    setDirty(true);
    updateWordCount();
    captureSelection();
  };

  const voice = useVoiceDictation({
    onResult: insertDictatedText,
    onError: (msg) => os.msg({ icon: 'warning', title: 'WordPad Voice Dictation', text: msg }),
  });

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

  const loadFromBlob = async (blob, filename) => {
    const ext = fs.ext(filename);
    if (ext === 'zip') {
      const { extractHtmlFromZip } = await import('../utils/htmlZip.js');
      const buf = new Uint8Array(await blob.arrayBuffer());
      const res = extractHtmlFromZip(buf, filename);
      if (ed.current) {
        ed.current.innerHTML = res.html || '<p><br></p>';
        updateWordCount();
      }
      setFormat('zip');
      setDirty(false);
      return;
    }
    const txt = await blob.text();
    loadContent(txt, filename);
  };

  useEffect(() => {
    if (ed.current && !props.fileId && !props.transferId) {
      ed.current.innerHTML = '<p><br></p>';
    }
    if (props.transferId) {
      SmartTransfer.getTransfer(props.transferId).then((t) => {
        if (t) receiveTransferRef.current?.(t, props.transferAction || 'open');
      });
    } else if (props.fileId) {
      const n = fs.get(props.fileId);
      if (n) loadFromBlob(fs.toBlob(n), n.name).catch((e) => os.msg({ icon: 'error', title: 'WordPad', text: e.message }));
    }
  }, [win.nonce]); // eslint-disable-line

  useEffect(() => {
    if (active) SmartTransfer.touchApp('wordpad', win.id);
  }, [active, win.id]);

  useEffect(() => {
    const nm = fileId ? fs.get(fileId)?.name : localFile ? localFile.name : 'Document';
    os.setTitle(win.id, `${nm || 'Document'}${dirty ? '*' : ''} - WordPad`);
  }, [fileId, localFile, dirty, win.id, os]);

  const inlineBlobImagesForStandaloneHtml = async (rawBodyHtml) => {
    if (!rawBodyHtml.includes('blob:')) return rawBodyHtml;
    const parsed = new DOMParser().parseFromString(rawBodyHtml, 'text/html');
    for (const im of [...parsed.body.querySelectorAll('img')]) {
      const src = im.getAttribute('src') || '';
      if (src.startsWith('blob:')) {
        try {
          const res = await fetch(src);
          const b = await res.blob();
          im.setAttribute('src', await blobToDataUrl(b));
        } catch { /* ignore */ }
      }
    }
    return parsed.body.innerHTML;
  };

  const serialize = async (targetFormat, docTitle = 'Document') => {
    const bodyHtml = ed.current?.innerHTML || '<p><br></p>';
    if (targetFormat === 'html') {
      const standaloneBody = await inlineBlobImagesForStandaloneHtml(bodyHtml);
      return { text: wrapStandaloneHtml(standaloneBody, docTitle), mime: 'text/html', ext: 'html' };
    }
    return { text: htmlToRtf(bodyHtml), mime: 'application/rtf', ext: 'rtf' };
  };

  const saveHtmlZipToPC = async () => {
    const s = st.current;
    const baseName = (s.localFile?.name || (s.fileId ? fs.get(s.fileId)?.name : '') || 'Document').replace(/\.\w+$/, '');
    try {
      const { packHtmlToZip } = await import('../utils/htmlZip.js');
      const { blob, imageCount } = await packHtmlToZip(ed.current?.innerHTML || '<p><br></p>', baseName);
      const res = await saveLocalFile({
        blob,
        suggestedName: `${baseName}.zip`,
        description: 'HTML + Images ZIP Package',
        ext: '.zip',
      });
      if (!res) return false;
      setLocalFile({ name: res.name, handle: null });
      setFileId(null);
      setFormat('zip');
      setDirty(false);
      os.msg({
        icon: 'info',
        title: 'WordPad HTML Package Saved',
        text: `Saved "${res.name}" with index.html and ${imageCount} image(s) inside images/.`,
      });
      return true;
    } catch (e) {
      os.msg({ icon: 'error', title: 'WordPad', text: 'Could not save HTML ZIP package: ' + e.message });
      return false;
    }
  };

  const saveHtmlZipToC = async () => {
    const s = st.current;
    const baseName = (s.fileId ? fs.get(s.fileId)?.name : s.localFile?.name || 'Document').replace(/\.\w+$/, '');
    const r = await os.fileDialog({
      mode: 'save',
      exts: ['zip'],
      name: `${baseName}.zip`,
      title: 'Save HTML Package (.zip) to Drive C:',
    });
    if (!r) return false;
    try {
      const { packHtmlToZip } = await import('../utils/htmlZip.js');
      const { blob } = await packHtmlToZip(ed.current?.innerHTML || '<p><br></p>', r.name.replace(/\.\w+$/, ''));
      const node = r.existing
        ? fs.write(r.existing.id, blob, 'application/zip')
        : fs.create({ name: r.name, parent: r.parent, data: blob, mime: 'application/zip' });
      setFileId(node.id);
      setLocalFile(null);
      setFormat('zip');
      setDirty(false);
      return true;
    } catch (e) {
      os.msg({ icon: 'error', title: 'WordPad', text: e.message });
      return false;
    }
  };

  const saveToC = async (as = false, forceExt = null) => {
    const s = st.current;
    if (forceExt === 'zip' || (!as && !forceExt && s.format === 'zip' && s.fileId && /\.zip$/i.test(fs.get(s.fileId)?.name || ''))) {
      return saveHtmlZipToC();
    }
    let id = s.fileId;
    try {
      let targetName = id && fs.get(id) ? fs.get(id).name : s.localFile?.name || `Document.${forceExt || (s.format === 'zip' ? 'html' : s.format)}`;
      if (forceExt) targetName = targetName.replace(/\.\w+$/, '') + '.' + forceExt;

      if (!id || as || !fs.get(id) || forceExt) {
        const r = await os.fileDialog({
          mode: 'save',
          exts: forceExt ? [forceExt] : ['rtf', 'html', 'htm', 'zip'],
          name: targetName,
          title: 'Save As (Drive C:)',
        });
        if (!r) return false;
        if (/\.zip$/i.test(r.name)) {
          const { packHtmlToZip } = await import('../utils/htmlZip.js');
          const { blob } = await packHtmlToZip(ed.current?.innerHTML || '<p><br></p>', r.name.replace(/\.\w+$/, ''));
          id = r.existing ? fs.write(r.existing.id, blob, 'application/zip').id : fs.create({ name: r.name, parent: r.parent, data: blob, mime: 'application/zip' }).id;
          setFormat('zip');
        } else {
          const chosenFmt = /\.html?$/i.test(r.name) ? 'html' : 'rtf';
          const { text, mime } = await serialize(chosenFmt, r.name);
          id = r.existing ? fs.write(r.existing.id, text, mime).id : fs.create({ name: r.name, parent: r.parent, data: text, mime }).id;
          setFormat(chosenFmt);
        }
      } else {
        const curName = fs.get(id).name;
        const chosenFmt = /\.html?$/i.test(curName) ? 'html' : 'rtf';
        const { text, mime } = await serialize(chosenFmt, curName);
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
    if (forceExt === 'zip' || (!forceDialog && !forceExt && s.format === 'zip')) {
      return saveHtmlZipToPC();
    }
    let suggested = s.localFile?.name || (s.fileId ? fs.get(s.fileId)?.name : null) || `Document.${forceExt || s.format}`;
    if (forceExt) suggested = suggested.replace(/\.\w+$/, '') + '.' + forceExt;
    const chosenFmt = forceExt ? (forceExt === 'html' ? 'html' : 'rtf') : /\.html?$/i.test(suggested) ? 'html' : s.format === 'html' ? 'html' : 'rtf';
    const { text, mime } = await serialize(chosenFmt, suggested);
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
    const n = await os.fileDialog({ mode: 'open', exts: ['rtf', 'html', 'htm', 'zip', 'txt', 'md'], title: 'Open from Drive C:' });
    if (n) {
      try {
        await loadFromBlob(fs.toBlob(n), n.name);
        setFileId(n.id);
        setLocalFile(null);
      } catch (e) {
        os.msg({ icon: 'error', title: 'WordPad', text: e.message });
      }
    }
  };

  const openFromPC = async () => {
    if (!(await confirmDiscard())) return;
    const picked = await pickLocalFiles({ accept: '.rtf,.html,.htm,.zip,.txt,.md', types: DOC_TYPES });
    if (!picked) return;
    try {
      await loadFromBlob(picked.file, picked.name);
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
    try {
      await loadFromBlob(f, f.name);
      setFileId(null);
      setLocalFile({ name: f.name, handle: null });
    } catch (err) {
      os.msg({ icon: 'error', title: 'WordPad', text: err.message });
    }
  };

  const exec = (cmd, val = null, useSavedRange = false) => {
    if (useSavedRange) restoreSelection();
    else ed.current?.focus();

    try {
      document.execCommand('styleWithCSS', false, true);
    } catch { /* ignore */ }

    let ok = document.execCommand(cmd, false, val);
    if (!ok && cmd === 'hiliteColor') {
      ok = document.execCommand('backColor', false, val);
    }
    captureSelection();
    setDirty(true);
    updateWordCount();
  };

  const applyHighlight = (hexOrTransparent) => {
    if (hexOrTransparent !== 'transparent') setBgColor(hexOrTransparent);
    exec('hiliteColor', hexOrTransparent, true);
  };

  const insertImageFromPC = async () => {
    const picked = await pickLocalFiles({ accept: 'image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp' });
    if (!picked?.file) return;
    try {
      const dataUrl = await blobToDataUrl(picked.file);
      restoreSelection();
      const safeName = picked.name.replace(/"/g, '');
      exec('insertHTML', `<img src="${dataUrl}" alt="${safeName}" data-filename="${safeName}" style="max-width:100%;height:auto;" />`, true);
    } catch (e) {
      os.msg({ icon: 'error', title: 'Insert Picture', text: e.message });
    }
  };

  const insertImageFromC = async () => {
    const n = await os.fileDialog({ mode: 'open', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'], title: 'Insert Image (Drive C:)' });
    if (!n) return;
    try {
      const dataUrl = await blobToDataUrl(fs.toBlob(n));
      restoreSelection();
      const safeName = n.name.replace(/"/g, '');
      exec('insertHTML', `<img src="${dataUrl}" alt="${safeName}" data-filename="${safeName}" style="max-width:100%;height:auto;" />`, true);
    } catch (e) {
      os.msg({ icon: 'error', title: 'Insert Picture', text: e.message });
    }
  };

  const insertDateTime = () => {
    exec('insertText', new Date().toLocaleString());
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

  // --- SmartTransfer Helpers ---
  const docName = () => {
    const s = st.current;
    return (s.fileId ? fs.get(s.fileId)?.name : s.localFile?.name) || 'Document';
  };

  const hasDocText = () => !!(ed.current?.innerText?.trim());
  const hasDocImages = () => !!(ed.current?.querySelector('img'));
  const hasDocContent = () => hasDocText() || hasDocImages();

  const getSelectionOrFull = () => {
    const el = ed.current;
    if (!el) return { text: '', html: '', hasSelection: false };
    const sel = window.getSelection();
    let rng = null;
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      rng = sel.getRangeAt(0);
    } else if (savedRange.current && !savedRange.current.collapsed && el.contains(savedRange.current.commonAncestorContainer)) {
      rng = savedRange.current;
    }
    if (rng) {
      const box = document.createElement('div');
      box.appendChild(rng.cloneContents());
      return { text: rng.toString(), html: box.innerHTML, hasSelection: true };
    }
    return {
      text: (el.innerText || '').replace(/\r?\n/g, '\n'),
      html: el.innerHTML || '',
      hasSelection: false,
    };
  };

  const pickWordPadImageBlob = async () => {
    const el = ed.current;
    if (!el) return null;
    const imgs = [...el.querySelectorAll('img')];
    if (!imgs.length) {
      os.msg({ icon: 'info', title: 'Smart Send', text: 'There are no images in this document.' });
      return null;
    }
    let targetImg = null;
    if (selectedImgRef.current && el.contains(selectedImgRef.current)) {
      targetImg = selectedImgRef.current;
    } else if (imgs.length === 1) {
      targetImg = imgs[0];
    } else {
      const candidates = imgs.map((im, idx) => ({
        imgEl: im,
        previewSrc: im.src,
        label: im.getAttribute('data-filename') || im.getAttribute('alt') || `Image ${idx + 1}`,
        dims: im.naturalWidth ? `${im.naturalWidth}×${im.naturalHeight}` : '',
      }));
      const picked = await pickImageDialog(os, candidates, 'Select Image from WordPad');
      targetImg = picked?.imgEl || null;
    }
    if (!targetImg) return null;
    const blob = await SmartTransfer.imageSrcToBlob(targetImg.currentSrc || targetImg.src);
    if (!blob) {
      os.msg({ icon: 'error', title: 'Smart Send', text: 'Could not read image data.' });
      return null;
    }
    const label = targetImg.getAttribute('data-filename') || targetImg.getAttribute('alt') || 'WordPad Image';
    return { blob, title: label };
  };

  const receiveTransfer = useCallback(async (transfer, action = 'open') => {
    if (!transfer || !ed.current) return false;
    const el = ed.current;
    const isImg = transfer.contentType?.startsWith('image/');
    let mode = action;

    if (mode === 'open' && hasDocContent()) {
      const choice = await receiveConflictDialog(os, {
        targetApp: 'wordpad',
        sourceName: SmartTransfer.APP_NAMES[transfer.sourceApp] || transfer.sourceApp,
        title: transfer.title,
        isImage: isImg,
      });
      if (!choice || choice === 'cancel') return false;
      mode = choice; // 'replace' | 'insert' | 'append'
    } else if (mode === 'open') {
      mode = 'replace';
    }

    let htmlChunk = '';
    if (isImg) {
      const blob = transfer.payload instanceof Blob
        ? transfer.payload
        : await SmartTransfer.imageSrcToBlob(String(transfer.payload || ''));
      if (!blob) {
        os.msg({ icon: 'error', title: 'WordPad', text: 'Could not load received image.' });
        return false;
      }
      const url = regBlob(blob);
      const safeName = (transfer.title || 'image.png').replace(/"/g, '');
      htmlChunk = `<p><img src="${url}" alt="${safeName}" data-filename="${safeName}" style="max-width:100%;height:auto;" /></p>`;
    } else if (transfer.contentType === 'text/html') {
      htmlChunk = sanitizeHtmlForEditor(String(transfer.payload || ''));
    } else {
      htmlChunk = SmartTransfer.plainTextToEditableHtml(String(transfer.payload || ''));
    }

    if (mode === 'replace') {
      el.innerHTML = htmlChunk || '<p><br></p>';
      setFormat(transfer.contentType === 'text/html' ? 'html' : st.current.format);
      setDirty(true);
      updateWordCount();
      return true;
    }

    if (mode === 'append') {
      if (el.innerHTML.trim() === '<p><br></p>' || !hasDocContent()) {
        el.innerHTML = htmlChunk || '<p><br></p>';
      } else {
        el.insertAdjacentHTML('beforeend', htmlChunk);
      }
      setDirty(true);
      updateWordCount();
      return true;
    }

    // mode === 'insert'
    if (savedRange.current && el.contains(savedRange.current.commonAncestorContainer)) {
      restoreSelection();
      document.execCommand('insertHTML', false, htmlChunk);
      captureSelection();
    } else {
      el.insertAdjacentHTML('beforeend', htmlChunk);
    }
    setDirty(true);
    updateWordCount();
    return true;
  }, [os]); // eslint-disable-line

  const receiveTransferRef = useRef(receiveTransfer);
  receiveTransferRef.current = receiveTransfer;

  useEffect(() => {
    return SmartTransfer.registerApp('wordpad', win.id, {
      getCapability: () => ({
        hasText: hasDocText(),
        hasHtml: hasDocContent(),
        hasImage: hasDocImages(),
        hasContent: hasDocContent(),
      }),
      pullFor: async (targetApp, kind) => {
        if (kind === 'image' || targetApp === 'paint') {
          const im = await pickWordPadImageBlob();
          return im ? { contentType: im.blob.type || 'image/png', payload: im.blob, title: im.title } : null;
        }
        const { text, html } = getSelectionOrFull();
        if (targetApp === 'browser' && html) {
          return { contentType: 'text/html', payload: html, title: docName() };
        }
        return text.trim() ? { contentType: 'text/plain', payload: text, title: docName() } : null;
      },
      receiveTransfer: async (t, act) => receiveTransferRef.current?.(t, act),
    });
  }, [win.id]); // eslint-disable-line

  const sendToNotepadTxt = async () => {
    const { text } = getSelectionOrFull();
    if (!text.trim()) {
      os.msg({ icon: 'info', title: 'Smart Send', text: 'There is no text to send.' });
      return;
    }
    await SmartTransfer.send({
      sourceApp: 'wordpad',
      targetApp: 'notepad',
      contentType: 'text/plain',
      payload: text,
      title: docName().replace(/\.\w+$/, '') + '.txt',
    });
  };

  const sendToNotepadHtml = async () => {
    const { html, hasSelection } = getSelectionOrFull();
    const cleaned = (html || '').trim();
    if (!cleaned || cleaned === '<p><br></p>') {
      os.msg({ icon: 'info', title: 'Smart Send', text: 'Document is empty.' });
      return;
    }
    const base = docName().replace(/\.\w+$/, '');
    const htmlPayload = hasSelection
      ? cleaned
      : wrapStandaloneHtml(await inlineBlobImagesForStandaloneHtml(cleaned), base);
    await SmartTransfer.send({
      sourceApp: 'wordpad',
      targetApp: 'notepad',
      contentType: 'text/html',
      payload: htmlPayload,
      title: `${base}.html`,
      meta: { syntaxHighlight: true, asSource: true },
    });
  };

  const sendToPaint = async () => {
    const picked = await pickWordPadImageBlob();
    if (!picked) return;
    await SmartTransfer.send({
      sourceApp: 'wordpad',
      targetApp: 'paint',
      contentType: picked.blob.type || 'image/png',
      payload: picked.blob,
      title: picked.title,
    });
  };

  const pullFrom = async (sourceApp, kind = 'any') => {
    try {
      const t = await SmartTransfer.pull({ sourceApp, targetApp: 'wordpad', kind });
      if (!t) {
        os.msg({ icon: 'info', title: 'WordPad', text: `No content available from ${SmartTransfer.APP_NAMES[sourceApp]}.` });
        return;
      }
      await receiveTransfer(t, 'open');
    } catch (e) {
      os.msg({ icon: 'error', title: 'WordPad', text: e.message });
    }
  };

  const pasteClipboard = async () => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const imgType = it.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const b = await it.getType(imgType);
            const url = regBlob(b);
            exec('insertHTML', `<p><img src="${url}" alt="pasted.png" style="max-width:100%;height:auto;" /></p>`, true);
            return;
          }
          if (it.types.includes('text/html')) {
            const html = sanitizeHtmlForEditor(await (await it.getType('text/html')).text());
            exec('insertHTML', html, true);
            return;
          }
        }
      }
      const txt = await navigator.clipboard.readText();
      if (txt) exec('insertText', txt, true);
    } catch {
      os.msg({ icon: 'info', title: 'WordPad', text: 'Clipboard access was blocked by the browser. Use Ctrl+V to paste.' });
    }
  };

  const editorContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const clickedImg = e.target?.closest?.('img');
    if (clickedImg) selectedImgRef.current = clickedImg;
    captureSelection();
    const sel = window.getSelection();
    const hasSel = !!(sel && sel.rangeCount > 0 && !sel.isCollapsed && ed.current?.contains(sel.getRangeAt(0).commonAncestorContainer));

    const items = [
      { label: 'Cu&t', disabled: !hasSel, onClick: () => exec('cut', null, true) },
      { label: '&Copy', disabled: !hasSel && !clickedImg, onClick: () => (hasSel ? exec('copy', null, true) : null) },
      { label: '&Paste', onClick: pasteClipboard },
      { label: 'C&lear', disabled: !hasSel, onClick: () => exec('delete', null, true) },
      { sep: true },
      { label: 'Select &All', onClick: () => exec('selectAll') },
      { sep: true },
      {
        label: 'F&ormat',
        sub: [
          { label: '&Bold', onClick: () => exec('bold', null, true) },
          { label: '&Italic', onClick: () => exec('italic', null, true) },
          { label: '&Underline', onClick: () => exec('underline', null, true) },
          { sep: true },
          { label: 'B&ullet Style', onClick: () => exec('insertUnorderedList', null, true) },
          { label: 'Align &Left', onClick: () => exec('justifyLeft', null, true) },
          { label: 'Align &Center', onClick: () => exec('justifyCenter', null, true) },
          { label: 'Align &Right', onClick: () => exec('justifyRight', null, true) },
        ],
      },
      { label: 'B&ullet Style', onClick: () => exec('insertUnorderedList', null, true) },
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
    ];
    if (clickedImg) {
      items.push({ sep: true }, { label: 'Send Image to &Paint', onClick: sendToPaint });
    }
    os.showMenu(e.clientX, e.clientY, items);
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
      { label: 'Open from &Local PC (RTF / HTML / ZIP)...', shortcut: 'Ctrl+Shift+O', onClick: openFromPC },
      { sep: true },
      { label: '&Save', shortcut: 'Ctrl+S', onClick: () => save(false) },
      { label: 'Save &As (Drive C:)...', onClick: () => saveToC(true) },
      { label: 'Save to Local &PC...', shortcut: 'Ctrl+Shift+S', onClick: () => saveToLocalPC(false) },
      { sep: true },
      { label: 'Export as &RTF (.rtf) to PC...', onClick: () => saveToLocalPC(true, 'rtf') },
      { label: 'Export as &HTML (.html) to PC...', onClick: () => saveToLocalPC(true, 'html') },
      { label: 'Export as HTML (.html) to &C:\\...', onClick: () => saveToC(true, 'html') },
      { label: 'Export HTML + Images &ZIP (.zip) to PC...', onClick: saveHtmlZipToPC },
      { label: 'Export HTML + Images ZIP (.zip) to C:\\...', onClick: saveHtmlZipToC },
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
      { label: '&Picture from PC...', onClick: insertImageFromPC },
      { label: 'Picture from Drive &C:...', onClick: insertImageFromC },
      { sep: true },
      { label: '&Date and Time', onClick: insertDateTime },
      { label: '&Horizontal Rule', onClick: () => exec('insertHorizontalRule') },
    ] },
    { label: 'F&ormat', items: [
      { label: '&Bold', onClick: () => exec('bold') },
      { label: '&Italic', onClick: () => exec('italic') },
      { label: '&Underline', onClick: () => exec('underline') },
      { sep: true },
      { label: 'Clear &Highlight Background', onClick: () => applyHighlight('transparent') },
      { sep: true },
      { label: 'Bullet &Style', onClick: () => exec('insertUnorderedList') },
      { label: 'Align &Left', onClick: () => exec('justifyLeft') },
      { label: 'Align &Center', onClick: () => exec('justifyCenter') },
      { label: 'Align &Right', onClick: () => exec('justifyRight') },
    ] },
    { label: '&Send', items: () => [
      { label: 'Send to &Notepad as TXT', disabled: !hasDocText(), onClick: sendToNotepadTxt },
      { label: 'Send to Notepad as &HTML (Syntax Highlight ON)', disabled: !hasDocContent(), onClick: sendToNotepadHtml },
      { label: 'Send to &Paint (selected image)', disabled: !hasDocImages(), onClick: sendToPaint },
      { sep: true },
      { label: 'Get from &Paint', disabled: !SmartTransfer.canPull('paint', 'image'), onClick: () => pullFrom('paint', 'image') },
      { label: 'Get from &Internet Explorer', disabled: !SmartTransfer.canPull('browser'), onClick: () => pullFrom('browser', 'any') },
      { label: 'Get from &Notepad', disabled: !SmartTransfer.canPull('notepad'), onClick: () => pullFrom('notepad', 'any') },
      { sep: true },
      { label: 'Transfer &History & Cache...', onClick: () => openTransferHistoryDialog(os) },
    ] },
    { label: '&Help', items: [
      { label: '&Help Topics', onClick: () => os.open('help') },
      { sep: true },
      { label: '&About WordPad', onClick: () => os.msg({ icon: 'info', title: 'About WordPad', text: 'WordPad\nWindows 95 Smart Edition\nRich Text (.rtf), HTML (.html), HTML+Images ZIP (.zip), and Smart Office Transfer.' }) },
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
          <button className="btn tool" title="Open RTF/HTML/ZIP from Local PC" onClick={openFromPC}>Open PC</button>
          <button className="btn tool" title="Save" onClick={() => save(false)}>Save</button>
          <button className="btn tool" title="Save to Local PC" onClick={() => saveToLocalPC(false)}>Save PC</button>
          <span className="tb-div" />
          <button className="btn tool" title="Insert Picture from PC" onClick={insertImageFromPC}>🖼 Image</button>
          <button className="btn tool" title="Export RTF" onClick={() => saveToLocalPC(true, 'rtf')}>.RTF</button>
          <button className="btn tool" title="Export HTML" onClick={() => saveToLocalPC(true, 'html')}>.HTML</button>
          <button className="btn tool" title="Export HTML + images/ folder (.zip)" onClick={saveHtmlZipToPC}>HTML+ZIP</button>
          <span className="tb-div" />
          <button className="btn tool" title="Undo" onClick={() => exec('undo')}>↶</button>
          <button className="btn tool" title="Find" onClick={findText}>Find</button>
          <button className="btn tool" title="Insert Date/Time" onClick={insertDateTime}>Date</button>
          <span className="tb-div" />
          <button
            className={'btn tool ' + (voice.listening ? 'pressed' : '')}
            title={voice.listening ? 'Pause Voice Dictation' : 'Start Voice Dictation'}
            onMouseDown={(e) => { e.preventDefault(); captureSelection(); }}
            onClick={voice.toggle}
          >
            {voice.listening ? '⏸️' : '🎙️'}
          </button>
          <select
            className="field"
            style={{ height: 22, padding: '0 4px', maxWidth: 118 }}
            title="Voice Dictation Language"
            value={voice.lang}
            onChange={(e) => voice.changeLang(e.target.value)}
          >
            {VOICE_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </div>
      )}
      {showFormatBar && (
        <div className="toolbar">
          <select className="field" style={{ height: 22, padding: '0 4px' }} value={font} onChange={(e) => { setFont(e.target.value); exec('fontName', e.target.value, true); }}>
            {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className="field" style={{ height: 22, padding: '0 4px', width: 52 }} value={fontSize} onChange={(e) => { setFontSize(e.target.value); exec('fontSize', e.target.value, true); }}>
            {SIZES.map(([val, pt]) => <option key={val} value={val}>{pt} pt</option>)}
          </select>
          <span className="tb-div" />
          <button className="btn tool" style={{ fontWeight: 'bold', width: 24 }} title="Bold" onMouseDown={(e) => { e.preventDefault(); exec('bold'); }}>B</button>
          <button className="btn tool" style={{ fontStyle: 'italic', width: 24 }} title="Italic" onMouseDown={(e) => { e.preventDefault(); exec('italic'); }}>I</button>
          <button className="btn tool" style={{ textDecoration: 'underline', width: 24 }} title="Underline" onMouseDown={(e) => { e.preventDefault(); exec('underline'); }}>U</button>
          <label className="btn tool" title="Selected Text Color" onPointerDown={captureSelection} style={{ position: 'relative', width: 28 }}>
            <span style={{ borderBottom: `3px solid ${color}`, fontWeight: 'bold' }}>A</span>
            <input type="color" value={color} onChange={(e) => { setColor(e.target.value); exec('foreColor', e.target.value, true); }} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }} />
          </label>
          <label className="btn tool" title="Selected Text Background / Highlight Color" onPointerDown={captureSelection} style={{ position: 'relative', width: 32 }}>
            <span style={{ background: bgColor, color: '#000', padding: '0 3px', border: '1px solid #808080', fontWeight: 'bold', lineHeight: '14px' }}>ab</span>
            <input type="color" value={bgColor} onChange={(e) => applyHighlight(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }} />
          </label>
          <button className="btn tool" title="Clear Highlight Background" onMouseDown={(e) => { e.preventDefault(); applyHighlight('transparent'); }} style={{ width: 22, fontSize: 10 }}>∅</button>
          <span className="tb-div" />
          <button className="btn tool" title="Align Left" onMouseDown={(e) => { e.preventDefault(); exec('justifyLeft'); }}>⫷</button>
          <button className="btn tool" title="Center" onMouseDown={(e) => { e.preventDefault(); exec('justifyCenter'); }}>☰</button>
          <button className="btn tool" title="Align Right" onMouseDown={(e) => { e.preventDefault(); exec('justifyRight'); }}>⫸</button>
          <button className="btn tool" title="Bullets" onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }}>•≡</button>
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
          onPointerDown={(e) => {
            const im = e.target?.closest?.('img');
            if (im) selectedImgRef.current = im;
          }}
          onInput={() => { setDirty(true); updateWordCount(); captureSelection(); }}
          onKeyUp={captureSelection}
          onMouseUp={captureSelection}
          onContextMenu={editorContextMenu}
        />
      </div>
      <StatusBar>
        <span>{voice.listening ? `🎙️ ${voice.interim || 'Listening...'}` : `${sourceLabel}${dirty ? ' *' : ''}`}</span>
        <span>Format: {format.toUpperCase()}</span>
        <span>{wordCount} words</span>
      </StatusBar>
    </div>
  );
}

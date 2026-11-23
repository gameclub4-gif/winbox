import { useState, useRef, useEffect } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import * as fs from '../os/fs.js';
import { setSettings } from '../os/settings.js';
import { pickLocalFiles, saveLocalFile } from '../os/localFiles.js';

const PALETTE = ['#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
  '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040'];
const TOOLS = [['eraser', 'Eraser/Color Eraser', '▱'], ['fill', 'Fill With Color', '⬒'], ['picker', 'Pick Color', '⌖'], ['zoom', 'Magnifier', '⌕'],
  ['pencil', 'Pencil', '✎'], ['brush', 'Brush', '🖌'], ['airbrush', 'Airbrush', '∴'], ['text', 'Text', 'A'],
  ['line', 'Line', '╲'], ['rect', 'Rectangle', '▭'], ['ellipse', 'Ellipse', '◯'], ['rrect', 'Rounded Rectangle', '▢']];
const TI = {
  eraser: <><path d="M3 11l6-7 5 4-5 6H5z" fill="#f8a0a0" stroke="#000" /></>,
  fill: <><path d="M3 8l5-5 6 6-5 5z" fill="#c0c0c0" stroke="#000" /><path d="M13 11q2 3 0 3t0-3" fill="#00f" stroke="#00f" /></>,
  picker: <><path d="M3 13l1-3 6-6 2 2-6 6z" fill="#fff" stroke="#000" /><path d="M10 3l3 3" stroke="#000" strokeWidth="2" /></>,
  zoom: <><circle cx="7" cy="7" r="4" fill="#cff" stroke="#000" /><path d="M10 10l4 4" stroke="#000" strokeWidth="2" /></>,
  pencil: <><path d="M3 13l1-3 7-7 2 2-7 7z" fill="#ff0" stroke="#000" /><path d="M3 13l1-3 2 2z" fill="#000" /></>,
  brush: <><path d="M13 2l1 1-5 6-2-2z" fill="#a05000" stroke="#000" /><path d="M7 7l2 2c0 3-3 4-5 4 1-1 1-3 3-6z" fill="#000" /></>,
  airbrush: <><rect x="8" y="2" width="5" height="6" fill="#c0c0c0" stroke="#000" /><path d="M3 9h2M3 12h2M5 14h2M6 11h2" stroke="#000" /></>,
  text: <text x="8" y="13" fontSize="13" fontWeight="bold" textAnchor="middle" fontFamily="serif">A</text>,
  line: <path d="M2 14L14 2" stroke="#000" strokeWidth="1.500" />,
  rect: <rect x="2.500" y="4.500" width="11" height="8" fill="none" stroke="#000" />,
  ellipse: <ellipse cx="8" cy="8" rx="6" ry="4.500" fill="none" stroke="#000" />,
  rrect: <rect x="2.500" y="4.500" width="11" height="8" rx="3" fill="none" stroke="#000" />,
};
const ToolIcon = ({ id }) => <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">{TI[id]}</svg>;
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const IMG_TYPES = [{ description: 'Images', accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'], 'image/bmp': ['.bmp'], 'image/gif': ['.gif'] } }];

function rrPath(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

export default function Paint({ win, props, active }) {
  const os = useOS();
  const cv = useRef();
  const wrap = useRef();
  const [tool, setTool] = useState('pencil');
  const prevTool = useRef('pencil');
  const [fg, setFg] = useState('#000000');
  const [bg, setBg] = useState('#ffffff');
  const [size, setSize] = useState(2);
  const [fillMode, setFillMode] = useState(0);
  const [fontSize, setFontSize] = useState(18);
  const [zoom, setZoom] = useState(1);
  const [dim, setDim] = useState({ w: 640, h: 480 });
  const [fileId, setFileId] = useState(props.fileId || null);
  const [localFile, setLocalFile] = useState(null); // { name, handle }
  const [dirty, setDirty] = useState(false);
  const [pos, setPos] = useState(null);
  const undo = useRef([]);
  const redo = useRef([]);
  const S = useRef({});
  const live = useRef({});
  live.current = { tool, fg, bg, size, fillMode, fontSize, zoom, fileId, localFile, dirty };
  const ctx = () => cv.current.getContext('2d', { willReadFrequently: true });

  const snap = () => { const c = cv.current; return { w: c.width, h: c.height, img: ctx().getImageData(0, 0, c.width, c.height) }; };
  const restore = (s) => { const c = cv.current; c.width = s.w; c.height = s.h; ctx().putImageData(s.img, 0, 0); setDim({ w: s.w, h: s.h }); };
  const pushUndo = () => { undo.current.push(snap()); if (undo.current.length > 30) undo.current.shift(); redo.current = []; setDirty(true); };
  const doUndo = () => { if (!undo.current.length) return; redo.current.push(snap()); restore(undo.current.pop()); };
  const doRedo = () => { if (!redo.current.length) return; undo.current.push(snap()); restore(redo.current.pop()); };
  const resizeCanvas = (w, h) => {
    const old = snap(); const c = cv.current;
    c.width = w; c.height = h; const g = ctx(); g.fillStyle = live.current.bg; g.fillRect(0, 0, w, h);
    g.putImageData(old.img, 0, 0); setDim({ w, h });
  };
  const loadBlob = async (blob) => {
    const bmp = await createImageBitmap(blob);
    const c = cv.current; c.width = bmp.width; c.height = bmp.height; ctx().drawImage(bmp, 0, 0);
    setDim({ w: bmp.width, h: bmp.height }); undo.current = []; redo.current = []; setDirty(false);
  };
  useEffect(() => {
    const c = cv.current; c.width = 640; c.height = 480; const g = ctx(); g.fillStyle = '#fff'; g.fillRect(0, 0, 640, 480);
    if (props.fileId) { const n = fs.get(props.fileId); if (n) loadBlob(fs.toBlob(n)).catch(() => os.msg({ icon: 'error', title: 'Paint', text: 'Paint cannot read this file. It may not be a valid image.' })); }
  }, []); // eslint-disable-line
  useEffect(() => {
    const label = fileId ? fs.get(fileId)?.name : localFile ? localFile.name : 'untitled';
    os.setTitle(win.id, `${label || 'untitled'}${dirty ? '*' : ''} - Paint`);
  }, [fileId, localFile, dirty, win.id, os]);

  const toBlob = (type = 'image/png') => new Promise((res) => cv.current.toBlob(res, type, 0.92));

  const saveToC = async (as = false) => {
    let id = live.current.fileId;
    try {
      if (!id || as || !fs.get(id)) {
        const suggested = id && fs.get(id) ? fs.get(id).name : live.current.localFile?.name || 'untitled.png';
        const r = await os.fileDialog({ mode: 'save', exts: ['png', 'jpg', 'jpeg'], name: suggested, title: 'Save As (Drive C:)' });
        if (!r) return false;
        const type = /\.jpe?g$/i.test(r.name) ? 'image/jpeg' : 'image/png';
        const blob = await toBlob(type);
        id = r.existing ? fs.write(r.existing.id, blob, type).id : fs.create({ name: r.name, parent: r.parent, data: blob, mime: type }).id;
      } else {
        const n = fs.get(id);
        const type = /\.jpe?g$/i.test(n.name) ? 'image/jpeg' : 'image/png';
        fs.write(id, await toBlob(type), type);
      }
    } catch (e) { os.msg({ icon: 'error', title: 'Paint', text: e.message }); return false; }
    setFileId(id); setLocalFile(null); setDirty(false); live.current.dirty = false;
    return true;
  };

  const saveToLocalPC = async (forceDialog = false) => {
    const curLocal = live.current.localFile;
    const suggested = curLocal?.name || (live.current.fileId ? fs.get(live.current.fileId)?.name : null) || 'untitled.png';
    const type = /\.jpe?g$/i.test(suggested) ? 'image/jpeg' : 'image/png';
    try {
      const blob = await toBlob(type);
      const res = await saveLocalFile({
        data: blob,
        name: suggested,
        mime: type,
        handle: forceDialog ? null : curLocal?.handle,
        types: IMG_TYPES,
        forceDialog,
      });
      if (!res) return false;
      const nextLocal = { name: res.name, handle: res.handle || curLocal?.handle || null };
      setLocalFile(nextLocal);
      setDirty(false);
      live.current.dirty = false;
      live.current.localFile = nextLocal;
      return true;
    } catch (e) {
      os.msg({ icon: 'error', title: 'Paint', text: 'Could not save to computer: ' + e.message });
      return false;
    }
  };

  const save = async (as = false) => {
    if (live.current.localFile && !live.current.fileId) return saveToLocalPC(as);
    return saveToC(as);
  };

  const confirmDiscard = async () => {
    if (!live.current.dirty) return true;
    const nm = live.current.fileId ? fs.get(live.current.fileId)?.name : live.current.localFile?.name || 'untitled';
    const r = await os.msg({ title: 'Paint', icon: 'question', text: `Save changes to ${nm}?`, buttons: ['Yes', 'No', 'Cancel'] });
    if (r === 'Cancel') return false;
    return r === 'Yes' ? save(false) : true;
  };
  useEffect(() => { os.setGuard(win.id, confirmDiscard); return () => os.setGuard(win.id, null); }, []); // eslint-disable-line

  const newImg = async () => {
    if (!(await confirmDiscard())) return;
    const c = cv.current; c.width = 640; c.height = 480; ctx().fillStyle = '#fff'; ctx().fillRect(0, 0, 640, 480);
    setDim({ w: 640, h: 480 }); setFileId(null); setLocalFile(null); setDirty(false); undo.current = []; redo.current = [];
  };

  const openImg = async () => {
    if (!(await confirmDiscard())) return;
    const n = await os.fileDialog({ mode: 'open', exts: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'], title: 'Open from Drive C:' });
    if (n) {
      try { await loadBlob(fs.toBlob(n)); setFileId(n.id); setLocalFile(null); }
      catch (e) { os.msg({ icon: 'error', title: 'Paint', text: 'Paint cannot read this file.' }); }
    }
  };

  const loadLocalPicked = async (picked) => {
    if (!picked) return;
    try {
      await loadBlob(picked.file);
      setFileId(null);
      setLocalFile({ name: picked.name, handle: picked.handle || null });
    } catch (e) {
      os.msg({ icon: 'error', title: 'Paint', text: `"${picked.name}" could not be loaded as an image.` });
    }
  };

  const openFromPC = async () => {
    if (!(await confirmDiscard())) return;
    const picked = await pickLocalFiles({ accept: 'image/*,.png,.jpg,.jpeg,.gif,.bmp,.webp', types: IMG_TYPES });
    await loadLocalPicked(picked);
  };

  const onDropFile = async (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    if (!(await confirmDiscard())) return;
    await loadLocalPicked({ file: f, name: f.name, handle: null });
  };

  const exportPng = async () => {
    const b = await toBlob('image/png');
    const nm = (fileId ? fs.get(fileId)?.name : localFile?.name || 'untitled').replace(/\.\w+$/, '') + '.png';
    await saveLocalFile({ data: b, name: nm, mime: 'image/png', forceDialog: true });
  };

  const setWallpaper = async () => {
    try {
      const blob = await toBlob();
      const ex = fs.children('win').find((n) => n.name === 'Paint Wallpaper.png');
      const n = ex ? fs.write(ex.id, blob, 'image/png') : fs.create({ name: 'Paint Wallpaper.png', parent: 'win', data: blob, mime: 'image/png' });
      setSettings({ wallpaper: 'fs:' + n.id, wallpaperMode: 'stretch' });
    } catch (e) { os.msg({ icon: 'error', text: e.message }); }
  };
  const transform = (kind) => {
    pushUndo();
    const c = cv.current, t = document.createElement('canvas'); const rot = kind === 'rot';
    t.width = rot ? c.height : c.width; t.height = rot ? c.width : c.height;
    const g = t.getContext('2d');
    if (kind === 'fh') { g.translate(t.width, 0); g.scale(-1, 1); } else if (kind === 'fv') { g.translate(0, t.height); g.scale(1, -1); } else { g.translate(t.width, 0); g.rotate(Math.PI / 2); }
    g.drawImage(c, 0, 0);
    c.width = t.width; c.height = t.height; ctx().drawImage(t, 0, 0); setDim({ w: t.width, h: t.height });
  };
  const invert = () => { pushUndo(); const g = ctx(), c = cv.current, im = g.getImageData(0, 0, c.width, c.height), d = im.data; for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; } g.putImageData(im, 0, 0); };
  const attrs = async () => {
    const v = await os.prompt({ title: 'Attributes', label: 'Image size (width x height in pixels):', value: `${cv.current.width}x${cv.current.height}` });
    if (!v) return;
    const m = v.match(/(\d+)\s*[x×,]\s*(\d+)/i);
    if (!m || +m[1] < 1 || +m[2] < 1 || +m[1] > 4000 || +m[2] > 4000) return os.msg({ icon: 'error', title: 'Paint', text: 'Enter a size like 800x600 (maximum 4000x4000).' });
    pushUndo(); resizeCanvas(+m[1], +m[2]);
  };
  const clearImg = () => { pushUndo(); const g = ctx(); g.fillStyle = live.current.bg; g.fillRect(0, 0, cv.current.width, cv.current.height); };
  const copyImg = async () => { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': await toBlob() })]); } catch (e) { os.msg({ icon: 'info', title: 'Paint', text: 'The browser blocked clipboard access. Use File > Save to Local PC instead.' }); } };
  const pasteImg = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) { const t = it.types.find((x) => x.startsWith('image/')); if (t) { const bmp = await createImageBitmap(await it.getType(t)); pushUndo(); if (bmp.width > cv.current.width || bmp.height > cv.current.height) resizeCanvas(Math.max(bmp.width, cv.current.width), Math.max(bmp.height, cv.current.height)); ctx().drawImage(bmp, 0, 0); return; } }
      os.msg({ icon: 'info', title: 'Paint', text: 'There is no image on the clipboard.' });
    } catch (e) { os.msg({ icon: 'info', title: 'Paint', text: 'The browser blocked clipboard access.' }); }
  };

  const getPos = (e) => { const r = cv.current.getBoundingClientRect(); return { x: Math.floor(((e.clientX - r.left) * cv.current.width) / r.width), y: Math.floor(((e.clientY - r.top) * cv.current.height) / r.height) }; };
  const stamp = (x, y, col) => {
    const g = ctx(), s = live.current.size, t = live.current.tool;
    g.fillStyle = col;
    if (t === 'pencil') g.fillRect(x, y, 1, 1);
    else if (t === 'eraser') { const e = s * 3 + 2; g.fillRect(x - (e >> 1), y - (e >> 1), e, e); }
    else if (t === 'brush') { g.beginPath(); g.arc(x + 0.5, y + 0.5, s * 1.5 + 0.5, 0, Math.PI * 2); g.fill(); }
  };
  const line = (a, b, col) => {
    const dx = b.x - a.x, dy = b.y - a.y, n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 0; i <= n; i++) stamp(Math.round(a.x + (dx * i) / n), Math.round(a.y + (dy * i) / n), col);
  };
  const spray = (p, col) => {
    const g = ctx(), r = live.current.size * 4 + 4; g.fillStyle = col;
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.283, d = Math.random() * r; g.fillRect(Math.round(p.x + Math.cos(a) * d), Math.round(p.y + Math.sin(a) * d), 1, 1); }
  };
  const shape = (t, a, b, col, other, shift) => {
    const g = ctx(), { size: lw, fillMode: fm } = live.current;
    let { x: x1, y: y1 } = b;
    if (shift) { if (t === 'line') { const dx = x1 - a.x, dy = y1 - a.y; if (Math.abs(dx) > 2 * Math.abs(dy)) y1 = a.y; else if (Math.abs(dy) > 2 * Math.abs(dx)) x1 = a.x; else { const m = Math.max(Math.abs(dx), Math.abs(dy)); x1 = a.x + Math.sign(dx) * m; y1 = a.y + Math.sign(dy) * m; } } else { const m = Math.max(Math.abs(x1 - a.x), Math.abs(y1 - a.y)); x1 = a.x + Math.sign(x1 - a.x || 1) * m; y1 = a.y + Math.sign(y1 - a.y || 1) * m; } }
    g.lineWidth = lw; g.strokeStyle = col; g.lineJoin = 'miter'; g.lineCap = 'round';
    const x = Math.min(a.x, x1) + 0.5, y = Math.min(a.y, y1) + 0.5, w = Math.abs(x1 - a.x), h = Math.abs(y1 - a.y);
    if (t === 'line') { g.beginPath(); g.moveTo(a.x + 0.5, a.y + 0.5); g.lineTo(x1 + 0.5, y1 + 0.5); g.stroke(); return; }
    g.beginPath();
    if (t === 'rect') g.rect(x, y, w, h); else if (t === 'rrect') rrPath(g, x, y, w, h, Math.min(16, w / 3, h / 3)); else g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (fm === 1) { g.fillStyle = other; g.fill(); g.stroke(); } else if (fm === 2) { g.fillStyle = col; g.fill(); } else g.stroke();
  };
  const flood = (x, y, hex) => {
    const g = ctx(), { width: w, height: h } = cv.current;
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const img = g.getImageData(0, 0, w, h), d = img.data, i0 = (y * w + x) * 4, t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]], f = hexToRgb(hex);
    if (t[0] === f[0] && t[1] === f[1] && t[2] === f[2] && t[3] === 255) return;
    const match = (i) => d[i] === t[0] && d[i + 1] === t[1] && d[i + 2] === t[2] && d[i + 3] === t[3];
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy0] = stack.pop(); let cy = cy0;
      while (cy >= 0 && match((cy * w + cx) * 4)) cy--;
      cy++; let l = false, r = false;
      while (cy < h && match((cy * w + cx) * 4)) {
        const i = (cy * w + cx) * 4; d[i] = f[0]; d[i + 1] = f[1]; d[i + 2] = f[2]; d[i + 3] = 255;
        if (cx > 0) { if (match(i - 4)) { if (!l) { stack.push([cx - 1, cy]); l = true; } } else l = false; }
        if (cx < w - 1) { if (match(i + 4)) { if (!r) { stack.push([cx + 1, cy]); r = true; } } else r = false; }
        cy++;
      }
    }
    g.putImageData(img, 0, 0);
  };

  const down = async (e) => {
    if (e.button > 2) return;
    e.preventDefault();
    const { tool: t, fg: f, bg: b } = live.current;
    const p = getPos(e), col = e.button === 2 ? b : f, other = e.button === 2 ? f : b;
    const s = S.current;
    if (t === 'fill') { pushUndo(); flood(p.x, p.y, col); return; }
    if (t === 'picker') {
      const px = ctx().getImageData(Math.max(0, p.x), Math.max(0, p.y), 1, 1).data; const hex = rgbToHex(px[0], px[1], px[2]);
      e.button === 2 ? setBg(hex) : setFg(hex); setTool(prevTool.current); return;
    }
    if (t === 'zoom') { setZoom((z) => (z === 1 ? 2 : z === 2 ? 4 : 1)); return; }
    if (t === 'text') {
      const txt = await os.prompt({ title: 'Text', label: 'Enter the text to draw at the clicked position:' });
      if (txt) { pushUndo(); const g = ctx(); g.font = `${live.current.fontSize}px Arial, sans-serif`; g.fillStyle = col; g.textBaseline = 'top'; txt.split('\n').forEach((ln, i) => g.fillText(ln, p.x, p.y + i * live.current.fontSize * 1.2)); }
      return;
    }
    cv.current.setPointerCapture(e.pointerId);
    pushUndo();
    Object.assign(s, { drawing: true, start: p, last: p, col, other });
    if (['line', 'rect', 'ellipse', 'rrect'].includes(t)) s.base = ctx().getImageData(0, 0, cv.current.width, cv.current.height);
    else if (t === 'airbrush') { spray(p, col); s.timer = setInterval(() => spray(s.last, col), 30); }
    else stamp(p.x, p.y, t === 'eraser' ? b : col);
  };
  const move = (e) => {
    const p = getPos(e); setPos(p);
    const s = S.current;
    if (!s.drawing) return;
    const t = live.current.tool;
    if (s.base) { ctx().putImageData(s.base, 0, 0); shape(t, s.start, p, s.col, s.other, e.shiftKey); }
    else if (t === 'airbrush') s.last = p;
    else { line(s.last, p, t === 'eraser' ? live.current.bg : s.col); s.last = p; }
  };
  const up = () => { const s = S.current; if (!s.drawing) return; clearInterval(s.timer); s.drawing = false; s.base = null; };

  useEffect(() => {
    if (!active) return;
    const h = (e) => {
      if (e.target.closest?.('input,textarea')) return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey && k === 'z') { e.preventDefault(); doUndo(); } else if (e.ctrlKey && k === 'y') { e.preventDefault(); doRedo(); }
      else if (e.ctrlKey && !e.shiftKey && k === 's') { e.preventDefault(); save(false); }
      else if (e.ctrlKey && e.shiftKey && k === 's') { e.preventDefault(); saveToLocalPC(true); }
      else if (e.ctrlKey && e.shiftKey && k === 'o') { e.preventDefault(); openFromPC(); }
      else if (e.ctrlKey && !e.shiftKey && k === 'o') { e.preventDefault(); openImg(); }
      else if (e.ctrlKey && k === 'n') { e.preventDefault(); newImg(); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });

  const menus = [
    { label: '&File', items: [
      { label: '&New', shortcut: 'Ctrl+N', onClick: newImg },
      { label: '&Open (Drive C:)...', shortcut: 'Ctrl+O', onClick: openImg },
      { label: 'Open from &Local PC...', shortcut: 'Ctrl+Shift+O', onClick: openFromPC },
      { sep: true },
      { label: '&Save', shortcut: 'Ctrl+S', onClick: () => save(false) },
      { label: 'Save &As (Drive C:)...', onClick: () => saveToC(true) },
      { label: 'Save to Local &PC...', shortcut: 'Ctrl+Shift+S', onClick: () => saveToLocalPC(false) },
      { label: 'E&xport as PNG (download)', onClick: exportPng },
      { sep: true },
      { label: 'Set as &Wallpaper', onClick: setWallpaper },
      { sep: true },
      { label: 'E&xit', onClick: () => os.close(win.id) },
    ] },
    { label: '&Edit', items: [{ label: '&Undo', shortcut: 'Ctrl+Z', disabled: !undo.current.length, onClick: doUndo }, { label: '&Repeat', shortcut: 'Ctrl+Y', onClick: doRedo }, { sep: true }, { label: '&Copy to clipboard', onClick: copyImg }, { label: '&Paste from clipboard', onClick: pasteImg }, { sep: true }, { label: 'C&lear Image', onClick: clearImg }] },
    { label: '&View', items: [{ label: '&Normal size (100%)', radio: true, checked: zoom === 1, onClick: () => setZoom(1) }, { label: '&Large size (200%)', radio: true, checked: zoom === 2, onClick: () => setZoom(2) }, { label: 'Ex&tra large (400%)', radio: true, checked: zoom === 4, onClick: () => setZoom(4) }] },
    { label: '&Image', items: [{ label: 'Flip &Horizontal', onClick: () => transform('fh') }, { label: 'Flip &Vertical', onClick: () => transform('fv') }, { label: '&Rotate 90°', onClick: () => transform('rot') }, { label: '&Invert Colors', onClick: invert }, { sep: true }, { label: '&Attributes...', onClick: attrs }] },
    { label: '&Options', items: [{ label: 'Swap &colors', onClick: () => { setFg(bg); setBg(fg); } }] },
    { label: '&Help', items: [{ label: '&Help Topics', onClick: () => os.open('help') }, { label: '&About Paint', onClick: () => os.msg({ icon: 'info', title: 'About Paint', text: 'Paint\nWindows 95 Smart Edition\nOpen & save images locally on your PC or virtual drive C:.' }) }] },
  ];
  const sizeOpts = tool === 'eraser' || tool === 'brush' || tool === 'airbrush' ? [1, 2, 4, 6] : tool === 'line' || tool === 'rect' || tool === 'ellipse' || tool === 'rrect' ? [1, 2, 3, 5] : [];

  return (
    <div className="app paint" onDragOver={(e) => e.preventDefault()} onDrop={onDropFile}>
      <MenuBar menus={menus} />
      <div className="paint-main">
        <div className="paint-tools">
          <div className="tool-grid">
            {TOOLS.map(([id, label]) => <button key={id} title={label} className={'btn tool-btn ' + (tool === id ? 'pressed' : '')} onClick={() => { if (tool !== 'picker') prevTool.current = tool; setTool(id); }}><ToolIcon id={id} /></button>)}
          </div>
          <div className="tool-opts sunken">
            {tool === 'zoom' && [1, 2, 4].map((z) => <button key={z} className={'opt ' + (zoom === z ? 'on' : '')} onClick={() => setZoom(z)}>{z}x</button>)}
            {sizeOpts.map((s) => <button key={s} className={'opt ' + (size === s ? 'on' : '')} onClick={() => setSize(s)}><i style={{ width: 24, height: Math.min(s * 2, 14), background: '#000', display: 'block', borderRadius: tool === 'brush' ? 8 : 0 }} /></button>)}
            {['rect', 'ellipse', 'rrect'].includes(tool) && ['▭', '▣', '■'].map((g, i) => <button key={i} className={'opt ' + (fillMode === i ? 'on' : '')} title={['Outline', 'Outline + fill', 'Filled'][i]} onClick={() => setFillMode(i)}>{g}</button>)}
            {tool === 'text' && [12, 18, 28, 40].map((s) => <button key={s} className={'opt ' + (fontSize === s ? 'on' : '')} onClick={() => setFontSize(s)}>{s}</button>)}
          </div>
        </div>
        <div className="field paint-scroll" ref={wrap}>
          <canvas ref={cv} className="paint-canvas" style={{ width: dim.w * zoom, height: dim.h * zoom, imageRendering: 'pixelated', cursor: tool === 'zoom' ? 'zoom-in' : tool === 'picker' ? 'copy' : 'crosshair' }}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => setPos(null)} onContextMenu={(e) => e.preventDefault()} />
        </div>
      </div>
      <div className="paint-pal">
        <div className="colors-now sunken"><div className="cn-bg" style={{ background: bg }} /><div className="cn-fg" style={{ background: fg }} /></div>
        <div className="pal-grid">
          {PALETTE.map((c) => <button key={c} className="pal-c sunken" style={{ background: c }} title={c} onClick={() => setFg(c)} onContextMenu={(e) => { e.preventDefault(); setBg(c); }} />)}
        </div>
        <label className="btn tool" title="Edit foreground colour" style={{ position: 'relative', marginLeft: 6 }}>Edit…<input type="color" value={fg} onChange={(e) => setFg(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }} /></label>
      </div>
      <StatusBar>
        <span>{localFile ? `PC: ${localFile.name} — ` : fileId ? `C:\\ — ` : ''}{TOOLS.find((t) => t[0] === tool)[1]}</span>
        <span style={{ minWidth: 70 }}>{pos ? `${pos.x}, ${pos.y}` : ''}</span>
        <span style={{ minWidth: 80 }}>{dim.w} x {dim.h}</span>
      </StatusBar>
    </div>
  );
}

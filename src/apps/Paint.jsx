import { useState, useRef, useEffect, useCallback } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar, Dialog } from '../os/widgets.jsx';
import * as fs from '../os/fs.js';
import { setSettings } from '../os/settings.js';
import { pickLocalFiles, saveLocalFile } from '../os/localFiles.js';
import * as SmartTransfer from '../os/smartTransfer.js';
import { receiveConflictDialog, openTransferHistoryDialog } from '../os/smartTransferUI.jsx';

const PALETTE = [
  '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
  '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040',
];

// Authentic Windows 95 2x8 tool order matching classic Paint toolbox
const TOOLS = [
  ['freeselect', 'Free-Form Select'],
  ['select', 'Select'],
  ['eraser', 'Eraser/Color Eraser'],
  ['fill', 'Fill With Color'],
  ['picker', 'Pick Color'],
  ['zoom', 'Magnifier'],
  ['pencil', 'Pencil'],
  ['brush', 'Brush'],
  ['airbrush', 'Airbrush'],
  ['text', 'Text'],
  ['line', 'Line'],
  ['curve', 'Curve'],
  ['rect', 'Rectangle'],
  ['polygon', 'Polygon'],
  ['ellipse', 'Ellipse'],
  ['rrect', 'Rounded Rectangle'],
];

const TI = {
  freeselect: <path d="M8 1.5L9.8 5.5L14.2 6L10.8 9L11.8 13.5L8 11.2L4.2 13.5L5.2 9L1.8 6L6.2 5.5Z" fill="none" stroke="#000" strokeWidth="1.1" strokeDasharray="2 1.5" />,
  select: <rect x="2.5" y="3.5" width="11" height="9" fill="none" stroke="#000" strokeWidth="1.1" strokeDasharray="2 1.5" />,
  eraser: <><path d="M2.5 10.5l5.5-5.5h5l-5.5 5.5z" fill="#ffffc0" stroke="#000" /><path d="M2.5 10.5h5v2.5h-5z" fill="#e0c060" stroke="#000" /><path d="M7.5 10.5l5.5-5.5v2.5l-5.5 5.5z" fill="#c0a040" stroke="#000" /></>,
  fill: <><path d="M3 8l5-5 5.5 5.5-5 5z" fill="#c0c0c0" stroke="#000" /><path d="M5.5 5.5c0-2 3-2 3 0" fill="none" stroke="#000" /><path d="M13 10.5q2 3.5 0 3.5t0-3.5" fill="#00a0e0" stroke="#000080" /></>,
  picker: <><path d="M3 13l1-3 6-6 2 2-6 6z" fill="#fff" stroke="#000" /><path d="M10 3l3 3" stroke="#000" strokeWidth="2.2" /><path d="M3 13l-1 1.5" stroke="#00a0e0" strokeWidth="1.5" /></>,
  zoom: <><circle cx="6.8" cy="6.8" r="4" fill="#c8f0ff" stroke="#000" /><path d="M10 10l4 4" stroke="#000080" strokeWidth="2.2" /></>,
  pencil: <><path d="M3 13l1-3 7-7 2 2-7 7z" fill="#ffd800" stroke="#000" /><path d="M3 13l1-3 2 2z" fill="#000" /></>,
  brush: <><path d="M8 2v5" stroke="#805000" strokeWidth="2.4" /><rect x="5" y="7" width="6" height="2" fill="#c0c0c0" stroke="#000" /><path d="M5 9h6l1 4H4z" fill="#000" /></>,
  airbrush: <><path d="M8 6l4-2 2 5-4 2z" fill="#0040c0" stroke="#000" /><rect x="6" y="4.5" width="2.5" height="2" fill="#c0c0c0" stroke="#000" /><path d="M2 8h1M4 7h1M2 11h1M4 10h1M3 13h1M5 12h1" stroke="#0060d0" strokeWidth="1.2" /></>,
  text: <text x="8" y="13" fontSize="13" fontWeight="bold" textAnchor="middle" fontFamily="Georgia, serif">A</text>,
  line: <path d="M2.5 13.5L13.5 2.5" stroke="#000" strokeWidth="1.6" />,
  curve: <path d="M3 3C11 3 5 13 13 13" fill="none" stroke="#000" strokeWidth="1.5" />,
  rect: <rect x="2.5" y="4" width="11" height="8" fill="none" stroke="#000" strokeWidth="1.2" />,
  polygon: <path d="M3 12L5.5 3.5L12.5 3.5L9 8L13.5 8L13.5 12Z" fill="none" stroke="#000" strokeWidth="1.2" strokeLinejoin="miter" />,
  ellipse: <ellipse cx="8" cy="8" rx="5.8" ry="4.3" fill="none" stroke="#000" strokeWidth="1.2" />,
  rrect: <rect x="2.5" y="4" width="11" height="8" rx="2.6" fill="none" stroke="#000" strokeWidth="1.2" />,
};

const ToolIcon = ({ id }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
    {TI[id]}
  </svg>
);

const ZOOM_VALS = [0.5, 1, 2, 3, 4];

const PAINT_FORMATS = [
  { ext: 'png', label: 'PNG (*.png)' },
  { ext: 'bmp', label: '24-bit Bitmap (*.bmp)' },
  { ext: 'gif', label: 'GIF (*.gif)' },
  { ext: 'jpg', label: 'JPEG (*.jpg)' },
  { ext: 'webp', label: 'WebP (*.webp)' },
];

const IMG_TYPES = [
  {
    description: 'Images',
    accept: {
      'image/png': ['.png'],
      'image/bmp': ['.bmp'],
      'image/gif': ['.gif'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
    },
  },
];

const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

function rrPath(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function buildRenderableSelCanvas(sel, transparentSel, bgHex) {
  if (!sel?.canvas) return null;
  if (!transparentSel) return sel.canvas;
  const w = sel.canvas.width;
  const h = sel.canvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const srcCtx = sel.canvas.getContext('2d', { willReadFrequently: true });
  const dstCtx = out.getContext('2d');
  const img = srcCtx.getImageData(0, 0, w, h);
  const d = img.data;
  const [br, bgG, bb] = hexToRgb(bgHex);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    if (Math.abs(d[i] - br) <= 4 && Math.abs(d[i + 1] - bgG) <= 4 && Math.abs(d[i + 2] - bb) <= 4) {
      d[i + 3] = 0;
    }
  }
  dstCtx.putImageData(img, 0, 0);
  return out;
}

function StretchSkewDialog({ onDone, hasSelection }) {
  const [sx, setSx] = useState('100');
  const [sy, setSy] = useState('100');
  const [kx, setKx] = useState('0');
  const [ky, setKy] = useState('0');

  const submit = (e) => {
    e.preventDefault();
    const sxPct = Math.max(1, Math.min(500, Number(sx) || 100));
    const syPct = Math.max(1, Math.min(500, Number(sy) || 100));
    const skewXDeg = Math.max(-89, Math.min(89, Number(kx) || 0));
    const skewYDeg = Math.max(-89, Math.min(89, Number(ky) || 0));
    onDone({ sxPct, syPct, skewXDeg, skewYDeg });
  };

  return (
    <Dialog title={hasSelection ? 'Stretch and Skew (Selection)' : 'Stretch and Skew'} onClose={() => onDone(null)} width={390}>
      <form className="ss-wrap" onSubmit={submit}>
        <div className="ss-col">
          <div className="groupbox">
            <span className="gb-title">Stretch</span>
            <div className="ss-row">
              <svg width="26" height="22" viewBox="0 0 26 22" shapeRendering="crispEdges">
                <path d="M5 4h16M5 4l3-2M5 4l3 2M21 4l-3-2M21 4l-3 2" stroke="#c00000" fill="none" strokeWidth="1.5" />
                <rect x="3" y="8" width="20" height="11" fill="#fff" stroke="#000" />
              </svg>
              <label>Horizontal:</label>
              <input className="field" type="number" min="1" max="500" value={sx} onChange={(e) => setSx(e.target.value)} autoFocus />
              <span>%</span>
            </div>
            <div className="ss-row">
              <svg width="26" height="26" viewBox="0 0 26 26" shapeRendering="crispEdges">
                <rect x="2" y="2" width="12" height="22" fill="#fff" stroke="#000" />
                <path d="M19 4v18M19 4l-2 3M19 4l2 3M19 22l-2-3M19 22l2-3" stroke="#c00000" fill="none" strokeWidth="1.5" />
              </svg>
              <label>Vertical:</label>
              <input className="field" type="number" min="1" max="500" value={sy} onChange={(e) => setSy(e.target.value)} />
              <span>%</span>
            </div>
          </div>

          <div className="groupbox">
            <span className="gb-title">Skew</span>
            <div className="ss-row">
              <svg width="26" height="22" viewBox="0 0 26 22" shapeRendering="crispEdges">
                <path d="M5 4h14M5 4l3-2M5 4l3 2M19 4l-3-2M19 4l-3 2" stroke="#c00000" fill="none" strokeWidth="1.5" />
                <path d="M8 9h15l-6 10H2z" fill="#fff" stroke="#000" />
              </svg>
              <label>Horizontal:</label>
              <input className="field" type="number" min="-89" max="89" value={kx} onChange={(e) => setKx(e.target.value)} />
              <span>Degrees</span>
            </div>
            <div className="ss-row">
              <svg width="26" height="26" viewBox="0 0 26 26" shapeRendering="crispEdges">
                <path d="M4 8l9-5v14l-9 5z" fill="#fff" stroke="#000" />
                <path d="M19 5v16M19 5l-2 3M19 5l2 3M19 21l-2-3M19 21l2-3" stroke="#c00000" fill="none" strokeWidth="1.5" />
              </svg>
              <label>Vertical:</label>
              <input className="field" type="number" min="-89" max="89" value={ky} onChange={(e) => setKy(e.target.value)} />
              <span>Degrees</span>
            </div>
          </div>
        </div>
        <div className="ss-btns">
          <button type="submit" className="btn default">OK</button>
          <button type="button" className="btn" onClick={() => onDone(null)}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}

export default function Paint({ win, props, active }) {
  const os = useOS();
  const cv = useRef();
  const selView = useRef();
  const wrap = useRef();

  const [tool, setTool] = useState('pencil');
  const prevTool = useRef('pencil');
  const [fg, setFg] = useState('#000000');
  const [bg, setBg] = useState('#ffffff');
  const [size, setSize] = useState(2);
  const [fillMode, setFillMode] = useState(0);
  const [fontSize, setFontSize] = useState(18);
  const [zoom, setZoom] = useState(1);
  const [transparentSel, setTransparentSel] = useState(false);
  const [dim, setDim] = useState({ w: 640, h: 480 });
  const [fileId, setFileId] = useState(props.fileId || null);
  const [localFile, setLocalFile] = useState(null);
  const [lastQuality, setLastQuality] = useState(90);
  const [dirty, setDirty] = useState(false);
  const [pos, setPos] = useState(null);
  const [sel, setSel] = useState(null);
  const [marquee, setMarquee] = useState(null);
  const [lassoPts, setLassoPts] = useState(null);
  const [curveHint, setCurveHint] = useState('');

  const undo = useRef([]);
  const redo = useRef([]);
  const internalClip = useRef(null);
  const preferInternalClip = useRef(false);
  const S = useRef({ curveStep: 0, polyPts: [] });
  const live = useRef({});
  live.current = { tool, fg, bg, size, fillMode, fontSize, zoom, fileId, localFile, dirty, sel, transparentSel, lastQuality };

  const ctx = () => cv.current.getContext('2d', { willReadFrequently: true });
  const snap = () => {
    const c = cv.current;
    return { w: c.width, h: c.height, img: ctx().getImageData(0, 0, c.width, c.height) };
  };
  const restore = (s) => {
    const c = cv.current;
    c.width = s.w;
    c.height = s.h;
    ctx().putImageData(s.img, 0, 0);
    setDim({ w: s.w, h: s.h });
  };
  const pushUndo = useCallback(() => {
    undo.current.push(snap());
    if (undo.current.length > 30) undo.current.shift();
    redo.current = [];
    setDirty(true);
  }, []);

  const eraseSelCutout = useCallback((targetSel, bgColor) => {
    if (!targetSel) return;
    const g = ctx();
    if (targetSel.mask) {
      const { x, y, w, h, mask } = targetSel;
      const cw = cv.current.width;
      const ch = cv.current.height;
      const rx = Math.max(0, x), ry = Math.max(0, y);
      const rw = Math.min(cw - rx, x + w - rx), rh = Math.min(ch - ry, y + h - ry);
      if (rw <= 0 || rh <= 0) return;
      const img = g.getImageData(rx, ry, rw, rh);
      const d = img.data;
      const [br, bgG, bb] = hexToRgb(bgColor);
      for (let row = 0; row < rh; row++) {
        const my = row + (ry - y);
        for (let col = 0; col < rw; col++) {
          const mx = col + (rx - x);
          if (mask[my * w + mx]) {
            const p = (row * rw + col) * 4;
            d[p] = br; d[p + 1] = bgG; d[p + 2] = bb; d[p + 3] = 255;
          }
        }
      }
      g.putImageData(img, rx, ry);
    } else {
      g.fillStyle = bgColor;
      g.fillRect(targetSel.x, targetSel.y, targetSel.w, targetSel.h);
    }
  }, []);

  const liftSel = useCallback((curSel) => {
    if (!curSel || curSel.lifted) return curSel;
    pushUndo();
    eraseSelCutout(curSel, live.current.bg);
    const updated = { ...curSel, lifted: true };
    setSel(updated);
    live.current.sel = updated;
    return updated;
  }, [eraseSelCutout, pushUndo]);

  const commitSel = useCallback(() => {
    const curSel = live.current.sel;
    if (!curSel) return;
    if (curSel.lifted) {
      if (curSel.fromPaste) pushUndo();
      const drawable = buildRenderableSelCanvas(curSel, live.current.transparentSel, live.current.bg);
      if (drawable) ctx().drawImage(drawable, curSel.x, curSel.y);
      setDirty(true);
    }
    setSel(null);
    live.current.sel = null;
  }, [pushUndo]);

  const cancelPendingMultiStep = useCallback(() => {
    const s = S.current;
    if (s.curveStep > 0) {
      s.curveStep = 0;
      s.curveBase = null;
      setCurveHint('');
    }
    if (s.polyPts?.length) {
      s.polyPts = [];
      s.polyBase = null;
      setCurveHint('');
    }
  }, []);

  // Render floating selection canvas preview
  useEffect(() => {
    if (!sel || !selView.current) return;
    const sc = selView.current;
    sc.width = sel.w;
    sc.height = sel.h;
    const drawable = buildRenderableSelCanvas(sel, transparentSel, bg);
    const g = sc.getContext('2d');
    g.clearRect(0, 0, sel.w, sel.h);
    if (drawable) g.drawImage(drawable, 0, 0);
  }, [sel, transparentSel, bg]);

  const doUndo = () => {
    cancelPendingMultiStep();
    if (live.current.sel?.fromPaste) {
      setSel(null);
      live.current.sel = null;
      return;
    }
    setSel(null);
    live.current.sel = null;
    if (!undo.current.length) return;
    redo.current.push(snap());
    restore(undo.current.pop());
  };
  const doRedo = () => {
    cancelPendingMultiStep();
    setSel(null);
    live.current.sel = null;
    if (!redo.current.length) return;
    undo.current.push(snap());
    restore(redo.current.pop());
  };

  const resizeCanvas = (w, h) => {
    const old = snap();
    const c = cv.current;
    c.width = w;
    c.height = h;
    const g = ctx();
    g.fillStyle = live.current.bg;
    g.fillRect(0, 0, w, h);
    g.putImageData(old.img, 0, 0);
    setDim({ w, h });
  };

  const decodeBlobToDrawable = async (blob) => {
    try {
      return await createImageBitmap(blob);
    } catch {
      const url = SmartTransfer.createTempUrl(blob);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;
      } finally {
        SmartTransfer.revokeTempUrl(url);
      }
    }
  };

  const loadBlob = async (blob) => {
    const bmp = await decodeBlobToDrawable(blob);
    const w = bmp.naturalWidth || bmp.width || 1;
    const h = bmp.naturalHeight || bmp.height || 1;
    const c = cv.current;
    c.width = w;
    c.height = h;
    ctx().drawImage(bmp, 0, 0, w, h);
    setDim({ w, h });
    setSel(null);
    live.current.sel = null;
    undo.current = [];
    redo.current = [];
    setDirty(false);
  };

  useEffect(() => {
    const c = cv.current;
    c.width = 640;
    c.height = 480;
    const g = ctx();
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 640, 480);
    if (props.transferId) {
      SmartTransfer.getTransfer(props.transferId).then((t) => {
        if (t) receiveTransferRef.current?.(t, props.transferAction || 'open');
      });
    } else if (props.fileId) {
      const n = fs.get(props.fileId);
      if (n) loadBlob(fs.toBlob(n)).catch(() => os.msg({ icon: 'error', title: 'Paint', text: 'Paint cannot read this file. It may not be a valid image.' }));
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (active) SmartTransfer.touchApp('paint', win.id);
  }, [active, win.id]);

  useEffect(() => {
    const label = fileId ? fs.get(fileId)?.name : localFile ? localFile.name : 'untitled';
    os.setTitle(win.id, `${label || 'untitled'}${dirty ? '*' : ''} - Paint`);
  }, [fileId, localFile, dirty, win.id, os]);

  const encodeCurrent = async (ext = 'png', qualityPct = 90) => {
    const { canvasToFormattedBlob } = await import('../utils/imageCodecs.js');
    return canvasToFormattedBlob(cv.current, ext, qualityPct);
  };

  const saveWithDialog = async () => {
    commitSel();
    const id = live.current.fileId;
    const suggested = (id && fs.get(id) ? fs.get(id).name : live.current.localFile?.name) || 'untitled.png';
    const r = await os.fileDialog({
      mode: 'save',
      title: 'Save As',
      name: suggested,
      allowLocal: true,
      formats: PAINT_FORMATS,
      qualities: [70, 80, 90, 100],
      defaultQuality: live.current.lastQuality,
    });
    if (!r) return false;
    setLastQuality(r.quality);
    try {
      const { blob, mime } = await encodeCurrent(r.ext || fs.ext(r.name) || 'png', r.quality);
      if (r.local) {
        const res = await saveLocalFile({ data: blob, name: r.name, mime, types: IMG_TYPES, forceDialog: true });
        if (!res) return false;
        const nextLocal = { name: res.name, handle: res.handle || null };
        setLocalFile(nextLocal);
        setFileId(null);
        setDirty(false);
        live.current.dirty = false;
        live.current.localFile = nextLocal;
        return true;
      }
      const nextId = r.existing ? fs.write(r.existing.id, blob, mime).id : fs.create({ name: r.name, parent: r.parent, data: blob, mime }).id;
      setFileId(nextId);
      setLocalFile(null);
      setDirty(false);
      live.current.dirty = false;
      return true;
    } catch (e) {
      os.msg({ icon: 'error', title: 'Paint', text: 'Could not save image: ' + e.message });
      return false;
    }
  };

  const saveToLocalPC = async (forceDialog = false) => {
    commitSel();
    if (forceDialog) return saveWithDialog();
    const curLocal = live.current.localFile;
    const suggested = curLocal?.name || (live.current.fileId ? fs.get(live.current.fileId)?.name : null) || 'untitled.png';
    const ext = fs.ext(suggested) || 'png';
    try {
      const { blob, mime } = await encodeCurrent(ext, live.current.lastQuality);
      const res = await saveLocalFile({
        data: blob,
        name: suggested,
        mime,
        handle: curLocal?.handle || null,
        types: IMG_TYPES,
        forceDialog: false,
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
    commitSel();
    if (as) return saveWithDialog();
    const id = live.current.fileId;
    if (id && fs.get(id)) {
      const n = fs.get(id);
      const ext = fs.ext(n.name) || 'png';
      try {
        const { blob, mime } = await encodeCurrent(ext, live.current.lastQuality);
        fs.write(id, blob, mime);
        setDirty(false);
        live.current.dirty = false;
        return true;
      } catch (e) {
        os.msg({ icon: 'error', title: 'Paint', text: e.message });
        return false;
      }
    }
    if (live.current.localFile) return saveToLocalPC(false);
    return saveWithDialog();
  };

  const confirmDiscard = async () => {
    commitSel();
    if (!live.current.dirty) return true;
    const nm = live.current.fileId ? fs.get(live.current.fileId)?.name : live.current.localFile?.name || 'untitled';
    const r = await os.msg({ title: 'Paint', icon: 'question', text: `Save changes to ${nm}?`, buttons: ['Yes', 'No', 'Cancel'] });
    if (r === 'Cancel') return false;
    return r === 'Yes' ? save(false) : true;
  };
  useEffect(() => { os.setGuard(win.id, confirmDiscard); return () => os.setGuard(win.id, null); }, []); // eslint-disable-line

  const newImg = async () => {
    if (!(await confirmDiscard())) return;
    cancelPendingMultiStep();
    const c = cv.current;
    c.width = 640;
    c.height = 480;
    ctx().fillStyle = '#fff';
    ctx().fillRect(0, 0, 640, 480);
    setDim({ w: 640, h: 480 });
    setSel(null);
    setFileId(null);
    setLocalFile(null);
    setDirty(false);
    undo.current = [];
    redo.current = [];
  };

  const openImg = async () => {
    if (!(await confirmDiscard())) return;
    const n = await os.fileDialog({ mode: 'open', exts: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'], title: 'Open from Drive C:' });
    if (n) {
      try {
        await loadBlob(fs.toBlob(n));
        setFileId(n.id);
        setLocalFile(null);
      } catch {
        os.msg({ icon: 'error', title: 'Paint', text: 'Paint cannot read this file.' });
      }
    }
  };

  const loadLocalPicked = async (picked) => {
    if (!picked) return;
    try {
      await loadBlob(picked.file);
      setFileId(null);
      setLocalFile({ name: picked.name, handle: picked.handle || null });
    } catch {
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

  const setWallpaper = async () => {
    commitSel();
    try {
      const { blob } = await encodeCurrent('png', 100);
      const ex = fs.children('win').find((n) => n.name === 'Paint Wallpaper.png');
      const n = ex ? fs.write(ex.id, blob, 'image/png') : fs.create({ name: 'Paint Wallpaper.png', parent: 'win', data: blob, mime: 'image/png' });
      setSettings({ wallpaper: 'fs:' + n.id, wallpaperMode: 'stretch' });
    } catch (e) {
      os.msg({ icon: 'error', text: e.message });
    }
  };

  const transform = (kind) => {
    commitSel();
    pushUndo();
    const c = cv.current;
    const t = document.createElement('canvas');
    const rot = kind === 'rot';
    t.width = rot ? c.height : c.width;
    t.height = rot ? c.width : c.height;
    const g = t.getContext('2d');
    if (kind === 'fh') { g.translate(t.width, 0); g.scale(-1, 1); }
    else if (kind === 'fv') { g.translate(0, t.height); g.scale(1, -1); }
    else { g.translate(t.width, 0); g.rotate(Math.PI / 2); }
    g.drawImage(c, 0, 0);
    c.width = t.width;
    c.height = t.height;
    ctx().drawImage(t, 0, 0);
    setDim({ w: t.width, h: t.height });
  };

  const invert = () => {
    commitSel();
    pushUndo();
    const g = ctx(), c = cv.current, im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
    g.putImageData(im, 0, 0);
  };

  const attrs = async () => {
    commitSel();
    const v = await os.prompt({ title: 'Attributes', label: 'Image size (width x height in pixels):', value: `${cv.current.width}x${cv.current.height}` });
    if (!v) return;
    const m = v.match(/(\d+)\s*[x×,]\s*(\d+)/i);
    if (!m || +m[1] < 1 || +m[2] < 1 || +m[1] > 4000 || +m[2] > 4000) return os.msg({ icon: 'error', title: 'Paint', text: 'Enter a size like 800x600 (maximum 4000x4000).' });
    pushUndo();
    resizeCanvas(+m[1], +m[2]);
  };

  const clearImg = () => {
    setSel(null);
    live.current.sel = null;
    pushUndo();
    const g = ctx();
    g.fillStyle = live.current.bg;
    g.fillRect(0, 0, cv.current.width, cv.current.height);
  };

  const cropToSelection = () => {
    const curSel = live.current.sel;
    if (!curSel) return;
    pushUndo();
    const nw = Math.max(1, curSel.w);
    const nh = Math.max(1, curSel.h);
    const drawable = buildRenderableSelCanvas(curSel, live.current.transparentSel, live.current.bg);
    const c = cv.current;
    c.width = nw;
    c.height = nh;
    const g = ctx();
    g.fillStyle = live.current.bg;
    g.fillRect(0, 0, nw, nh);
    if (drawable) g.drawImage(drawable, 0, 0);
    setDim({ w: nw, h: nh });
    setSel(null);
    live.current.sel = null;
  };

  const openStretchSkew = async () => {
    const res = await os.dialog((done) => <StretchSkewDialog hasSelection={!!live.current.sel} onDone={done} />);
    if (!res) return;
    const { stretchAndSkewCanvas } = await import('../utils/imageCodecs.js');
    const curSel = live.current.sel;
    if (curSel) {
      const lifted = liftSel(curSel);
      const transformed = stretchAndSkewCanvas(lifted.canvas, { ...res, bgHex: live.current.bg, keepAlpha: true });
      const next = { ...lifted, w: transformed.width, h: transformed.height, canvas: transformed, mask: null };
      setSel(next);
      live.current.sel = next;
    } else {
      pushUndo();
      const transformed = stretchAndSkewCanvas(cv.current, { ...res, bgHex: live.current.bg, keepAlpha: false });
      const c = cv.current;
      c.width = transformed.width;
      c.height = transformed.height;
      ctx().drawImage(transformed, 0, 0);
      setDim({ w: transformed.width, h: transformed.height });
    }
  };

  // --- Clipboard & Selection Actions ---
  const copyImg = async () => {
    const curSel = live.current.sel;
    const srcCanvas = curSel
      ? buildRenderableSelCanvas(curSel, live.current.transparentSel, live.current.bg)
      : cv.current;
    if (!srcCanvas) return;

    const clipCanvas = document.createElement('canvas');
    clipCanvas.width = srcCanvas.width;
    clipCanvas.height = srcCanvas.height;
    clipCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);
    internalClip.current = { canvas: clipCanvas, w: clipCanvas.width, h: clipCanvas.height };

    try {
      const blob = await new Promise((res) => clipCanvas.toBlob(res, 'image/png'));
      if (blob && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        preferInternalClip.current = false;
      } else {
        preferInternalClip.current = true;
      }
    } catch {
      preferInternalClip.current = true;
    }
  };

  const deleteSel = useCallback(() => {
    const curSel = live.current.sel;
    if (!curSel) return;
    if (!curSel.lifted) {
      pushUndo();
      eraseSelCutout(curSel, live.current.bg);
    }
    setSel(null);
    live.current.sel = null;
  }, [eraseSelCutout, pushUndo]);

  const cutImg = async () => {
    if (!live.current.sel) {
      await copyImg();
      clearImg();
      return;
    }
    await copyImg();
    deleteSel();
  };

  const pasteBitmapAsSelection = (srcDrawable, w, h) => {
    commitSel();
    setTool('select');
    if (w > cv.current.width || h > cv.current.height) {
      pushUndo();
      resizeCanvas(Math.max(w, cv.current.width), Math.max(h, cv.current.height));
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(srcDrawable, 0, 0);
    const next = { x: 0, y: 0, w, h, canvas: c, mask: null, lifted: true, fromPaste: true };
    setSel(next);
    live.current.sel = next;
  };

  const pasteImg = async () => {
    if (!preferInternalClip.current && navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const t = it.types.find((x) => x.startsWith('image/'));
          if (t) {
            const bmp = await createImageBitmap(await it.getType(t));
            pasteBitmapAsSelection(bmp, bmp.width, bmp.height);
            return;
          }
        }
      } catch {
        // Fall through to internal Paint clipboard
      }
    }
    if (internalClip.current) {
      pasteBitmapAsSelection(internalClip.current.canvas, internalClip.current.w, internalClip.current.h);
      return;
    }
    os.msg({ icon: 'info', title: 'Paint', text: 'There is no image on the clipboard.' });
  };

  const selectAll = () => {
    commitSel();
    setTool('select');
    const w = cv.current.width;
    const h = cv.current.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(cv.current, 0, 0);
    const next = { x: 0, y: 0, w, h, canvas: c, mask: null, lifted: false, fromPaste: false };
    setSel(next);
    live.current.sel = next;
  };

  // --- Drawing Primitives ---
  const getPos = (e) => {
    const r = cv.current.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - r.left) * cv.current.width) / r.width),
      y: Math.floor(((e.clientY - r.top) * cv.current.height) / r.height),
    };
  };

  const stamp = (x, y, col) => {
    const g = ctx(), s = live.current.size, t = live.current.tool;
    g.fillStyle = col;
    if (t === 'pencil') g.fillRect(x, y, 1, 1);
    else if (t === 'eraser') { const e = s * 3 + 2; g.fillRect(x - (e >> 1), y - (e >> 1), e, e); }
    else if (t === 'brush') { g.beginPath(); g.arc(x + 0.5, y + 0.5, s * 1.5 + 0.5, 0, Math.PI * 2); g.fill(); }
  };

  const drawLineStroke = (a, b, col) => {
    const dx = b.x - a.x, dy = b.y - a.y, n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 0; i <= n; i++) stamp(Math.round(a.x + (dx * i) / n), Math.round(a.y + (dy * i) / n), col);
  };

  const spray = (p, col) => {
    const g = ctx(), r = live.current.size * 4 + 4;
    g.fillStyle = col;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.283, d = Math.random() * r;
      g.fillRect(Math.round(p.x + Math.cos(a) * d), Math.round(p.y + Math.sin(a) * d), 1, 1);
    }
  };

  const drawShape = (t, a, b, col, other, shift) => {
    const g = ctx(), { size: lw, fillMode: fm } = live.current;
    let { x: x1, y: y1 } = b;
    if (shift) {
      if (t === 'line') {
        const dx = x1 - a.x, dy = y1 - a.y;
        if (Math.abs(dx) > 2 * Math.abs(dy)) y1 = a.y;
        else if (Math.abs(dy) > 2 * Math.abs(dx)) x1 = a.x;
        else { const m = Math.max(Math.abs(dx), Math.abs(dy)); x1 = a.x + Math.sign(dx) * m; y1 = a.y + Math.sign(dy) * m; }
      } else {
        const m = Math.max(Math.abs(x1 - a.x), Math.abs(y1 - a.y));
        x1 = a.x + Math.sign(x1 - a.x || 1) * m;
        y1 = a.y + Math.sign(y1 - a.y || 1) * m;
      }
    }
    g.lineWidth = lw;
    g.strokeStyle = col;
    g.lineJoin = 'miter';
    g.lineCap = 'round';
    const x = Math.min(a.x, x1) + 0.5, y = Math.min(a.y, y1) + 0.5, w = Math.abs(x1 - a.x), h = Math.abs(y1 - a.y);
    if (t === 'line') { g.beginPath(); g.moveTo(a.x + 0.5, a.y + 0.5); g.lineTo(x1 + 0.5, y1 + 0.5); g.stroke(); return; }
    g.beginPath();
    if (t === 'rect') g.rect(x, y, w, h);
    else if (t === 'rrect') rrPath(g, x, y, w, h, Math.min(16, w / 3, h / 3));
    else g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (fm === 1) { g.fillStyle = other; g.fill(); g.stroke(); }
    else if (fm === 2) { g.fillStyle = col; g.fill(); }
    else g.stroke();
  };

  const drawPolygonPreview = (pts, col, other, closed) => {
    if (!pts?.length) return;
    const g = ctx();
    const { size: lw, fillMode: fm } = live.current;
    g.lineWidth = lw;
    g.strokeStyle = col;
    g.lineJoin = 'miter';
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(pts[0].x + 0.5, pts[0].y + 0.5);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x + 0.5, pts[i].y + 0.5);
    if (closed) {
      g.closePath();
      if (fm === 1) { g.fillStyle = other; g.fill(); g.stroke(); }
      else if (fm === 2) { g.fillStyle = col; g.fill(); }
      else g.stroke();
    } else {
      g.stroke();
    }
  };

  const drawCurveStroke = (p0, c1, c2, p3, col) => {
    const g = ctx();
    g.lineWidth = live.current.size;
    g.strokeStyle = col;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(p0.x + 0.5, p0.y + 0.5);
    g.bezierCurveTo(c1.x + 0.5, c1.y + 0.5, c2.x + 0.5, c2.y + 0.5, p3.x + 0.5, p3.y + 0.5);
    g.stroke();
  };

  const flood = (x, y, hex) => {
    const g = ctx(), { width: w, height: h } = cv.current;
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const img = g.getImageData(0, 0, w, h), d = img.data, i0 = (y * w + x) * 4, t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]], f = hexToRgb(hex);
    if (t[0] === f[0] && t[1] === f[1] && t[2] === f[2] && t[3] === 255) return;
    const match = (i) => d[i] === t[0] && d[i + 1] === t[1] && d[i + 2] === t[2] && d[i + 3] === t[3];
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy0] = stack.pop();
      let cy = cy0;
      while (cy >= 0 && match((cy * w + cx) * 4)) cy--;
      cy++;
      let l = false, r = false;
      while (cy < h && match((cy * w + cx) * 4)) {
        const i = (cy * w + cx) * 4;
        d[i] = f[0]; d[i + 1] = f[1]; d[i + 2] = f[2]; d[i + 3] = 255;
        if (cx > 0) { if (match(i - 4)) { if (!l) { stack.push([cx - 1, cy]); l = true; } } else l = false; }
        if (cx < w - 1) { if (match(i + 4)) { if (!r) { stack.push([cx + 1, cy]); r = true; } } else r = false; }
        cy++;
      }
    }
    g.putImageData(img, 0, 0);
  };

  // Handle hit testing for selection resize corners/edges
  const hitSelHandle = (e, curSel) => {
    if (!curSel || !cv.current) return null;
    const r = cv.current.getBoundingClientRect();
    const sx = r.left + curSel.x * zoom;
    const sy = r.top + curSel.y * zoom;
    const sw = curSel.w * zoom;
    const sh = curSel.h * zoom;
    const cx = e.clientX;
    const cy = e.clientY;
    const handles = [
      ['nw', sx, sy],
      ['n', sx + sw / 2, sy],
      ['ne', sx + sw, sy],
      ['w', sx, sy + sh / 2],
      ['e', sx + sw, sy + sh / 2],
      ['sw', sx, sy + sh],
      ['s', sx + sw / 2, sy + sh],
      ['se', sx + sw, sy + sh],
    ];
    for (const [id, hx, hy] of handles) {
      if (Math.abs(cx - hx) <= 6 && Math.abs(cy - hy) <= 6) return id;
    }
    return null;
  };

  const down = async (e) => {
    if (e.button > 2) return;
    e.preventDefault();
    const { tool: t, fg: f, bg: b, sel: curSel, zoom: z } = live.current;
    const p = getPos(e), col = e.button === 2 ? b : f, other = e.button === 2 ? f : b;
    const s = S.current;

    // 1. Handle active selection (move / resize / click-outside commit)
    if (curSel && (t === 'select' || t === 'freeselect')) {
      const handleId = hitSelHandle(e, curSel);
      const insideSel = p.x >= curSel.x && p.x < curSel.x + curSel.w && p.y >= curSel.y && p.y < curSel.y + curSel.h;
      if (e.button === 2) {
        if (!handleId && !insideSel) commitSel();
        return;
      }
      if (handleId) {
        cv.current.setPointerCapture(e.pointerId);
        const lifted = liftSel(curSel);
        Object.assign(s, {
          selMode: 'resize',
          handle: handleId,
          start: p,
          origRect: { x: lifted.x, y: lifted.y, w: lifted.w, h: lifted.h },
          origCanvas: lifted.canvas,
        });
        return;
      }
      if (insideSel) {
        cv.current.setPointerCapture(e.pointerId);
        Object.assign(s, {
          selMode: 'move',
          start: p,
          origX: curSel.x,
          origY: curSel.y,
          movedYet: false,
        });
        return;
      }
      commitSel();
    } else if (curSel) {
      if (e.button === 2) return;
      commitSel();
    }

    // 2. Rectangular Select / Free-Form Select start
    if (t === 'select') {
      if (e.button === 2) return;
      cv.current.setPointerCapture(e.pointerId);
      Object.assign(s, { selMode: 'marquee', start: p });
      setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }
    if (t === 'freeselect') {
      if (e.button === 2) return;
      cv.current.setPointerCapture(e.pointerId);
      Object.assign(s, { selMode: 'lasso', pts: [p] });
      setLassoPts([p]);
      return;
    }

    // 3. Instant / Dialog tools
    if (t === 'fill') { pushUndo(); flood(p.x, p.y, col); return; }
    if (t === 'picker') {
      const cx = Math.max(0, Math.min(cv.current.width - 1, p.x));
      const cy = Math.max(0, Math.min(cv.current.height - 1, p.y));
      const px = ctx().getImageData(cx, cy, 1, 1).data;
      const hex = rgbToHex(px[0], px[1], px[2]);
      e.button === 2 ? setBg(hex) : setFg(hex);
      setTool(prevTool.current);
      return;
    }
    if (t === 'zoom') {
      const idx = ZOOM_VALS.indexOf(z);
      const step = e.button === 2 ? -1 : 1;
      const nextIdx = idx < 0 ? 1 : (idx + step + ZOOM_VALS.length) % ZOOM_VALS.length;
      setZoom(ZOOM_VALS[nextIdx]);
      return;
    }
    if (t === 'text') {
      const txt = await os.prompt({ title: 'Text', label: 'Enter the text to draw at the clicked position:' });
      if (txt) {
        pushUndo();
        const g = ctx();
        const fsPx = live.current.fontSize;
        const lh = fsPx * 1.2;
        const lines = txt.split('\n');
        g.font = `${fsPx}px Arial, sans-serif`;
        g.textBaseline = 'top';
        if (!live.current.transparentSel) {
          const maxW = Math.max(...lines.map((ln) => g.measureText(ln).width), 4);
          g.fillStyle = live.current.bg;
          g.fillRect(p.x, p.y, Math.ceil(maxW), Math.ceil(lines.length * lh));
        }
        g.fillStyle = col;
        lines.forEach((ln, i) => g.fillText(ln, p.x, p.y + i * lh));
      }
      return;
    }

    // 4. Multi-step Curve Tool (Win95 3-step cubic Bezier)
    if (t === 'curve') {
      cv.current.setPointerCapture(e.pointerId);
      if (s.curveStep === 0) {
        pushUndo();
        s.curveBase = ctx().getImageData(0, 0, cv.current.width, cv.current.height);
        s.curveStep = 0.5;
        s.p0 = p;
        s.p3 = p;
        s.c1 = p;
        s.c2 = p;
        s.col = col;
        setCurveHint('Drag to draw baseline');
      } else if (s.curveStep === 1) {
        s.c1 = p;
        s.draggingCurve = true;
        ctx().putImageData(s.curveBase, 0, 0);
        drawCurveStroke(s.p0, s.c1, s.p3, s.p3, s.col);
      } else if (s.curveStep === 2) {
        s.c2 = p;
        s.draggingCurve = true;
        ctx().putImageData(s.curveBase, 0, 0);
        drawCurveStroke(s.p0, s.c1, s.c2, s.p3, s.col);
      }
      return;
    }

    // 5. Multi-vertex Polygon Tool
    if (t === 'polygon') {
      cv.current.setPointerCapture(e.pointerId);
      if (!s.polyPts?.length) {
        pushUndo();
        s.polyBase = ctx().getImageData(0, 0, cv.current.width, cv.current.height);
        s.polyPts = [p, p];
        s.polyCol = col;
        s.polyOther = other;
        s.polyDrag = true;
        setCurveHint('Click vertices; double-click or click start to close');
      } else {
        const first = s.polyPts[0];
        const nearStart = Math.hypot(p.x - first.x, p.y - first.y) <= Math.max(5, 6 / z);
        if (nearStart || e.detail >= 2 || e.button === 2) {
          ctx().putImageData(s.polyBase, 0, 0);
          drawPolygonPreview(s.polyPts, s.polyCol, s.polyOther, true);
          s.polyPts = [];
          s.polyBase = null;
          s.polyDrag = false;
          setCurveHint('');
          return;
        }
        s.polyPts.push(p);
        s.polyDrag = true;
        ctx().putImageData(s.polyBase, 0, 0);
        drawPolygonPreview(s.polyPts, s.polyCol, s.polyOther, false);
      }
      return;
    }

    // 6. Standard drawing tools
    cv.current.setPointerCapture(e.pointerId);
    pushUndo();
    Object.assign(s, { drawing: true, start: p, last: p, col, other });
    if (['line', 'rect', 'ellipse', 'rrect'].includes(t)) {
      s.base = ctx().getImageData(0, 0, cv.current.width, cv.current.height);
    } else if (t === 'airbrush') {
      spray(p, col);
      s.timer = setInterval(() => spray(s.last, col), 30);
    } else {
      stamp(p.x, p.y, t === 'eraser' ? b : col);
    }
  };

  const move = (e) => {
    const p = getPos(e);
    setPos(p);
    const s = S.current;
    const t = live.current.tool;

    // Selection interactions
    if (s.selMode === 'marquee') {
      const x = Math.max(0, Math.min(s.start.x, p.x));
      const y = Math.max(0, Math.min(s.start.y, p.y));
      const x2 = Math.min(cv.current.width, Math.max(s.start.x, p.x));
      const y2 = Math.min(cv.current.height, Math.max(s.start.y, p.y));
      setMarquee({ x, y, w: x2 - x, h: y2 - y });
      return;
    }
    if (s.selMode === 'lasso') {
      const last = s.pts[s.pts.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 2) {
        s.pts.push(p);
        setLassoPts([...s.pts]);
      }
      return;
    }
    if (s.selMode === 'move') {
      const dx = p.x - s.start.x;
      const dy = p.y - s.start.y;
      if (!s.movedYet && (dx !== 0 || dy !== 0)) {
        s.movedYet = true;
        liftSel(live.current.sel);
      }
      if (s.movedYet && live.current.sel) {
        const next = { ...live.current.sel, x: s.origX + dx, y: s.origY + dy };
        setSel(next);
        live.current.sel = next;
      }
      return;
    }
    if (s.selMode === 'resize') {
      const dx = p.x - s.start.x;
      const dy = p.y - s.start.y;
      const r = s.origRect;
      let nx = r.x, ny = r.y, nw = r.w, nh = r.h;
      if (s.handle.includes('e')) nw = Math.max(1, r.w + dx);
      if (s.handle.includes('s')) nh = Math.max(1, r.h + dy);
      if (s.handle.includes('w')) { nw = Math.max(1, r.w - dx); nx = r.x + r.w - nw; }
      if (s.handle.includes('n')) { nh = Math.max(1, r.h - dy); ny = r.y + r.h - nh; }
      const rc = document.createElement('canvas');
      rc.width = nw;
      rc.height = nh;
      const rg = rc.getContext('2d');
      rg.imageSmoothingEnabled = false;
      rg.drawImage(s.origCanvas, 0, 0, nw, nh);
      const next = { ...live.current.sel, x: nx, y: ny, w: nw, h: nh, canvas: rc, mask: null };
      setSel(next);
      live.current.sel = next;
      return;
    }

    // Curve dragging
    if (t === 'curve') {
      if (s.curveStep === 0.5) {
        s.p3 = p;
        ctx().putImageData(s.curveBase, 0, 0);
        drawCurveStroke(s.p0, s.p0, s.p3, s.p3, s.col);
      } else if (s.curveStep === 1 && s.draggingCurve) {
        s.c1 = p;
        ctx().putImageData(s.curveBase, 0, 0);
        drawCurveStroke(s.p0, s.c1, s.p3, s.p3, s.col);
      } else if (s.curveStep === 2 && s.draggingCurve) {
        s.c2 = p;
        ctx().putImageData(s.curveBase, 0, 0);
        drawCurveStroke(s.p0, s.c1, s.c2, s.p3, s.col);
      }
      return;
    }

    // Polygon segment drag
    if (t === 'polygon' && s.polyDrag && s.polyPts?.length) {
      s.polyPts[s.polyPts.length - 1] = p;
      ctx().putImageData(s.polyBase, 0, 0);
      drawPolygonPreview(s.polyPts, s.polyCol, s.polyOther, false);
      return;
    }

    if (!s.drawing) return;
    if (s.base) {
      ctx().putImageData(s.base, 0, 0);
      drawShape(t, s.start, p, s.col, s.other, e.shiftKey);
    } else if (t === 'airbrush') {
      s.last = p;
    } else {
      drawLineStroke(s.last, p, t === 'eraser' ? live.current.bg : s.col);
      s.last = p;
    }
  };

  const up = (e) => {
    const s = S.current;
    const t = live.current.tool;

    if (s.selMode === 'marquee') {
      const p = e ? getPos(e) : s.start;
      const x = Math.max(0, Math.min(s.start.x, p.x));
      const y = Math.max(0, Math.min(s.start.y, p.y));
      const x2 = Math.min(cv.current.width, Math.max(s.start.x, p.x));
      const y2 = Math.min(cv.current.height, Math.max(s.start.y, p.y));
      const w = x2 - x, h = y2 - y;
      s.selMode = null;
      setMarquee(null);
      if (w >= 2 && h >= 2) {
        const sc = document.createElement('canvas');
        sc.width = w;
        sc.height = h;
        sc.getContext('2d').drawImage(cv.current, x, y, w, h, 0, 0, w, h);
        const next = { x, y, w, h, canvas: sc, mask: null, lifted: false, fromPaste: false };
        setSel(next);
        live.current.sel = next;
      }
      return;
    }

    if (s.selMode === 'lasso') {
      const pts = s.pts || [];
      s.selMode = null;
      s.pts = null;
      setLassoPts(null);
      if (pts.length >= 3) {
        const cw = cv.current.width, ch = cv.current.height;
        let minX = cw, minY = ch, maxX = 0, maxY = 0;
        for (const pt of pts) {
          minX = Math.min(minX, Math.max(0, Math.min(cw - 1, pt.x)));
          minY = Math.min(minY, Math.max(0, Math.min(ch - 1, pt.y)));
          maxX = Math.max(maxX, Math.max(0, Math.min(cw - 1, pt.x)));
          maxY = Math.max(maxY, Math.max(0, Math.min(ch - 1, pt.y)));
        }
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        if (w >= 2 && h >= 2) {
          const mCanvas = document.createElement('canvas');
          mCanvas.width = w;
          mCanvas.height = h;
          const mg = mCanvas.getContext('2d');
          mg.beginPath();
          mg.moveTo(pts[0].x - minX + 0.5, pts[0].y - minY + 0.5);
          for (let i = 1; i < pts.length; i++) mg.lineTo(pts[i].x - minX + 0.5, pts[i].y - minY + 0.5);
          mg.closePath();
          mg.fillStyle = '#000';
          mg.fill();
          const maskData = mg.getImageData(0, 0, w, h).data;
          const mask = new Uint8Array(w * h);
          const sc = document.createElement('canvas');
          sc.width = w;
          sc.height = h;
          const sg = sc.getContext('2d');
          const srcImg = ctx().getImageData(minX, minY, w, h);
          const sd = srcImg.data;
          for (let i = 0; i < w * h; i++) {
            if (maskData[i * 4 + 3] > 127) mask[i] = 1;
            else sd[i * 4 + 3] = 0;
          }
          sg.putImageData(srcImg, 0, 0);
          const next = { x: minX, y: minY, w, h, canvas: sc, mask, lifted: false, fromPaste: false };
          setSel(next);
          live.current.sel = next;
        }
      }
      return;
    }

    if (s.selMode === 'move' || s.selMode === 'resize') {
      s.selMode = null;
      return;
    }

    if (t === 'curve') {
      if (s.curveStep === 0.5) {
        s.curveStep = 1;
        setCurveHint('Click or drag for 1st curve bend');
      } else if (s.curveStep === 1 && s.draggingCurve) {
        s.draggingCurve = false;
        s.curveStep = 2;
        setCurveHint('Click or drag for 2nd curve bend');
      } else if (s.curveStep === 2 && s.draggingCurve) {
        s.draggingCurve = false;
        s.curveStep = 0;
        s.curveBase = null;
        setCurveHint('');
      }
      return;
    }

    if (t === 'polygon') {
      s.polyDrag = false;
      return;
    }

    if (!s.drawing) return;
    clearInterval(s.timer);
    s.drawing = false;
    s.base = null;
  };

  const selectTool = (id) => {
    if (id !== tool) {
      if (id !== 'select' && id !== 'freeselect') commitSel();
      cancelPendingMultiStep();
      if (tool !== 'picker') prevTool.current = tool;
      setTool(id);
    }
  };

  useEffect(() => {
    if (!active) return;
    const h = (e) => {
      if (e.target.closest?.('input,textarea,select')) return;
      const k = e.key.toLowerCase();
      if (e.ctrlKey && k === 'z') { e.preventDefault(); doUndo(); }
      else if (e.ctrlKey && k === 'y') { e.preventDefault(); doRedo(); }
      else if (e.ctrlKey && k === 'c') { e.preventDefault(); copyImg(); }
      else if (e.ctrlKey && k === 'x') { e.preventDefault(); cutImg(); }
      else if (e.ctrlKey && k === 'v') { e.preventDefault(); pasteImg(); }
      else if (e.ctrlKey && k === 'a') { e.preventDefault(); selectAll(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (live.current.sel) { e.preventDefault(); deleteSel(); }
      } else if (e.key === 'Escape') {
        if (live.current.sel) { e.preventDefault(); commitSel(); }
        cancelPendingMultiStep();
      } else if (e.key === 'Enter' && S.current.polyPts?.length >= 3) {
        e.preventDefault();
        ctx().putImageData(S.current.polyBase, 0, 0);
        drawPolygonPreview(S.current.polyPts, S.current.polyCol, S.current.polyOther, true);
        S.current.polyPts = [];
        S.current.polyBase = null;
        setCurveHint('');
      } else if (e.ctrlKey && !e.shiftKey && k === 's') { e.preventDefault(); save(false); }
      else if (e.ctrlKey && e.shiftKey && k === 's') { e.preventDefault(); saveWithDialog(); }
      else if (e.ctrlKey && e.shiftKey && k === 'o') { e.preventDefault(); openFromPC(); }
      else if (e.ctrlKey && !e.shiftKey && k === 'o') { e.preventDefault(); openImg(); }
      else if (e.ctrlKey && k === 'n') { e.preventDefault(); newImg(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  // --- SmartTransfer Helpers ---
  const hasPaintContent = () => {
    const cur = live.current;
    return Boolean(cur.dirty || cur.fileId || cur.localFile || cur.sel || undo.current.length > 0);
  };

  const paintLabel = () => {
    const cur = live.current;
    return (cur.fileId ? fs.get(cur.fileId)?.name : cur.localFile?.name) || 'Paint Image.png';
  };

  const exportTransferBlob = async () => {
    const curSel = live.current.sel;
    const srcCanvas = curSel
      ? buildRenderableSelCanvas(curSel, live.current.transparentSel, live.current.bg)
      : cv.current;
    if (!srcCanvas) return null;
    const blob = await new Promise((res) => srcCanvas.toBlob(res, 'image/png'));
    return blob ? { blob, width: srcCanvas.width, height: srcCanvas.height, title: paintLabel() } : null;
  };

  const receiveTransfer = async (transfer, action = 'open') => {
    if (!transfer) return false;
    let blob = transfer.payload instanceof Blob
      ? transfer.payload
      : await SmartTransfer.imageSrcToBlob(String(transfer.payload || ''));
    if (!blob) {
      os.msg({ icon: 'error', title: 'Paint', text: 'Received transfer does not contain valid image data.' });
      return false;
    }
    blob = await SmartTransfer.normalizeImageBlob(blob);
    let mode = action;
    if (mode === 'open' && (live.current.dirty || live.current.fileId || live.current.localFile || live.current.sel)) {
      const choice = await receiveConflictDialog(os, {
        targetApp: 'paint',
        sourceName: SmartTransfer.APP_NAMES[transfer.sourceApp] || transfer.sourceApp,
        title: transfer.title,
        isImage: true,
      });
      if (!choice || choice === 'cancel') return false;
      mode = choice; // 'replace' | 'insert'
    } else if (mode === 'open') {
      mode = 'replace';
    }

    try {
      const bmp = await decodeBlobToDrawable(blob);
      const w = bmp.naturalWidth || bmp.width || 1;
      const h = bmp.naturalHeight || bmp.height || 1;
      if (mode === 'insert') {
        pasteBitmapAsSelection(bmp, w, h);
        return true;
      }
      commitSel();
      pushUndo();
      const c = cv.current;
      c.width = w;
      c.height = h;
      ctx().drawImage(bmp, 0, 0, w, h);
      setDim({ w, h });
      setSel(null);
      live.current.sel = null;
      setFileId(null);
      setLocalFile({ name: (transfer.title || 'received.png').replace(/[^\w.-]+/g, '_'), handle: null });
      setDirty(true);
      return true;
    } catch {
      os.msg({ icon: 'error', title: 'Paint', text: 'Paint could not decode the received image.' });
      return false;
    }
  };

  const receiveTransferRef = useRef(receiveTransfer);
  receiveTransferRef.current = receiveTransfer;

  useEffect(() => {
    return SmartTransfer.registerApp('paint', win.id, {
      getCapability: () => {
        const ok = hasPaintContent();
        return { hasText: false, hasHtml: false, hasImage: ok, hasContent: ok };
      },
      pullFor: async () => {
        if (!hasPaintContent()) return null;
        const ex = await exportTransferBlob();
        return ex ? { contentType: 'image/png', payload: ex.blob, title: ex.title, meta: { width: ex.width, height: ex.height } } : null;
      },
      receiveTransfer: async (t, act) => receiveTransferRef.current?.(t, act),
    });
  }, [win.id]); // eslint-disable-line

  const sendToWordPad = async () => {
    const ex = await exportTransferBlob();
    if (!ex) return;
    await SmartTransfer.send({
      sourceApp: 'paint',
      targetApp: 'wordpad',
      contentType: 'image/png',
      payload: ex.blob,
      title: ex.title,
      meta: { width: ex.width, height: ex.height },
    });
  };

  const sendToBrowser = async () => {
    const ex = await exportTransferBlob();
    if (!ex) return;
    await SmartTransfer.send({
      sourceApp: 'paint',
      targetApp: 'browser',
      contentType: 'image/png',
      payload: ex.blob,
      title: ex.title,
      meta: { width: ex.width, height: ex.height },
    });
  };

  const pullFrom = async (sourceApp) => {
    try {
      const t = await SmartTransfer.pull({ sourceApp, targetApp: 'paint', kind: 'image' });
      if (!t) {
        os.msg({ icon: 'info', title: 'Paint', text: `No image available from ${SmartTransfer.APP_NAMES[sourceApp]}.` });
        return;
      }
      await receiveTransfer(t, 'open');
    } catch (e) {
      os.msg({ icon: 'error', title: 'Paint', text: e.message });
    }
  };

  const menus = [
    {
      label: '&File',
      items: [
        { label: '&New', shortcut: 'Ctrl+N', onClick: newImg },
        { label: '&Open (Drive C:)...', shortcut: 'Ctrl+O', onClick: openImg },
        { label: 'Open from &Local PC...', shortcut: 'Ctrl+Shift+O', onClick: openFromPC },
        { sep: true },
        { label: '&Save', shortcut: 'Ctrl+S', onClick: () => save(false) },
        { label: 'Save &As (C: / Local / BMP / GIF / PNG)...', shortcut: 'Ctrl+Shift+S', onClick: saveWithDialog },
        { sep: true },
        { label: 'Set as &Wallpaper', onClick: setWallpaper },
        { sep: true },
        { label: 'E&xit', onClick: () => os.close(win.id) },
      ],
    },
    {
      label: '&Edit',
      items: [
        { label: '&Undo', shortcut: 'Ctrl+Z', disabled: !undo.current.length && !sel?.fromPaste, onClick: doUndo },
        { label: '&Repeat', shortcut: 'Ctrl+Y', disabled: !redo.current.length, onClick: doRedo },
        { sep: true },
        { label: 'Cu&t', shortcut: 'Ctrl+X', onClick: cutImg },
        { label: '&Copy', shortcut: 'Ctrl+C', onClick: copyImg },
        { label: '&Paste', shortcut: 'Ctrl+V', onClick: pasteImg },
        { label: 'Clear &Selection', shortcut: 'Del', disabled: !sel, onClick: deleteSel },
        { label: 'Select &All', shortcut: 'Ctrl+A', onClick: selectAll },
        { sep: true },
        { label: 'C&lear Image', onClick: clearImg },
      ],
    },
    {
      label: '&View',
      items: [
        { label: '&Zoom', sub: ZOOM_VALS.map((z) => ({ label: `${z}x (${Math.round(z * 100)}%)`, radio: true, checked: zoom === z, onClick: () => setZoom(z) })) },
        { sep: true },
        { label: '&Opaque Selection', radio: true, checked: !transparentSel, onClick: () => setTransparentSel(false) },
        { label: '&Transparent Selection', radio: true, checked: transparentSel, onClick: () => setTransparentSel(true) },
      ],
    },
    {
      label: '&Image',
      items: [
        { label: 'Flip &Horizontal', onClick: () => transform('fh') },
        { label: 'Flip &Vertical', onClick: () => transform('fv') },
        { label: '&Rotate 90°', onClick: () => transform('rot') },
        { sep: true },
        { label: '&Stretch/Skew...', onClick: openStretchSkew },
        { label: '&Crop to Selection', disabled: !sel, onClick: cropToSelection },
        { label: '&Invert Colors', onClick: invert },
        { sep: true },
        { label: '&Attributes...', onClick: attrs },
      ],
    },
    {
      label: '&Options',
      items: [
        { label: 'Swap &colors', onClick: () => { setFg(bg); setBg(fg); } },
        { label: 'Draw &Opaque', checked: !transparentSel, onClick: () => setTransparentSel(false) },
        { label: 'Draw &Transparent', checked: transparentSel, onClick: () => setTransparentSel(true) },
      ],
    },
    {
      label: '&Send',
      items: () => [
        { label: 'Send to &WordPad (current/selected image)', disabled: !hasPaintContent(), onClick: sendToWordPad },
        { label: 'Send to &Internet Explorer (image preview)', disabled: !hasPaintContent(), onClick: sendToBrowser },
        { sep: true },
        { label: 'Get from &Internet Explorer (selected image)', disabled: !SmartTransfer.canPull('browser', 'image'), onClick: () => pullFrom('browser') },
        { label: 'Get from &WordPad (selected image)', disabled: !SmartTransfer.canPull('wordpad', 'image'), onClick: () => pullFrom('wordpad') },
        { sep: true },
        { label: 'Transfer &History & Cache...', onClick: () => openTransferHistoryDialog(os) },
      ],
    },
    {
      label: '&Help',
      items: [
        { label: '&Help Topics', onClick: () => os.open('help') },
        { label: '&About Paint', onClick: () => os.msg({ icon: 'info', title: 'About Paint', text: 'Paint\nWindows 95 Smart Edition\nSupports Select, Free-Form Select, Move/Copy/Cut/Paste/Crop, Stretch/Skew, 0.5x-4x Zoom, BMP/PNG/GIF/JPG/WebP Save, and Smart Office Transfer.' }) },
      ],
    },
  ];

  const sizeOpts =
    tool === 'eraser' || tool === 'brush' || tool === 'airbrush'
      ? [1, 2, 4, 6]
      : ['line', 'curve', 'rect', 'polygon', 'ellipse', 'rrect'].includes(tool)
      ? [1, 2, 3, 5]
      : [];
  const showTransOpts = ['select', 'freeselect', 'text'].includes(tool);
  const showFillOpts = ['rect', 'polygon', 'ellipse', 'rrect'].includes(tool);

  const paintContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const curSel = live.current.sel;
    os.showMenu(e.clientX, e.clientY, [
      { label: 'Cu&t', shortcut: 'Ctrl+X', onClick: cutImg },
      { label: '&Copy', shortcut: 'Ctrl+C', onClick: copyImg },
      { label: '&Paste', shortcut: 'Ctrl+V', onClick: pasteImg },
      { label: 'Clear &Selection', shortcut: 'Del', disabled: !curSel, onClick: deleteSel },
      { label: 'Select &All', shortcut: 'Ctrl+A', onClick: selectAll },
      { sep: true },
      { label: 'Crop to Se&lection', disabled: !curSel, onClick: cropToSelection },
      {
        label: '&Flip/Rotate',
        sub: [
          { label: 'Flip &Horizontal', onClick: () => transform('fh') },
          { label: 'Flip &Vertical', onClick: () => transform('fv') },
          { label: '&Rotate 90°', onClick: () => transform('rot') },
        ],
      },
      { label: '&Stretch/Skew...', onClick: openStretchSkew },
      { label: '&Invert Colors', onClick: invert },
      { sep: true },
      { label: 'Draw &Opaque', checked: !live.current.transparentSel, onClick: () => setTransparentSel(false) },
      { label: 'Draw &Transparent', checked: live.current.transparentSel, onClick: () => setTransparentSel(true) },
      { sep: true },
      { label: 'C&lear Image', onClick: clearImg },
      { label: '&Attributes...', onClick: attrs },
      { sep: true },
      { label: 'Send to &WordPad', disabled: !hasPaintContent(), onClick: sendToWordPad },
      { label: 'Send to &Internet Explorer', disabled: !hasPaintContent(), onClick: sendToBrowser },
    ]);
  };

  return (
    <div
      className="app paint"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropFile}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <MenuBar menus={menus} />
      <div className="paint-main">
        <div className="paint-tools">
          <div className="tool-grid">
            {TOOLS.map(([id, label]) => (
              <button
                key={id}
                title={label}
                className={'btn tool-btn ' + (tool === id ? 'pressed' : '')}
                onClick={() => selectTool(id)}
              >
                <ToolIcon id={id} />
              </button>
            ))}
          </div>
          <div className="tool-opts sunken">
            {tool === 'zoom' &&
              ZOOM_VALS.map((z) => (
                <button key={z} className={'opt ' + (zoom === z ? 'on' : '')} onClick={() => setZoom(z)}>
                  {z}x
                </button>
              ))}
            {showTransOpts && (
              <>
                <button
                  className={'opt tall ' + (!transparentSel ? 'on' : '')}
                  title="Draw Opaque (background color covers)"
                  onClick={() => setTransparentSel(false)}
                >
                  <svg width="34" height="22" viewBox="0 0 34 22">
                    <rect x="2" y="2" width="30" height="18" fill="#80a0ff" stroke="#000" strokeWidth="1" />
                    <rect x="7" y="5" width="20" height="12" fill="#fff" stroke="#000" strokeWidth="1" />
                    <circle cx="13" cy="11" r="4" fill="#ff0000" stroke="#000" />
                    <polygon points="18,15 24,15 21,7" fill="#00a000" stroke="#000" />
                  </svg>
                </button>
                <button
                  className={'opt tall ' + (transparentSel ? 'on' : '')}
                  title="Draw Transparent (background color shows through)"
                  onClick={() => setTransparentSel(true)}
                >
                  <svg width="34" height="22" viewBox="0 0 34 22">
                    <rect x="2" y="2" width="30" height="18" fill="#80a0ff" stroke="#000" strokeWidth="1" />
                    <circle cx="13" cy="11" r="4" fill="#ff0000" stroke="#000" />
                    <polygon points="18,15 24,15 21,7" fill="#00a000" stroke="#000" />
                  </svg>
                </button>
              </>
            )}
            {sizeOpts.map((s) => (
              <button key={s} className={'opt ' + (size === s ? 'on' : '')} onClick={() => setSize(s)}>
                <i style={{ width: 24, height: Math.min(s * 2, 12), background: '#000', display: 'block', borderRadius: tool === 'brush' ? 8 : 0 }} />
              </button>
            ))}
            {showFillOpts &&
              ['▭', '▣', '■'].map((g, i) => (
                <button
                  key={i}
                  className={'opt ' + (fillMode === i ? 'on' : '')}
                  title={['Outline', 'Outline + fill', 'Filled'][i]}
                  onClick={() => setFillMode(i)}
                >
                  {g}
                </button>
              ))}
            {tool === 'text' &&
              [12, 18, 28, 40].map((s) => (
                <button key={s} className={'opt ' + (fontSize === s ? 'on' : '')} onClick={() => setFontSize(s)}>
                  {s}pt
                </button>
              ))}
          </div>
        </div>

        <div className="field paint-scroll" ref={wrap} onContextMenu={paintContextMenu}>
          <div className="paint-stage" style={{ width: dim.w * zoom, height: dim.h * zoom }}>
            <canvas
              ref={cv}
              className="paint-canvas"
              style={{
                width: dim.w * zoom,
                height: dim.h * zoom,
                imageRendering: zoom >= 1 ? 'pixelated' : 'auto',
                cursor: tool === 'zoom' ? 'zoom-in' : tool === 'picker' ? 'copy' : (sel && pos && (tool === 'select' || tool === 'freeselect') && pos.x >= sel.x && pos.x < sel.x + sel.w && pos.y >= sel.y && pos.y < sel.y + sel.h) ? 'move' : 'crosshair',
              }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onPointerLeave={() => setPos(null)}
              onContextMenu={(e) => {
                const curTool = live.current.tool;
                if (curTool === 'select' || curTool === 'freeselect' || live.current.sel) {
                  paintContextMenu(e);
                } else {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            />

            {sel && (
              <>
                <canvas
                  ref={selView}
                  className="paint-sel-layer"
                  style={{
                    left: sel.x * zoom,
                    top: sel.y * zoom,
                    width: sel.w * zoom,
                    height: sel.h * zoom,
                    imageRendering: zoom >= 1 ? 'pixelated' : 'auto',
                  }}
                />
                <div
                  className="paint-sel-box"
                  style={{
                    left: sel.x * zoom,
                    top: sel.y * zoom,
                    width: sel.w * zoom,
                    height: sel.h * zoom,
                  }}
                >
                  <div className="paint-sel-h" style={{ left: -3, top: -3 }} />
                  <div className="paint-sel-h" style={{ left: 'calc(50% - 2.5px)', top: -3 }} />
                  <div className="paint-sel-h" style={{ right: -3, top: -3 }} />
                  <div className="paint-sel-h" style={{ left: -3, top: 'calc(50% - 2.5px)' }} />
                  <div className="paint-sel-h" style={{ right: -3, top: 'calc(50% - 2.5px)' }} />
                  <div className="paint-sel-h" style={{ left: -3, bottom: -3 }} />
                  <div className="paint-sel-h" style={{ left: 'calc(50% - 2.5px)', bottom: -3 }} />
                  <div className="paint-sel-h" style={{ right: -3, bottom: -3 }} />
                </div>
              </>
            )}

            {marquee && marquee.w > 0 && marquee.h > 0 && (
              <div
                className="paint-sel-box"
                style={{
                  left: marquee.x * zoom,
                  top: marquee.y * zoom,
                  width: marquee.w * zoom,
                  height: marquee.h * zoom,
                }}
              />
            )}

            {lassoPts && lassoPts.length > 1 && (
              <svg className="paint-lasso-svg" viewBox={`0 0 ${dim.w} ${dim.h}`}>
                <polyline
                  points={lassoPts.map((pt) => `${pt.x + 0.5},${pt.y + 0.5}`).join(' ')}
                  fill="none"
                  stroke="#0000ff"
                  strokeWidth={1 / Math.max(0.5, zoom)}
                  strokeDasharray={`${3 / Math.max(0.5, zoom)} ${2 / Math.max(0.5, zoom)}`}
                />
              </svg>
            )}
          </div>
        </div>
      </div>

      <div className="paint-pal">
        <div className="colors-now sunken">
          <div className="cn-bg" style={{ background: bg }} />
          <div className="cn-fg" style={{ background: fg }} />
        </div>
        <div className="pal-grid">
          {PALETTE.map((c) => (
            <button
              key={c}
              className="pal-c sunken"
              style={{ background: c }}
              title={c}
              onClick={() => setFg(c)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setBg(c); }}
            />
          ))}
        </div>
        <label className="btn tool" title="Edit foreground colour" style={{ position: 'relative', marginLeft: 6 }}>
          Edit…
          <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }} />
        </label>
        {sel && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            <button className="btn tool" onClick={cropToSelection} title="Crop image to selection">Crop</button>
            <button className="btn tool" onClick={deleteSel} title="Delete selection (Del)">Del</button>
          </div>
        )}
      </div>

      <StatusBar>
        <span>
          {localFile ? `PC: ${localFile.name} — ` : fileId ? `C:\\ — ` : ''}
          {curveHint || TOOLS.find((t) => t[0] === tool)?.[1]}
          {sel ? ` | Sel: ${sel.w}x${sel.h} (${transparentSel ? 'Transparent' : 'Opaque'})` : ''}
        </span>
        <span style={{ minWidth: 68 }}>{pos ? `${pos.x}, ${pos.y}` : ''}</span>
        <span style={{ minWidth: 46 }}>{zoom}x</span>
        <span style={{ minWidth: 80 }}>{dim.w} x {dim.h}</span>
      </StatusBar>
    </div>
  );
}

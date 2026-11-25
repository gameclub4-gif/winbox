import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useOS } from '../os/OS.jsx';
import { MenuBar } from '../os/widgets.jsx';
import * as fs from '../os/fs.js';
import { pickLocalFiles, saveLocalFile } from '../os/localFiles.js';
import { fmtSize } from '../os/actions.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const ZOOM_PRESETS = [0.25, 0.41, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];

function escapePdfText(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildWelcomePdfBytes() {
  const enc = new TextEncoder();
  const pageContents = [
    [
      '0.80 0.00 0.00 rg 48 730 34 26 re f',
      '1 1 1 rg BT /F2 18 Tf 58 737 Td (A) Tj ET',
      '0.10 0.10 0.10 rg BT /F2 22 Tf 94 736 Td (Adobe Acrobat 5.0) Tj ET',
      '0.40 0.40 0.40 rg BT /F1 10 Tf 48 712 Td (Windows 95 Smart Edition - Built-in PDF, HTML, Text & Image Reader) Tj ET',
      '0.75 0.75 0.75 RG 1 w 48 702 m 564 702 l S',
      '0.00 0.00 0.50 rg BT /F2 13 Tf 48 676 Td (New Feature Highlights) Tj ET',
      '0.10 0.10 0.10 rg BT /F1 11 Tf 48 654 Td (Adobe Acrobat Reader 5.0 opens local PDF documents, HTML web packages,) Tj ET',
      'BT /F1 11 Tf 48 638 Td (plain text files, images, and remote .pdf web links using the built-in browser engine.) Tj ET',
      '0.00 0.00 0.50 rg BT /F2 12 Tf 48 604 Td (Workspace & Navigation Controls) Tj ET',
      '0.10 0.10 0.10 rg BT /F1 11 Tf 60 584 Td (* Bookmarks & Thumbnails tabs in the collapsible left navigation pane) Tj ET',
      'BT /F1 11 Tf 60 568 Td (* Zoom presets from 25% to 400%, plus Actual Size, Fit Page, and Fit Width) Tj ET',
      'BT /F1 11 Tf 60 552 Td (* Hand Tool drag-panning, Zoom click tool, and PDF Text Select tool) Tj ET',
      'BT /F1 11 Tf 60 536 Td (* Single Page and Continuous scrolling modes, plus 90-degree page rotation) Tj ET',
      '0.95 0.95 0.98 rg 48 426 516 86 re f 0.65 0.65 0.75 RG 1 w 48 426 516 86 re S',
      '0.00 0.00 0.50 rg BT /F2 11 Tf 62 490 Td (Quick Start:) Tj ET',
      '0.10 0.10 0.10 rg BT /F1 10 Tf 62 472 Td (1. Click "Open File" or drag & drop any .pdf, .html, .zip, .txt, or image file here.) Tj ET',
      'BT /F1 10 Tf 62 456 Td (2. Paste any remote https://.../file.pdf or web URL in the Location bar and press Go.) Tj ET',
      'BT /F1 10 Tf 62 440 Td (3. Use Thumbnails or Bookmarks on the left to jump between pages of this guide.) Tj ET',
      '0.45 0.45 0.45 rg BT /F1 9 Tf 48 44 Td (Adobe Acrobat Reader 5.0 Guide) Tj 470 0 Td (Page 1 of 3) Tj ET',
    ].join('\n'),
    [
      '0.80 0.00 0.00 rg BT /F2 14 Tf 48 738 Td (Supported Local File Formats) Tj ET',
      '0.75 0.75 0.75 RG 1 w 48 728 m 564 728 l S',
      '0.10 0.10 0.10 rg BT /F1 11 Tf 48 702 Td (Acrobat Reader 5.0 integrates cleanly with both your device and Virtual Drive C:\\) Tj ET',
      '0.00 0.00 0.50 rg BT /F2 12 Tf 48 668 Td (1. Portable Document Format (.pdf)) Tj ET',
      '0.10 0.10 0.10 rg BT /F1 11 Tf 60 648 Td (Multi-page rendering via PDF.js, outline bookmarks, live thumbnails, text copy, and search.) Tj ET',
      '0.00 0.00 0.50 rg BT /F2 12 Tf 48 614 Td (2. HTML Pages, RTF & Web ZIP Packages (.html, .htm, .rtf, .zip)) Tj ET',
      '0.10 0.10 0.10 rg BT /F1 11 Tf 60 594 Td (Renders local web documents with heading outlines extracted into the Bookmarks pane.) Tj ET',
      '0.00 0.00 0.50 rg BT /F2 12 Tf 48 560 Td (3. Plain Text & Developer Logs (.txt, .md, .log, .csv, .json, .xml)) Tj ET',
      '0.10 0.10 0.10 rg BT /F1 11 Tf 60 540 Td (Displays readable paper-formatted text with zoom and find support.) Tj ET',
      '0.00 0.00 0.50 rg BT /F2 12 Tf 48 506 Td (4. Raster & Vector Images (.png, .jpg, .gif, .bmp, .webp, .svg)) Tj ET',
      '0.10 0.10 0.10 rg BT /F1 11 Tf 60 486 Td (Inspect artwork with zoom levels, 90-degree rotation, and Fit Page / Fit Width.) Tj ET',
      '0.45 0.45 0.45 rg BT /F1 9 Tf 48 44 Td (Adobe Acrobat Reader 5.0 Guide) Tj 470 0 Td (Page 2 of 3) Tj ET',
    ].join('\n'),
    [
      '0.80 0.00 0.00 rg BT /F2 14 Tf 48 738 Td (Remote .pdf Links & Browser Engine) Tj ET',
      '0.75 0.75 0.75 RG 1 w 48 728 m 564 728 l S',
      '0.10 0.10 0.10 rg BT /F1 11 Tf 48 702 Td (Enter any URL into the Acrobat Location bar to fetch documents through the built-in) Tj ET',
      'BT /F1 11 Tf 48 686 Td (Compatibility Browser Engine (/api/browse):) Tj ET',
      'BT /F1 11 Tf 60 658 Td (* Direct .pdf URLs are automatically streamed and rendered inside Acrobat Reader 5.0.) Tj ET',
      'BT /F1 11 Tf 60 640 Td (* Web pages load inside the built-in browser frame with heading Bookmarks extracted.) Tj ET',
      'BT /F1 11 Tf 60 622 Td (* Clicking a .pdf link on a loaded web page opens it directly in Acrobat Reader 5.0.) Tj ET',
      '0.00 0.00 0.50 rg BT /F2 12 Tf 48 584 Td (Keyboard Shortcuts) Tj ET',
      '0.10 0.10 0.10 rg BT /F1 11 Tf 60 564 Td (Ctrl+O : Open local file/PDF     Ctrl+F : Find text     Ctrl+G : Go to page) Tj ET',
      'BT /F1 11 Tf 60 546 Td (PgUp / PgDn : Previous / Next page   F6 : Toggle Navigation Pane) Tj ET',
      '0.45 0.45 0.45 rg BT /F1 9 Tf 48 44 Td (Adobe Acrobat Reader 5.0 Guide) Tj 470 0 Td (Page 3 of 3) Tj ET',
    ].join('\n'),
  ];

  // Object layout:
  // 1: Catalog
  // 2: Pages
  // 3,4,5: Page 1..3
  // 6,7,8: Content streams 1..3
  // 9: Font Helvetica, 10: Font Helvetica-Bold
  // 11: Outlines root
  // 12..15: Outline items
  const objs = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Outlines 11 0 R /PageMode /UseOutlines >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R /F2 10 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R /F2 10 0 R >> >> /Contents 7 0 R >>\nendobj\n',
    '5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 9 0 R /F2 10 0 R >> >> /Contents 8 0 R >>\nendobj\n',
    ...pageContents.map((stream, i) => `${6 + i} 0 obj\n<< /Length ${enc.encode(stream).byteLength} >>\nstream\n${stream}\nendstream\nendobj\n`),
    '9 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '10 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    '11 0 obj\n<< /Type /Outlines /First 12 0 R /Last 15 0 R /Count 4 >>\nendobj\n',
    `12 0 obj\n<< /Title (${escapePdfText('Adobe Acrobat 5.0 Welcome')}) /Parent 11 0 R /Next 13 0 R /Dest [3 0 R /Fit] >>\nendobj\n`,
    `13 0 obj\n<< /Title (${escapePdfText('New Feature Highlights')}) /Parent 11 0 R /Prev 12 0 R /Next 14 0 R /Dest [3 0 R /XYZ 0 690 0] >>\nendobj\n`,
    `14 0 obj\n<< /Title (${escapePdfText('Supported Local Formats')}) /Parent 11 0 R /Prev 13 0 R /Next 15 0 R /Dest [4 0 R /Fit] >>\nendobj\n`,
    `15 0 obj\n<< /Title (${escapePdfText('Remote PDF & Web Engine')}) /Parent 11 0 R /Prev 14 0 R /Dest [5 0 R /Fit] >>\nendobj\n`,
  ];

  const chunks = [];
  const offsets = [0];
  let len = 0;
  const pushStr = (s) => {
    const b = enc.encode(s);
    chunks.push(b);
    len += b.byteLength;
  };
  pushStr('%PDF-1.4\n');
  for (const obj of objs) {
    offsets.push(len);
    pushStr(obj);
  }
  const xrefPos = len;
  pushStr(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i++) {
    pushStr(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  }
  pushStr(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

  const out = new Uint8Array(len);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  return out;
}

async function openPdfDoc(bytes) {
  const copy1 = new Uint8Array(bytes.slice ? bytes.slice(0) : bytes);
  try {
    return await pdfjsLib.getDocument({ data: copy1 }).promise;
  } catch (workerErr) {
    const copy2 = new Uint8Array(bytes.slice ? bytes.slice(0) : bytes);
    try {
      return await pdfjsLib.getDocument({ data: copy2, disableWorkerRendering: true }).promise;
    } catch {
      throw workerErr;
    }
  }
}

async function resolveOutlineTree(doc, items, depth = 0) {
  if (!Array.isArray(items) || !items.length || depth > 4) return [];
  const out = [];
  for (const it of items) {
    let page = null;
    try {
      let dest = it.dest;
      if (typeof dest === 'string') dest = await doc.getDestination(dest);
      if (Array.isArray(dest) && dest[0]) {
        const idx = await doc.getPageIndex(dest[0]);
        page = idx + 1;
      }
    } catch { /* ignore unresolved outline dest */ }
    const children = await resolveOutlineTree(doc, it.items, depth + 1);
    out.push({ title: it.title || 'Untitled Bookmark', page, children });
  }
  return out;
}

function extractHtmlHeadings(htmlText) {
  try {
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    const nodes = [...doc.querySelectorAll('h1, h2, h3, h4')].slice(0, 80);
    return nodes
      .map((el, idx) => ({
        title: (el.textContent || '').trim().replace(/\s+/g, ' '),
        level: Number(el.tagName.slice(1)) || 1,
        id: el.id || '',
        index: idx,
      }))
      .filter((x) => x.title);
  } catch {
    return [];
  }
}

function normalizeUrlInput(raw) {
  const t = (raw || '').trim();
  if (!t) return '';
  if (/^(https?:\/\/)/i.test(t)) return t;
  if (/^localhost(:\d+)?([/?#].*)?$/i.test(t)) return 'http://' + t;
  return 'https://' + t;
}

// --- Tiny crisp Adobe 5.0 SVG icons for toolbars ---
function AdobeBadge() {
  return (
    <div className="acr-adobe-badge" title="Adobe Acrobat Reader 5.0">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="0" y="0" width="24" height="24" fill="#cc0000" />
        <path
          d="M12.1 4.2c1.1 0 1.2 3.1-.3 6.2-1.4 2.9-4.1 5.6-5.6 4.9-1.1-.5.4-2.3 3.3-3.4 3.4-1.3 8-1.2 9.6.4 1 .9-.1 2.2-1.9 1.5-1.8-.7-4-3.9-5.2-7.4-.4-1.2-.3-2.2.1-2.2z"
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
        />
        <text x="12" y="21.5" fontSize="5.2" fontWeight="bold" textAnchor="middle" fill="#fff" fontFamily="Arial, sans-serif">ADOBE</text>
      </svg>
    </div>
  );
}

function PdfPageView({
  pdfDoc,
  pageNum,
  scale,
  rotation,
  textSelectMode,
  findQuery,
  registerRef,
  onDims,
}) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [textItems, setTextItems] = useState([]);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      try {
        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch { /* ignore */ }
        }
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled || !canvasRef.current) return;
        const baseVp = page.getViewport({ scale: 1, rotation });
        onDims?.(pageNum, { wIn: baseVp.width / 72, hIn: baseVp.height / 72, wPt: baseVp.width, hPt: baseVp.height });

        const vp = page.getViewport({ scale, rotation });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cv = canvasRef.current;
        const cssW = Math.max(1, Math.floor(vp.width));
        const cssH = Math.max(1, Math.floor(vp.height));
        cv.width = Math.max(1, Math.floor(vp.width * dpr));
        cv.height = Math.max(1, Math.floor(vp.height * dpr));
        cv.style.width = `${cssW}px`;
        cv.style.height = `${cssH}px`;
        setBox({ w: cssW, h: cssH });

        const task = page.render({
          canvas: cv,
          viewport: vp,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        renderTaskRef.current = task;
        await task.promise;

        if (!cancelled && (textSelectMode || findQuery)) {
          const tc = await page.getTextContent();
          if (cancelled) return;
          const mapped = [];
          for (const item of tc.items || []) {
            if (!item.str) continue;
            const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
            const fh = Math.max(6, Math.hypot(tx[0], tx[1]));
            const left = tx[4];
            const top = tx[5] - fh * 0.85;
            const width = Math.max(2, (item.width || 0) * scale);
            mapped.push({
              str: item.str,
              left,
              top,
              fontSize: fh,
              width,
            });
          }
          setTextItems(mapped);
        } else if (!cancelled) {
          setTextItems([]);
        }
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') {
          // ignore cancelled renders cleanly
        }
      }
    })();
    return () => {
      cancelled = true;
      try { renderTaskRef.current?.cancel?.(); } catch { /* ignore */ }
    };
  }, [pdfDoc, pageNum, scale, rotation, textSelectMode, findQuery, onDims]);

  const qLower = (findQuery || '').trim().toLowerCase();

  return (
    <div
      ref={(el) => registerRef?.(pageNum, el)}
      data-page={pageNum}
      className="acr-page-sheet"
      style={box.w ? { width: box.w, height: box.h } : undefined}
    >
      <canvas ref={canvasRef} className="acr-pdf-canvas" />
      {(textSelectMode || qLower) && textItems.length > 0 && (
        <div className={'acr-text-layer ' + (textSelectMode ? 'active' : '')}>
          {textItems.map((it, idx) => {
            const match = qLower && it.str.toLowerCase().includes(qLower);
            return (
              <span
                key={idx}
                className={match ? 'acr-hl' : ''}
                style={{
                  left: it.left,
                  top: it.top,
                  fontSize: it.fontSize,
                  minWidth: it.width,
                }}
              >
                {it.str}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PdfThumb({ pdfDoc, pageNum, selected, onSelect }) {
  const cvRef = useRef(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    setRendered(false);
    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled || !cvRef.current) return;
        const base = page.getViewport({ scale: 1 });
        const sc = Math.min(98 / base.width, 130 / base.height);
        const vp = page.getViewport({ scale: sc });
        const cv = cvRef.current;
        cv.width = Math.max(1, Math.floor(vp.width));
        cv.height = Math.max(1, Math.floor(vp.height));
        await page.render({ canvas: cv, viewport: vp }).promise;
        if (!cancelled) setRendered(true);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]);

  return (
    <button
      type="button"
      className={'acr-thumb-item ' + (selected ? 'sel' : '')}
      onClick={() => onSelect(pageNum)}
      title={`Go to page ${pageNum}`}
    >
      <div className="acr-thumb-frame">
        <canvas ref={cvRef} style={{ opacity: rendered ? 1 : 0.2 }} />
      </div>
      <span className="acr-thumb-num">{pageNum}</span>
    </button>
  );
}

function BookmarkNode({ item, onJump, depth = 0 }) {
  const [open, setOpen] = useState(depth < 1);
  const hasKids = item.children?.length > 0;
  return (
    <div className="acr-bm-node">
      <div
        className="acr-bm-row"
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={() => {
          if (item.page) onJump(item.page, item);
          else if (item.index !== undefined) onJump(item.index, item);
        }}
        title={item.title}
      >
        {hasKids ? (
          <span
            className="acr-bm-exp"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          >
            {open ? '▾' : '▸'}
          </span>
        ) : (
          <span className="acr-bm-doc">📄</span>
        )}
        <span className="acr-bm-lbl">{item.title}</span>
        {item.page && <span className="acr-bm-pg">{item.page}</span>}
      </div>
      {hasKids && open && item.children.map((ch, i) => (
        <BookmarkNode key={i} item={ch} onJump={onJump} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function AcrobatReader({ win, props }) {
  const os = useOS();
  const [docState, setDocState] = useState(null); // { kind: 'pdf'|'html'|'text'|'image'|'error', name, source, url, blob, blobUrl, bytes, text, html, headings, size, mime, error }
  const [loading, setLoading] = useState(false);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [zoomMode, setZoomMode] = useState('custom'); // 'custom' | 'fit-page' | 'fit-width'
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [layoutMode, setLayoutMode] = useState('single'); // 'single' | 'continuous'
  const [activeTool, setActiveTool] = useState('hand'); // 'hand' | 'zoom' | 'text'
  const [navOpen, setNavOpen] = useState(true);
  const [navTab, setNavTab] = useState('thumbnails'); // 'bookmarks' | 'thumbnails' | 'comments' | 'signatures'
  const [outlines, setOutlines] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [pageDims, setPageDims] = useState({ wIn: 8.5, hIn: 11, wPt: 612, hPt: 792 });
  const [addrInput, setAddrInput] = useState('');
  const [showAddrBar, setShowAddrBar] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findHits, setFindHits] = useState([]);
  const [findIdx, setFindIdx] = useState(-1);
  const [history, setHistory] = useState({ list: [], i: -1 });
  const [vpSize, setVpSize] = useState({ w: 560, h: 420 });
  const [imgDims, setImgDims] = useState({ w: 600, h: 400 });
  const [panning, setPanning] = useState(false);

  const viewportRef = useRef(null);
  const htmlFrameRef = useRef(null);
  const pageRefs = useRef(new Map());
  const blobUrlsRef = useRef([]);
  const panStateRef = useRef(null);
  const pdfDocRef = useRef(null);

  const cleanupBlobs = useCallback(() => {
    blobUrlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } });
    blobUrlsRef.current = [];
  }, []);

  useEffect(() => () => {
    cleanupBlobs();
    try { pdfDocRef.current?.destroy?.(); } catch { /* ignore */ }
  }, [cleanupBlobs]);

  const regBlobUrl = useCallback((blob) => {
    const u = URL.createObjectURL(blob);
    blobUrlsRef.current.push(u);
    return u;
  }, []);

  // Measure viewport for Fit Page / Fit Width calculations
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setVpSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [navOpen]);

  // Compute effective zoom scale
  const effectiveScale = useMemo(() => {
    if (zoomMode === 'custom') return zoom;
    const availW = Math.max(120, vpSize.w - 36);
    const availH = Math.max(120, vpSize.h - 36);
    const refW = docState?.kind === 'image' ? imgDims.w : (pageDims.wPt || 612);
    const refH = docState?.kind === 'image' ? imgDims.h : (pageDims.hPt || 792);
    if (zoomMode === 'fit-width') return Math.max(0.2, Math.min(4, +(availW / refW).toFixed(2)));
    return Math.max(0.2, Math.min(4, +Math.min(availW / refW, availH / refH).toFixed(2)));
  }, [zoomMode, zoom, vpSize, pageDims, imgDims, docState?.kind]);

  const updateWindowTitle = useCallback((name) => {
    os.setTitle(win.id, name ? `Adobe Acrobat - [${name}]` : 'Adobe Acrobat Reader 5.0', 'acrobat');
  }, [os, win.id]);

  const loadBlobDocument = useCallback(async (blob, filename, opts = {}) => {
    const { source = 'Local PC', url = '', pushHist = true } = opts;
    setLoading(true);
    setFindHits([]);
    setFindIdx(-1);
    setOutlines([]);
    setAnnotations([]);
    setRotation(0);

    try { pdfDocRef.current?.destroy?.(); } catch { /* ignore */ }
    pdfDocRef.current = null;
    setPdfDoc(null);
    setNumPages(0);
    setPageNum(1);
    setPageInput('1');

    const ext = fs.ext(filename);
    let kind = 'text';
    let docBlob = blob;
    let text = '';
    let html = '';
    let headings = [];

    let isPdf = ext === 'pdf' || blob.type === 'application/pdf';
    if (!isPdf && blob.size >= 5) {
      try {
        const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
        if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2d) {
          isPdf = true;
        }
      } catch { /* ignore */ }
    }

    try {
      if (isPdf) {
        kind = 'pdf';
        docBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
        const bytes = new Uint8Array(await docBlob.arrayBuffer());
        const doc = await openPdfDoc(bytes);
        pdfDocRef.current = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPageNum(1);
        setPageInput('1');

        const rawOutline = await doc.getOutline().catch(() => null);
        const tree = await resolveOutlineTree(doc, rawOutline);
        setOutlines(tree);
        if (tree.length > 0 && !opts.keepTab) setNavTab('bookmarks');
        else if (!opts.keepTab) setNavTab('thumbnails');

        // Inspect annotations on first up to 12 pages
        const annList = [];
        for (let p = 1; p <= Math.min(doc.numPages, 12); p++) {
          const pg = await doc.getPage(p);
          const anns = await pg.getAnnotations().catch(() => []);
          for (const a of anns) {
            if (a.contents || a.title || a.subtype === 'Text' || a.subtype === 'Highlight' || a.subtype === 'Widget') {
              annList.push({
                page: p,
                subtype: a.subtype || 'Note',
                author: a.title || 'Author',
                text: a.contents || a.fieldName || a.url || '(Annotation)',
              });
            }
          }
        }
        setAnnotations(annList);
      } else if (ext === 'zip') {
        const { extractHtmlFromZip } = await import('../utils/htmlZip.js');
        const { wrapStandaloneHtml } = await import('../utils/rtf.js');
        const extracted = extractHtmlFromZip(new Uint8Array(await blob.arrayBuffer()), filename);
        html = wrapStandaloneHtml(extracted.html, extracted.title);
        headings = extractHtmlHeadings(html);
        docBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
        kind = 'html';
      } else if (ext === 'rtf' || blob.type === 'application/rtf') {
        const { rtfToHtml, wrapStandaloneHtml } = await import('../utils/rtf.js');
        html = wrapStandaloneHtml(rtfToHtml(await blob.text()), filename);
        headings = extractHtmlHeadings(html);
        docBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
        kind = 'html';
      } else if (['html', 'htm', 'xhtml', 'mhtml'].includes(ext) || blob.type === 'text/html' || blob.type === 'application/xhtml+xml') {
        kind = 'html';
        html = opts.htmlOverride ?? await blob.text();
        headings = extractHtmlHeadings(html);
        docBlob = new Blob([html], { type: 'text/html;charset=utf-8' });
      } else if (ext === 'svg' || blob.type === 'image/svg+xml') {
        kind = 'image';
        docBlob = blob.type === 'image/svg+xml' ? blob : new Blob([blob], { type: 'image/svg+xml' });
      } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif'].includes(ext) || blob.type?.startsWith('image/')) {
        kind = 'image';
      } else {
        const sample = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
        if (sample.includes(0)) {
          throw new Error(`Unsupported binary file format (${filename}).`);
        }
        kind = 'text';
        text = await blob.text();
      }

      const blobUrl = regBlobUrl(docBlob);
      const nextDoc = {
        kind,
        name: filename,
        source,
        url,
        blob: docBlob,
        blobUrl,
        text,
        html,
        headings,
        size: docBlob.size || blob.size,
        mime: docBlob.type || blob.type || 'application/octet-stream',
      };
      setDocState(nextDoc);
      updateWindowTitle(filename);
      if (url) setAddrInput(url);
      if (pushHist) {
        setHistory((h) => {
          const entry = url
            ? { kind: 'url', url, name: filename }
            : { kind: 'blob', blob: docBlob, name: filename, source };
          const list = [...h.list.slice(0, h.i + 1), entry].slice(-20);
          return { list, i: list.length - 1 };
        });
      }
      if (!isPdf && kind === 'html' && headings.length) {
        setOutlines(headings.map((hd) => ({ title: hd.title, index: hd.index, id: hd.id, children: [] })));
        if (!opts.keepTab) setNavTab('bookmarks');
      } else if (!isPdf) {
        setOutlines([{ title: filename, page: 1, children: [] }]);
      }
    } catch (e) {
      setDocState({
        kind: 'error',
        name: filename,
        source,
        url,
        error: e?.message || 'Could not open this document.',
      });
      updateWindowTitle(filename);
    } finally {
      setLoading(false);
    }
  }, [regBlobUrl, updateWindowTitle]);

  const openRemoteUrl = useCallback(async (rawUrl, pushHist = true) => {
    const targetUrl = normalizeUrlInput(rawUrl);
    if (!targetUrl) return;
    setAddrInput(targetUrl);
    setShowAddrBar(true);
    setLoading(true);
    try {
      const res = await fetch('/api/browse?url=' + encodeURIComponent(targetUrl));
      const finalUrl = res.headers.get('X-Final-Url') || targetUrl;
      const ctype = (res.headers.get('Content-Type') || '').toLowerCase();
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText && !errText.startsWith('<') ? errText : `Server returned HTTP ${res.status}`);
      }

      const rawName = decodeURIComponent(finalUrl.split('?')[0].split('/').pop() || '');
      const isPdfHint = ctype.includes('application/pdf') || /\.pdf([?#].*)?$/i.test(finalUrl);

      if (isPdfHint) {
        const blob = await res.blob();
        const fname = rawName && /\.pdf$/i.test(rawName) ? rawName : (rawName || 'document') + '.pdf';
        await loadBlobDocument(new Blob([blob], { type: 'application/pdf' }), fname, {
          source: 'Browser Engine',
          url: finalUrl,
          pushHist,
        });
        return;
      }

      if (ctype.includes('image/')) {
        const blob = await res.blob();
        const ext = (ctype.split('/')[1] || 'png').split(';')[0];
        const fname = rawName || `image.${ext}`;
        await loadBlobDocument(blob, fname, { source: 'Browser Engine', url: finalUrl, pushHist });
        return;
      }

      if (ctype.includes('text/plain')) {
        const blob = await res.blob();
        await loadBlobDocument(blob, rawName || 'document.txt', { source: 'Browser Engine', url: finalUrl, pushHist });
        return;
      }

      // Check raw bytes first in case a server served PDF without application/pdf header
      const buf = await res.arrayBuffer();
      const head = new Uint8Array(buf.slice(0, 5));
      if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2d) {
        const fname = rawName && /\.pdf$/i.test(rawName) ? rawName : (rawName || 'document') + '.pdf';
        await loadBlobDocument(new Blob([buf], { type: 'application/pdf' }), fname, {
          source: 'Browser Engine',
          url: finalUrl,
          pushHist,
        });
        return;
      }

      const htmlText = new TextDecoder('utf-8', { fatal: false }).decode(buf);
      let pageTitle = rawName;
      try {
        const parsed = new DOMParser().parseFromString(htmlText, 'text/html');
        if (parsed.title?.trim()) pageTitle = parsed.title.trim();
      } catch { /* ignore */ }
      const fname = pageTitle || new URL(finalUrl).hostname || 'Web Page.html';
      await loadBlobDocument(new Blob([htmlText], { type: 'text/html;charset=utf-8' }), fname, {
        source: 'Browser Engine',
        url: finalUrl,
        htmlOverride: htmlText,
        pushHist,
      });
    } catch (e) {
      setLoading(false);
      setDocState({
        kind: 'error',
        name: targetUrl,
        source: 'Browser Engine',
        url: targetUrl,
        error: e?.message || 'Unable to open web link.',
      });
      updateWindowTitle(targetUrl);
    }
  }, [loadBlobDocument, updateWindowTitle]);

  const openWelcomePdf = useCallback(() => {
    const bytes = buildWelcomePdfBytes();
    loadBlobDocument(new Blob([bytes], { type: 'application/pdf' }), 'Acrobat 5.0 Welcome.pdf', {
      source: 'Built-in Guide',
      keepTab: true,
    });
  }, [loadBlobDocument]);

  // Initial load from props or built-in Welcome PDF
  useEffect(() => {
    if (props?.fsNodeId) {
      const n = fs.get(props.fsNodeId);
      if (n) {
        loadBlobDocument(fs.toBlob(n), n.name, { source: fs.pathOf(n.id) });
        return;
      }
    }
    if (props?.localBlob && props?.localName) {
      loadBlobDocument(props.localBlob, props.localName, { source: 'Local PC' });
      return;
    }
    if (props?.url) {
      openRemoteUrl(props.url);
      return;
    }
    openWelcomePdf();
  }, [win.nonce]); // eslint-disable-line

  // Intercept links clicked inside proxied HTML pages rendered via /api/browse
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === 'win95-browser-nav' && typeof e.data.url === 'string') {
        if (docState?.kind === 'html' && docState?.url) {
          openRemoteUrl(e.data.url);
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [docState?.kind, docState?.url, openRemoteUrl]);

  const goToPage = useCallback((p) => {
    if (!numPages) return;
    const target = Math.max(1, Math.min(numPages, Number(p) || 1));
    setPageNum(target);
    setPageInput(String(target));
    if (layoutMode === 'continuous') {
      const el = pageRefs.current.get(target);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (viewportRef.current) {
      viewportRef.current.scrollTop = 0;
    }
  }, [numPages, layoutMode]);

  const onBookmarkJump = useCallback((dest, item) => {
    if (docState?.kind === 'pdf' && typeof dest === 'number') {
      goToPage(dest);
    } else if (docState?.kind === 'html') {
      try {
        const fdoc = htmlFrameRef.current?.contentDocument;
        if (fdoc) {
          const targetEl = item?.id
            ? fdoc.getElementById(item.id)
            : fdoc.querySelectorAll('h1, h2, h3, h4')[item?.index || 0];
          targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } catch { /* ignore */ }
    }
  }, [docState?.kind, goToPage]);

  const openLocalFromPC = async () => {
    const picked = await pickLocalFiles({
      accept: '.pdf,.html,.htm,.xhtml,.zip,.rtf,.txt,.md,.log,.csv,.json,.xml,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,application/pdf,text/html,text/plain,image/*',
      types: [
        {
          description: 'Documents, PDFs, Web & Images',
          accept: {
            'application/pdf': ['.pdf'],
            'text/html': ['.html', '.htm', '.xhtml'],
            'application/zip': ['.zip'],
            'application/rtf': ['.rtf'],
            'text/plain': ['.txt', '.md', '.log', '.csv', '.json', '.xml'],
            'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'],
          },
        },
      ],
    });
    if (picked?.file) {
      await loadBlobDocument(picked.file, picked.name, { source: 'Local PC' });
    }
  };

  const openFromDriveC = async () => {
    const n = await os.fileDialog({ mode: 'open', title: 'Open in Acrobat Reader 5.0 (Drive C:)' });
    if (n) await loadBlobDocument(fs.toBlob(n), n.name, { source: fs.pathOf(n.id) });
  };

  const promptOpenUrl = async () => {
    const val = await os.prompt({
      title: 'Open Web Location / PDF',
      label: 'Enter a remote .pdf link or web page URL (opened via built-in browser engine):',
      value: addrInput || 'https://',
    });
    if (val) openRemoteUrl(val);
  };

  const saveCopy = async () => {
    if (!docState?.blob) return;
    await saveLocalFile({
      data: docState.blob,
      name: docState.name || 'document.pdf',
      mime: docState.mime || 'application/pdf',
    });
  };

  const goBack = () => {
    if (history.i <= 0) return;
    const idx = history.i - 1;
    const item = history.list[idx];
    setHistory((h) => ({ ...h, i: idx }));
    if (item.kind === 'url') openRemoteUrl(item.url, false);
    else loadBlobDocument(item.blob, item.name, { source: item.source, pushHist: false });
  };

  const goForward = () => {
    if (history.i >= history.list.length - 1) return;
    const idx = history.i + 1;
    const item = history.list[idx];
    setHistory((h) => ({ ...h, i: idx }));
    if (item.kind === 'url') openRemoteUrl(item.url, false);
    else loadBlobDocument(item.blob, item.name, { source: item.source, pushHist: false });
  };

  const runFind = useCallback(async (direction = 1) => {
    const q = findQuery.trim().toLowerCase();
    if (!q) { setFindHits([]); setFindIdx(-1); return; }

    if (docState?.kind === 'pdf' && pdfDoc) {
      const hits = [];
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const pg = await pdfDoc.getPage(p);
        const tc = await pg.getTextContent();
        const combined = (tc.items || []).map((it) => it.str).join(' ').toLowerCase();
        if (combined.includes(q)) hits.push(p);
      }
      setFindHits(hits);
      if (!hits.length) {
        os.msg({ icon: 'info', title: 'Find', text: `Acrobat has finished searching the document. "${findQuery}" was not found.` });
        setFindIdx(-1);
        return;
      }
      const nextIdx = findIdx < 0 ? 0 : (findIdx + direction + hits.length) % hits.length;
      setFindIdx(nextIdx);
      goToPage(hits[nextIdx]);
    } else if (docState?.kind === 'text') {
      const idx = docState.text.toLowerCase().indexOf(q);
      if (idx < 0) os.msg({ icon: 'info', title: 'Find', text: `"${findQuery}" was not found.` });
    }
  }, [findQuery, docState, pdfDoc, findIdx, goToPage, os]);

  const copySelectedOrAll = async () => {
    const sel = window.getSelection?.()?.toString();
    let txt = sel || '';
    if (!txt && docState?.kind === 'text') txt = docState.text;
    if (!txt && docState?.kind === 'pdf' && pdfDoc) {
      const pg = await pdfDoc.getPage(pageNum);
      const tc = await pg.getTextContent();
      txt = (tc.items || []).map((i) => i.str).join(' ');
    }
    if (txt) {
      try { await navigator.clipboard.writeText(txt); } catch { /* ignore */ }
    }
  };

  const showProperties = () => {
    if (!docState) return;
    os.msg({
      icon: 'info',
      title: 'Document Properties',
      width: 390,
      text: [
        `File Name: ${docState.name}`,
        `Document Type: ${(docState.kind || 'unknown').toUpperCase()}`,
        `Source: ${docState.source || 'Local'}`,
        docState.url ? `Location: ${docState.url}` : null,
        docState.size ? `File Size: ${fmtSize(docState.size)}` : null,
        docState.kind === 'pdf' ? `Pages: ${numPages}` : null,
        docState.kind === 'pdf' ? `Page Size: ${pageDims.wIn.toFixed(1)} x ${pageDims.hIn.toFixed(1)} in` : null,
        docState.kind === 'image' ? `Dimensions: ${imgDims.w} x ${imgDims.h} px` : null,
      ].filter(Boolean).join('\n'),
    });
  };

  const showAbout = () => {
    os.msg({
      icon: 'info',
      title: 'About Adobe Acrobat Reader 5.0',
      width: 400,
      text: 'Adobe Acrobat Reader 5.0\nWindows 95 Smart Edition\n\n• Built-in PDF.js renderer with Bookmarks & Page Thumbnails\n• Supports local PDFs, HTML, ZIP web packages, RTF, TXT, and images\n• Supports remote .pdf web links & web pages via the built-in Browser Engine',
    });
  };

  const stepZoom = (dir) => {
    const cur = effectiveScale;
    setZoomMode('custom');
    if (dir > 0) {
      const next = ZOOM_PRESETS.find((z) => z > cur + 0.01) || Math.min(4, +(cur + 0.25).toFixed(2));
      setZoom(next);
    } else {
      const prev = [...ZOOM_PRESETS].reverse().find((z) => z < cur - 0.01) || Math.max(0.25, +(cur - 0.25).toFixed(2));
      setZoom(prev);
    }
  };

  const onSelectZoomOption = (val) => {
    if (val === 'fit-page' || val === 'fit-width') {
      setZoomMode(val);
    } else {
      const n = parseFloat(val);
      if (!Number.isNaN(n)) {
        setZoomMode('custom');
        setZoom(Math.max(0.25, Math.min(4, n)));
      }
    }
  };

  const onViewportPointerDown = (e) => {
    if (activeTool === 'hand' && e.button === 0 && docState?.kind !== 'html') {
      const vp = viewportRef.current;
      if (!vp) return;
      panStateRef.current = {
        sx: e.clientX,
        sy: e.clientY,
        sl: vp.scrollLeft,
        st: vp.scrollTop,
      };
      setPanning(true);
    } else if (activeTool === 'zoom' && (e.button === 0 || e.button === 2) && docState?.kind !== 'html') {
      e.preventDefault();
      stepZoom(e.button === 2 || e.shiftKey ? -1 : 1);
    }
  };

  useEffect(() => {
    if (!panning) return;
    const onMove = (e) => {
      const p = panStateRef.current;
      const vp = viewportRef.current;
      if (!p || !vp) return;
      vp.scrollLeft = p.sl - (e.clientX - p.sx);
      vp.scrollTop = p.st - (e.clientY - p.sy);
    };
    const onUp = () => {
      panStateRef.current = null;
      setPanning(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [panning]);

  const onContinuousScroll = () => {
    if (layoutMode !== 'continuous' || docState?.kind !== 'pdf' || !viewportRef.current) return;
    const vpTop = viewportRef.current.getBoundingClientRect().top + 48;
    let bestPage = pageNum;
    let bestDist = Infinity;
    for (let p = 1; p <= numPages; p++) {
      const el = pageRefs.current.get(p);
      if (!el) continue;
      const d = Math.abs(el.getBoundingClientRect().top - vpTop);
      if (d < bestDist) { bestDist = d; bestPage = p; }
    }
    if (bestPage !== pageNum) {
      setPageNum(bestPage);
      setPageInput(String(bestPage));
    }
  };

  const onPageDims = useCallback((pg, dims) => {
    if (pg === pageNum) setPageDims(dims);
  }, [pageNum]);

  const openInBrowserEngine = () => {
    if (!docState) return;
    if (docState.url) os.open('browser', { url: docState.url });
    else if (docState.blob) os.open('browser', { localBlob: docState.blob, localName: docState.name });
  };

  const onDropFile = async (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    await loadBlobDocument(f, f.name, { source: 'Dropped File' });
  };

  const onContextViewport = (e) => {
    if (activeTool === 'text' && window.getSelection?.()?.toString()) return;
    e.preventDefault();
    e.stopPropagation();
    os.showMenu(e.clientX, e.clientY, [
      { label: '&Hand Tool', radio: true, checked: activeTool === 'hand', onClick: () => setActiveTool('hand') },
      { label: '&Zoom Tool', radio: true, checked: activeTool === 'zoom', onClick: () => setActiveTool('zoom') },
      { label: '&Text Select Tool', radio: true, checked: activeTool === 'text', onClick: () => setActiveTool('text') },
      { sep: true },
      { label: '&Copy Text', disabled: docState?.kind === 'image', onClick: copySelectedOrAll },
      { sep: true },
      { label: '&Actual Size (100%)', onClick: () => { setZoomMode('custom'); setZoom(1); } },
      { label: 'Fit &Page', onClick: () => setZoomMode('fit-page') },
      { label: 'Fit &Width', onClick: () => setZoomMode('fit-width') },
      { sep: true },
      { label: '&Previous Page', disabled: pageNum <= 1, onClick: () => goToPage(pageNum - 1) },
      { label: '&Next Page', disabled: pageNum >= numPages, onClick: () => goToPage(pageNum + 1) },
      { label: '&Rotate Clockwise', onClick: () => setRotation((r) => (r + 90) % 360) },
      { sep: true },
      { label: 'Document &Properties...', onClick: showProperties },
    ]);
  };

  const menus = [
    {
      label: '&File',
      items: [
        { label: '&Open Local File / PDF...', shortcut: 'Ctrl+O', onClick: openLocalFromPC },
        { label: 'Open from Drive &C:...', onClick: openFromDriveC },
        { label: 'Open &Web URL / Remote .pdf...', onClick: promptOpenUrl },
        { label: 'Open Welcome &Guide', onClick: openWelcomePdf },
        { sep: true },
        { label: '&Save a Copy...', disabled: !docState?.blob, onClick: saveCopy },
        { label: 'Open in Internet &Browser', disabled: !docState, onClick: openInBrowserEngine },
        { sep: true },
        { label: 'Document &Properties...', disabled: !docState, onClick: showProperties },
        { sep: true },
        { label: 'E&xit', onClick: () => os.close(win.id) },
      ],
    },
    {
      label: '&Edit',
      items: [
        { label: '&Copy', shortcut: 'Ctrl+C', onClick: copySelectedOrAll },
        { sep: true },
        { label: '&Find...', shortcut: 'Ctrl+F', onClick: () => setShowFind((s) => !s) },
        { label: 'Find &Next', shortcut: 'F3', disabled: !findQuery.trim(), onClick: () => runFind(1) },
      ],
    },
    {
      label: '&Document',
      items: [
        { label: '&First Page', disabled: pageNum <= 1, onClick: () => goToPage(1) },
        { label: '&Previous Page', disabled: pageNum <= 1, onClick: () => goToPage(pageNum - 1) },
        { label: '&Next Page', disabled: pageNum >= numPages, onClick: () => goToPage(pageNum + 1) },
        { label: '&Last Page', disabled: pageNum >= numPages, onClick: () => goToPage(numPages) },
        {
          label: '&Go to Page...',
          shortcut: 'Ctrl+G',
          disabled: numPages < 2,
          onClick: async () => {
            const p = await os.prompt({ title: 'Go to Page', label: `Enter page number (1 - ${numPages}):`, value: String(pageNum) });
            if (p) goToPage(p);
          },
        },
        { sep: true },
        { label: 'Rotate &Clockwise', onClick: () => setRotation((r) => (r + 90) % 360) },
        { label: 'Rotate Counterc&lockwise', onClick: () => setRotation((r) => (r + 270) % 360) },
      ],
    },
    {
      label: '&Tools',
      items: [
        { label: '&Hand Tool', radio: true, checked: activeTool === 'hand', onClick: () => setActiveTool('hand') },
        { label: '&Zoom Tool', radio: true, checked: activeTool === 'zoom', onClick: () => setActiveTool('zoom') },
        { label: '&Text Select Tool', radio: true, checked: activeTool === 'text', onClick: () => setActiveTool('text') },
        { sep: true },
        { label: 'Show &Navigation Pane', shortcut: 'F6', checked: navOpen, onClick: () => setNavOpen((o) => !o) },
        { label: 'Show &Web Address Bar', checked: showAddrBar, onClick: () => setShowAddrBar((s) => !s) },
      ],
    },
    {
      label: '&View',
      items: [
        { label: '&Actual Size (100%)', checked: zoomMode === 'custom' && zoom === 1, onClick: () => { setZoomMode('custom'); setZoom(1); } },
        { label: 'Fit &Page', checked: zoomMode === 'fit-page', onClick: () => setZoomMode('fit-page') },
        { label: 'Fit &Width', checked: zoomMode === 'fit-width', onClick: () => setZoomMode('fit-width') },
        {
          label: '&Zoom To',
          sub: ZOOM_PRESETS.map((z) => ({
            label: `${Math.round(z * 100)}%`,
            radio: true,
            checked: zoomMode === 'custom' && Math.abs(zoom - z) < 0.01,
            onClick: () => { setZoomMode('custom'); setZoom(z); },
          })),
        },
        { sep: true },
        { label: '&Single Page', radio: true, checked: layoutMode === 'single', onClick: () => setLayoutMode('single') },
        { label: '&Continuous', radio: true, checked: layoutMode === 'continuous', onClick: () => setLayoutMode('continuous') },
        { sep: true },
        { label: '&Bookmarks', checked: navOpen && navTab === 'bookmarks', onClick: () => { setNavOpen(true); setNavTab('bookmarks'); } },
        { label: '&Thumbnails', checked: navOpen && navTab === 'thumbnails', onClick: () => { setNavOpen(true); setNavTab('thumbnails'); } },
      ],
    },
    {
      label: '&Window',
      items: [
        { label: '&Cascade', onClick: os.cascade },
        { label: 'Tile &Horizontally', onClick: () => os.tile(true) },
        { label: 'Tile &Vertically', onClick: () => os.tile(false) },
        { sep: true },
        { label: '&Close', onClick: () => os.close(win.id) },
      ],
    },
    {
      label: '&Help',
      items: [
        { label: 'Acrobat 5.0 &Welcome Guide', onClick: openWelcomePdf },
        { sep: true },
        { label: '&About Adobe Acrobat Reader 5.0...', onClick: showAbout },
      ],
    },
  ];

  const zoomSelectValue =
    zoomMode === 'fit-page'
      ? 'fit-page'
      : zoomMode === 'fit-width'
      ? 'fit-width'
      : String(ZOOM_PRESETS.find((z) => Math.abs(z - effectiveScale) < 0.015) ?? effectiveScale);

  const onKeyDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 'o') { e.preventDefault(); openLocalFromPC(); }
    else if (e.ctrlKey && k === 'f') { e.preventDefault(); setShowFind(true); }
    else if (e.ctrlKey && k === 'g' && numPages > 1) {
      e.preventDefault();
      os.prompt({ title: 'Go to Page', label: `Enter page number (1 - ${numPages}):`, value: String(pageNum) }).then((p) => p && goToPage(p));
    } else if (e.key === 'F6') { e.preventDefault(); setNavOpen((o) => !o); }
    else if (e.key === 'F3' && findQuery.trim()) { e.preventDefault(); runFind(1); }
    else if (e.key === 'PageDown') { e.preventDefault(); goToPage(pageNum + 1); }
    else if (e.key === 'PageUp') { e.preventDefault(); goToPage(pageNum - 1); }
  };

  return (
    <div
      className="app acr"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropFile}
    >
      <MenuBar menus={menus} />

      {/* Row 1 Toolbar: File, Web Link, Find, Rotate, Navigation Pane */}
      <div className="toolbar acr-tb1">
        <button className="btn tool" onClick={openLocalFromPC} title="Open local PDF, HTML, ZIP, TXT, or Image from your device">📂 Open</button>
        <button className="btn tool" onClick={openFromDriveC} title="Open file from Virtual Drive C:">💾 C:\</button>
        <button className="btn tool" onClick={() => setShowAddrBar((s) => !s)} title="Open remote .pdf web link or web page via built-in Browser Engine">🌐 Web/PDF URL</button>
        <button className="btn tool" onClick={saveCopy} disabled={!docState?.blob} title="Save / Download a copy">⬇ Save</button>
        <span className="tb-div" />
        <button className={'btn tool ' + (showFind ? 'pressed' : '')} onClick={() => setShowFind((s) => !s)} title="Find text in document (Ctrl+F)">🔎 Find</button>
        <button className={'btn tool ' + (navOpen ? 'pressed' : '')} onClick={() => setNavOpen((o) => !o)} title="Show / Hide Navigation Pane (F6)">◧ Pane</button>
        <span className="tb-div" />
        <button className="btn tool" onClick={() => setRotation((r) => (r + 270) % 360)} title="Rotate Counterclockwise">↺</button>
        <button className="btn tool" onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate Clockwise">↻</button>
        <button className="btn tool" onClick={openInBrowserEngine} disabled={!docState} title="Open in Internet Browser">↗ Browser</button>
      </div>

      {/* Row 2 Toolbar: History, Adobe Badge, Zoom Controls, Fit Buttons, Page Nav, Tools */}
      <div className="toolbar acr-tb2">
        <button className="btn tool" disabled={history.i <= 0} onClick={goBack} title="Go to Previous View">◀</button>
        <button className="btn tool" disabled={history.i >= history.list.length - 1} onClick={goForward} title="Go to Next View">▶</button>
        <span className="tb-div" />
        <button className="acr-badge-btn" onClick={showAbout} title="About Adobe Acrobat Reader 5.0">
          <AdobeBadge />
        </button>
        <span className="tb-div" />
        <button className="btn tool" onClick={() => stepZoom(-1)} title="Zoom Out">⊖</button>
        <select
          className="field acr-zoom-sel"
          value={zoomSelectValue}
          onChange={(e) => onSelectZoomOption(e.target.value)}
          title="Magnification Level"
        >
          {ZOOM_PRESETS.map((z) => (
            <option key={z} value={String(z)}>{Math.round(z * 100)}%</option>
          ))}
          {!ZOOM_PRESETS.some((z) => Math.abs(z - effectiveScale) < 0.015) && zoomMode === 'custom' && (
            <option value={String(effectiveScale)}>{Math.round(effectiveScale * 100)}%</option>
          )}
          <option value="fit-page">Fit Page</option>
          <option value="fit-width">Fit Width</option>
        </select>
        <button className="btn tool" onClick={() => stepZoom(1)} title="Zoom In">⊕</button>
        <span className="tb-div" />
        <button className={'btn tool ' + (zoomMode === 'custom' && Math.abs(zoom - 1) < 0.01 ? 'pressed' : '')} onClick={() => { setZoomMode('custom'); setZoom(1); }} title="Actual Size (100%)">100%</button>
        <button className={'btn tool ' + (zoomMode === 'fit-page' ? 'pressed' : '')} onClick={() => setZoomMode('fit-page')} title="Fit Page">Fit Pg</button>
        <button className={'btn tool ' + (zoomMode === 'fit-width' ? 'pressed' : '')} onClick={() => setZoomMode('fit-width')} title="Fit Width">Fit W</button>
        <span className="tb-div" />
        <button className="btn tool" disabled={pageNum <= 1} onClick={() => goToPage(1)} title="First Page">|◀</button>
        <button className="btn tool" disabled={pageNum <= 1} onClick={() => goToPage(pageNum - 1)} title="Previous Page">◀</button>
        <button className="btn tool" disabled={pageNum >= numPages} onClick={() => goToPage(pageNum + 1)} title="Next Page">▶</button>
        <button className="btn tool" disabled={pageNum >= numPages} onClick={() => goToPage(numPages)} title="Last Page">▶|</button>
        <span className="tb-div" />
        <button className={'btn tool ' + (activeTool === 'hand' ? 'pressed' : '')} onClick={() => setActiveTool('hand')} title="Hand Tool (Drag to Pan)">✋</button>
        <button className={'btn tool ' + (activeTool === 'zoom' ? 'pressed' : '')} onClick={() => setActiveTool('zoom')} title="Zoom Tool (Click to Zoom In, Right-Click to Zoom Out)">🔍</button>
        <button className={'btn tool ' + (activeTool === 'text' ? 'pressed' : '')} onClick={() => setActiveTool('text')} title="Text Select Tool">T</button>
      </div>

      {/* Collapsible Web / Remote PDF URL Bar */}
      {showAddrBar && (
        <form
          className="addr-row acr-addr"
          onSubmit={(e) => { e.preventDefault(); if (addrInput.trim()) openRemoteUrl(addrInput); }}
        >
          <label>Location:</label>
          <input
            className="field"
            style={{ flex: 1, minWidth: 0 }}
            value={addrInput}
            onChange={(e) => setAddrInput(e.target.value)}
            placeholder="https://example.com/document.pdf or any web URL (routed via built-in Browser Engine)"
            spellCheck={false}
          />
          <button className="btn tool" type="submit">Go</button>
          <button className="btn tool" type="button" onClick={() => setShowAddrBar(false)} title="Hide Location Bar">✕</button>
        </form>
      )}

      {/* Collapsible Find Bar */}
      {showFind && (
        <form
          className="addr-row acr-addr"
          onSubmit={(e) => { e.preventDefault(); runFind(1); }}
        >
          <label>Find:</label>
          <input
            className="field"
            autoFocus
            style={{ flex: 1, minWidth: 0 }}
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder="Search text in document..."
          />
          <button className="btn tool" type="submit">Find Next</button>
          {findHits.length > 0 && <span style={{ fontSize: 10 }}>Match {findIdx + 1}/{findHits.length} (p.{findHits[findIdx]})</span>}
          <button className="btn tool" type="button" onClick={() => { setShowFind(false); setFindHits([]); }}>✕</button>
        </form>
      )}

      {/* Main Acrobat Workspace: Rotated Navigation Tabs + Pane + Grey Document Viewport */}
      <div className="acr-body">
        <div className="acr-tab-rail">
          {[
            ['bookmarks', 'Bookmarks'],
            ['thumbnails', 'Thumbnails'],
            ['comments', 'Comments'],
            ['signatures', 'Signatures'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={'acr-vtab ' + (navOpen && navTab === id ? 'on' : '')}
              onClick={() => {
                if (navOpen && navTab === id) setNavOpen(false);
                else { setNavOpen(true); setNavTab(id); }
              }}
              title={label}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>

        {navOpen && (
          <div className="acr-nav-pane raised">
            <div className="acr-nav-head">
              <b>{navTab.charAt(0).toUpperCase() + navTab.slice(1)}</b>
              <button className="tb-btn close" onClick={() => setNavOpen(false)} title="Collapse Pane">✕</button>
            </div>

            {navTab === 'bookmarks' && (
              <div className="field acr-nav-scroll">
                {outlines.length > 0 ? (
                  outlines.map((bm, i) => <BookmarkNode key={i} item={bm} onJump={onBookmarkJump} />)
                ) : (
                  <div className="acr-nav-empty">This document contains no bookmarks.</div>
                )}
              </div>
            )}

            {navTab === 'thumbnails' && (
              <div className="field acr-nav-scroll acr-thumbs-list">
                {docState?.kind === 'pdf' && pdfDoc && numPages > 0 ? (
                  Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                    <PdfThumb
                      key={p}
                      pdfDoc={pdfDoc}
                      pageNum={p}
                      selected={pageNum === p}
                      onSelect={goToPage}
                    />
                  ))
                ) : docState?.kind === 'image' ? (
                  <button type="button" className="acr-thumb-item sel">
                    <div className="acr-thumb-frame">
                      <img src={docState.blobUrl} alt={docState.name} style={{ maxWidth: 96, maxHeight: 120, objectFit: 'contain' }} />
                    </div>
                    <span className="acr-thumb-num">1</span>
                  </button>
                ) : (
                  <div className="acr-nav-empty">Thumbnails are available for PDF and image documents.</div>
                )}
              </div>
            )}

            {navTab === 'comments' && (
              <div className="field acr-nav-scroll">
                {annotations.length > 0 ? (
                  annotations.map((an, i) => (
                    <div key={i} className="acr-ann-row" onClick={() => goToPage(an.page)}>
                      <b>Page {an.page} — {an.subtype}</b>
                      <div>{an.text}</div>
                    </div>
                  ))
                ) : (
                  <div className="acr-nav-empty">No comments in this document.</div>
                )}
              </div>
            )}

            {navTab === 'signatures' && (
              <div className="field acr-nav-scroll">
                <div className="acr-nav-empty">No digital signatures found in this document.</div>
              </div>
            )}
          </div>
        )}

        <div
          ref={viewportRef}
          className={
            'acr-viewport sunken ' +
            (activeTool === 'hand' ? (panning ? 'cur-grabbing' : 'cur-grab') : activeTool === 'zoom' ? 'cur-zoom' : 'cur-text')
          }
          onPointerDown={onViewportPointerDown}
          onScroll={onContinuousScroll}
          onContextMenu={onContextViewport}
        >
          {loading && <div className="acr-loading">Loading document...</div>}

          {!loading && docState?.kind === 'error' && (
            <div className="acr-error-card raised">
              <b>Adobe Acrobat Reader 5.0</b>
              <p>{docState.error}</p>
              <div className="btn-row">
                <button className="btn default" onClick={openLocalFromPC}>Open Local File / PDF...</button>
                {docState.url && (
                  <button className="btn" onClick={openInBrowserEngine}>Open in Internet Browser</button>
                )}
                <button className="btn" onClick={openWelcomePdf}>Welcome Guide</button>
              </div>
            </div>
          )}

          {!loading && docState?.kind === 'pdf' && pdfDoc && numPages > 0 && (
            <div className="acr-pages-col">
              {(layoutMode === 'single' ? [pageNum] : Array.from({ length: numPages }, (_, i) => i + 1)).map((p) => (
                <PdfPageView
                  key={`${docState.blobUrl}:${p}`}
                  pdfDoc={pdfDoc}
                  pageNum={p}
                  scale={effectiveScale}
                  rotation={rotation}
                  textSelectMode={activeTool === 'text'}
                  findQuery={findQuery}
                  registerRef={(pg, el) => {
                    if (el) pageRefs.current.set(pg, el);
                    else pageRefs.current.delete(pg);
                  }}
                  onDims={onPageDims}
                />
              ))}
            </div>
          )}

          {!loading && docState?.kind === 'image' && (
            <div className="acr-pages-col">
              <div className="acr-page-sheet acr-img-sheet">
                <img
                  src={docState.blobUrl}
                  alt={docState.name}
                  onLoad={(e) => setImgDims({ w: e.currentTarget.naturalWidth || 600, h: e.currentTarget.naturalHeight || 400 })}
                  style={{
                    width: Math.max(24, Math.round(imgDims.w * effectiveScale)),
                    height: Math.max(24, Math.round(imgDims.h * effectiveScale)),
                    transform: rotation ? `rotate(${rotation}deg)` : undefined,
                    display: 'block',
                  }}
                />
              </div>
            </div>
          )}

          {!loading && docState?.kind === 'text' && (
            <div className="acr-pages-col">
              <div
                className="acr-page-sheet acr-text-sheet"
                style={{
                  width: Math.round(680 * Math.max(0.5, effectiveScale)),
                  fontSize: `${Math.round(12 * Math.max(0.6, effectiveScale))}px`,
                }}
              >
                <pre>{docState.text}</pre>
              </div>
            </div>
          )}

          {!loading && docState?.kind === 'html' && (
            <div className="acr-html-host">
              <iframe
                ref={htmlFrameRef}
                className="acr-html-frame"
                title={docState.name}
                srcDoc={docState.html}
                sandbox={
                  docState.source === 'Browser Engine'
                    ? 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals'
                    : 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-same-origin'
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Authentic Acrobat 5.0 Bottom Status Bar */}
      <div className="acr-status">
        <button
          type="button"
          className="btn tool acr-st-btn"
          onClick={() => setNavOpen((o) => !o)}
          title="Toggle Navigation Pane"
        >
          ◧
        </button>
        <div className="acr-st-nav">
          <button type="button" className="btn tool" disabled={pageNum <= 1} onClick={() => goToPage(1)} title="First Page">|◀</button>
          <button type="button" className="btn tool" disabled={pageNum <= 1} onClick={() => goToPage(pageNum - 1)} title="Previous Page">◀</button>
          <form
            className="acr-pg-form"
            onSubmit={(e) => { e.preventDefault(); goToPage(pageInput); }}
          >
            <input
              className="field acr-pg-in"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => setPageInput(String(pageNum))}
              disabled={docState?.kind !== 'pdf' || numPages < 2}
              aria-label="Page number"
            />
            <span>of {docState?.kind === 'pdf' ? numPages : 1}</span>
          </form>
          <button type="button" className="btn tool" disabled={pageNum >= numPages} onClick={() => goToPage(pageNum + 1)} title="Next Page">▶</button>
          <button type="button" className="btn tool" disabled={pageNum >= numPages} onClick={() => goToPage(numPages)} title="Last Page">▶|</button>
        </div>

        <div className="acr-st-dims">
          {docState?.kind === 'pdf'
            ? `${pageDims.wIn.toFixed(1)} x ${pageDims.hIn.toFixed(1)} in`
            : docState?.kind === 'image'
            ? `${imgDims.w} x ${imgDims.h} px`
            : docState?.size
            ? fmtSize(docState.size)
            : '8.5 x 11 in'}
        </div>

        <div className="acr-st-layout">
          <button
            type="button"
            className={'btn tool ' + (layoutMode === 'single' ? 'pressed' : '')}
            onClick={() => setLayoutMode('single')}
            title="Single Page"
          >
            □
          </button>
          <button
            type="button"
            className={'btn tool ' + (layoutMode === 'continuous' ? 'pressed' : '')}
            onClick={() => setLayoutMode('continuous')}
            title="Continuous"
          >
            ◫
          </button>
        </div>

        <div className="acr-st-info">
          {docState?.source || 'Ready'} · {activeTool === 'hand' ? 'Hand' : activeTool === 'zoom' ? 'Zoom' : 'Text Select'}
        </div>
      </div>
    </div>
  );
}

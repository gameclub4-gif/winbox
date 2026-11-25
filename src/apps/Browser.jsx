import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar, Dialog } from '../os/widgets.jsx';
import Icon from '../os/icons.jsx';
import * as fs from '../os/fs.js';
import { pickLocalFiles } from '../os/localFiles.js';
import { fmtSize } from '../os/actions.js';
import * as SmartTransfer from '../os/smartTransfer.js';
import { pickImageDialog, openTransferHistoryDialog } from '../os/smartTransferUI.jsx';

const PdfViewer = lazy(() => import('../utils/PdfViewer.jsx'));

const BM_KEY = 'win95.bookmarks';
const SEC_KEY = 'win95.browser.security';

const DEFAULT_LINKS = [
  { title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page' },
  { title: 'The first web page', url: 'https://info.cern.ch/' },
  { title: 'Example Domain', url: 'https://example.com/' },
  { title: 'Internet Archive', url: 'https://archive.org/' },
  { title: 'DuckDuckGo Lite', url: 'https://lite.duckduckgo.com/lite/' },
  { title: 'MDN Web Docs', url: 'https://developer.mozilla.org/' },
];

// Sites that send X-Frame-Options / CSP frame-ancestors — auto-routed via compatibility proxy in Compatible mode
const FRAME_BLOCKED = [
  'google.com', 'youtube.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'linkedin.com', 'github.com', 'reddit.com', 'amazon.com', 'netflix.com', 'paypal.com',
  'apple.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'stackoverflow.com', 'twitch.tv',
  'discord.com', 'tiktok.com', 'whatsapp.com', 'openai.com', 'chatgpt.com', 'microsoft.com',
  'live.com', 'outlook.com', 'spotify.com', 'pinterest.com', 'nasa.gov', 'medium.com',
];

const SECURITY_MODES = [
  { id: 'compatible', label: 'Low (Compatible + Unblock Proxy)', short: 'Compatible' },
  { id: 'standard', label: 'Standard (Balanced)', short: 'Standard' },
  { id: 'strict', label: 'Strict (Sandboxed)', short: 'Strict' },
];

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const isFrameBlocked = (u) => { const h = host(u); return FRAME_BLOCKED.some((b) => h === b || h.endsWith('.' + b)); };
const isPdfUrl = (u) => /\.pdf([?#].*)?$/i.test(u);

function normalize(input) {
  const t = input.trim();
  if (!t) return 'about:home';
  if (/^(about:|blob:|data:|local:)/i.test(t)) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^localhost(:\d+)?([/?#].*)?$/i.test(t)) return 'http://' + t;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(t) && !/\s/.test(t)) return 'https://' + t;
  return 'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(t);
}

const loadBM = () => { try { return JSON.parse(localStorage.getItem(BM_KEY)) || []; } catch { return []; } };
const loadSec = () => {
  try {
    const v = localStorage.getItem(SEC_KEY);
    return ['compatible', 'standard', 'strict'].includes(v) ? v : 'compatible';
  } catch {
    return 'compatible';
  }
};

export default function Browser({ win, props, active }) {
  const os = useOS();
  const first = props.url ? normalize(props.url) : 'about:home';
  const [h, setH] = useState({ list: [first], i: 0 });
  const url = h.list[h.i];
  const [addr, setAddr] = useState(first === 'about:home' ? '' : first);
  const [loading, setLoading] = useState(false);
  const [key, setKey] = useState(0);
  const [bm, setBm] = useState(loadBM);
  const [secLevel, setSecLevel] = useState(loadSec);
  const [proxyOverrides, setProxyOverrides] = useState(() => Object.create(null));
  const [hint, setHint] = useState(true);
  const [q, setQ] = useState('');
  const [localDocs, setLocalDocs] = useState(() => Object.create(null));
  const blobUrls = useRef([]);
  const frameRef = useRef(null);
  const preRef = useRef(null);
  const lastClickedImgRef = useRef(null);
  const liveRef = useRef({});

  useEffect(() => () => {
    blobUrls.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } });
    blobUrls.current = [];
  }, []);

  useEffect(() => {
    try { localStorage.setItem(SEC_KEY, secLevel); } catch { /* ignore */ }
  }, [secLevel]);

  const regBlob = (blob) => {
    const u = URL.createObjectURL(blob);
    blobUrls.current.push(u);
    return u;
  };

  const openBlobInBrowser = useCallback(async (blob, filename, rawHtmlOverride = null) => {
    const ext = fs.ext(filename);
    let kind = 'text';
    let docBlob = blob;
    let text = '';
    let rawHtml = rawHtmlOverride || '';

    // Sniff %PDF- header cleanly even if filename lacks .pdf extension
    let isPdf = ext === 'pdf' || blob.type === 'application/pdf';
    if (!isPdf && blob.size >= 5) {
      try {
        const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
        if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2d) {
          isPdf = true;
        }
      } catch { /* ignore */ }
    }

    if (isPdf) {
      kind = 'pdf';
      docBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
    } else if (ext === 'zip') {
      try {
        const { extractHtmlFromZip } = await import('../utils/htmlZip.js');
        const { wrapStandaloneHtml } = await import('../utils/rtf.js');
        const extracted = extractHtmlFromZip(new Uint8Array(await blob.arrayBuffer()), filename);
        rawHtml = extracted.rawHtml || extracted.html;
        const fullHtml = wrapStandaloneHtml(extracted.html, extracted.title);
        docBlob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
        kind = 'html';
      } catch (e) {
        os.msg({ icon: 'error', title: 'Internet Browser', text: e.message });
        return;
      }
    } else if (ext === 'rtf' || blob.type === 'application/rtf') {
      const { rtfToHtml, wrapStandaloneHtml } = await import('../utils/rtf.js');
      const htmlBody = rtfToHtml(await blob.text());
      rawHtml = wrapStandaloneHtml(htmlBody, filename);
      docBlob = new Blob([rawHtml], { type: 'text/html;charset=utf-8' });
      kind = 'html';
    } else if (['html', 'htm', 'xhtml', 'mhtml'].includes(ext) || blob.type === 'text/html' || blob.type === 'application/xhtml+xml') {
      kind = 'html';
      rawHtml = rawHtmlOverride ?? await blob.text();
      docBlob = new Blob([rawHtml], { type: 'text/html;charset=utf-8' });
    } else if (ext === 'svg' || blob.type === 'image/svg+xml') {
      kind = 'image';
      docBlob = blob.type === 'image/svg+xml' ? blob : new Blob([blob], { type: 'image/svg+xml' });
    } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif'].includes(ext) || blob.type?.startsWith('image/')) {
      kind = 'image';
    } else if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext) || blob.type?.startsWith('audio/')) {
      kind = 'audio';
    } else if (['mp4', 'webm', 'mov', 'ogv', 'mkv'].includes(ext) || blob.type?.startsWith('video/')) {
      kind = 'video';
    } else {
      const sample = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
      const hasNull = sample.includes(0);
      if (hasNull) {
        kind = 'binary';
      } else {
        kind = 'text';
        text = await blob.text();
      }
    }

    const docUrl = regBlob(docBlob);
    const localKey = `local:${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${filename}`;
    lastClickedImgRef.current = null;
    const entry = {
      kind,
      name: filename,
      mime: docBlob.type || blob.type || 'application/octet-stream',
      size: blob.size,
      blobUrl: docUrl,
      text,
      rawHtml,
      blob: docBlob,
    };
    setLocalDocs((prev) => ({ ...prev, [localKey]: entry }));
    setAddr(`local://${filename}`);
    setLoading(false);
    setHint(false);
    setH((s) => ({ list: [...s.list.slice(0, s.i + 1), localKey], i: s.i + 1 }));
  }, [os]);

  const openRemotePdf = useCallback(async (targetUrl) => {
    setLoading(true);
    try {
      const res = await fetch('/api/browse?url=' + encodeURIComponent(targetUrl));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const rawName = decodeURIComponent(targetUrl.split('?')[0].split('/').pop() || 'document.pdf');
      const filename = rawName.toLowerCase().endsWith('.pdf') ? rawName : rawName + '.pdf';
      await openBlobInBrowser(new Blob([blob], { type: 'application/pdf' }), filename);
    } catch (e) {
      setLoading(false);
      os.msg({ icon: 'error', title: 'Internet Browser', text: `Could not open PDF (${e.message}). Try "Open in external browser".` });
    }
  }, [openBlobInBrowser, os]);

  const receiveTransfer = useCallback(async (transfer) => {
    if (!transfer) return false;
    const base = (transfer.title || 'transfer').replace(/[^\w.-]+/g, '_');
    if (transfer.contentType?.startsWith('image/')) {
      const blob = transfer.payload instanceof Blob
        ? transfer.payload
        : await SmartTransfer.imageSrcToBlob(String(transfer.payload || ''));
      if (!blob) {
        os.msg({ icon: 'error', title: 'Internet Browser', text: 'Could not read image payload.' });
        return false;
      }
      const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const name = /\.(png|jpe?g|webp|gif|svg)$/i.test(transfer.title || '') ? transfer.title : `${base}.${ext}`;
      await openBlobInBrowser(blob, name);
      return true;
    }
    if (transfer.contentType === 'text/html') {
      const raw = String(transfer.payload || '');
      const hasHtmlDoc = /<html[\s>]|<!doctype\s+html/i.test(raw);
      const docStr = hasHtmlDoc
        ? raw
        : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${base}</title></head><body style="font-family:Arial,sans-serif;padding:16px;">${raw}</body></html>`;
      const name = /\.html?$/i.test(transfer.title || '') ? transfer.title : `${base}.html`;
      await openBlobInBrowser(new Blob([docStr], { type: 'text/html;charset=utf-8' }), name, raw);
      return true;
    }
    const textStr = String(transfer.payload || '');
    const name = /\.txt$/i.test(transfer.title || '') ? transfer.title : `${base}.txt`;
    await openBlobInBrowser(new Blob([textStr], { type: 'text/plain;charset=utf-8' }), name);
    return true;
  }, [openBlobInBrowser, os]);

  useEffect(() => {
    if (props.transferId) {
      SmartTransfer.getTransfer(props.transferId).then((t) => {
        if (t) receiveTransfer(t);
      });
    } else if (props.fsNodeId) {
      const n = fs.get(props.fsNodeId);
      if (n) openBlobInBrowser(fs.toBlob(n), n.name);
    } else if (props.localBlob && props.localName) {
      openBlobInBrowser(props.localBlob, props.localName);
    }
  }, [win.nonce]); // eslint-disable-line

  useEffect(() => { try { localStorage.setItem(BM_KEY, JSON.stringify(bm)); } catch { /* ignore */ } }, [bm]);

  useEffect(() => {
    if (active) SmartTransfer.touchApp('browser', win.id);
  }, [active, win.id]);

  const activeLocal = url.startsWith('local:') ? localDocs[url] : null;
  const title = url === 'about:home'
    ? 'Home'
    : activeLocal
      ? activeLocal.name
      : props.title && url.startsWith('blob:')
        ? props.title
        : host(url) || url;
  useEffect(() => { os.setTitle(win.id, `${title} - Internet Browser`); }, [title, win.id, os]);

  const nav = useCallback((input) => {
    const u = normalize(input);
    if (/^https?:\/\//i.test(u) && isPdfUrl(u)) {
      setAddr(u);
      openRemotePdf(u);
      return;
    }
    setAddr(u === 'about:home' ? '' : u.startsWith('local:') ? (localDocs[u]?.name ? `local://${localDocs[u].name}` : u) : u);
    setLoading(u !== 'about:home' && !u.startsWith('local:'));
    setHint(true);
    setH((s) => (s.list[s.i] === u ? s : { list: [...s.list.slice(0, s.i + 1), u], i: s.i + 1 }));
    if (u === url) setKey((k) => k + 1);
  }, [localDocs, openRemotePdf, url]);

  // Intercept navigation requests posted by /api/browse proxy script
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === 'win95-browser-nav' && typeof e.data.url === 'string') {
        nav(e.data.url);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [nav]);

  const goTo = (i) => {
    const u = h.list[i];
    setH({ ...h, i });
    setAddr(u === 'about:home' ? '' : u.startsWith('local:') ? `local://${localDocs[u]?.name || ''}` : u);
    setLoading(u !== 'about:home' && !u.startsWith('local:'));
  };

  const openFromDevice = async (kindFilter = 'all') => {
    const opts = { multiple: false };
    if (kindFilter === 'txt') {
      opts.accept = '.txt,.md,.log,.csv,.json,.xml,.ini,.cfg';
      opts.types = [{ description: 'Text Documents', accept: { 'text/plain': ['.txt', '.md', '.log', '.csv', '.json', '.xml'] } }];
    } else if (kindFilter === 'html') {
      opts.accept = '.html,.htm,.xhtml,.zip';
      opts.types = [{ description: 'HTML & Web Packages', accept: { 'text/html': ['.html', '.htm', '.xhtml'], 'application/zip': ['.zip'] } }];
    } else if (kindFilter === 'image') {
      opts.accept = '.png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif';
      opts.types = [{ description: 'Images (PNG, JPG, JPEG, WEBP, GIF)', accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'], 'image/gif': ['.gif'] } }];
    } else if (kindFilter === 'pdf') {
      opts.accept = '.pdf,application/pdf';
      opts.types = [{ description: 'PDF Documents', accept: { 'application/pdf': ['.pdf'] } }];
    }
    const picked = await pickLocalFiles(opts);
    if (picked?.file) await openBlobInBrowser(picked.file, picked.name);
  };

  const openFromC = async () => {
    const n = await os.fileDialog({
      mode: 'open',
      title: 'Open File in Browser (Drive C:)',
    });
    if (n) await openBlobInBrowser(fs.toBlob(n), n.name);
  };

  const onDropFile = async (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    await openBlobInBrowser(f, f.name);
  };

  // --- SmartTransfer Content Extractors ---
  const getLocalFrameDoc = () => {
    try { return frameRef.current?.contentDocument || null; } catch { return null; }
  };

  const fetchRemoteHtml = async (targetUrl) => {
    const res = await fetch('/api/browse?url=' + encodeURIComponent(targetUrl));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };

  const extractBrowserContent = async (mode) => {
    const cur = liveRef.current;
    const al = cur.activeLocal;
    const curUrl = cur.url;

    if (al) {
      if (al.kind === 'text') {
        const sel = window.getSelection();
        const selTxt = (sel && preRef.current && sel.rangeCount > 0 && preRef.current.contains(sel.anchorNode))
          ? sel.toString() : '';
        return { text: selTxt || al.text || '', html: '', title: al.name };
      }
      if (al.kind === 'html') {
        const doc = getLocalFrameDoc();
        let selTxt = '';
        let selHtml = '';
        if (doc) {
          const sel = doc.getSelection?.();
          if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
            selTxt = sel.toString();
            const wrap = doc.createElement('div');
            wrap.appendChild(sel.getRangeAt(0).cloneContents());
            selHtml = wrap.innerHTML;
          }
        }
        const rawSource = al.rawHtml || (doc?.documentElement ? '<!DOCTYPE html>\n' + doc.documentElement.outerHTML : '');
        const fullText = doc?.body?.innerText || SmartTransfer.extractTextFromHtml(rawSource);
        return {
          text: selTxt || fullText || '',
          html: mode === 'htmlSource' ? rawSource : (selHtml || rawSource),
          selectedOnly: !!selTxt,
          title: al.name,
        };
      }
      return { text: '', html: '', title: al.name };
    }

    if (/^https?:\/\//i.test(curUrl)) {
      const doc = getLocalFrameDoc();
      if (doc) {
        const sel = doc.getSelection?.();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
          const wrap = doc.createElement('div');
          wrap.appendChild(sel.getRangeAt(0).cloneContents());
          return { text: sel.toString(), html: wrap.innerHTML, selectedOnly: true, title: host(curUrl) };
        }
        const raw = doc.documentElement ? '<!DOCTYPE html>\n' + doc.documentElement.outerHTML : '';
        return { text: doc.body?.innerText || SmartTransfer.extractTextFromHtml(raw), html: raw, title: doc.title || host(curUrl) };
      }
      const raw = await fetchRemoteHtml(curUrl);
      const parsed = new DOMParser().parseFromString(raw, 'text/html');
      return {
        text: SmartTransfer.extractTextFromHtml(raw),
        html: raw,
        title: parsed.title?.trim() || host(curUrl) || 'Web Page',
      };
    }
    return { text: '', html: '', title: '' };
  };

  const pickBrowserImageBlob = async () => {
    const cur = liveRef.current;
    const al = cur.activeLocal;
    const curUrl = cur.url;

    if (al?.kind === 'image') {
      const blob = await SmartTransfer.normalizeImageBlob(al.blob);
      return blob ? { blob, title: al.name } : null;
    }

    let candidates = [];
    const doc = getLocalFrameDoc();
    if (al?.kind === 'html' && doc) {
      const imgs = [...doc.querySelectorAll('img')];
      if (lastClickedImgRef.current && doc.contains(lastClickedImgRef.current)) {
        const im = lastClickedImgRef.current;
        const b = await SmartTransfer.imageSrcToBlob(im.currentSrc || im.src);
        if (b) return { blob: b, title: im.alt || 'Selected Image' };
      }
      candidates = imgs.map((im, i) => ({
        src: im.currentSrc || im.src,
        previewSrc: im.currentSrc || im.src,
        label: im.alt || im.getAttribute('src')?.split('/').pop() || `Image ${i + 1}`,
        dims: im.naturalWidth ? `${im.naturalWidth}×${im.naturalHeight}` : '',
      })).filter((x) => x.src);
    } else if (/^https?:\/\//i.test(curUrl)) {
      const raw = await fetchRemoteHtml(curUrl);
      const parsed = new DOMParser().parseFromString(raw, 'text/html');
      candidates = [...parsed.querySelectorAll('img')].map((im, i) => {
        const rawSrc = im.getAttribute('src') || '';
        let resolved = rawSrc;
        try { resolved = new URL(rawSrc, curUrl).toString(); } catch { /* ignore */ }
        return {
          src: resolved,
          previewSrc: /^https?:\/\//i.test(resolved) ? '/api/browse?url=' + encodeURIComponent(resolved) : resolved,
          label: im.getAttribute('alt') || rawSrc.split('/').pop()?.split('?')[0] || `Image ${i + 1}`,
          dims: '',
        };
      }).filter((x) => x.src);
    }

    if (!candidates.length) {
      os.msg({ icon: 'info', title: 'Smart Send', text: 'No transferable images were found on the current page.' });
      return null;
    }

    const chosen = candidates.length === 1
      ? candidates[0]
      : await pickImageDialog(os, candidates.slice(0, 24), 'Select Image from Internet Explorer');
    if (!chosen) return null;
    const blob = await SmartTransfer.imageSrcToBlob(chosen.src);
    if (!blob) {
      os.msg({ icon: 'error', title: 'Smart Send', text: 'Could not read the selected image data.' });
      return null;
    }
    return { blob, title: chosen.label };
  };

  liveRef.current = {
    url,
    activeLocal,
    receiveTransfer,
    extractBrowserContent,
    pickBrowserImageBlob,
  };

  useEffect(() => {
    return SmartTransfer.registerApp('browser', win.id, {
      getCapability: () => {
        const al = liveRef.current.activeLocal;
        const u = liveRef.current.url;
        const isWeb = /^https?:\/\//i.test(u);
        return {
          hasText: isWeb || al?.kind === 'text' || al?.kind === 'html',
          hasHtml: isWeb || al?.kind === 'html',
          hasImage: isWeb || al?.kind === 'image' || al?.kind === 'html',
          hasContent: isWeb || (!!al && al.kind !== 'binary' && al.kind !== 'pdf' && al.kind !== 'audio' && al.kind !== 'video'),
        };
      },
      pullFor: async (targetApp, kind) => {
        if (kind === 'image' || targetApp === 'paint') {
          const im = await liveRef.current.pickBrowserImageBlob();
          return im ? { contentType: im.blob.type || 'image/png', payload: im.blob, title: im.title } : null;
        }
        const data = await liveRef.current.extractBrowserContent(targetApp === 'wordpad' ? 'wordpad' : 'text');
        if (targetApp === 'wordpad' && data.html) {
          return { contentType: 'text/html', payload: data.html, title: data.title };
        }
        return data.text ? { contentType: 'text/plain', payload: data.text, title: data.title } : null;
      },
      receiveTransfer: async (transfer) => liveRef.current.receiveTransfer(transfer),
    });
  }, [win.id]); // eslint-disable-line

  const addBM = () => {
    if (url === 'about:home' || url.startsWith('blob:') || url.startsWith('local:')) return;
    if (!bm.some((b) => b.url === url)) setBm([...bm, { title: host(url) || url, url }]);
    os.msg({ icon: 'info', title: 'Add to Favorites', text: `${host(url)} was added to your Favorites.` });
  };
  const organize = () => os.dialog((done) => <BMOrganizer done={done} bm={loadBM()} onSave={setBm} />);

  const canExternal = url !== 'about:home' && !url.startsWith('local:') && /^https?:\/\//i.test(url);
  const defaultProxy = secLevel === 'compatible' && isFrameBlocked(url);
  const usingProxy = canExternal && (proxyOverrides[url] !== undefined ? proxyOverrides[url] : defaultProxy);

  const toggleProxy = () => {
    if (!canExternal) return;
    setProxyOverrides((prev) => ({ ...prev, [url]: !usingProxy }));
    setLoading(true);
    setKey((k) => k + 1);
  };

  const sendToNotepadTxt = async () => {
    try {
      const data = await extractBrowserContent('text');
      if (!data.text.trim()) {
        os.msg({ icon: 'info', title: 'Smart Send', text: 'No readable text available on the current page.' });
        return;
      }
      await SmartTransfer.send({
        sourceApp: 'browser',
        targetApp: 'notepad',
        contentType: 'text/plain',
        payload: data.text,
        title: data.title || title,
      });
    } catch (e) {
      os.msg({ icon: 'error', title: 'Smart Send', text: e.message });
    }
  };

  const sendToNotepadHtml = async () => {
    try {
      const data = await extractBrowserContent('htmlSource');
      if (!data.html.trim()) {
        os.msg({ icon: 'info', title: 'Smart Send', text: 'No HTML source available on the current page.' });
        return;
      }
      await SmartTransfer.send({
        sourceApp: 'browser',
        targetApp: 'notepad',
        contentType: 'text/html',
        payload: data.html,
        title: (data.title || title).replace(/\.\w+$/, '') + '.html',
        meta: { syntaxHighlight: true, asSource: true },
      });
    } catch (e) {
      os.msg({ icon: 'error', title: 'Smart Send', text: e.message });
    }
  };

  const sendToWordPad = async () => {
    try {
      const data = await extractBrowserContent('wordpad');
      if (!data.html && !data.text.trim()) {
        os.msg({ icon: 'info', title: 'Smart Send', text: 'No transferable content on the current page.' });
        return;
      }
      await SmartTransfer.send({
        sourceApp: 'browser',
        targetApp: 'wordpad',
        contentType: data.html ? 'text/html' : 'text/plain',
        payload: data.html || data.text,
        title: data.title || title,
      });
    } catch (e) {
      os.msg({ icon: 'error', title: 'Smart Send', text: e.message });
    }
  };

  const sendToPaint = async () => {
    try {
      const im = await pickBrowserImageBlob();
      if (!im) return;
      await SmartTransfer.send({
        sourceApp: 'browser',
        targetApp: 'paint',
        contentType: im.blob.type || 'image/png',
        payload: im.blob,
        title: im.title || 'Web Image',
      });
    } catch (e) {
      os.msg({ icon: 'error', title: 'Smart Send', text: e.message });
    }
  };

  const pullFrom = async (sourceApp, kind = 'any') => {
    try {
      const t = await SmartTransfer.pull({ sourceApp, targetApp: 'browser', kind });
      if (!t) {
        os.msg({ icon: 'info', title: 'Internet Browser', text: `No content available from ${SmartTransfer.APP_NAMES[sourceApp]}.` });
        return;
      }
      await receiveTransfer(t);
    } catch (e) {
      os.msg({ icon: 'error', title: 'Internet Browser', text: e.message });
    }
  };

  const hasSendText = () => /^https?:\/\//i.test(url) || activeLocal?.kind === 'text' || activeLocal?.kind === 'html';
  const hasSendHtml = () => /^https?:\/\//i.test(url) || activeLocal?.kind === 'html';
  const hasSendImg = () => {
    if (activeLocal?.kind === 'image') return true;
    if (/^https?:\/\//i.test(url)) return true;
    if (activeLocal?.kind === 'html') {
      const doc = getLocalFrameDoc();
      return doc ? doc.querySelectorAll('img').length > 0 : true;
    }
    return false;
  };

  const menus = [
    {
      label: '&File',
      items: [
        { label: '&New Window', onClick: () => os.open('browser') },
        { label: 'Open &Local File / PDF from PC...', shortcut: 'Ctrl+O', onClick: () => openFromDevice('all') },
        { label: 'Open File from Drive &C:...', onClick: openFromC },
        { sep: true },
        { label: '&Close', onClick: () => os.close(win.id) },
      ],
    },
    {
      label: '&View',
      items: [
        { label: '&Refresh', shortcut: 'F5', onClick: () => { setLoading(url !== 'about:home' && !url.startsWith('local:')); setKey((k) => k + 1); } },
        { label: 'Load via Compatibility &Proxy', disabled: !canExternal, checked: usingProxy, onClick: toggleProxy },
        { sep: true },
        {
          label: '&Security Level',
          sub: SECURITY_MODES.map((m) => ({
            label: m.label,
            radio: true,
            checked: secLevel === m.id,
            onClick: () => setSecLevel(m.id),
          })),
        },
      ],
    },
    {
      label: '&Go',
      items: [
        { label: '&Back', disabled: h.i === 0, onClick: () => goTo(h.i - 1) },
        { label: '&Forward', disabled: h.i >= h.list.length - 1, onClick: () => goTo(h.i + 1) },
        { label: '&Home Page', onClick: () => nav('about:home') },
      ],
    },
    {
      label: 'F&avorites',
      items: [
        { label: '&Add to Favorites', onClick: addBM },
        { label: '&Organize Favorites...', disabled: !bm.length, onClick: organize },
        { sep: true },
        ...[...DEFAULT_LINKS, ...bm].map((b) => ({ label: b.title, icon: 'browser', onClick: () => nav(b.url) })),
      ],
    },
    {
      label: '&Send',
      items: () => [
        { label: 'Send to &Notepad as TXT', disabled: !hasSendText(), onClick: sendToNotepadTxt },
        { label: 'Send to Notepad as &HTML Source', disabled: !hasSendHtml(), onClick: sendToNotepadHtml },
        { label: 'Send to &WordPad', disabled: !hasSendText(), onClick: sendToWordPad },
        { label: 'Send to &Paint (selected image)', disabled: !hasSendImg(), onClick: sendToPaint },
        { sep: true },
        { label: 'Get from &WordPad', disabled: !SmartTransfer.canPull('wordpad'), onClick: () => pullFrom('wordpad', 'any') },
        { label: 'Get from &Notepad', disabled: !SmartTransfer.canPull('notepad'), onClick: () => pullFrom('notepad', 'any') },
        { label: 'Get from &Paint', disabled: !SmartTransfer.canPull('paint', 'image'), onClick: () => pullFrom('paint', 'image') },
        { sep: true },
        { label: 'Open &TXT Document...', onClick: () => openFromDevice('txt') },
        { label: 'Open &HTML Document...', onClick: () => openFromDevice('html') },
        { label: 'Open &Image (PNG/JPG/WEBP/GIF)...', onClick: () => openFromDevice('image') },
        { label: 'Open &PDF Document...', onClick: () => openFromDevice('pdf') },
        { sep: true },
        { label: 'Transfer &History & Cache...', onClick: () => openTransferHistoryDialog(os) },
      ],
    },
    {
      label: '&Help',
      items: [
        { label: '&Help Topics', onClick: () => os.open('help') },
        { label: '&About Internet Browser', onClick: () => os.msg({ icon: 'info', title: 'About', text: 'Internet Browser\nWindows 95 Smart Edition\n\nIncludes Smart Office Transfer, built-in PDF.js viewer, local HTML/ZIP/RTF/Image/TXT support, Compatibility Proxy, and adjustable Security Level.' }) },
      ],
    },
  ];

  // Frame sandbox rules per security level
  const localHtmlSandbox =
    secLevel === 'compatible'
      ? undefined
      : secLevel === 'standard'
        ? 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads'
        : 'allow-scripts allow-forms allow-popups';

  const directWebSandbox =
    secLevel === 'strict'
      ? 'allow-scripts allow-forms allow-popups allow-modals'
      : undefined;

  let page;
  if (activeLocal) {
    if (activeLocal.kind === 'pdf') {
      page = (
        <Suspense fallback={<div className="br-pdf-msg">Loading PDF viewer...</div>}>
          <PdfViewer
            name={activeLocal.name}
            blobUrl={activeLocal.blobUrl}
            getBytes={() => activeLocal.blob.arrayBuffer()}
          />
        </Suspense>
      );
    } else if (activeLocal.kind === 'html') {
      page = (
        <iframe
          ref={frameRef}
          key={key + url + secLevel}
          className="br-frame"
          src={activeLocal.blobUrl}
          title={activeLocal.name}
          onLoad={() => {
            try {
              const doc = frameRef.current?.contentDocument;
              if (doc) {
                doc.addEventListener('pointerdown', (ev) => {
                  const im = ev.target?.closest?.('img');
                  if (im) lastClickedImgRef.current = im;
                }, true);
              }
            } catch { /* cross-origin in strict sandbox */ }
          }}
          {...(localHtmlSandbox ? { sandbox: localHtmlSandbox } : {})}
        />
      );
    } else if (activeLocal.kind === 'image') {
      page = (
        <div className="br-media-view">
          <img src={activeLocal.blobUrl} alt={activeLocal.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
      );
    } else if (activeLocal.kind === 'audio' || activeLocal.kind === 'video') {
      page = (
        <div className="br-media-view">
          {activeLocal.kind === 'video'
            ? <video controls src={activeLocal.blobUrl} style={{ maxWidth: '100%', maxHeight: '100%' }} />
            : <audio controls src={activeLocal.blobUrl} />}
        </div>
      );
    } else if (activeLocal.kind === 'binary') {
      page = (
        <div className="br-blocked">
          <Icon name="file" size={48} />
          <h3>{activeLocal.name}</h3>
          <p>Binary file ({fmtSize(activeLocal.size)} — {activeLocal.mime})</p>
          <div className="btn-row">
            <a className="btn default" href={activeLocal.blobUrl} download={activeLocal.name} style={{ textDecoration: 'none', color: 'inherit' }}>Download File</a>
            <a className="btn" href={activeLocal.blobUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>Open in Browser Tab ↗</a>
          </div>
        </div>
      );
    } else {
      page = <pre ref={preRef} className="br-pre">{activeLocal.text}</pre>;
    }
  } else if (url === 'about:home') {
    page = (
      <div className="br-home">
        <h1 className="br-logo"><span style={{ color: '#4285f4' }}>W</span><span style={{ color: '#ea4335' }}>e</span><span style={{ color: '#fbbc05' }}>b</span> <span style={{ color: '#4285f4' }}>9</span><span style={{ color: '#34a853' }}>5</span></h1>
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(q.trim()); }}>
          <input className="field br-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the Web, type a URL, or drop a PDF / HTML file" />
          <div className="btn-row">
            <button className="btn default" type="submit" style={{ minWidth: 115 }}>Search Web</button>
            <button type="button" className="btn" style={{ minWidth: 115 }} onClick={() => q.trim() && nav('https://en.wikipedia.org/w/index.php?search=' + encodeURIComponent(q.trim()))}>Wikipedia</button>
            <button type="button" className="btn" style={{ minWidth: 115 }} onClick={() => q.trim() && nav('https://www.google.com/search?q=' + encodeURIComponent(q.trim()))}>Google</button>
            <button type="button" className="btn" style={{ minWidth: 140 }} onClick={() => openFromDevice('all')}>Open Local File / PDF...</button>
          </div>
        </form>
        <div className="br-links"><b>Quick links</b>
          <div>{[...DEFAULT_LINKS, ...bm].map((b) => <a key={b.url} href={b.url} onClick={(e) => { e.preventDefault(); nav(b.url); }}>{b.title}</a>)}</div>
        </div>
        <p className="br-note">
          Security Level: <b>{SECURITY_MODES.find((m) => m.id === secLevel)?.short}</b> — Local PDFs, HTML, ZIPs, media, and frame-blocked websites work seamlessly. Drag &amp; drop any file here to open it.
        </p>
      </div>
    );
  } else if (usingProxy) {
    const proxySrc = '/api/browse?url=' + encodeURIComponent(url);
    page = (
      <iframe
        ref={frameRef}
        key={`proxy:${key}:${url}`}
        className="br-frame"
        src={proxySrc}
        title="web page (compatibility proxy)"
        onLoad={() => setLoading(false)}
        sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
        allow="fullscreen"
      />
    );
  } else {
    page = (
      <iframe
        ref={frameRef}
        key={`direct:${key}:${url}:${secLevel}`}
        className="br-frame"
        src={url}
        title="web page"
        onLoad={() => setLoading(false)}
        {...(directWebSandbox ? { sandbox: directWebSandbox } : {})}
        allow="fullscreen"
      />
    );
  }

  return (
    <div
      className="app br"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropFile}
      onKeyDown={(e) => { if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openFromDevice('all'); } }}
    >
      <MenuBar menus={menus} />
      <div className="toolbar">
        <button className="btn tool" disabled={h.i === 0} onClick={() => goTo(h.i - 1)}>◀ Back</button>
        <button className="btn tool" disabled={h.i >= h.list.length - 1} onClick={() => goTo(h.i + 1)}>▶</button>
        <button className="btn tool" onClick={() => { setLoading(url !== 'about:home' && !url.startsWith('local:')); setKey((k) => k + 1); }}>⟳ Refresh</button>
        <button className="btn tool" onClick={() => nav('about:home')}>⌂ Home</button>
        <button className="btn tool" onClick={() => openFromDevice('all')} title="Open any local PDF, HTML, ZIP, image, text, or media file from your device">📂 Open File/PDF</button>
        <button className="btn tool" onClick={addBM} disabled={!!activeLocal || url === 'about:home'} title="Add to Favorites">★</button>
        {canExternal && (
          <>
            <button
              className={'btn tool ' + (usingProxy ? 'pressed' : '')}
              onClick={toggleProxy}
              title={usingProxy ? 'Currently using Compatibility Proxy (click to switch to Direct)' : 'Switch to Compatibility Proxy if site refuses framing'}
            >
              {usingProxy ? '🔓 Proxy: ON' : '🔓 Unblock'}
            </button>
            <a className="btn tool" href={url} target="_blank" rel="noopener noreferrer" title="Open in external browser tab" style={{ textDecoration: 'none', color: 'inherit' }}>↗ External</a>
          </>
        )}
      </div>
      <form className="addr-row" onSubmit={(e) => { e.preventDefault(); nav(addr); }}>
        <label>Address</label>
        <input className="field" style={{ flex: 1, minWidth: 0 }} value={addr} onChange={(e) => setAddr(e.target.value)} onFocus={(e) => e.target.select()} placeholder="Type a URL, search term, or drop a local file / PDF" spellCheck={false} />
        <button className="btn tool" type="submit">Go</button>
      </form>
      <div className="br-bm">{[...DEFAULT_LINKS.slice(0, 4), ...bm].map((b) => <button key={b.url} className="btn tool" onClick={() => nav(b.url)}><Icon name="browser" size={12} />{b.title}</button>)}</div>
      {hint && canExternal && !usingProxy && (
        <div className="br-hint">
          Site refused connection or looks blank?{' '}
          <a href="#proxy" onClick={(e) => { e.preventDefault(); toggleProxy(); }}>Load via Compatibility Proxy</a>
          {' · '}
          <a href={url} target="_blank" rel="noopener noreferrer">Open externally</a>
          <button onClick={() => setHint(false)} aria-label="Dismiss">✕</button>
        </div>
      )}
      <div className="field br-view">{page}</div>
      <StatusBar>
        <span>{activeLocal ? `Local File: ${activeLocal.name} (${fmtSize(activeLocal.size)})` : loading ? `Opening ${url}...` : usingProxy ? `Loaded via Compatibility Proxy — ${url}` : 'Done'}</span>
        <span style={{ cursor: 'pointer' }} title="Click to cycle Security Level" onClick={() => setSecLevel((s) => (s === 'compatible' ? 'standard' : s === 'standard' ? 'strict' : 'compatible'))}>
          {activeLocal ? activeLocal.kind.toUpperCase() : `Security: ${SECURITY_MODES.find((m) => m.id === secLevel)?.short}`}
        </span>
      </StatusBar>
    </div>
  );
}

function BMOrganizer({ done, bm, onSave }) {
  const [list, setList] = useState(bm);
  const [sel, setSel] = useState(-1);
  return (
    <Dialog title="Organize Favorites" onClose={() => done(null)} width={380}>
      <div className="field fd-list">
        {list.map((b, i) => <div key={i} className={'fd-item ' + (sel === i ? 'sel' : '')} onClick={() => setSel(i)}>{b.title} — {b.url}</div>)}
        {!list.length && <div style={{ padding: 6 }}>No favorites.</div>}
      </div>
      <div className="btn-row">
        <button className="btn" disabled={sel < 0} onClick={() => { setList(list.filter((_, i) => i !== sel)); setSel(-1); }}>Delete</button>
        <button className="btn default" onClick={() => { onSave(list); done(true); }}>OK</button>
        <button className="btn" onClick={() => done(null)}>Cancel</button>
      </div>
    </Dialog>
  );
}

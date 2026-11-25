// Unified internal Office inter-app communication engine (SmartTransfer)
// Connects Internet Explorer (browser), WordPad, Notepad, and Paint.
// Uses direct in-memory transfers for active apps + IndexedDB for persistent queue & large payloads.

import { tokenizeHtml } from '../utils/htmlHighlight.js';

const DB_NAME = 'win95-smart-transfer';
const STORE = 'transfers';
const MAX_HISTORY = 24;

export const APP_NAMES = {
  browser: 'Internet Explorer',
  wordpad: 'WordPad',
  notepad: 'Notepad',
  paint: 'Paint',
};

export const APP_ICONS = {
  browser: 'browser',
  wordpad: 'wordpad',
  notepad: 'notepad',
  paint: 'paint',
};

export const SUPPORTED_TYPES = new Set([
  'text/plain',
  'text/html',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

let db = null;
let initP = null;
let seq = 1;
const memMap = new Map(); // id -> full transfer object
const historyOrder = []; // newest first ids
const activeApps = new Map(); // appId -> Array<{ winId, handler }>
const notifySubs = new Set();
const historySubs = new Set();
const tempUrls = new Set();

function openDB() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB unavailable'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('IndexedDB blocked'));
  });
}

function idbPut(rec) {
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(rec);
  } catch { /* ignore */ }
}

function idbDelete(id) {
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
  } catch { /* ignore */ }
}

function idbClear() {
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
  } catch { /* ignore */ }
}

export async function init() {
  if (!initP) {
    initP = (async () => {
      try {
        db = await openDB();
        const rows = await new Promise((res, rej) => {
          const req = db.transaction(STORE).objectStore(STORE).getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => rej(req.error);
        });
        rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        for (const r of rows) {
          if (!memMap.has(r.id)) {
            memMap.set(r.id, r);
            historyOrder.push(r.id);
          }
        }
        pruneHistory();
      } catch {
        db = null;
      }
    })();
  }
  return initP;
}

// Kick off lazy background initialization only when module is loaded
void init();

function pruneHistory() {
  while (historyOrder.length > MAX_HISTORY) {
    const oldestId = historyOrder.pop();
    memMap.delete(oldestId);
    idbDelete(oldestId);
  }
}

function emitHistory() {
  historySubs.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
}

function emitNotify(evt) {
  notifySubs.forEach((fn) => {
    try { fn(evt); } catch { /* ignore */ }
  });
}

function byteSizeOf(payload) {
  if (payload == null) return 0;
  if (payload instanceof Blob) return payload.size;
  if (typeof payload === 'string') return new Blob([payload]).size;
  return 0;
}

export function createTempUrl(blob) {
  const u = URL.createObjectURL(blob);
  tempUrls.add(u);
  return u;
}

export function revokeTempUrl(url) {
  if (!url) return;
  tempUrls.delete(url);
  try { URL.revokeObjectURL(url); } catch { /* ignore */ }
}

export function subscribeNotifications(fn) {
  notifySubs.add(fn);
  return () => notifySubs.delete(fn);
}

export function subscribeHistory(fn) {
  historySubs.add(fn);
  return () => historySubs.delete(fn);
}

export function registerApp(appId, winId, handler) {
  if (!activeApps.has(appId)) activeApps.set(appId, []);
  const list = activeApps.get(appId);
  const entry = { winId, handler, updatedAt: Date.now() };
  list.push(entry);
  return () => {
    const arr = activeApps.get(appId);
    if (!arr) return;
    const idx = arr.indexOf(entry);
    if (idx >= 0) arr.splice(idx, 1);
  };
}

export function touchApp(appId, winId) {
  const arr = activeApps.get(appId);
  if (!arr) return;
  const idx = arr.findIndex((x) => x.winId === winId);
  if (idx >= 0) {
    const [it] = arr.splice(idx, 1);
    it.updatedAt = Date.now();
    arr.push(it); // most recently active at end
  }
}

function latestActiveEntry(appId) {
  const arr = activeApps.get(appId);
  if (!arr || !arr.length) return null;
  return arr[arr.length - 1];
}

export function canPull(sourceApp, kind = 'any') {
  const active = latestActiveEntry(sourceApp);
  if (active?.handler?.getCapability) {
    const cap = active.handler.getCapability();
    if (kind === 'image' && cap?.hasImage) return true;
    if (kind === 'html' && (cap?.hasHtml || cap?.hasText)) return true;
    if (kind === 'text' && (cap?.hasText || cap?.hasHtml)) return true;
    if (kind === 'any' && (cap?.hasContent || cap?.hasText || cap?.hasHtml || cap?.hasImage)) return true;
  }
  // Fallback check: cached/persisted transfer from that sourceApp
  for (const id of historyOrder) {
    const t = memMap.get(id);
    if (!t || t.sourceApp !== sourceApp) continue;
    if (kind === 'image' && t.contentType.startsWith('image/')) return true;
    if (kind !== 'image') return true;
  }
  return false;
}

export async function send({ sourceApp, targetApp, contentType, payload, title = '', meta = {} }) {
  await init();
  const safeType = SUPPORTED_TYPES.has(contentType)
    ? contentType
    : contentType?.startsWith('image/')
      ? 'image/png'
      : 'text/plain';

  const id = `tr-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const transfer = {
    id,
    sourceApp,
    targetApp,
    contentType: safeType,
    payload,
    title: title || APP_NAMES[sourceApp] || 'Transfer',
    meta: meta || {},
    timestamp: Date.now(),
    byteSize: byteSizeOf(payload),
    status: 'pending',
  };

  memMap.set(id, transfer);
  historyOrder.unshift(id);
  pruneHistory();
  idbPut(transfer);
  emitHistory();
  emitNotify({ type: 'incoming', transfer });
  return transfer;
}

export async function getTransfer(id) {
  await init();
  return memMap.get(id) || null;
}

export function markStatus(id, status) {
  const t = memMap.get(id);
  if (!t) return;
  t.status = status;
  idbPut(t);
  emitHistory();
}

export async function deliver(transferId, action, os) {
  const t = await getTransfer(transferId);
  if (!t) return false;

  if (action === 'dismiss') {
    markStatus(transferId, 'dismissed');
    emitNotify({ type: 'resolved', id: transferId });
    return true;
  }

  const targetEntry = latestActiveEntry(t.targetApp);
  if (targetEntry?.handler?.receiveTransfer) {
    os.focus(targetEntry.winId);
    const applied = await targetEntry.handler.receiveTransfer(t, action);
    if (applied) {
      markStatus(transferId, 'accepted');
      emitNotify({ type: 'resolved', id: transferId });
    }
    return applied;
  }

  // Launch target application cleanly with pending transfer ID
  markStatus(transferId, 'accepted');
  emitNotify({ type: 'resolved', id: transferId });
  os.open(t.targetApp, { transferId: t.id, transferAction: action });
  return true;
}

export async function pull({ sourceApp, targetApp, kind = 'any' }) {
  await init();
  const active = latestActiveEntry(sourceApp);
  if (active?.handler?.pullFor) {
    const pulled = await active.handler.pullFor(targetApp, kind);
    if (pulled && pulled.payload != null) {
      const id = `tr-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const transfer = {
        id,
        sourceApp,
        targetApp,
        contentType: SUPPORTED_TYPES.has(pulled.contentType) ? pulled.contentType : 'text/plain',
        payload: pulled.payload,
        title: pulled.title || APP_NAMES[sourceApp],
        meta: pulled.meta || {},
        timestamp: Date.now(),
        byteSize: byteSizeOf(pulled.payload),
        status: 'accepted',
      };
      memMap.set(id, transfer);
      historyOrder.unshift(id);
      pruneHistory();
      idbPut(transfer);
      emitHistory();
      return transfer;
    }
  }

  // Fallback to latest stored transfer originating from sourceApp
  for (const id of historyOrder) {
    const t = memMap.get(id);
    if (!t || t.sourceApp !== sourceApp) continue;
    if (kind === 'image' && !t.contentType.startsWith('image/')) continue;
    return t;
  }
  return null;
}

export function listHistory() {
  return historyOrder
    .map((id) => memMap.get(id))
    .filter(Boolean)
    .map(({ id, sourceApp, targetApp, contentType, title, timestamp, byteSize, status }) => ({
      id,
      sourceApp,
      targetApp,
      contentType,
      title,
      timestamp,
      byteSize,
      status,
    }));
}

export function deleteTransfer(id) {
  memMap.delete(id);
  const idx = historyOrder.indexOf(id);
  if (idx >= 0) historyOrder.splice(idx, 1);
  idbDelete(id);
  emitHistory();
}

export function clearHistory() {
  memMap.clear();
  historyOrder.length = 0;
  for (const u of tempUrls) {
    try { URL.revokeObjectURL(u); } catch { /* ignore */ }
  }
  tempUrls.clear();
  idbClear();
  emitNotify({ type: 'cleared' });
  emitHistory();
}

// ---------- Content & Conversion Helpers ----------

const TOKEN_COLORS = {
  comment: '#008000',
  doctype: '#808080',
  bracket: '#000080',
  tag: '#800000',
  attr: '#c00000',
  str: '#0000ff',
  entity: '#800080',
  plain: '#000000',
};

const escHtml = (s) =>
  String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function plainTextToEditableHtml(text) {
  return String(text || '')
    .replace(/\r?\n/g, '\n')
    .split('\n')
    .map((ln) => `<p>${ln ? escHtml(ln) : '<br>'}</p>`)
    .join('');
}

export function syntaxHighlightToInlineHtml(sourceText) {
  const clean = String(sourceText || '').replace(/\r?\n/g, '\n');
  const tokens = tokenizeHtml(clean);
  const inner = tokens
    .map((tk) => {
      const col = TOKEN_COLORS[tk.type] || '#000000';
      const esc = escHtml(tk.text);
      return tk.type === 'plain' ? esc : `<span style="color:${col};">${esc}</span>`;
    })
    .join('');
  return `<pre style="font-family:'Lucida Console','Courier New',monospace;font-size:10pt;white-space:pre-wrap;word-break:break-word;margin:0;color:#000000;">${inner || '<br>'}</pre>`;
}

export async function normalizeImageBlob(blob) {
  if (!blob) return null;
  const type = (blob.type || '').toLowerCase();
  if (type === 'image/png' || type === 'image/jpeg' || type === 'image/webp' || type === 'image/gif') {
    return blob;
  }
  // Convert SVG/BMP/ICO or untyped image blobs cleanly to PNG preserving exact dimensions
  const url = createTempUrl(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || img.width || 1;
    const h = img.naturalHeight || img.height || 1;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    const pngBlob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    return pngBlob || blob;
  } finally {
    revokeTempUrl(url);
  }
}

export async function imageSrcToBlob(src) {
  if (!src) return null;
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    const res = await fetch(src);
    const b = await res.blob();
    return normalizeImageBlob(b);
  }
  // Same-origin or CORS fetch; fallback to proxy for remote images
  try {
    const res = await fetch(src);
    if (res.ok) return normalizeImageBlob(await res.blob());
  } catch { /* fallback below */ }

  if (/^https?:\/\//i.test(src)) {
    const res = await fetch('/api/browse?url=' + encodeURIComponent(src));
    if (res.ok) return normalizeImageBlob(await res.blob());
  }
  return null;
}

export function extractTextFromHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  return (doc.body?.innerText || doc.body?.textContent || '').trim();
}

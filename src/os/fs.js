// IndexedDB-backed virtual filesystem (C: drive). Falls back to in-memory if IDB is unavailable.
import { useSyncExternalStore } from 'react';

const DB_NAME = 'win95-smart-fs';
const STORE = 'nodes';
let db = null;
const nodes = new Map();
const subs = new Set();
let ver = 0;
let readyP = null;
export const ROOT = 'root';
export const clip = { ids: [], cut: false };

function openDB() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB unavailable'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  });
}
function idbPut(n) {
  if (!db) return;
  try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(n); } catch (e) { console.warn('FS write failed', e); }
}
function idbDel(id) {
  if (!db) return;
  try { db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id); } catch (e) { console.warn(e); }
}
function emit() { ver++; subs.forEach((f) => f()); }
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const useFS = () => useSyncExternalStore(subscribe, () => ver);

function wavBlob(notes) {
  const rate = 22050;
  const total = Math.ceil(rate * Math.max(...notes.map((n) => n.t + n.d)));
  const buf = new Float32Array(total);
  for (const n of notes) {
    const s = Math.floor(n.t * rate), len = Math.floor(n.d * rate);
    for (let i = 0; i < len && s + i < total; i++) {
      const env = Math.min(1, i / 200) * Math.pow(1 - i / len, 1.5);
      buf[s + i] += Math.sin((2 * Math.PI * n.f * i) / rate) * env * (n.v || 0.3);
    }
  }
  const dv = new DataView(new ArrayBuffer(44 + total * 2));
  const w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + total * 2, true); w(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, total * 2, true);
  for (let i = 0; i < total; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, buf[i])) * 32767, true);
  return new Blob([dv], { type: 'audio/wav' });
}

const APP_EXES = {
  'notepad.exe': 'notepad', 'wordpad.exe': 'wordpad', 'write.exe': 'wordpad', 'calc.exe': 'calc', 'mspaint.exe': 'paint', 'explorer.exe': 'explorer',
  'control.exe': 'control', 'mplayer.exe': 'media', 'sndrec32.exe': 'sndrec', 'command.com': 'dos', 'winmine.exe': 'minesweeper',
  'sol.exe': 'solitaire', 'freecell.exe': 'freecell', 'mshearts.exe': 'hearts', 'tetris.exe': 'tetris',
  'snake.exe': 'snake', 'iexplore.exe': 'browser', 'dosgames.exe': 'dosgames', 'drives.exe': 'drives', 'sysmon.exe': 'sysmon', 'winhelp.exe': 'help',
};

export const ROM_FOLDERS = {
  dosbox: 'rom_dos',
  amiga: 'rom_amiga',
  amiga_sae_aros: 'rom_amiga',
  amiga_vami_aros: 'rom_amiga',
  amiga_emutos: 'rom_amiga',
  atarist: 'rom_atarist',
  amstradcpc: 'rom_amstrad',
  c64: 'rom_c64',
  zxspectrum: 'rom_zx',
  nes: 'rom_consoles',
  snes: 'rom_consoles',
  segaMD: 'rom_consoles',
  segaMS: 'rom_consoles',
  arcade: 'rom_consoles',
  pce: 'rom_consoles',
  gb: 'rom_consoles',
  gba: 'rom_consoles',
  mac68k: 'games',
};

export const ALL_ROM_FOLDER_IDS = [
  'games',
  'rom_dos',
  'rom_amiga',
  'rom_atarist',
  'rom_amstrad',
  'rom_c64',
  'rom_zx',
  'rom_consoles',
];

export function romFolderForSystem(sysId) {
  return ROM_FOLDERS[sysId] || 'games';
}

function ensureSystemFolders() {
  const t = Date.now();
  const ensure = (id, name, parent) => {
    if (!nodes.has(id)) {
      const f = { id, name, parent, type: 'folder', data: undefined, size: 0, created: t, modified: t };
      nodes.set(id, f);
      idbPut(f);
    }
  };
  ensure('bios', 'BIOS', ROOT);
  ensure('saves', 'Saves', ROOT);
  ensure('rom_dos', 'DOS', ROOT);
  ensure('rom_amiga', 'Amiga', ROOT);
  ensure('rom_atarist', 'AtariST', ROOT);
  ensure('rom_amstrad', 'Amstrad', ROOT);
  ensure('rom_c64', 'C64', ROOT);
  ensure('rom_zx', 'ZXSpectrum', ROOT);
  ensure('rom_consoles', 'Consoles', ROOT);
}

async function seed() {
  const t = Date.now();
  const mk = (id, name, parent, type, data, mime) =>
    nodes.set(id, { id, name, parent, type, data, mime, size: type === 'folder' ? 0 : (data?.length ?? data?.size ?? 0), created: t, modified: t });
  mk(ROOT, 'C:', null, 'folder');
  mk('win', 'Windows', ROOT, 'folder');
  mk('desktop', 'Desktop', 'win', 'folder');
  mk('media', 'Media', 'win', 'folder');
  mk('pf', 'Program Files', ROOT, 'folder');
  mk('docs', 'My Documents', ROOT, 'folder');
  mk('games', 'DOS Games', ROOT, 'folder');
  mk('rom_dos', 'DOS', ROOT, 'folder');
  mk('rom_amiga', 'Amiga', ROOT, 'folder');
  mk('rom_atarist', 'AtariST', ROOT, 'folder');
  mk('rom_amstrad', 'Amstrad', ROOT, 'folder');
  mk('rom_c64', 'C64', ROOT, 'folder');
  mk('rom_zx', 'ZXSpectrum', ROOT, 'folder');
  mk('rom_consoles', 'Consoles', ROOT, 'folder');
  mk('bios', 'BIOS', ROOT, 'folder');
  mk('saves', 'Saves', ROOT, 'folder');
  mk('temp', 'Temp', 'win', 'folder');
  Object.entries(APP_EXES).forEach(([n, a], i) => mk('exe' + i, n, n === 'command.com' ? 'win' : 'win', 'file', 'app:' + a, 'application/x-app'));
  mk('welcome', 'Welcome.txt', 'docs', 'file',
    'Welcome to Windows 95 Smart Edition!\r\n\r\nThis is a fully working Windows 95 desktop that runs entirely in your browser.\r\n\r\n- Everything you save lives in your browser (IndexedDB) on drive C:.\r\n- Use Windows Explorer to create, copy, move, rename and delete files.\r\n- Import your own files with File > Import from computer... in Explorer.\r\n- Try Paint, Notepad, the Calculator, the Media Player and six classic games.\r\n- DOS Games runs real DOS programs using js-dos (DOSBox in WebAssembly).\r\n\r\nEnjoy!\r\n', 'text/plain');
  mk('todo', 'Notes.txt', 'docs', 'file', 'Things to try:\r\n  1. Draw something in Paint and save it locally or to C:.\r\n  2. Edit Welcome.rtf in WordPad (supports RTF & HTML).\r\n  3. Change the desktop theme in Control Panel.\r\n  4. Run DOSBox, Floppy, Win95 CD ISOs, Amiga, C64, Amstrad, ZX Spectrum, or Atari ST software.\r\n', 'text/plain');
  mk('welcomertf', 'Welcome.rtf', 'docs', 'file',
    '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}{\\f1 Courier New;}}{\\colortbl;\\red0\\green0\\blue128;\\red0\\green128\\blue0;}\\pard\\qc\\b\\fs32\\cf1 Windows 95 WordPad\\b0\\fs24\\cf0\\par\\pard\\ql\\parWelcome to \\b WordPad\\b0! You can format text with \\i italics\\i0, \\ul underline\\ulnone, colors (\\cf2 like this\\cf0), and open or save \\b .RTF\\b0 and \\b .HTML\\b0 files both on drive C: and on your local PC.\\par}', 'application/rtf');
  mk('m1', 'Chimes.wav', 'media', 'file', wavBlob([{ f: 880, t: 0, d: 0.5 }, { f: 1108, t: 0.12, d: 0.5 }, { f: 1318, t: 0.24, d: 0.8 }]), 'audio/wav');
  mk('m2', 'Ding.wav', 'media', 'file', wavBlob([{ f: 1320, t: 0, d: 0.7, v: 0.4 }]), 'audio/wav');
  mk('m3', 'Tada.wav', 'media', 'file', wavBlob([{ f: 523, t: 0, d: 0.25 }, { f: 659, t: 0.1, d: 0.25 }, { f: 784, t: 0.2, d: 0.25 }, { f: 1047, t: 0.35, d: 1.1 }, { f: 784, t: 0.35, d: 1.1 }, { f: 659, t: 0.35, d: 1.1 }]), 'audio/wav');
  mk('tmp1', '~win95boot.tmp', 'temp', 'file', 'WIN95 SMART CACHE LOG\r\nINIT=OK\r\n', 'text/plain');
  if (db) {
    await new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      const os = tx.objectStore(STORE);
      nodes.forEach((n) => os.put(n));
      tx.oncomplete = res; tx.onerror = res; tx.onabort = res;
    });
  }
}

export function init() {
  if (!readyP) {
    readyP = (async () => {
      try {
        db = await openDB();
        const all = await new Promise((res, rej) => {
          const r = db.transaction(STORE).objectStore(STORE).getAll();
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        all.forEach((n) => nodes.set(n.id, n));
      } catch (e) { db = null; console.warn('Using in-memory filesystem:', e.message); }
      if (!nodes.has(ROOT)) await seed();
      else ensureSystemFolders();
      emit();
    })();
  }
  return readyP;
}

export async function reset() {
  try { db?.close(); } catch (e) { /* ignore */ }
  db = null;
  await new Promise((res) => {
    if (typeof indexedDB === 'undefined') return res();
    const q = indexedDB.deleteDatabase(DB_NAME);
    q.onsuccess = q.onerror = q.onblocked = () => res();
  });
}

export function exportAllNodes() {
  return [...nodes.values()].map((n) => ({ ...n }));
}

export async function restoreSnapshot(records) {
  if (!Array.isArray(records) || !records.some((r) => r && r.id === ROOT && r.type === 'folder')) {
    throw new Error('Invalid filesystem snapshot: missing C: root folder.');
  }
  nodes.clear();
  for (const r of records) {
    if (!r || typeof r.id !== 'string' || typeof r.name !== 'string') continue;
    nodes.set(r.id, { ...r });
  }
  if (db) {
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      const os = tx.objectStore(STORE);
      os.clear();
      nodes.forEach((n) => os.put(n));
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error || new Error('IndexedDB restore failed'));
      tx.onabort = () => rej(tx.error || new Error('IndexedDB restore aborted'));
    });
  }
  emit();
}
export const get = (id) => nodes.get(id);
export const ext = (name) => { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i + 1).toLowerCase(); };
export const isFolder = (id) => nodes.get(id)?.type === 'folder';
const cmp = (a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.type === 'folder' ? -1 : 1);

export function children(pid) {
  const out = [];
  nodes.forEach((n) => { if (n.parent === pid && !n.trashed) out.push(n); });
  return out.sort(cmp);
}
export function pathOf(id) {
  const parts = [];
  let n = nodes.get(id);
  while (n) { parts.unshift(n.name); n = n.parent ? nodes.get(n.parent) : null; }
  return parts.join('\\') + (parts.length === 1 ? '\\' : '');
}
export function resolve(path, cwd = ROOT) {
  let p = path.trim().replace(/\//g, '\\');
  let cur = cwd;
  if (/^[a-z]:/i.test(p)) { cur = ROOT; p = p.slice(2); }
  if (p.startsWith('\\')) { cur = ROOT; p = p.slice(1); }
  for (const part of p.split('\\').filter(Boolean)) {
    if (part === '.') continue;
    if (part === '..') { cur = nodes.get(cur)?.parent || cur; continue; }
    const n = children(cur).find((c) => c.name.toLowerCase() === part.toLowerCase());
    if (!n) return null;
    cur = n.id;
  }
  return nodes.get(cur) || null;
}
export function nameExists(parent, name, exceptId) {
  return children(parent).some((c) => c.id !== exceptId && c.name.toLowerCase() === name.toLowerCase());
}
export function uniqueName(parent, name, prefix = '') {
  if (!nameExists(parent, prefix + name)) return prefix + name;
  const i = name.lastIndexOf('.');
  const base = i > 0 ? name.slice(0, i) : name, e = i > 0 ? name.slice(i) : '';
  for (let k = 2; ; k++) { const nn = `${prefix}${base} (${k})${e}`; if (!nameExists(parent, nn)) return nn; }
}
const newId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sizeOfData = (d) => (d == null ? 0 : typeof d === 'string' ? d.length : d.size ?? d.byteLength ?? 0);
const badName = (name) => !name || /[\\/:*?"<>|]/.test(name) || name.length > 200;

export function create({ name, parent = 'docs', type = 'file', data = '', mime, unique = true }) {
  if (!nodes.has(parent) || nodes.get(parent).type !== 'folder') throw new Error('The destination folder does not exist.');
  if (badName(name)) throw new Error('A file name cannot contain any of the following characters:\n\\ / : * ? " < > |');
  if (!unique && nameExists(parent, name)) throw new Error(`A file or folder named "${name}" already exists.`);
  const t = Date.now();
  const n = { id: newId(), name: unique ? uniqueName(parent, name) : name, parent, type, data: type === 'folder' ? undefined : data, mime, size: sizeOfData(data), created: t, modified: t };
  nodes.set(n.id, n); idbPut(n); emit();
  return n;
}
export function write(id, data, mime) {
  const n = nodes.get(id); if (!n) throw new Error('File not found.');
  n.data = data; n.size = sizeOfData(data); n.modified = Date.now(); if (mime) n.mime = mime;
  idbPut(n); emit(); return n;
}
export function rename(id, name) {
  const n = nodes.get(id);
  if (badName(name)) throw new Error('A file name cannot contain any of the following characters:\n\\ / : * ? " < > |');
  if (nameExists(n.parent, name, id)) throw new Error(`Cannot rename: a file with the name you specified already exists. Specify a different filename.`);
  n.name = name; n.modified = Date.now(); idbPut(n); emit();
}
export function isDescendant(id, ancestor) {
  let n = nodes.get(id);
  while (n) { if (n.id === ancestor) return true; n = n.parent ? nodes.get(n.parent) : null; }
  return false;
}
export function move(id, parent) {
  const n = nodes.get(id);
  if (!n || n.id === ROOT) return;
  if (n.parent === parent) return;
  if (isDescendant(parent, id)) throw new Error('Cannot move a folder into itself.');
  n.parent = parent; n.name = uniqueName(parent, n.name); idbPut(n); emit();
}
export function copy(id, parent, top = true) {
  const n = nodes.get(id);
  if (isDescendant(parent, id) && n.type === 'folder') throw new Error('Cannot copy a folder into itself.');
  const t = Date.now();
  const c = { ...n, id: newId(), parent, name: uniqueName(parent, n.name, top && n.parent === parent ? 'Copy of ' : ''), created: t, modified: t };
  delete c.trashed;
  nodes.set(c.id, c); idbPut(c);
  if (n.type === 'folder') children(id).forEach((k) => copy(k.id, c.id, false));
  if (top) emit();
  return c;
}
export function trash(id) {
  const n = nodes.get(id);
  if (!n || n.id === ROOT) return;
  n.trashed = { parent: n.parent, at: Date.now() }; idbPut(n); emit();
}
export function restore(id) {
  const n = nodes.get(id);
  if (!n?.trashed) return;
  let p = n.trashed.parent;
  const pn = nodes.get(p);
  if (!pn || pn.trashed) p = ROOT;
  n.parent = p; delete n.trashed; n.name = uniqueName(p, n.name); idbPut(n); emit();
}
function removeRec(id) {
  nodes.forEach((n) => { if (n.parent === id) removeRec(n.id); });
  nodes.delete(id); idbDel(id);
}
export function remove(id) { if (id === ROOT) return; removeRec(id); emit(); }
export const trashList = () => [...nodes.values()].filter((n) => n.trashed).sort(cmp);
export function emptyTrash() { trashList().forEach((n) => removeRec(n.id)); emit(); }
export function search(q, limit = 300) {
  q = q.toLowerCase();
  const out = [];
  nodes.forEach((n) => { if (!n.trashed && n.id !== ROOT && n.name.toLowerCase().includes(q)) out.push(n); });
  return out.sort(cmp).slice(0, limit);
}
export function folderSize(id) {
  let s = 0;
  children(id).forEach((c) => { s += c.type === 'folder' ? folderSize(c.id) : c.size; });
  return s;
}
export async function readText(n) {
  const d = n?.data;
  if (typeof d === 'string') return d;
  if (d && d.text) return d.text();
  return '';
}
export function toBlob(n) {
  const d = n.data;
  if (d instanceof Blob) return d;
  return new Blob([d ?? ''], { type: n.mime || 'text/plain' });
}
export const blobUrl = (n) => URL.createObjectURL(toBlob(n));
export async function importFile(file, parent) {
  const isText = /\.(txt|md|log|ini|bat|cfg|json|js|css|html?|rtf|xml|csv|inf|sys)$/i.test(file.name) || file.type.startsWith('text/') || file.type === 'application/rtf';
  const data = isText && file.size < 2e6 ? await file.text() : file;
  return create({ name: file.name, parent, data, mime: file.type || undefined });
}
export function copyToClip(ids, cut) { clip.ids = [...ids]; clip.cut = cut; emit(); }
export function paste(parent) {
  const made = [];
  for (const id of clip.ids) {
    const n = nodes.get(id);
    if (!n || n.trashed) continue;
    if (clip.cut) { move(id, parent); made.push(n); } else made.push(copy(id, parent));
  }
  if (clip.cut) clip.ids = [];
  emit();
  return made;
}
export function downloadNode(n) {
  const url = blobUrl(n);
  const a = document.createElement('a');
  a.href = url; a.download = n.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function appOfExe(n) { return typeof n.data === 'string' && n.data.startsWith('app:') ? n.data.slice(4) : null; }

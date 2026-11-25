import { createContext, useContext, useState, useRef, useEffect, useMemo } from 'react';
import { APPS, ALIASES } from './registry.js';
import * as fs from './fs.js';
import { play } from './sound.js';

const ApiCtx = createContext(null);
const StCtx = createContext(null);
export const useOS = () => useContext(ApiCtx);
export const useOSState = () => useContext(StCtx);
export const TASKBAR_H = 30;

const TEXT_EXT = ['txt', 'md', 'log', 'ini', 'cfg', 'bat', 'json', 'js', 'css', 'csv', 'xml', 'inf', 'sys', 'nfo'];
const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
const MEDIA_EXT = ['wav', 'mp3', 'ogg', 'm4a', 'flac', 'aac', 'mp4', 'webm', 'mov', 'ogv', 'mkv'];
const RETRO_EXT = ['zip', 'jsdos', 'img', 'ima', 'vfd', 'iso', 'cue', 'bin', 'adf', 'ipf', 'dms', 'lha', 'hdf', 'dsk', 'sna', 'cdt', 'voc', 'd64', 'd71', 'd81', 't64', 'prg', 'crt', 'tap', 'tzx', 'z80', 'trd', 'scl', 'st', 'msa', 'stx', 'dim'];

export function OSProvider({ children }) {
  const [wins, setWins] = useState([]);
  const [dialogs, setDialogs] = useState([]);
  const [menu, setMenu] = useState(null);
  const [phase, setPhase] = useState('boot');
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [startOpen, setStartOpen] = useState(false);
  const R = useRef({ z: 100, seq: 1, opened: 0, guards: {}, wins: [], dialogs: [], boot: 'normal' }).current;
  R.wins = wins; R.dialogs = dialogs;

  useEffect(() => {
    const f = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);

  const api = useMemo(() => {
    const a = {};
    const upd = (id, fn) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, ...(typeof fn === 'function' ? fn(w) : fn) } : w)));
    const dlg = (kind, opts) => new Promise((res) => setDialogs((d) => [...d, { id: R.seq++, kind, opts, res }]));

    a.open = (appId, props = {}, opts = {}) => {
      const app = APPS[appId];
      if (!app) { a.msg({ icon: 'error', text: `Cannot find the program "${appId}".` }); return null; }
      if (app.single) {
        const ex = R.wins.find((w) => w.appId === appId);
        if (ex) {
          a.focus(ex.id);
          upd(ex.id, (w) => ({ props: { ...w.props, ...props }, nonce: (w.nonce || 0) + 1 }));
          return ex.id;
        }
      }
      const vw = window.innerWidth, vh = window.innerHeight - TASKBAR_H;
      const w = Math.min(opts.w || app.w || 520, vw - 6), h = Math.min(opts.h || app.h || 380, vh - 6);
      const off = (R.opened++ % 8) * 26;
      const x = Math.max(0, Math.min(36 + off, vw - w)), y = Math.max(0, Math.min(24 + off, vh - h));
      const id = R.seq++;
      setWins((ws) => [...ws, { id, appId, title: app.title, icon: app.icon, x, y, w, h, min: false, max: !!opts.max, z: ++R.z, props, nonce: 0 }]);
      setStartOpen(false);
      play('open');
      return id;
    };
    a.focus = (id) => {
      const cur = R.wins.find((w) => w.id === id);
      if (cur && !cur.min && cur.z === R.z) return;
      upd(id, { min: false, z: ++R.z });
    };
    a.close = async (id) => {
      const g = R.guards[id];
      if (g) { const ok = await g(); if (!ok) return; }
      delete R.guards[id];
      setWins((ws) => ws.filter((w) => w.id !== id));
    };
    a.minimize = (id) => { play('minimize'); upd(id, { min: true }); };
    a.toggleMax = (id) => upd(id, (w) => ({ max: !w.max, z: ++R.z }));
    a.move = (id, x, y) => upd(id, { x, y });
    a.resize = (id, r) => upd(id, r);
    a.setTitle = (id, title, icon) => upd(id, icon ? { title, icon } : { title });
    a.setGuard = (id, fn) => { if (fn) R.guards[id] = fn; else delete R.guards[id]; };
    a.minimizeAll = () => setWins((ws) => ws.map((w) => ({ ...w, min: true })));
    a.tile = (horizontal) => {
      const vis = R.wins.filter((w) => !w.min);
      if (!vis.length) return;
      const W = window.innerWidth, H = window.innerHeight - TASKBAR_H;
      const n = vis.length, cols = horizontal ? 1 : Math.ceil(Math.sqrt(n)), rows = horizontal ? n : Math.ceil(n / cols);
      setWins((ws) => ws.map((w) => {
        const i = vis.findIndex((v) => v.id === w.id);
        if (i < 0) return w;
        const c = i % cols, r = Math.floor(i / cols);
        return { ...w, max: false, x: Math.floor((c * W) / cols), y: Math.floor((r * H) / rows), w: Math.floor(W / cols), h: Math.floor(H / rows) };
      }));
    };
    a.cascade = () => {
      const vis = R.wins.filter((w) => !w.min);
      setWins((ws) => ws.map((w) => {
        const i = vis.findIndex((v) => v.id === w.id);
        return i < 0 ? w : { ...w, max: false, x: 20 + i * 28, y: 14 + i * 28, z: ++R.z };
      }));
    };
    a.msg = (o) => {
      if (typeof o === 'string') o = { text: o };
      play(o.icon === 'error' ? 'error' : o.icon === 'warning' ? 'exclaim' : 'ding');
      return dlg('msg', o);
    };
    a.prompt = (o) => dlg('prompt', o);
    a.fileDialog = (o) => dlg('file', o);
    a.dialog = (render) => dlg('custom', { render });
    a.resolveDialog = (id, val) => {
      const d = R.dialogs.find((x) => x.id === id);
      if (!d) return;
      setDialogs((ds) => ds.filter((x) => x.id !== id));
      d.res(val);
    };
    a.showMenu = (x, y, items) => setMenu({ x, y, items, k: R.seq++ });
    a.hideMenu = () => setMenu(null);
    a.setStart = setStartOpen;

    a.run = (cmd) => {
      cmd = (cmd || '').trim();
      if (!cmd) return false;
      const l = cmd.toLowerCase();
      if (/^(https?:\/\/|www\.)/.test(l) || /^[\w-]+(\.[\w-]+)*\.(com|org|net|edu|gov|io|dev|info)(\/|$)/.test(l)) { a.open('browser', { url: cmd }); return true; }
      const name = l.replace(/\.(exe|com)$/, '');
      if (ALIASES[name]) { a.open(ALIASES[name]); return true; }
      const node = fs.resolve(cmd);
      if (node) { a.openNode(node); return true; }
      return false;
    };
    a.openNode = (n) => {
      if (!n) return;
      if (n.type === 'folder') { a.open('explorer', { folderId: n.id }); return; }
      const e = fs.ext(n.name);
      const app = fs.appOfExe(n);
      if (app) a.open(app);
      else if (e === 'exe' || e === 'com') a.open('dosgames', { fileId: n.id });
      else if (e === 'dll') a.msg({ icon: 'error', title: n.name, text: `${n.name} is a library file and cannot be executed directly.` });
      else if (e === 'rtf') a.open('wordpad', { fileId: n.id });
      else if (IMG_EXT.includes(e)) a.open('paint', { fileId: n.id });
      else if (MEDIA_EXT.includes(e)) a.open('media', { fileId: n.id });
      else if (RETRO_EXT.includes(e)) a.open('dosgames', { fileId: n.id });
      else if (e === 'pdf') a.open('acrobat', { fsNodeId: n.id });
      else if (e === 'html' || e === 'htm' || e === 'xhtml' || e === 'svg') a.open('browser', { fsNodeId: n.id });
      else if (TEXT_EXT.includes(e) || !e || (n.size || 0) < 1e6) a.open('notepad', { fileId: n.id });
      else a.msg({ icon: 'warning', title: 'Open With', text: `Windows cannot open this file:\n${n.name}` });
    };

    a.shutdown = (kind) => {
      play('shutdown');
      R.boot = kind;
      setStartOpen(false); setMenu(null);
      setPhase('shutting');
      setTimeout(() => {
        setWins([]); setDialogs([]); R.guards = {};
        setPhase(kind === 'shutdown' ? 'off' : 'boot');
      }, 2400);
    };
    a.powerOn = () => setPhase('boot');
    a.finishBoot = () => {
      setPhase('on');
      play('startup');
      if (R.boot === 'dos') a.open('dos', {}, { max: true });
      R.boot = 'normal';
    };
    return a;
  }, [R]);

  const active = useMemo(() => {
    let best = null;
    wins.forEach((w) => { if (!w.min && (!best || w.z > best.z)) best = w; });
    return best ? best.id : null;
  }, [wins]);

  const st = useMemo(() => ({ wins, dialogs, menu, phase, vp, startOpen, active, compact: vp.w < 720 }), [wins, dialogs, menu, phase, vp, startOpen, active]);

  // Global keyboard shortcuts
  useEffect(() => {
    const h = (e) => {
      if (phase !== 'on') return;
      if (e.altKey && e.key === 'F4') { e.preventDefault(); if (active) api.close(active); }
      else if (e.key === 'Escape' && startOpen) setStartOpen(false);
      else if (e.ctrlKey && e.key === 'Escape') { e.preventDefault(); setStartOpen((s) => !s); }
      else if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        const order = [...R.wins].sort((a, b) => a.id - b.id);
        if (order.length > 1) { const i = order.findIndex((w) => w.id === active); api.focus(order[(i + 1) % order.length].id); }
      } else if (e.key === 'F1' && !e.target.closest?.('input,textarea,.jsdos-host')) { e.preventDefault(); api.open('help'); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [phase, active, startOpen, api, R]);

  return <ApiCtx.Provider value={api}><StCtx.Provider value={st}>{children}</StCtx.Provider></ApiCtx.Provider>;
}

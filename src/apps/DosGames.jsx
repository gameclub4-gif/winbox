import { useState, useRef, useEffect } from 'react';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar, Dialog } from '../os/widgets.jsx';
import Icon from '../os/icons.jsx';
import * as fs from '../os/fs.js';
import { fmtSize } from '../os/actions.js';
import { pickLocalFiles, saveLocalFile } from '../os/localFiles.js';
import { pickLocalDirectory } from '../utils/localFolder.js';
import {
  useVirtualDrives,
  mountFloppyA,
  mountCdromD,
  mountRemovableFolder,
} from '../utils/virtualDrives.js';
import {
  FREE_BIOS_SYSTEMS,
  CONSOLE_SYSTEMS,
  ESTYJS_CDN_BASE,
  SAE_CDN_BASE,
  crc32Bytes,
  makeBlankAmigaAdf,
  makeBlankCpcDsk,
  makeBlankZxTzx,
  makeBlankC64D64,
} from '../utils/retroBios.js';

const JSDOS_JS = 'https://v8.js-dos.com/latest/js-dos.js';
const JSDOS_CSS = 'https://v8.js-dos.com/latest/js-dos.css';
const EJS_LOADER = 'https://cdn.emulatorjs.org/stable/data/loader.js';
const EJS_DATA = 'https://cdn.emulatorjs.org/stable/data/';
const USER_LINKS_KEY = 'win95.user.romLinks.v1';
const USER_PROFILES_KEY = 'win95.user.romProfiles.v1';

const TOOLTIP_ZERO_ROMS = 'Zero preloaded ROMs. Only simulator cores live in this app — load your own local files, PC folders, or personal web links.';
const TOOLTIP_DROP_HINT = 'Tip: Click Boot BIOS for FreeDOS/Amiga/Atari ST/C64/ZX/Amstrad, Open ROM for consoles/arcade, or drop any DOS, Floppy, Win95 CD ISO, Amiga, Amstrad, C64, ZX Spectrum, Atari ST, Console/FBNeo, or Mac (.hfv/.dsk/.sit/.hqx) file onto the screen.';

const MAC_VERSIONS = [
  { id: 'System 7.5.3', label: 'System 7.5.3 (68k + Software HD)' },
  { id: 'Mac OS 8.1', label: 'Mac OS 8.1 (Quadra + Software HD)' },
  { id: 'Mac OS 9.0.4', label: 'Mac OS 9.0.4 (PowerMac + Software HD)' },
  { id: 'System 6.0.8', label: 'System 6.0.8 (Mac Plus + Software HD)' },
];

const SYSTEMS = [
  { id: 'dosbox', short: 'DOS', label: 'DOSBox / Win95 CD', core: 'dosbox_pure', exts: ['jsdos', 'zip', 'exe', 'com', 'bat', 'img', 'ima', 'vfd', 'iso', 'cue', 'bin'], hint: '.jsdos, .zip, .exe, Floppy (.img/.ima), CD (.iso/.cue)' },
  { id: 'amiga', short: 'Amiga', label: 'Commodore Amiga', core: 'amiga', exts: ['adf', 'ipf', 'dms', 'lha', 'hdf', 'zip'], hint: '.adf, .ipf, .dms, .lha, .hdf, .zip (PUAE / SAE AROS)' },
  { id: 'amstradcpc', short: 'Amstrad', label: 'Amstrad CPC', core: 'cap32', exts: ['dsk', 'sna', 'cdt', 'voc', 'zip'], hint: '.dsk, .sna, .cdt, .zip (Caprice32 · CPC BIOS built-in)' },
  { id: 'c64', short: 'C64', label: 'Commodore 64', core: 'c64', exts: ['d64', 'd71', 'd81', 't64', 'prg', 'crt', 'tap', 'zip'], hint: '.d64, .t64, .prg, .crt, .tap, .zip (VICE x64sc)' },
  { id: 'zxspectrum', short: 'ZX Spec', label: 'ZX Spectrum', core: 'fuse', exts: ['tap', 'tzx', 'z80', 'sna', 'dsk', 'trd', 'scl', 'zip'], hint: '.tap, .tzx, .z80, .sna, .dsk, .zip (Fuse · Spectrum BIOS built-in)' },
  { id: 'atarist', short: 'Atari ST', label: 'Atari ST', core: 'estyjs', exts: ['st', 'msa', 'sts', 'zip'], hint: '.st, .msa, .sts, .zip (EstyJS + Open-Source EmuTOS 1.4)' },
  { id: 'mac68k', short: 'Mac OS', label: 'Classic Mac OS (Run Old Mac Apps)', core: 'infinitemac', exts: ['hfv', 'toast', 'sit', 'hqx'], hint: 'Boot System 6/7/8/9 + Apps HD, or drop .hfv/.dsk/.sit/.hqx onto the booted Mac' },
  ...CONSOLE_SYSTEMS,
];

const ALL_EXTS = [...new Set([...SYSTEMS.flatMap((s) => s.exts), 'dsk'])];
const MAX_IDB_BYTES = 32 * 1024 * 1024;
const DEFAULT_PROFILE = { cycles: 'auto', sound: 'sb16', aspect: 'contain', customAutoexec: '' };

function isUnsafeKey(k) {
  return !k || k === '__proto__' || k === 'constructor' || k === 'prototype';
}

function loadSavedLinks() {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_LINKS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((x) => x && typeof x.id === 'string' && typeof x.url === 'string' && /^https?:\/\//i.test(x.url));
  } catch {
    return [];
  }
}

function loadRomProfiles() {
  const map = Object.create(null);
  try {
    const raw = JSON.parse(localStorage.getItem(USER_PROFILES_KEY) || '{}');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw)) {
        if (isUnsafeKey(k) || !v || typeof v !== 'object') continue;
        map[k] = {
          cycles: ['auto', 'max', '3000', '12000'].includes(v.cycles) ? v.cycles : 'auto',
          sound: ['sb16', 'adlib', 'gus', 'none'].includes(v.sound) ? v.sound : 'sb16',
          aspect: ['contain', 'cover'].includes(v.aspect) ? v.aspect : 'contain',
          customAutoexec: typeof v.customAutoexec === 'string' ? v.customAutoexec.slice(0, 400) : '',
        };
      }
    }
  } catch { /* ignore */ }
  return map;
}

function detectSystemFromExt(name, fallback = 'dosbox') {
  const e = fs.ext(name);
  if (['hfv', 'toast', 'sit', 'hqx'].includes(e)) return 'mac68k';
  if (['adf', 'ipf', 'dms', 'lha', 'hdf'].includes(e)) return 'amiga';
  if (['cdt', 'voc'].includes(e)) return 'amstradcpc';
  if (['d64', 'd71', 'd81', 't64', 'prg', 'crt'].includes(e)) return 'c64';
  if (['tzx', 'z80', 'trd', 'scl'].includes(e)) return 'zxspectrum';
  if (['st', 'msa', 'stx', 'dim', 'sts'].includes(e)) return 'atarist';
  if (['nes', 'fds', 'unif', 'unf'].includes(e)) return 'nes';
  if (['sfc', 'smc', 'fig', 'swc'].includes(e)) return 'snes';
  if (['md', 'gen', 'smd', '32x'].includes(e)) return 'segaMD';
  if (['sms', 'gg', 'sg'].includes(e)) return 'segaMS';
  if (['pce', 'ccd'].includes(e)) return 'pce';
  if (['gb', 'gbc'].includes(e)) return 'gb';
  if (e === 'gba') return 'gba';
  if (['fbf', 'neo', '7z'].includes(e)) return 'arcade';
  if (['jsdos', 'exe', 'com', 'bat', 'ima', 'vfd', 'iso', 'cue', 'bin'].includes(e)) return 'dosbox';
  if (e === 'zip' && CONSOLE_SYSTEMS.some((c) => c.id === fallback)) return fallback;
  if (e === 'img') return fallback === 'mac68k' ? 'mac68k' : 'dosbox';
  if (e === 'dsk') return fallback === 'mac68k' ? 'mac68k' : fallback === 'zxspectrum' ? 'zxspectrum' : 'amstradcpc';
  if (e === 'sna') return fallback === 'amstradcpc' ? 'amstradcpc' : 'zxspectrum';
  if (e === 'tap') return fallback === 'c64' ? 'c64' : 'zxspectrum';
  return fallback;
}

export function normalizeMediaUrl(raw) {
  let u = (raw || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const gh = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/i);
  if (gh) return `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}`;
  if (/^https?:\/\/(www\.)?dropbox\.com\//i.test(u)) {
    const parsed = new URL(u);
    parsed.searchParams.set('dl', '1');
    return parsed.toString();
  }
  const gd = u.match(/^https?:\/\/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (gd) return `https://drive.usercontent.google.com/download?id=${gd[1]}&export=download&confirm=t`;
  return u;
}

function toWebEmbedUrl(raw) {
  let u = (raw || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const arch = u.match(/^https?:\/\/(?:www\.)?archive\.org\/details\/([^/?#]+)/i);
  if (arch) return `https://archive.org/embed/${arch[1]}`;
  return u;
}

function looksLikeBinarySoftwareUrl(u) {
  const pathPart = u.split('?')[0].split('#')[0];
  const ext = pathPart.includes('.') ? pathPart.split('.').pop().toLowerCase() : '';
  return ALL_EXTS.includes(ext) || /raw\.githubusercontent\.com|drive\.usercontent\.google\.com|archive\.org\/download\/|dl=1/i.test(u);
}

function buildDosConf(prof, autoexecLines) {
  const p = prof || DEFAULT_PROFILE;
  const sbType = p.sound === 'sb16' ? 'sb16' : 'none';
  const oplMode = p.sound === 'adlib' ? 'opl2' : p.sound === 'none' ? 'none' : 'auto';
  const lines = [
    '[sdl]',
    'autolock=false',
    '[dosbox]',
    'memsize=16',
    '[cpu]',
    'core=auto',
    `cycles=${p.cycles === 'auto' ? 'auto' : p.cycles}`,
    '[render]',
    'frameskip=0',
    '[sblaster]',
    `sbtype=${sbType}`,
    `oplmode=${oplMode}`,
    'oplemu=fast',
    'oplrate=44100',
    '[gus]',
    `gus=${p.sound === 'gus' ? 'true' : 'false'}`,
    '[speaker]',
    'pcspeaker=true',
    '[dos]',
    'xms=true',
    'ems=true',
    '[autoexec]',
    ...autoexecLines,
  ];
  if (p.customAutoexec?.trim()) {
    const extra = p.customAutoexec
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('['));
    lines.push(...extra);
  }
  return lines.filter(Boolean).join('\n') + '\n';
}

const EMU_CTRL_SNIPPET = `<script>(function(){var audioCtxs=[];var OrigAC=window.AudioContext||window.webkitAudioContext;if(OrigAC){
  var Wrapped=function(){
    var ac=new OrigAC();
    audioCtxs.push(ac);
    if(window.__w95Muted||window.__w95Paused){try{ac.suspend();}catch(e){}}
    return ac;
  };
  Wrapped.prototype=OrigAC.prototype;
  window.AudioContext=Wrapped;
  if(window.webkitAudioContext)window.webkitAudioContext=Wrapped;
}
function syncAudio(){
  var hold=Boolean(window.__w95Muted||window.__w95Paused);
  audioCtxs.forEach(function(ac){try{hold?ac.suspend():ac.resume();}catch(e){}});
  document.querySelectorAll('audio,video').forEach(function(el){
    try{el.muted=Boolean(window.__w95Muted);if(window.__w95Paused)el.pause();}catch(e){}
  });
}
window.__win95EmuCtrl={
  setMuted:function(m){window.__w95Muted=!!m;syncAudio();try{if(typeof window.__saeSetMuted==='function')window.__saeSetMuted(!!m);}catch(e){}},
  setPaused:function(p){
    window.__w95Paused=!!p;syncAudio();
    try{if(window.EJS_emulator&&typeof window.EJS_emulator.pause==='function')window.EJS_emulator.pause(!!p);}catch(e){}
    try{if(window.__dosCi&&typeof window.__dosCi.pause==='function'){p?window.__dosCi.pause():window.__dosCi.resume();}}catch(e){}
    try{if(typeof window.__estySetPaused==='function')window.__estySetPaused(!!p);}catch(e){}
    try{if(typeof window.__saeSetPaused==='function')window.__saeSetPaused(!!p);}catch(e){}
  },
  sendKey:function(key,code,keyCode,opts){
    opts=opts||{};
    var t=document.querySelector('canvas')||document.body;
    try{t.focus&&t.focus();}catch(e){}
    var init={key:key,code:code,keyCode:keyCode,which:keyCode,ctrlKey:!!opts.ctrl,altKey:!!opts.alt,metaKey:!!opts.meta,bubbles:true,cancelable:true};
    try{t.dispatchEvent(new KeyboardEvent('keydown',init));}catch(e){}
    setTimeout(function(){try{t.dispatchEvent(new KeyboardEvent('keyup',init));}catch(e){}},80);
  },
  grabCanvasBlob:function(){
    var c=document.querySelector('canvas');
    if(!c)return Promise.resolve(null);
    return new Promise(function(res){
      try{c.toBlob(function(b){res(b);},'image/png');}catch(e){res(null);}
    });
  }
};
})();<\/script>`;

const QUICK_FKEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'].map((k, idx) => ({
  label: k,
  key: k,
  code: k,
  keyCode: 112 + idx,
}));

export default function DosGames({ win, props, active }) {
  const os = useOS();
  fs.useFS();
  const vd = useVirtualDrives();

  const [system, setSystem] = useState('dosbox');
  const [macVersion, setMacVersion] = useState('System 7.5.3');
  const [biosSys, setBiosSys] = useState('dosbox');
  const [consoleSys, setConsoleSys] = useState('arcade');
  const [filterSys, setFilterSys] = useState('all');
  const [dosEngine, setDosEngine] = useState('auto');
  const [bootFloppy, setBootFloppy] = useState(false);
  const [sel, setSel] = useState('');
  const [status, setStatus] = useState('Simulator ready. Boot an open-source BIOS, open a local ROM/disk, mount a PC folder, or add a web link.');
  const [running, setRunning] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [pairedFloppy, setPairedFloppy] = useState(null);
  const [sessionItems, setSessionItems] = useState([]);
  const [savedLinks, setSavedLinks] = useState(loadSavedLinks);
  const [profiles, setProfiles] = useState(loadRomProfiles);
  const [showCfg, setShowCfg] = useState(false);
  const [showBiosModal, setShowBiosModal] = useState(false);
  const [biosTab, setBiosTab] = useState('bios');
  const [activeBiosId, setActiveBiosId] = useState('');
  const [diskQueue, setDiskQueue] = useState([]); // [{ id, name, blob }]
  const [activeDiskIdx, setActiveDiskIdx] = useState(0);
  const [pick, setPick] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [muted, setMuted] = useState(false);
  const [autoPause, setAutoPause] = useState(true);
  const [docHidden, setDocHidden] = useState(() => (typeof document !== 'undefined' ? document.hidden : false));
  const [keysOpen, setKeysOpen] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);
  const [stageBanner, setStageBanner] = useState(null);

  const host = useRef();
  const emuRef = useRef(null);
  const blobUrls = useRef([]);
  const lastLaunchRef = useRef(null);
  const stageTimerRef = useRef(null);
  const barRef = useRef(null);

  const setStageAuto = (next, autoClearMs = 0) => {
    if (stageTimerRef.current) {
      clearTimeout(stageTimerRef.current);
      stageTimerRef.current = null;
    }
    setStageBanner(next);
    if (next && autoClearMs > 0) {
      stageTimerRef.current = setTimeout(() => {
        setStageBanner((cur) => (cur === next ? null : cur));
        stageTimerRef.current = null;
      }, autoClearMs);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(USER_LINKS_KEY, JSON.stringify(savedLinks));
    } catch { /* ignore */ }
  }, [savedLinks]);

  useEffect(() => {
    try {
      localStorage.setItem(USER_PROFILES_KEY, JSON.stringify({ ...profiles }));
    } catch { /* ignore */ }
  }, [profiles]);

  const regBlobUrl = (blob) => {
    const u = URL.createObjectURL(blob);
    blobUrls.current.push(u);
    return u;
  };

  const cleanupBlobs = () => {
    blobUrls.current.forEach((u) => {
      try { URL.revokeObjectURL(u); } catch { /* ignore */ }
    });
    blobUrls.current = [];
  };

  const mine = fs.ALL_ROM_FOLDER_IDS.flatMap((fid) =>
    fs.children(fid)
      .filter((n) => n.type === 'file' && ALL_EXTS.includes(fs.ext(n.name)))
      .map((n) => ({ ...n, folderId: fid, folderPath: fs.pathOf(fid) }))
  );
  const biosFiles = fs.children('bios').filter((n) => n.type === 'file');
  const saveFiles = fs.children('saves').filter((n) => n.type === 'file');

  const folderItems = vd.removable
    .filter((r) => r.kind === 'folder')
    .flatMap((r) =>
      r.entries
        .filter((en) => ALL_EXTS.includes(en.ext))
        .map((en) => ({
          key: `pc:${r.id}:${en.id}`,
          driveId: r.id,
          letter: r.letter,
          folderName: r.name,
          entry: en,
          name: en.name,
          system: detectSystemFromExt(en.name, system),
        }))
    );

  const selNode = sel.startsWith('fs:') ? fs.get(sel.slice(3)) : null;
  const selLink = sel.startsWith('lnk:') ? savedLinks.find((x) => 'lnk:' + x.id === sel) : null;
  const selSession = sel.startsWith('sess:') ? sessionItems.find((x) => 'sess:' + x.id === sel) : null;
  const selFolder = sel.startsWith('pc:') ? folderItems.find((x) => x.key === sel) : null;

  const profileKeyFor = (id = sel, fallbackName = '') => {
    if (id.startsWith('fs:') && fs.get(id.slice(3))) return 'file:' + fs.get(id.slice(3)).name;
    if (id.startsWith('sess:')) {
      const s = sessionItems.find((x) => 'sess:' + x.id === id);
      if (s) return 'file:' + s.name;
    }
    if (id.startsWith('pc:')) {
      const p = folderItems.find((x) => x.key === id);
      if (p) return 'file:' + p.name;
    }
    if (id.startsWith('lnk:')) return id;
    return fallbackName ? 'file:' + fallbackName : '';
  };

  const activeProfKey = profileKeyFor(sel, running || '');
  const activeProf = (!isUnsafeKey(activeProfKey) && profiles[activeProfKey]) || DEFAULT_PROFILE;

  const updateProfile = (patch) => {
    const key = profileKeyFor(sel, running || '');
    if (isUnsafeKey(key)) return;
    setProfiles((prev) => {
      const next = Object.assign(Object.create(null), prev);
      next[key] = { ...(prev[key] || DEFAULT_PROFILE), ...patch };
      return next;
    });
  };

  const resolveBiosForSystem = (sysId) => {
    if (activeBiosId) {
      const pinned = fs.get(activeBiosId);
      if (pinned && !pinned.trashed) return pinned;
    }
    if (!biosFiles.length) return null;
    if (sysId === 'amiga') return biosFiles.find((b) => /kick/i.test(b.name)) || null;
    if (sysId === 'atarist') return biosFiles.find((b) => /tos/i.test(b.name)) || null;
    return null;
  };

  const stop = async () => {
    emuRef.current = null;
    if (host.current) host.current.innerHTML = '';
    cleanupBlobs();
    setRunning(null);
  };

  const purgeMemoryAndScrap = async () => {
    await stop();
    try { delete window.__jsdosCfg; } catch { window.__jsdosCfg = null; }
    try {
      for (const k of Object.keys(localStorage)) {
        if (/^(ejs[-_]|EmulatorJS|puae)/i.test(k)) localStorage.removeItem(k);
      }
    } catch { /* ignore */ }
    if (typeof indexedDB !== 'undefined') {
      const scrapDbs = ['EmulatorJS-roms', 'EmulatorJS-bios', 'EmulatorJS-states', 'ejs-roms', 'ejs-bios', 'js-dos-cache'];
      await Promise.race([
        Promise.all(
          scrapDbs.map(
            (dbName) =>
              new Promise((res) => {
                try {
                  const req = indexedDB.deleteDatabase(dbName);
                  req.onsuccess = req.onerror = req.onblocked = () => res();
                } catch { res(); }
              })
          )
        ),
        new Promise((res) => setTimeout(res, 250)),
      ]);
    }
  };

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.jsdosError) {
        setStatus(e.data.jsdosError);
        setStageAuto({ phase: 'error', title: 'Core Load Error', detail: e.data.jsdosError });
        os.msg({ icon: 'error', title: 'Retro Emulator', text: e.data.jsdosError });
      } else if (e.data?.emuReady) {
        setStatus((prev) => (prev.startsWith('Starting') ? 'Simulator running.' : prev));
        setStageAuto({ phase: 'ready', title: 'Ready', detail: 'Simulator core active.' }, 2000);
      }
    };
    const onVis = () => setDocHidden(document.hidden);
    window.addEventListener('message', onMsg);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('message', onMsg);
      document.removeEventListener('visibilitychange', onVis);
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
      cleanupBlobs();
    };
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!keysOpen && !snapOpen) return;
    const h = (e) => {
      if (!barRef.current?.contains(e.target)) {
        setKeysOpen(false);
        setSnapOpen(false);
      }
    };
    document.addEventListener('pointerdown', h, true);
    return () => document.removeEventListener('pointerdown', h, true);
  }, [keysOpen, snapOpen]);

  const pausedByBg = Boolean(running && autoPause && (active === false || docHidden));

  useEffect(() => {
    const f = emuRef.current?.frame;
    if (!f) return;
    try {
      f.contentWindow?.__win95EmuCtrl?.setMuted(muted);
    } catch { /* cross-origin iframe */ }
  }, [muted, running]);

  useEffect(() => {
    const f = emuRef.current?.frame;
    if (!f) return;
    try {
      f.contentWindow?.__win95EmuCtrl?.setPaused(pausedByBg);
    } catch { /* cross-origin iframe */ }
  }, [pausedByBg, running]);

  const launchJsDos = async (title, opts) => {
    await stop();
    setStatus(`Starting ${title} (DOSBox / js-dos)...`);
    setStageAuto({ phase: 'mounting', title, detail: 'Initializing DOSBox...' });
    try {
      const { blob, ...restOpts } = opts || {};
      const resolvedUrl = blob instanceof Blob ? regBlobUrl(blob) : restOpts.url;
      const f = document.createElement('iframe');
      f.title = 'DOSBox Simulator';
      f.allow = 'autoplay; fullscreen; gamepad; clipboard-write';
      f.allowFullscreen = true;
      f.style.cssText = 'width:100%;height:100%;border:0;background:#000;display:block';
      window.__jsdosCfg = {
        autoStart: true,
        autoSave: true,
        kiosk: false,
        ...restOpts,
        url: resolvedUrl,
        onEvent: (ev, ci) => {
          if (ev === 'ci-ready') {
            if (ci && f.contentWindow) f.contentWindow.__dosCi = ci;
            setStatus(`Running (DOSBox): ${title}`);
            setStageAuto({ phase: 'ready', title, detail: 'DOSBox Ready' }, 2200);
          }
        },
      };
      const err = "parent.postMessage({jsdosError:'Could not load js-dos core from CDN. Check your Internet connection and try again.'},'*')";
      f.srcdoc = `<!doctype html><html><head><meta charset="utf-8">${EMU_CTRL_SNIPPET}<link rel="stylesheet" href="${JSDOS_CSS}" onerror="${err}"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#d{width:100%;height:100%}</style></head><body><div id="d"></div><script src="${JSDOS_JS}" onerror="${err}"><\/script><script>addEventListener('load',function(){try{window.__win95EmuCtrl&&window.__win95EmuCtrl.setMuted(${muted});window.__dos=Dos(document.getElementById('d'),parent.__jsdosCfg||{});if(window.__dos&&typeof window.__dos.then==='function'){window.__dos.then(function(ci){window.__dosCi=ci;if(window.__w95Paused&&ci&&ci.pause)ci.pause();}).catch(function(){});}}catch(e){parent.postMessage({jsdosError:'DOSBox could not start: '+e.message},'*')}})<\/script></body></html>`;
      host.current.appendChild(f);
      emuRef.current = {
        kind: 'jsdos',
        frame: f,
        save: () => f.contentWindow?.__dos?.save?.(),
        fullscreen: () => f.requestFullscreen(),
      };
      setRunning(title);
    } catch (e) {
      setStatus('Error: ' + e.message);
      setStageAuto({ phase: 'error', title: 'Start Failed', detail: e.message });
      os.msg({ icon: 'error', title: 'Retro Simulator', text: 'Simulator could not start: ' + e.message });
    }
  };

  const launchEmulatorJS = async (title, coreId, gameSource, sysLabel, biosNode = null, romFileName = '', defaultOptions = null) => {
    await stop();
    setStatus(`Starting ${title} (${sysLabel})${biosNode ? ` + BIOS (${biosNode.name})` : ''}...`);
    setStageAuto({ phase: 'mounting', title, detail: `Loading ${sysLabel} core...` });
    try {
      const f = document.createElement('iframe');
      f.title = `${sysLabel} Simulator`;
      f.allow = 'autoplay; fullscreen; gamepad; clipboard-write';
      f.allowFullscreen = true;
      f.style.cssText = 'width:100%;height:100%;border:0;background:#000;display:block';
      const err = "parent.postMessage({jsdosError:'Could not load EmulatorJS core from CDN. Check your Internet connection and try again.'},'*')";

      let gameUrl = gameSource;
      if (gameSource instanceof Blob) {
        if (romFileName) {
          const romBytes = new Uint8Array(await gameSource.arrayBuffer());
          const romZip = zipSync({ [romFileName]: romBytes }, { level: 0 });
          gameUrl = regBlobUrl(new Blob([romZip], { type: 'application/zip' }));
        } else {
          gameUrl = regBlobUrl(gameSource);
        }
      }

      const effOpts = defaultOptions || (coreId === 'amiga' && !biosNode ? { puae_kickstart: 'aros', puae_model: 'A500' } : null);
      const cfg = {
        core: coreId,
        url: gameUrl,
        name: romFileName || title,
        data: EJS_DATA,
        defaultOptions: effOpts,
      };
      if (biosNode) {
        const biosBytes = new Uint8Array(await fs.toBlob(biosNode).arrayBuffer());
        const biosZip = zipSync({ [biosNode.name]: biosBytes }, { level: 0 });
        cfg.biosUrl = regBlobUrl(new Blob([biosZip], { type: 'application/zip' }));
      }
      const cfgJson = JSON.stringify(cfg);
      f.srcdoc = `<!doctype html><html><head><meta charset="utf-8">${EMU_CTRL_SNIPPET}<style>html,body,#game{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style></head><body><div id="game"></div><script>
var cfg = ${cfgJson};
window.EJS_player = '#game';
window.EJS_core = cfg.core;
window.EJS_gameUrl = cfg.url;
window.EJS_gameName = cfg.name;
window.EJS_pathtodata = cfg.data;
window.EJS_disableLocalStorage = true;
window.EJS_disableDatabases = true;
if (cfg.defaultOptions) window.EJS_defaultOptions = cfg.defaultOptions;
if (cfg.biosUrl) window.EJS_biosUrl = cfg.biosUrl;
window.EJS_startOnLoaded = true;
window.EJS_color = '#000080';
window.EJS_onGameStart = function(){ window.__win95EmuCtrl && window.__win95EmuCtrl.setMuted(${muted}); parent.postMessage({emuReady:true}, '*'); };
<\/script><script src="${EJS_LOADER}" onerror="${err}"><\/script></body></html>`;
      host.current.appendChild(f);
      emuRef.current = {
        kind: 'ejs',
        frame: f,
        save: async () => {
          os.msg({ icon: 'info', title: 'Save State', text: 'Use the Save / Load State icons inside the emulator bottom toolbar, or open Simulator > C:\\BIOS & C:\\Saves Manager to store .sav/.state files in C:\\Saves.' });
          return true;
        },
        fullscreen: () => f.requestFullscreen(),
      };
      setRunning(`${title} [${sysLabel}]`);
    } catch (e) {
      setStatus('Error: ' + e.message);
      setStageAuto({ phase: 'error', title: 'Start Failed', detail: e.message });
      os.msg({ icon: 'error', title: 'Retro Simulator', text: 'Simulator could not start: ' + e.message });
    }
  };

  const launchEstyJs = async (title, floppyBlob = null, floppyName = '', biosNode = null) => {
    await stop();
    const tosLabel = biosNode ? `TOS (${biosNode.name})` : 'EmuTOS 1.4 (Open Source)';
    setStatus(`Starting ${title} with ${tosLabel}...`);
    setStageAuto({ phase: 'mounting', title, detail: `Loading EstyJS + ${tosLabel}...` });
    try {
      const f = document.createElement('iframe');
      f.title = 'Atari ST Simulator (EstyJS + EmuTOS)';
      f.allow = 'autoplay; fullscreen; gamepad; clipboard-write';
      f.allowFullscreen = true;
      f.style.cssText = 'width:100%;height:100%;border:0;background:#000;display:block';

      let diskUrl = '';
      if (floppyBlob) diskUrl = regBlobUrl(floppyBlob);
      let biosUrl = '';
      if (biosNode) biosUrl = regBlobUrl(fs.toBlob(biosNode));

      const cfgJson = JSON.stringify({
        cdn: ESTYJS_CDN_BASE,
        diskUrl,
        diskName: floppyName,
        biosUrl,
        biosName: biosNode?.name || '',
        muted,
      });

      const scripts = [
        'estyjs/estyjs.js',
        'estyjs/processor.js',
        'estyjs/keyboard.js',
        'estyjs/mfp.js',
        'estyjs/fdc.js',
        'estyjs/io.js',
        'estyjs/bug.js',
        'estyjs/display.js',
        'estyjs/memory.js',
        'estyjs/snapshot.js',
        'estyjs/sound.js',
        'estyjs/files.js',
        'estyjs/js-unzip.js',
        'estyjs/rawinflate.js',
      ];
      const err = "parent.postMessage({jsdosError:'Could not load EstyJS / EmuTOS from CDN. Check your Internet connection and try again.'},'*')";
      const scriptTags = scripts.map((s) => `<script src="${s}" onerror="${err}"><\/script>`).join('');

      f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base href="${ESTYJS_CDN_BASE}">${EMU_CTRL_SNIPPET}<style>
html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center}
#EstyJsOutput{width:100%;height:100%;object-fit:contain;image-rendering:pixelated;outline:none;cursor:crosshair}
</style><script>
(function(){
  if (window.AudioWorklet && AudioWorklet.prototype && AudioWorklet.prototype.addModule) {
    var origAdd = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = function(url, opts) {
      var self = this;
      try {
        var abs = new URL(url, document.baseURI).toString();
        return fetch(abs).then(function(r){ return r.text(); }).then(function(code){
          var baseDir = abs.slice(0, abs.lastIndexOf('/') + 1);
          var patched = code.replace(/from\\s+(['"])\\.\\//g, 'from $1' + baseDir);
          var bUrl = URL.createObjectURL(new Blob([patched], { type: 'application/javascript' }));
          return origAdd.call(self, bUrl, opts);
        });
      } catch (e) {
        return origAdd.call(self, url, opts);
      }
    };
  }
})();
<\/script></head><body><canvas id="EstyJsOutput" width="640" height="400" tabindex="0"></canvas>${scriptTags}<script>
(function(){
  var cfg = ${cfgJson};
  var runningState = true;
  var soundOn = false;
  window.__estySetPaused = function(p) {
    if (!window.__esty) return;
    if (Boolean(p) === runningState) {
      runningState = window.__esty.pauseResume();
    }
  };
  addEventListener('load', function(){
    try {
      var esty = window.EstyJs('EstyJsOutput');
      window.__esty = esty;
      esty.setRowSkip(false);
      esty.setMonoMonitor(false);
      var canvas = document.getElementById('EstyJsOutput');
      var unlockAudio = function(){
        if (!soundOn && !window.__w95Muted) {
          try { soundOn = esty.soundToggle(); } catch(e){}
        }
        window.__win95EmuCtrl && window.__win95EmuCtrl.setMuted(cfg.muted || window.__w95Muted);
        try { canvas.focus(); } catch(e){}
      };
      canvas.addEventListener('pointerdown', unlockAudio);
      window.addEventListener('keydown', unlockAudio, { once: true });
      if (cfg.biosUrl) {
        fetch(cfg.biosUrl).then(function(r){ return r.arrayBuffer(); }).then(function(ab){
          var fObj = new File([ab], cfg.biosName || 'tos.img');
          esty.changeTOS(fObj);
        }).catch(function(){});
      }
      if (cfg.diskUrl) {
        fetch(cfg.diskUrl).then(function(r){ return r.arrayBuffer(); }).then(function(ab){
          var fname = cfg.diskName || 'disk.st';
          var fObj = new File([ab], fname);
          var ext = (fname.split('.').pop() || '').toLowerCase();
          if (ext === 'sts') esty.openSnapshotFile(fObj);
          else if (ext === 'zip') esty.openZipFile('A', fObj);
          else esty.openFloppyFile('A', fObj);
        }).catch(function(){});
      }
      if (window.__w95Paused) window.__estySetPaused(true);
      parent.postMessage({ emuReady: true }, '*');
    } catch (e) {
      parent.postMessage({ jsdosError: 'EstyJS / EmuTOS could not start: ' + e.message }, '*');
    }
  });
})();
<\/script></body></html>`;
      host.current.appendChild(f);
      emuRef.current = {
        kind: 'esty',
        frame: f,
        save: async () => {
          os.msg({ icon: 'info', title: 'Atari ST (EstyJS)', text: 'EmuTOS 1.4 / EstyJS runs directly in memory. Use Snapshot 📷 in the toolbar to save the screen to Paint or WordPad.' });
          return true;
        },
        fullscreen: () => f.requestFullscreen(),
      };
      setRunning(`${title} [Atari ST]`);
      setStageAuto({ phase: 'ready', title, detail: `${tosLabel} Active` }, 2400);
    } catch (e) {
      setStatus('Error: ' + e.message);
      setStageAuto({ phase: 'error', title: 'Start Failed', detail: e.message });
      os.msg({ icon: 'error', title: 'Atari ST Simulator', text: 'EstyJS could not start: ' + e.message });
    }
  };

  const launchSaeAmiga = async (title, biosDef, floppyBlob = null, floppyName = '', customBiosNode = null) => {
    await stop();
    const label = customBiosNode ? customBiosNode.name : (biosDef?.biosName || 'AROS Kickstart (SAE)');
    setStatus(`Starting ${title} (${label})...`);
    setStageAuto({ phase: 'mounting', title, detail: `Fetching ${label}...` });
    try {
      const romBytes = customBiosNode
        ? new Uint8Array(await fs.toBlob(customBiosNode).arrayBuffer())
        : new Uint8Array(await (await fetchBinaryWithFallback(biosDef.romUrl, label)).blob.arrayBuffer());
      const extBytes = !customBiosNode && biosDef?.extUrl
        ? new Uint8Array(await (await fetchBinaryWithFallback(biosDef.extUrl, `${label} (EXT)`)).blob.arrayBuffer())
        : null;

      const diskBlob = floppyBlob || makeBlankAmigaAdf('AROS_Boot');
      const diskBytes = new Uint8Array(await diskBlob.arrayBuffer());

      const romUrl = regBlobUrl(new Blob([romBytes], { type: 'application/octet-stream' }));
      const extUrl = extBytes ? regBlobUrl(new Blob([extBytes], { type: 'application/octet-stream' })) : '';
      const diskUrl = regBlobUrl(new Blob([diskBytes], { type: 'application/octet-stream' }));

      const saeScripts = [
        'sae/prototypes.js', 'sae/utils.js', 'sae/dms.js', 'sae/config.js',
        'sae/roms.js', 'sae/memory.js', 'sae/autoconf.js', 'sae/expansion.js',
        'sae/events.js', 'sae/gayle.js', 'sae/ide.js', 'sae/filesys.js',
        'sae/hardfile.js', 'sae/dongle.js', 'sae/input.js', 'sae/serpar.js',
        'sae/custom.js', 'sae/blitter.js', 'sae/copper.js', 'sae/playfield.js',
        'sae/video.js', 'sae/audio.js', 'sae/cia.js', 'sae/disk.js',
        'sae/rtc.js', 'sae/m68k.js', 'sae/cpu.js', 'sae/amiga.js',
      ];
      const err = "parent.postMessage({jsdosError:'Could not load ScriptedAmigaEmulator (SAE) scripts from CDN.'},'*')";
      const scriptTags = saeScripts.map((s) => `<script src="${s}" onerror="${err}"><\/script>`).join('');

      const cfgJson = JSON.stringify({
        model: biosDef?.saeModel || 'A500',
        romUrl,
        romName: customBiosNode?.name || 'kick.rom',
        romCrc: crc32Bytes(romBytes),
        extUrl,
        extName: 'kick_ext.rom',
        extCrc: extBytes ? crc32Bytes(extBytes) : 0,
        diskUrl,
        diskName: floppyName || 'AROS_Boot.adf',
        diskCrc: crc32Bytes(diskBytes),
        muted,
      });

      const f = document.createElement('iframe');
      f.title = 'Amiga Simulator (SAE Pure JS)';
      f.allow = 'autoplay; fullscreen; gamepad; clipboard-write';
      f.allowFullscreen = true;
      f.style.cssText = 'width:100%;height:100%;border:0;background:#000;display:block';
      f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base href="${SAE_CDN_BASE}">${EMU_CTRL_SNIPPET}<style>
html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center}
#saeVideo{width:100%;height:100%;object-fit:contain;image-rendering:pixelated;outline:none;background:#000}
</style></head><body><canvas id="saeVideo" width="720" height="568" tabindex="0"></canvas>${scriptTags}<script>
(function(){
  var c = ${cfgJson};
  window.__saeSetPaused = function(p){ try{ window.__sae && window.__sae.pause(!!p); }catch(e){} };
  window.__saeSetMuted = function(m){ try{ window.__sae && window.__sae.mute(!!m); }catch(e){} };
  addEventListener('load', async function(){
    try {
      var sae = new ScriptedAmigaEmulator();
      window.__sae = sae;
      var cfg = sae.getConfig();
      var model = c.model === 'A1200' ? SAEC_Model_A1200 : SAEC_Model_A500;
      sae.setModel(model, 0);
      cfg.memory.z2FastSize = 4 << 20;
      var romU8 = new Uint8Array(await (await fetch(c.romUrl)).arrayBuffer());
      cfg.memory.rom.name = c.romName;
      cfg.memory.rom.data = romU8;
      cfg.memory.rom.size = romU8.byteLength;
      cfg.memory.rom.crc32 = c.romCrc;
      if (c.extUrl) {
        var extU8 = new Uint8Array(await (await fetch(c.extUrl)).arrayBuffer());
        cfg.memory.extRom.name = c.extName;
        cfg.memory.extRom.data = extU8;
        cfg.memory.extRom.size = extU8.byteLength;
        cfg.memory.extRom.crc32 = c.extCrc;
      }
      var df0 = cfg.floppy.drive[0].file;
      var dskU8 = new Uint8Array(await (await fetch(c.diskUrl)).arrayBuffer());
      df0.name = c.diskName;
      df0.data = dskU8;
      df0.size = dskU8.byteLength;
      df0.crc32 = c.diskCrc;
      cfg.floppy.speed = SAEC_Config_Floppy_Speed_Turbo;
      cfg.video.id = 'saeVideo';
      cfg.video.hresolution = SAEC_Config_Video_HResolution_HiRes;
      cfg.video.vresolution = SAEC_Config_Video_VResolution_Double;
      cfg.video.size_win.width = SAEC_Video_DEF_AMIGA_WIDTH << 1;
      cfg.video.size_win.height = SAEC_Video_DEF_AMIGA_HEIGHT << 1;
      cfg.hook.event.started = function(){
        if (c.muted || window.__w95Muted) sae.mute(true);
        if (window.__w95Paused) sae.pause(true);
        parent.postMessage({ emuReady: true }, '*');
      };
      cfg.hook.log.error = function(err, msg){
        parent.postMessage({ jsdosError: msg || ('Amiga SAE Error #' + err) }, '*');
      };
      var err = await sae.start();
      if (err !== SAEE_None) {
        parent.postMessage({ jsdosError: 'SAE failed to start (' + (typeof saee2text === 'function' ? saee2text(err) : err) + ')' }, '*');
      }
    } catch (e) {
      parent.postMessage({ jsdosError: 'SAE Amiga error: ' + e.message }, '*');
    }
  });
})();
<\/script></body></html>`;
      host.current.appendChild(f);
      emuRef.current = {
        kind: 'sae',
        frame: f,
        save: async () => {
          os.msg({ icon: 'info', title: 'Amiga (SAE)', text: 'Use Snapshot 📷 in the toolbar to capture the Amiga screen to Paint or WordPad.' });
          return true;
        },
        fullscreen: () => f.requestFullscreen(),
      };
      setRunning(`${title} [Amiga SAE]`);
      setStatus(`Running ${title} (${label})`);
    } catch (e) {
      setStatus('Error: ' + e.message);
      setStageAuto({ phase: 'error', title: 'Amiga BIOS Error', detail: e.message });
      os.msg({ icon: 'error', title: 'Amiga Simulator', text: 'Could not boot Amiga BIOS: ' + e.message });
    }
  };

  const bootFreeBios = async (targetId = biosSys) => {
    const biosDef = FREE_BIOS_SYSTEMS.find((b) => b.id === targetId) || FREE_BIOS_SYSTEMS[0];
    const effSys = biosDef.sysId || targetId;
    setSystem(effSys);
    setBiosSys(targetId);
    lastLaunchRef.current = () => bootFreeBios(targetId);

    setStatus(`Cleaning emulator memory & local scrap before loading ${biosDef.biosName}...`);
    await purgeMemoryAndScrap();

    const biosNode = resolveBiosForSystem(effSys);

    if (targetId === 'dosbox') {
      const autoexec = ['@echo off', 'mount c .'];
      const files = { '.keep': strToU8('') };
      if (pairedFloppy) {
        files['boot.img'] = new Uint8Array(await pairedFloppy.file.arrayBuffer());
        autoexec.push('imgmount a boot.img -t floppy');
        if (bootFloppy) autoexec.push('boot -l a');
      }
      autoexec.push(
        'c:',
        'cls',
        'ver',
        'echo FreeDOS / DOSBox Open-Source System BIOS Shell ready (Zero games/ROMs).',
        'echo Type DIR, VER, MEM or drag .EXE / .COM / .IMG / .ZIP files onto this screen.'
      );
      files['.jsdos/dosbox.conf'] = strToU8(buildDosConf(DEFAULT_PROFILE, autoexec));
      const bundle = zipSync(files, { level: 0 });
      await launchJsDos('DOS System BIOS (FreeDOS / DOSBox)', { blob: new Blob([bundle], { type: 'application/zip' }) });
      return;
    }

    if (targetId === 'atarist') {
      await launchEstyJs('EmuTOS 1.4 BIOS (Atari ST)', null, '', biosNode);
      return;
    }

    if (targetId === 'amiga') {
      const adfBlob = makeBlankAmigaAdf('AROS_Boot');
      await launchEmulatorJS(
        biosNode ? `Amiga BIOS (${biosNode.name})` : 'Amiga AROS Kickstart (PUAE)',
        'amiga',
        adfBlob,
        'Amiga PUAE (AROS)',
        biosNode,
        'AROS_Boot.adf',
        biosNode ? null : { puae_kickstart: 'aros', puae_model: 'A500' }
      );
      return;
    }

    if (targetId.startsWith('amiga_')) {
      await launchSaeAmiga(biosDef.label, biosDef, makeBlankAmigaAdf('AROS_Boot'), 'AROS_Boot.adf', biosNode);
      return;
    }

    if (targetId === 'amstradcpc') {
      const dskBlob = makeBlankCpcDsk();
      await launchEmulatorJS(
        'Amstrad CPC 6128 BIOS (BASIC 1.1)',
        'cap32',
        dskBlob,
        'Amstrad CPC (Caprice32)',
        biosNode,
        'Blank_CPC6128.dsk'
      );
      return;
    }

    if (targetId === 'zxspectrum') {
      const tzxBlob = makeBlankZxTzx();
      await launchEmulatorJS(
        'ZX Spectrum BIOS (Fuse BASIC)',
        'fuse',
        tzxBlob,
        'ZX Spectrum (Fuse)',
        biosNode,
        'Blank_ZX.tzx'
      );
      return;
    }

    if (targetId === 'c64') {
      const d64Blob = makeBlankC64D64('EMPTY DISK');
      await launchEmulatorJS(
        'Commodore 64 BASIC V2 BIOS',
        'c64',
        d64Blob,
        'Commodore 64 (VICE)',
        biosNode,
        'Blank_C64.d64'
      );
    }
  };

  const runDosExeFromZip = (title, files, exe, profOverride = null) => {
    const prof = profOverride || (!isUnsafeKey('file:' + title) && profiles['file:' + title]) || DEFAULT_PROFILE;
    const i = exe.lastIndexOf('/');
    const dir = i >= 0 ? exe.slice(0, i).replace(/\//g, '\\') : '';
    const prog = exe.slice(i + 1);
    const conf = buildDosConf(prof, [
      '@echo off',
      'mount c .',
      'c:',
      dir ? `cd ${dir}` : '',
      /\.bat$/i.test(prog) ? `call ${prog}` : prog,
    ]);
    const bundle = zipSync({ ...files, '.jsdos/dosbox.conf': strToU8(conf) }, { level: 0 });
    setPick(null);
    launchJsDos(title, { blob: new Blob([bundle], { type: 'application/zip' }) });
  };

  const launchClassicMac = async (osDisk = macVersion, diskUrl = '', customNote = '') => {
    lastLaunchRef.current = () => launchClassicMac(osDisk, diskUrl, customNote);
    await stop();
    const q = new URLSearchParams({ disk: osDisk, infinite_hd: 'true' });
    if (diskUrl) q.set('disk_url', diskUrl);
    const embedUrl = `https://infinitemac.org/embed?${q.toString()}`;
    setStatus(customNote || `Booting ${osDisk} + Infinite HD (Classic Mac Apps ready)...`);
    setStageAuto({ phase: 'mounting', title: osDisk, detail: diskUrl ? 'Booting Mac & auto-mounting disk URL...' : 'Booting Classic Mac OS...' });
    const f = document.createElement('iframe');
    f.title = `Classic Mac (${osDisk})`;
    f.src = embedUrl;
    f.allow = 'autoplay; fullscreen; gamepad; clipboard-write';
    f.allowFullscreen = true;
    f.style.cssText = 'width:100%;height:100%;border:0;background:#000;display:block';
    f.onload = () => {
      setStatus(customNote || `Running ${osDisk} — open Macintosh HD / Infinite HD or drop .dsk/.hfv/.sit/.hqx onto the Mac desktop!`);
      setStageAuto({ phase: 'ready', title: osDisk, detail: diskUrl ? 'Disk mounted in Classic Mac' : 'Classic Mac Ready' }, 2400);
    };
    host.current.appendChild(f);
    emuRef.current = {
      kind: 'mac',
      frame: f,
      save: async () => { os.msg({ icon: 'info', title: 'Classic Mac Emulator', text: 'Changes inside Infinite HD persist in your browser via IndexedDB/OPFS inside the Mac session.' }); return true; },
      fullscreen: () => f.requestFullscreen(),
    };
    setRunning(`Classic Mac (${osDisk})`);
  };

  const launchBlob = async (blob, name, sysOverride = null, profKeyOverride = '') => {
    lastLaunchRef.current = () => launchBlob(blob, name, sysOverride, profKeyOverride);
    const ext = fs.ext(name);
    const targetSys = sysOverride || detectSystemFromExt(name, system);
    const pKey = profKeyOverride || 'file:' + name;
    const prof = (!isUnsafeKey(pKey) && profiles[pKey]) || DEFAULT_PROFILE;
    setSystem(targetSys);
    setStatus(`Preparing ${name}...`);
    setStageAuto({ phase: 'mounting', title: name, detail: `Preparing ${targetSys.toUpperCase()} runtime...` });

    const biosNode = resolveBiosForSystem(targetSys);

    if (targetSys === 'mac68k') {
      if (emuRef.current?.kind === 'mac') {
        const msg = `Mac OS already running! Drag & drop "${name}" directly onto the Mac desktop screen to mount without rebooting.`;
        setStatus(msg);
        setStageAuto({ phase: 'ready', title: name, detail: 'Drop file directly onto the Mac screen to mount' }, 4200);
        return;
      }
      await launchClassicMac(
        macVersion,
        '',
        `Mac OS booted! Drag & drop "${name}" directly onto the Classic Mac desktop screen to mount/install it.`
      );
      return;
    }

    if (targetSys === 'atarist') {
      await launchEstyJs(name, blob, name, biosNode);
      return;
    }

    if (targetSys !== 'dosbox') {
      if (targetSys === 'amiga' && biosSys.startsWith('amiga_')) {
        const biosDef = FREE_BIOS_SYSTEMS.find((b) => b.id === biosSys);
        if (biosDef) {
          await launchSaeAmiga(name, biosDef, blob, name, biosNode);
          return;
        }
      }
      const sysDef = SYSTEMS.find((s) => s.id === targetSys);
      await launchEmulatorJS(
        name,
        sysDef.core,
        blob,
        sysDef.label,
        biosNode,
        '',
        targetSys === 'amiga' && !biosNode ? { puae_kickstart: 'aros', puae_model: 'A500' } : null
      );
      return;
    }

    if (ext === 'jsdos') {
      await launchJsDos(name, { blob });
      return;
    }

    if (['exe', 'com', 'bat'].includes(ext)) {
      const u8 = new Uint8Array(await blob.arrayBuffer());
      runDosExeFromZip(name, { [name]: u8 }, name, prof);
      return;
    }

    if (['img', 'ima', 'vfd'].includes(ext)) {
      mountFloppyA({ name, size: blob.size, bootable: bootFloppy, readBlob: async () => blob });
      if (dosEngine === 'pure') {
        await launchEmulatorJS(name, 'dosbox_pure', blob, 'DOSBox-Pure', biosNode);
        return;
      }
      const floppyQueue = diskQueue.filter((d) => ['img', 'ima', 'vfd'].includes(fs.ext(d.name)));
      const files = {};
      const imgArgs = [];
      if (floppyQueue.length > 1) {
        for (let i = 0; i < floppyQueue.length; i++) {
          const fname = `disk${i + 1}.img`;
          files[fname] = new Uint8Array(await floppyQueue[i].blob.arrayBuffer());
          imgArgs.push(fname);
        }
      } else {
        files['disk.img'] = new Uint8Array(await blob.arrayBuffer());
        imgArgs.push('disk.img');
      }
      const conf = buildDosConf(prof, [
        '@echo off',
        `imgmount a ${imgArgs.join(' ')} -t floppy`,
        bootFloppy ? 'boot -l a' : `echo Floppy mounted on A:\\ (${imgArgs.length > 1 ? 'Ctrl+F4 swaps queued disks, ' : ''}type BOOT -L A to boot)`,
        bootFloppy ? '' : 'a:',
        bootFloppy ? '' : 'dir',
      ]);
      files['.jsdos/dosbox.conf'] = strToU8(conf);
      const bundle = zipSync(files, { level: 0 });
      await launchJsDos(name, { blob: new Blob([bundle], { type: 'application/zip' }) });
      return;
    }

    if (['iso', 'cue', 'bin'].includes(ext)) {
      mountCdromD({ name, size: blob.size, readBlob: async () => blob });
      const tooBigForZip = blob.size > 120 * 1024 * 1024;
      if (dosEngine === 'pure' || (dosEngine === 'auto' && (tooBigForZip || !pairedFloppy))) {
        await launchEmulatorJS(name, 'dosbox_pure', blob, 'DOSBox-Pure CD', biosNode);
        return;
      }
      if (tooBigForZip) {
        await launchEmulatorJS(name, 'dosbox_pure', blob, 'DOSBox-Pure CD', biosNode);
        return;
      }
      const files = { 'cdrom.iso': new Uint8Array(await blob.arrayBuffer()) };
      const autoexec = ['@echo off', 'imgmount d cdrom.iso -t iso'];
      if (pairedFloppy) {
        files['boot.img'] = new Uint8Array(await pairedFloppy.file.arrayBuffer());
        autoexec.push('imgmount a boot.img -t floppy');
        if (bootFloppy) autoexec.push('boot -l a');
        else autoexec.push('echo Boot Floppy on A:\\ and CD-ROM on D:\\', 'd:', 'dir');
      } else {
        autoexec.push('echo CD-ROM mounted on D:\\', 'd:', 'dir');
      }
      files['.jsdos/dosbox.conf'] = strToU8(buildDosConf(prof, autoexec));
      const bundle = zipSync(files, { level: 0 });
      await launchJsDos(name, { blob: new Blob([bundle], { type: 'application/zip' }) });
      return;
    }

    if (ext === 'zip') {
      if (dosEngine === 'pure') {
        await launchEmulatorJS(name, 'dosbox_pure', blob, 'DOSBox-Pure', biosNode);
        return;
      }
      let files;
      try {
        files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
      } catch {
        os.msg({ icon: 'error', title: 'Retro Simulator', text: `"${name}" is not a valid ZIP archive.` });
        setStatus('Invalid ZIP archive.');
        return;
      }
      const names = Object.keys(files).filter((n) => !n.endsWith('/'));
      if (names.some((n) => n.toLowerCase() === '.jsdos/dosbox.conf')) {
        await launchJsDos(name, { blob });
        return;
      }
      const exes = names.filter((n) => /\.(exe|com|bat)$/i.test(n) && !n.startsWith('__MACOSX'));
      if (!exes.length) {
        await launchEmulatorJS(name, 'dosbox_pure', blob, 'DOSBox-Pure', biosNode);
        return;
      }
      const score = (n) => (/(setup|install|config|uninst|readme|help|catalog)/i.test(n) ? 100 : 0) + (/\.bat$/i.test(n) ? 0 : 5) + n.split('/').length;
      exes.sort((a, b) => score(a) - score(b));
      if (exes.length === 1) runDosExeFromZip(name, files, exes[0], prof);
      else {
        setPick({ title: name, files, list: exes, choice: exes[0], prof });
        setStatus('Choose the executable inside the ZIP, then press Run.');
      }
      return;
    }

    os.msg({ icon: 'warning', title: 'Retro Simulator', text: `Unsupported file type ".${ext}".` });
  };

  const fetchBinaryWithFallback = async (url, label) => {
    setStatus(`Downloading ${label}...`);
    setStageAuto({ phase: 'downloading', title: label, detail: 'Fetching directly...' });
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { blob: await res.blob(), ctype: (res.headers.get('content-type') || '').toLowerCase(), filename: null };
    } catch {
      setStatus(`Fetching via proxy: ${label}...`);
      setStageAuto({ phase: 'downloading', title: label, detail: 'Retrying via Windows 95 server proxy (bypassing CORS)...' });
      const proxied = await fetch(`/api/fetch-rom?url=${encodeURIComponent(url)}`);
      if (!proxied.ok) {
        const errJson = await proxied.json().catch(() => ({}));
        const err = new Error(errJson.error || `HTTP ${proxied.status}`);
        err.status = proxied.status;
        throw err;
      }
      return {
        blob: await proxied.blob(),
        ctype: (proxied.headers.get('content-type') || '').toLowerCase(),
        filename: proxied.headers.get('X-Resolved-Filename'),
      };
    }
  };

  const play = async (id = sel, sysOverride = null) => {
    setPick(null);
    if (!id) {
      await openLocalFile();
      return;
    }
    if (id.startsWith('fs:')) {
      const n = fs.get(id.slice(3));
      if (n) await launchBlob(fs.toBlob(n), n.name, sysOverride || detectSystemFromExt(n.name, system), 'file:' + n.name);
    } else if (id.startsWith('sess:')) {
      const item = sessionItems.find((x) => 'sess:' + x.id === id);
      if (item) await launchBlob(item.blob, item.name, sysOverride || item.system, 'file:' + item.name);
    } else if (id.startsWith('pc:')) {
      const fi = folderItems.find((x) => x.key === id);
      if (fi) {
        const f = await fi.entry.getFile();
        await launchBlob(f, fi.name, sysOverride || fi.system, 'file:' + fi.name);
      }
    } else if (id.startsWith('lnk:')) {
      const link = savedLinks.find((x) => 'lnk:' + x.id === id);
      if (link) {
        setSystem(sysOverride || link.system || 'dosbox');
        await loadFromUrl(link.url, link.mode === 'web', sysOverride || link.system, id);
      }
    }
  };

  useEffect(() => {
    if (props.fileId && fs.get(props.fileId)) {
      const n = fs.get(props.fileId);
      const detected = detectSystemFromExt(n.name, system);
      setSystem(detected);
      setSel('fs:' + props.fileId);
      launchBlob(fs.toBlob(n), n.name, detected, 'file:' + n.name);
    } else if (props.mountedSlot?.blob && props.mountedSlot?.name) {
      const { name, blob } = props.mountedSlot;
      const detected = detectSystemFromExt(name, system);
      const sid = 'm' + Date.now();
      setSessionItems((prev) => [...prev.filter((x) => x.name !== name), { id: sid, name, blob, system: detected }]);
      setSystem(detected);
      setSel('sess:' + sid);
      launchBlob(blob, name, detected, 'file:' + name);
    }
  }, [win.nonce]); // eslint-disable-line

  const ingestFiles = async (files, forcedSystem = null) => {
    for (const f of files) {
      const ext = fs.ext(f.name);
      if (!ALL_EXTS.includes(ext)) {
        os.msg({ icon: 'warning', title: 'Retro Simulator', text: `"${f.name}" (.${ext || '?'}) is not a recognized disk/ROM/program format.` });
        continue;
      }
      const detected = forcedSystem || detectSystemFromExt(f.name, system);
      const destFolder = fs.romFolderForSystem(detected);
      if (f.size <= MAX_IDB_BYTES) {
        try {
          const n = await fs.importFile(f, destFolder);
          const key = 'fs:' + n.id;
          setSel(key);
          await launchBlob(f, n.name, detected, 'file:' + n.name);
          continue;
        } catch { /* fall through to session */ }
      }
      const sid = 's' + Date.now() + Math.random().toString(36).slice(2, 6);
      setSessionItems((prev) => [...prev, { id: sid, name: f.name, blob: f, system: detected }]);
      setSel('sess:' + sid);
      await launchBlob(f, f.name, detected, 'file:' + f.name);
    }
  };

  const openLocalFile = async (forcedSystem = null) => {
    const sysDef = forcedSystem ? SYSTEMS.find((s) => s.id === forcedSystem) : null;
    const acceptExts = sysDef ? [...new Set([...sysDef.exts, 'zip'])] : ALL_EXTS;
    const picked = await pickLocalFiles({
      accept: acceptExts.map((e) => '.' + e).join(','),
      multiple: true,
    });
    if (picked?.length) await ingestFiles(picked.map((p) => p.file), forcedSystem);
  };

  const mountPCFolder = async () => {
    const res = await pickLocalDirectory({ acceptExts: ALL_EXTS });
    if (!res) return;
    const drive = mountRemovableFolder(res);
    setStatus(`Mounted PC folder "${res.name}" as ${drive.letter} (${res.entries.length} compatible file(s), zero-copy).`);
  };

  const attachFloppyForCd = async () => {
    const picked = await pickLocalFiles({ accept: '.img,.ima,.vfd' });
    if (picked) {
      setPairedFloppy({ name: picked.name, file: picked.file });
      mountFloppyA({ name: picked.name, size: picked.file.size, bootable: true, readBlob: async () => picked.file });
      setStatus(`Paired boot floppy on A:\\: ${picked.name}`);
    }
  };

  const queueMultiDisks = async () => {
    const picked = await pickLocalFiles({
      accept: '.img,.ima,.vfd,.iso,.cue,.bin,.adf,.d64,.st,.dsk',
      multiple: true,
    });
    if (!picked?.length) return;
    const added = picked.map((p, k) => ({
      id: 'dq-' + Date.now() + '-' + k,
      name: p.name,
      blob: p.file,
    }));
    setDiskQueue((prev) => [...prev, ...added]);
    setStatus(`Added ${added.length} disk(s) to Multi-Disk Queue.`);
  };

  const queueSelectedDisk = async () => {
    let name = null;
    let blob = null;
    if (selNode) { name = selNode.name; blob = fs.toBlob(selNode); }
    else if (selSession) { name = selSession.name; blob = selSession.blob; }
    else if (selFolder) { name = selFolder.name; blob = await selFolder.entry.getFile(); }
    if (!name || !blob) return;
    setDiskQueue((prev) => [...prev, { id: 'dq-' + Date.now(), name, blob }]);
    setStatus(`Queued "${name}" in Multi-Disk Swapper.`);
  };

  const swapToQueueIndex = async (idx, andLaunch = false) => {
    const item = diskQueue[idx];
    if (!item) return;
    setActiveDiskIdx(idx);
    const e = fs.ext(item.name);
    if (['img', 'ima', 'vfd'].includes(e)) {
      mountFloppyA({ name: item.name, size: item.blob.size, bootable: bootFloppy, readBlob: async () => item.blob });
      setPairedFloppy({ name: item.name, file: item.blob });
    } else if (['iso', 'cue', 'bin'].includes(e)) {
      mountCdromD({ name: item.name, size: item.blob.size, readBlob: async () => item.blob });
    }
    setStatus(`Swapped active disk slot to [${idx + 1}/${diskQueue.length}] ${item.name}`);
    if (andLaunch) await launchBlob(item.blob, item.name, detectSystemFromExt(item.name, system), 'file:' + item.name);
  };

  const launchWebEmulator = async (rawAddress = urlInput) => {
    const raw = (rawAddress || '').trim();
    if (!raw) return;
    const embedUrl = toWebEmbedUrl(raw);
    try {
      const parsed = new URL(embedUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Invalid scheme');
    } catch {
      os.msg({ icon: 'error', title: 'Invalid Web Link', text: 'Enter a valid http:// or https:// URL.' });
      return;
    }
    lastLaunchRef.current = () => launchWebEmulator(raw);
    await stop();
    const label = embedUrl.replace(/^https?:\/\//i, '').slice(0, 48);
    setStatus(`Loading web link: ${label}...`);
    setStageAuto({ phase: 'mounting', title: label, detail: 'Loading web frame...' });
    const f = document.createElement('iframe');
    f.title = 'Web Emulator';
    f.src = embedUrl;
    f.allow = 'autoplay; fullscreen; gamepad; clipboard-write';
    f.allowFullscreen = true;
    f.referrerPolicy = 'no-referrer';
    f.style.cssText = 'width:100%;height:100%;border:0;background:#000;display:block';
    f.onload = () => {
      setStatus(`Web Link: ${label}`);
      setStageAuto({ phase: 'ready', title: label, detail: 'Web page loaded' }, 2000);
    };
    host.current.appendChild(f);
    emuRef.current = {
      kind: 'web',
      frame: f,
      save: async () => { os.msg({ icon: 'info', title: 'Web Link', text: 'Use the controls inside the loaded page to save progress.' }); return true; },
      fullscreen: () => f.requestFullscreen(),
    };
    setRunning(`Web: ${label}`);
  };

  const saveWebLinkToStorage = async (rawAddress = urlInput, mode = 'rom') => {
    let raw = (rawAddress || '').trim();
    if (!raw) {
      raw = await os.prompt({
        title: 'Save Web ROM Link to Your Storage',
        label: 'Paste your ROM/disk URL or Web Emulator link:',
        width: 460,
      });
      if (!raw) return;
    }
    const cleanUrl = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
    try {
      const parsed = new URL(cleanUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Invalid URL');
    } catch {
      os.msg({ icon: 'error', title: 'Invalid URL', text: 'Enter a valid http:// or https:// link.' });
      return;
    }
    const defaultTitle = decodeURIComponent(cleanUrl.split('?')[0].split('/').pop() || cleanUrl.replace(/^https?:\/\//i, '')).slice(0, 48);
    const title = await os.prompt({
      title: 'Label for Saved Link',
      label: 'Name for this link in your browser storage:',
      value: defaultTitle,
      width: 400,
    });
    if (!title) return;
    const detected = detectSystemFromExt(cleanUrl, system);
    const item = {
      id: 'u' + Date.now() + Math.random().toString(36).slice(2, 6),
      title: title.trim(),
      url: cleanUrl,
      system: detected,
      mode: mode === 'web' || (/archive\.org\/(details|embed)\//i.test(cleanUrl) && !looksLikeBinarySoftwareUrl(cleanUrl)) ? 'web' : 'rom',
      addedAt: Date.now(),
    };
    setSavedLinks((prev) => [item, ...prev]);
    setSel('lnk:' + item.id);
    setUrlInput('');
    setStatus(`Saved web link "${item.title}" to your browser storage.`);
  };

  const exportLinksJson = async () => {
    if (!savedLinks.length) {
      os.msg({ icon: 'info', title: 'Export Web Links', text: 'No saved web links to export yet.' });
      return;
    }
    const payload = JSON.stringify({ format: 'win95-user-rom-links-v1', exportedAt: new Date().toISOString(), links: savedLinks }, null, 2);
    await saveLocalFile({
      blob: new Blob([payload], { type: 'application/json;charset=utf-8' }),
      suggestedName: 'win95-web-links.json',
      description: 'Personal Web Link List (.json)',
      ext: '.json',
    });
    setStatus(`Exported ${savedLinks.length} personal web link(s) to .JSON.`);
  };

  const importLinksJson = async () => {
    const picked = await pickLocalFiles({ accept: '.json,application/json' });
    if (!picked?.file) return;
    try {
      const parsed = JSON.parse(await picked.file.text());
      const rawList = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.links) ? parsed.links : null;
      if (!rawList) throw new Error('Expected a JSON array or { links: [...] } object.');
      const validSystems = new Set(SYSTEMS.map((s) => s.id));
      const existingUrls = new Set(savedLinks.map((x) => x.url));
      const added = [];
      let skipped = 0;

      for (const raw of rawList) {
        if (!raw || typeof raw !== 'object') { skipped++; continue; }
        const rawUrl = typeof raw.url === 'string' ? raw.url.trim() : '';
        let parsedUrl;
        try {
          parsedUrl = new URL(rawUrl);
          if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') throw new Error('Bad protocol');
        } catch {
          skipped++;
          continue;
        }
        if (existingUrls.has(parsedUrl.toString())) { skipped++; continue; }
        existingUrls.add(parsedUrl.toString());
        const cleanTitle = (typeof raw.title === 'string' ? raw.title : parsedUrl.hostname).trim().slice(0, 80) || parsedUrl.hostname;
        added.push({
          id: 'u' + Date.now() + Math.random().toString(36).slice(2, 6),
          title: cleanTitle,
          url: parsedUrl.toString(),
          system: validSystems.has(raw.system) ? raw.system : detectSystemFromExt(parsedUrl.toString(), 'dosbox'),
          mode: raw.mode === 'web' ? 'web' : 'rom',
          addedAt: Date.now(),
        });
      }

      if (added.length) setSavedLinks((prev) => [...added, ...prev]);
      os.msg({
        icon: added.length ? 'info' : 'warning',
        title: 'Import Web Links (.json)',
        text: `Imported ${added.length} web link(s) into your storage.` + (skipped ? `\nSkipped ${skipped} duplicate or invalid link(s).` : ''),
      });
    } catch (e) {
      os.msg({ icon: 'error', title: 'Import Web Links Failed', text: e.message });
    }
  };

  const loadFromUrl = async (rawAddress = urlInput, forceWeb = false, sysOverride = null, profKeyOverride = '') => {
    let target = (rawAddress || '').trim();
    if (!target) {
      target = await os.prompt({
        title: 'Run Software or Web Link',
        label: 'Paste your ROM/disk/ISO URL, GitHub/Dropbox/Drive link, or Web link:',
        width: 470,
      });
      if (!target) return;
      setUrlInput(target);
    }

    lastLaunchRef.current = () => loadFromUrl(target, forceWeb, sysOverride, profKeyOverride);

    if (forceWeb || (/archive\.org\/(details|embed)\//i.test(target) && !looksLikeBinarySoftwareUrl(target))) {
      await launchWebEmulator(target);
      return;
    }

    const fetchUrl = normalizeMediaUrl(target);
    let filename = decodeURIComponent(fetchUrl.split('?')[0].split('/').pop() || 'software.zip');
    const urlSys = sysOverride || detectSystemFromExt(filename, system);

    if (urlSys === 'mac68k' && /\.(hfv|toast|sit|hqx|dsk|img)$/i.test(filename)) {
      setSystem('mac68k');
      await launchClassicMac(macVersion, fetchUrl, `Booting ${macVersion} and mounting ${filename}...`);
      return;
    }

    try {
      const { blob, ctype, filename: resolvedName } = await fetchBinaryWithFallback(fetchUrl, filename);
      if (ctype.includes('text/html') && !looksLikeBinarySoftwareUrl(fetchUrl)) {
        await launchWebEmulator(target);
        return;
      }
      if (resolvedName) filename = resolvedName;

      const detected = sysOverride || detectSystemFromExt(filename, system);
      const destFolder = fs.romFolderForSystem(detected);
      setStageAuto({ phase: 'mounting', title: filename, detail: `Mounting into ${detected.toUpperCase()}...` });
      if (blob.size <= MAX_IDB_BYTES) {
        try {
          const n = fs.create({ name: filename, parent: destFolder, data: blob, mime: blob.type || 'application/octet-stream' });
          setSel('fs:' + n.id);
          await launchBlob(blob, n.name, detected, profKeyOverride || 'file:' + n.name);
          return;
        } catch { /* fall through to session memory */ }
      }
      const sid = 's' + Date.now();
      setSessionItems((prev) => [...prev, { id: sid, name: filename, blob, system: detected }]);
      setSel('sess:' + sid);
      await launchBlob(blob, filename, detected, profKeyOverride || 'file:' + filename);
    } catch (e) {
      if (e.status === 415) {
        await launchWebEmulator(target);
        return;
      }
      setStatus(`Download failed (${e.message}).`);
      setStageAuto({
        phase: 'error',
        title: `Failed: ${filename}`,
        detail: `${e.message} (CORS/network block or offline file).`,
        rawUrl: target,
      });
    }
  };

  const fullscreen = () => {
    if (!running) return os.msg({ icon: 'info', title: 'Retro Simulator', text: 'Start a simulator first.' });
    try { emuRef.current.fullscreen(); } catch { os.msg({ icon: 'warning', text: 'Fullscreen is not available in this context.' }); }
  };

  const saveState = async () => {
    if (!running) return os.msg({ icon: 'info', title: 'Retro Simulator', text: 'Start a simulator first.' });
    try {
      const ok = await emuRef.current.save();
      if (emuRef.current.kind === 'jsdos') {
        setStatus(ok ? 'DOSBox state saved in your browser storage.' : 'No changes to save yet.');
      }
    } catch (e) {
      setStatus('Save failed: ' + e.message);
    }
  };

  const removeSel = async () => {
    if (sel.startsWith('fs:')) {
      const n = fs.get(sel.slice(3));
      if (!n) return;
      if ((await os.msg({ icon: 'question', title: 'User Storage', text: `Remove "${n.name}" from ${fs.pathOf(n.parent)}?`, buttons: ['Yes', 'No'] })) === 'Yes') {
        fs.trash(n.id);
        setSel('');
      }
    } else if (sel.startsWith('sess:')) {
      const sid = sel.slice(5);
      setSessionItems((prev) => prev.filter((x) => x.id !== sid));
      setSel('');
    } else if (sel.startsWith('lnk:')) {
      const lid = sel.slice(4);
      setSavedLinks((prev) => prev.filter((x) => x.id !== lid));
      setSel('');
    }
  };

  const clearStoredRoms = async () => {
    const targetNodes = filterSys === 'all' ? mine : filteredMine;
    const sessCount = filterSys === 'all' ? sessionItems.length : filteredSession.length;
    if (!targetNodes.length && !sessCount) {
      setStatus('No stored ROMs in this view to clear.');
      return;
    }
    const scopeLabel = filterSys === 'all' ? 'ALL ROM folders (C:\\DOS, C:\\Amiga, C:\\Consoles, ...)' : `${SYSTEMS.find((s) => s.id === filterSys)?.short || filterSys} ROMs`;
    const ans = await os.msg({
      icon: 'question',
      title: 'Clear Stored ROMs',
      text: `Clear ${targetNodes.length} stored file(s)${sessCount ? ` and ${sessCount} session item(s)` : ''} from ${scopeLabel}?`,
      buttons: ['Yes', 'No'],
    });
    if (ans !== 'Yes') return;
    targetNodes.forEach((n) => fs.remove(n.id));
    if (filterSys === 'all') setSessionItems([]);
    else setSessionItems((prev) => prev.filter((it) => it.system !== filterSys));
    setSel('');
    setStatus(`Cleared ${targetNodes.length + sessCount} ROM(s) from ${scopeLabel}.`);
  };

  const importBiosFile = async () => {
    const picked = await pickLocalFiles({ accept: '.rom,.bin,.img,.zip,.bios', multiple: true });
    if (!picked?.length) return;
    for (const p of picked) {
      const n = await fs.importFile(p.file, 'bios');
      setActiveBiosId(n.id);
    }
    setStatus(`Imported ${picked.length} firmware file(s) to C:\\BIOS.`);
  };

  const importSaveFile = async () => {
    const picked = await pickLocalFiles({ accept: '.sav,.state,.srm,.ram,.zip', multiple: true });
    if (!picked?.length) return;
    for (const p of picked) {
      await fs.importFile(p.file, 'saves');
    }
    setStatus(`Imported ${picked.length} save file(s) to C:\\Saves.`);
  };

  const sendVirtualKey = (key, code, keyCode, opts = {}) => {
    const f = emuRef.current?.frame;
    if (!f) {
      os.msg({ icon: 'info', title: 'Virtual Keys', text: 'Start an emulator session first before sending virtual keys.' });
      return;
    }
    try {
      if (f.contentWindow?.__win95EmuCtrl) {
        f.contentWindow.__win95EmuCtrl.sendKey(key, code, keyCode, opts);
        setStatus(`Sent key: ${opts.ctrl ? 'Ctrl+' : ''}${opts.alt ? 'Alt+' : ''}${opts.meta ? 'Cmd+' : ''}${key}`);
      } else {
        os.msg({ icon: 'info', title: 'Virtual Keys', text: 'External web frames restrict synthetic key injection; click directly inside the screen to type.' });
      }
    } catch {
      os.msg({ icon: 'info', title: 'Virtual Keys', text: 'Click directly inside the emulator screen to focus keyboard input.' });
    }
  };

  const swapDiskHot = async () => {
    if (diskQueue.length < 2) return;
    const nextIdx = (activeDiskIdx + 1) % diskQueue.length;
    await swapToQueueIndex(nextIdx, false);
    sendVirtualKey('F4', 'F4', 115, { ctrl: true });
  };

  const powerOff = async () => {
    setKeysOpen(false);
    setSnapOpen(false);
    setPick(null);
    lastLaunchRef.current = null;
    await stop();
    setStageAuto(null);
    setStatus('Emulator powered off.');
  };

  const memoryReset = async () => {
    setKeysOpen(false);
    setSnapOpen(false);
    setPick(null);
    await purgeMemoryAndScrap();
    setStageAuto({ phase: 'ready', title: 'Memory Reset', detail: 'Emulator RAM & local BIOS/ROM cache cleared.' }, 2400);
    setStatus('Emulator memory & local scrap reset cleanly.');
  };

  const coldRestart = async () => {
    setKeysOpen(false);
    setSnapOpen(false);
    setPick(null);
    await purgeMemoryAndScrap();
    if (lastLaunchRef.current) {
      setStatus('Cold restarting clean emulator session...');
      setStageAuto({ phase: 'mounting', title: 'Cold Restart', detail: 'Resetting audio, keys, and session...' });
      await lastLaunchRef.current();
    } else {
      setStageAuto(null);
      setStatus('Session cleanly reset.');
    }
  };

  const captureSnapshotTo = async (destination) => {
    setSnapOpen(false);
    const f = emuRef.current?.frame;
    if (!f || !running) {
      os.msg({ icon: 'info', title: 'Snapshot', text: 'Start a running DOS / Retro session first to capture a screen snapshot.' });
      return;
    }
    try {
      let blob = null;
      try {
        blob = await f.contentWindow?.__win95EmuCtrl?.grabCanvasBlob?.();
      } catch {
        blob = null;
      }
      if (!blob) {
        os.msg({
          icon: 'warning',
          title: 'Snapshot Unavailable',
          text: 'Direct pixel capture is blocked on external cross-origin frames (like Infinite Mac web embeds). Direct snapshots work on DOSBox, Amiga, C64, ZX Spectrum, Amstrad, Atari ST, and Console sessions.',
        });
        return;
      }
      const SmartTransfer = await import('../os/smartTransfer.js');
      const cleanName = `${String(running).replace(/[^\w.-]+/g, '_').slice(0, 32)}.png`;
      await SmartTransfer.send({
        sourceApp: 'dosgames',
        targetApp: destination,
        contentType: 'image/png',
        payload: blob,
        title: cleanName,
        meta: { isSelection: false },
      });
      setStatus(`Sent screen snapshot to ${SmartTransfer.APP_NAMES[destination] || destination}.`);
    } catch (e) {
      os.msg({ icon: 'error', title: 'Snapshot Failed', text: 'Could not capture frame: ' + e.message });
    }
  };

  const libItemMenu = (e, { key, name, isLink = false, isFs = false, canQueue = false, canRemove = false, url = '' }) => {
    e.preventDefault();
    e.stopPropagation();
    setSel(key);
    os.showMenu(e.clientX, e.clientY, [
      { label: '&Run', bold: true, onClick: () => play(key) },
      {
        label: 'Run with &System Core',
        sub: SYSTEMS.map((sysDef) => ({
          label: sysDef.label,
          onClick: () => { setSystem(sysDef.id); play(key, sysDef.id); },
        })),
      },
      { sep: true },
      { label: '&Per-ROM Config...', onClick: () => { setSel(key); setFocusMode(false); setShowCfg(true); } },
      {
        label: 'Add to &Multi-Disk Queue',
        disabled: !canQueue,
        onClick: async () => {
          setSel(key);
          if (key.startsWith('fs:') && fs.get(key.slice(3))) {
            const n = fs.get(key.slice(3));
            setDiskQueue((prev) => [...prev, { id: 'dq-' + Date.now(), name: n.name, blob: fs.toBlob(n) }]);
          } else if (key.startsWith('sess:')) {
            const s = sessionItems.find((x) => 'sess:' + x.id === key);
            if (s) setDiskQueue((prev) => [...prev, { id: 'dq-' + Date.now(), name: s.name, blob: s.blob }]);
          } else if (key.startsWith('pc:')) {
            const fi = folderItems.find((x) => x.key === key);
            if (fi) {
              const f = await fi.entry.getFile();
              setDiskQueue((prev) => [...prev, { id: 'dq-' + Date.now(), name: fi.name, blob: f }]);
            }
          }
          setStatus(`Queued "${name}" in Multi-Disk Swapper.`);
        },
      },
      ...(isFs ? [{ label: 'Show in &Folder', onClick: () => os.open('explorer', { folderId: fs.get(key.slice(3))?.parent || 'games' }) }] : []),
      ...(isLink && url ? [{ label: '&Copy Web Link', onClick: () => { navigator.clipboard?.writeText(url).catch(() => {}); setStatus(`Copied URL for "${name}"`); } }] : []),
      { sep: true },
      {
        label: isFs ? '&Delete ROM' : '&Remove from List',
        disabled: !canRemove,
        onClick: () => {
          if (key.startsWith('fs:')) {
            const n = fs.get(key.slice(3));
            if (n) { fs.remove(n.id); setSel(''); }
          } else if (key.startsWith('sess:')) {
            setSessionItems((prev) => prev.filter((x) => 'sess:' + x.id !== key));
            setSel('');
          } else if (key.startsWith('lnk:')) {
            setSavedLinks((prev) => prev.filter((x) => 'lnk:' + x.id !== key));
            setSel('');
          }
        },
      },
    ]);
  };

  const matchesFilter = (sysId) =>
    filterSys === 'all'
      ? true
      : filterSys === 'consoles'
      ? CONSOLE_SYSTEMS.some((c) => c.id === sysId)
      : sysId === filterSys;

  const filteredMine = mine.filter((n) => matchesFilter(detectSystemFromExt(n.name, system)));
  const filteredSession = sessionItems.filter((it) => matchesFilter(it.system));
  const filteredLinks = savedLinks.filter((l) => matchesFilter(l.system));
  const filteredFolderItems = folderItems.filter((it) => matchesFilter(it.system));

  const activeSys = SYSTEMS.find((s) => s.id === system) || SYSTEMS[0];
  const curQueueItem = diskQueue[activeDiskIdx] || null;
  const resolvedBios = resolveBiosForSystem(system);
  const selectedBiosDef = FREE_BIOS_SYSTEMS.find((b) => b.id === biosSys) || FREE_BIOS_SYSTEMS[0];
  const selectedConsoleDef = CONSOLE_SYSTEMS.find((c) => c.id === consoleSys) || CONSOLE_SYSTEMS[0];
  const quickTabs = SYSTEMS.filter((s) => !CONSOLE_SYSTEMS.some((c) => c.id === s.id));
  const hasConsoleInStorage = filterSys === 'consoles' || CONSOLE_SYSTEMS.some((c) => c.id === filterSys);
  const syncBiosSelection = (sysId) => {
    if (sysId === 'mac68k' || CONSOLE_SYSTEMS.some((c) => c.id === sysId)) return;
    if ((selectedBiosDef.sysId || selectedBiosDef.id) !== sysId) setBiosSys(sysId);
  };

  return (
    <div className="app dg">
      <MenuBar menus={[
        { label: '&Simulator', items: [
          { label: '&Run Selected', disabled: !sel, onClick: () => play() },
          { label: '&Cold Restart (Clean Reset)', disabled: !running && !lastLaunchRef.current, onClick: coldRestart },
          { label: 'Memory & &Cache Reset', onClick: memoryReset },
          { label: '&Power Off', disabled: !running, onClick: powerOff },
          { sep: true },
          { label: 'Open &Local Disk / ROM / ISO...', onClick: () => openLocalFile() },
          { label: 'Mount Local PC &Folder (Zero-Copy)...', onClick: mountPCFolder },
          { label: '&Virtual Drive Manager (A:/C:/D:/E:)...', onClick: () => os.open('drives') },
          { sep: true },
          { label: 'Snapshot to &Paint', disabled: !running, onClick: () => captureSnapshotTo('paint') },
          { label: 'Snapshot to &WordPad', disabled: !running, onClick: () => captureSnapshotTo('wordpad') },
          { sep: true },
          { label: 'Run from &URL...', onClick: () => loadFromUrl('') },
          { label: '&Save Web Link to My Storage...', onClick: () => saveWebLinkToStorage('') },
          { label: '&Export Web Links (.json)...', onClick: exportLinksJson },
          { label: '&Import Web Links (.json)...', onClick: importLinksJson },
          { sep: true },
          { label: 'C:\\&BIOS & C:\\Saves Manager...', onClick: () => setShowBiosModal(true) },
          { label: 'Clear Stored &ROMs...', onClick: clearStoredRoms },
          { label: 'Attach Boot &Floppy (.img) for CD...', onClick: attachFloppyForCd },
          { label: 'Open &Disk & ZIP Inspector...', onClick: () => os.open('inspector') },
          { sep: true },
          { label: 'E&xit', onClick: () => os.close(win.id) },
        ] },
        { label: '&System', items: SYSTEMS.map((s) => ({ label: s.label, radio: true, checked: system === s.id, onClick: () => { setSystem(s.id); setFilterSys(CONSOLE_SYSTEMS.some((c) => c.id === s.id) ? 'consoles' : s.id); if (CONSOLE_SYSTEMS.some((c) => c.id === s.id)) setConsoleSys(s.id); else syncBiosSelection(s.id); } })) },
        { label: '&View', items: [
          { label: '&Theater / Focus Screen (Hide Sidebar)', checked: focusMode, onClick: () => setFocusMode((v) => !v) },
          { label: 'Show &Per-ROM Config Panel', checked: showCfg, onClick: () => { setFocusMode(false); setShowCfg((c) => !c); } },
          { sep: true },
          { label: '&Mute Emulator Sound', checked: muted, onClick: () => setMuted((m) => !m) },
          { label: '&Auto-Pause in Background', checked: autoPause, onClick: () => setAutoPause((p) => !p) },
          { sep: true },
          { label: '&Full screen', onClick: fullscreen },
        ] },
        { label: '&State', items: [
          { label: '&Save State', onClick: saveState },
          { label: '&Cold Restart Session', disabled: !running && !lastLaunchRef.current, onClick: coldRestart },
          { label: '&Memory Reset (Clear Scrap)', onClick: memoryReset },
          { label: 'Manage C:\\&BIOS & C:\\Saves...', onClick: () => setShowBiosModal(true) },
        ] },
        { label: '&Help', items: [
          { label: '&Help Topics', onClick: () => os.open('help') },
          { label: '&About Simulators', onClick: () => os.msg({ icon: 'dosgames', width: 440, title: 'About DOSBox & Retro Computers', text: 'Only the emulator engines run in this app — all ROMs, disks, BIOS firmware, saves, and web links stay strictly in your own local or browser storage:\n\n• DOS: js-dos v8 (FreeDOS / DOSBox BIOS Shell) & DOSBox-Pure\n• Commodore Amiga: PUAE AROS, SAE AROS m68k, vAmiga AROS 2026 & EmuTOS\n• Atari ST: EstyJS 2.0 (Open-Source EmuTOS 1.4 GPLv2)\n• Amstrad CPC (Caprice32), ZX Spectrum (Fuse), Commodore 64 (VICE)\n• Consoles & Arcade: FBNeo, NES, SNES, Sega Genesis, SMS/GG, PC Engine, GB, GBA\n• Classic Mac OS: System 6 / 7.5.3 / OS 8.1 / OS 9.0.4 + Infinite HD' }) },
        ] },
      ]} />

      <div className="dg-split">
        {!focusMode && <div className="dg-side" title={`${TOOLTIP_ZERO_ROMS}\n\n${TOOLTIP_DROP_HINT}`}>
          {/* 1. Open-Source System BIOS Quick Card */}
          <div className="dg-quick bios" title={selectedBiosDef.detail}>
            <div className="dg-quick-head">
              <b>Open-Source System BIOS</b>
              <span>Free Firmware</span>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <select
                className="field"
                style={{ flex: 1, minWidth: 0, padding: '2px 4px', fontSize: 11 }}
                value={biosSys}
                onChange={(e) => {
                  const id = e.target.value;
                  const def = FREE_BIOS_SYSTEMS.find((b) => b.id === id);
                  setBiosSys(id);
                  setSystem(def?.sysId || id);
                }}
              >
                {FREE_BIOS_SYSTEMS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
              <button
                type="button"
                className="btn default"
                style={{ padding: '2px 8px', minWidth: 0 }}
                onClick={() => bootFreeBios(biosSys)}
                title={selectedBiosDef.detail}
              >
                ▶ Boot BIOS
              </button>
            </div>
            <div className="dg-bios-link" title={selectedBiosDef.sourceUrl}>
              <span>Source:</span>
              <a href={selectedBiosDef.sourceUrl} target="_blank" rel="noreferrer">
                {selectedBiosDef.sourceLabel || selectedBiosDef.sourceUrl}
              </a>
            </div>
          </div>

          {/* 2. Consoles & Arcade (FBNeo) Quick Card */}
          <div className="dg-quick consoles" title={TOOLTIP_ZERO_ROMS}>
            <div className="dg-quick-head">
              <b>Consoles &amp; Arcade</b>
              <span>FBNeo / Cores</span>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <select
                className="field"
                style={{ flex: 1, minWidth: 0, padding: '2px 4px', fontSize: 11 }}
                value={consoleSys}
                onChange={(e) => {
                  setConsoleSys(e.target.value);
                  setSystem(e.target.value);
                }}
              >
                {CONSOLE_SYSTEMS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <button
                type="button"
                className="btn default"
                style={{ padding: '2px 8px', minWidth: 0 }}
                onClick={() => { setSystem(consoleSys); openLocalFile(consoleSys); }}
                title={`${selectedConsoleDef.hint} — opens file picker and saves into C:\\Consoles`}
              >
                ▶ Open ROM
              </button>
            </div>
          </div>

          {/* 3. Classic Mac Software Runner */}
          <div className="dg-quick" title={TOOLTIP_DROP_HINT}>
            <div className="dg-quick-head">
              <b>Classic Mac OS Apps</b>
              <span>68k / PPC</span>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <select className="field" style={{ flex: 1, minWidth: 0, padding: '2px 4px', fontSize: 11 }} value={macVersion} onChange={(e) => setMacVersion(e.target.value)}>
                {MAC_VERSIONS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
              <button
                type="button"
                className="btn default"
                style={{ padding: '2px 8px', minWidth: 0 }}
                onClick={() => { setSystem('mac68k'); launchClassicMac(macVersion); }}
                title="Boot Classic Mac OS + Apps HD right inside this window"
              >
                ▶ Boot Mac
              </button>
            </div>
          </div>

          <div className="gb-title-line">Simulator Core</div>
          <select
            className="field"
            value={system}
            onChange={(e) => {
              const v = e.target.value;
              setSystem(v);
              if (CONSOLE_SYSTEMS.some((c) => c.id === v)) setConsoleSys(v);
              else syncBiosSelection(v);
            }}
            style={{ marginBottom: 4 }}
          >
            {SYSTEMS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div style={{ fontSize: 10, color: '#404040', marginBottom: 4 }}>
            {activeSys.hint} {resolvedBios && <b>· BIOS: {resolvedBios.name}</b>}
          </div>

          {system === 'dosbox' && (
            <div className="sunken" style={{ padding: '4px 6px', marginBottom: 6, background: '#dfdfdf', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ flex: 1 }}>DOS Engine:</span>
                <select className="field" style={{ flex: 1, padding: '1px 3px' }} value={dosEngine} onChange={(e) => setDosEngine(e.target.value)}>
                  <option value="auto">Auto (Smart)</option>
                  <option value="jsdos">js-dos v8</option>
                  <option value="pure">DOSBox-Pure</option>
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <input type="checkbox" checked={bootFloppy} onChange={(e) => setBootFloppy(e.target.checked)} />
                <span>Boot floppy A:\ (boot -l a)</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button className="btn tool" style={{ flex: 1 }} onClick={attachFloppyForCd}>
                  {pairedFloppy ? `A: ${pairedFloppy.name}` : '+ Pair Boot Floppy (CD)'}
                </button>
                {pairedFloppy && <button className="btn tool" title="Clear paired floppy" onClick={() => setPairedFloppy(null)}>✕</button>}
              </div>
            </div>
          )}

          {diskQueue.length > 0 && (
            <div className="sunken dg-queue">
              <div className="dg-queue-top">
                <b>Disk {activeDiskIdx + 1}/{diskQueue.length}:</b>
                <span title={curQueueItem?.name}>{curQueueItem?.name}</span>
              </div>
              <div className="dg-queue-btns">
                <button className="btn tool" disabled={activeDiskIdx <= 0} onClick={() => swapToQueueIndex(activeDiskIdx - 1, false)}>◀ Prev</button>
                <button className="btn tool" disabled={activeDiskIdx >= diskQueue.length - 1} onClick={() => swapToQueueIndex(activeDiskIdx + 1, false)}>Next Disk ▶</button>
                <button className="btn tool default" onClick={() => swapToQueueIndex(activeDiskIdx, true)}>Boot</button>
                <button className="btn tool" onClick={() => { setDiskQueue([]); setActiveDiskIdx(0); }}>Clear</button>
              </div>
            </div>
          )}

          <div className="gb-title-line">Your Web Link (ROM URL or Web Page)</div>
          <form onSubmit={(e) => { e.preventDefault(); loadFromUrl(urlInput, false); }} style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
            <input
              className="field"
              style={{ flex: 1, minWidth: 0 }}
              placeholder="Your ROM URL, GitHub, Dropbox, or Drive link..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
            <button type="submit" className="btn tool" title="Fetch ROM into your storage and run">Run</button>
            <button type="button" className="btn tool" title="Open link directly inside web frame" onClick={() => launchWebEmulator(urlInput)}>Web</button>
            <button type="button" className="btn tool" title="Save link bookmark into your browser storage" onClick={() => saveWebLinkToStorage(urlInput)}>Save</button>
          </form>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <button type="button" className="btn tool" style={{ flex: 1 }} onClick={exportLinksJson} title="Export your saved web links as .json">Export Links .json</button>
            <button type="button" className="btn tool" style={{ flex: 1 }} onClick={importLinksJson} title="Import a personal .json web link list">Import Links .json</button>
          </div>

          <div className="gb-title-line" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} title={TOOLTIP_ZERO_ROMS}>
            <span>Storage ({fs.pathOf(fs.romFolderForSystem(system))})</span>
            <button type="button" className="btn tool" style={{ padding: '0 6px', fontSize: 10 }} onClick={clearStoredRoms} title="Clear stored ROMs in current view">Clear ROMs</button>
          </div>
          <div className="dg-tabs">
            <button type="button" className={'btn tool ' + (filterSys === 'all' ? 'pressed' : '')} onClick={() => setFilterSys('all')}>All</button>
            {quickTabs.map((s) => (
              <button
                key={s.id}
                type="button"
                className={'btn tool ' + (filterSys === s.id ? 'pressed' : '')}
                onClick={() => { setFilterSys(s.id); setSystem(s.id); syncBiosSelection(s.id); }}
              >
                {s.short}
              </button>
            ))}
            <button
              type="button"
              className={'btn tool ' + (hasConsoleInStorage ? 'pressed' : '')}
              onClick={() => { setFilterSys('consoles'); setSystem(consoleSys); }}
              title="Filter stored console & arcade ROMs (C:\\Consoles)"
            >
              Consoles
            </button>
          </div>

          <div className="field dg-list" title={`${TOOLTIP_ZERO_ROMS}\n\n${TOOLTIP_DROP_HINT}`}>
            {filteredMine.length === 0 && filteredLinks.length === 0 && filteredSession.length === 0 && filteredFolderItems.length === 0 && (
              <div style={{ padding: 8, color: '#606060', fontSize: 11, lineHeight: 1.4 }}>
                Empty — <b>Open File...</b>, <b>Mount Folder...</b>, or drop ROMs onto the screen.
              </div>
            )}
            {filteredMine.length > 0 && <div className="dg-sep">Browser Storage (C:\)</div>}
            {filteredMine.map((n) => (
              <div
                key={n.id}
                className={'fd-item ' + (sel === 'fs:' + n.id ? 'sel' : '')}
                onClick={() => { setSel('fs:' + n.id); setSystem(detectSystemFromExt(n.name, system)); }}
                onDoubleClick={() => play('fs:' + n.id)}
                onContextMenu={(e) => libItemMenu(e, { key: 'fs:' + n.id, name: n.name, isFs: true, canQueue: true, canRemove: true })}
                title={`${n.folderPath}${n.name}`}
              >
                <Icon name="zip" size={16} />{n.name} <small style={{ opacity: 0.65, marginLeft: 4 }}>({n.folderPath})</small>
              </div>
            ))}
            {filteredFolderItems.length > 0 && <div className="dg-sep">Mounted PC Folders (Zero-Copy)</div>}
            {filteredFolderItems.map((fi) => (
              <div
                key={fi.key}
                className={'fd-item ' + (sel === fi.key ? 'sel' : '')}
                onClick={() => { setSel(fi.key); setSystem(fi.system); }}
                onDoubleClick={() => play(fi.key)}
                onContextMenu={(e) => libItemMenu(e, { key: fi.key, name: fi.name, canQueue: true, canRemove: false })}
              >
                <Icon name="folderOpen" size={16} />[{fi.letter}] {fi.name}
              </div>
            ))}
            {filteredLinks.length > 0 && <div className="dg-sep">Your Saved Web Links</div>}
            {filteredLinks.map((lnk) => (
              <div
                key={lnk.id}
                className={'fd-item ' + (sel === 'lnk:' + lnk.id ? 'sel' : '')}
                onClick={() => { setSel('lnk:' + lnk.id); setSystem(lnk.system || system); }}
                onDoubleClick={() => play('lnk:' + lnk.id)}
                onContextMenu={(e) => libItemMenu(e, { key: 'lnk:' + lnk.id, name: lnk.title, isLink: true, url: lnk.url, canRemove: true })}
              >
                <Icon name="browser" size={16} />{lnk.title}
              </div>
            ))}
            {filteredSession.length > 0 && <div className="dg-sep">Mounted Images (Large / Session)</div>}
            {filteredSession.map((it) => (
              <div
                key={it.id}
                className={'fd-item ' + (sel === 'sess:' + it.id ? 'sel' : '')}
                onClick={() => { setSel('sess:' + it.id); setSystem(it.system); }}
                onDoubleClick={() => play('sess:' + it.id)}
                onContextMenu={(e) => libItemMenu(e, { key: 'sess:' + it.id, name: it.name, canQueue: true, canRemove: true })}
              >
                <Icon name="drive" size={16} />{it.name}
              </div>
            ))}
          </div>

          {(selNode || selFolder || selLink || selSession) && (
            <div className="dg-desc">
              {selNode ? (
                <><b>{selNode.name}</b><br />Stored in {fs.pathOf(selNode.parent)} ({detectSystemFromExt(selNode.name, system).toUpperCase()})</>
              ) : selFolder ? (
                <><b>{selFolder.name}</b><br />Zero-Copy PC Folder ({selFolder.letter} {selFolder.folderName}) · {fmtSize(selFolder.entry.size)}</>
              ) : selLink ? (
                <><b>{selLink.title}</b><br />User Web Link · {selLink.mode === 'web' ? 'Web Frame' : 'ROM Download'}<br /><i>{selLink.url}</i></>
              ) : (
                <><b>{selSession.name}</b><br />Mounted directly from your local PC memory</>
              )}
            </div>
          )}

          {showCfg && activeProfKey && (
            <div className="sunken dg-cfg">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b>Per-ROM Config ({activeProfKey.replace(/^file:/, '')})</b>
                <button type="button" className="btn tool" onClick={() => setShowCfg(false)}>✕</button>
              </div>
              <div className="dg-cfg-grid">
                <label>Cycles:
                  <select className="field" value={activeProf.cycles} onChange={(e) => updateProfile({ cycles: e.target.value })}>
                    <option value="auto">Auto</option>
                    <option value="max">Max</option>
                    <option value="3000">3000 (8088)</option>
                    <option value="12000">12000 (386/486)</option>
                  </select>
                </label>
                <label>Audio:
                  <select className="field" value={activeProf.sound} onChange={(e) => updateProfile({ sound: e.target.value })}>
                    <option value="sb16">Sound Blaster 16</option>
                    <option value="adlib">AdLib</option>
                    <option value="gus">Gravis Ultrasound</option>
                    <option value="none">PC Speaker Only</option>
                  </select>
                </label>
                <label>Aspect:
                  <select className="field" value={activeProf.aspect} onChange={(e) => updateProfile({ aspect: e.target.value })}>
                    <option value="contain">Fit (4:3)</option>
                    <option value="cover">Fill Viewport</option>
                  </select>
                </label>
              </div>
              <textarea
                className="field"
                rows={2}
                placeholder="Optional extra AUTOEXEC lines (one per line)..."
                value={activeProf.customAutoexec}
                onChange={(e) => updateProfile({ customAutoexec: e.target.value })}
              />
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 6, justifyContent: 'flex-start', gap: 4, flexWrap: 'wrap' }}>
            <button className="btn default" disabled={!sel} onClick={() => play()}>▶ Run</button>
            <button className="btn" disabled={!running} onClick={powerOff}>⏻ Power Off</button>
            <button className="btn" onClick={() => openLocalFile()}>Open File...</button>
            <button className="btn" onClick={mountPCFolder}>Mount Folder...</button>
            <button className="btn" onClick={queueMultiDisks}>+ Queue Disks...</button>
            {(selNode || selSession || selFolder) && <button className="btn" onClick={queueSelectedDisk}>+ Queue Sel</button>}
            <button className={'btn ' + (showCfg ? 'pressed' : '')} disabled={!activeProfKey} onClick={() => setShowCfg((c) => !c)}>⚙ Config</button>
            <button className="btn" onClick={() => setShowBiosModal(true)}>BIOS / Saves</button>
            <button className="btn" onClick={() => os.open('drives')}>Drives</button>
            <button className="btn" disabled={!sel || sel.startsWith('pc:')} onClick={removeSel}>Remove</button>
            <button className="btn" onClick={fullscreen}>Full screen</button>
            <button className="btn" onClick={saveState}>Save state</button>
          </div>

          {pick && (
            <div className="groupbox" style={{ marginTop: 10 }}>
              <span className="gb-title">Executable to run</span>
              <select className="field" style={{ width: '100%' }} value={pick.choice} onChange={(e) => setPick({ ...pick, choice: e.target.value })}>
                {pick.list.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <div className="btn-row">
                <button className="btn default" onClick={() => runDosExeFromZip(pick.title, pick.files, pick.choice, pick.prof)}>Run</button>
                <button className="btn" onClick={() => setPick(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>}

        <div className="dg-stage-col">
          <div className="dg-bar" ref={barRef}>
            <button
              type="button"
              className={'btn tool ' + (focusMode ? 'pressed' : '')}
              onClick={() => setFocusMode((v) => !v)}
              title={focusMode ? 'Show Library Sidebar' : 'Hide Sidebar (Theater Mode)'}
            >
              {focusMode ? '◨ Panel' : '◧ Theater'}
            </button>
            <span className="dg-bar-sep" />
            <button
              type="button"
              className={'btn tool ' + (muted ? 'pressed' : '')}
              onClick={() => setMuted((m) => !m)}
              title="Mute / Unmute Emulator Audio"
            >
              {muted ? '🔇 Muted' : '🔊 Sound'}
            </button>
            <button
              type="button"
              className={'btn tool ' + (autoPause ? 'pressed' : '')}
              onClick={() => setAutoPause((p) => !p)}
              title="Automatically pause CPU & audio when window loses focus or is minimized"
            >
              {autoPause ? '⏸ Auto-Pause: On' : '⏸ Auto-Pause: Off'}
            </button>
            <button
              type="button"
              className="btn tool"
              disabled={!running && !lastLaunchRef.current}
              onClick={coldRestart}
              title="Cold Restart: Clean memory & reboot active session"
            >
              ↻ Reset
            </button>
            <button
              type="button"
              className="btn tool"
              onClick={memoryReset}
              title="Memory Reset: Purge emulator RAM, blob URLs & local BIOS/ROM cache"
            >
              ⟲ Mem Reset
            </button>
            <button
              type="button"
              className="btn tool"
              disabled={!running}
              onClick={powerOff}
              title="Power Off: Shut down running emulator cleanly"
            >
              ⏻ Power Off
            </button>
            {diskQueue.length > 1 && (
              <button
                type="button"
                className="btn tool"
                onClick={swapDiskHot}
                title="Swap to next queued disk and send Ctrl+F4"
              >
                ⇄ Disk ({activeDiskIdx + 1}/{diskQueue.length})
              </button>
            )}
            <div className="dg-bar-wrap">
              <button
                type="button"
                className={'btn tool ' + (keysOpen ? 'pressed' : '')}
                disabled={!running}
                onClick={() => { setSnapOpen(false); setKeysOpen((v) => !v); }}
                title="Send quick & function keys (F1–F10, Esc, Enter)"
              >
                ⌨ Keys ▾
              </button>
              {keysOpen && (
                <div className="dg-keys-pop">
                  <div className="dg-keys-grid">
                    <button type="button" className="btn tool" onClick={() => sendVirtualKey('Escape', 'Escape', 27)}>Esc</button>
                    <button type="button" className="btn tool" onClick={() => sendVirtualKey('Enter', 'Enter', 13)}>Enter</button>
                    <button type="button" className="btn tool" onClick={() => sendVirtualKey(' ', 'Space', 32)}>Space</button>
                    <button type="button" className="btn tool" onClick={() => sendVirtualKey('Tab', 'Tab', 9)}>Tab</button>
                    <button type="button" className="btn tool" onClick={() => setKeysOpen(false)}>✕</button>
                    {QUICK_FKEYS.map((fk) => (
                      <button key={fk.key} type="button" className="btn tool" onClick={() => sendVirtualKey(fk.key, fk.code, fk.keyCode)}>
                        {fk.label}
                      </button>
                    ))}
                  </div>
                  <div className="dg-keys-combos">
                    <button type="button" className="btn tool" onClick={() => sendVirtualKey('F4', 'F4', 115, { ctrl: true })}>Ctrl+F4 Swap</button>
                    <button type="button" className="btn tool" onClick={() => sendVirtualKey('Delete', 'Delete', 46, { ctrl: true, alt: true })}>Ctrl+Alt+Del</button>
                    <button type="button" className="btn tool" onClick={() => sendVirtualKey('Escape', 'Escape', 27, { meta: true, alt: true })}>Cmd+Opt+Esc</button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ flex: 1 }} />
            <div className="dg-bar-wrap">
              <button
                type="button"
                className={'btn tool ' + (snapOpen ? 'pressed' : '')}
                disabled={!running}
                onClick={() => { setKeysOpen(false); setSnapOpen((v) => !v); }}
                title="Capture live screen snapshot to Paint or WordPad"
              >
                📷 Snapshot ▾
              </button>
              {snapOpen && (
                <div className="dg-snap-pop">
                  <button type="button" className="btn tool" onClick={() => captureSnapshotTo('paint')}>Send to Paint</button>
                  <button type="button" className="btn tool" onClick={() => captureSnapshotTo('wordpad')}>Send to WordPad</button>
                </div>
              )}
            </div>
          </div>

          <div
            className={'dg-screen ' + (activeProf.aspect === 'cover' ? 'aspect-cover' : '')}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) ingestFiles([...e.dataTransfer.files]); }}
            title={TOOLTIP_DROP_HINT}
          >
            <div ref={host} className="jsdos-host" />
            {stageBanner && (
              <div className={'dg-stage ' + stageBanner.phase} role="status">
                <span>
                  <b>{stageBanner.phase === 'downloading' ? '⬇ Downloading:' : stageBanner.phase === 'mounting' ? '⚙ Mounting:' : stageBanner.phase === 'ready' ? '✓ Ready:' : '⚠ Error:'}</b>{' '}
                  {stageBanner.title} — {stageBanner.detail}
                </span>
                {stageBanner.rawUrl && (
                  <button
                    type="button"
                    className="btn tool"
                    onClick={() => { const u = stageBanner.rawUrl; setStageAuto(null); launchWebEmulator(u); }}
                  >
                    Web Frame
                  </button>
                )}
                <button type="button" className="btn tool" onClick={() => setStageAuto(null)}>✕</button>
              </div>
            )}
            {pausedByBg && (
              <div className="dg-paused-overlay">
                <b>⏸ Paused in Background</b>
                <span>Focus DOSBox &amp; Retro window to resume audio &amp; emulation</span>
              </div>
            )}
            {!running && (
              <div className="dg-idle" title={`${TOOLTIP_ZERO_ROMS}\n\n${TOOLTIP_DROP_HINT}`}>
                <Icon name="dosgames" size={64} />
                <div>DOSBox &amp; Retro — {activeSys.label} ready</div>
                <small>{system === 'mac68k' ? 'Click "▶ Boot Mac" at top-left to launch Classic Mac OS + Apps HD, or open a local file' : 'Click "▶ Boot BIOS" at top-left to boot open-source firmware, or open your own ROM/disk'}</small>
                {system !== 'mac68k' && FREE_BIOS_SYSTEMS.some((b) => (b.sysId || b.id) === system) && (
                  <button type="button" className="btn default" style={{ marginTop: 8, pointerEvents: 'auto' }} onClick={() => bootFreeBios(biosSys)}>
                    ▶ Boot Open-Source BIOS ({selectedBiosDef.biosName})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* User-Owned C:\BIOS & C:\Saves Manager Modal */}
      {showBiosModal && (
        <Dialog title="C:\BIOS Firmware & C:\Saves Manager" icon="system" onClose={() => setShowBiosModal(false)} width={470}>
          <div className="tabs" style={{ marginBottom: 8 }}>
            <button className={'tab ' + (biosTab === 'bios' ? 'on' : '')} onClick={() => setBiosTab('bios')}>C:\BIOS Firmware ({biosFiles.length})</button>
            <button className={'tab ' + (biosTab === 'saves' ? 'on' : '')} onClick={() => setBiosTab('saves')}>C:\Saves States ({saveFiles.length})</button>
          </div>

          {biosTab === 'bios' ? (
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11 }}>
                Open-source BIOSes (FreeDOS shell, AROS Kickstart, EmuTOS 1.4, Caprice32, Fuse, VICE) boot out of the box via <b>▶ Boot BIOS</b>. Optionally import custom firmware here (e.g. Kickstart .rom, TOS .img) to override.
              </p>
              <div className="field list-details" style={{ height: 150, marginBottom: 8 }}>
                <div className="ld-head" style={{ gridTemplateColumns: '2fr 70px 110px' }}>
                  <span>Filename</span><span>Size</span><span>Action</span>
                </div>
                {biosFiles.length === 0 && <div style={{ padding: 8, color: '#808080' }}>C:\BIOS is empty. Click Import BIOS... below.</div>}
                {biosFiles.map((b) => (
                  <div key={b.id} className={'ld-row ' + (activeBiosId === b.id ? 'sel' : '')} style={{ gridTemplateColumns: '2fr 70px 110px' }}>
                    <span className="ld-name">{b.name}</span>
                    <span>{fmtSize(b.size)}</span>
                    <span style={{ display: 'flex', gap: 3 }}>
                      <button className="btn tool" style={{ padding: '1px 4px', fontSize: 10 }} onClick={() => setActiveBiosId(activeBiosId === b.id ? '' : b.id)}>
                        {activeBiosId === b.id ? 'Pinned' : 'Use'}
                      </button>
                      <button className="btn tool" style={{ padding: '1px 4px', fontSize: 10 }} onClick={() => { if (activeBiosId === b.id) setActiveBiosId(''); fs.remove(b.id); }}>Del</button>
                    </span>
                  </div>
                ))}
              </div>
              <div className="btn-row" style={{ justifyContent: 'space-between' }}>
                <button className="btn default" onClick={importBiosFile}>Import BIOS to C:\BIOS...</button>
                <button className="btn" onClick={() => setShowBiosModal(false)}>Close</button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11 }}>
                Manage portable save states and SRAM backups stored inside C:\Saves.
              </p>
              <div className="field list-details" style={{ height: 150, marginBottom: 8 }}>
                <div className="ld-head" style={{ gridTemplateColumns: '2fr 70px 110px' }}>
                  <span>Save File</span><span>Size</span><span>Action</span>
                </div>
                {saveFiles.length === 0 && <div style={{ padding: 8, color: '#808080' }}>C:\Saves is empty.</div>}
                {saveFiles.map((sv) => (
                  <div key={sv.id} className="ld-row" style={{ gridTemplateColumns: '2fr 70px 110px' }}>
                    <span className="ld-name">{sv.name}</span>
                    <span>{fmtSize(sv.size)}</span>
                    <span style={{ display: 'flex', gap: 3 }}>
                      <button className="btn tool" style={{ padding: '1px 4px', fontSize: 10 }} onClick={() => fs.downloadNode(sv)}>Export</button>
                      <button className="btn tool" style={{ padding: '1px 4px', fontSize: 10 }} onClick={() => fs.remove(sv.id)}>Del</button>
                    </span>
                  </div>
                ))}
              </div>
              <div className="btn-row" style={{ justifyContent: 'space-between' }}>
                <button className="btn default" onClick={importSaveFile}>Import Save to C:\Saves...</button>
                <button className="btn" onClick={() => setShowBiosModal(false)}>Close</button>
              </div>
            </div>
          )}
        </Dialog>
      )}

      <StatusBar>
        <span>{pausedByBg ? 'Paused (Background) — ' : muted ? 'Muted — ' : ''}{status}</span>
        <span>{activeSys.label}</span>
        <span>{pausedByBg ? 'Paused' : running ? 'Running' : 'Stopped'}</span>
      </StatusBar>
    </div>
  );
}

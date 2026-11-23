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

const JSDOS_JS = 'https://v8.js-dos.com/latest/js-dos.js';
const JSDOS_CSS = 'https://v8.js-dos.com/latest/js-dos.css';
const EJS_LOADER = 'https://cdn.emulatorjs.org/stable/data/loader.js';
const EJS_DATA = 'https://cdn.emulatorjs.org/stable/data/';
const USER_LINKS_KEY = 'win95.user.romLinks.v1';
const USER_PROFILES_KEY = 'win95.user.romProfiles.v1';

const SYSTEMS = [
  { id: 'dosbox', short: 'DOS', label: 'DOSBox / Win95 CD', core: 'dosbox_pure', exts: ['jsdos', 'zip', 'exe', 'com', 'bat', 'img', 'ima', 'vfd', 'iso', 'cue', 'bin'], hint: '.jsdos, .zip, .exe, Floppy (.img/.ima), CD (.iso/.cue)' },
  { id: 'amiga', short: 'Amiga', label: 'Commodore Amiga', core: 'amiga', exts: ['adf', 'ipf', 'dms', 'lha', 'hdf', 'zip'], hint: '.adf, .ipf, .dms, .lha, .hdf, .zip (PUAE)' },
  { id: 'amstradcpc', short: 'Amstrad', label: 'Amstrad CPC', core: 'amstradcpc', exts: ['dsk', 'sna', 'cdt', 'voc', 'zip'], hint: '.dsk, .sna, .cdt, .zip (Caprice32)' },
  { id: 'c64', short: 'C64', label: 'Commodore 64', core: 'c64', exts: ['d64', 'd71', 'd81', 't64', 'prg', 'crt', 'tap', 'zip'], hint: '.d64, .t64, .prg, .crt, .tap, .zip (VICE x64)' },
  { id: 'zxspectrum', short: 'ZX Spec', label: 'ZX Spectrum', core: 'zxspectrum', exts: ['tap', 'tzx', 'z80', 'sna', 'dsk', 'trd', 'scl', 'zip'], hint: '.tap, .tzx, .z80, .sna, .dsk, .zip (Fuse)' },
  { id: 'atarist', short: 'Atari ST', label: 'Atari ST', core: 'atarist', exts: ['st', 'msa', 'stx', 'dim', 'ipf', 'zip'], hint: '.st, .msa, .stx, .dim, .zip (Hatari)' },
];

const ALL_EXTS = [...new Set(SYSTEMS.flatMap((s) => s.exts))];
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
  if (['adf', 'ipf', 'dms', 'lha', 'hdf'].includes(e)) return 'amiga';
  if (['cdt', 'voc'].includes(e)) return 'amstradcpc';
  if (['d64', 'd71', 'd81', 't64', 'prg', 'crt'].includes(e)) return 'c64';
  if (['tzx', 'z80', 'trd', 'scl'].includes(e)) return 'zxspectrum';
  if (['st', 'msa', 'stx', 'dim'].includes(e)) return 'atarist';
  if (['jsdos', 'exe', 'com', 'bat', 'img', 'ima', 'vfd', 'iso', 'cue', 'bin'].includes(e)) return 'dosbox';
  if (e === 'dsk') return fallback === 'zxspectrum' ? 'zxspectrum' : 'amstradcpc';
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
  const lines = [
    '[sdl]',
    'autolock=false',
    '[cpu]',
    `cycles=${p.cycles === 'auto' ? 'auto' : p.cycles}`,
    '[sblaster]',
    `sbtype=${p.sound === 'sb16' ? 'sb16' : p.sound === 'adlib' ? 'none' : 'none'}`,
    '[gus]',
    `gus=${p.sound === 'gus' ? 'true' : 'false'}`,
    '[speaker]',
    'pcspeaker=true',
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

export default function DosGames({ win, props }) {
  const os = useOS();
  fs.useFS();
  const vd = useVirtualDrives();

  const [system, setSystem] = useState('dosbox');
  const [filterSys, setFilterSys] = useState('all');
  const [dosEngine, setDosEngine] = useState('auto');
  const [bootFloppy, setBootFloppy] = useState(false);
  const [sel, setSel] = useState('');
  const [status, setStatus] = useState('Simulator ready. Load your own local ROM/disk, mount a PC folder, or add a web link.');
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

  const host = useRef();
  const emuRef = useRef(null);
  const blobUrls = useRef([]);

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

  const mine = fs.children('games').filter((n) => n.type === 'file' && ALL_EXTS.includes(fs.ext(n.name)));
  const biosFiles = fs.children('bios').filter((n) => n.type === 'file');
  const saveFiles = fs.children('saves').filter((n) => n.type === 'file');

  // Flatten mounted zero-copy PC folders
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

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.jsdosError) {
        setStatus(e.data.jsdosError);
        os.msg({ icon: 'error', title: 'Retro Emulator', text: e.data.jsdosError });
      } else if (e.data?.emuReady) {
        setStatus((prev) => (prev.startsWith('Starting') ? 'Simulator running.' : prev));
      }
    };
    window.addEventListener('message', onMsg);
    return () => {
      window.removeEventListener('message', onMsg);
      cleanupBlobs();
    };
  }, []); // eslint-disable-line

  const launchJsDos = async (title, opts) => {
    await stop();
    setStatus(`Starting ${title} (DOSBox / js-dos)...`);
    try {
      window.__jsdosCfg = {
        autoStart: true,
        autoSave: true,
        kiosk: false,
        ...opts,
        onEvent: (ev) => {
          if (ev === 'ci-ready') setStatus(`Running (DOSBox): ${title}`);
        },
      };
      const f = document.createElement('iframe');
      f.title = 'DOSBox Simulator';
      f.allow = 'autoplay; fullscreen; gamepad; clipboard-write';
      f.allowFullscreen = true;
      f.style.cssText = 'width:100%;height:100%;border:0;background:#000;display:block';
      const err = "parent.postMessage({jsdosError:'Could not load js-dos core from CDN. Check your Internet connection and try again.'},'*')";
      f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${JSDOS_CSS}" onerror="${err}"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#d{width:100%;height:100%}</style></head><body><div id="d"></div><script src="${JSDOS_JS}" onerror="${err}"><\/script><script>addEventListener('load',function(){try{window.__dos=Dos(document.getElementById('d'),parent.__jsdosCfg||{})}catch(e){parent.postMessage({jsdosError:'DOSBox could not start: '+e.message},'*')}})<\/script></body></html>`;
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
      os.msg({ icon: 'error', title: 'Retro Simulator', text: 'Simulator could not start: ' + e.message });
    }
  };

  const launchEmulatorJS = async (title, coreId, gameUrl, sysLabel, biosNode = null) => {
    await stop();
    setStatus(`Starting ${title} (${sysLabel})${biosNode ? ` + BIOS (${biosNode.name})` : ''}...`);
    try {
      const f = document.createElement('iframe');
      f.title = `${sysLabel} Simulator`;
      f.allow = 'autoplay; fullscreen; gamepad; clipboard-write';
      f.allowFullscreen = true;
      f.style.cssText = 'width:100%;height:100%;border:0;background:#000;display:block';
      const err = "parent.postMessage({jsdosError:'Could not load EmulatorJS core from CDN. Check your Internet connection and try again.'},'*')";
      const cfg = {
        core: coreId,
        url: gameUrl,
        name: title,
        data: EJS_DATA,
      };
      if (biosNode) cfg.biosUrl = regBlobUrl(fs.toBlob(biosNode));
      const cfgJson = JSON.stringify(cfg);
      f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body,#game{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style></head><body><div id="game"></div><script>
var cfg = ${cfgJson};
window.EJS_player = '#game';
window.EJS_core = cfg.core;
window.EJS_gameUrl = cfg.url;
window.EJS_gameName = cfg.name;
window.EJS_pathtodata = cfg.data;
if (cfg.biosUrl) window.EJS_biosUrl = cfg.biosUrl;
window.EJS_startOnLoaded = true;
window.EJS_color = '#000080';
window.EJS_onGameStart = function(){ parent.postMessage({emuReady:true}, '*'); };
<\/script><script src="${EJS_LOADER}" onerror="${err}"><\/script></body></html>`;
      host.current.appendChild(f);
      emuRef.current = {
        kind: 'ejs',
        frame: f,
        save: async () => {
          os.msg({ icon: 'info', title: 'Save State', text: 'Use the Save / Load State icons inside the emulator bottom toolbar, or open Simulator > BIOS & Save States Manager to store .sav/.state files in C:\\Saves.' });
          return true;
        },
        fullscreen: () => f.requestFullscreen(),
      };
      setRunning(`${title} [${sysLabel}]`);
    } catch (e) {
      setStatus('Error: ' + e.message);
      os.msg({ icon: 'error', title: 'Retro Simulator', text: 'Simulator could not start: ' + e.message });
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
    const u = regBlobUrl(new Blob([bundle], { type: 'application/zip' }));
    launchJsDos(title, { url: u });
  };

  const launchBlob = async (blob, name, sysOverride = null, profKeyOverride = '') => {
    const ext = fs.ext(name);
    const targetSys = sysOverride || detectSystemFromExt(name, system);
    const pKey = profKeyOverride || 'file:' + name;
    const prof = (!isUnsafeKey(pKey) && profiles[pKey]) || DEFAULT_PROFILE;
    setSystem(targetSys);
    setStatus(`Preparing ${name}...`);

    const biosNode = resolveBiosForSystem(targetSys);

    if (targetSys !== 'dosbox') {
      const sysDef = SYSTEMS.find((s) => s.id === targetSys);
      const u = regBlobUrl(blob);
      await launchEmulatorJS(name, sysDef.core, u, sysDef.label, biosNode);
      return;
    }

    if (ext === 'jsdos') {
      await launchJsDos(name, { url: regBlobUrl(blob) });
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
        await launchEmulatorJS(name, 'dosbox_pure', regBlobUrl(blob), 'DOSBox-Pure', biosNode);
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
      await launchJsDos(name, { url: regBlobUrl(new Blob([bundle], { type: 'application/zip' })) });
      return;
    }

    if (['iso', 'cue', 'bin'].includes(ext)) {
      mountCdromD({ name, size: blob.size, readBlob: async () => blob });
      const tooBigForZip = blob.size > 120 * 1024 * 1024;
      if (dosEngine === 'pure' || (dosEngine === 'auto' && (tooBigForZip || !pairedFloppy))) {
        await launchEmulatorJS(name, 'dosbox_pure', regBlobUrl(blob), 'DOSBox-Pure CD', biosNode);
        return;
      }
      if (tooBigForZip) {
        await launchEmulatorJS(name, 'dosbox_pure', regBlobUrl(blob), 'DOSBox-Pure CD', biosNode);
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
      await launchJsDos(name, { url: regBlobUrl(new Blob([bundle], { type: 'application/zip' })) });
      return;
    }

    if (ext === 'zip') {
      if (dosEngine === 'pure') {
        await launchEmulatorJS(name, 'dosbox_pure', regBlobUrl(blob), 'DOSBox-Pure', biosNode);
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
        await launchJsDos(name, { url: regBlobUrl(blob) });
        return;
      }
      const exes = names.filter((n) => /\.(exe|com|bat)$/i.test(n) && !n.startsWith('__MACOSX'));
      if (!exes.length) {
        await launchEmulatorJS(name, 'dosbox_pure', regBlobUrl(blob), 'DOSBox-Pure', biosNode);
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
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { blob: await res.blob(), ctype: (res.headers.get('content-type') || '').toLowerCase(), filename: null };
    } catch {
      setStatus(`Fetching via proxy: ${label}...`);
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

  const play = async (id = sel) => {
    setPick(null);
    if (!id) {
      await openLocalFile();
      return;
    }
    if (id.startsWith('fs:')) {
      const n = fs.get(id.slice(3));
      if (n) await launchBlob(fs.toBlob(n), n.name, detectSystemFromExt(n.name, system), 'file:' + n.name);
    } else if (id.startsWith('sess:')) {
      const item = sessionItems.find((x) => 'sess:' + x.id === id);
      if (item) await launchBlob(item.blob, item.name, item.system, 'file:' + item.name);
    } else if (id.startsWith('pc:')) {
      const fi = folderItems.find((x) => x.key === id);
      if (fi) {
        const f = await fi.entry.getFile();
        await launchBlob(f, fi.name, fi.system, 'file:' + fi.name);
      }
    } else if (id.startsWith('lnk:')) {
      const link = savedLinks.find((x) => 'lnk:' + x.id === id);
      if (link) {
        setSystem(link.system || 'dosbox');
        await loadFromUrl(link.url, link.mode === 'web', link.system, id);
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

  const ingestFiles = async (files) => {
    for (const f of files) {
      const ext = fs.ext(f.name);
      if (!ALL_EXTS.includes(ext)) {
        os.msg({ icon: 'warning', title: 'Retro Simulator', text: `"${f.name}" (.${ext || '?'}) is not a recognized disk/ROM/program format.` });
        continue;
      }
      const detected = detectSystemFromExt(f.name, system);
      if (f.size <= MAX_IDB_BYTES) {
        try {
          const n = await fs.importFile(f, 'games');
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

  const openLocalFile = async () => {
    const picked = await pickLocalFiles({
      accept: ALL_EXTS.map((e) => '.' + e).join(','),
      multiple: true,
    });
    if (picked?.length) await ingestFiles(picked.map((p) => p.file));
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
    await stop();
    const label = embedUrl.replace(/^https?:\/\//i, '').slice(0, 48);
    setStatus(`Loading web link: ${label}...`);
    const f = document.createElement('iframe');
    f.title = 'Web Emulator';
    f.src = embedUrl;
    f.allow = 'autoplay; fullscreen; gamepad; clipboard-write';
    f.allowFullscreen = true;
    f.referrerPolicy = 'no-referrer';
    f.style.cssText = 'width:100%;height:100%;border:0;background:#000;display:block';
    f.onload = () => setStatus(`Web Link: ${label}`);
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

    if (forceWeb || (/archive\.org\/(details|embed)\//i.test(target) && !looksLikeBinarySoftwareUrl(target))) {
      await launchWebEmulator(target);
      return;
    }

    const fetchUrl = normalizeMediaUrl(target);
    let filename = decodeURIComponent(fetchUrl.split('?')[0].split('/').pop() || 'software.zip');
    try {
      const { blob, ctype, filename: resolvedName } = await fetchBinaryWithFallback(fetchUrl, filename);
      if (ctype.includes('text/html') && !looksLikeBinarySoftwareUrl(fetchUrl)) {
        await launchWebEmulator(target);
        return;
      }
      if (resolvedName) filename = resolvedName;

      const detected = sysOverride || detectSystemFromExt(filename, system);
      if (blob.size <= MAX_IDB_BYTES) {
        try {
          const n = fs.create({ name: filename, parent: 'games', data: blob, mime: blob.type || 'application/octet-stream' });
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
      setStatus('Download failed.');
      os.msg({
        icon: 'error',
        title: 'Load from Web Failed',
        text: `Could not load "${filename}": ${e.message}\n\nTips:\n• Click "Web" to open the link inside the emulator web frame.\n• Or download the file to your PC and click "Open Local File...".`,
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
      if ((await os.msg({ icon: 'question', title: 'User Storage', text: `Move "${n.name}" from C:\\DOS Games to Recycle Bin?`, buttons: ['Yes', 'No'] })) === 'Yes') {
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

  const filteredMine = filterSys === 'all' ? mine : mine.filter((n) => detectSystemFromExt(n.name, system) === filterSys);
  const filteredSession = filterSys === 'all' ? sessionItems : sessionItems.filter((it) => it.system === filterSys);
  const filteredLinks = filterSys === 'all' ? savedLinks : savedLinks.filter((l) => l.system === filterSys);
  const filteredFolderItems = filterSys === 'all' ? folderItems : folderItems.filter((it) => it.system === filterSys);

  const activeSys = SYSTEMS.find((s) => s.id === system) || SYSTEMS[0];
  const curQueueItem = diskQueue[activeDiskIdx] || null;
  const resolvedBios = resolveBiosForSystem(system);

  return (
    <div className="app dg">
      <MenuBar menus={[
        { label: '&Simulator', items: [
          { label: '&Run Selected', disabled: !sel, onClick: () => play() },
          { label: '&Stop', disabled: !running, onClick: stop },
          { sep: true },
          { label: 'Open &Local Disk / ROM / ISO...', onClick: openLocalFile },
          { label: 'Mount Local PC &Folder (Zero-Copy)...', onClick: mountPCFolder },
          { label: '&Virtual Drive Manager (A:/C:/D:/E:)...', onClick: () => os.open('drives') },
          { sep: true },
          { label: 'Run from &URL...', onClick: () => loadFromUrl('') },
          { label: '&Save Web Link to My Storage...', onClick: () => saveWebLinkToStorage('') },
          { label: '&Export Web Links (.json)...', onClick: exportLinksJson },
          { label: '&Import Web Links (.json)...', onClick: importLinksJson },
          { sep: true },
          { label: 'C:\\&BIOS & C:\\Saves Manager...', onClick: () => setShowBiosModal(true) },
          { label: 'Attach Boot &Floppy (.img) for CD...', onClick: attachFloppyForCd },
          { label: 'Open &Disk & ZIP Inspector...', onClick: () => os.open('inspector') },
          { sep: true },
          { label: 'E&xit', onClick: () => os.close(win.id) },
        ] },
        { label: '&System', items: SYSTEMS.map((s) => ({ label: s.label, radio: true, checked: system === s.id, onClick: () => { setSystem(s.id); setFilterSys(s.id); } })) },
        { label: '&View', items: [
          { label: 'Show &Per-ROM Config Panel', checked: showCfg, onClick: () => setShowCfg((c) => !c) },
          { label: '&Full screen', onClick: fullscreen },
        ] },
        { label: '&State', items: [
          { label: '&Save State', onClick: saveState },
          { label: 'Manage C:\\&BIOS & C:\\Saves...', onClick: () => setShowBiosModal(true) },
        ] },
        { label: '&Help', items: [
          { label: '&Help Topics', onClick: () => os.open('help') },
          { label: '&About Simulators', onClick: () => os.msg({ icon: 'info', width: 420, title: 'Built-in Open-Source Simulators', text: 'Only the emulator engines run in this app — all ROMs, disks, BIOS firmware, saves, and web links stay strictly in your own local or browser storage:\n\n• DOSBox / MS-DOS & Win95 CD: js-dos v8 & DOSBox-Pure\n• Commodore Amiga: PUAE\n• Amstrad CPC: Caprice32\n• Commodore 64: VICE x64\n• ZX Spectrum: Fuse\n• Atari ST: Hatari' }) },
        ] },
      ]} />

      <div className="dg-split">
        <div className="dg-side">
          <div className="gb-title-line">Simulator Core</div>
          <select className="field" value={system} onChange={(e) => setSystem(e.target.value)} style={{ marginBottom: 4 }}>
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

          {/* #2 Multi-Disk Quick-Swap Bar */}
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

          <div className="gb-title-line">Your Storage (C:\DOS Games, PC Folders &amp; Links)</div>
          <div className="dg-tabs">
            <button type="button" className={'btn tool ' + (filterSys === 'all' ? 'pressed' : '')} onClick={() => setFilterSys('all')}>All</button>
            {SYSTEMS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={'btn tool ' + (filterSys === s.id ? 'pressed' : '')}
                onClick={() => { setFilterSys(s.id); setSystem(s.id); }}
              >
                {s.short}
              </button>
            ))}
          </div>

          <div className="field dg-list">
            {filteredMine.length === 0 && filteredLinks.length === 0 && filteredSession.length === 0 && filteredFolderItems.length === 0 && (
              <div style={{ padding: 8, color: '#606060', fontSize: 11, lineHeight: 1.4 }}>
                Your library is empty. Click <b>Open Local File...</b>, <b>Mount PC Folder...</b>, or save a web link above — all files remain in your own storage.
              </div>
            )}
            {filteredMine.length > 0 && <div className="dg-sep">C:\DOS Games (Browser Storage)</div>}
            {filteredMine.map((n) => (
              <div key={n.id} className={'fd-item ' + (sel === 'fs:' + n.id ? 'sel' : '')} onClick={() => { setSel('fs:' + n.id); setSystem(detectSystemFromExt(n.name, system)); }} onDoubleClick={() => play('fs:' + n.id)}>
                <Icon name="zip" size={16} />{n.name}
              </div>
            ))}
            {filteredFolderItems.length > 0 && <div className="dg-sep">Mounted PC Folders (Zero-Copy)</div>}
            {filteredFolderItems.map((fi) => (
              <div key={fi.key} className={'fd-item ' + (sel === fi.key ? 'sel' : '')} onClick={() => { setSel(fi.key); setSystem(fi.system); }} onDoubleClick={() => play(fi.key)}>
                <Icon name="folderOpen" size={16} />[{fi.letter}] {fi.name}
              </div>
            ))}
            {filteredLinks.length > 0 && <div className="dg-sep">Your Saved Web Links</div>}
            {filteredLinks.map((lnk) => (
              <div key={lnk.id} className={'fd-item ' + (sel === 'lnk:' + lnk.id ? 'sel' : '')} onClick={() => { setSel('lnk:' + lnk.id); setSystem(lnk.system || system); }} onDoubleClick={() => play('lnk:' + lnk.id)}>
                <Icon name="browser" size={16} />{lnk.title}
              </div>
            ))}
            {filteredSession.length > 0 && <div className="dg-sep">Mounted Images (Large / Session)</div>}
            {filteredSession.map((it) => (
              <div key={it.id} className={'fd-item ' + (sel === 'sess:' + it.id ? 'sel' : '')} onClick={() => { setSel('sess:' + it.id); setSystem(it.system); }} onDoubleClick={() => play('sess:' + it.id)}>
                <Icon name="drive" size={16} />{it.name}
              </div>
            ))}
          </div>

          <div className="dg-desc">
            {selNode ? (
              <><b>{selNode.name}</b><br />Stored locally on C:\DOS Games ({detectSystemFromExt(selNode.name, system).toUpperCase()})</>
            ) : selFolder ? (
              <><b>{selFolder.name}</b><br />Zero-Copy PC Folder ({selFolder.letter} {selFolder.folderName}) · {fmtSize(selFolder.entry.size)}</>
            ) : selLink ? (
              <><b>{selLink.title}</b><br />User Web Link · {selLink.mode === 'web' ? 'Web Frame' : 'ROM Download'}<br /><i>{selLink.url}</i></>
            ) : selSession ? (
              <><b>{selSession.name}</b><br />Mounted directly from your local PC memory</>
            ) : (
              'Zero preloaded ROMs. Only simulator cores live in this app — load your own local files, PC folders, or personal web links.'
            )}
          </div>

          {/* #2 Per-ROM Launch Profile Panel */}
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
            <button className="btn" disabled={!running} onClick={stop}>■ Stop</button>
            <button className="btn" onClick={openLocalFile}>Open File...</button>
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

          <p className="dg-note">Tip: Drop any DOS, Floppy, Win95 CD ISO, Amiga, Amstrad, C64, ZX Spectrum, or Atari ST file onto the screen.</p>
        </div>

        <div
          className={'dg-screen ' + (activeProf.aspect === 'cover' ? 'aspect-cover' : '')}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) ingestFiles([...e.dataTransfer.files]); }}
        >
          <div ref={host} className="jsdos-host" />
          {!running && (
            <div className="dg-idle">
              <Icon name="dosgames" size={64} />
              <div>{activeSys.label} simulator ready</div>
              <small>Open a file, mount a zero-copy PC folder, or paste your own ROM URL above</small>
            </div>
          )}
        </div>
      </div>

      {/* #3 User-Owned C:\BIOS & C:\Saves Manager Modal */}
      {showBiosModal && (
        <Dialog title="C:\BIOS Firmware & C:\Saves Manager" icon="system" onClose={() => setShowBiosModal(false)} width={470}>
          <div className="tabs" style={{ marginBottom: 8 }}>
            <button className={'tab ' + (biosTab === 'bios' ? 'active' : '')} onClick={() => setBiosTab('bios')}>C:\BIOS Firmware ({biosFiles.length})</button>
            <button className={'tab ' + (biosTab === 'saves' ? 'active' : '')} onClick={() => setBiosTab('saves')}>C:\Saves States ({saveFiles.length})</button>
          </div>

          {biosTab === 'bios' ? (
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 11 }}>
                Import your own firmware files (e.g., Amiga Kickstart .rom, Atari ST TOS .img). Zero firmware is bundled in the app.
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
        <span>{status}</span>
        <span>{activeSys.label}</span>
        <span>{running ? 'Running' : 'Stopped'}</span>
      </StatusBar>
    </div>
  );
}

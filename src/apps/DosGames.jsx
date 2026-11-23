import { useState, useRef, useEffect } from 'react';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import Icon from '../os/icons.jsx';
import * as fs from '../os/fs.js';
import { pickLocalFiles } from '../os/localFiles.js';

const JSDOS_JS = 'https://v8.js-dos.com/latest/js-dos.js';
const JSDOS_CSS = 'https://v8.js-dos.com/latest/js-dos.css';
const EJS_LOADER = 'https://cdn.emulatorjs.org/stable/data/loader.js';
const EJS_DATA = 'https://cdn.emulatorjs.org/stable/data/';
const USER_LINKS_KEY = 'win95.user.romLinks.v1';

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

function loadSavedLinks() {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_LINKS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((x) => x && typeof x.id === 'string' && typeof x.url === 'string' && /^https?:\/\//i.test(x.url));
  } catch {
    return [];
  }
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

export default function DosGames({ win, props }) {
  const os = useOS();
  fs.useFS();

  const [system, setSystem] = useState('dosbox');
  const [filterSys, setFilterSys] = useState('all');
  const [dosEngine, setDosEngine] = useState('auto');
  const [bootFloppy, setBootFloppy] = useState(false);
  const [sel, setSel] = useState('');
  const [status, setStatus] = useState('Simulator ready. Load your own local ROM/disk file or add a web link.');
  const [running, setRunning] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [pairedFloppy, setPairedFloppy] = useState(null);
  const [sessionItems, setSessionItems] = useState([]);
  const [savedLinks, setSavedLinks] = useState(loadSavedLinks);
  const [pick, setPick] = useState(null);

  const host = useRef();
  const emuRef = useRef(null);
  const blobUrls = useRef([]);

  useEffect(() => {
    try {
      localStorage.setItem(USER_LINKS_KEY, JSON.stringify(savedLinks));
    } catch { /* ignore */ }
  }, [savedLinks]);

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

  const launchEmulatorJS = async (title, coreId, gameUrl, sysLabel) => {
    await stop();
    setStatus(`Starting ${title} (${sysLabel})...`);
    try {
      const f = document.createElement('iframe');
      f.title = `${sysLabel} Simulator`;
      f.allow = 'autoplay; fullscreen; gamepad; clipboard-write';
      f.allowFullscreen = true;
      f.style.cssText = 'width:100%;height:100%;border:0;background:#000;display:block';
      const err = "parent.postMessage({jsdosError:'Could not load EmulatorJS core from CDN. Check your Internet connection and try again.'},'*')";
      const cfgJson = JSON.stringify({
        core: coreId,
        url: gameUrl,
        name: title,
        data: EJS_DATA,
      });
      f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body,#game{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style></head><body><div id="game"></div><script>
var cfg = ${cfgJson};
window.EJS_player = '#game';
window.EJS_core = cfg.core;
window.EJS_gameUrl = cfg.url;
window.EJS_gameName = cfg.name;
window.EJS_pathtodata = cfg.data;
window.EJS_startOnLoaded = true;
window.EJS_color = '#000080';
window.EJS_onGameStart = function(){ parent.postMessage({emuReady:true}, '*'); };
<\/script><script src="${EJS_LOADER}" onerror="${err}"><\/script></body></html>`;
      host.current.appendChild(f);
      emuRef.current = {
        kind: 'ejs',
        frame: f,
        save: async () => {
          os.msg({ icon: 'info', title: 'Save State', text: 'Use the Save / Load State icons inside the emulator bottom toolbar to store and restore snapshots in your browser.' });
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

  const runDosExeFromZip = (title, files, exe) => {
    const i = exe.lastIndexOf('/');
    const dir = i >= 0 ? exe.slice(0, i).replace(/\//g, '\\') : '';
    const prog = exe.slice(i + 1);
    const conf = [
      '[sdl]', 'autolock=false',
      '[cpu]', 'cycles=max',
      '[autoexec]', '@echo off', 'mount c .', 'c:',
      dir ? `cd ${dir}` : '',
      /\.bat$/i.test(prog) ? `call ${prog}` : prog,
    ].filter(Boolean).join('\n') + '\n';
    const bundle = zipSync({ ...files, '.jsdos/dosbox.conf': strToU8(conf) }, { level: 0 });
    setPick(null);
    const u = regBlobUrl(new Blob([bundle], { type: 'application/zip' }));
    launchJsDos(title, { url: u });
  };

  const launchBlob = async (blob, name, sysOverride = null) => {
    const ext = fs.ext(name);
    const targetSys = sysOverride || detectSystemFromExt(name, system);
    setSystem(targetSys);
    setStatus(`Preparing ${name}...`);

    if (targetSys !== 'dosbox') {
      const sysDef = SYSTEMS.find((s) => s.id === targetSys);
      const u = regBlobUrl(blob);
      await launchEmulatorJS(name, sysDef.core, u, sysDef.label);
      return;
    }

    if (ext === 'jsdos') {
      await launchJsDos(name, { url: regBlobUrl(blob) });
      return;
    }

    if (['exe', 'com', 'bat'].includes(ext)) {
      const u8 = new Uint8Array(await blob.arrayBuffer());
      runDosExeFromZip(name, { [name]: u8 }, name);
      return;
    }

    if (['img', 'ima', 'vfd'].includes(ext)) {
      if (dosEngine === 'pure') {
        await launchEmulatorJS(name, 'dosbox_pure', regBlobUrl(blob), 'DOSBox-Pure');
        return;
      }
      const u8 = new Uint8Array(await blob.arrayBuffer());
      const confLines = [
        '[sdl]', 'autolock=false',
        '[cpu]', 'cycles=max',
        '[autoexec]', '@echo off',
        'imgmount a disk.img -t floppy',
        bootFloppy ? 'boot -l a' : 'echo Floppy mounted on A:\\ (type BOOT -L A to boot, or DIR to list files)',
        bootFloppy ? '' : 'a:',
        bootFloppy ? '' : 'dir',
      ].filter(Boolean);
      const bundle = zipSync({ 'disk.img': u8, '.jsdos/dosbox.conf': strToU8(confLines.join('\n') + '\n') }, { level: 0 });
      await launchJsDos(name, { url: regBlobUrl(new Blob([bundle], { type: 'application/zip' })) });
      return;
    }

    if (['iso', 'cue', 'bin'].includes(ext)) {
      const tooBigForZip = blob.size > 120 * 1024 * 1024;
      if (dosEngine === 'pure' || (dosEngine === 'auto' && (tooBigForZip || !pairedFloppy))) {
        await launchEmulatorJS(name, 'dosbox_pure', regBlobUrl(blob), 'DOSBox-Pure CD');
        return;
      }
      if (tooBigForZip) {
        await launchEmulatorJS(name, 'dosbox_pure', regBlobUrl(blob), 'DOSBox-Pure CD');
        return;
      }
      const files = { 'cdrom.iso': new Uint8Array(await blob.arrayBuffer()) };
      const autoexec = ['@echo off', `imgmount d cdrom.iso -t iso`];
      if (pairedFloppy) {
        files['boot.img'] = new Uint8Array(await pairedFloppy.file.arrayBuffer());
        autoexec.push('imgmount a boot.img -t floppy');
        if (bootFloppy) autoexec.push('boot -l a');
        else autoexec.push('echo Boot Floppy on A:\\ and CD-ROM on D:\\', 'd:', 'dir');
      } else {
        autoexec.push('echo CD-ROM mounted on D:\\', 'd:', 'dir');
      }
      const conf = ['[sdl]', 'autolock=false', '[cpu]', 'cycles=max', '[autoexec]', ...autoexec].join('\n') + '\n';
      files['.jsdos/dosbox.conf'] = strToU8(conf);
      const bundle = zipSync(files, { level: 0 });
      await launchJsDos(name, { url: regBlobUrl(new Blob([bundle], { type: 'application/zip' })) });
      return;
    }

    if (ext === 'zip') {
      if (dosEngine === 'pure') {
        await launchEmulatorJS(name, 'dosbox_pure', regBlobUrl(blob), 'DOSBox-Pure');
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
        await launchEmulatorJS(name, 'dosbox_pure', regBlobUrl(blob), 'DOSBox-Pure');
        return;
      }
      const score = (n) => (/(setup|install|config|uninst|readme|help|catalog)/i.test(n) ? 100 : 0) + (/\.bat$/i.test(n) ? 0 : 5) + n.split('/').length;
      exes.sort((a, b) => score(a) - score(b));
      if (exes.length === 1) runDosExeFromZip(name, files, exes[0]);
      else {
        setPick({ title: name, files, list: exes, choice: exes[0] });
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
      if (n) await launchBlob(fs.toBlob(n), n.name, detectSystemFromExt(n.name, system));
    } else if (id.startsWith('sess:')) {
      const item = sessionItems.find((x) => 'sess:' + x.id === id);
      if (item) await launchBlob(item.blob, item.name, item.system);
    } else if (id.startsWith('lnk:')) {
      const link = savedLinks.find((x) => 'lnk:' + x.id === id);
      if (link) {
        setSystem(link.system || 'dosbox');
        await loadFromUrl(link.url, link.mode === 'web', link.system);
      }
    }
  };

  useEffect(() => {
    if (props.fileId && fs.get(props.fileId)) {
      const n = fs.get(props.fileId);
      const detected = detectSystemFromExt(n.name, system);
      setSystem(detected);
      setSel('fs:' + props.fileId);
      launchBlob(fs.toBlob(n), n.name, detected);
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
          await launchBlob(f, n.name, detected);
        } catch {
          const sid = 's' + Date.now() + Math.random().toString(36).slice(2, 6);
          setSessionItems((prev) => [...prev, { id: sid, name: f.name, blob: f, system: detected }]);
          setSel('sess:' + sid);
          await launchBlob(f, f.name, detected);
        }
      } else {
        const sid = 's' + Date.now() + Math.random().toString(36).slice(2, 6);
        setSessionItems((prev) => [...prev, { id: sid, name: f.name, blob: f, system: detected }]);
        setSel('sess:' + sid);
        await launchBlob(f, f.name, detected);
      }
    }
  };

  const openLocalFile = async () => {
    const picked = await pickLocalFiles({
      accept: ALL_EXTS.map((e) => '.' + e).join(','),
      multiple: true,
    });
    if (picked?.length) await ingestFiles(picked.map((p) => p.file));
  };

  const attachFloppyForCd = async () => {
    const picked = await pickLocalFiles({ accept: '.img,.ima,.vfd' });
    if (picked) {
      setPairedFloppy({ name: picked.name, file: picked.file });
      setStatus(`Paired boot floppy: ${picked.name}`);
    }
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

  const loadFromUrl = async (rawAddress = urlInput, forceWeb = false, sysOverride = null) => {
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
          await launchBlob(blob, n.name, detected);
          return;
        } catch { /* fall through to session memory */ }
      }
      const sid = 's' + Date.now();
      setSessionItems((prev) => [...prev, { id: sid, name: filename, blob, system: detected }]);
      setSel('sess:' + sid);
      await launchBlob(blob, filename, detected);
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

  const filteredMine = filterSys === 'all' ? mine : mine.filter((n) => detectSystemFromExt(n.name, system) === filterSys);
  const filteredSession = filterSys === 'all' ? sessionItems : sessionItems.filter((it) => it.system === filterSys);
  const filteredLinks = filterSys === 'all' ? savedLinks : savedLinks.filter((l) => l.system === filterSys);

  const activeSys = SYSTEMS.find((s) => s.id === system) || SYSTEMS[0];
  const selNode = sel.startsWith('fs:') ? fs.get(sel.slice(3)) : null;
  const selLink = sel.startsWith('lnk:') ? savedLinks.find((x) => 'lnk:' + x.id === sel) : null;
  const selSession = sel.startsWith('sess:') ? sessionItems.find((x) => 'sess:' + x.id === sel) : null;

  return (
    <div className="app dg">
      <MenuBar menus={[
        { label: '&Simulator', items: [
          { label: '&Run Selected', disabled: !sel, onClick: () => play() },
          { label: '&Stop', disabled: !running, onClick: stop },
          { sep: true },
          { label: 'Open &Local Disk / ROM / ISO...', onClick: openLocalFile },
          { label: 'Run from &URL...', onClick: () => loadFromUrl('') },
          { label: '&Save Web Link to My Storage...', onClick: () => saveWebLinkToStorage('') },
          { label: 'Attach Boot &Floppy (.img) for CD...', onClick: attachFloppyForCd },
          { sep: true },
          { label: 'Open &Disk & ZIP Inspector...', onClick: () => os.open('inspector') },
          { sep: true },
          { label: 'E&xit', onClick: () => os.close(win.id) },
        ] },
        { label: '&System', items: SYSTEMS.map((s) => ({ label: s.label, radio: true, checked: system === s.id, onClick: () => { setSystem(s.id); setFilterSys(s.id); } })) },
        { label: '&View', items: [{ label: '&Full screen', onClick: fullscreen }] },
        { label: '&State', items: [{ label: '&Save State', onClick: saveState }] },
        { label: '&Help', items: [
          { label: '&Help Topics', onClick: () => os.open('help') },
          { label: '&About Simulators', onClick: () => os.msg({ icon: 'info', width: 420, title: 'Built-in Open-Source Simulators', text: 'Only the emulator engines run in this app — all ROMs, disks, ISOs, and web links stay strictly in your own local or browser storage:\n\n• DOSBox / MS-DOS & Win95 CD: js-dos v8 & DOSBox-Pure\n• Commodore Amiga: PUAE\n• Amstrad CPC: Caprice32\n• Commodore 64: VICE x64\n• ZX Spectrum: Fuse\n• Atari ST: Hatari' }) },
        ] },
      ]} />

      <div className="dg-split">
        <div className="dg-side">
          <div className="gb-title-line">Simulator Core</div>
          <select className="field" value={system} onChange={(e) => setSystem(e.target.value)} style={{ marginBottom: 4 }}>
            {SYSTEMS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div style={{ fontSize: 10, color: '#404040', marginBottom: 4 }}>{activeSys.hint}</div>

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

          <div className="gb-title-line">Your Web Link (ROM URL or Web Page)</div>
          <form onSubmit={(e) => { e.preventDefault(); loadFromUrl(urlInput, false); }} style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
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

          <div className="gb-title-line">Your Storage (C:\DOS Games &amp; Saved Links)</div>
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
            {filteredMine.length === 0 && filteredLinks.length === 0 && filteredSession.length === 0 && (
              <div style={{ padding: 8, color: '#606060', fontSize: 11, lineHeight: 1.4 }}>
                Your library is empty. Click <b>Open Local File...</b>, drop a ROM/disk onto the screen, or save a web link above — all files remain in your own storage.
              </div>
            )}
            {filteredMine.length > 0 && <div className="dg-sep">C:\DOS Games (Browser Storage)</div>}
            {filteredMine.map((n) => (
              <div key={n.id} className={'fd-item ' + (sel === 'fs:' + n.id ? 'sel' : '')} onClick={() => { setSel('fs:' + n.id); setSystem(detectSystemFromExt(n.name, system)); }} onDoubleClick={() => play('fs:' + n.id)}>
                <Icon name="zip" size={16} />{n.name}
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
            ) : selLink ? (
              <><b>{selLink.title}</b><br />User Web Link · {selLink.mode === 'web' ? 'Web Frame' : 'ROM Download'}<br /><i>{selLink.url}</i></>
            ) : selSession ? (
              <><b>{selSession.name}</b><br />Mounted directly from your local PC memory</>
            ) : (
              'Zero preloaded ROMs. Only simulator cores live in this app — load your own local files or personal web links.'
            )}
          </div>

          <div className="btn-row" style={{ marginTop: 6, justifyContent: 'flex-start', gap: 5 }}>
            <button className="btn default" disabled={!sel} onClick={() => play()}>▶ Run</button>
            <button className="btn" disabled={!running} onClick={stop}>■ Stop</button>
            <button className="btn" onClick={openLocalFile}>Open Local File...</button>
            <button className="btn" onClick={() => os.open('inspector')}>Disk Tool...</button>
            <button className="btn" disabled={!sel} onClick={removeSel}>Remove</button>
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
                <button className="btn default" onClick={() => runDosExeFromZip(pick.title, pick.files, pick.choice)}>Run</button>
                <button className="btn" onClick={() => setPick(null)}>Cancel</button>
              </div>
            </div>
          )}

          <p className="dg-note">Tip: Drop any DOS, Floppy, Win95 CD ISO, Amiga, Amstrad, C64, ZX Spectrum, or Atari ST file from your PC onto the screen.</p>
        </div>

        <div className="dg-screen" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) ingestFiles([...e.dataTransfer.files]); }}>
          <div ref={host} className="jsdos-host" />
          {!running && (
            <div className="dg-idle">
              <Icon name="dosgames" size={64} />
              <div>{activeSys.label} simulator ready</div>
              <small>Open a file from your PC, create a floppy in Disk Tool, or paste your own ROM URL above</small>
            </div>
          )}
        </div>
      </div>

      <StatusBar>
        <span>{status}</span>
        <span>{activeSys.label}</span>
        <span>{running ? 'Running' : 'Stopped'}</span>
      </StatusBar>
    </div>
  );
}

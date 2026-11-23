import { useState, useRef, useEffect } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import Icon from '../os/icons.jsx';
import * as fs from '../os/fs.js';
import { audioCtx } from '../os/sound.js';
import { pickLocalFiles, saveLocalFile } from '../os/localFiles.js';
import { pickLocalDirectory } from '../utils/localFolder.js';
import { mountRemovableFolder } from '../utils/virtualDrives.js';

const EXTS = ['wav', 'mp3', 'ogg', 'm4a', 'flac', 'aac', 'mp4', 'webm', 'mov', 'ogv', 'mkv'];
const VIDEO = ['mp4', 'webm', 'mov', 'ogv', 'mkv'];
const MEDIA_TYPES = [{ description: 'Audio & Video', accept: { 'audio/*': ['.wav', '.mp3', '.ogg', '.m4a', '.flac', '.aac'], 'video/*': ['.mp4', '.webm', '.mov', '.ogv', '.mkv'] } }];
const PLAYLIST_KEY = 'win95-mp-playlist';
const EQ_FREQS = [60, 230, 910, 3600, 14000];
const EQ_TYPES = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];
const fmt = (t) => (isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '0:00');

export default function MediaPlayer({ win, props }) {
  const os = useOS();
  fs.useFS();
  const [list, setList] = useState([]);
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [showList, setShowList] = useState(true);
  const [winampSkin, setWinampSkin] = useState(false);
  const [showEq, setShowEq] = useState(false);
  const [eqGains, setEqGains] = useState([0, 0, 0, 0, 0]);
  const [eqPreset, setEqPreset] = useState('Flat');
  const [tools, setTools] = useState(null); // lazy-loaded ../utils/mediaTools.js

  const v = useRef(), canvas = useRef(), analyser = useRef(), filters = useRef([]), raf = useRef(), urls = useRef([]);
  const cur = list[idx];

  const loadTools = async () => {
    if (tools) return tools;
    const mod = await import('../utils/mediaTools.js');
    setTools(mod);
    return mod;
  };

  useEffect(() => {
    if (showEq && !tools) loadTools();
  }, [showEq]); // eslint-disable-line

  const addFsNode = (n, autoPlay = true) => {
    const url = fs.blobUrl(n); urls.current.push(url);
    const item = { id: n.id + ':' + urls.current.length, fsId: n.id, name: n.name, url, video: VIDEO.includes(fs.ext(n.name)) };
    setList((l) => { if (autoPlay) setIdx(l.length); return [...l, item]; });
  };

  const addLocalFiles = (items, autoPlay = true) => {
    if (!items?.length) return;
    setList((l) => {
      const added = items.map((entry, k) => {
        const f = entry.file || entry;
        const url = URL.createObjectURL(f);
        urls.current.push(url);
        return {
          id: 'pc:' + urls.current.length + ':' + k,
          fsId: null,
          file: f,
          name: entry.name || f.name,
          url,
          video: f.type?.startsWith('video/') || VIDEO.includes(fs.ext(entry.name || f.name)),
        };
      });
      if (autoPlay) setIdx(l.length);
      return [...l, ...added];
    });
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PLAYLIST_KEY) || '[]');
      if (Array.isArray(saved) && saved.length) {
        const restored = [];
        for (const id of saved) {
          const n = fs.get(id);
          if (n && !n.trashed) {
            const url = fs.blobUrl(n);
            urls.current.push(url);
            restored.push({ id: n.id + ':' + urls.current.length, fsId: n.id, name: n.name, url, video: VIDEO.includes(fs.ext(n.name)) });
          }
        }
        if (restored.length) {
          setList(restored);
          if (!props.fileId) setIdx(0);
        }
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line

  useEffect(() => {
    try {
      const ids = list.map((x) => x.fsId).filter(Boolean);
      localStorage.setItem(PLAYLIST_KEY, JSON.stringify(ids));
    } catch { /* ignore */ }
  }, [list]);

  useEffect(() => {
    if (props.fileId) {
      const n = fs.get(props.fileId);
      if (n) addFsNode(n, true);
    } else if (props.localFile) {
      addLocalFiles([props.localFile], true);
    }
  }, [win.nonce]); // eslint-disable-line

  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); cancelAnimationFrame(raf.current); }, []);
  useEffect(() => { os.setTitle(win.id, cur ? `${cur.name} - ${winampSkin ? 'Winamp 95' : 'Media Player'}` : (winampSkin ? 'Winamp 95 Skin' : 'Media Player')); }, [cur, win.id, os, winampSkin]);
  useEffect(() => { if (v.current) { v.current.volume = vol; v.current.muted = muted; } }, [vol, muted, cur]);

  const wire = () => {
    if (analyser.current || !v.current) return;
    try {
      const c = audioCtx(); if (!c) return;
      const src = c.createMediaElementSource(v.current);
      const nodes = EQ_FREQS.map((freq, i) => {
        const b = c.createBiquadFilter();
        b.type = EQ_TYPES[i];
        b.frequency.value = freq;
        b.Q.value = 1.1;
        b.gain.value = eqGains[i] || 0;
        return b;
      });
      for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
      const an = c.createAnalyser();
      an.fftSize = 64;
      src.connect(nodes[0]);
      nodes[nodes.length - 1].connect(an);
      an.connect(c.destination);
      filters.current = nodes;
      analyser.current = an;
    } catch { /* already wired or unsupported */ }
  };

  useEffect(() => {
    const c = audioCtx();
    filters.current.forEach((node, i) => {
      try {
        if (c) node.gain.setTargetAtTime(eqGains[i] || 0, c.currentTime, 0.02);
        else node.gain.value = eqGains[i] || 0;
      } catch { /* ignore */ }
    });
  }, [eqGains]);

  const draw = () => {
    const cv = canvas.current, an = analyser.current;
    if (cv) {
      const g = cv.getContext('2d'), w = cv.width, h = cv.height;
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      if (an) {
        const d = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(d);
        const bw = w / d.length;
        d.forEach((val, i) => {
          const bh = (val / 255) * h;
          g.fillStyle = winampSkin
            ? (val > 190 ? '#ff3333' : val > 120 ? '#ffff33' : '#00ff66')
            : `hsl(${120 - (val / 255) * 120},100%,50%)`;
          g.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
        });
      }
    }
    raf.current = requestAnimationFrame(draw);
  };
  useEffect(() => { raf.current = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf.current); }, [winampSkin]); // eslint-disable-line

  const toggle = () => {
    const el = v.current; if (!el || !cur) return openFile();
    wire(); audioCtx();
    if (el.paused) el.play().catch((e) => os.msg({ icon: 'error', title: 'Media Player', text: 'Cannot play this file: ' + e.message })); else el.pause();
  };
  const stop = () => { const el = v.current; if (el) { el.pause(); el.currentTime = 0; setTime(0); } };
  const go = (i) => { if (i >= 0 && i < list.length) setIdx(i); };

  const openFile = async () => {
    const n = await os.fileDialog({ mode: 'open', exts: EXTS, title: 'Open Media (Drive C:)', start: 'media' });
    if (n) addFsNode(n, true);
  };

  const openFromPC = async () => {
    const picked = await pickLocalFiles({
      accept: 'audio/*,video/*,.wav,.mp3,.ogg,.m4a,.flac,.aac,.mp4,.webm,.mov,.ogv,.mkv',
      types: MEDIA_TYPES,
      multiple: true,
    });
    if (picked?.length) addLocalFiles(picked, true);
  };

  const mountMediaFolder = async () => {
    const res = await pickLocalDirectory({ acceptExts: EXTS });
    if (!res) return;
    if (!res.entries.length) {
      os.msg({ icon: 'info', title: 'Media Folder', text: `No supported audio or video files found inside "${res.name}".` });
      return;
    }
    const drive = mountRemovableFolder(res);
    setList((l) => {
      const added = res.entries.map((en, k) => ({
        id: `zc:${drive.id}:${k}:${en.name}`,
        fsId: null,
        getFile: en.getFile,
        name: en.name,
        driveLabel: drive.letter,
        url: null,
        video: VIDEO.includes(en.ext),
      }));
      setIdx(l.length);
      return [...l, ...added];
    });
  };

  const importM3uText = async (rawText) => {
    const mod = await loadTools();
    const entries = mod.parseM3u(rawText);
    if (!entries.length) {
      os.msg({ icon: 'warning', title: 'Import M3U', text: 'No playable entries found inside this M3U playlist.' });
      return;
    }
    const added = [];
    let skipped = 0;
    for (const ent of entries) {
      if (ent.isUrl) {
        added.push({
          id: 'url:' + Date.now() + ':' + added.length,
          fsId: null,
          remoteUrl: ent.source,
          name: ent.title,
          url: ent.source,
          video: VIDEO.includes(fs.ext(ent.source)),
        });
      } else {
        const node = fs.resolve(ent.source) || fs.search(ent.source.split(/[\\/]/).pop() || '')[0];
        if (node && node.type === 'file') {
          const url = fs.blobUrl(node); urls.current.push(url);
          added.push({ id: node.id + ':' + urls.current.length, fsId: node.id, name: ent.title || node.name, url, video: VIDEO.includes(fs.ext(node.name)) });
        } else {
          skipped++;
        }
      }
    }
    if (added.length) {
      setList((l) => {
        if (idx < 0) setIdx(l.length);
        return [...l, ...added];
      });
    }
    os.msg({
      icon: added.length ? 'info' : 'warning',
      title: 'M3U Playlist Imported',
      text: `Added ${added.length} track(s) to playlist.` + (skipped ? `\n${skipped} local reference(s) were not found on Drive C:.` : ''),
    });
  };

  const importM3uFromPC = async () => {
    const picked = await pickLocalFiles({
      accept: '.m3u,.m3u8,audio/x-mpegurl',
      types: [{ description: 'M3U Playlists', accept: { 'audio/x-mpegurl': ['.m3u', '.m3u8'] } }],
    });
    if (picked?.file) await importM3uText(await picked.file.text());
  };

  const exportM3u = async (target = 'pc') => {
    if (!list.length) return os.msg({ icon: 'info', title: 'Export M3U', text: 'Add at least one track to the playlist first.' });
    const mod = await loadTools();
    const m3uText = mod.buildM3u(list, (fsId) => fs.pathOf(fsId));
    if (target === 'c') {
      const name = await os.prompt({ title: 'Save M3U to C:\\', label: 'Playlist filename:', value: 'Playlist.m3u' });
      if (!name) return;
      const finalName = /\.m3u8?$/i.test(name) ? name : `${name}.m3u`;
      fs.create({ name: finalName, parent: 'media', data: m3uText, mime: 'audio/x-mpegurl' });
      os.msg({ icon: 'info', title: 'Export M3U', text: `Saved "${finalName}" to C:\\Windows\\Media.` });
    } else {
      await saveLocalFile({
        blob: new Blob([m3uText], { type: 'audio/x-mpegurl;charset=utf-8' }),
        suggestedName: 'Win95-Playlist.m3u',
        description: 'M3U Playlist',
        ext: '.m3u',
      });
    }
  };

  const saveCurrentToMediaFolder = async () => {
    if (!cur?.file) return;
    try {
      const n = await fs.importFile(cur.file, 'media');
      setList((l) => l.map((it) => (it.id === cur.id ? { ...it, fsId: n.id, name: n.name } : it)));
      os.msg({ icon: 'info', title: 'Media Player', text: `Saved "${n.name}" to C:\\Windows\\Media for offline replay.` });
    } catch (e) {
      os.msg({ icon: 'error', title: 'Media Player', text: e.message });
    }
  };

  useEffect(() => {
    if (!cur) return;
    let cancelled = false;
    (async () => {
      if (!cur.url && cur.getFile) {
        try {
          const f = await cur.getFile();
          if (cancelled) return;
          const u = URL.createObjectURL(f);
          urls.current.push(u);
          setList((l) => l.map((it) => (it.id === cur.id ? { ...it, file: f, url: u, video: f.type?.startsWith('video/') || VIDEO.includes(fs.ext(it.name)) } : it)));
        } catch (e) {
          if (!cancelled) os.msg({ icon: 'error', title: 'Media Player', text: `Could not open "${cur.name}": ${e.message}` });
        }
        return;
      }
      if (cur.url && v.current) {
        wire();
        v.current.load();
        v.current.play().catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [cur?.id, cur?.url]); // eslint-disable-line

  const ended = () => { if (loop && list.length === 1) { v.current.currentTime = 0; v.current.play(); } else if (idx < list.length - 1) setIdx(idx + 1); else if (loop) setIdx(0); else setPlaying(false); };
  const fullscreen = () => { try { v.current.requestFullscreen(); } catch { os.msg({ icon: 'info', text: 'Full screen is not available.' }); } };
  const sounds = fs.children('media').filter((n) => n.type === 'file');

  const onDropMedia = async (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    const m3u = files.find((f) => /\.(m3u|m3u8)$/i.test(f.name));
    if (m3u) {
      e.preventDefault();
      await importM3uText(await m3u.text());
      return;
    }
    const mediaFiles = files.filter((f) => EXTS.includes(fs.ext(f.name)) || f.type.startsWith('audio/') || f.type.startsWith('video/'));
    if (!mediaFiles.length) return;
    e.preventDefault();
    addLocalFiles(mediaFiles, true);
  };

  const menus = [
    { label: '&File', items: [
      { label: '&Open (Drive C:)...', onClick: openFile },
      { label: 'Open from &Local PC...', onClick: openFromPC },
      { label: 'Mount PC Media &Folder (Zero-Copy)...', onClick: mountMediaFolder },
      { label: '&Save Current Track to C:\\Media', disabled: !cur?.file || !!cur?.fsId, onClick: saveCurrentToMediaFolder },
      { sep: true },
      { label: '&Import M3U Playlist...', onClick: importM3uFromPC },
      { label: '&Export M3U to PC...', disabled: !list.length, onClick: () => exportM3u('pc') },
      { label: 'Export M3U to C:\\&Media...', disabled: !list.length, onClick: () => exportM3u('c') },
      { label: '&Clear Playlist', disabled: !list.length, onClick: () => { stop(); setList([]); setIdx(-1); } },
      { sep: true },
      { label: 'E&xit', onClick: () => os.close(win.id) },
    ] },
    { label: '&View', items: [
      { label: '&Winamp Compact Skin', checked: winampSkin, onClick: () => setWinampSkin((w) => !w) },
      { label: '5-Band &Equalizer', checked: showEq, onClick: () => setShowEq((x) => !x) },
      { label: '&Playlist', checked: showList, onClick: () => setShowList(!showList) },
      { sep: true },
      { label: '&Full Screen (video)', disabled: !cur?.video, onClick: fullscreen },
    ] },
    { label: '&Play', items: [{ label: '&Play/Pause', onClick: toggle }, { label: '&Stop', onClick: stop }, { label: '&Repeat', checked: loop, onClick: () => setLoop(!loop) }, { label: '&Mute', checked: muted, onClick: () => setMuted(!muted) }] },
    { label: '&Sounds', items: sounds.length ? sounds.map((n) => ({ label: n.name, onClick: () => addFsNode(n, true) })) : [{ label: '(none)', disabled: true }] },
    { label: '&Help', items: [{ label: '&Help Topics', onClick: () => os.open('help') }] },
  ];

  const bands = tools?.EQ_BANDS || EQ_FREQS.map((hz) => ({ hz, label: hz >= 1000 ? (hz / 1000).toFixed(1) + 'k' : String(hz) }));
  const presets = tools?.EQ_PRESETS || { Flat: [0, 0, 0, 0, 0] };

  return (
    <div className={'app mp ' + (winampSkin ? 'mp-winamp' : '')} onDragOver={(e) => e.preventDefault()} onDrop={onDropMedia}>
      <MenuBar menus={menus} />

      <div className={winampSkin ? 'wa-deck' : 'mp-classic'}>
        <div className={winampSkin ? 'wa-lcd' : 'mp-screen'}>
          {winampSkin && (
            <div className="wa-lcd-row">
              <span className="wa-timer">{fmt(time)}</span>
              <div className="wa-meta">
                <div className="wa-title">{cur ? cur.name : 'WINAMP 95 READY — DROP AUDIO OR M3U'}</div>
                <div className="wa-sub">{playing ? 'PLAYING' : 'STOPPED'} · {fmt(dur)} · 44kHz</div>
              </div>
            </div>
          )}
          <video ref={v} className={winampSkin ? 'wa-video' : 'mp-video'} style={{ display: cur?.video ? 'block' : 'none' }} src={cur?.url} playsInline
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(e) => setTime(e.target.currentTime)}
            onLoadedMetadata={(e) => setDur(e.target.duration)} onEnded={ended}
            onError={() => cur && os.msg({ icon: 'error', title: 'Media Player', text: `Cannot play "${cur.name}". The file may be damaged or use a format your browser does not support.` })} />
          {!cur?.video && <canvas ref={canvas} width={winampSkin ? 320 : 400} height={winampSkin ? 44 : 120} className={winampSkin ? 'wa-vis' : 'mp-vis'} />}
          {!winampSkin && !cur && <div className="mp-hint">Drop audio, video, or .M3U here, or click PC Open...</div>}
        </div>

        <div className={winampSkin ? 'wa-controls' : 'mp-controls'}>
          <input type="range" className="mp-seek" min="0" max={dur || 0} step="0.1" value={time} disabled={!cur} onChange={(e) => { v.current.currentTime = +e.target.value; setTime(+e.target.value); }} />
          {winampSkin ? (
            <div className="wa-bar">
              <button className="wa-btn" onClick={() => go(idx - 1)} disabled={idx <= 0} title="Previous">|◀</button>
              <button className="wa-btn" onClick={toggle} title="Play/Pause">{playing ? '||' : '▶'}</button>
              <button className="wa-btn" onClick={stop} disabled={!cur} title="Stop">■</button>
              <button className="wa-btn" onClick={() => go(idx + 1)} disabled={idx >= list.length - 1} title="Next">▶|</button>
              <button className="wa-btn" onClick={openFromPC} title="Open Local Files">Eject</button>
              <input type="range" min="0" max="1" step="0.05" value={vol} onChange={(e) => { setVol(+e.target.value); setMuted(false); }} style={{ width: 58 }} title="Volume" />
              <button className={'wa-btn ' + (loop ? 'on' : '')} onClick={() => setLoop(!loop)} title="Repeat">REP</button>
              <button className={'wa-btn ' + (showEq ? 'on' : '')} onClick={() => setShowEq((x) => !x)} title="5-Band Equalizer">EQ</button>
              <button className={'wa-btn ' + (showList ? 'on' : '')} onClick={() => setShowList((x) => !x)} title="Playlist">PL</button>
              <button className="wa-btn" onClick={() => setWinampSkin(false)} title="Switch to Windows 95 skin">W95</button>
            </div>
          ) : (
            <div className="mp-row">
              <button className="btn tool" onClick={() => go(idx - 1)} disabled={idx <= 0} title="Previous">|◀</button>
              <button className="btn tool" onClick={toggle} title="Play/Pause" style={{ minWidth: 40 }}>{playing ? '||' : '▶'}</button>
              <button className="btn tool" onClick={stop} disabled={!cur} title="Stop">■</button>
              <button className="btn tool" onClick={() => go(idx + 1)} disabled={idx >= list.length - 1} title="Next">▶|</button>
              <button className={'btn tool ' + (loop ? 'pressed' : '')} onClick={() => setLoop(!loop)} title="Repeat">↻</button>
              <button className="btn tool" onClick={openFromPC} title="Open audio or video from your computer">PC Open...</button>
              <button className={'btn tool ' + (showEq ? 'pressed' : '')} onClick={() => setShowEq((x) => !x)} title="5-Band Equalizer">EQ</button>
              <button className="btn tool" onClick={() => setWinampSkin(true)} title="Switch to Compact Winamp Skin">Winamp</button>
              <span className="mp-time" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(time)} / {fmt(dur)}</span>
              <button className={'btn tool ' + (muted ? 'pressed' : '')} onClick={() => setMuted(!muted)} title="Mute"><Icon name={muted ? 'speakerMute' : 'speaker'} size={14} /></button>
              <input type="range" min="0" max="1" step="0.05" value={vol} onChange={(e) => { setVol(+e.target.value); setMuted(false); }} style={{ width: 56 }} title="Volume" />
              {cur?.video && <button className="btn tool" onClick={fullscreen} title="Full screen">[ ]</button>}
            </div>
          )}
        </div>
      </div>

      {showEq && (
        <div className="mp-eq sunken">
          <div className="mp-eq-head">
            <b>Equalizer (5-Band)</b>
            <select
              className="field"
              value={eqPreset}
              onChange={(e) => {
                const name = e.target.value;
                setEqPreset(name);
                if (presets[name]) setEqGains([...presets[name]]);
              }}
            >
              {Object.keys(presets).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <button className="btn tool" onClick={() => { setEqPreset('Flat'); setEqGains([0, 0, 0, 0, 0]); }}>Reset</button>
          </div>
          <div className="mp-eq-bands">
            {bands.map((b, i) => (
              <label key={b.hz} className="mp-eq-band">
                <span>{eqGains[i] > 0 ? `+${eqGains[i]}` : eqGains[i]}</span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="1"
                  value={eqGains[i]}
                  onChange={(e) => {
                    const next = [...eqGains];
                    next[i] = +e.target.value;
                    setEqGains(next);
                  }}
                />
                <small>{b.label}</small>
              </label>
            ))}
          </div>
        </div>
      )}

      {showList && (
        <div className="field mp-list">
          {list.length === 0 && <div style={{ padding: 6, color: winampSkin ? '#00c050' : '#808080' }}>Playlist is empty. Drop media/.M3U files or use File &gt; Import M3U Playlist.</div>}
          {list.map((it, i) => (
            <div key={it.id} className={'fd-item ' + (i === idx ? 'sel' : '')} onDoubleClick={() => setIdx(i)} onClick={() => setIdx(i)}>
              <Icon name={it.video ? 'video' : 'audio'} size={16} />
              <span style={{ flex: 1 }}>{it.name}</span>
              <span style={{ color: i === idx ? '#fff' : (winampSkin ? '#00b048' : '#808080'), fontSize: 10 }}>
                {it.fsId ? 'C:\\' : it.remoteUrl ? 'Stream' : it.driveLabel || 'Local PC'}
              </span>
            </div>
          ))}
        </div>
      )}
      <StatusBar><span>{cur ? `${playing ? 'Playing' : 'Paused'}: ${cur.name}` : 'Ready'}</span><span>{list.length} item(s)</span></StatusBar>
    </div>
  );
}

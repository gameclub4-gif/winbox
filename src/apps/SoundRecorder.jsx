import { useState, useRef, useEffect } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import * as fs from '../os/fs.js';
import { audioCtx } from '../os/sound.js';
import { saveLocalFile, pickLocalFiles } from '../os/localFiles.js';

function encodeWavBlob(samples, sampleRate) {
  const dv = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const wr = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  wr(0, 'RIFF');
  dv.setUint32(4, 36 + samples.length * 2, true);
  wr(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  wr(36, 'data');
  dv.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const cl = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(44 + i * 2, cl < 0 ? cl * 32768 : cl * 32767, true);
  }
  return new Blob([dv], { type: 'audio/wav' });
}

export default function SoundRecorder({ win }) {
  const os = useOS();
  const [samples, setSamples] = useState(null); // Float32Array
  const [rate, setRate] = useState(44100);
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [posSec, setPosSec] = useState(0);
  const [status, setStatus] = useState('Ready — click ● to record microphone, or File > Generate Retro Chime.');
  const canvasRef = useRef();
  const recRef = useRef(null);
  const playRef = useRef(null);
  const rafRef = useRef(null);

  const durSec = samples ? samples.length / rate : 0;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const g = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#005000';
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();

    if (samples && samples.length) {
      g.strokeStyle = '#00ff66';
      g.beginPath();
      const step = Math.max(1, Math.floor(samples.length / w));
      for (let x = 0; x < w; x++) {
        const idx = Math.min(samples.length - 1, Math.floor((x / w) * samples.length));
        let max = 0;
        for (let k = 0; k < step && idx + k < samples.length; k += Math.max(1, Math.floor(step / 8))) {
          const v = samples[idx + k];
          if (Math.abs(v) > Math.abs(max)) max = v;
        }
        const y = h / 2 - max * (h * 0.44);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();

      if (durSec > 0) {
        const px = Math.min(w - 1, Math.max(0, (posSec / durSec) * w));
        g.strokeStyle = '#ff3333';
        g.beginPath();
        g.moveTo(px, 0);
        g.lineTo(px, h);
        g.stroke();
      }
    }
  }, [samples, posSec, durSec]);

  useEffect(() => () => {
    if (recRef.current) recRef.current.stop();
    if (playRef.current) playRef.current.stop();
    cancelAnimationFrame(rafRef.current);
  }, []);

  const stopAll = () => {
    if (recRef.current) {
      recRef.current.stop();
      recRef.current = null;
    }
    if (playRef.current) {
      playRef.current.stop();
      playRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    setRecording(false);
    setPlaying(false);
  };

  const startRec = async () => {
    stopAll();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = audioCtx();
      if (!ctx) throw new Error('AudioContext unavailable');
      if (ctx.state === 'suspended') await ctx.resume();

      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const chunks = [];
      let total = 0;

      proc.onaudioprocess = (ev) => {
        const ch = ev.inputBuffer.getChannelData(0);
        const copy = new Float32Array(ch.length);
        copy.set(ch);
        chunks.push(copy);
        total += ch.length;
        setPosSec(total / ctx.sampleRate);
      };

      src.connect(proc);
      proc.connect(ctx.destination);
      setRecording(true);
      setRate(ctx.sampleRate);
      setStatus('Recording microphone...');

      recRef.current = {
        stop: () => {
          try { proc.disconnect(); src.disconnect(); } catch { /* ignore */ }
          stream.getTracks().forEach((t) => t.stop());
          const out = new Float32Array(total);
          let off = 0;
          for (const c of chunks) {
            out.set(c, off);
            off += c.length;
          }
          setSamples(out);
          setPosSec(0);
          setRecording(false);
          setStatus(`Recorded ${(total / ctx.sampleRate).toFixed(2)}s WAV audio.`);
        },
      };
    } catch (e) {
      os.msg({
        icon: 'warning',
        title: 'Sound Recorder',
        text: `Microphone recording is unavailable: ${e.message}\n\nYou can also use File > Open WAV... or File > Generate Retro Chime.`,
      });
    }
  };

  const startPlay = async () => {
    if (!samples || !samples.length) return;
    stopAll();
    const ctx = audioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') await ctx.resume();

    const buf = ctx.createBuffer(1, samples.length, rate);
    buf.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    const startOffset = Math.min(posSec, Math.max(0, durSec - 0.01));
    const startedAt = ctx.currentTime;
    src.start(0, startOffset);
    setPlaying(true);
    setStatus('Playing...');

    const tick = () => {
      const cur = startOffset + (ctx.currentTime - startedAt);
      if (cur >= durSec) {
        setPosSec(0);
        setPlaying(false);
        setStatus('Stopped.');
        return;
      }
      setPosSec(cur);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    src.onended = () => {
      cancelAnimationFrame(rafRef.current);
      setPlaying(false);
    };
    playRef.current = {
      stop: () => {
        try { src.stop(); } catch { /* ignore */ }
      },
    };
  };

  const generateChime = () => {
    stopAll();
    const r = 22050;
    const total = Math.floor(r * 1.4);
    const out = new Float32Array(total);
    const notes = [{ f: 523.25, t: 0, d: 0.3 }, { f: 659.25, t: 0.14, d: 0.3 }, { f: 783.99, t: 0.28, d: 0.3 }, { f: 1046.5, t: 0.42, d: 0.9 }];
    for (const n of notes) {
      const s = Math.floor(n.t * r), len = Math.floor(n.d * r);
      for (let i = 0; i < len && s + i < total; i++) {
        const env = Math.min(1, i / 180) * Math.pow(1 - i / len, 1.5);
        out[s + i] += Math.sin((2 * Math.PI * n.f * i) / r) * env * 0.35;
      }
    }
    setRate(r);
    setSamples(out);
    setPosSec(0);
    setStatus('Generated retro Win95 synth chime (1.40s).');
  };

  const applyEffect = (kind) => {
    if (!samples?.length) return;
    stopAll();
    if (kind === 'reverse') {
      const next = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) next[i] = samples[samples.length - 1 - i];
      setSamples(next);
      setStatus('Applied Reverse effect.');
    } else if (kind === 'echo') {
      const delay = Math.floor(rate * 0.18);
      const next = new Float32Array(samples.length + delay);
      next.set(samples);
      for (let i = 0; i < samples.length; i++) {
        next[i + delay] = Math.max(-1, Math.min(1, next[i + delay] + samples[i] * 0.45));
      }
      setSamples(next);
      setStatus('Applied Echo effect.');
    } else if (kind === 'fast') {
      const next = new Float32Array(Math.floor(samples.length / 2));
      for (let i = 0; i < next.length; i++) next[i] = samples[i * 2];
      setSamples(next);
      setStatus('Doubled speed (200%).');
    } else if (kind === 'slow') {
      const next = new Float32Array(samples.length * 2);
      for (let i = 0; i < next.length; i++) next[i] = samples[Math.floor(i / 2)];
      setSamples(next);
      setStatus('Halved speed (50%).');
    }
    setPosSec(0);
  };

  const saveToC = async () => {
    if (!samples?.length) return;
    const name = await os.prompt({ title: 'Save WAV to C:\\Windows\\Media', label: 'Filename:', value: 'Recording.wav' });
    if (!name) return;
    const finalName = /\.wav$/i.test(name) ? name : `${name}.wav`;
    const blob = encodeWavBlob(samples, rate);
    fs.create({ name: finalName, parent: 'media', data: blob, mime: 'audio/wav' });
    setStatus(`Saved ${finalName} to C:\\Windows\\Media.`);
  };

  const saveToPC = async () => {
    if (!samples?.length) return;
    const blob = encodeWavBlob(samples, rate);
    await saveLocalFile({ blob, suggestedName: 'Sound.wav', description: 'WAV Audio File', ext: '.wav' });
    setStatus('Saved Sound.wav to local PC.');
  };

  const openWavFromPC = async () => {
    const picked = await pickLocalFiles({ accept: 'audio/*,.wav,.mp3,.ogg' });
    if (!picked?.file) return;
    try {
      const ctx = audioCtx();
      const buf = await ctx.decodeAudioData(await picked.file.arrayBuffer());
      const ch = buf.getChannelData(0);
      setRate(buf.sampleRate);
      setSamples(new Float32Array(ch));
      setPosSec(0);
      setStatus(`Loaded ${picked.name} (${buf.duration.toFixed(2)}s).`);
    } catch (e) {
      os.msg({ icon: 'error', title: 'Sound Recorder', text: 'Could not decode audio file: ' + e.message });
    }
  };

  return (
    <div className="app sr">
      <MenuBar menus={[
        { label: '&File', items: [
          { label: '&New', onClick: () => { stopAll(); setSamples(null); setPosSec(0); setStatus('New recording ready.'); } },
          { label: '&Open Audio from PC...', onClick: openWavFromPC },
          { label: '&Generate Retro Chime', onClick: generateChime },
          { sep: true },
          { label: '&Save to C:\\Windows\\Media...', disabled: !samples?.length, onClick: saveToC },
          { label: 'Save .WAV to &Local PC...', disabled: !samples?.length, onClick: saveToPC },
          { sep: true },
          { label: 'E&xit', onClick: () => os.close(win.id) },
        ] },
        { label: 'E&ffects', items: [
          { label: 'Add &Echo', disabled: !samples?.length, onClick: () => applyEffect('echo') },
          { label: '&Reverse', disabled: !samples?.length, onClick: () => applyEffect('reverse') },
          { label: '&Increase Speed (2x)', disabled: !samples?.length, onClick: () => applyEffect('fast') },
          { label: '&Decrease Speed (0.5x)', disabled: !samples?.length, onClick: () => applyEffect('slow') },
        ] },
        { label: '&Help', items: [{ label: '&Help Topics', onClick: () => os.open('help') }] },
      ]} />

      <div className="sr-body">
        <div className="sr-readout">
          <div className="sr-box sunken">
            <small>Position:</small>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{posSec.toFixed(2)}s</b>
          </div>
          <canvas ref={canvasRef} width="220" height="52" className="sunken sr-wave" />
          <div className="sr-box sunken">
            <small>Length:</small>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>{durSec.toFixed(2)}s</b>
          </div>
        </div>

        <input
          type="range"
          min="0"
          max={durSec || 1}
          step="0.01"
          value={posSec}
          disabled={!samples?.length || recording}
          onChange={(e) => setPosSec(+e.target.value)}
          style={{ width: '100%', margin: '6px 0' }}
        />

        <div className="sr-controls">
          <button className="btn" disabled={!samples?.length || recording} onClick={() => setPosSec(0)} title="Seek to start">|◀</button>
          <button className="btn default" disabled={!samples?.length || playing || recording} onClick={startPlay} title="Play">▶</button>
          <button className="btn" disabled={!playing && !recording} onClick={stopAll} title="Stop">■</button>
          <button className="btn" disabled={!samples?.length || recording} onClick={() => setPosSec(durSec)} title="Seek to end">▶|</button>
          <button className={'btn ' + (recording ? 'pressed' : '')} onClick={recording ? stopAll : startRec} title="Record microphone" style={{ color: '#c00000', fontWeight: 'bold' }}>
            {recording ? '● REC' : '●'}
          </button>
          <button className="btn" onClick={generateChime} title="Generate synth chime">Chime</button>
        </div>
      </div>

      <StatusBar>
        <span>{status}</span>
        <span>{(rate / 1000).toFixed(1)}kHz WAV</span>
      </StatusBar>
    </div>
  );
}

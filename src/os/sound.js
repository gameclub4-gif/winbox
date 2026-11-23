import { getSettings } from './settings.js';

let ctx = null;
function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
export const audioCtx = ac;
function note(c, f, t, d, type = 'sine', v = 0.2) {
  const o = c.createOscillator(), g = c.createGain();
  const vol = v * getSettings().sounds.volume;
  o.type = type; o.frequency.value = f;
  const t0 = c.currentTime + t;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(Math.max(vol, 0.0002), t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + d + 0.05);
}
const S = {
  startup: (c) => { [[262, 0], [330, 0.15], [392, 0.3], [523, 0.5], [659, 0.7]].forEach(([f, t]) => note(c, f, t, 1.4, 'triangle', 0.18)); [[196, 0.5], [262, 0.7]].forEach(([f, t]) => note(c, f, t, 1.6, 'sine', 0.15)); },
  shutdown: (c) => { [[659, 0], [523, 0.25], [392, 0.5], [262, 0.75]].forEach(([f, t]) => note(c, f, t, 1.1, 'triangle', 0.18)); },
  ding: (c) => { note(c, 1320, 0, 0.5, 'sine', 0.25); note(c, 1760, 0.02, 0.4, 'sine', 0.1); },
  error: (c) => { note(c, 220, 0, 0.18, 'square', 0.12); note(c, 165, 0.16, 0.35, 'square', 0.12); },
  exclaim: (c) => { note(c, 880, 0, 0.15, 'triangle', 0.2); note(c, 660, 0.12, 0.3, 'triangle', 0.2); },
  open: (c) => { note(c, 600, 0, 0.08, 'triangle', 0.1); note(c, 900, 0.06, 0.1, 'triangle', 0.1); },
  minimize: (c) => { note(c, 700, 0, 0.07, 'triangle', 0.08); note(c, 450, 0.05, 0.09, 'triangle', 0.08); },
  click: (c) => note(c, 300, 0, 0.03, 'square', 0.05),
  win: (c) => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => note(c, f, i * 0.12, 0.4, 'triangle', 0.2)); },
  lose: (c) => { [392, 349, 330, 262].forEach((f, i) => note(c, f, i * 0.2, 0.45, 'sawtooth', 0.1)); },
};
export const SOUND_EVENTS = [
  { id: 'startup', label: 'Start Windows' }, { id: 'shutdown', label: 'Exit Windows' }, { id: 'ding', label: 'Default Sound' },
  { id: 'error', label: 'Critical Stop' }, { id: 'exclaim', label: 'Exclamation' }, { id: 'open', label: 'Open Program' }, { id: 'minimize', label: 'Minimize' },
];
export function play(name, force = false) {
  const s = getSettings().sounds;
  if (!force && (!s.enabled || (name === 'startup' && !s.startup))) return;
  try { const c = ac(); if (c && S[name]) S[name](c); } catch (e) { /* audio unavailable */ }
}

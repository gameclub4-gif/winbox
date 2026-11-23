import { useSyncExternalStore } from 'react';

const KEY = 'win95.smart.settings.v1';
export const BLISS = 'https://assets.codepen.io/15664/bliss.webp';

export const THEMES = {
  win95: { name: 'Windows 95', desktop: '#008080', titleA: '#000080', titleB: '#1084d0', inA: '#808080', inB: '#b5b5b5', face: '#c0c0c0', text: '#000000', hl: '#000080', hlText: '#ffffff', wallpaper: 'none' },
  bliss: { name: 'Bliss (Hills)', desktop: '#3a6ea5', titleA: '#0a246a', titleB: '#a6caf0', inA: '#808080', inB: '#b5b5b5', face: '#c0c0c0', text: '#000000', hl: '#0a246a', hlText: '#ffffff', wallpaper: 'bliss' },
  rose: { name: 'Rose', desktop: '#c08080', titleA: '#7f003f', titleB: '#d870a0', inA: '#808080', inB: '#b5b5b5', face: '#c0c0c0', text: '#000000', hl: '#7f003f', hlText: '#ffffff', wallpaper: 'none' },
  desert: { name: 'Desert', desktop: '#c8a064', titleA: '#804000', titleB: '#d0a060', inA: '#808080', inB: '#b5b5b5', face: '#d4c8a8', text: '#000000', hl: '#804000', hlText: '#ffffff', wallpaper: 'none' },
  slate: { name: 'Slate', desktop: '#3c5870', titleA: '#102a40', titleB: '#4a7aa0', inA: '#808080', inB: '#b5b5b5', face: '#b8c0c8', text: '#000000', hl: '#102a40', hlText: '#ffffff', wallpaper: 'pattern:grid' },
  hotdog: { name: 'Hot Dog Stand', desktop: '#ffff00', titleA: '#000000', titleB: '#000000', inA: '#808080', inB: '#808080', face: '#ff0000', text: '#ffffff', hl: '#000000', hlText: '#ffffff', wallpaper: 'none' },
  contrast: { name: 'High Contrast Black', desktop: '#000000', titleA: '#000080', titleB: '#000080', inA: '#404040', inB: '#404040', face: '#000000', text: '#ffffff', hl: '#800080', hlText: '#ffffff', wallpaper: 'none' },
};

export const PATTERNS = {
  grid: { name: '(Grid)', css: 'linear-gradient(rgba(255,255,255,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.12) 1px,transparent 1px)', size: '16px 16px' },
  checker: { name: '(Checkers)', css: 'conic-gradient(rgba(0,0,0,.12) 25%,transparent 0 50%,rgba(0,0,0,.12) 0 75%,transparent 0)', size: '16px 16px' },
  diagonal: { name: '(Diagonal)', css: 'repeating-linear-gradient(45deg,rgba(255,255,255,.14) 0 2px,transparent 2px 8px)', size: 'auto' },
  dots: { name: '(Dots)', css: 'radial-gradient(rgba(255,255,255,.28) 1.5px,transparent 2px)', size: '12px 12px' },
};

const defaults = {
  theme: 'win95',
  desktop: null, // custom desktop colour override
  wallpaper: 'none', // none | bliss | pattern:<id> | fs:<nodeId>
  wallpaperMode: 'stretch', // center | tile | stretch
  dragFull: true,
  sounds: { enabled: true, startup: true, volume: 0.6 },
  iconPos: {},
  bookmarks: null,
};

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) return { ...defaults, ...s, sounds: { ...defaults.sounds, ...(s.sounds || {}) } };
  } catch (e) { /* ignore */ }
  return { ...defaults };
}
let state = load();
const subs = new Set();
export const getSettings = () => state;
export function setSettings(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
  subs.forEach((f) => f());
}
export const useSettings = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
export function applyTheme(id) {
  const t = THEMES[id]; if (!t) return;
  setSettings({ theme: id, desktop: null, wallpaper: t.wallpaper, wallpaperMode: 'stretch' });
}
export function themeVars(s) {
  const t = THEMES[s.theme] || THEMES.win95;
  return {
    '--desktop': s.desktop || t.desktop, '--title-a': t.titleA, '--title-b': t.titleB, '--in-a': t.inA, '--in-b': t.inB,
    '--face': t.face, '--text': t.text, '--hl': t.hl, '--hl-text': t.hlText,
  };
}

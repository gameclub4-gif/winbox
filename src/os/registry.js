import { lazy } from 'react';

// Every program is lazy-loaded the first time it is launched.
const def = (title, icon, w, h, load, extra = {}) => ({ title, icon, w, h, Comp: lazy(load), ...extra });

export const APPS = {
  explorer: def('Exploring - C:\\', 'explorer', 640, 420, () => import('../apps/Explorer.jsx'), { minW: 320, minH: 220 }),
  notepad: def('Untitled - Notepad', 'notepad', 520, 380, () => import('../apps/Notepad.jsx'), { minW: 240, minH: 160 }),
  wordpad: def('Document - WordPad', 'wordpad', 720, 520, () => import('../apps/WordPad.jsx'), { minW: 360, minH: 260 }),
  word95: def('Document - Microsoft Word', 'word95', 790, 560, () => import('../apps/WordPad.jsx'), { minW: 380, minH: 260, defaultProps: { skinMode: 'word95' } }),
  calc: def('Calculator', 'calc', 260, 262, () => import('../apps/Calculator.jsx'), { minW: 240, minH: 240 }),
  paint: def('untitled - Paint', 'paint', 720, 520, () => import('../apps/Paint.jsx'), { minW: 380, minH: 300 }),
  acrobat: def('Adobe Acrobat Reader 5.0', 'acrobat', 860, 580, () => import('../apps/AcrobatReader.jsx'), { minW: 480, minH: 360 }),
  browser: def('Internet Browser', 'browser', 760, 520, () => import('../apps/Browser.jsx'), { minW: 320, minH: 240 }),
  media: def('Media Player', 'media', 420, 380, () => import('../apps/MediaPlayer.jsx'), { minW: 320, minH: 260 }),
  dos: def('MS-DOS Prompt', 'dos', 640, 400, () => import('../apps/DosPrompt.jsx'), { minW: 300, minH: 180 }),
  control: def('Control Panel', 'control', 560, 400, () => import('../apps/ControlPanel.jsx'), { minW: 340, minH: 260 }),
  recycle: def('Recycle Bin', 'recycle', 560, 360, () => import('../apps/RecycleBin.jsx'), { single: true, minW: 320, minH: 200 }),
  dosgames: def('DOSBox & Retro Computers', 'dosgames', 900, 595, () => import('../apps/DosGames.jsx'), { single: true, minW: 400, minH: 340 }),
  inspector: def('Disk & ZIP Inspector', 'zip', 660, 480, () => import('../apps/DiskInspector.jsx'), { single: true, minW: 420, minH: 340 }),
  drives: def('Virtual Drive Manager', 'drive', 640, 480, () => import('../apps/DriveManager.jsx'), { single: true, minW: 420, minH: 320 }),
  sndrec: def('Sound Recorder', 'sound', 390, 255, () => import('../apps/SoundRecorder.jsx'), { single: true, minW: 320, minH: 220 }),
  sysmon: def('System Resource Monitor', 'system', 560, 440, () => import('../apps/ResourceMonitor.jsx'), { single: true, minW: 380, minH: 300 }),
  help: def('Windows Help', 'help', 560, 400, () => import('../apps/Help.jsx'), { single: true, minW: 320, minH: 220 }),
  solitaire: def('Solitaire', 'solitaire', 700, 520, () => import('../apps/Solitaire.jsx'), { minW: 560, minH: 420 }),
  minesweeper: def('Minesweeper', 'minesweeper', 200, 290, () => import('../apps/Minesweeper.jsx'), { resizable: false }),
  freecell: def('FreeCell', 'freecell', 700, 520, () => import('../apps/FreeCell.jsx'), { minW: 560, minH: 420 }),
  hearts: def('Hearts', 'hearts', 720, 540, () => import('../apps/Hearts.jsx'), { minW: 560, minH: 460 }),
  tetris: def('Tetris', 'tetris', 420, 520, () => import('../apps/Tetris.jsx'), { minW: 340, minH: 460 }),
  snake: def('Snake', 'snake', 420, 500, () => import('../apps/Snake.jsx'), { minW: 320, minH: 400 }),
};

// Command-line / Run aliases
export const ALIASES = {
  notepad: 'notepad', wordpad: 'wordpad', write: 'wordpad', word95: 'word95', winword: 'word95', word: 'word95', calc: 'calc', calculator: 'calc', mspaint: 'paint', paint: 'paint', explorer: 'explorer', control: 'control',
  acrobat: 'acrobat', acrord32: 'acrobat', acroread: 'acrobat', pdf: 'acrobat',
  mplayer: 'media', mplayer2: 'media', wmplayer: 'media', command: 'dos', cmd: 'dos', dos: 'dos', iexplore: 'browser', browser: 'browser',
  ie: 'browser', sol: 'solitaire', solitaire: 'solitaire', winmine: 'minesweeper', minesweeper: 'minesweeper', freecell: 'freecell',
  mshearts: 'hearts', hearts: 'hearts', tetris: 'tetris', snake: 'snake', dosbox: 'dosgames', dosgames: 'dosgames', amiga: 'dosgames', retro: 'dosgames', atarist: 'dosgames', c64: 'dosgames', nes: 'dosgames', snes: 'dosgames', fbneo: 'dosgames', arcade: 'dosgames', mac68k: 'dosgames',
  inspector: 'inspector', winzip: 'inspector', disktool: 'inspector', floppy: 'inspector',
  drives: 'drives', drivemgr: 'drives', sndrec: 'sndrec', sndrec32: 'sndrec', recorder: 'sndrec', sysmon: 'sysmon', taskmgr: 'sysmon', monitor: 'sysmon',
  winhelp: 'help', help: 'help',
};

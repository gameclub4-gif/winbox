import { useState } from 'react';
import { MenuBar } from '../os/widgets.jsx';
import { useOS } from '../os/OS.jsx';

const TOPICS = [
  ['Welcome', 'Welcome to Windows 95 Smart Edition.\n\nThis desktop runs completely inside your browser. Programs are loaded the first time you start them. Your files, settings and DOS game data are stored locally in your browser - nothing is sent to a server.\n\nDouble-click an icon on the desktop (or tap it on a touch screen) to start a program.'],
  ['The desktop & taskbar', 'Drag icons to rearrange them; right-click the desktop for Arrange Icons, New and Properties.\n\nThe taskbar shows one button for each open window. Click a button to bring its window to the front, click the active one to minimize it, or right-click for Restore / Minimize / Maximize / Close.\n\nRight-click the taskbar to Cascade or Tile windows. Double-click the clock to open Date/Time.\n\nThe speaker icon mutes system sounds; the corner icon toggles full-screen.'],
  ['Windows', 'Drag a title bar to move a window and drag any edge or corner to resize it. Double-click the title bar to maximize or restore. Click the program icon at the left of the title bar for the system menu; double-click it to close.\n\nOn small screens windows open maximized so they are easy to use.'],
  ['Files and folders', 'Open My Computer or Windows Explorer to manage the virtual C: drive. You can create, rename, copy, cut, paste, drag-and-drop, delete and restore items. Deleted items go to the Recycle Bin.\n\nOpen Recycle Bin to Restore or Delete deleted items one by one, or switch to the "Cache & Temp Files" tab to clean individual temporary files, cached ROM downloads, unused wallpapers, and browser caches one by one.\n\nTo set your own local desktop background, right-click the desktop -> Properties -> Load from PC... (or drop an image onto the preview monitor).'],
  ['Notepad, WordPad, Paint & Calculator', 'Notepad & Paint can open and save files on BOTH the virtual Drive C: (IndexedDB) AND your real local PC (Ctrl+Shift+O to open from PC, Ctrl+Shift+S to save to PC, or drag-and-drop files onto the app).\n\nWordPad is a rich-text word processor supporting fonts, colors, alignment, bullets, and opening/saving both .RTF and .HTML documents locally or on Drive C:.\n\nCalculator has Standard and Scientific views (View menu) and works with the keyboard.'],
  ['Internet Browser', 'The browser shows web sites in a frame. Many large sites (Google, Facebook, YouTube...) forbid being shown inside other pages. When that happens the browser offers to open the page in your real browser instead - use the "Open externally" button (globe with arrow) at any time.\n\nBookmarks can be added with Favorites > Add to Favorites.'],
  ['Media Player', 'Play local audio or video files (MP3, WAV, OGG, MP4, WebM) from Drive C:, or click "PC Open..." / drag-and-drop files straight from your computer.\n\nFeatures:\n• M3U Import & Export (File menu or drag-and-drop .m3u/.m3u8)\n• Compact Winamp-style skin (View > Winamp Compact Skin or click Winamp button)\n• 5-Band WebAudio Equalizer with presets (Rock, Pop, Classical, Bass Boost, Win95 Warm).'],
  ['Disk & ZIP Inspector', 'Open Start > Programs > Accessories > Disk & ZIP Inspector (or right-click any .zip or .img/.ima/.vfd file in Explorer).\n\n• Inspect ZIP archives and FAT12 floppy disk images, preview text/binary files, and extract selected or all files directly to Drive C:.\n• Switch to "Create Bootable Floppy (.img)" to bundle files from Drive C: or your local PC into a standard 1.44 MB FAT12 bootable floppy image and launch it straight into DOSBox!'],
  ['Virtual PC Backup & Restore', 'Open Control Panel > System > Storage to export a complete .ZIP backup of your virtual Drive C:, custom wallpapers, Media Player playlists, bookmarks, and Windows 95 settings.\n\nUse "Restore Backup (.zip)..." at any time to restore your entire desktop setup cleanly.'],
  ['Games', 'Solitaire, Minesweeper, FreeCell, Hearts, Tetris and Snake are fully playable. See the Game menu in each for options.\n\nTetris: arrows to move/rotate, Space to drop, P to pause. Snake: arrows or WASD. Minesweeper: right-click (or long-press) to flag.'],
  ['DOSBox & Retro Computers', 'Open "DOSBox & Retro" for built-in WebAssembly simulator cores (DOSBox / Win95 CD, Commodore Amiga, Amstrad CPC, Commodore 64, ZX Spectrum, and Atari ST).\n\nNo ROMs are bundled in the app: open your own files (.jsdos, .zip, .exe, .img/.ima, .iso/.cue, .adf, .d64, .prg, .dsk, .tap, .st) from your local PC, or paste & save your own web ROM links into your browser storage.'],
  ['Keyboard shortcuts', 'Alt+F4 - close the active window\nAlt+Tab - switch windows\nCtrl+Esc - open the Start menu\nF1 - this help\nEnter / Delete / F2 / Ctrl+C / Ctrl+X / Ctrl+V - in Explorer\nCtrl+S / Ctrl+O / Ctrl+N - Save / Open C: / New in Notepad, WordPad & Paint\nCtrl+Shift+O / Ctrl+Shift+S - Open from / Save to Local PC\nCtrl+Z - Undo'],
  ['MS-DOS Prompt', 'Type HELP for a list of supported commands: DIR, CD, MD, RD, DEL, COPY, MOVE, REN, TYPE, CLS, ECHO, VER, DATE, TIME, MEM, TREE, EDIT, START and more. You can also launch programs such as NOTEPAD, WORDPAD or CALC by name.'],
];

export default function Help({ win }) {
  const os = useOS();
  const [i, setI] = useState(0);
  return (
    <div className="app">
      <MenuBar menus={[{ label: '&File', items: [{ label: 'E&xit', onClick: () => os.close(win.id) }] }, { label: '&Options', items: TOPICS.map((t, k) => ({ label: t[0], onClick: () => setI(k) })) }]} />
      <div className="help-wrap">
        <div className="field help-list">{TOPICS.map((t, k) => <div key={k} className={'fd-item ' + (k === i ? 'sel' : '')} onClick={() => setI(k)}>📖 {t[0]}</div>)}</div>
        <div className="field help-body"><h3>{TOPICS[i][0]}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{TOPICS[i][1]}</p></div>
      </div>
    </div>
  );
}

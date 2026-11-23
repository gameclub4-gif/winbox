import { useState, useRef, useEffect } from 'react';
import { useOS } from '../os/OS.jsx';
import * as fs from '../os/fs.js';
import { ALIASES } from '../os/registry.js';

const glob = (pat) => new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
const pad = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const d2 = (t) => { const d = new Date(t); return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getFullYear()).slice(2)}  ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; };
const BANNER = ['Microsoft(R) Windows 95', '   (C)Copyright Microsoft Corp 1981-1996.', ''];
const HELP = `Supported commands:
  CD [path]       Display or change the current directory
  CLS             Clear the screen
  COPY src dest   Copy files (wildcards allowed)
  DATE / TIME     Display the date / time
  DEL file        Delete files (wildcards allowed)
  DIR [path]      List files and directories
  ECHO text       Display text
  EDIT file       Open a file in Notepad
  EXIT            Close this window
  MD / RD         Make / remove a directory
  MEM             Show memory information
  MOVE src dest   Move a file or directory
  REN old new     Rename a file or directory
  SET             Show environment variables
  START program   Start a Windows program (NOTEPAD, CALC, PAINT, ...)
  TREE            Show the directory tree
  TYPE file       Display the contents of a text file
  VER / VOL       Show the version / volume label
  Program names (NOTEPAD, SOL, WINMINE, ...) and .BAT files can be run directly.`;

export default function DosPrompt({ win, active }) {
  const os = useOS();
  fs.useFS();
  const [lines, setLines] = useState(BANNER);
  const [input, setInput] = useState('');
  const cwd = useRef('win');
  const [, rerender] = useState(0);
  const hist = useRef([]), hi = useRef(0);
  const box = useRef(), inp = useRef();
  const out = useRef([]);
  out.current = lines;

  useEffect(() => { box.current.scrollTop = box.current.scrollHeight; }, [lines, input]);
  useEffect(() => { if (active) inp.current?.focus(); }, [active]);
  const print = (...s) => setLines((l) => [...l, ...s.flatMap((x) => String(x).split('\n'))]);
  const path = () => fs.pathOf(cwd.current).toUpperCase();
  const prompt = () => path().replace(/\\$/, '') + '>';
  const here = () => fs.children(cwd.current);

  const find = (p) => fs.resolve(p, cwd.current);
  const matches = (arg) => {
    // returns list of nodes matching a path possibly containing wildcards in last segment
    const i = Math.max(arg.lastIndexOf('\\'), arg.lastIndexOf('/'));
    const dirPart = i >= 0 ? arg.slice(0, i + 1) : '', name = arg.slice(i + 1);
    const dir = dirPart ? find(dirPart || '\\') : fs.get(cwd.current);
    if (!dir || dir.type !== 'folder') return null;
    if (/[*?]/.test(name)) { const r = glob(name); return fs.children(dir.id).filter((n) => r.test(n.name)); }
    const n = fs.children(dir.id).find((c) => c.name.toLowerCase() === name.toLowerCase());
    return n ? [n] : [];
  };

  async function exec(line, depth = 0) {
    const raw = line.trim();
    if (!raw) return;
    const full = /^[a-z]:[\\/]/i.test(raw) || /^\.{1,2}[\\/]/.test(raw);
    const m = (full ? raw.match(/^(\S+)\s*(.*)$/s) : raw.match(/^([^\s\\/]+)(.*)$/s)) || [];
    const cmd = (m[1] || raw).toLowerCase();
    const arg = (m[2] ?? '').trim();
    if (/^[a-z]:$/i.test(raw)) return;
    const dirs = () => fs.children(cwd.current);
    try {
      switch (cmd) {
        case 'help': case '?': print(HELP); break;
        case 'cls': setLines([]); break;
        case 'ver': print('', 'Windows 95. [Version 4.00.950]', ''); break;
        case 'vol': print(' Volume in drive C is WIN95', ' Volume Serial Number is 1995-0824'); break;
        case 'date': print(`Current date is ${new Date().toDateString()}`); break;
        case 'time': print(`Current time is ${new Date().toLocaleTimeString()}`); break;
        case 'echo': {
          const rm = arg.match(/^(.*?)\s*(>>?)\s*(\S+)\s*$/s);
          if (rm) {
            const target = find(rm[3]);
            if (target && target.type === 'file') fs.write(target.id, (rm[2] === '>>' ? (await fs.readText(target)) + '\r\n' : '') + rm[1] + (rm[2] === '>>' ? '' : ''));
            else fs.create({ name: rm[3], parent: cwd.current, data: rm[1], unique: false });
          } else print(arg || 'ECHO is on');
          break;
        }
        case 'set': print('PATH=C:\\WINDOWS;C:\\WINDOWS\\COMMAND', 'PROMPT=$p$g', 'TEMP=C:\\WINDOWS\\TEMP', 'COMSPEC=C:\\WINDOWS\\COMMAND.COM', 'windir=C:\\WINDOWS'); break;
        case 'path': print('PATH=C:\\WINDOWS;C:\\WINDOWS\\COMMAND'); break;
        case 'mem': print('', '    655360 bytes total conventional memory', '    655360 bytes available to MS-DOS', `    ${(navigator.deviceMemory || 4) * 1024} MB total memory reported by browser`, ''); break;
        case 'exit': os.close(win.id); break;
        case 'cd': case 'chdir': case 'cd..': case 'cd\\': {
          const a = cmd === 'cd..' ? '..' : cmd === 'cd\\' ? '\\' : arg;
          if (!a) { print(path()); break; }
          const n = find(a.replace(/^"|"$/g, ''));
          if (!n || n.type !== 'folder') print('Invalid directory'); else cwd.current = n.id;
          rerender((x) => x + 1); break;
        }
        case 'dir': case 'ls': {
          const a = arg.replace(/\/\w+/g, '').trim();
          let list, label = path();
          if (!a) list = dirs();
          else { const m2 = matches(a); if (m2 && m2.length === 1 && m2[0].type === 'folder' && !/[*?]/.test(a)) { list = fs.children(m2[0].id); label = fs.pathOf(m2[0].id).toUpperCase(); } else list = m2; }
          if (!list) { print('File not found'); break; }
          const o = ['', ' Volume in drive C is WIN95', ` Directory of ${label}`, ''];
          let files = 0, bytes = 0, dc = 0;
          list.forEach((n) => { if (n.type === 'folder') { dc++; o.push(`${pad(n.name.toUpperCase(), 28)}<DIR>          ${d2(n.modified)}`); } else { files++; bytes += n.size; o.push(`${pad(n.name.toUpperCase(), 28)}${String(n.size).padStart(10)}     ${d2(n.modified)}`); } });
          o.push(`     ${String(files).padStart(5)} file(s) ${String(bytes).padStart(14)} bytes`, `     ${String(dc).padStart(5)} dir(s)      1,073,741,824 bytes free`, '');
          print(o.join('\n')); break;
        }
        case 'md': case 'mkdir': if (!arg) print('Required parameter missing'); else fs.create({ name: arg.replace(/^"|"$/g, ''), parent: cwd.current, type: 'folder', unique: false }); break;
        case 'rd': case 'rmdir': {
          const n = find(arg);
          if (!n || n.type !== 'folder') print('Invalid path, not directory,\nor directory not empty');
          else if (fs.children(n.id).length) print('Invalid path, not directory,\nor directory not empty');
          else { if (n.id === cwd.current) cwd.current = n.parent; fs.remove(n.id); }
          rerender((x) => x + 1); break;
        }
        case 'del': case 'erase': {
          const list = (matches(arg) || []).filter((n) => n.type === 'file');
          if (!list.length) print('File not found'); else list.forEach((n) => fs.remove(n.id)); break;
        }
        case 'ren': case 'rename': case 'move': case 'copy': {
          const parts = arg.match(/"[^"]+"|\S+/g)?.map((s) => s.replace(/"/g, '')) || [];
          if (parts.length < 2) { print('Required parameter missing'); break; }
          const src = (matches(parts[0]) || []).filter((n) => n.type === 'file' || cmd === 'move' || cmd.startsWith('ren'));
          if (!src.length) { print('File not found - ' + parts[0].toUpperCase()); break; }
          const dest = find(parts[1]);
          if (cmd === 'ren' || cmd === 'rename') { fs.rename(src[0].id, parts[1]); print('        1 file(s) renamed'); break; }
          if (dest?.type === 'folder') { src.forEach((n) => (cmd === 'move' ? fs.move(n.id, dest.id) : fs.copy(n.id, dest.id))); print(`        ${src.length} file(s) ${cmd === 'move' ? 'moved' : 'copied'}`); break; }
          if (src.length === 1) {
            if (cmd === 'move') { fs.move(src[0].id, src[0].parent); fs.rename(src[0].id, parts[1]); }
            else { const c = fs.copy(src[0].id, src[0].parent); fs.rename(c.id, parts[1]); }
            print(`        1 file(s) ${cmd === 'move' ? 'moved' : 'copied'}`);
          } else print('Invalid destination');
          break;
        }
        case 'type': {
          const n = find(arg);
          if (!n || n.type !== 'file') print('File not found - ' + arg.toUpperCase()); else print((await fs.readText(n)).replace(/\r/g, '') || '');
          break;
        }
        case 'tree': {
          const o = ['Directory PATH listing', 'Volume serial number is 1995-0824', fs.pathOf(cwd.current).toUpperCase()];
          const walk = (id, pre) => { const k = fs.children(id).filter((c) => c.type === 'folder'); k.forEach((c, i) => { const last = i === k.length - 1; o.push(`${pre}${last ? '└───' : '├───'}${c.name.toUpperCase()}`); walk(c.id, pre + (last ? '    ' : '│   ')); }); };
          walk(cwd.current, ''); print(o.join('\n')); break;
        }
        case 'edit': { const n = arg ? find(arg) : null; if (arg && !n) fs.create({ name: arg, parent: cwd.current, data: '' }); os.open('notepad', { fileId: (n || fs.children(cwd.current).find((c) => c.name === arg))?.id }); break; }
        case 'start': case 'run': if (!os.run(arg)) print('Cannot find ' + arg); break;
        case 'format': case 'fdisk': print('Cannot run this command on a virtual drive.'); break;
        default: {
          const name = cmd.replace(/\.(exe|com)$/, '');
          const n = find(raw.split(/\s+/)[0]);
          if (ALIASES[name]) os.open(ALIASES[name]);
          else if (n && n.type === 'file' && /\.bat$/i.test(n.name) && depth < 4) { for (const ln of (await fs.readText(n)).split(/\r?\n/)) { if (/^@?echo off/i.test(ln) || /^rem/i.test(ln)) continue; await exec(ln.replace(/^@/, ''), depth + 1); } }
          else if (n && n.type === 'file' && fs.appOfExe(n)) os.open(fs.appOfExe(n));
          else if (n && n.type === 'file' && /\.(exe|com|zip|jsdos|img|ima|iso)$/i.test(n.name)) { print(`Launching ${n.name} in DOSBox emulator...`); os.open('dosgames', { fileId: n.id }); }
          else if (n && n.type === 'file') print('This file cannot be executed directly.');
          else print('Bad command or file name');
        }
      }
    } catch (e) { print(e.message); }
  }

  const submit = async () => {
    const v = input; setInput('');
    const pr = prompt();
    setLines((l) => [...l, pr + v]);
    if (v.trim()) { hist.current.push(v); hi.current = hist.current.length; }
    await exec(v);
  };
  const key = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hi.current > 0) { hi.current--; setInput(hist.current[hi.current]); } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (hi.current < hist.current.length - 1) { hi.current++; setInput(hist.current[hi.current]); } else { hi.current = hist.current.length; setInput(''); } }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const m = input.match(/^(.*?)(\S*)$/); const pre = m[1], part = m[2].toLowerCase();
      const c = here().find((n) => n.name.toLowerCase().startsWith(part));
      if (c && part) setInput(pre + c.name);
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c') { const pr = prompt(), cur = input; setLines((l) => [...l, pr + cur + '^C']); setInput(''); }
    else if (e.key === 'Escape') setInput('');
  };
  return (
    <div className="app dos" onClick={() => { if (!window.getSelection().toString()) inp.current?.focus(); }}>
      <div className="dos-screen" ref={box}>
        <pre>{lines.join('\n')}</pre>
        <div className="dos-line"><span>{prompt()}</span><input ref={inp} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={key} autoFocus spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-label="DOS command line" /></div>
      </div>
    </div>
  );
}

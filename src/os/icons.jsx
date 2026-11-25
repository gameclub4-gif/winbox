// Hand-drawn 32x32 SVG icons in Windows 95 style
const S = '#000', G = '#808080', L = '#c0c0c0', W = '#fff', Y = '#ffff80', YD = '#c0a000', B = '#000080', T = '#008080', R = '#ff0000', GR = '#008000';
const card = (x, y, rot = 0, ch = '♥', col = R) => (
  <g transform={`rotate(${rot} ${x + 8} ${y + 11})`}>
    <rect x={x} y={y} width="16" height="22" fill={W} stroke={S} />
    <text x={x + 8} y={y + 16} fontSize="12" textAnchor="middle" fill={col}>{ch}</text>
  </g>
);
const ICONS = {
  computer: <>
    <rect x="4" y="2" width="24" height="17" fill={L} stroke={S} />
    <path d="M5 3h22M5 3v15" stroke={W} />
    <rect x="7" y="5" width="18" height="11" fill={T} stroke={G} />
    <path d="M8 6h7l-7 7z" fill="#40b0b0" />
    <rect x="11" y="19" width="10" height="2" fill={G} stroke={S} />
    <rect x="3" y="21" width="26" height="8" fill={L} stroke={S} />
    <path d="M4 22h24" stroke={W} />
    <rect x="6" y="24" width="11" height="2" fill={G} />
    <rect x="22" y="24" width="3" height="2" fill="#00e000" />
  </>,
  folder: <>
    <path d="M2 8h10l2 3h16v17H2z" fill={Y} stroke={YD} />
    <path d="M3 9h8l2 3h16" stroke={W} fill="none" />
    <path d="M2 13h28v15H2z" fill="#ffff40" stroke={YD} />
    <path d="M3 14h26" stroke={W} />
  </>,
  folderOpen: <>
    <path d="M2 7h10l2 3h14v6H2z" fill={Y} stroke={YD} />
    <path d="M6 14h25l-4 14H2z" fill="#ffff40" stroke={YD} />
    <path d="M7 15h22" stroke={W} />
  </>,
  file: <><path d="M7 2h14l6 6v22H7z" fill={W} stroke={S} /><path d="M21 2v6h6" fill={L} stroke={S} /></>,
  text: <><path d="M7 2h14l6 6v22H7z" fill={W} stroke={S} /><path d="M21 2v6h6" fill={L} stroke={S} /><path d="M10 13h14M10 17h14M10 21h14M10 25h9" stroke={B} /></>,
  image: <><path d="M5 4h22v24H5z" fill={W} stroke={S} /><rect x="8" y="7" width="16" height="12" fill="#80c0ff" /><path d="M8 19l5-6 4 4 3-3 4 5z" fill={GR} /><circle cx="20" cy="10" r="2" fill="#ff0" /></>,
  audio: <><path d="M7 2h14l6 6v22H7z" fill={W} stroke={S} /><path d="M12 22V12l9-2v10" stroke={B} strokeWidth="2" fill="none" /><circle cx="11" cy="22" r="2.5" fill={B} /><circle cx="20" cy="20" r="2.5" fill={B} /></>,
  video: <><rect x="3" y="7" width="26" height="18" fill="#202020" stroke={S} /><path d="M13 11l8 5-8 5z" fill={W} /></>,
  zip: <><path d="M7 2h14l6 6v22H7z" fill={W} stroke={S} /><path d="M14 4h3v3h-3zM17 7h3v3h-3zM14 10h3v3h-3zM17 13h3v3h-3z" fill={G} /><rect x="13" y="18" width="7" height="8" fill={Y} stroke={S} /></>,
  exe: <><rect x="3" y="5" width="26" height="22" fill={L} stroke={S} /><rect x="3" y="5" width="26" height="5" fill={B} /><rect x="6" y="13" width="20" height="11" fill={W} stroke={G} /><circle cx="16" cy="18.5" r="3" fill={G} /></>,
  drive: <><rect x="3" y="11" width="26" height="12" fill={L} stroke={S} /><rect x="6" y="15" width="14" height="3" fill={G} /><circle cx="25" cy="17" r="1.5" fill={GR} /><path d="M3 23h26v3H3z" fill={G} /></>,
  notepad: <><rect x="6" y="3" width="20" height="26" fill={W} stroke={S} /><rect x="6" y="3" width="20" height="5" fill="#40a0ff" stroke={S} /><path d="M9 12h14M9 16h14M9 20h14M9 24h9" stroke={B} /><path d="M10 2v4M14 2v4M18 2v4M22 2v4" stroke={S} strokeWidth="2" /></>,
  calc: <><rect x="6" y="2" width="20" height="28" fill={L} stroke={S} /><rect x="9" y="5" width="14" height="6" fill="#c8ffc8" stroke={G} />{[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => <rect key={r + '' + c} x={9 + c * 4} y={14 + r * 5} width="3" height="3" fill={c === 3 ? R : B} />))}</>,
  paint: <><ellipse cx="15" cy="18" rx="13" ry="10" fill="#e0b070" stroke={S} /><circle cx="9" cy="16" r="2.4" fill={R} /><circle cx="14" cy="11" r="2.4" fill="#ff0" /><circle cx="20" cy="12" r="2.4" fill={GR} /><circle cx="23" cy="18" r="2.4" fill="#00f" /><ellipse cx="14" cy="22" rx="3" ry="2.2" fill={T} /><path d="M20 4l8 8-2 2-8-8z" fill="#a05000" stroke={S} /></>,
  explorer: <><path d="M2 8h10l2 3h16v17H2z" fill={Y} stroke={YD} /><rect x="11" y="14" width="18" height="12" fill={W} stroke={S} /><path d="M13 17h14M13 20h14M13 23h14" stroke={B} /></>,
  control: <><rect x="3" y="5" width="26" height="22" fill={L} stroke={S} /><rect x="3" y="5" width="26" height="4" fill={B} /><path d="M8 14h16M8 19h16M8 24h16" stroke={G} strokeWidth="2" /><rect x="11" y="12" width="3" height="4" fill={R} /><rect x="18" y="17" width="3" height="4" fill={R} /><rect x="13" y="22" width="3" height="4" fill={R} /></>,
  recycle: <>
    <path d="M8 9h16l-2 19H10z" fill="#d8d8d8" stroke={S} />
    <path d="M6 9h20M12 6h8v3h-8z" stroke={S} fill={L} />
    <path d="M13 13v11M16 13v11M19 13v11" stroke={G} />
    <path d="M13 17l3-3 3 3-3 4z" fill={GR} />
  </>,
  recycleFull: <>
    <path d="M9 11l3-6 4 4 3-5 5 7z" fill={W} stroke={S} />
    <path d="M8 11h16l-2 17H10z" fill="#d8d8d8" stroke={S} />
    <path d="M6 11h20" stroke={S} />
    <path d="M13 15v11M16 15v11M19 15v11" stroke={G} />
    <path d="M13 18l3-3 3 3-3 4z" fill={GR} />
  </>,
  media: <>
    <circle cx="16" cy="16" r="13" fill="#dcdcf0" stroke={S} />
    <path d="M7 9l18 14M9 23l14-16" stroke="#a0d8ff" strokeWidth="2" />
    <circle cx="16" cy="16" r="4" fill={T} stroke={S} />
    <circle cx="16" cy="16" r="1.5" fill={W} />
    <path d="M13 12l8 4-8 4z" fill={B} />
  </>,
  dos: <><rect x="2" y="5" width="28" height="22" fill="#000" stroke={G} /><rect x="2" y="5" width="28" height="4" fill={L} /><text x="5" y="20" fontSize="8" fill={L} fontFamily="monospace" fontWeight="bold">C:\_</text></>,
  browser: <>
    <ellipse cx="16" cy="16" rx="13" ry="5" transform="rotate(-28 16 16)" fill="none" stroke="#ffd800" strokeWidth="3" />
    <circle cx="16" cy="16" r="9.5" fill="#1890f0" stroke={B} strokeWidth="1.2" />
    <path d="M10 15.5h12c0-3-2.5-5.5-6-5.5s-6 2.5-6 5.5zm0 0c0 3.5 2.5 6 6.5 6 2.5 0 4.5-1 5.5-2.5" fill="none" stroke={W} strokeWidth="3" />
    <path d="M5.5 22c3.5 1.5 14-2 21-10.5" fill="none" stroke="#ffd800" strokeWidth="2.5" />
    <circle cx="13" cy="11" r="1.3" fill="#90e0ff" />
  </>,
  dosgames: <>
    <rect x="2" y="4" width="28" height="20" fill="#101840" stroke={S} />
    <path d="M3 5h26" stroke="#6080c0" />
    <rect x="5" y="7" width="22" height="11" fill="#000" stroke={G} />
    <text x="6.5" y="15.5" fontSize="7.5" fill="#00ff66" fontFamily="monospace" fontWeight="bold">DOS</text>
    <rect x="12" y="25" width="8" height="3" fill={L} stroke={S} />
    <circle cx="23.5" cy="21" r="1.8" fill={R} />
    <path d="M6 21h6M9 19v4" stroke="#ff0" strokeWidth="1.5" />
  </>,
  solitaire: <>{card(3, 6, -12, '♠', S)}{card(12, 4, 10, '♥', R)}</>,
  minesweeper: <><rect x="3" y="3" width="26" height="26" fill={L} stroke={S} /><circle cx="16" cy="16" r="6" fill={S} /><path d="M16 6v20M6 16h20M9 9l14 14M23 9L9 23" stroke={S} strokeWidth="2" /><rect x="13" y="12" width="3" height="3" fill={W} /></>,
  freecell: <><rect x="1" y="3" width="30" height="26" fill="#108040" stroke={S} />{card(5, 6, -5, '♦', R)}{card(14, 6, 6, '♣', S)}</>,
  hearts: <><rect x="1" y="3" width="30" height="26" fill="#108040" stroke={S} /><path d="M16 26C5 18 6 8 11 8c3 0 5 2 5 4 0-2 2-4 5-4 5 0 6 10-5 18z" fill={R} stroke={S} /></>,
  tetris: <><rect x="2" y="2" width="28" height="28" fill="#101030" stroke={G} /><rect x="6" y="6" width="6" height="6" fill={R} /><rect x="12" y="6" width="6" height="6" fill={R} /><rect x="12" y="12" width="6" height="6" fill={R} /><rect x="18" y="18" width="6" height="6" fill="#0af" /><rect x="6" y="18" width="6" height="6" fill="#ff0" /><rect x="12" y="24" width="12" height="4" fill="#0c0" /></>,
  snake: <><rect x="2" y="2" width="28" height="28" fill="#c8e0a0" stroke={S} /><path d="M6 24h14v-8H10v-8h16" fill="none" stroke="#206020" strokeWidth="4" /><rect x="24" y="6" width="4" height="4" fill="#206020" /><rect x="6" y="14" width="3" height="3" fill={R} /></>,
  help: <><path d="M5 4h20v24H5z" fill="#c040c0" stroke={S} /><path d="M7 6h16v20H7z" fill="#ffc0ff" /><text x="15" y="21" fontSize="16" fontWeight="bold" textAnchor="middle" fill={B}>?</text></>,
  run: <><rect x="3" y="6" width="26" height="20" fill={L} stroke={S} /><rect x="3" y="6" width="26" height="4" fill={B} /><rect x="6" y="13" width="14" height="4" fill={W} stroke={G} /><path d="M22 15h5l-2-3m2 3l-2 3" stroke={S} fill="none" /></>,
  find: <><circle cx="13" cy="13" r="8" fill="#c0e0ff" stroke={S} strokeWidth="2" /><path d="M19 19l9 9" stroke="#a05000" strokeWidth="4" /></>,
  documents: <><path d="M2 8h10l2 3h16v17H2z" fill={Y} stroke={YD} /><rect x="10" y="9" width="14" height="14" fill={W} stroke={S} /><path d="M12 13h10M12 16h10M12 19h10" stroke={B} /></>,
  settings: <><circle cx="16" cy="16" r="10" fill={L} stroke={S} strokeWidth="2" /><circle cx="16" cy="16" r="4" fill={G} /><path d="M16 2v5M16 25v5M2 16h5M25 16h5M6 6l3 3M23 23l3 3M26 6l-3 3M9 23l-3 3" stroke={S} strokeWidth="3" /></>,
  programs: <><rect x="2" y="4" width="20" height="16" fill={L} stroke={S} /><rect x="2" y="4" width="20" height="4" fill={B} /><rect x="10" y="12" width="20" height="16" fill={L} stroke={S} /><rect x="10" y="12" width="20" height="4" fill={T} /></>,
  shutdown: <><rect x="4" y="3" width="24" height="18" fill={L} stroke={S} /><rect x="7" y="6" width="18" height="12" fill="#0060c0" stroke={G} /><circle cx="16" cy="12" r="4" fill="none" stroke={W} strokeWidth="2" /><path d="M16 7v5" stroke={W} strokeWidth="2" /><rect x="10" y="22" width="12" height="3" fill={L} stroke={S} /></>,
  display: <><rect x="3" y="3" width="26" height="19" fill={L} stroke={S} /><rect x="6" y="6" width="20" height="13" fill={T} stroke={G} /><path d="M6 19l7-7 4 4 3-3 6 6z" fill="#40a040" /><rect x="11" y="23" width="10" height="3" fill={L} stroke={S} /></>,
  sound: <><path d="M4 12h6l8-7v22l-8-7H4z" fill={L} stroke={S} /><path d="M21 10c3 3 3 9 0 12M24 7c5 5 5 13 0 18" fill="none" stroke={B} strokeWidth="2" /></>,
  system: <><rect x="4" y="3" width="24" height="18" fill={L} stroke={S} /><rect x="7" y="6" width="18" height="12" fill={W} stroke={G} /><text x="16" y="16" fontSize="11" fontWeight="bold" textAnchor="middle" fill={B}>i</text><rect x="10" y="22" width="12" height="3" fill={L} stroke={S} /><rect x="4" y="26" width="24" height="3" fill={L} stroke={S} /></>,
  clock: <><circle cx="16" cy="16" r="13" fill={W} stroke={S} strokeWidth="2" /><path d="M16 7v9l6 4" stroke={S} strokeWidth="2" fill="none" /></>,
  themes: <><rect x="3" y="4" width="26" height="24" fill="#a0c0ff" stroke={S} /><circle cx="22" cy="10" r="3" fill="#ff0" /><path d="M3 28V18l8-6 7 7 5-4 6 5v8z" fill="#40a040" stroke={S} /></>,
  network: <><rect x="3" y="4" width="12" height="9" fill={L} stroke={S} /><rect x="17" y="17" width="12" height="9" fill={L} stroke={S} /><path d="M9 13v6h8M23 17v-5h-8" stroke={S} fill="none" /></>,
  warning: <><path d="M16 3L30 28H2z" fill="#ffff00" stroke={S} strokeWidth="1.5" /><path d="M16 11v9" stroke={S} strokeWidth="3" /><rect x="14.5" y="22" width="3" height="3" fill={S} /></>,
  error: <><circle cx="16" cy="16" r="13" fill={R} stroke={S} /><path d="M10 10l12 12M22 10L10 22" stroke={W} strokeWidth="4" /></>,
  info: <><circle cx="16" cy="16" r="13" fill="#4080ff" stroke={S} /><rect x="14" y="14" width="4" height="10" fill={W} /><rect x="14" y="8" width="4" height="4" fill={W} /></>,
  question: <><circle cx="16" cy="16" r="13" fill="#4080ff" stroke={S} /><text x="16" y="23" fontSize="20" fontWeight="bold" textAnchor="middle" fill={W}>?</text></>,
  flag: <><path d="M3 5c4-2 7 1 11-1v10c-4 2-7-1-11 1z" fill={R} /><path d="M16 3.500c4-1 6 1 9 0v10c-3 1-5-1-9 0z" fill={GR} /><path d="M3 16c4-2 7 1 11-1v10c-4 2-7-1-11 1z" fill="#0000ff" /><path d="M16 14.500c4-1 6 1 9 0v10c-3 1-5-1-9 0z" fill="#ffe000" /><path d="M1 3v26" stroke={S} strokeWidth="1.500" /></>,
  speaker: <><path d="M3 11h5l6-5v20l-6-5H3z" fill={L} stroke={S} /><path d="M18 11c2 3 2 7 0 10M22 8c4 5 4 11 0 16" fill="none" stroke={S} strokeWidth="1.500" /></>,
  speakerMute: <><path d="M3 11h5l6-5v20l-6-5H3z" fill={L} stroke={S} /><path d="M18 11l8 10M26 11l-8 10" stroke={R} strokeWidth="2" /></>,
  fullscreen: <><path d="M4 4h9M4 4v9M28 4h-9M28 4v9M4 28h9M4 28v-9M28 28h-9M28 28v-9" stroke={S} strokeWidth="3" fill="none" /></>,
  wordpad: <><rect x="5" y="3" width="18" height="25" fill={W} stroke={S} /><rect x="5" y="3" width="18" height="4" fill={B} /><path d="M8 11h10M8 15h12M8 19h8M8 23h10" stroke={G} /><path d="M25 6l4 4-10 14-4 1 1-4z" fill="#e0a020" stroke={S} /><path d="M23 8l4 4" stroke={B} strokeWidth="1.5" /></>,
  acrobat: <>
    <path d="M5 2h15l7 7v21H5z" fill={W} stroke={S} />
    <path d="M20 2v7h7" fill={L} stroke={S} />
    <rect x="3" y="18" width="26" height="10" fill="#cc0000" stroke={S} />
    <path d="M15.5 6.5c1.3 0 1.4 3.4-.3 6.8-1.6 3.2-4.6 6.2-6.2 5.4-1.2-.6.4-2.5 3.6-3.7 3.8-1.4 8.8-1.4 10.6.4 1.1 1.1-.1 2.5-2.1 1.7-2-.8-4.5-4.3-5.8-8.2-.4-1.3-.3-2.4.2-2.4z" fill="none" stroke="#cc0000" strokeWidth="1.7" />
    <text x="16" y="25.5" fontSize="7.5" fontWeight="bold" textAnchor="middle" fill={W} fontFamily="Arial, sans-serif">PDF</text>
  </>,
  pdf: <>
    <path d="M6 2h14l6 6v22H6z" fill={W} stroke={S} />
    <path d="M20 2v6h6" fill={L} stroke={S} />
    <rect x="6" y="18" width="20" height="9" fill="#cc0000" />
    <path d="M16 9c.9 0 .9 2.4-.2 4.6-1 2.1-3.1 4-4.2 3.5-.8-.4.3-1.6 2.4-2.4 2.5-.9 5.8-.9 7 .3.7.7-.1 1.6-1.4 1.1-1.3-.5-3-2.8-3.8-5.4-.3-.9-.2-1.7.2-1.7z" fill="none" stroke="#cc0000" strokeWidth="1.3" />
    <text x="16" y="25" fontSize="7" fontWeight="bold" textAnchor="middle" fill={W} fontFamily="Arial, sans-serif">PDF</text>
  </>,
};
export default function Icon({ name, size = 32, style, className }) {
  const body = ICONS[name] || ICONS.file;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" shapeRendering="crispEdges" style={{ flex: 'none', ...style }} className={className} aria-hidden="true">
      {body}
    </svg>
  );
}
export function iconForFile(n) {
  if (n.type === 'folder') return 'folder';
  const e = n.name.split('.').pop().toLowerCase();
  if (e === 'pdf') return 'pdf';
  if (e === 'rtf') return 'wordpad';
  if (['txt', 'md', 'log', 'ini', 'cfg', 'bat', 'json', 'js', 'css', 'html', 'htm', 'csv', 'xml', 'inf'].includes(e)) return 'text';
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(e)) return 'image';
  if (['wav', 'mp3', 'ogg', 'm4a', 'flac', 'aac'].includes(e)) return 'audio';
  if (['mp4', 'webm', 'mov', 'ogv', 'mkv'].includes(e)) return 'video';
  if (['zip', 'jsdos'].includes(e)) return 'zip';
  if (['img', 'ima', 'vfd', 'iso', 'cue', 'bin', 'adf', 'ipf', 'dms', 'lha', 'hdf', 'dsk', 'sna', 'cdt', 'd64', 'd71', 'd81', 't64', 'prg', 'crt', 'tap', 'tzx', 'z80', 'st', 'msa', 'stx', 'dim'].includes(e)) return 'dosgames';
  if (['exe', 'com'].includes(e)) return 'exe';
  return 'file';
}

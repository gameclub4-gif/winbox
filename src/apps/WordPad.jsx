import { useState, useRef, useEffect, useCallback } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import * as fs from '../os/fs.js';
import { pickLocalFiles, saveLocalFile } from '../os/localFiles.js';
import { rtfToHtml, htmlToRtf, sanitizeHtmlForEditor, wrapStandaloneHtml } from '../utils/rtf.js';
import * as SmartTransfer from '../os/smartTransfer.js';
import { pickImageDialog, receiveConflictDialog, openTransferHistoryDialog } from '../os/smartTransferUI.jsx';
import { useVoiceDictation, VOICE_LANGUAGES, formatDictatedChunk } from '../utils/voiceDictation.js';

const FONTS = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Tahoma', 'Verdana'];
const SIZES = [
  ['1', '8'], ['2', '10'], ['3', '12'], ['4', '14'], ['5', '18'], ['6', '24'], ['7', '36'],
];
const DOC_TYPES = [
  {
    description: 'WordPad Documents (RTF, HTML, HTML ZIP)',
    accept: {
      'application/rtf': ['.rtf'],
      'text/html': ['.html', '.htm'],
      'application/zip': ['.zip'],
      'text/plain': ['.txt', '.md'],
    },
  },
];

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ''));
    r.onerror = () => rej(r.error || new Error('Failed to read file'));
    r.readAsDataURL(blob);
  });
}

function WpIcon({ name, color = '#000000', bgColor = '#ffff00' }) {
  switch (name) {
    case 'new':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M3 1h7l3 3v11H3z" fill="#fff" />
          <path d="M2 1h8v1H3v12h9V4h1v11H2z" fill="#000" />
          <path d="M10 1h1v3h3v1h-4z" fill="#808080" />
          <rect x="10" y="2" width="1" height="2" fill="#dfdfdf" />
          <rect x="11" y="3" width="1" height="1" fill="#dfdfdf" />
        </svg>
      );
    case 'open-c':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M1 3h5l1 1h6v2H4L2 12H1z" fill="#c0c000" />
          <path d="M1 2h5l1 1h6v1H7L6 3H2v8H1z" fill="#000" />
          <path d="M4 6h11l-2 7H2z" fill="#ff0" />
          <path d="M4 5h11v1H4zm-1 1h1v1H3zm-1 2h1v4H2zm11 4h1v1H3v-1h10zm1-5h1v5h-1z" fill="#000" />
          <rect x="9" y="10" width="7" height="6" fill="#c0c0c0" />
          <path d="M9 10h7v1H9zm0 5h7v1H9zm0-5h1v6H9zm6 0h1v6h-1z" fill="#000" />
          <path d="M11 11h3v1h-2v2h2v1h-3z" fill="#000080" />
          <rect x="14" y="12" width="1" height="1" fill="#008000" />
        </svg>
      );
    case 'open-pc':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M1 3h5l1 1h6v2H4L2 12H1z" fill="#c0c000" />
          <path d="M1 2h5l1 1h6v1H7L6 3H2v8H1z" fill="#000" />
          <path d="M4 6h11l-2 7H2z" fill="#ff0" />
          <path d="M4 5h11v1H4zm-1 1h1v1H3zm-1 2h1v4H2zm11 4h1v1H3v-1h10zm1-5h1v5h-1z" fill="#000" />
          <rect x="8" y="9" width="8" height="6" fill="#c0c0c0" />
          <path d="M8 9h8v6H8z" fill="none" stroke="#000" />
          <rect x="9" y="10" width="6" height="4" fill="#008080" />
          <rect x="11" y="15" width="2" height="1" fill="#000" />
          <rect x="9" y="15" width="6" height="1" fill="#808080" />
        </svg>
      );
    case 'save':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M1 1h12l2 2v12H1z" fill="#000080" />
          <path d="M1 1h12v1H2v12h12V3h1v12H1z" fill="#000" />
          <rect x="4" y="1" width="7" height="5" fill="#c0c0c0" />
          <rect x="8" y="2" width="2" height="3" fill="#000080" />
          <rect x="3" y="8" width="10" height="6" fill="#fff" />
          <rect x="4" y="10" width="8" height="1" fill="#808080" />
          <rect x="4" y="12" width="6" height="1" fill="#808080" />
        </svg>
      );
    case 'save-pc':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M1 1h11l2 2v11H1z" fill="#000080" />
          <path d="M1 1h11v1H2v11h11V3h1v11H1z" fill="#000" />
          <rect x="4" y="1" width="6" height="5" fill="#c0c0c0" />
          <rect x="7" y="2" width="2" height="3" fill="#000080" />
          <rect x="3" y="8" width="7" height="5" fill="#fff" />
          <rect x="8" y="9" width="8" height="6" fill="#c0c0c0" />
          <rect x="9" y="10" width="6" height="4" fill="#008080" />
          <rect x="8" y="9" width="8" height="1" fill="#000" />
          <rect x="8" y="14" width="8" height="1" fill="#000" />
          <rect x="8" y="9" width="1" height="6" fill="#000" />
          <rect x="15" y="9" width="1" height="6" fill="#000" />
          <rect x="10" y="15" width="4" height="1" fill="#000" />
        </svg>
      );
    case 'image':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="1" y="2" width="14" height="12" fill="#c0c0c0" />
          <path d="M1 2h14v1H2v10h12V2h1v12H1z" fill="#000" />
          <rect x="2" y="3" width="12" height="7" fill="#00ffff" />
          <rect x="4" y="4" width="2" height="2" fill="#ff0" />
          <path d="M2 10l3-4 3 3 2-2 4 3v3H2z" fill="#008000" />
          <path d="M5 6l2 2-1 1-2-1z" fill="#fff" />
        </svg>
      );
    case 'rtf':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M2 1h8l3 3v11H2z" fill="#fff" />
          <path d="M2 1h8v1H3v12h9V4h1v11H2z" fill="#000" />
          <path d="M10 1h1v3h2v1h-3z" fill="#808080" />
          <rect x="4" y="3" width="4" height="1" fill="#000080" />
          <rect x="4" y="5" width="7" height="1" fill="#808080" />
          <rect x="4" y="7" width="7" height="1" fill="#808080" />
          <rect x="3" y="9" width="10" height="5" fill="#000080" />
          <path d="M4 10h2v1H5v2H4zm4 0h3v1h-1v2H9v-2H8zm4 0h1v3h-1z" fill="#fff" />
        </svg>
      );
    case 'html':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M2 1h8l3 3v11H2z" fill="#fff" />
          <path d="M2 1h8v1H3v12h9V4h1v11H2z" fill="#000" />
          <path d="M10 1h1v3h2v1h-3z" fill="#808080" />
          <rect x="5" y="3" width="4" height="4" fill="#008080" />
          <rect x="6" y="4" width="2" height="2" fill="#00ff00" />
          <rect x="3" y="9" width="10" height="5" fill="#008080" />
          <path d="M4 10h1v1h1v-1h1v3H6v-1H5v1H4zm4 0h3v1h-1v2H9v-2H8zm4 0h1v3h-1z" fill="#fff" />
        </svg>
      );
    case 'zip':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M2 3h5l1 1h6v10H2z" fill="#ff0" />
          <path d="M2 2h5l1 1h6v11H2zm1 2v9h10V4H7L6 3H3z" fill="#000" />
          <rect x="7" y="4" width="2" height="9" fill="#808080" />
          <rect x="7" y="5" width="1" height="1" fill="#fff" />
          <rect x="8" y="6" width="1" height="1" fill="#000" />
          <rect x="7" y="7" width="1" height="1" fill="#fff" />
          <rect x="8" y="8" width="1" height="1" fill="#000" />
          <rect x="6" y="10" width="4" height="3" fill="#c0c0c0" />
          <rect x="7" y="11" width="2" height="1" fill="#000080" />
        </svg>
      );
    case 'undo':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M6 3L2 7l4 4V8h4c1.7 0 3 1.3 3 3v2h2v-2c0-2.8-2.2-5-5-5H6V3z" fill="#000080" />
        </svg>
      );
    case 'find':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="3" y="2" width="3" height="2" fill="#808080" />
          <rect x="10" y="2" width="3" height="2" fill="#808080" />
          <rect x="2" y="4" width="5" height="6" fill="#000" />
          <rect x="9" y="4" width="5" height="6" fill="#000" />
          <rect x="7" y="5" width="2" height="2" fill="#808080" />
          <rect x="1" y="9" width="6" height="5" fill="#000" />
          <rect x="9" y="9" width="6" height="5" fill="#000" />
          <rect x="2" y="10" width="4" height="3" fill="#008080" />
          <rect x="10" y="10" width="4" height="3" fill="#008080" />
          <rect x="2" y="10" width="1" height="2" fill="#fff" />
          <rect x="10" y="10" width="1" height="2" fill="#fff" />
        </svg>
      );
    case 'date':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="1" y="2" width="10" height="11" fill="#fff" />
          <rect x="1" y="2" width="10" height="3" fill="#000080" />
          <path d="M1 2h10v11H1zm1 3v7h8V5z" fill="none" stroke="#000" />
          <rect x="3" y="1" width="1" height="2" fill="#808080" />
          <rect x="8" y="1" width="1" height="2" fill="#808080" />
          <rect x="3" y="7" width="1" height="3" fill="#c00000" />
          <path d="M5 7h3v1H7v1h1v1H5V9h2V8H5z" fill="#000" />
          <rect x="8" y="8" width="7" height="7" fill="#ff0" />
          <path d="M8 8h7v7H8zm1 1v5h5V9z" fill="#000" />
          <rect x="11" y="10" width="1" height="3" fill="#000" />
          <rect x="11" y="12" width="2" height="1" fill="#000" />
        </svg>
      );
    case 'mic':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="6" y="1" width="4" height="7" fill="#c0c0c0" />
          <path d="M6 1h4v7H6zm1 1v5h2V2z" fill="#000" />
          <rect x="7" y="3" width="2" height="1" fill="#808080" />
          <rect x="7" y="5" width="2" height="1" fill="#808080" />
          <path d="M4 6h1v3h6V6h1v4H8v3h3v1H5v-1h3v-3H4z" fill="#000080" />
        </svg>
      );
    case 'mic-pause':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="3" y="3" width="3" height="10" fill="#000080" />
          <rect x="8" y="3" width="3" height="10" fill="#000080" />
          <rect x="12" y="2" width="3" height="3" fill="#f00" />
        </svg>
      );
    case 'bold':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M3 2h6c1.7 0 3 .9 3 2.5 0 1-.5 1.8-1.4 2.2 1.2.4 1.9 1.3 1.9 2.6C12.5 11.2 11 12 9 12H3V2zm2 2v2.4h3.2c.8 0 1.3-.4 1.3-1.2S9 4 8.2 4H5zm0 4.2V10h3.7c.9 0 1.4-.4 1.4-1.2s-.5-1.2-1.4-1.2H5v.6z" fill="#000" transform="translate(0 1)" />
        </svg>
      );
    case 'italic':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M7 3h5v1.5h-1.7L8.2 11.5H10V13H5v-1.5h1.7L8.8 4.5H7z" fill="#000" />
        </svg>
      );
    case 'underline':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M4 2h2v6.2c0 1.2.7 1.9 2 1.9s2-.7 2-1.9V2h2v6.3c0 2.3-1.5 3.6-4 3.6s-4-1.3-4-3.6V2z" fill="#000" />
          <rect x="3" y="13" width="10" height="1.5" fill="#000" />
        </svg>
      );
    case 'color':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M6.5 2h2L12 11h-2l-.7-2H5.7L5 11H3L6.5 2zm1 2.5L6.2 7.5h2.6L7.5 4.5z" fill="#000" />
          <rect x="2" y="12" width="12" height="3" fill={color || '#000'} />
          <path d="M2 12h12v3H2z" fill="none" stroke="#808080" strokeWidth="0.6" />
        </svg>
      );
    case 'highlight':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="2" y="12" width="12" height="3" fill={bgColor || '#ff0'} />
          <rect x="2" y="12" width="12" height="3" fill="none" stroke="#808080" strokeWidth="0.7" />
          <path d="M4 4h2v3h3V4h2v7H9v-1H7v1H4z" fill="#000" opacity="0" />
          <path d="M10 1l3 3-6 6-3 1 1-3 5-7z" fill="#c0c0c0" stroke="#000" strokeWidth="1" />
          <path d="M4 9l2 2-2.5.5z" fill={bgColor || '#ff0'} />
        </svg>
      );
    case 'clear-highlight':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M8 3h6v4l-5 5H4l-2-2 6-7z" fill="#ff8080" stroke="#000" strokeWidth="1" />
          <path d="M3 10l4 3H2z" fill="#fff" stroke="#000" strokeWidth="1" />
          <rect x="2" y="14" width="12" height="1" fill="#808080" />
        </svg>
      );
    case 'align-left':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="2" y="3" width="12" height="1" fill="#000" />
          <rect x="2" y="5" width="8" height="1" fill="#000" />
          <rect x="2" y="7" width="12" height="1" fill="#000" />
          <rect x="2" y="9" width="9" height="1" fill="#000" />
          <rect x="2" y="11" width="12" height="1" fill="#000" />
          <rect x="2" y="13" width="7" height="1" fill="#000" />
        </svg>
      );
    case 'align-center':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="2" y="3" width="12" height="1" fill="#000" />
          <rect x="4" y="5" width="8" height="1" fill="#000" />
          <rect x="2" y="7" width="12" height="1" fill="#000" />
          <rect x="3" y="9" width="10" height="1" fill="#000" />
          <rect x="2" y="11" width="12" height="1" fill="#000" />
          <rect x="4" y="13" width="8" height="1" fill="#000" />
        </svg>
      );
    case 'align-right':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="2" y="3" width="12" height="1" fill="#000" />
          <rect x="6" y="5" width="8" height="1" fill="#000" />
          <rect x="2" y="7" width="12" height="1" fill="#000" />
          <rect x="5" y="9" width="9" height="1" fill="#000" />
          <rect x="2" y="11" width="12" height="1" fill="#000" />
          <rect x="7" y="13" width="7" height="1" fill="#000" />
        </svg>
      );
    case 'bullets':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="2" y="3" width="2" height="2" fill="#000" />
          <rect x="6" y="3" width="8" height="2" fill="#000" />
          <rect x="2" y="7" width="2" height="2" fill="#000" />
          <rect x="6" y="7" width="8" height="2" fill="#000" />
          <rect x="2" y="11" width="2" height="2" fill="#000" />
          <rect x="6" y="11" width="8" height="2" fill="#000" />
        </svg>
      );
    case 'print':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="4" y="1" width="8" height="5" fill="#fff" stroke="#000" strokeWidth="1" />
          <rect x="1" y="6" width="14" height="6" fill="#c0c0c0" stroke="#000" strokeWidth="1" />
          <rect x="3" y="8" width="10" height="1" fill="#808080" />
          <rect x="11" y="9" width="2" height="1" fill="#008000" />
          <rect x="4" y="10" width="8" height="5" fill="#fff" stroke="#000" strokeWidth="1" />
          <rect x="5" y="12" width="6" height="1" fill="#808080" />
        </svg>
      );
    case 'cut':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M4 2l4 6m4-6L8 8" stroke="#000080" strokeWidth="1.5" />
          <circle cx="4.5" cy="11.5" r="2.2" fill="none" stroke="#000" strokeWidth="1.2" />
          <circle cx="11.5" cy="11.5" r="2.2" fill="none" stroke="#000" strokeWidth="1.2" />
        </svg>
      );
    case 'copy':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="2" y="1" width="8" height="10" fill="#fff" stroke="#000" strokeWidth="1" />
          <rect x="4" y="3" width="4" height="1" fill="#000080" />
          <rect x="4" y="5" width="4" height="1" fill="#808080" />
          <rect x="6" y="5" width="8" height="10" fill="#fff" stroke="#000" strokeWidth="1" />
          <rect x="8" y="7" width="4" height="1" fill="#000080" />
          <rect x="8" y="9" width="4" height="1" fill="#808080" />
          <rect x="8" y="11" width="4" height="1" fill="#808080" />
        </svg>
      );
    case 'paste':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="2" y="2" width="10" height="12" fill="#808000" stroke="#000" strokeWidth="1" />
          <rect x="5" y="1" width="4" height="2" fill="#c0c0c0" stroke="#000" strokeWidth="0.8" />
          <rect x="6" y="5" width="8" height="10" fill="#fff" stroke="#000" strokeWidth="1" />
          <rect x="8" y="7" width="4" height="1" fill="#000080" />
          <rect x="8" y="9" width="4" height="1" fill="#808080" />
          <rect x="8" y="11" width="4" height="1" fill="#808080" />
        </svg>
      );
    case 'redo':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M10 3l4 4-4 4V8H6c-1.7 0-3 1.3-3 3v2H1v-2c0-2.8 2.2-5 5-5h4V3z" fill="#000080" />
        </svg>
      );
    case 'table':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="2" y="2" width="12" height="12" fill="#fff" stroke="#000" strokeWidth="1" />
          <rect x="2" y="2" width="12" height="3" fill="#000080" />
          <rect x="6" y="5" width="1" height="9" fill="#808080" />
          <rect x="10" y="5" width="1" height="9" fill="#808080" />
          <rect x="2" y="8" width="12" height="1" fill="#808080" />
          <rect x="2" y="11" width="12" height="1" fill="#808080" />
        </svg>
      );
    case 'pilcrow':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M7 2C4.8 2 3 3.5 3 5.5S4.8 9 7 9v5h2V4h2v10h2V2H7z" fill="#000080" />
        </svg>
      );
    case 'word95':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M2 1h9l3 3v11H2z" fill="#fff" stroke="#000" strokeWidth="1" />
          <rect x="11" y="2" width="2" height="2" fill="#c0c0c0" />
          <path d="M4 5h1.8l1.2 5 1.1-4h1.3l1.1 4 1.2-5H13l-1.9 8H9.7l-1-3.8L7.6 13H6.2z" fill="#0000c0" />
        </svg>
      );
    case 'align-justify':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="2" y="3" width="12" height="1" fill="#000" />
          <rect x="2" y="5" width="12" height="1" fill="#000" />
          <rect x="2" y="7" width="12" height="1" fill="#000" />
          <rect x="2" y="9" width="12" height="1" fill="#000" />
          <rect x="2" y="11" width="12" height="1" fill="#000" />
          <rect x="2" y="13" width="12" height="1" fill="#000" />
        </svg>
      );
    case 'numbers':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="2" y="2" width="2" height="3" fill="#000080" />
          <rect x="6" y="3" width="8" height="2" fill="#000" />
          <path d="M2 6h2v2H2v1h2" fill="none" stroke="#000080" strokeWidth="1" />
          <rect x="6" y="7" width="8" height="2" fill="#000" />
          <rect x="2" y="11" width="2" height="3" fill="#000080" />
          <rect x="6" y="11" width="8" height="2" fill="#000" />
        </svg>
      );
    case 'outdent':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="2" y="3" width="12" height="1" fill="#000" />
          <rect x="7" y="6" width="7" height="1" fill="#000" />
          <rect x="7" y="9" width="7" height="1" fill="#000" />
          <rect x="2" y="12" width="12" height="1" fill="#000" />
          <path d="M5 5L2 7.5 5 10V8.5h2v-2H5z" fill="#000080" />
        </svg>
      );
    case 'indent':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="2" y="3" width="12" height="1" fill="#000" />
          <rect x="7" y="6" width="7" height="1" fill="#000" />
          <rect x="7" y="9" width="7" height="1" fill="#000" />
          <rect x="2" y="12" width="12" height="1" fill="#000" />
          <path d="M3 5l3 2.5L3 10V8.5H1v-2h2z" fill="#000080" />
        </svg>
      );
    case 'border':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <rect x="2" y="2" width="12" height="12" fill="#fff" stroke="#000" strokeWidth="1.5" />
          <rect x="7" y="3" width="2" height="10" fill="#c0c0c0" />
          <rect x="3" y="7" width="10" height="2" fill="#c0c0c0" />
        </svg>
      );
    case 'format-painter':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M9 1h3v4l-2 2H7l1-3z" fill="#808000" stroke="#000" strokeWidth="0.9" />
          <path d="M6 6h5l-2 4H3l2-3z" fill="#ff0" stroke="#000" strokeWidth="0.9" />
          <path d="M3 10h4l-2 4H1z" fill="#c0c000" stroke="#000" strokeWidth="0.8" />
        </svg>
      );
    default:
      return null;
  }
}

export default function WordPad({ win, props, active }) {
  const os = useOS();
  const ed = useRef();
  const rulerTrackRef = useRef(null);
  const savedRange = useRef(null);
  const selectedImgRef = useRef(null);
  const blobUrls = useRef([]);
  const [fileId, setFileId] = useState(props.fileId || null);
  const [localFile, setLocalFile] = useState(null); // { name, handle }
  const [format, setFormat] = useState('rtf'); // 'rtf' | 'html' | 'zip'
  const [dirty, setDirty] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [showFormatBar, setShowFormatBar] = useState(true);
  const [showRuler, setShowRuler] = useState(true);
  const [skinMode, setSkinMode] = useState(props.skinMode === 'word95' ? 'word95' : 'wordpad'); // 'wordpad' | 'word95'
  const [word95View, setWord95View] = useState('page'); // 'page' | 'normal'
  const [showMarks, setShowMarks] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [blockStyle, setBlockStyle] = useState('p');
  const [painterFmt, setPainterFmt] = useState(null);
  const [cursorPos, setCursorPos] = useState({ ln: 1, col: 1 });
  const [fmtState, setFmtState] = useState({ b: false, i: false, u: false, align: 'left', ul: false, ol: false, border: false });
  const [rulerLeft, setRulerLeft] = useState(0);
  const [rulerRight, setRulerRight] = useState(0);
  const [rulerDrag, setRulerDrag] = useState(null);
  const [font, setFont] = useState('Arial');
  const [fontSize, setFontSize] = useState('3');
  const [color, setColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffff00');
  const [wordCount, setWordCount] = useState(0);
  const st = useRef({});
  st.current = { fileId, localFile, format, dirty };
  const lastFind = useRef('');

  useEffect(() => () => {
    blobUrls.current.forEach((u) => SmartTransfer.revokeTempUrl(u));
    blobUrls.current = [];
  }, []);

  const regBlob = (blob) => {
    const u = SmartTransfer.createTempUrl(blob);
    blobUrls.current.push(u);
    return u;
  };

  const updateWordCount = () => {
    const txt = ed.current?.innerText?.trim() || '';
    setWordCount(txt ? txt.split(/\s+/).length : 0);
  };

  const getTargetBlocks = () => {
    const el = ed.current;
    if (!el) return [];
    const blockSel = 'p, div, li, h1, h2, h3, h4, blockquote';
    const sel = window.getSelection();
    let rng = null;
    if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      rng = sel.getRangeAt(0);
    } else if (savedRange.current && el.contains(savedRange.current.commonAncestorContainer)) {
      rng = savedRange.current;
    }

    const findBlockForNode = (node) => {
      let cur = node?.nodeType === 3 ? node.parentElement : node;
      while (cur && cur !== el) {
        if (cur.matches?.(blockSel) && cur.parentElement === el) return cur;
        if (cur.tagName === 'LI') return cur;
        cur = cur.parentElement;
      }
      return null;
    };

    if (rng) {
      if (rng.collapsed) {
        const b = findBlockForNode(rng.startContainer);
        if (b) return [b];
      } else {
        const matched = [...el.querySelectorAll(blockSel)].filter((blk) => {
          try {
            return (blk.parentElement === el || blk.tagName === 'LI') && rng.intersectsNode(blk);
          } catch {
            return false;
          }
        });
        if (matched.length) return matched;
        const b = findBlockForNode(rng.commonAncestorContainer);
        if (b) return [b];
      }
    }
    const first = el.querySelector(blockSel);
    return first ? [first] : [];
  };

  const syncFromCaret = () => {
    const blocks = getTargetBlocks();
    const blk = blocks[0];
    if (blk) {
      const ml = Math.max(0, Math.round(parseFloat(blk.style.marginLeft || '0') || 0));
      const mr = Math.max(0, Math.round(parseFloat(blk.style.marginRight || '0') || 0));
      setRulerLeft(ml);
      setRulerRight(mr);
      const t = blk.tagName.toLowerCase();
      setBlockStyle(['p', 'h1', 'h2', 'h3', 'blockquote'].includes(t) ? t : 'p');
    }
    try {
      const el = ed.current;
      const sel = window.getSelection();
      if (el && sel && sel.rangeCount > 0 && el.contains(sel.focusNode)) {
        const pre = document.createRange();
        pre.setStart(el, 0);
        pre.setEnd(sel.focusNode, sel.focusOffset);
        const raw = pre.toString();
        const lines = raw.split('\n');
        setCursorPos({ ln: Math.max(1, lines.length), col: (lines[lines.length - 1] || '').length + 1 });
      }
      const b = !!document.queryCommandState('bold');
      const i = !!document.queryCommandState('italic');
      const u = !!document.queryCommandState('underline');
      const ul = !!document.queryCommandState('insertUnorderedList');
      const ol = !!document.queryCommandState('insertOrderedList');
      let align = 'left';
      if (document.queryCommandState('justifyCenter')) align = 'center';
      else if (document.queryCommandState('justifyRight')) align = 'right';
      else if (document.queryCommandState('justifyFull')) align = 'full';
      else if (blk) {
        const ta = (blk.style.textAlign || getComputedStyle(blk).textAlign || 'left').toLowerCase();
        if (ta === 'center') align = 'center';
        else if (ta === 'right') align = 'right';
        else if (ta === 'justify') align = 'full';
      }
      const border = !!(blk && blk.style.border);
      setFmtState({ b, i, u, align, ul, ol, border });

      const qFont = (document.queryCommandValue('fontName') || '').split(',')[0].replace(/['"]/g, '').trim();
      if (qFont) {
        const matchedFont = FONTS.find((f) => f.toLowerCase() === qFont.toLowerCase());
        if (matchedFont) setFont(matchedFont);
      }
      const qSize = String(document.queryCommandValue('fontSize') || '').trim();
      if (SIZES.some(([val]) => val === qSize)) setFontSize(qSize);
    } catch { /* ignore */ }
  };

  const captureSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !ed.current) return;
    const rng = sel.getRangeAt(0);
    if (ed.current.contains(rng.commonAncestorContainer)) {
      savedRange.current = rng.cloneRange();
      syncFromCaret();
    }
  };

  const restoreSelection = () => {
    ed.current?.focus();
    const rng = savedRange.current;
    if (!rng || !ed.current?.contains(rng.commonAncestorContainer)) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(rng);
  };

  const applyParagraphMargins = (nextLeft, nextRight, explicitBlocks = null) => {
    const blocks = explicitBlocks && explicitBlocks.length ? explicitBlocks : getTargetBlocks();
    if (blocks.length) {
      for (const blk of blocks) {
        if (nextLeft != null) blk.style.marginLeft = nextLeft > 0 ? `${nextLeft}px` : '';
        if (nextRight != null) blk.style.marginRight = nextRight > 0 ? `${nextRight}px` : '';
      }
    } else if (ed.current) {
      if (nextLeft != null) ed.current.style.paddingLeft = `${(skinMode === 'word95' && word95View === 'page' ? 36 : 20) + nextLeft}px`;
      if (nextRight != null) ed.current.style.paddingRight = `${(skinMode === 'word95' && word95View === 'page' ? 36 : 20) + nextRight}px`;
    }
    if (nextLeft != null) setRulerLeft(nextLeft);
    if (nextRight != null) setRulerRight(nextRight);
    setDirty(true);
  };

  const adjustIndent = (deltaPx) => {
    restoreSelection();
    const trackW = rulerTrackRef.current?.clientWidth || 560;
    const maxL = Math.max(40, trackW - rulerRight - 80);
    const nextL = Math.max(0, Math.min(maxL, rulerLeft + deltaPx));
    applyParagraphMargins(nextL, null);
  };

  const startRulerDrag = (side, e) => {
    e.preventDefault();
    e.stopPropagation();
    const track = rulerTrackRef.current;
    if (!track) return;
    const startX = e.clientX;
    const startL = rulerLeft;
    const startR = rulerRight;
    const trackW = track.clientWidth || 560;
    const blocks = getTargetBlocks();

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (side === 'l') {
        const maxL = Math.max(30, trackW - startR - 80);
        let next = Math.round(Math.max(0, Math.min(maxL, startL + dx)));
        if (next < 6) next = 0;
        applyParagraphMargins(next, null, blocks);
        setRulerDrag({ side: 'l', px: next, x: ev.clientX, y: ev.clientY });
      } else {
        const maxR = Math.max(30, trackW - startL - 80);
        let next = Math.round(Math.max(0, Math.min(maxR, startR - dx)));
        if (next < 6) next = 0;
        applyParagraphMargins(null, next, blocks);
        setRulerDrag({ side: 'r', px: next, x: ev.clientX, y: ev.clientY });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setRulerDrag(null);
      restoreSelection();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    setRulerDrag({ side, px: side === 'l' ? startL : startR, x: e.clientX, y: e.clientY });
  };

  const resetCurrentMargins = () => {
    applyParagraphMargins(0, 0);
    restoreSelection();
  };

  const applyDocMarginPreset = (px) => {
    const el = ed.current;
    if (!el) return;
    const blocks = [...el.querySelectorAll('p, div, li, h1, h2, h3, h4, blockquote')].filter(
      (b) => b.parentElement === el || b.tagName === 'LI',
    );
    applyParagraphMargins(px, px, blocks);
    restoreSelection();
  };

  const toggleFormatPainter = () => {
    if (painterFmt) {
      setPainterFmt(null);
      return;
    }
    restoreSelection();
    try {
      setPainterFmt({
        b: document.queryCommandState('bold'),
        i: document.queryCommandState('italic'),
        u: document.queryCommandState('underline'),
        fontName: document.queryCommandValue('fontName') || font,
        fontSize: document.queryCommandValue('fontSize') || fontSize,
        foreColor: document.queryCommandValue('foreColor') || color,
      });
    } catch {
      setPainterFmt({ b: false, i: false, u: false, fontName: font, fontSize, foreColor: color });
    }
  };

  const applyPainterFormatIfArmed = () => {
    if (!painterFmt) return;
    const fmt = painterFmt;
    setPainterFmt(null);
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    try {
      document.execCommand('styleWithCSS', false, true);
      if (document.queryCommandState('bold') !== fmt.b) document.execCommand('bold', false, null);
      if (document.queryCommandState('italic') !== fmt.i) document.execCommand('italic', false, null);
      if (document.queryCommandState('underline') !== fmt.u) document.execCommand('underline', false, null);
      if (fmt.fontName) document.execCommand('fontName', false, fmt.fontName.replace(/['"]/g, ''));
      if (fmt.fontSize) document.execCommand('fontSize', false, fmt.fontSize);
      if (fmt.foreColor) document.execCommand('foreColor', false, fmt.foreColor);
      setDirty(true);
    } catch { /* ignore */ }
  };

  const insertTable = async () => {
    const spec = await os.prompt({ title: 'Insert Table', label: 'Rows x Columns (e.g. 3x3):', value: '3x3' });
    if (!spec) return;
    const m = spec.match(/(\d+)\s*[x×, ]\s*(\d+)/i);
    const rows = Math.max(1, Math.min(12, parseInt(m?.[1] || '3', 10)));
    const cols = Math.max(1, Math.min(8, parseInt(m?.[2] || '3', 10)));
    const tr = `<tr>${'<td><br></td>'.repeat(cols)}</tr>`;
    exec('insertHTML', `<table><tbody>${tr.repeat(rows)}</tbody></table><p><br></p>`, true);
  };

  const toggleParagraphBorder = () => {
    restoreSelection();
    const blocks = getTargetBlocks();
    if (!blocks.length) return;
    const hasBorder = !!blocks[0].style.border;
    for (const blk of blocks) {
      if (hasBorder) {
        blk.style.border = '';
        blk.style.padding = '';
      } else {
        blk.style.border = '1px solid #000';
        blk.style.padding = '4px 6px';
      }
    }
    setDirty(true);
    syncFromCaret();
  };

  const printDocument = () => {
    try {
      const nm = fileId ? fs.get(fileId)?.name : localFile ? localFile.name : 'Document';
      const html = wrapStandaloneHtml(ed.current?.innerHTML || '<p><br></p>', nm || 'Document');
      const ifr = document.createElement('iframe');
      ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
      document.body.appendChild(ifr);
      ifr.onload = () => {
        try {
          ifr.contentWindow?.focus();
          ifr.contentWindow?.print();
        } finally {
          setTimeout(() => ifr.remove(), 1200);
        }
      };
      ifr.srcdoc = html;
    } catch (e) {
      os.msg({ icon: 'error', title: 'Print', text: e.message });
    }
  };

  const getCharBeforeCaret = () => {
    const el = ed.current;
    if (!el) return '';
    const sel = window.getSelection();
    let rng = null;
    if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).startContainer)) rng = sel.getRangeAt(0);
    else if (savedRange.current && el.contains(savedRange.current.startContainer)) rng = savedRange.current;
    if (!rng) return (el.innerText || '').slice(-1);
    if (rng.startContainer.nodeType === 3 && rng.startOffset > 0) {
      return (rng.startContainer.nodeValue || '')[rng.startOffset - 1] || '';
    }
    try {
      const pre = document.createRange();
      pre.setStart(el, 0);
      pre.setEnd(rng.startContainer, rng.startOffset);
      return pre.toString().slice(-1);
    } catch {
      return '';
    }
  };

  const insertDictatedText = (rawTranscript) => {
    const el = ed.current;
    if (!el) return;
    const sel = window.getSelection();
    const hasLiveInEditor = sel && sel.rangeCount > 0 && el.contains(sel.anchorNode);
    if (!hasLiveInEditor) {
      if (savedRange.current && el.contains(savedRange.current.commonAncestorContainer)) {
        restoreSelection();
      } else {
        el.focus();
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
    }
    const chunk = formatDictatedChunk(rawTranscript, getCharBeforeCaret());
    if (!chunk) return;
    try {
      document.execCommand('insertText', false, chunk);
    } catch {
      const curSel = window.getSelection();
      if (curSel && curSel.rangeCount > 0) {
        const r = curSel.getRangeAt(0);
        r.deleteContents();
        const tn = document.createTextNode(chunk);
        r.insertNode(tn);
        r.setStartAfter(tn);
        r.collapse(true);
        curSel.removeAllRanges();
        curSel.addRange(r);
      }
    }
    setDirty(true);
    updateWordCount();
    captureSelection();
  };

  const voice = useVoiceDictation({
    onResult: insertDictatedText,
    onError: (msg) => os.msg({ icon: 'warning', title: 'WordPad Voice Dictation', text: msg }),
  });

  const loadContent = (rawText, filename = '') => {
    const ext = fs.ext(filename);
    let html;
    let nextFmt = 'rtf';
    if (ext === 'html' || ext === 'htm') {
      html = sanitizeHtmlForEditor(rawText);
      nextFmt = 'html';
    } else if (ext === 'rtf' || rawText.trimStart().startsWith('{\\rtf')) {
      html = rtfToHtml(rawText);
      nextFmt = 'rtf';
    } else {
      html = rawText
        .split(/\r?\n/)
        .map((line) => `<p>${line ? line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '<br>'}</p>`)
        .join('');
    }
    if (ed.current) {
      ed.current.innerHTML = html || '<p><br></p>';
      ed.current.style.paddingLeft = '';
      ed.current.style.paddingRight = '';
      updateWordCount();
      setRulerLeft(0);
      setRulerRight(0);
      setBlockStyle('p');
      syncFromCaret();
    }
    setFormat(nextFmt);
    setDirty(false);
  };

  const loadFromBlob = async (blob, filename) => {
    const ext = fs.ext(filename);
    if (ext === 'zip') {
      const { extractHtmlFromZip } = await import('../utils/htmlZip.js');
      const buf = new Uint8Array(await blob.arrayBuffer());
      const res = extractHtmlFromZip(buf, filename);
      if (ed.current) {
        ed.current.innerHTML = res.html || '<p><br></p>';
        ed.current.style.paddingLeft = '';
        ed.current.style.paddingRight = '';
        updateWordCount();
        setRulerLeft(0);
        setRulerRight(0);
        setBlockStyle('p');
        syncFromCaret();
      }
      setFormat('zip');
      setDirty(false);
      return;
    }
    const txt = await blob.text();
    loadContent(txt, filename);
  };

  useEffect(() => {
    if (ed.current && !props.fileId && !props.transferId) {
      ed.current.innerHTML = '<p><br></p>';
    }
    if (props.transferId) {
      SmartTransfer.getTransfer(props.transferId).then((t) => {
        if (t) receiveTransferRef.current?.(t, props.transferAction || 'open');
      });
    } else if (props.fileId) {
      const n = fs.get(props.fileId);
      if (n) loadFromBlob(fs.toBlob(n), n.name).catch((e) => os.msg({ icon: 'error', title: 'WordPad', text: e.message }));
    }
  }, [win.nonce]); // eslint-disable-line

  useEffect(() => {
    if (active) SmartTransfer.touchApp('wordpad', win.id);
  }, [active, win.id]);

  useEffect(() => {
    if (props.skinMode === 'word95' || props.skinMode === 'wordpad') {
      setSkinMode(props.skinMode);
    }
  }, [props.skinMode, win.nonce]);

  useEffect(() => {
    const nm = fileId ? fs.get(fileId)?.name : localFile ? localFile.name : 'Document';
    const appTitle = skinMode === 'word95' ? 'Microsoft Word' : 'WordPad';
    os.setTitle(win.id, `${nm || 'Document'}${dirty ? '*' : ''} - ${appTitle}`, skinMode === 'word95' ? 'word95' : 'wordpad');
  }, [fileId, localFile, dirty, skinMode, win.id, os]);

  const inlineBlobImagesForStandaloneHtml = async (rawBodyHtml) => {
    if (!rawBodyHtml.includes('blob:')) return rawBodyHtml;
    const parsed = new DOMParser().parseFromString(rawBodyHtml, 'text/html');
    for (const im of [...parsed.body.querySelectorAll('img')]) {
      const src = im.getAttribute('src') || '';
      if (src.startsWith('blob:')) {
        try {
          const res = await fetch(src);
          const b = await res.blob();
          im.setAttribute('src', await blobToDataUrl(b));
        } catch { /* ignore */ }
      }
    }
    return parsed.body.innerHTML;
  };

  const serialize = async (targetFormat, docTitle = 'Document') => {
    const bodyHtml = ed.current?.innerHTML || '<p><br></p>';
    if (targetFormat === 'html') {
      const standaloneBody = await inlineBlobImagesForStandaloneHtml(bodyHtml);
      return { text: wrapStandaloneHtml(standaloneBody, docTitle), mime: 'text/html', ext: 'html' };
    }
    return { text: htmlToRtf(bodyHtml), mime: 'application/rtf', ext: 'rtf' };
  };

  const saveHtmlZipToPC = async () => {
    const s = st.current;
    const baseName = (s.localFile?.name || (s.fileId ? fs.get(s.fileId)?.name : '') || 'Document').replace(/\.\w+$/, '');
    try {
      const { packHtmlToZip } = await import('../utils/htmlZip.js');
      const { blob, imageCount } = await packHtmlToZip(ed.current?.innerHTML || '<p><br></p>', baseName);
      const res = await saveLocalFile({
        blob,
        suggestedName: `${baseName}.zip`,
        description: 'HTML + Images ZIP Package',
        ext: '.zip',
      });
      if (!res) return false;
      setLocalFile({ name: res.name, handle: null });
      setFileId(null);
      setFormat('zip');
      setDirty(false);
      os.msg({
        icon: 'info',
        title: 'WordPad HTML Package Saved',
        text: `Saved "${res.name}" with index.html and ${imageCount} image(s) inside images/.`,
      });
      return true;
    } catch (e) {
      os.msg({ icon: 'error', title: 'WordPad', text: 'Could not save HTML ZIP package: ' + e.message });
      return false;
    }
  };

  const saveHtmlZipToC = async () => {
    const s = st.current;
    const baseName = (s.fileId ? fs.get(s.fileId)?.name : s.localFile?.name || 'Document').replace(/\.\w+$/, '');
    const r = await os.fileDialog({
      mode: 'save',
      exts: ['zip'],
      name: `${baseName}.zip`,
      title: 'Save HTML Package (.zip) to Drive C:',
    });
    if (!r) return false;
    try {
      const { packHtmlToZip } = await import('../utils/htmlZip.js');
      const { blob } = await packHtmlToZip(ed.current?.innerHTML || '<p><br></p>', r.name.replace(/\.\w+$/, ''));
      const node = r.existing
        ? fs.write(r.existing.id, blob, 'application/zip')
        : fs.create({ name: r.name, parent: r.parent, data: blob, mime: 'application/zip' });
      setFileId(node.id);
      setLocalFile(null);
      setFormat('zip');
      setDirty(false);
      return true;
    } catch (e) {
      os.msg({ icon: 'error', title: 'WordPad', text: e.message });
      return false;
    }
  };

  const saveToC = async (as = false, forceExt = null) => {
    const s = st.current;
    if (forceExt === 'zip' || (!as && !forceExt && s.format === 'zip' && s.fileId && /\.zip$/i.test(fs.get(s.fileId)?.name || ''))) {
      return saveHtmlZipToC();
    }
    let id = s.fileId;
    try {
      let targetName = id && fs.get(id) ? fs.get(id).name : s.localFile?.name || `Document.${forceExt || (s.format === 'zip' ? 'html' : s.format)}`;
      if (forceExt) targetName = targetName.replace(/\.\w+$/, '') + '.' + forceExt;

      if (!id || as || !fs.get(id) || forceExt) {
        const r = await os.fileDialog({
          mode: 'save',
          exts: forceExt ? [forceExt] : ['rtf', 'html', 'htm', 'zip'],
          name: targetName,
          title: 'Save As (Drive C:)',
        });
        if (!r) return false;
        if (/\.zip$/i.test(r.name)) {
          const { packHtmlToZip } = await import('../utils/htmlZip.js');
          const { blob } = await packHtmlToZip(ed.current?.innerHTML || '<p><br></p>', r.name.replace(/\.\w+$/, ''));
          id = r.existing ? fs.write(r.existing.id, blob, 'application/zip').id : fs.create({ name: r.name, parent: r.parent, data: blob, mime: 'application/zip' }).id;
          setFormat('zip');
        } else {
          const chosenFmt = /\.html?$/i.test(r.name) ? 'html' : 'rtf';
          const { text, mime } = await serialize(chosenFmt, r.name);
          id = r.existing ? fs.write(r.existing.id, text, mime).id : fs.create({ name: r.name, parent: r.parent, data: text, mime }).id;
          setFormat(chosenFmt);
        }
      } else {
        const curName = fs.get(id).name;
        const chosenFmt = /\.html?$/i.test(curName) ? 'html' : 'rtf';
        const { text, mime } = await serialize(chosenFmt, curName);
        fs.write(id, text, mime);
        setFormat(chosenFmt);
      }
    } catch (e) {
      os.msg({ icon: 'error', title: 'WordPad', text: e.message });
      return false;
    }
    setFileId(id); setLocalFile(null); setDirty(false);
    st.current.dirty = false; st.current.fileId = id; st.current.localFile = null;
    return true;
  };

  const saveToLocalPC = async (forceDialog = false, forceExt = null) => {
    const s = st.current;
    if (forceExt === 'zip' || (!forceDialog && !forceExt && s.format === 'zip')) {
      return saveHtmlZipToPC();
    }
    let suggested = s.localFile?.name || (s.fileId ? fs.get(s.fileId)?.name : null) || `Document.${forceExt || s.format}`;
    if (forceExt) suggested = suggested.replace(/\.\w+$/, '') + '.' + forceExt;
    const chosenFmt = forceExt ? (forceExt === 'html' ? 'html' : 'rtf') : /\.html?$/i.test(suggested) ? 'html' : s.format === 'html' ? 'html' : 'rtf';
    const { text, mime } = await serialize(chosenFmt, suggested);
    try {
      const res = await saveLocalFile({
        data: text,
        name: suggested,
        mime,
        handle: forceDialog || forceExt ? null : s.localFile?.handle,
        types: DOC_TYPES,
        forceDialog: forceDialog || !!forceExt,
      });
      if (!res) return false;
      const actualFmt = /\.html?$/i.test(res.name) ? 'html' : 'rtf';
      const nextLocal = { name: res.name, handle: res.handle || (!forceExt ? s.localFile?.handle : null) || null };
      setLocalFile(nextLocal);
      setFormat(actualFmt);
      setDirty(false);
      st.current.dirty = false;
      st.current.localFile = nextLocal;
      return true;
    } catch (e) {
      os.msg({ icon: 'error', title: 'WordPad', text: 'Could not save to computer: ' + e.message });
      return false;
    }
  };

  const save = async (as = false) => {
    if (st.current.localFile && !st.current.fileId) return saveToLocalPC(as);
    return saveToC(as);
  };

  const confirmDiscard = async () => {
    if (!st.current.dirty) return true;
    const nm = st.current.fileId ? fs.get(st.current.fileId)?.name : st.current.localFile?.name || 'Document';
    const r = await os.msg({
      title: 'WordPad',
      icon: 'question',
      text: `Save changes to ${nm}?`,
      buttons: ['Yes', 'No', 'Cancel'],
    });
    if (r === 'Cancel') return false;
    if (r === 'Yes') return save(false);
    return true;
  };
  useEffect(() => { os.setGuard(win.id, confirmDiscard); return () => os.setGuard(win.id, null); }, []); // eslint-disable-line

  const newDoc = async () => {
    if (!(await confirmDiscard())) return;
    if (ed.current) {
      ed.current.innerHTML = '<p><br></p>';
      ed.current.style.paddingLeft = '';
      ed.current.style.paddingRight = '';
    }
    setRulerLeft(0); setRulerRight(0); setBlockStyle('p');
    setFileId(null); setLocalFile(null); setFormat('rtf'); setDirty(false); updateWordCount();
  };

  const openFromC = async () => {
    if (!(await confirmDiscard())) return;
    const n = await os.fileDialog({ mode: 'open', exts: ['rtf', 'html', 'htm', 'zip', 'txt', 'md'], title: 'Open from Drive C:' });
    if (n) {
      try {
        await loadFromBlob(fs.toBlob(n), n.name);
        setFileId(n.id);
        setLocalFile(null);
      } catch (e) {
        os.msg({ icon: 'error', title: 'WordPad', text: e.message });
      }
    }
  };

  const openFromPC = async () => {
    if (!(await confirmDiscard())) return;
    const picked = await pickLocalFiles({ accept: '.rtf,.html,.htm,.zip,.txt,.md', types: DOC_TYPES });
    if (!picked) return;
    try {
      await loadFromBlob(picked.file, picked.name);
      setFileId(null);
      setLocalFile({ name: picked.name, handle: picked.handle || null });
    } catch (e) {
      os.msg({ icon: 'error', title: 'WordPad', text: 'Cannot read file: ' + e.message });
    }
  };

  const onDropFile = async (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    e.preventDefault();
    if (!(await confirmDiscard())) return;
    try {
      await loadFromBlob(f, f.name);
      setFileId(null);
      setLocalFile({ name: f.name, handle: null });
    } catch (err) {
      os.msg({ icon: 'error', title: 'WordPad', text: err.message });
    }
  };

  const exec = (cmd, val = null, useSavedRange = false) => {
    if (useSavedRange) restoreSelection();
    else ed.current?.focus();

    try {
      document.execCommand('styleWithCSS', false, true);
    } catch { /* ignore */ }

    let ok = document.execCommand(cmd, false, val);
    if (!ok && cmd === 'hiliteColor') {
      ok = document.execCommand('backColor', false, val);
    }
    captureSelection();
    setDirty(true);
    updateWordCount();
  };

  const applyHighlight = (hexOrTransparent) => {
    if (hexOrTransparent !== 'transparent') setBgColor(hexOrTransparent);
    exec('hiliteColor', hexOrTransparent, true);
  };

  const insertImageFromPC = async () => {
    const picked = await pickLocalFiles({ accept: 'image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp' });
    if (!picked?.file) return;
    try {
      const dataUrl = await blobToDataUrl(picked.file);
      restoreSelection();
      const safeName = picked.name.replace(/"/g, '');
      exec('insertHTML', `<img src="${dataUrl}" alt="${safeName}" data-filename="${safeName}" style="max-width:100%;height:auto;" />`, true);
    } catch (e) {
      os.msg({ icon: 'error', title: 'Insert Picture', text: e.message });
    }
  };

  const insertImageFromC = async () => {
    const n = await os.fileDialog({ mode: 'open', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'], title: 'Insert Image (Drive C:)' });
    if (!n) return;
    try {
      const dataUrl = await blobToDataUrl(fs.toBlob(n));
      restoreSelection();
      const safeName = n.name.replace(/"/g, '');
      exec('insertHTML', `<img src="${dataUrl}" alt="${safeName}" data-filename="${safeName}" style="max-width:100%;height:auto;" />`, true);
    } catch (e) {
      os.msg({ icon: 'error', title: 'Insert Picture', text: e.message });
    }
  };

  const insertDateTime = () => {
    exec('insertText', new Date().toLocaleString());
  };

  const findText = async () => {
    const q = await os.prompt({ title: 'Find', label: 'Find what:', value: lastFind.current });
    if (!q) return;
    lastFind.current = q;
    ed.current?.focus();
    if (!window.find(q, false, false, true)) {
      os.msg({ icon: 'info', title: 'WordPad', text: `WordPad has finished searching the document.\n"${q}" was not found.` });
    }
  };

  // --- SmartTransfer Helpers ---
  const docName = () => {
    const s = st.current;
    return (s.fileId ? fs.get(s.fileId)?.name : s.localFile?.name) || 'Document';
  };

  const hasDocText = () => !!(ed.current?.innerText?.trim());
  const hasDocImages = () => !!(ed.current?.querySelector('img'));
  const hasDocContent = () => hasDocText() || hasDocImages();

  const getSelectionOrFull = () => {
    const el = ed.current;
    if (!el) return { text: '', html: '', hasSelection: false };
    const sel = window.getSelection();
    let rng = null;
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      rng = sel.getRangeAt(0);
    } else if (savedRange.current && !savedRange.current.collapsed && el.contains(savedRange.current.commonAncestorContainer)) {
      rng = savedRange.current;
    }
    if (rng) {
      const box = document.createElement('div');
      box.appendChild(rng.cloneContents());
      return { text: rng.toString(), html: box.innerHTML, hasSelection: true };
    }
    return {
      text: (el.innerText || '').replace(/\r?\n/g, '\n'),
      html: el.innerHTML || '',
      hasSelection: false,
    };
  };

  const pickWordPadImageBlob = async () => {
    const el = ed.current;
    if (!el) return null;
    const imgs = [...el.querySelectorAll('img')];
    if (!imgs.length) {
      os.msg({ icon: 'info', title: 'Smart Send', text: 'There are no images in this document.' });
      return null;
    }
    let targetImg = null;
    if (selectedImgRef.current && el.contains(selectedImgRef.current)) {
      targetImg = selectedImgRef.current;
    } else if (imgs.length === 1) {
      targetImg = imgs[0];
    } else {
      const candidates = imgs.map((im, idx) => ({
        imgEl: im,
        previewSrc: im.src,
        label: im.getAttribute('data-filename') || im.getAttribute('alt') || `Image ${idx + 1}`,
        dims: im.naturalWidth ? `${im.naturalWidth}×${im.naturalHeight}` : '',
      }));
      const picked = await pickImageDialog(os, candidates, 'Select Image from WordPad');
      targetImg = picked?.imgEl || null;
    }
    if (!targetImg) return null;
    const blob = await SmartTransfer.imageSrcToBlob(targetImg.currentSrc || targetImg.src);
    if (!blob) {
      os.msg({ icon: 'error', title: 'Smart Send', text: 'Could not read image data.' });
      return null;
    }
    const label = targetImg.getAttribute('data-filename') || targetImg.getAttribute('alt') || 'WordPad Image';
    return { blob, title: label };
  };

  const receiveTransfer = useCallback(async (transfer, action = 'open') => {
    if (!transfer || !ed.current) return false;
    const el = ed.current;
    const isImg = transfer.contentType?.startsWith('image/');
    let mode = action;

    if (mode === 'open' && hasDocContent()) {
      const choice = await receiveConflictDialog(os, {
        targetApp: 'wordpad',
        sourceName: SmartTransfer.APP_NAMES[transfer.sourceApp] || transfer.sourceApp,
        title: transfer.title,
        isImage: isImg,
      });
      if (!choice || choice === 'cancel') return false;
      mode = choice; // 'replace' | 'insert' | 'append'
    } else if (mode === 'open') {
      mode = 'replace';
    }

    let htmlChunk = '';
    if (isImg) {
      const blob = transfer.payload instanceof Blob
        ? transfer.payload
        : await SmartTransfer.imageSrcToBlob(String(transfer.payload || ''));
      if (!blob) {
        os.msg({ icon: 'error', title: 'WordPad', text: 'Could not load received image.' });
        return false;
      }
      const url = regBlob(blob);
      const safeName = (transfer.title || 'image.png').replace(/"/g, '');
      htmlChunk = `<p><img src="${url}" alt="${safeName}" data-filename="${safeName}" style="max-width:100%;height:auto;" /></p>`;
    } else if (transfer.contentType === 'text/html') {
      htmlChunk = sanitizeHtmlForEditor(String(transfer.payload || ''));
    } else {
      htmlChunk = SmartTransfer.plainTextToEditableHtml(String(transfer.payload || ''));
    }

    if (mode === 'replace') {
      el.innerHTML = htmlChunk || '<p><br></p>';
      setFormat(transfer.contentType === 'text/html' ? 'html' : st.current.format);
      setDirty(true);
      updateWordCount();
      return true;
    }

    if (mode === 'append') {
      if (el.innerHTML.trim() === '<p><br></p>' || !hasDocContent()) {
        el.innerHTML = htmlChunk || '<p><br></p>';
      } else {
        el.insertAdjacentHTML('beforeend', htmlChunk);
      }
      setDirty(true);
      updateWordCount();
      return true;
    }

    // mode === 'insert'
    if (savedRange.current && el.contains(savedRange.current.commonAncestorContainer)) {
      restoreSelection();
      document.execCommand('insertHTML', false, htmlChunk);
      captureSelection();
    } else {
      el.insertAdjacentHTML('beforeend', htmlChunk);
    }
    setDirty(true);
    updateWordCount();
    return true;
  }, [os]); // eslint-disable-line

  const receiveTransferRef = useRef(receiveTransfer);
  receiveTransferRef.current = receiveTransfer;

  useEffect(() => {
    return SmartTransfer.registerApp('wordpad', win.id, {
      getCapability: () => ({
        hasText: hasDocText(),
        hasHtml: hasDocContent(),
        hasImage: hasDocImages(),
        hasContent: hasDocContent(),
      }),
      pullFor: async (targetApp, kind) => {
        if (kind === 'image' || targetApp === 'paint') {
          const im = await pickWordPadImageBlob();
          return im ? { contentType: im.blob.type || 'image/png', payload: im.blob, title: im.title } : null;
        }
        const { text, html } = getSelectionOrFull();
        if (targetApp === 'browser' && html) {
          return { contentType: 'text/html', payload: html, title: docName() };
        }
        return text.trim() ? { contentType: 'text/plain', payload: text, title: docName() } : null;
      },
      receiveTransfer: async (t, act) => receiveTransferRef.current?.(t, act),
    });
  }, [win.id]); // eslint-disable-line

  const sendToNotepadTxt = async () => {
    const { text } = getSelectionOrFull();
    if (!text.trim()) {
      os.msg({ icon: 'info', title: 'Smart Send', text: 'There is no text to send.' });
      return;
    }
    await SmartTransfer.send({
      sourceApp: 'wordpad',
      targetApp: 'notepad',
      contentType: 'text/plain',
      payload: text,
      title: docName().replace(/\.\w+$/, '') + '.txt',
    });
  };

  const sendToNotepadHtml = async () => {
    const { html, hasSelection } = getSelectionOrFull();
    const cleaned = (html || '').trim();
    if (!cleaned || cleaned === '<p><br></p>') {
      os.msg({ icon: 'info', title: 'Smart Send', text: 'Document is empty.' });
      return;
    }
    const base = docName().replace(/\.\w+$/, '');
    const htmlPayload = hasSelection
      ? cleaned
      : wrapStandaloneHtml(await inlineBlobImagesForStandaloneHtml(cleaned), base);
    await SmartTransfer.send({
      sourceApp: 'wordpad',
      targetApp: 'notepad',
      contentType: 'text/html',
      payload: htmlPayload,
      title: `${base}.html`,
      meta: { syntaxHighlight: true, asSource: true },
    });
  };

  const sendToPaint = async () => {
    const picked = await pickWordPadImageBlob();
    if (!picked) return;
    await SmartTransfer.send({
      sourceApp: 'wordpad',
      targetApp: 'paint',
      contentType: picked.blob.type || 'image/png',
      payload: picked.blob,
      title: picked.title,
    });
  };

  const pullFrom = async (sourceApp, kind = 'any') => {
    try {
      const t = await SmartTransfer.pull({ sourceApp, targetApp: 'wordpad', kind });
      if (!t) {
        os.msg({ icon: 'info', title: 'WordPad', text: `No content available from ${SmartTransfer.APP_NAMES[sourceApp]}.` });
        return;
      }
      await receiveTransfer(t, 'open');
    } catch (e) {
      os.msg({ icon: 'error', title: 'WordPad', text: e.message });
    }
  };

  const pasteClipboard = async () => {
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const imgType = it.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const b = await it.getType(imgType);
            const url = regBlob(b);
            exec('insertHTML', `<p><img src="${url}" alt="pasted.png" style="max-width:100%;height:auto;" /></p>`, true);
            return;
          }
          if (it.types.includes('text/html')) {
            const html = sanitizeHtmlForEditor(await (await it.getType('text/html')).text());
            exec('insertHTML', html, true);
            return;
          }
        }
      }
      const txt = await navigator.clipboard.readText();
      if (txt) exec('insertText', txt, true);
    } catch {
      os.msg({ icon: 'info', title: 'WordPad', text: 'Clipboard access was blocked by the browser. Use Ctrl+V to paste.' });
    }
  };

  const editorContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const clickedImg = e.target?.closest?.('img');
    if (clickedImg) selectedImgRef.current = clickedImg;
    captureSelection();
    const sel = window.getSelection();
    const hasSel = !!(sel && sel.rangeCount > 0 && !sel.isCollapsed && ed.current?.contains(sel.getRangeAt(0).commonAncestorContainer));

    const items = [
      { label: 'Cu&t', disabled: !hasSel, onClick: () => exec('cut', null, true) },
      { label: '&Copy', disabled: !hasSel && !clickedImg, onClick: () => (hasSel ? exec('copy', null, true) : null) },
      { label: '&Paste', onClick: pasteClipboard },
      { label: 'C&lear', disabled: !hasSel, onClick: () => exec('delete', null, true) },
      { sep: true },
      { label: 'Select &All', onClick: () => exec('selectAll') },
      { sep: true },
      {
        label: 'F&ormat',
        sub: [
          { label: '&Bold', onClick: () => exec('bold', null, true) },
          { label: '&Italic', onClick: () => exec('italic', null, true) },
          { label: '&Underline', onClick: () => exec('underline', null, true) },
          { sep: true },
          { label: 'B&ullet Style', onClick: () => exec('insertUnorderedList', null, true) },
          { label: 'Align &Left', onClick: () => exec('justifyLeft', null, true) },
          { label: 'Align &Center', onClick: () => exec('justifyCenter', null, true) },
          { label: 'Align &Right', onClick: () => exec('justifyRight', null, true) },
        ],
      },
      { label: 'B&ullet Style', onClick: () => exec('insertUnorderedList', null, true) },
      { sep: true },
      { label: voice.listening ? '⏸️ &Voice Dictation: Stop' : '🎙️ &Voice Dictation: Start', onClick: () => voice.toggle() },
      {
        label: 'Voice &Language',
        sub: VOICE_LANGUAGES.map((l) => ({
          label: l.label,
          radio: true,
          checked: voice.lang === l.id,
          onClick: () => voice.changeLang(l.id),
        })),
      },
    ];
    if (clickedImg) {
      items.push({ sep: true }, { label: 'Send Image to &Paint', onClick: sendToPaint });
    }
    os.showMenu(e.clientX, e.clientY, items);
  };

  useEffect(() => {
    if (!active) return;
    const h = (e) => {
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(false); }
      else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveToLocalPC(true); }
      else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openFromPC(); }
      else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openFromC(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); newDoc(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); findText(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const menus = [
    { label: '&File', items: [
      { label: '&New', shortcut: 'Ctrl+N', onClick: newDoc },
      { label: '&Open (Drive C:)...', shortcut: 'Ctrl+O', onClick: openFromC },
      { label: 'Open from &Local PC (RTF / HTML / ZIP)...', shortcut: 'Ctrl+Shift+O', onClick: openFromPC },
      { sep: true },
      { label: '&Save', shortcut: 'Ctrl+S', onClick: () => save(false) },
      { label: 'Save &As (Drive C:)...', onClick: () => saveToC(true) },
      { label: 'Save to Local &PC...', shortcut: 'Ctrl+Shift+S', onClick: () => saveToLocalPC(false) },
      { sep: true },
      { label: 'Export as &RTF (.rtf) to PC...', onClick: () => saveToLocalPC(true, 'rtf') },
      { label: 'Export as &HTML (.html) to PC...', onClick: () => saveToLocalPC(true, 'html') },
      { label: 'Export as HTML (.html) to &C:\\...', onClick: () => saveToC(true, 'html') },
      { label: 'Export HTML + Images &ZIP (.zip) to PC...', onClick: saveHtmlZipToPC },
      { label: 'Export HTML + Images ZIP (.zip) to C:\\...', onClick: saveHtmlZipToC },
      { sep: true },
      { label: '&Page Margins Preset', sub: [
        { label: 'Default (0 px)', onClick: () => applyDocMarginPreset(0) },
        { label: 'Narrow (24 px)', onClick: () => applyDocMarginPreset(24) },
        { label: 'Standard Letter (48 px)', onClick: () => applyDocMarginPreset(48) },
        { label: 'Wide Quote (80 px)', onClick: () => applyDocMarginPreset(80) },
      ] },
      { label: 'Print...', onClick: printDocument },
      { sep: true },
      { label: 'E&xit', onClick: () => os.close(win.id) },
    ] },
    { label: '&Edit', items: [
      { label: '&Undo', shortcut: 'Ctrl+Z', onClick: () => exec('undo') },
      { label: '&Redo', shortcut: 'Ctrl+Y', onClick: () => exec('redo') },
      { sep: true },
      { label: 'Cu&t', shortcut: 'Ctrl+X', onClick: () => exec('cut') },
      { label: '&Copy', shortcut: 'Ctrl+C', onClick: () => exec('copy') },
      { label: 'Select &All', shortcut: 'Ctrl+A', onClick: () => exec('selectAll') },
      { sep: true },
      { label: '&Find...', shortcut: 'Ctrl+F', onClick: findText },
    ] },
    { label: '&View', items: [
      { label: '&Toolbar', checked: showToolbar, onClick: () => setShowToolbar(!showToolbar) },
      { label: '&Format Bar', checked: showFormatBar, onClick: () => setShowFormatBar(!showFormatBar) },
      { label: '&Ruler', checked: showRuler, onClick: () => setShowRuler(!showRuler) },
      { sep: true },
      { label: '&Word 95 Skin Mode', checked: skinMode === 'word95', onClick: () => setSkinMode((m) => (m === 'word95' ? 'wordpad' : 'word95')) },
      ...(skinMode === 'word95'
        ? [
          { label: '&Page Layout View', radio: true, checked: word95View === 'page', onClick: () => setWord95View('page') },
          { label: '&Normal View', radio: true, checked: word95View === 'normal', onClick: () => setWord95View('normal') },
          { label: 'Show/Hide ¶ &Marks', checked: showMarks, onClick: () => setShowMarks((v) => !v) },
        ]
        : []),
    ] },
    { label: '&Insert', items: [
      { label: '&Picture from PC...', onClick: insertImageFromPC },
      { label: 'Picture from Drive &C:...', onClick: insertImageFromC },
      { sep: true },
      { label: '&Table...', onClick: insertTable },
      { label: '&Date and Time', onClick: insertDateTime },
      { label: '&Horizontal Rule', onClick: () => exec('insertHorizontalRule') },
    ] },
    { label: 'F&ormat', items: [
      { label: '&Bold', onClick: () => exec('bold') },
      { label: '&Italic', onClick: () => exec('italic') },
      { label: '&Underline', onClick: () => exec('underline') },
      { label: 'Format &Painter', checked: !!painterFmt, onClick: toggleFormatPainter },
      { sep: true },
      { label: 'Clear &Highlight Background', onClick: () => applyHighlight('transparent') },
      { sep: true },
      { label: 'Bullet &Style', onClick: () => exec('insertUnorderedList') },
      { label: '&Numbered List', onClick: () => exec('insertOrderedList') },
      { label: '&Increase Indent', onClick: () => adjustIndent(24) },
      { label: '&Decrease Indent', onClick: () => adjustIndent(-24) },
      { label: '&Reset Paragraph Margins', onClick: resetCurrentMargins },
      { sep: true },
      { label: 'Align &Left', onClick: () => exec('justifyLeft') },
      { label: 'Align &Center', onClick: () => exec('justifyCenter') },
      { label: 'Align &Right', onClick: () => exec('justifyRight') },
      { label: '&Justify', onClick: () => exec('justifyFull') },
    ] },
    { label: '&Send', items: () => [
      { label: 'Send to &Notepad as TXT', disabled: !hasDocText(), onClick: sendToNotepadTxt },
      { label: 'Send to Notepad as &HTML (Syntax Highlight ON)', disabled: !hasDocContent(), onClick: sendToNotepadHtml },
      { label: 'Send to &Paint (selected image)', disabled: !hasDocImages(), onClick: sendToPaint },
      { sep: true },
      { label: 'Get from &Paint', disabled: !SmartTransfer.canPull('paint', 'image'), onClick: () => pullFrom('paint', 'image') },
      { label: 'Get from &Internet Explorer', disabled: !SmartTransfer.canPull('browser'), onClick: () => pullFrom('browser', 'any') },
      { label: 'Get from &Notepad', disabled: !SmartTransfer.canPull('notepad'), onClick: () => pullFrom('notepad', 'any') },
      { sep: true },
      { label: 'Transfer &History & Cache...', onClick: () => openTransferHistoryDialog(os) },
    ] },
    { label: '&Help', items: [
      { label: '&Help Topics', onClick: () => os.open('help') },
      { sep: true },
      { label: skinMode === 'word95' ? '&About Microsoft Word 95' : '&About WordPad', onClick: () => os.msg({ icon: 'info', title: skinMode === 'word95' ? 'About Microsoft Word' : 'About WordPad', text: `${skinMode === 'word95' ? 'Microsoft Word for Windows 95 Skin Mode' : 'WordPad'}\nWindows 95 Smart Edition\nRich Text (.rtf), HTML (.html), HTML+Images ZIP (.zip), Interactive Margin Ruler, and Smart Office Transfer.` }) },
    ] },
  ];

  const sourceLabel = fileId ? fs.pathOf(fileId) : localFile ? `Local PC: ${localFile.name}${localFile.handle ? ' (Direct Write)' : ''}` : 'New Document';

  const isW95 = skinMode === 'word95';
  const appCls = `app wp-app${isW95 ? ` wp-word95 wp-view-${word95View}` : ''}`;

  return (
    <div className={appCls} onDragOver={(e) => e.preventDefault()} onDrop={onDropFile}>
      <MenuBar menus={menus} />
      {showToolbar && (
        <div className="toolbar">
          {isW95 && <span className="wp-grip" />}
          <button className="btn tool" title="New" onClick={newDoc}><WpIcon name="new" /></button>
          <button className="btn tool" title="Open from Drive C:" onClick={openFromC}><WpIcon name="open-c" /></button>
          <button className="btn tool" title="Open RTF/HTML/ZIP from Local PC" onClick={openFromPC}><WpIcon name="open-pc" /></button>
          <button className="btn tool" title="Save" onClick={() => save(false)}><WpIcon name="save" /></button>
          <button className="btn tool" title="Save to Local PC" onClick={() => saveToLocalPC(false)}><WpIcon name="save-pc" /></button>
          {isW95 && (
            <>
              <button className="btn tool" title="Print" onClick={printDocument}><WpIcon name="print" /></button>
              <span className="tb-div" />
              <button className="btn tool" title="Cut" onMouseDown={(e) => { e.preventDefault(); exec('cut'); }}><WpIcon name="cut" /></button>
              <button className="btn tool" title="Copy" onMouseDown={(e) => { e.preventDefault(); exec('copy'); }}><WpIcon name="copy" /></button>
              <button className="btn tool" title="Paste" onMouseDown={(e) => { e.preventDefault(); captureSelection(); }} onClick={pasteClipboard}><WpIcon name="paste" /></button>
              <button className={'btn tool ' + (painterFmt ? 'pressed' : '')} title="Format Painter (copy & apply selection formatting)" onMouseDown={(e) => { e.preventDefault(); captureSelection(); }} onClick={toggleFormatPainter}><WpIcon name="format-painter" /></button>
              <span className="tb-div" />
              <button className="btn tool" title="Undo" onClick={() => exec('undo')}><WpIcon name="undo" /></button>
              <button className="btn tool" title="Redo" onClick={() => exec('redo')}><WpIcon name="redo" /></button>
            </>
          )}
          <span className="tb-div" />
          <button className="btn tool" title="Insert Picture from PC" onClick={insertImageFromPC}><WpIcon name="image" /></button>
          {isW95 && <button className="btn tool" title="Insert Table" onMouseDown={(e) => { e.preventDefault(); captureSelection(); }} onClick={insertTable}><WpIcon name="table" /></button>}
          <button className="btn tool" title="Export RTF" onClick={() => saveToLocalPC(true, 'rtf')}><WpIcon name="rtf" /></button>
          <button className="btn tool" title="Export HTML" onClick={() => saveToLocalPC(true, 'html')}><WpIcon name="html" /></button>
          <button className="btn tool" title="Export HTML + images/ folder (.zip)" onClick={saveHtmlZipToPC}><WpIcon name="zip" /></button>
          <span className="tb-div" />
          {!isW95 && <button className="btn tool" title="Undo" onClick={() => exec('undo')}><WpIcon name="undo" /></button>}
          <button className="btn tool" title="Find" onClick={findText}><WpIcon name="find" /></button>
          <button className="btn tool" title="Insert Date/Time" onClick={insertDateTime}><WpIcon name="date" /></button>
          {isW95 && (
            <>
              <button
                className={'btn tool ' + (showMarks ? 'pressed' : '')}
                title="Show/Hide Paragraph Marks (¶)"
                onClick={() => setShowMarks((v) => !v)}
              >
                <WpIcon name="pilcrow" />
              </button>
              <select
                className="field"
                style={{ height: 22, padding: '0 3px', width: 54 }}
                title="Zoom"
                value={zoomPct}
                onChange={(e) => setZoomPct(Number(e.target.value))}
              >
                {[75, 100, 125, 150].map((z) => (
                  <option key={z} value={z}>{z}%</option>
                ))}
              </select>
            </>
          )}
          <span className="tb-div" />
          <button
            className={'btn tool ' + (voice.listening ? 'pressed' : '')}
            title={voice.listening ? 'Pause Voice Dictation' : 'Start Voice Dictation'}
            onMouseDown={(e) => { e.preventDefault(); captureSelection(); }}
            onClick={voice.toggle}
          >
            <WpIcon name={voice.listening ? 'mic-pause' : 'mic'} />
          </button>
          <select
            className="field"
            style={{ height: 22, padding: '0 4px', maxWidth: 118 }}
            title="Voice Dictation Language"
            value={voice.lang}
            onChange={(e) => voice.changeLang(e.target.value)}
          >
            {VOICE_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          <span className="tb-div" />
          <button
            className={'btn tool ' + (isW95 ? 'pressed' : '')}
            title={isW95 ? 'Switch to WordPad 95 Skin' : 'Switch to Microsoft Word 95 Skin Mode'}
            onClick={() => setSkinMode((m) => (m === 'word95' ? 'wordpad' : 'word95'))}
          >
            <WpIcon name="word95" />
          </button>
        </div>
      )}
      {showFormatBar && (
        <div className="toolbar">
          {isW95 && (
            <>
              <span className="wp-grip" />
              <select
                className="field"
                style={{ height: 22, padding: '0 3px', width: 88 }}
                title="Paragraph Style"
                value={blockStyle}
                onChange={(e) => {
                  const tag = e.target.value;
                  setBlockStyle(tag);
                  exec('formatBlock', `<${tag}>`, true);
                }}
              >
                <option value="p">Normal</option>
                <option value="h1">Heading 1</option>
                <option value="h2">Heading 2</option>
                <option value="h3">Heading 3</option>
                <option value="blockquote">Quote</option>
              </select>
            </>
          )}
          <select className="field" style={{ height: 22, padding: '0 4px' }} value={font} onChange={(e) => { setFont(e.target.value); exec('fontName', e.target.value, true); }}>
            {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className="field" style={{ height: 22, padding: '0 4px', width: 52 }} value={fontSize} onChange={(e) => { setFontSize(e.target.value); exec('fontSize', e.target.value, true); }}>
            {SIZES.map(([val, pt]) => <option key={val} value={val}>{pt} pt</option>)}
          </select>
          <span className="tb-div" />
          <button className={'btn tool ' + (fmtState.b ? 'pressed' : '')} title="Bold" onMouseDown={(e) => { e.preventDefault(); exec('bold'); }}><WpIcon name="bold" /></button>
          <button className={'btn tool ' + (fmtState.i ? 'pressed' : '')} title="Italic" onMouseDown={(e) => { e.preventDefault(); exec('italic'); }}><WpIcon name="italic" /></button>
          <button className={'btn tool ' + (fmtState.u ? 'pressed' : '')} title="Underline" onMouseDown={(e) => { e.preventDefault(); exec('underline'); }}><WpIcon name="underline" /></button>
          <label className="btn tool" title="Selected Text Color" onPointerDown={captureSelection} style={{ position: 'relative' }}>
            <WpIcon name="color" color={color} />
            <input type="color" value={color} onChange={(e) => { setColor(e.target.value); exec('foreColor', e.target.value, true); }} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }} />
          </label>
          <label className="btn tool" title="Selected Text Background / Highlight Color" onPointerDown={captureSelection} style={{ position: 'relative' }}>
            <WpIcon name="highlight" bgColor={bgColor} />
            <input type="color" value={bgColor} onChange={(e) => applyHighlight(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }} />
          </label>
          <button className="btn tool" title="Clear Highlight Background" onMouseDown={(e) => { e.preventDefault(); applyHighlight('transparent'); }}><WpIcon name="clear-highlight" /></button>
          <span className="tb-div" />
          <button className={'btn tool ' + (fmtState.align === 'left' ? 'pressed' : '')} title="Align Left" onMouseDown={(e) => { e.preventDefault(); exec('justifyLeft'); }}><WpIcon name="align-left" /></button>
          <button className={'btn tool ' + (fmtState.align === 'center' ? 'pressed' : '')} title="Center" onMouseDown={(e) => { e.preventDefault(); exec('justifyCenter'); }}><WpIcon name="align-center" /></button>
          <button className={'btn tool ' + (fmtState.align === 'right' ? 'pressed' : '')} title="Align Right" onMouseDown={(e) => { e.preventDefault(); exec('justifyRight'); }}><WpIcon name="align-right" /></button>
          {isW95 && <button className={'btn tool ' + (fmtState.align === 'full' ? 'pressed' : '')} title="Justify" onMouseDown={(e) => { e.preventDefault(); exec('justifyFull'); }}><WpIcon name="align-justify" /></button>}
          <button className={'btn tool ' + (fmtState.ul ? 'pressed' : '')} title="Bullets" onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }}><WpIcon name="bullets" /></button>
          {isW95 && (
            <>
              <button className={'btn tool ' + (fmtState.ol ? 'pressed' : '')} title="Numbering" onMouseDown={(e) => { e.preventDefault(); exec('insertOrderedList'); }}><WpIcon name="numbers" /></button>
              <button className="btn tool" title="Decrease Indent" onMouseDown={(e) => { e.preventDefault(); adjustIndent(-24); }}><WpIcon name="outdent" /></button>
              <button className="btn tool" title="Increase Indent" onMouseDown={(e) => { e.preventDefault(); adjustIndent(24); }}><WpIcon name="indent" /></button>
              <button className={'btn tool ' + (fmtState.border ? 'pressed' : '')} title="Toggle Paragraph Border" onMouseDown={(e) => { e.preventDefault(); toggleParagraphBorder(); }}><WpIcon name="border" /></button>
            </>
          )}
        </div>
      )}
      {showRuler && (
        <div className="wp-ruler-bar" onDoubleClick={resetCurrentMargins} title="Drag Left / Right margin markers to adjust paragraph L/R margins (double-click to reset)">
          {isW95 && (
            <button
              type="button"
              className="wp-ruler-corner"
              title="Reset Paragraph Margins (0px)"
              onClick={resetCurrentMargins}
            >
              L
            </button>
          )}
          <div className="wp-ruler-inner">
            <div className="wp-ruler-track" ref={rulerTrackRef}>
              <div className="wp-ruler-shade l" style={{ width: rulerLeft }} />
              <div className="wp-ruler-shade r" style={{ width: rulerRight }} />
              <div className="wp-ruler-ticks">
                <div className="wp-ruler-nums">
                  {[1, 2, 3, 4, 5, 6, 7].map((inch) => (
                    <span key={inch} className="wp-ruler-num" style={{ left: inch * 96 }}>
                      {inch}
                    </span>
                  ))}
                </div>
              </div>
              <div
                className="wp-rmark l"
                style={{ left: rulerLeft }}
                title={`Left Paragraph Margin: ${rulerLeft}px (drag to adjust)`}
                onPointerDown={(e) => startRulerDrag('l', e)}
              >
                <svg viewBox="0 0 11 18" aria-hidden="true">
                  <polygon points="1,1 10,1 10,5 5.5,9 1,5" fill="#dfdfdf" stroke="#000" strokeWidth="1" />
                  <polygon points="5.5,9 10,13 10,15 1,15 1,13" fill="#dfdfdf" stroke="#000" strokeWidth="1" />
                  <rect x="2" y="15" width="7" height="2" fill="#c0c0c0" stroke="#000" strokeWidth="1" />
                </svg>
              </div>
              <div
                className="wp-rmark r"
                style={{ right: rulerRight }}
                title={`Right Paragraph Margin: ${rulerRight}px (drag to adjust)`}
                onPointerDown={(e) => startRulerDrag('r', e)}
              >
                <svg viewBox="0 0 11 18" aria-hidden="true">
                  <polygon points="5.5,9 10,14 10,17 1,17 1,14" fill="#dfdfdf" stroke="#000" strokeWidth="1" />
                </svg>
              </div>
            </div>
          </div>
          {rulerDrag && (
            <div className="wp-ruler-tip" style={{ left: rulerDrag.x + 10, top: rulerDrag.y - 22 }}>
              {rulerDrag.side === 'l' ? 'Left' : 'Right'} Margin: {rulerDrag.px}px
            </div>
          )}
        </div>
      )}
      <div className="field wp-scroll">
        <div
          ref={ed}
          className={`wp-page${showMarks ? ' wp-show-marks' : ''}${painterFmt ? ' wp-painter-active' : ''}`}
          style={{ zoom: isW95 && zoomPct !== 100 ? zoomPct / 100 : undefined }}
          contentEditable
          suppressContentEditableWarning
          onPointerDown={(e) => {
            const im = e.target?.closest?.('img');
            if (im) selectedImgRef.current = im;
          }}
          onInput={() => { setDirty(true); updateWordCount(); captureSelection(); }}
          onKeyUp={captureSelection}
          onMouseUp={() => { applyPainterFormatIfArmed(); captureSelection(); }}
          onFocus={syncFromCaret}
          onContextMenu={editorContextMenu}
        />
      </div>
      <StatusBar>
        {isW95 ? (
          <>
            <span>
              <span className="wp-stat-views">
                <button
                  type="button"
                  className={'wp-stat-vbtn ' + (word95View === 'normal' ? 'on' : '')}
                  title="Normal View"
                  onClick={() => setWord95View('normal')}
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <rect x="1" y="2" width="10" height="1" fill="#000" />
                    <rect x="1" y="5" width="8" height="1" fill="#000" />
                    <rect x="1" y="8" width="10" height="1" fill="#000" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={'wp-stat-vbtn ' + (word95View === 'page' ? 'on' : '')}
                  title="Page Layout View"
                  onClick={() => setWord95View('page')}
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <rect x="2" y="1" width="8" height="10" fill="#fff" stroke="#000" strokeWidth="1" />
                    <rect x="4" y="3" width="4" height="1" fill="#000080" />
                    <rect x="4" y="5" width="4" height="1" fill="#808080" />
                    <rect x="4" y="7" width="3" height="1" fill="#808080" />
                  </svg>
                </button>
              </span>
              {voice.listening ? `🎙️ ${voice.interim || 'Listening...'}` : `Page 1  Sec 1  Ln ${cursorPos.ln}  Col ${cursorPos.col}  |  ${sourceLabel}${dirty ? ' *' : ''}`}
            </span>
            <span>L:{rulerLeft} R:{rulerRight}</span>
            <span>Format: {format.toUpperCase()}</span>
            <span>{wordCount} words</span>
          </>
        ) : (
          <>
            <span>{voice.listening ? `🎙️ ${voice.interim || 'Listening...'}` : `${sourceLabel}${dirty ? ' *' : ''}`}</span>
            <span>L:{rulerLeft} R:{rulerRight}</span>
            <span>Format: {format.toUpperCase()}</span>
            <span>{wordCount} words</span>
          </>
        )}
      </StatusBar>
    </div>
  );
}

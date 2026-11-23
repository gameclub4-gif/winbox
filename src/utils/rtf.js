// Rich Text Format (RTF 1.5) <-> HTML parser/serializer & safe HTML utilities for WordPad.

const SKIP_GROUPS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer',
  'headerl', 'headerr', 'headerf', 'footerl', 'footerr', 'footerf', 'footnote',
  'listtable', 'listoverridetable', 'revtbl', 'rsidtbl', 'mmathPr', 'themedata', 'colorschememapping',
]);

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cp1252Byte(b) {
  const map = {
    0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
    0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
    0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
    0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
    0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
    0x9e: 0x017e, 0x9f: 0x0178,
  };
  return String.fromCharCode(map[b] || b);
}

function parseColorTable(raw) {
  const colors = [null];
  const entries = raw.split(';');
  entries.pop();
  for (const e of entries) {
    const r = e.match(/\\red(\d+)/);
    const g = e.match(/\\green(\d+)/);
    const b = e.match(/\\blue(\d+)/);
    if (r || g || b) {
      colors.push(`rgb(${r ? +r[1] : 0}, ${g ? +g[1] : 0}, ${b ? +b[1] : 0})`);
    } else {
      colors.push(null);
    }
  }
  return colors;
}

function parseFontTable(raw) {
  const fonts = {};
  const re = /\{\s*\\f(\d+)[^}]*?\s+([^;{}]+);\s*\}/g;
  let m;
  while ((m = re.exec(raw))) {
    fonts[+m[1]] = m[2].replace(/\\[a-z]+-?\d*\s?/gi, '').trim();
  }
  if (!Object.keys(fonts).length) {
    const re2 = /\\f(\d+)[^;]*?\s+([^;{}]+);/g;
    while ((m = re2.exec(raw))) {
      fonts[+m[1]] = m[2].replace(/\\[a-z]+-?\d*\s?/gi, '').trim();
    }
  }
  return fonts;
}

function extractTopGroup(src, keyword) {
  const idx = src.indexOf('{\\' + keyword);
  if (idx < 0) return '';
  let depth = 0;
  for (let i = idx; i < src.length; i++) {
    if (src[i] === '{' && src[i - 1] !== '\\') depth++;
    else if (src[i] === '}' && src[i - 1] !== '\\') {
      depth--;
      if (depth === 0) return src.slice(idx, i + 1);
    }
  }
  return '';
}

/**
 * Convert an RTF string into clean editable HTML paragraphs.
 */
export function rtfToHtml(rtf) {
  if (!rtf || typeof rtf !== 'string') return '<p><br></p>';
  if (!rtf.trimStart().startsWith('{\\rtf')) {
    return rtf
      .split(/\r?\n/)
      .map((line) => `<p>${line ? escHtml(line) : '<br>'}</p>`)
      .join('');
  }

  const colors = parseColorTable(extractTopGroup(rtf, 'colortbl'));
  const fonts = parseFontTable(extractTopGroup(rtf, 'fonttbl'));

  const baseState = () => ({
    b: false, i: false, u: false, s: false,
    fs: 12, cf: 0, f: 0, align: 'left', uc: 1, skip: false,
  });

  const stack = [baseState()];
  const paras = [];
  let curHtml = '';
  let curAlign = 'left';
  let curBullet = false;
  let skipChars = 0;

  const pushPara = () => {
    const style = curAlign && curAlign !== 'left' ? ` style="text-align:${curAlign}"` : '';
    const content = curHtml || '<br>';
    if (curBullet) paras.push(`<li${style}>${content}</li>`);
    else paras.push(`<p${style}>${content}</p>`);
    curHtml = '';
    curBullet = false;
  };

  const emitText = (txt) => {
    const st = stack[stack.length - 1];
    if (st.skip) return;
    let s = txt;
    if (skipChars > 0) {
      if (s.length <= skipChars) {
        skipChars -= s.length;
        return;
      }
      s = s.slice(skipChars);
      skipChars = 0;
    }
    if (!s) return;
    let out = escHtml(s).replace(/ {2,}/g, (m) => ' ' + '&nbsp;'.repeat(m.length - 1));
    const styles = [];
    if (st.fs && st.fs !== 12) styles.push(`font-size:${st.fs}pt`);
    if (st.cf && colors[st.cf]) styles.push(`color:${colors[st.cf]}`);
    if (st.f && fonts[st.f]) styles.push(`font-family:${fonts[st.f]}`);
    if (styles.length) out = `<span style="${styles.join(';')}">${out}</span>`;
    if (st.b) out = `<b>${out}</b>`;
    if (st.i) out = `<i>${out}</i>`;
    if (st.u) out = `<u>${out}</u>`;
    if (st.s) out = `<s>${out}</s>`;
    curHtml += out;
  };

  let idx = 0;
  const n = rtf.length;
  while (idx < n) {
    const ch = rtf[idx];
    if (ch === '{') {
      stack.push({ ...stack[stack.length - 1] });
      idx++;
    } else if (ch === '}') {
      if (stack.length > 1) stack.pop();
      skipChars = 0;
      idx++;
    } else if (ch === '\\') {
      idx++;
      if (idx >= n) break;
      const nx = rtf[idx];
      if (nx === '\\' || nx === '{' || nx === '}') {
        emitText(nx);
        idx++;
      } else if (nx === '*') {
        stack[stack.length - 1].skip = true;
        idx++;
      } else if (nx === '~') {
        if (!stack[stack.length - 1].skip) curHtml += '&nbsp;';
        idx++;
      } else if (nx === '_' || nx === '-') {
        emitText('-');
        idx++;
      } else if (nx === '\r' || nx === '\n') {
        if (!stack[stack.length - 1].skip) pushPara();
        idx++;
      } else if (nx === "'") {
        const hex = rtf.slice(idx + 1, idx + 3);
        const byte = parseInt(hex, 16);
        if (!Number.isNaN(byte)) emitText(cp1252Byte(byte));
        idx += 3;
      } else if (/[a-zA-Z]/.test(nx)) {
        let j = idx;
        while (j < n && /[a-zA-Z]/.test(rtf[j])) j++;
        const word = rtf.slice(idx, j);
        let param = null;
        if (j < n && (rtf[j] === '-' || /\d/.test(rtf[j]))) {
          let k = j + (rtf[j] === '-' ? 1 : 0);
          while (k < n && /\d/.test(rtf[k])) k++;
          param = parseInt(rtf.slice(j, k), 10);
          j = k;
        }
        if (j < n && rtf[j] === ' ') j++;
        idx = j;

        const st = stack[stack.length - 1];
        if (SKIP_GROUPS.has(word)) {
          st.skip = true;
          continue;
        }
        if (st.skip) continue;

        switch (word) {
          case 'b': st.b = param !== 0; break;
          case 'i': st.i = param !== 0; break;
          case 'ul': st.u = param !== 0; break;
          case 'ulnone': case 'ul0': st.u = false; break;
          case 'strike': st.s = param !== 0; break;
          case 'fs': if (param) st.fs = param / 2; break;
          case 'cf': st.cf = param || 0; break;
          case 'f': st.f = param || 0; break;
          case 'uc': if (param != null) st.uc = param; break;
          case 'u': {
            if (param != null) {
              const cp = param < 0 ? param + 65536 : param;
              emitText(String.fromCodePoint(cp));
              skipChars = st.uc;
            }
            break;
          }
          case 'ql': st.align = 'left'; curAlign = 'left'; break;
          case 'qc': st.align = 'center'; curAlign = 'center'; break;
          case 'qr': st.align = 'right'; curAlign = 'right'; break;
          case 'qj': st.align = 'justify'; curAlign = 'justify'; break;
          case 'pard':
            st.align = 'left'; curAlign = 'left';
            break;
          case 'plain':
            st.b = false; st.i = false; st.u = false; st.s = false; st.fs = 12; st.cf = 0; st.f = 0;
            break;
          case 'par':
            pushPara();
            curAlign = st.align;
            break;
          case 'line': curHtml += '<br>'; break;
          case 'tab': curHtml += '&emsp;'; break;
          case 'bullet': curBullet = true; break;
          case 'emdash': emitText('—'); break;
          case 'endash': emitText('–'); break;
          case 'lquote': emitText('‘'); break;
          case 'rquote': emitText('’'); break;
          case 'ldblquote': emitText('“'); break;
          case 'rdblquote': emitText('”'); break;
          default: break;
        }
      } else {
        idx++;
      }
    } else if (ch === '\r' || ch === '\n') {
      idx++;
    } else {
      let j = idx;
      while (j < n && rtf[j] !== '{' && rtf[j] !== '}' && rtf[j] !== '\\' && rtf[j] !== '\r' && rtf[j] !== '\n') j++;
      emitText(rtf.slice(idx, j));
      idx = j;
    }
  }
  if (curHtml) pushPara();
  if (!paras.length) return '<p><br></p>';

  // Group adjacent <li> elements into <ul>
  const out = [];
  let inList = false;
  for (const p of paras) {
    if (p.startsWith('<li')) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(p);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(p);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

function parseColorStr(c) {
  if (!c) return null;
  const s = c.trim().toLowerCase();
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split('').map((x) => x + x).join('');
    if (hex.length === 6) {
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
  }
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  const named = { black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], navy: [0, 0, 128], gray: [128, 128, 128], maroon: [128, 0, 0], purple: [128, 0, 128], teal: [0, 128, 128] };
  return named[s] || null;
}

function escapeRtfText(txt) {
  let out = '';
  for (let i = 0; i < txt.length; i++) {
    const code = txt.charCodeAt(i);
    const ch = txt[i];
    if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
    else if (ch === '\u00a0') out += '\\~';
    else if (ch === '\t') out += '\\tab ';
    else if (code >= 32 && code <= 126) out += ch;
    else if (code > 126) out += `\\u${code > 32767 ? code - 65536 : code}?`;
  }
  return out;
}

/**
 * Convert editor HTML back into valid RTF 1.5.
 */
export function htmlToRtf(html) {
  const doc = new DOMParser().parseFromString(html || '<p></p>', 'text/html');
  const fonts = ['Arial', 'Times New Roman', 'Courier New'];
  const colors = [[0, 0, 0]];

  const fontIndex = (name) => {
    const clean = (name || '').split(',')[0].replace(/['"]/g, '').trim();
    if (!clean) return 0;
    let i = fonts.findIndex((f) => f.toLowerCase() === clean.toLowerCase());
    if (i < 0) { i = fonts.length; fonts.push(clean); }
    return i;
  };
  const colorIndex = (str) => {
    const rgb = parseColorStr(str);
    if (!rgb) return 0;
    let i = colors.findIndex((c) => c[0] === rgb[0] && c[1] === rgb[1] && c[2] === rgb[2]);
    if (i < 0) { i = colors.length; colors.push(rgb); }
    return i + 1; // RTF color table index 1-based after leading auto semicolon
  };
  const ptFromCss = (sz) => {
    if (!sz) return null;
    if (sz.endsWith('pt')) return Math.round(parseFloat(sz));
    if (sz.endsWith('px')) return Math.round(parseFloat(sz) * 0.75);
    const legacy = { '1': 8, '2': 10, '3': 12, '4': 14, '5': 18, '6': 24, '7': 36 };
    return legacy[sz] || null;
  };

  let bodyRtf = '';
  const walk = (node, fmt) => {
    if (node.nodeType === 3) {
      const text = node.nodeValue.replace(/\r?\n/g, ' ');
      if (!text) return;
      const prefixes = [];
      if (fmt.b) prefixes.push('\\b');
      if (fmt.i) prefixes.push('\\i');
      if (fmt.u) prefixes.push('\\ul');
      if (fmt.s) prefixes.push('\\strike');
      if (fmt.f != null) prefixes.push(`\\f${fmt.f}`);
      if (fmt.fs) prefixes.push(`\\fs${fmt.fs * 2}`);
      if (fmt.cf) prefixes.push(`\\cf${fmt.cf}`);
      if (prefixes.length) bodyRtf += `{${prefixes.join('')} ${escapeRtfText(text)}}`;
      else bodyRtf += escapeRtfText(text);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    const next = { ...fmt };
    if (tag === 'b' || tag === 'strong') next.b = true;
    if (tag === 'i' || tag === 'em') next.i = true;
    if (tag === 'u') next.u = true;
    if (tag === 's' || tag === 'strike' || tag === 'del') next.s = true;
    if (tag === 'font') {
      if (node.getAttribute('face')) next.f = fontIndex(node.getAttribute('face'));
      if (node.getAttribute('size')) next.fs = ptFromCss(node.getAttribute('size')) || next.fs;
      if (node.getAttribute('color')) next.cf = colorIndex(node.getAttribute('color'));
    }
    const st = node.style;
    if (st) {
      if (st.fontWeight === 'bold' || +st.fontWeight >= 600) next.b = true;
      if (st.fontStyle === 'italic') next.i = true;
      if (st.textDecoration?.includes('underline')) next.u = true;
      if (st.textDecoration?.includes('line-through')) next.s = true;
      if (st.fontFamily) next.f = fontIndex(st.fontFamily);
      if (st.fontSize) next.fs = ptFromCss(st.fontSize) || next.fs;
      if (st.color) next.cf = colorIndex(st.color);
    }
    if (tag === 'h1') { next.b = true; next.fs = 20; }
    if (tag === 'h2') { next.b = true; next.fs = 16; }
    if (tag === 'h3') { next.b = true; next.fs = 14; }

    if (tag === 'br') {
      if (node.parentElement && node.parentElement.childNodes.length === 1) return;
      bodyRtf += '\\line ';
      return;
    }
    if (tag === 'hr') {
      bodyRtf += '\\pard\\qc ----------------------------------------\\par\n';
      return;
    }

    const isBlock = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(tag);
    if (isBlock) {
      const align = st?.textAlign || node.getAttribute('align') || 'left';
      const aWord = align === 'center' ? '\\qc' : align === 'right' ? '\\qr' : align === 'justify' ? '\\qj' : '\\ql';
      bodyRtf += `\\pard${aWord}`;
      if (tag === 'li') bodyRtf += '{\\pntext\\bullet\\tab}';
      bodyRtf += ' ';
      for (const ch of node.childNodes) walk(ch, next);
      bodyRtf += '\\par\n';
      return;
    }

    for (const ch of node.childNodes) walk(ch, next);
  };

  for (const ch of doc.body.childNodes) {
    if (ch.nodeType === 3 && ch.nodeValue.trim()) {
      bodyRtf += `\\pard\\ql ${escapeRtfText(ch.nodeValue)}\\par\n`;
    } else {
      walk(ch, { b: false, i: false, u: false, s: false, f: 0, fs: 12, cf: 0 });
    }
  }

  const fontTbl = `{\\fonttbl${fonts.map((f, i) => `{\\f${i}\\fnil\\fcharset0 ${f};}`).join('')}}`;
  const colorTbl = `{\\colortbl;${colors.map(([r, g, b]) => `\\red${r}\\green${g}\\blue${b};`).join('')}}`;
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\n${fontTbl}\n${colorTbl}\n\\viewkind4\\uc1\\pard\\f0\\fs24\n${bodyRtf}}`;
}

/**
 * Sanitize external HTML safely for rendering inside WordPad's contentEditable editor.
 */
export function sanitizeHtmlForEditor(rawHtml) {
  const doc = new DOMParser().parseFromString(rawHtml || '', 'text/html');
  const blocked = doc.querySelectorAll('script, style, iframe, object, embed, link, meta, base, form');
  blocked.forEach((el) => el.remove());

  const cleanAttrs = (el) => {
    for (const attr of [...el.attributes]) {
      const nm = attr.name.toLowerCase();
      const val = (attr.value || '').trim();
      if (nm.startsWith('on') || nm === 'srcdoc') {
        el.removeAttribute(attr.name);
      } else if ((nm === 'href' || nm === 'src') && /^javascript:/i.test(val)) {
        el.removeAttribute(attr.name);
      }
    }
    for (const child of el.children) cleanAttrs(child);
  };
  cleanAttrs(doc.body);
  const html = doc.body.innerHTML.trim();
  return html || '<p><br></p>';
}

/**
 * Wrap WordPad editor body HTML into a clean standalone HTML document.
 */
export function wrapStandaloneHtml(bodyHtml, title = 'Document') {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escHtml(title)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.45; max-width: 780px; margin: 32px auto; padding: 0 20px; color: #000; background: #fff; }
  p { margin: 0 0 8px; }
  ul, ol { margin: 4px 0 8px 24px; }
</style>
</head>
<body>
${bodyHtml || '<p><br></p>'}
</body>
</html>
`;
}

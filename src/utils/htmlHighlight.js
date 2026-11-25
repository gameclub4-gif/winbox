// Lightweight, lossless linear HTML/XML tokenizer for Notepad syntax highlighting.
// Concatenating all token .text strings reproduces the exact original source string.

const MAX_HIGHLIGHT_LEN = 150000;

export function looksLikeHtml(filename = '', text = '') {
  if (/\.(html?|xhtml|xml|svg)$/i.test(filename)) return true;
  const head = (text || '').trimStart().slice(0, 160).toLowerCase();
  return /^(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<div[\s>]|<p[\s>]|<\?xml|<svg[\s>])/.test(head);
}

export function tokenizeHtml(src) {
  if (!src) return [];
  if (src.length > MAX_HIGHLIGHT_LEN) return [{ type: 'plain', text: src }];

  const tokens = [];
  const n = src.length;
  let i = 0;

  const push = (type, text) => {
    if (!text) return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.type === type) prev.text += text;
    else tokens.push({ type, text });
  };

  while (i < n) {
    const ch = src[i];

    // HTML entities outside tags
    if (ch === '&') {
      const m = src.slice(i, i + 16).match(/^&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/);
      if (m) {
        push('entity', m[0]);
        i += m[0].length;
        continue;
      }
    }

    if (ch !== '<') {
      let j = i + 1;
      while (j < n && src[j] !== '<' && src[j] !== '&') j++;
      push('plain', src.slice(i, j));
      i = j;
      continue;
    }

    // Comment: <!-- ... -->
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      const stop = end >= 0 ? end + 3 : n;
      push('comment', src.slice(i, stop));
      i = stop;
      continue;
    }

    // Doctype / Processing instruction: <!...> or <?...>
    if (src[i + 1] === '!' || src[i + 1] === '?') {
      const end = src.indexOf('>', i + 2);
      const stop = end >= 0 ? end + 1 : n;
      push('doctype', src.slice(i, stop));
      i = stop;
      continue;
    }

    // Standard opening/closing tag: <tag ...> or </tag>
    const isClose = src[i + 1] === '/';
    const openEnd = isClose ? i + 2 : i + 1;
    let t = openEnd;
    while (t < n && /[a-zA-Z0-9:-]/.test(src[t])) t++;

    if (t === openEnd) {
      push('plain', '<');
      i++;
      continue;
    }

    push('bracket', src.slice(i, openEnd));
    push('tag', src.slice(openEnd, t));
    i = t;

    // Attributes until >
    while (i < n) {
      const c = src[i];
      if (c === '>') {
        push('bracket', '>');
        i++;
        break;
      }
      if (c === '/' && src[i + 1] === '>') {
        push('bracket', '/>');
        i += 2;
        break;
      }
      if (/\s/.test(c)) {
        let s = i + 1;
        while (s < n && /\s/.test(src[s])) s++;
        push('plain', src.slice(i, s));
        i = s;
        continue;
      }
      if (c === '"' || c === "'") {
        const q = c;
        let e = i + 1;
        while (e < n && src[e] !== q && src[e] !== '>') e++;
        if (e < n && src[e] === q) e++;
        push('str', src.slice(i, e));
        i = e;
        continue;
      }
      if (c === '=') {
        push('bracket', '=');
        i++;
        continue;
      }
      let a = i + 1;
      while (a < n && !/[\s=>"'\/>]/.test(src[a])) a++;
      push('attr', src.slice(i, a));
      i = a;
    }
  }

  return tokens;
}

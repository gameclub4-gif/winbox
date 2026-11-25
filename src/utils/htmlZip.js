// Cross-browser HTML + images/ folder ZIP packager and extractor for WordPad.
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { sanitizeHtmlForEditor, wrapStandaloneHtml } from './rtf.js';

const IMG_MIMES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};

const MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
};

function uint8ToBase64(u8) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToUint8(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function normalizeZipPath(p) {
  const parts = [];
  for (const seg of (p || '').replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (parts.length) parts.pop(); continue; }
    parts.push(seg);
  }
  return parts.join('/');
}

function sanitizeImageFilename(name, fallbackIdx, ext) {
  const clean = (name || '')
    .split(/[\\/]/)
    .pop()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '');
  if (clean && /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(clean)) return clean;
  return `image-${fallbackIdx}.${ext || 'png'}`;
}

/**
 * Unpack a ZIP archive containing an HTML file and optional images/ assets.
 * Embeds matched assets as self-contained data: URIs so all browsers render them reliably.
 */
export function extractHtmlFromZip(buffer, zipFilename = 'Document.zip') {
  const files = unzipSync(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  const names = Object.keys(files).filter((n) => !n.endsWith('/') && !n.startsWith('__MACOSX/'));

  const htmlEntries = names
    .filter((n) => /\.(html?|xhtml)$/i.test(n))
    .sort((a, b) => {
      const aIndex = /(^|\/)index\.html?$/i.test(a) ? 0 : 1;
      const bIndex = /(^|\/)index\.html?$/i.test(b) ? 0 : 1;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.split('/').length - b.split('/').length || a.localeCompare(b);
    });

  if (!htmlEntries.length) {
    throw new Error(`"${zipFilename}" does not contain an .html or .htm file.`);
  }

  const mainPath = htmlEntries[0];
  const baseDir = mainPath.includes('/') ? mainPath.slice(0, mainPath.lastIndexOf('/')) : '';
  const rawHtml = new TextDecoder('utf-8').decode(files[mainPath]);

  // Index asset entries by normalized path (case-insensitive) & basename
  const assetByPath = new Map();
  const assetByBase = new Map();
  for (const n of names) {
    const ext = n.includes('.') ? n.split('.').pop().toLowerCase() : '';
    if (!IMG_MIMES[ext]) continue;
    const norm = normalizeZipPath(n).toLowerCase();
    assetByPath.set(norm, { origPath: n, ext, data: files[n] });
    const base = norm.split('/').pop();
    if (base && !assetByBase.has(base)) {
      assetByBase.set(base, { origPath: n, ext, data: files[n] });
    }
  }

  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  const docTitle = doc.title?.trim() || mainPath.split('/').pop();
  let imageCount = 0;

  for (const img of [...doc.querySelectorAll('img')]) {
    const rawSrc = (img.getAttribute('src') || '').trim();
    if (!rawSrc || /^(data:|https?:|blob:)/i.test(rawSrc)) continue;

    let decoded = rawSrc.split('?')[0].split('#')[0];
    try { decoded = decodeURIComponent(decoded); } catch { /* ignore */ }
    const joined = normalizeZipPath(baseDir ? `${baseDir}/${decoded}` : decoded).toLowerCase();
    const direct = normalizeZipPath(decoded).toLowerCase();
    const baseOnly = direct.split('/').pop();

    const hit = assetByPath.get(joined) || assetByPath.get(direct) || assetByPath.get(`images/${baseOnly}`) || assetByBase.get(baseOnly);
    if (hit) {
      const mime = IMG_MIMES[hit.ext] || 'image/png';
      img.setAttribute('src', `data:${mime};base64,${uint8ToBase64(hit.data)}`);
      img.setAttribute('data-filename', hit.origPath.split('/').pop());
      imageCount++;
    }
  }

  const sanitized = sanitizeHtmlForEditor(doc.body.innerHTML);
  return { html: sanitized, rawHtml, title: docTitle, mainEntry: mainPath, imageCount };
}

/**
 * Package WordPad editor HTML + embedded images into a cross-browser compatible ZIP archive
 * with index.html at root and all images under an images/ folder.
 */
export async function packHtmlToZip(bodyHtml, docTitle = 'Document') {
  const doc = new DOMParser().parseFromString(bodyHtml || '<p><br></p>', 'text/html');
  const zipEntries = Object.create(null);
  const usedNames = new Set();
  let imgIdx = 1;
  let imageCount = 0;

  for (const img of [...doc.body.querySelectorAll('img')]) {
    const src = (img.getAttribute('src') || '').trim();
    if (!src) continue;

    let bytes = null;
    let ext = 'png';

    const dataMatch = src.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (dataMatch) {
      ext = MIME_TO_EXT[dataMatch[1].toLowerCase()] || 'png';
      try { bytes = base64ToUint8(dataMatch[2]); } catch { bytes = null; }
    } else if (src.startsWith('blob:')) {
      try {
        const res = await fetch(src);
        const blob = await res.blob();
        ext = MIME_TO_EXT[blob.type] || 'png';
        bytes = new Uint8Array(await blob.arrayBuffer());
      } catch { bytes = null; }
    }

    if (bytes) {
      const preferred = img.getAttribute('data-filename') || img.getAttribute('alt') || '';
      let fname = sanitizeImageFilename(preferred, imgIdx++, ext);
      while (usedNames.has(fname.toLowerCase())) {
        const dot = fname.lastIndexOf('.');
        const base = dot > 0 ? fname.slice(0, dot) : fname;
        const suffix = dot > 0 ? fname.slice(dot) : `.${ext}`;
        fname = `${base}_${imgIdx++}${suffix}`;
      }
      usedNames.add(fname.toLowerCase());
      zipEntries[`images/${fname}`] = bytes;
      img.setAttribute('src', `images/${fname}`);
      img.removeAttribute('data-filename');
      imageCount++;
    }
  }

  const cleanBody = doc.body.innerHTML || '<p><br></p>';
  const fullHtml = wrapStandaloneHtml(cleanBody, docTitle);
  zipEntries['index.html'] = strToU8(fullHtml);

  const zipped = zipSync(zipEntries, { level: 6 });
  return {
    blob: new Blob([zipped], { type: 'application/zip' }),
    imageCount,
  };
}

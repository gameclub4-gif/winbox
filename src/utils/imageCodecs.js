// Pure-JS image encoders (24-bit BMP, LZW GIF89a with Median-Cut quantization),
// quality-controlled export, and Stretch/Skew canvas transforms.

function compositeOverWhite(data) {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 255) {
      out[i] = data[i];
      out[i + 1] = data[i + 1];
      out[i + 2] = data[i + 2];
      out[i + 3] = 255;
    } else if (a === 0) {
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = 255;
    } else {
      const f = a / 255;
      const inv = 255 * (1 - f);
      out[i] = Math.round(data[i] * f + inv);
      out[i + 1] = Math.round(data[i + 1] * f + inv);
      out[i + 2] = Math.round(data[i + 2] * f + inv);
      out[i + 3] = 255;
    }
  }
  return out;
}

export function encodeBmpBlob(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = compositeOverWhite(ctx.getImageData(0, 0, w, h).data);
  const rowStride = (w * 3 + 3) & ~3;
  const pixelBytes = rowStride * h;
  const fileSize = 54 + pixelBytes;
  const buf = new ArrayBuffer(fileSize);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);

  // BITMAPFILEHEADER (14 bytes)
  dv.setUint8(0, 0x42); // 'B'
  dv.setUint8(1, 0x4d); // 'M'
  dv.setUint32(2, fileSize, true);
  dv.setUint32(6, 0, true);
  dv.setUint32(10, 54, true);

  // BITMAPINFOHEADER (40 bytes)
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true); // positive = bottom-up
  dv.setUint16(26, 1, true); // planes
  dv.setUint16(28, 24, true); // 24-bit RGB
  dv.setUint32(30, 0, true); // BI_RGB uncompressed
  dv.setUint32(34, pixelBytes, true);
  dv.setInt32(38, 2835, true); // ~72 DPI
  dv.setInt32(42, 2835, true);
  dv.setUint32(46, 0, true);
  dv.setUint32(50, 0, true);

  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w * 4;
    let dst = 54 + y * rowStride;
    for (let x = 0; x < w; x++) {
      const s = srcRow + x * 4;
      u8[dst++] = rgba[s + 2]; // B
      u8[dst++] = rgba[s + 1]; // G
      u8[dst++] = rgba[s];     // R
    }
  }
  return new Blob([buf], { type: 'image/bmp' });
}

function buildMedianCutPalette(rgbData, maxColors) {
  const uniqueMap = new Map();
  const totalPx = rgbData.length / 4;
  const step = Math.max(1, Math.floor(totalPx / 24000));
  for (let p = 0; p < totalPx; p += step) {
    const i = p * 4;
    const key = (rgbData[i] << 16) | (rgbData[i + 1] << 8) | rgbData[i + 2];
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, [rgbData[i], rgbData[i + 1], rgbData[i + 2]]);
      if (uniqueMap.size > 8192) break;
    }
  }
  const samples = Array.from(uniqueMap.values());
  if (!samples.length) return [[0, 0, 0]];
  if (samples.length <= maxColors) return samples;

  const buckets = [samples];
  while (buckets.length < maxColors) {
    let bestIdx = -1;
    let bestRange = -1;
    let bestChan = 0;
    for (let b = 0; b < buckets.length; b++) {
      const list = buckets[b];
      if (list.length < 2) continue;
      let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
      for (let k = 0; k < list.length; k++) {
        const [r, g, bl] = list[k];
        if (r < rMin) rMin = r; if (r > rMax) rMax = r;
        if (g < gMin) gMin = g; if (g > gMax) gMax = g;
        if (bl < bMin) bMin = bl; if (bl > bMax) bMax = bl;
      }
      const rr = rMax - rMin, gr = gMax - gMin, br = bMax - bMin;
      const maxR = Math.max(rr, gr, br);
      if (maxR > bestRange) {
        bestRange = maxR;
        bestIdx = b;
        bestChan = maxR === rr ? 0 : maxR === gr ? 1 : 2;
      }
    }
    if (bestIdx < 0 || bestRange <= 0) break;
    const target = buckets.splice(bestIdx, 1)[0];
    target.sort((a, b) => a[bestChan] - b[bestChan]);
    const mid = target.length >> 1;
    buckets.push(target.slice(0, mid), target.slice(mid));
  }

  return buckets.map((list) => {
    let r = 0, g = 0, b = 0;
    for (let k = 0; k < list.length; k++) {
      r += list[k][0];
      g += list[k][1];
      b += list[k][2];
    }
    const n = list.length || 1;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

function mapPixelsToPalette(rgbData, w, h, palette, dither = false) {
  const nPx = w * h;
  const indices = new Uint8Array(nPx);
  const cache = new Map();
  const findNearest = (r, g, b) => {
    const cr = Math.max(0, Math.min(255, r)) | 0;
    const cg = Math.max(0, Math.min(255, g)) | 0;
    const cb = Math.max(0, Math.min(255, b)) | 0;
    const key = (cr << 16) | (cg << 8) | cb;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const pr = palette[i][0] - cr;
      const pg = palette[i][1] - cg;
      const pb = palette[i][2] - cb;
      const dist = pr * pr + pg * pg + pb * pb;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
        if (dist === 0) break;
      }
    }
    if (cache.size < 32768) cache.set(key, best);
    return best;
  };

  if (!dither) {
    for (let p = 0; p < nPx; p++) {
      const i = p * 4;
      indices[p] = findNearest(rgbData[i], rgbData[i + 1], rgbData[i + 2]);
    }
    return indices;
  }

  // Light Floyd-Steinberg dithering on a float RGB buffer
  const work = new Float32Array(nPx * 3);
  for (let p = 0; p < nPx; p++) {
    work[p * 3] = rgbData[p * 4];
    work[p * 3 + 1] = rgbData[p * 4 + 1];
    work[p * 3 + 2] = rgbData[p * 4 + 2];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const o = p * 3;
      const r = work[o], g = work[o + 1], b = work[o + 2];
      const idx = findNearest(r, g, b);
      indices[p] = idx;
      const pal = palette[idx];
      const er = r - pal[0], eg = g - pal[1], eb = b - pal[2];
      const spread = (dx, dy, weight) => {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= w || ny >= h) return;
        const no = (ny * w + nx) * 3;
        work[no] += er * weight;
        work[no + 1] += eg * weight;
        work[no + 2] += eb * weight;
      };
      spread(1, 0, 7 / 16);
      spread(-1, 1, 3 / 16);
      spread(0, 1, 5 / 16);
      spread(1, 1, 1 / 16);
    }
  }
  return indices;
}

function lzwEncodeGif(indices, minCodeSize = 8) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const chunks = [];
  let sub = new Uint8Array(256);
  let subLen = 0;
  let bitBuf = 0;
  let bitCount = 0;

  const pushByte = (byte) => {
    sub[subLen++] = byte;
    if (subLen === 255) {
      const block = new Uint8Array(256);
      block[0] = 255;
      block.set(sub.subarray(0, 255), 1);
      chunks.push(block);
      subLen = 0;
    }
  };

  const writeBits = (code, bits) => {
    bitBuf |= code << bitCount;
    bitCount += bits;
    while (bitCount >= 8) {
      pushByte(bitBuf & 0xff);
      bitBuf >>= 8;
      bitCount -= 8;
    }
  };

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let dict = new Map();

  const resetDict = () => {
    dict = new Map();
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };

  writeBits(clearCode, codeSize);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
    } else {
      writeBits(prefix, codeSize);
      if (nextCode < 4096) {
        dict.set(key, nextCode);
        if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
        nextCode++;
      } else {
        writeBits(clearCode, codeSize);
        resetDict();
      }
      prefix = k;
    }
  }
  writeBits(prefix, codeSize);
  writeBits(eoiCode, codeSize);
  if (bitCount > 0) pushByte(bitBuf & 0xff);

  if (subLen > 0) {
    const block = new Uint8Array(subLen + 1);
    block[0] = subLen;
    block.set(sub.subarray(0, subLen), 1);
    chunks.push(block);
  }
  chunks.push(new Uint8Array([0])); // block terminator
  return chunks;
}

export function encodeGifBlob(canvas, qualityPct = 100) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = compositeOverWhite(ctx.getImageData(0, 0, w, h).data);
  const maxColors = qualityPct >= 95 ? 256 : qualityPct >= 85 ? 192 : qualityPct >= 75 ? 128 : 64;
  const palette = buildMedianCutPalette(rgba, maxColors);
  const indices = mapPixelsToPalette(rgba, w, h, palette, qualityPct >= 90 && palette.length >= 64);

  const head = new Uint8Array(13 + 256 * 3 + 11);
  // Header: GIF89a
  head.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);
  // Logical Screen Descriptor
  head[6] = w & 0xff;
  head[7] = (w >> 8) & 0xff;
  head[8] = h & 0xff;
  head[9] = (h >> 8) & 0xff;
  head[10] = 0xf7; // GCT present, 8-bit color res, 256 colors
  head[11] = 0;    // bg color index
  head[12] = 0;    // pixel aspect ratio

  // Global Color Table (256 * 3 bytes)
  for (let i = 0; i < 256; i++) {
    const c = palette[i] || [0, 0, 0];
    const off = 13 + i * 3;
    head[off] = c[0];
    head[off + 1] = c[1];
    head[off + 2] = c[2];
  }

  // Image Descriptor + LZW minCodeSize
  const imgOff = 13 + 256 * 3;
  head[imgOff] = 0x2c;
  head[imgOff + 1] = 0; head[imgOff + 2] = 0;
  head[imgOff + 3] = 0; head[imgOff + 4] = 0;
  head[imgOff + 5] = w & 0xff;
  head[imgOff + 6] = (w >> 8) & 0xff;
  head[imgOff + 7] = h & 0xff;
  head[imgOff + 8] = (h >> 8) & 0xff;
  head[imgOff + 9] = 0x00;
  head[imgOff + 10] = 8; // LZW minimum code size

  const lzwChunks = lzwEncodeGif(indices, 8);
  return new Blob([head, ...lzwChunks, new Uint8Array([0x3b])], { type: 'image/gif' });
}

function quantizeCanvasForPng(canvas, qualityPct) {
  const w = canvas.width;
  const h = canvas.height;
  const maxColors = qualityPct >= 90 ? 256 : qualityPct >= 80 ? 128 : 64;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  const srcCtx = canvas.getContext('2d', { willReadFrequently: true });
  const img = srcCtx.getImageData(0, 0, w, h);
  const palette = buildMedianCutPalette(img.data, maxColors);
  const indices = mapPixelsToPalette(img.data, w, h, palette, true);
  const dst = octx.createImageData(w, h);
  for (let p = 0; p < w * h; p++) {
    const c = palette[indices[p]];
    const o = p * 4;
    dst.data[o] = c[0];
    dst.data[o + 1] = c[1];
    dst.data[o + 2] = c[2];
    dst.data[o + 3] = img.data[o + 3];
  }
  octx.putImageData(dst, 0, 0);
  return out;
}

export async function canvasToFormattedBlob(canvas, ext = 'png', qualityPct = 100) {
  const cleanExt = String(ext || 'png').toLowerCase().replace(/^\./, '');
  const q = Math.max(0.1, Math.min(1, Number(qualityPct || 100) / 100));

  if (cleanExt === 'bmp') {
    return { blob: encodeBmpBlob(canvas), mime: 'image/bmp' };
  }
  if (cleanExt === 'gif') {
    return { blob: encodeGifBlob(canvas, qualityPct), mime: 'image/gif' };
  }
  if (cleanExt === 'jpg' || cleanExt === 'jpeg') {
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const fg = flat.getContext('2d');
    fg.fillStyle = '#ffffff';
    fg.fillRect(0, 0, flat.width, flat.height);
    fg.drawImage(canvas, 0, 0);
    const blob = await new Promise((res) => flat.toBlob(res, 'image/jpeg', q));
    return { blob, mime: 'image/jpeg' };
  }
  if (cleanExt === 'webp') {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', q));
    return { blob, mime: 'image/webp' };
  }

  // Default: PNG (full 32-bit at 100%, palette-quantized smaller PNG at <100%)
  const src = qualityPct < 100 ? quantizeCanvasForPng(canvas, qualityPct) : canvas;
  const blob = await new Promise((res) => src.toBlob(res, 'image/png'));
  return { blob, mime: 'image/png' };
}

export function stretchAndSkewCanvas(sourceCanvas, { sxPct = 100, syPct = 100, skewXDeg = 0, skewYDeg = 0, bgHex = '#ffffff', keepAlpha = false } = {}) {
  const sw = Math.max(1, Math.round((sourceCanvas.width * sxPct) / 100));
  const sh = Math.max(1, Math.round((sourceCanvas.height * syPct) / 100));
  const kx = Math.tan((skewXDeg * Math.PI) / 180);
  const ky = Math.tan((skewYDeg * Math.PI) / 180);

  const extraW = Math.ceil(Math.abs(kx) * sh);
  const extraH = Math.ceil(Math.abs(ky) * sw);
  const outW = Math.max(1, Math.min(4000, sw + extraW));
  const outH = Math.max(1, Math.min(4000, sh + extraH));

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const g = out.getContext('2d');
  if (!keepAlpha) {
    g.fillStyle = bgHex;
    g.fillRect(0, 0, outW, outH);
  }
  g.imageSmoothingEnabled = false;
  const offX = kx < 0 ? Math.abs(kx) * sh : 0;
  const offY = ky < 0 ? Math.abs(ky) * sw : 0;
  g.setTransform(sw / sourceCanvas.width, (ky * sw) / sourceCanvas.width, (kx * sh) / sourceCanvas.height, sh / sourceCanvas.height, offX, offY);
  g.drawImage(sourceCanvas, 0, 0);
  return out;
}

// Pure browser FAT12 1.44MB Floppy Disk Inspector & Bootable Image Creator

const SECTOR_SIZE = 512;
const FLOPPY_144_SECTORS = 2880;
const FLOPPY_144_BYTES = SECTOR_SIZE * FLOPPY_144_SECTORS; // 1,474,560 bytes

function readAscii(u8, off, len) {
  let s = '';
  for (let i = 0; i < len && off + i < u8.length; i++) {
    const c = u8[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trimEnd();
}

function writeAscii(u8, off, str, len) {
  for (let i = 0; i < len; i++) {
    u8[off + i] = i < str.length ? (str.charCodeAt(i) & 0x7f) : 0x20;
  }
}

function decodeDosDateTime(timeVal, dateVal) {
  const year = ((dateVal >> 9) & 0x7f) + 1980;
  const month = ((dateVal >> 5) & 0x0f) || 1;
  const day = (dateVal & 0x1f) || 1;
  const hour = (timeVal >> 11) & 0x1f;
  const min = (timeVal >> 5) & 0x3f;
  const sec = (timeVal & 0x1f) * 2;
  return new Date(year, month - 1, day, hour, min, sec).getTime();
}

function encodeDosDateTime(ts = Date.now()) {
  const d = new Date(ts);
  const year = Math.max(1980, Math.min(2107, d.getFullYear())) - 1980;
  const dateVal = (year << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const timeVal = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { dateVal, timeVal };
}

function readFat12Entry(u8, fatOffset, cluster) {
  const idx = fatOffset + Math.floor((cluster * 3) / 2);
  if (idx + 1 >= u8.length) return 0xfff;
  const pair = u8[idx] | (u8[idx + 1] << 8);
  return cluster & 1 ? (pair >> 4) & 0xfff : pair & 0xfff;
}

function writeFat12Entry(u8, fatOffset, cluster, val) {
  const idx = fatOffset + Math.floor((cluster * 3) / 2);
  if (idx + 1 >= u8.length) return;
  if (cluster & 1) {
    u8[idx] = (u8[idx] & 0x0f) | ((val & 0x0f) << 4);
    u8[idx + 1] = (val >> 4) & 0xff;
  } else {
    u8[idx] = val & 0xff;
    u8[idx + 1] = (u8[idx + 1] & 0xf0) | ((val >> 8) & 0x0f);
  }
}

export function isFat12Image(u8) {
  if (!(u8 instanceof Uint8Array) || u8.length < 163840 || u8.length > 4 * 1024 * 1024) return false;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const bytesPerSec = dv.getUint16(11, true);
  const secPerClus = u8[13];
  const numFats = u8[16];
  const rootEntries = dv.getUint16(17, true);
  const media = u8[21];
  const secPerFat = dv.getUint16(22, true);
  return (
    bytesPerSec === 512 &&
    secPerClus >= 1 &&
    (secPerClus & (secPerClus - 1)) === 0 &&
    numFats >= 1 &&
    numFats <= 4 &&
    rootEntries > 0 &&
    secPerFat > 0 &&
    media >= 0xf0
  );
}

export function parseFat12Image(u8) {
  if (!isFat12Image(u8)) {
    throw new Error('Not a valid FAT12 floppy disk image (.img / .ima / .vfd).');
  }
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const oem = readAscii(u8, 3, 8);
  const bytesPerSector = dv.getUint16(11, true);
  const sectorsPerCluster = u8[13];
  const reservedSectors = dv.getUint16(14, true);
  const numFats = u8[16];
  const rootEntryCount = dv.getUint16(17, true);
  const totalSectors16 = dv.getUint16(19, true);
  const totalSectors32 = dv.getUint32(32, true);
  const totalSectors = totalSectors16 || totalSectors32 || Math.floor(u8.length / bytesPerSector);
  const sectorsPerFat = dv.getUint16(22, true);

  const fatStart = reservedSectors * bytesPerSector;
  const rootDirSectors = Math.ceil((rootEntryCount * 32) / bytesPerSector);
  const rootDirStart = fatStart + numFats * sectorsPerFat * bytesPerSector;
  const dataStart = rootDirStart + rootDirSectors * bytesPerSector;
  const clusterSize = bytesPerSector * sectorsPerCluster;
  const totalClusters = Math.max(0, Math.floor((totalSectors - (reservedSectors + numFats * sectorsPerFat + rootDirSectors)) / sectorsPerCluster));

  let volumeLabel = readAscii(u8, 43, 11);
  const files = [];

  const readChain = (startCluster, expectedSize = Infinity) => {
    if (startCluster < 2) return new Uint8Array(0);
    const chunks = [];
    const visited = new Set();
    let cur = startCluster;
    let remaining = expectedSize;
    while (cur >= 2 && cur < 0xff0 && !visited.has(cur) && chunks.length <= totalClusters) {
      visited.add(cur);
      const off = dataStart + (cur - 2) * clusterSize;
      if (off + clusterSize <= u8.length) {
        const take = Math.min(clusterSize, remaining);
        chunks.push(u8.slice(off, off + take));
        remaining -= take;
        if (remaining <= 0) break;
      }
      cur = readFat12Entry(u8, fatStart, cur);
    }
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) {
      out.set(c, pos);
      pos += c.length;
    }
    return out;
  };

  const scanDirBytes = (dirBytes, prefix = '', depth = 0) => {
    if (depth > 8) return;
    let lfnParts = [];
    for (let off = 0; off + 32 <= dirBytes.length; off += 32) {
      const first = dirBytes[off];
      if (first === 0x00) break;
      if (first === 0xe5) {
        lfnParts = [];
        continue;
      }
      const attr = dirBytes[off + 11];
      if (attr === 0x0f) {
        // VFAT Long File Name entry
        const seq = first & 0x1f;
        let part = '';
        const offsets = [1, 3, 5, 7, 9, 14, 16, 18, 20, 22, 24, 28, 30];
        for (const o of offsets) {
          const code = dirBytes[off + o] | (dirBytes[off + o + 1] << 8);
          if (code === 0x0000 || code === 0xffff) break;
          part += String.fromCharCode(code);
        }
        lfnParts[seq - 1] = part;
        continue;
      }
      if (attr & 0x08) {
        const vol = readAscii(dirBytes, off, 11);
        if (vol && !prefix) volumeLabel = vol;
        lfnParts = [];
        continue;
      }

      const base = readAscii(dirBytes, off, 8);
      const ext = readAscii(dirBytes, off + 8, 3);
      const shortName = ext ? `${base}.${ext}` : base;
      const longName = lfnParts.length ? lfnParts.join('').trim() : '';
      lfnParts = [];

      if (shortName === '.' || shortName === '..') continue;
      const name = longName || shortName;
      const startCluster = dirBytes[off + 26] | (dirBytes[off + 27] << 8);
      const ddv = new DataView(dirBytes.buffer, dirBytes.byteOffset + off, 32);
      const size = ddv.getUint32(28, true);
      const mTime = ddv.getUint16(22, true);
      const mDate = ddv.getUint16(24, true);
      const path = prefix ? `${prefix}/${name}` : name;
      const isDir = !!(attr & 0x10);

      if (isDir) {
        files.push({
          path,
          name,
          shortName,
          size: 0,
          attr,
          isDir: true,
          modified: decodeDosDateTime(mTime, mDate),
          data: new Uint8Array(0),
        });
        const subBytes = readChain(startCluster);
        if (subBytes.length) scanDirBytes(subBytes, path, depth + 1);
      } else {
        const data = readChain(startCluster, size);
        files.push({
          path,
          name,
          shortName,
          size,
          attr,
          isDir: false,
          modified: decodeDosDateTime(mTime, mDate),
          data,
        });
      }
    }
  };

  scanDirBytes(u8.subarray(rootDirStart, dataStart));

  let freeClusters = 0;
  for (let c = 2; c < 2 + totalClusters; c++) {
    if (readFat12Entry(u8, fatStart, c) === 0) freeClusters++;
  }

  return {
    format: 'FAT12',
    oem,
    volumeLabel: volumeLabel || 'NO NAME',
    bytesPerSector,
    sectorsPerCluster,
    totalBytes: totalClusters * clusterSize,
    freeBytes: freeClusters * clusterSize,
    imageBytes: u8.length,
    files,
  };
}

function toDos83Name(name, usedSet) {
  const clean = (name || 'FILE')
    .toUpperCase()
    .replace(/^.*\//, '')
    .replace(/[^A-Z0-9._-]/g, '_')
    .replace(/^\.+/, '');
  const dot = clean.lastIndexOf('.');
  let base = (dot >= 0 ? clean.slice(0, dot) : clean).replace(/\./g, '') || 'FILE';
  const ext = (dot >= 0 ? clean.slice(dot + 1) : '').replace(/\./g, '').slice(0, 3);
  base = base.slice(0, 8);
  let candidate = { base, ext };
  let key = `${candidate.base}.${candidate.ext}`;
  let n = 1;
  while (usedSet.has(key)) {
    const suffix = `~${n++}`;
    const trimmed = base.slice(0, Math.max(1, 8 - suffix.length)) + suffix;
    candidate = { base: trimmed, ext };
    key = `${candidate.base}.${candidate.ext}`;
  }
  usedSet.add(key);
  return candidate;
}

// Builds an authentic 16-bit x86 real-mode boot sector (BPB + tiny BIOS loader)
function writeBootCode(u8, label) {
  // Boot code begins immediately after BPB at byte offset 0x3E (62)
  const msg = `\r\nWin95 Smart Floppy [${label.trim() || 'FLOPPY'}]\r\nFAT12 Disk Ready in A:\\.\r\nRemove floppy & press any key to reboot...\r\n\0`;
  const msgBytes = [...msg].map((c) => c.charCodeAt(0));
  // Real-mode x86 instructions placed at 0x7C3E:
  // cli; xor ax, ax; mov ds, ax; mov es, ax; mov ss, ax; mov sp, 0x7C00; sti
  // mov si, <0x7C00 + msgOff>; loop: lodsb; test al,al; jz wait_key; mov ah,0x0E; xor bx,bx; int 0x10; jmp loop
  // wait_key: xor ah,ah; int 0x16; int 0x19
  const codeStart = 0x3e;
  const instrLen = 30;
  const msgAddr = 0x7c00 + codeStart + instrLen;
  const machine = [
    0xfa,                   // cli
    0x31, 0xc0,             // xor ax, ax
    0x8e, 0xd8,             // mov ds, ax
    0x8e, 0xc0,             // mov es, ax
    0x8e, 0xd0,             // mov ss, ax
    0xbc, 0x00, 0x7c,       // mov sp, 0x7c00
    0xfb,                   // sti
    0xbe, msgAddr & 0xff, (msgAddr >> 8) & 0xff, // mov si, msgAddr
    // print_loop (offset +16):
    0xac,                   // lodsb
    0x84, 0xc0,             // test al, al
    0x74, 0x06,             // jz wait_key (+6 bytes)
    0xb4, 0x0e,             // mov ah, 0x0e
    0x31, 0xdb,             // xor bx, bx
    0xcd, 0x10,             // int 0x10
    0xeb, 0xf3,             // jmp print_loop (-13)
    // wait_key:
    0x30, 0xe4,             // xor ah, ah (2 bytes -> let's count exact!)
  ];
  // Let's double check exact byte lengths for relative jumps!
  const code = [
    0xfa, 0x31, 0xc0, 0x8e, 0xd8, 0x8e, 0xc0, 0x8e, 0xd0, 0xbc, 0x00, 0x7c, 0xfb, // 13 bytes
    0xbe, 0x00, 0x00, // placeholder for msgAddr (bytes 13..15 -> 3 bytes)
    0xac,             // 16: lodsb (1)
    0x84, 0xc0,       // 17..18: test al,al (2)
    0x74, 0x08,       // 19..20: jz +8 -> jumps to 29 (wait_key) (2)
    0xb4, 0x0e,       // 21..22: mov ah, 0x0e (2)
    0x31, 0xdb,       // 23..24: xor bx, bx (2)
    0xcd, 0x10,       // 25..26: int 0x10 (2)
    0xeb, 0xf3,       // 27..28: jmp -13 -> 29 - 13 = 16 (lodsb) (2)
    // 29: wait_key
    0x30, 0xe4,       // 29..30: xor ah, ah
    0xcd, 0x16,       // 31..32: int 0x16 (wait keystroke)
    0xcd, 0x19,       // 33..34: int 0x19 (reboot)
    0xf4, 0xeb, 0xfd, // 35..37: hlt; jmp -3
  ];
  const exactMsgAddr = 0x7c00 + codeStart + code.length;
  code[14] = exactMsgAddr & 0xff;
  code[15] = (exactMsgAddr >> 8) & 0xff;
  void machine;

  u8[0] = 0xeb;
  u8[1] = 0x3c; // jmp short 0x3e
  u8[2] = 0x90; // nop
  for (let i = 0; i < code.length; i++) u8[codeStart + i] = code[i];
  for (let i = 0; i < msgBytes.length && codeStart + code.length + i < 510; i++) {
    u8[codeStart + code.length + i] = msgBytes[i];
  }
}

export function createFat12Floppy(entries, { label = 'WIN95DISK', bootable = true } = {}) {
  const u8 = new Uint8Array(FLOPPY_144_BYTES);
  const dv = new DataView(u8.buffer);
  const cleanLabel = (label || 'WIN95DISK').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 11) || 'WIN95DISK';

  // Jump + BPB (Standard 1.44 MB 3.5" High-Density FAT12)
  u8[0] = 0xeb;
  u8[1] = 0x3c;
  u8[2] = 0x90;
  writeAscii(u8, 3, 'MSWIN4.1', 8);
  dv.setUint16(11, SECTOR_SIZE, true);        // bytes per sector
  u8[13] = 1;                                 // sectors per cluster
  dv.setUint16(14, 1, true);                  // reserved sectors
  u8[16] = 2;                                 // number of FATs
  dv.setUint16(17, 224, true);                // root entries
  dv.setUint16(19, FLOPPY_144_SECTORS, true); // total sectors
  u8[21] = 0xf0;                              // 3.5" 1.44MB media descriptor
  dv.setUint16(22, 9, true);                  // sectors per FAT
  dv.setUint16(24, 18, true);                 // sectors per track
  dv.setUint16(26, 2, true);                  // heads
  dv.setUint32(28, 0, true);                  // hidden sectors
  dv.setUint32(32, 0, true);                  // large sectors
  u8[36] = 0x00;                              // drive number A:
  u8[38] = 0x29;                              // extended boot signature
  dv.setUint32(39, Date.now() >>> 0, true);   // serial number
  writeAscii(u8, 43, cleanLabel, 11);
  writeAscii(u8, 54, 'FAT12   ', 8);

  if (bootable) {
    writeBootCode(u8, cleanLabel);
  }
  u8[510] = 0x55;
  u8[511] = 0xaa;

  // FAT #1 at sector 1 (offset 512), FAT #2 at sector 10 (offset 5120)
  const fat1 = 1 * SECTOR_SIZE;
  const fat2 = 10 * SECTOR_SIZE;
  const rootOff = 19 * SECTOR_SIZE;   // sectors 19..32 (14 sectors = 224 entries)
  const dataOff = 33 * SECTOR_SIZE;   // sector 33..2879 = 2847 clusters (clusters 2..2848)
  const maxDataClusters = 2847;

  // Reserved clusters 0 & 1 in both FATs
  writeFat12Entry(u8, fat1, 0, 0xff0);
  writeFat12Entry(u8, fat1, 1, 0xfff);
  writeFat12Entry(u8, fat2, 0, 0xff0);
  writeFat12Entry(u8, fat2, 1, 0xfff);

  // Root entry #0: Volume label
  const now = encodeDosDateTime();
  writeAscii(u8, rootOff, cleanLabel, 11);
  u8[rootOff + 11] = 0x08;
  dv.setUint16(rootOff + 22, now.timeVal, true);
  dv.setUint16(rootOff + 24, now.dateVal, true);

  let dirIndex = 1;
  let nextCluster = 2;
  const usedNames = new Set();

  for (const item of entries) {
    if (dirIndex >= 224) throw new Error('Too many root directory files (FAT12 floppy limit is 223 files).');
    const data = item.data instanceof Uint8Array ? item.data : new Uint8Array(item.data || []);
    const clustersNeeded = data.length === 0 ? 0 : Math.ceil(data.length / SECTOR_SIZE);
    if (nextCluster - 2 + clustersNeeded > maxDataClusters) {
      throw new Error(`Not enough space on 1.44 MB floppy image while adding "${item.name}".`);
    }

    const { base, ext } = toDos83Name(item.name, usedNames);
    const startCluster = clustersNeeded > 0 ? nextCluster : 0;

    for (let i = 0; i < clustersNeeded; i++) {
      const c = nextCluster++;
      const sectorOffset = dataOff + (c - 2) * SECTOR_SIZE;
      const chunk = data.subarray(i * SECTOR_SIZE, (i + 1) * SECTOR_SIZE);
      u8.set(chunk, sectorOffset);
      const nextVal = i === clustersNeeded - 1 ? 0xfff : c + 1;
      writeFat12Entry(u8, fat1, c, nextVal);
      writeFat12Entry(u8, fat2, c, nextVal);
    }

    const eOff = rootOff + dirIndex * 32;
    writeAscii(u8, eOff, base, 8);
    writeAscii(u8, eOff + 8, ext, 3);
    u8[eOff + 11] = 0x20; // Archive attribute
    const ts = encodeDosDateTime(item.modified || Date.now());
    dv.setUint16(eOff + 22, ts.timeVal, true);
    dv.setUint16(eOff + 24, ts.dateVal, true);
    dv.setUint16(eOff + 26, startCluster, true);
    dv.setUint32(eOff + 28, data.length, true);
    dirIndex++;
  }

  return u8;
}

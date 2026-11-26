// Free & Open-Source BIOS / System Firmware Boot Utilities for DOSBox & Retro Computers
// Contains zero copyrighted ROMs, games, or applications — only blank formatted
// virtual media generators and open-source firmware boot descriptors.

export const ESTYJS_CDN_BASE = 'https://cdn.jsdelivr.net/gh/kaiec/EstyJS@main/';
export const SAE_CDN_BASE = 'https://cdn.jsdelivr.net/gh/naTmeg/ScriptedAmigaEmulator@master/';
export const VAMIGA_ROMS_BASE = 'https://cdn.jsdelivr.net/gh/vAmigaWeb/vAmigaWeb@main/roms/';

export const FREE_BIOS_SYSTEMS = [
  {
    id: 'dosbox',
    sysId: 'dosbox',
    short: 'DOS',
    label: 'DOS — FreeDOS / DOSBox BIOS (C:\\>)',
    biosName: 'DOSBox System BIOS Shell',
    detail: 'Boots clean open-source DOS prompt (C:\\>) with zero games/apps',
    sourceLabel: 'js-dos / DOSBox',
    sourceUrl: 'https://v8.js-dos.com/',
  },
  {
    id: 'amiga',
    sysId: 'amiga',
    short: 'Amiga',
    label: 'Amiga A500 — PUAE Built-in AROS Kickstart',
    biosName: 'PUAE Built-in AROS Kickstart',
    detail: 'Open-source Kickstart compiled into libretro-uae (puae_kickstart=aros) + blank OFS DF0:',
    sourceLabel: 'libretro-uae (AROS)',
    sourceUrl: 'https://github.com/EmulatorJS/libretro-uae',
  },
  {
    id: 'amiga_sae_aros',
    sysId: 'amiga',
    short: 'Amiga SAE',
    label: 'Amiga A500 — SAE + AROS m68k (ROM+EXT)',
    biosName: 'AROS m68k Kickstart (SAE Pure JS)',
    detail: 'Pure-JS ScriptedAmigaEmulator + official AROS m68k ROM & EXT',
    sourceLabel: 'naTmeg/ScriptedAmigaEmulator',
    sourceUrl: 'https://github.com/naTmeg/ScriptedAmigaEmulator/tree/master/db',
    saeModel: 'A500',
    romUrl: `${SAE_CDN_BASE}db/aros-amiga-m68k-rom.bin`,
    extUrl: `${SAE_CDN_BASE}db/aros-amiga-m68k-ext.bin`,
  },
  {
    id: 'amiga_vami_aros',
    sysId: 'amiga',
    short: 'Amiga A1200',
    label: 'Amiga A1200 — SAE + vAmiga AROS 2026',
    biosName: 'vAmigaWeb AROS 2026 Kickstart',
    detail: 'Updated AROS Kickstart + Extended ROM (vAmigaWeb) on Amiga 1200 AGA',
    sourceLabel: 'vAmigaWeb/roms (AROS)',
    sourceUrl: 'https://github.com/vAmigaWeb/vAmigaWeb/tree/main/roms',
    saeModel: 'A1200',
    romUrl: `${VAMIGA_ROMS_BASE}aros-rom-20260820.bin`,
    extUrl: `${VAMIGA_ROMS_BASE}aros-ext-20260820.bin`,
  },
  {
    id: 'amiga_emutos',
    sysId: 'amiga',
    short: 'Amiga TOS',
    label: 'Amiga A500 — SAE + EmuTOS Amiga BIOS',
    biosName: 'EmuTOS for Amiga (256 KB GPLv2)',
    detail: 'Standalone open-source EmuTOS desktop & shell compiled for Amiga hardware',
    sourceLabel: 'vAmigaWeb/roms (emutos-amiga)',
    sourceUrl: 'https://github.com/vAmigaWeb/vAmigaWeb/blob/main/roms/emutos-amiga.bin',
    saeModel: 'A500',
    romUrl: `${VAMIGA_ROMS_BASE}emutos-amiga.bin`,
    extUrl: '',
  },
  {
    id: 'atarist',
    sysId: 'atarist',
    short: 'Atari ST',
    label: 'Atari ST — EmuTOS 1.4 BIOS (EstyJS)',
    biosName: 'EmuTOS 1.4 (GPLv2)',
    detail: 'Open-source Atari TOS replacement desktop & EmuCON shell',
    sourceLabel: 'EstyJS + EmuTOS 1.4',
    sourceUrl: 'https://github.com/kaiec/EstyJS',
  },
  {
    id: 'amstradcpc',
    sysId: 'amstradcpc',
    short: 'Amstrad',
    label: 'Amstrad CPC — Caprice32 BASIC 1.1',
    biosName: 'CPC 6128 Firmware / BASIC 1.1',
    detail: 'Built-in Caprice32 CPC 6128 firmware + blank formatted AMSDOS DSK',
    sourceLabel: 'Caprice32 (libretro)',
    sourceUrl: 'https://github.com/EmulatorJS/EmulatorJS',
  },
  {
    id: 'zxspectrum',
    sysId: 'zxspectrum',
    short: 'ZX Spec',
    label: 'ZX Spectrum — Fuse System / BASIC',
    biosName: 'Fuse Spectrum System ROM',
    detail: 'Built-in Fuse ZX Spectrum firmware + blank TZX tape',
    sourceLabel: 'Fuse (libretro)',
    sourceUrl: 'https://github.com/EmulatorJS/EmulatorJS',
  },
  {
    id: 'c64',
    sysId: 'c64',
    short: 'C64',
    label: 'Commodore 64 — VICE BASIC V2',
    biosName: 'VICE KERNAL / BASIC V2',
    detail: 'Open-source VICE C64 system firmware + blank formatted D64 disk',
    sourceLabel: 'VICE x64sc (libretro)',
    sourceUrl: 'https://github.com/EmulatorJS/EmulatorJS',
  },
];

export const CONSOLE_SYSTEMS = [
  { id: 'arcade', short: 'FBNeo', label: 'Arcade / Neo Geo (FBNeo)', core: 'arcade', exts: ['fbf', 'neo', 'zip', '7z'], hint: '.zip, .7z, .neo (FBNeo Arcade / Neo Geo)' },
  { id: 'nes', short: 'NES', label: 'NES / Famicom (FCEUmm)', core: 'nes', exts: ['nes', 'fds', 'unif', 'unf'], hint: '.nes, .fds, .unif, .zip (FCEUmm)' },
  { id: 'snes', short: 'SNES', label: 'Super Nintendo (Snes9x)', core: 'snes', exts: ['sfc', 'smc', 'fig', 'swc'], hint: '.sfc, .smc, .fig, .zip (Snes9x)' },
  { id: 'segaMD', short: 'Genesis', label: 'Sega Genesis / Mega Drive', core: 'segaMD', exts: ['md', 'gen', 'smd', '32x'], hint: '.md, .gen, .smd, .32x, .zip (Genesis Plus GX)' },
  { id: 'segaMS', short: 'SMS/GG', label: 'Sega Master System / Game Gear', core: 'segaMS', exts: ['sms', 'gg', 'sg'], hint: '.sms, .gg, .sg, .zip (Genesis Plus GX)' },
  { id: 'pce', short: 'PCE', label: 'NEC PC Engine / TurboGrafx-16', core: 'pce', exts: ['pce', 'ccd'], hint: '.pce, .zip (Mednafen PCE)' },
  { id: 'gb', short: 'GB/GBC', label: 'Game Boy / Color (Gambatte)', core: 'gb', exts: ['gb', 'gbc'], hint: '.gb, .gbc, .zip (Gambatte)' },
  { id: 'gba', short: 'GBA', label: 'Game Boy Advance (mGBA)', core: 'gba', exts: ['gba'], hint: '.gba, .zip (mGBA)' },
];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32Bytes(u8) {
  let crc = 0xffffffff;
  for (let i = 0; i < u8.length; i++) {
    crc = CRC_TABLE[(crc ^ u8[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeAscii(buf, offset, str) {
  for (let i = 0; i < str.length; i++) {
    buf[offset + i] = str.charCodeAt(i) & 0xff;
  }
}

export function makeBlankAmigaAdf(volumeName = 'AROS_Boot') {
  const SECTORS = 1760;
  const SEC_SIZE = 512;
  const ROOT_SEC = 880;
  const BM_SEC = 881;
  const buf = new Uint8Array(SECTORS * SEC_SIZE);
  const dv = new DataView(buf.buffer);

  writeAscii(buf, 0, 'DOS');
  buf[3] = 0;
  dv.setUint32(8, ROOT_SEC, false);

  const bootCode = [
    0x43, 0xfa, 0x00, 0x18,
    0x4e, 0xae, 0xff, 0xa0,
    0x4a, 0x80,
    0x67, 0x0a,
    0x20, 0x40,
    0x20, 0x68, 0x00, 0x16,
    0x70, 0x00,
    0x4e, 0x75,
    0x70, 0xff,
    0x4e, 0x75,
  ];
  buf.set(bootCode, 12);
  writeAscii(buf, 0x26, 'dos.library\0');

  dv.setUint32(4, 0, false);
  let sum = 0;
  for (let i = 0; i < 1024; i += 4) {
    sum += dv.getUint32(i, false);
    if (sum > 0xffffffff) sum = (sum >>> 0) + 1;
    sum = sum >>> 0;
  }
  dv.setUint32(4, (~sum) >>> 0, false);

  const rOff = ROOT_SEC * SEC_SIZE;
  dv.setUint32(rOff + 0, 2, false);
  dv.setUint32(rOff + 12, 72, false);
  dv.setInt32(rOff + 312, -1, false);
  dv.setUint32(rOff + 316, BM_SEC, false);
  const cleanName = volumeName.slice(0, 30);
  buf[rOff + 432] = cleanName.length;
  writeAscii(buf, rOff + 433, cleanName);
  dv.setUint32(rOff + 508, 1, false);

  let rSum = 0;
  for (let i = 0; i < SEC_SIZE; i += 4) {
    if (i === 20) continue;
    rSum = (rSum + dv.getUint32(rOff + i, false)) >>> 0;
  }
  dv.setUint32(rOff + 20, ((~rSum + 1) >>> 0), false);

  const bOff = BM_SEC * SEC_SIZE;
  for (let w = 0; w < 54; w++) {
    dv.setUint32(bOff + 4 + w * 4, 0xffffffff, false);
  }
  dv.setUint32(bOff + 4 + 54 * 4, 0x3fffffff, false);

  for (const sec of [ROOT_SEC, BM_SEC]) {
    const bp = sec - 2;
    const wi = Math.floor(bp / 32);
    const bi = bp % 32;
    const cur = dv.getUint32(bOff + 4 + wi * 4, false);
    dv.setUint32(bOff + 4 + wi * 4, (cur & ~(1 << bi)) >>> 0, false);
  }

  let bSum = 0;
  for (let i = 4; i < SEC_SIZE; i += 4) {
    bSum = (bSum + dv.getUint32(bOff + i, false)) >>> 0;
  }
  dv.setUint32(bOff + 0, ((~bSum + 1) >>> 0), false);

  return new Blob([buf], { type: 'application/octet-stream' });
}

export function makeBlankCpcDsk() {
  const TRACKS = 40;
  const SECTORS = 9;
  const SEC_SIZE = 512;
  const TRACK_BLOCK_SIZE = 256 + SECTORS * SEC_SIZE;
  const buf = new Uint8Array(256 + TRACKS * TRACK_BLOCK_SIZE);

  writeAscii(buf, 0, 'MV - CPCEMU Disk-File\r\nDisk-Info\r\n');
  writeAscii(buf, 0x22, 'Win95');
  buf[0x30] = TRACKS;
  buf[0x31] = 1;
  buf[0x32] = TRACK_BLOCK_SIZE & 0xff;
  buf[0x33] = (TRACK_BLOCK_SIZE >> 8) & 0xff;

  for (let t = 0; t < TRACKS; t++) {
    const tOff = 256 + t * TRACK_BLOCK_SIZE;
    writeAscii(buf, tOff, 'Track-Info\r\n');
    buf[tOff + 0x10] = t;
    buf[tOff + 0x11] = 0;
    buf[tOff + 0x14] = 2;
    buf[tOff + 0x15] = SECTORS;
    buf[tOff + 0x16] = 0x4e;
    buf[tOff + 0x17] = 0xe5;

    for (let s = 0; s < SECTORS; s++) {
      const sInfo = tOff + 0x18 + s * 8;
      buf[sInfo + 0] = t;
      buf[sInfo + 1] = 0;
      buf[sInfo + 2] = 0xc1 + s;
      buf[sInfo + 3] = 2;
      buf[sInfo + 4] = 0;
      buf[sInfo + 5] = 0;
    }
    buf.fill(0xe5, tOff + 256, tOff + TRACK_BLOCK_SIZE);
  }

  return new Blob([buf], { type: 'application/octet-stream' });
}

export function makeBlankZxTzx() {
  const buf = new Uint8Array(13);
  writeAscii(buf, 0, 'ZXTape!');
  buf[7] = 0x1a;
  buf[8] = 0x01;
  buf[9] = 0x14;
  buf[10] = 0x20;
  buf[11] = 0x0a;
  buf[12] = 0x00;
  return new Blob([buf], { type: 'application/octet-stream' });
}

export function makeBlankC64D64(diskName = 'EMPTY DISK') {
  const TRACK_SECTORS = [
    21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21,
    19, 19, 19, 19, 19, 19, 19,
    18, 18, 18, 18, 18, 18,
    17, 17, 17, 17, 17,
  ];
  const TOTAL_SECTORS = TRACK_SECTORS.reduce((a, b) => a + b, 0);
  const buf = new Uint8Array(TOTAL_SECTORS * 256);

  let t18Sec = 0;
  for (let i = 0; i < 17; i++) t18Sec += TRACK_SECTORS[i];
  const bamOff = t18Sec * 256;

  buf[bamOff + 0] = 18;
  buf[bamOff + 1] = 1;
  buf[bamOff + 2] = 0x41;
  buf[bamOff + 3] = 0x00;

  for (let t = 0; t < 35; t++) {
    const entry = bamOff + 4 + t * 4;
    const numSec = TRACK_SECTORS[t];
    let free = numSec;
    let mask = ((1 << numSec) - 1) >>> 0;
    if (t === 17) {
      free -= 2;
      mask &= ~0x03;
    }
    buf[entry + 0] = free;
    buf[entry + 1] = mask & 0xff;
    buf[entry + 2] = (mask >> 8) & 0xff;
    buf[entry + 3] = (mask >> 16) & 0xff;
  }

  buf.fill(0xa0, bamOff + 0x90, bamOff + 0xab);
  const label = diskName.toUpperCase().slice(0, 16);
  writeAscii(buf, bamOff + 0x90, label);
  writeAscii(buf, bamOff + 0xa2, 'W9');
  writeAscii(buf, bamOff + 0xa5, '2A');

  const dirOff = (t18Sec + 1) * 256;
  buf[dirOff + 0] = 0x00;
  buf[dirOff + 1] = 0xff;

  return new Blob([buf], { type: 'application/octet-stream' });
}

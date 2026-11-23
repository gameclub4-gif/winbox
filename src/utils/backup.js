// Lazy Virtual PC Backup & Restore using fflate ZIP archives
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import * as fs from '../os/fs.js';
import { saveLocalFile } from '../os/localFiles.js';
import { setSettings } from '../os/settings.js';

const BACKUP_LS_KEYS = ['win95.smart.settings.v1', 'win95.bookmarks', 'win95-mp-playlist', 'win95.user.romLinks.v1'];
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export async function createVirtualPCBackup() {
  const nodes = fs.exportAllNodes();
  const files = {};
  const manifestNodes = [];
  let totalBytes = 0;

  for (const n of nodes) {
    const meta = {
      id: n.id,
      name: n.name,
      parent: n.parent,
      type: n.type,
      mime: n.mime || undefined,
      size: n.size || 0,
      created: n.created || Date.now(),
      modified: n.modified || Date.now(),
      trashed: n.trashed || undefined,
      dataKind: 'none',
      filePath: undefined,
    };

    if (n.type === 'file' && n.data !== undefined && n.data !== null) {
      const safeId = String(n.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      const entryPath = `files/${safeId}`;
      if (typeof n.data === 'string') {
        meta.dataKind = 'string';
        meta.filePath = entryPath;
        const u8 = strToU8(n.data);
        files[entryPath] = u8;
        totalBytes += u8.length;
      } else if (n.data instanceof Blob) {
        meta.dataKind = 'blob';
        meta.filePath = entryPath;
        const u8 = new Uint8Array(await n.data.arrayBuffer());
        files[entryPath] = u8;
        totalBytes += u8.length;
      } else if (n.data instanceof Uint8Array) {
        meta.dataKind = 'blob';
        meta.filePath = entryPath;
        files[entryPath] = n.data;
        totalBytes += n.data.length;
      }
    }
    manifestNodes.push(meta);
  }

  const localStore = {};
  for (const k of BACKUP_LS_KEYS) {
    try {
      const val = localStorage.getItem(k);
      if (val !== null) localStore[k] = val;
    } catch { /* ignore */ }
  }

  const manifest = {
    version: 1,
    app: 'win95-smart-edition',
    exportedAt: new Date().toISOString(),
    nodes: manifestNodes,
    localStore,
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  const zipped = zipSync(files, { level: 1 });
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `Win95-VirtualPC-Backup-${dateStamp}.zip`;
  const blob = new Blob([zipped], { type: 'application/zip' });
  await saveLocalFile({ blob, suggestedName: filename, description: 'ZIP Archive', ext: '.zip' });

  return {
    filename,
    nodeCount: manifestNodes.length,
    fileCount: manifestNodes.filter((x) => x.type === 'file').length,
    archiveBytes: zipped.length,
    totalBytes,
  };
}

export async function restoreVirtualPCBackup(file) {
  if (!file) throw new Error('No backup file selected.');
  if (file.size > 150 * 1024 * 1024) {
    throw new Error('Backup ZIP exceeds the 150 MB browser safety limit.');
  }

  let unzipped;
  try {
    unzipped = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error(`"${file.name}" is not a valid ZIP backup archive.`);
  }

  const manifestEntry = unzipped['manifest.json'];
  if (!manifestEntry) {
    throw new Error('This ZIP does not contain a Win95 Virtual PC backup (missing manifest.json).');
  }

  let manifest;
  try {
    manifest = JSON.parse(strFromU8(manifestEntry));
  } catch {
    throw new Error('Corrupted manifest.json in backup archive.');
  }

  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.nodes)) {
    throw new Error('Unsupported Virtual PC backup format.');
  }

  const restoredNodes = [];
  for (const meta of manifest.nodes) {
    if (!meta || typeof meta.id !== 'string' || typeof meta.name !== 'string') continue;
    if (UNSAFE_KEYS.has(meta.id) || meta.name.includes('..') || meta.name.includes('\0')) continue;

    let data = undefined;
    if (meta.filePath && typeof meta.filePath === 'string') {
      if (meta.filePath.includes('..') || meta.filePath.startsWith('/') || !meta.filePath.startsWith('files/')) {
        throw new Error(`Unsafe archive path detected: ${meta.filePath}`);
      }
      const raw = unzipped[meta.filePath];
      if (raw) {
        data = meta.dataKind === 'string'
          ? strFromU8(raw)
          : new Blob([raw], { type: meta.mime || 'application/octet-stream' });
      }
    }

    restoredNodes.push({
      id: meta.id,
      name: meta.name,
      parent: meta.parent ?? null,
      type: meta.type === 'folder' ? 'folder' : 'file',
      data: meta.type === 'folder' ? undefined : (data ?? ''),
      mime: meta.mime,
      size: meta.type === 'folder' ? 0 : (meta.size || 0),
      created: Number(meta.created) || Date.now(),
      modified: Number(meta.modified) || Date.now(),
      ...(meta.trashed && typeof meta.trashed === 'object' ? { trashed: { parent: String(meta.trashed.parent || fs.ROOT), at: Number(meta.trashed.at) || Date.now() } } : {}),
    });
  }

  await fs.restoreSnapshot(restoredNodes);

  let restoredSettingsCount = 0;
  if (manifest.localStore && typeof manifest.localStore === 'object') {
    for (const key of BACKUP_LS_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(manifest.localStore, key)) continue;
      const val = manifest.localStore[key];
      if (typeof val !== 'string') continue;
      try {
        if (key === 'win95.smart.settings.v1') {
          const parsed = JSON.parse(val);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            setSettings(parsed);
            restoredSettingsCount++;
          }
        } else {
          JSON.parse(val);
          localStorage.setItem(key, val);
          restoredSettingsCount++;
        }
      } catch { /* ignore invalid entry */ }
    }
  }

  return {
    nodeCount: restoredNodes.length,
    fileCount: restoredNodes.filter((n) => n.type === 'file').length,
    restoredSettingsCount,
    exportedAt: manifest.exportedAt || null,
  };
}

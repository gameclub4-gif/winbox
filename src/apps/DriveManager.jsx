import { useState } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import Icon, { iconForFile } from '../os/icons.jsx';
import * as fs from '../os/fs.js';
import { fmtSize } from '../os/actions.js';
import { pickLocalFiles } from '../os/localFiles.js';
import { pickLocalDirectory } from '../utils/localFolder.js';
import {
  useVirtualDrives,
  mountFloppyA,
  ejectFloppyA,
  mountCdromD,
  ejectCdromD,
  mountRemovableFolder,
  mountRemovableDisk,
  ejectRemovable,
} from '../utils/virtualDrives.js';

export default function DriveManager({ win }) {
  const os = useOS();
  fs.useFS();
  const vd = useVirtualDrives();
  const [browseId, setBrowseId] = useState(null);
  const [status, setStatus] = useState('One interface for A: Floppy, C: Hard Disk, D: CD-ROM, and Removable drives.');

  const cUsed = fs.folderSize(fs.ROOT);
  const activeFolder = vd.removable.find((r) => r.id === browseId && r.kind === 'folder');

  const mountFloppyPC = async () => {
    const picked = await pickLocalFiles({ accept: '.img,.ima,.vfd' });
    if (!picked?.file) return;
    mountFloppyA({
      name: picked.name,
      size: picked.file.size,
      readBlob: async () => picked.file,
    });
    setStatus(`Mounted ${picked.name} in A: Floppy Drive.`);
  };

  const mountFloppyC = async () => {
    const n = await os.fileDialog({ mode: 'open', exts: ['img', 'ima', 'vfd'], title: 'Mount Floppy Image (Drive C:)', start: 'games' });
    if (!n) return;
    mountFloppyA({
      name: n.name,
      size: n.size,
      fsId: n.id,
      readBlob: async () => fs.toBlob(n),
    });
    setStatus(`Mounted ${n.name} in A: Floppy Drive.`);
  };

  const mountCdPC = async () => {
    const picked = await pickLocalFiles({ accept: '.iso,.cue,.bin' });
    if (!picked?.file) return;
    mountCdromD({
      name: picked.name,
      size: picked.file.size,
      readBlob: async () => picked.file,
    });
    setStatus(`Mounted ${picked.name} in D: CD-ROM Drive (zero-copy).`);
  };

  const mountCdC = async () => {
    const n = await os.fileDialog({ mode: 'open', exts: ['iso', 'cue', 'bin'], title: 'Mount CD-ROM Image (Drive C:)', start: 'games' });
    if (!n) return;
    mountCdromD({
      name: n.name,
      size: n.size,
      fsId: n.id,
      readBlob: async () => fs.toBlob(n),
    });
    setStatus(`Mounted ${n.name} in D: CD-ROM Drive.`);
  };

  const addLocalFolder = async () => {
    const res = await pickLocalDirectory();
    if (!res) return;
    const item = mountRemovableFolder(res);
    setBrowseId(item.id);
    setStatus(`Mounted PC Folder "${res.name}" as ${item.letter} (${res.entries.length} files, zero-copy).`);
  };

  const addRemovableDisk = async () => {
    const picked = await pickLocalFiles({ accept: '.img,.ima,.vfd,.zip,.adf,.d64,.st,.dsk,.tap' });
    if (!picked?.file) return;
    const item = mountRemovableDisk({
      name: picked.name,
      size: picked.file.size,
      readBlob: async () => picked.file,
    });
    setStatus(`Mounted ${picked.name} as Removable ${item.letter}`);
  };

  const launchMountedItem = async (slot) => {
    if (!slot?.readBlob) return;
    const blob = await slot.readBlob();
    os.open('dosgames', { mountedSlot: { name: slot.name, blob } });
  };

  const inspectMountedItem = async (slot) => {
    if (!slot?.readBlob) return;
    if (slot.fsId) {
      os.open('inspector', { fileId: slot.fsId });
      return;
    }
    const blob = await slot.readBlob();
    const tmp = fs.create({ name: slot.name, parent: 'temp', data: blob, mime: blob.type || 'application/octet-stream' });
    os.open('inspector', { fileId: tmp.id });
  };

  const openRemovableEntry = async (entry) => {
    const f = await entry.getFile();
    const e = entry.ext;
    if (['wav', 'mp3', 'ogg', 'm4a', 'flac', 'aac', 'mp4', 'webm', 'mov', 'ogv', 'mkv'].includes(e)) {
      os.open('media', { localFile: f });
    } else if (['zip', 'jsdos', 'img', 'ima', 'vfd', 'iso', 'cue', 'bin', 'adf', 'd64', 'prg', 'dsk', 'tap', 'st', 'msa', 'z80'].includes(e)) {
      os.open('dosgames', { mountedSlot: { name: entry.name, blob: f } });
    } else {
      const n = await fs.importFile(f, 'temp');
      os.openNode(n);
    }
  };

  return (
    <div className="app dm">
      <MenuBar menus={[
        { label: '&Drives', items: [
          { label: 'Mount Floppy &A: from PC...', onClick: mountFloppyPC },
          { label: 'Mount Floppy A: from &C:...', onClick: mountFloppyC },
          { label: 'Mount CD-ROM &D: from PC...', onClick: mountCdPC },
          { label: 'Mount &Local PC Folder (Zero-Copy)...', onClick: addLocalFolder },
          { sep: true },
          { label: 'E&xit', onClick: () => os.close(win.id) },
        ] },
        { label: '&Tools', items: [
          { label: '&Disk & ZIP Inspector...', onClick: () => os.open('inspector') },
          { label: 'Create &Bootable Floppy...', onClick: () => os.open('inspector', { mode: 'create' }) },
          { label: 'Virtual PC &Backup (.zip)...', onClick: () => os.open('control', { applet: 'system' }) },
          { label: '&DOSBox & Retro Simulators...', onClick: () => os.open('dosgames') },
        ] },
        { label: '&Help', items: [{ label: '&Help Topics', onClick: () => os.open('help') }] },
      ]} />

      <div className="dm-body">
        <div className="dm-grid">
          {/* Drive A: Floppy */}
          <div className="groupbox dm-card">
            <span className="gb-title">A:\ 3.5" Floppy Drive</span>
            <div className="dm-head">
              <Icon name="zip" size={28} />
              <div className="dm-info">
                <b>{vd.floppyA ? vd.floppyA.name : '(Empty — No floppy inserted)'}</b>
                <span className="dm-meta">{vd.floppyA ? `${fmtSize(vd.floppyA.size)} · Ready` : 'Supports .IMG / .IMA / .VFD'}</span>
              </div>
            </div>
            <div className="btn-row dm-actions">
              <button className="btn tool" onClick={mountFloppyPC}>Mount PC...</button>
              <button className="btn tool" onClick={mountFloppyC}>Mount C:...</button>
              <button className="btn tool" onClick={() => os.open('inspector', { mode: 'create' })}>New Boot Disk...</button>
              <button className="btn tool" disabled={!vd.floppyA} onClick={() => inspectMountedItem(vd.floppyA)}>Inspect</button>
              <button className="btn tool default" disabled={!vd.floppyA} onClick={() => launchMountedItem(vd.floppyA)}>Boot A:\</button>
              <button className="btn tool" disabled={!vd.floppyA} onClick={() => { ejectFloppyA(); setStatus('Ejected A: Floppy.'); }}>Eject</button>
            </div>
          </div>

          {/* Drive C: Virtual Hard Disk */}
          <div className="groupbox dm-card">
            <span className="gb-title">C:\ Virtual Hard Disk</span>
            <div className="dm-head">
              <Icon name="drive" size={28} />
              <div className="dm-info">
                <b>Windows 95 Local Disk (IndexedDB)</b>
                <span className="dm-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtSize(cUsed)} stored · C:\BIOS, C:\Saves, C:\DOS Games</span>
              </div>
            </div>
            <div className="btn-row dm-actions">
              <button className="btn tool default" onClick={() => os.open('explorer', { folderId: fs.ROOT })}>Explore C:\</button>
              <button className="btn tool" onClick={() => os.open('control', { applet: 'system' })}>Backup / Restore...</button>
              <button className="btn tool" onClick={() => os.open('recycle')}>Clean Cache...</button>
              <button className="btn tool" onClick={() => os.open('sysmon')}>Monitor...</button>
            </div>
          </div>

          {/* Drive D: CD-ROM */}
          <div className="groupbox dm-card">
            <span className="gb-title">D:\ Optical CD-ROM Drive</span>
            <div className="dm-head">
              <Icon name="media" size={28} />
              <div className="dm-info">
                <b>{vd.cdromD ? vd.cdromD.name : '(Empty — No disc inserted)'}</b>
                <span className="dm-meta">{vd.cdromD ? `${fmtSize(vd.cdromD.size)} · Mounted` : 'Supports .ISO / .CUE / .BIN (zero-copy)'}</span>
              </div>
            </div>
            <div className="btn-row dm-actions">
              <button className="btn tool" onClick={mountCdPC}>Mount ISO (PC)...</button>
              <button className="btn tool" onClick={mountCdC}>Mount C:...</button>
              <button className="btn tool default" disabled={!vd.cdromD} onClick={() => launchMountedItem(vd.cdromD)}>Run D:\</button>
              <button className="btn tool" disabled={!vd.cdromD} onClick={() => { ejectCdromD(); setStatus('Ejected D: CD-ROM.'); }}>Eject</button>
            </div>
          </div>

          {/* Drive E+: Removable Disks & Zero-Copy Local PC Folders */}
          <div className="groupbox dm-card">
            <span className="gb-title">E:\+ Removable &amp; Local PC Folders</span>
            <div className="dm-head">
              <Icon name="folderOpen" size={28} />
              <div className="dm-info">
                <b>{vd.removable.length ? `${vd.removable.length} removable mount(s) active` : 'No removable folders or disks mounted'}</b>
                <span className="dm-meta">Zero-copy folder access keeps large ROMs/ISOs on your PC</span>
              </div>
            </div>
            <div className="btn-row dm-actions">
              <button className="btn tool default" onClick={addLocalFolder}>+ Mount PC Folder...</button>
              <button className="btn tool" onClick={addRemovableDisk}>+ Mount Removable Disk...</button>
            </div>
          </div>
        </div>

        {vd.removable.length > 0 && (
          <div className="field list-details dm-rem-list">
            <div className="ld-head" style={{ gridTemplateColumns: '60px 2fr 90px 140px' }}>
              <span>Drive</span><span>Volume / Folder</span><span>Contents</span><span>Actions</span>
            </div>
            {vd.removable.map((r) => (
              <div key={r.id} className={'ld-row ' + (browseId === r.id ? 'sel' : '')} style={{ gridTemplateColumns: '60px 2fr 90px 140px' }} onClick={() => r.kind === 'folder' && setBrowseId(r.id)}>
                <span><b>{r.letter}</b></span>
                <span className="ld-name"><Icon name={r.kind === 'folder' ? 'folderOpen' : 'drive'} size={14} /><span>{r.name}</span></span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.kind === 'folder' ? `${r.fileCount} file(s)` : fmtSize(r.size)}</span>
                <span style={{ display: 'flex', gap: 4 }}>
                  {r.kind === 'folder' ? (
                    <button className="btn tool" style={{ padding: '1px 5px', fontSize: 10 }} onClick={() => setBrowseId(r.id)}>Browse</button>
                  ) : (
                    <>
                      <button className="btn tool" style={{ padding: '1px 5px', fontSize: 10 }} onClick={() => launchMountedItem(r)}>Run</button>
                      <button className="btn tool" style={{ padding: '1px 5px', fontSize: 10 }} onClick={() => inspectMountedItem(r)}>Inspect</button>
                    </>
                  )}
                  <button className="btn tool" style={{ padding: '1px 5px', fontSize: 10 }} onClick={() => { if (browseId === r.id) setBrowseId(null); ejectRemovable(r.id); }}>Eject</button>
                </span>
              </div>
            ))}
          </div>
        )}

        {activeFolder && (
          <div className="field list-details dm-folder-list">
            <div className="ld-head" style={{ gridTemplateColumns: '2fr 80px 80px' }}>
              <span>{activeFolder.letter} {activeFolder.name} (Double-click to launch)</span>
              <span>Size</span>
              <span>Action</span>
            </div>
            {activeFolder.entries.map((en) => (
              <div key={en.id} className="ld-row" style={{ gridTemplateColumns: '2fr 80px 80px' }} onDoubleClick={() => openRemovableEntry(en)}>
                <span className="ld-name" title={en.relPath}><Icon name={iconForFile({ type: 'file', name: en.name })} size={14} /><span>{en.relPath}</span></span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtSize(en.size)}</span>
                <span><button className="btn tool" style={{ padding: '1px 5px', fontSize: 10 }} onClick={() => openRemovableEntry(en)}>Open</button></span>
              </div>
            ))}
          </div>
        )}
      </div>

      <StatusBar>
        <span>{status}</span>
        <span>A: {vd.floppyA ? 'Mounted' : 'Empty'} · D: {vd.cdromD ? 'Mounted' : 'Empty'}</span>
      </StatusBar>
    </div>
  );
}

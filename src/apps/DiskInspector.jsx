import { useState, useEffect } from 'react';
import { unzipSync, strToU8, strFromU8 } from 'fflate';
import { useOS } from '../os/OS.jsx';
import { MenuBar, Tabs, StatusBar } from '../os/widgets.jsx';
import Icon, { iconForFile } from '../os/icons.jsx';
import * as fs from '../os/fs.js';
import { fmtSize } from '../os/actions.js';
import { pickLocalFiles, saveLocalFile } from '../os/localFiles.js';
import { isFat12Image, parseFat12Image, createFat12Floppy } from '../utils/fat12.js';

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const FLOPPY_CAPACITY = 2847 * 512; // 1,457,664 usable data bytes on 1.44MB FAT12

function sanitizeRelPath(raw) {
  const parts = String(raw || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p && p !== '.');
  if (!parts.length) return null;
  if (parts[0] === '__MACOSX' || parts.some((p) => p === '..' || p.includes('\0'))) return null;
  return parts.map((p) => p.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120));
}

function isTextExt(name) {
  return /\.(txt|md|log|ini|bat|cfg|json|js|css|html?|rtf|xml|csv|inf|sys|asm|c|h|bas)$/i.test(name);
}

function ensureFolderChain(rootId, parts) {
  let cur = rootId;
  for (const name of parts) {
    const existing = fs.children(cur).find((c) => c.type === 'folder' && c.name.toLowerCase() === name.toLowerCase());
    if (existing) cur = existing.id;
    else cur = fs.create({ name, parent: cur, type: 'folder', unique: false }).id;
  }
  return cur;
}

export default function DiskInspector({ win, props }) {
  const os = useOS();
  fs.useFS();

  const [tab, setTab] = useState(props.mode === 'create' ? 'create' : 'inspect');
  const [archive, setArchive] = useState(null); // { name, format, info, entries }
  const [selected, setSelected] = useState(new Set());
  const [preview, setPreview] = useState(null); // { path, text }
  const [destFolder, setDestFolder] = useState('docs');
  const [status, setStatus] = useState('Open a .ZIP archive or FAT12 .IMG/.IMA/.VFD floppy image to inspect.');

  // Floppy builder state
  const [volLabel, setVolLabel] = useState('WIN95BOOT');
  const [floppyName, setFloppyName] = useState('MyBootDisk.img');
  const [bootable, setBootable] = useState(true);
  const [builderFiles, setBuilderFiles] = useState(() => [
    {
      id: 'init-autoexec',
      name: 'AUTOEXEC.BAT',
      data: strToU8('@ECHO OFF\r\nECHO Windows 95 Smart Boot Disk Ready!\r\nVER\r\nDIR /W\r\n'),
      modified: Date.now(),
    },
    {
      id: 'init-readme',
      name: 'README.TXT',
      data: strToU8('Created with Windows 95 Smart Disk & ZIP Inspector.\r\nMount this .IMG file in DOSBox & Retro Computers.\r\n'),
      modified: Date.now(),
    },
  ]);

  const inspectUint8 = (name, u8) => {
    if (u8.length > MAX_ARCHIVE_BYTES) {
      os.msg({ icon: 'error', title: 'Disk & ZIP Inspector', text: `Archive exceeds ${fmtSize(MAX_ARCHIVE_BYTES)} browser limit.` });
      return;
    }
    const lower = name.toLowerCase();
    try {
      if (lower.endsWith('.zip') || lower.endsWith('.jsdos') || (!isFat12Image(u8) && u8[0] === 0x50 && u8[1] === 0x4b)) {
        const raw = unzipSync(u8);
        const entries = [];
        let totalSize = 0;
        for (const [rawPath, bytes] of Object.entries(raw)) {
          const isDir = rawPath.endsWith('/');
          const cleanParts = sanitizeRelPath(rawPath);
          if (!cleanParts) continue;
          const cleanPath = cleanParts.join('/');
          totalSize += bytes.length;
          entries.push({
            path: cleanPath,
            name: cleanParts[cleanParts.length - 1],
            parts: cleanParts,
            size: bytes.length,
            isDir,
            attrText: isDir ? 'DIR' : 'ZIP',
            modified: null,
            data: bytes,
          });
        }
        entries.sort((a, b) => (a.isDir === b.isDir ? a.path.localeCompare(b.path) : a.isDir ? -1 : 1));
        setArchive({
          name,
          format: lower.endsWith('.jsdos') ? 'js-dos Bundle (ZIP)' : 'ZIP Archive',
          info: `${entries.filter((e) => !e.isDir).length} file(s) · ${fmtSize(totalSize)} uncompressed`,
          entries,
        });
        setSelected(new Set());
        setPreview(null);
        setTab('inspect');
        setStatus(`Loaded ${name} (${entries.length} entries)`);
        return;
      }

      if (isFat12Image(u8)) {
        const parsed = parseFat12Image(u8);
        const entries = parsed.files
          .map((f) => {
            const parts = sanitizeRelPath(f.path);
            if (!parts) return null;
            return {
              path: parts.join('/'),
              name: parts[parts.length - 1],
              parts,
              size: f.size,
              isDir: f.isDir,
              attrText: f.isDir ? 'DIR' : (f.attr & 0x04 ? 'SYS' : 'FAT12'),
              modified: f.modified,
              data: f.data,
            };
          })
          .filter(Boolean);
        setArchive({
          name,
          format: `FAT12 Floppy (${fmtSize(parsed.imageBytes)})`,
          info: `Label: ${parsed.volumeLabel} · Free: ${fmtSize(parsed.freeBytes)} of ${fmtSize(parsed.totalBytes)}`,
          entries,
        });
        setSelected(new Set());
        setPreview(null);
        setTab('inspect');
        setStatus(`Mounted FAT12 image ${name} (${entries.length} entries)`);
        return;
      }

      os.msg({
        icon: 'warning',
        title: 'Unrecognized Format',
        text: `"${name}" is not a recognized ZIP archive or standard FAT12 floppy image (.img/.ima/.vfd).`,
      });
    } catch (e) {
      os.msg({ icon: 'error', title: 'Inspector Error', text: `Could not read "${name}": ${e.message}` });
      setStatus('Error reading image: ' + e.message);
    }
  };

  useEffect(() => {
    if (props.fileId) {
      const n = fs.get(props.fileId);
      if (n) {
        fs.toBlob(n).arrayBuffer().then((ab) => inspectUint8(n.name, new Uint8Array(ab)));
      }
    }
  }, [win.nonce, props.fileId]); // eslint-disable-line

  const openFromPC = async () => {
    const picked = await pickLocalFiles({
      accept: '.zip,.jsdos,.img,.ima,.vfd',
      types: [{ description: 'ZIP & Floppy Images', accept: { 'application/zip': ['.zip', '.jsdos'], 'application/octet-stream': ['.img', '.ima', '.vfd'] } }],
    });
    if (picked?.file) {
      const ab = await picked.file.arrayBuffer();
      inspectUint8(picked.name, new Uint8Array(ab));
    }
  };

  const openFromC = async () => {
    const n = await os.fileDialog({ mode: 'open', exts: ['zip', 'jsdos', 'img', 'ima', 'vfd'], title: 'Open ZIP or Disk Image (Drive C:)', start: 'root' });
    if (n) {
      const ab = await fs.toBlob(n).arrayBuffer();
      inspectUint8(n.name, new Uint8Array(ab));
    }
  };

  const extractEntries = async (list) => {
    const filesOnly = list.filter((e) => !e.isDir);
    if (!filesOnly.length) return;
    try {
      const targetRootName = archive.name.replace(/\.[^.]+$/, '') || 'Extracted';
      const baseFolderId = fs.create({ name: fs.uniqueName(destFolder, targetRootName), parent: destFolder, type: 'folder', unique: false }).id;
      let count = 0;
      for (const entry of filesOnly) {
        const dirs = entry.parts.slice(0, -1);
        const parentId = dirs.length ? ensureFolderChain(baseFolderId, dirs) : baseFolderId;
        const data = isTextExt(entry.name) && entry.data.length < 2e6
          ? strFromU8(entry.data)
          : new Blob([entry.data], { type: 'application/octet-stream' });
        fs.create({ name: entry.name, parent: parentId, type: 'file', data });
        count++;
      }
      setStatus(`Extracted ${count} file(s) to ${fs.pathOf(baseFolderId)}`);
      const openIt = await os.msg({
        icon: 'info',
        title: 'Extraction Complete',
        text: `Extracted ${count} file(s) into:\n${fs.pathOf(baseFolderId)}\n\nOpen folder in Explorer?`,
        buttons: ['Yes', 'No'],
      });
      if (openIt === 'Yes') os.open('explorer', { folderId: baseFolderId });
    } catch (e) {
      os.msg({ icon: 'error', title: 'Extraction Error', text: e.message });
    }
  };

  const saveEntryToPC = async (entry) => {
    if (entry.isDir) return;
    await saveLocalFile({
      blob: new Blob([entry.data], { type: 'application/octet-stream' }),
      suggestedName: entry.name,
      description: 'Extracted File',
    });
    setStatus(`Saved ${entry.name} to local PC.`);
  };

  const toggleSelect = (path) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const previewEntry = (entry) => {
    if (entry.isDir) return;
    if (isTextExt(entry.name) && entry.data.length <= 256 * 1024) {
      setPreview({ path: entry.path, text: strFromU8(entry.data) });
    } else {
      const slice = entry.data.subarray(0, 256);
      const hex = [...slice].map((b) => b.toString(16).padStart(2, '0')).join(' ');
      setPreview({ path: entry.path, text: `[Binary Preview — first ${slice.length} of ${entry.size} bytes]\n\n${hex}` });
    }
  };

  // Builder helpers
  const builderUsedBytes = builderFiles.reduce((acc, f) => acc + Math.ceil((f.data.length || 1) / 512) * 512, 0);

  const addBuilderFromPC = async () => {
    const picked = await pickLocalFiles({ multiple: true });
    if (!picked?.length) return;
    const added = [];
    for (const p of picked) {
      const u8 = new Uint8Array(await p.file.arrayBuffer());
      added.push({
        id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6),
        name: p.name,
        data: u8,
        modified: p.file.lastModified || Date.now(),
      });
    }
    setBuilderFiles((prev) => [...prev, ...added]);
    setStatus(`Added ${added.length} file(s) to floppy builder.`);
  };

  const addBuilderFromC = async () => {
    const n = await os.fileDialog({ mode: 'open', title: 'Add File from Drive C: to Floppy', start: 'root' });
    if (!n) return;
    const u8 = new Uint8Array(await fs.toBlob(n).arrayBuffer());
    setBuilderFiles((prev) => [...prev, { id: 'b' + Date.now(), name: n.name, data: u8, modified: n.modified || Date.now() }]);
    setStatus(`Added ${n.name} from C:\\.`);
  };

  const editBuilderTextFile = async (item) => {
    const curText = strFromU8(item.data);
    const { Dialog } = await import('../os/widgets.jsx');
    const next = await os.dialog((done) => {
      let draft = curText;
      return (
        <Dialog title={`Edit ${item.name}`} onClose={() => done(null)} width={430}>
          <div style={{ marginBottom: 6 }}>Edit contents saved inside floppy image:</div>
          <textarea
            className="field"
            defaultValue={curText}
            onChange={(e) => { draft = e.target.value; }}
            style={{ width: '100%', height: 150, fontFamily: '"Courier New", monospace', fontSize: 12, padding: 6 }}
          />
          <div className="btn-row">
            <button className="btn default" onClick={() => done(draft)}>Save</button>
            <button className="btn" onClick={() => done(null)}>Cancel</button>
          </div>
        </Dialog>
      );
    });
    if (next === null || next === undefined) return;
    const u8 = strToU8(next.replace(/\r?\n/g, '\r\n'));
    setBuilderFiles((prev) => prev.map((x) => (x.id === item.id ? { ...x, data: u8, modified: Date.now() } : x)));
  };

  const buildImageBytes = () => {
    const outName = (floppyName.trim() || 'BootFloppy.img').replace(/[\\/:*?"<>|]/g, '_');
    const finalName = /\.(img|ima|vfd)$/i.test(outName) ? outName : outName + '.img';
    const bytes = createFat12Floppy(builderFiles, { label: volLabel, bootable });
    return { finalName, bytes };
  };

  const saveFloppyToC = (launchInDos = false) => {
    try {
      const { finalName, bytes } = buildImageBytes();
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const node = fs.create({ name: finalName, parent: 'games', data: blob, mime: 'application/octet-stream' });
      setStatus(`Saved ${finalName} to C:\\DOS Games`);
      if (launchInDos) {
        os.open('dosgames', { fileId: node.id });
      } else {
        os.msg({ icon: 'info', title: 'Floppy Created', text: `Saved bootable FAT12 image "${node.name}" (1.44 MB) to C:\\DOS Games.` });
      }
    } catch (e) {
      os.msg({ icon: 'error', title: 'Floppy Creation Failed', text: e.message });
    }
  };

  const saveFloppyToPC = async () => {
    try {
      const { finalName, bytes } = buildImageBytes();
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      await saveLocalFile({ blob, suggestedName: finalName, description: 'FAT12 Floppy Disk Image', ext: '.img' });
      setStatus(`Downloaded ${finalName} (1.44 MB) to local PC.`);
    } catch (e) {
      os.msg({ icon: 'error', title: 'Floppy Creation Failed', text: e.message });
    }
  };

  const destOptions = [
    ['docs', 'C:\\My Documents'],
    ['games', 'C:\\DOS Games'],
    ['desktop', 'C:\\Windows\\Desktop'],
    [fs.ROOT, 'C:\\ (Root)'],
  ];

  return (
    <div
      className="app di"
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        const f = e.dataTransfer?.files?.[0];
        if (!f) return;
        e.preventDefault();
        inspectUint8(f.name, new Uint8Array(await f.arrayBuffer()));
      }}
    >
      <MenuBar menus={[
        { label: '&File', items: [
          { label: 'Open Archive / Disk from &PC...', onClick: openFromPC },
          { label: 'Open Archive / Disk from &C:...', onClick: openFromC },
          { sep: true },
          { label: '&New Bootable Floppy (.img)', onClick: () => setTab('create') },
          { sep: true },
          { label: 'E&xit', onClick: () => os.close(win.id) },
        ] },
        { label: '&Actions', items: [
          { label: 'Extract &All to C:...', disabled: !archive?.entries?.length, onClick: () => extractEntries(archive.entries) },
          { label: 'Extract &Selected to C:...', disabled: !selected.size, onClick: () => extractEntries(archive.entries.filter((e) => selected.has(e.path))) },
          { sep: true },
          { label: '&Inspect Created Floppy', onClick: () => { const { finalName, bytes } = buildImageBytes(); inspectUint8(finalName, bytes); } },
        ] },
        { label: '&Help', items: [{ label: '&Help Topics', onClick: () => os.open('help') }] },
      ]} />

      <div className="di-body">
        <Tabs tabs={[{ id: 'inspect', label: 'Inspect ZIP / FAT12 Image' }, { id: 'create', label: 'Create Bootable Floppy (.img)' }]} value={tab} onChange={setTab}>
          {tab === 'inspect' && (
            <div className="di-pane">
              <div className="toolbar" style={{ marginBottom: 6 }}>
                <button className="btn tool" onClick={openFromPC}>Open PC File...</button>
                <button className="btn tool" onClick={openFromC}>Open Drive C:...</button>
                <span className="tb-div" />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  Extract to:
                  <select className="field" value={destFolder} onChange={(e) => setDestFolder(e.target.value)}>
                    {destOptions.map(([id, lbl]) => <option key={id} value={id}>{lbl}</option>)}
                  </select>
                </label>
                <button className="btn tool" disabled={!selected.size} onClick={() => extractEntries(archive.entries.filter((e) => selected.has(e.path)))}>
                  Extract Selected
                </button>
                <button className="btn tool default" disabled={!archive?.entries?.length} onClick={() => extractEntries(archive.entries)}>
                  Extract All
                </button>
              </div>

              {archive ? (
                <div className="di-meta">
                  <b>{archive.name}</b> · <span>{archive.format}</span> · <span>{archive.info}</span>
                </div>
              ) : (
                <div className="di-meta">Drop any .ZIP, .JSDOS, or FAT12 .IMG/.IMA/.VFD floppy image here, or click Open PC File...</div>
              )}

              <div className="field list-details di-table">
                <div className="ld-head" style={{ gridTemplateColumns: '26px minmax(140px,2.4fr) 82px 64px 132px' }}>
                  <span><input type="checkbox" title="Select all" checked={!!archive?.entries?.length && selected.size === archive.entries.filter((e) => !e.isDir).length}
                    onChange={(e) => {
                      if (!archive) return;
                      setSelected(e.target.checked ? new Set(archive.entries.filter((x) => !x.isDir).map((x) => x.path)) : new Set());
                    }} /></span>
                  <span>Name / Path</span>
                  <span>Size</span>
                  <span>Type</span>
                  <span>Actions</span>
                </div>
                {archive?.entries?.length === 0 && <div style={{ padding: 10, color: '#808080' }}>No files inside image.</div>}
                {archive?.entries?.map((en) => (
                  <div key={en.path} className={'ld-row ' + (selected.has(en.path) ? 'sel' : '')}
                    style={{ gridTemplateColumns: '26px minmax(140px,2.4fr) 82px 64px 132px' }}
                    onDoubleClick={() => previewEntry(en)}>
                    <span>{!en.isDir && <input type="checkbox" checked={selected.has(en.path)} onChange={() => toggleSelect(en.path)} />}</span>
                    <span className="ld-name" title={en.path}>
                      <Icon name={en.isDir ? 'folder' : iconForFile({ type: 'file', name: en.name })} size={14} />
                      <span>{en.path}</span>
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{en.isDir ? '<DIR>' : fmtSize(en.size)}</span>
                    <span>{en.attrText}</span>
                    <span style={{ display: 'flex', gap: 3 }}>
                      {!en.isDir && <>
                        <button className="btn tool" style={{ padding: '1px 5px', fontSize: 10 }} onClick={() => extractEntries([en])}>C:\</button>
                        <button className="btn tool" style={{ padding: '1px 5px', fontSize: 10 }} onClick={() => saveEntryToPC(en)}>PC</button>
                        <button className="btn tool" style={{ padding: '1px 5px', fontSize: 10 }} onClick={() => previewEntry(en)}>View</button>
                      </>}
                    </span>
                  </div>
                ))}
              </div>

              {preview && (
                <div className="di-preview sunken">
                  <div className="di-prev-head">
                    <b>{preview.path}</b>
                    <button className="btn tool" onClick={() => setPreview(null)}>Close</button>
                  </div>
                  <pre>{preview.text}</pre>
                </div>
              )}
            </div>
          )}

          {tab === 'create' && (
            <div className="di-pane">
              <div className="di-form">
                <label>Image Filename:
                  <input className="field" value={floppyName} onChange={(e) => setFloppyName(e.target.value)} style={{ width: 140 }} />
                </label>
                <label>Volume Label:
                  <input className="field" maxLength={11} value={volLabel} onChange={(e) => setVolLabel(e.target.value.toUpperCase())} style={{ width: 110 }} />
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={bootable} onChange={(e) => setBootable(e.target.checked)} />
                  <span>Include 8086 Boot Sector (A:\)</span>
                </label>
              </div>

              <div className="toolbar" style={{ margin: '6px 0' }}>
                <button className="btn tool" onClick={addBuilderFromPC}>+ Add from PC...</button>
                <button className="btn tool" onClick={addBuilderFromC}>+ Add from C:...</button>
                <button className="btn tool" onClick={() => setBuilderFiles((p) => [...p, { id: 'txt' + Date.now(), name: `NOTE${p.length + 1}.TXT`, data: strToU8('New floppy text file\r\n'), modified: Date.now() }])}>+ New Text File</button>
                <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                  Used: {fmtSize(builderUsedBytes)} / {fmtSize(FLOPPY_CAPACITY)} (1.44 MB FAT12)
                </span>
              </div>

              <div className="field list-details di-table">
                <div className="ld-head" style={{ gridTemplateColumns: '2fr 90px 140px' }}>
                  <span>File on Floppy (8.3 DOS)</span>
                  <span>Size</span>
                  <span>Actions</span>
                </div>
                {builderFiles.map((bf) => (
                  <div key={bf.id} className="ld-row" style={{ gridTemplateColumns: '2fr 90px 140px' }}>
                    <span className="ld-name"><Icon name={iconForFile({ type: 'file', name: bf.name })} size={14} /><span>{bf.name}</span></span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtSize(bf.data.length)}</span>
                    <span style={{ display: 'flex', gap: 4 }}>
                      {isTextExt(bf.name) && <button className="btn tool" style={{ padding: '1px 5px', fontSize: 10 }} onClick={() => editBuilderTextFile(bf)}>Edit</button>}
                      <button className="btn tool" style={{ padding: '1px 5px', fontSize: 10 }} onClick={() => setBuilderFiles((p) => p.filter((x) => x.id !== bf.id))}>Remove</button>
                    </span>
                  </div>
                ))}
              </div>

              <div className="btn-row" style={{ marginTop: 8, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                <button className="btn default" onClick={() => saveFloppyToC(true)}>▶ Save &amp; Boot in DOSBox</button>
                <button className="btn" onClick={() => saveFloppyToC(false)}>Save to C:\DOS Games</button>
                <button className="btn" onClick={saveFloppyToPC}>Download .IMG to PC...</button>
                <button className="btn" onClick={() => { const { finalName, bytes } = buildImageBytes(); inspectUint8(finalName, bytes); }}>Inspect Built Image</button>
              </div>
            </div>
          )}
        </Tabs>
      </div>

      <StatusBar>
        <span>{status}</span>
        <span>{archive ? archive.format : 'FAT12 / ZIP Ready'}</span>
      </StatusBar>
    </div>
  );
}

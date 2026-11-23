import { useState, useMemo } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar, Tabs } from '../os/widgets.jsx';
import Icon, { iconForFile } from '../os/icons.jsx';
import * as fs from '../os/fs.js';
import { fmtSize } from '../os/actions.js';
import { useSettings, setSettings } from '../os/settings.js';

const LOCAL_CACHES = [
  { key: 'win95-mp-playlist', name: 'Media Player Playlist Cache', location: 'Browser Cache (localStorage)', desc: 'Saved Media Player C:\\ playlist history' },
  { key: 'win95.bookmarks', name: 'Browser Favorites Cache', location: 'Browser Cache (localStorage)', desc: 'Saved Internet Browser bookmarks' },
];

export default function RecycleBin({ win }) {
  const os = useOS();
  fs.useFS();
  const settings = useSettings();
  const [tab, setTab] = useState('trash');
  const [sel, setSel] = useState([]);
  const [lsVer, setLsVer] = useState(0);

  const items = fs.trashList();
  const valid = sel.filter((id) => fs.get(id)?.trashed);

  const cacheEntries = useMemo(() => {
    const out = [];
    // 1. C:\Windows\Temp files
    fs.children('temp').forEach((n) => {
      out.push({
        id: 'fs:' + n.id,
        kind: 'temp',
        node: n,
        name: n.name,
        icon: iconForFile(n),
        location: 'C:\\Windows\\Temp',
        size: n.type === 'folder' ? fs.folderSize(n.id) : n.size || 0,
      });
    });
    // 2. Cached downloaded/imported ROMs/images in C:\DOS Games
    fs.children('games').forEach((n) => {
      if (n.type === 'file') {
        out.push({
          id: 'fs:' + n.id,
          kind: 'doscache',
          node: n,
          name: n.name,
          icon: iconForFile(n),
          location: 'C:\\DOS Games (Cached)',
          size: n.size || 0,
        });
      }
    });
    // 3. Inactive Paint/custom wallpapers in C:\Windows
    fs.children('win').forEach((n) => {
      if (n.type === 'file' && /\.(png|jpe?g|gif|bmp|webp)$/i.test(n.name) && settings.wallpaper !== 'fs:' + n.id) {
        out.push({
          id: 'fs:' + n.id,
          kind: 'wallpaper',
          node: n,
          name: n.name,
          icon: 'image',
          location: 'C:\\Windows (Unused Wallpaper)',
          size: n.size || 0,
        });
      }
    });
    // 4. LocalStorage app caches
    LOCAL_CACHES.forEach((c) => {
      try {
        const raw = localStorage.getItem(c.key);
        if (raw) {
          out.push({
            id: 'ls:' + c.key,
            kind: 'ls',
            lsKey: c.key,
            name: c.name,
            icon: 'file',
            location: c.location,
            size: raw.length * 2,
          });
        }
      } catch { /* ignore */ }
    });
    if (settings.iconPos && Object.keys(settings.iconPos).length > 0) {
      out.push({
        id: 'set:iconPos',
        kind: 'iconpos',
        name: 'Desktop Icon Position Cache',
        icon: 'settings',
        location: 'Windows Registry (Settings)',
        size: JSON.stringify(settings.iconPos).length * 2,
      });
    }
    return out;
  }, [fs.children('temp').length, fs.children('games').length, fs.children('win').length, settings.wallpaper, settings.iconPos, lsVer]); // eslint-disable-line

  const restore = () => valid.forEach((id) => fs.restore(id));
  const restoreOne = (id) => {
    fs.restore(id);
    setSel((s) => s.filter((x) => x !== id));
  };

  const deleteOne = async (n) => {
    const r = await os.msg({
      icon: 'question',
      title: 'Confirm File Delete',
      text: `Permanently delete '${n.name}' from the Recycle Bin?`,
      buttons: ['Yes', 'No'],
    });
    if (r === 'Yes') {
      fs.remove(n.id);
      setSel((s) => s.filter((x) => x !== n.id));
    }
  };

  const del = async () => {
    if (!valid.length) return;
    const r = await os.msg({
      icon: 'question',
      title: 'Confirm File Delete',
      text: `Are you sure you want to permanently delete ${valid.length === 1 ? `'${fs.get(valid[0]).name}'` : `these ${valid.length} items`}?`,
      buttons: ['Yes', 'No'],
    });
    if (r === 'Yes') { valid.forEach((id) => fs.remove(id)); setSel([]); }
  };

  const empty = async () => {
    if (!items.length) return;
    const r = await os.msg({
      icon: 'question',
      title: 'Confirm Multiple File Delete',
      text: `Are you sure you want to delete all ${items.length} items in the Recycle Bin?`,
      buttons: ['Yes', 'No'],
    });
    if (r === 'Yes') { fs.emptyTrash(); setSel([]); }
  };

  const cleanCacheOne = async (entry) => {
    const r = await os.msg({
      icon: 'question',
      title: 'Clean Cache Item',
      text: `Remove "${entry.name}" (${fmtSize(entry.size)}) from ${entry.location}?`,
      buttons: ['Yes', 'No'],
    });
    if (r !== 'Yes') return;
    if (entry.node) fs.remove(entry.node.id);
    else if (entry.lsKey) { localStorage.removeItem(entry.lsKey); setLsVer((v) => v + 1); }
    else if (entry.kind === 'iconpos') setSettings({ iconPos: {}, arrange: null });
  };

  const ctx = (e, n) => {
    e.preventDefault(); e.stopPropagation();
    if (!sel.includes(n.id)) setSel([n.id]);
    os.showMenu(e.clientX, e.clientY, [
      { label: 'R&estore', onClick: () => restoreOne(n.id) },
      { sep: true },
      { label: '&Delete Permanently', onClick: () => deleteOne(n) },
    ]);
  };

  const totalTrashSize = items.reduce((a, n) => a + (n.type === 'folder' ? fs.folderSize(n.id) : n.size || 0), 0);
  const totalCacheSize = cacheEntries.reduce((a, c) => a + (c.size || 0), 0);

  return (
    <div className="app">
      <MenuBar menus={[
        { label: '&File', items: [
          { label: 'R&estore Selected', disabled: tab !== 'trash' || !valid.length, onClick: restore },
          { sep: true },
          { label: '&Delete Selected', disabled: tab !== 'trash' || !valid.length, onClick: del },
          { label: '&Empty Recycle Bin', disabled: !items.length, onClick: empty },
          { sep: true },
          { label: '&Close', onClick: () => os.close(win.id) },
        ] },
        { label: '&Edit', items: [
          { label: 'Select &All', disabled: tab !== 'trash', onClick: () => setSel(items.map((n) => n.id)) },
          { label: '&Invert Selection', disabled: tab !== 'trash', onClick: () => setSel(items.filter((n) => !sel.includes(n.id)).map((n) => n.id)) },
        ] },
        { label: '&View', items: [
          { label: '&Deleted Items', radio: true, checked: tab === 'trash', onClick: () => setTab('trash') },
          { label: '&Cache & Temp Cleaner', radio: true, checked: tab === 'cache', onClick: () => setTab('cache') },
        ] },
      ]} />

      <div style={{ padding: '4px 4px 0', flex: 'none' }}>
        <Tabs
          tabs={[
            { id: 'trash', label: `Recycle Bin (${items.length})` },
            { id: 'cache', label: `Cache & Temp Files (${cacheEntries.length})` },
          ]}
          value={tab}
          onChange={setTab}
        >
          {tab === 'trash' ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn tool" disabled={!valid.length} onClick={restore}>Restore Selected</button>
              <button className="btn tool" disabled={!valid.length} onClick={del}>Delete Selected</button>
              <button className="btn tool" disabled={!items.length} onClick={empty}>Empty Recycle Bin</button>
              <span style={{ color: '#404040', marginLeft: 'auto' }}>Use the row buttons to restore or delete items one by one.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn tool" onClick={() => setLsVer((v) => v + 1)}>⟳ Refresh Scan</button>
              <span style={{ color: '#404040' }}>Reclaimable cache &amp; temp files: <b>{fmtSize(totalCacheSize)}</b> — click <b>Clean</b> to remove individually.</span>
            </div>
          )}
        </Tabs>
      </div>

      {tab === 'trash' ? (
        <div className="field list-details" onPointerDown={() => setSel([])}>
          <div className="ld-head" style={{ gridTemplateColumns: '2fr 1.8fr 1.4fr 0.8fr 124px' }}>
            <span>Name</span><span>Original Location</span><span>Date Deleted</span><span>Size</span><span>One-by-One</span>
          </div>
          {items.length === 0 && <div style={{ padding: 10, color: '#808080' }}>The Recycle Bin is empty.</div>}
          {items.map((n) => (
            <div
              key={n.id}
              className={'ld-row ' + (sel.includes(n.id) ? 'sel' : '')}
              style={{ gridTemplateColumns: '2fr 1.8fr 1.4fr 0.8fr 124px' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSel((s) => (e.ctrlKey ? (s.includes(n.id) ? s.filter((x) => x !== n.id) : [...s, n.id]) : [n.id]));
              }}
              onContextMenu={(e) => ctx(e, n)}
            >
              <span className="ld-name"><Icon name={iconForFile(n)} size={16} />{n.name}</span>
              <span>{fs.pathOf(n.trashed.parent)}</span>
              <span>{new Date(n.trashed.at).toLocaleString()}</span>
              <span>{n.type === 'folder' ? '' : fmtSize(n.size)}</span>
              <span style={{ display: 'flex', gap: 3 }} onPointerDown={(e) => e.stopPropagation()}>
                <button className="btn tool" style={{ height: 18, fontSize: 10 }} onClick={() => restoreOne(n.id)} title="Restore this item">Restore</button>
                <button className="btn tool" style={{ height: 18, fontSize: 10 }} onClick={() => deleteOne(n)} title="Permanently delete this item">Clean</button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="field list-details">
          <div className="ld-head" style={{ gridTemplateColumns: '2fr 2fr 0.9fr 76px' }}>
            <span>Cached Item</span><span>Location / Type</span><span>Size</span><span>Action</span>
          </div>
          {cacheEntries.length === 0 && <div style={{ padding: 10, color: '#808080' }}>No cached or temporary files found. System is clean!</div>}
          {cacheEntries.map((entry) => (
            <div key={entry.id} className="ld-row" style={{ gridTemplateColumns: '2fr 2fr 0.9fr 76px' }}>
              <span className="ld-name"><Icon name={entry.icon} size={16} />{entry.name}</span>
              <span>{entry.location}</span>
              <span>{fmtSize(entry.size)}</span>
              <span>
                <button className="btn tool" style={{ height: 18, fontSize: 10, width: '100%' }} onClick={() => cleanCacheOne(entry)}>Clean</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <StatusBar>
        <span>{tab === 'trash' ? `${items.length} deleted item(s) (${fmtSize(totalTrashSize)})` : `${cacheEntries.length} cache item(s) (${fmtSize(totalCacheSize)})`}</span>
        <span>{tab === 'trash' && sel.length ? `${valid.length} selected` : 'One-by-One Cleaner Ready'}</span>
      </StatusBar>
    </div>
  );
}

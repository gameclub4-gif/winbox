// Shared file-operation helpers used by Desktop, Explorer and Recycle Bin
import * as fs from './fs.js';

export function blankPng(w = 320, h = 240) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

export async function newItem(os, kind, parent) {
  try {
    let n;
    if (kind === 'folder') n = fs.create({ name: 'New Folder', parent, type: 'folder' });
    else if (kind === 'text') n = fs.create({ name: 'New Text Document.txt', parent, data: '', mime: 'text/plain' });
    else if (kind === 'rtf') n = fs.create({ name: 'New Rich Text Document.rtf', parent, data: '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\pard\\f0\\fs24 \\par}', mime: 'application/rtf' });
    else if (kind === 'html') n = fs.create({ name: 'New Web Page.html', parent, data: '<!doctype html><html><body><p></p></body></html>', mime: 'text/html' });
    else n = fs.create({ name: 'New Bitmap Image.png', parent, data: await blankPng(), mime: 'image/png' });
    const nm = await os.prompt({ title: 'Rename', label: 'Type a name for the new item:', value: n.name });
    if (nm && nm !== n.name) fs.rename(n.id, nm);
    return n;
  } catch (e) { os.msg({ icon: 'error', text: e.message }); }
}

export async function renameNode(os, n) {
  const nm = await os.prompt({ title: 'Rename', label: `Rename "${n.name}" to:`, value: n.name });
  if (nm && nm !== n.name) { try { fs.rename(n.id, nm.trim()); } catch (e) { os.msg({ icon: 'error', title: 'Error Renaming File', text: e.message }); } }
}

export async function deleteNodes(os, ids, permanent = false) {
  ids = ids.filter((id) => id !== fs.ROOT && fs.get(id));
  if (!ids.length) return false;
  const one = ids.length === 1;
  const nm = one ? `'${fs.get(ids[0]).name}'` : `these ${ids.length} items`;
  const text = permanent
    ? `Are you sure you want to permanently delete ${nm}?\nThis cannot be undone.`
    : `Are you sure you want to send ${nm} to the Recycle Bin?`;
  const r = await os.msg({ title: one && fs.get(ids[0]).type === 'folder' ? 'Confirm Folder Delete' : 'Confirm File Delete', icon: 'question', text, buttons: ['Yes', 'No'] });
  if (r !== 'Yes') return false;
  ids.forEach((id) => (permanent ? fs.remove(id) : fs.trash(id)));
  return true;
}

export const fmtSize = (b) => (b < 1024 ? `${b} bytes` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const fmtDate = (t) => new Date(t).toLocaleString();

export function showProps(os, n) {
  const size = n.type === 'folder' ? fs.folderSize(n.id) : n.size;
  const kids = n.type === 'folder' ? fs.children(n.id).length : 0;
  os.msg({
    title: `${n.name} Properties`, icon: 'info', width: 380,
    text: `Name: ${n.name}\nType: ${n.type === 'folder' ? 'File Folder' : (fs.ext(n.name) || 'File').toUpperCase() + ' File'}\nLocation: ${fs.pathOf(n.parent || n.id)}\nSize: ${fmtSize(size)}${n.type === 'folder' ? `\nContains: ${kids} item(s)` : ''}\nCreated: ${fmtDate(n.created)}\nModified: ${fmtDate(n.modified)}`,
  });
}

export async function importFiles(os, files, parent) {
  for (const f of files) {
    try { await fs.importFile(f, parent); } catch (e) { os.msg({ icon: 'error', text: `Could not copy ${f.name}.\n${e.message}` }); }
  }
}

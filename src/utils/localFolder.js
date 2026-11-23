// Zero-copy Local PC Folder mounting via File System Access API with seamless webkitdirectory fallback

const MAX_SCAN_FILES = 2000;
const MAX_SCAN_DEPTH = 5;

function pickViaWebkitDirectory(acceptExts) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    let settled = false;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(res);
    };
    input.onchange = () => {
      const files = [...(input.files || [])];
      if (!files.length) return finish(null);
      const firstRel = files[0].webkitRelativePath || files[0].name;
      const folderName = firstRel.includes('/') ? firstRel.split('/')[0] : 'Local Folder';
      const allow = acceptExts ? new Set(acceptExts.map((x) => x.toLowerCase())) : null;
      const entries = [];
      for (const f of files) {
        if (entries.length >= MAX_SCAN_FILES) break;
        const ext = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : '';
        if (allow && !allow.has(ext)) continue;
        entries.push({
          id: 'lf:' + entries.length + ':' + f.name,
          name: f.name,
          relPath: f.webkitRelativePath || f.name,
          ext,
          size: f.size,
          modified: f.lastModified || Date.now(),
          getFile: async () => f,
        });
      }
      entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
      finish({ name: folderName, mode: 'webkitdirectory', entries });
    };
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

async function scanDirHandle(dirHandle, prefix, allowSet, entries, depth) {
  if (depth > MAX_SCAN_DEPTH || entries.length >= MAX_SCAN_FILES) return;
  for await (const [name, handle] of dirHandle.entries()) {
    if (entries.length >= MAX_SCAN_FILES) break;
    const relPath = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      await scanDirHandle(handle, relPath, allowSet, entries, depth + 1);
    } else if (handle.kind === 'file') {
      const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
      if (allowSet && !allowSet.has(ext)) continue;
      let size = 0;
      let modified = Date.now();
      try {
        const meta = await handle.getFile();
        size = meta.size;
        modified = meta.lastModified;
      } catch { /* ignore */ }
      entries.push({
        id: 'fh:' + entries.length + ':' + name,
        name,
        relPath,
        ext,
        size,
        modified,
        getFile: () => handle.getFile(),
      });
    }
  }
}

export async function pickLocalDirectory({ acceptExts = null } = {}) {
  const canUseFSA = typeof window.showDirectoryPicker === 'function' && window.self === window.top;
  if (canUseFSA) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      const entries = [];
      const allow = acceptExts ? new Set(acceptExts.map((x) => x.toLowerCase())) : null;
      await scanDirHandle(handle, '', allow, entries, 0);
      entries.sort((a, b) => a.relPath.localeCompare(b.relPath));
      return { name: handle.name, mode: 'fs-access', entries };
    } catch (e) {
      if (e?.name === 'AbortError') return null;
      // Fall back to webkitdirectory on SecurityError / cross-origin restriction
    }
  }
  return pickViaWebkitDirectory(acceptExts);
}

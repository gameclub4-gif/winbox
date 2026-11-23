// Helpers for opening and saving real local PC files cleanly (with iframe-safe fallbacks).

const canUseTopFSA = () => {
  try {
    return window.self === window.top && typeof window.showOpenFilePicker === 'function';
  } catch {
    return false;
  }
};

const canUseSaveFSA = () => {
  try {
    return window.self === window.top && typeof window.showSaveFilePicker === 'function';
  } catch {
    return false;
  }
};

function pickViaInput({ accept, multiple = false }) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    let settled = false;
    const done = (files) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.onchange = () => {
      const list = [...(input.files || [])].map((file) => ({ file, name: file.name, handle: null }));
      done(list.length ? (multiple ? list : list[0]) : null);
    };
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!settled && (!input.files || !input.files.length)) done(null);
        }, 350);
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Open one or multiple files from the user's local computer.
 * Returns { file, name, handle } (or array if multiple=true), or null if cancelled.
 */
export async function pickLocalFiles({ accept = '', types = null, multiple = false } = {}) {
  if (canUseTopFSA()) {
    try {
      const opts = { multiple };
      if (types?.length) opts.types = types;
      const handles = await window.showOpenFilePicker(opts);
      const out = await Promise.all(
        handles.map(async (handle) => ({ file: await handle.getFile(), name: handle.name, handle })),
      );
      return multiple ? out : out[0] || null;
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      // Fall back to classic <input type="file"> below if FSA is blocked
    }
  }
  return pickViaInput({ accept, multiple });
}

/**
 * Save data (string or Blob/Uint8Array) to a local PC file.
 * If `handle` is provided and writable, writes directly in-place on the user's disk.
 * Otherwise uses showSaveFilePicker (when top-level) or triggers a browser download.
 */
export async function saveLocalFile({ data, name = 'untitled', mime = 'application/octet-stream', handle = null, types = null, forceDialog = false } = {}) {
  const blob = data instanceof Blob ? data : new Blob([data ?? ''], { type: mime });

  if (handle && !forceDialog && typeof handle.createWritable === 'function') {
    try {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { handle, name: handle.name || name, mode: 'in-place' };
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      // Fall through to save dialog / download
    }
  }

  if (canUseSaveFSA()) {
    try {
      const opts = { suggestedName: name };
      if (types?.length) opts.types = types;
      const newHandle = await window.showSaveFilePicker(opts);
      const writable = await newHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { handle: newHandle, name: newHandle.name || name, mode: 'picker' };
    } catch (err) {
      if (err?.name === 'AbortError') return null;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { handle: null, name, mode: 'download' };
}

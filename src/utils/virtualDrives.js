// Unified reactive Virtual Drive Manager store (A: Floppy, D: CD-ROM, E:+ Removable / PC Folders)
import { useSyncExternalStore } from 'react';

let state = {
  floppyA: null, // { name, size, fsId?, bootable?, readBlob: async () => Blob }
  cdromD: null,  // { name, size, fsId?, readBlob: async () => Blob }
  removable: [], // [{ id, letter, name, kind: 'folder'|'disk', entries?, file?, size?, fsId?, readBlob? }]
};

const subs = new Set();
const emit = () => subs.forEach((fn) => fn());

const nextRemovableLetter = (list) => {
  const used = new Set(list.map((x) => x.letter));
  for (let code = 69; code <= 90; code++) {
    const l = String.fromCharCode(code) + ':';
    if (!used.has(l)) return l;
  }
  return 'R:';
};

export function useVirtualDrives() {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => state
  );
}

export const getVirtualDrives = () => state;

export function mountFloppyA({ name, size, fsId = null, bootable = false, readBlob }) {
  state = { ...state, floppyA: { name, size, fsId, bootable, readBlob, mountedAt: Date.now() } };
  emit();
}

export function ejectFloppyA() {
  if (!state.floppyA) return;
  state = { ...state, floppyA: null };
  emit();
}

export function mountCdromD({ name, size, fsId = null, readBlob }) {
  state = { ...state, cdromD: { name, size, fsId, readBlob, mountedAt: Date.now() } };
  emit();
}

export function ejectCdromD() {
  if (!state.cdromD) return;
  state = { ...state, cdromD: null };
  emit();
}

export function mountRemovableFolder({ name, mode, entries }) {
  const id = 'rem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const letter = nextRemovableLetter(state.removable);
  const item = {
    id,
    letter,
    name,
    kind: 'folder',
    mode,
    entries,
    fileCount: entries.length,
    mountedAt: Date.now(),
  };
  state = { ...state, removable: [...state.removable, item] };
  emit();
  return item;
}

export function mountRemovableDisk({ name, size, fsId = null, readBlob }) {
  const id = 'rem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const letter = nextRemovableLetter(state.removable);
  const item = {
    id,
    letter,
    name,
    kind: 'disk',
    size,
    fsId,
    readBlob,
    mountedAt: Date.now(),
  };
  state = { ...state, removable: [...state.removable, item] };
  emit();
  return item;
}

export function ejectRemovable(id) {
  state = { ...state, removable: state.removable.filter((x) => x.id !== id) };
  emit();
}

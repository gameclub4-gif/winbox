// Lazy-loaded Media Player utilities: M3U playlist parser/builder & 5-band Equalizer presets

export const EQ_BANDS = [
  { hz: 60, label: '60Hz', type: 'lowshelf' },
  { hz: 230, label: '230', type: 'peaking' },
  { hz: 910, label: '910', type: 'peaking' },
  { hz: 3600, label: '3.6k', type: 'peaking' },
  { hz: 14000, label: '14k', type: 'highshelf' },
];

export const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0],
  Rock: [4, 2, -2, 3, 4],
  Pop: [-1, 2, 4, 2, -1],
  Classical: [4, 2, 0, 2, 4],
  'Bass Boost': [7, 4, 0, 0, 0],
  'Win95 Warm': [3, 2, 1, 2, -1],
};

export function isSafeMediaUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseM3u(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  const items = [];
  let pendingTitle = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      if (line.toUpperCase().startsWith('#EXTINF:')) {
        const comma = line.indexOf(',');
        if (comma >= 0) pendingTitle = line.slice(comma + 1).trim();
      }
      continue;
    }
    const lower = line.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
      pendingTitle = '';
      continue;
    }
    const isUrl = /^https?:\/\//i.test(line);
    if (isUrl && !isSafeMediaUrl(line)) {
      pendingTitle = '';
      continue;
    }
    const fallbackName = isUrl
      ? decodeURIComponent(line.split('?')[0].split('/').pop() || 'Stream')
      : line.split(/[\\/]/).pop() || line;
    items.push({
      title: pendingTitle || fallbackName,
      source: line,
      isUrl,
    });
    pendingTitle = '';
  }
  return items;
}

export function buildM3u(items, resolvePath) {
  const lines = ['#EXTM3U'];
  for (const it of items) {
    const title = String(it.name || 'Track').replace(/[\r\n]/g, ' ');
    let loc = '';
    if (it.fsId && resolvePath) {
      loc = resolvePath(it.fsId) || it.name;
    } else if (it.remoteUrl) {
      loc = it.remoteUrl;
    } else {
      loc = it.name;
    }
    lines.push(`#EXTINF:-1,${title}`);
    lines.push(loc);
  }
  return lines.join('\r\n') + '\r\n';
}

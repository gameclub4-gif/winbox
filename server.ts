import express from 'express';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';

const PORT = Number(process.env.PORT) || 3000;
const MAX_FETCH_BYTES = 256 * 1024 * 1024; // 256 MB cap for proxied ROM/disk downloads

function isPrivateIp(ip: string): boolean {
  const normalized = ip.replace(/^::ffff:/i, '');
  if (net.isIPv4(normalized)) {
    const parts = normalized.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  return (
    lower === '::' ||
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80')
  );
}

async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP/HTTPS URLs are supported');
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Local or internal hostnames are not allowed');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Private IP addresses are not allowed');
    return parsed;
  }
  const records = await dns.lookup(host, { all: true });
  if (!records.length || records.some((r) => isPrivateIp(r.address))) {
    throw new Error('Host resolves to a restricted network address');
  }
  return parsed;
}

async function fetchWithSafeRedirects(startUrl: string, maxRedirects = 4): Promise<{ response: Response; finalUrl: string }> {
  let current = startUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    const parsed = await assertSafePublicUrl(current);
    const res = await fetch(parsed.toString(), {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Win95-Retro-Loader/1.0',
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('Redirect without location');
      current = new URL(loc, parsed).toString();
      continue;
    }
    return { response: res, finalUrl: parsed.toString() };
  }
  throw new Error('Too many redirects');
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/fetch-rom', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl || rawUrl.length > 2048) {
      res.status(400).json({ error: 'Missing or invalid url query parameter.' });
      return;
    }

    try {
      const { response, finalUrl } = await fetchWithSafeRedirects(rawUrl);
      if (!response.ok) {
        res.status(response.status).json({ error: `Remote server returned HTTP ${response.status}` });
        return;
      }
      const ctype = (response.headers.get('content-type') || '').toLowerCase();
      if (ctype.includes('text/html') || ctype.includes('application/xhtml')) {
        res.status(415).json({ error: 'URL points to a web page (HTML) rather than a disk/ROM file.' });
        return;
      }
      const lenHeader = Number(response.headers.get('content-length') || 0);
      if (lenHeader > MAX_FETCH_BYTES) {
        res.status(413).json({ error: 'Remote file exceeds the 256 MB transfer limit.' });
        return;
      }

      const disp = response.headers.get('content-disposition') || '';
      const dispMatch = disp.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
      const urlName = decodeURIComponent(finalUrl.split('?')[0].split('/').pop() || 'software.bin');
      const safeName = (dispMatch?.[1] || urlName).replace(/[^a-zA-Z0-9._-]/g, '_');

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Resolved-Filename', safeName);
      if (lenHeader > 0) res.setHeader('Content-Length', String(lenHeader));

      if (!response.body) {
        res.end();
        return;
      }

      let received = 0;
      const reader = response.body.getReader();
      req.on('close', () => {
        reader.cancel().catch(() => {});
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_FETCH_BYTES) {
          reader.cancel().catch(() => {});
          res.destroy();
          return;
        }
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed';
      if (!res.headersSent) res.status(400).json({ error: msg });
      else res.end();
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Windows 95 server listening on http://localhost:${PORT}`);
  });
}

startServer();

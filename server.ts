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

  const MAX_BROWSE_HTML = 15 * 1024 * 1024;
  const MAX_BROWSE_BIN = 64 * 1024 * 1024;

  const escAttr = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const NAV_BRIDGE_SCRIPT = `<script>(function(){try{document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;var h=a.getAttribute('href')||'';if(!h||h.charAt(0)==='#'||/^(javascript:|mailto:|tel:|data:|blob:)/i.test(h))return;if(a.hasAttribute('download')||a.target==='_blank')return;e.preventDefault();window.parent.postMessage({type:'win95-browser-nav',url:a.href},'*');},true);document.addEventListener('submit',function(e){var f=e.target;if(!f||f.tagName!=='FORM')return;var m=(f.method||'get').toLowerCase();if(m!=='get')return;e.preventDefault();var u=new URL(f.action||location.href);var fd=new FormData(f);fd.forEach(function(v,k){if(typeof v==='string')u.searchParams.set(k,v);});window.parent.postMessage({type:'win95-browser-nav',url:u.toString()},'*');},true);}catch(_){}})();</script>`;

  app.get('/api/browse', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl || rawUrl.length > 2048) {
      res.status(400).json({ error: 'Missing or invalid url query parameter.' });
      return;
    }

    try {
      const { response, finalUrl } = await fetchWithSafeRedirects(rawUrl, 5);
      const rawType = response.headers.get('content-type') || 'application/octet-stream';
      const ctype = rawType.toLowerCase();
      const isPdf = ctype.includes('application/pdf') || /\.pdf([?#].*)?$/i.test(finalUrl);
      const isHtml = !isPdf && (ctype.includes('text/html') || ctype.includes('application/xhtml'));

      res.setHeader('X-Final-Url', finalUrl);
      res.setHeader('Access-Control-Expose-Headers', 'X-Final-Url, Content-Type');

      if (isHtml) {
        const buf = await response.arrayBuffer();
        if (buf.byteLength > MAX_BROWSE_HTML) {
          res.status(413).send('Page exceeds 15 MB limit.');
          return;
        }
        let html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
        // Remove frame-blocking meta CSP if present
        html = html.replace(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '');
        const injection = `<base href="${escAttr(finalUrl)}" target="_self">${NAV_BRIDGE_SCRIPT}`;
        if (/<head[^>]*>/i.test(html)) {
          html = html.replace(/<head[^>]*>/i, (m) => m + injection);
        } else if (/<html[^>]*>/i.test(html)) {
          html = html.replace(/<html[^>]*>/i, (m) => m + `<head>${injection}</head>`);
        } else {
          html = `<!doctype html><html><head>${injection}</head><body>${html}</body></html>`;
        }
        res.status(response.status);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
        return;
      }

      const lenHeader = Number(response.headers.get('content-length') || 0);
      if (lenHeader > MAX_BROWSE_BIN) {
        res.status(413).json({ error: 'Remote resource exceeds 64 MB limit.' });
        return;
      }

      res.status(response.status);
      res.setHeader('Content-Type', isPdf ? 'application/pdf' : rawType);
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
        if (received > MAX_BROWSE_BIN) {
          reader.cancel().catch(() => {});
          res.destroy();
          return;
        }
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to load URL';
      if (!res.headersSent) {
        res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').send(
          `<!doctype html><html><body style="font-family:Tahoma,Arial,sans-serif;padding:24px;color:#000;background:#fff;"><h2>Cannot display page</h2><p>${escAttr(msg)}</p><p><code>${escAttr(rawUrl)}</code></p></body></html>`
        );
      } else {
        res.end();
      }
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

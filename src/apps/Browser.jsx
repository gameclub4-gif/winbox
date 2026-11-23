import { useState, useRef, useEffect } from 'react';
import { useOS } from '../os/OS.jsx';
import { MenuBar, StatusBar } from '../os/widgets.jsx';
import Icon from '../os/icons.jsx';
import { Dialog } from '../os/widgets.jsx';

const BM_KEY = 'win95.bookmarks';
const DEFAULT_LINKS = [
  { title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page' },
  { title: 'The first web page', url: 'https://info.cern.ch/' },
  { title: 'Example Domain', url: 'https://example.com/' },
  { title: 'Internet Archive', url: 'https://archive.org/' },
  { title: 'NASA', url: 'https://www.nasa.gov/' },
  { title: 'MDN Web Docs', url: 'https://developer.mozilla.org/' },
];
// Sites known to forbid being displayed inside frames (X-Frame-Options / CSP frame-ancestors)
const BLOCKED = ['google.com', 'youtube.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'github.com', 'reddit.com', 'amazon.com', 'netflix.com',
  'paypal.com', 'apple.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'stackoverflow.com', 'twitch.tv', 'discord.com', 'tiktok.com', 'whatsapp.com', 'openai.com', 'chatgpt.com', 'microsoft.com', 'live.com', 'outlook.com', 'spotify.com', 'pinterest.com'];

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
const isBlocked = (u) => { const h = host(u); return BLOCKED.some((b) => h === b || h.endsWith('.' + b)); };
const isGoogleSearch = (u) => /(^|\.)google\.[a-z.]+$/.test(host(u)) && /[?&]q=/.test(u);
function normalize(input) {
  const t = input.trim();
  if (!t) return 'about:home';
  if (/^(about:|blob:|data:)/i.test(t)) return t;
  if (/^https?:\/\//i.test(t)) return t.replace(/^http:\/\//i, location.protocol === 'https:' ? 'https://' : 'http://');
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(t) && !/\s/.test(t)) return 'https://' + t;
  if (/^localhost(:\d+)?/.test(t)) return 'http://' + t;
  return 'https://www.google.com/search?q=' + encodeURIComponent(t);
}
const loadBM = () => { try { return JSON.parse(localStorage.getItem(BM_KEY)) || []; } catch (e) { return []; } };

export default function Browser({ win, props }) {
  const os = useOS();
  const first = props.url ? normalize(props.url) : 'about:home';
  const [h, setH] = useState({ list: [first], i: 0 });
  const url = h.list[h.i];
  const [addr, setAddr] = useState(first === 'about:home' ? '' : first);
  const [loading, setLoading] = useState(false);
  const [key, setKey] = useState(0);
  const [bm, setBm] = useState(loadBM);
  const [hint, setHint] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => { try { localStorage.setItem(BM_KEY, JSON.stringify(bm)); } catch (e) { /* ignore */ } }, [bm]);
  const title = url === 'about:home' ? 'Home' : props.title && url.startsWith('blob:') ? props.title : host(url) || url;
  useEffect(() => { os.setTitle(win.id, `${title} - Internet Browser`); }, [title, win.id, os]);

  const nav = (input, replace) => {
    const u = normalize(input);
    setAddr(u === 'about:home' ? '' : u);
    setLoading(!isBlocked(u) && u !== 'about:home');
    setHint(true);
    setH((s) => (s.list[s.i] === u ? s : { list: [...s.list.slice(0, s.i + 1), u], i: s.i + 1 }));
    if (u === url) setKey((k) => k + 1);
  };
  const goTo = (i) => { const u = h.list[i]; setH({ ...h, i }); setAddr(u === 'about:home' ? '' : u); setLoading(!isBlocked(u) && u !== 'about:home'); };
  const external = (u = url) => { if (u === 'about:home') return; const w = window.open(u, '_blank', 'noopener'); if (!w) os.msg({ icon: 'warning', title: 'Pop-up blocked', text: 'Your browser blocked the new tab. Allow pop-ups for this site and try again.' }); };
  const addBM = () => { if (url === 'about:home' || url.startsWith('blob:')) return; if (!bm.some((b) => b.url === url)) setBm([...bm, { title: host(url) || url, url }]); os.msg({ icon: 'info', title: 'Add to Favorites', text: `${host(url)} was added to your Favorites.` }); };
  const organize = () => os.dialog((done) => <BMOrganizer done={done} bm={loadBM()} onSave={setBm} />);
  const menus = [
    { label: '&File', items: [{ label: '&New Window', onClick: () => os.open('browser') }, { label: '&Open in external browser', disabled: url === 'about:home', onClick: () => external() }, { sep: true }, { label: '&Close', onClick: () => os.close(win.id) }] },
    { label: '&View', items: [{ label: '&Refresh', shortcut: 'F5', onClick: () => { setLoading(!isBlocked(url) && url !== 'about:home'); setKey((k) => k + 1); } }] },
    { label: '&Go', items: [{ label: '&Back', disabled: h.i === 0, onClick: () => goTo(h.i - 1) }, { label: '&Forward', disabled: h.i >= h.list.length - 1, onClick: () => goTo(h.i + 1) }, { label: '&Home Page', onClick: () => nav('about:home') }] },
    { label: 'F&avorites', items: [{ label: '&Add to Favorites', onClick: addBM }, { label: '&Organize Favorites...', disabled: !bm.length, onClick: organize }, { sep: true }, ...[...DEFAULT_LINKS, ...bm].map((b) => ({ label: b.title, icon: 'browser', onClick: () => nav(b.url) }))] },
    { label: '&Help', items: [{ label: '&Help Topics', onClick: () => os.open('help') }, { label: '&About Internet Browser', onClick: () => os.msg({ icon: 'info', title: 'About', text: 'Internet Browser\nWindows 95 Smart Edition\n\nPages are shown in a frame. Sites that refuse to be framed can be opened in your regular browser.' }) }] },
  ];

  let page;
  if (url === 'about:home') {
    page = (
      <div className="br-home">
        <h1 className="br-logo"><span style={{ color: '#4285f4' }}>G</span><span style={{ color: '#ea4335' }}>o</span><span style={{ color: '#fbbc05' }}>o</span><span style={{ color: '#4285f4' }}>g</span><span style={{ color: '#34a853' }}>l</span><span style={{ color: '#ea4335' }}>e</span></h1>
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav('https://www.google.com/search?q=' + encodeURIComponent(q.trim())); }}>
          <input className="field br-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Google or type a URL" />
          <div className="btn-row"><button className="btn default" type="submit" style={{ minWidth: 110 }}>Google Search</button>
            <button type="button" className="btn" style={{ minWidth: 110 }} onClick={() => q.trim() && nav('https://en.wikipedia.org/w/index.php?search=' + encodeURIComponent(q.trim()))}>Search Wikipedia</button></div>
        </form>
        <div className="br-links"><b>Quick links</b>
          <div>{[...DEFAULT_LINKS, ...bm].map((b) => <a key={b.url} href={b.url} onClick={(e) => { e.preventDefault(); nav(b.url); }}>{b.title}</a>)}</div></div>
        <p className="br-note">Tip: some big websites (Google, YouTube, Facebook…) do not allow being displayed inside another page. For those you'll get an <b>Open in external browser</b> button.</p>
      </div>
    );
  } else if (isBlocked(url)) {
    const g = isGoogleSearch(url);
    const term = g ? decodeURIComponent((url.match(/[?&]q=([^&]*)/) || [])[1] || '').replace(/\+/g, ' ') : '';
    page = (
      <div className="br-blocked">
        <Icon name="warning" size={48} />
        <h2>{g ? 'Google search results' : `${host(url)} can't be displayed here`}</h2>
        <p>{g ? 'Google does not allow its search results to be shown inside another web page.' : 'This web site does not allow itself to be displayed inside a frame (X-Frame-Options / Content-Security-Policy).'}</p>
        <div className="btn-row"><button className="btn default" style={{ minWidth: 200 }} onClick={() => external()}>Open in external browser ↗</button>
          {g && term && <button className="btn" style={{ minWidth: 200 }} onClick={() => nav('https://en.wikipedia.org/w/index.php?search=' + encodeURIComponent(term))}>Search Wikipedia for “{term}” here</button>}
          <button className="btn" onClick={() => nav('about:home')}>Back to home page</button></div>
        <code>{url}</code>
      </div>
    );
  } else {
    page = <iframe key={key + url} className="br-frame" src={url} title="web page" onLoad={() => setLoading(false)}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals" referrerPolicy="no-referrer" allow="fullscreen" />;
  }
  return (
    <div className="app br">
      <MenuBar menus={menus} />
      <div className="toolbar">
        <button className="btn tool" disabled={h.i === 0} onClick={() => goTo(h.i - 1)}>◀ Back</button>
        <button className="btn tool" disabled={h.i >= h.list.length - 1} onClick={() => goTo(h.i + 1)}>▶</button>
        <button className="btn tool" onClick={() => { setLoading(!isBlocked(url) && url !== 'about:home'); setKey((k) => k + 1); }}>⟳ Refresh</button>
        <button className="btn tool" onClick={() => nav('about:home')}>⌂ Home</button>
        <button className="btn tool" onClick={addBM} title="Add to Favorites">★</button>
        <button className="btn tool" disabled={url === 'about:home'} onClick={() => external()} title="Open in external browser">↗ External</button>
      </div>
      <form className="addr-row" onSubmit={(e) => { e.preventDefault(); nav(addr); }}>
        <label>Address</label>
        <input className="field" style={{ flex: 1, minWidth: 0 }} value={addr} onChange={(e) => setAddr(e.target.value)} onFocus={(e) => e.target.select()} placeholder="Type a web address or search term" spellCheck={false} />
        <button className="btn tool" type="submit">Go</button>
      </form>
      <div className="br-bm">{[...DEFAULT_LINKS.slice(0, 4), ...bm].map((b) => <button key={b.url} className="btn tool" onClick={() => nav(b.url)}><Icon name="browser" size={12} />{b.title}</button>)}</div>
      {hint && url !== 'about:home' && !isBlocked(url) && !url.startsWith('blob:') && (
        <div className="br-hint">Page blank or not loading? Some sites refuse to appear in frames. <a href={url} onClick={(e) => { e.preventDefault(); external(); }}>Open in external browser</a> <button onClick={() => setHint(false)} aria-label="Dismiss">✕</button></div>
      )}
      <div className="field br-view">{page}</div>
      <StatusBar><span>{loading ? `Opening ${url}...` : 'Done'}</span><span>{url.startsWith('https') ? '🔒 Secure' : ''}</span></StatusBar>
    </div>
  );
}

function BMOrganizer({ done, bm, onSave }) {
  const [list, setList] = useState(bm);
  const [sel, setSel] = useState(-1);
  const Dlg = Dialog;
  return (
    <Dlg title="Organize Favorites" onClose={() => done(null)} width={380}>
      <div className="field fd-list">{list.map((b, i) => <div key={i} className={'fd-item ' + (sel === i ? 'sel' : '')} onClick={() => setSel(i)}>{b.title} — {b.url}</div>)}{!list.length && <div style={{ padding: 6 }}>No favorites.</div>}</div>
      <div className="btn-row"><button className="btn" disabled={sel < 0} onClick={() => { setList(list.filter((_, i) => i !== sel)); setSel(-1); }}>Delete</button>
        <button className="btn default" onClick={() => { onSave(list); done(true); }}>OK</button><button className="btn" onClick={() => done(null)}>Cancel</button></div>
    </Dlg>
  );
}

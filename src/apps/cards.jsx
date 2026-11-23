import { useState, useRef, useEffect } from 'react';

// Scales card size to the width of the table element (sets CSS variables on it).
export function useTableVars(ref, cols) {
  useEffect(() => {
    const el = ref.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = () => {
      const w = el.clientWidth;
      const cw = Math.max(32, Math.min(68, Math.floor((w - 28) / (cols * 1.2))));
      el.style.setProperty('--cw', cw + 'px'); el.style.setProperty('--ch', Math.round(cw * 1.4) + 'px');
      el.style.setProperty('--oy', Math.round(cw * 0.36) + 'px'); el.style.setProperty('--oyd', Math.round(cw * 0.16) + 'px');
    };
    apply();
    const ro = new ResizeObserver(apply); ro.observe(el);
    return () => ro.disconnect();
  }, [ref, cols]);
}

export const SUITS = ['♣', '♦', '♥', '♠'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const isRed = (s) => s === 1 || s === 2;
export const makeDeck = () => { const d = []; for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) d.push({ r, s, id: s * 13 + r }); return d; };
export const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function Card({ card, up = true, style, className = '', sel, hidden, ...rest }) {
  const red = isRed(card.s);
  if (!up) return <div className={'card back ' + className} style={{ ...style, visibility: hidden ? 'hidden' : undefined }} {...rest} />;
  const face = card.r >= 10;
  return (
    <div className={`card face ${red ? 'red' : 'blk'} ${sel ? 'sel' : ''} ${className}`} style={{ ...style, visibility: hidden ? 'hidden' : undefined }} {...rest}>
      <span className="c-tl">{RANKS[card.r]}<br />{SUITS[card.s]}</span>
      <span className={'c-mid' + (face ? ' c-face' : '')}>{face ? RANKS[card.r] : SUITS[card.s]}</span>
      <span className="c-br">{RANKS[card.r]}<br />{SUITS[card.s]}</span>
    </div>
  );
}

// Pointer based drag & drop + tap + double-tap for card piles.
// getCards(src) -> cards shown in the drag ghost (or null/[] to forbid dragging).
export function useCardDrag({ getCards, onDrop, onTap, onDouble }) {
  const [drag, setDrag] = useState(null);
  const last = useRef({ key: '', t: 0 });
  const start = (e, src) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const ox = e.clientX - rect.left, oy = e.clientY - rect.top, sx = e.clientX, sy = e.clientY;
    const cards = getCards(src);
    let moved = false;
    const find = (x, y) => { const el = document.elementFromPoint(x, y)?.closest('[data-pile]'); return el ? el.dataset.pile : null; };
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      if (!cards || !cards.length) return;
      moved = true;
      setDrag({ src, cards, x: ev.clientX - ox, y: ev.clientY - oy });
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!moved) {
        const key = src.pile + ':' + src.index, now = Date.now();
        if (last.current.key === key && now - last.current.t < 380) { last.current = { key: '', t: 0 }; onDouble && onDouble(src); }
        else { last.current = { key, t: now }; onTap && onTap(src); }
        return;
      }
      const w = rect.width;
      const dst = find(ev.clientX, ev.clientY) || find(ev.clientX - ox + w / 2, ev.clientY - oy + 20);
      if (dst) onDrop(src, dst);
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  const ghost = drag && (
    <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
      {drag.cards.map((c, i) => <Card key={c.id} card={c} up style={{ position: 'absolute', top: `calc(var(--oy) * ${i})`, left: 0 }} />)}
    </div>
  );
  return { start, drag, ghost };
}

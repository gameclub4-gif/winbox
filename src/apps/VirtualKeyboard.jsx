import { useEffect, useRef, useState } from 'react';
import Icon from '../os/icons.jsx';

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'email', 'password', 'tel', 'number']);

const TONOS_MAP = {
  'α': 'ά', 'ε': 'έ', 'η': 'ή', 'ι': 'ί', 'ο': 'ό', 'υ': 'ύ', 'ω': 'ώ',
  'Α': 'Ά', 'Ε': 'Έ', 'Η': 'Ή', 'Ι': 'Ί', 'Ο': 'Ό', 'Υ': 'Ύ', 'Ω': 'Ώ',
};

const DIALYTIKA_MAP = {
  'ι': 'ϊ', 'υ': 'ϋ', 'Ι': 'Ϊ', 'Υ': 'Ϋ',
  'ί': 'ΐ', 'ύ': 'ΰ',
};

const ROW_NUM = [
  { lo: '`', hi: '~' },
  { lo: '1', hi: '!' },
  { lo: '2', hi: '@' },
  { lo: '3', hi: '#' },
  { lo: '4', hi: '$' },
  { lo: '5', hi: '%' },
  { lo: '6', hi: '^' },
  { lo: '7', hi: '&' },
  { lo: '8', hi: '*' },
  { lo: '9', hi: '(' },
  { lo: '0', hi: ')' },
  { lo: '-', hi: '_' },
  { lo: '=', hi: '+' },
];

const LAYOUTS = {
  en: {
    r2: [
      { lo: 'q', hi: 'Q', letter: true }, { lo: 'w', hi: 'W', letter: true }, { lo: 'e', hi: 'E', letter: true },
      { lo: 'r', hi: 'R', letter: true }, { lo: 't', hi: 'T', letter: true }, { lo: 'y', hi: 'Y', letter: true },
      { lo: 'u', hi: 'U', letter: true }, { lo: 'i', hi: 'I', letter: true }, { lo: 'o', hi: 'O', letter: true },
      { lo: 'p', hi: 'P', letter: true }, { lo: '[', hi: '{' }, { lo: ']', hi: '}' }, { lo: '\\', hi: '|' },
    ],
    r3: [
      { lo: 'a', hi: 'A', letter: true }, { lo: 's', hi: 'S', letter: true }, { lo: 'd', hi: 'D', letter: true },
      { lo: 'f', hi: 'F', letter: true }, { lo: 'g', hi: 'G', letter: true }, { lo: 'h', hi: 'H', letter: true },
      { lo: 'j', hi: 'J', letter: true }, { lo: 'k', hi: 'K', letter: true }, { lo: 'l', hi: 'L', letter: true },
      { lo: ';', hi: ':' }, { lo: "'", hi: '"' },
    ],
    r4: [
      { lo: 'z', hi: 'Z', letter: true }, { lo: 'x', hi: 'X', letter: true }, { lo: 'c', hi: 'C', letter: true },
      { lo: 'v', hi: 'V', letter: true }, { lo: 'b', hi: 'B', letter: true }, { lo: 'n', hi: 'N', letter: true },
      { lo: 'm', hi: 'M', letter: true }, { lo: ',', hi: '<' }, { lo: '.', hi: '>' }, { lo: '/', hi: '?' },
    ],
  },
  el: {
    r2: [
      { lo: ';', hi: ':' }, { lo: 'ς', hi: 'Σ', letter: true }, { lo: 'ε', hi: 'Ε', letter: true },
      { lo: 'ρ', hi: 'Ρ', letter: true }, { lo: 'τ', hi: 'Τ', letter: true }, { lo: 'υ', hi: 'Υ', letter: true },
      { lo: 'θ', hi: 'Θ', letter: true }, { lo: 'ι', hi: 'Ι', letter: true }, { lo: 'ο', hi: 'Ο', letter: true },
      { lo: 'π', hi: 'Π', letter: true }, { lo: '[', hi: '{' }, { lo: ']', hi: '}' }, { lo: '\\', hi: '|' },
    ],
    r3: [
      { lo: 'α', hi: 'Α', letter: true }, { lo: 'σ', hi: 'Σ', letter: true }, { lo: 'δ', hi: 'Δ', letter: true },
      { lo: 'φ', hi: 'Φ', letter: true }, { lo: 'γ', hi: 'Γ', letter: true }, { lo: 'η', hi: 'Η', letter: true },
      { lo: 'ξ', hi: 'Ξ', letter: true }, { lo: 'κ', hi: 'Κ', letter: true }, { lo: 'λ', hi: 'Λ', letter: true },
      { lo: '΄', hi: '¨', dead: true }, { lo: "'", hi: '"' },
    ],
    r4: [
      { lo: 'ζ', hi: 'Ζ', letter: true }, { lo: 'χ', hi: 'Χ', letter: true }, { lo: 'ψ', hi: 'Ψ', letter: true },
      { lo: 'ω', hi: 'Ω', letter: true }, { lo: 'β', hi: 'Β', letter: true }, { lo: 'ν', hi: 'Ν', letter: true },
      { lo: 'μ', hi: 'Μ', letter: true }, { lo: ',', hi: '<' }, { lo: '.', hi: '>' }, { lo: '/', hi: '?' },
    ],
  },
};

function resolveEditable(node) {
  if (!node || !(node instanceof HTMLElement)) return null;
  if (node.closest('.vk-win')) return null;
  if (node.tagName === 'TEXTAREA') {
    return node.disabled || node.readOnly ? null : node;
  }
  if (node.tagName === 'INPUT') {
    const t = (node.type || 'text').toLowerCase();
    if (!TEXT_INPUT_TYPES.has(t) || node.disabled || node.readOnly) return null;
    return node;
  }
  if (node.isContentEditable) {
    const host = node.closest('[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]') || node;
    return host instanceof HTMLElement ? host : null;
  }
  return null;
}

function describeTarget(el) {
  if (!el) return '';
  if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
  const winTitle = el.closest('.window')?.querySelector('.titlebar-text')?.textContent?.trim();
  const dlgRow = el.closest('.fd-row')?.querySelector('label')?.textContent?.replace(':', '').trim();
  if (winTitle && dlgRow) return `${winTitle} — ${dlgRow}`;
  if (winTitle) return winTitle;
  if (el.placeholder) return el.placeholder;
  return el.tagName.toLowerCase();
}

function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function dispatchInput(el, inputType, data) {
  try {
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data: data ?? null }));
  } catch {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function ensureEditableFocused(el) {
  if (document.activeElement !== el && !el.contains(document.activeElement)) {
    el.focus({ preventScroll: true });
  }
  const sel = window.getSelection?.();
  if (sel && (sel.rangeCount === 0 || !el.contains(sel.anchorNode))) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function insertTextAtTarget(el, text) {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    const val = el.value ?? '';
    let start = val.length;
    let end = val.length;
    try {
      if (typeof el.selectionStart === 'number') start = el.selectionStart;
      if (typeof el.selectionEnd === 'number') end = el.selectionEnd;
    } catch {}
    const next = val.slice(0, start) + text + val.slice(end);
    setNativeValue(el, next);
    const caret = start + text.length;
    try { el.setSelectionRange(caret, caret); } catch {}
    dispatchInput(el, 'insertText', text);
    return;
  }

  ensureEditableFocused(el);
  let ok = false;
  try {
    ok = document.execCommand('insertText', false, text);
  } catch {}
  if (!ok) {
    const sel = window.getSelection?.();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const tn = document.createTextNode(text);
      range.insertNode(tn);
      range.setStartAfter(tn);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    dispatchInput(el, 'insertText', text);
  }
}

function backspaceAtTarget(el) {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    const val = el.value ?? '';
    let start = val.length;
    let end = val.length;
    try {
      if (typeof el.selectionStart === 'number') start = el.selectionStart;
      if (typeof el.selectionEnd === 'number') end = el.selectionEnd;
    } catch {}
    if (start === 0 && end === 0) return;
    const delStart = start === end ? Math.max(0, start - 1) : start;
    const next = val.slice(0, delStart) + val.slice(end);
    setNativeValue(el, next);
    try { el.setSelectionRange(delStart, delStart); } catch {}
    dispatchInput(el, 'deleteContentBackward', null);
    return;
  }

  ensureEditableFocused(el);
  let ok = false;
  try {
    ok = document.execCommand('delete', false);
  } catch {}
  if (!ok) dispatchInput(el, 'deleteContentBackward', null);
}

function enterAtTarget(el) {
  if (document.activeElement !== el && !el.contains(document.activeElement)) {
    el.focus({ preventScroll: true });
  }
  const ev = new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(ev);
  el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  if (ev.defaultPrevented) return;

  if (el.tagName === 'TEXTAREA') {
    insertTextAtTarget(el, '\n');
  } else if (el.tagName === 'INPUT') {
    if (el.form) {
      if (typeof el.form.requestSubmit === 'function') el.form.requestSubmit();
      else el.form.submit();
    }
  } else if (el.isContentEditable) {
    ensureEditableFocused(el);
    if (el.getAttribute('contenteditable') === 'plaintext-only') {
      insertTextAtTarget(el, '\n');
    } else {
      let ok = false;
      try { ok = document.execCommand('insertParagraph', false); } catch {}
      if (!ok) insertTextAtTarget(el, '\n');
    }
  }
}

function tabAtTarget(el) {
  if (document.activeElement !== el && !el.contains(document.activeElement)) {
    el.focus({ preventScroll: true });
  }
  const ev = new KeyboardEvent('keydown', {
    key: 'Tab',
    code: 'Tab',
    keyCode: 9,
    which: 9,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(ev);
  if (ev.defaultPrevented) return;
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) {
    insertTextAtTarget(el, '\t');
  }
}

function moveCaret(el, dir) {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    try {
      const len = (el.value ?? '').length;
      const cur = typeof el.selectionStart === 'number' ? el.selectionStart : len;
      const next = Math.max(0, Math.min(len, cur + (dir === 'left' ? -1 : 1)));
      el.setSelectionRange(next, next);
    } catch {}
    return;
  }
  ensureEditableFocused(el);
  try {
    window.getSelection?.()?.modify?.('move', dir === 'left' ? 'backward' : 'forward', 'character');
  } catch {}
}

export default function VirtualKeyboard({ vp, onClose }) {
  const [lang, setLang] = useState('en');
  const [shift, setShift] = useState(false);
  const [caps, setCaps] = useState(false);
  const [deadAccent, setDeadAccent] = useState(null); // null | '΄' | '¨'
  const [targetLabel, setTargetLabel] = useState('');
  const lastTargetRef = useRef(null);
  const winRef = useRef(null);

  const [pos, setPos] = useState(() => {
    const w = Math.min(508, Math.max(300, (vp?.w || window.innerWidth) - 12));
    const h = 214;
    return {
      x: Math.max(6, Math.round(((vp?.w || window.innerWidth) - w) / 2)),
      y: Math.max(6, (vp?.h || window.innerHeight) - h - 38),
    };
  });

  useEffect(() => {
    const syncTarget = (node) => {
      const ed = resolveEditable(node);
      if (ed) {
        lastTargetRef.current = ed;
        setTargetLabel(describeTarget(ed));
      }
    };
    syncTarget(document.activeElement);
    const onFocusIn = (e) => syncTarget(e.target);
    document.addEventListener('focusin', onFocusIn, true);
    return () => document.removeEventListener('focusin', onFocusIn, true);
  }, []);

  useEffect(() => {
    if (!vp) return;
    setPos((p) => {
      const boxW = winRef.current?.offsetWidth || Math.min(508, vp.w - 12);
      const boxH = winRef.current?.offsetHeight || 214;
      return {
        x: Math.max(4, Math.min(p.x, Math.max(4, vp.w - boxW - 4))),
        y: Math.max(4, Math.min(p.y, Math.max(4, vp.h - boxH - 34))),
      };
    });
  }, [vp?.w, vp?.h]);

  const getTarget = () => {
    const active = resolveEditable(document.activeElement);
    if (active) {
      lastTargetRef.current = active;
      return active;
    }
    const last = lastTargetRef.current;
    if (last && last.isConnected && resolveEditable(last)) return last;
    return null;
  };

  const startDrag = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const p0 = { ...pos };
    const boxW = winRef.current?.offsetWidth || 500;
    const boxH = winRef.current?.offsetHeight || 214;
    const maxW = Math.max(4, (vp?.w || window.innerWidth) - boxW - 4);
    const maxH = Math.max(4, (vp?.h || window.innerHeight) - boxH - 34);
    const mv = (ev) => {
      setPos({
        x: Math.max(4, Math.min(maxW, p0.x + ev.clientX - sx)),
        y: Math.max(4, Math.min(maxH, p0.y + ev.clientY - sy)),
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const handleCharKey = (k) => {
    if (k.dead) {
      const accent = shift ? k.hi : k.lo;
      if (deadAccent === accent) {
        const t = getTarget();
        if (t) insertTextAtTarget(t, accent);
        setDeadAccent(null);
      } else {
        setDeadAccent(accent);
      }
      if (shift) setShift(false);
      return;
    }

    const useUpper = k.letter ? (shift !== caps) : shift;
    let ch = useUpper ? k.hi : k.lo;

    if (deadAccent) {
      if (deadAccent === '΄' && TONOS_MAP[ch]) {
        ch = TONOS_MAP[ch];
      } else if (deadAccent === '¨' && DIALYTIKA_MAP[ch]) {
        ch = DIALYTIKA_MAP[ch];
      } else {
        ch = deadAccent + ch;
      }
      setDeadAccent(null);
    }

    const t = getTarget();
    if (t) {
      insertTextAtTarget(t, ch);
      setTargetLabel(describeTarget(t));
    }
    if (shift) setShift(false);
  };

  const handleSpecial = (action) => {
    if (action === 'shift') { setShift((s) => !s); return; }
    if (action === 'caps') { setCaps((c) => !c); return; }
    if (action === 'lang') {
      setLang((l) => (l === 'en' ? 'el' : 'en'));
      setDeadAccent(null);
      setShift(false);
      return;
    }

    const t = getTarget();
    if (!t) return;
    setTargetLabel(describeTarget(t));

    if (deadAccent) {
      if (action === 'backspace') {
        setDeadAccent(null);
        return;
      }
      if (action === 'space') {
        insertTextAtTarget(t, deadAccent);
        setDeadAccent(null);
        return;
      }
      setDeadAccent(null);
    }

    if (action === 'backspace') backspaceAtTarget(t);
    else if (action === 'enter') enterAtTarget(t);
    else if (action === 'tab') tabAtTarget(t);
    else if (action === 'space') insertTextAtTarget(t, ' ');
    else if (action === 'left') moveCaret(t, 'left');
    else if (action === 'right') moveCaret(t, 'right');
  };

  const noSteal = (fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button > 0) return;
    fn();
  };

  const layout = LAYOUTS[lang];
  const labelOf = (k) => {
    const up = k.letter ? (shift !== caps) : shift;
    return up ? k.hi : k.lo;
  };

  return (
    <div
      ref={winRef}
      className="window active vk-win"
      style={{ left: pos.x, top: pos.y, zIndex: 9450 }}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div className="titlebar" onPointerDown={startDrag}>
        <Icon name="keyboard" size={16} />
        <span className="titlebar-text">
          Virtual Keyboard — {lang === 'en' ? 'English (EN)' : 'Ελληνικά (ΕΛ)'}
          {targetLabel ? ` · ${targetLabel}` : ''}
        </span>
        <div className="win-btns">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close"
            onPointerDown={noSteal(onClose)}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="vk-body">
        <div className="vk-row">
          {ROW_NUM.map((k) => (
            <button key={k.lo} type="button" tabIndex={-1} className="btn vk-key" onPointerDown={noSteal(() => handleCharKey(k))}>
              {labelOf(k)}
            </button>
          ))}
          <button type="button" tabIndex={-1} className="btn vk-key vk-w15" onPointerDown={noSteal(() => handleSpecial('backspace'))}>
            ⌫
          </button>
        </div>

        <div className="vk-row">
          <button type="button" tabIndex={-1} className="btn vk-key vk-w13" onPointerDown={noSteal(() => handleSpecial('tab'))}>
            Tab
          </button>
          {layout.r2.map((k, i) => (
            <button key={i} type="button" tabIndex={-1} className="btn vk-key" onPointerDown={noSteal(() => handleCharKey(k))}>
              {labelOf(k)}
            </button>
          ))}
        </div>

        <div className="vk-row">
          <button
            type="button"
            tabIndex={-1}
            className={'btn vk-key vk-w15 ' + (caps ? 'vk-on' : '')}
            onPointerDown={noSteal(() => handleSpecial('caps'))}
          >
            Caps
          </button>
          {layout.r3.map((k, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              className={'btn vk-key ' + (k.dead && deadAccent ? 'vk-on' : '')}
              onPointerDown={noSteal(() => handleCharKey(k))}
            >
              {labelOf(k)}
            </button>
          ))}
          <button type="button" tabIndex={-1} className="btn vk-key vk-w17" onPointerDown={noSteal(() => handleSpecial('enter'))}>
            Enter
          </button>
        </div>

        <div className="vk-row">
          <button
            type="button"
            tabIndex={-1}
            className={'btn vk-key vk-w18 ' + (shift ? 'vk-on' : '')}
            onPointerDown={noSteal(() => handleSpecial('shift'))}
          >
            Shift
          </button>
          {layout.r4.map((k, i) => (
            <button key={i} type="button" tabIndex={-1} className="btn vk-key" onPointerDown={noSteal(() => handleCharKey(k))}>
              {labelOf(k)}
            </button>
          ))}
          <button
            type="button"
            tabIndex={-1}
            className={'btn vk-key vk-w18 ' + (shift ? 'vk-on' : '')}
            onPointerDown={noSteal(() => handleSpecial('shift'))}
          >
            Shift
          </button>
        </div>

        <div className="vk-row vk-bottom">
          <button
            type="button"
            tabIndex={-1}
            className="btn vk-key vk-lang"
            title="Switch Language (English / Ελληνικά)"
            onPointerDown={noSteal(() => handleSpecial('lang'))}
          >
            {lang === 'en' ? 'EN / ΕΛ' : 'ΕΛ / EN'}
          </button>
          <button type="button" tabIndex={-1} className="btn vk-key vk-w12" onPointerDown={noSteal(() => handleCharKey({ lo: '.', hi: ':' }))}>
            .
          </button>
          <button type="button" tabIndex={-1} className="btn vk-key vk-space" onPointerDown={noSteal(() => handleSpecial('space'))}>
            {targetLabel ? `Space (${lang === 'en' ? 'EN' : 'ΕΛ'})` : 'Tap a text box or editor'}
          </button>
          <button type="button" tabIndex={-1} className="btn vk-key vk-w12" onPointerDown={noSteal(() => handleSpecial('left'))}>
            ←
          </button>
          <button type="button" tabIndex={-1} className="btn vk-key vk-w12" onPointerDown={noSteal(() => handleSpecial('right'))}>
            →
          </button>
          <button type="button" tabIndex={-1} className="btn vk-key vk-w15" onPointerDown={noSteal(onClose)}>
            Hide
          </button>
        </div>
      </div>
    </div>
  );
}

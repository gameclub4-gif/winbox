import { useState, useEffect } from 'react';
import { Dialog } from './widgets.jsx';
import Icon from './icons.jsx';
import {
  APP_NAMES,
  APP_ICONS,
  subscribeNotifications,
  subscribeHistory,
  listHistory,
  deleteTransfer,
  clearHistory,
  deliver,
} from './smartTransfer.js';

function fmtBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

// Destination-aware action choices on toast notification
function actionsForTarget(targetApp) {
  if (targetApp === 'wordpad' || targetApp === 'notepad') {
    return [
      { id: 'open', label: 'Open', def: true },
      { id: 'insert', label: 'Insert' },
      { id: 'append', label: 'Append' },
      { id: 'dismiss', label: 'Dismiss' },
    ];
  }
  if (targetApp === 'paint') {
    return [
      { id: 'open', label: 'Open', def: true },
      { id: 'insert', label: 'Insert' },
      { id: 'dismiss', label: 'Dismiss' },
    ];
  }
  return [
    { id: 'open', label: 'Open', def: true },
    { id: 'dismiss', label: 'Dismiss' },
  ];
}

export function SmartTransferToastHost({ os }) {
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    return subscribeNotifications((evt) => {
      if (evt.type === 'incoming' && evt.transfer) {
        setQueue((q) => [...q.filter((x) => x.id !== evt.transfer.id), evt.transfer].slice(-3));
      } else if (evt.type === 'resolved') {
        setQueue((q) => q.filter((x) => x.id !== evt.id));
      } else if (evt.type === 'cleared') {
        setQueue([]);
      }
    });
  }, []);

  if (!queue.length) return null;

  return (
    <div className="st-toast-stack" aria-live="polite">
      {queue.map((t) => (
        <div
          key={t.id}
          className="window active st-toast"
          role="dialog"
          aria-label={`Smart Transfer to ${APP_NAMES[t.targetApp] || t.targetApp}`}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <div className="titlebar">
            <Icon name={APP_ICONS[t.targetApp] || 'file'} size={14} />
            <span className="title-text">
              Smart Transfer → {APP_NAMES[t.targetApp] || t.targetApp}
            </span>
            <button
              className="tb-btn close"
              title="Dismiss"
              aria-label="Dismiss"
              onClick={() => deliver(t.id, 'dismiss', os)}
            >
              <svg width="8" height="7" viewBox="0 0 8 7"><path d="M0 0h2l2 2 2-2h2L5 3.500 8 7H6L4 5 2 7H0l3-3.500z" /></svg>
            </button>
          </div>
          <div className="st-toast-body">
            <div className="st-toast-head">
              <Icon name={APP_ICONS[t.sourceApp] || 'file'} size={24} />
              <div className="st-toast-meta">
                <b>From {APP_NAMES[t.sourceApp]}: {t.title}</b>
                <span>{t.contentType} · {fmtBytes(t.byteSize)}</span>
              </div>
            </div>
            <div className="btn-row st-toast-btns">
              {actionsForTarget(t.targetApp).map((act) => (
                <button
                  key={act.id}
                  className={'btn ' + (act.def ? 'default' : '')}
                  onClick={() => deliver(t.id, act.id, os)}
                >
                  {act.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ImagePickerModal({ done, images, title }) {
  const [selIdx, setSelIdx] = useState(0);
  return (
    <Dialog title={title || 'Select Image to Transfer'} icon="paint" onClose={() => done(null)} width={440}>
      <div style={{ marginBottom: 8 }}>
        Multiple images were found. Select the image you want to transfer:
      </div>
      <div className="field st-img-grid">
        {images.map((im, idx) => (
          <button
            type="button"
            key={idx}
            className={'st-img-card ' + (selIdx === idx ? 'sel' : '')}
            onClick={() => setSelIdx(idx)}
            onDoubleClick={() => done(im)}
          >
            <div className="st-img-thumb">
              <img src={im.previewSrc} alt={im.label || `Image ${idx + 1}`} />
            </div>
            <span className="st-img-lbl" title={im.label}>
              {im.label || `Image ${idx + 1}`}
            </span>
            {im.dims && <small>{im.dims}</small>}
          </button>
        ))}
      </div>
      <div className="btn-row">
        <button className="btn default" onClick={() => done(images[selIdx] || null)}>Send Selected</button>
        <button className="btn" onClick={() => done(null)}>Cancel</button>
      </div>
    </Dialog>
  );
}

export function pickImageDialog(os, images, title) {
  return os.dialog((done) => <ImagePickerModal done={done} images={images} title={title} />);
}

function ReceiveConflictModal({ done, targetApp, sourceName, title, isImage }) {
  const options =
    targetApp === 'paint'
      ? [
          { id: 'replace', label: 'Open (Replace Canvas)' },
          { id: 'insert', label: 'Insert as Selection', def: true },
          { id: 'cancel', label: 'Cancel' },
        ]
      : targetApp === 'browser'
        ? [
            { id: 'replace', label: 'Open Here (Keep History)', def: true },
            { id: 'newwin', label: 'Open in New Window' },
            { id: 'cancel', label: 'Cancel' },
          ]
        : [
            { id: 'replace', label: 'Replace Document' },
            { id: 'insert', label: isImage ? 'Insert Image' : 'Insert at Cursor', def: true },
            { id: 'append', label: 'Append to End' },
            { id: 'cancel', label: 'Cancel' },
          ];

  return (
    <Dialog title={`${APP_NAMES[targetApp] || 'Application'} - Incoming Transfer`} icon={APP_ICONS[targetApp] || 'info'} onClose={() => done('cancel')} width={400}>
      <div className="msg-row">
        <Icon name="question" />
        <div className="msg-text">
          Received <b>{title || 'content'}</b> from <b>{sourceName}</b>.<br />
          The current document already contains content. How would you like to apply it?
        </div>
      </div>
      <div className="btn-row" style={{ flexWrap: 'wrap' }}>
        {options.map((opt) => (
          <button
            key={opt.id}
            className={'btn ' + (opt.def ? 'default' : '')}
            onClick={() => done(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

export function receiveConflictDialog(os, opts) {
  return os.dialog((done) => <ReceiveConflictModal done={done} {...opts} />);
}

function TransferHistoryModal({ done, os }) {
  const [rows, setRows] = useState(() => listHistory());
  const [selId, setSelId] = useState(rows[0]?.id || null);

  useEffect(() => {
    setRows(listHistory());
    return subscribeHistory(() => setRows(listHistory()));
  }, []);

  const totalBytes = rows.reduce((a, r) => a + (r.byteSize || 0), 0);

  return (
    <Dialog title="Smart Office Transfer History & Cache" icon="documents" onClose={() => done(null)} width={560}>
      <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Active &amp; persisted transfers ({rows.length} item(s), {fmtBytes(totalBytes)})</span>
        <button
          className="btn"
          disabled={!rows.length}
          onClick={async () => {
            const ans = await os.msg({
              icon: 'question',
              title: 'Clear Transfer History',
              text: 'Clear all transfer history and associated stored payloads (IndexedDB & Blob URLs)?',
              buttons: ['Yes', 'No'],
            });
            if (ans === 'Yes') clearHistory();
          }}
        >
          Clear History &amp; Payloads
        </button>
      </div>
      <div className="field list-details st-hist-list">
        <div className="ld-head" style={{ gridTemplateColumns: '1.5fr 1fr 0.8fr 0.7fr 95px' }}>
          <span>Route / Title</span><span>MIME Type</span><span>Size</span><span>Status</span><span>Actions</span>
        </div>
        {!rows.length && <div style={{ padding: 10, color: '#808080' }}>No cached transfers.</div>}
        {rows.map((r) => (
          <div
            key={r.id}
            className={'ld-row ' + (selId === r.id ? 'sel' : '')}
            style={{ gridTemplateColumns: '1.5fr 1fr 0.8fr 0.7fr 95px' }}
            onClick={() => setSelId(r.id)}
          >
            <span title={`${r.id}\n${new Date(r.timestamp).toLocaleString()}`}>
              {APP_NAMES[r.sourceApp] || r.sourceApp} → {APP_NAMES[r.targetApp] || r.targetApp}: {r.title}
            </span>
            <span>{r.contentType}</span>
            <span>{fmtBytes(r.byteSize)}</span>
            <span>{r.status}</span>
            <span style={{ display: 'flex', gap: 3 }}>
              <button
                className="btn tool"
                style={{ height: 18, fontSize: 10 }}
                onClick={(e) => { e.stopPropagation(); deliver(r.id, 'open', os); done(true); }}
              >
                Open
              </button>
              <button
                className="btn tool"
                style={{ height: 18, fontSize: 10 }}
                onClick={(e) => { e.stopPropagation(); deleteTransfer(r.id); }}
              >
                Del
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="btn-row">
        <button className="btn default" onClick={() => done(null)}>Close</button>
      </div>
    </Dialog>
  );
}

export function openTransferHistoryDialog(os) {
  return os.dialog((done) => <TransferHistoryModal done={done} os={os} />);
}

import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function openPdfDoc(bytes) {
  const copy1 = new Uint8Array(bytes.slice ? bytes.slice(0) : bytes);
  try {
    return await pdfjsLib.getDocument({ data: copy1 }).promise;
  } catch (workerErr) {
    // Fallback cleanly to main-thread rendering if Web Worker creation is blocked
    const copy2 = new Uint8Array(bytes.slice ? bytes.slice(0) : bytes);
    try {
      return await pdfjsLib.getDocument({ data: copy2, disableWorkerRendering: true }).promise;
    } catch {
      throw workerErr;
    }
  }
}

export default function PdfViewer({ name, blobUrl, getBytes }) {
  const [mode, setMode] = useState('canvas'); // 'canvas' | 'native'
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.25);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const pdfRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);

  useEffect(() => {
    setPageNum(1);
    setNumPages(0);
    setRotation(0);
    setErr('');
    pdfRef.current = null;
  }, [blobUrl]);

  useEffect(() => {
    if (mode !== 'canvas') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const bytes = await getBytes();
        if (cancelled) return;
        const doc = await openPdfDoc(bytes);
        if (cancelled) { doc.destroy?.(); return; }
        pdfRef.current = doc;
        setNumPages(doc.numPages);
        setPageNum(1);
      } catch (e) {
        if (!cancelled) setErr(e?.message || 'Unable to read this PDF file.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      try { renderTaskRef.current?.cancel?.(); } catch { /* ignore */ }
      try { pdfRef.current?.destroy?.(); } catch { /* ignore */ }
      pdfRef.current = null;
    };
  }, [mode, blobUrl]); // eslint-disable-line

  useEffect(() => {
    if (mode !== 'canvas' || !pdfRef.current || !numPages) return;
    let cancelled = false;
    (async () => {
      try {
        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch { /* ignore */ }
        }
        const page = await pdfRef.current.getPage(pageNum);
        if (cancelled || !canvasRef.current) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale, rotation });
        const cv = canvasRef.current;
        cv.width = Math.floor(vp.width * dpr);
        cv.height = Math.floor(vp.height * dpr);
        cv.style.width = `${Math.floor(vp.width)}px`;
        cv.style.height = `${Math.floor(vp.height)}px`;
        const task = page.render({
          canvas: cv,
          viewport: vp,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException' && !cancelled) {
          setErr(e?.message || 'Page render failed.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mode, numPages, pageNum, scale, rotation]);

  return (
    <div className="br-pdf-wrap">
      <div className="toolbar br-pdf-bar">
        <b style={{ marginRight: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }} title={name}>{name}</b>
        <button className={'btn tool ' + (mode === 'canvas' ? 'pressed' : '')} onClick={() => setMode('canvas')} title="Built-in PDF.js renderer (works offline and inside frames)">Canvas View</button>
        <button className={'btn tool ' + (mode === 'native' ? 'pressed' : '')} onClick={() => setMode('native')} title="Browser built-in PDF plugin">Native View</button>
        {mode === 'canvas' && numPages > 0 && (
          <>
            <span className="tb-div" />
            <button className="btn tool" disabled={pageNum <= 1} onClick={() => setPageNum((p) => p - 1)} title="Previous page">◀</button>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>Page {pageNum} / {numPages}</span>
            <button className="btn tool" disabled={pageNum >= numPages} onClick={() => setPageNum((p) => p + 1)} title="Next page">▶</button>
            <span className="tb-div" />
            <button className="btn tool" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))} title="Zoom out">−</button>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(scale * 100)}%</span>
            <button className="btn tool" onClick={() => setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))} title="Zoom in">+</button>
            <button className="btn tool" onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate 90°">↻</button>
          </>
        )}
        <a className="btn tool" href={blobUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', textDecoration: 'none', color: 'inherit' }} title="Open PDF in a new browser tab">↗ Tab</a>
        <a className="btn tool" href={blobUrl} download={name} style={{ textDecoration: 'none', color: 'inherit' }}>Download</a>
      </div>

      {mode === 'native' ? (
        <object data={blobUrl} type="application/pdf" className="br-frame">
          <div className="br-blocked">
            <p>Your browser blocked the embedded native PDF plugin inside this frame.</p>
            <div className="btn-row">
              <button className="btn default" onClick={() => setMode('canvas')}>Use Built-in Canvas PDF Viewer</button>
              <a className="btn" href={blobUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>Open in Browser Tab ↗</a>
            </div>
          </div>
        </object>
      ) : (
        <div className="br-pdf-scroll">
          {loading && <div className="br-pdf-msg">Loading PDF document...</div>}
          {err && (
            <div className="br-blocked">
              <p>{err}</p>
              <div className="btn-row">
                <button className="btn default" onClick={() => setMode('native')}>Try Native Browser Viewer</button>
                <a className="btn" href={blobUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>Open in Browser Tab ↗</a>
              </div>
            </div>
          )}
          {!err && <canvas ref={canvasRef} className="br-pdf-canvas" />}
        </div>
      )}
    </div>
  );
}

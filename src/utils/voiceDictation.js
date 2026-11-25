import { useState, useRef, useEffect, useCallback } from 'react';

export const VOICE_LANGUAGES = [
  { id: 'auto', label: 'Auto' },
  { id: 'el-GR', label: 'Ελληνικά (el-GR)' },
  { id: 'en-US', label: 'English (US)' },
  { id: 'en-GB', label: 'English (UK)' },
  { id: 'de-DE', label: 'Deutsch (de-DE)' },
  { id: 'fr-FR', label: 'Français (fr-FR)' },
  { id: 'es-ES', label: 'Español (es-ES)' },
  { id: 'it-IT', label: 'Italiano (it-IT)' },
  { id: 'pt-PT', label: 'Português (pt-PT)' },
  { id: 'ru-RU', label: 'Русский (ru-RU)' },
  { id: 'ja-JP', label: '日本語 (ja-JP)' },
  { id: 'zh-CN', label: '中文 (zh-CN)' },
];

export function isSpeechSupported() {
  if (typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function formatDictatedChunk(rawTranscript, charBefore = '') {
  const clean = (rawTranscript || '').trim();
  if (!clean) return '';
  const needsSpace =
    !!charBefore &&
    !/[\s([{"'<]/.test(charBefore) &&
    !/^[.,!?;:)\]}»]/.test(clean);
  return (needsSpace ? ' ' : '') + clean;
}

function getSpeechCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function resolveRecognitionLang(lang) {
  if (!lang || lang === 'auto') {
    if (typeof navigator !== 'undefined') {
      return navigator.language || navigator.languages?.[0] || '';
    }
    return '';
  }
  return lang;
}

export function useVoiceDictation({ onResult, onError } = {}) {
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState('auto');
  const [interim, setInterim] = useState('');

  const recRef = useRef(null);
  const wantsRef = useRef(false);
  const langRef = useRef('auto');
  const restartTimerRef = useRef(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;
  langRef.current = lang;

  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const destroyRecognizer = useCallback(() => {
    clearRestartTimer();
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop();
      } catch { /* ignore */ }
    }
  }, []);

  const spawnRecognizer = useCallback((langCode) => {
    const Ctor = getSpeechCtor();
    if (!Ctor) {
      wantsRef.current = false;
      setListening(false);
      onErrorRef.current?.('Voice dictation is not supported in this browser. Use Chrome, Edge, or Safari.');
      return;
    }

    destroyRecognizer();
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    const resolved = resolveRecognitionLang(langCode);
    if (resolved) rec.lang = resolved;

    rec.onresult = (event) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const t = res?.[0]?.transcript || '';
        if (res.isFinal) finalChunk += t;
        else interimChunk += t;
      }
      setInterim(interimChunk.trim());
      if (finalChunk.trim()) {
        onResultRef.current?.(finalChunk);
      }
    };

    rec.onerror = (event) => {
      const code = event?.error || '';
      if (code === 'no-speech' || code === 'aborted') return;
      wantsRef.current = false;
      setListening(false);
      setInterim('');
      const msgMap = {
        'not-allowed': 'Microphone permission was denied. Allow microphone access in your browser to use dictation.',
        'service-not-allowed': 'Speech recognition service is blocked in this browser or context.',
        'audio-capture': 'No microphone was detected. Connect a microphone and try again.',
        network: 'Speech recognition requires an active internet connection in this browser.',
      };
      onErrorRef.current?.(msgMap[code] || `Voice dictation error: ${code || 'unknown'}`);
    };

    rec.onend = () => {
      setInterim('');
      if (recRef.current === rec) recRef.current = null;
      if (wantsRef.current) {
        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => {
          if (wantsRef.current) spawnRecognizer(langRef.current);
        }, 120);
      } else {
        setListening(false);
      }
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      wantsRef.current = false;
      setListening(false);
      setInterim('');
      onErrorRef.current?.(e?.message || 'Could not start microphone dictation.');
    }
  }, [destroyRecognizer]);

  const start = useCallback((overrideLang) => {
    const useLang = overrideLang ?? langRef.current;
    wantsRef.current = true;
    setListening(true);
    setInterim('');
    spawnRecognizer(useLang);
  }, [spawnRecognizer]);

  const stop = useCallback(() => {
    wantsRef.current = false;
    setListening(false);
    setInterim('');
    destroyRecognizer();
  }, [destroyRecognizer]);

  const toggle = useCallback(() => {
    if (wantsRef.current) stop();
    else start();
  }, [start, stop]);

  const changeLang = useCallback((nextLang) => {
    setLang(nextLang);
    langRef.current = nextLang;
    if (wantsRef.current) {
      spawnRecognizer(nextLang);
    }
  }, [spawnRecognizer]);

  useEffect(() => () => {
    wantsRef.current = false;
    destroyRecognizer();
  }, [destroyRecognizer]);

  return {
    listening,
    lang,
    interim,
    supported: isSpeechSupported(),
    start,
    stop,
    toggle,
    changeLang,
  };
}

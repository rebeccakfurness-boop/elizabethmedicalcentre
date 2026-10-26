'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Browser speech recognition (Web Speech API). Supported in Chrome, Edge and Safari.
// No audio is stored by this app; the browser's own speech service does the transcription.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function getRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Spoken punctuation commands, so clinicians can dictate structure.
function tidy(text: string): string {
  return text
    .replace(/\s*\b(full stop|period)\b/gi, '.')
    .replace(/\s*\bcomma\b/gi, ',')
    .replace(/\s*\b(new line|next line)\b\s*/gi, '\n')
    .replace(/\s*\bnew paragraph\b\s*/gi, '\n\n');
}

const noSubscribe = () => () => {};

export function DictationField({
  name,
  label,
  defaultValue,
  rows = 3,
  placeholder,
  enabled,
  onDictated,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  rows?: number;
  placeholder?: string;
  enabled: boolean;
  onDictated?: () => void;
}) {
  const [value, setValue] = useState(defaultValue ?? '');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [lang, setLang] = useState('en-GB');
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // False on the server, real value in the browser, without a hydration mismatch.
  const supported = useSyncExternalStore(noSubscribe, () => !!getRecognition(), () => false);
  useEffect(() => () => recRef.current?.stop(), []);

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Rec = getRecognition();
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalText) {
        setValue((v) => {
          const t = tidy(finalText.trim());
          return v && !/\s$/.test(v) && !t.startsWith('\n') ? `${v} ${t}` : v + t;
        });
        onDictated?.();
      }
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'Microphone access was blocked. Allow it in the browser to dictate.' : `Dictation stopped (${e.error}).`);
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
    };
    setError('');
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="label mb-0" htmlFor={name}>{label}</label>
        {enabled && supported ? (
          <div className="flex items-center gap-1.5">
            <select className="rounded-full border border-line bg-white px-2 py-0.5 text-[11px]" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Dictation language" disabled={listening}>
              <option value="en-GB">English</option>
              <option value="id-ID">Bahasa</option>
            </select>
            <button
              type="button"
              onClick={toggle}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-label text-[11px] font-bold ${listening ? 'animate-pulse bg-red-600 text-white' : 'bg-teal-soft text-teal-deep hover:bg-teal hover:text-cream'}`}
              aria-pressed={listening}
            >
              <span aria-hidden="true">🎙</span> {listening ? 'Stop' : 'Dictate'}
            </button>
          </div>
        ) : null}
      </div>
      <textarea className="input" id={name} name={name} rows={rows} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
      {interim ? <p className="mt-1 text-xs italic text-ink-soft">{interim}…</p> : null}
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

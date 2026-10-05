"use client";

import { useEffect, useRef, useState } from "react";

/* Web Speech API — Chrome/Edge (uses the browser vendor's online speech service; not offline). */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function getRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const C = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
  return C ? new C() : null;
}

/** Mic button that dictates one phrase (বাংলা or English) and hands back the text. */
export function VoiceButton({ onText, lang = "bn-BD" }: { onText: (t: string) => void; lang?: "bn-BD" | "en-US" }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string>();
  const rec = useRef<Recognition | null>(null);
  useEffect(() => setSupported(!!getRecognition()), []);
  if (!supported) return null;

  function toggle() {
    if (listening) return rec.current?.stop();
    const r = getRecognition();
    if (!r) return;
    if (!navigator.onLine) return setError("Voice input needs internet");
    r.lang = lang;
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ").trim();
      if (text) onText(text);
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Microphone permission denied" : e.error);
      setListening(false);
    };
    rec.current = r;
    setError(undefined);
    setListening(true);
    r.start();
  }

  return (
    <button type="button" onClick={toggle} title={error ?? (lang === "bn-BD" ? "বাংলায় বলুন" : "Dictate in English")}
      className={`btn-ghost px-1.5 text-xs ${listening ? "animate-pulse text-red-600" : error ? "text-amber-600" : "text-slate-400"}`} aria-label="Voice input">
      🎤{lang === "bn-BD" ? "বাং" : "EN"}
    </button>
  );
}

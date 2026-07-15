"use client";
import { useRef, useState } from "react";
import Recorder from "opus-recorder";

/**
 * Records a voice note and hands the finished Blob back to the caller — the
 * caller is responsible for uploading it (via whichever upload route matches
 * the surface: admin vs outreach CRM) and adding it to the composer's
 * attachment list. Shared between both composers.
 *
 * Encodes directly to Ogg/Opus via opus-recorder (WASM) rather than the
 * browser's native MediaRecorder, which only produces audio/webm on Chrome/
 * Edge — a container WhatsApp's Cloud API rejects outright (it only accepts
 * aac/amr/mpeg/mp4/ogg for voice messages). Ogg/Opus is on that accepted
 * list and plays natively in every browser, so this fixes WhatsApp sends
 * without needing any server-side transcoding.
 */
export function VoiceRecorderButton({
  onRecorded,
  forceDark,
  disabled,
}: {
  onRecorded: (blob: Blob, mimeType: string) => void;
  forceDark?: boolean;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<InstanceType<typeof Recorder> | null>(null);
  const chunksRef = useRef<ArrayBuffer[]>([]);
  const discardRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const t = forceDark
    ? { idle: "text-white/40 hover:text-white/70 hover:bg-white/5", active: "text-red-400 bg-red-500/10" }
    : { idle: "text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white/70 hover:bg-slate-100 dark:hover:bg-white/5", active: "text-red-500 dark:text-red-400 bg-red-500/10" };

  function clearTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function teardown() {
    recorderRef.current?.close();
    recorderRef.current = null;
    clearTimer();
  }

  async function startRecording() {
    if (disabled || recording) return;
    try {
      const rec = new Recorder({
        encoderPath:        "/opus-recorder/encoderWorker.min.js",
        encoderSampleRate:  48000,
        encoderApplication: 2048, // voice-optimized
        numberOfChannels:   1,
        streamPages:        false, // fire ondataavailable once, with the complete file, on stop
      });
      chunksRef.current = [];
      discardRef.current = false;
      rec.ondataavailable = (buf: ArrayBuffer) => { chunksRef.current.push(buf); };
      rec.onstop = () => {
        teardown();
        if (discardRef.current) return;
        const blob = new Blob(chunksRef.current, { type: "audio/ogg" });
        if (blob.size > 0) onRecorded(blob, "audio/ogg");
      };
      await rec.start();
      recorderRef.current = rec;
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch {
      teardown();
      setRecording(false);
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  function cancelRecording() {
    discardRef.current = true;
    recorderRef.current?.stop();
    setRecording(false);
  }

  if (recording) {
    const mm = Math.floor(seconds / 60).toString().padStart(2, "0");
    const ss = (seconds % 60).toString().padStart(2, "0");
    return (
      <div className="flex items-center gap-1.5">
        <span className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium tabular-nums ${t.active}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          {mm}:{ss}
        </span>
        <button type="button" title="Cancel" onClick={cancelRecording} className={`p-1.5 rounded-md transition-colors ${t.idle}`}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 6.28a.75.75 0 011.06 0L10 8.94l2.66-2.66a.75.75 0 111.06 1.06L11.06 10l2.66 2.66a.75.75 0 11-1.06 1.06L10 11.06l-2.66 2.66a.75.75 0 01-1.06-1.06L8.94 10 6.28 7.34a.75.75 0 010-1.06z"/></svg>
        </button>
        <button type="button" title="Stop and attach" onClick={stopRecording} className={`p-1.5 rounded-md transition-colors ${t.active}`}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><rect x="5" y="5" width="10" height="10" rx="1.5"/></svg>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      title="Record voice note"
      disabled={disabled}
      onClick={startRecording}
      className={`p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${t.idle}`}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M10 2a3 3 0 00-3 3v5a3 3 0 006 0V5a3 3 0 00-3-3z"/>
        <path d="M5.5 9.5a.75.75 0 01.75.75 3.75 3.75 0 007.5 0 .75.75 0 011.5 0 5.25 5.25 0 01-4.5 5.197V17h2a.75.75 0 010 1.5h-5.5a.75.75 0 010-1.5h2v-1.553A5.25 5.25 0 014.75 10.25a.75.75 0 01.75-.75z"/>
      </svg>
    </button>
  );
}

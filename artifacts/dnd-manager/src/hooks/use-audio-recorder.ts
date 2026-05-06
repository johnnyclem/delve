import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "recording" | "paused" | "stopping";

const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of PREFERRED_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      // ignore
    }
  }
  return undefined;
}

function baseMime(mime: string | undefined): string {
  if (!mime) return "audio/webm";
  return mime.split(";")[0].trim().toLowerCase();
}

export interface RecordedChunk {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export interface UseAudioRecorder {
  state: RecorderState;
  elapsedMs: number;
  error: string | null;
  isSupported: boolean;
  start: () => Promise<void>;
  stop: () => Promise<RecordedChunk[]>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

const MAX_CHUNK_BYTES = 20 * 1024 * 1024;

export function useAudioRecorder(): UseAudioRecorder {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const finishedChunksRef = useRef<RecordedChunk[]>([]);
  const startedAtRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopResolveRef = useRef<((chunks: RecordedChunk[]) => void) | null>(null);
  const splitForSizeRef = useRef<boolean>(false);
  const stoppingRef = useRef<boolean>(false);

  const isSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const stopTicker = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startTicker = useCallback(() => {
    stopTicker();
    tickRef.current = setInterval(() => {
      const live = Date.now() - startedAtRef.current;
      setElapsedMs(accumulatedRef.current + live);
    }, 250);
  }, [stopTicker]);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopTicker();
      releaseStream();
    };
  }, [stopTicker, releaseStream]);

  const finalizeCurrentChunk = useCallback((mimeType: string, durationMs: number) => {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    finishedChunksRef.current.push({ blob, mimeType: baseMime(mimeType), durationMs });
  }, []);

  const start = useCallback(async () => {
    if (!isSupported) {
      setError("Recording is not supported on this device");
      return;
    }
    setError(null);
    finishedChunksRef.current = [];
    chunksRef.current = [];
    accumulatedRef.current = 0;
    setElapsedMs(0);
    splitForSizeRef.current = false;
    stoppingRef.current = false;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("Microphone permission denied");
      } else if (name === "NotFoundError") {
        setError("No microphone found");
      } else {
        setError("Could not access microphone");
      }
      return;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      releaseStream();
      setError("Recorder unsupported on this browser");
      return;
    }
    recorderRef.current = recorder;

    let segmentStartedAt = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
        const total = chunksRef.current.reduce((sum, b) => sum + b.size, 0);
        if (total >= MAX_CHUNK_BYTES && recorderRef.current?.state === "recording") {
          // Roll over to a new chunk so individual uploads stay under the limit.
          splitForSizeRef.current = true;
          try {
            recorderRef.current.stop();
          } catch {
            // ignore
          }
        }
      }
    };

    recorder.onstop = () => {
      const segDuration = Date.now() - segmentStartedAt;
      const mt = recorder.mimeType || mimeType || "audio/webm";
      finalizeCurrentChunk(mt, segDuration);

      if (splitForSizeRef.current && !stoppingRef.current) {
        // Restart a fresh recorder to continue the session.
        splitForSizeRef.current = false;
        try {
          const next = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          recorderRef.current = next;
          next.ondataavailable = recorder.ondataavailable;
          next.onstop = recorder.onstop;
          segmentStartedAt = Date.now();
          next.start(1000);
          return;
        } catch {
          // fall through to finish
        }
      }

      stopTicker();
      releaseStream();
      const resolve = stopResolveRef.current;
      stopResolveRef.current = null;
      const out = finishedChunksRef.current;
      finishedChunksRef.current = [];
      setState("idle");
      setElapsedMs(0);
      accumulatedRef.current = 0;
      resolve?.(out);
    };

    segmentStartedAt = Date.now();
    recorder.start(1000);
    startedAtRef.current = Date.now();
    setState("recording");
    startTicker();
  }, [isSupported, releaseStream, finalizeCurrentChunk, startTicker, stopTicker]);

  const pause = useCallback(() => {
    const r = recorderRef.current;
    if (!r || r.state !== "recording") return;
    try {
      r.pause();
      accumulatedRef.current += Date.now() - startedAtRef.current;
      stopTicker();
      setState("paused");
    } catch {
      // ignore
    }
  }, [stopTicker]);

  const resume = useCallback(() => {
    const r = recorderRef.current;
    if (!r || r.state !== "paused") return;
    try {
      r.resume();
      startedAtRef.current = Date.now();
      startTicker();
      setState("recording");
    } catch {
      // ignore
    }
  }, [startTicker]);

  const stop = useCallback((): Promise<RecordedChunk[]> => {
    const r = recorderRef.current;
    if (!r) return Promise.resolve([]);
    stoppingRef.current = true;
    setState("stopping");
    splitForSizeRef.current = false;
    return new Promise<RecordedChunk[]>((resolve) => {
      stopResolveRef.current = resolve;
      try {
        if (r.state !== "inactive") r.stop();
        else {
          stopResolveRef.current = null;
          stopTicker();
          releaseStream();
          const out = finishedChunksRef.current;
          finishedChunksRef.current = [];
          setState("idle");
          setElapsedMs(0);
          resolve(out);
        }
      } catch {
        stopResolveRef.current = null;
        resolve([]);
      }
    });
  }, [releaseStream, stopTicker]);

  const cancel = useCallback(() => {
    const r = recorderRef.current;
    splitForSizeRef.current = false;
    stoppingRef.current = true;
    chunksRef.current = [];
    finishedChunksRef.current = [];
    stopResolveRef.current = null;
    try {
      if (r && r.state !== "inactive") r.stop();
    } catch {
      // ignore
    }
    stopTicker();
    releaseStream();
    setState("idle");
    setElapsedMs(0);
    accumulatedRef.current = 0;
  }, [releaseStream, stopTicker]);

  return { state, elapsedMs, error, isSupported, start, stop, pause, resume, cancel };
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

import { useState } from "react";
import { Mic, Square, Pause, Play, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAudioRecorder, formatElapsed, type RecordedChunk } from "@/hooks/use-audio-recorder";

interface Props {
  onTranscribed: (text: string) => void;
  disabled?: boolean;
}

async function transcribeChunk(chunk: RecordedChunk): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/sessions/transcribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": chunk.mimeType || "audio/webm" },
    body: chunk.blob,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Transcription failed (${res.status})`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

export function VoiceRecordButton({ onTranscribed, disabled }: Props) {
  const recorder = useAudioRecorder();
  const { toast } = useToast();
  const [transcribing, setTranscribing] = useState(false);

  if (!recorder.isSupported) return null;

  const handleStart = async () => {
    await recorder.start();
  };

  const handleStop = async () => {
    const chunks = await recorder.stop();
    if (chunks.length === 0) return;
    setTranscribing(true);
    try {
      const parts: string[] = [];
      for (const chunk of chunks) {
        const text = await transcribeChunk(chunk);
        if (text) parts.push(text);
      }
      const combined = parts.join(" ").trim();
      if (combined) {
        onTranscribed(combined);
        toast({ title: "Transcription added to notes" });
      } else {
        toast({ title: "No speech detected", variant: "destructive" });
      }
    } catch (err) {
      toast({
        title: "Transcription failed",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setTranscribing(false);
    }
  };

  if (recorder.error && recorder.state === "idle") {
    return (
      <div className="inline-flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleStart}
          disabled={disabled || transcribing}
          data-testid="button-record-retry"
        >
          <Mic className="h-4 w-4 mr-1" />
          Record
        </Button>
        <span className="text-xs text-destructive">{recorder.error}</span>
      </div>
    );
  }

  if (transcribing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="status-transcribing">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Transcribing…
      </span>
    );
  }

  if (recorder.state === "idle" || recorder.state === "stopping") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleStart}
        disabled={disabled || recorder.state === "stopping"}
        data-testid="button-record-start"
      >
        <Mic className="h-4 w-4 mr-1" />
        Record
      </Button>
    );
  }

  const isRecording = recorder.state === "recording";
  return (
    <div className="inline-flex items-center gap-2" data-testid="recording-controls">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-400">
        <span className={`h-2 w-2 rounded-full bg-red-500 ${isRecording ? "animate-pulse" : ""}`} />
        <span className="font-mono tabular-nums" data-testid="text-record-elapsed">{formatElapsed(recorder.elapsedMs)}</span>
      </span>
      {isRecording ? (
        <Button type="button" size="sm" variant="outline" onClick={recorder.pause} data-testid="button-record-pause">
          <Pause className="h-4 w-4 mr-1" />
          Pause
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={recorder.resume} data-testid="button-record-resume">
          <Play className="h-4 w-4 mr-1" />
          Resume
        </Button>
      )}
      <Button type="button" size="sm" onClick={handleStop} data-testid="button-record-stop">
        <Square className="h-4 w-4 mr-1" />
        Stop
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={recorder.cancel} data-testid="button-record-cancel" title="Discard recording">
        <X className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

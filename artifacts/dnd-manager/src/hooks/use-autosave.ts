import { useEffect, useRef, useCallback, useState } from "react";

interface DraftData {
  text: string;
  serverVersion: string;
  savedAt: number;
}

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

function getDraftKey(sessionId: number): string {
  return `session-draft-${sessionId}`;
}

export function useAutosave(
  sessionId: number,
  serverNotes: string,
  isEditing: boolean,
  saveFn: (text: string) => Promise<unknown>,
  debounceMs = 30000,
) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;
  const latestTextRef = useRef("");
  const serverNotesRef = useRef(serverNotes);
  serverNotesRef.current = serverNotes;
  const isSavingRef = useRef(false);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(getDraftKey(sessionId));
    } catch {}
  }, [sessionId]);

  const getStoredDraft = useCallback((): string | null => {
    try {
      const raw = localStorage.getItem(getDraftKey(sessionId));
      if (!raw) return null;
      const draft: DraftData = JSON.parse(raw);
      if (draft.serverVersion === serverNotes && draft.text !== serverNotes) {
        return draft.text;
      }
      localStorage.removeItem(getDraftKey(sessionId));
      return null;
    } catch {
      return null;
    }
  }, [sessionId, serverNotes]);

  const handleNoteChange = useCallback(
    (text: string) => {
      latestTextRef.current = text;

      try {
        const draft: DraftData = {
          text,
          serverVersion: serverNotesRef.current,
          savedAt: Date.now(),
        };
        localStorage.setItem(getDraftKey(sessionId), JSON.stringify(draft));
      } catch {}

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (text === serverNotesRef.current) return;

      timerRef.current = setTimeout(async () => {
        const current = latestTextRef.current;
        if (current === serverNotesRef.current) return;
        if (isSavingRef.current) return;

        isSavingRef.current = true;
        setStatus("saving");
        try {
          await saveFnRef.current(current);
          setStatus("saved");
          setLastSavedAt(new Date());
          clearDraft();
        } catch {
          setStatus("error");
        } finally {
          isSavingRef.current = false;
        }
      }, debounceMs);
    },
    [sessionId, debounceMs, clearDraft],
  );

  useEffect(() => {
    if (!isEditing) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setStatus("idle");
      setLastSavedAt(null);
    }
  }, [isEditing]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { status, lastSavedAt, handleNoteChange, getStoredDraft, clearDraft };
}

import { useEffect, useRef, useCallback, useState } from "react";

interface DraftData {
  text: string;
  serverVersion: string;
  savedAt: number;
}

export type AutosaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export interface ConflictData {
  localText: string;
  serverNotes: string;
  serverVersion: number;
}

function getDraftKey(sessionId: number): string {
  return `session-draft-${sessionId}`;
}

export function useAutosave(
  sessionId: number,
  serverNotes: string,
  serverVersion: number,
  isEditing: boolean,
  saveFn: (text: string, expectedVersion?: number) => Promise<unknown>,
  debounceMs = 30000,
) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [conflict, setConflict] = useState<ConflictData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;
  const latestTextRef = useRef("");
  const serverNotesRef = useRef(serverNotes);
  serverNotesRef.current = serverNotes;
  const knownVersionRef = useRef(serverVersion);
  const isSavingRef = useRef(false);

  useEffect(() => {
    if (!isEditing) {
      knownVersionRef.current = serverVersion;
    }
  }, [isEditing, serverVersion]);

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

  const resolveConflict = useCallback(
    (action: "overwrite" | "discard") => {
      if (!conflict) return;
      if (action === "overwrite") {
        setConflict(null);
        setStatus("saving");
        isSavingRef.current = true;
        saveFnRef
          .current(conflict.localText)
          .then((result) => {
            setStatus("saved");
            setLastSavedAt(new Date());
            clearDraft();
            if (result && typeof result === "object" && "version" in result) {
              knownVersionRef.current = (result as { version: number }).version;
            }
          })
          .catch(() => {
            setStatus("error");
          })
          .finally(() => {
            isSavingRef.current = false;
          });
      } else {
        clearDraft();
        setConflict(null);
        setStatus("idle");
      }
    },
    [conflict, clearDraft],
  );

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
          const result = await saveFnRef.current(current, knownVersionRef.current);
          setStatus("saved");
          setLastSavedAt(new Date());
          clearDraft();
          if (result && typeof result === "object" && "version" in result) {
            knownVersionRef.current = (result as { version: number }).version;
          }
        } catch (err: unknown) {
          const apiErr = err as { status?: number; data?: unknown } | undefined;
          if (apiErr?.status === 409 && apiErr?.data) {
            const data = apiErr.data as { serverSession?: { rawNotesMd?: string; version?: number } };
            setConflict({
              localText: current,
              serverNotes: data.serverSession?.rawNotesMd ?? "",
              serverVersion: data.serverSession?.version ?? 0,
            });
            setStatus("conflict");
          } else {
            setStatus("error");
          }
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
      setConflict(null);
    }
  }, [isEditing]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const getExpectedVersion = useCallback(() => knownVersionRef.current, []);

  return { status, lastSavedAt, conflict, handleNoteChange, getStoredDraft, clearDraft, resolveConflict, getExpectedVersion };
}

import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollText, Plus, Sparkles, ArrowLeft, ChevronRight, Pencil, Save, AlertTriangle, Check, X, Calendar, Clock, CheckCircle2, Loader2, Bell, BellRing, ShieldAlert, Send, ChevronDown, ChevronUp } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useListSessions, useGetSession, useCreateSession, useUpdateSession, useGenerateRecap,
  useMarkRecapViewed, useNotifyRecap,
  getListSessionsQueryKey, getGetSessionQueryKey, getGetDashboardQueryKey,
  updateSession as updateSessionApi,
} from "@workspace/api-client-react";
import { useAutosave } from "@/hooks/use-autosave";
import { NotesDiffView } from "@/components/notes-diff-view";
import { useGetMyMembership } from "@workspace/api-client-react";
import type { SessionLog, CampaignMember } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedBorder } from "@/components/ui/animated-border";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

export default function SessionsPanel() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  if (selectedId !== null) {
    return <SessionDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  if (showCreate) {
    return <CreateSession onBack={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); setSelectedId(id); }} />;
  }

  return <SessionList onSelect={setSelectedId} onCreate={() => setShowCreate(true)} />;
}

function SessionList({ onSelect, onCreate }: { onSelect: (id: number) => void; onCreate: () => void }) {
  const { data: sessions, isLoading } = useListSessions();
  const { data: membership } = useGetMyMembership();
  const isDm = (membership as CampaignMember | undefined)?.role === "dm";
  const { toast } = useToast();
  const toastShownRef = useRef(false);

  const newRecapCount = !isDm && sessions
    ? (sessions as SessionLog[]).filter(s => s.hasNewRecap).length
    : 0;

  useEffect(() => {
    if (newRecapCount > 0 && !toastShownRef.current) {
      toastShownRef.current = true;
      toast({
        title: `${newRecapCount} new recap${newRecapCount > 1 ? "s" : ""} available!`,
        description: "Your DM has published new session recaps. Check them out!",
      });
    }
  }, [newRecapCount, toast]);

  return (
    <div className="space-y-6" data-testid="sessions-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2 tracking-tight">
          <ScrollText className="h-6 w-6 text-primary" />
          Sessions
        </h2>
        {isDm && (
          <Button size="sm" onClick={onCreate} data-testid="button-create-session">
            <Plus className="h-4 w-4 mr-1" />
            New Session
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : !sessions?.length ? (
        <div className="rounded-2xl border border-dashed border-[rgba(255,255,255,0.08)] p-8 text-center">
          <ScrollText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No session logs yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(sessions as SessionLog[]).map((s) => {
            const cardInner = (
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    Session <span className="font-mono tabular-nums">{s.sessionNumber}</span>: {s.title}
                    {s.hasNewRecap && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-400 animate-pulse" data-testid={`badge-new-recap-${s.id}`}>
                        <Bell className="h-3 w-3" />
                        New
                      </span>
                    )}
                  </h3>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-muted-foreground">
                      {s.playedAt ? new Date(s.playedAt).toLocaleDateString() : "Date TBD"}
                    </span>
                    {s.recapMd ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary" data-testid={`badge-recap-available-${s.id}`}>
                        <CheckCircle2 className="h-3 w-3" />
                        Recap available
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground" data-testid={`badge-recap-pending-${s.id}`}>
                        <Clock className="h-3 w-3" />
                        Recap pending
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
              </div>
            );

            return (
              <motion.button
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={`w-full text-left ${s.hasNewRecap ? "" : "rounded-2xl glass-panel-hover p-4"}`}
                data-testid={`card-session-${s.id}`}
              >
                {s.hasNewRecap ? (
                  <AnimatedBorder className="p-4" interactive speed="slow">{cardInner}</AnimatedBorder>
                ) : cardInner}
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateSession({ onBack, onCreated }: { onBack: () => void; onCreated: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const [sessionNumber, setSessionNumber] = useState(1);
  const [notes, setNotes] = useState("");
  const createMutation = useCreateSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleCreate = () => {
    if (!title.trim()) return;
    createMutation.mutate(
      { data: { sessionNumber, title, rawNotesMd: notes || null } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          toast({ title: "Session created!" });
          onCreated(data.id);
        },
      },
    );
  };

  return (
    <div className="space-y-6" data-testid="create-session">
      <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-sessions">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </Button>
      <h2 className="text-2xl font-semibold text-foreground tracking-tight">New Session Log</h2>
      <div className="space-y-4 max-w-xl">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Session #</label>
            <Input type="number" value={sessionNumber} onChange={(e) => setSessionNumber(parseInt(e.target.value) || 1)} className="font-mono tabular-nums" data-testid="input-session-number" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Tomb of Annihilation" data-testid="input-session-title" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">DM Notes (Markdown)</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={8} placeholder="What happened this session..." data-testid="input-session-notes" />
        </div>
        <Button onClick={handleCreate} disabled={createMutation.isPending || !title.trim()} data-testid="button-save-session">
          Create Session
        </Button>
      </div>
    </div>
  );
}

function SessionDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { data: session, isLoading } = useGetSession(id, { query: { queryKey: getGetSessionQueryKey(id) } });
  const { data: membership } = useGetMyMembership();
  const generateRecap = useGenerateRecap();
  const notifyRecap = useNotifyRecap();
  const markViewed = useMarkRecapViewed();
  const updateSession = useUpdateSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isDm = (membership as CampaignMember | undefined)?.role === "dm";
  const s = session as SessionLog | undefined;
  const markedViewedRef = useRef(false);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [editingDate, setEditingDate] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);

  const [editingSessionNumber, setEditingSessionNumber] = useState(false);
  const [draftSessionNumber, setDraftSessionNumber] = useState(0);
  const sessionNumberInputRef = useRef<HTMLInputElement>(null);

  type UndoField = "title" | "playedAt" | "sessionNumber";
  const FIELD_LABELS: Record<UndoField, string> = { title: "Title", playedAt: "Date", sessionNumber: "Session number" };
  const BATCH_WINDOW_MS = 5000;
  type UndoBatch = {
    originals: { title?: string; playedAt?: string | null; sessionNumber?: number };
    fields: Set<UndoField>;
    toastControl: ReturnType<typeof toast> | null;
    timerId: ReturnType<typeof setTimeout> | null;
  };
  const undoBatchRef = useRef<UndoBatch>({
    originals: {},
    fields: new Set(),
    toastControl: null,
    timerId: null,
  });

  const resetUndoBatch = useCallback(() => {
    if (undoBatchRef.current.timerId) clearTimeout(undoBatchRef.current.timerId);
    undoBatchRef.current = { originals: {}, fields: new Set(), toastControl: null, timerId: null };
  }, []);

  const performBatchedUndo = useCallback(() => {
    const batch = undoBatchRef.current;
    const originals = batch.originals;
    const fields = Array.from(batch.fields);
    if (fields.length === 0) return;
    batch.toastControl?.dismiss();
    resetUndoBatch();
    const data: { title?: string; playedAt?: string | null; sessionNumber?: number } = {};
    if ("title" in originals) data.title = originals.title;
    if ("playedAt" in originals) data.playedAt = originals.playedAt ?? null;
    if ("sessionNumber" in originals && originals.sessionNumber !== undefined) data.sessionNumber = originals.sessionNumber;
    updateSession.mutate(
      { id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          toast({
            title: fields.length > 1 ? "Changes reverted" : `${FIELD_LABELS[fields[0]]} reverted`,
          });
        },
        onError: () => {
          toast({ title: "Failed to undo changes", variant: "destructive" });
        },
      },
    );
  }, [id, updateSession, queryClient, toast, resetUndoBatch]);

  const queueUndoToast = useCallback(
    (field: UndoField, originalValue: string | number | null | undefined) => {
      const batch = undoBatchRef.current;
      if (!(field in batch.originals)) {
        if (field === "title") batch.originals.title = (originalValue as string | undefined) ?? "";
        else if (field === "playedAt") batch.originals.playedAt = (originalValue as string | null | undefined) ?? null;
        else batch.originals.sessionNumber = originalValue as number;
      }
      batch.fields.add(field);

      const fields = Array.from(batch.fields);
      const title =
        fields.length > 1 ? `${fields.length} changes saved` : `${FIELD_LABELS[fields[0]]} updated`;
      const action = (
        <ToastAction altText="Undo recent changes" onClick={performBatchedUndo}>
          Undo
        </ToastAction>
      );

      if (batch.toastControl) {
        batch.toastControl.update({
          id: batch.toastControl.id,
          title,
          action,
          open: true,
          duration: Infinity,
        });
      } else {
        batch.toastControl = toast({ title, action, duration: Infinity });
      }

      if (batch.timerId) clearTimeout(batch.timerId);
      batch.timerId = setTimeout(() => {
        const current = undoBatchRef.current;
        current.toastControl?.dismiss();
        resetUndoBatch();
      }, BATCH_WINDOW_MS);
    },
    [toast, performBatchedUndo, resetUndoBatch],
  );

  useEffect(() => {
    return () => {
      const batch = undoBatchRef.current;
      if (batch.timerId) clearTimeout(batch.timerId);
      batch.toastControl?.dismiss();
    };
  }, []);

  const autosaveSaveFn = useCallback(
    async (text: string, expectedVersion?: number) => {
      const result = await updateSessionApi(id, {
        rawNotesMd: text,
        ...(expectedVersion !== undefined ? { expectedVersion } : {}),
      });
      queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      return result;
    },
    [id, queryClient],
  );

  const { status: autosaveStatus, lastSavedAt: autosaveLastSavedAt, conflict, handleNoteChange, getStoredDraft, clearDraft, resolveConflict, getExpectedVersion } = useAutosave(
    id,
    s?.rawNotesMd ?? "",
    s?.version ?? 1,
    editingNotes,
    autosaveSaveFn,
  );

  useEffect(() => {
    if (!isDm && s?.recapMd && !markedViewedRef.current) {
      markedViewedRef.current = true;
      markViewed.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          },
        },
      );
    }
  }, [isDm, s, id, markViewed, queryClient]);

  useEffect(() => {
    if (editingNotes && notesRef.current) {
      notesRef.current.focus();
      const len = notesRef.current.value.length;
      notesRef.current.setSelectionRange(len, len);
    }
  }, [editingNotes]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    if (editingDate && dateInputRef.current) {
      dateInputRef.current.focus();
    }
  }, [editingDate]);

  useEffect(() => {
    if (editingSessionNumber && sessionNumberInputRef.current) {
      sessionNumberInputRef.current.focus();
      sessionNumberInputRef.current.select();
    }
  }, [editingSessionNumber]);

  const isDirty = editingNotes && notes !== (s?.rawNotesMd ?? "");

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
  const isRecapStale = !!(s?.generatedAt && s?.updatedAt && new Date(s.updatedAt) > new Date(s.generatedAt));

  const handleSaveSessionNumber = useCallback(() => {
    if (!s || draftSessionNumber < 1 || draftSessionNumber === s.sessionNumber) {
      setEditingSessionNumber(false);
      return;
    }
    const previousSessionNumber = s.sessionNumber;
    updateSession.mutate(
      { id, data: { sessionNumber: draftSessionNumber, expectedVersion: s.version } },
      {
        onSuccess: () => {
          setEditingSessionNumber(false);
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          queueUndoToast("sessionNumber", previousSessionNumber);
        },
        onError: (err: unknown) => {
          const apiErr = err as { status?: number } | undefined;
          if (apiErr?.status === 409) {
            setEditingSessionNumber(false);
            queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
            queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
            toast({
              title: "Session number not saved",
              description: "Another change was made in another tab. Your edit was discarded — please review and try again.",
              variant: "destructive",
            });
          } else {
            toast({ title: "Failed to update session number", variant: "destructive" });
          }
        },
      },
    );
  }, [s, draftSessionNumber, id, updateSession, queryClient, toast, queueUndoToast]);

  const handleSaveTitle = useCallback(() => {
    if (!s || !draftTitle.trim() || draftTitle.trim() === s.title) {
      setEditingTitle(false);
      return;
    }
    const previousTitle = s.title;
    updateSession.mutate(
      { id, data: { title: draftTitle.trim(), expectedVersion: s.version } },
      {
        onSuccess: () => {
          setEditingTitle(false);
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          queueUndoToast("title", previousTitle);
        },
        onError: (err: unknown) => {
          const apiErr = err as { status?: number } | undefined;
          if (apiErr?.status === 409) {
            setEditingTitle(false);
            queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
            queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
            toast({
              title: "Title not saved",
              description: "Another change was made in another tab. Your edit was discarded — please review and try again.",
              variant: "destructive",
            });
          } else {
            toast({ title: "Failed to update title", variant: "destructive" });
          }
        },
      },
    );
  }, [s, draftTitle, id, updateSession, queryClient, toast, queueUndoToast]);

  const handleSaveDate = useCallback((value: string) => {
    const newPlayedAt = value || null;
    const oldPlayedAt = s?.playedAt ? new Date(s.playedAt).toISOString().split("T")[0] : null;
    if (newPlayedAt === oldPlayedAt) {
      setEditingDate(false);
      return;
    }
    const previousPlayedAt = s?.playedAt ?? null;
    updateSession.mutate(
      { id, data: { playedAt: newPlayedAt ? new Date(newPlayedAt).toISOString() : null, expectedVersion: s?.version } },
      {
        onSuccess: () => {
          setEditingDate(false);
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          queueUndoToast("playedAt", previousPlayedAt);
        },
        onError: (err: unknown) => {
          const apiErr = err as { status?: number } | undefined;
          if (apiErr?.status === 409) {
            setEditingDate(false);
            queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
            queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
            toast({
              title: "Date not saved",
              description: "Another change was made in another tab. Your edit was discarded — please review and try again.",
              variant: "destructive",
            });
          } else {
            toast({ title: "Failed to update date", variant: "destructive" });
          }
        },
      },
    );
  }, [s, id, updateSession, queryClient, toast, queueUndoToast]);

  const handleBack = () => {
    if (isDirty && !confirm("You have unsaved changes to your notes. Discard them?")) {
      return;
    }
    onBack();
  };

  const handleGenerateRecap = () => {
    generateRecap.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          toast({
            title: "Recap generated!",
            description: "Review and edit it below, then notify your players when ready.",
          });
        },
        onError: () => {
          toast({ title: "Failed to generate recap", variant: "destructive" });
        },
      },
    );
  };

  const [showDiff, setShowDiff] = useState(false);

  const handleNotifyPlayers = () => {
    notifyRecap.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          toast({ title: "Players notified!", description: "Recap notification emails are on their way." });
        },
        onError: () => {
          toast({ title: "Failed to notify players", variant: "destructive" });
        },
      },
    );
  };


  const [manualSaveConflict, setManualSaveConflict] = useState<{
    localText: string;
    serverNotes: string;
    serverVersion: number;
  } | null>(null);

  const activeConflictKey = manualSaveConflict
    ? `manual-${manualSaveConflict.serverVersion}`
    : conflict
    ? `auto-${conflict.serverVersion}`
    : null;
  useEffect(() => {
    if (!activeConflictKey) setShowDiff(false);
  }, [activeConflictKey]);

  const showNotesSavedUndoToast = (previousNotes: string, savedTitle: string) => {
    toast({
      title: savedTitle,
      duration: 5000,
      action: (
        <ToastAction
          altText="Undo notes change"
          onClick={() => {
            updateSession.mutate(
              { id, data: { rawNotesMd: previousNotes } },
              {
                onSuccess: () => {
                  setNotes(previousNotes);
                  queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
                  queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
                  toast({ title: "Notes reverted" });
                },
                onError: () => {
                  toast({ title: "Failed to undo notes change", variant: "destructive" });
                },
              },
            );
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };

  const handleSaveNotes = () => {
    const previousNotes = s?.rawNotesMd ?? "";
    const ev = getExpectedVersion();
    updateSession.mutate(
      { id, data: { rawNotesMd: notes, expectedVersion: ev } },
      {
        onSuccess: () => {
          clearDraft();
          setEditingNotes(false);
          setManualSaveConflict(null);
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          showNotesSavedUndoToast(previousNotes, "Notes saved");
        },
        onError: (err: unknown) => {
          const apiErr = err as { status?: number; data?: { serverSession?: { rawNotesMd?: string; version?: number } } } | undefined;
          if (apiErr?.status === 409 && apiErr?.data?.serverSession) {
            setManualSaveConflict({
              localText: notes,
              serverNotes: apiErr.data.serverSession.rawNotesMd ?? "",
              serverVersion: apiErr.data.serverSession.version ?? 0,
            });
          } else {
            toast({ title: "Failed to save notes", variant: "destructive" });
          }
        },
      },
    );
  };

  const handleForceOverwrite = () => {
    const previousNotes = manualSaveConflict?.serverNotes ?? s?.rawNotesMd ?? "";
    updateSession.mutate(
      { id, data: { rawNotesMd: notes } },
      {
        onSuccess: () => {
          clearDraft();
          setEditingNotes(false);
          setManualSaveConflict(null);
          if (conflict) resolveConflict("discard");
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          showNotesSavedUndoToast(previousNotes, "Notes saved (overwritten)");
        },
        onError: () => {
          toast({ title: "Failed to save notes", variant: "destructive" });
        },
      },
    );
  };

  const handleDiscardLocal = () => {
    clearDraft();
    setManualSaveConflict(null);
    if (conflict) resolveConflict("discard");
    queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
    setNotes(manualSaveConflict?.serverNotes ?? conflict?.serverNotes ?? s?.rawNotesMd ?? "");
    setEditingNotes(false);
    toast({ title: "Loaded server version" });
  };

  const activeConflict = manualSaveConflict ?? conflict;

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 rounded-2xl" /></div>;
  }

  if (!s) {
    return <p className="text-muted-foreground">Session not found.</p>;
  }

  return (
    <div className="space-y-6" data-testid="session-detail">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={handleBack} data-testid="button-back-sessions">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      <div>
        {isDm && editingSessionNumber ? (
          <div className="flex items-center gap-2" data-testid="edit-session-number">
            <span className="text-2xl font-semibold text-foreground whitespace-nowrap tracking-tight">Session</span>
            <Input
              ref={sessionNumberInputRef}
              type="number"
              min={1}
              value={draftSessionNumber}
              onChange={(e) => setDraftSessionNumber(parseInt(e.target.value) || 1)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveSessionNumber();
                if (e.key === "Escape") setEditingSessionNumber(false);
              }}
              className="text-2xl font-semibold font-mono tabular-nums h-auto py-0.5 px-2 w-24"
              data-testid="input-edit-session-number"
            />
            <span className="text-2xl font-semibold text-foreground">: {s.title}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleSaveSessionNumber} disabled={updateSession.isPending || draftSessionNumber < 1} data-testid="button-save-session-number">
              <Check className="h-4 w-4 text-green-400" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingSessionNumber(false)} data-testid="button-cancel-session-number">
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ) : isDm && editingTitle ? (
          <div className="flex items-center gap-2" data-testid="edit-session-title">
            <span className="text-2xl font-semibold text-foreground whitespace-nowrap tracking-tight">Session <span className="font-mono tabular-nums">{s.sessionNumber}</span>:</span>
            <Input
              ref={titleInputRef}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              className="text-2xl font-semibold h-auto py-0.5 px-2"
              data-testid="input-edit-title"
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleSaveTitle} disabled={updateSession.isPending || !draftTitle.trim()} data-testid="button-save-title">
              <Check className="h-4 w-4 text-green-400" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingTitle(false)} data-testid="button-cancel-title">
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ) : (
          <h2
            className="text-2xl font-semibold text-foreground tracking-tight"
            data-testid="text-session-title"
          >
            Session{" "}
            <span
              className={`font-mono tabular-nums${isDm ? " cursor-pointer hover:text-primary/80 transition-colors" : ""}`}
              onClick={isDm ? (e) => { e.stopPropagation(); setDraftSessionNumber(s.sessionNumber); setEditingSessionNumber(true); } : undefined}
              title={isDm ? "Click to edit session number" : undefined}
              data-testid="text-session-number"
            >{s.sessionNumber}</span>:{" "}
            <span
              className={isDm ? "cursor-pointer hover:text-primary/80 transition-colors" : ""}
              onClick={isDm ? () => { setDraftTitle(s.title); setEditingTitle(true); } : undefined}
              title={isDm ? "Click to edit title" : undefined}
            >{s.title}</span>
            {isDm && <Pencil className="inline h-3.5 w-3.5 ml-2 text-muted-foreground opacity-0 group-hover:opacity-100" />}
          </h2>
        )}

        {isDm && editingDate ? (
          <div className="flex items-center gap-2 mt-1" data-testid="edit-session-date">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={dateInputRef}
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveDate(draftDate);
                if (e.key === "Escape") setEditingDate(false);
              }}
              className="bg-background border border-border rounded-md px-2 py-1 text-sm text-foreground"
              data-testid="input-edit-date"
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleSaveDate(draftDate)} disabled={updateSession.isPending} data-testid="button-save-date">
              <Check className="h-4 w-4 text-green-400" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingDate(false)} data-testid="button-cancel-date">
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
            {draftDate && (
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => handleSaveDate("")} data-testid="button-clear-date">
                Clear date
              </Button>
            )}
          </div>
        ) : (
          <p
            className={`text-sm text-muted-foreground mt-1${isDm ? " cursor-pointer hover:text-primary/80 transition-colors" : ""}`}
            onClick={isDm ? () => {
              setDraftDate(s.playedAt ? new Date(s.playedAt).toISOString().split("T")[0] : "");
              setEditingDate(true);
            } : undefined}
            title={isDm ? "Click to edit date" : undefined}
            data-testid="text-session-date"
          >
            {s.playedAt ? `Played on ${new Date(s.playedAt).toLocaleDateString()}` : "Date TBD"}
          </p>
        )}
      </div>

      {s.recapMd ? (
        <div className="rounded-2xl glass-panel p-6" style={{ boxShadow: "0 0 25px hsla(270, 100%, 60%, 0.1)" }} data-testid="section-recap">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Recap
            </h3>
            <div className="flex items-center gap-3 flex-wrap">
              {isDm && isRecapStale && (
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  Notes updated since last recap
                </span>
              )}
              {isDm && (
                s.notifiedAt && !isRecapStale ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400" data-testid="text-notified-status">
                    <BellRing className="h-3 w-3" />
                    Players notified {new Date(s.notifiedAt).toLocaleString()}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleNotifyPlayers}
                    disabled={notifyRecap.isPending}
                    data-testid="button-notify-players"
                  >
                    <Send className="h-4 w-4 mr-1" />
                    {notifyRecap.isPending ? "Sending..." : s.notifiedAt ? "Re-notify Players" : "Notify Players"}
                  </Button>
                )
              )}
            </div>
          </div>
          <div className="prose prose-sm prose-invert max-w-none text-foreground/90" dangerouslySetInnerHTML={{ __html: markdownToHtml(s.recapMd) }} />
        </div>
      ) : !isDm ? (
        <div className="rounded-2xl border border-dashed border-[rgba(255,255,255,0.08)] p-6 text-center" data-testid="section-recap-pending">
          <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-semibold text-card-foreground mb-1">Recap coming soon</h3>
          <p className="text-sm text-muted-foreground">The DM hasn't published a recap for this session yet. Check back later!</p>
        </div>
      ) : null}

      {isDm && (
        <div className="rounded-2xl glass-panel p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Pencil className="h-4 w-4 text-muted-foreground" />
              DM Notes
              {isDirty && <span className="text-xs text-amber-400">(unsaved)</span>}
            </h3>
            <div className="flex items-center gap-2">
              {!editingNotes && s.rawNotesMd && (
                <Button size="sm" variant="outline" onClick={handleGenerateRecap} disabled={generateRecap.isPending} data-testid="button-generate-recap">
                  <Sparkles className="h-4 w-4 mr-1" />
                  {generateRecap.isPending ? "Generating..." : s.recapMd ? "Regenerate Recap" : "Generate Recap"}
                </Button>
              )}
              {!editingNotes && (
                <Button variant="ghost" size="sm" onClick={() => {
                  const draft = getStoredDraft();
                  if (draft !== null) {
                    setNotes(draft);
                    toast({ title: "Restored unsaved draft" });
                  } else {
                    setNotes(s.rawNotesMd ?? "");
                  }
                  setEditingNotes(true);
                }} data-testid="button-edit-notes">
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
          {editingNotes ? (
            <div className="space-y-3">
              {activeConflict && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3" data-testid="conflict-banner">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-300">Conflict detected</p>
                      <p className="text-xs text-amber-300/80 mt-0.5">
                        This session was updated from another tab or window. Your local changes may overwrite those updates.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="border-amber-500/40 text-amber-300 hover:bg-amber-500/20" onClick={handleForceOverwrite} disabled={updateSession.isPending} data-testid="button-force-overwrite">
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Keep my changes
                    </Button>
                    <Button size="sm" variant="ghost" className="text-amber-300 hover:bg-amber-500/20" onClick={handleDiscardLocal} data-testid="button-discard-local">
                      Load server version
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-amber-300 hover:bg-amber-500/20"
                      onClick={() => setShowDiff((v) => !v)}
                      aria-expanded={showDiff}
                      data-testid="button-toggle-diff"
                    >
                      {showDiff ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                      {showDiff ? "Hide changes" : "Compare changes"}
                    </Button>
                  </div>
                  {showDiff && (
                    <NotesDiffView
                      localText={activeConflict.localText}
                      serverText={activeConflict.serverNotes}
                    />
                  )}
                </div>
              )}
              <Textarea ref={notesRef} value={notes} onChange={(e) => { setNotes(e.target.value); handleNoteChange(e.target.value); }} rows={12} placeholder="Write your session notes in markdown..." className="font-mono text-sm" data-testid="input-edit-notes" />
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={handleSaveNotes} disabled={updateSession.isPending || !isDirty} data-testid="button-save-notes">
                  <Save className="h-4 w-4 mr-1" />
                  {updateSession.isPending ? "Saving..." : "Save Notes"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { if (isDirty && !confirm("Discard unsaved changes?")) return; clearDraft(); setManualSaveConflict(null); setEditingNotes(false); }}>Cancel</Button>
                {autosaveStatus === "saving" && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="autosave-status">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Auto-saving...
                  </span>
                )}
                {autosaveStatus === "saved" && autosaveLastSavedAt && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400" data-testid="autosave-status">
                    <Check className="h-3 w-3" />
                    Auto-saved at {autosaveLastSavedAt.toLocaleTimeString()}
                  </span>
                )}
                {(autosaveStatus === "error" || autosaveStatus === "conflict") && !activeConflict && (
                  <span className="flex items-center gap-1 text-xs text-destructive" data-testid="autosave-status">
                    <AlertTriangle className="h-3 w-3" />
                    Auto-save failed
                  </span>
                )}
              </div>
            </div>
          ) : s.rawNotesMd ? (
            <div className="prose prose-sm prose-invert max-w-none text-foreground/90" data-testid="text-session-notes" dangerouslySetInnerHTML={{ __html: markdownToHtml(s.rawNotesMd) }} />
          ) : (
            <p className="text-sm text-muted-foreground italic" data-testid="text-session-notes">No notes yet. Click Edit to add session notes.</p>
          )}
        </div>
      )}
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function markdownToHtml(md: string): string {
  const escaped = escapeHtml(md);
  return escaped
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<)(.+)$/gm, "<p>$1</p>");
}

import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollText, Plus, Sparkles, ArrowLeft, ChevronRight, Pencil, Save, AlertTriangle, Check, X, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useListSessions, useGetSession, useCreateSession, useUpdateSession, useGenerateRecap,
  getListSessionsQueryKey, getGetSessionQueryKey, getGetDashboardQueryKey
} from "@workspace/api-client-react";
import { useGetMyMembership } from "@workspace/api-client-react";
import type { SessionLog, CampaignMember } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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
          {(sessions as SessionLog[]).map((s) => (
            <motion.button
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="w-full text-left rounded-2xl glass-panel-hover p-4"
              data-testid={`card-session-${s.id}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">
                    Session <span className="font-mono tabular-nums">{s.sessionNumber}</span>: {s.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {s.playedAt ? new Date(s.playedAt).toLocaleDateString() : "Date TBD"}
                    {s.recapMd ? " — Recap available" : ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </motion.button>
          ))}
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
  const updateSession = useUpdateSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isDm = (membership as CampaignMember | undefined)?.role === "dm";
  const s = session as SessionLog | undefined;

  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [editingDate, setEditingDate] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);

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

  const isDirty = editingNotes && notes !== (s?.rawNotesMd ?? "");
  const isRecapStale = !!(s?.generatedAt && s?.updatedAt && new Date(s.updatedAt) > new Date(s.generatedAt));

  const handleSaveTitle = useCallback(() => {
    if (!s || !draftTitle.trim() || draftTitle.trim() === s.title) {
      setEditingTitle(false);
      return;
    }
    updateSession.mutate(
      { id, data: { title: draftTitle.trim() } },
      {
        onSuccess: () => {
          setEditingTitle(false);
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          toast({ title: "Title updated!" });
        },
        onError: () => {
          toast({ title: "Failed to update title", variant: "destructive" });
        },
      },
    );
  }, [s, draftTitle, id, updateSession, queryClient, toast]);

  const handleSaveDate = useCallback((value: string) => {
    const newPlayedAt = value || null;
    const oldPlayedAt = s?.playedAt ? new Date(s.playedAt).toISOString().split("T")[0] : null;
    if (newPlayedAt === oldPlayedAt) {
      setEditingDate(false);
      return;
    }
    updateSession.mutate(
      { id, data: { playedAt: newPlayedAt ? new Date(newPlayedAt).toISOString() : null } },
      {
        onSuccess: () => {
          setEditingDate(false);
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          toast({ title: "Date updated!" });
        },
        onError: () => {
          toast({ title: "Failed to update date", variant: "destructive" });
        },
      },
    );
  }, [s, id, updateSession, queryClient, toast]);

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
          toast({ title: "Recap generated!" });
        },
        onError: () => {
          toast({ title: "Failed to generate recap", variant: "destructive" });
        },
      },
    );
  };

  const handleSaveNotes = () => {
    updateSession.mutate(
      { id, data: { rawNotesMd: notes } },
      {
        onSuccess: () => {
          setEditingNotes(false);
          queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          toast({ title: "Notes saved!" });
        },
        onError: () => {
          toast({ title: "Failed to save notes", variant: "destructive" });
        },
      },
    );
  };

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
        {isDm && editingTitle ? (
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
            className={`text-2xl font-semibold text-foreground tracking-tight${isDm ? " cursor-pointer hover:text-primary/80 transition-colors" : ""}`}
            onClick={isDm ? () => { setDraftTitle(s.title); setEditingTitle(true); } : undefined}
            title={isDm ? "Click to edit title" : undefined}
            data-testid="text-session-title"
          >
            Session <span className="font-mono tabular-nums">{s.sessionNumber}</span>: {s.title}
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

      {s.recapMd && (
        <div className="rounded-2xl glass-panel p-6" style={{ boxShadow: "0 0 25px hsla(270, 100%, 60%, 0.1)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Recap
            </h3>
            {isDm && isRecapStale && (
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                Notes updated since last recap
              </span>
            )}
          </div>
          <div className="prose prose-sm prose-invert max-w-none text-foreground/90" dangerouslySetInnerHTML={{ __html: markdownToHtml(s.recapMd) }} />
        </div>
      )}

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
                <Button variant="ghost" size="sm" onClick={() => { setNotes(s.rawNotesMd ?? ""); setEditingNotes(true); }} data-testid="button-edit-notes">
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
          {editingNotes ? (
            <div className="space-y-3">
              <Textarea ref={notesRef} value={notes} onChange={(e) => setNotes(e.target.value)} rows={12} placeholder="Write your session notes in markdown..." className="font-mono text-sm" data-testid="input-edit-notes" />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSaveNotes} disabled={updateSession.isPending || !isDirty} data-testid="button-save-notes">
                  <Save className="h-4 w-4 mr-1" />
                  {updateSession.isPending ? "Saving..." : "Save Notes"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { if (isDirty && !confirm("Discard unsaved changes?")) return; setEditingNotes(false); }}>Cancel</Button>
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

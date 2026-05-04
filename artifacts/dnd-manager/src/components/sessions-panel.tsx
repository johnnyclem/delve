import { useState } from "react";
import { ScrollText, Plus, Sparkles, ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useListSessions, useGetSession, useCreateSession, useUpdateSession, useGenerateRecap,
  getListSessionsQueryKey, getGetSessionQueryKey, getGetDashboardQueryKey
} from "@workspace/api-client-react";
import { useGetMyMembership } from "@workspace/api-client-react";
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
  const isDm = (membership as any)?.role === "dm";

  return (
    <div className="space-y-6" data-testid="sessions-panel">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl font-bold text-foreground flex items-center gap-2">
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
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : !sessions?.length ? (
        <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
          <ScrollText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No session logs yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(sessions as any[]).map((s: any) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="w-full text-left rounded-xl border border-border/50 bg-card p-4 hover:border-primary/30 transition-colors"
              data-testid={`card-session-${s.id}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-card-foreground">
                    Session {s.sessionNumber}: {s.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {s.playedAt ? new Date(s.playedAt).toLocaleDateString() : "Date TBD"}
                    {s.recapMd ? " — Recap available" : ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </button>
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
        onSuccess: (data: any) => {
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
      <h2 className="font-serif text-2xl font-bold text-foreground">New Session Log</h2>
      <div className="space-y-4 max-w-xl">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Session #</label>
            <Input type="number" value={sessionNumber} onChange={(e) => setSessionNumber(parseInt(e.target.value) || 1)} data-testid="input-session-number" />
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
  const isDm = (membership as any)?.role === "dm";
  const s = session as any;

  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState("");

  const handleGenerateRecap = () => {
    generateRecap.mutate(
      { id },
      {
        onSuccess: (data: any) => {
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
          toast({ title: "Notes saved!" });
        },
      },
    );
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 rounded-xl" /></div>;
  }

  if (!s) {
    return <p className="text-muted-foreground">Session not found.</p>;
  }

  return (
    <div className="space-y-6" data-testid="session-detail">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-sessions">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        {isDm && s.rawNotesMd && (
          <Button size="sm" variant="outline" onClick={handleGenerateRecap} disabled={generateRecap.isPending} data-testid="button-generate-recap">
            <Sparkles className="h-4 w-4 mr-1" />
            {generateRecap.isPending ? "Generating..." : "Generate Recap"}
          </Button>
        )}
      </div>

      <div>
        <h2 className="font-serif text-2xl font-bold text-foreground" data-testid="text-session-title">
          Session {s.sessionNumber}: {s.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {s.playedAt ? `Played on ${new Date(s.playedAt).toLocaleDateString()}` : "Date TBD"}
        </p>
      </div>

      {s.recapMd && (
        <div className="rounded-xl border border-primary/20 bg-card p-6">
          <h3 className="font-semibold text-card-foreground mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Recap
          </h3>
          <div className="prose prose-sm prose-invert max-w-none text-foreground/90" dangerouslySetInnerHTML={{ __html: markdownToHtml(s.recapMd) }} />
        </div>
      )}

      <div className="rounded-xl border border-border/50 bg-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-card-foreground">DM Notes</h3>
          {isDm && !editingNotes && (
            <Button variant="ghost" size="sm" onClick={() => { setNotes(s.rawNotesMd ?? ""); setEditingNotes(true); }} data-testid="button-edit-notes">
              Edit
            </Button>
          )}
        </div>
        {editingNotes ? (
          <div className="space-y-3">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={10} data-testid="input-edit-notes" />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveNotes} disabled={updateSession.isPending} data-testid="button-save-notes">Save</Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingNotes(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-session-notes">
            {s.rawNotesMd || "No notes yet."}
          </div>
        )}
      </div>
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
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-serif font-semibold mt-4 mb-2">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<)(.+)$/gm, "<p>$1</p>");
}

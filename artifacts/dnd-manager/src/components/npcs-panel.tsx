import { useState } from "react";
import { ChevronRight, Plus, Users, ArrowLeft, Trash2, X, User } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNpcs,
  useCreateNpc,
  useUpdateNpc,
  useDeleteNpc,
  useGetMyMembership,
  getListNpcsQueryKey,
} from "@workspace/api-client-react";
import type { Npc } from "@workspace/api-client-react";

const PRESET_TAGS: { label: string; color: string }[] = [
  { label: "Friendly", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  { label: "Hostile", color: "bg-red-500/20 text-red-300 border-red-500/40" },
  { label: "Neutral", color: "bg-slate-500/20 text-slate-300 border-slate-500/40" },
  { label: "Mysterious", color: "bg-violet-500/20 text-violet-300 border-violet-500/40" },
  { label: "Ally", color: "bg-sky-500/20 text-sky-300 border-sky-500/40" },
  { label: "Rival", color: "bg-orange-500/20 text-orange-300 border-orange-500/40" },
  { label: "Unknown", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/40" },
];
const TAG_COLOR_MAP: Record<string, string> = Object.fromEntries(
  PRESET_TAGS.map((t) => [t.label, t.color]),
);
const tagColor = (tag: string) =>
  TAG_COLOR_MAP[tag] ?? "bg-primary/15 text-primary/80 border-primary/30";

type View = { mode: "list" } | { mode: "detail"; id: number } | { mode: "create" };

export default function NpcsPanel() {
  const [view, setView] = useState<View>({ mode: "list" });

  if (view.mode === "create") {
    return (
      <NpcCreateForm
        onCancel={() => setView({ mode: "list" })}
        onCreated={() => setView({ mode: "list" })}
      />
    );
  }

  if (view.mode === "detail") {
    return <NpcDetail id={view.id} onBack={() => setView({ mode: "list" })} />;
  }

  return (
    <NpcGrid
      onSelect={(id) => setView({ mode: "detail", id })}
      onCreate={() => setView({ mode: "create" })}
    />
  );
}

function NpcAvatarThumb({ url, name }: { url: string | null | undefined; name: string }) {
  const src = (() => {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith("/objects/")) return `${import.meta.env.BASE_URL}api/storage${url}`;
    return url;
  })();
  if (src) {
    return (
      <img
        src={src}
        alt={`${name} portrait`}
        loading="lazy"
        className="h-14 w-14 rounded-xl object-cover shrink-0 border border-[rgba(255,255,255,0.08)] [image-rendering:auto]"
        data-testid="img-npc-thumb"
      />
    );
  }
  return (
    <div
      className="h-14 w-14 rounded-xl shrink-0 flex items-center justify-center bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]"
      data-testid="img-npc-thumb-placeholder"
    >
      <User className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}

function NpcGrid({ onSelect, onCreate }: { onSelect: (id: number) => void; onCreate: () => void }) {
  const { data: npcs, isLoading } = useListNpcs();
  const { data: membership } = useGetMyMembership();
  const isDm = membership?.role === "dm";

  return (
    <div className="space-y-6" data-testid="npcs-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2 tracking-tight">
          <Users className="h-6 w-6 text-primary" />
          NPCs
        </h2>
        {isDm && (
          <Button onClick={onCreate} size="sm" data-testid="button-new-npc">
            <Plus className="h-4 w-4 mr-1" />
            New NPC
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : !npcs?.length ? (
        <div className="rounded-2xl border border-dashed border-[rgba(255,255,255,0.08)] p-8 text-center">
          <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No NPCs in the roster yet.</p>
          {isDm && (
            <>
              <p className="text-sm text-muted-foreground mt-1">Add the first NPC to start tagging the cast of your campaign.</p>
              <Button onClick={onCreate} className="mt-4" data-testid="button-create-first-npc">
                <Plus className="h-4 w-4 mr-1" />
                New NPC
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(npcs as Npc[]).map((npc) => (
            <motion.button
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              key={npc.id}
              onClick={() => onSelect(npc.id)}
              className="text-left rounded-2xl glass-panel-hover p-5"
              data-testid={`card-npc-${npc.id}`}
            >
              <div className="flex items-center gap-4">
                <NpcAvatarThumb url={npc.avatarUrl} name={npc.name} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{npc.name}</h3>
                  {npc.shortNote && (
                    <p className="text-sm text-muted-foreground truncate">{npc.shortNote}</p>
                  )}
                  {(npc.relationshipTags ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2" data-testid={`card-npc-tags-${npc.id}`}>
                      {(npc.relationshipTags ?? []).slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight ${tagColor(tag)}`}
                          data-testid={`card-npc-tag-${npc.id}-${tag}`}
                        >
                          {tag}
                        </span>
                      ))}
                      {(npc.relationshipTags ?? []).length > 4 && (
                        <span className="inline-block rounded-full border border-muted px-2 py-0.5 text-[10px] font-medium leading-tight text-muted-foreground">
                          +{(npc.relationshipTags ?? []).length - 4}
                        </span>
                      )}
                    </div>
                  )}
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

function NpcCreateForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [shortNote, setShortNote] = useState("");
  const createMutation = useCreateNpc();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const onSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createMutation.mutate(
      { data: { name: trimmed, shortNote: shortNote.trim() || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNpcsQueryKey() });
          toast({ title: `Added "${trimmed}" to the roster` });
          onCreated();
        },
        onError: () => toast({ title: "Could not create NPC", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-4 max-w-xl" data-testid="npc-create-form">
      <Button variant="ghost" size="sm" onClick={onCancel} data-testid="button-cancel-create-npc">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </Button>
      <div className="rounded-2xl glass-panel p-5 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">New NPC</h2>
        <div className="space-y-2">
          <Label htmlFor="new-npc-name">Name</Label>
          <Input
            id="new-npc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Captain Garrick"
            data-testid="input-new-npc-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-npc-note">Short note (optional)</Label>
          <Textarea
            id="new-npc-note"
            value={shortNote}
            onChange={(e) => setShortNote(e.target.value)}
            placeholder="A few words about who they are…"
            data-testid="input-new-npc-note"
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={!name.trim() || createMutation.isPending}
            data-testid="button-save-new-npc"
          >
            Create
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} data-testid="button-cancel-new-npc">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function NpcDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { data: npcs, isLoading } = useListNpcs();
  const { data: membership } = useGetMyMembership();
  const isDm = membership?.role === "dm";
  const npc = (npcs as Npc[] | undefined)?.find((n) => n.id === id);

  const updateMutation = useUpdateNpc();
  const deleteMutation = useDeleteNpc();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [customTagInput, setCustomTagInput] = useState("");

  const saveRelationshipTags = (tags: string[]) => {
    updateMutation.mutate(
      { id, data: { relationshipTags: tags } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNpcsQueryKey() });
        },
        onError: () => toast({ title: "Could not update tags", variant: "destructive" }),
      },
    );
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || !npc) return;
    const current = npc.relationshipTags ?? [];
    if (current.includes(trimmed)) return;
    saveRelationshipTags([...current, trimmed]);
  };

  const removeTag = (tag: string) => {
    if (!npc) return;
    saveRelationshipTags((npc.relationshipTags ?? []).filter((t) => t !== tag));
  };

  const onDelete = () => {
    if (!npc) return;
    if (!confirm(`Remove "${npc.name}" from the roster?`)) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNpcsQueryKey() });
          toast({ title: "NPC removed" });
          onBack();
        },
        onError: () => toast({ title: "Could not delete NPC", variant: "destructive" }),
      },
    );
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 rounded-2xl" /></div>;
  }

  if (!npc) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-npcs">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <p className="text-muted-foreground">NPC not found.</p>
      </div>
    );
  }

  const tags = npc.relationshipTags ?? [];

  return (
    <div className="space-y-6" data-testid="npc-detail">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-npcs">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        {isDm && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-npc"
            className="ml-auto"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        )}
      </div>

      <div className="flex items-start gap-4">
        <NpcAvatarThumb url={npc.avatarUrl} name={npc.name} />
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold text-foreground tracking-tight" data-testid="text-npc-name">
            {npc.name}
          </h2>
          {npc.shortNote && (
            <p className="text-sm text-muted-foreground mt-1" data-testid="text-npc-note">{npc.shortNote}</p>
          )}

          <div className="mt-2 space-y-2" data-testid="npc-relationship-tags-section">
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="npc-relationship-tags-list">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tagColor(tag)}`}
                    data-testid={`npc-tag-chip-${tag}`}
                  >
                    {tag}
                    {isDm && (
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        disabled={updateMutation.isPending}
                        className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity disabled:pointer-events-none"
                        aria-label={`Remove tag ${tag}`}
                        data-testid={`button-remove-npc-tag-${tag}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {isDm && (
              <div>
                {tagEditorOpen ? (
                  <div className="space-y-2" data-testid="npc-tag-editor">
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_TAGS.filter((t) => !tags.includes(t.label)).map((t) => (
                        <button
                          key={t.label}
                          type="button"
                          onClick={() => addTag(t.label)}
                          disabled={updateMutation.isPending}
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none ${t.color}`}
                          data-testid={`button-preset-npc-tag-${t.label}`}
                        >
                          + {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 max-w-xs">
                      <Input
                        value={customTagInput}
                        onChange={(e) => setCustomTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && customTagInput.trim() && !updateMutation.isPending) {
                            addTag(customTagInput);
                            setCustomTagInput("");
                          }
                        }}
                        placeholder="Custom tag…"
                        className="h-7 text-xs"
                        maxLength={40}
                        disabled={updateMutation.isPending}
                        data-testid="input-custom-npc-tag"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2"
                        disabled={updateMutation.isPending || !customTagInput.trim()}
                        onClick={() => {
                          if (customTagInput.trim()) {
                            addTag(customTagInput);
                            setCustomTagInput("");
                          }
                        }}
                        data-testid="button-add-custom-npc-tag"
                      >
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2"
                        onClick={() => { setTagEditorOpen(false); setCustomTagInput(""); }}
                        data-testid="button-close-npc-tag-editor"
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setTagEditorOpen(true)}
                    className="text-xs text-primary hover:underline"
                    data-testid="button-open-npc-tag-editor"
                  >
                    {tags.length === 0 ? "Add relationship tags" : "Edit tags"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Plus,
  Users,
  ArrowLeft,
  Trash2,
  X,
  User,
  RefreshCw,
  Sparkles,
  Loader2,
  EyeOff,
  MessageSquare,
  Copy,
  ArrowUp,
  ArrowDown,
  Check,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@workspace/ui";
import { Input } from "@workspace/ui";
import { Textarea } from "@workspace/ui";
import { Label } from "@workspace/ui";
import { Skeleton } from "@workspace/ui";
import { useToast } from "@workspace/ui";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNpcs,
  useCreateNpc,
  useUpdateNpc,
  useDeleteNpc,
  useGetMyMembership,
  useListNpcArchetypes,
  usePrefillNpcFromArchetype,
  useGetNpc,
  useCreateNpcDialogueLine,
  useUpdateNpcDialogueLine,
  useDeleteNpcDialogueLine,
  getListNpcsQueryKey,
  getGetNpcQueryKey,
} from "@workspace/api-client-react";
import type {
  Npc,
  NpcWithDialogue,
  NpcDialogueLine,
  ArchetypeListItem,
  NpcArchetypePrefill,
} from "@workspace/api-client-react";

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
        onCreated={(id) => setView({ mode: "detail", id })}
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

function NpcAvatarThumb({ url, name, size = "md" }: {
  url: string | null | undefined;
  name: string;
  size?: "md" | "lg";
}) {
  const dim = size === "lg" ? "h-24 w-24" : "h-14 w-14";
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
        className={`${dim} rounded-xl object-cover shrink-0 border border-[rgba(255,255,255,0.08)] [image-rendering:auto]`}
        data-testid="img-npc-thumb"
      />
    );
  }
  return (
    <div
      className={`${dim} rounded-xl shrink-0 flex items-center justify-center bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]`}
      data-testid="img-npc-thumb-placeholder"
    >
      <User className={size === "lg" ? "h-10 w-10 text-muted-foreground" : "h-6 w-6 text-muted-foreground"} />
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
          {npcs.map((npc) => (
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
                  {npc.occupation && (
                    <p className="text-xs text-muted-foreground/80 truncate italic">
                      {npc.occupation}
                    </p>
                  )}
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

// ─── Create form ─────────────────────────────────────────────────────

interface DraftDialogueLine {
  topic: string;
  line: string;
  dmOnly: boolean;
  orderIndex: number;
}

interface NpcDraft {
  archetypeKey: string | null;
  name: string;
  occupation: string;
  suggestedClass: string;
  shortNote: string;
  backstoryMd: string;
  publicMotive: string;
  secretMotive: string;
  avatarUrl: string | null;
  dialogueLines: DraftDialogueLine[];
}

const EMPTY_DRAFT: NpcDraft = {
  archetypeKey: null,
  name: "",
  occupation: "",
  suggestedClass: "",
  shortNote: "",
  backstoryMd: "",
  publicMotive: "",
  secretMotive: "",
  avatarUrl: null,
  dialogueLines: [],
};

// Per-field "↻" button. Disabled when no archetype is chosen.
function RerollButton({
  onClick,
  busy,
  disabled,
  label,
}: {
  onClick: () => void;
  busy: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[rgba(255,255,255,0.08)] text-muted-foreground hover:text-foreground hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      data-testid={`button-reroll-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
    </button>
  );
}

// Sentinel value for the explicit "Custom" picker option. Picking this
// clears any prefilled archetype data so the DM can fill the form by
// hand without an archetype attached.
const CUSTOM_PICKER_VALUE = "__custom__";

function ArchetypePicker({
  archetypes,
  value,
  onChange,
}: {
  archetypes: ArchetypeListItem[] | undefined;
  value: string | null;
  onChange: (key: string) => void;
}) {
  const grouped = useMemo(() => {
    const out: Record<string, ArchetypeListItem[]> = {};
    for (const a of archetypes ?? []) {
      (out[a.category] ??= []).push(a);
    }
    return out;
  }, [archetypes]);

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.08)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      data-testid="select-archetype"
    >
      <option value="">— Pick an archetype —</option>
      <option value={CUSTOM_PICKER_VALUE}>Custom (fill in by hand)</option>
      {Object.entries(grouped).map(([cat, items]) => (
        <optgroup key={cat} label={cat}>
          {items.map((a) => (
            <option key={a.key} value={a.key}>
              {a.displayName}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function NpcCreateForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: number) => void }) {
  const { data: archetypes } = useListNpcArchetypes();
  const createMutation = useCreateNpc();
  const prefillMutation = usePrefillNpcFromArchetype();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [draft, setDraft] = useState<NpcDraft>(EMPTY_DRAFT);
  // True when the DM has explicitly chosen the "Custom" picker option —
  // distinguished from the initial unselected state so the helper text
  // and reroll-disabled UI stay sensible.
  const [customMode, setCustomMode] = useState(false);
  // Field that is currently rerolling — used to show a spinner on the
  // matching button while the request is in flight.
  const [rerollingField, setRerollingField] = useState<string | null>(null);
  // Full-prefill state is separate so the big "Roll archetype" button
  // shows its own spinner without flickering all the small ones.
  const [fullRolling, setFullRolling] = useState(false);

  // Apply a (partial) prefill payload onto the current draft.
  // Only fields the server actually returned are overwritten.
  const applyPrefill = (
    archetypeKey: string,
    payload: NpcArchetypePrefill,
  ): void => {
    setDraft((d) => {
      const next: NpcDraft = { ...d, archetypeKey };
      if (payload.name != null) next.name = payload.name;
      if (payload.occupation != null) next.occupation = payload.occupation;
      if (payload.suggestedClass != null) next.suggestedClass = payload.suggestedClass;
      if (payload.backstoryMd != null) next.backstoryMd = payload.backstoryMd;
      if (payload.publicMotive != null) next.publicMotive = payload.publicMotive;
      if (payload.secretMotive != null) next.secretMotive = payload.secretMotive;
      if (payload.avatarUrl !== undefined) next.avatarUrl = payload.avatarUrl ?? null;
      if (payload.dialogueLines) {
        next.dialogueLines = payload.dialogueLines.map((d, i) => ({
          topic: d.topic,
          line: d.line,
          dmOnly: d.dmOnly,
          orderIndex: typeof d.orderIndex === "number" ? d.orderIndex : i,
        }));
      }
      return next;
    });
  };

  const onPickArchetype = async (key: string) => {
    if (!key) return;
    if (key === CUSTOM_PICKER_VALUE) {
      // Explicit custom path: clear archetype binding without rolling
      // anything. Keep whatever the DM has already typed in the form.
      setCustomMode(true);
      setDraft((d) => ({ ...d, archetypeKey: null }));
      return;
    }
    setCustomMode(false);
    setFullRolling(true);
    try {
      const payload = await prefillMutation.mutateAsync({ data: { archetypeKey: key } });
      applyPrefill(key, payload);
    } catch {
      toast({ title: "Could not roll archetype", variant: "destructive" });
    } finally {
      setFullRolling(false);
    }
  };

  const onReroll = async (field: string) => {
    if (!draft.archetypeKey) return;
    setRerollingField(field);
    try {
      const payload = await prefillMutation.mutateAsync({
        data: {
          archetypeKey: draft.archetypeKey,
          only: [field],
          // Send the current name so backend templates substitute it
          // when re-rolling backstory / motives. Without this the
          // re-rolled text would mention a freshly rolled random name.
          ...(draft.name.trim() ? { currentName: draft.name.trim() } : {}),
        },
      });
      applyPrefill(draft.archetypeKey, payload);
    } catch {
      toast({ title: "Could not re-roll", variant: "destructive" });
    } finally {
      setRerollingField(null);
    }
  };

  const onSubmit = () => {
    const trimmedName = draft.name.trim();
    if (!trimmedName) return;
    createMutation.mutate(
      {
        data: {
          name: trimmedName,
          shortNote: draft.shortNote.trim() || null,
          avatarUrl: draft.avatarUrl,
          archetypeKey: draft.archetypeKey,
          occupation: draft.occupation.trim() || null,
          suggestedClass: draft.suggestedClass.trim() || null,
          backstoryMd: draft.backstoryMd.trim() || null,
          publicMotive: draft.publicMotive.trim() || null,
          secretMotive: draft.secretMotive.trim() || null,
          ...(draft.dialogueLines.length > 0
            ? { dialogueLines: draft.dialogueLines }
            : {}),
        },
      },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getListNpcsQueryKey() });
          toast({ title: `Added "${trimmedName}" to the roster` });
          onCreated(created.id);
        },
        onError: () => toast({ title: "Could not create NPC", variant: "destructive" }),
      },
    );
  };

  const archetypeChosen = !!draft.archetypeKey;

  return (
    <div className="space-y-4 max-w-3xl" data-testid="npc-create-form">
      <Button variant="ghost" size="sm" onClick={onCancel} data-testid="button-cancel-create-npc">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </Button>

      <div className="rounded-2xl glass-panel p-5 space-y-5">
        <h2 className="text-xl font-semibold text-foreground">New NPC</h2>

        {/* Archetype picker */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Archetype
          </Label>
          <div className="flex gap-2 items-stretch">
            <div className="flex-1">
              <ArchetypePicker
                archetypes={archetypes}
                value={customMode ? CUSTOM_PICKER_VALUE : draft.archetypeKey}
                onChange={(k) => onPickArchetype(k)}
              />
            </div>
            {archetypeChosen && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onPickArchetype(draft.archetypeKey!)}
                disabled={fullRolling}
                title="Re-roll the entire archetype"
                data-testid="button-reroll-archetype"
              >
                {fullRolling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-1 hidden sm:inline">Re-roll all</span>
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {archetypeChosen
              ? "Edit any field below, or use the ↻ button to re-roll just that field."
              : customMode
                ? "Custom mode — fill in any fields you like and save."
                : "Pick an archetype to auto-fill, or choose Custom to fill in by hand."}
          </p>
        </div>

        {/* Portrait */}
        <div className="flex gap-4 items-start">
          <div className="relative">
            <NpcAvatarThumb url={draft.avatarUrl} name={draft.name || "New NPC"} size="lg" />
            {fullRolling && (
              <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-foreground" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <Label className="text-xs text-muted-foreground">Portrait</Label>
            <RerollButton
              onClick={() => onReroll("portrait")}
              busy={rerollingField === "portrait"}
              disabled={!archetypeChosen}
              label="Re-roll portrait"
            />
            <p className="text-[11px] text-muted-foreground max-w-[12rem]">
              Generated in pixel-art style. Re-rolling costs an image API call.
            </p>
          </div>
        </div>

        {/* Name + Occupation + Class */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="new-npc-name">Name</Label>
              <RerollButton
                onClick={() => onReroll("name")}
                busy={rerollingField === "name"}
                disabled={!archetypeChosen}
                label="Re-roll name"
              />
            </div>
            <Input
              id="new-npc-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Captain Garrick"
              data-testid="input-new-npc-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-npc-occupation">Occupation</Label>
            <Input
              id="new-npc-occupation"
              value={draft.occupation}
              onChange={(e) => setDraft({ ...draft, occupation: e.target.value })}
              placeholder="Innkeeper"
              data-testid="input-new-npc-occupation"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-npc-class">Suggested class / stat block</Label>
          <Input
            id="new-npc-class"
            value={draft.suggestedClass}
            onChange={(e) => setDraft({ ...draft, suggestedClass: e.target.value })}
            placeholder="Veteran (CR 3)"
            data-testid="input-new-npc-class"
          />
        </div>

        {/* Short note */}
        <div className="space-y-2">
          <Label htmlFor="new-npc-note">Short note</Label>
          <Input
            id="new-npc-note"
            value={draft.shortNote}
            onChange={(e) => setDraft({ ...draft, shortNote: e.target.value })}
            placeholder="One line for the roster card."
            data-testid="input-new-npc-note"
          />
        </div>

        {/* Backstory */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="new-npc-backstory">Backstory</Label>
            <RerollButton
              onClick={() => onReroll("backstory")}
              busy={rerollingField === "backstory"}
              disabled={!archetypeChosen}
              label="Re-roll backstory"
            />
          </div>
          <Textarea
            id="new-npc-backstory"
            value={draft.backstoryMd}
            onChange={(e) => setDraft({ ...draft, backstoryMd: e.target.value })}
            rows={3}
            placeholder="Where they came from, why they're here."
            data-testid="input-new-npc-backstory"
          />
        </div>

        {/* Public motive */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="new-npc-public-motive">Public motive</Label>
            <RerollButton
              onClick={() => onReroll("publicMotive")}
              busy={rerollingField === "publicMotive"}
              disabled={!archetypeChosen}
              label="Re-roll public motive"
            />
          </div>
          <Textarea
            id="new-npc-public-motive"
            value={draft.publicMotive}
            onChange={(e) => setDraft({ ...draft, publicMotive: e.target.value })}
            rows={2}
            placeholder="What they openly say they want."
            data-testid="input-new-npc-public-motive"
          />
        </div>

        {/* Secret motive (DM-only) */}
        <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="new-npc-secret-motive" className="flex items-center gap-1.5 text-amber-300">
              <EyeOff className="h-3.5 w-3.5" />
              Secret motive <span className="text-[10px] font-normal opacity-70">(DM-only)</span>
            </Label>
            <RerollButton
              onClick={() => onReroll("secretMotive")}
              busy={rerollingField === "secretMotive"}
              disabled={!archetypeChosen}
              label="Re-roll secret motive"
            />
          </div>
          <Textarea
            id="new-npc-secret-motive"
            value={draft.secretMotive}
            onChange={(e) => setDraft({ ...draft, secretMotive: e.target.value })}
            rows={2}
            placeholder="What they actually want. Players will never see this."
            data-testid="input-new-npc-secret-motive"
          />
        </div>

        {/* Starter dialogue preview */}
        {draft.dialogueLines.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-primary" />
                Starter dialogue ({draft.dialogueLines.length} lines)
              </Label>
              <RerollButton
                onClick={() => onReroll("dialogueLines")}
                busy={rerollingField === "dialogueLines"}
                disabled={!archetypeChosen}
                label="Re-roll dialogue"
              />
            </div>
            <DialoguePreview lines={draft.dialogueLines} />
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={!draft.name.trim() || createMutation.isPending}
            data-testid="button-save-new-npc"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Creating…
              </>
            ) : (
              "Create"
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} data-testid="button-cancel-new-npc">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function DialoguePreview({ lines }: { lines: DraftDialogueLine[] }) {
  // Group into topics for display.
  const grouped = useMemo(() => {
    const out: Array<{ topic: string; lines: DraftDialogueLine[] }> = [];
    for (const l of lines) {
      const last = out[out.length - 1];
      if (last && last.topic === l.topic) {
        last.lines.push(l);
      } else {
        out.push({ topic: l.topic, lines: [l] });
      }
    }
    return out;
  }, [lines]);

  return (
    <div className="space-y-2 rounded-md border border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.2)] p-3 text-sm max-h-72 overflow-y-auto">
      {grouped.map((g) => (
        <div key={g.topic} className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {g.topic}
            {g.lines.some((l) => l.dmOnly) && (
              <span className="ml-1.5 text-[9px] text-amber-300/80">DM</span>
            )}
          </p>
          <ul className="space-y-1 pl-3 border-l border-[rgba(255,255,255,0.05)]">
            {g.lines.map((l, i) => (
              <li key={i} className={l.dmOnly ? "text-amber-200/80" : "text-foreground/90"}>
                "{l.line}"
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── Detail view ─────────────────────────────────────────────────────

function NpcDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { data: npc, isLoading } = useGetNpc(id);
  const { data: membership } = useGetMyMembership();
  const isDm = membership?.role === "dm";

  const updateMutation = useUpdateNpc();
  const deleteMutation = useDeleteNpc();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [customTagInput, setCustomTagInput] = useState("");

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListNpcsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetNpcQueryKey(id) });
  };

  const saveRelationshipTags = (tags: string[]) => {
    updateMutation.mutate(
      { id, data: { relationshipTags: tags } },
      {
        onSuccess: () => invalidateAll(),
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
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-npcs">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (!npc) {
    // Loaded but missing → 404 / wrong campaign / server error. Show a
    // real not-found state instead of a perpetual skeleton.
    return (
      <div className="space-y-4" data-testid="npc-detail-not-found">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-npcs">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <p className="text-muted-foreground">NPC not found.</p>
      </div>
    );
  }

  const npcDetail = npc;
  const tags = npcDetail.relationshipTags ?? [];

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
        <NpcAvatarThumb url={npcDetail.avatarUrl} name={npcDetail.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold text-foreground tracking-tight" data-testid="text-npc-name">
            {npcDetail.name}
          </h2>
          {npcDetail.occupation && (
            <p className="text-sm text-primary/80 italic" data-testid="text-npc-occupation">
              {npcDetail.occupation}
              {npcDetail.suggestedClass && (
                <span className="text-muted-foreground/70 not-italic"> · {npcDetail.suggestedClass}</span>
              )}
            </p>
          )}
          {npcDetail.shortNote && (
            <p className="text-sm text-muted-foreground mt-1" data-testid="text-npc-note">{npcDetail.shortNote}</p>
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

      {/* Backstory */}
      {npcDetail.backstoryMd && (
        <section className="space-y-2" data-testid="section-npc-backstory">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Backstory</h3>
          <div className="rounded-2xl glass-panel p-4 whitespace-pre-line text-sm text-foreground/90">
            {npcDetail.backstoryMd}
          </div>
        </section>
      )}

      {/* Public motive */}
      {npcDetail.publicMotive && (
        <section className="space-y-2" data-testid="section-npc-public-motive">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Public motive</h3>
          <div className="rounded-2xl glass-panel p-4 text-sm text-foreground/90">
            {npcDetail.publicMotive}
          </div>
        </section>
      )}

      {/* Secret motive — DM only. The server already filters this out
          for non-DMs (returns null), but we double-check on the client
          to avoid flashing it during a slow role refetch. */}
      {isDm && npcDetail.secretMotive && (
        <section className="space-y-2" data-testid="section-npc-secret-motive">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-300/90 flex items-center gap-1.5">
            <EyeOff className="h-3.5 w-3.5" />
            Secret motive <span className="text-[10px] font-normal opacity-70">(DM-only)</span>
          </h3>
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-foreground/90">
            {npcDetail.secretMotive}
          </div>
        </section>
      )}

      {/* Dialogue */}
      <DialogueSection
        npcId={npcDetail.id}
        lines={npcDetail.dialogueLines}
        isDm={isDm}
      />
    </div>
  );
}

// ─── Dialogue section ────────────────────────────────────────────────

function DialogueSection({
  npcId,
  lines,
  isDm,
}: {
  npcId: number;
  lines: NpcDialogueLine[];
  isDm: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateNpcDialogueLine();
  const updateMutation = useUpdateNpcDialogueLine();
  const deleteMutation = useDeleteNpcDialogueLine();

  const [adderOpen, setAdderOpen] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [newLine, setNewLine] = useState("");
  const [newDmOnly, setNewDmOnly] = useState(false);

  const invalidateNpc = () => {
    queryClient.invalidateQueries({ queryKey: getGetNpcQueryKey(npcId) });
  };

  const grouped = useMemo(() => {
    const out: Array<{ topic: string; lines: NpcDialogueLine[] }> = [];
    const sorted = [...lines].sort(
      (a, b) => a.orderIndex - b.orderIndex || a.id - b.id,
    );
    // Stable group-by topic preserving the order they first appear.
    for (const l of sorted) {
      const last = out[out.length - 1];
      if (last && last.topic === l.topic) last.lines.push(l);
      else out.push({ topic: l.topic, lines: [l] });
    }
    return out;
  }, [lines]);

  const onAddLine = () => {
    const t = newTopic.trim();
    const l = newLine.trim();
    if (!t || !l) return;
    const nextOrder = lines.length === 0 ? 0 : Math.max(...lines.map((x) => x.orderIndex)) + 1;
    createMutation.mutate(
      { id: npcId, data: { topic: t, line: l, dmOnly: newDmOnly, orderIndex: nextOrder } },
      {
        onSuccess: () => {
          invalidateNpc();
          setNewLine("");
          setAdderOpen(false);
          toast({ title: "Dialogue line added" });
        },
        onError: () => toast({ title: "Could not add line", variant: "destructive" }),
      },
    );
  };

  const onDeleteLine = (lineId: number) => {
    if (!confirm("Delete this dialogue line?")) return;
    deleteMutation.mutate(
      { id: npcId, lineId },
      {
        onSuccess: () => invalidateNpc(),
        onError: () => toast({ title: "Could not delete line", variant: "destructive" }),
      },
    );
  };

  // Move a line up or down within the full sorted list. We use the
  // current sort order, swap orderIndex with the neighbor, and persist
  // both updates back-to-back. The list is small (a handful of lines)
  // so the two-PATCH cost is fine.
  const onMoveLine = async (lineId: number, dir: "up" | "down") => {
    const sorted = [...lines].sort(
      (a, b) => a.orderIndex - b.orderIndex || a.id - b.id,
    );
    const idx = sorted.findIndex((l) => l.id === lineId);
    if (idx === -1) return;
    const swapWith = dir === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapWith];
    try {
      await Promise.all([
        updateMutation.mutateAsync({
          id: npcId,
          lineId: a.id,
          data: { orderIndex: b.orderIndex },
        }),
        updateMutation.mutateAsync({
          id: npcId,
          lineId: b.id,
          data: { orderIndex: a.orderIndex },
        }),
      ]);
      invalidateNpc();
    } catch {
      toast({ title: "Could not reorder line", variant: "destructive" });
    }
  };

  if (lines.length === 0 && !isDm) {
    // Players see nothing if there's nothing to show.
    return null;
  }

  return (
    <section className="space-y-2" data-testid="section-npc-dialogue">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-primary" />
          Dialogue
        </h3>
        {isDm && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAdderOpen((v) => !v)}
            data-testid="button-toggle-add-dialogue"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add line
          </Button>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No dialogue lines yet — add some so the NPC has things to say at the table.
        </p>
      ) : (
        <div className="space-y-3 rounded-2xl glass-panel p-4">
          {grouped.map((g) => (
            <div key={g.topic} className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {g.topic}
                {g.lines.some((l) => l.dmOnly) && isDm && (
                  <span className="ml-1.5 text-[9px] text-amber-300/80">DM</span>
                )}
              </p>
              <ul className="space-y-1 pl-3 border-l border-[rgba(255,255,255,0.05)]">
                {g.lines.map((l) => {
                  // Position within the full sorted list (not the
                  // grouped subset) determines whether ↑/↓ are enabled.
                  const sorted = [...lines].sort(
                    (a, b) => a.orderIndex - b.orderIndex || a.id - b.id,
                  );
                  const fullIdx = sorted.findIndex((s) => s.id === l.id);
                  return (
                    <DialogueLineRow
                      key={l.id}
                      line={l}
                      isDm={isDm}
                      canMoveUp={fullIdx > 0}
                      canMoveDown={fullIdx >= 0 && fullIdx < sorted.length - 1}
                      onMove={(dir) => onMoveLine(l.id, dir)}
                      onDelete={() => onDeleteLine(l.id)}
                      onSave={(patch) => {
                        updateMutation.mutate(
                          { id: npcId, lineId: l.id, data: patch },
                          {
                            onSuccess: () => invalidateNpc(),
                            onError: () =>
                              toast({ title: "Could not save line", variant: "destructive" }),
                          },
                        );
                      }}
                    />
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {isDm && adderOpen && (
        <div className="rounded-2xl glass-panel p-4 space-y-3" data-testid="dialogue-line-adder">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="Topic (e.g. Greeting)"
              data-testid="input-new-dialogue-topic"
            />
            <Input
              className="md:col-span-2"
              value={newLine}
              onChange={(e) => setNewLine(e.target.value)}
              placeholder="What the NPC says…"
              data-testid="input-new-dialogue-line"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={newDmOnly}
              onChange={(e) => setNewDmOnly(e.target.checked)}
              data-testid="checkbox-new-dialogue-dm-only"
            />
            DM-only (players will not see this line)
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onAddLine}
              disabled={!newTopic.trim() || !newLine.trim() || createMutation.isPending}
              data-testid="button-save-new-dialogue"
            >
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdderOpen(false);
                setNewLine("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function DialogueLineRow({
  line,
  isDm,
  canMoveUp,
  canMoveDown,
  onMove,
  onDelete,
  onSave,
}: {
  line: NpcDialogueLine;
  isDm: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: "up" | "down") => void;
  onDelete: () => void;
  onSave: (patch: { line?: string; dmOnly?: boolean }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState(line.line);
  useEffect(() => {
    setDraft(line.line);
  }, [line.line]);

  // Copy the bare quoted line to the clipboard so the DM can paste it
  // straight into chat. Falls back to a textarea trick on insecure
  // contexts where navigator.clipboard is undefined.
  const onCopy = async () => {
    const text = line.line;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Silent — copying is a convenience, not a critical path.
    }
  };

  if (editing && isDm) {
    return (
      <li className="flex items-center gap-2" data-testid={`dialogue-line-edit-${line.id}`}>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-8 text-sm"
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          onClick={() => {
            const trimmed = draft.trim();
            if (!trimmed) return;
            onSave({ line: trimmed });
            setEditing(false);
          }}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          onClick={() => {
            setDraft(line.line);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </li>
    );
  }

  return (
    <li
      className={`group flex items-start gap-2 ${line.dmOnly ? "text-amber-200/80" : "text-foreground/90"}`}
      data-testid={`dialogue-line-${line.id}`}
    >
      <span className="flex-1 text-sm">"{line.line}"</span>
      {/* Copy is available to everyone (players too) — they often
          want to paste a memorable NPC quote into chat as well. */}
      <button
        type="button"
        onClick={onCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center h-6 w-6 rounded border border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.05)] text-muted-foreground"
        title="Copy line"
        aria-label="Copy line"
        data-testid={`button-copy-line-${line.id}`}
      >
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
      {isDm && (
        <span className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={!canMoveUp}
            className="inline-flex items-center justify-center h-6 w-6 rounded border border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-30 disabled:pointer-events-none text-muted-foreground"
            title="Move up"
            aria-label="Move up"
            data-testid={`button-move-up-line-${line.id}`}
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={!canMoveDown}
            className="inline-flex items-center justify-center h-6 w-6 rounded border border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-30 disabled:pointer-events-none text-muted-foreground"
            title="Move down"
            aria-label="Move down"
            data-testid={`button-move-down-line-${line.id}`}
          >
            <ArrowDown className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onSave({ dmOnly: !line.dmOnly })}
            className="text-[10px] px-1.5 py-0.5 rounded border border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.05)]"
            title="Toggle DM-only"
          >
            {line.dmOnly ? "Make public" : "Mark DM-only"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.05)]"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/20 text-red-300 hover:bg-red-500/10"
          >
            Delete
          </button>
        </span>
      )}
    </li>
  );
}

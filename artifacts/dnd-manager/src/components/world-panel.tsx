import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Plus, Eye, EyeOff, Trash2, Pencil, ChevronLeft, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useListEntities,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
  useRevealEntity,
  useUnrevealEntity,
  useGetEntityAudit,
  useGetMyMembership,
} from "@workspace/api-client-react";
import type { CampaignEntity, EntityKind, EntityAuditEntry } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const KIND_LABELS: Record<EntityKind, string> = {
  npc: "NPCs",
  quest: "Quests",
  location: "Locations",
  story_beat: "Story Beats",
  mob_encounter: "Mob Encounters",
  plot_twist: "Plot Twists",
  faction: "Factions",
  item_unique: "Unique Items",
};

const KIND_SINGULAR: Record<EntityKind, string> = {
  npc: "NPC",
  quest: "Quest",
  location: "Location",
  story_beat: "Story Beat",
  mob_encounter: "Mob Encounter",
  plot_twist: "Plot Twist",
  faction: "Faction",
  item_unique: "Unique Item",
};

const KIND_ORDER: EntityKind[] = [
  "npc",
  "quest",
  "location",
  "faction",
  "story_beat",
  "mob_encounter",
  "plot_twist",
  "item_unique",
];

type View =
  | { mode: "list" }
  | { mode: "detail"; id: number }
  | { mode: "create"; kind: EntityKind }
  | { mode: "edit"; id: number };

export default function WorldPanel() {
  const { data: membership } = useGetMyMembership();
  const isDm = membership?.role === "dm";
  const [view, setView] = useState<View>({ mode: "list" });
  const [filterKind, setFilterKind] = useState<EntityKind | "all">("all");

  const { data, isLoading, refetch } = useListEntities(
    {},
    { query: { queryKey: ["/api/entities"] } },
  );
  const entities = (data ?? []) as CampaignEntity[];

  if (view.mode === "create") {
    return (
      <EntityForm
        mode="create"
        initialKind={view.kind}
        onCancel={() => setView({ mode: "list" })}
        onSaved={() => {
          refetch();
          setView({ mode: "list" });
        }}
      />
    );
  }

  if (view.mode === "edit") {
    const entity = entities.find((e) => e.id === view.id);
    if (!entity) {
      return (
        <div className="p-6 text-muted-foreground">
          Entity not found.{" "}
          <Button variant="link" onClick={() => setView({ mode: "list" })}>
            Back
          </Button>
        </div>
      );
    }
    return (
      <EntityForm
        mode="edit"
        entity={entity}
        onCancel={() => setView({ mode: "detail", id: view.id })}
        onSaved={() => {
          refetch();
          setView({ mode: "detail", id: view.id });
        }}
      />
    );
  }

  if (view.mode === "detail") {
    return (
      <EntityDetail
        id={view.id}
        isDm={!!isDm}
        onBack={() => setView({ mode: "list" })}
        onEdit={() => setView({ mode: "edit", id: view.id })}
        onChanged={() => refetch()}
      />
    );
  }

  const filtered = filterKind === "all" ? entities : entities.filter((e) => e.kind === filterKind);
  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: filtered.filter((e) => e.kind === kind),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6" data-testid="world-panel">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2 tracking-tight">
            <Globe className="h-6 w-6 text-primary" />
            {isDm ? "World" : "Lore"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isDm
              ? "Author NPCs, quests, locations and lore. Reveal entries to your players when they discover them."
              : "Discovered NPCs, quests, locations, and lore from your campaign."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterKind} onValueChange={(v) => setFilterKind(v as EntityKind | "all")}>
            <SelectTrigger className="w-[180px]" data-testid="select-kind-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              {KIND_ORDER.map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isDm && (
            <CreateMenu onPick={(kind) => setView({ mode: "create", kind })} />
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[rgba(255,255,255,0.08)] p-10 text-center">
          <Globe className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {isDm
              ? "No entities yet. Create your first one above."
              : "No lore has been revealed yet. Check back after your next session!"}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ kind, items }) => (
            <section key={kind} data-testid={`group-${kind}`}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                {KIND_LABELS[kind]}
                <span className="ml-2 text-xs text-muted-foreground/70">{items.length}</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map((e) => (
                  <EntityCard
                    key={e.id}
                    entity={e}
                    isDm={!!isDm}
                    onOpen={() => setView({ mode: "detail", id: e.id })}
                    onChanged={() => refetch()}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateMenu({ onPick }: { onPick: (kind: EntityKind) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button onClick={() => setOpen((v) => !v)} size="sm" data-testid="button-new-entity">
        <Plus className="h-4 w-4 mr-1" />
        New
      </Button>
      {open && (
        <div className="absolute right-0 mt-2 z-20 w-56 rounded-xl glass-panel py-1 shadow-xl">
          {KIND_ORDER.map((k) => (
            <button
              key={k}
              onClick={() => {
                onPick(k);
                setOpen(false);
              }}
              data-testid={`button-new-${k}`}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-[rgba(255,255,255,0.06)]"
            >
              {KIND_SINGULAR[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EntityCard({
  entity,
  isDm,
  onOpen,
  onChanged,
}: {
  entity: CampaignEntity;
  isDm: boolean;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const reveal = useRevealEntity();
  const unreveal = useUnrevealEntity();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const busy = reveal.isPending || unreveal.isPending;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const action = entity.revealed ? unreveal : reveal;
    const willReveal = !entity.revealed;
    const queryKey = ["/api/entities"];
    const previous = queryClient.getQueryData<CampaignEntity[]>(queryKey);
    queryClient.setQueryData<CampaignEntity[]>(queryKey, (old) =>
      (old ?? []).map((it) =>
        it.id === entity.id ? { ...it, revealed: willReveal } : it,
      ),
    );
    action.mutate(
      { id: entity.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey });
          toast({ title: willReveal ? "Revealed to players" : "Hidden from players" });
          onChanged();
        },
        onError: (err: unknown) => {
          if (previous) queryClient.setQueryData(queryKey, previous);
          toast({ title: "Failed", description: (err as Error).message, variant: "destructive" });
        },
      },
    );
  };

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      data-testid={`card-entity-${entity.id}`}
      className="text-left rounded-2xl glass-panel-hover p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-foreground truncate">{entity.name}</h4>
          {entity.publicMd && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{entity.publicMd}</p>
          )}
        </div>
        {isDm && (
          <button
            type="button"
            onClick={handleToggle}
            disabled={busy}
            data-testid={`button-toggle-reveal-${entity.id}`}
            title={entity.revealed ? "Hide from players" : "Reveal to players"}
            className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium border transition-colors ${
              entity.revealed
                ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20"
                : "border-[rgba(255,255,255,0.1)] text-muted-foreground bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)]"
            }`}
          >
            {entity.revealed ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {entity.revealed ? "Revealed" : "Hidden"}
          </button>
        )}
      </div>
    </motion.button>
  );
}

function EntityDetail({
  id,
  isDm,
  onBack,
  onEdit,
  onChanged,
}: {
  id: number;
  isDm: boolean;
  onBack: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const { data, isLoading, refetch } = useListEntities(
    {},
    { query: { queryKey: ["/api/entities"] } },
  );
  const entity = ((data ?? []) as CampaignEntity[]).find((e) => e.id === id);
  const reveal = useRevealEntity();
  const unreveal = useUnrevealEntity();
  const del = useDeleteEntity();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAudit, setShowAudit] = useState(false);

  if (isLoading) return <Skeleton className="h-72 rounded-2xl" />;
  if (!entity) {
    return (
      <div className="p-6 text-muted-foreground">
        Entity not found.{" "}
        <Button variant="link" onClick={onBack}>
          Back
        </Button>
      </div>
    );
  }

  const handleToggle = () => {
    const action = entity.revealed ? unreveal : reveal;
    action.mutate(
      { id: entity.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
          refetch();
          onChanged();
          toast({ title: entity.revealed ? "Hidden from players" : "Revealed to players" });
        },
      },
    );
  };

  const handleDelete = () => {
    if (!confirm(`Delete "${entity.name}"? This cannot be undone.`)) return;
    del.mutate(
      { id: entity.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
          onChanged();
          toast({ title: "Deleted" });
          onBack();
        },
      },
    );
  };

  const dataKeys = Object.keys(entity.data ?? {}).filter(
    (k) => entity.data[k] !== undefined && entity.data[k] !== null && entity.data[k] !== "",
  );

  return (
    <div className="space-y-6 max-w-3xl" data-testid={`entity-detail-${entity.id}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        {isDm && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggle}
              data-testid="button-toggle-reveal"
            >
              {entity.revealed ? (
                <>
                  <EyeOff className="h-4 w-4 mr-1" />
                  Hide from players
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-1" />
                  Reveal to players
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit} data-testid="button-edit">
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAudit((v) => !v)} data-testid="button-audit">
              <History className="h-4 w-4 mr-1" />
              {showAudit ? "Hide" : "Audit"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDelete} data-testid="button-delete" className="text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-2xl glass-panel p-6 space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-2xl font-semibold text-foreground">{entity.name}</h2>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{KIND_SINGULAR[entity.kind]}</span>
        </div>
        {isDm && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium border ${
              entity.revealed
                ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                : "border-[rgba(255,255,255,0.1)] text-muted-foreground bg-[rgba(255,255,255,0.04)]"
            }`}
          >
            {entity.revealed ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {entity.revealed ? "Revealed to players" : "Hidden from players"}
          </span>
        )}

        {dataKeys.length > 0 && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
            {dataKeys.map((key) => (
              <div key={key} className="text-sm">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                </dt>
                <dd className="text-foreground">{String(entity.data[key])}</dd>
              </div>
            ))}
          </dl>
        )}

        {entity.publicMd && (
          <div className="pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              {isDm ? "Player-visible description" : "Description"}
            </h3>
            <p className="text-sm text-foreground/90 whitespace-pre-wrap" data-testid="text-public-md">
              {entity.publicMd}
            </p>
          </div>
        )}

        {isDm && (
          <>
            {entity.dmNotes && (
              <SecretBlock label="DM Notes" value={entity.dmNotes} testId="text-dm-notes" />
            )}
            {entity.secretMd && (
              <SecretBlock label="Secret Lore" value={entity.secretMd} testId="text-secret-md" />
            )}
            {entity.trueMotivation && (
              <SecretBlock
                label="True Motivation"
                value={entity.trueMotivation}
                testId="text-true-motivation"
              />
            )}
          </>
        )}
      </div>

      {isDm && showAudit && <AuditTimeline entityId={entity.id} />}
    </div>
  );
}

function SecretBlock({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="pt-2 border-t border-[rgba(255,255,255,0.06)] rounded-lg bg-amber-500/5 p-3 -mx-1">
      <h3 className="text-xs uppercase tracking-wide text-amber-300/80 mb-1 flex items-center gap-1">
        <EyeOff className="h-3 w-3" />
        {label} <span className="text-amber-300/40">(DM only)</span>
      </h3>
      <p className="text-sm text-foreground/90 whitespace-pre-wrap" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

function AuditTimeline({ entityId }: { entityId: number }) {
  const { data, isLoading } = useGetEntityAudit(entityId, {
    query: { queryKey: ["/api/entities", entityId, "audit"] },
  });
  const entries = (data ?? []) as EntityAuditEntry[];

  if (isLoading) return <Skeleton className="h-32 rounded-2xl" />;

  return (
    <div className="rounded-2xl glass-panel p-5" data-testid="audit-timeline">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
        <History className="h-4 w-4" />
        Audit Trail
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No actions logged yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="text-sm flex items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.04)] pb-2 last:border-b-0"
              data-testid={`audit-entry-${e.id}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  {e.action}
                </span>
                <span className="text-foreground/80 text-xs">{e.actor}</span>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {new Date(e.at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Form ----------

interface EntityFormProps {
  mode: "create" | "edit";
  initialKind?: EntityKind;
  entity?: CampaignEntity;
  onCancel: () => void;
  onSaved: () => void;
}

const DATA_FIELDS: Record<EntityKind, Array<{ key: string; label: string; type: "text" | "select"; options?: string[]; required?: boolean }>> = {
  npc: [
    { key: "race", label: "Race", type: "text" },
    { key: "occupation", label: "Occupation", type: "text" },
    { key: "location", label: "Location", type: "text" },
    { key: "faction", label: "Faction", type: "text" },
    { key: "disposition", label: "Disposition", type: "select", options: ["friendly", "neutral", "hostile", "unknown"] },
  ],
  quest: [
    { key: "status", label: "Status", type: "select", options: ["hook", "active", "completed", "failed"], required: true },
    { key: "giver", label: "Quest Giver", type: "text" },
    { key: "reward", label: "Reward", type: "text" },
  ],
  location: [
    { key: "region", label: "Region", type: "text" },
    { key: "size", label: "Size", type: "select", options: ["hamlet", "village", "town", "city", "metropolis", "wilderness", "other"] },
  ],
  story_beat: [
    { key: "act", label: "Act #", type: "text" },
    { key: "order", label: "Order", type: "text" },
  ],
  mob_encounter: [
    { key: "creatureType", label: "Creature Type", type: "text" },
    { key: "cr", label: "Challenge Rating", type: "text" },
    { key: "count", label: "Count", type: "text" },
  ],
  plot_twist: [
    { key: "triggeredBy", label: "Triggered By", type: "text" },
  ],
  faction: [
    { key: "alignment", label: "Alignment", type: "text" },
    { key: "leader", label: "Leader", type: "text" },
    { key: "headquarters", label: "Headquarters", type: "text" },
  ],
  item_unique: [
    { key: "rarity", label: "Rarity", type: "select", options: ["common", "uncommon", "rare", "very_rare", "legendary", "artifact"] },
    { key: "owner", label: "Current Owner", type: "text" },
  ],
};

const NUMERIC_KEYS = new Set(["act", "order", "count"]);

function EntityForm({ mode, initialKind, entity, onCancel, onSaved }: EntityFormProps) {
  const kind = (entity?.kind ?? initialKind ?? "npc") as EntityKind;
  const [name, setName] = useState(entity?.name ?? "");
  const [publicMd, setPublicMd] = useState(entity?.publicMd ?? "");
  const [dmNotes, setDmNotes] = useState(entity?.dmNotes ?? "");
  const [secretMd, setSecretMd] = useState(entity?.secretMd ?? "");
  const [trueMotivation, setTrueMotivation] = useState(entity?.trueMotivation ?? "");
  const initialData = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    const src = (entity?.data ?? {}) as Record<string, unknown>;
    for (const f of DATA_FIELDS[kind]) {
      out[f.key] = src[f.key] != null ? String(src[f.key]) : "";
    }
    return out;
  }, [entity, kind]);
  const [data, setData] = useState<Record<string, string>>(initialData);
  const [error, setError] = useState<string | null>(null);

  const create = useCreateEntity();
  const update = useUpdateEntity();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const saving = create.isPending || update.isPending;

  const handleSave = () => {
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }
    const payloadData: Record<string, unknown> = {};
    for (const f of DATA_FIELDS[kind]) {
      const v = data[f.key];
      if (v == null || v === "") continue;
      if (NUMERIC_KEYS.has(f.key)) {
        const n = parseInt(v, 10);
        if (Number.isNaN(n)) {
          setError(`${f.label} must be a number`);
          return;
        }
        payloadData[f.key] = n;
      } else {
        payloadData[f.key] = v;
      }
    }

    const onDone = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
      toast({ title: mode === "create" ? "Created" : "Saved" });
      onSaved();
    };
    const onError = (err: unknown) => {
      const msg = (err as Error)?.message ?? "Failed to save";
      setError(msg);
      toast({ title: "Failed", description: msg, variant: "destructive" });
    };

    if (mode === "create") {
      create.mutate(
        {
          data: {
            kind,
            name: trimmedName,
            publicMd: publicMd || null,
            dmNotes: dmNotes || null,
            secretMd: secretMd || null,
            trueMotivation: trueMotivation || null,
            data: payloadData,
          },
        },
        { onSuccess: onDone, onError },
      );
    } else if (entity) {
      update.mutate(
        {
          id: entity.id,
          data: {
            name: trimmedName,
            publicMd: publicMd || null,
            dmNotes: dmNotes || null,
            secretMd: secretMd || null,
            trueMotivation: trueMotivation || null,
            data: payloadData,
          },
        },
        { onSuccess: onDone, onError },
      );
    }
  };

  return (
    <div className="space-y-6 max-w-3xl" data-testid="entity-form">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Cancel
        </Button>
        <h2 className="text-lg font-semibold text-foreground">
          {mode === "create" ? `New ${KIND_SINGULAR[kind]}` : `Edit ${entity?.name}`}
        </h2>
      </div>

      <div className="rounded-2xl glass-panel p-5 space-y-4">
        <div>
          <Label htmlFor="entity-name">Name</Label>
          <Input
            id="entity-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Brogg the Innkeeper"
            data-testid="input-name"
          />
        </div>

        {DATA_FIELDS[kind].length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DATA_FIELDS[kind].map((f) => (
              <div key={f.key}>
                <Label>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
                {f.type === "select" ? (
                  <Select
                    value={data[f.key] || ""}
                    onValueChange={(v) => setData((d) => ({ ...d, [f.key]: v }))}
                  >
                    <SelectTrigger data-testid={`select-${f.key}`}>
                      <SelectValue placeholder="Choose..." />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options!.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={data[f.key] || ""}
                    onChange={(e) => setData((d) => ({ ...d, [f.key]: e.target.value }))}
                    data-testid={`input-${f.key}`}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div>
          <Label htmlFor="entity-public-md">Player-visible description</Label>
          <p className="text-xs text-muted-foreground mb-1">
            Shown to players only after you reveal this entity.
          </p>
          <Textarea
            id="entity-public-md"
            value={publicMd}
            onChange={(e) => setPublicMd(e.target.value)}
            rows={4}
            data-testid="input-public-md"
          />
        </div>
      </div>

      <div className="rounded-2xl glass-panel p-5 space-y-4 border border-amber-500/20 bg-amber-500/5">
        <div>
          <h3 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
            <EyeOff className="h-4 w-4" />
            Permanently DM-only
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            These fields are never sent to players, even after the entity is revealed.
          </p>
        </div>
        <div>
          <Label htmlFor="entity-dm-notes">DM Notes</Label>
          <Textarea
            id="entity-dm-notes"
            value={dmNotes}
            onChange={(e) => setDmNotes(e.target.value)}
            rows={3}
            data-testid="input-dm-notes"
          />
        </div>
        <div>
          <Label htmlFor="entity-secret-md">Secret Lore</Label>
          <Textarea
            id="entity-secret-md"
            value={secretMd}
            onChange={(e) => setSecretMd(e.target.value)}
            rows={3}
            data-testid="input-secret-md"
          />
        </div>
        <div>
          <Label htmlFor="entity-true-motivation">True Motivation</Label>
          <Textarea
            id="entity-true-motivation"
            value={trueMotivation}
            onChange={(e) => setTrueMotivation(e.target.value)}
            rows={2}
            data-testid="input-true-motivation"
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive" data-testid="text-form-error">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving} data-testid="button-save">
          {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          {mode === "create" ? "Create" : "Save"}
        </Button>
      </div>
    </div>
  );
}

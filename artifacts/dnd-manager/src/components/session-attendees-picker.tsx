import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Users, UserPlus, X, Star, Plus, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useListCharacters,
  useListNpcs,
  useCreateNpc,
  getListNpcsQueryKey,
} from "@workspace/api-client-react";
import type {
  Character,
  Npc,
  SessionAttendees,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const EMPTY_ATTENDEES: SessionAttendees = { characterIds: [], npcs: [] };

export function emptyAttendees(): SessionAttendees {
  return { characterIds: [], npcs: [] };
}

/**
 * Drag-and-drop attendee picker. Source pool = roster (PCs + saved NPCs).
 * Sink = "At the table" zone. Tap-to-add and drag-to-add both work; the
 * quick-add input creates ad-hoc NPCs (no npcId) that the DM can later
 * promote to the roster with the ★ button.
 */
export type AttendeesUpdater = SessionAttendees | ((prev: SessionAttendees) => SessionAttendees);

export function SessionAttendeesPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: SessionAttendees | null | undefined;
  // Setter-style signature so async callbacks (e.g. "save to roster" after a
  // network round-trip) can compose with concurrent edits without clobbering.
  onChange: (next: AttendeesUpdater) => void;
  disabled?: boolean;
}) {
  const attendees = value ?? EMPTY_ATTENDEES;
  const applyUpdate = (fn: (prev: SessionAttendees) => SessionAttendees) =>
    onChange((prev) => fn(prev ?? EMPTY_ATTENDEES));
  const { data: charactersData } = useListCharacters();
  const { data: npcsData } = useListNpcs();
  const characters = (charactersData ?? []) as Character[];
  const allNpcs = (npcsData ?? []) as Npc[];
  const createNpc = useCreateNpc();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [quickAddName, setQuickAddName] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const selectedCharacterIds = useMemo(() => new Set(attendees.characterIds), [attendees.characterIds]);
  const selectedNpcIds = useMemo(
    () => new Set(attendees.npcs.map((n) => n.npcId).filter((id): id is number => typeof id === "number")),
    [attendees.npcs],
  );

  const availableCharacters = characters.filter((c) => !selectedCharacterIds.has(c.id));
  const availableNpcs = allNpcs.filter((n) => !selectedNpcIds.has(n.id));

  const addCharacter = (id: number) => {
    applyUpdate((prev) =>
      prev.characterIds.includes(id) ? prev : { ...prev, characterIds: [...prev.characterIds, id] },
    );
  };
  const removeCharacter = (id: number) => {
    applyUpdate((prev) => ({ ...prev, characterIds: prev.characterIds.filter((x) => x !== id) }));
  };
  const addRosterNpc = (npc: Npc) => {
    applyUpdate((prev) =>
      prev.npcs.some((n) => n.npcId === npc.id)
        ? prev
        : { ...prev, npcs: [...prev.npcs, { name: npc.name, npcId: npc.id }] },
    );
  };
  const removeNpcAt = (index: number) => {
    applyUpdate((prev) => ({ ...prev, npcs: prev.npcs.filter((_, i) => i !== index) }));
  };
  const handleQuickAdd = () => {
    const name = quickAddName.trim();
    if (!name) return;
    applyUpdate((prev) => ({ ...prev, npcs: [...prev.npcs, { name }] }));
    setQuickAddName("");
  };
  const handleSaveToRoster = (index: number) => {
    const npc = attendees.npcs[index];
    if (!npc || npc.npcId !== undefined) return;
    // Snapshot the original quick-tag name so we can re-find this row after the
    // network round-trip — the index could shift if the user added/removed
    // other attendees while the request was in flight.
    const originalName = npc.name;
    createNpc.mutate(
      { data: { name: originalName } },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getListNpcsQueryKey() });
          applyUpdate((prev) => {
            let backfilled = false;
            const nextNpcs = prev.npcs.map((n) => {
              if (!backfilled && n.npcId === undefined && n.name === originalName) {
                backfilled = true;
                return { name: created.name, npcId: created.id };
              }
              return n;
            });
            return backfilled ? { ...prev, npcs: nextNpcs } : prev;
          });
          toast({ title: `Saved "${created.name}" to roster` });
        },
        onError: () => {
          toast({ title: "Couldn't save NPC to roster", variant: "destructive" });
        },
      },
    );
  };

  // Stable IDs for the selected chips so dnd-kit/sortable can track them
  // across reorders. PCs use pc-<id>; NPCs use npc-<npcId> for roster NPCs
  // and nq-<index>-<name> for quick-tag NPCs (which have no stable id yet).
  type SelectedRow =
    | { sortId: string; kind: "pc"; id: number }
    | { sortId: string; kind: "npc"; index: number };
  const selectedRows: SelectedRow[] = [
    ...attendees.characterIds.map((id) => ({ sortId: `pc-${id}`, kind: "pc" as const, id })),
    ...attendees.npcs.map((n, index) => ({
      sortId: n.npcId !== undefined ? `npc-${n.npcId}` : `nq-${index}-${n.name}`,
      kind: "npc" as const,
      index,
    })),
  ];
  const sortIds = selectedRows.map((r) => r.sortId);

  const reorderSelected = (fromSortId: string, toSortId: string) => {
    const fromIdx = selectedRows.findIndex((r) => r.sortId === fromSortId);
    const toIdx = selectedRows.findIndex((r) => r.sortId === toSortId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const reorderedRows = arrayMove(selectedRows, fromIdx, toIdx);
    applyUpdate((prev) => {
      const newCharacterIds: number[] = [];
      const newNpcs: SessionAttendees["npcs"] = [];
      for (const row of reorderedRows) {
        if (row.kind === "pc") {
          newCharacterIds.push(row.id);
        } else {
          const original = prev.npcs[row.index];
          if (original) newNpcs.push(original);
        }
      }
      return { characterIds: newCharacterIds, npcs: newNpcs };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const data = event.active.data.current as
      | { kind: "pc" | "npc"; id: number; source: "roster" | "selected" }
      | undefined;
    if (!data) return;
    if (data.source === "roster") {
      // Add into the dropzone (or onto any selected chip, which lives inside
      // the dropzone — both count as a drop into the zone).
      if (overId === "attendees-dropzone" || sortIds.includes(overId ?? "")) {
        if (data.kind === "pc") {
          addCharacter(data.id);
        } else {
          const npc = allNpcs.find((n) => n.id === data.id);
          if (npc) addRosterNpc(npc);
        }
      }
      return;
    }
    // source === "selected" → reorder within the dropzone
    if (overId && overId !== activeId && sortIds.includes(overId)) {
      reorderSelected(activeId, overId);
    }
  };

  const totalSelected = attendees.characterIds.length + attendees.npcs.length;

  return (
    <div data-testid="session-attendees-picker">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Roster pool */}
          <div className="rounded-xl glass-panel p-3">
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Users className="h-3.5 w-3.5" />
              Roster
            </div>
            {availableCharacters.length === 0 && availableNpcs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Everyone in the roster is already at the table.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5" data-testid="attendees-roster-pool">
                {availableCharacters.map((c) => (
                  <RosterChip
                    key={`pc-${c.id}`}
                    id={`pc-${c.id}`}
                    label={c.name}
                    sublabel="PC"
                    accent="primary"
                    dragData={{ kind: "pc", id: c.id }}
                    onTap={() => !disabled && addCharacter(c.id)}
                    disabled={disabled}
                    testId={`roster-pc-${c.id}`}
                  />
                ))}
                {availableNpcs.map((n) => (
                  <RosterChip
                    key={`npc-${n.id}`}
                    id={`npc-${n.id}`}
                    label={n.name}
                    sublabel="NPC"
                    accent="muted"
                    dragData={{ kind: "npc", id: n.id }}
                    onTap={() => !disabled && addRosterNpc(n)}
                    disabled={disabled}
                    testId={`roster-npc-${n.id}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Drop zone */}
          <DropZone>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <UserPlus className="h-3.5 w-3.5" />
                At the table
              </div>
              <span className="text-xs text-muted-foreground tabular-nums" data-testid="attendees-count">
                {totalSelected}
              </span>
            </div>
            {totalSelected === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Drag from the roster, or quick-add an NPC below.
              </p>
            ) : (
              <SortableContext items={sortIds} strategy={horizontalListSortingStrategy}>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedRows.map((row) => {
                    if (row.kind === "pc") {
                      const c = characters.find((x) => x.id === row.id);
                      return (
                        <SortableSelectedChip
                          key={row.sortId}
                          sortId={row.sortId}
                          label={c?.name ?? `Character #${row.id}`}
                          accent="primary"
                          onRemove={() => !disabled && removeCharacter(row.id)}
                          disabled={disabled}
                          testId={`selected-pc-${row.id}`}
                        />
                      );
                    }
                    const n = attendees.npcs[row.index];
                    return (
                      <SortableSelectedChip
                        key={row.sortId}
                        sortId={row.sortId}
                        label={n.name}
                        accent={n.npcId === undefined ? "amber" : "muted"}
                        onRemove={() => !disabled && removeNpcAt(row.index)}
                        onSaveToRoster={
                          n.npcId === undefined && !disabled
                            ? () => handleSaveToRoster(row.index)
                            : undefined
                        }
                        saving={createNpc.isPending}
                        disabled={disabled}
                        testId={`selected-npc-${row.index}`}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            )}
            {!disabled && (
              <div className="flex items-center gap-1.5 mt-2">
                <Input
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleQuickAdd();
                    }
                  }}
                  placeholder="Quick-add NPC name…"
                  className="h-8 text-sm"
                  data-testid="input-quick-add-npc"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 shrink-0"
                  onClick={handleQuickAdd}
                  disabled={!quickAddName.trim()}
                  data-testid="button-quick-add-npc"
                  aria-label="Quick-add NPC"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </DropZone>
        </div>
      </DndContext>
    </div>
  );
}

function DropZone({ children }: { children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: "attendees-dropzone" });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl glass-panel p-3 transition-colors ${
        isOver ? "ring-2 ring-primary/60 bg-primary/5" : ""
      }`}
      data-testid="attendees-dropzone"
    >
      {children}
    </div>
  );
}

function RosterChip({
  id,
  label,
  sublabel,
  accent,
  dragData,
  onTap,
  disabled,
  testId,
}: {
  id: string;
  label: string;
  sublabel: string;
  accent: "primary" | "muted";
  dragData: { kind: "pc" | "npc"; id: number };
  onTap: () => void;
  disabled: boolean;
  testId: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { ...dragData, source: "roster" as const },
    disabled,
  });
  const accentCls =
    accent === "primary"
      ? "border-primary/40 bg-primary/10 text-primary-foreground hover:bg-primary/20"
      : "border-white/10 bg-white/5 text-foreground hover:bg-white/10";
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onTap}
      disabled={disabled}
      className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all ${accentCls} ${
        isDragging ? "opacity-40" : ""
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}`}
      data-testid={testId}
      {...attributes}
      {...listeners}
    >
      <span className="font-medium">{label}</span>
      <span className="text-[10px] uppercase opacity-60">{sublabel}</span>
    </button>
  );
}

function SortableSelectedChip({
  sortId,
  label,
  accent,
  onRemove,
  onSaveToRoster,
  saving,
  disabled,
  testId,
}: {
  sortId: string;
  label: string;
  accent: "primary" | "muted" | "amber";
  onRemove: () => void;
  onSaveToRoster?: () => void;
  saving?: boolean;
  disabled: boolean;
  testId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortId,
    data: { source: "selected" as const },
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const accentCls =
    accent === "primary"
      ? "border-primary/40 bg-primary/15 text-primary-foreground"
      : accent === "amber"
        ? "border-amber-400/40 bg-amber-400/10 text-amber-100"
        : "border-white/10 bg-white/5 text-foreground";
  return (
    <span
      ref={setNodeRef}
      style={style}
      className={`inline-flex items-center gap-1 rounded-full border pl-1 pr-1 py-1 text-xs ${accentCls}`}
      data-testid={testId}
    >
      <button
        type="button"
        className={`rounded-full p-0.5 ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-grab active:cursor-grabbing hover:bg-white/10"} transition-colors`}
        aria-label={`Reorder ${label}`}
        title="Drag to reorder"
        data-testid={`${testId}-drag-handle`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <span className="font-medium pr-1">{label}</span>
      {onSaveToRoster && (
        <button
          type="button"
          onClick={onSaveToRoster}
          disabled={saving}
          className="rounded-full p-0.5 hover:bg-amber-400/20 transition-colors disabled:opacity-50"
          aria-label={`Save ${label} to roster`}
          title="Save to roster"
          data-testid={`${testId}-save`}
        >
          <Star className="h-3 w-3" />
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="rounded-full p-0.5 hover:bg-white/10 transition-colors disabled:opacity-50"
        aria-label={`Remove ${label}`}
        data-testid={`${testId}-remove`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/**
 * Read-only "Who was there" strip for the session detail view. Resolves
 * character names live so renames flow through; NPC names are taken from the
 * stored attendees blob (so deleting an NPC from the roster leaves the
 * historical name intact). When `onSaveNpcToRoster` is provided (DM only),
 * unsaved quick-tag NPCs show a ★ button to promote them to the roster.
 */
export function SessionAttendeesStrip({
  attendees,
  isDm = false,
  onSaveNpcToRoster,
  savingNpcIndex,
}: {
  attendees: SessionAttendees | null | undefined;
  isDm?: boolean;
  onSaveNpcToRoster?: (index: number) => void;
  savingNpcIndex?: number | null;
}) {
  const { data: charactersData } = useListCharacters();
  const characters = (charactersData ?? []) as Character[];
  const total = (attendees?.characterIds.length ?? 0) + (attendees?.npcs.length ?? 0);

  return (
    <div className="rounded-xl glass-panel p-3" data-testid="session-attendees-strip">
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <Users className="h-3.5 w-3.5" />
        Who was there
      </div>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="strip-empty">
          {isDm ? "No one tagged yet — use Add attendees to record who showed up." : "The DM hasn't tagged attendees for this session yet."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {attendees!.characterIds.map((id) => {
            const c = characters.find((x) => x.id === id);
            return (
              <span
                key={`strip-pc-${id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 text-xs text-primary-foreground"
                data-testid={`strip-pc-${id}`}
              >
                <span className="font-medium">{c?.name ?? `Character #${id}`}</span>
                <span className="text-[10px] uppercase opacity-60">PC</span>
              </span>
            );
          })}
          {attendees!.npcs.map((n, i) => {
            const isUnsaved = n.npcId === undefined;
            const showSave = isDm && isUnsaved && onSaveNpcToRoster;
            const accentCls = isUnsaved
              ? "border-amber-400/40 bg-amber-400/10 text-amber-100"
              : "border-white/10 bg-white/5 text-foreground";
            return (
              <span
                key={`strip-npc-${i}-${n.npcId ?? n.name}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${accentCls}`}
                data-testid={`strip-npc-${i}`}
              >
                <span className="font-medium">{n.name}</span>
                <span className="text-[10px] uppercase opacity-60">NPC</span>
                {showSave && (
                  <button
                    type="button"
                    onClick={() => onSaveNpcToRoster!(i)}
                    disabled={savingNpcIndex === i}
                    className="rounded-full p-0.5 -mr-0.5 hover:bg-amber-400/20 transition-colors disabled:opacity-50"
                    aria-label={`Save ${n.name} to roster`}
                    title="Save to roster"
                    data-testid={`strip-npc-${i}-save`}
                  >
                    <Star className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useLocation } from "wouter";
import { Tent, Home, Mountain, Map as MapIcon, Trash2, Plus, ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useListMaps,
  useCreateMap,
  useDeleteMap,
  useGetMyMembership,
  getListMapsQueryKey,
} from "@workspace/api-client-react";
import type { MapSummary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const MAP_TYPES = [
  { id: "dungeon" as const, label: "Dungeon", icon: Tent, blurb: "Stone, walls, water, pits" },
  { id: "town" as const, label: "Town / Tavern", icon: Home, blurb: "Wood, cobble, rugs, tables" },
  { id: "world" as const, label: "World Map", icon: Mountain, blurb: "Plains, forest, peaks, ocean" },
];

export default function MapsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: membership } = useGetMyMembership();
  const { data: maps, isLoading } = useListMaps({ query: { queryKey: ["/api/maps"] } });
  const createMap = useCreateMap();
  const deleteMap = useDeleteMap();
  const isDm = membership?.role === "dm";

  const [name, setName] = useState("");
  const [chosenType, setChosenType] = useState<"dungeon" | "town" | "world">("dungeon");
  const [showCreate, setShowCreate] = useState(false);

  const handleCreate = () => {
    const trimmed = name.trim() || `Untitled ${chosenType}`;
    createMap.mutate(
      { data: { name: trimmed, type: chosenType, rows: 15, cols: 15 } },
      {
        onSuccess: (m) => {
          queryClient.invalidateQueries({ queryKey: getListMapsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["/api/maps"] });
          toast({ title: "Map created" });
          setShowCreate(false);
          setName("");
          setLocation(`/maps/${m.id}`);
        },
        onError: () => toast({ title: "Could not create map", variant: "destructive" }),
      },
    );
  };

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Delete this map? This cannot be undone.")) return;
    deleteMap.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMapsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["/api/maps"] });
          toast({ title: "Map deleted" });
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      },
    );
  };

  const typeIcon = (t: string) => MAP_TYPES.find((m) => m.id === t)?.icon ?? MapIcon;

  return (
    <div className="dark min-h-[100dvh] bg-[#09090B] text-foreground" data-testid="page-maps">
      <header className="border-b border-[rgba(255,255,255,0.06)] px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/dashboard")}
            data-testid="button-back-to-dashboard"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="h-6 w-px bg-[rgba(255,255,255,0.08)]" />
          <h1 className="text-lg font-semibold tracking-tight">Maps</h1>
        </div>
        {isDm && (
          <Button onClick={() => setShowCreate((s) => !s)} size="sm" data-testid="button-toggle-create-map">
            <Plus className="h-4 w-4 mr-1" />
            New map
          </Button>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8">
        {showCreate && isDm && (
          <section className="glass-panel rounded-2xl p-6 space-y-5" data-testid="section-create-map">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Start new map
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {MAP_TYPES.map((t) => {
                  const Icon = t.icon;
                  const active = chosenType === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setChosenType(t.id)}
                      data-testid={`button-type-${t.id}`}
                      className={`text-left p-4 rounded-xl border transition-colors ${
                        active
                          ? "border-primary bg-primary/10"
                          : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.06)]"
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="font-semibold">{t.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{t.blurb}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Map name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`Untitled ${chosenType}`}
                  maxLength={80}
                  data-testid="input-map-name"
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={createMap.isPending}
                data-testid="button-create-map"
              >
                {createMap.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create map
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Maps start as a 15×15 grid you can paint and reveal with the editor tools.
            </p>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Saved maps
          </h2>
          {isLoading ? (
            <div className="text-muted-foreground text-sm">Loading…</div>
          ) : !maps || maps.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center text-muted-foreground" data-testid="text-no-maps">
              <MapIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No maps yet.</p>
              {isDm && <p className="text-xs mt-1 opacity-70">Click “New map” to create your first.</p>}
            </div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="list-maps">
              {(maps as MapSummary[]).map((m) => {
                const Icon = typeIcon(m.type);
                return (
                  <li
                    key={m.id}
                    onClick={() => setLocation(`/maps/${m.id}`)}
                    className="group glass-panel rounded-xl p-4 cursor-pointer hover:border-primary/40 transition-colors flex items-center justify-between gap-3"
                    data-testid={`map-card-${m.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-[rgba(255,255,255,0.06)] flex items-center justify-center text-primary shrink-0">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{m.name}</div>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {m.type} • {m.rows}×{m.cols} • {m.tokenCount} tokens
                        </div>
                      </div>
                    </div>
                    {isDm && (
                      <button
                        onClick={(e) => handleDelete(e, m.id)}
                        className="p-2 rounded-md text-muted-foreground hover:text-red-400 hover:bg-[rgba(255,255,255,0.04)] opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete map"
                        data-testid={`button-delete-map-${m.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

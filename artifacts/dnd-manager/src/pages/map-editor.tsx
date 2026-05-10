import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import {
  ChevronLeft,
  Eye,
  EyeOff,
  Eraser,
  MousePointer2,
  Users,
  Trash2,
  Loader2,
  Tent,
  Home,
  Mountain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useGetMap,
  useUpdateMap,
  useGetMyMembership,
  getGetMapQueryKey,
  getListMapsQueryKey,
} from "@workspace/api-client-react";
import type { Map as ApiMap, MapTile, MapToken } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type MapType = "dungeon" | "town" | "world";

const TILE_SETS: Record<MapType, Array<{ id: string; label: string; emoji: string; color: string }>> = {
  dungeon: [
    { id: "stone", label: "Stone", emoji: "🪨", color: "#44403c" },
    { id: "wall", label: "Wall", emoji: "🧱", color: "#1c1917" },
    { id: "water", label: "Water", emoji: "💧", color: "#0c4a6e" },
    { id: "pit", label: "Pit", emoji: "🕳️", color: "#000000" },
  ],
  town: [
    { id: "wood", label: "Wood", emoji: "🪵", color: "#78350f" },
    { id: "cobble", label: "Cobble", emoji: "🔘", color: "#57534e" },
    { id: "rug", label: "Rug", emoji: "🧶", color: "#991b1b" },
    { id: "table", label: "Table", emoji: "🍱", color: "#451a03" },
  ],
  world: [
    { id: "grass", label: "Plains", emoji: "🌿", color: "#3f6212" },
    { id: "forest", label: "Forest", emoji: "🌲", color: "#14532d" },
    { id: "mountain", label: "Peak", emoji: "🏔️", color: "#71717a" },
    { id: "ocean", label: "Ocean", emoji: "🌊", color: "#1e3a8a" },
  ],
};

const TYPE_ICON: Record<MapType, typeof Tent> = {
  dungeon: Tent,
  town: Home,
  world: Mountain,
};

const TOKEN_GROUPS = [
  { id: "player" as const, label: "Players", color: "bg-blue-600", emojis: ["🧙‍♂️", "🧝‍♀️", "🧔", "🏹", "🛡️", "🐈‍⬛"] },
  { id: "monster" as const, label: "Monsters", color: "bg-red-600", emojis: ["🐉", "👹", "💀", "🐺", "🕷️", "🧟"] },
  { id: "npc" as const, label: "NPCs", color: "bg-amber-600", emojis: ["👨‍🌾", "👵", "👳‍♂️", "👸", "🧙", "🐶"] },
];

type Tool = "brush" | "reveal" | "hide" | "eraser" | "token";

export default function MapEditorPage() {
  const [, params] = useRoute("/maps/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = params?.id ? parseInt(params.id, 10) : NaN;
  const validId = !Number.isNaN(id);

  const { data: membership } = useGetMyMembership();
  const isDm = membership?.role === "dm";

  const { data: serverMap, isLoading, error } = useGetMap(id, {
    query: {
      enabled: validId,
      refetchInterval: 5000,
      queryKey: getGetMapQueryKey(id),
    },
  });

  const updateMap = useUpdateMap();

  // Local optimistic copy of the map. We sync from server, but apply local edits
  // immediately and flush a single PATCH per stroke (mouseup) to avoid spamming.
  const [local, setLocal] = useState<ApiMap | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!serverMap) return;
    // If user has uncommitted local edits, don't clobber.
    if (dirtyRef.current) return;
    setLocal(serverMap as ApiMap);
  }, [serverMap]);

  const [tool, setTool] = useState<Tool>("brush");
  const [selectedTile, setSelectedTile] = useState<string>("");
  const [selectedToken, setSelectedToken] = useState<{
    type: "player" | "monster" | "npc";
    emoji: string;
    color: string;
    label: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<"tools" | "tokens">("tools");
  const [previewAsPlayer, setPreviewAsPlayer] = useState(false);
  const [draggedTokenId, setDraggedTokenId] = useState<string | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  useEffect(() => {
    if (local && !selectedTile) {
      const palette = TILE_SETS[local.type as MapType];
      if (palette) setSelectedTile(palette[0].id);
    }
  }, [local, selectedTile]);

  useEffect(() => {
    if (local) setNameDraft(local.name);
  }, [local?.id]);

  // Whether the viewer is acting as a player (real player, or DM previewing).
  const viewingAsPlayer = !isDm || previewAsPlayer;

  const flushPatch = useCallback(
    (
      next: { tiles?: MapTile[]; tokens?: MapToken[]; name?: string },
      opts?: { silent?: boolean },
    ) => {
      if (!local || !isDm) return;
      updateMap.mutate(
        { id: local.id, data: next },
        {
          onSuccess: (updated) => {
            dirtyRef.current = false;
            setLocal(updated as ApiMap);
            queryClient.invalidateQueries({ queryKey: getGetMapQueryKey(local.id) });
            queryClient.invalidateQueries({ queryKey: getListMapsQueryKey() });
          },
          onError: () => {
            dirtyRef.current = false;
            if (!opts?.silent) toast({ title: "Save failed", variant: "destructive" });
          },
        },
      );
    },
    [local, isDm, updateMap, queryClient, toast],
  );

  const paintAt = useCallback(
    (index: number) => {
      if (!local || !isDm || previewAsPlayer) return;
      if (tool === "token") return; // tokens are placed on click, not drag
      const newTiles = local.tiles.slice();
      const palette = TILE_SETS[local.type as MapType];
      const fallback = palette[0].id;
      const cur = newTiles[index];
      if (!cur) return;
      let next: MapTile = { ...cur };
      if (tool === "brush") {
        next = { ...next, type: selectedTile || fallback };
      } else if (tool === "reveal") {
        next = { ...next, revealed: true };
      } else if (tool === "hide") {
        next = { ...next, revealed: false };
      } else if (tool === "eraser") {
        next = { ...next, type: fallback, revealed: false };
      }
      newTiles[index] = next;
      dirtyRef.current = true;
      setLocal({ ...local, tiles: newTiles });
    },
    [local, isDm, previewAsPlayer, tool, selectedTile],
  );

  const handleCellMouseDown = (index: number) => {
    if (!local || !isDm || previewAsPlayer) return;
    if (draggedTokenId) {
      const newTokens = local.tokens.map((t) =>
        t.id === draggedTokenId ? { ...t, index } : t,
      );
      dirtyRef.current = true;
      setLocal({ ...local, tokens: newTokens });
      setDraggedTokenId(null);
      flushPatch({ tokens: newTokens });
      return;
    }
    if (tool === "token" && selectedToken) {
      const newToken: MapToken = {
        id: `tkn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        index,
        type: selectedToken.type,
        emoji: selectedToken.emoji,
        color: selectedToken.color,
        label: selectedToken.label,
        name: `${selectedToken.label} ${local.tokens.length + 1}`,
      };
      const newTokens = [...local.tokens, newToken];
      dirtyRef.current = true;
      setLocal({ ...local, tokens: newTokens });
      flushPatch({ tokens: newTokens });
      return;
    }
    setIsPainting(true);
    paintAt(index);
  };

  const handleCellMouseEnter = (index: number, buttons: number) => {
    if (!isDm || previewAsPlayer) return;
    if (buttons === 1 && isPainting && tool !== "token" && !draggedTokenId) {
      paintAt(index);
    }
  };

  const handleStrokeEnd = () => {
    if (!local || !isPainting) return;
    setIsPainting(false);
    if (dirtyRef.current) flushPatch({ tiles: local.tiles });
  };

  // Mouse up anywhere ends the stroke.
  useEffect(() => {
    const onUp = () => handleStrokeEnd();
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, isPainting]);

  const removeToken = (tokenId: string) => {
    if (!local) return;
    const newTokens = local.tokens.filter((t) => t.id !== tokenId);
    dirtyRef.current = true;
    setLocal({ ...local, tokens: newTokens });
    flushPatch({ tokens: newTokens });
  };

  const handleNameBlur = () => {
    if (!local) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === local.name) {
      setNameDraft(local.name);
      return;
    }
    dirtyRef.current = true;
    setLocal({ ...local, name: trimmed });
    flushPatch({ name: trimmed });
  };

  const palette = useMemo(
    () => (local ? TILE_SETS[local.type as MapType] ?? TILE_SETS.dungeon : []),
    [local?.type],
  );

  if (!validId) {
    return (
      <div className="dark min-h-[100dvh] bg-background text-foreground p-8">
        <p className="text-sm text-muted-foreground">Invalid map id.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dark min-h-[100dvh] bg-background text-foreground p-8 space-y-3">
        <p className="text-sm text-red-400">Could not load this map.</p>
        <Button variant="outline" onClick={() => setLocation("/maps")}>Back to maps</Button>
      </div>
    );
  }

  if (isLoading || !local) {
    return (
      <div className="dark min-h-[100dvh] bg-background text-foreground p-8 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading map…
      </div>
    );
  }

  const TypeIcon = TYPE_ICON[local.type as MapType] ?? Tent;

  return (
    <div
      className="dark h-[100dvh] bg-background text-foreground flex flex-col overflow-hidden"
      data-testid="page-map-editor"
    >
      <header className="h-14 border-b border-border/60 bg-sidebar bg-dither-surface px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/maps")} data-testid="button-back-to-maps">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="h-6 w-px bg-border" />
          <TypeIcon className="h-4 w-4 text-primary shrink-0" />
          {isDm ? (
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              maxLength={80}
              className="h-8 w-56 bg-transparent border-transparent focus-visible:border-border"
              data-testid="input-map-name"
            />
          ) : (
            <span className="font-semibold truncate" data-testid="text-map-name">{local.name}</span>
          )}
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground hidden sm:inline">
            {local.type} • {local.rows}×{local.cols}
          </span>
        </div>
        {isDm && (
          <label
            className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer"
            data-testid="label-preview-as-player"
          >
            <input
              type="checkbox"
              checked={previewAsPlayer}
              onChange={(e) => setPreviewAsPlayer(e.target.checked)}
              className="accent-primary"
              data-testid="toggle-preview-as-player"
            />
            Preview as player
          </label>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        {isDm && !previewAsPlayer && (
          <aside
            className="w-72 border-r border-border/60 bg-sidebar bg-dither-surface flex flex-col shrink-0"
            data-testid="aside-tools"
          >
            <div className="flex border-b border-border/60">
              <button
                onClick={() => setActiveTab("tools")}
                className={`flex-1 p-3 flex justify-center text-sm ${
                  activeTab === "tools" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
                }`}
                data-testid="tab-tools"
              >
                <MousePointer2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setActiveTab("tokens")}
                className={`flex-1 p-3 flex justify-center text-sm ${
                  activeTab === "tokens" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
                }`}
                data-testid="tab-tokens"
              >
                <Users className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {activeTab === "tools" && (
                <>
                  <section>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      Tools
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <ToolButton active={tool === "brush"} onClick={() => setTool("brush")} icon={<MousePointer2 className="h-3.5 w-3.5" />} label="Paint" testId="tool-brush" />
                      <ToolButton active={tool === "reveal"} onClick={() => setTool("reveal")} icon={<Eye className="h-3.5 w-3.5" />} label="Reveal" testId="tool-reveal" />
                      <ToolButton active={tool === "hide"} onClick={() => setTool("hide")} icon={<EyeOff className="h-3.5 w-3.5" />} label="Hide" testId="tool-hide" />
                      <ToolButton active={tool === "eraser"} onClick={() => setTool("eraser")} icon={<Eraser className="h-3.5 w-3.5" />} label="Wipe" testId="tool-eraser" />
                    </div>
                  </section>
                  <section>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      Palette ({local.type})
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {palette.map((p) => {
                        const active = selectedTile === p.id && tool === "brush";
                        return (
                          <button
                            key={p.id}
                            onClick={() => {
                              setSelectedTile(p.id);
                              setTool("brush");
                            }}
                            data-testid={`palette-${p.id}`}
                            className={`flex items-center gap-2 p-2 rounded border-2 transition-colors ${
                              active
                                ? "border-primary bg-primary/10"
                                : "border-border bg-muted/60"
                            }`}
                          >
                            <span className="text-lg">{p.emoji}</span>
                            <span className="text-[10px] font-bold uppercase truncate">{p.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </>
              )}

              {activeTab === "tokens" && (
                <section className="space-y-4">
                  {TOKEN_GROUPS.map((g) => (
                    <div key={g.id}>
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                        {g.label}
                      </h3>
                      <div className="grid grid-cols-4 gap-1">
                        {g.emojis.map((emo, i) => {
                          const active = tool === "token" && selectedToken?.emoji === emo;
                          return (
                            <button
                              key={i}
                              onClick={() => {
                                setSelectedToken({
                                  type: g.id,
                                  emoji: emo,
                                  color: g.color,
                                  label: g.label.replace(/s$/, ""),
                                });
                                setTool("token");
                              }}
                              data-testid={`token-pick-${g.id}-${i}`}
                              className={`h-10 flex items-center justify-center text-xl rounded bg-muted/60 border-2 transition-all ${
                                active ? "border-primary scale-105" : "border-transparent"
                              }`}
                            >
                              {emo}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      On map ({local.tokens.length}/50)
                    </h3>
                    <div className="space-y-1">
                      {local.tokens.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between p-2 bg-muted/60 rounded text-xs"
                          data-testid={`token-row-${t.id}`}
                        >
                          <span className="flex items-center gap-2">
                            <span>{t.emoji}</span>
                            <span className="text-muted-foreground">{t.name}</span>
                          </span>
                          <button
                            onClick={() => removeToken(t.id)}
                            className="text-muted-foreground hover:text-red-400"
                            title="Remove token"
                            data-testid={`button-remove-token-${t.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </div>
          </aside>
        )}

        <main className="flex-1 bg-background p-4 md:p-8 overflow-auto flex items-start justify-center">
          <div
            className="grid p-2 rounded-lg bg-muted/40 border border-border/60"
            style={{
              gridTemplateColumns: `repeat(${local.cols}, 44px)`,
              gridTemplateRows: `repeat(${local.rows}, 44px)`,
            }}
            data-testid="map-grid"
          >
            {local.tiles.map((tile, idx) => {
              // Two views:
              //  - Real player: server already nulled t.type for unrevealed → render as fog.
              //  - DM (default): full info; DM (preview-as-player): client-side fog from revealed flag.
              const showAsFog =
                tile.type === null || (previewAsPlayer && !tile.revealed);
              const tileType = tile.type;
              const tileMeta = tileType
                ? palette.find((p) => p.id === tileType)
                : null;
              const tokensHere = local.tokens.filter((t) => t.index === idx);
              const cursor = isDm && !previewAsPlayer ? "cursor-crosshair" : "cursor-default";
              return (
                <div
                  key={idx}
                  onMouseDown={() => handleCellMouseDown(idx)}
                  onMouseEnter={(e) => handleCellMouseEnter(idx, e.buttons)}
                  onContextMenu={(e) => e.preventDefault()}
                  data-testid={`cell-${idx}`}
                  data-revealed={tile.revealed ? "true" : "false"}
                  data-fogged={showAsFog ? "true" : "false"}
                  className={`w-[44px] h-[44px] flex items-center justify-center text-xl relative border border-black/30 ${cursor} select-none`}
                  style={{
                    backgroundColor: showAsFog ? "#000" : tileMeta?.color ?? "#1c1917",
                    opacity: isDm && !previewAsPlayer && !tile.revealed ? 0.45 : 1,
                  }}
                >
                  {!showAsFog && tileMeta && <span>{tileMeta.emoji}</span>}
                  {tokensHere.map((tk) => (
                    <div
                      key={tk.id}
                      onMouseDown={(e) => {
                        if (!isDm || previewAsPlayer) return;
                        e.stopPropagation();
                        setDraggedTokenId(tk.id);
                      }}
                      title={tk.name}
                      data-testid={`token-${tk.id}`}
                      className={`absolute z-10 w-8 h-8 rounded-full border-2 border-white/60 flex items-center justify-center text-base shadow-lg ${tk.color} ${
                        isDm && !previewAsPlayer ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                      } ${draggedTokenId === tk.id ? "ring-2 ring-primary scale-110 z-20" : ""}`}
                    >
                      {tk.emoji}
                    </div>
                  ))}
                  {isDm && !previewAsPlayer && !tile.revealed && (
                    <div className="absolute top-0.5 right-0.5 opacity-30 pointer-events-none">
                      <EyeOff className="h-2.5 w-2.5" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  icon,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`flex items-center gap-2 px-3 py-2 rounded text-[10px] font-bold uppercase transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground border border-border"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MOCK_ENTITIES, type MockEntity } from "../mock-data";

const KINDS: Array<{ id: MockEntity["kind"] | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "npc", label: "NPCs" },
  { id: "quest", label: "Quests" },
  { id: "location", label: "Locations" },
  { id: "beat", label: "Story beats" },
  { id: "encounter", label: "Encounters" },
  { id: "twist", label: "Plot twists" },
  { id: "faction", label: "Factions" },
  { id: "item", label: "Items" },
];

export function WorldScreen() {
  const [kind, setKind] = useState<MockEntity["kind"] | "all">("all");
  const [q, setQ] = useState("");

  const items = useMemo(() => {
    return MOCK_ENTITIES.filter((e) => {
      if (kind !== "all" && e.kind !== kind) return false;
      if (!q) return true;
      const needle = q.toLowerCase();
      return e.name.toLowerCase().includes(needle) || e.summary.toLowerCase().includes(needle);
    });
  }, [kind, q]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pt-3">
        <Input placeholder="Search world…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {KINDS.map((k) => {
            const active = kind === k.id;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {k.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-4 pt-3">
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No entries match that filter.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((e) => (
              <li key={e.id}>
                <Card className="bg-card/60 hover:bg-card">
                  <CardContent className="flex items-start gap-3 p-3">
                    <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px] uppercase">
                      {e.kind}
                    </Badge>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.name}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{e.summary}</p>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

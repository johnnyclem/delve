import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Map, Send, Sparkles } from "lucide-react";
import { MOCK_ROLLS } from "../mock-data";

type PlaySub = "dice" | "ask" | "maps";

export function PlayScreen() {
  const [tab, setTab] = useState<PlaySub>("dice");

  return (
    <div className="flex h-full flex-col">
      <Tabs value={tab} onValueChange={(v) => setTab(v as PlaySub)} className="flex h-full flex-col">
        <div className="px-4 pt-3">
          <TabsList className="grid h-10 w-full grid-cols-3">
            <TabsTrigger value="dice">Dice</TabsTrigger>
            <TabsTrigger value="ask">Ask</TabsTrigger>
            <TabsTrigger value="maps">Maps</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dice" className="m-0 flex-1 overflow-auto px-4 pb-4 pt-3">
          <DiceSurface />
        </TabsContent>
        <TabsContent value="ask" className="m-0 flex-1 overflow-auto px-4 pb-4 pt-3">
          <AskSurface />
        </TabsContent>
        <TabsContent value="maps" className="m-0 flex-1 overflow-auto px-4 pb-4 pt-3">
          <MapsSurface />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DiceSurface() {
  const presets = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className="min-h-14 rounded-sm border border-border bg-card/60 font-mono text-sm hover:border-primary/50 hover:bg-card"
          >
            {p}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="2d6+3" className="font-mono" />
        <Button>Roll</Button>
      </div>
      <Card className="bg-card/60">
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {MOCK_ROLLS.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{r.expr}</span>
                <span className="font-mono text-lg font-bold text-primary">{r.result}</span>
                <span className="text-xs text-muted-foreground">{r.who} · {r.at}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function AskSurface() {
  return (
    <div className="flex h-full flex-col gap-3">
      <Card className="bg-card/60 p-3 text-sm">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-secondary">You</p>
        <p>What's the AC of a shielded fighter at level 3?</p>
      </Card>
      <Card className="bg-card/40 p-3 text-sm">
        <p className="mb-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary">
          <Sparkles className="h-3 w-3" /> Delve
        </p>
        <p>With chain mail (16) + shield (+2), a level 3 fighter has AC 18. Dex doesn't apply with chain mail.</p>
      </Card>
      <div className="mt-auto flex gap-2">
        <Input placeholder="Ask anything…" />
        <Button size="icon" aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function MapsSurface() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Maps live here now — no more separate <code className="font-mono">/maps</code> route.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {["Hollow Spire", "Brine Market", "Pine Hollow", "Manor cellars"].map((name) => (
          <button
            key={name}
            type="button"
            className="flex aspect-video flex-col justify-end overflow-hidden rounded-sm border border-border bg-gradient-to-br from-card to-background p-2 text-left hover:border-primary/50"
          >
            <Map className="mb-1 h-4 w-4 text-primary" />
            <span className="text-xs font-medium">{name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

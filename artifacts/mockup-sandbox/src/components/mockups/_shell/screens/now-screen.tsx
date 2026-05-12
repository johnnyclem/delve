import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Dice5, Mic, Sparkles, Sword } from "lucide-react";
import { MOCK_ROLLS, MOCK_SESSIONS } from "../mock-data";
import type { Role } from "../nav";

interface NowScreenProps {
  role: Role;
}

export function NowScreen({ role }: NowScreenProps) {
  const next = MOCK_SESSIONS.find((s) => s.status === "scheduled");
  const drafting = MOCK_SESSIONS.find((s) => s.status === "drafting");

  return (
    <div className="space-y-4 px-4 py-4">
      {next ? (
        <Card className="border-primary/30 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-primary">Up next</p>
              <CardTitle className="text-base">{next.title}</CardTitle>
            </div>
            <Sparkles className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{next.date}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {next.attendees} of 5 confirmed
            </p>
          </CardContent>
        </Card>
      ) : null}

      {drafting && role === "dm" ? (
        <Card className="border-amber-500/30 bg-card/60">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-400" />
              <CardTitle className="text-sm">Recap still drafting</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            "{drafting.title}" needs publishing before next session.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <QuickTile icon={Dice5} label="Roll d20" />
        <QuickTile icon={Sword} label="Open Maps" />
        <QuickTile icon={Mic} label="Voice note" />
      </div>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          Recent rolls
        </h2>
        <Card className="bg-card/60">
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {MOCK_ROLLS.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{r.expr}</span>
                  <span className="font-mono font-semibold text-primary">{r.result}</span>
                  <span className="text-xs text-muted-foreground">{r.who} · {r.at}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          Pinned
        </h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">House Rules</Badge>
          <Badge variant="outline">Party roster</Badge>
          {role === "dm" ? <Badge variant="outline">Compare Editions</Badge> : null}
        </div>
      </section>
    </div>
  );
}

function QuickTile({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-sm border border-border bg-card/60 px-2 py-3 text-center text-xs text-foreground hover:border-primary/50 hover:bg-card"
    >
      <Icon className="h-5 w-5 text-primary" />
      {label}
    </button>
  );
}

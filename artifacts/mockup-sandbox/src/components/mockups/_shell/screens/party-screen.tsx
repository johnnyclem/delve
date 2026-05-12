import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";
import { MOCK_CHARACTERS, MOCK_SESSIONS } from "../mock-data";
import type { Role } from "../nav";

type PartySub = "me" | "roster" | "sessions" | "schedule";

interface PartyScreenProps {
  role: Role;
}

export function PartyScreen({ role }: PartyScreenProps) {
  const initial: PartySub = role === "player" ? "me" : "sessions";
  const [tab, setTab] = useState<PartySub>(initial);

  return (
    <div className="flex h-full flex-col">
      <Tabs value={tab} onValueChange={(v) => setTab(v as PartySub)} className="flex h-full flex-col">
        <div className="px-4 pt-3">
          <TabsList className={`grid h-10 w-full ${role === "player" ? "grid-cols-4" : "grid-cols-3"}`}>
            {role === "player" ? <TabsTrigger value="me">Me</TabsTrigger> : null}
            <TabsTrigger value="roster">Roster</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
          </TabsList>
        </div>

        {role === "player" ? (
          <TabsContent value="me" className="m-0 flex-1 overflow-auto px-4 pb-4 pt-3">
            <MeSurface />
          </TabsContent>
        ) : null}
        <TabsContent value="roster" className="m-0 flex-1 overflow-auto px-4 pb-4 pt-3">
          <RosterSurface />
        </TabsContent>
        <TabsContent value="sessions" className="m-0 flex-1 overflow-auto px-4 pb-4 pt-3">
          <SessionsSurface role={role} />
        </TabsContent>
        <TabsContent value="schedule" className="m-0 flex-1 overflow-auto px-4 pb-4 pt-3">
          <ScheduleSurface />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MeSurface() {
  const me = MOCK_CHARACTERS[0];
  return (
    <Card className="bg-card/60">
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Your character</p>
          <h3 className="text-xl font-semibold">{me.name}</h3>
          <p className="text-sm text-muted-foreground">Level {me.level} {me.class}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { l: "HP", v: "47/52" },
            { l: "AC", v: "16" },
            { l: "Init", v: "+3" },
          ].map((stat) => (
            <div key={stat.l} className="rounded-sm border border-border bg-background/40 p-2">
              <p className="text-[10px] uppercase text-muted-foreground">{stat.l}</p>
              <p className="font-mono text-sm font-semibold">{stat.v}</p>
            </div>
          ))}
        </div>
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            ASI history
          </p>
          <ul className="space-y-1 text-xs">
            <li className="flex justify-between">
              <span>L4 — Dex +2</span>
              <span className="text-muted-foreground">Sharpshooter prep</span>
            </li>
            <li className="flex justify-between">
              <span>L6 — Feat: Sharpshooter</span>
              <span className="text-muted-foreground">Now</span>
            </li>
          </ul>
          <p className="mt-1 text-[10px] text-primary">
            Previously buried in a popover · now inline.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function RosterSurface() {
  return (
    <ul className="space-y-2">
      {MOCK_CHARACTERS.map((c) => (
        <li key={c.id}>
          <Card className="bg-card/60 hover:bg-card">
            <CardContent className="flex items-center gap-3 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-xs font-bold">
                {c.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  L{c.level} {c.class} · played by {c.player}
                </p>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function SessionsSurface({ role }: { role: Role }) {
  return (
    <ul className="space-y-2">
      {MOCK_SESSIONS.map((s) => (
        <li key={s.id}>
          <Card className="bg-card/60 hover:bg-card">
            <CardContent className="space-y-1 p-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] uppercase">
                  {s.status}
                </Badge>
                <p className="flex-1 text-sm font-medium">{s.title}</p>
                {role === "dm" && s.status !== "scheduled" ? (
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-background/40 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    <Bell className="h-3 w-3" /> Resend
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {s.date} · {s.attendees} attendees
              </p>
            </CardContent>
          </Card>
        </li>
      ))}
      {role === "dm" ? (
        <li className="pt-1 text-center text-[10px] text-primary">
          "Resend notification" was previously buried 3 levels deep · now inline.
        </li>
      ) : null}
    </ul>
  );
}

function ScheduleSurface() {
  return (
    <div className="space-y-3">
      <div className="rounded-sm border border-border bg-card/40 p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">May 2026</p>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs">
          {Array.from({ length: 21 }, (_, i) => i + 1).map((d) => {
            const isNext = d === 18;
            return (
              <div
                key={d}
                className={`flex h-9 items-center justify-center rounded-sm ${
                  isNext
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {d}
              </div>
            );
          })}
        </div>
      </div>
      <Card className="bg-card/60">
        <CardContent className="p-3 text-sm">
          <p className="text-[10px] uppercase tracking-wider text-primary">May 18</p>
          <p className="font-medium">Session 14 — Into the Spire</p>
          <p className="text-xs text-muted-foreground">Invites delivered to 5/5 players.</p>
        </CardContent>
      </Card>
    </div>
  );
}

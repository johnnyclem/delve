import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";

import { BottomNav } from "./_shell/bottom-nav";
import { CommandPalette } from "./_shell/command-palette";
import { CreateFab } from "./_shell/create-fab";
import { TopBar } from "./_shell/top-bar";
import { NAV_DESTINATIONS, type NavId, type Role } from "./_shell/nav";

import { NowScreen } from "./_shell/screens/now-screen";
import { PlayScreen } from "./_shell/screens/play-screen";
import { WorldScreen } from "./_shell/screens/world-screen";
import { PartyScreen } from "./_shell/screens/party-screen";
import { MoreScreen } from "./_shell/screens/more-screen";

const TITLES: Record<NavId, string> = {
  now: "Now",
  play: "Play",
  world: "World",
  party: "Party",
  more: "More",
};

const SUBTITLES: Record<NavId, string> = {
  now: "Today's campaign",
  play: "At the table",
  world: "NPCs · Quests · Locations · Lore",
  party: "Characters, sessions, schedule",
  more: "Reference, settings, DM tools",
};

/**
 * Clickable end-to-end prototype of the proposed Delve shell:
 *   • 5-tab bottom nav (Now / Play / World / Party / More)
 *   • global Cmd+K command palette indexing nav + sessions + entities + party + actions
 *   • g-then-letter keyboard navigation
 *   • role-aware (toggle via More → DM mode)
 *   • role-aware "+" FAB
 *   • Maps live inside Play (no /maps round-trip)
 *
 * Render at /preview/shell — use it on a phone-sized viewport for the
 * intended mobile-first experience.
 */
export default function Shell() {
  const [active, setActive] = useState<NavId>("now");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [role, setRole] = useState<Role>("dm");
  const { toast } = useToast();

  const handleSelect = useCallback((id: NavId) => {
    setActive(id);
  }, []);

  // Keyboard: Cmd/Ctrl+K opens palette; `g` then n/p/w/y/m navigates.
  const lastKey = useRef<string | null>(null);
  const lastKeyAt = useRef(0);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/i.test(e.target.tagName)) {
        return;
      }
      const now = Date.now();
      if (lastKey.current === "g" && now - lastKeyAt.current < 800) {
        const k = e.key.toLowerCase();
        const map: Record<string, NavId> = {
          n: "now",
          p: "play",
          w: "world",
          y: "party",
          m: "more",
        };
        if (map[k]) {
          e.preventDefault();
          setActive(map[k]);
          lastKey.current = null;
          return;
        }
      }
      if (e.key.toLowerCase() === "g") {
        lastKey.current = "g";
        lastKeyAt.current = now;
      } else {
        lastKey.current = null;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleAction = useCallback(
    (id: string) => {
      if (id.startsWith("go-")) {
        const nav = id.slice(3) as NavId;
        if (NAV_DESTINATIONS.some((d) => d.id === nav)) {
          setActive(nav);
          return;
        }
        if (id === "go-maps" || id === "go-ask") {
          setActive("play");
          toast({ title: id === "go-maps" ? "Maps opened" : "Ask opened" });
          return;
        }
      }
      if (id.startsWith("entity:")) {
        setActive("world");
        toast({ title: "Open entity", description: "Would route to /app/world/:id" });
        return;
      }
      if (id.startsWith("session:")) {
        setActive("party");
        toast({ title: "Open session", description: "Would route to /app/party/sessions/:id" });
        return;
      }
      if (id.startsWith("character:")) {
        setActive("party");
        toast({ title: "Open character", description: "Would route to /app/party/roster/:id" });
        return;
      }
      const labels: Record<string, string> = {
        "new-session": "New session sheet would open",
        "new-npc": "New NPC sheet would open",
        "new-quest": "New quest sheet would open",
        "new-location": "New location sheet would open",
        "roll-d20": "Rolled d20 → 14",
        "roll-adv": "Rolled 2d20kh1 → 19",
        "edit-asi": "Routes to Party → Me → ASI section",
        "resend-notif": "Session notification resent",
        "seed-srd": "Seed SRD job queued",
        "compare-editions": "Routes to More → Compare Editions",
      };
      toast({ title: labels[id] ?? "Action triggered" });
    },
    [toast],
  );

  const fabHidden = active === "play" || active === "more";

  const screen = useMemo(() => {
    switch (active) {
      case "now":
        return <NowScreen role={role} />;
      case "play":
        return <PlayScreen />;
      case "world":
        return <WorldScreen />;
      case "party":
        return <PartyScreen role={role} />;
      case "more":
        return <MoreScreen role={role} onToggleRole={() => setRole((r) => (r === "dm" ? "player" : "dm"))} />;
    }
  }, [active, role]);

  return (
    <div className="dark min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col pb-20">
        <TopBar
          title={TITLES[active]}
          subtitle={SUBTITLES[active]}
          onSearch={() => setPaletteOpen(true)}
          onCreate={() => handleAction(`new-${active === "party" ? "session" : active === "world" ? "npc" : "session"}`)}
          role={role}
          hideCreate={active === "more"}
        />
        <main className="flex-1 overflow-auto">{screen}</main>
      </div>

      <CreateFab
        hidden={fabHidden}
        onClick={() => handleAction(active === "world" ? "new-npc" : "new-session")}
      />
      <BottomNav active={active} onSelect={handleSelect} />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        role={role}
        onAction={handleAction}
      />

      <Toaster />
    </div>
  );
}

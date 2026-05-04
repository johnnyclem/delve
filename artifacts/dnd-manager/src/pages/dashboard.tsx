import { useState } from "react";
import { useUser } from "@clerk/react";
import {
  Sword, BookOpen, Dice5, Calendar, ScrollText, Menu, X,
  LogOut, ChevronRight, Users, Sparkles, Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetDashboard } from "@workspace/api-client-react";
import type { DashboardSummary, PartyMemberSummary, DiceRoll } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import DiceRollerPanel from "@/components/dice-roller";
import CharacterListPanel from "@/components/character-list";
import SessionsPanel from "@/components/sessions-panel";
import CalendarPanel from "@/components/calendar-panel";
import { useClerk } from "@clerk/react";
import { useToast } from "@/hooks/use-toast";

const navItems = [
  { id: "overview", label: "Overview", icon: Shield },
  { id: "characters", label: "Characters", icon: BookOpen },
  { id: "sessions", label: "Sessions", icon: ScrollText },
  { id: "calendar", label: "Schedule", icon: Calendar },
  { id: "dice", label: "Dice", icon: Dice5 },
];

export default function DashboardPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [activeTab, setActiveTab] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: dashboard, isLoading, error } = useGetDashboard();

  const handleSignOut = () => {
    signOut();
  };

  const needsInvite = error && (error as { status?: number }).status === 403;

  if (needsInvite) {
    return <JoinCampaignPage />;
  }

  return (
    <div className="dark min-h-[100dvh] bg-background flex" data-testid="page-dashboard">
      <aside className="hidden md:flex flex-col w-64 border-r border-border/40 bg-sidebar p-4 shrink-0">
        <div className="flex items-center gap-2 mb-8 px-2">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Logo" className="h-8 w-8" />
          <span className="font-serif text-base font-semibold text-sidebar-foreground">Campaign Manager</span>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              data-testid={`nav-${item.id}`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-border/30 pt-4 mt-4">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-semibold">
              {user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate" data-testid="text-username">
                {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress ?? "Adventurer"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={handleSignOut} data-testid="button-sign-out">
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border/40 bg-background/95 backdrop-blur-sm sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Logo" className="h-7 w-7" />
            <span className="font-serif text-sm font-semibold text-foreground">Campaign</span>
          </div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} data-testid="button-mobile-menu" className="text-foreground p-1">
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>

        {mobileMenuOpen && (
          <div className="md:hidden absolute top-14 left-0 right-0 bg-background border-b border-border/40 z-30 p-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                data-testid={`mobile-nav-${item.id}`}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === item.id
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/70 hover:bg-accent/50"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground mt-2" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        )}

        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          {activeTab === "overview" && <OverviewPanel dashboard={dashboard as DashboardSummary & { inviteCode?: string }} isLoading={isLoading} onNavigate={setActiveTab} />}
          {activeTab === "characters" && <CharacterListPanel />}
          {activeTab === "sessions" && <SessionsPanel />}
          {activeTab === "calendar" && <CalendarPanel />}
          {activeTab === "dice" && <DiceRollerPanel />}
        </main>
      </div>
    </div>
  );
}

function JoinCampaignPage() {
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const { toast } = useToast();
  const { signOut } = useClerk();

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setJoining(true);
    setJoinError("");

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/members/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to join" }));
        setJoinError(data.error ?? "Failed to join");
        return;
      }

      toast({ title: "Welcome to the campaign!" });
      window.location.reload();
    } catch {
      setJoinError("Network error");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="dark min-h-[100dvh] bg-background flex items-center justify-center px-4" data-testid="page-join">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Logo" className="h-16 w-16 mx-auto mb-4" />
          <h1 className="font-serif text-3xl font-bold text-foreground">Join the Campaign</h1>
          <p className="text-muted-foreground mt-2">Enter the invite code from your DM to join the campaign.</p>
        </div>

        <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Invite Code</label>
            <Input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3D4"
              className="font-mono text-center text-lg tracking-widest"
              maxLength={8}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              data-testid="input-invite-code"
            />
          </div>
          {joinError && (
            <p className="text-sm text-destructive" data-testid="text-join-error">{joinError}</p>
          )}
          <Button className="w-full" onClick={handleJoin} disabled={joining || !inviteCode.trim()} data-testid="button-join">
            {joining ? "Joining..." : "Join Campaign"}
          </Button>
        </div>

        <div className="text-center">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => signOut()}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}

function OverviewPanel({ dashboard, isLoading, onNavigate }: { dashboard: (DashboardSummary & { inviteCode?: string }) | undefined; isLoading: boolean; onNavigate: (tab: string) => void }) {
  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="overview-loading">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="overview-panel">
      <div>
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground" data-testid="text-campaign-name">
          {dashboard?.campaign?.name ?? "Your Campaign"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {dashboard?.totalSessions ?? 0} sessions played
        </p>
      </div>

      {dashboard?.inviteCode && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Invite Code</p>
            <p className="text-xs text-muted-foreground">Share with players to join</p>
          </div>
          <span className="font-mono text-lg font-bold text-primary tracking-widest" data-testid="text-invite-code">{dashboard.inviteCode}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <button onClick={() => onNavigate("calendar")} className="text-left rounded-xl border border-border/50 bg-card p-5 hover:border-primary/30 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <Calendar className="h-5 w-5 text-primary" />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-card-foreground text-sm">Next Session</h3>
          {dashboard?.nextEvent ? (
            <p className="text-muted-foreground text-xs mt-1">
              {new Date(dashboard.nextEvent.proposedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              {" — "}{dashboard.nextEvent.title}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs mt-1">No upcoming sessions</p>
          )}
        </button>

        <button onClick={() => onNavigate("characters")} className="text-left rounded-xl border border-border/50 bg-card p-5 hover:border-primary/30 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <Users className="h-5 w-5 text-primary" />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-card-foreground text-sm">Party ({dashboard?.partyMembers?.length ?? 0})</h3>
          <div className="text-muted-foreground text-xs mt-1 space-y-0.5">
            {dashboard?.partyMembers?.slice(0, 3).map((m: PartyMemberSummary) => (
              <p key={m.userId}>{m.displayName}{m.characterName ? ` — ${m.characterName}` : ""}</p>
            ))}
          </div>
        </button>

        <button onClick={() => onNavigate("sessions")} className="text-left rounded-xl border border-border/50 bg-card p-5 hover:border-primary/30 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-card-foreground text-sm">Latest Recap</h3>
          {dashboard?.latestRecap?.recapMd ? (
            <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
              Session {dashboard.latestRecap.sessionNumber}: {dashboard.latestRecap.title}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs mt-1">No recaps yet</p>
          )}
        </button>
      </div>

      {dashboard?.recentRolls && dashboard.recentRolls.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-card-foreground text-sm flex items-center gap-2">
              <Dice5 className="h-4 w-4 text-primary" />
              Recent Rolls
            </h3>
            <button onClick={() => onNavigate("dice")} className="text-xs text-primary hover:underline" data-testid="link-all-rolls">
              View all
            </button>
          </div>
          <div className="space-y-2">
            {dashboard.recentRolls.slice(0, 5).map((roll: DiceRoll) => (
              <div key={roll.id} className="flex items-center justify-between text-sm" data-testid={`roll-${roll.id}`}>
                <span className="text-muted-foreground">
                  {roll.displayName} rolled <span className="font-mono text-foreground">{roll.expression}</span>
                  {roll.label ? ` (${roll.label})` : ""}
                </span>
                <span className="font-mono font-bold text-foreground">{roll.result}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

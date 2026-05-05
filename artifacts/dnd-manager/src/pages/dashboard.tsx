import { useState } from "react";
import { useUser } from "@clerk/react";
import {
  Sword, BookOpen, Dice5, Calendar, ScrollText, Menu, X,
  LogOut, ChevronRight, Users, Sparkles, Shield
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetDashboard, useListSessions, useGetMyMembership } from "@workspace/api-client-react";
import type { DashboardSummary, PartyMemberSummary, DiceRoll } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import DiceRollerPanel from "@/components/dice-roller";
import CharacterListPanel from "@/components/character-list";
import SessionsPanel from "@/components/sessions-panel";
import CalendarPanel from "@/components/calendar-panel";
import { useClerk } from "@clerk/react";
import { useToast } from "@/hooks/use-toast";
import { AnimatedBorder } from "@/components/ui/animated-border";

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
  const { data: sessions } = useListSessions();
  const { data: membership } = useGetMyMembership();
  const isDm = membership?.role === "dm";
  const newRecapCount = membership && !isDm && sessions
    ? sessions.filter(s => s.hasNewRecap).length
    : 0;

  const handleSignOut = () => {
    signOut();
  };

  const needsInvite = error && (error as { status?: number }).status === 403;

  if (needsInvite) {
    return <JoinCampaignPage />;
  }

  return (
    <div className="dark min-h-[100dvh] bg-[#09090B] flex" data-testid="page-dashboard">
      <aside className="hidden md:flex flex-col w-64 border-r border-[rgba(255,255,255,0.06)] bg-[#09090B] p-4 shrink-0">
        <div className="flex items-center gap-2 mb-8 px-2">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Delve" className="h-8 w-8" />
          <span className="text-base font-semibold text-foreground tracking-tight">Delve</span>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <motion.button
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              data-testid={`nav-${item.id}`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.id
                  ? "glass-panel text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-[rgba(255,255,255,0.04)]"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.id === "sessions" && newRecapCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-black min-w-[18px]" data-testid="badge-new-recap-count">
                  {newRecapCount}
                </span>
              )}
            </motion.button>
          ))}
        </nav>
        <div className="border-t border-[rgba(255,255,255,0.06)] pt-4 mt-4">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-semibold">
              {user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate" data-testid="text-username">
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
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[rgba(255,255,255,0.06)] bg-[#09090B]/95 backdrop-blur-sm sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Delve" className="h-7 w-7" />
            <span className="text-sm font-semibold text-foreground tracking-tight">Delve</span>
          </div>
          <motion.button whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 17 }} onClick={() => setMobileMenuOpen(!mobileMenuOpen)} data-testid="button-mobile-menu" className="text-foreground p-1">
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </motion.button>
        </header>

        {mobileMenuOpen && (
          <div className="md:hidden absolute top-14 left-0 right-0 bg-[#09090B] border-b border-[rgba(255,255,255,0.06)] z-30 p-3 space-y-1 backdrop-blur-xl">
            {navItems.map((item) => (
              <motion.button
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                key={item.id}
                onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                data-testid={`mobile-nav-${item.id}`}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === item.id
                    ? "glass-panel text-foreground"
                    : "text-muted-foreground hover:bg-[rgba(255,255,255,0.04)]"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.id === "sessions" && newRecapCount > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-black min-w-[18px]" data-testid="badge-new-recap-count-mobile">
                    {newRecapCount}
                  </span>
                )}
              </motion.button>
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
    <div className="dark min-h-[100dvh] bg-[#09090B] flex items-center justify-center px-4" data-testid="page-join">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Delve" className="h-16 w-16 mx-auto mb-4" />
          <h1 className="text-3xl font-semibold text-foreground">Join the Campaign</h1>
          <p className="text-muted-foreground mt-2">Enter the invite code from your DM to join the campaign.</p>
        </div>

        <div className="rounded-2xl glass-panel p-6 space-y-4">
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
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="overview-panel">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight" data-testid="text-campaign-name">
          {dashboard?.campaign?.name ?? "Your Campaign"}
        </h1>
      </div>

      {dashboard?.inviteCode && (
        <AnimatedBorder className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Invite Code</p>
            <p className="text-xs text-muted-foreground">Share with players to join</p>
          </div>
          <span className="font-mono text-lg font-bold text-primary tracking-widest tabular-nums" data-testid="text-invite-code">{dashboard.inviteCode}</span>
        </AnimatedBorder>
      )}

      <motion.button
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        onClick={() => onNavigate("sessions")}
        className="w-full text-left rounded-2xl glass-panel-hover p-5"
        data-testid="card-session-stats"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" />
            Sessions
          </h3>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex gap-6">
          <div>
            <p className="text-2xl font-bold text-foreground font-mono tabular-nums" data-testid="text-total-sessions">{dashboard?.totalSessions ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">sessions played</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground font-mono tabular-nums" data-testid="text-recap-count">{dashboard?.recapCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">recaps available</p>
          </div>
          {(dashboard?.recapCount ?? 0) > 0 && (
            <div>
              <p className="text-2xl font-bold text-foreground font-mono tabular-nums" data-testid="text-avg-recap-words">{dashboard?.avgRecapWordCount ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">avg words / recap</p>
            </div>
          )}
        </div>
      </motion.button>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <motion.button whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 17 }} onClick={() => onNavigate("calendar")} className="text-left">
          <AnimatedBorder className="p-5">
            <div className="flex items-center justify-between mb-3">
              <Calendar className="h-5 w-5 text-primary" />
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground text-sm">Next Session</h3>
            {dashboard?.nextEvent ? (
              <p className="text-muted-foreground text-xs mt-1">
                {new Date(dashboard.nextEvent.proposedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                {" — "}{dashboard.nextEvent.title}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs mt-1">No upcoming sessions</p>
            )}
          </AnimatedBorder>
        </motion.button>

        <motion.button whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 17 }} onClick={() => onNavigate("characters")} className="text-left rounded-2xl glass-panel-hover p-5">
          <div className="flex items-center justify-between mb-3">
            <Users className="h-5 w-5 text-primary" />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground text-sm">Party (<span className="font-mono tabular-nums">{dashboard?.partyMembers?.length ?? 0}</span>)</h3>
          <div className="text-muted-foreground text-xs mt-1 space-y-0.5">
            {dashboard?.partyMembers?.slice(0, 3).map((m: PartyMemberSummary) => (
              <p key={m.userId}>{m.displayName}{m.characterName ? ` — ${m.characterName}` : ""}</p>
            ))}
          </div>
        </motion.button>

        <motion.button whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 17 }} onClick={() => onNavigate("sessions")} className="text-left rounded-2xl glass-panel-hover p-5">
          <div className="flex items-center justify-between mb-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground text-sm">Latest Recap</h3>
          {dashboard?.latestRecap?.recapMd ? (
            <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
              Session <span className="font-mono tabular-nums">{dashboard.latestRecap.sessionNumber}</span>: {dashboard.latestRecap.title}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs mt-1">No recaps yet</p>
          )}
        </motion.button>
      </div>

      {dashboard?.recentRolls && dashboard.recentRolls.length > 0 && (
        <div className="rounded-2xl glass-panel p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Dice5 className="h-4 w-4 text-primary" />
              Recent Rolls
            </h3>
            <motion.button whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 17 }} onClick={() => onNavigate("dice")} className="text-xs text-primary hover:underline" data-testid="link-all-rolls">
              View all
            </motion.button>
          </div>
          <div className="space-y-2">
            {dashboard.recentRolls.slice(0, 5).map((roll: DiceRoll) => (
              <div key={roll.id} className="flex items-center justify-between text-sm" data-testid={`roll-${roll.id}`}>
                <span className="text-muted-foreground">
                  {roll.displayName} rolled <span className="font-mono text-foreground">{roll.expression}</span>
                  {roll.label ? ` (${roll.label})` : ""}
                </span>
                <span className="font-mono font-bold text-foreground tabular-nums">{roll.result}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

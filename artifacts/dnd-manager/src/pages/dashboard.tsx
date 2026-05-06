import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/react";
import {
  Sword, BookOpen, Dice5, Calendar, ScrollText, Menu, X,
  LogOut, ChevronRight, Users, Sparkles, Shield, Mail, Globe, User
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useGetDashboard, useListSessions, useListEvents, useGetMyMembership, useUpdateNotificationPrefs, useListCharacters } from "@workspace/api-client-react";
import type { DashboardSummary, PartyMemberSummary, DiceRoll, SessionTrendPoint, CalendarEvent, Character } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import DiceRollerPanel from "@/components/dice-roller";
import TimezoneCombobox from "@/components/timezone-combobox";
import CharacterListPanel from "@/components/character-list";
import MyCharacterPanel from "@/components/my-character-panel";
import SessionsPanel from "@/components/sessions-panel";
import CalendarPanel from "@/components/calendar-panel";
import { useClerk } from "@clerk/react";
import { useToast } from "@/hooks/use-toast";
import { AnimatedBorder } from "@/components/ui/animated-border";
import { useQueryClient } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type NavId = "my-character" | "overview" | "characters" | "sessions" | "calendar" | "dice";

interface NavItem {
  id: NavId;
  label: string;
  icon: typeof Shield;
  hidden?: boolean;
}

function buildNavItems(opts: { showMyCharacter: boolean }): NavItem[] {
  const items: NavItem[] = [];
  if (opts.showMyCharacter) {
    items.push({ id: "my-character", label: "My Character", icon: User });
  }
  items.push(
    { id: "overview", label: "Overview", icon: Shield },
    { id: "characters", label: "Characters", icon: BookOpen },
    { id: "sessions", label: "Sessions", icon: ScrollText },
    { id: "calendar", label: "Schedule", icon: Calendar },
    { id: "dice", label: "Dice", icon: Dice5 },
  );
  return items;
}

export default function DashboardPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [activeTab, setActiveTabState] = useState<NavId>("overview");
  const [hasAutoLanded, setHasAutoLanded] = useState(false);
  // Wraps setActiveTab so any user-initiated navigation locks out the auto-land effect.
  const setActiveTab = (next: NavId) => {
    setHasAutoLanded(true);
    setActiveTabState(next);
  };
  const [calendarDeepLink, setCalendarDeepLink] = useState<{ eventId: number; scrollToDelivery?: boolean } | null>(null);
  // Clear the deep-link when the user navigates away from Calendar so that a later
  // return to the Calendar tab shows the list view rather than auto-reopening the
  // previously deep-linked event. The CalendarPanel's `key` prop ensures a fresh
  // mount per deep-link, so this clear doesn't disturb the current view.
  useEffect(() => {
    if (activeTab !== "calendar" && calendarDeepLink) {
      setCalendarDeepLink(null);
    }
  }, [activeTab, calendarDeepLink]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: dashboard, isLoading, error } = useGetDashboard();
  const { data: sessions } = useListSessions();
  const { data: membership } = useGetMyMembership();
  const { data: characters } = useListCharacters({ query: { enabled: !!membership, queryKey: ["/api/characters"] } });
  const updateNotificationPrefs = useUpdateNotificationPrefs();
  const queryClient = useQueryClient();
  const isDm = membership?.role === "dm";
  const hasOwnCharacter = !!user && !!characters && (characters as Character[]).some((c) => c.ownerUserId === user.id);
  const showMyCharacterTab = !!membership && !isDm;
  const navItems = useMemo(() => buildNavItems({ showMyCharacter: showMyCharacterTab }), [showMyCharacterTab]);

  // On first successful load, land non-DM players on "My Character" — whether they
  // already own a character (where it shows their sheet) or not (where MyCharacterPanel
  // renders the create-CTA empty state). DMs are unaffected and stay on Overview.
  // Uses the raw setter (not the wrapped setActiveTab) so this doesn't itself flip the
  // lock before the membership/characters queries resolve.
  useEffect(() => {
    if (hasAutoLanded) return;
    if (!membership || !characters) return;
    if (showMyCharacterTab) {
      setActiveTabState("my-character");
    }
    setHasAutoLanded(true);
  }, [hasAutoLanded, membership, characters, showMyCharacterTab]);
  const { data: events } = useListEvents({ query: { enabled: !!isDm, queryKey: ["/api/calendar"] } });
  const newRecapCount = membership && !isDm && sessions
    ? sessions.filter(s => s.hasNewRecap).length
    : 0;
  const upcomingDeliveryFailureCount = isDm && events
    ? (events as Array<CalendarEvent & { deliveryStatus?: { hasFailures?: boolean } }>)
        .filter(ev => ev.status !== "cancelled" && new Date(ev.proposedAt) >= new Date() && ev.deliveryStatus?.hasFailures)
        .length
    : 0;

  const handleSignOut = () => {
    signOut();
  };

  const handleToggleEmailNotifications = (checked: boolean) => {
    updateNotificationPrefs.mutate(
      { data: { emailNotifications: checked } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/members/me"] });
        },
      },
    );
  };

  const handleChangeTimezone = (tz: string) => {
    updateNotificationPrefs.mutate(
      { data: { emailNotifications: membership?.emailNotifications ?? false, timezone: tz } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/members/me"] });
        },
      },
    );
  };

  const browserTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );
  const supportedTimezones = useMemo<string[]>(() => {
    try {
      const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
      if (typeof fn === "function") return fn("timeZone");
    } catch { /* ignore */ }
    return [browserTimezone, "UTC"];
  }, [browserTimezone]);

  useEffect(() => {
    if (membership && membership.timezone == null && !updateNotificationPrefs.isPending) {
      handleChangeTimezone(browserTimezone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership?.id, membership?.timezone]);

  const currentTimezone = membership?.timezone ?? browserTimezone;

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
              onClick={() => setActiveTab(item.id as NavId)}
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
              {item.id === "calendar" && upcomingDeliveryFailureCount > 0 && (
                <span
                  className="ml-auto inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white min-w-[18px]"
                  title={`${upcomingDeliveryFailureCount} upcoming session${upcomingDeliveryFailureCount === 1 ? "" : "s"} with invite delivery failures`}
                  data-testid="badge-delivery-failure-count"
                >
                  {upcomingDeliveryFailureCount}
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
          <label className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[rgba(255,255,255,0.04)] cursor-pointer transition-colors" data-testid="label-email-notifications">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              Recap emails
            </span>
            <Switch
              checked={membership?.emailNotifications ?? false}
              onCheckedChange={handleToggleEmailNotifications}
              disabled={updateNotificationPrefs.isPending}
              data-testid="switch-email-notifications"
            />
          </label>
          <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors" data-testid="label-timezone">
            <span className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
              <Globe className="h-4 w-4" />
              Your timezone
            </span>
            <TimezoneCombobox
              value={currentTimezone}
              onChange={handleChangeTimezone}
              options={supportedTimezones}
              disabled={updateNotificationPrefs.isPending}
              testId="select-timezone"
            />
          </label>
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
                onClick={() => { setActiveTab(item.id as NavId); setMobileMenuOpen(false); }}
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
                {item.id === "calendar" && upcomingDeliveryFailureCount > 0 && (
                  <span
                    className="ml-auto inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white min-w-[18px]"
                    title={`${upcomingDeliveryFailureCount} upcoming session${upcomingDeliveryFailureCount === 1 ? "" : "s"} with invite delivery failures`}
                    data-testid="badge-delivery-failure-count-mobile"
                  >
                    {upcomingDeliveryFailureCount}
                  </span>
                )}
              </motion.button>
            ))}
            <label className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[rgba(255,255,255,0.04)] cursor-pointer transition-colors mt-2">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                Recap emails
              </span>
              <Switch
                checked={membership?.emailNotifications ?? false}
                onCheckedChange={handleToggleEmailNotifications}
                disabled={updateNotificationPrefs.isPending}
              />
            </label>
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors">
              <span className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                <Globe className="h-4 w-4" />
                Your timezone
              </span>
              <TimezoneCombobox
                value={currentTimezone}
                onChange={handleChangeTimezone}
                options={supportedTimezones}
                disabled={updateNotificationPrefs.isPending}
                triggerClassName="max-w-[160px]"
                testId="select-timezone-mobile"
              />
            </div>
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground mt-1" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        )}

        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          {activeTab === "overview" && (
            <OverviewPanel
              dashboard={dashboard as DashboardSummary & { inviteCode?: string }}
              isLoading={isLoading}
              isDm={isDm}
              onNavigate={setActiveTab}
              onOpenEvent={(eventId, opts) => {
                setCalendarDeepLink({ eventId, scrollToDelivery: opts?.scrollToDelivery });
                setActiveTab("calendar");
              }}
            />
          )}
          {activeTab === "my-character" && (
            <MyCharacterPanel onNavigateToCharacters={() => setActiveTab("characters")} />
          )}
          {activeTab === "characters" && <CharacterListPanel />}
          {activeTab === "sessions" && <SessionsPanel />}
          {activeTab === "calendar" && (
            <CalendarPanel
              key={calendarDeepLink ? `${calendarDeepLink.eventId}-${calendarDeepLink.scrollToDelivery ? "d" : ""}` : "list"}
              initialEventId={calendarDeepLink?.eventId ?? null}
              initialScrollToDelivery={calendarDeepLink?.scrollToDelivery}
            />
          )}
          {activeTab === "dice" && <DiceRollerPanel />}
        </main>
      </div>
    </div>
  );
}

function JoinCampaignPage() {
  const [inviteCode, setInviteCode] = useState("");
  const [adminToken, setAdminToken] = useState("");
  const [joining, setJoining] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [claimError, setClaimError] = useState("");
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

  const handleClaimDm = async () => {
    if (!adminToken.trim()) return;
    setClaiming(true);
    setClaimError("");

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/admin/claim-dm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": adminToken.trim() },
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to claim DM" }));
        setClaimError(data.error ?? "Failed to claim DM");
        return;
      }

      toast({ title: "You are now a DM!" });
      window.location.reload();
    } catch {
      setClaimError("Network error");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="dark min-h-[100dvh] bg-[#09090B] flex items-center justify-center px-4 py-8" data-testid="page-join">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Delve" className="h-16 w-16 mx-auto mb-4" />
          <h1 className="text-3xl font-semibold text-foreground">Join the Campaign</h1>
          <p className="text-muted-foreground mt-2">Enter the invite code from your DM, or use an admin token to start as DM.</p>
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

        <div className="rounded-2xl glass-panel p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Admin Token (DM)</label>
            <p className="text-xs text-muted-foreground mb-2">Have an admin token? Become a DM of the campaign.</p>
            <Input
              type="password"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              placeholder="Paste admin token"
              className="font-mono"
              onKeyDown={(e) => e.key === "Enter" && handleClaimDm()}
              data-testid="input-admin-token"
            />
          </div>
          {claimError && (
            <p className="text-sm text-destructive" data-testid="text-claim-error">{claimError}</p>
          )}
          <Button variant="secondary" className="w-full" onClick={handleClaimDm} disabled={claiming || !adminToken.trim()} data-testid="button-claim-dm">
            {claiming ? "Claiming..." : "Become DM"}
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

function SessionTrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#18181B] px-3 py-2 shadow-xl">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground font-mono tabular-nums">
        {payload[0].value} {payload[0].value === 1 ? "session" : "sessions"}
      </p>
    </div>
  );
}

function SessionTrendChart({ data }: { data: SessionTrendPoint[] }) {
  const shortLabels = data.map((d) => {
    const parts = d.month.split(" ");
    return { ...d, label: parts[0] };
  });

  return (
    <div className="mt-4 -mx-1" data-testid="session-trend-chart">
      <p className="text-xs text-muted-foreground mb-2">Sessions per month</p>
      <div className="h-[100px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={shortLabels} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip content={<SessionTrendTooltip />} cursor={false} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#trendFill)"
              dot={false}
              activeDot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function OverviewPanel({ dashboard, isLoading, isDm, onNavigate, onOpenEvent }: { dashboard: (DashboardSummary & { inviteCode?: string }) | undefined; isLoading: boolean; isDm: boolean; onNavigate: (tab: NavId) => void; onOpenEvent: (eventId: number, opts?: { scrollToDelivery?: boolean }) => void }) {
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

      <button
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
        {(dashboard?.recapCount ?? 0) > 0 && dashboard?.recapLengthBreakdown && (
          <div className="mt-3 flex flex-wrap gap-2" data-testid="recap-length-breakdown" title="Short: <100 words • Medium: 100–300 • Long: 300+">
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono tabular-nums" data-testid="text-recap-short">
              {dashboard.recapLengthBreakdown.short} short
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono tabular-nums" data-testid="text-recap-medium">
              {dashboard.recapLengthBreakdown.medium} medium
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono tabular-nums" data-testid="text-recap-long">
              {dashboard.recapLengthBreakdown.long} long
            </span>
          </div>
        )}
        {dashboard?.sessionTrend && dashboard.sessionTrend.length > 0 && (
          <SessionTrendChart data={dashboard.sessionTrend} />
        )}
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <motion.button
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          onClick={() => {
            if (dashboard?.nextEvent) onOpenEvent(dashboard.nextEvent.id);
            else onNavigate("calendar");
          }}
          className="text-left"
          data-testid="card-next-session"
        >
          <AnimatedBorder className="p-5" interactive speed="slow">
            <div className="flex items-center justify-between mb-3">
              <Calendar className="h-5 w-5 text-primary" />
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground text-sm">Next Session</h3>
              {isDm && dashboard?.nextEvent?.deliveryStatus?.hasFailures && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (dashboard.nextEvent) onOpenEvent(dashboard.nextEvent.id, { scrollToDelivery: true });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      if (dashboard.nextEvent) onOpenEvent(dashboard.nextEvent.id, { scrollToDelivery: true });
                    }
                  }}
                  title={`${dashboard.nextEvent.deliveryStatus.failedCount} invite${dashboard.nextEvent.deliveryStatus.failedCount === 1 ? "" : "s"} failed to send. Click to review delivery.`}
                  className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 cursor-pointer"
                  data-testid="badge-next-session-delivery-issue"
                >
                  <Mail className="h-2.5 w-2.5" />
                  Delivery issue
                </span>
              )}
            </div>
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

        <button onClick={() => onNavigate("characters")} className="text-left rounded-2xl glass-panel-hover p-5">
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
        </button>

        <button onClick={() => onNavigate("sessions")} className="text-left rounded-2xl glass-panel-hover p-5">
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
        </button>
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

import { useEffect, useMemo, useState, useCallback } from "react";
import { useUser } from "@clerk/react";
import {
  LogOut, ChevronRight, Shield, Mail, Globe, User,
  Swords, GitCompare, Users, Copy, X, RotateCcw,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@workspace/ui";
import { Switch } from "@workspace/ui";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui";
import { useGetDashboard, useListSessions, useListEvents, useGetMyMembership, useUpdateNotificationPrefs, useListCharacters, getGetMyMembershipQueryKey } from "@workspace/api-client-react";
import type { DashboardSummary, CalendarEvent, Character } from "@workspace/api-client-react";
import TimezoneCombobox from "@/components/timezone-combobox";
import CharacterListPanel from "@/components/character-list";
import NpcsPanel from "@/components/npcs-panel";
import MyCharacterPanel from "@/components/my-character-panel";
import SessionsPanel from "@/components/sessions-panel";
import CalendarPanel from "@/components/calendar-panel";
import RulesLookupPanel from "@/components/rules-lookup";
import BestiaryPanel from "@/components/bestiary-panel";
import WorldPanel from "@/components/world-panel";
import ChatPanel from "@/components/chat-panel";
import HomebrewPanel from "@/components/homebrew-panel";
import CompareEditionsPanel from "@/components/compare-editions";
import DiceRollerPanel from "@/components/dice-roller";
import { useClerk } from "@clerk/react";
import { useToast } from "@workspace/ui";
import { useQueryClient } from "@tanstack/react-query";
import { ChatNavContext } from "@/contexts/chat-nav-context";
import { TriadTabBar, TRIAD_INTENDED_GROUP_KEY } from "@/components/triad-tab-bar";
import type { TriadGroup } from "@/components/triad-tab-bar";
import { SubNavStrip } from "@/components/dashboard/sub-nav-strip";
import { OverviewPanel } from "@/components/dashboard/overview-panel";
import {
  navItem, type NavId, getGroupForTab, getOrderedGroupItems,
  getPinnedItems, readLastSubNav, writeLastSubNav,
  readIntendedGroup, clearIntendedGroup, useDmMode,
  readGroupOrder, writeGroupOrder, clearGroupOrder,
} from "@/components/dashboard/nav-utils";
import JoinCampaignPage from "@/pages/join-campaign";

export default function DashboardPage() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTabState] = useState<NavId>("overview");
  const [hasAutoLanded, setHasAutoLanded] = useState(false);
  const [dmMode, setDmMode] = useDmMode(user?.id);
  const [profileOpen, setProfileOpen] = useState(false);
  const [orderVersion, setOrderVersion] = useState(0);
  const bumpOrderVersion = useCallback(() => setOrderVersion((v) => v + 1), []);

  const setActiveTab = (next: NavId) => {
    setHasAutoLanded(true);
    if (next === "maps") {
      writeLastSubNav("table", "maps");
      setLocation("/maps");
      return;
    }
    const group = getGroupForTab(next);
    writeLastSubNav(group, next);
    setActiveTabState(next);
  };

  const [chatInitConversationId, setChatInitConversationId] = useState<number | null>(null);
  const openWithConversation = useCallback(
    (id: number | null) => {
      setChatInitConversationId(id);
      setHasAutoLanded(true);
      writeLastSubNav("table", "chat");
      setActiveTabState("chat");
    },
    [],
  );

  const { data: dashboard, isLoading, error } = useGetDashboard();
  const { data: sessions } = useListSessions();
  const { data: membership } = useGetMyMembership();
  const { data: characters } = useListCharacters({ query: { enabled: !!membership, queryKey: ["/api/characters"] } });
  const updateNotificationPrefs = useUpdateNotificationPrefs();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isDm = membership?.role === "dm";
  const inviteCode = (dashboard as (DashboardSummary & { inviteCode?: string }) | undefined)?.inviteCode;
  const showMyCharacterTab = !!membership && !isDm;

  const handleTriadTabClick = useCallback((group: TriadGroup) => {
    setHasAutoLanded(true);
    const items = getOrderedGroupItems(group, showMyCharacterTab, isDm);
    const lastNav = readLastSubNav();
    const lastItem = lastNav[group];
    if (lastItem === "maps" && group === "table") {
      writeLastSubNav("table", "maps");
      setLocation("/maps");
      return;
    }
    const validLast = lastItem && items.includes(lastItem) && lastItem !== "maps" ? lastItem : null;
    const firstNonMaps = items.find((i) => i !== "maps") ?? items[0];
    const target = validLast ?? firstNonMaps;
    setActiveTabState(target as NavId);
  }, [showMyCharacterTab, isDm, setLocation]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      const code = e.code;
      const key = e.key;
      const isOne = key === "1" || code === "Digit1";
      const isTwo = key === "2" || code === "Digit2";
      const isThree = key === "3" || code === "Digit3";
      if (!isOne && !isTwo && !isThree) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
        if (target.closest('[role="dialog"], [role="textbox"], [contenteditable="true"]')) return;
      }
      const group: TriadGroup = isOne ? "active" : isTwo ? "table" : "library";
      e.preventDefault();
      handleTriadTabClick(group);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleTriadTabClick]);

  const [calendarDeepLink, setCalendarDeepLink] = useState<{ eventId: number; scrollToDelivery?: boolean } | null>(null);
  useEffect(() => {
    if (activeTab !== "calendar" && calendarDeepLink) setCalendarDeepLink(null);
  }, [activeTab, calendarDeepLink]);

  useEffect(() => {
    if (hasAutoLanded) return;
    if (!membership || !characters) return;
    const intendedGroup = readIntendedGroup();
    if (intendedGroup) {
      clearIntendedGroup();
      const items = getOrderedGroupItems(intendedGroup, !!membership && !isDm, isDm);
      const lastNav = readLastSubNav();
      const lastItem = lastNav[intendedGroup];
      const validLast = lastItem && items.includes(lastItem) && lastItem !== "maps" ? lastItem : null;
      const firstNonMaps = items.find((i) => i !== "maps") ?? items[0];
      setActiveTabState((validLast ?? firstNonMaps) as NavId);
      setHasAutoLanded(true);
      return;
    }
    if (showMyCharacterTab) {
      setActiveTabState("my-character");
      writeLastSubNav("library", "my-character");
    }
    setHasAutoLanded(true);
  }, [hasAutoLanded, membership, characters, showMyCharacterTab, isDm]);

  const { data: events } = useListEvents({ query: { enabled: !!isDm, queryKey: ["/api/calendar"] } });
  const newRecapCount = membership && !isDm && sessions
    ? sessions.filter(s => s.hasNewRecap).length : 0;
  const upcomingDeliveryFailureCount = isDm && events
    ? (events as Array<CalendarEvent & { deliveryStatus?: { hasFailures?: boolean } }>)
        .filter(ev => ev.status !== "cancelled" && new Date(ev.proposedAt) >= new Date() && ev.deliveryStatus?.hasFailures)
        .length : 0;

  const handleSignOut = () => { signOut(); };
  const handleToggleEmailNotifications = (checked: boolean) => {
    updateNotificationPrefs.mutate(
      { data: { emailNotifications: checked } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetMyMembershipQueryKey() }); } },
    );
  };

  const browserTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const supportedTimezones = useMemo<string[]>(() => {
    try {
      const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
      if (typeof fn === "function") return fn("timeZone");
    } catch { /* ignore */ }
    return [browserTimezone, "UTC"];
  }, [browserTimezone]);

  const handleChangeTimezone = (tz: string) => {
    updateNotificationPrefs.mutate(
      { data: { emailNotifications: membership?.emailNotifications ?? false, timezone: tz } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetMyMembershipQueryKey() }); } },
    );
  };

  useEffect(() => {
    if (membership && membership.timezone == null && !updateNotificationPrefs.isPending) {
      handleChangeTimezone(browserTimezone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership?.id, membership?.timezone]);

  const currentTimezone = membership?.timezone ?? browserTimezone;
  const activeGroup = getGroupForTab(activeTab);
  const groupItems = useMemo(
    () => getOrderedGroupItems(activeGroup, showMyCharacterTab, isDm),
    [activeGroup, showMyCharacterTab, isDm, orderVersion],
  );
  const hasCustomOrder = useMemo(() => readGroupOrder(activeGroup) !== null, [activeGroup, orderVersion]);
  const hasAnyCustomOrder = useMemo(
    () => readGroupOrder("active") !== null || readGroupOrder("table") !== null || readGroupOrder("library") !== null,
    [orderVersion],
  );

  const handleReorderGroup = useCallback(
    (group: TriadGroup, nextReorderable: NavId[]) => { writeGroupOrder(group, nextReorderable); bumpOrderVersion(); },
    [bumpOrderVersion],
  );
  const handleResetGroupOrder = useCallback(
    (group: TriadGroup) => { clearGroupOrder(group); bumpOrderVersion(); },
    [bumpOrderVersion],
  );

  const needsInvite = error && (error as { status?: number }).status === 403;
  if (needsInvite) return <JoinCampaignPage />;

  const activeBadgeCount = newRecapCount + upcomingDeliveryFailureCount;
  const avatarInitial = user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "?";

  return (
    <ChatNavContext.Provider value={{ openWithConversation }}>
    <div className="dark min-h-[100dvh] bg-background flex flex-col" data-testid="page-dashboard">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-sidebar bg-dither-surface sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Delve" className="h-7 w-7 pixelated" />
          <span className="text-sm font-semibold text-foreground tracking-tight">Delve</span>
        </div>
        <button
          onClick={() => setProfileOpen(true)}
          data-testid="button-avatar-profile"
          className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-semibold hover:bg-primary/30 transition-colors"
          aria-label="Open profile"
        >
          {avatarInitial}
        </button>
      </header>

      <SubNavStrip
        group={activeGroup}
        items={groupItems}
        pinnedItems={getPinnedItems(activeGroup)}
        activeTab={activeTab}
        onSelect={setActiveTab}
        newRecapCount={newRecapCount}
        upcomingDeliveryFailureCount={upcomingDeliveryFailureCount}
        hasCustomOrder={hasCustomOrder}
        onReorder={handleReorderGroup}
        onReset={handleResetGroupOrder}
      />

      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8" style={{ paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))" }}>
        {activeTab === "overview" && (
          <OverviewPanel
            dashboard={dashboard as DashboardSummary & { inviteCode?: string }}
            isLoading={isLoading}
            isDm={isDm}
            dmMode={dmMode}
            onNavigate={setActiveTab}
            onOpenEvent={(eventId, opts) => {
              setCalendarDeepLink({ eventId, scrollToDelivery: opts?.scrollToDelivery });
              setActiveTab("calendar");
            }}
          />
        )}
        {activeTab === "my-character" && <MyCharacterPanel onNavigateToCharacters={() => setActiveTab("characters")} />}
        {activeTab === "characters" && <CharacterListPanel />}
        {activeTab === "npcs" && <NpcsPanel />}
        {activeTab === "sessions" && <SessionsPanel />}
        {activeTab === "calendar" && (
          <CalendarPanel
            key={calendarDeepLink ? `${calendarDeepLink.eventId}-${calendarDeepLink.scrollToDelivery ? "d" : ""}` : "list"}
            initialEventId={calendarDeepLink?.eventId ?? null}
            initialScrollToDelivery={calendarDeepLink?.scrollToDelivery}
          />
        )}
        {activeTab === "dice" && <DiceRollerPanel />}
        {activeTab === "rules" && <RulesLookupPanel />}
        {activeTab === "bestiary" && <BestiaryPanel />}
        {activeTab === "world" && <WorldPanel />}
        {activeTab === "chat" && (
          <ChatPanel key={chatInitConversationId ?? "new"} initialConversationId={chatInitConversationId} />
        )}
        {activeTab === "homebrew" && <HomebrewPanel />}
        {activeTab === "compare" && isDm && <CompareEditionsPanel />}
      </main>

      <TriadTabBar
        activeGroup={activeGroup}
        onSelect={handleTriadTabClick}
        activeBadgeCount={activeBadgeCount}
        subNavReordered={hasAnyCustomOrder}
      />

      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent side="right" className="bg-[#09090B] border-[rgba(255,255,255,0.06)] w-80 max-w-full" data-testid="sheet-profile">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-foreground text-base">Profile</SheetTitle>
          </SheetHeader>
          <div className="space-y-1">
            <div className="flex items-center gap-3 px-2 mb-5">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary text-base font-semibold shrink-0">
                {avatarInitial}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate" data-testid="text-username">
                  {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress ?? "Adventurer"}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user?.emailAddresses?.[0]?.emailAddress ?? ""}</p>
              </div>
            </div>

            <div className="border-t border-[rgba(255,255,255,0.06)] pt-3 space-y-1">
              <label className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] cursor-pointer transition-colors" data-testid="label-email-notifications">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  Recap emails
                </span>
                <Switch checked={membership?.emailNotifications ?? false} onCheckedChange={handleToggleEmailNotifications} disabled={updateNotificationPrefs.isPending} data-testid="switch-email-notifications" />
              </label>
              <span className="hidden" data-testid="switch-email-notifications-mobile" aria-hidden="true" />

              <label className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors" data-testid="label-timezone">
                <span className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                  <Globe className="h-4 w-4" />
                  Your timezone
                </span>
                <TimezoneCombobox value={currentTimezone} onChange={handleChangeTimezone} options={supportedTimezones} disabled={updateNotificationPrefs.isPending} testId="select-timezone" />
              </label>
              <span className="hidden" data-testid="select-timezone-mobile" aria-hidden="true" />

              {isDm && (
                <label className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] cursor-pointer transition-colors" data-testid="label-dm-mode">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Swords className="h-4 w-4" />
                    DM Mode
                  </span>
                  <Switch checked={dmMode} onCheckedChange={setDmMode} data-testid="switch-dm-mode" />
                </label>
              )}
              {isDm && (
                <button
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors text-sm text-muted-foreground"
                  onClick={() => { setProfileOpen(false); writeLastSubNav("library", "compare"); setActiveTabState("compare"); }}
                  data-testid="nav-compare"
                >
                  <GitCompare className="h-4 w-4" />
                  Compare Editions
                </button>
              )}

              {isDm && inviteCode && (
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors" data-testid="row-invite-code-profile">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                    <Users className="h-4 w-4" />
                    Invite code
                  </span>
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-mono text-sm font-bold text-primary tracking-widest tabular-nums truncate" data-testid="text-invite-code-profile">{inviteCode}</span>
                    <button
                      type="button"
                      className="p-1.5 rounded-md hover:bg-[rgba(255,255,255,0.06)] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      onClick={async () => {
                        if (!inviteCode) return;
                        try {
                          await navigator.clipboard.writeText(inviteCode);
                          toast({ title: "Invite code copied" });
                        } catch {
                          toast({ title: "Couldn't copy invite code", description: "Copy it manually from the dashboard.", variant: "destructive" });
                        }
                      }}
                      aria-label="Copy invite code"
                      data-testid="button-copy-invite-code-profile"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[rgba(255,255,255,0.06)] pt-3">
              <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={handleSignOut} data-testid="button-sign-out">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
    </ChatNavContext.Provider>
  );
}

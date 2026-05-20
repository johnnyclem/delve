import { motion } from "framer-motion";
import {
  Shield, ScrollText, Calendar, Users, Sparkles,
  Dice5, ChevronRight, Mail,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedBorder } from "@/components/ui/animated-border";
import type { DashboardSummary, PartyMemberSummary, DiceRoll, SessionTrendPoint } from "@workspace/api-client-react";
import type { NavId } from "./nav-utils";

function SessionTrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl">
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

export function OverviewPanel({ dashboard, isLoading, isDm, dmMode, onNavigate, onOpenEvent }: {
  dashboard: (DashboardSummary & { inviteCode?: string }) | undefined;
  isLoading: boolean;
  isDm: boolean;
  dmMode?: boolean;
  onNavigate: (tab: NavId) => void;
  onOpenEvent: (eventId: number, opts?: { scrollToDelivery?: boolean }) => void;
}) {
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

      {!dmMode && dashboard?.inviteCode && (
        <AnimatedBorder className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Invite Code</p>
            <p className="text-xs text-muted-foreground">Share with players to join</p>
          </div>
          <span className="font-mono text-lg font-bold text-primary tracking-widest tabular-nums" data-testid="text-invite-code">{dashboard.inviteCode}</span>
        </AnimatedBorder>
      )}

      {!dmMode && (
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
      )}

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

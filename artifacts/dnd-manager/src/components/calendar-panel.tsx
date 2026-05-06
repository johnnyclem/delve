import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon, Plus, ArrowLeft, Check, X, HelpCircle, Trash2, Repeat, AlertTriangle, Mail, MailX, MailQuestion, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  useListEvents, useGetEvent, useCreateEvent, useUpsertRsvp, useDeleteEvent,
  useGetEventInviteLogs, useResendEventInvites,
  getListEventsQueryKey, getGetEventQueryKey, getGetDashboardQueryKey,
  getGetEventInviteLogsQueryKey,
} from "@workspace/api-client-react";
import { useGetMyMembership } from "@workspace/api-client-react";
import type { CalendarEvent, CalendarEventWithRsvps, CampaignMember, RsvpWithMember, EventInviteLog } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedBorder } from "@/components/ui/animated-border";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type Recurrence = "none" | "weekly" | "biweekly" | "monthly";

export default function CalendarPanel() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  if (selectedId !== null) {
    return <EventDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  if (showCreate) {
    return <CreateEvent onBack={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); setSelectedId(id); }} />;
  }

  return <EventList onSelect={setSelectedId} onCreate={() => setShowCreate(true)} />;
}

function recurrenceLabel(rule: CalendarEvent["recurrenceRule"]): string | null {
  if (!rule) return null;
  if (rule.freq === "weekly") return "Weekly";
  if (rule.freq === "biweekly") return "Every 2 weeks";
  if (rule.freq === "monthly") return "Monthly";
  return null;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function EventList({ onSelect, onCreate }: { onSelect: (id: number) => void; onCreate: () => void }) {
  const { data: events, isLoading } = useListEvents();
  const { data: membership } = useGetMyMembership();
  const isDm = (membership as CampaignMember | undefined)?.role === "dm";

  const sorted = events ? [...(events as CalendarEvent[])].sort((a, b) => new Date(a.proposedAt).getTime() - new Date(b.proposedAt).getTime()) : [];
  const nextEventId = sorted.find(ev => new Date(ev.proposedAt) >= new Date())?.id;

  return (
    <div className="space-y-6" data-testid="calendar-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2 tracking-tight">
          <CalendarIcon className="h-6 w-6 text-primary" />
          Schedule
        </h2>
        {isDm && (
          <Button size="sm" onClick={onCreate} data-testid="button-create-event">
            <Plus className="h-4 w-4 mr-1" />
            New Session
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : !sorted.length ? (
        <div className="rounded-2xl border border-dashed border-[rgba(255,255,255,0.08)] p-8 text-center">
          <CalendarIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No sessions scheduled yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((ev) => {
            const date = new Date(ev.proposedAt);
            const isPast = date < new Date();
            const isNext = ev.id === nextEventId;
            const recur = recurrenceLabel(ev.recurrenceRule);

            const cardInner = (
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground truncate">{ev.title}</h3>
                    {recur && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                        <Repeat className="h-2.5 w-2.5" />
                        {recur}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} at {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                  ev.status === "confirmed" ? "bg-emerald-500/10 text-emerald-400" :
                  ev.status === "cancelled" ? "bg-red-500/10 text-red-400" :
                  "bg-yellow-500/10 text-yellow-400"
                }`}>
                  {ev.status}
                </span>
              </div>
            );

            return (
              <motion.button
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                key={ev.id}
                onClick={() => onSelect(ev.id)}
                className={`w-full text-left ${
                  isNext ? "" : `rounded-2xl glass-panel-hover p-4 ${isPast ? "opacity-60" : ""}`
                }`}
                data-testid={`card-event-${ev.id}`}
              >
                {isNext ? (
                  <AnimatedBorder className="p-4" interactive speed="slow">{cardInner}</AnimatedBorder>
                ) : cardInner}
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateEvent({ onBack, onCreated }: { onBack: () => void; onCreated: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const [pickedDate, setPickedDate] = useState<Date | undefined>(undefined);
  const [timeStr, setTimeStr] = useState("19:00");
  const [location, setLocation] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [untilDate, setUntilDate] = useState<Date | undefined>(undefined);
  const createMutation = useCreateEvent();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: events } = useListEvents();

  const allEvents = (events as CalendarEvent[] | undefined) ?? [];

  const upcoming = useMemo(() => {
    const now = new Date();
    return allEvents
      .filter((e) => new Date(e.proposedAt) >= now && e.status !== "cancelled")
      .sort((a, b) => new Date(a.proposedAt).getTime() - new Date(b.proposedAt).getTime())
      .slice(0, 6);
  }, [allEvents]);

  // Days that already have at least one scheduled session — used as calendar markers.
  const scheduledDays = useMemo(() => {
    const days: Date[] = [];
    const seen = new Set<string>();
    for (const e of allEvents) {
      if (e.status === "cancelled") continue;
      const d = startOfDay(new Date(e.proposedAt));
      const key = d.toISOString();
      if (!seen.has(key)) {
        seen.add(key);
        days.push(d);
      }
    }
    return days;
  }, [allEvents]);

  // Combine pickedDate + timeStr into a full Date (local).
  const combinedDate = useMemo(() => {
    if (!pickedDate) return null;
    const [hh, mm] = timeStr.split(":").map((s) => parseInt(s, 10));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    const d = new Date(pickedDate);
    d.setHours(hh, mm, 0, 0);
    return d;
  }, [pickedDate, timeStr]);

  // Check ALL non-cancelled events (not just the truncated upcoming list) so a conflict
  // on a far-future date is still flagged.
  const conflict = useMemo(() => {
    if (!combinedDate) return null;
    return allEvents.find((e) =>
      e.status !== "cancelled" && sameLocalDay(new Date(e.proposedAt), combinedDate),
    ) ?? null;
  }, [combinedDate, allEvents]);

  const today = startOfDay(new Date());

  const handleCreate = () => {
    if (!title.trim() || !combinedDate) return;
    if (recurrence !== "none" && !untilDate) {
      toast({ title: "Pick an end date for the recurring series" });
      return;
    }
    const recurrencePayload = recurrence === "none" || !untilDate ? null : {
      freq: recurrence,
      until: startOfDay(untilDate).toISOString(),
    };
    createMutation.mutate(
      {
        data: {
          title,
          proposedAt: combinedDate.toISOString(),
          location: location || null,
          recurrence: recurrencePayload,
        },
      },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          toast({ title: recurrence === "none" ? "Session scheduled!" : "Series scheduled!" });
          onCreated(data.id);
        },
        onError: (err) => {
          toast({ title: "Could not schedule", description: err instanceof Error ? err.message : String(err) });
        },
      },
    );
  };

  return (
    <div className="space-y-6" data-testid="create-event">
      <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-events">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </Button>
      <h2 className="text-2xl font-semibold text-foreground tracking-tight">Schedule Session</h2>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] max-w-3xl">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Session 12: Into the Abyss" data-testid="input-event-title" />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Pick a date</label>
            <div className="rounded-2xl glass-panel p-2 inline-block">
              <Calendar
                mode="single"
                selected={pickedDate}
                onSelect={setPickedDate}
                disabled={{ before: today }}
                modifiers={{ scheduled: scheduledDays }}
                modifiersClassNames={{
                  scheduled: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary",
                }}
                data-testid="calendar-event-date"
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary"></span>
              Dot marks days that already have a session.
            </p>
          </div>

          <div className="flex items-end gap-3 max-w-xs">
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground mb-1 block">Time</label>
              <div className="relative">
                <Clock className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  type="time"
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  className="pl-9 tabular-nums"
                  data-testid="input-event-time"
                />
              </div>
            </div>
          </div>

          {conflict && (
            <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-300 max-w-md" data-testid="conflict-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>You already have <span className="font-semibold">{conflict.title}</span> on this day. Schedule anyway if intentional.</span>
            </div>
          )}

          <div className="max-w-md">
            <label className="text-sm font-medium text-foreground mb-1 block">Repeats</label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              data-testid="select-recurrence"
            >
              <option value="none">Doesn't repeat</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {recurrence !== "none" && (
            <div className="max-w-md">
              <label className="text-sm font-medium text-foreground mb-2 block">Repeat until</label>
              <div className="rounded-2xl glass-panel p-2 inline-block">
                <Calendar
                  mode="single"
                  selected={untilDate}
                  onSelect={setUntilDate}
                  disabled={{ before: pickedDate ?? today }}
                  data-testid="calendar-recurrence-until"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Up to 26 occurrences. Players will get an RSVP email for each one.</p>
            </div>
          )}

          <div className="max-w-md">
            <label className="text-sm font-medium text-foreground mb-1 block">Location (optional)</label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Discord, Roll20, etc." data-testid="input-event-location" />
          </div>

          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending || !title.trim() || !combinedDate}
            data-testid="button-save-event"
          >
            {recurrence === "none" ? "Schedule" : "Schedule series"}
          </Button>
        </div>

        <aside className="space-y-3">
          {upcoming.length > 0 && (
            <div className="rounded-2xl glass-panel p-4">
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Already scheduled</h3>
              <ul className="space-y-1.5">
                {upcoming.map((e) => {
                  const d = new Date(e.proposedAt);
                  const isOnPicked = combinedDate ? sameLocalDay(d, combinedDate) : false;
                  return (
                    <li
                      key={e.id}
                      className={`flex items-center justify-between text-xs rounded-md px-2 py-1 ${
                        isOnPicked ? "bg-yellow-500/10 text-yellow-300" : "text-foreground"
                      }`}
                      data-testid={`scheduled-${e.id}`}
                    >
                      <span className="truncate">{e.title}</span>
                      <span className="tabular-nums shrink-0 ml-2 text-muted-foreground">
                        {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function inviteStatusVisual(status: string): { color: string; bg: string; Icon: typeof Mail; label: string } {
  if (status === "sent") return { color: "text-emerald-400", bg: "bg-emerald-500/10", Icon: Mail, label: "Sent" };
  if (status === "failed") return { color: "text-red-400", bg: "bg-red-500/10", Icon: MailX, label: "Failed" };
  if (status === "skipped") return { color: "text-muted-foreground", bg: "bg-muted/20", Icon: MailQuestion, label: "Skipped" };
  return { color: "text-muted-foreground", bg: "bg-muted/20", Icon: MailQuestion, label: status };
}

function InviteDeliveryPanel({ eventId }: { eventId: number }) {
  const { data, isLoading, refetch, isFetching } = useGetEventInviteLogs(eventId);
  const resendMutation = useResendEventInvites();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logs = (data as EventInviteLog[] | undefined) ?? [];

  const handleResend = () => {
    resendMutation.mutate(
      { id: eventId },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getGetEventInviteLogsQueryKey(eventId) });
          const count = (result as { resentCount?: number } | undefined)?.resentCount ?? 0;
          toast({
            title: count === 0 ? "No recipients to email" : `Resent ${count} invite${count === 1 ? "" : "s"}`,
            description: count === 0 ? "No players are opted in for invite emails." : undefined,
          });
        },
        onError: (err) => {
          toast({
            title: "Could not resend invites",
            description: err instanceof Error ? err.message : String(err),
          });
        },
      },
    );
  };

  // Latest attempt per recipient
  const latestByUser = useMemo(() => {
    const m = new Map<string, EventInviteLog>();
    for (const log of logs) {
      const prev = m.get(log.userId);
      if (!prev || new Date(log.attemptedAt).getTime() > new Date(prev.attemptedAt).getTime()) {
        m.set(log.userId, log);
      }
    }
    return [...m.values()].sort((a, b) => new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime());
  }, [logs]);

  return (
    <div className="rounded-2xl glass-panel p-5" data-testid="invite-delivery-panel">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" /> Invite delivery
        </h3>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching || resendMutation.isPending}
            className="h-7 text-xs"
            data-testid="button-refresh-invite-logs"
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleResend}
            disabled={resendMutation.isPending}
            className="h-7 text-xs gap-1"
            data-testid="button-resend-invites"
          >
            <Mail className="h-3 w-3" />
            {resendMutation.isPending ? "Resending…" : "Resend invites"}
          </Button>
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 rounded-md" />)}
        </div>
      ) : latestByUser.length === 0 ? (
        <p className="text-xs text-muted-foreground">No invite emails recorded for this session yet.</p>
      ) : (
        <ul className="space-y-2">
          {latestByUser.map((log) => {
            const v = inviteStatusVisual(log.status);
            const detail = log.errorMessage ?? log.reason ?? null;
            const when = new Date(log.attemptedAt).toLocaleString(undefined, {
              month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
            });
            return (
              <li
                key={log.id}
                className="flex items-start justify-between gap-3 text-sm rounded-md px-3 py-2 bg-[rgba(255,255,255,0.02)]"
                data-testid={`invite-log-${log.id}`}
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate">{log.recipientName}</p>
                  {log.email && <p className="text-[11px] text-muted-foreground truncate">{log.email}</p>}
                  {detail && (
                    <p className={`text-[11px] mt-0.5 ${log.status === "failed" ? "text-red-300" : "text-muted-foreground"}`}>
                      {detail}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${v.bg} ${v.color}`}>
                    <v.Icon className="h-3 w-3" /> {v.label}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">{when}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EventDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { data: event, isLoading } = useGetEvent(id, { query: { queryKey: getGetEventQueryKey(id) } });
  const upsertRsvp = useUpsertRsvp();
  const deleteMutation = useDeleteEvent();
  const { data: membership } = useGetMyMembership();
  const isDm = (membership as CampaignMember | undefined)?.role === "dm";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const ev = event as CalendarEventWithRsvps | undefined;

  // When DM views the event, refresh dashboard data once on mount
  useEffect(() => {
    if (isDm) {
      queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(id) });
    }
  }, [id, isDm, queryClient]);

  const handleRsvp = (status: "yes" | "no" | "maybe") => {
    upsertRsvp.mutate(
      { eventId: id, data: { status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          toast({ title: `RSVP'd: ${status}` });
        },
      },
    );
  };

  const handleDelete = (series: boolean) => {
    const label = series ? "the entire series" : "this session";
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { id, params: series ? { series: true } : undefined },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          toast({ title: `Deleted ${data.deleted} session${data.deleted === 1 ? "" : "s"}` });
          onBack();
        },
        onError: (err) => {
          toast({ title: "Could not delete", description: err instanceof Error ? err.message : String(err) });
        },
      },
    );
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 rounded-2xl" /></div>;
  }

  if (!ev) {
    return <p className="text-muted-foreground">Event not found.</p>;
  }

  const date = new Date(ev.proposedAt);
  const recur = recurrenceLabel(ev.recurrenceRule);

  return (
    <div className="space-y-6" data-testid="event-detail">
      <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-events">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </Button>

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-2xl font-semibold text-foreground tracking-tight" data-testid="text-event-title">{ev.title}</h2>
          {recur && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              <Repeat className="h-3 w-3" />
              {recur}
            </span>
          )}
        </div>
        <p className="text-muted-foreground">
          {date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} at {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </p>
        {ev.location && <p className="text-sm text-muted-foreground mt-1">Location: {ev.location}</p>}
      </div>

      <div className="rounded-2xl glass-panel p-5">
        <h3 className="font-semibold text-foreground text-sm mb-3">Your RSVP</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => handleRsvp("yes")} disabled={upsertRsvp.isPending} data-testid="button-rsvp-yes" className="gap-1">
            <Check className="h-3 w-3 text-emerald-400" /> Yes
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleRsvp("maybe")} disabled={upsertRsvp.isPending} data-testid="button-rsvp-maybe" className="gap-1">
            <HelpCircle className="h-3 w-3 text-yellow-400" /> Maybe
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleRsvp("no")} disabled={upsertRsvp.isPending} data-testid="button-rsvp-no" className="gap-1">
            <X className="h-3 w-3 text-red-400" /> No
          </Button>
        </div>
      </div>

      {ev.rsvps?.length > 0 && (
        <div className="rounded-2xl glass-panel p-5">
          <h3 className="font-semibold text-foreground text-sm mb-3">RSVPs (<span className="font-mono tabular-nums">{ev.rsvps.length}</span>)</h3>
          <div className="space-y-2">
            {ev.rsvps.map((r: RsvpWithMember) => (
              <div key={r.id} className="flex items-center justify-between text-sm" data-testid={`rsvp-${r.id}`}>
                <span className="text-foreground">{r.displayName}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  r.status === "yes" ? "bg-emerald-500/10 text-emerald-400" :
                  r.status === "no" ? "bg-red-500/10 text-red-400" :
                  "bg-yellow-500/10 text-yellow-400"
                }`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isDm && <InviteDeliveryPanel eventId={id} />}

      {isDm && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 space-y-2">
          <h3 className="font-semibold text-red-300 text-sm">Danger zone</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDelete(false)}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-event"
              className="gap-1 border-red-500/30 text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="h-3 w-3" /> Delete this session
            </Button>
            {ev.seriesId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDelete(true)}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-series"
                className="gap-1 border-red-500/30 text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="h-3 w-3" /> Delete whole series
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

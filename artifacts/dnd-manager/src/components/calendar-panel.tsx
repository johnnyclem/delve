import { useMemo, useState } from "react";
import { Calendar, Plus, ArrowLeft, Check, X, HelpCircle, Trash2, Repeat, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useListEvents, useGetEvent, useCreateEvent, useUpsertRsvp, useDeleteEvent,
  getListEventsQueryKey, getGetEventQueryKey, getGetDashboardQueryKey
} from "@workspace/api-client-react";
import { useGetMyMembership } from "@workspace/api-client-react";
import type { CalendarEvent, CalendarEventWithRsvps, CampaignMember, RsvpWithMember } from "@workspace/api-client-react";
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
          <Calendar className="h-6 w-6 text-primary" />
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
          <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
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

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function CreateEvent({ onBack, onCreated }: { onBack: () => void; onCreated: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [location, setLocation] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const [untilStr, setUntilStr] = useState("");
  const createMutation = useCreateEvent();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: events } = useListEvents();

  const upcoming = useMemo(() => {
    const list = (events as CalendarEvent[] | undefined) ?? [];
    const now = new Date();
    return list
      .filter((e) => new Date(e.proposedAt) >= now && e.status !== "cancelled")
      .sort((a, b) => new Date(a.proposedAt).getTime() - new Date(b.proposedAt).getTime())
      .slice(0, 6);
  }, [events]);

  const conflict = useMemo(() => {
    if (!dateStr) return null;
    const picked = new Date(dateStr);
    return upcoming.find((e) => sameLocalDay(new Date(e.proposedAt), picked)) ?? null;
  }, [dateStr, upcoming]);

  const handleCreate = () => {
    if (!title.trim() || !dateStr) return;
    if (recurrence !== "none" && !untilStr) {
      toast({ title: "Pick an end date for the recurring series" });
      return;
    }
    const recurrencePayload = recurrence === "none" ? null : {
      freq: recurrence,
      until: new Date(untilStr).toISOString(),
    };
    createMutation.mutate(
      {
        data: {
          title,
          proposedAt: new Date(dateStr).toISOString(),
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
      <div className="space-y-4 max-w-md">
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Session 12: Into the Abyss" data-testid="input-event-title" />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">Date & Time</label>
          <Input type="datetime-local" value={dateStr} onChange={(e) => setDateStr(e.target.value)} data-testid="input-event-date" />
          {conflict && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-300" data-testid="conflict-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>You already have <span className="font-semibold">{conflict.title}</span> on this day. Schedule anyway if intentional.</span>
            </div>
          )}
        </div>
        <div>
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
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Repeat until</label>
            <Input type="date" value={untilStr} onChange={(e) => setUntilStr(e.target.value)} data-testid="input-recurrence-until" />
            <p className="mt-1 text-xs text-muted-foreground">Up to 26 occurrences. Invites will be sent for the first 8.</p>
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">Location (optional)</label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Discord, Roll20, etc." data-testid="input-event-location" />
        </div>
        <Button onClick={handleCreate} disabled={createMutation.isPending || !title.trim() || !dateStr} data-testid="button-save-event">
          {recurrence === "none" ? "Schedule" : "Schedule series"}
        </Button>

        {upcoming.length > 0 && (
          <div className="mt-6 rounded-2xl glass-panel p-4">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Already scheduled</h3>
            <ul className="space-y-1.5">
              {upcoming.map((e) => {
                const d = new Date(e.proposedAt);
                return (
                  <li key={e.id} className="flex items-center justify-between text-xs text-foreground">
                    <span className="truncate">{e.title}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0 ml-2">
                      {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
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

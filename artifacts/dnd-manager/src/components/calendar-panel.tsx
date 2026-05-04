import { useState } from "react";
import { Calendar, Plus, ArrowLeft, Check, X, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useListEvents, useGetEvent, useCreateEvent, useUpdateEvent, useUpsertRsvp,
  getListEventsQueryKey, getGetEventQueryKey, getGetDashboardQueryKey
} from "@workspace/api-client-react";
import { useGetMyMembership } from "@workspace/api-client-react";
import type { CalendarEvent, CalendarEventWithRsvps, CampaignMember, RsvpWithMember } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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

function EventList({ onSelect, onCreate }: { onSelect: (id: number) => void; onCreate: () => void }) {
  const { data: events, isLoading } = useListEvents();
  const { data: membership } = useGetMyMembership();
  const isDm = (membership as CampaignMember | undefined)?.role === "dm";

  const sorted = events ? [...(events as CalendarEvent[])].sort((a, b) => new Date(a.proposedAt).getTime() - new Date(b.proposedAt).getTime()) : [];

  return (
    <div className="space-y-6" data-testid="calendar-panel">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl font-bold text-foreground flex items-center gap-2">
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
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : !sorted.length ? (
        <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
          <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No sessions scheduled yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((ev) => {
            const date = new Date(ev.proposedAt);
            const isPast = date < new Date();
            return (
              <button
                key={ev.id}
                onClick={() => onSelect(ev.id)}
                className={`w-full text-left rounded-xl border bg-card p-4 transition-colors ${
                  isPast ? "border-border/30 opacity-60" : "border-border/50 hover:border-primary/30"
                }`}
                data-testid={`card-event-${ev.id}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-card-foreground">{ev.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} at {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    ev.status === "confirmed" ? "bg-emerald-500/10 text-emerald-400" :
                    ev.status === "cancelled" ? "bg-red-500/10 text-red-400" :
                    "bg-yellow-500/10 text-yellow-400"
                  }`}>
                    {ev.status}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateEvent({ onBack, onCreated }: { onBack: () => void; onCreated: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [location, setLocation] = useState("");
  const createMutation = useCreateEvent();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleCreate = () => {
    if (!title.trim() || !dateStr) return;
    createMutation.mutate(
      { data: { title, proposedAt: new Date(dateStr).toISOString(), location: location || null } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          toast({ title: "Session scheduled!" });
          onCreated(data.id);
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
      <h2 className="font-serif text-2xl font-bold text-foreground">Schedule Session</h2>
      <div className="space-y-4 max-w-md">
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Session 12: Into the Abyss" data-testid="input-event-title" />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">Date & Time</label>
          <Input type="datetime-local" value={dateStr} onChange={(e) => setDateStr(e.target.value)} data-testid="input-event-date" />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">Location (optional)</label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Discord, Roll20, etc." data-testid="input-event-location" />
        </div>
        <Button onClick={handleCreate} disabled={createMutation.isPending || !title.trim() || !dateStr} data-testid="button-save-event">
          Schedule
        </Button>
      </div>
    </div>
  );
}

function EventDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { data: event, isLoading } = useGetEvent(id, { query: { queryKey: getGetEventQueryKey(id) } });
  const upsertRsvp = useUpsertRsvp();
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

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 rounded-xl" /></div>;
  }

  if (!ev) {
    return <p className="text-muted-foreground">Event not found.</p>;
  }

  const date = new Date(ev.proposedAt);

  return (
    <div className="space-y-6" data-testid="event-detail">
      <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-events">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </Button>

      <div>
        <h2 className="font-serif text-2xl font-bold text-foreground" data-testid="text-event-title">{ev.title}</h2>
        <p className="text-muted-foreground">
          {date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} at {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </p>
        {ev.location && <p className="text-sm text-muted-foreground mt-1">Location: {ev.location}</p>}
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-5">
        <h3 className="font-semibold text-card-foreground text-sm mb-3">Your RSVP</h3>
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
        <div className="rounded-xl border border-border/50 bg-card p-5">
          <h3 className="font-semibold text-card-foreground text-sm mb-3">RSVPs ({ev.rsvps.length})</h3>
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
    </div>
  );
}

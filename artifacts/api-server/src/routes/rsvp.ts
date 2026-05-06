import { Router, type IRouter } from "express";
import { db, calendarEventsTable, campaignMembersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { verifyRsvpToken } from "../lib/rsvp-token";
import { upsertRsvp } from "./calendar";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const RESPONSES = ["yes", "no", "maybe"] as const;
type RsvpResponse = typeof RESPONSES[number];

const LABELS: Record<RsvpResponse, { word: string; color: string }> = {
  yes:   { word: "Yes",   color: "#34D399" },
  maybe: { word: "Maybe", color: "#FBBF24" },
  no:    { word: "No",    color: "#F87171" },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shellPage(opts: {
  title: string;
  heading: string;
  bodyHtml: string;
  badgeColor?: string;
}): string {
  const accent = opts.badgeColor ?? "#A78BFA";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#09090B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090B;padding:80px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background-color:#18181B;border-radius:16px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">
        <tr><td style="padding:40px 32px;">
          <div style="font-size:14px;font-weight:600;color:${accent};letter-spacing:0.5px;margin-bottom:20px;">DELVE</div>
          <h1 style="margin:0 0 12px;font-size:22px;color:#FAFAFA;font-weight:600;">${escapeHtml(opts.heading)}</h1>
          ${opts.bodyHtml}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function parseResponse(raw: unknown): RsvpResponse | null {
  if (typeof raw !== "string") return null;
  const v = raw.toLowerCase();
  return (RESPONSES as readonly string[]).includes(v) ? (v as RsvpResponse) : null;
}

type LoadResult =
  | { ok: true; decoded: NonNullable<ReturnType<typeof verifyRsvpToken>>; event: typeof calendarEventsTable.$inferSelect; member: typeof campaignMembersTable.$inferSelect }
  | { ok: false; status: number; heading: string; body: string };

async function loadEventAndMember(token: string): Promise<LoadResult> {
  const decoded = verifyRsvpToken(token);
  if (!decoded) return { ok: false, status: 400, heading: "Invalid or expired link", body: "This RSVP link could not be verified. Please open Delve to RSVP directly." };

  const [event] = await db
    .select()
    .from(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.id, decoded.eventId),
        eq(calendarEventsTable.campaignId, decoded.campaignId),
      ),
    );
  if (!event) {
    return { ok: false, status: 404, heading: "Session not found", body: "This session has been removed or rescheduled. Open Delve to see the latest schedule." };
  }

  const [member] = await db
    .select()
    .from(campaignMembersTable)
    .where(
      and(
        eq(campaignMembersTable.campaignId, decoded.campaignId),
        eq(campaignMembersTable.userId, decoded.userId),
      ),
    );
  if (!member) {
    return { ok: false, status: 403, heading: "Not a campaign member", body: "We couldn't find your membership in this campaign." };
  }

  return { ok: true, decoded, event, member };
}

// GET renders a confirmation page. We never mutate state on GET so that email clients,
// preview/scanner bots, and link prefetchers (which auto-fetch URLs) cannot accidentally
// change a player's RSVP. The page POSTs back to the same URL to commit the response.
router.get("/rsvp/:token", async (req, res): Promise<void> => {
  const tokenRaw = req.params.token;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
  const response = parseResponse(req.query.response);

  if (!token) {
    res.status(400).type("html").send(shellPage({
      title: "RSVP — Delve",
      heading: "Invalid link",
      bodyHtml: `<p style="margin:0;color:#A1A1AA;font-size:14px;line-height:1.6;">This RSVP link is missing required information.</p>`,
    }));
    return;
  }
  if (!response) {
    res.status(400).type("html").send(shellPage({
      title: "RSVP — Delve",
      heading: "Choose a response",
      bodyHtml: `<p style="margin:0;color:#A1A1AA;font-size:14px;line-height:1.6;">Open the original email and tap Yes, Maybe, or No.</p>`,
    }));
    return;
  }

  const loaded = await loadEventAndMember(token);
  if (!loaded.ok) {
    res.status(loaded.status).type("html").send(shellPage({
      title: "RSVP — Delve",
      heading: loaded.heading,
      bodyHtml: `<p style="margin:0;color:#A1A1AA;font-size:14px;line-height:1.6;">${escapeHtml(loaded.body)}</p>`,
    }));
    return;
  }

  const date = new Date(loaded.event.proposedAt);
  const dateStr = date.toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  const label = LABELS[response];
  const formAction = `/api/rsvp/${encodeURIComponent(token)}`;

  res.status(200).type("html").send(shellPage({
    title: "Confirm RSVP — Delve",
    heading: `Confirm: ${label.word}`,
    badgeColor: label.color,
    bodyHtml: `
      <p style="margin:0 0 8px;color:#D4D4D8;font-size:15px;font-weight:500;">${escapeHtml(loaded.event.title)}</p>
      <p style="margin:0 0 24px;color:#A1A1AA;font-size:13px;">${escapeHtml(dateStr)}</p>
      <form method="POST" action="${formAction}" style="margin:0;">
        <input type="hidden" name="response" value="${response}">
        <button type="submit" style="display:inline-block;background-color:${label.color};color:#09090B;border:0;cursor:pointer;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
          Confirm "${label.word}"
        </button>
      </form>
      <p style="margin:20px 0 0;color:#71717A;font-size:12px;line-height:1.5;">Or open Delve directly to RSVP and see who else is coming.</p>
    `,
  }));
});

async function applyRsvp(token: string, response: RsvpResponse): Promise<{ ok: true; eventTitle: string; date: Date } | { ok: false; status: number; heading: string; body: string }> {
  const loaded = await loadEventAndMember(token);
  if (!loaded.ok) {
    return { ok: false, status: loaded.status, heading: loaded.heading, body: loaded.body };
  }
  await upsertRsvp({
    eventId: loaded.decoded.eventId,
    userId: loaded.decoded.userId,
    status: response,
    note: null,
  });
  return { ok: true, eventTitle: loaded.event.title, date: new Date(loaded.event.proposedAt) };
}

router.post("/rsvp/:token", async (req, res): Promise<void> => {
  const tokenRaw = req.params.token;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
  const response = parseResponse(req.body?.response ?? req.query.response);

  if (!token || !response) {
    res.status(400).type("html").send(shellPage({
      title: "RSVP — Delve",
      heading: "Invalid request",
      bodyHtml: `<p style="margin:0;color:#A1A1AA;font-size:14px;line-height:1.6;">Open the original email and tap Yes, Maybe, or No.</p>`,
    }));
    return;
  }

  try {
    const result = await applyRsvp(token, response);
    if (!result.ok) {
      res.status(result.status).type("html").send(shellPage({
        title: "RSVP — Delve",
        heading: result.heading,
        bodyHtml: `<p style="margin:0;color:#A1A1AA;font-size:14px;line-height:1.6;">${escapeHtml(result.body)}</p>`,
      }));
      return;
    }

    const dateStr = result.date.toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
    const label = LABELS[response];
    const lines: Record<RsvpResponse, string> = {
      yes: `You're locked in for ${result.eventTitle} — ${dateStr}.`,
      maybe: `We'll keep your spot open for ${result.eventTitle} — ${dateStr}.`,
      no: `You're marked as not attending ${result.eventTitle} — ${dateStr}.`,
    };
    res.status(200).type("html").send(shellPage({
      title: "RSVP saved — Delve",
      heading: response === "yes" ? "You're in!" : response === "no" ? "Sorry to hear it." : "Marked as maybe.",
      badgeColor: label.color,
      bodyHtml: `<p style="margin:0;color:#A1A1AA;font-size:14px;line-height:1.6;">${escapeHtml(lines[response])} Open Delve anytime to change your response or leave a note.</p>`,
    }));
  } catch (err) {
    logger.error({ err }, "Failed to record RSVP from email link");
    res.status(500).type("html").send(shellPage({
      title: "RSVP — Delve",
      heading: "Something went wrong",
      bodyHtml: `<p style="margin:0;color:#A1A1AA;font-size:14px;line-height:1.6;">We couldn't save your RSVP. Please try again or open Delve to RSVP directly.</p>`,
    }));
  }
});

export default router;

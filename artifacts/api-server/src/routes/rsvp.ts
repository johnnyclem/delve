import { Router, type IRouter } from "express";
import { db, calendarEventsTable, campaignMembersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { verifyRsvpToken } from "../lib/rsvp-token";
import { upsertRsvp } from "./calendar";
import { logger } from "../lib/logger";
import { publicIpRateLimit, rsvpTokenRateLimit } from "../middlewares/publicRateLimit";

const router: IRouter = Router();

router.use("/rsvp/:token", publicIpRateLimit, rsvpTokenRateLimit);

const RESPONSES = ["yes", "no", "maybe"] as const;
type RsvpResponse = typeof RESPONSES[number];

const LABELS: Record<RsvpResponse, { word: string; color: string; line: (title: string, when: string) => string }> = {
  yes: {
    word: "Yes",
    color: "#34D399",
    line: (t, w) => `You're locked in for ${t} on ${w}.`,
  },
  maybe: {
    word: "Maybe",
    color: "#FBBF24",
    line: (t, w) => `We'll keep your spot tentative for ${t} on ${w}.`,
  },
  no: {
    word: "No",
    color: "#F87171",
    line: (t, w) => `You're marked as not attending ${t} on ${w}.`,
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shellPage(opts: { title: string; heading: string; bodyHtml: string; badgeColor?: string }): string {
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

function errorPage(status: number, heading: string, body: string) {
  return {
    status,
    html: shellPage({
      title: "RSVP — Delve",
      heading,
      bodyHtml: `<p style="margin:0;color:#A1A1AA;font-size:14px;line-height:1.6;">${escapeHtml(body)}</p>`,
    }),
  };
}

async function handleRsvp(token: string | undefined, response: RsvpResponse | null): Promise<{ status: number; html: string }> {
  if (!token || !response) {
    return errorPage(400, "Invalid link", "Open the original email and tap Yes, Maybe, or No.");
  }

  const decoded = verifyRsvpToken(token);
  if (!decoded) {
    return errorPage(400, "Invalid or expired link", "This RSVP link could not be verified. Please open Delve to RSVP directly.");
  }

  const [event] = await db
    .select()
    .from(calendarEventsTable)
    .where(and(eq(calendarEventsTable.id, decoded.eventId), eq(calendarEventsTable.campaignId, decoded.campaignId)));
  if (!event) {
    return errorPage(404, "Session not found", "This session has been removed or rescheduled. Open Delve to see the latest schedule.");
  }

  const [member] = await db
    .select()
    .from(campaignMembersTable)
    .where(and(eq(campaignMembersTable.campaignId, decoded.campaignId), eq(campaignMembersTable.userId, decoded.userId)));
  if (!member) {
    return errorPage(403, "Not a campaign member", "We couldn't find your membership in this campaign.");
  }

  // Idempotent write: setting the same RSVP twice yields the same final state, so accidental
  // email-prefetches by scanners or link previewers are harmless — the player's actual click
  // applies the same value they intended. The HMAC token also ensures only the correct
  // recipient can change their own RSVP.
  await upsertRsvp({
    eventId: decoded.eventId,
    userId: decoded.userId,
    status: response,
    note: null,
  });

  const date = new Date(event.proposedAt);
  const dateStr = date.toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  const label = LABELS[response];

  return {
    status: 200,
    html: shellPage({
      title: "RSVP saved — Delve",
      heading: response === "yes" ? "You're in!" : response === "no" ? "Sorry to hear it." : "Marked as maybe.",
      badgeColor: label.color,
      bodyHtml: `
        <p style="margin:0 0 8px;color:#D4D4D8;font-size:15px;font-weight:500;">${escapeHtml(event.title)}</p>
        <p style="margin:0 0 16px;color:#A1A1AA;font-size:13px;">${escapeHtml(dateStr)}</p>
        <div style="display:inline-block;background-color:${label.color};color:#09090B;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:600;margin:0 0 20px;">
          Your RSVP: ${label.word}
        </div>
        <p style="margin:0;color:#A1A1AA;font-size:13px;line-height:1.6;">${escapeHtml(label.line(event.title, dateStr))} Open Delve anytime to change your response or leave a note.</p>
      `,
    }),
  };
}

router.get("/rsvp/:token", async (req, res): Promise<void> => {
  const tokenRaw = req.params.token;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
  const response = parseResponse(req.query.response);
  try {
    const out = await handleRsvp(token, response);
    res.status(out.status).type("html").send(out.html);
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

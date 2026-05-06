import { db, campaignMembersTable, notificationLogsTable, sessionLogsTable, campaignsTable, calendarEventsTable } from "@workspace/db";
import { eq, and, isNotNull, desc } from "drizzle-orm";
import { logger } from "./logger";
import { generateUnsubscribeToken } from "./unsubscribe";
import { generateRsvpToken } from "./rsvp-token";

interface RecapNotificationParams {
  campaignId: number;
  sessionNumber: number;
  sessionTitle: string;
  sessionId: number;
}

type NotificationStatus = "sent" | "failed" | "skipped";
type NotificationKind = "recap" | "event_invite";

export interface RecipientContext {
  resend?: import("resend").Resend;
  clerkClient?: Awaited<ReturnType<() => Promise<typeof import("@clerk/express").clerkClient>>>;
  appUrl: string;
  fromEmail: string;
  skipReason: string | null;
}

async function recordLog(entry: {
  sessionLogId?: number | null;
  calendarEventId?: number | null;
  campaignId: number;
  userId: string;
  recipientName: string;
  email: string | null;
  kind?: NotificationKind;
  status: NotificationStatus;
  reason?: string | null;
  errorMessage?: string | null;
  providerMessageId?: string | null;
}): Promise<typeof notificationLogsTable.$inferSelect | null> {
  try {
    const [row] = await db.insert(notificationLogsTable).values({
      sessionLogId: entry.sessionLogId ?? null,
      calendarEventId: entry.calendarEventId ?? null,
      campaignId: entry.campaignId,
      userId: entry.userId,
      recipientName: entry.recipientName,
      email: entry.email,
      channel: "email",
      kind: entry.kind ?? "recap",
      status: entry.status,
      reason: entry.reason ?? null,
      errorMessage: entry.errorMessage ?? null,
      providerMessageId: entry.providerMessageId ?? null,
    }).returning();
    return row ?? null;
  } catch (err) {
    logger.error({ err }, "Failed to write notification log");
    return null;
  }
}

export async function buildRecipientContext(): Promise<RecipientContext> {
  const appUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.APP_URL ?? "http://localhost:5173";
  const fromEmail = process.env.EMAIL_FROM ?? "Delve <notifications@resend.dev>";

  let resend: import("resend").Resend | undefined;
  let skipReason: string | null = null;

  try {
    const { Resend } = await import("resend");
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      skipReason = "RESEND_API_KEY not configured";
      logger.info("RESEND_API_KEY not configured — skipping email notifications");
    } else {
      resend = new Resend(apiKey);
    }
  } catch {
    skipReason = "Resend package not available";
    logger.warn("Resend package not available — skipping email notifications");
  }

  let clerkClient: RecipientContext["clerkClient"];
  if (!skipReason) {
    try {
      const clerkModule = await import("@clerk/express");
      clerkClient = clerkModule.clerkClient;
    } catch {
      skipReason = "Clerk client not available";
      logger.warn("Clerk client not available — skipping email notifications");
    }
  }

  return { resend, clerkClient, appUrl, fromEmail, skipReason };
}

export async function sendRecapEmailToRecipient(
  ctx: RecipientContext,
  params: {
    sessionLogId: number;
    campaignId: number;
    userId: string;
    displayName: string;
    sessionNumber: number;
    sessionTitle: string;
  },
): Promise<typeof notificationLogsTable.$inferSelect | null> {
  const { sessionLogId, campaignId, userId, displayName, sessionNumber, sessionTitle } = params;

  if (ctx.skipReason || !ctx.resend || !ctx.clerkClient) {
    return recordLog({
      sessionLogId,
      campaignId,
      userId,
      recipientName: displayName,
      email: null,
      status: "skipped",
      reason: ctx.skipReason ?? "Notification provider unavailable",
    });
  }

  let email: string | null = null;
  try {
    const client = await ctx.clerkClient;
    const user = await client.users.getUser(userId);
    email = user.emailAddresses?.[0]?.emailAddress ?? null;
    if (!email) {
      logger.info({ userId }, "No email found for user — skipping");
      return recordLog({
        sessionLogId,
        campaignId,
        userId,
        recipientName: displayName,
        email: null,
        status: "skipped",
        reason: "No email address on file",
      });
    }

    let unsubscribeUrl: string | null = null;
    try {
      const token = generateUnsubscribeToken(campaignId, userId);
      unsubscribeUrl = `${ctx.appUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
    } catch (err) {
      logger.warn({ err }, "Could not build unsubscribe link — sending email without it");
    }

    const result = await ctx.resend.emails.send({
      from: ctx.fromEmail,
      to: email,
      subject: `New Recap: Session ${sessionNumber} — ${sessionTitle}`,
      html: buildRecapEmailHtml({
        playerName: displayName,
        sessionNumber,
        sessionTitle,
        appUrl: ctx.appUrl,
        unsubscribeUrl,
      }),
      ...(unsubscribeUrl
        ? {
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
    });

    if (result?.error) {
      const message = result.error.message ?? "Unknown provider error";
      logger.error({ userId, err: result.error }, "Resend returned error for recap email");
      return recordLog({
        sessionLogId,
        campaignId,
        userId,
        recipientName: displayName,
        email,
        status: "failed",
        errorMessage: message,
      });
    }

    logger.info({ userId, email }, "Recap notification email sent");
    return recordLog({
      sessionLogId,
      campaignId,
      userId,
      recipientName: displayName,
      email,
      status: "sent",
      providerMessageId: result?.data?.id ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, userId }, "Failed to send recap notification email");
    return recordLog({
      sessionLogId,
      campaignId,
      userId,
      recipientName: displayName,
      email,
      status: "failed",
      errorMessage: message,
    });
  }
}

export async function sendRecapNotifications(params: RecapNotificationParams): Promise<void> {
  const { campaignId, sessionNumber, sessionTitle, sessionId } = params;

  try {
    const members = await db
      .select()
      .from(campaignMembersTable)
      .where(
        and(
          eq(campaignMembersTable.campaignId, campaignId),
          eq(campaignMembersTable.emailNotifications, true),
        ),
      );

    const players = members.filter((m) => m.role !== "dm");
    if (players.length === 0) {
      logger.info("No players opted in to email notifications");
      return;
    }

    const ctx = await buildRecipientContext();

    for (const player of players) {
      await sendRecapEmailToRecipient(ctx, {
        sessionLogId: sessionId,
        campaignId,
        userId: player.userId,
        displayName: player.displayName,
        sessionNumber,
        sessionTitle,
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to send recap notifications");
  }
}

function buildRecapEmailHtml(params: {
  playerName: string;
  sessionNumber: number;
  sessionTitle: string;
  appUrl: string;
  unsubscribeUrl: string | null;
}): string {
  const { playerName, sessionNumber, sessionTitle, appUrl, unsubscribeUrl } = params;
  const unsubscribeLine = unsubscribeUrl
    ? `<a href="${unsubscribeUrl}" style="color:#A78BFA;text-decoration:underline;">Unsubscribe from recap emails</a> for this campaign, or visit Delve to update your preferences.`
    : `Visit Delve to update your preferences.`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#09090B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090B;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:500px;background-color:#18181B;border-radius:16px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">
        <tr><td style="padding:32px 32px 24px;">
          <div style="font-size:14px;font-weight:600;color:#A78BFA;letter-spacing:0.5px;margin-bottom:16px;">DELVE</div>
          <h1 style="margin:0 0 8px;font-size:22px;color:#FAFAFA;font-weight:600;">New Session Recap</h1>
          <p style="margin:0 0 24px;color:#A1A1AA;font-size:14px;line-height:1.5;">
            Hey ${playerName}, a new recap has been published for your campaign.
          </p>
          <div style="background-color:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.15);border-radius:12px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 4px;color:#A1A1AA;font-size:12px;">Session ${sessionNumber}</p>
            <p style="margin:0;color:#FAFAFA;font-size:16px;font-weight:600;">${sessionTitle}</p>
          </div>
          <a href="${appUrl}" style="display:inline-block;background-color:#7C3AED;color:#FAFAFA;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:500;">
            Read the Recap
          </a>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;color:#71717A;font-size:12px;line-height:1.5;">
            You received this because you opted in to email notifications.
            ${unsubscribeLine}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function recapExcerpt(recapMd: string | null | undefined): string | null {
  if (!recapMd) return null;
  const stripped = recapMd
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`>#-]+/g, " ")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return null;
  if (stripped.length <= 280) return stripped;
  const truncated = stripped.slice(0, 280);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 200 ? truncated.slice(0, lastSpace) : truncated).trim() + "…";
}

interface EventInviteParams {
  campaignId: number;
  campaignName: string;
  eventId: number;
  eventTitle: string;
  proposedAt: Date;
  location: string | null;
  recapExcerpt: string | null;
  lastSessionTitle: string | null;
  lastSessionNumber: number | null;
}

export async function sendEventInviteToRecipient(
  ctx: RecipientContext,
  params: EventInviteParams & { userId: string; displayName: string },
): Promise<typeof notificationLogsTable.$inferSelect | null> {
  const { campaignId, eventId, userId, displayName } = params;

  if (ctx.skipReason || !ctx.resend || !ctx.clerkClient) {
    return recordLog({
      calendarEventId: eventId,
      campaignId,
      userId,
      recipientName: displayName,
      email: null,
      kind: "event_invite",
      status: "skipped",
      reason: ctx.skipReason ?? "Notification provider unavailable",
    });
  }

  let email: string | null = null;
  try {
    const client = await ctx.clerkClient;
    const user = await client.users.getUser(userId);
    email = user.emailAddresses?.[0]?.emailAddress ?? null;
    if (!email) {
      return recordLog({
        calendarEventId: eventId,
        campaignId,
        userId,
        recipientName: displayName,
        email: null,
        kind: "event_invite",
        status: "skipped",
        reason: "No email address on file",
      });
    }

    let unsubscribeUrl: string | null = null;
    try {
      const t = generateUnsubscribeToken(campaignId, userId);
      unsubscribeUrl = `${ctx.appUrl}/api/unsubscribe?token=${encodeURIComponent(t)}`;
    } catch (err) {
      logger.warn({ err }, "Could not build unsubscribe link for invite");
    }

    let yesUrl = "", noUrl = "", maybeUrl = "";
    try {
      const token = generateRsvpToken({ campaignId, userId, eventId });
      const base = `${ctx.appUrl}/api/rsvp/${encodeURIComponent(token)}`;
      yesUrl = `${base}?response=yes`;
      noUrl = `${base}?response=no`;
      maybeUrl = `${base}?response=maybe`;
    } catch (err) {
      logger.error({ err }, "Could not build RSVP token for invite — aborting");
      return recordLog({
        calendarEventId: eventId,
        campaignId,
        userId,
        recipientName: displayName,
        email,
        kind: "event_invite",
        status: "failed",
        errorMessage: "Failed to sign RSVP token",
      });
    }

    const result = await ctx.resend.emails.send({
      from: ctx.fromEmail,
      to: email,
      subject: `${params.campaignName} — ${params.eventTitle}`,
      html: buildEventInviteHtml({
        playerName: displayName,
        ...params,
        yesUrl,
        noUrl,
        maybeUrl,
        appUrl: ctx.appUrl,
        unsubscribeUrl,
      }),
      ...(unsubscribeUrl
        ? {
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
    });

    if (result?.error) {
      const message = result.error.message ?? "Unknown provider error";
      logger.error({ userId, err: result.error }, "Resend returned error for event invite");
      return recordLog({
        calendarEventId: eventId,
        campaignId,
        userId,
        recipientName: displayName,
        email,
        kind: "event_invite",
        status: "failed",
        errorMessage: message,
      });
    }

    logger.info({ userId, email, eventId }, "Event invite email sent");
    return recordLog({
      calendarEventId: eventId,
      campaignId,
      userId,
      recipientName: displayName,
      email,
      kind: "event_invite",
      status: "sent",
      providerMessageId: result?.data?.id ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, userId, eventId }, "Failed to send event invite email");
    return recordLog({
      calendarEventId: eventId,
      campaignId,
      userId,
      recipientName: displayName,
      email,
      kind: "event_invite",
      status: "failed",
      errorMessage: message,
    });
  }
}

export async function sendEventInvitesForEvents(params: {
  campaignId: number;
  eventIds: number[];
}): Promise<void> {
  const { campaignId, eventIds } = params;
  if (eventIds.length === 0) return;

  try {
    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, campaignId));
    if (!campaign) return;

    const members = await db
      .select()
      .from(campaignMembersTable)
      .where(
        and(
          eq(campaignMembersTable.campaignId, campaignId),
          eq(campaignMembersTable.emailNotifications, true),
        ),
      );
    const players = members.filter((m) => m.role !== "dm");
    if (players.length === 0) {
      logger.info("No players opted in for event invites");
      return;
    }

    const [latestRecap] = await db
      .select()
      .from(sessionLogsTable)
      .where(and(eq(sessionLogsTable.campaignId, campaignId), isNotNull(sessionLogsTable.recapMd)))
      .orderBy(desc(sessionLogsTable.sessionNumber))
      .limit(1);

    const excerpt = recapExcerpt(latestRecap?.recapMd);
    const lastSessionTitle = latestRecap?.title ?? null;
    const lastSessionNumber = latestRecap?.sessionNumber ?? null;

    const events = await db
      .select()
      .from(calendarEventsTable)
      .where(eq(calendarEventsTable.campaignId, campaignId));
    const byId = new Map(events.map((e) => [e.id, e]));

    const ctx = await buildRecipientContext();

    for (const eventId of eventIds) {
      const ev = byId.get(eventId);
      if (!ev) continue;
      for (const player of players) {
        await sendEventInviteToRecipient(ctx, {
          campaignId,
          campaignName: campaign.name,
          eventId: ev.id,
          eventTitle: ev.title,
          proposedAt: ev.proposedAt,
          location: ev.location,
          recapExcerpt: excerpt,
          lastSessionTitle,
          lastSessionNumber,
          userId: player.userId,
          displayName: player.displayName,
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to send event invites");
  }
}

function buildEventInviteHtml(params: EventInviteParams & {
  playerName: string;
  appUrl: string;
  yesUrl: string;
  noUrl: string;
  maybeUrl: string;
  unsubscribeUrl: string | null;
}): string {
  const {
    playerName, campaignName, eventTitle, proposedAt, location,
    recapExcerpt: excerpt, lastSessionTitle, lastSessionNumber,
    appUrl, yesUrl, noUrl, maybeUrl, unsubscribeUrl,
  } = params;

  const dateStr = proposedAt.toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });

  const recapBlock = excerpt
    ? `<div style="background-color:rgba(167,139,250,0.06);border-left:3px solid #A78BFA;border-radius:6px;padding:14px 16px;margin:24px 0;">
        ${lastSessionTitle && lastSessionNumber !== null
          ? `<p style="margin:0 0 6px;color:#A78BFA;font-size:11px;letter-spacing:0.5px;text-transform:uppercase;">Last time — Session ${lastSessionNumber}: ${escapeHtml(lastSessionTitle)}</p>`
          : ""}
        <p style="margin:0;color:#D4D4D8;font-size:13px;line-height:1.6;font-style:italic;">${escapeHtml(excerpt)}</p>
      </div>`
    : "";

  const locationLine = location
    ? `<p style="margin:6px 0 0;color:#A1A1AA;font-size:13px;">📍 ${escapeHtml(location)}</p>`
    : "";

  const unsubscribeLine = unsubscribeUrl
    ? `<a href="${unsubscribeUrl}" style="color:#A78BFA;text-decoration:underline;">Unsubscribe from campaign emails</a> or update your preferences in Delve.`
    : `Visit Delve to update your preferences.`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#09090B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090B;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background-color:#18181B;border-radius:16px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">
        <tr><td style="padding:32px 32px 8px;">
          <div style="font-size:14px;font-weight:600;color:#A78BFA;letter-spacing:0.5px;margin-bottom:16px;">DELVE · ${escapeHtml(campaignName)}</div>
          <h1 style="margin:0 0 8px;font-size:22px;color:#FAFAFA;font-weight:600;">A new session is on the horizon</h1>
          <p style="margin:0 0 20px;color:#A1A1AA;font-size:14px;line-height:1.5;">
            Hey ${escapeHtml(playerName)}, your DM has scheduled the next chapter.
          </p>
          <div style="background-color:rgba(124,58,237,0.10);border:1px solid rgba(124,58,237,0.25);border-radius:12px;padding:18px;">
            <p style="margin:0 0 4px;color:#FAFAFA;font-size:17px;font-weight:600;">${escapeHtml(eventTitle)}</p>
            <p style="margin:0;color:#D4D4D8;font-size:13px;">${escapeHtml(dateStr)}</p>
            ${locationLine}
          </div>
          ${recapBlock}
          <p style="margin:24px 0 12px;color:#FAFAFA;font-size:14px;font-weight:500;">Will you be there?</p>
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:8px;"><a href="${yesUrl}" style="display:inline-block;background-color:#059669;color:#FAFAFA;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500;">✓ Yes</a></td>
            <td style="padding-right:8px;"><a href="${maybeUrl}" style="display:inline-block;background-color:#CA8A04;color:#FAFAFA;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500;">? Maybe</a></td>
            <td><a href="${noUrl}" style="display:inline-block;background-color:#DC2626;color:#FAFAFA;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500;">✕ No</a></td>
          </tr></table>
          <p style="margin:20px 0 0;font-size:12px;color:#71717A;">
            Or <a href="${appUrl}" style="color:#A78BFA;text-decoration:underline;">open Delve</a> to RSVP and see who else is coming.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;color:#71717A;font-size:12px;line-height:1.5;">
            You received this because you opted in to campaign emails.
            ${unsubscribeLine}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

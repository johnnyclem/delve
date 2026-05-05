import { db, campaignMembersTable, notificationLogsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { generateUnsubscribeToken } from "./unsubscribe";

interface RecapNotificationParams {
  campaignId: number;
  sessionNumber: number;
  sessionTitle: string;
  sessionId: number;
}

type NotificationStatus = "sent" | "failed" | "skipped";

async function recordLog(entry: {
  sessionLogId: number;
  campaignId: number;
  userId: string;
  recipientName: string;
  email: string | null;
  status: NotificationStatus;
  reason?: string | null;
  errorMessage?: string | null;
  providerMessageId?: string | null;
}): Promise<void> {
  try {
    await db.insert(notificationLogsTable).values({
      sessionLogId: entry.sessionLogId,
      campaignId: entry.campaignId,
      userId: entry.userId,
      recipientName: entry.recipientName,
      email: entry.email,
      channel: "email",
      status: entry.status,
      reason: entry.reason ?? null,
      errorMessage: entry.errorMessage ?? null,
      providerMessageId: entry.providerMessageId ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to write notification log");
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

    let resend: import("resend").Resend | undefined;
    let skipReason: string | null = null;

    try {
      const { Resend } = await import("resend");
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        skipReason = "RESEND_API_KEY not configured";
        logger.info(
          { playerCount: players.length },
          "RESEND_API_KEY not configured — skipping email notifications",
        );
      } else {
        resend = new Resend(apiKey);
      }
    } catch {
      skipReason = "Resend package not available";
      logger.warn("Resend package not available — skipping email notifications");
    }

    let clerkClient;
    if (!skipReason) {
      try {
        const clerkModule = await import("@clerk/express");
        clerkClient = clerkModule.clerkClient;
      } catch {
        skipReason = "Clerk client not available";
        logger.warn("Clerk client not available — skipping email notifications");
      }
    }

    const appUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : process.env.APP_URL ?? "http://localhost:5173";

    const fromEmail = process.env.EMAIL_FROM ?? "Delve <notifications@resend.dev>";

    for (const player of players) {
      if (skipReason || !resend || !clerkClient) {
        await recordLog({
          sessionLogId: sessionId,
          campaignId,
          userId: player.userId,
          recipientName: player.displayName,
          email: null,
          status: "skipped",
          reason: skipReason ?? "Notification provider unavailable",
        });
        continue;
      }

      let email: string | null = null;
      try {
        const client = await clerkClient;
        const user = await client.users.getUser(player.userId);
        email = user.emailAddresses?.[0]?.emailAddress ?? null;
        if (!email) {
          logger.info({ userId: player.userId }, "No email found for user — skipping");
          await recordLog({
            sessionLogId: sessionId,
            campaignId,
            userId: player.userId,
            recipientName: player.displayName,
            email: null,
            status: "skipped",
            reason: "No email address on file",
          });
          continue;
        }

        let unsubscribeUrl: string | null = null;
        try {
          const token = generateUnsubscribeToken(campaignId, player.userId);
          unsubscribeUrl = `${appUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
        } catch (err) {
          logger.warn({ err }, "Could not build unsubscribe link — sending email without it");
        }

        const result = await resend.emails.send({
          from: fromEmail,
          to: email,
          subject: `New Recap: Session ${sessionNumber} — ${sessionTitle}`,
          html: buildRecapEmailHtml({
            playerName: player.displayName,
            sessionNumber,
            sessionTitle,
            appUrl,
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
          logger.error({ userId: player.userId, err: result.error }, "Resend returned error for recap email");
          await recordLog({
            sessionLogId: sessionId,
            campaignId,
            userId: player.userId,
            recipientName: player.displayName,
            email,
            status: "failed",
            errorMessage: message,
          });
        } else {
          logger.info({ userId: player.userId, email }, "Recap notification email sent");
          await recordLog({
            sessionLogId: sessionId,
            campaignId,
            userId: player.userId,
            recipientName: player.displayName,
            email,
            status: "sent",
            providerMessageId: result?.data?.id ?? null,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err, userId: player.userId }, "Failed to send recap notification email");
        await recordLog({
          sessionLogId: sessionId,
          campaignId,
          userId: player.userId,
          recipientName: player.displayName,
          email,
          status: "failed",
          errorMessage: message,
        });
      }
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

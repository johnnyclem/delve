import { Router, type IRouter } from "express";
import { db, campaignMembersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { verifyUnsubscribeToken } from "../lib/unsubscribe";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function applyUnsubscribe(token: string): Promise<
  | { ok: true; alreadyUnsubscribed: boolean }
  | { ok: false; status: number; message: string }
> {
  const decoded = verifyUnsubscribeToken(token);
  if (!decoded) {
    return { ok: false, status: 400, message: "Invalid or expired link." };
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
    return { ok: false, status: 404, message: "Subscription not found." };
  }

  if (!member.emailNotifications) {
    return { ok: true, alreadyUnsubscribed: true };
  }

  await db
    .update(campaignMembersTable)
    .set({ emailNotifications: false })
    .where(eq(campaignMembersTable.id, member.id));

  logger.info(
    { campaignId: decoded.campaignId, userId: decoded.userId },
    "Player unsubscribed from recap emails",
  );

  return { ok: true, alreadyUnsubscribed: false };
}

function renderPage(opts: {
  title: string;
  heading: string;
  body: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#09090B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090B;padding:80px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background-color:#18181B;border-radius:16px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">
        <tr><td style="padding:40px 32px;">
          <div style="font-size:14px;font-weight:600;color:#A78BFA;letter-spacing:0.5px;margin-bottom:20px;">DELVE</div>
          <h1 style="margin:0 0 12px;font-size:22px;color:#FAFAFA;font-weight:600;">${opts.heading}</h1>
          <p style="margin:0;color:#A1A1AA;font-size:14px;line-height:1.6;">${opts.body}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

router.get("/unsubscribe", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) {
    res.status(400).type("html").send(
      renderPage({
        title: "Unsubscribe — Delve",
        heading: "Invalid link",
        body: "This unsubscribe link is missing required information.",
      }),
    );
    return;
  }

  const result = await applyUnsubscribe(token);
  if (!result.ok) {
    res.status(result.status).type("html").send(
      renderPage({
        title: "Unsubscribe — Delve",
        heading: "We couldn't unsubscribe you",
        body: result.message,
      }),
    );
    return;
  }

  res.status(200).type("html").send(
    renderPage({
      title: "Unsubscribed — Delve",
      heading: result.alreadyUnsubscribed
        ? "You're already unsubscribed"
        : "You've been unsubscribed",
      body: result.alreadyUnsubscribed
        ? "No further recap emails will be sent for this campaign."
        : "We've turned off recap email notifications for this campaign. You can re-enable them anytime from your dashboard.",
    }),
  );
});

router.post("/unsubscribe", async (req, res): Promise<void> => {
  const token =
    (typeof req.query.token === "string" ? req.query.token : "") ||
    (typeof req.body?.token === "string" ? req.body.token : "");

  if (!token) {
    res.status(400).json({ error: "Missing token" });
    return;
  }

  const result = await applyUnsubscribe(token);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }
  res.status(200).json({
    ok: true,
    alreadyUnsubscribed: result.alreadyUnsubscribed,
  });
});

export default router;

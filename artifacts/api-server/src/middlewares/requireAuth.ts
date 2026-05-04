import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, campaignMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getOrCreateCampaign } from "../lib/campaign";

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as AuthenticatedRequest).userId = userId;
  (req as AuthenticatedRequest).sessionClaims = auth?.sessionClaims;
  next();
};

export const requireCampaignMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const userId = (req as AuthenticatedRequest).userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const campaignId = await getOrCreateCampaign();
  const [member] = await db
    .select()
    .from(campaignMembersTable)
    .where(and(eq(campaignMembersTable.campaignId, campaignId), eq(campaignMembersTable.userId, userId)));

  if (!member) {
    res.status(403).json({ error: "Not a campaign member" });
    return;
  }

  (req as AuthenticatedRequest).campaignMember = member;
  next();
};

interface AuthenticatedRequest extends Request {
  userId: string;
  sessionClaims: Record<string, unknown>;
  campaignMember?: typeof campaignMembersTable.$inferSelect;
}

export function getUserId(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}

export function getCampaignMember(req: Request): typeof campaignMembersTable.$inferSelect {
  return (req as AuthenticatedRequest).campaignMember!;
}

export function getUserDisplayName(req: Request): string {
  const claims = (req as AuthenticatedRequest).sessionClaims;
  if (claims?.firstName && claims?.lastName) return `${claims.firstName} ${claims.lastName}`;
  if (claims?.firstName) return String(claims.firstName);
  if (claims?.fullName) return String(claims.fullName);
  if (claims?.name) return String(claims.name);
  if (claims?.email) return String(claims.email).split("@")[0];
  return "Adventurer";
}

export function getUserAvatarUrl(req: Request): string | null {
  const claims = (req as AuthenticatedRequest).sessionClaims;
  return (claims?.imageUrl ?? claims?.image_url ?? claims?.profileImageUrl ?? null) as string | null;
}

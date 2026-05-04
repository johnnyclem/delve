import crypto from "node:crypto";
import { db, campaignsTable, campaignMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

let cachedCampaignId: number | null = null;

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export async function getOrCreateCampaign(): Promise<number> {
  if (cachedCampaignId) return cachedCampaignId;

  const [existing] = await db.select().from(campaignsTable).limit(1);
  if (existing) {
    cachedCampaignId = existing.id;
    return existing.id;
  }

  const [created] = await db
    .insert(campaignsTable)
    .values({ name: "The Campaign", dmUserId: "pending", inviteCode: generateInviteCode() })
    .returning();

  cachedCampaignId = created.id;
  return created.id;
}

export async function getCampaignInviteCode(campaignId: number): Promise<string> {
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  return campaign?.inviteCode ?? "";
}

export async function getMember(
  campaignId: number,
  userId: string,
): Promise<typeof campaignMembersTable.$inferSelect | null> {
  const [existing] = await db
    .select()
    .from(campaignMembersTable)
    .where(and(eq(campaignMembersTable.campaignId, campaignId), eq(campaignMembersTable.userId, userId)));
  return existing ?? null;
}

export async function syncMemberProfile(
  campaignId: number,
  userId: string,
  displayName: string,
  avatarUrl?: string | null,
): Promise<typeof campaignMembersTable.$inferSelect | null> {
  const existing = await getMember(campaignId, userId);
  if (!existing) return null;

  if (existing.displayName !== displayName || existing.avatarUrl !== (avatarUrl ?? null)) {
    const [updated] = await db
      .update(campaignMembersTable)
      .set({ displayName, avatarUrl: avatarUrl ?? null })
      .where(eq(campaignMembersTable.id, existing.id))
      .returning();
    return updated;
  }
  return existing;
}

export async function bootstrapDmIfNeeded(
  campaignId: number,
  userId: string,
  displayName: string,
  avatarUrl?: string | null,
): Promise<typeof campaignMembersTable.$inferSelect | null> {
  const existing = await getMember(campaignId, userId);
  if (existing) {
    return syncMemberProfile(campaignId, userId, displayName, avatarUrl);
  }

  const allMembers = await db
    .select()
    .from(campaignMembersTable)
    .where(eq(campaignMembersTable.campaignId, campaignId));

  if (allMembers.length > 0) {
    return null;
  }

  const [member] = await db
    .insert(campaignMembersTable)
    .values({
      campaignId,
      userId,
      role: "dm",
      displayName,
      avatarUrl: avatarUrl ?? null,
    })
    .returning();

  await db
    .update(campaignsTable)
    .set({ dmUserId: userId })
    .where(eq(campaignsTable.id, campaignId));

  return member;
}

export async function joinWithInviteCode(
  campaignId: number,
  inviteCode: string,
  userId: string,
  displayName: string,
  avatarUrl?: string | null,
): Promise<{ member: typeof campaignMembersTable.$inferSelect | null; error?: string }> {
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  if (!campaign || campaign.inviteCode !== inviteCode) {
    return { member: null, error: "Invalid invite code" };
  }

  const existing = await getMember(campaignId, userId);
  if (existing) {
    return { member: existing };
  }

  const [member] = await db
    .insert(campaignMembersTable)
    .values({
      campaignId,
      userId,
      role: "player",
      displayName,
      avatarUrl: avatarUrl ?? null,
    })
    .returning();

  return { member };
}

export async function isDm(campaignId: number, userId: string): Promise<boolean> {
  const member = await getMember(campaignId, userId);
  return member?.role === "dm";
}

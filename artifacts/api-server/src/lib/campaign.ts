import { db, campaignsTable, campaignMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

let cachedCampaignId: number | null = null;

export async function getOrCreateCampaign(): Promise<number> {
  if (cachedCampaignId) return cachedCampaignId;

  const [existing] = await db.select().from(campaignsTable).limit(1);
  if (existing) {
    cachedCampaignId = existing.id;
    return existing.id;
  }

  const [created] = await db
    .insert(campaignsTable)
    .values({ name: "The Campaign", dmUserId: "pending" })
    .returning();

  cachedCampaignId = created.id;
  return created.id;
}

export async function ensureMember(
  campaignId: number,
  userId: string,
  displayName: string,
  avatarUrl?: string | null,
): Promise<typeof campaignMembersTable.$inferSelect> {
  const [existing] = await db
    .select()
    .from(campaignMembersTable)
    .where(and(eq(campaignMembersTable.campaignId, campaignId), eq(campaignMembersTable.userId, userId)));

  if (existing) {
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

  const allMembers = await db
    .select()
    .from(campaignMembersTable)
    .where(eq(campaignMembersTable.campaignId, campaignId));

  const isFirstMember = allMembers.length === 0;

  const [member] = await db
    .insert(campaignMembersTable)
    .values({
      campaignId,
      userId,
      role: isFirstMember ? "dm" : "player",
      displayName,
      avatarUrl: avatarUrl ?? null,
    })
    .returning();

  if (isFirstMember) {
    await db
      .update(campaignsTable)
      .set({ dmUserId: userId })
      .where(eq(campaignsTable.id, campaignId));
  }

  return member;
}

export async function isDm(campaignId: number, userId: string): Promise<boolean> {
  const [member] = await db
    .select()
    .from(campaignMembersTable)
    .where(and(eq(campaignMembersTable.campaignId, campaignId), eq(campaignMembersTable.userId, userId)));

  return member?.role === "dm";
}

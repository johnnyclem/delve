import crypto from "node:crypto";
import { db, campaignsTable, campaignMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { seedCampaignWorldFromSrd } from "./seedWorld";
import { logger } from "./logger";

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

  // Seed brand-new campaigns with curated SRD starter content so DMs aren't
  // staring at an empty World panel. Failures here must not break campaign
  // creation; they're already logged inside the seeder, but we wrap with a
  // belt-and-suspenders try/catch.
  try {
    const summary = await seedCampaignWorldFromSrd(created.id);
    if (summary.bestiaryAvailable) {
      logger.info(
        {
          campaignId: created.id,
          added: summary.added,
          skipped: summary.skipped,
          missing: summary.missing.length,
        },
        "[campaign] seeded starter SRD content",
      );
    } else {
      logger.warn(
        { campaignId: created.id },
        "[campaign] SRD bestiary not ingested — skipping starter seed",
      );
    }
  } catch (err) {
    logger.error({ err, campaignId: created.id }, "[campaign] starter seed failed");
  }

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

export async function claimDmWithToken(
  campaignId: number,
  userId: string,
  displayName: string,
  avatarUrl?: string | null,
): Promise<typeof campaignMembersTable.$inferSelect> {
  const existing = await getMember(campaignId, userId);
  if (existing) {
    if (existing.role !== "dm") {
      const [updated] = await db
        .update(campaignMembersTable)
        .set({ role: "dm" })
        .where(eq(campaignMembersTable.id, existing.id))
        .returning();
      await db.update(campaignsTable).set({ dmUserId: userId }).where(eq(campaignsTable.id, campaignId));
      return updated;
    }
    return existing;
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

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  if (!campaign || campaign.dmUserId === "pending") {
    await db.update(campaignsTable).set({ dmUserId: userId }).where(eq(campaignsTable.id, campaignId));
  }

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

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  db,
  campaignsTable,
  chatThreadsTable,
  chatMessagesTable,
  charactersTable,
  campaignEntitiesTable,
  type SrdEdition,
} from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  requireAuth,
  requireCampaignMember,
  getUserId,
} from "../middlewares/requireAuth";
import { userRateLimit } from "../middlewares/userRateLimit";
import { getOrCreateCampaign, isDm } from "../lib/campaign";
import { embedQuery } from "../lib/entityEmbeddings";
import {
  retrieveReference,
  retrieveCampaign,
  retrieveHomebrew,
  type ReferenceHit,
  type CampaignHit,
  type HomebrewHit,
} from "../lib/retrieval";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const chatRateLimit = userRateLimit(60, 60 * 1000);

const CHAT_MODEL = "gpt-4o-mini";
const MAX_MESSAGE_LEN = 2000;
const HISTORY_VERBATIM_TURNS = 6;
const SUMMARIZE_AFTER_TURNS = HISTORY_VERBATIM_TURNS + 4;

const speakingAsField = z.union([z.number().int().positive(), z.null()]).optional();

const primedContextSchema = z.object({
  entityType: z.enum(["character", "campaign_entity"]),
  entityId: z.number().int().positive(),
  entityName: z.string().max(200),
}).optional();

const chatBody = z.object({
  message: z.string().min(1).max(MAX_MESSAGE_LEN),
  conversationId: z.number().int().positive().nullish(),
  speakingAsCharacterId: speakingAsField,
  primedContext: primedContextSchema,
});

interface Citation {
  source: "srd-2014" | "srd-2024" | "campaign" | "homebrew" | "character";
  entityKind: string;
  entityName: string;
  chunkId: number;
  sourceField?: "public_md" | "secret_md" | "dm_notes";
  sourceUrl?: string | null;
}

interface MeBlock {
  contextLines: string[];
  citation: Citation;
}

function summariseSheetForChat(char: typeof charactersTable.$inferSelect): MeBlock {
  const sheet = (char.sheetJson ?? {}) as Record<string, unknown>;
  const num = (k: string): number | null => {
    const v = sheet[k];
    return typeof v === "number" ? v : null;
  };
  const arrStr = (k: string, cap = 24): string[] => {
    const v = sheet[k];
    if (!Array.isArray(v)) return [];
    return v.filter((x) => typeof x === "string").slice(0, cap) as string[];
  };

  const lines: string[] = [];
  lines.push(`[ME] CHARACTER — ${char.name}`);
  lines.push(`Race: ${char.race} · Class: ${char.class} · Level: ${char.level}`);
  const bg = typeof sheet.background === "string" ? sheet.background : null;
  if (bg) lines.push(`Background: ${bg}`);

  const hp = `${num("currentHp") ?? "?"} / ${num("maxHp") ?? "?"}`;
  const ac = num("armorClass");
  const speed = num("speed");
  const pb = num("proficiencyBonus");
  lines.push(
    `HP: ${hp}${ac !== null ? ` · AC: ${ac}` : ""}${speed !== null ? ` · Speed: ${speed}` : ""}${pb !== null ? ` · Prof Bonus: +${pb}` : ""}`,
  );

  const abilities = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]
    .map((a) => {
      const v = num(a);
      return v !== null ? `${a.slice(0, 3).toUpperCase()} ${v}` : null;
    })
    .filter((s): s is string => s !== null);
  if (abilities.length > 0) lines.push(`Abilities: ${abilities.join(", ")}`);

  const saves = arrStr("savingThrows");
  if (saves.length > 0) lines.push(`Proficient saves: ${saves.join(", ")}`);
  const skills = arrStr("skills");
  if (skills.length > 0) lines.push(`Proficient skills: ${skills.join(", ")}`);

  const cantrips = arrStr("cantrips");
  if (cantrips.length > 0) lines.push(`Cantrips known: ${cantrips.join(", ")}`);

  const spells = sheet.spells;
  if (Array.isArray(spells) && spells.length > 0) {
    const formatted = spells
      .slice(0, 40)
      .map((s) => {
        if (!s || typeof s !== "object") return null;
        const obj = s as Record<string, unknown>;
        const nm = typeof obj.name === "string" ? obj.name : null;
        if (!nm) return null;
        const lvl = typeof obj.level === "number" ? obj.level : null;
        const prep = obj.prepared === true ? " (prepared)" : "";
        return `${nm}${lvl !== null ? ` [L${lvl}]` : ""}${prep}`;
      })
      .filter((s): s is string => s !== null);
    if (formatted.length > 0) lines.push(`Spells: ${formatted.join(", ")}`);
  }

  const slots = sheet.spellSlots;
  if (slots && typeof slots === "object" && !Array.isArray(slots)) {
    const slotLines = Object.entries(slots as Record<string, unknown>)
      .map(([lvl, v]) => {
        if (!v || typeof v !== "object") return null;
        const o = v as Record<string, unknown>;
        const total = typeof o.total === "number" ? o.total : null;
        const used = typeof o.used === "number" ? o.used : null;
        if (total === null) return null;
        return `L${lvl}: ${total - (used ?? 0)}/${total}`;
      })
      .filter((s): s is string => s !== null);
    if (slotLines.length > 0) lines.push(`Spell slots (remaining/total): ${slotLines.join(", ")}`);
  }

  const feats = arrStr("feats");
  if (feats.length > 0) lines.push(`Feats: ${feats.join(", ")}`);

  const inventory = arrStr("inventory", 30);
  if (inventory.length > 0) lines.push(`Inventory: ${inventory.join(", ")}`);

  const attacks = sheet.attacks;
  if (Array.isArray(attacks) && attacks.length > 0) {
    const fmt = attacks
      .slice(0, 12)
      .map((a) => {
        if (!a || typeof a !== "object") return null;
        const o = a as Record<string, unknown>;
        const nm = typeof o.name === "string" ? o.name : null;
        if (!nm) return null;
        const bonus = typeof o.bonus === "number" ? `+${o.bonus} to hit` : null;
        const dmg = typeof o.damage === "string" ? o.damage : null;
        return [nm, bonus, dmg].filter(Boolean).join(", ");
      })
      .filter((s): s is string => s !== null);
    if (fmt.length > 0) lines.push(`Attacks: ${fmt.join(" · ")}`);
  }

  return {
    contextLines: lines,
    citation: {
      source: "character",
      entityKind: "character",
      entityName: char.name,
      chunkId: char.id,
    },
  };
}

interface PrimedEntityBlock {
  lines: string[];
  citation: Citation;
}

function buildContextBlock(
  refHits: ReferenceHit[],
  campHits: CampaignHit[],
  homeHits: HomebrewHit[],
  isDmRequester: boolean,
  meBlock: MeBlock | null,
  primedEntityBlock: PrimedEntityBlock | null = null,
): { context: string; citations: Citation[] } {
  const lines: string[] = [];
  const citations: Citation[] = [];
  let cursor = 1;

  if (primedEntityBlock) {
    const tag = `[C${cursor}]`;
    lines.push("## Focus entity (the user is asking specifically about this)");
    lines.push(`${tag} ${primedEntityBlock.lines.join("\n")}\n`);
    citations.push(primedEntityBlock.citation);
    cursor += 1;
  }

  if (meBlock) {
    const tag = `[M${cursor}]`;
    lines.push("## You — the asking user's character (use when the question is personal: \"I\", \"my\", \"me\")");
    lines.push(`${tag} CHARACTER — ${meBlock.citation.entityName}\n${meBlock.contextLines.join("\n")}\n`);
    citations.push(meBlock.citation);
    cursor += 1;
  }

  if (homeHits.length > 0) {
    lines.push("## House rules (override SRD when they conflict)");
    for (const h of homeHits) {
      const tag = `[H${cursor}]`;
      lines.push(`${tag} HOUSE RULE — ${h.title}\n${h.bodyMd}\n`);
      citations.push({
        source: "homebrew",
        entityKind: "house_rule",
        entityName: h.title,
        chunkId: h.ruleId,
      });
      cursor += 1;
    }
  }

  if (campHits.length > 0) {
    lines.push("## Campaign-specific context (prefer this when relevant)");
    for (const h of campHits) {
      const tag = `[C${cursor}]`;
      const fieldNote = isDmRequester ? ` (${h.sourceField})` : "";
      lines.push(
        `${tag} ${h.entityKind.toUpperCase()} — ${h.entityName}${fieldNote}\n${h.bodyMd}\n`,
      );
      citations.push({
        source: "campaign",
        entityKind: h.entityKind,
        entityName: h.entityName,
        chunkId: h.chunkId,
        ...(isDmRequester ? { sourceField: h.sourceField } : {}),
      });
      cursor += 1;
    }
  }

  if (refHits.length > 0) {
    lines.push("## SRD reference context");
    for (const h of refHits) {
      const tag = `[R${cursor}]`;
      lines.push(
        `${tag} ${h.entityKind.toUpperCase()} — ${h.title}${h.section ? ` (${h.section})` : ""}\n${h.bodyMd}\n`,
      );
      citations.push({
        source: h.edition === "2014" ? "srd-2014" : "srd-2024",
        entityKind: h.entityKind,
        entityName: h.title,
        chunkId: h.chunkId,
        sourceUrl: h.sourceUrl,
      });
      cursor += 1;
    }
  }

  return { context: lines.join("\n"), citations };
}

const SYSTEM_PROMPT = `You are Delve, a knowledgeable D&D assistant for a specific campaign. You answer questions about D&D rules and the campaign's lore.

Rules for answering:
- Only use information from the provided context blocks. Never fabricate rules, NPCs, locations, or campaign details that aren't in the context.
- If the context doesn't contain enough information to answer, say so honestly.
- House rules ([H#]) override the SRD whenever they conflict. Mention the house rule explicitly and note the standard 5e default afterward when relevant.
- When campaign-specific context ([C#]) and SRD context ([R#]) both apply, prefer the campaign-specific information (the DM has authored it for this world).
- If no house rule applies, follow the SRD reference normally.
- Cite your sources inline using the bracket tags shown in the context (e.g., [C1], [R2]). Use multiple citations when synthesizing across sources.
- If a CHARACTER block tagged [M#] is present, the user is asking from the perspective of that character. When the question is personal ("I", "my", "me", "our"), prefer the [M#] block — answer concretely from that sheet (name them, list their actual cantrips/spells/HP/feats, etc.) and cite the [M#] tag. Combine with [R#] for rules mechanics when useful.
- If no [M#] block is present and the user asks a personal question, say you don't know which character is asking and suggest they pick one from the "Speaking as" menu.
- The user may ask follow-up questions that refer back to earlier turns ("her sister", "the same place", etc.). Use the prior conversation to resolve those references.
- Be concise. Use markdown for structure when helpful.`;

function deriveTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned || "New conversation";
  return `${cleaned.slice(0, 57)}…`;
}

async function summarizeOlderTurns(
  existingSummary: string | null,
  olderMessages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  if (olderMessages.length === 0) return existingSummary ?? "";
  const transcript = olderMessages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  const prompt = `${existingSummary ? `Existing running summary of the conversation so far:\n${existingSummary}\n\n` : ""}New older turns to fold into the summary:\n${transcript}\n\nWrite a concise running summary (max ~120 words) capturing facts, names, and unresolved questions that future turns may reference. Do not include citation tags.`;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: "You compress chat history into a short factual summary." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 220,
    });
    return completion.choices[0]?.message?.content?.trim() || (existingSummary ?? "");
  } catch (err) {
    logger.error({ err }, "[chat] summary update failed");
    return existingSummary ?? "";
  }
}

router.get("/chat/threads", chatRateLimit, requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const rows = await db
    .select({
      id: chatThreadsTable.id,
      title: chatThreadsTable.title,
      speakingAsCharacterId: chatThreadsTable.speakingAsCharacterId,
      createdAt: chatThreadsTable.createdAt,
      updatedAt: chatThreadsTable.updatedAt,
    })
    .from(chatThreadsTable)
    .where(and(eq(chatThreadsTable.campaignId, campaignId), eq(chatThreadsTable.userId, userId)))
    .orderBy(desc(chatThreadsTable.updatedAt));
  res.json(rows);
});

router.get("/chat/threads/:id", chatRateLimit, requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  const [thread] = await db
    .select()
    .from(chatThreadsTable)
    .where(and(
      eq(chatThreadsTable.id, id),
      eq(chatThreadsTable.campaignId, campaignId),
      eq(chatThreadsTable.userId, userId),
    ));
  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  const messages = await db
    .select({
      id: chatMessagesTable.id,
      role: chatMessagesTable.role,
      content: chatMessagesTable.content,
      createdAt: chatMessagesTable.createdAt,
    })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.threadId, id))
    .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.id));
  res.json({
    thread: {
      id: thread.id,
      title: thread.title,
      speakingAsCharacterId: thread.speakingAsCharacterId,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    },
    messages,
  });
});

const updateThreadBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    speakingAsCharacterId: speakingAsField,
  })
  .refine(
    (d) => d.title !== undefined || d.speakingAsCharacterId !== undefined,
    { message: "At least one of title or speakingAsCharacterId is required" },
  );

router.patch("/chat/threads/:id", chatRateLimit, requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  const parsed = updateThreadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // If a character is being assigned, validate it before persisting.
  if (typeof parsed.data.speakingAsCharacterId === "number") {
    const validated = await resolveSpeakingAsCharacter(
      parsed.data.speakingAsCharacterId,
      campaignId,
      userId,
    );
    if (!validated) {
      res.status(403).json({ error: "Cannot speak as that character" });
      return;
    }
  }

  const updateSet: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updateSet.title = parsed.data.title;
  if (parsed.data.speakingAsCharacterId !== undefined) {
    updateSet.speakingAsCharacterId = parsed.data.speakingAsCharacterId;
  }

  const [updated] = await db
    .update(chatThreadsTable)
    .set(updateSet)
    .where(and(
      eq(chatThreadsTable.id, id),
      eq(chatThreadsTable.campaignId, campaignId),
      eq(chatThreadsTable.userId, userId),
    ))
    .returning({
      id: chatThreadsTable.id,
      title: chatThreadsTable.title,
      speakingAsCharacterId: chatThreadsTable.speakingAsCharacterId,
      createdAt: chatThreadsTable.createdAt,
      updatedAt: chatThreadsTable.updatedAt,
    });
  if (!updated) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  res.json(updated);
});

/**
 * Validate that `userId` is allowed to speak as `characterId` in `campaignId`,
 * and return the row if so. Allowed when (a) the character is owned by the
 * user, or (b) the user is the campaign DM. Always re-checked server-side so
 * a transferred or deleted character degrades gracefully.
 */
async function resolveSpeakingAsCharacter(
  characterId: number,
  campaignId: number,
  userId: string,
): Promise<typeof charactersTable.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(charactersTable)
    .where(and(
      eq(charactersTable.id, characterId),
      eq(charactersTable.campaignId, campaignId),
      eq(charactersTable.isActive, true),
    ));
  if (!row) return null;
  if (row.ownerUserId === userId) return row;
  const dm = await isDm(campaignId, userId);
  return dm ? row : null;
}

router.delete("/chat/threads/:id", chatRateLimit, requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  const deleted = await db
    .delete(chatThreadsTable)
    .where(and(
      eq(chatThreadsTable.id, id),
      eq(chatThreadsTable.campaignId, campaignId),
      eq(chatThreadsTable.userId, userId),
    ))
    .returning({ id: chatThreadsTable.id });
  if (deleted.length === 0) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  res.json({ success: true });
});

type LlmMessage = { role: "system" | "user" | "assistant"; content: string };
type PriorMessage = { role: string; content: string };

interface PreparedRequest {
  threadId: number;
  threadSummary: string | null;
  priorMessages: PriorMessage[];
  edition: SrdEdition;
  citations: Citation[];
  llmMessages: LlmMessage[];
}

type PrepareResult =
  | { ok: true; prepared: PreparedRequest }
  | { ok: false; status: number; error: string };

type PrimedContextInput = {
  entityType: "character" | "campaign_entity";
  entityId: number;
  entityName: string;
} | undefined;

async function resolvePrimedEntityBlock(
  primedContext: PrimedContextInput,
  campaignId: number,
  userId: string,
  dmRequester: boolean,
): Promise<PrimedEntityBlock | null> {
  if (!primedContext) return null;

  if (primedContext.entityType === "character") {
    const char = await resolveSpeakingAsCharacter(primedContext.entityId, campaignId, userId);
    if (!char) return null;
    const block = summariseSheetForChat(char);
    return {
      lines: [`CHARACTER — ${char.name}`, ...block.contextLines],
      citation: {
        source: "character",
        entityKind: "character",
        entityName: char.name,
        chunkId: char.id,
      },
    };
  }

  if (primedContext.entityType === "campaign_entity") {
    const [entity] = await db
      .select()
      .from(campaignEntitiesTable)
      .where(
        and(
          eq(campaignEntitiesTable.id, primedContext.entityId),
          eq(campaignEntitiesTable.campaignId, campaignId),
        ),
      );
    if (!entity) return null;
    if (!dmRequester && !entity.revealed) return null;

    const entityLines: string[] = [];
    entityLines.push(`${entity.kind.toUpperCase()} — ${entity.name}`);

    const dataEntries = Object.entries((entity.data as Record<string, unknown>) ?? {});
    for (const [key, val] of dataEntries) {
      if (val !== null && val !== undefined && val !== "") {
        entityLines.push(`${key}: ${String(val)}`);
      }
    }

    if (entity.publicMd) {
      entityLines.push(`Description: ${entity.publicMd}`);
    }
    if (dmRequester) {
      if (entity.dmNotes) entityLines.push(`DM Notes: ${entity.dmNotes}`);
      if (entity.secretMd) entityLines.push(`Secret Lore: ${entity.secretMd}`);
      if (entity.trueMotivation) entityLines.push(`True Motivation: ${entity.trueMotivation}`);
    }

    return {
      lines: entityLines,
      citation: {
        source: "campaign",
        entityKind: entity.kind,
        entityName: entity.name,
        chunkId: entity.id,
      },
    };
  }

  return null;
}

async function prepareChatRequest(
  req: Request,
  message: string,
  conversationId: number | null | undefined,
  bodySpeakingAs: number | null | undefined,
  primedContext?: PrimedContextInput,
): Promise<PrepareResult> {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const dmRequester = await isDm(campaignId, userId);

  const [campaign] = await db
    .select({ defaultEdition: campaignsTable.defaultEdition })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  const edition =
    (campaign?.defaultEdition as SrdEdition | undefined) ?? "2024";

  let threadId: number;
  let threadSummary: string | null = null;
  let threadSpeakingAs: number | null = null;
  if (conversationId) {
    const [existing] = await db
      .select()
      .from(chatThreadsTable)
      .where(and(
        eq(chatThreadsTable.id, conversationId),
        eq(chatThreadsTable.campaignId, campaignId),
        eq(chatThreadsTable.userId, userId),
      ));
    if (!existing) {
      return { ok: false, status: 404, error: "Conversation not found" };
    }
    threadId = existing.id;
    threadSummary = existing.summary;
    threadSpeakingAs = existing.speakingAsCharacterId ?? null;
  } else {
    const [created] = await db
      .insert(chatThreadsTable)
      .values({ campaignId, userId, title: deriveTitle(message) })
      .returning();
    threadId = created.id;
  }

  // Resolve & persist any explicit speaking-as choice from this turn's body.
  // undefined → no change; null → clear; positive int → validate then set.
  if (bodySpeakingAs !== undefined && bodySpeakingAs !== threadSpeakingAs) {
    if (bodySpeakingAs === null) {
      await db
        .update(chatThreadsTable)
        .set({ speakingAsCharacterId: null })
        .where(eq(chatThreadsTable.id, threadId));
      threadSpeakingAs = null;
    } else {
      const validated = await resolveSpeakingAsCharacter(bodySpeakingAs, campaignId, userId);
      if (!validated) {
        return { ok: false, status: 403, error: "Cannot speak as that character" };
      }
      await db
        .update(chatThreadsTable)
        .set({ speakingAsCharacterId: bodySpeakingAs })
        .where(eq(chatThreadsTable.id, threadId));
      threadSpeakingAs = bodySpeakingAs;
    }
  }

  // Resolve which character (if any) is in scope for this turn.
  // Precedence: thread.speakingAsCharacterId (re-validated) > non-DM auto-pick
  // when the user owns exactly one active character > none.
  let activeCharacter: typeof charactersTable.$inferSelect | null = null;
  if (threadSpeakingAs !== null) {
    activeCharacter = await resolveSpeakingAsCharacter(threadSpeakingAs, campaignId, userId);
  } else if (!dmRequester) {
    const myChars = await db
      .select()
      .from(charactersTable)
      .where(and(
        eq(charactersTable.campaignId, campaignId),
        eq(charactersTable.ownerUserId, userId),
        eq(charactersTable.isActive, true),
      ));
    if (myChars.length === 1) activeCharacter = myChars[0];
  }
  const meBlock = activeCharacter ? summariseSheetForChat(activeCharacter) : null;

  const primedEntityBlock = await resolvePrimedEntityBlock(
    primedContext,
    campaignId,
    userId,
    dmRequester,
  );

  const priorMessages = await db
    .select({ role: chatMessagesTable.role, content: chatMessagesTable.content })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.threadId, threadId))
    .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.id));

  const verbatim = priorMessages.slice(-HISTORY_VERBATIM_TURNS);

  // Augment the retrieval query with the entity name so we surface more
  // relevant context for that entity alongside the user's specific question.
  const retrievalQuery = primedContext
    ? `${primedContext.entityName} ${message}`.trim()
    : message;

  const queryEmbedding = await embedQuery(retrievalQuery);

  const [refHits, campHits, homeHits] = await Promise.all([
    retrieveReference(retrievalQuery, queryEmbedding, edition).catch((err) => {
      logger.error({ err }, "[chat] reference retrieval failed");
      return [] as ReferenceHit[];
    }),
    retrieveCampaign(retrievalQuery, queryEmbedding, campaignId, {
      isDm: dmRequester,
    }).catch((err) => {
      logger.error({ err }, "[chat] campaign retrieval failed");
      return [] as CampaignHit[];
    }),
    retrieveHomebrew(retrievalQuery, queryEmbedding, campaignId).catch((err) => {
      logger.error({ err }, "[chat] homebrew retrieval failed");
      return [] as HomebrewHit[];
    }),
  ]);

  const { context, citations } = buildContextBlock(
    refHits,
    campHits,
    homeHits,
    dmRequester,
    meBlock,
    primedEntityBlock,
  );

  const contextBlock = context
    ? `Retrieved context for this turn:\n\n${context}\n\n`
    : `(No retrieved context available for this turn.)\n\n`;
  const summaryBlock = threadSummary
    ? `Earlier-conversation summary:\n${threadSummary}\n\n`
    : "";
  const userPrompt = `${summaryBlock}${contextBlock}Question: ${message}`;

  const llmMessages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...verbatim.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: userPrompt },
  ];

  return {
    ok: true,
    prepared: {
      threadId,
      threadSummary,
      priorMessages,
      edition,
      citations,
      llmMessages,
    },
  };
}

async function persistTurn(
  threadId: number,
  question: string,
  answer: string,
  priorMessages: PriorMessage[],
  threadSummary: string | null,
): Promise<void> {
  await db.insert(chatMessagesTable).values([
    { threadId, role: "user", content: question },
    { threadId, role: "assistant", content: answer },
  ]);
  await db
    .update(chatThreadsTable)
    .set({ updatedAt: new Date() })
    .where(eq(chatThreadsTable.id, threadId));

  const totalAfter = priorMessages.length + 2;
  if (totalAfter >= SUMMARIZE_AFTER_TURNS) {
    const olderToFold = priorMessages.slice(
      0,
      Math.max(0, priorMessages.length - HISTORY_VERBATIM_TURNS),
    );
    if (olderToFold.length > 0) {
      const newSummary = await summarizeOlderTurns(
        threadSummary,
        olderToFold.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      );
      if (newSummary && newSummary !== threadSummary) {
        await db
          .update(chatThreadsTable)
          .set({ summary: newSummary })
          .where(eq(chatThreadsTable.id, threadId));
      }
    }
  }
}

router.post("/chat", chatRateLimit, requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const parsed = chatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const message = parsed.data.message.trim();
  const result = await prepareChatRequest(
    req,
    message,
    parsed.data.conversationId,
    parsed.data.speakingAsCharacterId,
    parsed.data.primedContext,
  );
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const { threadId, threadSummary, priorMessages, edition, citations, llmMessages } =
    result.prepared;

  let answer: string;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: llmMessages,
      temperature: 0.3,
      max_tokens: 800,
    });
    answer = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!answer)
      answer = "I couldn't produce a response. Try rephrasing your question.";
  } catch (err) {
    logger.error({ err }, "[chat] LLM completion failed");
    res.status(502).json({ error: "Chat service is temporarily unavailable" });
    return;
  }

  await persistTurn(threadId, message, answer, priorMessages, threadSummary);

  res.json({
    answer,
    citations,
    edition,
    conversationId: threadId,
  });
});

function writeSseEvent(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

router.post(
  "/chat/stream",
  chatRateLimit,
  requireAuth,
  requireCampaignMember,
  async (req, res): Promise<void> => {
    const parsed = chatBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    let clientClosed = false;
    req.on("close", () => {
      clientClosed = true;
    });

    const message = parsed.data.message.trim();

    let result: PrepareResult;
    try {
      result = await prepareChatRequest(
        req,
        message,
        parsed.data.conversationId,
        parsed.data.speakingAsCharacterId,
        parsed.data.primedContext,
      );
    } catch (err) {
      logger.error({ err }, "[chat/stream] retrieval failed");
      writeSseEvent(res, {
        type: "error",
        error: "Failed to prepare context. Please try again.",
      });
      res.end();
      return;
    }

    if (!result.ok) {
      writeSseEvent(res, { type: "error", error: result.error });
      res.end();
      return;
    }

    const { threadId, threadSummary, priorMessages, edition, citations, llmMessages } =
      result.prepared;

    // Surface the conversation id immediately so the client can record it
    // (especially important when starting a brand-new thread).
    writeSseEvent(res, { type: "metadata", conversationId: threadId });

    if (clientClosed) {
      res.end();
      return;
    }

    let produced = "";
    try {
      const stream = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: llmMessages,
        temperature: 0.3,
        max_tokens: 800,
        stream: true,
      });

      for await (const chunk of stream) {
        if (clientClosed) {
          stream.controller.abort();
          return;
        }
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          produced += delta;
          writeSseEvent(res, { type: "token", value: delta });
        }
      }

      let answer = produced.trim();
      if (!answer) {
        answer = "I couldn't produce a response. Try rephrasing your question.";
        writeSseEvent(res, { type: "token", value: answer });
      }

      writeSseEvent(res, {
        type: "citations",
        citations,
        edition,
      });

      try {
        await persistTurn(threadId, message, answer, priorMessages, threadSummary);
      } catch (err) {
        logger.error({ err }, "[chat/stream] failed to persist turn");
      }

      writeSseEvent(res, { type: "done", conversationId: threadId });
      res.end();
    } catch (err) {
      logger.error({ err }, "[chat/stream] LLM streaming failed");
      writeSseEvent(res, {
        type: "error",
        error:
          produced.length > 0
            ? "The connection to the assistant was interrupted."
            : "Chat service is temporarily unavailable.",
      });
      res.end();
    }
  },
);

export default router;

import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  campaignsTable,
  chatThreadsTable,
  chatMessagesTable,
  type SrdEdition,
} from "@workspace/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  requireAuth,
  requireCampaignMember,
  getUserId,
} from "../middlewares/requireAuth";
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

const CHAT_MODEL = "gpt-4o-mini";
const MAX_MESSAGE_LEN = 2000;
// How many recent (user+assistant) messages from history to include verbatim
// in the LLM context. Older turns get folded into the thread summary so we
// don't blow the token budget.
const HISTORY_VERBATIM_TURNS = 6;
// When the verbatim window slides forward, summarize the displaced messages
// into the thread `summary` field. We only summarize once we have enough
// older turns to make it worthwhile.
const SUMMARIZE_AFTER_TURNS = HISTORY_VERBATIM_TURNS + 4;

const chatBody = z.object({
  message: z.string().min(1).max(MAX_MESSAGE_LEN),
  conversationId: z.number().int().positive().nullish(),
});

interface Citation {
  source: "srd-2014" | "srd-2024" | "campaign" | "homebrew";
  entityKind: string;
  entityName: string;
  chunkId: number;
  // For player citations on campaign chunks the source field is omitted; for
  // DMs we expose which secret field the chunk came from.
  sourceField?: "public_md" | "secret_md" | "dm_notes";
  sourceUrl?: string | null;
}

function buildContextBlock(
  refHits: ReferenceHit[],
  campHits: CampaignHit[],
  homeHits: HomebrewHit[],
  isDmRequester: boolean,
): { context: string; citations: Citation[] } {
  const lines: string[] = [];
  const citations: Citation[] = [];
  let cursor = 1;

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
- The user may ask follow-up questions that refer back to earlier turns ("her sister", "the same place", etc.). Use the prior conversation to resolve those references.
- Be concise. Use markdown for structure when helpful.`;

function deriveTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned || "New conversation";
  return `${cleaned.slice(0, 57)}…`;
}

async function summarizeOlderTurns(existingSummary: string | null, olderMessages: { role: "user" | "assistant"; content: string }[]): Promise<string> {
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

router.get("/chat/threads", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const rows = await db
    .select({
      id: chatThreadsTable.id,
      title: chatThreadsTable.title,
      createdAt: chatThreadsTable.createdAt,
      updatedAt: chatThreadsTable.updatedAt,
    })
    .from(chatThreadsTable)
    .where(and(eq(chatThreadsTable.campaignId, campaignId), eq(chatThreadsTable.userId, userId)))
    .orderBy(desc(chatThreadsTable.updatedAt));
  res.json(rows);
});

router.get("/chat/threads/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
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
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    },
    messages,
  });
});

router.delete("/chat/threads/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
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

router.post("/chat", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const parsed = chatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const dmRequester = await isDm(campaignId, userId);

  const [campaign] = await db
    .select({ defaultEdition: campaignsTable.defaultEdition })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  const edition = (campaign?.defaultEdition as SrdEdition | undefined) ?? "2024";

  const message = parsed.data.message.trim();

  // Resolve or create the thread.
  let threadId: number;
  let threadSummary: string | null = null;
  if (parsed.data.conversationId) {
    const [existing] = await db
      .select()
      .from(chatThreadsTable)
      .where(and(
        eq(chatThreadsTable.id, parsed.data.conversationId),
        eq(chatThreadsTable.campaignId, campaignId),
        eq(chatThreadsTable.userId, userId),
      ));
    if (!existing) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    threadId = existing.id;
    threadSummary = existing.summary;
  } else {
    const [created] = await db
      .insert(chatThreadsTable)
      .values({ campaignId, userId, title: deriveTitle(message) })
      .returning();
    threadId = created.id;
  }

  // Load prior messages for history context.
  const priorMessages = await db
    .select({ role: chatMessagesTable.role, content: chatMessagesTable.content })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.threadId, threadId))
    .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.id));

  const verbatim = priorMessages.slice(-HISTORY_VERBATIM_TURNS);

  const queryEmbedding = await embedQuery(message);

  const [refHits, campHits, homeHits] = await Promise.all([
    retrieveReference(message, queryEmbedding, edition).catch((err) => {
      logger.error({ err }, "[chat] reference retrieval failed");
      return [] as ReferenceHit[];
    }),
    retrieveCampaign(message, queryEmbedding, campaignId, { isDm: dmRequester }).catch((err) => {
      logger.error({ err }, "[chat] campaign retrieval failed");
      return [] as CampaignHit[];
    }),
    retrieveHomebrew(message, queryEmbedding, campaignId).catch((err) => {
      logger.error({ err }, "[chat] homebrew retrieval failed");
      return [] as HomebrewHit[];
    }),
  ]);

  const { context, citations } = buildContextBlock(refHits, campHits, homeHits, dmRequester);

  const contextBlock = context
    ? `Retrieved context for this turn:\n\n${context}\n\n`
    : `(No retrieved context available for this turn.)\n\n`;
  const summaryBlock = threadSummary
    ? `Earlier-conversation summary:\n${threadSummary}\n\n`
    : "";
  const userPrompt = `${summaryBlock}${contextBlock}Question: ${message}`;

  const llmMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...verbatim.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: userPrompt },
  ];

  let answer: string;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: llmMessages,
      temperature: 0.3,
      max_tokens: 800,
    });
    answer = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!answer) answer = "I couldn't produce a response. Try rephrasing your question.";
  } catch (err) {
    logger.error({ err }, "[chat] LLM completion failed");
    res.status(502).json({ error: "Chat service is temporarily unavailable" });
    return;
  }

  // Persist the new turn.
  await db.insert(chatMessagesTable).values([
    { threadId, role: "user", content: message },
    { threadId, role: "assistant", content: answer },
  ]);
  await db
    .update(chatThreadsTable)
    .set({ updatedAt: new Date() })
    .where(eq(chatThreadsTable.id, threadId));

  // If we now have enough older history to warrant summarizing, fold the
  // displaced (older-than-verbatim) turns into the running thread summary so
  // future calls keep context without growing the prompt unbounded.
  const totalAfter = priorMessages.length + 2;
  if (totalAfter >= SUMMARIZE_AFTER_TURNS) {
    const olderToFold = priorMessages.slice(0, Math.max(0, priorMessages.length - HISTORY_VERBATIM_TURNS));
    if (olderToFold.length > 0) {
      const newSummary = await summarizeOlderTurns(threadSummary, olderToFold.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })));
      if (newSummary && newSummary !== threadSummary) {
        await db
          .update(chatThreadsTable)
          .set({ summary: newSummary })
          .where(eq(chatThreadsTable.id, threadId));
      }
    }
  }

  res.json({
    answer,
    citations,
    edition,
    conversationId: threadId,
  });
});

export default router;

import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, campaignsTable, type SrdEdition } from "@workspace/db";
import { eq } from "drizzle-orm";
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
  type ReferenceHit,
  type CampaignHit,
} from "../lib/retrieval";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CHAT_MODEL = "gpt-4o-mini";
const MAX_MESSAGE_LEN = 2000;

const chatBody = z.object({
  message: z.string().min(1).max(MAX_MESSAGE_LEN),
});

interface Citation {
  source: "srd-2014" | "srd-2024" | "campaign";
  entityKind: string;
  entityName: string;
  chunkId: number;
  // For player citations on campaign chunks the source field is omitted; for
  // DMs we expose which secret field the chunk came from.
  sourceField?: "public_md" | "secret_md" | "dm_notes";
  sourceUrl?: string | null;
}

function buildContextBlock(refHits: ReferenceHit[], campHits: CampaignHit[], isDmRequester: boolean): { context: string; citations: Citation[] } {
  const lines: string[] = [];
  const citations: Citation[] = [];
  let cursor = 1;

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
- When campaign-specific context and SRD context both apply, prefer the campaign-specific information (the DM has authored it for this world).
- Cite your sources inline using the bracket tags shown in the context (e.g., [C1], [R2]). Use multiple citations when synthesizing across sources.
- Be concise. Use markdown for structure when helpful.`;

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

  const queryEmbedding = await embedQuery(message);

  const [refHits, campHits] = await Promise.all([
    retrieveReference(message, queryEmbedding, edition).catch((err) => {
      logger.error({ err }, "[chat] reference retrieval failed");
      return [] as ReferenceHit[];
    }),
    retrieveCampaign(message, queryEmbedding, campaignId, { isDm: dmRequester }).catch((err) => {
      logger.error({ err }, "[chat] campaign retrieval failed");
      return [] as CampaignHit[];
    }),
  ]);

  const { context, citations } = buildContextBlock(refHits, campHits, dmRequester);

  const userPrompt = context
    ? `Context:\n\n${context}\n\nQuestion: ${message}`
    : `(No retrieved context available.)\n\nQuestion: ${message}`;

  let answer: string;
  try {
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
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

  res.json({
    answer,
    citations,
    edition,
  });
});

export default router;

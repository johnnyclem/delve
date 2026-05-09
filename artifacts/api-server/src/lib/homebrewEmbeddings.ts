import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import { vectorToSqlLiteral } from "./entityEmbeddings";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;

async function embedOne(text: string): Promise<number[] | null> {
  if (!text.trim()) return null;
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: [text],
    dimensions: EMBED_DIMS,
  });
  return (res.data[0]?.embedding as unknown as number[]) ?? null;
}

export async function syncHomebrewEmbedding(
  ruleId: number,
  title: string,
  bodyMd: string,
): Promise<void> {
  try {
    const text = `${title}\n\n${bodyMd}`.trim();
    const vec = await embedOne(text);
    if (!vec) {
      await db.execute(sql`
        UPDATE homebrew_rules SET embedding = NULL WHERE id = ${ruleId}
      `);
      return;
    }
    await db.execute(sql`
      UPDATE homebrew_rules
      SET embedding = ${vectorToSqlLiteral(vec)}::halfvec(1536)
      WHERE id = ${ruleId}
    `);
  } catch (err) {
    logger.error({ err, ruleId }, "[homebrewEmbeddings] sync failed");
  }
}

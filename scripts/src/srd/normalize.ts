// Helpers for normalizing Foundry VTT pack entries into clean markdown chunks
// suitable for embedding and full-text search.
import TurndownService from "turndown";
import crypto from "node:crypto";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Strip Foundry @UUID[...]{Label} and @Compendium[...]{Label} markup that
// would otherwise pollute embeddings / search results.
const FOUNDRY_LINK_RE = /@(?:UUID|Compendium|Check|Damage|Heal|Roll)\[[^\]]*\](?:\{([^}]*)\})?/g;
// @Embed[uuid inline]{Label}
const FOUNDRY_EMBED_RE = /@Embed\[[^\]]*\](?:\{([^}]*)\})?/g;
// Anything else with @[...] form we don't recognize — keep the label.
const FOUNDRY_GENERIC_RE = /@[A-Za-z]+\[[^\]]*\]\{([^}]*)\}/g;

export function stripFoundryLinks(html: string): string {
  if (!html) return "";
  return html
    .replace(FOUNDRY_LINK_RE, (_m, label) => label ?? "")
    .replace(FOUNDRY_EMBED_RE, (_m, label) => label ?? "")
    .replace(FOUNDRY_GENERIC_RE, (_m, label) => label ?? "");
}

export function htmlToMd(html: string): string {
  if (!html) return "";
  const cleaned = stripFoundryLinks(html);
  try {
    return turndown.turndown(cleaned).trim();
  } catch {
    // Fall back to stripping HTML tags entirely.
    return cleaned.replace(/<[^>]+>/g, "").trim();
  }
}

const SRD_BASE_2014 = "https://dnd5e.wiki/wiki";
const SRD_BASE_2024 = "https://www.dndbeyond.com/sources/dnd/free-rules";

export function srdUrlFor(_kind: string, _slug: string, _edition: "2014" | "2024"): string | null {
  // We do not link out to a third-party site by default to avoid mismatches;
  // callers can attach a more specific URL if known. Keeping this nullable
  // documents the intent of the column.
  return null;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function contentHash(...parts: string[]): string {
  const h = crypto.createHash("sha256");
  for (const p of parts) h.update(String(p ?? ""));
  return h.digest("hex").slice(0, 32);
}

const MAX_CHARS_PER_CHUNK = 4000;

export interface ChunkInput {
  title: string;
  bodyMd: string;
  section?: string;
}

// Splits a long body into <= MAX_CHARS_PER_CHUNK pieces, preferring to break
// on paragraph (\n\n) and then sentence boundaries.
export function splitIfLong(input: ChunkInput): ChunkInput[] {
  if (input.bodyMd.length <= MAX_CHARS_PER_CHUNK) return [input];

  const paragraphs = input.bodyMd.split(/\n{2,}/);
  const chunks: ChunkInput[] = [];
  let buf = "";
  let part = 1;

  const flush = () => {
    if (buf.trim().length === 0) return;
    chunks.push({
      title: input.title,
      section: input.section ? `${input.section} (part ${part})` : `Part ${part}`,
      bodyMd: buf.trim(),
    });
    part += 1;
    buf = "";
  };

  for (const p of paragraphs) {
    if (buf.length + p.length + 2 > MAX_CHARS_PER_CHUNK) {
      flush();
      if (p.length > MAX_CHARS_PER_CHUNK) {
        // Hard split on sentences as a last resort.
        const sentences = p.split(/(?<=[.!?])\s+/);
        for (const s of sentences) {
          if (buf.length + s.length + 1 > MAX_CHARS_PER_CHUNK) flush();
          buf += (buf ? " " : "") + s;
        }
      } else {
        buf = p;
      }
    } else {
      buf += (buf ? "\n\n" : "") + p;
    }
  }
  flush();
  return chunks.length > 0 ? chunks : [input];
}

const FOUNDRY_TYPE_TO_KIND: Record<string, string> = {
  spell: "spell",
  npc: "monster",
  character: "monster",
  monster: "monster",
  class: "class",
  subclass: "subclass",
  feat: "feat",
  weapon: "item",
  equipment: "item",
  consumable: "item",
  loot: "item",
  tool: "item",
  container: "item",
  background: "background",
  race: "race",
  subrace: "subrace",
  condition: "condition",
  rule: "rule",
  journal: "rule",
  journalentry: "rule",
};

export function mapFoundryType(type: string | undefined): string {
  if (!type) return "other";
  return FOUNDRY_TYPE_TO_KIND[type.toLowerCase()] ?? "other";
}

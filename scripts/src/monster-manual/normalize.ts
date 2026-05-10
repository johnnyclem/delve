// Renders parsed Monster Manual records into clean markdown chunks suitable
// for embedding and full-text search. Reuses helpers from the SRD path so
// chunking + hashing match the SRD ingestion convention.
import { slugify, contentHash, splitIfLong } from "../srd/normalize";
import type { MonsterRecord } from "./parse";

export interface MonsterChunk {
  entitySlug: string;
  entityKind: "monster";
  section: string | null;
  title: string;
  bodyMd: string;
  contentHash: string;
}

const STAT_FIELDS_ORDER = [
  "Armor Class",
  "Hit Points",
  "Speed",
  "Saving Throws",
  "Skills",
  "Damage Vulnerabilities",
  "Damage Resistances",
  "Damage Immunities",
  "Condition Immunities",
  "Senses",
  "Languages",
  "Challenge",
];

function renderStatBlock(m: MonsterRecord): string {
  const lines: string[] = [];
  lines.push(`*${m.meta}*`);
  lines.push("");
  for (const f of STAT_FIELDS_ORDER) {
    const v = m.stats[f];
    if (v) lines.push(`- **${f}**: ${v}`);
  }
  if (Object.keys(m.abilityScores).length > 0) {
    lines.push("");
    lines.push("| STR | DEX | CON | INT | WIS | CHA |");
    lines.push("|-----|-----|-----|-----|-----|-----|");
    const order = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
    lines.push("| " + order.map((k) => m.abilityScores[k] ?? "—").join(" | ") + " |");
  }
  return lines.join("\n");
}

function renderSection(title: string, body: string): string | null {
  const t = body.trim();
  if (!t) return null;
  return `## ${title}\n\n${t}`;
}

export function monsterToChunks(
  m: MonsterRecord,
): Array<MonsterChunk> {
  const slug = slugify(m.name);
  const edition = "2014";
  const out: MonsterChunk[] = [];

  // Stat block chunk (always present).
  const statBody = renderStatBlock(m);
  const statTitle = m.name;
  for (const c of splitIfLong({ title: statTitle, bodyMd: statBody, section: "stat-block" })) {
    out.push({
      entitySlug: slug,
      entityKind: "monster",
      section: c.section ?? "stat-block",
      title: c.title,
      bodyMd: `# ${m.name}\n\n${c.bodyMd}`,
      contentHash: contentHash(edition, slug, "monster", c.section ?? "stat-block", c.bodyMd),
    });
  }

  const sectionMap: Array<[string, string, string]> = [
    ["traits", "Traits", m.traits],
    ["actions", "Actions", m.actions],
    ["reactions", "Reactions", m.reactions],
    ["legendary-actions", "Legendary Actions", m.legendaryActions],
    ["lair-actions", "Lair Actions", m.lairActions],
    ["regional-effects", "Regional Effects", m.regionalEffects],
    ["lore", "Description", m.lore],
  ];

  for (const [section, heading, body] of sectionMap) {
    const trimmed = body.trim();
    if (!trimmed) continue;
    const rendered = renderSection(heading, trimmed) ?? "";
    for (const c of splitIfLong({ title: m.name, bodyMd: rendered, section })) {
      out.push({
        entitySlug: slug,
        entityKind: "monster",
        section: c.section ?? section,
        title: c.title,
        bodyMd: `# ${m.name}\n\n${c.bodyMd}`,
        contentHash: contentHash(edition, slug, "monster", c.section ?? section, c.bodyMd),
      });
    }
  }

  return out;
}

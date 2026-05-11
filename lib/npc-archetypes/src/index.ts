// Public API for the curated NPC archetype catalog.
// Server-side: full catalog (templates, dialogue lines, prompt fragments).
// FE consumes only the lite picker metadata via the API endpoint.

export type { Archetype, ArchetypeCategory, NameTable, DialogueTopic } from "./types";
export { ARCHETYPES, ARCHETYPES_BY_KEY } from "./catalog";

import type { Archetype, NameTable, DialogueTopic } from "./types";
import { ARCHETYPES, ARCHETYPES_BY_KEY } from "./catalog";

// Lite descriptor surfaced over the wire to the FE picker. Keeps the
// rich template data server-side so we don't ship 30 KB of dialogue
// templates to every browser.
export interface ArchetypeListItem {
  key: string;
  displayName: string;
  category: string;
  occupation: string;
}

export function listArchetypes(): ArchetypeListItem[] {
  return ARCHETYPES.map((a) => ({
    key: a.key,
    displayName: a.displayName,
    category: a.category,
    occupation: a.occupation,
  }));
}

export function getArchetype(key: string): Archetype | undefined {
  return ARCHETYPES_BY_KEY[key];
}

// ───────────────────────────────────────────────────────────────────
// Random rolling helpers. All accept an optional `rng` so tests / the
// server can pass a seeded Math.random replacement and get reproducible
// results. The default is `Math.random` for production.
// ───────────────────────────────────────────────────────────────────

export type Rng = () => number;

function pick<T>(arr: readonly T[], rng: Rng): T {
  if (arr.length === 0) throw new Error("pick: empty array");
  return arr[Math.floor(rng() * arr.length)];
}

export function rollName(table: NameTable, rng: Rng = Math.random): string {
  const patterns = table.patterns ?? ["{first} {last}", "{first}"];
  const pattern = pick(patterns, rng);
  let result = pattern;
  if (result.includes("{first}")) {
    result = result.replace("{first}", pick(table.firstNames, rng));
  }
  if (result.includes("{last}")) {
    if (table.lastNames.length === 0) {
      // Fall back to bare first name if the table has no surnames.
      result = result.replace(/\s*\{last\}/g, "");
    } else {
      result = result.replace("{last}", pick(table.lastNames, rng));
    }
  }
  if (result.includes("{epithet}") && table.epithets) {
    result = result.replace("{epithet}", pick(table.epithets, rng));
  }
  return result.trim();
}

function fillName(template: string, name: string): string {
  return template.replace(/\{name\}/g, name);
}

export function rollBackstory(
  archetype: Archetype,
  name: string,
  rng: Rng = Math.random,
): string {
  return fillName(pick(archetype.backstoryTemplates, rng), name);
}

export function rollPublicMotive(
  archetype: Archetype,
  name: string,
  rng: Rng = Math.random,
): string {
  return fillName(pick(archetype.publicMotiveTemplates, rng), name);
}

export function rollSecretMotive(
  archetype: Archetype,
  name: string,
  rng: Rng = Math.random,
): string {
  return fillName(pick(archetype.secretMotiveTemplates, rng), name);
}

export interface RolledDialogueLine {
  topic: string;
  line: string;
  dmOnly: boolean;
  orderIndex: number;
}

// Builds the full starter dialogue set for an archetype. Each topic
// contributes ALL its lines (we want a useful starter list, not a
// random subset of one or two lines per topic). DM-only topics keep
// their flag so the server can filter for player responses.
export function buildStarterDialogue(
  archetype: Archetype,
): RolledDialogueLine[] {
  const out: RolledDialogueLine[] = [];
  let order = 0;
  for (const topic of archetype.dialogueTopics) {
    for (const line of topic.lines) {
      out.push({
        topic: topic.topic,
        line,
        dmOnly: topic.dmOnly === true,
        orderIndex: order,
      });
      order += 1;
    }
  }
  return out;
}

// Shared portrait style header — kept aligned with the bestiary
// generator so the visual style is consistent across the app.
export const PORTRAIT_STYLE_HEADER = [
  "16-bit retro VGA pixel-art portrait, dark fantasy palette,",
  "centered subject filling the frame, simple solid dark background,",
  "thick outline, dithered shading, no text, no border,",
  "in the visual style of classic 1990s tile-based RPG sprites.",
].join(" ");

export function buildPortraitPrompt(archetype: Archetype): string {
  return `Pixel-art portrait of a ${archetype.portraitPromptFragment}. ${PORTRAIT_STYLE_HEADER}`;
}

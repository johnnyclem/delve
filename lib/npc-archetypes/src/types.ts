// Catalog type contract for curated NPC archetypes.
// All content is shipped in code, never in the DB — see SKILL.md / task #265.

export type ArchetypeCategory =
  | "Town"
  | "Wilderness"
  | "Underworld"
  | "Court"
  | "Temple"
  | "Adventuring";

export interface NameTable {
  firstNames: string[];
  lastNames: string[];
  // Optional epithets used by the `{first} the {epithet}` pattern.
  epithets?: string[];
  // Defaults to `["{first} {last}", "{first}"]` when omitted.
  // Each pattern is weighted equally in random rolls.
  patterns?: string[];
}

export interface DialogueTopic {
  // Short label, e.g. "Greeting", "Buying a weapon".
  topic: string;
  // DM-only lines never reach players. Default: false.
  dmOnly?: boolean;
  // 3-6 starter lines per topic.
  lines: string[];
}

export interface Archetype {
  // Stable identifier used as `archetypeKey` on the NPC row.
  key: string;
  displayName: string;
  category: ArchetypeCategory;
  // Pre-filled into the form; DM can edit.
  occupation: string;
  // Free-text "Commoner / Fighter level 3 (martial)" style description.
  suggestedClass: string;
  // Tail of the portrait prompt — appended after the shared style header.
  portraitPromptFragment: string;
  nameTable: NameTable;
  // 3-5 backstory paragraph templates (markdown allowed). May reference
  // `{name}` which is substituted with the rolled name.
  backstoryTemplates: string[];
  // 2-4 public motives — what the NPC openly says they want.
  publicMotiveTemplates: string[];
  // 2-4 secret motives — DM-only, what they actually want.
  secretMotiveTemplates: string[];
  // 3-6 interaction topics each with 3-6 starter dialogue lines.
  dialogueTopics: DialogueTopic[];
}

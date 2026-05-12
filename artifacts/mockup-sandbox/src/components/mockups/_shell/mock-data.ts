export interface MockEntity {
  id: string;
  name: string;
  kind: "npc" | "quest" | "location" | "beat" | "encounter" | "twist" | "faction" | "item";
  summary: string;
}

export const MOCK_ENTITIES: MockEntity[] = [
  { id: "e1", kind: "npc", name: "Vex the Whisper", summary: "Half-elf rogue, bookkeeper to the Crimson Hand." },
  { id: "e2", kind: "npc", name: "Sister Marrowlight", summary: "Cleric of the dying god, runs the orphanage." },
  { id: "e3", kind: "quest", name: "The Vault Below", summary: "Find the missing reliquary in the drowned crypts." },
  { id: "e4", kind: "quest", name: "Smoke on the Trade Road", summary: "Caravans stop coming. Investigate the silence." },
  { id: "e5", kind: "location", name: "Hollow Spire", summary: "A wizard's tower turned community library." },
  { id: "e6", kind: "location", name: "The Brine Market", summary: "Floating bazaar at low tide." },
  { id: "e7", kind: "beat", name: "Reveal: the heir lives", summary: "Drop in session 12 once the party reaches the manor." },
  { id: "e8", kind: "encounter", name: "Ambush in Pine Hollow", summary: "3 bandits + worg. CR 3." },
  { id: "e9", kind: "twist", name: "The patron is the villain", summary: "Hold until session 18." },
  { id: "e10", kind: "faction", name: "Crimson Hand", summary: "Thieves' guild with cleric problem." },
  { id: "e11", kind: "item", name: "Tideglass Lantern", summary: "Reveals invisible things in seawater." },
];

export interface MockSession {
  id: string;
  title: string;
  date: string;
  status: "scheduled" | "drafting" | "completed";
  attendees: number;
}

export const MOCK_SESSIONS: MockSession[] = [
  { id: "s1", title: "Session 14 — Into the Spire", date: "Sun, May 18 · 7:00 PM", status: "scheduled", attendees: 5 },
  { id: "s2", title: "Session 13 — Smoke and Mirrors", date: "Sun, May 11 · 7:00 PM", status: "drafting", attendees: 4 },
  { id: "s3", title: "Session 12 — The Manor Job", date: "Sun, May 4 · 7:00 PM", status: "completed", attendees: 5 },
];

export interface MockCharacter {
  id: string;
  name: string;
  class: string;
  level: number;
  player: string;
}

export const MOCK_CHARACTERS: MockCharacter[] = [
  { id: "c1", name: "Ardyn Vale", class: "Ranger", level: 6, player: "Sam" },
  { id: "c2", name: "Brevin Ashroot", class: "Druid", level: 6, player: "Mia" },
  { id: "c3", name: "Kira One-Eye", class: "Rogue", level: 6, player: "Jess" },
  { id: "c4", name: "Theon Marrow", class: "Cleric", level: 6, player: "Dev" },
  { id: "c5", name: "Zinn the Quiet", class: "Wizard", level: 6, player: "Pat" },
];

export interface MockRoll {
  id: string;
  expr: string;
  result: number;
  who: string;
  at: string;
}

export const MOCK_ROLLS: MockRoll[] = [
  { id: "r1", expr: "1d20+5", result: 22, who: "Ardyn", at: "just now" },
  { id: "r2", expr: "2d6+3", result: 11, who: "Kira", at: "1m ago" },
  { id: "r3", expr: "1d20", result: 4, who: "Theon", at: "2m ago" },
];

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  group: "Navigate" | "Create" | "Actions" | "DM Tools";
  /** Only show to DMs. */
  dmOnly?: boolean;
}

export const PALETTE_ACTIONS: PaletteAction[] = [
  { id: "go-now", label: "Go to Now", hint: "g n", group: "Navigate" },
  { id: "go-play", label: "Go to Play", hint: "g p", group: "Navigate" },
  { id: "go-world", label: "Go to World", hint: "g w", group: "Navigate" },
  { id: "go-party", label: "Go to Party", hint: "g y", group: "Navigate" },
  { id: "go-more", label: "Go to More", hint: "g m", group: "Navigate" },
  { id: "go-maps", label: "Open Maps", group: "Navigate" },
  { id: "go-ask", label: "Open Ask (AI)", group: "Navigate" },

  { id: "new-session", label: "New Session", hint: "DM", group: "Create", dmOnly: true },
  { id: "new-npc", label: "New NPC", hint: "DM", group: "Create", dmOnly: true },
  { id: "new-quest", label: "New Quest", hint: "DM", group: "Create", dmOnly: true },
  { id: "new-location", label: "New Location", hint: "DM", group: "Create", dmOnly: true },

  { id: "roll-d20", label: "Roll d20", group: "Actions" },
  { id: "roll-adv", label: "Roll d20 with advantage", group: "Actions" },
  { id: "edit-asi", label: "Edit ASI history", group: "Actions" },
  { id: "resend-notif", label: "Resend session notification", group: "DM Tools", dmOnly: true },
  { id: "seed-srd", label: "Seed starter SRD content", group: "DM Tools", dmOnly: true },
  { id: "compare-editions", label: "Compare Editions (2014 vs 2024)", group: "DM Tools", dmOnly: true },
];

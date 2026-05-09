export const DND_RACES = [
  "Dragonborn", "Dwarf", "Elf", "Gnome", "Half-Elf",
  "Halfling", "Half-Orc", "Human", "Tiefling",
];

export const DND_CLASSES = [
  "Barbarian", "Bard", "Cleric", "Druid", "Fighter",
  "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer",
  "Warlock", "Wizard",
];

export const CUSTOM_OPTION_VALUE = "__custom";

export type AbilityName =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

export const ABILITY_ORDER: readonly AbilityName[] = [
  "strength", "dexterity", "constitution",
  "intelligence", "wisdom", "charisma",
];

// Suggested ability priority for each SRD class — used by the
// "Auto-assign for my class" shortcut on the character creation wizard.
// The first entry receives the highest rolled score, etc. Custom classes
// fall back to a neutral STR-first order.
export const RECOMMENDED_ABILITY_ORDER: Record<string, readonly AbilityName[]> = {
  Barbarian:  ["strength",     "constitution", "dexterity",    "wisdom",       "charisma",     "intelligence"],
  Bard:       ["charisma",     "dexterity",    "constitution", "wisdom",       "intelligence", "strength"],
  Cleric:     ["wisdom",       "constitution", "strength",     "charisma",     "dexterity",    "intelligence"],
  Druid:      ["wisdom",       "constitution", "dexterity",    "intelligence", "charisma",     "strength"],
  Fighter:    ["strength",     "constitution", "dexterity",    "wisdom",       "charisma",     "intelligence"],
  Monk:       ["dexterity",    "wisdom",       "constitution", "strength",     "charisma",     "intelligence"],
  Paladin:    ["strength",     "charisma",     "constitution", "wisdom",       "dexterity",    "intelligence"],
  Ranger:     ["dexterity",    "wisdom",       "constitution", "strength",     "intelligence", "charisma"],
  Rogue:      ["dexterity",    "constitution", "intelligence", "wisdom",       "charisma",     "strength"],
  Sorcerer:   ["charisma",     "constitution", "dexterity",    "wisdom",       "intelligence", "strength"],
  Warlock:    ["charisma",     "constitution", "dexterity",    "wisdom",       "intelligence", "strength"],
  Wizard:     ["intelligence", "constitution", "dexterity",    "wisdom",       "charisma",     "strength"],
};

export const DEFAULT_ABILITY_ORDER: readonly AbilityName[] = [
  "strength", "constitution", "dexterity", "wisdom", "charisma", "intelligence",
];

export interface CampaignHomebrewRulesLike {
  disableProficiencyAutoProgression?: boolean;
  proficiencyBonusByLevel?: number[];
}

// Returns the standard 5e proficiency bonus for the given level.
export function standardProficiencyBonusForLevel(level: number): number {
  const lvl = Math.max(1, Math.min(20, Math.floor(level)));
  return Math.ceil(lvl / 4) + 1;
}

// Returns the proficiency bonus that should be auto-applied for `level`,
// honoring the campaign's homebrew rules. When auto-progression is disabled
// returns null to signal callers to leave the existing bonus alone. When a
// custom table is configured it is used in place of the 5e default.
export function proficiencyBonusForLevel(
  level: number,
  homebrewRules?: CampaignHomebrewRulesLike | null,
): number | null {
  if (homebrewRules?.disableProficiencyAutoProgression) return null;
  const lvl = Math.max(1, Math.min(20, Math.floor(level)));
  const table = homebrewRules?.proficiencyBonusByLevel;
  if (Array.isArray(table) && table.length === 20) {
    const value = table[lvl - 1];
    if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
      return Math.floor(value);
    }
  }
  return standardProficiencyBonusForLevel(lvl);
}


// --- Level-up progression data ----------------------------------------------

export const HIT_DICE: Record<string, number> = {
  Barbarian: 12,
  Fighter: 10, Paladin: 10, Ranger: 10,
  Bard: 8, Cleric: 8, Druid: 8, Monk: 8, Rogue: 8, Warlock: 8,
  Sorcerer: 6, Wizard: 6,
};

export function averageHitDieRoll(die: number): number {
  // Standard 5e "fixed average" per hit die after level 1: floor(die/2) + 1.
  return Math.floor(die / 2) + 1;
}

// Index = char level - 1. Each row = slots per spell level (index 0 = 1st level).
const FULL_CASTER: number[][] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2],
  [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const HALF_CASTER: number[][] = [
  [], [2], [3], [3], [4, 2],
  [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2],
  [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2],
  [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2],
];

// Warlock pact magic: [number of slots, slot level].
const WARLOCK: [number, number][] = [
  [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
  [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5],
];

const CANTRIPS_KNOWN: Record<string, number[]> = {
  Bard:     [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  Cleric:   [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  Druid:    [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  Sorcerer: [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  Warlock:  [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  Wizard:   [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
};

const FULL_CASTERS = new Set(["Bard", "Cleric", "Druid", "Sorcerer", "Wizard"]);
const HALF_CASTERS = new Set(["Paladin", "Ranger"]);

export type SpellSlotMap = Record<string, { total: number; used: number }>;

export function spellSlotsForClassLevel(cls: string, level: number): SpellSlotMap | null {
  const lvl = Math.max(1, Math.min(20, Math.floor(level)));
  if (cls === "Warlock") {
    const [count, slotLevel] = WARLOCK[lvl - 1];
    return { [String(slotLevel)]: { total: count, used: 0 } };
  }
  let table: number[][] | null = null;
  if (FULL_CASTERS.has(cls)) table = FULL_CASTER;
  else if (HALF_CASTERS.has(cls)) table = HALF_CASTER;
  if (!table) return null;
  const row = table[lvl - 1] ?? [];
  const out: SpellSlotMap = {};
  row.forEach((total, idx) => {
    if (total > 0) out[String(idx + 1)] = { total, used: 0 };
  });
  return Object.keys(out).length > 0 ? out : null;
}

export function cantripsKnownForClassLevel(cls: string, level: number): number | null {
  const table = CANTRIPS_KNOWN[cls];
  if (!table) return null;
  const lvl = Math.max(1, Math.min(20, Math.floor(level)));
  return table[lvl - 1];
}

const CLASS_FEATURES: Record<string, Record<number, string[]>> = {
  Barbarian: { 1: ["Rage", "Unarmored Defense"], 2: ["Reckless Attack", "Danger Sense"], 3: ["Primal Path"], 4: ["Ability Score Improvement"], 5: ["Extra Attack", "Fast Movement"], 6: ["Path feature"], 7: ["Feral Instinct"], 8: ["Ability Score Improvement"], 9: ["Brutal Critical (1 die)"], 10: ["Path feature"], 11: ["Relentless Rage"], 12: ["Ability Score Improvement"], 13: ["Brutal Critical (2 dice)"], 14: ["Path feature"], 15: ["Persistent Rage"], 16: ["Ability Score Improvement"], 17: ["Brutal Critical (3 dice)"], 18: ["Indomitable Might"], 19: ["Ability Score Improvement"], 20: ["Primal Champion"] },
  Bard: { 1: ["Bardic Inspiration (d6)", "Spellcasting"], 2: ["Jack of All Trades", "Song of Rest (d6)"], 3: ["Bard College", "Expertise"], 4: ["Ability Score Improvement"], 5: ["Bardic Inspiration (d8)", "Font of Inspiration"], 6: ["Countercharm", "College feature"], 7: [], 8: ["Ability Score Improvement"], 9: ["Song of Rest (d8)"], 10: ["Bardic Inspiration (d10)", "Expertise", "Magical Secrets"], 11: [], 12: ["Ability Score Improvement"], 13: ["Song of Rest (d10)"], 14: ["Magical Secrets", "College feature"], 15: ["Bardic Inspiration (d12)"], 16: ["Ability Score Improvement"], 17: ["Song of Rest (d12)"], 18: ["Magical Secrets"], 19: ["Ability Score Improvement"], 20: ["Superior Inspiration"] },
  Cleric: { 1: ["Spellcasting", "Divine Domain"], 2: ["Channel Divinity (1/rest)", "Domain feature"], 3: [], 4: ["Ability Score Improvement"], 5: ["Destroy Undead (CR 1/2)"], 6: ["Channel Divinity (2/rest)", "Domain feature"], 7: [], 8: ["Ability Score Improvement", "Destroy Undead (CR 1)", "Domain feature"], 9: [], 10: ["Divine Intervention"], 11: ["Destroy Undead (CR 2)"], 12: ["Ability Score Improvement"], 13: [], 14: ["Destroy Undead (CR 3)"], 15: [], 16: ["Ability Score Improvement"], 17: ["Destroy Undead (CR 4)", "Domain feature"], 18: ["Channel Divinity (3/rest)"], 19: ["Ability Score Improvement"], 20: ["Divine Intervention Improvement"] },
  Druid: { 1: ["Druidic", "Spellcasting"], 2: ["Wild Shape", "Druid Circle"], 3: [], 4: ["Wild Shape Improvement", "Ability Score Improvement"], 5: [], 6: ["Circle feature"], 7: [], 8: ["Wild Shape Improvement", "Ability Score Improvement"], 9: [], 10: ["Circle feature"], 11: [], 12: ["Ability Score Improvement"], 13: [], 14: ["Circle feature"], 15: [], 16: ["Ability Score Improvement"], 17: [], 18: ["Timeless Body", "Beast Spells"], 19: ["Ability Score Improvement"], 20: ["Archdruid"] },
  Fighter: { 1: ["Fighting Style", "Second Wind"], 2: ["Action Surge"], 3: ["Martial Archetype"], 4: ["Ability Score Improvement"], 5: ["Extra Attack"], 6: ["Ability Score Improvement"], 7: ["Archetype feature"], 8: ["Ability Score Improvement"], 9: ["Indomitable"], 10: ["Archetype feature"], 11: ["Extra Attack (2)"], 12: ["Ability Score Improvement"], 13: ["Indomitable (2)"], 14: ["Ability Score Improvement"], 15: ["Archetype feature"], 16: ["Ability Score Improvement"], 17: ["Action Surge (2)", "Indomitable (3)"], 18: ["Archetype feature"], 19: ["Ability Score Improvement"], 20: ["Extra Attack (3)"] },
  Monk: { 1: ["Unarmored Defense", "Martial Arts"], 2: ["Ki", "Unarmored Movement"], 3: ["Monastic Tradition", "Deflect Missiles"], 4: ["Slow Fall", "Ability Score Improvement"], 5: ["Extra Attack", "Stunning Strike"], 6: ["Ki-Empowered Strikes", "Tradition feature"], 7: ["Evasion", "Stillness of Mind"], 8: ["Ability Score Improvement"], 9: ["Unarmored Movement Improvement"], 10: ["Purity of Body"], 11: ["Tradition feature"], 12: ["Ability Score Improvement"], 13: ["Tongue of the Sun and Moon"], 14: ["Diamond Soul"], 15: ["Timeless Body"], 16: ["Ability Score Improvement"], 17: ["Tradition feature"], 18: ["Empty Body"], 19: ["Ability Score Improvement"], 20: ["Perfect Self"] },
  Paladin: { 1: ["Divine Sense", "Lay on Hands"], 2: ["Fighting Style", "Spellcasting", "Divine Smite"], 3: ["Divine Health", "Sacred Oath"], 4: ["Ability Score Improvement"], 5: ["Extra Attack"], 6: ["Aura of Protection"], 7: ["Oath feature"], 8: ["Ability Score Improvement"], 9: [], 10: ["Aura of Courage"], 11: ["Improved Divine Smite"], 12: ["Ability Score Improvement"], 13: [], 14: ["Cleansing Touch"], 15: ["Oath feature"], 16: ["Ability Score Improvement"], 17: [], 18: ["Aura Improvements"], 19: ["Ability Score Improvement"], 20: ["Oath feature"] },
  Ranger: { 1: ["Favored Enemy", "Natural Explorer"], 2: ["Fighting Style", "Spellcasting"], 3: ["Ranger Archetype", "Primeval Awareness"], 4: ["Ability Score Improvement"], 5: ["Extra Attack"], 6: ["Favored Enemy & Natural Explorer Improvements"], 7: ["Archetype feature"], 8: ["Land's Stride", "Ability Score Improvement"], 9: [], 10: ["Natural Explorer Improvement", "Hide in Plain Sight"], 11: ["Archetype feature"], 12: ["Ability Score Improvement"], 13: [], 14: ["Favored Enemy Improvement", "Vanish"], 15: ["Archetype feature"], 16: ["Ability Score Improvement"], 17: [], 18: ["Feral Senses"], 19: ["Ability Score Improvement"], 20: ["Foe Slayer"] },
  Rogue: { 1: ["Expertise", "Sneak Attack", "Thieves' Cant"], 2: ["Cunning Action"], 3: ["Roguish Archetype"], 4: ["Ability Score Improvement"], 5: ["Uncanny Dodge"], 6: ["Expertise"], 7: ["Evasion"], 8: ["Ability Score Improvement"], 9: ["Archetype feature"], 10: ["Ability Score Improvement"], 11: ["Reliable Talent"], 12: ["Ability Score Improvement"], 13: ["Archetype feature"], 14: ["Blindsense"], 15: ["Slippery Mind"], 16: ["Ability Score Improvement"], 17: ["Archetype feature"], 18: ["Elusive"], 19: ["Ability Score Improvement"], 20: ["Stroke of Luck"] },
  Sorcerer: { 1: ["Spellcasting", "Sorcerous Origin"], 2: ["Font of Magic"], 3: ["Metamagic"], 4: ["Ability Score Improvement"], 5: [], 6: ["Origin feature"], 7: [], 8: ["Ability Score Improvement"], 9: [], 10: ["Metamagic"], 11: [], 12: ["Ability Score Improvement"], 13: [], 14: ["Origin feature"], 15: [], 16: ["Ability Score Improvement"], 17: ["Metamagic"], 18: ["Origin feature"], 19: ["Ability Score Improvement"], 20: ["Sorcerous Restoration"] },
  Warlock: { 1: ["Otherworldly Patron", "Pact Magic"], 2: ["Eldritch Invocations"], 3: ["Pact Boon"], 4: ["Ability Score Improvement"], 5: [], 6: ["Patron feature"], 7: [], 8: ["Ability Score Improvement"], 9: [], 10: ["Patron feature"], 11: ["Mystic Arcanum (6th)"], 12: ["Ability Score Improvement"], 13: ["Mystic Arcanum (7th)"], 14: ["Patron feature"], 15: ["Mystic Arcanum (8th)"], 16: ["Ability Score Improvement"], 17: ["Mystic Arcanum (9th)"], 18: [], 19: ["Ability Score Improvement"], 20: ["Eldritch Master"] },
  Wizard: { 1: ["Spellcasting", "Arcane Recovery"], 2: ["Arcane Tradition"], 3: [], 4: ["Ability Score Improvement"], 5: [], 6: ["Tradition feature"], 7: [], 8: ["Ability Score Improvement"], 9: [], 10: ["Tradition feature"], 11: [], 12: ["Ability Score Improvement"], 13: [], 14: ["Tradition feature"], 15: [], 16: ["Ability Score Improvement"], 17: [], 18: ["Spell Mastery"], 19: ["Ability Score Improvement"], 20: ["Signature Spells"] },
};

export function classFeaturesForLevel(cls: string, level: number): string[] {
  return CLASS_FEATURES[cls]?.[level] ?? [];
}

export interface LevelUpFeatureEntry {
  level: number;
  names: string[];
}

export interface LevelUpSuggestion {
  isStandardClass: boolean;
  hitDie: number;
  hpGain: number;
  newSpellSlots: SpellSlotMap | null;
  prevSpellSlots: SpellSlotMap | null;
  newCantripsKnown: number | null;
  prevCantripsKnown: number | null;
  features: LevelUpFeatureEntry[];
}

export function computeLevelUpSuggestion(
  cls: string,
  oldLevel: number,
  newLevel: number,
  conScore: number,
): LevelUpSuggestion {
  const isStandard = HIT_DICE[cls] !== undefined;
  const hitDie = HIT_DICE[cls] ?? 8;
  const conMod = Math.floor(((conScore ?? 10) - 10) / 2);
  const avgPerLevel = Math.max(1, averageHitDieRoll(hitDie) + conMod);
  const levelsGained = Math.max(0, Math.floor(newLevel) - Math.floor(oldLevel));
  // Custom (non-standard) classes have no known hit die, so do not assume an
  // HP gain — callers should treat the preview as informational only.
  const hpGain = isStandard ? avgPerLevel * levelsGained : 0;
  const features: LevelUpFeatureEntry[] = [];
  for (let l = oldLevel + 1; l <= newLevel; l++) {
    const names = classFeaturesForLevel(cls, l);
    if (names.length > 0) features.push({ level: l, names });
  }
  return {
    isStandardClass: isStandard,
    hitDie,
    hpGain,
    newSpellSlots: spellSlotsForClassLevel(cls, newLevel),
    prevSpellSlots: spellSlotsForClassLevel(cls, oldLevel),
    newCantripsKnown: cantripsKnownForClassLevel(cls, newLevel),
    prevCantripsKnown: cantripsKnownForClassLevel(cls, oldLevel),
    features,
  };
}

function spellSlotsEqual(a: SpellSlotMap | null, b: SpellSlotMap | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
    if (a[ak[i]].total !== b[bk[i]].total) return false;
  }
  return true;
}

export function suggestionHasChanges(s: LevelUpSuggestion): boolean {
  if (s.hpGain > 0) return true;
  if (s.features.length > 0) return true;
  if (!spellSlotsEqual(s.prevSpellSlots, s.newSpellSlots)) return true;
  if ((s.prevCantripsKnown ?? null) !== (s.newCantripsKnown ?? null)) return true;
  return false;
}

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

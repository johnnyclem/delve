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

export function proficiencyBonusForLevel(level: number): number {
  const lvl = Math.max(1, Math.min(20, Math.floor(level)));
  return Math.ceil(lvl / 4) + 1;
}

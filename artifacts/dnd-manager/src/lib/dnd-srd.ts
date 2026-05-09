import type { AbilityName } from "./dnd-options";

export interface RaceTrait {
  name: string;
  summary: string;
}

export interface RaceInfo {
  name: string;
  speed: number;
  size: "Small" | "Medium";
  abilityBonuses: Partial<Record<AbilityName, number>>;
  traits: RaceTrait[];
}

export type HitDieSize = 6 | 8 | 10 | 12;

export interface SkillChoice {
  count: number;
  from: string[];
}

export interface EquipmentOption {
  label: string;
  items: string[];
}

export interface EquipmentSlot {
  slot: string;
  choices: EquipmentOption[];
}

export interface ClassFeature {
  name: string;
  summary: string;
}

export interface ClassInfo {
  name: string;
  hitDie: HitDieSize;
  savingThrows: AbilityName[]; // exactly two
  skillChoices: SkillChoice;
  startingEquipmentOptions: EquipmentSlot[];
  level1Features: ClassFeature[];
}

// 9 SRD races. Subraces (e.g. Hill Dwarf) are intentionally collapsed into
// the base race per task scope — DMs/players can adjust ability bonuses
// after creation.
export const RACE_DATA: Record<string, RaceInfo> = {
  Dragonborn: {
    name: "Dragonborn",
    speed: 30,
    size: "Medium",
    abilityBonuses: { strength: 2, charisma: 1 },
    traits: [
      { name: "Draconic Ancestry", summary: "Choose a dragon type that shapes your breath weapon and damage resistance." },
      { name: "Breath Weapon", summary: "Exhale destructive energy in a 15-ft cone or 5×30-ft line; DEX or CON save for half." },
      { name: "Damage Resistance", summary: "You have resistance to the damage type associated with your ancestry." },
    ],
  },
  Dwarf: {
    name: "Dwarf",
    speed: 25,
    size: "Medium",
    abilityBonuses: { constitution: 2 },
    traits: [
      { name: "Darkvision", summary: "See in dim light within 60 ft as if it were bright light." },
      { name: "Dwarven Resilience", summary: "Advantage on saves vs poison and resistance to poison damage." },
      { name: "Stonecunning", summary: "Double proficiency on History checks about stonework." },
    ],
  },
  Elf: {
    name: "Elf",
    speed: 30,
    size: "Medium",
    abilityBonuses: { dexterity: 2 },
    traits: [
      { name: "Darkvision", summary: "See in dim light within 60 ft as if it were bright light." },
      { name: "Keen Senses", summary: "Proficiency in the Perception skill." },
      { name: "Fey Ancestry", summary: "Advantage on saves vs being charmed; magic can't put you to sleep." },
      { name: "Trance", summary: "Meditate 4 hours instead of sleeping 8." },
    ],
  },
  Gnome: {
    name: "Gnome",
    speed: 25,
    size: "Small",
    abilityBonuses: { intelligence: 2 },
    traits: [
      { name: "Darkvision", summary: "See in dim light within 60 ft as if it were bright light." },
      { name: "Gnome Cunning", summary: "Advantage on INT, WIS, and CHA saves vs magic." },
    ],
  },
  "Half-Elf": {
    name: "Half-Elf",
    speed: 30,
    size: "Medium",
    abilityBonuses: { charisma: 2 }, // +1 to two others — leave for player to assign manually
    traits: [
      { name: "Darkvision", summary: "See in dim light within 60 ft as if it were bright light." },
      { name: "Fey Ancestry", summary: "Advantage on saves vs being charmed; magic can't put you to sleep." },
      { name: "Skill Versatility", summary: "Proficiency in two skills of your choice." },
    ],
  },
  Halfling: {
    name: "Halfling",
    speed: 25,
    size: "Small",
    abilityBonuses: { dexterity: 2 },
    traits: [
      { name: "Lucky", summary: "Reroll a natural 1 on attack rolls, ability checks, or saves." },
      { name: "Brave", summary: "Advantage on saves vs being frightened." },
      { name: "Halfling Nimbleness", summary: "Move through the space of any creature larger than you." },
    ],
  },
  "Half-Orc": {
    name: "Half-Orc",
    speed: 30,
    size: "Medium",
    abilityBonuses: { strength: 2, constitution: 1 },
    traits: [
      { name: "Darkvision", summary: "See in dim light within 60 ft as if it were bright light." },
      { name: "Menacing", summary: "Proficiency in the Intimidation skill." },
      { name: "Relentless Endurance", summary: "Once per long rest, drop to 1 HP instead of 0." },
      { name: "Savage Attacks", summary: "Roll one extra weapon damage die on melee crits." },
    ],
  },
  Human: {
    name: "Human",
    speed: 30,
    size: "Medium",
    abilityBonuses: {
      strength: 1, dexterity: 1, constitution: 1,
      intelligence: 1, wisdom: 1, charisma: 1,
    },
    traits: [
      { name: "Versatile", summary: "Humans gain +1 to every ability score (PHB standard variant)." },
    ],
  },
  Tiefling: {
    name: "Tiefling",
    speed: 30,
    size: "Medium",
    abilityBonuses: { charisma: 2, intelligence: 1 },
    traits: [
      { name: "Darkvision", summary: "See in dim light within 60 ft as if it were bright light." },
      { name: "Hellish Resistance", summary: "Resistance to fire damage." },
      { name: "Infernal Legacy", summary: "Know thaumaturgy; learn Hellish Rebuke at L3, Darkness at L5." },
    ],
  },
};

const ALL_SKILLS = [
  "Acrobatics", "Animal Handling", "Arcana", "Athletics",
  "Deception", "History", "Insight", "Intimidation",
  "Investigation", "Medicine", "Nature", "Perception",
  "Performance", "Persuasion", "Religion", "Sleight of Hand",
  "Stealth", "Survival",
];

// 12 SRD classes. Equipment options trimmed to the most common picks per slot
// (the full PHB list contains more "any simple weapon" choices the wizard
// can't meaningfully enumerate — players can add custom items to cover edge
// cases).
export const CLASS_DATA: Record<string, ClassInfo> = {
  Barbarian: {
    name: "Barbarian",
    hitDie: 12,
    savingThrows: ["strength", "constitution"],
    skillChoices: {
      count: 2,
      from: ["Animal Handling", "Athletics", "Intimidation", "Nature", "Perception", "Survival"],
    },
    startingEquipmentOptions: [
      {
        slot: "Primary weapon",
        choices: [
          { label: "Greataxe", items: ["Greataxe"] },
          { label: "Any martial melee weapon", items: ["Martial melee weapon"] },
        ],
      },
      {
        slot: "Secondary weapon",
        choices: [
          { label: "Two handaxes", items: ["Handaxe", "Handaxe"] },
          { label: "Any simple weapon", items: ["Simple weapon"] },
        ],
      },
      {
        slot: "Pack",
        choices: [{ label: "Explorer's pack + 4 javelins", items: ["Explorer's pack", "Javelin", "Javelin", "Javelin", "Javelin"] }],
      },
    ],
    level1Features: [
      { name: "Rage", summary: "As a bonus action, gain damage resistance and bonus damage on STR weapon attacks." },
      { name: "Unarmored Defense", summary: "Without armor, AC = 10 + DEX mod + CON mod." },
    ],
  },
  Bard: {
    name: "Bard",
    hitDie: 8,
    savingThrows: ["dexterity", "charisma"],
    skillChoices: { count: 3, from: ALL_SKILLS },
    startingEquipmentOptions: [
      {
        slot: "Weapon",
        choices: [
          { label: "Rapier", items: ["Rapier"] },
          { label: "Longsword", items: ["Longsword"] },
          { label: "Any simple weapon", items: ["Simple weapon"] },
        ],
      },
      {
        slot: "Pack",
        choices: [
          { label: "Diplomat's pack", items: ["Diplomat's pack"] },
          { label: "Entertainer's pack", items: ["Entertainer's pack"] },
        ],
      },
      {
        slot: "Instrument",
        choices: [
          { label: "Lute", items: ["Lute"] },
          { label: "Any other musical instrument", items: ["Musical instrument"] },
        ],
      },
      {
        slot: "Armor & sidearm",
        choices: [{ label: "Leather armor + dagger", items: ["Leather armor", "Dagger"] }],
      },
    ],
    level1Features: [
      { name: "Bardic Inspiration (d6)", summary: "As a bonus action, give an ally a d6 to add to one roll within 10 minutes." },
      { name: "Spellcasting", summary: "Cast bard spells using CHA. You know 4 cantrips and 4 spells at level 1." },
    ],
  },
  Cleric: {
    name: "Cleric",
    hitDie: 8,
    savingThrows: ["wisdom", "charisma"],
    skillChoices: {
      count: 2,
      from: ["History", "Insight", "Medicine", "Persuasion", "Religion"],
    },
    startingEquipmentOptions: [
      {
        slot: "Weapon",
        choices: [
          { label: "Mace", items: ["Mace"] },
          { label: "Warhammer (if proficient)", items: ["Warhammer"] },
        ],
      },
      {
        slot: "Armor",
        choices: [
          { label: "Scale mail", items: ["Scale mail"] },
          { label: "Leather armor", items: ["Leather armor"] },
          { label: "Chain mail (if proficient)", items: ["Chain mail"] },
        ],
      },
      {
        slot: "Ranged option",
        choices: [
          { label: "Light crossbow + 20 bolts", items: ["Light crossbow", "Crossbow bolts (20)"] },
          { label: "Any simple weapon", items: ["Simple weapon"] },
        ],
      },
      {
        slot: "Pack",
        choices: [
          { label: "Priest's pack", items: ["Priest's pack"] },
          { label: "Explorer's pack", items: ["Explorer's pack"] },
        ],
      },
      {
        slot: "Shield & focus",
        choices: [{ label: "Shield + holy symbol", items: ["Shield", "Holy symbol"] }],
      },
    ],
    level1Features: [
      { name: "Spellcasting", summary: "Cast cleric spells using WIS. Prepare spells from the cleric list each long rest." },
      { name: "Divine Domain", summary: "Choose a domain (Life, Light, etc.) granting bonus spells and features." },
    ],
  },
  Druid: {
    name: "Druid",
    hitDie: 8,
    savingThrows: ["intelligence", "wisdom"],
    skillChoices: {
      count: 2,
      from: ["Arcana", "Animal Handling", "Insight", "Medicine", "Nature", "Perception", "Religion", "Survival"],
    },
    startingEquipmentOptions: [
      {
        slot: "Off-hand",
        choices: [
          { label: "Wooden shield", items: ["Wooden shield"] },
          { label: "Any simple weapon", items: ["Simple weapon"] },
        ],
      },
      {
        slot: "Weapon",
        choices: [
          { label: "Scimitar", items: ["Scimitar"] },
          { label: "Any simple melee weapon", items: ["Simple melee weapon"] },
        ],
      },
      {
        slot: "Armor & gear",
        choices: [{ label: "Leather armor + explorer's pack + druidic focus", items: ["Leather armor", "Explorer's pack", "Druidic focus"] }],
      },
    ],
    level1Features: [
      { name: "Druidic", summary: "Know the secret druid language for hidden messages." },
      { name: "Spellcasting", summary: "Cast druid spells using WIS. Prepare spells each long rest." },
    ],
  },
  Fighter: {
    name: "Fighter",
    hitDie: 10,
    savingThrows: ["strength", "constitution"],
    skillChoices: {
      count: 2,
      from: ["Acrobatics", "Animal Handling", "Athletics", "History", "Insight", "Intimidation", "Perception", "Survival"],
    },
    startingEquipmentOptions: [
      {
        slot: "Armor",
        choices: [
          { label: "Chain mail", items: ["Chain mail"] },
          { label: "Leather armor + longbow + 20 arrows", items: ["Leather armor", "Longbow", "Arrows (20)"] },
        ],
      },
      {
        slot: "Primary weapon",
        choices: [
          { label: "Martial weapon + shield", items: ["Martial weapon", "Shield"] },
          { label: "Two martial weapons", items: ["Martial weapon", "Martial weapon"] },
        ],
      },
      {
        slot: "Ranged option",
        choices: [
          { label: "Light crossbow + 20 bolts", items: ["Light crossbow", "Crossbow bolts (20)"] },
          { label: "Two handaxes", items: ["Handaxe", "Handaxe"] },
        ],
      },
      {
        slot: "Pack",
        choices: [
          { label: "Dungeoneer's pack", items: ["Dungeoneer's pack"] },
          { label: "Explorer's pack", items: ["Explorer's pack"] },
        ],
      },
    ],
    level1Features: [
      { name: "Fighting Style", summary: "Choose a style (Defense, Dueling, Great Weapon Fighting, etc.) for combat bonuses." },
      { name: "Second Wind", summary: "Once per short rest, regain 1d10 + level HP as a bonus action." },
    ],
  },
  Monk: {
    name: "Monk",
    hitDie: 8,
    savingThrows: ["strength", "dexterity"],
    skillChoices: {
      count: 2,
      from: ["Acrobatics", "Athletics", "History", "Insight", "Religion", "Stealth"],
    },
    startingEquipmentOptions: [
      {
        slot: "Weapon",
        choices: [
          { label: "Shortsword", items: ["Shortsword"] },
          { label: "Any simple weapon", items: ["Simple weapon"] },
        ],
      },
      {
        slot: "Pack",
        choices: [
          { label: "Dungeoneer's pack", items: ["Dungeoneer's pack"] },
          { label: "Explorer's pack", items: ["Explorer's pack"] },
        ],
      },
      {
        slot: "Sidearm",
        choices: [{ label: "10 darts", items: ["Dart (10)"] }],
      },
    ],
    level1Features: [
      { name: "Unarmored Defense", summary: "Without armor or shield, AC = 10 + DEX mod + WIS mod." },
      { name: "Martial Arts", summary: "Use DEX for unarmed strikes/monk weapons; bonus-action unarmed strike." },
    ],
  },
  Paladin: {
    name: "Paladin",
    hitDie: 10,
    savingThrows: ["wisdom", "charisma"],
    skillChoices: {
      count: 2,
      from: ["Athletics", "Insight", "Intimidation", "Medicine", "Persuasion", "Religion"],
    },
    startingEquipmentOptions: [
      {
        slot: "Primary weapon",
        choices: [
          { label: "Martial weapon + shield", items: ["Martial weapon", "Shield"] },
          { label: "Two martial weapons", items: ["Martial weapon", "Martial weapon"] },
        ],
      },
      {
        slot: "Ranged option",
        choices: [
          { label: "Five javelins", items: ["Javelin", "Javelin", "Javelin", "Javelin", "Javelin"] },
          { label: "Any simple melee weapon", items: ["Simple melee weapon"] },
        ],
      },
      {
        slot: "Pack",
        choices: [
          { label: "Priest's pack", items: ["Priest's pack"] },
          { label: "Explorer's pack", items: ["Explorer's pack"] },
        ],
      },
      {
        slot: "Armor & focus",
        choices: [{ label: "Chain mail + holy symbol", items: ["Chain mail", "Holy symbol"] }],
      },
    ],
    level1Features: [
      { name: "Divine Sense", summary: "Action: detect celestials, fiends, and undead within 60 ft (CHA mod + 1 / long rest)." },
      { name: "Lay on Hands", summary: "Pool of healing equal to 5 × paladin level, restored on long rest." },
    ],
  },
  Ranger: {
    name: "Ranger",
    hitDie: 10,
    savingThrows: ["strength", "dexterity"],
    skillChoices: {
      count: 3,
      from: ["Animal Handling", "Athletics", "Insight", "Investigation", "Nature", "Perception", "Stealth", "Survival"],
    },
    startingEquipmentOptions: [
      {
        slot: "Armor",
        choices: [
          { label: "Scale mail", items: ["Scale mail"] },
          { label: "Leather armor", items: ["Leather armor"] },
        ],
      },
      {
        slot: "Weapons",
        choices: [
          { label: "Two shortswords", items: ["Shortsword", "Shortsword"] },
          { label: "Two simple melee weapons", items: ["Simple melee weapon", "Simple melee weapon"] },
        ],
      },
      {
        slot: "Pack",
        choices: [
          { label: "Dungeoneer's pack", items: ["Dungeoneer's pack"] },
          { label: "Explorer's pack", items: ["Explorer's pack"] },
        ],
      },
      {
        slot: "Ranged",
        choices: [{ label: "Longbow + 20 arrows", items: ["Longbow", "Arrows (20)"] }],
      },
    ],
    level1Features: [
      { name: "Favored Enemy", summary: "Choose a creature type; advantage on tracking and INT checks to recall info." },
      { name: "Natural Explorer", summary: "Choose a terrain; gain travel and tracking bonuses there." },
    ],
  },
  Rogue: {
    name: "Rogue",
    hitDie: 8,
    savingThrows: ["dexterity", "intelligence"],
    skillChoices: {
      count: 4,
      from: ["Acrobatics", "Athletics", "Deception", "Insight", "Intimidation", "Investigation", "Perception", "Performance", "Persuasion", "Sleight of Hand", "Stealth"],
    },
    startingEquipmentOptions: [
      {
        slot: "Primary weapon",
        choices: [
          { label: "Rapier", items: ["Rapier"] },
          { label: "Shortsword", items: ["Shortsword"] },
        ],
      },
      {
        slot: "Ranged",
        choices: [
          { label: "Shortbow + 20 arrows", items: ["Shortbow", "Arrows (20)"] },
          { label: "Shortsword", items: ["Shortsword"] },
        ],
      },
      {
        slot: "Pack",
        choices: [
          { label: "Burglar's pack", items: ["Burglar's pack"] },
          { label: "Dungeoneer's pack", items: ["Dungeoneer's pack"] },
          { label: "Explorer's pack", items: ["Explorer's pack"] },
        ],
      },
      {
        slot: "Armor & tools",
        choices: [{ label: "Leather armor + 2 daggers + thieves' tools", items: ["Leather armor", "Dagger", "Dagger", "Thieves' tools"] }],
      },
    ],
    level1Features: [
      { name: "Expertise", summary: "Double proficiency on two of your skill or thieves' tools proficiencies." },
      { name: "Sneak Attack", summary: "+1d6 damage once per turn vs a creature you have advantage on (or with an ally adjacent)." },
      { name: "Thieves' Cant", summary: "Secret rogue language and signs only other rogues understand." },
    ],
  },
  Sorcerer: {
    name: "Sorcerer",
    hitDie: 6,
    savingThrows: ["constitution", "charisma"],
    skillChoices: {
      count: 2,
      from: ["Arcana", "Deception", "Insight", "Intimidation", "Persuasion", "Religion"],
    },
    startingEquipmentOptions: [
      {
        slot: "Weapon",
        choices: [
          { label: "Light crossbow + 20 bolts", items: ["Light crossbow", "Crossbow bolts (20)"] },
          { label: "Any simple weapon", items: ["Simple weapon"] },
        ],
      },
      {
        slot: "Focus",
        choices: [
          { label: "Component pouch", items: ["Component pouch"] },
          { label: "Arcane focus", items: ["Arcane focus"] },
        ],
      },
      {
        slot: "Pack",
        choices: [
          { label: "Dungeoneer's pack", items: ["Dungeoneer's pack"] },
          { label: "Explorer's pack", items: ["Explorer's pack"] },
        ],
      },
      {
        slot: "Sidearm",
        choices: [{ label: "Two daggers", items: ["Dagger", "Dagger"] }],
      },
    ],
    level1Features: [
      { name: "Spellcasting", summary: "Cast sorcerer spells using CHA. Know 4 cantrips and 2 spells at level 1." },
      { name: "Sorcerous Origin", summary: "Choose your magical bloodline (Draconic, Wild Magic, etc.) for bonus features." },
    ],
  },
  Warlock: {
    name: "Warlock",
    hitDie: 8,
    savingThrows: ["wisdom", "charisma"],
    skillChoices: {
      count: 2,
      from: ["Arcana", "Deception", "History", "Intimidation", "Investigation", "Nature", "Religion"],
    },
    startingEquipmentOptions: [
      {
        slot: "Weapon",
        choices: [
          { label: "Light crossbow + 20 bolts", items: ["Light crossbow", "Crossbow bolts (20)"] },
          { label: "Any simple weapon", items: ["Simple weapon"] },
        ],
      },
      {
        slot: "Focus",
        choices: [
          { label: "Component pouch", items: ["Component pouch"] },
          { label: "Arcane focus", items: ["Arcane focus"] },
        ],
      },
      {
        slot: "Pack",
        choices: [
          { label: "Scholar's pack", items: ["Scholar's pack"] },
          { label: "Dungeoneer's pack", items: ["Dungeoneer's pack"] },
        ],
      },
      {
        slot: "Armor & sidearms",
        choices: [{ label: "Leather armor + simple weapon + 2 daggers", items: ["Leather armor", "Simple weapon", "Dagger", "Dagger"] }],
      },
    ],
    level1Features: [
      { name: "Otherworldly Patron", summary: "Choose a patron (Fiend, Archfey, Great Old One) granting features and bonus spells." },
      { name: "Pact Magic", summary: "Cast warlock spells using CHA. Two short-rest spell slots at level 1." },
    ],
  },
  Wizard: {
    name: "Wizard",
    hitDie: 6,
    savingThrows: ["intelligence", "wisdom"],
    skillChoices: {
      count: 2,
      from: ["Arcana", "History", "Insight", "Investigation", "Medicine", "Religion"],
    },
    startingEquipmentOptions: [
      {
        slot: "Weapon",
        choices: [
          { label: "Quarterstaff", items: ["Quarterstaff"] },
          { label: "Dagger", items: ["Dagger"] },
        ],
      },
      {
        slot: "Focus",
        choices: [
          { label: "Component pouch", items: ["Component pouch"] },
          { label: "Arcane focus", items: ["Arcane focus"] },
        ],
      },
      {
        slot: "Pack",
        choices: [
          { label: "Scholar's pack", items: ["Scholar's pack"] },
          { label: "Explorer's pack", items: ["Explorer's pack"] },
        ],
      },
      {
        slot: "Spellbook",
        choices: [{ label: "Spellbook (6 1st-level spells)", items: ["Spellbook"] }],
      },
    ],
    level1Features: [
      { name: "Spellcasting", summary: "Cast wizard spells using INT. Prepare spells from your spellbook each long rest." },
      { name: "Arcane Recovery", summary: "Once per day on a short rest, recover spell slots equal to half your wizard level." },
    ],
  },
};

// Map an ability label like "Strength" used by the saving-throw checkbox UI
// back to the canonical AbilityName, so we can flag class-mandated saves.
export const ABILITY_LABEL_TO_NAME: Record<string, AbilityName> = {
  Strength: "strength",
  Dexterity: "dexterity",
  Constitution: "constitution",
  Intelligence: "intelligence",
  Wisdom: "wisdom",
  Charisma: "charisma",
};

export function abilityNameToLabel(a: AbilityName): string {
  return a.charAt(0).toUpperCase() + a.slice(1);
}

export function modifierFor(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function level1MaxHp(hitDie: HitDieSize, conScore: number): number {
  return hitDie + modifierFor(conScore);
}

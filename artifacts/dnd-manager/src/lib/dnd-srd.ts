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
  // Curated SRD features unlocked at each level >= 2. ASIs and small numeric
  // bumps (e.g. proficiency bonus) are intentionally omitted — the level-up
  // walkthrough surfaces those separately.
  featuresByLevel?: Record<number, ClassFeature[]>;
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

// Curated SRD class features at each level >= 2. Sparse by design — only
// notable PHB features. Levels not listed unlock nothing beyond derived
// numbers (proficiency bonus, ASIs, scaling dice). Subclass-specific
// features are out of scope (Task #133).
export const CLASS_FEATURES_BY_LEVEL: Record<string, Record<number, ClassFeature[]>> = {
  Barbarian: {
    2: [
      { name: "Reckless Attack", summary: "Trade defense for STR-attack advantage; attacks vs you also gain advantage." },
      { name: "Danger Sense", summary: "Advantage on DEX saves vs effects you can see (traps, spells)." },
    ],
    3: [{ name: "Primal Path", summary: "Choose a subclass (Berserker, Totem Warrior, etc.)." }],
    5: [
      { name: "Extra Attack", summary: "Attack twice when you take the Attack action." },
      { name: "Fast Movement", summary: "+10 ft speed while not wearing heavy armor." },
    ],
    7: [{ name: "Feral Instinct", summary: "Advantage on initiative; can rage and act normally on a surprise round." }],
    9: [{ name: "Brutal Critical (1 die)", summary: "Roll one extra weapon damage die on a melee crit." }],
    11: [{ name: "Relentless Rage", summary: "Drop to 1 HP instead of 0 once per rage (CON save, escalating DC)." }],
    15: [{ name: "Persistent Rage", summary: "Rage no longer ends from inactivity; only when unconscious or you end it." }],
    18: [{ name: "Indomitable Might", summary: "STR check minimum equals your STR score." }],
    20: [{ name: "Primal Champion", summary: "+4 to STR and CON; both maximums increase to 24." }],
  },
  Bard: {
    2: [
      { name: "Jack of All Trades", summary: "Add half your proficiency (round down) to non-proficient ability checks." },
      { name: "Song of Rest (d6)", summary: "Allies regain extra HP equal to a d6 on short rests." },
    ],
    3: [
      { name: "Bard College", summary: "Choose a subclass (Lore, Valor, etc.)." },
      { name: "Expertise", summary: "Double proficiency on two skills." },
    ],
    5: [
      { name: "Bardic Inspiration (d8)", summary: "Inspiration die upgrades to d8." },
      { name: "Font of Inspiration", summary: "Regain all uses of Bardic Inspiration on a short or long rest." },
    ],
    6: [{ name: "Countercharm", summary: "Action: friends within 30 ft gain advantage on saves vs frightened/charmed." }],
    10: [
      { name: "Magical Secrets (2)", summary: "Learn two spells from any class." },
      { name: "Bardic Inspiration (d10)", summary: "Inspiration die upgrades to d10." },
      { name: "Expertise (2)", summary: "Double proficiency on two more skills." },
    ],
    14: [{ name: "Magical Secrets (4)", summary: "Learn two more spells from any class." }],
    15: [{ name: "Bardic Inspiration (d12)", summary: "Inspiration die upgrades to d12." }],
    18: [{ name: "Magical Secrets (6)", summary: "Learn two more spells from any class." }],
    20: [{ name: "Superior Inspiration", summary: "Regain one Bardic Inspiration on initiative if you have none left." }],
  },
  Cleric: {
    2: [{ name: "Channel Divinity (1/rest)", summary: "Turn Undead plus a domain-specific channel option." }],
    5: [{ name: "Destroy Undead (CR 1/2)", summary: "Turned undead of CR 1/2 or lower are destroyed." }],
    6: [{ name: "Channel Divinity (2/rest)", summary: "Use Channel Divinity twice between rests." }],
    8: [{ name: "Destroy Undead (CR 1)", summary: "Turned undead of CR 1 or lower are destroyed." }],
    10: [{ name: "Divine Intervention", summary: "Once per long rest, call on your god (% chance equal to cleric level)." }],
    11: [{ name: "Destroy Undead (CR 2)", summary: "Turned undead of CR 2 or lower are destroyed." }],
    14: [{ name: "Destroy Undead (CR 3)", summary: "Turned undead of CR 3 or lower are destroyed." }],
    17: [
      { name: "Destroy Undead (CR 4)", summary: "Turned undead of CR 4 or lower are destroyed." },
      { name: "Divine Intervention Improvement", summary: "Your call for intervention automatically succeeds (1/week)." },
    ],
    18: [{ name: "Channel Divinity (3/rest)", summary: "Use Channel Divinity three times between rests." }],
    20: [{ name: "Domain Capstone", summary: "Gain your divine domain's level-20 capstone feature." }],
  },
  Druid: {
    2: [
      { name: "Wild Shape", summary: "Action: transform into a beast you've seen (CR 1/4 at level 2). 2/short rest." },
      { name: "Druid Circle", summary: "Choose a subclass (Land or Moon)." },
    ],
    4: [{ name: "Wild Shape Improvement", summary: "Beasts up to CR 1/2 with no flying speed." }],
    8: [{ name: "Wild Shape Improvement", summary: "Beasts up to CR 1 with no flying speed." }],
    18: [
      { name: "Timeless Body", summary: "Age slowly: 10 years pass for every 1 normal year." },
      { name: "Beast Spells", summary: "Cast druid spells while in Wild Shape (somatic/verbal only)." },
    ],
    20: [{ name: "Archdruid", summary: "Unlimited Wild Shapes; ignore material components for druid spells." }],
  },
  Fighter: {
    2: [{ name: "Action Surge (1/rest)", summary: "Take an additional action on your turn once per short rest." }],
    3: [{ name: "Martial Archetype", summary: "Choose a subclass (Champion, Battle Master, Eldritch Knight)." }],
    5: [{ name: "Extra Attack", summary: "Attack twice when you take the Attack action." }],
    9: [{ name: "Indomitable (1/rest)", summary: "Reroll a failed saving throw once per long rest." }],
    11: [{ name: "Extra Attack (2)", summary: "Attack three times when you take the Attack action." }],
    13: [{ name: "Indomitable (2/rest)", summary: "Use Indomitable twice between long rests." }],
    17: [
      { name: "Action Surge (2/rest)", summary: "Use Action Surge twice between short rests." },
      { name: "Indomitable (3/rest)", summary: "Use Indomitable three times between long rests." },
    ],
    20: [{ name: "Extra Attack (3)", summary: "Attack four times when you take the Attack action." }],
  },
  Monk: {
    2: [
      { name: "Ki", summary: "Pool of ki points (= monk level) for Flurry of Blows, Patient Defense, Step of the Wind." },
      { name: "Unarmored Movement (+10 ft)", summary: "Speed bonus while unarmored and not wearing a shield." },
    ],
    3: [
      { name: "Monastic Tradition", summary: "Choose a subclass (Open Hand, Shadow, Four Elements)." },
      { name: "Deflect Missiles", summary: "Reaction: reduce ranged-weapon damage; if 0, throw it back as a ki attack." },
    ],
    4: [{ name: "Slow Fall", summary: "Reaction: reduce falling damage by 5 × monk level." }],
    5: [
      { name: "Extra Attack", summary: "Attack twice when you take the Attack action." },
      { name: "Stunning Strike", summary: "Spend 1 ki on a hit to force a CON save or be stunned until your next turn." },
    ],
    6: [{ name: "Ki-Empowered Strikes", summary: "Your unarmed strikes count as magical for overcoming resistance." }],
    7: [
      { name: "Evasion", summary: "On a successful DEX save vs half-damage effect, take no damage; half on fail." },
      { name: "Stillness of Mind", summary: "Action: end one effect causing you to be charmed or frightened." },
    ],
    10: [{ name: "Purity of Body", summary: "Immunity to disease and poison." }],
    13: [{ name: "Tongue of the Sun and Moon", summary: "Understand all spoken languages and be understood by anyone." }],
    14: [{ name: "Diamond Soul", summary: "Proficiency in all saving throws; spend 1 ki to reroll a failed save." }],
    15: [{ name: "Timeless Body", summary: "No longer suffer the effects of aging; can't be aged magically." }],
    18: [{ name: "Empty Body", summary: "4 ki: become invisible and resistant to all damage but force for 1 minute." }],
    20: [{ name: "Perfect Self", summary: "Regain 4 ki when you roll initiative with none left." }],
  },
  Paladin: {
    2: [
      { name: "Divine Smite", summary: "Spend a spell slot on a melee hit for +2d8 radiant damage (+1d8 per slot level above 1, max +5d8)." },
      { name: "Fighting Style", summary: "Choose a style (Defense, Dueling, Great Weapon Fighting, Protection)." },
    ],
    3: [
      { name: "Sacred Oath", summary: "Choose a subclass (Devotion, Ancients, Vengeance)." },
      { name: "Divine Health", summary: "Immunity to disease." },
    ],
    5: [{ name: "Extra Attack", summary: "Attack twice when you take the Attack action." }],
    6: [{ name: "Aura of Protection", summary: "You and allies within 10 ft add your CHA mod (min +1) to saves." }],
    10: [{ name: "Aura of Courage", summary: "You and allies within 10 ft can't be frightened." }],
    11: [{ name: "Improved Divine Smite", summary: "All melee weapon hits deal +1d8 radiant damage." }],
    14: [{ name: "Cleansing Touch", summary: "Action: end one spell on yourself or a willing creature (CHA mod uses/long rest)." }],
    18: [{ name: "Aura Range Increase", summary: "Aura of Protection / Aura of Courage range becomes 30 ft." }],
    20: [{ name: "Oath Capstone", summary: "Gain your sacred oath's level-20 capstone feature." }],
  },
  Ranger: {
    2: [
      { name: "Fighting Style", summary: "Choose a style (Archery, Defense, Dueling, Two-Weapon Fighting)." },
      { name: "Spellcasting", summary: "Cast ranger spells using WIS. Know 2 spells at level 2." },
    ],
    3: [
      { name: "Ranger Archetype", summary: "Choose a subclass (Hunter, Beast Master)." },
      { name: "Primeval Awareness", summary: "Spend a spell slot to sense favored enemies within 1 mile." },
    ],
    5: [{ name: "Extra Attack", summary: "Attack twice when you take the Attack action." }],
    8: [{ name: "Land's Stride", summary: "Move through nonmagical difficult terrain at full speed; advantage on saves vs entangling plants." }],
    10: [{ name: "Hide in Plain Sight", summary: "1 minute camouflage grants +10 to Stealth checks while motionless." }],
    14: [{ name: "Vanish", summary: "Hide as a bonus action; can't be tracked nonmagically." }],
    18: [{ name: "Feral Senses", summary: "Don't suffer disadvantage attacking unseen creatures within 30 ft; aware of invisible creatures." }],
    20: [{ name: "Foe Slayer", summary: "Once per turn, add WIS mod to attack or damage roll vs a favored enemy." }],
  },
  Rogue: {
    2: [{ name: "Cunning Action", summary: "Bonus action: Dash, Disengage, or Hide." }],
    3: [{ name: "Roguish Archetype", summary: "Choose a subclass (Thief, Assassin, Arcane Trickster)." }],
    5: [{ name: "Uncanny Dodge", summary: "Reaction: halve damage from one attacker you can see." }],
    7: [{ name: "Evasion", summary: "On a successful DEX save vs half-damage effect, take no damage; half on fail." }],
    11: [{ name: "Reliable Talent", summary: "Treat any d20 of 9 or lower as a 10 on proficient ability checks." }],
    14: [{ name: "Blindsense", summary: "Aware of any hidden or invisible creature within 10 ft if you can hear." }],
    15: [{ name: "Slippery Mind", summary: "Proficiency in WIS saving throws." }],
    18: [{ name: "Elusive", summary: "No attack roll has advantage against you unless you're incapacitated." }],
    20: [{ name: "Stroke of Luck", summary: "Once per short rest, turn a missed attack into a hit or a failed check into 20." }],
  },
  Sorcerer: {
    2: [{ name: "Font of Magic", summary: "Pool of sorcery points (= sorcerer level); convert between slots and points." }],
    3: [{ name: "Metamagic", summary: "Choose 2 metamagic options (Twin, Quicken, Subtle, etc.)." }],
    10: [{ name: "Metamagic (3rd)", summary: "Learn one additional metamagic option." }],
    17: [{ name: "Metamagic (4th)", summary: "Learn one additional metamagic option." }],
    20: [{ name: "Sorcerous Restoration", summary: "Regain 4 sorcery points on a short rest (1/rest)." }],
  },
  Warlock: {
    2: [{ name: "Eldritch Invocations (2)", summary: "Choose 2 invocations that customize your warlock features." }],
    3: [{ name: "Pact Boon", summary: "Choose Pact of the Chain, Blade, or Tome." }],
    11: [{ name: "Mystic Arcanum (6th)", summary: "Choose one 6th-level spell, cast 1/long rest without expending a slot." }],
    13: [{ name: "Mystic Arcanum (7th)", summary: "Choose one 7th-level spell, cast 1/long rest." }],
    15: [{ name: "Mystic Arcanum (8th)", summary: "Choose one 8th-level spell, cast 1/long rest." }],
    17: [{ name: "Mystic Arcanum (9th)", summary: "Choose one 9th-level spell, cast 1/long rest." }],
    20: [{ name: "Eldritch Master", summary: "Regain all expended Pact Magic spell slots after 1 minute of entreaty (1/long rest)." }],
  },
  Wizard: {
    2: [{ name: "Arcane Tradition", summary: "Choose a subclass (Evocation, Abjuration, etc.)." }],
    18: [{ name: "Spell Mastery", summary: "Cast a chosen 1st- and 2nd-level spell at lowest level without expending a slot." }],
    20: [{ name: "Signature Spells", summary: "Choose two 3rd-level spells you can cast 1/short rest each without a slot." }],
  },
};

export function getNewFeaturesAtLevel(className: string, level: number): ClassFeature[] {
  if (level <= 1) return [];
  const map = CLASS_FEATURES_BY_LEVEL[className];
  if (!map) return [];
  return map[level] ?? [];
}

// ---- SRD Backgrounds (added in Task #146 for the AAA-FTUE wizard) ----
//
// A small curated set of System Reference Document backgrounds.  Each entry
// carries a short flavor description, the two skill proficiencies the
// background grants (so the wizard can auto-merge them into the character's
// skill list), and a one-line "feature" summary for the review/detail UI.
// Equipment lists are intentionally short — players can add more from the
// Optional Details panel.
export interface BackgroundFeature {
  name: string;
  description: string;
}

export interface BackgroundInfo {
  name: string;
  /** Single emoji used as the card iconography in the wizard. */
  emoji: string;
  /** One-paragraph flavor description shown on the picker card. */
  description: string;
  /** The two SRD skill proficiencies granted by this background. */
  skillProficiencies: string[];
  feature: BackgroundFeature;
  equipment?: string[];
}

export const BACKGROUND_DATA: Record<string, BackgroundInfo> = {
  Acolyte: {
    name: "Acolyte",
    emoji: "🛐",
    description:
      "You spent your life in the service of a temple, learning sacred rites and tending to the faithful.",
    skillProficiencies: ["Insight", "Religion"],
    feature: {
      name: "Shelter of the Faithful",
      description:
        "Fellow believers will provide free lodging, healing, and care at temples of your faith.",
    },
    equipment: [
      "Holy symbol",
      "Prayer book",
      "5 sticks of incense",
      "Vestments",
      "Common clothes",
      "Belt pouch (15 gp)",
    ],
  },
  Criminal: {
    name: "Criminal",
    emoji: "🗝️",
    description:
      "Burglar, fence, smuggler — you've broken laws and kept your secrets close.",
    skillProficiencies: ["Deception", "Stealth"],
    feature: {
      name: "Criminal Contact",
      description:
        "You have a reliable contact in the criminal underworld who can pass messages for you.",
    },
    equipment: [
      "Crowbar",
      "Set of dark common clothes with a hood",
      "Belt pouch (15 gp)",
    ],
  },
  "Folk Hero": {
    name: "Folk Hero",
    emoji: "🌾",
    description:
      "Born of common stock, you stood up for the people of your village when no one else would.",
    skillProficiencies: ["Animal Handling", "Survival"],
    feature: {
      name: "Rustic Hospitality",
      description:
        "Common folk will shelter and shield you from the law or anyone else searching for you.",
    },
    equipment: [
      "Set of artisan's tools",
      "Shovel",
      "Iron pot",
      "Common clothes",
      "Belt pouch (10 gp)",
    ],
  },
  Noble: {
    name: "Noble",
    emoji: "👑",
    description:
      "You were born into wealth and privilege, and you've spent your life learning the games of court.",
    skillProficiencies: ["History", "Persuasion"],
    feature: {
      name: "Position of Privilege",
      description:
        "You're welcome in high society and people assume you have the right to be wherever you are.",
    },
    equipment: [
      "Set of fine clothes",
      "Signet ring",
      "Scroll of pedigree",
      "Purse (25 gp)",
    ],
  },
  Sage: {
    name: "Sage",
    emoji: "📚",
    description:
      "You spent years in libraries and lecture halls, chasing the answers to obscure questions.",
    skillProficiencies: ["Arcana", "History"],
    feature: {
      name: "Researcher",
      description:
        "When you don't know a piece of lore, you usually know who or where to ask to find it.",
    },
    equipment: [
      "Bottle of black ink",
      "Quill",
      "Small knife",
      "Letter from a dead colleague",
      "Common clothes",
      "Belt pouch (10 gp)",
    ],
  },
  Soldier: {
    name: "Soldier",
    emoji: "⚔️",
    description:
      "You served in a militia, mercenary company, or army, and the discipline of the line still shapes you.",
    skillProficiencies: ["Athletics", "Intimidation"],
    feature: {
      name: "Military Rank",
      description:
        "Soldiers loyal to your former organization still recognize your authority and grant minor favors.",
    },
    equipment: [
      "Insignia of rank",
      "Trophy from a fallen enemy",
      "Set of bone dice or deck of cards",
      "Common clothes",
      "Belt pouch (10 gp)",
    ],
  },
};

export const DND_BACKGROUNDS: readonly string[] = Object.keys(BACKGROUND_DATA);


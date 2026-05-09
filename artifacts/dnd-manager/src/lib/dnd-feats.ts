// Curated 5e SRD/PHB feat list for the Level Up walkthrough's feat picker.
// Intentionally not exhaustive — these are the feats players reach for most
// often. The picker also offers a "Custom feat (manual)" escape hatch for
// anything not in this list.

export interface FeatInfo {
  id: string;
  name: string;
  summary: string;
  prerequisite?: string;
  // Per-character-level HP bonus granted while the feat is on the sheet.
  // Only Tough sets this today (+2 HP per character level).
  hpPerLevel?: number;
}

export const SRD_FEATS: FeatInfo[] = [
  {
    id: "alert",
    name: "Alert",
    summary:
      "+5 to initiative. You can't be surprised while conscious, and creatures don't gain advantage on attacks against you from being unseen.",
  },
  {
    id: "athlete",
    name: "Athlete",
    summary:
      "+1 STR or DEX. Stand up from prone with 5 ft of movement. Climbing costs no extra movement. Long/high jumps need only a 5-ft running start.",
  },
  {
    id: "crossbow-expert",
    name: "Crossbow Expert",
    summary:
      "Ignore the loading property of crossbows you're proficient with. No disadvantage in melee for ranged attacks. Bonus-action hand crossbow shot after a one-handed attack.",
  },
  {
    id: "defensive-duelist",
    name: "Defensive Duelist",
    prerequisite: "Dexterity 13+",
    summary:
      "When wielding a finesse weapon, use your reaction to add your proficiency bonus to AC against one melee attack that would hit you.",
  },
  {
    id: "dual-wielder",
    name: "Dual Wielder",
    summary:
      "+1 AC while wielding a melee weapon in each hand. Two-weapon fighting works with non-light weapons. Draw or stow two one-handed weapons in one action.",
  },
  {
    id: "great-weapon-master",
    name: "Great Weapon Master",
    summary:
      "On a melee crit or when you drop a creature to 0 HP, make one melee weapon attack as a bonus action. With a heavy weapon you can take -5 to attack for +10 damage.",
  },
  {
    id: "healer",
    name: "Healer",
    summary:
      "Stabilize and restore 1 HP with a healer's kit. Once per short rest per target, spend a use of a kit to heal 1d6 + 4 + creature's level HP.",
  },
  {
    id: "inspiring-leader",
    name: "Inspiring Leader",
    prerequisite: "Charisma 13+",
    summary:
      "Spend 10 minutes inspiring up to six allies who can hear and understand you. Each gains temporary HP equal to your level + CHA modifier.",
  },
  {
    id: "lucky",
    name: "Lucky",
    summary:
      "3 luck points per long rest. Spend one to roll an extra d20 on an attack roll, ability check, or save (yours, or one targeting you) and pick which to use.",
  },
  {
    id: "magic-initiate",
    name: "Magic Initiate",
    summary:
      "Pick a class. Learn two cantrips and one 1st-level spell from its list; cast the 1st-level spell once per long rest without a slot.",
  },
  {
    id: "mage-slayer",
    name: "Mage Slayer",
    summary:
      "Reaction melee attack against a caster within 5 ft. Casters within 5 ft have disadvantage on concentration saves. You have advantage on saves vs spells from creatures within 5 ft.",
  },
  {
    id: "mobile",
    name: "Mobile",
    summary:
      "+10 ft speed. Dashing ignores difficult terrain. After a melee attack against a creature, that creature can't make opportunity attacks against you for the rest of the turn.",
  },
  {
    id: "observant",
    name: "Observant",
    summary:
      "+1 INT or WIS. Read lips. +5 bonus to passive Perception and passive Investigation.",
  },
  {
    id: "polearm-master",
    name: "Polearm Master",
    summary:
      "Bonus-action butt-end attack (1d4) when you Attack with a glaive, halberd, or quarterstaff. Opportunity attacks trigger when enemies enter your reach.",
  },
  {
    id: "resilient",
    name: "Resilient",
    summary:
      "+1 to one ability score and gain proficiency in saving throws using that ability. (Picked once — choose the ability when you take the feat.)",
  },
  {
    id: "savage-attacker",
    name: "Savage Attacker",
    summary:
      "Once per turn when you roll damage for a melee weapon attack, you can reroll the weapon's damage dice and use either total.",
  },
  {
    id: "sentinel",
    name: "Sentinel",
    summary:
      "Opportunity attacks reduce the target's speed to 0. Disengage doesn't help against you. When an enemy in 5 ft attacks an ally, use your reaction to attack the enemy.",
  },
  {
    id: "sharpshooter",
    name: "Sharpshooter",
    summary:
      "Long-range attacks no longer have disadvantage. Attacks ignore half and three-quarters cover. With a ranged weapon you can take -5 to attack for +10 damage.",
  },
  {
    id: "shield-master",
    name: "Shield Master",
    summary:
      "Bonus-action shove with your shield after the Attack action. Add shield AC bonus to DEX saves vs effects targeting you alone. Use reaction to take no damage on a successful save.",
  },
  {
    id: "skilled",
    name: "Skilled",
    summary:
      "Gain proficiency in any combination of three skills or tools of your choice.",
  },
  {
    id: "spell-sniper",
    name: "Spell Sniper",
    prerequisite: "Ability to cast at least one spell",
    summary:
      "Spell attack range is doubled. Spell attacks ignore half and three-quarters cover. Learn one attack-roll cantrip from any spell list.",
  },
  {
    id: "tough",
    name: "Tough",
    summary:
      "Your hit point maximum increases by 2 for every level you have, including levels you gain after taking this feat.",
    hpPerLevel: 2,
  },
  {
    id: "war-caster",
    name: "War Caster",
    prerequisite: "Ability to cast at least one spell",
    summary:
      "Advantage on concentration saves. Somatic components work with weapons/shields in hand. Cast a spell (1 action) as an opportunity attack.",
  },
];

const FEATS_BY_ID: Record<string, FeatInfo> = Object.fromEntries(
  SRD_FEATS.map((f) => [f.id, f]),
);

export function getFeat(id: string): FeatInfo | undefined {
  return FEATS_BY_ID[id];
}

// Total bonus HP a character has from on-sheet feats (currently just Tough).
// Used both at level-up time (to retroactively credit Tough on pick) and
// future passes (to keep adding +2 per level while Tough is taken).
export function bonusHpFromFeats(featIds: readonly string[] | undefined, level: number): number {
  if (!featIds || featIds.length === 0) return 0;
  let total = 0;
  for (const id of featIds) {
    const f = FEATS_BY_ID[id];
    if (f?.hpPerLevel) total += f.hpPerLevel * level;
  }
  return total;
}

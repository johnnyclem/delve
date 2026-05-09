import { describe, it, expect } from "vitest";
import { DND_RACES, DND_CLASSES } from "./dnd-options";
import {
  RACE_DATA, CLASS_DATA, ABILITY_LABEL_TO_NAME,
  level1MaxHp, modifierFor, abilityNameToLabel,
} from "./dnd-srd";

describe("RACE_DATA", () => {
  it("covers every race in DND_RACES", () => {
    for (const race of DND_RACES) {
      expect(RACE_DATA[race]).toBeDefined();
      expect(RACE_DATA[race].name).toBe(race);
    }
  });

  it("each race has a positive integer speed and at least one trait", () => {
    for (const race of DND_RACES) {
      const r = RACE_DATA[race];
      expect(r.speed).toBeGreaterThan(0);
      expect(Number.isInteger(r.speed)).toBe(true);
      expect(r.traits.length).toBeGreaterThan(0);
      expect(["Small", "Medium"]).toContain(r.size);
    }
  });

  it("ability bonuses sum to a sensible value (1..6)", () => {
    for (const race of DND_RACES) {
      const total = Object.values(RACE_DATA[race].abilityBonuses).reduce(
        (sum, v) => sum + (v ?? 0), 0,
      );
      expect(total).toBeGreaterThanOrEqual(1);
      expect(total).toBeLessThanOrEqual(6);
    }
  });
});

describe("CLASS_DATA", () => {
  it("covers every class in DND_CLASSES", () => {
    for (const cls of DND_CLASSES) {
      expect(CLASS_DATA[cls]).toBeDefined();
      expect(CLASS_DATA[cls].name).toBe(cls);
    }
  });

  it("each class has exactly two saving throws and a valid hit die", () => {
    for (const cls of DND_CLASSES) {
      const c = CLASS_DATA[cls];
      expect(c.savingThrows).toHaveLength(2);
      expect([6, 8, 10, 12]).toContain(c.hitDie);
      expect(c.level1Features.length).toBeGreaterThan(0);
      expect(c.startingEquipmentOptions.length).toBeGreaterThan(0);
    }
  });

  it("skill choices count is positive and from list contains enough options", () => {
    for (const cls of DND_CLASSES) {
      const sc = CLASS_DATA[cls].skillChoices;
      expect(sc.count).toBeGreaterThan(0);
      expect(sc.from.length).toBeGreaterThanOrEqual(sc.count);
    }
  });
});

describe("auto-fill regression checkpoints (task spec)", () => {
  it("Half-Orc grants +2 STR (the slot should show +2)", () => {
    expect(RACE_DATA["Half-Orc"].abilityBonuses.strength).toBe(2);
    expect(RACE_DATA["Half-Orc"].abilityBonuses.constitution).toBe(1);
  });

  it("Fighter mandates STR & CON saving-throw proficiencies", () => {
    expect(CLASS_DATA.Fighter.savingThrows).toContain("strength");
    expect(CLASS_DATA.Fighter.savingThrows).toContain("constitution");
  });

  it("Wizard's first starting-equipment option includes Quarterstaff", () => {
    const weaponSlot = CLASS_DATA.Wizard.startingEquipmentOptions[0];
    const quarterstaffOption = weaponSlot.choices.find((c) =>
      c.items.includes("Quarterstaff"),
    );
    expect(quarterstaffOption).toBeDefined();
  });

  it("Mountain-Dwarf-equivalent (base Dwarf) speed is 25 (not 30)", () => {
    expect(RACE_DATA.Dwarf.speed).toBe(25);
  });

  it("Tiefling has CHA+2 INT+1 and Hellish Resistance trait", () => {
    expect(RACE_DATA.Tiefling.abilityBonuses.charisma).toBe(2);
    expect(RACE_DATA.Tiefling.abilityBonuses.intelligence).toBe(1);
    expect(RACE_DATA.Tiefling.traits.map((t) => t.name)).toContain("Hellish Resistance");
  });
});

describe("helpers", () => {
  it("modifierFor matches 5e table", () => {
    expect(modifierFor(8)).toBe(-1);
    expect(modifierFor(10)).toBe(0);
    expect(modifierFor(11)).toBe(0);
    expect(modifierFor(14)).toBe(2);
    expect(modifierFor(20)).toBe(5);
  });

  it("level1MaxHp = hitDie + CON modifier", () => {
    // Fighter d10 with CON 14 (mod +2) → 12
    expect(level1MaxHp(10, 14)).toBe(12);
    expect(level1MaxHp(6, 10)).toBe(6);
    expect(level1MaxHp(12, 16)).toBe(15);
  });

  it("ABILITY_LABEL_TO_NAME round-trips with abilityNameToLabel", () => {
    for (const [label, name] of Object.entries(ABILITY_LABEL_TO_NAME)) {
      expect(abilityNameToLabel(name)).toBe(label);
    }
  });
});

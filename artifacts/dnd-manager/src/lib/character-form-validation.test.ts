import { describe, it, expect } from "vitest";
import {
  isStep0Valid,
  isStep1Valid,
  isCombatValid,
  isFormValidForSubmit,
  type CharacterFormValidatableState,
} from "./character-form-validation";

const fullPool = [
  { id: "a", total: 15 },
  { id: "b", total: 14 },
  { id: "c", total: 13 },
  { id: "d", total: 12 },
  { id: "e", total: 10 },
  { id: "f", total: 8 },
];
const fullAssign = {
  strength: "a",
  dexterity: "b",
  constitution: "c",
  intelligence: "d",
  wisdom: "e",
  charisma: "f",
} as const;

const validForm: CharacterFormValidatableState = {
  name: "Thalion",
  resolvedRace: "Elf",
  resolvedClass: "Wizard",
  scorePool: fullPool,
  abilityAssignments: { ...fullAssign },
  maxHp: 10,
  currentHp: 10,
  armorClass: 12,
  speed: 30,
  proficiencyBonus: 2,
};

describe("isStep0Valid", () => {
  it("requires name, race, class", () => {
    expect(isStep0Valid(validForm)).toBe(true);
    expect(isStep0Valid({ ...validForm, name: "  " })).toBe(false);
    expect(isStep0Valid({ ...validForm, resolvedRace: "" })).toBe(false);
    expect(isStep0Valid({ ...validForm, resolvedClass: "" })).toBe(false);
  });
});

describe("isStep1Valid", () => {
  it("passes when all six abilities are assigned to distinct chips in pool", () => {
    expect(isStep1Valid(validForm)).toBe(true);
  });

  it("fails when an ability is unassigned (regression: blocked submit)", () => {
    expect(
      isStep1Valid({
        ...validForm,
        abilityAssignments: { ...fullAssign, strength: null },
      }),
    ).toBe(false);
  });

  it("fails when pool size != 6", () => {
    expect(isStep1Valid({ ...validForm, scorePool: fullPool.slice(0, 5) })).toBe(false);
  });

  it("fails when the same chip is assigned to two abilities", () => {
    expect(
      isStep1Valid({
        ...validForm,
        abilityAssignments: { ...fullAssign, charisma: "a" },
      }),
    ).toBe(false);
  });

  it("fails when an assignment references a chip not in the pool", () => {
    expect(
      isStep1Valid({
        ...validForm,
        abilityAssignments: { ...fullAssign, charisma: "ghost" },
      }),
    ).toBe(false);
  });
});

describe("isCombatValid", () => {
  it("rejects NaN and out-of-range numerics (regression: NaN sheetJson)", () => {
    expect(isCombatValid({ ...validForm, maxHp: Number.NaN })).toBe(false);
    expect(isCombatValid({ ...validForm, maxHp: 0 })).toBe(false);
    expect(isCombatValid({ ...validForm, currentHp: 11 })).toBe(false); // > maxHp
    expect(isCombatValid({ ...validForm, proficiencyBonus: 7 })).toBe(false);
    expect(isCombatValid({ ...validForm, speed: -1 })).toBe(false);
  });

  it("accepts valid combat numerics", () => {
    expect(isCombatValid(validForm)).toBe(true);
  });
});

describe("isFormValidForSubmit", () => {
  it("returns true for a complete valid form", () => {
    expect(isFormValidForSubmit(validForm)).toBe(true);
  });

  it("returns false when any step is invalid (regression: 'Failed to create character')", () => {
    expect(
      isFormValidForSubmit({
        ...validForm,
        abilityAssignments: { ...fullAssign, wisdom: null },
      }),
    ).toBe(false);
    expect(isFormValidForSubmit({ ...validForm, name: "" })).toBe(false);
    expect(isFormValidForSubmit({ ...validForm, maxHp: Number.NaN })).toBe(false);
  });
});

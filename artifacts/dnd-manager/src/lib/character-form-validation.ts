import type { AbilityName } from "./dnd-options";

// Shape consumed by every step validator below. The wizard collects more
// state than this, but only these fields gate "is this step complete?".
export interface CharacterFormValidatableState {
  name: string;
  resolvedRace: string;
  resolvedClass: string;
  resolvedBackground: string;
  scorePool: { id: string; total: number }[];
  abilityAssignments: Record<AbilityName, string | null>;
  maxHp: number;
  currentHp: number;
  armorClass: number;
  speed: number;
  proficiencyBonus: number;
}

// ---- 6-step wizard validators (Identity / Origin / Calling / Background /
// Abilities / Review). The legacy `isStep0Valid` / `isStep1Valid` /
// `isCombatValid` exports are kept as semantic aliases so existing tests
// continue to compile.

/** Step 0 (Identity): just need a name. Race / class / background are picked
 * on later steps in the new flow. */
export function isIdentityValid(s: Pick<CharacterFormValidatableState, "name">): boolean {
  return s.name.trim() !== "";
}

/** Step 1 (Origin): a race must be picked or a custom race typed. */
export function isOriginValid(s: Pick<CharacterFormValidatableState, "resolvedRace">): boolean {
  return s.resolvedRace.trim() !== "";
}

/** Step 2 (Calling): a class must be picked or a custom class typed. */
export function isCallingValid(s: Pick<CharacterFormValidatableState, "resolvedClass">): boolean {
  return s.resolvedClass.trim() !== "";
}

/** Step 3 (Background): a background must be picked. The picker offers a
 * "Custom" escape hatch, but the field itself is required to leave the step
 * — anyone genuinely wanting no background can pick Custom and leave it
 * blank, which is treated as invalid (force a deliberate choice). */
export function isBackgroundValid(s: Pick<CharacterFormValidatableState, "resolvedBackground">): boolean {
  return s.resolvedBackground.trim() !== "";
}

/** Step 4 (Abilities): every ability slot has a chip from a complete pool,
 * AND the auto-filled combat numerics are sane. The Customize disclosure on
 * the Abilities step exposes the same controls that used to live on the
 * legacy "Combat" step, so we validate them together here. */
export function isAbilitiesValid(
  s: Pick<
    CharacterFormValidatableState,
    | "scorePool"
    | "abilityAssignments"
    | "maxHp"
    | "currentHp"
    | "armorClass"
    | "speed"
    | "proficiencyBonus"
  >,
): boolean {
  return isAbilityAssignmentsValid(s) && isCombatNumericsValid(s);
}

/** Helper: just the ability-chip half of step 4. */
export function isAbilityAssignmentsValid(
  s: Pick<CharacterFormValidatableState, "scorePool" | "abilityAssignments">,
): boolean {
  if (s.scorePool.length !== 6) return false;
  const ids = Object.values(s.abilityAssignments);
  if (ids.some((v) => v === null)) return false;
  const nonNull = ids.filter((v): v is string => v !== null);
  if (new Set(nonNull).size !== 6) return false;
  const poolIds = new Set(s.scorePool.map((c) => c.id));
  return nonNull.every((id) => poolIds.has(id));
}

/** Helper: just the combat-numerics half of step 4. */
export function isCombatNumericsValid(
  s: Pick<CharacterFormValidatableState, "maxHp" | "currentHp" | "armorClass" | "speed" | "proficiencyBonus">,
): boolean {
  return (
    Number.isFinite(s.maxHp) && s.maxHp >= 1 &&
    Number.isFinite(s.currentHp) && s.currentHp >= 0 && s.currentHp <= s.maxHp &&
    Number.isFinite(s.armorClass) && s.armorClass >= 0 &&
    Number.isFinite(s.speed) && s.speed >= 0 &&
    Number.isFinite(s.proficiencyBonus) && s.proficiencyBonus >= 1 && s.proficiencyBonus <= 6
  );
}

export function isFormValidForSubmit(s: CharacterFormValidatableState): boolean {
  return (
    isIdentityValid(s) &&
    isOriginValid(s) &&
    isCallingValid(s) &&
    isBackgroundValid(s) &&
    isAbilitiesValid(s)
  );
}

// ---- Legacy aliases (kept so the existing test file & call sites compile).
// `isStep0Valid` historically meant "Basics: name + race + class". The new
// wizard splits those across three steps, so we expose it as the AND of the
// three for back-compat.
export function isStep0Valid(
  s: Pick<CharacterFormValidatableState, "name" | "resolvedRace" | "resolvedClass">,
): boolean {
  return s.name.trim() !== "" && s.resolvedRace.trim() !== "" && s.resolvedClass.trim() !== "";
}

export const isStep1Valid = isAbilityAssignmentsValid;
export const isCombatValid = isCombatNumericsValid;

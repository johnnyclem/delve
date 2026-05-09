import type { AbilityName } from "./dnd-options";

export interface CharacterFormValidatableState {
  name: string;
  resolvedRace: string;
  resolvedClass: string;
  scorePool: { id: string; total: number }[];
  abilityAssignments: Record<AbilityName, string | null>;
  maxHp: number;
  currentHp: number;
  armorClass: number;
  speed: number;
  proficiencyBonus: number;
}

export function isStep0Valid(s: Pick<CharacterFormValidatableState, "name" | "resolvedRace" | "resolvedClass">): boolean {
  return s.name.trim() !== "" && s.resolvedRace.trim() !== "" && s.resolvedClass.trim() !== "";
}

export function isStep1Valid(
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

export function isCombatValid(
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
  return isStep0Valid(s) && isStep1Valid(s) && isCombatValid(s);
}

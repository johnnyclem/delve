import type { AbilityName } from "./dnd-options";
import { ABILITY_ORDER } from "./dnd-options";
import { modifierFor, type HitDieSize } from "./dnd-srd";

export const ASI_LEVELS: readonly number[] = [4, 8, 12, 16, 19];
export const ABILITY_SCORE_CAP = 20;
export const MAX_LEVEL = 20;

export function isAsiLevel(level: number): boolean {
  return ASI_LEVELS.includes(level);
}

// hitDie/2 + 1 (5e standard "take the average" rule).
export function averageHpGain(hitDie: HitDieSize): number {
  return Math.floor(hitDie / 2) + 1;
}

// Computes the per-level HP gain after folding in CON modifier. Minimum 1
// (a 5e rule — even with -CON you always gain at least 1 HP per level).
export function levelUpHpGain(roll: number, conScore: number): number {
  const mod = modifierFor(conScore);
  return Math.max(1, roll + mod);
}

// Multi-pass catch-up: returns each "from -> to" pair, one level at a time.
export function getCatchUpPasses(
  currentLevel: number,
  targetLevel: number,
): Array<{ from: number; to: number; index: number; total: number }> {
  const from = Math.max(1, Math.floor(currentLevel));
  const to = Math.min(MAX_LEVEL, Math.floor(targetLevel));
  if (to <= from) return [];
  const passes: Array<{ from: number; to: number; index: number; total: number }> = [];
  const total = to - from;
  for (let i = 0; i < total; i++) {
    passes.push({ from: from + i, to: from + i + 1, index: i + 1, total });
  }
  return passes;
}

export type AsiChoice =
  | { kind: "none" }
  | { kind: "plus2"; ability: AbilityName }
  | { kind: "plus1x2"; abilityA: AbilityName; abilityB: AbilityName }
  | { kind: "feat"; description: string };

export type AbilityScores = Record<AbilityName, number>;

export interface AsiValidation {
  ok: boolean;
  error?: string;
}

// Validates an ASI/feat choice against the 20 cap. "feat" needs a non-empty
// description. "plus1x2" requires two distinct abilities.
export function validateAsiChoice(scores: AbilityScores, choice: AsiChoice): AsiValidation {
  if (choice.kind === "none") {
    return { ok: false, error: "Pick an option to continue." };
  }
  if (choice.kind === "plus2") {
    const next = (scores[choice.ability] ?? 10) + 2;
    if (next > ABILITY_SCORE_CAP) {
      return { ok: false, error: `That would push ${labelOf(choice.ability)} above ${ABILITY_SCORE_CAP}.` };
    }
    return { ok: true };
  }
  if (choice.kind === "plus1x2") {
    if (choice.abilityA === choice.abilityB) {
      return { ok: false, error: "Pick two different abilities." };
    }
    const nextA = (scores[choice.abilityA] ?? 10) + 1;
    const nextB = (scores[choice.abilityB] ?? 10) + 1;
    if (nextA > ABILITY_SCORE_CAP) {
      return { ok: false, error: `That would push ${labelOf(choice.abilityA)} above ${ABILITY_SCORE_CAP}.` };
    }
    if (nextB > ABILITY_SCORE_CAP) {
      return { ok: false, error: `That would push ${labelOf(choice.abilityB)} above ${ABILITY_SCORE_CAP}.` };
    }
    return { ok: true };
  }
  if (choice.kind === "feat") {
    if (!choice.description.trim()) {
      return { ok: false, error: "Describe the feat you took." };
    }
    return { ok: true };
  }
  return { ok: false, error: "Unknown choice." };
}

// Applies the choice to a copy of the scores. Caller should validate first.
export function applyAsiChoice(scores: AbilityScores, choice: AsiChoice): AbilityScores {
  const next: AbilityScores = { ...scores };
  if (choice.kind === "plus2") {
    next[choice.ability] = (next[choice.ability] ?? 10) + 2;
  } else if (choice.kind === "plus1x2") {
    next[choice.abilityA] = (next[choice.abilityA] ?? 10) + 1;
    next[choice.abilityB] = (next[choice.abilityB] ?? 10) + 1;
  }
  return next;
}

// Builds a one-line diff like "+1 STR, +1 CON" for the confirm step.
export function describeAsiChoice(before: AbilityScores, choice: AsiChoice): string {
  if (choice.kind === "plus2") {
    return `+2 ${labelOf(choice.ability)}`;
  }
  if (choice.kind === "plus1x2") {
    return `+1 ${labelOf(choice.abilityA)}, +1 ${labelOf(choice.abilityB)}`;
  }
  if (choice.kind === "feat") {
    return `Feat: ${choice.description.trim()}`;
  }
  return "No ASI";
}

// Append a feat note to the existing notes string with a clear marker.
export function appendFeatNote(existing: string | null | undefined, level: number, description: string): string {
  const stamp = `Took feat at level ${level} — ${description.trim()}`;
  const prev = (existing ?? "").trim();
  return prev ? `${prev}\n\n${stamp}` : stamp;
}

function labelOf(a: AbilityName): string {
  return a.slice(0, 3).toUpperCase();
}

// Copy ability scores out of a sheet-like object, defaulting any missing
// score to 10 so downstream math doesn't NaN on partially-filled sheets.
export function readAbilityScores(sheet: Partial<Record<AbilityName, number>>): AbilityScores {
  const out = {} as AbilityScores;
  for (const a of ABILITY_ORDER) {
    const v = sheet[a];
    out[a] = typeof v === "number" && Number.isFinite(v) ? v : 10;
  }
  return out;
}

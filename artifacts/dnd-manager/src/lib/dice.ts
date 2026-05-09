export interface AbilityRoll {
  dice: [number, number, number, number];
  droppedIndex: number;
  total: number;
}

export type RngFn = () => number;

const defaultRng: RngFn = Math.random;

function rollD6(rng: RngFn): number {
  return Math.floor(rng() * 6) + 1;
}

export function rollAbilityScore(rng: RngFn = defaultRng): AbilityRoll {
  const dice: [number, number, number, number] = [
    rollD6(rng),
    rollD6(rng),
    rollD6(rng),
    rollD6(rng),
  ];
  let droppedIndex = 0;
  for (let i = 1; i < 4; i++) {
    if (dice[i] < dice[droppedIndex]) droppedIndex = i;
  }
  const total = dice.reduce((sum, d, i) => (i === droppedIndex ? sum : sum + d), 0);
  return { dice, droppedIndex, total };
}

export function rollAbilityScores(rng: RngFn = defaultRng): AbilityRoll[] {
  return Array.from({ length: 6 }, () => rollAbilityScore(rng));
}

export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

export function abilityRollLabel(roll: AbilityRoll): string {
  const kept = roll.dice.filter((_, i) => i !== roll.droppedIndex);
  const dropped = roll.dice[roll.droppedIndex];
  return `${roll.total} = ${kept.join("+")} (dropped ${dropped})`;
}

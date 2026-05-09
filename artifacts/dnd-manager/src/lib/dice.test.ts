import { describe, it, expect } from "vitest";
import { rollAbilityScore, rollAbilityScores, STANDARD_ARRAY, abilityRollLabel, type RngFn } from "./dice";

function seededRng(values: number[]): RngFn {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

describe("rollAbilityScore", () => {
  it("returns four dice in 1..6 and total in 3..18", () => {
    for (let i = 0; i < 200; i++) {
      const r = rollAbilityScore();
      expect(r.dice).toHaveLength(4);
      for (const d of r.dice) {
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(6);
      }
      expect(r.total).toBeGreaterThanOrEqual(3);
      expect(r.total).toBeLessThanOrEqual(18);
    }
  });

  it("drops the lowest die and totals the other three", () => {
    // rng -> floor(v*6)+1 ; 0.0->1, 0.5->4, 0.83->5, 0.99->6
    const r = rollAbilityScore(seededRng([0.0, 0.5, 0.83, 0.99]));
    expect(r.dice).toEqual([1, 4, 5, 6]);
    expect(r.droppedIndex).toBe(0); // dropped the 1
    expect(r.total).toBe(15);
  });

  it("drops only one die even when multiple ties for lowest", () => {
    const r = rollAbilityScore(seededRng([0.0, 0.0, 0.5, 0.83]));
    expect(r.dice).toEqual([1, 1, 4, 5]);
    // drops the FIRST lowest (consistent tie-break)
    expect(r.droppedIndex).toBe(0);
    expect(r.total).toBe(1 + 4 + 5);
  });
});

describe("rollAbilityScores", () => {
  it("returns exactly 6 rolls", () => {
    expect(rollAbilityScores()).toHaveLength(6);
  });
});

describe("STANDARD_ARRAY", () => {
  it("matches the official 5e standard array", () => {
    expect(STANDARD_ARRAY).toEqual([15, 14, 13, 12, 10, 8]);
  });
});

describe("abilityRollLabel", () => {
  it("formats label with kept dice and dropped die", () => {
    const r = rollAbilityScore(seededRng([0.0, 0.5, 0.83, 0.99]));
    expect(abilityRollLabel(r)).toBe("15 = 4+5+6 (dropped 1)");
  });
});

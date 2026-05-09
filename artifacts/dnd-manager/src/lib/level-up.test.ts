import { describe, expect, it } from "vitest";
import {
  ASI_LEVELS,
  appendFeatNote,
  applyAsiChoice,
  averageHpGain,
  describeAsiChoice,
  getCatchUpPasses,
  isAsiLevel,
  levelUpHpGain,
  readAbilityScores,
  validateAsiChoice,
  type AbilityScores,
} from "./level-up";
import { rollHitDie } from "./dice";

const baseScores: AbilityScores = {
  strength: 14,
  dexterity: 12,
  constitution: 16,
  intelligence: 10,
  wisdom: 13,
  charisma: 8,
};

describe("ASI levels", () => {
  it("matches the canonical 5e ASI level list", () => {
    expect(ASI_LEVELS).toEqual([4, 8, 12, 16, 19]);
  });
  it("isAsiLevel reports true only at ASI levels", () => {
    for (const l of [4, 8, 12, 16, 19]) expect(isAsiLevel(l)).toBe(true);
    for (const l of [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 20]) {
      expect(isAsiLevel(l)).toBe(false);
    }
  });
});

describe("HP math", () => {
  it("averageHpGain matches 5e take-the-average (hitDie/2 + 1)", () => {
    expect(averageHpGain(6)).toBe(4);
    expect(averageHpGain(8)).toBe(5);
    expect(averageHpGain(10)).toBe(6);
    expect(averageHpGain(12)).toBe(7);
  });
  it("levelUpHpGain folds in CON mod and clamps to a minimum of 1", () => {
    expect(levelUpHpGain(7, 14)).toBe(9); // 7 + (+2)
    expect(levelUpHpGain(1, 8)).toBe(1); // 1 + (-1) = 0 -> clamped to 1
    expect(levelUpHpGain(5, 20)).toBe(10); // 5 + (+5)
  });
  it("rollHitDie stays within [1, hitDie] for a sequence-based RNG", () => {
    const seq = [0, 0.999, 0.5, 0.25];
    let i = 0;
    const rng = () => seq[i++ % seq.length];
    expect(rollHitDie(8, rng)).toBe(1); // floor(0*8)+1
    expect(rollHitDie(8, rng)).toBe(8); // floor(0.999*8)+1 = 8
    expect(rollHitDie(8, rng)).toBe(5);
    expect(rollHitDie(8, rng)).toBe(3);
  });
});

describe("getCatchUpPasses", () => {
  it("returns an empty list when no catch-up is needed", () => {
    expect(getCatchUpPasses(5, 5)).toEqual([]);
    expect(getCatchUpPasses(5, 4)).toEqual([]);
  });
  it("returns one pass per level for a multi-level jump", () => {
    const passes = getCatchUpPasses(3, 5);
    expect(passes).toEqual([
      { from: 3, to: 4, index: 1, total: 2 },
      { from: 4, to: 5, index: 2, total: 2 },
    ]);
  });
  it("clamps target to MAX_LEVEL", () => {
    const passes = getCatchUpPasses(19, 25);
    expect(passes).toEqual([{ from: 19, to: 20, index: 1, total: 1 }]);
  });
});

describe("validateAsiChoice", () => {
  it("rejects unselected option", () => {
    expect(validateAsiChoice(baseScores, { kind: "none" }).ok).toBe(false);
  });
  it("blocks +2 when it would exceed the cap", () => {
    const high = { ...baseScores, strength: 19 };
    const res = validateAsiChoice(high, { kind: "plus2", ability: "strength" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/STR/);
  });
  it("allows +2 that lands exactly on 20", () => {
    const at18 = { ...baseScores, strength: 18 };
    expect(validateAsiChoice(at18, { kind: "plus2", ability: "strength" }).ok).toBe(true);
  });
  it("blocks +1/+1 when either would exceed the cap", () => {
    const high = { ...baseScores, dexterity: 20, charisma: 10 };
    const res = validateAsiChoice(high, {
      kind: "plus1x2",
      abilityA: "dexterity",
      abilityB: "charisma",
    });
    expect(res.ok).toBe(false);
  });
  it("requires two distinct abilities for +1/+1", () => {
    const res = validateAsiChoice(baseScores, {
      kind: "plus1x2",
      abilityA: "wisdom",
      abilityB: "wisdom",
    });
    expect(res.ok).toBe(false);
  });
  it("requires a non-empty feat description", () => {
    expect(validateAsiChoice(baseScores, { kind: "feat", description: "  " }).ok).toBe(false);
    expect(validateAsiChoice(baseScores, { kind: "feat", description: "Sharpshooter" }).ok).toBe(true);
  });
});

describe("applyAsiChoice", () => {
  it("applies +2 to one ability without touching others", () => {
    const next = applyAsiChoice(baseScores, { kind: "plus2", ability: "strength" });
    expect(next.strength).toBe(16);
    expect(next.dexterity).toBe(baseScores.dexterity);
  });
  it("applies +1 to two abilities", () => {
    const next = applyAsiChoice(baseScores, {
      kind: "plus1x2",
      abilityA: "constitution",
      abilityB: "wisdom",
    });
    expect(next.constitution).toBe(17);
    expect(next.wisdom).toBe(14);
  });
  it("does not mutate the input", () => {
    const snap = { ...baseScores };
    applyAsiChoice(baseScores, { kind: "plus2", ability: "strength" });
    expect(baseScores).toEqual(snap);
  });
  it("feat choice leaves scores unchanged", () => {
    const next = applyAsiChoice(baseScores, { kind: "feat", description: "Lucky" });
    expect(next).toEqual(baseScores);
  });
});

describe("describeAsiChoice / appendFeatNote", () => {
  it("describes choices in compact form", () => {
    expect(describeAsiChoice(baseScores, { kind: "plus2", ability: "constitution" })).toBe("+2 CON");
    expect(
      describeAsiChoice(baseScores, {
        kind: "plus1x2",
        abilityA: "strength",
        abilityB: "wisdom",
      }),
    ).toBe("+1 STR, +1 WIS");
    expect(describeAsiChoice(baseScores, { kind: "feat", description: "Sentinel" })).toBe("Feat: Sentinel");
  });
  it("appends a feat note with a level marker", () => {
    expect(appendFeatNote("", 4, "Sharpshooter")).toBe("Took feat at level 4 — Sharpshooter");
    expect(appendFeatNote("Old note", 8, "Lucky")).toBe(
      "Old note\n\nTook feat at level 8 — Lucky",
    );
  });
});

describe("readAbilityScores", () => {
  it("defaults missing scores to 10", () => {
    const scores = readAbilityScores({ strength: 18 });
    expect(scores.strength).toBe(18);
    expect(scores.dexterity).toBe(10);
    expect(scores.charisma).toBe(10);
  });
});

import { describe, expect, it } from "vitest";
import { SRD_FEATS, bonusHpFromFeats, getFeat } from "./dnd-feats";

describe("SRD_FEATS catalogue", () => {
  it("includes the common picks called out in the task", () => {
    const ids = SRD_FEATS.map((f) => f.id);
    for (const id of [
      "alert",
      "lucky",
      "sharpshooter",
      "great-weapon-master",
      "sentinel",
      "tough",
      "war-caster",
    ]) {
      expect(ids).toContain(id);
    }
  });
  it("getFeat returns the matching record", () => {
    expect(getFeat("tough")?.name).toBe("Tough");
    expect(getFeat("nope")).toBeUndefined();
  });
  it("only Tough exposes hpPerLevel today", () => {
    const withHp = SRD_FEATS.filter((f) => f.hpPerLevel);
    expect(withHp.map((f) => f.id)).toEqual(["tough"]);
    expect(getFeat("tough")?.hpPerLevel).toBe(2);
  });
});

describe("bonusHpFromFeats", () => {
  it("returns 0 for empty/undefined feat lists", () => {
    expect(bonusHpFromFeats(undefined, 5)).toBe(0);
    expect(bonusHpFromFeats([], 5)).toBe(0);
  });
  it("ignores feats with no hpPerLevel", () => {
    expect(bonusHpFromFeats(["alert", "lucky", "sentinel"], 10)).toBe(0);
  });
  it("scales Tough by character level (+2 per level)", () => {
    expect(bonusHpFromFeats(["tough"], 1)).toBe(2);
    expect(bonusHpFromFeats(["tough"], 5)).toBe(10);
    expect(bonusHpFromFeats(["tough"], 20)).toBe(40);
  });
  it("uses level=1 to compute the per-level increment", () => {
    // The level-up modal calls bonusHpFromFeats(feats, 1) on each pass to add
    // the recurring +2 per level while Tough is on the sheet.
    expect(bonusHpFromFeats(["tough", "alert"], 1)).toBe(2);
  });
});

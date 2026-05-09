import { describe, it, expect } from "vitest";
import { BACKGROUND_DATA, DND_BACKGROUNDS, CLASS_DATA } from "./dnd-srd";

describe("BACKGROUND_DATA", () => {
  it("ships at least the six SRD backgrounds the wizard advertises", () => {
    for (const bg of ["Acolyte", "Criminal", "Folk Hero", "Noble", "Sage", "Soldier"]) {
      expect(BACKGROUND_DATA[bg]).toBeDefined();
      expect(BACKGROUND_DATA[bg].name).toBe(bg);
    }
    expect(DND_BACKGROUNDS.length).toBeGreaterThanOrEqual(6);
  });

  it("each background has an emoji, a description, exactly two skill profs, and a feature", () => {
    for (const bg of DND_BACKGROUNDS) {
      const info = BACKGROUND_DATA[bg];
      expect(info.emoji).toMatch(/.+/);
      expect(info.description.length).toBeGreaterThan(20);
      expect(info.skillProficiencies).toHaveLength(2);
      expect(info.feature.name).toMatch(/.+/);
      expect(info.feature.description.length).toBeGreaterThan(10);
    }
  });

  it("background skill names are valid SRD skills (so dedupe with class skills works)", () => {
    // Build the canonical set from any class's full from-list (Bard knows them all).
    const allSkills = new Set<string>();
    for (const cls of Object.values(CLASS_DATA)) {
      for (const s of cls.skillChoices.from) allSkills.add(s);
    }
    for (const bg of DND_BACKGROUNDS) {
      for (const skill of BACKGROUND_DATA[bg].skillProficiencies) {
        expect(allSkills.has(skill)).toBe(true);
      }
    }
  });
});

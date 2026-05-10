import { describe, expect, it } from "vitest";
import { fillCharacterSheetPdf } from "./character-pdf";

describe("fillCharacterSheetPdf", () => {
  it("loads the bundled 5e template and returns a non-empty PDF", async () => {
    const stubCharacter = {
      id: 1,
      campaignId: 1,
      ownerUserId: "user_test",
      name: "Test Hero",
      race: "Human",
      class: "Fighter",
      level: 3,
      sheetJson: {},
      portraitUrl: null,
      relationshipTags: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerDisplayName: "Tester",
    };

    const bytes = await fillCharacterSheetPdf(stubCharacter);

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    // PDF magic bytes: %PDF
    expect(bytes[0]).toBe(0x25);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x44);
    expect(bytes[3]).toBe(0x46);
  });
});

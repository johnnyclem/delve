import { fillCharacterSheetPdf } from "./src/lib/character-pdf";
import { writeFileSync } from "node:fs";
const character: any = {
  id: 1, campaignId: 1, ownerUserId: "u1",
  name: "Thalion Stormwind",
  race: "Half-Elf", class: "Paladin", level: 7,
  ownerDisplayName: "Alex",
  isActive: true, createdAt: new Date(), updatedAt: new Date(), portraitUrl: null,
  sheetJson: {
    strength: 16, dexterity: 12, constitution: 14,
    intelligence: 10, wisdom: 13, charisma: 18,
    maxHp: 58, currentHp: 47, armorClass: 18, speed: 30, proficiencyBonus: 3,
    initiative: 1, alignment: "Lawful Good", background: "Acolyte",
    inspiration: true,
    savingThrows: ["Wisdom", "Charisma"],
    skills: ["Athletics", "Persuasion", "Religion", "Insight"],
    inventory: ["Longsword", "Shield", "Plate Armor"],
    proficiencies: "Common, Elvish",
    notes: "Sworn to the Order of the Dawn.",
  },
};
const bytes = await fillCharacterSheetPdf(character);
writeFileSync("/tmp/test-character.pdf", bytes);
console.log("OK size=" + bytes.length);

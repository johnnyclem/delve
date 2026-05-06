import { fillCharacterSheetPdf } from "./src/lib/character-pdf.ts";
import { writeFileSync } from "node:fs";
const character = {
  id: 1, campaignId: 1, ownerUserId: "u1",
  name: 'Thalion: Storm/Wind <test>"\r\n',
  race: "Half-Elf", class: "Paladin", level: 7,
  ownerDisplayName: "Alex",
  isActive: true, createdAt: new Date(), updatedAt: new Date(), portraitUrl: null,
  sheetJson: {
    strength: 16, dexterity: 12, constitution: 14,
    intelligence: 10, wisdom: 13, charisma: 18,
    maxHp: 58, currentHp: 47, tempHp: 0,
    armorClass: 18, speed: 30, proficiencyBonus: 3,
    initiative: 1, alignment: "Lawful Good", background: "Acolyte", xp: 14000,
    hitDiceTotal: "7d10", hitDice: "7d10", inspiration: true,
    savingThrows: ["Wisdom", "Charisma"],
    skills: ["Athletics", "Persuasion", "Religion", "Insight"],
    inventory: ["Longsword", "Shield", "Plate Armor", "Holy Symbol"],
    proficiencies: "Common, Elvish; All armor, shields, simple+martial weapons",
    notes: "Sworn to the Order of the Dawn. Hates undead.",
  },
};
const bytes = await fillCharacterSheetPdf(character);
writeFileSync("/tmp/test-character.pdf", bytes);
const head = Buffer.from(bytes.slice(0,8)).toString("utf8");
console.log("OK size=" + bytes.length + " header=" + JSON.stringify(head));

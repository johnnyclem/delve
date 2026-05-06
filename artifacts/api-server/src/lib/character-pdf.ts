import { PDFDocument, type PDFForm } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { charactersTable } from "@workspace/db";

type Character = typeof charactersTable.$inferSelect;

interface CharacterSheet {
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  maxHp?: number;
  currentHp?: number;
  tempHp?: number;
  hitDiceTotal?: string;
  hitDice?: string;
  armorClass?: number;
  initiative?: number;
  speed?: number;
  proficiencyBonus?: number;
  inspiration?: boolean | number;
  alignment?: string;
  background?: string;
  xp?: number;
  savingThrows?: string[];
  skills?: string[];
  inventory?: string[];
  proficiencies?: string;
  notes?: string;
  attacks?: Array<{ name: string; bonus: number; damage: string }>;
  spells?: Array<{ name: string; level?: number; description?: string }>;
  cantrips?: string[];
  spellSlots?: Record<string, { total?: number; used?: number }>;
}

export class TemplateMissingError extends Error {
  constructor(public readonly templatePath: string, cause?: unknown) {
    super(`5e character sheet template not configured at ${templatePath}`);
    this.name = "TemplateMissingError";
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// src/lib → ../../assets
const TEMPLATE_PATH = join(__dirname, "..", "..", "assets", "dnd-5e-character-sheet.pdf");

let templateBytesPromise: Promise<Uint8Array> | null = null;

async function loadTemplateBytes(): Promise<Uint8Array> {
  if (!templateBytesPromise) {
    templateBytesPromise = readFile(TEMPLATE_PATH).catch((err) => {
      // Reset cache on failure so a later request can retry after the asset is added.
      templateBytesPromise = null;
      throw new TemplateMissingError(TEMPLATE_PATH, err);
    });
  }
  return templateBytesPromise;
}

function abilityMod(score: number | undefined): number {
  return Math.floor(((score ?? 10) - 10) / 2);
}

function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

const SKILL_TO_ABILITY: Record<string, "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma"> = {
  acrobatics: "dexterity",
  "animal handling": "wisdom",
  arcana: "intelligence",
  athletics: "strength",
  deception: "charisma",
  history: "intelligence",
  insight: "wisdom",
  intimidation: "charisma",
  investigation: "intelligence",
  medicine: "wisdom",
  nature: "intelligence",
  perception: "wisdom",
  performance: "charisma",
  persuasion: "charisma",
  religion: "intelligence",
  "sleight of hand": "dexterity",
  stealth: "dexterity",
  survival: "wisdom",
};

const SAVE_TO_ABILITY: Record<string, keyof typeof SKILL_TO_ABILITY extends never ? never : "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma"> = {
  strength: "strength",
  dexterity: "dexterity",
  constitution: "constitution",
  intelligence: "intelligence",
  wisdom: "wisdom",
  charisma: "charisma",
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function isProficient(list: string[] | undefined, key: string): boolean {
  if (!list) return false;
  const target = normalize(key);
  return list.some((x) => normalize(x) === target);
}

/** Build the field map. Field names mirror the official WotC fillable sheet (case + trailing
 * whitespace preserved exactly as enumerated from the AcroForm). Any field not present in
 * sheetJson resolves to `undefined` and is left blank. */
function buildFieldValues(character: Character & { ownerDisplayName?: string }): Record<string, string> {
  const sheet: CharacterSheet = (character.sheetJson as CharacterSheet) ?? {};
  const profBonus = sheet.proficiencyBonus ?? 2;

  const mods = {
    strength: abilityMod(sheet.strength),
    dexterity: abilityMod(sheet.dexterity),
    constitution: abilityMod(sheet.constitution),
    intelligence: abilityMod(sheet.intelligence),
    wisdom: abilityMod(sheet.wisdom),
    charisma: abilityMod(sheet.charisma),
  };

  const saveValue = (ability: keyof typeof mods): string => {
    const base = mods[ability];
    const total = isProficient(sheet.savingThrows, ability) ? base + profBonus : base;
    return fmtMod(total);
  };

  const skillValue = (skillName: string): string => {
    const ability = SKILL_TO_ABILITY[normalize(skillName)];
    if (!ability) return "";
    const base = mods[ability];
    const total = isProficient(sheet.skills, skillName) ? base + profBonus : base;
    return fmtMod(total);
  };

  const passivePerception = 10 + mods.wisdom + (isProficient(sheet.skills, "perception") ? profBonus : 0);

  const values: Record<string, string | undefined> = {
    // Identity
    "CharacterName": character.name,
    "CharacterName 2": character.name,
    "ClassLevel": `${character.class} ${character.level}`,
    "Background": sheet.background ?? "",
    "PlayerName": character.ownerDisplayName ?? "",
    "Race ": character.race,
    "Alignment": sheet.alignment ?? "",
    "XP": typeof sheet.xp === "number" ? String(sheet.xp) : "",

    // Top stats
    "Inspiration": sheet.inspiration ? "1" : "",
    "ProfBonus": fmtMod(profBonus),
    "AC": String(sheet.armorClass ?? 10),
    "Initiative": fmtMod(sheet.initiative ?? mods.dexterity),
    "Speed": String(sheet.speed ?? 30),

    // Ability scores
    "STR": String(sheet.strength ?? 10),
    "DEX": String(sheet.dexterity ?? 10),
    "CON": String(sheet.constitution ?? 10),
    "INT": String(sheet.intelligence ?? 10),
    "WIS": String(sheet.wisdom ?? 10),
    "CHA": String(sheet.charisma ?? 10),
    "STRmod": fmtMod(mods.strength),
    "DEXmod ": fmtMod(mods.dexterity),
    "CONmod": fmtMod(mods.constitution),
    "INTmod": fmtMod(mods.intelligence),
    "WISmod": fmtMod(mods.wisdom),
    "CHamod": fmtMod(mods.charisma),

    // Saving throws
    "ST Strength": saveValue("strength"),
    "ST Dexterity": saveValue("dexterity"),
    "ST Constitution": saveValue("constitution"),
    "ST Intelligence": saveValue("intelligence"),
    "ST Wisdom": saveValue("wisdom"),
    "ST Charisma": saveValue("charisma"),

    // HP / Hit Dice
    "HPMax": typeof sheet.maxHp === "number" ? String(sheet.maxHp) : "",
    "HPCurrent": typeof sheet.currentHp === "number" ? String(sheet.currentHp) : "",
    "HPTemp": typeof sheet.tempHp === "number" ? String(sheet.tempHp) : "",
    "HDTotal": sheet.hitDiceTotal ?? "",
    "HD": sheet.hitDice ?? "",

    // Skills (note: trailing-space field names mirror the template exactly)
    "Acrobatics": skillValue("acrobatics"),
    "Animal": skillValue("animal handling"),
    "Arcana": skillValue("arcana"),
    "Athletics": skillValue("athletics"),
    "Deception ": skillValue("deception"),
    "History ": skillValue("history"),
    "Insight": skillValue("insight"),
    "Intimidation": skillValue("intimidation"),
    "Investigation ": skillValue("investigation"),
    "Medicine": skillValue("medicine"),
    "Nature": skillValue("nature"),
    "Perception ": skillValue("perception"),
    "Performance": skillValue("performance"),
    "Persuasion": skillValue("persuasion"),
    "Religion": skillValue("religion"),
    "SleightofHand": skillValue("sleight of hand"),
    "Stealth ": skillValue("stealth"),
    "Survival": skillValue("survival"),

    "Passive": String(passivePerception),
    "ProficienciesLang": sheet.proficiencies ?? "",

    // Equipment & narrative bits we have
    "Equipment": (sheet.inventory ?? []).join("\n"),
    "Features and Traits": sheet.notes ?? "",
  };

  // Drop empty strings so we never overwrite with "" (leaves the field blank instead of
  // explicitly setting an empty value, which keeps the sheet's default rendering).
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

function setTextFieldSafe(form: PDFForm, name: string, value: string): void {
  try {
    const f = form.getTextField(name);
    f.setText(value);
  } catch {
    // Field name doesn't exist on this template variant — silently skip per spec
    // ("Any field not present in our sheetJson is simply skipped").
  }
}

export interface FillOptions {
  /** When true (default), flatten the form so values render in non-form-aware viewers
   * and are baked into the printed sheet. */
  flatten?: boolean;
}

export async function fillCharacterSheetPdf(
  character: Character & { ownerDisplayName?: string },
  options: FillOptions = {},
): Promise<Uint8Array> {
  const flatten = options.flatten ?? true;

  const templateBytes = await loadTemplateBytes();
  // pdf-lib mutates the doc — load a fresh copy each call from the cached bytes.
  const doc = await PDFDocument.load(templateBytes);
  doc.setTitle(`${character.name} — D&D 5e Character Sheet`);
  doc.setAuthor("Delve");
  doc.setSubject("D&D 5e Character Sheet");
  doc.setCreator("Delve");

  const form = doc.getForm();
  const values = buildFieldValues(character);
  for (const [name, value] of Object.entries(values)) {
    setTextFieldSafe(form, name, value);
  }

  if (flatten) form.flatten();

  return await doc.save();
}

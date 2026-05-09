import { PDFDocument, type PDFForm } from "pdf-lib";
import type { charactersTable } from "@workspace/db";
import { AssetMissingError, getAssetCandidatePaths, loadAsset } from "./assets";

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

const TEMPLATE_REL_PATH = "dnd-5e-character-sheet.pdf";

export class TemplateMissingError extends Error {
  constructor(public readonly templatePath: string, cause?: unknown) {
    super(`5e character sheet template not configured at ${templatePath}`);
    this.name = "TemplateMissingError";
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

let templateBytesPromise: Promise<Uint8Array> | null = null;

async function loadTemplateBytes(): Promise<Uint8Array> {
  if (!templateBytesPromise) {
    templateBytesPromise = (async () => {
      try {
        return await loadAsset(TEMPLATE_REL_PATH);
      } catch (err) {
        // Reset cache on failure so a later request can retry after the asset is added.
        templateBytesPromise = null;
        const candidates = err instanceof AssetMissingError
          ? err.candidates
          : getAssetCandidatePaths(TEMPLATE_REL_PATH);
        throw new TemplateMissingError(candidates.join(", "), err);
      }
    })();
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
  const values: Record<string, string | undefined> = {};

  // ---- Identity (always set: come from the Character row, not sheetJson) ----
  values["CharacterName"] = character.name;
  values["CharacterName 2"] = character.name;
  values["ClassLevel"] = `${character.class} ${character.level}`;
  values["Race "] = character.race;
  if (character.ownerDisplayName) values["PlayerName"] = character.ownerDisplayName;

  // ---- Optional identity bits (only when present on sheetJson) ----
  if (sheet.background) values["Background"] = sheet.background;
  if (sheet.alignment) values["Alignment"] = sheet.alignment;
  if (typeof sheet.xp === "number") values["XP"] = String(sheet.xp);
  if (sheet.inspiration) values["Inspiration"] = "1";

  // ---- Combat top-row (only when present) ----
  if (typeof sheet.armorClass === "number") values["AC"] = String(sheet.armorClass);
  if (typeof sheet.speed === "number") values["Speed"] = String(sheet.speed);

  // Initiative: use explicit value, or DEX modifier when DEX is known. Otherwise blank.
  if (typeof sheet.initiative === "number") {
    values["Initiative"] = fmtMod(sheet.initiative);
  } else if (typeof sheet.dexterity === "number") {
    values["Initiative"] = fmtMod(abilityMod(sheet.dexterity));
  }

  // Proficiency bonus: only set when the sheet recorded one (don't invent +2).
  const profBonusKnown = typeof sheet.proficiencyBonus === "number";
  if (profBonusKnown) values["ProfBonus"] = fmtMod(sheet.proficiencyBonus as number);

  // ---- Ability scores + modifiers (only when score recorded) ----
  const abilityField = {
    strength:     ["STR", "STRmod"],
    dexterity:    ["DEX", "DEXmod "],
    constitution: ["CON", "CONmod"],
    intelligence: ["INT", "INTmod"],
    wisdom:       ["WIS", "WISmod"],
    charisma:     ["CHA", "CHamod"],
  } as const;

  type AbilityKey = keyof typeof abilityField;
  const ABILITIES: AbilityKey[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

  for (const ability of ABILITIES) {
    const score = sheet[ability];
    if (typeof score === "number") {
      const [scoreField, modField] = abilityField[ability];
      values[scoreField] = String(score);
      values[modField] = fmtMod(abilityMod(score));
    }
  }

  // ---- Saving throws (require both an ability score AND a known prof bonus
  // when the save is proficient; otherwise blank) ----
  const saveField: Record<AbilityKey, string> = {
    strength: "ST Strength",
    dexterity: "ST Dexterity",
    constitution: "ST Constitution",
    intelligence: "ST Intelligence",
    wisdom: "ST Wisdom",
    charisma: "ST Charisma",
  };

  for (const ability of ABILITIES) {
    const score = sheet[ability];
    if (typeof score !== "number") continue;
    const proficient = isProficient(sheet.savingThrows, ability);
    if (proficient && !profBonusKnown) continue;
    const bonus = proficient ? (sheet.proficiencyBonus as number) : 0;
    values[saveField[ability]] = fmtMod(abilityMod(score) + bonus);
  }

  // ---- HP / Hit Dice (only when present) ----
  if (typeof sheet.maxHp === "number") values["HPMax"] = String(sheet.maxHp);
  if (typeof sheet.currentHp === "number") values["HPCurrent"] = String(sheet.currentHp);
  if (typeof sheet.tempHp === "number") values["HPTemp"] = String(sheet.tempHp);
  if (sheet.hitDiceTotal) values["HDTotal"] = sheet.hitDiceTotal;
  if (sheet.hitDice) values["HD"] = sheet.hitDice;

  // ---- Skills (require the underlying ability score; same prof rule as saves) ----
  const skillField: Record<string, string> = {
    "acrobatics": "Acrobatics",
    "animal handling": "Animal",
    "arcana": "Arcana",
    "athletics": "Athletics",
    "deception": "Deception ",
    "history": "History ",
    "insight": "Insight",
    "intimidation": "Intimidation",
    "investigation": "Investigation ",
    "medicine": "Medicine",
    "nature": "Nature",
    "perception": "Perception ",
    "performance": "Performance",
    "persuasion": "Persuasion",
    "religion": "Religion",
    "sleight of hand": "SleightofHand",
    "stealth ": "Stealth ",
    "survival": "Survival",
  };

  for (const [skillKey, fieldName] of Object.entries(skillField)) {
    const ability = SKILL_TO_ABILITY[normalize(skillKey)];
    if (!ability) continue;
    const score = sheet[ability];
    if (typeof score !== "number") continue;
    const proficient = isProficient(sheet.skills, skillKey);
    if (proficient && !profBonusKnown) continue;
    const bonus = proficient ? (sheet.proficiencyBonus as number) : 0;
    values[fieldName] = fmtMod(abilityMod(score) + bonus);
  }

  // Passive perception: 10 + WIS mod (+ prof if proficient & known) — needs WIS.
  if (typeof sheet.wisdom === "number") {
    const perceptionProficient = isProficient(sheet.skills, "perception");
    if (!perceptionProficient || profBonusKnown) {
      const bonus = perceptionProficient ? (sheet.proficiencyBonus as number) : 0;
      values["Passive"] = String(10 + abilityMod(sheet.wisdom) + bonus);
    }
  }

  // ---- Narrative / inventory (only when present) ----
  if (sheet.proficiencies) values["ProficienciesLang"] = sheet.proficiencies;
  if (sheet.inventory && sheet.inventory.length > 0) {
    values["Equipment"] = sheet.inventory.join("\n");
  }
  if (sheet.notes) values["Features and Traits"] = sheet.notes;

  // Drop any undefined/empty entries so we never call setText("") (which would
  // overwrite a template-default with a blank).
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
  /** Optional portrait image bytes to embed in the sheet header. The caller is
   * responsible for fetching the image; this function silently skips embedding
   * when bytes are missing or the format isn't supported. */
  portrait?: { bytes: Uint8Array; contentType?: string } | null;
}

function detectImageKind(bytes: Uint8Array, contentType?: string): "png" | "jpg" | null {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  // Magic-byte sniff as a fallback (e.g. when content-type is missing/octet-stream).
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
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

  // Embed the portrait next to the character name in the header. The official 5e
  // sheet has a blank rectangle in the upper-right of page 1; we draw the image
  // there at a fixed size so it sits beside the CharacterName field.
  if (options.portrait?.bytes && options.portrait.bytes.length > 0) {
    const kind = detectImageKind(options.portrait.bytes, options.portrait.contentType);
    if (kind) {
      try {
        const img = kind === "png"
          ? await doc.embedPng(options.portrait.bytes)
          : await doc.embedJpg(options.portrait.bytes);
        const page = doc.getPage(0);
        const { width, height } = page.getSize();
        // Target a square box ~110pt in the upper-right header area, scaled to
        // preserve aspect ratio.
        const boxSize = 110;
        const scale = Math.min(boxSize / img.width, boxSize / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const x = width - drawW - 36; // 36pt right margin
        const y = height - drawH - 36; // 36pt top margin
        page.drawImage(img, { x, y, width: drawW, height: drawH });
      } catch {
        // Embedding failed (corrupt bytes, unsupported variant, etc.) — fall
        // back gracefully to a portrait-less sheet.
      }
    }
  }

  if (flatten) form.flatten();

  return await doc.save();
}

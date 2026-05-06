import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
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
  armorClass?: number;
  speed?: number;
  proficiencyBonus?: number;
  savingThrows?: string[];
  skills?: string[];
  inventory?: string[];
  attacks?: Array<{ name: string; bonus: number; damage: string }>;
  spells?: Array<{ name: string; level?: number; description?: string }>;
  cantrips?: string[];
  spellSlots?: Record<string, { total?: number; used?: number }>;
  notes?: string;
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
const INK = rgb(0.08, 0.08, 0.1);
const MUTED = rgb(0.4, 0.4, 0.45);
const ACCENT = rgb(0.42, 0.18, 0.78);
const RULE = rgb(0.78, 0.78, 0.82);

function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph === "") { lines.push(""); continue; }
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
          // Hard-break very long token
          let chunk = "";
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
              lines.push(chunk); chunk = ch;
            } else chunk += ch;
          }
          line = chunk;
        } else {
          line = word;
        }
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

interface DrawCtx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  cursor: { y: number };
  doc: PDFDocument;
}

function newPage(ctx: DrawCtx): void {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.cursor.y = PAGE_H - MARGIN;
}

function ensureSpace(ctx: DrawCtx, needed: number): void {
  if (ctx.cursor.y - needed < MARGIN) newPage(ctx);
}

function sectionHeader(ctx: DrawCtx, label: string): void {
  ensureSpace(ctx, 24);
  ctx.cursor.y -= 6;
  ctx.page.drawText(label.toUpperCase(), {
    x: MARGIN, y: ctx.cursor.y, size: 9, font: ctx.bold, color: ACCENT,
  });
  ctx.cursor.y -= 4;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.cursor.y },
    end: { x: PAGE_W - MARGIN, y: ctx.cursor.y },
    thickness: 0.5, color: RULE,
  });
  ctx.cursor.y -= 10;
}

function statBox(
  page: PDFPage, font: PDFFont, bold: PDFFont,
  x: number, y: number, w: number, h: number,
  label: string, value: string,
): void {
  page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: RULE, borderWidth: 0.75 });
  page.drawText(label.toUpperCase(), {
    x: x + 4, y: y - 11, size: 7, font: bold, color: MUTED,
  });
  const valueSize = 18;
  const tw = bold.widthOfTextAtSize(value, valueSize);
  page.drawText(value, {
    x: x + (w - tw) / 2, y: y - h + (h - valueSize) / 2 + 2,
    size: valueSize, font: bold, color: INK,
  });
}

function abilityBox(
  page: PDFPage, font: PDFFont, bold: PDFFont,
  x: number, y: number, w: number, h: number,
  label: string, score: number,
): void {
  page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: RULE, borderWidth: 0.75 });
  const labelW = bold.widthOfTextAtSize(label, 8);
  page.drawText(label, { x: x + (w - labelW) / 2, y: y - 12, size: 8, font: bold, color: MUTED });
  const scoreStr = String(score);
  const scoreW = bold.widthOfTextAtSize(scoreStr, 22);
  page.drawText(scoreStr, { x: x + (w - scoreW) / 2, y: y - 36, size: 22, font: bold, color: INK });
  const mod = abilityMod(score);
  const modW = font.widthOfTextAtSize(mod, 11);
  page.drawText(mod, { x: x + (w - modW) / 2, y: y - h + 6, size: 11, font, color: ACCENT });
}

export async function fillCharacterSheetPdf(character: Character & { ownerDisplayName?: string }): Promise<Uint8Array> {
  const sheet: CharacterSheet = (character.sheetJson as CharacterSheet) ?? {};

  const doc = await PDFDocument.create();
  doc.setTitle(`${character.name} — D&D 5e Character Sheet`);
  doc.setAuthor("Delve");
  doc.setSubject("D&D 5e Character Sheet");
  doc.setCreator("Delve");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  void italic;

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: DrawCtx = { page, font, bold, doc, cursor: { y: PAGE_H - MARGIN } };

  // Header
  ctx.page.drawText(character.name, { x: MARGIN, y: ctx.cursor.y - 18, size: 22, font: bold, color: INK });
  ctx.cursor.y -= 22;
  const subtitle = `Level ${character.level} ${character.race} ${character.class}`;
  ctx.page.drawText(subtitle, { x: MARGIN, y: ctx.cursor.y - 12, size: 11, font, color: MUTED });
  if (character.ownerDisplayName) {
    const playerLabel = `Player: ${character.ownerDisplayName}`;
    const w = font.widthOfTextAtSize(playerLabel, 9);
    ctx.page.drawText(playerLabel, { x: PAGE_W - MARGIN - w, y: ctx.cursor.y - 12, size: 9, font, color: MUTED });
  }
  ctx.cursor.y -= 18;

  // Brand mark (subtle)
  const brand = "DELVE — D&D 5E CHARACTER SHEET";
  const brandW = bold.widthOfTextAtSize(brand, 7);
  ctx.page.drawText(brand, { x: PAGE_W - MARGIN - brandW, y: PAGE_H - MARGIN + 2, size: 7, font: bold, color: ACCENT });

  ctx.cursor.y -= 4;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.cursor.y },
    end: { x: PAGE_W - MARGIN, y: ctx.cursor.y },
    thickness: 1, color: ACCENT,
  });
  ctx.cursor.y -= 16;

  // Top stat row: AC, HP, Speed, Prof Bonus
  const usable = PAGE_W - MARGIN * 2;
  const gap = 8;
  const boxW = (usable - gap * 3) / 4;
  const boxH = 46;
  const topY = ctx.cursor.y;
  statBox(ctx.page, font, bold, MARGIN + 0 * (boxW + gap), topY, boxW, boxH, "Armor Class", String(sheet.armorClass ?? 10));
  const hpStr = `${sheet.currentHp ?? 0} / ${sheet.maxHp ?? 0}`;
  statBox(ctx.page, font, bold, MARGIN + 1 * (boxW + gap), topY, boxW, boxH, "Hit Points", hpStr);
  statBox(ctx.page, font, bold, MARGIN + 2 * (boxW + gap), topY, boxW, boxH, "Speed", `${sheet.speed ?? 30} ft`);
  const pb = sheet.proficiencyBonus ?? 2;
  statBox(ctx.page, font, bold, MARGIN + 3 * (boxW + gap), topY, boxW, boxH, "Proficiency", pb >= 0 ? `+${pb}` : `${pb}`);
  ctx.cursor.y -= boxH + 14;

  // Ability scores row
  const abilities: Array<[string, number]> = [
    ["STR", sheet.strength ?? 10],
    ["DEX", sheet.dexterity ?? 10],
    ["CON", sheet.constitution ?? 10],
    ["INT", sheet.intelligence ?? 10],
    ["WIS", sheet.wisdom ?? 10],
    ["CHA", sheet.charisma ?? 10],
  ];
  const aboxW = (usable - gap * 5) / 6;
  const aboxH = 64;
  const aTop = ctx.cursor.y;
  abilities.forEach(([label, score], i) => {
    abilityBox(ctx.page, font, bold, MARGIN + i * (aboxW + gap), aTop, aboxW, aboxH, label, score);
  });
  ctx.cursor.y -= aboxH + 12;

  // Two-column area for Saving Throws + Skills
  const savingThrows = sheet.savingThrows ?? [];
  const skills = sheet.skills ?? [];

  const colGap = 14;
  const colW = (usable - colGap) / 2;

  if (savingThrows.length > 0 || skills.length > 0) {
    sectionHeader(ctx, "Proficiencies");
    const stColX = MARGIN;
    const skColX = MARGIN + colW + colGap;
    const startY = ctx.cursor.y;

    // Saving Throws
    ctx.page.drawText("Saving Throws", { x: stColX, y: startY, size: 9, font: bold, color: INK });
    let stY = startY - 14;
    if (savingThrows.length === 0) {
      ctx.page.drawText("None", { x: stColX, y: stY, size: 9, font: italic, color: MUTED });
      stY -= 12;
    } else {
      for (const st of savingThrows) {
        ctx.page.drawText("●", { x: stColX, y: stY, size: 7, font, color: ACCENT });
        ctx.page.drawText(st, { x: stColX + 12, y: stY, size: 9, font, color: INK });
        stY -= 12;
      }
    }

    // Skills
    ctx.page.drawText("Skills", { x: skColX, y: startY, size: 9, font: bold, color: INK });
    let skY = startY - 14;
    if (skills.length === 0) {
      ctx.page.drawText("None", { x: skColX, y: skY, size: 9, font: italic, color: MUTED });
      skY -= 12;
    } else {
      for (const sk of skills) {
        ctx.page.drawText("●", { x: skColX, y: skY, size: 7, font, color: ACCENT });
        ctx.page.drawText(sk, { x: skColX + 12, y: skY, size: 9, font, color: INK });
        skY -= 12;
      }
    }

    ctx.cursor.y = Math.min(stY, skY) - 6;
  }

  // Attacks
  if (sheet.attacks && sheet.attacks.length > 0) {
    sectionHeader(ctx, "Attacks & Spellcasting");
    const headers: Array<[string, number]> = [["Name", 0.5], ["Bonus", 0.2], ["Damage", 0.3]];
    const tableW = usable;
    let x = MARGIN;
    for (const [label, frac] of headers) {
      ctx.page.drawText(label.toUpperCase(), { x, y: ctx.cursor.y, size: 7, font: bold, color: MUTED });
      x += tableW * frac;
    }
    ctx.cursor.y -= 10;
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.cursor.y },
      end: { x: PAGE_W - MARGIN, y: ctx.cursor.y },
      thickness: 0.4, color: RULE,
    });
    ctx.cursor.y -= 12;
    for (const atk of sheet.attacks) {
      ensureSpace(ctx, 14);
      x = MARGIN;
      ctx.page.drawText(atk.name, { x, y: ctx.cursor.y, size: 9, font, color: INK });
      x += tableW * 0.5;
      const bonusStr = atk.bonus >= 0 ? `+${atk.bonus}` : `${atk.bonus}`;
      ctx.page.drawText(bonusStr, { x, y: ctx.cursor.y, size: 9, font, color: INK });
      x += tableW * 0.2;
      ctx.page.drawText(atk.damage, { x, y: ctx.cursor.y, size: 9, font, color: INK });
      ctx.cursor.y -= 13;
    }
  }

  // Cantrips & spells
  const hasMagic = (sheet.cantrips && sheet.cantrips.length > 0) || (sheet.spells && sheet.spells.length > 0);
  if (hasMagic) {
    sectionHeader(ctx, "Spells");
    if (sheet.cantrips && sheet.cantrips.length > 0) {
      ensureSpace(ctx, 14);
      ctx.page.drawText("Cantrips", { x: MARGIN, y: ctx.cursor.y, size: 9, font: bold, color: INK });
      ctx.cursor.y -= 12;
      const text = sheet.cantrips.join(" • ");
      const lines = wrapText(text, font, 9, usable);
      for (const line of lines) {
        ensureSpace(ctx, 12);
        ctx.page.drawText(line, { x: MARGIN, y: ctx.cursor.y, size: 9, font, color: INK });
        ctx.cursor.y -= 12;
      }
      ctx.cursor.y -= 4;
    }
    if (sheet.spells && sheet.spells.length > 0) {
      for (const sp of sheet.spells) {
        ensureSpace(ctx, 14);
        const lvlPart = typeof sp.level === "number" ? ` (lvl ${sp.level})` : "";
        ctx.page.drawText(`${sp.name}${lvlPart}`, { x: MARGIN, y: ctx.cursor.y, size: 9, font: bold, color: INK });
        ctx.cursor.y -= 12;
        if (sp.description) {
          const lines = wrapText(sp.description, font, 8, usable - 8);
          for (const line of lines) {
            ensureSpace(ctx, 11);
            ctx.page.drawText(line, { x: MARGIN + 8, y: ctx.cursor.y, size: 8, font, color: MUTED });
            ctx.cursor.y -= 11;
          }
          ctx.cursor.y -= 2;
        }
      }
    }
  }

  // Inventory
  if (sheet.inventory && sheet.inventory.length > 0) {
    sectionHeader(ctx, "Inventory");
    const text = sheet.inventory.join(" • ");
    const lines = wrapText(text, font, 9, usable);
    for (const line of lines) {
      ensureSpace(ctx, 12);
      ctx.page.drawText(line, { x: MARGIN, y: ctx.cursor.y, size: 9, font, color: INK });
      ctx.cursor.y -= 12;
    }
  }

  // Notes
  if (sheet.notes && sheet.notes.trim() !== "") {
    sectionHeader(ctx, "Notes");
    const lines = wrapText(sheet.notes, font, 9, usable);
    for (const line of lines) {
      ensureSpace(ctx, 12);
      ctx.page.drawText(line, { x: MARGIN, y: ctx.cursor.y, size: 9, font, color: INK });
      ctx.cursor.y -= 12;
    }
  }

  return await doc.save();
}

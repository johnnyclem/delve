// Parses a column-stitched Monster Manual text stream into a list of
// structured monster records. Each record contains the monster's name,
// size/type/alignment metadata, the standard stat-block fields, and any
// preceding lore paragraphs that describe the monster.
import type { ExtractResult } from "./extract";

const CREATURE_TYPES = [
  "aberration", "beast", "celestial", "construct", "dragon", "elemental",
  "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant",
  "undead", "swarm",
];
const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
const SIZE_TYPE_RE = new RegExp(
  `^\\s*(${SIZES.join("|")})\\s+(?:swarm of \\w+\\s+)?(${CREATURE_TYPES.join("|")})(?:s)?\\b`,
  "i",
);

export interface MonsterRecord {
  name: string;
  page: number;
  meta: string; // e.g. "Large aberration, lawful evil"
  stats: Record<string, string>; // AC, HP, Speed, Saving Throws, Skills, Senses, Languages, Challenge, ...
  abilityScores: Record<string, string>; // STR..CHA -> "23 (+6)"
  traits: string;
  actions: string;
  reactions: string;
  legendaryActions: string;
  lairActions: string;
  regionalEffects: string;
  lore: string;
  rawStatBlock: string;
}

interface AnchorLoc {
  pageIdx: number; // index into result.pages
  pageNum: number;
  lineIdx: number; // index in the page text's lines
}

function deHyphenate(text: string): string {
  // Join lines that end with a hyphenated word continuation.
  return text
    .replace(/(\w)-\n\s*(\w)/g, "$1$2")
    .replace(/\u00ad/g, "");
}

function tidy(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const STAT_FIELDS = [
  "Armor Class",
  "Hit Points",
  "Speed",
  "Saving Throws",
  "Skills",
  "Damage Vulnerabilities",
  "Damage Resistances",
  "Damage Immunities",
  "Condition Immunities",
  "Senses",
  "Languages",
  "Challenge",
];

const SECTION_HEADERS = [
  "ACTIONS",
  "REACTIONS",
  "LEGENDARY ACTIONS",
  "LAIR ACTIONS",
  "REGIONAL EFFECTS",
];

// Words that appear in section/sidebar headings but are not monster names.
const HEADING_BLOCKLIST = [
  "ACTIONS", "REACTIONS", "LAIR", "EFFECTS", "REGIONAL", "LEGENDARY",
  "DESCRIPTION", "SUMMONING", "VARIANT", "VARIANTS", "INTRODUCTION",
  "CONTENTS", "CREDITS", "APPENDIX", "INDEX", "RACES", "TRAITS",
  "TYPES", "STAT", "BLOCKS", "BLOCK", "RULES",
];

function looksLikeName(line: string): { name: string; allCaps: boolean } | null {
  const trimmed = line.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return null;
  // Strip trailing punctuation/numbers from index entries.
  if (/[.,:;]$/.test(trimmed)) return null;
  // Skip stat-block header words.
  if (/^(STR|DEX|CON|INT|WIS|CHA)\s/i.test(trimmed)) return null;
  // Skip pure-number lines or page numbers.
  if (/^\d+$/.test(trimmed)) return null;
  // Skip section headers.
  if (SECTION_HEADERS.includes(trimmed.toUpperCase())) return null;
  // Skip lines starting with sidebar markers.
  if (/^(A |AN |THE )/i.test(trimmed)) return null;
  // Reject lines that contain blocklisted words anywhere (likely a section).
  const upperWords = trimmed.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  if (upperWords.some((w) => HEADING_BLOCKLIST.includes(w))) return null;
  // Reject if the letters joined together spell a section header (handles
  // OCR letter-spacing artifacts like "ACT IONS" → "ACTIONS",
  // "REGIONA L EFFECTS" → "REGIONALEFFECTS").
  const joinedUpper = upperWords.join("");
  if (HEADING_BLOCKLIST.some((w) => joinedUpper === w || joinedUpper.startsWith(w))) return null;
  if (/^(ACTIONS|REACTIONS|LAIRACTIONS|LEGENDARYACTIONS|REGIONALEFFECTS|VARIANTS?)$/.test(joinedUpper)) return null;
  // Reject names that are mostly single-character "words" (OCR garbage like
  // "B E" or "B U LETIE" from letter-spaced display titles where the
  // extractor lost most of the word).
  const tokens = trimmed.split(/\s+/);
  const shortTokens = tokens.filter((t) => t.replace(/[^A-Za-z]/g, "").length <= 1).length;
  if (shortTokens >= 2 && shortTokens >= tokens.length / 2) return null;
  // Heuristics: mostly letters/spaces, mostly upper- or title-cased.
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return null;
  const upperLetters = trimmed.replace(/[^A-Z]/g, "").length;
  const lowerLetters = trimmed.replace(/[^a-z]/g, "").length;
  // Reject lines containing common sentence words mid-line.
  if (/\.\s+[a-z]/.test(trimmed)) return null;
  if (trimmed.split(/\s+/).length > 5) return null;
  // ALL CAPS heading (preferred — monster names appear this way at top of page).
  if (upperLetters >= 3 && lowerLetters <= 1) return { name: trimmed, allCaps: true };
  // Title case: first letter of each word uppercase, lowercase letters elsewhere.
  const words = trimmed.split(/\s+/);
  const titleCase = words.every((w) => /^[A-Z][A-Za-z'\-]*$/.test(w));
  if (titleCase && words.length <= 4) return { name: trimmed, allCaps: false };
  return null;
}

function filterLoreLines(
  loreLines: Array<{ line: string; idx: number }>,
  otherMetaLines: Set<number>,
): string[] {
  const out: string[] = [];
  // Track running "in stat block" state for other monsters whose stat blocks
  // appear inside this monster's lore region (interleaved page layout).
  let inOther = false;
  let otherEnd = -1;
  const STATBLOCK_RE = /^\s*(Armor Class|Hit Points|Speed|Saving Throws|Skills|Damage (Resistances|Immunities|Vulnerabilities)|Condition Immunities|Senses|Languages|Challenge|Proficiency Bonus)\s/i;
  const ABILITY_HEADER_RE = /^\s*STR\s+DEX\s+CON\s+INT\s+WIS\s+CHA\s*$/i;
  const ABILITY_VALUES_RE = /^\s*\d+\s*[({]\s*[+\-−–]?\s*\d+\s*[)}](\s+\d+\s*[({]\s*[+\-−–]?\s*\d+\s*[)}]){2,}/;
  const SECTION_RE = /^\s*(ACTIONS|REACTIONS|LEGENDARY ACTIONS|LAIR ACTIONS|REGIONAL EFFECTS)\s*$/i;
  for (const { line, idx } of loreLines) {
    if (otherMetaLines.has(idx)) {
      inOther = true;
      otherEnd = idx + 60; // skip ~60 lines as a heuristic stat-block span
      continue;
    }
    if (inOther) {
      if (idx >= otherEnd) inOther = false;
      else continue;
    }
    if (STATBLOCK_RE.test(line)) continue;
    if (ABILITY_HEADER_RE.test(line)) continue;
    if (ABILITY_VALUES_RE.test(line)) continue;
    if (SECTION_RE.test(line)) continue;
    out.push(line);
  }
  return out;
}

function normalizeName(raw: string): string {
  // Many headings come out with weird casing (e.g. "Kuo-ToA", "BE'HOLDERS").
  // Strip stray punctuation, normalize spaces, and apply a Title-Case fix
  // for ALL-CAPS headings.
  let s = raw.replace(/[^A-Za-z0-9'\-\s().,]/g, "").trim();
  s = s.replace(/\s+/g, " ");
  // Drop trailing parenthetical page hint if any.
  s = s.replace(/\s*\(.*\)\s*$/, "").trim();
  // Strip stray apostrophes that come from OCR artifacts (e.g. "BE'HOLDERS"
  // for "BEHOLDERS"). Real names with apostrophes (e.g. "Will-o'-Wisp") use
  // them between lowercase letters; ALL-CAPS apostrophes are noise.
  s = s.replace(/([A-Z])'([A-Z])/g, "$1$2");
  // Strip trailing single-letter token noise ("BEHOLDERS J" → "BEHOLDERS").
  s = s.replace(/\s+[A-Za-z]\b\.?$/g, "").trim();
  // Merge OCR letter-spaced leading single-letter tokens with the next word
  // ("B U LETTE" → "BULETTE", "F LUMPH" → "FLUMPH", "IC E MEPHIT" → "ICE MEPHIT").
  {
    const parts = s.split(" ");
    const prefix: string[] = [];
    let idx = 0;
    while (idx < parts.length - 1 && parts[idx].replace(/[^A-Za-z]/g, "").length <= 2) {
      prefix.push(parts[idx]);
      idx++;
    }
    if (prefix.length >= 1 && idx < parts.length) {
      const merged = prefix.join("") + parts[idx];
      s = [merged, ...parts.slice(idx + 1)].join(" ");
    }
  }
  // If mostly uppercase, recase to Title Case but preserve acronyms-ish.
  const upper = s.replace(/[^A-Z]/g, "").length;
  const lower = s.replace(/[^a-z]/g, "").length;
  if (upper >= lower * 2) {
    s = s
      .toLowerCase()
      .split(" ")
      .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
      .join(" ");
  }
  return s;
}

interface PageLine { pageNum: number; pageIdx: number; lineIdx: number; line: string; }

export interface ParseResult {
  monsters: MonsterRecord[];
  errors: Array<{ page: number; reason: string }>;
}

export function parseMonsterManual(extract: ExtractResult): ParseResult {
  // Flatten all pages into a list of lines with page metadata.
  const lines: PageLine[] = [];
  extract.pages.forEach((p, pageIdx) => {
    const pl = p.text.split("\n");
    pl.forEach((line, lineIdx) => lines.push({ pageNum: p.pageNum, pageIdx, lineIdx, line }));
  });

  // Find all stat-block anchors: "Armor Class" preceded within ~3 lines by
  // a size+type+alignment line.
  interface Anchor {
    nameLine: number; // best-guess name line index
    metaLine: number; // size-type-alignment line
    acLine: number; // Armor Class line
    pageNum: number;
  }
  const anchors: Anchor[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*Armor Class\s/.test(lines[i].line)) continue;
    // Walk back up to 6 lines to find size-type-alignment.
    let metaLine = -1;
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      if (lines[j].line.trim().length === 0) continue;
      if (SIZE_TYPE_RE.test(lines[j].line)) {
        metaLine = j;
        break;
      }
      // Don't look past another stat-block field.
      if (/^\s*(Hit Points|Speed|Saving Throws|Senses|Languages|Challenge)\s/.test(lines[j].line)) break;
    }
    if (metaLine === -1) continue;
    anchors.push({ nameLine: -1, metaLine, acLine: i, pageNum: lines[i].pageNum });
  }

  // Assign names: for each anchor, look for the best heading-like line on
  // the same page (or adjacent pages) that hasn't been claimed already.
  // Preference order:
  //   1. ALL-CAPS heading on the same page, closest to meta line (before or
  //      after — names sometimes appear in the right column above the lore,
  //      which our column-stitched output renders after the left-column stat
  //      block).
  //   2. Title-case heading on the same page, closest to meta line.
  //   3. ALL-CAPS heading on the previous page (above-stats names that bleed
  //      across page breaks).
  //   4. Title-case heading on the next page (rare).
  const claimed = new Set<number>();
  for (let a = 0; a < anchors.length; a++) {
    const anchor = anchors[a];
    const minLine = a === 0 ? 0 : anchors[a - 1].acLine + 1;
    const nextLimit = a + 1 < anchors.length ? anchors[a + 1].metaLine - 1 : lines.length - 1;
    const pageNum = anchor.pageNum;
    interface Candidate { line: number; allCaps: boolean; samePage: boolean; distance: number; }
    const candidates: Candidate[] = [];
    for (let j = minLine; j <= nextLimit; j++) {
      if (claimed.has(j)) continue;
      const lookup = looksLikeName(lines[j].line);
      if (!lookup) continue;
      const samePage = lines[j].pageNum === pageNum;
      const adjacent = Math.abs(lines[j].pageNum - pageNum) === 1;
      if (!samePage && !adjacent) continue;
      candidates.push({
        line: j,
        allCaps: lookup.allCaps,
        samePage,
        distance: Math.abs(j - anchor.metaLine),
      });
    }
    candidates.sort((a, b) => {
      // Prefer same-page over adjacent.
      if (a.samePage !== b.samePage) return a.samePage ? -1 : 1;
      // Prefer ALL-CAPS over title-case.
      if (a.allCaps !== b.allCaps) return a.allCaps ? -1 : 1;
      // Then closest distance to meta line.
      return a.distance - b.distance;
    });
    if (candidates.length > 0) {
      anchor.nameLine = candidates[0].line;
      claimed.add(candidates[0].line);
    }
  }

  // Build monster records.
  const monsters: MonsterRecord[] = [];
  const errors: Array<{ page: number; reason: string }> = [];
  for (let a = 0; a < anchors.length; a++) {
    const anchor = anchors[a];
    const next = a + 1 < anchors.length ? anchors[a + 1].metaLine : lines.length;
    // Lore region: everything from one page before this monster's page up to
    // the next monster's meta line, excluding stat-block-shaped lines and
    // lines belonging to other monsters' stat blocks. We attribute right-
    // column descriptive text on the same page to this monster.
    const loreFromPage = anchor.pageNum;
    const loreToPage = anchor.pageNum;
    const loreStart = a === 0 ? 0 : anchors[a - 1].acLine + 1;
    const loreEnd = next;
    const otherMetaLines = new Set(anchors.filter((_, idx) => idx !== a).map((x) => x.metaLine));
    const loreLines = lines.slice(loreStart, loreEnd)
      .filter((l) => l.pageNum >= loreFromPage && l.pageNum <= loreToPage)
      .map((l) => ({ line: l.line, idx: lines.indexOf(l) }));

    const blockLines = lines.slice(anchor.metaLine, next).map((l) => l.line);
    const rawStatBlock = blockLines.join("\n");
    const meta = lines[anchor.metaLine].line.trim();

    // Parse stat fields and ability score row.
    const stats: Record<string, string> = {};
    const abilityScores: Record<string, string> = {};
    let bodyStartIdx = 1; // after meta line
    let i = 1;
    let lastField: string | null = null;
    let pendingSpellSlots: string[] = [];
    while (i < blockLines.length) {
      const line = blockLines[i];
      if (line.trim().length === 0) { i++; continue; }
      // Ability score header row.
      if (/^\s*STR\s+DEX\s+CON\s+INT\s+WIS\s+CHA\s*$/i.test(line)) {
        // Find the next non-empty line(s) that contain the value rows. Some
        // monsters render an empty line between the header and the values.
        let j = i + 1;
        while (j < blockLines.length && blockLines[j].trim().length === 0) j++;
        const valuesParts: string[] = [];
        // Consume up to 2 consecutive non-empty lines containing patterns
        // like "12 (+1)" or "12 {+1}" (occasional OCR artifact).
        while (j < blockLines.length && /\d+\s*[({]\s*[+\-−–]?\s*\d+\s*[)}]/.test(blockLines[j])) {
          valuesParts.push(blockLines[j]);
          j++;
        }
        const valuesText = valuesParts.join(" ").trim();
        const re = /(\d+)\s*[({]\s*([+\-−–]?\s*\d+)\s*[)}]/g;
        const matches: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(valuesText)) && matches.length < 6) {
          matches.push(`${m[1]} (${m[2].replace(/\s+/g, "").replace(/[−–]/g, "-")})`);
        }
        const labels = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
        matches.forEach((v, k) => { abilityScores[labels[k]] = v; });
        i = matches.length > 0 ? j : i + 1;
        // Reset lastField so the values row (now skipped) cannot be merged
        // into a previous stat field.
        lastField = null;
        continue;
      }
      // Stat field?
      const field = STAT_FIELDS.find((f) => new RegExp(`^\\s*${f.replace(/\s/g, "\\s+")}\\b`, "i").test(line));
      if (field) {
        const value = line.replace(new RegExp(`^\\s*${field.replace(/\s/g, "\\s+")}\\s*`, "i"), "").trim();
        stats[field] = value;
        lastField = field;
        i++;
        continue;
      }
      // If we hit an action header, stop the stat-field section.
      if (/^\s*(ACTIONS|REACTIONS|LEGENDARY ACTIONS|LAIR ACTIONS|REGIONAL EFFECTS)\s*$/i.test(line)) {
        bodyStartIdx = i;
        break;
      }
      // Trait/feature line (italic-ish "Name. text") — start of body.
      if (/^\s*[A-Z][A-Za-z'’\- ]{2,40}\.\s+[A-Z]/.test(line)) {
        bodyStartIdx = i;
        break;
      }
      // Continuation of last stat field if we have one and line is not new field.
      if (lastField && !/^\s*$/.test(line)) {
        // Only treat as continuation when line begins with a number or
        // lowercase letter — uppercase starts indicate a new section.
        if (/^\s*[a-z0-9(]/.test(line)) {
          stats[lastField] += " " + line.trim();
          i++;
          continue;
        }
      }
      // Otherwise advance — likely body starts here.
      bodyStartIdx = i;
      break;
    }
    if (bodyStartIdx === 1) bodyStartIdx = i;

    // Split body into trait/action/etc sections.
    let traits = "";
    let actions = "";
    let reactions = "";
    let legendary = "";
    let lair = "";
    let regional = "";
    let current: "traits" | "actions" | "reactions" | "legendary" | "lair" | "regional" = "traits";
    for (let k = bodyStartIdx; k < blockLines.length; k++) {
      const line = blockLines[k];
      const head = line.trim().toUpperCase();
      if (head === "ACTIONS") { current = "actions"; continue; }
      if (head === "REACTIONS") { current = "reactions"; continue; }
      if (head === "LEGENDARY ACTIONS") { current = "legendary"; continue; }
      if (head === "LAIR ACTIONS") { current = "lair"; continue; }
      if (head === "REGIONAL EFFECTS") { current = "regional"; continue; }
      switch (current) {
        case "traits": traits += line + "\n"; break;
        case "actions": actions += line + "\n"; break;
        case "reactions": reactions += line + "\n"; break;
        case "legendary": legendary += line + "\n"; break;
        case "lair": lair += line + "\n"; break;
        case "regional": regional += line + "\n"; break;
      }
    }

    const nameRaw = anchor.nameLine !== -1 ? lines[anchor.nameLine].line : "";
    const name = nameRaw ? normalizeName(nameRaw) : "";
    if (!name) {
      errors.push({ page: anchor.pageNum, reason: `unnamed stat block at page ${anchor.pageNum}` });
      continue;
    }
    monsters.push({
      name,
      page: anchor.pageNum,
      meta,
      stats,
      abilityScores,
      traits: tidy(deHyphenate(traits)),
      actions: tidy(deHyphenate(actions)),
      reactions: tidy(deHyphenate(reactions)),
      legendaryActions: tidy(deHyphenate(legendary)),
      lairActions: tidy(deHyphenate(lair)),
      regionalEffects: tidy(deHyphenate(regional)),
      lore: tidy(deHyphenate(filterLoreLines(loreLines, otherMetaLines).join("\n"))),
      rawStatBlock,
    });
  }

  return { monsters, errors };
}

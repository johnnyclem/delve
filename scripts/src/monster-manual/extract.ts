// Extracts the Monster Manual PDF into a single column-aware text stream by
// invoking the system `pdftotext -layout` binary page-by-page and splitting
// each page into left/right columns when a consistent vertical whitespace
// gap is detected. Returns the stitched text along with per-page metadata.
import path from "node:path";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";

export interface ExtractedPage {
  pageNum: number;
  columns: 1 | 2;
  text: string;
}

export interface ExtractResult {
  pages: ExtractedPage[];
  fullText: string;
}

function runPdfToText(pdfPath: string, fromPage: number, toPage: number): string {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "mm-extract-"));
  const out = path.join(tmpDir, "out.txt");
  try {
    execFileSync(
      "pdftotext",
      ["-layout", "-f", String(fromPage), "-l", String(toPage), pdfPath, out],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    return readFileSync(out, "utf8");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function getPageCount(pdfPath: string): number {
  const out = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  const m = out.match(/^Pages:\s+(\d+)/m);
  if (!m) throw new Error("could not parse page count from pdfinfo");
  return Number.parseInt(m[1], 10);
}

// Splits a single page's lines into left/right columns when most non-empty
// lines contain a wide whitespace gap near the same column position.
//
// Strategy: build a histogram of column positions where lines have at least
// MIN_GAP consecutive spaces. The most-popular position (within a reasonable
// range) is the column boundary, but only if it accounts for >= 35% of the
// non-empty lines that have any qualifying gap. This avoids being fooled by
// the ability-score row's internal spacing.
function splitPageColumns(rawPageText: string): { columns: 1 | 2; text: string } {
  const lines = rawPageText.split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0).length;
  if (nonEmpty === 0) return { columns: 1, text: rawPageText };

  const MIN_GAP = 6;
  const MIN_LEFT = 35; // column must start at >= 35 (skip indents)
  const MAX_LEFT = 100;
  // Count, for each column position p, how many lines have a gap of >= MIN_GAP
  // spaces that *spans* p (i.e. p is inside the whitespace run, with text on
  // both left and right). This rewards real column boundaries and ignores
  // wide intra-stat-block gaps that have no text after them.
  const hist = new Array<number>(200).fill(0);
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const re = /\S\s{6,}\S/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const start = m.index + 1;
      const end = m.index + m[0].length - 1;
      if (start < MIN_LEFT || start > MAX_LEFT) {
        re.lastIndex = end;
        continue;
      }
      for (let p = start; p < end && p < hist.length; p++) hist[p] += 1;
      re.lastIndex = end;
    }
  }

  let bestPos = -1;
  let bestCount = 0;
  for (let p = MIN_LEFT; p < MAX_LEFT; p++) {
    if (hist[p] > bestCount) {
      bestCount = hist[p];
      bestPos = p;
    }
  }
  // A page is two-column if either >= 25% of non-empty lines support this
  // boundary OR at least 5 lines do (the latter handles pages where the
  // right column dominates and most "left" lines are empty).
  if (bestPos < 0 || (bestCount / nonEmpty < 0.25 && bestCount < 5)) {
    return { columns: 1, text: rawPageText };
  }
  const splitAt = bestPos;

  const left: string[] = [];
  const right: string[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) {
      left.push("");
      right.push("");
      continue;
    }
    if (line.length <= splitAt) {
      // Line is fully inside the left column.
      left.push(line.trimEnd());
      right.push("");
      continue;
    }
    // Confirm there is real whitespace spanning splitAt; otherwise the line
    // belongs to the left column only (e.g. a long ability-score row).
    let p = splitAt;
    if (line[p] !== " ") {
      // Walk left then right to find nearest whitespace; if the local
      // whitespace run does not actually cross splitAt with a wide gap,
      // do not split.
      left.push(line.trimEnd());
      right.push("");
      continue;
    }
    // Expand the whitespace run that contains splitAt.
    let runStart = p;
    while (runStart > 0 && line[runStart - 1] === " ") runStart -= 1;
    let runEnd = p;
    while (runEnd < line.length && line[runEnd] === " ") runEnd += 1;
    if (runEnd - runStart < 4) {
      left.push(line.trimEnd());
      right.push("");
      continue;
    }
    left.push(line.slice(0, runStart).trimEnd());
    right.push(line.slice(runEnd).trimEnd());
  }
  while (left.length && left[left.length - 1] === "") left.pop();
  while (right.length && right[right.length - 1] === "") right.pop();
  return {
    columns: 2,
    text: left.join("\n") + "\n" + right.join("\n"),
  };
}

const MAX_PAGES_PER_BATCH = 25;

export function extractMonsterManual(pdfPath: string, opts?: { fromPage?: number; toPage?: number }): ExtractResult {
  if (!existsSync(pdfPath)) {
    throw new Error(`PDF not found at ${pdfPath}`);
  }
  const total = getPageCount(pdfPath);
  const from = opts?.fromPage ?? 1;
  const to = Math.min(opts?.toPage ?? total, total);
  const pages: ExtractedPage[] = [];

  for (let start = from; start <= to; start += MAX_PAGES_PER_BATCH) {
    const end = Math.min(start + MAX_PAGES_PER_BATCH - 1, to);
    const blob = runPdfToText(pdfPath, start, end);
    // pdftotext separates pages with the form-feed character (\f).
    const rawPages = blob.split("\f");
    // Last entry is typically a trailing empty fragment; ignore extra.
    for (let i = 0; i < end - start + 1; i++) {
      const raw = rawPages[i] ?? "";
      const split = splitPageColumns(raw);
      pages.push({ pageNum: start + i, columns: split.columns, text: split.text });
    }
  }

  const fullText = pages.map((p) => `\n<<<PAGE ${p.pageNum}>>>\n${p.text}`).join("\n");
  return { pages, fullText };
}

// Quick CLI: `tsx scripts/src/monster-manual/extract.ts <pdf> [from] [to]`
if (import.meta.url === `file://${process.argv[1]}`) {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error("usage: extract.ts <pdf> [from] [to]");
    process.exit(1);
  }
  const from = process.argv[3] ? Number.parseInt(process.argv[3], 10) : undefined;
  const to = process.argv[4] ? Number.parseInt(process.argv[4], 10) : undefined;
  const res = extractMonsterManual(pdfPath, { fromPage: from, toPage: to });
  const outPath = path.join(os.tmpdir(), "mm-extracted.txt");
  writeFileSync(outPath, res.fullText, "utf8");
  console.error(`wrote ${res.pages.length} pages to ${outPath}`);
}

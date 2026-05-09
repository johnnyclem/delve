import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: { execute: vi.fn() },
}));

vi.mock("./entityEmbeddings", () => ({
  vectorToSqlLiteral: (v: number[]) => `[${v.join(",")}]`,
}));

import { db } from "@workspace/db";
import { buildKeywordQuery, retrieveHomebrew } from "./retrieval";

const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;

function collectStringParams(sqlObj: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === "string") {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node === "object") {
      for (const v of Object.values(node as Record<string, unknown>)) walk(v);
    }
  };
  walk(sqlObj);
  return out;
}

describe("buildKeywordQuery", () => {
  it("strips conversational filler from a long question while keeping content words", () => {
    const out = buildKeywordQuery(
      "How do critical hits work in this campaign according to our house rules?",
    );
    const tokens = out.split(" ");
    expect(tokens).toContain("critical");
    expect(tokens).toContain("hits");
    expect(tokens).toContain("campaign");
    expect(tokens).toContain("house");
    expect(tokens).toContain("rules");
    expect(tokens).not.toContain("how");
    expect(tokens).not.toContain("work");
    expect(tokens).not.toContain("this");
    expect(tokens).not.toContain("according");
    expect(tokens).not.toContain("our");
    expect(tokens).not.toContain("to");
  });

  it("preserves a short keyword query unchanged", () => {
    expect(buildKeywordQuery("fireball")).toBe("fireball");
  });

  it("falls back to the original query when every token is filler", () => {
    const raw = "How does it work?";
    expect(buildKeywordQuery(raw)).toBe(raw);
  });

  it("lowercases and drops sub-3-character tokens", () => {
    const out = buildKeywordQuery("PC HP regen");
    expect(out).toBe("regen");
  });
});

describe("retrieveHomebrew", () => {
  beforeEach(() => {
    executeMock.mockReset();
    executeMock.mockResolvedValue({ rows: [] });
  });

  it("passes a filtered keyword query for a long natural-language question", async () => {
    await retrieveHomebrew(
      "How do critical hits work in this campaign according to our house rules?",
      null,
      7,
    );

    // Two execute calls: the SET LOCAL and the main query.
    expect(executeMock).toHaveBeenCalledTimes(2);
    const mainSql = executeMock.mock.calls[1]?.[0];
    const params = collectStringParams(mainSql);

    const keywordParams = params.filter((p) => p.includes("critical"));
    expect(keywordParams.length).toBeGreaterThan(0);
    for (const p of keywordParams) {
      expect(p).toContain("critical");
      expect(p).toContain("hits");
      expect(p).toContain("house");
      expect(p).toContain("rules");
      expect(p).not.toMatch(/\bhow\b/);
      expect(p).not.toMatch(/\bwork\b/);
      expect(p).not.toMatch(/\baccording\b/);
    }
  });

  it("passes a short keyword query through unchanged", async () => {
    await retrieveHomebrew("fireball", null, 7);

    const mainSql = executeMock.mock.calls[1]?.[0];
    const params = collectStringParams(mainSql);
    const keywordParams = params.filter((p) => p === "fireball");
    expect(keywordParams.length).toBeGreaterThan(0);
  });

  it("short-circuits to an empty result for whitespace-only queries", async () => {
    const result = await retrieveHomebrew("   ", null, 7);
    expect(result).toEqual([]);
    expect(executeMock).not.toHaveBeenCalled();
  });
});

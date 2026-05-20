import { describe, it, expect, beforeEach, vi } from "vitest";

const selectQueue: unknown[] = [];

function chainable(resultPromise: () => Promise<unknown>) {
  const obj: Record<string, unknown> = {};
  const passthrough = () => obj;
  for (const key of [
    "from", "set", "values", "where", "orderBy", "innerJoin", "leftJoin",
  ]) {
    obj[key] = passthrough;
  }
  obj.limit = () => resultPromise();
  obj.returning = () => resultPromise();
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (r: unknown) => unknown,
  ) => resultPromise().then(resolve, reject);
  obj.catch = (reject: (r: unknown) => unknown) =>
    resultPromise().catch(reject);
  return obj;
}

const mockTx = { execute: vi.fn().mockResolvedValue(undefined) };

const mockDb = {
  select: () => chainable(() => Promise.resolve(selectQueue.shift() ?? [])),
  delete: () => chainable(() => Promise.resolve(undefined)),
  transaction: vi.fn(
    (cb: (tx: typeof mockTx) => Promise<void>) => cb(mockTx),
  ),
};

vi.mock("@workspace/db", () => ({
  db: mockDb,
  campaignEntityChunksTable: {
    entityId: "entity_id",
    sourceField: "source_field",
    contentHash: "content_hash",
    bodyMd: "body_md",
    embedding: "embedding",
  },
}));

vi.mock("drizzle-orm", () => {
  const sqlTag = (
    _strings: TemplateStringsArray,
    ...values: unknown[]
  ) => ({ values, _type: "sql" });
  (sqlTag as unknown as { raw: (s: string) => string }).raw = (
    s: string,
  ) => s;
  (sqlTag as unknown as { join: (...a: unknown[]) => unknown }).join = (
    ...args: unknown[]
  ) => ({ _type: "sql-join", args });
  return {
    sql: sqlTag,
    eq: () => ({ _type: "eq" }),
    and: (...args: unknown[]) => ({ _type: "and", args }),
    inArray: () => ({ _type: "inArray" }),
  };
});

const embedCreateMock = vi.fn();
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { embeddings: { create: embedCreateMock } },
}));

const {
  contentHash,
  chunkText,
  prepareChunks,
  vectorLiteral,
  syncEntityChunks,
  filterFreshChunks,
  backfillEntityChunks,
  embedQuery,
  EMBED_DIMS,
  MAX_CHUNK_CHARS,
  ENTITY_TEXT_FIELDS,
} = await import("./index");

beforeEach(() => {
  selectQueue.length = 0;
  embedCreateMock.mockReset();
  mockDb.transaction.mockClear();
  mockTx.execute.mockClear();
});

describe("contentHash", () => {
  it("returns a deterministic 32-char hex string", () => {
    const a = contentHash("hello world");
    const b = contentHash("hello world");
    expect(a).toHaveLength(32);
    expect(a).toBe(b);
    expect(/^[0-9a-f]{32}$/.test(a)).toBe(true);
  });

  it("returns different hashes for different inputs", () => {
    expect(contentHash("foo")).not.toBe(contentHash("bar"));
  });

  it("handles empty string", () => {
    const h = contentHash("");
    expect(h).toHaveLength(32);
  });
});

describe("chunkText", () => {
  it("returns empty array for empty/whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("  \n  ")).toEqual([]);
  });

  it("returns the whole text when shorter than MAX_CHUNK_CHARS", () => {
    const body = "Short text";
    expect(chunkText(body)).toEqual([body]);
  });

  it("splits on paragraph boundaries for long text", () => {
    const longPara = "A".repeat(MAX_CHUNK_CHARS);
    const body = `${longPara}\n\n${"B".repeat(200)}`;
    const chunks = chunkText(body);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(MAX_CHUNK_CHARS);
    expect(chunks[0]).toBe(longPara);
    expect(chunks[1]).toBe("B".repeat(200));
  });

  it("hard-splits a single paragraph that exceeds MAX_CHUNK_CHARS", () => {
    const body = "C".repeat(MAX_CHUNK_CHARS * 2 + 50);
    const chunks = chunkText(body);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS));
  });
});

describe("vectorLiteral", () => {
  it("formats a number array as a bracketed comma-separated string", () => {
    expect(vectorLiteral([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });

  it("handles empty array", () => {
    expect(vectorLiteral([])).toBe("[]");
  });
});

describe("prepareChunks", () => {
  it("returns prepared chunks with field, body, and hash", () => {
    const fields = [{ field: "public_md" as const, body: "Hello" }];
    const result = prepareChunks(fields);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe("public_md");
    expect(result[0].body).toBe("Hello");
    expect(result[0].hash).toBe(contentHash("Hello"));
  });

  it("skips null/undefined bodies", () => {
    const fields = [
      { field: "public_md" as const, body: "Hello" },
      { field: "secret_md" as const, body: null },
      { field: "dm_notes" as const, body: undefined },
    ];
    const result = prepareChunks(fields);
    expect(result).toHaveLength(1);
  });

  it("splits long bodies into multiple chunks", () => {
    const long = "A".repeat(MAX_CHUNK_CHARS + 100);
    const fields = [{ field: "dm_notes" as const, body: long }];
    const result = prepareChunks(fields);
    expect(result.length).toBeGreaterThanOrEqual(2);
    result.forEach((c) => {
      expect(c.field).toBe("dm_notes");
      expect(c.body.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
      expect(c.hash).toBe(contentHash(c.body));
    });
  });

  it("produces all three text fields", () => {
    const fields = ENTITY_TEXT_FIELDS.map((f) => ({ field: f, body: `content for ${f}` }));
    const result = prepareChunks(fields);
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.field).sort()).toEqual([
      "dm_notes",
      "public_md",
      "secret_md",
    ]);
  });
});

describe("filterFreshChunks", () => {
  it("returns all candidates when none exist in the DB", async () => {
    selectQueue.push([]);
    const candidates = [
      { field: "public_md" as const, body: "A", hash: "h1" },
      { field: "public_md" as const, body: "B", hash: "h2" },
    ];
    const fresh = await filterFreshChunks(1, candidates);
    expect(fresh).toHaveLength(2);
  });

  it("filters out candidates that already exist", async () => {
    selectQueue.push([
      { field: "public_md", hash: "h1" },
    ]);
    const candidates = [
      { field: "public_md" as const, body: "A", hash: "h1" },
      { field: "public_md" as const, body: "B", hash: "h2" },
    ];
    const fresh = await filterFreshChunks(1, candidates);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].hash).toBe("h2");
  });

  it("returns empty when all candidates already exist", async () => {
    selectQueue.push([
      { field: "public_md", hash: "h1" },
      { field: "public_md", hash: "h2" },
    ]);
    const candidates = [
      { field: "public_md" as const, body: "A", hash: "h1" },
      { field: "public_md" as const, body: "B", hash: "h2" },
    ];
    const fresh = await filterFreshChunks(1, candidates);
    expect(fresh).toHaveLength(0);
  });

  it("returns empty for empty candidates", async () => {
    const fresh = await filterFreshChunks(1, []);
    expect(fresh).toHaveLength(0);
  });
});

describe("syncEntityChunks", () => {
  it("happy path: chunks, embeds, and inserts new content", async () => {
    selectQueue.push([]);
    embedCreateMock.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });

    await syncEntityChunks(1, 2, [
      { field: "public_md", body: "Hello world" },
    ]);

    expect(embedCreateMock).toHaveBeenCalledTimes(1);
    expect(embedCreateMock).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: ["Hello world"],
      dimensions: EMBED_DIMS,
    });

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.execute).toHaveBeenCalledTimes(1);
    const sqlCall = mockTx.execute.mock.calls[0][0];
    expect(sqlCall._type).toBe("sql");
    expect(sqlCall.values[0]).toBe(1);
    expect(sqlCall.values[1]).toBe(2);
    expect(sqlCall.values[2]).toBe("public_md");
    expect(sqlCall.values[3]).toBe("Hello world");
  });

  it("inserts multiple chunks for multiple fields", async () => {
    selectQueue.push([]);
    embedCreateMock.mockResolvedValue({
      data: [
        { embedding: [0.1, 0.2, 0.3] },
        { embedding: [0.4, 0.5, 0.6] },
      ],
    });

    await syncEntityChunks(1, 2, [
      { field: "public_md", body: "Public" },
      { field: "secret_md", body: "Secret" },
    ]);

    expect(embedCreateMock).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: ["Public", "Secret"],
      dimensions: EMBED_DIMS,
    });
    expect(mockTx.execute).toHaveBeenCalledTimes(2);
  });

  it("skips chunks that already exist in the DB", async () => {
    selectQueue.push([
      { field: "public_md", hash: contentHash("Hello world") },
    ]);

    await syncEntityChunks(1, 2, [
      { field: "public_md", body: "Hello world" },
    ]);

    expect(embedCreateMock).not.toHaveBeenCalled();
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("does nothing when all fields are null/undefined", async () => {
    await syncEntityChunks(1, 2, [
      { field: "public_md", body: null },
      { field: "secret_md", body: undefined },
    ]);

    expect(embedCreateMock).not.toHaveBeenCalled();
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("calls onFailure when embedding fails", async () => {
    selectQueue.push([]);
    embedCreateMock.mockRejectedValue(new Error("OpenAI API error"));

    const onFailure = vi.fn();

    await syncEntityChunks(1, 2, [
      { field: "public_md", body: "Hello world" },
    ], { onFailure });

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ message: "OpenAI API error" }),
      1,
      2,
    );
  });

  it("does not throw when embedding fails and no onFailure is provided", async () => {
    selectQueue.push([]);
    embedCreateMock.mockRejectedValue(new Error("Transient error"));

    await expect(
      syncEntityChunks(1, 2, [{ field: "public_md", body: "Hello" }]),
    ).resolves.toBeUndefined();
  });

  it("deletes stale chunks for fields with changed content", async () => {
    selectQueue.push([]);
    embedCreateMock.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });

    const originalBody = "Original text";
    const newBody = "Updated text";
    expect(contentHash(originalBody)).not.toBe(contentHash(newBody));

    await syncEntityChunks(1, 2, [
      { field: "public_md", body: newBody },
    ]);

    expect(mockTx.execute).toHaveBeenCalledTimes(1);
    expect(embedCreateMock).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: [newBody],
      dimensions: EMBED_DIMS,
    });
  });

  it("uses custom logger when provided", async () => {
    selectQueue.push([]);
    embedCreateMock.mockRejectedValue(new Error("fail"));

    const logger = { error: vi.fn() };
    const onFailure = vi.fn();

    await syncEntityChunks(1, 2, [
      { field: "public_md", body: "test" },
    ], { logger, onFailure });

    expect(logger.error).toHaveBeenCalled();
    expect(logger.error.mock.calls[0][0]).toMatchObject({
      err: expect.objectContaining({ message: "fail" }),
      entityId: 1,
      campaignId: 2,
    });
  });
});

describe("backfillEntityChunks", () => {
  it("inserts fresh chunks and returns counts", async () => {
    selectQueue.push([]);
    embedCreateMock.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });

    const result = await backfillEntityChunks(1, 2, [
      { field: "public_md", body: "Backfill content" },
    ]);

    expect(result).toEqual({ inserted: 1, skipped: 0 });
    expect(mockTx.execute).toHaveBeenCalledTimes(1);
  });

  it("skips already-existing chunks", async () => {
    selectQueue.push([
      { field: "public_md", hash: contentHash("Existing content") },
    ]);

    const result = await backfillEntityChunks(1, 2, [
      { field: "public_md", body: "Existing content" },
    ]);

    expect(result).toEqual({ inserted: 0, skipped: 1 });
    expect(embedCreateMock).not.toHaveBeenCalled();
  });

  it("returns zero counts for empty fields", async () => {
    const result = await backfillEntityChunks(1, 2, []);
    expect(result).toEqual({ inserted: 0, skipped: 0 });
  });

  it("propagates errors (unlike syncEntityChunks)", async () => {
    selectQueue.push([]);
    embedCreateMock.mockRejectedValue(new Error("API down"));

    await expect(
      backfillEntityChunks(1, 2, [
        { field: "public_md", body: "fail" },
      ]),
    ).rejects.toThrow("API down");
  });
});

describe("embedQuery", () => {
  it("returns an embedding vector on success", async () => {
    embedCreateMock.mockResolvedValue({
      data: [{ embedding: [0.5, 0.6, 0.7] }],
    });

    const vec = await embedQuery("test query");
    expect(vec).toEqual([0.5, 0.6, 0.7]);
    expect(embedCreateMock).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: ["test query"],
      dimensions: EMBED_DIMS,
    });
  });

  it("returns null on failure and does not throw", async () => {
    embedCreateMock.mockRejectedValue(new Error("API error"));

    const vec = await embedQuery("fail query");
    expect(vec).toBeNull();
  });

  it("accepts custom logger", async () => {
    embedCreateMock.mockRejectedValue(new Error("fail"));
    const logger = { error: vi.fn() };

    const vec = await embedQuery("test", { logger });
    expect(vec).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});

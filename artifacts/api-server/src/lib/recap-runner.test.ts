import { describe, it, expect, beforeEach, vi } from "vitest";

const TEST_CAMPAIGN = 1;

const updates: Array<Record<string, unknown>> = [];
const selectResults: unknown[] = [];

function chainable(resolve: () => Promise<unknown>) {
  const obj: Record<string, unknown> = {};
  const passthrough = () => obj;
  for (const k of ["from", "where", "set", "values", "orderBy", "innerJoin", "leftJoin"]) {
    obj[k] = passthrough;
  }
  obj.limit = () => resolve();
  obj.returning = () => resolve();
  obj.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => resolve().then(r, j);
  obj.catch = (j: (e: unknown) => unknown) => resolve().catch(j);
  return obj;
}

const mockDb = {
  select: () => chainable(() => Promise.resolve(selectResults.shift() ?? [])),
  update: () => {
    const captured: Record<string, unknown> = {};
    const obj: Record<string, unknown> = {};
    const passthrough = () => obj;
    obj.set = (v: Record<string, unknown>) => {
      Object.assign(captured, v);
      updates.push(captured);
      return obj;
    };
    obj.where = passthrough;
    obj.returning = () => Promise.resolve([{ id: 1, ...captured }]);
    obj.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(r, j);
    obj.catch = (j: (e: unknown) => unknown) => Promise.resolve([]).catch(j);
    return obj;
  },
  insert: () => chainable(() => Promise.resolve([])),
  delete: () => chainable(() => Promise.resolve([])),
};

vi.mock("@workspace/db", () => ({
  db: mockDb,
  sessionLogsTable: { id: "id", campaignId: "campaignId" },
  recapViewsTable: { sessionLogId: "sessionLogId" },
  charactersTable: { id: "id", campaignId: "campaignId", name: "name" },
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({ _: "eq" }),
  and: () => ({ _: "and" }),
  inArray: () => ({ _: "inArray" }),
}));

const openaiCreate = vi.fn();
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: (...args: unknown[]) => openaiCreate(...args) } } },
}));

// Speed up the debounce for tests.
process.env.RECAP_DEBOUNCE_MS = "20";

const {
  hashNotes,
  shouldScheduleRecap,
  runRecapNow,
  scheduleRecap,
  isRecapPending,
  isRecapRunning,
  __resetRecapRunnerForTests,
} = await import("./recap-runner");

beforeEach(() => {
  updates.length = 0;
  selectResults.length = 0;
  openaiCreate.mockReset();
  __resetRecapRunnerForTests();
});

describe("hashNotes / shouldScheduleRecap", () => {
  it("hashes notes deterministically and ignores empty/whitespace", () => {
    expect(hashNotes("hello")).toBe(hashNotes("hello"));
    expect(hashNotes("hello")).not.toBe(hashNotes("hello there"));
    expect(hashNotes("")).toBeNull();
    expect(hashNotes("   ")).toBeNull();
    expect(hashNotes(null)).toBeNull();
  });

  it("only schedules when notes are non-empty AND differ from the last recap hash", () => {
    expect(shouldScheduleRecap("notes", null)).toBe(true);
    const h = hashNotes("notes")!;
    expect(shouldScheduleRecap("notes", h)).toBe(false);
    expect(shouldScheduleRecap("", null)).toBe(false);
    expect(shouldScheduleRecap("   ", null)).toBe(false);
    expect(shouldScheduleRecap("changed", h)).toBe(true);
  });
});

describe("runRecapNow", () => {
  it("runs the LLM, persists recap + idle status + notes hash, and clears views", async () => {
    selectResults.push([
      {
        id: 1,
        sessionNumber: 1,
        title: "T",
        rawNotesMd: "the party fought a goblin",
        attendees: null,
      },
    ]);
    selectResults.push([]); // characters lookup (no attendees)
    openaiCreate.mockResolvedValue({ choices: [{ message: { content: "## Narrative\nfoo" } }] });

    const recap = await runRecapNow(1, TEST_CAMPAIGN);
    expect(recap).toContain("Narrative");
    expect(openaiCreate).toHaveBeenCalledTimes(1);

    // Two updates: status='running' first, then full success update.
    const statuses = updates.map((u) => u.recapStatus);
    expect(statuses).toEqual(["running", "idle"]);
    const finalUpdate = updates[updates.length - 1];
    expect(finalUpdate.recapMd).toBe("## Narrative\nfoo");
    expect(finalUpdate.recapNotesHash).toBe(hashNotes("the party fought a goblin"));
    expect(finalUpdate.recapError).toBeNull();
    expect(finalUpdate.notifiedAt).toBeNull();
  });

  it("records error status when the LLM throws", async () => {
    selectResults.push([{ id: 1, sessionNumber: 1, title: "T", rawNotesMd: "x", attendees: null }]);
    openaiCreate.mockRejectedValue(new Error("rate limited"));

    await expect(runRecapNow(1, TEST_CAMPAIGN)).rejects.toThrow(/rate limited/);
    const errorUpdate = updates.find((u) => u.recapStatus === "error");
    expect(errorUpdate).toBeDefined();
    expect(errorUpdate!.recapError).toBe("rate limited");
  });

  it("rejects with 'No raw notes' when notes are empty (and does not call the LLM)", async () => {
    selectResults.push([{ id: 1, sessionNumber: 1, title: "T", rawNotesMd: "", attendees: null }]);
    await expect(runRecapNow(1, TEST_CAMPAIGN)).rejects.toThrow(/No raw notes/);
    expect(openaiCreate).not.toHaveBeenCalled();
  });
});

describe("scheduleRecap (debounce + dedup)", () => {
  it("fires the LLM once after the debounce window when called repeatedly", async () => {
    // Three select calls: one per actual run that fires.
    selectResults.push([{ id: 1, sessionNumber: 1, title: "T", rawNotesMd: "notes", attendees: null }]);
    openaiCreate.mockResolvedValue({ choices: [{ message: { content: "ok" } }] });

    scheduleRecap(1, TEST_CAMPAIGN);
    scheduleRecap(1, TEST_CAMPAIGN);
    scheduleRecap(1, TEST_CAMPAIGN);
    expect(isRecapPending(1)).toBe(true);

    await new Promise((r) => setTimeout(r, 80));

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    expect(isRecapPending(1)).toBe(false);
    expect(isRecapRunning(1)).toBe(false);
  });

  it("queues a follow-up run when scheduleRecap is called while one is in flight", async () => {
    // First run.
    selectResults.push([{ id: 1, sessionNumber: 1, title: "T", rawNotesMd: "n1", attendees: null }]);
    // Follow-up run.
    selectResults.push([{ id: 1, sessionNumber: 1, title: "T", rawNotesMd: "n2", attendees: null }]);

    let resolveFirst!: () => void;
    openaiCreate
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = () => resolve({ choices: [{ message: { content: "first" } }] });
          }),
      )
      .mockResolvedValueOnce({ choices: [{ message: { content: "second" } }] });

    const firstPromise = runRecapNow(1, TEST_CAMPAIGN);
    // Let the async chain progress past the DB lookup + status update so that
    // openaiCreate has been called (and resolveFirst is wired up).
    await new Promise((r) => setTimeout(r, 10));
    // While first is in flight, schedule another — a debounced timer should
    // be set, but no parallel LLM call yet.
    scheduleRecap(1, TEST_CAMPAIGN);
    expect(isRecapRunning(1)).toBe(true);
    expect(isRecapPending(1)).toBe(true);
    expect(openaiCreate).toHaveBeenCalledTimes(1);

    resolveFirst();
    await firstPromise;

    // The debounce timer fires and the queued run starts after the first one.
    await new Promise((r) => setTimeout(r, 80));
    expect(openaiCreate).toHaveBeenCalledTimes(2);
  });

  it("serializes concurrent runRecapNow calls (no parallel LLM calls)", async () => {
    selectResults.push([{ id: 1, sessionNumber: 1, title: "T", rawNotesMd: "n1", attendees: null }]);
    selectResults.push([{ id: 1, sessionNumber: 1, title: "T", rawNotesMd: "n2", attendees: null }]);
    selectResults.push([{ id: 1, sessionNumber: 1, title: "T", rawNotesMd: "n3", attendees: null }]);

    let resolveFirst!: () => void;
    openaiCreate
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = () => resolve({ choices: [{ message: { content: "first" } }] });
          }),
      )
      .mockResolvedValueOnce({ choices: [{ message: { content: "second" } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: "third" } }] });

    const p1 = runRecapNow(1, TEST_CAMPAIGN);
    await new Promise((r) => setTimeout(r, 10));
    const p2 = runRecapNow(1, TEST_CAMPAIGN);
    const p3 = runRecapNow(1, TEST_CAMPAIGN);

    // Only the first call should have hit the LLM so far.
    expect(openaiCreate).toHaveBeenCalledTimes(1);

    resolveFirst();
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toBe("first");
    expect(r2).toBe("second");
    expect(r3).toBe("third");
    expect(openaiCreate).toHaveBeenCalledTimes(3);
  });
});

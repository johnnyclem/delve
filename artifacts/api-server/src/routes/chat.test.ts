import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import request from "supertest";

const TEST_USER_ID = "user_test_player";
const OTHER_USER_ID = "user_test_other";
const TEST_CAMPAIGN_ID = 1;

let currentUserId = TEST_USER_ID;
let currentIsDm = false;

type Result = unknown;

const selectQueue: Result[] = [];
const insertQueue: Result[] = [];
const updateQueue: Result[] = [];
const deleteQueue: Result[] = [];

const eqCalls: Array<[unknown, unknown]> = [];
let updateCallCount = 0;
let deleteCallCount = 0;

function chainable(resultPromise: () => Promise<Result>) {
  const obj: Record<string, unknown> = {};
  const passthrough = () => obj;
  for (const key of ["from", "set", "values", "where", "orderBy", "innerJoin", "leftJoin"]) {
    obj[key] = passthrough;
  }
  obj.limit = () => resultPromise();
  obj.returning = () => resultPromise();
  obj.onConflictDoUpdate = () => resultPromise();
  obj.onConflictDoNothing = () => resultPromise();
  obj.then = (
    resolve: (value: Result) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => resultPromise().then(resolve, reject);
  obj.catch = (reject: (reason: unknown) => unknown) =>
    resultPromise().catch(reject);
  return obj;
}

const mockDb = {
  select: () => chainable(() => Promise.resolve(selectQueue.shift() ?? [])),
  update: () => {
    updateCallCount += 1;
    return chainable(() => Promise.resolve(updateQueue.shift() ?? []));
  },
  insert: () => chainable(() => Promise.resolve(insertQueue.shift() ?? [])),
  delete: () => {
    deleteCallCount += 1;
    return chainable(() => Promise.resolve(deleteQueue.shift() ?? []));
  },
};

vi.mock("@workspace/db", () => ({
  db: mockDb,
  chatThreadsTable: {
    id: "threads.id",
    campaignId: "threads.campaignId",
    userId: "threads.userId",
    title: "threads.title",
    summary: "threads.summary",
    createdAt: "threads.createdAt",
    updatedAt: "threads.updatedAt",
  },
  chatMessagesTable: {
    id: "messages.id",
    threadId: "messages.threadId",
    role: "messages.role",
    content: "messages.content",
    createdAt: "messages.createdAt",
  },
  campaignsTable: { id: "campaigns.id", defaultEdition: "campaigns.defaultEdition" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => {
    eqCalls.push([col, val]);
    return { _: "eq", col, val };
  },
  and: (..._args: unknown[]) => ({ _: "and" }),
  asc: (..._args: unknown[]) => ({ _: "asc" }),
  desc: (..._args: unknown[]) => ({ _: "desc" }),
}));

vi.mock("../lib/campaign", () => ({
  getOrCreateCampaign: async () => TEST_CAMPAIGN_ID,
  isDm: async () => currentIsDm,
}));

vi.mock("../lib/entityEmbeddings", () => ({
  embedQuery: async () => null,
}));

vi.mock("../lib/retrieval", () => ({
  retrieveReference: async () => [],
  retrieveCampaign: async () => [],
  retrieveHomebrew: async () => [],
}));

vi.mock("../lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

const openaiCreate = vi.fn();
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: {
      completions: {
        create: (...args: unknown[]) => openaiCreate(...args),
      },
    },
  },
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { userId: string }).userId = currentUserId;
    next();
  },
  requireCampaignMember: (_req: Request, _res: Response, next: NextFunction) => next(),
  getUserId: (req: Request) => (req as Request & { userId: string }).userId,
}));

const chatRouter = (await import("./chat")).default;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(chatRouter);
  return app;
}

beforeEach(() => {
  selectQueue.length = 0;
  insertQueue.length = 0;
  updateQueue.length = 0;
  deleteQueue.length = 0;
  eqCalls.length = 0;
  updateCallCount = 0;
  deleteCallCount = 0;
  currentUserId = TEST_USER_ID;
  currentIsDm = false;
  openaiCreate.mockReset();
  openaiCreate.mockResolvedValue({
    choices: [{ message: { content: "Mock answer" } }],
  });
});

describe("POST /chat thread lifecycle", () => {
  it("creates a new thread on the first call and returns its id", async () => {
    // campaign edition lookup
    selectQueue.push([{ defaultEdition: "2024" }]);
    // insert thread .returning() -> created row
    insertQueue.push([{ id: 100, summary: null }]);
    // priorMessages lookup -> empty
    selectQueue.push([]);

    const res = await request(buildApp())
      .post("/chat")
      .send({ message: "What is initiative?" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      answer: "Mock answer",
      conversationId: 100,
      edition: "2024",
      citations: [],
    });
    // Only the main completion call, no summarization yet.
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    // updatedAt update on the thread should have been issued.
    expect(updateCallCount).toBe(1);
  });

  it("reuses the existing thread when a valid conversationId is sent back", async () => {
    selectQueue.push([{ defaultEdition: "2024" }]);
    // existing thread lookup -> found
    selectQueue.push([
      {
        id: 100,
        summary: null,
        campaignId: TEST_CAMPAIGN_ID,
        userId: TEST_USER_ID,
        title: "Earlier topic",
      },
    ]);
    // priorMessages
    selectQueue.push([
      { role: "user", content: "first" },
      { role: "assistant", content: "first reply" },
    ]);

    const res = await request(buildApp())
      .post("/chat")
      .send({ message: "follow-up", conversationId: 100 });

    expect(res.status).toBe(200);
    expect(res.body.conversationId).toBe(100);
    // Should NOT have inserted a new thread row.
    expect(insertQueue).toHaveLength(0);
    // The existing-thread lookup must have been scoped by id, campaignId, AND userId.
    const eqVals = eqCalls.map(([, val]) => val);
    expect(eqVals).toContain(100);
    expect(eqVals).toContain(TEST_CAMPAIGN_ID);
    expect(eqVals).toContain(TEST_USER_ID);
  });

  it("returns 404 when the conversationId does not belong to the user", async () => {
    selectQueue.push([{ defaultEdition: "2024" }]);
    // existing thread lookup -> empty (foreign or unknown)
    selectQueue.push([]);

    const res = await request(buildApp())
      .post("/chat")
      .send({ message: "sneaky", conversationId: 9999 });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Conversation not found" });
    // Must not call the LLM or persist anything.
    expect(openaiCreate).not.toHaveBeenCalled();
    expect(updateCallCount).toBe(0);
  });

  it("rejects an empty message body with 400 before touching the DB", async () => {
    const res = await request(buildApp()).post("/chat").send({ message: "" });
    expect(res.status).toBe(400);
    expect(openaiCreate).not.toHaveBeenCalled();
  });
});

describe("GET /chat/threads (list)", () => {
  it("returns the threads the DB hands back, scoped by current user", async () => {
    const now = new Date().toISOString();
    selectQueue.push([
      { id: 11, title: "First", createdAt: now, updatedAt: now },
      { id: 12, title: "Second", createdAt: now, updatedAt: now },
    ]);

    const res = await request(buildApp()).get("/chat/threads");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // The list must be filtered by the current user's id and campaign.
    const eqVals = eqCalls.map(([, val]) => val);
    expect(eqVals).toContain(TEST_USER_ID);
    expect(eqVals).toContain(TEST_CAMPAIGN_ID);
  });

  it("uses the OTHER user's id when the request is authenticated as them", async () => {
    currentUserId = OTHER_USER_ID;
    selectQueue.push([]);

    const res = await request(buildApp()).get("/chat/threads");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    const eqVals = eqCalls.map(([, val]) => val);
    expect(eqVals).toContain(OTHER_USER_ID);
    expect(eqVals).not.toContain(TEST_USER_ID);
  });
});

describe("GET /chat/threads/:id (detail)", () => {
  it("returns the thread and its messages when it belongs to the user", async () => {
    const now = new Date().toISOString();
    selectQueue.push([
      { id: 5, title: "Mine", createdAt: now, updatedAt: now, summary: null },
    ]);
    selectQueue.push([
      { id: 1, role: "user", content: "hi", createdAt: now },
      { id: 2, role: "assistant", content: "hello", createdAt: now },
    ]);

    const res = await request(buildApp()).get("/chat/threads/5");

    expect(res.status).toBe(200);
    expect(res.body.thread).toMatchObject({ id: 5, title: "Mine" });
    expect(res.body.messages).toHaveLength(2);
    const eqVals = eqCalls.map(([, val]) => val);
    expect(eqVals).toContain(TEST_USER_ID);
    expect(eqVals).toContain(TEST_CAMPAIGN_ID);
    expect(eqVals).toContain(5);
  });

  it("returns 404 when the thread does not exist for this user (foreign or deleted)", async () => {
    selectQueue.push([]); // thread lookup -> empty

    const res = await request(buildApp()).get("/chat/threads/9999");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Thread not found" });
  });

  it("returns 404 for a non-numeric id without hitting the DB", async () => {
    const res = await request(buildApp()).get("/chat/threads/not-a-number");
    expect(res.status).toBe(404);
    expect(selectQueue).toHaveLength(0);
    expect(eqCalls).toHaveLength(0);
  });
});

describe("DELETE /chat/threads/:id", () => {
  it("deletes the thread when it belongs to the user", async () => {
    deleteQueue.push([{ id: 7 }]);

    const res = await request(buildApp()).delete("/chat/threads/7");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(deleteCallCount).toBe(1);
    const eqVals = eqCalls.map(([, val]) => val);
    expect(eqVals).toContain(TEST_USER_ID);
    expect(eqVals).toContain(TEST_CAMPAIGN_ID);
    expect(eqVals).toContain(7);
  });

  it("returns 404 when no row matched (foreign or unknown thread)", async () => {
    deleteQueue.push([]); // nothing deleted

    const res = await request(buildApp()).delete("/chat/threads/9999");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Thread not found" });
  });

  it("scopes the delete to the requesting user (other user can't reach this thread)", async () => {
    currentUserId = OTHER_USER_ID;
    deleteQueue.push([]); // simulates the where clause filtering it out

    const res = await request(buildApp()).delete("/chat/threads/7");

    expect(res.status).toBe(404);
    const eqVals = eqCalls.map(([, val]) => val);
    expect(eqVals).toContain(OTHER_USER_ID);
    expect(eqVals).not.toContain(TEST_USER_ID);
  });
});

describe("POST /chat history summarization", () => {
  it("summarizes older turns into thread.summary once history exceeds the verbatim window", async () => {
    // HISTORY_VERBATIM_TURNS = 6, SUMMARIZE_AFTER_TURNS = 10. With 10 prior
    // messages, totalAfter = 12 >= 10 so summarization should run, folding
    // the oldest 4 messages (10 - 6) into the running summary.
    const prior = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn-${i}`,
    }));

    selectQueue.push([{ defaultEdition: "2024" }]);
    selectQueue.push([
      {
        id: 100,
        summary: null,
        campaignId: TEST_CAMPAIGN_ID,
        userId: TEST_USER_ID,
        title: "Long thread",
      },
    ]);
    selectQueue.push(prior);

    openaiCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: "Main answer" } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: "Compressed summary" } }] });

    const res = await request(buildApp())
      .post("/chat")
      .send({ message: "next question", conversationId: 100 });

    expect(res.status).toBe(200);
    expect(openaiCreate).toHaveBeenCalledTimes(2);

    const summarizeCall = openaiCreate.mock.calls[1][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(summarizeCall.messages[0].content).toMatch(/compress chat history/i);
    expect(summarizeCall.messages[1].content).toContain("turn-0");
    expect(summarizeCall.messages[1].content).toContain("turn-3");
    // The newest 6 turns stay verbatim and must NOT be folded into the summary.
    expect(summarizeCall.messages[1].content).not.toContain("turn-9");

    // Two updates should have been issued: updatedAt + summary.
    expect(updateCallCount).toBe(2);
  });

  it("does not summarize when history is still within the verbatim window", async () => {
    // 6 prior messages -> totalAfter = 8, below the SUMMARIZE_AFTER_TURNS
    // threshold of 10, so only the main completion runs.
    const prior = Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn-${i}`,
    }));

    selectQueue.push([{ defaultEdition: "2024" }]);
    selectQueue.push([
      {
        id: 100,
        summary: null,
        campaignId: TEST_CAMPAIGN_ID,
        userId: TEST_USER_ID,
        title: "Short thread",
      },
    ]);
    selectQueue.push(prior);

    const res = await request(buildApp())
      .post("/chat")
      .send({ message: "next", conversationId: 100 });

    expect(res.status).toBe(200);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
    // Only the updatedAt bump.
    expect(updateCallCount).toBe(1);
  });
});

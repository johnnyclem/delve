import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const TEST_USER_ID = "user_test_dm";
const TEST_CAMPAIGN_ID = 1;
const TEST_SESSION_ID = 42;

type Result = unknown;

const selectQueue: Result[] = [];
const updateQueue: Result[] = [];

function chainable(resultPromise: () => Promise<Result>) {
  const obj: Record<string, unknown> = {};
  const passthrough = () => obj;
  for (const key of [
    "from",
    "set",
    "values",
    "where",
    "orderBy",
    "innerJoin",
    "leftJoin",
  ]) {
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
  select: () => {
    const next = selectQueue.shift();
    return chainable(() => Promise.resolve(next ?? []));
  },
  update: () => {
    const next = updateQueue.shift();
    return chainable(() => Promise.resolve(next ?? []));
  },
  insert: () => chainable(() => Promise.resolve([])),
  delete: () => chainable(() => Promise.resolve([])),
};

vi.mock("@workspace/db", () => ({
  db: mockDb,
  sessionLogsTable: { id: "id", campaignId: "campaignId", version: "version" },
  campaignMembersTable: {
    id: "id",
    campaignId: "campaignId",
    userId: "userId",
  },
  campaignsTable: { id: "id" },
  recapViewsTable: { sessionLogId: "sessionLogId", userId: "userId" },
  charactersTable: { id: "id", campaignId: "campaignId", name: "name" },
  npcsTable: { id: "id", campaignId: "campaignId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (..._args: unknown[]) => ({ _: "eq" }),
  and: (..._args: unknown[]) => ({ _: "and" }),
  desc: (..._args: unknown[]) => ({ _: "desc" }),
  isNotNull: (..._args: unknown[]) => ({ _: "isNotNull" }),
  inArray: (..._args: unknown[]) => ({ _: "inArray" }),
  sql: Object.assign(
    (..._args: unknown[]) => ({ _: "sql" }),
    { raw: (..._args: unknown[]) => ({ _: "sql.raw" }) },
  ),
}));

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: TEST_USER_ID, sessionClaims: {} }),
  clerkMiddleware:
    () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const sessionsRouter = (await import("./sessions")).default;

const dmMember = {
  id: 1,
  campaignId: TEST_CAMPAIGN_ID,
  userId: TEST_USER_ID,
  role: "dm",
  displayName: "Tester",
  avatarUrl: null,
};

const campaignRow = {
  id: TEST_CAMPAIGN_ID,
  name: "Test",
  dmUserId: TEST_USER_ID,
  inviteCode: "X",
};

let campaignCachePrimed = false;
function primePerRequestAuthSelects() {
  // getOrCreateCampaign caches the campaign id at module scope after the
  // first call, so only the very first test request needs to satisfy that
  // initial campaigns lookup.
  if (!campaignCachePrimed) {
    selectQueue.push([campaignRow]);
    campaignCachePrimed = true;
  }
  // requireCampaignMember -> campaignMembers lookup
  selectQueue.push([dmMember]);
  // PATCH handler -> isDm -> getMember -> campaignMembers lookup
  selectQueue.push([dmMember]);
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(sessionsRouter);
  return app;
}

beforeEach(() => {
  selectQueue.length = 0;
  updateQueue.length = 0;
});

describe("PATCH /sessions/:id conflict detection", () => {
  it("normal updates without expectedVersion succeed and skip conflict check", async () => {
    const updated = {
      id: TEST_SESSION_ID,
      campaignId: TEST_CAMPAIGN_ID,
      sessionNumber: 3,
      title: "Updated Title",
      version: 5,
    };
    primePerRequestAuthSelects();
    updateQueue.push([updated]);

    const res = await request(buildApp())
      .patch(`/sessions/${TEST_SESSION_ID}`)
      .send({ title: "Updated Title" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: TEST_SESSION_ID,
      title: "Updated Title",
    });
    expect(updateQueue).toHaveLength(0);
    // Conflict-recovery select should NOT have been queued or consumed.
    expect(selectQueue).toHaveLength(0);
  });

  it("updates with matching expectedVersion succeed", async () => {
    const updated = {
      id: TEST_SESSION_ID,
      campaignId: TEST_CAMPAIGN_ID,
      title: "Versioned Title",
      version: 8,
    };
    primePerRequestAuthSelects();
    updateQueue.push([updated]);

    const res = await request(buildApp())
      .patch(`/sessions/${TEST_SESSION_ID}`)
      .send({ title: "Versioned Title", expectedVersion: 7 });

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(8);
    expect(selectQueue).toHaveLength(0);
  });

  it("updates with stale expectedVersion return 409 with serverSession", async () => {
    const serverSession = {
      id: TEST_SESSION_ID,
      campaignId: TEST_CAMPAIGN_ID,
      sessionNumber: 3,
      title: "Server Title",
      version: 9,
    };
    primePerRequestAuthSelects();
    updateQueue.push([]);
    selectQueue.push([serverSession]);

    const res = await request(buildApp())
      .patch(`/sessions/${TEST_SESSION_ID}`)
      .send({ title: "Stale Update", expectedVersion: 1 });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: "Session was modified by another client",
      serverSession,
    });
  });

  it("returns 404 when stale-version session also no longer exists", async () => {
    primePerRequestAuthSelects();
    updateQueue.push([]);
    selectQueue.push([]);

    const res = await request(buildApp())
      .patch(`/sessions/${TEST_SESSION_ID}`)
      .send({ title: "Gone", expectedVersion: 1 });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Session not found" });
  });

  it("returns 404 (not 409) when no expectedVersion was provided and update affected nothing", async () => {
    primePerRequestAuthSelects();
    updateQueue.push([]);

    const res = await request(buildApp())
      .patch(`/sessions/${TEST_SESSION_ID}`)
      .send({ title: "Missing" });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Session not found" });
    expect(selectQueue).toHaveLength(0);
  });
});

describe("PATCH /sessions/:id attendee validation", () => {
  it("rejects attendees with the wrong shape (400, before any DB lookup)", async () => {
    primePerRequestAuthSelects();

    const res = await request(buildApp())
      .patch(`/sessions/${TEST_SESSION_ID}`)
      .send({ attendees: { characterIds: ["not-a-number"], npcs: [] } });

    expect(res.status).toBe(400);
    // No update should have been issued.
    expect(updateQueue).toHaveLength(0);
  });

  it("rejects unknown character IDs (cross-campaign or deleted) with 400", async () => {
    primePerRequestAuthSelects();
    // validateAttendees -> select on charactersTable returns []
    selectQueue.push([]);

    const res = await request(buildApp())
      .patch(`/sessions/${TEST_SESSION_ID}`)
      .send({ attendees: { characterIds: [9999], npcs: [] } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown character/i);
  });

  it("rejects unknown NPC IDs with 400", async () => {
    primePerRequestAuthSelects();
    // validateAttendees -> select on npcsTable returns []
    selectQueue.push([]);

    const res = await request(buildApp())
      .patch(`/sessions/${TEST_SESSION_ID}`)
      .send({ attendees: { characterIds: [], npcs: [{ name: "Ghost", npcId: 8888 }] } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown NPC/i);
  });

  it("rejects an attending NPC with an empty name", async () => {
    primePerRequestAuthSelects();

    const res = await request(buildApp())
      .patch(`/sessions/${TEST_SESSION_ID}`)
      .send({ attendees: { characterIds: [], npcs: [{ name: "   " }] } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty name/i);
  });
});

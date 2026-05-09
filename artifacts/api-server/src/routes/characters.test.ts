import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const TEST_USER_ID = "user_test_owner";
const TEST_CAMPAIGN_ID = 1;
const TEST_CHARACTER_ID = 7;

type Result = unknown;

const selectQueue: Result[] = [];

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
  update: () => chainable(() => Promise.resolve([])),
  insert: () => chainable(() => Promise.resolve([])),
  delete: () => chainable(() => Promise.resolve([])),
};

vi.mock("@workspace/db", () => ({
  db: mockDb,
  charactersTable: { id: "id", campaignId: "campaignId", isActive: "isActive" },
  campaignMembersTable: {
    id: "id",
    campaignId: "campaignId",
    userId: "userId",
  },
  campaignsTable: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (..._args: unknown[]) => ({ _: "eq" }),
  and: (..._args: unknown[]) => ({ _: "and" }),
}));

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: TEST_USER_ID, sessionClaims: {} }),
  clerkMiddleware:
    () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const charactersRouter = (await import("./characters")).default;

const ownerMember = {
  id: 1,
  campaignId: TEST_CAMPAIGN_ID,
  userId: TEST_USER_ID,
  role: "player",
  displayName: "Owner Tester",
  avatarUrl: null,
};

const characterRow = {
  id: TEST_CHARACTER_ID,
  campaignId: TEST_CAMPAIGN_ID,
  ownerUserId: TEST_USER_ID,
  name: "Aragorn",
  race: "Human",
  class: "Ranger",
  level: 5,
  sheetJson: {},
  portraitUrl: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const campaignRow = {
  id: TEST_CAMPAIGN_ID,
  name: "Test",
  dmUserId: TEST_USER_ID,
  inviteCode: "X",
};

let campaignCachePrimed = false;
function primeRequestSelects() {
  // getOrCreateCampaign caches after first hit; only the very first request
  // needs to satisfy the initial campaigns lookup.
  if (!campaignCachePrimed) {
    selectQueue.push([campaignRow]);
    campaignCachePrimed = true;
  }
  // requireCampaignMember -> campaignMembers lookup
  selectQueue.push([ownerMember]);
  // PDF route: characters lookup
  selectQueue.push([characterRow]);
  // PDF route: isDm -> getMember -> campaignMembers lookup
  selectQueue.push([ownerMember]);
  // PDF route: campaignMembers lookup for ownerDisplayName
  selectQueue.push([ownerMember]);
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(charactersRouter);
  return app;
}

beforeEach(() => {
  selectQueue.length = 0;
});

describe("GET /characters/:id/pdf", () => {
  it("returns a PDF as an attachment by default", async () => {
    primeRequestSelects();

    const res = await request(buildApp()).get(
      `/characters/${TEST_CHARACTER_ID}/pdf`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(res.headers["content-disposition"]).toContain('filename="Delve - Aragorn.pdf"');

    // supertest exposes the raw body as a Buffer for non-text responses.
    const body = res.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("returns the PDF inline when ?inline=1 is set", async () => {
    primeRequestSelects();

    const res = await request(buildApp()).get(
      `/characters/${TEST_CHARACTER_ID}/pdf?inline=1`,
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(/^inline;/);

    const body = res.body as Buffer;
    expect(body.length).toBeGreaterThan(0);
    expect(body.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const TEST_DM_ID = "user_test_dm";
const TEST_PLAYER_ID = "user_test_player";
const TEST_CAMPAIGN_ID = 1;

type Result = unknown;
const selectQueue: Result[] = [];

function chainable(resultPromise: () => Promise<Result>) {
  const obj: Record<string, unknown> = {};
  const passthrough = () => obj;
  for (const key of ["from", "set", "values", "where", "orderBy", "innerJoin", "leftJoin"]) {
    obj[key] = passthrough;
  }
  obj.limit = () => resultPromise();
  obj.returning = () => resultPromise();
  obj.then = (resolve: (v: Result) => unknown, reject?: (r: unknown) => unknown) =>
    resultPromise().then(resolve, reject);
  obj.catch = (reject: (r: unknown) => unknown) => resultPromise().catch(reject);
  return obj;
}

const mockDb = {
  select: () => {
    const next = selectQueue.shift();
    return chainable(() => Promise.resolve(next ?? []));
  },
  insert: () => chainable(() => Promise.resolve([])),
  delete: () => chainable(() => Promise.resolve([])),
};

vi.mock("@workspace/db", () => ({
  db: mockDb,
  npcsTable: { id: "id", campaignId: "campaignId", name: "name" },
  campaignMembersTable: { id: "id", campaignId: "campaignId", userId: "userId" },
  campaignsTable: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({ _: "eq" }),
  and: () => ({ _: "and" }),
  asc: () => ({ _: "asc" }),
  inArray: () => ({ _: "inArray" }),
}));

let currentUserId = TEST_DM_ID;
vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: currentUserId, sessionClaims: {} }),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const npcsRouter = (await import("./npcs")).default;

const dmMember = { id: 1, campaignId: TEST_CAMPAIGN_ID, userId: TEST_DM_ID, role: "dm", displayName: "DM", avatarUrl: null };
const playerMember = { id: 2, campaignId: TEST_CAMPAIGN_ID, userId: TEST_PLAYER_ID, role: "player", displayName: "Player", avatarUrl: null };
const campaignRow = { id: TEST_CAMPAIGN_ID, name: "Test", dmUserId: TEST_DM_ID, inviteCode: "X" };

let campaignCachePrimed = false;
function primeAuth(member: typeof dmMember | typeof playerMember) {
  if (!campaignCachePrimed) {
    selectQueue.push([campaignRow]);
    campaignCachePrimed = true;
  }
  // requireCampaignMember
  selectQueue.push([member]);
  // isDm -> getMember
  selectQueue.push([member]);
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(npcsRouter);
  return app;
}

beforeEach(() => {
  selectQueue.length = 0;
});

describe("GET /npcs role gate", () => {
  it("returns the roster for the DM", async () => {
    currentUserId = TEST_DM_ID;
    primeAuth(dmMember);
    selectQueue.push([
      { id: 10, campaignId: TEST_CAMPAIGN_ID, name: "Brogg", shortNote: null, avatarUrl: null, createdByUserId: TEST_DM_ID, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]);

    const res = await request(buildApp()).get("/npcs");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe("Brogg");
  });

  it("rejects players with 403 — the roster can hold spoilers", async () => {
    currentUserId = TEST_PLAYER_ID;
    primeAuth(playerMember);

    const res = await request(buildApp()).get("/npcs");
    expect(res.status).toBe(403);
  });
});

describe("POST /npcs role gate", () => {
  it("rejects players with 403", async () => {
    currentUserId = TEST_PLAYER_ID;
    primeAuth(playerMember);

    const res = await request(buildApp()).post("/npcs").send({ name: "Sneaky" });
    expect(res.status).toBe(403);
  });
});

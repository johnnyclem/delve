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
  update: () => chainable(() => Promise.resolve([])),
  delete: () => chainable(() => Promise.resolve([])),
  execute: () => Promise.resolve({ rows: [] }),
};

vi.mock("@workspace/db", () => ({
  db: mockDb,
  campaignEntitiesTable: {},
  entityRevealAuditTable: {},
  campaignMembersTable: { id: "id", campaignId: "campaignId", userId: "userId" },
  campaignsTable: { id: "id" },
  ENTITY_KINDS: ["npc", "quest", "location", "story_beat", "mob_encounter", "plot_twist", "faction", "item_unique"],
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({ _: "eq" }),
  and: () => ({ _: "and" }),
  asc: () => ({ _: "asc" }),
  desc: () => ({ _: "desc" }),
  inArray: () => ({ _: "inArray" }),
  sql: () => ({}),
}));

let currentUserId = TEST_DM_ID;
vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: currentUserId, sessionClaims: {} }),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const seedSpy = vi.fn();
vi.mock("../lib/seedWorld", () => ({
  seedCampaignWorldFromSrd: (campaignId: number) => seedSpy(campaignId),
}));

vi.mock("../lib/entityEmbeddings", () => ({
  syncEntityChunks: () => Promise.resolve(),
}));

const entitiesRouter = (await import("./entities")).default;

const dmMember = { id: 1, campaignId: TEST_CAMPAIGN_ID, userId: TEST_DM_ID, role: "dm", displayName: "DM", avatarUrl: null };
const playerMember = { id: 2, campaignId: TEST_CAMPAIGN_ID, userId: TEST_PLAYER_ID, role: "player", displayName: "Player", avatarUrl: null };
const campaignRow = { id: TEST_CAMPAIGN_ID, name: "Test", dmUserId: TEST_DM_ID, inviteCode: "X" };

let campaignCachePrimed = false;
function primeAuth(member: typeof dmMember | typeof playerMember) {
  if (!campaignCachePrimed) {
    selectQueue.push([campaignRow]);
    campaignCachePrimed = true;
  }
  selectQueue.push([member]); // requireCampaignMember
  selectQueue.push([member]); // isDm -> getMember
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(entitiesRouter);
  return app;
}

beforeEach(() => {
  selectQueue.length = 0;
  seedSpy.mockReset();
});

describe("POST /entities/seed-srd", () => {
  it("returns 403 for non-DM members and never invokes the seeder", async () => {
    currentUserId = TEST_PLAYER_ID;
    primeAuth(playerMember);

    const res = await request(buildApp()).post("/entities/seed-srd");

    expect(res.status).toBe(403);
    expect(seedSpy).not.toHaveBeenCalled();
  });

  it("returns the seed summary for the DM", async () => {
    currentUserId = TEST_DM_ID;
    primeAuth(dmMember);
    seedSpy.mockResolvedValue({
      added: { npc: 7, mob_encounter: 7 },
      skipped: { npc: 0, mob_encounter: 0 },
      missing: [],
      bestiaryAvailable: true,
    });

    const res = await request(buildApp()).post("/entities/seed-srd");

    expect(res.status).toBe(200);
    expect(res.body.added).toEqual({ npc: 7, mob_encounter: 7 });
    expect(seedSpy).toHaveBeenCalledWith(TEST_CAMPAIGN_ID);
  });

  it("returns 409 with a clear message when the SRD bestiary isn't ingested", async () => {
    currentUserId = TEST_DM_ID;
    primeAuth(dmMember);
    seedSpy.mockResolvedValue({
      added: { npc: 0, mob_encounter: 0 },
      skipped: { npc: 0, mob_encounter: 0 },
      missing: [],
      bestiaryAvailable: false,
    });

    const res = await request(buildApp()).post("/entities/seed-srd");

    expect(res.status).toBe(409);
    expect(res.body.bestiaryAvailable).toBe(false);
    expect(res.body.error).toMatch(/bestiary/i);
  });
});

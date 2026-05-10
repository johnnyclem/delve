import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const TEST_DM_ID = "user_test_dm";
const TEST_PLAYER_ID = "user_test_player";
const TEST_CAMPAIGN_ID = 1;

type Result = unknown;
const selectQueue: Result[] = [];
const insertQueue: Result[] = [];
const deleteQueue: Result[] = [];
const updateQueue: Result[] = [];

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
  insert: () => {
    const next = insertQueue.shift();
    return chainable(() => Promise.resolve(next ?? []));
  },
  delete: () => {
    const next = deleteQueue.shift();
    return chainable(() => Promise.resolve(next ?? []));
  },
  update: () => {
    const next = updateQueue.shift();
    return chainable(() => Promise.resolve(next ?? []));
  },
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
  insertQueue.length = 0;
  deleteQueue.length = 0;
  updateQueue.length = 0;
});

function primeMemberOnly(member: typeof dmMember | typeof playerMember) {
  if (!campaignCachePrimed) {
    selectQueue.push([campaignRow]);
    campaignCachePrimed = true;
  }
  // requireCampaignMember only — GET path doesn't call isDm
  selectQueue.push([member]);
}

describe("GET /npcs", () => {
  it("returns the roster for the DM", async () => {
    currentUserId = TEST_DM_ID;
    primeMemberOnly(dmMember);
    selectQueue.push([
      { id: 10, campaignId: TEST_CAMPAIGN_ID, name: "Brogg", shortNote: null, avatarUrl: null, createdByUserId: TEST_DM_ID, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]);

    const res = await request(buildApp()).get("/npcs");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].name).toBe("Brogg");
  });

  it("returns the roster for players too — read is campaign-member open", async () => {
    currentUserId = TEST_PLAYER_ID;
    primeMemberOnly(playerMember);
    selectQueue.push([
      { id: 11, campaignId: TEST_CAMPAIGN_ID, name: "Innkeeper", shortNote: null, avatarUrl: null, createdByUserId: TEST_DM_ID, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]);

    const res = await request(buildApp()).get("/npcs");
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe("Innkeeper");
  });
});

describe("POST /npcs", () => {
  it("creates an NPC for the DM and returns the persisted row", async () => {
    currentUserId = TEST_DM_ID;
    primeAuth(dmMember);
    const created = {
      id: 42,
      campaignId: TEST_CAMPAIGN_ID,
      name: "Brogg",
      shortNote: null,
      avatarUrl: null,
      createdByUserId: TEST_DM_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    insertQueue.push([created]);

    const res = await request(buildApp()).post("/npcs").send({ name: "  Brogg  " });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 42,
      name: "Brogg",
      campaignId: TEST_CAMPAIGN_ID,
      createdByUserId: TEST_DM_ID,
    });
  });

  it("rejects players with 403", async () => {
    currentUserId = TEST_PLAYER_ID;
    primeAuth(playerMember);

    const res = await request(buildApp()).post("/npcs").send({ name: "Sneaky" });
    expect(res.status).toBe(403);
    // Insert should never have been attempted.
    expect(insertQueue).toHaveLength(0);
  });

  it("rejects empty name with 400", async () => {
    currentUserId = TEST_DM_ID;
    primeAuth(dmMember);

    const res = await request(buildApp()).post("/npcs").send({ name: "   " });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /npcs/:id", () => {
  it("deletes an NPC for the DM and returns success", async () => {
    currentUserId = TEST_DM_ID;
    primeAuth(dmMember);
    deleteQueue.push([{ id: 5 }]);

    const res = await request(buildApp()).delete("/npcs/5");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it("returns 404 when the NPC doesn't belong to this campaign", async () => {
    currentUserId = TEST_DM_ID;
    primeAuth(dmMember);
    deleteQueue.push([]);

    const res = await request(buildApp()).delete("/npcs/9999");
    expect(res.status).toBe(404);
  });

  it("rejects players with 403", async () => {
    currentUserId = TEST_PLAYER_ID;
    primeAuth(playerMember);

    const res = await request(buildApp()).delete("/npcs/5");
    expect(res.status).toBe(403);
    expect(deleteQueue).toHaveLength(0);
  });

  it("rejects invalid id with 400", async () => {
    currentUserId = TEST_DM_ID;
    primeAuth(dmMember);

    const res = await request(buildApp()).delete("/npcs/not-a-number");
    expect(res.status).toBe(400);
  });
});

describe("PATCH /npcs/:id", () => {
  it("updates relationship tags for the DM and returns the row", async () => {
    currentUserId = TEST_DM_ID;
    primeAuth(dmMember);
    const updated = {
      id: 7,
      campaignId: TEST_CAMPAIGN_ID,
      name: "Brogg",
      shortNote: null,
      avatarUrl: null,
      relationshipTags: ["Hostile", "Mysterious"],
      createdByUserId: TEST_DM_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    updateQueue.push([updated]);

    const res = await request(buildApp())
      .patch("/npcs/7")
      .send({ relationshipTags: ["Hostile", "Mysterious"] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 7, relationshipTags: ["Hostile", "Mysterious"] });
  });

  it("rejects players with 403", async () => {
    currentUserId = TEST_PLAYER_ID;
    primeAuth(playerMember);

    const res = await request(buildApp())
      .patch("/npcs/7")
      .send({ relationshipTags: ["Ally"] });
    expect(res.status).toBe(403);
    expect(updateQueue).toHaveLength(0);
  });

  it("returns 404 when the NPC doesn't belong to this campaign", async () => {
    currentUserId = TEST_DM_ID;
    primeAuth(dmMember);
    updateQueue.push([]);

    const res = await request(buildApp())
      .patch("/npcs/9999")
      .send({ relationshipTags: ["Ally"] });
    expect(res.status).toBe(404);
  });

  it("rejects invalid id with 400", async () => {
    currentUserId = TEST_DM_ID;
    primeAuth(dmMember);

    const res = await request(buildApp())
      .patch("/npcs/not-a-number")
      .send({ relationshipTags: [] });
    expect(res.status).toBe(400);
  });

  it("rejects empty patch body with 400", async () => {
    currentUserId = TEST_DM_ID;
    primeAuth(dmMember);

    const res = await request(buildApp()).patch("/npcs/7").send({});
    expect(res.status).toBe(400);
    expect(updateQueue).toHaveLength(0);
  });
});

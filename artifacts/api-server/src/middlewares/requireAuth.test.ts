import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const DEMO_USER_ID = "user_demo_account";
const REAL_USER_ID = "user_real_person";

let mockAuthUserId: string = REAL_USER_ID;

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: mockAuthUserId, sessionClaims: {} }),
  clerkMiddleware:
    () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("@workspace/db", () => ({
  db: {},
  campaignMembersTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
}));

vi.mock("../lib/campaign", () => ({
  getOrCreateCampaign: async () => 1,
}));

const { requireAuth } = await import("./requireAuth");

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.get("/items", requireAuth, (_req, res) => {
    res.json({ ok: true });
  });
  app.delete("/items/:id", requireAuth, (_req, res) => {
    res.json({ deleted: true });
  });
  app.patch("/items/:id", requireAuth, (_req, res) => {
    res.json({ patched: true });
  });
  app.put("/items/:id", requireAuth, (_req, res) => {
    res.json({ put: true });
  });
  app.post("/items", requireAuth, (_req, res) => {
    res.json({ created: true });
  });
  return app;
}

describe("requireAuth demo account guard", () => {
  beforeEach(() => {
    process.env["DEMO_USER_ID"] = DEMO_USER_ID;
    mockAuthUserId = REAL_USER_ID;
  });

  afterEach(() => {
    delete process.env["DEMO_USER_ID"];
  });

  it("allows real users to perform destructive actions", async () => {
    mockAuthUserId = REAL_USER_ID;
    const res = await request(buildApp()).delete("/items/1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
  });

  it("blocks DELETE for the demo user", async () => {
    mockAuthUserId = DEMO_USER_ID;
    const res = await request(buildApp()).delete("/items/1");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/demo account/i);
    expect(res.body.code).toBe("demo_account_readonly");
  });

  it("blocks PATCH for the demo user", async () => {
    mockAuthUserId = DEMO_USER_ID;
    const res = await request(buildApp()).patch("/items/1").send({ a: 1 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("demo_account_readonly");
  });

  it("blocks PUT for the demo user", async () => {
    mockAuthUserId = DEMO_USER_ID;
    const res = await request(buildApp()).put("/items/1").send({ a: 1 });
    expect(res.status).toBe(403);
  });

  it("allows GET for the demo user (read-only stays unaffected)", async () => {
    mockAuthUserId = DEMO_USER_ID;
    const res = await request(buildApp()).get("/items");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("allows POST for the demo user (only DELETE/PATCH/PUT are guarded)", async () => {
    mockAuthUserId = DEMO_USER_ID;
    const res = await request(buildApp()).post("/items").send({ a: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: true });
  });

  it("does not block when DEMO_USER_ID env var is unset", async () => {
    delete process.env["DEMO_USER_ID"];
    mockAuthUserId = DEMO_USER_ID;
    const res = await request(buildApp()).delete("/items/1");
    expect(res.status).toBe(200);
  });
});

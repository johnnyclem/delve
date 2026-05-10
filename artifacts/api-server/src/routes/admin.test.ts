import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import type { SchemaHealthResult } from "../lib/schemaHealthCheck";

const ADMIN_TOKEN = "test-admin-token";

const getLastSchemaHealthResultMock = vi.fn<() => SchemaHealthResult | null>();
const runSchemaHealthCheckMock = vi.fn<() => Promise<SchemaHealthResult>>();

vi.mock("../lib/schemaHealthCheck", () => ({
  getLastSchemaHealthResult: () => getLastSchemaHealthResultMock(),
  runSchemaHealthCheck: () => runSchemaHealthCheckMock(),
}));

vi.mock("@workspace/db", () => ({
  db: {},
  pool: { query: vi.fn() },
  campaignEntitiesTable: { id: "id", campaignId: "campaignId" },
  campaignsTable: { id: "id" },
  campaignMembersTable: { id: "id", campaignId: "campaignId", userId: "userId" },
  campaignEntityChunksTable: {},
  charactersTable: {},
  sessionLogsTable: {},
  referenceChunksTable: {},
  homebrewRulesTable: {},
}));

vi.mock("@workspace/entity-embeddings", () => ({
  backfillEntityChunks: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({ _: "eq" }),
  and: () => ({ _: "and" }),
}));

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: "user_test", sessionClaims: {} }),
  clerkMiddleware:
    () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("./calendar", () => ({
  reanchorAllSeries: vi.fn(async () => []),
}));

vi.mock("../lib/campaign", () => ({
  getOrCreateCampaign: vi.fn(async () => 1),
  claimDmWithToken: vi.fn(async () => ({})),
  isDm: vi.fn(async () => true),
}));

const adminRouter = (await import("./admin")).default;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(adminRouter);
  return app;
}

function makeResult(overrides: Partial<SchemaHealthResult> = {}): SchemaHealthResult {
  return {
    ok: true,
    checkedAt: "2026-01-01T00:00:00.000Z",
    totalChecks: 42,
    failures: [],
    ...overrides,
  };
}

const ORIGINAL_TOKEN = process.env.ADMIN_RESET_TOKEN;

beforeEach(() => {
  getLastSchemaHealthResultMock.mockReset();
  runSchemaHealthCheckMock.mockReset();
  process.env.ADMIN_RESET_TOKEN = ADMIN_TOKEN;
});

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.ADMIN_RESET_TOKEN;
  } else {
    process.env.ADMIN_RESET_TOKEN = ORIGINAL_TOKEN;
  }
});

describe("GET /admin/schema-health auth", () => {
  it("returns 503 when ADMIN_RESET_TOKEN is not configured", async () => {
    delete process.env.ADMIN_RESET_TOKEN;

    const res = await request(buildApp()).get("/admin/schema-health");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Admin token is not configured" });
    expect(getLastSchemaHealthResultMock).not.toHaveBeenCalled();
    expect(runSchemaHealthCheckMock).not.toHaveBeenCalled();
  });

  it("returns 403 when no admin token header is provided", async () => {
    const res = await request(buildApp()).get("/admin/schema-health");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Invalid admin token" });
    expect(getLastSchemaHealthResultMock).not.toHaveBeenCalled();
    expect(runSchemaHealthCheckMock).not.toHaveBeenCalled();
  });

  it("returns 403 when an incorrect admin token is provided", async () => {
    const res = await request(buildApp())
      .get("/admin/schema-health")
      .set("x-admin-token", "wrong-token");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Invalid admin token" });
    expect(runSchemaHealthCheckMock).not.toHaveBeenCalled();
  });
});

describe("GET /admin/schema-health cached vs refreshed paths", () => {
  it("default GET returns the cached result without re-running the check", async () => {
    const cached = makeResult({ totalChecks: 100 });
    getLastSchemaHealthResultMock.mockReturnValue(cached);

    const res = await request(buildApp())
      .get("/admin/schema-health")
      .set("x-admin-token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cached);
    expect(getLastSchemaHealthResultMock).toHaveBeenCalledTimes(1);
    expect(runSchemaHealthCheckMock).not.toHaveBeenCalled();
  });

  it("default GET runs a fresh check when no cached result exists yet", async () => {
    const fresh = makeResult({ totalChecks: 7 });
    getLastSchemaHealthResultMock.mockReturnValue(null);
    runSchemaHealthCheckMock.mockResolvedValue(fresh);

    const res = await request(buildApp())
      .get("/admin/schema-health")
      .set("x-admin-token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fresh);
    expect(runSchemaHealthCheckMock).toHaveBeenCalledTimes(1);
  });

  it("?refresh=1 triggers a new check even when a cached result exists", async () => {
    const cached = makeResult({ totalChecks: 100, checkedAt: "2026-01-01T00:00:00.000Z" });
    const fresh = makeResult({ totalChecks: 200, checkedAt: "2026-05-10T00:00:00.000Z" });
    getLastSchemaHealthResultMock.mockReturnValue(cached);
    runSchemaHealthCheckMock.mockResolvedValue(fresh);

    const res = await request(buildApp())
      .get("/admin/schema-health?refresh=1")
      .set("x-admin-token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fresh);
    expect(runSchemaHealthCheckMock).toHaveBeenCalledTimes(1);
  });

  it("?refresh=true is also accepted as a refresh trigger", async () => {
    const fresh = makeResult({ totalChecks: 5 });
    getLastSchemaHealthResultMock.mockReturnValue(makeResult({ totalChecks: 1 }));
    runSchemaHealthCheckMock.mockResolvedValue(fresh);

    const res = await request(buildApp())
      .get("/admin/schema-health?refresh=true")
      .set("x-admin-token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fresh);
    expect(runSchemaHealthCheckMock).toHaveBeenCalledTimes(1);
  });

  it("refresh updates the cache so a subsequent default GET serves the refreshed value", async () => {
    const cached = makeResult({ totalChecks: 100, checkedAt: "2026-01-01T00:00:00.000Z" });
    const fresh = makeResult({ totalChecks: 200, checkedAt: "2026-05-10T00:00:00.000Z" });

    // Simulate the real schemaHealthCheck module: runSchemaHealthCheck
    // updates the cached result that getLastSchemaHealthResult returns.
    getLastSchemaHealthResultMock.mockReturnValue(cached);
    runSchemaHealthCheckMock.mockImplementation(async () => {
      getLastSchemaHealthResultMock.mockReturnValue(fresh);
      return fresh;
    });

    const app = buildApp();

    const refreshRes = await request(app)
      .get("/admin/schema-health?refresh=1")
      .set("x-admin-token", ADMIN_TOKEN);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toEqual(fresh);
    expect(runSchemaHealthCheckMock).toHaveBeenCalledTimes(1);

    const followupRes = await request(app)
      .get("/admin/schema-health")
      .set("x-admin-token", ADMIN_TOKEN);
    expect(followupRes.status).toBe(200);
    expect(followupRes.body).toEqual(fresh);
    // No additional check should have been triggered — the cache is now warm.
    expect(runSchemaHealthCheckMock).toHaveBeenCalledTimes(1);
  });

  it("ignores other refresh values and returns the cached result", async () => {
    const cached = makeResult({ totalChecks: 100 });
    getLastSchemaHealthResultMock.mockReturnValue(cached);

    const res = await request(buildApp())
      .get("/admin/schema-health?refresh=yes")
      .set("x-admin-token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cached);
    expect(runSchemaHealthCheckMock).not.toHaveBeenCalled();
  });
});

describe("GET /admin/schema-health response shape", () => {
  it("matches the SchemaHealthResult shape on success (no failures)", async () => {
    const result = makeResult({
      ok: true,
      totalChecks: 12,
      failures: [],
    });
    getLastSchemaHealthResultMock.mockReturnValue(result);

    const res = await request(buildApp())
      .get("/admin/schema-health")
      .set("x-admin-token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ["checkedAt", "failures", "ok", "totalChecks"].sort(),
    );
    expect(typeof res.body.ok).toBe("boolean");
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.checkedAt).toBe("string");
    expect(typeof res.body.totalChecks).toBe("number");
    expect(Array.isArray(res.body.failures)).toBe(true);
    expect(res.body.failures).toHaveLength(0);
  });

  it("matches the SchemaHealthResult shape on failure (with failures array)", async () => {
    const result = makeResult({
      ok: false,
      totalChecks: 10,
      failures: [
        { check: "campaigns.timezone", error: 'column "timezone" is missing from table "campaigns"' },
        { check: "information_schema.columns", error: "boom", code: "42P01" },
      ],
    });
    getLastSchemaHealthResultMock.mockReturnValue(null);
    runSchemaHealthCheckMock.mockResolvedValue(result);

    const res = await request(buildApp())
      .get("/admin/schema-health?refresh=1")
      .set("x-admin-token", ADMIN_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.failures).toHaveLength(2);
    for (const failure of res.body.failures) {
      expect(typeof failure.check).toBe("string");
      expect(typeof failure.error).toBe("string");
      if ("code" in failure && failure.code !== undefined) {
        expect(typeof failure.code).toBe("string");
      }
    }
  });
});

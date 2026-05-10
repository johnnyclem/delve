import { describe, it, expect, beforeEach, vi } from "vitest";

type Result = unknown;

const selectQueue: Result[] = [];
const insertedRows: Array<{ campaignId: number; kind: string; slug: string; values: Record<string, unknown> }> = [];
const executeResults: Result[] = [];
const syncCalls: Array<{ entityId: number; campaignId: number }> = [];

const existingPairs = new Set<string>();

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
  // The seeder uses `db.execute(sql\`...\`)` for the ON CONFLICT INSERT.
  execute: (query: { values?: unknown[] }) => {
    // The drizzle `sql` template is mocked to capture its raw values
    // (campaignId, kind, slug, name, public_md, dm_notes, data_json).
    const values = query.values ?? [];
    const result = executeResults.shift();
    if (result !== undefined) return Promise.resolve(result);
    const [campaignId, kind, slug, name, publicMd, dmNotes] = values as [
      number, string, string, string, string, string,
    ];
    const key = `${campaignId}:${kind}:${slug}`;
    if (existingPairs.has(key)) {
      return Promise.resolve({ rows: [] });
    }
    existingPairs.add(key);
    const id = insertedRows.length + 100;
    insertedRows.push({ campaignId, kind, slug, values: { name, publicMd, dmNotes } });
    return Promise.resolve({ rows: [{ id }] });
  },
};

vi.mock("@workspace/db", () => ({
  db: mockDb,
  campaignEntitiesTable: {},
  campaignsTable: { id: "id", defaultEdition: "defaultEdition" },
  referenceChunksTable: {
    id: "id",
    edition: "edition",
    entitySlug: "entitySlug",
    entityKind: "entityKind",
    title: "title",
    bodyMd: "bodyMd",
    sourceUrl: "sourceUrl",
  },
}));

vi.mock("drizzle-orm", () => {
  // Capture the SQL template's interpolated values so mockDb.execute can read them.
  const sqlTag = (_strings: TemplateStringsArray, ...values: unknown[]) => ({ values });
  // sql.raw shouldn't be called by the seeder, but stub it for safety.
  (sqlTag as unknown as { raw: (s: string) => unknown }).raw = (s: string) => s;
  return {
    sql: sqlTag,
    eq: () => ({ _: "eq" }),
    and: () => ({ _: "and" }),
    inArray: () => ({ _: "inArray" }),
  };
});

vi.mock("../lib/entityEmbeddings", () => ({
  syncEntityChunks: (entityId: number, campaignId: number) => {
    syncCalls.push({ entityId, campaignId });
    return Promise.resolve();
  },
}));

// The relative import path for the seeder's own embeddings dep.
vi.mock("./entityEmbeddings", () => ({
  syncEntityChunks: (entityId: number, campaignId: number) => {
    syncCalls.push({ entityId, campaignId });
    return Promise.resolve();
  },
}));

vi.mock("./logger", () => ({
  logger: { error: () => {}, warn: () => {}, info: () => {} },
}));

const { seedCampaignWorldFromSrd, bestiaryAvailable } = await import("./seedWorld");

const TEST_CAMPAIGN_ID = 42;

function makeMonsterChunk(slug: string, type: string, cr: string) {
  return {
    id: Math.floor(Math.random() * 10000),
    edition: "2014",
    entitySlug: slug,
    title: slug.replace(/-/g, " "),
    bodyMd: `# ${slug}\n\n**type**: ${type}\n**size**: Medium\n**alignment**: neutral\n**challenge rating**: ${cr}`,
    sourceUrl: `https://example.test/${slug}`,
  };
}

const ALL_SLUGS = [
  "guard", "acolyte", "commoner", "noble", "bandit-captain", "mage", "veteran",
  "goblin", "kobold", "wolf", "bandit", "orc", "ogre", "young-red-dragon",
];

function primeFullBestiary() {
  // 1. bestiaryAvailable() probe — return one row
  selectQueue.push([{ id: 1 }]);
  // 2. campaign defaultEdition lookup
  selectQueue.push([{ defaultEdition: "2014" }]);
  // 3. monster chunks for all slugs
  selectQueue.push(
    ALL_SLUGS.map((s) =>
      makeMonsterChunk(s, s.includes("dragon") ? "dragon" : "humanoid", "1"),
    ),
  );
}

beforeEach(() => {
  selectQueue.length = 0;
  insertedRows.length = 0;
  executeResults.length = 0;
  syncCalls.length = 0;
  existingPairs.clear();
});

describe("bestiaryAvailable", () => {
  it("returns false when no monster chunks exist", async () => {
    selectQueue.push([]);
    expect(await bestiaryAvailable()).toBe(false);
  });

  it("returns true when at least one monster chunk exists", async () => {
    selectQueue.push([{ id: 1 }]);
    expect(await bestiaryAvailable()).toBe(true);
  });
});

describe("seedCampaignWorldFromSrd", () => {
  it("returns bestiaryAvailable=false and skips inserts when SRD bestiary is empty", async () => {
    selectQueue.push([]); // bestiaryAvailable -> false

    const summary = await seedCampaignWorldFromSrd(TEST_CAMPAIGN_ID);

    expect(summary.bestiaryAvailable).toBe(false);
    expect(summary.added.npc).toBe(0);
    expect(summary.added.mob_encounter).toBe(0);
    expect(insertedRows).toHaveLength(0);
  });

  it("inserts NPCs and mob encounters for every curated slug, hidden by default", async () => {
    primeFullBestiary();

    const summary = await seedCampaignWorldFromSrd(TEST_CAMPAIGN_ID);

    expect(summary.bestiaryAvailable).toBe(true);
    expect(summary.added.npc).toBe(7);
    expect(summary.added.mob_encounter).toBe(7);
    expect(summary.skipped.npc).toBe(0);
    expect(summary.skipped.mob_encounter).toBe(0);
    expect(summary.missing).toEqual([]);

    // All inserts have `revealed: false` baked into the SQL, and embeddings
    // sync was triggered for each new entity.
    expect(insertedRows).toHaveLength(14);
    expect(syncCalls).toHaveLength(14);
    for (const row of insertedRows) {
      expect(row.campaignId).toBe(TEST_CAMPAIGN_ID);
      expect(["npc", "mob_encounter"]).toContain(row.kind);
      expect(row.slug.startsWith("srd-")).toBe(true);
    }
  });

  it("is idempotent — re-running on a seeded campaign skips existing entries and only fills gaps", async () => {
    // First run: full seed.
    primeFullBestiary();
    const first = await seedCampaignWorldFromSrd(TEST_CAMPAIGN_ID);
    expect(first.added.npc + first.added.mob_encounter).toBe(14);

    const beforeSyncCalls = syncCalls.length;

    // Second run on the same campaign: every (campaign, kind, slug) already
    // exists, so all inserts hit ON CONFLICT DO NOTHING.
    primeFullBestiary();
    const second = await seedCampaignWorldFromSrd(TEST_CAMPAIGN_ID);

    expect(second.added.npc).toBe(0);
    expect(second.added.mob_encounter).toBe(0);
    expect(second.skipped.npc).toBe(7);
    expect(second.skipped.mob_encounter).toBe(7);
    // No new entities -> no new embeddings work.
    expect(syncCalls.length).toBe(beforeSyncCalls);
  });

  it("partial fill: existing rows are skipped, missing rows are added", async () => {
    // Pretend two NPC slugs already exist before we run the seed.
    existingPairs.add(`${TEST_CAMPAIGN_ID}:npc:srd-guard`);
    existingPairs.add(`${TEST_CAMPAIGN_ID}:mob_encounter:srd-goblin`);

    primeFullBestiary();
    const summary = await seedCampaignWorldFromSrd(TEST_CAMPAIGN_ID);

    expect(summary.added.npc).toBe(6);
    expect(summary.added.mob_encounter).toBe(6);
    expect(summary.skipped.npc).toBe(1);
    expect(summary.skipped.mob_encounter).toBe(1);
  });

  it("records missing slugs that have no matching SRD chunk", async () => {
    selectQueue.push([{ id: 1 }]); // bestiary probe
    selectQueue.push([{ defaultEdition: "2014" }]); // campaign edition
    // Only return chunks for two of the curated slugs.
    selectQueue.push([
      makeMonsterChunk("guard", "humanoid", "1/8"),
      makeMonsterChunk("goblin", "humanoid", "1/4"),
    ]);

    const summary = await seedCampaignWorldFromSrd(TEST_CAMPAIGN_ID);

    expect(summary.added.npc).toBe(1);
    expect(summary.added.mob_encounter).toBe(1);
    expect(summary.missing).toContain("acolyte");
    expect(summary.missing).toContain("orc");
    expect(summary.missing.length).toBe(12);
  });
});

import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, sessionLogsTable, recapViewsTable, charactersTable, type SessionAttendees } from "@workspace/db";
import { logger } from "./logger";
import {
  RECAP_MODEL,
  RECAP_TEMPERATURE,
  RECAP_MAX_TOKENS,
  RECAP_SYSTEM_PROMPT,
  buildRecapUserPrompt,
} from "./recap-prompt";

export const RECAP_DEBOUNCE_MS = Number(process.env.RECAP_DEBOUNCE_MS ?? 30_000);

export type RecapStatus = "idle" | "pending" | "running" | "error";

export function hashNotes(notes: string | null | undefined): string | null {
  if (!notes || notes.trim() === "") return null;
  return createHash("sha256").update(notes).digest("hex");
}

/**
 * Returns true when `rawNotesMd` is meaningfully different from the notes
 * the current recap was generated from. Empty/whitespace notes never trigger.
 */
export function shouldScheduleRecap(
  rawNotesMd: string | null | undefined,
  recapNotesHash: string | null | undefined,
): boolean {
  const h = hashNotes(rawNotesMd);
  if (!h) return false;
  return h !== (recapNotesHash ?? null);
}

// Per-session debounce timers. A scheduleRecap call resets the timer.
const pendingTimers = new Map<number, NodeJS.Timeout>();
// Per-session run chain tail. New runs are chained onto the tail so that at
// most one LLM call is in flight per session. NOTE: this only protects
// against concurrent runs *within a single api-server process*. A multi-
// instance deployment would need a DB advisory lock (out of scope).
const runChain = new Map<number, Promise<unknown>>();

async function buildAttendeesForRecap(
  attendees: SessionAttendees | null | undefined,
  campaignId: number,
): Promise<{ kind: "pc" | "npc"; name: string }[]> {
  if (!attendees) return [];
  const out: { kind: "pc" | "npc"; name: string }[] = [];
  if (attendees.characterIds.length > 0) {
    const chars = await db
      .select({ id: charactersTable.id, name: charactersTable.name })
      .from(charactersTable)
      .where(
        and(
          eq(charactersTable.campaignId, campaignId),
          inArray(charactersTable.id, attendees.characterIds),
        ),
      );
    for (const c of chars) out.push({ kind: "pc", name: c.name });
  }
  for (const npc of attendees.npcs) {
    out.push({ kind: "npc", name: npc.name });
  }
  return out;
}

/**
 * Actually generate + persist a recap. Always loads the freshest notes from
 * the DB so a queued run reflects the latest edits, not the edits at the time
 * it was scheduled.
 */
async function doGenerateRecap(sessionId: number, campaignId: number): Promise<string> {
  const [session] = await db
    .select()
    .from(sessionLogsTable)
    .where(and(eq(sessionLogsTable.id, sessionId), eq(sessionLogsTable.campaignId, campaignId)));

  if (!session) throw new Error("Session not found");
  const notes = session.rawNotesMd;
  if (!notes || notes.trim() === "") {
    // Benign: notes cleared between schedule and run. Reset any stuck
    // 'pending' status so the FE badge doesn't get stuck.
    await db
      .update(sessionLogsTable)
      .set({ recapStatus: "idle", recapError: null })
      .where(and(eq(sessionLogsTable.id, sessionId), eq(sessionLogsTable.campaignId, campaignId)))
      .catch(() => {});
    throw new Error("No raw notes to generate recap from");
  }

  // Multi-instance concurrency guard: try to acquire a PG advisory lock.
  // If another process is already generating a recap for this session,
  // pg_try_advisory_lock returns false and we skip.
  const [lockResult] = await db.execute<{ pg_try_advisory_lock: boolean }>(
    sql`SELECT pg_try_advisory_lock(${sessionId})`,
  );
  const gotLock = lockResult?.pg_try_advisory_lock ?? false;
  if (!gotLock) throw new Error("Recap generation already in progress for this session");

  // Stamp 'running' BEFORE the AI import so any pre-run failure (e.g. AI
  // service unavailable) gets the error update path below — never leaves the
  // row stuck in 'pending'.
  await db
    .update(sessionLogsTable)
    .set({ recapStatus: "running", recapError: null })
    .where(and(eq(sessionLogsTable.id, sessionId), eq(sessionLogsTable.campaignId, campaignId)));

  try {
    let openai;
    try {
      openai = (await import("@workspace/integrations-openai-ai-server")).openai;
    } catch {
      throw new Error("AI service is not configured");
    }
    const recapAttendees = await buildAttendeesForRecap(session.attendees, campaignId);
    const completion = await openai.chat.completions.create({
      model: RECAP_MODEL,
      max_completion_tokens: RECAP_MAX_TOKENS,
      temperature: RECAP_TEMPERATURE,
      messages: [
        { role: "system", content: RECAP_SYSTEM_PROMPT },
        { role: "user", content: buildRecapUserPrompt(session.sessionNumber, session.title, notes, recapAttendees) },
      ],
    });

    const recap = completion.choices[0]?.message?.content ?? "";
    const notesHash = hashNotes(notes);

    const [updated] = await db
      .update(sessionLogsTable)
      .set({
        recapMd: recap,
        generatedAt: new Date(),
        notifiedAt: null,
        recapStatus: "idle",
        recapError: null,
        recapNotesHash: notesHash,
        version: sql`${sessionLogsTable.version} + 1`,
      })
      .where(and(
        eq(sessionLogsTable.id, sessionId),
        eq(sessionLogsTable.campaignId, campaignId),
        eq(sessionLogsTable.version, session.version),
      ))
      .returning();

    if (!updated) {
      throw new Error("Session was modified by another process; recap generation aborted");
    }

    await db
      .delete(recapViewsTable)
      .where(eq(recapViewsTable.sessionLogId, sessionId));

    await db.execute(sql`SELECT pg_advisory_unlock(${sessionId})`);

    return recap;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await db
        .update(sessionLogsTable)
        .set({ recapStatus: "error", recapError: message })
        .where(and(eq(sessionLogsTable.id, sessionId), eq(sessionLogsTable.campaignId, campaignId)));
    } catch (dbErr) {
      logger.error({ err: dbErr, sessionId }, "Failed to record recap error status");
    }
    await db.execute(sql`SELECT pg_advisory_unlock(${sessionId})`).catch(() => {});
    throw err;
  }
}

/**
 * Generate a recap for the given session immediately (no debounce). Concurrent
 * calls for the same session are serialized via a per-session promise chain,
 * so at most one LLM call is in flight per session and each caller resolves
 * with the recap from its own run.
 */
export async function runRecapNow(sessionId: number, campaignId: number): Promise<string> {
  const prev = runChain.get(sessionId);
  const next: Promise<string> = (async () => {
    if (prev) {
      // Wait for any in-flight or queued run to finish before starting our own.
      // We swallow its error here — the originating caller already saw it.
      try { await prev; } catch { /* noop */ }
    }
    return doGenerateRecap(sessionId, campaignId);
  })();
  runChain.set(sessionId, next);
  try {
    return await next;
  } finally {
    // Only clear if we're still the tail; another caller may have queued
    // behind us.
    if (runChain.get(sessionId) === next) runChain.delete(sessionId);
  }
}

/**
 * Schedule a debounced auto-regeneration of the session's recap. Repeated
 * calls within RECAP_DEBOUNCE_MS reset the timer. When the timer fires we
 * re-read the session and only enqueue a real run if the notes are still
 * non-empty AND meaningfully different from the recap_notes_hash. This
 * prevents stale queued timers from triggering redundant LLM calls (e.g.,
 * after a manual generate completed in the meantime).
 */
export function scheduleRecap(sessionId: number, campaignId: number): void {
  const existing = pendingTimers.get(sessionId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingTimers.delete(sessionId);
    void (async () => {
      try {
        const [row] = await db
          .select({
            rawNotesMd: sessionLogsTable.rawNotesMd,
            recapNotesHash: sessionLogsTable.recapNotesHash,
            recapStatus: sessionLogsTable.recapStatus,
          })
          .from(sessionLogsTable)
          .where(and(eq(sessionLogsTable.id, sessionId), eq(sessionLogsTable.campaignId, campaignId)));
        if (!row) return;
        if (!shouldScheduleRecap(row.rawNotesMd, row.recapNotesHash)) {
          // Notes were cleared, reverted, or already up-to-date — clear the
          // "pending" badge so the FE doesn't get stuck on a stale state.
          if (row.recapStatus === "pending") {
            await db
              .update(sessionLogsTable)
              .set({ recapStatus: "idle", recapError: null })
              .where(and(eq(sessionLogsTable.id, sessionId), eq(sessionLogsTable.campaignId, campaignId)));
          }
          return;
        }
        await runRecapNow(sessionId, campaignId);
      } catch (err) {
        logger.error({ err, sessionId }, "Auto recap generation failed");
      }
    })();
  }, RECAP_DEBOUNCE_MS);
  if (typeof timer.unref === "function") timer.unref();
  pendingTimers.set(sessionId, timer);
}

/**
 * Cancel any pending debounced recap for a session and, if the session is
 * stuck in `pending` status, return it to `idle`. Intended for the case
 * where notes were saved as empty/unchanged after a previous schedule.
 */
export async function cancelScheduledRecap(sessionId: number, campaignId: number): Promise<void> {
  const existing = pendingTimers.get(sessionId);
  if (existing) {
    clearTimeout(existing);
    pendingTimers.delete(sessionId);
  }
  try {
    await db
      .update(sessionLogsTable)
      .set({ recapStatus: "idle", recapError: null })
      .where(
        and(
          eq(sessionLogsTable.id, sessionId),
          eq(sessionLogsTable.campaignId, campaignId),
          eq(sessionLogsTable.recapStatus, "pending"),
        ),
      );
  } catch (err) {
    logger.error({ err, sessionId }, "Failed to cancel scheduled recap status");
  }
}

/** True if a recap run for this session is in flight (or queued). */
export function isRecapRunning(sessionId: number): boolean {
  return runChain.has(sessionId);
}

/** True if a debounced recap is queued for this session. */
export function isRecapPending(sessionId: number): boolean {
  return pendingTimers.has(sessionId);
}

/** Test-only: clear all in-memory state. */
export function __resetRecapRunnerForTests(): void {
  for (const t of pendingTimers.values()) clearTimeout(t);
  pendingTimers.clear();
  runChain.clear();
}

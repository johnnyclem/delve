import { describe, it, expect } from "vitest";
import { backoffMsForAttempt, MAX_INVITE_ATTEMPTS } from "./email";

describe("backoffMsForAttempt", () => {
  it("waits 60s between attempt 1 and 2", () => {
    expect(backoffMsForAttempt(1)).toBe(60_000);
  });

  it("waits 5 minutes between attempt 2 and 3", () => {
    expect(backoffMsForAttempt(2)).toBe(5 * 60_000);
  });

  it("clamps to the longest backoff for out-of-range counts", () => {
    expect(backoffMsForAttempt(99)).toBe(5 * 60_000);
  });

  it("treats zero/negative as the first interval (defensive)", () => {
    expect(backoffMsForAttempt(0)).toBe(60_000);
    expect(backoffMsForAttempt(-3)).toBe(60_000);
  });

  it("caps total attempts at 3", () => {
    expect(MAX_INVITE_ATTEMPTS).toBe(3);
  });
});

import { describe, it, expect } from "vitest";
import { generateOccurrenceDates } from "./calendar";

describe("generateOccurrenceDates", () => {
  it("default UTC: weekly is exactly +7 days per occurrence", () => {
    const start = new Date("2025-03-04T19:00:00Z");
    const until = new Date("2025-04-01T00:00:00Z");
    const dates = generateOccurrenceDates(start, "weekly", until);
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2025-03-04T19:00:00.000Z",
      "2025-03-11T19:00:00.000Z",
      "2025-03-18T19:00:00.000Z",
      "2025-03-25T19:00:00.000Z",
    ]);
  });

  it("America/New_York weekly keeps 7pm local across spring-forward DST boundary", () => {
    // 2025-03-04 19:00 EST = 2025-03-05 00:00 UTC
    // DST starts in US on 2025-03-09. After that, 19:00 EDT = 23:00 UTC.
    const start = new Date("2025-03-05T00:00:00Z");
    const until = new Date("2025-03-26T00:00:00Z");
    const dates = generateOccurrenceDates(start, "weekly", until, "America/New_York");
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2025-03-05T00:00:00.000Z", // Mar 4 19:00 EST
      "2025-03-11T23:00:00.000Z", // Mar 11 19:00 EDT
      "2025-03-18T23:00:00.000Z", // Mar 18 19:00 EDT
      "2025-03-25T23:00:00.000Z", // Mar 25 19:00 EDT
    ]);
  });

  it("America/New_York weekly keeps 7pm local across fall-back DST boundary", () => {
    // 2025-10-28 19:00 EDT = 2025-10-28 23:00 UTC
    // DST ends 2025-11-02. After that, 19:00 EST = 00:00 UTC next day.
    const start = new Date("2025-10-28T23:00:00Z");
    const until = new Date("2025-11-19T00:00:00Z");
    const dates = generateOccurrenceDates(start, "weekly", until, "America/New_York");
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2025-10-28T23:00:00.000Z", // Oct 28 19:00 EDT
      "2025-11-05T00:00:00.000Z", // Nov 4 19:00 EST
      "2025-11-12T00:00:00.000Z", // Nov 11 19:00 EST
      "2025-11-19T00:00:00.000Z", // Nov 18 19:00 EST
    ]);
  });

  it("biweekly steps every 14 local days", () => {
    const start = new Date("2025-03-05T00:00:00Z");
    const until = new Date("2025-04-30T23:59:59Z");
    const dates = generateOccurrenceDates(start, "biweekly", until, "America/New_York");
    expect(dates).toHaveLength(5);
    // First post-DST should still be 19:00 local two weeks later.
    expect(dates[1].toISOString()).toBe("2025-03-18T23:00:00.000Z");
  });

  it("monthly clamps to last valid day of target month", () => {
    const start = new Date("2025-01-31T15:00:00Z");
    const until = new Date("2025-04-30T23:59:59Z");
    const dates = generateOccurrenceDates(start, "monthly", until, "UTC");
    expect(dates.map((d) => d.toISOString())).toEqual([
      "2025-01-31T15:00:00.000Z",
      "2025-02-28T15:00:00.000Z",
      "2025-03-31T15:00:00.000Z",
      "2025-04-30T15:00:00.000Z",
    ]);
  });

  it("respects MAX_OCCURRENCES cap of 26", () => {
    const start = new Date("2025-01-01T12:00:00Z");
    const until = new Date("2030-01-01T00:00:00Z");
    const dates = generateOccurrenceDates(start, "weekly", until);
    expect(dates).toHaveLength(26);
  });

  it("falls back to UTC behavior when timezone arg omitted", () => {
    const start = new Date("2025-03-04T19:00:00Z");
    const until = new Date("2025-03-30T00:00:00Z");
    const a = generateOccurrenceDates(start, "weekly", until);
    const b = generateOccurrenceDates(start, "weekly", until, "UTC");
    expect(a.map((d) => d.toISOString())).toEqual(b.map((d) => d.toISOString()));
  });
});

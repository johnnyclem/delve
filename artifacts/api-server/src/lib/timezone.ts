const VALID_TZ_CACHE = new Map<string, boolean>();

export function isValidTimeZone(tz: string): boolean {
  const cached = VALID_TZ_CACHE.get(tz);
  if (cached !== undefined) return cached;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    VALID_TZ_CACHE.set(tz, true);
    return true;
  } catch {
    VALID_TZ_CACHE.set(tz, false);
    return false;
  }
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function getZonedParts(date: Date, tz: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/**
 * Convert a "naive" local wall-clock datetime in the given IANA tz to a UTC Date.
 * Iteratively corrects for the zone's UTC offset (handles DST). For ambiguous
 * (fall-back) or non-existent (spring-forward) times the result lands on a
 * deterministic, valid neighbouring instant.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  tz: string,
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let utcGuess = target;
  for (let i = 0; i < 3; i++) {
    const parts = getZonedParts(new Date(utcGuess), tz);
    const got = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const diff = got - target;
    if (diff === 0) break;
    utcGuess -= diff;
  }
  return new Date(utcGuess);
}

/**
 * Format a Date in the given IANA tz, including the localized timezone
 * abbreviation (e.g. "EST", "PDT") so recipients can disambiguate.
 */
export function formatInZone(
  date: Date,
  tz: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
): string {
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: tz,
    timeZoneName: "short",
  }).format(date);
}

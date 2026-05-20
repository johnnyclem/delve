import { logger } from "./logger";

export function runPreflightChecks(): void {
  let hasError = false;

  const rsvp = process.env.RSVP_SECRET;
  const unsubscribe = process.env.UNSUBSCRIBE_SECRET;

  if (!rsvp) {
    logger.error("[preflight] RSVP_SECRET is not set");
    hasError = true;
  }
  if (!unsubscribe) {
    logger.error("[preflight] UNSUBSCRIBE_SECRET is not set");
    hasError = true;
  }
  if (rsvp && unsubscribe && rsvp === unsubscribe) {
    logger.error("[preflight] RSVP_SECRET and UNSUBSCRIBE_SECRET must be different values");
    hasError = true;
  }

  if (hasError) {
    process.exit(1);
  }

  logger.info("[preflight] all checks passed");
}

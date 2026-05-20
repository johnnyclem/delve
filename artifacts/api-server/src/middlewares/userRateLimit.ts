import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { logger } from "../lib/logger";

const ONE_MINUTE = 60 * 1000;

export const userRateLimit = (limit: number, windowMs: number = ONE_MINUTE) =>
  rateLimit({
    windowMs,
    max: limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req: Request): string => {
      const userId = (req as Record<string, unknown>).userId;
      if (typeof userId === "string") return `user:${userId}`;
      return `ip:${req.ip ?? "unknown"}`;
    },
    handler: (req, res) => {
      logger.warn(
        { userId: (req as Record<string, unknown>).userId, path: req.path, method: req.method },
        "User rate limit exceeded",
      );
      res.status(429).json({ error: "Too many requests. Please wait and try again." });
    },
  });

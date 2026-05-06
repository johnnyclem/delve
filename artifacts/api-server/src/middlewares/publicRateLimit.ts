import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import type { Request, Response } from "express";
import { logger } from "../lib/logger";

const ONE_MINUTE = 60 * 1000;

function jsonHandler(message: string) {
  return (req: Request, res: Response) => {
    logger.warn(
      { ip: req.ip, path: req.path, method: req.method },
      "Rate limit exceeded",
    );
    res.status(429).json({ error: message });
  };
}

function htmlHandler(message: string) {
  return (req: Request, res: Response) => {
    logger.warn(
      { ip: req.ip, path: req.path, method: req.method },
      "Rate limit exceeded",
    );
    res
      .status(429)
      .type("html")
      .send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Too many requests</title></head><body style="margin:0;padding:80px 20px;background:#09090B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#FAFAFA;text-align:center;"><h1 style="font-size:22px;font-weight:600;">Too many requests</h1><p style="color:#A1A1AA;font-size:14px;">${message}</p></body></html>`,
      );
  };
}

const baseOptions: Partial<Options> = {
  windowMs: ONE_MINUTE,
  standardHeaders: "draft-7",
  legacyHeaders: false,
};

export const publicIpRateLimit = rateLimit({
  ...baseOptions,
  limit: 30,
  handler: htmlHandler("You're clicking too quickly. Please wait a minute and try again."),
});

export const publicIpJsonRateLimit = rateLimit({
  ...baseOptions,
  limit: 30,
  handler: jsonHandler("Too many requests. Please wait a minute and try again."),
});

export const rsvpTokenRateLimit = rateLimit({
  ...baseOptions,
  limit: 10,
  keyGenerator: (req: Request): string => {
    const tokenRaw = req.params.token;
    const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
    if (token) return `rsvp-token:${token}`;
    return `rsvp-ip:${ipKeyGenerator(req.ip ?? "")}`;
  },
  handler: htmlHandler("This RSVP link has been used too many times in a short period. Please wait a minute."),
});

export const unsubscribeTokenRateLimit = rateLimit({
  ...baseOptions,
  limit: 10,
  keyGenerator: (req: Request): string => {
    const token =
      (typeof req.query.token === "string" ? req.query.token : "") ||
      (typeof req.body?.token === "string" ? req.body.token : "");
    if (token) return `unsub-token:${token}`;
    return `unsub-ip:${ipKeyGenerator(req.ip ?? "")}`;
  },
  handler: (req, res) => {
    logger.warn(
      { ip: req.ip, path: req.path, method: req.method },
      "Rate limit exceeded",
    );
    if (req.method === "POST") {
      res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
    } else {
      htmlHandler("This unsubscribe link has been used too many times in a short period. Please wait a minute.")(req, res);
    }
  },
});

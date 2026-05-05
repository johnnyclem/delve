import { createHmac, timingSafeEqual } from "node:crypto";

function getSecret(): string {
  const secret =
    process.env.UNSUBSCRIBE_SECRET ??
    process.env.CLERK_SECRET_KEY ??
    process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "No secret available for unsubscribe token signing (set UNSUBSCRIBE_SECRET)",
    );
  }
  return secret;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Buffer {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payload: string): string {
  return base64UrlEncode(
    createHmac("sha256", getSecret()).update(payload).digest(),
  );
}

export function generateUnsubscribeToken(
  campaignId: number,
  userId: string,
): string {
  const payload = base64UrlEncode(
    Buffer.from(JSON.stringify({ c: campaignId, u: userId })),
  );
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyUnsubscribeToken(
  token: string,
): { campaignId: number; userId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const decoded = JSON.parse(base64UrlDecode(payload).toString("utf8")) as {
      c?: unknown;
      u?: unknown;
    };
    if (typeof decoded.c !== "number" || typeof decoded.u !== "string") {
      return null;
    }
    return { campaignId: decoded.c, userId: decoded.u };
  } catch {
    return null;
  }
}

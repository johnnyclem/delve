import express, { type Express, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { v4 as uuidv4 } from "uuid";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the first proxy hop (Replit's edge proxy) so req.ip reflects the
// real client address. Required for express-rate-limit's per-IP keying on
// public endpoints like /api/rsvp/:token and /api/unsubscribe.
app.set("trust proxy", 1);

// Attach a unique request ID to every request for log correlation.
app.use((req, _res, next) => {
  (req as Record<string, unknown>).id = uuidv4();
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://img.clerk.com"],
        connectSrc: ["'self'", "https://*.clerk.accounts.dev"],
      },
    },
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(
  cors({
    credentials: true,
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.ALLOWED_ORIGINS
          ? process.env.ALLOWED_ORIGINS.split(",")
              .map((o) => o.trim())
              .filter(Boolean)
          : false
        : true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Resolve the publishable key from the incoming request host so the backend
// validates session JWTs against the same Clerk tenant the frontend talked to
// via the proxy. Without this, every authenticated route returns 401 in
// production because the issuer/audience on the JWT (proxy URL) doesn't match
// what clerkMiddleware() defaults to (Clerk's own frontend-api domain).
const clerkMiddlewareByHost = new Map<string, RequestHandler>();
app.use((req, res, next) => {
  const host = getClerkProxyHost(req) ?? "";
  let handler = clerkMiddlewareByHost.get(host);
  if (!handler) {
    const publishableKey = publishableKeyFromHost(
      host,
      process.env.CLERK_PUBLISHABLE_KEY,
    );
    handler = clerkMiddleware({ publishableKey });
    clerkMiddlewareByHost.set(host, handler);
  }
  return handler(req, res, next);
});

app.use("/api", router);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;

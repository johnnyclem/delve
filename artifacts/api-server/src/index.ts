import app from "./app";
import { logger } from "./lib/logger";
import { runPreflightChecks } from "./lib/preflight";
import { startInviteRetryScheduler } from "./lib/email";
import { startEmbeddingRetryScheduler } from "./lib/embeddingRetry";
import { runSchemaHealthCheck } from "./lib/schemaHealthCheck";

runPreflightChecks();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function bootstrap() {
  try {
    await runSchemaHealthCheck();
  } catch (err) {
    logger.error({ err }, "Schema health check failed to run");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startInviteRetryScheduler();
    startEmbeddingRetryScheduler();
  });
}

void bootstrap();

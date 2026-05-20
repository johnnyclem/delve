CREATE TABLE "failed_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"error" text NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_failed_embeddings_entity" ON "failed_embeddings" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "idx_failed_embeddings_campaign" ON "failed_embeddings" USING btree ("campaign_id");
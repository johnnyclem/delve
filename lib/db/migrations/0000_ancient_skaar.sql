CREATE TYPE "public"."entity_kind" AS ENUM('npc', 'quest', 'location', 'story_beat', 'mob_encounter', 'plot_twist', 'faction', 'item_unique');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"world_name" text,
	"dm_user_id" text NOT NULL,
	"invite_code" text DEFAULT 'CHANGEME' NOT NULL,
	"house_rules_share_token" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"homebrew_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_edition" text DEFAULT '2024' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"email_notifications" boolean DEFAULT false NOT NULL,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"race" text NOT NULL,
	"class" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"sheet_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"portrait_url" text,
	"relationship_tags" text[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"session_number" integer NOT NULL,
	"title" text NOT NULL,
	"played_at" timestamp with time zone,
	"raw_notes_md" text,
	"recap_md" text,
	"generated_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"attendees" jsonb,
	"recap_status" text DEFAULT 'idle' NOT NULL,
	"recap_error" text,
	"recap_notes_hash" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"title" text NOT NULL,
	"proposed_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"status" text DEFAULT 'proposed' NOT NULL,
	"location" text,
	"series_id" text,
	"recurrence_rule" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rsvps" (
	"id" serial PRIMARY KEY NOT NULL,
	"calendar_event_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'maybe' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dice_rolls" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"character_id" integer,
	"user_id" text NOT NULL,
	"expression" text NOT NULL,
	"result" integer NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"label" text,
	"display_name" text NOT NULL,
	"rolled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recap_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_log_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_log_id" integer,
	"calendar_event_id" integer,
	"campaign_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"recipient_name" text NOT NULL,
	"email" text,
	"channel" text DEFAULT 'email' NOT NULL,
	"kind" text DEFAULT 'recap' NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"error_message" text,
	"provider_message_id" text,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maps" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"rows" integer NOT NULL,
	"cols" integer NOT NULL,
	"tiles_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "npc_dialogue_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"npc_id" integer NOT NULL,
	"topic" text NOT NULL,
	"line" text NOT NULL,
	"dm_only" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "npcs" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"name" text NOT NULL,
	"short_note" text,
	"avatar_url" text,
	"relationship_tags" text[] DEFAULT '{}' NOT NULL,
	"archetype_key" text,
	"occupation" text,
	"suggested_class" text,
	"backstory_md" text,
	"public_motive" text,
	"secret_motive" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition" text NOT NULL,
	"entity_slug" text NOT NULL,
	"entity_kind" text NOT NULL,
	"section" text,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"source_url" text,
	"content_hash" text NOT NULL,
	"embedding" halfvec(1536),
	"tsv" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monster_images" (
	"slug" text PRIMARY KEY NOT NULL,
	"object_path" text NOT NULL,
	"prompt" text NOT NULL,
	"model" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"kind" "entity_kind" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"public_md" text,
	"dm_notes" text,
	"secret_md" text,
	"true_motivation" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"revealed_at" timestamp with time zone,
	"revealed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_reveal_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"diff" jsonb
);
--> statement-breakpoint
CREATE TABLE "campaign_entity_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"source_field" text NOT NULL,
	"body_md" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" halfvec(1536),
	"tsv" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homebrew_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"embedding" halfvec(1536),
	"tsv" "tsvector",
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"summary" text,
	"speaking_as_character_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvps" ADD CONSTRAINT "rsvps_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dice_rolls" ADD CONSTRAINT "dice_rolls_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recap_views" ADD CONSTRAINT "recap_views_session_log_id_session_logs_id_fk" FOREIGN KEY ("session_log_id") REFERENCES "public"."session_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_session_log_id_session_logs_id_fk" FOREIGN KEY ("session_log_id") REFERENCES "public"."session_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_dialogue_lines" ADD CONSTRAINT "npc_dialogue_lines_npc_id_npcs_id_fk" FOREIGN KEY ("npc_id") REFERENCES "public"."npcs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_entities" ADD CONSTRAINT "campaign_entities_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_reveal_audit" ADD CONSTRAINT "entity_reveal_audit_entity_id_campaign_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."campaign_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_entity_chunks" ADD CONSTRAINT "campaign_entity_chunks_entity_id_campaign_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."campaign_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homebrew_rules" ADD CONSTRAINT "homebrew_rules_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_speaking_as_character_id_characters_id_fk" FOREIGN KEY ("speaking_as_character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_campaigns_house_rules_share_token" ON "campaigns" USING btree ("house_rules_share_token");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_campaign_member" ON "campaign_members" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_calendar_events_series" ON "calendar_events" USING btree ("series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_recap_view" ON "recap_views" USING btree ("session_log_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_notification_logs_session" ON "notification_logs" USING btree ("session_log_id");--> statement-breakpoint
CREATE INDEX "idx_notification_logs_campaign" ON "notification_logs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_notification_logs_event" ON "notification_logs" USING btree ("calendar_event_id");--> statement-breakpoint
CREATE INDEX "idx_maps_campaign" ON "maps" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_npc_dialogue_lines_npc" ON "npc_dialogue_lines" USING btree ("npc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_chunks_edition_slug_kind_hash_unique" ON "reference_chunks" USING btree ("edition","entity_slug","entity_kind","content_hash");--> statement-breakpoint
CREATE INDEX "reference_chunks_edition_kind_slug_idx" ON "reference_chunks" USING btree ("edition","entity_kind","entity_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_campaign_entity_slug" ON "campaign_entities" USING btree ("campaign_id","kind","slug");--> statement-breakpoint
CREATE INDEX "idx_campaign_entities_kind" ON "campaign_entities" USING btree ("campaign_id","kind");--> statement-breakpoint
CREATE INDEX "idx_campaign_entities_revealed" ON "campaign_entities" USING btree ("campaign_id") WHERE "campaign_entities"."revealed" = true;--> statement-breakpoint
CREATE INDEX "idx_entity_audit_campaign" ON "entity_reveal_audit" USING btree ("campaign_id","at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_campaign_entity_chunks_eid_field_hash" ON "campaign_entity_chunks" USING btree ("entity_id","source_field","content_hash");--> statement-breakpoint
CREATE INDEX "idx_campaign_entity_chunks_campaign_field" ON "campaign_entity_chunks" USING btree ("campaign_id","source_field");--> statement-breakpoint
CREATE INDEX "idx_campaign_entity_chunks_entity" ON "campaign_entity_chunks" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "idx_homebrew_rules_campaign_active" ON "homebrew_rules" USING btree ("campaign_id","active");--> statement-breakpoint
CREATE INDEX "idx_chat_messages_thread" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_threads_campaign_user" ON "chat_threads" USING btree ("campaign_id","user_id");
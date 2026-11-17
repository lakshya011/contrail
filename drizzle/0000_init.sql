CREATE TABLE "airlines" (
	"iata" text PRIMARY KEY NOT NULL,
	"icao" text,
	"name" text NOT NULL,
	"country" text
);
--> statement-breakpoint
CREATE TABLE "airports" (
	"iata" text PRIMARY KEY NOT NULL,
	"icao" text,
	"name" text NOT NULL,
	"city" text,
	"country" text NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"tz" text
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"gmail_id" text NOT NULL,
	"thread_id" text,
	"date" timestamp with time zone,
	"from_addr" text,
	"subject" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"parser" text,
	"email_kind" text,
	"prompt_version" integer,
	"error" text,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "flight_sources" (
	"flight_id" text NOT NULL,
	"email_message_id" integer NOT NULL,
	"kind" text,
	CONSTRAINT "flight_sources_flight_id_email_message_id_pk" PRIMARY KEY("flight_id","email_message_id")
);
--> statement-breakpoint
CREATE TABLE "flights" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"airline_iata" text,
	"airline_name" text,
	"flight_number" text NOT NULL,
	"dep_iata" text NOT NULL,
	"arr_iata" text NOT NULL,
	"dep_date" text NOT NULL,
	"sched_dep_local" text,
	"sched_arr_local" text,
	"sched_dep_utc" timestamp with time zone,
	"sched_arr_utc" timestamp with time zone,
	"actual_dep_utc" timestamp with time zone,
	"actual_arr_utc" timestamp with time zone,
	"aircraft_type" text,
	"tail_number" text,
	"seat" text,
	"cabin" text,
	"pnr" text,
	"passenger_name" text,
	"for_others" boolean DEFAULT false NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"status_email_at" timestamp with time zone,
	"times_email_at" timestamp with time zone,
	"distance_km" real,
	"duration_min" integer,
	"confidence" real,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"user_confirmed" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'email' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gmail_sync" (
	"user_id" text PRIMARY KEY NOT NULL,
	"backfill_page_token" text,
	"backfill_listed" boolean DEFAULT false NOT NULL,
	"last_list_started_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "passenger_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"google_refresh_token" text,
	"home_airport" text,
	"units" text DEFAULT 'km' NOT NULL,
	"include_others" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_sources" ADD CONSTRAINT "flight_sources_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_sources" ADD CONSTRAINT "flight_sources_email_message_id_email_messages_id_fk" FOREIGN KEY ("email_message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flights" ADD CONSTRAINT "flights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_sync" ADD CONSTRAINT "gmail_sync_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passenger_aliases" ADD CONSTRAINT "passenger_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_user_gmail_idx" ON "email_messages" USING btree ("user_id","gmail_id");--> statement-breakpoint
CREATE INDEX "email_messages_status_idx" ON "email_messages" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "flights_dedupe_idx" ON "flights" USING btree ("user_id","flight_number","dep_date","dep_iata");--> statement-breakpoint
CREATE INDEX "flights_user_dep_idx" ON "flights" USING btree ("user_id","dep_date");--> statement-breakpoint
CREATE INDEX "passenger_aliases_user_idx" ON "passenger_aliases" USING btree ("user_id");
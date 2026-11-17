ALTER TABLE "flights" ADD COLUMN "operating_airline_iata" text;--> statement-breakpoint
ALTER TABLE "flights" ADD COLUMN "operating_airline_name" text;--> statement-breakpoint
ALTER TABLE "flights" ADD COLUMN "codeshare_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL;
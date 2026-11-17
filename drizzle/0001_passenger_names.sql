ALTER TABLE "flights" ADD COLUMN "passenger_names" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "flights" SET "passenger_names" = jsonb_build_array("passenger_name") WHERE "passenger_name" IS NOT NULL;

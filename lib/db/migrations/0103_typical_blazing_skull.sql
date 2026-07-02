ALTER TABLE "appointment" ADD COLUMN "confirm_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_confirm_token_idx" ON "appointment" USING btree ("confirm_token");
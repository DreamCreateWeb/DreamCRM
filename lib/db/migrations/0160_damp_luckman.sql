-- Close the appointment-reminder double-send window.
--
-- STEP 1 (hand-written, must run first): de-duplicate what the bug already
-- produced. Migrations auto-apply on boot, so a unique index that fails to
-- build takes the whole deploy down — and the rows it would trip over are
-- exactly the duplicates this migration exists to prevent.
--
-- Scoped to precisely the rows the new index covers, and each exclusion is
-- load-bearing: staff drawer sends carry `sent_by_user_id` and may legitimately
-- repeat; ad-hoc sends carry a NULL template; and FORMS nudges are excluded by
-- name because their idempotency is a 48-hour WINDOW rather than a row — PMS
-- sync moves an appointment's start_time in place, so a visit pushed a week out
-- comes back around and a patient who still hasn't filled the form is
-- legitimately nudged again. Deleting those would be deleting real history.
--
-- Which row survives: one that already carries downstream state (a delivery
-- receipt or a patient reply stamped onto it) first, then the earliest send —
-- the one the patient actually got. The rest were never distinct events, only
-- extra records of the same reminder going out more than once.
DELETE FROM "appointment_reminder_log" a
USING (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "appointment_id", "template"
			ORDER BY
				("delivered_at" IS NOT NULL OR "replied_at" IS NOT NULL) DESC,
				"sent_at" ASC,
				"id" ASC
		) AS rn
	FROM "appointment_reminder_log"
	WHERE "sent_by_user_id" IS NULL
		AND "template" IS NOT NULL
		AND "template" <> 'forms_intake'
) dup
WHERE a."id" = dup."id" AND dup.rn > 1;--> statement-breakpoint
-- STEP 2 (drizzle-generated): the guard itself.
CREATE UNIQUE INDEX "appt_reminder_auto_touch_uq" ON "appointment_reminder_log" USING btree ("appointment_id","template") WHERE "appointment_reminder_log"."sent_by_user_id" is null and "appointment_reminder_log"."template" is not null and "appointment_reminder_log"."template" <> 'forms_intake';

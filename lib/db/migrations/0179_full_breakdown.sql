-- The Full breakdown (2026-10-08): `insurance_verification.billed_checks` —
-- how many payer checks a row cost. A plain check is one; a Full breakdown
-- is ONE row (the merged answer and its receipt) that may have asked the
-- payer several times. The monthly allowance now SUMS this column rather
-- than counting rows, so a breakdown is billed honestly. Default 1 so
-- every existing row keeps counting as the one check it was.
ALTER TABLE "insurance_verification" ADD COLUMN "billed_checks" integer DEFAULT 1 NOT NULL;
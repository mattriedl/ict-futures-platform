-- USD point value captured at entry (FX pairs converted from the quote currency).
-- Nullable: existing trades keep using the instrument's configured point value.
ALTER TABLE "DemoTrade" ADD COLUMN "pointValue" DOUBLE PRECISION;

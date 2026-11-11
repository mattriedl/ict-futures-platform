-- New default thresholds for the ICT scoring model (calibrated with backtests).
-- Only affects rows created from now on; existing users keep their settings.
ALTER TABLE "UserSettings" ALTER COLUMN "alertMinScore" SET DEFAULT 50;
ALTER TABLE "UserSettings" ALTER COLUMN "autoTradeMinScore" SET DEFAULT 70;

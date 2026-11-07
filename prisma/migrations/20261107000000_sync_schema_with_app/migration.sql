-- AlterTable
ALTER TABLE "DemoTrade" ADD COLUMN     "dataSource" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "margin" DOUBLE PRECISION,
ADD COLUMN     "pendingApproach" TEXT;

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "autoTradeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoTradeMinScore" DOUBLE PRECISION NOT NULL DEFAULT 75,
ADD COLUMN     "enforceDrawdown" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leverageCrypto" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "leverageForex" DOUBLE PRECISION NOT NULL DEFAULT 30,
ADD COLUMN     "leverageFutures" DOUBLE PRECISION NOT NULL DEFAULT 10,
ADD COLUMN     "maxDailyLossPercent" DOUBLE PRECISION NOT NULL DEFAULT 4,
ADD COLUMN     "maxOverallDrawdownPercent" DOUBLE PRECISION NOT NULL DEFAULT 6,
ADD COLUMN     "riskPercent" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "SetupLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "symbol" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "bias" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "aiScore" DOUBLE PRECISION NOT NULL,
    "confluences" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION,
    "stopLoss" DOUBLE PRECISION,
    "takeProfit" DOUBLE PRECISION,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "demoTradeId" TEXT,
    "outcome" TEXT,
    "rMultiple" DOUBLE PRECISION,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SetupLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SetupLog_assetClass_timeframe_idx" ON "SetupLog"("assetClass", "timeframe");

-- CreateIndex
CREATE INDEX "SetupLog_outcome_idx" ON "SetupLog"("outcome");

-- CreateIndex
CREATE INDEX "SetupLog_userId_symbol_direction_idx" ON "SetupLog"("userId", "symbol", "direction");

-- CreateIndex
CREATE INDEX "SetupLog_detectedAt_idx" ON "SetupLog"("detectedAt");


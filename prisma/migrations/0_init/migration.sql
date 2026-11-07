-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'CME',
    "tickSize" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "pointValue" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectedPattern" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "patternType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "priceLevel" DOUBLE PRECISION NOT NULL,
    "upperBound" DOUBLE PRECISION,
    "lowerBound" DOUBLE PRECISION,
    "description" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "outcome" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DetectedPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeSetup" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfit" DOUBLE PRECISION NOT NULL,
    "riskReward" DOUBLE PRECISION NOT NULL,
    "aiScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confluences" TEXT NOT NULL,
    "explanation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "outcome" TEXT,
    "pnl" DOUBLE PRECISION,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "aiScore" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatternOutcome" (
    "id" TEXT NOT NULL,
    "patternType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "instrumentSymbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "confluences" TEXT,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "exitPrice" DOUBLE PRECISION,
    "outcome" TEXT NOT NULL,
    "pnlPercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatternOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshInterval" INTEGER NOT NULL DEFAULT 60,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "trackedSymbols" TEXT NOT NULL DEFAULT 'ES=F,NQ=F,CL=F,GC=F',
    "alertMinScore" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "alertOnOB" BOOLEAN NOT NULL DEFAULT true,
    "alertOnFVG" BOOLEAN NOT NULL DEFAULT true,
    "alertOnLiqSweep" BOOLEAN NOT NULL DEFAULT true,
    "alertOnMSS" BOOLEAN NOT NULL DEFAULT true,
    "alertOnOTE" BOOLEAN NOT NULL DEFAULT true,
    "notificationsOn" BOOLEAN NOT NULL DEFAULT true,
    "emailAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "alertEmail" TEXT,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Demo Account',
    "startingBalance" DOUBLE PRECISION NOT NULL DEFAULT 100000,
    "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 100000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoTrade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrumentId" TEXT,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfit" DOUBLE PRECISION NOT NULL,
    "positionSize" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "riskReward" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiScore" DOUBLE PRECISION,
    "confluences" TEXT,
    "timeframe" TEXT NOT NULL DEFAULT '15m',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "outcome" TEXT,
    "exitPrice" DOUBLE PRECISION,
    "pnl" DOUBLE PRECISION,
    "pnlPercent" DOUBLE PRECISION,
    "rMultiple" DOUBLE PRECISION,
    "notes" TEXT,
    "tradeSetupId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "requiredConfluences" TEXT NOT NULL DEFAULT '[]',
    "minAiScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskPerTrade" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "config" TEXT,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgRR" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitFactor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netR" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPnlPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxDrawdownPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "equityCurve" TEXT NOT NULL DEFAULT '[]',
    "trades" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "defaultStartingBalance" DOUBLE PRECISION NOT NULL DEFAULT 100000,
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "backtestingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "oneClickTradingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "siteName" TEXT NOT NULL DEFAULT 'ICT Futures',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_symbol_key" ON "Instrument"("symbol");

-- CreateIndex
CREATE INDEX "PriceSnapshot_instrumentId_timeframe_idx" ON "PriceSnapshot"("instrumentId", "timeframe");

-- CreateIndex
CREATE INDEX "PriceSnapshot_timestamp_idx" ON "PriceSnapshot"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSnapshot_instrumentId_timeframe_timestamp_key" ON "PriceSnapshot"("instrumentId", "timeframe", "timestamp");

-- CreateIndex
CREATE INDEX "DetectedPattern_instrumentId_patternType_idx" ON "DetectedPattern"("instrumentId", "patternType");

-- CreateIndex
CREATE INDEX "DetectedPattern_detectedAt_idx" ON "DetectedPattern"("detectedAt");

-- CreateIndex
CREATE INDEX "DetectedPattern_resolved_idx" ON "DetectedPattern"("resolved");

-- CreateIndex
CREATE INDEX "TradeSetup_instrumentId_idx" ON "TradeSetup"("instrumentId");

-- CreateIndex
CREATE INDEX "TradeSetup_status_idx" ON "TradeSetup"("status");

-- CreateIndex
CREATE INDEX "TradeSetup_aiScore_idx" ON "TradeSetup"("aiScore");

-- CreateIndex
CREATE INDEX "Alert_userId_status_idx" ON "Alert"("userId", "status");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");

-- CreateIndex
CREATE INDEX "PatternOutcome_patternType_outcome_idx" ON "PatternOutcome"("patternType", "outcome");

-- CreateIndex
CREATE INDEX "PatternOutcome_instrumentSymbol_idx" ON "PatternOutcome"("instrumentSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoAccount_userId_key" ON "DemoAccount"("userId");

-- CreateIndex
CREATE INDEX "DemoTrade_userId_status_idx" ON "DemoTrade"("userId", "status");

-- CreateIndex
CREATE INDEX "DemoTrade_symbol_idx" ON "DemoTrade"("symbol");

-- CreateIndex
CREATE INDEX "DemoTrade_openedAt_idx" ON "DemoTrade"("openedAt");

-- CreateIndex
CREATE INDEX "BacktestRun_userId_createdAt_idx" ON "BacktestRun"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectedPattern" ADD CONSTRAINT "DetectedPattern_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeSetup" ADD CONSTRAINT "TradeSetup_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoAccount" ADD CONSTRAINT "DemoAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoTrade" ADD CONSTRAINT "DemoTrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoTrade" ADD CONSTRAINT "DemoTrade_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestRun" ADD CONSTRAINT "BacktestRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


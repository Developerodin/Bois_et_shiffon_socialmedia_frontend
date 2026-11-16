-- AI models and tiers move from code to the database (Settings → AI models, platform admins only).

-- CreateEnum
CREATE TYPE "AiTierName" AS ENUM ('heavy', 'medium', 'light');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AiModel" (
    "name" TEXT NOT NULL,
    "inputUsdPerM" DECIMAL(10,4) NOT NULL,
    "cachedUsdPerM" DECIMAL(10,4) NOT NULL,
    "outputUsdPerM" DECIMAL(10,4) NOT NULL,
    "cacheBreakpoints" BOOLEAN NOT NULL DEFAULT true,
    "evalCandidate" BOOLEAN NOT NULL DEFAULT false,
    "judgeRank" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "AiModel_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "AiTier" (
    "tier" "AiTierName" NOT NULL,
    "model" TEXT NOT NULL,
    "backup" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "AiTier_pkey" PRIMARY KEY ("tier")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiModel_judgeRank_key" ON "AiModel"("judgeRank");

-- AddForeignKey
ALTER TABLE "AiTier" ADD CONSTRAINT "AiTier_model_fkey" FOREIGN KEY ("model") REFERENCES "AiModel"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTier" ADD CONSTRAINT "AiTier_backup_fkey" FOREIGN KEY ("backup") REFERENCES "AiModel"("name") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The values that were in server/ai/models.ts and scripts/evals/run.ts on 2026-10-29: OpenAI list prices (USD per 1M
-- tokens: input, cached input, output) read that day, the three tiers chosen by the 2026-10-29 comparison, and the
-- test set's candidates and judges. From here on they're changed in the app, not in code.
INSERT INTO "AiModel" ("name", "inputUsdPerM", "cachedUsdPerM", "outputUsdPerM", "cacheBreakpoints", "evalCandidate", "judgeRank", "updatedAt", "updatedBy") VALUES
  ('gpt-6-astra',   10,    1,     50,   true,  false, 1,    now(), 'migration'),
  ('gpt-6.1-sol',   2,     0.1,   10,   true,  true,  NULL, now(), 'migration'),
  ('gpt-6.1-terra', 1,     0.05,  5,    true,  true,  NULL, now(), 'migration'),
  ('gpt-6-sol',     2,     0.2,   10,   true,  false, NULL, now(), 'migration'),
  ('gpt-6-luna',    0.1,   0.01,  0.5,  true,  true,  NULL, now(), 'migration'),
  ('gpt-5.6-sol',   4,     0.4,   20,   true,  false, NULL, now(), 'migration'),
  ('gpt-5.6-terra', 2,     0.2,   12,   true,  false, NULL, now(), 'migration'),
  ('gpt-5.6-luna',  0.2,   0.02,  1.2,  true,  false, NULL, now(), 'migration'),
  ('gpt-5.5',       5,     0.5,   30,   false, false, 2,    now(), 'migration'),
  ('gpt-5.4',       2.5,   0.25,  15,   false, false, NULL, now(), 'migration'),
  ('gpt-5.4-mini',  0.75,  0.075, 4.5,  false, false, NULL, now(), 'migration'),
  ('gpt-5.4-nano',  0.2,   0.02,  1.25, false, false, NULL, now(), 'migration'),
  ('gpt-5-mini',    0.25,  0.025, 2,    false, false, NULL, now(), 'migration'),
  ('gpt-5-nano',    0.05,  0.005, 0.4,  false, false, NULL, now(), 'migration'),
  ('gpt-4.1',       2,     0.5,   8,    false, false, NULL, now(), 'migration'),
  ('gpt-4.1-mini',  0.4,   0.1,   1.6,  false, false, NULL, now(), 'migration'),
  ('gpt-4.1-nano',  0.1,   0.025, 0.4,  false, false, NULL, now(), 'migration');

INSERT INTO "AiTier" ("tier", "model", "backup", "updatedAt", "updatedBy") VALUES
  ('heavy',  'gpt-6.1-sol',   'gpt-6-sol',     now(), 'migration'),
  ('medium', 'gpt-6.1-terra', 'gpt-6.1-sol',   now(), 'migration'),
  ('light',  'gpt-6-luna',    'gpt-6.1-terra', now(), 'migration');

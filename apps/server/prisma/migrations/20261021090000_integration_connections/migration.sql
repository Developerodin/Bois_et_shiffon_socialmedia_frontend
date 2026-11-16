-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('META', 'INSTAGRAM', 'THREADS', 'GOOGLE', 'REDDIT');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'ERROR', 'REVOKED');

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "scopes" TEXT[],
    "encryptedCredentials" TEXT,
    "credentialKeyVersion" INTEGER NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "connectedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthStateTransaction" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthStateTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationConnection_workspaceId_brandId_idx" ON "IntegrationConnection"("workspaceId", "brandId");

-- CreateIndex
CREATE INDEX "IntegrationConnection_status_tokenExpiresAt_idx" ON "IntegrationConnection"("status", "tokenExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_brandId_provider_externalAccountId_key" ON "IntegrationConnection"("brandId", "provider", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthStateTransaction_stateHash_key" ON "OAuthStateTransaction"("stateHash");

-- CreateIndex
CREATE INDEX "OAuthStateTransaction_expiresAt_idx" ON "OAuthStateTransaction"("expiresAt");

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_brandId_workspaceId_fkey" FOREIGN KEY ("brandId", "workspaceId") REFERENCES "Brand"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;


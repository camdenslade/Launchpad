-- CreateEnum
CREATE TYPE "DeploymentState" AS ENUM ('in_progress', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "RollbackStatus" AS ENUM ('pending_approval', 'queued', 'running', 'succeeded', 'failed', 'rejected');

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "taskDefinitionArn" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "image" TEXT,
    "commitSha" TEXT,
    "registeredAt" TIMESTAMP(3),
    "registeredBy" TEXT,
    "state" "DeploymentState",
    "stateReason" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RollbackRequest" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "targetTaskDefinitionArn" TEXT NOT NULL,
    "targetRevision" INTEGER NOT NULL,
    "fromRevision" INTEGER,
    "status" "RollbackStatus" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "jobId" TEXT,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RollbackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deployment_environmentId_revision_idx" ON "Deployment"("environmentId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_environmentId_taskDefinitionArn_key" ON "Deployment"("environmentId", "taskDefinitionArn");

-- CreateIndex
CREATE INDEX "RollbackRequest_environmentId_createdAt_idx" ON "RollbackRequest"("environmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RollbackRequest" ADD CONSTRAINT "RollbackRequest_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RollbackRequest" ADD CONSTRAINT "RollbackRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RollbackRequest" ADD CONSTRAINT "RollbackRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


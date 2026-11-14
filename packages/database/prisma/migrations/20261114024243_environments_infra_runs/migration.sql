-- CreateEnum
CREATE TYPE "EnvironmentKind" AS ENUM ('development', 'staging', 'production');

-- CreateEnum
CREATE TYPE "ApprovalPolicy" AS ENUM ('any_member', 'different_member');

-- CreateEnum
CREATE TYPE "InfrastructureRunStatus" AS ENUM ('queued', 'planning', 'planned', 'no_changes', 'approved', 'applying', 'applied', 'rejected', 'superseded', 'failed');

-- CreateTable
CREATE TABLE "Environment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EnvironmentKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "cloudAccountId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "approvalPolicy" "ApprovalPolicy" NOT NULL DEFAULT 'any_member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfrastructureRun" (
    "id" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "status" "InfrastructureRunStatus" NOT NULL DEFAULT 'queued',
    "summary" JSONB,
    "planLog" TEXT,
    "applyLog" TEXT,
    "outputs" JSONB,
    "error" TEXT,
    "planJobId" TEXT,
    "applyJobId" TEXT,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "InfrastructureRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Environment_slug_key" ON "Environment"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Environment_projectId_name_key" ON "Environment"("projectId", "name");

-- CreateIndex
CREATE INDEX "InfrastructureRun_environmentId_createdAt_idx" ON "InfrastructureRun"("environmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_cloudAccountId_fkey" FOREIGN KEY ("cloudAccountId") REFERENCES "CloudAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfrastructureRun" ADD CONSTRAINT "InfrastructureRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfrastructureRun" ADD CONSTRAINT "InfrastructureRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfrastructureRun" ADD CONSTRAINT "InfrastructureRun_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


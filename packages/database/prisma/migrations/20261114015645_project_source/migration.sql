-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "defaultBranch" TEXT,
ADD COLUMN     "sourceProvider" TEXT,
ADD COLUMN     "sourceRepoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_sourceProvider_sourceRepoId_key" ON "Project"("sourceProvider", "sourceRepoId");


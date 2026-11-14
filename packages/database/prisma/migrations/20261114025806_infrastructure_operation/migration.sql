-- CreateEnum
CREATE TYPE "InfrastructureOperation" AS ENUM ('apply', 'destroy');

-- AlterTable
ALTER TABLE "InfrastructureRun" ADD COLUMN     "operation" "InfrastructureOperation" NOT NULL DEFAULT 'apply';


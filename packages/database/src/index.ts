import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

export interface DatabaseClientOptions {
  connectionString: string;
}

/**
 * Creates a Prisma client bound to the given connection string.
 *
 * No client is created at import time: consumers (API, worker, scripts)
 * construct one after their own configuration has been loaded.
 */
export function createDatabaseClient(
  options: DatabaseClientOptions
): PrismaClient {
  if (!options.connectionString) {
    throw new Error("A database connection string is required");
  }

  const adapter = new PrismaPg({
    connectionString: options.connectionString
  });

  return new PrismaClient({ adapter });
}

export { PrismaClient, Prisma, JobStatus, CloudAccountStatus } from "../generated/prisma/client.js";
export * from "./jobs.js";
export type {
  GitHubCredential,
  AuditEvent,
  CloudAccount,
  Job,
  Project,
  Session,
  User
} from "../generated/prisma/client.js";

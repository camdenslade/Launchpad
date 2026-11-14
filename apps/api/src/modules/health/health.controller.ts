import {
  Controller,
  Get,
  ServiceUnavailableException
} from "@nestjs/common";
import type { PrismaClient } from "@launchpad/database";
import { InjectDatabase } from "../database/database.module.js";

interface HealthResponse {
  status: "ok";
  service: string;
  timestamp: string;
}

interface ReadinessResponse extends HealthResponse {
  checks: { database: "ok" };
}

const SERVICE_NAME = "launchpad-api";

@Controller("health")
export class HealthController {
  constructor(@InjectDatabase() private readonly db: PrismaClient) {}

  /** Liveness: the process is up and serving HTTP. */
  @Get()
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: SERVICE_NAME,
      timestamp: new Date().toISOString()
    };
  }

  /** Readiness: dependencies required to serve traffic are reachable. */
  @Get("ready")
  async getReadiness(): Promise<ReadinessResponse> {
    try {
      await this.db.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: "unavailable",
        service: SERVICE_NAME,
        checks: { database: "unreachable" }
      });
    }

    return {
      status: "ok",
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
      checks: { database: "ok" }
    };
  }
}

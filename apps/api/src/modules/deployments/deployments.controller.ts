import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import type { DeployWorkflow } from "@launchpad/contracts";
import { DeploymentsService } from "./deployments.service.js";

/**
 * Routes (global prefix `api`):
 *   GET /api/environments/:id/deploy-workflow   GitHub Actions workflow for the environment
 */
@Controller()
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService) {}

  @Get("environments/:id/deploy-workflow")
  workflow(@Param("id", ParseUUIDPipe) id: string): Promise<DeployWorkflow> {
    return this.deployments.getWorkflow(id);
  }
}

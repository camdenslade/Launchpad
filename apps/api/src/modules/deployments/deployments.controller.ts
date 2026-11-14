import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import {
  CreateRollbackSchema,
  type CreateRollback,
  type CurrentUser as CurrentUserDto,
  type DeployWorkflow,
  type DeploymentHistory,
  type RollbackRequest
} from "@launchpad/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { CurrentUser } from "../auth/auth.decorators.js";
import { DeploymentsService } from "./deployments.service.js";

/**
 * Routes (global prefix `api`):
 *   GET  /api/environments/:id/deploy-workflow   GitHub Actions workflow for the environment
 *   GET  /api/environments/:id/deployments       history, read live from the cloud
 *   POST /api/environments/:id/rollbacks         { revision } -> roll back (may need approval)
 *   GET  /api/rollbacks/:id
 *   POST /api/rollbacks/:id/approve
 *   POST /api/rollbacks/:id/reject
 */
@Controller()
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService) {}

  @Get("environments/:id/deploy-workflow")
  workflow(@Param("id", ParseUUIDPipe) id: string): Promise<DeployWorkflow> {
    return this.deployments.getWorkflow(id);
  }

  @Get("environments/:id/deployments")
  history(@Param("id", ParseUUIDPipe) id: string): Promise<DeploymentHistory> {
    return this.deployments.history(id);
  }

  @Post("environments/:id/rollbacks")
  @HttpCode(HttpStatus.ACCEPTED)
  rollback(
    @CurrentUser() user: CurrentUserDto,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CreateRollbackSchema)) body: CreateRollback
  ): Promise<RollbackRequest> {
    return this.deployments.requestRollback(user, id, body.revision);
  }

  @Get("rollbacks/:id")
  getRollback(@Param("id", ParseUUIDPipe) id: string): Promise<RollbackRequest> {
    return this.deployments.getRollback(id);
  }

  @Post("rollbacks/:id/approve")
  @HttpCode(HttpStatus.ACCEPTED)
  approve(@CurrentUser() user: CurrentUserDto, @Param("id", ParseUUIDPipe) id: string): Promise<RollbackRequest> {
    return this.deployments.approveRollback(user, id);
  }

  @Post("rollbacks/:id/reject")
  @HttpCode(HttpStatus.OK)
  reject(@CurrentUser() user: CurrentUserDto, @Param("id", ParseUUIDPipe) id: string): Promise<RollbackRequest> {
    return this.deployments.rejectRollback(user, id);
  }
}

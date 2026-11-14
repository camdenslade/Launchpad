import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post
} from "@nestjs/common";
import {
  CreateEnvironmentSchema,
  UpdateEnvironmentSchema,
  type CreateEnvironment,
  type CurrentUser as CurrentUserDto,
  type Environment,
  type InfrastructureRun,
  type InfrastructureRunDetail,
  type UpdateEnvironment
} from "@launchpad/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { CurrentUser } from "../auth/auth.decorators.js";
import { EnvironmentsService } from "./environments.service.js";

/**
 * Routes (global prefix `api`):
 *   GET    /api/projects/:projectId/environments
 *   POST   /api/projects/:projectId/environments
 *   PATCH  /api/environments/:id
 *   DELETE /api/environments/:id
 *   GET    /api/environments/:id/runs
 *   POST   /api/environments/:id/plan            -> 202, runs in the worker
 *   GET    /api/infrastructure/runs/:id          (includes logs)
 *   POST   /api/infrastructure/runs/:id/approve  -> 202, apply runs in the worker
 *   POST   /api/infrastructure/runs/:id/reject
 */
@Controller()
export class EnvironmentsController {
  constructor(private readonly environments: EnvironmentsService) {}

  @Get("projects/:projectId/environments")
  list(@Param("projectId", ParseUUIDPipe) projectId: string): Promise<Environment[]> {
    return this.environments.list(projectId);
  }

  @Post("projects/:projectId/environments")
  create(
    @CurrentUser() user: CurrentUserDto,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(CreateEnvironmentSchema)) body: CreateEnvironment
  ): Promise<Environment> {
    return this.environments.create(user, projectId, body);
  }

  @Patch("environments/:id")
  update(
    @CurrentUser() user: CurrentUserDto,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateEnvironmentSchema)) body: UpdateEnvironment
  ): Promise<Environment> {
    return this.environments.update(user, id, body);
  }

  @Delete("environments/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: CurrentUserDto, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.environments.remove(user, id);
  }

  @Get("environments/:id/runs")
  runs(@Param("id", ParseUUIDPipe) id: string): Promise<InfrastructureRun[]> {
    return this.environments.listRuns(id);
  }

  @Post("environments/:id/plan")
  @HttpCode(HttpStatus.ACCEPTED)
  plan(@CurrentUser() user: CurrentUserDto, @Param("id", ParseUUIDPipe) id: string): Promise<InfrastructureRun> {
    return this.environments.plan(user, id);
  }

  @Get("infrastructure/runs/:id")
  run(@Param("id", ParseUUIDPipe) id: string): Promise<InfrastructureRunDetail> {
    return this.environments.getRun(id);
  }

  @Post("infrastructure/runs/:id/approve")
  @HttpCode(HttpStatus.ACCEPTED)
  approve(@CurrentUser() user: CurrentUserDto, @Param("id", ParseUUIDPipe) id: string): Promise<InfrastructureRun> {
    return this.environments.approve(user, id);
  }

  @Post("infrastructure/runs/:id/reject")
  @HttpCode(HttpStatus.OK)
  reject(@CurrentUser() user: CurrentUserDto, @Param("id", ParseUUIDPipe) id: string): Promise<InfrastructureRun> {
    return this.environments.reject(user, id);
  }
}

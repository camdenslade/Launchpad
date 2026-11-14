import { Controller, Get, Query } from "@nestjs/common";
import {
  SourceProviderSchema,
  type CurrentUser as CurrentUserDto,
  type RepositoryList,
  type SourceProvider
} from "@launchpad/contracts";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { CurrentUser } from "../auth/auth.decorators.js";
import { SourceControlService } from "./source-control.service.js";

/**
 * Routes (global prefix `api`):
 *   GET /api/source/repositories?provider=github
 */
@Controller("source")
export class SourceControlController {
  constructor(private readonly sourceControl: SourceControlService) {}

  @Get("repositories")
  listRepositories(
    @CurrentUser() user: CurrentUserDto,
    @Query("provider", new ZodValidationPipe(SourceProviderSchema.default("github")))
    provider: SourceProvider
  ): Promise<RepositoryList> {
    return this.sourceControl.listRepositories(user.id, provider);
  }
}

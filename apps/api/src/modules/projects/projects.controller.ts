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
  CreateProjectSchema,
  ImportProjectSchema,
  UpdateProjectSchema,
  type CreateProject,
  type CurrentUser as CurrentUserDto,
  type ImportProject,
  type UpdateProject
} from "@launchpad/contracts";
import type { Project } from "@launchpad/database";
import { ZodValidationPipe } from "../../common/zod-validation.pipe.js";
import { CurrentUser } from "../auth/auth.decorators.js";
import { ProjectsService } from "./projects.service.js";

/**
 * Routes (global prefix `api`):
 *   GET    /api/projects
 *   GET    /api/projects/:id
 *   POST   /api/projects
 *   POST   /api/projects/import   (from GitHub etc.)
 *   PATCH  /api/projects/:id
 *   DELETE /api/projects/:id
 */
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  findAll(): Promise<Project[]> {
    return this.projects.findAll();
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string): Promise<Project> {
    return this.projects.findOne(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateProjectSchema)) body: CreateProject
  ): Promise<Project> {
    return this.projects.create(body);
  }

  @Post("import")
  import(
    @CurrentUser() user: CurrentUserDto,
    @Body(new ZodValidationPipe(ImportProjectSchema)) body: ImportProject
  ): Promise<Project> {
    return this.projects.importFromSource(user.id, body);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateProjectSchema)) body: UpdateProject
  ): Promise<Project> {
    return this.projects.update(id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.projects.remove(id);
  }
}

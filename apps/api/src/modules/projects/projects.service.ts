import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type {
  CreateProject,
  ImportProject,
  UpdateProject
} from "@launchpad/contracts";
import {
  Prisma,
  type PrismaClient,
  type Project
} from "@launchpad/database";
import { InjectDatabase } from "../database/database.module.js";
import { SourceControlService } from "../source-control/source-control.service.js";

/**
 * Business logic for the project catalog. Controllers stay thin (HTTP in,
 * HTTP out); anything that touches the database or encodes a rule lives here.
 */
@Injectable()
export class ProjectsService {
  constructor(
    @InjectDatabase() private readonly db: PrismaClient,
    private readonly sourceControl: SourceControlService
  ) {}

  findAll(): Promise<Project[]> {
    return this.db.project.findMany({ orderBy: { createdAt: "desc" } });
  }

  async findOne(id: string): Promise<Project> {
    const project = await this.db.project.findUnique({ where: { id } });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    return project;
  }

  async create(input: CreateProject): Promise<Project> {
    try {
      return await this.db.project.create({
        data: {
          name: input.name,
          repositoryUrl: input.repositoryUrl,
          description: input.description ?? null,
          owner: input.owner ?? null
        }
      });
    } catch (error) {
      throw this.translateError(error, input.repositoryUrl);
    }
  }

  /**
   * Registers a repository from a source provider. Name/URL/description come
   * from the provider (server-side), not the browser, so they can't be forged
   * and the user must actually have access to the repository.
   */
  async importFromSource(userId: string, input: ImportProject): Promise<Project> {
    const repo = await this.sourceControl.getRepository(userId, input.provider, input.repositoryId);

    try {
      return await this.db.project.create({
        data: {
          name: repo.name,
          description: repo.description,
          owner: input.owner ?? null,
          repositoryUrl: repo.url,
          sourceProvider: repo.provider,
          sourceRepoId: repo.id,
          defaultBranch: repo.defaultBranch,
          avatarUrl: repo.ownerAvatarUrl,
          language: repo.language
        }
      });
    } catch (error) {
      throw this.translateError(error, repo.fullName);
    }
  }

  async update(id: string, input: UpdateProject): Promise<Project> {
    try {
      return await this.db.project.update({
        where: { id },
        data: withoutUndefined(input)
      });
    } catch (error) {
      throw this.translateError(error, input.repositoryUrl, id);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.db.project.delete({ where: { id } });
    } catch (error) {
      throw this.translateError(error, undefined, id);
    }
  }

  /**
   * Maps Prisma's error codes to HTTP errors so clients get a 404/409
   * instead of a generic 500.
   * https://www.prisma.io/docs/orm/reference/error-reference
   */
  private translateError(
    error: unknown,
    repositoryUrl?: string,
    id?: string
  ): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return new ConflictException(
          `${repositoryUrl ?? "That repository"} is already registered as a project`
        );
      }
      if (error.code === "P2025") {
        return new NotFoundException(`Project ${id ?? ""} not found`.trim());
      }
    }
    return error;
  }
}

/**
 * Drops keys whose value is `undefined` so Prisma only updates fields the
 * client actually sent (`null` is kept: it means "clear this field").
 */
function withoutUndefined<T extends object>(
  value: T
): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as { [K in keyof T]: Exclude<T[K], undefined> };
}

import {
  BadRequestException,
  Injectable,
  type PipeTransform
} from "@nestjs/common";
import type { z } from "zod";

/**
 * Validates (and parses) a request value against a Zod schema from
 * `@launchpad/contracts`, so the API and web app share one source of truth.
 *
 * Usage: `@Body(new ZodValidationPipe(CreateProjectSchema)) body: CreateProject`
 */
@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodType>
  implements PipeTransform<unknown, z.output<TSchema>>
{
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: "Validation failed",
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    return result.data;
  }
}

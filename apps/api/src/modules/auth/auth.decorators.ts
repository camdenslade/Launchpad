import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { CurrentUser as CurrentUserDto } from "@launchpad/contracts";
import type { Request } from "express";

export const IS_PUBLIC = "auth:isPublic";

/**
 * Every route requires a signed-in user by default (see SessionGuard).
 * Mark a controller or handler `@Public()` to opt out, e.g. health checks.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/** Request after SessionGuard has run. */
export interface AuthenticatedRequest extends Request {
  user?: CurrentUserDto;
}

/** Injects the signed-in user: `me(@CurrentUser() user: CurrentUser)`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserDto | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user
);

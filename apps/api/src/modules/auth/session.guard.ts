import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "./auth.service.js";
import { IS_PUBLIC, type AuthenticatedRequest } from "./auth.decorators.js";
import { SESSION_COOKIE } from "./auth.constants.js";

/**
 * Registered globally (APP_GUARD in AuthModule), so it runs before every
 * route. Secure by default: a new endpoint is protected unless it is
 * explicitly marked @Public().
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token: unknown = request.cookies?.[SESSION_COOKIE];

    const user = typeof token === "string" ? await this.auth.resolveSession(token) : null;
    if (!user) {
      throw new UnauthorizedException("Sign in required");
    }

    request.user = user;
    return true;
  }
}

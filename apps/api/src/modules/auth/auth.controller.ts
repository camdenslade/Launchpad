import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CookieOptions, Response } from "express";
import type { CurrentUser as CurrentUserDto } from "@launchpad/contracts";
import type { Env } from "../../config/env.js";
import { AuthService } from "./auth.service.js";
import { GitHubOAuthClient } from "./github-oauth.client.js";
import { CurrentUser, Public, type AuthenticatedRequest } from "./auth.decorators.js";
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_MS, SESSION_COOKIE } from "./auth.constants.js";

/**
 * Routes (global prefix `api`):
 *   GET  /api/auth/github/login     -> redirects to GitHub
 *   GET  /api/auth/github/callback  -> GitHub redirects here; starts a session
 *   GET  /api/auth/me               -> the signed-in user (401 if none)
 *   POST /api/auth/logout           -> ends the session
 */
@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly webOrigin: string;
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly github: GitHubOAuthClient,
    config: ConfigService<Env, true>
  ) {
    this.webOrigin = config.get("WEB_ORIGIN", { infer: true });
    // Secure cookies are only sent over HTTPS; enable whenever we're served on it.
    this.secureCookies = this.webOrigin.startsWith("https://");
  }

  @Public()
  @Get("github/login")
  login(@Res() res: Response): void {
    // Random `state`, remembered in a cookie and checked on the way back, so
    // an attacker can't complete a sign-in flow they started in your browser.
    const state = randomBytes(32).toString("base64url");

    res.cookie(OAUTH_STATE_COOKIE, state, {
      ...this.cookieOptions(),
      maxAge: OAUTH_STATE_TTL_MS
    });
    res.redirect(this.github.authorizeUrl(state));
  }

  @Public()
  @Get("github/callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") githubError: string | undefined,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response
  ): Promise<void> {
    const expectedState: unknown = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, this.cookieOptions());

    if (githubError) {
      return this.redirectWithError(res, "github_denied");
    }
    if (!code || !state || typeof expectedState !== "string" || !safeEqual(state, expectedState)) {
      return this.redirectWithError(res, "invalid_state");
    }

    try {
      const tokens = await this.github.exchangeCode(code);
      const profile = await this.github.getProfile(tokens.accessToken);
      const session = await this.auth.signInWithGitHub(profile, tokens);

      res.cookie(SESSION_COOKIE, session.token, {
        ...this.cookieOptions(),
        expires: session.expiresAt
      });
      this.logger.log(`Signed in: ${profile.login}`);
      res.redirect(`${this.webOrigin}/`);
    } catch (error) {
      this.logger.warn(`GitHub sign-in failed: ${(error as Error).message}`);
      this.redirectWithError(res, "signin_failed");
    }
  }

  @Get("me")
  me(@CurrentUser() user: CurrentUserDto): CurrentUserDto {
    return user;
  }

  /** Public so a client with an already-expired session can still clear it. */
  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response
  ): Promise<void> {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string") {
      await this.auth.signOut(token);
    }
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Public()
  @Get("config")
  config(): { githubConfigured: boolean } {
    return { githubConfigured: this.github.isConfigured };
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true, // not readable from page JavaScript
      sameSite: "lax", // not sent on cross-site POSTs (CSRF protection)
      secure: this.secureCookies,
      path: "/"
    };
  }

  private redirectWithError(res: Response, code: string): void {
    res.redirect(`${this.webOrigin}/?authError=${encodeURIComponent(code)}`);
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

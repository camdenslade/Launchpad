import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env.js";

export interface GitHubTokens {
  accessToken: string;
  /** Present when the GitHub App has "expire user authorization tokens" on. */
  accessTokenExpiresAt: Date | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
}

export interface GitHubProfile {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * GitHub App "user authorization" (OAuth web flow).
 * https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
 *
 * 1. Browser is redirected to `authorizeUrl()` and the user approves.
 * 2. GitHub redirects back to our callback with `?code=...&state=...`.
 * 3. `exchangeCode()` swaps the code for a user access token.
 * 4. `getProfile()` reads who the user is.
 */
@Injectable()
export class GitHubOAuthClient {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get callbackUrl(): string {
    return `${this.config.get("WEB_ORIGIN", { infer: true })}/api/auth/github/callback`;
  }

  authorizeUrl(state: string): string {
    const { clientId } = this.credentials();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.callbackUrl,
      state
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GitHubTokens> {
    const { clientId, clientSecret } = this.credentials();

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: this.callbackUrl
      })
    });

    // GitHub returns 200 with an `error` field for bad/expired codes.
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      refresh_token_expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !body.access_token) {
      throw new UnauthorizedException(
        body.error_description ?? body.error ?? "GitHub did not return an access token"
      );
    }

    const now = Date.now();
    return {
      accessToken: body.access_token,
      accessTokenExpiresAt: body.expires_in ? new Date(now + body.expires_in * 1000) : null,
      refreshToken: body.refresh_token ?? null,
      refreshTokenExpiresAt: body.refresh_token_expires_in
        ? new Date(now + body.refresh_token_expires_in * 1000)
        : null
    };
  }

  async getProfile(accessToken: string): Promise<GitHubProfile> {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "launchpad"
      }
    });

    if (!response.ok) {
      throw new UnauthorizedException(`GitHub profile request failed (${response.status})`);
    }

    const user = (await response.json()) as {
      id: number;
      login: string;
      name: string | null;
      avatar_url: string | null;
    };

    return { id: user.id, login: user.login, name: user.name, avatarUrl: user.avatar_url };
  }

  get isConfigured(): boolean {
    return Boolean(
      this.config.get("GITHUB_CLIENT_ID", { infer: true }) &&
        this.config.get("GITHUB_CLIENT_SECRET", { infer: true })
    );
  }

  private credentials(): { clientId: string; clientSecret: string } {
    const clientId = this.config.get("GITHUB_CLIENT_ID", { infer: true });
    const clientSecret = this.config.get("GITHUB_CLIENT_SECRET", { infer: true });

    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        "GitHub sign-in is not configured: set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET"
      );
    }

    return { clientId, clientSecret };
  }
}

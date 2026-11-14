import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { SOURCE_REAUTH_REQUIRED } from "@launchpad/contracts";
import type { PrismaClient } from "@launchpad/database";
import { EncryptionService } from "../../../common/encryption.service.js";
import { InjectDatabase } from "../../database/database.module.js";
import { GitHubOAuthClient } from "../../auth/github-oauth.client.js";

/** Refresh this long before expiry so a token can't expire mid-request. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

/**
 * Hands out a valid GitHub user access token for a Launchpad user,
 * refreshing (and re-encrypting) it when it is about to expire.
 */
@Injectable()
export class GitHubTokenService {
  private readonly logger = new Logger(GitHubTokenService.name);
  /**
   * GitHub refresh tokens are single-use. If two requests refresh at once,
   * the second would fail, so concurrent callers share one in-flight refresh.
   */
  private readonly refreshing = new Map<string, Promise<string>>();

  constructor(
    @InjectDatabase() private readonly db: PrismaClient,
    private readonly encryption: EncryptionService,
    private readonly oauth: GitHubOAuthClient
  ) {}

  async getAccessToken(userId: string): Promise<string> {
    const credential = await this.db.gitHubCredential.findUnique({ where: { userId } });
    if (!credential) throw reauthRequired();

    const expiresAt = credential.accessTokenExpiresAt?.getTime();
    if (expiresAt === undefined || expiresAt - Date.now() > EXPIRY_MARGIN_MS) {
      return this.encryption.decrypt(credential.accessTokenEncrypted);
    }

    let pending = this.refreshing.get(userId);
    if (!pending) {
      pending = this.refresh(userId).finally(() => this.refreshing.delete(userId));
      this.refreshing.set(userId, pending);
    }
    return pending;
  }

  /** Call when GitHub rejects a token (revoked/uninstalled): forces re-auth. */
  reauthRequired(): ForbiddenException {
    return reauthRequired();
  }

  private async refresh(userId: string): Promise<string> {
    // Re-read inside the refresh in case another process already rotated it.
    const credential = await this.db.gitHubCredential.findUnique({ where: { userId } });
    const refreshExpired =
      credential?.refreshTokenExpiresAt && credential.refreshTokenExpiresAt <= new Date();

    if (!credential?.refreshTokenEncrypted || refreshExpired) {
      throw reauthRequired();
    }

    try {
      const tokens = await this.oauth.refreshTokens(
        this.encryption.decrypt(credential.refreshTokenEncrypted)
      );

      await this.db.gitHubCredential.update({
        where: { userId },
        data: {
          accessTokenEncrypted: this.encryption.encrypt(tokens.accessToken),
          accessTokenExpiresAt: tokens.accessTokenExpiresAt,
          refreshTokenEncrypted: tokens.refreshToken
            ? this.encryption.encrypt(tokens.refreshToken)
            : null,
          refreshTokenExpiresAt: tokens.refreshTokenExpiresAt
        }
      });

      this.logger.log(`Refreshed GitHub token for user ${userId}`);
      return tokens.accessToken;
    } catch (error) {
      this.logger.warn(`GitHub token refresh failed: ${(error as Error).message}`);
      throw reauthRequired();
    }
  }
}

function reauthRequired(): ForbiddenException {
  return new ForbiddenException({
    code: SOURCE_REAUTH_REQUIRED,
    message: "Your GitHub authorization has expired. Sign in with GitHub again."
  });
}

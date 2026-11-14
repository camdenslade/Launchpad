import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CurrentUser } from "@launchpad/contracts";
import type { PrismaClient, User } from "@launchpad/database";
import type { Env } from "../../config/env.js";
import { EncryptionService } from "../../common/encryption.service.js";
import { InjectDatabase } from "../database/database.module.js";
import type { GitHubProfile, GitHubTokens } from "./github-oauth.client.js";

export interface NewSession {
  /** Raw token for the cookie. Never stored; only its hash is. */
  token: string;
  expiresAt: Date;
}

/** Users, sessions and stored GitHub credentials. */
@Injectable()
export class AuthService {
  private readonly sessionTtlMs: number;

  constructor(
    @InjectDatabase() private readonly db: PrismaClient,
    private readonly encryption: EncryptionService,
    config: ConfigService<Env, true>
  ) {
    this.sessionTtlMs = config.get("SESSION_TTL_HOURS", { infer: true }) * 60 * 60 * 1000;
  }

  /**
   * Called after a successful GitHub sign-in: creates or updates the user,
   * stores their GitHub tokens encrypted, and starts a session. All in one
   * transaction so we never end up with a half-written sign-in.
   */
  async signInWithGitHub(profile: GitHubProfile, tokens: GitHubTokens): Promise<NewSession> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.sessionTtlMs);

    const credential = {
      accessTokenEncrypted: this.encryption.encrypt(tokens.accessToken),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenEncrypted: tokens.refreshToken
        ? this.encryption.encrypt(tokens.refreshToken)
        : null,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt
    };
    const userFields = {
      login: profile.login,
      name: profile.name,
      avatarUrl: profile.avatarUrl
    };

    await this.db.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { githubId: BigInt(profile.id) },
        create: { githubId: BigInt(profile.id), ...userFields },
        update: userFields
      });

      await tx.gitHubCredential.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...credential },
        update: credential
      });

      await tx.session.create({
        data: { tokenHash: hashToken(token), userId: user.id, expiresAt }
      });
    });

    return { token, expiresAt };
  }

  /** Returns the user for a session cookie, or null if missing/expired. */
  async resolveSession(token: string): Promise<CurrentUser | null> {
    const session = await this.db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true }
    });

    if (!session) return null;

    if (session.expiresAt <= new Date()) {
      await this.db.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }

    return toCurrentUser(session.user);
  }

  async signOut(token: string): Promise<void> {
    await this.db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
}

/** SHA-256 is fine here (not bcrypt): tokens are 256-bit random, not passwords. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Never return DB rows directly: githubId is a BigInt and JSON can't encode it. */
function toCurrentUser(user: User): CurrentUser {
  return {
    id: user.id,
    login: user.login,
    name: user.name,
    avatarUrl: user.avatarUrl
  };
}

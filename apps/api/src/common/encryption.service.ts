import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

/**
 * Encrypts secrets (e.g. GitHub tokens) before they are written to the
 * database, satisfying "never store plaintext credentials".
 *
 * Output format: `v1:<iv>:<authTag>:<ciphertext>` (base64url parts). GCM's
 * auth tag means tampered ciphertext fails to decrypt instead of returning
 * garbage. The version prefix leaves room for key rotation later.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    // Already validated as 32 bytes of base64 by EnvSchema at startup.
    this.key = Buffer.from(config.getOrThrow<string>("ENCRYPTION_KEY"), "base64");
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12); // GCM standard nonce size; never reuse with a key
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [VERSION, iv, tag, ciphertext]
      .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
      .join(":");
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ciphertext] = payload.split(":");

    if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
      throw new Error("Unrecognised encrypted payload format");
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");
  }
}

import { z } from "zod";

/** Treat `FOO=` (empty) in .env the same as an unset variable. */
const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional()
);

const encryptionKey = z
  .string({ error: "ENCRYPTION_KEY is required (see .env.example)" })
  .refine((value) => Buffer.from(value, "base64").length === 32, {
    message:
      "ENCRYPTION_KEY must be 32 bytes, base64-encoded. Generate one with: " +
      `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  });

/**
 * Every environment variable the API reads, validated once at startup.
 * A misconfigured install fails immediately with a readable message instead
 * of breaking later at runtime.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  /** Public URL users open in the browser (the web app). */
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  ENCRYPTION_KEY: encryptionKey,
  SESSION_TTL_HOURS: z.coerce.number().positive().default(168),
  /** GitHub App credentials. Optional so the API can boot before setup. */
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  /** The app's URL name (github.com/apps/<slug>), used for "install" links. */
  GITHUB_APP_SLUG: optionalString,
  /**
   * Public S3 URL of the access-role CloudFormation template. Enables the
   * one-click "Launch in AWS" button (AWS only accepts S3-hosted templates).
   */
  AWS_CFN_TEMPLATE_URL: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional())
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}

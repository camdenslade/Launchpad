import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";

/** Temporary credentials for one operation in a customer account. */
export interface AwsSessionCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

export interface AssumeRoleInput {
  roleArn: string;
  externalId: string;
  region: string;
  /** Appears in the customer's CloudTrail; say who/what is acting. */
  sessionName: string;
  /** Default 1 hour (the role's MaxSessionDuration). */
  durationSeconds?: number;
}

/**
 * Assumes the customer's Launchpad role. Launchpad's own identity comes from
 * the standard AWS SDK credential chain (AWS_PROFILE locally, an instance or
 * task role in production). Nothing long-lived is ever created or stored.
 */
export async function assumeAwsRole(input: AssumeRoleInput): Promise<AwsSessionCredentials> {
  const sts = new STSClient({ region: input.region });
  const { Credentials } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: input.roleArn,
      ExternalId: input.externalId,
      RoleSessionName: toSessionName(input.sessionName),
      DurationSeconds: input.durationSeconds ?? 3600
    })
  );

  if (!Credentials?.AccessKeyId || !Credentials.SecretAccessKey || !Credentials.SessionToken) {
    throw new Error("AWS returned no credentials for the role");
  }

  return {
    accessKeyId: Credentials.AccessKeyId,
    secretAccessKey: Credentials.SecretAccessKey,
    sessionToken: Credentials.SessionToken,
    expiration: Credentials.Expiration ?? new Date(Date.now() + 3600_000)
  };
}

/** Environment variables that make the AWS CLI/Terraform use these credentials. */
export function awsCredentialEnv(credentials: AwsSessionCredentials, region: string): Record<string, string> {
  return {
    AWS_ACCESS_KEY_ID: credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    AWS_SESSION_TOKEN: credentials.sessionToken,
    AWS_REGION: region,
    AWS_DEFAULT_REGION: region
  };
}

function toSessionName(name: string): string {
  return name.replace(/[^\w+=,.@-]/g, "-").slice(0, 64);
}

import { Injectable, Logger } from "@nestjs/common";
import {
  AssumeRoleCommand,
  GetCallerIdentityCommand,
  STSClient,
  type Credentials
} from "@aws-sdk/client-sts";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../../config/env.js";
import {
  CloudVerificationError,
  type AccountSetup,
  type CloudProviderAdapter,
  type SetupInput,
  type VerifiedIdentity
} from "../cloud.provider.js";
import { ACCESS_ROLE_ROLE_NAME } from "./access-role.template.js";

const SUGGESTED_ROLE_NAME = ACCESS_ROLE_ROLE_NAME;
const STACK_NAME = "Launchpad-Access";

/**
 * AWS implementation: cross-account access via an IAM role.
 *
 * Launchpad runs with its *own* AWS identity, found through the standard
 * SDK credential chain (env vars, AWS_PROFILE, SSO, or an instance/task
 * role in production). For each operation it calls sts:AssumeRole on the
 * customer's role, presenting the account's external ID, and receives
 * credentials that expire within the hour. No customer keys are stored.
 */
@Injectable()
export class AwsCloudProvider implements CloudProviderAdapter {
  readonly id = "aws" as const;
  private readonly logger = new Logger(AwsCloudProvider.name);
  private readonly templateUrl: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    this.templateUrl = config.get("AWS_CFN_TEMPLATE_URL", { infer: true });
  }

  async describeSetup({ externalId, accountId, region }: SetupInput): Promise<AccountSetup> {
    const principal = await this.launchpadPrincipal();
    const consoleBase = `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}`;
    const base = {
      expectedRoleArn: `arn:aws:iam::${accountId}:role/${SUGGESTED_ROLE_NAME}`,
      suggestedRoleName: SUGGESTED_ROLE_NAME,
      // "Create stack" page with "upload a template file" ready.
      createStackConsoleUrl: `${consoleBase}#/stacks/create/template`
    };

    if (!principal) {
      return { ...base, launchpadPrincipalArn: null, trustPolicy: null, cliCommand: null, launchStackUrl: null };
    }

    // Quick-create: the console opens with the template and parameters filled
    // in; the user ticks the IAM acknowledgement and clicks Create.
    // AWS only accepts templates hosted on S3, hence the config option.
    const launchStackUrl = this.templateUrl
      ? `${consoleBase}#/stacks/quickcreate?` +
        new URLSearchParams({
          templateURL: this.templateUrl,
          stackName: STACK_NAME,
          param_LaunchpadPrincipalArn: principal,
          param_ExternalId: externalId
        }).toString()
      : null;

    const trustPolicy = JSON.stringify(
      {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: principal },
            Action: "sts:AssumeRole",
            Condition: { StringEquals: { "sts:ExternalId": externalId } }
          }
        ]
      },
      null,
      2
    );

    // Single-line JSON so the command can be pasted into any shell.
    const inline = JSON.stringify(JSON.parse(trustPolicy));
    const cliCommand =
      `aws iam create-role --role-name ${SUGGESTED_ROLE_NAME} ` +
      `--description "Lets Launchpad manage infrastructure in this account" ` +
      `--assume-role-policy-document '${inline}'`;

    return { ...base, launchpadPrincipalArn: principal, trustPolicy, cliCommand, launchStackUrl };
  }

  async verifyAccess(input: {
    roleArn: string;
    externalId: string;
    region: string;
    sessionName: string;
  }): Promise<VerifiedIdentity> {
    const sts = new STSClient({ region: input.region });
    const expectedAccount = input.roleArn.split(":")[4];

    // 1. Assume the role the way every real operation will.
    let credentials: Credentials | undefined;
    try {
      const assumed = await sts.send(
        new AssumeRoleCommand({
          RoleArn: input.roleArn,
          RoleSessionName: input.sessionName,
          ExternalId: input.externalId,
          DurationSeconds: 900
        })
      );
      credentials = assumed.Credentials;
    } catch (error) {
      throw this.explain(error);
    }

    if (!credentials?.AccessKeyId || !credentials.SecretAccessKey) {
      throw new CloudVerificationError("AWS did not return credentials for the role.");
    }

    // 2. Confirm which account those credentials actually act in.
    const assumedSts = new STSClient({
      region: input.region,
      credentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        ...(credentials.SessionToken ? { sessionToken: credentials.SessionToken } : {})
      }
    });
    const identity = await assumedSts.send(new GetCallerIdentityCommand({}));
    if (!identity.Account || identity.Account !== expectedAccount) {
      throw new CloudVerificationError("The role resolved to an unexpected AWS account.");
    }

    // 3. Safety check: the role must *require* the external ID. Without that
    //    condition, anyone who learns the role ARN and runs Launchpad could
    //    use it (the "confused deputy" problem).
    const withoutExternalId = await sts
      .send(new AssumeRoleCommand({ RoleArn: input.roleArn, RoleSessionName: `${input.sessionName}-check`, DurationSeconds: 900 }))
      .then(() => true)
      .catch(() => false);
    if (withoutExternalId) {
      throw new CloudVerificationError(
        "The role can be assumed without the external ID. Add the sts:ExternalId condition from the trust policy shown in setup, then verify again."
      );
    }

    return { accountId: identity.Account };
  }

  /** ARN of the identity Launchpad itself runs as, in trust-policy form. */
  private async launchpadPrincipal(): Promise<string | null> {
    try {
      const identity = await new STSClient({ region: "us-east-1" }).send(new GetCallerIdentityCommand({}));
      return identity.Arn ? toTrustPrincipal(identity.Arn) : null;
    } catch (error) {
      this.logger.warn(`No usable AWS credentials for Launchpad: ${(error as Error).message}`);
      return null;
    }
  }

  private explain(error: unknown): CloudVerificationError {
    const name = (error as { name?: string }).name ?? "";
    const message = (error as Error).message ?? String(error);

    // Problems with Launchpad's *own* AWS identity (missing, revoked, expired keys).
    const launchpadCredentialErrors = [
      "CredentialsProviderError",
      "InvalidClientTokenId",
      "ExpiredToken",
      "ExpiredTokenException",
      "UnrecognizedClientException",
      "SignatureDoesNotMatch"
    ];
    if (launchpadCredentialErrors.includes(name)) {
      return new CloudVerificationError(
        "Launchpad has no valid AWS credentials of its own. Configure them on the Launchpad server (e.g. AWS_PROFILE) and restart the API."
      );
    }
    if (name === "AccessDenied" || name === "AccessDeniedException") {
      return new CloudVerificationError(
        "AWS denied Launchpad access to the role. Check that the role exists, that its trust policy names Launchpad's principal exactly, and that the external ID matches."
      );
    }
    return new CloudVerificationError(`AWS error: ${message}`);
  }
}

/**
 * GetCallerIdentity returns `arn:aws:sts::123:assumed-role/Role/session` for
 * role sessions, but trust policies need the role itself:
 * `arn:aws:iam::123:role/Role`. IAM user ARNs are used as-is.
 */
export function toTrustPrincipal(callerArn: string): string {
  const match = /^arn:(aws[a-z-]*):sts::(\d{12}):assumed-role\/([^/]+)\//.exec(callerArn);
  return match ? `arn:${match[1]}:iam::${match[2]}:role/${match[3]}` : callerArn;
}

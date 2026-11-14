import { z } from "zod";

/** Cloud providers Launchpad can deploy into. Others later via adapters. */
export const CloudProviderSchema = z.enum(["aws"]);
export type CloudProvider = z.infer<typeof CloudProviderSchema>;

export const CloudAccountStatusSchema = z.enum(["pending", "connected", "error"]);
export type CloudAccountStatus = z.infer<typeof CloudAccountStatusSchema>;

const awsRegion = z
  .string()
  .regex(/^[a-z]{2}(-gov)?-[a-z]+-\d$/, "Must be an AWS region like us-east-1");

const awsRoleArn = z
  .string()
  .trim()
  .regex(
    /^arn:aws(-[a-z]+)*:iam::\d{12}:role\/[\w+=,.@/-]{1,512}$/,
    "Must be an IAM role ARN like arn:aws:iam::123456789012:role/LaunchpadAccess"
  );

export const CloudAccountSchema = z.object({
  id: z.uuid(),
  provider: CloudProviderSchema,
  name: z.string(),
  accountId: z.string().nullable(),
  roleArn: z.string().nullable(),
  region: z.string(),
  status: CloudAccountStatusSchema,
  lastVerifiedAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.iso.datetime()
});
export type CloudAccount = z.infer<typeof CloudAccountSchema>;

/** Body of `POST /api/cloud/accounts`: step 1 of connecting an account. */
export const CreateCloudAccountSchema = z
  .object({
    provider: CloudProviderSchema,
    name: z.string().trim().min(1).max(100),
    /** 12-digit AWS account id; lets Launchpad derive the role ARN itself. */
    accountId: z.string().trim().regex(/^\d{12}$/, "Must be a 12-digit AWS account ID"),
    region: awsRegion
  })
  .strict();
export type CreateCloudAccount = z.infer<typeof CreateCloudAccountSchema>;

/**
 * Body of `POST /api/cloud/accounts/:id/verify`: step 3, after creating the role.
 * `roleArn` defaults to the expected one. `quiet` is for background polling:
 * a failed check leaves the account untouched instead of recording an error.
 */
export const VerifyCloudAccountSchema = z
  .object({ roleArn: awsRoleArn.optional(), quiet: z.boolean().optional() })
  .strict();
export type VerifyCloudAccount = z.infer<typeof VerifyCloudAccountSchema>;

/** Step 2: what the customer must create in their account (`GET .../setup`). */
export const CloudAccountSetupSchema = z.object({
  externalId: z.string(),
  /** The role ARN Launchpad will assume once it exists. */
  expectedRoleArn: z.string(),
  /** The identity Launchpad runs as; the role must trust it. Null if Launchpad has no AWS credentials. */
  launchpadPrincipalArn: z.string().nullable(),
  suggestedRoleName: z.string(),
  /** IAM trust policy JSON to paste when creating the role. */
  trustPolicy: z.string().nullable(),
  /** Ready-to-run AWS CLI command that creates the role. */
  cliCommand: z.string().nullable(),
  /** One-click CloudFormation quick-create link (needs a publicly hosted template). */
  launchStackUrl: z.url().nullable(),
  /** CloudFormation "create stack" page, for uploading the template manually. */
  createStackConsoleUrl: z.url(),
  /** API path to download the CloudFormation template. */
  templatePath: z.string()
});
export type CloudAccountSetup = z.infer<typeof CloudAccountSetupSchema>;

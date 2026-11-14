import type { CloudProvider } from "@launchpad/contracts";

export interface VerifiedIdentity {
  /** The provider account the role belongs to. */
  accountId: string;
}

export interface AccountSetup {
  expectedRoleArn: string;
  launchpadPrincipalArn: string | null;
  suggestedRoleName: string;
  trustPolicy: string | null;
  cliCommand: string | null;
  launchStackUrl: string | null;
  createStackConsoleUrl: string;
}

export interface SetupInput {
  externalId: string;
  accountId: string;
  region: string;
}

/**
 * Everything Launchpad needs from a cloud provider to connect an account.
 * Business logic depends on this, not on AWS, so other clouds can be added
 * as further implementations. (Provisioning goes through Terraform jobs.)
 */
export interface CloudProviderAdapter {
  readonly id: CloudProvider;

  /** Instructions for creating the access role in the customer's account. */
  describeSetup(input: SetupInput): Promise<AccountSetup>;

  /**
   * Proves Launchpad can act in the account via the role, and that the role
   * is configured safely. Throws a user-facing error otherwise.
   */
  verifyAccess(input: {
    roleArn: string;
    externalId: string;
    region: string;
    sessionName: string;
  }): Promise<VerifiedIdentity>;
}

/** An error whose message is safe and useful to show the user. */
export class CloudVerificationError extends Error {
  override name = "CloudVerificationError";
}

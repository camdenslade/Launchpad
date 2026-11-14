import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type {
  CloudAccount as CloudAccountDto,
  CloudAccountSetup,
  CloudProvider,
  CreateCloudAccount,
  CurrentUser
} from "@launchpad/contracts";
import { Prisma, type CloudAccount, type PrismaClient } from "@launchpad/database";
import { AuditService } from "../audit/audit.service.js";
import { InjectDatabase } from "../database/database.module.js";
import { AwsCloudProvider } from "./aws/aws-cloud.provider.js";
import { CloudVerificationError, type CloudProviderAdapter } from "./cloud.provider.js";

/**
 * Connecting a customer cloud account is a 3-step handshake:
 *   1. create()        -> pending account with a random external ID
 *   2. setup()         -> trust policy / CLI command the customer runs
 *   3. verify(roleArn) -> Launchpad assumes the role; account becomes "connected"
 */
@Injectable()
export class CloudService {
  private readonly providers: Map<CloudProvider, CloudProviderAdapter>;

  constructor(
    @InjectDatabase() private readonly db: PrismaClient,
    private readonly audit: AuditService,
    aws: AwsCloudProvider
  ) {
    this.providers = new Map<CloudProvider, CloudProviderAdapter>([[aws.id, aws]]);
  }

  async list(): Promise<CloudAccountDto[]> {
    const accounts = await this.db.cloudAccount.findMany({ orderBy: { createdAt: "desc" } });
    return accounts.map(toDto);
  }

  async create(user: CurrentUser, input: CreateCloudAccount): Promise<CloudAccountDto> {
    this.provider(input.provider); // fail fast on unknown providers

    let account: CloudAccount;
    try {
      account = await this.db.cloudAccount.create({
        data: {
          provider: input.provider,
          name: input.name,
          accountId: input.accountId,
          region: input.region,
          // Not a secret, but must be unguessable and unique per account.
          externalId: `launchpad-${randomBytes(16).toString("hex")}`,
          createdById: user.id
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(
          `AWS account ${input.accountId} is already added. Use "Finish setup" on it instead.`
        );
      }
      throw error;
    }

    await this.audit.record({
      actorId: user.id,
      action: "cloud_account.created",
      targetType: "cloud_account",
      targetId: account.id,
      metadata: { provider: account.provider, name: account.name, region: account.region }
    });

    return toDto(account);
  }

  async setup(id: string): Promise<CloudAccountSetup> {
    const account = await this.find(id);
    const setup = await this.provider(account.provider).describeSetup({
      externalId: account.externalId,
      accountId: requireAccountId(account),
      region: account.region
    });
    return {
      externalId: account.externalId,
      templatePath: `/api/cloud/${account.provider}/access-role.yaml`,
      ...setup
    };
  }

  /**
   * Tries to assume the account's role. With `quiet` (background polling
   * while the user creates the stack), a failure changes nothing and isn't
   * audited; only success is recorded.
   */
  async verify(
    user: CurrentUser,
    id: string,
    options: { roleArn?: string | undefined; quiet?: boolean | undefined }
  ): Promise<CloudAccountDto> {
    const account = await this.find(id);
    const provider = this.provider(account.provider);
    const accountId = requireAccountId(account);
    const roleArn =
      options.roleArn ?? account.roleArn ?? `arn:aws:iam::${accountId}:role/LaunchpadAccess`;

    if (roleArn.split(":")[4] !== accountId) {
      throw new BadRequestException(`That role belongs to a different account than ${accountId}.`);
    }

    try {
      const identity = await provider.verifyAccess({
        roleArn,
        externalId: account.externalId,
        region: account.region,
        sessionName: sessionName(user.login)
      });

      const updated = await this.db.cloudAccount.update({
        where: { id },
        data: {
          roleArn,
          accountId: identity.accountId,
          status: "connected",
          lastVerifiedAt: new Date(),
          lastError: null
        }
      });

      await this.audit.record({
        actorId: user.id,
        action: "cloud_account.connected",
        targetType: "cloud_account",
        targetId: id,
        metadata: { accountId: identity.accountId, roleArn }
      });

      return toDto(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("That AWS account is already connected to Launchpad.");
      }
      if (error instanceof CloudVerificationError) {
        if (options.quiet) return toDto(account);
        const updated = await this.db.cloudAccount.update({
          where: { id },
          data: { roleArn, status: "error", lastError: error.message }
        });
        await this.audit.record({
          actorId: user.id,
          action: "cloud_account.verification_failed",
          targetType: "cloud_account",
          targetId: id,
          metadata: { roleArn, error: error.message }
        });
        // 200 with status "error": the request worked, the account didn't.
        return toDto(updated);
      }
      throw error;
    }
  }

  async remove(user: CurrentUser, id: string): Promise<void> {
    const account = await this.find(id);
    await this.db.cloudAccount.delete({ where: { id } });
    await this.audit.record({
      actorId: user.id,
      action: "cloud_account.removed",
      targetType: "cloud_account",
      targetId: id,
      metadata: { name: account.name, accountId: account.accountId }
    });
  }

  private async find(id: string): Promise<CloudAccount> {
    const account = await this.db.cloudAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException(`Cloud account ${id} not found`);
    return account;
  }

  private provider(id: string): CloudProviderAdapter {
    const provider = this.providers.get(id as CloudProvider);
    if (!provider) throw new NotFoundException(`Unknown cloud provider: ${id}`);
    return provider;
  }
}

/** Accounts are created with an id; older rows may lack one. */
function requireAccountId(account: CloudAccount): string {
  if (!account.accountId) {
    throw new BadRequestException("This account has no AWS account ID. Disconnect it and add it again.");
  }
  return account.accountId;
}

/** Shows up in the customer's CloudTrail, so make it say who did what. */
function sessionName(login: string): string {
  return `launchpad-${login}`.replace(/[^\w+=,.@-]/g, "-").slice(0, 64);
}

function toDto(account: CloudAccount): CloudAccountDto {
  return {
    id: account.id,
    provider: account.provider as CloudProvider,
    name: account.name,
    accountId: account.accountId,
    roleArn: account.roleArn,
    region: account.region,
    status: account.status,
    lastVerifiedAt: account.lastVerifiedAt?.toISOString() ?? null,
    lastError: account.lastError,
    createdAt: account.createdAt.toISOString()
  };
}

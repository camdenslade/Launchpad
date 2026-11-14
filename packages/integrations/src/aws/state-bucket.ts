import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketTaggingCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
  S3Client,
  type BucketLocationConstraint
} from "@aws-sdk/client-s3";
import type { AwsSessionCredentials } from "./credentials.js";

/**
 * One S3 bucket per customer account + region holds Terraform state and
 * saved plans. It lives in the customer's account, so their infrastructure
 * state never leaves it. Name must match the access role's policy.
 */
export function stateBucketName(accountId: string, region: string): string {
  return `launchpad-tfstate-${accountId}-${region}`;
}

export class StateBucket {
  private readonly s3: S3Client;

  constructor(
    readonly name: string,
    private readonly region: string,
    credentials: AwsSessionCredentials
  ) {
    this.s3 = new S3Client({ region, credentials });
  }

  /** Creates the bucket (versioned, private) if it doesn't exist yet. Idempotent. */
  async ensure(): Promise<void> {
    if (await this.exists()) return;

    await this.s3.send(
      new CreateBucketCommand({
        Bucket: this.name,
        // us-east-1 is the default location and must not be specified.
        ...(this.region === "us-east-1"
          ? {}
          : { CreateBucketConfiguration: { LocationConstraint: this.region as BucketLocationConstraint } })
      })
    );

    await this.s3.send(
      new PutPublicAccessBlockCommand({
        Bucket: this.name,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true
        }
      })
    );

    // Versioning lets state be recovered if a write ever goes wrong.
    await this.s3.send(
      new PutBucketVersioningCommand({
        Bucket: this.name,
        VersioningConfiguration: { Status: "Enabled" }
      })
    );

    await this.s3.send(
      new PutBucketTaggingCommand({
        Bucket: this.name,
        Tagging: { TagSet: [{ Key: "managed-by", Value: "launchpad" }] }
      })
    );
  }

  async putObject(key: string, body: Uint8Array | string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.name, Key: key, Body: body, ServerSideEncryption: "AES256" })
    );
  }

  async getObject(key: string): Promise<Uint8Array> {
    const result = await this.s3.send(new GetObjectCommand({ Bucket: this.name, Key: key }));
    if (!result.Body) throw new Error(`s3://${this.name}/${key} is empty`);
    return result.Body.transformToByteArray();
  }

  private async exists(): Promise<boolean> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.name }));
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return false;
      throw error;
    }
  }
}

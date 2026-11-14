terraform {
  # 1.10+ for S3-native state locking (no DynamoDB table needed).
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Partial configuration: Launchpad supplies bucket/key/region at init time.
  # State lives in the customer's own account, never in Launchpad.
  backend "s3" {}
}

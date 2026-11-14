/**
 * CloudFormation template that creates the role Launchpad assumes.
 * Served at GET /api/cloud/aws/access-role.yaml and used by the
 * "Launch in AWS" quick-create link (when AWS_CFN_TEMPLATE_URL points to a
 * public S3 copy of this file).
 *
 * It creates one IAM role whose permissions cover exactly what Launchpad's
 * Terraform modules manage, each scoped to Launchpad-named resources:
 *   - its Terraform state bucket (launchpad-tfstate-<account>-*)
 *   - ECR repositories named launchpad/*
 * When a module is added, its permissions are added here and customers
 * update the stack. Bump TEMPLATE_VERSION whenever this changes.
 *
 * NOTE: `\${...}` below is CloudFormation !Sub syntax, escaped so JavaScript
 * doesn't interpolate it.
 */
export const ACCESS_ROLE_ROLE_NAME = "LaunchpadAccess";
export const ACCESS_ROLE_TEMPLATE_VERSION = 2;

export const ACCESS_ROLE_TEMPLATE = `AWSTemplateFormatVersion: "2010-09-09"
Description: >-
  Lets a self-hosted Launchpad installation manage Launchpad-owned
  infrastructure in this account (template v${ACCESS_ROLE_TEMPLATE_VERSION}).
  Access requires the external ID; permissions are limited to Launchpad-named resources.

Parameters:
  LaunchpadPrincipalArn:
    Type: String
    Description: ARN of the identity your Launchpad server runs as.
    AllowedPattern: "^arn:aws[a-z-]*:iam::[0-9]{12}:(user|role)/.+$"
  ExternalId:
    Type: String
    Description: Unique external ID shown in Launchpad for this account.
    MinLength: 16
  RoleName:
    Type: String
    Default: ${ACCESS_ROLE_ROLE_NAME}

Resources:
  LaunchpadAccessRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Ref RoleName
      Description: Assumed by Launchpad to manage infrastructure in this account.
      MaxSessionDuration: 3600
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              AWS: !Ref LaunchpadPrincipalArn
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                sts:ExternalId: !Ref ExternalId
      Policies:
        - PolicyName: launchpad-terraform-state
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Sid: StateBucket
                Effect: Allow
                Action:
                  - s3:CreateBucket
                  - s3:ListBucket
                  - s3:GetBucketLocation
                  - s3:GetBucketVersioning
                  - s3:PutBucketVersioning
                  - s3:GetBucketPublicAccessBlock
                  - s3:PutBucketPublicAccessBlock
                  - s3:GetEncryptionConfiguration
                  - s3:PutEncryptionConfiguration
                  - s3:PutBucketTagging
                Resource: !Sub "arn:\${AWS::Partition}:s3:::launchpad-tfstate-\${AWS::AccountId}-*"
              - Sid: StateObjects
                Effect: Allow
                Action:
                  - s3:GetObject
                  - s3:PutObject
                  - s3:DeleteObject
                Resource: !Sub "arn:\${AWS::Partition}:s3:::launchpad-tfstate-\${AWS::AccountId}-*/*"
        - PolicyName: launchpad-container-registry
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Sid: LaunchpadRepositories
                Effect: Allow
                Action:
                  - ecr:CreateRepository
                  - ecr:DeleteRepository
                  - ecr:DescribeRepositories
                  - ecr:DescribeImages
                  - ecr:ListImages
                  - ecr:ListTagsForResource
                  - ecr:TagResource
                  - ecr:UntagResource
                  - ecr:GetLifecyclePolicy
                  - ecr:PutLifecyclePolicy
                  - ecr:DeleteLifecyclePolicy
                  - ecr:GetRepositoryPolicy
                  - ecr:SetRepositoryPolicy
                  - ecr:DeleteRepositoryPolicy
                  - ecr:PutImageScanningConfiguration
                  - ecr:PutImageTagMutability
                  - ecr:BatchDeleteImage
                Resource: !Sub "arn:\${AWS::Partition}:ecr:*:\${AWS::AccountId}:repository/launchpad/*"
              - Sid: RegistryLogin
                Effect: Allow
                Action:
                  - ecr:GetAuthorizationToken
                Resource: "*"
      Tags:
        - Key: managed-by
          Value: launchpad

Outputs:
  RoleArn:
    Description: Role Launchpad assumes.
    Value: !GetAtt LaunchpadAccessRole.Arn
`;

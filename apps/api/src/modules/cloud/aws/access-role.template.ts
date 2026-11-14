/**
 * CloudFormation template that creates the role Launchpad assumes.
 * Served at GET /api/cloud/aws/access-role.yaml and used by the
 * "Launch in AWS" quick-create link (when AWS_CFN_TEMPLATE_URL points to a
 * public S3 copy of this file).
 *
 * It creates exactly one IAM role with a trust policy and NO permissions.
 * Permissions are attached later, per infrastructure module.
 */
export const ACCESS_ROLE_ROLE_NAME = "LaunchpadAccess";

export const ACCESS_ROLE_TEMPLATE = `AWSTemplateFormatVersion: "2010-09-09"
Description: >-
  Lets a self-hosted Launchpad installation assume a role in this account.
  Creates one IAM role with no permissions; access requires the external ID.

Parameters:
  LaunchpadPrincipalArn:
    Type: String
    Description: ARN of the identity your Launchpad server runs as.
    AllowedPattern: "^arn:aws[a-z-]*:iam::\\\\d{12}:(user|role)/.+$"
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
      Tags:
        - Key: managed-by
          Value: launchpad

Outputs:
  RoleArn:
    Description: Role Launchpad assumes.
    Value: !GetAtt LaunchpadAccessRole.Arn
`;

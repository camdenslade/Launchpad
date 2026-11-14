/**
 * CloudFormation template that creates the role Launchpad assumes.
 * Served at GET /api/cloud/aws/access-role.yaml and used by the
 * "Launch in AWS" quick-create link (when AWS_CFN_TEMPLATE_URL points to a
 * public S3 copy of this file).
 *
 * The role's permissions cover exactly what Launchpad's Terraform modules
 * manage, each scoped to Launchpad-owned resources:
 *   - names: launchpad-tfstate-<account>-* buckets, launchpad/* ECR repos,
 *     launchpad-* clusters/roles, lp-* load balancers, /launchpad/* log groups
 *   - EC2 networking: may only create resources tagged managed-by=launchpad,
 *     and only modify/delete resources carrying that tag
 *   - IAM: may only create launchpad-* roles that carry the
 *     LaunchpadWorkloadBoundary permissions boundary, pass them only to ECS
 *     tasks, and
 *     only attach AWS's ECS task-execution policy. It cannot modify itself
 *     or remove a boundary.
 *   - GitHub Actions OIDC provider (optional), for keyless deploys.
 *
 * When a module is added, add its permissions here and bump
 * ACCESS_ROLE_TEMPLATE_VERSION; customers then update their stack.
 *
 * Policies are AWS::IAM::ManagedPolicy (6 KB each) rather than inline
 * (10 KB total per role) so the set can grow.
 *
 * NOTE: `\${...}` below is CloudFormation !Sub syntax, escaped so JavaScript
 * doesn't interpolate it.
 */
export const ACCESS_ROLE_ROLE_NAME = "LaunchpadAccess";
export const ACCESS_ROLE_TEMPLATE_VERSION = 4;

export const ACCESS_ROLE_TEMPLATE = `AWSTemplateFormatVersion: "2010-09-09"
Description: >-
  Lets a self-hosted Launchpad installation manage Launchpad-owned
  infrastructure in this account (template v${ACCESS_ROLE_TEMPLATE_VERSION}).
  Access requires the external ID; permissions are limited to Launchpad-owned resources.

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
  CreateGitHubOidcProvider:
    Type: String
    Description: >-
      Create the GitHub Actions OIDC identity provider. Choose "false" if this
      account already has one for token.actions.githubusercontent.com.
    AllowedValues: ["true", "false"]
    Default: "true"

Conditions:
  CreateGitHubOidcProvider: !Equals [!Ref CreateGitHubOidcProvider, "true"]

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
        - Key: launchpad:template-version
          Value: "${ACCESS_ROLE_TEMPLATE_VERSION}"

  # Terraform state bucket + container registries.
  StateAndRegistryPolicy:
    Type: AWS::IAM::ManagedPolicy
    Properties:
      Description: Launchpad - Terraform state bucket and launchpad/* ECR repositories
      Roles: [!Ref LaunchpadAccessRole]
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
            Action: [s3:GetObject, s3:PutObject, s3:DeleteObject]
            Resource: !Sub "arn:\${AWS::Partition}:s3:::launchpad-tfstate-\${AWS::AccountId}-*/*"
          - Sid: Repositories
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
            Action: ecr:GetAuthorizationToken
            Resource: "*"

  # VPC networking, restricted by the managed-by=launchpad tag.
  NetworkPolicy:
    Type: AWS::IAM::ManagedPolicy
    Properties:
      Description: Launchpad - VPC networking for resources tagged managed-by=launchpad
      Roles: [!Ref LaunchpadAccessRole]
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Sid: Read
            Effect: Allow
            Action: ec2:Describe*
            Resource: "*"
          - Sid: CreateOnlyWhenTagged
            Effect: Allow
            Action:
              - ec2:CreateVpc
              - ec2:CreateSubnet
              - ec2:CreateInternetGateway
              - ec2:CreateRouteTable
              - ec2:CreateSecurityGroup
              - ec2:AuthorizeSecurityGroupIngress
              - ec2:AuthorizeSecurityGroupEgress
            Resource: "*"
            Condition:
              StringEquals:
                aws:RequestTag/managed-by: launchpad
          - Sid: CreateInsideLaunchpadVpc
            Effect: Allow
            Action: [ec2:CreateSubnet, ec2:CreateRouteTable, ec2:CreateSecurityGroup]
            Resource: !Sub "arn:\${AWS::Partition}:ec2:*:\${AWS::AccountId}:vpc/*"
            Condition:
              StringEquals:
                ec2:ResourceTag/managed-by: launchpad
          - Sid: TagOnCreate
            Effect: Allow
            Action: ec2:CreateTags
            Resource: "*"
            Condition:
              StringEquals:
                ec2:CreateAction:
                  - CreateVpc
                  - CreateSubnet
                  - CreateInternetGateway
                  - CreateRouteTable
                  - CreateSecurityGroup
                  - AuthorizeSecurityGroupIngress
                  - AuthorizeSecurityGroupEgress
          - Sid: ManageOnlyTagged
            Effect: Allow
            Action:
              - ec2:ModifyVpcAttribute
              - ec2:DeleteVpc
              - ec2:ModifySubnetAttribute
              - ec2:DeleteSubnet
              - ec2:AttachInternetGateway
              - ec2:DetachInternetGateway
              - ec2:DeleteInternetGateway
              - ec2:CreateRoute
              - ec2:ReplaceRoute
              - ec2:DeleteRoute
              - ec2:AssociateRouteTable
              - ec2:DisassociateRouteTable
              - ec2:DeleteRouteTable
              - ec2:AuthorizeSecurityGroupIngress
              - ec2:AuthorizeSecurityGroupEgress
              - ec2:RevokeSecurityGroupIngress
              - ec2:RevokeSecurityGroupEgress
              - ec2:ModifySecurityGroupRules
              - ec2:UpdateSecurityGroupRuleDescriptionsIngress
              - ec2:UpdateSecurityGroupRuleDescriptionsEgress
              - ec2:DeleteSecurityGroup
              - ec2:CreateTags
              - ec2:DeleteTags
            Resource: "*"
            Condition:
              StringEquals:
                ec2:ResourceTag/managed-by: launchpad

  # ECS, load balancers, logs, and the service's own IAM roles.
  ComputePolicy:
    Type: AWS::IAM::ManagedPolicy
    Properties:
      Description: Launchpad - ECS services, load balancers, logs and launchpad-* task roles
      Roles: [!Ref LaunchpadAccessRole]
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Sid: EcsLaunchpadResources
            Effect: Allow
            Action:
              - ecs:CreateCluster
              - ecs:DeleteCluster
              - ecs:DescribeClusters
              - ecs:UpdateCluster
              - ecs:UpdateClusterSettings
              - ecs:PutClusterCapacityProviders
              - ecs:CreateService
              - ecs:UpdateService
              - ecs:DeleteService
              - ecs:DescribeServices
              - ecs:TagResource
              - ecs:UntagResource
              - ecs:ListTagsForResource
            Resource:
              - !Sub "arn:\${AWS::Partition}:ecs:*:\${AWS::AccountId}:cluster/launchpad-*"
              - !Sub "arn:\${AWS::Partition}:ecs:*:\${AWS::AccountId}:service/launchpad-*/*"
              - !Sub "arn:\${AWS::Partition}:ecs:*:\${AWS::AccountId}:task-definition/launchpad-*:*"
          - Sid: EcsTaskDefinitions
            # These actions don't support resource-level permissions.
            Effect: Allow
            Action:
              - ecs:RegisterTaskDefinition
              - ecs:DeregisterTaskDefinition
              - ecs:DescribeTaskDefinition
              - ecs:ListTaskDefinitions
            Resource: "*"
          - Sid: LoadBalancersRead
            Effect: Allow
            Action: elasticloadbalancing:Describe*
            Resource: "*"
          - Sid: LoadBalancersLaunchpad
            Effect: Allow
            Action: elasticloadbalancing:*
            Resource:
              - !Sub "arn:\${AWS::Partition}:elasticloadbalancing:*:\${AWS::AccountId}:loadbalancer/app/lp-*/*"
              - !Sub "arn:\${AWS::Partition}:elasticloadbalancing:*:\${AWS::AccountId}:targetgroup/lp-*/*"
              - !Sub "arn:\${AWS::Partition}:elasticloadbalancing:*:\${AWS::AccountId}:listener/app/lp-*/*/*"
              - !Sub "arn:\${AWS::Partition}:elasticloadbalancing:*:\${AWS::AccountId}:listener-rule/app/lp-*/*/*/*"
          - Sid: LogsRead
            Effect: Allow
            Action: logs:DescribeLogGroups
            Resource: "*"
          - Sid: LogsLaunchpad
            Effect: Allow
            Action:
              - logs:CreateLogGroup
              - logs:DeleteLogGroup
              - logs:PutRetentionPolicy
              - logs:DeleteRetentionPolicy
              - logs:TagResource
              - logs:UntagResource
              - logs:TagLogGroup
              - logs:ListTagsForResource
              - logs:ListTagsLogGroup
            Resource:
              - !Sub "arn:\${AWS::Partition}:logs:*:\${AWS::AccountId}:log-group:/launchpad/*"
              - !Sub "arn:\${AWS::Partition}:logs:*:\${AWS::AccountId}:log-group:/launchpad/*:*"

  # The ceiling for every role Launchpad creates (task, execution and deploy
  # roles). Whatever is attached to a launchpad-* role, it can never do more
  # than this, which is what makes letting Launchpad create roles safe.
  WorkloadBoundary:
    Type: AWS::IAM::ManagedPolicy
    Properties:
      ManagedPolicyName: LaunchpadWorkloadBoundary
      Description: Launchpad - maximum permissions of any role Launchpad creates (permissions boundary)
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Sid: RegistryLogin
            Effect: Allow
            Action: ecr:GetAuthorizationToken
            Resource: "*"
          - Sid: PullAndPushImages
            Effect: Allow
            Action:
              - ecr:BatchGetImage
              - ecr:GetDownloadUrlForLayer
              - ecr:BatchCheckLayerAvailability
              - ecr:InitiateLayerUpload
              - ecr:UploadLayerPart
              - ecr:CompleteLayerUpload
              - ecr:PutImage
              - ecr:DescribeImages
            Resource: !Sub "arn:\${AWS::Partition}:ecr:*:\${AWS::AccountId}:repository/launchpad/*"
          - Sid: WriteLogs
            Effect: Allow
            Action: [logs:CreateLogStream, logs:PutLogEvents]
            Resource: !Sub "arn:\${AWS::Partition}:logs:*:\${AWS::AccountId}:log-group:/launchpad/*:*"
          - Sid: DeployTaskDefinitions
            Effect: Allow
            Action: [ecs:RegisterTaskDefinition, ecs:DescribeTaskDefinition]
            Resource: "*"
          - Sid: DeployServices
            Effect: Allow
            Action: [ecs:UpdateService, ecs:DescribeServices]
            Resource: !Sub "arn:\${AWS::Partition}:ecs:*:\${AWS::AccountId}:service/launchpad-*/*"
          - Sid: PassWorkloadRolesToEcsTasks
            Effect: Allow
            Action: iam:PassRole
            Resource: !Sub "arn:\${AWS::Partition}:iam::\${AWS::AccountId}:role/launchpad-*"
            Condition:
              StringEquals:
                iam:PassedToService: ecs-tasks.amazonaws.com

  # Lets the access role manage launchpad-* roles, only ever with the boundary.
  WorkloadRolesPolicy:
    Type: AWS::IAM::ManagedPolicy
    Properties:
      Description: Launchpad - create and manage launchpad-* roles, always capped by LaunchpadWorkloadBoundary
      Roles: [!Ref LaunchpadAccessRole]
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Sid: ManageWorkloadRoles
            Effect: Allow
            Action:
              - iam:GetRole
              - iam:DeleteRole
              - iam:UpdateRole
              - iam:UpdateRoleDescription
              - iam:UpdateAssumeRolePolicy
              - iam:TagRole
              - iam:UntagRole
              - iam:ListRoleTags
              - iam:ListAttachedRolePolicies
              - iam:ListRolePolicies
              - iam:GetRolePolicy
              - iam:DeleteRolePolicy
              - iam:DetachRolePolicy
              - iam:ListInstanceProfilesForRole
            Resource: !Sub "arn:\${AWS::Partition}:iam::\${AWS::AccountId}:role/launchpad-*"
          - Sid: CreateAndGrantOnlyWithBoundary
            Effect: Allow
            Action: [iam:CreateRole, iam:PutRolePolicy]
            Resource: !Sub "arn:\${AWS::Partition}:iam::\${AWS::AccountId}:role/launchpad-*"
            Condition:
              StringEquals:
                iam:PermissionsBoundary: !Ref WorkloadBoundary
          - Sid: AttachOnlyTaskExecutionPolicy
            Effect: Allow
            Action: iam:AttachRolePolicy
            Resource: !Sub "arn:\${AWS::Partition}:iam::\${AWS::AccountId}:role/launchpad-*"
            Condition:
              ArnEquals:
                iam:PolicyARN: !Sub "arn:\${AWS::Partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
              StringEquals:
                iam:PermissionsBoundary: !Ref WorkloadBoundary
          - Sid: PassRolesOnlyToEcsTasks
            Effect: Allow
            Action: iam:PassRole
            Resource: !Sub "arn:\${AWS::Partition}:iam::\${AWS::AccountId}:role/launchpad-*"
            Condition:
              StringEquals:
                iam:PassedToService: ecs-tasks.amazonaws.com
          - Sid: NeverRemoveTheBoundary
            Effect: Deny
            Action: [iam:DeleteRolePermissionsBoundary, iam:PutRolePermissionsBoundary]
            Resource: !Sub "arn:\${AWS::Partition}:iam::\${AWS::AccountId}:role/launchpad-*"
          - Sid: ServiceLinkedRoles
            # First use of ECS / load balancing in an account creates these.
            Effect: Allow
            Action: iam:CreateServiceLinkedRole
            Resource: "*"
            Condition:
              StringEquals:
                iam:AWSServiceName:
                  - ecs.amazonaws.com
                  - elasticloadbalancing.amazonaws.com

  # Lets GitHub Actions authenticate to this account with short-lived OIDC
  # tokens instead of stored AWS keys. One per account; skip if it exists.
  GitHubOidcProvider:
    Type: AWS::IAM::OIDCProvider
    Condition: CreateGitHubOidcProvider
    Properties:
      Url: https://token.actions.githubusercontent.com
      ClientIdList: [sts.amazonaws.com]
      Tags:
        - Key: managed-by
          Value: launchpad

Outputs:
  RoleArn:
    Description: Role Launchpad assumes.
    Value: !GetAtt LaunchpadAccessRole.Arn
  TemplateVersion:
    Value: "${ACCESS_ROLE_TEMPLATE_VERSION}"
`;

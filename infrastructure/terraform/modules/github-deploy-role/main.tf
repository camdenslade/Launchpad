# An IAM role GitHub Actions can assume with OIDC to deploy ONE environment:
# push images to its registry and roll its ECS service to a new task
# definition. No long-lived AWS keys are stored in GitHub.
#
# Trust is pinned to a single repository AND a single GitHub environment, so
# only workflow jobs declaring `environment: <name>` in that repository can
# assume it. GitHub environment protection rules (required reviewers, branch
# restrictions) therefore gate deploys too.

data "aws_partition" "current" {}
data "aws_caller_identity" "current" {}

locals {
  oidc_host         = "token.actions.githubusercontent.com"
  oidc_provider_arn = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${local.oidc_host}"
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values   = ["repo:${var.github_repository}:environment:${var.github_environment}"]
    }
  }
}

resource "aws_iam_role" "this" {
  name                 = substr("launchpad-${var.name}-deploy", 0, 64)
  description          = "GitHub Actions deploys of ${var.github_repository} to ${var.github_environment}"
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  permissions_boundary = var.permissions_boundary_arn
  max_session_duration = 3600
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "RegistryLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "PushImages"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
      "ecr:DescribeImages"
    ]
    resources = [var.ecr_repository_arn]
  }

  statement {
    sid = "ReadAndRegisterTaskDefinitions"
    # These ECS actions don't support resource-level permissions.
    actions   = ["ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"]
    resources = ["*"]
  }

  statement {
    sid       = "RollTheService"
    actions   = ["ecs:UpdateService", "ecs:DescribeServices"]
    resources = [var.ecs_service_arn]
  }

  statement {
    sid       = "PassOnlyThisServicesRoles"
    actions   = ["iam:PassRole"]
    resources = var.pass_role_arns

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.deploy.json
}

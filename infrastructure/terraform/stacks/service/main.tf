# The "service" stack: everything one environment of a project needs.
# Launchpad runs this per environment; platform teams extend it by adding
# modules here behind input variables.
#
#   registry  always      (free while empty)
#   network   if enabled  (VPC/subnets: no hourly cost)
#   service   if enabled  (ALB + Fargate: ~$25/month while running)
#   deploy    if enabled and the project is on GitHub (IAM role: free)

provider "aws" {
  region = var.region

  # Every resource is traceable back to Launchpad and its environment, and the
  # access role's permissions key off the "managed-by" tag.
  default_tags {
    tags = {
      "managed-by"            = "launchpad"
      "launchpad:environment" = var.environment_slug
      "launchpad:kind"        = var.environment_kind
    }
  }
}

data "aws_partition" "current" {}
data "aws_caller_identity" "current" {}

locals {
  is_production = var.environment_kind == "production"

  # Every role Launchpad creates must carry this boundary (created by the
  # access-role CloudFormation template); the access role enforces it.
  permissions_boundary_arn = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:policy/LaunchpadWorkloadBoundary"
}

module "registry" {
  source = "../../modules/container-registry"

  name           = "launchpad/${var.environment_slug}"
  immutable_tags = local.is_production
  # Non-production registries can be torn down even with images in them.
  force_delete = !local.is_production
}

module "network" {
  source = "../../modules/network"
  count  = var.service.enabled ? 1 : 0

  name = var.environment_slug
}

module "service" {
  source = "../../modules/ecs-service"
  count  = var.service.enabled ? 1 : 0

  name              = var.environment_slug
  region            = var.region
  vpc_id            = module.network[0].vpc_id
  subnet_ids        = module.network[0].public_subnet_ids
  image             = var.service.image
  container_port    = var.service.container_port
  health_check_path = var.service.health_check_path
  cpu               = var.service.cpu
  memory            = var.service.memory
  desired_count     = var.service.desired_count

  permissions_boundary_arn = local.permissions_boundary_arn
}

module "deploy_role" {
  source = "../../modules/github-deploy-role"
  count  = var.service.enabled && var.github_repository != null ? 1 : 0

  name               = var.environment_slug
  github_repository  = var.github_repository
  github_environment = var.environment_name
  ecr_repository_arn = module.registry.repository_arn
  ecs_service_arn    = module.service[0].service_arn
  pass_role_arns     = [module.service[0].execution_role_arn, module.service[0].task_role_arn]

  permissions_boundary_arn = local.permissions_boundary_arn
}

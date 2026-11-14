# The "service" stack: everything one environment of a project needs.
# Launchpad runs this per environment; platform teams extend it by adding
# modules here behind input variables.
#
#   registry  always      (free while empty)
#   network   if enabled  (VPC/subnets: no hourly cost)
#   service   if enabled  (ALB + Fargate: ~$25/month while running)

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

locals {
  is_production = var.environment_kind == "production"
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
}

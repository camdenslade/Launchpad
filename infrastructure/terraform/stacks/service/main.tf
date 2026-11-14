# The "service" stack: everything one environment of a project needs.
# Launchpad runs this per environment; platform teams extend it by adding
# modules here (e.g. ECS service, database) behind input variables.

provider "aws" {
  region = var.region

  # Every resource is traceable back to Launchpad, the project and environment.
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

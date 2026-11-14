# Offline tests for the service stack: real plans against a mocked AWS
# provider, so they need no credentials and create nothing.
#
#   terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = {
      names = ["us-east-1a", "us-east-1b", "us-east-1c"]
    }
  }

  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  environment_slug = "payments-api-staging"
  environment_kind = "staging"
  environment_name = "staging"
  region           = "us-east-1"
}

run "service_is_opt_in" {
  command = plan

  assert {
    condition     = length(module.network) == 0 && length(module.service) == 0
    error_message = "Network and service must not be planned unless service.enabled is true (they cost money)."
  }

  assert {
    condition     = output.service_url == null
    error_message = "service_url should be null when the service is off."
  }
}

run "registry_name_and_production_safety" {
  command = plan

  variables {
    environment_kind = "production"
  }

  assert {
    condition     = module.registry.repository_name == "launchpad/payments-api-staging"
    error_message = "Registry must live under launchpad/ (the access role is scoped to that prefix)."
  }
}

run "service_enabled_plans_everything" {
  command = plan

  variables {
    service = { enabled = true }
  }

  assert {
    condition     = length(module.network) == 1 && length(module.service) == 1
    error_message = "Enabling the service must plan the network and the service."
  }

  assert {
    condition     = module.service[0].cluster_name == "launchpad-payments-api-staging"
    error_message = "Cluster should be named launchpad-<slug>."
  }

  assert {
    condition     = alltrue([for name in module.service[0].role_names : startswith(name, "launchpad-")])
    error_message = "IAM roles must start with launchpad- (iam:PassRole is scoped to that prefix)."
  }
}

run "long_slugs_fit_aws_name_limits" {
  command = plan

  variables {
    environment_slug = "an-unusually-long-project-name-for-testing-production"
    service          = { enabled = true, container_port = 8080 }
  }

  assert {
    condition     = length(module.service[0].load_balancer_name) <= 32 && !endswith(module.service[0].load_balancer_name, "-")
    error_message = "Load balancer names must be <= 32 characters and not end with a dash."
  }

  assert {
    condition     = length(module.service[0].target_group_name) <= 32 && !endswith(module.service[0].target_group_name, "-")
    error_message = "Target group names must be <= 32 characters and not end with a dash."
  }

  assert {
    condition     = alltrue([for name in module.service[0].role_names : length(name) <= 64])
    error_message = "IAM role names must be <= 64 characters."
  }
}

run "rejects_invalid_slug" {
  command = plan

  variables {
    environment_slug = "Not_A_Valid_Slug"
  }

  expect_failures = [var.environment_slug]
}

run "deploy_role_only_for_github_projects" {
  command = plan

  variables {
    service = { enabled = true }
  }

  assert {
    condition     = length(module.deploy_role) == 0
    error_message = "No deploy role without a GitHub repository."
  }
}

run "deploy_role_trust_is_pinned" {
  command = plan

  variables {
    service           = { enabled = true }
    github_repository = "acme/payments-api"
  }

  assert {
    condition     = module.deploy_role[0].oidc_subject == "repo:acme/payments-api:environment:staging"
    error_message = "Deploy role must trust exactly one repository and GitHub environment."
  }

  assert {
    condition     = startswith(module.deploy_role[0].role_name, "launchpad-")
    error_message = "Deploy role must be named launchpad-* (the access role is scoped to that prefix)."
  }

  assert {
    condition     = output.permissions_boundary_arn == "arn:aws:iam::123456789012:policy/LaunchpadWorkloadBoundary"
    error_message = "Roles must use the LaunchpadWorkloadBoundary permissions boundary."
  }
}

run "deploy_role_rejects_bad_repository" {
  command = plan

  variables {
    service           = { enabled = true }
    github_repository = "not a repo"
  }

  expect_failures = [var.github_repository]
}

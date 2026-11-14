variable "name" {
  description = "Environment slug; the role is named launchpad-<name>-deploy."
  type        = string
}

variable "github_repository" {
  description = "owner/name of the repository allowed to deploy."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must look like owner/name."
  }
}

variable "github_environment" {
  description = "GitHub environment the deploy job must declare (environment: <name>)."
  type        = string
}

variable "ecr_repository_arn" {
  type = string
}

variable "ecs_service_arn" {
  type = string
}

variable "pass_role_arns" {
  description = "The service's execution and task roles (needed to register task definitions)."
  type        = list(string)
}

variable "permissions_boundary_arn" {
  description = "LaunchpadWorkloadBoundary; required by the access role for every role it creates."
  type        = string
  default     = null
}

# Set by Launchpad for every run.

variable "environment_slug" {
  description = "Immutable resource-name prefix for the environment, e.g. payments-api-staging."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,62}$", var.environment_slug))
    error_message = "environment_slug must be lowercase letters, digits and dashes."
  }
}

variable "environment_kind" {
  description = "development, staging or production."
  type        = string

  validation {
    condition     = contains(["development", "staging", "production"], var.environment_kind)
    error_message = "environment_kind must be development, staging or production."
  }
}

variable "region" {
  description = "AWS region to deploy into."
  type        = string
}

# Developer-facing inputs (Environment settings in Launchpad).

variable "service" {
  description = "Run the project as a load-balanced ECS Fargate service."
  type = object({
    enabled           = optional(bool, false)
    image             = optional(string, "public.ecr.aws/nginx/nginx:stable-alpine")
    container_port    = optional(number, 80)
    health_check_path = optional(string, "/")
    cpu               = optional(number, 256)
    memory            = optional(number, 512)
    desired_count     = optional(number, 1)
  })
  default = {}

  validation {
    condition     = var.service.desired_count >= 0 && var.service.desired_count <= 10
    error_message = "desired_count must be between 0 and 10."
  }
}

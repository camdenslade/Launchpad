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

variable "name" {
  description = "Repository name. Must start with \"launchpad/\" (the access role is scoped to that prefix)."
  type        = string

  validation {
    condition     = startswith(var.name, "launchpad/")
    error_message = "Repository names must start with \"launchpad/\"."
  }
}

variable "immutable_tags" {
  description = "Prevent overwriting an existing image tag (recommended for production)."
  type        = bool
  default     = false
}

variable "force_delete" {
  description = "Allow deleting the repository even if it still contains images."
  type        = bool
  default     = false
}

variable "max_image_count" {
  description = "How many images to keep."
  type        = number
  default     = 30
}

variable "untagged_image_expiry_days" {
  description = "Days before untagged images are removed."
  type        = number
  default     = 7
}

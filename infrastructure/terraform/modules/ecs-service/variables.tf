variable "name" {
  description = "Environment slug; used to name every resource."
  type        = string
}

variable "region" {
  description = "AWS region (for the log driver)."
  type        = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Subnets for the load balancer and tasks (at least 2 AZs)."
  type        = list(string)
}

variable "image" {
  description = "Initial container image. Later deployments replace it."
  type        = string
}

variable "container_port" {
  description = "Port the app listens on inside the container."
  type        = number
  default     = 8080
}

variable "health_check_path" {
  description = "Path the load balancer polls; must return 2xx/3xx when healthy."
  type        = string
  default     = "/"
}

variable "cpu" {
  description = "Fargate CPU units (256 = 0.25 vCPU)."
  type        = number
  default     = 256
}

variable "memory" {
  description = "Fargate memory in MiB (must be a valid pairing with cpu)."
  type        = number
  default     = 512
}

variable "cpu_architecture" {
  description = "X86_64 or ARM64 (ARM64/Graviton is ~20% cheaper if the image supports it)."
  type        = string
  default     = "X86_64"

  validation {
    condition     = contains(["X86_64", "ARM64"], var.cpu_architecture)
    error_message = "cpu_architecture must be X86_64 or ARM64."
  }
}

variable "desired_count" {
  description = "How many copies of the service to run."
  type        = number
  default     = 1
}

variable "environment" {
  description = "Plain (non-secret) environment variables for the container."
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "container_insights" {
  description = "Enable CloudWatch Container Insights (extra cost)."
  type        = bool
  default     = false
}

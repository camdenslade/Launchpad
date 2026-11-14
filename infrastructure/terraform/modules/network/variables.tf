variable "name" {
  description = "Name used in resource Name tags (the environment slug)."
  type        = string
}

variable "cidr_block" {
  description = "VPC address range."
  type        = string
  default     = "10.40.0.0/16"
}

variable "az_count" {
  description = "Availability zones to spread subnets across (a load balancer needs at least 2)."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2
    error_message = "An Application Load Balancer requires at least 2 availability zones."
  }
}

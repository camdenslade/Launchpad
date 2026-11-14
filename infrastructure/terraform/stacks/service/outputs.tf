output "registry_url" {
  description = "Where CI pushes this environment's images."
  value       = module.registry.repository_url
}

output "service_url" {
  description = "Public URL of the running service (null when the service is off)."
  value       = try(module.service[0].url, null)
}

output "ecs_cluster" {
  value = try(module.service[0].cluster_name, null)
}

output "ecs_service" {
  value = try(module.service[0].service_name, null)
}

output "task_definition_family" {
  description = "Deployments register new revisions of this family."
  value       = try(module.service[0].task_definition_family, null)
}

output "log_group" {
  value = try(module.service[0].log_group_name, null)
}

output "deploy_role_arn" {
  description = "Role GitHub Actions assumes (OIDC) to deploy this environment."
  value       = try(module.deploy_role[0].role_arn, null)
}

output "deploy_oidc_subject" {
  value = try(module.deploy_role[0].oidc_subject, null)
}

output "container_name" {
  value = try(module.service[0].container_name, null)
}

output "aws_region" {
  value = var.region
}

output "permissions_boundary_arn" {
  description = "Boundary applied to every role this stack creates."
  value       = local.permissions_boundary_arn
}

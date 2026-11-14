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

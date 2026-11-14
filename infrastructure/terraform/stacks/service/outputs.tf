output "registry_url" {
  description = "Where CI pushes this environment's images."
  value       = module.registry.repository_url
}

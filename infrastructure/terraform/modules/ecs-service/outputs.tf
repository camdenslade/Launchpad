output "url" {
  description = "Public URL of the service."
  value       = "http://${aws_lb.this.dns_name}"
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "service_name" {
  value = aws_ecs_service.this.name
}

output "task_definition_family" {
  description = "Deployments register new revisions of this family."
  value       = aws_ecs_task_definition.this.family
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.this.name
}

output "execution_role_arn" {
  value = aws_iam_role.execution.arn
}

output "task_role_arn" {
  value = aws_iam_role.task.arn
}

output "load_balancer_name" {
  value = aws_lb.this.name
}

output "target_group_name" {
  value = aws_lb_target_group.this.name
}

output "role_names" {
  description = "IAM roles created (all prefixed launchpad-)."
  value       = [aws_iam_role.execution.name, aws_iam_role.task.name]
}

output "service_arn" {
  value = aws_ecs_service.this.id
}

output "container_name" {
  description = "Container to update when deploying a new image."
  value       = "app"
}

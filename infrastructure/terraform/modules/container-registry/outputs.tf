output "repository_url" {
  description = "URL to push images to (docker push <url>:<tag>)."
  value       = aws_ecr_repository.this.repository_url
}

output "repository_arn" {
  value = aws_ecr_repository.this.arn
}

output "repository_name" {
  value = aws_ecr_repository.this.name
}

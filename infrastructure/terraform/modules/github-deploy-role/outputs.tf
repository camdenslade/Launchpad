output "role_arn" {
  description = "Use as role-to-assume in aws-actions/configure-aws-credentials."
  value       = aws_iam_role.this.arn
}

output "role_name" {
  value = aws_iam_role.this.name
}

output "oidc_subject" {
  description = "The only GitHub OIDC subject allowed to assume the role."
  value       = "repo:${var.github_repository}:environment:${var.github_environment}"
}

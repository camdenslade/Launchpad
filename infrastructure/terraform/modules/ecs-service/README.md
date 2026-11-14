# ecs-service

One containerised service on **ECS Fargate** behind an **Application Load
Balancer**, logging to CloudWatch. Deployments that never become healthy are
rolled back automatically (ECS deployment circuit breaker).

Terraform owns the service's *shape* (size, count, networking). Deployments
own *which image is running*: they register new task-definition revisions,
and `ignore_changes = [task_definition]` keeps Terraform from undoing them.

**Rough cost (us-east-1, running 24/7):** ALB ~$16/mo + one 0.25 vCPU /
0.5 GB task ~$9/mo. Tearing the environment down stops all charges.

| Input | Default | Description |
|---|---|---|
| `name` | (required) | Environment slug |
| `region`, `vpc_id`, `subnet_ids` | (required) | From the stack / `network` module |
| `image` | (required) | Initial image; deployments replace it |
| `container_port` | `8080` | Port the app listens on |
| `health_check_path` | `/` | Must return 2xx/3xx |
| `cpu` / `memory` | `256` / `512` | Fargate size |
| `cpu_architecture` | `X86_64` | `ARM64` is cheaper if the image supports it |
| `desired_count` | `1` | Copies to run |
| `environment` | `{}` | Non-secret environment variables |
| `log_retention_days` | `14` | |
| `container_insights` | `false` | Extra metrics (extra cost) |

Outputs: `url`, `cluster_name`, `service_name`, `task_definition_family`,
`log_group_name`, `execution_role_arn`, `task_role_arn`.

**IAM:** the task role starts with no permissions. Roles are named
`launchpad-*`, matching the access role's scoped `iam:PassRole`.

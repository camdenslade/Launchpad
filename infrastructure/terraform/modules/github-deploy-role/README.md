# github-deploy-role

An IAM role that GitHub Actions assumes via **OIDC** to deploy one
environment. No AWS keys are stored in GitHub.

- **Trust:** only `repo:<github_repository>:environment:<github_environment>`,
  so only workflow jobs that declare `environment: <name>` in that repository
  can assume it. GitHub environment protection rules (required reviewers,
  allowed branches) therefore also gate deployments.
- **Permissions:** push to this environment's ECR repository, register task
  definitions, update this environment's ECS service, and pass only this
  service's two roles to ECS tasks.
- **Boundary:** `LaunchpadWorkloadBoundary` caps the role regardless of its
  policy.

Requires the account's GitHub OIDC provider
(`token.actions.githubusercontent.com`), which the Launchpad access-role
CloudFormation template creates.

| Input | Description |
|---|---|
| `name` | Environment slug (role: `launchpad-<name>-deploy`) |
| `github_repository` | `owner/name` |
| `github_environment` | GitHub environment name the job must use |
| `ecr_repository_arn`, `ecs_service_arn` | What it may deploy |
| `pass_role_arns` | The service's execution and task roles |
| `permissions_boundary_arn` | `LaunchpadWorkloadBoundary` |

Outputs: `role_arn`, `role_name`, `oidc_subject`.

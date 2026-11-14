# container-registry

An Amazon ECR repository for one environment's container images, with image
scanning, encryption, and a lifecycle policy that bounds storage cost.

| Input | Default | Description |
|---|---|---|
| `name` | (required) | Must start with `launchpad/` |
| `immutable_tags` | `false` | Forbid overwriting tags (use for production) |
| `force_delete` | `false` | Allow deleting a repository that still has images |
| `max_image_count` | `30` | Images to keep |
| `untagged_image_expiry_days` | `7` | Days before untagged images expire |

Outputs: `repository_url`, `repository_arn`, `repository_name`.

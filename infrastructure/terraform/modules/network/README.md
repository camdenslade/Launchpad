# network

A VPC with public subnets in `az_count` availability zones, an internet
gateway and a public route table. **No NAT gateway** by design (it costs
~$32/month on its own): Fargate tasks run in the public subnets with public
IPs, and the `ecs-service` module's security groups only allow traffic from
the load balancer.

If a workload needs private subnets, add a `private_subnets` option with a
NAT gateway here rather than changing the default.

| Input | Default | Description |
|---|---|---|
| `name` | (required) | Used in `Name` tags |
| `cidr_block` | `10.40.0.0/16` | VPC range |
| `az_count` | `2` | Availability zones (min 2 for an ALB) |

Outputs: `vpc_id`, `public_subnet_ids`.

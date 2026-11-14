# Runs one containerised service on ECS Fargate behind an Application Load
# Balancer, with logs in CloudWatch.
#
# Naming: AWS caps ALB/target group names at 32 characters, so those use a
# short "lp-" prefix. IAM roles are named "launchpad-*" because the access
# role's iam:PassRole permission is scoped to that prefix.

locals {
  short_name = replace(substr("lp-${var.name}", 0, 32), "/-+$/", "")
  # Target groups are replaced (create-before-destroy) when their port
  # changes, so the port is part of the name to avoid collisions.
  tg_name = replace(substr("lp-${var.container_port}-${var.name}", 0, 32), "/-+$/", "")
}

data "aws_partition" "current" {}

# --- Logs --------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "this" {
  name              = "/launchpad/${var.name}"
  retention_in_days = var.log_retention_days
}

# --- Cluster -----------------------------------------------------------------

resource "aws_ecs_cluster" "this" {
  name = "launchpad-${var.name}"

  setting {
    name = "containerInsights"
    # Container Insights adds CloudWatch metric costs; off by default.
    value = var.container_insights ? "enabled" : "disabled"
  }
}

# --- IAM ---------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Used by ECS itself: pull the image, write logs.
resource "aws_iam_role" "execution" {
  name               = substr("launchpad-${var.name}-exec", 0, 64)
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Used by the application. Starts with no permissions; grant only what the
# app needs through a dedicated module input when that's added.
resource "aws_iam_role" "task" {
  name               = substr("launchpad-${var.name}-task", 0, 64)
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

# --- Networking --------------------------------------------------------------

resource "aws_security_group" "alb" {
  name        = "launchpad-${var.name}-alb"
  description = "Public HTTP to the ${var.name} load balancer"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from anywhere"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_service" {
  security_group_id            = aws_security_group.alb.id
  description                  = "To service tasks"
  ip_protocol                  = "tcp"
  from_port                    = var.container_port
  to_port                      = var.container_port
  referenced_security_group_id = aws_security_group.service.id
}

resource "aws_security_group" "service" {
  name        = "launchpad-${var.name}-service"
  description = "${var.name} tasks, inbound only from the load balancer"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "service_from_alb" {
  security_group_id            = aws_security_group.service.id
  description                  = "App traffic from the load balancer"
  ip_protocol                  = "tcp"
  from_port                    = var.container_port
  to_port                      = var.container_port
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_vpc_security_group_egress_rule" "service_all" {
  security_group_id = aws_security_group.service.id
  description       = "Outbound (image pulls, external APIs)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# --- Load balancer -----------------------------------------------------------

resource "aws_lb" "this" {
  name               = local.short_name
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.subnet_ids
}

resource "aws_lb_target_group" "this" {
  name        = local.tg_name
  port        = var.container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  # Faster deploys: drain old tasks for 30s instead of the 300s default.
  deregistration_delay = 30

  health_check {
    path                = var.health_check_path
    matcher             = "200-399"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }
}

# --- Service -----------------------------------------------------------------

resource "aws_ecs_task_definition" "this" {
  family                   = "launchpad-${var.name}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name         = "app"
      image        = var.image
      essential    = true
      portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]
      environment  = [for key in sort(keys(var.environment)) : { name = key, value = var.environment[key] }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.this.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "app"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "this" {
  name            = "launchpad-${var.name}"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  # Give a fresh task time to boot before health checks count against it.
  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = true # public subnets, no NAT (see the network module)
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = "app"
    container_port   = var.container_port
  }

  # A deploy that never becomes healthy is rolled back automatically.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    # Deployments register new task definition revisions with new image tags.
    # Terraform owns the service's shape, not which revision is running, so
    # the next plan must not roll a deployment back.
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener.http]
}

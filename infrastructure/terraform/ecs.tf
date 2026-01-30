# =============================================================================
# ECS Cluster, Task Definition, and Service
# =============================================================================

# -----------------------------------------------------------------------------
# ECR Repository
# -----------------------------------------------------------------------------

resource "aws_ecr_repository" "app" {
  name                 = "gtm-brain"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name = "${local.name_prefix}-ecr"
  }
}

# Lifecycle policy to keep only recent images
resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# CloudWatch Log Group
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = 30

  tags = {
    Name = "${local.name_prefix}-logs"
  }
}

# -----------------------------------------------------------------------------
# ECS Cluster
# -----------------------------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${local.name_prefix}-cluster"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# -----------------------------------------------------------------------------
# ECS Task Definition
# -----------------------------------------------------------------------------

resource "aws_ecs_task_definition" "app" {
  family                   = "${local.name_prefix}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.container_cpu
  memory                   = var.container_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "gtm-brain"
      image = var.container_image != "" ? var.container_image : "${aws_ecr_repository.app.repository_url}:latest"
      
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "NODE_ENV"
          value = "production"
        },
        {
          name  = "INTEL_DB_PATH"
          value = "/data/intelligence.db"
        },
        {
          name  = "PORT"
          value = tostring(var.container_port)
        }
      ]

      secrets = [
        {
          name      = "SLACK_BOT_TOKEN"
          valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:SLACK_BOT_TOKEN::"
        },
        {
          name      = "SLACK_SIGNING_SECRET"
          valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:SLACK_SIGNING_SECRET::"
        },
        {
          name      = "SLACK_APP_TOKEN"
          valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:SLACK_APP_TOKEN::"
        },
        {
          name      = "SF_CLIENT_ID"
          valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:SF_CLIENT_ID::"
        },
        {
          name      = "SF_CLIENT_SECRET"
          valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:SF_CLIENT_SECRET::"
        },
        {
          name      = "SF_INSTANCE_URL"
          valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:SF_INSTANCE_URL::"
        },
        {
          name      = "SF_USERNAME"
          valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:SF_USERNAME::"
        },
        {
          name      = "SF_PASSWORD"
          valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:SF_PASSWORD::"
        },
        {
          name      = "SF_SECURITY_TOKEN"
          valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:SF_SECURITY_TOKEN::"
        },
        {
          name      = "OPENAI_API_KEY"
          valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:OPENAI_API_KEY::"
        },
        {
          name      = "AZURE_TENANT_ID"
          valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:AZURE_TENANT_ID::"
        },
        {
          name      = "AZURE_CLIENT_ID"
          valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:AZURE_CLIENT_ID::"
        },
        {
          name      = "AZURE_CLIENT_SECRET"
          valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:AZURE_CLIENT_SECRET::"
        },
        {
          name      = "ANTHROPIC_API_KEY"
          valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:ANTHROPIC_API_KEY::"
        }
      ]

      mountPoints = [
        {
          sourceVolume  = "efs-data"
          containerPath = "/data"
          readOnly      = false
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:${var.container_port}/health || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  volume {
    name = "efs-data"

    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.main.id
      transit_encryption = "ENABLED"

      authorization_config {
        access_point_id = aws_efs_access_point.app.id
        iam             = "ENABLED"
      }
    }
  }

  tags = {
    Name = "${local.name_prefix}-task"
  }
}

# -----------------------------------------------------------------------------
# ECS Service
# -----------------------------------------------------------------------------

resource "aws_ecs_service" "app" {
  name            = "${local.name_prefix}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  # Enable ECS Exec for debugging
  enable_execute_command = true

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "gtm-brain"
    container_port   = var.container_port
  }

  # Allow external changes to desired_count without Terraform overwriting
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [
    aws_lb_listener.http,
    aws_efs_mount_target.main
  ]

  tags = {
    Name = "${local.name_prefix}-service"
  }
}

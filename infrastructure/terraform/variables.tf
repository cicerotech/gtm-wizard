# =============================================================================
# Variables - Configurable parameters for the infrastructure
# =============================================================================

variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-2"
}

variable "environment" {
  description = "Environment name (sandbox, staging, production)"
  type        = string
  default     = "sandbox"
}

# -----------------------------------------------------------------------------
# Networking
# -----------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}

# -----------------------------------------------------------------------------
# ECS / Fargate
# -----------------------------------------------------------------------------

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

variable "container_cpu" {
  description = "CPU units for the container (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "container_memory" {
  description = "Memory for the container in MB"
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of Fargate tasks to run"
  type        = number
  default     = 1
}

variable "health_check_path" {
  description = "Path for ALB health checks"
  type        = string
  default     = "/health"
}

# -----------------------------------------------------------------------------
# Domain / SSL
# -----------------------------------------------------------------------------

variable "domain_name" {
  description = "Domain name for the application (e.g., gtm-aws.eudia.com)"
  type        = string
  default     = ""
}

variable "create_dns_record" {
  description = "Whether to create Route53 DNS record"
  type        = bool
  default     = false
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID (required if create_dns_record is true)"
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# Container Image
# -----------------------------------------------------------------------------

variable "container_image" {
  description = "Docker image to deploy (will be set by CI/CD)"
  type        = string
  default     = ""
}

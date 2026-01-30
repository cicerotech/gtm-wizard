# =============================================================================
# GTM Brain - AWS Fargate Infrastructure
# =============================================================================
# This Terraform configuration creates all AWS resources needed to run
# GTM Brain on AWS Fargate with persistent storage and secure secrets.
#
# Usage:
#   1. Copy terraform.tfvars.example to terraform.tfvars
#   2. Fill in your values
#   3. Run: terraform init
#   4. Run: terraform plan
#   5. Run: terraform apply
# =============================================================================

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment to use S3 backend for state (recommended for production)
  # backend "s3" {
  #   bucket         = "gtm-brain-terraform-state"
  #   key            = "state/terraform.tfstate"
  #   region         = "us-east-2"
  #   encrypt        = true
  #   dynamodb_table = "gtm-brain-terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "gtm-brain"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Data sources for availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# Local values
locals {
  name_prefix = "gtm-brain-${var.environment}"
  
  common_tags = {
    Project     = "gtm-brain"
    Environment = var.environment
  }
}

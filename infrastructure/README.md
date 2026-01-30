# GTM Brain - AWS Infrastructure

This directory contains Infrastructure-as-Code (Terraform) for deploying GTM Brain to AWS Fargate.

## Architecture Overview

```
                     ┌─────────────────────────────────────────────────────┐
                     │                    AWS VPC                          │
                     │                   (us-east-2)                       │
                     │                                                     │
   Internet          │   ┌──────────────┐     ┌──────────────────────┐    │
       │             │   │     ALB      │     │   ECS Fargate        │    │
       │             │   │  (HTTPS)     │────▶│   ┌────────────────┐ │    │
       ▼             │   │              │     │   │  GTM Brain     │ │    │
┌──────────────┐     │   └──────────────┘     │   │  Container     │ │    │
│   Route 53   │────▶│          │             │   │  (Node.js)     │ │    │
│gtm.eudia.com │     │          │             │   └────────────────┘ │    │
└──────────────┘     │          │             │           │          │    │
                     │          │             └───────────┼──────────┘    │
                     │   ┌──────┴───────┐    ┌───────────┴───────┐       │
                     │   │    ACM       │    │        EFS        │       │
                     │   │ (SSL Cert)   │    │  (SQLite data)    │       │
                     │   └──────────────┘    └───────────────────┘       │
                     │                                                    │
                     │   ┌───────────────┐   ┌───────────────────┐       │
                     │   │ Secrets       │   │   CloudWatch      │       │
                     │   │ Manager       │   │   Logs            │       │
                     │   └───────────────┘   └───────────────────┘       │
                     └─────────────────────────────────────────────────────┘
```

## Prerequisites

1. **AWS CLI** installed and configured
2. **Terraform** v1.0.0 or later
3. **Docker** for building images
4. **AWS Account** with appropriate permissions

### Install Tools (macOS)

```bash
# AWS CLI
brew install awscli

# Terraform
brew tap hashicorp/tap
brew install hashicorp/tap/terraform

# Verify installations
aws --version
terraform --version
```

### Configure AWS CLI

```bash
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Default region: us-east-2
# Default output format: json

# Verify access
aws sts get-caller-identity
```

---

## Deployment Steps

### Step 1: Prepare Terraform Variables

```bash
cd infrastructure/terraform

# Copy the example variables file
cp terraform.tfvars.example terraform.tfvars

# Edit with your values (most defaults are fine for sandbox)
nano terraform.tfvars
```

### Step 2: Initialize Terraform

```bash
terraform init
```

Expected output:
```
Terraform has been successfully initialized!
```

### Step 3: Preview Infrastructure

```bash
terraform plan
```

Review the output carefully. You should see:
- 1 VPC
- 4 Subnets (2 public, 2 private)
- 1 Internet Gateway
- 1 NAT Gateway
- 3 Security Groups
- 1 EFS file system
- 1 ECR repository
- 1 ECS cluster
- 1 ECS service
- 1 Application Load Balancer
- 1 Secrets Manager secret
- Several IAM roles/policies

### Step 4: Create Infrastructure

```bash
terraform apply
```

Type `yes` when prompted. This takes 5-10 minutes.

### Step 5: Upload Secrets

After Terraform completes, upload your secrets:

```bash
# Get current environment variables from Render dashboard
# Create a secrets.json file (DO NOT COMMIT THIS FILE!)

# Upload to AWS Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id gtm-brain-sandbox/app-secrets \
  --secret-string file://secrets.json

# Verify
aws secretsmanager get-secret-value \
  --secret-id gtm-brain-sandbox/app-secrets \
  --query SecretString --output text | jq .
```

### Step 6: Build and Push Docker Image

```bash
# Get login command from Terraform output
$(terraform output -raw docker_login_command)

# Build image
cd ../..  # Back to project root
docker build -t gtm-brain .

# Tag for ECR
ECR_URL=$(cd infrastructure/terraform && terraform output -raw ecr_repository_url)
docker tag gtm-brain:latest $ECR_URL:latest

# Push
docker push $ECR_URL:latest
```

### Step 7: Force New Deployment

```bash
cd infrastructure/terraform
$(terraform output -raw update_service_command)
```

### Step 8: Monitor Deployment

```bash
# Watch logs
aws logs tail /ecs/gtm-brain-sandbox --follow

# Check service status
aws ecs describe-services \
  --cluster gtm-brain-sandbox-cluster \
  --services gtm-brain-sandbox-service \
  --query 'services[0].{status:status,running:runningCount,desired:desiredCount}'
```

### Step 9: Access Application

```bash
# Get ALB URL
terraform output alb_url
```

Open the URL in your browser and verify `/health` returns 200.

---

## GitHub Actions Setup (Optional)

For automated deployments via GitHub Actions:

### 1. Create IAM User for GitHub

```bash
# Create user
aws iam create-user --user-name github-actions-gtm-brain

# Create access key
aws iam create-access-key --user-name github-actions-gtm-brain

# Save the AccessKeyId and SecretAccessKey!
```

### 2. Attach Policy

Create a policy with minimum required permissions (see `github-actions-policy.json`).

### 3. Add GitHub Secrets

In your GitHub repository settings, add:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

### 4. Trigger Deployment

Go to Actions → Deploy to AWS → Run workflow

---

## Common Operations

### View Logs

```bash
# Recent logs
aws logs tail /ecs/gtm-brain-sandbox --since 1h

# Follow logs
aws logs tail /ecs/gtm-brain-sandbox --follow
```

### SSH into Container (ECS Exec)

```bash
# Get task ID
TASK_ID=$(aws ecs list-tasks --cluster gtm-brain-sandbox-cluster --service-name gtm-brain-sandbox-service --query 'taskArns[0]' --output text | cut -d'/' -f3)

# Connect
aws ecs execute-command \
  --cluster gtm-brain-sandbox-cluster \
  --task $TASK_ID \
  --container gtm-brain \
  --interactive \
  --command "/bin/sh"
```

### Scale Up/Down

```bash
# Scale to 2 tasks
aws ecs update-service \
  --cluster gtm-brain-sandbox-cluster \
  --service gtm-brain-sandbox-service \
  --desired-count 2

# Scale to 0 (stops all tasks, saves money)
aws ecs update-service \
  --cluster gtm-brain-sandbox-cluster \
  --service gtm-brain-sandbox-service \
  --desired-count 0
```

### Update Secrets

```bash
aws secretsmanager update-secret \
  --secret-id gtm-brain-sandbox/app-secrets \
  --secret-string file://secrets.json

# Force service restart to pick up new secrets
aws ecs update-service \
  --cluster gtm-brain-sandbox-cluster \
  --service gtm-brain-sandbox-service \
  --force-new-deployment
```

---

## Cost Breakdown

| Resource | Monthly Cost | Notes |
|----------|--------------|-------|
| Fargate (0.25 vCPU, 0.5GB) | ~$8 | Per task, 24/7 |
| NAT Gateway | ~$32 | Fixed + data transfer |
| ALB | ~$16 | Fixed + LCUs |
| EFS | ~$0.30/GB | Storage only |
| Secrets Manager | ~$0.40 | Per secret |
| CloudWatch Logs | ~$0.50 | Ingestion + storage |
| **Total (sandbox)** | **~$60/mo** | Single task, minimal traffic |

### Cost Optimization

1. **Stop when not testing**: Scale to 0 tasks
2. **Use FARGATE_SPOT**: 70% cheaper (some interruption risk)
3. **Remove NAT Gateway**: Use public subnets only (less secure)

---

## Cleanup

To destroy all resources:

```bash
cd infrastructure/terraform

# Preview what will be destroyed
terraform plan -destroy

# Destroy (requires confirmation)
terraform destroy
```

**Warning:** This deletes everything including EFS data!

---

## Troubleshooting

### Task fails to start

```bash
# Check stopped task reason
aws ecs describe-tasks \
  --cluster gtm-brain-sandbox-cluster \
  --tasks $(aws ecs list-tasks --cluster gtm-brain-sandbox-cluster --desired-status STOPPED --query 'taskArns[0]' --output text)
```

### Container can't pull secrets

- Verify IAM role has `secretsmanager:GetSecretValue` permission
- Verify secret ARN matches in task definition
- Check secret has been populated (not empty)

### Health checks failing

- Verify container port matches ALB target group
- Check `/health` endpoint returns 200
- View CloudWatch logs for errors

### EFS mount fails

- Verify security group allows NFS (port 2049)
- Check EFS mount targets are in same subnets as tasks
- Verify access point permissions match container user

---

## Files Reference

| File | Purpose |
|------|---------|
| `terraform/main.tf` | Provider config, locals |
| `terraform/variables.tf` | Input variables |
| `terraform/vpc.tf` | Networking (VPC, subnets, security groups) |
| `terraform/ecs.tf` | ECS cluster, task definition, service |
| `terraform/alb.tf` | Load balancer and target group |
| `terraform/efs.tf` | Persistent storage |
| `terraform/iam.tf` | Roles and policies |
| `terraform/secrets.tf` | Secrets Manager |
| `terraform/outputs.tf` | Reference values |
| `secrets-template.json` | Template for secrets (do not commit with values!) |

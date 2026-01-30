# GTM Brain AWS Setup - Quick Start

**Time to complete: ~30 minutes**

---

## Prerequisites

```bash
# Install AWS CLI (if not installed)
brew install awscli

# Install Terraform (if not installed)
brew tap hashicorp/tap && brew install hashicorp/tap/terraform

# Verify
aws --version && terraform --version
```

---

## Step 1: Configure AWS (2 min)

```bash
aws configure
# Access Key ID: [from IAM]
# Secret Access Key: [from IAM]
# Region: us-east-2
# Output: json

# Verify access
aws sts get-caller-identity
```

---

## Step 2: Deploy Infrastructure (10 min)

```bash
cd infrastructure/terraform

# Initialize
terraform init

# Preview (review output)
terraform plan

# Create resources (type 'yes' when prompted)
terraform apply
```

**Save these outputs** (shown after apply):
- `ecr_repository_url`
- `alb_dns_name`
- `secrets_manager_secret_arn`

---

## Step 3: Upload Secrets (5 min)

Create `secrets.json` with these values:

```json
{
  "SLACK_BOT_TOKEN": "xoxb-...",
  "SLACK_SIGNING_SECRET": "...",
  "SLACK_APP_TOKEN": "xapp-...",
  "SF_CLIENT_ID": "...",
  "SF_CLIENT_SECRET": "...",
  "SF_INSTANCE_URL": "https://eudia.my.salesforce.com",
  "SF_USERNAME": "...",
  "SF_PASSWORD": "...",
  "SF_SECURITY_TOKEN": "...",
  "OPENAI_API_KEY": "sk-...",
  "AZURE_TENANT_ID": "...",
  "AZURE_CLIENT_ID": "...",
  "AZURE_CLIENT_SECRET": "...",
  "ANTHROPIC_API_KEY": "sk-ant-..."
}
```

Upload:

```bash
aws secretsmanager put-secret-value \
  --secret-id gtm-brain-sandbox/app-secrets \
  --secret-string file://secrets.json

# Delete local file immediately
rm secrets.json
```

---

## Step 4: Build & Deploy Container (10 min)

```bash
# Go to project root
cd ../..

# Build image
docker build -t gtm-brain .

# Login to ECR
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin $(cd infrastructure/terraform && terraform output -raw ecr_repository_url | cut -d'/' -f1)

# Tag and push
ECR_URL=$(cd infrastructure/terraform && terraform output -raw ecr_repository_url)
docker tag gtm-brain:latest $ECR_URL:latest
docker push $ECR_URL:latest

# Deploy to ECS
cd infrastructure/terraform
aws ecs update-service \
  --cluster gtm-brain-sandbox-cluster \
  --service gtm-brain-sandbox-service \
  --force-new-deployment
```

---

## Step 5: Verify (3 min)

```bash
# Watch deployment (wait for "runningCount": 1)
aws ecs describe-services \
  --cluster gtm-brain-sandbox-cluster \
  --services gtm-brain-sandbox-service \
  --query 'services[0].{status:status,running:runningCount,desired:desiredCount}'

# Get URL
echo "http://$(terraform output -raw alb_dns_name)/health"

# Test health endpoint
curl -s "http://$(terraform output -raw alb_dns_name)/health" | jq .
```

---

## Troubleshooting

**Container won't start?**
```bash
# Check logs
aws logs tail /ecs/gtm-brain-sandbox --follow
```

**Health check failing?**
```bash
# Check task status
aws ecs describe-tasks \
  --cluster gtm-brain-sandbox-cluster \
  --tasks $(aws ecs list-tasks --cluster gtm-brain-sandbox-cluster --query 'taskArns[0]' --output text)
```

**Need to update secrets?**
```bash
aws secretsmanager update-secret --secret-id gtm-brain-sandbox/app-secrets --secret-string file://secrets.json
aws ecs update-service --cluster gtm-brain-sandbox-cluster --service gtm-brain-sandbox-service --force-new-deployment
```

---

## Done!

Application URL: `http://[ALB_DNS_NAME]`

Next: Update Slack app URLs to point to new domain.

---

## Cleanup (if needed)

```bash
cd infrastructure/terraform
terraform destroy
```

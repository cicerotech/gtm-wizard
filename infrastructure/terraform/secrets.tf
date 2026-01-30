# =============================================================================
# Secrets Manager - Secure storage for environment variables
# =============================================================================

# The secret itself - values are added manually or via CLI
resource "aws_secretsmanager_secret" "app_secrets" {
  name        = "${local.name_prefix}/app-secrets"
  description = "Environment variables for GTM Brain application"

  tags = {
    Name = "${local.name_prefix}-secrets"
  }
}

# Note: Secret values are NOT managed by Terraform for security.
# Use the AWS CLI or Console to set the secret value:
#
# aws secretsmanager put-secret-value \
#   --secret-id gtm-brain-sandbox/app-secrets \
#   --secret-string file://secrets.json
#
# Where secrets.json contains:
# {
#   "SLACK_BOT_TOKEN": "xoxb-...",
#   "SLACK_SIGNING_SECRET": "...",
#   ...
# }

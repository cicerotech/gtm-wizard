# GTM Brain - DevOps Migration Handoff

**Document Version:** 1.0  
**Date:** January 30, 2026  
**Application:** GTM Brain (Slack Bot + Web Dashboard)  
**Current Host:** Render.com  
**Target Host:** AWS Fargate (us-east-2)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Application Overview](#application-overview)
3. [Current Architecture](#current-architecture)
4. [Target Architecture](#target-architecture)
5. [Environment Variables](#environment-variables)
6. [External Service Dependencies](#external-service-dependencies)
7. [Network Requirements](#network-requirements)
8. [Persistent Storage](#persistent-storage)
9. [Health Checks](#health-checks)
10. [Scheduled Jobs](#scheduled-jobs)
11. [Migration Checklist](#migration-checklist)
12. [Rollback Plan](#rollback-plan)
13. [Monitoring & Alerting](#monitoring--alerting)

---

## Executive Summary

GTM Brain is a Node.js application that serves as a Slack bot and web dashboard for sales intelligence. It integrates with Salesforce, Microsoft Graph (calendar), OpenAI/Claude for AI features, and several other external services.

**Key Migration Drivers:**
- DPA (Data Processing Agreement) compliance requirements
- Enterprise AWS infrastructure alignment
- Enhanced security and monitoring capabilities

**Risk Level:** Low (parallel deployment, gradual cutover)

---

## Application Overview

| Property | Value |
|----------|-------|
| **Runtime** | Node.js 18+ |
| **Framework** | Express.js + Slack Bolt |
| **Port** | 3000 |
| **Entry Point** | `src/app.js` |
| **Database** | SQLite (file-based) |
| **Build Command** | `npm ci --only=production` |
| **Start Command** | `node src/app.js` |
| **Health Endpoint** | `GET /health` |

### Dependencies (package.json)

```
@anthropic-ai/sdk       ^0.39.0   # Claude AI
@azure/identity         ^4.13.0   # Microsoft Graph auth
@microsoft/microsoft-graph-client ^3.0.7   # Calendar access
@slack/bolt             ^3.17.1   # Slack bot framework
express                 ^4.18.2   # Web server
jsforce                 ^2.0.0-beta.28  # Salesforce API
openai                  ^4.20.1   # OpenAI API
sqlite3                 ^5.1.7    # Local database
redis                   ^4.6.10   # Optional caching
```

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Render.com                              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Web Service (gtm-wizard)                │  │
│  │  ┌────────────────────┐  ┌───────────────────────┐  │  │
│  │  │   Node.js App      │  │   Render Disk         │  │  │
│  │  │   Port 3000        │  │   /data/intelligence.db│ │  │
│  │  └────────────────────┘  └───────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  URL: https://gtm-wizard.onrender.com                      │
│  Auto-deploy: On push to main branch                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │     External Services         │
              │  - Salesforce                 │
              │  - Slack                      │
              │  - Microsoft Graph            │
              │  - OpenAI / Anthropic         │
              │  - Clay (enrichment)          │
              └───────────────────────────────┘
```

**Current URLs:**
- Production: `https://gtm-wizard.onrender.com`
- Alternative: `https://gtm-brain.onrender.com`

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AWS (us-east-2)                                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                              VPC                                       │ │
│  │                                                                        │ │
│  │   ┌──────────────┐        ┌────────────────────────────┐              │ │
│  │   │     ALB      │───────▶│     ECS Fargate            │              │ │
│  │   │   (HTTPS)    │        │  ┌──────────────────────┐  │              │ │
│  │   │              │        │  │   GTM Brain          │  │              │ │
│  │   └──────────────┘        │  │   Container          │──┼──┐          │ │
│  │                           │  │   (0.25 vCPU, 512MB) │  │  │          │ │
│  │                           │  └──────────────────────┘  │  │          │ │
│  │                           └────────────────────────────┘  │          │ │
│  │                                                           ▼          │ │
│  │   ┌───────────────────┐   ┌───────────────────┐   ┌─────────────┐   │ │
│  │   │  Secrets Manager  │   │   CloudWatch      │   │    EFS      │   │ │
│  │   │  (env vars)       │   │   (logs)          │   │ (SQLite DB) │   │ │
│  │   └───────────────────┘   └───────────────────┘   └─────────────┘   │ │
│  │                                                                      │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│   Route 53: gtm-aws.eudia.com ──▶ ALB                                     │
│   ACM: SSL/TLS certificate                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

### Required (Application will not start without these)

| Variable | Description | Example | Source |
|----------|-------------|---------|--------|
| `SLACK_BOT_TOKEN` | Slack bot OAuth token | `xoxb-...` | Slack App Settings |
| `SLACK_SIGNING_SECRET` | Slack request verification | `8f742...` | Slack App Settings |
| `SLACK_APP_TOKEN` | Slack Socket Mode token | `xapp-...` | Slack App Settings |
| `SF_CLIENT_ID` | Salesforce Connected App ID | `3MVG9...` | Salesforce Setup |
| `SF_CLIENT_SECRET` | Salesforce Connected App Secret | `ABC123...` | Salesforce Setup |
| `SF_INSTANCE_URL` | Salesforce instance | `https://eudia.my.salesforce.com` | Fixed |
| `SF_USERNAME` | Salesforce service account | `service.account@eudia.com` | Fixed |
| `SF_PASSWORD` | Salesforce password | `...` | Secure vault |
| `SF_SECURITY_TOKEN` | Salesforce security token | `...` | Salesforce Settings |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` | OpenAI Dashboard |

### Optional (Feature-specific)

| Variable | Description | Default | Feature |
|----------|-------------|---------|---------|
| `AZURE_TENANT_ID` | Microsoft 365 tenant | - | Calendar integration |
| `AZURE_CLIENT_ID` | Azure AD app ID | - | Calendar integration |
| `AZURE_CLIENT_SECRET` | Azure AD app secret | - | Calendar integration |
| `ANTHROPIC_API_KEY` | Claude AI API key | - | Alternative AI |
| `CLAY_API_KEY` | Clay.com API key | - | Company enrichment |
| `CLAY_WEBHOOK_URL` | Clay webhook endpoint | - | Enrichment callbacks |
| `CLAY_ATTENDEE_TABLE_ID` | Clay table for attendees | - | Meeting attendee enrichment |
| `SENDGRID_API_KEY` | SendGrid email API | - | Email reports |
| `REDIS_URL` | Redis connection string | - | Caching (optional) |
| `OKTA_ISSUER` | Okta SSO issuer URL | `https://okta.eudia.com` | SSO |
| `OKTA_CLIENT_ID` | Okta client ID | - | SSO |
| `OKTA_CLIENT_SECRET` | Okta client secret | - | SSO |

### Feature Flags

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `CLOSED_WON_ALERTS_ENABLED` | Enable closed-won Slack alerts | `false` |
| `CLOSED_WON_ALERT_CHANNEL` | Slack channel for alerts | - |
| `CLOSED_WON_ALERT_USER` | Slack user for alerts | - |
| `CS_STAFFING_ALERTS_ENABLED` | Enable CS staffing alerts | `false` |
| `CS_STAFFING_ALERT_CHANNEL` | Slack channel for CS alerts | - |
| `INTEL_SCRAPER_ENABLED` | Enable intelligence scraping | `false` |

### AWS-Specific

| Variable | Description | Value |
|----------|-------------|-------|
| `PORT` | Container port | `3000` |
| `INTEL_DB_PATH` | SQLite database path | `/data/intelligence.db` |

---

## External Service Dependencies

### Critical (Required for core functionality)

| Service | Purpose | Endpoint | Auth Method |
|---------|---------|----------|-------------|
| **Salesforce** | CRM data source | `https://eudia.my.salesforce.com` | OAuth 2.0 + Username/Password |
| **Slack** | Bot interface | `wss://wss-primary.slack.com` | Bot Token + Socket Mode |
| **OpenAI** | AI/NLP processing | `https://api.openai.com/v1` | Bearer token |

### Optional (Enhanced features)

| Service | Purpose | Endpoint | Auth Method |
|---------|---------|----------|-------------|
| **Microsoft Graph** | Calendar sync | `https://graph.microsoft.com/v1.0` | OAuth 2.0 (App) |
| **Anthropic Claude** | Alternative AI | `https://api.anthropic.com/v1` | API Key |
| **Clay** | Company enrichment | `https://api.clay.com/v3` | API Key |
| **SendGrid** | Email delivery | `https://api.sendgrid.com/v3` | API Key |
| **Okta** | SSO authentication | `https://okta.eudia.com` | OAuth 2.0 |
| **Socrates (Internal)** | Internal AI gateway | `https://socrates.cicerotech.link` | Okta M2M |

### Outbound IP Allowlisting

If firewall rules require allowlisting, the application makes outbound requests to:
- `*.salesforce.com` (443)
- `*.slack.com` (443)
- `api.openai.com` (443)
- `graph.microsoft.com` (443)
- `api.anthropic.com` (443)
- `api.clay.com` (443)
- `api.sendgrid.com` (443)

---

## Network Requirements

### Inbound

| Port | Protocol | Source | Purpose |
|------|----------|--------|---------|
| 443 | HTTPS | Internet | ALB ingress |
| 3000 | HTTP | ALB only | Container health checks |

### Outbound

| Port | Protocol | Destination | Purpose |
|------|----------|-------------|---------|
| 443 | HTTPS | Various APIs | External service calls |
| 2049 | NFS | EFS | Database persistence |

### Security Groups

1. **ALB Security Group**
   - Inbound: 80/443 from 0.0.0.0/0
   - Outbound: 3000 to ECS tasks

2. **ECS Tasks Security Group**
   - Inbound: 3000 from ALB SG
   - Outbound: 443 to 0.0.0.0/0, 2049 to EFS SG

3. **EFS Security Group**
   - Inbound: 2049 from ECS Tasks SG

---

## Persistent Storage

### SQLite Database

| Property | Value |
|----------|-------|
| **File** | `/data/intelligence.db` |
| **Size** | ~50-100 MB (grows with usage) |
| **Purpose** | Calendar events, meeting preps, cached data |
| **Backup** | Not currently backed up |

### EFS Configuration

```hcl
performance_mode = "generalPurpose"
throughput_mode  = "bursting"
encrypted        = true

access_point:
  path = "/gtm-brain-data"
  posix_user:
    uid = 1001
    gid = 1001
```

### Data Migration

```bash
# 1. Export from Render
ssh render-shell "sqlite3 /data/intelligence.db .dump" > backup.sql

# 2. Copy to EFS (via ECS Exec)
aws ecs execute-command --cluster CLUSTER --task TASK --container gtm-brain --interactive --command "sqlite3 /data/intelligence.db < /tmp/backup.sql"
```

---

## Health Checks

### Application Health Endpoint

```
GET /health
Response: 200 OK
{
  "status": "ok",
  "timestamp": "2026-01-30T12:00:00.000Z",
  "database": { "status": "ok" },
  "salesforce": { "status": "ok", "connected": true },
  "calendarSync": { "status": "ok" }
}
```

### ALB Health Check

| Setting | Value |
|---------|-------|
| Path | `/health` |
| Protocol | HTTP |
| Healthy threshold | 2 |
| Unhealthy threshold | 3 |
| Timeout | 10 seconds |
| Interval | 30 seconds |
| Success codes | 200 |

### ECS Container Health Check

```json
{
  "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
  "interval": 30,
  "timeout": 10,
  "retries": 3,
  "startPeriod": 60
}
```

---

## Scheduled Jobs

The application runs internal cron jobs (no external scheduler needed):

| Job | Schedule | Purpose |
|-----|----------|---------|
| Calendar Sync | Every 5 minutes | Sync Outlook calendars to local DB |
| Weekly BL Summary | Thursdays 5 PM PST | Sales summary to Slack |
| Finance Audit Report | Fridays 9 AM PST | Finance report to Slack |
| Delivery Report | Mondays 9 AM PST | Delivery status to Slack |
| Stale Deal Alerts | Daily 9 AM PST | Alert on inactive opportunities |

All jobs are implemented in `node-cron` and run within the application process.

---

## Migration Checklist

### Pre-Migration (Do Now)

- [ ] Review all Terraform files in `infrastructure/terraform/`
- [ ] Export environment variables from Render dashboard
- [ ] Verify AWS account access and permissions
- [ ] Confirm domain/SSL strategy (subdomain vs. same domain)

### Phase 1: Infrastructure (Day 1)

- [ ] Run `terraform init` in `infrastructure/terraform/`
- [ ] Run `terraform plan` and review output
- [ ] Run `terraform apply` to create resources
- [ ] Verify VPC, subnets, security groups created
- [ ] Verify ECR repository created
- [ ] Verify ECS cluster created
- [ ] Verify ALB created and accessible

### Phase 2: Secrets (Day 1)

- [ ] Create `secrets.json` with all environment variables
- [ ] Upload to Secrets Manager:
  ```bash
  aws secretsmanager put-secret-value \
    --secret-id gtm-brain-sandbox/app-secrets \
    --secret-string file://secrets.json
  ```
- [ ] Verify secret is readable

### Phase 3: Deploy Application (Day 2)

- [ ] Build Docker image: `docker build -t gtm-brain .`
- [ ] Authenticate with ECR: `$(terraform output -raw docker_login_command)`
- [ ] Tag and push image to ECR
- [ ] Force ECS deployment: `$(terraform output -raw update_service_command)`
- [ ] Monitor CloudWatch logs for startup
- [ ] Verify `/health` endpoint returns 200

### Phase 4: Data Migration (Day 2)

- [ ] Export SQLite database from Render
- [ ] Copy to EFS via ECS Exec
- [ ] Verify data integrity

### Phase 5: Testing (Day 3-4)

- [ ] Test Slack bot responds to messages
- [ ] Test Salesforce queries return data
- [ ] Test calendar sync works
- [ ] Test meeting prep pages load
- [ ] Test all health check endpoints
- [ ] Run through major use cases

### Phase 6: DNS Cutover (Day 5)

- [ ] Create Route53 record for new subdomain
- [ ] Update Slack app URLs to new domain
- [ ] Verify SSL certificate is valid
- [ ] Monitor for errors

### Phase 7: Decommission (Day 7+)

- [ ] Keep Render running for 1 week as fallback
- [ ] Confirm no traffic to old instance
- [ ] Delete Render service
- [ ] Update documentation

---

## Rollback Plan

### If Issues Arise During Cutover

1. **Immediate (< 5 min):** Revert Slack app URLs to Render
2. **Short-term:** Render service is still running, receives traffic
3. **Investigation:** Check CloudWatch logs, ECS events

### If AWS Environment Needs Teardown

```bash
cd infrastructure/terraform
terraform destroy
```

This removes all AWS resources. Render continues serving.

---

## Monitoring & Alerting

### CloudWatch Metrics to Monitor

| Metric | Threshold | Action |
|--------|-----------|--------|
| ECS CPUUtilization | > 80% | Scale up tasks |
| ECS MemoryUtilization | > 80% | Scale up memory |
| ALB HealthyHostCount | < 1 | Alert, investigate |
| ALB HTTPCode_Target_5XX_Count | > 10/min | Alert, check logs |
| ALB TargetResponseTime | > 5s | Investigate |

### Recommended CloudWatch Alarms

```bash
# Create alarm for unhealthy targets
aws cloudwatch put-metric-alarm \
  --alarm-name gtm-brain-unhealthy-hosts \
  --metric-name UnHealthyHostCount \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-2:ACCOUNT:alerts
```

### Log Queries

```sql
-- Errors in last hour
fields @timestamp, @message
| filter @message like /error/i
| sort @timestamp desc
| limit 100

-- Slow requests
fields @timestamp, @message
| filter @message like /took [0-9]{4,}ms/
| sort @timestamp desc
| limit 50
```

---

## Support Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| Application Owner | Keigan Pesenti | Primary |
| DevOps Lead | [TBD] | Infrastructure issues |
| Salesforce Admin | [TBD] | SF connectivity |
| Slack Admin | [TBD] | Slack app issues |

---

## Appendix: File Inventory

### Terraform Files

| File | Purpose |
|------|---------|
| `main.tf` | Provider configuration |
| `variables.tf` | Input variables |
| `vpc.tf` | Network infrastructure |
| `ecs.tf` | Container orchestration |
| `alb.tf` | Load balancer |
| `efs.tf` | Persistent storage |
| `iam.tf` | Roles and policies |
| `secrets.tf` | Secrets Manager |
| `outputs.tf` | Reference values |

### Application Structure

```
src/
├── app.js              # Entry point, Express + Slack Bolt
├── salesforce/         # Salesforce connection and queries
├── slack/              # Slack event handlers and commands
├── services/           # Business logic services
├── ai/                 # AI/ML integrations
├── utils/              # Helpers (logger, cache, email)
└── views/              # HTML templates for web pages
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-30 | Auto-generated | Initial version |

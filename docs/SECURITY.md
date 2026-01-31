# Security & Compliance Documentation

## Overview

The Eudia GTM Brain system is designed to help sales teams capture meeting notes and sync them to Salesforce while maintaining data security and proper user attribution.

---

## Architecture Summary

```
┌─────────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────┐
│   User's Local Machine  │     │   GTM Wizard Server      │     │   External Services │
│                         │     │   (Render.com)           │     │                     │
│  ┌─────────────────┐    │     │  ┌──────────────────┐   │     │  ┌───────────────┐  │
│  │ Obsidian Plugin │◄───┼────►│  │ Node.js API      │◄──┼────►│  │ Salesforce    │  │
│  └─────────────────┘    │     │  └──────────────────┘   │     │  └───────────────┘  │
│                         │     │                          │     │                     │
│  ┌─────────────────┐    │     │  ┌──────────────────┐   │     │  ┌───────────────┐  │
│  │ Local Vault     │    │     │  │ SQLite Database  │   │     │  │ OpenAI Whisper│  │
│  │ (Markdown files)│    │     │  │ (Encrypted tokens)│  │     │  └───────────────┘  │
│  └─────────────────┘    │     │  └──────────────────┘   │     │                     │
└─────────────────────────┘     └──────────────────────────┘     │  ┌───────────────┐  │
                                                                  │  │ Microsoft 365 │  │
                                                                  │  │ (Calendar)    │  │
                                                                  └──┴───────────────┴──┘
```

---

## Data Flow Summary

| Data Type | Source | Processing | Storage | Retention |
|-----------|--------|------------|---------|-----------|
| **Audio recordings** | User's microphone | Sent to OpenAI Whisper | Local vault only | User controlled |
| **Transcripts** | OpenAI Whisper | Summarized via GPT-4o | Local vault + SF Customer_Brain | Permanent |
| **Meeting notes** | User edits | Extracted summary/next steps | Local vault + SF Customer_Brain | Permanent |
| **Calendar data** | Microsoft Graph | Cached for performance | SQLite (15 min cache) | 15 minutes |
| **OAuth tokens** | Salesforce OAuth | Encrypted (AES-256) | SQLite on server | Until revoked |
| **User email** | User input | Whitelist validation | SQLite (session) | Session only |

---

## Security Controls

### 1. Authentication

| Component | Method | Details |
|-----------|--------|---------|
| **Obsidian Plugin** | Email whitelist | BL_EMAILS array limits calendar access |
| **Salesforce OAuth** | OAuth 2.0 + refresh tokens | Per-user authentication with SF |
| **GTM Site** | Okta SSO | Enterprise SSO for web dashboard |
| **Admin Endpoints** | API key | ADMIN_API_KEY environment variable |

### 2. Authorization

- **Calendar Access**: Only emails in `BL_EMAILS` array can access calendar endpoints
- **Note Sync**: Uses per-user OAuth tokens; falls back to admin connection if needed
- **Salesforce**: User's own SF permissions apply when using OAuth
- **Admin Functions**: Protected by admin API key

### 3. Data Encryption

| Data | At Rest | In Transit |
|------|---------|------------|
| OAuth tokens | AES-256-GCM | HTTPS/TLS 1.3 |
| API requests | N/A (pass-through) | HTTPS/TLS 1.3 |
| Local vault | No (user's machine) | N/A |
| Audio files | No (user's machine) | HTTPS to OpenAI |

### 4. Audit Trail

- **Salesforce**: `LastModifiedBy` field shows who synced each note (when using OAuth)
- **Server logs**: Request logging via Render.com (7-day retention)
- **SQLite**: `last_used_at` timestamp for token usage tracking

---

## Sync Behavior

| Event | Trigger | Frequency | User Action Required |
|-------|---------|-----------|---------------------|
| Calendar sync | Background job | Every 15 minutes | None (automatic) |
| Account folders | Manual | On-demand | Click "Sync Accounts" |
| Note to SF | Manual | On-demand | Check "Sync to SF" + click button |
| Transcription | Manual | Per meeting | Click transcribe, then stop |
| OAuth | One-time | When token expires | Re-authenticate (~90 days) |

---

## Data Residency

| Component | Location | Provider |
|-----------|----------|----------|
| GTM Wizard Server | US (Oregon) | Render.com |
| Salesforce | User's SF instance | Salesforce |
| OpenAI Whisper | OpenAI infrastructure | OpenAI |
| Microsoft 365 | User's M365 tenant | Microsoft |
| Local Vault | User's machine | N/A |

---

## Third-Party Services

### OpenAI (Whisper & GPT-4o)

- **Data sent**: Audio recordings, transcripts for summarization
- **Data retention**: OpenAI's standard retention policy applies
- **API key**: Server-side (not exposed to client) or user-provided
- **Documentation**: https://openai.com/policies/privacy-policy

### Salesforce

- **Data sent**: Meeting notes (summary, next steps)
- **Authentication**: OAuth 2.0 with refresh tokens
- **Data storage**: Customer_Brain__c field on Account
- **Permissions**: User's own SF permissions apply

### Microsoft 365

- **Data accessed**: Calendar events (read-only)
- **Authentication**: Azure AD app registration
- **Data cached**: 15 minutes in SQLite
- **Scope**: Calendars.Read

---

## Frequently Asked Questions

### Q: Are we using Obsidian Sync?

**No.** We use the free, open-source Obsidian application. Notes are stored locally on each user's machine. There is no cloud sync of the vault itself.

### Q: Where are notes stored?

Meeting notes are stored in two places:
1. **Locally** on the user's machine in their Obsidian vault
2. **Salesforce** (optionally) in the Account's `Customer_Brain__c` field when the user clicks "Sync to Salesforce"

### Q: Who can see the synced notes in Salesforce?

Anyone with access to the Account record in Salesforce can see the `Customer_Brain__c` field content.

### Q: How do we know who synced a note?

When OAuth is enabled:
- Salesforce's `LastModifiedBy` field shows the user who performed the sync
- Server logs record the user email with each sync request

### Q: Is audio recorded and stored on a server?

**No.** Audio is:
1. Recorded locally on the user's machine
2. Sent directly to OpenAI Whisper for transcription
3. Optionally saved locally in the vault (if "Save Audio Files" is enabled)

The GTM Wizard server never stores audio files.

### Q: What if a user leaves the company?

1. Revoke their Salesforce OAuth token via admin endpoint
2. Remove their email from `BL_EMAILS` list
3. Their local Obsidian vault remains on their (now deprovisioned) machine

---

## Environment Variables (Security-Sensitive)

| Variable | Purpose | Required |
|----------|---------|----------|
| `SF_OAUTH_CLIENT_ID` | Salesforce Connected App ID | For OAuth |
| `SF_OAUTH_CLIENT_SECRET` | Salesforce Connected App Secret | For OAuth |
| `TOKEN_ENCRYPTION_KEY` | AES-256 key for token encryption | For OAuth |
| `ADMIN_API_KEY` | API key for admin endpoints | Recommended |
| `SF_USERNAME` | Fallback admin SF username | For fallback |
| `SF_PASSWORD` | Fallback admin SF password | For fallback |
| `SF_SECURITY_TOKEN` | Fallback admin SF token | For fallback |

---

## Compliance Checklist

- [ ] OAuth tokens encrypted at rest (AES-256-GCM)
- [ ] HTTPS enforced for all API endpoints
- [ ] User attribution via LastModifiedBy (OAuth)
- [ ] Email whitelist for calendar access
- [ ] Admin endpoints protected by API key
- [ ] No audio storage on server
- [ ] Local vault data controlled by user
- [ ] Token revocation capability
- [ ] Audit logging via Render.com

---

## Contact

For security concerns or questions:
- **Internal**: Contact your RevOps administrator
- **Technical**: See the GTM Brain documentation at `/docs/`

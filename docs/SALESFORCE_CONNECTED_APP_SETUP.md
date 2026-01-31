# Salesforce Connected App Setup Guide

This guide walks through creating a Salesforce Connected App for OAuth-based user authentication from the Obsidian plugin.

## Why OAuth?

- **User Attribution**: Every note sync is tracked to the specific user who made it (LastModifiedBy in Salesforce)
- **Permission Respect**: Uses each user's SF permissions - they can only edit what they have access to
- **Security**: No shared admin credentials; users authenticate directly with Salesforce
- **Revocable**: Admins can revoke individual user access at any time

---

## Step 1: Create Connected App in Salesforce

1. Log into Salesforce as an Admin
2. Go to **Setup** → Search for "App Manager"
3. Click **New Connected App**

### Basic Information
| Field | Value |
|-------|-------|
| Connected App Name | `Eudia Notes Sync` |
| API Name | `Eudia_Notes_Sync` |
| Contact Email | `your-admin-email@eudia.com` |

### OAuth Settings
| Field | Value |
|-------|-------|
| Enable OAuth Settings | ✅ Checked |
| Callback URL | `https://gtm-wizard.onrender.com/api/sf/auth/callback` |
| Selected OAuth Scopes | See below |

**Required OAuth Scopes:**
- `Access and manage your data (api)`
- `Perform requests on your behalf at any time (refresh_token, offline_access)`
- `Access your basic information (id, profile, email, address, phone)`

### Additional Settings
| Field | Value |
|-------|-------|
| Require Secret for Web Server Flow | ✅ Checked |
| Enable Client Credentials Flow | ❌ Unchecked |

4. Click **Save**

---

## Step 2: Get Consumer Key and Secret

After saving, you'll be redirected to the app details page.

1. Click **Manage Consumer Details**
2. Verify with your authenticator
3. Copy:
   - **Consumer Key** (also called Client ID)
   - **Consumer Secret** (also called Client Secret)

---

## Step 3: Configure IP Relaxation

By default, Salesforce restricts OAuth to trusted IP ranges. For the GTM Wizard server:

1. Go to the Connected App settings
2. Click **Manage** → **Edit Policies**
3. Under **IP Relaxation**, select: `Relax IP restrictions`
4. Click **Save**

---

## Step 4: Add Environment Variables to GTM Wizard

Add these to Render environment variables:

```bash
SF_OAUTH_CLIENT_ID=your_consumer_key_here
SF_OAUTH_CLIENT_SECRET=your_consumer_secret_here
SF_OAUTH_REDIRECT_URI=https://gtm-wizard.onrender.com/api/sf/auth/callback
TOKEN_ENCRYPTION_KEY=your_32_character_encryption_key
```

To generate a secure encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Step 5: Test the OAuth Flow

1. Open: `https://gtm-wizard.onrender.com/api/sf/auth/start?email=your.email@eudia.com`
2. You should be redirected to Salesforce login
3. After login, you'll be redirected back with a success message
4. Check the server logs for token storage confirmation

---

## Troubleshooting

### "invalid_client_id" Error
- Double-check the Consumer Key is copied correctly
- Ensure there are no extra spaces or newlines

### "redirect_uri_mismatch" Error
- The callback URL in Salesforce must match EXACTLY: `https://gtm-wizard.onrender.com/api/sf/auth/callback`
- Check for trailing slashes

### "INVALID_SESSION_ID" on Sync
- User's token may have expired
- Direct them to re-authenticate at `/api/sf/auth/start?email=...`

---

## Security Notes

1. **Token Storage**: Tokens are encrypted with AES-256 before storage
2. **Token Refresh**: Access tokens expire after 2 hours; refresh tokens are used automatically
3. **Revocation**: To revoke a user's access, use the admin endpoint or delete from `user_tokens` table
4. **Audit Trail**: All syncs show the actual user's name in Salesforce history

---

## Admin Commands

### Check User's Auth Status
```bash
curl "https://gtm-wizard.onrender.com/api/sf/auth/status?email=user@eudia.com"
```

### Revoke User's Token (Admin Only)
```bash
curl -X POST "https://gtm-wizard.onrender.com/api/sf/auth/revoke" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@eudia.com", "adminKey": "YOUR_ADMIN_KEY"}'
```

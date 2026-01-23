# Admin Setup Checklist - BL Obsidian Onboarding

Run through this checklist BEFORE sharing the onboarding guide with a new BL.

---

## New BL Information

| Field | Value |
|-------|-------|
| Name | |
| Email | |
| Salesforce User ID | |
| Start Date | |

---

## Pre-Flight Checklist

### 1. Obsidian Sync Configuration

- [ ] Verify Obsidian Sync subscription is active
- [ ] Confirm sync key is valid and working
- [ ] Test: Create a note on your machine, verify it syncs to another device

**Sync Key:** `________________________` (keep secure, share via 1Password/Slack DM)

### 2. Server-Side Vault Sync

- [ ] Confirm GTM Brain server has the vault synced locally
- [ ] Check vault path in environment: `OBSIDIAN_VAULT_PATH`
- [ ] Verify `Meetings/` folder exists in server vault
- [ ] Verify `Templates/Meeting Note.md` exists

**Test command:**
```bash
# Check if vault is accessible on server
curl https://gtm-wizard.onrender.com/api/obsidian/status
```

### 3. GTM Brain Configuration

- [ ] Add BL email to `BL_EMAILS` array in `src/services/calendarService.js`

```javascript
// Find this section and add the new email:
const BL_EMAILS = [
  // ... existing emails ...
  'new.bl@eudia.com',  // Add new BL here
];
```

- [ ] Deploy changes: `git add . && git commit -m "Add [NAME] to BL list" && git push`

### 4. Salesforce Setup

- [ ] Verify BL has Salesforce user account
- [ ] Note their Salesforce User ID (for event ownership)
- [ ] Confirm they have access to relevant Accounts

**Finding SF User ID:**
```
Setup > Users > Find user > Copy ID from URL
```

### 5. Test End-to-End Sync

- [ ] Create a test note in the shared vault:
  - Location: `Meetings/Test Account/2026-01-23 - Test Note.md`
  - Frontmatter: `account: "Eudia Testing"`, `sync: true`
- [ ] Wait 10 minutes
- [ ] Check GTM Brain: Does the note appear in Meeting Prep for Eudia Testing?
- [ ] Delete the test note after confirming

---

## Onboarding Package to Send

1. **Personalized Guide:** Copy `ONBOARDING-GUIDE.md`, replace placeholders:
   - `{{BL_NAME}}` → Their name
   - `{{BL_EMAIL}}` → Their email
   - `{{SF_USER_ID}}` → Their Salesforce ID
   - `{{SYNC_KEY}}` → The shared sync key

2. **Share via:**
   - [ ] Slack DM with the guide
   - [ ] 1Password for the sync key (or secure DM)
   - [ ] Optional: 15-minute walkthrough call

---

## Post-Onboarding Verification

After BL completes setup:

- [ ] Verify their first test note syncs to GTM Brain
- [ ] Confirm Meeting Prep shows their meetings
- [ ] Check calendar sync includes their calendar

---

## Rollback / Troubleshooting

**If sync doesn't work:**
1. Check Obsidian Sync status (cloud icon in their app)
2. Verify they entered the correct sync key
3. Check server logs: `render logs --service gtm-wizard`

**If notes don't appear in GTM Brain:**
1. Verify frontmatter has `account:` field matching SF account name
2. Check `sync: true` in frontmatter
3. Manually trigger sync: `POST /api/obsidian/sync`

---

*Template Version: 1.0 | January 2026*


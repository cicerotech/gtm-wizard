# Eudia Notetaker — Next Agent Handoff

Read `docs/handoff_to_new_agent.md` first. It has the full project architecture, file locations, current state, and every change made across 20+ sessions. Do not start work until you have read it.

You are a senior full-stack engineer taking over a live production system. Users are actively recording calls and transcribing meetings right now. The plugin auto-update pipeline is live and working. The device fleet is registering users. Your job is to stabilize, test, and extend.

## CURRENT STATE

- **Plugin version:** v4.11.0 (deployed, live, auto-updating)
- **Server:** gtm-wizard.onrender.com (Render, auto-deploy on push to main)
- **Users:** ~15 active users across Sales, CS, Exec, Product roles
- **Fleet:** `GET /api/admin/devices` — shows registered devices with version, health, accounts
- **Install:** gtm-wizard.onrender.com/install (Mac/Windows)
- **Update (existing users):** gtm-wizard.onrender.com/update or `curl -sL .../api/plugin/install.sh | bash`

## PRIORITY TASKS FOR TODAY

### 1. Verify Device Fleet Is Populating

Check `https://gtm-wizard.onrender.com/api/admin/devices` throughout the day. As users open Obsidian, they should auto-update to v4.11.0 and appear in the fleet. Track who shows up. Expected: Riley (confirmed), Sean, Rajeev, Zack, Olivia as they open Obsidian.

Greg (Windows, v4.1.0) needs the PowerShell command. Nathan Shine (Windows, new user) was sent fresh install instructions.

### 2. Test the Transcription Pipeline End-to-End

The WebM header fix and parallel chunking are deployed but need real-world validation:
- Record a 10+ minute call in Obsidian (YouTube video works)
- Verify chunked transcription path fires (blob > 8MB)
- Verify all chunks succeed (no gap markers)
- Verify transcript quality is good

The load test (`node scripts/test-chunked-transcription.js --raw-split`) passed 15/15 chunks. But no real Obsidian recording has been tested end-to-end yet.

### 3. Vault Operations — Verify End-to-End

Two test operations are queued (notification + create_file at `_Admin/Remote Push Test.md`). They were delivered but may not have executed. Check:
```bash
curl -s https://gtm-wizard.onrender.com/api/admin/vault/operations | python3 -m json.tool
```
If status is still "delivered" (not "executed"), the executor may have an issue. Check the Obsidian dev console (Cmd+Option+I) for `[Eudia Ops]` log lines.

### 4. Fix the "Failed to list templates" Error

Screenshot shows "Failed to list templates. No template folder configured." when creating a note from the calendar view. This is a regression — the template picker can't find templates. Investigate in `main.ts` where templates are loaded and ensure the template folder path is set correctly.

### 5. Build Admin Dashboard (Phase 3)

The backend APIs are all built. What's missing is a visual web page at `/admin` (behind auth) showing:
- Device fleet table (user, device, version, health, accounts, SF, calendar)
- Vault operations log (pending, delivered, executed, failed)
- Quick action buttons (push note, trigger sync, force update, send notice)
- This replaces the raw JSON at `/api/admin/devices`

### 6. CS Staffing Flow — Deploy and Test

The CS_Staffing_Alert flow is code-complete but NOT deployed. It references `Handover_Type__c` formula field which can't deploy (multi-select picklist in formula not supported). Options:
- Update the flow to use `Eudia_Tech__c` directly instead of `Handover_Type__c`
- The Apex controller already computes handover type from `Eudia_Tech__c`
- Test: move a deal with AI products to Stage 5, verify CS Staffing flag sets, verify handover form appears

### 7. Periodic Heartbeat

Currently the heartbeat only fires once on startup. Add a `this.registerInterval()` that sends a heartbeat every 30 minutes so the fleet's `last_heartbeat` stays current throughout the day. Without this, a user who opens Obsidian at 9 AM shows "idle" by noon even though they're actively using it.

## KEY FILES

| File | Purpose |
|------|---------|
| `obsidian-plugin/main.ts` | Plugin main (~10,500 lines): setup, transcription, calendar, vault ops, device ID, auto-update |
| `obsidian-plugin/src/TranscriptionService.ts` | Client-side transcription: chunking, retry, timeout, parallel batches |
| `src/app.js` | Express server (~10,400 lines): all endpoints, vault ops queue, device fleet, telemetry |
| `src/services/transcriptionService.js` | Server-side: Whisper API, queue, hallucination detection, WebM header fix |
| `src/db/migrations/006_device_fleet_and_vault_ops.js` | PostgreSQL tables for device_registrations + vault_operations |
| `scripts/test-chunked-transcription.js` | Load test: generates audio, sends chunks, reports results |

## RULES

1. Read the actual code before editing any file. No assumptions.
2. After every change to `obsidian-plugin/main.ts` or any `.ts` file: `cd obsidian-plugin && npm run build`
3. One commit per logical fix. Push to main. Render auto-deploys in 2-3 min.
4. Verify each deploy: `curl -s https://gtm-wizard.onrender.com/api/plugin/version`
5. Do not break what works. The auto-update, device fleet, transcription, calendar, and vault operations are all live.
6. Salesforce deploys: `cd salesforce && sf project deploy start --source-dir <path> -o eudia-prod`

## VERIFY AFTER EACH PUSH

```bash
curl -s https://gtm-wizard.onrender.com/api/plugin/version
# Should show current version and "name":"Eudia Lite"

curl -s https://gtm-wizard.onrender.com/health
# Should show "healthy" and "salesforce.connected: true"

curl -s https://gtm-wizard.onrender.com/api/admin/devices | python3 -m json.tool
# Should show registered devices
```

## WHAT IS WORKING — DO NOT BREAK

- Auto-update with hot-reload escape (window.location.reload) — works for ALL versions v4.4.0+
- Device fleet registration (heartbeat → device_registrations table)
- Vault operations queue (admin push → plugin polls → executes locally)
- obsidian:// protocol handler for one-click updates
- WebM header fix for chunked transcription (server-side, benefits all versions)
- Parallel chunk processing (3 at a time)
- Setup wizard with role selector and progress bar
- Account loading (BL: pipeline + target book + owned, Exec: Existing + pipeline, Admin: all)
- Calendar view with external-only filter
- Meeting note templates (MEDDIC, Demo, CS, General, Internal)
- Smart scroll and flash highlight on new meeting notes
- Salesforce sync confirmation modal
- Closed Won alerts with Eudia Counsel sensitization
- One-click install page at /install (Mac + Windows)
- Safe update scripts at /api/plugin/install.sh and install.ps1
- Recordings saved to Recordings/ and _backups/ before transcription

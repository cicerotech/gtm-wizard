# Eudia Notetaker — Next Agent Handoff

Read `docs/handoff_to_new_agent.md` first. It has the full project architecture, file locations, and current state. Do not start work until you have read it.

You are a senior full-stack engineer taking over a live production system. Users are actively using this tool. The demo happened today and exposed critical transcription failures. Your job is to make the transcription pipeline bulletproof.

## CURRENT STATE

- **Plugin version:** v4.10.2 (deployed, live)
- **Server:** gtm-wizard.onrender.com (Render, auto-deploy on push to main)
- **Users:** ~15 active users across Sales, CS, Exec, Product roles
- **Install link:** gtm-wizard.onrender.com/install (one-click Mac/Windows installer)
- **Fresh install:** `/api/plugin/fresh-install.sh` (Mac) and `/api/plugin/fresh-install.ps1` (Windows)

## CRITICAL BUG — Transcription Fails on 60+ Minute Recordings

### What happened

A 60-minute recording was transcribed. It produced 15 chunks (4MB each). Only chunk 1 succeeded. Chunks 2-15 all failed after 4 retry attempts each. The user saw 14 gap markers like `[~4:16 – 8:32 — audio not transcribed (chunk 2/15 failed after 4 attempts)]`. Total wait time was 30-40 minutes for a nearly empty transcript.

### Root cause analysis

The failure chain has THREE interacting bottlenecks:

**1. Client-side timeout is too short (90 seconds)**
- `obsidian-plugin/src/TranscriptionService.ts` line 1802: `CHUNK_TIMEOUT_MS = 90000`
- Each chunk is 4MB of raw audio (~4 min at 128kbps), base64-encoded to ~5.3MB
- The request body is ~5.3MB JSON. Upload alone can take 10-20s on slower connections
- Whisper API processes 4 min of audio in 15-45 seconds, but can spike to 60-90s during peak usage
- Post-processing (transcript correction, hallucination detection) adds 5-15s
- Total realistic server-side time: 30-100 seconds per chunk
- With 90s timeout, chunks that take >90s are killed by the client before the server responds

**2. Render's proxy timeout (likely 30-60 seconds)**
- Render (the hosting platform) has an undocumented proxy timeout
- We set `server.timeout = 120000` in `src/app.js` line 9668, but Render's proxy sits IN FRONT and may enforce 30-60s
- This means even if the Node.js server is still processing, Render's proxy kills the connection
- The client then gets a network error, not a timeout error, which triggers retry

**3. No timeout on the OpenAI Whisper API call**
- `src/services/transcriptionService.js` line 432-440: the `openai.audio.transcriptions.create()` call has NO timeout
- If OpenAI is slow (queue backed up, model loading), this call can hang for 2-5 minutes
- The server waits indefinitely for OpenAI, holding the Express connection open
- Meanwhile, the client timeout fires at 90s, but the server is still processing
- This creates zombie requests that consume server resources and queue positions

**4. Sequential processing amplifies the problem**
- `transcribeAudioChunked()` processes chunks one at a time (line 1856: `for` loop)
- If chunk 2 takes 90s and times out, the retry adds 10s delay, then another 90s attempt...
- For 15 chunks with 3 retries each at 90s per attempt: worst case is 15 × 4 × 90s = 90 minutes
- This is why the user waited 30-40 minutes

### The fix — approach this in layers

**Layer 1: Increase client timeout to 180 seconds**
In `obsidian-plugin/src/TranscriptionService.ts` line 1802, change `CHUNK_TIMEOUT_MS = 90000` to `180000`. This gives Whisper enough time even during peak load. The tradeoff is that failed chunks take longer to fail, but successful chunks complete reliably.

**Layer 2: Add explicit timeout to the OpenAI API call**
In `src/services/transcriptionService.js` line 432-440, wrap the Whisper call with a 120-second timeout:
```javascript
const controller = new AbortController();
const apiTimeout = setTimeout(() => controller.abort(), 120000);
try {
  const transcription = await this.openai.audio.transcriptions.create({
    file: fs.createReadStream(tempFilePath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    language: 'en',
    prompt: whisperPrompt
  }, { signal: controller.signal });
  clearTimeout(apiTimeout);
  // ... rest of processing
} catch (error) {
  clearTimeout(apiTimeout);
  if (error.name === 'AbortError') {
    throw new Error('Whisper API timed out after 120s');
  }
  throw error;
}
```

**Layer 3: Process chunks in parallel (2-3 at a time)**
Change `transcribeAudioChunked()` from sequential to parallel with concurrency limit. Instead of:
```
chunk1 → wait → chunk2 → wait → chunk3 → ...
```
Do:
```
chunk1 + chunk2 + chunk3 → wait for all → chunk4 + chunk5 + chunk6 → ...
```
The server already has `MAX_CONCURRENT: 3` in its queue. Process 2-3 chunks simultaneously on the client side. Use `Promise.allSettled()` for each batch. This cuts total time by 2-3x.

**Layer 4: Progressive transcript delivery**
Currently, the user sees nothing until ALL chunks complete (or fail). Instead:
- After each successful chunk, immediately write its text to the note
- Show a progress indicator in the note: "Transcribing... 3/15 chunks complete"
- Failed chunks can be retried later without blocking the user

**Layer 5: Reduce chunk overhead**
Currently each chunk sends a full JSON body with base64 audio. Consider:
- Multipart form upload instead of base64 (saves 33% bandwidth)
- Or: Upload the entire file ONCE, let the server chunk it (eliminates 14 round trips)

### Priority order
1. Layer 1 (client timeout increase) — 5 min fix, ship immediately
2. Layer 2 (OpenAI timeout) — 10 min fix, ship with Layer 1
3. Layer 3 (parallel processing) — 30 min fix, requires careful testing
4. Layer 4 (progressive delivery) — 1-2 hour refactor, do after parallel works
5. Layer 5 (server-side chunking) — architecture change, plan for next sprint

## RULES

1. Read the actual code before editing any file. No assumptions.
2. After every change to `obsidian-plugin/main.ts` or any `.ts` file: run `cd obsidian-plugin && npm run build`
3. Before pushing: `npm run copy-to-vault && cd .. && node scripts/build-tailored-vault.js`
4. One commit per logical fix. Push to main. Render auto-deploys in 3-5 min.
5. Verify each deploy: `curl -s https://gtm-wizard.onrender.com/api/plugin/version`
6. Do not break what works. Test the enrichment progress bar, setup wizard role selector, calendar matching, and meeting note creation AFTER your changes.

## VERIFY AFTER EACH PUSH

```bash
curl -s https://gtm-wizard.onrender.com/api/plugin/version
# Should show new version number and "name":"Eudia Lite"

curl -s https://gtm-wizard.onrender.com/health
# Should show "healthy" and "salesforce.connected: true"
```

## KEY FILES

| File | Purpose |
|------|---------|
| `obsidian-plugin/src/TranscriptionService.ts` | Client-side transcription: chunking, retry, timeout |
| `src/services/transcriptionService.js` | Server-side: Whisper API call, queue, post-processing |
| `src/app.js` | Express server, all endpoints, server timeout config |
| `obsidian-plugin/main.ts` | Plugin main: setup wizard, enrichment, calendar, notes |
| `obsidian-plugin/manifest.json` | Plugin version (bump with each deploy) |

## TEST MATRIX

After fixing transcription, verify these still work:

| Test | How |
|------|-----|
| Short recording (2 min) | Record, stop, should transcribe in <60s |
| Medium recording (10 min) | Should use chunked path (>8MB), 3 chunks, all succeed |
| Long recording (30 min) | 8 chunks, should complete in 5-8 min with parallel |
| Long recording (60 min) | 15 chunks, should complete in 10-15 min with parallel |
| Fresh install | `curl -sL https://gtm-wizard.onrender.com/api/plugin/fresh-install.sh \| bash` |
| Role selector | Setup wizard shows Sales/CS/Exec/Product/Ops Admin/Other |
| Account enrichment | Progress bar shows per-account updates |
| Calendar meeting note | Click meeting → note created under correct account → sidebar scrolls to it |
| Closed Won alert | Move deal to Closed Won → alert posts to Slack with correct format |

## WHAT IS WORKING — DO NOT BREAK

- Plugin auto-update (checks server every 10 min)
- Setup wizard with role selector and progress bar
- Account loading (BL: pipeline + target book + owned, Exec: Existing + pipeline, Admin: all)
- Calendar view with external-only filter
- Meeting note templates (MEDDIC, Demo, CS, General, Internal)
- Smart scroll and flash highlight on new meeting notes
- Salesforce sync confirmation modal
- Microphone permission guide with verification
- Closed Won alerts with Eudia Counsel sensitization
- One-click install page at /install (Mac + Windows)
- Light theme and editable mode auto-correction
- Recordings saved to Recordings/ and _backups/ before transcription

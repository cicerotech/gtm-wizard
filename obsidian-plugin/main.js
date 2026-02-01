var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => EudiaSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/AudioRecorder.ts
var AudioRecorder = class {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
    this.startTime = 0;
    this.pausedDuration = 0;
    this.pauseStartTime = 0;
    this.durationInterval = null;
    this.audioContext = null;
    this.analyser = null;
    this.levelInterval = null;
    this.state = {
      isRecording: false,
      isPaused: false,
      duration: 0,
      audioLevel: 0
    };
    this.stateCallback = null;
  }
  /**
   * Set callback for state updates (duration, audio levels, etc.)
   */
  onStateChange(callback) {
    this.stateCallback = callback;
  }
  /**
   * Get supported MIME type for recording
   */
  getSupportedMimeType() {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg"
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "audio/webm";
  }
  /**
   * Request microphone access and start recording
   */
  async startRecording() {
    if (this.state.isRecording) {
      throw new Error("Already recording");
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });
      this.setupAudioAnalysis();
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 48e3
      });
      this.audioChunks = [];
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      this.mediaRecorder.start(1e3);
      this.startTime = Date.now();
      this.pausedDuration = 0;
      this.state = {
        isRecording: true,
        isPaused: false,
        duration: 0,
        audioLevel: 0
      };
      this.startDurationTracking();
      this.startLevelTracking();
      this.notifyStateChange();
    } catch (error) {
      this.cleanup();
      throw new Error(`Failed to start recording: ${error.message}`);
    }
  }
  /**
   * Set up Web Audio API for level analysis
   */
  setupAudioAnalysis() {
    if (!this.stream)
      return;
    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
    } catch (error) {
      console.warn("Failed to set up audio analysis:", error);
    }
  }
  /**
   * Start tracking recording duration
   */
  startDurationTracking() {
    this.durationInterval = setInterval(() => {
      if (this.state.isRecording && !this.state.isPaused) {
        const elapsed = Date.now() - this.startTime - this.pausedDuration;
        this.state.duration = Math.floor(elapsed / 1e3);
        this.notifyStateChange();
      }
    }, 100);
  }
  /**
   * Start tracking audio levels
   */
  startLevelTracking() {
    if (!this.analyser)
      return;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.levelInterval = setInterval(() => {
      if (this.state.isRecording && !this.state.isPaused && this.analyser) {
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        this.state.audioLevel = Math.min(100, Math.round(average / 255 * 100 * 2));
        this.notifyStateChange();
      }
    }, 50);
  }
  /**
   * Pause recording
   */
  pauseRecording() {
    if (!this.state.isRecording || this.state.isPaused)
      return;
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.pause();
      this.pauseStartTime = Date.now();
      this.state.isPaused = true;
      this.notifyStateChange();
    }
  }
  /**
   * Resume recording
   */
  resumeRecording() {
    if (!this.state.isRecording || !this.state.isPaused)
      return;
    if (this.mediaRecorder && this.mediaRecorder.state === "paused") {
      this.mediaRecorder.resume();
      this.pausedDuration += Date.now() - this.pauseStartTime;
      this.state.isPaused = false;
      this.notifyStateChange();
    }
  }
  /**
   * Stop recording and return the audio data
   * Includes a 10-second timeout to prevent hanging if onstop doesn't fire
   */
  async stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.state.isRecording) {
        reject(new Error("Not currently recording"));
        return;
      }
      const mimeType = this.mediaRecorder.mimeType;
      const duration = this.state.duration;
      let resolved = false;
      const safetyTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn("AudioRecorder: onstop timeout, forcing completion");
          try {
            const audioBlob = new Blob(this.audioChunks, { type: mimeType });
            const now = /* @__PURE__ */ new Date();
            const dateStr = now.toISOString().split("T")[0];
            const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-");
            const extension = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
            const filename = `recording-${dateStr}-${timeStr}.${extension}`;
            this.cleanup();
            resolve({
              audioBlob,
              duration,
              mimeType,
              filename
            });
          } catch (error) {
            this.cleanup();
            reject(new Error("Failed to process recording after timeout"));
          }
        }
      }, 1e4);
      this.mediaRecorder.onstop = () => {
        if (resolved)
          return;
        resolved = true;
        clearTimeout(safetyTimeout);
        try {
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          const now = /* @__PURE__ */ new Date();
          const dateStr = now.toISOString().split("T")[0];
          const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-");
          const extension = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
          const filename = `recording-${dateStr}-${timeStr}.${extension}`;
          this.cleanup();
          resolve({
            audioBlob,
            duration,
            mimeType,
            filename
          });
        } catch (error) {
          this.cleanup();
          reject(error);
        }
      };
      this.mediaRecorder.onerror = (event) => {
        if (resolved)
          return;
        resolved = true;
        clearTimeout(safetyTimeout);
        this.cleanup();
        reject(new Error("Recording error occurred"));
      };
      this.mediaRecorder.stop();
    });
  }
  /**
   * Cancel recording without saving
   */
  cancelRecording() {
    this.cleanup();
  }
  /**
   * Clean up all resources
   */
  cleanup() {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
    if (this.levelInterval) {
      clearInterval(this.levelInterval);
      this.levelInterval = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {
      });
      this.audioContext = null;
      this.analyser = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.state = {
      isRecording: false,
      isPaused: false,
      duration: 0,
      audioLevel: 0
    };
    this.notifyStateChange();
  }
  /**
   * Get current recording state
   */
  getState() {
    return { ...this.state };
  }
  /**
   * Check if browser supports audio recording
   */
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }
  /**
   * Notify callback of state change
   */
  notifyStateChange() {
    if (this.stateCallback) {
      this.stateCallback({ ...this.state });
    }
  }
  /**
   * Format duration as MM:SS
   */
  static formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  /**
   * Convert blob to base64 for transmission
   */
  static async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  /**
   * Convert blob to ArrayBuffer for file saving
   */
  static async blobToArrayBuffer(blob) {
    return blob.arrayBuffer();
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // WRAPPER METHODS - Short aliases for main.ts compatibility
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Alias for startRecording()
   */
  async start() {
    return this.startRecording();
  }
  /**
   * Alias for stopRecording()
   */
  async stop() {
    return this.stopRecording();
  }
  /**
   * Alias for pauseRecording()
   */
  pause() {
    return this.pauseRecording();
  }
  /**
   * Alias for resumeRecording()
   */
  resume() {
    return this.resumeRecording();
  }
  /**
   * Alias for cancelRecording()
   */
  cancel() {
    return this.cancelRecording();
  }
  /**
   * Check if currently recording
   */
  isRecording() {
    return this.state.isRecording;
  }
};

// src/TranscriptionService.ts
var import_obsidian = require("obsidian");
var AccountDetector = class {
  constructor() {
    this.salesforceAccounts = [];
  }
  /**
   * Set Salesforce accounts for matching
   */
  setAccounts(accounts) {
    this.salesforceAccounts = accounts;
  }
  /**
   * Detect account from meeting title and/or attendees
   * Uses multiple strategies with confidence scoring
   */
  detectAccount(meetingTitle, attendees, filePath) {
    if (meetingTitle) {
      const titleResult = this.detectFromTitle(meetingTitle);
      if (titleResult.confidence >= 70) {
        return titleResult;
      }
    }
    if (filePath) {
      const pathResult = this.detectFromFilePath(filePath);
      if (pathResult.confidence >= 70) {
        return pathResult;
      }
    }
    if (attendees && attendees.length > 0) {
      const domainResult = this.detectFromAttendees(attendees);
      if (domainResult.confidence >= 50) {
        return domainResult;
      }
    }
    return {
      account: null,
      accountId: null,
      confidence: 0,
      source: "none",
      evidence: "No account detected from available context"
    };
  }
  /**
   * Detect account from meeting title
   */
  detectFromTitle(title) {
    if (!title) {
      return { account: null, accountId: null, confidence: 0, source: "title", evidence: "No title" };
    }
    const patterns = [
      // "Southwest - James - Aug 19" → Southwest
      { regex: /^([A-Za-z0-9][^-–—]+?)\s*[-–—]\s*(?:[A-Z][a-z]+|[A-Za-z]{2,})/, confidence: 85 },
      // "Call with Acme Corp" → Acme Corp
      { regex: /(?:call|meeting|sync|check-in|demo|discovery)\s+(?:with|re:?|@)\s+([^-–—]+?)(?:\s*[-–—]|$)/i, confidence: 80 },
      // "Acme Corp Discovery Call" → Acme Corp
      { regex: /^([A-Za-z][^-–—]+?)\s+(?:discovery|demo|review|kickoff|intro|onboarding|sync)\s*(?:call)?$/i, confidence: 75 },
      // "Acme: Weekly Sync" → Acme
      { regex: /^([^:]+?):\s+/i, confidence: 70 },
      // "[Acme] Meeting Notes" → Acme
      { regex: /^\[([^\]]+)\]/, confidence: 75 }
    ];
    const falsePositives = [
      "weekly",
      "daily",
      "monthly",
      "internal",
      "team",
      "1:1",
      "one on one",
      "standup",
      "sync",
      "meeting",
      "call",
      "notes",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "untitled",
      "new",
      "test"
    ];
    for (const pattern of patterns) {
      const match = title.match(pattern.regex);
      if (match && match[1]) {
        const accountGuess = match[1].trim();
        if (falsePositives.some((fp) => accountGuess.toLowerCase() === fp)) {
          continue;
        }
        if (accountGuess.length < 2) {
          continue;
        }
        const sfMatch = this.fuzzyMatchSalesforce(accountGuess);
        if (sfMatch) {
          return {
            account: sfMatch.name,
            accountId: sfMatch.id,
            confidence: Math.min(pattern.confidence + 10, 100),
            source: "salesforce_match",
            evidence: `Matched "${accountGuess}" from title to Salesforce account "${sfMatch.name}"`
          };
        }
        return {
          account: accountGuess,
          accountId: null,
          confidence: pattern.confidence,
          source: "title",
          evidence: `Extracted from meeting title pattern`
        };
      }
    }
    return { account: null, accountId: null, confidence: 0, source: "title", evidence: "No pattern matched" };
  }
  /**
   * Detect account from file path (Accounts/CompanyName/...)
   */
  detectFromFilePath(filePath) {
    const accountsMatch = filePath.match(/Accounts\/([^\/]+)\//i);
    if (accountsMatch && accountsMatch[1]) {
      const folderName = accountsMatch[1].trim();
      const sfMatch = this.fuzzyMatchSalesforce(folderName);
      if (sfMatch) {
        return {
          account: sfMatch.name,
          accountId: sfMatch.id,
          confidence: 95,
          source: "salesforce_match",
          evidence: `File in account folder "${folderName}" matched to "${sfMatch.name}"`
        };
      }
      return {
        account: folderName,
        accountId: null,
        confidence: 85,
        source: "title",
        // File path is treated like title
        evidence: `File located in Accounts/${folderName} folder`
      };
    }
    return { account: null, accountId: null, confidence: 0, source: "none", evidence: "Not in Accounts folder" };
  }
  /**
   * Detect account from attendee email domains
   */
  detectFromAttendees(attendees) {
    const commonProviders = ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com"];
    const externalDomains = /* @__PURE__ */ new Set();
    for (const attendee of attendees) {
      const email = attendee.toLowerCase();
      const domainMatch = email.match(/@([a-z0-9.-]+)/);
      if (domainMatch) {
        const domain = domainMatch[1];
        if (!domain.includes("eudia.com") && !commonProviders.includes(domain)) {
          externalDomains.add(domain);
        }
      }
    }
    if (externalDomains.size === 0) {
      return { account: null, accountId: null, confidence: 0, source: "attendee_domain", evidence: "No external domains" };
    }
    for (const domain of externalDomains) {
      const companyName2 = domain.split(".")[0];
      const capitalized2 = companyName2.charAt(0).toUpperCase() + companyName2.slice(1);
      const sfMatch = this.fuzzyMatchSalesforce(capitalized2);
      if (sfMatch) {
        return {
          account: sfMatch.name,
          accountId: sfMatch.id,
          confidence: 75,
          source: "salesforce_match",
          evidence: `Matched attendee domain ${domain} to "${sfMatch.name}"`
        };
      }
    }
    const firstDomain = Array.from(externalDomains)[0];
    const companyName = firstDomain.split(".")[0];
    const capitalized = companyName.charAt(0).toUpperCase() + companyName.slice(1);
    return {
      account: capitalized,
      accountId: null,
      confidence: 50,
      source: "attendee_domain",
      evidence: `Guessed from external attendee domain: ${firstDomain}`
    };
  }
  /**
   * Fuzzy match against Salesforce accounts
   */
  fuzzyMatchSalesforce(searchName) {
    if (!searchName || this.salesforceAccounts.length === 0) {
      return null;
    }
    const search = searchName.toLowerCase().trim();
    for (const acc of this.salesforceAccounts) {
      if (acc.name?.toLowerCase() === search) {
        return acc;
      }
    }
    for (const acc of this.salesforceAccounts) {
      if (acc.name?.toLowerCase().startsWith(search)) {
        return acc;
      }
    }
    for (const acc of this.salesforceAccounts) {
      if (acc.name?.toLowerCase().includes(search)) {
        return acc;
      }
    }
    for (const acc of this.salesforceAccounts) {
      if (search.includes(acc.name?.toLowerCase())) {
        return acc;
      }
    }
    return null;
  }
  /**
   * Suggest account matches for autocomplete
   */
  suggestAccounts(query, limit = 10) {
    if (!query || query.length < 2) {
      return this.salesforceAccounts.slice(0, limit).map((a) => ({ ...a, score: 0 }));
    }
    const search = query.toLowerCase();
    const results = [];
    for (const acc of this.salesforceAccounts) {
      const name = acc.name?.toLowerCase() || "";
      let score = 0;
      if (name === search) {
        score = 100;
      } else if (name.startsWith(search)) {
        score = 90;
      } else if (name.includes(search)) {
        score = 70;
      } else if (search.includes(name)) {
        score = 50;
      }
      if (score > 0) {
        results.push({ ...acc, score });
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }
};
var accountDetector = new AccountDetector();
function buildAnalysisPrompt(accountName, context) {
  let contextSection = "";
  if (context?.account || context?.opportunities?.length) {
    contextSection = `
ACCOUNT CONTEXT (use to inform your analysis):
${context.account ? `- Account: ${context.account.name}` : ""}
${context.account?.owner ? `- Account Owner: ${context.account.owner}` : ""}
${context.opportunities?.length ? `- Open Opportunities: ${context.opportunities.map((o) => `${o.name} (${o.stage}, $${(o.acv / 1e3).toFixed(0)}k)`).join("; ")}` : ""}
${context.contacts?.length ? `- Known Contacts: ${context.contacts.slice(0, 5).map((c) => `${c.name} - ${c.title}`).join("; ")}` : ""}
`;
  }
  return `You are a senior sales intelligence analyst for Eudia, an AI-powered legal technology company. Your role is to extract precise, actionable intelligence from sales meeting transcripts.

ABOUT EUDIA:
Eudia provides AI solutions for legal teams at enterprise companies. Our products help in-house legal teams work faster on contracting, compliance, and M&A due diligence. We sell to CLOs, General Counsels, VP Legal, Legal Ops Directors, and Deputy GCs.

${accountName ? `CURRENT ACCOUNT: ${accountName}` : ""}
${contextSection}

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
CRITICAL RULES - Follow these exactly:
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

1. ONLY include information EXPLICITLY stated in the transcript
   - Never infer, assume, or add information not present
   - If something is unclear, mark it as "[unclear]"
   - If a section has no relevant content, write "None identified in this conversation."

2. NAMES must be exact
   - Spell names exactly as you hear them
   - If pronunciation is unclear, write "[unclear: sounds like 'Sarah']"
   - Include title/role ONLY if explicitly mentioned

3. QUOTES are required for key insights
   - Include at least one direct quote per major finding where available
   - Format quotes with quotation marks and attribution

4. PRODUCT INTEREST must use ONLY these exact values:
   - AI Contracting - Technology
   - AI Contracting - Services
   - AI Compliance - Technology
   - AI Compliance - Services
   - AI M&A - Technology
   - AI M&A - Services
   - Sigma
   
   If no products were explicitly discussed or implied, write "None identified."
   Do NOT invent product interest. Only include if there's clear evidence.

5. TIMESTAMPS
   - If specific dates are mentioned, include them
   - For relative dates ("next week", "end of quarter"), calculate from today's context

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
OUTPUT FORMAT - Use these exact headers:
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

## Summary
Provide 5-7 bullet points covering:
- Meeting purpose and context
- Key discussion topics
- Major decisions or conclusions
- Tone and sentiment of the conversation
- Overall assessment of the opportunity
Each bullet should be a complete thought. Include direct quotes where impactful.

## Attendees
List each person identified on the call:
- **[Name]** - [Title/Role if mentioned] ([Company if external])

If attendee names are unclear, note: "[Several attendees - names unclear]"

## MEDDICC Signals
Analyze the conversation through the MEDDICC framework. For each element, provide specific evidence or mark as not identified:

**Metrics:** What quantifiable goals or pain metrics were mentioned?
> [Quote or evidence, or "Not discussed"]

**Economic Buyer:** Who has budget authority? Were they on the call?
> [Name and evidence, or "Not identified"]

**Decision Criteria:** What will they evaluate solutions against?
> [Specific criteria mentioned, or "Not discussed"]

**Decision Process:** What is their buying process? Timeline?
> [Process details, or "Not discussed"]

**Identify Pain:** What specific problems are they trying to solve?
> [Pain points with quotes, or "Not discussed"]

**Champion:** Who is advocating for this internally?
> [Name and evidence, or "Not identified"]

**Competition:** Were other solutions or competitors mentioned?
> [Competitor names and context, or "None mentioned"]

## Product Interest
From Eudia's product portfolio, which solutions are relevant based on the discussion:
- [Product Line from allowed list]: [Evidence from conversation]

If no clear product fit was discussed, write: "None identified - discovery needed."

## Pain Points
Top 3 challenges or problems mentioned by the prospect. For each:
- **[Pain Point]**: "[Direct quote demonstrating the pain]"

If no pain points surfaced, write: "None explicitly stated - deeper discovery recommended."

## Buying Triggers
What prompted this conversation? What's driving urgency?
- [Trigger]: [Evidence]

Examples: acquisition activity, compliance audit, new CLO hire, contract volume spike, budget cycle

## Key Dates
Important dates and deadlines mentioned:
- **[Date/Timeframe]**: [What it relates to]

If none mentioned, write: "No specific dates discussed."

## Next Steps
Agreed actions from the call. Use checkbox format for tracking:
- [ ] [Action] - **Owner:** [Name or "TBD"] - **Due:** [Date if mentioned]

Only include explicitly agreed next steps, not assumed ones.

## Action Items (Internal)
Follow-ups for the Eudia team (not discussed with prospect):
- [ ] [Internal action needed]

Examples: Send materials, schedule follow-up, loop in SE, update Salesforce

## Deal Signals
Indicators of deal health and stage progression:

**Positive Signals:**
- [Signal]: [Evidence]

**Concerning Signals:**
- [Signal]: [Evidence]

**Recommended Stage:** [Stage 1-4 based on MEDDICC completion]

## Risks & Objections
Concerns or objections raised:
- **[Objection]**: "[Quote or paraphrase]" \u2192 [Suggested response approach]

If no objections raised, write: "None raised in this conversation."

## Competitive Intelligence
If competitors were mentioned:
- **[Competitor]**: [What was said, sentiment, perceived strengths/weaknesses]

If no competitors mentioned, write: "No competitive mentions."

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
FINAL CHECKS:
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
- Every claim has evidence from the transcript
- Names are spelled exactly as heard
- Product lines use only the allowed values
- Quotes are properly attributed
- Action items have clear owners`;
}
var TranscriptionService = class {
  constructor(serverUrl, openaiApiKey) {
    this.openaiApiKey = null;
    this.serverUrl = serverUrl;
    this.openaiApiKey = openaiApiKey || null;
  }
  /**
   * Update server URL
   */
  setServerUrl(url) {
    this.serverUrl = url;
  }
  /**
   * Update OpenAI API key
   */
  setOpenAIKey(key) {
    this.openaiApiKey = key;
  }
  /**
   * Send audio for transcription and summarization
   * Tries server first, falls back to local OpenAI if server unavailable
   */
  async transcribeAndSummarize(audioBase64, mimeType, accountName, accountId, context) {
    try {
      const response = await (0, import_obsidian.requestUrl)({
        url: `${this.serverUrl}/api/transcribe-and-summarize`,
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          audio: audioBase64,
          mimeType,
          accountName,
          accountId,
          openaiApiKey: this.openaiApiKey,
          context: context ? {
            customerBrain: context.account?.customerBrain,
            opportunities: context.opportunities,
            contacts: context.contacts
          } : void 0,
          // Send the enhanced prompt to server
          systemPrompt: buildAnalysisPrompt(accountName, context)
        })
      });
      if (!response.json.success) {
        if (response.json.error?.includes("OpenAI not initialized") && this.openaiApiKey) {
          console.log("Server OpenAI unavailable, trying local fallback...");
          return this.transcribeLocal(audioBase64, mimeType, accountName, context);
        }
        return {
          success: false,
          transcript: "",
          sections: this.getEmptySections(),
          duration: 0,
          error: response.json.error || "Transcription failed"
        };
      }
      return {
        success: true,
        transcript: response.json.transcript || "",
        sections: this.normalizeSections(response.json.sections),
        duration: response.json.duration || 0
      };
    } catch (error) {
      console.error("Server transcription error:", error);
      if (this.openaiApiKey) {
        console.log("Server unreachable, trying local OpenAI fallback...");
        return this.transcribeLocal(audioBase64, mimeType, accountName, context);
      }
      return {
        success: false,
        transcript: "",
        sections: this.getEmptySections(),
        duration: 0,
        error: `Server unavailable: ${error.message}. Add OpenAI API key in settings for offline mode.`
      };
    }
  }
  /**
   * Local fallback transcription using user's OpenAI key
   */
  async transcribeLocal(audioBase64, mimeType, accountName, context) {
    if (!this.openaiApiKey) {
      return {
        success: false,
        transcript: "",
        sections: this.getEmptySections(),
        duration: 0,
        error: "No OpenAI API key configured. Add it in plugin settings."
      };
    }
    try {
      const binaryString = atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const audioBlob = new Blob([bytes], { type: mimeType });
      const formData = new FormData();
      const extension = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "m4a" : "ogg";
      formData.append("file", audioBlob, `audio.${extension}`);
      formData.append("model", "whisper-1");
      formData.append("response_format", "verbose_json");
      formData.append("language", "en");
      const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.openaiApiKey}`
        },
        body: formData
      });
      if (!whisperResponse.ok) {
        const errorText = await whisperResponse.text();
        throw new Error(`Whisper API error: ${whisperResponse.status} - ${errorText}`);
      }
      const whisperResult = await whisperResponse.json();
      const transcript = whisperResult.text || "";
      const duration = whisperResult.duration || 0;
      const sections = await this.summarizeLocal(transcript, accountName, context);
      return {
        success: true,
        transcript,
        sections,
        duration
      };
    } catch (error) {
      console.error("Local transcription error:", error);
      return {
        success: false,
        transcript: "",
        sections: this.getEmptySections(),
        duration: 0,
        error: error.message || "Local transcription failed"
      };
    }
  }
  /**
   * Summarize transcript locally using GPT-4o with precision prompt
   */
  async summarizeLocal(transcript, accountName, context) {
    if (!this.openaiApiKey) {
      return this.getEmptySections();
    }
    try {
      const systemPrompt = buildAnalysisPrompt(accountName, context);
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.openaiApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Analyze this meeting transcript:

${transcript.substring(0, 1e5)}` }
          ],
          temperature: 0.2,
          // Lower temperature for more consistent output
          max_tokens: 6e3
          // Increased for comprehensive analysis
        })
      });
      if (!response.ok) {
        console.warn("GPT summarization failed, returning empty sections");
        return this.getEmptySections();
      }
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || "";
      return this.parseSections(content);
    } catch (error) {
      console.error("Local summarization error:", error);
      return this.getEmptySections();
    }
  }
  /**
   * Parse GPT response into sections object
   * Enhanced to handle new section types
   */
  parseSections(content) {
    const sections = this.getEmptySections();
    const headerMap = {
      "summary": "summary",
      "attendees": "attendees",
      "meddicc signals": "meddiccSignals",
      "product interest": "productInterest",
      "pain points": "painPoints",
      "buying triggers": "buyingTriggers",
      "key dates": "keyDates",
      "next steps": "nextSteps",
      "action items": "actionItems",
      "action items (internal)": "actionItems",
      "deal signals": "dealSignals",
      "risks & objections": "risksObjections",
      "risks and objections": "risksObjections",
      "competitive intelligence": "competitiveIntel"
    };
    const sectionRegex = /## ([^\n]+)\n([\s\S]*?)(?=## |$)/g;
    let match;
    while ((match = sectionRegex.exec(content)) !== null) {
      const header = match[1].trim().toLowerCase();
      const body = match[2].trim();
      const key = headerMap[header];
      if (key) {
        sections[key] = body;
      }
    }
    return sections;
  }
  /**
   * Normalize sections from server response to ensure all fields exist
   */
  normalizeSections(serverSections) {
    const empty = this.getEmptySections();
    if (!serverSections)
      return empty;
    return {
      ...empty,
      ...serverSections
    };
  }
  /**
   * Fetch meeting context for an account (pre-call)
   */
  async getMeetingContext(accountId) {
    try {
      const response = await (0, import_obsidian.requestUrl)({
        url: `${this.serverUrl}/api/meeting-context/${accountId}`,
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });
      if (!response.json.success) {
        return {
          success: false,
          error: response.json.error || "Failed to fetch context"
        };
      }
      return {
        success: true,
        account: response.json.account,
        opportunities: response.json.opportunities,
        contacts: response.json.contacts,
        lastMeeting: response.json.lastMeeting
      };
    } catch (error) {
      console.error("Meeting context error:", error);
      return {
        success: false,
        error: error.message || "Network error"
      };
    }
  }
  /**
   * Sync transcription results to Salesforce
   */
  async syncToSalesforce(accountId, accountName, noteTitle, sections, transcript, meetingDate) {
    try {
      const response = await (0, import_obsidian.requestUrl)({
        url: `${this.serverUrl}/api/transcription/sync-to-salesforce`,
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          accountId,
          accountName,
          noteTitle,
          sections,
          transcript,
          meetingDate: meetingDate || (/* @__PURE__ */ new Date()).toISOString(),
          syncedAt: (/* @__PURE__ */ new Date()).toISOString()
        })
      });
      if (!response.json.success) {
        return {
          success: false,
          error: response.json.error || "Sync failed"
        };
      }
      return {
        success: true,
        customerBrainUpdated: response.json.customerBrainUpdated,
        eventCreated: response.json.eventCreated,
        eventId: response.json.eventId,
        contactsCreated: response.json.contactsCreated,
        tasksCreated: response.json.tasksCreated
      };
    } catch (error) {
      console.error("Salesforce sync error:", error);
      return {
        success: false,
        error: error.message || "Network error"
      };
    }
  }
  /**
   * Get empty sections structure with all fields
   */
  getEmptySections() {
    return {
      summary: "",
      attendees: "",
      meddiccSignals: "",
      productInterest: "",
      painPoints: "",
      buyingTriggers: "",
      keyDates: "",
      nextSteps: "",
      actionItems: "",
      dealSignals: "",
      risksObjections: "",
      competitiveIntel: ""
    };
  }
  /**
   * Format sections for note insertion
   * Optimized for busy salespeople: TL;DR first, evidence-based insights, actionable checklists
   */
  static formatSectionsForNote(sections, transcript) {
    let content = "";
    if (sections.summary) {
      content += `## TL;DR

${sections.summary}

`;
    }
    if (sections.painPoints && !sections.painPoints.includes("None explicitly stated")) {
      content += `## Pain Points

${sections.painPoints}

`;
    }
    if (sections.productInterest && !sections.productInterest.includes("None identified")) {
      content += `## Product Interest

${sections.productInterest}

`;
    }
    if (sections.meddiccSignals) {
      content += `## MEDDICC Signals

${sections.meddiccSignals}

`;
    }
    if (sections.nextSteps) {
      content += `## Next Steps

${sections.nextSteps}

`;
    }
    if (sections.actionItems) {
      content += `## Action Items (Internal)

${sections.actionItems}

`;
    }
    if (sections.keyDates && !sections.keyDates.includes("No specific dates")) {
      content += `## Key Dates

${sections.keyDates}

`;
    }
    if (sections.buyingTriggers) {
      content += `## Buying Triggers

${sections.buyingTriggers}

`;
    }
    if (sections.dealSignals) {
      content += `## Deal Signals

${sections.dealSignals}

`;
    }
    if (sections.risksObjections && !sections.risksObjections.includes("None raised")) {
      content += `## Risks & Objections

${sections.risksObjections}

`;
    }
    if (sections.competitiveIntel && !sections.competitiveIntel.includes("No competitive")) {
      content += `## Competitive Intelligence

${sections.competitiveIntel}

`;
    }
    if (sections.attendees) {
      content += `## Attendees

${sections.attendees}

`;
    }
    if (transcript) {
      content += `---

<details>
<summary><strong>Full Transcript</strong></summary>

${transcript}

</details>
`;
    }
    return content;
  }
  /**
   * Format sections for note with audio file reference
   */
  static formatSectionsWithAudio(sections, transcript, audioFilePath) {
    let content = this.formatSectionsForNote(sections, transcript);
    if (audioFilePath) {
      content += `
---

## Recording

![[${audioFilePath}]]
`;
    }
    return content;
  }
  /**
   * Format meeting context for pre-call injection
   */
  static formatContextForNote(context) {
    if (!context.success)
      return "";
    let content = "## Pre-Call Context\n\n";
    if (context.account) {
      content += `**Account:** ${context.account.name}
`;
      content += `**Owner:** ${context.account.owner}

`;
    }
    if (context.opportunities && context.opportunities.length > 0) {
      content += "### Open Opportunities\n\n";
      for (const opp of context.opportunities) {
        const acvFormatted = opp.acv ? `$${(opp.acv / 1e3).toFixed(0)}k` : "TBD";
        content += `- **${opp.name}** - ${opp.stage} - ${acvFormatted}`;
        if (opp.targetSignDate) {
          content += ` - Target: ${new Date(opp.targetSignDate).toLocaleDateString()}`;
        }
        content += "\n";
      }
      content += "\n";
    }
    if (context.contacts && context.contacts.length > 0) {
      content += "### Key Contacts\n\n";
      for (const contact of context.contacts.slice(0, 5)) {
        content += `- **${contact.name}**`;
        if (contact.title)
          content += ` - ${contact.title}`;
        content += "\n";
      }
      content += "\n";
    }
    if (context.lastMeeting) {
      content += "### Last Meeting\n\n";
      content += `${new Date(context.lastMeeting.date).toLocaleDateString()} - ${context.lastMeeting.subject}

`;
    }
    if (context.account?.customerBrain) {
      const recentNotes = context.account.customerBrain.substring(0, 500);
      if (recentNotes) {
        content += "### Recent Notes\n\n";
        content += `${recentNotes}${context.account.customerBrain.length > 500 ? "..." : ""}

`;
      }
    }
    content += "---\n\n";
    return content;
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // WRAPPER METHODS - For main.ts compatibility
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Convert Blob to base64 string
   */
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  /**
   * Wrapper method for main.ts - transcribes audio blob
   * Called by main.ts line 1261
   */
  async transcribeAudio(audioBlob, context) {
    try {
      const base64 = await this.blobToBase64(audioBlob);
      const mimeType = audioBlob.type || "audio/webm";
      const result = await this.transcribeAndSummarize(
        base64,
        mimeType,
        context?.accountName,
        context?.accountId
      );
      return {
        text: result.transcript,
        confidence: result.success ? 0.95 : 0,
        duration: result.duration
      };
    } catch (error) {
      console.error("transcribeAudio error:", error);
      return {
        text: "",
        confidence: 0,
        duration: 0
      };
    }
  }
  /**
   * Wrapper method for main.ts - processes transcription into sections
   * Called by main.ts line 1266
   */
  async processTranscription(transcriptText, context) {
    if (!transcriptText || transcriptText.trim().length === 0) {
      return this.getEmptySections();
    }
    try {
      if (this.openaiApiKey) {
        const prompt = `Analyze this meeting transcript and extract structured information:

TRANSCRIPT:
${transcriptText}

Extract the following in JSON format:
{
  "summary": "2-3 sentence meeting summary",
  "keyPoints": ["key point 1", "key point 2", ...],
  "nextSteps": ["action item 1", "action item 2", ...],
  "meddiccSignals": [{"category": "Metrics|Economic Buyer|Decision Criteria|Decision Process|Identify Pain|Champion|Competition", "signal": "the signal text", "confidence": 0.8}],
  "attendees": ["name 1", "name 2", ...]
}`;
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.openaiApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a sales meeting analyst. Extract structured information from transcripts. Return valid JSON only." },
              { role: "user", content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 2e3
          })
        });
        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const formatNextSteps = (steps) => {
              if (Array.isArray(steps)) {
                return steps.map((s) => `- [ ] ${s}`).join("\n");
              }
              return steps || "";
            };
            const formatKeyPoints = (points) => {
              if (Array.isArray(points)) {
                return points.map((p) => `- ${p}`).join("\n");
              }
              return points || "";
            };
            const formatMeddicc = (signals) => {
              if (Array.isArray(signals)) {
                return signals.map((s) => {
                  if (typeof s === "object" && s.category) {
                    return `**${s.category}**: ${s.signal || s.insight || ""}`;
                  }
                  return `- ${s}`;
                }).join("\n");
              }
              return signals || "";
            };
            const formatAttendees = (attendees) => {
              if (Array.isArray(attendees)) {
                return attendees.map((a) => `- ${a}`).join("\n");
              }
              return attendees || "";
            };
            return {
              summary: parsed.summary || "",
              painPoints: formatKeyPoints(parsed.keyPoints || parsed.painPoints),
              productInterest: "",
              meddiccSignals: formatMeddicc(parsed.meddiccSignals),
              nextSteps: formatNextSteps(parsed.nextSteps),
              actionItems: "",
              keyDates: "",
              buyingTriggers: "",
              dealSignals: "",
              risksObjections: "",
              competitiveIntel: "",
              attendees: formatAttendees(parsed.attendees),
              transcript: transcriptText
            };
          }
        }
      }
      return {
        summary: "Meeting transcript captured. Review for key details.",
        painPoints: "",
        productInterest: "",
        meddiccSignals: "",
        nextSteps: "",
        actionItems: "",
        keyDates: "",
        buyingTriggers: "",
        dealSignals: "",
        risksObjections: "",
        competitiveIntel: "",
        attendees: "",
        transcript: transcriptText
      };
    } catch (error) {
      console.error("processTranscription error:", error);
      return {
        summary: "",
        painPoints: "",
        productInterest: "",
        meddiccSignals: "",
        nextSteps: "",
        actionItems: "",
        keyDates: "",
        buyingTriggers: "",
        dealSignals: "",
        risksObjections: "",
        competitiveIntel: "",
        attendees: "",
        transcript: transcriptText
      };
    }
  }
};

// src/CalendarService.ts
var import_obsidian2 = require("obsidian");
var CalendarService = class {
  constructor(serverUrl, userEmail) {
    this.serverUrl = serverUrl;
    this.userEmail = userEmail.toLowerCase();
  }
  /**
   * Update user email
   */
  setUserEmail(email) {
    this.userEmail = email.toLowerCase();
  }
  /**
   * Update server URL
   */
  setServerUrl(url) {
    this.serverUrl = url;
  }
  /**
   * Fetch today's meetings
   */
  async getTodaysMeetings() {
    if (!this.userEmail) {
      return {
        success: false,
        date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        email: "",
        meetingCount: 0,
        meetings: [],
        error: "User email not configured"
      };
    }
    try {
      const response = await (0, import_obsidian2.requestUrl)({
        url: `${this.serverUrl}/api/calendar/${this.userEmail}/today`,
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      return response.json;
    } catch (error) {
      console.error("Failed to fetch today's meetings:", error);
      return {
        success: false,
        date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        email: this.userEmail,
        meetingCount: 0,
        meetings: [],
        error: error.message || "Failed to fetch calendar"
      };
    }
  }
  /**
   * Fetch this week's meetings
   */
  async getWeekMeetings() {
    if (!this.userEmail) {
      return {
        success: false,
        startDate: "",
        endDate: "",
        email: "",
        totalMeetings: 0,
        byDay: {},
        error: "User email not configured"
      };
    }
    try {
      const response = await (0, import_obsidian2.requestUrl)({
        url: `${this.serverUrl}/api/calendar/${this.userEmail}/week`,
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      return response.json;
    } catch (error) {
      console.error("Failed to fetch week's meetings:", error);
      return {
        success: false,
        startDate: "",
        endDate: "",
        email: this.userEmail,
        totalMeetings: 0,
        byDay: {},
        error: error.message || "Failed to fetch calendar"
      };
    }
  }
  /**
   * Fetch meetings for a custom date range
   */
  async getMeetingsInRange(startDate, endDate) {
    if (!this.userEmail) {
      return [];
    }
    try {
      const start = startDate.toISOString().split("T")[0];
      const end = endDate.toISOString().split("T")[0];
      const response = await (0, import_obsidian2.requestUrl)({
        url: `${this.serverUrl}/api/calendar/${this.userEmail}/range?start=${start}&end=${end}`,
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (response.json.success) {
        return response.json.meetings || [];
      }
      return [];
    } catch (error) {
      console.error("Failed to fetch calendar range:", error);
      return [];
    }
  }
  /**
   * Get the current or upcoming meeting (within 15 min window)
   * Used for auto-detecting meeting at recording start
   */
  async getCurrentMeeting() {
    const todayResponse = await this.getTodaysMeetings();
    if (!todayResponse.success || todayResponse.meetings.length === 0) {
      return { meeting: null, isNow: false };
    }
    const now = /* @__PURE__ */ new Date();
    for (const meeting of todayResponse.meetings) {
      const start = new Date(meeting.start);
      const end = new Date(meeting.end);
      if (now >= start && now <= end) {
        return {
          meeting,
          isNow: true
        };
      }
      const minutesUntilStart = (start.getTime() - now.getTime()) / (1e3 * 60);
      if (minutesUntilStart > 0 && minutesUntilStart <= 15) {
        return {
          meeting,
          isNow: false,
          minutesUntilStart: Math.ceil(minutesUntilStart)
        };
      }
    }
    return { meeting: null, isNow: false };
  }
  /**
   * Find upcoming meetings for a specific account
   */
  async getMeetingsForAccount(accountName) {
    const weekResponse = await this.getWeekMeetings();
    if (!weekResponse.success) {
      return [];
    }
    const allMeetings = [];
    Object.values(weekResponse.byDay).forEach((dayMeetings) => {
      allMeetings.push(...dayMeetings);
    });
    const lowerAccountName = accountName.toLowerCase();
    return allMeetings.filter(
      (m) => m.accountName?.toLowerCase().includes(lowerAccountName) || m.subject.toLowerCase().includes(lowerAccountName) || m.attendees.some(
        (a) => a.email.toLowerCase().includes(lowerAccountName.split(" ")[0])
      )
    );
  }
  /**
   * Format meeting for note template
   */
  static formatMeetingForNote(meeting) {
    const externalAttendees = meeting.attendees.filter((a) => a.isExternal !== false).map((a) => a.name || a.email.split("@")[0]).slice(0, 5).join(", ");
    return {
      title: meeting.subject,
      attendees: externalAttendees,
      meetingStart: meeting.start,
      accountName: meeting.accountName
    };
  }
  /**
   * Get day name from date string
   */
  static getDayName(dateString) {
    const date = new Date(dateString);
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const meetingDate = new Date(date);
    meetingDate.setHours(0, 0, 0, 0);
    const diff = (meetingDate.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24);
    if (diff === 0)
      return "Today";
    if (diff === 1)
      return "Tomorrow";
    return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  }
  /**
   * Format time for display (e.g., "10:00 AM")
   */
  static formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  }
  /**
   * Calculate meeting duration in minutes
   */
  static getMeetingDuration(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return Math.round((endDate.getTime() - startDate.getTime()) / (1e3 * 60));
  }
};

// src/SmartTagService.ts
var PRODUCT_LINE_TAGS = [
  "ai-contracting-tech",
  "ai-contracting-services",
  "ai-compliance-tech",
  "ai-compliance-services",
  "ai-ma-tech",
  "ai-ma-services",
  "sigma"
];
var MEDDICC_SIGNAL_TAGS = [
  "metrics-identified",
  "economic-buyer-identified",
  "decision-criteria-discussed",
  "decision-process-discussed",
  "pain-confirmed",
  "champion-identified",
  "competition-mentioned"
];
var DEAL_HEALTH_TAGS = [
  "progressing",
  "stalled",
  "at-risk",
  "champion-engaged",
  "early-stage"
];
var MEETING_TYPE_TAGS = [
  "discovery",
  "demo",
  "negotiation",
  "qbr",
  "implementation",
  "follow-up"
];
var TAG_EXTRACTION_PROMPT = `You are a sales intelligence tagger for Eudia, an AI legal technology company. Extract structured tags from meeting analysis.

ALLOWED VALUES (use ONLY these exact values):

Product Lines (select all that apply):
- ai-contracting-tech (AI Contracting Technology product)
- ai-contracting-services (AI Contracting Services)
- ai-compliance-tech (AI Compliance Technology)
- ai-compliance-services (AI Compliance Services)
- ai-ma-tech (AI M&A Technology - Due Diligence)
- ai-ma-services (AI M&A Services)
- sigma (Sigma Platform)

MEDDICC Signals (select all that are evidenced):
- metrics-identified (specific metrics, numbers, or goals were discussed)
- economic-buyer-identified (person with budget authority was named or present)
- decision-criteria-discussed (evaluation criteria mentioned)
- decision-process-discussed (approval process or timeline discussed)
- pain-confirmed (specific problems stated with clear evidence)
- champion-identified (internal advocate named or evident)
- competition-mentioned (competitors discussed)

Deal Health (select ONE):
- progressing (positive momentum, clear next steps)
- stalled (no clear progress or next steps)
- at-risk (objections, delays, significant concerns)
- champion-engaged (strong internal support evident)
- early-stage (initial discovery, relationship building)

Meeting Type (select ONE):
- discovery (learning about needs and situation)
- demo (showing product capabilities)
- negotiation (pricing, terms, contract discussion)
- qbr (quarterly business review)
- implementation (post-sale, onboarding)
- follow-up (continuing prior conversation)

RULES:
1. Only tag what is EXPLICITLY evidenced in the content
2. If no products discussed, use empty array
3. If no MEDDICC signals evident, use empty array
4. Always provide a meeting_type based on conversation nature
5. Include key stakeholders with their roles if mentioned

OUTPUT FORMAT (JSON only):
{
  "product_interest": ["tag1", "tag2"],
  "meddicc_signals": ["tag1", "tag2"],
  "deal_health": "tag",
  "meeting_type": "tag",
  "key_stakeholders": ["Name - Role", "Name - Role"],
  "confidence": 0.85
}`;
var SmartTagService = class {
  constructor(serverUrl, openaiApiKey) {
    this.openaiApiKey = null;
    this.serverUrl = serverUrl;
    this.openaiApiKey = openaiApiKey || null;
  }
  /**
   * Update OpenAI API key
   */
  setOpenAIKey(key) {
    this.openaiApiKey = key;
  }
  /**
   * Update server URL
   */
  setServerUrl(url) {
    this.serverUrl = url;
  }
  /**
   * Extract smart tags from processed sections
   * Makes a focused secondary call for tag extraction
   */
  async extractTags(sections) {
    const context = this.buildTagContext(sections);
    if (!context.trim()) {
      return {
        success: false,
        tags: this.getEmptyTags(),
        error: "No content to analyze"
      };
    }
    try {
      return await this.extractTagsViaServer(context);
    } catch (serverError) {
      console.warn("Server tag extraction failed, trying local:", serverError.message);
      if (this.openaiApiKey) {
        return await this.extractTagsLocal(context);
      }
      return this.extractTagsRuleBased(sections);
    }
  }
  /**
   * Build context string from sections for tag extraction
   */
  buildTagContext(sections) {
    const parts = [];
    if (sections.summary) {
      parts.push(`SUMMARY:
${sections.summary}`);
    }
    if (sections.productInterest) {
      parts.push(`PRODUCT INTEREST:
${sections.productInterest}`);
    }
    if (sections.meddiccSignals) {
      parts.push(`MEDDICC SIGNALS:
${sections.meddiccSignals}`);
    }
    if (sections.dealSignals) {
      parts.push(`DEAL SIGNALS:
${sections.dealSignals}`);
    }
    if (sections.painPoints) {
      parts.push(`PAIN POINTS:
${sections.painPoints}`);
    }
    if (sections.attendees) {
      parts.push(`ATTENDEES:
${sections.attendees}`);
    }
    return parts.join("\n\n");
  }
  /**
   * Extract tags via GTM Brain server
   */
  async extractTagsViaServer(context) {
    const response = await fetch(`${this.serverUrl}/api/extract-tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context, openaiApiKey: this.openaiApiKey })
    });
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Tag extraction failed");
    }
    return {
      success: true,
      tags: this.validateAndNormalizeTags(result.tags)
    };
  }
  /**
   * Extract tags locally using OpenAI
   */
  async extractTagsLocal(context) {
    if (!this.openaiApiKey) {
      return {
        success: false,
        tags: this.getEmptyTags(),
        error: "No OpenAI API key configured"
      };
    }
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.openaiApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          // Faster and cheaper for structured extraction
          messages: [
            { role: "system", content: TAG_EXTRACTION_PROMPT },
            { role: "user", content: `Extract tags from this meeting content:

${context}` }
          ],
          temperature: 0.1,
          // Very low for consistent output
          response_format: { type: "json_object" }
        })
      });
      if (!response.ok) {
        throw new Error(`OpenAI returned ${response.status}`);
      }
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("No content in response");
      }
      const parsedTags = JSON.parse(content);
      return {
        success: true,
        tags: this.validateAndNormalizeTags(parsedTags)
      };
    } catch (error) {
      console.error("Local tag extraction error:", error);
      return {
        success: false,
        tags: this.getEmptyTags(),
        error: error.message || "Tag extraction failed"
      };
    }
  }
  /**
   * Rule-based tag extraction as fallback
   * Uses keyword matching when AI is unavailable
   */
  extractTagsRuleBased(sections) {
    const content = Object.values(sections).join(" ").toLowerCase();
    const tags = {
      product_interest: [],
      meddicc_signals: [],
      deal_health: "early-stage",
      meeting_type: "discovery",
      key_stakeholders: [],
      confidence: 0.4
      // Lower confidence for rule-based
    };
    if (content.includes("contract") || content.includes("contracting")) {
      if (content.includes("service")) {
        tags.product_interest.push("ai-contracting-services");
      } else {
        tags.product_interest.push("ai-contracting-tech");
      }
    }
    if (content.includes("compliance")) {
      tags.product_interest.push("ai-compliance-tech");
    }
    if (content.includes("m&a") || content.includes("due diligence") || content.includes("acquisition")) {
      tags.product_interest.push("ai-ma-tech");
    }
    if (content.includes("sigma")) {
      tags.product_interest.push("sigma");
    }
    if (content.includes("metric") || content.includes("%") || content.includes("roi") || content.includes("save")) {
      tags.meddicc_signals.push("metrics-identified");
    }
    if (content.includes("budget") || content.includes("cfo") || content.includes("economic buyer")) {
      tags.meddicc_signals.push("economic-buyer-identified");
    }
    if (content.includes("pain") || content.includes("challenge") || content.includes("problem") || content.includes("struggle")) {
      tags.meddicc_signals.push("pain-confirmed");
    }
    if (content.includes("champion") || content.includes("advocate") || content.includes("sponsor")) {
      tags.meddicc_signals.push("champion-identified");
    }
    if (content.includes("competitor") || content.includes("alternative") || content.includes("vs") || content.includes("compared to")) {
      tags.meddicc_signals.push("competition-mentioned");
    }
    if (content.includes("next step") || content.includes("follow up") || content.includes("schedule")) {
      tags.deal_health = "progressing";
    }
    if (content.includes("concern") || content.includes("objection") || content.includes("hesitant") || content.includes("risk")) {
      tags.deal_health = "at-risk";
    }
    if (content.includes("demo") || content.includes("show you") || content.includes("demonstration")) {
      tags.meeting_type = "demo";
    } else if (content.includes("pricing") || content.includes("negotiat") || content.includes("contract terms")) {
      tags.meeting_type = "negotiation";
    } else if (content.includes("quarterly") || content.includes("qbr") || content.includes("review")) {
      tags.meeting_type = "qbr";
    } else if (content.includes("implementation") || content.includes("onboard") || content.includes("rollout")) {
      tags.meeting_type = "implementation";
    }
    return {
      success: true,
      tags
    };
  }
  /**
   * Validate and normalize tags to ensure they match allowed values
   */
  validateAndNormalizeTags(rawTags) {
    const tags = {
      product_interest: [],
      meddicc_signals: [],
      deal_health: "early-stage",
      meeting_type: "discovery",
      key_stakeholders: [],
      confidence: rawTags.confidence || 0.8
    };
    if (Array.isArray(rawTags.product_interest)) {
      tags.product_interest = rawTags.product_interest.filter(
        (t) => PRODUCT_LINE_TAGS.includes(t)
      );
    }
    if (Array.isArray(rawTags.meddicc_signals)) {
      tags.meddicc_signals = rawTags.meddicc_signals.filter(
        (t) => MEDDICC_SIGNAL_TAGS.includes(t)
      );
    }
    if (DEAL_HEALTH_TAGS.includes(rawTags.deal_health)) {
      tags.deal_health = rawTags.deal_health;
    }
    if (MEETING_TYPE_TAGS.includes(rawTags.meeting_type)) {
      tags.meeting_type = rawTags.meeting_type;
    }
    if (Array.isArray(rawTags.key_stakeholders)) {
      tags.key_stakeholders = rawTags.key_stakeholders.slice(0, 10);
    }
    return tags;
  }
  /**
   * Get empty tags structure
   */
  getEmptyTags() {
    return {
      product_interest: [],
      meddicc_signals: [],
      deal_health: "early-stage",
      meeting_type: "discovery",
      key_stakeholders: [],
      confidence: 0
    };
  }
  /**
   * Format tags for YAML frontmatter
   */
  static formatTagsForFrontmatter(tags) {
    return {
      product_interest: tags.product_interest.length > 0 ? tags.product_interest : null,
      meddicc_signals: tags.meddicc_signals.length > 0 ? tags.meddicc_signals : null,
      deal_health: tags.deal_health,
      meeting_type: tags.meeting_type,
      key_stakeholders: tags.key_stakeholders.length > 0 ? tags.key_stakeholders : null,
      tag_confidence: Math.round(tags.confidence * 100)
    };
  }
  /**
   * Generate tag summary for display
   */
  static generateTagSummary(tags) {
    const parts = [];
    if (tags.product_interest.length > 0) {
      parts.push(`**Products:** ${tags.product_interest.join(", ")}`);
    }
    if (tags.meddicc_signals.length > 0) {
      parts.push(`**MEDDICC:** ${tags.meddicc_signals.join(", ")}`);
    }
    parts.push(`**Deal Health:** ${tags.deal_health}`);
    parts.push(`**Meeting Type:** ${tags.meeting_type}`);
    return parts.join(" | ");
  }
};

// main.ts
var DEFAULT_SETTINGS = {
  serverUrl: "https://gtm-wizard.onrender.com",
  accountsFolder: "Accounts",
  recordingsFolder: "Recordings",
  syncOnStartup: true,
  autoSyncAfterTranscription: true,
  saveAudioFiles: true,
  appendTranscript: true,
  lastSyncTime: null,
  cachedAccounts: [],
  enableSmartTags: true,
  showCalendarView: true,
  userEmail: "",
  setupCompleted: false,
  calendarConfigured: false,
  openaiApiKey: ""
};
var CALENDAR_VIEW_TYPE = "eudia-calendar-view";
var AccountSuggester = class extends import_obsidian3.EditorSuggest {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onTrigger(cursor, editor, file) {
    const line = editor.getLine(cursor.line);
    const content = editor.getValue();
    const cursorOffset = editor.posToOffset(cursor);
    const frontmatterStart = content.indexOf("---");
    const frontmatterEnd = content.indexOf("---", frontmatterStart + 3);
    if (frontmatterStart === -1 || cursorOffset < frontmatterStart || cursorOffset > frontmatterEnd) {
      return null;
    }
    const accountMatch = line.match(/^account:\s*(.*)$/);
    if (!accountMatch)
      return null;
    const query = accountMatch[1].trim();
    const startPos = line.indexOf(":") + 1;
    const leadingSpaces = line.substring(startPos).match(/^\s*/)?.[0].length || 0;
    return {
      start: { line: cursor.line, ch: startPos + leadingSpaces },
      end: cursor,
      query
    };
  }
  getSuggestions(context) {
    const query = context.query.toLowerCase();
    const accounts = this.plugin.settings.cachedAccounts;
    if (!query)
      return accounts.slice(0, 10);
    return accounts.filter((a) => a.name.toLowerCase().includes(query)).sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(query);
      const bStarts = b.name.toLowerCase().startsWith(query);
      if (aStarts && !bStarts)
        return -1;
      if (bStarts && !aStarts)
        return 1;
      return a.name.localeCompare(b.name);
    }).slice(0, 10);
  }
  renderSuggestion(account, el) {
    el.createEl("div", { text: account.name, cls: "suggestion-title" });
  }
  selectSuggestion(account, evt) {
    if (!this.context)
      return;
    this.context.editor.replaceRange(account.name, this.context.start, this.context.end);
  }
};
var RecordingStatusBar = class {
  constructor(onPause, onResume, onStop, onCancel) {
    this.containerEl = null;
    this.levelBarEl = null;
    this.onPause = onPause;
    this.onResume = onResume;
    this.onStop = onStop;
    this.onCancel = onCancel;
  }
  show() {
    if (this.containerEl)
      return;
    this.containerEl = document.createElement("div");
    this.containerEl.className = "eudia-transcription-bar active";
    const levelContainer = document.createElement("div");
    levelContainer.className = "eudia-level-container";
    this.levelBarEl = document.createElement("div");
    this.levelBarEl.className = "eudia-level-bar";
    this.levelBarEl.style.width = "0%";
    levelContainer.appendChild(this.levelBarEl);
    this.containerEl.appendChild(levelContainer);
    const controls = document.createElement("div");
    controls.className = "eudia-controls-minimal";
    const stopBtn = document.createElement("button");
    stopBtn.className = "eudia-control-btn stop";
    stopBtn.innerHTML = "\u23F9";
    stopBtn.title = "Stop & Summarize";
    stopBtn.onclick = () => this.onStop();
    controls.appendChild(stopBtn);
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "eudia-control-btn cancel";
    cancelBtn.innerHTML = "\u2715";
    cancelBtn.title = "Cancel";
    cancelBtn.onclick = () => this.onCancel();
    controls.appendChild(cancelBtn);
    this.containerEl.appendChild(controls);
    document.body.appendChild(this.containerEl);
  }
  hide() {
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }
  }
  updateState(state) {
    if (!this.containerEl || !this.levelBarEl)
      return;
    this.levelBarEl.style.width = `${state.audioLevel}%`;
    this.containerEl.className = state.isPaused ? "eudia-transcription-bar paused" : "eudia-transcription-bar active";
  }
  showProcessing() {
    if (!this.containerEl)
      return;
    this.containerEl.className = "eudia-transcription-bar processing";
    if (this.levelBarEl?.parentElement) {
      this.levelBarEl.parentElement.style.display = "none";
    }
  }
  showComplete(stats) {
    if (!this.containerEl)
      return;
    this.containerEl.innerHTML = "";
    this.containerEl.className = "eudia-transcription-bar complete";
    const successIcon = document.createElement("div");
    successIcon.className = "eudia-complete-icon";
    successIcon.innerHTML = "\u2713";
    this.containerEl.appendChild(successIcon);
    const statsContainer = document.createElement("div");
    statsContainer.className = "eudia-complete-stats";
    const durationStat = document.createElement("div");
    durationStat.className = "eudia-stat";
    durationStat.innerHTML = `<span class="eudia-stat-value">${Math.round(stats.duration / 60)}m</span><span class="eudia-stat-label">Duration</span>`;
    statsContainer.appendChild(durationStat);
    const confidenceStat = document.createElement("div");
    confidenceStat.className = "eudia-stat";
    const confidenceClass = stats.confidence >= 90 ? "high" : stats.confidence >= 70 ? "medium" : "low";
    confidenceStat.innerHTML = `<span class="eudia-stat-value ${confidenceClass}">${stats.confidence}%</span><span class="eudia-stat-label">Confidence</span>`;
    statsContainer.appendChild(confidenceStat);
    const meddiccStat = document.createElement("div");
    meddiccStat.className = "eudia-stat";
    meddiccStat.innerHTML = `<span class="eudia-stat-value">${stats.meddiccCount}/7</span><span class="eudia-stat-label">MEDDICC</span>`;
    statsContainer.appendChild(meddiccStat);
    this.containerEl.appendChild(statsContainer);
    const closeBtn = document.createElement("button");
    closeBtn.className = "eudia-control-btn close";
    closeBtn.innerHTML = "\u2715";
    closeBtn.onclick = () => this.hide();
    this.containerEl.appendChild(closeBtn);
    setTimeout(() => this.hide(), 8e3);
  }
};
var ProcessingModal = class extends import_obsidian3.Modal {
  constructor(app) {
    super(app);
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("eudia-transcribing-modal");
    contentEl.createDiv({ cls: "spinner" });
    this.messageEl = contentEl.createEl("p", { text: "Transcribing audio..." });
    contentEl.createEl("p", { text: "This may take a moment for longer transcriptions." });
  }
  setMessage(message) {
    if (this.messageEl)
      this.messageEl.textContent = message;
  }
  onClose() {
    this.contentEl.empty();
  }
};
var AccountSelectorModal = class extends import_obsidian3.Modal {
  constructor(app, plugin, onSelect) {
    super(app);
    this.plugin = plugin;
    this.onSelect = onSelect;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("eudia-account-selector");
    contentEl.createEl("h3", { text: "Select Account for Meeting Note" });
    this.searchInput = contentEl.createEl("input", {
      type: "text",
      placeholder: "Search accounts..."
    });
    this.searchInput.style.cssText = "width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid var(--background-modifier-border);";
    this.resultsContainer = contentEl.createDiv({ cls: "eudia-account-results" });
    this.resultsContainer.style.cssText = "max-height: 300px; overflow-y: auto;";
    this.updateResults("");
    this.searchInput.addEventListener("input", () => this.updateResults(this.searchInput.value));
    this.searchInput.focus();
  }
  updateResults(query) {
    this.resultsContainer.empty();
    const accounts = this.plugin.settings.cachedAccounts;
    const filtered = query ? accounts.filter((a) => a.name.toLowerCase().includes(query.toLowerCase())).slice(0, 15) : accounts.slice(0, 15);
    if (filtered.length === 0) {
      this.resultsContainer.createDiv({ cls: "eudia-no-results", text: "No accounts found" });
      return;
    }
    filtered.forEach((account) => {
      const item = this.resultsContainer.createDiv({ cls: "eudia-account-item", text: account.name });
      item.onclick = () => {
        this.onSelect(account);
        this.close();
      };
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var SetupWizardModal = class extends import_obsidian3.Modal {
  constructor(app, plugin) {
    super(app);
    this.currentStep = 0;
    this.plugin = plugin;
    this.steps = [
      { id: "email", label: "Setting up your profile", status: "pending" },
      { id: "accounts", label: "Syncing Salesforce accounts", status: "pending" },
      { id: "calendar", label: "Connecting calendar", status: "pending" }
    ];
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("eudia-setup-wizard");
    this.renderWelcome();
  }
  renderWelcome() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Welcome to Eudia" });
    contentEl.createEl("p", { text: "Let's get you set up in 30 seconds." });
    const infoBox = contentEl.createDiv({ cls: "eudia-setup-info" });
    infoBox.innerHTML = `
      <p style="margin: 0 0 8px 0;"><strong>Transcribe meetings</strong> with one click</p>
      <p style="margin: 0 0 8px 0;"><strong>View your calendar</strong> and create notes</p>
      <p style="margin: 0;"><strong>Sync to Salesforce</strong> automatically</p>
    `;
    const section = contentEl.createDiv({ cls: "eudia-setup-section" });
    section.createEl("h3", { text: "Your Eudia Email" });
    const emailInput = section.createEl("input", {
      type: "email",
      placeholder: "yourname@eudia.com"
    });
    emailInput.addClass("eudia-email-input");
    if (this.plugin.settings.userEmail) {
      emailInput.value = this.plugin.settings.userEmail;
    }
    const buttons = contentEl.createDiv({ cls: "eudia-setup-buttons" });
    const skipBtn = buttons.createEl("button", { text: "Skip for now" });
    skipBtn.onclick = () => this.close();
    const startBtn = buttons.createEl("button", { text: "Get Started \u2192" });
    startBtn.setCssStyles({ background: "var(--interactive-accent)", color: "white" });
    startBtn.onclick = async () => {
      const email = emailInput.value.trim().toLowerCase();
      if (!email || !email.endsWith("@eudia.com")) {
        new import_obsidian3.Notice("Please enter your @eudia.com email address");
        return;
      }
      this.plugin.settings.userEmail = email;
      await this.plugin.saveSettings();
      await this.runSetup();
    };
  }
  async runSetup() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Setting Up..." });
    const statusContainer = contentEl.createDiv({ cls: "eudia-setup-status-list" });
    this.steps.forEach((step) => {
      const stepEl = statusContainer.createDiv({ cls: "eudia-setup-step" });
      stepEl.id = `step-${step.id}`;
      stepEl.createSpan({ text: "-", cls: "step-icon" });
      stepEl.createSpan({ text: step.label, cls: "step-label" });
    });
    this.updateStep("email", "complete");
    this.updateStep("accounts", "running");
    try {
      await this.plugin.syncAccounts(true);
      this.updateStep("accounts", "complete");
    } catch (e) {
      this.updateStep("accounts", "error");
    }
    this.updateStep("calendar", "running");
    this.plugin.settings.calendarConfigured = true;
    await this.plugin.saveSettings();
    this.updateStep("calendar", "complete");
    this.plugin.settings.setupCompleted = true;
    await this.plugin.saveSettings();
    await new Promise((r) => setTimeout(r, 500));
    this.renderSuccess();
  }
  updateStep(stepId, status) {
    const step = this.steps.find((s) => s.id === stepId);
    if (step)
      step.status = status;
    const stepEl = document.getElementById(`step-${stepId}`);
    if (stepEl) {
      const icon = stepEl.querySelector(".step-icon");
      if (icon) {
        if (status === "running")
          icon.textContent = "...";
        else if (status === "complete")
          icon.textContent = "[done]";
        else if (status === "error")
          icon.textContent = "[x]";
      }
      stepEl.className = `eudia-setup-step ${status}`;
    }
  }
  renderSuccess() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Setup Complete" });
    const tips = contentEl.createDiv({ cls: "eudia-setup-tips" });
    tips.innerHTML = `
      <p style="margin: 0 0 12px 0; font-weight: 600;">Quick Reference:</p>
      <p style="margin: 0 0 8px 0;">1. <strong>Calendar</strong> - Click calendar icon in left sidebar to view meetings</p>
      <p style="margin: 0 0 8px 0;">2. <strong>Transcription</strong> - Click microphone icon or Cmd/Ctrl+P and search "Transcribe"</p>
      <p style="margin: 0 0 8px 0;">3. <strong>Accounts</strong> - Pre-loaded folders are in the Accounts directory</p>
      <p style="margin: 0;">4. <strong>Create notes</strong> - Click any meeting to create a note in the correct account folder</p>
    `;
    const button = contentEl.createEl("button", { text: "Continue" });
    button.setCssStyles({
      background: "var(--interactive-accent)",
      color: "white",
      marginTop: "16px",
      padding: "12px 24px",
      cursor: "pointer"
    });
    button.onclick = () => {
      this.close();
      this.plugin.activateCalendarView();
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var EudiaCalendarView = class extends import_obsidian3.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.refreshInterval = null;
    this.lastError = null;
    this.plugin = plugin;
  }
  getViewType() {
    return CALENDAR_VIEW_TYPE;
  }
  getDisplayText() {
    return "Calendar";
  }
  getIcon() {
    return "calendar";
  }
  async onOpen() {
    await this.render();
    this.refreshInterval = window.setInterval(() => this.render(), 5 * 60 * 1e3);
  }
  async onClose() {
    if (this.refreshInterval)
      window.clearInterval(this.refreshInterval);
  }
  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("eudia-calendar-view");
    if (!this.plugin.settings.userEmail) {
      this.renderSetupPanel(container);
      return;
    }
    this.renderHeader(container);
    await this.renderCalendarContent(container);
  }
  renderHeader(container) {
    const header = container.createDiv({ cls: "eudia-calendar-header" });
    const titleRow = header.createDiv({ cls: "eudia-calendar-title-row" });
    titleRow.createEl("h4", { text: "Your Meetings" });
    const actions = titleRow.createDiv({ cls: "eudia-calendar-actions" });
    const refreshBtn = actions.createEl("button", { cls: "eudia-btn-icon", text: "\u21BB" });
    refreshBtn.title = "Refresh";
    refreshBtn.onclick = async () => {
      refreshBtn.addClass("spinning");
      await this.render();
      refreshBtn.removeClass("spinning");
    };
    const settingsBtn = actions.createEl("button", { cls: "eudia-btn-icon", text: "\u2699" });
    settingsBtn.title = "Settings";
    settingsBtn.onclick = () => {
      this.app.setting.open();
      this.app.setting.openTabById("eudia-sync");
    };
    const statusBar = header.createDiv({ cls: "eudia-status-bar" });
    this.renderConnectionStatus(statusBar);
  }
  async renderConnectionStatus(container) {
    const status = {
      server: "connecting",
      calendar: "not_configured",
      salesforce: "not_configured"
    };
    const serverUrl = this.plugin.settings.serverUrl;
    const userEmail = this.plugin.settings.userEmail;
    try {
      const healthResponse = await (0, import_obsidian3.requestUrl)({
        url: `${serverUrl}/api/health`,
        method: "GET",
        throw: false
      });
      if (healthResponse.status === 200) {
        status.server = "connected";
        status.serverMessage = "Server online";
      } else {
        status.server = "error";
        status.serverMessage = "Server unavailable";
      }
    } catch {
      status.server = "error";
      status.serverMessage = "Cannot reach server";
    }
    if (userEmail && status.server === "connected") {
      try {
        const validateResponse = await (0, import_obsidian3.requestUrl)({
          url: `${serverUrl}/api/calendar/validate/${encodeURIComponent(userEmail)}`,
          method: "GET",
          throw: false
        });
        if (validateResponse.status === 200 && validateResponse.json?.authorized) {
          status.calendar = "connected";
          status.calendarMessage = "Calendar synced";
        } else {
          status.calendar = "not_authorized";
          status.calendarMessage = "Not authorized";
        }
      } catch {
        status.calendar = "error";
        status.calendarMessage = "Error checking access";
      }
    }
    if (userEmail && status.server === "connected") {
      try {
        const sfResponse = await (0, import_obsidian3.requestUrl)({
          url: `${serverUrl}/api/sf/auth/status?email=${encodeURIComponent(userEmail)}`,
          method: "GET",
          throw: false
        });
        if (sfResponse.status === 200 && sfResponse.json?.connected) {
          status.salesforce = "connected";
          status.salesforceMessage = "Salesforce connected";
        } else {
          status.salesforce = "not_configured";
          status.salesforceMessage = "Not connected";
        }
      } catch {
        status.salesforce = "not_configured";
      }
    }
    const indicators = container.createDiv({ cls: "eudia-status-indicators" });
    const serverDot = indicators.createSpan({ cls: `eudia-status-dot ${status.server}` });
    serverDot.title = status.serverMessage || "Server";
    const calendarDot = indicators.createSpan({ cls: `eudia-status-dot ${status.calendar}` });
    calendarDot.title = status.calendarMessage || "Calendar";
    const sfDot = indicators.createSpan({ cls: `eudia-status-dot ${status.salesforce}` });
    sfDot.title = status.salesforceMessage || "Salesforce";
    const labels = container.createDiv({ cls: "eudia-status-labels" });
    labels.createSpan({ cls: "eudia-status-label", text: this.plugin.settings.userEmail });
    if (status.calendar === "not_authorized") {
      const warning = container.createDiv({ cls: "eudia-status-warning" });
      warning.innerHTML = `\u26A0\uFE0F <strong>${userEmail}</strong> is not authorized for calendar access. Contact your admin.`;
    }
  }
  async renderCalendarContent(container) {
    const contentArea = container.createDiv({ cls: "eudia-calendar-content" });
    const loadingEl = contentArea.createDiv({ cls: "eudia-calendar-loading" });
    loadingEl.innerHTML = '<div class="eudia-spinner"></div><span>Loading meetings...</span>';
    try {
      const calendarService = new CalendarService(
        this.plugin.settings.serverUrl,
        this.plugin.settings.userEmail
      );
      const weekData = await calendarService.getWeekMeetings();
      loadingEl.remove();
      if (!weekData.success) {
        this.renderError(contentArea, weekData.error || "Failed to load calendar");
        return;
      }
      const days = Object.keys(weekData.byDay || {}).sort();
      if (days.length === 0) {
        this.renderEmptyState(contentArea);
        return;
      }
      await this.renderCurrentMeeting(contentArea, calendarService);
      for (const day of days) {
        const meetings = weekData.byDay[day];
        if (!meetings || meetings.length === 0)
          continue;
        this.renderDaySection(contentArea, day, meetings);
      }
    } catch (error) {
      loadingEl.remove();
      this.renderError(contentArea, error.message || "Failed to load calendar");
    }
  }
  async renderCurrentMeeting(container, calendarService) {
    try {
      const current = await calendarService.getCurrentMeeting();
      if (current.meeting) {
        const nowCard = container.createDiv({ cls: "eudia-now-card" });
        if (current.isNow) {
          nowCard.createDiv({ cls: "eudia-now-badge", text: "\u25CF NOW" });
        } else {
          nowCard.createDiv({ cls: "eudia-now-badge soon", text: `In ${current.minutesUntilStart}m` });
        }
        const nowContent = nowCard.createDiv({ cls: "eudia-now-content" });
        nowContent.createEl("div", { cls: "eudia-now-subject", text: current.meeting.subject });
        if (current.meeting.accountName) {
          nowContent.createEl("div", { cls: "eudia-now-account", text: current.meeting.accountName });
        }
        const nowAction = nowCard.createEl("button", { cls: "eudia-now-action", text: "\u{1F4DD} Create Note" });
        nowAction.onclick = () => this.createNoteForMeeting(current.meeting);
      }
    } catch (e) {
    }
  }
  renderDaySection(container, day, meetings) {
    const section = container.createDiv({ cls: "eudia-calendar-day" });
    section.createEl("div", {
      cls: "eudia-calendar-day-header",
      text: CalendarService.getDayName(day)
    });
    for (const meeting of meetings) {
      const meetingEl = section.createDiv({
        cls: `eudia-calendar-meeting ${meeting.isCustomerMeeting ? "customer" : "internal"}`
      });
      meetingEl.createEl("div", {
        cls: "eudia-calendar-time",
        text: CalendarService.formatTime(meeting.start)
      });
      const details = meetingEl.createDiv({ cls: "eudia-calendar-details" });
      details.createEl("div", { cls: "eudia-calendar-subject", text: meeting.subject });
      if (meeting.accountName) {
        details.createEl("div", { cls: "eudia-calendar-account", text: meeting.accountName });
      } else if (meeting.attendees && meeting.attendees.length > 0) {
        const attendeeNames = meeting.attendees.slice(0, 2).map((a) => a.name || a.email?.split("@")[0] || "Unknown").join(", ");
        details.createEl("div", { cls: "eudia-calendar-attendees", text: attendeeNames });
      }
      meetingEl.onclick = () => this.createNoteForMeeting(meeting);
      meetingEl.title = "Click to create meeting note";
    }
  }
  renderEmptyState(container) {
    const empty = container.createDiv({ cls: "eudia-calendar-empty" });
    empty.innerHTML = `
      <div class="eudia-empty-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <p class="eudia-empty-title">No meetings this week</p>
      <p class="eudia-empty-subtitle">Enjoy your focus time!</p>
    `;
  }
  renderError(container, message) {
    const error = container.createDiv({ cls: "eudia-calendar-error" });
    let icon = "\u26A0\uFE0F";
    let title = "Unable to load calendar";
    let action = "";
    if (message.includes("not authorized") || message.includes("403")) {
      icon = "\u{1F512}";
      title = "Calendar Access Required";
      action = "Contact your admin to be added to the authorized users list.";
    } else if (message.includes("network") || message.includes("fetch")) {
      icon = "\u{1F4E1}";
      title = "Connection Issue";
      action = "Check your internet connection and try again.";
    } else if (message.includes("server") || message.includes("500")) {
      icon = "\u{1F527}";
      title = "Server Unavailable";
      action = "The server may be waking up. Try again in 30 seconds.";
    }
    error.innerHTML = `
      <div class="eudia-error-icon">${icon}</div>
      <p class="eudia-error-title">${title}</p>
      <p class="eudia-error-message">${message}</p>
      ${action ? `<p class="eudia-error-action">${action}</p>` : ""}
    `;
    const retryBtn = error.createEl("button", { cls: "eudia-btn-retry", text: "Try Again" });
    retryBtn.onclick = () => this.render();
  }
  renderSetupPanel(container) {
    const setup = container.createDiv({ cls: "eudia-calendar-setup-panel" });
    setup.innerHTML = `
      <div class="eudia-setup-icon" style="font-size: 48px; opacity: 0.5;">&#128197;</div>
      <h3 class="eudia-setup-title">Connect Your Calendar</h3>
      <p class="eudia-setup-desc">Enter your Eudia email to see your meetings and create notes with one click.</p>
    `;
    const inputGroup = setup.createDiv({ cls: "eudia-setup-input-group" });
    const emailInput = inputGroup.createEl("input", {
      type: "email",
      placeholder: "yourname@eudia.com"
    });
    emailInput.addClass("eudia-setup-email");
    const connectBtn = inputGroup.createEl("button", { cls: "eudia-setup-connect", text: "Connect" });
    const statusEl = setup.createDiv({ cls: "eudia-setup-status" });
    connectBtn.onclick = async () => {
      const email = emailInput.value.trim().toLowerCase();
      if (!email || !email.endsWith("@eudia.com")) {
        statusEl.textContent = "\u26A0\uFE0F Please use your @eudia.com email";
        statusEl.className = "eudia-setup-status error";
        return;
      }
      connectBtn.disabled = true;
      connectBtn.textContent = "Connecting...";
      statusEl.textContent = "";
      try {
        const response = await (0, import_obsidian3.requestUrl)({
          url: `${this.plugin.settings.serverUrl}/api/calendar/validate/${email}`,
          method: "GET"
        });
        if (!response.json?.authorized) {
          statusEl.innerHTML = `\u26A0\uFE0F <strong>${email}</strong> is not authorized.<br>Contact your admin to be added.`;
          statusEl.className = "eudia-setup-status error";
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect";
          return;
        }
        this.plugin.settings.userEmail = email;
        this.plugin.settings.calendarConfigured = true;
        await this.plugin.saveSettings();
        statusEl.textContent = "\u2713 Connected!";
        statusEl.className = "eudia-setup-status success";
        this.plugin.syncAccounts(true).catch(() => {
        });
        setTimeout(() => this.render(), 500);
      } catch (error) {
        const msg = error.message || "Connection failed";
        if (msg.includes("403")) {
          statusEl.innerHTML = `\u26A0\uFE0F <strong>${email}</strong> is not authorized for calendar access.`;
        } else {
          statusEl.textContent = "\u26A0\uFE0F " + msg;
        }
        statusEl.className = "eudia-setup-status error";
        connectBtn.disabled = false;
        connectBtn.textContent = "Connect";
      }
    };
    emailInput.onkeydown = (e) => {
      if (e.key === "Enter")
        connectBtn.click();
    };
    setup.createEl("p", {
      cls: "eudia-setup-help",
      text: "Your calendar syncs automatically via Microsoft 365."
    });
  }
  async createNoteForMeeting(meeting) {
    const dateStr = meeting.start.split("T")[0];
    let folderPath = this.plugin.settings.accountsFolder;
    if (meeting.accountName) {
      const sanitizedName = meeting.accountName.replace(/[<>:"/\\|?*]/g, "_").trim();
      const accountFolder = `${this.plugin.settings.accountsFolder}/${sanitizedName}`;
      const folder = this.app.vault.getAbstractFileByPath(accountFolder);
      if (folder instanceof import_obsidian3.TFolder) {
        folderPath = accountFolder;
      }
    }
    const sanitizedSubject = meeting.subject.replace(/[<>:"/\\|?*]/g, "_").trim().substring(0, 50);
    const fileName = `${dateStr} ${sanitizedSubject}.md`;
    const filePath = `${folderPath}/${fileName}`;
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof import_obsidian3.TFile) {
      await this.app.workspace.getLeaf().openFile(existing);
      return;
    }
    const attendees = (meeting.attendees || []).map((a) => a.name || a.email?.split("@")[0] || "Unknown").slice(0, 5).join(", ");
    const template = `---
title: "${meeting.subject}"
date: ${dateStr}
attendees: [${attendees}]
account: "${meeting.accountName || ""}"
meeting_start: ${meeting.start}
meeting_type: discovery
sync_to_salesforce: false
transcribed: false
---

# ${meeting.subject}

## Pre-Call Notes

*Add any prep notes, context, or questions before the meeting*



---

## Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` \u2192 **"Transcribe Meeting"**

---

`;
    const file = await this.app.vault.create(filePath, template);
    await this.app.workspace.getLeaf().openFile(file);
    new import_obsidian3.Notice(`Created note for: ${meeting.subject}`);
  }
};
var EudiaSyncPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.audioRecorder = null;
    this.recordingStatusBar = null;
  }
  async onload() {
    await this.loadSettings();
    this.transcriptionService = new TranscriptionService(
      this.settings.serverUrl,
      this.settings.openaiApiKey
    );
    this.calendarService = new CalendarService(
      this.settings.serverUrl,
      this.settings.userEmail
    );
    this.smartTagService = new SmartTagService();
    this.registerView(
      CALENDAR_VIEW_TYPE,
      (leaf) => new EudiaCalendarView(leaf, this)
    );
    this.addRibbonIcon("calendar", "Open Calendar", () => this.activateCalendarView());
    this.addRibbonIcon("microphone", "Transcribe Meeting", async () => {
      if (this.audioRecorder?.isRecording()) {
        await this.stopRecording();
      } else {
        await this.startRecording();
      }
    });
    this.addCommand({
      id: "transcribe-meeting",
      name: "Transcribe Meeting",
      callback: async () => {
        if (this.audioRecorder?.isRecording()) {
          await this.stopRecording();
        } else {
          await this.startRecording();
        }
      }
    });
    this.addCommand({
      id: "open-calendar",
      name: "Open Calendar",
      callback: () => this.activateCalendarView()
    });
    this.addCommand({
      id: "sync-accounts",
      name: "Sync Salesforce Accounts",
      callback: () => this.syncAccounts()
    });
    this.addCommand({
      id: "sync-note",
      name: "Sync Note to Salesforce",
      callback: () => this.syncNoteToSalesforce()
    });
    this.addCommand({
      id: "new-meeting-note",
      name: "New Meeting Note",
      callback: () => this.createMeetingNote()
    });
    this.addSettingTab(new EudiaSyncSettingTab(this.app, this));
    this.registerEditorSuggest(new AccountSuggester(this.app, this));
    this.app.workspace.onLayoutReady(async () => {
      if (!this.settings.setupCompleted && !this.settings.userEmail) {
        new SetupWizardModal(this.app, this).open();
      } else if (this.settings.syncOnStartup) {
        await this.syncAccounts(true);
      }
      if (this.settings.showCalendarView && this.settings.userEmail) {
        this.activateCalendarView();
      }
    });
  }
  async onunload() {
    this.app.workspace.detachLeavesOfType(CALENDAR_VIEW_TYPE);
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async activateCalendarView() {
    const workspace = this.app.workspace;
    const leaves = workspace.getLeavesOfType(CALENDAR_VIEW_TYPE);
    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
    } else {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: CALENDAR_VIEW_TYPE, active: true });
        workspace.revealLeaf(rightLeaf);
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────
  // RECORDING METHODS
  // ─────────────────────────────────────────────────────────────────────────
  async startRecording() {
    if (!AudioRecorder.isSupported()) {
      new import_obsidian3.Notice("Audio transcription is not supported in this browser");
      return;
    }
    let activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      await this.createMeetingNote();
      activeFile = this.app.workspace.getActiveFile();
    }
    if (!activeFile) {
      new import_obsidian3.Notice("Please open or create a note first");
      return;
    }
    this.audioRecorder = new AudioRecorder();
    this.recordingStatusBar = new RecordingStatusBar(
      () => this.audioRecorder?.pause(),
      () => this.audioRecorder?.resume(),
      () => this.stopRecording(),
      () => this.cancelRecording()
    );
    try {
      await this.audioRecorder.start();
      this.recordingStatusBar.show();
      const updateInterval = setInterval(() => {
        if (this.audioRecorder?.isRecording()) {
          const state = this.audioRecorder.getState();
          this.recordingStatusBar?.updateState(state);
        } else {
          clearInterval(updateInterval);
        }
      }, 100);
      new import_obsidian3.Notice("Transcription started. Click stop when finished.");
    } catch (error) {
      new import_obsidian3.Notice(`Failed to start transcription: ${error.message}`);
      this.recordingStatusBar?.hide();
      this.recordingStatusBar = null;
    }
  }
  async stopRecording() {
    if (!this.audioRecorder?.isRecording())
      return;
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new import_obsidian3.Notice("No active file to save transcription");
      this.cancelRecording();
      return;
    }
    this.recordingStatusBar?.showProcessing();
    try {
      const result = await this.audioRecorder.stop();
      await this.processRecording(result, activeFile);
    } catch (error) {
      new import_obsidian3.Notice(`Transcription failed: ${error.message}`);
    } finally {
      this.recordingStatusBar?.hide();
      this.recordingStatusBar = null;
      this.audioRecorder = null;
    }
  }
  async cancelRecording() {
    if (this.audioRecorder?.isRecording()) {
      this.audioRecorder.cancel();
    }
    this.recordingStatusBar?.hide();
    this.recordingStatusBar = null;
    this.audioRecorder = null;
    new import_obsidian3.Notice("Transcription cancelled");
  }
  async processRecording(result, file) {
    const modal = new ProcessingModal(this.app);
    modal.open();
    try {
      let accountContext;
      const pathParts = file.path.split("/");
      if (pathParts.length >= 2 && pathParts[0] === this.settings.accountsFolder) {
        const accountName = pathParts[1];
        const account = this.settings.cachedAccounts.find(
          (a) => a.name.toLowerCase() === accountName.toLowerCase()
        );
        if (account) {
          accountContext = { accountName: account.name, accountId: account.id };
        }
      }
      modal.setMessage("Transcribing audio...");
      const transcription = await this.transcriptionService.transcribeAudio(result.blob, accountContext);
      modal.setMessage("Generating summary...");
      const sections = await this.transcriptionService.processTranscription(
        transcription.text,
        accountContext
      );
      const noteContent = this.buildNoteContent(sections, transcription);
      await this.app.vault.modify(file, noteContent);
      const countItems = (val) => {
        if (!val)
          return 0;
        if (Array.isArray(val))
          return val.length;
        if (typeof val === "string")
          return val.split("\n").filter((l) => l.trim()).length;
        return 0;
      };
      this.recordingStatusBar?.showComplete({
        duration: result.duration,
        confidence: transcription.confidence,
        meddiccCount: countItems(sections.meddiccSignals),
        nextStepsCount: countItems(sections.nextSteps)
      });
      modal.close();
      new import_obsidian3.Notice("Transcription complete!");
      if (this.settings.autoSyncAfterTranscription) {
        await this.syncNoteToSalesforce();
      }
    } catch (error) {
      modal.close();
      throw error;
    }
  }
  buildNoteContent(sections, transcription) {
    const ensureString = (val) => {
      if (val === null || val === void 0)
        return "";
      if (Array.isArray(val)) {
        return val.map((item) => {
          if (typeof item === "object") {
            if (item.category)
              return `**${item.category}**: ${item.signal || item.insight || ""}`;
            return JSON.stringify(item);
          }
          return String(item);
        }).join("\n");
      }
      if (typeof val === "object")
        return JSON.stringify(val);
      return String(val);
    };
    const title = ensureString(sections.title) || "Meeting Notes";
    const summary = ensureString(sections.summary);
    const painPoints = ensureString(sections.painPoints);
    const productInterest = ensureString(sections.productInterest);
    const meddiccSignals = ensureString(sections.meddiccSignals);
    const nextSteps = ensureString(sections.nextSteps);
    const actionItems = ensureString(sections.actionItems);
    const keyDates = ensureString(sections.keyDates);
    const risksObjections = ensureString(sections.risksObjections);
    const attendees = ensureString(sections.attendees);
    let content = `---
title: "${title}"
date: ${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}
transcribed: true
sync_to_salesforce: false
clo_meeting: false
source: ""
confidence: ${transcription.confidence}
---

# ${title}

## Summary

${summary || "*AI summary will appear here*"}

`;
    if (painPoints && !painPoints.includes("None explicitly")) {
      content += `## Pain Points

${painPoints}

`;
    }
    if (productInterest && !productInterest.includes("None identified")) {
      content += `## Product Interest

${productInterest}

`;
    }
    if (meddiccSignals) {
      content += `## MEDDICC Signals

${meddiccSignals}

`;
    }
    if (nextSteps) {
      content += `## Next Steps

${nextSteps}

`;
    }
    if (actionItems) {
      content += `## Action Items

${actionItems}

`;
    }
    if (keyDates && !keyDates.includes("No specific dates")) {
      content += `## Key Dates

${keyDates}

`;
    }
    if (risksObjections && !risksObjections.includes("None raised")) {
      content += `## Risks and Objections

${risksObjections}

`;
    }
    if (attendees) {
      content += `## Attendees

${attendees}

`;
    }
    if (this.settings.appendTranscript && transcription.text) {
      content += `---

## Full Transcript

${transcription.text}
`;
    }
    return content;
  }
  // ─────────────────────────────────────────────────────────────────────────
  // ACCOUNT SYNC METHODS
  // ─────────────────────────────────────────────────────────────────────────
  async syncAccounts(silent = false) {
    if (!silent)
      new import_obsidian3.Notice("Syncing Salesforce accounts...");
    try {
      const response = await (0, import_obsidian3.requestUrl)({
        url: `${this.settings.serverUrl}/api/accounts/obsidian`,
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      const data = response.json;
      if (!data.success || !data.accounts) {
        if (!silent)
          new import_obsidian3.Notice("Failed to fetch accounts from server");
        return;
      }
      this.settings.cachedAccounts = data.accounts.map((a) => ({
        id: a.id,
        name: a.name
      }));
      this.settings.lastSyncTime = (/* @__PURE__ */ new Date()).toISOString();
      await this.saveSettings();
      if (!silent) {
        new import_obsidian3.Notice(`Synced ${data.accounts.length} accounts for matching`);
      }
    } catch (error) {
      if (!silent) {
        new import_obsidian3.Notice(`Failed to sync accounts: ${error.message}`);
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────
  // SALESFORCE NOTE SYNC
  // ─────────────────────────────────────────────────────────────────────────
  async syncNoteToSalesforce() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new import_obsidian3.Notice("No active file to sync");
      return;
    }
    const content = await this.app.vault.read(activeFile);
    const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
    if (!frontmatter?.sync_to_salesforce) {
      new import_obsidian3.Notice("Set sync_to_salesforce: true in frontmatter to enable sync");
      return;
    }
    let accountId = frontmatter.account_id;
    let accountName = frontmatter.account;
    if (!accountId && accountName) {
      const account = this.settings.cachedAccounts.find(
        (a) => a.name.toLowerCase() === accountName.toLowerCase()
      );
      if (account) {
        accountId = account.id;
      }
    }
    if (!accountId) {
      const pathParts = activeFile.path.split("/");
      if (pathParts.length >= 2 && pathParts[0] === this.settings.accountsFolder) {
        const folderName = pathParts[1];
        const account = this.settings.cachedAccounts.find(
          (a) => a.name.replace(/[<>:"/\\|?*]/g, "_").trim() === folderName
        );
        if (account) {
          accountId = account.id;
          accountName = account.name;
        }
      }
    }
    if (!accountId) {
      new import_obsidian3.Notice("Could not determine account for this note");
      return;
    }
    try {
      new import_obsidian3.Notice("Syncing to Salesforce...");
      const response = await (0, import_obsidian3.requestUrl)({
        url: `${this.settings.serverUrl}/api/notes/sync`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          accountName,
          noteTitle: activeFile.basename,
          notePath: activeFile.path,
          content,
          frontmatter,
          syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
          userEmail: this.settings.userEmail
        })
      });
      if (response.json?.success) {
        new import_obsidian3.Notice("\u2713 Synced to Salesforce");
      } else {
        new import_obsidian3.Notice("Failed to sync: " + (response.json?.error || "Unknown error"));
      }
    } catch (error) {
      new import_obsidian3.Notice(`Sync failed: ${error.message}`);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────
  // MEETING NOTE CREATION
  // ─────────────────────────────────────────────────────────────────────────
  async createMeetingNote() {
    return new Promise((resolve) => {
      const modal = new AccountSelectorModal(this.app, this, async (account) => {
        if (!account) {
          resolve();
          return;
        }
        const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        const sanitizedName = account.name.replace(/[<>:"/\\|?*]/g, "_").trim();
        const folderPath = `${this.settings.accountsFolder}/${sanitizedName}`;
        const fileName = `${dateStr} Meeting.md`;
        const filePath = `${folderPath}/${fileName}`;
        if (!this.app.vault.getAbstractFileByPath(folderPath)) {
          await this.app.vault.createFolder(folderPath);
        }
        const template = `---
title: "Meeting with ${account.name}"
date: ${dateStr}
account: "${account.name}"
account_id: "${account.id}"
meeting_type: discovery
sync_to_salesforce: false
transcribed: false
---

# Meeting with ${account.name}

## Pre-Call Notes

*Add context or questions here*



---

## Ready to Transcribe

Click the microphone icon or \`Cmd/Ctrl+P\` \u2192 "Transcribe Meeting"

---

`;
        const file = await this.app.vault.create(filePath, template);
        await this.app.workspace.getLeaf().openFile(file);
        new import_obsidian3.Notice(`Created meeting note for ${account.name}`);
        resolve();
      });
      modal.open();
    });
  }
  async fetchAndInsertContext() {
    new import_obsidian3.Notice("Fetching pre-call context...");
  }
};
var EudiaSyncSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Eudia Sync & Scribe" });
    containerEl.createEl("h3", { text: "Your Profile" });
    new import_obsidian3.Setting(containerEl).setName("Eudia Email").setDesc("Your @eudia.com email address for calendar and Salesforce sync").addText((text) => text.setPlaceholder("yourname@eudia.com").setValue(this.plugin.settings.userEmail).onChange(async (value) => {
      this.plugin.settings.userEmail = value.trim().toLowerCase();
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h3", { text: "Salesforce Connection" });
    const sfContainer = containerEl.createDiv();
    sfContainer.style.cssText = "padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px;";
    const sfStatus = sfContainer.createDiv();
    sfStatus.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 12px;";
    const statusDot = sfStatus.createSpan();
    const statusText = sfStatus.createSpan();
    const sfDesc = sfContainer.createDiv();
    sfDesc.style.cssText = "font-size: 12px; color: var(--text-muted); margin-bottom: 16px;";
    sfDesc.setText("Connect with Salesforce to sync notes with your user attribution.");
    const sfButton = sfContainer.createEl("button");
    sfButton.style.cssText = "padding: 10px 20px; cursor: pointer; border-radius: 6px;";
    let pollInterval = null;
    const checkStatus = async () => {
      if (!this.plugin.settings.userEmail) {
        statusDot.style.cssText = "width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted);";
        statusText.setText("Enter email first");
        sfButton.setText("Setup Required");
        sfButton.disabled = true;
        return false;
      }
      try {
        const response = await (0, import_obsidian3.requestUrl)({
          url: `${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,
          method: "GET",
          throw: false
        });
        if (response.json?.authenticated === true) {
          statusDot.style.cssText = "width: 8px; height: 8px; border-radius: 50%; background: #22c55e;";
          statusText.setText("Connected to Salesforce");
          sfButton.setText("Reconnect");
          sfButton.disabled = false;
          return true;
        } else {
          statusDot.style.cssText = "width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;";
          statusText.setText("Not connected");
          sfButton.setText("Connect to Salesforce");
          sfButton.disabled = false;
          return false;
        }
      } catch {
        statusDot.style.cssText = "width: 8px; height: 8px; border-radius: 50%; background: #ef4444;";
        statusText.setText("Status unavailable");
        sfButton.setText("Connect to Salesforce");
        sfButton.disabled = false;
        return false;
      }
    };
    const startPolling = () => {
      if (pollInterval) {
        window.clearInterval(pollInterval);
      }
      let attempts = 0;
      const maxAttempts = 30;
      pollInterval = window.setInterval(async () => {
        attempts++;
        const isConnected = await checkStatus();
        if (isConnected) {
          if (pollInterval) {
            window.clearInterval(pollInterval);
            pollInterval = null;
          }
          new import_obsidian3.Notice("Salesforce connected successfully!");
        } else if (attempts >= maxAttempts) {
          if (pollInterval) {
            window.clearInterval(pollInterval);
            pollInterval = null;
          }
        }
      }, 5e3);
    };
    sfButton.onclick = async () => {
      if (!this.plugin.settings.userEmail) {
        new import_obsidian3.Notice("Please enter your email first");
        return;
      }
      const authUrl = `${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;
      window.open(authUrl, "_blank");
      new import_obsidian3.Notice("Complete the Salesforce login in the popup window", 5e3);
      startPolling();
    };
    checkStatus();
    containerEl.createEl("h3", { text: "Server" });
    new import_obsidian3.Setting(containerEl).setName("GTM Brain Server").setDesc("Server URL for calendar, accounts, and sync").addText((text) => text.setValue(this.plugin.settings.serverUrl).onChange(async (value) => {
      this.plugin.settings.serverUrl = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("OpenAI API Key").setDesc("For transcription (optional if server provides)").addText((text) => {
      text.setPlaceholder("sk-...").setValue(this.plugin.settings.openaiApiKey).onChange(async (value) => {
        this.plugin.settings.openaiApiKey = value;
        await this.plugin.saveSettings();
      });
      text.inputEl.type = "password";
    });
    containerEl.createEl("h3", { text: "Transcription" });
    new import_obsidian3.Setting(containerEl).setName("Save Audio Files").setDesc("Keep original audio recordings").addToggle((toggle) => toggle.setValue(this.plugin.settings.saveAudioFiles).onChange(async (value) => {
      this.plugin.settings.saveAudioFiles = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("Append Full Transcript").setDesc("Include complete transcript in notes").addToggle((toggle) => toggle.setValue(this.plugin.settings.appendTranscript).onChange(async (value) => {
      this.plugin.settings.appendTranscript = value;
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h3", { text: "Sync" });
    new import_obsidian3.Setting(containerEl).setName("Sync on Startup").setDesc("Automatically sync accounts when Obsidian opens").addToggle((toggle) => toggle.setValue(this.plugin.settings.syncOnStartup).onChange(async (value) => {
      this.plugin.settings.syncOnStartup = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("Auto-Sync After Transcription").setDesc("Push notes to Salesforce after transcription").addToggle((toggle) => toggle.setValue(this.plugin.settings.autoSyncAfterTranscription).onChange(async (value) => {
      this.plugin.settings.autoSyncAfterTranscription = value;
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h3", { text: "Folders" });
    new import_obsidian3.Setting(containerEl).setName("Accounts Folder").setDesc("Where account folders are stored").addText((text) => text.setValue(this.plugin.settings.accountsFolder).onChange(async (value) => {
      this.plugin.settings.accountsFolder = value || "Accounts";
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("Recordings Folder").setDesc("Where audio files are saved").addText((text) => text.setValue(this.plugin.settings.recordingsFolder).onChange(async (value) => {
      this.plugin.settings.recordingsFolder = value || "Recordings";
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h3", { text: "Actions" });
    new import_obsidian3.Setting(containerEl).setName("Sync Accounts Now").setDesc(`${this.plugin.settings.cachedAccounts.length} accounts cached`).addButton((button) => button.setButtonText("Sync").setCta().onClick(async () => {
      await this.plugin.syncAccounts();
      this.display();
    }));
    if (this.plugin.settings.lastSyncTime) {
      containerEl.createEl("p", {
        text: `Last synced: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()}`,
        cls: "setting-item-description"
      });
    }
    containerEl.createEl("p", {
      text: `Audio transcription: ${AudioRecorder.isSupported() ? "\u2713 Supported" : "\u2717 Not supported"}`,
      cls: "setting-item-description"
    });
  }
};

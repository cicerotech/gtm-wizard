var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => EudiaSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/AudioRecorder.ts
var AudioRecorder = class _AudioRecorder {
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
    // Live query support - track chunks already extracted
    this.lastExtractedChunkIndex = 0;
    this.mimeTypeCache = "audio/webm";
    this.state = {
      isRecording: false,
      isPaused: false,
      duration: 0,
      audioLevel: 0
    };
    this.stateCallback = null;
    // ═══════════════════════════════════════════════════════════════════════════
    // AUDIO DIAGNOSTICS - Detect silent/low audio before transcription
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Track audio levels during recording for post-recording diagnostics.
     * This is tracked automatically during recording via startLevelTracking().
     */
    this.levelHistory = [];
    this.trackingLevels = false;
  }
  /**
   * Set callback for state updates (duration, audio levels, etc.)
   */
  onStateChange(callback) {
    this.stateCallback = callback;
  }
  /**
   * Detect if running on iOS/Safari
   */
  static isIOSOrSafari() {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    return isIOS || isSafari;
  }
  /**
   * Get supported MIME type for recording
   * iOS/Safari has limited MediaRecorder support - prioritize mp4/m4a formats
   */
  getSupportedMimeType() {
    const isIOSSafari = _AudioRecorder.isIOSOrSafari();
    const types = isIOSSafari ? [
      "audio/mp4",
      // iOS Safari primary
      "audio/mp4;codecs=aac",
      "audio/aac",
      "audio/webm;codecs=opus",
      "audio/webm"
    ] : [
      "audio/webm;codecs=opus",
      // Desktop/Chrome primary
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg"
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log(`[AudioRecorder] Using MIME type: ${type} (iOS/Safari: ${isIOSSafari})`);
        return type;
      }
    }
    return isIOSSafari ? "audio/mp4" : "audio/webm";
  }
  /**
   * Request microphone access and start recording
   */
  async startRecording() {
    if (this.state.isRecording) {
      throw new Error("Already recording");
    }
    try {
      const isIOSSafari = _AudioRecorder.isIOSOrSafari();
      const audioConstraints = isIOSSafari ? {
        echoCancellation: true,
        noiseSuppression: true
        // iOS doesn't support sampleRate/channelCount constraints well
      } : {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48e3,
        // Higher sample rate for clarity
        channelCount: 1
        // Mono is optimal for speech
      };
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });
      console.log(`[AudioRecorder] Microphone access granted (iOS/Safari: ${isIOSSafari})`);
      this.setupAudioAnalysis();
      const mimeType = this.getSupportedMimeType();
      this.mimeTypeCache = mimeType;
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 96e3
      });
      this.audioChunks = [];
      this.lastExtractedChunkIndex = 0;
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
          console.log(`[AudioRecorder] Chunks collected: ${this.audioChunks.length}`);
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          console.log(`[AudioRecorder] Blob size: ${audioBlob.size} bytes`);
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
      if (this.mediaRecorder.state === "recording") {
        this.mediaRecorder.requestData();
      }
      setTimeout(() => {
        if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
          this.mediaRecorder.stop();
        }
      }, 100);
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
   * Includes mobile/iOS compatibility checks
   */
  static isSupported() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      return false;
    }
    const formats = ["audio/webm", "audio/mp4", "audio/ogg", "audio/webm;codecs=opus"];
    const hasSupport = formats.some((format) => MediaRecorder.isTypeSupported(format));
    if (!hasSupport) {
      console.warn("[AudioRecorder] No supported audio formats found");
    }
    return hasSupport;
  }
  /**
   * Get mobile-specific recording instructions
   */
  static getMobileInstructions() {
    if (!this.isIOSOrSafari()) {
      return null;
    }
    return "For best results on iOS, ensure you have granted microphone permissions in Settings > Privacy > Microphone.";
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
  /**
   * Extract new audio chunks since last extraction (for live transcription).
   * Returns null if no new chunks available.
   * Does NOT stop recording - continues capturing.
   */
  extractNewChunks() {
    if (!this.state.isRecording || this.audioChunks.length === 0) {
      return null;
    }
    const newChunks = this.audioChunks.slice(this.lastExtractedChunkIndex);
    if (newChunks.length === 0) {
      return null;
    }
    this.lastExtractedChunkIndex = this.audioChunks.length;
    return new Blob(newChunks, { type: this.mimeTypeCache });
  }
  /**
   * Get all audio captured so far (without stopping recording).
   * Useful for full transcript query during recording.
   */
  getAllChunksAsBlob() {
    if (this.audioChunks.length === 0) {
      return null;
    }
    return new Blob(this.audioChunks, { type: this.mimeTypeCache });
  }
  /**
   * Get current recording duration in seconds
   */
  getDuration() {
    return this.state.duration;
  }
  /**
   * Get the MIME type being used for recording
   */
  getMimeType() {
    return this.mimeTypeCache;
  }
  /**
   * Start tracking audio levels for diagnostics
   * (Called automatically during recording)
   */
  startLevelHistoryTracking() {
    this.levelHistory = [];
    this.trackingLevels = true;
  }
  /**
   * Add current level to history
   * (Called during level tracking interval)
   */
  recordLevelSample() {
    if (this.trackingLevels) {
      this.levelHistory.push(this.state.audioLevel);
    }
  }
  /**
   * Get audio diagnostic after recording completes.
   * Call this after stopRecording() to check for potential issues.
   */
  getAudioDiagnostic() {
    if (this.levelHistory.length === 0) {
      return {
        hasAudio: true,
        // Assume true if we can't check
        averageLevel: 0,
        peakLevel: 0,
        silentPercent: 100,
        warning: "Unable to analyze audio levels - recording may be too short"
      };
    }
    const average = this.levelHistory.reduce((a, b) => a + b, 0) / this.levelHistory.length;
    const peak = Math.max(...this.levelHistory);
    const silentSamples = this.levelHistory.filter((l) => l < 5).length;
    const silentPercent = Math.round(silentSamples / this.levelHistory.length * 100);
    let warning = null;
    if (peak < 5) {
      warning = "SILENT AUDIO: No audio was detected during recording. Check your microphone settings and ensure Obsidian has microphone permission.";
    } else if (average < 10 && silentPercent > 80) {
      warning = "VERY LOW AUDIO: Audio levels were extremely low. The transcription may not be accurate. Check your microphone or move closer to it.";
    } else if (silentPercent > 90) {
      warning = "MOSTLY SILENT: Over 90% of the recording had no audio. Make sure you're capturing the meeting audio, not just silence.";
    }
    return {
      hasAudio: peak >= 5,
      averageLevel: Math.round(average),
      peakLevel: peak,
      silentPercent,
      warning
    };
  }
  /**
   * Analyze an audio blob for audio presence.
   * This is a more thorough check that analyzes the actual audio data.
   * Returns a diagnostic result.
   */
  static async analyzeAudioBlob(blob) {
    try {
      const audioContext = new AudioContext();
      const arrayBuffer = await blob.arrayBuffer();
      let audioBuffer;
      try {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      } catch (decodeError) {
        await audioContext.close();
        return {
          hasAudio: true,
          // Assume true - let the server handle it
          averageLevel: 0,
          peakLevel: 0,
          silentPercent: 0,
          warning: "Could not analyze audio format. Proceeding with transcription."
        };
      }
      const channelData = audioBuffer.getChannelData(0);
      let sum = 0;
      let peak = 0;
      let silentSamples = 0;
      const sampleThreshold = 0.01;
      const sampleStep = 100;
      let samplesChecked = 0;
      for (let i = 0; i < channelData.length; i += sampleStep) {
        const sample = Math.abs(channelData[i]);
        sum += sample;
        if (sample > peak)
          peak = sample;
        if (sample < sampleThreshold)
          silentSamples++;
        samplesChecked++;
      }
      await audioContext.close();
      const average = sum / samplesChecked;
      const silentPercent = Math.round(silentSamples / samplesChecked * 100);
      const averageLevel = Math.round(average * 100 * 10);
      const peakLevel = Math.round(peak * 100);
      let warning = null;
      if (peak < 0.01) {
        warning = 'SILENT AUDIO DETECTED: The recording appears to contain only silence. This typically causes Whisper to hallucinate random text like "Yes. Yes. Yes." Check your audio input source.';
      } else if (average < 5e-3 && silentPercent > 95) {
        warning = "NEAR-SILENT AUDIO: The recording is almost entirely silent. The transcription will likely be inaccurate.";
      } else if (silentPercent > 90) {
        warning = "MOSTLY SILENT: Over 90% of the recording is silent. Consider checking your audio setup.";
      }
      return {
        hasAudio: peak >= 0.01,
        averageLevel,
        peakLevel,
        silentPercent,
        warning
      };
    } catch (error) {
      console.error("Audio analysis failed:", error);
      return {
        hasAudio: true,
        // Assume true if we can't check
        averageLevel: 0,
        peakLevel: 0,
        silentPercent: 0,
        warning: null
      };
    }
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
var PIPELINE_MEETING_SIGNALS = [
  "pipeline review",
  "pipeline call",
  "weekly pipeline",
  "forecast call",
  "forecast review",
  "deal review",
  "opportunity review",
  "sales review",
  "pipeline sync",
  "forecast sync",
  "deal sync",
  "pipeline update",
  "forecast meeting"
];
function detectPipelineMeeting(title, attendees) {
  if (title) {
    const titleLower = title.toLowerCase();
    for (const signal of PIPELINE_MEETING_SIGNALS) {
      if (titleLower.includes(signal)) {
        return {
          isPipelineMeeting: true,
          confidence: 95,
          evidence: `Title contains "${signal}"`
        };
      }
    }
  }
  if (attendees && attendees.length >= 2) {
    const internalDomains = ["eudia.com", "johnsonhana.com"];
    const allInternal = attendees.every((email) => {
      const domain = email.toLowerCase().split("@")[1] || "";
      return internalDomains.some((d) => domain.includes(d));
    });
    if (allInternal && attendees.length >= 3) {
      if (title) {
        const titleLower = title.toLowerCase();
        const teamMeetingSignals = ["sync", "review", "update", "weekly", "team", "forecast"];
        const hasTeamSignal = teamMeetingSignals.some((s) => titleLower.includes(s));
        if (hasTeamSignal) {
          return {
            isPipelineMeeting: true,
            confidence: 70,
            evidence: `All internal attendees (${attendees.length}) with team meeting signal`
          };
        }
      }
      return {
        isPipelineMeeting: false,
        confidence: 40,
        evidence: `All internal attendees but no clear pipeline signal`
      };
    }
  }
  return {
    isPipelineMeeting: false,
    confidence: 0,
    evidence: "No pipeline meeting indicators found"
  };
}
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
function buildPipelineReviewPrompt(pipelineContext) {
  const contextBlock = pipelineContext ? `

SALESFORCE PIPELINE DATA (current as of today):
${pipelineContext}

Use this data to cross-reference and validate what was discussed. Include ACV and stage info from Salesforce where relevant.
` : "";
  return `You are a sales operations analyst producing the weekly pipeline review summary for Eudia, an AI-powered legal technology company. You are processing the transcript of an internal team pipeline review meeting.
${contextBlock}
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
OUTPUT FORMAT \u2014 Produce the following sections in EXACTLY this order:
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

## Priority Actions

List the most urgent, time-sensitive actions discussed. Group by the target month/date (e.g., "February Revenue"). Each line should follow this format:

**[Account Name]:** [One-line action description] [@Owner Name]

Only include actions where urgency was explicitly discussed. Order by most urgent first.

## Growth & Cross-Team Updates

Capture any non-deal-specific updates discussed \u2014 outbound motions, mid-market initiatives, product stability issues, demo environment, hiring, enablement, or other cross-functional topics. Use bullet points with brief summaries and owner attribution where mentioned.

If none were discussed, omit this section entirely.

## Business Lead Deal Context

For EACH Business Lead (BL) who presented or was discussed, create a line:

**[BL Full Name]** | Q1 Commit: $[amount if mentioned] | Gut: $[amount if mentioned]

If commit/gut amounts were not explicitly stated, write "Not discussed".

## Per-BL Account Details

For EACH Business Lead, create a subsection with a markdown table. Group accounts under the BL who owns them.

### [BL Full Name] [@tag]

| Account | Status | Next Action |
|---------|--------|-------------|
| [Account Name] | [1-2 sentence status from discussion] | [Specific next step with timeline if mentioned] |

Include EVERY account discussed for this BL, even briefly mentioned ones. If an account was only briefly mentioned with no substance, write "Brief mention" in Status.

After the table, if there are important details that don't fit the table format (e.g., long context about deal structure, stakeholder dynamics, or strategy), add them as bullet points beneath the table.

## Forecast & Timeline Changes

List any explicit changes to target close dates, forecast categories, or revenue timing:

- **[Account]**: [What changed \u2014 e.g., "Pushed from Feb to Mar due to MSA redline delays"]

If no forecast changes were discussed, omit this section.

## Team Action Items

Cross-functional or team-wide action items not tied to a specific account:

- [ ] [Action] \u2014 **Owner:** [Name] \u2014 **Due:** [Date if mentioned]

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
CRITICAL RULES:
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

1. Extract EVERY account mentioned, even briefly. Do not skip any.
2. Use exact names as spoken for both accounts and people.
3. Attribute each account to the BL who owns it / presented on it.
4. For the Priority Actions section, only include deals where time urgency was explicitly discussed (this month, this quarter, need to accelerate, etc.).
5. Capture action items with CLEAR ownership \u2014 who specifically is responsible.
6. Include direct quotes for significant commitments (e.g., "verbal commit in hand", "expects end of February").
7. If a BL stated their commit or gut amount, capture it exactly.
8. Keep table cells concise \u2014 status should be 1-2 sentences max, next action should be a single clear step.
9. Distinguish between different product lines or deal types when mentioned (e.g., "Marketing Compliance pilot", "M&A expansion", "FTE engagement").
10. If the meeting discussed general topics like demo stability, growth motion, enablement, or hiring \u2014 capture these in the Growth & Cross-Team section, not mixed into account tables.`;
}
var TranscriptionService = class {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
  }
  /**
   * Update server URL
   */
  setServerUrl(url) {
    this.serverUrl = url;
  }
  /**
   * Send audio for transcription and summarization
   * Tries server first, falls back to local OpenAI if server unavailable
   */
  async transcribeAndSummarize(audioBase64, mimeType, accountName, accountId, context) {
    try {
      const isPipelineReview = context?.meetingType === "pipeline_review";
      const systemPrompt = isPipelineReview ? buildPipelineReviewPrompt(context?.pipelineContext) : buildAnalysisPrompt(accountName, context);
      const response = await (0, import_obsidian.requestUrl)({
        url: `${this.serverUrl}/api/transcribe-and-summarize`,
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          audio: audioBase64,
          mimeType,
          accountName: isPipelineReview ? "Pipeline Review" : accountName,
          accountId,
          meetingType: context?.meetingType || "discovery",
          context: context ? {
            customerBrain: context.account?.customerBrain,
            opportunities: context.opportunities,
            contacts: context.contacts
          } : void 0,
          systemPrompt
        })
      });
      if (!response.json.success) {
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
      if (error.response) {
        console.error("Server response:", error.response);
      }
      let serverMessage = "";
      try {
        if (error.response?.json?.error) {
          serverMessage = error.response.json.error;
        } else if (typeof error.response === "string") {
          const parsed = JSON.parse(error.response);
          serverMessage = parsed.error || "";
        }
      } catch (e) {
      }
      let errorMessage = serverMessage || `Transcription failed: ${error.message}`;
      if (error.message?.includes("413")) {
        errorMessage = "Audio file too large for server. Try a shorter recording.";
      } else if (error.message?.includes("500")) {
        errorMessage = serverMessage || "Server error during transcription. Please try again.";
      } else if (error.message?.includes("Failed to fetch") || error.message?.includes("NetworkError")) {
        errorMessage = "Could not reach transcription server. Check your internet connection.";
      }
      console.error("Final error message:", errorMessage);
      return {
        success: false,
        transcript: "",
        sections: this.getEmptySections(),
        duration: 0,
        error: errorMessage
      };
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
   * Live query against accumulated transcript during a call.
   * Allows users to ask "What did Tom say about pricing?" mid-meeting.
   * 
   * @param question - User's question about the transcript
   * @param transcript - Accumulated transcript text so far
   * @param accountName - Optional account context
   * @returns Answer to the question
   */
  async liveQueryTranscript(question, transcript, accountName) {
    if (!transcript || transcript.trim().length < 50) {
      return {
        success: false,
        answer: "",
        error: "Not enough transcript captured yet. Keep recording for a few more minutes."
      };
    }
    try {
      const response = await (0, import_obsidian.requestUrl)({
        url: `${this.serverUrl}/api/live-query`,
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question,
          transcript,
          accountName,
          systemPrompt: this.buildLiveQueryPrompt()
        })
      });
      if (!response.json.success) {
        return {
          success: false,
          answer: "",
          error: response.json.error || "Query failed"
        };
      }
      return {
        success: true,
        answer: response.json.answer || "No relevant information found in the transcript."
      };
    } catch (error) {
      console.error("Live query error:", error);
      return {
        success: false,
        answer: "",
        error: error.message || "Failed to query transcript"
      };
    }
  }
  /**
   * Transcribe a chunk of audio without summarization (for incremental transcription).
   * Returns just the raw transcript text.
   */
  async transcribeChunk(audioBase64, mimeType) {
    try {
      const response = await (0, import_obsidian.requestUrl)({
        url: `${this.serverUrl}/api/transcribe-chunk`,
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          audio: audioBase64,
          mimeType
        })
      });
      if (!response.json.success) {
        return {
          success: false,
          text: "",
          error: response.json.error || "Chunk transcription failed"
        };
      }
      return {
        success: true,
        text: response.json.text || ""
      };
    } catch (error) {
      console.error("Chunk transcription error:", error);
      return {
        success: false,
        text: "",
        error: error.message || "Failed to transcribe chunk"
      };
    }
  }
  /**
   * Build prompt for live query against transcript
   */
  buildLiveQueryPrompt() {
    return `You are an AI assistant helping a salesperson during an active customer call. 
The user will ask questions about what has been discussed so far in the meeting.

Your job is to:
1. Search the transcript for relevant information
2. Answer the question concisely and accurately
3. Quote directly from the transcript when possible
4. If the information isn't in the transcript, say so clearly

IMPORTANT RULES:
- Only use information explicitly stated in the transcript
- Be concise - the user is on a live call
- If quoting someone, attribute the quote properly
- If the question can't be answered from the transcript, say "I couldn't find that in the conversation so far."

Format your response as a brief, actionable answer suitable for quick reference during a call.`;
  }
  /**
   * Format sections for note insertion
   * Optimized for busy salespeople: TL;DR first, evidence-based insights, actionable checklists
   * 
   * @param sections - Extracted sections from transcription
   * @param transcript - Raw transcript text
   * @param diarization - Optional diarization data with speaker attribution
   */
  static formatSectionsForNote(sections, transcript, diarization) {
    let content = "";
    if (sections.summary) {
      content += `## TL;DR

${sections.summary}

`;
    }
    if (diarization?.enabled && diarization?.talkTime) {
      content += `## Call Analytics

`;
      const repPct = diarization.talkTime.repPercent;
      const custPct = diarization.talkTime.customerPercent;
      const healthIcon = diarization.talkTime.isHealthyRatio ? "\u2705" : "\u26A0\uFE0F";
      content += `**Talk Time:** Rep ${repPct}% / Customer ${custPct}% ${healthIcon}
`;
      const repBars = Math.round(repPct / 5);
      const custBars = Math.round(custPct / 5);
      content += `\`${"\u2588".repeat(repBars)}${"\u2591".repeat(20 - repBars)}\` Rep
`;
      content += `\`${"\u2588".repeat(custBars)}${"\u2591".repeat(20 - custBars)}\` Customer

`;
      if (diarization.coaching) {
        const coaching = diarization.coaching;
        if (coaching.totalQuestions > 0) {
          const openPct = Math.round(coaching.openQuestions / coaching.totalQuestions * 100);
          content += `**Questions:** ${coaching.totalQuestions} total (${coaching.openQuestions} open, ${coaching.closedQuestions} closed - ${openPct}% open)
`;
        }
        if (coaching.objections && coaching.objections.length > 0) {
          const handled = coaching.objections.filter((o) => o.handled).length;
          content += `**Objections:** ${coaching.objections.length} raised, ${handled} handled
`;
        }
        if (coaching.valueScore !== void 0) {
          content += `**Value Articulation:** ${coaching.valueScore}/10
`;
        }
        if (coaching.nextStepClear !== void 0) {
          content += `**Next Step Clarity:** ${coaching.nextStepClear ? "\u2705 Clear" : "\u26A0\uFE0F Unclear"}
`;
        }
        content += "\n";
      }
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
    const transcriptToUse = diarization?.enabled && diarization?.formattedTranscript ? diarization.formattedTranscript : transcript;
    if (transcriptToUse) {
      const transcriptTitle = diarization?.enabled ? "Full Transcript (Speaker-Attributed)" : "Full Transcript";
      content += `---

<details>
<summary><strong>${transcriptTitle}</strong></summary>

${transcriptToUse}

</details>
`;
    }
    return content;
  }
  /**
   * Format sections for note with audio file reference
   */
  static formatSectionsWithAudio(sections, transcript, audioFilePath, diarization) {
    let content = this.formatSectionsForNote(sections, transcript, diarization);
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
   * Returns both transcript AND sections from server (not discarding sections!)
   */
  async transcribeAudio(audioBlob, context) {
    try {
      const base64 = await this.blobToBase64(audioBlob);
      const mimeType = audioBlob.type || "audio/webm";
      const meetingContext = context?.meetingType === "pipeline_review" ? { success: true, meetingType: "pipeline_review", pipelineContext: context.pipelineContext } : void 0;
      const result = await this.transcribeAndSummarize(
        base64,
        mimeType,
        context?.accountName,
        context?.accountId,
        meetingContext
      );
      return {
        text: result.transcript,
        confidence: result.success ? 0.95 : 0,
        duration: result.duration,
        sections: result.sections
        // Include server-generated sections!
      };
    } catch (error) {
      console.error("transcribeAudio error:", error);
      return {
        text: "",
        confidence: 0,
        duration: 0,
        sections: this.getEmptySections()
      };
    }
  }
  /**
   * Wrapper method for main.ts - processes transcription into sections
   * Routes through server to avoid requiring user API key
   */
  async processTranscription(transcriptText, context) {
    if (!transcriptText || transcriptText.trim().length === 0) {
      return this.getEmptySections();
    }
    try {
      const response = await (0, import_obsidian.requestUrl)({
        url: `${this.serverUrl}/api/process-sections`,
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          transcript: transcriptText,
          accountName: context?.accountName,
          context
        })
      });
      if (response.json?.success && response.json?.sections) {
        const sections = response.json.sections;
        return {
          summary: sections.summary || "",
          painPoints: sections.painPoints || sections.keyPoints || "",
          productInterest: sections.productInterest || "",
          meddiccSignals: sections.meddiccSignals || "",
          nextSteps: sections.nextSteps || "",
          actionItems: sections.actionItems || "",
          keyDates: sections.keyDates || "",
          buyingTriggers: sections.buyingTriggers || "",
          dealSignals: sections.dealSignals || "",
          risksObjections: sections.risksObjections || sections.concerns || "",
          competitiveIntel: sections.competitiveIntel || "",
          attendees: sections.attendees || "",
          transcript: transcriptText
        };
      }
      console.warn("Server process-sections returned no sections, using fallback");
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
      console.error("processTranscription server error:", error);
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
    }
  }
};

// src/CalendarService.ts
var import_obsidian2 = require("obsidian");
var CalendarService = class _CalendarService {
  constructor(serverUrl, userEmail, timezone = "America/New_York") {
    this.serverUrl = serverUrl;
    this.userEmail = userEmail.toLowerCase();
    this.timezone = timezone;
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
   * Update timezone
   */
  setTimezone(timezone) {
    this.timezone = timezone;
  }
  /**
   * Fetch today's meetings
   * @param forceRefresh - If true, forces server to sync fresh data from Microsoft Graph
   */
  async getTodaysMeetings(forceRefresh = false) {
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
      const tz = encodeURIComponent(this.timezone);
      const refreshParam = forceRefresh ? "&forceRefresh=true" : "";
      const response = await (0, import_obsidian2.requestUrl)({
        url: `${this.serverUrl}/api/calendar/${this.userEmail}/today?timezone=${tz}${refreshParam}`,
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
   * @param forceRefresh - If true, forces server to fetch fresh data from Microsoft Graph
   */
  async getWeekMeetings(forceRefresh = false) {
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
      const tz = encodeURIComponent(this.timezone);
      const refreshParam = forceRefresh ? "&forceRefresh=true" : "";
      const response = await (0, import_obsidian2.requestUrl)({
        url: `${this.serverUrl}/api/calendar/${this.userEmail}/week?timezone=${tz}${refreshParam}`,
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
      const start = _CalendarService.safeParseDate(meeting.start);
      const end = _CalendarService.safeParseDate(meeting.end);
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
   * Handles YYYY-MM-DD format correctly by parsing as local time
   */
  static getDayName(dateString) {
    let date;
    if (dateString.length === 10 && dateString.includes("-")) {
      date = /* @__PURE__ */ new Date(dateString + "T00:00:00");
    } else {
      date = new Date(dateString);
    }
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const meetingDate = new Date(date);
    meetingDate.setHours(0, 0, 0, 0);
    const diff = Math.round((meetingDate.getTime() - today.getTime()) / (1e3 * 60 * 60 * 24));
    if (diff === 0)
      return "Today";
    if (diff === 1)
      return "Tomorrow";
    return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  }
  /**
   * Format time for display (e.g., "10:00 AM")
   * @param isoString - ISO date string (should be UTC with Z suffix from server)
   * @param timezone - Optional IANA timezone (e.g., 'America/New_York')
   */
  static formatTime(isoString, timezone) {
    let safeString = isoString;
    if (safeString && !safeString.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(safeString)) {
      safeString = safeString + "Z";
    }
    const date = new Date(safeString);
    if (isNaN(date.getTime())) {
      return isoString;
    }
    const options = {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    };
    if (timezone) {
      options.timeZone = timezone;
    }
    return date.toLocaleTimeString("en-US", options);
  }
  /**
   * Safely parse a datetime string, treating naive strings (no Z or offset) as UTC.
   * This prevents local-time misinterpretation of Graph API datetime values.
   */
  static safeParseDate(dateTimeStr) {
    if (!dateTimeStr)
      return /* @__PURE__ */ new Date(NaN);
    let safe = dateTimeStr;
    if (!safe.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(safe)) {
      safe = safe + "Z";
    }
    return new Date(safe);
  }
  /**
   * Calculate meeting duration in minutes
   */
  static getMeetingDuration(start, end) {
    const startDate = _CalendarService.safeParseDate(start);
    const endDate = _CalendarService.safeParseDate(end);
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

// src/AccountOwnership.ts
var ADMIN_EMAILS = [
  "keigan.pesenti@eudia.com",
  "michael.ayers@eudia.com",
  "michael.flynn@eudia.com",
  "zach@eudia.com"
];
var EXEC_EMAILS = [
  "omar@eudia.com",
  "david@eudia.com",
  "ashish@eudia.com",
  "siddharth.saxena@eudia.com"
  // Product Ops & Partnerships Lead
];
var SALES_LEADERS = {
  "mitchell.loquaci@eudia.com": { name: "Mitchell Loquaci", region: "US", role: "RVP Sales" },
  "stephen.mulholland@eudia.com": { name: "Stephen Mulholland", region: "EMEA", role: "VP Sales" },
  "riona.mchale@eudia.com": { name: "Riona McHale", region: "IRE_UK", role: "Head of Sales" }
};
var CS_EMAILS = [
  "nikhita.godiwala@eudia.com",
  "jon.dedych@eudia.com",
  "farah.haddad@eudia.com"
];
var BL_REGIONS = {
  "US": [
    "asad.hussain@eudia.com",
    "julie.stefanich@eudia.com",
    "olivia@eudia.com",
    "ananth@eudia.com",
    "ananth.cherukupally@eudia.com",
    "justin.hills@eudia.com",
    "mike.masiello@eudia.com",
    "mike@eudia.com",
    "sean.boyd@eudia.com",
    "riley.stack@eudia.com",
    "rajeev.patel@eudia.com"
  ],
  "EMEA": [
    "greg.machale@eudia.com",
    "tom.clancy@eudia.com",
    "nicola.fratini@eudia.com",
    "nathan.shine@eudia.com",
    "stephen.mulholland@eudia.com"
  ],
  "IRE_UK": [
    "conor.molloy@eudia.com",
    "alex.fox@eudia.com",
    "emer.flynn@eudia.com",
    "riona.mchale@eudia.com"
  ]
};
var SALES_LEADER_DIRECT_REPORTS = {
  "mitchell.loquaci@eudia.com": [
    "asad.hussain@eudia.com",
    "julie.stefanich@eudia.com",
    "olivia@eudia.com",
    "ananth@eudia.com",
    "ananth.cherukupally@eudia.com",
    "justin.hills@eudia.com",
    "mike.masiello@eudia.com",
    "mike@eudia.com",
    "sean.boyd@eudia.com",
    "riley.stack@eudia.com",
    "rajeev.patel@eudia.com"
  ],
  "stephen.mulholland@eudia.com": [
    "greg.machale@eudia.com",
    "tom.clancy@eudia.com",
    "conor.molloy@eudia.com",
    "nathan.shine@eudia.com",
    "nicola.fratini@eudia.com"
  ],
  "riona.mchale@eudia.com": [
    "conor.molloy@eudia.com",
    "alex.fox@eudia.com",
    "emer.flynn@eudia.com"
  ]
};
var POD_VIEW_USERS = {
  "sean.boyd@eudia.com": "US",
  "riley.stack@eudia.com": "US"
};
function getUserGroup(email) {
  const normalized = email.toLowerCase().trim();
  if (ADMIN_EMAILS.includes(normalized))
    return "admin";
  if (EXEC_EMAILS.includes(normalized))
    return "exec";
  if (normalized in SALES_LEADERS)
    return "sales_leader";
  if (CS_EMAILS.includes(normalized))
    return "cs";
  return "bl";
}
function getSalesLeaderRegion(email) {
  const normalized = email.toLowerCase().trim();
  return SALES_LEADERS[normalized]?.region || null;
}
function getRegionBLEmails(region) {
  return BL_REGIONS[region] || [];
}
function getSalesLeaderDirectReports(email) {
  const normalized = email.toLowerCase().trim();
  if (SALES_LEADER_DIRECT_REPORTS[normalized]) {
    return SALES_LEADER_DIRECT_REPORTS[normalized];
  }
  const region = getSalesLeaderRegion(normalized);
  return region ? getRegionBLEmails(region) : [];
}
function isAdminUser(email) {
  const normalizedEmail = email.toLowerCase().trim();
  return ADMIN_EMAILS.includes(normalizedEmail) || EXEC_EMAILS.includes(normalizedEmail);
}
var OWNERSHIP_DATA = {
  version: "2026-02-09",
  lastUpdated: "2026-02-09",
  businessLeads: {
    // ALEX FOX (4 active + 8 prospect = 12 total)
    "alex.fox@eudia.com": {
      email: "alex.fox@eudia.com",
      name: "Alex Fox",
      accounts: [
        { id: "001Wj00000mCFsT", name: "Arabic Computer Systems", hadOpportunity: false },
        { id: "001Wj00000mCFsO", name: "Brown Thomas", hadOpportunity: true },
        { id: "001Wj00000mCFt2", name: "Byrne Wallace Shields", hadOpportunity: true },
        { id: "001Wj00000mCFsu", name: "Corrigan & Corrigan Solicitors LLP", hadOpportunity: true },
        { id: "001Wj00000pzTPY", name: "Defence Forces Tribunal", hadOpportunity: false },
        { id: "001Wj00000mCFsc", name: "Department of Children, Disability and Equality", hadOpportunity: false },
        { id: "001Wj00000mCFsN", name: "Department of Climate, Energy and the Environment", hadOpportunity: false },
        { id: "001Wj00000mCFrZ", name: "Department of Housing", hadOpportunity: true },
        { id: "001Wj00000mCFsU", name: "ESB NI/Electric Ireland", hadOpportunity: false },
        { id: "001Wj00000pzTPV", name: "MW Keller", hadOpportunity: false },
        { id: "001Wj00000pzTPX", name: "Murphy's Ice Cream", hadOpportunity: false },
        { id: "001Wj00000mCFrM", name: "Sisk Group", hadOpportunity: false }
      ]
    },
    // ANANTH CHERUKUPALLY (49 active + 131 prospect = 180 total)
    "ananth.cherukupally@eudia.com": {
      email: "ananth.cherukupally@eudia.com",
      name: "Ananth Cherukupally",
      accounts: [
        { id: "001Wj00000PfssX", name: "AGC Partners", hadOpportunity: false },
        { id: "001Wj00000ahBZt", name: "AMETEK", hadOpportunity: false },
        { id: "001Wj00000ahBZr", name: "Accel-KKR", hadOpportunity: false },
        { id: "001Wj00000bwVu4", name: "Addtech", hadOpportunity: false },
        { id: "001Wj00000YNV7Z", name: "Advent", hadOpportunity: true },
        { id: "001Wj00000VZScK", name: "Affinity Consulting Group", hadOpportunity: false },
        { id: "001Wj00000lyFyt", name: "Albacore Capital Group", hadOpportunity: true },
        { id: "001Wj00000nlL88", name: "Alder", hadOpportunity: true },
        { id: "001Wj00000XumF6", name: "Alpine Investors", hadOpportunity: true },
        { id: "001Wj00000QTbLP", name: "Alvarez AI Advisors", hadOpportunity: false },
        { id: "001Wj00000ahFCJ", name: "American Pacific Group", hadOpportunity: false },
        { id: "001Wj00000ah6dg", name: "Angeles Equity Partners", hadOpportunity: false },
        { id: "001Hp00003kIrEu", name: "Apollo Global Management", hadOpportunity: false },
        { id: "001Wj00000cl5pq", name: "Arizona MBDA Business Center", hadOpportunity: false },
        { id: "001Wj00000nlRev", name: "Attack Capital", hadOpportunity: true },
        { id: "001Wj00000ahFBx", name: "Audax Group", hadOpportunity: false },
        { id: "001Wj00000YhZAE", name: "Beacon Software", hadOpportunity: true },
        { id: "001Wj00000cfg0c", name: "Beekers Capital", hadOpportunity: false },
        { id: "001Wj00000bwVsk", name: "Bertram Capital", hadOpportunity: false },
        { id: "001Wj00000ahBa0", name: "Bessemer Venture Partners", hadOpportunity: false },
        { id: "001Wj00000lzDWj", name: "BlueEarth Capital", hadOpportunity: true },
        { id: "001Wj00000ah6dZ", name: "Brentwood Associates", hadOpportunity: false },
        { id: "001Wj00000ah6dL", name: "Brown & Brown", hadOpportunity: false },
        { id: "001Hp00003kIrCh", name: "CBRE Group", hadOpportunity: false },
        { id: "001Wj00000cejJz", name: "CVC", hadOpportunity: true },
        { id: "001Wj00000ahFCV", name: "Caltius Equity Partners", hadOpportunity: false },
        { id: "001Wj00000ahFBz", name: "Capstone Partners", hadOpportunity: false },
        { id: "001Wj00000nlB0g", name: "Capvest", hadOpportunity: true },
        { id: "001Hp00003kIrFy", name: "Cardinal Health", hadOpportunity: true },
        { id: "001Hp00003kIrDg", name: "Carlyle", hadOpportunity: true },
        { id: "001Wj00000PbIZ8", name: "Cascadia Capital", hadOpportunity: false },
        { id: "001Wj00000ah6dW", name: "Catterton", hadOpportunity: false },
        { id: "001Wj00000ahFC7", name: "Century Park Capital Partners", hadOpportunity: false },
        { id: "001Wj00000Rjuhj", name: "Citadel", hadOpportunity: false },
        { id: "001Wj00000ah6dn", name: "Clearlake Capital Group", hadOpportunity: false },
        { id: "001Wj00000ah6dY", name: "Cognex Corporation", hadOpportunity: false },
        { id: "001Wj00000ah6do", name: "Comvest Partners", hadOpportunity: false },
        { id: "001Wj00000ah6dv", name: "Constellation Software", hadOpportunity: true },
        { id: "001Wj00000ahFCI", name: "Cortec Group", hadOpportunity: false },
        { id: "001Wj00000ahBa4", name: "Crosslink Capital", hadOpportunity: false },
        { id: "001Wj00000ahFCR", name: "DCA Partners", hadOpportunity: false },
        { id: "001Wj00000ah6dc", name: "DFO Management", hadOpportunity: false },
        { id: "001Wj00000W8fEu", name: "Davis Polk", hadOpportunity: false },
        { id: "001Wj00000crdDR", name: "Delcor", hadOpportunity: true },
        { id: "001Wj00000ahFCM", name: "Diploma", hadOpportunity: false },
        { id: "001Wj00000kcANH", name: "Discord", hadOpportunity: true },
        { id: "001Wj00000ahFCU", name: "Doughty Hanson & Co", hadOpportunity: false },
        { id: "001Wj00000ah6dd", name: "Edgewater Capital Partners", hadOpportunity: false },
        { id: "001Wj00000Y64qh", name: "Emigrant Bank", hadOpportunity: true },
        { id: "001Wj00000ah6dM", name: "Encore Consumer Capital", hadOpportunity: false },
        { id: "001Wj00000ahFCL", name: "Endeavour Capital", hadOpportunity: false },
        { id: "001Wj00000ah6di", name: "FFL Partners", hadOpportunity: false },
        { id: "001Wj00000ah6dV", name: "Falfurrias Capital Partners", hadOpportunity: false },
        { id: "001Wj00000ah6dU", name: "FirstService Corporation", hadOpportunity: false },
        { id: "001Wj00000nlLZU", name: "Five Capital", hadOpportunity: true },
        { id: "001Wj00000ahFCK", name: "Flexpoint Ford", hadOpportunity: false },
        { id: "001Wj00000QkjJL", name: "Floodgate", hadOpportunity: false },
        { id: "001Wj00000bwVu6", name: "Fortive Corporation", hadOpportunity: false },
        { id: "001Wj00000ahFCa", name: "Foundry Group", hadOpportunity: false },
        { id: "001Hp00003kIrID", name: "Freeport-McMoRan", hadOpportunity: true },
        { id: "001Wj00000bwVuN", name: "Fremont Partners", hadOpportunity: false },
        { id: "001Wj00000ahFCO", name: "Frontenac Company", hadOpportunity: false },
        { id: "001Hp00003kIrII", name: "GE Healthcare", hadOpportunity: true },
        { id: "001Hp00003kIrIJ", name: "GE Vernova", hadOpportunity: false },
        { id: "001Wj00000lz2Jb", name: "GTIS Partners", hadOpportunity: true },
        { id: "001Wj00000ah6dh", name: "Gallant Capital Partners", hadOpportunity: false },
        { id: "001Hp00003kJ9oP", name: "General Catalyst", hadOpportunity: true },
        { id: "001Wj00000ah6dr", name: "Genstar Capital", hadOpportunity: false },
        { id: "001Hp00003kIrIT", name: "GlaxoSmithKline", hadOpportunity: true },
        { id: "001Wj00000ahFCb", name: "Goldner Hawn Johnson & Morrison", hadOpportunity: false },
        { id: "001Wj00000ah6du", name: "Great Point Partners", hadOpportunity: false },
        { id: "001Wj00000ahBZx", name: "Greenoaks Capital", hadOpportunity: true },
        { id: "001Wj00000ahFCB", name: "Greenspring Associates", hadOpportunity: false },
        { id: "001Wj00000ahFCX", name: "Group 206", hadOpportunity: false },
        { id: "001Wj00000ahBZz", name: "Gryphon Investors", hadOpportunity: false },
        { id: "001Wj00000ah6dT", name: "HEICO Corporation", hadOpportunity: false },
        { id: "001Wj00000cy4m1", name: "HG", hadOpportunity: true },
        { id: "001Wj00000ahBZn", name: "HGGC", hadOpportunity: false },
        { id: "001Wj00000ah6df", name: "Halma", hadOpportunity: false },
        { id: "001Wj00000ah48X", name: "Harvest Partners", hadOpportunity: false },
        { id: "001Wj00000ahFCS", name: "HealthpointCapital", hadOpportunity: false },
        { id: "001Wj00000lzDtJ", name: "Heidrick & Struggles", hadOpportunity: true },
        { id: "001Hp00003kIrIl", name: "Hellman & Friedman", hadOpportunity: false },
        { id: "001Wj00000ahFCW", name: "Highview Capital", hadOpportunity: false },
        { id: "001Wj00000Pg7rW", name: "Houlihan Lokey", hadOpportunity: false },
        { id: "001Wj00000ahFCH", name: "Housatonic Partners", hadOpportunity: false },
        { id: "001Wj00000ahFC9", name: "Huron Capital", hadOpportunity: false },
        { id: "001Wj00000ahFC6", name: "Indutrade", hadOpportunity: false },
        { id: "001Wj00000ahBa5", name: "Insight Partners", hadOpportunity: false },
        { id: "001Wj00000nlbr9", name: "Intercorp", hadOpportunity: true },
        { id: "001Wj00000ahFCA", name: "Irving Place Capital", hadOpportunity: false },
        { id: "001Wj00000bwVtt", name: "Jack Henry & Associates", hadOpportunity: false },
        { id: "001Wj00000Pg9oT", name: "Jackim Woods & Co.", hadOpportunity: false },
        { id: "001Wj00000ah6de", name: "Jonas Software", hadOpportunity: false },
        { id: "001Hp00003kIrJU", name: "KKR", hadOpportunity: false },
        { id: "001Wj00000ahBa1", name: "Kayne Anderson Capital Advisors", hadOpportunity: false },
        { id: "001Wj00000m5kud", name: "Kelly Services", hadOpportunity: true },
        { id: "001Wj00000ahBZp", name: "Keysight Technologies", hadOpportunity: false },
        { id: "001Wj00000ahFC8", name: "L Squared Capital Partners", hadOpportunity: false },
        { id: "001Wj00000QGTNV", name: "LCS Forensic Accounting & Advisory", hadOpportunity: false },
        { id: "001Wj00000ahFCD", name: "Lagercrantz Group", hadOpportunity: false },
        { id: "001Wj00000ahBZs", name: "Levine Leichtman Capital Partners", hadOpportunity: false },
        { id: "001Wj00000Z6zhP", name: "Liberty Mutual Insurance", hadOpportunity: true },
        { id: "001Wj00000ahFCC", name: "Lifco", hadOpportunity: false },
        { id: "001Wj00000ahFCP", name: "LightBay Capital", hadOpportunity: false },
        { id: "001Wj00000iYEVS", name: "Lightstone Group", hadOpportunity: true },
        { id: "001Wj00000ahFCT", name: "Lincolnshire Management", hadOpportunity: false },
        { id: "001Wj00000c8ynV", name: "Littelfuse", hadOpportunity: true },
        { id: "001Wj00000W95CX", name: "Long Lake", hadOpportunity: true },
        { id: "001Wj00000ahBa3", name: "Luminate Capital", hadOpportunity: false },
        { id: "001Wj00000ahFC1", name: "Lumine Group", hadOpportunity: false },
        { id: "001Wj00000bwVuH", name: "Markel Corporation", hadOpportunity: false },
        { id: "001Wj00000Pfppo", name: "Marks Baughan", hadOpportunity: false },
        { id: "001Wj00000ah6dm", name: "Martis Capital", hadOpportunity: false },
        { id: "001Hp00003kKrRR", name: "Marvell Technology", hadOpportunity: true },
        { id: "001Wj00000PbJ2B", name: "Meridian Capital", hadOpportunity: false },
        { id: "001Wj00000ahFC3", name: "Nexa Equity", hadOpportunity: false },
        { id: "001Wj00000ahBZv", name: "Norwest Venture Partners", hadOpportunity: false },
        { id: "001Wj00000ah6dp", name: "Novanta", hadOpportunity: false },
        { id: "001Wj00000ah6dQ", name: "Pacific Avenue Capital Partners", hadOpportunity: false },
        { id: "001Wj00000ah6dt", name: "Palladium Equity Partners", hadOpportunity: false },
        { id: "001Wj00000iXNFs", name: "Palomar Holdings", hadOpportunity: true },
        { id: "001Wj00000ahFCG", name: "Pamlico Capital", hadOpportunity: false },
        { id: "001Wj00000W3R2u", name: "Paradigm", hadOpportunity: false },
        { id: "001Wj00000bWBlQ", name: "Pegasystems", hadOpportunity: true },
        { id: "001Wj00000YcPTM", name: "Percheron Capital", hadOpportunity: true },
        { id: "001Wj00000bzz9M", name: "Peregrine Hospitality", hadOpportunity: false },
        { id: "001Wj00000VZkJ3", name: "PerformLaw", hadOpportunity: false },
        { id: "001Hp00003ljCJ8", name: "Petco", hadOpportunity: true },
        { id: "001Wj00000ahFBy", name: "Pharos Capital Group", hadOpportunity: false },
        { id: "001Wj00000bwVuF", name: "Pool Corporation", hadOpportunity: false },
        { id: "001Wj00000ah48Y", name: "Pritzker Private Capital", hadOpportunity: false },
        { id: "001Wj00000mRFNX", name: "Publicis Group", hadOpportunity: true },
        { id: "001Hp00003kKXSI", name: "Pure Storage", hadOpportunity: false },
        { id: "001Wj00000ah6dS", name: "Quad-C Management", hadOpportunity: false },
        { id: "001Hp00003kIrLo", name: "Raymond James Financial", hadOpportunity: false },
        { id: "001Wj00000ah6ds", name: "Resilience Capital Partners", hadOpportunity: false },
        { id: "001Wj00000m0jBC", name: "RingCentral", hadOpportunity: true },
        { id: "001Wj00000ahFC4", name: "Riverside Acceleration Capital", hadOpportunity: false },
        { id: "001Wj00000ah48a", name: "Riverside Partners", hadOpportunity: false },
        { id: "001Wj00000ahFCE", name: "Rustic Canyon Partners", hadOpportunity: false },
        { id: "001Wj00000ah6dR", name: "Sageview Capital", hadOpportunity: false },
        { id: "001Wj00000ahFCN", name: "Salt Creek Capital", hadOpportunity: false },
        { id: "001Wj00000lzlLX", name: "Sandbox", hadOpportunity: true },
        { id: "001Wj00000nldrK", name: "Scout Motors", hadOpportunity: true },
        { id: "001Wj00000ah48Z", name: "Searchlight Capital", hadOpportunity: false },
        { id: "001Wj00000ahBZq", name: "Serent Capital", hadOpportunity: false },
        { id: "001Hp00003kIrEB", name: "Silver Lake", hadOpportunity: false },
        { id: "001Wj00000ahBZo", name: "Siris Capital Group", hadOpportunity: false },
        { id: "001Wj00000ah6db", name: "Solace Capital Partners", hadOpportunity: false },
        { id: "001Wj00000ahFCF", name: "Solis Capital Partners", hadOpportunity: false },
        { id: "001Wj00000VkQyY", name: "Sonja Cotton & Associates", hadOpportunity: false },
        { id: "001Wj00000ah6dO", name: "Sorenson Capital", hadOpportunity: false },
        { id: "001Wj00000lygkU", name: "SoundPoint Capital", hadOpportunity: true },
        { id: "001Wj00000lxbYR", name: "Spark Brighter Thinking", hadOpportunity: true },
        { id: "001Wj00000ah6dj", name: "Spectrum Equity", hadOpportunity: true },
        { id: "001Wj00000lusqi", name: "Symphony Technology Partners", hadOpportunity: true },
        { id: "001Wj00000tOAoE", name: "TA Associates", hadOpportunity: true },
        { id: "001Hp00003kKrU1", name: "TPG", hadOpportunity: false },
        { id: "001Wj00000dNhDy", name: "TSS Europe", hadOpportunity: true },
        { id: "001Wj00000QTbzh", name: "Taytrom", hadOpportunity: false },
        { id: "001Wj00000ahFCY", name: "The Courtney Group", hadOpportunity: false },
        { id: "001Wj00000ahFCZ", name: "The Riverside Company", hadOpportunity: false },
        { id: "001Wj00000cgCF8", name: "Titan AI", hadOpportunity: false },
        { id: "001Wj00000nlOIv", name: "Together Fund", hadOpportunity: true },
        { id: "001Wj00000ah6dX", name: "Topicus.com", hadOpportunity: false },
        { id: "001Hp00003kIrNO", name: "TransDigm Group", hadOpportunity: false },
        { id: "001Wj00000ah6dN", name: "Transom Capital Group", hadOpportunity: false },
        { id: "001Wj00000ahBZu", name: "Trimble Inc.", hadOpportunity: false },
        { id: "001Wj00000ah6dl", name: "Trivest Partners", hadOpportunity: false },
        { id: "001Wj00000dXDo3", name: "Tucker's Farm", hadOpportunity: true },
        { id: "001Wj00000ah6da", name: "Tyler Technologies", hadOpportunity: false },
        { id: "001Wj00000Y6VMa", name: "UBS", hadOpportunity: true },
        { id: "001Wj00000ahFCQ", name: "Vance Street Capital", hadOpportunity: false },
        { id: "001Wj00000bn8VS", name: "Vista Equity Partners", hadOpportunity: true },
        { id: "001Wj00000ahFC0", name: "Vitec Software", hadOpportunity: false },
        { id: "001Wj00000ah6dP", name: "Volaris Group", hadOpportunity: false },
        { id: "001Hp00003kIrO2", name: "Watsco", hadOpportunity: false },
        { id: "001Wj00000ahBZw", name: "West Lane Capital Partners", hadOpportunity: false },
        { id: "001Wj00000ahBZy", name: "Zebra Technologies", hadOpportunity: false }
      ]
    },
    // ASAD HUSSAIN (55 active + 43 prospect = 98 total)
    "asad.hussain@eudia.com": {
      email: "asad.hussain@eudia.com",
      name: "Asad Hussain",
      accounts: [
        { id: "001Hp00003kIrFC", name: "AT&T", hadOpportunity: false },
        { id: "001Hp00003kIrCy", name: "Airbnb", hadOpportunity: false },
        { id: "001Hp00003kIrEe", name: "Amazon", hadOpportunity: false },
        { id: "001Wj00000WElj9", name: "American Arbitration Association", hadOpportunity: true },
        { id: "001Hp00003kIrCz", name: "American Express", hadOpportunity: true },
        { id: "001Wj00000hewsX", name: "Amkor", hadOpportunity: true },
        { id: "001Wj00000WZ05x", name: "Applied Intuition", hadOpportunity: true },
        { id: "001Hp00003kIrEx", name: "Applied Materials", hadOpportunity: false },
        { id: "001Hp00003kIrEz", name: "Archer Daniels Midland", hadOpportunity: true },
        { id: "001Wj00000Y0g8Z", name: "Asana", hadOpportunity: false },
        { id: "001Wj00000gGYAQ", name: "Autodesk", hadOpportunity: false },
        { id: "001Wj00000c0wRA", name: "Away", hadOpportunity: false },
        { id: "001Wj00000WTMCR", name: "BNY Mellon", hadOpportunity: false },
        { id: "001Wj00000c6DHy", name: "BetterUp", hadOpportunity: true },
        { id: "001Hp00003kIrFY", name: "BlackRock", hadOpportunity: false },
        { id: "001Hp00003kIrFe", name: "Booz Allen Hamilton", hadOpportunity: false },
        { id: "001Wj00000XhcVG", name: "Box.com", hadOpportunity: true },
        { id: "001Wj00000bWBla", name: "CNA Insurance", hadOpportunity: true },
        { id: "001Wj00000XiYqz", name: "Canva", hadOpportunity: true },
        { id: "001Hp00003kIrG0", name: "Carrier Global", hadOpportunity: false },
        { id: "001Wj00000mosEX", name: "Carta", hadOpportunity: true },
        { id: "001Wj00000ah6dk", name: "Charlesbank Capital Partners", hadOpportunity: true },
        { id: "001Wj00000XiXjd", name: "Circle", hadOpportunity: false },
        { id: "001Hp00003kIrE5", name: "Coherent", hadOpportunity: false },
        { id: "001Hp00003kIrGf", name: "Corning", hadOpportunity: true },
        { id: "001Wj00000fgfGu", name: "Cyware", hadOpportunity: true },
        { id: "001Hp00003kIrE6", name: "DHL", hadOpportunity: false },
        { id: "001Wj00000duIWr", name: "Deepmind", hadOpportunity: true },
        { id: "001Hp00003kIrGy", name: "Dell Technologies", hadOpportunity: false },
        { id: "001Hp00003kIrGz", name: "Deloitte", hadOpportunity: false },
        { id: "001Wj00000W8ZKl", name: "Docusign", hadOpportunity: true },
        { id: "001Hp00003kIrHN", name: "Ecolab", hadOpportunity: false },
        { id: "001Wj00000dheQN", name: "Emory", hadOpportunity: true },
        { id: "001Wj00000bWIxP", name: "Ericsson", hadOpportunity: true },
        { id: "001Hp00003kIrHs", name: "FedEx", hadOpportunity: false },
        { id: "001Wj00000lMcwT", name: "Flo Health", hadOpportunity: true },
        { id: "001Hp00003kIrI3", name: "Fluor", hadOpportunity: true },
        { id: "001Hp00003kIrIA", name: "Fox", hadOpportunity: true },
        { id: "001Hp00003kJ9oe", name: "Fresh Del Monte", hadOpportunity: false },
        { id: "001Wj00000Y6HEY", name: "G-III Apparel Group", hadOpportunity: true },
        { id: "001Wj00000kNTF0", name: "GLG", hadOpportunity: true },
        { id: "001Hp00003kIrIK", name: "Geico", hadOpportunity: true },
        { id: "001Hp00003lhVuD", name: "General Atlantic", hadOpportunity: true },
        { id: "001Wj00000dw1gb", name: "Glean", hadOpportunity: true },
        { id: "001Hp00003kJ9l1", name: "Google", hadOpportunity: true },
        { id: "001Wj00000oqVXg", name: "Goosehead Insurance", hadOpportunity: true },
        { id: "001Wj00000tuXZb", name: "Gopuff", hadOpportunity: true },
        { id: "001Hp00003kIrDP", name: "HP", hadOpportunity: true },
        { id: "001Hp00003kIrIt", name: "HSBC", hadOpportunity: true },
        { id: "001Hp00003kL3Mo", name: "Honeywell", hadOpportunity: false },
        { id: "001Hp00003kIrIy", name: "Huntsman", hadOpportunity: true },
        { id: "001Wj00000d7IL8", name: "IAC", hadOpportunity: true },
        { id: "001Hp00003kIrJ0", name: "IBM", hadOpportunity: false },
        { id: "001Wj00000hdoLx", name: "Insight Enterprises Inc.", hadOpportunity: true },
        { id: "001Wj00000gH7ua", name: "JFrog", hadOpportunity: true },
        { id: "001Wj00000tNwur", name: "Janus Henderson", hadOpportunity: false },
        { id: "001Wj00000iC14X", name: "Klarna", hadOpportunity: true },
        { id: "001Wj00000wSLUl", name: "LexisNexis", hadOpportunity: false },
        { id: "001Wj00000mCFtJ", name: "LinkedIn", hadOpportunity: false },
        { id: "001Hp00003kIrJu", name: "Lockheed Martin", hadOpportunity: true },
        { id: "001Hp00003kIrKC", name: "Mass Mutual Life Insurance", hadOpportunity: true },
        { id: "001Hp00003kIrKO", name: "Microsoft", hadOpportunity: true },
        { id: "001Wj00000lyDQk", name: "MidOcean Partners", hadOpportunity: true },
        { id: "001Hp00003kIrKT", name: "Morgan Stanley", hadOpportunity: false },
        { id: "001Wj00000bWIxq", name: "Motiva", hadOpportunity: true },
        { id: "001Hp00003kIrKr", name: "NVIDIA", hadOpportunity: false },
        { id: "001Hp00003kIrCx", name: "Novartis", hadOpportunity: true },
        { id: "001Wj00000hVTTB", name: "One Oncology", hadOpportunity: true },
        { id: "001Wj00000Y6VVW", name: "Oscar Health", hadOpportunity: true },
        { id: "001Wj00000eLHLO", name: "Palo Alto Networks", hadOpportunity: false },
        { id: "001Wj00000kNp2X", name: "Plusgrade", hadOpportunity: true },
        { id: "001Wj00000YoLqW", name: "Procore Technologies", hadOpportunity: false },
        { id: "001Wj00000lXD0F", name: "RBI (Burger King)", hadOpportunity: false },
        { id: "001Hp00003kIrLx", name: "Republic Services", hadOpportunity: false },
        { id: "001Wj00000bWJ0J", name: "SAP", hadOpportunity: false },
        { id: "001Hp00003kIrD9", name: "Salesforce", hadOpportunity: false },
        { id: "001Wj00000fPr6N", name: "Santander", hadOpportunity: false },
        { id: "001Hp00003kIrMK", name: "ServiceNow", hadOpportunity: false },
        { id: "001Wj00000eL760", name: "Shell", hadOpportunity: false },
        { id: "001Wj00000kNmsg", name: "Skims", hadOpportunity: true },
        { id: "001Wj00000aCGR3", name: "Solventum", hadOpportunity: true },
        { id: "001Hp00003kIrEC", name: "Southwest Airlines", hadOpportunity: false },
        { id: "001Hp00003kIrMc", name: "SpaceX", hadOpportunity: false },
        { id: "001Wj00000SdYHq", name: "Spotify", hadOpportunity: true },
        { id: "001Hp00003kIrDl", name: "StoneX Group", hadOpportunity: false },
        { id: "001Wj00000WYtsU", name: "Tenable", hadOpportunity: false },
        { id: "001Hp00003kIrN5", name: "Tesla", hadOpportunity: false },
        { id: "001Wj00000c0wRK", name: "The Initial Group", hadOpportunity: true },
        { id: "001Wj00000bWBlX", name: "Thomson Reuters Ventures", hadOpportunity: false },
        { id: "001Hp00003kIrCs", name: "UPS", hadOpportunity: true },
        { id: "001Wj00000tuRNo", name: "Virtusa", hadOpportunity: true },
        { id: "001Hp00003kIrNw", name: "W.W. Grainger", hadOpportunity: true },
        { id: "001Hp00003kIrNy", name: "Walmart", hadOpportunity: true },
        { id: "001Wj00000Y64qk", name: "Warburg Pincus LLC", hadOpportunity: false },
        { id: "001Wj00000bzz9N", name: "Wealth Partners Capital Group", hadOpportunity: false },
        { id: "001Wj00000tuolf", name: "Wynn Las Vegas", hadOpportunity: true },
        { id: "001Wj00000bzz9Q", name: "Youtube", hadOpportunity: true },
        { id: "001Wj00000uzs1f", name: "Zero RFI", hadOpportunity: true }
      ]
    },
    // CONOR MOLLOY (9 active + 87 prospect = 96 total)
    "conor.molloy@eudia.com": {
      email: "conor.molloy@eudia.com",
      name: "Conor Molloy",
      accounts: [
        { id: "001Wj00000mCFrf", name: "APEX Group", hadOpportunity: false },
        { id: "001Wj00000xxtg6", name: "ASR Nederland", hadOpportunity: false },
        { id: "001Hp00003kIrQD", name: "Accenture", hadOpportunity: false },
        { id: "001Wj00000qLixn", name: "Al Dahra Group Llc", hadOpportunity: true },
        { id: "001Wj00000syNyn", name: "Alliance Healthcare", hadOpportunity: false },
        { id: "001Hp00003kIrEy", name: "Aramark Ireland", hadOpportunity: false },
        { id: "001Wj00000tWwXk", name: "Aramex", hadOpportunity: false },
        { id: "001Wj00000xyXlY", name: "Arkema", hadOpportunity: false },
        { id: "001Wj00000mCFrg", name: "Aryza", hadOpportunity: true },
        { id: "001Wj00000xz3F7", name: "Aurubis", hadOpportunity: false },
        { id: "001Wj00000bWIzJ", name: "BAE Systems, Inc.", hadOpportunity: false },
        { id: "001Wj00000fFhea", name: "BBC News", hadOpportunity: false },
        { id: "001Wj00000Y6Vk4", name: "BBC Studios", hadOpportunity: false },
        { id: "001Wj00000xypIc", name: "BMW Group", hadOpportunity: false },
        { id: "001Wj00000eLPna", name: "BP", hadOpportunity: false },
        { id: "001Wj00000tsfWO", name: "Baker Tilly", hadOpportunity: true },
        { id: "001Wj00000tWwXr", name: "Bestseller", hadOpportunity: false },
        { id: "001Wj00000xz3LZ", name: "Bouygues", hadOpportunity: false },
        { id: "001Wj00000xz3Td", name: "British Broadcasting Corporation", hadOpportunity: false },
        { id: "001Wj00000xyc3f", name: "Carrefour", hadOpportunity: false },
        { id: "001Wj00000tWwXy", name: "Citco", hadOpportunity: false },
        { id: "001Wj00000mCFrk", name: "Coillte", hadOpportunity: false },
        { id: "001Wj00000mCFsH", name: "Consensys", hadOpportunity: false },
        { id: "001Wj00000xxS3B", name: "Currys", hadOpportunity: false },
        { id: "001Wj00000Y6Vgo", name: "Cushman & Wakefield", hadOpportunity: false },
        { id: "001Wj00000tWwY2", name: "DB Schenker", hadOpportunity: false },
        { id: "001Wj00000xxpXf", name: "DZ Bank", hadOpportunity: false },
        { id: "001Wj00000bWIzG", name: "DZB BANK GmbH", hadOpportunity: false },
        { id: "001Wj00000Y6VMZ", name: "Danone", hadOpportunity: false },
        { id: "001Wj00000xyCKX", name: "Deutsche Bahn", hadOpportunity: false },
        { id: "001Wj00000tWwY3", name: "Dyson", hadOpportunity: false },
        { id: "001Wj00000xy3Iu", name: "E.ON", hadOpportunity: false },
        { id: "001Wj00000xz3Jx", name: "Electricite de France", hadOpportunity: false },
        { id: "001Hp00003kIrHR", name: "Electronic Arts", hadOpportunity: false },
        { id: "001Wj00000xz373", name: "Energie Baden-Wurttemberg", hadOpportunity: false },
        { id: "001Wj00000xwnL0", name: "Evonik Industries", hadOpportunity: false },
        { id: "001Wj00000xyr5v", name: "FMS Wertmanagement", hadOpportunity: false },
        { id: "001Wj00000Y6DDb", name: "Federal Reserve Bank of New York", hadOpportunity: false },
        { id: "001Wj00000tWwYf", name: "Fenergo", hadOpportunity: false },
        { id: "001Wj00000xxuFZ", name: "Finatis", hadOpportunity: false },
        { id: "001Wj00000xz3QP", name: "Groupe SEB", hadOpportunity: false },
        { id: "001Wj00000syXLZ", name: "Guerbet", hadOpportunity: false },
        { id: "001Wj00000xyP83", name: "Heraeus Holding", hadOpportunity: false },
        { id: "001Wj00000xxuVh", name: "Hermes International", hadOpportunity: false },
        { id: "001Wj00000xz32D", name: "Hornbach Group", hadOpportunity: false },
        { id: "001Wj00000hkk0u", name: "ICON", hadOpportunity: false },
        { id: "001Wj00000mCFr2", name: "ICON Clinical Research", hadOpportunity: false },
        { id: "001Wj00000Y64qd", name: "ION", hadOpportunity: true },
        { id: "001Wj00000xz3AH", name: "Ingka Group", hadOpportunity: false },
        { id: "001Wj00000tWwXa", name: "Jacobs Engineering Group", hadOpportunity: false },
        { id: "001Wj00000xz30c", name: "Johnson Matthey", hadOpportunity: false },
        { id: "001Wj00000mCFtM", name: "Kellanova", hadOpportunity: false },
        { id: "001Wj00000xz3S1", name: "Klockner", hadOpportunity: false },
        { id: "001Wj00000tWwYC", name: "Kuehne & Nagel", hadOpportunity: false },
        { id: "001Wj00000bWIym", name: "LSEG", hadOpportunity: false },
        { id: "001Wj00000Y6VZE", name: "Linde", hadOpportunity: false },
        { id: "001Wj00000xy1Lu", name: "M&G", hadOpportunity: false },
        { id: "001Wj00000xz0h4", name: "Metinvest", hadOpportunity: false },
        { id: "001Wj00000xyNse", name: "NN Group", hadOpportunity: false },
        { id: "001Wj00000xyECc", name: "Network Rail", hadOpportunity: false },
        { id: "001Wj00000xyudG", name: "Nordex", hadOpportunity: false },
        { id: "001Wj00000tWwXc", name: "Ocorian", hadOpportunity: false },
        { id: "001Wj00000fFW1m", name: "Okta", hadOpportunity: false },
        { id: "001Wj00000mCFrI", name: "Orsted", hadOpportunity: true },
        { id: "001Wj00000tWwYK", name: "PGIM", hadOpportunity: false },
        { id: "001Wj00000xz38f", name: "PPF Group", hadOpportunity: false },
        { id: "001Wj00000tWwYi", name: "Penneys", hadOpportunity: false },
        { id: "001Wj00000tWwYL", name: "Philips Electronics", hadOpportunity: false },
        { id: "001Wj00000tWwYP", name: "Reddit", hadOpportunity: false },
        { id: "001Wj00000mCFrU", name: "Riot Games", hadOpportunity: false },
        { id: "001Wj00000xyD0Q", name: "Rolls-Royce", hadOpportunity: false },
        { id: "001Wj00000xxIqC", name: "Royal Ahold Delhaize", hadOpportunity: false },
        { id: "001Wj00000xz3Gj", name: "Rubis", hadOpportunity: false },
        { id: "001Wj00000xyrh0", name: "Salzgitter", hadOpportunity: false },
        { id: "001Wj00000bWBm6", name: "Schneider Electric", hadOpportunity: false },
        { id: "001Wj00000mI9Nm", name: "Sequoia Climate Fund", hadOpportunity: false },
        { id: "001Wj00000fCp7J", name: "Siemens", hadOpportunity: false },
        { id: "001Wj00000tWwYR", name: "Smurfit Kappa", hadOpportunity: false },
        { id: "001Wj00000tWwYS", name: "Stewart", hadOpportunity: false },
        { id: "001Wj00000syavy", name: "Symrise AG", hadOpportunity: false },
        { id: "001Wj00000mCFs0", name: "Taoglas Limited", hadOpportunity: false },
        { id: "001Wj00000mCFtP", name: "Teamwork.com", hadOpportunity: false },
        { id: "001Wj00000sxsOq", name: "TechnipFMC", hadOpportunity: false },
        { id: "001Wj00000tWwXe", name: "Teneo", hadOpportunity: false },
        { id: "001Wj00000Y64qc", name: "Thales", hadOpportunity: false },
        { id: "001Hp00003kIrNJ", name: "Toyota", hadOpportunity: true },
        { id: "001Wj00000mCFqw", name: "Ulster Bank", hadOpportunity: false },
        { id: "001Wj00000xxDSI", name: "Unedic", hadOpportunity: false },
        { id: "001Wj00000mCFs2", name: "Vantage Towers", hadOpportunity: true },
        { id: "001Hp00003kIrNs", name: "Vistra", hadOpportunity: true },
        { id: "001Wj00000Y6VZD", name: "WPP", hadOpportunity: true },
        { id: "001Wj00000ZLVpT", name: "Wellspring Philanthropic Fund", hadOpportunity: false },
        { id: "001Wj00000mCFsY", name: "World Rugby", hadOpportunity: false },
        { id: "001Wj00000xyygs", name: "Wurth", hadOpportunity: false },
        { id: "001Wj00000aLlzL", name: "Xerox", hadOpportunity: false },
        { id: "001Wj00000j3QNL", name: "adidas", hadOpportunity: false }
      ]
    },
    // DAVID VAN REYK (2 active + 0 prospect = 2 total)
    "david.vanreyk@eudia.com": {
      email: "david.vanreyk@eudia.com",
      name: "David Van Reyk",
      accounts: [
        { id: "001Wj00000cIA4i", name: "Amerivet", hadOpportunity: true },
        { id: "001Wj00000dw9pN", name: "Ardian", hadOpportunity: true }
      ]
    },
    // EMER FLYNN (0 active + 10 prospect = 10 total)
    "emer.flynn@eudia.com": {
      email: "emer.flynn@eudia.com",
      name: "Emer Flynn",
      accounts: [
        { id: "001Wj00000syUts", name: "Bakkavor", hadOpportunity: false },
        { id: "001Wj00000syAdO", name: "Bonduelle", hadOpportunity: false },
        { id: "001Wj00000syAoe", name: "Gerresheimer", hadOpportunity: false },
        { id: "001Wj00000syBb5", name: "Harbour Energy", hadOpportunity: false },
        { id: "001Wj00000soqIv", name: "Lundbeck", hadOpportunity: false },
        { id: "001Wj00000mCFr6", name: "NTMA", hadOpportunity: false },
        { id: "001Wj00000sxy9J", name: "Orion Pharma", hadOpportunity: false },
        { id: "001Wj00000soqNk", name: "Sobi", hadOpportunity: false },
        { id: "001Wj00000sy54F", name: "SubSea7", hadOpportunity: false },
        { id: "001Wj00000sxvzJ", name: "Virbac", hadOpportunity: false }
      ]
    },
    // GREG MACHALE (28 active + 126 prospect = 154 total)
    "greg.machale@eudia.com": {
      email: "greg.machale@eudia.com",
      name: "Greg MacHale",
      accounts: [
        { id: "001Wj00000Y64ql", name: "ABN AMRO Bank N.V.", hadOpportunity: false },
        { id: "001Wj00000tWwYd", name: "AXA", hadOpportunity: false },
        { id: "001Hp00003kIrEF", name: "Abbott Laboratories", hadOpportunity: true },
        { id: "001Wj00000tWwXg", name: "Abtran", hadOpportunity: false },
        { id: "001Wj00000umCEl", name: "Aerogen", hadOpportunity: false },
        { id: "001Wj00000xyMyB", name: "Air Liquide", hadOpportunity: false },
        { id: "001Wj00000tWwYa", name: "Allergan", hadOpportunity: false },
        { id: "001Wj00000sgXdB", name: "Allianz Insurance", hadOpportunity: true },
        { id: "001Wj00000tWwYb", name: "Almac Group", hadOpportunity: false },
        { id: "001Hp00003kIrEm", name: "Amgen", hadOpportunity: false },
        { id: "001Wj00000pzTPu", name: "Arrow Global Group PLC/Mars Capital", hadOpportunity: false },
        { id: "001Wj00000tWwXm", name: "Arvato Digital Services", hadOpportunity: false },
        { id: "001Wj00000tWwXn", name: "Arvato Supply Chain Solutions", hadOpportunity: false },
        { id: "001Wj00000tWwYc", name: "Arvato Systems", hadOpportunity: false },
        { id: "001Wj00000xz3VF", name: "Asklepios", hadOpportunity: false },
        { id: "001Wj00000vWwfx", name: "Associated British Foods", hadOpportunity: false },
        { id: "001Hp00003kIrFB", name: "AstraZeneca", hadOpportunity: false },
        { id: "001Wj00000bWJ0A", name: "Atos", hadOpportunity: false },
        { id: "001Wj00000hfWMu", name: "Aya Healthcare", hadOpportunity: false },
        { id: "001Wj00000tWwXV", name: "BCM Group", hadOpportunity: false },
        { id: "001Wj00000tWwXU", name: "BCMGlobal ASI Ltd", hadOpportunity: false },
        { id: "001Wj00000Y6VMd", name: "BNP Paribas", hadOpportunity: true },
        { id: "001Wj00000X4OqN", name: "BT Group", hadOpportunity: false },
        { id: "001Wj00000vRJ13", name: "BWG Group", hadOpportunity: false },
        { id: "001Wj00000bWBsw", name: "Bausch + Lomb", hadOpportunity: false },
        { id: "001Hp00003kIrFO", name: "Baxter International", hadOpportunity: false },
        { id: "001Wj00000wLIjh", name: "Baywa", hadOpportunity: false },
        { id: "001Wj00000tWwXs", name: "Bidvest Noonan", hadOpportunity: false },
        { id: "001Wj00000mCFqr", name: "Biomarin International Limited", hadOpportunity: false },
        { id: "001Hp00003kIrFd", name: "Booking Holdings", hadOpportunity: false },
        { id: "001Wj00000T5gdt", name: "Bosch", hadOpportunity: false },
        { id: "001Hp00003kIrFg", name: "Boston Scientific", hadOpportunity: false },
        { id: "001Wj00000xyNsd", name: "Brenntag", hadOpportunity: false },
        { id: "001Wj00000tgYgj", name: "British American Tobacco ( BAT )", hadOpportunity: false },
        { id: "001Wj00000ulXoK", name: "British Petroleum ( BP )", hadOpportunity: false },
        { id: "001Hp00003kIrDK", name: "Bupa", hadOpportunity: false },
        { id: "001Wj00000bWBkr", name: "CRH", hadOpportunity: false },
        { id: "001Wj00000uZ5J7", name: "Canada Life", hadOpportunity: true },
        { id: "001Hp00003kIrFu", name: "Capgemini", hadOpportunity: false },
        { id: "001Wj00000tWwYe", name: "Capita", hadOpportunity: false },
        { id: "001Wj00000mCFt9", name: "Cerberus European Servicing", hadOpportunity: false },
        { id: "001Wj00000tWwXz", name: "CluneTech", hadOpportunity: false },
        { id: "001Wj00000wKnrE", name: "Co-operative Group ( Co-op )", hadOpportunity: false },
        { id: "001Wj00000Y6HEM", name: "Commerzbank AG", hadOpportunity: false },
        { id: "001Wj00000aLp9L", name: "Compass", hadOpportunity: false },
        { id: "001Wj00000cSBr6", name: "Compass Group Equity Partners", hadOpportunity: false },
        { id: "001Wj00000Y6VMk", name: "Computershare", hadOpportunity: true },
        { id: "001Wj00000uP5x8", name: "Cornmarket Financial Services", hadOpportunity: true },
        { id: "001Wj00000tWwY0", name: "Cornmarket Hill Trading Limited", hadOpportunity: false },
        { id: "001Hp00003kIrGk", name: "Covestro", hadOpportunity: false },
        { id: "001Wj00000tWwXY", name: "DCC Vital", hadOpportunity: false },
        { id: "001Wj00000mCFrV", name: "Danske Bank", hadOpportunity: false },
        { id: "001Hp00003kJ9fx", name: "Deutsche Bank AG", hadOpportunity: false },
        { id: "001Wj00000Y6VMM", name: "Diageo", hadOpportunity: true },
        { id: "001Wj00000prFOX", name: "Doosan Bobcat", hadOpportunity: true },
        { id: "001Wj00000wKzZ1", name: "Drax Group", hadOpportunity: false },
        { id: "001Hp00003kIrHQ", name: "EG Group", hadOpportunity: false },
        { id: "001Wj00000hUcQZ", name: "EY", hadOpportunity: true },
        { id: "001Wj00000wK30S", name: "EY ( Ernst & Young )", hadOpportunity: false },
        { id: "001Hp00003kIrHL", name: "Eaton Corporation", hadOpportunity: false },
        { id: "001Wj00000mCFtR", name: "Ekco Cloud Limited", hadOpportunity: true },
        { id: "001Hp00003kIrHS", name: "Elevance Health", hadOpportunity: false },
        { id: "001Hp00003kIrHT", name: "Eli Lilly", hadOpportunity: false },
        { id: "001Wj00000Y6HEn", name: "Ferring Pharmaceuticals", hadOpportunity: false },
        { id: "001Wj00000tWwYn", name: "Fibrus", hadOpportunity: false },
        { id: "001Hp00003kIrHu", name: "Fidelity Investments", hadOpportunity: false },
        { id: "001Hp00003kIrI0", name: "Fiserv", hadOpportunity: false },
        { id: "001Wj00000xxg4V", name: "Fnac Darty", hadOpportunity: false },
        { id: "001Wj00000wL79x", name: "Frasers Group", hadOpportunity: false },
        { id: "001Wj00000aLlyX", name: "Gartner", hadOpportunity: false },
        { id: "001Wj00000fFuFY", name: "Grant Thornton", hadOpportunity: true },
        { id: "001Wj00000uZ4A9", name: "Great West Lifec co", hadOpportunity: true },
        { id: "001Wj00000pzTPt", name: "Gym Plus Coffee", hadOpportunity: false },
        { id: "001Wj00000xW3SE", name: "Hayfin", hadOpportunity: true },
        { id: "001Wj00000pzTPm", name: "Hedgserv", hadOpportunity: false },
        { id: "001Wj00000xxsbv", name: "Heidelberg Materials", hadOpportunity: false },
        { id: "001Wj00000wvtPl", name: "ICEYE", hadOpportunity: true },
        { id: "001Wj00000mCFrH", name: "Indra", hadOpportunity: false },
        { id: "001Wj00000uZtcT", name: "Ineos", hadOpportunity: true },
        { id: "001Wj00000vXdt1", name: "International Airline Group ( IAG )", hadOpportunity: false },
        { id: "001Wj00000wKnZU", name: "International Distribution Services", hadOpportunity: false },
        { id: "001Wj00000wKTao", name: "John Swire & Sons", hadOpportunity: false },
        { id: "001Wj00000vaqot", name: "Johnson Controls", hadOpportunity: false },
        { id: "001Wj00000xwwRX", name: "Jumbo Groep Holding", hadOpportunity: false },
        { id: "001Hp00003kIrJb", name: "KPMG", hadOpportunity: false },
        { id: "001Wj00000Y6VZM", name: "Kering", hadOpportunity: false },
        { id: "001Wj00000mCFrr", name: "Kerry Group", hadOpportunity: false },
        { id: "001Wj00000xyyk7", name: "La Poste", hadOpportunity: false },
        { id: "001Wj00000tWwYr", name: "Laya Healthcare", hadOpportunity: false },
        { id: "001Wj00000tWwYE", name: "Leaseplan", hadOpportunity: false },
        { id: "001Wj00000tWwYF", name: "Linked Finance", hadOpportunity: false },
        { id: "001Wj00000Y6HEA", name: "Lloyds Banking Group", hadOpportunity: false },
        { id: "001Wj00000xyDV4", name: "LyondellBasell Industries", hadOpportunity: false },
        { id: "001Wj00000tWwYG", name: "MSC - Mediterranean Shipping Company", hadOpportunity: false },
        { id: "001Wj00000wvGLB", name: "MTU Maintenance Lease Services", hadOpportunity: false },
        { id: "001Wj00000iC14L", name: "MUFG Investor Services", hadOpportunity: false },
        { id: "001Wj00000xyp2U", name: "MVV Energie", hadOpportunity: false },
        { id: "001Wj00000tWwYp", name: "Mail Metrics", hadOpportunity: true },
        { id: "001Wj00000qFtCk", name: "Mars Capital", hadOpportunity: false },
        { id: "001Wj00000pAeWg", name: "Meetingsbooker", hadOpportunity: true },
        { id: "001Hp00003kIrKJ", name: "Mercedes-Benz Group", hadOpportunity: true },
        { id: "001Wj00000YEMaI", name: "Mercer", hadOpportunity: false },
        { id: "001Wj00000vwSUX", name: "Mercor", hadOpportunity: true },
        { id: "001Wj00000mCFtU", name: "Mercury Engineering", hadOpportunity: false },
        { id: "001Wj00000yGZth", name: "Monzo", hadOpportunity: false },
        { id: "001Wj00000tWwYg", name: "Musgrave", hadOpportunity: false },
        { id: "001Wj00000lPFP3", name: "Nomura", hadOpportunity: true },
        { id: "001Wj00000tWwYH", name: "Norbrook Laboratories", hadOpportunity: false },
        { id: "001Hp00003kIrKn", name: "Northrop Grumman", hadOpportunity: false },
        { id: "001Wj00000xxcH4", name: "Orange", hadOpportunity: false },
        { id: "001Wj00000tWwYI", name: "P.J. Carroll (BAT Ireland)", hadOpportunity: false },
        { id: "001Wj00000mCFsf", name: "Pepper Finance Corporation", hadOpportunity: false },
        { id: "001Wj00000mCFrO", name: "Peptalk", hadOpportunity: false },
        { id: "001Wj00000mCFr1", name: "Permanent TSB plc", hadOpportunity: true },
        { id: "001Wj00000Y6QfR", name: "Pernod Ricard", hadOpportunity: true },
        { id: "001Wj00000vVxFy", name: "Phoenix Group", hadOpportunity: false },
        { id: "001Wj00000tWwYM", name: "Pinewood Laboratories", hadOpportunity: false },
        { id: "001Wj00000tWwYN", name: "Pinsent Masons", hadOpportunity: false },
        { id: "001Wj00000tWwYO", name: "Pramerica", hadOpportunity: false },
        { id: "001Hp00003kIrLf", name: "PwC", hadOpportunity: false },
        { id: "001Hp00003kIrLi", name: "Quest Diagnostics", hadOpportunity: true },
        { id: "001Wj00000xy735", name: "RATP Group", hadOpportunity: false },
        { id: "001Wj00000xyKjS", name: "Randstad", hadOpportunity: false },
        { id: "001Wj00000mCFsF", name: "Regeneron", hadOpportunity: true },
        { id: "001Wj00000xwh4H", name: "Renault", hadOpportunity: false },
        { id: "001Wj00000xy1P5", name: "Rheinmetall", hadOpportunity: false },
        { id: "001Wj00000tWwYQ", name: "Roche", hadOpportunity: false },
        { id: "001Wj00000wKi8O", name: "Royal London", hadOpportunity: false },
        { id: "001Wj00000mCFsR", name: "Ryanair", hadOpportunity: false },
        { id: "001Wj00000xyJqd", name: "SCOR", hadOpportunity: false },
        { id: "001Wj00000pAxKo", name: "SSP Group", hadOpportunity: true },
        { id: "001Wj00000bWIzx", name: "Saint-Gobain", hadOpportunity: false },
        { id: "001Wj00000pzTPv", name: "Scottish Friendly", hadOpportunity: false },
        { id: "001Wj00000bzz9U", name: "Signify Group", hadOpportunity: true },
        { id: "001Wj00000fFuG4", name: "Sky", hadOpportunity: false },
        { id: "001Hp00003kIrDR", name: "Smith & Nephew", hadOpportunity: false },
        { id: "001Hp00003kIrE1", name: "Societe Generale", hadOpportunity: false },
        { id: "001Hp00003kIrMj", name: "State Street", hadOpportunity: true },
        { id: "001Wj00000xyy4A", name: "Sudzucker", hadOpportunity: false },
        { id: "001Wj00000mCFtB", name: "SurveyMonkey", hadOpportunity: false },
        { id: "001Wj00000xypQh", name: "TUI", hadOpportunity: false },
        { id: "001Wj00000tWwYT", name: "Takeda", hadOpportunity: false },
        { id: "001Wj00000wKD4c", name: "Talanx", hadOpportunity: false },
        { id: "001Wj00000mCFr9", name: "Tesco", hadOpportunity: true },
        { id: "001Wj00000tWwYX", name: "Tullow Oil", hadOpportunity: false },
        { id: "001Wj00000mCFsS", name: "Uniphar PLC", hadOpportunity: false },
        { id: "001Hp00003kIrNg", name: "UnitedHealth Group", hadOpportunity: false },
        { id: "001Wj00000mCFsx", name: "Vodafone Ireland", hadOpportunity: false },
        { id: "001Wj00000xybh4", name: "Wendel", hadOpportunity: false },
        { id: "001Wj00000sCb3D", name: "Willis Towers Watson", hadOpportunity: false },
        { id: "001Wj00000tWwYY", name: "Winthrop", hadOpportunity: false },
        { id: "001Wj00000pzTPW", name: "WizzAir", hadOpportunity: false },
        { id: "001Wj00000mCFrm", name: "eShopWorld", hadOpportunity: false },
        { id: "001Hp00003kJ9Ck", name: "wnco.com", hadOpportunity: false }
      ]
    },
    // HIMANSHU AGARWAL (15 active + 12 prospect = 27 total)
    "himanshu.agarwal@eudia.com": {
      email: "himanshu.agarwal@eudia.com",
      name: "Himanshu Agarwal",
      accounts: [
        { id: "001Hp00003kIrEs", name: "AON", hadOpportunity: true },
        { id: "001Wj00000RwUpO", name: "Acrisure", hadOpportunity: false },
        { id: "001Hp00003kIrCd", name: "Adobe", hadOpportunity: false },
        { id: "001Hp00003kIrEU", name: "Albertsons", hadOpportunity: true },
        { id: "001Wj00000T6Hrw", name: "Atlassian", hadOpportunity: true },
        { id: "001Wj00000ZRrYl", name: "Avis Budget Group", hadOpportunity: true },
        { id: "001Wj00000kIYAD", name: "Axis Bank", hadOpportunity: true },
        { id: "001Hp00003kIrD0", name: "Broadcom", hadOpportunity: true },
        { id: "001Hp00003kIrGh", name: "Costco Wholesale", hadOpportunity: false },
        { id: "001Hp00003kIrCu", name: "Disney", hadOpportunity: false },
        { id: "001Hp00003kIrIF", name: "Gap", hadOpportunity: true },
        { id: "001Hp00003kIrDN", name: "Genpact", hadOpportunity: false },
        { id: "001Wj00000Zcmad", name: "Geodis", hadOpportunity: true },
        { id: "001Wj00000Q2yaX", name: "Innovative Driven", hadOpportunity: false },
        { id: "001Hp00003lhshd", name: "Instacart", hadOpportunity: true },
        { id: "001Hp00003kIrJx", name: "Lowe's", hadOpportunity: false },
        { id: "001Hp00003kIrDk", name: "Moderna", hadOpportunity: false },
        { id: "001Wj00000hDvCc", name: "Nykaa", hadOpportunity: true },
        { id: "001Wj00000h9r1F", name: "Piramal Finance", hadOpportunity: true },
        { id: "001Hp00003kIrDc", name: "Progressive", hadOpportunity: false },
        { id: "001Wj00000cyDxS", name: "Pyxus", hadOpportunity: true },
        { id: "001Wj00000XXvnk", name: "Relativity", hadOpportunity: true },
        { id: "001Wj00000kIFDh", name: "Reliance", hadOpportunity: true },
        { id: "001Wj00000eKsGZ", name: "Snowflake", hadOpportunity: false },
        { id: "001Hp00003kIrNr", name: "Visa", hadOpportunity: true },
        { id: "001Hp00003kIrO0", name: "Warner Bros Discovery", hadOpportunity: false },
        { id: "001Hp00003kIrDT", name: "xAI", hadOpportunity: false }
      ]
    },
    // JON COBB (2 active + 0 prospect = 2 total)
    "jon.cobb@eudia.com": {
      email: "jon.cobb@eudia.com",
      name: "Jon Cobb",
      accounts: [
        { id: "001Wj00000XTOQZ", name: "Armstrong World Industries", hadOpportunity: true },
        { id: "001Wj00000c0Cxn", name: "U.S. Aircraft Insurance Group", hadOpportunity: true }
      ]
    },
    // JULIE STEFANICH (28 active + 24 prospect = 52 total)
    "julie.stefanich@eudia.com": {
      email: "julie.stefanich@eudia.com",
      name: "Julie Stefanich",
      accounts: [
        { id: "001Wj00000asSHB", name: "Airbus", hadOpportunity: true },
        { id: "001Hp00003kIrEl", name: "Ameriprise Financial", hadOpportunity: true },
        { id: "001Wj00000X6IDs", name: "Andersen", hadOpportunity: true },
        { id: "001Hp00003kIrEv", name: "Apple", hadOpportunity: true },
        { id: "001Wj00000soLVH", name: "Base Power", hadOpportunity: true },
        { id: "001Hp00003kJ9pX", name: "Bayer", hadOpportunity: false },
        { id: "001Hp00003kIrFP", name: "Bechtel", hadOpportunity: true },
        { id: "001Hp00003kIrFZ", name: "Block", hadOpportunity: true },
        { id: "001Hp00003kIrE3", name: "Cargill", hadOpportunity: false },
        { id: "001Hp00003kIrGD", name: "Charles Schwab", hadOpportunity: true },
        { id: "001Hp00003kIrE4", name: "Chevron", hadOpportunity: false },
        { id: "001Hp00003kIrDh", name: "Comcast", hadOpportunity: false },
        { id: "001Hp00003kIrGe", name: "Corebridge Financial", hadOpportunity: true },
        { id: "001Wj00000eLJAK", name: "CrowdStrike", hadOpportunity: false },
        { id: "001Hp00003liBe9", name: "DoorDash", hadOpportunity: false },
        { id: "001Hp00003kIrE7", name: "ECMS", hadOpportunity: false },
        { id: "001Hp00003kIrHP", name: "Edward Jones", hadOpportunity: true },
        { id: "001Wj00000iRzqv", name: "Florida Crystals Corporation", hadOpportunity: true },
        { id: "001Wj00000XS3MX", name: "Flutter", hadOpportunity: true },
        { id: "001Hp00003kIrIP", name: "Genworth Financial", hadOpportunity: true },
        { id: "001Hp00003kIrIX", name: "Goldman Sachs", hadOpportunity: false },
        { id: "001Wj00000rceVp", name: "Hikma", hadOpportunity: true },
        { id: "001Hp00003kIrJV", name: "KLA", hadOpportunity: true },
        { id: "001Wj00000XkT43", name: "Kaiser Permanente", hadOpportunity: false },
        { id: "001Wj00000aLmhe", name: "Macmillan", hadOpportunity: true },
        { id: "001Wj00000X6G8q", name: "Mainsail Partners", hadOpportunity: false },
        { id: "001Hp00003kIrDb", name: "McKinsey & Company", hadOpportunity: false },
        { id: "001Hp00003kIrKL", name: "MetLife", hadOpportunity: true },
        { id: "001Hp00003kIrCp", name: "Mosaic", hadOpportunity: false },
        { id: "001Hp00003kIrDe", name: "National Grid", hadOpportunity: true },
        { id: "001Hp00003kIrKY", name: "Netflix", hadOpportunity: true },
        { id: "001Hp00003kIrKj", name: "Nordstrom", hadOpportunity: false },
        { id: "001Hp00003kIrL2", name: "O'Reilly Automotive", hadOpportunity: true },
        { id: "001Hp00003kIrDv", name: "Oracle", hadOpportunity: false },
        { id: "001Hp00003kIrLP", name: "PG&E", hadOpportunity: false },
        { id: "001Hp00003kIrLH", name: "PayPal inc.", hadOpportunity: false },
        { id: "001Hp00003kIrLN", name: "Petsmart", hadOpportunity: false },
        { id: "001Hp00003kIrLZ", name: "Procter & Gamble", hadOpportunity: false },
        { id: "001Wj00000XcHEb", name: "Resmed", hadOpportunity: true },
        { id: "001Hp00003lhsUY", name: "Rio Tinto Group", hadOpportunity: false },
        { id: "001Wj00000svQI3", name: "Safelite", hadOpportunity: true },
        { id: "001Wj00000Yfysf", name: "Samsara", hadOpportunity: false },
        { id: "001Wj00000fRtLm", name: "State Farm", hadOpportunity: true },
        { id: "001Hp00003kIrNH", name: "T-Mobile", hadOpportunity: true },
        { id: "001Hp00003kIrCr", name: "TIAA", hadOpportunity: false },
        { id: "001Wj00000bIVo1", name: "TSMC", hadOpportunity: true },
        { id: "001Wj00000bzz9T", name: "Tailored Brands", hadOpportunity: true },
        { id: "001Hp00003kIrNB", name: "The Wonderful Company", hadOpportunity: false },
        { id: "001Hp00003kIrNV", name: "Uber", hadOpportunity: true },
        { id: "001Wj00000Y6VYk", name: "Verifone", hadOpportunity: true },
        { id: "001Hp00003kIrOL", name: "World Wide Technology", hadOpportunity: false },
        { id: "001Wj00000bWIza", name: "eBay", hadOpportunity: false }
      ]
    },
    // JUSTIN HILLS (13 active + 12 prospect = 25 total)
    "justin.hills@eudia.com": {
      email: "justin.hills@eudia.com",
      name: "Justin Hills",
      accounts: [
        { id: "001Wj00000vCx6j", name: "1800 Flowers", hadOpportunity: false },
        { id: "001Wj00000Y6VM4", name: "Ares Management Corporation", hadOpportunity: true },
        { id: "001Hp00003kIrG8", name: "Centene", hadOpportunity: true },
        { id: "001Wj00000c9oCv", name: "Cox Media Group", hadOpportunity: false },
        { id: "001Wj00000vCPMs", name: "Crusoe", hadOpportunity: false },
        { id: "001Wj00000vCiAw", name: "Deel", hadOpportunity: false },
        { id: "001Wj00000Y0jPm", name: "Delinea", hadOpportunity: false },
        { id: "001Wj00000iwKGQ", name: "Dominos", hadOpportunity: true },
        { id: "001Hp00003kIrDa", name: "Duracell", hadOpportunity: false },
        { id: "001Wj00000Y6Vde", name: "EPIC Insurance Brokers & Consultants", hadOpportunity: false },
        { id: "001Hp00003kIrIC", name: "Freddie Mac", hadOpportunity: false },
        { id: "001Hp00003kJ9gW", name: "Genentech", hadOpportunity: true },
        { id: "001Hp00003kIrDV", name: "Intel", hadOpportunity: false },
        { id: "001Hp00003kIrJJ", name: "Johnson & Johnson", hadOpportunity: true },
        { id: "001Wj00000gnrug", name: "Kraken", hadOpportunity: true },
        { id: "001Wj00000op4EW", name: "McCormick & Co Inc", hadOpportunity: true },
        { id: "001Wj00000RCeqA", name: "Nielsen", hadOpportunity: true },
        { id: "001Wj00000YEMZp", name: "Notion", hadOpportunity: false },
        { id: "001Wj00000ix7c2", name: "Nouryon", hadOpportunity: true },
        { id: "001Wj00000WYyKI", name: "Ramp", hadOpportunity: true },
        { id: "001Wj00000hzxnD", name: "Ro Healthcare", hadOpportunity: false },
        { id: "001Hp00003kIrMi", name: "Starbucks", hadOpportunity: false },
        { id: "001Wj00000o5G0v", name: "StockX", hadOpportunity: true },
        { id: "001Wj00000f3bWU", name: "TransUnion", hadOpportunity: true },
        { id: "001Wj00000oqRyc", name: "Walgreens Boots Alliance", hadOpportunity: true }
      ]
    },
    // MIKE AYRES (0 active + 1 prospect = 1 total)
    "mike.ayres@eudia.com": {
      email: "mike.ayres@eudia.com",
      name: "Mike Ayres",
      accounts: [
        { id: "001Wj00000synYD", name: "Barry Callebaut Group", hadOpportunity: false }
      ]
    },
    // MIKE MASIELLO (17 active + 9 prospect = 26 total)
    "mike@eudia.com": {
      email: "mike@eudia.com",
      name: "Mike Masiello",
      accounts: [
        { id: "001Wj00000celOy", name: "Arizona Gov Office", hadOpportunity: false },
        { id: "001Wj00000p1lCP", name: "Army Applications Lab", hadOpportunity: true },
        { id: "001Wj00000p1hYb", name: "Army Corps of Engineers", hadOpportunity: false },
        { id: "001Wj00000ZxEpD", name: "Army Futures Command", hadOpportunity: true },
        { id: "001Hp00003lhZrR", name: "DARPA", hadOpportunity: true },
        { id: "001Wj00000bWBlA", name: "Defense Innovation Unit (DIU)", hadOpportunity: true },
        { id: "001Hp00003kJzoR", name: "Gov - Civ", hadOpportunity: false },
        { id: "001Hp00003kJuJ5", name: "Gov - DOD", hadOpportunity: true },
        { id: "001Wj00000p1PVH", name: "IFC", hadOpportunity: true },
        { id: "001Wj00000UkYiC", name: "MITRE", hadOpportunity: false },
        { id: "001Wj00000VVJ31", name: "NATO", hadOpportunity: true },
        { id: "001Wj00000Ukxzt", name: "SIIA", hadOpportunity: false },
        { id: "001Wj00000p1Ybm", name: "SOCOM", hadOpportunity: true },
        { id: "001Wj00000Zwarp", name: "Second Front", hadOpportunity: false },
        { id: "001Hp00003lhcL9", name: "Social Security Administration", hadOpportunity: true },
        { id: "001Wj00000p1jH3", name: "State of Alaska", hadOpportunity: true },
        { id: "001Wj00000hVa6V", name: "State of Arizona", hadOpportunity: true },
        { id: "001Wj00000p0PcE", name: "State of California", hadOpportunity: true },
        { id: "001Wj00000bWBke", name: "U.S. Air Force", hadOpportunity: false },
        { id: "001Wj00000bWIzN", name: "U.S. Army", hadOpportunity: false },
        { id: "001Hp00003kIrDU", name: "U.S. Government", hadOpportunity: false },
        { id: "001Wj00000p1SRX", name: "U.S. Marine Corps", hadOpportunity: true },
        { id: "001Wj00000hfaDc", name: "U.S. Navy", hadOpportunity: true },
        { id: "001Wj00000Rrm5O", name: "UK Government", hadOpportunity: true },
        { id: "001Hp00003lieJP", name: "USDA", hadOpportunity: true },
        { id: "001Wj00000p1SuZ", name: "Vulcan Special Ops", hadOpportunity: true }
      ]
    },
    // MITCH LOQUACI (1 active + 2 prospect = 3 total)
    "mitch.loquaci@eudia.com": {
      email: "mitch.loquaci@eudia.com",
      name: "Mitch Loquaci",
      accounts: [
        { id: "001Hp00003kIrCn", name: "Home Depot", hadOpportunity: true },
        { id: "001Wj00000wlTbU", name: "Mimecast", hadOpportunity: false },
        { id: "001Wj00000cpxt0", name: "Novelis", hadOpportunity: false }
      ]
    },
    // NATHAN SHINE (12 active + 88 prospect = 100 total)
    "nathan.shine@eudia.com": {
      email: "nathan.shine@eudia.com",
      name: "Nathan Shine",
      accounts: [
        { id: "001Wj00000xy4hv", name: "ASDA Group", hadOpportunity: false },
        { id: "001Wj00000xz26A", name: "Achmea", hadOpportunity: false },
        { id: "001Wj00000xyb9C", name: "Adient", hadOpportunity: false },
        { id: "001Hp00003kIrEn", name: "Amphenol", hadOpportunity: true },
        { id: "001Wj00000mCFr3", name: "Ancestry", hadOpportunity: true },
        { id: "001Wj00000xxHhF", name: "Ashtead Group", hadOpportunity: false },
        { id: "001Wj00000mCFr5", name: "Boomi", hadOpportunity: false },
        { id: "001Wj00000mCFrQ", name: "CaliberAI", hadOpportunity: false },
        { id: "001Wj00000WiFP8", name: "Cantor Fitzgerald", hadOpportunity: false },
        { id: "001Wj00000mCFrj", name: "CarTrawler", hadOpportunity: true },
        { id: "001Wj00000xz2UM", name: "Carnival", hadOpportunity: false },
        { id: "001Wj00000pzTPd", name: "Circle K", hadOpportunity: false },
        { id: "001Wj00000xyP82", name: "Claas Group", hadOpportunity: false },
        { id: "001Wj00000bW3KA", name: "Cloud Software Group", hadOpportunity: false },
        { id: "001Wj00000mHDBo", name: "Coimisiun na Mean", hadOpportunity: false },
        { id: "001Wj00000mCFqt", name: "CommScope Technologies", hadOpportunity: false },
        { id: "001Wj00000xz2ZC", name: "Continental", hadOpportunity: false },
        { id: "001Wj00000Y6wFZ", name: "Coursera", hadOpportunity: false },
        { id: "001Wj00000xz3DV", name: "Credit Mutuel Group", hadOpportunity: false },
        { id: "001Wj00000Y6DDY", name: "Credit Suisse", hadOpportunity: false },
        { id: "001Wj00000pzTPZ", name: "CubeMatch", hadOpportunity: false },
        { id: "001Wj00000pzTPb", name: "Dawn Meats", hadOpportunity: false },
        { id: "001Wj00000xxtwB", name: "Deutsche Telekom", hadOpportunity: false },
        { id: "001Hp00003kIrDM", name: "Dropbox", hadOpportunity: false },
        { id: "001Wj00000mCFra", name: "Dunnes Stores", hadOpportunity: false },
        { id: "001Wj00000xxq75", name: "ELO Group", hadOpportunity: false },
        { id: "001Wj00000xyEnj", name: "Engie", hadOpportunity: false },
        { id: "001Wj00000mCFqu", name: "Fexco", hadOpportunity: false },
        { id: "001Wj00000mCFsA", name: "First Derivatives", hadOpportunity: false },
        { id: "001Wj00000mCFtD", name: "Flynn O'Driscoll, Business Lawyers", hadOpportunity: false },
        { id: "001Wj00000xyMmu", name: "Forvia", hadOpportunity: false },
        { id: "001Wj00000xz3Bt", name: "Freudenberg Group", hadOpportunity: false },
        { id: "001Wj00000mCFro", name: "GemCap", hadOpportunity: true },
        { id: "001Wj00000xxqjp", name: "Groupama", hadOpportunity: false },
        { id: "001Wj00000xyFdR", name: "Groupe Eiffage", hadOpportunity: false },
        { id: "001Wj00000xxtuZ", name: "Hays", hadOpportunity: false },
        { id: "001Wj00000xy4A2", name: "HelloFresh", hadOpportunity: false },
        { id: "001Wj00000mCFrq", name: "ID-Pal", hadOpportunity: false },
        { id: "001Wj00000xz3IL", name: "ING Group", hadOpportunity: false },
        { id: "001Wj00000xz2xN", name: "Inchcape", hadOpportunity: false },
        { id: "001Wj00000mCFs5", name: "Indeed", hadOpportunity: false },
        { id: "001Wj00000sooaT", name: "Ipsen", hadOpportunity: false },
        { id: "001Wj00000mCFss", name: "Irish League of Credit Unions", hadOpportunity: true },
        { id: "001Wj00000mCFrS", name: "Irish Life", hadOpportunity: false },
        { id: "001Wj00000mCFsV", name: "Irish Residential Properties REIT Plc", hadOpportunity: false },
        { id: "001Hp00003kIrJO", name: "Keurig Dr Pepper", hadOpportunity: true },
        { id: "001Wj00000hkk0z", name: "Kingspan", hadOpportunity: true },
        { id: "001Wj00000mCFrs", name: "Kitman Labs", hadOpportunity: false },
        { id: "001Wj00000xy1VZ", name: "LDC Group", hadOpportunity: false },
        { id: "001Wj00000mCFtF", name: "Let's Get Checked", hadOpportunity: false },
        { id: "001Hp00003kIrJo", name: "Liberty Insurance", hadOpportunity: false },
        { id: "001Wj00000xz2yz", name: "Marks and Spencer Group", hadOpportunity: false },
        { id: "001Wj00000mCFsM", name: "McDermott Creed & Martyn", hadOpportunity: false },
        { id: "001Hp00003kIrKF", name: "McKesson", hadOpportunity: false },
        { id: "001Wj00000mCFso", name: "Mediolanum", hadOpportunity: false },
        { id: "001Wj00000xyP9g", name: "Munich Re Group", hadOpportunity: false },
        { id: "001Wj00000xxIyF", name: "Nationwide Building Society", hadOpportunity: false },
        { id: "001Wj00000xxgZB", name: "Nebius Group", hadOpportunity: false },
        { id: "001Wj00000symlp", name: "Nestl\xE9 Health Science", hadOpportunity: false },
        { id: "001Wj00000xyYPq", name: "Nexans", hadOpportunity: false },
        { id: "001Wj00000xybvb", name: "Next", hadOpportunity: false },
        { id: "001Wj00000syczN", name: "Nomad Foods", hadOpportunity: false },
        { id: "001Wj00000mCFrF", name: "OKG Payments Services Limited", hadOpportunity: false },
        { id: "001Wj00000mCFqy", name: "Oneview Healthcare", hadOpportunity: false },
        { id: "001Wj00000aCGRB", name: "Optum", hadOpportunity: false },
        { id: "001Wj00000sylmX", name: "Orlen", hadOpportunity: false },
        { id: "001Wj00000mCFrL", name: "PROS", hadOpportunity: false },
        { id: "001Wj00000ZDPUI", name: "Perrigo Pharma", hadOpportunity: false },
        { id: "001Wj00000xz33p", name: "Phoenix Pharma", hadOpportunity: false },
        { id: "001Wj00000mCFqz", name: "Phoenix Tower International", hadOpportunity: true },
        { id: "001Wj00000pzTPf", name: "Pipedrive", hadOpportunity: false },
        { id: "001Wj00000mCFtS", name: "Poe Kiely Hogan Lanigan", hadOpportunity: true },
        { id: "001Wj00000xxwys", name: "REWE Group", hadOpportunity: false },
        { id: "001Wj00000xz3On", name: "Rexel", hadOpportunity: false },
        { id: "001Wj00000xyJLy", name: "Royal BAM Group", hadOpportunity: false },
        { id: "001Wj00000xysZq", name: "SPIE", hadOpportunity: false },
        { id: "001Wj00000xxuVg", name: "SSE", hadOpportunity: false },
        { id: "001Wj00000xxk1y", name: "Schaeffler", hadOpportunity: false },
        { id: "001Wj00000syeJe", name: "Schott Pharma", hadOpportunity: false },
        { id: "001Wj00000mCFrX", name: "South East Financial Services Cluster", hadOpportunity: false },
        { id: "001Wj00000mCFry", name: "Spectrum Wellness Holdings Limited", hadOpportunity: true },
        { id: "001Wj00000mCFsq", name: "Speed Fibre Group(enet)", hadOpportunity: true },
        { id: "001Wj00000mCFtH", name: "StepStone Group", hadOpportunity: false },
        { id: "001Hp00003kIrMp", name: "Stryker", hadOpportunity: false },
        { id: "001Wj00000pzTPa", name: "SuperNode Ltd", hadOpportunity: false },
        { id: "001Wj00000mCFtI", name: "Swish Fibre", hadOpportunity: false },
        { id: "001Wj00000SFiOv", name: "TikTok", hadOpportunity: false },
        { id: "001Wj00000ZDXTR", name: "Tinder LLC", hadOpportunity: false },
        { id: "001Wj00000mCFrC", name: "Tines Security Services Limited", hadOpportunity: false },
        { id: "001Wj00000xxQsc", name: "UDG Healthcare", hadOpportunity: false },
        { id: "001Wj00000pzTPe", name: "Udaras na Gaeltachta", hadOpportunity: false },
        { id: "001Wj00000bWBlE", name: "Udemy", hadOpportunity: false },
        { id: "001Wj00000Y6VMX", name: "Unilever", hadOpportunity: false },
        { id: "001Wj00000pzTPc", name: "Urban Volt", hadOpportunity: false },
        { id: "001Wj00000xwB2o", name: "Vitesco Technologies Group", hadOpportunity: false },
        { id: "001Hp00003liCZY", name: "Workday", hadOpportunity: false },
        { id: "001Wj00000xyOlT", name: "X5 Retail Group", hadOpportunity: false },
        { id: "001Wj00000xyXQZ", name: "Zalando", hadOpportunity: false },
        { id: "001Wj00000Y6VZ3", name: "Ziff Davis", hadOpportunity: false },
        { id: "001Wj00000mCFsZ", name: "Zurich Irish Life plc", hadOpportunity: true }
      ]
    },
    // NICOLA FRATINI (28 active + 110 prospect = 138 total)
    "nicola.fratini@eudia.com": {
      email: "nicola.fratini@eudia.com",
      name: "Nicola Fratini",
      accounts: [
        { id: "001Wj00000mCFqs", name: "AIB", hadOpportunity: false },
        { id: "001Wj00000tWwXp", name: "AXIS Capital", hadOpportunity: false },
        { id: "001Wj00000tWwXh", name: "Actavo Group Ltd", hadOpportunity: false },
        { id: "001Wj00000thuKE", name: "Aer Lingus", hadOpportunity: true },
        { id: "001Wj00000tWwXi", name: "Aer Rianta", hadOpportunity: false },
        { id: "001Wj00000mCFrG", name: "AerCap", hadOpportunity: true },
        { id: "001Wj00000YEMaB", name: "Aligned Incentives, a Bureau Veritas company", hadOpportunity: false },
        { id: "001Wj00000mCFs7", name: "Allied Irish Banks plc", hadOpportunity: false },
        { id: "001Wj00000mCFsb", name: "Amundi Ireland Limited", hadOpportunity: false },
        { id: "001Wj00000uZ7w2", name: "Anna Charles", hadOpportunity: false },
        { id: "001Wj00000TUdXw", name: "Anthropic", hadOpportunity: false },
        { id: "001Wj00000mCFrD", name: "Applegreen", hadOpportunity: false },
        { id: "001Wj00000wvc5a", name: "AppliedAI", hadOpportunity: true },
        { id: "001Wj00000socke", name: "Archer The Well Company", hadOpportunity: false },
        { id: "001Wj00000tWwXl", name: "Ardagh Glass Sales", hadOpportunity: false },
        { id: "001Wj00000sgB1h", name: "Autorek", hadOpportunity: false },
        { id: "001Wj00000mCFrh", name: "Avant Money", hadOpportunity: false },
        { id: "001Wj00000tWwXT", name: "Avantcard", hadOpportunity: false },
        { id: "001Wj00000mI7Na", name: "Aviva Insurance", hadOpportunity: true },
        { id: "001Wj00000tWwXo", name: "Avolon", hadOpportunity: false },
        { id: "001Wj00000uNUIB", name: "Bank of China", hadOpportunity: true },
        { id: "001Hp00003kJ9kN", name: "Barclays", hadOpportunity: true },
        { id: "001Wj00000ttPZB", name: "Barings", hadOpportunity: true },
        { id: "001Wj00000tWwXW", name: "Beauparc Group", hadOpportunity: true },
        { id: "001Wj00000xxRyK", name: "Bertelsmann", hadOpportunity: false },
        { id: "001Wj00000tWwXX", name: "Bidx1", hadOpportunity: false },
        { id: "001Wj00000soanc", name: "Borr Drilling", hadOpportunity: false },
        { id: "001Wj00000tWwXu", name: "Boylesports", hadOpportunity: false },
        { id: "001Wj00000uYz0o", name: "Bud Financial", hadOpportunity: false },
        { id: "001Wj00000tWwXv", name: "Bunzl", hadOpportunity: false },
        { id: "001Wj00000xxtGE", name: "Burelle", hadOpportunity: false },
        { id: "001Wj00000mCFr0", name: "CNP Santander Insurance Services Limited", hadOpportunity: true },
        { id: "001Wj00000tWwXw", name: "Cairn Homes", hadOpportunity: true },
        { id: "001Wj00000uZ2hp", name: "Centrica", hadOpportunity: false },
        { id: "001Wj00000uYYWv", name: "Checkout.com", hadOpportunity: false },
        { id: "001Wj00000Y64qg", name: "Christian Dior Couture", hadOpportunity: false },
        { id: "001Wj00000Y6VLh", name: "Citi", hadOpportunity: false },
        { id: "001Wj00000mCFrE", name: "Clanwilliam Group", hadOpportunity: true },
        { id: "001Wj00000tWwYl", name: "Clevercards", hadOpportunity: false },
        { id: "001Wj00000mCFsm", name: "Coca-Cola HBC Ireland Limited", hadOpportunity: false },
        { id: "001Wj00000xz30b", name: "Compagnie de l'Odet", hadOpportunity: false },
        { id: "001Wj00000xxtOM", name: "Credit Industriel & Commercial", hadOpportunity: false },
        { id: "001Wj00000uZ7RN", name: "Cuvva", hadOpportunity: false },
        { id: "001Wj00000tx2MQ", name: "CyberArk", hadOpportunity: true },
        { id: "001Wj00000tWwY1", name: "DAA", hadOpportunity: false },
        { id: "001Wj00000xyNnm", name: "DS Smith", hadOpportunity: false },
        { id: "001Wj00000hkk0s", name: "DSM", hadOpportunity: false },
        { id: "001Wj00000hfWMt", name: "Dassault Syst?mes", hadOpportunity: false },
        { id: "001Wj00000mCFsB", name: "Datalex", hadOpportunity: false },
        { id: "001Wj00000mCFrl", name: "Davy", hadOpportunity: false },
        { id: "001Wj00000tWwYm", name: "Deliveroo", hadOpportunity: false },
        { id: "001Wj00000w0uVV", name: "Doceree", hadOpportunity: true },
        { id: "001Wj00000vbvuX", name: "Dole plc", hadOpportunity: false },
        { id: "001Wj00000tWwXZ", name: "EVO Payments", hadOpportunity: false },
        { id: "001Wj00000xxsvH", name: "EXOR Group", hadOpportunity: false },
        { id: "001Wj00000tWwY4", name: "Easons", hadOpportunity: false },
        { id: "001Wj00000xz35R", name: "EasyJet", hadOpportunity: false },
        { id: "001Wj00000xx4SK", name: "Edeka Zentrale", hadOpportunity: false },
        { id: "001Wj00000uJwxo", name: "Eir", hadOpportunity: true },
        { id: "001Wj00000tWwY5", name: "Elavon", hadOpportunity: false },
        { id: "001Wj00000pzTPn", name: "Euronext Dublin", hadOpportunity: false },
        { id: "001Wj00000sg8Gc", name: "FARFETCH", hadOpportunity: true },
        { id: "001Wj00000mIEAX", name: "FNZ Group", hadOpportunity: true },
        { id: "001Wj00000tWwY7", name: "First Data", hadOpportunity: false },
        { id: "001Wj00000soigL", name: "Fresenius Kabi", hadOpportunity: false },
        { id: "001Wj00000xyXyQ", name: "FrieslandCampina", hadOpportunity: false },
        { id: "001Wj00000xyAP9", name: "GasTerra", hadOpportunity: false },
        { id: "001Wj00000mCFt1", name: "Goodbody Stockbrokers", hadOpportunity: false },
        { id: "001Wj00000soN5f", name: "Greencore", hadOpportunity: false },
        { id: "001Wj00000xyyli", name: "Groupe BPCE", hadOpportunity: false },
        { id: "001Wj00000xz9xF", name: "Haleon", hadOpportunity: false },
        { id: "001Wj00000xz3S2", name: "Hapag-Lloyd", hadOpportunity: false },
        { id: "001Wj00000tWwY9", name: "Henderson Group", hadOpportunity: false },
        { id: "001Wj00000Y6VMb", name: "Henkel", hadOpportunity: false },
        { id: "001Hp00003liHvf", name: "Hubspot", hadOpportunity: true },
        { id: "001Wj00000sg9MN", name: "INNIO Group", hadOpportunity: false },
        { id: "001Wj00000bzz9O", name: "IPG Mediabrands", hadOpportunity: true },
        { id: "001Wj00000tWwYA", name: "IPL Plastics", hadOpportunity: false },
        { id: "001Wj00000ZDXrd", name: "Intercom", hadOpportunity: false },
        { id: "001Wj00000tWwYB", name: "Ires Reit", hadOpportunity: false },
        { id: "001Wj00000xy2WS", name: "J. Sainsbury", hadOpportunity: false },
        { id: "001Wj00000xyG3B", name: "JD Sports Fashion", hadOpportunity: false },
        { id: "001Wj00000ullPp", name: "Jet2 Plc", hadOpportunity: true },
        { id: "001Wj00000xyIeR", name: "KION Group", hadOpportunity: false },
        { id: "001Wj00000tWwXb", name: "Keywords Studios", hadOpportunity: false },
        { id: "001Wj00000xxdOO", name: "Kingfisher", hadOpportunity: false },
        { id: "001Wj00000xy0o1", name: "Knorr-Bremse", hadOpportunity: false },
        { id: "001Wj00000xxuVi", name: "L'Oreal", hadOpportunity: false },
        { id: "001Wj00000xwh4I", name: "Landesbank Baden-Wurttemberg", hadOpportunity: false },
        { id: "001Wj00000au3sw", name: "Lenovo", hadOpportunity: true },
        { id: "001Wj00000sobq8", name: "MOL Magyarorsz\xE1g", hadOpportunity: false },
        { id: "001Wj00000xwrq3", name: "Michelin", hadOpportunity: false },
        { id: "001Wj00000xz3i9", name: "Mondi Group", hadOpportunity: false },
        { id: "001Wj00000xxaf3", name: "NatWest Group", hadOpportunity: false },
        { id: "001Wj00000xzFJV", name: "Norddeutsche Landesbank", hadOpportunity: false },
        { id: "001Hp00003kIrKm", name: "Northern Trust Management Services", hadOpportunity: false },
        { id: "001Wj00000bWIxi", name: "Novo Nordisk", hadOpportunity: false },
        { id: "001Wj00000TV1Wz", name: "OpenAi", hadOpportunity: false },
        { id: "001Wj00000tWwYh", name: "Origin Enterprises", hadOpportunity: false },
        { id: "001Wj00000xz3dJ", name: "Otto", hadOpportunity: false },
        { id: "001Wj00000tWwYs", name: "Panda Waste", hadOpportunity: false },
        { id: "001Wj00000tWwYJ", name: "Paysafe", hadOpportunity: false },
        { id: "001Wj00000souuM", name: "Premier Foods", hadOpportunity: false },
        { id: "001Wj00000xyzrT", name: "RWE", hadOpportunity: false },
        { id: "001Wj00000u0eJp", name: "Re-Turn", hadOpportunity: true },
        { id: "001Wj00000xyAdg", name: "SGAM La Mondiale", hadOpportunity: false },
        { id: "001Wj00000sg2T0", name: "SHEIN", hadOpportunity: true },
        { id: "001Wj00000hfaEC", name: "Safran", hadOpportunity: false },
        { id: "001Wj00000sonmQ", name: "Sandoz", hadOpportunity: false },
        { id: "001Wj00000xz9ik", name: "Savencia", hadOpportunity: false },
        { id: "001Wj00000xyGKs", name: "Sodexo", hadOpportunity: false },
        { id: "001Wj00000c9oD6", name: "Stripe", hadOpportunity: false },
        { id: "001Hp00003kKrS0", name: "Sword Health", hadOpportunity: true },
        { id: "001Wj00000soZus", name: "Tate & Lyle", hadOpportunity: false },
        { id: "001Wj00000mEEkG", name: "Team Car Care dba Jiffy Lube", hadOpportunity: true },
        { id: "001Hp00003kIrN0", name: "Teleperformance", hadOpportunity: false },
        { id: "001Wj00000vzG8f", name: "Temu", hadOpportunity: false },
        { id: "001Wj00000xy9fz", name: "Tennet Holding", hadOpportunity: false },
        { id: "001Wj00000tWwXf", name: "The Est\xE9e Lauder Companies Inc.", hadOpportunity: false },
        { id: "001Wj00000Y6DDc", name: "The HEINEKEN Company", hadOpportunity: false },
        { id: "001Wj00000tWwYV", name: "The Irish Stock Exchange", hadOpportunity: false },
        { id: "001Wj00000xxp7o", name: "Thuga Holding", hadOpportunity: false },
        { id: "001Wj00000xyBgC", name: "ThyssenKrupp", hadOpportunity: false },
        { id: "001Wj00000tWwYW", name: "Total Produce plc", hadOpportunity: false },
        { id: "001Wj00000xxxLU", name: "TotalEnergies", hadOpportunity: false },
        { id: "001Wj00000mIBpN", name: "Transworld Business Advisors", hadOpportunity: false },
        { id: "001Wj00000mCFs1", name: "Twitter", hadOpportunity: false },
        { id: "001Wj00000xV8Vg", name: "UNHCR, the UN Refugee Agency", hadOpportunity: true },
        { id: "001Wj00000xxo5I", name: "United Internet", hadOpportunity: false },
        { id: "001Wj00000bWIzw", name: "Veolia | Water Tech", hadOpportunity: false },
        { id: "001Hp00003kIrDA", name: "Verizon", hadOpportunity: false },
        { id: "001Wj00000tWwXd", name: "Virgin Media Ireland Limited", hadOpportunity: false },
        { id: "001Wj00000sgaj9", name: "Volkswagon", hadOpportunity: true },
        { id: "001Wj00000ZDTG9", name: "Waystone", hadOpportunity: false },
        { id: "001Wj00000pB5DX", name: "White Swan Data", hadOpportunity: true },
        { id: "001Wj00000xwL2A", name: "Wm. Morrison Supermarkets", hadOpportunity: false },
        { id: "001Wj00000mIB6E", name: "Zendesk", hadOpportunity: true },
        { id: "001Wj00000S4r49", name: "Zoom", hadOpportunity: false }
      ]
    },
    // OLIVIA JUNG (20 active + 71 prospect = 91 total)
    "olivia.jung@eudia.com": {
      email: "olivia.jung@eudia.com",
      name: "Olivia Jung",
      accounts: [
        { id: "001Hp00003kIrED", name: "3M", hadOpportunity: false },
        { id: "001Hp00003kIrEK", name: "ADP", hadOpportunity: false },
        { id: "001Hp00003kIrEO", name: "AES", hadOpportunity: false },
        { id: "001Hp00003kIrEG", name: "AbbVie", hadOpportunity: false },
        { id: "001Wj00000mCFrd", name: "Airship Group Inc", hadOpportunity: false },
        { id: "001Hp00003kIrET", name: "Albemarle", hadOpportunity: false },
        { id: "001Hp00003kIrEZ", name: "Ally Financial", hadOpportunity: false },
        { id: "001Hp00003kIrEc", name: "Altria Group", hadOpportunity: false },
        { id: "001Hp00003kIrEf", name: "Ameren", hadOpportunity: false },
        { id: "001Hp00003kIrEi", name: "American Family Insurance Group", hadOpportunity: false },
        { id: "001Wj00000YIOI1", name: "Aptiv", hadOpportunity: false },
        { id: "001Hp00003kIrFA", name: "Astellas", hadOpportunity: true },
        { id: "001Hp00003kIrFD", name: "Autoliv", hadOpportunity: false },
        { id: "001Hp00003kIrDJ", name: "Avery Dennison", hadOpportunity: false },
        { id: "001Hp00003kIrDG", name: "Bain", hadOpportunity: true },
        { id: "001Hp00003kIrFL", name: "Bank of America", hadOpportunity: true },
        { id: "001Hp00003kIrFN", name: "Bath & Body Works", hadOpportunity: false },
        { id: "001Hp00003kIrFQ", name: "Becton Dickinson", hadOpportunity: false },
        { id: "001Hp00003kIrFV", name: "Best Buy", hadOpportunity: false },
        { id: "001Hp00003kIrDY", name: "Blackstone", hadOpportunity: false },
        { id: "001Hp00003kIrFb", name: "Boeing", hadOpportunity: false },
        { id: "001Hp00003kIrFf", name: "BorgWarner", hadOpportunity: false },
        { id: "001Hp00003kIrFk", name: "Bristol-Myers Squibb", hadOpportunity: true },
        { id: "001Hp00003kIrFo", name: "Burlington Stores", hadOpportunity: false },
        { id: "001Wj00000Y6VLn", name: "CHANEL", hadOpportunity: false },
        { id: "001Hp00003kIrGK", name: "CHS", hadOpportunity: false },
        { id: "001Hp00003kJ9kw", name: "CSL", hadOpportunity: true },
        { id: "001Hp00003kIrGq", name: "CVS Health", hadOpportunity: false },
        { id: "001Hp00003kIrG7", name: "Cencora (formerly AmerisourceBergen)", hadOpportunity: false },
        { id: "001Hp00003kIrGE", name: "Charter Communications", hadOpportunity: true },
        { id: "001Hp00003kIrDZ", name: "Ciena", hadOpportunity: false },
        { id: "001Hp00003kIrGL", name: "Cintas", hadOpportunity: false },
        { id: "001Wj00000c6df9", name: "Clear", hadOpportunity: false },
        { id: "001Wj00000eLOI4", name: "Cleveland Clinic", hadOpportunity: false },
        { id: "001Hp00003kIrGO", name: "Cleveland-Cliffs", hadOpportunity: false },
        { id: "001Hp00003kIrGQ", name: "Coca-Cola", hadOpportunity: false },
        { id: "001Hp00003kIrGX", name: "Conagra Brands", hadOpportunity: false },
        { id: "001Hp00003kIrGZ", name: "Consolidated Edison", hadOpportunity: true },
        { id: "001Wj00000jK5Hl", name: "Crate & Barrel", hadOpportunity: true },
        { id: "001Hp00003kIrGo", name: "Cummins", hadOpportunity: true },
        { id: "001Hp00003kIrGu", name: "Danaher", hadOpportunity: false },
        { id: "001Wj00000bzz9R", name: "Datadog", hadOpportunity: true },
        { id: "001Wj00000aZvt9", name: "Dolby", hadOpportunity: false },
        { id: "001Hp00003kIrHB", name: "Dominion Energy", hadOpportunity: false },
        { id: "001Hp00003kIrHE", name: "Dow", hadOpportunity: false },
        { id: "001Hp00003kIrHH", name: "Duke Energy", hadOpportunity: false },
        { id: "001Wj00000hkk0j", name: "Etsy", hadOpportunity: false },
        { id: "001Hp00003kIrI7", name: "Ford", hadOpportunity: false },
        { id: "001Hp00003kIrIL", name: "General Dynamics", hadOpportunity: false },
        { id: "001Wj00000ScUQ3", name: "General Electric", hadOpportunity: false },
        { id: "001Hp00003kIrIN", name: "General Motors", hadOpportunity: false },
        { id: "001Hp00003kIrIS", name: "Gilead Sciences", hadOpportunity: false },
        { id: "001Hp00003kIrE8", name: "Graybar Electric", hadOpportunity: false },
        { id: "001Hp00003kIrDO", name: "Guardian Life Ins", hadOpportunity: false },
        { id: "001Wj00000dvgdb", name: "HealthEquity", hadOpportunity: true },
        { id: "001Hp00003kIrJ9", name: "Intuit", hadOpportunity: false },
        { id: "001Wj00000aLlyV", name: "J.Crew", hadOpportunity: true },
        { id: "001Hp00003kKKMc", name: "JPmorganchase", hadOpportunity: false },
        { id: "001Hp00003kIrJI", name: "John Deere", hadOpportunity: false },
        { id: "001Hp00003kIrDQ", name: "Jones Lang LaSalle", hadOpportunity: true },
        { id: "001Wj00000hfaE1", name: "Lowe", hadOpportunity: false },
        { id: "001Hp00003kIrDj", name: "Marsh McLennan", hadOpportunity: true },
        { id: "001Hp00003kIrEA", name: "Mastercard", hadOpportunity: false },
        { id: "001Wj00000QBapC", name: "Mayo Clinic", hadOpportunity: false },
        { id: "001Hp00003kIrD7", name: "McDonald's", hadOpportunity: false },
        { id: "001Hp00003kIrD8", name: "Medtronic", hadOpportunity: false },
        { id: "001Hp00003kIrKK", name: "Merck", hadOpportunity: true },
        { id: "001Hp00003kJ9lG", name: "Meta", hadOpportunity: false },
        { id: "001Hp00003kIrKS", name: "Mondelez International", hadOpportunity: true },
        { id: "001Hp00003kIrKU", name: "Motorola Solutions", hadOpportunity: false },
        { id: "001Wj00000Y6VYj", name: "NBCUniversal", hadOpportunity: false },
        { id: "001Wj00000j3QN2", name: "Nasdaq Private Market", hadOpportunity: false },
        { id: "001Hp00003kIrCq", name: "Nationwide Insurance", hadOpportunity: false },
        { id: "001Wj00000Y6VML", name: "Nestle", hadOpportunity: false },
        { id: "001Hp00003kIrLF", name: "Paramount", hadOpportunity: false },
        { id: "001Hp00003kIrLO", name: "Pfizer", hadOpportunity: false },
        { id: "001Wj00000wzgaP", name: "Philip Morris International", hadOpportunity: false },
        { id: "001Hp00003kIrLa", name: "Prudential", hadOpportunity: false },
        { id: "001Hp00003kIrLp", name: "Raytheon Technologies", hadOpportunity: false },
        { id: "001Hp00003kIrDz", name: "Shopify", hadOpportunity: true },
        { id: "001Wj00000eLWPF", name: "Stellantis", hadOpportunity: false },
        { id: "001Wj00000iS9AJ", name: "TE Connectivity", hadOpportunity: false },
        { id: "001Hp00003kIrMx", name: "Target", hadOpportunity: false },
        { id: "001Wj00000PjGDa", name: "The Weir Group PLC", hadOpportunity: false },
        { id: "001Hp00003kIrDF", name: "Thermo Fisher Scientific", hadOpportunity: false },
        { id: "001Hp00003kIrCw", name: "Toshiba US", hadOpportunity: true },
        { id: "001Hp00003kIrNb", name: "Unisys", hadOpportunity: false },
        { id: "001Hp00003kIrO7", name: "Wells Fargo", hadOpportunity: false },
        { id: "001Wj00000kD7MA", name: "Wellspan Health", hadOpportunity: true },
        { id: "001Hp00003kIrOA", name: "Western Digital", hadOpportunity: false },
        { id: "001Wj00000kD3s1", name: "White Cap", hadOpportunity: true }
      ]
    },
    // RAJEEV PATEL (1 active + 6 prospect = 7 total)
    "rajeev.patel@eudia.com": {
      email: "rajeev.patel@eudia.com",
      name: "Rajeev Patel",
      accounts: [
        { id: "001Wj00000fFW35", name: "Alnylam Pharmaceuticals", hadOpportunity: true },
        { id: "001Wj00000woNmQ", name: "Beiersdorf", hadOpportunity: false },
        { id: "001Wj00000vCOx2", name: "Cambridge Associates", hadOpportunity: false },
        { id: "001Wj00000wE56T", name: "Care Vet Health", hadOpportunity: false },
        { id: "001Wj00000dIjyB", name: "CareVet, LLC", hadOpportunity: false },
        { id: "001Wj00000xZEkY", name: "Modern Treasury", hadOpportunity: false },
        { id: "001Wj00000vv2vX", name: "Nextdoor", hadOpportunity: false }
      ]
    },
    // RILEY STACK (1 active + 1 prospect = 2 total)
    "riley.stack@eudia.com": {
      email: "riley.stack@eudia.com",
      name: "Riley Stack",
      accounts: [
        { id: "001Wj00000XiEDy", name: "Coinbase", hadOpportunity: true },
        { id: "001Wj00000YEMa8", name: "Turing", hadOpportunity: false }
      ]
    },
    // SEAN BOYD (0 active + 1 prospect = 1 total)
    "sean.boyd@eudia.com": {
      email: "sean.boyd@eudia.com",
      name: "Sean Boyd",
      accounts: [
        { id: "001Hp00003kIrE9", name: "IQVIA", hadOpportunity: false }
      ]
    },
    // TOM CLANCY (8 active + 74 prospect = 82 total)
    "tom.clancy@eudia.com": {
      email: "tom.clancy@eudia.com",
      name: "Tom Clancy",
      accounts: [
        { id: "001Wj00000pB30V", name: "AIR (Advanced Inhalation Rituals)", hadOpportunity: true },
        { id: "001Wj00000qLRqW", name: "ASML", hadOpportunity: true },
        { id: "001Wj00000xyA0y", name: "Aegon", hadOpportunity: false },
        { id: "001Wj00000xxpcR", name: "Air France-KLM Group", hadOpportunity: false },
        { id: "001Wj00000xyIg2", name: "Akzo Nobel", hadOpportunity: false },
        { id: "001Wj00000qFynV", name: "Alexion Pharmaceuticals", hadOpportunity: false },
        { id: "001Wj00000xwuUW", name: "Alstom", hadOpportunity: false },
        { id: "001Wj00000xxtL6", name: "Anglo American", hadOpportunity: false },
        { id: "001Wj00000syHJt", name: "Aryzta", hadOpportunity: false },
        { id: "001Wj00000tWwXq", name: "BAM Ireland", hadOpportunity: false },
        { id: "001Wj00000c9oCe", name: "BLDG Management Co., Inc.", hadOpportunity: true },
        { id: "001Wj00000hfWN1", name: "Balfour Beatty US", hadOpportunity: false },
        { id: "001Wj00000fFuFM", name: "Bank of Ireland", hadOpportunity: false },
        { id: "001Wj00000xy23Q", name: "Bayerische Landesbank", hadOpportunity: false },
        { id: "001Wj00000tWwXt", name: "Boots", hadOpportunity: false },
        { id: "001Wj00000xyIOL", name: "Ceconomy", hadOpportunity: false },
        { id: "001Wj00000tWwXx", name: "Chanelle Pharma", hadOpportunity: false },
        { id: "001Hp00003kIrD3", name: "Cisco Systems", hadOpportunity: true },
        { id: "001Wj00000xyqxq", name: "Computacenter", hadOpportunity: false },
        { id: "001Wj00000xy0ss", name: "Constellium", hadOpportunity: false },
        { id: "001Wj00000Y6Vk0", name: "Credit Agricole CIB", hadOpportunity: false },
        { id: "001Wj00000xwf7G", name: "Daimler Truck Holding", hadOpportunity: false },
        { id: "001Wj00000xyaWU", name: "Delivery Hero", hadOpportunity: false },
        { id: "001Wj00000mCFsz", name: "Electricity Supply Board", hadOpportunity: false },
        { id: "001Wj00000sp0Bl", name: "Ensco PLC", hadOpportunity: false },
        { id: "001Wj00000xz374", name: "EssilorLuxottica", hadOpportunity: false },
        { id: "001Wj00000hfaDT", name: "Experian", hadOpportunity: false },
        { id: "001Wj00000tWwY6", name: "Fineos", hadOpportunity: false },
        { id: "001Wj00000mCFsd", name: "Fujitsu", hadOpportunity: false },
        { id: "001Wj00000mCFrc", name: "Glanbia", hadOpportunity: false },
        { id: "001Wj00000mHuzr", name: "IHRB", hadOpportunity: false },
        { id: "001Wj00000xy9Ho", name: "Imperial Brands", hadOpportunity: false },
        { id: "001Wj00000sp1nl", name: "Ina Groupa", hadOpportunity: false },
        { id: "001Wj00000xz3ev", name: "Infineon", hadOpportunity: false },
        { id: "001Wj00000xyMzn", name: "JDE Peet's", hadOpportunity: false },
        { id: "001Wj00000hfWN2", name: "Jazz Pharmaceuticals", hadOpportunity: false },
        { id: "001Wj00000soxsD", name: "Jazz Pharmaceuticals", hadOpportunity: false },
        { id: "001Wj00000xxtcq", name: "John Lewis Partnership", hadOpportunity: false },
        { id: "001Wj00000tWwYo", name: "Just Eat", hadOpportunity: false },
        { id: "001Wj00000xz3jl", name: "KfW Group", hadOpportunity: false },
        { id: "001Wj00000tWwYD", name: "Ladbrokes", hadOpportunity: false },
        { id: "001Wj00000xystC", name: "Lanxess Group", hadOpportunity: false },
        { id: "001Wj00000vRNFu", name: "Legal & General", hadOpportunity: false },
        { id: "001Wj00000xxgZC", name: "Legrand", hadOpportunity: false },
        { id: "001Wj00000Y64qm", name: "Louis Dreyfus Company", hadOpportunity: false },
        { id: "001Wj00000xyGRQ", name: "Lufthansa Group", hadOpportunity: false },
        { id: "001Wj00000pA6d7", name: "Masdar Future Energy Company", hadOpportunity: true },
        { id: "001Wj00000xz0xC", name: "Metro", hadOpportunity: false },
        { id: "001Wj00000xzAen", name: "Motability Operations Group", hadOpportunity: false },
        { id: "001Wj00000mCFrv", name: "Ornua", hadOpportunity: false },
        { id: "001Hp00003kIrLK", name: "Pepsi", hadOpportunity: false },
        { id: "001Wj00000qFudS", name: "Pluralsight", hadOpportunity: false },
        { id: "001Wj00000xyODc", name: "Puma", hadOpportunity: false },
        { id: "001Wj00000iC14Z", name: "RELX", hadOpportunity: false },
        { id: "001Wj00000tWwYj", name: "Rabobank", hadOpportunity: false },
        { id: "001Wj00000xyU9M", name: "Reckitt Benckiser", hadOpportunity: false },
        { id: "001Wj00000xz3bh", name: "Rentokil Initial", hadOpportunity: false },
        { id: "001Wj00000sp1hL", name: "SBM Offshore", hadOpportunity: false },
        { id: "001Wj00000xybkK", name: "SHV Holdings", hadOpportunity: false },
        { id: "001Wj00000xz3gX", name: "SNCF Group", hadOpportunity: false },
        { id: "001Wj00000tWwYt", name: "Sage", hadOpportunity: false },
        { id: "001Wj00000sGEuO", name: "Sanofi", hadOpportunity: false },
        { id: "001Wj00000qL7AG", name: "Seismic", hadOpportunity: true },
        { id: "001Wj00000soyhp", name: "Stada Group", hadOpportunity: false },
        { id: "001Wj00000xytSg", name: "Standard Chartered", hadOpportunity: false },
        { id: "001Wj00000tWwYq", name: "Symantec", hadOpportunity: false },
        { id: "001Wj00000pAPW2", name: "Tarmac", hadOpportunity: true },
        { id: "001Wj00000xxvA1", name: "Technip Energies", hadOpportunity: false },
        { id: "001Wj00000tWwYU", name: "Tegral Building Products", hadOpportunity: false },
        { id: "001Wj00000fFuFq", name: "The Boots Group", hadOpportunity: false },
        { id: "001Wj00000tWwYk", name: "Three", hadOpportunity: false },
        { id: "001Wj00000xy5HP", name: "Trane Technologies", hadOpportunity: false },
        { id: "001Wj00000sohCP", name: "Trans Ocean", hadOpportunity: false },
        { id: "001Wj00000mCFtO", name: "Uisce Eireann (Irish Water)", hadOpportunity: false },
        { id: "001Wj00000xyQ5k", name: "Uniper", hadOpportunity: false },
        { id: "001Wj00000xz1GY", name: "Valeo", hadOpportunity: false },
        { id: "001Wj00000pBibT", name: "Version1", hadOpportunity: false },
        { id: "001Wj00000xy2BT", name: "Vivendi", hadOpportunity: false },
        { id: "001Wj00000xyulK", name: "Wacker Chemie", hadOpportunity: false },
        { id: "001Wj00000tWwYZ", name: "Wyeth Nutritionals Ireland", hadOpportunity: false },
        { id: "001Wj00000mI9qo", name: "XACT Data Discovery", hadOpportunity: true },
        { id: "001Wj00000xyq3P", name: "ZF Friedrichshafen", hadOpportunity: false }
      ]
    }
  }
};
var AccountOwnershipService = class {
  constructor(serverUrl) {
    this.cachedData = null;
    this.serverUrl = serverUrl;
  }
  /**
   * Get accounts owned by a specific user (active accounts only for backward compat)
   * Tries server first (live Salesforce data), falls back to static data
   */
  async getAccountsForUser(email) {
    const result = await this.getAccountsWithProspects(email);
    return result.accounts;
  }
  /**
   * Get both active AND prospect accounts for a user.
   * Returns { accounts: active[], prospects: prospect[] }
   */
  async getAccountsWithProspects(email) {
    const normalizedEmail = email.toLowerCase().trim();
    const serverResult = await this.fetchFromServerWithProspects(normalizedEmail);
    if (serverResult && (serverResult.accounts.length > 0 || serverResult.prospects.length > 0)) {
      console.log(`[AccountOwnership] Got ${serverResult.accounts.length} active + ${serverResult.prospects.length} prospects from server for ${normalizedEmail}`);
      return serverResult;
    }
    console.log(`[AccountOwnership] Using static data fallback for ${normalizedEmail}`);
    const staticAccounts = this.getAccountsFromStatic(normalizedEmail);
    const accounts = staticAccounts.filter((a) => a.hadOpportunity !== false);
    const prospects = staticAccounts.filter((a) => a.hadOpportunity === false);
    return { accounts, prospects };
  }
  /**
   * Get accounts from static mapping (offline fallback)
   * For sales leaders, aggregates accounts from all direct reports
   */
  getAccountsFromStatic(email) {
    const userGroup = getUserGroup(email);
    if (userGroup === "sales_leader") {
      const directReports = getSalesLeaderDirectReports(email);
      if (directReports.length === 0) {
        console.log(`[AccountOwnership] No direct reports found for sales leader: ${email}`);
        return [];
      }
      const allAccounts = /* @__PURE__ */ new Map();
      for (const reportEmail of directReports) {
        const reportLead = OWNERSHIP_DATA.businessLeads[reportEmail];
        if (reportLead) {
          for (const acc of reportLead.accounts) {
            if (!allAccounts.has(acc.id)) {
              allAccounts.set(acc.id, { ...acc, isOwned: false });
            }
          }
        }
      }
      const accounts = Array.from(allAccounts.values()).sort(
        (a, b) => a.name.localeCompare(b.name)
      );
      console.log(`[AccountOwnership] Found ${accounts.length} static accounts for sales leader ${email} (from ${directReports.length} direct reports)`);
      return accounts;
    }
    const lead = OWNERSHIP_DATA.businessLeads[email];
    const ownedAccounts = lead ? lead.accounts.map((a) => ({ ...a, isOwned: true })) : [];
    const podRegion = POD_VIEW_USERS[email];
    if (podRegion) {
      const regionBLs = getRegionBLEmails(podRegion);
      const ownedIds = new Set(ownedAccounts.map((a) => a.id));
      for (const blEmail of regionBLs) {
        const blLead = OWNERSHIP_DATA.businessLeads[blEmail];
        if (blLead) {
          for (const acc of blLead.accounts) {
            if (!ownedIds.has(acc.id)) {
              ownedAccounts.push({ ...acc, isOwned: false });
              ownedIds.add(acc.id);
            }
          }
        }
      }
      const sorted = ownedAccounts.sort((a, b) => a.name.localeCompare(b.name));
      console.log(`[AccountOwnership] Pod-view user ${email} (${podRegion}): ${sorted.length} static accounts (${lead?.accounts.length || 0} owned + region)`);
      return sorted;
    }
    if (!lead) {
      console.log(`[AccountOwnership] No static mapping found for: ${email}`);
      return [];
    }
    console.log(`[AccountOwnership] Found ${lead.accounts.length} static accounts for ${email} (own accounts only)`);
    return lead.accounts;
  }
  /**
   * Fetch account ownership from server (live Salesforce data) -- active accounts only
   * This is now the PRIMARY source - static data is fallback
   */
  async fetchFromServer(email) {
    const result = await this.fetchFromServerWithProspects(email);
    return result ? result.accounts : null;
  }
  /**
   * Fetch both active and prospect accounts from server
   */
  async fetchFromServerWithProspects(email) {
    try {
      const { requestUrl: requestUrl4 } = await import("obsidian");
      const response = await requestUrl4({
        url: `${this.serverUrl}/api/accounts/ownership/${encodeURIComponent(email)}`,
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (response.json?.success) {
        const mapAccount = (acc) => ({
          id: acc.id,
          name: acc.name,
          type: acc.type || "Prospect",
          hadOpportunity: acc.hadOpportunity ?? true,
          website: acc.website || void 0,
          industry: acc.industry || void 0
        });
        const accounts = (response.json.accounts || []).map(mapAccount);
        const prospects = (response.json.prospectAccounts || []).map(mapAccount);
        return { accounts, prospects };
      }
      return null;
    } catch (error) {
      console.log("[AccountOwnership] Server fetch failed, will use static data:", error);
      return null;
    }
  }
  /**
   * Check for new accounts that don't have folders yet
   * Returns accounts that exist in ownership but not in the provided folder list
   */
  async getNewAccounts(email, existingFolderNames) {
    const allAccounts = await this.getAccountsForUser(email);
    const normalizedFolders = existingFolderNames.map((f) => f.toLowerCase().trim());
    return allAccounts.filter((account) => {
      const normalizedAccountName = account.name.toLowerCase().trim();
      return !normalizedFolders.some(
        (folder) => folder === normalizedAccountName || folder.startsWith(normalizedAccountName) || normalizedAccountName.startsWith(folder)
      );
    });
  }
  /**
   * Find the sales leader a BL reports to (reverse-lookup of direct reports)
   */
  findTeamLeader(email) {
    const normalized = email.toLowerCase().trim();
    for (const [leaderEmail, reports] of Object.entries(SALES_LEADER_DIRECT_REPORTS)) {
      if (reports.includes(normalized)) {
        return leaderEmail;
      }
    }
    return null;
  }
  /**
   * Check if a user exists in the ownership mapping
   */
  hasUser(email) {
    const normalizedEmail = email.toLowerCase().trim();
    return normalizedEmail in OWNERSHIP_DATA.businessLeads;
  }
  /**
   * Get all registered business leads
   */
  getAllBusinessLeads() {
    return Object.keys(OWNERSHIP_DATA.businessLeads);
  }
  /**
   * Get business lead info by email
   */
  getBusinessLead(email) {
    const normalizedEmail = email.toLowerCase().trim();
    return OWNERSHIP_DATA.businessLeads[normalizedEmail] || null;
  }
  /**
   * Get the version of the ownership data
   */
  getDataVersion() {
    return OWNERSHIP_DATA.version;
  }
  /**
   * Get ALL accounts for admin users
   * Returns all accounts with isOwned flag to distinguish owned vs view-only
   */
  async getAllAccountsForAdmin(adminEmail) {
    const normalizedEmail = adminEmail.toLowerCase().trim();
    if (!isAdminUser(normalizedEmail)) {
      console.log(`[AccountOwnership] ${normalizedEmail} is not an admin, returning owned accounts only`);
      return this.getAccountsForUser(normalizedEmail);
    }
    const serverAccounts = await this.fetchAllAccountsFromServer();
    if (serverAccounts && serverAccounts.length > 0) {
      const ownedAccounts = await this.getAccountsForUser(normalizedEmail);
      const ownedIds = new Set(ownedAccounts.map((a) => a.id));
      return serverAccounts.map((acc) => ({
        ...acc,
        isOwned: ownedIds.has(acc.id)
      }));
    }
    console.log(`[AccountOwnership] Using static data fallback for admin all-accounts`);
    return this.getAllAccountsFromStatic(normalizedEmail);
  }
  /**
   * Get all accounts from static mapping for admins
   */
  getAllAccountsFromStatic(adminEmail) {
    const allAccounts = /* @__PURE__ */ new Map();
    const ownedIds = /* @__PURE__ */ new Set();
    const adminLead = OWNERSHIP_DATA.businessLeads[adminEmail];
    if (adminLead) {
      for (const acc of adminLead.accounts) {
        ownedIds.add(acc.id);
        allAccounts.set(acc.id, { ...acc, isOwned: true });
      }
    }
    for (const lead of Object.values(OWNERSHIP_DATA.businessLeads)) {
      for (const acc of lead.accounts) {
        if (!allAccounts.has(acc.id)) {
          allAccounts.set(acc.id, { ...acc, isOwned: false });
        }
      }
    }
    return Array.from(allAccounts.values()).sort(
      (a, b) => a.name.localeCompare(b.name)
    );
  }
  /**
   * Fetch ALL accounts from server (for admin users)
   */
  async fetchAllAccountsFromServer() {
    try {
      const { requestUrl: requestUrl4 } = await import("obsidian");
      const response = await requestUrl4({
        url: `${this.serverUrl}/api/accounts/all`,
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (response.json?.success && response.json?.accounts) {
        return response.json.accounts.map((acc) => ({
          id: acc.id,
          name: acc.name,
          type: acc.type || "Prospect"
        }));
      }
      return null;
    } catch (error) {
      console.log("[AccountOwnership] Server fetch all accounts failed:", error);
      return null;
    }
  }
};

// main.ts
var TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Dublin", label: "Dublin (GMT/IST)" },
  { value: "Europe/Paris", label: "Central Europe (CET)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "UTC", label: "UTC" }
];
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
  salesforceConnected: false,
  accountsImported: false,
  importedAccountCount: 0,
  timezone: "America/New_York",
  lastAccountRefreshDate: null,
  archiveRemovedAccounts: true,
  syncAccountsOnStartup: true
};
var CALENDAR_VIEW_TYPE = "eudia-calendar-view";
var SETUP_VIEW_TYPE = "eudia-setup-view";
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
    this.waveformBars = [];
    this.durationEl = null;
    this.waveformData = new Array(16).fill(0);
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
    const recordingDot = document.createElement("div");
    recordingDot.className = "eudia-recording-dot";
    this.containerEl.appendChild(recordingDot);
    const waveformContainer = document.createElement("div");
    waveformContainer.className = "eudia-waveform";
    this.waveformBars = [];
    for (let i = 0; i < 16; i++) {
      const bar = document.createElement("div");
      bar.className = "eudia-waveform-bar";
      bar.style.height = "2px";
      waveformContainer.appendChild(bar);
      this.waveformBars.push(bar);
    }
    this.containerEl.appendChild(waveformContainer);
    this.durationEl = document.createElement("div");
    this.durationEl.className = "eudia-duration";
    this.durationEl.textContent = "0:00";
    this.containerEl.appendChild(this.durationEl);
    const controls = document.createElement("div");
    controls.className = "eudia-controls-minimal";
    const stopBtn = document.createElement("button");
    stopBtn.className = "eudia-control-btn stop";
    stopBtn.innerHTML = '<span class="eudia-stop-icon"></span>';
    stopBtn.title = "Stop and summarize";
    stopBtn.onclick = () => this.onStop();
    controls.appendChild(stopBtn);
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "eudia-control-btn cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = () => this.onCancel();
    controls.appendChild(cancelBtn);
    this.containerEl.appendChild(controls);
    document.body.appendChild(this.containerEl);
  }
  hide() {
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
      this.waveformBars = [];
      this.durationEl = null;
    }
  }
  updateState(state) {
    if (!this.containerEl)
      return;
    this.waveformData.shift();
    this.waveformData.push(state.audioLevel);
    this.waveformBars.forEach((bar, i) => {
      const level = this.waveformData[i] || 0;
      const height = Math.max(2, Math.min(24, level * 0.24));
      bar.style.height = `${height}px`;
    });
    if (this.durationEl) {
      const mins = Math.floor(state.duration / 60);
      const secs = Math.floor(state.duration % 60);
      this.durationEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
    }
    this.containerEl.className = state.isPaused ? "eudia-transcription-bar paused" : "eudia-transcription-bar active";
  }
  showProcessing() {
    if (!this.containerEl)
      return;
    this.containerEl.innerHTML = "";
    this.containerEl.className = "eudia-transcription-bar processing";
    const spinner = document.createElement("div");
    spinner.className = "eudia-processing-spinner";
    this.containerEl.appendChild(spinner);
    const text = document.createElement("div");
    text.className = "eudia-processing-text";
    text.textContent = "Processing...";
    this.containerEl.appendChild(text);
  }
  showComplete(stats) {
    if (!this.containerEl)
      return;
    this.containerEl.innerHTML = "";
    this.containerEl.className = "eudia-transcription-bar complete";
    const successIcon = document.createElement("div");
    successIcon.className = "eudia-complete-checkmark";
    this.containerEl.appendChild(successIcon);
    const content = document.createElement("div");
    content.className = "eudia-complete-content";
    if (stats.summaryPreview) {
      const preview = document.createElement("div");
      preview.className = "eudia-summary-preview";
      preview.textContent = stats.summaryPreview.length > 80 ? stats.summaryPreview.substring(0, 80) + "..." : stats.summaryPreview;
      content.appendChild(preview);
    }
    const statsRow = document.createElement("div");
    statsRow.className = "eudia-complete-stats-row";
    const mins = Math.floor(stats.duration / 60);
    const secs = Math.floor(stats.duration % 60);
    statsRow.textContent = `${mins}:${secs.toString().padStart(2, "0")} recorded`;
    if (stats.nextStepsCount > 0) {
      statsRow.textContent += ` | ${stats.nextStepsCount} action${stats.nextStepsCount > 1 ? "s" : ""}`;
    }
    if (stats.meddiccCount > 0) {
      statsRow.textContent += ` | ${stats.meddiccCount} signals`;
    }
    content.appendChild(statsRow);
    this.containerEl.appendChild(content);
    const closeBtn = document.createElement("button");
    closeBtn.className = "eudia-control-btn close";
    closeBtn.textContent = "Dismiss";
    closeBtn.onclick = () => this.hide();
    this.containerEl.appendChild(closeBtn);
    setTimeout(() => this.hide(), 8e3);
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
var IntelligenceQueryModal = class extends import_obsidian3.Modal {
  constructor(app, plugin, accountContext) {
    super(app);
    this.accountContext = null;
    this.plugin = plugin;
    this.accountContext = accountContext || null;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("eudia-intelligence-modal");
    const header = contentEl.createDiv({ cls: "eudia-intelligence-header" });
    header.createEl("h2", {
      text: this.accountContext ? `Ask about ${this.accountContext.name}` : "Ask gtm-brain"
    });
    if (this.accountContext) {
      header.createEl("p", {
        text: "Get insights, prep for meetings, or ask about this account.",
        cls: "eudia-intelligence-subtitle"
      });
    } else {
      header.createEl("p", {
        text: "Ask questions about your accounts, deals, or pipeline.",
        cls: "eudia-intelligence-subtitle"
      });
    }
    const inputContainer = contentEl.createDiv({ cls: "eudia-intelligence-input-container" });
    this.queryInput = inputContainer.createEl("textarea", {
      placeholder: this.accountContext ? `e.g., "What should I know before my next meeting?" or "What's the deal status?"` : `e.g., "Who owns Dolby?" or "What's my late stage pipeline?"`
    });
    this.queryInput.addClass("eudia-intelligence-input");
    this.queryInput.rows = 3;
    const actions = contentEl.createDiv({ cls: "eudia-intelligence-actions" });
    const askButton = actions.createEl("button", { text: "Ask", cls: "eudia-btn-primary" });
    askButton.onclick = () => this.submitQuery();
    this.queryInput.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.submitQuery();
      }
    };
    this.responseContainer = contentEl.createDiv({ cls: "eudia-intelligence-response" });
    this.responseContainer.style.display = "none";
    const suggestions = contentEl.createDiv({ cls: "eudia-intelligence-suggestions" });
    suggestions.createEl("p", { text: "Suggested:", cls: "eudia-suggestions-label" });
    let suggestionList;
    if (this.accountContext) {
      suggestionList = [
        "What should I know before my next meeting?",
        "Summarize our relationship and deal status",
        "What are the key pain points?"
      ];
    } else {
      const cachedAccounts = this.plugin.settings.cachedAccounts || [];
      const sampleAccounts = cachedAccounts.slice(0, 3).map((a) => a.name);
      if (sampleAccounts.length >= 2) {
        suggestionList = [
          `What should I know about ${sampleAccounts[0]} before my next meeting?`,
          `What's the account history with ${sampleAccounts[1]}?`,
          `What's my late-stage pipeline?`
        ];
      } else {
        suggestionList = [
          "What should I know before my next meeting?",
          "What accounts need attention this week?",
          "What is my late-stage pipeline?"
        ];
      }
    }
    suggestionList.forEach((s) => {
      const btn = suggestions.createEl("button", { text: s, cls: "eudia-suggestion-btn" });
      btn.onclick = () => {
        this.queryInput.value = s;
        this.submitQuery();
      };
    });
    setTimeout(() => this.queryInput.focus(), 100);
  }
  async submitQuery() {
    const query = this.queryInput.value.trim();
    if (!query)
      return;
    this.responseContainer.style.display = "block";
    const accountMsg = this.accountContext?.name ? ` about ${this.accountContext.name}` : "";
    this.responseContainer.innerHTML = `<div class="eudia-intelligence-loading">Gathering intelligence${accountMsg}...</div>`;
    try {
      const response = await (0, import_obsidian3.requestUrl)({
        url: `${this.plugin.settings.serverUrl}/api/intelligence/query`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          accountId: this.accountContext?.id,
          accountName: this.accountContext?.name,
          userEmail: this.plugin.settings.userEmail
        }),
        throw: false,
        // Don't throw on HTTP errors - handle them gracefully
        contentType: "application/json"
      });
      if (response.status >= 400) {
        const errorMsg = response.json?.error || `Server error (${response.status}). Please try again.`;
        this.responseContainer.innerHTML = `<div class="eudia-intelligence-error">${errorMsg}</div>`;
        return;
      }
      if (response.json?.success) {
        this.responseContainer.innerHTML = "";
        const answer = this.responseContainer.createDiv({ cls: "eudia-intelligence-answer" });
        answer.innerHTML = this.formatResponse(response.json.answer);
        if (response.json.context) {
          const ctx = response.json.context;
          const contextInfo = this.responseContainer.createDiv({ cls: "eudia-intelligence-context-info" });
          const parts = [];
          if (ctx.accountName)
            parts.push(ctx.accountName);
          if (ctx.opportunityCount > 0)
            parts.push(`${ctx.opportunityCount} opps`);
          if (ctx.hasNotes)
            parts.push("notes");
          if (ctx.hasCustomerBrain)
            parts.push("history");
          const freshness = ctx.dataFreshness === "cached" ? " (cached)" : "";
          contextInfo.setText(`Based on: ${parts.join(" \u2022 ")}${freshness}`);
        }
        if (response.json.performance && process.env.NODE_ENV === "development") {
          const perfInfo = this.responseContainer.createDiv({ cls: "eudia-intelligence-perf" });
          perfInfo.setText(`${response.json.performance.durationMs}ms \u2022 ${response.json.performance.tokensUsed} tokens`);
        }
      } else {
        const errorMsg = response.json?.error || "Could not get an answer. Try rephrasing your question.";
        this.responseContainer.innerHTML = `<div class="eudia-intelligence-error">${errorMsg}</div>`;
      }
    } catch (error) {
      console.error("[GTM Brain] Intelligence query error:", error);
      let errorMsg = "Unable to connect. Please check your internet connection and try again.";
      if (error?.message?.includes("timeout")) {
        errorMsg = "Request timed out. The server may be busy - please try again.";
      } else if (error?.message?.includes("network") || error?.message?.includes("fetch")) {
        errorMsg = "Network error. Please check your connection and try again.";
      }
      this.responseContainer.innerHTML = `<div class="eudia-intelligence-error">${errorMsg}</div>`;
    }
  }
  formatResponse(text) {
    return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, "").replace(/^#{2,3}\s+(.+)$/gm, '<h3 class="eudia-intel-header">$1</h3>').replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/^[•\-]\s+(.+)$/gm, "<li>$1</li>").replace(/^-\s+\[\s*\]\s+(.+)$/gm, '<li class="eudia-intel-todo">$1</li>').replace(/^-\s+\[x\]\s+(.+)$/gm, '<li class="eudia-intel-done">$1</li>').replace(/(<li[^>]*>.*?<\/li>\s*)+/g, '<ul class="eudia-intel-list">$&</ul>').replace(/\n{2,}/g, "\n").replace(/\n/g, "<br>");
  }
  onClose() {
    this.contentEl.empty();
  }
};
var EudiaSetupView = class extends import_obsidian3.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.emailInput = null;
    this.pollInterval = null;
    this.plugin = plugin;
    this.accountOwnershipService = new AccountOwnershipService(plugin.settings.serverUrl);
    this.steps = [
      {
        id: "calendar",
        title: "Connect Your Calendar",
        description: "View your meetings and create notes with one click",
        status: "pending"
      },
      {
        id: "salesforce",
        title: "Connect to Salesforce",
        description: "Sync notes and access your accounts",
        status: "pending"
      },
      {
        id: "transcribe",
        title: "Ready to Transcribe",
        description: "Record and summarize meetings automatically",
        status: "pending"
      }
    ];
  }
  getViewType() {
    return SETUP_VIEW_TYPE;
  }
  getDisplayText() {
    return "Setup";
  }
  getIcon() {
    return "settings";
  }
  async onOpen() {
    await this.checkExistingStatus();
    await this.render();
  }
  async onClose() {
    if (this.pollInterval) {
      window.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
  /**
   * Check existing connection status on load
   */
  async checkExistingStatus() {
    if (this.plugin.settings.userEmail) {
      this.steps[0].status = "complete";
      try {
        const response = await (0, import_obsidian3.requestUrl)({
          url: `${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,
          method: "GET",
          throw: false
        });
        if (response.json?.authenticated === true) {
          this.steps[1].status = "complete";
          this.plugin.settings.salesforceConnected = true;
        }
      } catch {
      }
      if (this.plugin.settings.accountsImported) {
        this.steps[2].status = "complete";
      }
    }
  }
  /**
   * Calculate completion percentage
   */
  getCompletionPercentage() {
    const completed = this.steps.filter((s) => s.status === "complete").length;
    return Math.round(completed / this.steps.length * 100);
  }
  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("eudia-setup-view");
    this.renderHeader(container);
    this.renderSteps(container);
    this.renderFooter(container);
  }
  renderHeader(container) {
    const header = container.createDiv({ cls: "eudia-setup-header" });
    const titleSection = header.createDiv({ cls: "eudia-setup-title-section" });
    titleSection.createEl("h1", { text: "Welcome to Eudia Sales Vault", cls: "eudia-setup-main-title" });
    titleSection.createEl("p", {
      text: "Complete these steps to unlock your sales superpowers",
      cls: "eudia-setup-subtitle"
    });
    const progressSection = header.createDiv({ cls: "eudia-setup-progress-section" });
    const percentage = this.getCompletionPercentage();
    const progressLabel = progressSection.createDiv({ cls: "eudia-setup-progress-label" });
    progressLabel.createSpan({ text: "Setup Progress" });
    progressLabel.createSpan({ text: `${percentage}%`, cls: "eudia-setup-progress-value" });
    const progressBar = progressSection.createDiv({ cls: "eudia-setup-progress-bar" });
    const progressFill = progressBar.createDiv({ cls: "eudia-setup-progress-fill" });
    progressFill.style.width = `${percentage}%`;
  }
  renderSteps(container) {
    const stepsContainer = container.createDiv({ cls: "eudia-setup-steps-container" });
    this.renderCalendarStep(stepsContainer);
    this.renderSalesforceStep(stepsContainer);
    this.renderTranscribeStep(stepsContainer);
  }
  renderCalendarStep(container) {
    const step = this.steps[0];
    const stepEl = container.createDiv({ cls: `eudia-setup-step-card ${step.status}` });
    const stepHeader = stepEl.createDiv({ cls: "eudia-setup-step-header" });
    const stepNumber = stepHeader.createDiv({ cls: "eudia-setup-step-number" });
    stepNumber.setText(step.status === "complete" ? "" : "1");
    if (step.status === "complete")
      stepNumber.addClass("eudia-step-complete");
    const stepInfo = stepHeader.createDiv({ cls: "eudia-setup-step-info" });
    stepInfo.createEl("h3", { text: step.title });
    stepInfo.createEl("p", { text: step.description });
    const stepContent = stepEl.createDiv({ cls: "eudia-setup-step-content" });
    if (step.status === "complete") {
      stepContent.createDiv({
        cls: "eudia-setup-complete-message",
        text: `Connected as ${this.plugin.settings.userEmail}`
      });
    } else {
      const inputGroup = stepContent.createDiv({ cls: "eudia-setup-input-group" });
      this.emailInput = inputGroup.createEl("input", {
        type: "email",
        placeholder: "yourname@eudia.com",
        cls: "eudia-setup-input"
      });
      if (this.plugin.settings.userEmail) {
        this.emailInput.value = this.plugin.settings.userEmail;
      }
      const connectBtn = inputGroup.createEl("button", {
        text: "Connect",
        cls: "eudia-setup-btn primary"
      });
      connectBtn.onclick = async () => {
        await this.handleCalendarConnect();
      };
      this.emailInput.onkeydown = async (e) => {
        if (e.key === "Enter") {
          await this.handleCalendarConnect();
        }
      };
      stepContent.createDiv({ cls: "eudia-setup-validation-message" });
      stepContent.createEl("p", {
        cls: "eudia-setup-help-text",
        text: "Your calendar syncs automatically via Microsoft 365. We use your email to identify your meetings."
      });
    }
  }
  async handleCalendarConnect() {
    if (!this.emailInput)
      return;
    const email = this.emailInput.value.trim().toLowerCase();
    const validationEl = this.containerEl.querySelector(".eudia-setup-validation-message");
    if (!email) {
      if (validationEl) {
        validationEl.textContent = "Please enter your email";
        validationEl.className = "eudia-setup-validation-message error";
      }
      return;
    }
    if (!email.endsWith("@eudia.com")) {
      if (validationEl) {
        validationEl.textContent = "Please use your @eudia.com email address";
        validationEl.className = "eudia-setup-validation-message error";
      }
      return;
    }
    if (validationEl) {
      validationEl.textContent = "Validating...";
      validationEl.className = "eudia-setup-validation-message loading";
    }
    try {
      const response = await (0, import_obsidian3.requestUrl)({
        url: `${this.plugin.settings.serverUrl}/api/calendar/validate/${encodeURIComponent(email)}`,
        method: "GET",
        throw: false
      });
      if (response.status === 200 && response.json?.authorized) {
        this.plugin.settings.userEmail = email;
        this.plugin.settings.calendarConfigured = true;
        await this.plugin.saveSettings();
        this.steps[0].status = "complete";
        new import_obsidian3.Notice("Calendar connected successfully!");
        if (validationEl) {
          validationEl.textContent = "Importing your accounts...";
          validationEl.className = "eudia-setup-validation-message loading";
        }
        try {
          let accounts;
          let prospects = [];
          if (isAdminUser(email)) {
            console.log("[Eudia] Admin user detected - importing all accounts");
            accounts = await this.accountOwnershipService.getAllAccountsForAdmin(email);
          } else {
            const result = await this.accountOwnershipService.getAccountsWithProspects(email);
            accounts = result.accounts;
            prospects = result.prospects;
          }
          if (accounts.length > 0 || prospects.length > 0) {
            if (isAdminUser(email)) {
              await this.plugin.createAdminAccountFolders(accounts);
            } else {
              await this.plugin.createTailoredAccountFolders(accounts);
              if (prospects.length > 0) {
                await this.plugin.createProspectAccountFiles(prospects);
              }
            }
            this.plugin.settings.accountsImported = true;
            this.plugin.settings.importedAccountCount = accounts.length + prospects.length;
            await this.plugin.saveSettings();
            new import_obsidian3.Notice(`Imported ${accounts.length} active accounts + ${prospects.length} prospects!`);
          }
        } catch (importError) {
          console.error("[Eudia] Account import failed:", importError);
        }
        await this.render();
      } else {
        if (validationEl) {
          validationEl.innerHTML = `<strong>${email}</strong> is not authorized for calendar access. Contact your admin.`;
          validationEl.className = "eudia-setup-validation-message error";
        }
      }
    } catch (error) {
      if (validationEl) {
        validationEl.textContent = "Connection failed. Please try again.";
        validationEl.className = "eudia-setup-validation-message error";
      }
    }
  }
  renderSalesforceStep(container) {
    const step = this.steps[1];
    const stepEl = container.createDiv({ cls: `eudia-setup-step-card ${step.status}` });
    const stepHeader = stepEl.createDiv({ cls: "eudia-setup-step-header" });
    const stepNumber = stepHeader.createDiv({ cls: "eudia-setup-step-number" });
    stepNumber.setText(step.status === "complete" ? "" : "2");
    if (step.status === "complete")
      stepNumber.addClass("eudia-step-complete");
    const stepInfo = stepHeader.createDiv({ cls: "eudia-setup-step-info" });
    stepInfo.createEl("h3", { text: step.title });
    stepInfo.createEl("p", { text: step.description });
    const stepContent = stepEl.createDiv({ cls: "eudia-setup-step-content" });
    if (!this.plugin.settings.userEmail) {
      stepContent.createDiv({
        cls: "eudia-setup-disabled-message",
        text: "Complete the calendar step first"
      });
      return;
    }
    if (step.status === "complete") {
      stepContent.createDiv({
        cls: "eudia-setup-complete-message",
        text: "Salesforce connected successfully"
      });
      if (this.plugin.settings.accountsImported) {
        stepContent.createDiv({
          cls: "eudia-setup-account-status",
          text: `${this.plugin.settings.importedAccountCount} accounts imported`
        });
      }
    } else {
      const buttonGroup = stepContent.createDiv({ cls: "eudia-setup-button-group" });
      const sfButton = buttonGroup.createEl("button", {
        text: "Connect to Salesforce",
        cls: "eudia-setup-btn primary"
      });
      const statusEl = stepContent.createDiv({ cls: "eudia-setup-sf-status" });
      sfButton.onclick = async () => {
        const authUrl = `${this.plugin.settings.serverUrl}/api/sf/auth/start?email=${encodeURIComponent(this.plugin.settings.userEmail)}`;
        window.open(authUrl, "_blank");
        statusEl.textContent = "Complete the login in the popup window...";
        statusEl.className = "eudia-setup-sf-status loading";
        new import_obsidian3.Notice("Complete the Salesforce login in the popup window", 5e3);
        this.startSalesforcePolling(statusEl);
      };
      stepContent.createEl("p", {
        cls: "eudia-setup-help-text",
        text: "This links your Obsidian notes to your Salesforce account for automatic sync."
      });
    }
  }
  startSalesforcePolling(statusEl) {
    if (this.pollInterval) {
      window.clearInterval(this.pollInterval);
    }
    let attempts = 0;
    const maxAttempts = 60;
    this.pollInterval = window.setInterval(async () => {
      attempts++;
      try {
        const response = await (0, import_obsidian3.requestUrl)({
          url: `${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,
          method: "GET",
          throw: false
        });
        if (response.json?.authenticated === true) {
          if (this.pollInterval) {
            window.clearInterval(this.pollInterval);
            this.pollInterval = null;
          }
          this.plugin.settings.salesforceConnected = true;
          await this.plugin.saveSettings();
          this.steps[1].status = "complete";
          new import_obsidian3.Notice("Salesforce connected successfully!");
          await this.importTailoredAccounts(statusEl);
          await this.render();
        } else if (attempts >= maxAttempts) {
          if (this.pollInterval) {
            window.clearInterval(this.pollInterval);
            this.pollInterval = null;
          }
          statusEl.textContent = "Connection timed out. Please try again.";
          statusEl.className = "eudia-setup-sf-status error";
        }
      } catch (error) {
      }
    }, 5e3);
  }
  async importTailoredAccounts(statusEl) {
    statusEl.textContent = "Importing your accounts...";
    statusEl.className = "eudia-setup-sf-status loading";
    try {
      const userEmail = this.plugin.settings.userEmail;
      let accounts;
      let prospects = [];
      if (isAdminUser(userEmail)) {
        console.log("[Eudia] Admin user detected - importing all accounts");
        statusEl.textContent = "Admin detected - importing all accounts...";
        accounts = await this.accountOwnershipService.getAllAccountsForAdmin(userEmail);
      } else {
        const result = await this.accountOwnershipService.getAccountsWithProspects(userEmail);
        accounts = result.accounts;
        prospects = result.prospects;
      }
      if (accounts.length === 0 && prospects.length === 0) {
        statusEl.textContent = "No accounts found for your email. Contact your admin.";
        statusEl.className = "eudia-setup-sf-status warning";
        return;
      }
      if (isAdminUser(userEmail)) {
        await this.plugin.createAdminAccountFolders(accounts);
      } else {
        await this.plugin.createTailoredAccountFolders(accounts);
        if (prospects.length > 0) {
          await this.plugin.createProspectAccountFiles(prospects);
        }
      }
      this.plugin.settings.accountsImported = true;
      this.plugin.settings.importedAccountCount = accounts.length + prospects.length;
      await this.plugin.saveSettings();
      this.steps[2].status = "complete";
      const ownedCount = accounts.filter((a) => a.isOwned !== false).length;
      const viewOnlyCount = accounts.filter((a) => a.isOwned === false).length;
      if (isAdminUser(userEmail) && viewOnlyCount > 0) {
        statusEl.textContent = `${ownedCount} owned + ${viewOnlyCount} view-only accounts imported!`;
      } else {
        statusEl.textContent = `${accounts.length} active + ${prospects.length} prospect accounts imported!`;
      }
      statusEl.className = "eudia-setup-sf-status success";
    } catch (error) {
      statusEl.textContent = "Failed to import accounts. Please try again.";
      statusEl.className = "eudia-setup-sf-status error";
    }
  }
  renderTranscribeStep(container) {
    const step = this.steps[2];
    const stepEl = container.createDiv({ cls: `eudia-setup-step-card ${step.status}` });
    const stepHeader = stepEl.createDiv({ cls: "eudia-setup-step-header" });
    const stepNumber = stepHeader.createDiv({ cls: "eudia-setup-step-number" });
    stepNumber.setText(step.status === "complete" ? "" : "3");
    if (step.status === "complete")
      stepNumber.addClass("eudia-step-complete");
    const stepInfo = stepHeader.createDiv({ cls: "eudia-setup-step-info" });
    stepInfo.createEl("h3", { text: step.title });
    stepInfo.createEl("p", { text: step.description });
    const stepContent = stepEl.createDiv({ cls: "eudia-setup-step-content" });
    const instructions = stepContent.createDiv({ cls: "eudia-setup-instructions" });
    const instruction1 = instructions.createDiv({ cls: "eudia-setup-instruction" });
    instruction1.createSpan({ cls: "eudia-setup-instruction-icon", text: "\u{1F399}" });
    instruction1.createSpan({ text: "Click the microphone icon in the left sidebar during a call" });
    const instruction2 = instructions.createDiv({ cls: "eudia-setup-instruction" });
    instruction2.createSpan({ cls: "eudia-setup-instruction-icon", text: "\u2328" });
    instruction2.createSpan({ text: 'Or press Cmd/Ctrl+P and search for "Transcribe Meeting"' });
    const instruction3 = instructions.createDiv({ cls: "eudia-setup-instruction" });
    instruction3.createSpan({ cls: "eudia-setup-instruction-icon", text: "\u{1F4DD}" });
    instruction3.createSpan({ text: "AI will summarize and extract key insights automatically" });
    if (step.status !== "complete") {
      stepContent.createEl("p", {
        cls: "eudia-setup-help-text muted",
        text: "This step completes automatically after connecting to Salesforce and importing accounts."
      });
    }
  }
  renderFooter(container) {
    const footer = container.createDiv({ cls: "eudia-setup-footer" });
    const allComplete = this.steps.every((s) => s.status === "complete");
    if (allComplete) {
      const completionMessage = footer.createDiv({ cls: "eudia-setup-completion" });
      completionMessage.createEl("h2", { text: "\u{1F389} You're all set!" });
      completionMessage.createEl("p", { text: "Your sales vault is ready. Click below to start using Eudia." });
      const finishBtn = footer.createEl("button", {
        text: "Open Calendar \u2192",
        cls: "eudia-setup-btn primary large"
      });
      finishBtn.onclick = async () => {
        this.plugin.settings.setupCompleted = true;
        await this.plugin.saveSettings();
        this.plugin.app.workspace.detachLeavesOfType(SETUP_VIEW_TYPE);
        await this.plugin.activateCalendarView();
      };
    } else {
      const skipBtn = footer.createEl("button", {
        text: "Skip Setup (I'll do this later)",
        cls: "eudia-setup-btn secondary"
      });
      skipBtn.onclick = async () => {
        this.plugin.settings.setupCompleted = true;
        await this.plugin.saveSettings();
        this.plugin.app.workspace.detachLeavesOfType(SETUP_VIEW_TYPE);
        new import_obsidian3.Notice("You can complete setup anytime from Settings \u2192 Eudia Sync");
      };
    }
    const settingsLink = footer.createEl("a", {
      text: "Advanced Settings",
      cls: "eudia-setup-settings-link"
    });
    settingsLink.onclick = () => {
      this.app.setting.open();
      this.app.setting.openTabById("eudia-sync");
    };
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
    refreshBtn.title = "Refresh (fetches latest from calendar)";
    refreshBtn.onclick = async () => {
      refreshBtn.addClass("spinning");
      this._forceRefresh = true;
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
      warning.innerHTML = `<strong>${userEmail}</strong> is not authorized for calendar access. Contact your admin.`;
    }
  }
  async renderCalendarContent(container) {
    const contentArea = container.createDiv({ cls: "eudia-calendar-content" });
    const loadingEl = contentArea.createDiv({ cls: "eudia-calendar-loading" });
    loadingEl.innerHTML = '<div class="eudia-spinner"></div><span>Loading meetings...</span>';
    try {
      const calendarService = new CalendarService(
        this.plugin.settings.serverUrl,
        this.plugin.settings.userEmail,
        this.plugin.settings.timezone || "America/New_York"
      );
      const forceRefresh = this._forceRefresh || false;
      this._forceRefresh = false;
      const weekData = await calendarService.getWeekMeetings(forceRefresh);
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
        const nowAction = nowCard.createEl("button", { cls: "eudia-now-action", text: "Create Note" });
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
        text: CalendarService.formatTime(meeting.start, this.plugin.settings.timezone)
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
    let icon = "";
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
        statusEl.textContent = "Please use your @eudia.com email";
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
          statusEl.innerHTML = `<strong>${email}</strong> is not authorized. Contact your admin to be added.`;
          statusEl.className = "eudia-setup-status error";
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect";
          return;
        }
        this.plugin.settings.userEmail = email;
        this.plugin.settings.calendarConfigured = true;
        await this.plugin.saveSettings();
        statusEl.textContent = "Connected";
        statusEl.className = "eudia-setup-status success";
        this.plugin.scanLocalAccountFolders().catch(() => {
        });
        setTimeout(() => this.render(), 500);
      } catch (error) {
        const msg = error.message || "Connection failed";
        if (msg.includes("403")) {
          statusEl.innerHTML = `<strong>${email}</strong> is not authorized for calendar access.`;
        } else {
          statusEl.textContent = msg;
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
  // ─────────────────────────────────────────────────────────────────────────
  // SMART ACCOUNT MATCHING METHODS
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Extract company name from a domain, handling subdomains intelligently
   * Examples:
   *   chsinc.com -> Chsinc
   *   mail.medtronic.com -> Medtronic  
   *   app.uber.com -> Uber
   *   john.smith@company.co.uk -> Company
   */
  extractCompanyFromDomain(domain) {
    const parts = domain.toLowerCase().split(".");
    const skipPrefixes = [
      "mail",
      "email",
      "app",
      "portal",
      "crm",
      "www",
      "smtp",
      "sales",
      "support",
      "login",
      "sso",
      "auth",
      "api",
      "my"
    ];
    const tlds = ["com", "org", "net", "io", "co", "ai", "gov", "edu", "uk", "us", "de", "fr", "jp", "au", "ca"];
    const nonTldParts = parts.filter((p) => !tlds.includes(p) && p.length > 1);
    if (nonTldParts.length === 0)
      return parts[0] || "";
    if (nonTldParts.length > 1 && skipPrefixes.includes(nonTldParts[0])) {
      return nonTldParts[1].charAt(0).toUpperCase() + nonTldParts[1].slice(1);
    }
    const companyPart = nonTldParts[nonTldParts.length - 1];
    return companyPart.charAt(0).toUpperCase() + companyPart.slice(1);
  }
  /**
   * Extract all external domains from attendees
   * Returns unique domains with company names extracted
   */
  getExternalDomainsFromAttendees(attendees) {
    if (!attendees || attendees.length === 0)
      return [];
    const commonProviders = [
      "gmail.com",
      "outlook.com",
      "hotmail.com",
      "yahoo.com",
      "icloud.com",
      "live.com",
      "msn.com",
      "aol.com",
      "protonmail.com",
      "googlemail.com",
      "mail.com",
      "zoho.com",
      "ymail.com"
    ];
    const seenDomains = /* @__PURE__ */ new Set();
    const results = [];
    for (const attendee of attendees) {
      if (!attendee.email)
        continue;
      const email = attendee.email.toLowerCase();
      const domainMatch = email.match(/@([a-z0-9.-]+)/);
      if (domainMatch) {
        const domain = domainMatch[1];
        if (domain.includes("eudia.com") || commonProviders.includes(domain))
          continue;
        if (seenDomains.has(domain))
          continue;
        seenDomains.add(domain);
        const company = this.extractCompanyFromDomain(domain);
        if (company.length >= 2) {
          results.push({ domain, company });
        }
      }
    }
    return results;
  }
  /**
   * Find the best account match from multiple domain candidates
   * Scores each domain against account folders and returns the best match
   */
  findBestAccountMatch(domains, serverAccountName, subjectAccountName) {
    const accountsFolder = this.plugin.settings.accountsFolder || "Accounts";
    const folder = this.app.vault.getAbstractFileByPath(accountsFolder);
    if (!(folder instanceof import_obsidian3.TFolder))
      return null;
    const subfolders = [];
    for (const child of folder.children) {
      if (child instanceof import_obsidian3.TFolder) {
        subfolders.push(child.name);
      }
    }
    if (subfolders.length === 0)
      return null;
    const domainScores = [];
    for (const { domain, company } of domains) {
      const matchedFolder = this.findAccountFolder(company);
      const score = matchedFolder ? 1 : 0;
      domainScores.push({ domain, company, folder: matchedFolder, score });
    }
    domainScores.sort((a, b) => b.score - a.score);
    if (domainScores.length > 0 && domainScores[0].folder) {
      const best = domainScores[0];
      const folderName = best.folder.split("/").pop() || best.company;
      console.log(`[Eudia Calendar] Best domain match: "${best.company}" from ${best.domain} -> ${best.folder}`);
      return { folder: best.folder, accountName: folderName, source: "domain" };
    }
    if (serverAccountName) {
      const matchedFolder = this.findAccountFolder(serverAccountName);
      if (matchedFolder) {
        const folderName = matchedFolder.split("/").pop() || serverAccountName;
        console.log(`[Eudia Calendar] Server account match: "${serverAccountName}" -> ${matchedFolder}`);
        return { folder: matchedFolder, accountName: folderName, source: "server" };
      }
    }
    if (subjectAccountName) {
      const matchedFolder = this.findAccountFolder(subjectAccountName);
      if (matchedFolder) {
        const folderName = matchedFolder.split("/").pop() || subjectAccountName;
        console.log(`[Eudia Calendar] Subject match: "${subjectAccountName}" -> ${matchedFolder}`);
        return { folder: matchedFolder, accountName: folderName, source: "subject" };
      }
    }
    for (const { company } of domains) {
      const partialMatch = subfolders.find((f) => {
        const fLower = f.toLowerCase();
        const cLower = company.toLowerCase();
        return fLower.includes(cLower) || cLower.includes(fLower);
      });
      if (partialMatch) {
        const matchedFolder = `${accountsFolder}/${partialMatch}`;
        console.log(`[Eudia Calendar] Partial domain match: "${company}" -> ${matchedFolder}`);
        return { folder: matchedFolder, accountName: partialMatch, source: "domain-partial" };
      }
    }
    return null;
  }
  /**
   * Extract company name from attendee email domains (legacy method for compatibility)
   * Returns the company name derived from the first external domain
   */
  extractAccountFromAttendees(attendees) {
    const domains = this.getExternalDomainsFromAttendees(attendees);
    if (domains.length === 0)
      return null;
    const bestDomain = domains[0];
    console.log(`[Eudia Calendar] Extracted company "${bestDomain.company}" from attendee domain ${bestDomain.domain}`);
    return bestDomain.company;
  }
  /**
   * Extract account name from meeting subject using common patterns
   * Examples:
   *   "CHS/Eudia - M&A Intro & Demo" -> "CHS"
   *   "Graybar/Eudia Weekly Check in" -> "Graybar"
   *   "Eudia - HATCo Connect | Intros" -> "HATCo"
   */
  extractAccountFromSubject(subject) {
    if (!subject)
      return null;
    const slashPattern = subject.match(/^([^\/]+)\s*\/\s*Eudia|Eudia\s*\/\s*([^\/\-|]+)/i);
    if (slashPattern) {
      const match = (slashPattern[1] || slashPattern[2] || "").trim();
      if (match.toLowerCase() !== "eudia")
        return match;
    }
    const dashPattern = subject.match(/^Eudia\s*[-–]\s*([^|]+)|^([^-–]+)\s*[-–]\s*Eudia/i);
    if (dashPattern) {
      const match = (dashPattern[1] || dashPattern[2] || "").trim();
      const cleaned = match.replace(/\s+(Connect|Weekly|Call|Meeting|Intro|Demo|Check\s*in|Sync).*$/i, "").trim();
      if (cleaned.toLowerCase() !== "eudia" && cleaned.length > 0)
        return cleaned;
    }
    if (!subject.toLowerCase().includes("eudia")) {
      const simplePattern = subject.match(/^([^-–|]+)/);
      if (simplePattern) {
        const match = simplePattern[1].trim();
        if (match.length > 2 && match.length < 50)
          return match;
      }
    }
    return null;
  }
  /**
   * Find matching account folder in the vault
   * Uses multiple matching strategies for robustness
   * Returns the full path if found, null otherwise
   */
  findAccountFolder(accountName) {
    if (!accountName)
      return null;
    const accountsFolder = this.plugin.settings.accountsFolder || "Accounts";
    const folder = this.app.vault.getAbstractFileByPath(accountsFolder);
    if (!(folder instanceof import_obsidian3.TFolder)) {
      console.log(`[Eudia Calendar] Accounts folder "${accountsFolder}" not found`);
      return null;
    }
    const normalizedSearch = accountName.toLowerCase().trim();
    const subfolders = [];
    for (const child of folder.children) {
      if (child instanceof import_obsidian3.TFolder) {
        subfolders.push(child.name);
      }
    }
    console.log(`[Eudia Calendar] Searching for "${normalizedSearch}" in ${subfolders.length} folders`);
    const exactMatch = subfolders.find((f) => f.toLowerCase() === normalizedSearch);
    if (exactMatch) {
      console.log(`[Eudia Calendar] Exact match found: ${exactMatch}`);
      return `${accountsFolder}/${exactMatch}`;
    }
    const folderStartsWith = subfolders.find((f) => f.toLowerCase().startsWith(normalizedSearch));
    if (folderStartsWith) {
      console.log(`[Eudia Calendar] Folder starts with match: ${folderStartsWith}`);
      return `${accountsFolder}/${folderStartsWith}`;
    }
    const searchStartsWith = subfolders.find((f) => normalizedSearch.startsWith(f.toLowerCase()));
    if (searchStartsWith) {
      console.log(`[Eudia Calendar] Search starts with folder match: ${searchStartsWith}`);
      return `${accountsFolder}/${searchStartsWith}`;
    }
    const searchContains = subfolders.find((f) => {
      const folderLower = f.toLowerCase();
      return folderLower.length >= 3 && normalizedSearch.includes(folderLower);
    });
    if (searchContains) {
      console.log(`[Eudia Calendar] Search contains folder match: ${searchContains}`);
      return `${accountsFolder}/${searchContains}`;
    }
    const folderContains = subfolders.find((f) => {
      const folderLower = f.toLowerCase();
      return normalizedSearch.length >= 3 && folderLower.includes(normalizedSearch);
    });
    if (folderContains) {
      console.log(`[Eudia Calendar] Folder contains search match: ${folderContains}`);
      return `${accountsFolder}/${folderContains}`;
    }
    console.log(`[Eudia Calendar] No folder match found for "${normalizedSearch}"`);
    return null;
  }
  async createNoteForMeeting(meeting) {
    const dateStr = meeting.start.split("T")[0];
    const userEmail = this.plugin.settings.eudiaEmail || "";
    const isPipelineAdmin = isAdminUser(userEmail);
    const attendeeEmails = (meeting.attendees || []).map((a) => a.email).filter(Boolean);
    const pipelineDetection = detectPipelineMeeting(meeting.subject, attendeeEmails);
    if (isPipelineAdmin && pipelineDetection.isPipelineMeeting && pipelineDetection.confidence >= 60) {
      await this._createPipelineNote(meeting, dateStr);
      return;
    }
    const safeName = meeting.subject.replace(/[<>:"/\\|?*]/g, "_").substring(0, 50);
    const fileName = `${dateStr} - ${safeName}.md`;
    let targetFolder = null;
    let matchedAccountName = meeting.accountName || null;
    let matchedAccountId = null;
    console.log(`[Eudia Calendar] === Creating note for meeting: "${meeting.subject}" ===`);
    console.log(`[Eudia Calendar] Attendees: ${JSON.stringify(meeting.attendees?.map((a) => a.email) || [])}`);
    const externalDomains = this.getExternalDomainsFromAttendees(meeting.attendees || []);
    console.log(`[Eudia Calendar] External domains found: ${JSON.stringify(externalDomains)}`);
    const subjectAccountName = this.extractAccountFromSubject(meeting.subject);
    console.log(`[Eudia Calendar] Subject-extracted name: "${subjectAccountName || "none"}"`);
    const bestMatch = this.findBestAccountMatch(
      externalDomains,
      meeting.accountName,
      subjectAccountName || void 0
    );
    if (bestMatch) {
      targetFolder = bestMatch.folder;
      matchedAccountName = bestMatch.accountName;
      console.log(`[Eudia Calendar] Best match (${bestMatch.source}): "${matchedAccountName}" -> ${targetFolder}`);
    }
    if (!targetFolder) {
      const accountsFolder = this.plugin.settings.accountsFolder || "Accounts";
      const folder = this.app.vault.getAbstractFileByPath(accountsFolder);
      if (folder instanceof import_obsidian3.TFolder) {
        targetFolder = accountsFolder;
        console.log(`[Eudia Calendar] No match found, using Accounts root: ${targetFolder}`);
      }
    }
    if (matchedAccountName) {
      const cachedAccount = this.plugin.settings.cachedAccounts.find(
        (a) => a.name.toLowerCase() === matchedAccountName?.toLowerCase()
      );
      if (cachedAccount) {
        matchedAccountId = cachedAccount.id;
        matchedAccountName = cachedAccount.name;
        console.log(`[Eudia Calendar] Matched to cached account: ${cachedAccount.name} (${cachedAccount.id})`);
      }
    }
    const filePath = targetFolder ? `${targetFolder}/${fileName}` : fileName;
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof import_obsidian3.TFile) {
      await this.app.workspace.getLeaf().openFile(existing);
      new import_obsidian3.Notice(`Opened existing note: ${fileName}`);
      return;
    }
    const attendeeList = (meeting.attendees || []).map((a) => a.name || a.email?.split("@")[0] || "Unknown").slice(0, 5).join(", ");
    const template = `---
title: "${meeting.subject}"
date: ${dateStr}
attendees: [${attendeeList}]
account: "${matchedAccountName || ""}"
account_id: "${matchedAccountId || ""}"
meeting_start: ${meeting.start}
meeting_type: discovery
sync_to_salesforce: false
clo_meeting: false
source: ""
transcribed: false
---

# ${meeting.subject}

## Attendees
${(meeting.attendees || []).map((a) => `- ${a.name || a.email}`).join("\n")}

## Pre-Call Notes

*Add any prep notes, context, or questions before the meeting*



---

## Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` \u2192 **"Transcribe Meeting"**

---

`;
    try {
      const file = await this.app.vault.create(filePath, template);
      await this.app.workspace.getLeaf().openFile(file);
      new import_obsidian3.Notice(`Created: ${filePath}`);
    } catch (e) {
      console.error("[Eudia Calendar] Failed to create note:", e);
      new import_obsidian3.Notice(`Could not create note: ${e.message || "Unknown error"}`);
    }
  }
  /**
   * Create a pipeline meeting note with auto-naming in Pipeline Meetings folder
   */
  async _createPipelineNote(meeting, dateStr) {
    const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    const formattedDate = `${mm}.${dd}.${yy}`;
    const fileName = `Team Pipeline Meeting - ${formattedDate}.md`;
    const folderPath = "Pipeline Meetings";
    const existingFolder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!existingFolder) {
      await this.app.vault.createFolder(folderPath);
    }
    const filePath = `${folderPath}/${fileName}`;
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof import_obsidian3.TFile) {
      await this.app.workspace.getLeaf().openFile(existing);
      new import_obsidian3.Notice(`Opened existing: ${fileName}`);
      return;
    }
    const attendeeNames = (meeting.attendees || []).map((a) => a.name || a.email?.split("@")[0] || "Unknown");
    const template = `---
title: "Team Pipeline Meeting - ${formattedDate}"
date: ${dateStr}
attendees: [${attendeeNames.slice(0, 10).join(", ")}]
meeting_type: pipeline_review
meeting_start: ${meeting.start}
transcribed: false
---

# Weekly Pipeline Review | ${d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}

## Attendees
${attendeeNames.map((a) => `- ${a}`).join("\n")}

---

## Ready to Transcribe

Click the **microphone icon** in the sidebar or use \`Cmd/Ctrl+P\` \u2192 **"Transcribe Meeting"**

After transcription, this note will be automatically formatted with:
- **Priority Actions** grouped by urgency
- **BL Deal Context** with commit totals
- **Per-BL Account Tables** (Account | Status | Next Action)
- **Growth & Cross-Team Updates**

---

`;
    try {
      const file = await this.app.vault.create(filePath, template);
      await this.app.workspace.getLeaf().openFile(file);
      new import_obsidian3.Notice(`Created pipeline note: ${fileName}`);
      console.log(`[Eudia Pipeline] Created pipeline meeting note: ${filePath}`);
    } catch (e) {
      console.error("[Eudia Pipeline] Failed to create pipeline note:", e);
      new import_obsidian3.Notice(`Could not create pipeline note: ${e.message || "Unknown error"}`);
    }
  }
};
var EudiaSyncPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.audioRecorder = null;
    this.recordingStatusBar = null;
    this.micRibbonIcon = null;
    // Live query support - accumulated transcript during recording
    this.liveTranscript = "";
    this.liveTranscriptChunkInterval = null;
    this.isTranscribingChunk = false;
  }
  async onload() {
    await this.loadSettings();
    this.transcriptionService = new TranscriptionService(
      this.settings.serverUrl
    );
    this.calendarService = new CalendarService(
      this.settings.serverUrl,
      this.settings.userEmail,
      this.settings.timezone || "America/New_York"
    );
    this.smartTagService = new SmartTagService();
    this.checkForPluginUpdate();
    this.registerView(
      CALENDAR_VIEW_TYPE,
      (leaf) => new EudiaCalendarView(leaf, this)
    );
    this.registerView(
      SETUP_VIEW_TYPE,
      (leaf) => new EudiaSetupView(leaf, this)
    );
    this.addRibbonIcon("calendar", "Open Calendar", () => this.activateCalendarView());
    this.micRibbonIcon = this.addRibbonIcon("microphone", "Transcribe Meeting", async () => {
      if (this.audioRecorder?.isRecording()) {
        await this.stopRecording();
      } else {
        await this.startRecording();
      }
    });
    this.addRibbonIcon("message-circle", "Ask GTM Brain", () => {
      this.openIntelligenceQueryForCurrentNote();
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
    this.addCommand({
      id: "ask-gtm-brain",
      name: "Ask gtm-brain",
      callback: () => this.openIntelligenceQueryForCurrentNote()
    });
    this.addCommand({
      id: "refresh-analytics",
      name: "Refresh Analytics Dashboard",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          await this.refreshAnalyticsDashboard(file);
        } else {
          new import_obsidian3.Notice("No active file");
        }
      }
    });
    this.addCommand({
      id: "live-query-transcript",
      name: "Query Current Transcript (Live)",
      callback: async () => {
        if (!this.audioRecorder?.isRecording()) {
          new import_obsidian3.Notice("No active recording. Start recording first to use live query.");
          return;
        }
        if (!this.liveTranscript || this.liveTranscript.length < 50) {
          new import_obsidian3.Notice("Not enough transcript captured yet. Keep recording for a few more minutes.");
          return;
        }
        this.openLiveQueryModal();
      }
    });
    this.addSettingTab(new EudiaSyncSettingTab(this.app, this));
    this.registerEditorSuggest(new AccountSuggester(this.app, this));
    this.app.workspace.onLayoutReady(async () => {
      if (!this.settings.setupCompleted) {
        await new Promise((r) => setTimeout(r, 100));
        const settingModal = document.querySelector(".modal-container .modal");
        if (settingModal) {
          const closeBtn = settingModal.querySelector(".modal-close-button");
          if (closeBtn)
            closeBtn.click();
        }
        await this.activateSetupView();
      } else if (this.settings.syncOnStartup) {
        await this.scanLocalAccountFolders();
        if (this.settings.userEmail && this.settings.syncAccountsOnStartup) {
          const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          const shouldSync = this.settings.lastAccountRefreshDate !== today;
          if (shouldSync) {
            setTimeout(async () => {
              try {
                console.log("[Eudia] Startup account sync - checking for changes...");
                const result = await this.syncAccountFolders();
                if (result.success) {
                  this.settings.lastAccountRefreshDate = today;
                  await this.saveSettings();
                  if (result.added > 0 || result.archived > 0) {
                    const parts = [];
                    if (result.added > 0)
                      parts.push(`${result.added} added`);
                    if (result.archived > 0)
                      parts.push(`${result.archived} archived`);
                    new import_obsidian3.Notice(`Account folders synced: ${parts.join(", ")}`);
                  }
                } else {
                  console.log("[Eudia] Sync failed:", result.error);
                }
              } catch (e) {
                console.log("[Eudia] Startup sync skipped (server unreachable), will retry tomorrow");
              }
            }, 2e3);
          }
        }
        if (this.settings.showCalendarView && this.settings.userEmail) {
          await this.activateCalendarView();
        }
        if (this.settings.userEmail && this.telemetry) {
          setTimeout(async () => {
            try {
              const accountsFolder = this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);
              let accountCount = 0;
              if (accountsFolder && accountsFolder instanceof import_obsidian3.TFolder) {
                accountCount = accountsFolder.children.filter(
                  (c) => c instanceof import_obsidian3.TFolder && !c.name.startsWith("_")
                ).length;
              }
              const connections = {
                salesforce: this.settings.salesforceConnected ? "connected" : "not_configured",
                calendar: this.settings.calendarConfigured ? "connected" : "not_configured"
              };
              await this.telemetry.sendHeartbeat(accountCount, connections);
              const pushedUpdates = await this.telemetry.checkForPushedConfig();
              if (pushedUpdates.length > 0) {
                let settingsChanged = false;
                for (const update of pushedUpdates) {
                  if (update.key && this.settings.hasOwnProperty(update.key)) {
                    this.settings[update.key] = update.value;
                    settingsChanged = true;
                    console.log(`[Eudia] Applied pushed config: ${update.key} = ${update.value}`);
                  }
                }
                if (settingsChanged) {
                  await this.saveSettings();
                  new import_obsidian3.Notice("Settings updated by admin");
                }
              }
              await this.checkAndConsumeSyncFlags();
            } catch (e) {
              console.log("[Eudia] Heartbeat/config check skipped");
            }
          }, 3e3);
        }
      }
      this.app.workspace.on("file-open", async (file) => {
        if (!file)
          return;
        if (file.path.includes("_Analytics/") || file.path.includes("_Customer Health/")) {
          try {
            const content = await this.app.vault.read(file);
            if (content.includes("type: analytics_dashboard")) {
              const lastUpdatedMatch = content.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/);
              const lastUpdated = lastUpdatedMatch?.[1];
              const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
              if (lastUpdated !== today) {
                console.log(`[Eudia] Auto-refreshing analytics: ${file.name}`);
                await this.refreshAnalyticsDashboard(file);
              }
            }
          } catch (e) {
          }
        }
      });
    });
  }
  async onunload() {
    this.app.workspace.detachLeavesOfType(CALENDAR_VIEW_TYPE);
  }
  /**
   * Check the server for a newer plugin version. If available, silently download
   * and install the update, then prompt the user to reload.
   * Non-blocking — runs in background on startup.
   */
  async checkForPluginUpdate() {
    try {
      const serverUrl = this.settings.serverUrl || "https://gtm-wizard.onrender.com";
      const resp = await (0, import_obsidian3.requestUrl)({
        url: `${serverUrl}/api/plugin/version`,
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      if (!resp.json?.success)
        return;
      const remoteVersion = resp.json.currentVersion;
      const localVersion = this.manifest?.version || "0.0.0";
      const remote = remoteVersion.split(".").map(Number);
      const local = localVersion.split(".").map(Number);
      let needsUpdate = false;
      for (let i = 0; i < 3; i++) {
        if ((remote[i] || 0) > (local[i] || 0)) {
          needsUpdate = true;
          break;
        }
        if ((remote[i] || 0) < (local[i] || 0))
          break;
      }
      if (needsUpdate) {
        console.log(`[Eudia Update] New version available: ${remoteVersion} (current: ${localVersion})`);
        await this.performAutoUpdate(serverUrl, remoteVersion, localVersion);
      } else {
        console.log(`[Eudia Update] Plugin is up to date (v${localVersion})`);
      }
    } catch (e) {
      console.log("[Eudia Update] Could not check for updates:", e.message || e);
    }
  }
  /**
   * Download latest plugin files from the server, write them to disk, and
   * prompt the user to reload Obsidian. Never interrupts an active recording.
   */
  async performAutoUpdate(serverUrl, remoteVersion, localVersion) {
    try {
      if (this.audioRecorder?.isRecording()) {
        console.log("[Eudia Update] Skipping auto-update \u2014 recording in progress");
        new import_obsidian3.Notice(
          `Eudia update v${remoteVersion} available.
Finish your recording, then restart Obsidian to update.`,
          1e4
        );
        return;
      }
      const pluginDir = this.manifest.dir;
      if (!pluginDir) {
        console.log("[Eudia Update] Cannot determine plugin directory \u2014 skipping");
        return;
      }
      const adapter = this.app.vault.adapter;
      console.log("[Eudia Update] Downloading plugin files...");
      const [mainJsResp, manifestResp, stylesResp] = await Promise.all([
        (0, import_obsidian3.requestUrl)({ url: `${serverUrl}/api/plugin/main.js` }),
        (0, import_obsidian3.requestUrl)({ url: `${serverUrl}/api/plugin/manifest.json` }),
        (0, import_obsidian3.requestUrl)({ url: `${serverUrl}/api/plugin/styles.css` })
      ]);
      const mainJsText = mainJsResp.text;
      const manifestText = manifestResp.text;
      const stylesText = stylesResp.text;
      const MIN_SIZE = 1024;
      const MAX_SIZE = 5 * 1024 * 1024;
      for (const [name, content] of [
        ["main.js", mainJsText],
        ["manifest.json", manifestText],
        ["styles.css", stylesText]
      ]) {
        if (!content || content.length < MIN_SIZE || content.length > MAX_SIZE) {
          console.log(`[Eudia Update] Downloaded ${name} failed validation (${content?.length ?? 0} bytes) \u2014 aborting`);
          return;
        }
      }
      try {
        const currentMainJs = await adapter.read(`${pluginDir}/main.js`);
        await adapter.write(`${pluginDir}/main.js.bak`, currentMainJs);
        console.log("[Eudia Update] Backed up current main.js");
      } catch {
        console.log("[Eudia Update] Could not back up main.js \u2014 continuing");
      }
      await adapter.write(`${pluginDir}/main.js`, mainJsText);
      await adapter.write(`${pluginDir}/manifest.json`, manifestText);
      await adapter.write(`${pluginDir}/styles.css`, stylesText);
      console.log(`[Eudia Update] Files written \u2014 v${localVersion} \u2192 v${remoteVersion}`);
      try {
        (0, import_obsidian3.requestUrl)({
          url: `${serverUrl}/api/plugin/telemetry`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "info",
            message: `Auto-updated from v${localVersion} to v${remoteVersion}`,
            userEmail: this.settings.userEmail || "anonymous",
            pluginVersion: remoteVersion,
            platform: "obsidian",
            context: { fromVersion: localVersion, toVersion: remoteVersion }
          })
        }).catch(() => {
        });
      } catch {
      }
      const fragment = document.createDocumentFragment();
      const msgEl = document.createElement("div");
      msgEl.style.cssText = "display:flex;flex-direction:column;gap:8px;";
      const textEl = document.createElement("span");
      textEl.textContent = `Eudia updated to v${remoteVersion}. Reload to apply.`;
      msgEl.appendChild(textEl);
      const btn = document.createElement("button");
      btn.textContent = "Reload now";
      btn.style.cssText = "padding:4px 12px;border-radius:4px;border:1px solid var(--interactive-accent);background:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:12px;align-self:flex-start;";
      btn.addEventListener("click", () => {
        this.app.commands.executeCommandById("app:reload");
      });
      msgEl.appendChild(btn);
      fragment.appendChild(msgEl);
      new import_obsidian3.Notice(fragment, 0);
    } catch (e) {
      console.log("[Eudia Update] Auto-update failed:", e.message || e);
    }
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
  /**
   * Open the setup view in the main content area
   * This provides a full-page onboarding experience for new users
   */
  async activateSetupView() {
    const workspace = this.app.workspace;
    const leaves = workspace.getLeavesOfType(SETUP_VIEW_TYPE);
    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
    } else {
      const leaf = workspace.getLeaf(true);
      if (leaf) {
        await leaf.setViewState({ type: SETUP_VIEW_TYPE, active: true });
        workspace.revealLeaf(leaf);
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────
  // TAILORED ACCOUNT FOLDER CREATION
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Create account folders for the user's owned accounts only.
   * This provides a tailored vault experience based on account ownership.
   */
  async createTailoredAccountFolders(accounts) {
    const accountsFolder = this.settings.accountsFolder || "Accounts";
    const existingFolder = this.app.vault.getAbstractFileByPath(accountsFolder);
    if (!existingFolder) {
      await this.app.vault.createFolder(accountsFolder);
    }
    let createdCount = 0;
    for (const account of accounts) {
      const safeName = account.name.replace(/[<>:"/\\|?*]/g, "_").trim();
      const folderPath = `${accountsFolder}/${safeName}`;
      const existing = this.app.vault.getAbstractFileByPath(folderPath);
      if (existing instanceof import_obsidian3.TFolder) {
        console.log(`[Eudia] Account folder already exists: ${safeName}`);
        continue;
      }
      try {
        await this.app.vault.createFolder(folderPath);
        const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        const subnotes = [
          {
            name: "Note 1.md",
            content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${account.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
          },
          {
            name: "Note 2.md",
            content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${account.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
          },
          {
            name: "Note 3.md",
            content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${account.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
          },
          {
            name: "Meeting Notes.md",
            content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meetings_index
sync_to_salesforce: false
---

# ${account.name} - Meeting Notes

*Use Note 1, Note 2, Note 3 for your meeting notes. When full, create additional notes.*

## Recent Meetings

| Date | Note | Key Outcomes |
|------|------|--------------|
|      |      |              |

## Quick Start

1. Open **Note 1** for your next meeting
2. Click the **microphone** to record and transcribe
3. **Next Steps** are auto-extracted after transcription
4. Set \`sync_to_salesforce: true\` to sync to Salesforce
`
          },
          {
            name: "Contacts.md",
            content: `---
account: "${account.name}"
account_id: "${account.id}"
type: contacts
sync_to_salesforce: false
---

# ${account.name} - Key Contacts

| Name | Title | Email | Phone | Notes |
|------|-------|-------|-------|-------|
|      |       |       |       |       |

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`
          },
          {
            name: "Intelligence.md",
            content: `---
account: "${account.name}"
account_id: "${account.id}"
type: intelligence
sync_to_salesforce: false
---

# ${account.name} - Account Intelligence

## Company Overview

*Industry, size, headquarters, key facts.*

## Strategic Priorities

*What's top of mind for leadership? Digital transformation initiatives?*

## Legal/Compliance Landscape

*Regulatory environment, compliance challenges, legal team structure.*

## Competitive Intelligence

*Incumbent vendors, evaluation history, competitive positioning.*

## News & Signals

*Recent news, earnings mentions, leadership changes.*
`
          },
          {
            name: "Next Steps.md",
            content: `---
account: "${account.name}"
account_id: "${account.id}"
type: next_steps
auto_updated: true
last_updated: ${dateStr}
sync_to_salesforce: false
---

# ${account.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`
          }
        ];
        for (const subnote of subnotes) {
          const notePath = `${folderPath}/${subnote.name}`;
          await this.app.vault.create(notePath, subnote.content);
        }
        createdCount++;
        console.log(`[Eudia] Created account folder with subnotes: ${safeName}`);
      } catch (error) {
        console.error(`[Eudia] Failed to create folder for ${safeName}:`, error);
      }
    }
    this.settings.cachedAccounts = accounts.map((a) => ({
      id: a.id,
      name: a.name
    }));
    await this.saveSettings();
    if (createdCount > 0) {
      new import_obsidian3.Notice(`Created ${createdCount} account folders`);
    }
    await this.ensureNextStepsFolderExists();
  }
  /**
   * Create lightweight .md files for prospect accounts (no opportunity history).
   * These go into Accounts/_Prospects/ as single files, keeping the workspace clean.
   */
  async createProspectAccountFiles(prospects) {
    if (!prospects || prospects.length === 0)
      return 0;
    const accountsFolder = this.settings.accountsFolder || "Accounts";
    const prospectsFolder = `${accountsFolder}/_Prospects`;
    const existingFolder = this.app.vault.getAbstractFileByPath(prospectsFolder);
    if (!existingFolder) {
      try {
        await this.app.vault.createFolder(prospectsFolder);
      } catch (e) {
      }
    }
    let createdCount = 0;
    for (const prospect of prospects) {
      const safeName = prospect.name.replace(/[<>:"/\\|?*]/g, "_").trim();
      const filePath = `${prospectsFolder}/${safeName}.md`;
      const existing = this.app.vault.getAbstractFileByPath(filePath);
      if (existing)
        continue;
      const fullFolderPath = `${accountsFolder}/${safeName}`;
      const fullFolder = this.app.vault.getAbstractFileByPath(fullFolderPath);
      if (fullFolder)
        continue;
      try {
        const website = prospect.website || "";
        const industry = prospect.industry || "";
        const websiteDisplay = website ? website.replace(/^https?:\/\//, "") : "";
        const websiteUrl = website && !website.startsWith("http") ? `https://${website}` : website;
        const content = `---
account_id: "${prospect.id}"
account: "${prospect.name}"
industry: "${industry}"
website: "${websiteDisplay}"
status: prospect
tier: prospect
---

# ${prospect.name}

${industry ? `**Industry:** ${industry}` : ""}${industry && websiteDisplay ? " | " : ""}${websiteDisplay ? `**Website:** [${websiteDisplay}](${websiteUrl})` : ""}

## Notes
<!-- Add notes when you start engaging this account -->

## Key Contacts
| Name | Title | Email | Notes |
|------|-------|-------|-------|
|      |       |       |       |
`;
        await this.app.vault.create(filePath, content);
        createdCount++;
      } catch (err) {
        console.log(`[Eudia] Failed to create prospect file for ${prospect.name}:`, err);
      }
    }
    if (createdCount > 0) {
      console.log(`[Eudia] Created ${createdCount} prospect account files in _Prospects/`);
    }
    return createdCount;
  }
  /**
   * Create account folders for admin users with ALL accounts.
   * Owned accounts get full folder structure, view-only get minimal read-only structure.
   */
  async createAdminAccountFolders(accounts) {
    const accountsFolder = this.settings.accountsFolder || "Accounts";
    const existingFolder = this.app.vault.getAbstractFileByPath(accountsFolder);
    if (!existingFolder) {
      await this.app.vault.createFolder(accountsFolder);
    }
    await this.ensurePipelineFolderExists();
    let createdOwned = 0;
    let createdViewOnly = 0;
    const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    for (const account of accounts) {
      const safeName = account.name.replace(/[<>:"/\\|?*]/g, "_").trim();
      const folderPath = `${accountsFolder}/${safeName}`;
      const existing = this.app.vault.getAbstractFileByPath(folderPath);
      if (existing instanceof import_obsidian3.TFolder) {
        continue;
      }
      try {
        await this.app.vault.createFolder(folderPath);
        await this.createExecAccountSubnotes(folderPath, account, dateStr);
        if (account.isOwned) {
          createdOwned++;
        } else {
          createdViewOnly++;
        }
        console.log(`[Eudia Admin] Created ${account.isOwned ? "owned" : "view-only"} folder: ${safeName}`);
      } catch (error) {
        console.error(`[Eudia Admin] Failed to create folder for ${safeName}:`, error);
      }
    }
    this.settings.cachedAccounts = accounts.map((a) => ({
      id: a.id,
      name: a.name
    }));
    await this.saveSettings();
    if (createdOwned + createdViewOnly > 0) {
      new import_obsidian3.Notice(`Created ${createdOwned} owned + ${createdViewOnly} view-only account folders`);
    }
    await this.ensureNextStepsFolderExists();
  }
  /**
   * Create full account subnotes for exec/admin users (same structure as BLs)
   * Gives execs Note 1-3, Meeting Notes, Contacts, Intelligence, Next Steps
   */
  async createExecAccountSubnotes(folderPath, account, dateStr) {
    const ownerName = account.ownerName || "Unknown";
    const subnotes = [
      {
        name: "Note 1.md",
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${account.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
      },
      {
        name: "Note 2.md",
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${account.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
      },
      {
        name: "Note 3.md",
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${account.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
      },
      {
        name: "Meeting Notes.md",
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meetings_index
owner: "${ownerName}"
sync_to_salesforce: false
---

# ${account.name} - Meeting Notes

**Account Owner:** ${ownerName}

*Use Note 1, Note 2, Note 3 for your meeting notes. When full, create additional notes.*

## Recent Meetings

| Date | Note | Key Outcomes |
|------|------|--------------|
|      |      |              |

## Quick Start

1. Open **Note 1** for your next meeting
2. Click the **microphone** to record and transcribe
3. **Next Steps** are auto-extracted after transcription
4. Set \`sync_to_salesforce: true\` to sync to Salesforce
`
      },
      {
        name: "Contacts.md",
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: contacts
sync_to_salesforce: false
---

# ${account.name} - Key Contacts

| Name | Title | Email | Phone | Notes |
|------|-------|-------|-------|-------|
|      |       |       |       |       |

## Relationship Map

*Add org chart, decision makers, champions, and blockers here.*

## Contact History

*Log key interactions and relationship developments.*
`
      },
      {
        name: "Intelligence.md",
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: intelligence
sync_to_salesforce: false
---

# ${account.name} - Account Intelligence

## Company Overview

*Industry, size, headquarters, key facts.*

## Strategic Priorities

*What's top of mind for leadership? Digital transformation initiatives?*

## Legal/Compliance Landscape

*Regulatory environment, compliance challenges, legal team structure.*

## Competitive Intelligence

*Incumbent vendors, evaluation history, competitive positioning.*

## News & Signals

*Recent news, earnings mentions, leadership changes.*
`
      },
      {
        name: "Next Steps.md",
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: next_steps
auto_updated: true
last_updated: ${dateStr}
sync_to_salesforce: false
---

# ${account.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`
      }
    ];
    for (const subnote of subnotes) {
      const notePath = `${folderPath}/${subnote.name}`;
      await this.app.vault.create(notePath, subnote.content);
    }
  }
  /**
   * Create full account subnotes (used by both regular users and admin-owned accounts)
   */
  async createFullAccountSubnotes(folderPath, account, dateStr) {
    const subnotes = [
      {
        name: "Note 1.md",
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: meeting_note
sync_to_salesforce: false
created: ${dateStr}
---

# ${account.name} - Meeting Note

**Date:** 
**Attendees:** 

---

## Discussion

*Add meeting notes here...*

---

## Next Steps

- [ ] 

`
      },
      {
        name: "Next Steps.md",
        content: `---
account: "${account.name}"
account_id: "${account.id}"
type: next_steps
auto_updated: true
last_updated: ${dateStr}
sync_to_salesforce: false
---

# ${account.name} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*No next steps yet. Record a meeting to auto-populate.*

---

## History

*Previous next steps will be archived here.*
`
      }
    ];
    for (const subnote of subnotes) {
      const notePath = `${folderPath}/${subnote.name}`;
      await this.app.vault.create(notePath, subnote.content);
    }
  }
  /**
   * Ensure Pipeline folder exists for admin pipeline review notes
   */
  async ensurePipelineFolderExists() {
    const pipelineFolder = "Pipeline";
    const dashboardPath = `${pipelineFolder}/Pipeline Review Notes.md`;
    const folder = this.app.vault.getAbstractFileByPath(pipelineFolder);
    if (!folder) {
      await this.app.vault.createFolder(pipelineFolder);
    }
    const dashboard = this.app.vault.getAbstractFileByPath(dashboardPath);
    if (!dashboard) {
      const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const content = `---
type: pipeline_dashboard
auto_updated: true
last_updated: ${dateStr}
---

# Pipeline Review Notes

This folder contains transcribed notes from internal pipeline review meetings.

## How It Works

1. **Record** a pipeline review meeting (forecast call, deal review, etc.)
2. **Transcribe** using the microphone - the system detects it's a pipeline meeting
3. **Account updates** are extracted per-account discussed
4. **This dashboard** aggregates all pipeline review notes

---

## Recent Pipeline Reviews

| Date | Meeting | Key Updates |
|------|---------|-------------|
|      |         |             |

---

## Pipeline Health Snapshot

*Updated after each pipeline review meeting.*

### Accounts Advancing
*None yet*

### Accounts At Risk
*None yet*

### New Opportunities
*None yet*
`;
      await this.app.vault.create(dashboardPath, content);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────
  // NEXT STEPS MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Ensure the Next Steps folder exists with the dashboard file
   */
  async ensureNextStepsFolderExists() {
    const nextStepsFolder = "Next Steps";
    const dashboardPath = `${nextStepsFolder}/All Next Steps.md`;
    const folder = this.app.vault.getAbstractFileByPath(nextStepsFolder);
    if (!folder) {
      await this.app.vault.createFolder(nextStepsFolder);
    }
    const dashboard = this.app.vault.getAbstractFileByPath(dashboardPath);
    if (!dashboard) {
      const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const timeStr = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const content = `---
type: next_steps_dashboard
auto_updated: true
last_updated: ${dateStr}
---

# All Next Steps Dashboard

*Last updated: ${dateStr} ${timeStr}*

---

## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;
      await this.app.vault.create(dashboardPath, content);
    }
  }
  /**
   * Update an account's Next Steps.md file after transcription
   * Appends to history instead of overwriting
   */
  async updateAccountNextSteps(accountName, nextStepsContent, sourceNotePath) {
    try {
      console.log(`[Eudia] updateAccountNextSteps called for: ${accountName}`);
      console.log(`[Eudia] Content length: ${nextStepsContent?.length || 0} chars`);
      const safeName = accountName.replace(/[<>:"/\\|?*]/g, "_").trim();
      const nextStepsPath = `${this.settings.accountsFolder}/${safeName}/Next Steps.md`;
      console.log(`[Eudia] Looking for Next Steps file at: ${nextStepsPath}`);
      const nextStepsFile = this.app.vault.getAbstractFileByPath(nextStepsPath);
      if (!nextStepsFile || !(nextStepsFile instanceof import_obsidian3.TFile)) {
        console.log(`[Eudia] \u274C Next Steps file NOT FOUND at: ${nextStepsPath}`);
        const accountFolder = this.app.vault.getAbstractFileByPath(`${this.settings.accountsFolder}/${safeName}`);
        if (accountFolder && accountFolder instanceof import_obsidian3.TFolder) {
          console.log(`[Eudia] Files in ${safeName} folder:`, accountFolder.children.map((c) => c.name));
        } else {
          console.log(`[Eudia] Account folder also not found: ${this.settings.accountsFolder}/${safeName}`);
        }
        return;
      }
      console.log(`[Eudia] Found Next Steps file, updating...`);
      const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const timeStr = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const sourceNote = sourceNotePath.split("/").pop()?.replace(".md", "") || "Meeting";
      let formattedNextSteps = nextStepsContent;
      if (!nextStepsContent.includes("- [ ]") && !nextStepsContent.includes("- [x]")) {
        formattedNextSteps = nextStepsContent.split("\n").filter((line) => line.trim()).map((line) => {
          const cleaned = line.replace(/^[-•*]\s*/, "").trim();
          return cleaned ? `- [ ] ${cleaned}` : "";
        }).filter(Boolean).join("\n");
      }
      const existingContent = await this.app.vault.read(nextStepsFile);
      let existingHistory = "";
      const historyMatch = existingContent.match(/## History\n\n\*Previous next steps are archived below\.\*\n\n([\s\S]*?)$/);
      if (historyMatch && historyMatch[1]) {
        existingHistory = historyMatch[1].trim();
      }
      const newHistoryEntry = `### ${dateStr} - ${sourceNote}
${formattedNextSteps || "*None*"}`;
      const combinedHistory = existingHistory ? `${newHistoryEntry}

---

${existingHistory}` : newHistoryEntry;
      const newContent = `---
account: "${accountName}"
account_id: "${this.settings.cachedAccounts.find((a) => a.name === accountName)?.id || ""}"
type: next_steps
auto_updated: true
last_updated: ${dateStr}
sync_to_salesforce: false
---

# ${accountName} - Next Steps

*This note is automatically updated after each meeting transcription.*

## Current Next Steps

*Last updated: ${dateStr} ${timeStr} from ${sourceNote}*

${formattedNextSteps || "*No next steps identified*"}

---

## History

*Previous next steps are archived below.*

${combinedHistory}
`;
      await this.app.vault.modify(nextStepsFile, newContent);
      console.log(`[Eudia] Updated Next Steps for ${accountName} (history preserved)`);
      await this.regenerateNextStepsDashboard();
    } catch (error) {
      console.error(`[Eudia] Failed to update Next Steps for ${accountName}:`, error);
    }
  }
  /**
   * Regenerate the All Next Steps dashboard by scanning all account folders
   */
  async regenerateNextStepsDashboard() {
    try {
      const dashboardPath = "Next Steps/All Next Steps.md";
      const dashboardFile = this.app.vault.getAbstractFileByPath(dashboardPath);
      if (!dashboardFile || !(dashboardFile instanceof import_obsidian3.TFile)) {
        await this.ensureNextStepsFolderExists();
        return;
      }
      const accountsFolder = this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);
      if (!accountsFolder || !(accountsFolder instanceof import_obsidian3.TFolder)) {
        return;
      }
      const accountNextSteps = [];
      for (const child of accountsFolder.children) {
        if (child instanceof import_obsidian3.TFolder) {
          const nextStepsPath = `${child.path}/Next Steps.md`;
          const nextStepsFile = this.app.vault.getAbstractFileByPath(nextStepsPath);
          if (nextStepsFile instanceof import_obsidian3.TFile) {
            const content = await this.app.vault.read(nextStepsFile);
            const lastUpdatedMatch = content.match(/last_updated:\s*(\d{4}-\d{2}-\d{2})/);
            const lastUpdated = lastUpdatedMatch ? lastUpdatedMatch[1] : "Unknown";
            const nextStepsLines = content.split("\n").filter((line) => line.match(/^- \[[ x]\]/)).slice(0, 5);
            if (nextStepsLines.length > 0 || lastUpdated !== "Unknown") {
              accountNextSteps.push({
                account: child.name,
                lastUpdated,
                nextSteps: nextStepsLines
              });
            }
          }
        }
      }
      accountNextSteps.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
      const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const timeStr = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      let dashboardContent = `---
type: next_steps_dashboard
auto_updated: true
last_updated: ${dateStr}
---

# All Next Steps Dashboard

*Last updated: ${dateStr} ${timeStr}*

---

`;
      if (accountNextSteps.length === 0) {
        dashboardContent += `## Your Next Steps

*Complete your first meeting transcription to see next steps here.*

---

## Recently Updated

| Account | Last Updated | Status |
|---------|--------------|--------|
| *None yet* | - | Complete a meeting transcription |
`;
      } else {
        for (const item of accountNextSteps) {
          dashboardContent += `## ${item.account}

`;
          if (item.nextSteps.length > 0) {
            dashboardContent += item.nextSteps.join("\n") + "\n";
          } else {
            dashboardContent += "*No current next steps*\n";
          }
          dashboardContent += `
*Updated: ${item.lastUpdated}*

---

`;
        }
        dashboardContent += `## Summary

`;
        dashboardContent += `| Account | Last Updated | Open Items |
`;
        dashboardContent += `|---------|--------------|------------|
`;
        for (const item of accountNextSteps) {
          const openCount = item.nextSteps.filter((s) => s.includes("- [ ]")).length;
          dashboardContent += `| ${item.account} | ${item.lastUpdated} | ${openCount} |
`;
        }
      }
      await this.app.vault.modify(dashboardFile, dashboardContent);
      console.log("[Eudia] Regenerated All Next Steps dashboard");
    } catch (error) {
      console.error("[Eudia] Failed to regenerate Next Steps dashboard:", error);
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
      this.micRibbonIcon?.addClass("eudia-ribbon-recording");
      const updateInterval = setInterval(() => {
        if (this.audioRecorder?.isRecording()) {
          const state = this.audioRecorder.getState();
          this.recordingStatusBar?.updateState(state);
        } else {
          clearInterval(updateInterval);
        }
      }, 100);
      this.liveTranscript = "";
      this.startLiveTranscription();
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
      this.micRibbonIcon?.removeClass("eudia-ribbon-recording");
      this.stopLiveTranscription();
      this.recordingStatusBar?.hide();
      this.recordingStatusBar = null;
      this.audioRecorder = null;
    }
  }
  async cancelRecording() {
    if (this.audioRecorder?.isRecording()) {
      this.audioRecorder.cancel();
    }
    this.micRibbonIcon?.removeClass("eudia-ribbon-recording");
    this.stopLiveTranscription();
    this.recordingStatusBar?.hide();
    this.recordingStatusBar = null;
    this.audioRecorder = null;
    new import_obsidian3.Notice("Transcription cancelled");
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // LIVE TRANSCRIPTION - Periodic chunk transcription for live query support
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Start periodic chunk transcription for live query support.
   * Transcribes audio chunks every 2 minutes during recording.
   */
  startLiveTranscription() {
    this.stopLiveTranscription();
    const CHUNK_INTERVAL_MS = 12e4;
    this.liveTranscriptChunkInterval = setInterval(async () => {
      await this.transcribeCurrentChunk();
    }, CHUNK_INTERVAL_MS);
    setTimeout(async () => {
      if (this.audioRecorder?.isRecording()) {
        await this.transcribeCurrentChunk();
      }
    }, 3e4);
    console.log("[Eudia] Live transcription started");
  }
  /**
   * Stop periodic chunk transcription
   */
  stopLiveTranscription() {
    if (this.liveTranscriptChunkInterval) {
      clearInterval(this.liveTranscriptChunkInterval);
      this.liveTranscriptChunkInterval = null;
    }
    console.log("[Eudia] Live transcription stopped");
  }
  /**
   * Transcribe the current audio chunk and append to live transcript
   */
  async transcribeCurrentChunk() {
    if (!this.audioRecorder?.isRecording() || this.isTranscribingChunk) {
      return;
    }
    const chunkBlob = this.audioRecorder.extractNewChunks();
    if (!chunkBlob || chunkBlob.size < 5e3) {
      return;
    }
    this.isTranscribingChunk = true;
    console.log(`[Eudia] Transcribing chunk: ${chunkBlob.size} bytes`);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise((resolve, reject) => {
        reader.onload = () => {
          const result2 = reader.result;
          const base642 = result2.split(",")[1];
          resolve(base642);
        };
        reader.onerror = reject;
        reader.readAsDataURL(chunkBlob);
      });
      const base64 = await base64Promise;
      const mimeType = this.audioRecorder.getMimeType();
      const result = await this.transcriptionService.transcribeChunk(base64, mimeType);
      if (result.success && result.text) {
        this.liveTranscript += (this.liveTranscript ? "\n\n" : "") + result.text;
        console.log(`[Eudia] Chunk transcribed, total transcript length: ${this.liveTranscript.length}`);
      }
    } catch (error) {
      console.error("[Eudia] Chunk transcription error:", error);
    } finally {
      this.isTranscribingChunk = false;
    }
  }
  /**
   * Open the live query modal to query the accumulated transcript
   */
  openLiveQueryModal() {
    const modal = new import_obsidian3.Modal(this.app);
    modal.titleEl.setText("Query Live Transcript");
    const contentEl = modal.contentEl;
    contentEl.addClass("eudia-live-query-modal");
    const instructionsEl = contentEl.createDiv({ cls: "eudia-live-query-instructions" });
    instructionsEl.setText(`Ask a question about what has been discussed so far (${Math.round(this.liveTranscript.length / 4)} words captured):`);
    const inputEl = contentEl.createEl("textarea", {
      cls: "eudia-live-query-input",
      attr: {
        placeholder: 'e.g., "What did Tom say about pricing?" or "What were the main concerns raised?"',
        rows: "3"
      }
    });
    const responseEl = contentEl.createDiv({ cls: "eudia-live-query-response" });
    responseEl.style.display = "none";
    const buttonEl = contentEl.createEl("button", {
      text: "Ask",
      cls: "eudia-btn-primary"
    });
    buttonEl.addEventListener("click", async () => {
      const question = inputEl.value.trim();
      if (!question) {
        new import_obsidian3.Notice("Please enter a question");
        return;
      }
      buttonEl.disabled = true;
      buttonEl.setText("Searching...");
      responseEl.style.display = "block";
      responseEl.setText("Searching transcript...");
      responseEl.addClass("eudia-loading");
      try {
        const result = await this.transcriptionService.liveQueryTranscript(
          question,
          this.liveTranscript,
          this.getAccountNameFromActiveFile()
        );
        responseEl.removeClass("eudia-loading");
        if (result.success) {
          responseEl.setText(result.answer);
        } else {
          responseEl.setText(result.error || "Failed to query transcript");
          responseEl.addClass("eudia-error");
        }
      } catch (error) {
        responseEl.removeClass("eudia-loading");
        responseEl.setText(`Error: ${error.message}`);
        responseEl.addClass("eudia-error");
      } finally {
        buttonEl.disabled = false;
        buttonEl.setText("Ask");
      }
    });
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        buttonEl.click();
      }
    });
    modal.open();
    inputEl.focus();
  }
  /**
   * Get account name from the currently active file path
   */
  getAccountNameFromActiveFile() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile)
      return void 0;
    const pathMatch = activeFile.path.match(/Accounts\/([^\/]+)\//i);
    if (pathMatch) {
      return pathMatch[1];
    }
    return void 0;
  }
  async processRecording(result, file) {
    const blobSize = result.audioBlob?.size || 0;
    console.log(`[Eudia] Audio blob size: ${blobSize} bytes, duration: ${result.duration}s`);
    if (blobSize < 1e3) {
      new import_obsidian3.Notice("Recording too short or no audio captured. Please try again.");
      return;
    }
    try {
      const diagnostic = await AudioRecorder.analyzeAudioBlob(result.audioBlob);
      console.log(`[Eudia] Audio diagnostic: hasAudio=${diagnostic.hasAudio}, peak=${diagnostic.peakLevel}, silent=${diagnostic.silentPercent}%`);
      if (diagnostic.warning) {
        console.warn(`[Eudia] Audio warning: ${diagnostic.warning}`);
        if (!diagnostic.hasAudio) {
          new import_obsidian3.Notice("Warning: Audio appears to be silent. Transcription may not work correctly. Check your microphone settings.", 8e3);
        } else {
          new import_obsidian3.Notice(`Warning: ${diagnostic.warning.split(":")[0]}`, 5e3);
        }
      }
    } catch (diagError) {
      console.warn("[Eudia] Audio diagnostic failed, continuing anyway:", diagError);
    }
    const durationMin = Math.ceil(result.duration / 60);
    const estimatedTime = Math.max(1, Math.ceil(durationMin / 5));
    new import_obsidian3.Notice(`Transcription started. Estimated ${estimatedTime}-${estimatedTime + 1} minutes.`);
    const currentContent = await this.app.vault.read(file);
    const processingIndicator = `

---
**Transcription in progress...**
Started: ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}
Estimated completion: ${estimatedTime}-${estimatedTime + 1} minutes

*You can navigate away. Check back shortly.*
---
`;
    await this.app.vault.modify(file, currentContent + processingIndicator);
    this.processTranscriptionAsync(result, file).catch((error) => {
      console.error("Background transcription failed:", error);
      new import_obsidian3.Notice(`Transcription failed: ${error.message}`);
    });
  }
  async processTranscriptionAsync(result, file) {
    try {
      let accountContext = {};
      const pathParts = file.path.split("/");
      console.log(`[Eudia] Processing transcription for: ${file.path}`);
      console.log(`[Eudia] Path parts: ${JSON.stringify(pathParts)}, accountsFolder: ${this.settings.accountsFolder}`);
      const isPipelineMeetingPath = pathParts[0] === "Pipeline Meetings";
      let isPipelineReview = false;
      try {
        const fileContent = await this.app.vault.read(file);
        const fmMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          isPipelineReview = /meeting_type:\s*pipeline_review/.test(fmMatch[1]);
        }
      } catch {
      }
      if (!isPipelineReview && isPipelineMeetingPath) {
        isPipelineReview = true;
      }
      if (isPipelineReview) {
        console.log(`[Eudia Pipeline] Detected pipeline review meeting, using pipeline prompt`);
        let pipelineContext = "";
        try {
          const resp = await (0, import_obsidian3.requestUrl)({
            url: `${this.settings.serverUrl || "https://gtm-brain.onrender.com"}/api/pipeline-context`,
            method: "GET",
            headers: { "Content-Type": "application/json" }
          });
          if (resp.json?.success && resp.json?.context) {
            pipelineContext = resp.json.context;
            console.log(`[Eudia Pipeline] Loaded Salesforce pipeline context (${pipelineContext.length} chars)`);
          }
        } catch (e) {
          console.warn("[Eudia Pipeline] Could not fetch pipeline context:", e);
        }
        accountContext = { meetingType: "pipeline_review", pipelineContext };
      } else if (pathParts.length >= 2 && pathParts[0] === this.settings.accountsFolder) {
        const accountName = pathParts[1];
        console.log(`[Eudia] Detected account folder: ${accountName}`);
        const account = this.settings.cachedAccounts.find(
          (a) => a.name.toLowerCase() === accountName.toLowerCase()
        );
        if (account) {
          accountContext = { accountName: account.name, accountId: account.id };
          console.log(`[Eudia] Found cached account: ${account.name} (${account.id})`);
        } else {
          accountContext = { accountName, accountId: "" };
          console.log(`[Eudia] Account not in cache, using folder name: ${accountName}`);
        }
      } else {
        console.log(`[Eudia] File not in Accounts folder, skipping account context`);
      }
      let speakerHints = [];
      try {
        const currentMeeting = await this.calendarService.getCurrentMeeting();
        if (currentMeeting.meeting?.attendees) {
          speakerHints = currentMeeting.meeting.attendees.map((a) => a.name || a.email.split("@")[0]).filter(Boolean).slice(0, 10);
        }
      } catch {
      }
      const transcription = await this.transcriptionService.transcribeAudio(
        result.audioBlob,
        { ...accountContext, speakerHints }
      );
      const hasContent = (s) => {
        if (!s)
          return false;
        return Boolean(s.summary?.trim() || s.nextSteps?.trim());
      };
      let sections = transcription.sections;
      if (!hasContent(sections)) {
        if (transcription.text?.trim()) {
          sections = await this.transcriptionService.processTranscription(transcription.text, accountContext);
        }
      }
      if (!hasContent(sections) && !transcription.text?.trim()) {
        const currentContent = await this.app.vault.read(file);
        const cleanedContent = currentContent.replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away\. Check back shortly\.\*\n---\n/g, "");
        await this.app.vault.modify(file, cleanedContent + "\n\n**Transcription failed:** No audio detected.\n");
        new import_obsidian3.Notice("Transcription failed: No audio detected.");
        return;
      }
      let noteContent;
      if (isPipelineReview) {
        noteContent = this.buildPipelineNoteContent(sections, transcription, file.path);
      } else {
        noteContent = this.buildNoteContent(sections, transcription);
      }
      await this.app.vault.modify(file, noteContent);
      const durationMin = Math.floor(result.duration / 60);
      new import_obsidian3.Notice(`Transcription complete (${durationMin} min recording)`);
      if (!isPipelineReview) {
        const nextStepsContent = sections.nextSteps || sections.actionItems;
        console.log(`[Eudia] Next Steps extraction - accountContext: ${accountContext?.accountName || "undefined"}`);
        console.log(`[Eudia] Next Steps content found: ${nextStepsContent ? "YES (" + nextStepsContent.length + " chars)" : "NO"}`);
        console.log(`[Eudia] sections.nextSteps: ${sections.nextSteps ? "YES" : "NO"}, sections.actionItems: ${sections.actionItems ? "YES" : "NO"}`);
        if (nextStepsContent && accountContext?.accountName) {
          console.log(`[Eudia] Calling updateAccountNextSteps for ${accountContext.accountName}`);
          await this.updateAccountNextSteps(accountContext.accountName, nextStepsContent, file.path);
        } else {
          console.log(`[Eudia] Skipping Next Steps update - missing content or account context`);
        }
      }
      if (this.settings.autoSyncAfterTranscription) {
        await this.syncNoteToSalesforce();
      }
    } catch (error) {
      try {
        const currentContent = await this.app.vault.read(file);
        const cleanedContent = currentContent.replace(/\n\n---\n\*\*Transcription in progress\.\.\.\*\*[\s\S]*?\*You can navigate away\. Check back shortly\.\*\n---\n/g, "");
        await this.app.vault.modify(file, cleanedContent + `

**Transcription failed:** ${error.message}
`);
      } catch (e) {
      }
      throw error;
    }
  }
  /**
   * Build formatted note content for pipeline review meetings.
   * The LLM output from the pipeline prompt is already structured with
   * markdown headers and tables, so we wrap it with frontmatter and the
   * raw transcript.
   */
  buildPipelineNoteContent(sections, transcription, filePath) {
    const today = /* @__PURE__ */ new Date();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const yy = String(today.getFullYear()).slice(-2);
    const dateStr = today.toISOString().split("T")[0];
    const formattedDate = `${mm}.${dd}.${yy}`;
    const ensureString = (val) => {
      if (val === null || val === void 0)
        return "";
      if (Array.isArray(val))
        return val.map(String).join("\n");
      if (typeof val === "object")
        return JSON.stringify(val, null, 2);
      return String(val);
    };
    const summaryContent = ensureString(sections.summary);
    const transcript = transcription.transcript || transcription.text || "";
    let content = `---
title: "Team Pipeline Meeting - ${formattedDate}"
date: ${dateStr}
meeting_type: pipeline_review
transcribed: true
---

# Weekly Pipeline Review | ${today.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}

`;
    if (summaryContent) {
      content += summaryContent;
    } else {
      const allSectionContent = [
        sections.painPoints,
        sections.productInterest,
        sections.nextSteps,
        sections.actionItems
      ].filter(Boolean).map(ensureString).join("\n\n");
      if (allSectionContent) {
        content += allSectionContent;
      } else {
        content += "*Pipeline summary could not be generated. See transcript below.*";
      }
    }
    if (transcript) {
      content += `

---

<details>
<summary><strong>Full Transcript</strong> (${Math.ceil(transcript.length / 1e3)}k chars)</summary>

${transcript}

</details>
`;
    }
    return content;
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
  // INTELLIGENCE QUERY (GRANOLA-STYLE)
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Open the Intelligence Query modal (no account context)
   */
  openIntelligenceQuery() {
    new IntelligenceQueryModal(this.app, this).open();
  }
  /**
   * Open the Intelligence Query modal with account context from current note
   */
  openIntelligenceQueryForCurrentNote() {
    const activeFile = this.app.workspace.getActiveFile();
    let accountContext = void 0;
    if (activeFile) {
      const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
      if (frontmatter?.account_id && frontmatter?.account) {
        accountContext = {
          id: frontmatter.account_id,
          name: frontmatter.account
        };
      } else if (frontmatter?.account) {
        const account = this.settings.cachedAccounts.find(
          (a) => a.name.toLowerCase() === frontmatter.account.toLowerCase()
        );
        if (account) {
          accountContext = { id: account.id, name: account.name };
        } else {
          accountContext = { id: "", name: frontmatter.account };
        }
      } else {
        const pathParts = activeFile.path.split("/");
        if (pathParts.length >= 2 && pathParts[0] === this.settings.accountsFolder) {
          const folderName = pathParts[1];
          const account = this.settings.cachedAccounts.find(
            (a) => a.name.replace(/[<>:"/\\|?*]/g, "_").trim() === folderName
          );
          if (account) {
            accountContext = { id: account.id, name: account.name };
          } else {
            accountContext = { id: "", name: folderName };
          }
        }
      }
    }
    new IntelligenceQueryModal(this.app, this, accountContext).open();
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
  /**
   * Scan local account folders in the vault instead of fetching from server.
   * This uses ONLY the pre-loaded account folders, avoiding unwanted Salesforce accounts.
   */
  async scanLocalAccountFolders() {
    try {
      const accountsFolder = this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);
      if (!accountsFolder || !(accountsFolder instanceof import_obsidian3.TFolder)) {
        return;
      }
      const accounts = [];
      for (const child of accountsFolder.children) {
        if (child instanceof import_obsidian3.TFolder) {
          accounts.push({
            id: `local-${child.name.replace(/\s+/g, "-").toLowerCase()}`,
            name: child.name
          });
        }
      }
      this.settings.cachedAccounts = accounts;
      this.settings.lastSyncTime = (/* @__PURE__ */ new Date()).toISOString();
      await this.saveSettings();
    } catch (error) {
      console.error("Failed to scan local account folders:", error);
    }
  }
  /**
   * Refresh account folders by checking for new account assignments
   * Creates folders for any accounts the user owns but doesn't have folders for
   * Returns the number of new folders created
   */
  async refreshAccountFolders() {
    if (!this.settings.userEmail) {
      throw new Error("Please configure your email first");
    }
    const ownershipService = new AccountOwnershipService(this.settings.serverUrl);
    const ownedAccounts = await ownershipService.getAccountsForUser(this.settings.userEmail);
    if (ownedAccounts.length === 0) {
      console.log("[Eudia] No accounts found for user");
      return 0;
    }
    const accountsFolder = this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);
    const existingFolderNames = [];
    if (accountsFolder && accountsFolder instanceof import_obsidian3.TFolder) {
      for (const child of accountsFolder.children) {
        if (child instanceof import_obsidian3.TFolder) {
          existingFolderNames.push(child.name);
        }
      }
    }
    const newAccounts = await ownershipService.getNewAccounts(
      this.settings.userEmail,
      existingFolderNames
    );
    if (newAccounts.length === 0) {
      console.log("[Eudia] All account folders exist");
      return 0;
    }
    console.log(`[Eudia] Creating ${newAccounts.length} new account folders`);
    await this.createTailoredAccountFolders(newAccounts);
    return newAccounts.length;
  }
  /**
   * Check for server-side sync flags (e.g. resync_accounts from cron or admin push).
   * If flags are found, trigger the appropriate action and consume the flags.
   */
  async checkAndConsumeSyncFlags() {
    if (!this.settings.userEmail)
      return;
    const email = encodeURIComponent(this.settings.userEmail.toLowerCase().trim());
    const serverUrl = this.settings.serverUrl || "https://gtm-wizard.onrender.com";
    try {
      const flagsResponse = await (0, import_obsidian3.requestUrl)({
        url: `${serverUrl}/api/admin/users/${email}/sync-flags`,
        method: "GET"
      });
      const flags = flagsResponse.json?.flags || [];
      const pendingFlags = flags.filter((f) => !f.consumed_at);
      if (pendingFlags.length === 0)
        return;
      console.log(`[Eudia] Found ${pendingFlags.length} pending sync flag(s)`);
      let needsResync = false;
      for (const flag of pendingFlags) {
        if (flag.flag === "resync_accounts") {
          needsResync = true;
          const payload = flag.payload || {};
          const added = payload.added?.length || 0;
          const removed = payload.removed?.length || 0;
          console.log(`[Eudia] Sync flag: resync_accounts (+${added} / -${removed})`);
        } else if (flag.flag === "update_plugin") {
          new import_obsidian3.Notice("A plugin update is available. Please download the latest vault.");
        } else if (flag.flag === "reset_setup") {
          console.log("[Eudia] Sync flag: reset_setup received");
          this.settings.setupCompleted = false;
          await this.saveSettings();
          new import_obsidian3.Notice("Setup has been reset by admin. Please re-run the setup wizard.");
        }
      }
      if (needsResync) {
        console.log("[Eudia] Triggering account folder resync from sync flag...");
        new import_obsidian3.Notice("Syncing account updates...");
        const result = await this.syncAccountFolders();
        if (result.success) {
          new import_obsidian3.Notice(`Account sync complete: ${result.added} new, ${result.archived} archived`);
        } else {
          console.log(`[Eudia] Account resync error: ${result.error}`);
        }
      }
      try {
        await (0, import_obsidian3.requestUrl)({
          url: `${serverUrl}/api/admin/users/${email}/sync-flags/consume`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flagIds: pendingFlags.map((f) => f.id) })
        });
        console.log(`[Eudia] Consumed ${pendingFlags.length} sync flag(s)`);
      } catch (consumeErr) {
        console.log("[Eudia] Failed to consume sync flags (will retry next startup)");
      }
    } catch (err) {
      console.log("[Eudia] Sync flag check skipped (endpoint not available)");
    }
  }
  /**
   * Sync account folders with Salesforce using the BL Book of Business endpoint
   * - Adapts folder creation based on user group (admin, exec, sales_leader, cs, bl)
   * - Adds new accounts as folders
   * - Optionally archives removed accounts
   * Returns sync result with counts
   */
  async syncAccountFolders() {
    if (!this.settings.userEmail) {
      return { success: false, added: 0, archived: 0, error: "No email configured" };
    }
    const email = this.settings.userEmail.toLowerCase().trim();
    console.log(`[Eudia] Syncing account folders for: ${email}`);
    try {
      const response = await fetch(`${this.settings.serverUrl}/api/bl-accounts/${encodeURIComponent(email)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }
      const data = await response.json();
      if (!data.success || !data.accounts) {
        throw new Error(data.error || "Invalid response from server");
      }
      const userGroup = data.meta?.userGroup || "bl";
      const queryDescription = data.meta?.queryDescription || "accounts";
      const region = data.meta?.region || null;
      console.log(`[Eudia] User group: ${userGroup}, accounts: ${data.accounts.length} (${queryDescription})`);
      if (region) {
        console.log(`[Eudia] Sales Leader region: ${region}`);
      }
      const serverAccounts = data.accounts || [];
      const serverProspects = data.prospectAccounts || [];
      const totalServerAccounts = serverAccounts.length + serverProspects.length;
      console.log(`[Eudia] Server returned: ${serverAccounts.length} active + ${serverProspects.length} prospects = ${totalServerAccounts} total`);
      const accountsFolderObj = this.app.vault.getAbstractFileByPath(this.settings.accountsFolder);
      const existingFolders = /* @__PURE__ */ new Map();
      const prospectsPath = `${this.settings.accountsFolder}/_Prospects`;
      const prospectsFolderObj = this.app.vault.getAbstractFileByPath(prospectsPath);
      const existingProspectFiles = /* @__PURE__ */ new Map();
      if (accountsFolderObj && accountsFolderObj instanceof import_obsidian3.TFolder) {
        for (const child of accountsFolderObj.children) {
          if (child instanceof import_obsidian3.TFolder && !child.name.startsWith("_")) {
            existingFolders.set(child.name.toLowerCase().trim(), child);
          }
        }
      }
      if (prospectsFolderObj && prospectsFolderObj instanceof import_obsidian3.TFolder) {
        for (const child of prospectsFolderObj.children) {
          if (child instanceof import_obsidian3.TFile && child.extension === "md") {
            const baseName = child.basename.toLowerCase().trim();
            existingProspectFiles.set(baseName, child);
          }
        }
      }
      const serverAccountNames = new Set(serverAccounts.map((a) => a.name.toLowerCase().trim()));
      const newAccounts = serverAccounts.filter((account) => {
        const normalizedName = account.name.toLowerCase().trim();
        return !existingFolders.has(normalizedName);
      });
      const newProspects = serverProspects.filter((prospect) => {
        const safeName = prospect.name.replace(/[<>:"/\\|?*]/g, "_").trim().toLowerCase();
        return !existingProspectFiles.has(safeName) && !existingFolders.has(prospect.name.toLowerCase().trim());
      });
      const promotedAccounts = [];
      for (const account of serverAccounts) {
        const safeName = account.name.replace(/[<>:"/\\|?*]/g, "_").trim().toLowerCase();
        if (existingProspectFiles.has(safeName) && !existingFolders.has(account.name.toLowerCase().trim())) {
          promotedAccounts.push(account);
        }
      }
      const allServerNames = /* @__PURE__ */ new Set([
        ...serverAccounts.map((a) => a.name.toLowerCase().trim()),
        ...serverProspects.map((a) => a.name.toLowerCase().trim())
      ]);
      const removedFolders = [];
      if (userGroup === "bl") {
        for (const [normalizedName, folder] of existingFolders.entries()) {
          if (!allServerNames.has(normalizedName)) {
            removedFolders.push(folder);
          }
        }
      }
      let addedCount = 0;
      let archivedCount = 0;
      let promotedCount = 0;
      let prospectAddedCount = 0;
      if (promotedAccounts.length > 0) {
        console.log(`[Eudia] Promoting ${promotedAccounts.length} accounts from prospect to active`);
        for (const account of promotedAccounts) {
          const safeName = account.name.replace(/[<>:"/\\|?*]/g, "_").trim();
          const prospectFile = existingProspectFiles.get(safeName.toLowerCase());
          if (prospectFile) {
            try {
              await this.app.vault.delete(prospectFile);
              await this.createTailoredAccountFolders([{
                id: account.id,
                name: account.name,
                type: account.customerType,
                isOwned: true,
                hadOpportunity: true
              }]);
              promotedCount++;
              new import_obsidian3.Notice(`${account.name} promoted to active -- full account folder created`);
            } catch (err) {
              console.error(`[Eudia] Failed to promote ${account.name}:`, err);
            }
          }
        }
      }
      if (newAccounts.length > 0) {
        console.log(`[Eudia] Creating ${newAccounts.length} new active account folders for ${userGroup}`);
        const promotedNames = new Set(promotedAccounts.map((a) => a.name.toLowerCase().trim()));
        const nonPromotedNew = newAccounts.filter((a) => !promotedNames.has(a.name.toLowerCase().trim()));
        if (nonPromotedNew.length > 0) {
          const accountsToCreate = nonPromotedNew.map((a) => ({
            id: a.id,
            name: a.name,
            type: a.customerType,
            isOwned: userGroup === "bl",
            ownerName: a.ownerName,
            hadOpportunity: true
          }));
          if (userGroup === "admin" || userGroup === "exec") {
            await this.createAdminAccountFolders(accountsToCreate);
          } else {
            await this.createTailoredAccountFolders(accountsToCreate);
          }
          addedCount = nonPromotedNew.length;
        }
        if (this.telemetry) {
          this.telemetry.reportInfo("Accounts synced - added", {
            count: addedCount,
            userGroup,
            region: region || void 0
          });
        }
      }
      if (newProspects.length > 0 && userGroup === "bl") {
        console.log(`[Eudia] Creating ${newProspects.length} new prospect files`);
        prospectAddedCount = await this.createProspectAccountFiles(newProspects.map((p) => ({
          id: p.id,
          name: p.name,
          type: "Prospect",
          hadOpportunity: false,
          website: p.website,
          industry: p.industry
        })));
      }
      if (this.settings.archiveRemovedAccounts && removedFolders.length > 0) {
        console.log(`[Eudia] Archiving ${removedFolders.length} removed account folders`);
        archivedCount = await this.archiveAccountFolders(removedFolders);
        if (this.telemetry) {
          this.telemetry.reportInfo("Accounts synced - archived", { count: archivedCount });
        }
      }
      console.log(`[Eudia] Sync complete: ${addedCount} active added, ${prospectAddedCount} prospects added, ${promotedCount} promoted, ${archivedCount} archived (group: ${userGroup})`);
      return { success: true, added: addedCount + prospectAddedCount + promotedCount, archived: archivedCount, userGroup };
    } catch (error) {
      console.error("[Eudia] Account sync error:", error);
      if (this.telemetry) {
        this.telemetry.reportError("Account sync failed", { error: error.message });
      }
      return { success: false, added: 0, archived: 0, error: error.message };
    }
  }
  /**
   * Archive account folders by moving them to _Archived directory
   * Preserves all content, just moves the folder
   */
  async archiveAccountFolders(folders) {
    let archivedCount = 0;
    const archivePath = `${this.settings.accountsFolder}/_Archived`;
    let archiveFolder = this.app.vault.getAbstractFileByPath(archivePath);
    if (!archiveFolder) {
      await this.app.vault.createFolder(archivePath);
    }
    for (const folder of folders) {
      try {
        const newPath = `${archivePath}/${folder.name}`;
        const existing = this.app.vault.getAbstractFileByPath(newPath);
        if (existing) {
          const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          await this.app.fileManager.renameFile(folder, `${archivePath}/${folder.name}_${timestamp}`);
        } else {
          await this.app.fileManager.renameFile(folder, newPath);
        }
        const markerPath = `${archivePath}/${folder.name}/_archived.md`;
        const markerContent = `---
archived_date: ${(/* @__PURE__ */ new Date()).toISOString()}
reason: Account no longer in book of business
---

This account folder was archived because it no longer appears in your Salesforce book of business.

To restore, move this folder back to the Accounts directory.
`;
        try {
          await this.app.vault.create(markerPath, markerContent);
        } catch (e) {
        }
        archivedCount++;
        console.log(`[Eudia] Archived: ${folder.name}`);
      } catch (error) {
        console.error(`[Eudia] Failed to archive ${folder.name}:`, error);
      }
    }
    return archivedCount;
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
        new import_obsidian3.Notice("Synced to Salesforce");
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
  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS DASHBOARD REFRESH
  // ═══════════════════════════════════════════════════════════════════════════
  /**
   * Refresh analytics dashboard notes with data from the API
   * Called when opening analytics notes or on demand
   */
  async refreshAnalyticsDashboard(file) {
    if (!this.settings.userEmail) {
      console.log("[Eudia] Cannot refresh analytics - no email configured");
      return;
    }
    const content = await this.app.vault.read(file);
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch)
      return;
    const frontmatter = frontmatterMatch[1];
    if (!frontmatter.includes("type: analytics_dashboard"))
      return;
    const category = frontmatter.match(/category:\s*(\w+)/)?.[1] || "team";
    console.log(`[Eudia] Refreshing analytics dashboard: ${file.name} (${category})`);
    try {
      let data = null;
      const serverUrl = this.settings.serverUrl;
      const email = encodeURIComponent(this.settings.userEmail);
      switch (category) {
        case "pain_points":
          const ppResponse = await (0, import_obsidian3.requestUrl)({
            url: `${serverUrl}/api/analytics/pain-points?days=30`,
            method: "GET"
          });
          data = ppResponse.json;
          if (data.success) {
            await this.updatePainPointNote(file, data.painPoints);
          }
          break;
        case "objections":
          const objResponse = await (0, import_obsidian3.requestUrl)({
            url: `${serverUrl}/api/analytics/objection-playbook?days=90`,
            method: "GET"
          });
          data = objResponse.json;
          if (data.success) {
            await this.updateObjectionNote(file, data);
          }
          break;
        case "coaching":
        case "team":
        default:
          const teamResponse = await (0, import_obsidian3.requestUrl)({
            url: `${serverUrl}/api/analytics/team-trends?managerId=${email}`,
            method: "GET"
          });
          data = teamResponse.json;
          if (data.success) {
            await this.updateTeamPerformanceNote(file, data.trends);
          }
          break;
      }
      if (data?.success) {
        new import_obsidian3.Notice(`Analytics refreshed: ${file.name}`);
      }
    } catch (error) {
      console.error("[Eudia] Analytics refresh error:", error);
    }
  }
  /**
   * Update pain point tracker note with API data
   */
  async updatePainPointNote(file, painPoints) {
    if (!painPoints || painPoints.length === 0)
      return;
    const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const tableRows = painPoints.slice(0, 10).map(
      (pp) => `| ${pp.painPoint || "--"} | ${pp.count || 0} | ${pp.category || "--"} | ${pp.averageSeverity || "medium"} |`
    ).join("\n");
    const byCategory = {};
    for (const pp of painPoints) {
      const cat = pp.category || "other";
      if (!byCategory[cat])
        byCategory[cat] = [];
      byCategory[cat].push(pp);
    }
    let categoryContent = "";
    for (const [cat, pps] of Object.entries(byCategory)) {
      categoryContent += `
### ${cat.charAt(0).toUpperCase() + cat.slice(1)}
`;
      for (const pp of pps.slice(0, 3)) {
        categoryContent += `- ${pp.painPoint}
`;
      }
    }
    const quotesContent = painPoints.filter((pp) => pp.exampleQuotes && pp.exampleQuotes.length > 0).slice(0, 5).map((pp) => `> "${pp.exampleQuotes[0]}" - on ${pp.painPoint}`).join("\n\n");
    const newContent = `---
type: analytics_dashboard
auto_refresh: true
category: pain_points
last_updated: ${dateStr}
---

# Customer Pain Point Tracker

*Aggregated pain points from customer conversations*

---

## Top Pain Points (Last 30 Days)

| Pain Point | Frequency | Category | Severity |
|------------|-----------|----------|----------|
${tableRows}

---

## By Category
${categoryContent}

---

## Example Quotes

${quotesContent || "*No quotes available*"}

---

> **Tip:** Use these pain points to prepare for customer calls.
`;
    await this.app.vault.modify(file, newContent);
  }
  /**
   * Update objection playbook note with API data
   */
  async updateObjectionNote(file, data) {
    if (!data.objections || data.objections.length === 0)
      return;
    const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const tableRows = data.objections.slice(0, 10).map((obj) => {
      const status = obj.handleRatePercent >= 75 ? "\u2705 Strong" : obj.handleRatePercent >= 50 ? "\u26A0\uFE0F Moderate" : "\u274C Needs Work";
      return `| ${obj.objection?.substring(0, 40) || "--"}... | ${obj.count || 0} | ${obj.handleRatePercent || 0}% | ${status} |`;
    }).join("\n");
    let bestPracticesContent = "";
    for (const obj of data.objections.slice(0, 5)) {
      if (obj.bestResponses && obj.bestResponses.length > 0) {
        bestPracticesContent += `
### Objection: "${obj.objection?.substring(0, 50)}..."

`;
        bestPracticesContent += `**Frequency:** ${obj.count} times  
`;
        bestPracticesContent += `**Handle Rate:** ${obj.handleRatePercent}%

`;
        bestPracticesContent += `**Best Responses:**
`;
        for (const resp of obj.bestResponses.slice(0, 2)) {
          bestPracticesContent += `1. *"${resp.response}"* - ${resp.rep || "Team member"}
`;
        }
        bestPracticesContent += "\n";
      }
    }
    const newContent = `---
type: analytics_dashboard
auto_refresh: true
category: objections
last_updated: ${dateStr}
---

# Objection Playbook

*Common objections with handling success rates and best responses*

---

## Top Objections (Last 90 Days)

| Objection | Frequency | Handle Rate | Status |
|-----------|-----------|-------------|--------|
${tableRows}

---

## Best Practices
${bestPracticesContent || "*No best practices available yet*"}

---

## Coaching Notes

*Objections with <50% handle rate need training focus*

Average handle rate: ${data.avgHandleRate || 0}%

---

> **Tip:** Review this playbook before important calls.
`;
    await this.app.vault.modify(file, newContent);
  }
  /**
   * Update team performance note with API data
   */
  async updateTeamPerformanceNote(file, trends) {
    if (!trends)
      return;
    const dateStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const trendArrow = (val) => val > 0 ? `\u2191 ${Math.abs(val).toFixed(1)}%` : val < 0 ? `\u2193 ${Math.abs(val).toFixed(1)}%` : "--";
    const newContent = `---
type: analytics_dashboard
auto_refresh: true
refresh_interval: daily
last_updated: ${dateStr}
---

# Team Performance Dashboard

*Auto-updated from GTM Brain analytics*

---

## Team Overview

| Metric | This Week | Trend |
|--------|-----------|-------|
| Calls Analyzed | ${trends.callCount || 0} | -- |
| Avg Score | ${trends.avgScore?.toFixed(1) || "--"} | ${trendArrow(trends.scoreTrend)} |
| Talk Ratio | ${trends.avgTalkRatio ? Math.round(trends.avgTalkRatio * 100) : "--"}% | ${trendArrow(trends.talkRatioTrend)} |
| Value Score | ${trends.avgValueScore?.toFixed(1) || "--"} | ${trendArrow(trends.valueScoreTrend)} |
| Next Step Rate | ${trends.nextStepRate ? Math.round(trends.nextStepRate * 100) : "--"}% | -- |

---

## Top Pain Points

${trends.topPainPoints?.slice(0, 5).map((pp) => `- **${pp.painPoint}** (${pp.count} mentions)`).join("\n") || "*No pain points captured yet*"}

---

## Trending Topics

${trends.trendingTopics?.slice(0, 8).map((t) => `- ${t.topic} (${t.count})`).join("\n") || "*No topics captured yet*"}

---

## Top Objections

${trends.topObjections?.slice(0, 5).map((obj) => `- ${obj.objection} - ${obj.handleRatePercent}% handled`).join("\n") || "*No objections captured yet*"}

---

> **Note:** This dashboard refreshes automatically when you open it.
> Data is aggregated from all analyzed calls in your region.
`;
    await this.app.vault.modify(file, newContent);
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
    const sfContainer = containerEl.createDiv();
    sfContainer.style.cssText = "padding: 16px; background: var(--background-secondary); border-radius: 8px; margin-bottom: 16px; margin-top: 16px;";
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
        statusText.setText("Enter email above first");
        sfButton.setText("Setup Required");
        sfButton.disabled = true;
        sfButton.style.opacity = "0.5";
        sfButton.style.cursor = "not-allowed";
        return false;
      }
      sfButton.disabled = false;
      sfButton.style.opacity = "1";
      sfButton.style.cursor = "pointer";
      try {
        statusDot.style.cssText = "width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); animation: pulse 1s infinite;";
        statusText.setText("Checking...");
        const response = await (0, import_obsidian3.requestUrl)({
          url: `${this.plugin.settings.serverUrl}/api/sf/auth/status?email=${encodeURIComponent(this.plugin.settings.userEmail)}`,
          method: "GET",
          throw: false
        });
        if (response.json?.authenticated === true) {
          statusDot.style.cssText = "width: 8px; height: 8px; border-radius: 50%; background: #22c55e;";
          statusText.setText("Connected to Salesforce");
          sfButton.setText("Reconnect");
          this.plugin.settings.salesforceConnected = true;
          await this.plugin.saveSettings();
          return true;
        } else {
          statusDot.style.cssText = "width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;";
          statusText.setText("Not connected");
          sfButton.setText("Connect to Salesforce");
          return false;
        }
      } catch {
        statusDot.style.cssText = "width: 8px; height: 8px; border-radius: 50%; background: #ef4444;";
        statusText.setText("Status unavailable");
        sfButton.setText("Connect to Salesforce");
        return false;
      }
    };
    new import_obsidian3.Setting(containerEl).setName("Eudia Email").setDesc("Your @eudia.com email address for calendar and Salesforce sync").addText((text) => text.setPlaceholder("yourname@eudia.com").setValue(this.plugin.settings.userEmail).onChange(async (value) => {
      const email = value.trim().toLowerCase();
      this.plugin.settings.userEmail = email;
      await this.plugin.saveSettings();
      await checkStatus();
    }));
    new import_obsidian3.Setting(containerEl).setName("Timezone").setDesc("Your local timezone for calendar event display").addDropdown((dropdown) => {
      TIMEZONE_OPTIONS.forEach((tz) => {
        dropdown.addOption(tz.value, tz.label);
      });
      dropdown.setValue(this.plugin.settings.timezone);
      dropdown.onChange(async (value) => {
        this.plugin.settings.timezone = value;
        await this.plugin.saveSettings();
        this.plugin.calendarService?.setTimezone(value);
        new import_obsidian3.Notice(`Timezone set to ${TIMEZONE_OPTIONS.find((t) => t.value === value)?.label || value}`);
      });
    });
    containerEl.createEl("h3", { text: "Salesforce Connection" });
    containerEl.appendChild(sfContainer);
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
    const advancedSection = containerEl.createDiv({ cls: "settings-advanced-collapsed" });
    const transcriptionStatus = advancedSection.createDiv({ cls: "eudia-transcription-status" });
    transcriptionStatus.style.cssText = "padding: 12px; background: var(--background-secondary); border-radius: 6px; margin-bottom: 12px; font-size: 13px;";
    transcriptionStatus.innerHTML = '<span style="color: var(--text-muted);">Checking server transcription status...</span>';
    (async () => {
      try {
        const response = await (0, import_obsidian3.requestUrl)({
          url: `${this.plugin.settings.serverUrl}/api/plugin/config`,
          method: "GET"
        });
        if (response.json?.capabilities?.serverTranscription) {
          transcriptionStatus.innerHTML = '<span class="eudia-check-icon"></span> Server transcription is available. No local API key needed.';
        } else {
          transcriptionStatus.innerHTML = '<span class="eudia-warn-icon"></span> Server transcription unavailable. Add a local API key below.';
        }
      } catch {
        transcriptionStatus.innerHTML = '<span style="color: #f59e0b;">\u26A0</span> Could not check server status. Local API key recommended as backup.';
      }
    })();
    const advancedToggle = new import_obsidian3.Setting(containerEl).setName("Advanced Options").setDesc("Show fallback API key (usually not needed)").addToggle((toggle) => toggle.setValue(false).onChange((value) => {
      advancedSection.style.display = value ? "block" : "none";
    }));
    advancedSection.style.display = "none";
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
    new import_obsidian3.Setting(containerEl).setName("Sync Accounts Now").setDesc(`${this.plugin.settings.cachedAccounts.length} accounts available for matching`).addButton((button) => button.setButtonText("Sync").setCta().onClick(async () => {
      await this.plugin.syncAccounts();
      this.display();
    }));
    new import_obsidian3.Setting(containerEl).setName("Refresh Account Folders").setDesc("Check for new account assignments and create folders for them").addButton((button) => button.setButtonText("Refresh Folders").onClick(async () => {
      button.setButtonText("Checking...");
      button.setDisabled(true);
      try {
        const newCount = await this.plugin.refreshAccountFolders();
        if (newCount > 0) {
          new import_obsidian3.Notice(`Created ${newCount} new account folder${newCount > 1 ? "s" : ""}`);
        } else {
          new import_obsidian3.Notice("All account folders are up to date");
        }
      } catch (error) {
        new import_obsidian3.Notice("Failed to refresh folders: " + error.message);
      }
      button.setButtonText("Refresh Folders");
      button.setDisabled(false);
      this.display();
    }));
    if (this.plugin.settings.lastSyncTime) {
      containerEl.createEl("p", {
        text: `Last synced: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()}`,
        cls: "setting-item-description"
      });
    }
    containerEl.createEl("p", {
      text: `Audio transcription: ${AudioRecorder.isSupported() ? "Supported" : "Not supported"}`,
      cls: "setting-item-description"
    });
  }
};

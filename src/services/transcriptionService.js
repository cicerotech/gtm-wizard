/**
 * TranscriptionService - Handles audio transcription via OpenAI Whisper
 * and structured summarization via GPT-4o
 * 
 * Supports long recordings (up to 2+ hours) via intelligent chunking
 * Includes queue management to prevent server overload
 */

const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../utils/logger') || console;

// Import transcript corrector with graceful fallback
let transcriptCorrector = null;
try {
  transcriptCorrector = require('./transcriptCorrector').transcriptCorrector;
} catch (error) {
  logger.warn('TranscriptCorrector not available, using raw transcripts:', error.message);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Whisper API limit is 25MB, use 20MB for safety margin
  MAX_CHUNK_SIZE: 20 * 1024 * 1024,
  
  // Maximum concurrent transcriptions to prevent server overload
  MAX_CONCURRENT: 3,
  
  // Retry settings for transient failures
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,
  
  // Timeout for individual chunk transcription (5 min should be plenty)
  CHUNK_TIMEOUT_MS: 5 * 60 * 1000,
  
  // Maximum recording duration (2 hours = safety limit)
  MAX_DURATION_SECONDS: 2 * 60 * 60
};

// ═══════════════════════════════════════════════════════════════════════════
// WHISPER PROMPT FOR DOMAIN-SPECIFIC ACCURACY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a custom prompt for Whisper API to improve transcription accuracy.
 * Whisper's prompt parameter (up to 224 tokens) provides context that helps
 * the model correctly transcribe domain-specific terms.
 * 
 * @param {Object} context - Optional context with attendees, account info
 * @returns {string} - Custom prompt for Whisper
 */
function buildWhisperPrompt(context = {}) {
  // Base vocabulary for Eudia meetings
  const basePrompt = `Eudia AI legal technology company meeting.
Products: Sigma, AI Contracting, AI Compliance, AI M&A, Insights, Litigation.
Roles: CLO, General Counsel, VP Legal, Legal Ops Director, Deputy GC, Chief Legal Officer.
Sales terms: MEDDICC, ACV, ARR, MQL, SQL, BDR, SDR, POC, RFP, SOW, pipeline, quota.
Legal terms: MSA, NDA, DPA, SLA, due diligence, contract lifecycle, compliance.
Company: Eudia, eudia.ai, Cicero Technology.`;

  // Add attendees if available (helps with name transcription)
  let attendeePrompt = '';
  if (context.attendees && context.attendees.length > 0) {
    const names = context.attendees.slice(0, 10).join(', ');
    attendeePrompt = `\nPeople on this call: ${names}.`;
  }

  // Add account name if available
  let accountPrompt = '';
  if (context.accountName) {
    accountPrompt = `\nCustomer: ${context.accountName}.`;
  }

  // Combine but stay under ~200 tokens (Whisper limit is 224)
  const fullPrompt = basePrompt + attendeePrompt + accountPrompt;
  
  // Truncate if too long (rough estimate: 1 token ≈ 4 chars)
  const maxChars = 800;
  if (fullPrompt.length > maxChars) {
    return fullPrompt.substring(0, maxChars);
  }
  
  return fullPrompt;
}

// Template sections configuration (matching Scribe template)
const TEMPLATE_SECTIONS = [
  {
    header: 'Summary',
    instructions: `Generate 3-5 bullet points summarizing the meeting. Focus on: customer needs/pain points, timeline or urgency, key decisions made, and overall sentiment. Be specific but concise.`
  },
  {
    header: 'Key Stakeholders',
    instructions: `List each person mentioned with their role. Format: **Name** - Role/Title. Use exact names as spoken in the audio. If pronunciation is ambiguous, spell phonetically and note uncertainty. Only include people actually mentioned.`
  },
  {
    header: 'MEDDICC Signals',
    instructions: `Extract MEDDICC intelligence from this conversation. For each element, quote relevant evidence or write 'Not discussed'. Format:
- **Economic Buyer:** [who controls budget]
- **Decision Process:** [approval steps, timeline]
- **Decision Criteria:** [evaluation factors]
- **Champion:** [internal advocate]
- **Identify Pain:** [business problems]
- **Competition:** [alternatives mentioned]`
  },
  {
    header: 'Product Interest',
    instructions: `Tag ONLY product lines explicitly discussed. Valid tags: AI Contracting, AI M&A, AI Compliance, Sigma, Insights, Litigation. For each, include a brief quote showing context. If no products discussed, write 'No specific products discussed'.`
  },
  {
    header: 'Key Dates',
    instructions: `Extract all dates, timeframes, and deadlines mentioned. Format: **Target:** [date/quarter] - [context]. Examples: 'Target: Q2 2026 - Contract renewal', 'Deadline: March 15 - Security review complete'. If no dates mentioned, write 'No specific dates mentioned'.`
  },
  {
    header: 'Next Steps',
    instructions: `List agreed-upon next steps as actionable checkboxes. Format as: - [ ] [Owner]: [Action] by [Date if mentioned]. Focus on commitments made during the call.`
  },
  {
    header: 'Action Items',
    instructions: `List internal follow-ups for our team (not shared with customer). Format: - [ ] [Action]. Include items like 'Send proposal', 'Schedule demo', 'Loop in engineer'.`
  },
  {
    header: 'Deal Signals',
    instructions: `Flag any indicators of deal progression or regression:
- Stage advancement signals (budget approved, decision timeline set, etc.)
- Risk signals (competitor mentioned, timeline slipping, stakeholder changes)
- Expansion signals (additional use cases, more users, new departments)
If none apparent, write 'No significant deal signals detected'.`
  },
  {
    header: 'Risks & Objections',
    instructions: `Surface any concerns, objections, or risks mentioned:
- Direct objections raised by the customer
- Implicit concerns (hesitation, questions about specific topics)
- Competitive threats mentioned
If none, write 'No objections or risks surfaced'.`
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// TRANSCRIPTION QUEUE
// ═══════════════════════════════════════════════════════════════════════════

class TranscriptionQueue {
  constructor(maxConcurrent = CONFIG.MAX_CONCURRENT) {
    this.maxConcurrent = maxConcurrent;
    this.activeCount = 0;
    this.queue = [];
  }

  async enqueue(task) {
    return new Promise((resolve, reject) => {
      const wrappedTask = async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeCount--;
          this.processNext();
        }
      };

      this.queue.push(wrappedTask);
      this.processNext();
    });
  }

  processNext() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    this.activeCount++;
    task();
  }

  getStatus() {
    return {
      active: this.activeCount,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSCRIPTION SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class TranscriptionService {
  constructor() {
    this.openai = null;
    this.queue = new TranscriptionQueue();
    this.initOpenAI();
  }

  /**
   * Initialize OpenAI client from environment
   */
  initOpenAI() {
    try {
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        logger.info('✅ TranscriptionService: OpenAI initialized');
      } else {
        logger.warn('⚠️ TranscriptionService: No OpenAI API key');
      }
    } catch (error) {
      logger.error('❌ TranscriptionService: OpenAI init failed:', error.message);
    }
  }

  /**
   * Initialize OpenAI client with provided key (from client)
   */
  initWithKey(apiKey) {
    try {
      if (apiKey && apiKey.startsWith('sk-')) {
        this.openai = new OpenAI({ apiKey });
        logger.info('✅ TranscriptionService: OpenAI initialized with client key');
      }
    } catch (error) {
      logger.error('❌ TranscriptionService: OpenAI init with client key failed:', error.message);
    }
  }

  /**
   * Transcribe audio with automatic chunking for long recordings
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {string} mimeType - MIME type of audio (e.g., 'audio/webm')
   * @param {Object} context - Optional context for custom vocabulary (attendees, accountName)
   * @returns {Promise<{success: boolean, transcript?: string, duration?: number, error?: string}>}
   */
  async transcribe(audioBuffer, mimeType = 'audio/webm', context = {}) {
    if (!this.openai) {
      return { success: false, error: 'OpenAI not initialized' };
    }

    const fileSizeMB = (audioBuffer.length / 1024 / 1024).toFixed(1);
    logger.info(`[Transcription] Starting: ${fileSizeMB}MB, type=${mimeType}`);

    // Check if we need to chunk
    if (audioBuffer.length <= CONFIG.MAX_CHUNK_SIZE) {
      // Small file - direct transcription
      return this.transcribeSingleChunk(audioBuffer, mimeType, context);
    }

    // Large file - use chunking
    return this.transcribeWithChunking(audioBuffer, mimeType, context);
  }

  /**
   * Transcribe a single chunk (under 25MB)
   * @param {Buffer} audioBuffer - Audio data
   * @param {string} mimeType - MIME type
   * @param {Object} context - Optional context for custom vocabulary
   * @param {number} retryCount - Current retry attempt
   */
  async transcribeSingleChunk(audioBuffer, mimeType, context = {}, retryCount = 0) {
    let tempFilePath = null;

    try {
      const extension = this.getExtensionFromMimeType(mimeType);
      tempFilePath = path.join(os.tmpdir(), `transcription-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`);
      fs.writeFileSync(tempFilePath, audioBuffer);

      // Build custom prompt for domain-specific accuracy
      const whisperPrompt = buildWhisperPrompt(context);
      logger.info(`[Transcription] Using custom prompt (${whisperPrompt.length} chars)`);

      // Use queue to limit concurrency
      const transcription = await this.queue.enqueue(async () => {
        return this.openai.audio.transcriptions.create({
          file: fs.createReadStream(tempFilePath),
          model: 'whisper-1',
          response_format: 'verbose_json',
          language: 'en',
          prompt: whisperPrompt
        });
      });

      // Clean up temp file
      this.cleanupTempFile(tempFilePath);

      // Apply post-processing corrections to improve accuracy (if corrector available)
      let finalTranscript = transcription.text;
      let corrections = [];
      let confidence = 1.0;

      if (transcriptCorrector) {
        try {
          // Initialize corrector with OpenAI client for potential GPT correction
          transcriptCorrector.setOpenAI(this.openai);
          
          const correctionResult = await transcriptCorrector.correctTranscript(
            transcription.text, 
            context
          );
          
          finalTranscript = correctionResult.corrected;
          corrections = correctionResult.corrections;
          confidence = correctionResult.confidence;
          
          if (corrections.length > 0) {
            logger.info(`[Transcription] Post-processing: ${corrections.length} corrections, confidence=${confidence}`);
          }
        } catch (correctionError) {
          logger.warn(`[Transcription] Post-processing failed, using raw transcript: ${correctionError.message}`);
          // Continue with raw transcript if correction fails
        }
      }

      return {
        success: true,
        transcript: finalTranscript,
        rawTranscript: transcription.text, // Keep original for debugging
        duration: transcription.duration || 0,
        corrections,
        confidence,
        segments: transcription.segments // Include Whisper segments for confidence analysis
      };

    } catch (error) {
      this.cleanupTempFile(tempFilePath);

      // Retry on transient errors
      if (retryCount < CONFIG.MAX_RETRIES && this.isRetryableError(error)) {
        logger.warn(`[Transcription] Retry ${retryCount + 1}/${CONFIG.MAX_RETRIES}: ${error.message}`);
        await this.sleep(CONFIG.RETRY_DELAY_MS * (retryCount + 1));
        return this.transcribeSingleChunk(audioBuffer, mimeType, context, retryCount + 1);
      }

      logger.error('[Transcription] Failed:', error);
      return {
        success: false,
        error: error.message || 'Transcription failed'
      };
    }
  }

  /**
   * Transcribe long audio by splitting into chunks
   * @param {Buffer} audioBuffer - Audio data
   * @param {string} mimeType - MIME type
   * @param {Object} context - Optional context for custom vocabulary
   */
  async transcribeWithChunking(audioBuffer, mimeType, context = {}) {
    const chunks = this.splitBuffer(audioBuffer, CONFIG.MAX_CHUNK_SIZE);
    logger.info(`[Transcription] Large file: splitting into ${chunks.length} chunks`);

    const transcripts = [];
    let totalDuration = 0;
    let failedChunks = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunkSizeMB = (chunks[i].length / 1024 / 1024).toFixed(1);
      logger.info(`[Transcription] Processing chunk ${i + 1}/${chunks.length} (${chunkSizeMB}MB)`);

      const result = await this.transcribeSingleChunk(chunks[i], mimeType, context);

      if (result.success) {
        transcripts.push(result.transcript);
        totalDuration += result.duration || 0;
      } else {
        failedChunks++;
        logger.warn(`[Transcription] Chunk ${i + 1} failed: ${result.error}`);
        // Continue with remaining chunks - partial transcript better than none
      }
    }

    if (transcripts.length === 0) {
      return {
        success: false,
        error: 'All chunks failed to transcribe'
      };
    }

    // Combine transcripts with intelligent joining
    const combinedTranscript = this.joinTranscripts(transcripts);

    logger.info(`[Transcription] Complete: ${chunks.length - failedChunks}/${chunks.length} chunks, ${totalDuration.toFixed(0)}s`);

    return {
      success: true,
      transcript: combinedTranscript,
      duration: totalDuration,
      chunksProcessed: chunks.length - failedChunks,
      chunksTotal: chunks.length
    };
  }

  /**
   * Split buffer into chunks of specified size
   */
  splitBuffer(buffer, chunkSize) {
    const chunks = [];
    for (let i = 0; i < buffer.length; i += chunkSize) {
      chunks.push(buffer.slice(i, Math.min(i + chunkSize, buffer.length)));
    }
    return chunks;
  }

  /**
   * Join transcripts from multiple chunks
   * Handles potential duplication at chunk boundaries
   */
  joinTranscripts(transcripts) {
    if (transcripts.length === 1) {
      return transcripts[0];
    }

    // Join with double newline, then clean up
    let combined = transcripts.join('\n\n');

    // Remove potential duplicate sentences at chunk boundaries
    // This is a heuristic - Whisper sometimes repeats the last phrase
    const sentences = combined.split(/(?<=[.!?])\s+/);
    const uniqueSentences = [];
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (sentence && (i === 0 || sentence !== sentences[i - 1].trim())) {
        uniqueSentences.push(sentence);
      }
    }

    return uniqueSentences.join(' ');
  }

  /**
   * Summarize transcript into structured sections using GPT-4o
   */
  async summarize(transcript, context = {}) {
    if (!this.openai) {
      return { success: false, error: 'OpenAI not initialized' };
    }

    try {
      // Build context string
      let contextStr = '';
      if (context.accountName) {
        contextStr += `Account: ${context.accountName}\n`;
      }
      if (context.opportunities && context.opportunities.length > 0) {
        contextStr += `Open Opportunities: ${context.opportunities.map(o => `${o.name} (${o.stage})`).join(', ')}\n`;
      }
      if (context.customerBrain) {
        // Truncate to avoid token limits
        const recentNotes = context.customerBrain.substring(0, 1000);
        contextStr += `Recent Notes Summary: ${recentNotes}\n`;
      }

      const systemPrompt = this.buildSystemPrompt(contextStr);
      const userPrompt = this.buildUserPrompt(transcript);

      // Estimate tokens for long transcripts
      const estimatedInputTokens = (systemPrompt.length + userPrompt.length) / 4;
      if (estimatedInputTokens > 100000) {
        logger.warn(`[Summarization] Very long transcript (~${Math.round(estimatedInputTokens)} tokens), may be truncated`);
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      });

      const content = response.choices[0]?.message?.content || '';
      const sections = this.parseSections(content);

      return {
        success: true,
        sections
      };

    } catch (error) {
      logger.error('[Summarization] Error:', error);
      return {
        success: false,
        error: error.message || 'Summarization failed'
      };
    }
  }

  /**
   * Combined transcription and summarization with evidence-based MEDDICC
   */
  async transcribeAndSummarize(audioData, mimeType = 'audio/webm', context = {}) {
    try {
      // Convert base64 to buffer if needed
      let audioBuffer;
      if (typeof audioData === 'string') {
        audioBuffer = Buffer.from(audioData, 'base64');
      } else {
        audioBuffer = audioData;
      }

      const fileSizeMB = (audioBuffer.length / 1024 / 1024).toFixed(1);
      logger.info(`[TranscribeAndSummarize] Starting: ${fileSizeMB}MB`);

      // Validate file size (rough duration estimate)
      // At 48kbps, 25MB ≈ 70 min, so 100MB ≈ 280 min
      // Reject anything over ~150MB as likely corrupt or too long
      if (audioBuffer.length > 150 * 1024 * 1024) {
        return {
          success: false,
          error: 'Audio file too large. Maximum recording length is approximately 2 hours.'
        };
      }

      // Build transcription context from summarization context
      const transcriptionContext = {
        attendees: context.attendees || [],
        accountName: context.accountName || ''
      };

      // Step 1: Transcribe with custom vocabulary prompt
      const transcribeResult = await this.transcribe(audioBuffer, mimeType, transcriptionContext);
      
      if (!transcribeResult.success) {
        return transcribeResult;
      }

      logger.info(`[TranscribeAndSummarize] Transcription complete: ${transcribeResult.transcript?.length || 0} chars, ${transcribeResult.duration || 0}s`);

      // Step 2: Generate quality summary with confidence indicators
      const qualitySummary = this.generateQualitySummary(transcribeResult);
      
      // Get confidence indicators from Whisper segments
      const confidenceIndicators = transcribeResult.segments 
        ? this.getConfidenceIndicators(transcribeResult.segments)
        : null;

      // Step 3: Run parallel extractions for efficiency
      const [summarizeResult, meddiccResult, nextStepsResult] = await Promise.all([
        // Standard summarization
        this.summarize(transcribeResult.transcript, context),
        
        // Evidence-based MEDDICC extraction with confidence thresholds
        this.extractMEDDICCWithThreshold(transcribeResult.transcript, context),
        
        // Next steps extraction
        this.extractNextStepsFromTranscript(transcribeResult.transcript, context)
      ]);

      // Build final result with all extractions
      const sections = summarizeResult.success ? summarizeResult.sections : this.getEmptySections();
      
      // Merge MEDDICC results if successful (overrides the basic version)
      if (meddiccResult.success && meddiccResult.summary) {
        sections.meddiccSignals = meddiccResult.meddicc_display || sections.meddiccSignals;
      }

      // Merge next steps if successful
      if (nextStepsResult.success && nextStepsResult.formatted) {
        sections.nextSteps = nextStepsResult.formatted;
      }

      const result = {
        success: true,
        transcript: transcribeResult.transcript,
        rawTranscript: transcribeResult.rawTranscript,
        duration: transcribeResult.duration,
        sections,
        quality: qualitySummary,
        confidence: confidenceIndicators,
        corrections: transcribeResult.corrections || [],
        
        // New evidence-based MEDDICC data
        meddicc: meddiccResult.success ? {
          signals: meddiccResult.signals,
          summary: meddiccResult.summary,
          tags: meddiccResult.meddicc_tags || [],
          deal_health: meddiccResult.summary?.deal_health || 'unknown',
          deal_health_score: meddiccResult.summary?.deal_health_score || 0
        } : null,
        
        // Structured next steps
        next_steps: nextStepsResult.success ? {
          items: nextStepsResult.next_steps || [],
          formatted: nextStepsResult.formatted,
          count: nextStepsResult.count || 0
        } : null
      };

      // Add warnings if any extraction failed
      const warnings = [];
      if (!summarizeResult.success) {
        warnings.push(`Summarization: ${summarizeResult.error}`);
      }
      if (!meddiccResult.success) {
        warnings.push(`MEDDICC extraction: ${meddiccResult.error}`);
      }
      if (!nextStepsResult.success) {
        warnings.push(`Next steps extraction: ${nextStepsResult.error}`);
      }
      
      if (warnings.length > 0) {
        result.warnings = warnings;
      }

      return result;

    } catch (error) {
      logger.error('[TranscribeAndSummarize] Error:', error);
      return {
        success: false,
        error: error.message || 'Processing failed'
      };
    }
  }

  /**
   * Extract MEDDICC with confidence thresholds
   * Wrapper that creates extractor on demand
   */
  async extractMEDDICCWithThreshold(transcript, context = {}) {
    try {
      if (!this.openai) {
        return { success: false, error: 'OpenAI not initialized' };
      }
      
      const extractor = new MEDDICCExtractor(this.openai);
      return await extractor.extractMEDDICC(transcript, context);
    } catch (error) {
      logger.error('[MEDDICC] Extraction failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Extract next steps from transcript
   * Wrapper that creates extractor on demand
   */
  async extractNextStepsFromTranscript(transcript, context = {}) {
    try {
      if (!this.openai) {
        return { success: false, error: 'OpenAI not initialized' };
      }
      
      const extractor = new MEDDICCExtractor(this.openai);
      return await extractor.extractNextSteps(transcript, context);
    } catch (error) {
      logger.error('[NextSteps] Extraction failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Build system prompt for GPT-4o
   */
  buildSystemPrompt(contextStr) {
    return `You are a sales intelligence analyst processing meeting transcripts for Eudia, a legal AI company. Your job is to extract structured insights optimized for:
1. Salesforce data entry (Account, Opportunity, Contact)
2. Deal progression signals (MEDDICC methodology)
3. Action item tracking

The user is a Business Lead whose time is valuable. Be specific, not generic. When uncertain, say so—never fabricate details.

${contextStr ? `CONTEXT:\n${contextStr}\n` : ''}

You will analyze the transcript and provide output in EXACTLY the following format, with each section clearly labeled:

${TEMPLATE_SECTIONS.map(s => `## ${s.header}\n${s.instructions}`).join('\n\n')}

IMPORTANT:
- Use the exact section headers shown above
- Be concise but specific
- Quote relevant parts of the transcript when helpful
- If a section has no relevant content, say so explicitly
- Format action items and next steps as checkboxes: - [ ] Item`;
  }

  /**
   * Build user prompt with transcript
   */
  buildUserPrompt(transcript) {
    // Truncate very long transcripts to avoid token limits
    const maxLength = 100000; // ~25k tokens
    let truncatedTranscript = transcript;
    
    if (transcript.length > maxLength) {
      truncatedTranscript = transcript.substring(0, maxLength) + 
        '\n\n[TRANSCRIPT TRUNCATED - Original was ' + transcript.length + ' characters]';
    }

    return `Please analyze the following meeting transcript and extract structured insights:\n\n---\n\n${truncatedTranscript}\n\n---\n\nProvide your analysis with each section clearly labeled with ## headers.`;
  }

  /**
   * Parse GPT response into sections object
   */
  parseSections(content) {
    const sections = {
      summary: '',
      keyStakeholders: '',
      meddiccSignals: '',
      productInterest: '',
      keyDates: '',
      nextSteps: '',
      actionItems: '',
      dealSignals: '',
      risksObjections: ''
    };

    const headerMap = {
      'summary': 'summary',
      'key stakeholders': 'keyStakeholders',
      'meddicc signals': 'meddiccSignals',
      'product interest': 'productInterest',
      'key dates': 'keyDates',
      'next steps': 'nextSteps',
      'action items': 'actionItems',
      'deal signals': 'dealSignals',
      'risks & objections': 'risksObjections',
      'risks and objections': 'risksObjections'
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
   * Get empty sections structure
   */
  getEmptySections() {
    return {
      summary: '',
      keyStakeholders: '',
      meddiccSignals: '',
      productInterest: '',
      keyDates: '',
      nextSteps: '',
      actionItems: '',
      dealSignals: '',
      risksObjections: ''
    };
  }

  /**
   * Get file extension from MIME type
   */
  getExtensionFromMimeType(mimeType) {
    const mimeMap = {
      'audio/webm': 'webm',
      'audio/webm;codecs=opus': 'webm',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/ogg;codecs=opus': 'ogg',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav'
    };
    return mimeMap[mimeType] || 'webm';
  }

  /**
   * Extract confidence indicators from Whisper segments
   * Identifies uncertain sections that users should verify
   * @param {Array} segments - Whisper segments from verbose_json response
   * @returns {{lowConfidenceSegments: Array, overallConfidence: number, qualityScore: string}}
   */
  getConfidenceIndicators(segments) {
    if (!segments || segments.length === 0) {
      return {
        lowConfidenceSegments: [],
        overallConfidence: 1.0,
        qualityScore: 'unknown'
      };
    }

    // Whisper's avg_logprob indicates confidence
    // Values closer to 0 = higher confidence
    // Values below -1.0 indicate potential issues
    const LOW_CONFIDENCE_THRESHOLD = -1.0;
    const VERY_LOW_THRESHOLD = -1.5;

    const lowConfidenceSegments = segments
      .filter(s => s.avg_logprob && s.avg_logprob < LOW_CONFIDENCE_THRESHOLD)
      .map(s => ({
        text: s.text,
        start: s.start,
        end: s.end,
        confidence: this.logProbToPercent(s.avg_logprob),
        severity: s.avg_logprob < VERY_LOW_THRESHOLD ? 'high' : 'medium',
        needsReview: true
      }));

    // Calculate overall confidence from all segments
    const avgLogProb = segments.reduce((sum, s) => sum + (s.avg_logprob || 0), 0) / segments.length;
    const overallConfidence = this.logProbToPercent(avgLogProb);

    // Determine quality score
    let qualityScore;
    if (overallConfidence >= 90) {
      qualityScore = 'excellent';
    } else if (overallConfidence >= 80) {
      qualityScore = 'good';
    } else if (overallConfidence >= 70) {
      qualityScore = 'fair';
    } else {
      qualityScore = 'needs_review';
    }

    return {
      lowConfidenceSegments,
      overallConfidence: Math.round(overallConfidence),
      qualityScore,
      totalSegments: segments.length,
      uncertainSegments: lowConfidenceSegments.length
    };
  }

  /**
   * Convert Whisper log probability to percentage confidence
   * @param {number} logProb - Log probability from Whisper
   * @returns {number} - Confidence as 0-100 percentage
   */
  logProbToPercent(logProb) {
    // log_prob is negative, with 0 being perfect
    // Convert to 0-100 scale where 100 = perfect
    // Typical values range from -0.5 (good) to -2.0 (poor)
    const normalized = Math.max(0, 1 + (logProb / 2)); // -2 → 0, 0 → 1
    return Math.min(100, Math.max(0, normalized * 100));
  }

  /**
   * Format transcript with uncertainty markers for display
   * Wraps low-confidence sections in [?] markers
   * @param {string} transcript - Full transcript text
   * @param {Array} lowConfidenceSegments - Segments needing review
   * @returns {string} - Transcript with uncertainty markers
   */
  formatWithUncertaintyMarkers(transcript, lowConfidenceSegments) {
    if (!lowConfidenceSegments || lowConfidenceSegments.length === 0) {
      return transcript;
    }

    let markedTranscript = transcript;

    // Sort segments by position in transcript (reverse to maintain positions)
    const sortedSegments = [...lowConfidenceSegments].sort((a, b) => {
      const posA = transcript.indexOf(a.text);
      const posB = transcript.indexOf(b.text);
      return posB - posA; // Reverse order
    });

    for (const segment of sortedSegments) {
      const text = segment.text.trim();
      if (text.length < 3) continue; // Skip very short segments

      // Find and wrap the segment
      const index = markedTranscript.indexOf(text);
      if (index !== -1) {
        const marker = segment.severity === 'high' ? '[??]' : '[?]';
        markedTranscript = 
          markedTranscript.slice(0, index) + 
          `${marker}${text}${marker}` + 
          markedTranscript.slice(index + text.length);
      }
    }

    return markedTranscript;
  }

  /**
   * Generate a quality summary for the transcription
   * @param {Object} result - Full transcription result
   * @returns {Object} - Quality summary object
   */
  generateQualitySummary(result) {
    const indicators = result.segments ? this.getConfidenceIndicators(result.segments) : null;
    
    return {
      duration: result.duration,
      wordCount: result.transcript ? result.transcript.split(/\s+/).length : 0,
      correctionsMade: result.corrections?.length || 0,
      confidence: result.confidence || (indicators?.overallConfidence / 100) || 1.0,
      qualityScore: indicators?.qualityScore || 'unknown',
      uncertainSections: indicators?.uncertainSegments || 0,
      recommendation: this.getQualityRecommendation(indicators)
    };
  }

  /**
   * Get user-friendly recommendation based on quality
   */
  getQualityRecommendation(indicators) {
    if (!indicators) {
      return 'Quality metrics unavailable';
    }

    if (indicators.qualityScore === 'excellent') {
      return 'High quality transcription. Review recommended for proper nouns only.';
    } else if (indicators.qualityScore === 'good') {
      return 'Good quality transcription. Quick review recommended.';
    } else if (indicators.qualityScore === 'fair') {
      return `Fair quality. ${indicators.uncertainSegments} sections may need verification.`;
    } else {
      return `Lower quality detected. Please review ${indicators.uncertainSegments} uncertain sections marked with [?].`;
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableMessages = [
      'timeout',
      'ECONNRESET',
      'ETIMEDOUT',
      'rate limit',
      '429',
      '503',
      '502',
      'temporarily unavailable'
    ];
    
    const errorStr = (error.message || '').toLowerCase();
    return retryableMessages.some(msg => errorStr.includes(msg.toLowerCase()));
  }

  /**
   * Clean up temp file
   */
  cleanupTempFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        logger.warn(`Failed to clean up temp file: ${filePath}`);
      }
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if service is ready
   */
  isReady() {
    return !!this.openai;
  }

  /**
   * Get queue status for monitoring
   */
  getQueueStatus() {
    return this.queue.getStatus();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE-BASED MEDDICC EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * MEDDICC Confidence Thresholds
 * Only signals meeting these thresholds are returned to the user
 */
const MEDDICC_THRESHOLDS = {
  STRONG: 90,      // Show prominently with full evidence
  DETECTED: 70,    // Show normally
  WEAK: 50,        // Show with caveat (but we exclude these by default)
  MINIMUM: 70      // Minimum confidence to include at all
};

/**
 * MEDDICC extraction prompt - designed for evidence-based extraction
 * Returns structured JSON with confidence scores and evidence quotes
 */
const MEDDICC_EXTRACTION_PROMPT = `You are a sales intelligence analyst extracting MEDDICC signals from a meeting transcript.

CRITICAL RULES:
1. Only identify signals with CLEAR, EXPLICIT evidence in the transcript
2. Do NOT infer or assume - if it's not explicitly stated, mark as not detected
3. Provide EXACT QUOTES as evidence (copy directly from transcript)
4. Be conservative with confidence scores - 90%+ requires multiple strong indicators
5. If evidence is ambiguous or weak, lower the confidence score accordingly

For each MEDDICC element, analyze and return:
- detected: boolean (true only if clear evidence exists)
- confidence: number 0-100 (be conservative - 70+ requires solid evidence)
- strength: "strong" (90+), "moderate" (70-89), "weak" (50-69), "none" (<50)
- evidence: array of exact quotes from transcript (max 3, most relevant)
- summary: one sentence summary of what was identified

MEDDICC ELEMENTS:

METRICS (M):
- Specific numbers, dollar amounts, timelines, KPIs, ROI expectations
- Must include ACTUAL FIGURES - vague statements don't count
- Example evidence: "$300,000 annual contract", "reduce from 70 vendors to 15"

ECONOMIC_BUYER (E):
- Person with budget authority, final decision maker
- Evidence must show their authority (approved, signed off, controls budget)
- Example evidence: "Jeff approved the pricing", "CIO has final say"

DECISION_CRITERIA (D):
- Stated requirements, must-haves, evaluation criteria
- What they're evaluating solutions against
- Example evidence: "need governance controls", "must integrate with SAP"

DECISION_PROCESS (D):
- Timeline, steps to purchase, stakeholders involved, approvals needed
- The actual process they'll follow
- Example evidence: "meeting Wednesday to decide", "need board approval by Q2"

IDENTIFY_PAIN (I):
- Explicit problems, frustrations, challenges in their own words
- Must be stated by customer, not implied
- Example evidence: "we've let everyone go wild", "contractor model is foreign to us"

CHAMPION (C):
- Internal advocate pushing for the solution
- Evidence must show advocacy behavior
- Example evidence: "I'm leading by example", "I'll bring the right stakeholders"

COMPETITION (C):
- Other vendors mentioned, alternatives being considered
- Must explicitly name competitors or alternatives
- Example evidence: "also evaluating ServiceNow", "using MLNA currently"

Return a JSON object with this exact structure:
{
  "metrics": { "detected": bool, "confidence": num, "strength": str, "evidence": [str], "summary": str },
  "economic_buyer": { "detected": bool, "confidence": num, "strength": str, "evidence": [str], "summary": str },
  "decision_criteria": { "detected": bool, "confidence": num, "strength": str, "evidence": [str], "summary": str },
  "decision_process": { "detected": bool, "confidence": num, "strength": str, "evidence": [str], "summary": str },
  "identify_pain": { "detected": bool, "confidence": num, "strength": str, "evidence": [str], "summary": str },
  "champion": { "detected": bool, "confidence": num, "strength": str, "evidence": [str], "summary": str },
  "competition": { "detected": bool, "confidence": num, "strength": str, "evidence": [str], "summary": str },
  "overall_score": num,
  "deal_health": "healthy" | "developing" | "at-risk" | "insufficient-data"
}`;

/**
 * Next Steps extraction prompt
 */
const NEXT_STEPS_EXTRACTION_PROMPT = `Extract specific action items and next steps from this meeting transcript.

For each next step, identify:
1. WHAT: Specific action to take (be precise)
2. WHO: Person responsible (if mentioned)
3. WHEN: Date, day, or timeframe (be specific - "Wednesday" not "soon")
4. TYPE: meeting | deliverable | decision | follow-up | introduction

RULES:
- Only extract EXPLICITLY AGREED next steps, not general discussion
- Include the owner's name if mentioned
- Convert relative dates to actual dates when possible (if today is mentioned)
- Format dates consistently

Return a JSON array:
[
  {
    "action": "specific action description",
    "owner": "person name or null",
    "when": "specific date/time or null",
    "type": "meeting|deliverable|decision|follow-up|introduction",
    "priority": "high|medium|low",
    "evidence": "quote from transcript"
  }
]`;

/**
 * Account detection prompt
 */
const ACCOUNT_DETECTION_PROMPT = `Analyze this meeting context to identify the customer account.

Given:
- Meeting title: {{title}}
- Attendees: {{attendees}}
- Transcript excerpt: {{transcript_start}}

Return a JSON object:
{
  "detected_account": "company name or null",
  "confidence": 0-100,
  "evidence": "why you identified this account",
  "alternative_names": ["other possible company names"],
  "is_internal_meeting": boolean
}`;

/**
 * Extended TranscriptionService with evidence-based MEDDICC extraction
 */
class MEDDICCExtractor {
  constructor(openaiClient) {
    this.openai = openaiClient;
  }

  /**
   * Extract MEDDICC signals with evidence and confidence scores
   * Only returns signals meeting the minimum confidence threshold
   * 
   * @param {string} transcript - Full meeting transcript
   * @param {Object} context - Optional context (account, attendees)
   * @returns {Promise<Object>} - MEDDICC extraction result
   */
  async extractMEDDICC(transcript, context = {}) {
    if (!this.openai) {
      return { success: false, error: 'OpenAI not initialized' };
    }

    try {
      // Truncate transcript if too long (keep first and last parts for context)
      const maxLength = 50000;
      let processedTranscript = transcript;
      if (transcript.length > maxLength) {
        const halfLen = Math.floor(maxLength / 2);
        processedTranscript = 
          transcript.substring(0, halfLen) + 
          '\n\n[... transcript continues ...]\n\n' +
          transcript.substring(transcript.length - halfLen);
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: MEDDICC_EXTRACTION_PROMPT },
          { role: 'user', content: `Analyze this meeting transcript and extract MEDDICC signals with evidence:\n\n${processedTranscript}` }
        ],
        temperature: 0.2, // Low temperature for consistent extraction
        max_tokens: 3000,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from GPT');
      }

      const rawResult = JSON.parse(content);
      
      // Apply confidence threshold filtering
      const filteredResult = this.applyConfidenceThreshold(rawResult);
      
      return {
        success: true,
        ...filteredResult
      };

    } catch (error) {
      logger.error('[MEDDICC Extraction] Error:', error);
      return {
        success: false,
        error: error.message || 'MEDDICC extraction failed'
      };
    }
  }

  /**
   * Apply confidence thresholds and filter out weak signals
   * @param {Object} rawResult - Raw MEDDICC extraction from GPT
   * @returns {Object} - Filtered result with only high-confidence signals
   */
  applyConfidenceThreshold(rawResult) {
    const signals = ['metrics', 'economic_buyer', 'decision_criteria', 'decision_process', 
                     'identify_pain', 'champion', 'competition'];
    
    const filteredSignals = {};
    const includedSignals = [];
    const excludedSignals = [];
    let totalConfidence = 0;
    let detectedCount = 0;

    for (const signal of signals) {
      const data = rawResult[signal];
      if (!data) {
        filteredSignals[signal] = { detected: false, confidence: 0, excluded: true, reason: 'not_analyzed' };
        continue;
      }

      const confidence = data.confidence || 0;
      
      if (data.detected && confidence >= MEDDICC_THRESHOLDS.MINIMUM) {
        // Include this signal
        filteredSignals[signal] = {
          detected: true,
          confidence,
          strength: this.getStrengthLabel(confidence),
          evidence: data.evidence || [],
          summary: data.summary || '',
          display: this.formatSignalForDisplay(signal, data)
        };
        includedSignals.push(signal);
        totalConfidence += confidence;
        detectedCount++;
      } else {
        // Exclude this signal (below threshold or not detected)
        filteredSignals[signal] = {
          detected: false,
          confidence,
          excluded: true,
          reason: confidence < MEDDICC_THRESHOLDS.MINIMUM ? 'below_threshold' : 'not_detected'
        };
        excludedSignals.push({ signal, confidence, reason: filteredSignals[signal].reason });
      }
    }

    // Calculate overall deal health
    const avgConfidence = detectedCount > 0 ? totalConfidence / detectedCount : 0;
    const dealHealth = this.calculateDealHealth(detectedCount, avgConfidence, filteredSignals);

    return {
      signals: filteredSignals,
      summary: {
        detected_count: detectedCount,
        total_signals: signals.length,
        average_confidence: Math.round(avgConfidence),
        included_signals: includedSignals,
        excluded_signals: excludedSignals,
        deal_health: dealHealth.status,
        deal_health_score: dealHealth.score,
        deal_health_reasoning: dealHealth.reasoning
      },
      // Formatted for easy display in note properties
      meddicc_tags: includedSignals.map(s => {
        const data = filteredSignals[s];
        return `${this.getSignalEmoji(s)} ${this.formatSignalName(s)} (${data.confidence}%)`;
      }),
      // Full display with evidence
      meddicc_display: includedSignals.map(s => filteredSignals[s].display).join('\n\n')
    };
  }

  /**
   * Get strength label from confidence score
   */
  getStrengthLabel(confidence) {
    if (confidence >= MEDDICC_THRESHOLDS.STRONG) return 'strong';
    if (confidence >= MEDDICC_THRESHOLDS.DETECTED) return 'moderate';
    if (confidence >= MEDDICC_THRESHOLDS.WEAK) return 'weak';
    return 'none';
  }

  /**
   * Format signal for display in note
   */
  formatSignalForDisplay(signal, data) {
    const emoji = this.getSignalEmoji(signal);
    const name = this.formatSignalName(signal);
    const strength = this.getStrengthLabel(data.confidence);
    
    let display = `${emoji} **${name}** (${data.confidence}% - ${strength})\n`;
    display += `${data.summary}\n`;
    
    if (data.evidence && data.evidence.length > 0) {
      display += `Evidence:\n`;
      data.evidence.forEach(e => {
        display += `> "${e}"\n`;
      });
    }
    
    return display;
  }

  /**
   * Get emoji for MEDDICC signal
   */
  getSignalEmoji(signal) {
    const emojiMap = {
      'metrics': '📊',
      'economic_buyer': '💰',
      'decision_criteria': '✅',
      'decision_process': '🔄',
      'identify_pain': '😰',
      'champion': '🎯',
      'competition': '⚔️'
    };
    return emojiMap[signal] || '•';
  }

  /**
   * Format signal name for display
   */
  formatSignalName(signal) {
    const nameMap = {
      'metrics': 'Metrics',
      'economic_buyer': 'Economic Buyer',
      'decision_criteria': 'Decision Criteria',
      'decision_process': 'Decision Process',
      'identify_pain': 'Pain Identified',
      'champion': 'Champion',
      'competition': 'Competition'
    };
    return nameMap[signal] || signal;
  }

  /**
   * Calculate overall deal health based on MEDDICC signals
   */
  calculateDealHealth(detectedCount, avgConfidence, signals) {
    // Weight certain signals more heavily
    const criticalSignals = ['economic_buyer', 'champion', 'identify_pain'];
    const criticalDetected = criticalSignals.filter(s => 
      signals[s]?.detected && signals[s]?.confidence >= MEDDICC_THRESHOLDS.MINIMUM
    ).length;

    let score = 0;
    let reasoning = [];

    // Base score from detected count (max 40 points)
    score += (detectedCount / 7) * 40;

    // Bonus for critical signals (max 30 points)
    score += (criticalDetected / 3) * 30;

    // Confidence bonus (max 30 points)
    score += (avgConfidence / 100) * 30;

    // Build reasoning
    if (signals.champion?.detected) {
      reasoning.push('Champion identified');
    } else {
      reasoning.push('No clear champion');
    }

    if (signals.economic_buyer?.detected) {
      reasoning.push('Economic buyer known');
    }

    if (signals.identify_pain?.detected) {
      reasoning.push('Pain confirmed');
    }

    if (signals.competition?.detected) {
      reasoning.push('Competition present');
    }

    // Determine status
    let status;
    if (score >= 70) {
      status = 'healthy';
    } else if (score >= 50) {
      status = 'developing';
    } else if (detectedCount >= 2) {
      status = 'at-risk';
    } else {
      status = 'insufficient-data';
    }

    return {
      score: Math.round(score),
      status,
      reasoning: reasoning.join(', ')
    };
  }

  /**
   * Extract next steps with dates and owners
   */
  async extractNextSteps(transcript, context = {}) {
    if (!this.openai) {
      return { success: false, error: 'OpenAI not initialized' };
    }

    try {
      // Use just the last portion of transcript for next steps (usually at end)
      const lastPortion = transcript.length > 15000 
        ? transcript.substring(transcript.length - 15000) 
        : transcript;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: NEXT_STEPS_EXTRACTION_PROMPT },
          { role: 'user', content: `Extract next steps from this meeting transcript:\n\n${lastPortion}` }
        ],
        temperature: 0.2,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from GPT');
      }

      const result = JSON.parse(content);
      const nextSteps = Array.isArray(result) ? result : (result.next_steps || result.steps || []);

      // Format for display as checkboxes
      const formatted = nextSteps.map(step => {
        let line = `- [ ] `;
        if (step.when) {
          line += `**${step.when}**: `;
        }
        if (step.owner) {
          line += `${step.owner} - `;
        }
        line += step.action;
        return line;
      }).join('\n');

      return {
        success: true,
        next_steps: nextSteps,
        formatted,
        count: nextSteps.length
      };

    } catch (error) {
      logger.error('[Next Steps Extraction] Error:', error);
      return {
        success: false,
        error: error.message || 'Next steps extraction failed'
      };
    }
  }

  /**
   * Detect account from meeting title and transcript
   */
  async detectAccount(meetingTitle, attendees, transcriptStart, salesforceAccounts = []) {
    if (!this.openai) {
      return { success: false, error: 'OpenAI not initialized' };
    }

    try {
      // First try rule-based detection from title
      const titleMatch = this.detectAccountFromTitle(meetingTitle);
      if (titleMatch.confidence >= 80) {
        // Verify against Salesforce accounts if available
        if (salesforceAccounts.length > 0) {
          const sfMatch = this.fuzzyMatchAccount(titleMatch.account, salesforceAccounts);
          if (sfMatch) {
            return {
              success: true,
              account: sfMatch.name,
              account_id: sfMatch.id,
              confidence: Math.min(titleMatch.confidence + 10, 100),
              source: 'title_and_salesforce',
              evidence: `Matched "${titleMatch.account}" from title to Salesforce account "${sfMatch.name}"`
            };
          }
        }
        return {
          success: true,
          account: titleMatch.account,
          confidence: titleMatch.confidence,
          source: 'title',
          evidence: titleMatch.evidence
        };
      }

      // Try attendee domain matching
      const domainMatch = this.detectAccountFromAttendees(attendees, salesforceAccounts);
      if (domainMatch.confidence >= 70) {
        return {
          success: true,
          ...domainMatch
        };
      }

      // Fall back to GPT extraction from transcript
      const prompt = ACCOUNT_DETECTION_PROMPT
        .replace('{{title}}', meetingTitle || 'Unknown')
        .replace('{{attendees}}', (attendees || []).join(', ') || 'Unknown')
        .replace('{{transcript_start}}', (transcriptStart || '').substring(0, 2000));

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'Identify the customer account from this context.' }
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from GPT');
      }

      const result = JSON.parse(content);
      
      // Try to match detected account to Salesforce
      if (result.detected_account && salesforceAccounts.length > 0) {
        const sfMatch = this.fuzzyMatchAccount(result.detected_account, salesforceAccounts);
        if (sfMatch) {
          return {
            success: true,
            account: sfMatch.name,
            account_id: sfMatch.id,
            confidence: Math.min(result.confidence + 5, 100),
            source: 'gpt_and_salesforce',
            evidence: result.evidence,
            is_internal: result.is_internal_meeting
          };
        }
      }

      return {
        success: !!result.detected_account,
        account: result.detected_account,
        confidence: result.confidence || 50,
        source: 'gpt',
        evidence: result.evidence,
        is_internal: result.is_internal_meeting
      };

    } catch (error) {
      logger.error('[Account Detection] Error:', error);
      return {
        success: false,
        error: error.message || 'Account detection failed'
      };
    }
  }

  /**
   * Rule-based account detection from meeting title
   */
  detectAccountFromTitle(title) {
    if (!title) {
      return { account: null, confidence: 0, evidence: 'No title provided' };
    }

    // Common patterns for meeting titles
    const patterns = [
      // "Southwest - James - Aug 19" → Southwest
      { regex: /^([^-]+?)\s*-\s*(?:[A-Z][a-z]+|[A-Z]{2,})/, confidence: 85 },
      
      // "Call with Acme Corp" → Acme Corp
      { regex: /(?:call|meeting|sync|check-in|demo)\s+(?:with|re:?|@)\s+(.+?)(?:\s*[-–—]|$)/i, confidence: 80 },
      
      // "Acme Corp Discovery Call" → Acme Corp
      { regex: /^(.+?)\s+(?:discovery|demo|review|kickoff|intro|onboarding)\s*(?:call)?/i, confidence: 75 },
      
      // "Acme: Weekly Sync" → Acme
      { regex: /^([^:]+?):\s+/i, confidence: 70 },
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern.regex);
      if (match && match[1]) {
        const account = match[1].trim();
        // Filter out common false positives
        const falsePositives = ['weekly', 'daily', 'monthly', 'internal', 'team', '1:1', 'standup', 'sync'];
        if (falsePositives.some(fp => account.toLowerCase() === fp)) {
          continue;
        }
        return {
          account,
          confidence: pattern.confidence,
          evidence: `Extracted from title pattern: "${title}"`
        };
      }
    }

    return { account: null, confidence: 0, evidence: 'No matching pattern found' };
  }

  /**
   * Detect account from attendee email domains
   */
  detectAccountFromAttendees(attendees, salesforceAccounts) {
    if (!attendees || attendees.length === 0) {
      return { account: null, confidence: 0, source: 'attendees', evidence: 'No attendees' };
    }

    // Extract external domains (not @eudia.com)
    const externalDomains = new Set();
    for (const attendee of attendees) {
      const email = typeof attendee === 'string' ? attendee : attendee.email;
      if (!email) continue;
      
      const domain = email.split('@')[1]?.toLowerCase();
      if (domain && !domain.includes('eudia.com') && !domain.includes('gmail.com') && 
          !domain.includes('outlook.com') && !domain.includes('hotmail.com')) {
        externalDomains.add(domain);
      }
    }

    if (externalDomains.size === 0) {
      return { account: null, confidence: 0, source: 'attendees', evidence: 'No external domains found' };
    }

    // Try to match domains to Salesforce accounts
    for (const domain of externalDomains) {
      const companyName = domain.split('.')[0];
      const match = this.fuzzyMatchAccount(companyName, salesforceAccounts);
      if (match) {
        return {
          account: match.name,
          account_id: match.id,
          confidence: 75,
          source: 'attendee_domain',
          evidence: `Matched domain ${domain} to account ${match.name}`
        };
      }
    }

    // Return the first external domain as a guess
    const firstDomain = Array.from(externalDomains)[0];
    const guessedName = firstDomain.split('.')[0].charAt(0).toUpperCase() + firstDomain.split('.')[0].slice(1);
    
    return {
      account: guessedName,
      confidence: 50,
      source: 'attendee_domain_guess',
      evidence: `Guessed from external domain: ${firstDomain}`
    };
  }

  /**
   * Fuzzy match account name against Salesforce accounts
   */
  fuzzyMatchAccount(searchName, salesforceAccounts) {
    if (!searchName || !salesforceAccounts || salesforceAccounts.length === 0) {
      return null;
    }

    const search = searchName.toLowerCase().trim();
    
    // Exact match
    for (const acc of salesforceAccounts) {
      if (acc.name?.toLowerCase() === search) {
        return acc;
      }
    }

    // Starts with match
    for (const acc of salesforceAccounts) {
      if (acc.name?.toLowerCase().startsWith(search)) {
        return acc;
      }
    }

    // Contains match
    for (const acc of salesforceAccounts) {
      if (acc.name?.toLowerCase().includes(search)) {
        return acc;
      }
    }

    // Reverse contains (search contains account name)
    for (const acc of salesforceAccounts) {
      if (search.includes(acc.name?.toLowerCase())) {
        return acc;
      }
    }

    return null;
  }
}

// Singleton instance
const transcriptionService = new TranscriptionService();

// Create MEDDICC extractor that uses the same OpenAI client
let meddiccExtractor = null;

function getMEDDICCExtractor() {
  if (!meddiccExtractor && transcriptionService.openai) {
    meddiccExtractor = new MEDDICCExtractor(transcriptionService.openai);
  }
  return meddiccExtractor;
}

module.exports = {
  transcriptionService,
  TranscriptionService,
  MEDDICCExtractor,
  getMEDDICCExtractor,
  TEMPLATE_SECTIONS,
  CONFIG,
  MEDDICC_THRESHOLDS
};

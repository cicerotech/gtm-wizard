/**
 * TranscriptCorrector - Post-processing service for transcription accuracy
 * 
 * Applies multi-layer correction to Whisper output:
 * 1. Rule-based glossary corrections (fast, deterministic)
 * 2. Optional GPT-based correction for complex cases (slower, smarter)
 * 
 * This complements the Whisper prompt by catching errors that slip through.
 */

const { OpenAI } = require('openai');
const { EUDIA_GLOSSARY, applyCorrections } = require('../data/companyGlossary');
const logger = require('../utils/logger') || console;

class TranscriptCorrector {
  constructor(openai = null) {
    this.openai = openai;
  }

  /**
   * Initialize with OpenAI client
   */
  setOpenAI(openai) {
    this.openai = openai;
  }

  /**
   * Apply all correction layers to a transcript
   * @param {string} rawTranscript - Original Whisper output
   * @param {Object} context - Optional context (attendees, accountName, enableDeepCorrection)
   * @returns {Promise<{corrected: string, corrections: Array, confidence: number}>}
   */
  async correctTranscript(rawTranscript, context = {}) {
    if (!rawTranscript || rawTranscript.trim().length === 0) {
      return {
        corrected: rawTranscript,
        corrections: [],
        confidence: 1.0
      };
    }

    const corrections = [];
    let text = rawTranscript;

    // Layer 1: Rule-based glossary corrections
    const glossaryCorrected = this.applyGlossaryCorrections(text);
    if (glossaryCorrected.text !== text) {
      corrections.push(...glossaryCorrected.changes);
      text = glossaryCorrected.text;
      logger.info(`[TranscriptCorrector] Applied ${glossaryCorrected.changes.length} glossary corrections`);
    }

    // Layer 2: Contact name corrections (if attendees provided)
    if (context.attendees && context.attendees.length > 0) {
      const nameCorrected = this.applyNameCorrections(text, context.attendees);
      if (nameCorrected.text !== text) {
        corrections.push(...nameCorrected.changes);
        text = nameCorrected.text;
        logger.info(`[TranscriptCorrector] Applied ${nameCorrected.changes.length} name corrections`);
      }
    }

    // Layer 3: GPT-based correction (optional, for important meetings)
    if (context.enableDeepCorrection && this.openai) {
      try {
        const gptCorrected = await this.applyGPTCorrection(text, context);
        if (gptCorrected.text !== text) {
          corrections.push({ type: 'gpt', description: 'GPT-based corrections applied' });
          text = gptCorrected.text;
          logger.info('[TranscriptCorrector] Applied GPT corrections');
        }
      } catch (error) {
        logger.warn(`[TranscriptCorrector] GPT correction failed: ${error.message}`);
        // Continue with rule-based corrections only
      }
    }

    // Calculate confidence estimate based on number of corrections
    const transcriptWords = rawTranscript.split(/\s+/).length;
    const correctionRatio = corrections.length / Math.max(transcriptWords, 1);
    const confidence = Math.max(0.5, 1 - (correctionRatio * 2)); // Higher corrections = lower confidence

    return {
      corrected: text,
      corrections,
      confidence: Math.round(confidence * 100) / 100
    };
  }

  /**
   * Apply glossary-based corrections with tracking
   * @param {string} text - Input text
   * @returns {{text: string, changes: Array}}
   */
  applyGlossaryCorrections(text) {
    const changes = [];
    let corrected = text;

    for (const [wrong, right] of Object.entries(EUDIA_GLOSSARY.corrections)) {
      const regex = new RegExp(`\\b${this.escapeRegex(wrong)}\\b`, 'gi');
      const matches = corrected.match(regex);
      
      if (matches && matches.length > 0) {
        changes.push({
          type: 'glossary',
          original: wrong,
          replacement: right,
          count: matches.length
        });
        corrected = corrected.replace(regex, right);
      }
    }

    return { text: corrected, changes };
  }

  /**
   * Apply contact name corrections using phonetic matching
   * @param {string} text - Input text
   * @param {Array} attendees - List of attendee names
   * @returns {{text: string, changes: Array}}
   */
  applyNameCorrections(text, attendees) {
    const changes = [];
    let corrected = text;

    for (const name of attendees) {
      if (!name) continue;
      
      const firstName = name.split(' ')[0];
      if (firstName.length < 3) continue;

      // Generate phonetic variations of the name
      const variations = this.generateNameVariations(firstName);
      
      for (const variation of variations) {
        if (variation.toLowerCase() === firstName.toLowerCase()) continue;
        
        const regex = new RegExp(`\\b${this.escapeRegex(variation)}\\b`, 'gi');
        const matches = corrected.match(regex);
        
        if (matches && matches.length > 0) {
          changes.push({
            type: 'name',
            original: variation,
            replacement: firstName,
            count: matches.length
          });
          corrected = corrected.replace(regex, firstName);
        }
      }
    }

    return { text: corrected, changes };
  }

  /**
   * Generate common phonetic variations of a name
   * @param {string} name - Original name
   * @returns {Array<string>} - Possible variations
   */
  generateNameVariations(name) {
    const variations = [];
    const lower = name.toLowerCase();

    // Common letter substitutions
    const substitutions = {
      'c': ['k', 's'],
      'k': ['c'],
      'ph': ['f'],
      'f': ['ph'],
      'i': ['ee', 'y'],
      'y': ['i', 'ie'],
      'ei': ['ie', 'ay'],
      'ie': ['ei', 'y'],
      'ou': ['ow', 'u'],
      'ow': ['ou'],
      'th': ['t'],
      'sh': ['ch'],
      'ch': ['sh']
    };

    // Generate basic variations
    for (const [original, replacements] of Object.entries(substitutions)) {
      if (lower.includes(original)) {
        for (const replacement of replacements) {
          variations.push(lower.replace(original, replacement));
        }
      }
    }

    // Add spaced-out variation (e.g., "M I T C H E L L" → "Mitchell")
    const spacedOut = lower.split('').join(' ');
    variations.push(spacedOut);

    return variations;
  }

  /**
   * Apply GPT-based correction for complex cases
   * @param {string} text - Input text
   * @param {Object} context - Context with attendees, account info
   * @returns {{text: string}}
   */
  async applyGPTCorrection(text, context = {}) {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    // Build context-aware prompt
    const attendeeList = context.attendees?.join(', ') || 'unknown';
    const accountName = context.accountName || 'unknown';

    const prompt = `You are a transcript corrector for Eudia, an AI legal technology company.

COMPANY CONTEXT:
- Company: Eudia (eudia.ai)
- Products: ${EUDIA_GLOSSARY.products.join(', ')}
- Key Terms: ${EUDIA_GLOSSARY.terms.slice(0, 20).join(', ')}
- People on this call: ${attendeeList}
- Customer: ${accountName}

YOUR TASK:
Correct any misheard words in this transcript. Focus on:
1. Company and product names (Eudia, Sigma, etc.)
2. People's names (especially the attendees listed above)
3. Industry jargon and acronyms (MEDDICC, ACV, CLO, GC, etc.)
4. Legal terms (NDA, MSA, DPA, etc.)

RULES:
- Only fix obvious transcription errors
- Do NOT change the meaning or add content
- Do NOT paraphrase or summarize
- Return the corrected transcript only, no explanations

TRANSCRIPT:
${text.substring(0, 8000)}`; // Limit to avoid token limits

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use mini for speed/cost
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1, // Very low for consistency
      max_tokens: 8000
    });

    const corrected = response.choices[0]?.message?.content || text;

    return { text: corrected };
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Quick rule-based correction only (no GPT)
   * Use this for real-time correction during playback
   */
  quickCorrect(text) {
    return applyCorrections(text);
  }
}

// Singleton instance
const transcriptCorrector = new TranscriptCorrector();

module.exports = {
  transcriptCorrector,
  TranscriptCorrector
};

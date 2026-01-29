/**
 * SmartTagService - Intelligent tag extraction from meeting transcripts
 * 
 * Extracts structured tags for:
 * - Product lines (constrained to Eudia's portfolio)
 * - MEDDICC signals
 * - Deal health indicators
 * - Meeting type classification
 * - Key stakeholders
 */

import { ProcessedSections } from './TranscriptionService';

// ═══════════════════════════════════════════════════════════════════════════
// TAG DEFINITIONS - Canonical values
// ═══════════════════════════════════════════════════════════════════════════

export const PRODUCT_LINE_TAGS = [
  'ai-contracting-tech',
  'ai-contracting-services',
  'ai-compliance-tech',
  'ai-compliance-services',
  'ai-ma-tech',
  'ai-ma-services',
  'sigma'
] as const;

export const MEDDICC_SIGNAL_TAGS = [
  'metrics-identified',
  'economic-buyer-identified',
  'decision-criteria-discussed',
  'decision-process-discussed',
  'pain-confirmed',
  'champion-identified',
  'competition-mentioned'
] as const;

export const DEAL_HEALTH_TAGS = [
  'progressing',
  'stalled',
  'at-risk',
  'champion-engaged',
  'early-stage'
] as const;

export const MEETING_TYPE_TAGS = [
  'discovery',
  'demo',
  'negotiation',
  'qbr',
  'implementation',
  'follow-up'
] as const;

export type ProductLineTag = typeof PRODUCT_LINE_TAGS[number];
export type MeddiccSignalTag = typeof MEDDICC_SIGNAL_TAGS[number];
export type DealHealthTag = typeof DEAL_HEALTH_TAGS[number];
export type MeetingTypeTag = typeof MEETING_TYPE_TAGS[number];

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface SmartTags {
  product_interest: ProductLineTag[];
  meddicc_signals: MeddiccSignalTag[];
  deal_health: DealHealthTag;
  meeting_type: MeetingTypeTag;
  key_stakeholders: string[];
  confidence: number; // 0-1 confidence score
}

export interface TagExtractionResult {
  success: boolean;
  tags: SmartTags;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TAG EXTRACTION PROMPT
// ═══════════════════════════════════════════════════════════════════════════

const TAG_EXTRACTION_PROMPT = `You are a sales intelligence tagger for Eudia, an AI legal technology company. Extract structured tags from meeting analysis.

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

// ═══════════════════════════════════════════════════════════════════════════
// SMART TAG SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class SmartTagService {
  private openaiApiKey: string | null = null;
  private serverUrl: string;

  constructor(serverUrl: string, openaiApiKey?: string) {
    this.serverUrl = serverUrl;
    this.openaiApiKey = openaiApiKey || null;
  }

  /**
   * Update OpenAI API key
   */
  setOpenAIKey(key: string): void {
    this.openaiApiKey = key;
  }

  /**
   * Update server URL
   */
  setServerUrl(url: string): void {
    this.serverUrl = url;
  }

  /**
   * Extract smart tags from processed sections
   * Makes a focused secondary call for tag extraction
   */
  async extractTags(sections: ProcessedSections): Promise<TagExtractionResult> {
    // Build context from sections
    const context = this.buildTagContext(sections);
    
    if (!context.trim()) {
      return {
        success: false,
        tags: this.getEmptyTags(),
        error: 'No content to analyze'
      };
    }

    // Try server first, fall back to local
    try {
      return await this.extractTagsViaServer(context);
    } catch (serverError) {
      console.warn('Server tag extraction failed, trying local:', serverError.message);
      
      if (this.openaiApiKey) {
        return await this.extractTagsLocal(context);
      }
      
      // If both fail, try rule-based extraction
      return this.extractTagsRuleBased(sections);
    }
  }

  /**
   * Build context string from sections for tag extraction
   */
  private buildTagContext(sections: ProcessedSections): string {
    const parts: string[] = [];
    
    if (sections.summary) {
      parts.push(`SUMMARY:\n${sections.summary}`);
    }
    
    if (sections.productInterest) {
      parts.push(`PRODUCT INTEREST:\n${sections.productInterest}`);
    }
    
    if (sections.meddiccSignals) {
      parts.push(`MEDDICC SIGNALS:\n${sections.meddiccSignals}`);
    }
    
    if (sections.dealSignals) {
      parts.push(`DEAL SIGNALS:\n${sections.dealSignals}`);
    }
    
    if (sections.painPoints) {
      parts.push(`PAIN POINTS:\n${sections.painPoints}`);
    }
    
    if (sections.attendees) {
      parts.push(`ATTENDEES:\n${sections.attendees}`);
    }
    
    return parts.join('\n\n');
  }

  /**
   * Extract tags via GTM Brain server
   */
  private async extractTagsViaServer(context: string): Promise<TagExtractionResult> {
    const response = await fetch(`${this.serverUrl}/api/extract-tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, openaiApiKey: this.openaiApiKey })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Tag extraction failed');
    }

    return {
      success: true,
      tags: this.validateAndNormalizeTags(result.tags)
    };
  }

  /**
   * Extract tags locally using OpenAI
   */
  private async extractTagsLocal(context: string): Promise<TagExtractionResult> {
    if (!this.openaiApiKey) {
      return {
        success: false,
        tags: this.getEmptyTags(),
        error: 'No OpenAI API key configured'
      };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Faster and cheaper for structured extraction
          messages: [
            { role: 'system', content: TAG_EXTRACTION_PROMPT },
            { role: 'user', content: `Extract tags from this meeting content:\n\n${context}` }
          ],
          temperature: 0.1, // Very low for consistent output
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI returned ${response.status}`);
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content in response');
      }

      const parsedTags = JSON.parse(content);
      
      return {
        success: true,
        tags: this.validateAndNormalizeTags(parsedTags)
      };

    } catch (error) {
      console.error('Local tag extraction error:', error);
      return {
        success: false,
        tags: this.getEmptyTags(),
        error: error.message || 'Tag extraction failed'
      };
    }
  }

  /**
   * Rule-based tag extraction as fallback
   * Uses keyword matching when AI is unavailable
   */
  private extractTagsRuleBased(sections: ProcessedSections): TagExtractionResult {
    const content = Object.values(sections).join(' ').toLowerCase();
    
    const tags: SmartTags = {
      product_interest: [],
      meddicc_signals: [],
      deal_health: 'early-stage',
      meeting_type: 'discovery',
      key_stakeholders: [],
      confidence: 0.4 // Lower confidence for rule-based
    };

    // Product line detection
    if (content.includes('contract') || content.includes('contracting')) {
      if (content.includes('service')) {
        tags.product_interest.push('ai-contracting-services');
      } else {
        tags.product_interest.push('ai-contracting-tech');
      }
    }
    
    if (content.includes('compliance')) {
      tags.product_interest.push('ai-compliance-tech');
    }
    
    if (content.includes('m&a') || content.includes('due diligence') || content.includes('acquisition')) {
      tags.product_interest.push('ai-ma-tech');
    }
    
    if (content.includes('sigma')) {
      tags.product_interest.push('sigma');
    }

    // MEDDICC signal detection
    if (content.includes('metric') || content.includes('%') || content.includes('roi') || content.includes('save')) {
      tags.meddicc_signals.push('metrics-identified');
    }
    
    if (content.includes('budget') || content.includes('cfo') || content.includes('economic buyer')) {
      tags.meddicc_signals.push('economic-buyer-identified');
    }
    
    if (content.includes('pain') || content.includes('challenge') || content.includes('problem') || content.includes('struggle')) {
      tags.meddicc_signals.push('pain-confirmed');
    }
    
    if (content.includes('champion') || content.includes('advocate') || content.includes('sponsor')) {
      tags.meddicc_signals.push('champion-identified');
    }
    
    if (content.includes('competitor') || content.includes('alternative') || content.includes('vs') || content.includes('compared to')) {
      tags.meddicc_signals.push('competition-mentioned');
    }

    // Deal health detection
    if (content.includes('next step') || content.includes('follow up') || content.includes('schedule')) {
      tags.deal_health = 'progressing';
    }
    
    if (content.includes('concern') || content.includes('objection') || content.includes('hesitant') || content.includes('risk')) {
      tags.deal_health = 'at-risk';
    }

    // Meeting type detection
    if (content.includes('demo') || content.includes('show you') || content.includes('demonstration')) {
      tags.meeting_type = 'demo';
    } else if (content.includes('pricing') || content.includes('negotiat') || content.includes('contract terms')) {
      tags.meeting_type = 'negotiation';
    } else if (content.includes('quarterly') || content.includes('qbr') || content.includes('review')) {
      tags.meeting_type = 'qbr';
    } else if (content.includes('implementation') || content.includes('onboard') || content.includes('rollout')) {
      tags.meeting_type = 'implementation';
    }

    return {
      success: true,
      tags: tags
    };
  }

  /**
   * Validate and normalize tags to ensure they match allowed values
   */
  private validateAndNormalizeTags(rawTags: any): SmartTags {
    const tags: SmartTags = {
      product_interest: [],
      meddicc_signals: [],
      deal_health: 'early-stage',
      meeting_type: 'discovery',
      key_stakeholders: [],
      confidence: rawTags.confidence || 0.8
    };

    // Validate product interest
    if (Array.isArray(rawTags.product_interest)) {
      tags.product_interest = rawTags.product_interest.filter(
        (t: string) => PRODUCT_LINE_TAGS.includes(t as ProductLineTag)
      ) as ProductLineTag[];
    }

    // Validate MEDDICC signals
    if (Array.isArray(rawTags.meddicc_signals)) {
      tags.meddicc_signals = rawTags.meddicc_signals.filter(
        (t: string) => MEDDICC_SIGNAL_TAGS.includes(t as MeddiccSignalTag)
      ) as MeddiccSignalTag[];
    }

    // Validate deal health
    if (DEAL_HEALTH_TAGS.includes(rawTags.deal_health)) {
      tags.deal_health = rawTags.deal_health;
    }

    // Validate meeting type
    if (MEETING_TYPE_TAGS.includes(rawTags.meeting_type)) {
      tags.meeting_type = rawTags.meeting_type;
    }

    // Keep stakeholders as-is (strings)
    if (Array.isArray(rawTags.key_stakeholders)) {
      tags.key_stakeholders = rawTags.key_stakeholders.slice(0, 10);
    }

    return tags;
  }

  /**
   * Get empty tags structure
   */
  private getEmptyTags(): SmartTags {
    return {
      product_interest: [],
      meddicc_signals: [],
      deal_health: 'early-stage',
      meeting_type: 'discovery',
      key_stakeholders: [],
      confidence: 0
    };
  }

  /**
   * Format tags for YAML frontmatter
   */
  static formatTagsForFrontmatter(tags: SmartTags): Record<string, any> {
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
  static generateTagSummary(tags: SmartTags): string {
    const parts: string[] = [];
    
    if (tags.product_interest.length > 0) {
      parts.push(`**Products:** ${tags.product_interest.join(', ')}`);
    }
    
    if (tags.meddicc_signals.length > 0) {
      parts.push(`**MEDDICC:** ${tags.meddicc_signals.join(', ')}`);
    }
    
    parts.push(`**Deal Health:** ${tags.deal_health}`);
    parts.push(`**Meeting Type:** ${tags.meeting_type}`);
    
    return parts.join(' | ');
  }
}

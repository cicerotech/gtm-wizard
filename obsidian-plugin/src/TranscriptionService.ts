/**
 * TranscriptionService - Handles communication with GTM-Brain backend
 * for audio transcription and AI summarization
 * 
 * v2.0 - Enhanced with precision prompts for consistent sales intelligence extraction
 */

import { requestUrl } from 'obsidian';

// ═══════════════════════════════════════════════════════════════════════════
// EUDIA PRODUCT LINES - Canonical list for constraint enforcement
// ═══════════════════════════════════════════════════════════════════════════

export const EUDIA_PRODUCT_LINES = [
  'AI Contracting - Technology',
  'AI Contracting - Services',
  'AI Compliance - Technology',
  'AI Compliance - Services',
  'AI M&A - Technology',
  'AI M&A - Services',
  'Sigma'
] as const;

export type EudiaProductLine = typeof EUDIA_PRODUCT_LINES[number];

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNT DETECTOR - Auto-detect account from meeting context
// ═══════════════════════════════════════════════════════════════════════════

export interface AccountDetectionResult {
  account: string | null;
  accountId: string | null;
  confidence: number;
  source: 'title' | 'attendee_domain' | 'salesforce_match' | 'none';
  evidence: string;
}

export class AccountDetector {
  private salesforceAccounts: Array<{ id: string; name: string }> = [];
  
  /**
   * Set Salesforce accounts for matching
   */
  setAccounts(accounts: Array<{ id: string; name: string }>): void {
    this.salesforceAccounts = accounts;
  }

  /**
   * Detect account from meeting title and/or attendees
   * Uses multiple strategies with confidence scoring
   */
  detectAccount(
    meetingTitle?: string,
    attendees?: string[],
    filePath?: string
  ): AccountDetectionResult {
    // Strategy 1: Parse from meeting title (highest priority)
    if (meetingTitle) {
      const titleResult = this.detectFromTitle(meetingTitle);
      if (titleResult.confidence >= 70) {
        return titleResult;
      }
    }

    // Strategy 2: Parse from file path (folder structure)
    if (filePath) {
      const pathResult = this.detectFromFilePath(filePath);
      if (pathResult.confidence >= 70) {
        return pathResult;
      }
    }

    // Strategy 3: Parse from attendee domains
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
      source: 'none',
      evidence: 'No account detected from available context'
    };
  }

  /**
   * Detect account from meeting title
   */
  detectFromTitle(title: string): AccountDetectionResult {
    if (!title) {
      return { account: null, accountId: null, confidence: 0, source: 'title', evidence: 'No title' };
    }

    // Common meeting title patterns
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
      { regex: /^\[([^\]]+)\]/, confidence: 75 },
    ];

    // False positives to filter out
    const falsePositives = [
      'weekly', 'daily', 'monthly', 'internal', 'team', '1:1', 'one on one',
      'standup', 'sync', 'meeting', 'call', 'notes', 'monday', 'tuesday',
      'wednesday', 'thursday', 'friday', 'untitled', 'new', 'test'
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern.regex);
      if (match && match[1]) {
        const accountGuess = match[1].trim();
        
        // Skip false positives
        if (falsePositives.some(fp => accountGuess.toLowerCase() === fp)) {
          continue;
        }
        
        // Skip if too short
        if (accountGuess.length < 2) {
          continue;
        }

        // Try to match against Salesforce accounts
        const sfMatch = this.fuzzyMatchSalesforce(accountGuess);
        if (sfMatch) {
          return {
            account: sfMatch.name,
            accountId: sfMatch.id,
            confidence: Math.min(pattern.confidence + 10, 100),
            source: 'salesforce_match',
            evidence: `Matched "${accountGuess}" from title to Salesforce account "${sfMatch.name}"`
          };
        }

        // Return the parsed name even without SF match
        return {
          account: accountGuess,
          accountId: null,
          confidence: pattern.confidence,
          source: 'title',
          evidence: `Extracted from meeting title pattern`
        };
      }
    }

    return { account: null, accountId: null, confidence: 0, source: 'title', evidence: 'No pattern matched' };
  }

  /**
   * Detect account from file path (Accounts/CompanyName/...)
   */
  detectFromFilePath(filePath: string): AccountDetectionResult {
    // Look for Accounts folder pattern
    const accountsMatch = filePath.match(/Accounts\/([^\/]+)\//i);
    if (accountsMatch && accountsMatch[1]) {
      const folderName = accountsMatch[1].trim();
      
      // Try to match against Salesforce
      const sfMatch = this.fuzzyMatchSalesforce(folderName);
      if (sfMatch) {
        return {
          account: sfMatch.name,
          accountId: sfMatch.id,
          confidence: 95,
          source: 'salesforce_match',
          evidence: `File in account folder "${folderName}" matched to "${sfMatch.name}"`
        };
      }

      return {
        account: folderName,
        accountId: null,
        confidence: 85,
        source: 'title', // File path is treated like title
        evidence: `File located in Accounts/${folderName} folder`
      };
    }

    return { account: null, accountId: null, confidence: 0, source: 'none', evidence: 'Not in Accounts folder' };
  }

  /**
   * Detect account from attendee email domains
   */
  detectFromAttendees(attendees: string[]): AccountDetectionResult {
    // Extract external domains (not @eudia.com and not common email providers)
    const commonProviders = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com'];
    const externalDomains = new Set<string>();

    for (const attendee of attendees) {
      const email = attendee.toLowerCase();
      const domainMatch = email.match(/@([a-z0-9.-]+)/);
      if (domainMatch) {
        const domain = domainMatch[1];
        if (!domain.includes('eudia.com') && !commonProviders.includes(domain)) {
          externalDomains.add(domain);
        }
      }
    }

    if (externalDomains.size === 0) {
      return { account: null, accountId: null, confidence: 0, source: 'attendee_domain', evidence: 'No external domains' };
    }

    // Try to match domains to Salesforce accounts
    for (const domain of externalDomains) {
      const companyName = domain.split('.')[0];
      const capitalized = companyName.charAt(0).toUpperCase() + companyName.slice(1);
      
      const sfMatch = this.fuzzyMatchSalesforce(capitalized);
      if (sfMatch) {
        return {
          account: sfMatch.name,
          accountId: sfMatch.id,
          confidence: 75,
          source: 'salesforce_match',
          evidence: `Matched attendee domain ${domain} to "${sfMatch.name}"`
        };
      }
    }

    // Return best guess from first external domain
    const firstDomain = Array.from(externalDomains)[0];
    const companyName = firstDomain.split('.')[0];
    const capitalized = companyName.charAt(0).toUpperCase() + companyName.slice(1);

    return {
      account: capitalized,
      accountId: null,
      confidence: 50,
      source: 'attendee_domain',
      evidence: `Guessed from external attendee domain: ${firstDomain}`
    };
  }

  /**
   * Fuzzy match against Salesforce accounts
   */
  fuzzyMatchSalesforce(searchName: string): { id: string; name: string } | null {
    if (!searchName || this.salesforceAccounts.length === 0) {
      return null;
    }

    const search = searchName.toLowerCase().trim();

    // Exact match
    for (const acc of this.salesforceAccounts) {
      if (acc.name?.toLowerCase() === search) {
        return acc;
      }
    }

    // Starts with match
    for (const acc of this.salesforceAccounts) {
      if (acc.name?.toLowerCase().startsWith(search)) {
        return acc;
      }
    }

    // Contains match (search in account name)
    for (const acc of this.salesforceAccounts) {
      if (acc.name?.toLowerCase().includes(search)) {
        return acc;
      }
    }

    // Contains match (account name in search)
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
  suggestAccounts(query: string, limit: number = 10): Array<{ id: string; name: string; score: number }> {
    if (!query || query.length < 2) {
      return this.salesforceAccounts.slice(0, limit).map(a => ({ ...a, score: 0 }));
    }

    const search = query.toLowerCase();
    const results: Array<{ id: string; name: string; score: number }> = [];

    for (const acc of this.salesforceAccounts) {
      const name = acc.name?.toLowerCase() || '';
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

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

// Singleton instance
export const accountDetector = new AccountDetector();

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE MEETING DETECTOR - Detects internal pipeline review meetings
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Keywords that indicate a pipeline review meeting
 */
const PIPELINE_MEETING_SIGNALS = [
  'pipeline review',
  'pipeline call',
  'weekly pipeline',
  'forecast call',
  'forecast review',
  'deal review',
  'opportunity review',
  'sales review',
  'pipeline sync',
  'forecast sync',
  'deal sync',
  'pipeline update',
  'forecast meeting'
];

/**
 * Result of pipeline meeting detection
 */
export interface PipelineMeetingDetectionResult {
  isPipelineMeeting: boolean;
  confidence: number;
  evidence: string;
}

/**
 * Detect if a meeting is an internal pipeline review meeting.
 * Used to apply specialized prompts for admin users.
 * 
 * @param title - Meeting title
 * @param attendees - List of attendee emails
 * @returns Detection result with confidence
 */
export function detectPipelineMeeting(
  title?: string,
  attendees?: string[]
): PipelineMeetingDetectionResult {
  // Check title for pipeline signals
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

  // Check if all attendees are internal (@eudia.com)
  if (attendees && attendees.length >= 2) {
    const internalDomains = ['eudia.com', 'johnsonhana.com'];
    const allInternal = attendees.every(email => {
      const domain = email.toLowerCase().split('@')[1] || '';
      return internalDomains.some(d => domain.includes(d));
    });
    
    if (allInternal && attendees.length >= 3) {
      // All internal with 3+ people - likely a pipeline/team meeting
      // But we need more evidence to be sure
      if (title) {
        const titleLower = title.toLowerCase();
        const teamMeetingSignals = ['sync', 'review', 'update', 'weekly', 'team', 'forecast'];
        const hasTeamSignal = teamMeetingSignals.some(s => titleLower.includes(s));
        
        if (hasTeamSignal) {
          return {
            isPipelineMeeting: true,
            confidence: 70,
            evidence: `All internal attendees (${attendees.length}) with team meeting signal`
          };
        }
      }
      
      // All internal but no clear signal - lower confidence
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
    evidence: 'No pipeline meeting indicators found'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface TranscriptionResult {
  success: boolean;
  transcript: string;
  sections: ProcessedSections;
  duration: number;
  error?: string;
}

export interface ProcessedSections {
  // Core sections
  summary: string;
  attendees: string;
  
  // Sales intelligence
  meddiccSignals: string;
  productInterest: string;
  painPoints: string;
  buyingTriggers: string;
  
  // Timeline & actions
  keyDates: string;
  nextSteps: string;
  actionItems: string;
  
  // Deal health
  dealSignals: string;
  risksObjections: string;
  competitiveIntel: string;
}

export interface MeetingContext {
  success: boolean;
  account?: {
    id: string;
    name: string;
    owner: string;
    customerBrain: string;
  };
  opportunities?: Array<{
    id: string;
    name: string;
    stage: string;
    acv: number;
    targetSignDate: string;
  }>;
  contacts?: Array<{
    id: string;
    name: string;
    title: string;
    email: string;
  }>;
  lastMeeting?: {
    date: string;
    subject: string;
  };
  error?: string;
}

export interface SyncResult {
  success: boolean;
  customerBrainUpdated?: boolean;
  eventCreated?: boolean;
  eventId?: string;
  contactsCreated?: number;
  tasksCreated?: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRECISION PROMPT - The core intelligence extraction engine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the system prompt for meeting analysis
 * This is the most important function - it determines output quality
 */
function buildAnalysisPrompt(accountName?: string, context?: MeetingContext): string {
  // Build context section if available
  let contextSection = '';
  if (context?.account || context?.opportunities?.length) {
    contextSection = `
ACCOUNT CONTEXT (use to inform your analysis):
${context.account ? `- Account: ${context.account.name}` : ''}
${context.account?.owner ? `- Account Owner: ${context.account.owner}` : ''}
${context.opportunities?.length ? `- Open Opportunities: ${context.opportunities.map(o => `${o.name} (${o.stage}, $${(o.acv/1000).toFixed(0)}k)`).join('; ')}` : ''}
${context.contacts?.length ? `- Known Contacts: ${context.contacts.slice(0, 5).map(c => `${c.name} - ${c.title}`).join('; ')}` : ''}
`;
  }

  return `You are a senior sales intelligence analyst for Eudia, an AI-powered legal technology company. Your role is to extract precise, actionable intelligence from sales meeting transcripts.

ABOUT EUDIA:
Eudia provides AI solutions for legal teams at enterprise companies. Our products help in-house legal teams work faster on contracting, compliance, and M&A due diligence. We sell to CLOs, General Counsels, VP Legal, Legal Ops Directors, and Deputy GCs.

${accountName ? `CURRENT ACCOUNT: ${accountName}` : ''}
${contextSection}

═══════════════════════════════════════════════════════════════════════════
CRITICAL RULES - Follow these exactly:
═══════════════════════════════════════════════════════════════════════════

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

═══════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT - Use these exact headers:
═══════════════════════════════════════════════════════════════════════════

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
- **[Objection]**: "[Quote or paraphrase]" → [Suggested response approach]

If no objections raised, write: "None raised in this conversation."

## Competitive Intelligence
If competitors were mentioned:
- **[Competitor]**: [What was said, sentiment, perceived strengths/weaknesses]

If no competitors mentioned, write: "No competitive mentions."

═══════════════════════════════════════════════════════════════════════════
FINAL CHECKS:
═══════════════════════════════════════════════════════════════════════════
- Every claim has evidence from the transcript
- Names are spelled exactly as heard
- Product lines use only the allowed values
- Quotes are properly attributed
- Action items have clear owners`;
}

/**
 * Build a specialized prompt for internal pipeline review meetings.
 * This extracts per-account updates from team discussions about deals.
 */
export function buildPipelineReviewPrompt(): string {
  return `You are analyzing an internal pipeline review meeting at Eudia, an AI-powered legal technology company. This is an internal team discussion about customer deals and opportunities.

═══════════════════════════════════════════════════════════════════════════
CONTEXT
═══════════════════════════════════════════════════════════════════════════

Eudia's sales team regularly holds pipeline review meetings to discuss:
- Deal progress and stage movements
- Blockers and risks on specific accounts
- Next steps for advancing opportunities
- Forecast updates

Your job is to extract structured updates for EACH account/deal discussed.

═══════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT - Use these exact headers:
═══════════════════════════════════════════════════════════════════════════

## Meeting Summary
Brief 2-3 sentence overview of the pipeline review discussion.

## Attendees
- **[Name]** - Role (if mentioned)

## Account Updates

For EACH account or opportunity mentioned, create a subsection:

### [Account Name]
**Owner:** [BL Name if mentioned]
**Status:** [Current stage or status discussed]

**Updates Discussed:**
- [Key update or development]
- [Another update]

**Blockers/Risks:**
- [Any blockers mentioned, or "None discussed"]

**Next Steps:**
- [ ] [Action item] - **Owner:** [Name] - **Due:** [Date if mentioned]

**Stage Movement:**
- [e.g., "Moving from Stage 2 to Stage 3" or "No change discussed"]

---

*(Repeat the above format for each account discussed)*

## Pipeline Health Summary

### Accounts Advancing
Accounts showing positive momentum:
- **[Account]**: [Why it's advancing]

### Accounts At Risk
Accounts with blockers or concerns:
- **[Account]**: [Risk/concern]

### New Opportunities
Any new deals or accounts mentioned:
- **[Account]**: [Brief context]

## Forecast Updates
Any changes to forecast or expected close dates:
- [Account]: [Forecast change]

## Team Action Items
Cross-functional or team-wide follow-ups:
- [ ] [Action] - **Owner:** [Name]

═══════════════════════════════════════════════════════════════════════════
CRITICAL RULES:
═══════════════════════════════════════════════════════════════════════════

1. Extract EVERY account mentioned, even briefly
2. Use exact names as spoken (accounts and people)
3. If an account owner is unclear, mark as "[Owner unclear]"
4. Include direct quotes for significant statements
5. For accounts with no updates, note "Brief mention, no substantive updates"
6. Capture ALL action items with clear ownership`;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSCRIPTION SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class TranscriptionService {
  private serverUrl: string;
  private openaiApiKey: string | null = null;

  constructor(serverUrl: string, openaiApiKey?: string) {
    this.serverUrl = serverUrl;
    this.openaiApiKey = openaiApiKey || null;
  }

  /**
   * Update server URL
   */
  setServerUrl(url: string): void {
    this.serverUrl = url;
  }

  /**
   * Update OpenAI API key
   */
  setOpenAIKey(key: string): void {
    this.openaiApiKey = key;
  }

  /**
   * Send audio for transcription and summarization
   * Tries server first, falls back to local OpenAI if server unavailable
   */
  async transcribeAndSummarize(
    audioBase64: string,
    mimeType: string,
    accountName?: string,
    accountId?: string,
    context?: MeetingContext
  ): Promise<TranscriptionResult> {
    // Try server first
    try {
      const response = await requestUrl({
        url: `${this.serverUrl}/api/transcribe-and-summarize`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
          } : undefined,
          // Send the enhanced prompt to server
          systemPrompt: buildAnalysisPrompt(accountName, context)
        })
      });

      if (!response.json.success) {
        return {
          success: false,
          transcript: '',
          sections: this.getEmptySections(),
          duration: 0,
          error: response.json.error || 'Transcription failed'
        };
      }

      return {
        success: true,
        transcript: response.json.transcript || '',
        sections: this.normalizeSections(response.json.sections),
        duration: response.json.duration || 0
      };

    } catch (error: any) {
      // Log full error details for debugging
      console.error('Server transcription error:', error);
      if (error.response) {
        console.error('Server response:', error.response);
      }
      
      // Try to extract server error message
      let serverMessage = '';
      try {
        if (error.response?.json?.error) {
          serverMessage = error.response.json.error;
        } else if (typeof error.response === 'string') {
          const parsed = JSON.parse(error.response);
          serverMessage = parsed.error || '';
        }
      } catch (e) {
        // Ignore parsing errors
      }
      
      // Provide clear error message based on error type
      let errorMessage = serverMessage || `Transcription failed: ${error.message}`;
      if (error.message?.includes('413')) {
        errorMessage = 'Audio file too large for server. Try a shorter recording.';
      } else if (error.message?.includes('500')) {
        errorMessage = serverMessage || 'Server error during transcription. Please try again.';
      } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        errorMessage = 'Could not reach transcription server. Check your internet connection.';
      }
      
      console.error('Final error message:', errorMessage);
      
      return {
        success: false,
        transcript: '',
        sections: this.getEmptySections(),
        duration: 0,
        error: errorMessage
      };
    }
  }

  /**
   * Local fallback transcription using user's OpenAI key
   */
  async transcribeLocal(
    audioBase64: string,
    mimeType: string,
    accountName?: string,
    context?: MeetingContext
  ): Promise<TranscriptionResult> {
    if (!this.openaiApiKey) {
      return {
        success: false,
        transcript: '',
        sections: this.getEmptySections(),
        duration: 0,
        error: 'No OpenAI API key configured. Add it in plugin settings.'
      };
    }

    try {
      // Convert base64 to blob for FormData
      const binaryString = atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const audioBlob = new Blob([bytes], { type: mimeType });
      
      // Create FormData for Whisper API
      const formData = new FormData();
      const extension = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'm4a' : 'ogg';
      formData.append('file', audioBlob, `audio.${extension}`);
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'verbose_json');
      formData.append('language', 'en');

      // Call Whisper API
      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`
        },
        body: formData
      });

      if (!whisperResponse.ok) {
        const errorText = await whisperResponse.text();
        throw new Error(`Whisper API error: ${whisperResponse.status} - ${errorText}`);
      }

      const whisperResult = await whisperResponse.json();
      const transcript = whisperResult.text || '';
      const duration = whisperResult.duration || 0;

      // Now summarize with GPT-4o using precision prompt
      const sections = await this.summarizeLocal(transcript, accountName, context);

      return {
        success: true,
        transcript,
        sections,
        duration
      };

    } catch (error) {
      console.error('Local transcription error:', error);
      return {
        success: false,
        transcript: '',
        sections: this.getEmptySections(),
        duration: 0,
        error: error.message || 'Local transcription failed'
      };
    }
  }

  /**
   * Summarize transcript locally using GPT-4o with precision prompt
   */
  async summarizeLocal(
    transcript: string, 
    accountName?: string,
    context?: MeetingContext
  ): Promise<ProcessedSections> {
    if (!this.openaiApiKey) {
      return this.getEmptySections();
    }

    try {
      const systemPrompt = buildAnalysisPrompt(accountName, context);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Analyze this meeting transcript:\n\n${transcript.substring(0, 100000)}` }
          ],
          temperature: 0.2, // Lower temperature for more consistent output
          max_tokens: 6000  // Increased for comprehensive analysis
        })
      });

      if (!response.ok) {
        console.warn('GPT summarization failed, returning empty sections');
        return this.getEmptySections();
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || '';
      
      return this.parseSections(content);

    } catch (error) {
      console.error('Local summarization error:', error);
      return this.getEmptySections();
    }
  }

  /**
   * Parse GPT response into sections object
   * Enhanced to handle new section types
   */
  parseSections(content: string): ProcessedSections {
    const sections: ProcessedSections = this.getEmptySections();

    const headerMap: Record<string, keyof ProcessedSections> = {
      'summary': 'summary',
      'attendees': 'attendees',
      'meddicc signals': 'meddiccSignals',
      'product interest': 'productInterest',
      'pain points': 'painPoints',
      'buying triggers': 'buyingTriggers',
      'key dates': 'keyDates',
      'next steps': 'nextSteps',
      'action items': 'actionItems',
      'action items (internal)': 'actionItems',
      'deal signals': 'dealSignals',
      'risks & objections': 'risksObjections',
      'risks and objections': 'risksObjections',
      'competitive intelligence': 'competitiveIntel'
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
  private normalizeSections(serverSections: Partial<ProcessedSections> | null): ProcessedSections {
    const empty = this.getEmptySections();
    if (!serverSections) return empty;
    
    return {
      ...empty,
      ...serverSections
    };
  }

  /**
   * Fetch meeting context for an account (pre-call)
   */
  async getMeetingContext(accountId: string): Promise<MeetingContext> {
    try {
      const response = await requestUrl({
        url: `${this.serverUrl}/api/meeting-context/${accountId}`,
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.json.success) {
        return {
          success: false,
          error: response.json.error || 'Failed to fetch context'
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
      console.error('Meeting context error:', error);
      return {
        success: false,
        error: error.message || 'Network error'
      };
    }
  }

  /**
   * Sync transcription results to Salesforce
   */
  async syncToSalesforce(
    accountId: string,
    accountName: string,
    noteTitle: string,
    sections: ProcessedSections,
    transcript: string,
    meetingDate?: string
  ): Promise<SyncResult> {
    try {
      const response = await requestUrl({
        url: `${this.serverUrl}/api/transcription/sync-to-salesforce`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accountId,
          accountName,
          noteTitle,
          sections,
          transcript,
          meetingDate: meetingDate || new Date().toISOString(),
          syncedAt: new Date().toISOString()
        })
      });

      if (!response.json.success) {
        return {
          success: false,
          error: response.json.error || 'Sync failed'
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
      console.error('Salesforce sync error:', error);
      return {
        success: false,
        error: error.message || 'Network error'
      };
    }
  }

  /**
   * Get empty sections structure with all fields
   */
  private getEmptySections(): ProcessedSections {
    return {
      summary: '',
      attendees: '',
      meddiccSignals: '',
      productInterest: '',
      painPoints: '',
      buyingTriggers: '',
      keyDates: '',
      nextSteps: '',
      actionItems: '',
      dealSignals: '',
      risksObjections: '',
      competitiveIntel: ''
    };
  }

  /**
   * Format sections for note insertion
   * Optimized for busy salespeople: TL;DR first, evidence-based insights, actionable checklists
   */
  static formatSectionsForNote(sections: ProcessedSections, transcript?: string): string {
    let content = '';

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIORITY 1: TL;DR - The headline for busy salespeople
    // ═══════════════════════════════════════════════════════════════════════════
    if (sections.summary) {
      content += `## TL;DR\n\n${sections.summary}\n\n`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIORITY 2: Key Insights - What matters for the deal
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Pain points are critical - show prominently if present
    if (sections.painPoints && !sections.painPoints.includes('None explicitly stated')) {
      content += `## Pain Points\n\n${sections.painPoints}\n\n`;
    }

    // Product interest
    if (sections.productInterest && !sections.productInterest.includes('None identified')) {
      content += `## Product Interest\n\n${sections.productInterest}\n\n`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIORITY 3: MEDDICC Signals - With evidence (only show detected signals)
    // ═══════════════════════════════════════════════════════════════════════════
    if (sections.meddiccSignals) {
      content += `## MEDDICC Signals\n\n${sections.meddiccSignals}\n\n`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIORITY 4: Next Steps - Actionable checklist format
    // ═══════════════════════════════════════════════════════════════════════════
    if (sections.nextSteps) {
      content += `## Next Steps\n\n${sections.nextSteps}\n\n`;
    }

    // Internal action items
    if (sections.actionItems) {
      content += `## Action Items (Internal)\n\n${sections.actionItems}\n\n`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIORITY 5: Timeline & Context
    // ═══════════════════════════════════════════════════════════════════════════
    if (sections.keyDates && !sections.keyDates.includes('No specific dates')) {
      content += `## Key Dates\n\n${sections.keyDates}\n\n`;
    }

    if (sections.buyingTriggers) {
      content += `## Buying Triggers\n\n${sections.buyingTriggers}\n\n`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIORITY 6: Deal Health & Risks
    // ═══════════════════════════════════════════════════════════════════════════
    if (sections.dealSignals) {
      content += `## Deal Signals\n\n${sections.dealSignals}\n\n`;
    }

    if (sections.risksObjections && !sections.risksObjections.includes('None raised')) {
      content += `## Risks & Objections\n\n${sections.risksObjections}\n\n`;
    }

    if (sections.competitiveIntel && !sections.competitiveIntel.includes('No competitive')) {
      content += `## Competitive Intelligence\n\n${sections.competitiveIntel}\n\n`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIORITY 7: Supporting Details
    // ═══════════════════════════════════════════════════════════════════════════
    if (sections.attendees) {
      content += `## Attendees\n\n${sections.attendees}\n\n`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSCRIPT: Collapsible for reference
    // ═══════════════════════════════════════════════════════════════════════════
    if (transcript) {
      content += `---\n\n<details>\n<summary><strong>Full Transcript</strong></summary>\n\n${transcript}\n\n</details>\n`;
    }

    return content;
  }

  /**
   * Format sections for note with audio file reference
   */
  static formatSectionsWithAudio(
    sections: ProcessedSections, 
    transcript: string | undefined, 
    audioFilePath: string | undefined
  ): string {
    let content = this.formatSectionsForNote(sections, transcript);
    
    // Add audio file reference at the very end
    if (audioFilePath) {
      content += `\n---\n\n## Recording\n\n![[${audioFilePath}]]\n`;
    }
    
    return content;
  }

  /**
   * Format meeting context for pre-call injection
   */
  static formatContextForNote(context: MeetingContext): string {
    if (!context.success) return '';

    let content = '## Pre-Call Context\n\n';

    if (context.account) {
      content += `**Account:** ${context.account.name}\n`;
      content += `**Owner:** ${context.account.owner}\n\n`;
    }

    if (context.opportunities && context.opportunities.length > 0) {
      content += '### Open Opportunities\n\n';
      for (const opp of context.opportunities) {
        const acvFormatted = opp.acv ? `$${(opp.acv / 1000).toFixed(0)}k` : 'TBD';
        content += `- **${opp.name}** - ${opp.stage} - ${acvFormatted}`;
        if (opp.targetSignDate) {
          content += ` - Target: ${new Date(opp.targetSignDate).toLocaleDateString()}`;
        }
        content += '\n';
      }
      content += '\n';
    }

    if (context.contacts && context.contacts.length > 0) {
      content += '### Key Contacts\n\n';
      for (const contact of context.contacts.slice(0, 5)) {
        content += `- **${contact.name}**`;
        if (contact.title) content += ` - ${contact.title}`;
        content += '\n';
      }
      content += '\n';
    }

    if (context.lastMeeting) {
      content += '### Last Meeting\n\n';
      content += `${new Date(context.lastMeeting.date).toLocaleDateString()} - ${context.lastMeeting.subject}\n\n`;
    }

    if (context.account?.customerBrain) {
      const recentNotes = context.account.customerBrain.substring(0, 500);
      if (recentNotes) {
        content += '### Recent Notes\n\n';
        content += `${recentNotes}${context.account.customerBrain.length > 500 ? '...' : ''}\n\n`;
      }
    }

    content += '---\n\n';
    
    return content;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WRAPPER METHODS - For main.ts compatibility
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Convert Blob to base64 string
   */
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
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
  async transcribeAudio(
    audioBlob: Blob, 
    context?: { accountName?: string; accountId?: string; speakerHints?: string[] }
  ): Promise<{ text: string; confidence: number; duration?: number; sections?: ProcessedSections }> {
    try {
      const base64 = await this.blobToBase64(audioBlob);
      const mimeType = audioBlob.type || 'audio/webm';
      
      const result = await this.transcribeAndSummarize(
        base64, 
        mimeType, 
        context?.accountName, 
        context?.accountId
      );
      
      return {
        text: result.transcript,
        confidence: result.success ? 0.95 : 0,
        duration: result.duration,
        sections: result.sections  // Include server-generated sections!
      };
    } catch (error) {
      console.error('transcribeAudio error:', error);
      return {
        text: '',
        confidence: 0,
        duration: 0,
        sections: this.getEmptySections()
      };
    }
  }

  /**
   * Wrapper method for main.ts - processes transcription into sections
   * Called by main.ts line 1266
   */
  async processTranscription(
    transcriptText: string,
    context?: { accountName?: string; accountId?: string }
  ): Promise<ProcessedSections> {
    // If we already have the transcript, we need to re-summarize it
    // This is a simplified version - in production, you might cache the sections
    if (!transcriptText || transcriptText.trim().length === 0) {
      return this.getEmptySections();
    }

    try {
      // Use OpenAI to extract sections from the transcript
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

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are a sales meeting analyst. Extract structured information from transcripts. Return valid JSON only.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 2000
          })
        });

        if (response.ok) {
          const data = await response.json();
          const content = data.choices?.[0]?.message?.content || '';
          
          // Parse JSON from response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Convert arrays to formatted strings to match ProcessedSections interface
            const formatNextSteps = (steps: any) => {
              if (Array.isArray(steps)) {
                return steps.map(s => `- [ ] ${s}`).join('\n');
              }
              return steps || '';
            };
            
            const formatKeyPoints = (points: any) => {
              if (Array.isArray(points)) {
                return points.map(p => `- ${p}`).join('\n');
              }
              return points || '';
            };
            
            const formatMeddicc = (signals: any) => {
              if (Array.isArray(signals)) {
                return signals.map(s => {
                  if (typeof s === 'object' && s.category) {
                    return `**${s.category}**: ${s.signal || s.insight || ''}`;
                  }
                  return `- ${s}`;
                }).join('\n');
              }
              return signals || '';
            };
            
            const formatAttendees = (attendees: any) => {
              if (Array.isArray(attendees)) {
                return attendees.map(a => `- ${a}`).join('\n');
              }
              return attendees || '';
            };
            
            return {
              summary: parsed.summary || '',
              painPoints: formatKeyPoints(parsed.keyPoints || parsed.painPoints),
              productInterest: '',
              meddiccSignals: formatMeddicc(parsed.meddiccSignals),
              nextSteps: formatNextSteps(parsed.nextSteps),
              actionItems: '',
              keyDates: '',
              buyingTriggers: '',
              dealSignals: '',
              risksObjections: '',
              competitiveIntel: '',
              attendees: formatAttendees(parsed.attendees),
              transcript: transcriptText
            };
          }
        }
      }

      // Fallback: return basic sections (all strings)
      return {
        summary: 'Meeting transcript captured. Review for key details.',
        painPoints: '',
        productInterest: '',
        meddiccSignals: '',
        nextSteps: '',
        actionItems: '',
        keyDates: '',
        buyingTriggers: '',
        dealSignals: '',
        risksObjections: '',
        competitiveIntel: '',
        attendees: '',
        transcript: transcriptText
      };

    } catch (error) {
      console.error('processTranscription error:', error);
      return {
        summary: '',
        painPoints: '',
        productInterest: '',
        meddiccSignals: '',
        nextSteps: '',
        actionItems: '',
        keyDates: '',
        buyingTriggers: '',
        dealSignals: '',
        risksObjections: '',
        competitiveIntel: '',
        attendees: '',
        transcript: transcriptText
      };
    }
  }
}

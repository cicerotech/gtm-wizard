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
  diarizedTranscript?: string;
}

export interface ProcessedSections {
  // Core sections
  summary: string;
  attendees: string;
  discussionContext: string;
  keyQuotes: string;
  
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

  // Follow-up
  emailDraft: string;
}

/**
 * Diarization data with speaker attribution and analytics
 */
export interface DiarizationData {
  enabled: boolean;
  segments?: Array<{
    speaker: 'rep' | 'customer' | 'unknown';
    speakerName: string;
    text: string;
    startTime: number;
    endTime: number;
    confidence?: number;
    attributionConfidence?: number;
  }>;
  segmentCount?: number;
  speakerMap?: Record<string, { role: string; name: string; confidence: number }>;
  attributionMethod?: string;
  formattedTranscript?: string;
  talkTime?: {
    repTime: number;
    customerTime: number;
    repRatio: number;
    customerRatio: number;
    isHealthyRatio: boolean;
    repPercent: number;
    customerPercent: number;
  };
  coaching?: {
    totalQuestions: number;
    openQuestions: number;
    closedQuestions: number;
    objections: Array<{ objection: string; handled: boolean }>;
    valueScore: number;
    nextStepClear: boolean;
    keyTopics: string[];
    competitorMentions: string[];
    positiveSignals: string[];
    concerns: string[];
  };
  analysisId?: string;
}

export interface MeetingContext {
  success: boolean;
  meetingType?: 'discovery' | 'pipeline_review' | string;
  pipelineContext?: string; // Salesforce pipeline data for pipeline review meetings
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
function buildDemoPrompt(accountName?: string, context?: MeetingContext): string {
  let contextSection = '';
  if (context?.account) {
    contextSection = `\nACCOUNT CONTEXT:\n- Account: ${context.account.name}\n${context.account.owner ? `- Owner: ${context.account.owner}` : ''}\n`;
  }

  return `You are a sales intelligence analyst for Eudia, an AI-powered legal technology company. You are analyzing a DEMO or PRESENTATION call.

ABOUT EUDIA:
Eudia provides AI solutions for legal teams at enterprise companies — contracting, compliance, and M&A due diligence.

${accountName ? `CURRENT ACCOUNT: ${accountName}` : ''}
${contextSection}

CRITICAL RULES:
1. Only include information explicitly stated in the transcript.
2. Include direct quotes where impactful.
3. Focus on the prospect's REACTIONS to what was shown — not describing what Eudia showed.

OUTPUT FORMAT:

## Summary
3-5 bullet points: What was demonstrated, overall reception, and key takeaways.

## Attendees
- **[Name]** - [Title/Role] ([Company])

## Demo Highlights
What resonated most? What got the strongest positive reaction?
- **[Feature/Capability]**: "[Prospect reaction quote]"

## Questions Asked
Questions the prospect asked during or after the demo:
- **[Question]**: [Answer given or "Follow-up needed"]

## Feature Interest
Which Eudia capabilities generated the most interest:
- [Feature]: [Evidence of interest — quote or reaction]

## Objections & Concerns
Any pushback, hesitations, or concerns raised:
- **[Concern]**: "[Quote]" — [How it was addressed or "Unresolved"]

## Next Steps
- [ ] [Action] - **Owner:** [Name] - **Due:** [Date if mentioned]

## Action Items (Internal)
- [ ] [Follow-up for Eudia team]
`;
}

function buildGeneralPrompt(accountName?: string, context?: MeetingContext): string {
  let contextSection = '';
  if (context?.account) {
    contextSection = `\nACCOUNT CONTEXT:\n- Account: ${context.account.name}\n${context.account.owner ? `- Owner: ${context.account.owner}` : ''}\n`;
  }

  return `You are a business meeting analyst. You are analyzing a GENERAL CHECK-IN or relationship meeting — not a sales discovery or demo.

${accountName ? `ACCOUNT: ${accountName}` : ''}
${contextSection}

CRITICAL RULES:
1. Only include information explicitly stated in the transcript.
2. Keep the tone professional but conversational — this is a relationship meeting, not a formal sales call.
3. Focus on updates, sentiment, and action items.

OUTPUT FORMAT:

## Summary
3-5 bullet points covering: purpose of the meeting, key topics discussed, overall sentiment and relationship health.

## Attendees
- **[Name]** - [Title/Role] ([Company])

## Key Updates
Important information shared by either side:
- **[Topic]**: [What was shared]

## Discussion Points
Main topics covered in the conversation:
- [Topic]: [Key points and any decisions made]

## Sentiment & Relationship
Overall tone of the meeting — are they engaged, distracted, enthusiastic, frustrated?
- [Assessment with evidence]

## Action Items
- [ ] [Action] - **Owner:** [Name] - **Due:** [Date if mentioned]

## Follow-Ups
Items to track or revisit:
- [Item]: [Context and timeline]
`;
}

function buildCSPrompt(accountName?: string, context?: MeetingContext): string {
  let contextSection = '';
  if (context?.account) {
    contextSection = `\nACCOUNT CONTEXT:\n- Account: ${context.account.name}\n${context.account.owner ? `- Owner: ${context.account.owner}` : ''}\n`;
  }

  return `You are a Customer Success analyst for Eudia, an AI-powered legal technology company. You are analyzing a CUSTOMER SUCCESS call — not a sales discovery or demo.

Focus on the customer's experience, adoption, satisfaction, feature needs, and relationship health. This is NOT a sales qualification call.

${accountName ? `ACCOUNT: ${accountName}` : ''}
${contextSection}

CRITICAL RULES:
1. Only include information explicitly stated in the transcript.
2. Focus on the CUSTOMER'S perspective — what they need, what's working, what isn't.
3. Capture exact quotes for feature requests and pain points.
4. Note who spoke more — if the CSM dominated the conversation, flag it.

OUTPUT FORMAT:

## Summary
3-5 bullet points: Account health assessment, key topics, customer sentiment, overall takeaway.

## Attendees
- **[Name]** - [Title/Role] ([Company])

## Customer Health Signals
Rate the overall health of this account based on the conversation:
- **Engagement Level**: [High/Medium/Low] — [Evidence]
- **Satisfaction**: [Positive/Neutral/Concerned] — [Evidence]
- **Adoption**: [Expanding/Stable/Declining] — [Evidence]
- **Renewal Risk**: [Low/Medium/High] — [Evidence]

## Feature Requests & Pain Points
For each feature request or pain point raised by the customer:
- **[Request/Pain]**: "[Direct quote]" — **Priority:** [Critical/High/Medium/Low] — **Product Area:** [Contracting/Compliance/M&A/Sigma/Platform]

If none raised, write: "No feature requests or pain points surfaced."

## Adoption & Usage
What the customer shared about how they're using the product:
- **Current Usage**: [How they're using it, which teams, volume]
- **Wins**: [Successes they mentioned]
- **Gaps**: [Where they expected more or aren't using it]
- **Expansion Opportunities**: [Teams, use cases, or products not yet adopted]

## Talk Time Balance
Estimate who drove the conversation:
- CSM/Eudia: ~[X]%
- Customer: ~[X]%
- **Assessment**: [Was the customer given enough space to share? Or did we dominate?]

## Action Items
- [ ] [Action] - **Owner:** [Name] - **Due:** [Date if mentioned]

## Renewal & Expansion Signals
- **Contract Status**: [Any mention of renewal timeline, terms, or expansion]
- **Budget Signals**: [Any mention of budget, headcount, or procurement]
- **Champion Health**: [Is our internal champion still engaged and empowered?]

## Escalations
Issues requiring immediate attention:
- **[Issue]**: [Severity] — [Who raised it, what's needed]

If none, write: "No escalations identified."

## Follow-Ups
Items to track or revisit:
- [Item]: [Context and timeline]
`;
}

function buildInternalCallPrompt(): string {
  return `You are a business meeting analyst. You are analyzing an INTERNAL team call — not a customer-facing meeting.

This is an internal discussion between team members. Focus on decisions made, action items assigned, strategy discussed, and any blockers or escalations raised.

OUTPUT FORMAT:

## Summary
3-5 bullet points: Key topics discussed, decisions made, and overall takeaways.

## Action Items
| Owner | Action | Due/Timeline |
|-------|--------|-------------|
| [Name] | [What they committed to] | [When] |

## Attendees
- **[Name]** - [Role/Team]

## Key Decisions
Decisions made during this meeting:
- **[Decision]**: [Context and rationale]

## Key Numbers & Metrics
Any specific numbers, targets, revenue figures, pipeline data, or KPIs mentioned:
- **[Metric]**: [Value] — [Context]

If no specific numbers were discussed, write: "No specific metrics discussed."

## Discussion Topics
For each major topic discussed:
### [Topic]
- What was discussed
- Key points raised
- Any concerns or blockers

## Strategic Takeaways
What does this discussion mean for the broader business? Consider:
- GTM motion implications (new market segments, competitive positioning, pricing changes)
- Product or roadmap signals (feature priorities, stability concerns, customer feedback patterns)
- Team or process changes (hiring, enablement, workflow adjustments)

If the meeting was purely tactical with no strategic implications, write: "Tactical meeting — no strategic implications identified."

## Blockers & Escalations
Issues that need attention or were escalated:
- **[Issue]**: [Who raised it, what's needed]

If none were raised, write: "No blockers or escalations identified."

## Parking Lot
Topics that were raised but deferred or need further discussion:
- **[Topic]**: [Why it was deferred, who should follow up]

If everything was resolved, write: "All topics addressed."

## Follow-ups
Items to revisit or track:
- [Item] — [Owner if mentioned]

ANALYSIS RULES:
1. Distinguish between decisions (firm) and discussions (exploratory).
2. Capture action items with clear ownership and timelines.
3. Note any disagreements or unresolved points.
4. Keep the tone neutral and factual.
5. If specific accounts, deals, or numbers are mentioned, capture them accurately.
6. For strategic takeaways, only include implications that were actually discussed or clearly implied — do not speculate.`;
}

export function buildPipelineReviewPrompt(pipelineContext?: string): string {
  const contextBlock = pipelineContext
    ? `\n\nSALESFORCE PIPELINE DATA (current as of today):\n${pipelineContext}\n\nUse this data to cross-reference and validate what was discussed. Include ACV and stage info from Salesforce where relevant.\n`
    : '';

  return `You are a sales operations analyst producing the weekly pipeline review summary for Eudia, an AI-powered legal technology company. You are processing the transcript of an internal team pipeline review meeting.
${contextBlock}
═══════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT — Produce the following sections in EXACTLY this order:
═══════════════════════════════════════════════════════════════════════════

## Priority Actions

List the most urgent, time-sensitive actions discussed. Group by the target month/date (e.g., "February Revenue"). Each line should follow this format:

**[Account Name]:** [One-line action description] [@Owner Name]

Only include actions where urgency was explicitly discussed. Order by most urgent first.

## Growth & Cross-Team Updates

Capture any non-deal-specific updates discussed — outbound motions, mid-market initiatives, product stability issues, demo environment, hiring, enablement, or other cross-functional topics. Use bullet points with brief summaries and owner attribution where mentioned.

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

- **[Account]**: [What changed — e.g., "Pushed from Feb to Mar due to MSA redline delays"]

If no forecast changes were discussed, omit this section.

## Team Action Items

Cross-functional or team-wide action items not tied to a specific account:

- [ ] [Action] — **Owner:** [Name] — **Due:** [Date if mentioned]

═══════════════════════════════════════════════════════════════════════════
CRITICAL RULES:
═══════════════════════════════════════════════════════════════════════════

1. Extract EVERY account mentioned, even briefly. Do not skip any.
2. Use exact names as spoken for both accounts and people.
3. Attribute each account to the BL who owns it / presented on it.
4. For the Priority Actions section, only include deals where time urgency was explicitly discussed (this month, this quarter, need to accelerate, etc.).
5. Capture action items with CLEAR ownership — who specifically is responsible.
6. Include direct quotes for significant commitments (e.g., "verbal commit in hand", "expects end of February").
7. If a BL stated their commit or gut amount, capture it exactly.
8. Keep table cells concise — status should be 1-2 sentences max, next action should be a single clear step.
9. Distinguish between different product lines or deal types when mentioned (e.g., "Marketing Compliance pilot", "M&A expansion", "FTE engagement").
10. If the meeting discussed general topics like demo stability, growth motion, enablement, or hiring — capture these in the Growth & Cross-Team section, not mixed into account tables.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSCRIPTION SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class TranscriptionService {
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  /**
   * Update server URL
   */
  setServerUrl(url: string): void {
    this.serverUrl = url;
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
    context?: MeetingContext,
    audioMeta?: { captureMode?: string; hasVirtualDevice?: boolean },
    meetingTemplate?: string
  ): Promise<TranscriptionResult> {
    // Try server first
    try {
      // Select prompt based on meeting type and template
      const isPipelineReview = context?.meetingType === 'pipeline_review';
      let systemPrompt: string;
      if (isPipelineReview) {
        systemPrompt = buildPipelineReviewPrompt(context?.pipelineContext);
      } else if (meetingTemplate === 'demo') {
        systemPrompt = buildDemoPrompt(accountName, context);
      } else if (meetingTemplate === 'general') {
        systemPrompt = buildGeneralPrompt(accountName, context);
      } else if (meetingTemplate === 'internal') {
        systemPrompt = buildInternalCallPrompt();
      } else if (meetingTemplate === 'cs') {
        systemPrompt = buildCSPrompt(accountName, context);
      } else {
        systemPrompt = buildAnalysisPrompt(accountName, context);
      }
      
      const response = await requestUrl({
        url: `${this.serverUrl}/api/transcribe-and-summarize`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audio: audioBase64,
          mimeType,
          accountName: isPipelineReview ? 'Pipeline Review' : accountName,
          accountId,
          meetingType: context?.meetingType || 'discovery',
          userEmail: context?.userEmail || '',
          captureMode: audioMeta?.captureMode || 'mic_only',
          hasVirtualDevice: audioMeta?.hasVirtualDevice || false,
          context: context ? {
            customerBrain: context.account?.customerBrain,
            opportunities: context.opportunities,
            contacts: context.contacts,
            userEmail: context.userEmail
          } : undefined,
          systemPrompt
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
        duration: response.json.duration || 0,
        diarizedTranscript: response.json.diarization?.formattedTranscript || undefined
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
   * Parse GPT response into sections object
   * Enhanced to handle new section types
   */
  parseSections(content: string): ProcessedSections {
    const sections: ProcessedSections = this.getEmptySections();

    const headerMap: Record<string, keyof ProcessedSections> = {
      'summary': 'summary',
      'attendees': 'attendees',
      'key stakeholders': 'attendees',
      'discussion context': 'discussionContext',
      'key quotes': 'keyQuotes',
      'quotable moments': 'keyQuotes',
      'meddicc signals': 'meddiccSignals',
      'product interest': 'productInterest',
      'pain points': 'painPoints',
      'customer feedback': 'painPoints',
      'buying triggers': 'buyingTriggers',
      'key dates': 'keyDates',
      'next steps': 'nextSteps',
      'action items': 'actionItems',
      'action items (internal)': 'actionItems',
      'deal signals': 'dealSignals',
      'risks & objections': 'risksObjections',
      'risks and objections': 'risksObjections',
      'competitive intelligence': 'competitiveIntel',
      'draft follow-up email': 'emailDraft',
      'follow-up email': 'emailDraft'
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
      discussionContext: '',
      keyQuotes: '',
      meddiccSignals: '',
      productInterest: '',
      painPoints: '',
      buyingTriggers: '',
      keyDates: '',
      nextSteps: '',
      actionItems: '',
      dealSignals: '',
      risksObjections: '',
      competitiveIntel: '',
      emailDraft: ''
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
  async liveQueryTranscript(
    question: string,
    transcript: string,
    accountName?: string
  ): Promise<{ success: boolean; answer: string; error?: string }> {
    if (!transcript || transcript.trim().length < 50) {
      return {
        success: false,
        answer: '',
        error: 'Not enough transcript captured yet. Keep recording for a few more minutes.'
      };
    }

    try {
      const response = await requestUrl({
        url: `${this.serverUrl}/api/live-query`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
          answer: '',
          error: response.json.error || 'Query failed'
        };
      }

      return {
        success: true,
        answer: response.json.answer || 'No relevant information found in the transcript.'
      };

    } catch (error: any) {
      console.error('Live query error:', error);
      return {
        success: false,
        answer: '',
        error: error.message || 'Failed to query transcript'
      };
    }
  }

  /**
   * Transcribe a chunk of audio without summarization (for incremental transcription).
   * Returns just the raw transcript text.
   */
  async transcribeChunk(
    audioBase64: string,
    mimeType: string
  ): Promise<{ success: boolean; text: string; error?: string }> {
    try {
      const response = await requestUrl({
        url: `${this.serverUrl}/api/transcribe-chunk`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audio: audioBase64,
          mimeType
        })
      });

      if (!response.json.success) {
        return {
          success: false,
          text: '',
          error: response.json.error || 'Chunk transcription failed'
        };
      }

      return {
        success: true,
        text: response.json.text || ''
      };

    } catch (error: any) {
      console.error('Chunk transcription error:', error);
      return {
        success: false,
        text: '',
        error: error.message || 'Failed to transcribe chunk'
      };
    }
  }

  /**
   * Build prompt for live query against transcript
   */
  private buildLiveQueryPrompt(): string {
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
  static formatSectionsForNote(
    sections: ProcessedSections, 
    transcript?: string,
    diarization?: DiarizationData
  ): string {
    let content = '';

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIORITY 1: TL;DR - The headline for busy salespeople
    // ═══════════════════════════════════════════════════════════════════════════
    if (sections.summary) {
      content += `## TL;DR\n\n${sections.summary}\n\n`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONVERSATIONAL ANALYTICS (when diarization is enabled)
    // ═══════════════════════════════════════════════════════════════════════════
    if (diarization?.enabled && diarization?.talkTime) {
      content += `## Call Analytics\n\n`;
      
      // Talk time ratio with visual indicator
      const repPct = diarization.talkTime.repPercent;
      const custPct = diarization.talkTime.customerPercent;
      const healthIcon = diarization.talkTime.isHealthyRatio ? '✅' : '⚠️';
      
      content += `**Talk Time:** Rep ${repPct}% / Customer ${custPct}% ${healthIcon}\n`;
      
      // Visual bar representation
      const repBars = Math.round(repPct / 5);
      const custBars = Math.round(custPct / 5);
      content += `\`${'█'.repeat(repBars)}${'░'.repeat(20 - repBars)}\` Rep\n`;
      content += `\`${'█'.repeat(custBars)}${'░'.repeat(20 - custBars)}\` Customer\n\n`;
      
      // Coaching insights if available
      if (diarization.coaching) {
        const coaching = diarization.coaching;
        
        if (coaching.totalQuestions > 0) {
          const openPct = Math.round((coaching.openQuestions / coaching.totalQuestions) * 100);
          content += `**Questions:** ${coaching.totalQuestions} total (${coaching.openQuestions} open, ${coaching.closedQuestions} closed - ${openPct}% open)\n`;
        }
        
        if (coaching.objections && coaching.objections.length > 0) {
          const handled = coaching.objections.filter(o => o.handled).length;
          content += `**Objections:** ${coaching.objections.length} raised, ${handled} handled\n`;
        }
        
        if (coaching.valueScore !== undefined) {
          content += `**Value Articulation:** ${coaching.valueScore}/10\n`;
        }
        
        if (coaching.nextStepClear !== undefined) {
          content += `**Next Step Clarity:** ${coaching.nextStepClear ? '✅ Clear' : '⚠️ Unclear'}\n`;
        }
        
        content += '\n';
      }
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
    // TRANSCRIPT: Use formatted diarized version if available
    // ═══════════════════════════════════════════════════════════════════════════
    const transcriptToUse = diarization?.enabled && diarization?.formattedTranscript 
      ? diarization.formattedTranscript 
      : transcript;
      
    if (transcriptToUse) {
      const transcriptTitle = diarization?.enabled ? 'Full Transcript (Speaker-Attributed)' : 'Full Transcript';
      content += `---\n\n<details>\n<summary><strong>${transcriptTitle}</strong></summary>\n\n${transcriptToUse}\n\n</details>\n`;
    }

    return content;
  }

  /**
   * Format sections for note with audio file reference
   */
  static formatSectionsWithAudio(
    sections: ProcessedSections, 
    transcript: string | undefined, 
    audioFilePath: string | undefined,
    diarization?: DiarizationData
  ): string {
    let content = this.formatSectionsForNote(sections, transcript, diarization);
    
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
    context?: { accountName?: string; accountId?: string; speakerHints?: string[]; meetingType?: string; pipelineContext?: string; captureMode?: string; hasVirtualDevice?: boolean; meetingTemplate?: string }
  ): Promise<{ text: string; confidence: number; duration?: number; sections?: ProcessedSections; error?: string }> {
    const blobSizeMB = audioBlob.size / 1024 / 1024;
    const mimeType = audioBlob.type || 'audio/webm';

    // Large recordings (>8MB, roughly >10 min) use chunked transcription
    // to avoid Render request timeouts and base64 payload inflation
    if (blobSizeMB > 8) {
      console.log(`[Eudia] Large recording (${blobSizeMB.toFixed(1)}MB) — using chunked transcription`);
      return this.transcribeAudioChunked(audioBlob, mimeType, context);
    }

    try {
      const base64 = await this.blobToBase64(audioBlob);
      
      const meetingContext: MeetingContext | undefined = context?.meetingType === 'pipeline_review'
        ? { success: true, meetingType: 'pipeline_review', pipelineContext: context.pipelineContext }
        : undefined;
      
      const result = await this.transcribeAndSummarize(
        base64, 
        mimeType, 
        context?.accountName, 
        context?.accountId,
        meetingContext,
        { captureMode: context?.captureMode, hasVirtualDevice: context?.hasVirtualDevice },
        context?.meetingTemplate
      );
      
      return {
        text: result.transcript,
        confidence: result.success ? 0.95 : 0,
        duration: result.duration,
        sections: result.sections,
        diarizedTranscript: result.diarizedTranscript,
        error: result.error
      };
    } catch (error: any) {
      console.error('transcribeAudio error:', error);
      return {
        text: '',
        confidence: 0,
        duration: 0,
        sections: this.getEmptySections(),
        error: error.message || 'Transcription request failed'
      };
    }
  }

  private static readonly CHUNK_MAX_RETRIES = 3;
  private static readonly CHUNK_RETRY_DELAYS = [10000, 30000, 60000]; // 10s, 30s, 60s

  /**
   * Attempt a single chunk transcription with retry logic.
   * Returns the transcript text on success, or null after all retries exhausted.
   */
  private async transcribeChunkWithRetry(
    chunkBase64: string,
    mimeType: string,
    chunkIndex: number,
    chunkCount: number
  ): Promise<{ text: string; duration: number } | null> {
    for (let attempt = 0; attempt <= TranscriptionService.CHUNK_MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = TranscriptionService.CHUNK_RETRY_DELAYS[attempt - 1] || 30000;
        console.log(`[Eudia] Chunk ${chunkIndex + 1}/${chunkCount} retry ${attempt}/${TranscriptionService.CHUNK_MAX_RETRIES} in ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
      }

      try {
        const CHUNK_TIMEOUT_MS = 90000;
        const fetchPromise = requestUrl({
          url: `${this.serverUrl}/api/transcribe-chunk`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: chunkBase64, mimeType })
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Chunk request timed out after ${CHUNK_TIMEOUT_MS / 1000}s`)), CHUNK_TIMEOUT_MS)
        );
        const response = await Promise.race([fetchPromise, timeoutPromise]);

        const chunkText = response.json?.text || response.json?.transcript || '';
        if (response.json?.success && chunkText) {
          if (attempt > 0) {
            console.log(`[Eudia] Chunk ${chunkIndex + 1}/${chunkCount} succeeded on retry ${attempt}`);
          }
          return { text: chunkText, duration: response.json.duration || 0 };
        }

        console.warn(`[Eudia] Chunk ${chunkIndex + 1}/${chunkCount} attempt ${attempt + 1} returned no text: ${response.json?.error || 'unknown'}`);
      } catch (err: any) {
        console.warn(`[Eudia] Chunk ${chunkIndex + 1}/${chunkCount} attempt ${attempt + 1} failed: ${err.message}`);
      }
    }
    return null;
  }

  /**
   * Chunked transcription for large recordings (>8MB).
   * Splits audio into ~4MB chunks (~4 min at 128kbps), transcribes each via
   * /api/transcribe-chunk with per-chunk retry and 90s timeout per request.
   */
  private async transcribeAudioChunked(
    audioBlob: Blob,
    mimeType: string,
    context?: { accountName?: string; accountId?: string; speakerHints?: string[]; meetingType?: string; pipelineContext?: string; captureMode?: string; hasVirtualDevice?: boolean; meetingTemplate?: string }
  ): Promise<{ text: string; confidence: number; duration?: number; sections?: ProcessedSections; error?: string }> {
    const CHUNK_SIZE = 4 * 1024 * 1024;
    const arrayBuffer = await audioBlob.arrayBuffer();
    const totalBytes = arrayBuffer.byteLength;
    const chunkCount = Math.ceil(totalBytes / CHUNK_SIZE);

    console.log(`[Eudia] Chunked transcription: ${(totalBytes / 1024 / 1024).toFixed(1)}MB → ${chunkCount} chunks`);

    // Estimate duration per chunk for gap markers (128kbps = 16KB/s)
    const estBytesPerSecond = 16 * 1024;
    const estTotalDurationSec = totalBytes / estBytesPerSecond;

    // Ordered results: text for success, gap marker for failure
    const orderedSegments: string[] = [];
    let totalDuration = 0;
    let failedChunks = 0;

    for (let i = 0; i < chunkCount; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalBytes);
      const chunkBuffer = arrayBuffer.slice(start, end);
      const chunkBlob = new Blob([chunkBuffer], { type: mimeType });

      console.log(`[Eudia] Transcribing chunk ${i + 1}/${chunkCount} (${((end - start) / 1024 / 1024).toFixed(1)}MB)`);

      const chunkBase64 = await this.blobToBase64(chunkBlob);
      const result = await this.transcribeChunkWithRetry(chunkBase64, mimeType, i, chunkCount);

      if (result) {
        orderedSegments.push(result.text);
        totalDuration += result.duration;
        console.log(`[Eudia] Chunk ${i + 1}/${chunkCount} OK: ${result.text.length} chars`);
      } else {
        failedChunks++;
        const gapStartSec = Math.round((start / totalBytes) * estTotalDurationSec);
        const gapEndSec = Math.round((end / totalBytes) * estTotalDurationSec);
        const fmtStart = `${Math.floor(gapStartSec / 60)}:${(gapStartSec % 60).toString().padStart(2, '0')}`;
        const fmtEnd = `${Math.floor(gapEndSec / 60)}:${(gapEndSec % 60).toString().padStart(2, '0')}`;
        const gapMarker = `\n\n[~${fmtStart} – ${fmtEnd} — audio not transcribed (chunk ${i + 1}/${chunkCount} failed after ${TranscriptionService.CHUNK_MAX_RETRIES + 1} attempts)]\n\n`;
        orderedSegments.push(gapMarker);
        console.error(`[Eudia] Chunk ${i + 1}/${chunkCount} permanently failed — gap marker inserted`);
      }
    }

    const successfulSegments = orderedSegments.filter(s => !s.includes('— audio not transcribed'));
    if (successfulSegments.length === 0) {
      return {
        text: '',
        confidence: 0,
        duration: 0,
        sections: this.getEmptySections(),
        error: `All ${chunkCount} chunks failed to transcribe after retries. Server may be unavailable.`
      };
    }

    if (failedChunks > 0) {
      console.warn(`[Eudia] ${failedChunks}/${chunkCount} chunks failed after retries — partial transcript with gap markers`);
    }

    const combinedTranscript = orderedSegments.join('\n\n');
    console.log(`[Eudia] Combined transcript: ${combinedTranscript.length} chars from ${chunkCount} chunks (${failedChunks} gaps)`);

    try {
      const sections = await this.processTranscription(combinedTranscript, {
        accountName: context?.accountName,
        accountId: context?.accountId
      });

      return {
        text: combinedTranscript,
        confidence: failedChunks === 0 ? 0.90 : Math.max(0.30, 0.90 - (failedChunks / chunkCount) * 0.60),
        duration: totalDuration,
        sections,
        ...(failedChunks > 0 ? { error: `${failedChunks} of ${chunkCount} audio chunks could not be transcribed. Look for [audio not transcribed] markers in the transcript.` } : {})
      };
    } catch (sumError: any) {
      console.error('[Eudia] Summarization failed after chunked transcription:', sumError.message);
      return {
        text: combinedTranscript,
        confidence: 0.50,
        duration: totalDuration,
        sections: this.getEmptySections(),
        error: `Transcription succeeded but summarization failed: ${sumError.message}`
      };
    }
  }

  /**
   * Wrapper method for main.ts - processes transcription into sections
   * Routes through server to avoid requiring user API key
   */
  async processTranscription(
    transcriptText: string,
    context?: { accountName?: string; accountId?: string }
  ): Promise<ProcessedSections> {
    if (!transcriptText || transcriptText.trim().length === 0) {
      return this.getEmptySections();
    }

    try {
      // Call server endpoint for section extraction (uses server's OpenAI key)
      const response = await requestUrl({
        url: `${this.serverUrl}/api/process-sections`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transcript: transcriptText,
          accountName: context?.accountName,
          context: context
        })
      });

      if (response.json?.success && response.json?.sections) {
        const sections = response.json.sections;
        return {
          summary: sections.summary || '',
          painPoints: sections.painPoints || sections.keyPoints || '',
          productInterest: sections.productInterest || '',
          meddiccSignals: sections.meddiccSignals || '',
          nextSteps: sections.nextSteps || '',
          actionItems: sections.actionItems || '',
          keyDates: sections.keyDates || '',
          buyingTriggers: sections.buyingTriggers || '',
          dealSignals: sections.dealSignals || '',
          risksObjections: sections.risksObjections || sections.concerns || '',
          competitiveIntel: sections.competitiveIntel || '',
          attendees: sections.attendees || '',
          transcript: transcriptText
        };
      }

      // Server call failed - return basic sections
      console.warn('Server process-sections returned no sections, using fallback');
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
      console.error('processTranscription server error:', error);
      // Return basic sections on error
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
    }
  }
}

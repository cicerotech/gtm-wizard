/**
 * TranscriptionService - Handles communication with GTM-Brain backend
 * for audio transcription and AI summarization
 */

import { requestUrl } from 'obsidian';

export interface TranscriptionResult {
  success: boolean;
  transcript: string;
  sections: ProcessedSections;
  duration: number;
  error?: string;
}

export interface ProcessedSections {
  summary: string;
  keyStakeholders: string;
  meddiccSignals: string;
  productInterest: string;
  keyDates: string;
  nextSteps: string;
  actionItems: string;
  dealSignals?: string;
  risksObjections?: string;
  competitiveIntel?: string;
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
   */
  async transcribeAndSummarize(
    audioBase64: string,
    mimeType: string,
    accountName?: string,
    accountId?: string,
    context?: MeetingContext
  ): Promise<TranscriptionResult> {
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
          context: context ? {
            customerBrain: context.account?.customerBrain,
            opportunities: context.opportunities,
            contacts: context.contacts
          } : undefined
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
        sections: response.json.sections || this.getEmptySections(),
        duration: response.json.duration || 0
      };

    } catch (error) {
      console.error('Transcription error:', error);
      return {
        success: false,
        transcript: '',
        sections: this.getEmptySections(),
        duration: 0,
        error: error.message || 'Network error'
      };
    }
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
   * Get empty sections structure
   */
  private getEmptySections(): ProcessedSections {
    return {
      summary: '',
      keyStakeholders: '',
      meddiccSignals: '',
      productInterest: '',
      keyDates: '',
      nextSteps: '',
      actionItems: ''
    };
  }

  /**
   * Format sections for note insertion
   */
  static formatSectionsForNote(sections: ProcessedSections, transcript?: string): string {
    let content = '';

    if (sections.summary) {
      content += `## Summary\n\n${sections.summary}\n\n`;
    }

    if (sections.keyStakeholders) {
      content += `## Key Stakeholders\n\n${sections.keyStakeholders}\n\n`;
    }

    if (sections.meddiccSignals) {
      content += `## MEDDICC Signals\n\n${sections.meddiccSignals}\n\n`;
    }

    if (sections.productInterest) {
      content += `## Product Interest\n\n${sections.productInterest}\n\n`;
    }

    if (sections.keyDates) {
      content += `## Key Dates\n\n${sections.keyDates}\n\n`;
    }

    if (sections.nextSteps) {
      content += `## Next Steps\n\n${sections.nextSteps}\n\n`;
    }

    if (sections.actionItems) {
      content += `## Action Items\n\n${sections.actionItems}\n\n`;
    }

    // Optional enhanced sections
    if (sections.dealSignals) {
      content += `## Deal Signals\n\n${sections.dealSignals}\n\n`;
    }

    if (sections.risksObjections) {
      content += `## Risks & Objections\n\n${sections.risksObjections}\n\n`;
    }

    if (sections.competitiveIntel) {
      content += `## Competitive Intelligence\n\n${sections.competitiveIntel}\n\n`;
    }

    // Add transcript at the END (after all structured sections)
    if (transcript) {
      content += `---\n\n## Full Transcript\n\n${transcript}\n`;
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
      // Show recent notes summary (first 500 chars)
      const recentNotes = context.account.customerBrain.substring(0, 500);
      if (recentNotes) {
        content += '### Recent Notes\n\n';
        content += `${recentNotes}${context.account.customerBrain.length > 500 ? '...' : ''}\n\n`;
      }
    }

    content += '---\n\n';
    
    return content;
  }
}


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
          openaiApiKey: this.openaiApiKey, // Pass key to server as fallback
          context: context ? {
            customerBrain: context.account?.customerBrain,
            opportunities: context.opportunities,
            contacts: context.contacts
          } : undefined
        })
      });

      if (!response.json.success) {
        // If server says OpenAI not initialized, try local fallback
        if (response.json.error?.includes('OpenAI not initialized') && this.openaiApiKey) {
          console.log('Server OpenAI unavailable, trying local fallback...');
          return this.transcribeLocal(audioBase64, mimeType, accountName);
        }
        
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
      console.error('Server transcription error:', error);
      
      // If server unreachable and we have local key, try local fallback
      if (this.openaiApiKey) {
        console.log('Server unreachable, trying local OpenAI fallback...');
        return this.transcribeLocal(audioBase64, mimeType, accountName);
      }
      
      return {
        success: false,
        transcript: '',
        sections: this.getEmptySections(),
        duration: 0,
        error: `Server unavailable: ${error.message}. Add OpenAI API key in settings for offline mode.`
      };
    }
  }

  /**
   * Local fallback transcription using user's OpenAI key
   * Uses Obsidian's requestUrl to call OpenAI directly
   */
  async transcribeLocal(
    audioBase64: string,
    mimeType: string,
    accountName?: string
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

      // Now summarize with GPT-4o
      const sections = await this.summarizeLocal(transcript, accountName);

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
   * Summarize transcript locally using GPT-4o
   */
  async summarizeLocal(transcript: string, accountName?: string): Promise<ProcessedSections> {
    if (!this.openaiApiKey) {
      return this.getEmptySections();
    }

    try {
      const systemPrompt = `You are a sales intelligence analyst. Extract structured insights from this meeting transcript.

${accountName ? `Account: ${accountName}` : ''}

Provide output with these sections (use ## headers):
## Summary - 3-5 bullet points of key takeaways
## Key Stakeholders - People mentioned with roles
## MEDDICC Signals - Economic Buyer, Decision Process, Champion, Pain, Competition
## Product Interest - Products discussed
## Key Dates - Deadlines and timelines
## Next Steps - Agreed actions as checkboxes
## Action Items - Internal follow-ups as checkboxes
## Deal Signals - Stage progression/regression indicators
## Risks & Objections - Concerns raised

Be specific, quote when helpful. If a section has no content, say so.`;

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
            { role: 'user', content: `Analyze this transcript:\n\n${transcript.substring(0, 100000)}` }
          ],
          temperature: 0.3,
          max_tokens: 4000
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
   */
  parseSections(content: string): ProcessedSections {
    const sections: ProcessedSections = {
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

    const headerMap: Record<string, keyof ProcessedSections> = {
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


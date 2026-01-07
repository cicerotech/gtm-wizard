/**
 * Contact Formatter for Slack
 * Formats contact lookup results using Slack Block Kit
 * Clean format without emojis
 */

const logger = require('../utils/logger');

class ContactFormatter {
  constructor() {
    // Text labels instead of emojis
    this.labels = {
      phone: 'Phone:',
      email: 'Email:',
      company: '',
      linkedin: 'LinkedIn:',
      location: 'Location:',
      sf: '(SF)',
      web: '(Web)',
      inferred: '(Inferred)'
    };
  }

  /**
   * Format single contact result
   * @param {Object} result - Contact lookup result
   * @returns {Object} - Slack blocks
   */
  formatContactResult(result) {
    if (!result.success) {
      return this.formatError(result);
    }

    if (result.multipleMatches) {
      return this.formatMultipleMatches(result);
    }

    return this.formatSingleContact(result);
  }

  /**
   * Format single contact with source labels
   */
  formatSingleContact(result) {
    const { contact, lookupId, enriched } = result;
    const blocks = [];

    // Header with name and title
    const headerText = contact.title 
      ? `*${contact.name}* - ${contact.title}`
      : `*${contact.name}*`;

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: headerText
      }
    });

    // Company
    if (contact.company) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: contact.company
        }
      });
    }

    // Contact details section
    const fields = [];

    // Phone with source
    if (contact.phone) {
      const sourceLabel = this.formatSourceLabel(contact.phoneSource);
      fields.push({
        type: 'mrkdwn',
        text: `${this.labels.phone} ${contact.phone} ${sourceLabel}`
      });
    } else {
      fields.push({
        type: 'mrkdwn',
        text: `${this.labels.phone} _Not available_`
      });
    }

    // Email with source
    if (contact.email) {
      const sourceLabel = this.formatSourceLabel(contact.emailSource);
      fields.push({
        type: 'mrkdwn',
        text: `${this.labels.email} ${contact.email} ${sourceLabel}`
      });
    } else {
      fields.push({
        type: 'mrkdwn',
        text: `${this.labels.email} _Not available_`
      });
    }

    // LinkedIn if available
    if (contact.linkedin) {
      const sourceLabel = this.formatSourceLabel(contact.linkedinSource);
      fields.push({
        type: 'mrkdwn',
        text: `${this.labels.linkedin} <${contact.linkedin}|Profile> ${sourceLabel}`
      });
    }

    // Location if available
    if (contact.city || contact.state) {
      const location = [contact.city, contact.state].filter(Boolean).join(', ');
      fields.push({
        type: 'mrkdwn',
        text: `${this.labels.location} ${location}`
      });
    }

    if (fields.length > 0) {
      blocks.push({
        type: 'section',
        fields: fields.slice(0, 10) // Slack limit
      });
    }

    // Enrichment info and writeback prompt
    if (enriched && contact.sfId) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_Enriched data available. Reply "save" to update Salesforce._`
          }
        ]
      });

      // Store lookup ID in the message for reaction handling
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_lookup:${lookupId}_`
          }
        ]
      });
    } else if (enriched && !contact.sfId) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_Contact found via web search (not in Salesforce)_`
          }
        ]
      });
    }

    // Record type indicator
    if (contact.recordType) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${contact.recordType}${contact.ownerName ? ` | Owner: ${contact.ownerName}` : ''}`
          }
        ]
      });
    }

    return { blocks };
  }

  /**
   * Format multiple matches for clarification
   */
  formatMultipleMatches(result) {
    const { contacts, parsed } = result;
    const blocks = [];

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Found ${contacts.length} matches for *${parsed?.originalInput || 'your search'}*. Please clarify:`
      }
    });

    blocks.push({ type: 'divider' });

    // List top 3 matches
    contacts.slice(0, 3).forEach((contact, index) => {
      const number = `${index + 1}.`;
      const company = contact.accountName || contact.company || 'Unknown Company';
      const title = contact.title ? ` - ${contact.title}` : '';
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${number} *${contact.name}*${title}\n${company}`
        }
      });
    });

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '_Try adding more details like company name or title to narrow results_'
        }
      ]
    });

    return { blocks };
  }

  /**
   * Format error response
   */
  formatError(result) {
    const blocks = [];

    let errorMessage = result.error || 'No contact found';
    let suggestion = result.suggestion || 'Try: last name only, different spelling, company domain';

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: errorMessage
      }
    });

    if (suggestion) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Tip: ${suggestion}`
          }
        ]
      });
    }

    // Show parsed input if available
    if (result.parsed) {
      const { firstName, lastName, company, title } = result.parsed;
      const parsedParts = [];
      if (firstName) parsedParts.push(`First: ${firstName}`);
      if (lastName) parsedParts.push(`Last: ${lastName}`);
      if (company) parsedParts.push(`Company: ${company}`);
      if (title) parsedParts.push(`Title: ${title}`);

      if (parsedParts.length > 0) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Parsed: ${parsedParts.join(' | ')}`
            }
          ]
        });
      }
    }

    return { blocks };
  }

  /**
   * Format source label
   */
  formatSourceLabel(source) {
    if (!source) return '';
    
    if (source === 'Salesforce') {
      return this.labels.sf;
    } else if (source === 'Web Search' || source === 'Web') {
      return this.labels.web;
    } else if (source === 'Inferred' || source === 'Pattern') {
      return this.labels.inferred;
    }
    return `(${source})`;
  }

  /**
   * Format writeback confirmation
   */
  formatWritebackConfirmation(result) {
    if (result.success) {
      return {
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Updated Salesforce ${result.objectType} record with: ${result.updatedFields.join(', ')}`
            }
          }
        ]
      };
    } else {
      return {
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Could not update Salesforce: ${result.error}`
            }
          }
        ]
      };
    }
  }

  /**
   * Format simple text response (fallback)
   */
  formatSimpleText(result) {
    if (!result.success) {
      return result.error || 'No contact found';
    }

    if (result.multipleMatches) {
      const matches = result.contacts.slice(0, 3)
        .map((c, i) => `${i + 1}. ${c.name} at ${c.company || c.accountName || 'Unknown'}`)
        .join('\n');
      return `Multiple matches:\n${matches}\n\n_Add more details to narrow results_`;
    }

    const contact = result.contact;
    const lines = [];
    
    lines.push(`*${contact.name}*${contact.title ? ` - ${contact.title}` : ''}`);
    if (contact.company) lines.push(contact.company);
    if (contact.phone) lines.push(`${this.labels.phone} ${contact.phone} ${this.formatSourceLabel(contact.phoneSource)}`);
    if (contact.email) lines.push(`${this.labels.email} ${contact.email} ${this.formatSourceLabel(contact.emailSource)}`);
    if (contact.linkedin) lines.push(`${this.labels.linkedin} ${contact.linkedin}`);

    if (result.enriched && contact.sfId) {
      lines.push(`\n_Reply "save" to update Salesforce_`);
    }

    return lines.join('\n');
  }

  /**
   * Format help text for /contact command
   */
  getHelpText() {
    return `*Contact Lookup Help*

*Usage:* \`@gtm-brain [name], [company]\` or \`@gtm-brain [name] at [company]\`

*Examples:*
- \`@gtm-brain Bob Smith, Microsoft\` - Search by name and company
- \`@gtm-brain Sarah Johnson at Acme\` - Alternative format
- \`@gtm-brain Smith, Google\` - Last name only

*How It Works:*
1. Searches Salesforce Contacts and Leads first
2. If not found, infers email from company patterns
3. Validates email deliverability

*Sources:*
- (SF) = Salesforce record
- (Inferred) = Email pattern + verification
- (Web) = Found via web lookup

*Tips:*
- Include company name for better matches
- Nicknames work (Bob = Robert, Mike = Michael)`;
  }
}

module.exports = new ContactFormatter();

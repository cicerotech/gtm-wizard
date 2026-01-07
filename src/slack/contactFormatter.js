/**
 * Contact Formatter for Slack
 * Formats contact lookup results using Slack Block Kit
 * Includes source labels and writeback prompts
 */

const logger = require('../utils/logger');

class ContactFormatter {
  constructor() {
    this.emojis = {
      person: '👤',
      phone: '📱',
      email: '✉️',
      company: '🏢',
      linkedin: '🔗',
      title: '💼',
      location: '📍',
      update: '💾',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      search: '🔍',
      salesforce: '☁️',
      web: '🌐'
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
        text: `${this.emojis.person} ${headerText}`
      }
    });

    // Company
    if (contact.company) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${this.emojis.company} ${contact.company}`
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
        text: `${this.emojis.phone} ${contact.phone} ${sourceLabel}`
      });
    } else {
      fields.push({
        type: 'mrkdwn',
        text: `${this.emojis.phone} _No phone_`
      });
    }

    // Email with source
    if (contact.email) {
      const sourceLabel = this.formatSourceLabel(contact.emailSource);
      fields.push({
        type: 'mrkdwn',
        text: `${this.emojis.email} ${contact.email} ${sourceLabel}`
      });
    } else {
      fields.push({
        type: 'mrkdwn',
        text: `${this.emojis.email} _No email_`
      });
    }

    // LinkedIn if available
    if (contact.linkedin) {
      const sourceLabel = this.formatSourceLabel(contact.linkedinSource);
      fields.push({
        type: 'mrkdwn',
        text: `${this.emojis.linkedin} <${contact.linkedin}|LinkedIn Profile> ${sourceLabel}`
      });
    }

    // Location if available
    if (contact.city || contact.state) {
      const location = [contact.city, contact.state].filter(Boolean).join(', ');
      fields.push({
        type: 'mrkdwn',
        text: `${this.emojis.location} ${location}`
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
            text: `${this.emojis.update} _Enriched from web search. React with ✅ to update Salesforce._`
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
            text: `${this.emojis.web} _Contact found via web search (not in Salesforce)_`
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
            text: `${this.emojis.salesforce} ${contact.recordType}${contact.ownerName ? ` • Owner: ${contact.ownerName}` : ''}`
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
        text: `${this.emojis.search} Found ${contacts.length} matches for *${parsed?.originalInput || 'your search'}*. Please clarify:`
      }
    });

    blocks.push({ type: 'divider' });

    // List top 3 matches
    contacts.slice(0, 3).forEach((contact, index) => {
      const number = ['1️⃣', '2️⃣', '3️⃣'][index];
      const company = contact.accountName || contact.company || 'Unknown Company';
      const title = contact.title ? ` - ${contact.title}` : '';
      
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${number} *${contact.name}*${title}\n${this.emojis.company} ${company}`
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
        text: `${this.emojis.warning} ${errorMessage}`
      }
    });

    if (suggestion) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `💡 ${suggestion}`
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
              text: `Parsed: ${parsedParts.join(' • ')}`
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
      return `_(${this.emojis.salesforce} SF)_`;
    } else if (source === 'Web Search') {
      return `_(${this.emojis.web} Web)_`;
    }
    return `_(${source})_`;
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
              text: `${this.emojis.success} Updated Salesforce ${result.objectType} record with: ${result.updatedFields.join(', ')}`
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
              text: `${this.emojis.error} Could not update Salesforce: ${result.error}`
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
      return `${this.emojis.warning} ${result.error || 'No contact found'}`;
    }

    if (result.multipleMatches) {
      const matches = result.contacts.slice(0, 3)
        .map((c, i) => `${i + 1}. ${c.name} at ${c.company || c.accountName || 'Unknown'}`)
        .join('\n');
      return `${this.emojis.search} Multiple matches:\n${matches}\n\n_Add more details to narrow results_`;
    }

    const contact = result.contact;
    const lines = [];
    
    lines.push(`${this.emojis.person} *${contact.name}*${contact.title ? ` - ${contact.title}` : ''}`);
    if (contact.company) lines.push(`${this.emojis.company} ${contact.company}`);
    if (contact.phone) lines.push(`${this.emojis.phone} ${contact.phone} (${contact.phoneSource})`);
    if (contact.email) lines.push(`${this.emojis.email} ${contact.email} (${contact.emailSource})`);
    if (contact.linkedin) lines.push(`${this.emojis.linkedin} ${contact.linkedin}`);

    if (result.enriched && contact.sfId) {
      lines.push(`\n${this.emojis.update} _React with ✅ to update Salesforce_`);
    }

    return lines.join('\n');
  }

  /**
   * Format help text for /contact command
   */
  getHelpText() {
    return `${this.emojis.search} *Contact Lookup Help*

*Usage:* \`/contact [name] at [company]\`

*Examples:*
• \`/contact Bob Smith at Microsoft\` - Search by name and company
• \`/contact Sarah Johnson, VP Legal at Acme\` - Include title
• \`/contact john.doe@company.com\` - Search by email
• \`/contact Smith\` - Search by last name only

*How It Works:*
1. Searches Salesforce Contacts and Leads first
2. If missing phone/email, enriches from web sources
3. React with ✅ to save enriched data back to Salesforce

*Sources:*
• ${this.emojis.salesforce} SF = Salesforce record
• ${this.emojis.web} Web = Found via web search

*Tips:*
• Include company name for better matches
• Nicknames work (Bob → Robert, Mike → Michael)
• I handle company abbreviations (MSFT → Microsoft)`;
  }
}

module.exports = new ContactFormatter();


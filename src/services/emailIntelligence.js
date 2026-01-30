/**
 * emailIntelligence.js
 * 
 * Service for processing inbound emails from Email-to-Case.
 * Provides AI classification, account matching, and routing logic.
 * 
 * Priority 4: Email Aliases Pipeline
 * 
 * @author GTM Brain
 * @date January 2026
 */

const logger = require('../utils/logger');
const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Email alias to request type mapping
const ALIAS_TYPE_MAP = {
  'cs-inbound': 'Support',
  'reminders': 'Renewal Alert',
  'quotes': 'Quote Request'
};

/**
 * Process an inbound email case
 * @param {object} caseData - Case data from Salesforce Platform Event
 * @returns {object} Processing result with classification and routing
 */
async function processInboundEmail(caseData) {
  const correlationId = logger.operationStart('processInboundEmail', {
    service: 'emailIntelligence',
    caseId: caseData.caseId
  });

  try {
    logger.info('Processing inbound email', {
      correlationId,
      caseId: caseData.caseId,
      subject: caseData.subject,
      senderEmail: caseData.senderEmail,
      alias: caseData.emailAlias
    });

    // Step 1: Extract domain and match to account
    const senderDomain = extractDomain(caseData.senderEmail);
    const accountMatch = await matchAccountByDomain(senderDomain);

    // Step 2: Classify the email using LLM
    const classification = await classifyEmail(
      caseData.subject,
      caseData.description,
      caseData.emailAlias
    );

    // Step 3: Determine routing
    const routing = determineRouting(classification, accountMatch, caseData.emailAlias);

    // Step 4: Execute routing actions
    if (routing.urgency === 'high' || routing.sendSlackAlert) {
      await sendSlackAlert(caseData, accountMatch, classification);
    }

    logger.operationSuccess('processInboundEmail', {
      correlationId,
      classification,
      routing,
      accountMatched: !!accountMatch
    });

    return {
      success: true,
      caseId: caseData.caseId,
      classification,
      routing,
      account: accountMatch
    };

  } catch (error) {
    logger.operationError('processInboundEmail', error, {
      correlationId,
      caseId: caseData.caseId
    });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Extract domain from email address
 */
function extractDomain(email) {
  if (!email) return null;
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

/**
 * Match account by sender email domain
 * @param {string} domain - Email domain
 * @returns {object|null} Account info or null
 */
async function matchAccountByDomain(domain) {
  if (!domain) return null;

  try {
    const salesforce = require('./salesforce');
    
    // Query accounts with matching website domain
    const query = `
      SELECT Id, Name, Website, OwnerId, Owner.Name
      FROM Account 
      WHERE Website LIKE '%${domain}%'
      LIMIT 1
    `;
    
    const result = await salesforce.query(query);
    
    if (result.records && result.records.length > 0) {
      return {
        id: result.records[0].Id,
        name: result.records[0].Name,
        ownerId: result.records[0].OwnerId,
        ownerName: result.records[0].Owner?.Name
      };
    }

    return null;
  } catch (error) {
    logger.warn('Account matching failed', { domain, error: error.message });
    return null;
  }
}

/**
 * Classify email using LLM
 */
async function classifyEmail(subject, body, alias) {
  const correlationId = logger.getCorrelationId();

  try {
    const systemPrompt = `You are an email classifier for Eudia, an AI legal tech company. Classify inbound customer emails.

Return a JSON object with:
{
  "requestType": "Support" | "Renewal Alert" | "Quote Request" | "General",
  "urgency": "high" | "medium" | "low",
  "topics": ["topic1", "topic2"],
  "summary": "One sentence summary",
  "suggestedAction": "Brief recommended action"
}

Topics should be from: Contract Review, Pricing Inquiry, Technical Issue, Training Request, Renewal Discussion, Escalation, Product Feedback

Classify as "high" urgency if:
- Contains words like "urgent", "ASAP", "critical", "broken", "down"
- Mentions escalation or executive involvement
- References a deadline within 48 hours`;

    const userPrompt = `Email Alias: ${alias || 'unknown'}
Subject: ${subject}
Body: ${body?.substring(0, 2000) || 'No body'}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 500
    });

    const classification = JSON.parse(response.choices[0].message.content);

    logger.verbose('Email classified', { correlationId, classification });

    return classification;

  } catch (error) {
    logger.warn('Email classification failed, using defaults', { 
      correlationId, 
      error: error.message 
    });
    
    // Fallback classification based on alias
    return {
      requestType: ALIAS_TYPE_MAP[alias] || 'General',
      urgency: 'medium',
      topics: [],
      summary: subject,
      suggestedAction: 'Review and respond'
    };
  }
}

/**
 * Determine routing based on classification and account
 */
function determineRouting(classification, account, alias) {
  const routing = {
    urgency: classification.urgency,
    sendSlackAlert: false,
    slackChannel: null,
    assignTo: null,
    queueName: 'CS_Inbound_Queue'
  };

  // High urgency always gets Slack alert
  if (classification.urgency === 'high') {
    routing.sendSlackAlert = true;
    routing.slackChannel = process.env.CS_ALERTS_CHANNEL_ID;
  }

  // Assign to account owner if matched
  if (account?.ownerId) {
    routing.assignTo = account.ownerId;
  }

  // Route based on alias
  switch (alias) {
    case 'quotes':
      routing.queueName = 'Sales_Ops_Queue';
      break;
    case 'reminders':
      routing.queueName = 'CS_Renewals_Queue';
      break;
    default:
      routing.queueName = 'CS_Inbound_Queue';
  }

  return routing;
}

/**
 * Send Slack alert for urgent cases
 */
async function sendSlackAlert(caseData, account, classification) {
  const correlationId = logger.getCorrelationId();

  try {
    const { WebClient } = require('@slack/web-api');
    const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
    
    const channelId = process.env.CS_ALERTS_CHANNEL_ID;
    if (!channelId) {
      logger.warn('CS_ALERTS_CHANNEL_ID not configured');
      return;
    }

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${classification.urgency === 'high' ? '🚨' : '📧'} New Inbound Email`,
          emoji: true
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*From:*\n${caseData.senderEmail}`
          },
          {
            type: 'mrkdwn',
            text: `*Account:*\n${account?.name || 'Unknown'}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Subject:* ${caseData.subject}\n\n*Summary:* ${classification.summary}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Type: ${classification.requestType} | Urgency: ${classification.urgency.toUpperCase()} | Topics: ${classification.topics.join(', ') || 'None'}`
          }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View in Salesforce',
              emoji: true
            },
            url: `https://eudia.lightning.force.com/lightning/r/Case/${caseData.caseId}/view`,
            action_id: 'view_case'
          }
        ]
      }
    ];

    await slackClient.chat.postMessage({
      channel: channelId,
      blocks,
      text: `New inbound email from ${caseData.senderEmail}: ${caseData.subject}`
    });

    logger.info('Slack alert sent', { correlationId, channelId, caseId: caseData.caseId });

  } catch (error) {
    logger.warn('Failed to send Slack alert', { correlationId, error: error.message });
  }
}

/**
 * Generate weekly digest of inbound cases
 */
async function generateWeeklyDigest() {
  const correlationId = logger.operationStart('generateWeeklyDigest', {
    service: 'emailIntelligence'
  });

  try {
    const salesforce = require('./salesforce');
    
    // Get cases from last 7 days
    const query = `
      SELECT Id, Subject, Request_Type__c, Urgency__c, CreatedDate, 
             Auto_Extracted_Account__r.Name, Status
      FROM Case
      WHERE CreatedDate >= LAST_N_DAYS:7
      AND Origin = 'Email'
      ORDER BY CreatedDate DESC
    `;

    const result = await salesforce.query(query);
    const cases = result.records || [];

    // Aggregate stats
    const stats = {
      total: cases.length,
      byType: {},
      byUrgency: {},
      resolved: 0,
      pending: 0
    };

    for (const c of cases) {
      const type = c.Request_Type__c || 'General';
      const urgency = c.Urgency__c || 'Medium';
      
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      stats.byUrgency[urgency] = (stats.byUrgency[urgency] || 0) + 1;
      
      if (c.Status === 'Closed') {
        stats.resolved++;
      } else {
        stats.pending++;
      }
    }

    logger.operationSuccess('generateWeeklyDigest', { correlationId, stats });

    return {
      success: true,
      weekOf: new Date().toISOString().split('T')[0],
      stats,
      cases: cases.slice(0, 20) // Top 20 for digest
    };

  } catch (error) {
    logger.operationError('generateWeeklyDigest', error, { correlationId });
    return { success: false, error: error.message };
  }
}

module.exports = {
  processInboundEmail,
  classifyEmail,
  matchAccountByDomain,
  determineRouting,
  sendSlackAlert,
  generateWeeklyDigest,
  extractDomain
};

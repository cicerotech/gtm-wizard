const logger = require('../utils/logger');
const { cache } = require('../utils/cache');
const { parseIntent } = require('../ai/intentParser');
const { getContext, updateContext, clearContext } = require('../ai/contextManager');
const { queryBuilder } = require('../salesforce/queries');
const { query } = require('../salesforce/connection');
const { formatResponse } = require('./responseFormatter');
const channelMonitor = require('./channelMonitor');
const channelIntelligence = require('../services/channelIntelligence');
const intelligenceDigest = require('./intelligenceDigest');
const { lookup: contactLookup, getAnalytics: getContactAnalytics } = require('../services/contactEnrichment');
const contactFormatter = require('./contactFormatter');

/**
 * Register Slack slash commands
 */
function registerSlashCommands(app) {
  
  // Main pipeline command
  app.command('/pipeline', async ({ command, ack, respond, client }) => {
    await ack();
    
    try {
      await handlePipelineCommand(command, respond, client);
    } catch (error) {
      logger.error('Pipeline command error:', error);
      await respond('❌ Sorry, I encountered an error. Please try again.');
    }
  });

  // Forecast command
  app.command('/forecast', async ({ command, ack, respond, client }) => {
    await ack();
    
    try {
      await handleForecastCommand(command, respond, client);
    } catch (error) {
      logger.error('Forecast command error:', error);
      await respond('❌ Sorry, I encountered an error. Please try again.');
    }
  });

  // Deals command
  app.command('/deals', async ({ command, ack, respond, client }) => {
    await ack();
    
    try {
      await handleDealsCommand(command, respond, client);
    } catch (error) {
      logger.error('Deals command error:', error);
      await respond('❌ Sorry, I encountered an error. Please try again.');
    }
  });

  // Activity command
  app.command('/activity', async ({ command, ack, respond, client }) => {
    await ack();
    
    try {
      await handleActivityCommand(command, respond, client);
    } catch (error) {
      logger.error('Activity command error:', error);
      await respond('❌ Sorry, I encountered an error. Please try again.');
    }
  });

  // Intelligence command
  app.command('/intel', async ({ command, ack, respond, client }) => {
    await ack();
    
    try {
      await handleIntelCommand(command, respond, client);
    } catch (error) {
      logger.error('Intel command error:', error);
      await respond('❌ Sorry, I encountered an error. Please try again.');
    }
  });

  // Contact lookup command
  app.command('/contact', async ({ command, ack, respond, client }) => {
    await ack();
    
    try {
      await handleContactCommand(command, respond, client);
    } catch (error) {
      logger.error('Contact command error:', error);
      await respond('❌ Sorry, I encountered an error looking up that contact. Please try again.');
    }
  });

  logger.info('✅ Slash commands registered');
}

/**
 * Handle /pipeline command
 */
async function handlePipelineCommand(command, respond, client) {
  const userId = command.user_id;
  const channelId = command.channel_id;
  const text = command.text.trim();

  // Log interaction
  logger.slackInteraction('slash_command', userId, channelId, `/pipeline ${text}`);

  // Check rate limiting - Generous for testing and exploration
  const rateLimit = await cache.checkRateLimit(userId, 'slash_command');
  if (!rateLimit.allowed) {
    await respond({
      response_type: 'ephemeral',
      text: `⏱️ Whoa there! You're really testing me out. Please wait ${Math.ceil((rateLimit.resetTime - Date.now()) / 1000)} seconds before your next command. 🚀`
    });
    return;
  }

  // Handle help
  if (!text || text === 'help') {
    await respond({
      response_type: 'ephemeral',
      text: getPipelineHelp()
    });
    return;
  }

  // Handle clear context
  if (text === 'clear') {
    await clearContext(userId, channelId);
    await respond({
      response_type: 'ephemeral',
      text: '🗑️ Conversation context cleared.'
    });
    return;
  }

  // Process query
  await processSlashQuery(text, userId, channelId, 'pipeline_summary', respond);
}

/**
 * Handle /forecast command
 */
async function handleForecastCommand(command, respond, client) {
  const userId = command.user_id;
  const channelId = command.channel_id;
  const text = command.text.trim();

  logger.slackInteraction('slash_command', userId, channelId, `/forecast ${text}`);

  if (!text || text === 'help') {
    await respond({
      response_type: 'ephemeral',
      text: getForecastHelp()
    });
    return;
  }

  await processSlashQuery(text, userId, channelId, 'forecasting', respond);
}

/**
 * Handle /deals command
 */
async function handleDealsCommand(command, respond, client) {
  const userId = command.user_id;
  const channelId = command.channel_id;
  const text = command.text.trim();

  logger.slackInteraction('slash_command', userId, channelId, `/deals ${text}`);

  if (!text || text === 'help') {
    await respond({
      response_type: 'ephemeral',
      text: getDealsHelp()
    });
    return;
  }

  await processSlashQuery(text, userId, channelId, 'deal_lookup', respond);
}

/**
 * Handle /activity command
 */
async function handleActivityCommand(command, respond, client) {
  const userId = command.user_id;
  const channelId = command.channel_id;
  const text = command.text.trim();

  logger.slackInteraction('slash_command', userId, channelId, `/activity ${text}`);

  if (!text || text === 'help') {
    await respond({
      response_type: 'ephemeral',
      text: getActivityHelp()
    });
    return;
  }

  await processSlashQuery(text, userId, channelId, 'activity_check', respond);
}

/**
 * Process slash command query
 */
async function processSlashQuery(text, userId, channelId, defaultIntent, respond) {
  try {
    // Show initial response
    await respond({
      response_type: 'in_channel',
      text: `🤖 Processing: "${text}"...`
    });

    // Get conversation context
    const conversationContext = await getContext(userId, channelId);

    // Parse intent
    const parsedIntent = await parseIntent(text, conversationContext, userId);
    
    // Override intent if needed
    if (parsedIntent.intent === 'pipeline_summary' && defaultIntent !== 'pipeline_summary') {
      parsedIntent.intent = defaultIntent;
    }

    // Build and execute query
    let queryResult = null;
    let soql = null;

    if (parsedIntent.intent === 'forecasting') {
      soql = queryBuilder.buildOpportunityQuery({
        ...parsedIntent.entities,
        isClosed: false,
        forecastCategory: parsedIntent.entities.forecastCategory || ['Best Case', 'Commit', 'Pipeline']
      });
    } else if (parsedIntent.intent === 'activity_check') {
      soql = queryBuilder.buildOpportunityQuery({
        ...parsedIntent.entities,
        isClosed: false,
        staleDays: parsedIntent.entities.staleDays || 30
      });
    } else {
      soql = queryBuilder.buildOpportunityQuery(parsedIntent.entities);
    }

    queryResult = await query(soql);

    // Update context
    await updateContext(userId, channelId, parsedIntent, queryResult);

    // Format response
    const formattedResponse = formatResponse(queryResult, parsedIntent, conversationContext);

    // Send follow-up response
    await respond({
      response_type: 'in_channel',
      text: formattedResponse,
      replace_original: true
    });

  } catch (error) {
    logger.error('Slash command processing failed:', error);
    
    await respond({
      response_type: 'ephemeral',
      text: `❌ Error processing "${text}". Please try rephrasing or use the help command.`,
      replace_original: true
    });
  }
}

/**
 * Pipeline help text
 */
function getPipelineHelp() {
  return `📊 *Pipeline Command Help*

Usage: \`/pipeline [query]\`

*Examples:*
• \`/pipeline\` - Show your open pipeline
• \`/pipeline this quarter\` - Pipeline closing this quarter
• \`/pipeline enterprise\` - Deals over $100k
• \`/pipeline in proposal\` - Deals in proposal stage
• \`/pipeline Julie\` - Julie's pipeline
• \`/pipeline healthcare\` - Healthcare industry deals

*Special Commands:*
• \`/pipeline help\` - Show this help
• \`/pipeline clear\` - Clear conversation context

*Tips:*
• Be conversational - "show me my big deals this month"
• Follow up with refinements - "now just enterprise"
• I remember context within our conversation`;
}

/**
 * Forecast help text
 */
function getForecastHelp() {
  return `📈 *Forecast Command Help*

Usage: \`/forecast [query]\`

*Examples:*
• \`/forecast\` - Show current forecast
• \`/forecast this quarter\` - Q4 forecast
• \`/forecast commit only\` - Only committed deals
• \`/forecast best case\` - Best case scenario
• \`/forecast by owner\` - Forecast by rep
• \`/forecast coverage\` - Pipeline coverage

*Forecast Categories:*
• **Commit** - High confidence deals
• **Best Case** - Optimistic scenario
• **Pipeline** - All open deals
• **Omitted** - Excluded from forecast

*Tips:*
• Ask about specific time periods
• Compare forecast categories
• Group by owner, stage, or product`;
}

/**
 * Deals help text
 */
function getDealsHelp() {
  return `🔍 *Deals Command Help*

Usage: \`/deals [query]\`

*Examples:*
• \`/deals closed today\` - Today's wins
• \`/deals over 500k\` - Large deals
• \`/deals closing this week\` - Deals closing soon
• \`/deals new business\` - New customer deals
• \`/deals in negotiation\` - Deals being negotiated
• \`/deals at Resmed\` - Deals at specific account

*Deal Types:*
• **New Business** - New customers
• **Upsell** - Expansion deals
• **Renewal** - Contract renewals

*Time Periods:*
• today, yesterday, this week, this month
• this quarter, last quarter, next 30 days

*Tips:*
• Combine filters: "enterprise deals closing this month"
• Ask about specific accounts or reps
• Use natural language`;
}

/**
 * Activity help text
 */
function getActivityHelp() {
  return `⚠️ *Activity Command Help*

Usage: \`/activity [query]\`

*Examples:*
• \`/activity\` - Deals needing attention (30+ days stale)
• \`/activity 60 days\` - Deals stale for 60+ days
• \`/activity stuck in discovery\` - Discovery stage issues
• \`/activity by owner\` - Activity by rep
• \`/activity enterprise only\` - Large stale deals

*Activity Indicators:*
• **Stale** - No activity in 30+ days
• **Stuck** - Same stage for 60+ days
• **At Risk** - Closing soon with low probability

*Tips:*
• Focus on high-value stale deals
• Check specific stages or reps
• Use for pipeline hygiene reviews`;
}

/**
 * Handle /intel command
 */
async function handleIntelCommand(command, respond, client) {
  const userId = command.user_id;
  const channelId = command.channel_id;
  const text = command.text.trim().toLowerCase();

  logger.slackInteraction('slash_command', userId, channelId, `/intel ${text}`);

  // Handle help
  if (!text || text === 'help') {
    await respond({
      response_type: 'ephemeral',
      text: getIntelHelp()
    });
    return;
  }

  // Parse subcommands
  const parts = command.text.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();
  const args = parts.slice(1).join(' ');

  if (subcommand === 'set-account' || subcommand === 'link') {
    // Link current channel to an account
    if (!args) {
      await respond({
        response_type: 'ephemeral',
        text: '❌ Please specify an account name. Usage: `/intel set-account AccountName`'
      });
      return;
    }

    const result = await channelMonitor.setChannelAccount(channelId, args);

    if (result.success) {
      await respond({
        response_type: 'in_channel',
        text: `✅ Channel linked to *${result.accountName}*\n\nI'll now capture relevant intelligence from this channel for the daily digest.`
      });
    } else {
      await respond({
        response_type: 'ephemeral',
        text: `❌ ${result.error}`
      });
    }

  } else if (subcommand === 'status') {
    // Show monitoring status
    const status = await channelMonitor.getMonitoringStatus();
    const serviceStatus = channelIntelligence.getStatus();

    let statusText = `📊 *Intelligence Monitoring Status*\n\n`;
    statusText += `*Service:* ${serviceStatus.enabled ? '🟢 Enabled' : '🔴 Disabled'}\n`;
    statusText += `*Polling:* ${serviceStatus.pollingActive ? '🟢 Active' : '⚪ Inactive'} (every ${serviceStatus.pollIntervalHours}h)\n`;
    statusText += `*Channels Monitored:* ${status.channelsMonitored}\n\n`;

    if (status.channels && status.channels.length > 0) {
      statusText += `*Monitored Channels:*\n`;
      for (const ch of status.channels.slice(0, 10)) {
        const accountStatus = ch.hasAccountId ? '✅' : '⚠️';
        statusText += `• #${ch.name} → ${ch.account || 'Unmapped'} ${accountStatus}\n`;
      }
      if (status.channels.length > 10) {
        statusText += `_...and ${status.channels.length - 10} more_\n`;
      }
    }

    if (status.intelligence) {
      statusText += `\n*Intelligence Stats:*\n`;
      statusText += `• Pending: ${status.intelligence.pending}\n`;
      statusText += `• Approved: ${status.intelligence.approved}\n`;
      statusText += `• Rejected: ${status.intelligence.rejected}\n`;
    }

    await respond({
      response_type: 'ephemeral',
      text: statusText
    });

  } else if (subcommand === 'add' || subcommand === 'monitor') {
    // Add current channel to monitoring
    const result = await channelMonitor.addChannelToMonitoring(client, channelId);

    if (result.success) {
      const accountInfo = result.accountId 
        ? `Linked to *${result.accountName}*` 
        : `⚠️ No account linked - use \`/intel set-account AccountName\` to link`;

      await respond({
        response_type: 'in_channel',
        text: `✅ Channel added to intelligence monitoring!\n\n${accountInfo}`
      });
    } else {
      await respond({
        response_type: 'ephemeral',
        text: `❌ ${result.error}`
      });
    }

  } else if (subcommand === 'poll' || subcommand === 'sync') {
    // Force poll all channels
    await respond({
      response_type: 'ephemeral',
      text: '⏳ Starting intelligence poll...'
    });

    const result = await channelIntelligence.forcePoll();

    await respond({
      response_type: 'ephemeral',
      text: `✅ Poll complete!\n• Channels polled: ${result.channelsPolled || 0}\n• Messages processed: ${result.messagesProcessed || 0}\n• Intelligence found: ${result.intelligenceFound || 0}`
    });

  } else if (subcommand === 'digest') {
    // Trigger digest to current channel
    await respond({
      response_type: 'ephemeral',
      text: '⏳ Generating intelligence digest...'
    });

    const result = await intelligenceDigest.triggerDigest(channelId);

    if (result.error) {
      await respond({
        response_type: 'ephemeral',
        text: `❌ ${result.error}`
      });
    }

  } else if (subcommand === 'backfill') {
    // Historical backfill with API safeguards
    const isDryRun = args.includes('dry-run') || args.includes('--dry-run') || args.includes('estimate');
    const isConfirm = args.includes('confirm') || args.includes('--confirm');
    
    // Default to dry-run unless explicitly confirmed
    if (!isDryRun && !isConfirm) {
      await respond({
        response_type: 'ephemeral',
        text: `📊 *Historical Backfill*\n\nThis will scrape 90 days of channel history and use the Claude API for classification.\n\n*Options:*\n• \`/intel backfill dry-run\` - Estimate usage without API calls\n• \`/intel backfill confirm\` - Run the backfill\n\n⚠️ _API budget is shared with engineering. Run dry-run first._`
      });
      return;
    }
    
    await respond({
      response_type: 'ephemeral',
      text: isDryRun 
        ? '📊 Scanning channels for backfill estimate...' 
        : '⏳ Starting historical backfill (this may take several minutes)...'
    });
    
    // Run backfill with progress updates
    const result = await channelIntelligence.backfillChannels({
      dryRun: isDryRun,
      progressCallback: async (msg) => {
        // Note: Can't easily send progress updates in slash command context
        logger.info(`Backfill progress: ${msg}`);
      }
    });
    
    // For dry-run, just send text summary
    if (isDryRun || result.error) {
      const formattedResults = channelIntelligence.formatBackfillResults(result);
      await respond({
        response_type: 'in_channel',
        text: formattedResults
      });
      return;
    }
    
    // For actual backfill, generate and upload Excel file
    try {
      const excel = await channelIntelligence.generateBackfillExcel(result);
      
      // Upload Excel file to Slack
      await client.files.uploadV2({
        channel_id: channelId,
        file: excel.buffer,
        filename: excel.filename,
        title: `Channel Intelligence Report - ${new Date().toLocaleDateString()}`,
        initial_comment: `✅ *Backfill Complete*\n\n• Channels: ${result.channelsProcessed}\n• Messages analyzed: ${result.messagesAfterFilter?.toLocaleString()}\n• Intelligence found: ${result.intelligenceFound}\n• Tokens used: ${result.tokensUsed?.toLocaleString()} / ${channelIntelligence.BACKFILL_CONFIG.MAX_TOKENS_PER_RUN.toLocaleString()}\n\n📊 See attached Excel for week-over-week breakdown by account.`
      });
      
    } catch (excelError) {
      logger.error('Failed to generate/upload Excel:', excelError);
      // Fallback to text if Excel fails
      const formattedResults = channelIntelligence.formatBackfillResults(result);
      await respond({
        response_type: 'in_channel',
        text: formattedResults + '\n\n_Note: Excel export failed._'
      });
    }

  } else {
    // Unknown subcommand
    await respond({
      response_type: 'ephemeral',
      text: `❓ Unknown command: \`${subcommand}\`\n\n${getIntelHelp()}`
    });
  }
}

/**
 * Intel help text
 */
function getIntelHelp() {
  return `🧠 *Intelligence Command Help*

Usage: \`/intel [command] [options]\`

*Commands:*
• \`/intel set-account AccountName\` - Link this channel to a Salesforce account
• \`/intel add\` - Add this channel to intelligence monitoring
• \`/intel status\` - View monitoring status and stats
• \`/intel poll\` - Force poll all channels now
• \`/intel digest\` - Generate digest in this channel
• \`/intel backfill dry-run\` - Estimate historical scrape (no API calls)
• \`/intel backfill confirm\` - Run 90-day historical scrape

*How It Works:*
1. Add bot to customer channels
2. I'll automatically extract relevant intelligence
3. Daily digest at 8am ET for review
4. Approve items to sync to Customer Brain in Salesforce

*Intelligence Categories:*
📝 Meeting Notes • 💰 Deal Updates • 👥 Stakeholders
🔧 Technical • ⚖️ Legal • 🏁 Competitive • 📅 Timeline

*Tips:*
• Use descriptive channel names (e.g., \`#customer-cargill\`)
• I'll auto-detect account from channel name
• Use \`set-account\` for manual mapping if needed`;
}

/**
 * Handle /contact command
 */
async function handleContactCommand(command, respond, client) {
  const userId = command.user_id;
  const channelId = command.channel_id;
  const text = command.text.trim();

  logger.slackInteraction('slash_command', userId, channelId, `/contact ${text}`);

  // Check rate limiting
  const rateLimit = await cache.checkRateLimit(userId, 'contact_lookup');
  if (!rateLimit.allowed) {
    await respond({
      response_type: 'ephemeral',
      text: `⏱️ Please wait ${Math.ceil((rateLimit.resetTime - Date.now()) / 1000)} seconds before your next contact lookup.`
    });
    return;
  }

  // Handle help
  if (!text || text === 'help') {
    await respond({
      response_type: 'ephemeral',
      text: contactFormatter.getHelpText()
    });
    return;
  }

  // Handle stats
  if (text === 'stats') {
    const stats = getContactAnalytics();
    await respond({
      response_type: 'ephemeral',
      text: `📊 *Contact Lookup Stats*\n\n` +
        `Total lookups: ${stats.total}\n` +
        `SF match rate: ${stats.sfMatchRate}%\n` +
        `Avg response time: ${stats.avgResponseTime}ms\n` +
        `Correction rate: ${stats.correctionRate}%`
    });
    return;
  }

  // Show processing message
  await respond({
    response_type: 'in_channel',
    text: `🔍 Looking up: "${text}"...`
  });

  try {
    // Perform contact lookup
    const result = await contactLookup(text);

    // Format and send response
    const formatted = contactFormatter.formatContactResult(result);

    await client.chat.postMessage({
      channel: channelId,
      ...formatted,
      // If there was a processing message, we could update it
      // But for now, post as new message
    });

    // Update context for feedback tracking
    await updateContext(userId, channelId, {
      intent: 'contact_lookup',
      entities: result.parsed,
      timestamp: Date.now()
    }, {
      type: 'contact_lookup',
      lookupId: result.lookupId,
      success: result.success
    });

  } catch (error) {
    logger.error('Contact lookup failed:', error);
    
    await respond({
      response_type: 'ephemeral',
      text: `❌ Error looking up contact: ${error.message}\n\nTry: \`/contact help\` for usage examples.`,
      replace_original: true
    });
  }
}

/**
 * Contact help text
 */
function getContactHelp() {
  return contactFormatter.getHelpText();
}

module.exports = {
  registerSlashCommands
};

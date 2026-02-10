/**
 * Pipeline Review Agent
 * 
 * Triggered after a pipeline meeting transcription completes.
 * This agent:
 * 1. Cross-references the transcript with live Salesforce pipeline data
 * 2. Archives the structured summary to PostgreSQL
 * 3. Posts a formatted summary to the Slack #pipeline channel
 * 4. Updates pipeline snapshots with any mentioned forecast changes
 * 
 * Enqueue via:
 *   jobQueue.enqueue('pipeline_review', { 
 *     transcriptId, transcript, summary, accountName 
 *   });
 */

const db = require('../db/connection');
const logger = require('../observability/logger');
const jobQueue = require('./jobQueue');

/**
 * Main handler for pipeline review jobs
 */
async function handlePipelineReview(job) {
  const { transcriptId, transcript, summary, meetingDate } = job.payload;
  
  logger.info(`[PipelineReviewAgent] Processing pipeline review job #${job.id}`);
  
  const result = {
    sfContextLoaded: false,
    summaryArchived: false,
    slackPosted: false,
    snapshotUpdated: false
  };

  // ─── Step 1: Fetch Salesforce pipeline context ────────────────────
  let sfContext = {};
  try {
    const { query: sfQuery } = require('../salesforce/connection');
    
    const activeStages = [
      'Stage 0 - Qualifying', 'Stage 1 - Discovery', 'Stage 2 - SQO',
      'Stage 3 - Pilot / POC', 'Stage 4 - Proposal / Pricing', 'Stage 5 - Contracting / Negotiation'
    ];
    const stageFilter = activeStages.map(s => `'${s}'`).join(',');

    const [blSummary, keyDeals] = await Promise.all([
      sfQuery(`
        SELECT Owner.Name ownerName, COUNT(Id) dealCount, 
               SUM(ACV__c) totalACV,
               SUM(CASE WHEN BL_Forecast_Category__c = 'Commit' THEN ACV__c ELSE 0 END) commitACV,
               SUM(Weighted_ACV__c) weightedACV
        FROM Opportunity WHERE StageName IN (${stageFilter})
        GROUP BY Owner.Name ORDER BY Owner.Name
      `, true).catch(() => ({ records: [] })),
      sfQuery(`
        SELECT Name, Account.Name accountName, Owner.Name ownerName, StageName,
               ACV__c, BL_Forecast_Category__c, Target_LOI_Date__c, Product_Line__c
        FROM Opportunity WHERE StageName IN (${stageFilter})
          AND (StageName LIKE 'Stage 4%' OR StageName LIKE 'Stage 5%' OR BL_Forecast_Category__c = 'Commit')
        ORDER BY Owner.Name, ACV__c DESC
      `, true).catch(() => ({ records: [] }))
    ]);

    sfContext = {
      blSummaries: blSummary.records || [],
      keyDeals: keyDeals.records || [],
      fetchedAt: new Date().toISOString()
    };
    result.sfContextLoaded = true;
    logger.info(`[PipelineReviewAgent] Loaded SF context: ${sfContext.blSummaries.length} BLs, ${sfContext.keyDeals.length} key deals`);
  } catch (sfErr) {
    logger.warn('[PipelineReviewAgent] Salesforce context fetch failed:', sfErr.message);
  }

  // ─── Step 2: Archive the pipeline review summary ──────────────────
  if (db.isAvailable() && summary) {
    try {
      const { transcriptRepo } = require('../db/repositories');
      const summaryId = await transcriptRepo.savePipelineReviewSummary({
        reviewDate: meetingDate || new Date(),
        summaryMarkdown: summary,
        priorityActions: extractSection(summary, 'Priority Actions'),
        blContext: sfContext.blSummaries,
        accountDetails: extractSection(summary, 'Per-BL Account Details'),
        forecastChanges: extractSection(summary, 'Forecast'),
        actionItems: extractSection(summary, 'Team Action Items'),
        salesforceSnapshot: sfContext,
        transcriptId: transcriptId
      });
      result.summaryArchived = true;
      result.summaryId = summaryId;
      logger.info(`[PipelineReviewAgent] Summary archived: ID ${summaryId}`);
    } catch (archiveErr) {
      logger.warn('[PipelineReviewAgent] Summary archive failed:', archiveErr.message);
    }
  }

  // ─── Step 3: Post to Slack ────────────────────────────────────────
  try {
    const slackSummary = buildSlackSummary(summary, sfContext, meetingDate);
    
    // Try to post to a pipeline channel
    const { WebClient } = require('@slack/web-api');
    const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
    
    // Find the pipeline channel
    const pipelineChannelId = process.env.PIPELINE_SLACK_CHANNEL;
    
    if (pipelineChannelId) {
      await slackClient.chat.postMessage({
        channel: pipelineChannelId,
        text: `Pipeline Review Summary - ${new Date(meetingDate || Date.now()).toLocaleDateString()}`,
        blocks: slackSummary
      });
      result.slackPosted = true;
      logger.info(`[PipelineReviewAgent] Posted summary to Slack channel ${pipelineChannelId}`);
    } else {
      logger.info('[PipelineReviewAgent] No PIPELINE_SLACK_CHANNEL configured, skipping Slack post');
    }
  } catch (slackErr) {
    logger.warn('[PipelineReviewAgent] Slack post failed:', slackErr.message);
  }

  // ─── Step 4: Update pipeline snapshots ────────────────────────────
  if (db.isAvailable() && sfContext.blSummaries.length > 0) {
    try {
      const { pipelineSnapshotRepo } = require('../db/repositories');
      const snapshotDate = new Date().toISOString().split('T')[0];
      
      for (const bl of sfContext.blSummaries) {
        await pipelineSnapshotRepo.saveSnapshot(snapshotDate, bl.ownerName, {
          dealCount: bl.dealCount,
          totalAcv: bl.totalACV || 0,
          weightedAcv: bl.weightedACV || 0,
          commitAcv: bl.commitACV || 0
        });
      }
      result.snapshotUpdated = true;
      logger.info(`[PipelineReviewAgent] Pipeline snapshots updated for ${sfContext.blSummaries.length} BLs`);
    } catch (snapErr) {
      logger.warn('[PipelineReviewAgent] Snapshot update failed:', snapErr.message);
    }
  }

  logger.info(`[PipelineReviewAgent] Job #${job.id} complete:`, JSON.stringify(result));
  return result;
}

/**
 * Extract a section from markdown summary by header
 */
function extractSection(markdown, headerKeyword) {
  if (!markdown) return [];
  const lines = markdown.split('\n');
  let inSection = false;
  const sectionLines = [];
  
  for (const line of lines) {
    if (line.startsWith('##') && line.toLowerCase().includes(headerKeyword.toLowerCase())) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith('##')) {
      break; // Next section
    }
    if (inSection && line.trim()) {
      sectionLines.push(line.trim());
    }
  }
  
  return sectionLines;
}

/**
 * Build Slack Block Kit message from pipeline summary
 */
function buildSlackSummary(summary, sfContext, meetingDate) {
  const dateStr = new Date(meetingDate || Date.now()).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Pipeline Review | ${dateStr}` }
    },
    { type: 'divider' }
  ];

  // BL Summary table
  if (sfContext.blSummaries && sfContext.blSummaries.length > 0) {
    let blText = '*Business Lead Totals*\n';
    for (const bl of sfContext.blSummaries) {
      const acv = bl.totalACV ? `$${Math.round(bl.totalACV / 1000)}k` : '$0';
      const commit = bl.commitACV ? `$${Math.round(bl.commitACV / 1000)}k commit` : 'no commit';
      blText += `• *${bl.ownerName}*: ${bl.dealCount} deals, ${acv} ACV, ${commit}\n`;
    }
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: blText.substring(0, 3000) }
    });
    blocks.push({ type: 'divider' });
  }

  // Truncated summary
  if (summary) {
    // Extract just the Priority Actions section for Slack
    const priorityLines = extractSection(summary, 'Priority Actions');
    if (priorityLines.length > 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Priority Actions*\n${priorityLines.slice(0, 10).join('\n')}`.substring(0, 3000) }
      });
    }

    // Action items
    const actionLines = extractSection(summary, 'Team Action Items');
    if (actionLines.length > 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Action Items*\n${actionLines.slice(0, 10).join('\n')}`.substring(0, 3000) }
      });
    }
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '_Generated by GTM Brain Pipeline Review Agent_' }]
  });

  return blocks;
}

/**
 * Register the handler with the job queue
 */
function register() {
  jobQueue.registerHandler('pipeline_review', handlePipelineReview);
  logger.info('[PipelineReviewAgent] Registered with job queue');
}

module.exports = {
  register,
  handlePipelineReview,
  buildSlackSummary,
  extractSection
};

/**
 * Velocity Tracker Service
 * Tracks sales velocity metrics from calendar events and meeting notes
 * 
 * Integrates with:
 * - Calendar sync (captures meetings automatically)
 * - Obsidian sync (captures meeting notes)
 * - Salesforce (links to opportunity stages)
 */

const logger = require('../utils/logger');
const intelligenceStore = require('./intelligenceStore');
const { classifyMeetingFull } = require('./meetingClassifier');
const { query } = require('../salesforce/connection');

/**
 * Process a calendar event and create/update meeting milestone
 * Called during calendar sync
 */
async function trackMeetingFromCalendar(event, context = {}) {
  try {
    const { accountId, accountName, blEmail } = context;
    
    if (!accountId) {
      logger.debug(`[VelocityTracker] Skipping - no accountId for: ${event.subject}`);
      return null;
    }
    
    // Get existing milestone data for context
    const [existingCount, firstMeetingDate, lastMeetingDate, previousTypes] = await Promise.all([
      intelligenceStore.getMeetingCountForAccount(accountId),
      intelligenceStore.getFirstMeetingDate(accountId),
      intelligenceStore.getLastMeetingDate(accountId),
      intelligenceStore.getPreviousMeetingTypes(accountId)
    ]);
    
    // Get opportunity stage from Salesforce
    let opportunityStage = null;
    let opportunityId = null;
    try {
      const oppResult = await query(`
        SELECT Id, StageName FROM Opportunity 
        WHERE AccountId = '${accountId}' 
        AND IsClosed = false 
        ORDER BY CreatedDate DESC 
        LIMIT 1
      `);
      if (oppResult.records?.length > 0) {
        opportunityId = oppResult.records[0].Id;
        opportunityStage = oppResult.records[0].StageName;
      }
    } catch (e) {
      logger.debug(`[VelocityTracker] Could not fetch opp stage: ${e.message}`);
    }
    
    // Calculate sequence number (this will be the Nth meeting)
    const sequenceNumber = existingCount + 1;
    
    // Calculate days from first and previous meetings
    const meetingDate = event.startDateTime?.split('T')[0] || new Date().toISOString().split('T')[0];
    let daysFromFirst = null;
    let daysFromPrevious = null;
    
    if (firstMeetingDate) {
      daysFromFirst = Math.round(
        (new Date(meetingDate) - new Date(firstMeetingDate)) / (1000 * 60 * 60 * 24)
      );
    }
    
    if (lastMeetingDate) {
      daysFromPrevious = Math.round(
        (new Date(meetingDate) - new Date(lastMeetingDate)) / (1000 * 60 * 60 * 24)
      );
    }
    
    // Classify meeting type with full context
    const classification = await classifyMeetingFull(event.subject, {
      accountName,
      attendees: event.externalAttendees || [],
      sequenceNumber,
      daysSinceLast: daysFromPrevious,
      opportunityStage,
      previousTypes,
      useLLM: true
    });
    
    // Create milestone record
    const milestone = {
      accountId,
      accountName,
      opportunityId,
      meetingId: event.eventId,
      meetingDate,
      meetingSubject: event.subject,
      meetingType: classification.type,
      classificationConfidence: classification.confidence,
      classificationMethod: classification.method,
      sequenceNumber,
      daysFromFirst,
      daysFromPrevious,
      stageAtMeeting: opportunityStage,
      source: 'calendar',
      blEmail
    };
    
    // Save to database
    const saved = await intelligenceStore.saveMeetingMilestone(milestone);
    
    logger.info(`[VelocityTracker] Tracked: ${classification.type} for ${accountName} (meeting #${sequenceNumber})`);
    
    return saved;
    
  } catch (error) {
    logger.error(`[VelocityTracker] Error tracking meeting:`, error.message);
    return null;
  }
}

/**
 * Process an Obsidian note and create/update meeting milestone
 * Called during Obsidian sync
 */
async function trackMeetingFromObsidian(noteData, context = {}) {
  try {
    const { accountId, accountName, blEmail, noteTitle, noteDate } = noteData;
    
    if (!accountId) {
      logger.debug(`[VelocityTracker] Skipping Obsidian note - no accountId`);
      return null;
    }
    
    // Get existing milestone data
    const [existingCount, firstMeetingDate, lastMeetingDate, previousTypes] = await Promise.all([
      intelligenceStore.getMeetingCountForAccount(accountId),
      intelligenceStore.getFirstMeetingDate(accountId),
      intelligenceStore.getLastMeetingDate(accountId),
      intelligenceStore.getPreviousMeetingTypes(accountId)
    ]);
    
    // Get opportunity stage
    let opportunityStage = null;
    let opportunityId = null;
    try {
      const oppResult = await query(`
        SELECT Id, StageName FROM Opportunity 
        WHERE AccountId = '${accountId}' 
        AND IsClosed = false 
        ORDER BY CreatedDate DESC 
        LIMIT 1
      `);
      if (oppResult.records?.length > 0) {
        opportunityId = oppResult.records[0].Id;
        opportunityStage = oppResult.records[0].StageName;
      }
    } catch (e) {
      logger.debug(`[VelocityTracker] Could not fetch opp stage: ${e.message}`);
    }
    
    const sequenceNumber = existingCount + 1;
    const meetingDate = noteDate || new Date().toISOString().split('T')[0];
    
    let daysFromFirst = null;
    let daysFromPrevious = null;
    
    if (firstMeetingDate) {
      daysFromFirst = Math.round(
        (new Date(meetingDate) - new Date(firstMeetingDate)) / (1000 * 60 * 60 * 24)
      );
    }
    
    if (lastMeetingDate) {
      daysFromPrevious = Math.round(
        (new Date(meetingDate) - new Date(lastMeetingDate)) / (1000 * 60 * 60 * 24)
      );
    }
    
    // Classify from note title
    const classification = await classifyMeetingFull(noteTitle, {
      accountName,
      sequenceNumber,
      daysSinceLast: daysFromPrevious,
      opportunityStage,
      previousTypes,
      useLLM: true
    });
    
    const milestone = {
      accountId,
      accountName,
      opportunityId,
      meetingId: `obsidian_${Date.now()}`,
      meetingDate,
      meetingSubject: noteTitle,
      meetingType: classification.type,
      classificationConfidence: classification.confidence,
      classificationMethod: classification.method,
      sequenceNumber,
      daysFromFirst,
      daysFromPrevious,
      stageAtMeeting: opportunityStage,
      source: 'obsidian',
      blEmail
    };
    
    const saved = await intelligenceStore.saveMeetingMilestone(milestone);
    
    logger.info(`[VelocityTracker] Tracked from Obsidian: ${classification.type} for ${accountName}`);
    
    return saved;
    
  } catch (error) {
    logger.error(`[VelocityTracker] Error tracking Obsidian note:`, error.message);
    return null;
  }
}

/**
 * Get velocity report for a specific account
 */
async function getAccountVelocityReport(accountId) {
  try {
    const metrics = await intelligenceStore.getAccountVelocityMetrics(accountId);
    
    if (!metrics) {
      return { found: false, message: 'No meeting history found for this account' };
    }
    
    // Get benchmark data
    const benchmarks = await intelligenceStore.getVelocityBenchmarks();
    
    // Compare to benchmarks
    const comparisons = {};
    
    if (metrics.velocity.introToDemo && benchmarks.introToDemo.avg) {
      const diff = metrics.velocity.introToDemo - benchmarks.introToDemo.avg;
      comparisons.introToDemo = {
        actual: metrics.velocity.introToDemo,
        benchmark: benchmarks.introToDemo.avg,
        diff,
        status: diff <= 0 ? 'ahead' : diff <= 14 ? 'on_track' : 'behind'
      };
    }
    
    if (metrics.velocity.introToProposal && benchmarks.introToProposal.avg) {
      const diff = metrics.velocity.introToProposal - benchmarks.introToProposal.avg;
      comparisons.introToProposal = {
        actual: metrics.velocity.introToProposal,
        benchmark: benchmarks.introToProposal.avg,
        diff,
        status: diff <= 0 ? 'ahead' : diff <= 30 ? 'on_track' : 'behind'
      };
    }
    
    return {
      found: true,
      account: {
        id: metrics.accountId,
        name: metrics.accountName
      },
      summary: {
        totalMeetings: metrics.totalMeetings,
        meetingTypes: metrics.meetingTypesSeen,
        firstMeeting: metrics.milestones.firstMeeting,
        latestMilestones: metrics.milestones
      },
      velocity: metrics.velocity,
      comparisons,
      benchmarks: {
        introToDemo: benchmarks.introToDemo.avg,
        introToProposal: benchmarks.introToProposal.avg,
        demoToProposal: benchmarks.demoToProposal.avg,
        sampleSize: benchmarks.sampleSize
      }
    };
    
  } catch (error) {
    logger.error(`[VelocityTracker] Error generating report:`, error.message);
    throw error;
  }
}

/**
 * Get deals that are moving slower than benchmark
 */
async function getSlowDeals(threshold = 14) {
  try {
    const benchmarks = await intelligenceStore.getVelocityBenchmarks();
    const allMilestones = await intelligenceStore.getDb()?.all?.(`
      SELECT DISTINCT account_id FROM meeting_milestones
    `) || [];
    
    const slowDeals = [];
    
    for (const { account_id } of (allMilestones || [])) {
      const metrics = await intelligenceStore.getAccountVelocityMetrics(account_id);
      if (!metrics) continue;
      
      // Check if any velocity metric is significantly behind
      if (metrics.velocity.introToDemo && benchmarks.introToDemo.avg) {
        const diff = metrics.velocity.introToDemo - benchmarks.introToDemo.avg;
        if (diff > threshold) {
          slowDeals.push({
            accountId: metrics.accountId,
            accountName: metrics.accountName,
            metric: 'introToDemo',
            actual: metrics.velocity.introToDemo,
            benchmark: benchmarks.introToDemo.avg,
            daysOver: diff
          });
        }
      }
    }
    
    return slowDeals.sort((a, b) => b.daysOver - a.daysOver);
    
  } catch (error) {
    logger.error(`[VelocityTracker] Error finding slow deals:`, error.message);
    return [];
  }
}

module.exports = {
  trackMeetingFromCalendar,
  trackMeetingFromObsidian,
  getAccountVelocityReport,
  getSlowDeals
};


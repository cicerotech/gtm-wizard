/**
 * Snapshot Meetings Job
 * End-of-day job to capture meeting prep data for historical record
 * 
 * Flow:
 * 1. Fetch all meetings that occurred today
 * 2. For each meeting with prep data:
 *    a. Capture current state of prep (agenda, goals, attendees, notes)
 *    b. Store as historical snapshot with timestamp
 * 3. Mark meetings as "completed" in the system
 * 
 * Run: Daily at 11 PM (end of business day)
 */

const logger = require('../utils/logger');
const meetingPrepService = require('../services/meetingPrepService');
const intelligenceStore = require('../services/intelligenceStore');

// Configuration
const RUN_HOUR = 23; // 11 PM

/**
 * Main snapshot job
 */
async function runSnapshotJob() {
  const startTime = Date.now();
  logger.info('📸 Starting meeting snapshot job');

  const stats = {
    meetingsProcessed: 0,
    snapshotsSaved: 0,
    errors: [],
    duration: 0
  };

  try {
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const todayStr = today.toISOString().split('T')[0];
    logger.info(`📸 Snapshotting meetings for ${todayStr}`);

    // Fetch today's meetings
    const meetings = await meetingPrepService.getUpcomingMeetings(
      today.toISOString(),
      endOfDay.toISOString()
    );

    stats.meetingsProcessed = meetings.length;
    logger.info(`📸 Found ${meetings.length} meetings for today`);

    // Process each meeting
    for (const meeting of meetings) {
      try {
        const meetingId = meeting.meeting_id || meeting.meetingId;
        
        // Get prep data for this meeting
        const prep = await meetingPrepService.getMeetingPrep(meetingId);
        
        if (prep) {
          // Create snapshot
          const snapshot = {
            meetingId,
            snapshotDate: todayStr,
            snapshotTime: new Date().toISOString(),
            accountName: meeting.account_name || meeting.accountName,
            meetingTitle: meeting.meeting_title || meeting.meetingTitle,
            meetingDate: meeting.meeting_date || meeting.meetingDate,
            prep: {
              agenda: prep.agenda || [],
              goals: prep.goals || [],
              demoSelections: prep.demoSelections || [],
              context: prep.context || '',
              additionalNotes: prep.additionalNotes || [],
              externalAttendees: prep.externalAttendees || [],
              internalAttendees: prep.internalAttendees || []
            },
            source: meeting.source || 'unknown'
          };

          // Store snapshot
          await intelligenceStore.store(
            `meeting_snapshot:${meetingId}:${todayStr}`,
            snapshot,
            365 * 24 * 60 * 60 * 1000 // Keep for 1 year
          );

          stats.snapshotsSaved++;
          logger.info(`📸 Snapshot saved for: ${meeting.meeting_title || meeting.meetingTitle}`);
        }
      } catch (error) {
        logger.error(`Failed to snapshot meeting: ${meeting.meeting_title}`, error.message);
        stats.errors.push({ meeting: meeting.meeting_title, error: error.message });
      }
    }

    stats.duration = Date.now() - startTime;
    logger.info(`📸 Snapshot job completed in ${stats.duration}ms: ${stats.snapshotsSaved} snapshots saved`);

    return stats;

  } catch (error) {
    logger.error('Snapshot job failed:', error);
    stats.errors.push({ general: error.message });
    stats.duration = Date.now() - startTime;
    return stats;
  }
}

/**
 * Get historical snapshots for a meeting
 */
async function getMeetingSnapshots(meetingId) {
  try {
    // Get all snapshots for this meeting
    const pattern = `meeting_snapshot:${meetingId}:*`;
    const snapshots = await intelligenceStore.searchByPattern(pattern);
    
    return snapshots.sort((a, b) => 
      new Date(b.snapshotTime) - new Date(a.snapshotTime)
    );
  } catch (error) {
    logger.error(`Failed to get snapshots for ${meetingId}:`, error.message);
    return [];
  }
}

/**
 * Trigger job manually (for testing or API)
 */
async function triggerSnapshotJob() {
  logger.info('📸 Manual snapshot job trigger');
  return runSnapshotJob();
}

/**
 * Check if job should run based on current time
 */
function shouldRunJob() {
  const now = new Date();
  return now.getHours() === RUN_HOUR;
}

/**
 * Get job status
 */
function getJobStatus() {
  return {
    name: 'snapshotMeetings',
    runHour: RUN_HOUR,
    description: 'End-of-day snapshot of meeting prep data',
    nextRun: getNextRunTime()
  };
}

/**
 * Get next scheduled run time
 */
function getNextRunTime() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(RUN_HOUR, 0, 0, 0);
  
  if (now.getHours() >= RUN_HOUR) {
    next.setDate(next.getDate() + 1);
  }
  
  return next.toISOString();
}

module.exports = {
  runSnapshotJob,
  triggerSnapshotJob,
  getMeetingSnapshots,
  shouldRunJob,
  getJobStatus
};


/**
 * Git Commit Job
 * 
 * Zero Render Storage Architecture - Data Persistence Layer
 * 
 * This scheduled job periodically commits data file changes to the git repository.
 * Data is stored in encrypted JSON files in the data/ folder, and this job ensures
 * changes are persisted to the repo for:
 * - Survival across Render deployments
 * - Full audit trail of all data changes
 * - Data residency in version control
 * 
 * Schedule: Runs every 30 minutes and on graceful shutdown
 * 
 * Files tracked:
 * - data/user-tokens.enc.json (encrypted OAuth tokens)
 * - data/slack-intel-cache.json (Slack intelligence)
 * - data/meeting-prep-cache.json (meeting preparation data)
 * - data/enrichment-cache.json (account enrichment data)
 */

const { execSync } = require('child_process');
const path = require('path');
const cron = require('node-cron');
const logger = require('../utils/logger');

// Configuration
const COMMIT_INTERVAL_MINUTES = 30;
const DATA_DIR = path.join(__dirname, '../../data');

// Files to track for git commits
const DATA_FILES = [
  'user-tokens.enc.json',
  'slack-intel-cache.json',
  'meeting-prep-cache.json',
  'enrichment-cache.json'
];

// State
let commitInProgress = false;
let lastCommitResult = null;
let scheduledTask = null;
let commitCount = 0;

/**
 * Check if there are uncommitted changes in data files
 * @returns {Object} - { hasChanges: boolean, files: string[] }
 */
function checkForDataChanges() {
  try {
    // Get git status for data folder
    const status = execSync('git status --porcelain data/', {
      cwd: path.join(__dirname, '../..'),
      encoding: 'utf8'
    }).trim();
    
    if (!status) {
      return { hasChanges: false, files: [] };
    }
    
    // Parse changed files
    const changedFiles = status.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Status format: "XY filename" or "XY -> filename"
        const parts = line.split(/\s+/);
        return parts[parts.length - 1];
      })
      .filter(file => {
        // Only track our specific data files
        const basename = path.basename(file);
        return DATA_FILES.includes(basename);
      });
    
    return {
      hasChanges: changedFiles.length > 0,
      files: changedFiles
    };
    
  } catch (error) {
    logger.error('[GitCommit] Failed to check git status:', error.message);
    return { hasChanges: false, files: [], error: error.message };
  }
}

/**
 * Commit data file changes to git
 * @param {string} reason - Reason for commit (scheduled, shutdown, manual)
 * @returns {Object} - Result of commit operation
 */
async function commitDataChanges(reason = 'scheduled') {
  if (commitInProgress) {
    logger.debug('[GitCommit] Commit already in progress, skipping');
    return { skipped: true, reason: 'Already in progress' };
  }
  
  commitInProgress = true;
  const startTime = Date.now();
  
  try {
    // Check for changes
    const changes = checkForDataChanges();
    
    if (!changes.hasChanges) {
      logger.debug('[GitCommit] No data file changes to commit');
      
      lastCommitResult = {
        success: true,
        committed: false,
        reason: 'No changes',
        completedAt: new Date().toISOString()
      };
      
      return lastCommitResult;
    }
    
    logger.info(`[GitCommit] Found ${changes.files.length} changed data file(s): ${changes.files.join(', ')}`);
    
    const repoRoot = path.join(__dirname, '../..');
    
    // Stage data files
    for (const file of DATA_FILES) {
      const filePath = path.join('data', file);
      try {
        execSync(`git add ${filePath}`, { cwd: repoRoot, encoding: 'utf8' });
      } catch (e) {
        // File might not exist, that's okay
      }
    }
    
    // Create commit message
    const timestamp = new Date().toISOString();
    const filesChanged = changes.files.map(f => path.basename(f)).join(', ');
    const commitMessage = `[auto] Data sync (${reason}): ${filesChanged}

Automated commit by Zero Render Storage Architecture
Timestamp: ${timestamp}
Files: ${changes.files.join(', ')}`;
    
    // Commit
    try {
      execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
        cwd: repoRoot,
        encoding: 'utf8'
      });
      
      commitCount++;
      
      const duration = Date.now() - startTime;
      
      lastCommitResult = {
        success: true,
        committed: true,
        files: changes.files,
        duration,
        reason,
        commitNumber: commitCount,
        completedAt: new Date().toISOString()
      };
      
      logger.info(`[GitCommit] Successfully committed ${changes.files.length} file(s) (${duration}ms)`);
      
      // Push to remote if configured
      if (process.env.GIT_AUTO_PUSH === 'true') {
        try {
          execSync('git push', { cwd: repoRoot, encoding: 'utf8' });
          lastCommitResult.pushed = true;
          logger.info('[GitCommit] Pushed to remote');
        } catch (pushError) {
          lastCommitResult.pushed = false;
          lastCommitResult.pushError = pushError.message;
          logger.warn('[GitCommit] Push failed (will retry next cycle):', pushError.message);
        }
      }
      
      return lastCommitResult;
      
    } catch (commitError) {
      // Check if it's "nothing to commit"
      if (commitError.message.includes('nothing to commit')) {
        logger.debug('[GitCommit] Nothing to commit after staging');
        lastCommitResult = {
          success: true,
          committed: false,
          reason: 'Nothing to commit after staging',
          completedAt: new Date().toISOString()
        };
        return lastCommitResult;
      }
      throw commitError;
    }
    
  } catch (error) {
    logger.error('[GitCommit] Commit failed:', error.message);
    
    lastCommitResult = {
      success: false,
      error: error.message,
      completedAt: new Date().toISOString()
    };
    
    return lastCommitResult;
    
  } finally {
    commitInProgress = false;
  }
}

/**
 * Schedule the git commit job to run periodically
 */
function scheduleGitCommit() {
  if (scheduledTask) {
    scheduledTask.stop();
  }
  
  // Run every 30 minutes at minute 0 and 30
  const cronSchedule = `0,30 * * * *`;
  
  scheduledTask = cron.schedule(cronSchedule, async () => {
    logger.debug('[GitCommit] Scheduled commit triggered');
    await commitDataChanges('scheduled');
  });
  
  logger.info(`[GitCommit] Scheduled to run every ${COMMIT_INTERVAL_MINUTES} minutes`);
  
  return scheduledTask;
}

/**
 * Initialize the git commit job
 * - Schedules regular commits
 * - Sets up graceful shutdown handler
 */
async function initializeGitCommit() {
  logger.info('[GitCommit] Initializing Zero Render Storage git commit job...');
  
  // Schedule regular commits
  scheduleGitCommit();
  
  // Register shutdown handler
  registerShutdownHandler();
  
  // Check initial status
  const changes = checkForDataChanges();
  
  if (changes.hasChanges) {
    logger.info(`[GitCommit] Found ${changes.files.length} uncommitted data file(s) on startup`);
    // Don't auto-commit on startup - let the scheduled job handle it
  }
  
  return {
    initialized: true,
    pendingChanges: changes,
    scheduledCommit: true,
    intervalMinutes: COMMIT_INTERVAL_MINUTES
  };
}

/**
 * Register graceful shutdown handler to commit before exit
 */
function registerShutdownHandler() {
  const shutdown = async (signal) => {
    logger.info(`[GitCommit] ${signal} received, committing data before shutdown...`);
    
    // Force save any pending file store writes
    try {
      const userTokenService = require('../services/userTokenService');
      await userTokenService.forceSave();
    } catch (e) {
      logger.warn('[GitCommit] Could not force save token store:', e.message);
    }
    
    try {
      const meetingPrepFileStore = require('../services/meetingPrepFileStore');
      meetingPrepFileStore.forceSave();
    } catch (e) {
      logger.warn('[GitCommit] Could not force save meeting prep store:', e.message);
    }
    
    try {
      const enrichmentFileStore = require('../services/enrichmentFileStore');
      enrichmentFileStore.forceSave();
    } catch (e) {
      logger.warn('[GitCommit] Could not force save enrichment store:', e.message);
    }
    
    // Commit any pending changes
    try {
      const result = await commitDataChanges('shutdown');
      if (result.committed) {
        logger.info('[GitCommit] Shutdown commit successful');
      } else {
        logger.info('[GitCommit] No changes to commit on shutdown');
      }
    } catch (error) {
      logger.error('[GitCommit] Shutdown commit failed:', error.message);
    }
    
    // Exit after a short delay
    setTimeout(() => process.exit(0), 500);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Get commit status for API/monitoring
 */
function getCommitStatus() {
  const changes = checkForDataChanges();
  
  return {
    commitInProgress,
    lastCommitResult,
    pendingChanges: changes,
    totalCommits: commitCount,
    config: {
      intervalMinutes: COMMIT_INTERVAL_MINUTES,
      trackedFiles: DATA_FILES,
      autoPush: process.env.GIT_AUTO_PUSH === 'true'
    }
  };
}

/**
 * Manual trigger for API endpoint
 */
async function triggerManualCommit() {
  logger.info('[GitCommit] Manual commit triggered via API');
  return commitDataChanges('manual');
}

/**
 * Stop scheduled commits (for cleanup)
 */
function stopScheduledCommit() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('[GitCommit] Scheduled commits stopped');
  }
}

module.exports = {
  commitDataChanges,
  scheduleGitCommit,
  initializeGitCommit,
  getCommitStatus,
  triggerManualCommit,
  stopScheduledCommit,
  checkForDataChanges,
  COMMIT_INTERVAL_MINUTES
};

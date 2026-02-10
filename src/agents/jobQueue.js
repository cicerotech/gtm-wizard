/**
 * Agent Job Queue
 * 
 * PostgreSQL-backed job queue for async agent tasks.
 * Supports priorities, retries, dead-letter, and scheduled execution.
 * 
 * Job Lifecycle:
 *   pending → running → completed
 *                    → failed (retries left → pending)
 *                    → dead_letter (no retries)
 * 
 * Usage:
 *   const jobQueue = require('./agents/jobQueue');
 *   
 *   // Enqueue a job
 *   const jobId = await jobQueue.enqueue('pipeline_review', { transcriptId: 123 });
 *   
 *   // Register a handler
 *   jobQueue.registerHandler('pipeline_review', async (job) => { ... });
 *   
 *   // Start the worker
 *   jobQueue.startWorker();
 */

const db = require('../db/connection');
const logger = require('../observability/logger');

// Registered job handlers
const handlers = new Map();

// Worker state
let workerInterval = null;
let isProcessing = false;
const POLL_INTERVAL_MS = 5000;   // Check for jobs every 5 seconds
const LOCK_TIMEOUT_MS = 300000;  // 5 min lock timeout (stale job recovery)
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

/**
 * Enqueue a new job
 * @param {string} jobType - The type of job (matches registered handler)
 * @param {object} payload - Job data
 * @param {object} options - { priority, scheduledFor, maxAttempts }
 * @returns {number|null} Job ID or null if DB unavailable
 */
async function enqueue(jobType, payload = {}, options = {}) {
  if (!db.isAvailable()) {
    logger.warn(`[JobQueue] DB not available, cannot enqueue ${jobType}`);
    return null;
  }

  try {
    const result = await db.query(`
      INSERT INTO agent_jobs (job_type, payload, priority, max_attempts, scheduled_for)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      jobType,
      JSON.stringify(payload),
      options.priority || 0,
      options.maxAttempts || 3,
      options.scheduledFor || new Date()
    ]);

    const jobId = result.rows[0].id;
    logger.info(`[JobQueue] Enqueued job #${jobId}: ${jobType}`);
    return jobId;
  } catch (err) {
    logger.error(`[JobQueue] Failed to enqueue ${jobType}:`, err.message);
    return null;
  }
}

/**
 * Register a handler for a job type
 * @param {string} jobType - The job type to handle
 * @param {Function} handler - async function(job) => result
 */
function registerHandler(jobType, handler) {
  handlers.set(jobType, handler);
  logger.info(`[JobQueue] Registered handler for: ${jobType}`);
}

/**
 * Claim and process the next available job
 * Uses SELECT FOR UPDATE SKIP LOCKED for safe concurrent access
 */
async function processNextJob() {
  if (!db.isAvailable() || isProcessing) return false;
  
  isProcessing = true;
  let job = null;
  
  try {
    // Claim a job atomically
    const result = await db.query(`
      UPDATE agent_jobs SET 
        status = 'running',
        locked_by = $1,
        locked_at = NOW(),
        started_at = COALESCE(started_at, NOW()),
        attempts = attempts + 1
      WHERE id = (
        SELECT id FROM agent_jobs
        WHERE status = 'pending'
          AND scheduled_for <= NOW()
        ORDER BY priority DESC, scheduled_for ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `, [WORKER_ID]);

    if (result.rows.length === 0) {
      return false; // No jobs available
    }

    job = result.rows[0];
    logger.info(`[JobQueue] Processing job #${job.id}: ${job.job_type} (attempt ${job.attempts}/${job.max_attempts})`);

    // Find handler
    const handler = handlers.get(job.job_type);
    if (!handler) {
      throw new Error(`No handler registered for job type: ${job.job_type}`);
    }

    // Execute the handler
    const jobResult = await handler(job);

    // Mark as completed
    await db.query(`
      UPDATE agent_jobs SET 
        status = 'completed',
        result = $1,
        completed_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(jobResult || {}), job.id]);

    logger.info(`[JobQueue] Job #${job.id} completed: ${job.job_type}`);
    return true;

  } catch (err) {
    logger.error(`[JobQueue] Job #${job?.id || '?'} failed:`, err.message);

    if (job) {
      // Check if we should retry or dead-letter
      const newStatus = job.attempts >= job.max_attempts ? 'dead_letter' : 'pending';
      
      await db.query(`
        UPDATE agent_jobs SET 
          status = $1,
          error_message = $2,
          locked_by = NULL,
          locked_at = NULL
        WHERE id = $3
      `, [newStatus, err.message, job.id]).catch(() => {});

      if (newStatus === 'dead_letter') {
        logger.error(`[JobQueue] Job #${job.id} moved to dead letter after ${job.attempts} attempts`);
      } else {
        logger.warn(`[JobQueue] Job #${job.id} will retry (${job.attempts}/${job.max_attempts})`);
      }
    }
    return false;
  } finally {
    isProcessing = false;
  }
}

/**
 * Recover stale jobs (locked but never completed — worker crashed)
 */
async function recoverStaleJobs() {
  if (!db.isAvailable()) return;

  try {
    const result = await db.query(`
      UPDATE agent_jobs SET 
        status = 'pending',
        locked_by = NULL,
        locked_at = NULL
      WHERE status = 'running'
        AND locked_at < NOW() - INTERVAL '${LOCK_TIMEOUT_MS / 1000} seconds'
      RETURNING id
    `);

    if (result.rows.length > 0) {
      logger.warn(`[JobQueue] Recovered ${result.rows.length} stale job(s)`);
    }
  } catch (err) {
    logger.error('[JobQueue] Stale job recovery failed:', err.message);
  }
}

/**
 * Start the background worker loop
 */
function startWorker() {
  if (!db.isAvailable()) {
    logger.info('[JobQueue] PostgreSQL not available — worker not started');
    return;
  }

  if (workerInterval) {
    logger.warn('[JobQueue] Worker already running');
    return;
  }

  logger.info(`[JobQueue] Starting worker (poll every ${POLL_INTERVAL_MS / 1000}s, ID: ${WORKER_ID})`);

  // Recover stale jobs on startup
  recoverStaleJobs();

  // Poll for jobs
  workerInterval = setInterval(async () => {
    try {
      // Process jobs in a burst (up to 5 per poll)
      let processed = 0;
      while (processed < 5) {
        const hadJob = await processNextJob();
        if (!hadJob) break;
        processed++;
      }
    } catch (err) {
      logger.error('[JobQueue] Worker poll error:', err.message);
    }
  }, POLL_INTERVAL_MS);

  // Periodic stale job recovery (every 5 minutes)
  setInterval(() => recoverStaleJobs(), 5 * 60 * 1000);
}

/**
 * Stop the worker
 */
function stopWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info('[JobQueue] Worker stopped');
  }
}

/**
 * Get queue status
 */
async function getQueueStatus() {
  if (!db.isAvailable()) return { available: false };

  try {
    const result = await db.query(`
      SELECT status, COUNT(*) as count 
      FROM agent_jobs 
      GROUP BY status
    `);

    const status = { available: true };
    for (const row of result.rows) {
      status[row.status] = parseInt(row.count);
    }
    return status;
  } catch (err) {
    return { available: false, error: err.message };
  }
}

/**
 * Schedule a recurring job (if not already scheduled for that time)
 */
async function scheduleRecurring(jobType, payload, scheduledFor, options = {}) {
  if (!db.isAvailable()) return null;

  try {
    // Check if a pending job of this type already exists for the scheduled time
    const existing = await db.query(`
      SELECT id FROM agent_jobs 
      WHERE job_type = $1 
        AND status = 'pending' 
        AND scheduled_for = $2
    `, [jobType, scheduledFor]);

    if (existing.rows.length > 0) {
      return existing.rows[0].id; // Already scheduled
    }

    return enqueue(jobType, payload, { ...options, scheduledFor });
  } catch (err) {
    logger.error(`[JobQueue] Failed to schedule recurring ${jobType}:`, err.message);
    return null;
  }
}

module.exports = {
  enqueue,
  registerHandler,
  startWorker,
  stopWorker,
  getQueueStatus,
  scheduleRecurring,
  processNextJob,
  recoverStaleJobs,
  WORKER_ID
};

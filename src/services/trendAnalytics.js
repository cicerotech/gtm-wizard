/**
 * trendAnalytics.js
 * 
 * Service for aggregating conversational analytics across meetings.
 * Provides trend analysis, pain point aggregation, objection playbooks,
 * and team performance insights.
 * 
 * @author GTM Brain
 * @date February 2026
 */

const logger = require('../utils/logger');
const Database = require('better-sqlite3');
const path = require('path');

// Initialize SQLite database connection
const dbPath = path.join(process.env.DATA_PATH || './data', 'call_analysis.db');
let db;

try {
  db = new Database(dbPath);
} catch (error) {
  logger.error('Failed to connect to call analysis database', { error: error.message });
}

// ═══════════════════════════════════════════════════════════════════════════
// WEEKLY TREND AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggregate weekly trends for a given scope
 * @param {string} scopeType - 'team', 'rep', 'region', 'account'
 * @param {string} scopeId - Identifier for the scope
 * @returns {Object} Aggregated weekly trends
 */
async function aggregateWeeklyTrends(scopeType, scopeId) {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    
    // Build WHERE clause based on scope
    let whereClause = '';
    let params = [];
    
    switch (scopeType) {
      case 'rep':
        whereClause = 'rep_id = ?';
        params = [scopeId];
        break;
      case 'account':
        whereClause = 'account_id = ?';
        params = [scopeId];
        break;
      case 'region':
        // Region requires joining with user group config - simplified for now
        whereClause = '1=1';
        break;
      case 'team':
      default:
        whereClause = '1=1';
        break;
    }
    
    // This week's metrics
    const thisWeek = db.prepare(`
      SELECT 
        COUNT(*) as call_count,
        AVG(overall_score) as avg_score,
        AVG(talk_ratio_rep) as avg_talk_ratio,
        AVG(CAST(open_question_count AS REAL) / NULLIF(question_count, 0)) as avg_open_question_rate,
        SUM(objection_count) as total_objections,
        AVG(value_articulation_score) as avg_value_score,
        AVG(next_step_clarity) as next_step_rate,
        AVG(sentiment_score) as avg_sentiment,
        SUM(escalation_risk) as escalation_count
      FROM call_analysis
      WHERE ${whereClause}
        AND call_date >= ?
        AND call_date < ?
    `).get(...params, weekAgo.toISOString(), now.toISOString());
    
    // Last week's metrics for comparison
    const lastWeek = db.prepare(`
      SELECT 
        COUNT(*) as call_count,
        AVG(overall_score) as avg_score,
        AVG(talk_ratio_rep) as avg_talk_ratio,
        AVG(CAST(open_question_count AS REAL) / NULLIF(question_count, 0)) as avg_open_question_rate,
        SUM(objection_count) as total_objections,
        AVG(value_articulation_score) as avg_value_score
      FROM call_analysis
      WHERE ${whereClause}
        AND call_date >= ?
        AND call_date < ?
    `).get(...params, twoWeeksAgo.toISOString(), weekAgo.toISOString());
    
    // Calculate trends (week-over-week change)
    const calcTrend = (current, previous) => {
      if (!previous || previous === 0) return 0;
      return ((current - previous) / previous) * 100;
    };
    
    // Aggregate pain points from this week
    const topPainPoints = await getTopPainPoints(scopeType, scopeId, 7);
    
    // Aggregate objections
    const topObjections = await getTopObjections(scopeType, scopeId, 7);
    
    // Aggregate topics
    const trendingTopics = await getTrendingTopics(scopeType, scopeId, 7);
    
    const trends = {
      periodStart: weekAgo.toISOString(),
      periodEnd: now.toISOString(),
      scopeType,
      scopeId,
      
      // Core metrics
      callCount: thisWeek?.call_count || 0,
      avgScore: thisWeek?.avg_score || 0,
      avgTalkRatio: thisWeek?.avg_talk_ratio || 0,
      avgOpenQuestionRate: thisWeek?.avg_open_question_rate || 0,
      avgValueScore: thisWeek?.avg_value_score || 0,
      nextStepRate: thisWeek?.next_step_rate || 0,
      avgSentiment: thisWeek?.avg_sentiment || 0,
      escalationCount: thisWeek?.escalation_count || 0,
      
      // Trends (percentage change)
      scoreTrend: calcTrend(thisWeek?.avg_score, lastWeek?.avg_score),
      talkRatioTrend: calcTrend(thisWeek?.avg_talk_ratio, lastWeek?.avg_talk_ratio),
      questionRateTrend: calcTrend(thisWeek?.avg_open_question_rate, lastWeek?.avg_open_question_rate),
      valueScoreTrend: calcTrend(thisWeek?.avg_value_score, lastWeek?.avg_value_score),
      
      // Aggregated insights
      topPainPoints,
      topObjections,
      trendingTopics,
      
      generatedAt: new Date().toISOString()
    };
    
    // Store in conversation_trends table
    storeTrends(trends);
    
    return trends;
    
  } catch (error) {
    logger.error('Error aggregating weekly trends:', error);
    return { error: error.message };
  }
}

/**
 * Store aggregated trends in database
 */
function storeTrends(trends) {
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO conversation_trends (
        id, period_start, period_end, scope_type, scope_id,
        avg_talk_ratio, talk_ratio_trend,
        avg_open_question_rate, question_rate_trend,
        top_objections_json, objection_handle_rate_trend,
        trending_topics_json, emerging_topics_json,
        top_pain_points_json, avg_score, score_trend
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const id = `${trends.scopeType}_${trends.scopeId}_${trends.periodStart.split('T')[0]}`;
    
    stmt.run(
      id,
      trends.periodStart,
      trends.periodEnd,
      trends.scopeType,
      trends.scopeId,
      trends.avgTalkRatio,
      trends.talkRatioTrend,
      trends.avgOpenQuestionRate,
      trends.questionRateTrend,
      JSON.stringify(trends.topObjections),
      0, // TODO: Calculate objection handle rate trend
      JSON.stringify(trends.trendingTopics),
      JSON.stringify([]), // TODO: Calculate emerging topics
      JSON.stringify(trends.topPainPoints),
      trends.avgScore,
      trends.scoreTrend
    );
    
  } catch (error) {
    logger.error('Error storing trends:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PAIN POINT AGGREGATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get top pain points across calls
 * @param {string} scopeType - 'team', 'rep', 'region', 'account'
 * @param {string} scopeId - Identifier for the scope
 * @param {number} days - Number of days to look back
 * @returns {Array} Aggregated and ranked pain points
 */
async function getTopPainPoints(scopeType, scopeId, days = 30) {
  try {
    // Build WHERE clause
    let whereClause = 'pain_points_json IS NOT NULL';
    const params = [];
    
    if (scopeType === 'rep') {
      whereClause += ' AND rep_id = ?';
      params.push(scopeId);
    } else if (scopeType === 'account') {
      whereClause += ' AND account_id = ?';
      params.push(scopeId);
    }
    
    params.push(`-${days} days`);
    
    const rows = db.prepare(`
      SELECT pain_points_json, account_name, call_date
      FROM call_analysis
      WHERE ${whereClause}
        AND call_date >= datetime('now', ?)
    `).all(...params);
    
    // Aggregate pain points
    const aggregated = {};
    
    for (const row of rows) {
      try {
        const painPoints = JSON.parse(row.pain_points_json);
        if (!Array.isArray(painPoints)) continue;
        
        for (const pp of painPoints) {
          const key = normalizeString(pp.description || pp.painPoint || '');
          if (!key) continue;
          
          if (!aggregated[key]) {
            aggregated[key] = {
              painPoint: pp.description || pp.painPoint,
              category: pp.category || 'unknown',
              count: 0,
              accounts: new Set(),
              quotes: [],
              severities: []
            };
          }
          
          aggregated[key].count++;
          aggregated[key].accounts.add(row.account_name);
          if (pp.quote) aggregated[key].quotes.push(pp.quote);
          if (pp.severity) aggregated[key].severities.push(pp.severity);
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }
    
    // Convert to array and sort by count
    return Object.values(aggregated)
      .map(pp => ({
        painPoint: pp.painPoint,
        category: pp.category,
        count: pp.count,
        accountCount: pp.accounts.size,
        accounts: [...pp.accounts].slice(0, 5),
        exampleQuotes: pp.quotes.slice(0, 3),
        averageSeverity: calculateAverageSeverity(pp.severities)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
  } catch (error) {
    logger.error('Error getting top pain points:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OBJECTION PLAYBOOK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get top objections with handling success rates
 * @param {string} scopeType - 'team', 'rep', 'region', 'account'
 * @param {string} scopeId - Identifier for the scope
 * @param {number} days - Number of days to look back
 * @returns {Array} Objection playbook with handling rates
 */
async function getTopObjections(scopeType, scopeId, days = 90) {
  try {
    let whereClause = 'full_analysis_json IS NOT NULL';
    const params = [];
    
    if (scopeType === 'rep') {
      whereClause += ' AND rep_id = ?';
      params.push(scopeId);
    }
    
    params.push(`-${days} days`);
    
    const rows = db.prepare(`
      SELECT full_analysis_json, rep_name, account_name
      FROM call_analysis
      WHERE ${whereClause}
        AND call_date >= datetime('now', ?)
    `).all(...params);
    
    // Aggregate objections
    const aggregated = {};
    
    for (const row of rows) {
      try {
        const analysis = JSON.parse(row.full_analysis_json);
        const objections = analysis?.metrics?.objections || [];
        
        for (const obj of objections) {
          const key = normalizeString(obj.objection || '');
          if (!key) continue;
          
          if (!aggregated[key]) {
            aggregated[key] = {
              objection: obj.objection,
              totalCount: 0,
              handledCount: 0,
              responses: [],
              reps: new Set()
            };
          }
          
          aggregated[key].totalCount++;
          if (obj.handled) {
            aggregated[key].handledCount++;
            if (obj.handling) {
              aggregated[key].responses.push({
                response: obj.handling,
                rep: row.rep_name
              });
            }
          }
          aggregated[key].reps.add(row.rep_name);
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }
    
    // Convert to array with handle rates
    return Object.values(aggregated)
      .map(obj => ({
        objection: obj.objection,
        count: obj.totalCount,
        handleRate: obj.totalCount > 0 ? (obj.handledCount / obj.totalCount) : 0,
        handleRatePercent: obj.totalCount > 0 
          ? Math.round((obj.handledCount / obj.totalCount) * 100) 
          : 0,
        bestResponses: obj.responses.slice(0, 3),
        repCount: obj.reps.size
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
  } catch (error) {
    logger.error('Error getting objection playbook:', error);
    return [];
  }
}

/**
 * Get full objection playbook with best practices
 * @param {string} scopeType - 'team', 'rep', 'region'
 * @param {string} scopeId - Identifier
 * @param {number} days - Days to look back
 * @returns {Object} Comprehensive objection playbook
 */
async function getObjectionPlaybook(scopeType, scopeId, days = 90) {
  const objections = await getTopObjections(scopeType, scopeId, days);
  
  return {
    generatedAt: new Date().toISOString(),
    period: `Last ${days} days`,
    scope: { type: scopeType, id: scopeId },
    totalObjections: objections.reduce((sum, o) => sum + o.count, 0),
    avgHandleRate: objections.length > 0
      ? Math.round(objections.reduce((sum, o) => sum + o.handleRatePercent, 0) / objections.length)
      : 0,
    objections: objections.map(o => ({
      ...o,
      // Add coaching insight
      coachingNote: o.handleRatePercent < 50 
        ? 'Needs improvement - review best practices'
        : o.handleRatePercent < 75
          ? 'Moderate success - consider additional training'
          : 'Strong handling - share best practices with team'
    }))
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TOPIC TRENDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get trending topics from recent calls
 * @param {string} scopeType - 'team', 'rep', 'region', 'account'
 * @param {string} scopeId - Identifier
 * @param {number} days - Days to look back
 * @returns {Array} Trending topics with counts
 */
async function getTrendingTopics(scopeType, scopeId, days = 14) {
  try {
    let whereClause = 'key_topics IS NOT NULL';
    const params = [];
    
    if (scopeType === 'rep') {
      whereClause += ' AND rep_id = ?';
      params.push(scopeId);
    }
    
    params.push(`-${days} days`);
    
    const rows = db.prepare(`
      SELECT key_topics, keywords_json
      FROM call_analysis
      WHERE ${whereClause}
        AND call_date >= datetime('now', ?)
    `).all(...params);
    
    const topicCounts = {};
    
    for (const row of rows) {
      // Parse key_topics
      try {
        const topics = JSON.parse(row.key_topics);
        if (Array.isArray(topics)) {
          for (const topic of topics) {
            const key = normalizeString(topic);
            if (!key) continue;
            topicCounts[key] = (topicCounts[key] || 0) + 1;
          }
        }
      } catch (e) {}
      
      // Parse keywords
      try {
        const keywords = JSON.parse(row.keywords_json);
        if (Array.isArray(keywords)) {
          for (const kw of keywords) {
            const key = normalizeString(kw.term || kw);
            if (!key) continue;
            topicCounts[key] = (topicCounts[key] || 0) + (kw.count || 1);
          }
        }
      } catch (e) {}
    }
    
    return Object.entries(topicCounts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    
  } catch (error) {
    logger.error('Error getting trending topics:', error);
    return [];
  }
}

/**
 * Get emerging topics (new in recent period vs older period)
 * @param {string} scopeType - Scope type
 * @param {string} scopeId - Scope identifier
 * @param {number} recentDays - Recent period days
 * @param {number} comparisonDays - Comparison period days
 * @returns {Array} Topics that are new/emerging
 */
async function getEmergingTopics(scopeType, scopeId, recentDays = 14, comparisonDays = 30) {
  const recentTopics = await getTrendingTopics(scopeType, scopeId, recentDays);
  const olderTopics = await getTrendingTopics(scopeType, scopeId, comparisonDays);
  
  const olderTopicSet = new Set(olderTopics.map(t => t.topic));
  
  // Topics in recent that weren't in older period
  return recentTopics
    .filter(t => !olderTopicSet.has(t.topic))
    .slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════════════════
// REP PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get rep performance metrics and trends
 * @param {string} repEmail - Rep's email
 * @param {number} days - Days to look back
 * @returns {Object} Rep performance data
 */
async function getRepPerformance(repEmail, days = 30) {
  try {
    const metrics = db.prepare(`
      SELECT 
        COUNT(*) as call_count,
        AVG(overall_score) as avg_score,
        AVG(talk_ratio_rep) as avg_talk_ratio,
        AVG(question_count) as avg_questions,
        AVG(CAST(open_question_count AS REAL) / NULLIF(question_count, 0)) as open_question_rate,
        SUM(objection_count) as total_objections,
        AVG(value_articulation_score) as avg_value_score,
        AVG(next_step_clarity) as next_step_rate,
        MIN(call_date) as first_call,
        MAX(call_date) as last_call
      FROM call_analysis
      WHERE rep_id = ?
        AND call_date >= datetime('now', ?)
    `).get(repEmail, `-${days} days`);
    
    // Get team average for comparison
    const teamAvg = db.prepare(`
      SELECT 
        AVG(overall_score) as avg_score,
        AVG(talk_ratio_rep) as avg_talk_ratio,
        AVG(CAST(open_question_count AS REAL) / NULLIF(question_count, 0)) as open_question_rate,
        AVG(value_articulation_score) as avg_value_score
      FROM call_analysis
      WHERE call_date >= datetime('now', ?)
    `).get(`-${days} days`);
    
    // Get recent calls
    const recentCalls = db.prepare(`
      SELECT id, call_date, account_name, overall_score, coaching_summary
      FROM call_analysis
      WHERE rep_id = ?
        AND call_date >= datetime('now', ?)
      ORDER BY call_date DESC
      LIMIT 5
    `).all(repEmail, `-${days} days`);
    
    return {
      repEmail,
      period: `Last ${days} days`,
      metrics: {
        callCount: metrics?.call_count || 0,
        avgScore: Math.round((metrics?.avg_score || 0) * 10) / 10,
        avgTalkRatio: Math.round((metrics?.avg_talk_ratio || 0) * 100),
        avgQuestions: Math.round(metrics?.avg_questions || 0),
        openQuestionRate: Math.round((metrics?.open_question_rate || 0) * 100),
        totalObjections: metrics?.total_objections || 0,
        avgValueScore: Math.round((metrics?.avg_value_score || 0) * 10) / 10,
        nextStepRate: Math.round((metrics?.next_step_rate || 0) * 100)
      },
      comparison: {
        scoreVsTeam: Math.round(((metrics?.avg_score || 0) - (teamAvg?.avg_score || 0)) * 10) / 10,
        talkRatioVsTeam: Math.round(((metrics?.avg_talk_ratio || 0) - (teamAvg?.avg_talk_ratio || 0)) * 100),
        valueScoreVsTeam: Math.round(((metrics?.avg_value_score || 0) - (teamAvg?.avg_value_score || 0)) * 10) / 10
      },
      recentCalls,
      generatedAt: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error('Error getting rep performance:', error);
    return { error: error.message };
  }
}

/**
 * Get team leaderboard
 * @param {number} days - Days to look back
 * @returns {Array} Ranked team members
 */
async function getTeamLeaderboard(days = 30) {
  try {
    return db.prepare(`
      SELECT 
        rep_id,
        rep_name,
        COUNT(*) as call_count,
        AVG(overall_score) as avg_score,
        AVG(value_articulation_score) as avg_value_score,
        AVG(next_step_clarity) as next_step_rate,
        SUM(CASE WHEN escalation_risk = 1 THEN 1 ELSE 0 END) as escalations
      FROM call_analysis
      WHERE call_date >= datetime('now', ?)
        AND rep_id IS NOT NULL
      GROUP BY rep_id, rep_name
      ORDER BY avg_score DESC
    `).all(`-${days} days`).map((row, idx) => ({
      rank: idx + 1,
      repId: row.rep_id,
      repName: row.rep_name,
      callCount: row.call_count,
      avgScore: Math.round((row.avg_score || 0) * 10) / 10,
      avgValueScore: Math.round((row.avg_value_score || 0) * 10) / 10,
      nextStepRate: Math.round((row.next_step_rate || 0) * 100),
      escalations: row.escalations || 0
    }));
    
  } catch (error) {
    logger.error('Error getting team leaderboard:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER HEALTH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get customer health metrics for an account
 * @param {string} accountId - Salesforce Account ID
 * @returns {Object} Customer health data
 */
async function getCustomerHealth(accountId) {
  try {
    const metrics = db.prepare(`
      SELECT 
        COUNT(*) as call_count,
        AVG(sentiment_score) as avg_sentiment,
        SUM(escalation_risk) as escalation_count,
        MAX(call_date) as last_call,
        health_indicators_json,
        feature_requests_json,
        adoption_blockers_json
      FROM call_analysis
      WHERE account_id = ?
        AND call_date >= datetime('now', '-90 days')
      GROUP BY account_id
    `).get(accountId);
    
    if (!metrics) {
      return { accountId, noData: true };
    }
    
    // Parse JSON fields
    let healthIndicators = {};
    let featureRequests = [];
    let adoptionBlockers = [];
    
    try {
      healthIndicators = JSON.parse(metrics.health_indicators_json || '{}');
    } catch (e) {}
    try {
      featureRequests = JSON.parse(metrics.feature_requests_json || '[]');
    } catch (e) {}
    try {
      adoptionBlockers = JSON.parse(metrics.adoption_blockers_json || '[]');
    } catch (e) {}
    
    // Calculate health score
    let healthScore = 50; // Neutral baseline
    healthScore += (metrics.avg_sentiment || 0) * 25; // -25 to +25
    healthScore -= metrics.escalation_count * 10; // -10 per escalation
    healthScore = Math.max(0, Math.min(100, healthScore));
    
    return {
      accountId,
      callCount: metrics.call_count,
      lastCall: metrics.last_call,
      sentiment: {
        average: Math.round((metrics.avg_sentiment || 0) * 100) / 100,
        label: metrics.avg_sentiment >= 0.3 ? 'positive' 
             : metrics.avg_sentiment <= -0.3 ? 'negative' 
             : 'neutral'
      },
      escalations: metrics.escalation_count || 0,
      healthScore: Math.round(healthScore),
      healthStatus: healthScore >= 70 ? 'healthy' 
                  : healthScore >= 40 ? 'at_risk' 
                  : 'critical',
      featureRequests,
      adoptionBlockers,
      healthIndicators,
      generatedAt: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error('Error getting customer health:', error);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize string for comparison
 */
function normalizeString(str) {
  return (str || '').toLowerCase().trim().replace(/[^\w\s]/g, '');
}

/**
 * Calculate average severity from severity strings
 */
function calculateAverageSeverity(severities) {
  if (!severities || severities.length === 0) return 'medium';
  
  const scores = severities.map(s => {
    if (s === 'high' || s === 'blocking' || s === 'critical') return 3;
    if (s === 'medium' || s === 'annoying') return 2;
    return 1;
  });
  
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 2.5) return 'high';
  if (avg >= 1.5) return 'medium';
  return 'low';
}

module.exports = {
  // Weekly trends
  aggregateWeeklyTrends,
  
  // Pain points
  getTopPainPoints,
  
  // Objections
  getTopObjections,
  getObjectionPlaybook,
  
  // Topics
  getTrendingTopics,
  getEmergingTopics,
  
  // Rep performance
  getRepPerformance,
  getTeamLeaderboard,
  
  // Customer health
  getCustomerHealth
};

/**
 * analytics.js
 * 
 * API routes for conversational analytics.
 * Provides endpoints for team trends, pain points, objection playbooks,
 * rep performance, and customer health.
 * 
 * @author GTM Brain
 * @date February 2026
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const trendAnalytics = require('../services/trendAnalytics');

// ═══════════════════════════════════════════════════════════════════════════
// USER GROUP HELPERS (imported from main app config)
// ═══════════════════════════════════════════════════════════════════════════

const SALES_LEADERS = {
  'mitchell.loquaci@eudia.com': { name: 'Mitchell Loquaci', region: 'US', role: 'RVP Sales' },
  'stephen.mulholland@eudia.com': { name: 'Stephen Mulholland', region: 'EMEA', role: 'VP Sales' },
  'riona.mchale@eudia.com': { name: 'Riona McHale', region: 'IRE_UK', role: 'Head of Sales' }
};

const BL_REGIONS = {
  'US': [
    'asad.hussain@eudia.com', 'nathan.shine@eudia.com', 'julie.stefanich@eudia.com',
    'olivia@eudia.com', 'ananth@eudia.com', 'ananth.cherukupally@eudia.com',
    'justin.hills@eudia.com', 'mike.masiello@eudia.com', 'mike@eudia.com',
    'sean.boyd@eudia.com', 'riley.stack@eudia.com'
  ],
  'EMEA': [
    'greg.machale@eudia.com', 'tom.clancy@eudia.com', 'nicola.fratini@eudia.com',
    'stephen.mulholland@eudia.com'
  ],
  'IRE_UK': [
    'conor.molloy@eudia.com', 'alex.fox@eudia.com', 'emer.flynn@eudia.com',
    'riona.mchale@eudia.com'
  ]
};

const ADMIN_EMAILS = ['keigan.pesenti@eudia.com', 'michael.ayers@eudia.com', 'zach@eudia.com'];
const EXEC_EMAILS = ['omar@eudia.com', 'david@eudia.com', 'ashish@eudia.com'];

function isManagerOrAdmin(email) {
  const normalized = (email || '').toLowerCase().trim();
  return ADMIN_EMAILS.includes(normalized) || 
         EXEC_EMAILS.includes(normalized) ||
         normalized in SALES_LEADERS;
}

function getRegionForManager(email) {
  const normalized = (email || '').toLowerCase().trim();
  return SALES_LEADERS[normalized]?.region || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEAM TRENDS ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/analytics/team-trends
 * Get aggregated trends for a team/region
 * 
 * Query params:
 * - managerId: Manager's email (required for region-scoped data)
 * - period: 'week' | 'month' (default: week)
 */
router.get('/team-trends', async (req, res) => {
  try {
    const managerId = (req.query.managerId || '').toLowerCase().trim();
    const period = req.query.period || 'week';
    
    // Validate access
    if (managerId && !isManagerOrAdmin(managerId)) {
      return res.status(403).json({
        success: false,
        error: 'Manager or admin access required'
      });
    }
    
    // Determine scope
    const region = getRegionForManager(managerId);
    const scopeType = region ? 'region' : 'team';
    const scopeId = region || 'all';
    
    const days = period === 'month' ? 30 : 7;
    const trends = await trendAnalytics.aggregateWeeklyTrends(scopeType, scopeId);
    
    res.json({
      success: true,
      managerId,
      region,
      period,
      trends
    });
    
  } catch (error) {
    logger.error('Error in team-trends endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// REP PERFORMANCE ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/analytics/rep-performance/:email
 * Get individual rep coaching metrics and trends
 * 
 * Query params:
 * - days: Number of days to look back (default: 30)
 */
router.get('/rep-performance/:email', async (req, res) => {
  try {
    const repEmail = (req.params.email || '').toLowerCase().trim();
    const days = parseInt(req.query.days) || 30;
    
    if (!repEmail) {
      return res.status(400).json({
        success: false,
        error: 'Rep email required'
      });
    }
    
    const performance = await trendAnalytics.getRepPerformance(repEmail, days);
    
    res.json({
      success: true,
      ...performance
    });
    
  } catch (error) {
    logger.error('Error in rep-performance endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PAIN POINTS ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/analytics/pain-points
 * Get aggregated pain points with example quotes
 * 
 * Query params:
 * - scope: 'team' | 'region' | 'rep' | 'account' (default: team)
 * - scopeId: Identifier for the scope
 * - category: Filter by category (optional)
 * - days: Number of days (default: 30)
 */
router.get('/pain-points', async (req, res) => {
  try {
    const scope = req.query.scope || 'team';
    const scopeId = req.query.scopeId || 'all';
    const days = parseInt(req.query.days) || 30;
    const category = req.query.category;
    
    let painPoints = await trendAnalytics.getTopPainPoints(scope, scopeId, days);
    
    // Filter by category if specified
    if (category) {
      painPoints = painPoints.filter(pp => pp.category === category);
    }
    
    res.json({
      success: true,
      scope,
      scopeId,
      period: `Last ${days} days`,
      count: painPoints.length,
      painPoints
    });
    
  } catch (error) {
    logger.error('Error in pain-points endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// OBJECTION PLAYBOOK ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/analytics/objection-playbook
 * Get objections with handling success rates and best responses
 * 
 * Query params:
 * - scope: 'team' | 'rep' (default: team)
 * - scopeId: Rep email if scope is 'rep'
 * - days: Number of days (default: 90)
 */
router.get('/objection-playbook', async (req, res) => {
  try {
    const scope = req.query.scope || 'team';
    const scopeId = req.query.scopeId || 'all';
    const days = parseInt(req.query.days) || 90;
    
    const playbook = await trendAnalytics.getObjectionPlaybook(scope, scopeId, days);
    
    res.json({
      success: true,
      ...playbook
    });
    
  } catch (error) {
    logger.error('Error in objection-playbook endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER HEALTH ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/analytics/customer-health
 * Get customer health metrics for an account
 * 
 * Query params:
 * - accountId: Salesforce Account ID (required)
 */
router.get('/customer-health', async (req, res) => {
  try {
    const accountId = req.query.accountId;
    
    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'accountId query parameter required'
      });
    }
    
    const health = await trendAnalytics.getCustomerHealth(accountId);
    
    res.json({
      success: true,
      ...health
    });
    
  } catch (error) {
    logger.error('Error in customer-health endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEAM LEADERBOARD ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/analytics/leaderboard
 * Get team performance leaderboard
 * 
 * Query params:
 * - days: Number of days (default: 30)
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    
    const leaderboard = await trendAnalytics.getTeamLeaderboard(days);
    
    res.json({
      success: true,
      period: `Last ${days} days`,
      leaderboard
    });
    
  } catch (error) {
    logger.error('Error in leaderboard endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TRENDING TOPICS ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/analytics/trending-topics
 * Get trending topics from recent calls
 * 
 * Query params:
 * - days: Number of days (default: 14)
 * - includeEmerging: Include emerging topics (default: true)
 */
router.get('/trending-topics', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14;
    const includeEmerging = req.query.includeEmerging !== 'false';
    
    const trending = await trendAnalytics.getTrendingTopics('team', 'all', days);
    
    let emerging = [];
    if (includeEmerging) {
      emerging = await trendAnalytics.getEmergingTopics('team', 'all', days, 30);
    }
    
    res.json({
      success: true,
      period: `Last ${days} days`,
      trending,
      emerging
    });
    
  } catch (error) {
    logger.error('Error in trending-topics endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// AT-RISK ACCOUNTS ENDPOINT (for CS)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/analytics/at-risk-accounts
 * Get accounts with escalation risk indicators
 */
router.get('/at-risk-accounts', async (req, res) => {
  try {
    // This would query accounts with high escalation risk
    // For now, return a placeholder - would need account list integration
    
    res.json({
      success: true,
      message: 'At-risk accounts endpoint - requires account list integration',
      atRiskAccounts: []
    });
    
  } catch (error) {
    logger.error('Error in at-risk-accounts endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

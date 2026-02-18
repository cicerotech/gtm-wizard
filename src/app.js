require('dotenv').config();
const { App } = require('@slack/bolt');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('./utils/logger');
const { initializeRedis } = require('./utils/cache');
const { initializeSalesforce, sfConnection, getAuthRateLimitStatus, resetCircuitBreaker } = require('./salesforce/connection');
const { initializeEmail } = require('./utils/emailService');
const { Issuer, generators } = require('openid-client');

// ═══════════════════════════════════════════════════════════════════════════
// OKTA SSO CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
let oktaClient = null;
const OKTA_ISSUER = process.env.OKTA_ISSUER || 'https://okta.eudia.com';
const OKTA_CLIENT_ID = process.env.OKTA_CLIENT_ID;
const OKTA_CLIENT_SECRET = process.env.OKTA_CLIENT_SECRET;
const OKTA_REDIRECT_URI = process.env.OKTA_REDIRECT_URI || 'https://gtm-wizard.onrender.com/auth/callback';

// Initialize Okta client (lazy loading)
async function getOktaClient() {
  if (oktaClient) return oktaClient;
  
  if (!OKTA_CLIENT_ID || !OKTA_CLIENT_SECRET) {
    logger.warn('Okta SSO not configured - missing OKTA_CLIENT_ID or OKTA_CLIENT_SECRET');
    return null;
  }
  
  try {
    const issuer = await Issuer.discover(OKTA_ISSUER);
    oktaClient = new issuer.Client({
      client_id: OKTA_CLIENT_ID,
      client_secret: OKTA_CLIENT_SECRET,
      redirect_uris: [OKTA_REDIRECT_URI],
      response_types: ['code']
    });
    logger.info('✅ Okta SSO client initialized');
    return oktaClient;
  } catch (error) {
    logger.error('Failed to initialize Okta client:', error.message);
    return null;
  }
}

// Import handlers
const { registerSlashCommands } = require('./slack/commands');
const { registerEventHandlers, registerIntelActionHandlers } = require('./slack/events');
const { registerInteractiveHandlers } = require('./slack/interactive');
const { startScheduledJobs } = require('./slack/scheduled');
const { scheduleWeeklyReport } = require('./slack/weeklyReport');

// Channel Intelligence Scraper
const channelIntelligence = require('./services/channelIntelligence');
const channelMonitor = require('./slack/channelMonitor');
const intelligenceDigest = require('./slack/intelligenceDigest');

// Telemetry Store for admin debugging
const telemetryStore = require('./services/telemetryStore');

// Usage Logger for GTM site analytics
const usageLogger = require('./services/usageLogger');

// ═══════════════════════════════════════════════════════════════════════════
// USER GROUP CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Admin email list for protected endpoints
const ADMIN_EMAILS = [
  'keigan.pesenti@eudia.com',
  'michael.ayers@eudia.com',
  'zach@eudia.com'
];

// Exec users - treated as admin for account visibility
const EXEC_EMAILS = [
  'omar@eudia.com',
  'david@eudia.com',
  'ashish@eudia.com',
  'siddharth.saxena@eudia.com'
];

// Sales Leaders with their regions
const SALES_LEADERS = {
  'mitchell.loquaci@eudia.com': { name: 'Mitchell Loquaci', region: 'US', role: 'RVP Sales' },
  'stephen.mulholland@eudia.com': { name: 'Stephen Mulholland', region: 'EMEA', role: 'VP Sales' },
  'riona.mchale@eudia.com': { name: 'Riona McHale', region: 'IRE_UK', role: 'Head of Sales' }
};

// Explicit direct reports for Sales Leaders (overrides region-based lookup)
// This ensures managers see exactly their direct reports' accounts
const SALES_LEADER_DIRECT_REPORTS = {
  'mitchell.loquaci@eudia.com': [
    'asad.hussain@eudia.com',
    'julie.stefanich@eudia.com',
    'olivia@eudia.com',
    'ananth@eudia.com',
    'ananth.cherukupally@eudia.com',
    'justin.hills@eudia.com',
    'mike.masiello@eudia.com',
    'mike@eudia.com',
    'sean.boyd@eudia.com',
    'riley.stack@eudia.com',
    'rajeev.patel@eudia.com'
  ],
  'stephen.mulholland@eudia.com': [
    'greg.machale@eudia.com',
    'tom.clancy@eudia.com',
    'conor.molloy@eudia.com',
    'nathan.shine@eudia.com',
    'nicola.fratini@eudia.com'
  ],
  'riona.mchale@eudia.com': [
    'conor.molloy@eudia.com',
    'alex.fox@eudia.com',
    'emer.flynn@eudia.com'
  ]
};

// Pod-view users: specific BLs who get the full pod/region view (like sales leaders)
// Maps email -> region to determine which pod's accounts they see
const POD_VIEW_USERS = {
  'sean.boyd@eudia.com': 'US',
  'riley.stack@eudia.com': 'US',
  'rajeev.patel@eudia.com': 'US'
};

// Customer Success team
const CS_EMAILS = [
  'nikhita.godiwala@eudia.com',
  'jon.dedych@eudia.com',
  'farah.haddad@eudia.com'
];

// Business Lead region mapping (for Sales Leader roll-ups)
const BL_REGIONS = {
  'US': [
    'asad.hussain@eudia.com', 'julie.stefanich@eudia.com',
    'olivia@eudia.com', 'ananth@eudia.com', 'ananth.cherukupally@eudia.com',
    'justin.hills@eudia.com', 'mike.masiello@eudia.com', 'mike@eudia.com',
    'sean.boyd@eudia.com', 'riley.stack@eudia.com', 'rajeev.patel@eudia.com'
  ],
  'EMEA': [
    'greg.machale@eudia.com', 'tom.clancy@eudia.com', 'nicola.fratini@eudia.com',
    'nathan.shine@eudia.com', 'stephen.mulholland@eudia.com'
  ],
  'IRE_UK': [
    'conor.molloy@eudia.com', 'alex.fox@eudia.com', 'emer.flynn@eudia.com',
    'riona.mchale@eudia.com'
  ]
};

/**
 * Get user group for an email
 */
function getUserGroup(email) {
  const normalized = (email || '').toLowerCase().trim();
  if (ADMIN_EMAILS.includes(normalized)) return 'admin';
  if (EXEC_EMAILS.includes(normalized)) return 'exec';
  if (normalized in SALES_LEADERS) return 'sales_leader';
  if (CS_EMAILS.includes(normalized)) return 'cs';
  return 'bl';
}

/**
 * Get sales leader region
 */
function getSalesLeaderRegion(email) {
  const normalized = (email || '').toLowerCase().trim();
  return SALES_LEADERS[normalized]?.region || null;
}

/**
 * Get BL emails for a region
 */
function getRegionBLEmails(region) {
  return BL_REGIONS[region] || [];
}

/**
 * Get direct reports for a sales leader (explicit mapping takes precedence over region)
 */
function getSalesLeaderDirectReports(email) {
  const normalized = (email || '').toLowerCase().trim();
  
  // First check explicit direct reports mapping
  if (SALES_LEADER_DIRECT_REPORTS[normalized]) {
    return SALES_LEADER_DIRECT_REPORTS[normalized];
  }
  
  // Fall back to region-based lookup
  const region = getSalesLeaderRegion(normalized);
  return region ? getRegionBLEmails(region) : [];
}

/**
 * Check if user has full account access (admin or exec)
 */
function hasFullAccountAccess(email) {
  const group = getUserGroup(email);
  return group === 'admin' || group === 'exec';
}

/**
 * Find the sales leader a BL reports to (if any).
 * Returns { leaderEmail, teamEmails } or null.
 */
function getTeamForBL(email) {
  const normalized = (email || '').toLowerCase().trim();
  for (const [leaderEmail, reports] of Object.entries(SALES_LEADER_DIRECT_REPORTS)) {
    if (reports.includes(normalized)) {
      return { leaderEmail, teamEmails: reports };
    }
  }
  return null;
}

/**
 * Format enrichment data into structured markdown for Obsidian subnotes.
 * Reuses the same Salesforce data shapes returned by intelligenceQueryService functions.
 */
function formatEnrichmentMarkdown(details, contacts, opportunities, tasks, events) {
  const result = {};

  // ── Contacts.md content ──
  if (contacts && contacts.length > 0) {
    const rows = contacts
      .filter(c => c.name)
      .map(c => `| ${c.name || ''} | ${c.title || ''} | ${c.email || ''} | ${c.phone || ''} |`);
    result.contacts = [
      '| Name | Title | Email | Phone |',
      '|------|-------|-------|-------|',
      ...rows
    ].join('\n');
  } else {
    result.contacts = '*No contacts found in Salesforce for this account.*';
  }

  // ── Intelligence.md content ──
  const intel = [];
  if (details) {
    intel.push('## Company Overview');
    if (details.industry) intel.push(`**Industry:** ${details.industry}`);
    if (details.website) intel.push(`**Website:** ${details.website}`);
    if (details.location) intel.push(`**Location:** ${details.location}`);
    if (details.type) intel.push(`**Customer Type:** ${details.type}${details.subtype ? ` / ${details.subtype}` : ''}`);
    if (details.legalDeptSize) intel.push(`**Legal Department Size:** ${details.legalDeptSize}`);
    if (details.cloEngaged) intel.push(`**CLO Engaged:** ${details.cloEngaged}`);
    if (details.description) intel.push(`\n> ${details.description.substring(0, 500)}`);
    intel.push('');

    if (details.painPoints) {
      intel.push('## Pain Points');
      intel.push(details.painPoints);
      intel.push('');
    }
    if (details.competitiveLandscape) {
      intel.push('## Competitive Intelligence');
      intel.push(details.competitiveLandscape);
      intel.push('');
    }
    if (details.keyDecisionMakers) {
      intel.push('## Key Decision Makers');
      intel.push(details.keyDecisionMakers);
      intel.push('');
    }
    if (details.accountPlan) {
      intel.push('## Account Plan');
      intel.push(details.accountPlan);
      intel.push('');
    }
  }
  result.intelligence = intel.length > 1 ? intel.join('\n') : '*No intelligence data found in Salesforce for this account.*';

  // ── Opportunities section ──
  if (opportunities && opportunities.length > 0) {
    const openOpps = opportunities.filter(o => !o.isClosed);
    const closedWon = opportunities.filter(o => o.isClosed && o.isWon);
    const lines = [];

    if (openOpps.length > 0) {
      lines.push('## Open Opportunities');
      lines.push('| Opportunity | Stage | ACV | Close Date | Product | Next Step |');
      lines.push('|------------|-------|-----|------------|---------|-----------|');
      for (const o of openOpps) {
        const acv = o.acv ? `$${Number(o.acv).toLocaleString()}` : '';
        const close = o.closeDate ? o.closeDate.split('T')[0] : '';
        lines.push(`| ${o.name || ''} | ${o.stage || ''} | ${acv} | ${close} | ${o.productLine || ''} | ${o.nextStep || ''} |`);
      }
      lines.push('');
    }

    if (closedWon.length > 0) {
      lines.push('## Closed Won');
      lines.push('| Opportunity | ACV | Close Date | Product |');
      lines.push('|------------|-----|------------|---------|');
      for (const o of closedWon) {
        const acv = o.acv ? `$${Number(o.acv).toLocaleString()}` : '';
        const close = o.closeDate ? o.closeDate.split('T')[0] : '';
        lines.push(`| ${o.name || ''} | ${acv} | ${close} | ${o.productLine || ''} |`);
      }
      lines.push('');
    }

    result.opportunities = lines.join('\n');
  } else {
    result.opportunities = '*No opportunities found in Salesforce for this account.*';
  }

  // ── Next Steps / Tasks ──
  if (tasks && tasks.length > 0) {
    const openTasks = tasks.filter(t => t.status !== 'Completed');
    const completedTasks = tasks.filter(t => t.status === 'Completed');
    const lines = [];

    if (openTasks.length > 0) {
      lines.push('## Active Action Items');
      for (const t of openTasks) {
        const date = t.date ? ` (Due: ${t.date.split('T')[0]})` : '';
        const owner = t.owner ? ` — ${t.owner}` : '';
        lines.push(`- [ ] ${t.subject || 'Untitled task'}${date}${owner}`);
      }
      lines.push('');
    }

    if (completedTasks.length > 0) {
      lines.push('## Completed (Last 90 Days)');
      for (const t of completedTasks) {
        const date = t.date ? ` (${t.date.split('T')[0]})` : '';
        lines.push(`- [x] ${t.subject || 'Untitled task'}${date}`);
      }
      lines.push('');
    }

    result.nextSteps = lines.join('\n');
  } else {
    result.nextSteps = '*No recent tasks found in Salesforce for this account.*';
  }

  // ── Recent Activity / Events ──
  if (events && events.length > 0) {
    const lines = ['## Recent Meetings (Last 90 Days)'];
    for (const e of events) {
      const date = e.startTime ? e.startTime.split('T')[0] : '';
      const owner = e.owner ? ` (${e.owner})` : '';
      lines.push(`- **${date}**: ${e.subject || 'Meeting'}${owner}`);
      if (e.description) {
        lines.push(`  > ${e.description.replace(/\n/g, ' ').substring(0, 200)}`);
      }
    }
    result.recentActivity = lines.join('\n');
  } else {
    result.recentActivity = '*No recent meetings found in Salesforce for this account.*';
  }

  // ── Customer Brain (historical notes) ──
  if (details?.customerBrain) {
    result.customerBrain = details.customerBrain.substring(0, 10000);
  }

  return result;
}

// Admin authentication middleware
function requireAdmin(req, res, next) {
  const email = (req.query.adminEmail || req.headers['x-admin-email'] || '').toLowerCase().trim();
  if (!ADMIN_EMAILS.includes(email) && !EXEC_EMAILS.includes(email)) {
    return res.status(403).json({ 
      success: false, 
      error: 'Admin access required',
      hint: 'Pass adminEmail query param or x-admin-email header'
    });
  }
  req.adminEmail = email;
  next();
}

/**
 * Generate GTM-Brain Command Cheat Sheet HTML
 */
function generateCheatSheetHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>gtm-brain Commands</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--primary:#000;--primary-light:#374151;--primary-bg:#f3f4f6;--text:#1f2937;--text-muted:#6b7280;--text-light:#9ca3af;--bg:#f9fafb;--card:#fff;--border:#e5e7eb;--code-bg:#f3f4f6}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
.header{background:var(--card);border-bottom:1px solid var(--border);padding:16px 20px;position:sticky;top:0;z-index:100}
.header h1{font-size:1.25rem;font-weight:600}
.header p{color:var(--text-muted);font-size:0.8rem;margin-top:2px}
.search-box{max-width:800px;margin:20px auto;padding:0 20px}
.search-box input{width:100%;padding:12px 16px;font-size:0.95rem;border:2px solid var(--border);border-radius:8px;background:var(--card)}
.search-box input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-bg)}
.main{max-width:800px;margin:0 auto;padding:0 20px 40px}
.nav{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)}
.nav-btn{padding:6px 14px;font-size:0.75rem;font-weight:500;border:1px solid var(--border);border-radius:16px;background:var(--card);color:var(--text-muted);cursor:pointer}
.nav-btn:hover{border-color:var(--primary);color:var(--primary)}
.nav-btn.active{background:var(--primary);border-color:var(--primary);color:#fff}
.section{margin-bottom:28px}
.section-title{font-size:0.9rem;font-weight:600;color:var(--text);margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid var(--primary-bg);display:flex;align-items:center;gap:8px}
.section-title .tag{font-size:0.65rem;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-weight:600}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px}
.card:hover{border-color:var(--primary-light)}
.card.hidden{display:none}
.card-title{font-size:0.85rem;font-weight:600;margin-bottom:4px}
.card-desc{font-size:0.75rem;color:var(--text-muted);margin-bottom:10px}
.examples{display:flex;flex-direction:column;gap:6px}
.example{display:flex;align-items:center;gap:6px}
.code{font-family:'SF Mono',Monaco,monospace;font-size:0.8rem;background:var(--code-bg);padding:6px 10px;border-radius:4px;color:var(--primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.copy{background:none;border:none;color:var(--text-light);cursor:pointer;padding:4px;border-radius:4px;font-size:0.7rem}
.copy:hover{background:var(--primary-bg);color:var(--primary)}
.copy.ok{color:#10b981}
.tips{background:var(--primary-bg);border-radius:8px;padding:16px;margin-bottom:20px}
.tips h3{font-size:0.8rem;font-weight:600;color:var(--primary);margin-bottom:10px}
.tips-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
.tip{font-size:0.75rem;color:var(--text)}
.no-results{text-align:center;padding:40px;color:var(--text-muted)}
.footer{text-align:center;padding:20px;color:var(--text-light);font-size:0.7rem;border-top:1px solid var(--border);margin-top:40px}
@media(max-width:640px){.cards{grid-template-columns:1fr}.nav{overflow-x:auto;flex-wrap:nowrap}.nav-btn{white-space:nowrap}}
</style>
</head>
<body>
<header class="header">
<h1>gtm-brain Commands</h1>
<p>Natural language queries for Salesforce data via Slack • Copy & paste to use</p>
</header>

<div style="max-width:800px;margin:20px auto;padding:0 20px;">
  <div style="background:#000;color:#fff;padding:16px;border-radius:8px;margin-bottom:20px;">
    <h3 style="font-size:0.9rem;font-weight:700;margin-bottom:8px;">How to Use</h3>
    <p style="font-size:0.75rem;margin-bottom:12px;color:#d1d5db;">Tag <code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:3px;font-family:monospace;">@gtm-brain</code> in Slack with any command below. Commands are flexible—phrase them naturally.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;font-size:0.7rem;">
      <div><strong style="color:#fff;">Pipeline:</strong> <span style="color:#d1d5db;">View deals by stage, owner, or product</span></div>
      <div><strong style="color:#fff;">Actions:</strong> <span style="color:#d1d5db;">Reassign accounts, close deals, nurture</span></div>
      <div><strong style="color:#fff;">Reports:</strong> <span style="color:#d1d5db;">Revenue, forecasts, account plans</span></div>
      <div><strong style="color:#fff;">Search:</strong> <span style="color:#d1d5db;">Type keywords to find commands</span></div>
    </div>
  </div>
</div>

<div class="search-box">
<input type="text" id="search" placeholder="Search commands: pipeline, reassign, contracts, revenue..." autofocus>
</div>
<main class="main">
<div class="tips" style="background:#f3f4f6;border:1px solid #e5e7eb;">
<h3 style="color:#000;">Tips</h3>
<div class="tips-grid">
<div class="tip"><b>Use first names</b> for BLs: Julie, Nathan, Asad</div>
<div class="tip"><b>Batch commands</b> with commas: Account1, Account2</div>
<div class="tip"><b>Nurture</b> closes all open opportunities</div>
<div class="tip"><b>"show next 10"</b> for pagination in threads</div>
</div>
</div>
<nav class="nav">
<button class="nav-btn active" data-cat="all">All</button>
<button class="nav-btn" data-cat="accounts">Accounts</button>
<button class="nav-btn" data-cat="pipeline">Pipeline</button>
<button class="nav-btn" data-cat="closed">Closed Deals</button>
<button class="nav-btn" data-cat="metrics">Metrics</button>
<button class="nav-btn" data-cat="create">Create</button>
<button class="nav-btn" data-cat="update">Update</button>
<button class="nav-btn" data-cat="export">Export</button>
</nav>
<div class="no-results" id="none" style="display:none"><h3>No matches</h3><p>Try different keywords</p></div>

<section class="section" data-cat="accounts">
<div class="section-title">Account Queries</div>
<div class="cards">
<div class="card" data-k="owner owns who business lead bl lookup find"><div class="card-title">Find Account Owner</div><div class="card-desc">Look up who owns an account</div><div class="examples"><div class="example"><code class="code">who owns Pure Storage</code><button class="copy">copy</button></div><div class="example"><code class="code">BL for Bayer</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="accounts owner julie mitchell steven asad portfolio"><div class="card-title">Accounts by Owner</div><div class="card-desc">All accounts owned by someone</div><div class="examples"><div class="example"><code class="code">what accounts does Julie own</code><button class="copy">copy</button></div><div class="example"><code class="code">Nathan's accounts</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="accounts stage sqo discovery pilot s1 s2 s3"><div class="card-title">Accounts by Stage</div><div class="card-desc">Accounts in a specific stage</div><div class="examples"><div class="example"><code class="code">what accounts are in Stage 2</code><button class="copy">copy</button></div><div class="example"><code class="code">accounts in Stage 4</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="legal team size department headcount"><div class="card-title">Legal Team Size</div><div class="card-desc">Account's legal department size</div><div class="examples"><div class="example"><code class="code">what is the legal team size at Ecolab</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="decision makers stakeholders contacts"><div class="card-title">Decision Makers</div><div class="card-desc">Key contacts at an account</div><div class="examples"><div class="example"><code class="code">who are the decision makers at Pure Storage</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="use cases discussing products services"><div class="card-title">Use Cases</div><div class="card-desc">What products account is interested in</div><div class="examples"><div class="example"><code class="code">what use cases is Best Buy discussing</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="competitive landscape competitors ironclad harvey"><div class="card-title">Competitive Landscape</div><div class="card-desc">Competitor presence at accounts</div><div class="examples"><div class="example"><code class="code">competitive landscape for Dolby</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="customers current revenue list"><div class="card-title">Customer List</div><div class="card-desc">Current customers</div><div class="examples"><div class="example"><code class="code">who are our current customers</code><button class="copy">copy</button></div></div></div>
</div>
</section>

<section class="section" data-cat="pipeline">
<div class="section-title">Pipeline Queries</div>
<div class="cards">
<div class="card" data-k="pipeline show all total overview deals"><div class="card-title">Full Pipeline</div><div class="card-desc">All active opportunities</div><div class="examples"><div class="example"><code class="code">show me pipeline</code><button class="copy">copy</button></div><div class="example"><code class="code">pipeline overview</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="my pipeline deals personal"><div class="card-title">My Pipeline</div><div class="card-desc">Your personal deals</div><div class="examples"><div class="example"><code class="code">show me my pipeline</code><button class="copy">copy</button></div><div class="example"><code class="code">my deals</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="owner pipeline deals julie mitchell steven"><div class="card-title">Someone's Pipeline</div><div class="card-desc">Specific person's deals</div><div class="examples"><div class="example"><code class="code">Nathan's deals</code><button class="copy">copy</button></div><div class="example"><code class="code">Julie's pipeline</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="early stage discovery qualifying"><div class="card-title">Early Stage</div><div class="card-desc">Stage 0-1 (Qualifying, Discovery)</div><div class="examples"><div class="example"><code class="code">early stage pipeline</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="mid stage sqo pilot s2 s3"><div class="card-title">Mid Stage</div><div class="card-desc">Stage 2-3 (SQO, Pilot)</div><div class="examples"><div class="example"><code class="code">mid stage deals</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="late stage proposal negotiation s4 s5"><div class="card-title">Late Stage</div><div class="card-desc">Stage 4-5 (Proposal, Negotiation)</div><div class="examples"><div class="example"><code class="code">late stage pipeline</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="contracting m&a compliance sigma insights litigation fde product"><div class="card-title">Product Pipeline</div><div class="card-desc">Filter by product/service</div><div class="examples"><div class="example"><code class="code">contracting pipeline</code><button class="copy">copy</button></div><div class="example"><code class="code">late stage contracting</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="new deals added created week month"><div class="card-title">New Pipeline</div><div class="card-desc">Recently added deals</div><div class="examples"><div class="example"><code class="code">what deals were added to pipeline this week</code><button class="copy">copy</button></div><div class="example"><code class="code">new deals this month</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="weighted pipeline finance probability"><div class="card-title">Weighted Pipeline</div><div class="card-desc">Probability-adjusted values</div><div class="examples"><div class="example"><code class="code">weighted pipeline</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="specific stage number s2 s3 s4"><div class="card-title">Specific Stage</div><div class="card-desc">Pipeline in exact stage</div><div class="examples"><div class="example"><code class="code">Stage 2 pipeline</code><button class="copy">copy</button></div><div class="example"><code class="code">Stage 4 opportunities</code><button class="copy">copy</button></div></div></div>
</div>
</section>

<section class="section" data-cat="closed">
<div class="section-title">Closed Deals</div>
<div class="cards">
<div class="card" data-k="closed won month week quarter wins"><div class="card-title">What Closed</div><div class="card-desc">Recent closed-won deals</div><div class="examples"><div class="example"><code class="code">what closed this month</code><button class="copy">copy</button></div><div class="example"><code class="code">what closed this week</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="loi signed bookings letter intent"><div class="card-title">LOIs / Bookings</div><div class="card-desc">Letters of intent signed</div><div class="examples"><div class="example"><code class="code">what LOIs have we signed</code><button class="copy">copy</button></div><div class="example"><code class="code">how many LOIs this month</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="arr recurring revenue annual"><div class="card-title">ARR Deals</div><div class="card-desc">Annual recurring revenue</div><div class="examples"><div class="example"><code class="code">show ARR deals</code><button class="copy">copy</button></div><div class="example"><code class="code">how many ARR contracts</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="contracts active list show"><div class="card-title">Contracts</div><div class="card-desc">Contract records</div><div class="examples"><div class="example"><code class="code">show contracts</code><button class="copy">copy</button></div><div class="example"><code class="code">contracts for Pure Storage</code><button class="copy">copy</button></div></div></div>
</div>
</section>

<section class="section" data-cat="metrics">
<div class="section-title">Metrics</div>
<div class="cards">
<div class="card" data-k="how many count number deals"><div class="card-title">Count Deals</div><div class="card-desc">Number of opportunities</div><div class="examples"><div class="example"><code class="code">how many deals</code><button class="copy">copy</button></div><div class="example"><code class="code">how many deals in Stage 2</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="average days stage time duration"><div class="card-title">Days in Stage</div><div class="card-desc">Average time in each stage</div><div class="examples"><div class="example"><code class="code">average days in Stage 2</code><button class="copy">copy</button></div><div class="example"><code class="code">avg days in Stage 4</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="count customers how many"><div class="card-title">Customer Count</div><div class="card-desc">Number of customers</div><div class="examples"><div class="example"><code class="code">how many customers</code><button class="copy">copy</button></div></div></div>
</div>
</section>

<section class="section" data-cat="create">
<div class="section-title">Create <span class="tag">ADMIN</span></div>
<div class="cards">
<div class="card" data-k="create opportunity opp add new deal"><div class="card-title">Create Opportunity</div><div class="card-desc">Add new opportunity to account</div><div class="examples"><div class="example"><code class="code">create opp for Asana</code><button class="copy">copy</button></div><div class="example"><code class="code">create opportunity for Novelis</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="create opportunity stage amount acv"><div class="card-title">Create with Details</div><div class="card-desc">Create with stage or ACV</div><div class="examples"><div class="example"><code class="code">create a stage 2 opp for PetSmart</code><button class="copy">copy</button></div><div class="example"><code class="code">create opportunity for Western Digital with $500k ACV</code><button class="copy">copy</button></div></div></div>
</div>
</section>

<section class="section" data-cat="update">
<div class="section-title">Update <span class="tag">ADMIN</span></div>
<div class="cards">
<div class="card" data-k="reassign account assign transfer owner single"><div class="card-title">Reassign Account</div><div class="card-desc">Change account ownership (US: Asad, Nathan, Julie, Olivia, Ananth, Justin | EU: Greg, Nathan, Tom, Conor, Alex, Nicola, Emer)</div><div class="examples"><div class="example"><code class="code">reassign Dolby to Asad</code><button class="copy">copy</button></div><div class="example"><code class="code">assign Ecolab to Nathan</code><button class="copy">copy</button></div><div class="example"><code class="code">assign Fresh Del Monte to Nathan</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="batch reassign multiple accounts bulk"><div class="card-title">Batch Reassign</div><div class="card-desc">Reassign multiple accounts at once</div><div class="examples"><div class="example"><code class="code">batch reassign: Dolby, Asana, Novelis to Julie</code><button class="copy">copy</button></div><div class="example"><code class="code">reassign AES, Cox Media to Greg</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="move nurture single mark set"><div class="card-title">Move to Nurture</div><div class="card-desc">Mark account as nurture + close opps</div><div class="examples"><div class="example"><code class="code">move TestCo to nurture</code><button class="copy">copy</button></div><div class="example"><code class="code">mark TestAccount as nurture</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="batch nurture multiple several bulk"><div class="card-title">Batch Nurture</div><div class="card-desc">Nurture multiple accounts at once</div><div class="examples"><div class="example"><code class="code">batch nurture: TestCo1, TestCo2, TestCo3</code><button class="copy">copy</button></div><div class="example"><code class="code">move TestCo1, TestCo2 to nurture</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="close lost dead disqualified kill"><div class="card-title">Close Lost</div><div class="card-desc">Mark opportunities as lost</div><div class="examples"><div class="example"><code class="code">close TestCo lost</code><button class="copy">copy</button></div><div class="example"><code class="code">mark TestAccount as lost</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="customer brain note history add"><div class="card-title">Save Customer Note</div><div class="card-desc">Add notes to account history</div><div class="examples"><div class="example"><code class="code">add to customer history: Pure Storage met with CLO today</code><button class="copy">copy</button></div></div></div>
</div>
</section>

<section class="section" data-cat="export">
<div class="section-title">Export</div>
<div class="cards">
<div class="card" data-k="excel export download spreadsheet"><div class="card-title">Excel Export</div><div class="card-desc">Download pipeline spreadsheet</div><div class="examples"><div class="example"><code class="code">send pipeline excel</code><button class="copy">copy</button></div><div class="example"><code class="code">export active pipeline</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="show next 10 more pagination"><div class="card-title">Pagination</div><div class="card-desc">See more results in thread</div><div class="examples"><div class="example"><code class="code">show next 10</code><button class="copy">copy</button></div><div class="example"><code class="code">show all</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="dashboard web view online"><div class="card-title">Dashboard</div><div class="card-desc">Web dashboard URL</div><div class="examples"><div class="example"><code class="code">gtm-wizard.onrender.com/account-dashboard</code><button class="copy">copy</button></div></div></div>
</div>
</section>

</main>
<footer class="footer">gtm-brain | 136+ validated patterns | Dec 2024</footer>
<script>
const search=document.getElementById('search'),cards=document.querySelectorAll('.card'),sections=document.querySelectorAll('.section'),btns=document.querySelectorAll('.nav-btn'),none=document.getElementById('none');
search.addEventListener('input',function(){const t=this.value.toLowerCase().trim();let v=0;btns.forEach(b=>b.classList.toggle('active',b.dataset.cat==='all'));sections.forEach(s=>s.style.display='block');cards.forEach(c=>{const k=c.dataset.k||'',ti=c.querySelector('.card-title').textContent.toLowerCase(),co=Array.from(c.querySelectorAll('.code')).map(x=>x.textContent.toLowerCase()).join(' ');if(t===''||(k+' '+ti+' '+co).includes(t)){c.classList.remove('hidden');v++}else{c.classList.add('hidden')}});sections.forEach(s=>{s.style.display=s.querySelectorAll('.card:not(.hidden)').length>0?'block':'none'});none.style.display=v===0?'block':'none'});
btns.forEach(b=>b.addEventListener('click',function(){const cat=this.dataset.cat;btns.forEach(x=>x.classList.remove('active'));this.classList.add('active');search.value='';if(cat==='all'){sections.forEach(s=>s.style.display='block');cards.forEach(c=>c.classList.remove('hidden'))}else{sections.forEach(s=>s.style.display=s.dataset.cat===cat?'block':'none');cards.forEach(c=>c.classList.remove('hidden'))}none.style.display='none'}));
document.querySelectorAll('.copy').forEach(btn=>btn.addEventListener('click',async function(){const code=this.parentElement.querySelector('.code').textContent;const textToCopy=code.startsWith('http')||code.includes('gtm-wizard.onrender.com')?code:'@gtm-brain '+code;try{await navigator.clipboard.writeText(textToCopy);this.textContent='ok';this.classList.add('ok');setTimeout(()=>{this.textContent='copy';this.classList.remove('ok')},1500)}catch(e){}}));
</script>
</body>
</html>`;
}

/**
 * Generate Security & Compliance Documentation Page
 * SOC 2-aligned documentation for engineering and stakeholder review
 */
function generateSecurityCompliancePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Security & Compliance | gtm-brain</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--accent:#8b9bf4;--accent-light:rgba(139,155,244,0.1);--text:#1f2937;--text-muted:#6b7280;--bg:#f5f7fe;--card:#fff;--border:#e5e7eb;--success:#10b981;--success-light:#dcfce7;--code-bg:#f3f4f6}
body{font-family:'Inter',-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
.header{background:var(--card);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:100}
.header-title{font-size:0.95rem;font-weight:600;display:flex;align-items:center;gap:8px}
.header-badge{background:var(--success);color:#fff;font-size:0.6rem;padding:2px 6px;border-radius:10px;font-weight:500}
.back-link{color:var(--text-muted);text-decoration:none;font-size:0.8rem}
.container{max-width:900px;margin:0 auto;padding:20px}
h1{font-size:1.4rem;font-weight:700;margin-bottom:6px}
.subtitle{color:var(--text-muted);font-size:0.85rem;margin-bottom:20px}
.tldr{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:20px;border-left:4px solid var(--accent)}
.tldr h2{font-size:0.95rem;font-weight:600;margin-bottom:10px}
.tldr-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.8rem}
.tldr-item{background:var(--code-bg);padding:10px;border-radius:6px}
.tldr-item strong{display:block;color:var(--text);margin-bottom:4px}
.tldr-item span{color:var(--text-muted)}
.section{margin-bottom:24px}
.section-title{font-size:1rem;font-weight:600;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)}
table{width:100%;border-collapse:collapse;font-size:0.8rem;background:var(--card);border-radius:6px;overflow:hidden;border:1px solid var(--border);margin-bottom:12px}
th{background:var(--code-bg);text-align:left;padding:8px 10px;font-weight:600;font-size:0.75rem}
td{padding:8px 10px;border-top:1px solid var(--border);color:var(--text-muted)}
.badge{padding:2px 6px;border-radius:3px;font-size:0.7rem;font-weight:500}
.badge-green{background:var(--success-light);color:#166534}
.badge-purple{background:var(--accent-light);color:#5b21b6}
.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px}
.card-title{font-size:0.85rem;font-weight:600;margin-bottom:6px}
.card-text{color:var(--text-muted);font-size:0.8rem}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.check-list{list-style:none;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:6px}
.check-list li{font-size:0.75rem;color:var(--text-muted);padding:6px 8px;background:var(--card);border:1px solid var(--border);border-radius:4px;display:flex;align-items:center;gap:6px}
.check-list li::before{content:"";width:14px;height:14px;background:var(--success);border-radius:50%;flex-shrink:0}
.footer{text-align:center;padding:16px;color:var(--text-muted);font-size:0.75rem;border-top:1px solid var(--border);margin-top:20px}
@media(max-width:640px){.tldr-grid,.grid-2,.check-list{grid-template-columns:1fr}}
</style>
</head>
<body>
<header class="header">
  <div class="header-title">gtm-brain Security <span class="header-badge">SOC 2 Aligned</span></div>
  <a href="/cheat-sheet" class="back-link">Back</a>
</header>
<div class="container">
<h1>Security & Data Documentation</h1>
<p class="subtitle">For engineering review - data consumption, storage, and integrations</p>

<div class="tldr">
  <h2>Overview</h2>
  <div class="tldr-grid">
    <div class="tldr-item"><strong>What data is consumed?</strong><span>Salesforce CRM data, calendar events, meeting transcripts (local), Slack messages</span></div>
    <div class="tldr-item"><strong>Where does data reside?</strong><span>Salesforce (system of record), local user machines, ephemeral server memory only</span></div>
    <div class="tldr-item"><strong>How is data stored?</strong><span>Customer data in Salesforce only. OAuth tokens encrypted (AES-256-GCM) in Git-versioned files. All caches ephemeral.</span></div>
    <div class="tldr-item"><strong>What tools are used?</strong><span>OpenAI Whisper, Claude, Salesforce, Microsoft Graph, Slack, Obsidian (local), Render.com</span></div>
  </div>
</div>

<section class="section">
  <h2 class="section-title">Data Residency</h2>
  <table>
    <tr><th>Data Type</th><th>Location</th><th>Persistence</th></tr>
    <tr><td>Meeting transcripts/audio</td><td><span class="badge badge-green">Local only</span></td><td>User's machine (Obsidian vault)</td></tr>
    <tr><td>Meeting note summaries</td><td><span class="badge badge-green">Salesforce</span></td><td>Customer_Brain__c field</td></tr>
    <tr><td>OAuth tokens</td><td>Encrypted files (Git)</td><td>AES-256-GCM encrypted, committed to private repo</td></tr>
    <tr><td>Calendar/context cache</td><td><span class="badge badge-purple">Ephemeral</span></td><td>In-memory only, 10-15 min TTL, lost on restart</td></tr>
    <tr><td>Application logs</td><td>Render.com</td><td>7-day retention</td></tr>
  </table>
  <div class="card" style="border-left:3px solid var(--success)">
    <div class="card-title" style="color:var(--success)">Zero Customer Data on Render Disk</div>
    <p class="card-text">All customer data lives in Salesforce or ephemeral memory. OAuth tokens are encrypted and stored in Git-versioned files (encryption key in Render env). No customer PII persisted to Render disk.</p>
  </div>
</section>

<section class="section">
  <h2 class="section-title">Third-Party Services (All SOC 2 Certified)</h2>
  <div class="grid-2">
    <div class="card"><div class="card-title">OpenAI</div><p class="card-text">Whisper transcription. Audio sent, not stored.</p></div>
    <div class="card"><div class="card-title">Anthropic Claude</div><p class="card-text">Summarization, queries. Text only.</p></div>
    <div class="card"><div class="card-title">Salesforce</div><p class="card-text">CRM system of record. OAuth per-user.</p></div>
    <div class="card"><div class="card-title">Microsoft 365</div><p class="card-text">Calendar read-only via Graph API.</p></div>
    <div class="card"><div class="card-title">Slack</div><p class="card-text">Bot commands, channel intelligence.</p></div>
    <div class="card"><div class="card-title">Render.com</div><p class="card-text">Node.js hosting (US Oregon).</p></div>
  </div>
</section>

<section class="section">
  <h2 class="section-title">API Usage Controls</h2>
  <table>
    <tr><th>Control</th><th>Implementation</th></tr>
    <tr><td>Rate limiting</td><td>Redis-based, 50 Slack mentions / 5 min per user</td></tr>
    <tr><td>Caching</td><td>Query cache 60s, calendar 15min, metadata 24hr</td></tr>
    <tr><td>Circuit breakers</td><td>3 auth attempts max, 15 min cooldown</td></tr>
    <tr><td>AI token limits</td><td>50 context summaries/day, 800 tokens/query max</td></tr>
  </table>
</section>

<section class="section">
  <h2 class="section-title">Authentication</h2>
  <table>
    <tr><th>Component</th><th>Method</th></tr>
    <tr><td>Salesforce sync</td><td>OAuth 2.0 + PKCE (per-user attribution)</td></tr>
    <tr><td>Obsidian plugin</td><td>Email whitelist</td></tr>
    <tr><td>Admin endpoints</td><td>API key (env var)</td></tr>
    <tr><td>Slack</td><td>HMAC signing secret</td></tr>
  </table>
</section>

<section class="section">
  <h2 class="section-title">Key Security Controls</h2>
  <ul class="check-list">
    <li>AES-256-GCM token encryption</li>
    <li>TLS 1.3 in transit</li>
    <li>No audio stored on server</li>
    <li>Per-user Salesforce attribution</li>
    <li>All secrets in env vars</li>
  </ul>
</section>

</div>
<footer class="footer">gtm-brain Security Documentation | February 2026 | <a href="/architecture" style="color:var(--accent)">Architecture</a></footer>
</body>
</html>`;
}

class GTMBrainApp {
  constructor() {
    this.app = null;
    this.expressApp = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('🚀 Initializing GTM Brain Slack Bot...');

      // Validate environment variables
      this.validateEnvironment();

      // Initialize Slack Bolt app with socket mode error handling
      this.app = new App({
        token: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
        appToken: process.env.SLACK_APP_TOKEN,
        socketMode: true,
        logLevel: process.env.LOG_LEVEL || 'info',
        // Custom receiver settings for better error handling
        customRoutes: [],
      });
      
      // Add error handler for the Bolt app
      this.app.error(async (error) => {
        logger.error('Slack app error:', error);
        // Don't crash on Slack errors - log and continue
      });
      
      // Handle process-level errors to prevent crashes
      process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception:', error.message);
        // Don't exit for socket mode reconnection errors
        if (error.message?.includes('server explicit disconnect') || 
            error.message?.includes('Unexpected server response')) {
          logger.info('🔄 Socket mode error - will attempt reconnection...');
          return;
        }
      });
      
      process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled rejection:', reason);
      });

      // Initialize external services
      await this.initializeServices();

      // Register handlers
      await this.registerHandlers();

      // Setup Express server for health checks
      this.setupExpressServer();

      this.isInitialized = true;
      logger.info('✅ GTM Brain initialized successfully');

    } catch (error) {
      logger.error('❌ Failed to initialize GTM Brain:', error);
      process.exit(1);
    }
  }

  validateEnvironment() {
    const required = [
      'SLACK_BOT_TOKEN',
      'SLACK_SIGNING_SECRET', 
      'SLACK_APP_TOKEN',
      'SF_CLIENT_ID',
      'SF_CLIENT_SECRET',
      'SF_INSTANCE_URL',
      'SF_USERNAME',
      'SF_PASSWORD',
      'SF_SECURITY_TOKEN',
      'OPENAI_API_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    logger.info('✅ Environment variables validated');
  }

  async initializeServices() {
    try {
      // Initialize PostgreSQL database (if DATABASE_URL is set)
      try {
        const db = require('./db/connection');
        if (db.isAvailable()) {
          logger.info('✅ PostgreSQL connection pool established');
          // Run pending migrations automatically on startup
          const { runMigrations } = require('./db/migrate');
          await runMigrations();
          logger.info('✅ Database migrations up to date');
          
          // Register agent handlers and start job queue worker
          const jobQueue = require('./agents/jobQueue');
          const pipelineReviewAgent = require('./agents/pipelineReviewAgent');
          pipelineReviewAgent.register();
          
          // Deal health agent will be registered here too
          try {
            const dealHealthAgent = require('./agents/dealHealthAgent');
            dealHealthAgent.register();
          } catch (e) {
            logger.debug('[Agents] Deal health agent not yet available');
          }
          
          jobQueue.startWorker();
          logger.info('✅ Agent job queue worker started');
        } else {
          logger.info('ℹ️  PostgreSQL not configured — using file-based storage');
        }
      } catch (dbError) {
        logger.warn('⚠️  PostgreSQL initialization failed:', dbError.message);
        logger.warn('   Falling back to file-based storage');
      }

      // Initialize Redis for caching and conversation state (skip if not available)
      if (process.env.REDIS_URL && process.env.REDIS_URL.includes('redis://red-')) {
        await initializeRedis();
        logger.info('✅ Redis connection established');
      } else {
        logger.info('ℹ️  Redis not configured - running without cache');
      }

      // Initialize Salesforce connection (with graceful degradation)
      try {
        const sfConn = await initializeSalesforce();
        if (sfConn) {
          logger.info('✅ Salesforce connection established');
        } else {
          logger.warn('⚠️  Salesforce running in DEGRADED MODE - connection failed but app continues');
        }
      } catch (sfError) {
        // Check if this is a rate limit or auth error
        if (sfError.message?.includes('INVALID_LOGIN') || 
            sfError.message?.includes('LOGIN_RATE_EXCEEDED') ||
            sfError.message?.includes('AUTH_RATE_LIMITED')) {
          logger.error('🛑 Salesforce authentication failed - running in DEGRADED MODE');
          logger.error('   Bot will respond with "Salesforce unavailable" for data queries');
          logger.error('   Fix: Update SF_SECURITY_TOKEN in Render environment variables');
          // Don't throw - let app continue running
        } else {
          // Other errors - still throw
          throw sfError;
        }
      }

      // Initialize Email service
      await initializeEmail();
      logger.info('✅ Email service initialized');

      // Initialize Calendar Sync Job (background sync to SQLite)
      try {
        const { initializeCalendarSync } = require('./jobs/calendarSyncJob');
        const calendarInit = await initializeCalendarSync();
        if (calendarInit.initialized) {
          logger.info(`✅ Calendar sync initialized (${calendarInit.currentEvents} cached events)`);
        } else {
          logger.warn('⚠️  Calendar sync initialization failed:', calendarInit.error);
        }
      } catch (calendarError) {
        logger.warn('⚠️  Calendar sync service failed to initialize:', calendarError.message);
        // Don't throw - app can still run, just without calendar caching
      }

      // Initialize Slack Intel Cache (file-based cache for Slack intelligence)
      try {
        const { initializeIntelCache } = require('./jobs/refreshIntelCache');
        const intelInit = await initializeIntelCache();
        if (intelInit.initialized) {
          logger.info(`✅ Slack intel cache initialized (${intelInit.cacheStatus?.totalIntelCount || 0} cached items)`);
        }
      } catch (intelError) {
        logger.warn('⚠️  Slack intel cache failed to initialize:', intelError.message);
        // Don't throw - app can still run, queries will just have empty slackIntel
      }

      // Initialize User Token Service (for SF OAuth per-user auth)
      try {
        const intelligenceStore = require('./services/intelligenceStore');
        const userTokenService = require('./services/userTokenService');
        
        // Ensure intelligence store DB is initialized
        await intelligenceStore.initialize();
        const db = intelligenceStore.getDb();
        
        if (db) {
          await userTokenService.init(db);
          logger.info('✅ User token service initialized');
        } else {
          logger.warn('⚠️  User token service skipped - database not available');
        }
      } catch (tokenError) {
        logger.warn('⚠️  User token service failed to initialize:', tokenError.message);
        // Don't throw - app can still run, just without per-user OAuth
      }

      // Initialize Git Commit Job (Zero Render Storage - periodic data commits)
      try {
        const { initializeGitCommit } = require('./jobs/gitCommitJob');
        const gitInit = await initializeGitCommit();
        if (gitInit.initialized) {
          const pendingCount = gitInit.pendingChanges?.files?.length || 0;
          logger.info(`✅ Git commit job initialized (${pendingCount} pending files, ${gitInit.intervalMinutes}min interval)`);
        }
      } catch (gitError) {
        logger.warn('⚠️  Git commit job failed to initialize:', gitError.message);
        // Don't throw - app can still run, just data won't auto-commit
      }

      // Initialize Account Sync Cron Job (detects account changes and creates sync flags)
      try {
        const db = require('./db/connection');
        if (db.isAvailable() && sfConnection.isConnected) {
          const { startAccountSyncSchedule } = require('./jobs/accountSyncJob');
          startAccountSyncSchedule();
          logger.info('✅ Account sync cron job scheduled');
        } else {
          logger.info('ℹ️  Account sync cron skipped — requires PostgreSQL + Salesforce');
        }
      } catch (syncError) {
        logger.warn('⚠️  Account sync cron failed to initialize:', syncError.message);
        // Don't throw - app can still run, just won't auto-detect account changes
      }

    } catch (error) {
      logger.error('Failed to initialize external services:', error);
      throw error;
    }
  }

  async registerHandlers() {
    try {
      // Register slash commands (/pipeline, /forecast, etc.)
      registerSlashCommands(this.app);
      logger.info('✅ Slash commands registered');

      // Register event handlers (mentions, DMs)
      registerEventHandlers(this.app);
      logger.info('✅ Event handlers registered');

      // Register interactive handlers (buttons, modals)
      registerInteractiveHandlers(this.app);
      logger.info('✅ Interactive handlers registered');

      // Global error handler
      this.app.error(async (error) => {
        logger.error('Slack app error:', error);
      });

    } catch (error) {
      logger.error('Failed to register handlers:', error);
      throw error;
    }
  }

  setupExpressServer() {
    this.expressApp = express();
    
    // Security middleware - configure helmet with CSP that allows inline scripts for dashboards
    this.expressApp.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));
    this.expressApp.use(cors());
    // Large limit for audio transcription (1.5hr call @ 96kbps = ~65MB → ~87MB base64)
    this.expressApp.use(express.json({ limit: '100mb' }));
    this.expressApp.use(express.urlencoded({ extended: true, limit: '100mb' }));
    
    // Cookie parser for session
    const cookieParser = require('cookie-parser');
    this.expressApp.use(cookieParser());

    // ═══════════════════════════════════════════════════════════════════════════
    // ANALYTICS API ROUTES
    // ═══════════════════════════════════════════════════════════════════════════
    try {
      const analyticsRoutes = require('./routes/analytics');
      this.expressApp.use('/api/analytics', analyticsRoutes);
      logger.info('Analytics routes mounted at /api/analytics');
    } catch (error) {
      logger.warn('Analytics routes not loaded:', error.message);
    }

    // Health check endpoint with Salesforce status
    this.expressApp.get('/health', (req, res) => {
      const sfStatus = getAuthRateLimitStatus();
      res.json({
        status: sfConnection.isConnected ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        salesforce: {
          connected: sfConnection.isConnected,
          degradedMode: sfConnection.degradedMode,
          circuitBreakerOpen: sfStatus.circuitOpen,
          authAttempts: sfStatus.attemptCount,
          maxAttempts: sfStatus.maxAttempts,
          lastError: sfStatus.lastError || null
        }
      });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PLUGIN AUTO-UPDATE ENDPOINTS
    // ─────────────────────────────────────────────────────────────────────────

    // Plugin version check — returns current version for auto-update comparison
    // Format matches what the plugin expects: { success: true, currentVersion: "4.1.0" }
    this.expressApp.get('/api/plugin/version', (req, res) => {
      try {
        const manifestPath = path.join(__dirname, '..', 'obsidian-plugin', 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const mainJsPath = path.join(__dirname, '..', 'obsidian-plugin', 'main.js');
        const mainJsStat = fs.statSync(mainJsPath);
        res.json({
          success: true,
          currentVersion: manifest.version,
          version: manifest.version,
          buildHash: mainJsStat.mtimeMs.toString(36),
          updatedAt: mainJsStat.mtime.toISOString(),
          name: manifest.name,
        });
      } catch (err) {
        // Fallback: always return success with current version so auto-update works
        // IMPORTANT: Keep this in sync with obsidian-plugin/manifest.json version
        logger.warn('[Plugin Version] Could not read manifest.json from disk:', err.message);
        res.json({ success: true, currentVersion: '4.4.0', version: '4.4.0' });
      }
    });

    // Plugin file downloads — serves latest compiled plugin files
    // Routes match what the plugin's performAutoUpdate() expects
    this.expressApp.get('/api/plugin/main.js', (req, res) => {
      const filePath = path.join(__dirname, '..', 'obsidian-plugin', 'main.js');
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(filePath);
    });

    this.expressApp.get('/api/plugin/manifest.json', (req, res) => {
      const filePath = path.join(__dirname, '..', 'obsidian-plugin', 'manifest.json');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(filePath);
    });

    this.expressApp.get('/api/plugin/styles.css', (req, res) => {
      const filePath = path.join(__dirname, '..', 'obsidian-plugin', 'styles.css');
      res.setHeader('Content-Type', 'text/css');
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(filePath);
    });

    // Also serve at /api/plugin/bundle and /api/plugin/manifest as aliases
    this.expressApp.get('/api/plugin/bundle', (req, res) => {
      const filePath = path.join(__dirname, '..', 'obsidian-plugin', 'main.js');
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(filePath);
    });

    this.expressApp.get('/api/plugin/manifest', (req, res) => {
      const filePath = path.join(__dirname, '..', 'obsidian-plugin', 'manifest.json');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(filePath);
    });

    // Plugin telemetry — receives health data from plugin instances
    this.expressApp.post('/api/plugin/telemetry', express.json(), (req, res) => {
      try {
        const data = req.body;
        logger.info(`[Plugin Telemetry] ${data.email || 'unknown'} v${data.pluginVersion || '?'} | accounts:${data.accountFolderCount || 0} | setup:${data.setupCompleted} | platform:${data.platform}`);
        
        // Store telemetry in file-based cache (append)
        const telemetryPath = path.join(__dirname, '..', 'data', 'plugin-telemetry.json');
        let telemetryData = [];
        try {
          telemetryData = JSON.parse(fs.readFileSync(telemetryPath, 'utf-8'));
        } catch { /* file may not exist */ }
        
        // Keep last entry per user (overwrite, don't accumulate)
        const existing = telemetryData.findIndex(t => t.email === data.email);
        if (existing >= 0) {
          telemetryData[existing] = { ...data, receivedAt: new Date().toISOString() };
        } else {
          telemetryData.push({ ...data, receivedAt: new Date().toISOString() });
        }
        fs.writeFileSync(telemetryPath, JSON.stringify(telemetryData, null, 2));

        // Check if there's a remote command queued for this user
        const commandsPath = path.join(__dirname, '..', 'data', 'plugin-commands.json');
        let commands = {};
        try {
          commands = JSON.parse(fs.readFileSync(commandsPath, 'utf-8'));
        } catch { /* file may not exist */ }

        const userCommand = commands[data.email];
        if (userCommand) {
          // Clear the command after delivery
          delete commands[data.email];
          fs.writeFileSync(commandsPath, JSON.stringify(commands, null, 2));
          return res.json({ success: true, command: userCommand });
        }

        res.json({ success: true });
      } catch (err) {
        logger.error('[Plugin Telemetry] Failed:', err.message);
        res.json({ success: false });
      }
    });

    // Plugin state check — server-side state authority for a user
    this.expressApp.get('/api/plugin/state/:email', async (req, res) => {
      try {
        const email = (req.params.email || '').toLowerCase().trim();
        if (!email) return res.status(400).json({ error: 'Email required' });

        const userGroup = getUserGroup(email);
        
        // Query account count from Salesforce
        let expectedAccounts = 0;
        try {
          if (sfConnection.isConnected) {
            let countQuery;
            if (userGroup === 'admin' || userGroup === 'exec') {
              countQuery = `SELECT COUNT(Id) total FROM Account WHERE Id IN (SELECT AccountId FROM Opportunity) AND (NOT Name LIKE '%Sample%')`;
            } else if (userGroup === 'cs') {
              countQuery = `SELECT COUNT(Id) total FROM Account WHERE Customer_Type__c LIKE '%Existing%'`;
            } else {
              const userResult = await sfConnection.query(`SELECT Id FROM User WHERE Email = '${email}' LIMIT 1`);
              if (userResult.records.length > 0) {
                const userId = userResult.records[0].Id;
                countQuery = `SELECT COUNT(Id) total FROM Account WHERE OwnerId = '${userId}'`;
              }
            }
            if (countQuery) {
              const result = await sfConnection.query(countQuery);
              expectedAccounts = result.records[0]?.total || 0;
            }
          }
        } catch (sfErr) {
          logger.warn(`[Plugin State] SF query failed for ${email}:`, sfErr.message);
        }

        res.json({
          email,
          userGroup,
          expectedAccounts,
          setupShouldBeComplete: true,
          serverVersion: require(path.join(__dirname, '..', 'obsidian-plugin', 'manifest.json')).version,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        logger.error('[Plugin State] Failed:', err.message);
        res.status(500).json({ error: 'State check failed' });
      }
    });

    // Salesforce status endpoint
    this.expressApp.get('/sf-status', async (req, res) => {
      const sfStatus = getAuthRateLimitStatus();
      
      // Try a simple query if connected
      let queryTest = null;
      if (sfConnection.isConnected && !sfConnection.degradedMode) {
        try {
          const result = await sfConnection.query('SELECT Id FROM Account LIMIT 1');
          queryTest = { success: true, records: result.totalSize };
        } catch (error) {
          queryTest = { success: false, error: error.message };
        }
      }
      
      res.json({
        timestamp: new Date().toISOString(),
        connection: {
          isConnected: sfConnection.isConnected,
          degradedMode: sfConnection.degradedMode,
          hasAccessToken: !!sfConnection.conn?.accessToken
        },
        circuitBreaker: {
          open: sfStatus.circuitOpen,
          attempts: sfStatus.attemptCount,
          maxAttempts: sfStatus.maxAttempts,
          cooldownMs: sfStatus.cooldownMs,
          lastError: sfStatus.lastError
        },
        queryTest
      });
    });

    // Circuit breaker reset endpoint (for emergency recovery)
    this.expressApp.post('/sf-reset', (req, res) => {
      logger.info('🔄 Manual circuit breaker reset requested');
      resetCircuitBreaker();
      res.json({
        success: true,
        message: 'Circuit breaker reset. Next auth attempt will proceed.',
        timestamp: new Date().toISOString()
      });
    });

    // Metrics endpoint
    this.expressApp.get('/metrics', (req, res) => {
      res.json({
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Plugin configuration endpoint - tells Obsidian plugin what capabilities are available
    this.expressApp.get('/api/plugin/config', (req, res) => {
      res.json({
        success: true,
        version: '4.0.0',
        capabilities: {
          serverTranscription: transcriptionService.isReady(),
          salesforce: sfConnection.isConnected,
          calendar: true,
          smartTags: true
        },
        messages: {
          transcription: transcriptionService.isReady() 
            ? 'Server transcription is available - no local API key needed'
            : 'Server transcription unavailable - local API key required as fallback'
        },
        timestamp: new Date().toISOString()
      });
    });

    // Plugin version endpoint (duplicate removed — primary is at line ~1015)
    // This was a duplicate registration that was overriding the primary endpoint
    // with a stale hardcoded fallback version. Removed to prevent version mismatch.

    // Serve latest plugin main.js directly (for auto-update)
    this.expressApp.get('/api/plugin/main.js', (req, res) => {
      const path = require('path');
      const mainJsPath = path.join(__dirname, '..', 'obsidian-plugin', 'main.js');
      res.setHeader('Content-Type', 'application/javascript');
      res.sendFile(mainJsPath);
    });

    // Serve latest plugin manifest.json
    this.expressApp.get('/api/plugin/manifest.json', (req, res) => {
      const path = require('path');
      const manifestPath = path.join(__dirname, '..', 'obsidian-plugin', 'manifest.json');
      res.setHeader('Content-Type', 'application/json');
      res.sendFile(manifestPath);
    });

    // Serve latest plugin styles.css
    this.expressApp.get('/api/plugin/styles.css', (req, res) => {
      const path = require('path');
      const stylesPath = path.join(__dirname, '..', 'obsidian-plugin', 'styles.css');
      res.setHeader('Content-Type', 'text/css');
      res.sendFile(stylesPath);
    });

    // Plugin telemetry endpoint - for remote debugging (opt-in)
    // Receives error reports from the Obsidian plugin for debugging
    // Now persists to telemetryStore for admin access
    this.expressApp.post('/api/plugin/telemetry', (req, res) => {
      try {
        const { 
          event,           // 'error' | 'warning' | 'info' | 'heartbeat' | 'sync'
          message,         // Error message or description
          context,         // Additional context (account, action, etc.)
          userEmail,       // Optional user identifier
          pluginVersion,   // Plugin version
          platform,        // 'obsidian' | 'web'
          accountCount,    // For heartbeats
          connections      // For heartbeats
        } = req.body;
        
        // Log for debugging (these appear in Render logs)
        // Persist to PostgreSQL (alongside existing file store for backward compat)
        const { telemetryRepo, analyticsRepo } = require('./db/repositories');
        telemetryRepo.recordEvent(event, userEmail, pluginVersion, { message, context, platform }, 
          event === 'error' ? message : null, null).catch(() => {});
        analyticsRepo.trackEvent(`plugin_${event}`, userEmail, { pluginVersion, platform }).catch(() => {});

        if (event === 'error') {
          logger.error(`[Plugin Telemetry] ${message}`, { 
            userEmail: userEmail || 'anonymous',
            context,
            pluginVersion,
            platform
          });
          // Persist to file store (legacy)
          telemetryStore.recordError(userEmail, message, { context, pluginVersion, platform });
        } else if (event === 'warning') {
          logger.warn(`[Plugin Telemetry] ${message}`, { context, pluginVersion });
          telemetryStore.recordWarning(userEmail, message, { context, pluginVersion, platform });
        } else if (event === 'heartbeat') {
          // Heartbeat - update user presence
          telemetryStore.recordHeartbeat(userEmail, { 
            version: pluginVersion, 
            accountCount, 
            connections,
            platform 
          });
        } else if (event === 'sync') {
          // Sync result
          telemetryStore.recordSync(userEmail, { ...context, version: pluginVersion });
        } else {
          logger.info(`[Plugin Telemetry] ${message}`, { context, pluginVersion });
          telemetryStore.recordInfo(userEmail, message, { context, pluginVersion, platform });
        }
        
        res.json({ success: true, received: true });
      } catch (error) {
        // Don't fail on telemetry errors
        res.json({ success: true, received: false });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN ENDPOINTS - Remote debugging and user management
    // ═══════════════════════════════════════════════════════════════════════════

    // List all plugin users with their status
    this.expressApp.get('/api/admin/users', requireAdmin, (req, res) => {
      try {
        const users = telemetryStore.getAllUsers();
        res.json({
          success: true,
          users,
          count: users.length,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('[Admin] Error fetching users:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get debug info for a specific user
    this.expressApp.get('/api/admin/users/:email/debug', requireAdmin, (req, res) => {
      try {
        const { email } = req.params;
        const debugInfo = telemetryStore.getUserDebugInfo(email);
        
        if (!debugInfo.stats) {
          return res.status(404).json({ 
            success: false, 
            error: 'User not found in telemetry logs' 
          });
        }
        
        res.json({
          success: true,
          ...debugInfo,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('[Admin] Error fetching user debug:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get recent errors across all users
    this.expressApp.get('/api/admin/errors', requireAdmin, (req, res) => {
      try {
        const sinceHours = parseInt(req.query.since) || 24;
        const errors = telemetryStore.getRecentErrors(sinceHours);
        
        res.json({
          success: true,
          errors,
          count: errors.length,
          sinceHours,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('[Admin] Error fetching errors:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Push config update to a user
    this.expressApp.post('/api/admin/users/:email/push-config', requireAdmin, (req, res) => {
      try {
        const { email } = req.params;
        const { updates } = req.body;
        
        if (!updates || !Array.isArray(updates) || updates.length === 0) {
          return res.status(400).json({ 
            success: false, 
            error: 'updates array is required with { key, value } objects' 
          });
        }
        
        telemetryStore.storePushedConfig(email, updates);
        
        logger.info(`[Admin] Config pushed to ${email} by ${req.adminEmail}:`, updates);
        
        res.json({
          success: true,
          message: `Config pushed to ${email}. Will be applied on next plugin startup.`,
          updates
        });
      } catch (error) {
        logger.error('[Admin] Error pushing config:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get pushed config for a user (called by plugin on startup)
    this.expressApp.get('/api/admin/users/:email/config', (req, res) => {
      try {
        const { email } = req.params;
        const updates = telemetryStore.getPushedConfig(email);
        
        res.json({
          success: true,
          updates: updates || [],
          hasUpdates: updates && updates.length > 0
        });
      } catch (error) {
        res.json({ success: true, updates: [], hasUpdates: false });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN ACCOUNT MANAGEMENT — Remote account add/remove for users
    // ═══════════════════════════════════════════════════════════════════════════

    // Add or remove accounts for a user (persisted to PostgreSQL)
    this.expressApp.post('/api/admin/users/:email/accounts', requireAdmin, async (req, res) => {
      try {
        const db = require('./db/connection');
        if (!db.isAvailable()) {
          return res.status(503).json({ success: false, error: 'Database not available. Account overrides require PostgreSQL.' });
        }

        const userEmail = req.params.email.toLowerCase().trim();
        const { action, accounts } = req.body;

        if (!action || !['add', 'remove', 'promote', 'demote', 'list'].includes(action)) {
          return res.status(400).json({ success: false, error: 'action must be "add", "remove", "promote", "demote", or "list"' });
        }

        if (action === 'list') {
          const result = await db.query(
            'SELECT account_id, account_name, action, admin_email, notes, created_at FROM user_account_overrides WHERE user_email = $1 ORDER BY created_at DESC',
            [userEmail]
          );
          return res.json({ success: true, email: userEmail, overrides: result.rows, count: result.rows.length });
        }

        if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
          return res.status(400).json({ success: false, error: 'accounts array is required with { id, name } objects' });
        }

        const results = [];
        for (const acc of accounts) {
          if (!acc.id || !acc.name) {
            results.push({ id: acc.id, status: 'skipped', reason: 'Missing id or name' });
            continue;
          }
          try {
            await db.query(
              `INSERT INTO user_account_overrides (user_email, account_id, account_name, action, admin_email, notes)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (user_email, account_id, action) 
               DO UPDATE SET account_name = $3, admin_email = $5, notes = $6, created_at = NOW()`,
              [userEmail, acc.id, acc.name, action, req.adminEmail, acc.notes || null]
            );
            results.push({ id: acc.id, name: acc.name, status: 'ok' });
          } catch (dbErr) {
            results.push({ id: acc.id, name: acc.name, status: 'error', reason: dbErr.message });
          }
        }

        logger.info(`[Admin] Account ${action} for ${userEmail} by ${req.adminEmail}: ${results.filter(r => r.status === 'ok').length}/${accounts.length} succeeded`);

        res.json({
          success: true,
          email: userEmail,
          action,
          results,
          message: `${results.filter(r => r.status === 'ok').length} account(s) ${action} for ${userEmail}. Changes apply on next plugin sync.`
        });
      } catch (error) {
        logger.error('[Admin] Error managing user accounts:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Trigger a sync flag for a user (resync accounts, update plugin, etc.)
    this.expressApp.post('/api/admin/users/:email/trigger-sync', requireAdmin, async (req, res) => {
      try {
        const db = require('./db/connection');
        if (!db.isAvailable()) {
          return res.status(503).json({ success: false, error: 'Database not available. Sync flags require PostgreSQL.' });
        }

        const userEmail = req.params.email.toLowerCase().trim();
        const { flag, payload } = req.body;

        const validFlags = ['resync_accounts', 'update_plugin', 'reset_setup', 'custom'];
        if (!flag || !validFlags.includes(flag)) {
          return res.status(400).json({ success: false, error: `flag must be one of: ${validFlags.join(', ')}` });
        }

        await db.query(
          'INSERT INTO user_sync_flags (user_email, flag, payload, admin_email) VALUES ($1, $2, $3, $4)',
          [userEmail, flag, JSON.stringify(payload || {}), req.adminEmail]
        );

        logger.info(`[Admin] Sync flag '${flag}' set for ${userEmail} by ${req.adminEmail}`);

        res.json({
          success: true,
          email: userEmail,
          flag,
          message: `Sync flag '${flag}' set for ${userEmail}. Will be consumed on next plugin startup or sync.`
        });
      } catch (error) {
        logger.error('[Admin] Error setting sync flag:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get pending sync flags for a user (called by plugin on startup)
    this.expressApp.get('/api/admin/users/:email/sync-flags', async (req, res) => {
      try {
        const db = require('./db/connection');
        if (!db.isAvailable()) {
          return res.json({ success: true, flags: [], hasFlags: false });
        }

        const userEmail = req.params.email.toLowerCase().trim();
        const result = await db.query(
          'SELECT id, flag, payload, created_at FROM user_sync_flags WHERE user_email = $1 AND consumed_at IS NULL ORDER BY created_at ASC',
          [userEmail]
        );

        res.json({
          success: true,
          email: userEmail,
          flags: result.rows,
          hasFlags: result.rows.length > 0
        });
      } catch (error) {
        res.json({ success: true, flags: [], hasFlags: false });
      }
    });

    // Mark sync flags as consumed (called by plugin after processing)
    this.expressApp.post('/api/admin/users/:email/sync-flags/consume', async (req, res) => {
      try {
        const db = require('./db/connection');
        if (!db.isAvailable()) {
          return res.json({ success: true });
        }

        const userEmail = req.params.email.toLowerCase().trim();
        const { flagIds } = req.body;

        if (!flagIds || !Array.isArray(flagIds) || flagIds.length === 0) {
          return res.status(400).json({ success: false, error: 'flagIds array is required' });
        }

        await db.query(
          'UPDATE user_sync_flags SET consumed_at = NOW() WHERE user_email = $1 AND id = ANY($2::int[])',
          [userEmail, flagIds]
        );

        res.json({ success: true, consumed: flagIds.length });
      } catch (error) {
        res.json({ success: true });
      }
    });

    // Admin endpoint: manually trigger the account sync cron
    this.expressApp.post('/api/admin/account-sync/run', requireAdmin, async (req, res) => {
      try {
        const { runAccountSync } = require('./jobs/accountSyncJob');
        const result = await runAccountSync();
        res.json(result);
      } catch (error) {
        logger.error('[Admin] Error running account sync:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Admin endpoint: get last account sync result
    this.expressApp.get('/api/admin/account-sync/status', requireAdmin, async (req, res) => {
      try {
        const { getLastSyncResult } = require('./jobs/accountSyncJob');
        const result = getLastSyncResult();
        res.json({ success: true, lastSync: result || null });
      } catch (error) {
        res.json({ success: true, lastSync: null });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // USER GROUP API
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Get user group and permissions for an email
     * Used by plugin to determine folder structure and access level
     */
    this.expressApp.get('/api/users/group/:email', (req, res) => {
      try {
        const email = (req.params.email || '').toLowerCase().trim();
        const group = getUserGroup(email);
        const region = getSalesLeaderRegion(email);
        
        res.json({
          success: true,
          email,
          group,
          region,
          isAdmin: group === 'admin' || group === 'exec',
          salesLeaderInfo: group === 'sales_leader' ? SALES_LEADERS[email] : null,
          permissions: {
            viewAllAccounts: ['admin', 'exec'].includes(group),
            viewRegionAccounts: group === 'sales_leader',
            viewCustomersOnly: group === 'cs',
            viewOwnedAccounts: group === 'bl'
          }
        });
      } catch (error) {
        logger.error('Error getting user group:', error);
        res.status(500).json({ success: false, error: 'Failed to get user group' });
      }
    });

    // Eudia Logo endpoint
    this.expressApp.get('/logo', (req, res) => {
      const fs = require('fs');
      const path = require('path');
      const logoPath = path.join(__dirname, 'assets', 'Eudia_Logo.jpg');
      res.sendFile(logoPath);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // OKTA SSO ROUTES
    // ═══════════════════════════════════════════════════════════════════════════
    const OKTA_SESSION_COOKIE = 'gtm_okta_session';
    const OKTA_NONCE_COOKIE = 'gtm_okta_nonce';
    const OKTA_STATE_COOKIE = 'gtm_okta_state';
    
    // Login route - redirects to Okta
    this.expressApp.get('/login', async (req, res) => {
      try {
        const client = await getOktaClient();
        if (!client) {
          // Okta not configured - show error
          return res.status(503).send(`
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>GTM Dashboard - Configuration Error</title>
            <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f7fe;min-height:100vh;display:flex;align-items:center;justify-content:center}.error-container{background:#fff;padding:40px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);max-width:400px;width:90%;text-align:center}.error-container h1{font-size:1.25rem;font-weight:600;color:#dc2626;margin-bottom:12px}.error-container p{font-size:0.875rem;color:#6b7280;line-height:1.6}</style>
            </head><body><div class="error-container"><h1>Authentication Not Available</h1><p>Okta SSO is not configured. Please contact IT support to enable dashboard access.</p></div></body></html>
          `);
        }
        
        const nonce = generators.nonce();
        const state = generators.state();
        
        // Store nonce and state in cookies for verification
        res.cookie(OKTA_NONCE_COOKIE, nonce, { httpOnly: true, maxAge: 5 * 60 * 1000 }); // 5 min
        res.cookie(OKTA_STATE_COOKIE, state, { httpOnly: true, maxAge: 5 * 60 * 1000 });
        
        const authUrl = client.authorizationUrl({
          scope: 'openid profile email',
          state,
          nonce,
          redirect_uri: OKTA_REDIRECT_URI
        });
        
        logger.info('🔐 Redirecting to Okta for authentication');
        res.redirect(authUrl);
      } catch (error) {
        logger.error('Login error:', error.message);
        // Show error page - no password fallback
        res.status(503).send(`
          <!DOCTYPE html>
          <html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>GTM Dashboard - Login Error</title>
          <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f7fe;min-height:100vh;display:flex;align-items:center;justify-content:center}.error-container{background:#fff;padding:40px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);max-width:400px;width:90%;text-align:center}.error-container h1{font-size:1.25rem;font-weight:600;color:#dc2626;margin-bottom:12px}.error-container p{font-size:0.875rem;color:#6b7280;line-height:1.6;margin-bottom:16px}.error-container a{color:#8e99e1;text-decoration:none}.error-container a:hover{text-decoration:underline}</style>
          </head><body><div class="error-container"><h1>Login Error</h1><p>Unable to connect to Okta authentication. Please try again.</p><a href="/login">Retry Login</a></div></body></html>
        `);
      }
    });
    
    // Okta callback route
    this.expressApp.get('/auth/callback', async (req, res) => {
      try {
        const client = await getOktaClient();
        if (!client) {
          return res.redirect('/gtm');
        }
        
        const params = client.callbackParams(req);
        const nonce = req.cookies[OKTA_NONCE_COOKIE];
        const state = req.cookies[OKTA_STATE_COOKIE];
        
        const tokenSet = await client.callback(OKTA_REDIRECT_URI, params, { nonce, state });
        const userInfo = await client.userinfo(tokenSet.access_token);
        
        // Clear nonce/state cookies
        res.clearCookie(OKTA_NONCE_COOKIE);
        res.clearCookie(OKTA_STATE_COOKIE);
        
        // Create session with user info
        const sessionData = {
          email: userInfo.email,
          name: userInfo.name || userInfo.preferred_username,
          sub: userInfo.sub,
          exp: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
        };
        
        // Store session as base64 encoded JSON in cookie
        const sessionToken = Buffer.from(JSON.stringify(sessionData)).toString('base64');
        res.cookie(OKTA_SESSION_COOKIE, sessionToken, { 
          httpOnly: true, 
          maxAge: 30 * 24 * 60 * 60 * 1000,
          secure: process.env.NODE_ENV === 'production'
        });
        
        logger.info(`✅ Okta SSO login successful: ${userInfo.email}`);
        
        // Log login event to Salesforce (fire-and-forget)
        usageLogger.logLogin(sessionData, req).catch(e => 
          logger.debug(`[UsageLogger] Login log failed: ${e.message}`)
        );
        
        res.redirect('/gtm');
      } catch (error) {
        logger.error('Okta callback error:', error.message);
        res.send(`
          <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h2>Authentication Error</h2>
            <p>${error.message}</p>
            <a href="/login">Try again</a>
          </body></html>
        `);
      }
    });
    
    // Logout route - clears Okta session
    this.expressApp.get('/logout', async (req, res) => {
      res.clearCookie(OKTA_SESSION_COOKIE);
      res.clearCookie('gtm_dash_auth');
      res.clearCookie('gtm_dash_user');
      
      // Redirect to Okta logout if configured
      if (OKTA_CLIENT_ID) {
        const logoutUrl = `${OKTA_ISSUER}/oauth2/v1/logout?client_id=${OKTA_CLIENT_ID}&post_logout_redirect_uri=${encodeURIComponent('https://gtm-wizard.onrender.com')}`;
        return res.redirect(logoutUrl);
      }
      
      res.redirect('/account-dashboard');
    });
    
    // Helper to validate Okta session
    const validateOktaSession = (req) => {
      const sessionToken = req.cookies[OKTA_SESSION_COOKIE];
      if (!sessionToken) return null;
      
      try {
        const sessionData = JSON.parse(Buffer.from(sessionToken, 'base64').toString());
        if (sessionData.exp < Date.now()) {
          return null; // Session expired
        }
        return sessionData;
      } catch {
        return null;
      }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // Account Status Dashboard - Okta SSO + Password fallback
    // ═══════════════════════════════════════════════════════════════════════════
    const DASHBOARD_PASSWORDS = ['eudia-gtm'];
    const AUTH_COOKIE = 'gtm_dash_auth';
    const USER_COOKIE = 'gtm_dash_user';
    
    // Simple in-memory analytics (resets on server restart)
    const dashboardAnalytics = {
      pageViews: 0,
      uniqueUsers: new Set(),
      sessions: [],
      lastReset: new Date().toISOString()
    };
    
    // Dashboard cache (1 minute TTL for near real-time data)
    let dashboardCache = { html: null, timestamp: 0 };
    const CACHE_TTL = 1 * 60 * 1000; // 1 minute - reduced for faster Salesforce sync
    
    // Rate limiting (max 30 requests per minute per IP)
    const rateLimitMap = new Map();
    const RATE_LIMIT = 30;
    const RATE_WINDOW = 60 * 1000; // 1 minute
    
    const checkRateLimit = (ip) => {
      const now = Date.now();
      const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_WINDOW };
      if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + RATE_WINDOW;
      } else {
        record.count++;
      }
      rateLimitMap.set(ip, record);
      return record.count <= RATE_LIMIT;
    };
    
    // Get cached dashboard or regenerate
    const getCachedDashboard = async () => {
      const now = Date.now();
      if (dashboardCache.html && (now - dashboardCache.timestamp) < CACHE_TTL) {
        return { html: dashboardCache.html, cached: true };
      }
      const { generateAccountDashboard } = require('./slack/accountDashboard');
      const html = await generateAccountDashboard();
      dashboardCache = { html, timestamp: now };
      return { html, cached: false };
    };
    
    // Log dashboard access
    const logAccess = (userName, ip, cached) => {
      dashboardAnalytics.pageViews++;
      if (userName) dashboardAnalytics.uniqueUsers.add(userName);
      dashboardAnalytics.sessions.push({
        user: userName || 'anonymous',
        ip: ip?.replace('::ffff:', ''),
        timestamp: new Date().toISOString(),
        cached
      });
      // Keep only last 500 sessions
      if (dashboardAnalytics.sessions.length > 500) {
        dashboardAnalytics.sessions = dashboardAnalytics.sessions.slice(-500);
      }
    };
    
    this.expressApp.get('/account-dashboard', async (req, res) => {
      const clientIP = req.ip || req.connection?.remoteAddress;
      
      // Rate limiting check
      if (!checkRateLimit(clientIP)) {
        return res.status(429).send('Too many requests. Please wait a moment and try again.');
      }
      
      // Check for Okta SSO session (Okta-only authentication)
      const oktaSession = validateOktaSession(req);
      
      // Only allow access with valid Okta session
      if (oktaSession) {
        try {
          // Log page view to Salesforce (fire-and-forget)
          usageLogger.logPageView(oktaSession, '/account-dashboard', req).catch(() => {});
          
          const userName = oktaSession.name || oktaSession.email;
          const { html, cached } = await getCachedDashboard();
          logAccess(userName, clientIP, cached);
          
          res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline'");
          res.setHeader('Cache-Control', 'private, max-age=60');
          res.send(html);
        } catch (error) {
          res.status(500).send(`Error: ${error.message}`);
        }
      } else {
        // Always redirect to /login for unauthenticated users
        // The /login route handles Okta SSO or falls back to password form
        return res.redirect('/login');
      }
    });
    
    // Password login disabled - redirect to Okta SSO
    this.expressApp.post('/account-dashboard', (req, res) => {
      res.redirect('/login');
    });
    
    // Analytics endpoint (protected - Okta session required)
    this.expressApp.get('/account-dashboard/analytics', (req, res) => {
      const oktaSession = validateOktaSession(req);
      if (!oktaSession) {
        return res.status(401).json({ error: 'Unauthorized - Okta authentication required' });
      }
      res.json({
        pageViews: dashboardAnalytics.pageViews,
        uniqueUsers: dashboardAnalytics.uniqueUsers.size,
        userList: [...dashboardAnalytics.uniqueUsers],
        recentSessions: dashboardAnalytics.sessions.slice(-50),
        cacheStatus: {
          isCached: dashboardCache.html !== null,
          age: dashboardCache.timestamp ? Math.round((Date.now() - dashboardCache.timestamp) / 1000) + 's' : 'N/A',
          ttl: CACHE_TTL / 1000 + 's'
        },
        since: dashboardAnalytics.lastReset
      });
    });
    
    // Force cache refresh endpoint (protected - Okta session required)
    this.expressApp.post('/account-dashboard/refresh-cache', (req, res) => {
      const oktaSession = validateOktaSession(req);
      if (!oktaSession) {
        return res.status(401).json({ error: 'Unauthorized - Okta authentication required' });
      }
      dashboardCache = { html: null, timestamp: 0 };
      res.json({ success: true, message: 'Cache cleared. Next page load will fetch fresh data.' });
    });
    
    // Logout endpoint - clears auth cookie
    this.expressApp.get('/account-dashboard/logout', (req, res) => {
      res.clearCookie(AUTH_COOKIE);
      res.redirect('/account-dashboard');
    });
    
    // Legacy redirect
    this.expressApp.get('/dashboard', (req, res) => {
      res.redirect('/gtm');
    });

    // ═══════════════════════════════════════════════════════════════════════
    // UNIFIED GTM RESOURCES HUB (Okta Protected)
    // ═══════════════════════════════════════════════════════════════════════
    const { generateUnifiedHub } = require('./views/unifiedHub');
    
    // Main unified hub - redirects to login if not authenticated
    this.expressApp.get('/gtm', async (req, res) => {
      const oktaSession = validateOktaSession(req);
      
      if (oktaSession) {
        try {
          // Log page view (fire-and-forget)
          usageLogger.logPageView(oktaSession, '/gtm', req).catch(() => {});
          
          const userName = oktaSession.name || oktaSession.email;
          const isAdmin = ADMIN_EMAILS.includes(oktaSession.email?.toLowerCase());
          const meetingId = req.query.meeting || null;
          const html = generateUnifiedHub({ userName, isAdmin, meetingId });
          res.send(html);
        } catch (error) {
          res.status(500).send(`Error: ${error.message}`);
        }
      } else {
        return res.redirect('/login');
      }
    });
    
    // Dashboard content for iframe (protected - same auth as /gtm)
    this.expressApp.get('/gtm/dashboard', async (req, res) => {
      const oktaSession = validateOktaSession(req);
      
      if (oktaSession) {
        try {
          // Log page view (fire-and-forget)
          usageLogger.logPageView(oktaSession, '/gtm/dashboard', req).catch(() => {});
          
          const { html, cached } = await getCachedDashboard();
          res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline'");
          res.setHeader('Cache-Control', 'private, max-age=60');
          res.send(html);
        } catch (error) {
          res.status(500).send(`Error: ${error.message}`);
        }
      } else {
        res.status(401).send('Unauthorized');
      }
    });

    // Meeting Prep view for iframe (protected - same auth as /gtm)
    this.expressApp.get('/gtm/meeting-prep', async (req, res) => {
      const oktaSession = validateOktaSession(req);
      
      if (oktaSession) {
        try {
          // Log page view (fire-and-forget)
          usageLogger.logPageView(oktaSession, '/gtm/meeting-prep', req).catch(() => {});
          
          const { generateMeetingPrepHTML } = require('./views/meetingPrepView');
          // Auto-filter to logged-in user's meetings (unless explicitly overridden via query param)
          let filterUserId = req.query.filterUser || null;
          if (!filterUserId && oktaSession.email) {
            try {
              const meetingPrepService = require('./services/meetingPrepService');
              const blUsers = await meetingPrepService.getBLUsers();
              const matchedUser = blUsers.find(u => u.email === oktaSession.email);
              if (matchedUser) filterUserId = matchedUser.userId;
            } catch (e) { /* fallback: show all */ }
          }
          const html = await generateMeetingPrepHTML(filterUserId);
          res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline'");
          res.send(html);
        } catch (error) {
          logger.error('Error generating meeting prep view:', error);
          res.status(500).send(`Error: ${error.message}`);
        }
      } else {
        res.status(401).send('Unauthorized');
      }
    });

    // Meeting Prep detail view (shareable URL for specific meeting)
    this.expressApp.get('/gtm/meeting-prep/:meetingId', async (req, res) => {
      const oktaSession = validateOktaSession(req);
      
      if (oktaSession) {
        try {
          const { generateMeetingPrepHTML } = require('./views/meetingPrepView');
          const html = await generateMeetingPrepHTML();
          // The meetingId is handled client-side via URL parsing
          res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline'");
          res.send(html);
        } catch (error) {
          logger.error('Error generating meeting prep view:', error);
          res.status(500).send(`Error: ${error.message}`);
        }
      } else {
        res.status(401).send('Unauthorized');
      }
    });

    // Meeting Prep JSON API — returns meeting data for client-side hydration
    // Used by the async-loading shell to avoid blocking the initial page render
    // IMPORTANT: If the calendar cache is cold and a fetch is already in progress,
    // this returns { loading: true } IMMEDIATELY instead of blocking for 15s.
    // The client polls with short intervals until data is ready.
    this.expressApp.get('/api/meeting-prep/meetings', async (req, res) => {
      const oktaSession = validateOktaSession(req);
      if (!oktaSession) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      try {
        const meetingPrepService = require('./services/meetingPrepService');
        const { getCalendarCacheStatus, calendarService } = require('./services/calendarService');
        const syncStatus = getCalendarCacheStatus();
        
        // FAST: If cache is warm, return data immediately
        if (syncStatus.cacheValid && syncStatus.databaseStats?.totalEvents > 0) {
          const weekRange = meetingPrepService.getCurrentWeekRange();
          const filterUserId = req.query.filterUser || null;
          let meetings = await meetingPrepService.getUpcomingMeetings(weekRange.start, weekRange.end);
          
          let blUsers = [];
          try { blUsers = await meetingPrepService.getBLUsers(); } catch (e) { /* continue */ }
          
          if (filterUserId) {
            const selectedUser = blUsers.find(u => u.userId === filterUserId);
            const userEmail = selectedUser?.email || null;
            meetings = meetingPrepService.filterMeetingsByUser(meetings, filterUserId, userEmail);
          }
          
          return res.json({ meetings, syncStatus, blUsers });
        }
        
        // SLOW: Cache is cold — check if a fetch is already in progress
        if (syncStatus.syncInProgress) {
          // Don't block — return immediately and let client poll
          logger.info('[MeetingPrep API] Calendar fetch in progress, returning loading state');
          return res.json({ meetings: [], loading: true, syncStatus });
        }
        
        // NO FETCH IN PROGRESS: Trigger the fetch and await it (this is the first call)
        logger.info('[MeetingPrep API] Cold cache, triggering calendar fetch...');
        const weekRange = meetingPrepService.getCurrentWeekRange();
        const filterUserId = req.query.filterUser || null;
        let meetings = await meetingPrepService.getUpcomingMeetings(weekRange.start, weekRange.end);
        
        let blUsers = [];
        try { blUsers = await meetingPrepService.getBLUsers(); } catch (e) { /* continue */ }
        
        if (filterUserId) {
          const selectedUser = blUsers.find(u => u.userId === filterUserId);
          const userEmail = selectedUser?.email || null;
          meetings = meetingPrepService.filterMeetingsByUser(meetings, filterUserId, userEmail);
        }
        
        const updatedStatus = getCalendarCacheStatus();
        res.json({ meetings, syncStatus: updatedStatus, blUsers });
      } catch (error) {
        logger.error('Error fetching meeting prep data:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // GTM Brain tab (full-page query UI; same backend as Obsidian plugin)
    this.expressApp.get('/gtm/gtm-brain', async (req, res) => {
      const oktaSession = validateOktaSession(req);
      if (!oktaSession) {
        return res.redirect('/login');
      }
      try {
        usageLogger.logPageView(oktaSession, '/gtm/gtm-brain', req).catch(() => {});
        const { generate } = require('./views/gtmBrainView');
        const userName = oktaSession.name || oktaSession.email || 'User';
        const html = generate({ userName, userEmail: oktaSession.email || '' });
        res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline'");
        res.send(html);
      } catch (error) {
        logger.error('Error generating GTM Brain view:', error);
        res.status(500).send(`Error: ${error.message}`);
      }
    });
    
    // GTM Hub logout
    this.expressApp.get('/gtm/logout', (req, res) => {
      const oktaSession = validateOktaSession(req);
      
      // Log logout event (fire-and-forget)
      if (oktaSession) {
        usageLogger.logLogout(oktaSession, req).catch(() => {});
      }
      
      res.clearCookie(OKTA_SESSION_COOKIE);
      res.clearCookie('gtm_dash_auth');
      res.clearCookie('gtm_dash_user');
      res.redirect('/gtm');
    });

    // GTM Analytics view (admin only)
    this.expressApp.get('/gtm/analytics', async (req, res) => {
      const oktaSession = validateOktaSession(req);
      
      if (!oktaSession) {
        return res.redirect('/login');
      }
      
      // Check if user is admin
      const isAdmin = ADMIN_EMAILS.includes(oktaSession.email?.toLowerCase());
      if (!isAdmin) {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html><head><meta charset="UTF-8"><title>Access Denied</title>
          <style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f7fe;margin:0}.error{background:#fff;padding:40px;border-radius:12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1)}h1{color:#dc2626;margin-bottom:8px}p{color:#6b7280}a{color:#8e99e1}</style>
          </head><body><div class="error"><h1>Access Denied</h1><p>Analytics is restricted to administrators.</p><a href="/gtm">Return to GTM Hub</a></div></body></html>
        `);
      }
      
      try {
        // Log page view (fire-and-forget)
        usageLogger.logPageView(oktaSession, '/gtm/analytics', req).catch(() => {});
        
        const { generateAnalyticsHTML } = require('./views/analyticsView');
        const html = await generateAnalyticsHTML();
        res.send(html);
      } catch (error) {
        logger.error('Error generating analytics view:', error);
        res.status(500).send(`Error: ${error.message}`);
      }
    });

    // Email Builder interface
    this.expressApp.get('/email-builder', (req, res) => {
      const path = require('path');
      const builderPath = path.join(__dirname, 'views', 'email-builder.html');
      res.sendFile(builderPath);
    });

    // GTM-Brain Command Cheat Sheet (inline for reliable deployment)
    this.expressApp.get('/cheat-sheet', (req, res) => {
      res.send(generateCheatSheetHTML());
    });
    
    // Alias routes for cheat sheet
    this.expressApp.get('/queries', (req, res) => res.redirect('/cheat-sheet'));
    this.expressApp.get('/commands', (req, res) => res.redirect('/cheat-sheet'));
    this.expressApp.get('/help', (req, res) => res.redirect('/cheat-sheet'));

    // Sales Process & RevOps Playbook
    this.expressApp.get('/sales-process', (req, res) => {
      const path = require('path');
      const processPath = path.join(__dirname, '..', 'docs', 'sales-process.html');
      res.sendFile(processPath);
    });
    this.expressApp.get('/playbook', (req, res) => res.redirect('/sales-process'));
    this.expressApp.get('/revops', (req, res) => res.redirect('/sales-process'));

    // Getting Started / Onboarding Guide
    this.expressApp.get('/getting-started', (req, res) => {
      const path = require('path');
      const startPath = path.join(__dirname, '..', 'docs', 'getting-started.html');
      res.sendFile(startPath);
    });
    this.expressApp.get('/onboarding', (req, res) => res.redirect('/getting-started'));
    this.expressApp.get('/setup', (req, res) => res.redirect('/getting-started'));

    // Marketing Cursor Guide
    this.expressApp.get('/marketing-guide', (req, res) => {
      const path = require('path');
      const guidePath = path.join(__dirname, '..', 'docs', 'marketing-guide.html');
      res.sendFile(guidePath);
    });

    // Outbound Playbook (Private - Keigan only)
    this.expressApp.get('/outbound-playbook', (req, res) => {
      const path = require('path');
      const playbookPath = path.join(__dirname, '..', 'docs', 'outbound-playbook.html');
      res.sendFile(playbookPath);
    });
    this.expressApp.get('/outbound', (req, res) => res.redirect('/outbound-playbook'));
    this.expressApp.get('/playbook', (req, res) => res.redirect('/outbound-playbook'));

    // Cadence Generator (5-step email sequences)
    this.expressApp.get('/cadence-generator', (req, res) => {
      const path = require('path');
      const cadencePath = path.join(__dirname, '..', 'docs', 'cadence-generator.html');
      res.sendFile(cadencePath);
    });
    this.expressApp.get('/cadence', (req, res) => res.redirect('/cadence-generator'));
    this.expressApp.get('/sequences', (req, res) => res.redirect('/cadence-generator'));

    // GTM Brain Architecture / Data Flow Diagram
    this.expressApp.get('/architecture', (req, res) => {
      const path = require('path');
      const archPath = path.join(__dirname, '..', 'docs', 'gtm-brain-architecture.html');
      res.sendFile(archPath);
    });
    this.expressApp.get('/data-flow', (req, res) => res.redirect('/architecture'));
    this.expressApp.get('/how-it-works', (req, res) => res.redirect('/architecture'));

    // Security & Compliance Documentation
    this.expressApp.get('/security', (req, res) => {
      res.send(generateSecurityCompliancePage());
    });
    this.expressApp.get('/compliance', (req, res) => res.redirect('/security'));
    this.expressApp.get('/soc2', (req, res) => res.redirect('/security'));

    // CAB Survey
    this.expressApp.get('/cab-survey', (req, res) => {
      const path = require('path');
      const surveyPath = path.join(__dirname, '..', 'docs', 'cab-survey.html');
      res.sendFile(surveyPath);
    });
    this.expressApp.get('/survey', (req, res) => res.redirect('/cab-survey'));

    // ═══════════════════════════════════════════════════════════════════════════
    // ENGINEERING CUSTOMER KEYS PORTAL
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Engineering Portal - Simple auth middleware
    const ENGINEERING_ACCESS_KEY = process.env.ENGINEERING_ACCESS_KEY || 'eudia-eng-2026';
    
    const checkEngineeringAccess = (req, res, next) => {
      // Check for access key in query, header, or session cookie
      const accessKey = req.query.key || req.headers['x-engineering-key'] || req.cookies?.engineeringKey;
      
      if (accessKey === ENGINEERING_ACCESS_KEY) {
        // Set cookie for future requests (7 days)
        res.cookie('engineeringKey', accessKey, { 
          maxAge: 7 * 24 * 60 * 60 * 1000, 
          httpOnly: true,
          sameSite: 'strict'
        });
        return next();
      }
      
      // If no valid key, show login form
      if (!req.query.key) {
        return res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Engineering Access</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
      background: #0d1117; 
      color: #c9d1d9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-box {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 32px;
      max-width: 400px;
      width: 100%;
    }
    h2 { margin-bottom: 8px; color: #f0f6fc; }
    p { color: #8b949e; font-size: 0.875rem; margin-bottom: 20px; }
    input {
      width: 100%;
      padding: 10px 14px;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #c9d1d9;
      font-size: 0.875rem;
      margin-bottom: 16px;
    }
    input:focus { outline: none; border-color: #58a6ff; }
    button {
      width: 100%;
      padding: 10px 14px;
      background: #238636;
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
    }
    button:hover { background: #2ea043; }
    .error { color: #f85149; font-size: 0.8rem; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="login-box">
    <h2>Engineering Portal</h2>
    <p>Enter the access key to view customer deployment info.</p>
    <form method="GET">
      <input type="password" name="key" placeholder="Access Key" required autofocus>
      <button type="submit">Access Portal</button>
    </form>
  </div>
</body>
</html>
        `);
      }
      
      // Invalid key provided
      return res.status(401).send(`
<!DOCTYPE html>
<html>
<head>
  <title>Engineering Access</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
      background: #0d1117; 
      color: #c9d1d9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-box {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 32px;
      max-width: 400px;
      width: 100%;
    }
    h2 { margin-bottom: 8px; color: #f0f6fc; }
    p { color: #8b949e; font-size: 0.875rem; margin-bottom: 20px; }
    input {
      width: 100%;
      padding: 10px 14px;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #c9d1d9;
      font-size: 0.875rem;
      margin-bottom: 16px;
    }
    input:focus { outline: none; border-color: #58a6ff; }
    button {
      width: 100%;
      padding: 10px 14px;
      background: #238636;
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
    }
    button:hover { background: #2ea043; }
    .error { color: #f85149; font-size: 0.8rem; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="login-box">
    <h2>Engineering Portal</h2>
    <p class="error">Invalid access key. Please try again.</p>
    <form method="GET">
      <input type="password" name="key" placeholder="Access Key" required autofocus>
      <button type="submit">Access Portal</button>
    </form>
  </div>
</body>
</html>
      `);
    };
    
    // Engineering Portal - View closed-won customers for deployment
    this.expressApp.get('/engineering/customers', checkEngineeringAccess, async (req, res) => {
      try {
        const { generateEngineeringPortal } = require('./views/engineeringPortal');
        const { query } = require('./salesforce/connection');
        const fs = require('fs');
        const path = require('path');
        
        let customers = [];
        let fieldsAccessible = true;
        
        // Load static customer data (from imported Excel)
        let staticCustomers = [];
        try {
          const staticPath = path.join(__dirname, '../data/signed-customers.json');
          if (fs.existsSync(staticPath)) {
            const staticData = JSON.parse(fs.readFileSync(staticPath, 'utf8'));
            staticCustomers = staticData.customers || [];
            logger.info('Engineering portal: Loaded ' + staticCustomers.length + ' customers from static file');
          }
        } catch (staticError) {
          logger.warn('Engineering portal: Could not load static customer data', { error: staticError.message });
        }
        
        // Try to enrich with Salesforce data
        let sfCustomerMap = new Map();
        try {
          const sfQuery = `
            SELECT Id, Name, Legal_Entity_Name__c, Company_Context__c, 
                   Industry, Website, LastModifiedDate,
                   (SELECT Id, Name, Amount, CloseDate, StageName 
                    FROM Opportunities 
                    WHERE IsClosed = true AND IsWon = true
                    ORDER BY CloseDate DESC LIMIT 1)
            FROM Account
            WHERE Id IN (SELECT AccountId FROM Opportunity WHERE IsClosed = true AND IsWon = true)
               OR Legal_Entity_Name__c != null
            ORDER BY Name ASC
            LIMIT 200
          `;
          
          const result = await query(sfQuery, true);
          logger.info('Engineering portal: SF query returned ' + (result?.records?.length || 0) + ' accounts');
          
          // Build map of Salesforce customers by name (lowercase for matching)
          (result?.records || []).forEach(acc => {
            const latestOpp = acc.Opportunities?.records?.[0];
            sfCustomerMap.set(acc.Name.toLowerCase(), {
              accountId: acc.Id,
              accountName: acc.Name,
              legalEntity: acc.Legal_Entity_Name__c || acc.Name,
              context: acc.Company_Context__c || acc.Industry || '',
              website: acc.Website || '',
              dealValue: latestOpp?.Amount ? `$${Number(latestOpp.Amount).toLocaleString()}` : '',
              closeDate: latestOpp?.CloseDate ? new Date(latestOpp.CloseDate).toLocaleDateString() : ''
            });
          });
        } catch (sfError) {
          logger.warn('Engineering portal: Salesforce query failed, using static data only', { error: sfError.message });
        }
        
        // Merge: static data as base (has good context), Salesforce enriches with deal info
        // IMPORTANT: Static data has the authoritative context/legal entity from Excel import
        const seenNames = new Set();
        
        // Build a lookup from static customers (by lowercase name)
        const staticLookup = new Map();
        staticCustomers.forEach(sc => {
          staticLookup.set(sc.accountName.toLowerCase(), sc);
        });
        
        // First, add all static customers (they have the good context data)
        staticCustomers.forEach(sc => {
          const key = sc.accountName.toLowerCase();
          const sfData = sfCustomerMap.get(key);
          
          customers.push({
            accountId: sfData?.accountId || null,
            accountName: sc.accountName,
            legalEntity: sc.legalEntity || sfData?.legalEntity || sc.accountName,
            context: sc.context || sfData?.context || '', // Static context takes priority
            website: sfData?.website || '',
            dealValue: sfData?.dealValue || '',
            closeDate: sfData?.closeDate || ''
          });
          seenNames.add(key);
        });
        
        // NOTE: Only show customers from static file (source of truth)
        // Salesforce customers NOT in static file are intentionally excluded
        
        // Sort alphabetically
        customers.sort((a, b) => a.accountName.localeCompare(b.accountName));
        
        logger.info('Engineering portal: Total customers after merge: ' + customers.length);
        
        const html = generateEngineeringPortal(customers, { fieldsAccessible });
        res.send(html);
      } catch (error) {
        logger.error('Failed to load engineering portal', { error: error.message });
        res.status(500).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Error - Engineering Portal</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { 
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #0d1117;
                color: #c9d1d9;
              }
              .container { text-align: center; padding: 40px; max-width: 500px; }
              .logo-text { font-size: 24px; font-weight: 600; margin-bottom: 32px; color: #8b9bf4; }
              .card {
                background: #161b22;
                border: 1px solid #30363d;
                border-radius: 12px;
                padding: 32px;
              }
              .error-icon {
                width: 56px; height: 56px;
                background: rgba(239, 68, 68, 0.15);
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                margin: 0 auto 20px;
              }
              .error-icon svg { width: 28px; height: 28px; stroke: #f85149; stroke-width: 2; fill: none; }
              h1 { font-size: 20px; font-weight: 600; margin-bottom: 12px; color: #f0f6fc; }
              .subtitle { color: #8b949e; font-size: 14px; margin-bottom: 16px; }
              .error-msg { 
                color: #f85149; font-size: 12px; 
                background: rgba(248, 81, 73, 0.1); 
                padding: 12px; border-radius: 6px; 
                font-family: monospace; text-align: left;
                word-break: break-word;
              }
              .retry-btn {
                display: inline-block; margin-top: 20px; padding: 10px 24px;
                background: #21262d; border: 1px solid #30363d;
                color: #c9d1d9; font-size: 14px; font-weight: 500; border-radius: 6px;
                cursor: pointer; transition: all 0.15s; text-decoration: none;
              }
              .retry-btn:hover { background: #30363d; border-color: #8b949e; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="logo-text">Engineering Portal</div>
              <div class="card">
                <div class="error-icon">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <h1>Failed to Load</h1>
                <p class="subtitle">There was an error loading customer data.</p>
                <p class="error-msg">${error.message}</p>
                <a href="/engineering/customers" class="retry-btn">Retry</a>
              </div>
            </div>
          </body>
          </html>
        `);
      }
    });
    
    // Engineering Portal API - JSON endpoint (also protected)
    this.expressApp.get('/api/engineering/customers', checkEngineeringAccess, async (req, res) => {
      try {
        const { query } = require('./salesforce/connection');
        
        const sfQuery = `
          SELECT Id, Name, Legal_Entity_Name__c, Company_Context__c, 
                 Deployment_Approved__c, LastModifiedDate
          FROM Account
          WHERE Deployment_Approved__c = true
          ORDER BY Name ASC
          LIMIT 200
        `;
        
        const result = await query(sfQuery, true);
        
        const customers = (result?.records || []).map(acc => ({
          accountId: acc.Id,
          accountName: acc.Name,
          legalEntity: acc.Legal_Entity_Name__c || '',
          context: acc.Company_Context__c || '',
          approvedDate: acc.LastModifiedDate ? new Date(acc.LastModifiedDate).toLocaleDateString() : ''
        }));
        
        res.json({ success: true, customers, count: customers.length });
      } catch (error) {
        logger.error('Failed to fetch engineering customers', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Redirect shorthand
    this.expressApp.get('/engineering', (req, res) => res.redirect('/engineering/customers'));
    this.expressApp.get('/eng-customers', (req, res) => res.redirect('/engineering/customers'));
    this.expressApp.get('/customer-keys', (req, res) => res.redirect('/engineering/customers'));

    // ═══════════════════════════════════════════════════════════════════════════
    // CALL INTELLIGENCE API (P5)
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Get team coaching leaderboard
    this.expressApp.get('/api/call-intelligence/leaderboard', async (req, res) => {
      try {
        const callIntelligence = require('./services/callIntelligence');
        const days = parseInt(req.query.days) || 30;
        const leaderboard = callIntelligence.getTeamLeaderboard(days);
        res.json({ success: true, leaderboard });
      } catch (error) {
        logger.error('Failed to get leaderboard', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get rep coaching insights
    this.expressApp.get('/api/call-intelligence/rep/:repId', async (req, res) => {
      try {
        const callIntelligence = require('./services/callIntelligence');
        const { repId } = req.params;
        const days = parseInt(req.query.days) || 30;
        const insights = callIntelligence.getRepCoachingInsights(repId, days);
        res.json({ success: true, insights });
      } catch (error) {
        logger.error('Failed to get rep insights', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Analyze a call recording
    this.expressApp.post('/api/call-intelligence/analyze', async (req, res) => {
      try {
        const callIntelligence = require('./services/callIntelligence');
        const { audioBase64, accountId, accountName, repId, repName } = req.body;
        
        if (!audioBase64) {
          return res.status(400).json({ success: false, error: 'audioBase64 required' });
        }
        
        const result = await callIntelligence.analyzeCall({
          audioBase64,
          accountId,
          accountName,
          repId,
          repName
        });
        
        res.json(result);
      } catch (error) {
        logger.error('Failed to analyze call', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // EMAIL INTELLIGENCE API (P4)
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Process inbound email case
    this.expressApp.post('/api/email-intelligence/process', async (req, res) => {
      try {
        const emailIntelligence = require('./services/emailIntelligence');
        const result = await emailIntelligence.processInboundEmail(req.body);
        res.json(result);
      } catch (error) {
        logger.error('Failed to process email', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get weekly email digest
    this.expressApp.get('/api/email-intelligence/digest', async (req, res) => {
      try {
        const emailIntelligence = require('./services/emailIntelligence');
        const digest = await emailIntelligence.generateWeeklyDigest();
        res.json(digest);
      } catch (error) {
        logger.error('Failed to generate email digest', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Obsidian Setup Guide for BL Onboarding
    this.expressApp.get('/setup/obsidian', (req, res) => {
      const path = require('path');
      const setupPath = path.join(__dirname, 'views', 'obsidian-setup.html');
      res.sendFile(setupPath);
    });
    this.expressApp.get('/obsidian-setup', (req, res) => res.redirect('/setup/obsidian'));
    
    // Demo walkthrough pages
    this.expressApp.get('/demo', (req, res) => {
      const path = require('path');
      res.sendFile(path.join(__dirname, 'views', 'demo-walkthrough.html'));
    });
    
    this.expressApp.get('/sf-walkthrough', (req, res) => {
      const path = require('path');
      res.sendFile(path.join(__dirname, 'views', 'sf-walkthrough.html'));
    });
    
    // Serve downloadable files (Sync-Notes.command, etc.)
    const path = require('path');
    this.expressApp.use('/downloads', express.static(path.join(__dirname, '..', 'public', 'downloads')));
    this.expressApp.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets'), { maxAge: '1h' }));

    // ═══════════════════════════════════════════════════════════════════════════
    // MOBILE PWA ROUTES
    // Progressive Web App for mobile access to Sales Vault
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Serve PWA manifest
    this.expressApp.get('/manifest.json', (req, res) => {
      const manifestPath = path.join(__dirname, '..', 'public', 'manifest.json');
      res.setHeader('Content-Type', 'application/manifest+json');
      res.sendFile(manifestPath);
    });
    
    // Serve service worker (must be at root scope)
    this.expressApp.get('/service-worker.js', (req, res) => {
      const swPath = path.join(__dirname, '..', 'public', 'service-worker.js');
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Service-Worker-Allowed', '/');
      res.sendFile(swPath);
    });
    
    // Serve mobile recorder script
    this.expressApp.get('/mobile-recorder.js', (req, res) => {
      const recorderPath = path.join(__dirname, '..', 'public', 'mobile-recorder.js');
      res.setHeader('Content-Type', 'application/javascript');
      res.sendFile(recorderPath);
    });
    
    // Serve offline storage script
    this.expressApp.get('/offline-storage.js', (req, res) => {
      const storagePath = path.join(__dirname, '..', 'public', 'offline-storage.js');
      res.setHeader('Content-Type', 'application/javascript');
      res.sendFile(storagePath);
    });
    
    // Mobile vault - main PWA entry point
    const { generateMobileVault } = require('./views/mobileVault');
    
    this.expressApp.get('/mobile', async (req, res) => {
      try {
        // Try Okta session first
        const oktaSession = validateOktaSession(req);
        
        // Also check for Salesforce OAuth token via email param or cookie
        const emailParam = req.query.email || req.cookies?.userEmail;
        
        let userEmail = '';
        let userName = 'User';
        let sfAuthenticated = false;
        
        if (oktaSession) {
          userEmail = oktaSession.email;
          userName = oktaSession.name || oktaSession.email;
          
          // Check if they also have Salesforce OAuth
          try {
            const userTokenService = require('./services/userTokenService');
            const sfStatus = await userTokenService.checkAuthStatus(userEmail);
            sfAuthenticated = sfStatus.authenticated;
          } catch (e) {
            // Ignore - they just need to auth
          }
        } else if (emailParam) {
          // Mobile users might come with email param after SF OAuth
          const normalizedEmail = emailParam.toLowerCase().trim();
          
          // Validate email is in BL_EMAILS list
          const BL_EMAILS = [
            ...Object.values(BL_REGIONS).flat(),
            ...Object.keys(SALES_LEADERS),
            ...ADMIN_EMAILS,
            ...EXEC_EMAILS,
            ...CS_EMAILS
          ];
          
          if (BL_EMAILS.includes(normalizedEmail)) {
            userEmail = normalizedEmail;
            userName = normalizedEmail.split('@')[0].replace('.', ' ');
            
            // Check SF auth
            try {
              const userTokenService = require('./services/userTokenService');
              const sfStatus = await userTokenService.checkAuthStatus(userEmail);
              sfAuthenticated = sfStatus.authenticated;
            } catch (e) {
              // Ignore
            }
            
            // Set cookie for future visits
            res.cookie('userEmail', normalizedEmail, { 
              httpOnly: true, 
              secure: true, 
              sameSite: 'lax',
              maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });
          }
        }
        
        // If no auth at all, redirect to login
        if (!userEmail) {
          return res.redirect('/mobile/login');
        }
        
        // Log mobile access
        logger.info(`📱 Mobile vault accessed by ${userEmail}`);
        
        const html = generateMobileVault({
          userEmail,
          userName,
          sfAuthenticated,
          tab: req.query.tab || 'accounts',
          action: req.query.action || null
        });
        
        res.send(html);
        
      } catch (error) {
        logger.error('Error serving mobile vault:', error);
        res.status(500).send('Something went wrong. Please try again.');
      }
    });
    
    // Mobile login page
    this.expressApp.get('/mobile/login', (req, res) => {
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#7c3aed">
  <title>Login - Sales Vault</title>
  <link rel="manifest" href="/manifest.json">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .logo { margin-bottom: 24px; }
    .logo img { height: 60px; border-radius: 8px; }
    h1 { color: white; font-size: 1.8rem; margin-bottom: 8px; }
    p { color: rgba(255,255,255,0.8); margin-bottom: 32px; }
    .login-card {
      background: white;
      border-radius: 16px;
      padding: 32px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .login-card h2 { margin-bottom: 8px; color: #1f2937; }
    .login-card .subtitle { color: #6b7280; margin-bottom: 24px; font-size: 0.9rem; }
    .input-group { margin-bottom: 16px; }
    .input-group label { display: block; color: #374151; font-weight: 500; margin-bottom: 6px; font-size: 0.9rem; }
    .input-group input {
      width: 100%;
      padding: 14px 16px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .input-group input:focus { border-color: #7c3aed; }
    .login-btn {
      width: 100%;
      padding: 14px;
      background: #7c3aed;
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
    }
    .login-btn:hover { background: #6d28d9; }
    .divider { display: flex; align-items: center; margin: 24px 0; color: #9ca3af; font-size: 0.8rem; }
    .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #e5e7eb; }
    .divider span { padding: 0 12px; }
    .okta-btn {
      width: 100%;
      padding: 14px;
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .okta-btn:hover { background: #e5e7eb; }
    .error { color: #ef4444; font-size: 0.85rem; margin-top: 8px; display: none; }
  </style>
</head>
<body>
  <div class="logo"><img src="/logo" alt="Eudia"></div>
  <h1>Sales Vault</h1>
  <p>Mobile access to your accounts and meetings</p>
  
  <div class="login-card">
    <h2>Sign In</h2>
    <p class="subtitle">Use your Eudia email to continue</p>
    
    <form id="loginForm" action="/mobile" method="GET">
      <div class="input-group">
        <label for="email">Email Address</label>
        <input type="email" id="email" name="email" placeholder="you@eudia.com" required>
      </div>
      <div class="error" id="error">Invalid email. Please use your Eudia email.</div>
      <button type="submit" class="login-btn">Continue</button>
    </form>
    
    <div class="divider"><span>or</span></div>
    
    <a href="/login?redirect=/mobile" class="okta-btn">
      <span>🔐</span>
      Sign in with Okta SSO
    </a>
  </div>
  
  <script>
    document.getElementById('loginForm').addEventListener('submit', (e) => {
      const email = document.getElementById('email').value.toLowerCase();
      if (!email.endsWith('@eudia.com')) {
        e.preventDefault();
        document.getElementById('error').style.display = 'block';
      }
    });
  </script>
</body>
</html>`);
    });
    
    // Mobile logout
    this.expressApp.get('/mobile/logout', (req, res) => {
      res.clearCookie('userEmail');
      res.redirect('/mobile/login');
    });

    // Email Builder API routes
    const emailBuilderRoutes = require('./routes/emailBuilder');
    this.expressApp.get('/api/search-accounts', emailBuilderRoutes.searchAccounts);
    this.expressApp.get('/api/enrich-company', emailBuilderRoutes.enrichCompany);
    this.expressApp.post('/api/generate-email', emailBuilderRoutes.generateEmail);
    
    // Test endpoint to manually send weekly report
    this.expressApp.get('/send-report-test', async (req, res) => {
      try {
        // Check if email credentials are configured (Microsoft Graph API)
        const hasEmail = !!process.env.OUTLOOK_EMAIL;
        const hasTenantId = !!process.env.AZURE_TENANT_ID;
        const hasClientId = !!process.env.AZURE_CLIENT_ID;
        const hasClientSecret = !!process.env.AZURE_CLIENT_SECRET;
        
        if (!hasEmail || !hasTenantId || !hasClientId || !hasClientSecret) {
          return res.status(500).json({
            success: false,
            error: 'Email not configured - Microsoft Graph credentials required',
            details: {
              OUTLOOK_EMAIL: hasEmail ? 'Set ✓' : 'MISSING',
              AZURE_TENANT_ID: hasTenantId ? 'Set ✓' : 'MISSING',
              AZURE_CLIENT_ID: hasClientId ? 'Set ✓' : 'MISSING',
              AZURE_CLIENT_SECRET: hasClientSecret ? 'Set ✓' : 'MISSING'
            },
            instructions: [
              '1. Go to https://dashboard.render.com/',
              '2. Select gtm-brain service',
              '3. Click Environment tab',
              '4. Add these 4 variables:',
              '   OUTLOOK_EMAIL = keigan.pesenti@eudia.com',
              '   AZURE_TENANT_ID = cffa60d1-f3a2-4dd4-ae1f-9f487c9aa539',
              '   AZURE_CLIENT_ID = 21c93bc6-1bee-43ed-ae93-a33da98726d7',
              '   AZURE_CLIENT_SECRET = [your client secret]',
              '5. Save (service will redeploy)',
              '6. Try this endpoint again'
            ]
          });
        }
        
        const { sendReportNow } = require('./slack/weeklyReport');
        const result = await sendReportNow(true); // Test mode
        res.json({ 
          success: true, 
          message: 'Report sent to keigan.pesenti@eudia.com', 
          result,
          note: 'Check your email inbox for the Excel report'
        });
      } catch (error) {
        res.status(500).json({ 
          success: false, 
          error: error.message,
          details: error.code === 'EAUTH' ? 'Authentication failed - check OUTLOOK_PASSWORD is correct' : undefined,
          config: {
            email: process.env.OUTLOOK_EMAIL || 'NOT SET',
            smtp: 'smtp.office365.com:587'
          }
        });
      }
    });

    // Test endpoint for BL Weekly Summary (sends to Keigan's DM in test mode)
    this.expressApp.get('/send-bl-summary-test', async (req, res) => {
      try {
        const { sendBLSummaryNow } = require('./slack/blWeeklySummary');
        const result = await sendBLSummaryNow(this.app, true); // Test mode - sends to personal DM
        res.json({ 
          success: true, 
          message: 'BL Summary sent in test mode',
          result,
          note: 'Check your Slack DM for the summary'
        });
      } catch (error) {
        res.status(500).json({ 
          success: false, 
          error: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    });

    // Preview Closed Won Alert - sends test message to DM for QA before actual close
    this.expressApp.get('/preview-closed-won', async (req, res) => {
      try {
        const { formatClosedWonMessage } = require('./services/closedWonAlerts');
        const testUserId = process.env.CLOSED_WON_ALERT_USER || 'U094AQE9V7D';
        
        // OpenAI deal preview with override
        const previewMessage = formatClosedWonMessage({
          accountName: 'OpenAi',
          oppName: 'OpenAI ODL ---> MLS',
          productLine: 'Other Managed Service',
          acv: '$1,477,941',
          salesType: 'Expansion',
          renewalNetChange: '$0',
          rawNetChange: 0,
          closeDate: 'January 15, 2026',
          revenueType: 'Recurring, Project, or Commit',
          ownerName: 'Alex Fox',
          isConfidential: false,
          typeOverride: 'Subject to Finance Review*',
          footnote: '*No incremental revenue vs. December run-rate. 21-month term secures capacity for near-term expansion.'
        });
        
        await this.app.client.chat.postMessage({
          channel: testUserId,
          text: `📋 *PREVIEW - Closed Won Alert*\n_This is how it will appear when you close the deal:_\n\n---\n\n${previewMessage}`,
          unfurl_links: false
        });
        
        res.json({ 
          success: true, 
          message: 'Preview sent to your DM',
          preview: previewMessage
        });
      } catch (error) {
        res.status(500).json({ 
          success: false, 
          error: error.message
        });
      }
    });

    // Check alert subscriptions status
    this.expressApp.get('/alert-status', async (req, res) => {
      res.json({
        closedWonAlerts: {
          enabled: process.env.CLOSED_WON_ALERTS_ENABLED === 'true',
          channel: process.env.CLOSED_WON_ALERT_CHANNEL ? 'configured' : 'NOT SET',
          user: process.env.CLOSED_WON_ALERT_USER ? 'configured' : 'NOT SET'
        },
        csStaffingAlerts: {
          enabled: process.env.CS_STAFFING_ALERTS_ENABLED === 'true',
          channel: process.env.CS_STAFFING_ALERT_CHANNEL || 'NOT SET'
        }
      });
    });

    // Preview CS Staffing Alert - sends test message to verify channel works
    this.expressApp.get('/preview-cs-staffing', async (req, res) => {
      try {
        const { formatCSStaffingMessage } = require('./services/csStaffingAlerts');
        const channelId = process.env.CS_STAFFING_ALERT_CHANNEL;
        
        if (!channelId) {
          return res.status(400).json({ 
            success: false, 
            error: 'CS_STAFFING_ALERT_CHANNEL not configured'
          });
        }
        
        const testMessage = formatCSStaffingMessage({
          accountName: 'TEST ACCOUNT',
          opportunityName: 'Test Opportunity - Stage 4 Alert',
          stageName: 'Stage 4 - Proposal',
          acv: '$50,000',
          productLine: 'AI Contracting – Managed Services',
          ownerName: 'Test User',
          targetSignDate: 'Feb 28, 2026',
          oppUrl: 'https://eudia.lightning.force.com/lightning/r/Opportunity/006000000000000AAA/view'
        });
        
        await this.app.client.chat.postMessage({
          channel: channelId,
          text: `🧪 *TEST - CS Staffing Alert Preview*\n_This is a test message to verify the channel is working:_\n\n---\n\n${testMessage}`,
          unfurl_links: false
        });
        
        res.json({ 
          success: true, 
          message: `Preview sent to channel ${channelId}`,
          preview: testMessage
        });
      } catch (error) {
        res.status(500).json({ 
          success: false, 
          error: error.message,
          details: error.data || null
        });
      }
    });

    // Send BL Summary to production channel (use with caution)
    this.expressApp.get('/send-bl-summary-prod', async (req, res) => {
      try {
        const { sendBLSummaryNow } = require('./slack/blWeeklySummary');
        const result = await sendBLSummaryNow(this.app, false); // Production mode
        res.json({ 
          success: true, 
          message: 'BL Summary sent to #gtm-account-planning',
          result
        });
      } catch (error) {
        res.status(500).json({ 
          success: false, 
          error: error.message
        });
      }
    });

    // View current BL snapshot data
    this.expressApp.get('/bl-summary-data', async (req, res) => {
      try {
        const { getSnapshotData, queryBLMetrics } = require('./slack/blWeeklySummary');
        const snapshots = getSnapshotData();
        const currentMetrics = await queryBLMetrics();
        res.json({ 
          success: true,
          currentMetrics,
          snapshots
        });
      } catch (error) {
        res.status(500).json({ 
          success: false, 
          error: error.message
        });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // MEETING PREP API ENDPOINTS
    // ═══════════════════════════════════════════════════════════════════════════
    const meetingPrepService = require('./services/meetingPrepService');
    const meetingContextService = require('./services/meetingContextService');

    // Get upcoming meetings for week view
    this.expressApp.get('/api/meetings', async (req, res) => {
      try {
        const { start, end } = req.query;
        const weekRange = meetingPrepService.getCurrentWeekRange();
        const startDate = start || weekRange.start;
        const endDate = end || weekRange.end;
        
        const meetings = await meetingPrepService.getUpcomingMeetings(startDate, endDate);
        const grouped = meetingPrepService.groupMeetingsByDay(meetings);
        
        res.json({ 
          success: true, 
          meetings,
          grouped,
          weekRange: { start: startDate, end: endDate }
        });
      } catch (error) {
        logger.error('Error fetching meetings:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Create a new meeting (manual entry)
    this.expressApp.post('/api/meetings', async (req, res) => {
      try {
        const { accountId, accountName, meetingTitle, meetingDate, authorId } = req.body;
        
        if (!accountId || !meetingTitle || !meetingDate) {
          return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: accountId, meetingTitle, meetingDate' 
          });
        }
        
        const meeting = await meetingPrepService.createMeeting({
          accountId,
          accountName,
          meetingTitle,
          meetingDate,
          authorId
        });
        
        res.json({ success: true, meeting });
      } catch (error) {
        logger.error('Error creating meeting:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get meeting prep by ID
    this.expressApp.get('/api/meeting-prep/:meetingId', async (req, res) => {
      try {
        const { meetingId } = req.params;
        const prep = await meetingPrepService.getMeetingPrep(meetingId);
        
        if (!prep) {
          return res.status(404).json({ success: false, error: 'Meeting prep not found' });
        }
        
        res.json({ success: true, prep });
      } catch (error) {
        logger.error('Error fetching meeting prep:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Save/update meeting prep
    this.expressApp.post('/api/meeting-prep', async (req, res) => {
      try {
        const data = req.body;
        
        if (!data.meetingId) {
          return res.status(400).json({ success: false, error: 'Missing meetingId' });
        }
        
        await meetingPrepService.saveMeetingPrep(data);
        res.json({ success: true, message: 'Meeting prep saved' });
      } catch (error) {
        logger.error('Error saving meeting prep:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete meeting prep
    this.expressApp.delete('/api/meeting-prep/:meetingId', async (req, res) => {
      try {
        const { meetingId } = req.params;
        const result = await meetingPrepService.deleteMeetingPrep(meetingId);
        res.json({ success: true, deleted: result.deleted });
      } catch (error) {
        logger.error('Error deleting meeting prep:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get aggregated context for an account (with optional AI summary)
    this.expressApp.get('/api/meeting-context/:accountId', async (req, res) => {
      try {
        const { accountId } = req.params;
        const { summarize } = req.query; // ?summarize=true to get AI summary
        
        // Get raw context from various sources
        const context = await meetingContextService.generateMeetingContext(accountId);
        
        // Optionally generate AI summary
        let aiSummary = null;
        if (summarize === 'true' && context) {
          try {
            const contextSummarizer = require('./services/contextSummarizer');
            
            // Transform context to the format expected by aggregateContextSources
            // Aligned with intelligenceQueryService data sources for consistent intelligence
            const sources = {
              customerBrain: context.salesforce?.customerBrain || '',
              obsidianNotes: context.obsidianNotes || [],
              slackIntel: context.slackIntel || [],
              priorMeetings: context.priorMeetings || [],
              activities: context.activities || []
            };
            
            // Also include meeting notes if available
            if (context.meetingNotes && Array.isArray(context.meetingNotes)) {
              sources.customerBrain += '\n\n' + context.meetingNotes
                .map(n => `[${n.date}] ${n.rep}: ${n.summary}`)
                .join('\n\n');
            }
            
            const rawContent = contextSummarizer.aggregateContextSources(sources);
            
            if (rawContent && rawContent.length >= 100) {
              const summaryResult = await contextSummarizer.getOrGenerateSummary(
                accountId,
                context.salesforce?.accountName || 'Unknown',
                sources
              );
              
              if (summaryResult.success) {
                aiSummary = summaryResult.summary;
              }
            }
          } catch (summaryError) {
            logger.warn(`AI summary failed for ${accountId}:`, summaryError.message);
            // Continue without AI summary
          }
        }
        
        res.json({ 
          success: true, 
          context,
          aiSummary,
          hasAiSummary: !!aiSummary
        });
      } catch (error) {
        logger.error('Error fetching meeting context:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Lookup account by email domain (for Outlook meetings without accountId)
    this.expressApp.get('/api/account/lookup-by-domain', async (req, res) => {
      try {
        const { domain } = req.query;
        if (!domain) {
          return res.status(400).json({ success: false, error: 'domain required' });
        }
        
        // Search Salesforce for accounts with matching website or contact emails
        const accountQuery = `
          SELECT Id, Name, Account_Display_Name__c, Website
          FROM Account 
          WHERE Website LIKE '%${domain}%'
          ORDER BY LastModifiedDate DESC
          LIMIT 1
        `;
        
        const { query: sfQuery } = require('./salesforce/connection');
        const result = await sfQuery(accountQuery, true);
        
        if (result?.records?.length > 0) {
          const account = result.records[0];
          res.json({ success: true, accountId: account.Id, accountName: account.Account_Display_Name__c || account.Name });
        } else {
          // Fallback: Check contacts by email domain
          const contactQuery = `
            SELECT AccountId, Account.Name, Account.Account_Display_Name__c
            FROM Contact 
            WHERE Email LIKE '%@${domain}'
            ORDER BY LastModifiedDate DESC
            LIMIT 1
          `;
          const contactResult = await sfQuery(contactQuery, true);
          
          if (contactResult?.records?.length > 0 && contactResult.records[0].AccountId) {
            const contact = contactResult.records[0];
            res.json({ success: true, accountId: contact.AccountId, accountName: contact.Account?.Account_Display_Name__c || contact.Account?.Name });
          } else {
            res.json({ success: false, message: 'No account found for domain' });
          }
        }
      } catch (error) {
        logger.error('Error looking up account by domain:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // DASHBOARD SMART CHAT ENDPOINT
    // Natural language queries about accounts, pipeline, and metrics
    // ═══════════════════════════════════════════════════════════════════════════
    this.expressApp.post('/api/dashboard/query', async (req, res) => {
      try {
        const { query } = req.body;
        if (!query || query.trim().length < 2) {
          return res.json({ success: false, message: 'Please enter a query' });
        }

        const { query: sfQuery } = require('./salesforce/connection');
        const FuzzyAccountMatcher = require('./utils/fuzzyAccountMatcher');
        const accountMatcher = new FuzzyAccountMatcher();
        
        const queryLower = query.toLowerCase().trim();
        
        // Check if this is an account lookup query
        const accountPatterns = [
          /what do we know about (.+)/i,
          /tell me about (.+)/i,
          /show me (.+)/i,
          /account[:\s]+(.+)/i,
          /(.+) account/i
        ];
        
        let accountName = null;
        for (const pattern of accountPatterns) {
          const match = query.match(pattern);
          if (match) {
            accountName = match[1].trim().replace(/\?$/, '');
            break;
          }
        }
        
        // If it looks like just a company name (no obvious keywords)
        if (!accountName && !queryLower.includes('pipeline') && !queryLower.includes('stage') && !queryLower.includes('deal')) {
          accountName = query.trim().replace(/\?$/, '');
        }
        
        // Account context lookup
        if (accountName) {
          logger.info('[Dashboard Query] Account lookup: ' + accountName);
          
          const matchResult = await accountMatcher.findAccount(accountName);
          
          if (matchResult) {
            // Get account details
            const accountQuery = `
              SELECT Id, Name, Customer_Type__c, Customer_Subtype__c, Owner.Name, Industry, Website
              FROM Account WHERE Id = '${matchResult.id}'
            `;
            const accResult = await sfQuery(accountQuery, true);
            const account = accResult?.records?.[0];
            
            // Get open opportunities
            const oppsQuery = `
              SELECT Name, StageName, ACV__c, CloseDate, Product_Line__c, Owner.Name
              FROM Opportunity 
              WHERE AccountId = '${matchResult.id}' AND IsClosed = false
              ORDER BY ACV__c DESC LIMIT 5
            `;
            const oppsResult = await sfQuery(oppsQuery, true);
            const opportunities = (oppsResult?.records || []).map(o => ({
              name: o.Name,
              stage: o.StageName,
              acv: o.ACV__c,
              closeDate: o.CloseDate,
              productLine: o.Product_Line__c,
              owner: o.Owner?.Name
            }));
            
            // Get key contacts
            const contactsQuery = `
              SELECT Name, Title, Email FROM Contact 
              WHERE AccountId = '${matchResult.id}' 
              ORDER BY CreatedDate DESC LIMIT 5
            `;
            const contactsResult = await sfQuery(contactsQuery, true);
            const contacts = (contactsResult?.records || []).map(c => ({
              name: c.Name,
              title: c.Title,
              email: c.Email
            }));
            
            return res.json({
              success: true,
              intent: 'account_lookup',
              result: {
                account: {
                  id: matchResult.id,
                  name: matchResult.name,
                  owner: account?.Owner?.Name,
                  type: account?.Customer_Type__c,
                  subtype: account?.Customer_Subtype__c,
                  industry: account?.Industry
                },
                opportunities,
                contacts
              }
            });
          } else {
            return res.json({ success: false, message: 'Account "' + accountName + '" not found' });
          }
        }
        
        // Pipeline summary query
        if (queryLower.includes('pipeline') || queryLower.includes('stage')) {
          const pipelineQuery = `
            SELECT COUNT(Id) dealCount, SUM(ACV__c) totalACV
            FROM Opportunity 
            WHERE IsClosed = false AND StageName != null
          `;
          const pipeResult = await sfQuery(pipelineQuery, true);
          const summary = pipeResult?.records?.[0];
          
          return res.json({
            success: true,
            intent: 'pipeline_summary',
            result: {
              pipeline: {
                total: summary?.totalACV || 0,
                count: summary?.dealCount || 0
              }
            }
          });
        }
        
        // Default response
        return res.json({ 
          success: false, 
          message: 'Try asking about a specific account (e.g., "What do we know about Amazon?") or "pipeline summary"' 
        });
        
      } catch (error) {
        logger.error('[Dashboard Query] Error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get account notes (Customer_Brain__c) for mobile vault and web views
    this.expressApp.get('/api/accounts/:accountId/notes', async (req, res) => {
      try {
        const { accountId } = req.params;
        if (!accountId || accountId.length < 15) {
          return res.status(400).json({ success: false, error: 'Valid accountId required' });
        }

        const result = await sfConnection.query(`
          SELECT Id, Name, Customer_Brain__c, LastActivityDate, Owner.Name,
                 Customer_Type__c, Industry
          FROM Account
          WHERE Id = '${accountId.replace(/'/g, "\\'")}'
          LIMIT 1
        `);

        const acc = result?.records?.[0];
        if (!acc) {
          return res.status(404).json({ success: false, error: 'Account not found' });
        }

        const { parseCustomerBrainNotes } = require('./services/intelligenceQueryService');
        const rawNotes = acc.Customer_Brain__c || '';
        const parsedNotes = parseCustomerBrainNotes(rawNotes);

        res.json({
          success: true,
          accountId: acc.Id,
          accountName: acc.Name,
          owner: acc.Owner?.Name || null,
          type: acc.Customer_Type__c || null,
          industry: acc.Industry || null,
          lastActivity: acc.LastActivityDate || null,
          notes: rawNotes,
          parsedNotes,
          noteCount: parsedNotes.length,
          lastUpdated: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Error fetching account notes:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch account notes from Salesforce',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    });

    // Get contacts for account (attendee dropdown)
    this.expressApp.get('/api/accounts/contacts/:accountId', async (req, res) => {
      try {
        const { accountId } = req.params;
        const contacts = await meetingPrepService.getAccountContacts(accountId);
        res.json({ success: true, contacts });
      } catch (error) {
        logger.error('Error fetching contacts:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // BATCH ACCOUNT ENRICHMENT
    // Uses the same Salesforce data-gathering functions as the GTM Brain
    // intelligence query pipeline to produce structured markdown for Obsidian notes
    // ═══════════════════════════════════════════════════════════════════════════
    this.expressApp.post('/api/accounts/enrich-batch', async (req, res) => {
      try {
        const { accountIds, userEmail } = req.body;

        if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
          return res.status(400).json({ success: false, error: 'accountIds array is required' });
        }

        // Cap at 20 per request to respect SF API limits
        const ids = accountIds.slice(0, 20);

        const {
          getAccountDetails,
          getContacts,
          getOpportunities,
          getRecentTasks,
          getRecentEvents
        } = require('./services/intelligenceQueryService');

        logger.info(`[Enrich] Batch enrichment for ${ids.length} accounts (requested by ${userEmail || 'unknown'})`);

        const enrichments = {};

        // Process accounts in parallel (limited concurrency)
        const batchSize = 5;
        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize);
          const results = await Promise.allSettled(
            batch.map(async (accountId) => {
              const [details, contacts, opportunities, tasks, events] = await Promise.all([
                getAccountDetails(accountId),
                getContacts(accountId),
                getOpportunities(accountId),
                getRecentTasks(accountId),
                getRecentEvents(accountId)
              ]);

              return { accountId, details, contacts, opportunities, tasks, events };
            })
          );

          for (const result of results) {
            if (result.status === 'fulfilled') {
              const { accountId, details, contacts, opportunities, tasks, events } = result.value;
              enrichments[accountId] = formatEnrichmentMarkdown(details, contacts, opportunities, tasks, events);
            }
          }
        }

        logger.info(`[Enrich] Completed enrichment for ${Object.keys(enrichments).length}/${ids.length} accounts`);

        res.json({
          success: true,
          enrichments,
          enrichedCount: Object.keys(enrichments).length,
          requestedCount: ids.length
        });
      } catch (error) {
        logger.error('[Enrich] Batch enrichment error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get all accounts (for meeting creation dropdown)
    this.expressApp.get('/api/accounts', async (req, res) => {
      try {
        const accounts = await meetingPrepService.getAccounts();
        res.json({ success: true, accounts });
      } catch (error) {
        logger.error('Error fetching accounts:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get accounts for Obsidian property autocomplete
    // Returns account names as a simple list for Obsidian vault integration
    this.expressApp.get('/api/accounts/obsidian', async (req, res) => {
      try {
        const rawAccounts = await meetingPrepService.getAccounts();
        const format = req.query.format || 'json';
        
        // getAccounts() returns { accountId, accountName, customerType, owner }
        // Filter out accounts with null/undefined accountName or accountId
        const accounts = rawAccounts.filter(a => a && a.accountName && a.accountId);
        const invalidCount = rawAccounts.length - accounts.length;
        if (invalidCount > 0) {
          logger.warn(`Filtered out ${invalidCount} accounts with missing accountName or accountId`);
        }
        
        if (format === 'text') {
          // Plain text list - one account per line
          const accountNames = accounts
            .map(a => a.accountName.trim())
            .filter(name => name.length > 0)
            .sort((a, b) => a.localeCompare(b))
            .join('\n');
          res.setHeader('Content-Type', 'text/plain');
          res.setHeader('Content-Disposition', 'attachment; filename="salesforce-accounts.txt"');
          res.send(accountNames);
        } else if (format === 'markdown') {
          // Markdown list with wiki-links for Obsidian
          const sortedNames = accounts
            .map(a => a.accountName.trim())
            .filter(name => name.length > 0)
            .sort((a, b) => a.localeCompare(b));
          const markdown = `# Salesforce Accounts\n\nGenerated: ${new Date().toISOString()}\n\n` +
            sortedNames.map(name => `- [[${name}]]`).join('\n');
          res.setHeader('Content-Type', 'text/markdown');
          res.setHeader('Content-Disposition', 'attachment; filename="salesforce-accounts.md"');
          res.send(markdown);
        } else {
          // JSON format with ID and Name for Obsidian plugin
          const sortedAccounts = accounts
            .map(a => ({ id: a.accountId, name: a.accountName.trim() }))
            .filter(a => a.name.length > 0)
            .sort((a, b) => a.name.localeCompare(b.name));
          res.json({
            success: true,
            generated: new Date().toISOString(),
            count: sortedAccounts.length,
            accounts: sortedAccounts
          });
        }
      } catch (error) {
        logger.error('Error fetching accounts for Obsidian:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to fetch Salesforce accounts. Please try again.',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    });

    // Get accounts owned by the current Okta session user (for GTM Brain web tab refresh)
    // Must be registered BEFORE the :email param route so Express matches "me" literally
    this.expressApp.get('/api/accounts/ownership/me', async (req, res) => {
      const oktaSession = validateOktaSession(req);
      if (!oktaSession) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      try {
        const normalizedEmail = (oktaSession.email || '').toLowerCase().trim();
        if (!normalizedEmail || !normalizedEmail.includes('@')) {
          return res.status(400).json({ success: false, error: 'Valid email address required' });
        }
        const userQuery = `SELECT Id, Name, Email FROM User WHERE Email = '${normalizedEmail.replace(/'/g, "\\'")}' AND IsActive = true LIMIT 1`;
        const userResult = await sfConnection.query(userQuery);
        if (!userResult.records || userResult.records.length === 0) {
          return res.json({
            success: true, email: normalizedEmail, userId: null, userName: null,
            accounts: [], count: 0,
            message: 'User not found in Salesforce. Contact your admin if this is unexpected.'
          });
        }
        const user = userResult.records[0];
        const accountResult = await sfConnection.query(`
          SELECT Id, Name, Type, Customer_Type__c FROM Account
          WHERE OwnerId = '${user.Id}' ORDER BY Name ASC
        `);
        const accounts = (accountResult.records || []).map(acc => ({
          id: acc.Id, name: acc.Name,
          type: acc.Customer_Type__c || acc.Type || 'Prospect'
        }));
        logger.info(`[Ownership/me] Found ${accounts.length} accounts for ${user.Name} (${normalizedEmail})`);
        res.json({
          success: true, email: normalizedEmail, userId: user.Id, userName: user.Name,
          accounts, count: accounts.length, lastUpdated: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Error fetching account ownership (me):', error);
        res.status(500).json({
          success: false, error: 'Failed to fetch account ownership from Salesforce',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    });

    // Get accounts owned by a specific user (for Obsidian plugin dynamic folder creation)
    // This enables the plugin to fetch owned accounts and create folders for new assignments
    this.expressApp.get('/api/accounts/ownership/:email', async (req, res) => {
      try {
        const { email } = req.params;
        const normalizedEmail = email.toLowerCase().trim();
        
        if (!normalizedEmail || !normalizedEmail.includes('@')) {
          return res.status(400).json({ 
            success: false, 
            error: 'Valid email address required' 
          });
        }
        
        // CS users: redirect to CS-specific account logic (Existing + CS Staffing)
        // NOTE: Salesforce does NOT allow semi-join subselects inside OR clauses,
        // so we run two queries and merge results.
        const userGroup = getUserGroup(normalizedEmail);
        if (userGroup === 'cs') {
          logger.info(`[Ownership] CS user detected: ${normalizedEmail} — fetching CS-relevant accounts`);
          
          // Query 1: Existing customers
          const existingQuery = `
            SELECT Id, Name, Type, Customer_Type__c, Website, Industry, OwnerId, Owner.Name
            FROM Account 
            WHERE Customer_Type__c = 'Existing'
              AND (NOT Name LIKE '%Sample%')
              AND (NOT Name LIKE '%Test%')
            ORDER BY Name ASC
            LIMIT 1000
          `;
          // Query 2: Accounts with CS Staffing flagged opportunities
          const csStaffingQuery = `
            SELECT Id, Name, Type, Customer_Type__c, Website, Industry, OwnerId, Owner.Name
            FROM Account 
            WHERE Id IN (
              SELECT AccountId FROM Opportunity 
              WHERE CS_Staffing_Flag__c = true AND IsClosed = false
            )
              AND (NOT Name LIKE '%Sample%')
              AND (NOT Name LIKE '%Test%')
            ORDER BY Name ASC
            LIMIT 500
          `;
          
          const [existingResult, staffingResult] = await Promise.all([
            sfConnection.query(existingQuery),
            sfConnection.query(csStaffingQuery)
          ]);
          
          // Merge and deduplicate by Account Id
          const accountMap = new Map();
          const mapAcc = (acc) => ({
            id: acc.Id,
            name: acc.Name,
            type: acc.Customer_Type__c || acc.Type || 'Customer',
            isOwned: false,
            hadOpportunity: true,
            website: acc.Website || null,
            industry: acc.Industry || null,
            ownerName: acc.Owner?.Name || null
          });
          for (const acc of (existingResult.records || [])) {
            accountMap.set(acc.Id, mapAcc(acc));
          }
          for (const acc of (staffingResult.records || [])) {
            if (!accountMap.has(acc.Id)) accountMap.set(acc.Id, mapAcc(acc));
          }
          
          const csAccounts = Array.from(accountMap.values()).sort((a, b) => a.name.localeCompare(b.name));
          
          logger.info(`[Ownership] CS user ${normalizedEmail}: ${csAccounts.length} CS-relevant accounts (${existingResult.totalSize || 0} existing + ${staffingResult.totalSize || 0} staffing, deduped)`);
          return res.json({
            success: true,
            email: normalizedEmail,
            userId: null,
            userName: normalizedEmail,
            userGroup: 'cs',
            accounts: csAccounts,
            prospectAccounts: [],
            count: csAccounts.length,
            lastUpdated: new Date().toISOString()
          });
        }
        
        // Query Salesforce for accounts owned by this user
        // Try exact email match first, then fallback to name-based search
        const safeEmail = normalizedEmail.replace(/'/g, "\\'");
        let userResult = await sfConnection.query(
          `SELECT Id, Name, Email FROM User WHERE Email = '${safeEmail}' AND IsActive = true LIMIT 1`
        );
        
        // Fallback: try matching by name derived from email (e.g., olivia.jung@ → "Olivia Jung")
        if (!userResult.records || userResult.records.length === 0) {
          const localPart = normalizedEmail.split('@')[0];
          const nameParts = localPart.split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1));
          if (nameParts.length >= 2) {
            const firstName = nameParts[0];
            const lastName = nameParts[nameParts.length - 1];
            logger.info(`[Ownership] Exact email miss — trying name match: ${firstName} ${lastName}`);
            userResult = await sfConnection.query(
              `SELECT Id, Name, Email FROM User WHERE FirstName = '${firstName}' AND LastName = '${lastName}' AND IsActive = true LIMIT 1`
            );
          }
        }
        
        // Fallback 2: try domain-only search (find any user at same domain)
        if (!userResult.records || userResult.records.length === 0) {
          const domain = normalizedEmail.split('@')[1];
          if (domain) {
            logger.info(`[Ownership] Name match miss — trying domain LIKE: %@${domain}`);
            const localPart = normalizedEmail.split('@')[0].split(/[._-]/)[0];
            userResult = await sfConnection.query(
              `SELECT Id, Name, Email FROM User WHERE Email LIKE '${localPart}%@${domain}' AND IsActive = true LIMIT 1`
            );
          }
        }
        
        if (!userResult.records || userResult.records.length === 0) {
          logger.info(`[Ownership] No Salesforce user found for email: ${normalizedEmail}`);
          return res.json({
            success: true,
            email: normalizedEmail,
            userId: null,
            userName: null,
            accounts: [],
            count: 0,
            message: 'User not found in Salesforce. Contact your admin if this is unexpected.'
          });
        }
        
        const user = userResult.records[0];
        const userId = user.Id;
        const userName = user.Name;
        
        // Query ALL accounts owned by this user (full Book of Business)
        const allAccountsQuery = `
          SELECT Id, Name, Type, Customer_Type__c, Website, Industry
          FROM Account 
          WHERE OwnerId = '${userId}'
            AND (NOT Name LIKE '%Sample%')
            AND (NOT Name LIKE '%Test%')
          ORDER BY Name ASC
        `;
        const allAccountsResult = await sfConnection.query(allAccountsQuery);
        
        // Determine which accounts have ever had an opportunity
        const accountIds = (allAccountsResult.records || []).map(a => a.Id);
        const oppAccountIds = new Set();
        if (accountIds.length > 0) {
          // Query in batches of 200 to avoid SOQL length limits
          for (let i = 0; i < accountIds.length; i += 200) {
            const batch = accountIds.slice(i, i + 200);
            const idList = batch.map(id => `'${id}'`).join(',');
            const oppQuery = `SELECT AccountId FROM Opportunity WHERE AccountId IN (${idList}) GROUP BY AccountId`;
            const oppResult = await sfConnection.query(oppQuery);
            (oppResult.records || []).forEach(r => oppAccountIds.add(r.AccountId));
          }
        }
        
        // Split into active (had opp) and prospect (no opp) arrays
        const ownedAccounts = [];
        const ownedProspects = [];
        for (const acc of (allAccountsResult.records || [])) {
          const hadOpp = oppAccountIds.has(acc.Id);
          const account = {
            id: acc.Id,
            name: acc.Name,
            type: acc.Customer_Type__c || acc.Type || 'Prospect',
            isOwned: true,
            hadOpportunity: hadOpp,
            website: acc.Website || null,
            industry: acc.Industry || null
          };
          if (hadOpp) {
            ownedAccounts.push(account);
          } else {
            ownedProspects.push(account);
          }
        }
        ownedAccounts.sort((a, b) => a.name.localeCompare(b.name));
        ownedProspects.sort((a, b) => a.name.localeCompare(b.name));
        
        // Determine if this user gets a pod-level (team) view:
        //   - Sales leaders see all their direct reports' accounts
        //   - POD_VIEW_USERS (e.g. Riley, Sean) see all accounts in their designated region
        //   - Regular BLs see ONLY their own accounts (no team aggregation)
        const ownershipUserGroup = getUserGroup(normalizedEmail);
        let teamAccounts = [];
        let viewType = 'own'; // default: own accounts only
        
        if (ownershipUserGroup === 'sales_leader') {
          // Sales leaders: ALL accounts from direct reports (full BoB)
          viewType = 'sales_leader';
          const directReports = getSalesLeaderDirectReports(normalizedEmail);
          if (directReports.length > 0) {
            const blEmailList = directReports.map(e => `'${e.replace(/'/g, "\\'")}'`).join(',');
            const teamQuery = `
              SELECT Id, Name, Type, Customer_Type__c 
              FROM Account 
              WHERE Owner.Email IN (${blEmailList})
                AND (NOT Name LIKE '%Sample%')
                AND (NOT Name LIKE '%Test%')
              ORDER BY Name ASC
              LIMIT 2000
            `;
            const teamResult = await sfConnection.query(teamQuery);
            const ownedIds = new Set([...ownedAccounts.map(a => a.id), ...ownedProspects.map(a => a.id)]);
            
            teamAccounts = (teamResult.records || [])
              .filter(acc => !ownedIds.has(acc.Id))
              .map(acc => ({
                id: acc.Id,
                name: acc.Name,
                type: acc.Customer_Type__c || acc.Type || 'Prospect',
                isOwned: false,
                hadOpportunity: true // team accounts shown as active for leaders
              }));
            
            logger.info(`[Ownership] Sales leader ${normalizedEmail}: ${teamAccounts.length} team accounts from ${directReports.length} direct reports`);
          }
        } else if (POD_VIEW_USERS[normalizedEmail]) {
          // Designated pod-view users: ALL accounts in their region
          viewType = 'pod_view';
          const region = POD_VIEW_USERS[normalizedEmail];
          const regionBLs = getRegionBLEmails(region);
          if (regionBLs.length > 0) {
            const blEmailList = regionBLs.map(e => `'${e.replace(/'/g, "\\'")}'`).join(',');
            const teamQuery = `
              SELECT Id, Name, Type, Customer_Type__c 
              FROM Account 
              WHERE Owner.Email IN (${blEmailList})
                AND (NOT Name LIKE '%Sample%')
                AND (NOT Name LIKE '%Test%')
              ORDER BY Name ASC
              LIMIT 2000
            `;
            const teamResult = await sfConnection.query(teamQuery);
            const ownedIds = new Set([...ownedAccounts.map(a => a.id), ...ownedProspects.map(a => a.id)]);
            
            teamAccounts = (teamResult.records || [])
              .filter(acc => !ownedIds.has(acc.Id))
              .map(acc => ({
                id: acc.Id,
                name: acc.Name,
                type: acc.Customer_Type__c || acc.Type || 'Prospect',
                isOwned: false,
                hadOpportunity: true // team accounts shown as active for pod viewers
              }));
            
            logger.info(`[Ownership] Pod-view user ${normalizedEmail} (${region}): ${teamAccounts.length} team accounts from ${regionBLs.length} region BLs`);
          }
        }
        // else: regular BL — no team aggregation, only their owned accounts
        
        // Active accounts = owned active + team accounts
        let activeAccounts = [...ownedAccounts, ...teamAccounts];
        // Prospect accounts = owned with no opportunity history
        let prospectAccounts = [...ownedProspects];
        
        // Merge admin-pushed account overrides (if PostgreSQL is available)
        let overrideCount = 0;
        try {
          const db = require('./db/connection');
          if (db.isAvailable()) {
            const overrides = await db.query(
              'SELECT account_id, account_name, action FROM user_account_overrides WHERE user_email = $1',
              [normalizedEmail]
            );
            if (overrides.rows.length > 0) {
              const existingIds = new Set([...activeAccounts.map(a => a.id), ...prospectAccounts.map(a => a.id)]);
              const removeIds = new Set();
              const promoteIds = new Set();
              const demoteIds = new Set();
              
              for (const row of overrides.rows) {
                if (row.action === 'add' && !existingIds.has(row.account_id)) {
                  activeAccounts.push({ id: row.account_id, name: row.account_name, type: 'Prospect', isOwned: false, hadOpportunity: true });
                  existingIds.add(row.account_id);
                  overrideCount++;
                } else if (row.action === 'remove') {
                  removeIds.add(row.account_id);
                } else if (row.action === 'promote') {
                  promoteIds.add(row.account_id);
                } else if (row.action === 'demote') {
                  demoteIds.add(row.account_id);
                }
              }
              
              // Handle promotions: move from prospect to active
              if (promoteIds.size > 0) {
                const promoted = prospectAccounts.filter(a => promoteIds.has(a.id));
                prospectAccounts = prospectAccounts.filter(a => !promoteIds.has(a.id));
                promoted.forEach(a => { a.hadOpportunity = true; });
                activeAccounts.push(...promoted);
                overrideCount += promoted.length;
              }
              
              // Handle demotions: move from active to prospect
              if (demoteIds.size > 0) {
                const demoted = activeAccounts.filter(a => demoteIds.has(a.id));
                activeAccounts = activeAccounts.filter(a => !demoteIds.has(a.id));
                demoted.forEach(a => { a.hadOpportunity = false; });
                prospectAccounts.push(...demoted);
                overrideCount += demoted.length;
              }
              
              // Handle removals
              if (removeIds.size > 0) {
                activeAccounts = activeAccounts.filter(a => !removeIds.has(a.id));
                prospectAccounts = prospectAccounts.filter(a => !removeIds.has(a.id));
                overrideCount += removeIds.size;
              }
            }
          }
        } catch (dbErr) {
          // Non-critical: overrides are optional, proceed without them
        }
        
        activeAccounts.sort((a, b) => a.name.localeCompare(b.name));
        prospectAccounts.sort((a, b) => a.name.localeCompare(b.name));
        
        const totalCount = activeAccounts.length + prospectAccounts.length;
        logger.info(`[Ownership] ${viewType} view for ${userName} (${normalizedEmail}): ${totalCount} total (${activeAccounts.length} active + ${prospectAccounts.length} prospects + ${teamAccounts.length} team + ${overrideCount} overrides)`);
        
        res.json({
          success: true,
          email: normalizedEmail,
          userId: userId,
          userName: userName,
          accounts: activeAccounts,
          prospectAccounts: prospectAccounts,
          count: totalCount,
          activeCount: activeAccounts.length,
          prospectCount: prospectAccounts.length,
          ownedCount: ownedAccounts.length,
          teamCount: teamAccounts.length,
          overrideCount: overrideCount,
          viewType: viewType,
          lastUpdated: new Date().toISOString()
        });
        
      } catch (error) {
        logger.error('Error fetching account ownership:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to fetch account ownership from Salesforce',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // BOOK OF BUSINESS - Dynamic account sync for plugin folders
    // ═══════════════════════════════════════════════════════════════════════════
    // Returns accounts based on user group:
    // - admin/exec: ALL accounts
    // - sales_leader: All accounts owned by BLs in their region
    // - cs: Only Existing customers
    // - bl: Owned accounts with Customer_Type__c = 'Existing' OR open opportunities
    // Excludes Sample/Test accounts for all groups
    this.expressApp.get('/api/bl-accounts/:email', async (req, res) => {
      const startTime = Date.now();
      const correlationId = `bl-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      
      try {
        const { email } = req.params;
        const normalizedEmail = email?.toLowerCase().trim();
        
        // Validate email format
        if (!normalizedEmail || !normalizedEmail.includes('@')) {
          return res.status(400).json({ 
            success: false, 
            error: 'Valid email address required',
            correlationId
          });
        }
        
        // Determine user group
        const userGroup = getUserGroup(normalizedEmail);
        logger.info(`[BL-Accounts][${correlationId}] Fetching accounts for: ${normalizedEmail} (group: ${userGroup})`);
        
        // Step 1: Find the User by email
        const userQuery = `SELECT Id, Name, Email FROM User WHERE Email = '${normalizedEmail.replace(/'/g, "\\'")}' AND IsActive = true LIMIT 1`;
        const userResult = await sfConnection.query(userQuery);
        
        // For admin/exec/sales_leader, user doesn't need to exist in SF to see accounts
        let userId = null;
        let userName = normalizedEmail;
        
        if (userResult.records && userResult.records.length > 0) {
          userId = userResult.records[0].Id;
          userName = userResult.records[0].Name;
        } else if (userGroup === 'bl') {
          // For regular BLs, they must exist in Salesforce
          logger.warn(`[BL-Accounts][${correlationId}] No Salesforce user found for BL: ${normalizedEmail}`);
          return res.status(404).json({
            success: false,
            error: 'User not found in Salesforce',
            suggestion: 'Verify email matches your Salesforce account. Contact admin if issue persists.',
            correlationId
          });
        }
        
        // Step 2: Build query based on user group
        let accountQuery;
        let queryDescription;
        
        switch (userGroup) {
          case 'admin':
          case 'exec': {
            // Active accounts only: has opportunity history OR is existing customer
            // Split into two queries (SF SOQL doesn't allow OR with subselects)
            queryDescription = 'active pipeline + existing customers (prospects hidden)';
            
            const oppAccountsQuery = `
              SELECT Id, Name, Type, Customer_Type__c, Website, Industry, OwnerId, Owner.Name,
                     (SELECT Id, Name, StageName FROM Opportunities WHERE IsClosed = false LIMIT 5)
              FROM Account 
              WHERE Id IN (SELECT AccountId FROM Opportunity)
                AND (NOT Name LIKE '%Sample%')
                AND (NOT Name LIKE '%Test%')
              ORDER BY Name ASC
              LIMIT 2000
            `;
            
            const existingCustomersQuery = `
              SELECT Id, Name, Type, Customer_Type__c, Website, Industry, OwnerId, Owner.Name,
                     (SELECT Id, Name, StageName FROM Opportunities WHERE IsClosed = false LIMIT 5)
              FROM Account 
              WHERE (Customer_Type__c LIKE '%Existing%' OR Customer_Type__c LIKE '%Active%')
                AND (NOT Name LIKE '%Sample%')
                AND (NOT Name LIKE '%Test%')
              ORDER BY Name ASC
              LIMIT 500
            `;
            
            try {
              const [oppResult, existingResult] = await Promise.all([
                sfConn.query(oppAccountsQuery),
                sfConn.query(existingCustomersQuery)
              ]);
              
              // Merge and deduplicate
              const accountMap = new Map();
              for (const acc of (oppResult.records || [])) {
                accountMap.set(acc.Id, acc);
              }
              for (const acc of (existingResult.records || [])) {
                if (!accountMap.has(acc.Id)) {
                  accountMap.set(acc.Id, acc);
                }
              }
              
              const mergedAccounts = Array.from(accountMap.values());
              mergedAccounts.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
              
              // Format response (same as below)
              const formattedAccounts = mergedAccounts.map(acc => {
                const opps = acc.Opportunities ? acc.Opportunities.records || [] : [];
                return {
                  id: acc.Id,
                  name: acc.Name,
                  type: acc.Type || acc.Customer_Type__c || '',
                  customerType: acc.Customer_Type__c || 'New',
                  industry: acc.Industry || null,
                  website: acc.Website || null,
                  ownerId: acc.OwnerId || null,
                  ownerName: acc.Owner ? acc.Owner.Name : null,
                  hasOpenOpps: opps.length > 0,
                  oppCount: opps.length,
                  hadOpportunity: true,
                  openOpps: opps.map(o => ({ name: o.Name, stage: o.StageName }))
                };
              });
              
              logger.info(`[BL-Accounts][${correlationId}] Admin/exec query returned ${formattedAccounts.length} active accounts`);
              
              return res.json({
                success: true,
                accounts: formattedAccounts,
                meta: {
                  email: normalizedEmail,
                  userId: userId,
                  userName: userName,
                  userGroup,
                  total: formattedAccounts.length,
                  activeCount: formattedAccounts.filter(a => a.hasOpenOpps).length,
                  prospectCount: 0,
                  queryDescription,
                  queryTime: Date.now() - queryStart,
                  lastRefresh: new Date().toISOString(),
                  correlationId
                }
              });
            } catch (adminQueryErr) {
              logger.error(`[BL-Accounts][${correlationId}] Admin/exec dual query failed:`, adminQueryErr.message);
              // Fallback: return all accounts without filter
              accountQuery = `
                SELECT Id, Name, Type, Customer_Type__c, Website, Industry, OwnerId, Owner.Name,
                       (SELECT Id, Name, StageName FROM Opportunities WHERE IsClosed = false LIMIT 5)
                FROM Account 
                WHERE (NOT Name LIKE '%Sample%')
                  AND (NOT Name LIKE '%Test%')
                ORDER BY Name ASC
                LIMIT 2000
              `;
            }
            break;
          }
            
          case 'sales_leader':
            // All accounts owned by direct reports (explicit mapping) or region BLs
            const region = getSalesLeaderRegion(normalizedEmail);
            const directReports = getSalesLeaderDirectReports(normalizedEmail);
            
            if (!directReports || directReports.length === 0) {
              logger.warn(`[BL-Accounts][${correlationId}] No direct reports found for: ${normalizedEmail}`);
              return res.json({
                success: true,
                accounts: [],
                meta: {
                  email: normalizedEmail,
                  userGroup,
                  region,
                  total: 0,
                  message: 'No direct reports configured for this sales leader',
                  correlationId
                }
              });
            }
            
            // Format emails for IN clause
            const blEmailList = directReports.map(e => `'${e.replace(/'/g, "\\'")}'`).join(',');
            queryDescription = `accounts for ${directReports.length} direct reports`;
            
            accountQuery = `
              SELECT Id, Name, Type, Customer_Type__c, Website, Industry, OwnerId, Owner.Name,
                     (SELECT Id, Name, StageName FROM Opportunities WHERE IsClosed = false LIMIT 5)
              FROM Account 
              WHERE Owner.Email IN (${blEmailList})
                AND (NOT Name LIKE '%Sample%')
                AND (NOT Name LIKE '%Test%')
              ORDER BY Owner.Name, Name ASC
              LIMIT 1000
            `;
            break;
            
          case 'cs': {
            // CS-relevant accounts: Existing customers + CS Staffing flagged opportunities
            // NOTE: Salesforce disallows semi-join subselects inside OR, so we run 2 queries and merge.
            queryDescription = 'existing customers + CS staffing accounts';
            const csExistingQ = `
              SELECT Id, Name, Type, Customer_Type__c, Website, Industry, OwnerId, Owner.Name,
                     (SELECT Id, Name, StageName FROM Opportunities WHERE IsClosed = false LIMIT 5)
              FROM Account 
              WHERE Customer_Type__c = 'Existing'
                AND (NOT Name LIKE '%Sample%')
                AND (NOT Name LIKE '%Test%')
              ORDER BY Name ASC
              LIMIT 1000
            `;
            const csStaffingQ = `
              SELECT Id, Name, Type, Customer_Type__c, Website, Industry, OwnerId, Owner.Name,
                     (SELECT Id, Name, StageName FROM Opportunities WHERE IsClosed = false LIMIT 5)
              FROM Account 
              WHERE Id IN (
                SELECT AccountId FROM Opportunity 
                WHERE CS_Staffing_Flag__c = true AND IsClosed = false
              )
                AND (NOT Name LIKE '%Sample%')
                AND (NOT Name LIKE '%Test%')
              ORDER BY Name ASC
              LIMIT 500
            `;
            const [csExRes, csStRes] = await Promise.all([
              sfConnection.query(csExistingQ),
              sfConnection.query(csStaffingQ)
            ]);
            // Merge and deduplicate
            const csMap = new Map();
            for (const r of [...(csExRes.records || []), ...(csStRes.records || [])]) {
              if (!csMap.has(r.Id)) csMap.set(r.Id, r);
            }
            // Override accountResult for downstream processing
            const mergedRecords = Array.from(csMap.values());
            logger.info(`[BL-Accounts][${correlationId}] CS merge: ${csExRes.totalSize || 0} existing + ${csStRes.totalSize || 0} staffing = ${mergedRecords.length} unique`);
            // Build response directly for CS (skip the generic accountResult path)
            const csActiveAccounts = mergedRecords.map(acc => {
              const openOpps = acc.Opportunities?.records || [];
              return {
                id: acc.Id,
                name: acc.Name,
                type: acc.Type || null,
                customerType: acc.Customer_Type__c || null,
                industry: acc.Industry || null,
                website: acc.Website || null,
                ownerId: acc.OwnerId || null,
                ownerName: acc.Owner?.Name || null,
                csmName: acc.CSMa__c || null,
                hasOpenOpps: openOpps.length > 0,
                oppCount: openOpps.length,
                hadOpportunity: true,
                openOpps: openOpps.slice(0, 3).map(o => ({ name: o.Name, stage: o.StageName }))
              };
            }).sort((a, b) => a.name.localeCompare(b.name));
            
            const csQueryTime = Date.now() - startTime;
            return res.json({
              success: true,
              accounts: csActiveAccounts,
              prospectAccounts: [],
              meta: {
                email: normalizedEmail,
                userId,
                userName,
                userGroup,
                total: csActiveAccounts.length,
                activeCount: csActiveAccounts.length,
                prospectCount: 0,
                queryDescription,
                queryTime: csQueryTime,
                lastRefresh: new Date().toISOString(),
                correlationId
              }
            });
          }
            
          default: // 'bl'
            // Standard BL query: ALL owned accounts (full Book of Business)
            if (!userId) {
              return res.status(404).json({
                success: false,
                error: 'User not found in Salesforce',
                correlationId
              });
            }
            
            queryDescription = 'all owned accounts (full BoB)';
            accountQuery = `
              SELECT Id, Name, Type, Customer_Type__c, Website, Industry, OwnerId, Owner.Name,
                     (SELECT Id, Name, StageName FROM Opportunities WHERE IsClosed = false LIMIT 5)
              FROM Account 
              WHERE OwnerId = '${userId}'
                AND (NOT Name LIKE '%Sample%')
                AND (NOT Name LIKE '%Test%')
              ORDER BY Name ASC
            `;
            break;
        }
        
        const accountResult = await sfConnection.query(accountQuery);
        const queryTime = Date.now() - startTime;
        
        // For BL users, determine which accounts have ever had any opportunity
        let oppAccountIds = new Set();
        if (userGroup === 'bl') {
          const blAccountIds = (accountResult.records || []).map(a => a.Id);
          if (blAccountIds.length > 0) {
            for (let i = 0; i < blAccountIds.length; i += 200) {
              const batch = blAccountIds.slice(i, i + 200);
              const idList = batch.map(id => `'${id}'`).join(',');
              const oppQuery = `SELECT AccountId FROM Opportunity WHERE AccountId IN (${idList}) GROUP BY AccountId`;
              const oppResult = await sfConnection.query(oppQuery);
              (oppResult.records || []).forEach(r => oppAccountIds.add(r.AccountId));
            }
          }
        }
        
        // Transform results with open opp info and hadOpportunity tier flag
        const activeAccounts = [];
        const prospectAccounts = [];
        
        for (const acc of (accountResult.records || [])) {
          const openOpps = acc.Opportunities?.records || [];
          const hadOpp = userGroup === 'bl' ? oppAccountIds.has(acc.Id) : true;
          
          const account = {
            id: acc.Id,
            name: acc.Name,
            type: acc.Type || null,
            customerType: acc.Customer_Type__c || null,
            industry: acc.Industry || null,
            website: acc.Website || null,
            ownerId: acc.OwnerId || null,
            ownerName: acc.Owner?.Name || null,
            hasOpenOpps: openOpps.length > 0,
            oppCount: openOpps.length,
            hadOpportunity: hadOpp,
            openOpps: openOpps.slice(0, 3).map(o => ({
              name: o.Name,
              stage: o.StageName
            }))
          };
          
          if (hadOpp) {
            activeAccounts.push(account);
          } else {
            prospectAccounts.push(account);
          }
        }
        
        const totalCount = activeAccounts.length + prospectAccounts.length;
        logger.info(`[BL-Accounts][${correlationId}] Found ${totalCount} ${queryDescription} for ${userName} (${userGroup}) in ${queryTime}ms: ${activeAccounts.length} active + ${prospectAccounts.length} prospects`);
        
        res.json({
          success: true,
          accounts: activeAccounts,
          prospectAccounts: prospectAccounts,
          meta: {
            email: normalizedEmail,
            userId: userId,
            userName: userName,
            userGroup,
            region: userGroup === 'sales_leader' ? getSalesLeaderRegion(normalizedEmail) : null,
            total: totalCount,
            activeCount: activeAccounts.length,
            prospectCount: prospectAccounts.length,
            queryDescription,
            queryTime: queryTime,
            lastRefresh: new Date().toISOString(),
            correlationId
          }
        });
        
      } catch (error) {
        const queryTime = Date.now() - startTime;
        logger.error(`[BL-Accounts][${correlationId}] Error:`, error);
        
        // Check for specific Salesforce errors
        if (error.errorCode === 'INVALID_SESSION_ID') {
          return res.status(503).json({
            success: false,
            error: 'Salesforce session expired. Reconnecting...',
            retryAfter: 5,
            correlationId
          });
        }
        
        res.status(500).json({ 
          success: false, 
          error: 'Failed to fetch book of business',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
          queryTime,
          correlationId
        });
      }
    });

    // Get ALL accounts (for admin/exec users in Obsidian plugin)
    // Uses user group logic from helper functions
    this.expressApp.get('/api/accounts/all', async (req, res) => {
      try {
        const requestEmail = (req.query.email || '').toLowerCase().trim();
        
        // Verify user has full account access (admin or exec)
        if (requestEmail && !hasFullAccountAccess(requestEmail)) {
          logger.warn(`[AllAccounts] Access denied for non-admin: ${requestEmail}`);
          return res.status(403).json({
            success: false,
            error: 'Admin or Executive access required',
            userGroup: getUserGroup(requestEmail)
          });
        }
        
        // Log the request
        logger.info(`[AllAccounts] Request from: ${requestEmail || 'anonymous'} (group: ${getUserGroup(requestEmail)})`);
        
        // Query ALL active accounts from Salesforce
        const accountQuery = `
          SELECT Id, Name, Type, Customer_Type__c, OwnerId, Owner.Name
          FROM Account 
          WHERE IsDeleted = false
          ORDER BY Name ASC
          LIMIT 1000
        `;
        const accountResult = await sfConnection.query(accountQuery);
        
        const accounts = (accountResult.records || []).map(acc => ({
          id: acc.Id,
          name: acc.Name,
          type: acc.Customer_Type__c || acc.Type || 'Prospect',
          ownerId: acc.OwnerId,
          ownerName: acc.Owner?.Name || 'Unknown'
        }));
        
        logger.info(`[AllAccounts] Returning ${accounts.length} accounts`);
        
        res.json({
          success: true,
          accounts: accounts,
          count: accounts.length,
          lastUpdated: new Date().toISOString()
        });
        
      } catch (error) {
        logger.error('Error fetching all accounts:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to fetch accounts from Salesforce',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // INTELLIGENCE QUERY API (Granola-style conversational queries)
    // Enables natural language questions about accounts and deals
    // Uses dedicated intelligenceQueryService with Anthropic Claude
    // ═══════════════════════════════════════════════════════════════════════════
    // Pipeline health endpoint — lightweight pre-computed metrics for GTM Brain welcome dashboard
    let pipelineHealthCache = { data: null, timestamp: 0 };
    this.expressApp.get('/api/pipeline-health', async (req, res) => {
      try {
        const now = Date.now();
        if (pipelineHealthCache.data && (now - pipelineHealthCache.timestamp) < 300000) {
          return res.json(pipelineHealthCache.data);
        }

        let health = { totalOpps: 0, totalAcv: 0, lateStageCount: 0, lateStageAcv: 0, byStage: {}, customerCount: 0, timestamp: new Date().toISOString() };
        try {
          const { queryPipelineData, queryAIEnabledForecast, queryLogosByType } = require('./slack/blWeeklySummary');
          const [records, forecast] = await Promise.all([
            queryPipelineData().catch(() => []),
            queryAIEnabledForecast().catch(() => ({}))
          ]);

          const lateStages = ['Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation'];
          for (const opp of records) {
            const stage = opp.StageName || 'Unknown';
            health.totalOpps++;
            health.totalAcv += opp.ACV__c || 0;
            if (!health.byStage[stage]) health.byStage[stage] = { count: 0, acv: 0 };
            health.byStage[stage].count++;
            health.byStage[stage].acv += opp.ACV__c || 0;
            if (lateStages.includes(stage)) {
              health.lateStageCount++;
              health.lateStageAcv += opp.ACV__c || 0;
            }
          }
          health.forecast = { commitNet: forecast.commitNet || 0, weightedNet: forecast.weightedNet || 0, midpoint: forecast.midpoint || 0 };

          const { query: sfQuery } = require('./salesforce/connection');
          const custResult = await sfQuery(`SELECT COUNT() FROM Account WHERE Customer_Type__c IN ('Existing', 'Existing Customer', 'Revenue', 'LOI, with \\'\\' attached', 'Pilot', 'MSA')`, false).catch(() => ({ totalSize: 0 }));
          health.customerCount = custResult?.totalSize || 0;
        } catch (e) {
          logger.warn('[PipelineHealth] Error building health data:', e.message);
        }

        pipelineHealthCache = { data: health, timestamp: now };
        res.json(health);
      } catch (error) {
        logger.error('[PipelineHealth] Endpoint error:', error);
        res.status(500).json({ error: 'Failed to load pipeline health' });
      }
    });

    this.expressApp.post('/api/intelligence/query', async (req, res) => {
      try {
        const { 
          query,          // The user's natural language question
          accountId,      // Optional: Focus on a specific account
          accountName,    // Optional: Account name for context
          userEmail,      // User's email for context
          forceRefresh,   // Optional: Skip in-memory cache for fresh data
          sessionId       // Optional: Conversation session ID for multi-turn
        } = req.body;
        
        // Use the dedicated intelligence query service
        const intelligenceQueryService = require('./services/intelligenceQueryService');
        
        const result = await intelligenceQueryService.processQuery({
          query,
          accountId,
          accountName,
          userEmail,
          forceRefresh: !!forceRefresh,
          sessionId: sessionId || undefined
        });
        
        if (result.success) {
          res.json(result);
        } else {
          res.status(result.error === 'Query is required' ? 400 : 500).json(result);
        }
        
      } catch (error) {
        logger.error('Intelligence query error:', error);
        res.status(500).json({ 
          success: false, 
          error: 'Failed to process intelligence query',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // VECTOR SEARCH ENDPOINT
    // Semantic search across meeting notes, account context, and intelligence
    // Requires ENABLE_VECTOR_SEARCH=true
    // ═══════════════════════════════════════════════════════════════════════════
    this.expressApp.post('/api/intelligence/vector-search', async (req, res) => {
      try {
        const vectorSearchService = require('./services/vectorSearchService');
        if (!vectorSearchService.isHealthy()) {
          return res.status(503).json({ success: false, error: 'Vector search not enabled or not healthy' });
        }
        const { query, accountId, limit, sourceType } = req.body;
        if (!query) return res.status(400).json({ success: false, error: 'Query is required' });
        
        const results = await vectorSearchService.search(query, { accountId, limit: limit || 5, sourceType });
        res.json({ success: true, results, count: results.length });
      } catch (error) {
        logger.error('Vector search error:', error);
        res.status(500).json({ success: false, error: 'Vector search failed' });
      }
    });

    this.expressApp.get('/api/intelligence/vector-stats', async (req, res) => {
      try {
        const vectorSearchService = require('./services/vectorSearchService');
        res.json({ success: true, stats: vectorSearchService.getStats() });
      } catch (error) {
        res.status(500).json({ success: false, error: 'Stats not available' });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // USER FEEDBACK
    // Collect thumbs up/down ratings on intelligence responses
    // ═══════════════════════════════════════════════════════════════════════════
    this.expressApp.post('/api/intelligence/feedback', async (req, res) => {
      try {
        const feedbackService = require('./services/feedbackService');
        const { query, answerSnippet, accountName, accountId, userEmail, sessionId, rating, comment } = req.body;
        if (!rating || !['helpful', 'not_helpful'].includes(rating)) {
          return res.status(400).json({ success: false, error: 'Rating must be "helpful" or "not_helpful"' });
        }
        const id = feedbackService.submitFeedback({ query, answerSnippet, accountName, accountId, userEmail, sessionId, rating, comment });
        res.json({ success: true, feedbackId: id });
      } catch (error) {
        logger.error('Feedback submission error:', error);
        res.status(500).json({ success: false, error: 'Failed to submit feedback' });
      }
    });

    this.expressApp.get('/api/intelligence/feedback/summary', async (req, res) => {
      try {
        const feedbackService = require('./services/feedbackService');
        res.json({ success: true, summary: feedbackService.getSummary() });
      } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to get feedback summary' });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // OBSIDIAN VAULT DOWNLOAD
    // Serves the pre-built BL Sales Vault with all account folders and notes
    // Built using: node scripts/build-vault.js
    // ═══════════════════════════════════════════════════════════════════════════
    this.expressApp.get('/vault/download', async (req, res) => {
      try {
        const path = require('path');
        const fs = require('fs');
        
        // Serve the pre-built vault ZIP from public/downloads
        const vaultZipPath = path.join(__dirname, '..', 'public', 'downloads', 'Business-Lead-Vault-2026.zip');
        
        // Check if pre-built vault exists
        if (!fs.existsSync(vaultZipPath)) {
          logger.warn('Pre-built vault not found, generating dynamically...');
          
          // Fallback: Generate dynamically if pre-built doesn't exist
          // This mirrors build-tailored-vault.js - creates a clean vault with plugin pre-installed
          const archiver = require('archiver');
          
          logger.info('Generating Obsidian vault with eudia-transcription plugin (dynamic fallback)');
          
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', 'attachment; filename="Business-Lead-Vault-2026.zip"');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          
          const archive = archiver('zip', { zlib: { level: 9 } });
          archive.pipe(res);
          
          const vaultName = 'Business Lead Vault 2026';
          
          // ═══════════════════════════════════════════════════════════════════
          // Obsidian Configuration
          // ═══════════════════════════════════════════════════════════════════
          
          // app.json - Editor settings
          const appJson = {
            alwaysUpdateLinks: true,
            newFileLocation: "folder",
            newFileFolderPath: "Accounts",
            attachmentFolderPath: "Recordings",
            showFrontmatter: true,
            livePreview: true,
            defaultViewMode: "preview"
          };
          archive.append(JSON.stringify(appJson, null, 2), { name: `${vaultName}/.obsidian/app.json` });
          
          // appearance.json
          const appearanceJson = { baseFontSize: 16, theme: "obsidian" };
          archive.append(JSON.stringify(appearanceJson, null, 2), { name: `${vaultName}/.obsidian/appearance.json` });
          
          // core-plugins.json - minimal set for sales users
          const corePlugins = {
            "file-explorer": true,
            "global-search": false,
            "switcher": false,
            "markdown-importer": false,
            "word-count": true,
            "open-with-default-app": false,
            "file-recovery": true,
            "daily-notes": false,
            "templates": false,
            "canvas": false,
            "graph": true
          };
          archive.append(JSON.stringify(corePlugins, null, 2), { name: `${vaultName}/.obsidian/core-plugins.json` });
          
          // community-plugins.json - Enable eudia-transcription
          const communityPlugins = ["eudia-transcription"];
          archive.append(JSON.stringify(communityPlugins, null, 2), { name: `${vaultName}/.obsidian/community-plugins.json` });
          
          // ═══════════════════════════════════════════════════════════════════
          // Eudia Transcription Plugin
          // ═══════════════════════════════════════════════════════════════════
          
          const pluginSourceDir = path.join(__dirname, '..', 'obsidian-plugin');
          const pluginDestPath = `${vaultName}/.obsidian/plugins/eudia-transcription`;
          
          // Copy main.js
          const mainJsPath = path.join(pluginSourceDir, 'main.js');
          if (fs.existsSync(mainJsPath)) {
            archive.file(mainJsPath, { name: `${pluginDestPath}/main.js` });
          }
          
          // Copy styles.css
          const stylesPath = path.join(pluginSourceDir, 'styles.css');
          if (fs.existsSync(stylesPath)) {
            archive.file(stylesPath, { name: `${pluginDestPath}/styles.css` });
          }
          
          // Copy manifest.json
          const manifestPath = path.join(pluginSourceDir, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            archive.file(manifestPath, { name: `${pluginDestPath}/manifest.json` });
          }
          
          // Plugin settings with setupCompleted: false to trigger setup wizard
          const pluginData = {
            serverUrl: "https://gtm-wizard.onrender.com",
            accountsFolder: "Accounts",
            recordingsFolder: "Recordings",
            syncOnStartup: true,
            autoSyncAfterTranscription: true,
            saveAudioFiles: true,
            appendTranscript: true,
            lastSyncTime: null,
            cachedAccounts: [],
            enableSmartTags: true,
            showCalendarView: true,
            userEmail: "",
            setupCompleted: false,  // Triggers setup wizard on first open
            calendarConfigured: false,
            salesforceConnected: false,
            accountsImported: false,
            importedAccountCount: 0,
            openaiApiKey: process.env.OPENAI_API_KEY || "",
            timezone: "America/New_York",
            lastAccountRefreshDate: null
          };
          archive.append(JSON.stringify(pluginData, null, 2), { name: `${pluginDestPath}/data.json` });
          
          // ═══════════════════════════════════════════════════════════════════
          // Vault Folder Structure
          // ═══════════════════════════════════════════════════════════════════
          
          // QuickStart guide
          const quickstartMd = `# Business Lead Vault 2026

Welcome to your personal sales vault! This tool helps you:
- **Transcribe meetings** with AI-powered accuracy
- **Sync notes to Salesforce** automatically
- **Track customer conversations** in one place

## Getting Started

1. **Enable the plugin** - Click "Turn on community plugins" when prompted
2. **Complete setup** - Enter your @eudia.com email to import your accounts
3. **Start transcribing** - Use the microphone icon to record meetings

## Need Help?

Visit the GTM Hub at https://gtm-wizard.onrender.com for guides and support.
`;
          archive.append(quickstartMd, { name: `${vaultName}/QUICKSTART.md` });
          
          // Accounts folder placeholder
          const setupMd = `# Setup Required

Complete the setup wizard to import your accounts.

1. Click the Eudia icon in the left sidebar
2. Enter your @eudia.com email
3. Your accounts will appear here automatically
`;
          archive.append(setupMd, { name: `${vaultName}/Accounts/_Setup Required.md` });
          
          // Next Steps folder
          const nextStepsMd = `# All Next Steps

This note aggregates next steps from all your account meetings.

*Complete setup to begin tracking next steps.*
`;
          archive.append(nextStepsMd, { name: `${vaultName}/Next Steps/All Next Steps.md` });
          
          // Recordings folder
          archive.append('', { name: `${vaultName}/Recordings/.gitkeep` });
          
          await archive.finalize();
          logger.info('Dynamic vault generation completed with plugin included');
          return;
        }
        
        // Serve the pre-built vault (no-cache to ensure users always get latest)
        logger.info('Serving pre-built Business Lead Vault 2026');
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="Business-Lead-Vault-2026.zip"');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        const fileStream = fs.createReadStream(vaultZipPath);
        fileStream.pipe(res);
        
        fileStream.on('end', () => {
          logger.info('Obsidian vault download completed');
        });
        
        fileStream.on('error', (err) => {
          logger.error('Error streaming vault:', err);
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: err.message });
          }
        });
        
      } catch (error) {
        logger.error('Error serving Obsidian vault:', error);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: error.message });
        }
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // SALESFORCE OAUTH ENDPOINTS
    // Per-user OAuth authentication for note sync with user attribution
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Start OAuth flow - redirects user to Salesforce login
    // Implements PKCE (Proof Key for Code Exchange) for enhanced security
    // Supports optional redirect parameter for mobile PWA flow
    this.expressApp.get('/api/sf/auth/start', async (req, res) => {
      try {
        const { email, redirect } = req.query;
        const crypto = require('crypto');
        
        if (!email) {
          return res.status(400).json({
            success: false,
            error: 'Email parameter required'
          });
        }
        
        const clientId = process.env.SF_CLIENT_ID;
        const redirectUri = process.env.SF_OAUTH_REDIRECT_URI || 'https://gtm-wizard.onrender.com/api/sf/auth/callback';
        
        if (!clientId) {
          return res.status(500).json({
            success: false,
            error: 'Salesforce OAuth not configured. Contact your administrator.'
          });
        }
        
        // Generate PKCE code_verifier (43-128 chars, URL-safe base64)
        const codeVerifier = crypto.randomBytes(32).toString('base64url');
        
        // Generate code_challenge (SHA256 hash of verifier, base64url encoded)
        const codeChallenge = crypto
          .createHash('sha256')
          .update(codeVerifier)
          .digest('base64url');
        
        // Validate redirect URL if provided (must be same origin for security)
        let finalRedirect = null;
        if (redirect) {
          // Only allow relative paths or same-origin URLs
          if (redirect.startsWith('/')) {
            finalRedirect = redirect;
          } else {
            try {
              const redirectUrl = new URL(redirect);
              const allowedHosts = ['gtm-wizard.onrender.com', 'localhost'];
              if (allowedHosts.includes(redirectUrl.hostname)) {
                finalRedirect = redirect;
              }
            } catch (e) {
              // Invalid URL, ignore
            }
          }
        }
        
        // Generate state parameter to prevent CSRF and carry email + verifier + redirect
        const state = Buffer.from(JSON.stringify({ 
          email: email.toLowerCase(),
          codeVerifier: codeVerifier,
          redirect: finalRedirect,
          timestamp: Date.now()
        })).toString('base64url');
        
        // Salesforce OAuth authorization URL with PKCE
        // Using Eudia My Domain to force org-specific login
        const authUrl = new URL('https://eudia.my.salesforce.com/services/oauth2/authorize');
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('scope', 'api refresh_token offline_access');
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('prompt', 'login');
        
        logger.info(`Starting SF OAuth for ${email} with PKCE`);
        res.redirect(authUrl.toString());
        
      } catch (error) {
        logger.error('Error starting SF OAuth:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // OAuth callback - receives code from Salesforce, exchanges for tokens
    this.expressApp.get('/api/sf/auth/callback', async (req, res) => {
      try {
        const { code, state, error: oauthError, error_description } = req.query;
        
        if (oauthError) {
          logger.error(`SF OAuth error: ${oauthError} - ${error_description}`);
          return res.status(400).send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Authentication Failed - Eudia</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
              <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
                  color: #ffffff;
                }
                .container { text-align: center; padding: 40px; max-width: 420px; }
                .logo-text { font-size: 24px; font-weight: 600; margin-bottom: 32px; color: #8b9bf4; }
                .card {
                  background: rgba(255, 255, 255, 0.08);
                  backdrop-filter: blur(20px);
                  border: 1px solid rgba(255, 255, 255, 0.1);
                  border-radius: 16px;
                  padding: 40px 32px;
                }
                .error-circle {
                  width: 72px; height: 72px;
                  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                  border-radius: 50%;
                  display: flex; align-items: center; justify-content: center;
                  margin: 0 auto 24px;
                  box-shadow: 0 8px 32px rgba(239, 68, 68, 0.3);
                }
                .error-circle svg { width: 36px; height: 36px; stroke: white; stroke-width: 3; fill: none; }
                h1 { font-size: 28px; font-weight: 600; margin-bottom: 12px; }
                .subtitle { color: rgba(255, 255, 255, 0.7); font-size: 14px; margin-bottom: 20px; }
                .error-msg { color: #fca5a5; font-size: 13px; background: rgba(239, 68, 68, 0.1); padding: 12px; border-radius: 8px; }
                .close-btn {
                  display: inline-block; margin-top: 24px; padding: 12px 28px;
                  background: rgba(139, 155, 244, 0.15); border: 1px solid rgba(139, 155, 244, 0.3);
                  color: #8b9bf4; font-size: 14px; font-weight: 500; border-radius: 8px;
                  cursor: pointer; transition: all 0.2s ease; text-decoration: none;
                }
                .close-btn:hover { background: rgba(139, 155, 244, 0.25); }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="logo-text">Eudia</div>
                <div class="card">
                  <div class="error-circle">
                    <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </div>
                  <h1>Authentication Failed</h1>
                  <p class="subtitle">Unable to connect to Salesforce</p>
                  <p class="error-msg">${error_description || oauthError}</p>
                  <button class="close-btn" id="closeBtn">Close Window</button>
                  <p class="fallback-msg" id="fallbackMsg" style="display: none; margin-top: 12px; color: #6b7280; font-size: 13px;">You can now close this tab.</p>
                </div>
              </div>
              <script>
                document.getElementById('closeBtn').addEventListener('click', function() {
                  window.close();
                  setTimeout(function() {
                    document.getElementById('closeBtn').style.display = 'none';
                    document.getElementById('fallbackMsg').style.display = 'block';
                  }, 300);
                });
              </script>
            </body>
            </html>
          `);
        }
        
        if (!code || !state) {
          return res.status(400).send('Missing authorization code or state');
        }
        
        // Decode state to get email
        let stateData;
        try {
          stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
        } catch (e) {
          return res.status(400).send('Invalid state parameter');
        }
        
        const { email, codeVerifier, redirect: mobileRedirect } = stateData;
        if (!email) {
          return res.status(400).send('Email not found in state');
        }
        
        // Exchange code for tokens (with PKCE code_verifier)
        const clientId = process.env.SF_CLIENT_ID;
        const clientSecret = process.env.SF_CLIENT_SECRET;
        const redirectUri = process.env.SF_OAUTH_REDIRECT_URI || 'https://gtm-wizard.onrender.com/api/sf/auth/callback';
        
        // Build token request body with PKCE
        const tokenParams = {
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          redirect_uri: redirectUri
        };
        
        // Include code_verifier for PKCE
        if (codeVerifier) {
          tokenParams.code_verifier = codeVerifier;
        }
        
        // Include client_secret if available (for non-PKCE flows)
        if (clientSecret) {
          tokenParams.client_secret = clientSecret;
        }
        
        // Use Eudia My Domain for token exchange
        const tokenResponse = await fetch('https://eudia.my.salesforce.com/services/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(tokenParams)
        });
        
        if (!tokenResponse.ok) {
          const errorBody = await tokenResponse.text();
          logger.error(`SF token exchange failed: ${errorBody}`);
          return res.status(400).send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Connection Failed - Eudia</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
              <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
                  color: #ffffff;
                }
                .container { text-align: center; padding: 40px; max-width: 420px; }
                .logo-text { font-size: 24px; font-weight: 600; margin-bottom: 32px; color: #8b9bf4; }
                .card {
                  background: rgba(255, 255, 255, 0.08);
                  backdrop-filter: blur(20px);
                  border: 1px solid rgba(255, 255, 255, 0.1);
                  border-radius: 16px;
                  padding: 40px 32px;
                }
                .error-circle {
                  width: 72px; height: 72px;
                  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                  border-radius: 50%;
                  display: flex; align-items: center; justify-content: center;
                  margin: 0 auto 24px;
                  box-shadow: 0 8px 32px rgba(239, 68, 68, 0.3);
                }
                .error-circle svg { width: 36px; height: 36px; stroke: white; stroke-width: 3; fill: none; }
                h1 { font-size: 28px; font-weight: 600; margin-bottom: 12px; }
                .subtitle { color: rgba(255, 255, 255, 0.7); font-size: 14px; }
                .close-btn {
                  display: inline-block; margin-top: 24px; padding: 12px 28px;
                  background: rgba(139, 155, 244, 0.15); border: 1px solid rgba(139, 155, 244, 0.3);
                  color: #8b9bf4; font-size: 14px; font-weight: 500; border-radius: 8px;
                  cursor: pointer; transition: all 0.2s ease; text-decoration: none;
                }
                .close-btn:hover { background: rgba(139, 155, 244, 0.25); }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="logo-text">Eudia</div>
                <div class="card">
                  <div class="error-circle">
                    <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </div>
                  <h1>Connection Failed</h1>
                  <p class="subtitle">Please close this window and try again.</p>
                  <button class="close-btn" id="closeBtn">Close Window</button>
                  <p class="fallback-msg" id="fallbackMsg" style="display: none; margin-top: 12px; color: #6b7280; font-size: 13px;">You can now close this tab.</p>
                </div>
              </div>
              <script>
                document.getElementById('closeBtn').addEventListener('click', function() {
                  window.close();
                  setTimeout(function() {
                    document.getElementById('closeBtn').style.display = 'none';
                    document.getElementById('fallbackMsg').style.display = 'block';
                  }, 300);
                });
              </script>
            </body>
            </html>
          `);
        }
        
        const tokens = await tokenResponse.json();
        
        // Store tokens using the token service
        const userTokenService = require('./services/userTokenService');
        await userTokenService.storeTokens(email, {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          instance_url: tokens.instance_url,
          expires_in: 7200 // SF tokens expire in 2 hours
        });
        
        logger.info(`✅ SF OAuth complete for ${email} - tokens stored`);
        
        // If mobile redirect is set, redirect there with email cookie
        if (mobileRedirect) {
          // Set email cookie for mobile session
          res.cookie('userEmail', email.toLowerCase(), { 
            httpOnly: true, 
            secure: true, 
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
          });
          
          logger.info(`📱 Redirecting ${email} to mobile: ${mobileRedirect}`);
          return res.redirect(mobileRedirect);
        }
        
        // Return Eudia-branded success page (for desktop/Obsidian)
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Connected - Eudia</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { 
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
                color: #ffffff;
              }
              .container {
                text-align: center;
                padding: 40px;
                max-width: 420px;
              }
              .logo-wrapper {
                margin-bottom: 32px;
              }
              .logo {
                width: 48px;
                height: 48px;
                display: inline-block;
              }
              .logo-text {
                font-size: 24px;
                font-weight: 600;
                margin-top: 12px;
                color: #ffffff;
                letter-spacing: -0.5px;
              }
              .card {
                background: rgba(255, 255, 255, 0.08);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                padding: 40px 32px;
              }
              .checkmark-circle {
                width: 72px;
                height: 72px;
                background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 24px;
                box-shadow: 0 8px 32px rgba(34, 197, 94, 0.3);
              }
              .checkmark-circle svg {
                width: 36px;
                height: 36px;
                stroke: white;
                stroke-width: 3;
                fill: none;
              }
              h1 {
                font-size: 28px;
                font-weight: 600;
                margin-bottom: 12px;
                color: #ffffff;
              }
              .subtitle {
                color: rgba(255, 255, 255, 0.7);
                font-size: 15px;
                margin-bottom: 8px;
              }
              .email {
                font-weight: 500;
                color: #8b9bf4;
                font-size: 16px;
              }
              .divider {
                height: 1px;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                margin: 28px 0;
              }
              .instructions {
                color: rgba(255, 255, 255, 0.5);
                font-size: 13px;
                line-height: 1.5;
              }
              .close-btn {
                display: inline-block;
                margin-top: 24px;
                padding: 12px 28px;
                background: rgba(139, 155, 244, 0.15);
                border: 1px solid rgba(139, 155, 244, 0.3);
                color: #8b9bf4;
                font-size: 14px;
                font-weight: 500;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
              }
              .close-btn:hover {
                background: rgba(139, 155, 244, 0.25);
                border-color: rgba(139, 155, 244, 0.5);
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="logo-wrapper">
                <svg class="logo" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="48" height="48" rx="12" fill="#8b9bf4"/>
                  <path d="M14 24h20M24 14v20" stroke="white" stroke-width="3" stroke-linecap="round"/>
                </svg>
                <div class="logo-text">Eudia</div>
              </div>
              <div class="card">
                <div class="checkmark-circle">
                  <svg viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <h1>Connected</h1>
                <p class="subtitle">Salesforce is now linked to</p>
                <p class="email">${email}</p>
                <div class="divider"></div>
                <p class="instructions">
                  Return to Obsidian. Your notes will now sync<br>
                  to Salesforce with your name as the author.
                </p>
                <button class="close-btn" id="closeBtn">Close Window</button>
                <p class="fallback-msg" id="fallbackMsg" style="display: none;">You can now close this tab.</p>
              </div>
            </div>
            <script>
              document.getElementById('closeBtn').addEventListener('click', function() {
                window.close();
                setTimeout(function() {
                  document.getElementById('closeBtn').style.display = 'none';
                  document.getElementById('fallbackMsg').style.display = 'block';
                }, 300);
              });
            </script>
          </body>
          </html>
        `);
        
      } catch (error) {
        logger.error('Error in SF OAuth callback:', error);
        res.status(500).send(`
          <html>
          <head><title>Error</title></head>
          <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>Something went wrong</h1>
            <p>${error.message}</p>
          </body>
          </html>
        `);
      }
    });
    
    // Check if user has valid SF OAuth tokens
    this.expressApp.get('/api/sf/auth/status', async (req, res) => {
      try {
        const { email } = req.query;
        
        if (!email) {
          return res.status(400).json({
            success: false,
            error: 'Email parameter required'
          });
        }
        
        const userTokenService = require('./services/userTokenService');
        const status = await userTokenService.checkAuthStatus(email);
        
        res.json({
          success: true,
          email: email.toLowerCase(),
          ...status
        });
        
      } catch (error) {
        logger.error('Error checking SF auth status:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Revoke user's SF tokens (admin only)
    this.expressApp.post('/api/sf/auth/revoke', async (req, res) => {
      try {
        const { email, adminKey } = req.body;
        
        // Simple admin key check (should use proper auth in production)
        const expectedAdminKey = process.env.ADMIN_API_KEY || 'eudia-admin-key';
        if (adminKey !== expectedAdminKey) {
          return res.status(403).json({
            success: false,
            error: 'Invalid admin key'
          });
        }
        
        if (!email) {
          return res.status(400).json({
            success: false,
            error: 'Email parameter required'
          });
        }
        
        const userTokenService = require('./services/userTokenService');
        await userTokenService.revokeTokens(email);
        
        logger.info(`🗑️ Admin revoked tokens for ${email}`);
        
        res.json({
          success: true,
          message: `Tokens revoked for ${email}`
        });
        
      } catch (error) {
        logger.error('Error revoking SF tokens:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // List all authenticated users (admin only)
    this.expressApp.get('/api/sf/auth/users', async (req, res) => {
      try {
        const { adminKey } = req.query;
        
        const expectedAdminKey = process.env.ADMIN_API_KEY || 'eudia-admin-key';
        if (adminKey !== expectedAdminKey) {
          return res.status(403).json({
            success: false,
            error: 'Invalid admin key'
          });
        }
        
        const userTokenService = require('./services/userTokenService');
        const users = await userTokenService.listAuthenticatedUsers();
        
        res.json({
          success: true,
          count: users.length,
          users
        });
        
      } catch (error) {
        logger.error('Error listing authenticated users:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // OBSIDIAN NOTE SYNC
    // Receives notes from Obsidian plugin and appends to Customer_Brain__c
    // Supports per-user OAuth for proper attribution (LastModifiedBy)
    // ═══════════════════════════════════════════════════════════════════════════
    this.expressApp.post('/api/notes/sync', async (req, res) => {
      try {
        const { accountId, accountName, noteTitle, notePath, content, frontmatter, syncedAt, userEmail } = req.body;
        
        if (!accountId || !noteTitle) {
          return res.status(400).json({ 
            success: false, 
            error: 'accountId and noteTitle are required' 
          });
        }

        logger.info(`Obsidian note sync: "${noteTitle}" for account ${accountName} (${accountId})${userEmail ? ` by ${userEmail}` : ''}`);
        
        // Extract summary from content (between ## Summary and next ##)
        let summary = '';
        const summaryMatch = content.match(/## Summary\s*\n([\s\S]*?)(?=\n## |$)/);
        if (summaryMatch) {
          summary = summaryMatch[1].trim();
        }
        
        // Extract next steps
        let nextSteps = '';
        const nextStepsMatch = content.match(/## Next Steps\s*\n([\s\S]*?)(?=\n## |$)/);
        if (nextStepsMatch) {
          nextSteps = nextStepsMatch[1].trim();
        }
        
        // Format the meeting note for Customer Brain
        const dateStr = new Date().toISOString().split('T')[0];
        const meetingNote = `
---
**${noteTitle}** (${dateStr})
${summary ? `\n${summary}` : ''}
${nextSteps ? `\n**Next Steps:**\n${nextSteps}` : ''}
---
`;
        
        // Push to Salesforce Customer_Brain__c
        let sfResult = { updated: false, usedUserToken: false };
        
        try {
          let sfClient = null;
          
          // Try to use per-user OAuth token if userEmail is provided
          if (userEmail) {
            try {
              const userTokenService = require('./services/userTokenService');
              const jsforce = require('jsforce');
              
              const tokens = await userTokenService.getTokens(userEmail);
              
              if (tokens && tokens.accessToken) {
                // Check if token is expired and needs refresh
                if (tokens.isExpired && tokens.refreshToken) {
                  logger.info(`🔄 Refreshing expired token for ${userEmail}`);
                  
                  const clientId = process.env.SF_CLIENT_ID;
                  const clientSecret = process.env.SF_CLIENT_SECRET;
                  
                  // Use Eudia My Domain for token refresh
                  const refreshResponse = await fetch('https://eudia.my.salesforce.com/services/oauth2/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                      grant_type: 'refresh_token',
                      refresh_token: tokens.refreshToken,
                      client_id: clientId,
                      client_secret: clientSecret
                    })
                  });
                  
                  if (refreshResponse.ok) {
                    const newTokens = await refreshResponse.json();
                    await userTokenService.updateAccessToken(userEmail, newTokens.access_token);
                    tokens.accessToken = newTokens.access_token;
                    tokens.instanceUrl = newTokens.instance_url || tokens.instanceUrl;
                  } else {
                    logger.warn(`Token refresh failed for ${userEmail}, falling back to admin connection`);
                  }
                }
                
                // Create per-user connection
                if (tokens.accessToken && !tokens.isExpired) {
                  sfClient = new jsforce.Connection({
                    instanceUrl: tokens.instanceUrl,
                    accessToken: tokens.accessToken
                  });
                  sfResult.usedUserToken = true;
                  sfResult.syncedBy = userEmail;
                  logger.info(`🔐 Using OAuth token for ${userEmail}`);
                }
              } else {
                logger.info(`No OAuth token for ${userEmail}, falling back to admin connection`);
              }
            } catch (tokenError) {
              logger.warn(`Error getting user token for ${userEmail}:`, tokenError.message);
              // Fall through to admin connection
            }
          }
          
          // Fall back to admin connection if no user token
          if (!sfClient && this.salesforceClient) {
            sfClient = this.salesforceClient;
            sfResult.usedAdminConnection = true;
          }
          
          if (sfClient) {
            // Get current Customer Brain
            const account = await sfClient.sobject('Account').retrieve(accountId, ['Customer_Brain__c']);
            const currentBrain = account.Customer_Brain__c || '';
            
            // Prepend new meeting note (most recent first)
            const updatedBrain = meetingNote + currentBrain;
            
            // Update Salesforce
            await sfClient.sobject('Account').update({
              Id: accountId,
              Customer_Brain__c: updatedBrain.substring(0, 131072) // Truncate to SF field limit
            });
            
            sfResult.updated = true;
            sfResult.field = 'Customer_Brain__c';
            logger.info(`✅ Salesforce Customer_Brain__c updated for ${accountName}${sfResult.usedUserToken ? ` (by ${userEmail})` : ' (admin)'}`);
          } else {
            logger.warn('No Salesforce client available for note sync');
            sfResult = { updated: false, reason: 'Salesforce not connected. Please authenticate first.' };
          }
        } catch (sfError) {
          logger.error('Failed to update Salesforce:', sfError.message);
          sfResult = { updated: false, error: sfError.message };
          
          // If it's a session error and we used user token, suggest re-auth
          if (sfError.errorCode === 'INVALID_SESSION_ID' && userEmail) {
            sfResult.authRequired = true;
            sfResult.authUrl = `/api/sf/auth/start?email=${encodeURIComponent(userEmail)}`;
          }
        }
        
        // Extract key meeting data from content
        const meetingData = {
          accountId,
          accountName,
          noteTitle,
          notePath,
          syncedAt,
          frontmatter,
          hasSummary: content.includes('## Summary'),
          hasMeddicc: content.includes('## MEDDICC'),
          hasNextSteps: content.includes('## Next Steps'),
          hasActionItems: content.includes('## Action Items'),
          contentLength: content.length,
          salesforce: sfResult
        };

        logger.info('Meeting data extracted:', JSON.stringify(meetingData, null, 2));
        
        res.json({ 
          success: sfResult.updated,
          message: sfResult.updated 
            ? `Note synced to Salesforce${sfResult.usedUserToken ? ` as ${userEmail}` : ''}` 
            : sfResult.authRequired 
              ? 'Authentication required. Please connect to Salesforce first.'
              : 'Note received but Salesforce update failed',
          data: meetingData,
          authRequired: sfResult.authRequired,
          authUrl: sfResult.authUrl
        });

      } catch (error) {
        logger.error('Error syncing Obsidian note:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // AUDIO TRANSCRIPTION (Eudia Transcription Plugin)
    // Handles audio transcription via Whisper and summarization via GPT-4o
    // ═══════════════════════════════════════════════════════════════════════════
    
    const { transcriptionService } = require('./services/transcriptionService');

    // ═══════════════════════════════════════════════════════════════════════
    // PIPELINE CONTEXT - Salesforce data for pipeline review meeting summaries
    // ═══════════════════════════════════════════════════════════════════════
    this.expressApp.get('/api/pipeline-context', async (req, res) => {
      try {
        const { query: sfQuery } = require('./salesforce/connection');
        
        // Active stages for pipeline
        const activeStages = [
          'Stage 0 - Qualifying',
          'Stage 1 - Discovery', 
          'Stage 2 - SQO',
          'Stage 3 - Pilot / POC',
          'Stage 4 - Proposal / Pricing',
          'Stage 5 - Contracting / Negotiation'
        ];
        const stageFilter = activeStages.map(s => `'${s}'`).join(',');
        
        // Query 1: Per-BL summary (commit totals, deal counts)
        const blSummaryQuery = `
          SELECT Owner.Name ownerName, 
                 COUNT(Id) dealCount, 
                 SUM(ACV__c) totalACV,
                 SUM(CASE WHEN BL_Forecast_Category__c = 'Commit' THEN ACV__c ELSE 0 END) commitACV,
                 SUM(Weighted_ACV__c) weightedACV
          FROM Opportunity 
          WHERE StageName IN (${stageFilter})
          GROUP BY Owner.Name
          ORDER BY Owner.Name
        `;
        
        // Query 2: Key deals (Stage 4-5 and Commit)
        const keyDealsQuery = `
          SELECT Name, Account.Name accountName, Owner.Name ownerName, StageName,
                 ACV__c, BL_Forecast_Category__c, Target_LOI_Date__c, Product_Line__c
          FROM Opportunity 
          WHERE StageName IN (${stageFilter})
            AND (StageName LIKE 'Stage 4%' OR StageName LIKE 'Stage 5%' OR BL_Forecast_Category__c = 'Commit')
          ORDER BY Owner.Name, ACV__c DESC
        `;
        
        const [blSummary, keyDeals] = await Promise.all([
          sfQuery(blSummaryQuery, true).catch(() => ({ records: [] })),
          sfQuery(keyDealsQuery, true).catch(() => ({ records: [] }))
        ]);
        
        // Build structured context string
        let context = '=== CURRENT PIPELINE SNAPSHOT ===\n\n';
        
        // BL summaries
        context += '--- Business Lead Totals ---\n';
        for (const bl of (blSummary.records || [])) {
          const commit = bl.commitACV ? `$${Math.round(bl.commitACV / 1000)}k commit` : 'no commit';
          context += `${bl.ownerName}: ${bl.dealCount} deals, $${Math.round((bl.totalACV || 0) / 1000)}k ACV, ${commit}\n`;
        }
        
        // Key deals
        context += '\n--- Key Deals (Late Stage & Commit) ---\n';
        for (const deal of (keyDeals.records || [])) {
          const acvStr = deal.ACV__c ? `$${Math.round(deal.ACV__c / 1000)}k` : '$0';
          const dateStr = deal.Target_LOI_Date__c || 'No date';
          context += `${deal.accountName} | ${deal.ownerName} | ${deal.StageName} | ${acvStr} | ${deal.BL_Forecast_Category__c || 'Pipeline'} | Target: ${dateStr} | ${deal.Product_Line__c || ''}\n`;
        }
        
        return res.json({ success: true, context });
        
      } catch (error) {
        console.error('[Pipeline Context] Error fetching pipeline data:', error);
        return res.json({ 
          success: true, 
          context: '(Salesforce pipeline data unavailable - cross-reference manually)' 
        });
      }
    });

    // Combined transcribe and summarize endpoint
    this.expressApp.post('/api/transcribe-and-summarize', async (req, res) => {
      try {
        const { audio, mimeType, accountName, accountId, context, openaiApiKey, systemPrompt, meetingType, userEmail } = req.body;
        
        if (!audio) {
          return res.status(400).json({ 
            success: false, 
            error: 'audio (base64) is required' 
          });
        }

        // If client provided an API key and server doesn't have one, use client's key
        if (openaiApiKey && !transcriptionService.isReady()) {
          logger.info('Using client-provided OpenAI API key');
          transcriptionService.initWithKey(openaiApiKey);
        }

        // Detect CS user for CS-specific summarization
        const CS_EMAILS = ['nikhita.godiwala@eudia.com', 'jon.dedych@eudia.com', 'farah.haddad@eudia.com'];
        const normalizedEmail = (userEmail || context?.userEmail || '').toLowerCase().trim();
        const userGroup = CS_EMAILS.includes(normalizedEmail) ? 'cs' : 'bl';

        logger.info(`Transcription request: account=${accountName || 'unknown'}, mimeType=${mimeType || 'audio/webm'}, meetingType=${meetingType || 'discovery'}, userGroup=${userGroup}`);

        // Build context for summarization
        const summaryContext = {
          accountName,
          accountId,
          meetingType: meetingType || 'discovery',
          userGroup,
          ...context
        };
        
        // Pass client-provided system prompt if available (e.g., pipeline review prompt)
        // BUT: CS users always use server-side CS template (override client prompt)
        if (systemPrompt && userGroup !== 'cs') {
          summaryContext.customSystemPrompt = systemPrompt;
        } else if (userGroup === 'cs') {
          logger.info(`[Transcription] CS user detected (${normalizedEmail}) — using server-side CS summarization template`);
        }

        // If we have an accountId, fetch additional context from Salesforce
        if (accountId) {
          try {
            const sfContext = await this.fetchAccountContext(accountId);
            if (sfContext) {
              summaryContext.opportunities = sfContext.opportunities;
              summaryContext.customerBrain = sfContext.customerBrain;
              summaryContext.contacts = sfContext.contacts;
            }
          } catch (sfError) {
            logger.warn('Failed to fetch SF context:', sfError.message);
          }
        }

        // Process the audio
        const result = await transcriptionService.transcribeAndSummarize(
          audio,
          mimeType || 'audio/webm',
          summaryContext
        );

        if (!result.success) {
          return res.status(500).json(result);
        }

        logger.info(`Transcription complete: ${result.transcript?.length || 0} chars, ${result.duration || 0}s`);

        // Archive transcript to PostgreSQL and enqueue pipeline agent (non-blocking)
        try {
          const { transcriptRepo, analyticsRepo } = require('./db/repositories');
          const transcriptId = await transcriptRepo.archiveTranscript({
            meetingDate: new Date(),
            meetingSubject: accountName || 'Unknown Meeting',
            accountName: accountName,
            accountId: accountId,
            transcript: result.transcript,
            summary: result.sections?.summary,
            sections: result.sections,
            durationSeconds: result.duration,
            meetingType: meetingType || 'discovery',
            source: 'plugin'
          }).catch(err => { logger.debug('[TranscriptArchive] Archive skipped:', err.message); return null; });
          
          analyticsRepo.trackEvent('transcription_completed', null, { accountName, meetingType, durationSeconds: result.duration }).catch(() => {});
          
          // Auto-enqueue pipeline review agent for pipeline meetings
          if (meetingType === 'pipeline_review' && transcriptId) {
            try {
              const agentJobQueue = require('./agents/jobQueue');
              await agentJobQueue.enqueue('pipeline_review', {
                transcriptId,
                transcript: result.transcript,
                summary: result.sections?.summary,
                meetingDate: new Date().toISOString()
              }, { priority: 5 });
              logger.info(`[TranscriptionEndpoint] Enqueued pipeline review agent for transcript #${transcriptId}`);
            } catch (jqErr) {
              logger.debug('[TranscriptionEndpoint] Pipeline agent enqueue skipped:', jqErr.message);
            }
          }
        } catch (archiveErr) {
          // Non-critical — don't fail the response
        }

        res.json({
          success: true,
          transcript: result.transcript,
          sections: result.sections,
          duration: result.duration
        });

      } catch (error) {
        logger.error('Transcription error:', error);
        logger.error('Transcription error stack:', error.stack);
        res.status(500).json({ 
          success: false, 
          error: error.message || 'Unknown transcription error',
          details: process.env.NODE_ENV !== 'production' ? error.stack?.split('\n').slice(0, 3).join(' | ') : undefined
        });
      }
    });

    // Transcribe only (without summarization)
    this.expressApp.post('/api/transcribe', async (req, res) => {
      try {
        const { audio, mimeType } = req.body;
        
        if (!audio) {
          return res.status(400).json({ 
            success: false, 
            error: 'audio (base64) is required' 
          });
        }

        const audioBuffer = Buffer.from(audio, 'base64');
        const result = await transcriptionService.transcribe(audioBuffer, mimeType || 'audio/webm');

        res.json(result);

      } catch (error) {
        logger.error('Transcription error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Summarize transcript only
    this.expressApp.post('/api/summarize', async (req, res) => {
      try {
        const { transcript, accountName, accountId, context } = req.body;
        
        if (!transcript) {
          return res.status(400).json({ 
            success: false, 
            error: 'transcript is required' 
          });
        }

        const result = await transcriptionService.summarize(transcript, {
          accountName,
          accountId,
          ...context
        });

        res.json(result);

      } catch (error) {
        logger.error('Summarization error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Process transcript sections (server-side GPT call for plugin fallback)
    // This endpoint allows the Obsidian plugin to extract sections without needing an API key
    this.expressApp.post('/api/process-sections', async (req, res) => {
      try {
        const { transcript, accountName, context } = req.body;
        
        if (!transcript) {
          return res.status(400).json({ 
            success: false, 
            error: 'transcript is required' 
          });
        }

        logger.info(`Processing sections for: ${accountName || 'unknown account'}, transcript length: ${transcript.length}`);

        // Use the transcriptionService.summarize method which extracts structured sections
        const result = await transcriptionService.summarize(transcript, {
          accountName,
          ...context
        });

        if (!result.success) {
          return res.status(500).json({
            success: false,
            error: result.error || 'Failed to process sections'
          });
        }

        res.json({
          success: true,
          sections: result.sections || {
            attendees: '',
            summary: '',
            keyPoints: '',
            nextSteps: '',
            meddiccSignals: '',
            concerns: ''
          }
        });

      } catch (error) {
        logger.error('Process sections error:', error);
        res.status(500).json({ 
          success: false, 
          error: error.message || 'Failed to process transcript sections'
        });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // LIVE QUERY - Query accumulated transcript during a call
    // Allows users to ask questions like "What did Tom say about pricing?"
    // ═══════════════════════════════════════════════════════════════════════════
    this.expressApp.post('/api/live-query', async (req, res) => {
      try {
        const { question, transcript, accountName, systemPrompt } = req.body;
        
        if (!question || !transcript) {
          return res.status(400).json({ 
            success: false, 
            error: 'question and transcript are required' 
          });
        }

        logger.info(`Live query: "${question.substring(0, 50)}..." for ${accountName || 'unknown'}`);

        // Use Claude for fast, accurate query response
        const Anthropic = require('@anthropic-ai/sdk');
        const anthropic = new Anthropic.default();

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: systemPrompt || `You are an AI assistant helping during an active sales call. Answer questions about what was discussed based on the transcript provided. Be concise and quote directly when relevant.`,
          messages: [
            {
              role: 'user',
              content: `Here is the conversation transcript so far:\n\n${transcript}\n\n---\n\nQuestion: ${question}`
            }
          ]
        });

        const answer = response.content[0]?.text || 'No response generated';

        res.json({
          success: true,
          answer
        });

      } catch (error) {
        logger.error('Live query error:', error);
        res.status(500).json({ 
          success: false, 
          error: error.message || 'Failed to process query'
        });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // TRANSCRIBE CHUNK - Transcribe audio chunk without summarization
    // For incremental live transcription during recording
    // ═══════════════════════════════════════════════════════════════════════════
    this.expressApp.post('/api/transcribe-chunk', async (req, res) => {
      try {
        const { audio, mimeType } = req.body;
        
        if (!audio) {
          return res.status(400).json({ 
            success: false, 
            error: 'audio (base64) is required' 
          });
        }

        const audioBuffer = Buffer.from(audio, 'base64');
        
        // Use transcription service for just the transcription part
        const result = await transcriptionService.transcribe(audioBuffer, mimeType || 'audio/webm');

        if (!result.success) {
          return res.status(500).json({
            success: false,
            error: result.error || 'Chunk transcription failed'
          });
        }

        res.json({
          success: true,
          text: result.text || ''
        });

      } catch (error) {
        logger.error('Chunk transcription error:', error);
        res.status(500).json({ 
          success: false, 
          error: error.message || 'Failed to transcribe chunk'
        });
      }
    });

    // Get meeting context for pre-call injection
    this.expressApp.get('/api/meeting-context/:accountId', async (req, res) => {
      try {
        const { accountId } = req.params;
        
        if (!accountId) {
          return res.status(400).json({ 
            success: false, 
            error: 'accountId is required' 
          });
        }

        const context = await this.fetchAccountContext(accountId);
        
        if (!context) {
          return res.status(404).json({ 
            success: false, 
            error: 'Account not found' 
          });
        }

        res.json({
          success: true,
          account: {
            id: context.account.Id,
            name: context.account.Name,
            owner: context.account.Owner?.Name,
            customerBrain: context.customerBrain
          },
          opportunities: context.opportunities,
          contacts: context.contacts,
          lastMeeting: context.lastMeeting
        });

      } catch (error) {
        logger.error('Meeting context error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Sync transcription results to Salesforce
    this.expressApp.post('/api/transcription/sync-to-salesforce', async (req, res) => {
      try {
        const { accountId, accountName, noteTitle, sections, transcript, meetingDate } = req.body;
        
        if (!accountId || !noteTitle) {
          return res.status(400).json({ 
            success: false, 
            error: 'accountId and noteTitle are required' 
          });
        }

        logger.info(`Syncing transcription to Salesforce: ${noteTitle} for ${accountName}`);

        const result = await this.syncTranscriptionToSalesforce(
          accountId,
          accountName,
          noteTitle,
          sections,
          transcript,
          meetingDate
        );

        res.json(result);

      } catch (error) {
        logger.error('Salesforce sync error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Transcription service status (for monitoring)
    this.expressApp.get('/api/transcription/status', (req, res) => {
      try {
        const { transcriptionService, CONFIG } = require('./services/transcriptionService');
        
        res.json({
          success: true,
          ready: transcriptionService.isReady(),
          queue: transcriptionService.getQueueStatus(),
          config: {
            maxChunkSizeMB: CONFIG.MAX_CHUNK_SIZE / 1024 / 1024,
            maxConcurrent: CONFIG.MAX_CONCURRENT,
            maxDurationHours: CONFIG.MAX_DURATION_SECONDS / 3600,
            maxRetries: CONFIG.MAX_RETRIES
          },
          limits: {
            maxRecordingMinutes: 120,
            estimatedCostPer60Min: '$0.44',
            supportedFormats: ['webm', 'mp4', 'm4a', 'mp3', 'ogg', 'wav']
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get historical meeting preps for an account
    this.expressApp.get('/api/meeting-prep/account/:accountId', async (req, res) => {
      try {
        const { accountId } = req.params;
        const preps = await meetingPrepService.getMeetingPrepsByAccount(accountId);
        res.json({ success: true, preps });
      } catch (error) {
        logger.error('Error fetching account meeting preps:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get demo product options
    this.expressApp.get('/api/meeting-prep/options', (req, res) => {
      res.json({ 
        success: true, 
        demoProducts: meetingPrepService.DEMO_PRODUCTS,
        templates: meetingPrepService.FIRST_MEETING_TEMPLATES
      });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // ENRICHMENT JOB ROUTES
    // ═══════════════════════════════════════════════════════════════════════════

    // Manually trigger meeting enrichment job
    this.expressApp.post('/api/enrichment/run', async (req, res) => {
      try {
        const { triggerEnrichmentJob } = require('./jobs/enrichMeetings');
        const result = await triggerEnrichmentJob();
        res.json({ success: true, result });
      } catch (error) {
        logger.error('Error running enrichment job:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get enrichment job status
    this.expressApp.get('/api/enrichment/status', (req, res) => {
      try {
        const { getJobStatus } = require('./jobs/enrichMeetings');
        const { attendeeBioService } = require('./services/attendeeBioService');
        const { clayEnrichment } = require('./services/clayEnrichment');
        
        res.json({ 
          success: true, 
          job: getJobStatus(),
          claude: attendeeBioService.getUsageStats(),
          clay: clayEnrichment.getCacheStats()
        });
      } catch (error) {
        logger.error('Error getting enrichment status:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // CONTACT GAP ANALYSIS
    // Identifies missing contacts from BL calendars
    // ═══════════════════════════════════════════════════════════════════════
    
    // Run contact gap analysis
    this.expressApp.get('/api/contacts/gap-analysis', async (req, res) => {
      try {
        const contactGapAnalysis = require('./services/contactGapAnalysis');
        const daysBack = parseInt(req.query.days) || 90;
        const minMeetings = parseInt(req.query.minMeetings) || 1;
        
        logger.info(`[ContactGap] Running analysis: ${daysBack} days, min ${minMeetings} meetings`);
        
        const report = await contactGapAnalysis.analyzeContactGaps({
          daysBack,
          minMeetingCount: minMeetings
        });
        
        res.json({ success: true, ...report });
      } catch (error) {
        logger.error('Error running contact gap analysis:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Create contacts from gap analysis (batch)
    this.expressApp.post('/api/contacts/create-batch', async (req, res) => {
      try {
        const contactGapAnalysis = require('./services/contactGapAnalysis');
        const { contacts, dryRun = true, approver = 'api' } = req.body;
        
        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
          return res.status(400).json({ 
            success: false, 
            error: 'contacts array required' 
          });
        }
        
        if (contacts.length > 10) {
          return res.status(400).json({ 
            success: false, 
            error: 'Maximum 10 contacts per batch' 
          });
        }
        
        logger.info(`[ContactGap] Creating batch: ${contacts.length} contacts, dryRun: ${dryRun}`);
        
        const result = await contactGapAnalysis.createContactsBatch(contacts, {
          dryRun,
          approver
        });
        
        res.json({ success: true, ...result });
      } catch (error) {
        logger.error('Error creating contacts batch:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Get contact gap stats
    this.expressApp.get('/api/contacts/gap-stats', async (req, res) => {
      try {
        const intelligenceStore = require('./services/intelligenceStore');
        const stats = await intelligenceStore.getContactGapStats();
        res.json({ success: true, stats });
      } catch (error) {
        logger.error('Error getting contact gap stats:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Contact Gaps Dashboard (HTML view)
    this.expressApp.get('/contacts/gaps', async (req, res) => {
      try {
        const { generateContactGapsHTML } = require('./views/contactGapsView');
        const daysBack = parseInt(req.query.days) || 90;
        const minMeetings = parseInt(req.query.minMeetings) || 1;
        
        const html = await generateContactGapsHTML({ daysBack, minMeetings });
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      } catch (error) {
        logger.error('Error generating contact gaps view:', error);
        res.status(500).send(`<h1>Error</h1><p>${error.message}</p>`);
      }
    });

    // Test calendar connection
    this.expressApp.get('/api/calendar/test', async (req, res) => {
      try {
        const { calendarService } = require('./services/calendarService');
        const result = await calendarService.testConnection();
        res.json({ success: true, result });
      } catch (error) {
        logger.error('Error testing calendar:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get upcoming meetings from Outlook calendars
    this.expressApp.get('/api/calendar/upcoming', async (req, res) => {
      try {
        const { calendarService } = require('./services/calendarService');
        const daysAhead = parseInt(req.query.days) || 7;
        const result = await calendarService.getUpcomingMeetingsForAllBLs(daysAhead);
        res.json({ success: true, ...result });
      } catch (error) {
        logger.error('Error fetching calendar meetings:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ICS CALENDAR FEED FOR OBSIDIAN
    // Serves each BL's calendar as an ICS feed for Obsidian Full Calendar plugin
    // ═══════════════════════════════════════════════════════════════════════
    this.expressApp.get('/api/calendar/:email/feed.ics', async (req, res) => {
      try {
        const { calendarService, BL_EMAILS } = require('./services/calendarService');
        const email = req.params.email.toLowerCase();
        
        // Security: only serve calendars for registered BLs
        if (!BL_EMAILS.map(e => e.toLowerCase()).includes(email)) {
          logger.warn(`ICS feed requested for non-BL email: ${email}`);
          return res.status(403).send('Access denied: Email not in BL list');
        }
        
        // Initialize and fetch calendar
        await calendarService.initialize();
        
        // Fetch 30 days ahead (good balance for Obsidian view)
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7); // Include 7 days back for context
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        
        const events = await calendarService.getCalendarEvents(email, startDate, endDate);
        
        // Convert to ICS format
        const icsContent = this.generateICSFeed(events, email);
        
        // Set proper headers for ICS
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${email.split('@')[0]}-calendar.ics"`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        
        res.send(icsContent);
        
        logger.info(`📅 ICS feed served for ${email}: ${events.length} events`);
        
      } catch (error) {
        logger.error('Error generating ICS feed:', error);
        res.status(500).send('Error generating calendar feed');
      }
    });
    
    // Validate email for calendar access (Obsidian plugin setup)
    this.expressApp.get('/api/calendar/validate/:email', async (req, res) => {
      try {
        const { BL_EMAILS } = require('./services/calendarService');
        const email = req.params.email.toLowerCase();
        
        const isAuthorized = BL_EMAILS.map(e => e.toLowerCase()).includes(email);
        
        if (isAuthorized) {
          res.json({
            success: true,
            authorized: true,
            email: email,
            message: 'Email is authorized for calendar access'
          });
        } else {
          res.json({
            success: true,
            authorized: false,
            email: email,
            message: 'Email not found in authorized users list. Please use your @eudia.com email or contact your administrator.',
            suggestions: email.includes('@') ? [] : ['Did you forget to include the @eudia.com domain?']
          });
        }
      } catch (error) {
        logger.error('Error validating calendar email:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // List available ICS feeds
    this.expressApp.get('/api/calendar/feeds', async (req, res) => {
      try {
        const { BL_EMAILS } = require('./services/calendarService');
        const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://gtm-wizard.onrender.com';
        
        const feeds = BL_EMAILS.map(email => ({
          email,
          name: email.split('@')[0].replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase()),
          icsUrl: `${baseUrl}/api/calendar/${email}/feed.ics`,
          obsidianFormat: `${baseUrl}/api/calendar/${email}/feed.ics`
        }));
        
        res.json({
          success: true,
          totalFeeds: feeds.length,
          feeds,
          instructions: {
            obsidian: [
              '1. Open Obsidian → Settings → Community Plugins → Full Calendar',
              '2. In Full Calendar settings, click "Add Calendar"',
              '3. Choose "Remote" or "ICS/Remote"',
              '4. Paste the icsUrl for your email',
              '5. Set a name (e.g., "Work Calendar")',
              '6. Save and refresh'
            ]
          }
        });
        
      } catch (error) {
        logger.error('Error listing calendar feeds:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // CALENDAR SYNC ENDPOINTS (Background Job Management)
    // ═══════════════════════════════════════════════════════════════════════
    
    // Get calendar sync status (instant - reads from SQLite)
    this.expressApp.get('/api/calendar/sync/status', async (req, res) => {
      try {
        const { getSyncStatus } = require('./jobs/calendarSyncJob');
        const status = await getSyncStatus();
        res.json({ success: true, ...status });
      } catch (error) {
        logger.error('Error getting calendar sync status:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Trigger manual calendar sync (admin only)
    this.expressApp.post('/api/calendar/sync/trigger', async (req, res) => {
      try {
        const { triggerManualSync } = require('./jobs/calendarSyncJob');
        
        // Start sync in background
        res.json({ 
          success: true, 
          message: 'Calendar sync started in background',
          note: 'Check /api/calendar/sync/status for progress'
        });
        
        // Don't await - let it run in background
        triggerManualSync().catch(err => {
          logger.error('Manual calendar sync failed:', err.message);
        });
        
      } catch (error) {
        logger.error('Error triggering calendar sync:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Get git commit job status (Zero Render Storage)
    this.expressApp.get('/api/storage/git/status', async (req, res) => {
      try {
        const { getCommitStatus } = require('./jobs/gitCommitJob');
        const status = getCommitStatus();
        res.json({ success: true, ...status });
      } catch (error) {
        logger.error('Error getting git commit status:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Trigger manual git commit (admin only)
    this.expressApp.post('/api/storage/git/commit', async (req, res) => {
      try {
        const { triggerManualCommit } = require('./jobs/gitCommitJob');
        const result = await triggerManualCommit();
        res.json({ success: true, ...result });
      } catch (error) {
        logger.error('Error triggering git commit:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Get storage overview (all Zero Render Storage components)
    this.expressApp.get('/api/storage/status', async (req, res) => {
      try {
        const { getCommitStatus } = require('./jobs/gitCommitJob');
        const userTokenService = require('./services/userTokenService');
        const meetingPrepFileStore = require('./services/meetingPrepFileStore');
        const enrichmentFileStore = require('./services/enrichmentFileStore');
        const { getCacheStatus } = require('./services/slackIntelCache');
        
        const gitStatus = getCommitStatus();
        const tokenStatus = await userTokenService.getStoreStatus();
        const meetingPrepStatus = meetingPrepFileStore.getStoreStatus();
        const enrichmentStatus = enrichmentFileStore.getStoreStatus();
        const intelStatus = getCacheStatus();
        
        res.json({
          success: true,
          architecture: 'Zero Render Storage',
          description: 'Encrypted data in git, keys only on Render',
          components: {
            tokens: tokenStatus,
            intel: intelStatus,
            meetingPrep: meetingPrepStatus,
            enrichment: enrichmentStatus,
            git: {
              pendingChanges: gitStatus.pendingChanges?.hasChanges || false,
              pendingFiles: gitStatus.pendingChanges?.files || [],
              lastCommit: gitStatus.lastCommitResult?.completedAt || null,
              totalCommits: gitStatus.totalCommits
            }
          },
          featureFlags: {
            useFileTokens: userTokenService.USE_FILE_STORE,
            useSqliteMeetingPrep: process.env.USE_SQLITE_MEETING_PREP === 'true',
            useSqliteEnrichment: process.env.USE_SQLITE_ENRICHMENT === 'true'
          }
        });
      } catch (error) {
        logger.error('Error getting storage status:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Get calendar events from in-memory cache (ephemeral - for debugging)
    // PHASE 2 MIGRATION: No longer reads from SQLite, uses ephemeral memory cache only
    this.expressApp.get('/api/calendar/stored', async (req, res) => {
      try {
        const { calendarService } = require('./services/calendarService');
        // Use in-memory cache (ephemeral) - fetches from Graph API if cache miss
        const result = await calendarService.getUpcomingMeetingsForAllBLs(14);
        
        res.json({
          success: true,
          meetingCount: result.meetings.length,
          stats: result.stats,
          source: 'memory_cache',  // Indicate data source for debugging
          meetings: result.meetings.slice(0, 20) // First 20 for preview
        });
      } catch (error) {
        logger.error('Error getting calendar events:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // OBSIDIAN CALENDAR INTEGRATION ENDPOINTS
    // Used by Eudia Calendar plugin for native calendar view
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Get timezone-aware date boundaries
     * Converts user's local day to UTC boundaries for database queries
     * @param {string} timezone - IANA timezone (e.g., 'America/Los_Angeles')
     * @param {number} daysOffset - Days from today (0 = today, 7 = week ahead)
     * @returns {{ start: Date, end: Date }} - UTC boundaries
     */
    function getTimezoneAwareDateRange(timezone = 'America/New_York', daysOffset = 0, daysRange = 1) {
      try {
        // Get current time in user's timezone
        const now = new Date();
        const userLocalTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        
        // Calculate start of day in user's timezone
        const startOfDayLocal = new Date(userLocalTime);
        startOfDayLocal.setHours(0, 0, 0, 0);
        startOfDayLocal.setDate(startOfDayLocal.getDate() + daysOffset);
        
        // Calculate end of range in user's timezone
        const endOfDayLocal = new Date(startOfDayLocal);
        endOfDayLocal.setDate(endOfDayLocal.getDate() + daysRange);
        
        // Calculate timezone offset to convert back to UTC
        const offsetMs = now.getTime() - userLocalTime.getTime();
        
        // Convert local boundaries to UTC
        const startUTC = new Date(startOfDayLocal.getTime() + offsetMs);
        const endUTC = new Date(endOfDayLocal.getTime() + offsetMs);
        
        return { start: startUTC, end: endUTC };
      } catch (error) {
        // Fallback to server local time if timezone parsing fails
        logger.warn(`Invalid timezone "${timezone}", falling back to server time`);
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() + daysOffset);
        const end = new Date(start);
        end.setDate(end.getDate() + daysRange);
        return { start, end };
      }
    }

    // Get today's meetings for a specific user (Obsidian plugin)
    this.expressApp.get('/api/calendar/:email/today', async (req, res) => {
      try {
        const { calendarService, BL_EMAILS } = require('./services/calendarService');
        const email = req.params.email.toLowerCase();
        const timezone = req.query.timezone || 'America/New_York';
        
        // Security: only serve calendars for registered BLs
        if (!BL_EMAILS.map(e => e.toLowerCase()).includes(email)) {
          logger.warn(`Today's calendar requested for non-BL email: ${email}`);
          return res.status(403).json({ 
            success: false, 
            error: 'Email not registered for calendar access. Please use your @eudia.com email address. If you believe this is an error, contact your administrator to be added to the authorized users list.',
            code: 'EMAIL_NOT_AUTHORIZED'
          });
        }
        
        // ════════════════════════════════════════════════════════════════════
        // ALWAYS fetch LIVE from Microsoft Graph API for this specific user
        // This ensures accurate, real-time calendar data (no stale SQLite)
        // Shows ALL meetings (not just customer meetings) for the user's day
        // ════════════════════════════════════════════════════════════════════
        
        // Get today's date range in user's timezone
        const { start: today, end: tomorrow } = getTimezoneAwareDateRange(timezone, 0, 1);
        
        logger.info(`📅 Fetching LIVE calendar for ${email} (tz: ${timezone}): ${today.toISOString()} to ${tomorrow.toISOString()}`);
        
        // Fetch directly from Graph API for this user - returns ALL events (internal + external)
        const allEvents = await calendarService.getCalendarEvents(email, today, tomorrow);
        
        // Format for Obsidian plugin - show ALL meetings, not just customer ones
        const meetings = allEvents.map(event => ({
          id: event.eventId,
          subject: event.subject,
          start: event.startDateTime,
          end: event.endDateTime,
          location: event.location,
          attendees: (event.externalAttendees || []).map(a => ({
            name: a.name,
            email: a.email
          })),
          isCustomerMeeting: event.isCustomerMeeting,
          accountName: null, // Account matching happens elsewhere
          accountId: null,
          onlineMeetingUrl: event.meetingUrl || ''
        }));
        
        // Sort by start time
        meetings.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
        
        res.json({
          success: true,
          date: today.toISOString().split('T')[0],
          email: email,
          meetingCount: meetings.length,
          meetings: meetings,
          source: 'live' // Indicates this is live Graph API data
        });
        
        logger.info(`📅 LIVE calendar served for ${email}: ${meetings.length} meetings for today`);
        
      } catch (error) {
        logger.error('Error getting today\'s calendar:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get this week's meetings for a specific user (Obsidian plugin)
    this.expressApp.get('/api/calendar/:email/week', async (req, res) => {
      try {
        const { calendarService, BL_EMAILS } = require('./services/calendarService');
        const email = req.params.email.toLowerCase();
        const timezone = req.query.timezone || 'America/New_York';
        
        // Security: only serve calendars for registered BLs
        if (!BL_EMAILS.map(e => e.toLowerCase()).includes(email)) {
          logger.warn(`Week calendar requested for non-BL email: ${email}`);
          return res.status(403).json({ 
            success: false, 
            error: 'Email not registered for calendar access. Please use your @eudia.com email address.',
            code: 'EMAIL_NOT_AUTHORIZED'
          });
        }
        
        // ════════════════════════════════════════════════════════════════════
        // ALWAYS fetch LIVE from Microsoft Graph API for this specific user
        // Shows ALL meetings (internal + external) for accurate calendar view
        // ════════════════════════════════════════════════════════════════════
        
        // Get this week's date range (today + 7 days) in user's timezone
        const { start: startDate, end: endDate } = getTimezoneAwareDateRange(timezone, 0, 7);
        
        logger.info(`📅 Fetching LIVE week calendar for ${email} (tz: ${timezone}): ${startDate.toISOString()} to ${endDate.toISOString()}`);
        
        // Fetch directly from Graph API for this specific user
        const allEvents = await calendarService.getCalendarEvents(email, startDate, endDate);
        
        // Group by day for easier rendering
        const byDay = {};
        allEvents.forEach(event => {
          const day = event.startDateTime?.split('T')[0];
          if (!day) return;
          if (!byDay[day]) byDay[day] = [];
          byDay[day].push({
            id: event.eventId,
            subject: event.subject,
            start: event.startDateTime,
            end: event.endDateTime,
            location: event.location,
            attendees: (event.externalAttendees || []).map(a => ({
              name: a.name,
              email: a.email
            })),
            isCustomerMeeting: event.isCustomerMeeting,
            accountName: null,
            accountId: null,
            onlineMeetingUrl: event.meetingUrl || ''
          });
        });
        
        res.json({
          success: true,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          email: email,
          totalMeetings: allEvents.length,
          byDay: byDay,
          source: 'live'
        });
        
        logger.info(`📅 LIVE week calendar served for ${email}: ${allEvents.length} meetings`);
        
      } catch (error) {
        logger.error('Error getting week\'s calendar:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get meetings for a custom date range (Obsidian plugin)
    this.expressApp.get('/api/calendar/:email/range', async (req, res) => {
      try {
        const { BL_EMAILS } = require('./services/calendarService');
        const intelligenceStore = require('./services/intelligenceStore');
        const email = req.params.email.toLowerCase();
        const { start, end } = req.query;
        
        if (!start || !end) {
          return res.status(400).json({ 
            success: false, 
            error: 'Missing start or end query parameters' 
          });
        }
        
        // Security: only serve calendars for registered BLs
        if (!BL_EMAILS.map(e => e.toLowerCase()).includes(email)) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
        
        const startDate = new Date(start);
        const endDate = new Date(end);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid date format. Use ISO format.' 
          });
        }
        
        const events = await intelligenceStore.getStoredCalendarEvents(startDate, endDate, {
          ownerEmail: email
        });
        
        const meetings = events.map(event => ({
          id: event.id || event.event_id,
          subject: event.subject,
          start: event.start_datetime,
          end: event.end_datetime,
          location: event.location,
          attendees: event.externalAttendees || [],
          isCustomerMeeting: event.isCustomerMeeting,
          accountName: event.matched_account_name,
          accountId: event.matched_account_id
        }));
        
        res.json({
          success: true,
          startDate: start,
          endDate: end,
          email: email,
          meetingCount: meetings.length,
          meetings: meetings
        });
        
      } catch (error) {
        logger.error('Error getting calendar range:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Health check endpoint - comprehensive system status
    this.expressApp.get('/api/health', async (req, res) => {
      try {
        const intelligenceStore = require('./services/intelligenceStore');
        const { getSyncStatus } = require('./jobs/calendarSyncJob');
        
        const checks = {
          server: { status: 'ok', timestamp: new Date().toISOString() },
          postgresql: { status: 'unknown' },
          agentQueue: { status: 'unknown' },
          database: { status: 'unknown' },
          calendarSync: { status: 'unknown' },
          salesforce: { status: 'unknown' }
        };

        // Check PostgreSQL
        try {
          const db = require('./db/connection');
          if (db.isAvailable()) {
            const pgResult = await db.query('SELECT COUNT(*) as count FROM _migrations');
            checks.postgresql = { status: 'ok', migrations: parseInt(pgResult.rows[0]?.count || 0) };
          } else {
            checks.postgresql = { status: 'not_configured' };
          }
        } catch (e) {
          checks.postgresql = { status: 'error', message: e.message };
        }

        // Check agent job queue
        try {
          const jobQueue = require('./agents/jobQueue');
          const queueStatus = await jobQueue.getQueueStatus();
          checks.agentQueue = queueStatus;
        } catch (e) {
          checks.agentQueue = { status: 'error', message: e.message };
        }

        // Check SQLite database
        try {
          const stats = await intelligenceStore.getCalendarStats();
          checks.database = { 
            status: 'ok', 
            totalEvents: stats.totalEvents,
            lastFetched: stats.lastFetched
          };
        } catch (e) {
          checks.database = { status: 'error', message: e.message };
        }

        // Check calendar sync status
        try {
          const syncStatus = await getSyncStatus();
          const lastSync = syncStatus.syncStatus?.lastSync;
          const hoursSinceSync = lastSync ? 
            (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60) : null;
          
          checks.calendarSync = {
            status: syncStatus.syncInProgress ? 'syncing' : 
                    (hoursSinceSync && hoursSinceSync < 12) ? 'ok' : 'stale',
            lastSync,
            hoursSinceSync: hoursSinceSync ? Math.round(hoursSinceSync * 10) / 10 : null,
            eventsCached: syncStatus.databaseStats?.customerMeetings || 0
          };
        } catch (e) {
          checks.calendarSync = { status: 'error', message: e.message };
        }

        // Check Salesforce connection
        try {
          const { isSalesforceAvailable, getConnectionState } = require('./salesforce/connection');
          const connState = getConnectionState();
          checks.salesforce = {
            status: isSalesforceAvailable() ? 'ok' : (connState.degradedMode ? 'degraded' : 'error'),
            degradedMode: connState.degradedMode,
            circuitOpen: connState.circuitOpen,
            lastError: connState.lastError || null
          };
        } catch (e) {
          checks.salesforce = { status: 'error', message: e.message };
        }

        const overallStatus = Object.values(checks).every(c => c.status === 'ok') ? 'healthy' :
                              Object.values(checks).some(c => c.status === 'error') ? 'unhealthy' : 'degraded';

        res.json({
          status: overallStatus,
          checks,
          version: process.env.npm_package_version || '1.0.0',
          uptime: Math.round(process.uptime())
        });
      } catch (error) {
        logger.error('Health check failed:', error);
        res.status(500).json({ status: 'error', error: error.message });
      }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // OBSIDIAN SYNC ENDPOINTS
    // ═══════════════════════════════════════════════════════════════════════
    
    // Get Obsidian sync status
    this.expressApp.get('/api/obsidian/status', async (req, res) => {
      try {
        const obsidianSync = require('./services/obsidianSyncService');
        const intelligenceStore = require('./services/intelligenceStore');
        
        // Get recent synced notes
        const recentNotes = await intelligenceStore.getRecentObsidianNotes(10);
        
        // Get rate limit status from summarizer
        let summarizerStatus = { enabled: false };
        try {
          const summarizer = require('../obsidian-sync/lib/summarizer');
          summarizerStatus = {
            enabled: true,
            ...summarizer.getRateLimitStatus()
          };
        } catch (e) {
          // Summarizer not loaded
        }
        
        res.json({
          success: true,
          status: 'operational',
          recentNotes: recentNotes.map(n => ({
            account: n.account_name,
            title: n.note_title,
            date: n.note_date,
            syncedAt: n.synced_at,
            sentiment: n.sentiment
          })),
          summarizer: summarizerStatus,
          config: {
            syncDays: obsidianSync.CONFIG.SYNC_DAYS,
            maxNotesPerSync: obsidianSync.CONFIG.MAX_NOTES_PER_SYNC
          }
        });
      } catch (error) {
        logger.error('Error getting Obsidian status:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Get Obsidian notes for an account
    this.expressApp.get('/api/obsidian/notes/:accountId', async (req, res) => {
      try {
        const { accountId } = req.params;
        const intelligenceStore = require('./services/intelligenceStore');
        
        const notes = await intelligenceStore.getObsidianNotesByAccount(accountId);
        
        res.json({
          success: true,
          accountId,
          noteCount: notes.length,
          notes: notes.map(n => ({
            id: n.id,
            title: n.note_title,
            date: n.note_date,
            summary: n.summary,
            sentiment: n.sentiment,
            blEmail: n.bl_email,
            syncedAt: n.synced_at
          }))
        });
      } catch (error) {
        logger.error('Error getting Obsidian notes:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Discover Obsidian vaults on the system (local use only)
    this.expressApp.get('/api/obsidian/discover', async (req, res) => {
      try {
        const obsidianSync = require('./services/obsidianSyncService');
        const vaults = obsidianSync.discoverVaults();
        
        res.json({
          success: true,
          vaults,
          message: vaults.length > 0 
            ? `Found ${vaults.length} Obsidian vault(s)` 
            : 'No Obsidian vaults found in common locations'
        });
      } catch (error) {
        logger.error('Error discovering vaults:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Export all notes for admin vault sync
    // GET /api/obsidian/export?since=2024-01-01&format=markdown
    this.expressApp.get('/api/obsidian/export', async (req, res) => {
      try {
        const intelligenceStore = require('./services/intelligenceStore');
        const { since, format = 'json', accountId } = req.query;
        
        // Get all notes (optionally filtered by date and account)
        let notes = [];
        
        if (accountId) {
          notes = await intelligenceStore.getObsidianNotesByAccount(accountId);
        } else {
          notes = await intelligenceStore.getRecentObsidianNotes(500); // Get up to 500 notes
        }
        
        // Filter by date if specified
        if (since) {
          const sinceDate = new Date(since);
          notes = notes.filter(n => new Date(n.noteDate || n.created_at) >= sinceDate);
        }
        
        // Group by account
        const byAccount = {};
        for (const note of notes) {
          const acct = note.accountName || 'Unmatched';
          if (!byAccount[acct]) byAccount[acct] = [];
          byAccount[acct].push(note);
        }
        
        if (format === 'markdown') {
          // Return as downloadable markdown files in a zip-like structure
          let markdownContent = `# GTM Brain Notes Export\n\nExported: ${new Date().toISOString()}\nTotal Notes: ${notes.length}\n\n---\n\n`;
          
          for (const [acct, acctNotes] of Object.entries(byAccount)) {
            markdownContent += `## ${acct}\n\n`;
            for (const note of acctNotes) {
              markdownContent += `### ${note.noteTitle || 'Untitled'}\n`;
              markdownContent += `**Date:** ${note.noteDate || 'Unknown'}\n`;
              markdownContent += `**Synced by:** ${note.blEmail || 'Unknown'}\n`;
              markdownContent += `**Sentiment:** ${note.sentiment || 'Neutral'}\n\n`;
              markdownContent += `${note.summary || note.fullSummary || 'No content'}\n\n`;
              markdownContent += `---\n\n`;
            }
          }
          
          res.setHeader('Content-Type', 'text/markdown');
          res.setHeader('Content-Disposition', `attachment; filename=gtm-brain-notes-${new Date().toISOString().split('T')[0]}.md`);
          return res.send(markdownContent);
        }
        
        res.json({
          success: true,
          exportDate: new Date().toISOString(),
          totalNotes: notes.length,
          accountCount: Object.keys(byAccount).length,
          notes: format === 'full' ? notes : notes.map(n => ({
            accountId: n.accountId,
            accountName: n.accountName,
            noteTitle: n.noteTitle,
            noteDate: n.noteDate,
            summary: n.summary,
            sentiment: n.sentiment,
            blEmail: n.blEmail,
            syncedAt: n.created_at
          }))
        });
      } catch (error) {
        logger.error('Error exporting notes:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // BL Setup guide
    this.expressApp.get('/api/obsidian/setup-guide', async (req, res) => {
      const { email } = req.query;
      const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://gtm-wizard.onrender.com';
      
      const icsUrl = email 
        ? `${baseUrl}/api/calendar/${email}/feed.ics`
        : `${baseUrl}/api/calendar/YOUR_EMAIL@eudia.com/feed.ics`;
      
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Obsidian Setup Guide - GTM Brain</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #1f2937; line-height: 1.6; padding: 40px 20px; }
    .container { max-width: 700px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .subtitle { color: #6b7280; margin-bottom: 24px; }
    .section { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    .section h2 { font-size: 1.1rem; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .step { margin-left: 28px; margin-bottom: 8px; }
    .code { background: #f3f4f6; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 0.85rem; word-break: break-all; }
    .highlight { background: #fef3c7; padding: 2px 6px; border-radius: 2px; }
    .ics-url { background: #ecfdf5; border: 1px solid #10b981; padding: 12px; border-radius: 6px; margin: 12px 0; }
    .folder-structure { background: #f3f4f6; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 0.85rem; }
    .privacy { background: #fef2f2; border-left: 3px solid #ef4444; padding: 12px; margin: 12px 0; }
    .tip { background: #eff6ff; border-left: 3px solid #3b82f6; padding: 12px; margin: 12px 0; }
    ol { margin-left: 20px; }
    li { margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📓 Obsidian Setup Guide</h1>
    <p class="subtitle">Connect your Obsidian vault to GTM Brain for meeting note sync</p>
    
    <div class="section">
      <h2>📥 Step 1: Install Required Plugins</h2>
      <ol>
        <li>Open Obsidian → Settings (gear icon)</li>
        <li>Go to <strong>Community Plugins</strong> → Turn off Safe Mode if prompted</li>
        <li>Click <strong>Browse</strong> and install:
          <ul>
            <li><strong>Full Calendar</strong> - Display your calendar</li>
            <li><strong>Templater</strong> - For meeting note templates (optional)</li>
          </ul>
        </li>
        <li>Enable each plugin after installing</li>
      </ol>
    </div>
    
    <div class="section">
      <h2>📅 Step 2: Add Your Calendar</h2>
      <ol>
        <li>Go to Settings → Full Calendar</li>
        <li>Click <strong>Add Calendar</strong></li>
        <li>Choose <strong>Remote</strong> or <strong>ICS/Remote</strong></li>
        <li>Paste this URL:</li>
      </ol>
      <div class="ics-url">
        <code>${icsUrl}</code>
      </div>
      <ol start="5">
        <li>Name it "Work Calendar"</li>
        <li>Save and close settings</li>
      </ol>
      <p style="margin-top: 12px; font-size: 0.85rem; color: #6b7280;">Your calendar will now appear in Obsidian! Customer meetings are already filtered.</p>
    </div>
    
    <div class="section">
      <h2>📁 Step 3: Create Your Folder Structure</h2>
      <p style="margin-bottom: 12px;">Create these folders in your vault:</p>
      <div class="folder-structure">
Your Vault/
├── Meetings/           ← Meeting notes go here
│   └── _Inbox/         ← New notes land here
├── _Private/           ← Notes here will NOT sync
└── Templates/          ← Note templates (optional)
      </div>
      <p style="margin-top: 12px; font-size: 0.85rem;">Right-click in the file explorer → New Folder</p>
    </div>
    
    <div class="section">
      <h2>🎙️ Step 4: Recording Meetings</h2>
      <p><strong>Using Wispr Flow (Recommended):</strong></p>
      <ol>
        <li>Enable <strong>Hands-Free Mode</strong> in Wispr Flow settings</li>
        <li>Double-tap <span class="highlight">Fn key</span> to start/stop recording</li>
        <li>Wispr transcribes in real-time as you speak</li>
        <li>Paste transcription into your Obsidian note</li>
      </ol>
    </div>
    
    <div class="section">
      <h2>📝 Step 5: Creating Meeting Notes</h2>
      <p style="margin-bottom: 12px;">Name your notes with this pattern for automatic matching:</p>
      <div class="code">YYYY-MM-DD Account Name - Meeting Title.md</div>
      <p style="margin-top: 8px;">Examples:</p>
      <ul style="margin-left: 20px; margin-top: 8px;">
        <li><code>2026-01-22 AT&T - Discovery Call.md</code></li>
        <li><code>2026-01-22 Coherent - Demo Follow-up.md</code></li>
      </ul>
      
      <div class="tip">
        <strong>💡 Pro Tip:</strong> GTM Brain smart-matches notes to accounts using:
        <ul style="margin-top: 8px; margin-left: 20px;">
          <li>Account name in file name or folder</li>
          <li>Meeting time matching your calendar</li>
          <li>Email domains mentioned in notes</li>
        </ul>
      </div>
    </div>
    
    <div class="section">
      <h2>🔒 Privacy Controls</h2>
      <div class="privacy">
        <strong>These notes will NEVER sync to Salesforce:</strong>
        <ul style="margin-top: 8px; margin-left: 20px;">
          <li>Notes in the <code>_Private/</code> folder</li>
          <li>Notes with <code>sync: false</code> in frontmatter</li>
          <li>1:1s, internal meetings, interviews</li>
        </ul>
      </div>
      <p style="margin-top: 12px;">To exclude any note, add this at the top:</p>
      <div class="code">---<br>sync: false<br>---</div>
    </div>
    
    <div class="section">
      <h2>⚡ What Happens Next</h2>
      <ol>
        <li><strong>Daily Sync (6 PM):</strong> GTM Brain pulls new meeting notes</li>
        <li><strong>Smart Summary:</strong> AI generates key points, action items, sentiment</li>
        <li><strong>Salesforce Push:</strong> Summary added to Account's Customer Brain field</li>
        <li><strong>Meeting Prep:</strong> Context appears in GTM Brain for future meetings</li>
      </ol>
    </div>
    
    <p style="text-align: center; margin-top: 24px; color: #6b7280;">
      Questions? Reach out in <strong>#gtm-brain</strong> on Slack
    </p>
  </div>
</body>
</html>`;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    });

    // ═══════════════════════════════════════════════════════════════════════
    // SALESFORCE CONTACT + EVENT SYNC ENDPOINTS
    // ═══════════════════════════════════════════════════════════════════════
    
    // Sync a meeting to Salesforce (create contacts + event with notes)
    this.expressApp.post('/api/salesforce/sync-meeting', async (req, res) => {
      try {
        const contactSync = require('./services/salesforceContactSync');
        
        const {
          accountId,
          accountName = 'Unknown Account',
          attendees = [],
          subject = 'Meeting',
          dateTime = new Date().toISOString(),
          notes = '',
          durationMinutes = 60,
          dryRun = false
        } = req.body;
        
        if (!accountId) {
          return res.status(400).json({
            success: false,
            error: 'accountId is required - cannot create orphan contacts'
          });
        }
        
        const result = await contactSync.syncMeetingToSalesforce({
          accountId,
          accountName,
          attendees,
          subject,
          dateTime,
          notes,
          durationMinutes,
          dryRun
        });
        
        res.json(result);
        
      } catch (error) {
        logger.error('Error syncing meeting to Salesforce:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Find or create a single contact
    this.expressApp.post('/api/salesforce/find-or-create-contact', async (req, res) => {
      try {
        const contactSync = require('./services/salesforceContactSync');
        
        const { email, name, firstName, lastName, title, accountId } = req.body;
        
        if (!email) {
          return res.status(400).json({ success: false, error: 'email is required' });
        }
        
        const result = await contactSync.findOrCreateContact({
          email,
          name,
          firstName,
          lastName,
          title,
          accountId
        });
        
        res.json(result);
        
      } catch (error) {
        logger.error('Error finding/creating contact:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Debug endpoint: Test Clay lookup + domain fallback for an email
    this.expressApp.get('/api/salesforce/debug-contact/:email', async (req, res) => {
      try {
        const contactSync = require('./services/salesforceContactSync');
        const email = decodeURIComponent(req.params.email);
        
        const results = {
          email,
          clayData: await contactSync.getClayEnrichmentData(email),
          domainLookup: await contactSync.findAccountByDomain(email),
          existingContact: await contactSync.findContactByEmail(email)
        };
        
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // ═══════════════════════════════════════════════════════════════════════
    // OBSIDIAN SYNC ENDPOINTS - For BL note sync from local vaults
    // ═══════════════════════════════════════════════════════════════════════
    
    // Sync notes from BL's local Obsidian vault to GTM Brain
    // Called by Sync-Notes.command script
    this.expressApp.post('/api/obsidian/sync-notes', async (req, res) => {
      try {
        const intelligenceStore = require('./services/intelligenceStore');
        const salesforceService = require('./services/salesforceService');
        
        const {
          blEmail,
          accountName,
          noteTitle,
          noteDate,
          content,
          notePath
        } = req.body;
        
        if (!blEmail || !content) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: blEmail and content are required'
          });
        }
        
        // Try to find account in Salesforce by name
        let accountId = null;
        let matchedAccountName = accountName || 'Unknown';
        
        if (accountName && accountName !== '_Inbox' && accountName !== 'Templates') {
          try {
            const results = await salesforceService.searchAccounts(accountName, 3);
            if (results && results.length > 0) {
              accountId = results[0].Id;
              matchedAccountName = results[0].Name;
              logger.info(`📁 Matched folder "${accountName}" → Account: ${matchedAccountName} (${accountId})`);
            }
          } catch (e) {
            logger.warn(`Could not match account "${accountName}": ${e.message}`);
          }
        }
        
        // Generate summary using Claude (if available)
        let summary = content.substring(0, 500);
        let sentiment = 'Neutral';
        
        try {
          const Anthropic = require('@anthropic-ai/sdk');
          if (process.env.ANTHROPIC_API_KEY) {
            const anthropic = new Anthropic();
            const response = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 500,
              messages: [{
                role: 'user',
                content: `Summarize this meeting note in 2-3 sentences. Also classify sentiment as Positive, Neutral, or Negative.

Meeting Note:
${content}

Respond in this exact format:
SUMMARY: [your summary]
SENTIMENT: [Positive/Neutral/Negative]`
              }]
            });
            
            const responseText = response.content[0].text;
            const summaryMatch = responseText.match(/SUMMARY:\s*(.+?)(?=SENTIMENT:|$)/s);
            const sentimentMatch = responseText.match(/SENTIMENT:\s*(Positive|Neutral|Negative)/i);
            
            if (summaryMatch) summary = summaryMatch[1].trim();
            if (sentimentMatch) sentiment = sentimentMatch[1];
          }
        } catch (e) {
          logger.warn(`AI summary failed, using excerpt: ${e.message}`);
        }
        
        // Store in GTM Brain database
        const result = await intelligenceStore.storeObsidianNote({
          accountId: accountId || 'unmatched',
          accountName: matchedAccountName,
          blEmail,
          noteTitle: noteTitle || `Note from ${noteDate || 'today'}`,
          noteDate: noteDate || new Date().toISOString().split('T')[0],
          notePath: notePath || `Meetings/${accountName}/${noteTitle}.md`,
          summary,
          fullSummary: content,
          sentiment,
          matchMethod: accountId ? 'folder_match' : 'unmatched',
          matchConfidence: accountId ? 0.9 : 0
        });
        
        logger.info(`📝 Note synced from ${blEmail}: ${noteTitle} → ${matchedAccountName}`);
        
        res.json({
          success: true,
          noteId: result.id,
          accountId,
          accountName: matchedAccountName,
          summary: summary.substring(0, 100) + '...'
        });
        
      } catch (error) {
        logger.error('Error syncing note:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // ═══════════════════════════════════════════════════════════════════════
    // TEST ENDPOINTS - For validating Obsidian sync pipeline
    // ═══════════════════════════════════════════════════════════════════════
    
    // Manually push a test note to the database (bypasses file reading)
    // Now also supports syncing to Salesforce (contacts + event)
    this.expressApp.post('/api/obsidian/test-push', async (req, res) => {
      try {
        const intelligenceStore = require('./services/intelligenceStore');
        const contactSync = require('./services/salesforceContactSync');
        
        const {
          accountId = '001Hp00003lhyCxIAI',  // Eudia Testing default
          accountName = 'Eudia Testing',
          noteTitle = 'Test Meeting Note',
          noteDate = new Date().toISOString().split('T')[0],
          summary = 'Test meeting note pushed via API.',
          sentiment = 'Positive',
          blEmail = 'keigan@eudia.com',
          // NEW: Optional Salesforce sync
          syncToSalesforce = false,
          attendees = [],
          durationMinutes = 60
        } = req.body;
        
        // Store in GTM Brain database
        const result = await intelligenceStore.storeObsidianNote({
          accountId,
          accountName,
          blEmail,
          noteTitle,
          noteDate,
          notePath: `Meetings/${accountName}/${noteDate} ${noteTitle}.md`,
          summary,
          fullSummary: summary,
          sentiment,
          matchMethod: 'manual_test',
          matchConfidence: 1.0
        });
        
        logger.info(`📝 Test note pushed: ${noteTitle} → ${accountName}`);
        
        // Optional: Sync to Salesforce (create contacts + event)
        let salesforceSync = null;
        if (syncToSalesforce) {
          logger.info(`📤 Syncing to Salesforce: ${noteTitle}`);
          
          salesforceSync = await contactSync.syncMeetingToSalesforce({
            accountId,
            accountName,
            attendees,
            subject: noteTitle,
            dateTime: `${noteDate}T10:00:00Z`,
            notes: summary,
            durationMinutes
          });
        }
        
        res.json({
          success: true,
          message: 'Test note stored successfully' + (syncToSalesforce ? ' + synced to Salesforce' : ''),
          noteId: result.id,
          accountId,
          accountName,
          noteTitle,
          noteDate,
          salesforceSync,
          nextStep: `Visit /meetings to see this in Meeting Prep for ${accountName}`
        });
        
      } catch (error) {
        logger.error('Error pushing test note:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Create a mock meeting for testing (appears in Meeting Prep)
    this.expressApp.post('/api/test/mock-meeting', async (req, res) => {
      try {
        const intelligenceStore = require('./services/intelligenceStore');
        
        const {
          accountId = '001Hp00003lhyCxIAI',
          accountName = 'Eudia Testing',
          meetingTitle = 'Test Meeting - Obsidian Sync Validation',
          meetingDate = null, // Will be set to today at 2pm
          externalAttendees = [{ 
            name: 'John Test', 
            email: 'john.test@eudia-testing.com',
            isExternal: true
          }],
          internalAttendees = [{ 
            name: 'Keigan Pesenti', 
            email: 'keigan.pesenti@eudia.com',
            isExternal: false 
          }]
        } = req.body;
        
        // Generate a unique meeting ID
        const meetingId = `test-${Date.now()}`;
        
        // Set meeting time to today at 2pm if not provided
        let finalMeetingDate = meetingDate;
        if (!finalMeetingDate) {
          const today = new Date();
          today.setHours(14, 0, 0, 0); // 2pm today
          finalMeetingDate = today.toISOString();
        }
        
        // Combine attendees for storage but keep external/internal structure
        const allAttendees = [
          ...externalAttendees.map(a => ({ ...a, isExternal: true })),
          ...internalAttendees.map(a => ({ ...a, isExternal: false }))
        ];
        
        await intelligenceStore.saveMeetingPrep({
          meetingId,
          accountId,
          accountName,
          meetingTitle,
          meetingDate: finalMeetingDate,
          attendees: allAttendees, // Not stringified - saveMeetingPrep handles that
          source: 'manual_test',
          isFirstMeeting: false
        });
        
        logger.info(`📅 Mock meeting created: ${meetingTitle} with ${externalAttendees.length} external attendees`);
        
        res.json({
          success: true,
          message: 'Mock meeting created with external attendees',
          meetingId,
          accountId,
          accountName,
          meetingTitle,
          meetingDate: finalMeetingDate,
          externalAttendees,
          internalAttendees,
          nextStep: 'Refresh /gtm > Meeting Prep tab to see this meeting tile in Thursday column'
        });
        
      } catch (error) {
        logger.error('Error creating mock meeting:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Get all Obsidian notes for an account (for verification)
    this.expressApp.get('/api/test/obsidian-notes/:accountId', async (req, res) => {
      try {
        const { accountId } = req.params;
        const intelligenceStore = require('./services/intelligenceStore');
        
        const notes = await intelligenceStore.getObsidianNotesByAccount(accountId);
        
        res.json({
          success: true,
          accountId,
          noteCount: notes.length,
          notes
        });
        
      } catch (error) {
        logger.error('Error fetching test notes:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // ============================================================
    // CONTEXT SUMMARIZER TEST ENDPOINTS
    // ============================================================
    
    // Get rate limit status for context summarizer (MUST be before :accountId route)
    this.expressApp.get('/api/test/context-summary/status', async (req, res) => {
      try {
        const contextSummarizer = require('./services/contextSummarizer');
        const intelligenceStore = require('./services/intelligenceStore');
        
        const rateLimits = contextSummarizer.getRateLimitStatus();
        const allSummaries = await intelligenceStore.getAllContextSummaries();
        
        res.json({
          success: true,
          rateLimits,
          cachedSummaries: allSummaries.length,
          summaries: allSummaries.slice(0, 10),  // Last 10
          config: {
            enabled: contextSummarizer.CONFIG.enabled,
            dailyLimit: contextSummarizer.CONFIG.dailyLimitTotal,
            cacheTTLHours: contextSummarizer.CONFIG.cacheTTLHours
          }
        });
        
      } catch (error) {
        logger.error('Error getting context summary status:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Generate or get AI summary for an account's context
    this.expressApp.get('/api/test/context-summary/:accountId', async (req, res) => {
      try {
        const { accountId } = req.params;
        const { force } = req.query;  // ?force=true to bypass cache
        
        const contextSummarizer = require('./services/contextSummarizer');
        const meetingContextService = require('./services/meetingContextService');
        const intelligenceStore = require('./services/intelligenceStore');
        
        // Get all context sources
        const context = await meetingContextService.generateMeetingContext(accountId);
        
        if (!context) {
          return res.status(404).json({
            success: false,
            error: 'Account not found or no context available'
          });
        }
        
        // Build sources object for summarizer
        const sources = {
          customerBrain: context.salesforce?.customerBrain || '',
          obsidianNotes: context.obsidianNotes || [],
          slackIntel: context.slackIntel || [],
          priorMeetings: context.priorMeetings || []
        };
        
        // Get or generate summary
        const accountName = context.salesforce?.name || 'Unknown Account';
        const result = force === 'true'
          ? await contextSummarizer.refreshSummary(accountId, accountName, sources)
          : await contextSummarizer.getOrGenerateSummary(accountId, accountName, sources);
        
        res.json({
          success: true,
          accountId,
          accountName,
          ...result,
          rateLimitStatus: contextSummarizer.getRateLimitStatus()
        });
        
      } catch (error) {
        logger.error('Error generating context summary:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Trigger Clay enrichment for meeting attendees
    this.expressApp.post('/api/clay/enrich-attendees', async (req, res) => {
      try {
        const { attendees } = req.body;
        
        if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
          return res.status(400).json({ 
            success: false, 
            error: 'attendees array required' 
          });
        }

        const { enrichAttendeesViaWebhook } = require('./services/clayEnrichment');
        const result = await enrichAttendeesViaWebhook(attendees);
        
        res.json({ 
          success: true, 
          ...result 
        });
      } catch (error) {
        logger.error('Error enriching attendees via Clay:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get enrichment data for attendees - checks local store first, then Clay API
    this.expressApp.post('/api/clay/get-enrichment', async (req, res) => {
      try {
        const { emails } = req.body;
        
        if (!emails || !Array.isArray(emails) || emails.length === 0) {
          return res.status(400).json({ 
            success: false, 
            error: 'emails array required' 
          });
        }

        logger.info(`📤 [Get Enrichment] Fetching enrichment for ${emails.length} emails: ${emails.slice(0, 5).join(', ')}${emails.length > 5 ? '...' : ''}`);

        const { getEnrichedAttendees } = require('./services/clayEnrichment');
        const enrichments = await getEnrichedAttendees(emails);
        
        // Log how many have data
        const withData = Object.values(enrichments).filter(e => e.success).length;
        logger.info(`📤 [Get Enrichment] Result: ${withData}/${emails.length} have enrichment data`);
        
        res.json({ 
          success: true, 
          enrichments 
        });
      } catch (error) {
        logger.error('Error getting enrichment data:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Fallback enrichment using Claude API when Clay data is insufficient
    this.expressApp.post('/api/attendee/fallback-enrich', async (req, res) => {
      try {
        const { attendees } = req.body;
        
        if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
          return res.status(400).json({ 
            success: false, 
            error: 'attendees array required' 
          });
        }

        logger.info(`[Fallback Enrich API] Processing ${attendees.length} attendees`);

        const { enrichAttendeesBatch, getRateLimitStatus } = require('./services/attendeeFallbackEnrichment');
        
        // Log rate limit status
        const rateLimits = getRateLimitStatus();
        logger.info(`[Fallback Enrich API] Rate limits: ${rateLimits.hourly.remaining} hourly, ${rateLimits.daily.remaining} daily remaining`);
        
        const enrichedAttendees = await enrichAttendeesBatch(attendees);
        
        // Count results by source
        const sources = {};
        enrichedAttendees.forEach(a => {
          const src = a.source || a.fallbackSkipped || 'unknown';
          sources[src] = (sources[src] || 0) + 1;
        });
        
        logger.info(`[Fallback Enrich API] Complete. Sources: ${JSON.stringify(sources)}`);
        
        res.json({ 
          success: true, 
          enrichedAttendees,
          rateLimits,
          sources
        });
      } catch (error) {
        logger.error('[Fallback Enrich API] Error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Get fallback enrichment rate limit status
    this.expressApp.get('/api/attendee/fallback-status', async (req, res) => {
      try {
        const { getRateLimitStatus, CONFIG } = require('./services/attendeeFallbackEnrichment');
        const status = getRateLimitStatus();
        
        res.json({
          success: true,
          enabled: CONFIG.enabled,
          ...status
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Debug endpoint: Check SQLite directly for enrichment count
    this.expressApp.get('/api/clay/debug-db', async (req, res) => {
      try {
        const intelligenceStore = require('./services/intelligenceStore');
        
        // Get count from SQLite
        const testEmails = [
          'jgenua@massmutual.com',
          'takinbajo@massmutual.com'
        ];
        
        const results = {};
        for (const email of testEmails) {
          const data = await intelligenceStore.getAttendeeEnrichment(email);
          results[email] = data ? { found: true, title: data.title, hasLinkedin: !!data.linkedinUrl, hasSummary: !!data.summary } : { found: false };
        }
        
        res.json({
          success: true,
          message: 'Direct SQLite check',
          results
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // Clay configuration helper - shows exact JSON body to paste
    this.expressApp.get('/api/clay/config-helper', async (req, res) => {
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Clay HTTP API Configuration</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; background: #1a1a2e; color: #eee; }
    h1 { color: #4ade80; }
    h2 { color: #60a5fa; margin-top: 30px; }
    .config-box { background: #16213e; border: 1px solid #4ade80; border-radius: 8px; padding: 20px; margin: 20px 0; }
    pre { background: #0f0f23; padding: 15px; border-radius: 6px; overflow-x: auto; color: #4ade80; }
    .step { background: #1e3a5f; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #60a5fa; }
    .step-num { font-weight: bold; color: #4ade80; }
    code { background: #0f0f23; padding: 2px 6px; border-radius: 3px; color: #f472b6; }
    .warning { background: #7c2d12; border: 1px solid #ea580c; padding: 15px; border-radius: 6px; margin: 20px 0; }
    .success { background: #14532d; border: 1px solid #22c55e; padding: 15px; border-radius: 6px; margin: 20px 0; }
    button { background: #4ade80; color: #1a1a2e; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; }
    button:hover { background: #22c55e; }
  </style>
</head>
<body>
  <h1>🔧 Clay HTTP API Configuration</h1>
  
  <div class="warning">
    <strong>⚠️ Important:</strong> SQLite data is wiped on every Render deploy. After configuring Clay, you must run the HTTP API column to repopulate data.
  </div>
  
  <h2>Endpoint URL</h2>
  <div class="config-box">
    <pre>https://gtm-wizard.onrender.com/api/clay/store-enrichment</pre>
  </div>
  
  <h2>Method</h2>
  <div class="config-box">
    <pre>POST</pre>
  </div>
  
  <h2>Headers</h2>
  <div class="config-box">
    <pre>Content-Type: application/json</pre>
  </div>
  
  <h2>Body Configuration (Step by Step)</h2>
  <div class="config-box">
    <div class="step">
      <span class="step-num">Step 1:</span> Click in the Body field and type: <code>{</code>
    </div>
    <div class="step">
      <span class="step-num">Step 2:</span> Type <code>"email": </code> then press <code>/</code> and select <strong>Email</strong> from dropdown
    </div>
    <div class="step">
      <span class="step-num">Step 3:</span> Type <code>, "full_name": </code> then press <code>/</code> and select <strong>Full Name</strong>
    </div>
    <div class="step">
      <span class="step-num">Step 4:</span> Type <code>, "title": </code> then press <code>/</code> and select <strong>Title</strong>
    </div>
    <div class="step">
      <span class="step-num">Step 5:</span> Type <code>, "linkedin_url": </code> then press <code>/</code> and select <strong>Linkedin Url</strong>
    </div>
    <div class="step">
      <span class="step-num">Step 6:</span> Type <code>, "company": </code> then press <code>/</code> and select <strong>Company</strong>
    </div>
    <div class="step">
      <span class="step-num">Step 7:</span> Type <code>, "attendee_summary": </code> then press <code>/</code> and select <strong>Sanitized Summary</strong>
    </div>
    <div class="step">
      <span class="step-num">Step 8:</span> Type <code>}</code> to close the JSON object
    </div>
  </div>
  
  <h2>Expected Result</h2>
  <div class="config-box">
    <p>The body should look like this (with Clay's internal column references):</p>
    <pre>{
  "email": Clay.formatForJSON({{Email}}),
  "full_name": Clay.formatForJSON({{Full Name}}),
  "title": Clay.formatForJSON({{Title}}),
  "linkedin_url": Clay.formatForJSON({{Linkedin Url}}),
  "company": Clay.formatForJSON({{Company}}),
  "attendee_summary": Clay.formatForJSON({{Sanitized Summary}})
}</pre>
  </div>
  
  <h2>After Configuration</h2>
  <div class="success">
    <strong>✅ Click "Save and run 799 rows"</strong> to send all enrichment data to GTM Brain.
  </div>
  
  <h2>Verify Data</h2>
  <p>After running, check these endpoints:</p>
  <ul>
    <li><a href="/api/clay/debug-db" style="color: #60a5fa;">/api/clay/debug-db</a> - Should show "found": true</li>
    <li><a href="/api/clay/test?email=jgenua@massmutual.com" style="color: #60a5fa;">/api/clay/test?email=jgenua@massmutual.com</a> - Should show enrichment data</li>
  </ul>
  
  <h2>For Persistent Storage</h2>
  <div class="warning">
    <p>To prevent data loss on deploys, add a <strong>Render Disk</strong>:</p>
    <ol>
      <li>Go to Render Dashboard → Your Service → Disks</li>
      <li>Add a disk with mount path: <code>/data</code></li>
      <li>Add environment variable: <code>INTEL_DB_PATH=/data/intelligence.db</code></li>
      <li>Redeploy</li>
    </ol>
  </div>
</body>
</html>
      `;
      res.type('html').send(html);
    });
    
    // Test Clay API connection - for debugging
    this.expressApp.get('/api/clay/test', async (req, res) => {
      try {
        const { clayEnrichment } = require('./services/clayEnrichment');
        
        const config = {
          apiKeyConfigured: !!process.env.CLAY_API_KEY,
          apiKeyPrefix: process.env.CLAY_API_KEY ? process.env.CLAY_API_KEY.substring(0, 8) + '...' : 'NOT SET',
          tableIdConfigured: !!process.env.CLAY_ATTENDEE_TABLE_ID,
          tableId: process.env.CLAY_ATTENDEE_TABLE_ID || 'NOT SET',
          webhookUrlConfigured: !!process.env.CLAY_WEBHOOK_URL
        };
        
        // Try to fetch one row to test connectivity
        let testResult = null;
        if (config.apiKeyConfigured && config.tableIdConfigured) {
          try {
            const testEmail = req.query.email || 'jgenua@massmutual.com';
            testResult = await clayEnrichment.getEnrichedAttendee(testEmail);
          } catch (testErr) {
            testResult = { error: testErr.message };
          }
        }
        
        res.json({
          success: true,
          config,
          testResult,
          cacheStats: clayEnrichment.getCacheStats()
        });
      } catch (error) {
        logger.error('Error testing Clay connection:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Store enrichment data (for Clay callback or manual entry)
    // Accepts: { attendees: [...] } OR single object { email, name, ... } OR array [{ email, ... }]
    this.expressApp.post('/api/clay/store-enrichment', async (req, res) => {
      try {
        // DIAGNOSTIC: Log the full raw payload from Clay (verbose mode for debugging)
        logger.info(`📥 [Clay Store] === INCOMING REQUEST ===`);
        logger.info(`📥 [Clay Store] Request body type: ${typeof req.body}, isArray: ${Array.isArray(req.body)}`);
        logger.info(`📥 [Clay Store] Raw request body keys: ${Object.keys(req.body).join(', ')}`);
        logger.info(`📥 [Clay Store] FULL PAYLOAD: ${JSON.stringify(req.body, null, 2).substring(0, 2000)}`);
        
        let attendees = req.body.attendees;
        
        // Handle single attendee object (Clay HTTP API sends this way)
        if (!attendees && req.body.email) {
          logger.info('📥 Received single attendee from Clay');
          attendees = [req.body];
        }
        
        // Handle array directly at root level
        if (!attendees && Array.isArray(req.body)) {
          attendees = req.body;
        }
        
        if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
          logger.warn('⚠️ Invalid request body:', JSON.stringify(req.body).substring(0, 200));
          return res.status(400).json({ 
            success: false, 
            error: 'attendees array or single attendee object with email required' 
          });
        }

        const intelligenceStore = require('./services/intelligenceStore');
        const results = [];
        
        for (const attendee of attendees) {
          // DIAGNOSTIC: Log all keys for this attendee
          logger.info(`📋 [Clay Store] Attendee keys: ${Object.keys(attendee).join(', ')}`);
          
          if (!attendee.email) {
            logger.warn('⚠️ Attendee missing email, skipping');
            continue;
          }
          
          // Handle various Clay column name formats - check ALL variations
          // The key might have different casing or formatting from Clay
          // IMPORTANT: Include "Sanitized Summary" and "safeSummary" - these are the actual column names used
          const summaryKeys = [
            'attendee_summary', 'Sanitized Summary', 'safeSummary', 'sanitizedSummary',
            'Sanitized_Summary', 'sanitized_summary',
            'summary', 'Summary', 'Attendee Summary (2)', 'Attendee Summary (2.0)',
            'attendee_summary_2', 'Attendee Summary', 'bio', 'Bio', 'attendeeSummary',
            'Attendee_Summary_2', 'attendee summary 2'
          ];
          
          let summary = null;
          for (const key of summaryKeys) {
            if (attendee[key] && typeof attendee[key] === 'string' && attendee[key].trim().length > 0) {
              summary = attendee[key];
              logger.info(`✅ Found summary in key: "${key}" = ${summary.substring(0, 60)}...`);
              break;
            }
          }
          
          // If no summary found in known keys, search all keys for ones containing "summary"
          if (!summary) {
            for (const key of Object.keys(attendee)) {
              if (key.toLowerCase().includes('summary') && attendee[key] && attendee[key].trim?.().length > 0) {
                summary = attendee[key];
                logger.info(`✅ Found summary in dynamic key: "${key}"`);
                break;
              }
            }
          }
          
          const linkedinUrl = attendee.linkedinUrl 
            || attendee.linkedin_url 
            || attendee['LinkedIn URL']
            || attendee['Linkedin Url']
            || attendee.linkedin
            || attendee['LinkedIn']
            || null;
          
          const title = attendee.title 
            || attendee.job_title 
            || attendee['Title'] 
            || attendee['Job Title']
            || null;
          
          let name = attendee.name 
            || attendee.full_name 
            || attendee['Full Name']
            || attendee['full_name']
            || null;
          
          // === NAME CLEANUP ===
          if (name) {
            // CLEANUP 1: Strip orphan numbers between name and content
            // Catches: "Padraic Carey 3 Usage limited" or "Ryan Lester 02 0 3 Managing Director"
            const originalName = name;
            name = name.replace(/\s+[\d\s]+(?=[A-Z]|$)/g, ' ').trim();
            // Also strip trailing numbers: "Claire Davern 13" -> "Claire Davern"
            name = name.replace(/\s+\d+\s*$/, '').trim();
            if (name !== originalName) {
              logger.info(`🧹 Cleaned name numbers: "${originalName}" → "${name}"`);
            }
            
            // CLEANUP 2: Flip "Last, First" format to "First Last"
            // Catches: "Carey, Padraic" or "AbdiShire, Bilan"
            if (name.includes(',')) {
              const parts = name.split(',').map(p => p.trim());
              // Only flip if exactly 2 parts and both look like name parts (not titles with commas)
              if (parts.length === 2 && 
                  parts[0].length > 1 && parts[0].length < 25 &&
                  parts[1].length > 1 && parts[1].length < 25 &&
                  !parts[0].toLowerCase().includes('inc') &&
                  !parts[0].toLowerCase().includes('llc')) {
                const flippedName = parts[1] + ' ' + parts[0];
                logger.info(`🧹 Flipped name format: "${name}" → "${flippedName}"`);
                name = flippedName;
              }
            }
            
            // CLEANUP 3: Remove any trailing garbage like "e2", "a0" character codes
            name = name.replace(/\s+[a-z]\d+\s*$/i, '').trim();
            name = name.replace(/\s+[a-z]0['']s?\s*$/i, '').trim();
          }
          
          const company = attendee.company 
            || attendee.company_name 
            || attendee['Company']
            || null;
          
          // DE-DUPLICATE: Remove repeated name mentions from summary
          // Clay sometimes merges two AI summaries that both start with the person's name
          let cleanedSummary = summary;
          if (cleanedSummary && name) {
            const firstName = (name || '').split(' ')[0];
            const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // STEP 1: Remove sentences that start with the person's name after the first occurrence
            // This catches: "Patrick Wilkinson - SVP at Ntrs." followed by "Patrick Wilkinson - SVP at Northern Trust..."
            const sentences = cleanedSummary.split(/(?<=[.!?])\s+/);
            let foundNameSentence = false;
            const filteredSentences = sentences.filter(s => {
              const startsWithName = s.trim().toLowerCase().startsWith(name.toLowerCase()) ||
                                     s.trim().toLowerCase().startsWith(firstName.toLowerCase() + ' ');
              if (startsWithName) {
                if (foundNameSentence) {
                  logger.info(`🧹 Removing duplicate name-starting sentence: "${s.substring(0, 60)}..."`);
                  return false; // Skip subsequent sentences that start with the name
                }
                foundNameSentence = true;
              }
              return true;
            });
            
            if (filteredSentences.length < sentences.length) {
              cleanedSummary = filteredSentences.join(' ');
              logger.info(`🧹 De-duplicated summary: removed ${sentences.length - filteredSentences.length} name-duplicate sentence(s)`);
            }
            
            // STEP 2: Also remove exact duplicate sentences (first 50 chars match)
            const finalSentences = cleanedSummary.split(/(?<=[.!?])\s+/);
            const seen = new Set();
            const uniqueSentences = finalSentences.filter(s => {
              const key = s.substring(0, 50).toLowerCase().trim();
              if (seen.has(key)) {
                logger.debug(`🧹 Removing exact duplicate sentence: "${key.substring(0, 30)}..."`);
                return false;
              }
              seen.add(key);
              return true;
            });
            
            if (uniqueSentences.length < finalSentences.length) {
              cleanedSummary = uniqueSentences.join(' ');
              logger.info(`🧹 Removed ${finalSentences.length - uniqueSentences.length} exact duplicate sentence(s)`);
            }
            
            // STEP 3: Remove quoted duplicates like "Michelle - Title." followed by '"Michelle - Title."'
            cleanedSummary = cleanedSummary.replace(/"([^"]+)"\s*\1/g, '$1');
            cleanedSummary = cleanedSummary.replace(/([^"]+)"\s*\1"/g, '$1');
          }
          
          // === SUMMARY VALIDATION: Null out "no data" responses ===
          // These indicate Clay/LinkedIn couldn't find real profile data
          if (cleanedSummary) {
            const noDataPatterns = [
              'profile information limited',
              'unable to verify',
              'usage limited',
              'no public linkedin',
              'could not find',
              'no information available',
              'information not available',
              'details not available',
              'unable to locate',
              'no profile found',
              'linkedin data unavailable'
            ];
            
            const summaryLower = cleanedSummary.toLowerCase();
            const isNoData = noDataPatterns.some(p => summaryLower.includes(p));
            
            // Also check if summary is too short to be useful (< 30 chars of actual content)
            const isTooShort = cleanedSummary.trim().length < 30;
            
            if (isNoData || isTooShort) {
              logger.info(`🚫 Nulling invalid summary for ${attendee.email}: "${cleanedSummary.substring(0, 50)}..."`);
              cleanedSummary = null;
            }
          }
          
          logger.info(`💾 Saving enrichment: ${attendee.email} - Title: ${title ? 'YES' : 'NO'}, Summary: ${cleanedSummary ? 'YES (' + cleanedSummary.length + ' chars)' : 'NO'}, LinkedIn: ${linkedinUrl ? 'YES' : 'NO'}`);
          
          await intelligenceStore.saveAttendeeEnrichment({
            email: attendee.email,
            name,
            title,
            linkedinUrl,
            company,
            summary: cleanedSummary,
            source: attendee.source || 'clay'
          });
          results.push({ email: attendee.email, saved: true, hasSummary: !!summary });
        }
        
        logger.info(`✅ Stored enrichment for ${results.length} attendees`);
        
        res.json({ 
          success: true, 
          saved: results.length,
          results 
        });
      } catch (error) {
        logger.error('Error storing enrichment data:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    logger.info('✅ Express server configured');
  }

  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Start Slack Bolt app with retry logic for socket mode connection
      const maxRetries = 5;
      let connected = false;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          logger.info(`🔌 Attempting Slack connection (attempt ${attempt}/${maxRetries})...`);
          
          // Add delay before first attempt to let services stabilize
          if (attempt === 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          await this.app.start();
          connected = true;
          logger.info('⚡️ GTM Brain Slack Bot is running!');
          break;
        } catch (socketError) {
          const errorMsg = socketError.message || String(socketError);
          logger.warn(`⚠️ Slack connection attempt ${attempt} failed: ${errorMsg}`);
          
          // Check if it's a recoverable error
          const isRecoverable = errorMsg.includes('408') || 
                                errorMsg.includes('disconnect') || 
                                errorMsg.includes('timeout') ||
                                errorMsg.includes('ECONNRESET');
          
          if (attempt < maxRetries && isRecoverable) {
            const waitTime = attempt * 3000; // Longer backoff: 3s, 6s, 9s, 12s
            logger.info(`⏳ Waiting ${waitTime/1000}s before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else if (!isRecoverable) {
            throw socketError; // Non-recoverable error, fail immediately
          }
        }
      }
      
      if (!connected) {
        logger.error('❌ Failed to connect to Slack after all retries');
        throw new Error('Failed to establish Slack connection');
      }

      // Start Express server
      const port = process.env.PORT || 3000;
      this.expressServer = this.expressApp.listen(port, () => {
        logger.info(`🌐 Express server running on port ${port}`);
      });

      // Start scheduled jobs
      startScheduledJobs(this.app);
      logger.info('📅 Scheduled jobs started');

      // Start weekly report scheduler
      scheduleWeeklyReport();
      logger.info('📧 Weekly report scheduler started');

      // Subscribe to Closed Won Platform Events
      if (process.env.CLOSED_WON_ALERTS_ENABLED === 'true') {
        const { subscribeToClosedWonEvents } = require('./services/closedWonAlerts');
        await subscribeToClosedWonEvents(this.app);
        logger.info('🎉 Closed Won alerts subscription started');
      }

      // Subscribe to CS Staffing Platform Events (Stage 4/5)
      if (process.env.CS_STAFFING_ALERTS_ENABLED === 'true') {
        const { subscribeToCSStaffingEvents } = require('./services/csStaffingAlerts');
        await subscribeToCSStaffingEvents(this.app);
        logger.info('👥 CS Staffing alerts subscription started');
      }

      // Initialize Channel Intelligence Scraper
      if (process.env.INTEL_SCRAPER_ENABLED === 'true') {
        await channelIntelligence.initialize(this.app.client);
        channelMonitor.registerChannelMonitorHandlers(this.app);
        intelligenceDigest.initialize(this.app.client);
        intelligenceDigest.registerDigestHandlers(this.app);
        registerIntelActionHandlers(this.app);
        logger.info('🧠 Channel Intelligence Scraper initialized');
      }

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start GTM Brain:', error);
      process.exit(1);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSCRIPTION HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch account context from Salesforce for meeting prep
   * @param {string} accountId - Salesforce Account ID
   * @returns {Promise<object|null>}
   */
  async fetchAccountContext(accountId) {
    try {
      const { query } = require('./salesforce/queries');

      // Fetch account details
      const accountQuery = `
        SELECT Id, Name, Owner.Name, Customer_Brain__c
        FROM Account
        WHERE Id = '${accountId}'
        LIMIT 1
      `;
      const accountResult = await query(accountQuery);
      
      if (!accountResult.records || accountResult.records.length === 0) {
        return null;
      }

      const account = accountResult.records[0];

      // Fetch open opportunities
      const oppQuery = `
        SELECT Id, Name, StageName, ACV__c, Target_LOI_Date__c
        FROM Opportunity
        WHERE AccountId = '${accountId}'
        AND IsClosed = false
        ORDER BY ACV__c DESC NULLS LAST
        LIMIT 5
      `;
      const oppResult = await query(oppQuery);
      const opportunities = (oppResult.records || []).map(o => ({
        id: o.Id,
        name: o.Name,
        stage: o.StageName,
        acv: o.ACV__c,
        targetSignDate: o.Target_LOI_Date__c
      }));

      // Fetch key contacts
      const contactQuery = `
        SELECT Id, Name, Title, Email
        FROM Contact
        WHERE AccountId = '${accountId}'
        ORDER BY CreatedDate DESC
        LIMIT 10
      `;
      const contactResult = await query(contactQuery);
      const contacts = (contactResult.records || []).map(c => ({
        id: c.Id,
        name: c.Name,
        title: c.Title,
        email: c.Email
      }));

      // Fetch last meeting (Event)
      const eventQuery = `
        SELECT Id, Subject, ActivityDate
        FROM Event
        WHERE AccountId = '${accountId}'
        AND ActivityDate < TODAY
        ORDER BY ActivityDate DESC
        LIMIT 1
      `;
      const eventResult = await query(eventQuery);
      const lastMeeting = eventResult.records && eventResult.records[0] ? {
        date: eventResult.records[0].ActivityDate,
        subject: eventResult.records[0].Subject
      } : null;

      return {
        account,
        customerBrain: account.Customer_Brain__c || '',
        opportunities,
        contacts,
        lastMeeting
      };

    } catch (error) {
      logger.error('Error fetching account context:', error);
      return null;
    }
  }

  /**
   * Sync transcription results to Salesforce
   * @param {string} accountId - Salesforce Account ID
   * @param {string} accountName - Account name
   * @param {string} noteTitle - Title of the meeting note
   * @param {object} sections - Processed sections from transcription
   * @param {string} transcript - Full transcript
   * @param {string} meetingDate - ISO date string
   * @returns {Promise<object>}
   */
  async syncTranscriptionToSalesforce(accountId, accountName, noteTitle, sections, transcript, meetingDate) {
    try {
      const { query } = require('./salesforce/queries');
      const { sfConnection } = require('./salesforce/connection');
      const conn = sfConnection.getConnection();

      const results = {
        success: true,
        customerBrainUpdated: false,
        eventCreated: false,
        eventId: null,
        contactsCreated: 0,
        tasksCreated: 0
      };

      // 1. Update Customer Brain on Account
      try {
        const accountQuery = `SELECT Id, Customer_Brain__c FROM Account WHERE Id = '${accountId}' LIMIT 1`;
        const accountResult = await query(accountQuery);
        
        if (accountResult.records && accountResult.records[0]) {
          const existingBrain = accountResult.records[0].Customer_Brain__c || '';
          
          // Format new entry
          const dateDisplay = new Date(meetingDate || new Date()).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
          
          const newEntry = `
───────────────────────────────────────
${dateDisplay} - ${noteTitle}
───────────────────────────────────────
${sections.summary || 'No summary available'}
${sections.nextSteps ? `\nNext Steps:\n${sections.nextSteps}` : ''}
`.trim();

          const updatedBrain = newEntry + '\n\n' + existingBrain;
          
          await conn.sobject('Account').update({
            Id: accountId,
            Customer_Brain__c: updatedBrain.substring(0, 131072) // SF limit
          });
          
          results.customerBrainUpdated = true;
          logger.info(`Updated Customer_Brain__c for ${accountName}`);
        }
      } catch (brainError) {
        logger.warn('Error updating Customer Brain:', brainError.message);
      }

      // 2. Create Event record
      try {
        const eventDate = meetingDate ? new Date(meetingDate) : new Date();
        const eventData = {
          Subject: noteTitle,
          ActivityDate: eventDate.toISOString().split('T')[0],
          WhatId: accountId,
          Description: `## Summary\n${sections.summary || ''}\n\n## MEDDICC Signals\n${sections.meddiccSignals || ''}\n\n## Next Steps\n${sections.nextSteps || ''}`.substring(0, 32000),
          DurationInMinutes: 60,
          Type: 'Meeting'
        };

        const eventResult = await conn.sobject('Event').create(eventData);
        
        if (eventResult.success) {
          results.eventCreated = true;
          results.eventId = eventResult.id;
          logger.info(`Created Event: ${eventResult.id}`);
        }
      } catch (eventError) {
        logger.warn('Error creating Event:', eventError.message);
      }

      // 3. Parse and create Tasks from Action Items
      if (sections.actionItems) {
        try {
          const actionLines = sections.actionItems.split('\n')
            .filter(line => line.trim().startsWith('- [ ]') || line.trim().startsWith('-'));
          
          for (const line of actionLines.slice(0, 5)) { // Max 5 tasks
            const taskSubject = line.replace(/^[-\s\[\]]+/, '').trim();
            if (taskSubject.length > 5) {
              await conn.sobject('Task').create({
                Subject: taskSubject.substring(0, 255),
                WhatId: accountId,
                Status: 'Not Started',
                Priority: 'Normal',
                ActivityDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 1 week out
              });
              results.tasksCreated++;
            }
          }
          logger.info(`Created ${results.tasksCreated} Tasks`);
        } catch (taskError) {
          logger.warn('Error creating Tasks:', taskError.message);
        }
      }

      return results;

    } catch (error) {
      logger.error('Error syncing to Salesforce:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      
      try {
        // Stop Channel Intelligence services
        if (process.env.INTEL_SCRAPER_ENABLED === 'true') {
          channelIntelligence.stopPolling();
          intelligenceDigest.stopDigest();
          const intelligenceStore = require('./services/intelligenceStore');
          intelligenceStore.close();
          logger.info('✅ Channel Intelligence stopped');
        }

        // Stop Slack app
        if (this.app) {
          await this.app.stop();
          logger.info('✅ Slack app stopped');
        }

        // Close Express server
        if (this.expressServer) {
          this.expressServer.close();
          logger.info('✅ Express server stopped');
        }

        // Stop agent job queue worker
        try {
          const jobQueue = require('./agents/jobQueue');
          jobQueue.stopWorker();
          logger.info('✅ Agent job queue worker stopped');
        } catch (jqErr) {
          // May not be initialized
        }

        // Close PostgreSQL connection pool
        try {
          const db = require('./db/connection');
          await db.shutdown();
          logger.info('✅ PostgreSQL pool closed');
        } catch (dbErr) {
          // May not be initialized
        }

        logger.info('👋 GTM Brain shut down successfully');
        process.exit(0);

      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Generate ICS (iCalendar) feed from calendar events
   * @param {Array} events - Calendar events from Graph API
   * @param {string} email - BL email address
   * @returns {string} ICS formatted calendar string
   */
  generateICSFeed(events, email) {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//GTM Brain//Calendar Feed//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${email.split('@')[0]} - GTM Brain`,
      'X-WR-TIMEZONE:UTC'
    ];

    for (const event of events) {
      // Format dates for ICS (YYYYMMDDTHHMMSSZ format)
      const formatICSDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      };

      // Escape special characters for ICS
      const escapeICS = (str) => {
        if (!str) return '';
        return str
          .replace(/\\/g, '\\\\')
          .replace(/;/g, '\\;')
          .replace(/,/g, '\\,')
          .replace(/\n/g, '\\n');
      };

      // Strip HTML from body content
      const stripHtml = (html) => {
        if (!html) return '';
        return html
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();
      };

      // Build attendee list for description
      const attendeeList = (event.externalAttendees || [])
        .map(a => `• ${a.name || a.email}${a.email ? ' (' + a.email + ')' : ''}`)
        .join('\\n');

      // Build rich description with full meeting details
      const descriptionParts = [];
      
      // Full body content (HTML stripped)
      const bodyContent = stripHtml(event.body);
      if (bodyContent && bodyContent.length > 10) {
        descriptionParts.push(escapeICS(bodyContent.substring(0, 2000)));
      } else if (event.bodyPreview) {
        descriptionParts.push(escapeICS(event.bodyPreview));
      }
      
      // External attendees
      if (attendeeList) {
        descriptionParts.push('\\n\\n--- EXTERNAL ATTENDEES ---\\n' + escapeICS(attendeeList));
      }
      
      // Meeting link
      if (event.meetingUrl) {
        descriptionParts.push('\\n\\n--- JOIN MEETING ---\\n' + event.meetingUrl);
      }
      
      // Open in Outlook link
      if (event.webLink) {
        descriptionParts.push('\\n\\n--- OPEN IN OUTLOOK ---\\n' + event.webLink);
      }

      const description = descriptionParts.filter(Boolean).join('');

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${event.eventId}@gtm-brain`);
      lines.push(`DTSTAMP:${formatICSDate(new Date().toISOString())}`);
      lines.push(`DTSTART:${formatICSDate(event.startDateTime)}`);
      lines.push(`DTEND:${formatICSDate(event.endDateTime)}`);
      lines.push(`SUMMARY:${escapeICS(event.subject)}`);
      
      if (event.location) {
        lines.push(`LOCATION:${escapeICS(event.location)}`);
      }
      
      if (description) {
        lines.push(`DESCRIPTION:${description}`);
      }
      
      // Primary URL - meeting link or Outlook web link
      if (event.meetingUrl) {
        lines.push(`URL:${event.meetingUrl}`);
      } else if (event.webLink) {
        lines.push(`URL:${event.webLink}`);
      }

      // Add attendees
      for (const att of (event.allAttendees || [])) {
        if (att.email) {
          const role = att.isExternal ? 'REQ-PARTICIPANT' : 'OPT-PARTICIPANT';
          lines.push(`ATTENDEE;ROLE=${role};CN=${escapeICS(att.name || att.email)}:mailto:${att.email}`);
        }
      }

      // Mark customer meetings
      if (event.isCustomerMeeting) {
        lines.push('CATEGORIES:Customer Meeting');
      }

      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
}

// Start the application
if (require.main === module) {
  const gtmBrain = new GTMBrainApp();
  gtmBrain.start().catch((error) => {
    logger.error('Failed to start application:', error);
    process.exit(1);
  });
}

module.exports = GTMBrainApp;

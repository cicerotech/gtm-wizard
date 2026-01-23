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
const { registerEventHandlers } = require('./slack/events');
const { registerInteractiveHandlers } = require('./slack/interactive');
const { startScheduledJobs } = require('./slack/scheduled');
const { scheduleWeeklyReport } = require('./slack/weeklyReport');

// Channel Intelligence Scraper
const channelIntelligence = require('./services/channelIntelligence');
const channelMonitor = require('./slack/channelMonitor');
const intelligenceDigest = require('./slack/intelligenceDigest');

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
<div class="tip"><b>Use first names</b> for BLs: Julie, Himanshu, Asad</div>
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
<div class="card" data-k="accounts owner julie himanshu asad portfolio"><div class="card-title">Accounts by Owner</div><div class="card-desc">All accounts owned by someone</div><div class="examples"><div class="example"><code class="code">what accounts does Julie own</code><button class="copy">copy</button></div><div class="example"><code class="code">Himanshu's accounts</code><button class="copy">copy</button></div></div></div>
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
<div class="card" data-k="owner pipeline deals julie himanshu"><div class="card-title">Someone's Pipeline</div><div class="card-desc">Specific person's deals</div><div class="examples"><div class="example"><code class="code">Himanshu's deals</code><button class="copy">copy</button></div><div class="example"><code class="code">Julie's pipeline</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="early stage discovery qualifying"><div class="card-title">Early Stage</div><div class="card-desc">Stage 0-1 (Qualifying, Discovery)</div><div class="examples"><div class="example"><code class="code">early stage pipeline</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="mid stage sqo pilot s2 s3"><div class="card-title">Mid Stage</div><div class="card-desc">Stage 2-3 (SQO, Pilot)</div><div class="examples"><div class="example"><code class="code">mid stage deals</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="late stage proposal negotiation s4 s5"><div class="card-title">Late Stage</div><div class="card-desc">Stage 4-5 (Proposal, Negotiation)</div><div class="examples"><div class="example"><code class="code">late stage pipeline</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="contracting m&a compliance sigma product"><div class="card-title">Product Pipeline</div><div class="card-desc">Filter by product/service</div><div class="examples"><div class="example"><code class="code">contracting pipeline</code><button class="copy">copy</button></div><div class="example"><code class="code">late stage contracting</code><button class="copy">copy</button></div></div></div>
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
<div class="card" data-k="reassign account assign transfer owner single"><div class="card-title">Reassign Account</div><div class="card-desc">Change account ownership (US: Asad, Himanshu, Julie, Olivia, Ananth, Justin | EU: Greg, Nathan, Tom, Conor, Alex, Nicola, Emer)</div><div class="examples"><div class="example"><code class="code">reassign Dolby to Asad</code><button class="copy">copy</button></div><div class="example"><code class="code">assign Ecolab to Himanshu</code><button class="copy">copy</button></div><div class="example"><code class="code">assign Fresh Del Monte to Nathan</code><button class="copy">copy</button></div></div></div>
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
    this.expressApp.use(express.json());
    this.expressApp.use(express.urlencoded({ extended: true }));
    
    // Cookie parser for session
    const cookieParser = require('cookie-parser');
    this.expressApp.use(cookieParser());

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
          const userName = oktaSession.name || oktaSession.email;
          const html = generateUnifiedHub({ userName });
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
          const { generateMeetingPrepHTML } = require('./views/meetingPrepView');
          // Pass filterUser query param if present
          const filterUserId = req.query.filterUser || null;
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
    
    // GTM Hub logout
    this.expressApp.get('/gtm/logout', (req, res) => {
      res.clearCookie(OKTA_SESSION_COOKIE);
      res.clearCookie('gtm_dash_auth');
      res.clearCookie('gtm_dash_user');
      res.redirect('/gtm');
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

    // GTM Brain Architecture / Data Flow Diagram
    this.expressApp.get('/architecture', (req, res) => {
      const path = require('path');
      const archPath = path.join(__dirname, '..', 'docs', 'gtm-brain-architecture.html');
      res.sendFile(archPath);
    });
    this.expressApp.get('/data-flow', (req, res) => res.redirect('/architecture'));
    this.expressApp.get('/how-it-works', (req, res) => res.redirect('/architecture'));

    // CAB Survey
    this.expressApp.get('/cab-survey', (req, res) => {
      const path = require('path');
      const surveyPath = path.join(__dirname, '..', 'docs', 'cab-survey.html');
      res.sendFile(surveyPath);
    });
    this.expressApp.get('/survey', (req, res) => res.redirect('/cab-survey'));

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
              '2. Select gtm-wizard service',
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

    // Get aggregated context for an account
    this.expressApp.get('/api/meeting-context/:accountId', async (req, res) => {
      try {
        const { accountId } = req.params;
        const context = await meetingContextService.generateMeetingContext(accountId);
        res.json({ success: true, context });
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
          SELECT Id, Name, Website
          FROM Account 
          WHERE Website LIKE '%${domain}%'
          ORDER BY LastModifiedDate DESC
          LIMIT 1
        `;
        
        const { query: sfQuery } = require('./salesforce/connection');
        const result = await sfQuery(accountQuery, true);
        
        if (result?.records?.length > 0) {
          const account = result.records[0];
          res.json({ success: true, accountId: account.Id, accountName: account.Name });
        } else {
          // Fallback: Check contacts by email domain
          const contactQuery = `
            SELECT AccountId, Account.Name
            FROM Contact 
            WHERE Email LIKE '%@${domain}'
            ORDER BY LastModifiedDate DESC
            LIMIT 1
          `;
          const contactResult = await sfQuery(contactQuery, true);
          
          if (contactResult?.records?.length > 0 && contactResult.records[0].AccountId) {
            const contact = contactResult.records[0];
            res.json({ success: true, accountId: contact.AccountId, accountName: contact.Account?.Name });
          } else {
            res.json({ success: false, message: 'No account found for domain' });
          }
        }
      } catch (error) {
        logger.error('Error looking up account by domain:', error);
        res.status(500).json({ success: false, error: error.message });
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
    
    // List available ICS feeds
    this.expressApp.get('/api/calendar/feeds', async (req, res) => {
      try {
        const { BL_EMAILS } = require('./services/calendarService');
        const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://gtm-brain.onrender.com';
        
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
    
    // Get stored calendar events from database (fast - for debugging)
    this.expressApp.get('/api/calendar/stored', async (req, res) => {
      try {
        const { calendarService } = require('./services/calendarService');
        const result = await calendarService.getCalendarEventsFromDatabase(14);
        
        res.json({
          success: true,
          meetingCount: result.meetings.length,
          stats: result.stats,
          needsSync: result.needsSync,
          meetings: result.meetings.slice(0, 20) // First 20 for preview
        });
      } catch (error) {
        logger.error('Error getting stored calendar events:', error);
        res.status(500).json({ success: false, error: error.message });
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
    
    // BL Setup guide
    this.expressApp.get('/api/obsidian/setup-guide', async (req, res) => {
      const { email } = req.query;
      const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://gtm-brain.onrender.com';
      
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
    // TEST ENDPOINTS - For validating Obsidian sync pipeline
    // ═══════════════════════════════════════════════════════════════════════
    
    // Manually push a test note to the database (bypasses file reading)
    this.expressApp.post('/api/obsidian/test-push', async (req, res) => {
      try {
        const intelligenceStore = require('./services/intelligenceStore');
        
        const {
          accountId = '001Hp00003lhyCxIAI',  // Eudia Testing default
          accountName = 'Eudia Testing',
          noteTitle = 'Test Meeting Note',
          noteDate = new Date().toISOString().split('T')[0],
          summary = 'Test meeting note pushed via API.',
          sentiment = 'Positive',
          blEmail = 'keigan@eudia.com'
        } = req.body;
        
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
        
        res.json({
          success: true,
          message: 'Test note stored successfully',
          noteId: result.id,
          accountId,
          accountName,
          noteTitle,
          noteDate,
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
          
          const name = attendee.name 
            || attendee.full_name 
            || attendee['Full Name']
            || attendee['full_name']
            || null;
          
          const company = attendee.company 
            || attendee.company_name 
            || attendee['Company']
            || null;
          
          logger.info(`💾 Saving enrichment: ${attendee.email} - Title: ${title ? 'YES' : 'NO'}, Summary: ${summary ? 'YES (' + summary.length + ' chars)' : 'NO'}, LinkedIn: ${linkedinUrl ? 'YES' : 'NO'}`);
          
          await intelligenceStore.saveAttendeeEnrichment({
            email: attendee.email,
            name,
            title,
            linkedinUrl,
            company,
            summary,
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

      // Initialize Channel Intelligence Scraper
      if (process.env.INTEL_SCRAPER_ENABLED === 'true') {
        await channelIntelligence.initialize(this.app.client);
        channelMonitor.registerChannelMonitorHandlers(this.app);
        intelligenceDigest.initialize(this.app.client);
        intelligenceDigest.registerDigestHandlers(this.app);
        logger.info('🧠 Channel Intelligence Scraper initialized');
      }

      // Setup graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start GTM Brain:', error);
      process.exit(1);
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

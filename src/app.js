require('dotenv').config();
const { App } = require('@slack/bolt');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('./utils/logger');
const { initializeRedis } = require('./utils/cache');
const { initializeSalesforce } = require('./salesforce/connection');
const { initializeEmail } = require('./utils/emailService');

// Import handlers
const { registerSlashCommands } = require('./slack/commands');
const { registerEventHandlers } = require('./slack/events');
const { registerInteractiveHandlers } = require('./slack/interactive');
const { startScheduledJobs } = require('./slack/scheduled');
const { scheduleWeeklyReport } = require('./slack/weeklyReport');

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
:root{--primary:#6366f1;--primary-light:#818cf8;--primary-bg:#eef2ff;--text:#1f2937;--text-muted:#6b7280;--text-light:#9ca3af;--bg:#f8fafc;--card:#fff;--border:#e5e7eb;--code-bg:#f1f5f9}
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
<p>Salesforce queries via Slack - validated patterns</p>
</header>
<div class="search-box">
<input type="text" id="search" placeholder="Search: reassign, pipeline, close deal, nurture..." autofocus>
</div>
<main class="main">
<div class="tips">
<h3>Quick Reference</h3>
<div class="tips-grid">
<div class="tip"><b>First names</b> for BLs: Julie, Himanshu, Asad</div>
<div class="tip"><b>Commas</b> for batch: Account1, Account2</div>
<div class="tip"><b>Nurture</b> auto-closes all open opportunities</div>
<div class="tip"><b>show next 10</b> in thread for pagination</div>
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
<div class="card" data-k="owner owns who business lead bl lookup find"><div class="card-title">Find Account Owner</div><div class="card-desc">Look up who owns an account</div><div class="examples"><div class="example"><code class="code">who owns Boeing</code><button class="copy">copy</button></div><div class="example"><code class="code">BL for Intel</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="accounts owner julie himanshu asad portfolio"><div class="card-title">Accounts by Owner</div><div class="card-desc">All accounts owned by someone</div><div class="examples"><div class="example"><code class="code">what accounts does Julie own</code><button class="copy">copy</button></div><div class="example"><code class="code">Himanshu's accounts</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="accounts stage sqo discovery pilot s1 s2 s3"><div class="card-title">Accounts by Stage</div><div class="card-desc">Accounts in a specific stage</div><div class="examples"><div class="example"><code class="code">what accounts are in Stage 2</code><button class="copy">copy</button></div><div class="example"><code class="code">accounts in Stage 4</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="legal team size department headcount"><div class="card-title">Legal Team Size</div><div class="card-desc">Account's legal department size</div><div class="examples"><div class="example"><code class="code">what is the legal team size at Boeing</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="decision makers stakeholders contacts"><div class="card-title">Decision Makers</div><div class="card-desc">Key contacts at an account</div><div class="examples"><div class="example"><code class="code">who are the decision makers at Microsoft</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="use cases discussing products services"><div class="card-title">Use Cases</div><div class="card-desc">What products account is interested in</div><div class="examples"><div class="example"><code class="code">what use cases is Boeing discussing</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="competitive landscape competitors ironclad harvey"><div class="card-title">Competitive Landscape</div><div class="card-desc">Competitor presence at accounts</div><div class="examples"><div class="example"><code class="code">competitive landscape for Intel</code><button class="copy">copy</button></div></div></div>
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
<div class="card" data-k="contracts active list show"><div class="card-title">Contracts</div><div class="card-desc">Contract records</div><div class="examples"><div class="example"><code class="code">show contracts</code><button class="copy">copy</button></div><div class="example"><code class="code">contracts for Boeing</code><button class="copy">copy</button></div></div></div>
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
<div class="card" data-k="create opportunity opp add new deal"><div class="card-title">Create Opportunity</div><div class="card-desc">Add new opportunity to account</div><div class="examples"><div class="example"><code class="code">create opp for Boeing</code><button class="copy">copy</button></div><div class="example"><code class="code">create opportunity for Intel</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="create opportunity stage amount acv"><div class="card-title">Create with Details</div><div class="card-desc">Create with stage or ACV</div><div class="examples"><div class="example"><code class="code">create a stage 2 opp for Apple</code><button class="copy">copy</button></div><div class="example"><code class="code">create opportunity for Amazon with $500k ACV</code><button class="copy">copy</button></div></div></div>
</div>
</section>

<section class="section" data-cat="update">
<div class="section-title">Update <span class="tag">ADMIN</span></div>
<div class="cards">
<div class="card" data-k="reassign account assign transfer owner single"><div class="card-title">Reassign Account</div><div class="card-desc">Change account ownership</div><div class="examples"><div class="example"><code class="code">reassign Boeing to Julie</code><button class="copy">copy</button></div><div class="example"><code class="code">assign Intel to Himanshu</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="batch reassign multiple accounts bulk"><div class="card-title">Batch Reassign</div><div class="card-desc">Reassign multiple accounts at once</div><div class="examples"><div class="example"><code class="code">batch reassign: Boeing, Intel, Microsoft to Julie</code><button class="copy">copy</button></div><div class="example"><code class="code">reassign Boeing, Intel to Himanshu</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="move nurture single mark set"><div class="card-title">Move to Nurture</div><div class="card-desc">Mark account as nurture + close opps</div><div class="examples"><div class="example"><code class="code">move Boeing to nurture</code><button class="copy">copy</button></div><div class="example"><code class="code">mark Intel as nurture</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="batch nurture multiple several bulk"><div class="card-title">Batch Nurture</div><div class="card-desc">Nurture multiple accounts at once</div><div class="examples"><div class="example"><code class="code">batch nurture: Boeing, Intel, Microsoft</code><button class="copy">copy</button></div><div class="example"><code class="code">move Boeing, Intel, Microsoft to nurture</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="close lost dead disqualified kill"><div class="card-title">Close Lost</div><div class="card-desc">Mark opportunities as lost</div><div class="examples"><div class="example"><code class="code">close Boeing lost</code><button class="copy">copy</button></div><div class="example"><code class="code">mark Intel as lost</code><button class="copy">copy</button></div></div></div>
<div class="card" data-k="customer brain note history add"><div class="card-title">Save Customer Note</div><div class="card-desc">Add notes to account history</div><div class="examples"><div class="example"><code class="code">add to customer history: Boeing met with CLO today</code><button class="copy">copy</button></div></div></div>
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
document.querySelectorAll('.copy').forEach(btn=>btn.addEventListener('click',async function(){const code=this.parentElement.querySelector('.code').textContent;try{await navigator.clipboard.writeText(code);this.textContent='ok';this.classList.add('ok');setTimeout(()=>{this.textContent='copy';this.classList.remove('ok')},1500)}catch(e){}}));
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

      // Initialize Salesforce connection
      await initializeSalesforce();
      logger.info('✅ Salesforce connection established');

      // Initialize Email service
      await initializeEmail();
      logger.info('✅ Email service initialized');

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

    // Health check endpoint
    this.expressApp.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0'
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

    // Account Status Dashboard - Password protected with analytics
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
    
    // Dashboard cache (5 minute TTL to reduce Salesforce API calls)
    let dashboardCache = { html: null, timestamp: 0 };
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    
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
      
      // Check auth cookie
      if (req.cookies[AUTH_COOKIE] === 'authenticated') {
        try {
          const userName = req.cookies[USER_COOKIE];
          const { html, cached } = await getCachedDashboard();
          logAccess(userName, clientIP, cached);
          
          res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline'");
          res.setHeader('Cache-Control', 'private, max-age=60');
          res.send(html);
        } catch (error) {
          res.status(500).send(`Error: ${error.message}`);
        }
      } else {
        const { generateLoginPage } = require('./slack/accountDashboard');
        res.send(generateLoginPage());
      }
    });
    
    this.expressApp.post('/account-dashboard', async (req, res) => {
      const { password, userName } = req.body;
      const clientIP = req.ip || req.connection?.remoteAddress;
      
      if (DASHBOARD_PASSWORDS.includes(password?.toLowerCase()?.trim())) {
        // Set auth cookie (30 days)
        res.cookie(AUTH_COOKIE, 'authenticated', { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
        if (userName?.trim()) {
          res.cookie(USER_COOKIE, userName.trim(), { maxAge: 30 * 24 * 60 * 60 * 1000 });
        }
        try {
          const { html, cached } = await getCachedDashboard();
          logAccess(userName?.trim(), clientIP, cached);
          
          res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline'");
          res.setHeader('Cache-Control', 'private, max-age=60');
          res.send(html);
        } catch (error) {
          res.status(500).send(`Error: ${error.message}`);
        }
      } else {
        res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GTM Dashboard</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f7fe;min-height:100vh;display:flex;align-items:center;justify-content:center}.login-container{background:#fff;padding:40px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);max-width:360px;width:90%}.login-container h1{font-size:1.25rem;font-weight:600;color:#1f2937;margin-bottom:8px}.login-container p{font-size:0.875rem;color:#6b7280;margin-bottom:24px}.login-container input{width:100%;padding:12px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.875rem;margin-bottom:16px}.login-container input:focus{outline:none;border-color:#8e99e1}.login-container button{width:100%;padding:12px;background:#8e99e1;color:#fff;border:none;border-radius:6px;font-size:0.875rem;font-weight:500;cursor:pointer}.login-container button:hover{background:#7c8bd4}.error{color:#ef4444;font-size:0.75rem;margin-bottom:12px}</style>
</head><body><div class="login-container"><h1>GTM Dashboard</h1><p>Enter password to continue</p><form method="POST" action="/account-dashboard"><input type="password" name="password" placeholder="Password" required autocomplete="off"><div class="error">Incorrect password</div><button type="submit">Continue</button></form></div></body></html>`);
      }
    });
    
    // Analytics endpoint (protected - same password)
    this.expressApp.get('/account-dashboard/analytics', (req, res) => {
      if (req.cookies[AUTH_COOKIE] !== 'authenticated') {
        return res.status(401).json({ error: 'Unauthorized' });
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
    
    // Force cache refresh endpoint
    this.expressApp.post('/account-dashboard/refresh-cache', (req, res) => {
      if (req.cookies[AUTH_COOKIE] !== 'authenticated') {
        return res.status(401).json({ error: 'Unauthorized' });
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
      res.redirect('/account-dashboard');
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

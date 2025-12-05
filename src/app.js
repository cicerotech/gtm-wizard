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
    
    // Security middleware
    this.expressApp.use(helmet());
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

    // GTM-Brain Query Reference (hosted version)
    this.expressApp.get('/queries', (req, res) => {
      const path = require('path');
      const fs = require('fs');
      const queryRefPath = path.join(__dirname, '../GTM-Brain-Query-Reference.html');
      
      // Check if file exists, if not send helpful message
      if (fs.existsSync(queryRefPath)) {
        res.sendFile(queryRefPath);
      } else {
        res.send('<h1>Query Reference Coming Soon</h1><p>This will show all available GTM-Brain queries.</p>');
      }
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

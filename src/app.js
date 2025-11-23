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

      // Initialize Slack Bolt app
      this.app = new App({
        token: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
        appToken: process.env.SLACK_APP_TOKEN,
        socketMode: true, // Enable Socket Mode for development
        logLevel: process.env.LOG_LEVEL || 'info'
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

    // Account Status Dashboard endpoint (clean web view)
    this.expressApp.get('/dashboard', async (req, res) => {
      try {
        const { generateAccountDashboard } = require('./slack/accountDashboard');
        const html = await generateAccountDashboard();
        res.send(html);
      } catch (error) {
        res.status(500).send(`Error generating dashboard: ${error.message}`);
      }
    });
    
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
      // Start Slack Bolt app
      await this.app.start();
      logger.info('⚡️ GTM Brain Slack Bot is running!');

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

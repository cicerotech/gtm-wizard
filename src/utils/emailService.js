require('isomorphic-fetch');
const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
const ExcelJS = require('exceljs');
const logger = require('./logger');

class EmailService {
  constructor() {
    this.graphClient = null;
    this.credential = null;
  }

  async initialize() {
    try {
      // Check for required environment variables
      const tenantId = process.env.AZURE_TENANT_ID;
      const clientId = process.env.AZURE_CLIENT_ID;
      const clientSecret = process.env.AZURE_CLIENT_SECRET;
      const fromEmail = process.env.OUTLOOK_EMAIL || 'keigan.pesenti@eudia.com';

      if (!tenantId || !clientId || !clientSecret) {
        logger.warn('⚠️  Microsoft Graph credentials not configured - email disabled');
        logger.warn('Required: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET');
        return false;
      }

      // Create credential using Azure Identity
      this.credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      
      // Create Graph client with authentication
      this.graphClient = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            const token = await this.credential.getToken('https://graph.microsoft.com/.default');
            return token.token;
          }
        }
      });

      this.fromEmail = fromEmail;
      
      logger.info('✅ Microsoft Graph email service initialized');
      logger.info(`   From: ${fromEmail}`);
      return true;

    } catch (error) {
      logger.error('Microsoft Graph initialization failed:', error);
      return false;
    }
  }

  /**
   * Send email with Excel attachment using Microsoft Graph API
   */
  async sendReportEmail(recipients, subject, body, excelBuffer, filename) {
    try {
      if (!this.graphClient) {
        throw new Error('Email service not initialized - missing Graph credentials');
      }

      // Convert buffer to base64
      const base64Content = excelBuffer.toString('base64');

      // Build email message
      const message = {
        message: {
          subject: subject,
          body: {
            contentType: 'HTML',
            content: body.replace(/\n/g, '<br>')
          },
          toRecipients: recipients.map(email => ({
            emailAddress: { address: email }
          })),
          attachments: [
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: filename,
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              contentBytes: base64Content
            }
          ]
        },
        saveToSentItems: true
      };

      // Send email using Graph API
      await this.graphClient
        .api(`/users/${this.fromEmail}/sendMail`)
        .post(message);

      logger.info('✅ Email sent successfully via Microsoft Graph', { 
        recipients: recipients.length,
        from: this.fromEmail 
      });
      
      return { 
        success: true, 
        provider: 'Microsoft Graph API',
        recipients: recipients.length
      };

    } catch (error) {
      logger.error('Failed to send email via Microsoft Graph:', error);
      
      // Log detailed error if available
      if (error.statusCode) {
        logger.error('Graph API error details:', {
          statusCode: error.statusCode,
          message: error.message,
          body: error.body
        });
      }
      
      throw error;
    }
  }

  /**
   * Create Excel from pipeline data
   */
  async createPipelineExcel(data) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Pipeline Report');

    // Define columns
    worksheet.columns = [
      { header: 'Account Name', key: 'accountName', width: 25 },
      { header: 'Opportunity Name', key: 'oppName', width: 30 },
      { header: 'Stage', key: 'stage', width: 20 },
      { header: 'Product Line', key: 'productLine', width: 25 },
      { header: 'Amount (ACV)', key: 'acv', width: 15 },
      { header: 'Weighted ACV', key: 'weighted', width: 15 },
      { header: 'Target Sign Date', key: 'targetDate', width: 15 },
      { header: 'Owner', key: 'owner', width: 20 },
      { header: 'Days in Stage', key: 'daysInStage', width: 12 }
    ];

    // Add header styling
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    // Add data
    data.forEach(record => {
      worksheet.addRow({
        accountName: record.Account?.Name || '',
        oppName: record.Name || '',
        stage: record.StageName || '',
        productLine: record.Product_Line__c || '',
        acv: record.ACV__c || 0,
        weighted: record.Weighted_ACV__c || 0,
        targetDate: record.Target_LOI_Date__c || '',
        owner: record.Owner?.Name || '',
        daysInStage: record.Days_in_Stage1__c || ''
      });
    });

    // Format currency columns
    worksheet.getColumn('acv').numFmt = '$#,##0';
    worksheet.getColumn('weighted').numFmt = '$#,##0';

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }
}

// Singleton
const emailService = new EmailService();

module.exports = {
  emailService,
  initializeEmail: () => emailService.initialize()
};

const ExcelJS = require('exceljs');
const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
require('isomorphic-fetch');
const logger = require('./logger');

class EmailService {
  constructor() {
    this.graphClient = null;
    this.userEmail = 'keigan.pesenti@eudia.com';
  }

  async initialize() {
    try {
      const credential = new ClientSecretCredential(
        process.env.AZURE_TENANT_ID,
        process.env.AZURE_CLIENT_ID,
        process.env.AZURE_CLIENT_SECRET
      );

      this.graphClient = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            const token = await credential.getToken('https://graph.microsoft.com/.default');
            return token.token;
          }
        }
      });

      logger.info('✅ Email service initialized (Microsoft Graph API)');
      return true;
    } catch (error) {
      logger.error('Email service initialization failed:', error);
      return false;
    }
  }

  /**
   * Send email with Excel attachment using Microsoft Graph
   */
  async sendReportEmail(recipients, subject, body, excelBuffer, filename) {
    try {
      // Convert Excel buffer to base64
      const base64Excel = excelBuffer.toString('base64');

      // Build email message
      const message = {
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
            contentBytes: base64Excel
          }
        ]
      };

      // Send email via Graph API
      await this.graphClient
        .api(`/users/${this.userEmail}/sendMail`)
        .post({ message });

      logger.info('✅ Email sent via Microsoft Graph', { recipients });
      return { success: true };

    } catch (error) {
      logger.error('Failed to send email via Graph:', error);
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
      { header: 'ACV', key: 'acv', width: 15 },
      { header: 'Weighted ACV', key: 'weighted', width: 15 },
      { header: 'Target Sign Date', key: 'targetDate', width: 15 },
      { header: 'Owner', key: 'owner', width: 20 },
      { header: 'Days in Stage', key: 'daysInStage', width: 12 }
    ];

    // Header styling
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };

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

    // Format currency
    worksheet.getColumn('acv').numFmt = '$#,##0';
    worksheet.getColumn('weighted').numFmt = '$#,##0';

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }
}

const emailService = new EmailService();

module.exports = {
  emailService,
  initializeEmail: () => emailService.initialize()
};


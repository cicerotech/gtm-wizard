const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');
const logger = require('./logger');

class EmailService {
  constructor() {
    this.transporter = null;
  }

  async initialize() {
    // Office365/Outlook SMTP configuration
    this.transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false, // TLS
      auth: {
        user: process.env.OUTLOOK_EMAIL || 'keigan.pesenti@eudia.com',
        pass: process.env.OUTLOOK_PASSWORD || 'Augmentnew2025!'
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
      }
    });

    // Verify connection
    try {
      await this.transporter.verify();
      logger.info('✅ Email service initialized');
      return true;
    } catch (error) {
      logger.error('Email service verification failed:', error);
      return false;
    }
  }

  /**
   * Send email with Excel attachment
   */
  async sendReportEmail(recipients, subject, body, excelBuffer, filename) {
    try {
      const mailOptions = {
        from: process.env.OUTLOOK_EMAIL || 'keigan.pesenti@eudia.com',
        to: recipients.join(', '),
        subject: subject,
        text: body,
        html: body.replace(/\n/g, '<br>'),
        attachments: [
          {
            filename: filename,
            content: excelBuffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          }
        ]
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info('✅ Email sent successfully', { messageId: info.messageId, recipients });
      
      return { success: true, messageId: info.messageId };

    } catch (error) {
      logger.error('Failed to send email:', error);
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
        weighted: record.Finance_Weighted_ACV__c || 0,
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


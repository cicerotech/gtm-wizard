/**
 * Utility functions for formatting data
 */

/**
 * Format currency values
 */
function formatCurrency(amount, options = {}) {
  if (!amount || amount === 0) return '$0';
  
  const {
    compact = true,
    currency = 'USD',
    locale = 'en-US'
  } = options;

  if (compact) {
    if (amount >= 1000000000) {
      return `$${(amount / 1000000000).toFixed(1)}B`;
    } else if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Format numbers with proper separators
 */
function formatNumber(number, options = {}) {
  if (!number && number !== 0) return '0';

  const {
    locale = 'en-US',
    minimumFractionDigits = 0,
    maximumFractionDigits = 2
  } = options;

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits
  }).format(number);
}

/**
 * Format percentages
 */
function formatPercentage(value, options = {}) {
  if (!value && value !== 0) return '0%';

  const {
    locale = 'en-US',
    minimumFractionDigits = 0,
    maximumFractionDigits = 1
  } = options;

  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits,
    maximumFractionDigits
  }).format(value / 100);
}

/**
 * Format dates
 */
function formatDate(dateString, options = {}) {
  if (!dateString) return 'No date';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid date';

  const {
    style = 'short',
    locale = 'en-US',
    includeTime = false
  } = options;

  const baseOptions = {
    short: { month: 'short', day: 'numeric', year: 'numeric' },
    medium: { month: 'long', day: 'numeric', year: 'numeric' },
    long: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
    relative: null // Special case handled below
  };

  if (style === 'relative') {
    return formatRelativeDate(date);
  }

  let formatOptions = baseOptions[style] || baseOptions.short;

  if (includeTime) {
    formatOptions = {
      ...formatOptions,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
  }

  return date.toLocaleDateString(locale, formatOptions);
}

/**
 * Format relative dates (e.g., "2 days ago", "in 3 weeks")
 */
function formatRelativeDate(date) {
  const now = new Date();
  const diffTime = now - date;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays === -1) return 'Tomorrow';
  if (diffDays > 0 && diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 0 && diffDays > -7) return `in ${Math.abs(diffDays)} days`;
  if (diffWeeks > 0 && diffWeeks < 4) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
  if (diffWeeks < 0 && diffWeeks > -4) return `in ${Math.abs(diffWeeks)} week${Math.abs(diffWeeks) > 1 ? 's' : ''}`;
  if (diffMonths > 0 && diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
  if (diffMonths < 0 && diffMonths > -12) return `in ${Math.abs(diffMonths)} month${Math.abs(diffMonths) > 1 ? 's' : ''}`;

  // Fall back to standard date format for very old/future dates
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Format time duration
 */
function formatDuration(milliseconds) {
  if (milliseconds < 1000) return `${milliseconds}ms`;
  
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * Clean stage names for display
 */
function cleanStageName(stageName) {
  if (!stageName) return 'No Stage';
  
  // Clean up stage names
  const stageMap = {
    'Stage 6. Closed(Won)': 'Closed Won',
    'Stage 7. Closed(Lost)': 'Closed Lost',
    'Stage 6.Closed(Won)': 'Closed Won',
    'Stage 7.Closed(Lost)': 'Closed Lost'
  };
  
  return stageMap[stageName] || stageName;
}

/**
 * Format field names for display
 */
function formatFieldName(apiName) {
  // Convert API names to readable labels
  const fieldMap = {
    'StageName': 'Stage',
    'CloseDate': 'Close Date',
    'CreatedDate': 'Created Date',
    'LastActivityDate': 'Last Activity',
    'LastModifiedDate': 'Last Modified',
    'Owner.Name': 'Owner',
    'Account.Name': 'Account',
    'Account.Industry': 'Industry',
    'Finance_Weighted_ACV__c': 'Weighted ACV',
    'Target_LOI_Date__c': 'Target LOI Date',
    'Days_in_Stage__c': 'Days in Stage'
  };

  return fieldMap[apiName] || apiName.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text, maxLength = 50, suffix = '...') {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Format table data for console/slack display
 */
function formatTable(data, columns, options = {}) {
  if (!data || data.length === 0) return 'No data to display';

  const {
    maxWidth = 80,
    padding = 1,
    separator = ' | '
  } = options;

  // Calculate column widths
  const colWidths = columns.map(col => {
    const headerWidth = col.header ? col.header.length : col.key.length;
    const maxDataWidth = Math.max(
      ...data.map(row => {
        const value = row[col.key];
        return value ? value.toString().length : 0;
      })
    );
    return Math.min(Math.max(headerWidth, maxDataWidth) + padding * 2, col.maxWidth || 30);
  });

  let result = '';

  // Header row
  const headers = columns.map((col, i) => {
    const header = col.header || col.key;
    return header.padEnd(colWidths[i]);
  });
  result += headers.join(separator) + '\n';

  // Separator row
  result += colWidths.map(width => '─'.repeat(width)).join(separator.replace(/ /g, '─')) + '\n';

  // Data rows
  data.forEach(row => {
    const cells = columns.map((col, i) => {
      let value = row[col.key] || '';
      
      // Apply formatter if provided
      if (col.formatter) {
        value = col.formatter(value, row);
      }
      
      return truncateText(value.toString(), colWidths[i]).padEnd(colWidths[i]);
    });
    result += cells.join(separator) + '\n';
  });

  return result;
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format phone numbers
 */
function formatPhoneNumber(phoneNumber, format = 'US') {
  if (!phoneNumber) return '';
  
  // Remove all non-digits
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  if (format === 'US' && cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  return phoneNumber; // Return original if can't format
}

module.exports = {
  formatCurrency,
  formatNumber,
  formatPercentage,
  formatDate,
  formatRelativeDate,
  formatDuration,
  cleanStageName,
  formatFieldName,
  truncateText,
  formatTable,
  formatFileSize,
  formatPhoneNumber
};

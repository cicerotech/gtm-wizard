const logger = require('../utils/logger');
const { cleanStageName } = require('../utils/formatters');

class ResponseFormatter {
  constructor() {
    this.maxTableRows = 15;
    this.maxMessageLength = 3000;
  }

  /**
   * Format query results into human-readable response
   */
  formatResponse(queryResult, parsedIntent, conversationContext = null) {
    if (!queryResult || !queryResult.records) {
      return this.formatNoResults(parsedIntent);
    }

    const records = queryResult.records;
    const totalSize = queryResult.totalSize;

    if (totalSize === 0) {
      return this.formatNoResults(parsedIntent);
    }

    // Choose formatting based on intent and result type
    if (parsedIntent.entities.groupBy && parsedIntent.entities.groupBy.length > 0) {
      return this.formatAggregationResults(records, parsedIntent, totalSize);
    }

    switch (parsedIntent.intent) {
      case 'pipeline_summary':
        return this.formatPipelineSummary(records, parsedIntent, totalSize);
      
      case 'deal_lookup':
        return this.formatDealLookup(records, parsedIntent, totalSize);
      
      case 'activity_check':
        return this.formatActivityCheck(records, parsedIntent, totalSize);
      
      case 'forecasting':
        return this.formatForecastView(records, parsedIntent, totalSize);
      
      case 'trend_analysis':
        return this.formatTrendAnalysis(records, parsedIntent, totalSize);
      
      default:
        return this.formatGenericResults(records, parsedIntent, totalSize);
    }
  }

  /**
   * Format pipeline summary
   */
  formatPipelineSummary(records, parsedIntent, totalSize) {
    const totalAmount = records.reduce((sum, r) => sum + (r.Amount || 0), 0);
    const weightedAmount = records.reduce((sum, r) => sum + (r.Finance_Weighted_ACV__c || 0), 0);
    const avgDealSize = totalAmount / records.length;

    let response = `*Pipeline Summary*\n`;
    response += `${totalSize} deals worth ${this.formatCurrency(totalAmount)}\n`;
    response += `Weighted value: ${this.formatCurrency(weightedAmount)}\n`;
    response += `Average deal size: ${this.formatCurrency(avgDealSize)}\n\n`;

    // Add stage breakdown if not already grouped
    if (!parsedIntent.entities.groupBy) {
      const stageBreakdown = this.analyzeByStage(records);
      response += `*By Stage:*\n`;
      Object.entries(stageBreakdown).forEach(([stage, data]) => {
        const cleanStage = cleanStageName(stage);
        response += `${cleanStage}: ${data.count} deals (${this.formatCurrency(data.amount)})\n`;
      });
      response += '\n';
    }

    // Add top deals table
    response += this.buildDealsTable(records.slice(0, this.maxTableRows));

    if (totalSize > this.maxTableRows) {
      response += `\n_Showing top ${this.maxTableRows} of ${totalSize} deals_`;
    }

    return response;
  }

  /**
   * Format deal lookup results
   */
  formatDealLookup(records, parsedIntent, totalSize) {
    const totalAmount = records.reduce((sum, r) => sum + (r.Amount || 0), 0);

    let response = `*Deal Results*\n`;
    response += `Found ${totalSize} deals worth ${this.formatCurrency(totalAmount)}\n\n`;

    // Add context about the search
    const searchContext = this.buildSearchContext(parsedIntent.entities);
    if (searchContext) {
      response += `*Filters:* ${searchContext}\n\n`;
    }

    response += this.buildDealsTable(records.slice(0, this.maxTableRows));

    if (totalSize > this.maxTableRows) {
      response += `\n_Showing top ${this.maxTableRows} of ${totalSize} results_`;
    }

    return response;
  }

  /**
   * Format activity check results
   */
  formatActivityCheck(records, parsedIntent, totalSize) {
    const totalAmount = records.reduce((sum, r) => sum + (r.Amount || 0), 0);
    const avgDaysStale = records.reduce((sum, r) => {
      if (r.LastActivityDate) {
        const daysAgo = Math.floor((Date.now() - new Date(r.LastActivityDate)) / (1000 * 60 * 60 * 24));
        return sum + daysAgo;
      }
      return sum + 30; // Default for null dates
    }, 0) / records.length;

    let response = `⚠️ *Activity Check*\n`;
    response += `${totalSize} deals need attention (${this.formatCurrency(totalAmount)} at risk)\n`;
    response += `Average days since last activity: ${Math.round(avgDaysStale)}\n\n`;

    // Group by owner to show who needs help
    const ownerBreakdown = this.analyzeByOwner(records);
    response += `*By Owner:*\n`;
    Object.entries(ownerBreakdown)
      .sort(([,a], [,b]) => b.amount - a.amount)
      .slice(0, 10)
      .forEach(([owner, data]) => {
        response += `• ${owner}: ${data.count} deals (${this.formatCurrency(data.amount)})\n`;
      });
    response += '\n';

    response += this.buildDealsTable(records.slice(0, 10), ['Name', 'Amount', 'StageName', 'LastActivityDate', 'Owner.Name']);

    return response;
  }

  /**
   * Format forecast view
   */
  formatForecastView(records, parsedIntent, totalSize) {
    const totalAmount = records.reduce((sum, r) => sum + (r.Amount || 0), 0);
    const weightedAmount = records.reduce((sum, r) => sum + (r.Finance_Weighted_ACV__c || 0), 0);

    // Group by forecast category
    const forecastBreakdown = {};
    records.forEach(record => {
      const category = record.ForecastCategory || 'Pipeline';
      if (!forecastBreakdown[category]) {
        forecastBreakdown[category] = { count: 0, amount: 0, weighted: 0 };
      }
      forecastBreakdown[category].count++;
      forecastBreakdown[category].amount += record.Amount || 0;
      forecastBreakdown[category].weighted += record.Finance_Weighted_ACV__c || 0;
    });

    let response = `📈 *Forecast View*\n`;
    response += `${totalSize} deals in forecast (${this.formatCurrency(totalAmount)})\n`;
    response += `Weighted forecast: ${this.formatCurrency(weightedAmount)}\n\n`;

    response += `*Forecast Categories:*\n`;
    ['Commit', 'Best Case', 'Pipeline', 'Omitted'].forEach(category => {
      const data = forecastBreakdown[category];
      if (data) {
        response += `• ${category}: ${data.count} deals (${this.formatCurrency(data.amount)})\n`;
      }
    });
    response += '\n';

    response += this.buildDealsTable(records.slice(0, this.maxTableRows));

    return response;
  }

  /**
   * Format trend analysis results
   */
  formatTrendAnalysis(records, parsedIntent, totalSize) {
    let response = `📉 *Trend Analysis*\n`;
    
    if (parsedIntent.entities.groupBy && parsedIntent.entities.groupBy.length > 0) {
      response += `Grouped by: ${parsedIntent.entities.groupBy.join(', ')}\n\n`;
      return this.formatAggregationResults(records, parsedIntent, totalSize);
    }

    // Default trend analysis
    const totalAmount = records.reduce((sum, r) => sum + (r.Amount || 0), 0);
    response += `${totalSize} records analyzed (${this.formatCurrency(totalAmount)})\n\n`;

    response += this.buildDealsTable(records.slice(0, this.maxTableRows));

    return response;
  }

  /**
   * Format aggregation results
   */
  formatAggregationResults(records, parsedIntent, totalSize) {
    let response = `📊 *Analysis Results*\n\n`;

    // Build aggregation table
    response += '```\n';
    
    const groupBy = parsedIntent.entities.groupBy[0]; // Primary group by field
    const headerMap = {
      'StageName': 'STAGE',
      'Owner.Name': 'OWNER',
      'Account.Industry': 'INDUSTRY',
      'Type': 'TYPE'
    };

    const header = headerMap[groupBy] || groupBy.toUpperCase();
    response += `${header.padEnd(25)} COUNT    TOTAL AMOUNT    AVG AMOUNT\n`;
    response += '─'.repeat(75) + '\n';

    records.forEach(record => {
      const groupValue = record[groupBy] || record[groupBy.split('.').pop()] || 'Unknown';
      const count = record.RecordCount || record.expr0 || 0;
      const totalAmount = record.TotalAmount || record.expr1 || 0;
      const avgAmount = count > 0 ? totalAmount / count : 0;

      response += [
        groupValue.toString().padEnd(25),
        count.toString().padStart(5),
        this.formatCurrency(totalAmount).padStart(15),
        this.formatCurrency(avgAmount).padStart(12)
      ].join(' ') + '\n';
    });

    response += '```\n';

    return response;
  }

  /**
   * Format no results message
   */
  formatNoResults(parsedIntent) {
    const filters = this.buildSearchContext(parsedIntent.entities);
    let message = `🔍 No results found`;
    
    if (filters) {
      message += ` for: ${filters}`;
    }

    message += '\n\n*Try:*\n';
    message += '• Expanding your date range\n';
    message += '• Removing some filters\n';
    message += '• Checking different stages\n';
    message += '• Using "all deals" instead of specific criteria';

    return message;
  }

  /**
   * Build deals table
   */
  buildDealsTable(records, columns = null) {
    if (!records || records.length === 0) return '';

    const defaultColumns = ['Name', 'Amount', 'StageName', 'CloseDate', 'Owner.Name'];
    const cols = columns || defaultColumns;

    let table = '```\n';
    
    // Header
    const headers = cols.map(col => {
      switch (col) {
        case 'Name': return 'DEAL NAME';
        case 'Amount': return 'AMOUNT';
        case 'StageName': return 'STAGE';
        case 'CloseDate': return 'CLOSE DATE';
        case 'Owner.Name': return 'OWNER';
        case 'LastActivityDate': return 'LAST ACTIVITY';
        case 'Account.Name': return 'ACCOUNT';
        default: return col.toUpperCase();
      }
    });

    const colWidths = [30, 12, 18, 12, 15]; // Adjust based on content
    table += headers.map((header, i) => header.padEnd(colWidths[i] || 15)).join(' ') + '\n';
    table += '─'.repeat(90) + '\n';

    // Rows
    records.slice(0, this.maxTableRows).forEach(record => {
      const row = cols.map((col, i) => {
        let value = '';
        
        switch (col) {
          case 'Name':
            value = (record.Name || 'Untitled').substring(0, 28);
            break;
          case 'Amount':
            value = this.formatCurrency(record.Amount || 0);
            break;
          case 'StageName':
            value = cleanStageName(record.StageName || 'No Stage').substring(0, 16);
            break;
          case 'CloseDate':
            // Show Target LOI Date for active deals, CloseDate for closed deals
            if (record.IsClosed) {
              value = this.formatDate(record.CloseDate);
            } else {
              value = this.formatDate(record.Target_LOI_Date__c);
            }
            break;
          case 'Owner.Name':
            value = (record.Owner?.Name || 'Unassigned').substring(0, 13);
            break;
          case 'LastActivityDate':
            value = this.formatDate(record.LastActivityDate);
            break;
          case 'Account.Name':
            value = (record.Account?.Name || 'No Account').substring(0, 13);
            break;
          default:
            value = (record[col] || '').toString().substring(0, 13);
        }

        return value.padEnd(colWidths[i] || 15);
      });

      table += row.join(' ') + '\n';
    });

    table += '```';
    return table;
  }

  /**
   * Analyze records by stage
   */
  analyzeByStage(records) {
    const breakdown = {};
    
    records.forEach(record => {
      const stage = record.StageName || 'Unknown';
      if (!breakdown[stage]) {
        breakdown[stage] = { count: 0, amount: 0 };
      }
      breakdown[stage].count++;
      breakdown[stage].amount += record.Amount || 0;
    });

    return breakdown;
  }

  /**
   * Analyze records by owner
   */
  analyzeByOwner(records) {
    const breakdown = {};
    
    records.forEach(record => {
      const owner = record.Owner?.Name || 'Unassigned';
      if (!breakdown[owner]) {
        breakdown[owner] = { count: 0, amount: 0 };
      }
      breakdown[owner].count++;
      breakdown[owner].amount += record.Amount || 0;
    });

    return breakdown;
  }

  /**
   * Build search context string
   */
  buildSearchContext(entities) {
    const context = [];

    if (entities.timeframe) {
      context.push(entities.timeframe.replace('_', ' '));
    }

    if (entities.stages && entities.stages.length > 0) {
      context.push(`stages: ${entities.stages.join(', ')}`);
    }

    if (entities.owners && entities.owners.length > 0) {
      context.push(`owners: ${entities.owners.join(', ')}`);
    }

    if (entities.segments && entities.segments.length > 0) {
      context.push(`segments: ${entities.segments.join(', ')}`);
    }

    if (entities.amountThreshold) {
      if (entities.amountThreshold.min) {
        context.push(`min amount: ${this.formatCurrency(entities.amountThreshold.min)}`);
      }
      if (entities.amountThreshold.max) {
        context.push(`max amount: ${this.formatCurrency(entities.amountThreshold.max)}`);
      }
    }

    return context.join(', ');
  }

  /**
   * Format currency
   */
  formatCurrency(amount) {
    if (!amount || amount === 0) return '$0';
    
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    } else {
      return `$${amount.toLocaleString()}`;
    }
  }

  /**
   * Format date
   */
  formatDate(dateString) {
    if (!dateString) return 'No date';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays > 0 && diffDays < 7) return `${diffDays}d ago`;
    if (diffDays > 0 && diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Generic results formatter
   */
  formatGenericResults(records, parsedIntent, totalSize) {
    const totalAmount = records.reduce((sum, r) => sum + (r.Amount || 0), 0);

    let response = `📋 *Results*\n`;
    response += `${totalSize} records found (${this.formatCurrency(totalAmount)})\n\n`;

    response += this.buildDealsTable(records.slice(0, this.maxTableRows));

    if (totalSize > this.maxTableRows) {
      response += `\n_Showing top ${this.maxTableRows} of ${totalSize} results_`;
    }

    return response;
  }
}

// Export singleton instance
const responseFormatter = new ResponseFormatter();

module.exports = {
  ResponseFormatter,
  responseFormatter,
  formatResponse: (queryResult, parsedIntent, conversationContext) => 
    responseFormatter.formatResponse(queryResult, parsedIntent, conversationContext)
};

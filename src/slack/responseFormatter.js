const logger = require('../utils/logger');
const { cleanStageName } = require('../utils/formatters');

class ResponseFormatter {
  constructor() {
    this.maxTableRows = 50; // Increased from 15 to show more results
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
   * Format pipeline summary - IMPROVED with compact organized view
   */
  formatPipelineSummary(records, parsedIntent, totalSize) {
    const totalAmount = records.reduce((sum, r) => sum + (r.Amount || 0), 0);
    const weightedAmount = records.reduce((sum, r) => sum + (r.Finance_Weighted_ACV__c || 0), 0);

    // Build header with key metrics
    let response = `*Pipeline Summary* (${totalSize} deals)\n\n`;
    response += `┌─────────────────────────────────────┐\n`;
    response += `│  Total Value:     ${this.formatCurrency(totalAmount).padStart(15)}  │\n`;
    response += `│  Weighted Value:  ${this.formatCurrency(weightedAmount).padStart(15)}  │\n`;
    response += `└─────────────────────────────────────┘\n\n`;

    // Stage summary bar
    const stageBreakdown = this.analyzeByStage(records);
    const stageOrder = ['Stage 0', 'Stage 1', 'Stage 2', 'Stage 3', 'Stage 4', 'Stage 5'];
    
    response += '*By Stage:*\n```\n';
    stageOrder.forEach(stagePrefix => {
      const matchingStage = Object.keys(stageBreakdown).find(s => s.includes(stagePrefix));
      if (matchingStage) {
        const data = stageBreakdown[matchingStage];
        const stageNum = stagePrefix.replace('Stage ', 'S');
        const bar = '█'.repeat(Math.min(20, Math.ceil(data.amount / totalAmount * 20)));
        response += `${stageNum}: ${data.count.toString().padStart(2)} deals  ${this.formatCurrency(data.amount).padStart(8)}  ${bar}\n`;
      }
    });
    response += '```\n';

    // Use grouped table for larger result sets
    if (totalSize > 20) {
      response += this.buildGroupedPipelineTable(records.slice(0, this.maxTableRows));
    } else {
      response += '\n*All Opportunities:*\n';
      response += this.buildDealsTable(records.slice(0, this.maxTableRows));
    }

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
    // Check if it's a non-existent product line
    if (parsedIntent.entities.productLine === 'LITIGATION_NOT_EXIST') {
      return `No Litigation product line exists in the system.\n\n*Available product lines:*\n• AI-Augmented Contracting\n• Augmented-M&A\n• Compliance\n• sigma\n• Cortex\n• Multiple`;
    }
    
    const filters = this.buildSearchContext(parsedIntent.entities);
    let message = `No results found`;
    
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
   * Build deals table - COMPACT TABLE FORMAT for scannable results
   * Uses monospace code block for proper alignment
   */
  buildDealsTable(records, columns = null) {
    if (!records || records.length === 0) return '';

    // Build compact, aligned table using code block
    let table = '```\n';
    
    // Header row
    table += 'ACCOUNT                      ACV        STAGE      OWNER           DATE\n';
    table += '─'.repeat(78) + '\n';
    
    records.forEach((record) => {
      const accountName = (record.Account?.Name || 'No Account').substring(0, 26).padEnd(26);
      const amount = this.formatCurrency(record.Amount || 0).padStart(10);
      const stage = this.shortStage(record.StageName).padEnd(10);
      const owner = this.shortName(record.Owner?.Name).padEnd(15);
      const targetDate = this.formatDate(record.IsClosed ? record.CloseDate : record.Target_LOI_Date__c).padEnd(10);
      
      table += `${accountName} ${amount}  ${stage} ${owner} ${targetDate}\n`;
    });
    
    table += '```';
    return table;
  }

  /**
   * Build grouped pipeline view - organized by stage
   */
  buildGroupedPipelineTable(records) {
    if (!records || records.length === 0) return '';

    // Group records by stage
    const byStage = {};
    records.forEach(record => {
      const stage = record.StageName || 'Unknown';
      if (!byStage[stage]) byStage[stage] = [];
      byStage[stage].push(record);
    });

    // Sort stages in order
    const stageOrder = ['Stage 0', 'Stage 1', 'Stage 2', 'Stage 3', 'Stage 4', 'Stage 5'];
    const sortedStages = Object.keys(byStage).sort((a, b) => {
      const aOrder = stageOrder.findIndex(s => a.includes(s));
      const bOrder = stageOrder.findIndex(s => b.includes(s));
      return aOrder - bOrder;
    });

    let output = '';
    
    sortedStages.forEach(stage => {
      const stageRecords = byStage[stage];
      const stageTotal = stageRecords.reduce((sum, r) => sum + (r.Amount || 0), 0);
      const cleanStage = cleanStageName(stage);
      
      output += `\n*${cleanStage}* (${stageRecords.length} deals, ${this.formatCurrency(stageTotal)})\n`;
      output += '```\n';
      
      // Sort by amount descending
      stageRecords.sort((a, b) => (b.Amount || 0) - (a.Amount || 0));
      
      stageRecords.slice(0, 15).forEach(record => {
        const account = (record.Account?.Name || 'Unknown').substring(0, 24).padEnd(24);
        const amount = this.formatCurrency(record.Amount || 0).padStart(10);
        const owner = this.shortName(record.Owner?.Name).padEnd(12);
        const date = this.formatDate(record.Target_LOI_Date__c || record.CloseDate);
        
        output += `${account} ${amount}  ${owner} ${date}\n`;
      });
      
      if (stageRecords.length > 15) {
        output += `... +${stageRecords.length - 15} more\n`;
      }
      
      output += '```';
    });

    return output;
  }

  /**
   * Shorten stage name for table display
   */
  shortStage(stageName) {
    if (!stageName) return 'N/A';
    const match = stageName.match(/Stage (\d)/);
    if (match) return `S${match[1]}`;
    if (stageName.includes('Won')) return 'Won';
    if (stageName.includes('Lost')) return 'Lost';
    return stageName.substring(0, 8);
  }

  /**
   * Shorten name to first name + last initial
   */
  shortName(fullName) {
    if (!fullName) return 'Unassigned';
    const parts = fullName.split(' ');
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[1][0]}.`;
    }
    return fullName.substring(0, 12);
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

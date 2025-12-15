const logger = require('../utils/logger');
const { cleanStageName } = require('../utils/formatters');

class ResponseFormatter {
  constructor() {
    this.maxDealsToShow = 10; // Show top 10 deals only for mobile-friendly view
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
   * Format pipeline summary - COMPACT MOBILE-FRIENDLY VIEW
   * Summary at top, then bullet list of top deals
   */
  formatPipelineSummary(records, parsedIntent, totalSize) {
    const totalAmount = records.reduce((sum, r) => sum + (r.ACV__c || 0), 0);
    const weightedAmount = records.reduce((sum, r) => sum + (r.Weighted_ACV__c || 0), 0);

    // Compact header
    let response = `*Pipeline Summary* (${totalSize} deals)\n`;
    response += `Total: *${this.formatCurrency(totalAmount)}* | Weighted: *${this.formatCurrency(weightedAmount)}*\n\n`;

    // Stage breakdown - one line each
    const stageBreakdown = this.analyzeByStage(records);
    const stageOrder = ['Stage 0', 'Stage 1', 'Stage 2', 'Stage 3', 'Stage 4', 'Stage 5'];
    
    response += '*By Stage:*\n';
    stageOrder.forEach(stagePrefix => {
      const matchingStage = Object.keys(stageBreakdown).find(s => s.includes(stagePrefix));
      if (matchingStage) {
        const data = stageBreakdown[matchingStage];
        const stageNum = stagePrefix.replace('Stage ', 'S');
        response += `• ${stageNum}: ${data.count} deals (${this.formatCurrency(data.amount)})\n`;
      }
    });

    // Top deals - compact single-line format
    response += `\n*Top ${Math.min(this.maxDealsToShow, totalSize)} Deals:*\n`;
    const sortedRecords = [...records].sort((a, b) => (b.ACV__c || 0) - (a.ACV__c || 0));
    
    sortedRecords.slice(0, this.maxDealsToShow).forEach((record, i) => {
      response += this.formatDealLine(record, i + 1);
    });

    if (totalSize > this.maxDealsToShow) {
      response += `\n_+${totalSize - this.maxDealsToShow} more deals_`;
    }

    return response;
  }

  /**
   * Format a single deal as one compact line
   * Format: "1. Account - $500K • S2 • Owner • Jan 31"
   */
  formatDealLine(record, index = null) {
    const account = record.Account?.Name || 'Unknown';
    const amount = this.formatCurrency(record.ACV__c || 0);
    const stage = this.shortStage(record.StageName);
    const owner = this.shortName(record.Owner?.Name);
    const date = this.formatDate(record.Target_LOI_Date__c || record.CloseDate);
    
    const prefix = index ? `${index}. ` : '• ';
    return `${prefix}*${account}* - ${amount} • ${stage} • ${owner} • ${date}\n`;
  }

  /**
   * Format deal lookup results - compact list
   */
  formatDealLookup(records, parsedIntent, totalSize) {
    const totalAmount = records.reduce((sum, r) => sum + (r.ACV__c || 0), 0);

    let response = `*Found ${totalSize} deals* (${this.formatCurrency(totalAmount)})\n\n`;

    const sortedRecords = [...records].sort((a, b) => (b.ACV__c || 0) - (a.ACV__c || 0));
    
    sortedRecords.slice(0, this.maxDealsToShow).forEach((record, i) => {
      response += this.formatDealLine(record, i + 1);
    });

    if (totalSize > this.maxDealsToShow) {
      response += `\n_+${totalSize - this.maxDealsToShow} more deals_`;
    }

    return response;
  }

  /**
   * Format activity check results - focused on stale deals
   */
  formatActivityCheck(records, parsedIntent, totalSize) {
    const totalAmount = records.reduce((sum, r) => sum + (r.ACV__c || 0), 0);

    let response = `*Stale Deals* (${totalSize} need attention)\n`;
    response += `At Risk: *${this.formatCurrency(totalAmount)}*\n\n`;

    // Group by owner
    const ownerBreakdown = this.analyzeByOwner(records);
    response += '*By Owner:*\n';
    Object.entries(ownerBreakdown)
      .sort(([,a], [,b]) => b.amount - a.amount)
      .slice(0, 5)
      .forEach(([owner, data]) => {
        response += `• ${owner}: ${data.count} deals (${this.formatCurrency(data.amount)})\n`;
      });

    // Top stale deals
    response += `\n*Top Stale Deals:*\n`;
    records.slice(0, this.maxDealsToShow).forEach((record, i) => {
      response += this.formatDealLine(record, i + 1);
    });

    return response;
  }

  /**
   * Format forecast view
   */
  formatForecastView(records, parsedIntent, totalSize) {
    const totalAmount = records.reduce((sum, r) => sum + (r.ACV__c || 0), 0);
    const weightedAmount = records.reduce((sum, r) => sum + (r.Weighted_ACV__c || 0), 0);

    let response = `*Forecast* (${totalSize} deals)\n`;
    response += `Gross: *${this.formatCurrency(totalAmount)}* | Weighted: *${this.formatCurrency(weightedAmount)}*\n\n`;

    // Top deals
    response += '*Top Deals:*\n';
    const sortedRecords = [...records].sort((a, b) => (b.ACV__c || 0) - (a.ACV__c || 0));
    sortedRecords.slice(0, this.maxDealsToShow).forEach((record, i) => {
      response += this.formatDealLine(record, i + 1);
    });

    if (totalSize > this.maxDealsToShow) {
      response += `\n_+${totalSize - this.maxDealsToShow} more_`;
    }

    return response;
  }

  /**
   * Format trend analysis results
   */
  formatTrendAnalysis(records, parsedIntent, totalSize) {
    let response = `*Analysis* (${totalSize} records)\n\n`;
    
    records.slice(0, this.maxDealsToShow).forEach((record, i) => {
      response += this.formatDealLine(record, i + 1);
    });

    return response;
  }

  /**
   * Format aggregation results
   */
  formatAggregationResults(records, parsedIntent, totalSize) {
    let response = `*Results by Group:*\n\n`;

    records.slice(0, 15).forEach(record => {
      const groupBy = parsedIntent.entities.groupBy[0];
      const groupValue = record[groupBy] || record[groupBy.split('.').pop()] || 'Unknown';
      const count = record.RecordCount || record.expr0 || 0;
      const totalAmount = record.TotalAmount || record.expr1 || 0;

      response += `• *${groupValue}*: ${count} deals (${this.formatCurrency(totalAmount)})\n`;
    });

    return response;
  }

  /**
   * Format no results message
   */
  formatNoResults(parsedIntent) {
    if (parsedIntent.entities.productLine === 'LITIGATION_NOT_EXIST') {
      return `No Litigation product line exists.\n\n*Available:* Contracting, M&A, Compliance, sigma, Cortex`;
    }
    
    return `No results found.\n\nTry:\n• "show me pipeline"\n• "late stage deals"\n• "who owns [company]"`;
  }

  /**
   * Generic results formatter
   */
  formatGenericResults(records, parsedIntent, totalSize) {
    const totalAmount = records.reduce((sum, r) => sum + (r.ACV__c || 0), 0);

    let response = `*Results* (${totalSize} records, ${this.formatCurrency(totalAmount)})\n\n`;

    const sortedRecords = [...records].sort((a, b) => (b.ACV__c || 0) - (a.ACV__c || 0));
    sortedRecords.slice(0, this.maxDealsToShow).forEach((record, i) => {
      response += this.formatDealLine(record, i + 1);
    });

    if (totalSize > this.maxDealsToShow) {
      response += `\n_+${totalSize - this.maxDealsToShow} more_`;
    }

    return response;
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
      breakdown[stage].amount += record.ACV__c || 0;
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
      breakdown[owner].amount += record.ACV__c || 0;
    });

    return breakdown;
  }

  /**
   * Shorten stage name: "Stage 2 - SQO" → "S2"
   */
  shortStage(stageName) {
    if (!stageName) return 'N/A';
    const match = stageName.match(/Stage (\d)/);
    if (match) return `S${match[1]}`;
    if (stageName.includes('Won')) return 'Won';
    if (stageName.includes('Lost')) return 'Lost';
    return stageName.substring(0, 6);
  }

  /**
   * Shorten name: "Julie Stefanich" → "Julie S."
   */
  shortName(fullName) {
    if (!fullName) return 'Unassigned';
    const parts = fullName.split(' ');
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[1][0]}.`;
    }
    return fullName;
  }

  /**
   * Format currency: 500000 → "$500K"
   */
  formatCurrency(amount) {
    if (!amount || amount === 0) return '$0';
    
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${Math.round(amount / 1000)}K`;
    } else {
      return `$${amount.toLocaleString()}`;
    }
  }

  /**
   * Format date: "2026-01-31" → "Jan 31"
   */
  formatDate(dateString) {
    if (!dateString) return 'No date';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
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

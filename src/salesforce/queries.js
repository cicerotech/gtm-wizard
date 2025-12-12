const { query } = require('./connection');
const logger = require('../utils/logger');
const businessLogic = require('../../data/business-logic.json');

class QueryBuilder {
  constructor() {
    this.businessLogic = businessLogic;
  }

  /**
   * Build a dynamic SOQL query based on entities and intent
   */
  buildOpportunityQuery(entities = {}) {
    let soql = 'SELECT ';
    
    // Base fields - always include
    const baseFields = [
      'Id',
      'Name', 
      'Amount',
      'ACV__c',
      'Weighted_ACV__c',
      'StageName',
      'CloseDate',
      'Target_LOI_Date__c',
      'Type',
      'Revenue_Type__c',
      'IsClosed',
      'IsWon',
      'Probability',
      'CreatedDate',
      'LastActivityDate',
      'Days_in_Stage__c',
      'Days_in_Stage1__c',
      'Week_Created__c',
      'NextStep',
      'Owner.Name',
      'Owner.Email',
      'AccountId',
      'Account.Name',
      'Account.Industry',
      'Product_Line__c'
    ];

    // Add conditional fields based on entities
    const fields = [...baseFields];
    
    if (entities.includeAccount) {
      fields.push(
        'Account.Website', 
        'Account.AnnualRevenue',
        'Account.Key_Decision_Makers__c',
        'Account.Legal_Department_Size__c',
        'Account.Pain_Points_Identified__c',
        'Account.Target_LOI_Sign_Date__c',
        'Account.Customer_Type__c',
        'Account.CLO_Engaged__c'
      );
    }

    if (entities.includeForecast) {
      fields.push('ForecastCategory');
    }

    soql += fields.join(', ');
    soql += ' FROM Opportunity';

    // Build WHERE clause
    const conditions = this.buildWhereConditions(entities);
    if (conditions.length > 0) {
      soql += ' WHERE ' + conditions.join(' AND ');
    }

    // Add GROUP BY if needed
    if (entities.groupBy && entities.groupBy.length > 0) {
      return this.buildAggregationQuery(entities);
    }

    // Add ORDER BY
    if (entities.sortBy) {
      soql += ` ORDER BY ${entities.sortBy.field} ${entities.sortBy.direction || 'DESC'}`;
    } else {
      // Default sorting
      soql += ' ORDER BY Amount DESC NULLS LAST';
    }

    // Add LIMIT
    const limit = entities.limit || process.env.MAX_RESULTS || 200;
    soql += ` LIMIT ${limit}`;

    return soql;
  }

  /**
   * Build WHERE conditions based on entities
   */
  buildWhereConditions(entities) {
    const conditions = [];

    // Closed/Open filter
    if (entities.isClosed !== undefined) {
      conditions.push(`IsClosed = ${entities.isClosed}`);
      
      if (entities.isClosed && entities.isWon !== undefined) {
        conditions.push(`IsWon = ${entities.isWon}`);
      }
    }

    // Time-based filters
    if (entities.timeframe) {
      // Use CloseDate for closed deals, Target_LOI_Date__c for pipeline
      const dateField = entities.isClosed ? 'CloseDate' : 'Target_LOI_Date__c';
      const timeFilter = this.buildTimeFilter(entities.timeframe, entities.customDateRange, dateField);
      if (timeFilter) conditions.push(timeFilter);
    }

    // LOI Date filter - ONLY use for PIPELINE queries, NOT closed deals
    if (entities.loiDate && !entities.isClosed) {
      // Pipeline LOIs use Target_LOI_Date__c
      const loiFilter = this.buildTimeFilter(entities.loiDate, null, 'Target_LOI_Date__c');
      if (loiFilter) conditions.push(loiFilter);
    } else if (entities.loiDate && entities.isClosed) {
      // Closed/Signed LOIs use CloseDate ONLY
      const loiFilter = this.buildTimeFilter(entities.loiDate, null, 'CloseDate');
      if (loiFilter) conditions.push(loiFilter);
    }

    // Target sign date filter (only for pipeline)
    if (entities.targetSignDate && !entities.isClosed) {
      const targetFilter = this.buildTimeFilter(entities.targetSignDate, null, 'Target_LOI_Date__c');
      if (targetFilter) conditions.push(targetFilter);
    }

    // Stage filters
    if (entities.stages && entities.stages.length > 0) {
      const stageList = entities.stages.map(s => `'${s}'`).join(',');
      conditions.push(`StageName IN (${stageList})`);
    }

    // Owner filters
    if (entities.owners && entities.owners.length > 0) {
      const ownerConditions = entities.owners.map(owner => {
        if (owner === 'current_user') {
          return `Owner.Name = '${entities.currentUser}'`;
        }
        return `Owner.Name LIKE '%${owner}%'`;
      });
      conditions.push(`(${ownerConditions.join(' OR ')})`);
    }

    // Account filters
    if (entities.accounts && entities.accounts.length > 0) {
      const accountConditions = entities.accounts.map(account => 
        `Account.Name LIKE '%${account}%'`
      );
      conditions.push(`(${accountConditions.join(' OR ')})`);
    }

    // Industry filter
    if (entities.industry) {
      conditions.push(`Account.Industry = '${entities.industry}'`);
    }

    // Amount thresholds
    if (entities.amountThreshold) {
      if (entities.amountThreshold.min) {
        conditions.push(`Amount >= ${entities.amountThreshold.min}`);
      }
      if (entities.amountThreshold.max) {
        conditions.push(`Amount <= ${entities.amountThreshold.max}`);
      }
    }

    // Segment filters (enterprise, mid-market, smb)
    if (entities.segments && entities.segments.length > 0) {
      const segmentConditions = entities.segments.map(segment => {
        const rule = this.businessLogic.segments[segment];
        return rule ? `(${rule.definition})` : null;
      }).filter(Boolean);
      
      if (segmentConditions.length > 0) {
        conditions.push(`(${segmentConditions.join(' OR ')})`);
      }
    }

    // Deal health filters
    if (entities.dealHealth) {
      const healthRule = this.businessLogic.deal_health[entities.dealHealth];
      if (healthRule) {
        conditions.push(`(${healthRule.definition})`);
      }
    }

    // Stale deals filter
    if (entities.staleDays) {
      conditions.push(`LastActivityDate < LAST_N_DAYS:${entities.staleDays}`);
      conditions.push('IsClosed = false');
    }

    // Days in stage filter
    if (entities.daysInStage) {
      conditions.push(`Days_in_Stage__c > ${entities.daysInStage}`);
    }

    // Type filter (New Business, Upsell, etc.)
    if (entities.type) {
      conditions.push(`Type = '${entities.type}'`);
    }

    // Deal type filters (bookings, ARR, etc.) - Use Revenue_Type__c field
    if (entities.dealType) {
      if (entities.dealType === 'bookings') {
        conditions.push("Revenue_Type__c = 'Booking'");
      } else if (entities.dealType === 'arr' || entities.dealType === 'recurring') {
        conditions.push("Revenue_Type__c = 'ARR'"); // Field value is "ARR" not "Recurring"
      }
    }

    // Revenue type filter
    if (entities.bookingType) {
      if (entities.bookingType === 'Booking') {
        conditions.push("Revenue_Type__c = 'Booking'");
      } else if (entities.bookingType === 'ARR' || entities.bookingType === 'Recurring') {
        conditions.push("Revenue_Type__c = 'ARR'"); // Field value is "ARR"
      }
    }

    // Created timeframe (for "deals added this week") - Use Week_Created__c
    if (entities.createdTimeframe) {
      if (entities.createdTimeframe === 'this_week') {
        // Calculate current week number
        const now = new Date();
        const weekNum = this.getWeekNumber(now);
        const year = now.getFullYear();
        const weekString = `Week ${weekNum} - ${year}`;
        conditions.push(`Week_Created__c = '${weekString}'`);
      } else {
        // Fallback to CreatedDate for other timeframes
        const createdFilter = this.buildTimeFilter(entities.createdTimeframe, null, 'CreatedDate');
        if (createdFilter) conditions.push(createdFilter);
      }
    }

    // New logo filter
    if (entities.isNewLogo !== undefined) {
      conditions.push(`Account.Is_New_Logo__c = ${entities.isNewLogo}`);
    }

    // Probability filters
    if (entities.probabilityMin) {
      conditions.push(`Probability >= ${entities.probabilityMin}`);
    }
    if (entities.probabilityMax) {
      conditions.push(`Probability <= ${entities.probabilityMax}`);
    }

    // Forecast category filter
    if (entities.forecastCategory && entities.forecastCategory.length > 0) {
      const fcList = entities.forecastCategory.map(fc => `'${fc}'`).join(',');
      conditions.push(`ForecastCategory IN (${fcList})`);
    }

    // Product line filter
    if (entities.productLine) {
      // Skip query if product line doesn't exist (handled in formatter)
      if (entities.productLine !== 'LITIGATION_NOT_EXIST') {
        if (Array.isArray(entities.productLine)) {
          const plList = entities.productLine.map(pl => `'${pl}'`).join(',');
          conditions.push(`Product_Line__c IN (${plList})`);
        } else {
          conditions.push(`Product_Line__c = '${entities.productLine}'`);
        }
      }
    }

    return conditions;
  }

  /**
   * Build time-based filters
   */
  buildTimeFilter(timeframe, customRange = null, fieldName = 'CloseDate') {
    const timeFilters = {
      today: `${fieldName} = TODAY`,
      yesterday: `${fieldName} = YESTERDAY`,
      this_week: `${fieldName} = THIS_WEEK`,
      last_week: `${fieldName} = LAST_WEEK`,
      this_month: `${fieldName} = THIS_MONTH`,
      last_month: `${fieldName} = LAST_MONTH`,
      this_quarter: `${fieldName} = THIS_QUARTER`,
      last_quarter: `${fieldName} = LAST_QUARTER`,
      this_year: `${fieldName} = THIS_YEAR`,
      last_year: `${fieldName} = LAST_YEAR`,
      next_7_days: `${fieldName} = NEXT_N_DAYS:7`,
      next_30_days: `${fieldName} = NEXT_N_DAYS:30`,
      last_14_days: `${fieldName} = LAST_N_DAYS:14`,
      last_30_days: `${fieldName} = LAST_N_DAYS:30`,
      last_60_days: `${fieldName} = LAST_N_DAYS:60`,
      last_90_days: `${fieldName} = LAST_N_DAYS:90`
    };

    if (timeframe === 'custom' && customRange) {
      return `${fieldName} >= ${customRange.start} AND ${fieldName} <= ${customRange.end}`;
    }

    return timeFilters[timeframe] || null;
  }

  /**
   * Build aggregation queries for analytics
   */
  buildAggregationQuery(entities) {
    const groupBy = entities.groupBy || [];
    const metrics = entities.metrics || ['count', 'sum_amount'];

    let soql = 'SELECT ';
    
    // Add GROUP BY fields
    const selectFields = [...groupBy];
    
    // Add aggregation functions
    if (metrics.includes('count')) {
      selectFields.push('COUNT(Id) RecordCount');
    }
    
    if (metrics.includes('sum_amount')) {
      selectFields.push('SUM(Amount) TotalAmount');
    }
    
    if (metrics.includes('avg_amount')) {
      selectFields.push('AVG(Amount) AverageAmount');
    }
    
    if (metrics.includes('sum_weighted')) {
      selectFields.push('SUM(Weighted_ACV__c) TotalWeighted');
    }

    if (metrics.includes('avg_days_in_stage')) {
      selectFields.push('AVG(Days_in_Stage__c) AvgDaysInStage');
    }

    soql += selectFields.join(', ');
    soql += ' FROM Opportunity';

    // Add WHERE conditions
    const conditions = this.buildWhereConditions(entities);
    if (conditions.length > 0) {
      soql += ' WHERE ' + conditions.join(' AND ');
    }

    // Add GROUP BY clause
    if (groupBy.length > 0) {
      soql += ' GROUP BY ' + groupBy.join(', ');
    }

    // Add ORDER BY
    if (entities.sortBy) {
      soql += ` ORDER BY ${entities.sortBy.field} ${entities.sortBy.direction || 'DESC'}`;
    } else {
      soql += ' ORDER BY SUM(Amount) DESC NULLS LAST';
    }

    // Add LIMIT
    const limit = entities.limit || 50; // Smaller limit for aggregations
    soql += ` LIMIT ${limit}`;

    return soql;
  }

  /**
   * Build account queries
   */
  buildAccountQuery(entities = {}) {
    let soql = 'SELECT Id, Name, Industry, Website, Domain, AnnualRevenue, ';
    soql += 'CLO_Engaged__c, CLO_Reports_to_CEO__c, Customer_Type__c, ';
    soql += 'Is_New_Logo__c, Owner.Name, CreatedDate, LastActivityDate ';
    soql += 'FROM Account';

    const conditions = [];

    // Account name filter
    if (entities.accountNames && entities.accountNames.length > 0) {
      const nameConditions = entities.accountNames.map(name => 
        `Name LIKE '%${name}%'`
      );
      conditions.push(`(${nameConditions.join(' OR ')})`);
    }

    // Industry filter
    if (entities.industry) {
      conditions.push(`Industry = '${entities.industry}'`);
    }

    // Revenue threshold
    if (entities.revenueThreshold) {
      conditions.push(`AnnualRevenue >= ${entities.revenueThreshold}`);
    }

    if (conditions.length > 0) {
      soql += ' WHERE ' + conditions.join(' AND ');
    }

    soql += ' ORDER BY Name';
    soql += ` LIMIT ${entities.limit || 100}`;

    return soql;
  }

  /**
   * Execute pre-built common queries
   */
  async getClosedDealsToday() {
    const soql = this.buildOpportunityQuery({
      timeframe: 'today',
      isClosed: true,
      isWon: true,
      sortBy: { field: 'Amount', direction: 'DESC' }
    });

    return await query(soql);
  }

  async getPipelineByStage() {
    const soql = this.buildAggregationQuery({
      isClosed: false,
      groupBy: ['StageName'],
      metrics: ['count', 'sum_amount', 'sum_weighted'],
      sortBy: { field: 'TotalAmount', direction: 'DESC' }
    });

    return await query(soql);
  }

  async getStaleDeals(days = 30) {
    const soql = this.buildOpportunityQuery({
      staleDays: days,
      sortBy: { field: 'LastActivityDate', direction: 'ASC' }
    });

    return await query(soql);
  }

  async getDealsClosingThisMonth() {
    const soql = this.buildOpportunityQuery({
      timeframe: 'this_month',
      isClosed: false,
      sortBy: { field: 'CloseDate', direction: 'ASC' }
    });

    return await query(soql);
  }

  async getTopDealsByAmount(limit = 10) {
    const soql = this.buildOpportunityQuery({
      isClosed: false,
      limit,
      sortBy: { field: 'Amount', direction: 'DESC' }
    });

    return await query(soql);
  }

  async getOwnerPipeline(ownerName) {
    const soql = this.buildOpportunityQuery({
      owners: [ownerName],
      isClosed: false,
      sortBy: { field: 'Amount', direction: 'DESC' }
    });

    return await query(soql);
  }

  async getWinRateByStage() {
    const wonSoql = this.buildAggregationQuery({
      isClosed: true,
      isWon: true,
      groupBy: ['StageName'],
      metrics: ['count']
    });

    const totalSoql = this.buildAggregationQuery({
      isClosed: true,
      groupBy: ['StageName'], 
      metrics: ['count']
    });

    const [wonResults, totalResults] = await Promise.all([
      query(wonSoql),
      query(totalSoql)
    ]);

    return { won: wonResults, total: totalResults };
  }

  /**
   * Calculate week number from date
   */
  getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }
}

// Export singleton instance
const queryBuilder = new QueryBuilder();

module.exports = {
  QueryBuilder,
  queryBuilder,
  
  // Convenience methods
  buildOpportunityQuery: (entities) => queryBuilder.buildOpportunityQuery(entities),
  buildAccountQuery: (entities) => queryBuilder.buildAccountQuery(entities),
  
  // Common queries
  getClosedDealsToday: () => queryBuilder.getClosedDealsToday(),
  getPipelineByStage: () => queryBuilder.getPipelineByStage(),
  getStaleDeals: (days) => queryBuilder.getStaleDeals(days),
  getDealsClosingThisMonth: () => queryBuilder.getDealsClosingThisMonth(),
  getTopDealsByAmount: (limit) => queryBuilder.getTopDealsByAmount(limit),
  getOwnerPipeline: (ownerName) => queryBuilder.getOwnerPipeline(ownerName),
  getWinRateByStage: () => queryBuilder.getWinRateByStage()
};

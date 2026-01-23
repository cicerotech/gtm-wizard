/**
 * BLMetricsCalculationService
 * 
 * Calculates and updates BL Performance Metrics for all active Business Leads.
 * Runs weekly via BLMetricsScheduler.
 * 
 * Metrics calculated:
 * - Total Closed Won ACV (all-time)
 * - Fiscal YTD ACV (since Feb 1 of current FY)
 * - Fiscal QTD ACV (current fiscal quarter)
 * - Time to Ramp (days from Start Date to hitting $2M milestone)
 * 
 * Eudia Fiscal Calendar:
 * - FY runs Feb 1 - Jan 31
 * - Q1: Feb-Apr, Q2: May-Jul, Q3: Aug-Oct, Q4: Nov-Jan
 * 
 * @author GTM Brain
 * @date January 2026
 */
public class BLMetricsCalculationService {
    
    // Closed Won stage names (includes legacy stage for comprehensive tracking)
    private static final Set<String> CLOSED_WON_STAGES = new Set<String>{
        'Stage 6. Closed(Won)',
        '6.) Closed-won'  // Legacy stage
    };
    
    /**
     * Main entry point - calculate metrics for all active BL records
     */
    public static void calculateAllMetrics() {
        // Query all active BL metrics records
        List<BL_Performance_Metrics__c> metrics = [
            SELECT Id, Business_Lead__c, Start_Date__c, Ramp_Milestone__c,
                   Ramp_Achieved_Date__c, Days_to_Ramp__c, Total_Closed_Won_ACV__c
            FROM BL_Performance_Metrics__c 
            WHERE Active__c = true
        ];
        
        if (metrics.isEmpty()) {
            System.debug('No active BL metrics records found. Exiting.');
            return;
        }
        
        // Collect all BL User IDs
        Set<Id> blIds = new Set<Id>();
        Map<Id, BL_Performance_Metrics__c> metricsByBLId = new Map<Id, BL_Performance_Metrics__c>();
        for (BL_Performance_Metrics__c m : metrics) {
            blIds.add(m.Business_Lead__c);
            metricsByBLId.put(m.Business_Lead__c, m);
        }
        
        // Get fiscal period boundaries
        Date fyStart = getFiscalYearStart();
        Date fqStart = getFiscalQuarterStart();
        
        System.debug('Fiscal Year Start: ' + fyStart);
        System.debug('Fiscal Quarter Start: ' + fqStart);
        
        // Initialize aggregation maps
        Map<Id, Decimal> totalAcvByBL = new Map<Id, Decimal>();
        Map<Id, Decimal> ytdAcvByBL = new Map<Id, Decimal>();
        Map<Id, Decimal> qtdAcvByBL = new Map<Id, Decimal>();
        
        // Initialize all BLs with 0
        for (Id blId : blIds) {
            totalAcvByBL.put(blId, 0);
            ytdAcvByBL.put(blId, 0);
            qtdAcvByBL.put(blId, 0);
        }
        
        // Query 1: Total Closed Won ACV (all-time)
        for (AggregateResult ar : [
            SELECT OwnerId, SUM(ACV__c) totalAcv
            FROM Opportunity
            WHERE OwnerId IN :blIds
            AND StageName IN :CLOSED_WON_STAGES
            GROUP BY OwnerId
        ]) {
            Id ownerId = (Id)ar.get('OwnerId');
            Decimal total = (Decimal)ar.get('totalAcv');
            totalAcvByBL.put(ownerId, total != null ? total : 0);
        }
        
        // Query 2: Fiscal YTD ACV (since Feb 1)
        for (AggregateResult ar : [
            SELECT OwnerId, SUM(ACV__c) ytdAcv
            FROM Opportunity
            WHERE OwnerId IN :blIds
            AND StageName IN :CLOSED_WON_STAGES
            AND CloseDate >= :fyStart
            GROUP BY OwnerId
        ]) {
            Id ownerId = (Id)ar.get('OwnerId');
            Decimal ytd = (Decimal)ar.get('ytdAcv');
            ytdAcvByBL.put(ownerId, ytd != null ? ytd : 0);
        }
        
        // Query 3: Fiscal QTD ACV (current quarter)
        for (AggregateResult ar : [
            SELECT OwnerId, SUM(ACV__c) qtdAcv
            FROM Opportunity
            WHERE OwnerId IN :blIds
            AND StageName IN :CLOSED_WON_STAGES
            AND CloseDate >= :fqStart
            GROUP BY OwnerId
        ]) {
            Id ownerId = (Id)ar.get('OwnerId');
            Decimal qtd = (Decimal)ar.get('qtdAcv');
            qtdAcvByBL.put(ownerId, qtd != null ? qtd : 0);
        }
        
        // Query 4: For BLs who haven't hit ramp yet, find the exact date they crossed milestone
        Map<Id, Date> rampDates = findRampAchievementDates(metricsByBLId, blIds);
        
        // Calculate months elapsed in fiscal year for productivity calc
        Integer monthsInFY = getMonthsElapsedInFiscalYear();
        
        // Update all metrics records
        for (BL_Performance_Metrics__c m : metrics) {
            Id blId = m.Business_Lead__c;
            
            // Update ACV totals
            m.Total_Closed_Won_ACV__c = totalAcvByBL.get(blId);
            m.Fiscal_YTD_ACV__c = ytdAcvByBL.get(blId);
            m.Fiscal_QTD_ACV__c = qtdAcvByBL.get(blId);
            m.Last_Calculated__c = DateTime.now();
            
            // Calculate average monthly productivity
            // YTD ACV / months elapsed in fiscal year
            if (m.Fiscal_YTD_ACV__c != null && monthsInFY > 0) {
                m.Avg_Monthly_Productivity__c = m.Fiscal_YTD_ACV__c / monthsInFY;
            } else {
                m.Avg_Monthly_Productivity__c = 0;
            }
            
            // Calculate ramp achievement if newly crossed threshold
            if (m.Ramp_Achieved_Date__c == null && m.Ramp_Milestone__c != null) {
                Decimal milestone = m.Ramp_Milestone__c;
                Decimal totalAcv = m.Total_Closed_Won_ACV__c;
                
                if (totalAcv >= milestone) {
                    // Use the exact date from our calculation, or today as fallback
                    Date achievedDate = rampDates.get(blId);
                    m.Ramp_Achieved_Date__c = achievedDate != null ? achievedDate : Date.today();
                    
                    // Calculate days to ramp
                    if (m.Start_Date__c != null) {
                        m.Days_to_Ramp__c = m.Start_Date__c.daysBetween(m.Ramp_Achieved_Date__c);
                    }
                    
                    System.debug('BL ' + blId + ' achieved ramp on ' + m.Ramp_Achieved_Date__c + 
                                 ' (' + m.Days_to_Ramp__c + ' days)');
                }
            }
        }
        
        // Bulk update
        update metrics;
        
        System.debug('Successfully updated ' + metrics.size() + ' BL metrics records.');
    }
    
    /**
     * Find the exact date each BL crossed their ramp milestone
     * Uses running total approach ordered by CloseDate
     */
    private static Map<Id, Date> findRampAchievementDates(
        Map<Id, BL_Performance_Metrics__c> metricsByBLId, 
        Set<Id> blIds
    ) {
        Map<Id, Date> rampDates = new Map<Id, Date>();
        
        // Only process BLs who haven't achieved ramp yet
        Set<Id> needsRampDate = new Set<Id>();
        Map<Id, Decimal> milestones = new Map<Id, Decimal>();
        
        for (Id blId : blIds) {
            BL_Performance_Metrics__c m = metricsByBLId.get(blId);
            if (m.Ramp_Achieved_Date__c == null && m.Ramp_Milestone__c != null) {
                needsRampDate.add(blId);
                milestones.put(blId, m.Ramp_Milestone__c);
            }
        }
        
        if (needsRampDate.isEmpty()) {
            return rampDates;
        }
        
        // Query all closed won opps for these BLs, ordered by CloseDate
        List<Opportunity> opps = [
            SELECT OwnerId, ACV__c, CloseDate
            FROM Opportunity
            WHERE OwnerId IN :needsRampDate
            AND StageName IN :CLOSED_WON_STAGES
            ORDER BY OwnerId, CloseDate ASC
        ];
        
        // Calculate running totals per BL
        Map<Id, Decimal> runningTotal = new Map<Id, Decimal>();
        for (Id blId : needsRampDate) {
            runningTotal.put(blId, 0);
        }
        
        for (Opportunity opp : opps) {
            Id blId = opp.OwnerId;
            
            // Skip if already found ramp date for this BL
            if (rampDates.containsKey(blId)) {
                continue;
            }
            
            Decimal current = runningTotal.get(blId);
            Decimal acv = opp.ACV__c != null ? opp.ACV__c : 0;
            current += acv;
            runningTotal.put(blId, current);
            
            // Check if this opp pushed them over the milestone
            Decimal milestone = milestones.get(blId);
            if (current >= milestone) {
                rampDates.put(blId, opp.CloseDate);
                System.debug('BL ' + blId + ' crossed $' + milestone + ' milestone on ' + opp.CloseDate);
            }
        }
        
        return rampDates;
    }
    
    /**
     * Get the start date of the current fiscal year
     * Eudia FY: Feb 1 - Jan 31
     */
    public static Date getFiscalYearStart() {
        Date today = Date.today();
        Integer year = today.year();
        Integer month = today.month();
        
        // If we're in January, FY started Feb 1 of previous year
        if (month == 1) {
            return Date.newInstance(year - 1, 2, 1);
        }
        // Otherwise, FY started Feb 1 of current year
        return Date.newInstance(year, 2, 1);
    }
    
    /**
     * Get the start date of the current fiscal quarter
     * Q1: Feb-Apr, Q2: May-Jul, Q3: Aug-Oct, Q4: Nov-Jan
     */
    public static Date getFiscalQuarterStart() {
        Date today = Date.today();
        Integer year = today.year();
        Integer month = today.month();
        
        if (month >= 2 && month <= 4) {
            // Q1: Feb 1
            return Date.newInstance(year, 2, 1);
        } else if (month >= 5 && month <= 7) {
            // Q2: May 1
            return Date.newInstance(year, 5, 1);
        } else if (month >= 8 && month <= 10) {
            // Q3: Aug 1
            return Date.newInstance(year, 8, 1);
        } else if (month >= 11) {
            // Q4: Nov 1 (same year)
            return Date.newInstance(year, 11, 1);
        } else {
            // January: Q4 started Nov 1 of previous year
            return Date.newInstance(year - 1, 11, 1);
        }
    }
    
    /**
     * Get number of months elapsed in the current fiscal year
     * Used for calculating average monthly productivity
     */
    public static Integer getMonthsElapsedInFiscalYear() {
        Date today = Date.today();
        Date fyStart = getFiscalYearStart();
        
        // Calculate months between FY start and today
        Integer monthsElapsed = 0;
        
        if (today.year() == fyStart.year()) {
            monthsElapsed = today.month() - fyStart.month() + 1;
        } else {
            // Spans year boundary (e.g., FY started Feb 2025, now Jan 2026)
            monthsElapsed = (12 - fyStart.month() + 1) + today.month();
        }
        
        return Math.max(monthsElapsed, 1); // At least 1 month
    }
}


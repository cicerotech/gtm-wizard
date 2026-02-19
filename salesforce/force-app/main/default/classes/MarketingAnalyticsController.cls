/**
 * MarketingAnalyticsController
 *
 * Data queries and aggregation for the Marketing Analytics Center LWC.
 * Four tabs: Campaign Overview, Event ROI, Pipeline Attribution, Lead Flow.
 *
 * @author GTM Brain
 * @date February 2026
 */
public with sharing class MarketingAnalyticsController {

    // ══════════════════════════════════════════════════════════════
    // TAB 1: CAMPAIGN OVERVIEW
    // ══════════════════════════════════════════════════════════════

    @AuraEnabled(cacheable=true)
    public static CampaignOverview getCampaignOverview() {
        CampaignOverview ov = new CampaignOverview();

        List<Campaign> camps = [
            SELECT Id, Name, Type, Type__c, Event_Type__c, Fiscal_Year__c,
                   Status, Funnel_Stage__c, Content_Type__c,
                   Target_Industry__c, Event_City__c, Event_Region__c,
                   StartDate, EndDate, BudgetedCost, ActualCost, Projected_Spend__c,
                   NumberOfLeads, NumberOfContacts, NumberOfResponses,
                   NumberOfOpportunities, AmountAllOpportunities,
                   NumberOfWonOpportunities, AmountWonOpportunities,
                   Number_of_Attendees__c, Campaign_Cost__c,
                   Cost_Per_Lead__c, ROI__c, Location__c,
                   IsActive, CreatedDate
            FROM Campaign
            ORDER BY StartDate DESC NULLS LAST
            LIMIT 200
        ];

        ov.totalCampaigns = camps.size();
        ov.campaigns = new List<CampaignRow>();

        Decimal totalSpend = 0, totalLeads = 0, totalPipeline = 0;
        Decimal totalWonRevenue = 0, roiSum = 0;
        Integer roiCount = 0, activeCampaigns = 0;

        for (Campaign c : camps) {
            CampaignRow row = new CampaignRow();
            row.id = c.Id;
            row.name = c.Name;
            row.campaignType = c.Type__c != null ? c.Type__c : c.Type;
            row.eventType = c.Event_Type__c;
            row.fiscalYear = c.Fiscal_Year__c;
            row.projectedSpend = c.Projected_Spend__c;
            row.budgetedCost = c.BudgetedCost;
            row.status = c.Status;
            row.funnelStage = c.Funnel_Stage__c;
            row.contentType = c.Content_Type__c;
            row.targetIndustry = c.Target_Industry__c;
            row.eventCity = c.Event_City__c;
            row.eventRegion = c.Event_Region__c;
            row.startDate = c.StartDate;
            row.endDate = c.EndDate;
            row.spend = c.ActualCost != null ? c.ActualCost : (c.BudgetedCost != null ? c.BudgetedCost : 0);
            row.leads = c.NumberOfLeads != null ? c.NumberOfLeads : 0;
            row.contacts = c.NumberOfContacts != null ? c.NumberOfContacts : 0;
            row.responses = c.NumberOfResponses != null ? c.NumberOfResponses : 0;
            row.pipelineInfluenced = c.AmountAllOpportunities != null ? c.AmountAllOpportunities : 0;
            row.wonRevenue = c.AmountWonOpportunities != null ? c.AmountWonOpportunities : 0;
            row.oppsInfluenced = c.NumberOfOpportunities != null ? c.NumberOfOpportunities : 0;
            row.attendees = c.Number_of_Attendees__c != null ? Integer.valueOf(c.Number_of_Attendees__c) : 0;
            // ROI: only show when there's actual won revenue, otherwise null (not -100%)
            row.roi = (c.AmountWonOpportunities != null && c.AmountWonOpportunities > 0) ? c.ROI__c : null;
            row.costPerLead = c.Cost_Per_Lead__c;
            row.isActive = c.IsActive;

            ov.campaigns.add(row);

            totalSpend += row.spend;
            totalLeads += row.leads;
            totalPipeline += row.pipelineInfluenced;
            totalWonRevenue += row.wonRevenue;
            // Only include ROI in average when there's actual won revenue
            if (row.roi != null) { roiSum += row.roi; roiCount++; }
            if (c.Status == 'In Progress' || c.Status == 'Planned') activeCampaigns++;
        }

        ov.activeCampaigns = activeCampaigns;
        ov.totalSpend = totalSpend;
        ov.totalLeads = Integer.valueOf(totalLeads);
        ov.totalPipeline = totalPipeline;
        ov.totalWonRevenue = totalWonRevenue;
        ov.avgRoi = roiCount > 0 ? roiSum / roiCount : null;
        ov.avgCostPerLead = totalLeads > 0 ? totalSpend / totalLeads : null;

        ov.byType = groupCampaigns(camps, 'type');
        ov.byFunnel = groupCampaigns(camps, 'funnel');
        ov.byEventType = groupCampaigns(camps, 'eventType');
        ov.byFiscalYear = groupCampaigns(camps, 'fiscalYear');

        return ov;
    }

    private static List<GroupedMetric> groupCampaigns(List<Campaign> camps, String groupBy) {
        Map<String, GroupedMetric> groups = new Map<String, GroupedMetric>();

        for (Campaign c : camps) {
            String key;
            if (groupBy == 'type') {
                key = c.Type__c != null ? c.Type__c : (c.Type != null ? c.Type : 'Uncategorized');
            } else if (groupBy == 'eventType') {
                key = c.Event_Type__c != null ? c.Event_Type__c : 'Not Categorized';
            } else if (groupBy == 'fiscalYear') {
                key = c.Fiscal_Year__c != null ? c.Fiscal_Year__c : 'No FY';
            } else if (groupBy == 'funnel') {
                key = c.Funnel_Stage__c != null ? c.Funnel_Stage__c : 'Not Set';
            } else if (groupBy == 'city') {
                key = c.Event_City__c != null ? c.Event_City__c : (c.Location__c != null ? c.Location__c : 'No City');
            } else if (groupBy == 'region') {
                key = c.Event_Region__c != null ? c.Event_Region__c : 'No Region';
            } else if (groupBy == 'content') {
                key = c.Content_Type__c != null ? c.Content_Type__c : 'Not Set';
            } else {
                key = 'All';
            }

            GroupedMetric gm = groups.get(key);
            if (gm == null) {
                gm = new GroupedMetric();
                gm.label = key;
                gm.count = 0;
                gm.spend = 0;
                gm.leads = 0;
                gm.pipeline = 0;
                gm.wonRevenue = 0;
                gm.attendees = 0;
                groups.put(key, gm);
            }
            gm.count++;
            gm.spend += c.ActualCost != null ? c.ActualCost : (c.BudgetedCost != null ? c.BudgetedCost : 0);
            gm.leads += c.NumberOfLeads != null ? c.NumberOfLeads : 0;
            gm.pipeline += c.AmountAllOpportunities != null ? c.AmountAllOpportunities : 0;
            gm.wonRevenue += c.AmountWonOpportunities != null ? c.AmountWonOpportunities : 0;
            gm.attendees += c.Number_of_Attendees__c != null ? Integer.valueOf(c.Number_of_Attendees__c) : 0;
        }

        // Compute derived metrics
        List<GroupedMetric> result = groups.values();
        for (GroupedMetric gm : result) {
            gm.avgRoi = (gm.spend > 0 && gm.wonRevenue > 0) ? ((gm.wonRevenue - gm.spend) / gm.spend * 100) : null;
            gm.costPerLead = gm.leads > 0 ? gm.spend / gm.leads : null;
            gm.costPerAttendee = gm.attendees > 0 ? gm.spend / gm.attendees : null;
            gm.pipelinePerEvent = gm.count > 0 ? gm.pipeline / gm.count : null;
        }
        return result;
    }

    // ══════════════════════════════════════════════════════════════
    // TAB 2: EVENT ROI
    // ══════════════════════════════════════════════════════════════

    @AuraEnabled(cacheable=true)
    public static EventPerformance getEventPerformance() {
        List<Campaign> events = [
            SELECT Id, Name, Type, Type__c, Event_Type__c, Fiscal_Year__c,
                   Status, Content_Type__c,
                   Event_City__c, Event_Region__c, StartDate,
                   BudgetedCost, ActualCost, Projected_Spend__c, Number_of_Attendees__c,
                   NumberOfLeads, NumberOfOpportunities, AmountAllOpportunities,
                   AmountWonOpportunities, ROI__c, Cost_Per_Lead__c, Location__c
            FROM Campaign
            WHERE Event_Type__c != null
               OR Type = 'Event'
               OR Content_Type__c IN ('Event / Dinner', 'Conference Booth', 'Roundtable', 'Webinar')
            ORDER BY StartDate DESC NULLS LAST
            LIMIT 100
        ];

        EventPerformance ep = new EventPerformance();
        ep.totalEvents = events.size();
        ep.totalSpend = 0;
        ep.totalAttendees = 0;
        ep.totalPipeline = 0;
        ep.events = new List<CampaignRow>();

        for (Campaign c : events) {
            CampaignRow row = new CampaignRow();
            row.id = c.Id;
            row.name = c.Name;
            row.campaignType = c.Content_Type__c != null ? c.Content_Type__c : c.Type;
            row.status = c.Status;
            row.eventCity = c.Event_City__c;
            row.eventRegion = c.Event_Region__c;
            row.startDate = c.StartDate;
            row.spend = c.ActualCost != null ? c.ActualCost : (c.BudgetedCost != null ? c.BudgetedCost : 0);
            row.attendees = c.Number_of_Attendees__c != null ? Integer.valueOf(c.Number_of_Attendees__c) : 0;
            row.leads = c.NumberOfLeads != null ? c.NumberOfLeads : 0;
            row.pipelineInfluenced = c.AmountAllOpportunities != null ? c.AmountAllOpportunities : 0;
            row.wonRevenue = c.AmountWonOpportunities != null ? c.AmountWonOpportunities : 0;
            row.roi = c.ROI__c;
            ep.events.add(row);

            ep.totalSpend += row.spend;
            ep.totalAttendees += row.attendees;
            ep.totalPipeline += row.pipelineInfluenced;
        }

        ep.costPerAttendee = ep.totalAttendees > 0 ? ep.totalSpend / ep.totalAttendees : null;
        ep.pipelinePerEvent = ep.totalEvents > 0 ? ep.totalPipeline / ep.totalEvents : null;

        ep.byCity = groupCampaigns(events, 'city');
        ep.byRegion = groupCampaigns(events, 'region');
        ep.byContentType = groupCampaigns(events, 'content');
        ep.byEventType = groupCampaigns(events, 'eventType');

        return ep;
    }

    // ══════════════════════════════════════════════════════════════
    // TAB 3: PIPELINE ATTRIBUTION
    // ══════════════════════════════════════════════════════════════

    @AuraEnabled(cacheable=true)
    public static AttributionData getPipelineAttribution() {
        AttributionData ad = new AttributionData();
        ad.topCampaigns = new List<AttributionRow>();

        // Query CampaignInfluence for attribution data
        try {
            List<AggregateResult> results = [
                SELECT CampaignId, Campaign.Name, Campaign.Type__c,
                       COUNT(OpportunityId) oppCount,
                       SUM(Opportunity.Amount) totalAmount
                FROM CampaignInfluence
                WHERE Opportunity.IsClosed = false
                GROUP BY CampaignId, Campaign.Name, Campaign.Type__c
                ORDER BY SUM(Opportunity.Amount) DESC NULLS LAST
                LIMIT 20
            ];

            ad.totalAttributedPipeline = 0;
            ad.campaignsWithAttribution = results.size();

            for (AggregateResult ar : results) {
                AttributionRow row = new AttributionRow();
                row.campaignId = (Id) ar.get('CampaignId');
                row.campaignName = (String) ar.get('Name');
                row.campaignType = (String) ar.get('Type__c');
                row.oppsInfluenced = (Integer) ar.get('oppCount');
                row.pipelineValue = ar.get('totalAmount') != null ? (Decimal) ar.get('totalAmount') : 0;
                ad.topCampaigns.add(row);
                ad.totalAttributedPipeline += row.pipelineValue;
            }

            // Won revenue attribution
            List<AggregateResult> wonResults = [
                SELECT SUM(Opportunity.Amount) totalWon
                FROM CampaignInfluence
                WHERE Opportunity.IsWon = true
                  AND Opportunity.CloseDate = THIS_FISCAL_YEAR
            ];
            ad.totalAttributedWon = wonResults.isEmpty() || wonResults[0].get('totalWon') == null
                ? 0 : (Decimal) wonResults[0].get('totalWon');

        } catch (Exception e) {
            ad.error = 'CampaignInfluence data not available: ' + e.getMessage();
            ad.totalAttributedPipeline = 0;
            ad.totalAttributedWon = 0;
            ad.campaignsWithAttribution = 0;
        }

        // Unattributed pipeline
        try {
            Integer totalOpenOpps = [SELECT COUNT() FROM Opportunity WHERE IsClosed = false];
            Integer attributedOpps = [SELECT COUNT() FROM Opportunity WHERE IsClosed = false AND Id IN (SELECT OpportunityId FROM CampaignInfluence)];
            ad.totalOpenOpps = totalOpenOpps;
            ad.attributedOpps = attributedOpps;
            ad.coveragePercent = totalOpenOpps > 0 ? (Decimal.valueOf(attributedOpps) / totalOpenOpps * 100).setScale(1) : 0;
        } catch (Exception e) {
            ad.totalOpenOpps = 0;
            ad.attributedOpps = 0;
            ad.coveragePercent = 0;
        }

        return ad;
    }

    // ══════════════════════════════════════════════════════════════
    // TAB 4: LEAD FLOW
    // ══════════════════════════════════════════════════════════════

    @AuraEnabled(cacheable=true)
    public static LeadFlowData getLeadFlow() {
        LeadFlowData lf = new LeadFlowData();

        // Leads this quarter
        List<AggregateResult> leadCount = [
            SELECT COUNT(Id) cnt FROM Lead WHERE CreatedDate = THIS_FISCAL_QUARTER
        ];
        lf.totalLeadsThisQuarter = leadCount.isEmpty() ? 0 : (Integer) leadCount[0].get('cnt');

        // Converted leads this quarter
        List<AggregateResult> convertedCount = [
            SELECT COUNT(Id) cnt FROM Lead WHERE IsConverted = true AND ConvertedDate = THIS_FISCAL_QUARTER
        ];
        lf.convertedLeads = convertedCount.isEmpty() ? 0 : (Integer) convertedCount[0].get('cnt');
        lf.conversionRate = lf.totalLeadsThisQuarter > 0
            ? (Decimal.valueOf(lf.convertedLeads) / lf.totalLeadsThisQuarter * 100).setScale(1) : 0;

        // Leads by source
        lf.bySource = new List<GroupedMetric>();
        List<AggregateResult> sourceResults = [
            SELECT LeadSource, COUNT(Id) cnt
            FROM Lead
            WHERE CreatedDate = THIS_FISCAL_QUARTER AND LeadSource != null
            GROUP BY LeadSource
            ORDER BY COUNT(Id) DESC
        ];
        for (AggregateResult ar : sourceResults) {
            GroupedMetric gm = new GroupedMetric();
            gm.label = (String) ar.get('LeadSource');
            gm.count = (Integer) ar.get('cnt');
            lf.bySource.add(gm);
        }

        // Leads by campaign (via CampaignMember)
        lf.byCampaign = new List<GroupedMetric>();
        try {
            List<AggregateResult> campResults = [
                SELECT Campaign.Name campName, COUNT(LeadId) cnt
                FROM CampaignMember
                WHERE LeadId != null AND CreatedDate = THIS_FISCAL_QUARTER
                GROUP BY Campaign.Name
                ORDER BY COUNT(LeadId) DESC
                LIMIT 15
            ];
            for (AggregateResult ar : campResults) {
                GroupedMetric gm = new GroupedMetric();
                gm.label = (String) ar.get('campName');
                gm.count = (Integer) ar.get('cnt');
                lf.byCampaign.add(gm);
            }
        } catch (Exception e) {
            // CampaignMember may not be accessible
        }

        // Recent leads
        lf.recentLeads = new List<LeadRow>();
        List<Lead> recent = [
            SELECT Id, Name, Company, LeadSource, Status, Industry, CreatedDate
            FROM Lead
            WHERE CreatedDate = THIS_FISCAL_QUARTER
            ORDER BY CreatedDate DESC
            LIMIT 20
        ];
        for (Lead l : recent) {
            LeadRow lr = new LeadRow();
            lr.id = l.Id;
            lr.name = l.Name;
            lr.company = l.Company;
            lr.source = l.LeadSource;
            lr.status = l.Status;
            lr.industry = l.Industry;
            lr.createdDate = l.CreatedDate;
            lf.recentLeads.add(lr);
        }

        return lf;
    }

    // ══════════════════════════════════════════════════════════════
    // PROACTIVE INSIGHTS
    // ══════════════════════════════════════════════════════════════

    @AuraEnabled(cacheable=true)
    public static List<InsightCard> getInsights() {
        List<InsightCard> insights = new List<InsightCard>();

        // Events with spend but no pipeline
        Integer noAttrEvents = [
            SELECT COUNT() FROM Campaign
            WHERE (Type = 'Event' OR Content_Type__c IN ('Event / Dinner', 'Conference Booth', 'Roundtable'))
              AND ActualCost > 0
              AND NumberOfOpportunities = 0
        ];
        if (noAttrEvents > 0) {
            InsightCard ic = new InsightCard();
            ic.severity = 'warning';
            ic.title = noAttrEvents + ' events have spend but no pipeline attribution';
            ic.detail = 'Check CampaignMember tracking for these events. Pipeline may not be linked.';
            insights.add(ic);
        }

        // Coverage gap
        try {
            Integer totalOpen = [SELECT COUNT() FROM Opportunity WHERE IsClosed = false];
            Integer attributed = [SELECT COUNT() FROM Opportunity WHERE IsClosed = false AND Id IN (SELECT OpportunityId FROM CampaignInfluence)];
            if (totalOpen > 0) {
                Integer gapPercent = 100 - (attributed * 100 / totalOpen);
                if (gapPercent > 30) {
                    InsightCard ic = new InsightCard();
                    ic.severity = 'info';
                    ic.title = gapPercent + '% of open pipeline has no campaign attribution';
                    ic.detail = 'Marketing coverage gap. Consider ABM campaigns for unattributed accounts.';
                    insights.add(ic);
                }
            }
        } catch (Exception e) { /* skip */ }

        // Best performing campaign type
        List<AggregateResult> typePerf = [
            SELECT Type__c, SUM(AmountAllOpportunities) totalPip
            FROM Campaign
            WHERE Type__c != null AND AmountAllOpportunities > 0
            GROUP BY Type__c
            ORDER BY SUM(AmountAllOpportunities) DESC
            LIMIT 1
        ];
        if (!typePerf.isEmpty()) {
            String topType = (String) typePerf[0].get('Type__c');
            Decimal topPip = (Decimal) typePerf[0].get('totalPip');
            if (topPip != null && topPip > 0) {
                InsightCard ic = new InsightCard();
                ic.severity = 'success';
                ic.title = topType + ' campaigns drive the most pipeline';
                ic.detail = '$' + topPip.setScale(0).format() + ' total influenced pipeline. Consider investing more here.';
                insights.add(ic);
            }
        }

        // Campaigns planned but not started
        Integer planned = [SELECT COUNT() FROM Campaign WHERE Status = 'Planned' AND StartDate <= TODAY];
        if (planned > 0) {
            InsightCard ic = new InsightCard();
            ic.severity = 'warning';
            ic.title = planned + ' campaigns are past their start date but still "Planned"';
            ic.detail = 'Update their status to "In Progress" or adjust start dates.';
            insights.add(ic);
        }

        return insights;
    }

    // ══════════════════════════════════════════════════════════════
    // EVENT BUDGET SUMMARY — Budget vs Actual by Event Type + FY
    // ══════════════════════════════════════════════════════════════

    @AuraEnabled(cacheable=true)
    public static EventBudgetSummary getEventBudgetSummary() {
        EventBudgetSummary summary = new EventBudgetSummary();
        summary.rows = new List<BudgetRow>();

        List<AggregateResult> results = [
            SELECT Event_Type__c eventType, Fiscal_Year__c fiscalYear,
                   COUNT(Id) eventCount,
                   SUM(BudgetedCost) totalBudgeted,
                   SUM(ActualCost) totalActual,
                   SUM(Projected_Spend__c) totalProjected,
                   SUM(AmountAllOpportunities) totalPipeline,
                   SUM(AmountWonOpportunities) totalWonRevenue,
                   SUM(NumberOfOpportunities) totalOpps
            FROM Campaign
            WHERE Event_Type__c != null
            GROUP BY Event_Type__c, Fiscal_Year__c
            ORDER BY Fiscal_Year__c DESC, Event_Type__c ASC
        ];

        summary.grandTotalBudgeted = 0;
        summary.grandTotalActual = 0;
        summary.grandTotalPipeline = 0;
        summary.grandTotalWon = 0;

        for (AggregateResult ar : results) {
            BudgetRow row = new BudgetRow();
            row.eventType = (String) ar.get('eventType');
            row.fiscalYear = (String) ar.get('fiscalYear');
            row.eventCount = ar.get('eventCount') != null ? ((Decimal) ar.get('eventCount')).intValue() : 0;
            row.budgeted = ar.get('totalBudgeted') != null ? (Decimal) ar.get('totalBudgeted') : 0;
            row.actual = ar.get('totalActual') != null ? (Decimal) ar.get('totalActual') : 0;
            row.projected = ar.get('totalProjected') != null ? (Decimal) ar.get('totalProjected') : 0;
            row.pipeline = ar.get('totalPipeline') != null ? (Decimal) ar.get('totalPipeline') : 0;
            row.wonRevenue = ar.get('totalWonRevenue') != null ? (Decimal) ar.get('totalWonRevenue') : 0;
            row.opps = ar.get('totalOpps') != null ? ((Decimal) ar.get('totalOpps')).intValue() : 0;
            row.variance = row.budgeted - row.actual;
            row.roi = (row.actual > 0 && row.wonRevenue > 0) ? ((row.wonRevenue - row.actual) / row.actual * 100).setScale(1) : null;
            summary.rows.add(row);

            summary.grandTotalBudgeted += row.budgeted;
            summary.grandTotalActual += row.actual;
            summary.grandTotalPipeline += row.pipeline;
            summary.grandTotalWon += row.wonRevenue;
        }

        summary.grandVariance = summary.grandTotalBudgeted - summary.grandTotalActual;
        summary.grandRoi = (summary.grandTotalActual > 0 && summary.grandTotalWon > 0)
            ? ((summary.grandTotalWon - summary.grandTotalActual) / summary.grandTotalActual * 100).setScale(1) : null;

        return summary;
    }

    // ══════════════════════════════════════════════════════════════
    // WRAPPER CLASSES
    // ══════════════════════════════════════════════════════════════

    public class CampaignOverview {
        @AuraEnabled public Integer totalCampaigns;
        @AuraEnabled public Integer activeCampaigns;
        @AuraEnabled public Decimal totalSpend;
        @AuraEnabled public Integer totalLeads;
        @AuraEnabled public Decimal totalPipeline;
        @AuraEnabled public Decimal totalWonRevenue;
        @AuraEnabled public Decimal avgRoi;
        @AuraEnabled public Decimal avgCostPerLead;
        @AuraEnabled public List<CampaignRow> campaigns;
        @AuraEnabled public List<GroupedMetric> byType;
        @AuraEnabled public List<GroupedMetric> byFunnel;
        @AuraEnabled public List<GroupedMetric> byEventType;
        @AuraEnabled public List<GroupedMetric> byFiscalYear;
    }

    public class EventPerformance {
        @AuraEnabled public Integer totalEvents;
        @AuraEnabled public Decimal totalSpend;
        @AuraEnabled public Integer totalAttendees;
        @AuraEnabled public Decimal totalPipeline;
        @AuraEnabled public Decimal costPerAttendee;
        @AuraEnabled public Decimal pipelinePerEvent;
        @AuraEnabled public List<CampaignRow> events;
        @AuraEnabled public List<GroupedMetric> byCity;
        @AuraEnabled public List<GroupedMetric> byRegion;
        @AuraEnabled public List<GroupedMetric> byContentType;
        @AuraEnabled public List<GroupedMetric> byEventType;
    }

    public class AttributionData {
        @AuraEnabled public Integer campaignsWithAttribution;
        @AuraEnabled public Decimal totalAttributedPipeline;
        @AuraEnabled public Decimal totalAttributedWon;
        @AuraEnabled public Integer totalOpenOpps;
        @AuraEnabled public Integer attributedOpps;
        @AuraEnabled public Decimal coveragePercent;
        @AuraEnabled public String error;
        @AuraEnabled public List<AttributionRow> topCampaigns;
    }

    public class LeadFlowData {
        @AuraEnabled public Integer totalLeadsThisQuarter;
        @AuraEnabled public Integer convertedLeads;
        @AuraEnabled public Decimal conversionRate;
        @AuraEnabled public List<GroupedMetric> bySource;
        @AuraEnabled public List<GroupedMetric> byCampaign;
        @AuraEnabled public List<LeadRow> recentLeads;
    }

    public class CampaignRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String campaignType;
        @AuraEnabled public String eventType;
        @AuraEnabled public String fiscalYear;
        @AuraEnabled public String status;
        @AuraEnabled public String funnelStage;
        @AuraEnabled public String contentType;
        @AuraEnabled public String targetIndustry;
        @AuraEnabled public String eventCity;
        @AuraEnabled public String eventRegion;
        @AuraEnabled public Date startDate;
        @AuraEnabled public Date endDate;
        @AuraEnabled public Decimal spend;
        @AuraEnabled public Decimal budgetedCost;
        @AuraEnabled public Decimal projectedSpend;
        @AuraEnabled public Integer leads;
        @AuraEnabled public Integer contacts;
        @AuraEnabled public Integer responses;
        @AuraEnabled public Decimal pipelineInfluenced;
        @AuraEnabled public Decimal wonRevenue;
        @AuraEnabled public Integer oppsInfluenced;
        @AuraEnabled public Integer attendees;
        @AuraEnabled public Decimal roi;
        @AuraEnabled public Decimal costPerLead;
        @AuraEnabled public Boolean isActive;
    }

    public class GroupedMetric {
        @AuraEnabled public String label;
        @AuraEnabled public Integer count;
        @AuraEnabled public Decimal spend;
        @AuraEnabled public Integer leads;
        @AuraEnabled public Decimal pipeline;
        @AuraEnabled public Decimal wonRevenue;
        @AuraEnabled public Integer attendees;
        @AuraEnabled public Decimal avgRoi;
        @AuraEnabled public Decimal costPerLead;
        @AuraEnabled public Decimal costPerAttendee;
        @AuraEnabled public Decimal pipelinePerEvent;
    }

    public class AttributionRow {
        @AuraEnabled public Id campaignId;
        @AuraEnabled public String campaignName;
        @AuraEnabled public String campaignType;
        @AuraEnabled public Integer oppsInfluenced;
        @AuraEnabled public Decimal pipelineValue;
    }

    public class LeadRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String company;
        @AuraEnabled public String source;
        @AuraEnabled public String status;
        @AuraEnabled public String industry;
        @AuraEnabled public Datetime createdDate;
    }

    public class InsightCard {
        @AuraEnabled public String severity;
        @AuraEnabled public String title;
        @AuraEnabled public String detail;
    }

    public class EventBudgetSummary {
        @AuraEnabled public Decimal grandTotalBudgeted;
        @AuraEnabled public Decimal grandTotalActual;
        @AuraEnabled public Decimal grandTotalPipeline;
        @AuraEnabled public Decimal grandTotalWon;
        @AuraEnabled public Decimal grandVariance;
        @AuraEnabled public Decimal grandRoi;
        @AuraEnabled public List<BudgetRow> rows;
    }

    public class BudgetRow {
        @AuraEnabled public String eventType;
        @AuraEnabled public String fiscalYear;
        @AuraEnabled public Integer eventCount;
        @AuraEnabled public Decimal budgeted;
        @AuraEnabled public Decimal actual;
        @AuraEnabled public Decimal projected;
        @AuraEnabled public Decimal pipeline;
        @AuraEnabled public Decimal wonRevenue;
        @AuraEnabled public Integer opps;
        @AuraEnabled public Decimal variance;
        @AuraEnabled public Decimal roi;
    }

    public class MemberRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String company;
        @AuraEnabled public String title;
        @AuraEnabled public String memberStatus;
        @AuraEnabled public String memberType; // Lead or Contact
        @AuraEnabled public Id contactOrLeadId;
    }

    public class SearchResult {
        @AuraEnabled public Id recordId;
        @AuraEnabled public String name;
        @AuraEnabled public String company;
        @AuraEnabled public String title;
        @AuraEnabled public String recordType; // Lead or Contact
    }

    // ══════════════════════════════════════════════════════════════
    // DATA EDITOR: CAMPAIGN SAVE
    // ══════════════════════════════════════════════════════════════

    @AuraEnabled
    public static void saveCampaigns(String campaignsJson) {
        List<Object> rawList = (List<Object>) JSON.deserializeUntyped(campaignsJson);
        List<Campaign> toUpdate = new List<Campaign>();

        for (Object rawItem : rawList) {
            Map<String, Object> row = (Map<String, Object>) rawItem;
            Campaign c = new Campaign(Id = (Id) row.get('id'));
            if (row.containsKey('Status')) c.Status = (String) row.get('Status');
            if (row.containsKey('ActualCost')) c.ActualCost = row.get('ActualCost') != null ? Decimal.valueOf(String.valueOf(row.get('ActualCost'))) : null;
            if (row.containsKey('BudgetedCost')) c.BudgetedCost = row.get('BudgetedCost') != null ? Decimal.valueOf(String.valueOf(row.get('BudgetedCost'))) : null;
            if (row.containsKey('Number_of_Attendees__c')) c.Number_of_Attendees__c = row.get('Number_of_Attendees__c') != null ? Decimal.valueOf(String.valueOf(row.get('Number_of_Attendees__c'))) : null;
            if (row.containsKey('Type__c')) c.Type__c = (String) row.get('Type__c');
            if (row.containsKey('Funnel_Stage__c')) c.Funnel_Stage__c = (String) row.get('Funnel_Stage__c');
            if (row.containsKey('Content_Type__c')) c.Content_Type__c = (String) row.get('Content_Type__c');
            if (row.containsKey('Event_City__c')) c.Event_City__c = (String) row.get('Event_City__c');
            if (row.containsKey('Event_Region__c')) c.Event_Region__c = (String) row.get('Event_Region__c');
            if (row.containsKey('Target_Industry__c')) c.Target_Industry__c = (String) row.get('Target_Industry__c');
            if (row.containsKey('Seniority_Level__c')) c.Seniority_Level__c = (String) row.get('Seniority_Level__c');
            if (row.containsKey('Event_Type__c')) c.Event_Type__c = (String) row.get('Event_Type__c');
            if (row.containsKey('Fiscal_Year__c')) c.Fiscal_Year__c = (String) row.get('Fiscal_Year__c');
            if (row.containsKey('Projected_Spend__c')) c.Projected_Spend__c = row.get('Projected_Spend__c') != null ? Decimal.valueOf(String.valueOf(row.get('Projected_Spend__c'))) : null;
            toUpdate.add(c);
        }

        if (!toUpdate.isEmpty()) {
            update toUpdate;
        }
    }

    // ══════════════════════════════════════════════════════════════
    // DATA EDITOR: CAMPAIGN MEMBERS
    // ══════════════════════════════════════════════════════════════

    @AuraEnabled(cacheable=true)
    public static List<MemberRow> getCampaignMembers(Id campaignId) {
        List<MemberRow> members = new List<MemberRow>();

        List<CampaignMember> cms = [
            SELECT Id, ContactId, LeadId, Status,
                   Contact.Name, Contact.Title, Contact.Account.Name,
                   Lead.Name, Lead.Title, Lead.Company
            FROM CampaignMember
            WHERE CampaignId = :campaignId
            ORDER BY CreatedDate DESC
            LIMIT 200
        ];

        for (CampaignMember cm : cms) {
            MemberRow mr = new MemberRow();
            mr.id = cm.Id;
            mr.memberStatus = cm.Status;

            if (cm.ContactId != null) {
                mr.contactOrLeadId = cm.ContactId;
                mr.name = cm.Contact.Name;
                mr.title = cm.Contact.Title;
                mr.company = cm.Contact.Account?.Name;
                mr.memberType = 'Contact';
            } else if (cm.LeadId != null) {
                mr.contactOrLeadId = cm.LeadId;
                mr.name = cm.Lead.Name;
                mr.title = cm.Lead.Title;
                mr.company = cm.Lead.Company;
                mr.memberType = 'Lead';
            }
            members.add(mr);
        }
        return members;
    }

    @AuraEnabled
    public static void updateCampaignMembers(String membersJson) {
        List<Object> rawList = (List<Object>) JSON.deserializeUntyped(membersJson);
        List<CampaignMember> toUpdate = new List<CampaignMember>();

        for (Object rawItem : rawList) {
            Map<String, Object> row = (Map<String, Object>) rawItem;
            CampaignMember cm = new CampaignMember(Id = (Id) row.get('id'));
            if (row.containsKey('Status')) cm.Status = (String) row.get('Status');
            toUpdate.add(cm);
        }
        if (!toUpdate.isEmpty()) update toUpdate;
    }

    @AuraEnabled
    public static Id addCampaignMember(Id campaignId, Id contactOrLeadId, String status) {
        CampaignMember cm = new CampaignMember();
        cm.CampaignId = campaignId;
        String idPrefix = String.valueOf(contactOrLeadId).substring(0, 3);
        if (idPrefix == '003') {
            cm.ContactId = contactOrLeadId;
        } else {
            cm.LeadId = contactOrLeadId;
        }
        cm.Status = String.isNotBlank(status) ? status : 'Invited';
        insert cm;
        return cm.Id;
    }

    @AuraEnabled(cacheable=true)
    public static List<SearchResult> searchContactsAndLeads(String searchTerm) {
        List<SearchResult> results = new List<SearchResult>();
        if (String.isBlank(searchTerm) || searchTerm.length() < 2) return results;

        String term = '%' + String.escapeSingleQuotes(searchTerm) + '%';

        // Search contacts
        for (Contact c : [SELECT Id, Name, Title, Account.Name FROM Contact WHERE Name LIKE :term ORDER BY LastModifiedDate DESC LIMIT 10]) {
            SearchResult sr = new SearchResult();
            sr.recordId = c.Id;
            sr.name = c.Name;
            sr.title = c.Title;
            sr.company = c.Account?.Name;
            sr.recordType = 'Contact';
            results.add(sr);
        }

        // Search leads
        for (Lead l : [SELECT Id, Name, Title, Company FROM Lead WHERE Name LIKE :term AND IsConverted = false ORDER BY CreatedDate DESC LIMIT 10]) {
            SearchResult sr = new SearchResult();
            sr.recordId = l.Id;
            sr.name = l.Name;
            sr.title = l.Title;
            sr.company = l.Company;
            sr.recordType = 'Lead';
            results.add(sr);
        }
        return results;
    }

    // ══════════════════════════════════════════════════════════════
    // DATA EDITOR: CAMPAIGNS LIST FOR EDITOR
    // ══════════════════════════════════════════════════════════════

    @AuraEnabled(cacheable=true)
    public static List<CampaignRow> getCampaignsForEditor() {
        List<Campaign> camps = [
            SELECT Id, Name, Status, StartDate, ActualCost, BudgetedCost, Projected_Spend__c,
                   Number_of_Attendees__c, Type__c, Event_Type__c, Fiscal_Year__c,
                   Funnel_Stage__c, Content_Type__c,
                   Event_City__c, Event_Region__c, Target_Industry__c, Seniority_Level__c,
                   NumberOfLeads, AmountAllOpportunities, ROI__c, AmountWonOpportunities
            FROM Campaign
            ORDER BY StartDate DESC NULLS LAST
            LIMIT 200
        ];

        List<CampaignRow> rows = new List<CampaignRow>();
        for (Campaign c : camps) {
            CampaignRow row = new CampaignRow();
            row.id = c.Id;
            row.name = c.Name;
            row.status = c.Status;
            row.startDate = c.StartDate;
            row.spend = c.ActualCost;
            row.campaignType = c.Type__c;
            row.eventType = c.Event_Type__c;
            row.fiscalYear = c.Fiscal_Year__c;
            row.projectedSpend = c.Projected_Spend__c;
            row.budgetedCost = c.BudgetedCost;
            row.funnelStage = c.Funnel_Stage__c;
            row.contentType = c.Content_Type__c;
            row.eventCity = c.Event_City__c;
            row.eventRegion = c.Event_Region__c;
            row.targetIndustry = c.Target_Industry__c;
            row.attendees = c.Number_of_Attendees__c != null ? Integer.valueOf(c.Number_of_Attendees__c) : 0;
            row.leads = c.NumberOfLeads != null ? c.NumberOfLeads : 0;
            row.pipelineInfluenced = c.AmountAllOpportunities != null ? c.AmountAllOpportunities : 0;
            row.roi = (c.AmountWonOpportunities != null && c.AmountWonOpportunities > 0) ? c.ROI__c : null;
            row.wonRevenue = c.AmountWonOpportunities;
            rows.add(row);
        }
        return rows;
    }

    // Add budgetedCost to CampaignRow for editor
    // (extending existing wrapper -- adding field)
}

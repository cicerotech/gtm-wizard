/**
 * PipelineReviewController
 * 
 * Apex controller for the Pipeline Review Center and Change Pulse LWC components.
 * Computes WoW deltas from OpportunityFieldHistory — no new custom fields needed.
 * 
 * Architecture: Queries current Opportunity data + last 7 days of field history
 * to reconstruct prior-week values and compute deltas in-memory.
 * 
 * @author GTM Brain
 * @date February 2026
 */
public with sharing class PipelineReviewController {
    
    // Test helper: force isNew=false so buildSummary branches are covered
    @TestVisible
    private static Boolean testForceNotNew = false;
    
    // Active pipeline stages (matches "US and EU - Active Pipeline" report filters)
    private static final Set<String> ACTIVE_STAGES = new Set<String>{
        'Stage 0 - Prospecting', 'Stage 1 - Discovery', 'Stage 2 - SQO',
        'Stage 3 - Pilot', 'Stage 4 - Proposal', 'Stage 5 - Negotiation'
    };
    
    // Fields we track for WoW comparison
    private static final Set<String> TRACKED_FIELDS = new Set<String>{
        'ACV__c', 'StageName', 'Target_LOI_Date__c', 'BL_Forecast_Category__c'
    };
    
    /**
     * Get pipeline review data for all open Opportunities
     * Computes WoW deltas from OpportunityFieldHistory
     */
    @AuraEnabled(cacheable=true)
    public static List<PipelineRow> getPipelineData(String pod, String stageMin, Boolean changesOnly, String productLine) {
        
        // 1. Get open Opportunities – restrict to active pipeline stages
        String query = 'SELECT Id, Name, AccountId, Account.Name, Account.Account_Display_Name__c, Account.Customer_Type__c, ' +
            'Account.Customer_Subtype__c, Account.Eudia_Counsel_2__c, Account.Code_Name__c, ' +
            'ACV__c, StageName, Target_LOI_Date__c, ' +
            'BL_Forecast_Category__c, Owner.Name, OwnerId, Pod__c, Eudia_Tech__c, ' +
            'Product_Lines_Multi__c, Next_Steps__c, CreatedDate, Probability, ' +
            'Quarterly_Commit__c, Weighted_ACV_AI_Enabled__c, ' +
            'Blended_Forecast_base__c, BL_Quarterly_Forecast__c, ' +
            'AI_Enabled_Quarterly_Forecast_Net__c, ' +
            'Renewal_Net_Change__c, Prior_Opp_ACV__c, ' +
            'Q1_2026_Commit_Snapshot__c, Q1_2026_ACV_Snapshot__c, ' +
            'Q1_2026_Forecast_Category_Snapshot__c ' +
            'FROM Opportunity WHERE IsClosed = false AND StageName IN :ACTIVE_STAGES';
        
        if (String.isNotBlank(pod) && pod != 'All') {
            query += ' AND Pod__c = :pod';
        }
        if (String.isNotBlank(stageMin)) {
            query += ' AND StageName >= :stageMin';
        }
        
        // Product Line filter — uses INCLUDES on the real multi-select picklist
        // to match exactly how SF reports filter (aligns with "US & EU Active Pipeline" report)
        if (String.isNotBlank(productLine) && productLine != 'All') {
            query += ' AND Product_Lines_Multi__c INCLUDES (\'' + String.escapeSingleQuotes(productLine) + '\')';
        }
        
        query += ' ORDER BY Owner.Name, ACV__c DESC';
        
        List<Opportunity> opps = Database.query(query);
        Set<Id> oppIds = new Set<Id>();
        for (Opportunity o : opps) oppIds.add(o.Id);
        
        // 2. Get field history for the last 7 days
        Map<Id, Map<String, FieldChange>> changeMap = getFieldChanges(oppIds, 7);
        
        // 3. Build rows with WoW deltas
        List<PipelineRow> rows = new List<PipelineRow>();
        for (Opportunity opp : opps) {
            PipelineRow row = new PipelineRow(opp, changeMap.get(opp.Id));
            if (changesOnly == true && !row.anyChange) continue;
            rows.add(row);
        }
        
        return rows;
    }
    
    /**
     * Get distinct product line values for filter picklist.
     * Reads from Product_Lines_Multi__c (the real multi-select picklist)
     * so dropdown values match exactly what SF reports show.
     */
    @AuraEnabled(cacheable=true)
    public static List<String> getProductLineOptions() {
        Set<String> products = new Set<String>();
        for (Opportunity opp : [
            SELECT Product_Lines_Multi__c FROM Opportunity
            WHERE IsClosed = false AND StageName IN :ACTIVE_STAGES
            AND Product_Lines_Multi__c != null
        ]) {
            if (String.isNotBlank(opp.Product_Lines_Multi__c)) {
                for (String p : opp.Product_Lines_Multi__c.split(';')) {
                    String trimmed = p.trim();
                    if (String.isNotBlank(trimmed)) products.add(trimmed);
                }
            }
        }
        List<String> sorted = new List<String>(products);
        sorted.sort();
        return sorted;
    }
    
    /**
     * Get change data for a single Opportunity (for Change Pulse LWC)
     */
    @AuraEnabled(cacheable=true)
    public static PipelineRow getOppChangeData(Id opportunityId) {
        Opportunity opp = [
            SELECT Id, Name, AccountId, Account.Name, Account.Account_Display_Name__c,
                Account.Customer_Type__c, Account.Customer_Subtype__c,
                Account.Eudia_Counsel_2__c, Account.Code_Name__c,
                ACV__c, StageName, Target_LOI_Date__c,
                BL_Forecast_Category__c, Owner.Name, OwnerId, Pod__c, Eudia_Tech__c,
                Product_Lines_Multi__c, CreatedDate, Probability,
                Quarterly_Commit__c, Weighted_ACV_AI_Enabled__c, Blended_Forecast_base__c,
                BL_Quarterly_Forecast__c, AI_Enabled_Quarterly_Forecast_Net__c,
                Renewal_Net_Change__c, Prior_Opp_ACV__c
            FROM Opportunity WHERE Id = :opportunityId LIMIT 1
        ];
        
        Map<Id, Map<String, FieldChange>> changeMap = getFieldChanges(
            new Set<Id>{ opportunityId }, 7
        );
        
        return new PipelineRow(opp, changeMap.get(opportunityId));
    }
    
    /**
     * Get field change history for a single Opportunity (last 8 weeks)
     */
    @AuraEnabled(cacheable=true)
    public static List<HistoryRow> getOppHistory(Id opportunityId) {
        List<HistoryRow> history = new List<HistoryRow>();
        
        for (OpportunityFieldHistory h : [
            SELECT Field, OldValue, NewValue, CreatedDate
            FROM OpportunityFieldHistory
            WHERE OpportunityId = :opportunityId
            AND Field IN ('ACV__c', 'StageName', 'Target_LOI_Date__c', 'BL_Forecast_Category__c')
            AND CreatedDate = LAST_N_DAYS:56
            ORDER BY CreatedDate DESC
            LIMIT 50
        ]) {
            history.add(new HistoryRow(h));
        }
        
        return history;
    }
    
    /**
     * Get pipeline summary highlights
     */
    @AuraEnabled(cacheable=true)
    public static PipelineSummary getPipelineSummary() {
        PipelineSummary summary = new PipelineSummary();
        
        List<Opportunity> opps = [
            SELECT Id, ACV__c, StageName, BL_Forecast_Category__c, CreatedDate,
                Eudia_Tech__c, Probability, Target_LOI_Date__c,
                Weighted_ACV_AI_Enabled__c, BL_Quarterly_Forecast__c,
                AI_Enabled_Quarterly_Forecast_Net__c
            FROM Opportunity WHERE IsClosed = false AND StageName IN :ACTIVE_STAGES
        ];
        
        Set<Id> oppIds = new Set<Id>();
        for (Opportunity o : opps) oppIds.add(o.Id);
        
        Map<Id, Map<String, FieldChange>> changeMap = getFieldChanges(oppIds, 7);
        Date oneWeekAgo = Date.today().addDays(-7);
        
        // Compute current fiscal quarter boundaries (calendar-aligned)
        Date today = Date.today();
        Integer qMonth = ((today.month() - 1) / 3) * 3 + 1; // 1, 4, 7, or 10
        Date qtrStart = Date.newInstance(today.year(), qMonth, 1);
        Date qtrEnd = qtrStart.addMonths(3).addDays(-1);
        
        for (Opportunity opp : opps) {
            summary.totalDeals++;
            Decimal acv = opp.ACV__c != null ? opp.ACV__c : 0;
            Decimal prob = opp.Probability != null ? opp.Probability : 0;
            Decimal weighted = acv * prob / 100;
            summary.totalACV += acv;
            summary.weightedACV += weighted;
            
            Boolean isCommit = opp.BL_Forecast_Category__c == 'Commit';
            Boolean isInQtr = opp.Target_LOI_Date__c != null
                && opp.Target_LOI_Date__c >= qtrStart
                && opp.Target_LOI_Date__c <= qtrEnd;
            
            // All-deal commit totals
            if (isCommit) {
                summary.commitTotal += acv;
                if (isInQtr) {
                    summary.commitInQtr += acv;
                }
            }
            
            // AI-specific totals
            if (opp.Eudia_Tech__c == true) {
                summary.totalAIDeals++;
                summary.totalAIACV += acv;
                summary.weightedAIACV += weighted;
                if (isCommit) {
                    summary.commitAITotal += acv;
                    if (isInQtr) {
                        summary.commitAIInQtr += acv;
                    }
                }
            }
            
            Map<String, FieldChange> changes = changeMap.get(opp.Id);
            if (changes == null || changes.isEmpty()) {
                if (opp.CreatedDate >= Datetime.newInstance(oneWeekAgo, Time.newInstance(0,0,0,0))) {
                    summary.newDeals++;
                }
                continue;
            }
            
            summary.changedDeals++;
            
            FieldChange acvChange = changes.get('ACV__c');
            if (acvChange != null) {
                Decimal acvDelta = acvChange.numericDelta();
                if (acvDelta > 0) {
                    summary.acvIncreases++;
                    summary.netACVChange += acvDelta;
                } else if (acvDelta < 0) {
                    summary.acvDecreases++;
                    summary.netACVChange += acvDelta;
                }
            }
            
            FieldChange stageChange = changes.get('StageName');
            if (stageChange != null) {
                Integer direction = stageDirection(
                    String.valueOf(stageChange.oldValue), 
                    String.valueOf(stageChange.newValue)
                );
                if (direction > 0) summary.stageAdvances++;
                else if (direction < 0) summary.stageRegressions++;
            }
            
            FieldChange targetChange = changes.get('Target_LOI_Date__c');
            if (targetChange != null && targetChange.daysDelta() > 7) {
                summary.targetSlips++;
            }
            
            FieldChange fcChange = changes.get('BL_Forecast_Category__c');
            if (fcChange != null && opp.BL_Forecast_Category__c == 'Commit') {
                summary.movedToCommit++;
            }
            
            if (opp.CreatedDate >= Datetime.newInstance(oneWeekAgo, Time.newInstance(0,0,0,0))) {
                summary.newDeals++;
            }
        }
        
        return summary;
    }
    
    // ── Core: extract field changes from OpportunityFieldHistory ──
    
    public static Map<Id, Map<String, FieldChange>> getFieldChanges(Set<Id> oppIds, Integer daysBack) {
        Map<Id, Map<String, FieldChange>> result = new Map<Id, Map<String, FieldChange>>();
        
        if (oppIds.isEmpty()) return result;
        
        // Query field history for the given time range
        // For each Opp+Field, we want the EARLIEST value in the range (that's the "prior" value)
        // and the LATEST value (that's the "current" value from history)
        for (OpportunityFieldHistory h : [
            SELECT OpportunityId, Field, OldValue, NewValue, CreatedDate
            FROM OpportunityFieldHistory
            WHERE OpportunityId IN :oppIds
            AND Field IN :TRACKED_FIELDS
            AND CreatedDate = LAST_N_DAYS:7
            ORDER BY CreatedDate ASC
        ]) {
            if (!result.containsKey(h.OpportunityId)) {
                result.put(h.OpportunityId, new Map<String, FieldChange>());
            }
            Map<String, FieldChange> fieldChanges = result.get(h.OpportunityId);
            
            if (!fieldChanges.containsKey(h.Field)) {
                // First change for this field — OldValue is our "prior week" baseline
                fieldChanges.put(h.Field, new FieldChange(
                    h.Field, h.OldValue, h.NewValue, h.CreatedDate
                ));
            } else {
                // Subsequent change — update the NewValue to latest
                fieldChanges.get(h.Field).newValue = h.NewValue;
                fieldChanges.get(h.Field).lastChanged = h.CreatedDate;
            }
        }
        
        return result;
    }
    
    @TestVisible
    private static Integer stageDirection(String oldStage, String newStage) {
        if (oldStage == null || newStage == null) return 0;
        Integer oldNum = extractStageNum(oldStage);
        Integer newNum = extractStageNum(newStage);
        if (newNum > oldNum) return 1;
        if (newNum < oldNum) return -1;
        return 0;
    }
    
    @TestVisible
    private static Integer extractStageNum(String stageName) {
        if (stageName == null) return -1;
        if (stageName.startsWith('Stage 0')) return 0;
        if (stageName.startsWith('Stage 1')) return 1;
        if (stageName.startsWith('Stage 2')) return 2;
        if (stageName.startsWith('Stage 3')) return 3;
        if (stageName.startsWith('Stage 4')) return 4;
        if (stageName.startsWith('Stage 5')) return 5;
        if (stageName.contains('Won')) return 6;
        if (stageName.contains('Lost')) return -1;
        return -1;
    }
    
    // ── Product category normalization ──
    
    @TestVisible
    private static String normalizeProductCategory(String raw) {
        if (String.isBlank(raw)) return null;
        String lower = raw.toLowerCase();
        if (lower == 'multiple') return 'Multiple';
        if (lower.contains('compliance')) return 'AI Compliance';
        if (lower.contains('secondee')) return 'Secondee';
        if (lower.contains('contract') && lower.contains('managed')) return 'AI Contracting MS';
        if (lower.contains('contract') && lower.contains('bau')) return 'Contracting BAU';
        if (lower.contains('contract')) return 'AI Contracting';
        if (lower.contains('m&a')) return 'AI M&A';
        if (lower.contains('sigma')) return 'Sigma';
        if (lower.contains('insights')) return 'Insights';
        if (lower.contains('litigation')) return 'Litigation';
        if (lower.contains('fde')) return 'FDE';
        if (lower.contains('dsar')) return 'DSAR';
        if (lower == 'undetermined') return 'Undetermined';
        if (lower.startsWith('other')) return 'Other';
        return raw;
    }
    
    @TestVisible
    private static String categoryToLikePattern(String category) {
        Map<String, String> keywordMap = new Map<String, String>{
            'AI Compliance' => '%Compliance%',
            'AI Contracting' => '%Contract%',
            'AI Contracting MS' => '%Contract%Managed%',
            'Contracting BAU' => '%BAU%',
            'AI M&A' => '%M&A%',
            'Sigma' => '%Sigma%',
            'Insights' => '%Insights%',
            'Litigation' => '%Litigation%',
            'Secondee' => '%Secondee%',
            'FDE' => '%FDE%',
            'DSAR' => '%DSAR%',
            'Undetermined' => '%Undetermined%',
            'Other' => '%Other%'
        };
        return keywordMap.containsKey(category) ? keywordMap.get(category) : '%' + category + '%';
    }
    
    // ── Inner classes ──
    
    public class FieldChange {
        public String fieldName;
        public Object oldValue;
        public Object newValue;
        public Datetime lastChanged;
        
        public FieldChange(String fieldName, Object oldValue, Object newValue, Datetime lastChanged) {
            this.fieldName = fieldName;
            this.oldValue = oldValue;
            this.newValue = newValue;
            this.lastChanged = lastChanged;
        }
        
        public Decimal numericDelta() {
            Decimal oldDec = toDecimal(newValue) != null ? toDecimal(newValue) : 0;
            Decimal newDec = toDecimal(oldValue) != null ? toDecimal(oldValue) : 0;
            return oldDec - newDec;
        }
        
        public Integer daysDelta() {
            if (oldValue == null || newValue == null) return 0;
            try {
                Date oldDate = Date.valueOf(String.valueOf(oldValue));
                Date newDate = Date.valueOf(String.valueOf(newValue));
                return newDate.daysBetween(oldDate) * -1; // positive = slipped forward
            } catch (Exception e) {
                return 0;
            }
        }
        
        private Decimal toDecimal(Object val) {
            if (val == null) return null;
            try { return Decimal.valueOf(String.valueOf(val)); }
            catch (Exception e) { return null; }
        }
    }
    
    private static String resolveAccountDisplayName(Opportunity opp) {
        try {
            if (opp.Account?.Eudia_Counsel_2__c == true && String.isNotBlank(opp.Account?.Code_Name__c)) {
                return opp.Account.Code_Name__c;
            }
        } catch (SObjectException e) {
            // Counsel fields not queried -- fall through
        }
        try {
            if (opp.Account?.Account_Display_Name__c != null) {
                return opp.Account.Account_Display_Name__c;
            }
        } catch (SObjectException e) {
            // Display name not queried -- fall through
        }
        return opp.Account?.Name;
    }

    public class PipelineRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String accountName;
        @AuraEnabled public String customerType;
        @AuraEnabled public String customerSubtype;
        @AuraEnabled public Decimal acv;
        @AuraEnabled public String stage;
        @AuraEnabled public String stageShort;
        @AuraEnabled public Date targetSign;
        @AuraEnabled public String forecastCategory;
        @AuraEnabled public String ownerName;
        @AuraEnabled public String pod;
        @AuraEnabled public Boolean aiEnabled;
        @AuraEnabled public String productLine;
        @AuraEnabled public String nextSteps;
        @AuraEnabled public Decimal probability;
        @AuraEnabled public Decimal weightedAcv;
        @AuraEnabled public Decimal commitNet;        // Quarterly_Commit__c (AI-Enabled, Net ACV, Commit only)
        @AuraEnabled public Decimal weightedNetAI;    // Weighted_ACV_AI_Enabled__c (AI-Enabled, Net, stage-prob)
        @AuraEnabled public Decimal blendedForecast;  // Blended_Forecast_base__c (ACV × FC weight: 100% Commit, 60% Gut)
        @AuraEnabled public Decimal quarterlyForecastNet;  // BL_Quarterly_Forecast__c ("Quarterly Forecast Net")
        @AuraEnabled public Decimal aiQuarterlyForecastNet; // AI_Enabled_Quarterly_Forecast_Net__c
        @AuraEnabled public Decimal netAcv;           // Net ACV: Renewal_Net_Change for existing, ACV for new
        
        // Q1 2026 snapshot fields (frozen at quarter start)
        @AuraEnabled public Decimal q1CommitSnapshot;   // Q1_2026_Commit_Snapshot__c
        @AuraEnabled public Decimal q1AcvSnapshot;       // Q1_2026_ACV_Snapshot__c
        @AuraEnabled public String q1FcSnapshot;         // Q1_2026_Forecast_Category_Snapshot__c
        
        // WoW computed from history
        @AuraEnabled public Decimal acvDelta;
        @AuraEnabled public Decimal priorAcv;
        @AuraEnabled public Boolean stageChanged;
        @AuraEnabled public String priorStage;
        @AuraEnabled public Integer stageDir; // 1=up, -1=down, 0=same
        @AuraEnabled public Integer targetDeltaDays;
        @AuraEnabled public Date priorTargetSign;
        @AuraEnabled public Boolean fcChanged;
        @AuraEnabled public String priorForecastCat;
        @AuraEnabled public Boolean anyChange;
        @AuraEnabled public Integer changeScore;
        @AuraEnabled public Boolean isNew;
        @AuraEnabled public String wowSummary;
        
        public PipelineRow(Opportunity opp, Map<String, FieldChange> changes) {
            this.id = opp.Id;
            this.name = opp.Name;
            this.accountName = resolveAccountDisplayName(opp);
            this.customerType = opp.Account?.Customer_Type__c;
            this.customerSubtype = opp.Account?.Customer_Subtype__c;
            this.acv = opp.ACV__c;
            this.stage = opp.StageName;
            this.stageShort = abbreviateStage(opp.StageName);
            this.targetSign = opp.Target_LOI_Date__c;
            this.forecastCategory = opp.BL_Forecast_Category__c;
            this.ownerName = opp.Owner?.Name;
            this.pod = opp.Pod__c;
            this.aiEnabled = opp.Eudia_Tech__c;
            this.productLine = opp.Product_Lines_Multi__c;
            try { this.nextSteps = opp.Next_Steps__c; } catch (Exception e) { this.nextSteps = null; }
            this.probability = opp.Probability;
            this.weightedAcv = (opp.ACV__c != null && opp.Probability != null) ? (opp.ACV__c * opp.Probability / 100) : 0;
            try { this.commitNet = opp.Quarterly_Commit__c != null ? opp.Quarterly_Commit__c : 0; } catch (Exception e) { this.commitNet = 0; }
            try { this.weightedNetAI = opp.Weighted_ACV_AI_Enabled__c != null ? opp.Weighted_ACV_AI_Enabled__c : 0; } catch (Exception e) { this.weightedNetAI = 0; }
            try { this.blendedForecast = opp.Blended_Forecast_base__c != null ? opp.Blended_Forecast_base__c : 0; } catch (Exception e) { this.blendedForecast = 0; }
            try { this.quarterlyForecastNet = opp.BL_Quarterly_Forecast__c != null ? opp.BL_Quarterly_Forecast__c : 0; } catch (Exception e) { this.quarterlyForecastNet = 0; }
            try { this.aiQuarterlyForecastNet = opp.AI_Enabled_Quarterly_Forecast_Net__c != null ? opp.AI_Enabled_Quarterly_Forecast_Net__c : 0; } catch (Exception e) { this.aiQuarterlyForecastNet = 0; }
            try { this.q1CommitSnapshot = opp.Q1_2026_Commit_Snapshot__c != null ? opp.Q1_2026_Commit_Snapshot__c : 0; } catch (Exception e) { this.q1CommitSnapshot = 0; }
            try { this.q1AcvSnapshot = opp.Q1_2026_ACV_Snapshot__c != null ? opp.Q1_2026_ACV_Snapshot__c : 0; } catch (Exception e) { this.q1AcvSnapshot = 0; }
            try { this.q1FcSnapshot = opp.Q1_2026_Forecast_Category_Snapshot__c; } catch (Exception e) { this.q1FcSnapshot = null; }
            try {
                if (opp.Prior_Opp_ACV__c != null && opp.Prior_Opp_ACV__c > 0 && opp.Renewal_Net_Change__c != null) {
                    this.netAcv = opp.Renewal_Net_Change__c;
                } else {
                    this.netAcv = opp.ACV__c != null ? opp.ACV__c : 0;
                }
            } catch (Exception e) { this.netAcv = opp.ACV__c != null ? opp.ACV__c : 0; }
            this.isNew = !testForceNotNew && opp.CreatedDate >= Datetime.now().addDays(-7);
            
            // Compute WoW from history
            this.acvDelta = 0;
            this.stageChanged = false;
            this.stageDir = 0;
            this.targetDeltaDays = 0;
            this.fcChanged = false;
            this.anyChange = false;
            this.changeScore = 0;
            
            if (changes != null && !changes.isEmpty()) {
                // ACV
                FieldChange acvC = changes.get('ACV__c');
                if (acvC != null) {
                    this.acvDelta = acvC.numericDelta();
                    this.priorAcv = acvC.toDecimal(acvC.oldValue);
                    this.changeScore += (this.acvDelta > 0 ? 2 : (this.acvDelta < 0 ? -2 : 0));
                }
                
                // Stage
                FieldChange stageC = changes.get('StageName');
                if (stageC != null) {
                    this.stageChanged = true;
                    this.priorStage = String.valueOf(stageC.oldValue);
                    this.stageDir = stageDirection(this.priorStage, opp.StageName);
                    this.changeScore += (this.stageDir > 0 ? 3 : (this.stageDir < 0 ? -3 : 0));
                }
                
                // Target date
                FieldChange targetC = changes.get('Target_LOI_Date__c');
                if (targetC != null) {
                    this.targetDeltaDays = targetC.daysDelta();
                    try { this.priorTargetSign = Date.valueOf(String.valueOf(targetC.oldValue)); }
                    catch (Exception e) { /* ignore */ }
                    if (this.targetDeltaDays > 7) this.changeScore -= 2;
                    else if (this.targetDeltaDays < -3) this.changeScore += 1;
                }
                
                // Forecast category
                FieldChange fcC = changes.get('BL_Forecast_Category__c');
                if (fcC != null) {
                    this.fcChanged = true;
                    this.priorForecastCat = String.valueOf(fcC.oldValue);
                    if (opp.BL_Forecast_Category__c == 'Commit') this.changeScore += 2;
                    else if (opp.BL_Forecast_Category__c == 'Gut') this.changeScore += 1;
                }
                
                this.anyChange = true;
            }
            
            // Build summary
            this.wowSummary = buildSummary();
        }
        
        private String buildSummary() {
            if (this.isNew) return 'New';
            if (!this.anyChange) return 'No changes';
            
            List<String> parts = new List<String>();
            if (this.acvDelta != 0) {
                String dir = this.acvDelta > 0 ? '↑' : '↓';
                parts.add(dir + ' ACV ' + formatCurrencyDelta(this.acvDelta));
            }
            if (this.stageChanged) {
                parts.add('Stage → ' + this.stageShort);
            }
            if (this.targetDeltaDays > 7) {
                parts.add('Target +' + this.targetDeltaDays + 'd');
            } else if (this.targetDeltaDays < -3) {
                parts.add('Target ' + this.targetDeltaDays + 'd');
            }
            if (this.fcChanged) {
                parts.add('FC → ' + this.forecastCategory);
            }
            return String.join(parts, ' · ');
        }
        
        private String formatCurrencyDelta(Decimal val) {
            if (val == null) return '$0';
            Decimal abs = Math.abs(val);
            String sign = val > 0 ? '+' : '-';
            if (abs >= 1000000) return sign + '$' + (abs / 1000000).setScale(1) + 'M';
            if (abs >= 1000) return sign + '$' + (abs / 1000).setScale(0) + 'k';
            return sign + '$' + abs.setScale(0);
        }
    }
    
    public class HistoryRow {
        @AuraEnabled public String fieldName;
        @AuraEnabled public String oldValue;
        @AuraEnabled public String newValue;
        @AuraEnabled public Datetime changedDate;
        
        public HistoryRow(OpportunityFieldHistory h) {
            this.fieldName = h.Field;
            this.oldValue = h.OldValue != null ? String.valueOf(h.OldValue) : null;
            this.newValue = h.NewValue != null ? String.valueOf(h.NewValue) : null;
            this.changedDate = h.CreatedDate;
        }
    }
    
    public class PipelineSummary {
        @AuraEnabled public Integer totalDeals = 0;
        @AuraEnabled public Decimal totalACV = 0;
        @AuraEnabled public Decimal weightedACV = 0;
        @AuraEnabled public Integer totalAIDeals = 0;
        @AuraEnabled public Decimal totalAIACV = 0;
        @AuraEnabled public Decimal weightedAIACV = 0;
        @AuraEnabled public Decimal commitTotal = 0;
        @AuraEnabled public Decimal commitInQtr = 0;
        @AuraEnabled public Decimal commitAITotal = 0;
        @AuraEnabled public Decimal commitAIInQtr = 0;
        @AuraEnabled public Integer changedDeals = 0;
        @AuraEnabled public Integer stageAdvances = 0;
        @AuraEnabled public Integer stageRegressions = 0;
        @AuraEnabled public Integer acvIncreases = 0;
        @AuraEnabled public Integer acvDecreases = 0;
        @AuraEnabled public Decimal netACVChange = 0;
        @AuraEnabled public Integer targetSlips = 0;
        @AuraEnabled public Integer movedToCommit = 0;
        @AuraEnabled public Integer newDeals = 0;
    }
    
    /**
     * Get Closed Won deals in current fiscal quarter (Feb-Apr, May-Jul, Aug-Oct, Nov-Jan)
     */
    @AuraEnabled
    public static List<ClosedWonRow> getClosedWonQTD() {
        Date today = Date.today();
        Integer m = today.month();
        // Fiscal quarters: Q1=Feb-Apr(2-4), Q2=May-Jul(5-7), Q3=Aug-Oct(8-10), Q4=Nov-Jan(11-1)
        Integer fiscalMonth = m == 1 ? 12 : m - 1; // Feb→1, Mar→2, ..., Jan→12
        Integer fiscalQtr = ((fiscalMonth - 1) / 3); // 0=Q1, 1=Q2, 2=Q3, 3=Q4
        Integer qtrStartMonth = 2 + fiscalQtr * 3; // 2, 5, 8, 11
        Integer qtrStartYear = today.year();
        if (qtrStartMonth > 12) { qtrStartMonth -= 12; qtrStartYear++; }
        if (m == 1) { qtrStartYear = today.year() - 1; qtrStartMonth = 11; } // Jan is Q4 of prior FY
        Date qtrStart = Date.newInstance(qtrStartYear, qtrStartMonth, 1);
        
        List<ClosedWonRow> rows = new List<ClosedWonRow>();
        for (Opportunity opp : [
            SELECT Id, Name, Account.Name, Account.Account_Display_Name__c,
                   Account.Eudia_Counsel_2__c, Account.Code_Name__c,
                   ACV__c, Renewal_Net_Change__c, Revenue_Type__c,
                   Product_Lines_Multi__c, CloseDate, Owner.Name, Pod__c, Eudia_Tech__c,
                   Q1_2026_Commit_Snapshot__c, Q1_2026_Forecast_Category_Snapshot__c
            FROM Opportunity
            WHERE IsWon = true AND CloseDate >= :qtrStart AND CloseDate <= :today
            ORDER BY CloseDate DESC
        ]) {
            rows.add(new ClosedWonRow(opp));
        }
        return rows;
    }
    
    public class ClosedWonRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String accountName;
        @AuraEnabled public Decimal acv;
        @AuraEnabled public Decimal netAcv;
        @AuraEnabled public String revenueType;
        @AuraEnabled public String productLine;
        @AuraEnabled public Date closeDate;
        @AuraEnabled public String ownerName;
        @AuraEnabled public String pod;
        @AuraEnabled public Boolean aiEnabled;
        @AuraEnabled public Decimal q1CommitSnapshot;
        @AuraEnabled public String q1FcSnapshot;
        
        public ClosedWonRow(Opportunity opp) {
            this.id = opp.Id;
            this.name = opp.Name;
            this.accountName = resolveAccountDisplayName(opp);
            this.acv = opp.ACV__c != null ? opp.ACV__c : 0;
            this.netAcv = opp.Renewal_Net_Change__c != null ? opp.Renewal_Net_Change__c : this.acv;
            this.revenueType = opp.Revenue_Type__c;
            this.productLine = opp.Product_Lines_Multi__c;
            this.closeDate = opp.CloseDate;
            this.ownerName = opp.Owner?.Name;
            this.pod = opp.Pod__c;
            this.aiEnabled = opp.Eudia_Tech__c;
            try { this.q1CommitSnapshot = opp.Q1_2026_Commit_Snapshot__c != null ? opp.Q1_2026_Commit_Snapshot__c : 0; } catch (Exception e) { this.q1CommitSnapshot = 0; }
            try { this.q1FcSnapshot = opp.Q1_2026_Forecast_Category_Snapshot__c; } catch (Exception e) { this.q1FcSnapshot = null; }
        }
    }
    
    @AuraEnabled
    public static String updateOpportunityField(Id oppId, String fieldName, String fieldValue) {
        try {
            Opportunity opp = [SELECT Id FROM Opportunity WHERE Id = :oppId LIMIT 1];
            if (fieldName == 'ACV__c') {
                opp.ACV__c = Decimal.valueOf(fieldValue.replaceAll('[^0-9.]', ''));
            } else if (fieldName == 'StageName') {
                opp.StageName = fieldValue;
            } else if (fieldName == 'Target_LOI_Date__c') {
                opp.Target_LOI_Date__c = Date.valueOf(fieldValue);
            } else if (fieldName == 'BL_Forecast_Category__c') {
                opp.BL_Forecast_Category__c = fieldValue;
            } else if (fieldName == 'Product_Lines_Multi__c') {
                opp.Product_Lines_Multi__c = fieldValue;
            } else if (fieldName == 'Next_Steps__c') {
                opp.Next_Steps__c = fieldValue;
            } else {
                return 'Unknown field: ' + fieldName;
            }
            update opp;
            return 'OK';
        } catch (Exception e) {
            return 'Error: ' + e.getMessage();
        }
    }

    @TestVisible
    private static String abbreviateStage(String stageName) {
        if (stageName == null) return '';
        if (stageName.startsWith('Stage 0')) return 'S0';
        if (stageName.startsWith('Stage 1')) return 'S1';
        if (stageName.startsWith('Stage 2')) return 'S2';
        if (stageName.startsWith('Stage 3')) return 'S3';
        if (stageName.startsWith('Stage 4')) return 'S4';
        if (stageName.startsWith('Stage 5')) return 'S5';
        if (stageName.contains('Won')) return 'Won';
        if (stageName.contains('Lost')) return 'Lost';
        return stageName;
    }
}
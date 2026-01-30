/**
 * PipelineSnapshotService
 * 
 * Creates weekly aggregated pipeline snapshots per Business Lead.
 * Designed to run every Sunday to capture point-in-time pipeline state.
 * 
 * Usage:
 *   - Schedule: System.schedule('Pipeline Snapshot Weekly', '0 0 8 ? * SUN', new PipelineSnapshotService());
 *   - Manual: PipelineSnapshotService.createSnapshots();
 * 
 * @author GTM Brain
 * @date January 2026
 */
public class PipelineSnapshotService implements Schedulable {
    
    // Active stages to include in pipeline calculations
    private static final Set<String> ACTIVE_STAGES = new Set<String>{
        'Stage 1. Prospect',
        'Stage 2. Qualified Lead',
        'Stage 3. Discovery',
        'Stage 4. CAB/Proposal',
        'Stage 5. Contract'
    };
    
    // Stage probability mapping (if Stage_Probability__c field doesn't exist)
    private static final Map<String, Decimal> STAGE_PROBABILITIES = new Map<String, Decimal>{
        'Stage 1. Prospect' => 10,
        'Stage 2. Qualified Lead' => 25,
        'Stage 3. Discovery' => 40,
        'Stage 4. CAB/Proposal' => 60,
        'Stage 5. Contract' => 80
    };
    
    /**
     * Schedulable execute method
     */
    public void execute(SchedulableContext ctx) {
        String correlationId = GTMLogger.operationStart('PipelineSnapshotService.execute', 
            new Map<String, Object>{'scheduledTime' => Datetime.now()});
        
        try {
            createSnapshots();
            GTMLogger.operationSuccess('PipelineSnapshotService.execute', correlationId, 
                new Map<String, Object>());
        } catch (Exception e) {
            GTMLogger.operationError('PipelineSnapshotService.execute', correlationId, e, 
                new Map<String, Object>());
        }
    }
    
    /**
     * Create pipeline snapshots for all active Business Leads
     * Can be called manually or from scheduler
     */
    public static void createSnapshots() {
        String correlationId = GTMLogger.operationStart('createSnapshots', new Map<String, Object>());
        
        try {
            Date snapshotDate = Date.today().toStartOfWeek().addDays(-1); // Previous Sunday
            
            // Check for existing snapshots on this date
            List<Pipeline_Snapshot__c> existing = [
                SELECT Id FROM Pipeline_Snapshot__c 
                WHERE Snapshot_Date__c = :snapshotDate
                LIMIT 1
            ];
            
            if (!existing.isEmpty()) {
                GTMLogger.info('Snapshots already exist for this week, skipping', 
                    new Map<String, Object>{'snapshotDate' => snapshotDate});
                return;
            }
            
            // Get all active opportunities grouped by owner
            Map<Id, OwnerPipelineData> ownerData = aggregateOpportunityData();
            
            GTMLogger.info('Aggregated opportunity data', 
                new Map<String, Object>{'ownerCount' => ownerData.size()});
            
            // Get BL attainment data
            Map<Id, BL_Performance_Metrics__c> blMetrics = getBLMetrics();
            
            // Create snapshot records
            List<Pipeline_Snapshot__c> snapshots = new List<Pipeline_Snapshot__c>();
            
            for (Id ownerId : ownerData.keySet()) {
                OwnerPipelineData data = ownerData.get(ownerId);
                BL_Performance_Metrics__c metrics = blMetrics.get(ownerId);
                
                Pipeline_Snapshot__c snapshot = new Pipeline_Snapshot__c(
                    Snapshot_Date__c = snapshotDate,
                    Business_Lead__c = ownerId,
                    Total_Pipeline_ACV__c = data.totalAcv,
                    Weighted_Pipeline__c = data.weightedAcv,
                    Opp_Count_Stage_1_2__c = data.earlyStageCount,
                    Opp_Count_Stage_3_4__c = data.midStageCount,
                    Opp_Count_Stage_5_Plus__c = data.lateStageCount,
                    Total_Opp_Count__c = data.totalCount,
                    BL_Commit_Amount__c = data.commitAmount,
                    BL_Forecast_Amount__c = data.forecastAmount,
                    Attainment_At_Snapshot__c = metrics != null ? metrics.Quota_Attainment__c : 0
                );
                
                snapshots.add(snapshot);
            }
            
            if (!snapshots.isEmpty()) {
                insert snapshots;
                GTMLogger.priority('P2', 'createSnapshots', 'Snapshots created successfully', 
                    new Map<String, Object>{
                        'count' => snapshots.size(),
                        'snapshotDate' => snapshotDate
                    });
            }
            
            GTMLogger.operationSuccess('createSnapshots', correlationId, 
                new Map<String, Object>{'count' => snapshots.size()});
            
        } catch (Exception e) {
            GTMLogger.operationError('createSnapshots', correlationId, e, new Map<String, Object>());
            throw e;
        }
    }
    
    /**
     * Aggregate opportunity data by owner
     */
    private static Map<Id, OwnerPipelineData> aggregateOpportunityData() {
        Map<Id, OwnerPipelineData> ownerData = new Map<Id, OwnerPipelineData>();
        
        // Query all active opportunities
        List<Opportunity> opps = [
            SELECT Id, OwnerId, StageName, ACV__c, 
                   BL_Quarterly_Commit__c, BL_Quarterly_Forecast__c
            FROM Opportunity
            WHERE StageName IN :ACTIVE_STAGES
            AND IsClosed = false
            AND OwnerId != null
        ];
        
        for (Opportunity opp : opps) {
            if (!ownerData.containsKey(opp.OwnerId)) {
                ownerData.put(opp.OwnerId, new OwnerPipelineData());
            }
            
            OwnerPipelineData data = ownerData.get(opp.OwnerId);
            Decimal acv = opp.ACV__c != null ? opp.ACV__c : 0;
            
            // Total ACV
            data.totalAcv += acv;
            data.totalCount++;
            
            // Weighted ACV (using probability mapping)
            Decimal probability = STAGE_PROBABILITIES.containsKey(opp.StageName) 
                ? STAGE_PROBABILITIES.get(opp.StageName) / 100 
                : 0.5;
            data.weightedAcv += acv * probability;
            
            // Stage bucketing
            if (opp.StageName.startsWith('Stage 1') || opp.StageName.startsWith('Stage 2')) {
                data.earlyStageCount++;
            } else if (opp.StageName.startsWith('Stage 3') || opp.StageName.startsWith('Stage 4')) {
                data.midStageCount++;
            } else {
                data.lateStageCount++;
            }
            
            // Commit and forecast amounts
            if (opp.BL_Quarterly_Commit__c == true) {
                data.commitAmount += acv;
            }
            if (opp.BL_Quarterly_Forecast__c != null) {
                data.forecastAmount += opp.BL_Quarterly_Forecast__c;
            }
        }
        
        return ownerData;
    }
    
    /**
     * Get BL Performance Metrics for attainment data
     */
    private static Map<Id, BL_Performance_Metrics__c> getBLMetrics() {
        Map<Id, BL_Performance_Metrics__c> metricsMap = new Map<Id, BL_Performance_Metrics__c>();
        
        for (BL_Performance_Metrics__c metric : [
            SELECT Id, Business_Lead__c, Quota_Attainment__c
            FROM BL_Performance_Metrics__c
            WHERE Business_Lead__c != null
        ]) {
            metricsMap.put(metric.Business_Lead__c, metric);
        }
        
        return metricsMap;
    }
    
    /**
     * Inner class to hold aggregated data per owner
     */
    private class OwnerPipelineData {
        public Decimal totalAcv = 0;
        public Decimal weightedAcv = 0;
        public Integer earlyStageCount = 0;
        public Integer midStageCount = 0;
        public Integer lateStageCount = 0;
        public Integer totalCount = 0;
        public Decimal commitAmount = 0;
        public Decimal forecastAmount = 0;
    }
    
    /**
     * Delete old snapshots (retention policy: 18 months)
     */
    public static void purgeOldSnapshots() {
        String correlationId = GTMLogger.operationStart('purgeOldSnapshots', new Map<String, Object>());
        
        try {
            Date cutoffDate = Date.today().addMonths(-18);
            
            List<Pipeline_Snapshot__c> oldSnapshots = [
                SELECT Id FROM Pipeline_Snapshot__c
                WHERE Snapshot_Date__c < :cutoffDate
                LIMIT 10000
            ];
            
            if (!oldSnapshots.isEmpty()) {
                delete oldSnapshots;
                GTMLogger.info('Old snapshots purged', 
                    new Map<String, Object>{'count' => oldSnapshots.size()});
            }
            
            GTMLogger.operationSuccess('purgeOldSnapshots', correlationId, 
                new Map<String, Object>{'deleted' => oldSnapshots.size()});
            
        } catch (Exception e) {
            GTMLogger.operationError('purgeOldSnapshots', correlationId, e, new Map<String, Object>());
            throw e;
        }
    }
}

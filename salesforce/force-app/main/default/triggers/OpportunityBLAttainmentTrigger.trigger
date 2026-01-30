/**
 * OpportunityBLAttainmentTrigger
 * 
 * Triggers real-time BL attainment updates when opportunities move to Closed Won,
 * change ownership, or have ACV modified while Closed Won.
 * 
 * @author GTM Brain
 * @date January 2026
 */
trigger OpportunityBLAttainmentTrigger on Opportunity (after insert, after update) {
    
    // Closed Won stage name
    private static final String CLOSED_WON_STAGE = 'Stage 6. Closed(Won)';
    
    Set<Id> blsToUpdate = new Set<Id>();
    
    for (Opportunity opp : Trigger.new) {
        Opportunity oldOpp = Trigger.isUpdate ? Trigger.oldMap.get(opp.Id) : null;
        
        // Determine trigger conditions
        Boolean isClosedWon = opp.StageName == CLOSED_WON_STAGE;
        Boolean wasClosedWon = oldOpp != null && oldOpp.StageName == CLOSED_WON_STAGE;
        Boolean ownerChanged = oldOpp != null && opp.OwnerId != oldOpp.OwnerId;
        Boolean acvChanged = oldOpp != null && opp.ACV__c != oldOpp.ACV__c;
        
        // Scenario 1: Just moved to Closed Won (new win)
        if (isClosedWon && !wasClosedWon) {
            blsToUpdate.add(opp.OwnerId);
            GTMLogger.priority('P3', 'Trigger', 'Opp moved to Closed Won', 
                new Map<String, Object>{'oppId' => opp.Id, 'ownerId' => opp.OwnerId});
        }
        
        // Scenario 2: Owner changed on a Closed Won opp (reassignment)
        if (isClosedWon && ownerChanged) {
            blsToUpdate.add(opp.OwnerId); // New owner
            if (wasClosedWon) {
                blsToUpdate.add(oldOpp.OwnerId); // Old owner also needs update
            }
            GTMLogger.priority('P3', 'Trigger', 'Closed Won opp ownership changed', 
                new Map<String, Object>{'oppId' => opp.Id, 'newOwner' => opp.OwnerId, 'oldOwner' => oldOpp.OwnerId});
        }
        
        // Scenario 3: ACV changed on a Closed Won opp
        if (isClosedWon && wasClosedWon && acvChanged) {
            blsToUpdate.add(opp.OwnerId);
            GTMLogger.priority('P3', 'Trigger', 'ACV changed on Closed Won opp', 
                new Map<String, Object>{'oppId' => opp.Id, 'oldAcv' => oldOpp.ACV__c, 'newAcv' => opp.ACV__c});
        }
    }
    
    // Call async update for affected BLs
    if (!blsToUpdate.isEmpty()) {
        GTMLogger.info('Queueing BL attainment updates', 
            new Map<String, Object>{'blCount' => blsToUpdate.size()});
        
        // Use @future to avoid mixed DML issues and governor limits
        BLMetricsCalculationService.updateBLsAsync(blsToUpdate);
    }
}

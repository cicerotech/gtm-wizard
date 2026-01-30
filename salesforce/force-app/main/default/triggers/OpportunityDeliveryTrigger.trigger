/**
 * OpportunityDeliveryTrigger
 * 
 * Creates Delivery records when Opportunity stage changes to Stage 4, 5, or Closed Won.
 * Uses DeliveryCreationService for proper multi-product handling and Delivery Links updates.
 * 
 * This complements:
 * - OpportunityLineItemDeliveryTrigger (fires when products added to Stage 4+ opps)
 * - Existing Flow (legacy, only handles Stage 4)
 */
trigger OpportunityDeliveryTrigger on Opportunity (after update) {
    
    // Stages that should trigger Delivery creation
    Set<String> deliveryStages = new Set<String>{
        'Stage 4 - Proposal',
        'Stage 5 - Negotiation',
        'Won',                    // Primary closed won stage (new)
        'Stage 6. Closed(Won)'    // Legacy closed won stage
    };
    
    // Collect Opps where stage changed TO a delivery stage
    List<Id> oppsNeedingDeliveries = new List<Id>();
    
    for (Opportunity opp : Trigger.new) {
        Opportunity oldOpp = Trigger.oldMap.get(opp.Id);
        
        // Check if stage changed
        if (opp.StageName != oldOpp.StageName) {
            // Check if new stage is a delivery stage AND old stage was NOT
            if (deliveryStages.contains(opp.StageName) && !deliveryStages.contains(oldOpp.StageName)) {
                oppsNeedingDeliveries.add(opp.Id);
                System.debug('OpportunityDeliveryTrigger: Stage change to ' + opp.StageName + ' for ' + opp.Name);
            }
        }
    }
    
    if (oppsNeedingDeliveries.isEmpty()) {
        return;
    }
    
    System.debug('OpportunityDeliveryTrigger: Processing ' + oppsNeedingDeliveries.size() + ' Opps');
    
    // Call DeliveryCreationService for each eligible Opp
    // Service handles: multi-product creation, duplicate checking, Delivery Links update
    for (Id oppId : oppsNeedingDeliveries) {
        try {
            DeliveryCreationService.createDeliveriesForOpportunity(oppId, 'Planning');
        } catch (Exception e) {
            System.debug('Error creating deliveries for Opp ' + oppId + ': ' + e.getMessage());
        }
    }
}

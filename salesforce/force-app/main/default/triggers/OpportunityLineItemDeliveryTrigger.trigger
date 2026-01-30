/**
 * OpportunityLineItemDeliveryTrigger
 * 
 * Creates Delivery records when new products are added to Opportunities
 * that are already in Stage 4 (Proposal) or later.
 * 
 * This handles the case where:
 * 1. Opp moves to Stage 4 with Product A → Delivery created for A
 * 2. Later, Product B is added → This trigger creates Delivery for B
 */
trigger OpportunityLineItemDeliveryTrigger on OpportunityLineItem (after insert) {
    
    // Collect Opportunity IDs from new line items
    Set<Id> opportunityIds = new Set<Id>();
    for (OpportunityLineItem oli : Trigger.new) {
        opportunityIds.add(oli.OpportunityId);
    }
    
    // Query Opportunities to check their stage
    Map<Id, Opportunity> opps = new Map<Id, Opportunity>([
        SELECT Id, StageName
        FROM Opportunity
        WHERE Id IN :opportunityIds
        AND StageName IN (
            'Stage 4 - Proposal',
            'Stage 5 - Negotiation',
            'Stage 6. Closed(Won)'
        )
    ]);
    
    // Only process Opps that are in Stage 4 or later
    if (opps.isEmpty()) {
        System.debug('OpportunityLineItemDeliveryTrigger: No eligible Opps (not in Stage 4+)');
        return;
    }
    
    System.debug('OpportunityLineItemDeliveryTrigger: Processing ' + opps.size() + ' Opps in Stage 4+');
    
    // Call DeliveryCreationService for each eligible Opp
    // The service will handle incremental creation (only create for new products)
    for (Id oppId : opps.keySet()) {
        try {
            DeliveryCreationService.createDeliveriesForOpportunity(oppId, 'Planning');
        } catch (Exception e) {
            System.debug('Error creating deliveries for Opp ' + oppId + ': ' + e.getMessage());
        }
    }
}

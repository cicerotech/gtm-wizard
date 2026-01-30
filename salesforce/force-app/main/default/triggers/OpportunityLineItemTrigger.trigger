/**
 * OpportunityLineItemTrigger
 * 
 * Handles all product changes on Opportunities:
 * - After Insert: Create deliveries for Stage 4+ opps (handled by separate trigger)
 * - After Update: Sync delivery values, update Products_Breakdown
 * - After Delete: Update Products_Breakdown, sync delivery links
 * 
 * Keeps Products_Breakdown__c, Delivery_Links__c, and Delivery.Contract_Value__c in sync.
 */
trigger OpportunityLineItemTrigger on OpportunityLineItem (after insert, after update, after delete) {
    
    Set<Id> oppIds = new Set<Id>();
    
    // Collect affected Opportunity IDs
    if (Trigger.isInsert || Trigger.isUpdate) {
        for (OpportunityLineItem oli : Trigger.new) {
            oppIds.add(oli.OpportunityId);
        }
    }
    if (Trigger.isDelete) {
        for (OpportunityLineItem oli : Trigger.old) {
            oppIds.add(oli.OpportunityId);
        }
    }
    
    if (oppIds.isEmpty()) {
        return;
    }
    
    // Update Products_Breakdown for all events
    List<ProductsBreakdownService.BreakdownRequest> breakdownRequests = new List<ProductsBreakdownService.BreakdownRequest>();
    for (Id oppId : oppIds) {
        ProductsBreakdownService.BreakdownRequest req = new ProductsBreakdownService.BreakdownRequest();
        req.opportunityId = oppId;
        breakdownRequests.add(req);
    }
    ProductsBreakdownService.updateProductsBreakdown(breakdownRequests);
    
    // Sync Deliveries with products (for update and delete - insert handled by separate trigger)
    if (Trigger.isUpdate || Trigger.isDelete) {
        // Only sync for Stage 4+ opps where deliveries exist
        Set<Id> stage4PlusOpps = new Set<Id>();
        for (Opportunity opp : [
            SELECT Id FROM Opportunity 
            WHERE Id IN :oppIds 
            AND StageName IN ('Stage 4 - Proposal', 'Stage 5 - Negotiation', 'Stage 6. Closed(Won)')
        ]) {
            stage4PlusOpps.add(opp.Id);
        }
        
        if (!stage4PlusOpps.isEmpty()) {
            DeliverySyncService.syncDeliveries(stage4PlusOpps);
        }
    }
}

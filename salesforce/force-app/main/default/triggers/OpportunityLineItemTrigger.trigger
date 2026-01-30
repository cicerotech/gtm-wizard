/**
 * OpportunityLineItemTrigger
 * 
 * Handles all product changes on Opportunities:
 * - After Insert: Sync Product_Lines_Multi__c, redistribute ACV, create deliveries
 * - After Update: Sync delivery values, update Products_Breakdown
 * - After Delete: Sync Product_Lines_Multi__c, redistribute ACV, update breakdown
 * 
 * Keeps Product_Lines_Multi__c, Products_Breakdown__c, Delivery_Links__c, and 
 * Delivery.Contract_Value__c in sync.
 */
trigger OpportunityLineItemTrigger on OpportunityLineItem (after insert, after update, after delete) {
    
    // Recursion control - prevent infinite loop between this trigger and Flow
    if (ProductLineSyncService.isRunning) {
        System.debug('OpportunityLineItemTrigger: Skipping - ProductLineSyncService is running');
        return;
    }
    
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
    
    // Reverse sync: Update Product_Lines_Multi__c from current products
    if (Trigger.isInsert || Trigger.isDelete) {
        ProductLineSyncService.updateMultiSelectFromLineItems(oppIds);
    }
    
    // Redistribute ACV only on delete (remaining products get equal share)
    // Don't redistribute on insert - the newly added product already has correct price
    if (Trigger.isDelete) {
        ProductLineSyncService.redistributeACV(oppIds);
    }
    
    // Sync Deliveries with products (for update and delete - insert handled by separate trigger)
    if (Trigger.isUpdate || Trigger.isDelete) {
        // Only sync for Stage 4+ opps where deliveries exist
        Set<Id> stage4PlusOpps = new Set<Id>();
        for (Opportunity opp : [
            SELECT Id FROM Opportunity 
            WHERE Id IN :oppIds 
            AND StageName IN ('Stage 4 - Proposal', 'Stage 5 - Negotiation', 'Won', 'Stage 6. Closed(Won)')
        ]) {
            stage4PlusOpps.add(opp.Id);
        }
        
        if (!stage4PlusOpps.isEmpty()) {
            DeliverySyncService.syncDeliveries(stage4PlusOpps);
        }
    }
}

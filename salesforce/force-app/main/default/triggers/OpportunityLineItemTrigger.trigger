/**
 * OpportunityLineItemTrigger
 * 
 * Handles all product changes on Opportunities:
 * - Before Update: Auto-calculate Product_End_Date__c from Start + Term
 * - After Insert: Sync Product_Lines_Multi__c, create deliveries
 * - After Update: Sync delivery values, update Products_Breakdown
 * - After Delete: Sync Product_Lines_Multi__c, redistribute ACV (respecting overrides), update breakdown
 * 
 * Keeps Product_Lines_Multi__c, Products_Breakdown__c, Delivery_Links__c, and 
 * Delivery.Contract_Value__c in sync.
 */
trigger OpportunityLineItemTrigger on OpportunityLineItem (before update, after insert, after update, after delete) {
    
    // === BEFORE UPDATE: Auto-calculate Product End Date ===
    // When a rep sets Product_Start_Date__c and Product_Term_Months__c,
    // we auto-compute Product_End_Date__c = Start + Term months.
    // This runs before DML so we modify the record in memory (no extra update needed).
    if (Trigger.isBefore && Trigger.isUpdate) {
        for (OpportunityLineItem oli : Trigger.new) {
            OpportunityLineItem oldOli = Trigger.oldMap.get(oli.Id);
            
            // Auto-calculate end date when start date or term months change
            if (oli.Product_Start_Date__c != null && oli.Product_Term_Months__c != null) {
                if (oli.Product_Start_Date__c != oldOli.Product_Start_Date__c || 
                    oli.Product_Term_Months__c != oldOli.Product_Term_Months__c) {
                    oli.Product_End_Date__c = oli.Product_Start_Date__c.addMonths(oli.Product_Term_Months__c.intValue());
                }
            }
        }
        return; // Before trigger complete — after trigger will fire separately
    }
    
    // === AFTER TRIGGERS (Insert, Update, Delete) ===
    
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
    
    // Redistribute ACV on delete with override-aware logic
    // Passes deleted count so redistributeACV can determine which products
    // were at the "default" equal share vs manually overridden by the rep
    if (Trigger.isDelete) {
        Map<Id, Integer> deletedCountPerOpp = new Map<Id, Integer>();
        for (OpportunityLineItem oli : Trigger.old) {
            Id oppId = oli.OpportunityId;
            if (!deletedCountPerOpp.containsKey(oppId)) {
                deletedCountPerOpp.put(oppId, 0);
            }
            deletedCountPerOpp.put(oppId, deletedCountPerOpp.get(oppId) + 1);
        }
        ProductLineSyncService.redistributeACV(oppIds, deletedCountPerOpp);
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

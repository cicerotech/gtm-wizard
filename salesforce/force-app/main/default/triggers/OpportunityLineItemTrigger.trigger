/**
 * OpportunityLineItemTrigger
 * 
 * Handles all product changes on Opportunities:
 * - Before Update: Auto-calculate Product_End_Date__c from Start + Term
 * - After Insert: Sync Product_Lines_Multi__c, create deliveries
 * - After Update: Validate product prices sum to Opportunity ACV, sync deliveries, update breakdown
 * - After Delete: Sync Product_Lines_Multi__c, redistribute ACV (respecting overrides), update breakdown
 * 
 * Keeps Product_Lines_Multi__c, Products_Breakdown__c, Delivery_Links__c, and 
 * Delivery.Contract_Value__c in sync. Prevents manual price edits that don't
 * align with the Opportunity ACV.
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
    
    // === ACV Alignment Validation (after update only, manual edits only) ===
    if (Trigger.isUpdate && !ProductLineSyncService.isRunning) {
        Map<Id, Opportunity> opps = new Map<Id, Opportunity>([
            SELECT Id, ACV__c FROM Opportunity WHERE Id IN :oppIds
        ]);
        
        Map<Id, Decimal> productTotals = new Map<Id, Decimal>();
        for (AggregateResult ar : [
            SELECT OpportunityId, SUM(TotalPrice) total
            FROM OpportunityLineItem
            WHERE OpportunityId IN :oppIds
            GROUP BY OpportunityId
        ]) {
            productTotals.put((Id)ar.get('OpportunityId'), (Decimal)ar.get('total'));
        }
        
        Boolean validationFailed = false;
        for (OpportunityLineItem oli : Trigger.new) {
            Decimal acv = opps.get(oli.OpportunityId)?.ACV__c;
            Decimal total = productTotals.get(oli.OpportunityId);
            if (acv != null && total != null && Math.abs(total - acv) > 1.0) {
                oli.addError(
                    'Product prices total $' + total.setScale(0).format() +
                    ' but the Opportunity ACV is $' + acv.setScale(0).format() +
                    '. Please adjust so product prices sum to the Opportunity ACV.'
                );
                validationFailed = true;
            }
        }
        if (validationFailed) {
            return;
        }
    }
    
    // Always update Products Breakdown + TCV (safe — only writes to Opportunity, no recursion)
    List<ProductsBreakdownService.BreakdownRequest> breakdownRequests = new List<ProductsBreakdownService.BreakdownRequest>();
    for (Id oppId : oppIds) {
        ProductsBreakdownService.BreakdownRequest req = new ProductsBreakdownService.BreakdownRequest();
        req.opportunityId = oppId;
        breakdownRequests.add(req);
    }
    ProductsBreakdownService.updateProductsBreakdown(breakdownRequests);
    
    // Recursion control — skip sync/delivery logic when ProductLineSyncService is running
    if (ProductLineSyncService.isRunning) {
        return;
    }
    
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

/**
 * OpportunityLineItemTrigger
 * 
 * Handles after delete events for OpportunityLineItem to update
 * the Products_Breakdown__c field on parent Opportunity.
 */
trigger OpportunityLineItemTrigger on OpportunityLineItem (after delete) {
    
    if (Trigger.isAfter && Trigger.isDelete) {
        // Collect Opportunity IDs from deleted line items
        Set<Id> oppIds = new Set<Id>();
        for (OpportunityLineItem oli : Trigger.old) {
            oppIds.add(oli.OpportunityId);
        }
        
        // Call the service to update breakdown
        if (!oppIds.isEmpty()) {
            ProductsBreakdownService.updateProductsBreakdown(new List<Id>(oppIds));
        }
    }
}


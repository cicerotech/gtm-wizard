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
        
        // Call the service to update breakdown using wrapper class
        if (!oppIds.isEmpty()) {
            List<ProductsBreakdownService.BreakdownRequest> requests = new List<ProductsBreakdownService.BreakdownRequest>();
            for (Id oppId : oppIds) {
                ProductsBreakdownService.BreakdownRequest req = new ProductsBreakdownService.BreakdownRequest();
                req.opportunityId = oppId;
                requests.add(req);
            }
            ProductsBreakdownService.updateProductsBreakdown(requests);
        }
    }
}

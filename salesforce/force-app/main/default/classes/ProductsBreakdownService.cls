/**
 * ProductsBreakdownService
 * 
 * Invocable Apex class that updates the Products_Breakdown__c field
 * on Opportunity with a formatted list of products and amounts.
 * 
 * Called by Flow when OpportunityLineItems are created, updated, or deleted.
 */
public class ProductsBreakdownService {
    
    /**
     * Request wrapper for invocable method
     * This allows Flow to pass a single Opportunity ID per invocation
     */
    public class BreakdownRequest {
        @InvocableVariable(label='Opportunity ID' required=true)
        public Id opportunityId;
    }
    
    @InvocableMethod(label='Update Products Breakdown' description='Updates the Products_Breakdown__c field on Opportunity with formatted product list')
    public static void updateProductsBreakdown(List<BreakdownRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return;
        }
        
        // Collect unique Opportunity IDs from requests
        Set<Id> uniqueOppIds = new Set<Id>();
        for (BreakdownRequest req : requests) {
            if (req.opportunityId != null) {
                uniqueOppIds.add(req.opportunityId);
            }
        }
        
        if (uniqueOppIds.isEmpty()) {
            return;
        }
        
        // Query opportunities with their line items
        List<Opportunity> opps = [
            SELECT Id, Products_Breakdown__c,
                   (SELECT Id, Product2.Name, TotalPrice 
                    FROM OpportunityLineItems 
                    ORDER BY TotalPrice DESC)
            FROM Opportunity
            WHERE Id IN :uniqueOppIds
        ];
        
        List<Opportunity> oppsToUpdate = new List<Opportunity>();
        
        for (Opportunity opp : opps) {
            String breakdown = buildBreakdown(opp.OpportunityLineItems);
            
            // Only update if changed
            if (opp.Products_Breakdown__c != breakdown) {
                opp.Products_Breakdown__c = breakdown;
                oppsToUpdate.add(opp);
            }
        }
        
        if (!oppsToUpdate.isEmpty()) {
            update oppsToUpdate;
        }
    }
    
    /**
     * Build the formatted breakdown string from line items
     */
    private static String buildBreakdown(List<OpportunityLineItem> lineItems) {
        if (lineItems == null || lineItems.isEmpty()) {
            return null;
        }
        
        List<String> lines = new List<String>();
        Decimal total = 0;
        
        for (OpportunityLineItem oli : lineItems) {
            String productName = oli.Product2.Name;
            Decimal price = oli.TotalPrice != null ? oli.TotalPrice : 0;
            total += price;
            
            // Format price
            String priceStr = formatCurrency(price);
            
            lines.add('• ' + productName + ': ' + priceStr);
        }
        
        // Add blank line and total
        lines.add('');
        lines.add('Total: ' + formatCurrency(total));
        
        return String.join(lines, '\n');
    }
    
    /**
     * Format currency value as "$XXK" or "$XXX,XXX"
     */
    private static String formatCurrency(Decimal value) {
        if (value == null) {
            return '$0';
        }
        
        if (value >= 1000000) {
            // $X.XM format for millions
            Decimal millions = value / 1000000;
            return '$' + millions.setScale(1) + 'M';
        } else if (value >= 1000) {
            // $XXXK format for thousands
            return '$' + String.valueOf(Math.round(value / 1000)) + 'K';
        } else {
            return '$' + String.valueOf(value.setScale(0));
        }
    }
}

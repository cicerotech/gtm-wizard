/**
 * ProductsBreakdownService
 * 
 * Invocable Apex class that updates Opportunity fields from product line items:
 * - Products_Breakdown__c: Formatted list of products, amounts, and terms
 * - TCV_Calculated__c: Total Contract Value = SUM(each product's ACV × Term/12)
 * - Term__c: Longest term across all products (reflects full deal duration)
 * 
 * Called by OpportunityLineItemTrigger when products are created, updated, or deleted.
 */
public class ProductsBreakdownService {
    
    /**
     * Request wrapper for invocable method
     */
    public class BreakdownRequest {
        @InvocableVariable(label='Opportunity ID' required=true)
        public Id opportunityId;
    }
    
    @InvocableMethod(label='Update Products Breakdown' description='Updates Products_Breakdown__c, TCV_Calculated__c, and Term__c from product line items')
    public static void updateProductsBreakdown(List<BreakdownRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return;
        }
        
        Set<Id> uniqueOppIds = new Set<Id>();
        for (BreakdownRequest req : requests) {
            if (req.opportunityId != null) {
                uniqueOppIds.add(req.opportunityId);
            }
        }
        
        if (uniqueOppIds.isEmpty()) {
            return;
        }
        
        // Query opportunities with their line items including term data
        List<Opportunity> opps = [
            SELECT Id, Products_Breakdown__c, TCV__c, Term__c, ACV__c,
                   (SELECT Id, Product2.Name, TotalPrice, Product_Term_Months__c
                    FROM OpportunityLineItems 
                    ORDER BY TotalPrice DESC)
            FROM Opportunity
            WHERE Id IN :uniqueOppIds
        ];
        
        List<Opportunity> oppsToUpdate = new List<Opportunity>();
        
        for (Opportunity opp : opps) {
            List<OpportunityLineItem> lineItems = opp.OpportunityLineItems;
            Boolean changed = false;
            
            // === 1. Build formatted breakdown (now includes term per product) ===
            String breakdown = buildBreakdown(lineItems);
            if (opp.Products_Breakdown__c != breakdown) {
                opp.Products_Breakdown__c = breakdown;
                changed = true;
            }
            
            // === 2. Calculate TCV from individual product terms ===
            // TCV = SUM( each product's ACV × (Product_Term_Months / 12) )
            // If a product has no term, fall back to opp-level Term__c, then default 12
            Decimal calculatedTcv = calculateTCV(lineItems, opp.ACV__c, opp.Term__c);
            if (opp.TCV__c != calculatedTcv) {
                opp.TCV__c = calculatedTcv;
                changed = true;
            }
            
            // === 3. Set Term to longest product term ===
            // When multiple products have different terms, the opp-level Term
            // reflects the longest commitment (full deal duration)
            Decimal longestTerm = getLongestTerm(lineItems, opp.Term__c);
            if (opp.Term__c != longestTerm) {
                opp.Term__c = longestTerm;
                changed = true;
            }
            
            if (changed) {
                oppsToUpdate.add(opp);
            }
        }
        
        if (!oppsToUpdate.isEmpty()) {
            update oppsToUpdate;
        }
    }
    
    /**
     * Calculate Total Contract Value from individual product line items.
     * Each product's TCV = TotalPrice (annual) × (Term_Months / 12)
     * If no line items, TCV = ACV × (Term / 12) as fallback.
     */
    private static Decimal calculateTCV(List<OpportunityLineItem> lineItems, Decimal oppAcv, Decimal oppTerm) {
        if (lineItems == null || lineItems.isEmpty()) {
            Decimal acv = oppAcv != null ? oppAcv : 0;
            Decimal termMonths = oppTerm != null ? oppTerm : 12;
            Decimal multiplier = Math.max(1, termMonths / 12);
            return acv * multiplier;
        }
        
        Decimal totalTcv = 0;
        Decimal defaultTermMonths = oppTerm != null ? oppTerm : 12;
        
        for (OpportunityLineItem oli : lineItems) {
            Decimal productAcv = oli.TotalPrice != null ? oli.TotalPrice : 0;
            Decimal productTermMonths = (oli.Product_Term_Months__c != null && oli.Product_Term_Months__c > 0)
                ? oli.Product_Term_Months__c 
                : defaultTermMonths;
            
            Decimal multiplier = Math.max(1, productTermMonths / 12);
            totalTcv += productAcv * multiplier;
        }
        
        return totalTcv.setScale(2);
    }
    
    /**
     * Get the longest term across all product line items.
     * This represents the full duration of the deal.
     */
    private static Decimal getLongestTerm(List<OpportunityLineItem> lineItems, Decimal currentTerm) {
        if (lineItems == null || lineItems.isEmpty()) {
            return currentTerm; // Keep existing term if no products
        }
        
        Decimal longest = currentTerm != null ? currentTerm : 0;
        
        for (OpportunityLineItem oli : lineItems) {
            if (oli.Product_Term_Months__c != null && oli.Product_Term_Months__c > longest) {
                longest = oli.Product_Term_Months__c;
            }
        }
        
        return longest > 0 ? longest : 12; // Default 12 months if nothing set
    }
    
    /**
     * Build the formatted breakdown string from line items.
     * Now includes per-product term when set.
     * Format: "• Product Name: $XXK (24 mo)" or "• Product Name: $XXK" if no term
     */
    private static String buildBreakdown(List<OpportunityLineItem> lineItems) {
        if (lineItems == null || lineItems.isEmpty()) {
            return null;
        }
        
        List<String> lines = new List<String>();
        Decimal totalAcv = 0;
        Decimal totalTcv = 0;
        
        for (OpportunityLineItem oli : lineItems) {
            String productName = oli.Product2.Name;
            Decimal price = oli.TotalPrice != null ? oli.TotalPrice : 0;
            totalAcv += price;
            
            String line = '• ' + productName + ': ' + formatCurrency(price);
            
            if (oli.Product_Term_Months__c != null && oli.Product_Term_Months__c > 0) {
                Integer termMonths = oli.Product_Term_Months__c.intValue();
                line += ' (' + termMonths + ' mo)';
                Decimal multiplier = Math.max(1, oli.Product_Term_Months__c / 12);
                totalTcv += price * multiplier;
            } else {
                totalTcv += price;
            }
            
            lines.add(line);
        }
        
        // Add totals
        lines.add('');
        lines.add('ACV Total: ' + formatCurrency(totalAcv));
        if (totalTcv != totalAcv) {
            lines.add('TCV Total: ' + formatCurrency(totalTcv));
        }
        
        return String.join(lines, '\n');
    }
    
    /**
     * Format currency value as "$XXK" or "$X.XM"
     */
    private static String formatCurrency(Decimal value) {
        if (value == null) {
            return '$0';
        }
        
        if (value >= 1000000) {
            Decimal millions = value / 1000000;
            return '$' + millions.setScale(1) + 'M';
        } else if (value >= 1000) {
            return '$' + String.valueOf(Math.round(value / 1000)) + 'K';
        } else {
            return '$' + String.valueOf(value.setScale(0));
        }
    }
}

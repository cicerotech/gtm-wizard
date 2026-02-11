/**
 * ProductLineSyncService
 * 
 * Syncs the Product_Lines_Multi__c multi-select picklist with OpportunityLineItems.
 * When users select products in the multi-select, this creates the corresponding
 * line items. When they deselect, it removes them.
 * 
 * Price Logic: ACV is divided equally among all selected products as a default.
 * Example: $120K ACV with 2 products = $60K each.
 * Reps can override individual product prices via "Edit Products" -- the flow
 * will NOT overwrite manually adjusted prices on subsequent multi-select changes.
 * 
 * This provides a simple dropdown UX while maintaining the Products related list.
 * 
 * @author GTM Brain
 * @date January 2026
 */
public class ProductLineSyncService {
    
    // Recursion control flag - prevents infinite loop between trigger and flow
    public static Boolean isRunning = false;
    
    // Default ACV if opportunity has no ACV set
    private static final Decimal DEFAULT_ACV = 120000.00;
    
    // Test-visible pricebook ID override — allows unit tests to bypass the
    // Standard Pricebook SOQL query which can be unreliable in test context.
    @TestVisible private static Id testPricebookId;
    
    /**
     * Request wrapper for invocable method
     */
    public class SyncRequest {
        @InvocableVariable(label='Opportunity ID' required=true)
        public Id opportunityId;
        
        @InvocableVariable(label='Selected Product Lines (semicolon-separated)')
        public String selectedProductLines;
    }
    
    /**
     * Sync multi-select picklist with OpportunityLineItems
     * Called by Flow when Product_Lines_Multi__c changes
     * 
     * Logic:
     * 1. Get the Opportunity's ACV
     * 2. Divide ACV by number of selected products
     * 3. Set each NEW product's price to that amount (equal distribution default)
     * 4. PRESERVE existing products' prices (allow rep overrides)
     */
    @InvocableMethod(label='Sync Product Lines to Line Items' description='Creates/removes OpportunityLineItems based on multi-select product line field')
    public static void syncProductLines(List<SyncRequest> requests) {
        if (requests == null || requests.isEmpty()) return;
        
        // Recursion control - skip if already running (prevents loop with trigger)
        if (isRunning) {
            System.debug('ProductLineSyncService.syncProductLines: Skipping - already running');
            return;
        }
        
        // Set recursion flag to prevent trigger from firing back
        isRunning = true;
        
        // Get Standard Pricebook
        Pricebook2 standardPB;
        if (testPricebookId != null) {
            // Use injected pricebook ID (test context)
            standardPB = new Pricebook2(Id = testPricebookId);
        } else {
            try {
                standardPB = [SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1];
            } catch (Exception e) {
                System.debug('No Standard Pricebook found: ' + e.getMessage());
                return;
            }
        }
        
        // Get all Products with their PricebookEntries
        Map<String, PricebookEntry> productNameToPBE = new Map<String, PricebookEntry>();
        for (PricebookEntry pbe : [
            SELECT Id, Product2Id, Product2.Name, UnitPrice 
            FROM PricebookEntry 
            WHERE Pricebook2Id = :standardPB.Id AND IsActive = true
        ]) {
            productNameToPBE.put(pbe.Product2.Name, pbe);
        }
        
        List<OpportunityLineItem> toInsert = new List<OpportunityLineItem>();
        List<OpportunityLineItem> toDelete = new List<OpportunityLineItem>();
        List<OpportunityLineItem> toUpdate = new List<OpportunityLineItem>();
        List<Opportunity> oppsToUpdate = new List<Opportunity>();
        
        for (SyncRequest req : requests) {
            if (req.opportunityId == null) continue;
            
            // Parse selected products (multi-select values are semicolon-separated)
            // Skip placeholder values that are flags, not actual products
            // Note: "Multiple (BL Review)" was deactivated Jan 2026
            Set<String> selectedProducts = new Set<String>();
            Set<String> skipValues = new Set<String>{'Undetermined'};
            
            if (String.isNotBlank(req.selectedProductLines)) {
                for (String product : req.selectedProductLines.split(';')) {
                    String trimmed = product.trim();
                    // Skip placeholder flags - they don't create products
                    if (!skipValues.contains(trimmed)) {
                        selectedProducts.add(trimmed);
                    }
                }
            }
            
            // Get existing line items for this opportunity
            Map<String, OpportunityLineItem> existingProducts = new Map<String, OpportunityLineItem>();
            for (OpportunityLineItem oli : [
                SELECT Id, Product2Id, Product2.Name, UnitPrice 
                FROM OpportunityLineItem 
                WHERE OpportunityId = :req.opportunityId
            ]) {
                existingProducts.put(oli.Product2.Name, oli);
            }
            
            // Get Opportunity with ACV
            Opportunity opp = [SELECT Id, Pricebook2Id, ACV__c FROM Opportunity WHERE Id = :req.opportunityId LIMIT 1];
            
            // Ensure Opp has Pricebook assigned
            if (opp.Pricebook2Id == null) {
                opp.Pricebook2Id = standardPB.Id;
                oppsToUpdate.add(opp);
            }
            
            // Calculate price per product: ACV / number of products
            // SAFEGUARD: If ACV is null, 0, or negative, use the default
            Decimal oppACV = (opp.ACV__c != null && opp.ACV__c > 0) ? opp.ACV__c : DEFAULT_ACV;
            Integer productCount = selectedProducts.size();
            Decimal pricePerProduct = productCount > 0 ? oppACV / productCount : oppACV;
            
            // SAFEGUARD: Never allow $0 or negative prices
            if (pricePerProduct <= 0) {
                pricePerProduct = DEFAULT_ACV / Math.max(productCount, 1);
                System.debug('WARNING: Calculated price was $0 or negative. Using default: $' + pricePerProduct);
            }
            
            // Round to 2 decimal places
            pricePerProduct = pricePerProduct.setScale(2, RoundingMode.HALF_UP);
            
            System.debug('ACV: ' + oppACV + ', Products: ' + productCount + ', Price each: ' + pricePerProduct);
            
            // Add new products (selected but not existing)
            for (String productName : selectedProducts) {
                if (!existingProducts.containsKey(productName)) {
                    // Need to add this product
                    PricebookEntry pbe = productNameToPBE.get(productName);
                    if (pbe != null) {
                        OpportunityLineItem oli = new OpportunityLineItem(
                            OpportunityId = req.opportunityId,
                            PricebookEntryId = pbe.Id,
                            Quantity = 1,
                            UnitPrice = pricePerProduct
                        );
                        toInsert.add(oli);
                        System.debug('Adding product: ' + productName + ' at $' + pricePerProduct);
                    } else {
                        System.debug('Product not found in Pricebook: ' + productName);
                    }
                } else {
                    // Product exists - DO NOT overwrite user-customized prices.
                    // Only auto-set prices on brand new products (inserts above).
                    // Existing products retain their current UnitPrice so reps
                    // can override ACV distribution per product line.
                    System.debug('Product exists, keeping current price: ' + productName + ' at $' + existingProducts.get(productName).UnitPrice);
                }
            }
            
            // Remove products (existing but not selected)
            for (String existingProductName : existingProducts.keySet()) {
                if (!selectedProducts.contains(existingProductName)) {
                    toDelete.add(existingProducts.get(existingProductName));
                    System.debug('Removing product: ' + existingProductName);
                }
            }
        }
        
        // Perform DML
        if (!oppsToUpdate.isEmpty()) {
            update oppsToUpdate;
        }
        
        if (!toDelete.isEmpty()) {
            delete toDelete;
        }
        
        if (!toUpdate.isEmpty()) {
            update toUpdate;
        }
        
        if (!toInsert.isEmpty()) {
            insert toInsert;
        }
        
        // Reset recursion flag
        isRunning = false;
    }
    
    /**
     * Reverse sync: Update multi-select field from line items
     * Call this when line items are added/removed directly
     */
    public static void updateMultiSelectFromLineItems(Set<Id> opportunityIds) {
        if (opportunityIds == null || opportunityIds.isEmpty()) return;
        
        // Set recursion flag to prevent Flow from firing back
        isRunning = true;
        
        List<Opportunity> oppsToUpdate = new List<Opportunity>();
        
        for (Id oppId : opportunityIds) {
            List<OpportunityLineItem> lineItems = [
                SELECT Product2.Name 
                FROM OpportunityLineItem 
                WHERE OpportunityId = :oppId
            ];
            
            List<String> productNames = new List<String>();
            for (OpportunityLineItem oli : lineItems) {
                productNames.add(oli.Product2.Name);
            }
            
            Opportunity opp = new Opportunity(
                Id = oppId,
                Product_Lines_Multi__c = String.join(productNames, ';')
            );
            oppsToUpdate.add(opp);
        }
        
        if (!oppsToUpdate.isEmpty()) {
            update oppsToUpdate;
        }
        
        isRunning = false;
    }
    
    /**
     * Redistribute ACV among non-overridden products on an opportunity.
     * Called when products are deleted directly (not via multi-select).
     * 
     * Override detection: Products whose UnitPrice matches the equal distribution
     * that was in effect BEFORE the delete (ACV / originalCount) are considered
     * "default" (system-set) and eligible for redistribution. Products with a
     * different price were manually customized by the rep and are left untouched.
     * 
     * If ALL remaining products are overridden, skip redistribution entirely --
     * the ACV_Products_Mismatch__c formula will flag the discrepancy.
     * 
     * @param opportunityIds       Set of affected Opportunity IDs
     * @param deletedCountPerOpp   Map of Opp ID → number of items just deleted
     */
    public static void redistributeACV(Set<Id> opportunityIds, Map<Id, Integer> deletedCountPerOpp) {
        if (opportunityIds == null || opportunityIds.isEmpty()) return;
        
        List<OpportunityLineItem> toUpdate = new List<OpportunityLineItem>();
        
        for (Id oppId : opportunityIds) {
            // Get opportunity ACV
            Opportunity opp = [SELECT Id, ACV__c FROM Opportunity WHERE Id = :oppId LIMIT 1];
            Decimal acv = (opp.ACV__c != null && opp.ACV__c > 0) ? opp.ACV__c : DEFAULT_ACV;
            
            // Get remaining line items
            List<OpportunityLineItem> remaining = [
                SELECT Id, UnitPrice 
                FROM OpportunityLineItem 
                WHERE OpportunityId = :oppId
            ];
            
            if (remaining.isEmpty()) continue;
            
            // Calculate what the equal share was BEFORE the delete
            Integer deletedCount = (deletedCountPerOpp != null && deletedCountPerOpp.containsKey(oppId)) 
                ? deletedCountPerOpp.get(oppId) : 0;
            Integer originalCount = remaining.size() + deletedCount;
            Decimal preDeleteEqualShare = (acv / originalCount).setScale(2, RoundingMode.HALF_UP);
            
            // Separate overridden vs default products
            // A product is "default" if its price matches the pre-delete equal share (within $0.01 tolerance)
            List<OpportunityLineItem> defaultItems = new List<OpportunityLineItem>();
            Decimal overriddenTotal = 0;
            
            for (OpportunityLineItem oli : remaining) {
                if (Math.abs(oli.UnitPrice - preDeleteEqualShare) < 0.01) {
                    // This product still has the system-set default price
                    defaultItems.add(oli);
                } else {
                    // This product was manually customized by the rep
                    overriddenTotal += oli.UnitPrice;
                }
            }
            
            // If all products are overridden, skip redistribution
            // The ACV_Products_Mismatch__c formula will flag the discrepancy
            if (defaultItems.isEmpty()) {
                System.debug('redistributeACV: All remaining products have custom prices for Opp ' + oppId + '. Skipping redistribution.');
                continue;
            }
            
            // Redistribute remaining ACV among default (non-overridden) products
            Decimal remainingACV = acv - overriddenTotal;
            Decimal newPrice = (remainingACV / defaultItems.size()).setScale(2, RoundingMode.HALF_UP);
            
            // SAFEGUARD: Don't set negative or zero prices
            if (newPrice <= 0) {
                System.debug('WARNING: Calculated redistribution price is $0 or negative for Opp ' + oppId + '. Skipping.');
                continue;
            }
            
            for (OpportunityLineItem oli : defaultItems) {
                if (Math.abs(oli.UnitPrice - newPrice) >= 0.01) {
                    oli.UnitPrice = newPrice;
                    toUpdate.add(oli);
                }
            }
            
            System.debug('redistributeACV: Opp ' + oppId + ' - ' + defaultItems.size() + 
                ' default products updated to $' + newPrice + ' each. ' + 
                (remaining.size() - defaultItems.size()) + ' overridden products kept.');
        }
        
        if (!toUpdate.isEmpty()) {
            update toUpdate;
        }
    }
    
    /**
     * Legacy overload for backward compatibility.
     * Calls the override-aware version with an empty deleted count map.
     */
    public static void redistributeACV(Set<Id> opportunityIds) {
        redistributeACV(opportunityIds, new Map<Id, Integer>());
    }
}


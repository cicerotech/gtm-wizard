/**
 * ProductLineSyncService
 * 
 * Syncs the Product_Lines_Multi__c multi-select picklist with OpportunityLineItems.
 * When users select products in the multi-select, this creates the corresponding
 * line items. When they deselect, it removes them.
 * 
 * This provides a simple dropdown UX while maintaining the Products related list.
 * 
 * @author GTM Brain
 * @date January 2026
 */
public class ProductLineSyncService {
    
    // Default ACV for new products
    private static final Decimal DEFAULT_ACV = 120000.00;
    
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
     */
    @InvocableMethod(label='Sync Product Lines to Line Items' description='Creates/removes OpportunityLineItems based on multi-select product line field')
    public static void syncProductLines(List<SyncRequest> requests) {
        if (requests == null || requests.isEmpty()) return;
        
        // Get Standard Pricebook
        Pricebook2 standardPB;
        try {
            standardPB = [SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1];
        } catch (Exception e) {
            System.debug('No Standard Pricebook found: ' + e.getMessage());
            return;
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
        List<Opportunity> oppsToUpdate = new List<Opportunity>();
        
        for (SyncRequest req : requests) {
            if (req.opportunityId == null) continue;
            
            // Parse selected products (multi-select values are semicolon-separated)
            Set<String> selectedProducts = new Set<String>();
            if (String.isNotBlank(req.selectedProductLines)) {
                for (String product : req.selectedProductLines.split(';')) {
                    selectedProducts.add(product.trim());
                }
            }
            
            // Get existing line items for this opportunity
            Map<String, OpportunityLineItem> existingProducts = new Map<String, OpportunityLineItem>();
            for (OpportunityLineItem oli : [
                SELECT Id, Product2Id, Product2.Name 
                FROM OpportunityLineItem 
                WHERE OpportunityId = :req.opportunityId
            ]) {
                existingProducts.put(oli.Product2.Name, oli);
            }
            
            // Ensure Opp has Pricebook assigned
            Opportunity opp = [SELECT Id, Pricebook2Id FROM Opportunity WHERE Id = :req.opportunityId LIMIT 1];
            if (opp.Pricebook2Id == null) {
                opp.Pricebook2Id = standardPB.Id;
                oppsToUpdate.add(opp);
            }
            
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
                            UnitPrice = pbe.UnitPrice != null ? pbe.UnitPrice : DEFAULT_ACV
                        );
                        toInsert.add(oli);
                        System.debug('Adding product: ' + productName);
                    } else {
                        System.debug('Product not found in Pricebook: ' + productName);
                    }
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
        
        if (!toInsert.isEmpty()) {
            insert toInsert;
        }
    }
    
    /**
     * Reverse sync: Update multi-select field from line items
     * Call this when line items are added/removed directly
     */
    public static void updateMultiSelectFromLineItems(Set<Id> opportunityIds) {
        if (opportunityIds == null || opportunityIds.isEmpty()) return;
        
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
    }
}


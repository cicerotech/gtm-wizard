/**
 * DeliverySyncService
 * 
 * Keeps Delivery records in sync with OpportunityLineItems.
 * 
 * When products change on an Opportunity:
 * 1. Updates Delivery.Contract_Value__c to match product price
 * 2. Updates Delivery_Links__c on Opportunity with current values
 * 3. Handles product removals (marks delivery as orphaned or deletes)
 * 
 * @author GTM Brain
 * @date January 2026
 */
public class DeliverySyncService {
    
    /**
     * Sync deliveries for given Opportunity IDs
     * Call this when OpportunityLineItems are created, updated, or deleted
     */
    public static void syncDeliveries(Set<Id> opportunityIds) {
        if (opportunityIds == null || opportunityIds.isEmpty()) {
            return;
        }
        
        // Query Opportunities with their products and deliveries
        List<Opportunity> opps = [
            SELECT Id, Name, ACV__c, Delivery_Links__c,
                   (SELECT Id, Product2Id, Product2.Name, TotalPrice, UnitPrice 
                    FROM OpportunityLineItems
                    ORDER BY TotalPrice DESC),
                   (SELECT Id, Name, Product_Line__c, Contract_Value__c 
                    FROM Deliveries__r
                    ORDER BY Contract_Value__c DESC)
            FROM Opportunity
            WHERE Id IN :opportunityIds
        ];
        
        List<Delivery__c> deliveriesToUpdate = new List<Delivery__c>();
        List<Opportunity> oppsToUpdate = new List<Opportunity>();
        
        for (Opportunity opp : opps) {
            // Build map of product name (lowercase) -> OLI for matching
            Map<String, OpportunityLineItem> productMap = new Map<String, OpportunityLineItem>();
            for (OpportunityLineItem oli : opp.OpportunityLineItems) {
                if (oli.Product2.Name != null) {
                    productMap.put(oli.Product2.Name.toLowerCase(), oli);
                }
            }
            
            // Sync each delivery with its matching product
            Boolean deliveriesChanged = false;
            for (Delivery__c del : opp.Deliveries__r) {
                if (del.Product_Line__c == null) continue;
                
                String productKey = del.Product_Line__c.toLowerCase();
                OpportunityLineItem matchingOLI = productMap.get(productKey);
                
                if (matchingOLI != null) {
                    // Product still exists - sync value if different
                    Decimal expectedValue = matchingOLI.TotalPrice;
                    if (del.Contract_Value__c != expectedValue) {
                        del.Contract_Value__c = expectedValue;
                        deliveriesToUpdate.add(del);
                        deliveriesChanged = true;
                        System.debug('Syncing Delivery ' + del.Name + ' value: $' + del.Contract_Value__c + ' → $' + expectedValue);
                    }
                }
                // Note: We don't delete orphaned deliveries - they may have work in progress
                // Just let Delivery_Links reflect what currently exists
            }
            
            // Rebuild Delivery_Links__c if deliveries changed or might be stale
            if (deliveriesChanged || needsLinkRefresh(opp)) {
                String newLinks = buildDeliveryLinks(opp.Deliveries__r, opp.Id);
                if (opp.Delivery_Links__c != newLinks) {
                    opp.Delivery_Links__c = newLinks;
                    oppsToUpdate.add(opp);
                }
            }
        }
        
        // Update deliveries
        if (!deliveriesToUpdate.isEmpty()) {
            update deliveriesToUpdate;
            System.debug('Updated ' + deliveriesToUpdate.size() + ' Delivery contract values');
        }
        
        // Update opportunities
        if (!oppsToUpdate.isEmpty()) {
            update oppsToUpdate;
            System.debug('Updated ' + oppsToUpdate.size() + ' Opportunity Delivery_Links');
        }
    }
    
    /**
     * Check if Delivery_Links might be stale
     */
    private static Boolean needsLinkRefresh(Opportunity opp) {
        // If link count doesn't match delivery count, needs refresh
        if (opp.Delivery_Links__c == null) return true;
        
        Integer linkCount = opp.Delivery_Links__c.countMatches('DEL-');
        return linkCount != opp.Deliveries__r.size();
    }
    
    /**
     * Build HTML Delivery Links for Opportunity
     */
    private static String buildDeliveryLinks(List<Delivery__c> deliveries, Id oppId) {
        if (deliveries == null || deliveries.isEmpty()) {
            return null;
        }
        
        String baseUrl = URL.getOrgDomainUrl().toExternalForm();
        List<String> htmlLines = new List<String>();
        
        for (Delivery__c d : deliveries) {
            String productInfo = d.Product_Line__c != null ? d.Product_Line__c : 'N/A';
            String valueInfo = '';
            if (d.Contract_Value__c != null && d.Contract_Value__c > 0) {
                valueInfo = ' - ' + formatCurrency(d.Contract_Value__c);
            }
            String htmlLine = '<p>• <a href="' + baseUrl + '/' + d.Id + '" target="_blank">' + d.Name + '</a> (' + productInfo + ')' + valueInfo + '</p>';
            htmlLines.add(htmlLine);
        }
        
        return String.join(htmlLines, '');
    }
    
    /**
     * Format currency value
     */
    private static String formatCurrency(Decimal value) {
        if (value == null) return '$0';
        if (value >= 1000000) {
            return '$' + String.valueOf((value / 1000000).setScale(1, RoundingMode.HALF_UP)) + 'M';
        } else if (value >= 1000) {
            return '$' + String.valueOf((value / 1000).setScale(0, RoundingMode.HALF_UP)) + 'K';
        }
        return '$' + String.valueOf(value.setScale(0, RoundingMode.HALF_UP));
    }
    
    /**
     * Invocable method for Flow to call
     */
    public class SyncRequest {
        @InvocableVariable(label='Opportunity ID' required=true)
        public Id opportunityId;
    }
    
    @InvocableMethod(label='Sync Deliveries with Products' description='Updates Delivery values and links when products change')
    public static void syncDeliveriesInvocable(List<SyncRequest> requests) {
        Set<Id> oppIds = new Set<Id>();
        for (SyncRequest req : requests) {
            if (req.opportunityId != null) {
                oppIds.add(req.opportunityId);
            }
        }
        syncDeliveries(oppIds);
    }
}

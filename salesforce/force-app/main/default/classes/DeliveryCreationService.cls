/**
 * DeliveryCreationService
 * 
 * Creates Delivery records from Opportunity, supporting multi-product deals.
 * 
 * LOGIC:
 * 1. If Opportunity has OpportunityLineItems → Create one Delivery per line item
 * 2. If no line items → Fall back to single Delivery using Product_Line__c (legacy)
 * 
 * This can be called from:
 * - Flow (via Invocable Method)
 * - Apex Trigger
 * - Anonymous Apex for testing
 * 
 * @author GTM Brain
 * @date January 2026
 */
public class DeliveryCreationService {
    
    /**
     * Request wrapper for invocable method
     */
    public class DeliveryRequest {
        @InvocableVariable(label='Opportunity ID' required=true)
        public Id opportunityId;
        
        @InvocableVariable(label='Default Status' required=false)
        public String defaultStatus;
    }
    
    /**
     * Result wrapper for invocable method
     */
    public class DeliveryResult {
        @InvocableVariable(label='Deliveries Created')
        public Integer deliveriesCreated;
        
        @InvocableVariable(label='Delivery IDs')
        public List<Id> deliveryIds;
        
        @InvocableVariable(label='Success')
        public Boolean success;
        
        @InvocableVariable(label='Error Message')
        public String errorMessage;
    }
    
    /**
     * Create Deliveries from Opportunity - Invocable Method for Flows
     * 
     * @param requests List of DeliveryRequest containing Opportunity IDs
     * @return List of DeliveryResult with created Delivery IDs
     */
    @InvocableMethod(label='Create Deliveries from Opportunity' description='Creates Delivery records for an Opportunity. If multiple products exist, creates one Delivery per product.')
    public static List<DeliveryResult> createDeliveriesInvocable(List<DeliveryRequest> requests) {
        List<DeliveryResult> results = new List<DeliveryResult>();
        
        for (DeliveryRequest request : requests) {
            DeliveryResult result = new DeliveryResult();
            result.deliveryIds = new List<Id>();
            
            try {
                List<Delivery__c> deliveries = createDeliveriesForOpportunity(
                    request.opportunityId, 
                    request.defaultStatus
                );
                
                result.deliveriesCreated = deliveries.size();
                for (Delivery__c d : deliveries) {
                    result.deliveryIds.add(d.Id);
                }
                result.success = true;
                
            } catch (Exception e) {
                result.success = false;
                result.deliveriesCreated = 0;
                result.errorMessage = e.getMessage();
                System.debug('Error creating deliveries: ' + e.getMessage());
            }
            
            results.add(result);
        }
        
        return results;
    }
    
    /**
     * Create Deliveries for a single Opportunity
     * 
     * @param opportunityId The Opportunity ID
     * @param defaultStatus The default status for new Deliveries (defaults to 'Planning')
     * @return List of created Delivery__c records
     */
    public static List<Delivery__c> createDeliveriesForOpportunity(Id opportunityId, String defaultStatus) {
        if (String.isBlank(defaultStatus)) {
            defaultStatus = 'Planning';
        }
        
        // Query Opportunity with line items
        Opportunity opp = [
            SELECT Id, Name, AccountId, Account.Name, OwnerId, 
                   ACV__c, Product_Line__c, Target_LOI_Date__c, CloseDate,
                   (SELECT Id, Product2Id, Product2.Name, Product2.Family, 
                           Quantity, UnitPrice, TotalPrice 
                    FROM OpportunityLineItems
                    ORDER BY TotalPrice DESC)
            FROM Opportunity
            WHERE Id = :opportunityId
            LIMIT 1
        ];
        
        // Check if deliveries already exist for this opportunity
        List<Delivery__c> existingDeliveries = [
            SELECT Id FROM Delivery__c WHERE Opportunity__c = :opportunityId
        ];
        
        if (!existingDeliveries.isEmpty()) {
            System.debug('Deliveries already exist for this Opportunity. Skipping creation.');
            return existingDeliveries;
        }
        
        List<Delivery__c> deliveriesToCreate = new List<Delivery__c>();
        
        if (!opp.OpportunityLineItems.isEmpty()) {
            // ============================================================
            // PATH A: Opportunity has Products - Create Delivery per product
            // ============================================================
            System.debug('Creating Deliveries from ' + opp.OpportunityLineItems.size() + ' line items...');
            
            for (OpportunityLineItem oli : opp.OpportunityLineItems) {
                Delivery__c delivery = new Delivery__c();
                
                // Standard mappings (Name is auto-generated)
                delivery.Opportunity__c = opp.Id;
                delivery.Account__c = opp.AccountId;
                delivery.Eudia_Delivery_Owner__c = opp.OwnerId;
                
                // Product-specific fields
                delivery.Product_Line__c = oli.Product2.Name;
                delivery.Contract_Value__c = oli.TotalPrice;
                
                // Date fields - use Kickoff_Date__c for target start
                delivery.Kickoff_Date__c = opp.Target_LOI_Date__c;
                
                // Required fields
                delivery.Delivery_Model__c = 'AI-First (95% AI / 5% Human)';  // Default, can be updated later
                
                deliveriesToCreate.add(delivery);
                
                System.debug('  → Delivery for: ' + oli.Product2.Name + ' ($' + oli.TotalPrice + ')');
            }
            
        } else {
            // ============================================================
            // PATH B: No Products - Fall back to single Delivery (legacy)
            // ============================================================
            System.debug('No line items found. Using legacy Product_Line__c field...');
            
            Delivery__c delivery = new Delivery__c();
            
            // Name is auto-generated, don't set it
            delivery.Opportunity__c = opp.Id;
            delivery.Account__c = opp.AccountId;
            delivery.Eudia_Delivery_Owner__c = opp.OwnerId;
            delivery.Product_Line__c = opp.Product_Line__c;
            delivery.Contract_Value__c = opp.ACV__c;
            delivery.Kickoff_Date__c = opp.Target_LOI_Date__c;
            
            // Required fields
            delivery.Delivery_Model__c = 'AI-First (95% AI / 5% Human)';  // Default, can be updated later
            
            deliveriesToCreate.add(delivery);
            
            System.debug('  → Delivery for: ' + opp.Product_Line__c + ' ($' + opp.ACV__c + ')');
        }
        
        // Insert Deliveries
        if (!deliveriesToCreate.isEmpty()) {
            insert deliveriesToCreate;
            
            System.debug('Created ' + deliveriesToCreate.size() + ' Delivery record(s)');
            
            // Re-query to get auto-generated Name field (DEL-XXXX)
            Set<Id> deliveryIds = new Set<Id>();
            for (Delivery__c d : deliveriesToCreate) {
                deliveryIds.add(d.Id);
            }
            List<Delivery__c> deliveriesWithNames = [
                SELECT Id, Name, Product_Line__c, Contract_Value__c 
                FROM Delivery__c 
                WHERE Id IN :deliveryIds
                ORDER BY Contract_Value__c DESC
            ];
            
            // Update Opportunity with Delivery summary and primary Delivery link
            updateOpportunityWithDeliveries(opp.Id, deliveriesWithNames);
            
            return deliveriesWithNames;
        }
        
        return deliveriesToCreate;
    }
    
    /**
     * Update Opportunity with Delivery summary and primary Delivery link
     * 
     * @param opportunityId The Opportunity ID
     * @param deliveries List of created Delivery records
     */
    private static void updateOpportunityWithDeliveries(Id opportunityId, List<Delivery__c> deliveries) {
        if (deliveries == null || deliveries.isEmpty()) return;
        
        // Get base URL for hyperlinks
        String baseUrl = URL.getOrgDomainUrl().toExternalForm();
        
        // Build summary text (plain text for All_Delivery_Codes__c)
        List<String> summaryLines = new List<String>();
        // Build HTML links (for Delivery_Links__c Rich Text field)
        List<String> htmlLines = new List<String>();
        
        for (Delivery__c d : deliveries) {
            // Plain text version
            String line = '• ' + d.Name + ' (' + d.Product_Line__c + ')';
            if (d.Contract_Value__c != null && d.Contract_Value__c > 0) {
                line += ' - $' + formatCurrency(d.Contract_Value__c);
            }
            summaryLines.add(line);
            
            // HTML hyperlink version
            String productInfo = d.Product_Line__c != null ? d.Product_Line__c : 'N/A';
            String valueInfo = '';
            if (d.Contract_Value__c != null && d.Contract_Value__c > 0) {
                valueInfo = ' - $' + formatCurrency(d.Contract_Value__c);
            }
            String htmlLine = '<p>• <a href="' + baseUrl + '/' + d.Id + '" target="_blank">' + d.Name + '</a> (' + productInfo + ')' + valueInfo + '</p>';
            htmlLines.add(htmlLine);
        }
        
        String summaryText = String.join(summaryLines, '\n');
        String htmlText = String.join(htmlLines, '');
        
        // Update Opportunity
        Opportunity oppUpdate = new Opportunity(Id = opportunityId);
        
        // Set All_Delivery_Codes__c text field (plain text)
        oppUpdate.All_Delivery_Codes__c = summaryText;
        
        // Set Delivery_Links__c Rich Text field (HTML with hyperlinks)
        oppUpdate.Delivery_Links__c = htmlText;
        
        // Set primary Delivery lookup (first/largest delivery)
        oppUpdate.Delivery__c = deliveries[0].Id;
        
        try {
            update oppUpdate;
            System.debug('Updated Opportunity with Delivery links: ' + htmlText);
        } catch (Exception e) {
            System.debug('Error updating Opportunity with Delivery summary: ' + e.getMessage());
        }
    }
    
    /**
     * Format currency value
     */
    private static String formatCurrency(Decimal value) {
        if (value == null) return '$0';
        if (value >= 1000000) {
            return String.valueOf((value / 1000000).setScale(1, RoundingMode.HALF_UP)) + 'M';
        } else if (value >= 1000) {
            return String.valueOf((value / 1000).setScale(0, RoundingMode.HALF_UP)) + 'K';
        }
        return String.valueOf(value.setScale(0, RoundingMode.HALF_UP));
    }
    
    /**
     * Bulk create Deliveries for multiple Opportunities
     * 
     * @param opportunityIds List of Opportunity IDs
     * @return Map of Opportunity ID to List of created Delivery IDs
     */
    public static Map<Id, List<Id>> createDeliveriesForOpportunities(List<Id> opportunityIds) {
        Map<Id, List<Id>> results = new Map<Id, List<Id>>();
        
        for (Id oppId : opportunityIds) {
            try {
                List<Delivery__c> deliveries = createDeliveriesForOpportunity(oppId, 'Planning');
                
                List<Id> deliveryIds = new List<Id>();
                for (Delivery__c d : deliveries) {
                    deliveryIds.add(d.Id);
                }
                results.put(oppId, deliveryIds);
                
            } catch (Exception e) {
                System.debug('Error creating deliveries for Opp ' + oppId + ': ' + e.getMessage());
                results.put(oppId, new List<Id>());
            }
        }
        
        return results;
    }
}


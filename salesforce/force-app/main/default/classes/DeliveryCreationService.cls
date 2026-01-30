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
        
        // Query Opportunity with line items and Product details for delivery filtering/naming
        Opportunity opp = [
            SELECT Id, Name, AccountId, Account.Name, OwnerId, Pod__c,
                   ACV__c, Product_Line__c, Target_LOI_Date__c, CloseDate, Probability, StageName,
                   (SELECT Id, Product2Id, Product2.Name, Product2.ProductCode, 
                           Product2.Family,
                           Quantity, UnitPrice, TotalPrice 
                    FROM OpportunityLineItems
                    ORDER BY TotalPrice DESC)
            FROM Opportunity
            WHERE Id = :opportunityId
            LIMIT 1
        ];
        
        // Check which products already have deliveries (for incremental creation)
        // Use Product_Code__c for matching to allow name changes without breaking automation
        List<Delivery__c> existingDeliveries = [
            SELECT Id, Product_Line__c, Product_Code__c FROM Delivery__c WHERE Opportunity__c = :opportunityId
        ];
        
        // Build set of product codes that already have deliveries
        Set<String> productsWithDeliveries = new Set<String>();
        for (Delivery__c d : existingDeliveries) {
            // Use ProductCode if available, fall back to Product_Line__c for legacy data
            if (d.Product_Code__c != null) {
                productsWithDeliveries.add(d.Product_Code__c.toLowerCase());
            } else if (d.Product_Line__c != null) {
                productsWithDeliveries.add(d.Product_Line__c.toLowerCase());
            }
        }
        System.debug('Existing deliveries for ' + productsWithDeliveries.size() + ' products: ' + productsWithDeliveries);
        
        List<Delivery__c> deliveriesToCreate = new List<Delivery__c>();
        
        if (!opp.OpportunityLineItems.isEmpty()) {
            // ============================================================
            // PATH A: Opportunity has Products - Create Delivery per product (if not exists)
            // ============================================================
            System.debug('Checking ' + opp.OpportunityLineItems.size() + ' line items for Delivery creation...');
            
            for (OpportunityLineItem oli : opp.OpportunityLineItems) {
                // Skip products that don't require delivery (e.g., pure software subscriptions)
                // TODO: Re-enable when Requires_Delivery__c field is accessible
                // if (oli.Product2.Requires_Delivery__c == false) {
                //     System.debug('  → Skipping (no delivery required): ' + oli.Product2.Name);
                //     continue;
                // }
                
                // Use ProductCode for matching (allows name changes without breaking automation)
                String matchKey = oli.Product2.ProductCode != null ? 
                    oli.Product2.ProductCode.toLowerCase() : 
                    oli.Product2.Name.toLowerCase();
                
                // Skip if delivery already exists for this product
                if (productsWithDeliveries.contains(matchKey)) {
                    System.debug('  → Skipping (exists): ' + oli.Product2.Name);
                    continue;
                }
                
                Delivery__c delivery = new Delivery__c();
                
                // Standard mappings (Name is auto-generated)
                delivery.Opportunity__c = opp.Id;
                delivery.Account__c = opp.AccountId;
                delivery.Eudia_Delivery_Owner__c = opp.OwnerId;
                
                // Product identification - use ProductCode for system matching
                delivery.Product_Code__c = oli.Product2.ProductCode;
                delivery.Product_Line__c = oli.Product2.Name;
                delivery.Contract_Value__c = oli.TotalPrice;
                
                // Build user-friendly Delivery Name: [Account] - [Customer-Facing Name] - [Region]
                String customerFacingName = getCustomerFacingName(oli.Product2.Name);
                String region = opp.Pod__c != null ? opp.Pod__c : 'US';  // Default to US if no Pod
                delivery.Delivery_Name__c = opp.Account.Name + ' - ' + customerFacingName + ' - ' + region;
                
                // Date fields - use Kickoff_Date__c for target start
                delivery.Kickoff_Date__c = opp.Target_LOI_Date__c;
                
                // Required fields
                delivery.Delivery_Model__c = 'AI-First (95% AI / 5% Human)';  // Default, can be updated later
                
                // Set initial Forecast Status based on Opportunity probability
                delivery.Forecast_Status__c = calculateForecastStatus(opp.Probability, opp.StageName);
                
                deliveriesToCreate.add(delivery);
                
                System.debug('  → Delivery for: ' + oli.Product2.Name + ' (' + delivery.Delivery_Name__c + ')');
            }
            
        } else if (existingDeliveries.isEmpty()) {
            // ============================================================
            // PATH B: No Products AND no existing deliveries - Fall back to single Delivery (legacy)
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
        } else {
            System.debug('No new products to create deliveries for.');
        }
        
        // Insert new Deliveries
        if (!deliveriesToCreate.isEmpty()) {
            insert deliveriesToCreate;
            System.debug('Created ' + deliveriesToCreate.size() + ' new Delivery record(s)');
        } else {
            System.debug('No new Deliveries to create.');
        }
        
        // Re-query ALL deliveries for this Opp to update summary (existing + new)
        List<Delivery__c> allDeliveries = [
            SELECT Id, Name, Product_Line__c, Contract_Value__c 
            FROM Delivery__c 
            WHERE Opportunity__c = :opportunityId
            ORDER BY Contract_Value__c DESC
        ];
        
        // Update Opportunity with complete Delivery summary
        if (!allDeliveries.isEmpty()) {
            updateOpportunityWithDeliveries(opp.Id, allDeliveries);
        }
        
        return allDeliveries;
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
    
    /**
     * Get customer-facing name for a product
     * Maps internal product names to customer-facing names per David's mapping
     * 
     * @param productName The internal Product2.Name
     * @return The customer-facing name for external systems (Rocketlane, Campfire)
     */
    private static String getCustomerFacingName(String productName) {
        if (String.isBlank(productName)) {
            return 'Delivery';
        }
        
        // Customer-facing name mapping per David's table
        Map<String, String> nameMapping = new Map<String, String>{
            'AI Compliance - Technology' => 'Compliance Platform',
            'AI Contracting - Managed Services' => 'AI-Augmented Contracting Delivery',
            'AI Contracting - Technology' => 'Contracting Platform',
            'AI M&A - Managed Services' => 'AI-Augmented M&A Delivery',
            'AI Platform - Insights' => 'Insights Platform',
            'AI Platform - Litigation' => 'Litigation Platform',
            'AI Platform - Sigma' => 'Sigma Platform',
            'Contracting - Secondee' => 'Secondee (Contracting)',
            'FDE - Custom AI Solution' => 'Custom AI Solution',
            'Other - Managed Service' => 'Managed Service Delivery',
            'Other - Secondee' => 'Secondee (Other)'
        };
        
        // Try exact match first
        if (nameMapping.containsKey(productName)) {
            return nameMapping.get(productName);
        }
        
        // Try partial match for flexibility
        for (String key : nameMapping.keySet()) {
            if (productName.containsIgnoreCase(key) || key.containsIgnoreCase(productName)) {
                return nameMapping.get(key);
            }
        }
        
        // Default: clean up the product name
        return productName.replace(' - ', ' ').replace('AI ', '');
    }
    
    /**
     * Calculate Forecast Status based on Opportunity probability and stage
     * 
     * Status logic:
     * - Booked: Stage is Closed Won
     * - Cancelled: Stage is Closed Lost
     * - Reserved: Probability >= 80%
     * - Forecasted: Probability >= 50%
     * - On Hold: Probability < 50%
     * 
     * @param probability The Opportunity's probability percentage
     * @param stageName The Opportunity's stage name
     * @return The calculated Forecast Status
     */
    public static String calculateForecastStatus(Decimal probability, String stageName) {
        // Check for closed stages first
        if (stageName != null) {
            // Won stages (new and legacy)
            if (stageName == 'Won' || (stageName.contains('Closed') && stageName.contains('Won'))) {
                return 'Booked';
            }
            // Lost/Closed Lost stages
            if (stageName == 'Lost' || (stageName.contains('Closed') && stageName.contains('Lost'))) {
                return 'Cancelled';
            }
            if (stageName == 'Disqualified' || stageName == 'Nurture') {
                return 'Cancelled';
            }
        }
        
        // Calculate based on probability
        if (probability == null) {
            return 'On Hold';
        }
        
        if (probability >= 80) {
            return 'Reserved';
        } else if (probability >= 50) {
            return 'Forecasted';
        } else {
            return 'On Hold';
        }
    }
}


/**
 * Create Delivery Records from Opportunity Line Items
 * 
 * This script demonstrates the logic for creating multiple Delivery records
 * when an Opportunity has multiple products (line items).
 * 
 * USAGE: This is a TEMPLATE for updating your existing Delivery creation flow/trigger.
 *        The actual implementation should be integrated into your Stage 4 trigger.
 * 
 * LOGIC:
 * 1. Check if Opportunity has OpportunityLineItems
 * 2. If YES: Create one Delivery per line item
 * 3. If NO: Fall back to single Delivery using Product_Line__c field
 * 
 * This ensures backward compatibility with existing opportunities that don't use Products.
 */

// ============================================================
// EXAMPLE: Processing a single Opportunity that hit Stage 4
// ============================================================

// Replace with actual Opportunity ID in testing
Id oppId = 'YOUR_OPPORTUNITY_ID_HERE';

// Get the Opportunity with line items
Opportunity opp = [
    SELECT Id, Name, AccountId, Account.Name, OwnerId, 
           ACV__c, Product_Line__c, Target_LOI_Date__c, CloseDate,
           (SELECT Id, Product2Id, Product2.Name, Product2.Family, 
                   Quantity, UnitPrice, TotalPrice 
            FROM OpportunityLineItems)
    FROM Opportunity
    WHERE Id = :oppId
    LIMIT 1
];

System.debug('Processing Opportunity: ' + opp.Name);
System.debug('Line Items found: ' + opp.OpportunityLineItems.size());

List<Delivery__c> deliveriesToCreate = new List<Delivery__c>();

if (!opp.OpportunityLineItems.isEmpty()) {
    // ============================================================
    // PATH A: Opportunity has Products - Create Delivery per product
    // ============================================================
    System.debug('Creating Delivery records from OpportunityLineItems...');
    
    for (OpportunityLineItem oli : opp.OpportunityLineItems) {
        Delivery__c delivery = new Delivery__c();
        
        // Standard mappings (adjust field API names to match your Delivery__c object)
        delivery.Name = opp.Account.Name + ' - ' + oli.Product2.Name;
        delivery.Opportunity__c = opp.Id;
        delivery.Account__c = opp.AccountId;
        // delivery.Owner__c = opp.OwnerId; // Uncomment if Delivery has Owner field
        
        // Product-specific fields
        delivery.Product_Line__c = oli.Product2.Name;  // Or map to Family
        delivery.ACV__c = oli.TotalPrice;              // Individual product value
        
        // Date fields
        delivery.Target_Start_Date__c = opp.Target_LOI_Date__c;
        
        // Source tracking
        delivery.Source_Line_Item__c = oli.Id;  // Add this lookup field to track source
        
        deliveriesToCreate.add(delivery);
        
        System.debug('  → Delivery: ' + delivery.Name + ' ($' + oli.TotalPrice + ')');
    }
    
} else {
    // ============================================================
    // PATH B: No Products - Fall back to single Delivery (legacy behavior)
    // ============================================================
    System.debug('No line items found. Using legacy Product_Line__c field...');
    
    Delivery__c delivery = new Delivery__c();
    
    delivery.Name = opp.Account.Name + ' - ' + (opp.Product_Line__c != null ? opp.Product_Line__c : 'Delivery');
    delivery.Opportunity__c = opp.Id;
    delivery.Account__c = opp.AccountId;
    delivery.Product_Line__c = opp.Product_Line__c;
    delivery.ACV__c = opp.ACV__c;
    delivery.Target_Start_Date__c = opp.Target_LOI_Date__c;
    
    deliveriesToCreate.add(delivery);
    
    System.debug('  → Delivery: ' + delivery.Name + ' ($' + opp.ACV__c + ')');
}

// ============================================================
// Insert Delivery records
// ============================================================
if (!deliveriesToCreate.isEmpty()) {
    // Uncomment to actually insert:
    // insert deliveriesToCreate;
    
    System.debug('');
    System.debug('========================================');
    System.debug('DELIVERY CREATION SUMMARY');
    System.debug('========================================');
    System.debug('Opportunity: ' + opp.Name);
    System.debug('Total Deliveries to create: ' + deliveriesToCreate.size());
    System.debug('');
    
    Decimal totalValue = 0;
    for (Delivery__c d : deliveriesToCreate) {
        System.debug('  ✓ ' + d.Name);
        System.debug('    Product: ' + d.Product_Line__c);
        System.debug('    ACV: $' + d.ACV__c);
        totalValue += (d.ACV__c != null ? d.ACV__c : 0);
    }
    
    System.debug('');
    System.debug('Total ACV across Deliveries: $' + totalValue);
    System.debug('Opportunity ACV: $' + opp.ACV__c);
    System.debug('========================================');
}


// ============================================================
// INTEGRATION NOTES
// ============================================================
/*
 * To integrate this into your existing Delivery creation flow/trigger:
 * 
 * OPTION 1: Update existing Record-Triggered Flow
 * ------------------------------------------------
 * 1. Open your existing "Create Delivery on Proposal" flow
 * 2. Add a "Get Records" element to query OpportunityLineItems
 * 3. Add a Decision: "Has Line Items?"
 *    - If collection size > 0: Loop through and create multiple Deliveries
 *    - If collection size = 0: Use existing single Delivery creation
 * 
 * OPTION 2: Apex Trigger (more control)
 * -------------------------------------
 * Create an Apex trigger on Opportunity that fires on Stage change:
 * 
 * trigger OpportunityDeliveryTrigger on Opportunity (after update) {
 *     List<Opportunity> stage4Opps = new List<Opportunity>();
 *     
 *     for (Opportunity opp : Trigger.new) {
 *         Opportunity oldOpp = Trigger.oldMap.get(opp.Id);
 *         if (opp.StageName == 'Stage 4. Proposal' && 
 *             oldOpp.StageName != 'Stage 4. Proposal') {
 *             stage4Opps.add(opp);
 *         }
 *     }
 *     
 *     if (!stage4Opps.isEmpty()) {
 *         DeliveryCreationService.createDeliveries(stage4Opps);
 *     }
 * }
 * 
 * FIELD REQUIREMENTS
 * ------------------
 * Ensure your Delivery__c object has these fields:
 * - Opportunity__c (Lookup to Opportunity)
 * - Account__c (Lookup to Account)
 * - Product_Line__c (Text or Picklist)
 * - ACV__c (Currency)
 * - Target_Start_Date__c (Date)
 * - Source_Line_Item__c (Lookup to OpportunityLineItem) [RECOMMENDED - add this]
 * 
 * The Source_Line_Item__c field helps track which line item created which Delivery,
 * useful for auditing and preventing duplicate Deliveries on re-processing.
 */


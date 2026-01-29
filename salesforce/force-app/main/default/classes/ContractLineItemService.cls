/**
 * ContractLineItemService
 * 
 * Creates Contract Line Item records from Opportunity Products when a Contract is created.
 * 
 * LOGIC:
 * 1. Query OpportunityLineItems for the source Opportunity
 * 2. Create one Contract_Line_Item__c per OpportunityLineItem
 * 3. Link each line item to the Contract and Product
 * 
 * This enables proper reconciliation with ERP systems by breaking out
 * individual products and their dollar amounts on the Contract.
 * 
 * Can be called from:
 * - Flow (via Invocable Method) - called after Contract creation
 * - Apex Trigger
 * - Anonymous Apex for testing
 * 
 * @author GTM Brain
 * @date January 2026
 */
public class ContractLineItemService {
    
    /**
     * Request wrapper for invocable method
     */
    public class ContractLineItemRequest {
        @InvocableVariable(label='Contract ID' required=true description='The ID of the newly created Contract')
        public Id contractId;
        
        @InvocableVariable(label='Opportunity ID' required=true description='The source Opportunity ID')
        public Id opportunityId;
    }
    
    /**
     * Result wrapper for invocable method
     */
    public class ContractLineItemResult {
        @InvocableVariable(label='Line Items Created')
        public Integer lineItemsCreated;
        
        @InvocableVariable(label='Line Item IDs')
        public List<Id> lineItemIds;
        
        @InvocableVariable(label='Success')
        public Boolean success;
        
        @InvocableVariable(label='Error Message')
        public String errorMessage;
        
        @InvocableVariable(label='Total Value')
        public Decimal totalValue;
    }
    
    /**
     * Create Contract Line Items from Opportunity - Invocable Method for Flows
     * 
     * @param requests List of ContractLineItemRequest containing Contract and Opportunity IDs
     * @return List of ContractLineItemResult with created Line Item IDs
     */
    @InvocableMethod(label='Create Contract Line Items from Opportunity' 
                     description='Creates Contract Line Item records for each product on the source Opportunity. Call this after creating the Contract.')
    public static List<ContractLineItemResult> createLineItemsInvocable(List<ContractLineItemRequest> requests) {
        List<ContractLineItemResult> results = new List<ContractLineItemResult>();
        
        for (ContractLineItemRequest request : requests) {
            ContractLineItemResult result = new ContractLineItemResult();
            result.lineItemIds = new List<Id>();
            
            try {
                List<Contract_Line_Item__c> lineItems = createLineItemsForContract(
                    request.contractId, 
                    request.opportunityId
                );
                
                result.lineItemsCreated = lineItems.size();
                result.totalValue = 0;
                
                for (Contract_Line_Item__c li : lineItems) {
                    result.lineItemIds.add(li.Id);
                    if (li.Total_Price__c != null) {
                        result.totalValue += li.Total_Price__c;
                    }
                }
                result.success = true;
                
            } catch (Exception e) {
                result.success = false;
                result.lineItemsCreated = 0;
                result.totalValue = 0;
                result.errorMessage = e.getMessage();
                System.debug('Error creating contract line items: ' + e.getMessage());
            }
            
            results.add(result);
        }
        
        return results;
    }
    
    /**
     * Create Contract Line Items for a single Contract from its source Opportunity
     * 
     * @param contractId The Contract ID
     * @param opportunityId The source Opportunity ID
     * @return List of created Contract_Line_Item__c records
     */
    public static List<Contract_Line_Item__c> createLineItemsForContract(Id contractId, Id opportunityId) {
        
        // Query Opportunity with line items
        Opportunity opp = [
            SELECT Id, Name, AccountId, Account.Name, OwnerId, 
                   ACV__c, Product_Line__c, CloseDate,
                   (SELECT Id, Product2Id, Product2.Name, Product2.Family, Product2.ProductCode,
                           Quantity, UnitPrice, TotalPrice, Description, ServiceDate
                    FROM OpportunityLineItems
                    ORDER BY TotalPrice DESC)
            FROM Opportunity
            WHERE Id = :opportunityId
            LIMIT 1
        ];
        
        // Check if line items already exist for this contract
        List<Contract_Line_Item__c> existingLineItems = [
            SELECT Id FROM Contract_Line_Item__c WHERE Contract__c = :contractId
        ];
        
        if (!existingLineItems.isEmpty()) {
            System.debug('Contract Line Items already exist for this Contract. Skipping creation.');
            return existingLineItems;
        }
        
        List<Contract_Line_Item__c> lineItemsToCreate = new List<Contract_Line_Item__c>();
        
        if (!opp.OpportunityLineItems.isEmpty()) {
            // ============================================================
            // Create one Contract Line Item per Opportunity Product
            // ============================================================
            System.debug('Creating Contract Line Items from ' + opp.OpportunityLineItems.size() + ' products...');
            
            Integer lineNumber = 1;
            
            for (OpportunityLineItem oli : opp.OpportunityLineItems) {
                Contract_Line_Item__c lineItem = new Contract_Line_Item__c();
                
                // Core relationships
                lineItem.Contract__c = contractId;
                lineItem.Product__c = oli.Product2Id;
                lineItem.Source_Line_Item__c = oli.Id;
                
                // Product details (denormalized for reporting)
                lineItem.Product_Name__c = oli.Product2.Name;
                lineItem.Product_Code__c = oli.Product2.ProductCode;
                lineItem.Product_Family__c = oli.Product2.Family;
                
                // Pricing
                lineItem.Quantity__c = oli.Quantity;
                lineItem.Unit_Price__c = oli.UnitPrice;
                lineItem.Total_Price__c = oli.TotalPrice;
                
                // Additional info
                lineItem.Description__c = oli.Description;
                lineItem.Line_Number__c = lineNumber;
                lineItem.Service_Date__c = oli.ServiceDate;
                
                lineItemsToCreate.add(lineItem);
                
                System.debug('  → Line Item #' + lineNumber + ': ' + oli.Product2.Name + 
                           ' (Qty: ' + oli.Quantity + ', Total: $' + oli.TotalPrice + ')');
                
                lineNumber++;
            }
            
        } else {
            // ============================================================
            // No Products on Opportunity - Create single line item from legacy field
            // ============================================================
            System.debug('No line items found. Creating single line item from Product_Line__c...');
            
            Contract_Line_Item__c lineItem = new Contract_Line_Item__c();
            lineItem.Contract__c = contractId;
            lineItem.Product_Name__c = opp.Product_Line__c;
            lineItem.Quantity__c = 1;
            lineItem.Total_Price__c = opp.ACV__c;
            lineItem.Unit_Price__c = opp.ACV__c;
            lineItem.Line_Number__c = 1;
            
            lineItemsToCreate.add(lineItem);
            
            System.debug('  → Line Item: ' + opp.Product_Line__c + ' ($' + opp.ACV__c + ')');
        }
        
        // Insert Line Items
        if (!lineItemsToCreate.isEmpty()) {
            insert lineItemsToCreate;
            System.debug('Created ' + lineItemsToCreate.size() + ' Contract Line Item record(s)');
            
            // Update Contract with summary info
            updateContractWithLineItems(contractId, lineItemsToCreate);
        }
        
        return lineItemsToCreate;
    }
    
    /**
     * Update Contract with line item summary
     * 
     * @param contractId The Contract ID
     * @param lineItems List of created line items
     */
    private static void updateContractWithLineItems(Id contractId, List<Contract_Line_Item__c> lineItems) {
        if (lineItems == null || lineItems.isEmpty()) return;
        
        // Calculate totals
        Decimal totalValue = 0;
        List<String> productNames = new List<String>();
        
        for (Contract_Line_Item__c li : lineItems) {
            if (li.Total_Price__c != null) {
                totalValue += li.Total_Price__c;
            }
            if (li.Product_Name__c != null) {
                productNames.add(li.Product_Name__c);
            }
        }
        
        // Build products summary text
        String productsSummary = String.join(productNames, '; ');
        
        // Update Contract
        Contract contractUpdate = new Contract(Id = contractId);
        
        // Update Total Contract Value if different (may already be set from ACV)
        contractUpdate.Contract_Value__c = totalValue;
        
        // Store products list for easy reference
        // Note: Add this field if it doesn't exist
        // contractUpdate.Products_Summary__c = productsSummary;
        
        try {
            update contractUpdate;
            System.debug('Updated Contract with total value: $' + totalValue);
        } catch (Exception e) {
            System.debug('Error updating Contract: ' + e.getMessage());
        }
    }
    
    /**
     * Bulk create Line Items for multiple Contracts
     * 
     * @param contractToOppMap Map of Contract ID to Opportunity ID
     * @return Map of Contract ID to List of created Line Item IDs
     */
    public static Map<Id, List<Id>> createLineItemsForContracts(Map<Id, Id> contractToOppMap) {
        Map<Id, List<Id>> results = new Map<Id, List<Id>>();
        
        for (Id contractId : contractToOppMap.keySet()) {
            try {
                Id oppId = contractToOppMap.get(contractId);
                List<Contract_Line_Item__c> lineItems = createLineItemsForContract(contractId, oppId);
                
                List<Id> lineItemIds = new List<Id>();
                for (Contract_Line_Item__c li : lineItems) {
                    lineItemIds.add(li.Id);
                }
                results.put(contractId, lineItemIds);
                
            } catch (Exception e) {
                System.debug('Error creating line items for Contract ' + contractId + ': ' + e.getMessage());
                results.put(contractId, new List<Id>());
            }
        }
        
        return results;
    }
}


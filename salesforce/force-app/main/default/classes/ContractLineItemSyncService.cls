/**
 * ContractLineItemSyncService
 * 
 * Syncs OpportunityLineItems (products from Price Book) to Contract_Line_Item__c records.
 * When a Contract is created from a Closed Won Opportunity, this service creates
 * corresponding Contract Line Items with the same product details and pricing.
 * 
 * This enables finance reconciliation by clearly segmenting product lines
 * with accurate dollar amounts on each Contract.
 * 
 * @author GTM Brain
 * @date January 2026
 */
public class ContractLineItemSyncService {
    
    /**
     * Request wrapper for invocable method
     */
    public class SyncRequest {
        @InvocableVariable(label='Contract ID' required=true)
        public Id contractId;
        
        @InvocableVariable(label='Opportunity ID' required=false description='Optional: directly specify the source Opportunity')
        public Id opportunityId;
    }
    
    /**
     * Result wrapper for invocable method
     */
    public class SyncResult {
        @InvocableVariable(label='Success')
        public Boolean success;
        
        @InvocableVariable(label='Line Items Created')
        public Integer lineItemsCreated;
        
        @InvocableVariable(label='Message')
        public String message;
    }
    
    /**
     * Main invocable method - sync OpportunityLineItems to Contract_Line_Item__c
     * Called by Flow when a Contract is created
     */
    @InvocableMethod(label='Sync Opportunity Products to Contract Line Items' 
                     description='Creates Contract_Line_Item__c records from OpportunityLineItems')
    public static List<SyncResult> syncLineItems(List<SyncRequest> requests) {
        List<SyncResult> results = new List<SyncResult>();
        
        if (requests == null || requests.isEmpty()) {
            SyncResult emptyResult = new SyncResult();
            emptyResult.success = false;
            emptyResult.lineItemsCreated = 0;
            emptyResult.message = 'No requests provided';
            results.add(emptyResult);
            return results;
        }
        
        for (SyncRequest req : requests) {
            results.add(processSingleContract(req));
        }
        
        return results;
    }
    
    /**
     * Process a single Contract sync request
     */
    private static SyncResult processSingleContract(SyncRequest req) {
        SyncResult result = new SyncResult();
        result.success = false;
        result.lineItemsCreated = 0;
        
        if (req.contractId == null) {
            result.message = 'Contract ID is required';
            return result;
        }
        
        try {
            // Get Contract details
            Contract contract = [
                SELECT Id, AccountId, StartDate, EndDate, Source_Opportunity__c
                FROM Contract 
                WHERE Id = :req.contractId 
                LIMIT 1
            ];
            
            // Determine which Opportunity to use
            Id sourceOppId = req.opportunityId;
            
            // If not provided, try Source_Opportunity__c lookup
            if (sourceOppId == null && contract.Source_Opportunity__c != null) {
                sourceOppId = contract.Source_Opportunity__c;
            }
            
            // If still null, try to find the most recent Closed Won Opp for this Account
            if (sourceOppId == null) {
                List<Opportunity> closedWonOpps = [
                    SELECT Id, Name
                    FROM Opportunity
                    WHERE AccountId = :contract.AccountId
                    AND StageName = 'Closed Won'
                    ORDER BY CloseDate DESC
                    LIMIT 1
                ];
                
                if (!closedWonOpps.isEmpty()) {
                    sourceOppId = closedWonOpps[0].Id;
                }
            }
            
            if (sourceOppId == null) {
                result.message = 'No source Opportunity found. Please specify an Opportunity ID or set Source_Opportunity__c on the Contract.';
                return result;
            }
            
            // Get OpportunityLineItems from the source Opportunity with all relevant fields
            List<OpportunityLineItem> oppLineItems = [
                SELECT Id, Product2Id, Product2.Name, Product2.ProductCode, 
                       Quantity, UnitPrice, TotalPrice, ServiceDate,
                       Product_Start_Date__c, Product_End_Date__c
                FROM OpportunityLineItem
                WHERE OpportunityId = :sourceOppId
            ];
            
            if (oppLineItems.isEmpty()) {
                result.success = true;
                result.message = 'No products on source Opportunity - no line items created';
                return result;
            }
            
            // Check for existing Contract Line Items to avoid duplicates (by product name)
            Set<String> existingProductNames = new Set<String>();
            for (Contract_Line_Item__c existing : [
                SELECT Product_Name_Campfire__c
                FROM Contract_Line_Item__c
                WHERE Contract__c = :req.contractId
                AND Product_Name_Campfire__c != null
            ]) {
                existingProductNames.add(existing.Product_Name_Campfire__c);
            }
            
            // Create Contract Line Items
            List<Contract_Line_Item__c> newLineItems = new List<Contract_Line_Item__c>();
            
            for (OpportunityLineItem oli : oppLineItems) {
                // Skip if already synced (by product name)
                if (existingProductNames.contains(oli.Product2.Name)) {
                    continue;
                }
                
                Contract_Line_Item__c cli = new Contract_Line_Item__c();
                cli.Contract__c = req.contractId;
                cli.Name = oli.Product2.Name;
                
                // Product identification for ERP tracking
                cli.Product_Id__c = oli.Product2Id;
                cli.Product_Code__c = oli.Product2.ProductCode;
                
                // Populate the Campfire fields (these are the primary fields for ERP)
                cli.Product_Name_Campfire__c = oli.Product2.Name;
                cli.Amount_Campfire__c = oli.TotalPrice;
                
                // Use product-specific dates if available, otherwise use Contract dates
                // Priority: Product_Start_Date__c > ServiceDate > Contract.StartDate
                Date startDate = contract.StartDate;
                if (oli.Product_Start_Date__c != null) {
                    startDate = oli.Product_Start_Date__c;
                } else if (oli.ServiceDate != null) {
                    startDate = oli.ServiceDate;
                }
                
                // Priority: Product_End_Date__c > Contract.EndDate
                Date endDate = contract.EndDate;
                if (oli.Product_End_Date__c != null) {
                    endDate = oli.Product_End_Date__c;
                }
                
                cli.Start_Date_Campfire__c = startDate;
                cli.End_Date_Campfire__c = endDate;
                
                // Calculate duration in months
                if (startDate != null && endDate != null) {
                    Integer months = startDate.monthsBetween(endDate);
                    cli.Duration_Months__c = months;
                    cli.Duration__c = months; // Also populate existing Duration field
                }
                
                newLineItems.add(cli);
            }
            
            if (!newLineItems.isEmpty()) {
                insert newLineItems;
            }
            
            // Update Contract with Source Opportunity if not already set
            if (contract.Source_Opportunity__c == null) {
                contract.Source_Opportunity__c = sourceOppId;
                update contract;
            }
            
            result.success = true;
            result.lineItemsCreated = newLineItems.size();
            result.message = 'Successfully created ' + newLineItems.size() + ' Contract Line Item(s)';
            
        } catch (Exception e) {
            result.message = 'Error: ' + e.getMessage();
        }
        
        return result;
    }
    
    /**
     * Utility method to sync line items for a Contract by ID
     * Can be called from Anonymous Apex or other Apex code
     */
    public static SyncResult syncForContract(Id contractId, Id opportunityId) {
        SyncRequest req = new SyncRequest();
        req.contractId = contractId;
        req.opportunityId = opportunityId;
        
        List<SyncResult> results = syncLineItems(new List<SyncRequest>{req});
        return results.isEmpty() ? null : results[0];
    }
}


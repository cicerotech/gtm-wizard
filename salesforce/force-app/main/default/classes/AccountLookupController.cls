/**
 * Apex Controller for Custom Account Lookup LWC
 * Used in Screen Flows to search all accounts without limits
 */
public with sharing class AccountLookupController {
    
    // Product line → abbreviated display name for opp naming
    private static final Map<String, String> PRODUCT_LINE_ABBREV = new Map<String, String>{
        'AI Contracting - Technology'       => 'Contracting Tech',
        'AI Contracting - Managed Services' => 'Contracting MS',
        'Contracting - Secondee'            => 'Contracting Secondee',
        'AI Compliance - Technology'        => 'Compliance Tech',
        'AI M&A - Managed Services'         => 'M&A MS',
        'AI Platform - Sigma'               => 'Platform Sigma',
        'AI Platform - Insights'            => 'Platform Insights',
        'AI Platform - Litigation'          => 'Platform Litigation',
        'FDE - Custom AI Solution'          => 'FDE Custom AI',
        'Other - Managed Service'           => 'Other MS',
        'Other - Secondee'                  => 'Other Secondee',
        'Multiple (BL Review)'              => 'Multiple'
    };

    /**
     * Search accounts by name
     * @param searchTerm - The search string to match against Account Name
     * @return List of matching accounts (up to 50)
     */
    @AuraEnabled(cacheable=true)
    public static List<AccountResult> searchAccounts(String searchTerm) {
        List<AccountResult> results = new List<AccountResult>();
        
        if (String.isBlank(searchTerm) || searchTerm.length() < 2) {
            return results;
        }
        
        String searchPattern = '%' + String.escapeSingleQuotes(searchTerm) + '%';
        
        List<Account> accounts = [
            SELECT Id, Name, Industry, BillingCity, BillingState
            FROM Account
            WHERE Name LIKE :searchPattern
            ORDER BY Name ASC
            LIMIT 50
        ];
        
        for (Account acc : accounts) {
            AccountResult result = new AccountResult();
            result.id = acc.Id;
            result.name = acc.Name;
            result.subtitle = buildSubtitle(acc);
            results.add(result);
        }
        
        return results;
    }
    
    /**
     * Get a single account by ID
     * @param accountId - The Account ID
     * @return The account details
     */
    @AuraEnabled(cacheable=true)
    public static AccountResult getAccountById(String accountId) {
        if (String.isBlank(accountId)) {
            return null;
        }
        
        List<Account> accounts = [
            SELECT Id, Name, Industry, BillingCity, BillingState
            FROM Account
            WHERE Id = :accountId
            LIMIT 1
        ];
        
        if (accounts.isEmpty()) {
            return null;
        }
        
        Account acc = accounts[0];
        AccountResult result = new AccountResult();
        result.id = acc.Id;
        result.name = acc.Name;
        result.subtitle = buildSubtitle(acc);
        return result;
    }
    
    /**
     * Build subtitle from account fields
     */
    private static String buildSubtitle(Account acc) {
        List<String> parts = new List<String>();
        
        if (String.isNotBlank(acc.Industry)) {
            parts.add(acc.Industry);
        }
        if (String.isNotBlank(acc.BillingCity)) {
            String location = acc.BillingCity;
            if (String.isNotBlank(acc.BillingState)) {
                location += ', ' + acc.BillingState;
            }
            parts.add(location);
        }
        
        return String.join(parts, ' • ');
    }

    /**
     * Get abbreviated product line label for opportunity naming.
     * e.g. "AI Contracting - Technology" → "Contracting Tech"
     */
    private static String abbreviateProductLine(String productLine) {
        if (String.isBlank(productLine) || productLine == 'Undetermined') {
            return null; // caller should fall back to stage
        }
        if (PRODUCT_LINE_ABBREV.containsKey(productLine)) {
            return PRODUCT_LINE_ABBREV.get(productLine);
        }
        // Fallback: strip leading "AI " prefix if present
        return productLine.replaceFirst('(?i)^AI\\s+', '');
    }
    
    /**
     * Create a new Opportunity with all required defaults
     * @param accountId - The Account ID
     * @param accountName - The Account Name (for generating Opp name)
     * @param stage - The Stage name
     * @param targetSignDate - The target sign date
     * @param acv - The ACV amount
     * @param productLine - The Product Line
     * @param opportunitySource - The Opportunity Source
     * @return The created Opportunity ID
     */
    @AuraEnabled
    public static String createOpportunity(String accountId, String accountName, String stage, 
                                           Date targetSignDate, Decimal acv, String productLine,
                                           String opportunitySource) {
        // Validate required fields
        if (String.isBlank(accountId)) {
            throw new AuraHandledException('Account is required.');
        }
        if (String.isBlank(stage)) {
            throw new AuraHandledException('Stage is required.');
        }
        
        // Set defaults
        Date closeDate = targetSignDate != null ? targetSignDate : Date.today().addDays(100);
        Decimal oppAcv = acv != null ? acv : 100000;
        String oppProductLine = String.isNotBlank(productLine) ? productLine : 'Undetermined';
        
        // Generate opportunity name: "AccountName - AbbreviatedProductLine" or "AccountName - Stage"
        String nameSuffix = abbreviateProductLine(oppProductLine);
        if (nameSuffix == null) {
            // No product line specified → use stage (e.g. "Discovery")
            nameSuffix = stage.replaceFirst('(?i)^Stage\\s*\\d+\\s*-\\s*', '');
        }
        String oppName = accountName + ' - ' + nameSuffix;
        
        // Create the Opportunity
        Opportunity opp = new Opportunity();
        opp.AccountId = accountId;
        opp.Name = oppName;
        opp.StageName = stage;
        opp.CloseDate = closeDate;
        opp.ACV__c = oppAcv;
        opp.Amount = oppAcv;
        opp.Product_Line__c = oppProductLine;
        opp.Probability = 10;
        opp.Opportunity_Source__c = String.isNotBlank(opportunitySource) ? opportunitySource : 'Inbound';
        opp.Target_Sign_for_Edit_NEW__c = closeDate;
        
        // Set Record Type ID (Business Opportunity)
        opp.RecordTypeId = '012Hp000001HYyxIAG';
        
        try {
            insert opp;
            return opp.Id;
        } catch (DmlException e) {
            throw new AuraHandledException('Error creating opportunity: ' + e.getMessage());
        }
    }
    
    /**
     * Wrapper class for account search results
     */
    public class AccountResult {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public String subtitle;
    }
}

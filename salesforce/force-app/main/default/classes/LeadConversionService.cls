/**
 * Converts Leads to Contact + Opportunity when Status changes to Converted.
 * Called from Flow or Trigger when Lead.Status = 'Converted'.
 * 
 * Behavior:
 * - Matches Lead.Company to existing Account by name (fuzzy LIKE match)
 * - Creates Contact from Lead data
 * - Creates Stage 1 - Discovery Opportunity linked to Account
 * - Sets Opportunity Source from Lead Source
 * - Full traceability: Lead → Contact → Opportunity → Account
 */
public class LeadConversionService {
    
    @InvocableMethod(label='Convert Lead to Opportunity' description='Converts a Lead, creating Contact + Stage 1 Opp on the matched Account')
    public static List<ConversionResult> convertLeads(List<Id> leadIds) {
        List<ConversionResult> results = new List<ConversionResult>();
        
        if (leadIds == null || leadIds.isEmpty()) return results;
        
        List<Lead> leads = [
            SELECT Id, FirstName, LastName, Company, Email, Phone, Title,
                   LeadSource, OwnerId, Status, Description
            FROM Lead
            WHERE Id IN :leadIds AND IsConverted = false
        ];
        
        for (Lead ld : leads) {
            ConversionResult cr = new ConversionResult();
            cr.leadId = ld.Id;
            
            try {
                // Find matching Account
                String companyName = ld.Company;
                if (String.isBlank(companyName)) {
                    cr.success = false;
                    cr.message = 'No company name on Lead';
                    results.add(cr);
                    continue;
                }
                
                String safeName = companyName.replaceAll('\'', '\\\'');
                List<Account> matchingAccounts = [
                    SELECT Id, Name FROM Account
                    WHERE Name LIKE :('%' + safeName + '%')
                    ORDER BY LastActivityDate DESC NULLS LAST
                    LIMIT 1
                ];
                
                Id accountId;
                if (!matchingAccounts.isEmpty()) {
                    accountId = matchingAccounts[0].Id;
                } else {
                    // Create Account if none found
                    Account newAcct = new Account(
                        Name = companyName,
                        OwnerId = ld.OwnerId
                    );
                    insert newAcct;
                    accountId = newAcct.Id;
                }
                
                // Standard Lead conversion
                Database.LeadConvert lc = new Database.LeadConvert();
                lc.setLeadId(ld.Id);
                lc.setAccountId(accountId);
                lc.setConvertedStatus('Converted');
                lc.setDoNotCreateOpportunity(true); // We create our own Opp below
                lc.setOwnerId(ld.OwnerId);
                
                Database.LeadConvertResult lcr = Database.convertLead(lc);
                
                if (lcr.isSuccess()) {
                    // Create Stage 1 Opportunity
                    String oppName = companyName;
                    if (oppName.length() > 100) oppName = oppName.substring(0, 100);
                    
                    Opportunity opp = new Opportunity(
                        Name = oppName + ' - Discovery',
                        AccountId = accountId,
                        StageName = 'Stage 1 - Discovery',
                        CloseDate = Date.today().addDays(120),
                        OwnerId = ld.OwnerId,
                        Opportunity_Source__c = ld.LeadSource != null ? ld.LeadSource : 'Outbound'
                    );
                    
                    try {
                        insert opp;
                        cr.opportunityId = opp.Id;
                    } catch (Exception oppEx) {
                        // Opp creation failed but lead conversion succeeded
                        cr.message = 'Lead converted but Opp creation failed: ' + oppEx.getMessage();
                    }
                    
                    cr.success = true;
                    cr.contactId = lcr.getContactId();
                    cr.accountId = accountId;
                } else {
                    cr.success = false;
                    cr.message = 'Lead conversion failed: ' + lcr.getErrors()[0].getMessage();
                }
                
            } catch (Exception ex) {
                cr.success = false;
                cr.message = ex.getMessage();
            }
            
            results.add(cr);
        }
        
        return results;
    }
    
    public class ConversionResult {
        @InvocableVariable public Id leadId;
        @InvocableVariable public Boolean success;
        @InvocableVariable public String message;
        @InvocableVariable public Id contactId;
        @InvocableVariable public Id accountId;
        @InvocableVariable public Id opportunityId;
    }
}

/**
 * BOIDealCodeService
 * 
 * Generates unique Deal Codes when Opportunities close (Stage 6. Closed(Won)).
 * Format: [CLIENT_PREFIX]-[SEQ] (e.g., COH-001 for Coherent, SWA-001 for Southwest)
 * Renewals: [CLIENT_PREFIX]-[SEQ]-[RENEWAL_SEQ] (e.g., COH-001-01)
 * 
 * Client prefix is derived from the Account name (first 3 uppercase letters).
 * Sequential number is per-account (not org-wide).
 * 
 * @author GTM Brain
 * @date February 2026
 */
public class BOIDealCodeService {
    
    private static final String WON_STAGE = 'Stage 6. Closed(Won)';
    
    /**
     * Derive a 3-letter prefix from an Account name.
     * Examples: Coherent → COH, Southwest Airlines → SWA, IQVIA → IQV, Meta → MET
     */
    @TestVisible
    private static String derivePrefix(String accountName) {
        if (String.isBlank(accountName)) return 'UNK';
        // Remove common suffixes and clean
        String clean = accountName.replaceAll('(?i)\\b(Inc\\.?|LLC|Ltd\\.?|Corp\\.?|Corporation|Group|Holdings|PLC|S\\.A\\.?|AG|GmbH|Co\\.?)\\b', '').trim();
        // Remove non-alpha chars for prefix derivation
        String alpha = clean.replaceAll('[^a-zA-Z]', '');
        if (alpha.length() < 3) alpha = accountName.replaceAll('[^a-zA-Z]', '');
        if (alpha.length() < 3) return (alpha + 'XXX').substring(0, 3).toUpperCase();
        return alpha.substring(0, 3).toUpperCase();
    }
    
    /**
     * Process opportunities that just moved to Closed Won.
     * Called from trigger context (after update).
     */
    public static void generateCodes(List<Opportunity> newOpps, Map<Id, Opportunity> oldMap) {
        List<Opportunity> needsCodes = new List<Opportunity>();
        
        for (Opportunity opp : newOpps) {
            Opportunity oldOpp = oldMap.get(opp.Id);
            if (opp.StageName == WON_STAGE 
                && oldOpp.StageName != WON_STAGE 
                && String.isBlank(opp.BOI_Deal_Code__c)) {
                needsCodes.add(opp);
            }
        }
        
        if (needsCodes.isEmpty()) return;
        
        // Separate renewals from new deals
        List<Opportunity> newDeals = new List<Opportunity>();
        List<Opportunity> renewals = new List<Opportunity>();
        Set<Id> parentOppIds = new Set<Id>();
        Set<Id> accountIds = new Set<Id>();
        
        for (Opportunity opp : needsCodes) {
            accountIds.add(opp.AccountId);
            if (opp.Renewal_Of_c__c != null) {
                renewals.add(opp);
                parentOppIds.add(opp.Renewal_Of_c__c);
            } else {
                newDeals.add(opp);
            }
        }
        
        // Get Account names for prefix derivation
        Map<Id, String> accountNames = new Map<Id, String>();
        for (Account a : [SELECT Id, Name FROM Account WHERE Id IN :accountIds]) {
            accountNames.put(a.Id, a.Name);
        }
        
        List<Opportunity> toUpdate = new List<Opportunity>();
        
        // ── Handle new deals: PREFIX-NNN ──
        if (!newDeals.isEmpty()) {
            // For each account, count existing codes with that prefix to get next number
            Map<String, Integer> prefixCounters = new Map<String, Integer>();
            
            // Count existing codes per prefix across ALL Won opps
            for (AggregateResult ar : [
                SELECT Account.Name acctName, COUNT(Id) cnt
                FROM Opportunity
                WHERE StageName = :WON_STAGE
                AND BOI_Deal_Code__c != null
                AND Renewal_Of_c__c = null
                AND AccountId IN :accountIds
                GROUP BY Account.Name
            ]) {
                String prefix = derivePrefix((String)ar.get('acctName'));
                Integer existing = prefixCounters.containsKey(prefix) ? prefixCounters.get(prefix) : 0;
                prefixCounters.put(prefix, existing + ((Decimal)ar.get('cnt')).intValue());
            }
            
            // Also check for prefix collisions across different accounts
            Set<String> prefixes = new Set<String>();
            for (Id acctId : accountIds) {
                prefixes.add(derivePrefix(accountNames.get(acctId)));
            }
            for (AggregateResult ar : [
                SELECT BOI_Deal_Code__c code
                FROM Opportunity
                WHERE BOI_Deal_Code__c != null
                AND Renewal_Of_c__c = null
                GROUP BY BOI_Deal_Code__c
                HAVING BOI_Deal_Code__c LIKE 'COH-%' OR BOI_Deal_Code__c LIKE 'SWA-%'
                LIMIT 1000
            ]) {
                // This is a fallback - primary counter comes from the aggregate above
            }
            
            for (Opportunity opp : newDeals) {
                String acctName = accountNames.get(opp.AccountId);
                String prefix = derivePrefix(acctName);
                Integer nextNum = prefixCounters.containsKey(prefix) ? prefixCounters.get(prefix) + 1 : 1;
                prefixCounters.put(prefix, nextNum);
                String code = prefix + '-' + String.valueOf(nextNum).leftPad(3, '0');
                toUpdate.add(new Opportunity(Id = opp.Id, BOI_Deal_Code__c = code));
            }
        }
        
        // ── Handle renewals: PREFIX-NNN-RR ──
        if (!renewals.isEmpty()) {
            Map<Id, String> parentCodes = new Map<Id, String>();
            for (Opportunity parent : [
                SELECT Id, BOI_Deal_Code__c FROM Opportunity WHERE Id IN :parentOppIds
            ]) {
                parentCodes.put(parent.Id, parent.BOI_Deal_Code__c);
            }
            
            Map<Id, Integer> renewalCounts = new Map<Id, Integer>();
            for (AggregateResult ar : [
                SELECT Renewal_Of_c__c parentId, COUNT(Id) cnt
                FROM Opportunity
                WHERE Renewal_Of_c__c IN :parentOppIds
                AND BOI_Deal_Code__c != null
                GROUP BY Renewal_Of_c__c
            ]) {
                renewalCounts.put((Id)ar.get('parentId'), ((Decimal)ar.get('cnt')).intValue());
            }
            
            for (Opportunity opp : renewals) {
                String parentCode = parentCodes.get(opp.Renewal_Of_c__c);
                if (String.isBlank(parentCode)) {
                    // Parent has no code - generate one based on account
                    String acctName = accountNames.get(opp.AccountId);
                    parentCode = derivePrefix(acctName) + '-LEGACY';
                }
                Integer existingRenewals = renewalCounts.containsKey(opp.Renewal_Of_c__c) 
                    ? renewalCounts.get(opp.Renewal_Of_c__c) : 0;
                String suffix = String.valueOf(existingRenewals + 1).leftPad(2, '0');
                String code = parentCode + '-' + suffix;
                toUpdate.add(new Opportunity(Id = opp.Id, BOI_Deal_Code__c = code));
            }
        }
        
        if (!toUpdate.isEmpty()) {
            Database.update(toUpdate, false);
        }
    }
    
    /**
     * Backfill: assign client-specific codes to existing Won opps.
     */
    public static void backfillExistingWonOpps() {
        List<Opportunity> wonOpps = [
            SELECT Id, Name, AccountId, Account.Name, CloseDate, Renewal_Of_c__c, BOI_Deal_Code__c
            FROM Opportunity
            WHERE StageName = :WON_STAGE
            AND BOI_Deal_Code__c = null
            ORDER BY CloseDate ASC
        ];
        
        if (wonOpps.isEmpty()) return;
        
        // Track per-prefix counters
        Map<String, Integer> prefixCounters = new Map<String, Integer>();
        
        // Count existing codes per prefix (in case some already have codes)
        for (AggregateResult ar : [
            SELECT COUNT(Id) cnt, BOI_Deal_Code__c code
            FROM Opportunity
            WHERE BOI_Deal_Code__c != null AND Renewal_Of_c__c = null
            GROUP BY BOI_Deal_Code__c
        ]) {
            String code = (String)ar.get('code');
            if (code != null && code.contains('-')) {
                String prefix = code.substringBefore('-');
                // Extract number
                try {
                    String numPart = code.substringAfter('-');
                    if (numPart.contains('-')) numPart = numPart.substringBefore('-');
                    Integer num = Integer.valueOf(numPart);
                    Integer current = prefixCounters.containsKey(prefix) ? prefixCounters.get(prefix) : 0;
                    if (num > current) prefixCounters.put(prefix, num);
                } catch (Exception e) { /* skip malformed */ }
            }
        }
        
        // First pass: non-renewals
        List<Opportunity> toUpdate = new List<Opportunity>();
        Map<Id, String> assignedCodes = new Map<Id, String>();
        
        for (Opportunity opp : wonOpps) {
            if (opp.Renewal_Of_c__c == null) {
                String prefix = derivePrefix(opp.Account.Name);
                Integer nextNum = prefixCounters.containsKey(prefix) ? prefixCounters.get(prefix) + 1 : 1;
                prefixCounters.put(prefix, nextNum);
                String code = prefix + '-' + String.valueOf(nextNum).leftPad(3, '0');
                toUpdate.add(new Opportunity(Id = opp.Id, BOI_Deal_Code__c = code));
                assignedCodes.put(opp.Id, code);
            }
        }
        
        // Second pass: renewals
        Set<Id> parentIds = new Set<Id>();
        for (Opportunity opp : wonOpps) {
            if (opp.Renewal_Of_c__c != null) parentIds.add(opp.Renewal_Of_c__c);
        }
        
        Map<Id, String> parentCodes = new Map<Id, String>();
        if (!parentIds.isEmpty()) {
            for (Opportunity parent : [
                SELECT Id, BOI_Deal_Code__c FROM Opportunity WHERE Id IN :parentIds AND BOI_Deal_Code__c != null
            ]) {
                parentCodes.put(parent.Id, parent.BOI_Deal_Code__c);
            }
            for (Id oppId : parentIds) {
                if (assignedCodes.containsKey(oppId) && !parentCodes.containsKey(oppId)) {
                    parentCodes.put(oppId, assignedCodes.get(oppId));
                }
            }
        }
        
        Map<Id, Integer> renewalCounters = new Map<Id, Integer>();
        for (Opportunity opp : wonOpps) {
            if (opp.Renewal_Of_c__c != null) {
                String parentCode = parentCodes.get(opp.Renewal_Of_c__c);
                if (String.isBlank(parentCode)) {
                    String prefix = derivePrefix(opp.Account.Name);
                    Integer nextNum = prefixCounters.containsKey(prefix) ? prefixCounters.get(prefix) + 1 : 1;
                    prefixCounters.put(prefix, nextNum);
                    parentCode = prefix + '-' + String.valueOf(nextNum).leftPad(3, '0');
                    parentCodes.put(opp.Renewal_Of_c__c, parentCode);
                }
                Integer count = renewalCounters.containsKey(opp.Renewal_Of_c__c)
                    ? renewalCounters.get(opp.Renewal_Of_c__c) + 1 : 1;
                renewalCounters.put(opp.Renewal_Of_c__c, count);
                String code = parentCode + '-' + String.valueOf(count).leftPad(2, '0');
                toUpdate.add(new Opportunity(Id = opp.Id, BOI_Deal_Code__c = code));
            }
        }
        
        if (!toUpdate.isEmpty()) {
            Database.update(toUpdate, false);
        }
        
        System.debug('Backfill: assigned ' + toUpdate.size() + ' client-specific codes');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Query Ananth's Stage 0 and Stage 1 opportunities
// EXCLUDE: GE, Liberty, Citadel (keeping these)
// ═══════════════════════════════════════════════════════════════════════════

// Find Ananth's User ID first
List<User> ananthUsers = [SELECT Id, Name FROM User WHERE Name LIKE '%Ananth%' AND IsActive = true];
System.debug('Found Users: ' + ananthUsers);

if (ananthUsers.isEmpty()) {
    System.debug('ERROR: Ananth user not found');
} else {
    Id ananthId = ananthUsers[0].Id;
    System.debug('Ananth User ID: ' + ananthId);
    System.debug('Ananth Name: ' + ananthUsers[0].Name);
    
    // Query his Stage 0 and Stage 1 opportunities
    List<Opportunity> ananthOpps = [
        SELECT Id, Name, Account.Name, StageName, ACV__c, CloseDate, Owner.Name
        FROM Opportunity
        WHERE OwnerId = :ananthId
        AND IsClosed = false
        AND StageName IN ('Stage 0 - Prospecting', 'Stage 1 - Discovery')
        ORDER BY StageName, Account.Name
    ];
    
    System.debug('');
    System.debug('═══════════════════════════════════════════════════════════════');
    System.debug('ANANTH\'S STAGE 0 & 1 OPPORTUNITIES: ' + ananthOpps.size());
    System.debug('═══════════════════════════════════════════════════════════════');
    
    Integer stage0Count = 0;
    Integer stage1Count = 0;
    Integer keepCount = 0;
    Integer closeCount = 0;
    
    // Accounts to KEEP
    Set<String> keepAccounts = new Set<String>{'GE', 'Liberty', 'Citadel'};
    
    for (Opportunity opp : ananthOpps) {
        String accountName = opp.Account.Name;
        Boolean keep = false;
        
        // Check if account should be kept
        for (String keepName : keepAccounts) {
            if (accountName != null && accountName.containsIgnoreCase(keepName)) {
                keep = true;
                break;
            }
        }
        
        if (opp.StageName == 'Stage 0 - Prospecting') {
            stage0Count++;
        } else {
            stage1Count++;
        }
        
        if (keep) {
            keepCount++;
            System.debug('KEEP: ' + opp.Id + ' | ' + accountName + ' | ' + opp.Name + ' | ' + opp.StageName);
        } else {
            closeCount++;
            System.debug('CLOSE: ' + opp.Id + ' | ' + accountName + ' | ' + opp.Name + ' | ' + opp.StageName + ' | ACV: $' + opp.ACV__c);
        }
    }
    
    System.debug('');
    System.debug('═══════════════════════════════════════════════════════════════');
    System.debug('SUMMARY');
    System.debug('═══════════════════════════════════════════════════════════════');
    System.debug('Stage 0 opportunities: ' + stage0Count);
    System.debug('Stage 1 opportunities: ' + stage1Count);
    System.debug('KEEP (GE, Liberty, Citadel): ' + keepCount);
    System.debug('CLOSE (Unresponsive): ' + closeCount);
}

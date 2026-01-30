// ═══════════════════════════════════════════════════════════════════════════
// EXECUTE NURTURE UPDATES - Precise updates only
// Review output BEFORE uncommenting DML operations
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// PART 1: CLOSE 5 OPEN OPPORTUNITIES
// ═══════════════════════════════════════════════════════════════════════════

List<Opportunity> oppsToUpdate = new List<Opportunity>();

// 1. KLARNA - Never met. Move to nurture / reassign.
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000P2T4LIAV',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Never Met',
    Closed_Lost_Detail__c = 'Never met. Move to nurture / reassign.',
    Closed_Lost_Date__c = Date.today()
));

// 2. LINEAGE - Went to RFP. Move to nurture / reassign.
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000Irsj3IAB',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'RFP Process',
    Closed_Lost_Detail__c = 'Went to RFP. Move to nurture / reassign.',
    Closed_Lost_Date__c = Date.today()
));

// 3. NOVARTIS - No direct path to CLO. DGC / HOLO trap.
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000GVQoMIAX',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'No Path to DM',
    Closed_Lost_Detail__c = 'No direct path to CLO. DGC / HOLO trap. Move to nurture / reassign.',
    Closed_Lost_Date__c = Date.today()
));

// 4. SANTANDER - Consolidated AI initiatives to another business unit, GC went cold.
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000MugUYIAZ',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Timing',
    Closed_Lost_Detail__c = 'Consolidated AI initiatives to another business unit - my business unit GC went cold. Move to nurture / reassign.',
    Closed_Lost_Date__c = Date.today()
));

// 5. SKIMS - Not qualified. Limited budget.
oppsToUpdate.add(new Opportunity(
    Id = '006Wj00000JxxE1IAJ',
    StageName = 'Stage 7. Closed Lost',
    Closed_Lost_Reason__c = 'Not Qualified',
    Closed_Lost_Detail__c = 'Not qualified. Limited budget. Move to nurture / reassign.',
    Closed_Lost_Date__c = Date.today()
));

System.debug('═══════════════════════════════════════════════════════════════');
System.debug('OPPORTUNITIES TO CLOSE: ' + oppsToUpdate.size());
System.debug('═══════════════════════════════════════════════════════════════');

for (Opportunity opp : oppsToUpdate) {
    System.debug('OPP ID: ' + opp.Id);
    System.debug('  → StageName: ' + opp.StageName);
    System.debug('  → Closed_Lost_Reason__c: ' + opp.Closed_Lost_Reason__c);
    System.debug('  → Closed_Lost_Detail__c: ' + opp.Closed_Lost_Detail__c);
    System.debug('---');
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 2: MARK ALL 38 ACCOUNTS AS NURTURE = TRUE
// ═══════════════════════════════════════════════════════════════════════════

List<Account> accountsToUpdate = new List<Account>();

// All 38 account IDs from query results
List<String> accountIds = new List<String>{
    '001Wj00000WElj9IAD', // American Arbitration Association
    '001Wj00000hewsXIAQ', // Amkor
    '001Hp00003kIrExIAK', // Applied Materials
    '001Hp00003kIrEzIAK', // Archer Daniels Midland
    '001Wj00000gGYAQIA4', // Autodesk
    '001Wj00000c6DHyIAM', // BetterUp
    '001Hp00003kIrFeIAK', // Booz Allen Hamilton
    '001Wj00000XiYqzIAF', // Canva
    '001Hp00003kIrG0IAK', // Carrier Global
    '001Hp00003kIrGfIAK', // Corning
    '001Wj00000fgfGuIAI', // Cyware
    '001Wj00000duIWrIAM', // Deepmind
    '001Wj00000dheQNIAY', // Emory
    '001Hp00003kIrHsIAK', // FedEx
    '001Wj00000lMcwTIAS', // Flo Health
    '001Wj00000dw1gbIAA', // Glean
    '001Wj00000d7IL8IAM', // IAC
    '001Wj00000gH7uaIAC', // JFrog
    '001Wj00000bWIxqIAG', // Motiva
    '001Wj00000hVTTBIA4', // One Oncology
    '001Wj00000Y6VVWIA3', // Oscar Health
    '001Wj00000YE3bzIAD', // Palantir
    '001Wj00000eLHLOIA4', // Palo Alto Networks
    '001Hp00003kIrLxIAK', // Republic Services
    '001Wj00000eL760IAC', // Shell
    '001Wj00000aCGR3IAO', // Solventum
    '001Hp00003kIrMcIAK', // SpaceX
    '001Wj00000SdYHqIAN', // Spotify
    '001Hp00003kIrDlIAK', // StoneX Group
    '001Wj00000WYtsUIAT', // Tenable
    '001Hp00003kIrN5IAK', // Tesla
    '001Wj00000c0wRKIAY', // The Initial Group
    '001Hp00003kIrCsIAK'  // UPS
};

// Also add the 5 accounts that HAVE open opps (they need Nurture too)
List<String> accountsWithOppsIds = new List<String>{
    // These will be derived from the opps - Klarna, Lineage, Novartis, Santander, Skims
};

// Query current state of accounts to update only those not already Nurture=true
List<Account> existingAccounts = [
    SELECT Id, Name, Nurture__c 
    FROM Account 
    WHERE Id IN :accountIds
];

System.debug('');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('ACCOUNTS TO SET NURTURE = TRUE');
System.debug('═══════════════════════════════════════════════════════════════');

Integer alreadyNurture = 0;
Integer needsUpdate = 0;

for (Account a : existingAccounts) {
    if (a.Nurture__c == true) {
        alreadyNurture++;
        System.debug('ALREADY NURTURE: ' + a.Name);
    } else {
        needsUpdate++;
        accountsToUpdate.add(new Account(
            Id = a.Id,
            Nurture__c = true
        ));
        System.debug('WILL UPDATE: ' + a.Name + ' (Id: ' + a.Id + ') → Nurture = TRUE');
    }
}

// Also update the 5 accounts that have open opps
List<Opportunity> oppsWithAccounts = [
    SELECT AccountId, Account.Name, Account.Nurture__c
    FROM Opportunity
    WHERE Id IN ('006Wj00000P2T4LIAV', '006Wj00000Irsj3IAB', '006Wj00000GVQoMIAX', '006Wj00000MugUYIAZ', '006Wj00000JxxE1IAJ')
];

for (Opportunity opp : oppsWithAccounts) {
    if (opp.Account.Nurture__c != true) {
        Boolean alreadyInList = false;
        for (Account a : accountsToUpdate) {
            if (a.Id == opp.AccountId) {
                alreadyInList = true;
                break;
            }
        }
        if (!alreadyInList) {
            accountsToUpdate.add(new Account(
                Id = opp.AccountId,
                Nurture__c = true
            ));
            needsUpdate++;
            System.debug('WILL UPDATE (from opp): ' + opp.Account.Name + ' → Nurture = TRUE');
        }
    } else {
        System.debug('ALREADY NURTURE (from opp): ' + opp.Account.Name);
    }
}

System.debug('');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('FINAL SUMMARY - BEFORE EXECUTION');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('Opportunities to close: 5');
System.debug('Accounts already Nurture=true: ' + alreadyNurture);
System.debug('Accounts to update Nurture=true: ' + accountsToUpdate.size());
System.debug('');
System.debug('⚠️  UNCOMMENT THE DML LINES BELOW TO EXECUTE UPDATES');
System.debug('═══════════════════════════════════════════════════════════════');

// ═══════════════════════════════════════════════════════════════════════════
// UNCOMMENT THESE LINES TO EXECUTE THE UPDATES
// ═══════════════════════════════════════════════════════════════════════════

// update oppsToUpdate;
// System.debug('✅ Updated ' + oppsToUpdate.size() + ' opportunities to Closed Lost');

// update accountsToUpdate;
// System.debug('✅ Updated ' + accountsToUpdate.size() + ' accounts to Nurture = true');

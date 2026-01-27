// ============================================================================
// EUDIA COUNCIL - ACCOUNT CODE NAME POPULATION SCRIPT
// ============================================================================
// 
// PURPOSE: Marks accounts as Council and populates anonymized code names
// 
// ⚠️  DO NOT RUN UNTIL:
//     1. Profile cloning is complete (Eudia Standard Sales - Council View)
//     2. Page layouts are configured to show Account_Display_Name__c
//     3. Sharing rule Council_Leadership_Full_Access is created
//     4. Pilot test with single user is successful
//
// See: salesforce/scripts/COUNCIL_SECURITY_IMPLEMENTATION.md for full guide
//
// Last Updated: January 27, 2026
// ============================================================================

// Define the 18 Council accounts and their code names
// Format: 'Salesforce Account Name' => 'Code Name'
Map<String, String> accountCodeNames = new Map<String, String>{
    'Peregrine' => 'Pete',
    'Seyfarth' => 'Sparky',
    'Novelis' => 'Nordy',
    'Graybar' => 'Goofy',
    'Amazon' => 'Albert',
    'Cox Media' => 'Cosmo',
    'Del Monte' => 'Dinger',
    'Fox' => 'Fredbird',
    'Corebridge' => 'Clutch',
    'Duracell' => 'Daisy',
    'DHL' => 'Dory',
    'GE Vernova' => 'Goldy',
    'Petsmart' => 'Pluto',
    'Ecolab USA' => 'Eddie',
    'American Express' => 'Ace',
    'Vista' => 'Vic',
    'National Grid' => 'Nemo',
    'JSRK dba Away' => 'Atari'
};

System.debug('=== EUDIA COUNCIL CODE NAME SCRIPT ===');
System.debug('Processing ' + accountCodeNames.size() + ' accounts');

// Step 1: Query accounts by name to find matches
List<String> accountNames = new List<String>(accountCodeNames.keySet());
List<Account> matchedAccounts = [
    SELECT Id, Name, Code_Name__c, Eudia_Council_Account__c
    FROM Account
    WHERE Name IN :accountNames
];

System.debug('Found ' + matchedAccounts.size() + ' matching accounts in Salesforce');

// Step 2: Validate - show which accounts were found vs not found
Set<String> foundNames = new Set<String>();
for (Account acc : matchedAccounts) {
    foundNames.add(acc.Name);
}

// Report any accounts NOT found (name mismatch)
for (String expectedName : accountNames) {
    if (!foundNames.contains(expectedName)) {
        System.debug('⚠️  NOT FOUND: "' + expectedName + '" - check spelling in Salesforce');
    }
}

// Step 3: Update matched accounts
List<Account> accountsToUpdate = new List<Account>();

for (Account acc : matchedAccounts) {
    String codeName = accountCodeNames.get(acc.Name);
    
    // Mark as Council account
    acc.Eudia_Council_Account__c = true;
    
    // Set code name
    acc.Code_Name__c = codeName;
    
    accountsToUpdate.add(acc);
    System.debug('✓ ' + acc.Name + ' => ' + codeName);
}

// Step 4: Perform update
if (!accountsToUpdate.isEmpty()) {
    update accountsToUpdate;
    System.debug('✅ Successfully updated ' + accountsToUpdate.size() + ' Council accounts');
} else {
    System.debug('⚠️  No accounts to update - check account names match Salesforce exactly');
}

// Step 5: Sync code names to related opportunities (Flow should handle this, but backup)
List<Opportunity> councilOpps = [
    SELECT Id, Name, AccountId, Account.Code_Name__c, Account.Name, 
           Eudia_Council_Op__c, Code_Name__c
    FROM Opportunity
    WHERE Account.Eudia_Council_Account__c = true
    AND (Code_Name__c = null OR Eudia_Council_Op__c = false)
];

System.debug('Found ' + councilOpps.size() + ' opportunities needing code name sync');

List<Opportunity> oppsToUpdate = new List<Opportunity>();
for (Opportunity opp : councilOpps) {
    opp.Eudia_Council_Op__c = true;
    opp.Code_Name__c = opp.Account.Code_Name__c;
    oppsToUpdate.add(opp);
    System.debug('✓ Opp: ' + opp.Name + ' => ' + opp.Code_Name__c);
}

if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
    System.debug('✅ Successfully synced ' + oppsToUpdate.size() + ' opportunities');
}

System.debug('=== SCRIPT COMPLETE ===');
System.debug('Total accounts processed: ' + accountsToUpdate.size());
System.debug('Total opportunities synced: ' + oppsToUpdate.size());

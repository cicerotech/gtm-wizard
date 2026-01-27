// Populates Code Names for Eudia Council accounts
// Run this AFTER marking accounts as Eudia_Council_Account__c = true
// This script sets up anonymized display names for sensitive accounts

// Define code names for Council accounts (customize as needed)
Map<String, String> accountCodeNames = new Map<String, String>{
    // Format: 'Account Name' => 'Code Name'
    // Add your Council account names and desired code names here
    // Example entries - update with actual account names from screenshot
};

// Query Council accounts without code names
List<Account> councilAccounts = [
    SELECT Id, Name, Code_Name__c, Eudia_Council_Account__c
    FROM Account
    WHERE Eudia_Council_Account__c = true
    AND Code_Name__c = null
];

System.debug('Found ' + councilAccounts.size() + ' Council accounts without code names');

// Update with code names from map, or generate sequential names
Integer counter = 1;
List<Account> accountsToUpdate = new List<Account>();

for (Account acc : councilAccounts) {
    if (accountCodeNames.containsKey(acc.Name)) {
        acc.Code_Name__c = accountCodeNames.get(acc.Name);
    } else {
        // Auto-generate code name if not in map
        acc.Code_Name__c = 'Project ' + String.valueOf(counter).leftPad(3, '0');
        counter++;
    }
    accountsToUpdate.add(acc);
    System.debug('Setting code name for ' + acc.Name + ' => ' + acc.Code_Name__c);
}

if (!accountsToUpdate.isEmpty()) {
    update accountsToUpdate;
    System.debug('Successfully updated ' + accountsToUpdate.size() + ' Council accounts with code names');
}

// Also update related opportunities to sync code names
List<Opportunity> councilOpps = [
    SELECT Id, Name, AccountId, Account.Code_Name__c, Eudia_Council_Op__c, Code_Name__c
    FROM Opportunity
    WHERE Account.Eudia_Council_Account__c = true
    AND Code_Name__c = null
];

System.debug('Found ' + councilOpps.size() + ' Council opportunities without code names');

for (Opportunity opp : councilOpps) {
    opp.Eudia_Council_Op__c = true;
    opp.Code_Name__c = opp.Account.Code_Name__c;
}

if (!councilOpps.isEmpty()) {
    update councilOpps;
    System.debug('Successfully updated ' + councilOpps.size() + ' Council opportunities');
}

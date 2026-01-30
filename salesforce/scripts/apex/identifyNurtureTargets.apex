// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: IDENTIFY - Query all accounts and their open opportunities
// DO NOT EXECUTE UPDATES - Just identify and output
// ═══════════════════════════════════════════════════════════════════════════

List<String> targetAccountNames = new List<String>{
    // ASAD's Accounts
    'Applied Materials',
    'Booz Allen Hamilton',
    'Booz Allen',
    'American Arbitration Association',
    'AAA',
    'Archer Daniel Midlands',
    'Archer Daniels Midland',
    'ADM',
    'BetterUp',
    'Canva',
    'CNA',
    'CNA Financial',
    'Corning',
    'DeepMind',
    'Deepmind',
    'G-III',
    'G-III Apparel',
    'G III Apparel',
    'IAC',
    'Motiva',
    'Novartis',
    'Oscar',
    'Oscar Health',
    'Procore',
    'Spotify',
    'StoneX',
    'StoneX Group',
    'Initial Group',
    'The Initial Group',
    // ANANTH's Accounts
    'Amkor',
    'Amkor Technology',
    'Autodesk',
    'Cyware',
    'Emory',
    'Emory University',
    'Flo Health',
    'JFrog',
    'Klarna',
    'Lineage',
    'Lineage Logistics',
    'One Oncology',
    'OneOncology',
    'Palantir',
    'Palantir Technologies',
    'Palo Alto Networks',
    'RBI',
    'Restaurant Brands International',
    'Restaurant Brands',
    'Santander',
    'Shell',
    'Shell plc',
    'SKIMS',
    'Solventum',
    'Tenable',
    'Carrier Global',
    'Carrier',
    'FedEx',
    'Glean',
    'Republic Services',
    'SpaceX',
    'Tesla',
    'UPS'
};

// Query accounts first
List<Account> accounts = [
    SELECT Id, Name, Nurture__c, Account_Status__c, Owner.Name
    FROM Account
    WHERE Name IN :targetAccountNames
    ORDER BY Name
];

System.debug('═══════════════════════════════════════════════════════════════');
System.debug('ACCOUNTS FOUND: ' + accounts.size());
System.debug('═══════════════════════════════════════════════════════════════');

Set<Id> accountIds = new Set<Id>();
for (Account a : accounts) {
    accountIds.add(a.Id);
    System.debug('ACCOUNT: ' + a.Name + ' | Owner: ' + a.Owner.Name + ' | Nurture: ' + a.Nurture__c + ' | Status: ' + a.Account_Status__c);
}

// Query open opportunities for these accounts
List<Opportunity> openOpps = [
    SELECT Id, Name, Account.Name, AccountId, StageName, ACV__c, Owner.Name, CloseDate,
           Closed_Lost_Reason__c, Closed_Lost_Detail__c
    FROM Opportunity
    WHERE AccountId IN :accountIds
    AND IsClosed = false
    ORDER BY Account.Name, ACV__c DESC
];

System.debug('');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('OPEN OPPORTUNITIES FOUND: ' + openOpps.size());
System.debug('═══════════════════════════════════════════════════════════════');

for (Opportunity opp : openOpps) {
    System.debug('OPP: ' + opp.Id + ' | ' + opp.Account.Name + ' | ' + opp.Name);
    System.debug('     Stage: ' + opp.StageName + ' | ACV: $' + opp.ACV__c + ' | Owner: ' + opp.Owner.Name);
    System.debug('     Close Date: ' + opp.CloseDate);
    System.debug('---');
}

// Identify accounts WITHOUT open opportunities (need Nurture checkbox only)
Set<Id> accountsWithOpps = new Set<Id>();
for (Opportunity opp : openOpps) {
    accountsWithOpps.add(opp.AccountId);
}

System.debug('');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('ACCOUNTS WITHOUT OPEN OPPORTUNITIES (Nurture checkbox only):');
System.debug('═══════════════════════════════════════════════════════════════');

for (Account a : accounts) {
    if (!accountsWithOpps.contains(a.Id)) {
        System.debug('ACCOUNT (no opps): ' + a.Name + ' | Id: ' + a.Id);
    }
}

System.debug('');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('SUMMARY');
System.debug('═══════════════════════════════════════════════════════════════');
System.debug('Total Accounts Found: ' + accounts.size());
System.debug('Accounts with Open Opps: ' + accountsWithOpps.size());
System.debug('Accounts without Open Opps: ' + (accounts.size() - accountsWithOpps.size()));
System.debug('Total Opportunities to Close: ' + openOpps.size());

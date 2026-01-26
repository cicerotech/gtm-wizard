// Update Council Accounts with Code Names and Eudia_Council_Account__c = true
// Run this in Developer Console → Debug → Open Execute Anonymous Window

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
    'Plusgrade' => 'Plus',  // Needs a code name - using 'Plus' as placeholder
    'JSRK dba Away' => 'Atari'
};

// Build LIKE conditions for partial matching
List<String> searchTerms = new List<String>();
for (String companyName : accountCodeNames.keySet()) {
    searchTerms.add('%' + companyName + '%');
}

// Query accounts
List<Account> accounts = [
    SELECT Id, Name, Code_Name__c, Eudia_Council_Account__c 
    FROM Account 
    WHERE Name LIKE :searchTerms[0]
       OR Name LIKE :searchTerms[1]
       OR Name LIKE :searchTerms[2]
       OR Name LIKE :searchTerms[3]
       OR Name LIKE :searchTerms[4]
       OR Name LIKE :searchTerms[5]
       OR Name LIKE :searchTerms[6]
       OR Name LIKE :searchTerms[7]
       OR Name LIKE :searchTerms[8]
       OR Name LIKE :searchTerms[9]
       OR Name LIKE :searchTerms[10]
       OR Name LIKE :searchTerms[11]
       OR Name LIKE :searchTerms[12]
       OR Name LIKE :searchTerms[13]
       OR Name LIKE :searchTerms[14]
       OR Name LIKE :searchTerms[15]
       OR Name LIKE :searchTerms[16]
       OR Name LIKE :searchTerms[17]
       OR Name LIKE :searchTerms[18]
];

System.debug('Found ' + accounts.size() + ' accounts to update');

List<Account> toUpdate = new List<Account>();

for (Account acc : accounts) {
    String codeName = null;
    
    // Find matching code name
    for (String companyName : accountCodeNames.keySet()) {
        if (acc.Name.containsIgnoreCase(companyName)) {
            codeName = accountCodeNames.get(companyName);
            break;
        }
    }
    
    if (codeName != null) {
        acc.Code_Name__c = codeName;
        acc.Eudia_Council_Account__c = true;
        toUpdate.add(acc);
        System.debug('Will update: ' + acc.Name + ' → ' + codeName);
    }
}

if (!toUpdate.isEmpty()) {
    update toUpdate;
    System.debug('✅ Updated ' + toUpdate.size() + ' accounts with code names');
} else {
    System.debug('⚠️ No accounts found to update');
}


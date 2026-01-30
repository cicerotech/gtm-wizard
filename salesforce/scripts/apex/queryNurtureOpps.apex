// Query open opportunities for the accounts to be moved to Nurture
// Run this in Developer Console to get Opportunity IDs

List<String> accountNames = new List<String>{
    'Applied Materials',
    'Booz Allen Hamilton',
    'American Arbitration Association',
    'Archer Daniel Midlands',
    'Archer Daniels Midland',
    'BetterUp',
    'Canva',
    'CNA',
    'Corning',
    'DeepMind',
    'Deepmind',
    'G-III',
    'G-III Apparel',
    'IAC',
    'Motiva',
    'Novartis',
    'Oscar',
    'Oscar Health',
    'Procore',
    'Spotify',
    'StoneX',
    'Initial Group',
    'The Initial Group',
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
    'Palo Alto Networks',
    'RBI',
    'Restaurant Brands International',
    'Santander',
    'Shell',
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

List<Opportunity> opps = [
    SELECT Id, Name, Account.Name, StageName, ACV__c, Owner.Name, CloseDate
    FROM Opportunity
    WHERE Account.Name IN :accountNames
    AND IsClosed = false
    ORDER BY Account.Name, ACV__c DESC
];

System.debug('Found ' + opps.size() + ' open opportunities to move to Nurture');
System.debug('');
System.debug('Id,Account Name,Opportunity Name,Stage,ACV,Owner,Close Date');

for (Opportunity opp : opps) {
    System.debug(opp.Id + ',' + 
                 opp.Account.Name + ',' + 
                 opp.Name + ',' + 
                 opp.StageName + ',' + 
                 opp.ACV__c + ',' + 
                 opp.Owner.Name + ',' +
                 opp.CloseDate);
}

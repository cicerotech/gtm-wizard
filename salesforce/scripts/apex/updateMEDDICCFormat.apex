// Update MEDDICC Qualification to cleaner format for active stage opportunities
// This overwrites existing verbose templates with the lighter format

String meddiccTemplate = '[M] METRICS\n' +
    '...\n\n' +
    '[E] ECONOMIC BUYER\n' +
    '...\n\n' +
    '[D] DECISION CRITERIA\n' +
    '...\n\n' +
    '[D] DECISION PROCESS\n' +
    '...\n\n' +
    '[I] PAIN / COMPELLING EVENT\n' +
    '...\n\n' +
    '[C] CHAMPION\n' +
    '...\n\n' +
    '[C] COMPETITION\n' +
    '...';

// Active stages to update
Set<String> activeStages = new Set<String>{
    'Stage 0 - Prospecting',
    'Stage 1 - Discovery',
    'Stage 2 - SQO',
    'Stage 3 - Pilot',
    'Stage 4 - Proposal',
    'Stage 5 - Negotiation'
};

// Query opportunities in active stages where MEDDICC starts with old format
List<Opportunity> allOpps = [
    SELECT Id, Name, StageName, MEDDICC_Qualification__c
    FROM Opportunity
    WHERE StageName IN :activeStages
];

System.debug('Found ' + allOpps.size() + ' opportunities in active stages');

// Filter to only those with the old verbose format (starts with "M - METRICS")
List<Opportunity> oppsToUpdate = new List<Opportunity>();
for (Opportunity opp : allOpps) {
    if (opp.MEDDICC_Qualification__c != null && 
        opp.MEDDICC_Qualification__c.startsWith('M - METRICS')) {
        opp.MEDDICC_Qualification__c = meddiccTemplate;
        oppsToUpdate.add(opp);
        System.debug('Updating: ' + opp.Name);
    }
}

System.debug('Filtered to ' + oppsToUpdate.size() + ' opportunities with old format');

// Perform update
if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
    System.debug('Successfully updated ' + oppsToUpdate.size() + ' opportunities to new format');
} else {
    System.debug('No opportunities needed updating');
}


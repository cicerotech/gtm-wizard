// Update MEDDICC Qualification to cleaner format for active stage opportunities
// This overwrites existing verbose templates with the lighter format

String meddiccTemplate = '[M] METRICS (quantifiable impact/ROI)\n' +
    '- \n' +
    '- \n\n' +
    '[E] ECONOMIC BUYER (budget holder)\n' +
    '- \n\n' +
    '[D] DECISION CRITERIA (key requirements)\n' +
    '- \n' +
    '- \n\n' +
    '[D] DECISION PROCESS (timeline, stakeholders)\n' +
    '- \n' +
    '- \n\n' +
    '[I] PAIN / COMPELLING EVENT (urgency)\n' +
    '- \n\n' +
    '[C] CHAMPION (internal advocate)\n' +
    '- \n\n' +
    '[C] COMPETITION (alternatives)\n' +
    '- ';

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

// Filter to only those with old format (starts with "[M] METRICS" without parentheses description)
List<Opportunity> oppsToUpdate = new List<Opportunity>();
for (Opportunity opp : allOpps) {
    if (opp.MEDDICC_Qualification__c != null && 
        opp.MEDDICC_Qualification__c.startsWith('[M] METRICS') &&
        !opp.MEDDICC_Qualification__c.contains('(quantifiable')) {
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


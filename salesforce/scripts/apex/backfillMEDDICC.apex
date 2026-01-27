// Backfill MEDDICC Qualification template for opportunities in active stages
// Safe: Only updates records where MEDDICC_Qualification__c is null or empty

String meddiccTemplate = 'M - METRICS\n' +
    'Desired state metrics/quantifiable impact:\n\n' +
    'E - ECONOMIC BUYER\n' +
    'Economic buyer engagement and their goals/needs/decision criteria:\n\n' +
    'D - DECISION CRITERIA\n' +
    'Main decision criteria with emphasis on pressing needs + use cases:\n\n' +
    'D - DECISION PROCESS\n' +
    'Key decision making process (timeline, budget, stakeholders, purchase process):\n\n' +
    'I - IDENTIFY PAIN / COMPELLING EVENT\n' +
    'Root causes, quantifiable impact, implementation timeline, cost of inaction:\n\n' +
    'C - CHAMPION\n' +
    'Champion identified and tested:\n\n' +
    'C - COMPETITION\n' +
    'Competitors (new and incumbent) and sentiment:\n';

// Active stages to backfill
Set<String> activeStages = new Set<String>{
    'Stage 0 - Prospecting',
    'Stage 1 - Discovery',
    'Stage 2 - SQO',
    'Stage 3 - Pilot',
    'Stage 4 - Proposal',
    'Stage 5 - Negotiation'
};

// Query opportunities in active stages (can't filter on Long Text Area in SOQL)
List<Opportunity> allOpps = [
    SELECT Id, Name, StageName, MEDDICC_Qualification__c
    FROM Opportunity
    WHERE StageName IN :activeStages
];

System.debug('Found ' + allOpps.size() + ' opportunities in active stages');

// Filter in Apex and update only those with empty MEDDICC field
List<Opportunity> oppsToUpdate = new List<Opportunity>();
for (Opportunity opp : allOpps) {
    if (String.isBlank(opp.MEDDICC_Qualification__c)) {
        opp.MEDDICC_Qualification__c = meddiccTemplate;
        oppsToUpdate.add(opp);
        System.debug('Updating: ' + opp.Name + ' (' + opp.StageName + ')');
    }
}

System.debug('Filtered to ' + oppsToUpdate.size() + ' opportunities needing backfill');

// Perform update
if (!oppsToUpdate.isEmpty()) {
    update oppsToUpdate;
    System.debug('Successfully updated ' + oppsToUpdate.size() + ' opportunities with MEDDICC template');
} else {
    System.debug('No opportunities needed updating');
}


const fs = require('fs');

const stages = JSON.parse(fs.readFileSync('/tmp/all_stages_backup.json', 'utf8'));

// Stages to keep ACTIVE (9 total)
// API names must match exactly
const activeStageApiNames = [
  'Stage 0 - Qualifying',  // Will change label to "Stage 0 - Prospecting"
  'Stage 1 - Discovery',
  'Stage 2 - SQO',
  'Stage 3 - Pilot',
  'Stage 4 - Proposal',
  'Stage 5 - Negotiation',
  'Stage 6. Closed(Won)',  // Closed/Won
  'Stage 7. Closed Lost',  // Closed/Lost
  '6.) Closed-won'         // Legacy - keeping per user request
];

// Label overrides (only Stage 0 needs a new label)
const labelOverrides = {
  'Stage 0 - Qualifying': 'Stage 0 - Prospecting'
};

const escapeXml = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<StandardValueSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <sorted>false</sorted>
`;

let activeCount = 0;
let inactiveCount = 0;

stages.forEach(s => {
  const apiName = s.ApiName;
  const isActive = activeStageApiNames.includes(apiName);
  const label = labelOverrides[apiName] || s.MasterLabel || apiName;
  const prob = s.DefaultProbability || 0;
  
  if (isActive) {
    activeCount++;
    console.log(`ACTIVE: ${apiName} -> "${label}"`);
  } else {
    inactiveCount++;
  }
  
  xml += `    <standardValue>
        <fullName>${escapeXml(apiName)}</fullName>
        <default>false</default>
        <isActive>${isActive}</isActive>
        <label>${escapeXml(label)}</label>
        <closed>${s.IsClosed ? 'true' : 'false'}</closed>
        <probability>${prob}</probability>
        <won>${s.IsWon ? 'true' : 'false'}</won>
    </standardValue>
`;
});

xml += `</StandardValueSet>`;

// Create output directory
fs.mkdirSync('temp-stages', { recursive: true });
fs.writeFileSync('temp-stages/OpportunityStage.standardValueSet-meta.xml', xml);

console.log(`\n=== SUMMARY ===`);
console.log(`Active stages: ${activeCount}`);
console.log(`Inactive stages: ${inactiveCount}`);
console.log(`Total: ${activeCount + inactiveCount}`);
console.log(`\nXML saved to: temp-stages/OpportunityStage.standardValueSet-meta.xml`);



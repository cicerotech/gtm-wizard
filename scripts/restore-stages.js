const fs = require('fs');

const stages = JSON.parse(fs.readFileSync('/tmp/all_stages.json', 'utf8'));

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<StandardValueSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <sorted>false</sorted>
`;

stages.forEach(s => {
  // Salesforce Metadata API uses specific forecastCategory values
  // The API seems to use ForecastCategoryName from query, need to map correctly
  const prob = s.DefaultProbability || 0;
  const escapeXml = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  xml += `    <standardValue>
        <fullName>${escapeXml(s.ApiName)}</fullName>
        <default>false</default>
        <label>${escapeXml(s.MasterLabel || s.ApiName)}</label>
        <closed>${s.IsClosed ? 'true' : 'false'}</closed>
        <probability>${prob}</probability>
        <won>${s.IsWon ? 'true' : 'false'}</won>
    </standardValue>
`;
});

xml += `</StandardValueSet>`;

fs.writeFileSync('temp-retrieve/standardValueSets/OpportunityStage.standardValueSet-meta.xml', xml);
console.log(`Generated XML with ${stages.length} stages`);


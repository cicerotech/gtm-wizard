require('dotenv').config();
const { sfConnection } = require('./src/salesforce/connection');

/**
 * Test Einstein Activity Capture fields
 * Understand what's available for meeting tracking
 */

async function discoverEinsteinFields() {
  await sfConnection.initialize();
  const conn = sfConnection.getConnection();
  
  console.log('🔍 Discovering Einstein Activity Capture fields...\n');
  
  // Test Event object (Meetings/Calls from calendar sync)
  console.log('=== EVENT OBJECT (Calendar Events) ===');
  try {
    const eventDescribe = await conn.sobject('Event').describe();
    const relevantFields = eventDescribe.fields
      .filter(f => f.name.includes('Activity') || f.name.includes('Meeting') || f.name.includes('Who') || f.name.includes('What') || f.name.includes('Account'))
      .map(f => ({ name: f.name, label: f.label, type: f.type }));
    
    console.log('Relevant Event fields:');
    relevantFields.forEach(f => console.log(`  ${f.name} (${f.label}) - ${f.type}`));
    
    // Query recent events to see real data
    const eventQuery = `SELECT Id, Subject, ActivityDate, WhoId, WhatId, AccountId, OwnerId, Owner.Name, Type, Description
                        FROM Event
                        WHERE ActivityDate >= LAST_N_DAYS:90
                        ORDER BY ActivityDate DESC
                        LIMIT 5`;
    
    const events = await conn.query(eventQuery);
    console.log(`\nSample Events (${events.totalSize} total in last 90 days):`);
    events.records.forEach(e => {
      console.log(`  ${e.ActivityDate} - ${e.Subject} - ${e.Type} - Owner: ${e.Owner?.Name}`);
      console.log(`    WhatId: ${e.WhatId} | AccountId: ${e.AccountId}`);
    });
    
  } catch (error) {
    console.log('  Error:', error.message);
  }
  
  // Test Task object (To-dos, follow-ups)
  console.log('\n\n=== TASK OBJECT (Activities/To-dos) ===');
  try {
    const taskQuery = `SELECT Id, Subject, ActivityDate, WhoId, WhatId, AccountId, OwnerId, Owner.Name, Status
                       FROM Task
                       WHERE ActivityDate >= LAST_N_DAYS:90
                       ORDER BY ActivityDate DESC
                       LIMIT 5`;
    
    const tasks = await conn.query(taskQuery);
    console.log(`Sample Tasks (${tasks.totalSize} total):`);
    tasks.forEach(t => {
      console.log(`  ${t.ActivityDate} - ${t.Subject} - ${t.Status}`);
    });
    
  } catch (error) {
    console.log('  Error:', error.message);
  }
  
  // Test EmailMessage if available
  console.log('\n\n=== EMAILMESSAGE (Email Activity) ===');
  try {
    const emailQuery = `SELECT Id, Subject, MessageDate, FromAddress, ToAddress, RelatedToId
                        FROM EmailMessage
                        WHERE MessageDate >= LAST_N_DAYS:30
                        ORDER BY MessageDate DESC
                        LIMIT 5`;
    
    const emails = await conn.query(emailQuery);
    console.log(`Sample Emails (${emails.totalSize} total):`);
  } catch (error) {
    console.log('  EmailMessage not available or error:', error.message);
  }
  
  console.log('\n\n✅ Discovery complete!');
  console.log('\nRECOMMENDATION:');
  console.log('Use Event object with:');
  console.log('- ActivityDate for last/next meeting');
  console.log('- Subject for meeting title');
  console.log('- WhatId or AccountId to link to accounts');
  console.log('- Filter by Type = Meeting or Call');
  console.log('- Query: Events WHERE ActivityDate < TODAY for last meeting');
  console.log('- Query: Events WHERE ActivityDate >= TODAY for next meeting');
}

discoverEinsteinFields().catch(console.error);


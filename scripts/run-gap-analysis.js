/**
 * Run Contact Gap Analysis
 * Quick script to test the gap analysis
 */

const contactGap = require('../src/services/contactGapAnalysis');
const store = require('../src/services/intelligenceStore');

async function run() {
  await store.initialize();
  
  console.log('Running contact gap analysis (90 days, US Pod BLs)...\n');
  
  try {
    const report = await contactGap.analyzeContactGaps({
      daysBack: 90,
      minMeetingCount: 1
    });
    
    console.log('=== SUMMARY ===');
    console.log('Total External Attendees:', report.summary.totalExternalAttendees);
    console.log('BL-Owned Accounts:', report.summary.blOwnedAccounts);
    console.log('Matched to Accounts:', report.summary.matchedToAccounts);
    console.log('Already in Salesforce:', report.summary.alreadyInSalesforce);
    console.log('MISSING CONTACTS:', report.summary.missingContacts);
    
    if (report.missingContacts.length > 0) {
      console.log('\n=== TOP 15 MISSING CONTACTS ===');
      report.missingContacts.slice(0, 15).forEach((c, i) => {
        const num = i + 1;
        console.log(num + '. ' + c.email);
        console.log('   Name: ' + c.firstName + ' ' + c.lastName);
        console.log('   Title: ' + (c.title || 'N/A'));
        console.log('   Account: ' + c.account.name + ' (Owner: ' + c.account.owner + ')');
        console.log('   Meetings: ' + c.meetingCount + ', Last: ' + (c.lastMeeting ? c.lastMeeting.split('T')[0] : 'N/A'));
        console.log('   Source: ' + c.enrichmentSource);
        console.log('');
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
  
  store.close();
}

run();


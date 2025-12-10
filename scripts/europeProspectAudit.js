/**
 * Europe Prospects Salesforce Audit Script
 * 
 * For each company in the European prospects list:
 * 1. Check if account exists in Salesforce (with name variations)
 * 2. Get account owner
 * 3. Get engagement history (Tasks and Events)
 * 4. Get associated contacts
 * 5. Get any open opportunities
 */

// Load environment FIRST before any other modules
const path = require('path');
const fs = require('fs');
const projectRoot = path.resolve(__dirname, '..');

// Load dotenv with explicit path BEFORE requiring any modules that use env vars
const dotenvResult = require('dotenv').config({ path: path.join(projectRoot, '.env') });
if (dotenvResult.error) {
  console.error('Failed to load .env file:', dotenvResult.error);
  process.exit(1);
}

console.log('Environment loaded successfully');
console.log('SF_USERNAME:', process.env.SF_USERNAME);
console.log('SF_INSTANCE_URL:', process.env.SF_INSTANCE_URL);

// NOW require modules that depend on env vars
const { query, initializeSalesforce } = require('../src/salesforce/connection');
const ExcelJS = require('exceljs');

// Read prospects from temp file
const prospects = JSON.parse(fs.readFileSync('/tmp/europe_prospects.json', 'utf8'));

// Generate name variations for fuzzy matching
function generateNameVariations(name) {
  const variations = [name];
  const lower = name.toLowerCase();
  
  // Common variations
  const cleanName = name.replace(/[.,\-&()]/g, ' ').replace(/\s+/g, ' ').trim();
  variations.push(cleanName);
  
  // Without common suffixes
  const noSuffix = name.replace(/(,?\s*(Inc|LLC|Ltd|Corp|Corporation|PLC|plc|Group|SE|AG|SA|GmbH|NV|BV|N\.V\.|B\.V\.)\.?)$/i, '').trim();
  if (noSuffix !== name) variations.push(noSuffix);
  
  // Handle parenthetical names
  const noParens = name.replace(/\([^)]+\)/g, '').trim();
  if (noParens !== name) variations.push(noParens);
  
  // Specific company variations
  const knownVariations = {
    'bp': ['BP', 'BP plc', 'British Petroleum'],
    'gsk': ['GSK', 'GlaxoSmithKline', 'Glaxo Smith Kline'],
    'shell': ['Shell', 'Royal Dutch Shell', 'Shell plc'],
    'totalenergies': ['TotalEnergies', 'Total', 'Total SE'],
    'merck group': ['Merck', 'Merck Group', 'Merck KGaA'],
    'astrazeneca': ['AstraZeneca', 'Astra Zeneca'],
    'novo nordisk': ['Novo Nordisk', 'NovoNordisk'],
    'technipfmc': ['TechnipFMC', 'Technip FMC', 'Technip'],
    'sbm offshore': ['SBM Offshore', 'SBM', 'Single Buoy Moorings'],
    'icon strategic solutions': ['ICON', 'ICON plc', 'ICON Strategic Solutions'],
    'statoil': ['Statoil', 'Equinor', 'Statoil ASA'], // Statoil renamed to Equinor
    'amec foster wheeler': ['Amec Foster Wheeler', 'Wood', 'Wood Group', 'AMEC'], // Now Wood
    'fresenius kabi': ['Fresenius Kabi', 'Fresenius'],
    'maersk drilling': ['Maersk Drilling', 'Maersk', 'Noble Corporation'], // Merged with Noble
    'linde engineering': ['Linde', 'Linde Engineering', 'Linde plc'],
    'barry callebaut group': ['Barry Callebaut', 'Barry Callebaut Group'],
  };
  
  const lowerKey = lower.replace(/[^a-z0-9 ]/g, '').trim();
  if (knownVariations[lowerKey]) {
    variations.push(...knownVariations[lowerKey]);
  }
  
  return [...new Set(variations)];
}

// Query Salesforce for account by name variations
async function findAccount(companyName) {
  const variations = generateNameVariations(companyName);
  
  // Build SOQL LIKE conditions
  const likeConditions = variations.map(v => `Name LIKE '%${v.replace(/'/g, "\\'")}%'`).join(' OR ');
  
  const accountQuery = `
    SELECT Id, Name, Owner.Name, Owner.Email, Customer_Type__c, 
           Account_Plan_s__c, Customer_Brain__c, Nurture__c, 
           BillingCity, BillingCountry, Industry,
           CreatedDate, LastModifiedDate,
           (SELECT Id, Name, StageName, ACV__c, Owner.Name, CreatedDate 
            FROM Opportunities 
            WHERE IsClosed = false
            ORDER BY ACV__c DESC NULLS LAST
            LIMIT 5),
           (SELECT Id, Name, Title, Email 
            FROM Contacts 
            ORDER BY CreatedDate DESC
            LIMIT 5)
    FROM Account 
    WHERE ${likeConditions}
    ORDER BY Name
    LIMIT 5
  `;
  
  try {
    const result = await query(accountQuery, false);
    return result?.records || [];
  } catch (error) {
    console.error(`Error querying account ${companyName}:`, error.message);
    return [];
  }
}

// Query engagement history (Tasks and Events)
async function getEngagementHistory(accountId) {
  try {
    // Get Tasks
    const taskQuery = `
      SELECT Id, Subject, Status, ActivityDate, Owner.Name, Description, WhoId, Who.Name
      FROM Task 
      WHERE AccountId = '${accountId}'
      ORDER BY ActivityDate DESC NULLS LAST
      LIMIT 10
    `;
    
    // Get Events (meetings)
    const eventQuery = `
      SELECT Id, Subject, StartDateTime, Owner.Name, Description, WhoId, Who.Name
      FROM Event 
      WHERE AccountId = '${accountId}'
      ORDER BY StartDateTime DESC NULLS LAST
      LIMIT 10
    `;
    
    const [tasks, events] = await Promise.all([
      query(taskQuery, false),
      query(eventQuery, false)
    ]);
    
    return {
      tasks: tasks?.records || [],
      events: events?.records || []
    };
  } catch (error) {
    console.error(`Error querying engagement for ${accountId}:`, error.message);
    return { tasks: [], events: [] };
  }
}

// Format currency
function formatCurrency(amount) {
  if (!amount) return '-';
  if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(1)}B`;
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

// Main audit function
async function runAudit() {
  console.log('='.repeat(80));
  console.log('EUROPE PROSPECTS SALESFORCE AUDIT');
  console.log('='.repeat(80));
  console.log(`Total prospects to audit: ${prospects.length}`);
  console.log('Started:', new Date().toISOString());
  console.log('='.repeat(80));
  
  // Ensure Salesforce connection
  await initializeSalesforce();
  
  const results = {
    existingAccounts: [],
    netNewAccounts: [],
    accountsWithEngagement: [],
    summary: {
      total: prospects.length,
      existing: 0,
      netNew: 0,
      withEngagement: 0,
      withOpportunities: 0
    }
  };
  
  // Process each prospect
  for (let i = 0; i < prospects.length; i++) {
    const prospect = prospects[i];
    console.log(`\n[${i + 1}/${prospects.length}] Auditing: ${prospect.name}`);
    console.log('-'.repeat(60));
    
    const accounts = await findAccount(prospect.name);
    
    if (accounts.length === 0) {
      // Net new account
      console.log('  Status: NET NEW (not found in Salesforce)');
      console.log(`  Industry: ${prospect.industry}`);
      console.log(`  Location: ${prospect.country}`);
      console.log(`  Revenue: ${formatCurrency(prospect.revenue)}`);
      console.log(`  CEO: ${prospect.ceo || 'Unknown'}`);
      console.log(`  GC: ${prospect.gcName || 'Unknown'} - ${prospect.gcTitle || ''}`);
      
      results.netNewAccounts.push({
        ...prospect,
        sfStatus: 'NET_NEW',
        sfAccountId: null,
        sfOwner: null,
        sfEngagement: null
      });
      results.summary.netNew++;
      
    } else {
      // Found in Salesforce
      const account = accounts[0]; // Take best match
      console.log(`  Status: EXISTS in Salesforce`);
      console.log(`  SF Account: ${account.Name} (ID: ${account.Id})`);
      console.log(`  Owner: ${account.Owner?.Name || 'Unknown'} <${account.Owner?.Email || ''}>`);
      console.log(`  Customer Type: ${account.Customer_Type__c || 'Not set'}`);
      console.log(`  Nurture: ${account.Nurture__c ? 'Yes' : 'No'}`);
      
      // Get engagement history
      const engagement = await getEngagementHistory(account.Id);
      const hasEngagement = engagement.tasks.length > 0 || engagement.events.length > 0;
      const hasOpportunities = account.Opportunities?.records?.length > 0;
      
      console.log(`  Tasks: ${engagement.tasks.length}`);
      console.log(`  Events/Meetings: ${engagement.events.length}`);
      console.log(`  Open Opportunities: ${account.Opportunities?.records?.length || 0}`);
      
      if (hasEngagement) {
        console.log('\n  Recent Engagement:');
        
        // Show recent tasks
        if (engagement.tasks.length > 0) {
          console.log('  Tasks:');
          engagement.tasks.slice(0, 3).forEach(task => {
            console.log(`    - ${task.Subject || 'No subject'} (${task.ActivityDate || 'No date'}) by ${task.Owner?.Name || 'Unknown'}`);
            if (task.Who?.Name) console.log(`      Contact: ${task.Who.Name}`);
          });
        }
        
        // Show recent events
        if (engagement.events.length > 0) {
          console.log('  Events/Meetings:');
          engagement.events.slice(0, 3).forEach(event => {
            const date = event.StartDateTime ? new Date(event.StartDateTime).toLocaleDateString() : 'No date';
            console.log(`    - ${event.Subject || 'No subject'} (${date}) by ${event.Owner?.Name || 'Unknown'}`);
            if (event.Who?.Name) console.log(`      Contact: ${event.Who.Name}`);
          });
        }
        
        results.accountsWithEngagement.push(account.Name);
        results.summary.withEngagement++;
      }
      
      // Show opportunities
      if (hasOpportunities) {
        console.log('\n  Open Opportunities:');
        account.Opportunities.records.forEach(opp => {
          console.log(`    - ${opp.Name}: ${opp.StageName} - ${formatCurrency(opp.ACV__c)} (Owner: ${opp.Owner?.Name || 'Unknown'})`);
        });
        results.summary.withOpportunities++;
      }
      
      // Show contacts
      if (account.Contacts?.records?.length > 0) {
        console.log('\n  Known Contacts:');
        account.Contacts.records.slice(0, 3).forEach(contact => {
          console.log(`    - ${contact.Name} | ${contact.Title || 'No title'} | ${contact.Email || 'No email'}`);
        });
      }
      
      // Check if account plan or customer brain exists
      if (account.Account_Plan_s__c) {
        console.log(`\n  Account Plan: Yes (${account.Account_Plan_s__c.substring(0, 100)}...)`);
      }
      if (account.Customer_Brain__c) {
        console.log(`  Customer Brain Notes: Yes`);
      }
      
      results.existingAccounts.push({
        ...prospect,
        sfStatus: 'EXISTS',
        sfAccountId: account.Id,
        sfAccountName: account.Name,
        sfOwner: account.Owner?.Name,
        sfOwnerEmail: account.Owner?.Email,
        sfCustomerType: account.Customer_Type__c,
        sfNurture: account.Nurture__c,
        sfTaskCount: engagement.tasks.length,
        sfEventCount: engagement.events.length,
        sfHasEngagement: hasEngagement,
        sfOpenOpps: account.Opportunities?.records?.length || 0,
        sfContacts: account.Contacts?.records || []
      });
      results.summary.existing++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('AUDIT SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Prospects Audited: ${results.summary.total}`);
  console.log(`Existing in Salesforce: ${results.summary.existing}`);
  console.log(`Net New Accounts: ${results.summary.netNew}`);
  console.log(`With Engagement History: ${results.summary.withEngagement}`);
  console.log(`With Open Opportunities: ${results.summary.withOpportunities}`);
  console.log('='.repeat(80));
  
  // Save results to JSON
  fs.writeFileSync('/tmp/europe_audit_results.json', JSON.stringify(results, null, 2));
  console.log('\nDetailed results saved to: /tmp/europe_audit_results.json');
  
  return results;
}

// Run the audit
runAudit()
  .then(results => {
    console.log('\nAudit complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Audit failed:', error);
    process.exit(1);
  });


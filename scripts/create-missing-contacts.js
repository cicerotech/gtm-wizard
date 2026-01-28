#!/usr/bin/env node
/**
 * Create Missing Contacts in Salesforce
 * 
 * This script:
 * 1. Fetches the identified contact gaps from the production API
 * 2. Reviews the data quality
 * 3. Creates contacts in Salesforce in batches
 * 
 * Usage:
 *   node scripts/create-missing-contacts.js --dry-run    # Preview only
 *   node scripts/create-missing-contacts.js --create     # Actually create
 */

const https = require('https');
const http = require('http');

const API_BASE = process.env.API_BASE || 'https://gtm-wizard.onrender.com';
const BATCH_SIZE = 10;

/**
 * Make HTTP request
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;
    
    const req = client.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

/**
 * Clean and validate contact name
 */
function cleanName(firstName, lastName, email) {
  let fn = firstName || 'Unknown';
  let ln = lastName || 'Contact';
  
  // Remove obvious errors
  if (fn.includes('@') || fn.includes('.com')) {
    // Name is actually an email - parse it
    const localPart = email.split('@')[0];
    const parts = localPart.split(/[._-]/);
    if (parts.length >= 2) {
      fn = capitalize(parts[0]);
      ln = capitalize(parts[1]);
    } else {
      fn = capitalize(parts[0]);
      ln = 'Unknown';
    }
  }
  
  // Handle "Last, First" format
  if (fn.includes(',')) {
    const parts = fn.split(',').map(p => p.trim());
    fn = parts[1] || fn;
    ln = parts[0] || ln;
  }
  
  // Remove numbers from names
  fn = fn.replace(/[0-9]/g, '').trim();
  ln = ln.replace(/[0-9]/g, '').trim();
  
  return { firstName: fn || 'Unknown', lastName: ln || 'Contact' };
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--create');
  
  console.log('\n=== Contact Gap Creation Tool ===\n');
  console.log(`Mode: ${dryRun ? 'DRY RUN (preview only)' : 'CREATE (will create in Salesforce)'}`);
  console.log(`API: ${API_BASE}\n`);
  
  // Step 1: Fetch gap analysis results
  console.log('Fetching contact gaps...');
  const gapResult = await request(`${API_BASE}/api/contacts/gap-analysis?days=90&minMeetings=1`);
  
  if (!gapResult.success) {
    console.error('Failed to fetch gaps:', gapResult.error || gapResult);
    process.exit(1);
  }
  
  const contacts = gapResult.missingContacts || [];
  console.log(`Found ${contacts.length} missing contacts\n`);
  
  if (contacts.length === 0) {
    console.log('No contacts to create.');
    process.exit(0);
  }
  
  // Step 2: Clean and validate contacts
  console.log('Validating contacts...\n');
  const validContacts = [];
  const issues = [];
  
  for (const c of contacts) {
    const { firstName, lastName } = cleanName(c.firstName, c.lastName, c.email);
    
    // Get accountId from nested structure (account.id)
    const accountId = c.accountId || c.account?.id;
    const accountName = c.accountName || c.account?.name;
    
    // Must have email and accountId
    if (!c.email || !accountId) {
      issues.push(`Missing required field: ${c.email || 'no email'}`);
      continue;
    }
    
    // Skip if name is obviously bad
    if (firstName === 'Unknown' && lastName === 'Contact') {
      issues.push(`Could not parse name for: ${c.email}`);
      continue;
    }
    
    validContacts.push({
      email: c.email.toLowerCase(),
      firstName,
      lastName,
      title: c.title || null,
      account: {
        id: accountId,
        name: accountName
      },
      meetingCount: c.meetingCount
    });
  }
  
  console.log(`Valid contacts: ${validContacts.length}`);
  console.log(`Skipped: ${issues.length}`);
  
  if (issues.length > 0) {
    console.log('\nIssues:');
    issues.slice(0, 10).forEach(i => console.log(`  - ${i}`));
    if (issues.length > 10) console.log(`  ... and ${issues.length - 10} more`);
  }
  
  // Step 3: Show preview
  console.log('\n=== CONTACTS TO CREATE ===\n');
  console.log('First Name'.padEnd(15) + 'Last Name'.padEnd(20) + 'Email'.padEnd(40) + 'Account'.padEnd(30) + 'Meetings');
  console.log('-'.repeat(115));
  
  for (const c of validContacts.slice(0, 30)) {
    console.log(
      c.firstName.padEnd(15) + 
      c.lastName.padEnd(20) + 
      c.email.padEnd(40) + 
      (c.account?.name || '').substring(0, 28).padEnd(30) + 
      String(c.meetingCount || 0)
    );
  }
  
  if (validContacts.length > 30) {
    console.log(`\n... and ${validContacts.length - 30} more contacts`);
  }
  
  console.log(`\nTotal to create: ${validContacts.length}`);
  
  if (dryRun) {
    console.log('\n=== DRY RUN - No contacts created ===');
    console.log('To actually create contacts, run with --create flag');
    process.exit(0);
  }
  
  // Step 4: Create in batches
  console.log('\n=== CREATING CONTACTS ===\n');
  
  let created = 0;
  let failed = 0;
  
  for (let i = 0; i < validContacts.length; i += BATCH_SIZE) {
    const batch = validContacts.slice(i, i + BATCH_SIZE);
    console.log(`Creating batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(validContacts.length/BATCH_SIZE)} (${batch.length} contacts)...`);
    
    try {
      const result = await request(`${API_BASE}/api/contacts/create-batch`, {
        method: 'POST',
        body: {
          contacts: batch,
          dryRun: false,
          approver: 'keigan.pesenti@eudia.com'
        }
      });
      
      if (result.success) {
        const createdCount = result.created?.length || 0;
        const skippedCount = result.skipped?.length || 0;
        created += createdCount;
        console.log(`  ✅ Created ${createdCount} contacts (${skippedCount} skipped/existing)`);
        if (result.errors?.length > 0) {
          console.log(`     Errors: ${result.errors.map(e => e.email + ': ' + e.error).join(', ')}`);
        }
      } else {
        failed += batch.length;
        console.log(`  ❌ Failed: ${result.error}`);
      }
    } catch (error) {
      failed += batch.length;
      console.log(`  ❌ Error: ${error.message}`);
    }
    
    // Rate limiting - wait 2 seconds between batches
    if (i + BATCH_SIZE < validContacts.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  console.log('\n=== RESULTS ===');
  console.log(`Created: ${created}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);


#!/usr/bin/env node

/**
 * Refresh Static Accounts in AccountOwnership.ts
 * 
 * Queries Salesforce for ALL owned accounts (full BoB) for all business leads,
 * determines hadOpportunity flag for each, and regenerates the 
 * OWNERSHIP_DATA.businessLeads block in obsidian-plugin/src/AccountOwnership.ts.
 * 
 * Usage:
 *   node scripts/refresh-static-accounts.js           # Dry-run: prints output
 *   node scripts/refresh-static-accounts.js --write   # Writes to AccountOwnership.ts
 * 
 * Requires: SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN, SF_LOGIN_URL env vars
 * (or run from the same .env as the main server)
 */

require('dotenv').config();
const jsforce = require('jsforce');
const fs = require('fs');
const path = require('path');

const TARGET_FILE = path.join(__dirname, '..', 'obsidian-plugin', 'src', 'AccountOwnership.ts');
const WRITE_MODE = process.argv.includes('--write');

// All BL emails to query (21 owners from full BoB Excel)
const BL_EMAILS = [
  { email: 'alex.fox@eudia.com', name: 'Alex Fox' },
  { email: 'ananth.cherukupally@eudia.com', name: 'Ananth Cherukupally' },
  { email: 'asad.hussain@eudia.com', name: 'Asad Hussain' },
  { email: 'conor.molloy@eudia.com', name: 'Conor Molloy' },
  { email: 'david.vanreyk@eudia.com', name: 'David Van Reyk' },
  { email: 'emer.flynn@eudia.com', name: 'Emer Flynn' },
  { email: 'greg.machale@eudia.com', name: 'Greg MacHale' },
  { email: 'himanshu.agarwal@eudia.com', name: 'Himanshu Agarwal' },
  { email: 'jon.cobb@eudia.com', name: 'Jon Cobb' },
  { email: 'julie.stefanich@eudia.com', name: 'Julie Stefanich' },
  { email: 'justin.hills@eudia.com', name: 'Justin Hills' },
  { email: 'mike.ayres@eudia.com', name: 'Mike Ayres' },
  { email: 'mike@eudia.com', name: 'Mike Masiello' },
  { email: 'mitch.loquaci@eudia.com', name: 'Mitch Loquaci' },
  { email: 'nathan.shine@eudia.com', name: 'Nathan Shine' },
  { email: 'nicola.fratini@eudia.com', name: 'Nicola Fratini' },
  { email: 'olivia.jung@eudia.com', name: 'Olivia Jung' },
  { email: 'rajeev.patel@eudia.com', name: 'Rajeev Patel' },
  { email: 'riley.stack@eudia.com', name: 'Riley Stack' },
  { email: 'sean.boyd@eudia.com', name: 'Sean Boyd' },
  { email: 'tom.clancy@eudia.com', name: 'Tom Clancy' },
];

async function main() {
  console.log('🔄 Connecting to Salesforce...');
  
  const conn = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
  });

  await conn.login(
    process.env.SF_USERNAME,
    process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
  );

  console.log('✅ Connected to Salesforce');

  let totalAccounts = 0;
  let totalActive = 0;
  let totalProspect = 0;
  const allBLData = [];

  for (const bl of BL_EMAILS) {
    // Resolve user ID
    const userResult = await conn.query(
      `SELECT Id FROM User WHERE Email = '${bl.email}' AND IsActive = true LIMIT 1`
    );

    if (!userResult.records || userResult.records.length === 0) {
      console.log(`⚠️  No active user for ${bl.email} — skipping`);
      allBLData.push({ ...bl, accounts: [] });
      continue;
    }

    const userId = userResult.records[0].Id;

    // Query ALL accounts owned by this user (full BoB, no filter)
    const allResult = await conn.query(`
      SELECT Id, Name
      FROM Account
      WHERE OwnerId = '${userId}'
        AND (NOT Name LIKE '%Sample%')
        AND (NOT Name LIKE '%Test%')
      ORDER BY Name ASC
    `);

    // Determine which accounts have ever had an opportunity
    const accountIds = (allResult.records || []).map(a => a.Id);
    const oppAccountIds = new Set();

    if (accountIds.length > 0) {
      for (let i = 0; i < accountIds.length; i += 200) {
        const batch = accountIds.slice(i, i + 200);
        const idList = batch.map(id => `'${id}'`).join(',');
        const oppQuery = `SELECT AccountId FROM Opportunity WHERE AccountId IN (${idList}) GROUP BY AccountId`;
        const oppResult = await conn.query(oppQuery);
        (oppResult.records || []).forEach(r => oppAccountIds.add(r.AccountId));
      }
    }

    const accounts = (allResult.records || []).map(a => ({
      id: a.Id,
      name: a.Name,
      hadOpportunity: oppAccountIds.has(a.Id),
    }));
    accounts.sort((a, b) => a.name.localeCompare(b.name));

    const activeCount = accounts.filter(a => a.hadOpportunity).length;
    const prospectCount = accounts.filter(a => !a.hadOpportunity).length;

    totalAccounts += accounts.length;
    totalActive += activeCount;
    totalProspect += prospectCount;
    allBLData.push({ ...bl, accounts });

    console.log(`  ${bl.name} (${bl.email}): ${accounts.length} accounts (${activeCount} active + ${prospectCount} prospect)`);

    // Small delay to respect rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n📊 Total: ${BL_EMAILS.length} BLs, ${totalAccounts} accounts (${totalActive} active + ${totalProspect} prospect)`);

  // Generate TypeScript block
  const today = new Date().toISOString().split('T')[0];
  const lines = [];
  
  lines.push(`/**`);
  lines.push(` * Static mapping of business leads to their owned accounts.`);
  lines.push(` * Source: Salesforce full BoB (ALL owned accounts, each with hadOpportunity flag)`);
  lines.push(` * Auto-generated by scripts/refresh-static-accounts.js on ${today}`);
  lines.push(` * `);
  lines.push(` * Total: ${BL_EMAILS.length} business leads, ${totalAccounts} accounts (${totalActive} active + ${totalProspect} prospect)`);
  lines.push(` */`);
  lines.push(`const OWNERSHIP_DATA: AccountOwnershipData = {`);
  lines.push(`  version: '${today}',`);
  lines.push(`  lastUpdated: '${today}',`);
  lines.push(`  businessLeads: {`);

  for (const bl of allBLData) {
    const activeCount = bl.accounts.filter(a => a.hadOpportunity).length;
    const prospectCount = bl.accounts.filter(a => !a.hadOpportunity).length;
    lines.push(``);
    lines.push(`    // ${bl.name.toUpperCase()} (${activeCount} active + ${prospectCount} prospect = ${bl.accounts.length} total)`);
    lines.push(`    '${bl.email}': {`);
    lines.push(`      email: '${bl.email}',`);
    lines.push(`      name: '${bl.name}',`);
    lines.push(`      accounts: [`);
    for (const a of bl.accounts) {
      const nameEscaped = a.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      lines.push(`        { id: '${a.id}', name: '${nameEscaped}', hadOpportunity: ${a.hadOpportunity} },`);
    }
    lines.push(`      ]`);
    lines.push(`    },`);
  }

  lines.push(`  }`);
  lines.push(`};`);

  const generatedBlock = lines.join('\n');

  if (WRITE_MODE) {
    console.log('\n✏️  Writing to AccountOwnership.ts...');
    
    const content = fs.readFileSync(TARGET_FILE, 'utf-8');
    
    // Find the OWNERSHIP_DATA block boundaries
    const startMarker = /\/\*\*\s*\n\s*\* Static mapping of business leads/;
    const endMarker = /^};$/m;
    
    const startMatch = content.match(startMarker);
    if (!startMatch) {
      console.error('❌ Could not find OWNERSHIP_DATA start marker in AccountOwnership.ts');
      process.exit(1);
    }
    
    const startIndex = content.indexOf(startMatch[0]);
    
    // Find the closing `};` after the start
    const afterStart = content.substring(startIndex);
    const constMatch = afterStart.match(/^const OWNERSHIP_DATA.*?\n/m);
    if (!constMatch) {
      console.error('❌ Could not find const OWNERSHIP_DATA declaration');
      process.exit(1);
    }
    
    // Find the closing `};` — it's the first `};` on its own line after `const OWNERSHIP_DATA`
    const endMatch = afterStart.match(/^};$/m);
    if (!endMatch) {
      console.error('❌ Could not find closing }; for OWNERSHIP_DATA');
      process.exit(1);
    }
    
    const endIndex = startIndex + endMatch.index + endMatch[0].length;
    
    const newContent = content.substring(0, startIndex) + generatedBlock + content.substring(endIndex);
    
    fs.writeFileSync(TARGET_FILE, newContent, 'utf-8');
    console.log('✅ AccountOwnership.ts updated successfully');
  } else {
    console.log('\n📝 Generated block (dry-run, use --write to apply):');
    console.log('─'.repeat(60));
    console.log(generatedBlock);
    console.log('─'.repeat(60));
  }

  await conn.logout();
  console.log('\n✅ Done');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

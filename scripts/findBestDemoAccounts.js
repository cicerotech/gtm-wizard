#!/usr/bin/env node
/**
 * Find Best Demo Accounts for Cheat Sheet
 * 
 * Queries Salesforce to identify accounts with the richest data
 * for each cheat sheet example category.
 * 
 * Usage: node scripts/findBestDemoAccounts.js
 */

require('dotenv').config();
const { initializeSalesforce, query } = require('../src/salesforce/connection');

async function main() {
  console.log('🔍 Finding best demo accounts for cheat sheet...\n');
  
  try {
    await initializeSalesforce();
    console.log('✅ Connected to Salesforce\n');
    
    const results = {};
    
    // 1.1 Account Lookup - Best owned accounts with activity
    console.log('=== 1.1 ACCOUNT LOOKUP (Who Owns) ===');
    const accountLookup = await query(`
      SELECT Name, Owner.Name, LastActivityDate, Industry
      FROM Account 
      WHERE Owner.Name != null 
        AND Nurture__c = false
        AND (NOT Name LIKE '%Test%')
        AND (NOT Name LIKE '%Sample%')
      ORDER BY LastActivityDate DESC NULLS LAST
      LIMIT 15
    `);
    results.accountLookup = accountLookup.records.slice(0, 10);
    console.log('Top accounts with owners:');
    results.accountLookup.forEach((a, i) => {
      console.log(`  ${i+1}. ${a.Name} - Owner: ${a.Owner?.Name || 'N/A'} - Activity: ${a.LastActivityDate || 'N/A'}`);
    });
    console.log('');
    
    // 1.2 Legal Team Size
    console.log('=== 1.2 LEGAL TEAM SIZE ===');
    const legalTeam = await query(`
      SELECT Name, Owner.Name, Legal_Department_Size__c, Industry
      FROM Account 
      WHERE Legal_Department_Size__c != null
        AND Owner.Name != null
      ORDER BY Name
      LIMIT 15
    `);
    results.legalTeam = legalTeam.records;
    console.log('Accounts with legal team size data:');
    results.legalTeam.forEach((a, i) => {
      console.log(`  ${i+1}. ${a.Name} - Legal: ${a.Legal_Department_Size__c} - Owner: ${a.Owner?.Name}`);
    });
    console.log('');
    
    // 1.3 Decision Makers
    console.log('=== 1.3 DECISION MAKERS ===');
    const decisionMakers = await query(`
      SELECT Name, Owner.Name, Key_Decision_Makers__c
      FROM Account 
      WHERE Key_Decision_Makers__c != null
        AND Owner.Name != null
      ORDER BY LastActivityDate DESC NULLS LAST
      LIMIT 15
    `);
    results.decisionMakers = decisionMakers.records;
    console.log('Accounts with decision makers data:');
    results.decisionMakers.forEach((a, i) => {
      const dm = a.Key_Decision_Makers__c?.substring(0, 50) + '...';
      console.log(`  ${i+1}. ${a.Name} - DMs: ${dm}`);
    });
    console.log('');
    
    // 1.4 Use Cases
    console.log('=== 1.4 USE CASES ===');
    const useCases = await query(`
      SELECT Name, Owner.Name, Use_Cases_Interested__c, Use_Cases_Discussed__c
      FROM Account 
      WHERE (Use_Cases_Interested__c != null OR Use_Cases_Discussed__c != null)
        AND Owner.Name != null
      ORDER BY LastActivityDate DESC NULLS LAST
      LIMIT 15
    `);
    results.useCases = useCases.records;
    console.log('Accounts with use cases data:');
    results.useCases.forEach((a, i) => {
      const uc = (a.Use_Cases_Interested__c || a.Use_Cases_Discussed__c || '').substring(0, 50);
      console.log(`  ${i+1}. ${a.Name} - Use Cases: ${uc}`);
    });
    console.log('');
    
    // 1.5 Competitive Landscape
    console.log('=== 1.5 COMPETITIVE LANDSCAPE ===');
    const competitive = await query(`
      SELECT Name, Owner.Name, Competitive_Landscape__c
      FROM Account 
      WHERE Competitive_Landscape__c != null
        AND Owner.Name != null
      ORDER BY LastActivityDate DESC NULLS LAST
      LIMIT 15
    `);
    results.competitive = competitive.records;
    console.log('Accounts with competitive data:');
    results.competitive.forEach((a, i) => {
      const cl = a.Competitive_Landscape__c?.substring(0, 50) + '...';
      console.log(`  ${i+1}. ${a.Name} - Competitors: ${cl}`);
    });
    console.log('');
    
    // 1.6 Contracts
    console.log('=== 1.6 CONTRACTS ===');
    try {
      const contracts = await query(`
        SELECT Account.Name, Account.Owner.Name, COUNT(Id) ContractCount
        FROM Contract
        WHERE Account.Name != null
        GROUP BY Account.Name, Account.Owner.Name
        ORDER BY COUNT(Id) DESC
        LIMIT 10
      `);
      results.contracts = contracts.records;
      console.log('Accounts with contracts:');
      results.contracts.forEach((c, i) => {
        console.log(`  ${i+1}. ${c.Account?.Name} - ${c.ContractCount} contracts - Owner: ${c.Account?.Owner?.Name}`);
      });
    } catch (e) {
      console.log('  (Contract query failed - may not have access)');
      results.contracts = [];
    }
    console.log('');
    
    // 1.7 Safe Accounts for Create Opportunity
    console.log('=== 1.7 SAFE ACCOUNTS FOR CREATE OPP ===');
    const safeAccounts = await query(`
      SELECT Name, Owner.Name
      FROM Account 
      WHERE Owner.Name != null 
        AND Nurture__c = false
        AND (NOT Name LIKE '%Test%')
        AND Id NOT IN (SELECT AccountId FROM Opportunity WHERE IsClosed = false)
      ORDER BY Name
      LIMIT 15
    `);
    results.safeAccounts = safeAccounts.records;
    console.log('Accounts with NO open opps (safe for demo):');
    results.safeAccounts.forEach((a, i) => {
      console.log(`  ${i+1}. ${a.Name} - Owner: ${a.Owner?.Name}`);
    });
    console.log('');
    
    // 1.8 Active Pipeline by Owner
    console.log('=== 1.8 OWNERS WITH MOST DEALS ===');
    const ownerPipeline = await query(`
      SELECT Owner.Name, COUNT(Id) DealCount, SUM(Amount) TotalAmount
      FROM Opportunity 
      WHERE IsClosed = false
      GROUP BY Owner.Name
      ORDER BY COUNT(Id) DESC
      LIMIT 10
    `);
    results.ownerPipeline = ownerPipeline.records;
    console.log('Owners with most active deals:');
    results.ownerPipeline.forEach((o, i) => {
      const amt = o.TotalAmount ? `$${(o.TotalAmount/1000000).toFixed(1)}M` : 'N/A';
      console.log(`  ${i+1}. ${o.Owner?.Name} - ${o.DealCount} deals - ${amt}`);
    });
    console.log('');
    
    // 1.9 Accounts with Customer History/Notes
    console.log('=== 1.9 ACCOUNTS WITH RICH DATA (MULTI-FIELD) ===');
    const richAccounts = await query(`
      SELECT Name, Owner.Name, 
             Legal_Department_Size__c, Key_Decision_Makers__c,
             Use_Cases_Interested__c, Competitive_Landscape__c,
             Pain_Points_Identified__c
      FROM Account 
      WHERE Owner.Name != null
        AND Nurture__c = false
        AND (Legal_Department_Size__c != null 
             OR Key_Decision_Makers__c != null
             OR Use_Cases_Interested__c != null
             OR Competitive_Landscape__c != null)
      ORDER BY LastActivityDate DESC NULLS LAST
      LIMIT 20
    `);
    
    // Score accounts by number of populated fields
    const scoredAccounts = richAccounts.records.map(a => {
      let score = 0;
      if (a.Legal_Department_Size__c) score++;
      if (a.Key_Decision_Makers__c) score++;
      if (a.Use_Cases_Interested__c) score++;
      if (a.Competitive_Landscape__c) score++;
      if (a.Pain_Points_Identified__c) score++;
      return { ...a, score };
    }).sort((a, b) => b.score - a.score);
    
    results.richAccounts = scoredAccounts;
    console.log('Accounts with most populated fields:');
    scoredAccounts.slice(0, 10).forEach((a, i) => {
      console.log(`  ${i+1}. ${a.Name} - Score: ${a.score}/5 - Owner: ${a.Owner?.Name}`);
    });
    console.log('');
    
    // Summary recommendations
    console.log('═══════════════════════════════════════════════════');
    console.log('              RECOMMENDED DEMO ACCOUNTS             ');
    console.log('═══════════════════════════════════════════════════');
    console.log('');
    
    const recommendations = {
      accountLookup: results.richAccounts[0]?.Name || results.accountLookup[0]?.Name,
      accountLookup2: results.richAccounts[1]?.Name || results.accountLookup[1]?.Name,
      legalTeam: results.legalTeam[0]?.Name,
      decisionMakers: results.decisionMakers[0]?.Name,
      useCases: results.useCases[0]?.Name,
      competitive: results.competitive[0]?.Name,
      contracts: results.contracts[0]?.Account?.Name || results.accountLookup[2]?.Name,
      createOpp: results.safeAccounts[0]?.Name,
      createOpp2: results.safeAccounts[1]?.Name,
      ownerBest: results.ownerPipeline[0]?.Owner?.Name,
      ownerSecond: results.ownerPipeline[1]?.Owner?.Name
    };
    
    console.log('For "who owns [X]":', recommendations.accountLookup, ',', recommendations.accountLookup2);
    console.log('For "legal team size at [X]":', recommendations.legalTeam);
    console.log('For "decision makers at [X]":', recommendations.decisionMakers);
    console.log('For "use cases for [X]":', recommendations.useCases);
    console.log('For "competitive landscape for [X]":', recommendations.competitive);
    console.log('For "contracts for [X]":', recommendations.contracts);
    console.log('For "create opp for [X]":', recommendations.createOpp, ',', recommendations.createOpp2);
    console.log('For "[Owner] deals":', recommendations.ownerBest, ',', recommendations.ownerSecond);
    console.log('');
    
    // Output as JSON for easy copy
    console.log('═══════════════════════════════════════════════════');
    console.log('              JSON OUTPUT FOR CHEAT SHEET           ');
    console.log('═══════════════════════════════════════════════════');
    console.log(JSON.stringify(recommendations, null, 2));
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();


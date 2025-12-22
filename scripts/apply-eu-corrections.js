#!/usr/bin/env node
/**
 * Apply EU Corrections to Salesforce
 * Updates ACV and Term for EU opportunities based on contract reconciliation
 */

require('dotenv').config();
const jsforce = require('jsforce');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Helper to convert 15-char to 18-char Salesforce ID
function to18CharId(id15) {
    if (!id15 || id15.length !== 15) return id15;
    const suffix = [];
    for (let i = 0; i < 3; i++) {
        let f = 0;
        for (let j = 0; j < 5; j++) {
            const c = id15.charAt(i * 5 + j);
            if (c >= 'A' && c <= 'Z') {
                f += 1 << j;
            }
        }
        suffix.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'.charAt(f));
    }
    return id15 + suffix.join('');
}

// Configuration
const RECONCILIATION_FILE = '/Users/keiganpesenti/Desktop/JH_Goal_Seek_Reconciliation.xlsx';
const LOG_FILE = '/Users/keiganpesenti/Desktop/JH_EU_Corrections_Log.json';

// Salesforce connection
const conn = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com'
});

async function loadCorrections() {
    console.log('Loading corrections from Excel...');
    
    const workbook = XLSX.readFile(RECONCILIATION_FILE);
    
    // Load SF Corrections sheet
    const correctionsSheet = workbook.Sheets['SF Corrections'];
    const corrections = XLSX.utils.sheet_to_json(correctionsSheet);
    
    // Load DataLoader Updates sheet
    const dataLoaderSheet = workbook.Sheets['DataLoader Updates'];
    const dataLoaderUpdates = XLSX.utils.sheet_to_json(dataLoaderSheet);
    
    console.log(`  Found ${corrections.length} corrections`);
    console.log(`  Found ${dataLoaderUpdates.length} DataLoader updates`);
    
    return { corrections, dataLoaderUpdates };
}

async function verifyOpportunities(oppIds) {
    console.log('\nVerifying opportunities in Salesforce...');
    
    // Convert to 18-char IDs
    const ids18 = oppIds.map(id => {
        if (!id || id === 'CREATE NEW') return null;
        // Ensure 18-char format
        if (id.length === 15) {
            return to18CharId(id);
        }
        return id;
    }).filter(Boolean);
    
    if (ids18.length === 0) {
        console.log('  No valid opportunity IDs to verify');
        return new Map();
    }
    
    const query = `
        SELECT Id, Name, ACV__c, Term__c, StageName, Account.Name, Pod__c
        FROM Opportunity
        WHERE Id IN ('${ids18.join("','")}')
    `;
    
    const result = await conn.query(query);
    const oppMap = new Map();
    
    result.records.forEach(opp => {
        oppMap.set(opp.Id, opp);
    });
    
    console.log(`  Verified ${result.records.length} opportunities`);
    return oppMap;
}

async function applyUpdates(corrections, oppMap) {
    console.log('\n' + '='.repeat(80));
    console.log('APPLYING UPDATES');
    console.log('='.repeat(80));
    
    const updates = [];
    const log = [];
    
    for (const correction of corrections) {
        const oppId = correction.SF_Opp_ID;
        
        // Skip if no match or CREATE NEW
        if (!oppId || oppId === 'CREATE NEW') {
            log.push({
                client: correction.Client,
                contract: correction.Contract,
                status: 'SKIPPED',
                reason: 'No matching opportunity - needs manual creation',
                contract_acv: correction.Contract_ACV,
                contract_term: correction.Contract_Term
            });
            continue;
        }
        
        // Convert to 18-char
        const oppId18 = oppId.length === 15 ? to18CharId(oppId) : oppId;
        const existingOpp = oppMap.get(oppId18);
        
        if (!existingOpp) {
            log.push({
                client: correction.Client,
                contract: correction.Contract,
                oppId: oppId,
                status: 'NOT FOUND',
                reason: 'Opportunity not found in Salesforce'
            });
            continue;
        }
        
        // Check if Pod is EU (exclude US)
        if (existingOpp.Pod__c === 'US') {
            log.push({
                client: correction.Client,
                contract: correction.Contract,
                oppId: oppId,
                oppName: existingOpp.Name,
                status: 'SKIPPED',
                reason: 'US Pod - excluded from EU reconciliation'
            });
            continue;
        }
        
        // Prepare update
        const update = { Id: oppId18 };
        const changes = [];
        
        // Update ACV if variance > 10%
        const contractACV = correction.Recommended_ACV || correction.Contract_ACV;
        const currentACV = existingOpp.ACV__c || 0;
        const variance = currentACV > 0 ? Math.abs(contractACV - currentACV) / currentACV : 1;
        
        if (contractACV && variance > 0.10) {
            update.ACV__c = Math.round(contractACV);
            changes.push(`ACV: €${currentACV.toLocaleString()} → €${contractACV.toLocaleString()}`);
        }
        
        // Update Term if provided and different
        const contractTerm = correction.Recommended_Term || correction.Contract_Term;
        if (contractTerm && contractTerm !== existingOpp.Term__c) {
            update.Term__c = contractTerm;
            changes.push(`Term: ${existingOpp.Term__c} → ${contractTerm} months`);
        }
        
        if (changes.length > 0) {
            updates.push(update);
            console.log(`\n✓ ${existingOpp.Account.Name} - ${existingOpp.Name}`);
            console.log(`  ID: ${oppId18}`);
            changes.forEach(c => console.log(`  → ${c}`));
            
            log.push({
                client: correction.Client,
                contract: correction.Contract,
                oppId: oppId18,
                oppName: existingOpp.Name,
                accountName: existingOpp.Account.Name,
                status: 'UPDATED',
                changes: changes
            });
        } else {
            log.push({
                client: correction.Client,
                contract: correction.Contract,
                oppId: oppId18,
                oppName: existingOpp.Name,
                status: 'NO CHANGE',
                reason: 'Values already match or within tolerance'
            });
        }
    }
    
    return { updates, log };
}

async function executeUpdates(updates) {
    if (updates.length === 0) {
        console.log('\nNo updates to apply.');
        return [];
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`EXECUTING ${updates.length} UPDATES`);
    console.log('='.repeat(80));
    
    const results = await conn.sobject('Opportunity').update(updates, { allowRecursive: true });
    
    const summary = {
        success: 0,
        failed: 0,
        errors: []
    };
    
    results.forEach((result, index) => {
        if (result.success) {
            console.log(`✅ Updated: ${updates[index].Id}`);
            summary.success++;
        } else {
            console.error(`❌ Failed: ${updates[index].Id} - ${result.errors.map(e => e.message).join(', ')}`);
            summary.failed++;
            summary.errors.push({
                id: updates[index].Id,
                errors: result.errors
            });
        }
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('UPDATE SUMMARY');
    console.log('='.repeat(80));
    console.log(`  ✅ Successful: ${summary.success}`);
    console.log(`  ❌ Failed: ${summary.failed}`);
    
    return results;
}

async function main() {
    console.log('='.repeat(80));
    console.log('JOHNSON HANA EU CORRECTIONS - SALESFORCE UPDATE');
    console.log('='.repeat(80) + '\n');
    
    try {
        // Connect to Salesforce
        console.log('Connecting to Salesforce...');
        await conn.login(
            process.env.SF_USERNAME,
            process.env.SF_PASSWORD + process.env.SF_SECURITY_TOKEN
        );
        console.log(`✅ Connected to: ${conn.instanceUrl}\n`);
        
        // Load corrections
        const { corrections, dataLoaderUpdates } = await loadCorrections();
        
        // Get all opportunity IDs
        const allOppIds = corrections
            .map(c => c.SF_Opp_ID)
            .filter(id => id && id !== 'CREATE NEW');
        
        // Verify opportunities
        const oppMap = await verifyOpportunities(allOppIds);
        
        // Prepare and apply updates
        const { updates, log } = await applyUpdates(corrections, oppMap);
        
        // Execute updates
        await executeUpdates(updates);
        
        // Save log
        fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
        console.log(`\n📁 Log saved to: ${LOG_FILE}`);
        
        // Summary of items needing manual attention
        const needsCreation = corrections.filter(c => c.SF_Opp_ID === 'CREATE NEW');
        if (needsCreation.length > 0) {
            console.log('\n' + '='.repeat(80));
            console.log('OPPORTUNITIES TO CREATE MANUALLY');
            console.log('='.repeat(80));
            needsCreation.forEach(c => {
                console.log(`\n  ${c.Client}`);
                console.log(`    Contract: ${c.Contract}`);
                console.log(`    ACV: €${(c.Contract_ACV || 0).toLocaleString()}`);
                console.log(`    Term: ${c.Contract_Term || 'TBD'} months`);
            });
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        throw error;
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});


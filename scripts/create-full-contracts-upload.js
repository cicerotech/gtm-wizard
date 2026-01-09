#!/usr/bin/env node
/**
 * Create Full Contracts DataLoader Upload
 * - Queries Salesforce for Account IDs
 * - One row per contract PDF
 * - Marks contracts without ACV as "Review ACV"
 */

require('dotenv').config();
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { query, sfConnection } = require('../src/salesforce/connection');

const SURGICAL_FILE = '/Users/keiganpesenti/Desktop/JH_Contracts_SURGICAL.xlsx';
const OUTPUT_CSV = '/Users/keiganpesenti/Desktop/JH_Contracts_FULL_UPLOAD.csv';
const OUTPUT_XLSX = '/Users/keiganpesenti/Desktop/JH_Contracts_FULL_UPLOAD.xlsx';

// Folder name to SF Account name mapping (for lookup)
const FOLDER_TO_SF_NAME = {
    'BOI': 'Bank of Ireland',
    'OpenAI': 'OpenAi',
    'Stripe': 'Stripe',
    'AirBnB': 'Airbnb',
    'ESB': 'ESB',
    'Irish Water : Uisce Eireann': 'Uisce Eireann',
    'Indeed': 'Indeed',
    'Etsy': 'Etsy',
    'TikTok': 'Tiktok',
    'Tinder': 'Tinder',
    'Dropbox': 'Dropbox',
    'Northern Trust': 'Northern Trust',
    'Consensys': 'Consensys',
    'Commscope': 'CommScope',
    'Gilead': 'Gilead',
    'Glanbia': 'Glanbia',
    'Taoglas': 'Taoglas',
    'Teamwork': 'Teamwork',
    'Perrigo': 'Perrigo',
    'Coillte': 'Coillte',
    'Udemy': 'Udemy',
    'Kellanova': 'Kellanova',
    'Sisk': 'Sisk',
    'Orsted': 'Orsted',
    'Aryza': 'Aryza',
    'Airship': 'Airship',
    'Datalex': 'Datalex',
    'Aramark': 'Aramark',
    'Comisiun na Mean': 'Coimisiun',
};

async function main() {
    console.log('='.repeat(100));
    console.log('CREATING FULL CONTRACTS DATALOADER UPLOAD');
    console.log('='.repeat(100) + '\n');

    try {
        // Initialize Salesforce connection
        console.log('Connecting to Salesforce...');
        await sfConnection.initialize();
        console.log('✅ Connected to Salesforce\n');

        // Load surgical extraction data
        console.log('Loading surgical extraction data...');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(SURGICAL_FILE);
        const sheet = workbook.worksheets[0];
        const data = [];
        const headers = [];
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) {
                row.eachCell((cell, colNumber) => { headers[colNumber] = cell.value; });
            } else {
                const rowData = {};
                row.eachCell((cell, colNumber) => { rowData[headers[colNumber]] = cell.value; });
                data.push(rowData);
            }
        });
        console.log(`Loaded ${data.length} contracts\n`);

        // Get unique client folder names
        const clientFolders = [...new Set(data.map(d => d.Client))];
        console.log(`Found ${clientFolders.length} unique clients\n`);

        // Query Salesforce for all accounts
        console.log('Querying Salesforce for Account IDs...');
        const accountMap = new Map();

        for (const folder of clientFolders) {
            const searchName = FOLDER_TO_SF_NAME[folder] || folder;
            
            // Try to find account with partial match
            const result = await query(`
                SELECT Id, Name 
                FROM Account 
                WHERE Name LIKE '%${searchName.substring(0, 15).replace(/'/g, "\\'")}%'
                ORDER BY Name
                LIMIT 5
            `);

            if (result && result.records && result.records.length > 0) {
                // Pick the best match (first result)
                const account = result.records[0];
                accountMap.set(folder, {
                    id: account.Id,
                    name: account.Name
                });
                console.log(`  ✓ ${folder} → ${account.Name} (${account.Id})`);
            } else {
                console.log(`  ✗ ${folder} → NO MATCH FOUND`);
                accountMap.set(folder, { id: '', name: 'NOT FOUND' });
            }
        }

        // Get default owner ID
        console.log('\nLooking up default Contract Owner...');
        const ownerResult = await query(`
            SELECT Id, Name 
            FROM User 
            WHERE IsActive = true 
            ORDER BY CreatedDate
            LIMIT 1
        `);
        const defaultOwnerId = ownerResult?.records?.[0]?.Id || '';
        console.log(`Default Owner: ${ownerResult?.records?.[0]?.Name || 'Not found'} (${defaultOwnerId})`);

        // Create upload records
        console.log('\nCreating upload records...');
        const uploadRecords = [];

        for (const row of data) {
            const accountInfo = accountMap.get(row.Client) || { id: '', name: 'NOT FOUND' };
            const hasACV = row.ACV_USD && !isNaN(row.ACV_USD) && row.ACV_USD > 0;
            
            // Build contract name
            let contractName = `${row.Client} - ${row.Contract}`;
            if (contractName.length > 80) {
                contractName = contractName.substring(0, 77) + '...';
            }
            
            // Add "Review ACV" if no value extracted
            if (!hasACV) {
                contractName = `[Review ACV] ${contractName}`;
                if (contractName.length > 80) {
                    contractName = contractName.substring(0, 77) + '...';
                }
            }

            // Determine term
            let termMonths = row.Term_Months;
            if (!termMonths || isNaN(termMonths) || termMonths <= 0) {
                termMonths = 12; // Default 12 months
            }

            // Calculate values
            const acvUsd = hasACV ? parseFloat(row.ACV_USD) : 0;
            const monthlyAmount = acvUsd > 0 ? acvUsd / 12 : 0;
            const totalValue = acvUsd > 0 ? acvUsd * (termMonths / 12) : 0;

            // Determine product line from contract name
            let productLine = 'Contracting';
            const nameLower = row.Contract.toLowerCase();
            if (nameLower.includes('privacy') || nameLower.includes('gdpr') || nameLower.includes('dsar')) {
                productLine = 'Privacy';
            } else if (nameLower.includes('litigation') || nameLower.includes('dispute')) {
                productLine = 'Litigation';
            } else if (nameLower.includes('compliance') || nameLower.includes('f&p') || nameLower.includes('fitness')) {
                productLine = 'Compliance';
            }

            const record = {
                // Required fields
                Contract_Name_Campfire__c: contractName,
                AccountId: accountInfo.id,
                StartDate: row.Start_Date || new Date().toISOString().split('T')[0],
                ContractTerm: parseInt(termMonths),
                Contract_Type__c: 'Recurring',
                Status: 'Draft',
                OwnerId: defaultOwnerId,
                
                // Standard fields
                AI_Enabled__c: 'TRUE',
                Currency__c: 'USD',
                
                // Monetary fields (only if we have ACV)
                Contract_Value__c: totalValue > 0 ? Math.round(totalValue * 100) / 100 : '',
                Annualized_Revenue__c: acvUsd > 0 ? Math.round(acvUsd * 100) / 100 : '',
                Amount__c: monthlyAmount > 0 ? Math.round(monthlyAmount * 100) / 100 : '',
                
                // Product fields
                Product_Line__c: productLine,
                Parent_Product__c: productLine,
                
                // Tracking fields (for reference, remove before upload)
                _Client_Folder: row.Client,
                _SF_Account_Name: accountInfo.name,
                _Has_ACV: hasACV ? 'YES' : 'NO',
                _Source_ACV: row.ACV_Calculation || '',
            };

            uploadRecords.push(record);
        }

        // Summary
        console.log('\n' + '='.repeat(100));
        console.log('SUMMARY');
        console.log('='.repeat(100));

        const withACV = uploadRecords.filter(r => r._Has_ACV === 'YES').length;
        const withoutACV = uploadRecords.filter(r => r._Has_ACV === 'NO').length;
        const withAccountId = uploadRecords.filter(r => r.AccountId).length;
        const missingAccountId = uploadRecords.filter(r => !r.AccountId).length;

        console.log(`Total contracts: ${uploadRecords.length}`);
        console.log(`With ACV: ${withACV}`);
        console.log(`Without ACV (marked "Review ACV"): ${withoutACV}`);
        console.log(`With Account ID: ${withAccountId}`);
        console.log(`Missing Account ID: ${missingAccountId}`);

        const totalACV = uploadRecords.reduce((sum, r) => sum + (parseFloat(r.Annualized_Revenue__c) || 0), 0);
        console.log(`\nTotal ACV: $${totalACV.toLocaleString()}`);

        // Save files
        console.log('\n' + '='.repeat(100));
        console.log('SAVING FILES');
        console.log('='.repeat(100));

        // Create DataLoader CSV (only SF fields)
        const dataLoaderColumns = [
            'Contract_Name_Campfire__c',
            'AccountId',
            'StartDate',
            'ContractTerm',
            'Contract_Type__c',
            'Status',
            'OwnerId',
            'AI_Enabled__c',
            'Currency__c',
            'Contract_Value__c',
            'Annualized_Revenue__c',
            'Amount__c',
            'Product_Line__c',
            'Parent_Product__c',
        ];

        const csvRecords = uploadRecords.map(r => {
            const csvRow = {};
            dataLoaderColumns.forEach(col => {
                csvRow[col] = r[col];
            });
            return csvRow;
        });

        // Helper to add data to worksheet
        const addDataToSheet = (ws, records) => {
            if (records.length === 0) return;
            const cols = Object.keys(records[0]);
            ws.addRow(cols);
            records.forEach(r => ws.addRow(cols.map(c => r[c])));
        };

        // Save CSV
        const csvWorkbook = new ExcelJS.Workbook();
        const csvSheet = csvWorkbook.addWorksheet('Upload');
        addDataToSheet(csvSheet, csvRecords);
        await csvWorkbook.csv.writeFile(OUTPUT_CSV);
        console.log(`CSV: ${OUTPUT_CSV}`);

        // Save full Excel with tracking columns
        const xlsxWorkbook = new ExcelJS.Workbook();
        const allSheet = xlsxWorkbook.addWorksheet('All Contracts');
        addDataToSheet(allSheet, uploadRecords);
        
        // Add sheet for contracts needing ACV review
        const needsReview = uploadRecords.filter(r => r._Has_ACV === 'NO');
        const reviewSheet = xlsxWorkbook.addWorksheet('Review ACV');
        addDataToSheet(reviewSheet, needsReview);
        
        // Add sheet for missing Account IDs
        const missingAccounts = uploadRecords.filter(r => !r.AccountId);
        if (missingAccounts.length > 0) {
            const missingSheet = xlsxWorkbook.addWorksheet('Missing Account ID');
            addDataToSheet(missingSheet, missingAccounts);
        }

        await xlsxWorkbook.xlsx.writeFile(OUTPUT_XLSX);
        console.log(`Excel: ${OUTPUT_XLSX}`);

        // Print contracts by client
        console.log('\n' + '='.repeat(100));
        console.log('CONTRACTS BY CLIENT');
        console.log('='.repeat(100));

        const byClient = {};
        uploadRecords.forEach(r => {
            if (!byClient[r._Client_Folder]) {
                byClient[r._Client_Folder] = { count: 0, withACV: 0, acvTotal: 0, accountId: r.AccountId };
            }
            byClient[r._Client_Folder].count++;
            if (r._Has_ACV === 'YES') {
                byClient[r._Client_Folder].withACV++;
                byClient[r._Client_Folder].acvTotal += parseFloat(r.Annualized_Revenue__c) || 0;
            }
        });

        for (const client of Object.keys(byClient).sort()) {
            const info = byClient[client];
            const acvStatus = info.withACV === info.count ? '✓' : `⚠️  ${info.count - info.withACV} need review`;
            const accountStatus = info.accountId ? '✓' : '✗ Missing ID';
            console.log(`${client}: ${info.count} contracts, $${info.acvTotal.toLocaleString()} ACV ${acvStatus} ${accountStatus}`);
        }

        console.log('\n' + '='.repeat(100));
        console.log('READY FOR UPLOAD');
        console.log('='.repeat(100));
        console.log(`
Use: ${OUTPUT_CSV}

Salesforce Data Loader Settings:
- Object: Contract
- Operation: Insert
- Map columns to API field names

Contracts marked "[Review ACV]" need manual value entry after upload.
        `);

    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});




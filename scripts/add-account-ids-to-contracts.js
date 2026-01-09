#!/usr/bin/env node
/**
 * Add Account IDs to Contracts DataLoader file
 * Queries Salesforce to get Account IDs and updates the CSV
 */

require('dotenv').config();
const ExcelJS = require('exceljs');
const fs = require('fs');
const jsforce = require('jsforce');
const { query, sfConnection } = require('../src/salesforce/connection');

const INPUT_FILE = '/Users/keiganpesenti/Desktop/JH_Contracts_DataLoader.xlsx';
const OUTPUT_CSV = '/Users/keiganpesenti/Desktop/JH_Contracts_DataLoader_WithIDs.csv';
const OUTPUT_XLSX = '/Users/keiganpesenti/Desktop/JH_Contracts_DataLoader_WithIDs.xlsx';

// Folder name to SF Account name mapping
const FOLDER_TO_SF = {
    'BOI': 'Bank of Ireland',
    'OpenAI': 'OpenAi',
    'Stripe': 'Stripe Payments Europe Limited',
    'AirBnB': 'Airbnb',
    'ESB': 'ESB NI/Electric Ireland',
    'Irish Water : Uisce Eireann': 'Uisce Eireann (Irish Water)',
    'Indeed': 'Indeed Ireland Operations Limited',
    'Etsy': 'Etsy Ireland UC',
    'TikTok': 'Tiktok Information Technologies UK Limited',
    'Tinder': 'Tinder LLC',
    'Dropbox': 'Dropbox International Unlimited Company',
    'Northern Trust': 'Northern Trust Management Services (Ireland) Limited',
    'Consensys': 'Consensys',
    'Commscope': 'CommScope Technologies LLC',
    'Gilead': 'Gilead Sciences',
    'Glanbia': 'Glanbia Management Services Limited',
    'Taoglas': 'Taoglas Limited',
    'Teamwork': 'Teamwork Crew Limited T/A Teamwork.com',
    'Perrigo': 'Perrigo Pharma',
    'Coillte': 'Coillte',
    'Udemy': 'Udemy Ireland Limited',
    'Kellanova': 'Kellanova (Ireland)',
    'Sisk': 'Sisk Group',
    'Orsted': 'Orsted',
    'Aryza': 'Aryza',
    'Airship': 'Airship Group Inc',
    'Datalex': 'Datalex (Ireland) Limited',
    'Aramark': 'Aramark Ireland',
    'Comisiun na Mean': 'Coimisiun na Mean',
};

async function main() {
    console.log('='.repeat(80));
    console.log('ADDING ACCOUNT IDs TO CONTRACTS DATALOADER');
    console.log('='.repeat(80) + '\n');

    // Connect to Salesforce
    const conn = new jsforce.Connection({
        loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com'
    });

    try {
        console.log('Connecting to Salesforce...');
        await conn.login(
            process.env.SF_USERNAME,
            process.env.SF_PASSWORD + process.env.SF_SECURITY_TOKEN
        );
        console.log(`✅ Connected to: ${conn.instanceUrl}\n`);

        // Load the DataLoader file
        console.log('Loading DataLoader file...');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(INPUT_FILE);
        const sheet = workbook.worksheets[0];
        const data = [];
        const headers = [];
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) {
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => { headers[colNumber] = cell.value; });
            } else {
                const rowData = {};
                row.eachCell({ includeEmpty: true }, (cell, colNumber) => { 
                    if (headers[colNumber]) rowData[headers[colNumber]] = cell.value; 
                });
                data.push(rowData);
            }
        });
        console.log(`Loaded ${data.length} contracts\n`);

        // Get unique account names to query
        const folderNames = [...new Set(data.map(d => d.Account_Folder))];
        console.log(`Found ${folderNames.length} unique client folders\n`);

        // Query Salesforce for Account IDs
        console.log('Querying Salesforce for Account IDs...');
        const accountMap = new Map();

        for (const folder of folderNames) {
            const sfName = FOLDER_TO_SF[folder] || folder;
            
            // Try exact match first
            let result = await conn.query(`
                SELECT Id, Name 
                FROM Account 
                WHERE Name = '${sfName.replace(/'/g, "\\'")}'
                LIMIT 1
            `);

            if (result.records.length === 0) {
                // Try partial match
                result = await conn.query(`
                    SELECT Id, Name 
                    FROM Account 
                    WHERE Name LIKE '%${folder.substring(0, 10).replace(/'/g, "\\'")}%'
                    LIMIT 1
                `);
            }

            if (result.records.length > 0) {
                accountMap.set(folder, {
                    id: result.records[0].Id,
                    name: result.records[0].Name
                });
                console.log(`  ✓ ${folder} → ${result.records[0].Name} (${result.records[0].Id})`);
            } else {
                console.log(`  ✗ ${folder} → NO MATCH FOUND`);
            }
        }

        // Also get a default Contract Owner ID
        console.log('\nLooking up default Contract Owner...');
        const ownerResult = await conn.query(`
            SELECT Id, Name 
            FROM User 
            WHERE IsActive = true AND Profile.Name LIKE '%Admin%'
            LIMIT 1
        `);
        const defaultOwnerId = ownerResult.records.length > 0 
            ? ownerResult.records[0].Id 
            : '005Wj000002YqYQIA0';
        console.log(`Default Owner: ${ownerResult.records.length > 0 ? ownerResult.records[0].Name : 'Using placeholder'} (${defaultOwnerId})`);

        // Update the data with Account IDs
        console.log('\nUpdating contracts with Account IDs...');
        let matchedCount = 0;
        let unmatchedCount = 0;

        for (const row of data) {
            const accountInfo = accountMap.get(row.Account_Folder);
            if (accountInfo) {
                row.AccountId = accountInfo.id;
                row.SF_Account_Name = accountInfo.name;
                matchedCount++;
            } else {
                row.AccountId = '';
                unmatchedCount++;
            }
            row.OwnerId = defaultOwnerId;
        }

        console.log(`  Matched: ${matchedCount}`);
        console.log(`  Unmatched: ${unmatchedCount}`);

        // Save updated files
        console.log('\n' + '='.repeat(80));
        console.log('SAVING UPDATED FILES');
        console.log('='.repeat(80));

        // CSV
        const csvData = data.map(row => ({
            Contract_Name_Campfire__c: row.Contract_Name_Campfire__c,
            AccountId: row.AccountId,
            StartDate: row.StartDate,
            ContractTerm: row.ContractTerm,
            Contract_Type__c: row.Contract_Type__c,
            Status: row.Status,
            OwnerId: row.OwnerId,
            AI_Enabled__c: row.AI_Enabled__c,
            Currency__c: row.Currency__c,
            Contract_Value__c: row.Contract_Value__c,
            Annualized_Revenue__c: row.Annualized_Revenue__c,
            Amount__c: row.Amount__c,
            Product_Line__c: row.Product_Line__c,
            Parent_Product__c: row.Parent_Product__c,
        }));

        // Filter to only rows with AccountId
        const validRecords = csvData.filter(r => r.AccountId);
        
        // Helper to add data to worksheet
        const addDataToSheet = (ws, records) => {
            if (records.length === 0) return;
            const cols = Object.keys(records[0]);
            ws.addRow(cols);
            records.forEach(r => ws.addRow(cols.map(c => r[c])));
        };

        const newWorkbook = new ExcelJS.Workbook();
        
        // All records sheet
        const allSheet = newWorkbook.addWorksheet('All Contracts');
        addDataToSheet(allSheet, data);
        
        // Ready for upload sheet (only valid records)
        const readySheet = newWorkbook.addWorksheet('Ready for Upload');
        addDataToSheet(readySheet, validRecords);
        
        // Save Excel
        await newWorkbook.xlsx.writeFile(OUTPUT_XLSX);
        console.log(`Excel saved to: ${OUTPUT_XLSX}`);

        // Save CSV (only valid records)
        const csvWorkbook = new ExcelJS.Workbook();
        const csvSheet = csvWorkbook.addWorksheet('Sheet1');
        addDataToSheet(csvSheet, validRecords);
        await csvWorkbook.csv.writeFile(OUTPUT_CSV);
        console.log(`CSV saved to: ${OUTPUT_CSV}`);

        // Summary
        console.log('\n' + '='.repeat(80));
        console.log('SUMMARY');
        console.log('='.repeat(80));
        console.log(`Total contracts: ${data.length}`);
        console.log(`Ready for upload: ${validRecords.length}`);
        console.log(`Missing Account ID: ${unmatchedCount}`);
        
        const totalACV = validRecords.reduce((sum, r) => sum + (parseFloat(r.Annualized_Revenue__c) || 0), 0);
        console.log(`Total ACV (uploadable): $${totalACV.toLocaleString()}`);

        console.log('\n' + '='.repeat(80));
        console.log('READY FOR DATALOADER UPLOAD');
        console.log('='.repeat(80));
        console.log(`
Use the CSV file: ${OUTPUT_CSV}

DataLoader Settings:
- Object: Contract
- Operation: Insert
- Map all columns to their corresponding API names

The file contains ${validRecords.length} contracts with Account IDs ready for upload.
        `);

    } catch (error) {
        console.error('Error:', error.message);
        throw error;
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});


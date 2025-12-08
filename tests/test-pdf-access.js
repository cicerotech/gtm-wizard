#!/usr/bin/env node
require('dotenv').config();

async function testPDFAccess() {
  const { initializeSalesforce, query } = require('./src/salesforce/connection');
  await initializeSalesforce();

  // Get a contract with files
  const contractQuery = `SELECT Id, ContractNumber, Account.Name 
                         FROM Contract 
                         WHERE Account.Name LIKE '%Cargill%'
                         LIMIT 1`;
  
  const contract = await query(contractQuery, false);
  const contractId = contract.records[0].Id;
  
  console.log(`Contract ID: ${contractId}\n`);

  // Query files attached to this contract
  const filesQuery = `SELECT ContentDocument.Id,
                             ContentDocument.Title,
                             ContentDocument.LatestPublishedVersionId,
                             ContentDocument.LatestPublishedVersion.VersionDataUrl
                      FROM ContentDocumentLink
                      WHERE LinkedEntityId = '${contractId}'
                      LIMIT 5`;

  console.log('Querying attached files...\n');
  
  try {
    const files = await query(filesQuery, false);
    console.log(`✅ Found ${files.totalSize} files\n`);
    
    files.records.forEach(f => {
      console.log(`File: ${f.ContentDocument.Title}`);
      console.log(`Document ID: ${f.ContentDocument.Id}`);
      console.log(`Version ID: ${f.ContentDocument.LatestPublishedVersionId}`);
      
      // Construct download URL
      const downloadUrl = `https://eudia.my.salesforce.com/sfc/servlet.shepherd/version/download/${f.ContentDocument.LatestPublishedVersionId}`;
      console.log(`Download URL: ${downloadUrl}\n`);
    });
    
  } catch (error) {
    console.log(`❌ Files query failed: ${error.message}`);
  }

  process.exit(0);
}

testPDFAccess();

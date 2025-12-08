/**
 * Test Contract Analysis System
 * 
 * This script tests the contract analyzer with sample contract text
 * to validate field extraction before deployment.
 */

require('dotenv').config();

// Sample contract texts based on provided examples
const SAMPLE_CONTRACTS = {
  coherent: {
    name: 'Coherent A&R AI-Augmented Contracting Support Order (10.31.25 Final).pdf',
    text: `
      Exhibit B Amended and Restated AI-Augmented Contracting Support Order

      This Amended and Restated Order ("Order") is dated as of the date of the last signature below 
      ("Order Effective Date"), is attached to, and is made a part of, the Master Services Agreement 
      between Cicero Technologies, Inc. ("Cicero", doing business as "Eudia") and Coherent Corp. 
      ("Customer" or "Coherent") dated January 31, 2025 (the "Agreement").

      FEES AND PAYMENT

      The price for the Service will be as follows:

      Time Period: Order Effective Date until the first anniversary (Year 1) - Fee: $812.50 per Contract - Up to 1,600 Contracts
      Year 2: $1,150,000.00 - 1,500 Contracts  
      Year 3: $1,000,000.00 - 1,400 Contracts

      TERM
      This Order shall commence on the Order Effective Date and shall continue until the third anniversary 
      of the Order Effective Date ("Term").

      Signature:
      Cicero Technologies, Inc. dba Eudia
      Name: Omar Haroun
      Title: CEO
      Date: 10/31/2025

      Coherent Corp.
      Name: Rob Beard
      Title: CLO
      Date: 10/31/2025
    `,
    expected: {
      contractType: 'Recurring',
      accountName: 'Coherent',
      termMonths: 36,
      excludeMonetary: false,
      customerSigner: 'Rob Beard',
      eudiaSigner: 'Omar Haroun'
    }
  },
  
  pureStorage: {
    name: 'Eudia - CAB Memorandum- Pure Storage.pdf',
    text: `
      Eudia Customer Advisory Board Appointment – Pure Storage, Inc.

      This CAB Memorandum confirms the appointment of Pure Storage, Inc. ("Company") 
      to Eudia's Customer Advisory Board.

      Contract Start Date: 10/29/2025
      Contract End Date: 10/28/2026
      Contract Term: 12 months

      Notes: LOI - Committed spend

      Customer Signed By: Niki Armstrong
      Company Signed By: Omar Haroun
      Company Signed Date: 10/29/2025
    `,
    expected: {
      contractType: 'LOI',
      accountName: 'Pure Storage',
      termMonths: 12,
      excludeMonetary: true, // CAB = no monetary
      customerSigner: 'Niki Armstrong',
      eudiaSigner: 'Omar Haroun'
    }
  },
  
  bestBuy: {
    name: 'Eudia_CAB Memorandum- BestBuy 2025-10-06.pdf',
    text: `
      Eudia_CAB Memorandum- BestBuy 2025-10-06

      Customer Advisory Board Appointment

      Account Name: Best Buy
      Contract Start Date: 10/6/2025
      Contract End Date: 10/5/2026
      Contract Term: 12 months

      Product Line(s): sigma;Insights
      Parent Product: Multiple

      Customer Signed By: Todd Hartman
      Company Signed By: Omar Haroun
      Company Signed Date: 10/6/2025
    `,
    expected: {
      contractType: 'LOI',
      accountName: 'Best Buy',
      termMonths: 12,
      excludeMonetary: true, // CAB = no monetary
      products: ['sigma', 'Insights']
    }
  },
  
  chevron: {
    name: 'Chevron - Gibson Dunn Agreement (August 2025).pdf',
    text: `
      Chevron - Gibson Dunn Agreement (August 2025)

      This Agreement is entered into between Eudia and Chevron.

      Contract Start Date: 8/21/2025
      Contract End Date: 8/20/2026
      Total Contract Value: $1,200,000
      Annual Contract Value: $1,200,000.00
      Contract Term: 12 months
      Monthly Amount: $100,000

      Parent Product: Insights
      Product Line(s): sigma;Insights
      Owner Expiration Notice: 30 Days
      Contract Type: Recurring

      Company Signed By: David Van Reyk
      Company Signed Date: 8/21/2025
    `,
    expected: {
      contractType: 'Recurring',
      accountName: 'Chevron',
      termMonths: 12,
      excludeMonetary: false,
      totalValue: 1200000,
      annualValue: 1200000,
      monthlyValue: 100000
    }
  }
};

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('         CONTRACT ANALYSIS SYSTEM - VALIDATION TEST');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Import the analyzer
  const { contractAnalyzer } = require('./src/services/contractAnalyzer');
  
  let passed = 0;
  let failed = 0;
  
  for (const [key, contract] of Object.entries(SAMPLE_CONTRACTS)) {
    console.log(`\n📄 Testing: ${contract.name}`);
    console.log('─'.repeat(60));
    
    try {
      // Create a mock PDF buffer from the text
      const mockBuffer = Buffer.from(contract.text);
      
      // Classify contract type
      const classification = contractAnalyzer.classifyContractType(contract.text, contract.name);
      console.log(`\n🏷️ Classification: ${classification.type} (${Math.round(classification.confidence * 100)}% confidence)`);
      console.log(`   Exclude monetary: ${classification.excludeMonetary}`);
      
      // Check classification
      if (classification.type === contract.expected.contractType) {
        console.log(`   ✅ Type matches expected: ${contract.expected.contractType}`);
        passed++;
      } else {
        console.log(`   ❌ Type mismatch! Expected: ${contract.expected.contractType}, Got: ${classification.type}`);
        failed++;
      }
      
      // Test field extraction
      const fields = await contractAnalyzer.extractFields(contract.text, classification, contract.name);
      
      console.log(`\n📋 Extracted Fields:`);
      console.log(`   Account: ${fields.accountName || 'NOT FOUND'}`);
      console.log(`   Start Date: ${fields.startDate || 'NOT FOUND'}`);
      console.log(`   End Date: ${fields.endDate || 'NOT FOUND'}`);
      console.log(`   Term: ${fields.termMonths ? fields.termMonths + ' months' : 'NOT FOUND'}`);
      
      if (!classification.excludeMonetary) {
        console.log(`   Total Value: ${fields.totalContractValue ? '$' + fields.totalContractValue.toLocaleString() : '—'}`);
        console.log(`   Annual Value: ${fields.annualContractValue ? '$' + fields.annualContractValue.toLocaleString() : '—'}`);
        console.log(`   Monthly: ${fields.monthlyAmount ? '$' + fields.monthlyAmount.toLocaleString() : '—'}`);
      } else {
        console.log(`   [Monetary fields excluded for ${classification.type}]`);
      }
      
      if (fields.parentProduct) {
        console.log(`   Parent Product: ${fields.parentProduct}`);
      }
      if (fields.productLine) {
        console.log(`   Product Line(s): ${fields.productLine}`);
      }
      if (fields.customerSignedName) {
        console.log(`   Customer Signer: ${fields.customerSignedName}`);
      }
      if (fields.eudiaSignedName) {
        console.log(`   Eudia Signer: ${fields.eudiaSignedName}`);
      }
      
      // Validate key expectations
      if (contract.expected.accountName) {
        if (fields.accountName && fields.accountName.toLowerCase().includes(contract.expected.accountName.toLowerCase())) {
          console.log(`   ✅ Account name matches`);
          passed++;
        } else {
          console.log(`   ⚠️ Account: Expected "${contract.expected.accountName}", got "${fields.accountName}"`);
        }
      }
      
      if (contract.expected.termMonths) {
        if (fields.termMonths === contract.expected.termMonths) {
          console.log(`   ✅ Term matches: ${fields.termMonths} months`);
          passed++;
        } else {
          console.log(`   ⚠️ Term: Expected ${contract.expected.termMonths}, got ${fields.termMonths}`);
        }
      }
      
    } catch (error) {
      console.log(`\n❌ Error testing ${key}:`, error.message);
      failed++;
    }
  }
  
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`                    TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Test Salesforce field mapping
  console.log('\n\n📊 SALESFORCE FIELD MAPPING VALIDATION');
  console.log('─'.repeat(60));
  
  const { SALESFORCE_CONTRACT_FIELDS } = require('./src/services/contractAnalyzer');
  
  console.log('\nRequired ERP Sync Fields:');
  for (const [apiName, config] of Object.entries(SALESFORCE_CONTRACT_FIELDS)) {
    if (config.required) {
      console.log(`  ✓ ${apiName} → ${config.label} (${config.type})`);
    }
  }
  
  console.log('\nOptional Fields:');
  let optionalCount = 0;
  for (const [apiName, config] of Object.entries(SALESFORCE_CONTRACT_FIELDS)) {
    if (!config.required) {
      optionalCount++;
    }
  }
  console.log(`  ${optionalCount} optional fields configured`);
  
  console.log('\n✅ Test complete! Review results above.\n');
}

// Run tests
runTests().catch(console.error);


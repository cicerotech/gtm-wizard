/**
 * COMPREHENSIVE CHEAT SHEET COMMAND AUDIT
 * Tests all commands listed in the cheat sheet to see what intent/entities are returned
 * This is a diagnostic tool - run with: node tests/cheatsheet-commands-audit.js
 */

const { IntentParser } = require('../src/ai/intentParser');

const commands = {
  'Account Queries': {
    'Find Account Owner': [
      'who owns Boeing',
      'BL for Intel'
    ],
    'Accounts by Owner': [
      'what accounts does Julie own',
      'Himanshu\'s accounts'
    ],
    'Accounts by Stage': [
      'what accounts are in Stage 2',
      'accounts in Stage 4'
    ],
    'Legal Team Size': [
      'what is the legal team size at Boeing'
    ],
    'Decision Makers': [
      'who are the decision makers at Microsoft'
    ],
    'Use Cases': [
      'what use cases is Boeing discussing'
    ],
    'Competitive Landscape': [
      'competitive landscape for Intel'
    ],
    'Customer List': [
      'who are our current customers'
    ]
  },
  'Pipeline Queries': {
    'Full Pipeline': [
      'show me pipeline',
      'pipeline overview'
    ],
    'My Pipeline': [
      'show me my pipeline',
      'my deals'
    ],
    'Someone\'s Pipeline': [
      'Himanshu\'s deals',
      'Julie\'s pipeline'
    ],
    'Early Stage': [
      'early stage pipeline'
    ],
    'Mid Stage': [
      'mid stage deals'
    ],
    'Late Stage': [
      'late stage pipeline'
    ],
    'Product Pipeline': [
      'contracting pipeline',
      'late stage contracting'
    ],
    'New Pipeline': [
      'what deals were added to pipeline this week',
      'new deals this month'
    ],
    'Weighted Pipeline': [
      'weighted pipeline'
    ],
    'Specific Stage': [
      'Stage 2 pipeline',
      'Stage 4 opportunities'
    ]
  },
  'Closed Deals': {
    'What Closed': [
      'what closed this month',
      'what closed this week'
    ],
    'LOIs / Bookings': [
      'what LOIs have we signed',
      'how many LOIs this month'
    ],
    'ARR Deals': [
      'show ARR deals',
      'how many ARR contracts'
    ],
    'Contracts': [
      'show contracts',
      'contracts for Boeing'
    ]
  },
  'Metrics': {
    'Count Deals': [
      'how many deals',
      'how many deals in Stage 2'
    ],
    'Days in Stage': [
      'average days in Stage 2',
      'avg days in Stage 4'
    ],
    'Customer Count': [
      'how many customers'
    ]
  },
  'Create (ADMIN)': {
    'Create Opportunity': [
      'create opp for Boeing',
      'create opportunity for Intel'
    ],
    'Create with Details': [
      'create a stage 2 opp for Apple',
      'create opportunity for Amazon with $500k ACV'
    ]
  },
  'Update (ADMIN)': {
    'Reassign Account': [
      'reassign Boeing to Julie',
      'assign Intel to Himanshu'
    ],
    'Batch Reassign': [
      'batch reassign: Boeing, Intel, Microsoft to Julie',
      'reassign Boeing, Intel to Himanshu'
    ],
    'Move to Nurture': [
      'move Boeing to nurture',
      'mark Intel as nurture'
    ],
    'Batch Nurture': [
      'batch nurture: Boeing, Intel, Microsoft',
      'move Boeing, Intel, Microsoft to nurture'
    ],
    'Close Lost': [
      'close Boeing lost',
      'mark Intel as lost'
    ],
    'Save Customer Note': [
      'add to customer history: Boeing met with CLO today'
    ]
  },
  'Export': {
    'Excel Export': [
      'send pipeline excel',
      'export active pipeline'
    ],
    'Pagination': [
      'show next 10',
      'show all'
    ]
  }
};

async function auditCommands() {
  const parser = new IntentParser();
  let totalCommands = 0;
  let recognizedCommands = 0;
  let unrecognizedCommands = 0;
  const issues = [];

  console.log('\n='.repeat(80));
  console.log('GTM-BRAIN CHEAT SHEET COMMAND AUDIT');
  console.log('='.repeat(80));
  console.log('');

  for (const [category, subcategories] of Object.entries(commands)) {
    console.log(`\n📁 ${category}`);
    console.log('─'.repeat(80));

    for (const [subcategory, commandList] of Object.entries(subcategories)) {
      console.log(`\n  📋 ${subcategory}`);
      
      for (const command of commandList) {
        totalCommands++;
        try {
          const result = await parser.parseIntent(command);
          
          if (result.intent && result.intent !== 'unknown') {
            recognizedCommands++;
            console.log(`    ✅ "${command}"`);
            console.log(`       Intent: ${result.intent} (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
            if (Object.keys(result.entities || {}).length > 0) {
              console.log(`       Entities: ${JSON.stringify(result.entities)}`);
            }
          } else {
            unrecognizedCommands++;
            console.log(`    ❌ "${command}"`);
            console.log(`       Intent: ${result.intent || 'NONE'} (FAILED)`);
            issues.push({
              category,
              subcategory,
              command,
              result: result.intent || 'NONE',
              explanation: result.explanation || 'No explanation'
            });
          }
        } catch (error) {
          unrecognizedCommands++;
          console.log(`    ❌ "${command}"`);
          console.log(`       ERROR: ${error.message}`);
          issues.push({
            category,
            subcategory,
            command,
            error: error.message
          });
        }
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Commands Tested: ${totalCommands}`);
  console.log(`✅ Recognized: ${recognizedCommands} (${((recognizedCommands/totalCommands)*100).toFixed(1)}%)`);
  console.log(`❌ Unrecognized: ${unrecognizedCommands} (${((unrecognizedCommands/totalCommands)*100).toFixed(1)}%)`);

  if (issues.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('ISSUES REQUIRING ATTENTION');
    console.log('='.repeat(80));
    
    for (const issue of issues) {
      console.log(`\n❌ ${issue.category} > ${issue.subcategory}`);
      console.log(`   Command: "${issue.command}"`);
      if (issue.error) {
        console.log(`   Error: ${issue.error}`);
      } else {
        console.log(`   Got: ${issue.result}`);
        console.log(`   Explanation: ${issue.explanation}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('');

  // Exit with error code if any commands failed
  process.exit(unrecognizedCommands > 0 ? 1 : 0);
}

auditCommands().catch(error => {
  console.error('FATAL ERROR:', error);
  process.exit(1);
});

